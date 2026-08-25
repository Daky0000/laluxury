/**
 * Centralised env access.
 *
 * Only DATABASE_URL and AUTH_SECRET are hard requirements. Every integration
 * is optional and reports its own readiness, so the store boots and runs with
 * nothing but a database — you switch features on by adding keys.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  authSecret: () => required("AUTH_SECRET"),

  siteUrl: () =>
    (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),

  currency: () => optional("NEXT_PUBLIC_CURRENCY", "GHS"),

  paystack: {
    secretKey: () => optional("PAYSTACK_SECRET_KEY"),
    publicKey: () => optional("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY"),
    isConfigured: () => Boolean(process.env.PAYSTACK_SECRET_KEY),
  },

  openrouter: {
    apiKey: () => optional("OPENROUTER_API_KEY"),
    model: () => optional("OPENROUTER_MODEL", "openrouter/ox-alpha"),
    fallbackModel: () => optional("OPENROUTER_FALLBACK_MODEL", "anthropic/claude-sonnet-4.5"),
    isConfigured: () => Boolean(process.env.OPENROUTER_API_KEY),
  },

  slack: {
    botToken: () => optional("SLACK_BOT_TOKEN"),
    signingSecret: () => optional("SLACK_SIGNING_SECRET"),
    alertChannel: () => optional("SLACK_ALERT_CHANNEL"),
    isConfigured: () =>
      Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET),
  },

  whatsapp: {
    accessToken: () => optional("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: () => optional("WHATSAPP_PHONE_NUMBER_ID"),
    verifyToken: () => optional("WHATSAPP_VERIFY_TOKEN"),
    appSecret: () => optional("WHATSAPP_APP_SECRET"),
    isConfigured: () =>
      Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  },

  smtp: {
    host: () => optional("SMTP_HOST"),
    port: () => Number(optional("SMTP_PORT", "587")),
    user: () => optional("SMTP_USER"),
    password: () => optional("SMTP_PASSWORD"),
    from: () => optional("EMAIL_FROM", "LaLuxury <no-reply@laluxury.com>"),
    isConfigured: () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
  },

  cloudinary: {
    cloudName: () => optional("CLOUDINARY_CLOUD_NAME"),
    apiKey: () => optional("CLOUDINARY_API_KEY"),
    apiSecret: () => optional("CLOUDINARY_API_SECRET"),
    isConfigured: () =>
      Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_SECRET),
  },

  isProduction: () => process.env.NODE_ENV === "production",
} as const;

/** Surfaced on the admin dashboard so the owner can see what is still unwired. */
export function integrationStatus() {
  return [
    { key: "paystack", label: "Paystack payments", ready: env.paystack.isConfigured() },
    { key: "openrouter", label: "AI agent (OpenRouter)", ready: env.openrouter.isConfigured() },
    { key: "slack", label: "Slack channel", ready: env.slack.isConfigured() },
    { key: "whatsapp", label: "WhatsApp channel", ready: env.whatsapp.isConfigured() },
    { key: "smtp", label: "Transactional email", ready: env.smtp.isConfigured() },
    { key: "cloudinary", label: "Cloudinary image CDN", ready: env.cloudinary.isConfigured() },
  ];
}
