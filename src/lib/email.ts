import nodemailer from "nodemailer";
import { getIntegrations } from "./integrations";
import { classifyEmailError, type DeliveryResult } from "./notifications/policy";

/**
 * Transactional email over whatever SMTP the owner has configured.
 *
 * Every send is best-effort by design: an order that is paid for must not fail
 * because a mail server is refusing connections. Callers that need to know use
 * the returned result rather than a thrown error.
 */

export type SendResult = { ok: boolean; skipped?: boolean; error?: string; delivery?: DeliveryResult };

export async function isEmailConfigured(): Promise<boolean> {
  const { smtp } = await getIntegrations();
  return Boolean(smtp.host && smtp.user);
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  const { smtp } = await getIntegrations();

  if (!smtp.host || !smtp.user) {
    return { ok: false, skipped: true, error: "Email is not configured." };
  }

  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      // 465 is implicit TLS; everything else upgrades with STARTTLS.
      secure: (smtp.port || 587) === 465,
      auth: { user: smtp.user, pass: smtp.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    await transport.sendMail({
      from: smtp.from || smtp.user,
      to: args.to,
      subject: args.subject,
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
    });

    return { ok: true };
  } catch (error) {
    const delivery = classifyEmailError(error);
    console.error("[email] send failed", { code: delivery.code });
    return { ok: false, error: "Email provider did not confirm acceptance.", delivery };
  }
}

/** Proves the SMTP settings work, without sending anything to a customer. */
export async function sendTestEmail(to: string): Promise<SendResult> {
  return sendEmail({
    to,
    subject: "Noble Enclave — email is working",
    text: "This is a test from your Noble Enclave console. If you are reading it, transactional email is configured correctly.",
  });
}
