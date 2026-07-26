"use client";

// Formulario de RESERVA (apartado). Un ítem del inventario, un plazo (7/15/30)
// y un abono inicial. Reutiliza los buscadores de clientes/productos, sin tocar
// otros formularios.

import { useEffect, useRef, useState } from "react";
import { abonoMinimo, PLAZOS_VALIDOS } from "@/lib/facturacion/reservas/reglas";

const FORMAS_PAGO = [
  { codigo: "01", label: "Efectivo" },
  { codigo: "16", label: "Tarjeta de débito" },
  { codigo: "19", label: "Tarjeta de crédito" },
  { codigo: "17", label: "Dinero electrónico" },
  { codigo: "18", label: "Tarjeta prepago" },
  { codigo: "20", label: "Otros (sist. financiero)" },
  { codigo: "21", label: "Endoso de títulos" },
];

type Cliente = { nombre: string; identificacion: string; correo: string; telefono: string; airtableId?: string };
type ClienteBusqueda = { id: string; nombre: string; cedula: string; telefono: string; correo: string; direccion: string };
type Producto = { id: string; sku: string; nombre: string; precioVenta: number; unidad: string; cantidadDisponible: number };
type ItemSel = { shippingItemId: string; descripcion: string; precio: number; sku: string };

const CARD  = "rounded-xl border border-[#3A3A36] bg-[#1A1B18] p-4 mb-4";
const LABEL = "block mb-1 text-[10px] font-bold uppercase tracking-wider text-[#A7A7A7]";
const INPUT = "w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/40";
const mon = (n: number) => `$${n.toFixed(2)}`;

