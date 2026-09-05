"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { DEFAULT_SETTINGS, updateSettings, type StoreSettings } from "@/lib/settings";
import { isLandingPage } from "@/lib/landing";
import { normaliseSections } from "@/lib/home-sections";
import { runAgentTurn } from "@/lib/agent/runtime";
import { pingAgent } from "@/lib/agent/provider";
import { toMinorUnits } from "@/lib/money";
import { recordAudit } from "@/lib/audit";
import type { AgentChannel } from "@/generated/prisma";
import type { AdminState } from "./products";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateSettingsAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("settings:manage");

  const threshold = String(formData.get("freeShippingThreshold") || "").trim();

  const text = (key: string) => String(formData.get(key) || "").trim();
  const price = (key: string) => {
    const raw = text(key);
    return raw ? toMinorUnits(Number(raw)) : null;
  };

  const landingPage = formData.get("landingPage");

  const patch: Partial<StoreSettings> = {
    // An unknown value would leave the front door blank, so it falls back to
    // the shipped default.
    landingPage: isLandingPage(landingPage) ? landingPage : DEFAULT_SETTINGS.landingPage,
    storeName: String(formData.get("storeName") || "").trim() || "LaLuxury",
    tagline: String(formData.get("tagline") || "").trim(),
    supportEmail: String(formData.get("supportEmail") || "").trim(),
    supportPhone: String(formData.get("supportPhone") || "").trim(),
    whatsappNumber: String(formData.get("whatsappNumber") || "").trim(),
    addressLine: String(formData.get("addressLine") || "").trim(),
    instagramUrl: String(formData.get("instagramUrl") || "").trim(),
    announcementBar: String(formData.get("announcementBar") || "").trim(),
    returnsPolicy: String(formData.get("returnsPolicy") || "").trim(),
    shippingPolicy: String(formData.get("shippingPolicy") || "").trim(),
    lowStockThreshold: Math.max(0, Number(formData.get("lowStockThreshold")) || 5),
    freeShippingThreshold: threshold ? toMinorUnits(Number(threshold)) : null,
    agentRequiresApproval: formData.get("agentRequiresApproval") === "on",

    // Home page content
    heroEyebrow: text("heroEyebrow"),
    heroTitle: text("heroTitle"),
    heroTitleAccent: text("heroTitleAccent"),
    heroBody: text("heroBody"),
    heroImageUrl: text("heroImageUrl"),
    bundleEyebrow: text("bundleEyebrow"),
    bundleTitle: text("bundleTitle"),
    bundleBody: text("bundleBody"),
    bundlePrice: price("bundlePrice"),
    bundleCompareAtPrice: price("bundleCompareAtPrice"),
    bundleImageUrl: text("bundleImageUrl"),
    bundleHref: text("bundleHref") || "/shop",
    newsletterTitle: text("newsletterTitle"),
    newsletterBody: text("newsletterBody"),
  };

  await updateSettings(patch);
  await recordAudit({
    actorId: actor.id,
    action: "settings.update",
    entity: "Setting",
    entityId: "store",
    after: patch as never,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

/**
 * Save the home page's section list.
 *
 * The editor sends the whole list as JSON in one field — sections nest lists of
 * their own, which form fields cannot carry — and it is re-checked here by the
 * same normaliser the storefront reads through, so a hand-edited payload cannot
 * put an unknown section type on the page.
 */
export async function updateHomeSectionsAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("settings:manage");

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("sections") || "[]"));
  } catch {
    return { ok: false, message: "The section list could not be read. Reload and try again." };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, message: "Keep at least one section on the page." };
  }

  const homeSections = normaliseSections(parsed);

  await updateSettings({ homeSections });
  await recordAudit({
    actorId: actor.id,
    action: "settings.home_sections",
    entity: "Setting",
    entityId: "store",
    after: { homeSections } as never,
  });

  revalidatePath("/admin/settings/home");
  revalidatePath("/");
  return { ok: true, message: "Home page saved." };
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/** Chat with the agent from the admin console. */
export async function askAgentAction(
  _prev: { reply?: string; error?: string } | null,
  formData: FormData,
): Promise<{ reply?: string; error?: string }> {
  const actor = await requirePermission("agent:use");

  const message = String(formData.get("message") || "").trim();
  if (!message) return { error: "Ask something first." };

  // The web console is one durable thread per staff member.
  const externalId = `web:${actor.id}`;

  // Make sure the console user maps to their own staff account.
  await db.agentIdentity.upsert({
    where: { channel_externalId: { channel: "WEB", externalId } },
    create: {
      channel: "WEB",
      externalId,
      userId: actor.id,
      label: actor.email,
    },
    update: { userId: actor.id, isActive: true },
  });

  try {
    const result = await runAgentTurn({
      channel: "WEB",
      externalId,
      message,
      senderId: externalId,
    });
    revalidatePath("/admin/agent");
    return { reply: result.text };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The agent could not respond." };
  }
}

