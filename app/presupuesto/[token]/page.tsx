import type { Metadata } from "next";
import { PresupuestoPublicoClient } from "./PresupuestoPublicoClient";

// Página PÚBLICA para que el cliente revise y apruebe su presupuesto.
// Sin login: la protege el token aleatorio. No indexable.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu presupuesto · SUPER GEEK",
  robots: { index: false, follow: false },
};

export default async function PresupuestoPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PresupuestoPublicoClient token={token} />;
}
