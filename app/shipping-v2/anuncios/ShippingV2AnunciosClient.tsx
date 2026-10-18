"use client";

// Pestaña "Anuncios" (punto 10d-2): plantillas por categoría y canal, y datos
// fijos de la tienda. Las plantillas las editan Administrador y Staff; los
// datos de la tienda, solo el Administrador.

import { useMemo, useRef, useState } from "react";
import { Copy, Loader2, Plus } from "lucide-react";
import {
  CANALES_PUBLICACION,
  METACAMPOS,
  TITULO_MAX,
  canalUsaHtml,
  llenarPlantilla,
  llenarTitulo,
  origenMetacampo,
  unidadesCubiertas,
  valoresAnuncio,
  type CanalPublicacion,
  type DatosTienda,
  type GestorPublicacionesDatos,
  type GrupoMetacampo,
  type PlantillaPublicacion,
} from "@/lib/shipping-v2/publicaciones";

type Vista = "plantillas" | "tienda";

const labelClass = "text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]";
const inputClass = "h-8 w-full min-w-0 rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 text-[12.5px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/60 disabled:opacity-60";
const botonClass = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-2.5 text-[12px] font-semibold text-[#EDEDE7] transition hover:border-[#D7FF4F]/50 disabled:opacity-50";
const botonPrincipal = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-[12.5px] font-bold text-[#141510] disabled:opacity-50";

const COLOR_GRUPO: Record<GrupoMetacampo, string> = {
  articulo: "bg-[#2E3A12] text-[#E3F7A0]",
  tienda: "bg-[#173246] text-[#BDEAFF]",
  automatico: "bg-[#3A2A12] text-[#FFD9A0]",
};
const TITULO_GRUPO: Record<GrupoMetacampo, string> = { articulo: "Del artículo", tienda: "De la tienda", automatico: "Automáticos" };

function fecha(valor?: string) {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-EC", { day: "2-digit", month: "short" });
}

export function ShippingV2AnunciosClient({
  plantillas,
  tienda,
  desactualizadas,
  categorias,
  puedeEditarTienda,
  vistaInicial,
  categoriaInicial,
}: {
  plantillas: PlantillaPublicacion[];
  tienda: DatosTienda;
  desactualizadas: number;
  categorias: string[];
  puedeEditarTienda: boolean;
  vistaInicial: Vista;
  categoriaInicial: string;
}) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [datosTienda, setDatosTienda] = useState(tienda);
  return (
    <div className="space-y-3">
      <div role="tablist" className="inline-flex overflow-hidden rounded-lg border border-[#3A3B35]">
        {(["plantillas", "tienda"] as const).map((v, i) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vista === v}
            onClick={() => setVista(v)}
            className={`h-8 px-3 text-[12.5px] font-semibold ${i ? "border-l border-[#3A3B35]" : ""} ${vista === v ? "bg-[#D7FF4F] font-bold text-[#141510]" : "bg-[#151515] text-[#B4B5AC]"}`}
          >
            {v === "plantillas" ? "Plantillas" : "Datos de la tienda"}
          </button>
        ))}
      </div>
      {vista === "plantillas" ? (
        <EditorPlantillas inicial={plantillas} categorias={categorias} categoriaInicial={categoriaInicial} tienda={datosTienda} />
      ) : (
        <FormularioTienda tienda={datosTienda} desactualizadasInicial={desactualizadas} puedeEditar={puedeEditarTienda} onGuardada={setDatosTienda} />
      )}
    </div>
  );
}

// ─── Plantillas ──────────────────────────────────────────────────────────────

type Borrador = Omit<PlantillaPublicacion, "id"> & { id?: string };

/** Lo que se compara para saber si hay cambios sin guardar. */
function huella(b: Borrador) {
  return JSON.stringify([b.id ?? "", b.nombre, b.categoria, b.canal, b.titulo, b.descripcion, b.activa]);
}

function borradorVacio(categoria: string, canal: CanalPublicacion): Borrador {
  return { nombre: `${categoria} · ${canal}`, categoria, canal, titulo: "", descripcion: "", activa: true };
}

