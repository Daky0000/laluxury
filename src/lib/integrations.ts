import { db } from "./db";
import { env } from "./env";
import type { Prisma } from "@/generated/prisma";

/**
 * Integration credentials, editable from the admin console.
 *
 * These used to live only in the environment, which meant switching on
 * payments or the AI agent required a redeploy and access to the host. They now
 * live in the settings table, with the environment as a fallback — so anything
 * already set on the platform keeps working, and anything pasted into the
 * console wins over it.
 *
 * Secrets never leave the server: `integrationsView` is what the admin page
 * renders, and it returns masked hints rather than values.
 */

const KEY = "integrations";

export type AiProvider = "anthropic" | "openrouter";

export type Integrations = {
  paystack: { secretKey: string; publicKey: string };
  ai: {
    provider: AiProvider;
    anthropicApiKey: string;
    anthropicModel: string;
    openrouterApiKey: string;
    openrouterModel: string;
    openrouterFallbackModel: string;
  };
  slack: { botToken: string; signingSecret: string; alertChannel: string };
  whatsapp: {
    accessToken: string;
    phoneNumberId: string;
    verifyToken: string;
    appSecret: string;
  };
  smtp: { host: string; port: number; user: string; password: string; from: string };
  cloudinary: { cloudName: string; apiKey: string; apiSecret: string };
};

/** Which fields are secret, so they are masked rather than echoed back. */
export const SECRET_FIELDS = new Set([
  "paystack.secretKey",
  "ai.anthropicApiKey",
  "ai.openrouterApiKey",
  "slack.botToken",
  "slack.signingSecret",
  "whatsapp.accessToken",
  "whatsapp.appSecret",
  "whatsapp.verifyToken",
  "smtp.password",
  "cloudinary.apiSecret",
]);

/** The environment is the floor: whatever the host already provides. */
function fromEnv(): Integrations {
  return {
    paystack: {
      secretKey: env.paystack.secretKey(),
      publicKey: env.paystack.publicKey(),
    },
    ai: {
      // OpenRouter was the original provider, so it stays the default when a
      // key is already set on the host and nothing has been chosen in the UI.
      provider: env.openrouter.isConfigured() ? "openrouter" : "anthropic",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
      anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
      openrouterApiKey: env.openrouter.apiKey(),
      openrouterModel: env.openrouter.model(),
      openrouterFallbackModel: env.openrouter.fallbackModel(),
    },
    slack: {
      botToken: env.slack.botToken(),
      signingSecret: env.slack.signingSecret(),
      alertChannel: env.slack.alertChannel(),
    },
    whatsapp: {
      accessToken: env.whatsapp.accessToken(),
      phoneNumberId: env.whatsapp.phoneNumberId(),
      verifyToken: env.whatsapp.verifyToken(),
      appSecret: env.whatsapp.appSecret(),
    },
    smtp: {
      host: env.smtp.host(),
      port: env.smtp.port(),
      user: env.smtp.user(),
      password: env.smtp.password(),
      from: env.smtp.from(),
    },
    cloudinary: {
      cloudName: env.cloudinary.cloudName(),
      apiKey: env.cloudinary.apiKey(),
      apiSecret: env.cloudinary.apiSecret(),
    },
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Stored values win, but only where they are actually filled in. */
function merge(base: Integrations, stored: DeepPartial<Integrations>): Integrations {
  const out = structuredClone(base) as Integrations;

  for (const [group, fields] of Object.entries(stored ?? {})) {
    if (!fields || typeof fields !== "object") continue;
    const target = out[group as keyof Integrations] as Record<string, unknown>;
    if (!target) continue;

    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined || value === null || value === "") continue;
      target[field] = value;
    }
  }

  return out;
}

export async function getIntegrations(): Promise<Integrations> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  return merge(fromEnv(), (row?.value as DeepPartial<Integrations>) ?? {});
}

/**
 * Saves a patch. A blank string means "leave this one alone", so the admin form
 * can render empty secret fields without wiping the stored value on every save.
 */
export async function updateIntegrations(patch: DeepPartial<Integrations>): Promise<void> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const current = (row?.value as DeepPartial<Integrations>) ?? {};
  const next = structuredClone(current) as Record<string, Record<string, unknown>>;

  for (const [group, fields] of Object.entries(patch ?? {})) {
    if (!fields || typeof fields !== "object") continue;
    next[group] = { ...(next[group] ?? {}) };

    for (const [field, value] of Object.entries(fields)) {
      // Undefined means the form did not include it; empty means unchanged.
      if (value === undefined) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      next[group][field] = value;
    }
  }

  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next as Prisma.InputJsonValue },
    update: { value: next as Prisma.InputJsonValue },
  });
}

/** Clears one field back to whatever the environment provides. */
export async function clearIntegrationField(group: string, field: string): Promise<void> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const current = (row?.value as Record<string, Record<string, unknown>>) ?? {};
  if (current[group]) delete current[group][field];

  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: current as Prisma.InputJsonValue },
    update: { value: current as Prisma.InputJsonValue },
  });
}

