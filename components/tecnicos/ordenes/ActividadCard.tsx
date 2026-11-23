"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Destello } from "@/components/asistente/ui";
import { buildWhatsAppUrl } from "@/lib/tecnicos/whatsapp";
import {
  FILTROS_ACTIVIDAD, NOTA_MAX, VISIBLES_AL_INICIO, esEditable, filtrar,
  type EntradaActividad, type FiltroActividad, type Visibilidad,
} from "@/lib/tecnicos/actividad/reglas";

// Actividad de la orden (rediseño R3, tableros 1 y 3 aprobados el 22-nov):
// notas, mensajes al cliente y todo lo que pasa en la orden en UNA línea de
// tiempo, la más reciente arriba. ✨ redacta el mensaje para el cliente con
// la IA; la persona lo revisa y lo envía por WhatsApp (o lo copia).
//
// 23-nov (lo vio el personal el primer día): el selector «Nota interna / Al
// cliente» confundía. Ahora no se elige nada antes: se escribe y el BOTÓN dice
// qué es — «Guardar» = queda en la actividad (solo el personal) · «WhatsApp» =
// abre el chat del cliente con el texto y queda como mensaje al cliente.

type Datos = { entradas: EntradaActividad[]; estado: string; telefono: string; cliente: string };

const fechaCorta = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
};

function Icono({ e }: { e: EntradaActividad }) {
  const c = e.tipo === "Pago" ? "#56E3A4" : e.visibilidad === "Al cliente" ? "#D7FF4F" : e.tipo === "Nota" ? "#B5B5AE" : "#78B7FF";
  if (e.tipo === "Pago") return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="4" width="12" height="8.5" rx="1.5" fill="none" stroke={c} strokeWidth="1.3" /><path d="M2 7h12" stroke={c} strokeWidth="1.3" /></svg>;
  if (e.tipo === "Nota" || e.tipo === "Aviso al cliente") return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h10v8H6l-3 2.5z" fill="none" stroke={c} strokeWidth="1.3" strokeLinejoin="round" /></svg>;
  if (e.tipo === "Aprobación del cliente" || e.tipo === "Trabajo") return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.3l3 2.9 7-7.2" fill="none" stroke={e.tipo === "Trabajo" ? "#56E3A4" : c} strokeWidth="1.5" /></svg>;
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.6" fill={c} /></svg>;
}

/** Avión de papel (enviar): genérico, no es el logo de WhatsApp. */
function Enviar() {
  return <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8l11.5-5.5L10 14l-2-4.5z M8 9.5l5.5-7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
}

const seg = (activo: boolean) =>
  `h-[26px] px-2.5 text-[11px] font-bold transition-colors duration-150 ${activo ? "bg-[rgba(215,255,79,.12)] text-[#D7FF4F]" : "bg-[#1E1F1C] text-[#B5B5AE] hover:text-white"}`;

