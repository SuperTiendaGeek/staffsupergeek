"use client";

// Orden de compra (auditoría Shipping V2, punto 9d · 14-oct-2026).
//
// Una compra a un proveedor con sus artículos y su pago. Aquí se ve si la
// orden está pagada o qué le falta, se registra el pago (por lo que falta, no
// se escribe el monto) y se agregan artículos olvidados. El Administrador puede
// anular un pago (anula su egreso en Finanzas) o mover un artículo de orden.
// Colores del boceto aprobado: lima = la orden, verde = el pago, amarillo = falta.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ETIQUETA_SITUACION_ORDEN, etiquetaSituacionOrden } from "@/lib/shipping-v2/ordenes-compra";
import { validarRespaldo } from "@/lib/shipping-v2/pagos-situacion";
import { SHIPPING_V2_PAYMENT_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";
import type { ShippingV2OrdenCompra } from "@/types/shipping-v2";

type Props = {
  orden: ShippingV2OrdenCompra;
  otras: Array<{ id: string; ocId: string; numeroProveedor?: string; fechaCompra?: string }>;
  puedePagar: boolean;
  puedeAgregar: boolean;
  esAdmin: boolean;
};

const METODOS = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.metodoPago.filter((m) => m !== "No aplica");
const CUENTAS = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen.filter((c) => c !== "No aplica");

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value ?? 0);
}
function fecha(value?: string) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "2-digit" });
}
function hoyLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const chip = "whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold";
const tonoSituacion: Record<ShippingV2OrdenCompra["resumen"]["situacion"], string> = {
  pagada: `${chip} border-[#7BE495]/60 text-[#9FEFB3]`,
  "falta-respaldo": `${chip} border-[#F4C95B]/60 text-[#F4C95B]`,
  falta: `${chip} border-[#F4C95B]/60 text-[#F4C95B]`,
  "sin-pago": `${chip} border-[#3A3A36] text-[#A7A7A7]`,
  vacia: `${chip} border-[#3A3A36] text-[#A7A7A7]`,
  anulada: `${chip} border-[#FF914D]/50 text-[#FFB07A]`,
};
const campo = "h-8 w-full rounded-md border border-[#3A3A36] bg-[#151515] px-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70";
const label = "mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]";
const btn = "whitespace-nowrap rounded-md border border-[#3A3A36] px-2.5 py-1 text-[12px] font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-50";
const btnPrim = "whitespace-nowrap rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1 text-[12.5px] font-black text-[#151515] transition hover:brightness-105 disabled:opacity-50";

