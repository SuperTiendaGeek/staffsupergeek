"use client";

// Gestor de publicaciones (punto 10d). Un anuncio por producto (SKU) en cada
// canal; una unidad con un detalle importante puede tener su anuncio aparte.
// El texto sale de la plantilla de la categoría y canal; el empleado lo ajusta,
// lo copia al canal y marca "Publicado" (eso marca la casilla de Recepción en
// las unidades que el anuncio cubre).
//
// Tiene su propio estado: escribir aquí no repinta la pantalla de fondo.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, RotateCcw, X } from "lucide-react";
import {
  CANALES_EN_GESTOR,
  TITULO_MAX,
  accesoriosAnuncio,
  accesoriosDistintos,
  bateriaAnuncio,
  canalUsaHtml,
  elegirPlantilla,
  hashtagsAnuncio,
  llenarPlantilla,
  llenarTitulo,
  plantillasDisponibles,
  unidadViva,
  unidadesCubiertas,
  valoresAnuncio,
  type AlcancePublicacion,
  type CanalPublicacion,
  type DatosUnidadAnuncio,
  type GestorPublicacionesDatos,
  type Publicacion,
} from "@/lib/shipping-v2/publicaciones";
import type { ShippingV2Item } from "@/types/shipping-v2";

type Accion = "guardar" | "publicar" | "retirar";

export type ResultadoGestor = { itemsActualizados: ShippingV2Item[] };

const ESTADO_COLOR: Record<string, string> = {
  Publicado: "text-[#9FEFB3]",
  Borrador: "text-[#B4B5AC]",
  "Por retirar": "text-[#FFB07A]",
  Retirado: "text-[#8F908A]",
  Pendiente: "text-[#F4C95B]",
};

function fecha(valor?: string) {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-EC", { day: "2-digit", month: "short" });
}

function etiquetaUnidad(u: DatosUnidadAnuncio) {
  return u.numeroSerie ? `S/N ${u.numeroSerie}` : "Sin serie";
}

function claveDe(canal: CanalPublicacion, alcance: AlcancePublicacion, unidadId?: string) {
  return `${canal}|${alcance}|${alcance === "Unidad" ? unidadId ?? "" : ""}`;
}

function buscar(publicaciones: Publicacion[], canal: CanalPublicacion, alcance: AlcancePublicacion, unidadId?: string) {
  return publicaciones.find((p) => p.canal === canal && p.alcance === alcance && (alcance === "Producto" || p.unidadId === unidadId)) ?? null;
}

/** Estado que se muestra en la pestaña de un canal. */
function estadoCanal(publicaciones: Publicacion[], canal: CanalPublicacion) {
  const delCanal = publicaciones.filter((p) => p.canal === canal && p.estado !== "Retirado");
  if (delCanal.some((p) => p.estado === "Publicado")) return "Publicado";
  if (delCanal.some((p) => p.estado === "Por retirar")) return "Por retirar";
  if (delCanal.length) return "Borrador";
  return "Pendiente";
}

