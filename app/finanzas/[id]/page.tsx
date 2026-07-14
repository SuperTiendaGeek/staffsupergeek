import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdministratorRole } from "@/lib/apps";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import { AnularMovimientoButton } from "@/components/finanzas/AnularMovimientoButton";
import { fetchMovimientoConTrazabilidad } from "@/lib/finanzas/trazabilidad";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

const ALERTA_DESCUADRE_TEXTO = "El saldo de la cuenta quedó negativo al registrar este movimiento — esperado antes del go-live.";
const ALERTA_DESCUADRE_TOOLTIP = "Alerta de descuadre: el saldo de la cuenta quedó negativo al registrar este movimiento — esperado antes del go-live.";

function formatMonto(valor: number | null) {
  if (valor === null) return "—";
  return valor.toLocaleString("es-EC", { style: "currency", currency: "USD" });
}

function formatFecha(iso?: string) {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleString("es-EC", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2">
      <p className="text-[11px] uppercase tracking-normal text-[#8F908A]">{label}</p>
      <p className="mt-0.5 text-sm text-[#F5F5F5]">{value}</p>
    </div>
  );
}

export default async function MovimientoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, resultado] = await Promise.all([getSessionFromCookie(), fetchMovimientoConTrazabilidad(id)]);

  if (!resultado) notFound();
  const { movimiento, trazabilidad } = resultado;
  const esAdmin = isAdministratorRole(session?.user.rol);

  return (
    <StaffAppShell activeHref="/finanzas" sectionLabel="Finanzas">
      <div className="w-full space-y-3">
        <StaffPageHeader
          title={`Movimiento ${movimiento.movimientoId}`}
          description="Detalle completo, trazabilidad y anulación (Fase 20.3)."
          density="compact"
        />

        <Link href="/finanzas" className="text-sm text-[#A7A7A7] transition hover:text-[#F5F5F5]">
          ← Volver a Finanzas
        </Link>

        {movimiento.estado === "Anulado" ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 px-3 py-2.5 text-orange-100">
            <p className="text-sm font-semibold uppercase tracking-normal">Movimiento anulado</p>
            <p className="mt-1 text-sm leading-5 text-orange-100/85">
              {formatFecha(movimiento.fechaAnulacion)} — {movimiento.motivoAnulacion ?? "Sin motivo especificado."}
            </p>
          </section>
        ) : null}

        {movimiento.alertaDescuadre ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 px-3 py-2.5 text-orange-100">
            <p className="text-sm font-semibold uppercase tracking-normal">⚠ Alerta de descuadre</p>
            <p className="mt-1 text-sm leading-5 text-orange-100/85">{ALERTA_DESCUADRE_TEXTO}</p>
          </section>
        ) : null}

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Tipo" value={movimiento.tipo} />
          <Campo label="Categoría" value={movimiento.categoria} />
          <Campo label="Origen" value={movimiento.origen} />
          <Campo
            label="Monto"
            value={
              <>
                {formatMonto(movimiento.monto)}
                {movimiento.alertaDescuadre ? (
                  <span className="ml-1.5 text-orange-300" title={ALERTA_DESCUADRE_TOOLTIP}>
                    ⚠
                  </span>
                ) : null}
              </>
            }
          />
          {movimiento.montoBruto != null ? <Campo label="Monto Bruto" value={formatMonto(movimiento.montoBruto)} /> : null}
          {movimiento.montoNeto != null ? <Campo label="Monto Neto" value={formatMonto(movimiento.montoNeto)} /> : null}
          {movimiento.comision != null ? <Campo label="Comisión" value={formatMonto(movimiento.comision)} /> : null}
          <Campo label="Cuenta Origen" value={trazabilidad.cuentaOrigenNombre ?? "—"} />
          <Campo label="Cuenta Destino" value={trazabilidad.cuentaDestinoNombre ?? "—"} />
          <Campo label="Estado del Movimiento" value={movimiento.estado} />
          <Campo label="Estado Distribución" value={movimiento.estadoDistribucion} />
          <Campo label="Método" value={movimiento.metodo ?? "—"} />
          <Campo label="Fecha del movimiento" value={formatFecha(movimiento.fecha)} />
          <Campo label="Transacción ID" value={movimiento.transaccionId ?? "—"} />
          <Campo label="Registrado por" value={movimiento.registradoPor ?? "—"} />
          <Campo label="Fecha de creación" value={formatFecha(movimiento.fechaCreacion)} />
        </section>

        <section className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-normal text-[#8F908A]">Observación</p>
          <p className="mt-1 text-sm text-[#F5F5F5]">{movimiento.observacion ?? "—"}</p>
        </section>

        <section className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-3">
          <p className="text-[11px] uppercase tracking-normal text-[#8F908A]">Trazabilidad</p>
          <ul className="mt-2 space-y-1 text-sm text-[#F5F5F5]">
            {trazabilidad.ordenId ? (
              <li>
                Orden: <Link href={`/tecnicos/ordenes/${trazabilidad.ordenId}`} className="text-[#D7FF4F] hover:underline">#{trazabilidad.ordenCodigo}</Link>
              </li>
            ) : null}
            {trazabilidad.operacionId ? (
              <li>
                Operación: <Link href={`/operaciones/${trazabilidad.operacionId}`} className="text-[#D7FF4F] hover:underline">#{trazabilidad.operacionCodigo}</Link>
              </li>
            ) : null}
            {trazabilidad.clienteNombre ? <li>Cliente: {trazabilidad.clienteNombre}</li> : null}
            {trazabilidad.facturaNumero ? <li>Factura Electrónica: {trazabilidad.facturaNumero}</li> : null}
            {trazabilidad.pagoShippingCodigo ? <li>Pago Shipping: {trazabilidad.pagoShippingCodigo}</li> : null}
            {trazabilidad.compensaA ? (
              <li>
                Compensa a:{" "}
                <Link href={`/finanzas/${trazabilidad.compensaA.id}`} className="text-[#D7FF4F] hover:underline">
                  {trazabilidad.compensaA.movimientoId}
                </Link>
              </li>
            ) : null}
            {trazabilidad.movimientosCompensadores.length > 0 ? (
              <li>
                Compensado por:{" "}
                {trazabilidad.movimientosCompensadores.map((hijo, index) => (
                  <span key={hijo.id}>
                    {index > 0 ? ", " : ""}
                    <Link href={`/finanzas/${hijo.id}`} className="text-[#D7FF4F] hover:underline">
                      {hijo.movimientoId}
                    </Link>{" "}
                    ({hijo.tipo}, {formatMonto(hijo.monto)})
                  </span>
                ))}
              </li>
            ) : null}
            {!trazabilidad.ordenId &&
            !trazabilidad.operacionId &&
            !trazabilidad.clienteNombre &&
            !trazabilidad.facturaNumero &&
            !trazabilidad.pagoShippingCodigo &&
            !trazabilidad.compensaA &&
            trazabilidad.movimientosCompensadores.length === 0 ? (
              <li className="text-[#8F908A]">Sin referencias adicionales.</li>
            ) : null}
          </ul>
        </section>

        {esAdmin && movimiento.estado !== "Anulado" ? (
          <div className="flex justify-end">
            <AnularMovimientoButton movimientoId={movimiento.id} />
          </div>
        ) : null}
      </div>
    </StaffAppShell>
  );
}
