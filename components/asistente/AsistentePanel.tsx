"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { buildWhatsAppUrl } from "@/lib/tecnicos/whatsapp";
import { PREGUNTAS_RAPIDAS, textoPlanoTecnico, type ItemFalta, type RespuestaTecnico } from "@/lib/asistente/contexto";
import { dominioDe, type FuenteWeb } from "@/lib/ia/respuesta";
import { textoPlanoPasos, type RespuestaPasos } from "@/lib/asistente/pasos";
import { limpiarEquipo, pasosDeSolucion, parsearUsos, tituloEntrada, type Coincidencias, type EntradaManual } from "@/lib/manual-tecnico/reglas";
import {
  Chip, ChipEstado, Destello, IconoAviso, IconoEnviar, IconoFalta, IconoHecho, IconoLibro,
  btn, btnMain, cap, copiar, entrada, fotoParaIA, guardar, horaCorta, leerGuardado,
} from "./ui";

// Asistente de la orden (auditoría ops, punto 11B · lienzo aprobado, tableros
// 5, 6 y 8). Lee, resume y redacta; NUNCA cambia datos: sus botones llevan a
// la acción en la pantalla. Se activa solo al tocar «Asistente».

export type Pestana = "orden" | "tecnico";

type DatosOrden = {
  resumen?: string;
  proximoPaso?: string;
  antesDeEntregar?: string | null;
  mensaje?: string;
  falta: ItemFalta[];
  leidoEn: string;
  cliente?: string;
  sinIA?: string;
};

type RespuestaExperto = RespuestaTecnico & { fuentes: FuenteWeb[]; hora: string };
type Turno = { rol: "tecnico" | "ia"; texto: string; hora: string; autor?: string; auto?: boolean; foto?: boolean; respuesta?: RespuestaExperto };
type Pregunta = { pregunta: string; respuesta?: string; error?: string };

export const claveChat = (ordenId: string) => `sg-asistente-tecnico:${ordenId}`;
const claveOrden = (ordenId: string) => `sg-asistente-orden:${ordenId}`;
const clavePasos = (ordenId: string) => `sg-asistente-pasos:${ordenId}`;

/** El chat del técnico experto en el formato que entiende la ruta (y el borrador del Manual). */
export function chatParaServidor(turnos: readonly Turno[]) {
  return turnos.map((t) => ({ rol: t.rol, texto: t.rol === "ia" && t.respuesta ? textoPlanoTecnico(t.respuesta) : t.texto }));
}
export function leerChatGuardado(ordenId: string): Array<{ rol: "tecnico" | "ia"; texto: string }> {
  return chatParaServidor(leerGuardado<Turno[]>("session", claveChat(ordenId)) ?? []);
}

