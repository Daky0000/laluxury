import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  verifySlackSignature,
  cleanSlackText,
  shouldIgnoreSlackEvent,
  sendSlackMessage,
  type SlackEnvelope,
} from "@/lib/agent/slack";
import { runAgentTurn } from "@/lib/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Slack Events API endpoint.
 *
 * Slack demands a response within 3 seconds and retries otherwise, while a
 * model turn takes much longer. So this acknowledges immediately and finishes
 * the work after the response is sent - safe here because Railway runs a
 * long-lived Node process rather than a per-request serverless function.
 */

/** Event ids already seen, so Slack retries do not re-run the agent. */
const seenEvents = new Map<string, number>();
const DEDUPE_TTL_MS = 10 * 60 * 1000;

function alreadySeen(eventId: string | undefined): boolean {
  if (!eventId) return false;

  const now = Date.now();
  for (const [id, at] of seenEvents) {
    if (now - at > DEDUPE_TTL_MS) seenEvents.delete(id);
  }

  if (seenEvents.has(eventId)) return true;
  seenEvents.set(eventId, now);
  return false;
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!env.slack.isConfigured()) {
    return NextResponse.json({ error: "Slack is not configured" }, { status: 503 });
  }

  const valid = verifySlackSignature({
    rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
  });
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let envelope: SlackEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  // First-time URL handshake.
  if (envelope.type === "url_verification") {
    return NextResponse.json({ challenge: envelope.challenge });
  }

  const event = envelope.event;
  if (!event || shouldIgnoreSlackEvent(event)) {
    return NextResponse.json({ ok: true });
  }

  // Slack retries carry this header; the dedupe map covers the rest.
  if (request.headers.get("x-slack-retry-num") || alreadySeen(envelope.event_id)) {
    return NextResponse.json({ ok: true });
  }

  if (event.type !== "app_mention" && event.type !== "message") {
    return NextResponse.json({ ok: true });
  }
  // In channels the agent only answers when mentioned; DMs are always for it.
  if (event.type === "message" && event.channel_type !== "im") {
    return NextResponse.json({ ok: true });
  }

  void respond(event.channel!, event.thread_ts ?? event.ts!, event.user!, cleanSlackText(event.text ?? ""));

  return NextResponse.json({ ok: true });
}

async function respond(
  channel: string,
  threadTs: string,
  slackUserId: string,
  text: string,
): Promise<void> {
  if (!text) return;

  try {
    const reply = await runAgentTurn({
      channel: "SLACK",
      // One conversation per Slack thread.
      externalId: `${channel}:${threadTs}`,
      message: text,
      senderId: slackUserId,
    });
    await sendSlackMessage({ channel, text: reply.text, threadTs });
  } catch (error) {
    console.error("[slack agent]", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong handling that.";
    await sendSlackMessage({
      channel,
      text: `:warning: ${message}`,
      threadTs,
    }).catch(() => {});
  }
}