export function ReservaForm() {
  const [cliente, setCliente] = useState<Cliente>({ nombre: "", identificacion: "", correo: "", telefono: "" });
  const [queryCli, setQueryCli] = useState("");
  const [cliSug, setCliSug] = useState<ClienteBusqueda[]>([]);
  // Datos del cliente al momento de seleccionarlo de la búsqueda (para detectar
  // correcciones y ofrecer actualizar la ficha).
  const [clienteOriginal, setClienteOriginal] = useState<{ nombre: string; correo: string; telefono: string } | null>(null);
  const [actualizarFicha, setActualizarFicha] = useState(false);
  const [item, setItem] = useState<ItemSel | null>(null);
  const [queryProd, setQueryProd] = useState("");
  const [prodSug, setProdSug] = useState<Producto[]>([]);
  const [plazoDias, setPlazoDias] = useState(15);
  const [abono, setAbono] = useState("");
  const [formaPago, setFormaPago] = useState("01");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ recordId: string; numero: string; fechaLimite: string; clienteExistente?: boolean; fichaActualizada?: boolean } | null>(null);
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

  const minimo = item ? abonoMinimo(item.precio) : 0;
  const montoAbono = parseFloat(abono) || 0;
  const editado = !!cliente.airtableId && !!clienteOriginal && (
    cliente.nombre.trim() !== clienteOriginal.nombre.trim() ||
    (cliente.correo ?? "").trim() !== (clienteOriginal.correo ?? "").trim() ||
    (cliente.telefono ?? "").trim() !== (clienteOriginal.telefono ?? "").trim()
  );

  async function generar() {
    setError(null);
    if (!cliente.nombre.trim()) { setError("Ingresa el nombre del cliente"); return; }
    if (!item) { setError("Elige el ítem a reservar"); return; }
    if (montoAbono < minimo) { setError(`El abono inicial debe ser al menos ${mon(minimo)}`); return; }
    if (montoAbono > item.precio) { setError("El abono no puede superar el precio del ítem"); return; }

    setGenerando(true);
    try {
      const r = await fetch("/api/facturacion/reservas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: { identificacion: cliente.identificacion.trim() || undefined, razonSocial: cliente.nombre.trim(), correo: cliente.correo.trim() || undefined, telefono: cliente.telefono.trim() || undefined, airtableId: cliente.airtableId },
          actualizarFicha: cliente.airtableId ? actualizarFicha : undefined,
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
    setResultado(null); setItem(null); setCliente({ nombre: "", identificacion: "", correo: "", telefono: "" });
    setClienteOriginal(null); setActualizarFicha(false);
    setQueryCli(""); setQueryProd(""); setAbono(""); setPlazoDias(15); setFormaPago("01");
  }

  if (resultado) {
    const fmt = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
    const wa = cliente.telefono.replace(/\D/g, "");
    return (
      <div className="rounded-xl border border-[#6EE7B7]/40 bg-[#064E3B]/40 p-6 w-full max-w-2xl">
        <p className="text-[#6EE7B7] font-bold text-lg mb-1">✓ Reserva {resultado.numero} creada</p>
        <p className="text-sm text-[#A7A7A7] mb-2">Válida hasta <b className="text-[#F5F5F5]">{fmt(resultado.fechaLimite)}</b>. El ítem quedó apartado (en producción).</p>
        <div className="mb-4 space-y-1">
          {resultado.clienteExistente && <p className="text-xs text-yellow-300">El cliente ya existía en la base: la reserva se vinculó a su registro.</p>}
          {resultado.fichaActualizada && <p className="text-xs text-[#6EE7B7]/80">Se actualizaron los datos en la ficha del cliente.</p>}
        </div>
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
    <div className="w-full max-w-3xl">
      {/* Cliente */}
      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">1. Cliente</h2>
        <div className="relative mb-3">
          <label className={LABEL}>Buscar cliente existente (opcional)</label>
          <input value={queryCli} onChange={(e) => setQueryCli(e.target.value)} placeholder="Nombre o cédula…" className={INPUT} />
          {cliSug.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-md border border-[#3A3A36] bg-[#1A1B18] shadow-xl divide-y divide-[#2A2B28]">
              {cliSug.map((c) => (<li key={c.id}><button onClick={() => { setCliente({ nombre: c.nombre, identificacion: c.cedula, correo: c.correo, telefono: c.telefono, airtableId: c.id }); setClienteOriginal({ nombre: c.nombre, correo: c.correo, telefono: c.telefono }); setActualizarFicha(false); setQueryCli(""); setCliSug([]); }} className="w-full text-left px-4 py-2 hover:bg-[#252622] text-sm"><p className="font-semibold text-[#F5F5F5]">{c.nombre}</p><p className="text-[10px] text-[#666]">{c.cedula} · {c.telefono} · {c.correo}</p></button></li>))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className={LABEL}>Nombre / Razón social</label><input value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Identificación (opcional)</label><input value={cliente.identificacion} onChange={(e) => setCliente({ ...cliente, identificacion: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Teléfono (para la etiqueta y WhatsApp)</label><input value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} className={INPUT} placeholder="09XXXXXXXX" /></div>
          <div><label className={LABEL}>Correo (opcional)</label><input value={cliente.correo} onChange={(e) => setCliente({ ...cliente, correo: e.target.value })} className={INPUT} /></div>
        </div>
        {cliente.airtableId ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-emerald-400">✓ Cliente vinculado de la base</span>
            <button onClick={() => { setCliente({ nombre: "", identificacion: "", correo: "", telefono: "" }); setClienteOriginal(null); setActualizarFicha(false); }} className="text-[#A7A7A7] underline hover:text-red-300">quitar</button>
            {editado && (
              <label className="ml-auto flex items-center gap-2 text-[#A7A7A7] cursor-pointer">
                <input type="checkbox" checked={actualizarFicha} onChange={(e) => setActualizarFicha(e.target.checked)} className="h-3.5 w-3.5 accent-[#D7FF4F]" />
                Guardar estos cambios en la ficha del cliente
              </label>
            )}
          </div>
        ) : cliente.identificacion.trim() ? (
          <p className="mt-3 text-xs text-[#666]">Si esta cédula ya existe, la reserva se vinculará a ese cliente; si no, se creará en la base.</p>
        ) : null}
      </div>

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
          <div className="mt-3 flex justify-end gap-6 text-sm">
            <span className="text-[#666]">Saldo tras el abono: <span className="text-[#F5F5F5] font-semibold">{mon(Math.max(0, item.precio - montoAbono))}</span></span>
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-300 bg-red-950/30 border border-red-500/40 rounded-lg px-4 py-3">{error}</p>}
      <button onClick={generar} disabled={generando || !item || montoAbono < minimo} className="rounded-full bg-[#D7FF4F] text-[#151515] px-6 py-3 text-sm font-bold hover:brightness-105 disabled:opacity-40">
        {generando ? "Creando reserva…" : "Crear reserva →"}
      </button>
    </div>
  );
}
