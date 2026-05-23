import Link from "next/link";
import { UserMenu } from "@/components/UserMenu";
import { getSessionFromCookie } from "@/lib/session";

type PortalShellProps = {
  children: React.ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  density?: "default" | "compact";
};

export async function PortalShell({ children, eyebrow, title, description, density = "default" }: PortalShellProps) {
  const session = await getSessionFromCookie();
  const isCompact = density === "compact";

  return (
    <main className="min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
      <header className="mx-auto flex w-full max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3" aria-label="Ir al dashboard">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-geek-lime/30 bg-geek-lime text-sm font-black tracking-normal text-geek-black shadow-glow">
            SG
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold uppercase tracking-normal text-geek-lime">SUPER GEEK</p>
            <p className="truncate text-xs text-zinc-400">Portal Staff</p>
          </div>
        </Link>
        <UserMenu user={session?.user} />
      </header>

      <section className={`mx-auto flex w-full max-w-7xl flex-col items-center ${isCompact ? "min-h-[calc(100vh-5rem)] justify-start gap-6 py-6 sm:py-7" : "min-h-[calc(100vh-7rem)] justify-center gap-10 py-10 sm:py-12"}`}>
        <div className={`w-full ${isCompact ? "max-w-7xl text-left" : "max-w-3xl text-center"}`}>
          {eyebrow ? (
            <p className="mb-3 text-xs font-semibold uppercase tracking-normal text-geek-lime">{eyebrow}</p>
          ) : null}
          <h1 className={`${isCompact ? "text-3xl" : "text-3xl sm:text-4xl lg:text-5xl"} font-semibold tracking-normal text-white`}>{title}</h1>
          {description ? <p className={`${isCompact ? "mt-2 max-w-3xl" : "mx-auto mt-4 max-w-2xl"} text-base leading-7 text-zinc-300`}>{description}</p> : null}
        </div>

        {children}
      </section>
    </main>
  );
}
