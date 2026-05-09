import Link from "next/link";
import { UserMenu } from "@/components/UserMenu";
import { getSessionFromCookie } from "@/lib/session";

type Props = {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export async function CotizacionesShell({ title, children, actions }: Props) {
  const session = await getSessionFromCookie();

  return (
    <main className="min-h-screen bg-[#101010] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#151515]/95 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="mx-auto flex min-h-[68px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <Link href="/dashboard" className="text-xs font-bold uppercase tracking-normal text-geek-lime">
              SUPER GEEK
            </Link>
            <p className="truncate text-base font-semibold text-white sm:text-lg">
              Cotizaciones · <span className="text-zinc-300">{title}</span>
            </p>
          </div>
          <div className="hidden md:block">
            <UserMenu user={session?.user} />
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">{title}</h1>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
        {children}
      </section>
    </main>
  );
}
