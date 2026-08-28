"use client";

// Corregir una factura que el SRI rechazó, y reenviarla CONSERVANDO su número
// y su clave de acceso.
//
// ─── Qué se puede tocar aquí, y qué no ───────────────────────────────────────
//
// Solo los datos del comprador. De ahí vienen casi todos los rechazos —el más
// común, con diferencia, es la identificación— y es lo que se puede arreglar
// sin cambiar la operación comercial.
//
// El número, la clave de acceso y la fecha se muestran pero NO se editan: son
// la identidad del comprobante. Cambiarlos convertiría la factura de un
// cliente en la venta de otro. Las líneas y los importes se reenvían tal cual
// estaban.
//
// El servidor no se fía de nada de esto: vuelve a tomar la identidad del
// registro guardado y a validar la identificación antes de firmar.

import { useState } from "react";
import {
  TIPOS_IDENTIFICACION,
  validarIdentificacion,
  revisarIdentificacion,
} from "@/lib/facturacion/reglas/identificacion";

type MotivoSri = {
  codigo: string;
  original: string;
  queSignifica: string;
  queHacer: string;
  corregible: boolean;
};

export type FacturaACorregir = {
  recordId:              string;
  numeroFactura:         string;
  claveAcceso:           string;
  fechaEmision:          string;
  estado:                string;
  total:                 number;
  clienteNombre:         string;
  clienteIdentificacion: string;
  clienteTipoIdentificacion?: string;
  clienteCorreo:         string;
  mensajesSri:           string;
};

const LABEL = "block mb-1 text-[10px] font-bold uppercase tracking-wider text-[#A7A7A7]";
const INPUT = "w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/40";
const FIJO  = "w-full rounded-lg bg-[#1B1C19] border border-[#2A2B28] px-3 py-2 text-sm text-[#777] font-mono";