export function ActividadCard({ ordenId, refrescar, pedirMensaje = 0, pedirNota = 0, onGuardada }: {
  ordenId: string;
  /** Cambia cuando algo de afuera escribió en la actividad (estado, trabajos, pagos…). */
  refrescar?: string | number;
  /** Rediseño R1: «Avisar al cliente» de la cabecera sube este número → ✨ borrador Al cliente. */
  pedirMensaje?: number;
  /** Rediseño R10: «Anotar avance» de la franja de alerta sube este número → nota interna con el cursor listo. */
  pedirNota?: number;
  /** Se guardó una nota (con WhatsApp = aviso al cliente): la orden se relee. */
  onGuardada?: (enviado: boolean) => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroActividad>("Todo");
  const [todas, setTodas] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  // Mensajes largos al cliente: 4 líneas y «ver todo» (menos desplazamiento).
  const [abiertos, setAbiertos] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const [borrador, setBorrador] = useState<string | null>(null);
  const [ia, setIa] = useState<"redactar" | "corto" | "otro" | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [verMensaje, setVerMensaje] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const tarjeta = useRef<HTMLElement>(null);
  const [llamado, setLlamado] = useState(0);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/actividad`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo leer la actividad.");
      setDatos(j.data as Datos);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la actividad.");
    }
  }, [ordenId]);

  useEffect(() => { void cargar(); }, [cargar, refrescar]);

  // El cuadro crece con el texto (hasta 6 líneas): sin desplazamiento extra.
  useEffect(() => {
    const t = area.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 132)}px`;
  }, [texto]);

  /** «nota»: solo el personal · «whatsapp»: abre el chat y queda como mensaje · «copiar»: al portapapeles y queda como mensaje. */
  async function guardar(contenido: string, como: "nota" | "whatsapp" | "copiar") {
    if (guardando || contenido.trim().length < 2) return;
    const enviar = como !== "nota";
    const vis: Visibilidad = enviar ? "Al cliente" : "Interna";
    // WhatsApp se abre ANTES de esperar al servidor: el navegador no bloquea la ventana.
    const wa = como === "whatsapp" ? buildWhatsAppUrl(datos?.telefono, contenido.trim()) : null;
    if (como === "whatsapp" && !wa) { setError("El cliente no tiene un teléfono válido para WhatsApp."); return; }
    if (wa) window.open(wa, "_blank", "noopener,noreferrer");
    if (como === "copiar") {
      try { await navigator.clipboard.writeText(contenido.trim()); } catch { setError("No se pudo copiar. Selecciona el texto y cópialo."); return; }
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/actividad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: contenido.trim(), visibilidad: vis, enviado: enviar }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      const e = j.data as EntradaActividad;
      setDatos((d) => (d ? { ...d, entradas: [e, ...d.entradas] } : d));
      setNueva(e.id);
      setTexto("");
      setBorrador(null);
      onGuardada?.(enviar);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function pedirIA(accion: "redactar" | "corto" | "otro") {
    if (ia) return;
    setIa(accion);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/asistente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accion === "redactar" ? { modo: "orden", accion, apunte: texto } : { modo: "orden", accion, mensajeActual: borrador ?? "" }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "La IA no respondió.");
      setBorrador(String(j.data?.mensaje ?? "").trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "La IA no respondió.");
    } finally {
      setIa(null);
    }
  }

  // «Avisar al cliente» (cabecera): la tarjeta se trae a la vista, destella y
  // la IA arma el borrador para el cliente con lo que dice la orden.
  useEffect(() => {
    if (!pedirMensaje) return;
    tarjeta.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setLlamado((n) => n + 1);
    void pedirIA("redactar");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedirMensaje]);

  useEffect(() => {
    if (!pedirNota) return;
    tarjeta.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setLlamado((n) => n + 1);
    setTimeout(() => area.current?.focus(), 250);
  }, [pedirNota]);

  const telefonoOk = !!buildWhatsAppUrl(datos?.telefono, "x");

  async function copiar(e: EntradaActividad) {
    try {
      await navigator.clipboard.writeText(e.texto);
      setCopiado(e.id);
      setTimeout(() => setCopiado((c) => (c === e.id ? null : c)), 1500);
    } catch {
      setError("No se pudo copiar. Selecciona el texto y cópialo.");
    }
  }

  async function guardarEdicion() {
    if (!editando) return;
    const t = editando.texto.trim();
    if (t.length < 2) return;
    try {
      const res = await fetch(`/api/tecnicos/historial/${encodeURIComponent(editando.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estadoNuevo: t }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo corregir.");
      setDatos((d) => (d ? { ...d, entradas: d.entradas.map((x) => (x.id === editando.id ? { ...x, texto: t } : x)) } : d));
      setEditando(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo corregir.");
    }
  }

  async function borrar(id: string) {
    try {
      const res = await fetch(`/api/tecnicos/historial/${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo borrar.");
      setDatos((d) => (d ? { ...d, entradas: d.entradas.filter((x) => x.id !== id) } : d));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      setBorrando(null);
    }
  }

  const lista = datos ? filtrar(datos.entradas, filtro) : [];
  const visibles = todas ? lista : lista.slice(0, VISIBLES_AL_INICIO);

  return (
    <section ref={tarjeta} key={llamado ? `llamado-${llamado}` : undefined} className={`scroll-mt-20 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3.5 py-3 ${llamado ? "animate-[sg-destello_700ms_ease-out]" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <h2 className="text-sm font-bold text-[#F0F0EC]">Actividad</h2>
        <div role="tablist" aria-label="Filtrar actividad" className="ml-auto inline-flex overflow-hidden rounded-lg border border-[#3A3A36]">
          {FILTROS_ACTIVIDAD.map((f, i) => (
            <button key={f} type="button" role="tab" aria-selected={filtro === f} onClick={() => setFiltro(f)} className={`${seg(filtro === f)} ${i ? "border-l border-[#3A3A36]" : ""}`}>{f}</button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 pb-2">
        <label htmlFor={`nota-${ordenId}`} className="sr-only">Escribe en la actividad</label>
        <textarea
          id={`nota-${ordenId}`}
          ref={area}
          rows={1}
          maxLength={NOTA_MAX}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void guardar(texto, "nota"); }
          }}
          placeholder="Anota lo que pasó o escribe el mensaje para el cliente…"
          className="min-h-8 min-w-0 flex-1 resize-none rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 py-1.5 text-sm leading-snug text-[#F0F0EC] outline-none transition placeholder:text-[#6E6E68] focus:border-[#D7FF4F]"
        />
        <button type="button" onClick={() => void pedirIA("redactar")} disabled={!!ia} aria-label="Redactar mensaje para el cliente con IA" title="La IA redacta el mensaje para el cliente"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[rgba(215,255,79,.5)] text-[#D7FF4F] transition hover:bg-[rgba(215,255,79,.08)] disabled:opacity-50">
          {ia === "redactar" ? <span className="h-3 w-3 animate-spin rounded-full border border-[#D7FF4F] border-t-transparent" /> : <Destello size={14} />}
        </button>
        <button type="button" onClick={() => void guardar(texto, "nota")} disabled={guardando || texto.trim().length < 2} title="Queda en la actividad (solo el personal)"
          className="h-8 shrink-0 rounded-lg bg-[#D7FF4F] px-3 text-xs font-bold text-[#151613] transition hover:brightness-95 disabled:opacity-50">
          Guardar
        </button>
        <button type="button" onClick={() => void guardar(texto, "whatsapp")} disabled={guardando || texto.trim().length < 2 || !telefonoOk}
          title={telefonoOk ? "Abre el WhatsApp del cliente con este texto y queda como mensaje al cliente" : "El cliente no tiene un teléfono válido"}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[rgba(86,227,164,.55)] px-2.5 text-xs font-bold text-[#56E3A4] transition hover:bg-[rgba(86,227,164,.08)] disabled:opacity-40">
          <Enviar />WhatsApp
        </button>
      </div>

      {borrador !== null && (
        <div className="mb-2 space-y-2 rounded-[10px] border border-[rgba(215,255,79,.35)] bg-[rgba(215,255,79,.04)] p-2.5 animate-[sg-entrada_160ms_ease-out]">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#D7FF4F]"><Destello size={12} />Borrador de la IA · revisa antes</span>
          <textarea value={borrador} onChange={(e) => setBorrador(e.target.value)} rows={Math.min(14, Math.max(4, borrador.split("\n").length + 1))} maxLength={NOTA_MAX}
            className="w-full resize-none rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 py-2 text-sm leading-relaxed text-[#F0F0EC] outline-none focus:border-[#D7FF4F]" />
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => void pedirIA("corto")} disabled={!!ia} className="h-7 rounded-md border border-[#3A3A36] px-2.5 text-[11px] font-semibold text-[#F0F0EC] disabled:opacity-50">{ia === "corto" ? "…" : "Más corto"}</button>
            <button type="button" onClick={() => void pedirIA("otro")} disabled={!!ia} className="h-7 rounded-md border border-[#3A3A36] px-2.5 text-[11px] font-semibold text-[#F0F0EC] disabled:opacity-50">{ia === "otro" ? "…" : "Otra versión"}</button>
            <button type="button" onClick={() => setBorrador(null)} className="h-7 px-1.5 text-[11px] font-semibold text-[#B5B5AE] hover:text-white">Descartar</button>
            <span className="flex-1" />
            <button type="button" onClick={() => void guardar(borrador, "copiar")} disabled={guardando || borrador.trim().length < 2} title="Lo copia para pegarlo en WhatsApp y queda como mensaje al cliente" className="h-7 rounded-md border border-[#3A3A36] px-2.5 text-[11px] font-semibold text-[#F0F0EC] disabled:opacity-50">Copiar</button>
            <button type="button" onClick={() => void guardar(borrador, "whatsapp")} disabled={guardando || borrador.trim().length < 2 || !telefonoOk} title={telefonoOk ? undefined : "El cliente no tiene un teléfono válido"} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#56E3A4] px-2.5 text-[11px] font-bold text-[#0F1A14] disabled:opacity-50"><Enviar />Enviar por WhatsApp</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="pb-2 text-xs text-[#FF7A70] animate-[sg-sacudir_240ms_ease-out]">{error}</p>}

      {!datos && !error && <p className="py-2 text-xs text-[#B5B5AE]">Cargando…</p>}
      {datos && lista.length === 0 && <p className="border-t border-[#2C2D29] py-3 text-xs text-[#B5B5AE]">{filtro === "Todo" ? "Todavía no hay actividad." : "Nada en este filtro."}</p>}

      <ul>
        {visibles.map((e) => (
          <li key={e.id} className={`group grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2.5 border-t border-[#2C2D29] py-2 ${nueva === e.id ? "animate-[sg-entrada_180ms_ease-out,sg-destello_900ms_ease-out]" : ""}`}>
            <span className="pt-0.5"><Icono e={e} /></span>
            <div className="min-w-0 text-sm leading-snug text-[#F0F0EC]">
              {editando?.id === e.id ? (
                <textarea autoFocus rows={2} value={editando.texto} onChange={(x) => setEditando({ id: e.id, texto: x.target.value })}
                  onKeyDown={(x) => { if (x.key === "Enter" && !x.shiftKey) { x.preventDefault(); void guardarEdicion(); } if (x.key === "Escape") setEditando(null); }}
                  onBlur={() => void guardarEdicion()}
                  className="w-full resize-none rounded-md border border-[#3A3A36] bg-[#151613] px-2 py-1 text-sm text-[#F0F0EC] outline-none focus:border-[#D7FF4F]" />
              ) : (
                (() => {
                  const largo = e.tipo === "Aviso al cliente" && (e.texto.split("\n").length > 4 || e.texto.length > 260);
                  const cerrado = largo && !abiertos.includes(e.id);
                  return (
                    <>
                      <span className={`whitespace-pre-wrap ${cerrado ? "line-clamp-4" : ""} ${e.anulado ? "text-[#8A8A80] line-through" : ""}`}>{e.texto}</span>
                      {largo && (
                        <button type="button" onClick={() => setAbiertos((a) => (cerrado ? [...a, e.id] : a.filter((x) => x !== e.id)))}
                          className="mr-1.5 text-[11px] font-semibold text-[#D7FF4F] hover:underline">{cerrado ? "ver todo" : "ver menos"}</button>
                      )}
                    </>
                  );
                })()
              )}
              {e.tipo === "Nota" && e.visibilidad === "Al cliente" && (
                <span className="ml-1.5 inline-flex h-[18px] items-center rounded-full bg-[rgba(215,255,79,.12)] px-1.5 align-[1px] text-[10px] font-bold text-[#D7FF4F]">La ve el cliente</span>
              )}
              {e.tipo === "Aviso al cliente" && <span className="ml-1.5 inline-flex h-[18px] items-center rounded-full bg-[rgba(86,227,164,.13)] px-1.5 align-[1px] text-[10px] font-bold text-[#56E3A4]">Enviado al cliente</span>}
              {e.mensajeAnterior && (
                <button type="button" onClick={() => setVerMensaje(verMensaje === e.id ? null : e.id)} className="ml-1.5 text-[11px] font-semibold text-[#D7FF4F] hover:underline">
                  {verMensaje === e.id ? "ocultar mensaje" : "mensaje al cliente"}
                </button>
              )}
              {verMensaje === e.id && e.mensajeAnterior && (
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-[#151613] px-2 py-1.5 text-xs text-[#D6D6D0] animate-[sg-entrada_140ms_ease-out]">{e.mensajeAnterior}</p>
              )}
              {borrando === e.id && (
                <span className="mt-1 flex items-center gap-2 text-xs text-[#B5B5AE] animate-[sg-entrada_120ms_ease-out]">
                  ¿Borrar esta nota?
                  <button type="button" onClick={() => setBorrando(null)} className="font-semibold text-[#F0F0EC]">No</button>
                  <button type="button" onClick={() => void borrar(e.id)} className="font-semibold text-[#FF7A70]">Borrar</button>
                </span>
              )}
            </div>
            <span className="flex items-center gap-1 whitespace-nowrap text-xs text-[#B5B5AE]">
              {(esEditable(e) || e.tipo === "Aviso al cliente") && editando?.id !== e.id && (
                <span className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button type="button" onClick={() => void copiar(e)} aria-label="Copiar" title={copiado === e.id ? "Copiado" : "Copiar"} className="grid h-6 w-6 place-items-center rounded text-[#B5B5AE] hover:bg-[#2C2D29] hover:text-white">
                    {copiado === e.id
                      ? <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.3l3 2.9 7-7.2" fill="none" stroke="#56E3A4" strokeWidth="1.6" /></svg>
                      : <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H10" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>}
                  </button>
                  {esEditable(e) && (
                    <>
                      <button type="button" onClick={() => setEditando({ id: e.id, texto: e.texto })} aria-label="Corregir" title="Corregir" className="grid h-6 w-6 place-items-center rounded text-[#B5B5AE] hover:bg-[#2C2D29] hover:text-white">
                        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
                      </button>
                      <button type="button" onClick={() => setBorrando(e.id)} aria-label="Borrar" title="Borrar" className="grid h-6 w-6 place-items-center rounded text-[#B5B5AE] hover:bg-[#2C2D29] hover:text-[#FF7A70]">
                        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
                      </button>
                    </>
                  )}
                </span>
              )}
              {[e.autor, fechaCorta(e.fecha)].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>

      {lista.length > VISIBLES_AL_INICIO && (
        <div className="border-t border-[#2C2D29] pt-2">
          <button type="button" onClick={() => setTodas((v) => !v)} className="text-xs font-semibold text-[#D7FF4F] hover:underline">
            {todas ? "Ver menos" : `Ver toda la actividad (${lista.length})`}
          </button>
        </div>
      )}
    </section>
  );
}
