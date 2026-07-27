"use client";

// Formulario de RESERVA (apartado). Usa la tarjeta de cliente compartida
// (ClienteCard) — misma búsqueda/creación/edición que el resto de documentos.

import { useEffect, useRef, useState } from "react";
import { abonoMinimo, PLAZOS_VALIDOS } from "@/lib/facturacion/reservas/reglas";
import { ClienteCard, CLIENTE_VACIO, type ClienteDoc } from "@/components/facturacion/ClienteCard";

const FORMAS_PAGO = [
  { codigo: "01", label: "Efectivo" }, { codigo: "16", label: "Tarjeta de débito" }, { codigo: "19", label: "Tarjeta de crédito" },
  { codigo: "17", label: "Dinero electrónico" }, { codigo: "18", label: "Tarjeta prepago" }, { codigo: "20", label: "Otros (sist. financiero)" }, { codigo: "21", label: "Endoso de títulos" },
];

type Producto = { id: string; sku: string; nombre: string; precioVenta: number; unidad: string; cantidadDisponible: number };
type ItemSel = { shippingItemId: string; descripcion: string; precio: number; sku: string };

const CARD  = "rounded-xl border border-[#3A3A36] bg-[#1A1B18] p-4 mb-4";
const LABEL = "block mb-1 text-[10px] font-bold uppercase tracking-wider text-[#A7A7A7]";
const INPUT = "w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/40";
const mon = (n: number) => `$${n.toFixed(2)}`;

