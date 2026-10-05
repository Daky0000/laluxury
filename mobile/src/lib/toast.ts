import type { PopNotificationData } from "../components/PopNotification";

/**
 * One feedback channel for the whole app. Screens call `toast(...)`; the app
 * shell shows it with the branded pop notification. Confirmations that need a
 * choice (delete? cancel?) still use the native Alert dialog.
 */
type Listener = (data: PopNotificationData) => void;
let listener: Listener | null = null;

export function setToastListener(next: Listener | null): void {
  listener = next;
}

const ERROR_WORDS = /error|fail|invalid|required|denied|could not|couldn't|permission/i;

export function toast(title: string, message?: string, type?: PopNotificationData["type"]): void {
  const kind = type ?? (ERROR_WORDS.test(title) ? "error" : "info");
  listener?.({
    title,
    message,
    type: kind,
    icon: kind === "error" ? "alert-circle" : kind === "success" ? "check-circle" : "info",
  });
}
