import { Sidebar } from "./Sidebar";
import { TecnicosGlobalTopBar } from "./TecnicosGlobalTopBar";
import React from "react";
import styles from "./TecnicosTheme.module.css";

type AppShellProps = {
  title: string;
  subtitle?: string;
  active?: Parameters<typeof Sidebar>[0]["active"];
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
  hideTopBar?: boolean;
};

export function AppShell({ title, active, children }: AppShellProps) {
  return (
    <div className={`${styles.theme} min-h-screen bg-[#141414] text-white`}>
      <Sidebar active={active} />
      <div className="lg:ml-[220px]">
        <TecnicosGlobalTopBar pageTitle={title} />
        <main className="w-full space-y-6 px-4 py-5 sm:px-5 lg:px-7 lg:py-6">{children}</main>
      </div>
    </div>
  );
}
