import Link from "next/link";
import { isAdministratorRole } from "@/lib/apps";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffDataTable, StaffPageHeader, StaffStatCard } from "@/components/staff/StaffDesignSystem";
import { FinanzasAcciones } from "@/components/finanzas/FinanzasAcciones";
import { fetchUltimoCuadre } from "@/lib/finanzas/cuadres";
import { fetchCuentasFinancieras } from "@/lib/finanzas/cuentas";
import { listarMovimientos } from "@/lib/finanzas/movimientos";
import { calcularAnticiposSinFacturar, calcularPorAcreditarCuenta, calcularSaldoCuenta } from "@/lib/finanzas/saldos";
import { getSessionFromCookie } from "@/lib/session";
import type { Cuadre, CuentaFinanciera, Movimiento } from "@/types/finanzas";

export const dynamic = "force-dynamic";

const ALERTA_DESCUADRE_TOOLTIP = "Alerta de descuadre: el saldo de la cuenta quedó negativo al registrar este movimiento — esperado antes del go-live.";

type CuentaConSaldo = CuentaFinanciera & { saldo: number; porAcreditar: number | null };

function formatMonto(valor: number) {
  return valor.toLocaleString("es-EC", { style: "currency", currency: "USD" });
}

function formatFecha(iso: string) {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleDateString("es-EC", { year: "numeric", month: "short", day: "2-digit" });
}

