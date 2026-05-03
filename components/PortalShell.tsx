import Link from "next/link";
import { UserMenu } from "@/components/UserMenu";
import { getSessionFromCookie } from "@/lib/session";

type PortalShellProps = {
  children: React.ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
};

export async function PortalShell({ children, eyebrow, title, description }: PortalShellProps) {
  const session = await getSessionFromCookie();

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

      <section className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-7xl flex-col items-center justify-center gap-10 py-10 sm:py-12">
        <div className="w-full max-w-3xl text-center">
          {eyebrow ? (
            <p className="mb-3 text-xs font-semibold uppercase tracking-normal text-geek-lime">{eyebrow}</p>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl lg:text-5xl">{title}</h1>
          {description ? <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-zinc-300">{description}</p> : null}
        </div>

        {children}
      </section>
    </main>
  );
}
