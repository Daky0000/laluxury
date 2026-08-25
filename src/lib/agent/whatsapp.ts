import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * WhatsApp Cloud API adapter.
 *
 * Setup, once, at developers.facebook.com:
 *   1. Create a Business app, add the WhatsApp product
 *   2. Copy the Phone number ID -> WHATSAPP_PHONE_NUMBER_ID
 *   3. Generate a permanent System User token -> WHATSAPP_ACCESS_TOKEN
 *   4. App Settings > Basic > App Secret -> WHATSAPP_APP_SECRET
 *   5. Configuration > Webhook:
 *        Callback URL: {SITE_URL}/api/webhooks/whatsapp
 *        Verify token: whatever you put in WHATSAPP_VERIFY_TOKEN
 *        Subscribe to the `messages` field
 */

const GRAPH = "https://graph.facebook.com/v21.0";

/** Meta signs the raw body with HMAC-SHA256 as `sha256=...`. */
export function verifyWhatsAppSignature(rawBody: string, signature: string | null): boolean {
  const secret = env.whatsapp.appSecret();
  // Without an app secret we cannot verify; refuse rather than trust.
  if (!secret || !signature) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Meta's GET handshake when you first save the webhook URL. */
export function handleVerification(params: URLSearchParams): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const expected = env.whatsapp.verifyToken();
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return challenge;
  }
  return null;
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const token = env.whatsapp.accessToken();
  const phoneId = env.whatsapp.phoneNumberId();
  if (!token || !phoneId) throw new Error("WhatsApp is not configured.");

  const response = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      // WhatsApp caps a text body at 4096 characters.
      text: { preview_url: false, body: text.slice(0, 4096) },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

export type WhatsAppInbound = {
  from: string;
  text: string;
  messageId: string;
  timestamp: string;
};

type WhatsAppWebhookBody = {
  entry?: {
    changes?: {
      value?: {
        messages?: {
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
};

/** Pulls the plain-text messages out of Meta's deeply nested envelope. */
export function extractMessages(body: unknown): WhatsAppInbound[] {
  const parsed = body as WhatsAppWebhookBody;
  const out: WhatsAppInbound[] = [];

  for (const entry of parsed.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        // Status callbacks and media arrive here too; only text is actionable.
        if (message.type !== "text" || !message.text?.body || !message.from) continue;
        out.push({
          from: message.from,
          text: message.text.body,
          messageId: message.id ?? "",
          timestamp: message.timestamp ?? "",
        });
      }
    }
  }
  return out;
}

/** Normalises a Ghanaian number to E.164 without the plus, as Meta returns it. */
export function normalisePhone(input: string): string {
  const digits = input.replace(/[^0-9]/g, "");
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0")) return `233${digits.slice(1)}`;
  return digits;
}
