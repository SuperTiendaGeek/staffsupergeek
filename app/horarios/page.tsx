import { PortalShell } from "@/components/PortalShell";

export default function HorariosPage() {
  return (
    <PortalShell
      eyebrow="Próximamente"
      title="Control de Horarios"
      description="Registro de entrada, salida al almuerzo, regreso y salida final."
    >
      <section className="w-full max-w-3xl rounded-lg border border-sky-300/20 bg-sky-300/10 p-6 text-center text-sky-100">
        Próximamente.
      </section>
    </PortalShell>
  );
}
