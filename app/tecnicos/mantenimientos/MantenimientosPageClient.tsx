"use client";

// Seguimiento de "próximo mantenimiento" — lista la tabla centralizada
// "Mantenimientos" (ver lib/tecnicos/airtable/index.ts), que cubre tanto
// etiquetas impresas desde una Orden de Reparación como desde una Factura
// (venta de mostrador, sin orden asociada). Ordenada por fecha ascendente
// (las más próximas a vencer primero), con el estado de aviso al cliente y
// un botón de WhatsApp para notificarlo.
//
// Cada ciclo (venta → mantenimiento → mantenimiento…) nace de una orden o
// factura distinta, así que cada impresión es SU PROPIA fila — no se puede
// saber si dos filas son "el mismo equipo" mirando solo el origen. Por eso
// el historial de un cliente (botón sobre su nombre) agrupa por
// `clienteIdentificacion` (cédula/RUC), que es estable entre ciclos aunque
// el origen cambie.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
import { buildWhatsAppUrl } from "@/lib/tecnicos/whatsapp";
import { buildMantenimientoWhatsAppMessage } from "@/lib/tecnicos/orders/mantenimientoWhatsApp";

type MantenimientoItem = {
  mantenimientoRecordId: string;
  origen: "Orden de Reparación" | "Factura";
  ordenRecordId: string | null;
  ordenIdVisible: string | null;
  facturaRecordId: string | null;
  facturaNumero: string | null;
  clienteIdentificacion: string;
  clienteNombre: string;
  telefono: string;
  equipo: string;
  fecha: string; // YYYY-MM-DD
  notificado: boolean;
  realizado: boolean;
  fechaRealizado: string | null;
};

const formatFecha = (fecha: string): string => {
  const parsed = new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return fecha;
  return parsed.toLocaleDateString("es-EC", { year: "numeric", month: "short", day: "2-digit" });
};

/** Días de diferencia entre hoy y la fecha objetivo (negativo = ya venció). */
const diasRestantes = (fecha: string): number | null => {
  const target = new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  target.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - hoy.getTime()) / 86_400_000);
};

function BadgeDias({ fecha, realizado }: { fecha: string; realizado: boolean }) {
  if (realizado) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
        ✓ Realizado
      </span>
    );
  }

  const dias = diasRestantes(fecha);
  if (dias === null) return <span className="text-xs text-[#A7A7A7]">—</span>;

  if (dias < 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-300">
        Incumplido — venció hace {Math.abs(dias)} {Math.abs(dias) === 1 ? "día" : "días"}
      </span>
    );
  }
  if (dias === 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
        Hoy
      </span>
    );
  }
  if (dias <= 15) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
        En {dias} {dias === 1 ? "día" : "días"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-[#3A3A36] bg-[#1E1F1C] px-2 py-0.5 text-[11px] font-semibold text-[#A7A7A7]">
      En {dias} días
    </span>
  );
}

