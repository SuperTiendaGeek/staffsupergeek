import Link from "next/link";
import { isAdministratorRole } from "@/lib/apps";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffDataTable, StaffPageHeader, StaffStatCard } from "@/components/staff/StaffDesignSystem";
import { FinanzasAcciones } from "@/components/finanzas/FinanzasAcciones";
import { fetchUltimoCuadre } from "@/lib/finanzas/cuadres";
import { fetchCuentasFinancieras } from "@/lib/finanzas/cuentas";
import { listarMovimientos } from "@/lib/finanzas/movimientos";
import { calcularAnticiposSinFacturar, calcularPorAcreditarCuenta, calcularSaldoCuenta } from "@/lib/finanzas/saldos";
import { DIAS_ALERTA_PAGO_TARJETA, estaEnVentanaDeAlerta, listarEstadosTarjetas, presentarPendienteDelCorte } from "@/lib/finanzas/tarjetas";
import { getSessionFromCookie } from "@/lib/session";
import type { Cuadre, CuentaFinanciera, Movimiento, ResultadoEstadoTarjeta } from "@/types/finanzas";

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

function formatFechaCorta(iso: string) {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleDateString("es-EC", { day: "2-digit", month: "short", timeZone: "UTC" });
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
  let estadosTarjetas: ResultadoEstadoTarjeta[] = [];
  // Incluye tarjetas de crédito (a diferencia de `cuentas`, filtrada para la
  // grilla de dinero) — es lo que necesitan los selectores de cuenta de
  // movimiento manual/transferencia, donde una tarjeta sí es una cuenta
  // origen/destino válida.
  let todasLasCuentasActivas: CuentaFinanciera[] = [];
  let error = "";

  const session = await getSessionFromCookie();
  const esAdmin = isAdministratorRole(session?.user.rol);

  try {
    const cuentasBase = await fetchCuentasFinancieras();
    const cajaId = cuentasBase.find((c) => c.nombre === "Caja Registradora")?.id ?? null;
    const [saldos, porAcreditar, movs, anticipos, cuadre, tarjetas] = await Promise.all([
      Promise.all(cuentasBase.map((cuenta) => calcularSaldoCuenta(cuenta.id))),
      // Fase 20.2 §4.3 (Corrección 2) — solo tiene sentido para cuentas de
      // tránsito; el resto queda en `null` y no muestra la línea extra.
      Promise.all(cuentasBase.map((cuenta) => (cuenta.tipo === "Tránsito" ? calcularPorAcreditarCuenta(cuenta.id) : Promise.resolve(null)))),
      listarMovimientos({ maxRecords: 100 }),
      calcularAnticiposSinFacturar(),
      cajaId ? fetchUltimoCuadre(cajaId) : Promise.resolve(null),
      // Fase 20.5 — captura PreGoLiveError por tarjeta individual, no rompe la sección.
      listarEstadosTarjetas(),
    ]);
    // Las tarjetas de crédito no se muestran en la grilla de cuentas de
    // dinero (su saldo vive en negativo por diseño) — tienen su propia
    // sección abajo, presentado siempre como deuda positiva. Se resuelve
    // saldo/porAcreditar por id (no por índice posicional) para que el
    // filtro de abajo no desalinee los arreglos calculados arriba.
    const saldoPorCuentaId = new Map(cuentasBase.map((cuenta, index) => [cuenta.id, saldos[index]]));
    const porAcreditarPorCuentaId = new Map(cuentasBase.map((cuenta, index) => [cuenta.id, porAcreditar[index]]));
    cuentas = cuentasBase
      .filter((cuenta) => cuenta.tipo !== "Tarjeta de Crédito")
      .map((cuenta) => ({ ...cuenta, saldo: saldoPorCuentaId.get(cuenta.id) ?? 0, porAcreditar: porAcreditarPorCuentaId.get(cuenta.id) ?? null }));
    movimientos = movs;
    anticiposSinFacturar = anticipos;
    preGoLive = cuentasBase.some((c) => c.activa && c.tipo !== "Tarjeta de Crédito" && !c.fechaCorte);
    ultimoCuadre = cuadre;
    estadosTarjetas = tarjetas;
    todasLasCuentasActivas = cuentasBase.filter((c) => c.activa);
  } catch (loadError) {
    console.error("Error al cargar Finanzas:", loadError);
    error =
      loadError instanceof Error
        ? loadError.message
        : "No se pudo cargar Finanzas. Si el checklist de Airtable de la Fase 20.1 todavía no se ejecutó, esto es esperado.";
  }

  const tarjetasEnAlerta = estadosTarjetas.filter((t) => estaEnVentanaDeAlerta(t));

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
            cuentas={todasLasCuentasActivas.map((c) => ({ id: c.id, nombre: c.nombre, permiteTransferirAIds: c.permiteTransferirAIds }))}
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

        <p className="px-1 text-[12px] uppercase tracking-normal text-[#8F908A]">Cuentas y tránsito de pasarelas (dinero por recibir)</p>
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

        {!error && tarjetasEnAlerta.length > 0 ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 px-3 py-2.5 text-orange-100">
            <p className="text-sm font-semibold uppercase tracking-normal">Pagos de tarjeta en los próximos {DIAS_ALERTA_PAGO_TARJETA} días</p>
            <ul className="mt-1 space-y-0.5 text-sm leading-5 text-orange-100/90">
              {tarjetasEnAlerta.map((t) =>
                t.disponible ? (
                  <li key={t.cuentaId}>
                    Pagar {t.nombre}: {formatMonto(presentarPendienteDelCorte(t.estado.saldoUltimoCorte).pendiente)}
                    {t.estado.proximaFechaDePago ? ` antes del ${formatFechaCorta(t.estado.proximaFechaDePago)}` : ""}.
                  </li>
                ) : null
              )}
            </ul>
          </section>
        ) : null}

        {!error && estadosTarjetas.length > 0 ? (
          <section className="space-y-1.5">
            <p className="px-1 text-[12px] uppercase tracking-normal text-[#8F908A]">Tarjetas de crédito</p>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {estadosTarjetas.map((t) => {
                if (!t.disponible) {
                  return <StaffStatCard key={t.cuentaId} label={t.nombre} value="Pendiente de activar" tone="neutral" density="compact" />;
                }
                const { pendiente, saldoAFavor } = presentarPendienteDelCorte(t.estado.saldoUltimoCorte);
                const deudaPositiva = t.estado.deudaActual >= 0;
                return (
                  <div key={t.cuentaId}>
                    <StaffStatCard
                      label={t.nombre}
                      value={deudaPositiva ? `Deuda: ${formatMonto(t.estado.deudaActual)}` : `Saldo a favor: ${formatMonto(-t.estado.deudaActual)}`}
                      tone={deudaPositiva && t.estado.deudaActual > 0 ? "orange" : "lime"}
                      density="compact"
                    />
                    {t.estado.cupoExcedido ? (
                      <p className="mt-0.5 px-1 text-[12px] text-orange-300" title="Cupo excedido">
                        ⚠ Cupo excedido
                      </p>
                    ) : null}
                    <p className="mt-0.5 px-1 text-[12px] text-[#A7A7A7]">
                      {t.estado.fechaUltimoCorte ? (
                        <>
                          Saldo del último corte: {formatMonto(pendiente)}
                          {saldoAFavor > 0 ? ` (saldo a favor: ${formatMonto(saldoAFavor)})` : ""}
                          {t.estado.proximaFechaDePago ? ` · próximo pago ${formatFechaCorta(t.estado.proximaFechaDePago)}` : ""}
                        </>
                      ) : (
                        "Sin TC Día de Corte configurado"
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

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
