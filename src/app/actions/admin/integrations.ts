"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  getIntegrations,
  updateIntegrations,
  clearIntegrationField,
  isReady,
  activePaystack,
  type Integrations,
} from "@/lib/integrations";
import { pingAgent } from "@/lib/agent/provider";
import { sendTestEmail, isEmailConfigured } from "@/lib/email";
import { isCdnConfigured } from "@/lib/cdn";
import type { AdminState } from "./products";

/**
 * Integration credentials, saved from the console.
 *
 * Blank fields are skipped rather than saved, so the form can render secrets as
 * empty boxes with a masked hint beside them and a save never wipes a key the
 * owner did not retype.
 */

/** Only these keys are accepted, so a crafted form cannot write arbitrary settings. */
const SHAPE: Record<string, string[]> = {
  paystack: ["mode", "secretKey", "publicKey", "testSecretKey", "testPublicKey"],
  ai: [
    "provider",
    "anthropicApiKey",
    "anthropicModel",
    "openrouterApiKey",
    "openrouterModel",
    "openrouterFallbackModel",
  ],
  slack: ["botToken", "signingSecret", "alertChannel"],
  whatsapp: ["accessToken", "phoneNumberId", "verifyToken", "appSecret"],
  smtp: ["host", "port", "user", "password", "from"],
  sms: ["apiKey", "senderId"],
  cloudinary: ["cloudName", "apiKey", "apiSecret"],
};

