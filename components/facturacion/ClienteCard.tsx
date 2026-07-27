"use client";

// Tarjeta de cliente ÚNICA para todos los documentos. Opciones idénticas:
// (Consumidor Final si aplica) · Buscar existente · + Cliente nuevo. La creación
// y edición se hacen en el ClienteModal (valida cédula / actualiza la ficha).
// El cliente elegido se muestra como resumen con Editar / quitar.

import { useEffect, useState } from "react";
import { ClienteModal, type ClienteResuelto } from "@/components/facturacion/ClienteModal";

export type ClienteDoc = {
  esConsumidorFinal:  boolean;
  tipoIdentificacion: string;   // "04" RUC · "05" cédula · "06" pasaporte · "07" cons. final
  identificacion:     string;
  razonSocial:        string;
  correo:             string;
  telefono:           string;
  direccion:          string;
  airtableId?:        string;
};

export const CLIENTE_VACIO: ClienteDoc = { esConsumidorFinal: false, tipoIdentificacion: "05", identificacion: "", razonSocial: "", correo: "", telefono: "", direccion: "" };
export const CONSUMIDOR_FINAL_DOC: ClienteDoc = { esConsumidorFinal: true, tipoIdentificacion: "07", identificacion: "9999999999999", razonSocial: "CONSUMIDOR FINAL", correo: "", telefono: "", direccion: "" };

function tipoDe(cedula: string): string {
  const d = cedula.replace(/\D/g, "");
  if (d.length === 13) return "04";
  if (d.length === 10) return "05";
  return "06";
}
function docFrom(c: ClienteResuelto): ClienteDoc {
  return { esConsumidorFinal: false, tipoIdentificacion: tipoDe(c.cedula ?? ""), identificacion: c.cedula ?? "", razonSocial: c.nombre, correo: c.correo ?? "", telefono: c.telefono ?? "", direccion: c.direccion ?? "", airtableId: c.id };
}

type Sug = { id: string; nombre: string; cedula: string; telefono: string; correo: string; direccion: string };

export function ClienteCard({ value, onChange, conConsumidorFinal = false }: {
  value: ClienteDoc;
  onChange: (c: ClienteDoc) => void;
  conConsumidorFinal?: boolean;
}) {
  const [modoBuscar, setModoBuscar] = useState(false);
  const [q, setQ]     = useState("");
  const [sug, setSug] = useState<Sug[]>([]);
  const [modal, setModal] = useState<{ modo: "crear" | "editar"; id?: string } | null>(null);

  useEffect(() => {
    const s = q.trim(); if (s.length < 2) { setSug([]); return; }
    let cancel = false;
    const t = setTimeout(async () => { try { const r = await fetch(`/api/facturacion/clientes?q=${encodeURIComponent(s)}`); const j = await r.json(); if (!cancel && j.success) setSug(j.data); } catch { /* */ } }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [q]);

  const chip = (activo: boolean) => `rounded-full border px-3 py-1 text-xs font-bold transition whitespace-nowrap ${activo ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] bg-transparent text-[#A7A7A7] hover:text-[#F5F5F5]"}`;
  const elegido = !!value.airtableId;

  function seleccionar(c: Sug) { onChange(docFrom(c)); setModoBuscar(false); setQ(""); setSug([]); }

  return (
    <div className="rounded-xl border border-[#3A3A36] bg-[#1A1B18] p-4 mb-4">
      <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">1. Cliente</h2>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {conConsumidorFinal && (
          <button onClick={() => { onChange(CONSUMIDOR_FINAL_DOC); setModoBuscar(false); }} className={chip(value.esConsumidorFinal)}>Consumidor Final</button>
        )}
        <button onClick={() => setModoBuscar((v) => !v)} className={chip(modoBuscar && !elegido)}>Buscar existente</button>
        <button onClick={() => setModal({ modo: "crear" })} className="rounded-full border border-[#3A3A36] bg-transparent px-3 py-1 text-xs font-bold text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5] transition whitespace-nowrap">+ Cliente nuevo</button>
      </div>

      {/* Buscador contextual */}
      {modoBuscar && !elegido && !value.esConsumidorFinal && (
        <div className="relative mb-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, cédula o teléfono…" className="w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/40" />
          {sug.length > 0 && (
            <ul className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-md border border-[#3A3A36] bg-[#1A1B18] shadow-xl divide-y divide-[#2A2B28]">
              {sug.map((c) => (
                <li key={c.id}><button onClick={() => seleccionar(c)} className="w-full text-left px-4 py-2 hover:bg-[#252622] text-sm"><p className="font-semibold text-[#F5F5F5]">{c.nombre}</p><p className="text-[10px] text-[#666]">{c.cedula} · {c.telefono} · {c.correo}</p></button></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Estado actual */}
      {value.esConsumidorFinal ? (
        <div className="rounded-md bg-[#252622] border border-[#3A3A36] px-4 py-3 text-sm text-[#A7A7A7]"><span className="text-[#F5F5F5] font-semibold">CONSUMIDOR FINAL</span> <span className="ml-1">— 07 / 9999999999999 — sin email</span></div>
      ) : elegido ? (
        <div className="rounded-lg border border-[#3A3A36] bg-[#252622] px-4 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0 text-sm space-y-0.5">
            <p className="font-semibold text-[#F5F5F5] truncate">{value.razonSocial}</p>
            <p className="text-[#C7C7C7] truncate"><span className="text-[#777]">CI/RUC:</span> {value.identificacion || "—"}</p>
            <p className="text-[#C7C7C7] truncate"><span className="text-[#777]">Teléfono:</span> {value.telefono || "—"}</p>
            <p className="text-[#C7C7C7] truncate"><span className="text-[#777]">Correo:</span> {value.correo || "—"}</p>
            <p className="text-[#C7C7C7] truncate"><span className="text-[#777]">Dirección:</span> {value.direccion || "—"}</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button onClick={() => setModal({ modo: "editar", id: value.airtableId })} className="text-sm text-[#A7A7A7] underline hover:text-[#D7FF4F]">Editar</button>
            <button onClick={() => onChange(CLIENTE_VACIO)} className="text-sm text-[#A7A7A7] underline hover:text-red-300">quitar</button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#666]">Busca un cliente existente o crea uno nuevo para continuar.</p>
      )}

      {modal && (
        <ClienteModal
          modo={modal.modo}
          clienteId={modal.id}
          onClose={() => setModal(null)}
          onGuardado={(c) => { onChange(docFrom(c)); setModal(null); setModoBuscar(false); }}
        />
      )}
    </div>
  );
}
