"use client";

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "laluxury_admin_hide_nav";
const BEGINNER_MODE_KEY = "laluxury_admin_beginner_mode";
const NAV_CHANGE_EVENT = "laluxury:admin-nav-change";

interface AdminNavContextValue {
  navHidden: boolean;
  toggleNav: () => void;
  setNavHidden: (hidden: boolean) => void;
  helpOpen: boolean;
  toggleHelp: () => void;
  setHelpOpen: (open: boolean) => void;
  beginnerMode: boolean;
  toggleBeginnerMode: () => void;
  setBeginnerMode: (enabled: boolean) => void;
}

const AdminNavContext = createContext<AdminNavContextValue | null>(null);

export function useAdminNav(): AdminNavContextValue {
  const context = useContext(AdminNavContext);
  if (!context) {
    return {
      navHidden: false,
      toggleNav: () => {},
      setNavHidden: () => {},
      helpOpen: false,
      toggleHelp: () => {},
      setHelpOpen: () => {},
      beginnerMode: true,
      toggleBeginnerMode: () => {},
      setBeginnerMode: () => {},
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

function getSnapshot(defaultHidden = false): boolean {
  if (typeof window === "undefined") return defaultHidden;
  try {
    const params = new URLSearchParams(window.location.search);
    const param = params.get("hideNav") ?? params.get("nav");
    if (param === "true" || param === "1") return true;
    if (param === "false" || param === "0") return false;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === "true";
    return defaultHidden;
  } catch {
    return defaultHidden;
  }
}

export function AdminNavProvider({
  children,
  defaultHidden = false,
}: {
  children: ReactNode;
  defaultHidden?: boolean;
}) {
  const getSnapshotWithDefault = useCallback(
    () => getSnapshot(defaultHidden),
    [defaultHidden],
  );
  const getServerSnapshotWithDefault = useCallback(
    () => defaultHidden,
    [defaultHidden],
  );

  const navHidden = useSyncExternalStore(
    subscribe,
    getSnapshotWithDefault,
    getServerSnapshotWithDefault,
  );
  const pathname = usePathname();

  const [helpOpen, setHelpOpen] = useState(false);
  const [beginnerMode, setBeginnerModeState] = useState(true);

  // Initialize beginner mode from localStorage on mount (defaults to true for friendly guidance)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(BEGINNER_MODE_KEY);
      if (stored !== null) {
        setBeginnerModeState(stored === "true");
      }
    } catch {}
  }, []);

  const setBeginnerMode = useCallback((enabled: boolean) => {
    setBeginnerModeState(enabled);
    try {
      localStorage.setItem(BEGINNER_MODE_KEY, String(enabled));
    } catch {}
  }, []);

  const toggleBeginnerMode = useCallback(() => {
    setBeginnerModeState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(BEGINNER_MODE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const toggleHelp = useCallback(() => {
    setHelpOpen((prev) => !prev);
  }, []);

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
    const next = !getSnapshot(defaultHidden);
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
  }, [defaultHidden]);

  // Keyboard shortcut: Ctrl+B or Cmd+B to toggle admin sidebar
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
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
    <AdminNavContext.Provider
      value={{
        navHidden,
        toggleNav,
        setNavHidden,
        helpOpen,
        toggleHelp,
        setHelpOpen,
        beginnerMode,
        toggleBeginnerMode,
        setBeginnerMode,
      }}
    >
      {children}
    </AdminNavContext.Provider>
  );
}
