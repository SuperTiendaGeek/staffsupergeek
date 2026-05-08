"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type TecnicosSessionUser = {
  nombre?: string;
  email?: string;
  rol?: string;
};

type Props = {
  pageTitle: string;
};

function normalizePageTitle(title: string) {
  const cleanTitle = title.trim();

  if (!cleanTitle) return "Dashboard";
  if (cleanTitle === "Ordenes") return "Órdenes";

  return cleanTitle;
}

function getDisplayName(user: TecnicosSessionUser | null) {
  const name = user?.nombre?.trim();
  if (name) return name;

  const email = user?.email?.trim();
  if (email) return email;

  return "Usuario";
}

function getInitials(value: string) {
  const source = value.includes("@") ? value.split("@")[0] : value;
  const initials = source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "US";
}

export function TecnicosGlobalTopBar({ pageTitle }: Props) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<TecnicosSessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const currentPage = normalizePageTitle(pageTitle);
  const displayName = getDisplayName(user);
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/tecnicos/session", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { success?: boolean; user?: TecnicosSessionUser }
          | null;

        if (!cancelled && response.ok && payload?.success) {
          setUser(payload.user || null);
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-4 border-b border-zinc-900/80 bg-[#181818]/95 px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.28)] backdrop-blur sm:px-5 lg:min-h-[68px] lg:px-7">
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white sm:text-base">
          <span className="truncate">Gestión de Reparaciones</span>
          <span className="text-zinc-600">·</span>
          <span className="truncate text-zinc-300">{currentPage}</span>
        </p>
      </div>

      <div ref={menuRef} className="relative min-w-0 shrink-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="flex min-w-0 items-center gap-2 rounded-full border border-zinc-800 bg-[#121212] py-1 pl-1 pr-2.5 transition hover:border-[#e3fc02]/35 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#e3fc02]/35"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#e3fc02]/35 bg-[#e3fc02]/10 text-xs font-extrabold text-[#e3fc02]">
            {loaded ? initials : "..."}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[180px] truncate text-sm font-semibold text-white">{displayName}</span>
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`hidden h-4 w-4 shrink-0 text-zinc-500 transition sm:block ${menuOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="5 7 10 12 15 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-zinc-800 bg-[#121212] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.48)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-red-500/10 hover:text-red-200 disabled:cursor-wait disabled:opacity-70"
            >
              <span>{loggingOut ? "Cerrando..." : "Cerrar sesión"}</span>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
