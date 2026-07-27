"use client";

// Formulario de PROFORMA (Fase 18 PR3) — documento interno no tributario.
// Dedicado y autónomo: reutiliza los endpoints de clientes/productos y el
// cálculo de totales, pero NO toca el formulario de facturas de producción.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { calcularTotalesProforma } from "@/lib/facturacion/proformas/calculos";
import type { LineaProforma } from "@/lib/facturacion/proformas/types";
import { ClienteCard, CLIENTE_VACIO, type ClienteDoc } from "@/components/facturacion/ClienteCard";

const TARIFAS = [
  { codigo: "4", label: "15%" },
  { codigo: "2", label: "0%" },
  { codigo: "1", label: "Exento" },
  { codigo: "0", label: "No objeto" },
];

type Producto = { id: string; sku: string; nombre: string; precioVenta: number; unidad: string; cantidadDisponible: number };
type Linea = LineaProforma & { _id: string };

const CARD  = "rounded-xl border border-[#3A3A36] bg-[#1A1B18] p-5 mb-4";
const LABEL = "block mb-1 text-[10px] font-bold uppercase tracking-wider text-[#A7A7A7]";
const INPUT = "w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/40";
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function ProformaForm() {
  const [cliente, setCliente] = useState<ClienteDoc>(CLIENTE_VACIO);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [queryProd, setQueryProd] = useState("");
  const [prodSug, setProdSug] = useState<Producto[]>([]);
  const [nota, setNota] = useState("");
  const [validez, setValidez] = useState("15");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ recordId: string; numero: string } | null>(null);
  const prodRef = useRef<HTMLInputElement>(null);

  // Búsqueda de producto
  useEffect(() => {
    const q = queryProd.trim();
    if (q.length < 2) { setProdSug([]); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/facturacion/productos?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (!cancel && j.success) setProdSug(j.data);
      } catch { /* ignore */ }
    }, 300);
    return () => { cancel = true; clearTimeout(t); };
  }, [queryProd]);

  const totales = calcularTotalesProforma(lineas);

  function agregarProducto(p: Producto) {
    setLineas((prev) => [...prev, {
      _id: crypto.randomUUID(), codigo: p.sku || p.id, descripcion: p.nombre, unidadMedida: p.unidad,
      cantidad: 1, precioUnitario: p.precioVenta, descuento: 0, tarifaIva: "4",
    }]);
    setQueryProd(""); setProdSug([]); prodRef.current?.focus();
  }
  function agregarManual() {
    setLineas((prev) => [...prev, { _id: crypto.randomUUID(), codigo: "", descripcion: "", unidadMedida: "UNIDAD", cantidad: 1, precioUnitario: 0, descuento: 0, tarifaIva: "4" }]);
  }
  function actualizar(id: string, campo: keyof Linea, valor: string | number) {
    setLineas((prev) => prev.map((l) => (l._id === id ? { ...l, [campo]: valor } : l)));
  }
  function eliminar(id: string) { setLineas((prev) => prev.filter((l) => l._id !== id)); }

  async function generar() {
    setError(null);
    if (!cliente.airtableId) { setError("Elige un cliente existente o crea uno nuevo"); return; }
    if (lineas.length === 0) { setError("Agrega al menos un producto o servicio"); return; }
    if (lineas.some((l) => !l.descripcion.trim())) { setError("Todas las líneas deben tener descripción"); return; }
    if (lineas.some((l) => !(l.cantidad > 0) || l.precioUnitario < 0)) { setError("Cantidad > 0 y precio ≥ 0 en todas las líneas"); return; }

    setGenerando(true);
    try {
      const r = await fetch("/api/facturacion/proformas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: { tipoIdentificacion: cliente.tipoIdentificacion, identificacion: cliente.identificacion || "9999999999999", razonSocial: cliente.razonSocial, correo: cliente.correo || undefined, telefono: cliente.telefono || undefined, airtableId: cliente.airtableId },
          lineas: lineas.map(({ _id, ...l }) => { void _id; return l; }),
          nota: nota.trim() || undefined,
          validezDias: validez ? parseInt(validez, 10) : undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) setError(j.error ?? "Error al generar la proforma");
      else setResultado(j.data);
    } catch { setError("Error de red al conectar con el servidor"); }
    finally { setGenerando(false); }
  }

  if (resultado) {
    return (
      <div className="rounded-xl border border-[#6EE7B7]/40 bg-[#064E3B]/40 p-6">
        <p className="text-[#6EE7B7] font-bold text-lg mb-1">✓ Proforma {resultado.numero} generada</p>
        <p className="text-sm text-[#A7A7A7] mb-4">Documento interno no tributario.</p>
        <div className="flex flex-wrap gap-3">
          <a href={`/api/facturacion/proformas/${resultado.recordId}/pdf`} target="_blank" rel="noopener"
            className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] px-4 py-2 text-xs font-bold hover:brightness-105">Ver / Descargar PDF</a>
          <Link href="/facturacion/proformas" className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5] self-center">Ver todas las proformas</Link>
          <button onClick={() => { setResultado(null); setLineas([]); setCliente(CLIENTE_VACIO); setNota(""); }}
            className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">Nueva proforma</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl">
      <ClienteCard value={cliente} onChange={setCliente} />

      {/* Productos */}
      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">2. Productos / servicios</h2>
        <div className="relative mb-3">
          <label className={LABEL}>Buscar producto del inventario</label>
          <input ref={prodRef} value={queryProd} onChange={(e) => setQueryProd(e.target.value)} placeholder="Nombre del producto o SKU…" className={INPUT} />
          {prodSug.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-md border border-[#3A3A36] bg-[#1A1B18] shadow-xl divide-y divide-[#2A2B28]">
              {prodSug.map((p) => (
                <li key={p.id}>
                  <button onClick={() => agregarProducto(p)} className="w-full text-left px-4 py-2.5 hover:bg-[#252622] text-sm">
                    <p className="font-semibold text-[#F5F5F5]">{p.nombre}</p>
                    <p className="text-[#666] text-xs">{p.sku} · {p.unidad} · ${p.precioVenta.toFixed(2)} · stock: {p.cantidadDisponible}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lineas.length > 0 && (
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-[#666] uppercase tracking-wider border-b border-[#3A3A36]">
                  <th className="py-2 pr-2 text-left">Descripción</th>
                  <th className="py-2 pr-2 text-right">Cant.</th>
                  <th className="py-2 pr-2 text-right">P.Unit.</th>
                  <th className="py-2 pr-2 text-right">Desc.</th>
                  <th className="py-2 pr-2 text-center">IVA</th>
                  <th className="py-2 pr-2 text-right">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l._id} className="border-b border-[#2A2B28]">
                    <td className="py-1.5 pr-2"><input value={l.descripcion} onChange={(e) => actualizar(l._id, "descripcion", e.target.value)} className="w-full rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2"><input type="number" min="1" step="1" value={l.cantidad} onChange={(e) => actualizar(l._id, "cantidad", Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-14 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2"><input type="number" min="0" step="0.01" value={l.precioUnitario} onChange={(e) => actualizar(l._id, "precioUnitario", parseFloat(e.target.value) || 0)} className="w-20 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2"><input type="number" min="0" step="0.01" value={l.descuento} onChange={(e) => actualizar(l._id, "descuento", parseFloat(e.target.value) || 0)} className="w-16 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5]" /></td>
                    <td className="py-1.5 pr-2"><select value={l.tarifaIva} onChange={(e) => actualizar(l._id, "tarifaIva", e.target.value)} className="w-20 rounded bg-[#252622] border border-[#3A3A36] px-1 py-1 text-xs text-[#F5F5F5]">{TARIFAS.map((t) => <option key={t.codigo} value={t.codigo}>{t.label}</option>)}</select></td>
                    <td className="py-1.5 pr-2 text-right text-xs text-[#D7FF4F] font-semibold">${round2(l.cantidad * l.precioUnitario - l.descuento).toFixed(2)}</td>
                    <td className="py-1.5"><button onClick={() => eliminar(l._id)} className="text-[#666] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button onClick={agregarManual} className="rounded-full border border-[#3A3A36] px-3 py-1 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">+ Agregar línea manual</button>
      </div>

      {/* Nota y totales */}
      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">3. Nota y totales</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="md:col-span-2"><label className={LABEL}>Nota (opcional, se imprime)</label><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: Precios sujetos a disponibilidad de stock." className={INPUT} maxLength={300} /></div>
          <div><label className={LABEL}>Válida por (días)</label><input type="number" min="0" value={validez} onChange={(e) => setValidez(e.target.value)} className={INPUT} /></div>
        </div>
        <div className="flex justify-end">
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-6 text-[#A7A7A7]">Subtotal sin impuestos</td><td className="text-right text-[#F5F5F5]">${totales.totalSinImpuestos.toFixed(2)}</td></tr>
              <tr><td className="pr-6 text-[#A7A7A7]">IVA</td><td className="text-right text-[#F5F5F5]">${totales.iva.toFixed(2)}</td></tr>
              <tr><td className="pr-6 font-bold text-[#F5F5F5]">Valor total</td><td className="text-right font-bold text-[#D7FF4F]">${totales.importeTotal.toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-300 bg-red-950/30 border border-red-500/40 rounded-lg px-4 py-3">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={generar} disabled={generando || totales.importeTotal <= 0} className="rounded-full bg-[#D7FF4F] text-[#151515] px-6 py-3 text-sm font-bold hover:brightness-105 disabled:opacity-40">
          {generando ? "Generando…" : "Generar Proforma →"}
        </button>
        <Link href="/facturacion/proformas" className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">Ver proformas</Link>
      </div>
    </div>
  );
}