/** `sk_live_…4821` — enough to recognise a key, not enough to use one. */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export type IntegrationField = {
  name: string;
  label: string;
  /** Masked when secret, the real value otherwise. */
  display: string;
  secret: boolean;
  hint?: string;
};

export type IntegrationGroup = {
  key: keyof Integrations;
  label: string;
  description: string;
  ready: boolean;
  fields: IntegrationField[];
};

/** True when a group has enough filled in to actually work. */
export function isReady(config: Integrations, group: keyof Integrations): boolean {
  switch (group) {
    case "paystack":
      return Boolean(config.paystack.secretKey && config.paystack.publicKey);
    case "ai":
      return config.ai.provider === "anthropic"
        ? Boolean(config.ai.anthropicApiKey)
        : Boolean(config.ai.openrouterApiKey);
    case "slack":
      return Boolean(config.slack.botToken && config.slack.signingSecret);
    case "whatsapp":
      return Boolean(config.whatsapp.accessToken && config.whatsapp.phoneNumberId);
    case "smtp":
      return Boolean(config.smtp.host && config.smtp.user);
    case "cloudinary":
      return Boolean(config.cloudinary.cloudName && config.cloudinary.apiSecret);
  }
}

/** What the admin page renders. Secrets are masked before they leave here. */
export async function integrationsView(): Promise<IntegrationGroup[]> {
  const config = await getIntegrations();

  const field = (
    group: keyof Integrations,
    name: string,
    label: string,
    hint?: string,
  ): IntegrationField => {
    const raw = String(
      (config[group] as unknown as Record<string, unknown>)[name] ?? "",
    );
    const secret = SECRET_FIELDS.has(`${group}.${name}`);
    return { name, label, secret, hint, display: secret ? maskSecret(raw) : raw };
  };

  return [
    {
      key: "paystack",
      label: "Paystack payments",
      description: "Takes card, Mobile Money and bank payments at checkout.",
      ready: isReady(config, "paystack"),
      fields: [
        field("paystack", "secretKey", "Secret key", "Starts sk_live_ or sk_test_"),
        field("paystack", "publicKey", "Public key", "Starts pk_live_ or pk_test_"),
      ],
    },
    {
      key: "ai",
      label: "AI agent",
      description: "Runs the console assistant, and answers on Slack and WhatsApp.",
      ready: isReady(config, "ai"),
      fields: [
        field("ai", "provider", "Provider", "anthropic or openrouter"),
        field("ai", "anthropicApiKey", "Claude API key", "console.anthropic.com"),
        field("ai", "anthropicModel", "Claude model"),
        field("ai", "openrouterApiKey", "OpenRouter API key", "openrouter.ai"),
        field("ai", "openrouterModel", "OpenRouter model"),
        field("ai", "openrouterFallbackModel", "OpenRouter fallback model"),
      ],
    },
    {
      key: "slack",
      label: "Slack",
      description: "Posts order and stock alerts, and lets staff talk to the agent.",
      ready: isReady(config, "slack"),
      fields: [
        field("slack", "botToken", "Bot token", "Starts xoxb-"),
        field("slack", "signingSecret", "Signing secret"),
        field("slack", "alertChannel", "Alert channel ID", "e.g. C0123ABCD"),
      ],
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      description: "Lets customers reach the shop on WhatsApp Business.",
      ready: isReady(config, "whatsapp"),
      fields: [
        field("whatsapp", "accessToken", "Access token"),
        field("whatsapp", "phoneNumberId", "Phone number ID"),
        field("whatsapp", "verifyToken", "Verify token", "You choose this; Meta echoes it back"),
        field("whatsapp", "appSecret", "App secret"),
      ],
    },
    {
      key: "smtp",
      label: "Email",
      description: "Sends order confirmations and replies to contact messages.",
      ready: isReady(config, "smtp"),
      fields: [
        field("smtp", "host", "SMTP host"),
        field("smtp", "port", "Port", "587 for TLS, 465 for SSL"),
        field("smtp", "user", "Username"),
        field("smtp", "password", "Password"),
        field("smtp", "from", "From address", 'e.g. LaLuxury <no-reply@laluxurys.com>'),
      ],
    },
    {
      key: "cloudinary",
      label: "Image CDN",
      description: "Stores product photos uploaded from the console.",
      ready: isReady(config, "cloudinary"),
      fields: [
        field("cloudinary", "cloudName", "Cloud name"),
        field("cloudinary", "apiKey", "API key"),
        field("cloudinary", "apiSecret", "API secret"),
      ],
    },
  ];
}

/** Compact status for the dashboard. */
export async function integrationStatus() {
  const config = await getIntegrations();
  return [
    { key: "paystack", label: "Paystack payments", ready: isReady(config, "paystack") },
    { key: "ai", label: "AI agent", ready: isReady(config, "ai") },
    { key: "slack", label: "Slack channel", ready: isReady(config, "slack") },
    { key: "whatsapp", label: "WhatsApp channel", ready: isReady(config, "whatsapp") },
    { key: "smtp", label: "Transactional email", ready: isReady(config, "smtp") },
    { key: "cloudinary", label: "Image CDN", ready: isReady(config, "cloudinary") },
  ];
}
