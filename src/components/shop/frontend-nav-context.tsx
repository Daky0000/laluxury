"use client";

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  useEffect,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "laluxury_frontend_hide_nav";
const NAV_CHANGE_EVENT = "laluxury:frontend-nav-change";

interface FrontendNavContextValue {
  navHidden: boolean;
  toggleNav: () => void;
  setNavHidden: (hidden: boolean) => void;
}

const FrontendNavContext = createContext<FrontendNavContextValue | null>(null);

export function useFrontendNav(): FrontendNavContextValue {
  const context = useContext(FrontendNavContext);
  if (!context) {
    return {
      navHidden: false,
      toggleNav: () => {},
      setNavHidden: () => {},
    };
  }
  return context;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("popstate", callback);
  window.addEventListener(NAV_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("popstate", callback);
    window.removeEventListener(NAV_CHANGE_EVENT, callback);
  };
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const param = params.get("hideNav") ?? params.get("nav");
    if (param === "true" || param === "1") return true;
    if (param === "false" || param === "0") return false;

    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

export function FrontendNavProvider({ children }: { children: ReactNode }) {
  const navHidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();

  useEffect(() => {
    window.dispatchEvent(new Event(NAV_CHANGE_EVENT));
  }, [pathname]);

  const setNavHidden = useCallback((val: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(val));
    } catch {}
    window.dispatchEvent(new Event(NAV_CHANGE_EVENT));
  }, []);

  const toggleNav = useCallback(() => {
    const next = !getSnapshot();
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {}

    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("hideNav") || url.searchParams.has("nav")) {
        if (next) {
          url.searchParams.set("hideNav", "true");
        } else {
          url.searchParams.delete("hideNav");
          url.searchParams.delete("nav");
        }
        window.history.replaceState(null, "", url.toString());
      }
    } catch {}

    window.dispatchEvent(new Event(NAV_CHANGE_EVENT));
  }, []);

  // Keyboard shortcut: Alt+N to toggle storefront navigation
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.key.toLowerCase() === "n") {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        toggleNav();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleNav]);

  return (
    <FrontendNavContext.Provider value={{ navHidden, toggleNav, setNavHidden }}>
      {children}
    </FrontendNavContext.Provider>
  );
}