export async function saveIntegrationsAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const user = await requirePermission("settings:manage");

  const patch: Record<string, Record<string, string | number>> = {};
  const touched: string[] = [];

  for (const [group, fields] of Object.entries(SHAPE)) {
    for (const field of fields) {
      const raw = formData.get(`${group}.${field}`);
      if (typeof raw !== "string") continue;

      const value = raw.trim();
      if (value === "") continue;

      patch[group] ??= {};
      patch[group][field] = field === "port" ? Number(value) || 587 : value;
      touched.push(`${group}.${field}`);
    }
  }

  if (touched.length === 0) {
    return { ok: false, message: "Nothing to save — fill in a field first." };
  }

  const provider = patch.ai?.provider;
  if (provider && provider !== "anthropic" && provider !== "openrouter") {
    return { ok: false, message: "Choose either Claude or OpenRouter as the AI provider." };
  }

  const mode = patch.paystack?.mode;
  if (mode && mode !== "live" && mode !== "test") {
    return { ok: false, message: "Paystack mode must be live or test." };
  }

  await updateIntegrations(patch as Parameters<typeof updateIntegrations>[0]);

  await recordAudit({
    actorId: user.id,
    action: "integrations.update",
    entity: "Setting",
    entityId: "integrations",
    // Field names only. Never the values.
    after: { updated: touched },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/checkout");

  return { ok: true, message: `Saved ${touched.length} field${touched.length === 1 ? "" : "s"}.` };
}

/** Puts one field back to whatever the environment provides. */
export async function clearIntegrationAction(
  group: string,
  field: string,
): Promise<AdminState> {
  const user = await requirePermission("settings:manage");

  if (!SHAPE[group]?.includes(field)) {
    return { ok: false, message: "Unknown setting." };
  }

  await clearIntegrationField(group, field);
  await recordAudit({
    actorId: user.id,
    action: "integrations.clear",
    entity: "Setting",
    entityId: "integrations",
    after: { cleared: `${group}.${field}` },
  });

  revalidatePath("/admin/settings");
  return { ok: true, message: `Cleared ${field}.` };
}

/**
 * Proves a set of credentials actually works, rather than merely being present.
 * Each branch does the cheapest real call the provider offers.
 */
export async function testIntegrationAction(
  group: keyof Integrations,
): Promise<AdminState> {
  const user = await requirePermission("settings:manage");
  const config = await getIntegrations();

  try {
    switch (group) {
      case "paystack": {
        const active = activePaystack(config);
        if (!active.secretKey) {
          return { ok: false, message: `No ${active.mode} secret key saved yet.` };
        }
        const response = await fetch("https://api.paystack.co/bank?country=ghana&perPage=1", {
          headers: { Authorization: `Bearer ${active.secretKey}` },
          cache: "no-store",
        });
        return response.ok
          ? { ok: true, message: `Paystack accepted the ${active.mode} key.` }
          : { ok: false, message: `Paystack rejected the ${active.mode} key (${response.status}).` };
      }

      case "ai": {
        const result = await pingAgent();
        return result.ok
          ? { ok: true, message: `Answered using ${result.model}.` }
          : { ok: false, message: result.error ?? "The agent did not answer." };
      }

      case "slack": {
        if (!config.slack.botToken) return { ok: false, message: "No bot token saved yet." };
        const response = await fetch("https://slack.com/api/auth.test", {
          method: "POST",
          headers: { Authorization: `Bearer ${config.slack.botToken}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as { ok?: boolean; team?: string; error?: string };
        return payload.ok
          ? { ok: true, message: `Connected to ${payload.team ?? "Slack"}.` }
          : { ok: false, message: payload.error ?? "Slack rejected the token." };
      }

      case "whatsapp": {
        if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) {
          return { ok: false, message: "Add both the access token and phone number ID." };
        }
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${config.whatsapp.phoneNumberId}`,
          {
            headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
            cache: "no-store",
          },
        );
        return response.ok
          ? { ok: true, message: "WhatsApp accepted the token." }
          : { ok: false, message: `Meta rejected it (${response.status}).` };
      }

      case "smtp": {
        if (!(await isEmailConfigured())) return { ok: false, message: "No SMTP host saved yet." };
        // The test goes to whoever pressed the button, so an account with no
        // email on it has nowhere to send to.
        if (!user.email) {
          return { ok: false, message: "Add an email address to your own account first." };
        }
        const result = await sendTestEmail(user.email);
        return result.ok
          ? { ok: true, message: `Test email sent to ${user.email}.` }
          : { ok: false, message: result.error ?? "The mail server refused it." };
      }

      case "sms": {
        if (!config.sms.apiKey) return { ok: false, message: "No Vynfy API key saved yet." };

        // Reading the OTP balance proves the key without spending a message.
        // The body is read as text first: Vynfy is behind Cloudflare, and a
        // challenge from a datacentre address comes back as an HTML page rather
        // than the documented JSON — which is exactly the case this button
        // exists to make visible.
        const response = await fetch("https://sms.vynfy.com/otp/balance", {
          headers: {
            "X-API-Key": config.sms.apiKey,
            Accept: "application/json",
            "User-Agent": "LaLuxury-Shop/1.0 (+https://laluxurys.com)",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });
        const body = await response.text();

        let payload: { success?: boolean; balance?: number; message?: string } | null = null;
        try {
          payload = JSON.parse(body);
        } catch {
          const kind = /cloudflare|cf-ray|challenge|Just a moment/i.test(body)
            ? "Cloudflare blocked the request from this server rather than Vynfy refusing it. Ask Vynfy to allowlist the shop's outbound address."
            : "The reply was not JSON.";
          return { ok: false, message: `Vynfy answered ${response.status}. ${kind}` };
        }

        if (!response.ok || !payload?.success) {
          return {
            ok: false,
            message: `Vynfy refused it (${response.status}): ${payload?.message ?? "no reason given"}.`,
          };
        }

        return {
          ok: true,
          message:
            typeof payload.balance === "number"
              ? `Vynfy accepted the key. OTP balance: GHS ${payload.balance.toFixed(2)}.`
              : "Vynfy accepted the key.",
        };
      }

      case "cloudinary": {
        if (!(await isCdnConfigured())) return { ok: false, message: "No CDN details saved yet." };
        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/resources/image?max_results=1`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(
                `${config.cloudinary.apiKey}:${config.cloudinary.apiSecret}`,
              ).toString("base64")}`,
            },
            cache: "no-store",
          },
        );
        return response.ok
          ? { ok: true, message: "Cloudinary accepted the credentials." }
          : { ok: false, message: `Cloudinary rejected them (${response.status}).` };
      }
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The test could not run.",
    };
  }
}

/** Used by the settings page to show which groups are live. */
export async function integrationReadiness() {
  const config = await getIntegrations();
  return {
    paystack: isReady(config, "paystack"),
    ai: isReady(config, "ai"),
    slack: isReady(config, "slack"),
    whatsapp: isReady(config, "whatsapp"),
    smtp: isReady(config, "smtp"),
    cloudinary: isReady(config, "cloudinary"),
  };
}

/** Kept here so the settings page can show what the agent has been doing. */
export async function recentIntegrationAudits(limit = 5) {
  return db.auditLog.findMany({
    where: { entity: "Setting", entityId: "integrations" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, action: true, after: true, createdAt: true },
  });
}
