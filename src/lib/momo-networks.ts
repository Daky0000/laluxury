/**
 * The Mobile Money networks checkout offers, and how each one is paid.
 *
 * Shoppers pick their network first. A network on the store's direct list gets
 * a PIN prompt pushed straight to the phone (Paystack Charge API); any other
 * network finishes on Paystack's own hosted page, which walks the shopper
 * through that network's approval steps itself. The list lives in store
 * settings so the owner can move a network across without a deploy.
 *
 * Client-safe: no server imports.
 */

export type MomoNetworkId = "mtn" | "vod" | "atl";

export const MOMO_NETWORK_IDS: readonly MomoNetworkId[] = ["mtn", "vod", "atl"];

export const MOMO_NETWORK_OPTIONS: readonly {
  id: MomoNetworkId;
  label: string;
  short: string;
  /** Brand dot colour on the picker. */
  color: string;
}[] = [
  { id: "mtn", label: "MTN MoMo", short: "MTN", color: "#FFCC00" },
  { id: "vod", label: "Telecel Cash", short: "Telecel", color: "#E60000" },
  { id: "atl", label: "AT Money", short: "AT", color: "#003399" },
];

/**
 * Networks that get the direct phone prompt when the owner has not chosen.
 * Telecel needs a texted code before its prompt appears, which is where most
 * direct prompts went missing, so it goes through Paystack's page by default.
 */
export const DEFAULT_MOMO_DIRECT_NETWORKS: MomoNetworkId[] = ["mtn", "atl"];

export function isMomoNetworkId(value: unknown): value is MomoNetworkId {
  return typeof value === "string" && (MOMO_NETWORK_IDS as readonly string[]).includes(value);
}

/** A stored list, cleaned: known ids only, no repeats. */
export function normaliseDirectNetworks(value: unknown): MomoNetworkId[] {
  if (!Array.isArray(value)) return [...DEFAULT_MOMO_DIRECT_NETWORKS];
  return MOMO_NETWORK_IDS.filter((id) => value.includes(id));
}

/** How a chosen network is paid: a prompt to the phone, or Paystack's page. */
export function momoRouteFor(
  network: MomoNetworkId,
  directNetworks: readonly MomoNetworkId[],
): "direct_debit" | "mobile_money" {
  return directNetworks.includes(network) ? "direct_debit" : "mobile_money";
}

/** A direct charge's state as Paystack reports it; see `paystack.ts`. */
export type DirectChargeStatus = "pay_offline" | "send_otp" | "success" | "pending" | "failed";

/**
 * What to tell a payer about an unsettled direct MoMo charge, network by
 * network. Paystack's own `display_text` comes first when it sent one,
 * because it names the exact step the network wants.
 */
export function momoApprovalHelp(
  provider: MomoNetworkId,
  status: DirectChargeStatus | null,
  displayText?: string | null,
): { headline: string; steps: string[]; needsCode: boolean } {
  const fromPaystack = displayText?.trim() || null;
  if (status === "send_otp") {
    return {
      headline: "Your network needs a code before it sends the prompt",
      steps:
        provider === "vod"
          ? [
              fromPaystack ?? "Dial *110# to generate a voucher code. Then input the voucher below.",
              "Type the voucher code below and tap Submit. Nothing is taken until you approve it.",
            ]
          : [
              fromPaystack ?? "Your network has sent you a one-time code by SMS.",
              "Type the code below and tap Submit. The PIN prompt follows.",
            ],
      needsCode: true,
    };
  }
  if (status === "pending") {
    return {
      headline: "Sending the prompt to your phone",
      steps: [
        "Your network is still processing the request. Keep this page open; it updates by itself.",
        "Keep your phone unlocked with signal, and close any other USSD menu that is open.",
      ],
      needsCode: false,
    };
  }
  const approvals =
    provider === "mtn"
      ? "No pop-up? Dial *170#, choose My Wallet, then My Approvals, pick this payment and enter your PIN."
      : provider === "atl"
        ? "No pop-up? Dial *110#, open your AT Money wallet's approvals menu, pick this payment and enter your PIN."
        : "No pop-up? Dial *110# and check for a payment waiting for approval.";
  return {
    headline: "Approve the payment on your phone",
    steps: [
      fromPaystack ?? "A payment prompt has been sent to your phone. Enter your MoMo PIN to approve it.",
      approvals,
      "The prompt lasts about a minute. If it timed out, send it again below.",
    ],
    needsCode: false,
  };
}
