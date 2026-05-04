import Link from "next/link";
import type { AppIcon, StaffApp } from "@/lib/apps";

const statusStyles: Record<StaffApp["status"], string> = {
  Disponible: "border-geek-lime/40 bg-geek-lime/10 text-geek-lime",
  Próximamente: "border-sky-300/30 bg-sky-300/10 text-sky-200",
  "En construcción": "border-amber-300/30 bg-amber-300/10 text-amber-200"
};

type IconProps = {
  icon: AppIcon;
};

function AppSymbol({ icon }: IconProps) {
  const common = "h-8 w-8";

  if (icon === "finance") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 18V9.5M10 18V6M16 18v-8m4 8V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M3 19h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "schedule") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 3v3M17 3v3M4.5 9.5h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 13v3l2 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "invoice") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 4h10a2 2 0 0 1 2 2v14l-3-1.5L13 20l-3-1.5L7 20l-2-1V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 9h6M9 13h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "shipping") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="m4.5 9 7.5 4 7.5-4M12 13v6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === "users") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.5 20a6 6 0 0 1 12 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16 11.5a3 3 0 1 0-.4-5.98M17.5 14.5A5.2 5.2 0 0 1 21 19.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m14.5 5 4.5 4.5-3 3L11.5 8l3-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m10 9.5-5.2 5.2a2.1 2.1 0 0 0 3 3L13 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17.5 15.5 20 18l-2 2-2.5-2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type AppIconCardProps = {
  app: StaffApp;
};

export function AppIconCard({ app }: AppIconCardProps) {
  const isAvailable = app.status === "Disponible";

  return (
    <Link
      href={app.route}
      aria-label={`Abrir ${app.name}`}
      className="group flex min-h-72 flex-col rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 outline-none backdrop-blur transition hover:-translate-y-1 hover:border-geek-lime/45 hover:bg-white/[0.07] hover:shadow-glow focus-visible:border-geek-lime focus-visible:ring-2 focus-visible:ring-geek-lime/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-lg border border-geek-lime/25 bg-geek-lime/10 text-geek-lime transition group-hover:bg-geek-lime group-hover:text-geek-black">
          <AppSymbol icon={app.icon} />
        </div>
        <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${statusStyles[app.status]}`}>
          {app.status}
        </span>
      </div>

      <div className="mt-8 flex flex-1 flex-col">
        <h2 className="text-xl font-semibold tracking-normal text-white">{app.name}</h2>
        <p className="mt-3 flex-1 text-sm leading-6 text-zinc-300">{app.description}</p>
        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
          <span className={isAvailable ? "font-medium text-geek-lime" : "text-zinc-400"}>
            {isAvailable ? "Entrar" : "Ver módulo"}
          </span>
          <span className="text-lg text-zinc-500 transition group-hover:translate-x-1 group-hover:text-geek-lime" aria-hidden="true">
            -&gt;
          </span>
        </div>
      </div>
    </Link>
  );
}