export function AsistentePanel(props: {
  abierto: boolean;
  pestana: Pestana;
  onPestana: (p: Pestana) => void;
  onCerrar: () => void;
  ordenId: string;
  codigo: string;
  equipo: string;
  ingresaPor: string;
  /** Rediseño R7: chips del motivo de ingreso (si la orden los tiene). */
  motivos?: string[];
  telefono: string;
  usuario: string;
  onRegistrarPago: () => void;
  onIrA: (seccion: "presupuesto" | "cuenta") => void;
  /** Se anotó algo en la Actividad de la orden (rediseño R3: ya no hay «nota interna»). */
  onActividad: () => void;
}) {
  const { abierto, pestana, onPestana, onCerrar } = props;
  const [leidoEn, setLeidoEn] = useState<string | null>(null);
  const recargarRef = useRef<(() => void) | null>(null);
  const nuevaRef = useRef<(() => void) | null>(null);

  return (
    <Sheet open={abierto} onOpenChange={(v) => { if (!v) onCerrar(); }}>
      <SheetContent side="right" onOpenAutoFocus={(e) => e.preventDefault()} className="flex w-full flex-col gap-0 border-l border-[#3A3A36] bg-[#1E1F1C] p-0 text-[13px] text-[#F0F0EC] sm:max-w-[440px]">
        <div className="flex flex-col gap-2.5 border-b border-[#2C2D29] px-4 pb-2.5 pt-3.5">
          <div className="flex items-center gap-2 pr-7">
            <Destello className="text-[#D7FF4F]" size={16} />
            <SheetTitle className="text-sm font-bold text-[#F0F0EC]">Asistente</SheetTitle>
            <span className="text-xs tabular-nums text-[#B5B5AE]">
              {props.codigo}{pestana === "orden" && leidoEn ? ` · leído ${horaCorta(leidoEn)}` : ""}
            </span>
            <SheetDescription className="sr-only">Lee la orden, resume lo que falta y ayuda con el diagnóstico. No cambia nada.</SheetDescription>
            {pestana === "orden" ? (
              <button type="button" className={`${btn} ml-auto w-7 px-0`} aria-label="Volver a leer la orden" title="Volver a leer la orden" onClick={() => recargarRef.current?.()}>
                <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden="true"><path d="M11.5 5A4.8 4.8 0 1 0 12 8.5M11.8 2.2V5H9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            ) : (
              <button type="button" className={`${btn} ml-auto w-7 px-0`} aria-label="Nueva consulta" title="Nueva consulta" onClick={() => nuevaRef.current?.()}>
                <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
            )}
          </div>
          <div role="tablist" aria-label="Asistente" className="grid grid-cols-2 overflow-hidden rounded-lg border border-[#3A3A36]">
            {(["orden", "tecnico"] as const).map((p, i) => (
              <button key={p} role="tab" type="button" aria-selected={pestana === p} onClick={() => onPestana(p)}
                className={`h-[30px] text-xs ${i ? "border-l border-[#3A3A36]" : ""} ${pestana === p ? "bg-[#D7FF4F] font-bold text-[#151613]" : "bg-[#252622] font-semibold text-[#F0F0EC]"}`}>
                {p === "orden" ? "La orden" : "Técnico experto"}
              </button>
            ))}
          </div>
          {pestana === "tecnico" && (
            <div className="flex flex-wrap gap-1.5">
              {limpiarEquipo(props.equipo) && <Chip>{limpiarEquipo(props.equipo)}</Chip>}
              {props.motivos?.length
                ? props.motivos.map((m) => <Chip key={m}>{m}</Chip>)
                : props.ingresaPor.trim() && !/^no disponible$/i.test(props.ingresaPor.trim()) && <Chip>Ingreso: {props.ingresaPor.trim().slice(0, 60)}</Chip>}
            </div>
          )}
        </div>
        {abierto && pestana === "orden" && (
          <PestanaOrden {...props} onLeido={setLeidoEn} registrarRecarga={(fn) => { recargarRef.current = fn; }} />
        )}
        {abierto && pestana === "tecnico" && (
          <PestanaTecnico {...props} registrarNueva={(fn) => { nuevaRef.current = fn; }} />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── La orden ────────────────────────────────────────────────────────────────

function PestanaOrden(props: {
  ordenId: string;
  telefono: string;
  onRegistrarPago: () => void;
  onIrA: (seccion: "presupuesto" | "cuenta") => void;
  onCerrar: () => void;
  onLeido: (iso: string | null) => void;
  registrarRecarga: (fn: () => void) => void;
}) {
  const { ordenId, onLeido } = props;
  const [datos, setDatos] = useState<DatosOrden | null>(() => leerGuardado<DatosOrden>("session", claveOrden(ordenId)));
  const [mensaje, setMensaje] = useState(() => leerGuardado<DatosOrden>("session", claveOrden(ordenId))?.mensaje ?? "");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variando, setVariando] = useState<"corto" | "otro" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [preguntando, setPreguntando] = useState(false);
  const mensajeRef = useRef<HTMLTextAreaElement | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  async function leer() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/asistente`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo: "orden", accion: "resumen" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "El asistente no pudo leer la orden.");
      setDatos(j.data);
      setMensaje(j.data.mensaje ?? "");
      guardar("session", claveOrden(ordenId), j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "El asistente no pudo leer la orden.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { onLeido(datos?.leidoEn ?? null); }, [datos, onLeido]);
  useEffect(() => {
    props.registrarRecarga(() => { void leer(); });
    if (!datos) void leer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenId]);

  async function variar(accion: "corto" | "otro") {
    setVariando(accion);
    setAviso(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/asistente`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo: "orden", accion, mensajeActual: mensaje }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo reescribir el mensaje.");
      setMensaje(j.data.mensaje);
      if (datos) guardar("session", claveOrden(ordenId), { ...datos, mensaje: j.data.mensaje });
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo reescribir el mensaje.");
    } finally {
      setVariando(null);
    }
  }

  async function preguntar() {
    const q = pregunta.trim();
    if (!q || preguntando) return;
    setPregunta("");
    setPreguntando(true);
    setPreguntas((p) => [...p, { pregunta: q }]);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/asistente`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo: "orden", accion: "pregunta", pregunta: q }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo responder.");
      setPreguntas((p) => p.map((x, i) => (i === p.length - 1 ? { ...x, respuesta: j.data.respuesta } : x)));
    } catch (e) {
      setPreguntas((p) => p.map((x, i) => (i === p.length - 1 ? { ...x, error: e instanceof Error ? e.message : "No se pudo responder." } : x)));
    } finally {
      setPreguntando(false);
      setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    }
  }

  function whatsapp() {
    const url = buildWhatsAppUrl(props.telefono, mensaje);
    if (!url) { setAviso("La orden no tiene un teléfono válido."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const ir = (accion: ItemFalta["accion"]) => {
    if (!accion) return;
    props.onCerrar();
    if (accion === "registrar_pago") props.onRegistrarPago();
    else props.onIrA(accion);
  };
  const etiquetaAccion: Record<string, string> = { presupuesto: "Ver", registrar_pago: "Registrar pago", cuenta: "Ver cuenta" };
  const nombre = (datos?.cliente ?? "").trim();

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3.5">
        {cargando && !datos && <p className="text-[#B5B5AE]">Leyendo la orden…</p>}
        {error && (
          <div className="flex flex-col gap-2 rounded-lg border border-[#FF7A70]/40 bg-[rgba(255,90,79,.06)] p-2.5 text-[#FFB0A8]">
            <span>{error}</span>
            <button type="button" className={`${btn} self-start`} onClick={() => void leer()}>Intentar de nuevo</button>
          </div>
        )}
        {datos && (
          <>
            {datos.sinIA && <p className="rounded-lg border border-[#FFB547]/40 p-2.5 text-[#FFCF85]">{datos.sinIA}</p>}
            {datos.resumen && (
              <section className="flex flex-col gap-1.5">
                <span className={cap}>Resumen</span>
                <p className="whitespace-pre-wrap leading-relaxed">{datos.resumen}</p>
              </section>
            )}

            <section className="flex flex-col gap-2">
              <span className={cap}>Falta para entregar</span>
              {datos.falta.length === 0 && <span className="text-[#B5B5AE]">Nada: se puede entregar.</span>}
              {datos.falta.map((f) => (
                <div key={f.clave} className="grid grid-cols-[16px_1fr_auto] items-center gap-2">
                  {f.ok ? <IconoHecho /> : <IconoFalta />}
                  <span className={f.ok ? "text-[#B5B5AE]" : ""}>
                    {f.texto}{f.detalle && <span className="text-[#B5B5AE]"> · {f.detalle}</span>}
                  </span>
                  {f.accion && !f.ok ? (
                    <button type="button" className={btn} onClick={() => ir(f.accion)}>{etiquetaAccion[f.accion]}</button>
                  ) : <span />}
                </div>
              ))}
            </section>

            {datos.proximoPaso && (
              <section className="flex flex-col gap-2 rounded-[10px] border border-[rgba(215,255,79,.35)] bg-[rgba(215,255,79,.05)] px-3 py-2.5">
                <span className={`${cap} text-[#D7FF4F]`}>Próximo paso</span>
                <p className="leading-relaxed">{datos.proximoPaso}</p>
                {mensaje && <button type="button" className={`${btn} self-start`} onClick={() => mensajeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>Ver el mensaje</button>}
              </section>
            )}

            {datos.antesDeEntregar && (
              <section className="flex flex-col gap-1.5 rounded-[10px] border border-[rgba(255,181,71,.35)] bg-[rgba(255,181,71,.05)] px-3 py-2.5">
                <span className={`${cap} text-[#FFB547]`}>Antes de entregar</span>
                <p className="leading-relaxed">{datos.antesDeEntregar}</p>
              </section>
            )}

            {(datos.mensaje !== undefined || mensaje) && !datos.sinIA && (
              <section className="flex flex-col gap-2">
                <label htmlFor="asistente-mensaje" className={cap}>{nombre ? `Mensaje para ${nombre}` : "Mensaje para el cliente"}</label>
                <textarea id="asistente-mensaje" ref={mensajeRef} rows={6} value={mensaje} onChange={(e) => setMensaje(e.target.value)}
                  className={`${entrada} resize-y py-2.5 leading-relaxed`} />
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={btnMain} onClick={whatsapp} disabled={!mensaje.trim()}>WhatsApp</button>
                  <button type="button" className={btn} disabled={!mensaje.trim()} onClick={async () => setAviso((await copiar(mensaje)) ? "Copiado." : "No se pudo copiar.")}>Copiar</button>
                  <button type="button" className={btn} disabled={!!variando || !mensaje.trim()} onClick={() => void variar("corto")}>{variando === "corto" ? "Escribiendo…" : "Más corto"}</button>
                  <button type="button" className={btn} disabled={!!variando} onClick={() => void variar("otro")}>{variando === "otro" ? "Escribiendo…" : "Otra versión"}</button>
                </div>
                {aviso && <span className="text-xs text-[#B5B5AE]">{aviso}</span>}
              </section>
            )}

            {preguntas.map((p, i) => (
              <section key={i} className="flex flex-col gap-1.5">
                <div className="self-end rounded-[12px_12px_4px_12px] bg-[#2C2D29] px-3 py-2 leading-snug">{p.pregunta}</div>
                {p.respuesta && <p className="whitespace-pre-wrap leading-relaxed">{p.respuesta}</p>}
                {p.error && <p className="text-[#FFB0A8]">{p.error}</p>}
                {!p.respuesta && !p.error && <p className="text-[#B5B5AE]">Pensando…</p>}
              </section>
            ))}
            <div ref={finRef} />
          </>
        )}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-[#2C2D29] px-4 pb-3.5 pt-3">
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void preguntar(); }}>
          <label htmlFor="asistente-pregunta" className="sr-only">Pregunta sobre esta orden</label>
          <input id="asistente-pregunta" value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="Pregunta sobre esta orden…" className={`${entrada} h-[34px] flex-1`} />
          <button type="submit" className={`${btnMain} h-[34px] w-[34px] px-0`} aria-label="Preguntar" disabled={preguntando || !pregunta.trim()}><IconoEnviar /></button>
        </form>
        <span className="text-[11px] text-[#B5B5AE]">IA · lee la orden, no cambia nada · revisa antes de enviar</span>
      </div>
    </>
  );
}

