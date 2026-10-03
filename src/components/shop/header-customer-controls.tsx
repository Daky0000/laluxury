"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { User } from "lucide-react";
import { BagButton } from "./bag-button";
import { CART_CHANGED_EVENT, CART_COUNT_EVENT } from "./bag-events";

type State = { accountHref: string; signedIn: boolean; count: number };

export function HeaderCustomerControls() {
  const pathname = usePathname();
  const [state, setState] = useState<State>({ accountHref: "/login", signedIn: false, count: 0 });
  useEffect(() => {
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/account/header-state", {
          cache: "no-store", credentials: "same-origin", signal: controller.signal,
        });
        if (response.ok) setState(await response.json() as State);
      } catch { /* Keep the last successful controls during a transient failure. */ }
    };
    const updateCount = (event: Event) => {
      const count = (event as CustomEvent<number>).detail;
      if (Number.isInteger(count) && count >= 0) setState((previous) => ({ ...previous, count }));
    };
    void refresh();
    window.addEventListener(CART_CHANGED_EVENT, refresh);
    window.addEventListener(CART_COUNT_EVENT, updateCount);
    return () => {
      controller?.abort();
      window.removeEventListener(CART_CHANGED_EVENT, refresh);
      window.removeEventListener(CART_COUNT_EVENT, updateCount);
    };
  }, [pathname]);
  return <>
    <Link href={state.accountHref} prefetch={false}
      className="lx-tap-tight text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]">
      <User className="h-[19px] w-[19px]" strokeWidth={1.5} aria-hidden />
      <span className="sr-only">{state.signedIn ? "Your account" : "Sign in"}</span>
    </Link>
    <BagButton count={state.count} />
  </>;
}
