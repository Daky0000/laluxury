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
