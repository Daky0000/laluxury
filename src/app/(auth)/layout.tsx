import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--border-subtle)]">
        <div className="lx-container flex h-16 items-center">
          <Link href="/" className="font-display text-xl">
            LaLuxury
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-16">{children}</main>
    </div>
  );
}