export function OrdenCompraClient({ orden, otras, puedePagar, puedeAgregar, esAdmin }: Props) {
  const router = useRouter();
  const r = orden.resumen;
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pago, setPago] = useState({ fecha: hoyLocal(), metodo: "Transferencia bancaria", cuenta: "", transaccion: "", enlace: "" });
  const [anulando, setAnulando] = useState<{ id: string; motivo: string } | null>(null);
  const [moviendo, setMoviendo] = useState<{ id: string; destino: string; motivo: string } | null>(null);

  useEffect(() => {
    try {
      const guardado = window.sessionStorage.getItem("shipping-v2:notice");
      if (guardado) { setAviso(guardado); window.sessionStorage.removeItem("shipping-v2:notice"); }
    } catch { /* sin almacenamiento no hay aviso */ }
  }, []);

  async function enviar(url: string, body: Record<string, unknown>, ok: (data: Record<string, unknown>) => string) {
    setError("");
    setBusy(true);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !payload.success) { setError(String(payload.error || "No se pudo completar.")); return false; }
    setAviso(ok((payload.data ?? {}) as Record<string, unknown>));
    router.refresh();
    return true;
  }

  async function registrarPago() {
    const e = validarRespaldo({ fechaPagoReal: pago.fecha, metodoPago: pago.metodo, cuentaOrigen: pago.cuenta });
    if (e) { setError(e); return; }
    await enviar(`/api/shipping-v2/ordenes/${orden.id}/pago`, {
      fechaPagoReal: pago.fecha, metodoPago: pago.metodo, cuentaOrigen: pago.cuenta, transaccionId: pago.transaccion, comprobanteUrl: pago.enlace,
    }, (d) => `Pago ${String(d.pagoId ?? "")} registrado · ${money(typeof d.totalAPagar === "number" ? d.totalAPagar : r.falta)}`);
  }

  async function anularPago() {
    if (!anulando) return;
    const listo = await enviar(`/api/shipping-v2/pagos/${anulando.id}/anular`, { motivo: anulando.motivo }, (d) => {
      const avisos = Array.isArray(d.avisos) ? (d.avisos as string[]).join(" ") : "";
      return `Pago anulado; su egreso en Finanzas también.${avisos ? ` ${avisos}` : ""}`;
    });
    if (listo) setAnulando(null);
  }

  async function moverArticulo() {
    if (!moviendo) return;
    const listo = await enviar(`/api/shipping-v2/items/${moviendo.id}/orden`, { destinoOrdenId: moviendo.destino, motivo: moviendo.motivo }, (d) =>
      `${String(d.sku ?? "")} movido a ${String(d.destinoOc || "sin orden")}.`);
    if (listo) setMoviendo(null);
  }

  const vivos = orden.pagos.filter((p) => String(p.estadoPago).toLowerCase() !== "anulado");
  const pagosOrdenados = [...orden.pagos].sort((a, b) => (b.fechaPagoReal || "").localeCompare(a.fechaPagoReal || ""));
  const debe = r.falta > 0 && !orden.anulada;

  return (
    <div className="w-full space-y-2">
      {aviso ? (
        <div className="flex items-center rounded-md border border-[#D7FF4F]/30 bg-[#D7FF4F]/5 px-3 py-1.5 text-[13px] text-[#D7FF4F]">
          {aviso}<button onClick={() => setAviso("")} className="ml-auto pl-3 text-[#8F908A]" aria-label="Cerrar">×</button>
        </div>
      ) : null}
      {error ? <div className="rounded-md border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-1.5 text-[13px] text-[#FFB07A]">{error}</div> : null}

      {/* ── Cabecera (lima) ── */}
      <section className="rounded-lg border border-[#D7FF4F]/45 bg-[#171814] px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-[18px] font-black text-[#D7FF4F]">{orden.ocId}</h1>
          <span className={tonoSituacion[r.situacion]} title={ETIQUETA_SITUACION_ORDEN[r.situacion]}>{etiquetaSituacionOrden(r, money)}</span>
          <span className="text-[13px] text-[#E6E6E1]">{orden.proveedorNombre || "Sin proveedor"}</span>
          {orden.numeroProveedor ? <span className="text-[12.5px] text-[#B4B5AC]">Nº {orden.numeroProveedor}</span> : null}
          <span className="text-[12px] text-[#8F908A]">{fecha(orden.fechaCompra)}{orden.registradoPor ? ` · ${orden.registradoPor}` : ""}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {puedeAgregar && !orden.anulada ? <Link href={`/shipping-v2/items/nuevo?orden=${orden.id}`} className={btn}>+ Agregar artículo</Link> : null}
            <Link href="/shipping-v2/pagos" className={btn}>Volver a Pagos</Link>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-[#8F908A]">
          <span>Total <b className="tabular-nums text-[#F5F5F5]">{money(r.total)}</b></span>
          <span>Pagado <b className="tabular-nums text-[#9FEFB3]">{money(r.pagado)}</b></span>
          {debe ? <span>Falta <b className="tabular-nums text-[#F4C95B]">{money(r.falta)}</b></span> : null}
          <span>{r.articulos} art.{r.regalos ? ` (${r.regalos} regalo${r.regalos === 1 ? "" : "s"})` : ""}</span>
          {r.sinCosto.length ? <span className="text-[#FFB07A]">Sin costo: {r.sinCosto.join(", ")}</span> : null}
          {orden.anulada ? <span className="text-[#FFB07A]">Anulada{orden.motivoAnulacion ? `: ${orden.motivoAnulacion}` : ""}</span> : null}
        </div>
      </section>

      {/* ── Artículos (neutro) ── */}
      <section className="overflow-x-auto rounded-lg border border-[#2E2F28] bg-[#171814]">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[96px_minmax(0,1fr)_92px_120px_48px_84px_88px_92px_76px_64px] gap-2 border-b border-[#3A3A36] bg-[#1E1F19] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">
            <span>SKU</span><span>Nombre</span><span>Categoría</span><span>Llegada</span><span className="text-right">Cant.</span><span className="text-right">Costo u.</span><span className="text-right">Subtotal</span><span className="text-right" title="Proveedor + logística repartida">Costo final u.</span><span>Pago</span><span />
          </div>
          {orden.articulos.map((a) => (
            <div key={a.id} className={`border-b border-[#2A2B26] ${a.cancelado ? "opacity-50" : ""}`}>
              <div className="grid grid-cols-[96px_minmax(0,1fr)_92px_120px_48px_84px_88px_92px_76px_64px] items-center gap-2 px-2 py-1.5 text-[12.5px] text-[#B4B5AC]">
                <Link href={`/shipping-v2/items/${a.id}`} className="truncate font-semibold text-[#D7FF4F] hover:underline">{a.sku}</Link>
                <span className="truncate text-[#E6E6E1]" title={a.nombre}>
                  {a.nombre || "—"}
                  {a.usoLocal ? <span className={`ml-1.5 ${chip} border-[#8B73FF]/50 text-[#C9BFFF]`}>Activo</span> : null}
                </span>
                <span className="truncate">{a.categoria || "—"}</span>
                <span className="truncate text-[12px]" title={a.estado}>{a.packingIdVisible ? `Caja ${a.packingIdVisible}` : a.recibido ? "En tienda" : "Por llegar"}</span>
                <span className="text-right tabular-nums">{a.unidadesCompradas ?? a.cantidad ?? "?"}</span>
                <span className="text-right tabular-nums">{a.esRegalo ? "—" : money(a.costoProveedor)}</span>
                <span className="text-right tabular-nums text-[#E6E6E1]">{a.esRegalo ? <span className={`${chip} border-[#3A3A36] text-[#A7A7A7]`}>Regalo</span> : a.subtotal === null ? <span className="text-[#FFB07A]">Sin costo</span> : money(a.subtotal)}</span>
                <span className="text-right tabular-nums">{a.costoTotalUnidad ? money(a.costoTotalUnidad) : "—"}</span>
                <span>
                  {a.esRegalo || !a.requierePago ? <span className="text-[11px] text-[#6F706A]">—</span>
                    : a.enPagoVivo ? <span className={`${chip} border-[#7BE495]/50 text-[#9FEFB3]`}>Pagado</span>
                    : <span className={`${chip} border-[#F4C95B]/50 text-[#F4C95B]`}>Falta</span>}
                </span>
                <span className="text-right">
                  {esAdmin && !a.enPagoVivo && !orden.anulada ? (
                    <button onClick={() => setMoviendo(moviendo?.id === a.id ? null : { id: a.id, destino: "", motivo: "" })} className="text-[11.5px] font-semibold text-[#8F908A] hover:text-[#D7FF4F]" title="Solo Administrador: pasar a otra orden del mismo proveedor o dejar sin orden">Mover</button>
                  ) : null}
                </span>
              </div>
              {moviendo?.id === a.id ? (
                <div className="flex flex-wrap items-end gap-2 bg-[#151612] px-2 pb-2">
                  <label className="w-56"><span className={label}>Pasar a</span>
                    <select value={moviendo.destino} onChange={(e) => setMoviendo({ ...moviendo, destino: e.target.value })} className={campo}>
                      <option value="">Sin orden</option>
                      {otras.map((o) => <option key={o.id} value={o.id}>{o.ocId}{o.numeroProveedor ? ` · ${o.numeroProveedor}` : ""}</option>)}
                    </select>
                  </label>
                  <label className="min-w-[220px] flex-1"><span className={label}>Motivo</span>
                    <input value={moviendo.motivo} onChange={(e) => setMoviendo({ ...moviendo, motivo: e.target.value })} className={campo} placeholder="Se registró en la orden equivocada" />
                  </label>
                  <button disabled={busy} onClick={() => void moverArticulo()} className={btnPrim}>{busy ? "Moviendo…" : "Mover"}</button>
                  <button onClick={() => setMoviendo(null)} className={btn}>Cancelar</button>
                </div>
              ) : null}
            </div>
          ))}
          {!orden.articulos.length ? <p className="py-6 text-center text-[13px] text-[#8F908A]">Esta orden no tiene artículos.</p> : null}
        </div>
      </section>

      {/* ── Pago (verde) ── */}
      <section className="rounded-lg border border-[#7BE495]/40 bg-[#151a13] px-3 pb-3 pt-2">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#9FEFB3]">Pago</h2>
          <span className="ml-auto text-[11px] text-[#7E7F76]">{vivos.length ? `${vivos.length} pago${vivos.length === 1 ? "" : "s"}` : "Sin pagos registrados"}</span>
        </div>

        {debe && puedePagar ? (
          <div className="mb-2 rounded-md border border-[#F4C95B]/30 bg-[#F4C95B]/[0.04] p-2">
            <div className="mb-1 text-[12px] text-[#F4C95B]">{vivos.length ? "Registrar el pago de lo que falta" : "Registrar el pago de la orden"}</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-12">
              <label className="md:col-span-2"><span className={label}>Fecha</span><input type="date" value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} className={campo} /></label>
              <label className="md:col-span-2"><span className={label}>Método</span><select value={pago.metodo} onChange={(e) => setPago({ ...pago, metodo: e.target.value })} className={campo}>{METODOS.map((m) => <option key={m}>{m}</option>)}</select></label>
              <label className="md:col-span-2"><span className={label}>Cuenta</span><select value={pago.cuenta} onChange={(e) => setPago({ ...pago, cuenta: e.target.value })} className={campo}><option value="">—</option>{CUENTAS.map((c) => <option key={c} value={c}>{c.trim()}</option>)}</select></label>
              <label className="md:col-span-2"><span className={label}>Nº transacción</span><input value={pago.transaccion} onChange={(e) => setPago({ ...pago, transaccion: e.target.value })} placeholder="Opcional" className={campo} /></label>
              <label className="md:col-span-2"><span className={label}>Enlace comprobante</span><input value={pago.enlace} onChange={(e) => setPago({ ...pago, enlace: e.target.value })} placeholder="Opcional" className={campo} /></label>
              <div className="flex items-end justify-end gap-2 md:col-span-2">
                <b className="pb-1 text-[15px] tabular-nums text-[#F5F5F5]" title="Lo que falta: artículos sin pago">{money(r.falta)}</b>
                <button disabled={busy || r.sinCosto.length > 0} onClick={() => void registrarPago()} className={btnPrim} title={r.sinCosto.length ? "Hay artículos sin costo" : undefined}>{busy ? "Guardando…" : "Registrar pago"}</button>
              </div>
            </div>
          </div>
        ) : null}

        {pagosOrdenados.length ? (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[150px_84px_120px_130px_120px_96px_90px_minmax(0,1fr)_64px] gap-2 border-b border-[#2A2B26] px-1 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">
                <span>Pago</span><span>Fecha</span><span>Método</span><span>Cuenta</span><span>Comprobante</span><span className="text-right">Monto</span><span>Estado</span><span>Registró</span><span />
              </div>
              {pagosOrdenados.map((p) => {
                const anulado = String(p.estadoPago).toLowerCase() === "anulado";
                return (
                  <div key={p.id}>
                    <div className={`grid grid-cols-[150px_84px_120px_130px_120px_96px_90px_minmax(0,1fr)_64px] items-center gap-2 border-b border-[#2A2B26] px-1 py-1.5 text-[12.5px] text-[#B4B5AC] ${anulado ? "opacity-60" : ""}`}>
                      <span className={`truncate font-semibold ${anulado ? "line-through" : "text-[#F5F5F5]"}`}>{p.pagoId}</span>
                      <span>{fecha(p.fechaPagoReal)}</span>
                      <span className="truncate">{p.metodoPago && p.metodoPago !== "No aplica" ? p.metodoPago : "—"}</span>
                      <span className="truncate">{p.cuentaOrigen && p.cuentaOrigen !== "No aplica" ? p.cuentaOrigen.trim() : "—"}</span>
                      <span>{p.conComprobante ? <span className={`${chip} border-[#7BE495]/50 text-[#9FEFB3]`}>✓ {p.transaccionId || "Enlace"}</span> : <span className={`${chip} border-[#F4C95B]/50 text-[#F4C95B]`}>Sin comprobante</span>}</span>
                      <span className="text-right font-semibold tabular-nums text-[#F5F5F5]">{money(p.totalAPagar)}</span>
                      <span className="truncate" title={p.motivoAnulacion}>{anulado ? <span className="text-[#FFB07A]">Anulado</span> : p.estadoPago}</span>
                      <span className="truncate text-[12px] text-[#8F908A]">{p.registradoPor || "—"}</span>
                      <span className="text-right">
                        {esAdmin && !anulado ? (
                          <button onClick={() => setAnulando(anulando?.id === p.id ? null : { id: p.id, motivo: "" })} className="text-[11.5px] font-semibold text-[#8F908A] hover:text-[#FFB07A]" title="Solo Administrador: anula el pago y su egreso en Finanzas">Anular</button>
                        ) : null}
                      </span>
                    </div>
                    {anulando?.id === p.id ? (
                      <div className="flex flex-wrap items-end gap-2 border-b border-[#2A2B26] bg-[#FF914D]/[0.05] px-1 py-2">
                        <span className="w-full text-[12px] text-[#FFB07A]">Se anula el pago y su egreso en Finanzas. Sus artículos vuelven a &quot;Falta respaldo&quot;.</span>
                        <label className="min-w-[260px] flex-1"><span className={label}>Motivo</span>
                          <input value={anulando.motivo} onChange={(e) => setAnulando({ ...anulando, motivo: e.target.value })} className={campo} placeholder="Pago duplicado, monto equivocado…" />
                        </label>
                        <button disabled={busy} onClick={() => void anularPago()} className="whitespace-nowrap rounded-md border border-[#FF914D] bg-[#FF914D] px-3 py-1 text-[12.5px] font-black text-[#151515] disabled:opacity-50">{busy ? "Anulando…" : "Anular pago"}</button>
                        <button onClick={() => setAnulando(null)} className={btn}>Cancelar</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : !debe ? <p className="text-[12.5px] text-[#8F908A]">{r.situacion === "sin-pago" ? "Solo regalos: esta orden no lleva pago." : "—"}</p> : null}
      </section>
    </div>
  );
}
