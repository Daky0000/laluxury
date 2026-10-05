import { Platform } from "react-native";
import { api } from "../services/api";
import type { AnalyticsEventInput, AnalyticsEventName } from "../types";

/**
 * Funnel analytics (product view -> add to bag -> checkout -> purchase).
 *
 * Events are queued and sent in small batches, fire-and-forget: analytics must
 * never slow a screen or surface an error to the shopper.
 */

const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const queue: AnalyticsEventInput[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_MS = 5_000;
const MAX_BATCH = 25;

function platform(): "android" | "ios" {
  return Platform.OS === "ios" ? "ios" : "android";
}

export async function flushEvents(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  while (queue.length > 0) {
    const batch = queue.splice(0, MAX_BATCH);
    try {
      await api.sendEvents({ platform: platform(), events: batch });
    } catch {
      // Dropped on purpose; a lost analytics event is not worth a retry loop.
      return;
    }
  }
}

export function track(
  name: AnalyticsEventName,
  props?: Record<string, string | number | boolean | null>,
): void {
  if (__DEV__) return;
  queue.push({ name, sessionId, props });
  if (queue.length >= MAX_BATCH) {
    flushEvents().catch(() => {});
  } else if (!timer) {
    timer = setTimeout(() => {
      flushEvents().catch(() => {});
    }, FLUSH_MS);
  }
}