const inputClass = "h-8 w-full min-w-0 rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 text-[12.5px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/60";
const labelClass = "text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]";
const botonClass = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-2.5 text-[12px] font-semibold text-[#EDEDE7] transition hover:border-[#D7FF4F]/50 disabled:opacity-50";

export function GestorPublicacionesModal({
  sku,
  canalInicial = "Marketplace",
  unidadInicialId,
  casillaMarcada,
  onDesmarcarCasilla,
  onClose,
  onChanged,
}: {
  sku: string;
  canalInicial?: CanalPublicacion;
  /** Si se abre desde una unidad con anuncio aparte, entra directo a ese anuncio. */
  unidadInicialId?: string;
  /** Casilla de Recepción del canal inicial en la unidad desde la que se abrió. */
  casillaMarcada?: boolean;
  /** Para casillas marcadas antes del gestor (sin anuncio guardado). */
  onDesmarcarCasilla?: () => Promise<void>;
  onClose: () => void;
  onChanged?: (resultado: ResultadoGestor) => void;
}) {
  const [datos, setDatos] = useState<GestorPublicacionesDatos | null>(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [canal, setCanal] = useState<CanalPublicacion>((CANALES_EN_GESTOR as readonly string[]).includes(canalInicial) ? canalInicial : "Marketplace");
  const [alcance, setAlcance] = useState<AlcancePublicacion>("Producto");
  const [unidadId, setUnidadId] = useState<string | undefined>(undefined);
  const [plantillaId, setPlantillaId] = useState("");
  const [presentacion, setPresentacion] = useState("");
  const [precio, setPrecio] = useState("");
  const [enlace, setEnlace] = useState("");
  /** null = sigue la plantilla; texto = el empleado lo cambió a mano. */
  const [tituloManual, setTituloManual] = useState<string | null>(null);
  const [descripcionManual, setDescripcionManual] = useState<string | null>(null);
  const [cargadoPara, setCargadoPara] = useState("");
  const [busy, setBusy] = useState<Accion | "desmarcar" | "">("");
  const [mensaje, setMensaje] = useState("");
  const [copiado, setCopiado] = useState<"titulo" | "descripcion" | "sku" | "">("");
  const [casilla, setCasilla] = useState(casillaMarcada === true);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = original; document.removeEventListener("keydown", onKey); };
  }, [busy, onClose]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/shipping-v2/publicaciones?sku=${encodeURIComponent(sku)}`)
      .then(async (r) => {
        const payload = await r.json().catch(() => ({}));
        if (!r.ok || !payload.success) throw new Error(String(payload.error || "No se pudo abrir el gestor."));
        if (!vivo) return;
        const recibidos = payload.data as GestorPublicacionesDatos;
        setDatos(recibidos);
        if (unidadInicialId && buscar(recibidos.publicaciones, canalInicial, "Unidad", unidadInicialId)) {
          setAlcance("Unidad");
          setUnidadId(unidadInicialId);
        }
      })
      .catch((e) => vivo && setErrorCarga(e instanceof Error ? e.message : "Error inesperado."));
    return () => { vivo = false; };
  }, [sku, canalInicial, unidadInicialId]);

  const vivas = useMemo(() => (datos?.unidades ?? []).filter((u) => unidadViva(u)), [datos]);
  const actual = useMemo(() => (datos ? buscar(datos.publicaciones, canal, alcance, unidadId) : null), [datos, canal, alcance, unidadId]);
  const cubiertas = useMemo(
    () => (datos ? unidadesCubiertas(datos.unidades, datos.publicaciones, canal, alcance, unidadId) : []),
    [datos, canal, alcance, unidadId]
  );
  const plantillasCanal = useMemo(() => {
    if (!datos) return [];
    const disponibles = plantillasDisponibles(datos.plantillas, datos.categoria, canal);
    // La que ya usa un anuncio guardado se muestra aunque hoy esté inactiva.
    const enUso = datos.plantillas.find((p) => p.id === plantillaId && p.canal === canal);
    return enUso && !disponibles.includes(enUso) ? [...disponibles, enUso] : disponibles;
  }, [datos, canal, plantillaId]);
  const plantilla = plantillasCanal.find((p) => p.id === plantillaId) ?? null;
  const html = canalUsaHtml(canal);
  const [verCodigo, setVerCodigo] = useState(false);
  const precioNumero = precio.trim() === "" ? null : Number(precio.replace(",", "."));
  const precioValido = precioNumero === null || (Number.isFinite(precioNumero) && precioNumero >= 0);

  // Al cambiar de anuncio (canal / alcance / unidad) se carga lo guardado o se
  // arma desde la plantilla.
  const clave = claveDe(canal, alcance, unidadId);
  useEffect(() => {
    if (!datos || cargadoPara === clave) return;
    const guardada = buscar(datos.publicaciones, canal, alcance, unidadId);
    const elegida = (guardada?.plantillaId && datos.plantillas.find((p) => p.id === guardada.plantillaId)) || elegirPlantilla(datos.plantillas, datos.categoria, canal);
    // La presentación se reutiliza de otro anuncio del mismo SKU si este no tiene.
    const otraPresentacion = datos.publicaciones.find((p) => p.presentacion.trim())?.presentacion ?? "";
    const presentacionInicial = guardada?.presentacion || otraPresentacion;
    const unidadesDe = unidadesCubiertas(datos.unidades, datos.publicaciones, canal, alcance, unidadId);
    const precioBase = guardada?.precio ?? unidadesDe.find((u) => u.precio !== null)?.precio ?? null;
    setPlantillaId(elegida?.id ?? "");
    setPresentacion(presentacionInicial);
    setPrecio(precioBase === null ? "" : String(precioBase));
    setEnlace(guardada?.enlace ?? "");
    if (guardada) {
      const valores = valoresAnuncio({ unidades: unidadesDe, alcance, tienda: datos.tienda, presentacion: presentacionInicial, precio: precioBase });
      const tituloGenerado = elegida ? llenarTitulo(elegida.titulo, valores) : "";
      const descripcionGenerada = elegida ? llenarPlantilla(elegida.descripcion, valores, { html: canalUsaHtml(canal) }) : "";
      setTituloManual(guardada.titulo && guardada.titulo !== tituloGenerado ? guardada.titulo : null);
      setDescripcionManual(guardada.descripcion && guardada.descripcion !== descripcionGenerada ? guardada.descripcion : null);
    } else {
      setTituloManual(null);
      setDescripcionManual(null);
    }
    setMensaje("");
    setCargadoPara(clave);
  }, [datos, clave, cargadoPara, canal, alcance, unidadId]);

  const valores = useMemo(
    () => (datos ? valoresAnuncio({ unidades: cubiertas, alcance, tienda: datos.tienda, presentacion, precio: precioValido ? precioNumero : null }) : {}),
    [datos, cubiertas, alcance, presentacion, precioNumero, precioValido]
  );
  const tituloGenerado = plantilla ? llenarTitulo(plantilla.titulo, valores) : "";
  const descripcionGenerada = plantilla ? llenarPlantilla(plantilla.descripcion, valores, { html }) : "";
  const titulo = tituloManual ?? tituloGenerado;
  const descripcion = descripcionManual ?? descripcionGenerada;
  const maximo = TITULO_MAX[canal];

  const sinRevisar = cubiertas.filter((u) => u.accesorios === null).length;
  const accesoriosTexto = alcance === "Unidad" ? (cubiertas[0]?.accesorios ?? []).join(", ") : accesoriosAnuncio(cubiertas).join(", ");
  const porLlegar = cubiertas.filter((u) => !u.recibido).length;

  const copiar = useCallback(async (texto: string, que: "titulo" | "descripcion" | "sku") => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(que);
      window.setTimeout(() => setCopiado(""), 1500);
    } catch {
      setMensaje("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  }, []);

  async function guardar(accion: Accion) {
    if (!datos) return;
    if (accion === "retirar" && !window.confirm("¿Marcar este anuncio como retirado del canal?")) return;
    setBusy(accion);
    setMensaje("");
    try {
      const response = await fetch("/api/shipping-v2/publicaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: datos.sku,
          canal,
          alcance,
          unidadId: alcance === "Unidad" ? unidadId : undefined,
          plantillaId: plantilla?.id,
          titulo,
          presentacion,
          descripcion,
          precio: precioValido ? precioNumero : null,
          enlace,
          accion,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo guardar el anuncio."));
      const { publicacion, itemsActualizados } = payload.data as { publicacion: Publicacion; itemsActualizados: ShippingV2Item[] };
      setDatos((d) => d ? { ...d, publicaciones: d.publicaciones.filter((p) => p.id !== publicacion.id).concat(publicacion) } : d);
      if (accion !== "guardar") setCasilla(accion === "publicar");
      onChanged?.({ itemsActualizados });
      setMensaje(accion === "publicar" ? "Publicado." : accion === "retirar" ? "Marcado como retirado." : "Guardado.");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy("");
    }
  }

  async function desmarcar() {
    if (!onDesmarcarCasilla) return;
    setBusy("desmarcar");
    try {
      await onDesmarcarCasilla();
      setCasilla(false);
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy("");
    }
  }

  const sinAnuncioEnCanal = datos ? !datos.publicaciones.some((p) => p.canal === canal && p.estado !== "Retirado") : false;
  const precioProducto = vivas.find((u) => u.precio !== null)?.precio ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <div className="flex max-h-[94vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-xl border border-[#3A3A36] bg-[#151613] shadow-2xl shadow-black/50">
        <div className="flex items-center gap-2.5 border-b border-[#30312D] px-4 py-2.5">
          <span className={labelClass}>Publicar</span>
          <span className="font-mono text-[13px] font-semibold text-[#D7FF4F]">{datos?.sku ?? sku}</span>
          <span className="min-w-0 truncate text-[14px] font-semibold text-[#F5F5F5]">{datos?.nombre ?? ""}</span>
          {datos ? (
            <span className="shrink-0 text-[12px] text-[#8F908A]">
              {vivas.length} unidad{vivas.length === 1 ? "" : "es"}{precioProducto !== null ? ` · $${precioProducto}` : ""}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(busy)}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#3A3A36] bg-[#20211D] text-[#A7A7A7] transition hover:text-[#F5F5F5]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {!datos ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-[#A7A7A7]">
            {errorCarga ? <span className="text-[#FFB07A]">{errorCarga}</span> : <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Cargando…</>}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {CANALES_EN_GESTOR.map((c) => {
                const estado = estadoCanal(datos.publicaciones, c);
                const activo = c === canal;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setCanal(c); setAlcance("Producto"); setUnidadId(undefined); }}
                    className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-[13px] font-semibold ${activo ? "border-[#D7FF4F] bg-[#D7FF4F]/10 text-[#F5F5F5]" : "border-[#3A3B35] bg-[#1A1B17] text-[#C9CAC1]"}`}
                  >
                    {c} <span className={`text-[11px] font-bold ${ESTADO_COLOR[estado]}`}>{estado}</span>
                  </button>
                );
              })}
              <span className="ml-auto text-[12px] text-[#8F908A]">
                {actual?.estado === "Publicado" && actual.publicadoPor ? `Publicado por ${actual.publicadoPor}${actual.fechaPublicado ? ` · ${fecha(actual.fechaPublicado)}` : ""}` : ""}
              </span>
            </div>

            {casilla && sinAnuncioEnCanal && onDesmarcarCasilla && canal === canalInicial ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#F4C95B]/35 bg-[#F4C95B]/10 px-3 py-1.5 text-[12px] text-[#F4C95B]">
                Casilla marcada sin anuncio guardado.
                <button type="button" onClick={desmarcar} disabled={Boolean(busy)} className="font-semibold underline">Desmarcar casilla</button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-label="Alcance del anuncio" className="inline-flex overflow-hidden rounded-lg border border-[#3A3B35]">
                {(["Producto", "Unidad"] as const).map((a) => {
                  const activo = a === alcance;
                  const nProducto = unidadesCubiertas(datos.unidades, datos.publicaciones, canal, "Producto").length;
                  return (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      onClick={() => {
                        setAlcance(a);
                        if (a === "Unidad") {
                          const conAnuncio = datos.publicaciones.find((p) => p.canal === canal && p.alcance === "Unidad" && p.estado !== "Retirado")?.unidadId;
                          setUnidadId(conAnuncio ?? vivas[0]?.id);
                        } else setUnidadId(undefined);
                      }}
                      className={`h-8 px-3 text-[12.5px] font-semibold ${a === "Unidad" ? "border-l border-[#3A3B35]" : ""} ${activo ? "bg-[#D7FF4F] font-bold text-[#141510]" : "bg-[#151515] text-[#B4B5AC]"}`}
                    >
                      {a === "Producto" ? `Producto · ${nProducto} unidad${nProducto === 1 ? "" : "es"}` : "Unidad aparte"}
                    </button>
                  );
                })}
              </div>
              {alcance === "Unidad" ? (
                <div className="flex flex-wrap gap-1.5">
                  {vivas.map((u) => {
                    const activo = u.id === unidadId;
                    const tiene = buscar(datos.publicaciones, canal, "Unidad", u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => setUnidadId(u.id)}
                        title={tiene ? `Anuncio aparte: ${tiene.estado}` : undefined}
                        className={`h-8 rounded-lg border px-2.5 font-mono text-[12px] font-semibold ${activo ? "border-[#D7FF4F] bg-[#D7FF4F]/10 text-[#F5F5F5]" : "border-[#3A3B35] bg-[#151515] text-[#B4B5AC]"}`}
                      >
                        {etiquetaUnidad(u)}
                        {!u.recibido ? <span className="ml-1 font-sans text-[11px] text-[#8F908A]">por llegar</span> : null}
                        {tiene && tiene.estado !== "Retirado" ? <span className={`ml-1 font-sans text-[11px] ${ESTADO_COLOR[tiene.estado]}`}>●</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <label className="ml-auto flex items-center gap-1.5 text-[12px] text-[#8F908A]">
                Plantilla
                <select
                  value={plantillaId}
                  onChange={(e) => setPlantillaId(e.target.value)}
                  className="h-8 rounded-lg border border-[#3A3B35] bg-[#151515] px-2 text-[12.5px] text-[#EDEDE7]"
                >
                  {plantillasCanal.length ? null : <option value="">Sin plantilla</option>}
                  {plantillasCanal.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <a
                  href={`/shipping-v2/anuncios?ver=plantillas&categoria=${encodeURIComponent(datos.categoria)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] font-semibold text-[#D7FF4F] hover:underline"
                >
                  Editar
                </a>
              </label>
            </div>

            <div className="grid min-h-0 gap-3.5 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={`flex items-center gap-1.5 ${labelClass}`}>
                    Título
                    {tituloManual !== null ? (
                      <button type="button" onClick={() => setTituloManual(null)} title="Volver al título de la plantilla" className="normal-case tracking-normal text-[#B4B5AC] hover:text-[#F5F5F5]">
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      </button>
                    ) : null}
                    <span className={`ml-auto normal-case tracking-normal ${titulo.length > maximo ? "text-[#FF8A6B]" : "text-[#9FEFB3]"}`}>{titulo.length}/{maximo}</span>
                  </span>
                  <input value={titulo} onChange={(e) => setTituloManual(e.target.value)} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Presentación</span>
                  <textarea
                    rows={4}
                    value={presentacion}
                    onChange={(e) => setPresentacion(e.target.value)}
                    placeholder="Para qué sirve y qué lo hace atractivo"
                    className="min-w-0 resize-y rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 py-1.5 text-[12.5px] leading-[1.45] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/60"
                  />
                </label>
                <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-2 gap-y-1 rounded-lg border border-[#2A2B26] bg-[#151612] px-2.5 py-2 text-[12px] text-[#EDEDE7]">
                  <span className="text-[#8F908A]">Precio</span>
                  <span className="flex items-center gap-1">
                    $<input
                      value={precio}
                      onChange={(e) => setPrecio(e.target.value)}
                      inputMode="decimal"
                      aria-label="Precio publicado"
                      className={`h-6 w-24 rounded border bg-[#151515] px-1.5 text-[12px] text-[#F5F5F5] outline-none ${precioValido ? "border-[#3A3B35]" : "border-[#FF8A6B]"}`}
                    />
                  </span>
                  <span className="text-[#8F908A]">Batería</span>
                  <span>{bateriaAnuncio(cubiertas, alcance) || "—"}</span>
                  <span className="text-[#8F908A]">Accesorios</span>
                  <span>
                    {accesoriosTexto || "—"}
                    {sinRevisar ? <span className="ml-1.5 text-[#F4C95B]" title="Se registran en la inspección técnica">{sinRevisar} sin revisar</span> : null}
                    {alcance === "Producto" && accesoriosDistintos(cubiertas) ? <span className="ml-1.5 text-[#F4C95B]" title="Solo sale lo que traen todas">no todas traen lo mismo</span> : null}
                  </span>
                  {plantilla?.descripcion.includes("{{hashtags}}") ? (
                    <>
                      <span className="text-[#8F908A]">Hashtags</span>
                      <span className="break-words">{cubiertas[0] ? hashtagsAnuncio(cubiertas[0], datos.tienda.hashtagsFijos) : "—"}</span>
                    </>
                  ) : null}
                  {canal === "Shopify" ? (
                    <>
                      <span className="text-[#8F908A]">SKU</span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono">{datos.sku}</span>
                        <button type="button" onClick={() => copiar(datos.sku, "sku")} title="Copiar SKU" className="text-[#8F908A] hover:text-[#F5F5F5]">
                          {copiado === "sku" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                        </button>
                      </span>
                    </>
                  ) : null}
                  {porLlegar ? (
                    <>
                      <span className="text-[#8F908A]">Por llegar</span>
                      <span title="Su casilla de Recepción se marca al volver a publicar cuando llegue">{porLlegar} unidad{porLlegar === 1 ? "" : "es"}</span>
                    </>
                  ) : null}
                </div>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Enlace del anuncio</span>
                  <input value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://" className={`${inputClass} font-mono text-[12px]`} />
                </label>
              </div>

              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={labelClass}>Descripción</span>
                  {html ? (
                    <div role="radiogroup" aria-label="Ver descripción" className="inline-flex overflow-hidden rounded-lg border border-[#3A3B35]">
                      {[false, true].map((codigo) => (
                        <button key={String(codigo)} type="button" role="radio" aria-checked={verCodigo === codigo} onClick={() => setVerCodigo(codigo)}
                          className={`h-7 px-2.5 text-[12px] font-semibold ${codigo ? "border-l border-[#3A3B35]" : ""} ${verCodigo === codigo ? "bg-[#33342D] text-[#F5F5F5]" : "bg-[#151515] text-[#8F908A]"}`}>
                          {codigo ? "Código HTML" : "Vista"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {descripcionManual !== null ? (
                    <button type="button" onClick={() => setDescripcionManual(null)} className="inline-flex items-center gap-1 text-[12px] text-[#B4B5AC] hover:text-[#F5F5F5]" title="Descartar cambios a mano y volver a la plantilla">
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />Regenerar
                    </button>
                  ) : null}
                  <button type="button" onClick={() => copiar(titulo, "titulo")} className={`ml-auto ${botonClass}`}>
                    {copiado === "titulo" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}Copiar título
                  </button>
                  <button
                    type="button"
                    onClick={() => copiar(descripcion, "descripcion")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-2.5 text-[12px] font-bold text-[#141510]"
                  >
                    {copiado === "descripcion" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}{html ? "Copiar HTML" : "Copiar descripción"}
                  </button>
                </div>
                {html && !verCodigo ? (
                  <iframe
                    title="Vista de la descripción"
                    sandbox=""
                    srcDoc={`<body style="margin:12px;background:#fff">${descripcion}</body>`}
                    className="min-h-[340px] flex-1 rounded-lg border border-[#2A2B26] bg-white"
                  />
                ) : (
                  <textarea
                    value={descripcion}
                    onChange={(e) => setDescripcionManual(e.target.value)}
                    aria-label="Descripción del anuncio"
                    spellCheck={!html}
                    className={`min-h-[340px] flex-1 resize-y rounded-lg border border-[#2A2B26] bg-[#F7F7F4] px-3 py-2.5 leading-[1.5] text-[#1C1D19] outline-none ${html ? "font-mono text-[11.5px]" : "text-[12px]"}`}
                  />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {mensaje ? <span className="text-[12px] text-[#C9CAC1]">{mensaje}</span> : null}
                  <span className="flex-1" />
                  {actual && (actual.estado === "Publicado" || actual.estado === "Por retirar") ? (
                    <button type="button" onClick={() => guardar("retirar")} disabled={Boolean(busy)} className={botonClass}>
                      {busy === "retirar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Retirado
                    </button>
                  ) : null}
                  <button type="button" onClick={() => guardar("guardar")} disabled={Boolean(busy) || !precioValido} className={botonClass}>
                    {busy === "guardar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => guardar("publicar")}
                    disabled={Boolean(busy) || !precioValido || !titulo.trim() || titulo.length > maximo || (alcance === "Unidad" && !unidadId)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#7BE495] bg-[#7BE495]/10 px-3 text-[12.5px] font-bold text-[#9FEFB3] disabled:opacity-50"
                  >
                    {busy === "publicar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                    {actual?.estado === "Publicado" ? "Actualizar" : "Marcar publicado"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
