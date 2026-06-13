import { AppIconCard } from "@/components/AppIconCard";
import type { StaffApp } from "@/lib/apps";

type AppLauncherProps = {
  apps: StaffApp[];
};

export function AppLauncher({ apps }: AppLauncherProps) {
  if (apps.length === 0) {
    return (
      <section className="w-full max-w-2xl rounded-[1.25rem] border border-[#3A3A36] bg-[#1E1F1C] p-6 text-center shadow-xl shadow-black/25">
        <h2 className="text-base font-semibold text-[#F5F5F5]">Sin aplicaciones asignadas</h2>
        <p className="mt-2 text-sm leading-5 text-[#A7A7A7]">
          Tu usuario no tiene módulos habilitados todavía. Contacta a un administrador para solicitar acceso.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Aplicaciones internas" className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {apps.map((app) => (
        <AppIconCard key={app.id} app={app} />
      ))}
    </section>
  );
}
