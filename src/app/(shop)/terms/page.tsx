import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { LegalShell } from "@/components/shop/legal-shell";

export const metadata: Metadata = {
  title: "Terms of sale",
  description:
    "The terms you agree to when you order from LaLuxury: prices, payment, delivery, returns and how to reach us.",
};

/**
 * Terms of sale. The delivery and returns wording is read from settings rather
 * than repeated, so there is one copy of each policy in the shop and the owner
 * can change it from the console without this page drifting out of date.
 */
export default async function TermsPage() {
  const settings = await getSettings();
  const contact = settings.supportEmail || "hello@laluxury.com";

  return (
    <LegalShell
      current="/terms"
      title="Terms of sale"
      intro={`The agreement between you and ${settings.storeName} when you place an order.`}
    >
      <p>
        Ordering from this site means accepting these terms. They sit alongside the{" "}
        <Link href="/privacy">privacy notice</Link> and the{" "}
        <Link href="/cookies">cookie policy</Link>, and they do not affect statutory rights you have
        as a consumer.
      </p>

      <h2>Who you are dealing with</h2>
      <p>
        <strong>{settings.storeName}</strong>
        {settings.addressLine ? `, ${settings.addressLine}` : ""}. Reach us at{" "}
        <a href={`mailto:${contact}`}>{contact}</a>
        {settings.whatsappNumber ? (
          <>
            {" "}
            or on WhatsApp at <strong>{settings.whatsappNumber}</strong>
          </>
        ) : null}
        .
      </p>

      <h2>Orders</h2>
      <p>
        Adding a piece to your bag is not an order, and an order is not accepted until we have
        confirmed it and taken payment. If something sells out between your order and our
        confirmation, we will tell you and refund you in full.
      </p>
      <p>
        Photography is as faithful as we can make it, but screens differ and natural fibres vary
        between production runs. Small differences in shade and weave are the material, not a fault.
      </p>

      <h2>Prices and payment</h2>
      <p>
        Prices are in Ghana cedis and include any tax due. Delivery is quoted separately at checkout
        before you pay, so you always see the total before committing.
      </p>
      <p>
        We take Mobile Money on MTN, Telecel and AirtelTigo, cards, and bank transfer or USSD —
        processed by Paystack, whose screens are where your payment details are entered. We never
        see or store your card number, wallet PIN or one-time payment code.
      </p>
      <p>
        <strong>We do not take cash on delivery.</strong> An order is paid for before it leaves us.
      </p>

      <h2>Delivery</h2>
      <p>{settings.shippingPolicy}</p>
      <p>
        Delivery times are estimates rather than guarantees. Someone must be available to receive
        the order at the address or station given, and the phone number on the order needs to be
        reachable on the day.
      </p>

      <h2>Returns</h2>
      <p>{settings.returnsPolicy}</p>
      <p>
        Nothing here limits your rights where goods arrive damaged, faulty, or not as described.
        Tell us within 48 hours of delivery, with photographs, and we will put it right.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your password to yourself, and tell us straight away if you think someone else has got
        into your account. We verify the phone number on every new account by text, so a number you
        do not control cannot be registered.
      </p>
      <p>
        We may suspend an account that is used for fraud, or to abuse the shop or our staff.
      </p>

      <h2>Liability</h2>
      <p>
        We are responsible for loss you suffer as a foreseeable result of us breaking these terms or
        failing to use reasonable care. We are not responsible for loss that was not foreseeable, or
        for business losses. Nothing in these terms excludes liability we cannot lawfully exclude —
        including for death or personal injury caused by our negligence, or for fraud.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the Republic of Ghana, and disputes go to the
        Ghanaian courts. If you are a consumer resident in the EU or the UK, you keep the protection
        of the mandatory consumer law of your own country.
      </p>

      <h2>Changes</h2>
      <p>
        We may revise these terms. The version that applies to your order is the one published when
        you placed it.
      </p>
    </LegalShell>
  );
}
