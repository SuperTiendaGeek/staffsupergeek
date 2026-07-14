import Link from "next/link";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffDataTable, StaffPageHeader, StaffStatCard } from "@/components/staff/StaffDesignSystem";
import { fetchCuentaPorNombre } from "@/lib/finanzas/cuentas";
import { listarCuadresDeCuenta } from "@/lib/finanzas/cuadres";
import { calcularReporteDiario } from "@/lib/finanzas/reporte";

export const dynamic = "force-dynamic";

function formatMonto(valor: number) {
  return valor.toLocaleString("es-EC", { style: "currency", currency: "USD" });
}

function formatFechaHora(iso: string) {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleString("es-EC", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const ORIGEN_LABEL: Record<string, string> = {
  mostrador: "Mostrador",
  ordenes: "Órdenes de reparación",
  operaciones: "Operaciones (ventas y reservas)",
  otros: "Otros ingresos",
};

const CUADRE_TONE: Record<string, string> = {
  Cuadrado: "text-[#D7FF4F]",
  Sobrante: "text-orange-300",
  Faltante: "text-orange-300",
};

function diaSiguiente(fechaYMD: string): string {
  const fecha = new Date(`${fechaYMD}T00:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  return fecha.toISOString().slice(0, 10);
}

function Desglose({ titulo, filas }: { titulo: string; filas: Array<[string, number]> }) {
  return (
    <section className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-3">
      <p className="text-[11px] uppercase tracking-normal text-[#8F908A]">{titulo}</p>
      {filas.length === 0 ? (
        <p className="mt-2 text-sm text-[#8F908A]">Sin movimientos.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-[#F5F5F5]">
          {filas.map(([label, valor]) => (
            <li key={label} className="flex items-center justify-between gap-2">
              <span className="text-[#CFCFCB]">{label}</span>
              <span className="tabular-nums">{formatMonto(valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ReporteDiarioPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const params = await searchParams;
  const fecha = params.fecha || new Date().toISOString().slice(0, 10);
  const desde = `${fecha}T00:00:00.000`;
  const hasta = `${diaSiguiente(fecha)}T00:00:00.000`;

  let error = "";
  let reporte: Awaited<ReturnType<typeof calcularReporteDiario>> | null = null;
  let historialCuadres: Awaited<ReturnType<typeof listarCuadresDeCuenta>> = [];

  try {
    reporte = await calcularReporteDiario({ desde, hasta });
    const caja = await fetchCuentaPorNombre("Caja Registradora");
    if (caja) historialCuadres = await listarCuadresDeCuenta(caja.id, 20);
  } catch (loadError) {
    console.error("Error al cargar el reporte diario:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar el reporte diario.";
  }

  return (
    <StaffAppShell activeHref="/finanzas" sectionLabel="Finanzas">
      <div className="w-full space-y-3">
        <StaffPageHeader title="Reporte del día" description="Cuánto entró, salió, se movió internamente, y cuánto debería haber ahora." density="compact" />

        <Link href="/finanzas" className="text-sm text-[#A7A7A7] transition hover:text-[#F5F5F5]">
          ← Volver a Finanzas
        </Link>

        <form method="GET" className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[#CFCFCB]">
            Fecha
            <input
              type="date"
              name="fecha"
              defaultValue={fecha}
              className="rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-1.5 text-sm text-[#F5F5F5]"
            />
          </label>
          <button type="submit" className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-sm text-[#CFCFCB] transition hover:text-[#F5F5F5]">
            Ver
          </button>
        </form>

        {error ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 px-3 py-2.5 text-orange-100">
            <p className="text-sm font-semibold uppercase tracking-normal">Reporte no disponible</p>
            <p className="mt-1 text-sm leading-5 text-orange-100/85">{error}</p>
          </section>
        ) : null}

        {reporte ? (
          <>
            <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <StaffStatCard label="Ingresos del día" value={formatMonto(reporte.ingresos.total)} tone="lime" featured />
              <StaffStatCard label="Egresos del día" value={formatMonto(reporte.egresos.total)} tone="orange" />
              <StaffStatCard
                label="Ajustes y comisiones"
                value={formatMonto(reporte.ajustes.total)}
                tone={reporte.ajustes.total < 0 ? "orange" : "lime"}
              />
              <StaffStatCard label="Saldo Caja actual" value={formatMonto(reporte.saldoCajaActual)} tone={reporte.saldoCajaActual < 0 ? "orange" : "lime"} />
            </section>

            <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <StaffStatCard label="Anticipos sin facturar" value={formatMonto(reporte.anticiposSinFacturar)} tone="yellow" density="compact" />
              <StaffStatCard label="Por acreditar" value={formatMonto(reporte.porAcreditar)} tone="yellow" density="compact" />
              <div>
                <StaffStatCard
                  label="Cuadre del día"
                  value={reporte.cuadreDelDia ? reporte.cuadreDelDia.estado : "Sin cuadre"}
                  tone={reporte.cuadreDelDia ? (CUADRE_TONE[reporte.cuadreDelDia.estado] === "text-[#D7FF4F]" ? "lime" : "orange") : "neutral"}
                  density="compact"
                />
                {reporte.cuadreDelDia ? (
                  <p className="mt-0.5 px-1 text-[12px] text-[#A7A7A7]">Diferencia: {formatMonto(reporte.cuadreDelDia.diferencia)}</p>
                ) : null}
              </div>
            </section>

            <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Desglose
                titulo="Ingresos por origen de negocio"
                filas={(Object.entries(reporte.ingresos.porOrigenNegocio) as Array<[string, number]>).map(([k, v]) => [ORIGEN_LABEL[k] ?? k, v])}
              />
              <Desglose titulo="Ingresos por método de pago" filas={Object.entries(reporte.ingresos.porMetodo)} />
              <Desglose titulo="Egresos por categoría" filas={Object.entries(reporte.egresos.porCategoria)} />
              <Desglose titulo="Ajustes por categoría" filas={Object.entries(reporte.ajustes.porCategoria)} />
            </section>

            <StaffDataTable title="Movimientos internos del día" meta={`${reporte.movimientosInternos.length} registrados`} density="compact">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#3A3A36] text-left text-[12px] uppercase tracking-normal text-[#A7A7A7]">
                      <th className="px-3 py-2 font-semibold">Categoría</th>
                      <th className="px-3 py-2 font-semibold">Origen</th>
                      <th className="px-3 py-2 font-semibold">Destino</th>
                      <th className="px-3 py-2 font-semibold">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.movimientosInternos.map((mov) => (
                      <tr key={mov.id} className="border-b border-[#2A2B27] text-[#F5F5F5]">
                        <td className="px-3 py-2 whitespace-nowrap">{mov.categoria}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{mov.cuentaOrigenNombre ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{mov.cuentaDestinoNombre ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatMonto(mov.monto)}</td>
                      </tr>
                    ))}
                    {!reporte.movimientosInternos.length ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-[#A7A7A7]">
                          Sin movimientos internos este día.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </StaffDataTable>
          </>
        ) : null}

        <StaffDataTable title="Historial de cuadres — Caja Registradora" meta={`${historialCuadres.length} registrados`} density="compact">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#3A3A36] text-left text-[12px] uppercase tracking-normal text-[#A7A7A7]">
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold">Esperado</th>
                  <th className="px-3 py-2 font-semibold">Contado</th>
                  <th className="px-3 py-2 font-semibold">Diferencia</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="px-3 py-2 font-semibold">Ajuste</th>
                  <th className="px-3 py-2 font-semibold">Realizado por</th>
                </tr>
              </thead>
              <tbody>
                {historialCuadres.map((c) => (
                  <tr key={c.id} className="border-b border-[#2A2B27] text-[#F5F5F5]">
                    <td className="px-3 py-2 whitespace-nowrap">{formatFechaHora(c.fecha)}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatMonto(c.saldoEsperado)}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatMonto(c.montoContado)}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatMonto(c.diferencia)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={CUADRE_TONE[c.estado] ?? "text-[#A7A7A7]"}>{c.estado}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[#A7A7A7]">{c.estadoAjuste}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[#A7A7A7]">{c.realizadoPor ?? "—"}</td>
                  </tr>
                ))}
                {!historialCuadres.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-[#A7A7A7]">
                      Sin cuadres todavía.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </StaffDataTable>
      </div>
    </StaffAppShell>
  );
}
