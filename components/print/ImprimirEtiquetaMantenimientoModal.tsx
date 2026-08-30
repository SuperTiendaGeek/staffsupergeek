"use client";

// Modal compartido "Imprimir etiqueta de mantenimiento" — se usa desde
// /tecnicos/ordenes/[id] (prop `ordenId`: la fecha se guarda vinculada a esa
// orden) y desde el detalle de una factura emitida en /facturacion (prop
// `factura`: la fecha se guarda vinculada a esa factura — una venta de
// mostrador no tiene una orden de reparación de por medio, así que el
// "equipo" se escribe a mano en vez de venir de un campo fijo). En ambos
// casos se registra en la tabla centralizada "Mantenimientos" — ver
// lib/tecnicos/airtable/index.ts (registrarMantenimiento) — que es lo que
// alimenta el seguimiento en /tecnicos/mantenimientos.
//
// Imprime directamente desde el propio modal — sin navegar a otra pantalla —
// aislando con CSS el nodo de la etiqueta para que sea lo único que salga en
// @media print, mientras en pantalla se ve ampliado (transform: scale) para
// que la vista previa sea legible.

import { useMemo, useState } from "react";
import { EtiquetaMantenimiento } from "./EtiquetaMantenimiento";

type Props = {
  onClose: () => void;
  /** Guarda la fecha vinculada a esta orden de reparación (cliente/teléfono/equipo se toman de la orden). */
  ordenId?: string;
  /** Guarda la fecha vinculada a esta factura — caso venta de mostrador, sin orden de reparación. */
  factura?: {
    recordId: string;
    clienteNombre: string;
    /** Cédula/RUC — llave para agrupar el historial de este cliente en /tecnicos/mantenimientos. */
    clienteIdentificacion: string;
    telefono: string;
    /** Prellenado sugerido para el campo "Equipo" (ej. la descripción del primer ítem facturado). */
    equipoSugerido?: string;
  };
};

const PRINT_TARGET_ID = "etiqueta-mantenimiento-imprimir";

// Ampliación de la vista previa en pantalla. La etiqueta real es 50×25mm —
// sin ampliar sería casi ilegible en un monitor. `transform: scale()` NO
// cambia el tamaño de layout del elemento (solo lo que se PINTA), así que
// hace falta reservar el espacio real (ancho/alto en `calc(Nmm * escala)`)
// con overflow:hidden alrededor; si no, el contenido ampliado se dibuja por
// encima del resto del modal en vez de empujarlo — eso es lo que rompía el
// layout antes.
const PREVIEW_SCALE = 2.4;

function seisMesesDesdeHoy(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d;
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// new Date("YYYY-MM-DD") parsea en UTC — en Ecuador (UTC-5) eso muestra el
// día anterior. Se arma la fecha con los componentes locales para evitarlo.
function fromDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const fecha = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function ImprimirEtiquetaMantenimientoModal({ onClose, ordenId, factura }: Props) {
  const [fecha, setFecha] = useState<Date>(() => seisMesesDesdeHoy());
  const [equipo, setEquipo] = useState(factura?.equipoSugerido ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fechaInputValue = useMemo(() => toDateInputValue(fecha), [fecha]);

  const equipoInvalido = Boolean(factura) && equipo.trim().length === 0;

  async function handleImprimir() {
    setError(null);
    if (equipoInvalido) {
      setError("Escribe el equipo antes de imprimir — la factura no trae ese dato por sí sola.");
      return;
    }

    if (ordenId || factura) {
      setGuardando(true);
      try {
        const body = ordenId
          ? { origen: "orden", ordenRecordId: ordenId, fecha: toDateInputValue(fecha) }
          : {
              origen: "factura",
              facturaRecordId: factura!.recordId,
              clienteNombre: factura!.clienteNombre,
              clienteIdentificacion: factura!.clienteIdentificacion,
              telefono: factura!.telefono,
              equipo: equipo.trim(),
              fecha: toDateInputValue(fecha),
            };
        const res = await fetch("/api/tecnicos/mantenimientos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          // No bloquea la impresión: el técnico ya está listo para pegar la
          // etiqueta, y puede corregir el registro después.
          setError(json.error || "No se pudo guardar el mantenimiento, pero la etiqueta se imprime igual.");
        }
      } catch {
        setError("No se pudo guardar el mantenimiento (sin conexión), pero la etiqueta se imprime igual.");
      } finally {
        setGuardando(false);
      }
    }

    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
      {/*
        Truco estándar de "imprimir solo este elemento": se oculta con
        visibility (no display) TODO lo demás, para que el layout del resto
        del modal no interfiera, y el nodo objetivo (sea cual sea su
        profundidad real en el árbol — layout, StaffAppShell, etc.) se
        vuelve a hacer visible y se posiciona fijo para ocupar la página.
      */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #${PRINT_TARGET_ID}, #${PRINT_TARGET_ID} * { visibility: visible; }
          #${PRINT_TARGET_ID} {
            position: fixed;
            top: 0;
            left: 0;
            transform: none !important;
          }
        }
      `}</style>

      <div className="w-full max-w-lg rounded-2xl border border-[#3A3A36] bg-[#1A1B18] p-5 text-[#F0F0EC] shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#D7FF4F]">Imprimir etiqueta de mantenimiento</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6B6B66] transition hover:text-[#F0F0EC]"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {factura && (
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8A8A80]">
              Equipo
            </span>
            <input
              type="text"
              value={equipo}
              onChange={(e) => setEquipo(e.target.value)}
              placeholder="Ej. Laptop HP Pavilion 15"
              className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F0F0EC] focus:border-[#D7FF4F]/60 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-[#8A8A80]">
              La factura no trae un campo de equipo fijo — se guarda tal cual lo escribas aquí.
            </p>
          </label>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8A8A80]">
            Fecha del próximo mantenimiento
          </span>
          <input
            type="date"
            value={fechaInputValue}
            onChange={(e) => {
              const parsed = fromDateInputValue(e.target.value);
              if (parsed) setFecha(parsed);
            }}
            className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F0F0EC] focus:border-[#D7FF4F]/60 focus:outline-none"
          />
        </label>

        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A8A80]">Vista previa</p>
          <div className="flex justify-center rounded-lg border border-dashed border-[#3A3A36] bg-[#0E0F0C] p-4">
            {/* El tamaño real de impresión es 50×25mm; @media print restaura
                ese tamaño físico y aísla este nodo (ver estilo de arriba). */}
            <div
              style={{
                width: `calc(50mm * ${PREVIEW_SCALE})`,
                height: `calc(25mm * ${PREVIEW_SCALE})`,
                overflow: "hidden",
              }}
            >
              <div
                id={PRINT_TARGET_ID}
                style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}
              >
                <EtiquetaMantenimiento fecha={fecha} />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#8A8A80] transition hover:text-[#F0F0EC]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleImprimir}
            disabled={guardando}
            className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Imprimir"}
          </button>
        </div>
      </div>
    </div>
  );
}
