import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

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
      <div className="lx-container grid gap-10 py-16 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <p className="font-display text-[28px] uppercase tracking-[0.16em]">
            {settings.storeName}
          </p>
          <p className="mt-4 max-w-[280px] text-sm font-light leading-[1.7] text-[var(--text-secondary)]">
            {intro} Order online or by WhatsApp — cash on delivery welcome.
          </p>
        </div>

        {columns.map((column) => (
          <nav key={column.head} aria-label={column.head}>
            <p className="mb-4 text-sm uppercase tracking-[0.18em] text-[var(--text-primary)]">
              {column.head}
            </p>
            <ul>
              {column.links.map((link) => (
                <li key={link.label} className="mb-2.5">
                  <Link
                    href={link.href}
                    className="text-sm font-light text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-[var(--border-subtle)]">
        <div className="lx-container flex flex-col items-start justify-between gap-2 py-5 text-sm tracking-[0.04em] text-[var(--text-muted)] sm:flex-row sm:items-center">
          <p>
            © {year} {settings.storeName} Home &amp; Living
          </p>
          <p>{settings.addressLine} · nationwide delivery</p>
        </div>
      </div>
    </footer>
  );
}
