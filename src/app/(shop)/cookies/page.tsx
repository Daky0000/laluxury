import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { LegalShell } from "@/components/shop/legal-shell";
import { CookieSettingsLink } from "@/components/shop/cookie-consent";

export const metadata: Metadata = {
  title: "Cookie policy",
  description:
    "Every cookie this shop sets, what it is for, how long it lasts, and how to change your mind at any time.",
};

/**
 * The cookie policy names every cookie the code actually sets. Adding a cookie
 * without adding a row here — or loading a third-party script before consent —
 * is the thing that turns a compliant site into a non-compliant one.
 */
export default async function CookiesPage() {
  const settings = await getSettings();
  const contact = settings.supportEmail || "hello@laluxury.com";

  return (
    <LegalShell
      current="/cookies"
      title="Cookie policy"
      intro="Which cookies this shop sets, what each one does, and how to turn the optional ones on or off."
    >
      <p>
        A cookie is a small file a site asks your browser to keep. Under the ePrivacy Directive and
        the GDPR, only the cookies a site genuinely cannot work without may be set without your
        permission. Everything else waits for you to say yes.
      </p>
      <p>
        <strong>Nothing optional is set until you choose.</strong> No analytics, no advertising, no
        third-party script loads before you have answered the banner, and continuing to browse is
        not treated as agreement.
      </p>

      <h2>Strictly necessary — always on</h2>
      <p>
        These four are what the shop is made of. They carry no advertising identifier and are never
        shared.
      </p>

      <div className="lx-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Cookie</th>
              <th>What it does</th>
              <th>Lasts</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>lx_session</code>
              </td>
              <td>
                Keeps you signed in. Signed and HTTP-only, so page scripts cannot read it.
              </td>
              <td>30 days</td>
            </tr>
            <tr>
              <td>
                <code>lx_cart</code>
              </td>
              <td>Remembers your bag while you are signed out.</td>
              <td>60 days</td>
            </tr>
            <tr>
              <td>
                <code>lx_signup</code>
              </td>
              <td>
                Holds a half-finished registration between entering your details and entering the
                code we text you.
              </td>
              <td>15 minutes</td>
            </tr>
            <tr>
              <td>
                <code>lx_consent</code>
              </td>
              <td>Remembers the choice you made on the cookie banner, so we stop asking.</td>
              <td>6 months</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Analytics — off unless you allow it</h2>
      <p>
        Aggregate counts of which pages and products get looked at, so we know what to stock more
        of. Never used to identify you, and never joined to your account or your orders. If you have
        not switched this on, no analytics cookie exists on your device.
      </p>

      <h2>Marketing — off unless you allow it</h2>
      <p>
        Lets us tell whether an advert led to an order, and show our pieces to you on other sites.
        Set by the advertising platform rather than by us, and only ever after you have agreed.
      </p>

      <h2>Changing your mind</h2>
      <p>
        Use{" "}
        <CookieSettingsLink className="underline underline-offset-4 hover:text-[var(--accent)]" />{" "}
        — here, or from the bottom of any page. Turning a category off stops it immediately. You can
        also clear cookies in your browser settings, though that will sign you out and empty your
        bag, because those are the necessary ones.
      </p>
      <p>
        We re-ask every six months, and again whenever this policy changes in a way that affects
        what you agreed to.
      </p>

      <h2>Questions</h2>
      <p>
        Write to <a href={`mailto:${contact}`}>{contact}</a>. What we do with the data behind these
        cookies is set out in the <Link href="/privacy">privacy notice</Link>.
      </p>
    </LegalShell>
  );
}
