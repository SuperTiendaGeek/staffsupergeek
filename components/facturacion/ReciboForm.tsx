"use client";

// Formulario de RECIBO (Fase 18 PR4) — documento interno no tributario que SÍ
// descuenta inventario y registra ingreso (como una factura), sin IVA ni SRI.
// Dedicado; reutiliza los endpoints de clientes/productos, sin tocar el
// formulario de facturas de producción.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { totalRecibo, totalLinea } from "@/lib/facturacion/recibos/calculos";
import type { LineaRecibo } from "@/lib/facturacion/recibos/types";

const FORMAS_PAGO = [
  { codigo: "01", label: "Efectivo" },
  { codigo: "16", label: "Tarjeta de débito" },
  { codigo: "19", label: "Tarjeta de crédito" },
  { codigo: "17", label: "Dinero electrónico" },
  { codigo: "18", label: "Tarjeta prepago" },
  { codigo: "20", label: "Otros (sist. financiero)" },
  { codigo: "21", label: "Endoso de títulos" },
];

type Cliente = { nombre: string; identificacion: string; correo: string; airtableId?: string };
type ClienteBusqueda = { id: string; nombre: string; cedula: string; telefono: string; correo: string; direccion: string };
type Producto = { id: string; sku: string; nombre: string; precioVenta: number; unidad: string; cantidadDisponible: number };
type Linea = LineaRecibo & { _id: string; stockDisponible?: number };

const CARD  = "rounded-xl border border-[#3A3A36] bg-[#1A1B18] p-5 mb-4";
const LABEL = "block mb-1 text-[10px] font-bold uppercase tracking-wider text-[#A7A7A7]";
const INPUT = "w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/40";

