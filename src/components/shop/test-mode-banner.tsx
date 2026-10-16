import { activePaystack, getIntegrations } from "@/lib/integrations";

/**
 * A plain warning while Paystack runs on test keys: test payments take no real
 * money, so nobody should be selling (or shipping) in this mode unawares.
 * Shown on checkout and across the admin; rendered on the server, per request.
 */
export async function TestModeBanner({ audience }: { audience: "shopper" | "staff" }) {
  const mode = activePaystack(await getIntegrations()).mode;
  if (mode !== "test") return null;
  return (
    <div role="status" className="bg-warning px-4 py-2 text-center text-sm font-medium text-black">
      {audience === "staff"
        ? "Payments are in TEST mode: checkout takes no real money. Switch back to live in Settings before selling."
        : "Test mode: this checkout takes no real money and orders will not be shipped."}
    </div>
  );
}
