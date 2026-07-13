import { NextResponse } from "next/server";
import { fetchCuentasFinancieras } from "@/lib/finanzas/cuentas";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { fetchMovimientosDeCuentaPorEstado } from "@/lib/finanzas/saldos";

export const dynamic = "force-dynamic";

// Fase 20.3 §3.6 — lista los Ingreso · Pendiente de cuentas Tipo = "Tránsito"
// (tarjeta/PayPhone), para el panel de acreditación.
export async function GET() {
  const { response } = await requireFinanzasSession();
  if (response) return response;

  try {
    const cuentas = await fetchCuentasFinancieras();
    const cuentasTransito = cuentas.filter((cuenta) => cuenta.tipo === "Tránsito");

    const listas = await Promise.all(
      cuentasTransito.map((cuenta) => fetchMovimientosDeCuentaPorEstado(cuenta.id, cuenta.fechaCorte, ["Pendiente"]))
    );

    const pendientes = listas
      .flat()
      .filter((mov) => mov.tipo === "Ingreso")
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    return NextResponse.json({ success: true, data: pendientes });
  } catch (error) {
    console.error("Error al listar pendientes por acreditar:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}
