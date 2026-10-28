"use client";

// Formulario de RECIBO (Fase 18 PR4) — documento interno no tributario que SÍ
// descuenta inventario y registra ingreso (como una factura), sin IVA ni SRI.
// Dedicado; reutiliza los endpoints de clientes/productos, sin tocar el
// formulario de facturas de producción.

import { Fragment, useEffect, useRef, useState } from "react";
import { AvisoNovedadVenta, cerrarNovedadesVendidas, hayAvisoPendiente, type EstadoAvisoNovedad } from "@/components/shipping-v2/novedades/AvisoNovedadVenta";
import Link from "next/link";
import { totalRecibo, totalLinea } from "@/lib/facturacion/recibos/calculos";
import type { LineaRecibo, OrigenRecibo } from "@/lib/facturacion/recibos/types";
import { mensajePrecioShippingItemInvalido } from "@/lib/facturacion/reglas/preciosShippingItems";
import { ClienteCard, CLIENTE_VACIO, type ClienteDoc } from "@/components/facturacion/ClienteCard";
import type { DatosVenta } from "@/lib/facturacion/emitirFactura";
import { descripcionDeProducto } from "@/lib/facturacion/lineaDesdeProductoCatalogo";
import {
  clienteDesdePrefactura, lineasReciboDesdePrefactura,
  abonosDesdePrefactura, type AbonoPrefill,
} from "@/lib/facturacion/gancho/prefill";
import {
  AvisoCuentaPorCobrar, PagosVentaAdicional, PagosPorMetodo, errorPagosAdicionales, nuevoPagoAdicional, type PagoAdicionalForm,
} from "@/components/facturacion/CobroDesdeOrigen";
import { codigoSriDeMetodo, mensajeCobrosInvalidos } from "@/lib/cobros/metodos";
import { etiquetaMetodoPago } from "@/types/abonos";

// Auditoría ops, punto 7: el cobro se elige por MÉTODO (con su cuenta); el
// código SRI de "Forma de Pago" lo deduce el servidor.

// Punto 10b-5: numeroSerie/seguimiento para la descripción; detalle = "S/N …" o "Lote … · más antiguo".
type Producto = { id: string; sku: string; nombre: string; precioVenta: number; unidad: string; cantidadDisponible: number; numeroSerie?: string; seguimiento?: string; detalle?: string };
type Linea = LineaRecibo & { _id: string; stockDisponible?: number };

