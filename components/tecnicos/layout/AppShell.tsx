import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import React from "react";
import styles from "./TecnicosTheme.module.css";

type AppShellProps = {
  title: string;
  subtitle?: string;
  active?: Parameters<typeof Sidebar>[0]["active"];
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
};

export function AppShell({ title, subtitle, active, children, rightSlot }: AppShellProps) {
  return (
    <div className={`${styles.theme} min-h-screen bg-[#141414] text-white`}>
      <Sidebar active={active} />
      <div className="space-y-6 px-4 py-5 sm:px-5 lg:ml-[264px] lg:px-8 lg:py-8">
        <TopBar title={title} subtitle={subtitle} rightSlot={rightSlot} />
        <main className="space-y-6 w-full">{children}</main>
      </div>
    </div>
  );
}
