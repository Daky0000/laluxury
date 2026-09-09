/**
 * Printable documents: white paper, the body type, and nothing of the console
 * around them. Whatever renders in here is meant to come out of a printer.
 */
export default function PrintLayout({ children }: LayoutProps<"/print">) {
  return <div className="min-h-full bg-white text-[#1a1a18] print:bg-white">{children}</div>;
}