function BadgeOrigen({ item }: { item: MantenimientoItem }) {
  if (item.origen === "Orden de Reparación" && item.ordenRecordId) {
    return (
      <Link
        href={`/tecnicos/ordenes/${encodeURIComponent(item.ordenRecordId)}`}
        className="inline-flex items-center rounded-full border border-[#3A3A36] bg-[#1E1F1C] px-2 py-0.5 text-[11px] font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
        title="Ver orden de reparación"
      >
        Orden{item.ordenIdVisible ? ` #${item.ordenIdVisible}` : ""}
      </Link>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full border border-[#3A3A36] bg-[#1E1F1C] px-2 py-0.5 text-[11px] font-semibold text-[#A7A7A7]"
      title="Venta de mostrador — sin orden de reparación asociada"
    >
      Factura{item.facturaNumero ? ` ${item.facturaNumero}` : ""}
    </span>
  );
}

function EstadoCiclo({ item }: { item: MantenimientoItem }) {
  if (item.realizado) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
        ✓ Realizado{item.fechaRealizado ? ` (${formatFecha(item.fechaRealizado)})` : ""}
      </span>
    );
  }
  const dias = diasRestantes(item.fecha);
  if (dias !== null && dias < 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-300">
        ✗ Incumplido
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-[#3A3A36] bg-[#1E1F1C] px-2 py-0.5 text-[11px] font-semibold text-[#A7A7A7]">
      ⏳ Pendiente
    </span>
  );
}

// Historial de un mismo equipo/cliente a través de varios ciclos (venta →
// mantenimiento → mantenimiento…). Se agrupa por `clienteIdentificacion`
// (cédula/RUC) porque es la única llave estable entre ciclos — el origen
// (orden u factura) cambia cada vez y no sirve para esto. Si por algún
// motivo no hay identificación guardada (dato viejo o vacío), se cae a
// agrupar por nombre exacto, mejor que no mostrar nada.
function HistorialModal({
  cliente,
  items,
  onClose,
}: {
  cliente: { identificacion: string; nombre: string };
  items: MantenimientoItem[];
  onClose: () => void;
}) {
  const ciclos = useMemo(() => {
    const propios = cliente.identificacion
      ? items.filter((i) => i.clienteIdentificacion === cliente.identificacion)
      : items.filter((i) => !i.clienteIdentificacion && i.clienteNombre === cliente.nombre);
    return [...propios].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [items, cliente]);

  const realizados = ciclos.filter((c) => c.realizado).length;
  const incumplidos = ciclos.filter((c) => !c.realizado && (diasRestantes(c.fecha) ?? 0) < 0).length;
  const base = realizados + incumplidos;
  const cumplimientoPct = base > 0 ? Math.round((realizados / base) * 100) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-[#3A3A36] bg-[#1A1B18] p-5 text-[#F0F0EC] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#D7FF4F]">Historial de mantenimientos</h3>
          <button type="button" onClick={onClose} className="text-[#6B6B66] transition hover:text-[#F0F0EC]" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-[#8A8A80]">
          {cliente.nombre}
          {cliente.identificacion ? ` · ${cliente.identificacion}` : ""}
        </p>

        <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg border border-[#3A3A36] bg-[#252622] p-3 text-center">
          <div>
            <p className="text-lg font-bold text-[#D7FF4F]">{ciclos.length}</p>
            <p className="text-[10px] uppercase tracking-wide text-[#8A8A80]">Ciclos</p>
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-300">{realizados}</p>
            <p className="text-[10px] uppercase tracking-wide text-[#8A8A80]">Realizados</p>
          </div>
          <div>
            <p className="text-lg font-bold text-[#F0F0EC]">{cumplimientoPct === null ? "—" : `${cumplimientoPct}%`}</p>
            <p className="text-[10px] uppercase tracking-wide text-[#8A8A80]">Cumplimiento</p>
          </div>
        </div>

        <div className="space-y-2">
          {ciclos.map((c) => (
            <div key={c.mantenimientoRecordId} className="rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white">{formatFecha(c.fecha)}</span>
                <EstadoCiclo item={c} />
              </div>
              <p className="mt-1 truncate text-xs text-[#A7A7A7]" title={c.equipo}>
                {c.equipo}
              </p>
              <div className="mt-1">
                <BadgeOrigen item={c} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MantenimientosPageClient() {
  const [items, setItems] = useState<MantenimientoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // mantenimientoRecordId -> true mientras hay un PATCH en curso (notificado
  // o realizado), para deshabilitar el botón y evitar dobles clics.
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [historialCliente, setHistorialCliente] = useState<{ identificacion: string; nombre: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/tecnicos/mantenimientos", { signal: controller.signal });
        const json = (await res.json()) as { success?: boolean; data?: MantenimientoItem[]; error?: string };
        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudo cargar el listado de mantenimientos");
        }
        setItems(json.data ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void fetchData();
    return () => controller.abort();
  }, []);

  const itemsFiltrados = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.clienteNombre.toLowerCase().includes(q) ||
        item.equipo.toLowerCase().includes(q) ||
        item.telefono.includes(q) ||
        item.clienteIdentificacion.toLowerCase().includes(q) ||
        (item.ordenIdVisible ?? "").toLowerCase().includes(q) ||
        (item.facturaNumero ?? "").toLowerCase().includes(q)
    );
  }, [items, searchTerm]);

  const pendientes = items.filter((i) => !i.notificado).length;

  async function toggleCampo(item: MantenimientoItem, campo: "notificado" | "realizado") {
    const nuevoValor = !item[campo];
    setGuardandoId(item.mantenimientoRecordId);
    // Optimista: la pantalla es de seguimiento manual, un fallo silencioso
    // aquí no bloquea nada crítico — si falla, se revierte abajo.
    setItems((prev) =>
      prev.map((i) => (i.mantenimientoRecordId === item.mantenimientoRecordId ? { ...i, [campo]: nuevoValor } : i))
    );
    try {
      const res = await fetch(
        `/api/tecnicos/mantenimientos/${encodeURIComponent(item.mantenimientoRecordId)}/${campo}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [campo]: nuevoValor }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo guardar");
    } catch {
      // Revertir en caso de error.
      setItems((prev) =>
        prev.map((i) =>
          i.mantenimientoRecordId === item.mantenimientoRecordId ? { ...i, [campo]: !nuevoValor } : i
        )
      );
    } finally {
      setGuardandoId(null);
    }
  }

  function enviarWhatsApp(item: MantenimientoItem) {
    const url = buildWhatsAppUrl(item.telefono, buildMantenimientoWhatsAppMessage(item));
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    // Enviar el recordatorio marca automáticamente el ciclo como notificado;
    // el badge de abajo sigue siendo editable a mano por si hace falta
    // corregirlo (ej. clic accidental, o se avisó por otro canal).
    if (!item.notificado) void toggleCampo(item, "notificado");
  }

  return (
    <div className={`${styles.theme} grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(300px,1.1fr)]`}>
      <div className="w-full space-y-4">
        <section className="w-full space-y-4 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-xl shadow-black/20">
          <div className="grid w-full items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-4">
            <label className="w-full">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#D7FF4F]">
                Buscar
              </span>
              <div className="mt-2 flex h-9 items-center gap-3 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] transition focus-within:border-[#D7FF4F]/70">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="h-4 w-4 shrink-0 text-[#A7A7A7]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="9" cy="9" r="5" />
                  <line x1="13.5" y1="13.5" x2="18" y2="18" strokeLinecap="round" />
                </svg>
                <input
                  placeholder="Cliente, cédula, equipo, teléfono, orden o factura"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-full w-full bg-transparent text-sm outline-none placeholder:text-[#A7A7A7]/50"
                />
              </div>
            </label>
          </div>

          {loading && <div className="text-sm text-[#CFCFCB]">Cargando mantenimientos…</div>}
          {error && (
            <div className="text-sm text-red-400">
              Ocurrió un problema al cargar el listado: {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {itemsFiltrados.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#3A3A36] bg-[#1E1F1C] px-4 py-6 text-sm text-[#A7A7A7]">
                  {items.length === 0
                    ? "Todavía no se ha impreso ninguna etiqueta de mantenimiento."
                    : "No se encontraron mantenimientos con esa búsqueda."}
                </div>
              ) : (
                <div className="w-full overflow-x-auto rounded-lg border border-[#3A3A36] bg-[#252622]">
                  <div className="grid min-w-[1280px] grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(105px,0.7fr)_minmax(130px,0.8fr)_minmax(140px,0.9fr)_minmax(150px,0.9fr)_minmax(150px,0.9fr)_140px_170px] border-b border-[#3A3A36] bg-[#30312D] px-6 py-3 text-[12px] uppercase tracking-wide text-[#A7A7A7]">
                    <span>Cliente</span>
                    <span>Equipo</span>
                    <span>Teléfono</span>
                    <span>Próximo mant.</span>
                    <span>Vence</span>
                    <span>Notificado</span>
                    <span>Realizado</span>
                    <span>Origen</span>
                    <span className="text-right">Acción</span>
                  </div>
                  <div className="divide-y divide-[#3A3A36]">
                    {itemsFiltrados.map((item) => (
                      <div
                        key={item.mantenimientoRecordId}
                        className="grid min-w-[1280px] grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(105px,0.7fr)_minmax(130px,0.8fr)_minmax(140px,0.9fr)_minmax(150px,0.9fr)_minmax(150px,0.9fr)_140px_170px] items-center bg-[#252622] px-6 py-3 text-sm text-[#CFCFCB] transition hover:bg-[#2D2E2A]"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setHistorialCliente({ identificacion: item.clienteIdentificacion, nombre: item.clienteNombre })
                          }
                          className="truncate text-left font-semibold text-white underline decoration-dotted decoration-[#5A5A54] underline-offset-2 hover:text-[#D7FF4F]"
                          title={`Ver historial de ${item.clienteNombre}`}
                        >
                          {item.clienteNombre}
                        </button>
                        <span className="truncate text-[#CFCFCB]" title={item.equipo}>
                          {item.equipo}
                        </span>
                        <span className="truncate text-[#CFCFCB]">{item.telefono || "-"}</span>
                        <span className="text-[#CFCFCB]">{formatFecha(item.fecha)}</span>
                        <span>
                          <BadgeDias fecha={item.fecha} realizado={item.realizado} />
                        </span>
                        <span>
                          <button
                            type="button"
                            onClick={() => toggleCampo(item, "notificado")}
                            disabled={guardandoId === item.mantenimientoRecordId}
                            title="Clic para cambiar el estado a mano"
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
                              item.notificado
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-500/70"
                                : "border-[#3A3A36] bg-[#1E1F1C] text-[#A7A7A7] hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
                            }`}
                          >
                            {item.notificado ? "✓ Notificado" : "Pendiente"}
                          </button>
                        </span>
                        <span>
                          <button
                            type="button"
                            onClick={() => toggleCampo(item, "realizado")}
                            disabled={guardandoId === item.mantenimientoRecordId}
                            title="Marcar si el cliente ya trajo el equipo y se le hizo el mantenimiento"
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
                              item.realizado
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-500/70"
                                : "border-[#3A3A36] bg-[#1E1F1C] text-[#A7A7A7] hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
                            }`}
                          >
                            {item.realizado ? "✓ Hecho" : "No aún"}
                          </button>
                        </span>
                        <span>
                          <BadgeOrigen item={item} />
                        </span>
                        <span className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => enviarWhatsApp(item)}
                            title="Enviar recordatorio por WhatsApp"
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-[#D7FF4F] transition hover:brightness-110"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#151515]" aria-hidden="true">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <div className="rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-xl shadow-black/20">
          <p className="text-sm font-semibold text-white">Mantenimientos registrados</p>
          <p className="mt-2 text-3xl font-bold text-[#D7FF4F]">{items.length}</p>
          <p className="mt-1 text-xs text-[#A7A7A7]">Órdenes y facturas con etiqueta impresa</p>
        </div>
        <div className="rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-xl shadow-black/20">
          <p className="text-sm font-semibold text-white">Pendientes de notificar</p>
          <p className="mt-2 text-3xl font-bold text-amber-300">{pendientes}</p>
          <p className="mt-1 text-xs text-[#A7A7A7]">Aún sin aviso de WhatsApp</p>
        </div>
        <div className="rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-xl shadow-black/20">
          <p className="text-sm font-semibold text-white">Ver historial</p>
          <p className="mt-1 text-xs text-[#A7A7A7]">
            Haz clic en el nombre de un cliente en la tabla para ver todos sus ciclos de mantenimiento y su cumplimiento.
          </p>
        </div>
      </aside>

      {historialCliente && (
        <HistorialModal cliente={historialCliente} items={items} onClose={() => setHistorialCliente(null)} />
      )}
    </div>
  );
}