const CARD  = "rounded-xl border border-[#3A3A36] bg-[#1A1B18] p-5 mb-4";
const LABEL = "block mb-1 text-[10px] font-bold uppercase tracking-wider text-[#A7A7A7]";
const INPUT = "w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/40";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// `prefactura` llega solo cuando el recibo se emite desde una orden/operación
// (gancho). Es la MISMA pre-factura que consume el formulario de facturas, así
// que el cliente, las líneas y los abonos son idénticos: cambiar de pestaña no
// pierde nada de lo que venía de la orden.
export function ReciboForm({ prefactura, origen, bannerOrigen, saldoPorCobrar }: {
  prefactura?:   DatosVenta | null;
  origen?:       OrigenRecibo;
  bannerOrigen?: { ordenIdVisible: string | null; operacionCodigo: string | null } | null;
  /** Auditoría ops, punto 1: lo que falta cobrar de la cuenta (servidor). */
  saldoPorCobrar?: number;
} = {}) {
  const [cliente, setCliente] = useState<ClienteDoc>(() =>
    prefactura ? clienteDesdePrefactura(prefactura) : CLIENTE_VACIO
  );
  const [lineas, setLineas] = useState<Linea[]>(() =>
    prefactura
      ? lineasReciboDesdePrefactura(prefactura).map((l) => ({ ...l, _id: crypto.randomUUID(), bloque: "cuenta" as const }))
      : []
  );
  const [queryProd, setQueryProd] = useState("");
  const [prodSug, setProdSug] = useState<Producto[]>([]);
  const [abonos] = useState<AbonoPrefill[]>(() => (prefactura ? abonosDesdePrefactura(prefactura) : []));
  // Cobros de mostrador (punto 7): método + monto + n.º de transacción.
  const [pagosMostrador, setPagosMostrador] = useState<PagoAdicionalForm[]>(() => [nuevoPagoAdicional(0)]);
  const [pagosAdicionales, setPagosAdicionales] = useState<PagoAdicionalForm[]>([]);
  const [nota, setNota] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ recordId: string; numero: string } | null>(null);
  // Punto 8b: aclaración de cómo se vende cada artículo con novedad abierta (por línea).
  const [avisosNovedad, setAvisosNovedad] = useState<Record<string, EstadoAvisoNovedad>>({});
  const avisosLineas = lineas.filter((l) => l.shippingItemId).map((l) => avisosNovedad[l._id]);
  const novedadPendiente = hayAvisoPendiente(avisosLineas);
  const prodRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = queryProd.trim(); if (q.length < 2) { setProdSug([]); return; }
    let cancel = false;
    const t = setTimeout(async () => { try { const r = await fetch(`/api/facturacion/productos?q=${encodeURIComponent(q)}`); const j = await r.json(); if (!cancel && j.success) setProdSug(j.data); } catch { /* */ } }, 300);
    return () => { cancel = true; clearTimeout(t); };
  }, [queryProd]);

  const total = totalRecibo(lineas);
  // Con origen (auditoría ops, punto 1): la cuenta llega pagada con abonos y
  // lo único que se cobra al emitir es la venta adicional.
  const sumaAbonos = round2(abonos.reduce((s, a) => s + a.total, 0));
  const totalAdicional = origen ? totalRecibo(lineas.filter((l) => l.bloque === "adicional")) : 0;
  const cuentaPorCobrar = !!origen && (saldoPorCobrar ?? 0) > 0.01;

  useEffect(() => {
    if (!origen) return;
    setPagosAdicionales((actual) => {
      if (totalAdicional <= 0.01) return actual.length ? [] : actual;
      if (actual.length === 0) return [nuevoPagoAdicional(totalAdicional)];
      if (actual.length === 1 && actual[0].total !== totalAdicional) return [{ ...actual[0], total: totalAdicional }];
      return actual;
    });
  }, [origen, totalAdicional]);

  // Un solo cobro de mostrador sigue al total del recibo.
  useEffect(() => {
    if (origen) return;
    setPagosMostrador((actual) =>
      actual.length === 1 && Math.abs(actual[0].total - total) > 0.005 ? [{ ...actual[0], total }] : actual
    );
  }, [origen, total]);

  function agregarProducto(p: Producto) {
    setLineas((prev) => [...prev, { _id: crypto.randomUUID(), codigo: p.sku || p.id, descripcion: descripcionDeProducto(p), unidadMedida: p.unidad, cantidad: 1, precioUnitario: p.precioVenta, descuento: 0, shippingItemId: p.id, stockDisponible: p.cantidadDisponible, ...(origen ? { bloque: "adicional" as const } : {}) }]);
    setQueryProd(""); setProdSug([]); prodRef.current?.focus();
  }
  function agregarManual() { setLineas((prev) => [...prev, { _id: crypto.randomUUID(), codigo: "", descripcion: "", unidadMedida: "UNIDAD", cantidad: 1, precioUnitario: 0, descuento: 0, ...(origen ? { bloque: "adicional" as const } : {}) }]); }
  function actualizar(id: string, campo: keyof Linea, valor: string | number) { setLineas((prev) => prev.map((l) => (l._id === id ? { ...l, [campo]: valor } : l))); }
  function eliminar(id: string) { setLineas((prev) => prev.filter((l) => l._id !== id)); }

  async function generar() {
    setError(null);
    if (!cliente.esConsumidorFinal && !cliente.airtableId) { setError("Elige un cliente, crea uno nuevo o usa Consumidor Final"); return; }
    if (lineas.length === 0) { setError("Agrega al menos un producto o servicio"); return; }
    if (lineas.some((l) => !l.descripcion.trim())) { setError("Todas las líneas deben tener descripción"); return; }
    if (lineas.some((l) => !(l.cantidad > 0) || !Number.isInteger(l.cantidad))) { setError("La cantidad debe ser un número entero mayor a 0"); return; }
    if (lineas.some((l) => l.precioUnitario < 0)) { setError("El precio no puede ser negativo"); return; }
    const errPrecioShipping = mensajePrecioShippingItemInvalido(lineas);
    if (errPrecioShipping) { setError(errPrecioShipping); return; }
    if (!origen) {
      const errCobro = mensajeCobrosInvalidos(pagosMostrador, total, "el recibo");
      if (errCobro) { setError(errCobro); return; }
    }
    if (origen) {
      if (cuentaPorCobrar) { setError(`Falta cobrar $${(saldoPorCobrar ?? 0).toFixed(2)} de la cuenta. Registra el pago (botón de arriba) antes de emitir.`); return; }
      const errAdicional = errorPagosAdicionales(pagosAdicionales, totalAdicional);
      if (errAdicional) { setError(errAdicional); return; }
    }
    const sinStock = lineas.filter((l) => l.shippingItemId && l.stockDisponible !== undefined && l.cantidad > l.stockDisponible);
    if (sinStock.length > 0) { setError(`Sin stock: ${sinStock.map((l) => `"${l.descripcion}" (pide ${l.cantidad}, hay ${l.stockDisponible})`).join("; ")}`); return; }
    if (novedadPendiente) { setError("Falta confirmar cómo se vende el artículo con novedad (cartel amarillo)."); return; }
    const avisosAlEmitir = avisosLineas;

    setGenerando(true);
    try {
      const r = await fetch("/api/facturacion/recibos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: { identificacion: cliente.identificacion || undefined, razonSocial: cliente.razonSocial, correo: cliente.correo || undefined, airtableId: cliente.airtableId },
          lineas: lineas.map(({ _id, stockDisponible, ...l }) => { void _id; void stockDisponible; return l; }),
          // La forma de pago (código SRI) la deduce el servidor de los cobros.
          formaPago: origen ? undefined : codigoSriDeMetodo(pagosMostrador[0]?.metodoPago) ?? "01",
          nota: nota.trim() || undefined,
          pagos: origen
            ? undefined
            : pagosMostrador.map((p) => ({
                formaPago: codigoSriDeMetodo(p.metodoPago) ?? "01", total: round2(p.total),
                metodoPago: p.metodoPago, referencia: p.referencia.trim() || undefined,
              })),
          origen,
          pagosAdicionales: origen
            ? pagosAdicionales.map((p) => ({ metodoPago: p.metodoPago, total: round2(p.total), referencia: p.referencia.trim() || undefined }))
            : undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) setError(j.error ?? "Error al generar el recibo");
      else {
        setResultado(j.data);
        // Punto 8b: solo con el recibo emitido se cierran sus novedades.
        void cerrarNovedadesVendidas("facturacion", avisosAlEmitir, `Recibo ${j.data?.numero ?? ""}`).then((aviso) => { if (aviso) setError(aviso); });
      }
    } catch { setError("Error de red al conectar con el servidor"); }
    finally { setGenerando(false); }
  }

  if (resultado) {
    return (
      <div className="rounded-xl border border-[#6EE7B7]/40 bg-[#064E3B]/40 p-6">
        {error && <p className="mb-2 rounded-lg border border-[#F0C75E]/40 bg-[#F0C75E]/10 px-3 py-2 text-xs text-[#F0C75E]">⚠ {error}</p>}
        <p className="text-[#6EE7B7] font-bold text-lg mb-1">✓ Recibo {resultado.numero} generado</p>
        <p className="text-sm text-[#A7A7A7] mb-4">Documento interno no tributario. Descontó inventario y registró el ingreso (en producción).</p>
        <div className="flex flex-wrap gap-3">
          <a href={`/api/facturacion/recibos/${resultado.recordId}/pdf`} target="_blank" rel="noopener" className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] px-4 py-2 text-xs font-bold hover:brightness-105">Ver / Descargar PDF</a>
          {origen?.tipo === "orden" && (
            <Link href={`/tecnicos/ordenes/${origen.recordId}`} className="rounded-full border border-[#3A3A36] px-4 py-2 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5] self-center">← Volver a la orden</Link>
          )}
          <Link href="/facturacion/recibos" className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5] self-center">Ver todos los recibos</Link>
          {!origen && (
            <button onClick={() => { setResultado(null); setLineas([]); setCliente(CLIENTE_VACIO); setNota(""); setPagosMostrador([nuevoPagoAdicional(0)]); }} className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">Nuevo recibo</button>
          )}
        </div>
      </div>
    );
  }

  const etiquetaOrigen = bannerOrigen?.ordenIdVisible ?? bannerOrigen?.operacionCodigo ?? null;

  return (
    <div className="w-full max-w-5xl">
      {origen && (
        <AvisoCuentaPorCobrar origen={origen} saldo={saldoPorCobrar ?? null} etiquetaOrigen={etiquetaOrigen} />
      )}
      <ClienteCard value={cliente} onChange={setCliente} conConsumidorFinal />

      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">2. Productos / servicios</h2>
        <div className="relative mb-3">
          <label className={LABEL}>Buscar producto del inventario</label>
          <input ref={prodRef} value={queryProd} onChange={(e) => setQueryProd(e.target.value)} placeholder="Nombre del producto o SKU…" className={INPUT} />
          {prodSug.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-md border border-[#3A3A36] bg-[#1A1B18] shadow-xl divide-y divide-[#2A2B28]">
              {prodSug.map((p) => (<li key={p.id}><button onClick={() => agregarProducto(p)} className="w-full text-left px-4 py-2.5 hover:bg-[#252622] text-sm"><p className="font-semibold text-[#F5F5F5]">{p.nombre}</p><p className="text-[#666] text-xs">{p.sku}{p.detalle ? ` · ${p.detalle}` : ""} · {p.unidad} · ${p.precioVenta.toFixed(2)} · stock: {p.cantidadDisponible}</p></button></li>))}
            </ul>
          )}
        </div>
        {lineas.length > 0 && (
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] text-[#666] uppercase tracking-wider border-b border-[#3A3A36]"><th className="py-2 pr-2 text-left">Descripción</th><th className="py-2 pr-2 text-right">Cant.</th><th className="py-2 pr-2 text-right">P.Unit.</th><th className="py-2 pr-2 text-right">Desc.</th><th className="py-2 pr-2 text-right">Total</th><th></th></tr></thead>
              <tbody>
                {lineas.map((l) => (
                  <Fragment key={l._id}>
                  {origen && l.bloque !== "adicional" ? (
                  <tr className="border-b border-[#2A2B28] bg-[#1E1F1C]">
                    <td className="py-1.5 pr-2 text-xs text-[#F5F5F5]"><span title="Viene de la cuenta. No se cambia aquí." className="mr-1.5 cursor-help text-[#666]">🔒</span>{l.descripcion}</td>
                    <td className="py-1.5 pr-2 text-right text-xs text-[#F5F5F5]">{l.cantidad}</td>
                    <td className="py-1.5 pr-2 text-right text-xs text-[#F5F5F5]">{l.precioUnitario.toFixed(2)}</td>
                    <td className="py-1.5 pr-2 text-right text-xs text-[#A7A7A7]">{l.descuento.toFixed(2)}</td>
                    <td className="py-1.5 pr-2 text-right text-xs text-[#D7FF4F] font-semibold">${totalLinea(l).toFixed(2)}</td>
                    <td></td>
                  </tr>
                  ) : (
                  <tr className={`border-b border-[#2A2B28] ${origen ? "animate-[sg-entrada_180ms_ease-out]" : ""}`}>
                    <td className="py-1.5 pr-2"><input value={l.descripcion} onChange={(e) => actualizar(l._id, "descripcion", e.target.value)} className="w-full rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2"><input type="number" min="1" step="1" value={l.cantidad} onChange={(e) => actualizar(l._id, "cantidad", Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-14 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2"><input type="number" min="0" step="0.01" value={l.precioUnitario} onChange={(e) => actualizar(l._id, "precioUnitario", parseFloat(e.target.value) || 0)} className="w-20 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2"><input type="number" min="0" step="0.01" value={l.descuento} onChange={(e) => actualizar(l._id, "descuento", parseFloat(e.target.value) || 0)} className="w-16 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2 text-right text-xs text-[#D7FF4F] font-semibold">${totalLinea(l).toFixed(2)}</td>
                    <td className="py-1.5"><button onClick={() => eliminar(l._id)} className="text-[#666] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                  )}
                  {l.shippingItemId ? (
                    <AvisoNovedadVenta modulo="facturacion" itemId={l.shippingItemId} colSpan={6} onEstado={(estado) => setAvisosNovedad((a) => ({ ...a, [l._id]: estado }))} />
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button onClick={agregarManual} className="rounded-full border border-[#3A3A36] px-3 py-1 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">+ Agregar línea manual</button>
      </div>

      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">3. Pago y total</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-3"><label className={LABEL}>Nota (opcional, se imprime)</label><input value={nota} onChange={(e) => setNota(e.target.value)} className={INPUT} maxLength={300} /></div>
        </div>
        {abonos.length > 0 && (
          <div className="mt-4 rounded-lg border border-[#3A3A36] bg-[#252622] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#A7A7A7] mb-2">Abonos ya cobrados</p>
            <ul className="flex flex-col gap-1">
              {abonos.map((a, i) => (
                <li key={i} className="flex justify-between text-xs text-[#C7C7C7]">
                  <span>{a.metodoPago ? etiquetaMetodoPago(a.metodoPago) : "Abono"}{a.fecha ? ` · ${a.fecha.slice(0, 10).split("-").reverse().join("/")}` : ""}</span>
                  <span className="text-[#F5F5F5]">${a.total.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {origen
          ? <PagosVentaAdicional total={totalAdicional} pagos={pagosAdicionales} onChange={setPagosAdicionales} />
          : <PagosPorMetodo titulo="Cobro" total={total} pagos={pagosMostrador} onChange={setPagosMostrador} />}

        <div className="flex justify-end mt-4">
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-6 font-bold text-[#F5F5F5]">Total</td><td className="text-right font-bold text-[#D7FF4F]">${total.toFixed(2)}</td></tr>
              {origen && (
                <>
                  <tr><td className="pr-6 text-[#A7A7A7]">Abonos de la cuenta</td><td className="text-right text-[#A7A7A7]">− ${sumaAbonos.toFixed(2)}</td></tr>
                  <tr><td className="pr-6 font-bold text-[#F5F5F5]">Venta adicional a cobrar ahora</td><td className="text-right font-bold text-[#D7FF4F]">${totalAdicional.toFixed(2)}</td></tr>
                </>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-[#666]">El recibo descuenta inventario y registra el ingreso en caja, igual que una factura, pero sin enviarse al SRI. El efecto real solo ocurre en producción.</p>
      </div>

      {error && <p className="mb-3 text-sm text-red-300 bg-red-950/30 border border-red-500/40 rounded-lg px-4 py-3">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={generar} disabled={generando || total <= 0 || novedadPendiente || cuentaPorCobrar} title={cuentaPorCobrar ? "Primero registra el pago de la cuenta" : novedadPendiente ? "Falta confirmar cómo se vende el artículo con novedad" : undefined} className="rounded-full bg-[#D7FF4F] text-[#151515] px-6 py-3 text-sm font-bold hover:brightness-105 disabled:opacity-40">{generando ? "Generando…" : "Generar Recibo →"}</button>
{novedadPendiente ? <span className="text-xs font-semibold text-[#F0C75E]">Confirma el cartel amarillo para generar.</span> : null}
                <Link href="/facturacion/recibos" className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">Ver recibos</Link>
      </div>
    </div>
  );
}