function formatFechaHora(iso: string) {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleString("es-EC", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const CUADRE_TONE: Record<string, string> = {
  Cuadrado: "text-[#D7FF4F]",
  Sobrante: "text-orange-300",
  Faltante: "text-orange-300",
};

const ESTADO_TONE: Record<string, "lime" | "yellow" | "orange" | "neutral"> = {
  Confirmado: "lime",
  Acreditado: "lime",
  Pendiente: "yellow",
  Anulado: "orange",
};

export default async function FinanzasPage() {
  let cuentas: CuentaConSaldo[] = [];
  let movimientos: Movimiento[] = [];
  let anticiposSinFacturar = 0;
  let preGoLive = false;
  let ultimoCuadre: Cuadre | null = null;
  let error = "";

  const session = await getSessionFromCookie();
  const esAdmin = isAdministratorRole(session?.user.rol);

  try {
    const cuentasBase = await fetchCuentasFinancieras();
    const cajaId = cuentasBase.find((c) => c.nombre === "Caja Registradora")?.id ?? null;
    const [saldos, porAcreditar, movs, anticipos, cuadre] = await Promise.all([
      Promise.all(cuentasBase.map((cuenta) => calcularSaldoCuenta(cuenta.id))),
      // Fase 20.2 §4.3 (Corrección 2) — solo tiene sentido para cuentas de
      // tránsito; el resto queda en `null` y no muestra la línea extra.
      Promise.all(cuentasBase.map((cuenta) => (cuenta.tipo === "Tránsito" ? calcularPorAcreditarCuenta(cuenta.id) : Promise.resolve(null)))),
      listarMovimientos({ maxRecords: 100 }),
      calcularAnticiposSinFacturar(),
      cajaId ? fetchUltimoCuadre(cajaId) : Promise.resolve(null),
    ]);
    cuentas = cuentasBase.map((cuenta, index) => ({ ...cuenta, saldo: saldos[index], porAcreditar: porAcreditar[index] }));
    movimientos = movs;
    anticiposSinFacturar = anticipos;
    preGoLive = cuentasBase.some((c) => c.activa && !c.fechaCorte);
    ultimoCuadre = cuadre;
  } catch (loadError) {
    console.error("Error al cargar Finanzas:", loadError);
    error =
      loadError instanceof Error
        ? loadError.message
        : "No se pudo cargar Finanzas. Si el checklist de Airtable de la Fase 20.1 todavía no se ejecutó, esto es esperado.";
  }

  return (
    <StaffAppShell activeHref="/finanzas" sectionLabel="Finanzas">
      <div className="w-full space-y-3">
        <StaffPageHeader
          title="Movimientos financieros"
          description="Fundación del sistema contable SG. Saldos calculados en código, nunca deducidos."
          density="compact"
          actions={
            <Link href="/finanzas/reporte" className="text-sm font-medium text-[#D7FF4F] transition hover:underline">
              Ver reporte diario →
            </Link>
          }
        />

        {!error ? (
          <FinanzasAcciones
            cuentas={cuentas.filter((c) => c.activa).map((c) => ({ id: c.id, nombre: c.nombre, permiteTransferirAIds: c.permiteTransferirAIds }))}
            preGoLive={preGoLive}
            esAdmin={esAdmin}
          />
        ) : null}

        {!error && preGoLive ? (
          <section className="rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2.5 text-sky-100">
            <p className="text-sm leading-5">
              El sistema contable todavía no está en vivo: faltan Saldo Inicial y Fecha de Corte en una o más cuentas antes de poder
              registrar transferencias o acreditaciones reales (Fase 20.1 §6, paso 9).
            </p>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 px-3 py-2.5 text-orange-100">
            <p className="text-sm font-semibold uppercase tracking-normal">Finanzas no disponible todavía</p>
            <p className="mt-1 text-sm leading-5 text-orange-100/85">{error}</p>
          </section>
        ) : null}

        <section className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {cuentas.map((cuenta) => (
            <div key={cuenta.id}>
              <StaffStatCard
                label={`${cuenta.nombre}${cuenta.activa ? "" : " (inactiva)"}`}
                value={formatMonto(cuenta.saldo)}
                tone={cuenta.saldo < 0 ? "orange" : "lime"}
                density="compact"
              />
              {cuenta.porAcreditar !== null && cuenta.porAcreditar > 0 ? (
                <p className="mt-0.5 px-1 text-[12px] text-yellow-200/80">{formatMonto(cuenta.porAcreditar)} por acreditar</p>
              ) : null}
              {cuenta.nombre === "Caja Registradora" && ultimoCuadre ? (
                <p className="mt-0.5 px-1 text-[12px] text-[#A7A7A7]">
                  Último cuadre: {formatFechaHora(ultimoCuadre.fecha)} —{" "}
                  <span className={CUADRE_TONE[ultimoCuadre.estado] ?? "text-[#A7A7A7]"}>{ultimoCuadre.estado}</span>{" "}
                  <Link href="/finanzas/reporte" className="underline hover:text-[#F5F5F5]">
                    Ver historial
                  </Link>
                </p>
              ) : null}
            </div>
          ))}
          <StaffStatCard label="Anticipos sin facturar" value={formatMonto(anticiposSinFacturar)} tone="yellow" density="compact" featured />
        </section>

        <StaffDataTable title="Movimientos recientes" meta={`${movimientos.length} de los últimos registrados`} density="compact">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#3A3A36] text-left text-[12px] uppercase tracking-normal text-[#A7A7A7]">
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold">Tipo</th>
                  <th className="px-3 py-2 font-semibold">Categoría</th>
                  <th className="px-3 py-2 font-semibold">Monto</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="px-3 py-2 font-semibold">Distribución</th>
                  <th className="px-3 py-2 font-semibold">Observación</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((mov) => (
                  <tr key={mov.id} className="border-b border-[#2A2B27] text-[#F5F5F5] transition hover:bg-white/5">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <a href={`/finanzas/${mov.id}`} className="block">
                        {formatFecha(mov.fecha)}
                      </a>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{mov.tipo}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{mov.categoria}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {formatMonto(mov.monto)}
                      {mov.alertaDescuadre ? (
                        <span className="ml-1.5 text-orange-300" title={ALERTA_DESCUADRE_TOOLTIP}>
                          ⚠
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-normal ${
                          ESTADO_TONE[mov.estado] === "lime"
                            ? "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]"
                            : ESTADO_TONE[mov.estado] === "yellow"
                              ? "border-yellow-300/25 bg-yellow-300/10 text-yellow-100"
                              : ESTADO_TONE[mov.estado] === "orange"
                                ? "border-orange-300/25 bg-orange-300/10 text-orange-200"
                                : "border-[#3A3A36] bg-white/5 text-[#A7A7A7]"
                        }`}
                      >
                        {mov.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[#A7A7A7]">{mov.estadoDistribucion}</td>
                    <td className="px-3 py-2 text-[#A7A7A7]">{mov.observacion ?? "—"}</td>
                  </tr>
                ))}
                {!movimientos.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-[#A7A7A7]">
                      Sin movimientos todavía.
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