export function ReservaForm() {
  const [cliente, setCliente] = useState<ClienteDoc>(CLIENTE_VACIO);
  const [item, setItem] = useState<ItemSel | null>(null);
  const [queryProd, setQueryProd] = useState("");
  const [prodSug, setProdSug] = useState<Producto[]>([]);
  const [plazoDias, setPlazoDias] = useState(15);
  const [abono, setAbono] = useState("");
  const [formaPago, setFormaPago] = useState("01");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ recordId: string; numero: string; fechaLimite: string } | null>(null);
  const prodRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = queryProd.trim(); if (q.length < 2) { setProdSug([]); return; }
    let cancel = false;
    const t = setTimeout(async () => { try { const r = await fetch(`/api/facturacion/productos?q=${encodeURIComponent(q)}`); const j = await r.json(); if (!cancel && j.success) setProdSug(j.data); } catch { /* */ } }, 300);
    return () => { cancel = true; clearTimeout(t); };
  }, [queryProd]);

  const minimo = item ? abonoMinimo(item.precio) : 0;
  const montoAbono = parseFloat(abono) || 0;

  async function generar() {
    setError(null);
    if (!cliente.airtableId) { setError("Elige un cliente existente o crea uno nuevo"); return; }
    if (!item) { setError("Elige el ítem a reservar"); return; }
    if (montoAbono < minimo) { setError(`El abono inicial debe ser al menos ${mon(minimo)}`); return; }
    if (montoAbono > item.precio) { setError("El abono no puede superar el precio del ítem"); return; }

    setGenerando(true);
    try {
      const r = await fetch("/api/facturacion/reservas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: { identificacion: cliente.identificacion || undefined, razonSocial: cliente.razonSocial, correo: cliente.correo || undefined, telefono: cliente.telefono || undefined, airtableId: cliente.airtableId },
          shippingItemId: item.shippingItemId, descripcionItem: item.descripcion, precioVenta: item.precio,
          plazoDias, abonoInicial: { monto: montoAbono, formaPago },
        }),
      });
      const j = await r.json();
      if (!j.success) setError(j.error ?? "Error al crear la reserva");
      else setResultado(j.data);
    } catch { setError("Error de red al conectar con el servidor"); }
    finally { setGenerando(false); }
  }

  function reset() {
    setResultado(null); setItem(null); setCliente(CLIENTE_VACIO);
    setQueryProd(""); setAbono(""); setPlazoDias(15); setFormaPago("01");
  }

  if (resultado) {
    const fmt = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
    const wa = cliente.telefono.replace(/\D/g, "");
    return (
      <div className="rounded-xl border border-[#6EE7B7]/40 bg-[#064E3B]/40 p-6 w-full max-w-2xl">
        <p className="text-[#6EE7B7] font-bold text-lg mb-1">✓ Reserva {resultado.numero} creada</p>
        <p className="text-sm text-[#A7A7A7] mb-4">Válida hasta <b className="text-[#F5F5F5]">{fmt(resultado.fechaLimite)}</b>. El ítem quedó apartado (en producción).</p>
        <div className="flex flex-wrap gap-3">
          <a href={`/facturacion/imprimir/reserva/${resultado.recordId}`} target="_blank" rel="noopener" className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] px-4 py-2 text-xs font-bold hover:brightness-105">🖨 Imprimir 2 tickets</a>
          <a href={`/api/facturacion/reservas/${resultado.recordId}/pdf`} target="_blank" rel="noopener" className="rounded-full border border-[#3A3A36] px-4 py-2 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">↓ PDF (para WhatsApp)</a>
          {wa.length >= 9 && <a href={`https://wa.me/${wa.startsWith("0") ? "593" + wa.slice(1) : wa}`} target="_blank" rel="noopener" className="rounded-full border border-[#3A3A36] px-4 py-2 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">Abrir WhatsApp del cliente</a>}
          <button onClick={reset} className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">Nueva reserva</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl">
      <ClienteCard value={cliente} onChange={setCliente} conConsumidorFinal={false} />

      {/* Ítem */}
      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">2. Ítem a reservar</h2>
        {!item ? (
          <div className="relative">
            <label className={LABEL}>Buscar ítem del inventario</label>
            <input ref={prodRef} value={queryProd} onChange={(e) => setQueryProd(e.target.value)} placeholder="Nombre del producto o SKU…" className={INPUT} />
            {prodSug.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full rounded-md border border-[#3A3A36] bg-[#1A1B18] shadow-xl divide-y divide-[#2A2B28]">
                {prodSug.map((p) => (<li key={p.id}><button onClick={() => { setItem({ shippingItemId: p.id, descripcion: p.nombre, precio: p.precioVenta, sku: p.sku }); setQueryProd(""); setProdSug([]); }} className="w-full text-left px-4 py-2.5 hover:bg-[#252622] text-sm"><p className="font-semibold text-[#F5F5F5]">{p.nombre}</p><p className="text-[#666] text-xs">{p.sku} · {mon(p.precioVenta)} · stock: {p.cantidadDisponible}</p></button></li>))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm text-[#F5F5F5] truncate">{item.descripcion}</p>
              <p className="text-xs text-[#666]">SKU: {item.sku} · Precio: <span className="text-[#D7FF4F] font-semibold">{mon(item.precio)}</span></p>
            </div>
            <button onClick={() => setItem(null)} className="text-xs text-[#A7A7A7] underline hover:text-red-300 shrink-0">Cambiar</button>
          </div>
        )}
      </div>

      {/* Plazo y abono */}
      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">3. Plazo y abono inicial</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className={LABEL}>Plazo</label>
            <select value={plazoDias} onChange={(e) => setPlazoDias(parseInt(e.target.value, 10))} className={INPUT}>
              {PLAZOS_VALIDOS.map((d) => <option key={d} value={d}>{d} días</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Abono inicial{item ? ` (mín. ${mon(minimo)})` : ""}</label>
            <input type="number" min="0" step="0.01" value={abono} onChange={(e) => setAbono(e.target.value)} className={INPUT} placeholder="0.00" />
          </div>
          <div>
            <label className={LABEL}>Forma de pago</label>
            <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className={INPUT}>{FORMAS_PAGO.map((fp) => <option key={fp.codigo} value={fp.codigo}>{fp.label}</option>)}</select>
          </div>
        </div>
        {item && (
          <div className="mt-3 flex justify-end text-sm">
            <span className="text-[#666]">Saldo tras el abono: <span className="text-[#F5F5F5] font-semibold">{mon(Math.max(0, item.precio - montoAbono))}</span></span>
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-300 bg-red-950/30 border border-red-500/40 rounded-lg px-4 py-3">{error}</p>}
      <button onClick={generar} disabled={generando || !cliente.airtableId || !item || montoAbono < minimo} className="rounded-full bg-[#D7FF4F] text-[#151515] px-6 py-3 text-sm font-bold hover:brightness-105 disabled:opacity-40">
        {generando ? "Creando reserva…" : "Crear reserva →"}
      </button>
    </div>
  );
}
