import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { CookieSettingsLink } from "./cookie-consent";

const LEGAL_LINKS = [
  { label: "Privacy notice", href: "/privacy" },
  { label: "Cookie policy", href: "/cookies" },
  { label: "Terms of sale", href: "/terms" },
] as const;

export async function Footer() {
  // The rooms come from the database rather than a list here, so retiring one
  // takes it out of the footer too. Hardcoding them meant the footer went on
  // offering a room after it had been emptied and switched off.
  const [settings, rooms] = await Promise.all([
    getSettings(),
    db.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { position: "asc" },
      select: { name: true, slug: true },
    }),
  ]);

  const year = new Date().getFullYear();
  const whatsapp = settings.whatsappNumber.replace(/[^\d]/g, "");
  // The tagline is owner-edited, so it may or may not end in a full stop.
  const intro = settings.tagline.trim().replace(/[.\s]*$/, ".");

  const columns: { head: string; links: { label: string; href: string }[] }[] = [
    {
      head: "Shop",
      links: [
        { label: "All products", href: "/shop" },
        ...rooms.map((room) => ({
          label: room.name,
          href: `/shop?category=${room.slug}`,
        })),
        { label: "New in", href: "/shop?sort=newest" },
      ],
    },
    {
      head: "Help",
      links: [
        { label: "Track order", href: "/orders/track" },
        { label: "Delivery & returns", href: "/contact" },
        { label: "Your account", href: "/account" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      head: "Studio",
      links: [
        { label: `About ${settings.storeName}`, href: "/contact" },
        {
          label: "WhatsApp us",
          href: whatsapp ? `https://wa.me/${whatsapp}` : "/contact",
        },
        { label: "Wholesale", href: "/contact" },
        ...(settings.instagramUrl
          ? [{ label: "Instagram", href: settings.instagramUrl }]
          : []),
      ],
    },
  ];

  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
      {/* Two columns of links on a phone, three plus the blurb from `md`. Four
          across at 768px gave each column about 160px, which wraps every second
          label onto a line of its own. */}
      <div className="lx-container grid gap-x-8 gap-y-10 py-12 sm:py-16 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <p className="font-display text-[28px] uppercase tracking-[0.16em]">
            {settings.storeName}
          </p>
          <p className="mt-4 max-w-[320px] text-sm font-light leading-[1.7] text-[var(--text-secondary)]">
            {intro} Order online or by WhatsApp — pay by Mobile Money (MTN, Telecel,
            AirtelTigo), card or bank transfer.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 md:contents">
          {columns.map((column) => (
            <nav key={column.head} aria-label={column.head}>
              <p className="mb-3 text-sm uppercase tracking-[0.18em] text-[var(--text-primary)]">
                {column.head}
              </p>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="flex min-h-11 items-center text-sm font-light text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      {/* The legal rail. Kept out of the three link columns above so it reads
          as what it is — the policies, and the way back into the cookie
          choice — rather than as another place to shop. */}
      <div className="border-t border-[var(--border-subtle)]">
        <div className="lx-container flex flex-wrap gap-x-6 gap-y-1 py-3 text-sm text-[var(--text-secondary)]">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex min-h-11 items-center transition-colors hover:text-[var(--accent)]"
            >
              {link.label}
            </Link>
          ))}
          <CookieSettingsLink className="flex min-h-11 items-center underline-offset-4 transition-colors hover:text-[var(--accent)] hover:underline" />
        </div>
      </div>

      <div className="border-t border-[var(--border-subtle)]">
        <div className="lx-safe-b lx-container flex flex-col items-start justify-between gap-2 pt-5 text-sm tracking-[0.04em] text-[var(--text-muted)] sm:flex-row sm:items-center">
          <p>
            © {year} {settings.storeName} Home &amp; Living
          </p>
          <p>{settings.addressLine} · nationwide delivery</p>
        </div>
      </div>
    </footer>
  );
}