// ─── Técnico experto ─────────────────────────────────────────────────────────

function PestanaTecnico(props: {
  ordenId: string;
  ingresaPor: string;
  usuario: string;
  /** Se anotó algo en la Actividad de la orden (rediseño R3: ya no hay «nota interna»). */
  onActividad: () => void;
  registrarNueva: (fn: () => void) => void;
}) {
  const { ordenId } = props;
  const [turnos, setTurnos] = useState<Turno[]>(() => leerGuardado<Turno[]>("session", claveChat(ordenId)) ?? []);
  const [biblioteca, setBiblioteca] = useState<Coincidencias | null>(null);
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<{ tipo: "image/jpeg"; datos: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rediseño R7 (tablero 9): «Sugerir pasos» se pide con el botón (no se gasta IA al abrir).
  const [pasos, setPasos] = useState<RespuestaPasos | null>(() => leerGuardado<RespuestaPasos>("session", clavePasos(ordenId)));
  const [pidiendoPasos, setPidiendoPasos] = useState(false);
  const finRef = useRef<HTMLDivElement | null>(null);
  const archivoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { guardar("session", claveChat(ordenId), turnos); }, [ordenId, turnos]);
  useEffect(() => { guardar("session", clavePasos(ordenId), pasos); }, [ordenId, pasos]);

  async function sugerirPasos() {
    if (pidiendoPasos) return;
    setPidiendoPasos(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/asistente`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo: "pasos" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "El técnico experto no pudo armar los pasos.");
      setPasos(j.data as RespuestaPasos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "El técnico experto no pudo armar los pasos.");
    } finally {
      setPidiendoPasos(false);
    }
  }

  useEffect(() => {
    let vivo = true;
    fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/manual-tecnico`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (vivo && j.success) setBiblioteca(j.data.coincidencias); })
      .catch(() => { if (vivo) setBiblioteca({ probadas: [], parecidas: [], relacionadas: [] }); });
    return () => { vivo = false; };
  }, [ordenId]);

  async function enviar(mensaje: string, opciones: { auto?: boolean } = {}) {
    const m = mensaje.trim();
    if (!m || enviando) return;
    const ahora = new Date().toISOString();
    const nuevo: Turno = { rol: "tecnico", texto: m, hora: ahora, autor: props.usuario, auto: opciones.auto, foto: !!foto };
    const previos = turnos;
    setTurnos([...previos, nuevo]);
    setTexto("");
    setEnviando(true);
    setError(null);
    const conFoto = foto;
    setFoto(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/asistente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: "tecnico", mensaje: m, chat: chatParaServidor(previos), foto: conFoto }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "El técnico experto no pudo responder.");
      const r = j.data as RespuestaExperto;
      setTurnos((t) => [...t, { rol: "ia", texto: textoPlanoTecnico(r), hora: r.hora, respuesta: r }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "El técnico experto no pudo responder.");
    } finally {
      setEnviando(false);
      setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    }
  }

  // «Nueva consulta» borra el chat y los pasos. (R7: ya no se consulta sola al abrir.)
  useEffect(() => {
    props.registrarNueva(() => { setTurnos([]); setPasos(null); setError(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return;
    try { setFoto(await fotoParaIA(archivo)); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo leer la foto."); }
    if (archivoRef.current) archivoRef.current.value = "";
  }

  const hayProbado = !!biblioteca && (biblioteca.probadas.length > 0 || biblioteca.parecidas.length > 0);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void sugerirPasos()} disabled={pidiendoPasos}
            className={`${btn} border-[rgba(215,255,79,.5)] bg-transparent text-[#D7FF4F] hover:bg-[rgba(215,255,79,.08)]`}>
            <Destello size={13} />{pidiendoPasos ? "Buscando guías…" : pasos ? "Volver a sugerir" : "Sugerir pasos"}
          </button>
        </div>
        {pasos && <PasosCard key={pasos.hora} r={pasos} ordenId={ordenId} onActividad={props.onActividad} />}
        {biblioteca?.probadas.map((e) => (
          <BloqueProbado key={e.id} e={e} ordenId={ordenId} onActividad={props.onActividad} />
        ))}
        {biblioteca?.parecidas.map((e) => (
          <details key={e.id} className="rounded-[10px] border border-[#3A3A36] bg-[#191A17] px-3 py-2">
            <summary className="flex cursor-pointer items-center gap-2">
              <span className="font-semibold">Parecida</span>
              <span className="min-w-0 truncate text-xs text-[#B5B5AE]">{e.sintoma} · {e.modelo}</span>
              <span className="ml-auto"><ChipEstado estado={e.estado} /></span>
            </summary>
            <div className="mt-2 flex flex-col gap-1.5 leading-relaxed">
              {e.causa && <p><span className={cap}>Causa </span>{e.causa}</p>}
              {pasosDeSolucion(e.solucion).length > 0 && (
                <ol className="list-decimal space-y-0.5 pl-5">{pasosDeSolucion(e.solucion).map((p, i) => <li key={i}>{p}</li>)}</ol>
              )}
              <span className="text-xs text-[#B5B5AE]">Funcionó {e.vecesFunciono} · {e.codigo}{e.ordenOrigen ? ` · ${e.ordenOrigen}` : ""}</span>
            </div>
          </details>
        ))}

        {turnos.map((t, i) =>
          t.rol === "tecnico" ? (
            t.auto ? null : (
              <div key={i} className="flex max-w-[86%] flex-col items-end gap-1 self-end">
                <div className="whitespace-pre-wrap rounded-[12px_12px_4px_12px] bg-[#2C2D29] px-3 py-2 leading-snug">{t.texto}{t.foto && <span className="text-[#B5B5AE]"> · con foto</span>}</div>
                <span className="text-[11px] text-[#B5B5AE]">{[t.autor, horaCorta(t.hora)].filter(Boolean).join(" · ")}</span>
              </div>
            )
          ) : t.respuesta ? (
            <RespuestaCard key={i} r={t.respuesta} ordenId={ordenId} titulo={i <= 1 && hayProbado ? "En internet" : null} onActividad={props.onActividad} />
          ) : null,
        )}
        {enviando && <p className="text-[#B5B5AE]">Buscando en sitios del fabricante y de reparación…</p>}
        {error && <p className="text-[#FFB0A8]">{error}</p>}

        <div className="flex flex-wrap gap-1.5">
          {PREGUNTAS_RAPIDAS.map((q) => (
            <button key={q} type="button" disabled={enviando} onClick={() => void enviar(q)}
              className="inline-flex h-[26px] items-center rounded-full border border-[#3A3A36] bg-[#252622] px-2.5 text-xs text-[#F0F0EC] hover:border-[#D7FF4F]/60 disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
        <div ref={finRef} />
      </div>
      <div className="flex flex-col gap-1.5 border-t border-[#2C2D29] px-4 pb-3.5 pt-3">
        {foto && (
          <div className="flex items-center gap-2 text-xs text-[#B5B5AE]">
            <img src={`data:${foto.tipo};base64,${foto.datos}`} alt="Foto adjunta" className="h-8 w-8 rounded object-cover" />
            Foto adjunta
            <button type="button" className="text-[#FF7A70] hover:underline" onClick={() => setFoto(null)}>Quitar</button>
          </div>
        )}
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}>
          <input ref={archivoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void elegirFoto(e.target.files?.[0])} />
          <button type="button" className={`${btn} h-[34px] w-[34px] px-0`} aria-label="Adjuntar foto" title="Adjuntar foto" onClick={() => archivoRef.current?.click()}>
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3.5" width="13" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8.5" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M5.5 3.5l1-1.5h3l1 1.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
          </button>
          <label htmlFor="asistente-tecnico" className="sr-only">Cuenta lo que viste o probaste</label>
          <input id="asistente-tecnico" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cuenta lo que viste o probaste…" className={`${entrada} h-[34px] flex-1`} />
          <button type="submit" className={`${btnMain} h-[34px] w-[34px] px-0`} aria-label="Enviar" disabled={enviando || !texto.trim()}><IconoEnviar /></button>
        </form>
      </div>
    </>
  );
}

function BloqueProbado({ e, ordenId, onActividad }: { e: EntradaManual; ordenId: string; onActividad: () => void }) {
  const [voto, setVoto] = useState<"si" | "no" | null>(null);
  const [conteo, setConteo] = useState({ si: e.vecesFunciono, no: e.vecesFallo });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pasos = pasosDeSolucion(e.solucion);
  const origenes = parsearUsos(e.usos).filter((u) => u.funciono).map((u) => u.orden);

  async function votar(funciono: boolean) {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/manual-tecnico/voto`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entradaId: e.id, funciono }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo anotar.");
      setVoto(funciono ? "si" : "no");
      setConteo({ si: j.data.vecesFunciono, no: j.data.vecesFallo });
      if (j.data.anotado) onActividad();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anotar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border border-[rgba(215,255,79,.45)] bg-[rgba(215,255,79,.04)] p-3">
      <div className="flex items-center gap-2">
        <IconoLibro />
        <span className="font-bold text-[#D7FF4F]">Probado en SUPER GEEK</span>
        <span className="ml-auto text-xs text-[#B5B5AE]">{e.codigo}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold">{e.sintoma || tituloEntrada(e)}</span>
        <ChipEstado estado={e.estado} />
        <span className={`inline-flex h-5 items-center rounded-full bg-[#2C2D29] px-[7px] text-[10px] font-bold ${voto === "si" ? "animate-pulse" : ""}`}>
          Funcionó {conteo.si} · falló {conteo.no}
        </span>
      </div>
      {e.causa && (
        <div className="flex flex-col gap-1"><span className={cap}>Causa</span><span className="leading-snug">{e.causa}</span></div>
      )}
      {pasos.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className={cap}>Prueba primero</span>
          <ol className="list-decimal space-y-0.5 pl-5 leading-snug">{pasos.map((p, i) => <li key={i}>{p}</li>)}</ol>
        </div>
      )}
      {e.noFunciono && (
        <div className="flex items-baseline gap-1.5 leading-snug"><span className={`${cap} flex-none`}>No funcionó antes</span><span className="text-xs text-[#B5B5AE]">{e.noFunciono}</span></div>
      )}
      {origenes.length > 0 && <span className="text-xs text-[#B5B5AE]">De {origenes.join(", ")}</span>}
      {voto === null ? (
        <div className="flex items-center gap-1.5">
          <span className="flex-1 text-xs text-[#B5B5AE]">¿Lo probaste?</span>
          <button type="button" className={btnMain} disabled={enviando} onClick={() => void votar(true)}>Funcionó</button>
          <button type="button" className={btn} disabled={enviando} onClick={() => void votar(false)}>No funcionó</button>
        </div>
      ) : voto === "si" ? (
        <div className="flex items-center gap-2 font-semibold text-[#56E3A4]"><IconoHecho />Anotado en la orden y en la solución</div>
      ) : (
        <div className="flex flex-col gap-0.5 text-[#FFB547]"><span className="font-semibold">Marcada para revisar</span><span className="text-xs text-[#B5B5AE]">Sigue con lo que encontré en internet, abajo.</span></div>
      )}
      {error && <span className="text-xs text-[#FFB0A8]">{error}</span>}
    </section>
  );
}

// ─── «Sugerir pasos» (rediseño R7, tablero 9) ────────────────────────────────

function PasosCard({ r, ordenId, onActividad }: { r: RespuestaPasos; ordenId: string; onActividad: () => void }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardarNota() {
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/asistente/nota`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: textoPlanoPasos(r) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar en la Actividad.");
      onActividad();
      setAviso("Guardado como nota interna.");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo guardar en la Actividad.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#3A3A36] bg-[#191A17] p-3 animate-[sg-entrada_160ms_ease-out]">
      {r.titulo && <p className="font-bold leading-snug">{r.titulo}</p>}
      {r.guias.length > 0 && (
        <div className="flex flex-col">
          <span className={`${cap} pb-1`}>Guías con fotos</span>
          {r.guias.map((g) => (
            <div key={g.url} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-[#2C2D29] py-2">
              <span className="rounded-[5px] bg-[rgba(120,183,255,.12)] px-1.5 py-0.5 text-[10px] font-bold text-[#9CCBFF]">{g.dominio}</span>
              <span className="truncate" title={g.titulo}>{g.titulo}</span>
              <a href={g.url} target="_blank" rel="noreferrer" className={btn}>Abrir</a>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className={cap}>Pasos clave</span>
        <ol className="list-decimal space-y-1 pl-5 leading-snug">{r.pasos.map((p, i) => <li key={i}>{p}</li>)}</ol>
      </div>
      {r.cuidado && (
        <div className="flex items-start gap-2 rounded-lg border border-[rgba(255,181,71,.35)] bg-[rgba(255,181,71,.08)] px-2.5 py-2 leading-snug">
          <span><b className="text-[#FFB547]">Cuidado: </b>{r.cuidado}</span>
        </div>
      )}
      {(r.tiempo || r.repuestos.length > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {r.tiempo && <span><span className={cap}>Tiempo estimado </span>{r.tiempo}</span>}
          {r.repuestos.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={cap}>En inventario</span>
              {r.repuestos.map((x) => (
                <span key={x.sku} className="inline-flex items-center gap-1.5" title={x.unidades > 1 ? `${x.unidades} unidades` : "1 unidad"}>
                  {x.nombre}
                  <span className="rounded-[5px] border border-[#4A4A45] px-1.5 font-mono text-[11px] font-semibold">{x.sku}</span>
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[#2C2D29] pt-2.5">
        {aviso && <span className="text-xs text-[#B5B5AE]">{aviso}</span>}
        <button type="button" className={`${btn} ml-auto`} disabled={guardando} onClick={() => void guardarNota()}>
          {guardando ? "Guardando…" : "Guardar como nota interna"}
        </button>
      </div>
    </section>
  );
}

function RespuestaCard({ r, ordenId, titulo, onActividad }: { r: RespuestaExperto; ordenId: string; titulo: string | null; onActividad: () => void }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [pasando, setPasando] = useState(false);
  const plano = textoPlanoTecnico(r);

  async function pasarANota() {
    setPasando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/asistente/nota`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: `Técnico experto: ${plano}` }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar en la Actividad.");
      onActividad();
      setAviso("Guardado como nota interna en la Actividad.");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo guardar en la Actividad.");
    } finally {
      setPasando(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#3A3A36] bg-[#191A17] p-3">
      {titulo && (
        <div className="flex items-center gap-2"><span className="font-semibold">{titulo}</span><span className="text-xs text-[#B5B5AE]">si lo anterior no funciona</span></div>
      )}
      {r.respuesta && <p className="whitespace-pre-wrap leading-relaxed">{r.respuesta}</p>}
      {r.causas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={cap}>Posibles causas · de más a menos probable</span>
          <ol className="list-decimal space-y-1 pl-5 leading-snug">
            {r.causas.map((c, i) => <li key={i}><b>{c.titulo}.</b> {c.detalle}</li>)}
          </ol>
        </div>
      )}
      {r.pruebas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={cap}>Prueba en este orden</span>
          {r.pruebas.map((p, i) => (
            <label key={i} className="flex items-start gap-2 leading-snug">
              <input type="checkbox" className="mt-[3px] accent-[#D7FF4F]" />
              <span>{p}</span>
            </label>
          ))}
        </div>
      )}
      {r.precaucion && (
        <div className="flex items-start gap-2 rounded-lg bg-[rgba(255,181,71,.08)] px-2.5 py-2 leading-snug text-[#FFCF85]">
          <IconoAviso /><span>{r.precaucion}</span>
        </div>
      )}
      {r.fuentes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cap}>Fuentes</span>
          {r.fuentes.map((f) => (
            <a key={f.url} href={f.url} target="_blank" rel="noreferrer" title={f.titulo}
              className="inline-flex h-[22px] items-center rounded-full bg-[#2C2D29] px-2 text-[11px] font-semibold text-[#F0F0EC] no-underline hover:text-[#D7FF4F]">
              {dominioDe(f.url) || f.titulo}
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={btn} onClick={async () => setAviso((await copiar(plano)) ? "Copiado." : "No se pudo copiar.")}>Copiar</button>
        <button type="button" className={btn} disabled={pasando} onClick={() => void pasarANota()}>{pasando ? "Guardando…" : "Guardar en la Actividad"}</button>
        {aviso && <span className="text-xs text-[#B5B5AE]">{aviso}</span>}
      </div>
    </section>
  );
}
