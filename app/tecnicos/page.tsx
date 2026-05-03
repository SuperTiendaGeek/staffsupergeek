import { PortalShell } from "@/components/PortalShell";

export default function TecnicosPage() {
  return (
    <PortalShell
      eyebrow="Modulo disponible"
      title="Técnicos"
      description="Placeholder inicial para la gestión de órdenes de reparación, estados, repuestos, servicios y abonos."
    >
      <section className="w-full max-w-3xl rounded-lg border border-white/10 bg-white/[0.045] p-6 text-center text-zinc-300">
        El módulo de Técnicos está listo para crecer con el flujo real de reparaciones.
      </section>
    </PortalShell>
  );
}
