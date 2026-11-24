"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Destello } from "@/components/asistente/ui";
import { desplazar } from "@/components/tecnicos/desplazar";
import { buildWhatsAppUrl } from "@/lib/tecnicos/whatsapp";
import {
  FILTROS_ACTIVIDAD, NOTA_MAX, VISIBLES_AL_INICIO, esEditable, filtrar, leerEnviadoPor, lineaParaAvisar,
  type EntradaActividad, type FiltroActividad,
} from "@/lib/tecnicos/actividad/reglas";

// Actividad de la orden (rediseño R3, tableros 1 y 3) — v2 del 24-nov
// (tableros 13–15, aprobados por el dueño tras el primer día del personal).
//
//   1) La caja solo ANOTA: «Anota lo que pasó…» + Guardar (Enter).
//   2) Cada línea de una persona, cada cambio de estado y cada trabajo trae
//      «✨ Crear mensaje»: la IA convierte ESA línea en el mensaje para el
//      cliente, que queda pegado debajo, se guarda solo y se corrige ahí mismo.
//   3) Junto al mensaje: «Enviar por WhatsApp» (wa.me con el teléfono y el
//      texto; con la API de WhatsApp, el mismo botón enviará directo) o
//      «Copiar» (WhatsApp de escritorio). Queda «Enviado · quién · cuándo».
// Así no hay dos lugares con «Guardar» ni un borrador que se pierda.

type Datos = { entradas: EntradaActividad[]; estado: string; telefono: string; cliente: string };
type Accion = "crear" | "corto" | "otro" | "talCual" | "guardar" | "enviar" | "descartar";

const fechaCorta = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
};

function Icono({ e }: { e: EntradaActividad }) {
  const c = e.tipo === "Pago" ? "#56E3A4" : e.tipo === "Aviso al cliente" ? "#56E3A4" : e.tipo === "Nota" ? "#B5B5AE" : "#78B7FF";
  if (e.tipo === "Pago") return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="4" width="12" height="8.5" rx="1.5" fill="none" stroke={c} strokeWidth="1.3" /><path d="M2 7h12" stroke={c} strokeWidth="1.3" /></svg>;
  if (e.tipo === "Nota" || e.tipo === "Aviso al cliente") return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h10v8H6l-3 2.5z" fill="none" stroke={c} strokeWidth="1.3" strokeLinejoin="round" /></svg>;
  if (e.tipo === "Aprobación del cliente" || e.tipo === "Trabajo") return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.3l3 2.9 7-7.2" fill="none" stroke={e.tipo === "Trabajo" ? "#56E3A4" : "#D7FF4F"} strokeWidth="1.5" /></svg>;
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.6" fill={c} /></svg>;
}

/** Avión de papel (enviar): genérico, no es el logo de WhatsApp. */
function Enviar() {
  return <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8l11.5-5.5L10 14l-2-4.5z M8 9.5l5.5-7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
}
function Copia() {
  return <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H10" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>;
}
function Listo() {
  return <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.3l3 2.9 7-7.2" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>;
}
const Giro = () => <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />;

const seg = (activo: boolean) =>
  `h-[26px] px-2.5 text-[11px] font-bold transition-colors duration-150 ${activo ? "bg-[rgba(215,255,79,.12)] text-[#D7FF4F]" : "bg-[#1E1F1C] text-[#B5B5AE] hover:text-white"}`;
const mini = "inline-flex h-7 items-center gap-1.5 rounded-md border border-[#3A3A36] px-2.5 text-[11px] font-bold text-[#F0F0EC] transition hover:bg-[#2C2D29] disabled:opacity-50";
const ligero = "inline-flex h-7 items-center rounded-md px-2 text-[11px] font-bold text-[#D6D6D0] transition hover:bg-[#2C2D29] hover:text-white disabled:opacity-50";

