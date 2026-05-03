import { PortalShell } from "@/components/PortalShell";

export default function FinanzasPage() {
  return (
    <PortalShell
      eyebrow="Modulo disponible"
      title="Finanzas"
      description="Placeholder inicial para el control de ingresos, egresos, cuentas internas y movimientos financieros."
    >
      <section className="w-full max-w-3xl rounded-lg border border-white/10 bg-white/[0.045] p-6 text-center text-zinc-300">
        El módulo de Finanzas está listo para recibir sus primeras pantallas funcionales.
      </section>
    </PortalShell>
  );
}
