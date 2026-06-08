import { StaffAppFrame } from "@/components/staff/StaffAppFrame";
import { staffApps } from "@/lib/apps";
import React from "react";
import styles from "./TecnicosTheme.module.css";

type TecnicosActive = "ordenes" | "clientes" | "catalogo-repuestos" | "catalogo-servicios" | "configuracion";

type AppShellProps = {
  title: string;
  subtitle?: string;
  active?: TecnicosActive;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
  hideTopBar?: boolean;
};

function activeHref(active?: TecnicosActive) {
  switch (active) {
    case "clientes":
      return "/tecnicos/clientes";
    case "catalogo-repuestos":
      return "/tecnicos/catalogo-repuestos";
    case "catalogo-servicios":
      return "/tecnicos/catalogo-servicios";
    case "ordenes":
      return "/tecnicos/ordenes";
    case "configuracion":
    default:
      return "/tecnicos";
  }
}

export function AppShell({ title, subtitle, active, children, rightSlot }: AppShellProps) {
  const tecnicosApps = staffApps.filter((app) => app.id === "tecnicos");

  return (
    <StaffAppFrame activeHref={activeHref(active)} sectionLabel="Técnicos" apps={tecnicosApps}>
      <div className={`${styles.theme} space-y-4`}>
        <div className="flex flex-col gap-3 rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-normal text-[#D7FF4F]">Gestión de Reparaciones</p>
            <h1 className="mt-1 text-xl font-semibold tracking-normal text-white sm:text-2xl">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm font-medium text-zinc-400 sm:text-base">{subtitle}</p> : null}
          </div>
          {rightSlot ? <div className="flex shrink-0 flex-wrap items-center gap-2">{rightSlot}</div> : null}
        </div>
        {children}
      </div>
    </StaffAppFrame>
  );
}
