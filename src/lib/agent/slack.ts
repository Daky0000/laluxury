import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Slack adapter.
 *
 * Setup, once, at api.slack.com/apps:
 *   1. Create an app, add bot scopes: app_mentions:read, chat:write,
 *      im:history, im:read, im:write, users:read
 *   2. Install to the workspace, copy the Bot User OAuth Token -> SLACK_BOT_TOKEN
 *   3. Copy the Signing Secret -> SLACK_SIGNING_SECRET
 *   4. Event Subscriptions -> request URL:
 *      {SITE_URL}/api/webhooks/slack
 *      Subscribe to: app_mention, message.im
 */

const API = "https://slack.com/api";

/**
 * Slack signs `v0:{timestamp}:{body}` with HMAC-SHA256.
 * Requests older than five minutes are rejected to stop replay.
 */
export function verifySlackSignature(args: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
}): boolean {
  const secret = env.slack.signingSecret();
  if (!secret || !args.timestamp || !args.signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(args.timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;

  const base = `v0:${args.timestamp}:${args.rawBody}`;
  const expected = `v0=${createHmac("sha256", secret).update(base, "utf8").digest("hex")}`;

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(args.signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function slackCall(method: string, body: Record<string, unknown>) {
  const token = env.slack.botToken();
  if (!token) throw new Error("Slack is not configured (SLACK_BOT_TOKEN missing).");

  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok: boolean; error?: string; [key: string]: unknown }
    | null;

  if (!payload?.ok) {
    throw new Error(`Slack ${method} failed: ${payload?.error ?? response.status}`);
  }
  return payload;
}

export async function sendSlackMessage(args: {
  channel: string;
  text: string;
  threadTs?: string;
}): Promise<void> {
  await slackCall("chat.postMessage", {
    channel: args.channel,
    text: args.text,
    ...(args.threadTs ? { thread_ts: args.threadTs } : {}),
  });
}

/** Posts to the configured alert channel. No-ops when Slack is not set up. */
export async function postAlert(text: string): Promise<void> {
  const channel = env.slack.alertChannel();
  if (!env.slack.isConfigured() || !channel) return;
  try {
    await sendSlackMessage({ channel, text });
  } catch {
    // Alerts are best-effort; never break the request that triggered them.
  }
}

export type SlackEvent = {
  type: string;
  user?: string;
  text?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
  channel_type?: string;
};

export type SlackEnvelope = {
  type: "url_verification" | "event_callback";
  challenge?: string;
  event?: SlackEvent;
  event_id?: string;
  authorizations?: { user_id?: string }[];
};

/** Strips the leading <@U123> mention so the agent sees a clean instruction. */
export function cleanSlackText(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/<(https?:\/\/[^|>]+)(\|[^>]+)?>/g, "$1")
    .trim();
}

/** True for events the agent should ignore (its own posts, edits, joins). */
export function shouldIgnoreSlackEvent(event: SlackEvent): boolean {
  if (event.bot_id) return true;
  if (event.subtype && event.subtype !== "file_share") return true;
  if (!event.text?.trim()) return true;
  return false;
}

export async function lookupSlackUserEmail(userId: string): Promise<string | null> {
  try {
    const payload = (await slackCall("users.info", { user: userId })) as {
      user?: { profile?: { email?: string } };
    };
    return payload.user?.profile?.email ?? null;
  } catch {
    return null;
  }
}