/** El mensaje para el cliente pegado a una línea. */
function MensajeCliente({ e, abierto, ocupado, telefonoOk, onAbrir, onAccion }: {
  e: EntradaActividad;
  abierto: boolean;
  ocupado: Accion | null;
  telefonoOk: boolean;
  onAbrir: (abrir: boolean) => void;
  onAccion: (a: Accion, texto?: string, via?: "WhatsApp" | "Copiado") => void;
}) {
  const m = e.mensaje!;
  const [texto, setTexto] = useState(m.texto);
  const [guardado, setGuardado] = useState<"" | "guardando" | "listo">("");
  const ultimo = useRef(m.texto);
  const accion = useRef(onAccion);
  accion.current = onAccion;
  // Solo se reemplaza lo escrito si el texto cambió por otra vía (Más corto, Otra versión),
  // no cuando vuelve lo mismo que se acaba de guardar (no se pierde lo que se sigue escribiendo).
  useEffect(() => { if (m.texto !== ultimo.current) { setTexto(m.texto); ultimo.current = m.texto; } }, [m.texto]);

  // Se guarda solo (sin botón «Guardar»): un momento después de dejar de escribir.
  useEffect(() => {
    if (!abierto || m.enviado || texto === ultimo.current || texto.trim().length < 2) return;
    const t = setTimeout(() => { ultimo.current = texto; setGuardado("guardando"); accion.current("guardar", texto); }, 900);
    return () => clearTimeout(t);
  }, [texto, abierto, m.enviado]);
  useEffect(() => { if (guardado === "guardando" && ocupado !== "guardar") setGuardado("listo"); }, [ocupado, guardado]);
  // Guardar no bloquea: se puede enviar mientras se guarda.
  const bloqueado = !!ocupado && ocupado !== "guardar";

  const enviar = (via: "WhatsApp" | "Copiado") => { ultimo.current = texto; onAccion("enviar", texto, via); };
  const por = leerEnviadoPor(m.enviadoPor);
  const filas = Math.min(16, Math.max(4, texto.split("\n").length + 1));

  if (m.enviado || !abierto) {
    return (
      <div className={`mt-2 rounded-[10px] border bg-[#151613] px-2.5 py-2 animate-[sg-entrada_160ms_ease-out] ${m.enviado ? "border-[#2F4A3D]" : "border-[#3A3A36]"}`}>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          {m.enviado
            ? <span className="inline-flex items-center gap-1 text-[#56E3A4]"><Listo />{por?.via === "Copiado" ? "Copiado" : "Enviado por WhatsApp"}{por?.nombre ? ` · ${por.nombre}` : ""} · {fechaCorta(m.enviado)}</span>
            : <span className="text-[#D7FF4F]">Mensaje para el cliente</span>}
          <span className="flex-1" />
          <button type="button" onClick={() => enviar("Copiado")} disabled={bloqueado} className={mini} title="Lo copia para pegarlo en WhatsApp">{ocupado === "enviar" ? <Giro /> : <Copia />}Copiar</button>
          <button type="button" onClick={() => enviar("WhatsApp")} disabled={bloqueado || !telefonoOk} title={telefonoOk ? "Abre el WhatsApp del cliente con este mensaje" : "El cliente no tiene un teléfono válido"}
            className={`${mini} border-[rgba(86,227,164,.55)] text-[#56E3A4]`}><Enviar />{m.enviado ? "Reenviar" : "Enviar por WhatsApp"}</button>
        </div>
        {m.enviado && abierto
          ? <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[#D6D6D0] animate-[sg-entrada_140ms_ease-out]">{m.texto}</p>
          : <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#D6D6D0]">{m.texto.replace(/\s*\n+\s*/g, " ")}</p>}
        <button type="button" onClick={() => onAbrir(!(m.enviado && abierto))} className="text-[11px] font-semibold text-[#D7FF4F] hover:underline">
          {m.enviado ? (abierto ? "ver menos" : "ver todo") : "ver todo · corregir"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-[10px] border border-[rgba(215,255,79,.5)] bg-[#151613] animate-[sg-entrada_160ms_ease-out]">
      <div className="flex items-center gap-1.5 px-2.5 pt-2 text-[11px] font-bold text-[#D7FF4F]">
        <Destello size={12} />Mensaje para el cliente · sin enviar
        <span className="flex-1" />
        <span className="font-semibold text-[#8A8A84]">{guardado === "guardando" ? "Guardando…" : guardado === "listo" ? "Guardado" : "Se guarda solo"}</span>
        <button type="button" onClick={() => onAbrir(false)} aria-label="Plegar el mensaje" title="Plegar" className="ml-1 grid h-6 w-6 place-items-center rounded text-[#B5B5AE] hover:bg-[#2C2D29] hover:text-white">
          <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        </button>
      </div>
      <label htmlFor={`msg-${e.id}`} className="sr-only">Mensaje para el cliente</label>
      <textarea id={`msg-${e.id}`} value={texto} onChange={(x) => setTexto(x.target.value)} rows={filas} maxLength={NOTA_MAX}
        className="block w-full resize-none border-0 bg-transparent px-2.5 py-2 text-sm leading-relaxed text-[#F0F0EC] outline-none" />
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[#2C2D29] px-2.5 py-2">
        <button type="button" onClick={() => enviar("WhatsApp")} disabled={bloqueado || texto.trim().length < 2 || !telefonoOk}
          title={telefonoOk ? "Abre el WhatsApp del cliente con este mensaje" : "El cliente no tiene un teléfono válido"}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#56E3A4] px-3 text-[11px] font-bold text-[#0F1A14] transition hover:brightness-95 disabled:opacity-50"><Enviar />Enviar por WhatsApp</button>
        <button type="button" onClick={() => enviar("Copiado")} disabled={bloqueado || texto.trim().length < 2} title="Lo copia para pegarlo en WhatsApp" className={mini}><Copia />Copiar</button>
        <span className="flex-1" />
        <button type="button" onClick={() => onAccion("corto")} disabled={bloqueado} className={ligero}>{ocupado === "corto" ? <Giro /> : "Más corto"}</button>
        <button type="button" onClick={() => onAccion("otro")} disabled={bloqueado} className={ligero}>{ocupado === "otro" ? <Giro /> : "Otra versión"}</button>
        <button type="button" onClick={() => onAccion("descartar")} disabled={bloqueado} className={`${ligero} text-[#8A8A84]`}>Descartar</button>
      </div>
    </div>
  );
}

export function ActividadCard({ ordenId, refrescar, pedirMensaje = 0, pedirNota = 0, onGuardada }: {
  ordenId: string;
  /** Cambia cuando algo de afuera escribió en la actividad (estado, trabajos, pagos…). */
  refrescar?: string | number;
  /** «Avisar al cliente» (cabecera) / «Escribir al cliente» (alerta): crea el mensaje en la línea que toca. */
  pedirMensaje?: number;
  /** «Anotar avance» de la franja de alerta: la caja con el cursor listo. */
  pedirNota?: number;
  /** Se guardó una nota (false) o se envió un mensaje (true): la orden se relee. */
  onGuardada?: (enviado: boolean) => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroActividad>("Todo");
  const [todas, setTodas] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [largos, setLargos] = useState<string[]>([]);
  const [abiertos, setAbiertos] = useState<string[]>([]);
  const [trabajo, setTrabajo] = useState<{ id: string; accion: Accion } | null>(null);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const tarjeta = useRef<HTMLElement>(null);
  const [llamado, setLlamado] = useState(0);
  const atendido = useRef(0);

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

  // La caja crece con el texto (hasta 6 líneas): sin desplazamiento extra.
  useEffect(() => {
    const t = area.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 132)}px`;
  }, [texto]);

  const telefonoOk = !!buildWhatsAppUrl(datos?.telefono, "x");
  const abrir = (id: string, si: boolean) => setAbiertos((a) => (si ? (a.includes(id) ? a : [...a, id]) : a.filter((x) => x !== id)));

  /** La caja solo anota (nota del personal). */
  async function anotar() {
    const contenido = texto.trim();
    if (guardando || contenido.length < 2) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/actividad`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: contenido, visibilidad: "Interna", enviado: false }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      const e = { ...(j.data as EntradaActividad), puedeMensaje: true };
      setDatos((d) => (d ? { ...d, entradas: [e, ...d.entradas] } : d));
      setNueva(e.id);
      setTexto("");
      onGuardada?.(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  /** Todo lo del mensaje de una línea pasa por aquí (crear, variar, guardar, enviar, descartar). */
  const telefono = datos?.telefono;
  const mensaje = useCallback(async (id: string, accion: Accion, contenido?: string, via?: "WhatsApp" | "Copiado") => {
    if (accion === "enviar") {
      const t = (contenido ?? "").trim();
      // WhatsApp se abre ANTES de esperar al servidor: el navegador no bloquea la ventana.
      if (via === "WhatsApp") {
        const wa = buildWhatsAppUrl(telefono, t);
        if (!wa) { setError("El cliente no tiene un teléfono válido para WhatsApp."); return; }
        window.open(wa, "_blank", "noopener,noreferrer");
      } else {
        try { await navigator.clipboard.writeText(t); } catch { setError("No se pudo copiar. Selecciona el texto y cópialo."); return; }
      }
    }
    setTrabajo({ id, accion });
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/actividad/${encodeURIComponent(id)}/mensaje`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, texto: contenido, via }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo con el mensaje.");
      const e = j.data as EntradaActividad;
      setDatos((d) => (d ? { ...d, entradas: d.entradas.map((x) => (x.id === e.id ? { ...x, ...e, mensaje: e.mensaje } : x)) } : d));
      if (accion === "crear" || accion === "talCual") setAbiertos((a) => (a.includes(id) ? a : [...a, id]));
      if (accion === "enviar" || accion === "descartar") setAbiertos((a) => a.filter((x) => x !== id));
      if (accion === "enviar") onGuardada?.(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo con el mensaje.");
    } finally {
      setTrabajo(null);
    }
  }, [ordenId, telefono, onGuardada]);

  // «Avisar al cliente» (cabecera) / «Escribir al cliente» (alerta): el mensaje
  // nace en la línea que toca (Completado → «Estado: Completado»), a la vista.
  useEffect(() => {
    if (!pedirMensaje || !datos || atendido.current === pedirMensaje) return;
    atendido.current = pedirMensaje;
    setFiltro("Todo");
    const id = lineaParaAvisar(datos.entradas, datos.estado);
    if (!id) {
      desplazar(tarjeta.current);
      setLlamado((n) => n + 1);
      setError("Anota primero qué pasó; luego «Crear mensaje» en esa línea.");
      setTimeout(() => area.current?.focus(), 250);
      return;
    }
    if (datos.entradas.findIndex((x) => x.id === id) >= VISIBLES_AL_INICIO) setTodas(true);
    const linea = datos.entradas.find((x) => x.id === id);
    if (linea?.mensaje && !linea.mensaje.enviado) setAbiertos((a) => (a.includes(id) ? a : [...a, id]));
    else void mensaje(id, "crear");
    setTimeout(() => desplazar(document.getElementById(`act-${id}`)), 60);
  }, [pedirMensaje, datos, mensaje]);

  useEffect(() => {
    if (!pedirNota) return;
    desplazar(tarjeta.current);
    setLlamado((n) => n + 1);
    setTimeout(() => area.current?.focus(), 250);
  }, [pedirNota]);

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
  const ocupadoEn = (id: string) => (trabajo?.id === id ? trabajo.accion : null);

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
        <label htmlFor={`nota-${ordenId}`} className="sr-only">Anota lo que pasó</label>
        <textarea
          id={`nota-${ordenId}`}
          ref={area}
          rows={1}
          maxLength={NOTA_MAX}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void anotar(); } }}
          placeholder="Anota lo que pasó…"
          className="min-h-8 min-w-0 flex-1 resize-none rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 py-1.5 text-sm leading-snug text-[#F0F0EC] outline-none transition placeholder:text-[#6E6E68] focus:border-[#D7FF4F]"
        />
        <button type="button" onClick={() => void anotar()} disabled={guardando || texto.trim().length < 2}
          className="h-8 shrink-0 rounded-lg bg-[#D7FF4F] px-3 text-xs font-bold text-[#151613] transition hover:brightness-95 disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {error && <p role="alert" className="pb-2 text-xs text-[#FF7A70] animate-[sg-sacudir_240ms_ease-out]">{error}</p>}

      {!datos && !error && <p className="py-2 text-xs text-[#B5B5AE]">Cargando…</p>}
      {datos && lista.length === 0 && <p className="border-t border-[#2C2D29] py-3 text-xs text-[#B5B5AE]">{filtro === "Todo" ? "Todavía no hay actividad." : "Nada en este filtro."}</p>}

      <ul>
        {visibles.map((e) => {
          const largo = (e.tipo === "Nota" || e.tipo === "Aviso al cliente") && (e.texto.split("\n").length > 4 || e.texto.length > 260);
          const cerrado = largo && !largos.includes(e.id);
          const ocupado = ocupadoEn(e.id);
          const creando = ocupado === "crear" || ocupado === "talCual";
          return (
            <li key={e.id} id={`act-${e.id}`} className={`group grid scroll-mt-24 grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2.5 border-t border-[#2C2D29] py-2 ${nueva === e.id ? "animate-[sg-entrada_180ms_ease-out,sg-destello_700ms_ease-out]" : ""}`}>
              <span className="pt-0.5"><Icono e={e} /></span>
              <div className="min-w-0 text-sm leading-snug text-[#F0F0EC]">
                {editando?.id === e.id ? (
                  <textarea autoFocus rows={2} value={editando.texto} onChange={(x) => setEditando({ id: e.id, texto: x.target.value })}
                    onKeyDown={(x) => { if (x.key === "Enter" && !x.shiftKey) { x.preventDefault(); void guardarEdicion(); } if (x.key === "Escape") setEditando(null); }}
                    onBlur={() => void guardarEdicion()}
                    className="w-full resize-none rounded-md border border-[#3A3A36] bg-[#151613] px-2 py-1 text-sm text-[#F0F0EC] outline-none focus:border-[#D7FF4F]" />
                ) : (
                  <>
                    <span className={`whitespace-pre-wrap ${cerrado ? "line-clamp-4" : ""} ${e.anulado ? "text-[#8A8A80] line-through" : ""}`}>{e.texto}</span>
                    {largo && (
                      <button type="button" onClick={() => setLargos((a) => (cerrado ? [...a, e.id] : a.filter((x) => x !== e.id)))}
                        className="mr-1.5 text-[11px] font-semibold text-[#D7FF4F] hover:underline">{cerrado ? "ver todo" : "ver menos"}</button>
                    )}
                    {e.tipo === "Nota" && e.visibilidad === "Al cliente" && (
                      <span className="ml-1.5 inline-flex h-[18px] items-center rounded-full bg-[rgba(215,255,79,.12)] px-1.5 align-[1px] text-[10px] font-bold text-[#D7FF4F]">La ve el cliente</span>
                    )}
                    {e.tipo === "Aviso al cliente" && <span className="ml-1.5 inline-flex h-[18px] items-center rounded-full bg-[rgba(86,227,164,.13)] px-1.5 align-[1px] text-[10px] font-bold text-[#56E3A4]">Enviado al cliente</span>}
                    {e.puedeMensaje && !e.mensaje && (
                      <button type="button" onClick={() => void mensaje(e.id, "crear")} disabled={!!trabajo}
                        title="La IA convierte esta línea en un mensaje para el cliente"
                        className="ml-1.5 inline-flex items-center gap-1 align-[1px] text-[11px] font-bold text-[#D7FF4F] hover:underline disabled:opacity-60">
                        {creando ? <><Giro />Creando mensaje…</> : <><Destello size={11} />Crear mensaje</>}
                      </button>
                    )}
                  </>
                )}
                {e.mensaje && (
                  <MensajeCliente e={e} abierto={abiertos.includes(e.id)} ocupado={ocupado} telefonoOk={telefonoOk}
                    onAbrir={(si) => abrir(e.id, si)} onAccion={(a, t, v) => void mensaje(e.id, a, t, v)} />
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
                      {copiado === e.id ? <span className="text-[#56E3A4]"><Listo /></span> : <Copia />}
                    </button>
                    {e.puedeMensaje && !e.mensaje && (
                      <button type="button" onClick={() => void mensaje(e.id, "talCual")} disabled={!!trabajo} aria-label="Enviar tal cual al cliente" title="Enviar tal cual (sin IA): pasa esta línea a mensaje para el cliente"
                        className="grid h-6 w-6 place-items-center rounded text-[#B5B5AE] hover:bg-[#2C2D29] hover:text-[#56E3A4]">
                        <Enviar />
                      </button>
                    )}
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
          );
        })}
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
