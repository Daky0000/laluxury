import { cache } from "react";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
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
export type PaystackMode = "live" | "test";

export type Integrations = {
  paystack: {
    /** Which pair of keys checkout actually uses. */
    mode: PaystackMode;
    secretKey: string;
    publicKey: string;
    testSecretKey: string;
    testPublicKey: string;
  };
  ai: {
    provider: AiProvider;
    anthropicApiKey: string;
    anthropicModel: string;
    openrouterApiKey: string;
    openrouterModel: string;
    openrouterFallbackModel: string;
    /** NVIDIA NIM (build.nvidia.com) — used only by Bulk Product Add. */
    nvidiaApiKey: string;
  };
  slack: { botToken: string; signingSecret: string; alertChannel: string };
  whatsapp: {
    accessToken: string;
    phoneNumberId: string;
    verifyToken: string;
    appSecret: string;
  };
  smtp: { host: string; port: number; user: string; password: string; from: string };
  /** Vynfy — the SMS gateway that carries sign-up codes and order notices. */
  sms: { apiKey: string; senderId: string };
  cloudinary: { cloudName: string; apiKey: string; apiSecret: string };
  r2: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    publicUrl: string;
  };
};

/** Which fields are secret, so they are masked rather than echoed back. */
export const SECRET_FIELDS = new Set([
  "paystack.secretKey",
  "paystack.testSecretKey",
  "ai.anthropicApiKey",
  "ai.openrouterApiKey",
  "ai.nvidiaApiKey",
  "slack.botToken",
  "slack.signingSecret",
  "whatsapp.accessToken",
  "whatsapp.appSecret",
  "whatsapp.verifyToken",
  "smtp.password",
  "sms.apiKey",
  "cloudinary.apiSecret",
  "r2.secretAccessKey",
]);

