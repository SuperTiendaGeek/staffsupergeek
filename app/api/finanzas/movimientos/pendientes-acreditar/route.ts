import { NextResponse } from "next/server";
import { cleanString, fetchRecordById } from "@/lib/finanzas/airtable-client";
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
    const nombrePorCuenta = new Map(cuentasTransito.map((cuenta) => [cuenta.id, cuenta.nombre]));

    const listas = await Promise.all(
      cuentasTransito.map((cuenta) => fetchMovimientosDeCuentaPorEstado(cuenta.id, cuenta.fechaCorte, ["Pendiente"]))
    );

    const pendientes = listas
      .flat()
      .filter((mov) => mov.tipo === "Ingreso")
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    // Iteración de UX (Fase 20.3) — enriquecido de solo lectura para que el
    // empleado reconozca la venta desde la lista, sin abrir el detalle: la
    // cuenta de tránsito exacta y el número de factura (si ya está
    // facturada). No toca ninguna función de lib/finanzas — un fetch más
    // por pendiente, acotado a la lista (normalmente pequeña) de pagos
    // todavía no acreditados.
    const enriquecidos = await Promise.all(
      pendientes.map(async (mov) => {
        const facturaId = mov.facturaElectronicaIds[0];
        const factura = facturaId ? await fetchRecordById("Facturas Electrónicas", facturaId) : null;
        const facturaNumero = factura
          ? cleanString(factura.fields["Número de Factura"]) || cleanString(factura.fields["Clave de Acceso"]) || null
          : null;
        return {
          ...mov,
          cuentaNombre: mov.cuentaDestinoId ? (nombrePorCuenta.get(mov.cuentaDestinoId) ?? null) : null,
          facturaNumero,
        };
      })
    );

    return NextResponse.json({ success: true, data: enriquecidos });
  } catch (error) {
    console.error("Error al listar pendientes por acreditar:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}
