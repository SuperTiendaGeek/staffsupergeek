"use client";

import { animate, stagger } from "animejs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cog,
  DollarSign,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Package,
  PackageCheck,
  ReceiptText,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { isAdministratorRole } from "@/lib/apps";
import type { StaffApp } from "@/lib/apps";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type StaffAppFrameProps = {
  children: React.ReactNode;
  activeHref?: string;
  sectionLabel?: string;
  headerSubtitle?: string;
  user?: SessionUser | null;
  apps: StaffApp[];
};

const SIDEBAR_PINNED_STORAGE_KEY = "supergeek.staff.sidebar.pinned";

const appIconById: Partial<Record<string, LucideIcon>> = {
  cotizaciones: FileText,
  pedidos: ReceiptText,
  shipping: PackageCheck,
  horarios: CalendarClock,
  tecnicos: Wrench,
  usuarios: Users,
  finanzas: DollarSign,
  facturacion: FileText,
};

type SubNavItem = { href: string; label: string; icon: LucideIcon };

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  subItems?: SubNavItem[];
};

const tecnicosSubItems: SubNavItem[] = [
  { href: "/tecnicos/ordenes", label: "Órdenes", icon: ClipboardList },
  { href: "/tecnicos/clientes", label: "Clientes", icon: UserRound },
  { href: "/tecnicos/catalogo-repuestos", label: "Repuestos", icon: Package },
  { href: "/tecnicos/catalogo-servicios", label: "Servicios", icon: Cog },
  { href: "/tecnicos/productos-digitales", label: "Productos Digitales", icon: KeyRound },
];

function buildNavItems(apps: StaffApp[]): NavItem[] {
  return [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ...apps.map((app) => ({
      href: app.route,
      label: app.id === "shipping" ? "Shipping V2" : app.name,
      icon: appIconById[app.id] ?? LayoutDashboard,
      subItems: app.id === "tecnicos" ? tecnicosSubItems : undefined,
    })),
  ];
}

function initials(name?: string) {
  return (name || "Staff SUPER GEEK")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SG";
}

function StaffLogo({ showText = true }: { showText?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={cn("flex items-center", showText ? "gap-3" : "justify-center")}
      aria-label="Ir al dashboard"
      title="Portal Staff"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#D7FF4F]/35 bg-[#D7FF4F] text-sm font-black text-[#10110E] shadow-glow">
        SG
      </div>
      <div
        className={cn(
          "min-w-0 overflow-hidden transition-all duration-200 ease-out",
          showText ? "ml-0 max-w-40 opacity-100" : "max-w-0 opacity-0"
        )}
      >
        <p className="truncate text-[13px] font-black uppercase tracking-normal text-[#D7FF4F]">SUPER GEEK</p>
        <p className="truncate text-[12px] text-[#A7A7A7]">Portal Staff</p>
      </div>
    </Link>
  );
}

function NavList({ activeHref, navItems, mobile = false, expanded = true }: { activeHref?: string; navItems: NavItem[]; mobile?: boolean; expanded?: boolean }) {
  return (
    <nav className="grid gap-1" aria-label="Navegacion principal">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = activeHref ? item.href === activeHref || activeHref.startsWith(`${item.href}/`) : false;
        const showSubItems = active && !!item.subItems?.length && (expanded || mobile);

        const link = (
          <Link
            href={item.href}
            data-sidebar-nav-item
            title={!expanded ? item.label : undefined}
            aria-label={item.label}
            className={cn(
              "group flex h-10 items-center rounded-lg border text-[13px] font-semibold transition 2xl:h-11 2xl:text-sm",
              expanded || mobile ? "justify-start gap-3 px-3 2xl:px-3.5" : "justify-center gap-0 px-0",
              active
                ? "border-[#D7FF4F]/50 bg-[#D7FF4F]/12 text-[#D7FF4F] shadow-[inset_3px_0_0_rgba(215,255,79,0.9),0_0_18px_rgba(215,255,79,0.10)]"
                : "border-transparent text-[#CFCFCB] hover:border-[#3A3A36] hover:bg-[#252622] hover:text-[#F5F5F5]"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap transition-all duration-200 ease-out",
                expanded || mobile ? "max-w-44 opacity-100" : "max-w-0 opacity-0"
              )}
            >
              {item.label}
            </span>
          </Link>
        );

        const subNav = showSubItems ? (
          <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[#2F302B] pl-3">
            {item.subItems!.map((sub) => {
              const SubIcon = sub.icon;
              const subActive = activeHref === sub.href || activeHref?.startsWith(`${sub.href}/`);
              const subLink = (
                <Link
                  href={sub.href}
                  aria-label={sub.label}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-md border px-2.5 text-[12px] font-medium transition",
                    subActive
                      ? "border-[#D7FF4F]/30 bg-[#D7FF4F]/8 text-[#D7FF4F]"
                      : "border-transparent text-[#A7A7A7] hover:border-[#3A3A36] hover:bg-[#1E1F1C] hover:text-[#F5F5F5]"
                  )}
                >
                  <SubIcon className="h-3.5 w-3.5 shrink-0" />
                  {sub.label}
                </Link>
              );
              return mobile ? (
                <SheetClose key={sub.href} asChild>{subLink}</SheetClose>
              ) : (
                <div key={sub.href}>{subLink}</div>
              );
            })}
          </div>
        ) : null;

        return mobile ? (
          <div key={item.href}>
            <SheetClose asChild>{link}</SheetClose>
            {subNav}
          </div>
        ) : (
          <div key={item.href}>
            {link}
            {subNav}
          </div>
        );
      })}
    </nav>
  );
}

