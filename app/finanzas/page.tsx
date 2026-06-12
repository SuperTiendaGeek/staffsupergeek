import { StaffAppShell } from "@/components/staff/StaffAppShell";

export default function FinanzasPage() {
  return (
    <StaffAppShell activeHref="/finanzas" sectionLabel="Finanzas">
      <section className="w-full max-w-3xl rounded-lg border border-white/10 bg-white/[0.045] p-6 text-center text-zinc-300">
        El módulo de Finanzas está listo para recibir sus primeras pantallas funcionales.
      </section>
    </StaffAppShell>
  );
}