export async function testAgentAction(): Promise<AdminState> {
  await requirePermission("agent:configure");

  const result = await pingAgent();
  return result.ok
    ? { ok: true, message: `Connected. Responding model: ${result.model}` }
    : { ok: false, message: result.error ?? "Could not reach OpenRouter." };
}

export async function clearAgentThreadAction(threadId: string): Promise<AdminState> {
  await requirePermission("agent:use");

  await db.agentMessage.deleteMany({ where: { threadId } });
  await db.agentAction.deleteMany({ where: { threadId, status: "AWAITING_APPROVAL" } });

  revalidatePath("/admin/agent");
  return { ok: true, message: "Conversation cleared." };
}

/**
 * Maps a Slack user id or WhatsApp number to a staff account. Without this the
 * agent treats an inbound message as coming from a stranger and refuses to
 * change anything.
 */
export async function linkAgentIdentityAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("agent:configure");

  const channel = String(formData.get("channel") || "SLACK") as AgentChannel;
  const externalId = String(formData.get("externalId") || "").trim();
  const userId = String(formData.get("userId") || "").trim();

  if (!externalId) {
    return {
      ok: false,
      message:
        channel === "SLACK"
          ? "Paste the Slack member ID (starts with U)."
          : "Enter the WhatsApp number in full, e.g. 233241234567.",
    };
  }
  if (!userId) return { ok: false, message: "Choose which staff account this maps to." };

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.role === "CUSTOMER") {
    return { ok: false, message: "Pick a staff account." };
  }

  // WhatsApp reports numbers without a plus; normalise so lookups match.
  const normalised =
    channel === "WHATSAPP" ? externalId.replace(/[^0-9]/g, "") : externalId;

  await db.agentIdentity.upsert({
    where: { channel_externalId: { channel, externalId: normalised } },
    create: {
      channel,
      externalId: normalised,
      userId,
      label: target.email,
      isActive: true,
    },
    update: { userId, label: target.email, isActive: true },
  });

  await recordAudit({
    actorId: actor.id,
    action: "agent.identity_link",
    entity: "AgentIdentity",
    after: { channel, externalId: normalised, userId },
  });

  revalidatePath("/admin/agent");
  return { ok: true, message: `${normalised} now acts as ${target.email}.` };
}

export async function removeAgentIdentityAction(id: string): Promise<AdminState> {
  await requirePermission("agent:configure");

  await db.agentIdentity.delete({ where: { id } });
  revalidatePath("/admin/agent");
  return { ok: true, message: "Link removed." };
}

/** Approve or reject a change the agent parked for confirmation. */
export async function resolveAgentActionAction(
  actionId: string,
  approve: boolean,
): Promise<AdminState> {
  const actor = await requirePermission("agent:use");

  const action = await db.agentAction.findUnique({ where: { id: actionId } });
  if (!action) return { ok: false, message: "That request no longer exists." };
  if (action.status !== "AWAITING_APPROVAL") {
    return { ok: false, message: "That request has already been handled." };
  }

  if (!approve) {
    await db.agentAction.update({ where: { id: actionId }, data: { status: "REJECTED" } });
    revalidatePath("/admin/agent");
    return { ok: true, message: "Rejected. Nothing was changed." };
  }

  const { executeTool } = await import("@/lib/agent/tools");
  const result = await executeTool(
    action.tool,
    action.args as Record<string, unknown>,
    {
      userId: actor.id,
      role: actor.role,
      threadId: action.threadId,
      source: "web",
    },
  );

  const failed = "error" in result;

  await db.agentAction.update({
    where: { id: actionId },
    data: {
      status: failed ? "FAILED" : "EXECUTED",
      result: result as never,
      error: failed ? String((result as { error: string }).error) : null,
      actorId: actor.id,
      executedAt: new Date(),
    },
  });

  revalidatePath("/admin/agent");
  revalidatePath("/admin/products");

  return failed
    ? { ok: false, message: `Failed: ${(result as { error: string }).error}` }
    : { ok: true, message: "Applied." };
}
