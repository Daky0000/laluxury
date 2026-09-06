/**
 * Values shared by client and server components.
 *
 * Kept free of any database or Node-only import so client bundles can pull
 * from here without dragging the Postgres driver in with them.
 */

/** The sixteen administrative regions of Ghana. */
export const GHANA_REGIONS = [
  "Greater Accra",
  "Ashanti",
  "Western",
  "Western North",
  "Central",
  "Eastern",
  "Volta",
  "Oti",
  "Northern",
  "Savannah",
  "North East",
  "Upper East",
  "Upper West",
  "Bono",
  "Bono East",
  "Ahafo",
] as const;

export type GhanaRegion = (typeof GHANA_REGIONS)[number];

/**
 * How many digits a one-time code has.
 *
 * Vynfy is asked for exactly this many, the sign-up screen draws exactly this
 * many boxes, and the server accepts exactly this many — so the three can never
 * drift apart. It lives here rather than in `lib/sms` because the code screen is
 * a client component and `lib/sms` reaches the database.
 */
export const OTP_LENGTH = 6;

export const ORDER_STATUS_LABELS = {
  PENDING: "Awaiting payment",
  PAID: "Paid",
  PROCESSING: "Processing",
  FULFILLED: "Fulfilled",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
} as const;

export const PAYMENT_STATUS_LABELS = {
  PENDING: "Pending",
  SUCCESS: "Paid",
  FAILED: "Failed",
  ABANDONED: "Abandoned",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Part refunded",
} as const;
