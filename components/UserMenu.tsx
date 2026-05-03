import type { SessionUser } from "@/lib/session";

type UserMenuProps = {
  user?: SessionUser | null;
};

function getInitials(name?: string) {
  if (!name) {
    return "SG";
  }

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "SG";
}

export function UserMenu({ user }: UserMenuProps) {
  const displayName = user?.nombre || "Staff SUPER GEEK";
  const role = user?.rol || "Staff";

  return (
    <section
      aria-label="Usuario actual"
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm shadow-lg shadow-black/20 backdrop-blur md:w-auto md:min-w-80"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-geek-lime/30 bg-geek-lime/10 font-semibold text-geek-lime">
          {getInitials(displayName)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{displayName}</p>
          <p className="truncate text-xs text-zinc-400">{role}</p>
        </div>
      </div>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-geek-lime/50 hover:bg-geek-lime/10 hover:text-geek-lime"
        >
          Cerrar sesión
        </button>
      </form>
    </section>
  );
}
