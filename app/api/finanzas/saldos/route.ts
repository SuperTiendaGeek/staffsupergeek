import { NextResponse } from "next/server";
import { fetchCuentasFinancieras } from "@/lib/finanzas/cuentas";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { calcularAnticiposSinFacturar, calcularSaldoCuenta, calcularSaldoRubroCuenta } from "@/lib/finanzas/saldos";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireFinanzasSession();
  if (response) return response;

  try {
    const cuentas = await fetchCuentasFinancieras();
    const [saldosPorCuenta, anticiposSinFacturar] = await Promise.all([
      Promise.all(
        cuentas.map(async (cuenta) => {
          const [saldo, capital, utilidad, iva, repuestoExterno] = await Promise.all([
            calcularSaldoCuenta(cuenta.id),
            calcularSaldoRubroCuenta(cuenta.id, "capital"),
            calcularSaldoRubroCuenta(cuenta.id, "utilidad"),
            calcularSaldoRubroCuenta(cuenta.id, "iva"),
            calcularSaldoRubroCuenta(cuenta.id, "repuestoExterno"),
          ]);
          return {
            cuentaId: cuenta.id,
            nombre: cuenta.nombre,
            tipo: cuenta.tipo,
            activa: cuenta.activa,
            saldo,
            rubros: { capital, utilidad, iva, repuestoExterno },
          };
        })
      ),
      calcularAnticiposSinFacturar(),
    ]);

    return NextResponse.json({ success: true, data: { saldosPorCuenta, anticiposSinFacturar } });
  } catch (error) {
    console.error("Error al calcular saldos financieros:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}
