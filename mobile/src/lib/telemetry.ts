import * as Sentry from "@sentry/react-native";

/**
 * Crash and error reporting. Off unless EXPO_PUBLIC_SENTRY_DSN is set at build
 * time, so development builds and forks never report to production.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
let enabled = false;

export function initTelemetry(): void {
  if (!DSN || enabled) return;
  Sentry.init({
    dsn: DSN,
    enabled: !__DEV__,
    tracesSampleRate: 0.1,
    // No request bodies, so phone numbers and addresses never leave the device.
    sendDefaultPii: false,
  });
  enabled = true;
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__) console.error(error);
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function setTelemetryUser(user: { id: string; role: string } | null): void {
  if (!enabled) return;
  // Id and role only - no names, emails or phone numbers.
  Sentry.setUser(user ? { id: user.id, segment: user.role } : null);
}

export { Sentry };