function EditorPlantillas({
  inicial,
  categorias,
  categoriaInicial,
  tienda,
}: {
  inicial: PlantillaPublicacion[];
  categorias: string[];
  categoriaInicial: string;
  tienda: DatosTienda;
}) {
  const [lista, setLista] = useState(inicial);
  const [categoria, setCategoria] = useState(categoriaInicial);
  const [borrador, setBorrador] = useState<Borrador>(() => inicial.find((p) => p.categoria === categoriaInicial) ?? borradorVacio(categoriaInicial, "Marketplace"));
  const [original, setOriginal] = useState<string>(() => huella(borrador));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [modo, setModo] = useState<"editar" | "vista">("editar");
  const [skuPrueba, setSkuPrueba] = useState("");
  const [prueba, setPrueba] = useState<GestorPublicacionesDatos | null>(null);
  const [cargandoPrueba, setCargandoPrueba] = useState(false);
  const tituloRef = useRef<HTMLInputElement | null>(null);
  const descripcionRef = useRef<HTMLTextAreaElement | null>(null);
  const ultimoCampo = useRef<"titulo" | "descripcion">("descripcion");

  const cambiado = huella(borrador) !== original;
  const conteo = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of lista) c[p.categoria] = (c[p.categoria] ?? 0) + 1;
    return c;
  }, [lista]);

  function elegir(siguiente: Borrador) {
    if (cambiado && !window.confirm("Hay cambios sin guardar en esta plantilla. ¿Descartarlos?")) return false;
    setBorrador(siguiente);
    setOriginal(huella(siguiente));
    setMensaje("");
    return true;
  }

  function cambiarCategoria(nueva: string) {
    const p = lista.find((x) => x.categoria === nueva);
    if (elegir(p ?? borradorVacio(nueva, "Marketplace"))) setCategoria(nueva);
  }

  /** Canal sin plantilla propia: copia la de "Otros" como punto de partida. */
  function crearDesdeOtros(canal: CanalPublicacion) {
    const base = lista.find((p) => p.categoria === "Otros" && p.canal === canal && p.activa);
    elegir({ ...(base ?? borradorVacio(categoria, canal)), id: undefined, nombre: `${categoria} · ${canal}`, categoria, activa: true });
  }

  function insertar(clave: string) {
    const texto = `{{${clave}}}`;
    const campo = ultimoCampo.current;
    const el = campo === "titulo" ? tituloRef.current : descripcionRef.current;
    const actual = campo === "titulo" ? borrador.titulo : borrador.descripcion;
    const inicio = el?.selectionStart ?? actual.length;
    const fin = el?.selectionEnd ?? actual.length;
    const nuevo = actual.slice(0, inicio) + texto + actual.slice(fin);
    setBorrador((b) => (campo === "titulo" ? { ...b, titulo: nuevo } : { ...b, descripcion: nuevo }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(inicio + texto.length, inicio + texto.length);
    });
  }

  async function guardar() {
    setGuardando(true);
    setMensaje("");
    try {
      const response = await fetch("/api/shipping-v2/publicaciones/plantillas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(borrador),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo guardar."));
      const guardada = payload.data as PlantillaPublicacion;
      setLista((l) => (l.some((p) => p.id === guardada.id) ? l.map((p) => (p.id === guardada.id ? guardada : p)) : [...l, guardada]));
      setBorrador(guardada);
      setOriginal(huella(guardada));
      setMensaje("Guardada.");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  async function probar() {
    const sku = skuPrueba.trim().toUpperCase();
    if (!sku) return;
    setCargandoPrueba(true);
    setMensaje("");
    try {
      const response = await fetch(`/api/shipping-v2/publicaciones?sku=${encodeURIComponent(sku)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se encontró el SKU."));
      setPrueba(payload.data as GestorPublicacionesDatos);
      setModo("vista");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setCargandoPrueba(false);
    }
  }

  const html = canalUsaHtml(borrador.canal);
  const vistaPrevia = useMemo(() => {
    if (modo !== "vista") return null;
    const unidades = prueba ? unidadesCubiertas(prueba.unidades, prueba.publicaciones, borrador.canal, "Producto") : [];
    const presentacion = prueba?.publicaciones.find((p) => p.presentacion.trim())?.presentacion ?? "(presentación)";
    const valores = unidades.length
      ? valoresAnuncio({ unidades, alcance: "Producto", tienda, presentacion, precio: unidades.find((u) => u.precio !== null)?.precio ?? null })
      : null;
    if (!valores) return { titulo: "", descripcion: "" };
    return { titulo: llenarTitulo(borrador.titulo, valores), descripcion: llenarPlantilla(borrador.descripcion, valores, { html }) };
  }, [modo, prueba, borrador, tienda, html]);

  const delaCategoria = lista.filter((p) => p.categoria === categoria);

  return (
    <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)_240px]">
      <div className="flex flex-col gap-1.5">
        <select value={categoria} onChange={(e) => cambiarCategoria(e.target.value)} aria-label="Categoría" className={inputClass}>
          {categorias.map((c) => <option key={c} value={c}>{c}{conteo[c] ? ` · ${conteo[c]}` : ""}</option>)}
        </select>
        {CANALES_PUBLICACION.map((canal) => {
          const delCanal = delaCategoria.filter((p) => p.canal === canal);
          if (!delCanal.length) {
            return (
              <button
                key={canal}
                type="button"
                onClick={() => crearDesdeOtros(canal)}
                title={categoria === "Otros" ? "Crear plantilla" : "Hoy usa la de Otros. Clic para crear una propia a partir de ella."}
                className={`flex h-9 items-center justify-between rounded-lg border border-dashed border-[#3A3B35] px-2.5 text-left text-[12.5px] ${!borrador.id && borrador.canal === canal && borrador.categoria === categoria ? "border-[#D7FF4F] text-[#F5F5F5]" : "text-[#8F908A]"}`}
              >
                {canal}<span className="text-[11px]">{categoria === "Otros" ? "sin plantilla" : "usa Otros"}</span>
              </button>
            );
          }
          return delCanal.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => elegir(p)}
              className={`flex h-9 items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-[12.5px] font-semibold ${borrador.id === p.id ? "border-[#D7FF4F] bg-[#D7FF4F]/10 text-[#F5F5F5]" : "border-[#2A2B26] bg-[#171814] text-[#C9CAC1]"} ${p.activa ? "" : "opacity-50"}`}
            >
              <span className="truncate">{delCanal.length > 1 ? p.nombre : canal}</span>
              {!p.activa ? <span className="text-[11px] font-normal">inactiva</span> : null}
            </button>
          ));
        })}
      </div>

      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Nombre</span>
            <input value={borrador.nombre} onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))} className={inputClass} />
          </label>
          <label className="flex items-end gap-1.5 pb-1.5 text-[12.5px] text-[#C9CAC1]">
            <input type="checkbox" checked={borrador.activa} onChange={(e) => setBorrador((b) => ({ ...b, activa: e.target.checked }))} className="h-[15px] w-[15px] accent-[#D7FF4F]" />
            Activa
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={`flex ${labelClass}`}>
            Título <span className="ml-auto normal-case tracking-normal">{borrador.canal} · límite {TITULO_MAX[borrador.canal]}</span>
          </span>
          <input
            ref={tituloRef}
            value={borrador.titulo}
            onFocus={() => { ultimoCampo.current = "titulo"; }}
            onChange={(e) => setBorrador((b) => ({ ...b, titulo: e.target.value }))}
            className={`${inputClass} font-mono text-[12px]`}
          />
        </label>
        <div className="flex items-center gap-2">
          <span className={labelClass}>Descripción{html ? " (HTML)" : ""}</span>
          <div role="radiogroup" aria-label="Ver" className="ml-auto inline-flex overflow-hidden rounded-lg border border-[#3A3B35]">
            {(["editar", "vista"] as const).map((m, i) => (
              <button key={m} type="button" role="radio" aria-checked={modo === m} onClick={() => setModo(m)}
                className={`h-7 px-2.5 text-[12px] font-semibold ${i ? "border-l border-[#3A3B35]" : ""} ${modo === m ? "bg-[#33342D] text-[#F5F5F5]" : "bg-[#151515] text-[#8F908A]"}`}>
                {m === "editar" ? "Editar" : "Vista previa"}
              </button>
            ))}
          </div>
        </div>
        {modo === "editar" ? (
          <textarea
            ref={descripcionRef}
            value={borrador.descripcion}
            onFocus={() => { ultimoCampo.current = "descripcion"; }}
            onChange={(e) => setBorrador((b) => ({ ...b, descripcion: e.target.value }))}
            aria-label="Descripción"
            spellCheck={false}
            className="min-h-[420px] resize-y rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 py-2 font-mono text-[12px] leading-[1.55] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/60"
          />
        ) : !prueba ? (
          <p className="rounded-lg border border-dashed border-[#3A3B35] px-3 py-6 text-center text-[12.5px] text-[#8F908A]">Escribe un SKU en “Probar con”.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="rounded-lg border border-[#2A2B26] bg-[#151612] px-3 py-2 text-[13px] font-semibold text-[#F5F5F5]">
              {vistaPrevia?.titulo || "—"}
              <span className={`ml-2 text-[11px] font-normal ${(vistaPrevia?.titulo.length ?? 0) > TITULO_MAX[borrador.canal] ? "text-[#FF8A6B]" : "text-[#8F908A]"}`}>
                {vistaPrevia?.titulo.length ?? 0}/{TITULO_MAX[borrador.canal]}
              </span>
            </div>
            {html ? (
              <iframe title="Vista previa" sandbox="" srcDoc={`<body style="margin:12px;background:#fff">${vistaPrevia?.descripcion ?? ""}</body>`} className="h-[420px] w-full rounded-lg border border-[#2A2B26] bg-white" />
            ) : (
              <div className="min-h-[420px] whitespace-pre-wrap rounded-lg border border-[#2A2B26] bg-[#F7F7F4] px-3 py-2.5 text-[12px] leading-[1.5] text-[#1C1D19]">{vistaPrevia?.descripcion}</div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-[#8F908A]">
            Probar con
            <input
              value={skuPrueba}
              onChange={(e) => setSkuPrueba(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void probar(); }}
              placeholder="LAP-000500"
              className="h-8 w-28 rounded-lg border border-[#3A3B35] bg-[#151515] px-2 font-mono text-[12px] text-[#C9CAC1] outline-none"
            />
          </label>
          <button type="button" onClick={() => void probar()} disabled={cargandoPrueba || !skuPrueba.trim()} className={botonClass}>
            {cargandoPrueba ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Ver
          </button>
          {mensaje ? <span className="text-[12px] text-[#C9CAC1]">{mensaje}</span> : null}
          <span className="ml-auto text-[11.5px] text-[#7E7F78]">
            {borrador.id && borrador.editadaPor ? `Editada por ${borrador.editadaPor}${borrador.fechaEdicion ? ` · ${fecha(borrador.fechaEdicion)}` : ""}` : borrador.id ? "" : "Nueva"}
          </span>
          {borrador.id ? (
            <button type="button" onClick={() => elegir({ ...borrador, id: undefined, nombre: `${borrador.nombre} (copia)` })} className={botonClass} title="Otra plantilla para el mismo canal">
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />Duplicar
            </button>
          ) : null}
          <button type="button" onClick={() => void guardar()} disabled={guardando || (!cambiado && Boolean(borrador.id))} className={botonPrincipal}>
            {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Plus className={`h-3.5 w-3.5 ${borrador.id ? "hidden" : ""}`} aria-hidden="true" />}
            {borrador.id ? "Guardar" : "Crear plantilla"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={labelClass} title="Clic para insertar donde está el cursor. El dato lo pone el sistema en cada anuncio; si el equipo no lo tiene, su línea no aparece.">Metacampos</span>
        {(["articulo", "tienda", "automatico"] as const).map((grupo) => (
          <div key={grupo} className="flex flex-col gap-1">
            <span className="text-[11.5px] text-[#8F908A]">{TITULO_GRUPO[grupo]}</span>
            <div className="flex flex-wrap gap-1">
              {METACAMPOS.filter((m) => m.grupo === grupo).map((m) => (
                <button
                  key={m.clave}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertar(m.clave)}
                  title={`Sale de: ${origenMetacampo(m.clave)}`}
                  disabled={modo !== "editar"}
                  className={`rounded px-1.5 py-0.5 font-mono text-[11.5px] disabled:opacity-40 ${COLOR_GRUPO[grupo]}`}
                >
                  {m.etiqueta}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Datos de la tienda ──────────────────────────────────────────────────────

const CAMPOS: Array<{ clave: keyof DatosTienda; etiqueta: string; ancho: 1 | 2 | 3; largo?: boolean; nota?: string }> = [
  { clave: "direccion", etiqueta: "Dirección", ancho: 2 },
  { clave: "web", etiqueta: "Página web", ancho: 1 },
  { clave: "horarioSemana", etiqueta: "Horario lunes a viernes", ancho: 1 },
  { clave: "horarioSabado", etiqueta: "Horario sábados", ancho: 1 },
  { clave: "whatsapp", etiqueta: "WhatsApp", ancho: 1 },
  { clave: "telefonoFijo", etiqueta: "Teléfono fijo", ancho: 1 },
  { clave: "hashtagsFijos", etiqueta: "Hashtags fijos", ancho: 2 },
  { clave: "metodosPago", etiqueta: "Métodos de pago", ancho: 3 },
  { clave: "garantiaCorta", etiqueta: "Garantía corta", ancho: 3, largo: true, nota: "Marketplace, Shopify, Grupos" },
  { clave: "garantiaLarga", etiqueta: "Garantía larga", ancho: 3, largo: true, nota: "Mercado Libre" },
];

function FormularioTienda({
  tienda,
  desactualizadasInicial,
  puedeEditar,
  onGuardada,
}: {
  tienda: DatosTienda;
  desactualizadasInicial: number;
  puedeEditar: boolean;
  onGuardada: (t: DatosTienda) => void;
}) {
  const [valores, setValores] = useState<DatosTienda>(tienda);
  const [desactualizadas, setDesactualizadas] = useState(desactualizadasInicial);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const cambiado = CAMPOS.some((c) => String(valores[c.clave] ?? "").trim() !== String(tienda[c.clave] ?? "").trim());

  async function guardar() {
    setGuardando(true);
    setMensaje("");
    try {
      const response = await fetch("/api/shipping-v2/publicaciones/tienda", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(CAMPOS.map((c) => [c.clave, valores[c.clave]]))),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo guardar."));
      const { tienda: guardada, desactualizadas: n } = payload.data as { tienda: DatosTienda; desactualizadas: number };
      setValores(guardada);
      setDesactualizadas(n);
      onGuardada(guardada);
      setMensaje("Guardado.");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex max-w-[1000px] flex-col gap-3">
      <div className="grid gap-2.5 sm:grid-cols-3">
        {CAMPOS.map((c) => (
          <label key={c.clave} className={`flex flex-col gap-1 ${c.ancho === 3 ? "sm:col-span-3" : c.ancho === 2 ? "sm:col-span-2" : ""}`}>
            <span className={`flex ${labelClass}`}>
              {c.etiqueta}
              {c.nota ? <span className="ml-auto font-medium normal-case tracking-normal text-[#7E7F78]">{c.nota}</span> : null}
            </span>
            {c.largo ? (
              <textarea
                rows={2}
                value={String(valores[c.clave] ?? "")}
                disabled={!puedeEditar}
                onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
                className="resize-y rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 py-1.5 text-[12.5px] leading-[1.45] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/60 disabled:opacity-60"
              />
            ) : (
              <input
                value={String(valores[c.clave] ?? "")}
                disabled={!puedeEditar}
                onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
                className={inputClass}
              />
            )}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        {desactualizadas ? (
          <span className="text-[#F4C95B]" title="Los anuncios ya publicados no cambian solos">
            <b>{desactualizadas}</b> anuncio{desactualizadas === 1 ? "" : "s"} publicado{desactualizadas === 1 ? "" : "s"} con los datos anteriores
          </span>
        ) : null}
        {mensaje ? <span className="text-[#C9CAC1]">{mensaje}</span> : null}
        <span className="ml-auto text-[11.5px] text-[#7E7F78]">
          {puedeEditar ? (valores.editadoPor ? `Editado por ${valores.editadoPor}${valores.fechaEdicion ? ` · ${fecha(valores.fechaEdicion)}` : ""}` : "") : "Solo el Administrador los cambia"}
        </span>
        {puedeEditar ? (
          <button type="button" onClick={() => void guardar()} disabled={guardando || !cambiado} className={botonPrincipal}>
            {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Guardar
          </button>
        ) : null}
      </div>
    </div>
  );
}
