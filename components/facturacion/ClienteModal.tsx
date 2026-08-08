"use client";

// Modal único de cliente para todos los documentos: crear (valida que la cédula
// no exista; si existe, ofrece usar el registro) o editar (carga los datos y al
// guardar actualiza la ficha en Clientes). Devuelve el cliente resuelto para que
// la tarjeta lo muestre vinculado.

import { useEffect, useState } from "react";
import {
  TIPOS_IDENTIFICACION,
  validarIdentificacion,
  inferirTipoSugerido,
} from "@/lib/facturacion/reglas/identificacion";

export type ClienteResuelto = { id: string; nombre: string; cedula: string; tipoIdentificacion?: string; telefono: string; correo: string; direccion: string };

const LABEL = "block mb-1 text-[10px] font-bold uppercase tracking-wider text-[#A7A7A7]";
const INPUT = "w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/40";

export function ClienteModal({ modo, clienteId, onClose, onGuardado }: {
  modo: "crear" | "editar";
  clienteId?: string;
  onClose: () => void;
  onGuardado: (c: ClienteResuelto) => void;
}) {
  const [nombre, setNombre]       = useState("");
  const [cedula, setCedula]       = useState("");
  // El tipo se ELIGE. Antes no existía este campo y se deducía por la longitud
  // del número: lo que no eran 10 ni 13 dígitos se marcaba como pasaporte sin
  // que nadie lo supiera. Así salió la factura 001-002-000000689 a una
  // identificación de nueve dígitos.
  const [tipoId, setTipoId]       = useState("");
  const [telefono, setTelefono]   = useState("");
  const [correo, setCorreo]       = useState("");
  const [direccion, setDireccion] = useState("");
  const [notas, setNotas]         = useState("");
  const [cargando, setCargando]   = useState(modo === "editar");
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [existente, setExistente] = useState<ClienteResuelto | null>(null);

  useEffect(() => {
    if (modo !== "editar" || !clienteId) return;
    let vivo = true;
    fetch(`/api/facturacion/clientes/${clienteId}`).then((r) => r.json()).then((d) => {
      if (!vivo) return;
      if (d.success && d.data) { setNombre(d.data.nombre ?? ""); setCedula(d.data.cedula ?? ""); setTipoId(d.data.tipoIdentificacion || inferirTipoSugerido(d.data.cedula ?? "") || ""); setTelefono(d.data.telefono ?? ""); setCorreo(d.data.correo ?? ""); setDireccion(d.data.direccion ?? ""); setNotas(d.data.notas ?? ""); }
      else setError(d.error ?? "No se pudo cargar el cliente");
    }).catch(() => { if (vivo) setError("Error de red"); }).finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [modo, clienteId]);

  async function guardar() {
    if (!nombre.trim()) { setError("El nombre es obligatorio"); return; }
    // Misma validación que usa el servidor al emitir: si la ficha se guarda mal,
    // el problema aparece más tarde, con una factura delante.
    const errId = validarIdentificacion(tipoId, cedula.trim());
    if (errId) { setError(errId); return; }
    setGuardando(true); setError(null); setExistente(null);
    try {
      if (modo === "crear") {
        const r = await fetch("/api/facturacion/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nombre.trim(), cedula: cedula.trim(), tipoIdentificacion: tipoId, telefono: telefono.trim(), correo: correo.trim(), direccion: direccion.trim() }) });
        const d = await r.json();
        if (r.ok && d.success) onGuardado(d.data);
        else if (r.status === 409 && d.clienteExistente) { setError(`Ya existe un cliente con esa cédula: ${d.clienteExistente.nombre}.`); setExistente(d.clienteExistente); }
        else setError(d.error ?? "Error al crear el cliente");
      } else {
        const r = await fetch(`/api/facturacion/clientes/${clienteId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nombre.trim(), cedula: cedula.trim(), tipoIdentificacion: tipoId, telefono: telefono.trim(), correo: correo.trim(), direccion: direccion.trim(), notas }) });
        const d = await r.json();
        if (d.success) onGuardado(d.data);
        else setError(d.error ?? "Error al actualizar el cliente");
      }
    } catch { setError("Error de red"); } finally { setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg my-8 rounded-2xl border border-[#2A2A22] bg-[#1A1A16] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2A2A22] px-5 py-4">
          <h3 className="text-base font-bold text-[#D7FF4F]">{modo === "crear" ? "Nuevo cliente" : "Editar cliente"}</h3>
          <button onClick={onClose} className="text-[#666] hover:text-[#F5F5F5] text-xl leading-none" aria-label="Cerrar">✕</button>
        </div>
        <div className="p-5">
          {cargando ? (
            <div className="py-10 text-center text-sm text-[#555]">Cargando…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2"><label className={LABEL}>Nombre / Razón social</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} placeholder="Nombre completo" /></div>
              <div>
                <label className={LABEL}>Tipo de documento</label>
                <select
                  value={tipoId}
                  onChange={(e) => { setTipoId(e.target.value); setError(null); }}
                  className={INPUT}
                >
                  <option value="">Elegir…</option>
                  {TIPOS_IDENTIFICACION.filter((t) => t.codigo !== "07").map((t) => (
                    <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Número de documento</label>
                <input
                  value={cedula}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCedula(v);
                    setError(null);
                    setExistente(null);
                    // Se PROPONE el tipo solo si el número es válido de verdad,
                    // y solo si el usuario no eligió uno todavía. Nunca propone
                    // pasaporte ni identificación del exterior.
                    if (!tipoId) {
                      const sugerido = inferirTipoSugerido(v);
                      if (sugerido) setTipoId(sugerido);
                    }
                  }}
                  className={INPUT}
                  placeholder={tipoId === "04" ? "1790011114001" : tipoId === "05" ? "1003710272" : "Número del documento"}
                />
                {cedula.trim() && validarIdentificacion(tipoId, cedula.trim()) && (
                  <p className="mt-1 text-[11px] text-amber-300">{validarIdentificacion(tipoId, cedula.trim())}</p>
                )}
              </div>
              <div><label className={LABEL}>Teléfono</label><input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={INPUT} placeholder="09XXXXXXXX" /></div>
              <div><label className={LABEL}>Correo</label><input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className={INPUT} placeholder="cliente@email.com" /></div>
              <div><label className={LABEL}>Dirección</label><input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={INPUT} placeholder="Dirección" /></div>
            </div>
          )}

          {error && <p className="mt-3 text-xs text-red-300 bg-red-950/30 border border-red-500/40 rounded-lg px-3 py-2">{error}</p>}
          {existente && (
            <button onClick={() => onGuardado(existente)} className="mt-2 rounded-full border border-[#D7FF4F]/60 px-4 py-1.5 text-xs text-[#D7FF4F] hover:bg-[#D7FF4F]/10">Usar este cliente</button>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button onClick={guardar} disabled={guardando || cargando} className="rounded-full bg-[#D7FF4F] text-[#151515] px-5 py-2 text-sm font-bold hover:brightness-105 disabled:opacity-40">{guardando ? "Guardando…" : modo === "crear" ? "Crear cliente" : "Guardar cambios"}</button>
            <button onClick={onClose} className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:text-[#F5F5F5]">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