/** The environment is the floor: whatever the host already provides. */
function fromEnv(): Integrations {
  return {
    paystack: {
      mode: process.env.PAYSTACK_MODE === "test" ? "test" : "live",
      secretKey: env.paystack.secretKey(),
      publicKey: env.paystack.publicKey(),
      testSecretKey: process.env.PAYSTACK_TEST_SECRET_KEY ?? "",
      testPublicKey: process.env.PAYSTACK_TEST_PUBLIC_KEY ?? "",
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
      nvidiaApiKey: process.env.NVIDIA_API_KEY ?? "",
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
    sms: {
      apiKey: env.vynfy.apiKey(),
      senderId: env.vynfy.senderId(),
    },
    cloudinary: {
      cloudName: env.cloudinary.cloudName(),
      apiKey: env.cloudinary.apiKey(),
      apiSecret: env.cloudinary.apiSecret(),
    },
    r2: {
      accountId: env.r2.accountId(),
      accessKeyId: env.r2.accessKeyId(),
      secretAccessKey: env.r2.secretAccessKey(),
      bucketName: env.r2.bucketName(),
      publicUrl: env.r2.publicUrl(),
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

// --- Secrets at rest ---------------------------------------------------------
//
// Secret fields (the Paystack keys among them) are stored sealed with
// AES-256-GCM, under a key derived from INTEGRATIONS_KEY, or AUTH_SECRET when
// that is not set. A database dump or backup no longer hands out the live
// Paystack key. Changing that secret makes stored keys unreadable: they read
// as empty (payments switch off, loudly) until they are entered again.

const SEALED = "enc:v1:";

function sealingKey(): Buffer {
  const base = process.env.INTEGRATIONS_KEY || env.authSecret();
  return Buffer.from(hkdfSync("sha256", base, "laluxury-integrations", "integration-secrets", 32));
}

export function sealSecret(plain: string): string {
  if (!plain || plain.startsWith(SEALED)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealingKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return SEALED + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openSecret(stored: string): string {
  if (!stored?.startsWith(SEALED)) return stored;
  try {
    const raw = Buffer.from(stored.slice(SEALED.length), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", sealingKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    console.error("[integrations] a stored secret could not be decrypted; re-enter it in Settings → Integrations.");
    return "";
  }
}

type StoredGroups = Record<string, Record<string, unknown>>;

/** Applies `fn` to every secret field in a stored settings object. */
function mapSecrets(stored: StoredGroups, fn: (value: string) => string): StoredGroups {
  const out = structuredClone(stored ?? {}) as StoredGroups;
  for (const path of SECRET_FIELDS) {
    const [group, field] = path.split(".");
    const value = out[group]?.[field];
    if (typeof value === "string" && value) out[group][field] = fn(value);
  }
  return out;
}

function hasPlaintextSecret(stored: StoredGroups): boolean {
  return [...SECRET_FIELDS].some((path) => {
    const [group, field] = path.split(".");
    const value = stored?.[group]?.[field];
    return typeof value === "string" && value !== "" && !value.startsWith(SEALED);
  });
}

let cachedIntegrations: { data: Integrations; expiresAt: number } | null = null;
const INTEGRATIONS_CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateIntegrationsCache(): void {
  cachedIntegrations = null;
}

async function fetchIntegrations(): Promise<Integrations> {
  const now = Date.now();
  if (cachedIntegrations && cachedIntegrations.expiresAt > now) {
    return cachedIntegrations.data;
  }

  const row = await db.setting.findUnique({ where: { key: KEY } });
  const stored = (row?.value as StoredGroups) ?? {};
  // Keys saved before sealing existed are sealed the first time they are read.
  if (row && hasPlaintextSecret(stored)) {
    await db.setting
      .update({ where: { key: KEY }, data: { value: mapSecrets(stored, sealSecret) as Prisma.InputJsonValue } })
      .catch((error) => console.error("[integrations] could not seal stored secrets", error));
  }
  const merged = merge(fromEnv(), mapSecrets(stored, openSecret) as DeepPartial<Integrations>);
  cachedIntegrations = { data: merged, expiresAt: now + INTEGRATIONS_CACHE_TTL_MS };
  return merged;
}

export const getIntegrations = cache(fetchIntegrations);

/**
 * Saves a patch. A blank string means "leave this one alone", so the admin form
 * can render empty secret fields without wiping the stored value on every save.
 */
export async function updateIntegrations(patch: DeepPartial<Integrations>): Promise<void> {
  invalidateIntegrationsCache();
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

  const sealed = mapSecrets(next, sealSecret);
  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: sealed as Prisma.InputJsonValue },
    update: { value: sealed as Prisma.InputJsonValue },
  });
}

/** Clears one field back to whatever the environment provides. */
export async function clearIntegrationField(group: string, field: string): Promise<void> {
  invalidateIntegrationsCache();
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
  setupUrls?: { label: string; value: string; hint: string }[];
};

/**
 * The key pair checkout should use right now.
 *
 * Test mode is a separate pair rather than a replacement, so switching back to
 * live does not mean retyping the real keys — and a test key can never be left
 * behind in the live slot.
 */
function sanitizeKey(val: unknown): string {
  if (typeof val !== "string") return "";
  return val.trim().replace(/^["']|["']$/g, "").trim();
}

export function activePaystack(config: Integrations): {
  mode: PaystackMode;
  secretKey: string;
  publicKey: string;
} {
  const test = config.paystack.mode === "test";
  const rawSecret = test ? config.paystack.testSecretKey : config.paystack.secretKey;
  const rawPublic = test ? config.paystack.testPublicKey : config.paystack.publicKey;
  return {
    mode: config.paystack.mode,
    secretKey: sanitizeKey(rawSecret),
    publicKey: sanitizeKey(rawPublic),
  };
}

/**
 * The secret key for one Paystack mode, whichever mode the store is in now.
 * A payment started in live mode is verified and refunded with the live key
 * even after the store is switched to test, and the other way round.
 */
export function paystackSecretFor(config: Integrations, mode: PaystackMode): string {
  return sanitizeKey(mode === "test" ? config.paystack.testSecretKey : config.paystack.secretKey);
}

/** True when a group has enough filled in to actually work. */
export function isReady(config: Integrations, group: keyof Integrations): boolean {
  switch (group) {
    case "paystack": {
      const active = activePaystack(config);
      const expectedPrefix = active.mode === "test" ? "sk_test_" : "sk_live_";
      // Hosted Checkout is initialized on the server and only needs a secret
      // key. The public key remains optional for future inline checkout use.
      return Boolean(active.secretKey && active.secretKey.startsWith(expectedPrefix));
    }
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
    case "sms":
      return Boolean(config.sms.apiKey && config.sms.senderId);
    case "cloudinary":
      return Boolean(config.cloudinary.cloudName && config.cloudinary.apiSecret);
    case "r2":
      return Boolean(
        config.r2.accountId &&
          config.r2.accessKeyId &&
          config.r2.secretAccessKey &&
          config.r2.bucketName &&
          config.r2.publicUrl,
      );
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
      description:
        config.paystack.mode === "test"
          ? "In test mode — checkout uses the test keys and takes no real money."
          : "Takes card, Mobile Money (MTN, Telecel, AirtelTigo) and bank payments at checkout.",
      ready: isReady(config, "paystack"),
      fields: [
        field("paystack", "mode", "Mode", "live or test"),
        field("paystack", "secretKey", "Live secret key", "Starts sk_live_"),
        field("paystack", "publicKey", "Live public key (optional)", "Starts pk_live_; hosted checkout only needs secret key"),
        field("paystack", "testSecretKey", "Test secret key", "Starts sk_test_"),
        field("paystack", "testPublicKey", "Test public key (optional)", "Starts pk_test_; hosted checkout only needs secret key"),
      ],
      setupUrls: [
        {
          label: "Callback URL",
          value: `${env.siteUrl()}/checkout/confirm`,
          hint: "Add this under Paystack Dashboard > Settings > API Keys & Webhooks.",
        },
        {
          label: "Webhook URL",
          value: `${env.siteUrl()}/api/webhooks/paystack`,
          hint: "Required for reliable payment confirmation, including Mobile Money.",
        },
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
        field("ai", "nvidiaApiKey", "NVIDIA API key (Bulk Product Add)", "build.nvidia.com"),
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
        field("smtp", "from", "From address", 'e.g. Noble Enclave <no-reply@nobleenclave.com>'),
      ],
    },
    {
      key: "sms",
      label: "SMS & one-time codes",
      description:
        "Vynfy texts the code that verifies a new account, and sends order notices.",
      ready: isReady(config, "sms"),
      fields: [
        field("sms", "apiKey", "Vynfy API key", "From your Vynfy dashboard"),
        field(
          "sms",
          "senderId",
          "Sender ID",
          "The name on the handset. Max 11 characters, and registered with Vynfy first",
        ),
      ],
    },
    {
      key: "cloudinary",
      label: "Cloudinary (Optional Image CDN)",
      description:
        "Alternative image CDN. When Cloudflare R2 is connected, R2 takes priority and handles media with $0 egress.",
      ready: isReady(config, "cloudinary"),
      fields: [
        field("cloudinary", "cloudName", "Cloud name"),
        field("cloudinary", "apiKey", "API key"),
        field("cloudinary", "apiSecret", "API secret"),
      ],
    },
    {
      key: "r2",
      label: "Cloudflare R2 Storage (Zero Egress)",
      description: "Stores product photos with $0 egress fees on Cloudflare's global edge network.",
      ready: isReady(config, "r2"),
      fields: [
        field("r2", "accountId", "Account ID"),
        field("r2", "accessKeyId", "Access Key ID"),
        field("r2", "secretAccessKey", "Secret Access Key"),
        field("r2", "bucketName", "Bucket Name"),
        field(
          "r2",
          "publicUrl",
          "Public URL",
          "e.g. https://pub-xxx.r2.dev or https://media.nobleenclave.com",
        ),
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
    { key: "sms", label: "SMS & one-time codes", ready: isReady(config, "sms") },
    { key: "cloudinary", label: "Cloudinary CDN", ready: isReady(config, "cloudinary") },
    { key: "r2", label: "Cloudflare R2", ready: isReady(config, "r2") },
  ];
}