export function ReciboForm() {
  const [cliente, setCliente] = useState<Cliente>({ nombre: "", identificacion: "", correo: "" });
  const [queryCli, setQueryCli] = useState("");
  const [cliSug, setCliSug] = useState<ClienteBusqueda[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [queryProd, setQueryProd] = useState("");
  const [prodSug, setProdSug] = useState<Producto[]>([]);
  const [formaPago, setFormaPago] = useState("01");
  const [nota, setNota] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ recordId: string; numero: string } | null>(null);
  const prodRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = queryCli.trim(); if (q.length < 2) { setCliSug([]); return; }
    let cancel = false;
    const t = setTimeout(async () => { try { const r = await fetch(`/api/facturacion/clientes?q=${encodeURIComponent(q)}`); const j = await r.json(); if (!cancel && j.success) setCliSug(j.data); } catch { /* */ } }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [queryCli]);

  useEffect(() => {
    const q = queryProd.trim(); if (q.length < 2) { setProdSug([]); return; }
    let cancel = false;
    const t = setTimeout(async () => { try { const r = await fetch(`/api/facturacion/productos?q=${encodeURIComponent(q)}`); const j = await r.json(); if (!cancel && j.success) setProdSug(j.data); } catch { /* */ } }, 300);
    return () => { cancel = true; clearTimeout(t); };
  }, [queryProd]);

  const total = totalRecibo(lineas);

  function agregarProducto(p: Producto) {
    setLineas((prev) => [...prev, { _id: crypto.randomUUID(), codigo: p.sku || p.id, descripcion: p.nombre, unidadMedida: p.unidad, cantidad: 1, precioUnitario: p.precioVenta, descuento: 0, shippingItemId: p.id, stockDisponible: p.cantidadDisponible }]);
    setQueryProd(""); setProdSug([]); prodRef.current?.focus();
  }
  function agregarManual() { setLineas((prev) => [...prev, { _id: crypto.randomUUID(), codigo: "", descripcion: "", unidadMedida: "UNIDAD", cantidad: 1, precioUnitario: 0, descuento: 0 }]); }
  function actualizar(id: string, campo: keyof Linea, valor: string | number) { setLineas((prev) => prev.map((l) => (l._id === id ? { ...l, [campo]: valor } : l))); }
  function eliminar(id: string) { setLineas((prev) => prev.filter((l) => l._id !== id)); }

  async function generar() {
    setError(null);
    if (!cliente.nombre.trim()) { setError("Ingresa el nombre del cliente"); return; }
    if (lineas.length === 0) { setError("Agrega al menos un producto o servicio"); return; }
    if (lineas.some((l) => !l.descripcion.trim())) { setError("Todas las líneas deben tener descripción"); return; }
    if (lineas.some((l) => !(l.cantidad > 0) || !Number.isInteger(l.cantidad))) { setError("La cantidad debe ser un número entero mayor a 0"); return; }
    const sinStock = lineas.filter((l) => l.shippingItemId && l.stockDisponible !== undefined && l.cantidad > l.stockDisponible);
    if (sinStock.length > 0) { setError(`Sin stock: ${sinStock.map((l) => `"${l.descripcion}" (pide ${l.cantidad}, hay ${l.stockDisponible})`).join("; ")}`); return; }

    setGenerando(true);
    try {
      const r = await fetch("/api/facturacion/recibos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: { identificacion: cliente.identificacion.trim() || undefined, razonSocial: cliente.nombre.trim(), correo: cliente.correo.trim() || undefined, airtableId: cliente.airtableId },
          lineas: lineas.map(({ _id, stockDisponible, ...l }) => { void _id; void stockDisponible; return l; }),
          formaPago, nota: nota.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) setError(j.error ?? "Error al generar el recibo");
      else setResultado(j.data);
    } catch { setError("Error de red al conectar con el servidor"); }
    finally { setGenerando(false); }
  }

  if (resultado) {
    return (
      <div className="rounded-xl border border-[#6EE7B7]/40 bg-[#064E3B]/40 p-6">
        <p className="text-[#6EE7B7] font-bold text-lg mb-1">✓ Recibo {resultado.numero} generado</p>
        <p className="text-sm text-[#A7A7A7] mb-4">Documento interno no tributario. Descontó inventario y registró el ingreso (en producción).</p>
        <div className="flex flex-wrap gap-3">
          <a href={`/api/facturacion/recibos/${resultado.recordId}/pdf`} target="_blank" rel="noopener" className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] px-4 py-2 text-xs font-bold hover:brightness-105">Ver / Descargar PDF</a>
          <Link href="/facturacion/recibos" className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5] self-center">Ver todos los recibos</Link>
          <button onClick={() => { setResultado(null); setLineas([]); setCliente({ nombre: "", identificacion: "", correo: "" }); setQueryCli(""); setNota(""); }} className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">Nuevo recibo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl">
      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">1. Cliente</h2>
        <div className="relative mb-3">
          <label className={LABEL}>Buscar cliente existente (opcional)</label>
          <input value={queryCli} onChange={(e) => setQueryCli(e.target.value)} placeholder="Nombre o cédula…" className={INPUT} />
          {cliSug.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-md border border-[#3A3A36] bg-[#1A1B18] shadow-xl divide-y divide-[#2A2B28]">
              {cliSug.map((c) => (<li key={c.id}><button onClick={() => { setCliente({ nombre: c.nombre, identificacion: c.cedula, correo: c.correo, airtableId: c.id }); setQueryCli(""); setCliSug([]); }} className="w-full text-left px-4 py-2 hover:bg-[#252622] text-sm"><p className="font-semibold text-[#F5F5F5]">{c.nombre}</p><p className="text-[10px] text-[#666]">{c.cedula} · {c.correo}</p></button></li>))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className={LABEL}>Nombre / Razón social</label><input value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value, airtableId: undefined })} className={INPUT} /></div>
          <div><label className={LABEL}>Identificación (opcional)</label><input value={cliente.identificacion} onChange={(e) => setCliente({ ...cliente, identificacion: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Correo (opcional)</label><input value={cliente.correo} onChange={(e) => setCliente({ ...cliente, correo: e.target.value })} className={INPUT} /></div>
        </div>
      </div>

      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">2. Productos / servicios</h2>
        <div className="relative mb-3">
          <label className={LABEL}>Buscar producto del inventario</label>
          <input ref={prodRef} value={queryProd} onChange={(e) => setQueryProd(e.target.value)} placeholder="Nombre del producto o SKU…" className={INPUT} />
          {prodSug.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-md border border-[#3A3A36] bg-[#1A1B18] shadow-xl divide-y divide-[#2A2B28]">
              {prodSug.map((p) => (<li key={p.id}><button onClick={() => agregarProducto(p)} className="w-full text-left px-4 py-2.5 hover:bg-[#252622] text-sm"><p className="font-semibold text-[#F5F5F5]">{p.nombre}</p><p className="text-[#666] text-xs">{p.sku} · {p.unidad} · ${p.precioVenta.toFixed(2)} · stock: {p.cantidadDisponible}</p></button></li>))}
            </ul>
          )}
        </div>
        {lineas.length > 0 && (
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] text-[#666] uppercase tracking-wider border-b border-[#3A3A36]"><th className="py-2 pr-2 text-left">Descripción</th><th className="py-2 pr-2 text-right">Cant.</th><th className="py-2 pr-2 text-right">P.Unit.</th><th className="py-2 pr-2 text-right">Desc.</th><th className="py-2 pr-2 text-right">Total</th><th></th></tr></thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l._id} className="border-b border-[#2A2B28]">
                    <td className="py-1.5 pr-2"><input value={l.descripcion} onChange={(e) => actualizar(l._id, "descripcion", e.target.value)} className="w-full rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2"><input type="number" min="1" step="1" value={l.cantidad} onChange={(e) => actualizar(l._id, "cantidad", Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-14 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2"><input type="number" min="0" step="0.01" value={l.precioUnitario} onChange={(e) => actualizar(l._id, "precioUnitario", parseFloat(e.target.value) || 0)} className="w-20 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2"><input type="number" min="0" step="0.01" value={l.descuento} onChange={(e) => actualizar(l._id, "descuento", parseFloat(e.target.value) || 0)} className="w-16 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2 text-right text-xs text-[#D7FF4F] font-semibold">${totalLinea(l).toFixed(2)}</td>
                    <td className="py-1.5"><button onClick={() => eliminar(l._id)} className="text-[#666] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
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
          <div>
            <label className={LABEL}>Forma de pago</label>
            <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className={INPUT}>{FORMAS_PAGO.map((fp) => <option key={fp.codigo} value={fp.codigo}>{fp.label}</option>)}</select>
          </div>
          <div className="md:col-span-2"><label className={LABEL}>Nota (opcional, se imprime)</label><input value={nota} onChange={(e) => setNota(e.target.value)} className={INPUT} maxLength={300} /></div>
        </div>
        <div className="flex justify-end mt-4">
          <table className="text-sm"><tbody><tr><td className="pr-6 font-bold text-[#F5F5F5]">Total</td><td className="text-right font-bold text-[#D7FF4F]">${total.toFixed(2)}</td></tr></tbody></table>
        </div>
        <p className="mt-3 text-[10px] text-[#666]">El recibo descuenta inventario y registra el ingreso en caja, igual que una factura, pero sin enviarse al SRI. El efecto real solo ocurre en producción.</p>
      </div>

      {error && <p className="mb-3 text-sm text-red-300 bg-red-950/30 border border-red-500/40 rounded-lg px-4 py-3">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={generar} disabled={generando || total <= 0} className="rounded-full bg-[#D7FF4F] text-[#151515] px-6 py-3 text-sm font-bold hover:brightness-105 disabled:opacity-40">{generando ? "Generando…" : "Generar Recibo →"}</button>
        <Link href="/facturacion/recibos" className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">Ver recibos</Link>
      </div>
    </div>
  );
}
