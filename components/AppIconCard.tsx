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
      className="group flex flex-col rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-xl shadow-black/20 outline-none transition hover:-translate-y-0.5 hover:border-[#D7FF4F]/40 hover:bg-[#2D2E2A] focus-visible:border-[#D7FF4F] focus-visible:ring-2 focus-visible:ring-[#D7FF4F]/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#D7FF4F]/25 bg-[#D7FF4F]/10 text-[#D7FF4F] transition group-hover:bg-[#D7FF4F] group-hover:text-[#10110E]">
          <AppSymbol icon={app.icon} />
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-normal ${statusStyles[app.status]}`}>
          {app.status}
        </span>
      </div>

      <div className="mt-4 flex flex-1 flex-col">
        <h2 className="text-base font-semibold text-[#F5F5F5]">{app.name}</h2>
        <p className="mt-1.5 flex-1 line-clamp-2 text-sm leading-5 text-[#A7A7A7]">{app.description}</p>
        <div className="mt-3 flex items-center justify-between border-t border-[#3A3A36] pt-3 text-sm">
          <span className={isAvailable ? "font-semibold text-[#D7FF4F]" : "text-[#A7A7A7]"}>
            {isAvailable ? "Entrar" : "Ver módulo"}
          </span>
          <span className="text-[#A7A7A7] transition group-hover:translate-x-0.5 group-hover:text-[#D7FF4F]" aria-hidden="true">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
