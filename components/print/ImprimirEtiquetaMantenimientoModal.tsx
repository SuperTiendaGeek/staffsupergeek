"use client";

// Modal compartido "Imprimir etiqueta de mantenimiento" — se usa desde
// /tecnicos/ordenes/[id] (con ordenId: la fecha elegida se guarda directo en
// esa orden) y desde el detalle de una factura emitida en /facturacion (sin
// ordenId: una factura no trae equipo ni está ligada a una orden de
// reparación puntual). En ese segundo caso se ofrece un buscador para
// encontrar y vincular la orden del cliente — así la fecha también queda
// guardada y aparece en el seguimiento de /tecnicos/mantenimientos. Si no se
// vincula ninguna orden, el modal sigue funcionando como antes: solo imprime.
//
// Imprime directamente desde el propio modal — sin navegar a otra pantalla —
// aislando con CSS el nodo de la etiqueta para que sea lo único que salga en
// @media print, mientras en pantalla se ve ampliado (transform: scale) para
// que la vista previa sea legible.

import { useEffect, useMemo, useRef, useState } from "react";
import { EtiquetaMantenimiento } from "./EtiquetaMantenimiento";

type OrdenBusqueda = {
  recordId: string;
  idVisible: string;
  clienteNombre: string;
  equipo: string;
};

type Props = {
  onClose: () => void;
  /** Si viene, la fecha elegida se guarda en esta orden al imprimir. Si no, el modal ofrece buscarla. */
  ordenId?: string;
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

export function ImprimirEtiquetaMantenimientoModal({ onClose, ordenId }: Props) {
  const [fecha, setFecha] = useState<Date>(() => seisMesesDesdeHoy());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fechaInputValue = useMemo(() => toDateInputValue(fecha), [fecha]);

  // Búsqueda de orden a vincular — solo aplica cuando no llega ordenId
  // (caso /facturacion).
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<OrdenBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [ordenVinculada, setOrdenVinculada] = useState<OrdenBusqueda | null>(null);
  const buscadorRef = useRef<HTMLDivElement>(null);

  const ordenIdEfectivo = ordenId ?? ordenVinculada?.recordId ?? null;

  useEffect(() => {
    if (ordenId) return; // ya viene fija, no hay nada que buscar
    const q = busqueda.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setBuscando(true);
        const params = new URLSearchParams({ q, pageSize: "6" });
        const res = await fetch(`/api/tecnicos/ordenes?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        const registros = (json.records ?? json.data ?? []) as Array<{
          recordId: string;
          idVisible: string;
          clienteNombre: string;
          equipo: string;
        }>;
        setResultados(
          registros.map((r) => ({
            recordId: r.recordId,
            idVisible: r.idVisible,
            clienteNombre: r.clienteNombre,
            equipo: r.equipo,
          }))
        );
      } catch {
        // Búsqueda best-effort: si falla, simplemente no hay resultados.
      } finally {
        if (!controller.signal.aborted) setBuscando(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [busqueda, ordenId]);

  // Cerrar el desplegable de resultados al hacer clic fuera del buscador.
  useEffect(() => {
    function handleClickFuera(e: MouseEvent) {
      if (buscadorRef.current && !buscadorRef.current.contains(e.target as Node)) {
        setMostrarResultados(false);
      }
    }
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);

  async function handleImprimir() {
    setError(null);

    if (ordenIdEfectivo) {
      setGuardando(true);
      try {
        const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenIdEfectivo)}/proximo-mantenimiento`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fecha: toDateInputValue(fecha) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          // No bloquea la impresión: el técnico ya está listo para pegar la
          // etiqueta, y puede corregir el registro después.
          setError(json.error || "No se pudo guardar la fecha en la orden, pero la etiqueta se imprime igual.");
        }
      } catch {
        setError("No se pudo guardar la fecha en la orden (sin conexión), pero la etiqueta se imprime igual.");
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

        {!ordenId && (
          <div className="mb-4" ref={buscadorRef}>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8A8A80]">
              Vincular a una orden de reparación
            </span>
            {ordenVinculada ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-[#D7FF4F]/40 bg-[#D7FF4F]/10 px-3 py-2 text-sm">
                <span className="truncate">
                  <span className="font-semibold text-[#D7FF4F]">{ordenVinculada.clienteNombre}</span>
                  {" · "}
                  <span className="text-[#CFCFCB]">{ordenVinculada.equipo}</span>
                  {" · "}
                  <span className="text-[#8A8A80]">#{ordenVinculada.idVisible}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setOrdenVinculada(null)}
                  className="shrink-0 text-[#8A8A80] hover:text-[#F0F0EC]"
                  aria-label="Quitar orden vinculada"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setMostrarResultados(true);
                  }}
                  onFocus={() => setMostrarResultados(true)}
                  placeholder="Buscar por cliente, teléfono o equipo…"
                  className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F0F0EC] focus:border-[#D7FF4F]/60 focus:outline-none"
                />
                {mostrarResultados && busqueda.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[#3A3A36] bg-[#1E1F1C] shadow-xl">
                    {buscando ? (
                      <p className="px-3 py-2 text-xs text-[#8A8A80]">Buscando…</p>
                    ) : resultados.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-[#8A8A80]">Sin resultados.</p>
                    ) : (
                      resultados.map((r) => (
                        <button
                          key={r.recordId}
                          type="button"
                          onClick={() => {
                            setOrdenVinculada(r);
                            setMostrarResultados(false);
                            setBusqueda("");
                          }}
                          className="block w-full truncate px-3 py-2 text-left text-sm text-[#F0F0EC] hover:bg-[#2D2E2A]"
                        >
                          <span className="font-semibold">{r.clienteNombre}</span>{" "}
                          <span className="text-[#8A8A80]">· {r.equipo} · #{r.idVisible}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            <p className="mt-1 text-[11px] text-[#8A8A80]">
              Opcional — sin vincular una orden, la etiqueta se imprime pero la fecha no queda en el seguimiento de mantenimientos.
            </p>
          </div>
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
