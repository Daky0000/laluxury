import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { LegalShell } from "@/components/shop/legal-shell";
import { CookieSettingsLink } from "@/components/shop/cookie-consent";

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "What personal data LaLuxury collects, why we hold it, who processes it, how long we keep it, and the rights you have over it under the GDPR and Ghana's Data Protection Act.",
};

/**
 * The privacy notice, written to Articles 13 and 14 of the GDPR: identity of
 * the controller, purposes, lawful basis for each purpose, recipients,
 * transfers out of the EEA, retention, and the eight data-subject rights with a
 * route to exercising each of them.
 *
 * The processors named here are the ones the code actually calls. If an
 * integration is added, it belongs in this table on the same commit — a notice
 * that lists the wrong recipients is worse than no notice.
 */
export default async function PrivacyPage() {
  const settings = await getSettings();
  const contact = settings.supportEmail || "hello@laluxury.com";

  return (
    <LegalShell
      current="/privacy"
      title="Privacy notice"
      intro={`How ${settings.storeName} collects, uses and protects your personal data — and what you can ask us to do with it.`}
    >
      <p>
        This notice covers everything you do on this site: browsing, ordering, creating an account,
        signing up to the list, and contacting us. It is written to the EU and UK General Data
        Protection Regulation and to Ghana&rsquo;s Data Protection Act, 2012 (Act 843).
      </p>

      <h2>Who is responsible for your data</h2>
      <p>
        <strong>{settings.storeName}</strong>
        {settings.addressLine ? `, ${settings.addressLine}` : ""} is the data controller — we decide
        why and how your personal data is used.
      </p>
      <p>
        Privacy questions and requests go to{" "}
        <a href={`mailto:${contact}`}>{contact}</a>
        {settings.supportPhone ? (
          <>
            {" "}
            or <a href={`tel:${settings.supportPhone.replace(/\s/g, "")}`}>{settings.supportPhone}</a>
          </>
        ) : null}
        . We answer within one month, as the GDPR requires.
      </p>

      <h2>What we collect, why, and on what basis</h2>
      <p>
        We do not collect anything we have no use for, and every purpose below has a lawful basis
        behind it.
      </p>

      <div className="lx-table-scroll">
        <table>
          <thead>
            <tr>
              <th>What</th>
              <th>Why</th>
              <th>Lawful basis</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Name, phone number and password (hashed, never stored in the clear)</td>
              <td>Creating and securing your account</td>
              <td>Performance of a contract</td>
            </tr>
            <tr>
              <td>A one-time code sent to your phone</td>
              <td>Proving the number is yours, and keeping other people out of your account</td>
              <td>Performance of a contract, and our legitimate interest in preventing fraud</td>
            </tr>
            <tr>
              <td>Delivery address, email, order contents and order notes</td>
              <td>Taking payment, packing the order and getting it to you</td>
              <td>Performance of a contract</td>
            </tr>
            <tr>
              <td>Payment result and reference (we never see or store your card or wallet PIN)</td>
              <td>Confirming an order is paid, and handling disputes</td>
              <td>Performance of a contract, and a legal obligation to keep sales records</td>
            </tr>
            <tr>
              <td>Email address given to the newsletter, and the marketing box on sign-up</td>
              <td>Sending you new arrivals and restocks</td>
              <td>Your consent, withdrawable at any time</td>
            </tr>
            <tr>
              <td>Messages you send us, by form, email or WhatsApp</td>
              <td>Answering you</td>
              <td>Our legitimate interest in running a shop that replies</td>
            </tr>
            <tr>
              <td>Pages and products viewed, if you allow analytics cookies</td>
              <td>Understanding what to stock more of</td>
              <td>Your consent</td>
            </tr>
            <tr>
              <td>Server logs and security records, including IP address</td>
              <td>Keeping the site up and detecting abuse</td>
              <td>Our legitimate interest in the security of the service</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        Where the basis is consent, you can withdraw it whenever you like and it costs you nothing:
        marketing is a switch on <Link href="/account">your account</Link> and an unsubscribe link on
        every message, and cookie choices are changed with the{" "}
        <CookieSettingsLink className="underline underline-offset-4 hover:text-[var(--accent)]" />{" "}
        link. Withdrawing consent does not undo anything done lawfully before you withdrew it.
      </p>
      <p>
        We do not sell your data, and we make no decisions about you by automated means alone that
        would have a legal or similarly significant effect.
      </p>

      <h2>Who else processes it</h2>
      <p>
        We use a small number of service providers. They act on our written instructions, may only
        use the data to do the job we gave them, and are bound to protect it.
      </p>

      <div className="lx-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Processor</th>
              <th>What it does</th>
              <th>Where</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Paystack</td>
              <td>Takes card, Mobile Money and bank payments</td>
              <td>Nigeria / South Africa</td>
            </tr>
            <tr>
              <td>Vynfy</td>
              <td>Sends the one-time codes and order text messages</td>
              <td>Ghana</td>
            </tr>
            <tr>
              <td>Railway</td>
              <td>Hosts the site and the database</td>
              <td>United States / EU</td>
            </tr>
            <tr>
              <td>Cloudinary</td>
              <td>Stores and serves product photography</td>
              <td>United States / EU</td>
            </tr>
            <tr>
              <td>Our email provider</td>
              <td>Delivers receipts and replies</td>
              <td>Depends on the provider in use</td>
            </tr>
            <tr>
              <td>Meta (WhatsApp Business)</td>
              <td>Carries WhatsApp conversations, if you start one</td>
              <td>United States / Ireland</td>
            </tr>
            <tr>
              <td>Slack</td>
              <td>Notifies our team of new orders and messages</td>
              <td>United States</td>
            </tr>
            <tr>
              <td>Anthropic / OpenRouter</td>
              <td>Powers the assistant that drafts replies to customer messages</td>
              <td>United States</td>
            </tr>
            <tr>
              <td>Couriers and delivery partners</td>
              <td>Deliver your order — they get your name, address and phone number only</td>
              <td>Ghana</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        We also disclose data where the law requires it — to tax authorities, or in response to a
        valid legal order.
      </p>

      <h2>Sending data outside Ghana and the EEA</h2>
      <p>
        Some of those providers are outside Ghana and outside the European Economic Area. Where
        personal data moves to a country without an adequacy decision, the transfer is covered by
        the European Commission&rsquo;s Standard Contractual Clauses in the provider&rsquo;s data
        processing agreement, together with encryption in transit and at rest. You can ask us for a
        copy of the safeguards that apply to a particular transfer.
      </p>

      <h2>How long we keep it</h2>
      <div className="lx-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Record</th>
              <th>Kept for</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Account details</td>
              <td>Until you ask us to close the account, then deleted within 30 days</td>
            </tr>
            <tr>
              <td>Orders, invoices and payment records</td>
              <td>Six years from the end of the tax year, as accounting law requires</td>
            </tr>
            <tr>
              <td>One-time verification codes</td>
              <td>Minutes — they expire and are discarded; we never store the code itself</td>
            </tr>
            <tr>
              <td>Marketing list membership</td>
              <td>Until you unsubscribe</td>
            </tr>
            <tr>
              <td>Contact messages</td>
              <td>Two years after the conversation ends</td>
            </tr>
            <tr>
              <td>Cookie consent record</td>
              <td>Six months, then we ask again</td>
            </tr>
            <tr>
              <td>Server and security logs</td>
              <td>90 days</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Closing an account does not delete an order that we are legally required to keep a record
        of. What we keep in that case is the minimum the law asks for.
      </p>

      <h2>Your rights</h2>
      <p>You can ask us to:</p>
      <ul>
        <li>
          <strong>Give you a copy</strong> of the personal data we hold about you, and tell you what
          we do with it.
        </li>
        <li>
          <strong>Correct</strong> anything that is wrong or out of date.
        </li>
        <li>
          <strong>Delete</strong> it, where we have no overriding reason to keep it.
        </li>
        <li>
          <strong>Restrict</strong> what we do with it while a dispute about it is resolved.
        </li>
        <li>
          <strong>Hand it over</strong> to you or to another provider in a portable, machine-readable
          form.
        </li>
        <li>
          <strong>Stop</strong> — object to processing we do on the basis of legitimate interests,
          and to direct marketing at any time, with no reason needed.
        </li>
        <li>
          <strong>Withdraw consent</strong> you previously gave, without affecting what was done
          before.
        </li>
      </ul>
      <p>
        Email <a href={`mailto:${contact}`}>{contact}</a> with what you want and we will action it
        within one month, free of charge. We may ask you to confirm your identity first, so that
        nobody else can use these rights to get at your data.
      </p>
      <p>
        If you think we have got it wrong, tell us and we will try to put it right. You also have
        the right to complain to a supervisory authority — Ghana&rsquo;s Data Protection Commission,
        or the authority in your EU or UK country of residence.
      </p>

      <h2>Security</h2>
      <p>
        Traffic runs over HTTPS. Passwords are stored as bcrypt hashes and never in readable form.
        Sessions are held in a signed, HTTP-only cookie. Card and Mobile Money credentials are
        entered on Paystack&rsquo;s own screens and never touch our servers. Access to the back
        office is limited to staff who need it, is role-restricted, and is logged.
      </p>

      <h2>Cookies</h2>
      <p>
        Only strictly necessary cookies are set before you choose. What each one does, and how to
        change your mind, is in the <Link href="/cookies">cookie policy</Link>.
      </p>

      <h2>Children</h2>
      <p>
        This shop is not aimed at children, and we do not knowingly hold data about anyone under 16.
        If you believe we do, tell us and we will delete it.
      </p>

      <h2>Changes</h2>
      <p>
        When this notice changes we update the date at the top. If the change is significant — a new
        purpose, or a new category of recipient — we will ask for your consent again where consent
        is the basis, and tell account holders directly.
      </p>
    </LegalShell>
  );
}
