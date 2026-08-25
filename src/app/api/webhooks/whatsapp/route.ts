import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  extractMessages,
  handleVerification,
  sendWhatsAppMessage,
  verifyWhatsAppSignature,
} from "@/lib/agent/whatsapp";
import { runAgentTurn } from "@/lib/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp Cloud API webhook.
 *
 * GET  - Meta's one-time subscription handshake.
 * POST - inbound messages. Acknowledged immediately, answered in the
 *        background, because Meta retries anything slower than a few seconds.
 */

const seenMessages = new Map<string, number>();
const DEDUPE_TTL_MS = 10 * 60 * 1000;

function alreadySeen(id: string): boolean {
  const now = Date.now();
  for (const [key, at] of seenMessages) {
    if (now - at > DEDUPE_TTL_MS) seenMessages.delete(key);
  }
  if (seenMessages.has(id)) return true;
  seenMessages.set(id, now);
  return false;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const challenge = handleVerification(url.searchParams);

  if (challenge) {
    // Meta requires the raw challenge string, not JSON.
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!env.whatsapp.isConfigured()) {
    return NextResponse.json({ error: "WhatsApp is not configured" }, { status: 503 });
  }

  if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  for (const message of extractMessages(body)) {
    if (message.messageId && alreadySeen(message.messageId)) continue;
    void respond(message.from, message.text);
  }

  return NextResponse.json({ ok: true });
}

async function respond(from: string, text: string): Promise<void> {
  try {
    const reply = await runAgentTurn({
      channel: "WHATSAPP",
      // One rolling conversation per phone number.
      externalId: from,
      message: text,
      senderId: from,
    });
    await sendWhatsAppMessage(from, reply.text);
  } catch (error) {
    console.error("[whatsapp agent]", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong handling that.";
    await sendWhatsAppMessage(from, `⚠️ ${message}`).catch(() => {});
  }
}
