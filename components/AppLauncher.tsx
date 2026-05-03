import { AppIconCard } from "@/components/AppIconCard";
import type { StaffApp } from "@/lib/apps";

type AppLauncherProps = {
  apps: StaffApp[];
};

export function AppLauncher({ apps }: AppLauncherProps) {
  if (apps.length === 0) {
    return (
      <section className="w-full max-w-2xl rounded-lg border border-white/10 bg-white/[0.045] p-6 text-center shadow-2xl shadow-black/20 backdrop-blur">
        <h2 className="text-xl font-semibold text-white">Sin aplicaciones asignadas</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          Tu usuario no tiene módulos habilitados todavía. Contacta a un administrador para solicitar acceso.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Aplicaciones internas" className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {apps.map((app) => (
        <AppIconCard key={app.id} app={app} />
      ))}
    </section>
  );
}