export function CorregirFacturaModal({ factura, onClose, onCorregida }: {
  factura: FacturaACorregir;
  onClose: () => void;
  onCorregida: () => void;
}) {
  const [tipoId, setTipoId]       = useState(factura.clienteTipoIdentificacion ?? "");
  const [identificacion, setIdent] = useState(factura.clienteIdentificacion ?? "");
  const [razonSocial, setRazon]   = useState(factura.clienteNombre ?? "");
  const [correo, setCorreo]       = useState(factura.clienteCorreo ?? "");

  const [enviando, setEnviando]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [motivos, setMotivos]     = useState<MotivoSri[] | null>(null);
  const [exito, setExito]         = useState<string | null>(null);
  // El cierre por "clic afuera" solo cuenta si el clic empieza Y termina en
  // el fondo — evita que seleccionar texto en un campo y soltar el mouse un
  // pixel fuera del cuadro cierre el modal a mitad de la corrección.
  const [mouseDownEnFondo, setMouseDownEnFondo] = useState(false);

  const errId = identificacion.trim() ? validarIdentificacion(tipoId, identificacion.trim()) : null;
  // Dígito verificador que no cuadra (RUC/cédula real, p.ej. SALUDSÍ EC
  // S.A.S.) — NO bloquea puedeEnviar, solo se muestra en ámbar más abajo.
  const advertenciaId = identificacion.trim() ? revisarIdentificacion(tipoId, identificacion.trim()).advertencia : null;
  const puedeEnviar = !!razonSocial.trim() && !!identificacion.trim() && !errId && !enviando;

  async function reenviar() {
    setEnviando(true);
    setError(null);
    setMotivos(null);
    setExito(null);

    try {
      const r = await fetch(`/api/facturacion/historial/${factura.recordId}/corregir`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoIdentificacionComprador: tipoId,
          identificacionComprador:     identificacion.trim(),
          razonSocialComprador:        razonSocial.trim(),
          correoComprador:             correo.trim() || undefined,
        }),
      });
      const d = await r.json();

      if (!d.success) { setError(d.error ?? "No se pudo reenviar la factura"); return; }

      if (d.data.estado === "AUTORIZADO") {
        setExito(`El SRI autorizó la factura ${factura.numeroFactura}. Mismo número, misma clave.`);
        setTimeout(onCorregida, 1800);
        return;
      }

      if (d.data.estado === "EN PROCESAMIENTO") {
        setExito("El SRI la recibió y todavía no la resuelve. Consulta su estado desde el historial en unos minutos.");
        setTimeout(onCorregida, 2500);
        return;
      }

      // Rechazada otra vez: se muestra el motivo nuevo y se deja seguir
      // corrigiendo sobre la misma factura.
      setError(`El SRI la rechazó otra vez (${d.data.estado}).`);
      setMotivos(d.data.motivos ?? null);
    } catch {
      setError("No se pudo conectar con el servidor. La factura sigue guardada con su número y su clave.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
      onMouseDown={(e) => setMouseDownEnFondo(e.target === e.currentTarget)}
      onClick={(e) => { if (mouseDownEnFondo && e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl my-8 rounded-2xl border border-[#2A2A22] bg-[#1A1A16] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2A2A22] px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-[#D7FF4F]">Corregir y reenviar</h3>
            <p className="text-xs text-[#666] mt-0.5">
              Se reenvía esta misma factura, con su número y su clave de acceso
            </p>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-[#F5F5F5] text-xl leading-none" aria-label="Cerrar">✕</button>
        </div>

        <div className="p-5">
          {/* ── Por qué la rechazó el SRI ─────────────────────────────────── */}
          {factura.mensajesSri && (
            <div className="mb-5 rounded-xl border border-red-800/40 bg-red-950/20 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-300 mb-1">
                Respuesta del SRI
              </p>
              <pre className="text-xs text-red-200/90 whitespace-pre-wrap font-sans leading-relaxed">
                {factura.mensajesSri}
              </pre>
            </div>
          )}

          {/* ── Identidad: se ve, no se toca ──────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <div>
              <label className={LABEL}>Número (no cambia)</label>
              <div className={FIJO}>{factura.numeroFactura}</div>
            </div>
            <div>
              <label className={LABEL}>Fecha (no cambia)</label>
              <div className={FIJO}>{factura.fechaEmision}</div>
            </div>
            <div>
              <label className={LABEL}>Total (no cambia)</label>
              <div className={FIJO}>${factura.total.toFixed(2)}</div>
            </div>
            <div className="md:col-span-3">
              <label className={LABEL}>Clave de acceso (no cambia)</label>
              <div className={`${FIJO} text-[10px] break-all`}>{factura.claveAcceso}</div>
            </div>
          </div>

          {/* ── Lo que sí se corrige ──────────────────────────────────────── */}
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#A7A7A7] mb-2">
            Datos del comprador
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Tipo de documento</label>
              <select value={tipoId} onChange={(e) => setTipoId(e.target.value)} className={INPUT}>
                <option value="">Elegir…</option>
                {TIPOS_IDENTIFICACION.filter((t) => t.codigo !== "07").map((t) => (
                  <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Número de documento</label>
              <input value={identificacion} onChange={(e) => setIdent(e.target.value)} className={INPUT} />
              {(errId || advertenciaId) && <p className="mt-1 text-[11px] text-amber-300">{errId ?? advertenciaId}</p>}
            </div>
            <div className="md:col-span-2">
              <label className={LABEL}>Nombre / Razón social</label>
              <input value={razonSocial} onChange={(e) => setRazon(e.target.value)} className={INPUT} />
            </div>
            <div className="md:col-span-2">
              <label className={LABEL}>Correo</label>
              <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className={INPUT} placeholder="cliente@email.com" />
            </div>
          </div>

          <p className="mt-3 text-[11px] text-[#666]">
            Las líneas y los importes se reenvían tal como estaban. Si el problema está ahí,
            esta factura no se puede arreglar desde aquí: habría que emitir una nueva.
          </p>

          {/* ── Resultado ─────────────────────────────────────────────────── */}
          {exito && (
            <div className="mt-4 rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-3 text-xs text-emerald-200">
              {exito}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-xs text-red-300">
              <p>{error}</p>
              {motivos?.map((m) => (
                <div key={m.codigo} className="mt-2 border-t border-red-800/40 pt-2">
                  <p className="font-semibold">[{m.codigo}] {m.queSignifica}</p>
                  <p className="mt-0.5 opacity-90">{m.queHacer}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={reenviar}
              disabled={!puedeEnviar}
              className="rounded-full bg-[#D7FF4F] text-[#151515] px-5 py-2 text-sm font-bold hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enviando ? "Enviando al SRI…" : "Guardar y reenviar al SRI"}
            </button>
            <button
              onClick={onClose}
              disabled={enviando}
              className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:text-[#F5F5F5] disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