function StaffUserDropdown({ user }: { user?: SessionUser | null }) {
  const displayName = user?.nombre || "Staff SUPER GEEK";
  const role = user?.rol || "Staff";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 border-[#3A3A36] bg-[#181916] text-[12px] font-black text-[#D7FF4F] hover:border-[#D7FF4F]/60 hover:bg-[#252622] hover:text-[#D7FF4F] xl:h-10 xl:w-10"
          aria-label={`Cuenta de ${displayName}`}
          title={displayName}
        >
          {initials(displayName)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 border-[#30312D] bg-[#10110E] p-2 text-[#F5F5F5] shadow-2xl shadow-black/50">
        <DropdownMenuLabel className="px-2 py-2">
          <span className="block truncate text-sm font-semibold text-white">{displayName}</span>
          <span className="mt-0.5 block truncate text-xs font-medium text-[#A7A7A7]">{role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[#30312D]" />
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-[#CFCFCB] outline-none transition hover:bg-[#252622] hover:text-[#D7FF4F] focus:bg-[#252622] focus:text-[#D7FF4F]"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StaffAppFrame({ children, activeHref, sectionLabel = "Portal Staff", headerSubtitle, user, apps }: StaffAppFrameProps) {
  const isAdmin = isAdministratorRole(user?.rol);
  const navItems = buildNavItems(apps);
  const desktopSidebarRef = useRef<HTMLDivElement | null>(null);
  const [sidebarPinned, setSidebarPinned] = useState(true);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarExpanded = sidebarPinned || sidebarHovered;

  useEffect(() => {
    const sidebar = desktopSidebarRef.current;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!sidebar || prefersReducedMotion) {
      return;
    }

    const navLinks = Array.from(sidebar.querySelectorAll<HTMLElement>("[data-sidebar-nav-item]"));
    const sidebarAnimation = animate(sidebar, {
      opacity: { from: 0, to: 1 },
      x: { from: -16, to: 0 },
      duration: 420,
      ease: "outCubic",
    });
    const navAnimation = navLinks.length
      ? animate(navLinks, {
          opacity: { from: 0, to: 1 },
          x: { from: -8, to: 0 },
          delay: stagger(35, { start: 90 }),
          duration: 360,
          ease: "outCubic",
        })
      : null;

    return () => {
      sidebarAnimation.cancel();
      navAnimation?.cancel();
    };
  }, []);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(SIDEBAR_PINNED_STORAGE_KEY);

    if (storedValue === "false") {
      setSidebarPinned(false);
    } else if (storedValue === "true") {
      setSidebarPinned(true);
    }
  }, []);

  function toggleSidebarPinned() {
    setSidebarPinned((current) => {
      const nextValue = !current;
      window.localStorage.setItem(SIDEBAR_PINNED_STORAGE_KEY, String(nextValue));
      return nextValue;
    });
  }

  return (
    <main className="min-h-screen bg-[#07080A] text-[#F5F5F5]">
      <div
        ref={desktopSidebarRef}
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-[#272824] bg-[#10110E]/95 py-3 shadow-2xl shadow-black/30 backdrop-blur transition-[width,padding] duration-200 ease-out xl:block",
          sidebarExpanded ? "w-64 px-3 2xl:w-72 2xl:px-4" : "w-20 px-2"
        )}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <div className="flex h-full flex-col">
          <div className={cn("relative flex items-center py-2", sidebarExpanded ? "justify-between gap-2 px-2" : "justify-center px-0")}>
            <StaffLogo showText={sidebarExpanded} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleSidebarPinned}
              className={cn(
                "shrink-0 border-[#3A3A36] bg-[#181916] text-[#CFCFCB] shadow-lg shadow-black/20 hover:border-[#D7FF4F]/60 hover:bg-[#252622] hover:text-[#D7FF4F]",
                sidebarExpanded ? "h-8 w-8" : "absolute -right-3 top-3 h-7 w-7 rounded-full"
              )}
              aria-label={sidebarPinned ? "Colapsar sidebar" : "Fijar sidebar expandida"}
              title={sidebarPinned ? "Colapsar sidebar" : "Fijar sidebar expandida"}
            >
              {sidebarPinned ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
          <Separator className="my-3 bg-[#2F302B]" />
          <NavList activeHref={activeHref} navItems={navItems} expanded={sidebarExpanded} />
          <div
            className={cn(
              "mt-auto overflow-hidden rounded-xl border border-[#2F302B] bg-[#181916] transition-all duration-200 ease-out",
              sidebarExpanded ? "p-3" : "grid place-items-center p-2"
            )}
            title={!sidebarExpanded ? `${user?.nombre || "Staff SUPER GEEK"} · ${user?.rol || "Staff"}` : undefined}
          >
            {sidebarExpanded ? (
              <>
                <p className="text-[12px] font-bold uppercase tracking-normal text-[#D7FF4F]">Staff activo</p>
                <p className="mt-1 truncate text-sm font-semibold text-[#F5F5F5]">{user?.nombre || "Staff SUPER GEEK"}</p>
                <p className="truncate text-[13px] text-[#A7A7A7]">{user?.rol || "Staff"}</p>
              </>
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#D7FF4F]/12 text-[12px] font-black text-[#D7FF4F]">
                {initials(user?.nombre)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={cn("transition-[padding] duration-200 ease-out", sidebarPinned ? "xl:pl-64 2xl:pl-72" : "xl:pl-20")}>
        <header className="sticky top-0 z-20 border-b border-[#272824] bg-[#0B0C0E]/86 backdrop-blur-xl">
          <div className="flex h-12 items-center justify-between gap-2 px-3 sm:px-4 lg:px-5 xl:px-5 2xl:px-6">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-[#3A3A36] bg-[#181916] text-[#F5F5F5] hover:border-[#D7FF4F]/60 hover:bg-[#252622] hover:text-[#D7FF4F] xl:hidden"
                    aria-label="Abrir navegacion"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 border-[#2F302B] bg-[#10110E] p-4 text-[#F5F5F5]">
                  <SheetTitle className="sr-only">Navegacion del Portal Staff</SheetTitle>
                  <StaffLogo />
                  <Separator className="my-4 bg-[#2F302B]" />
                  <NavList activeHref={activeHref} navItems={navItems} mobile />
                </SheetContent>
              </Sheet>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold uppercase tracking-normal text-[#D7FF4F] sm:text-sm">{sectionLabel}</p>
                {headerSubtitle ? <p className="hidden truncate text-xs text-[#A7A7A7] md:block">{headerSubtitle}</p> : null}
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              {user ? <NotificationBell /> : null}
              {isAdmin ? (
                <>
                  <Button asChild variant="outline" size="icon" className="hidden h-9 w-9 border-[#3A3A36] bg-[#181916] text-[#CFCFCB] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] sm:inline-flex xl:h-10 xl:w-10" title="Usuarios">
                    <Link href="/admin/usuarios" aria-label="Usuarios">
                      <Users className="h-4 w-4 xl:h-[18px] xl:w-[18px]" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="icon" className="hidden h-9 w-9 border-[#3A3A36] bg-[#181916] text-[#CFCFCB] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] sm:inline-flex xl:h-10 xl:w-10" title="Administrar notificaciones">
                    <Link href="/admin/notificaciones" aria-label="Administrar notificaciones">
                      <Megaphone className="h-4 w-4 xl:h-[18px] xl:w-[18px]" />
                    </Link>
                  </Button>
                </>
              ) : null}
              <StaffUserDropdown user={user} />
            </div>
          </div>
        </header>

        <section className="min-h-[calc(100vh-3rem)] px-3 py-2.5 sm:px-4 lg:px-5 xl:min-h-[calc(100vh-3rem)] xl:px-5 xl:py-3 2xl:px-6">
          {children}
        </section>
      </div>
    </main>
  );
}
