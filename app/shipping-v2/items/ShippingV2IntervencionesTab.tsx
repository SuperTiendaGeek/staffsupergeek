"use client";

// Pestaña "Mantenimientos y mejoras" de la ficha del artículo.
//
// Punto 3 de la auditoría (6-oct-2026): es el ÚNICO lugar para registrarlos.
// Antes vivían dentro de la Inspección de Recepción, y por eso a un equipo ya
// a la venta, o a uno que no requiere inspección, no se le podía registrar
// nada. Reglas: lib/shipping-v2/mejoras.ts e intervenciones.ts.
//
//   Mantenimiento → conserva lo que el equipo es (limpieza, pasta térmica…).
//   Mejora        → le pone una pieza del inventario y la descuenta.

import { EnlaceArticulo } from "@/components/shipping-v2/ficha-articulo/contexto";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { ShippingV2Intervencion } from "@/lib/shipping-v2/airtable";
import { CATEGORIAS_REPUESTO_STOCK, valorSugeridoPiezaRetirada } from "@/lib/shipping-v2/mejoras";

type Repuesto = { id: string; sku: string; nombre: string; categoria: string; stock: number; costo: number };
type ProductoPieza = { sku: string; nombre: string; categoria: string; condicion: string; seguimiento: string; precio: number | null; costo: number };

type Panel = {
  itemId: string;
  sku: string;
  categoria: string;
  cantidad: number;
  puedeRegistrar: boolean;
  motivoBloqueo?: string;
  puedeMejorar: boolean;
  puedeVerCostos: boolean;
  puedeAnular: boolean;
  costoMejoras: number | null;
  costoEquipo: number | null;
  precioEquipo: number | null;
  trabajos: { mantenimientos: string[]; mejoras: string[] };
  intervenciones: ShippingV2Intervencion[];
  repuestos: Repuesto[];
  productosPieza: ProductoPieza[];
};

const money = (n: number) => `$${(n || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inputBase =
  "h-8 rounded-lg border border-[#3A3A36] bg-[#151515] px-2.5 text-[12.5px] text-[#F5F5F5] outline-none placeholder:text-[#696A64] transition focus:border-[#D7FF4F]/70";
const inputCls = `${inputBase} w-full`;

function fecha(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-EC", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Fila "etiqueta | control" (etiqueta corta a la izquierda, sin ayudas largas). */
function Fila({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[3.6rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-[11.5px] font-medium text-[#8F908A]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Buscador con lista (SKU, nombre o categoría). Al elegir, queda un chip con ×. */
function Buscador<T>({ opciones, texto, elegido, alElegir, alQuitar, clave, linea, placeholder, extra }: {
  opciones: T[];
  texto: (o: T) => string;
  elegido: ReactNode | null;
  alElegir: (o: T) => void;
  alQuitar: () => void;
  clave: (o: T) => string;
  linea: (o: T) => ReactNode;
  placeholder: string;
  /** Última opción fija (p. ej. "Otra pieza: «…»"). */
  extra?: (q: string) => { contenido: ReactNode; alElegir: () => void } | null;
}) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const lista = useMemo(() => {
    const t = normalizar(q.trim());
    return (t ? opciones.filter((o) => normalizar(texto(o)).includes(t)) : opciones).slice(0, 8);
  }, [opciones, q, texto]);
  const fija = extra ? extra(q.trim()) : null;
  const total = lista.length + (fija ? 1 : 0);

  if (elegido) {
    return (
      <span className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-[#D7FF4F]/40 bg-[#D7FF4F]/[0.06] px-2.5 text-[12.5px] animate-[sg-entrada_160ms_ease-out]">
        <span className="min-w-0 flex-1 truncate">{elegido}</span>
        <button type="button" aria-label="Quitar" onClick={() => { alQuitar(); setQ(""); setTimeout(() => ref.current?.focus(), 0); }} className="text-[#8F908A] hover:text-[#EDEDE7]"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
      </span>
    );
  }
  const elegir = (i: number) => {
    if (i < lista.length) alElegir(lista[i]);
    else fija?.alElegir();
    setAbierto(false);
  };
  return (
    <div className="relative">
      <input ref={ref} value={q} placeholder={placeholder} aria-label={placeholder}
        onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={(e) => { setQ(e.target.value); setActivo(0); setAbierto(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, Math.max(total - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && total) { e.preventDefault(); elegir(activo); }
          else if (e.key === "Escape") setAbierto(false);
        }}
        className={inputCls} />
      {abierto && total ? (
        <div className="absolute left-0 right-0 top-9 z-30 max-h-64 overflow-y-auto rounded-lg border border-[#3A3B35] bg-[#171814] shadow-xl shadow-black/40 animate-[sg-entrada_140ms_ease-out]">
          {lista.map((o, i) => (
            <button key={clave(o)} type="button" onMouseDown={(e) => { e.preventDefault(); elegir(i); }}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] ${i === activo ? "bg-[#D7FF4F]/[0.08]" : "hover:bg-white/[0.03]"}`}>
              {linea(o)}
            </button>
          ))}
          {fija ? (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); elegir(lista.length); }}
              className={`flex w-full items-center gap-2 border-t border-[#30312D] px-2.5 py-1.5 text-left text-[12.5px] text-[#D7FF4F] ${activo === lista.length ? "bg-[#D7FF4F]/[0.08]" : "hover:bg-white/[0.03]"}`}>
              {fija.contenido}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ShippingV2IntervencionesTab({ itemId }: { itemId: string }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [modo, setModo] = useState<"Mantenimiento" | "Mejora">("Mantenimiento");

  // Mantenimiento
  const [mantTipo, setMantTipo] = useState("");
  const [mantNota, setMantNota] = useState("");
  // Mejora
  const [mejTipo, setMejTipo] = useState("");
  const [piezaId, setPiezaId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [mejNota, setMejNota] = useState("");
  // Costo (punto 3): sugerido = costo de la pieza × unidades; se puede cambiar.
  const [costoTexto, setCostoTexto] = useState("");
  const [costoEditado, setCostoEditado] = useState(false);
  // Pieza que sale (punto 13): igual a un producto existente o una pieza nueva.
  const [conRetirada, setConRetirada] = useState(false);
  const [retComo, setRetComo] = useState<ProductoPieza | null>(null);
  const [retNueva, setRetNueva] = useState(false);
  const [retNombre, setRetNombre] = useState("");
  const [retCategoria, setRetCategoria] = useState("");
  const [retCantidad, setRetCantidad] = useState("1");
  const [retValor, setRetValor] = useState(""); // vacío = automático
  const [retPrecio, setRetPrecio] = useState("");
  // Anular (solo Administrador): qué registro se está anulando y por qué.
  const [anulandoId, setAnulandoId] = useState("");
  const [motivoAnulacion, setMotivoAnulacion] = useState("");

  const aplicarPanel = useCallback((data: Panel) => {
    setPanel(data);
    setMantTipo((t) => (t && data.trabajos.mantenimientos.includes(t) ? t : data.trabajos.mantenimientos[0] ?? ""));
    setMejTipo((t) => (t && data.trabajos.mejoras.includes(t) ? t : data.trabajos.mejoras[0] ?? ""));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/shipping-v2/items/${itemId}/intervenciones`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo cargar.");
      aplicarPanel(json.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setCargando(false);
    }
  }, [itemId, aplicarPanel]);

  useEffect(() => { void cargar(); }, [cargar]);

  const pieza = panel?.repuestos.find((r) => r.id === piezaId) ?? null;
  const cantidadNum = Number(cantidad);
  const cantidadValida = Number.isInteger(cantidadNum) && cantidadNum >= 1 && (!pieza || cantidadNum <= pieza.stock);
  const costoSugerido = pieza && cantidadValida ? Math.round(pieza.costo * cantidadNum * 100) / 100 : 0;
  const variasUnidades = (panel?.cantidad ?? 1) > 1;

  // Mientras nadie lo toque, el costo sigue al sugerido.
  useEffect(() => {
    if (!costoEditado) setCostoTexto(costoSugerido ? costoSugerido.toFixed(2) : "0");
  }, [costoSugerido, costoEditado]);

  const costoNum = Number(costoTexto);
  const costoValido = costoTexto.trim() !== "" && Number.isFinite(costoNum) && costoNum >= 0;

  // Pieza que sale: lo que propone el sistema (misma regla que el servidor).
  const retPrecioNum = retPrecio.trim() === "" ? null : Number(retPrecio);
  const retPrecioEfectivo = retPrecioNum ?? retComo?.precio ?? null;
  const unaPorVez = (retComo?.seguimiento ?? "") === "Unidad" || ["mainboard", "tarjeta grafica"].includes(normalizar(retComo?.categoria ?? retCategoria));
  const retCantidadNum = unaPorVez ? 1 : Number(retCantidad);
  const automatico = valorSugeridoPiezaRetirada({
    costoMismaPieza: retComo?.costo,
    precioPieza: retPrecioEfectivo,
    costoEquipo: panel?.costoEquipo,
    precioEquipo: panel?.precioEquipo,
  });
  const retValorNum = retValor.trim() === "" ? automatico.valor : Number(retValor);
  const retElegida = Boolean(retComo) || (retNueva && retNombre.trim() !== "");
  const retiradaValida = !conRetirada || (
    retElegida && (Boolean(retComo) || retCategoria !== "") &&
    Number.isInteger(retCantidadNum) && retCantidadNum >= 1 &&
    Number.isFinite(retValorNum) && retValorNum >= 0 &&
    (retPrecioNum === null || (Number.isFinite(retPrecioNum) && retPrecioNum >= 0))
  );
  const criterioTexto = automatico.criterio === "misma-pieza" ? `= ${retComo?.sku}` : automatico.criterio === "por-precio" ? "por precio" : "sin precio";
  const criterioAyuda = automatico.criterio === "misma-pieza" ? `Lo que cuesta ${retComo?.sku} en el inventario` : automatico.criterio === "por-precio" ? "Costo del equipo × precio de la pieza ÷ precio del equipo" : "Ponle precio para calcularlo";
  const suma = panel?.puedeVerCostos && !variasUnidades && costoValido ? costoNum : 0;
  const resta = conRetirada && retiradaValida && !variasUnidades ? Math.round(retValorNum * retCantidadNum * 100) / 100 : 0;
  const costoAntes = panel?.costoEquipo ?? 0;
  const costoDespues = Math.round((costoAntes + suma - resta) * 100) / 100;

  function limpiarRetirada() {
    setRetComo(null); setRetNueva(false); setRetNombre(""); setRetCategoria(""); setRetCantidad("1"); setRetValor(""); setRetPrecio("");
  }

  async function anular(intervencionId: string) {
    setGuardando(true); setError(""); setAviso("");
    try {
      const res = await fetch(`/api/shipping-v2/items/${itemId}/intervenciones`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "anular", intervencionId, motivo: motivoAnulacion.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo anular.");
      aplicarPanel(json.data);
      setAnulandoId(""); setMotivoAnulacion("");
      const pendiente: string[] = json.anulacion?.pendiente ?? [];
      setAviso(String(json.anulacion?.resultado ?? "Anulado.").replace(/\n?PENDIENTE A MANO:[\s\S]*$/, "").replace(/\n/g, " "));
      if (pendiente.length) setError(`Quedó pendiente a mano:\n${pendiente.join("\n")}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setGuardando(false);
    }
  }

  async function registrar(cuerpo: Record<string, unknown>, limpiar: () => void) {
    setGuardando(true); setError(""); setAviso("");
    try {
      const res = await fetch(`/api/shipping-v2/items/${itemId}/intervenciones`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo registrar.");
      aplicarPanel(json.data);
      limpiar();
      const partes = [json.repuestoDescontado
        ? `Mejora registrada: −${cuerpo.cantidadUsada} ${json.repuestoDescontado}.`
        : "Mantenimiento registrado."];
      if (json.piezaRetiradaSku) partes.push(`Entró ${json.piezaRetiradaSku}.`);
      setAviso(partes.join(" "));
      if (Array.isArray(json.avisos) && json.avisos.length) setError(json.avisos.join("\n"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="px-3 py-6 text-sm text-[#A7A7A7]">Cargando…</p>;
  if (!panel) return <p className="px-3 py-6 text-sm text-[#FFB07A]">{error || "No se pudo cargar."}</p>;

  const botonPrincipal = "h-8 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-[12.5px] font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50";

  return (
    <div className="space-y-3">
      {!panel.puedeRegistrar ? (
        <p className="rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{panel.motivoBloqueo}</p>
      ) : null}
      {error ? (
        <p className="whitespace-pre-line rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-[12.5px] text-[#FFB07A] animate-[sg-sacudir_300ms_ease-out]">{error}</p>
      ) : null}
      {aviso ? (
        <p className="rounded-lg border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-2 text-[12.5px] text-[#D7FF4F] animate-[sg-entrada_200ms_ease-out]">{aviso}</p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(300px,440px)_minmax(0,1fr)]">
        {panel.puedeRegistrar ? (
          <section className="space-y-2 rounded-lg border border-[#30312D] bg-[#171814] p-3">
            <div className="inline-flex overflow-hidden rounded-lg border border-[#3A3B35]" role="tablist">
              {(["Mantenimiento", "Mejora"] as const).map((m, i) => (
                <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => { setModo(m); setError(""); setAviso(""); }}
                  title={m === "Mantenimiento" ? "Conserva lo que el equipo es (no mueve inventario)" : "Le pone una pieza del inventario y la descuenta"}
                  className={`${i ? "border-l border-[#3A3B35]" : ""} h-8 px-3 text-[12.5px] transition-colors ${modo === m ? "bg-[#D7FF4F] font-bold text-[#141510]" : "bg-[#151515] font-semibold text-[#B4B5AC] hover:text-[#EDEDE7]"}`}>
                  {m}
                </button>
              ))}
            </div>

            {modo === "Mantenimiento" ? (
              <>
                <Fila label="Trabajo">
                  <select value={mantTipo} onChange={(e) => setMantTipo(e.target.value)} className={inputCls}>
                    {panel.trabajos.mantenimientos.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Fila>
                <Fila label="Nota">
                  <input type="text" value={mantNota} onChange={(e) => setMantNota(e.target.value)} placeholder="Qué se hizo" className={inputCls} />
                </Fila>
                <div className="flex justify-end">
                  <button type="button" disabled={guardando || !mantTipo} className={botonPrincipal}
                    onClick={() => void registrar({ tipo: "Mantenimiento", detalle: mantTipo, nota: mantNota.trim() }, () => setMantNota(""))}>
                    Registrar
                  </button>
                </div>
              </>
            ) : !panel.puedeMejorar ? (
              <p className="rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-[12.5px] text-[#FFB07A]">Tu usuario no puede editar artículos: una mejora descuenta inventario.</p>
            ) : (
              <>
                <Fila label="Trabajo">
                  <select value={mejTipo} onChange={(e) => setMejTipo(e.target.value)} className={inputCls}>
                    {panel.trabajos.mejoras.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Fila>
                <Fila label="Entra">
                  <div className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1">
                      <Buscador
                        opciones={panel.repuestos}
                        texto={(r) => `${r.sku} ${r.nombre} ${r.categoria}`}
                        clave={(r) => r.id}
                        linea={(r) => <><span className="font-mono font-semibold">{r.sku}</span><span className="min-w-0 flex-1 truncate text-[#C9CAC1]">{r.nombre}</span><span className="text-[11px] text-[#8F908A]">{r.stock} libre{r.stock === 1 ? "" : "s"}</span></>}
                        elegido={pieza ? <><span className="font-mono font-semibold">{pieza.sku}</span> <span className="text-[#C9CAC1]">{pieza.nombre}</span></> : null}
                        alElegir={(r) => { setPiezaId(r.id); setCantidad("1"); }}
                        alQuitar={() => setPiezaId("")}
                        placeholder="Pieza del inventario"
                      />
                    </div>
                    <input type="number" min={1} max={pieza?.stock} step={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} aria-label="Cantidad" title={pieza ? `Máximo ${pieza.stock}` : "Cantidad"} className={`${inputBase} w-14 shrink-0 text-center ${cantidadValida ? "" : "border-[#FF914D]/60"}`} />
                  </div>
                </Fila>
                {panel.puedeVerCostos && pieza && !variasUnidades ? (
                  <Fila label="Suma">
                    <input type="number" min={0} step="0.01" value={costoTexto} aria-label="Costo que se suma al equipo" title={`Sugerido ${money(costoSugerido)}`}
                      onChange={(e) => { setCostoTexto(e.target.value); setCostoEditado(true); }} className={`${inputBase} w-28`} />
                  </Fila>
                ) : null}

                <Fila label="Sale">
                  {!conRetirada ? (
                    <button type="button" onClick={() => setConRetirada(true)} className="h-8 rounded-lg border border-dashed border-[#3A3B35] px-2.5 text-[12.5px] font-semibold text-[#B4B5AC] hover:border-[#D7FF4F]/50 hover:text-[#EDEDE7]">
                      + Una pieza del equipo
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="min-w-0 flex-1">
                        <Buscador
                          opciones={panel.productosPieza}
                          texto={(p) => `${p.sku} ${p.nombre} ${p.categoria}`}
                          clave={(p) => p.sku}
                          linea={(p) => <><span className="font-mono font-semibold">{p.sku}</span><span className="min-w-0 flex-1 truncate text-[#C9CAC1]">{p.nombre}</span>{p.condicion ? <span className="text-[11px] text-[#8F908A]">{p.condicion}</span> : null}</>}
                          elegido={retComo
                            ? <><span className="font-mono font-semibold">{retComo.sku}</span> <span className="text-[#C9CAC1]">{retComo.nombre}</span></>
                            : retNueva ? <><span className="text-[#8F908A]">Nueva:</span> {retNombre}</> : null}
                          alElegir={(p) => { setRetComo(p); setRetNueva(false); setRetValor(""); }}
                          alQuitar={limpiarRetirada}
                          placeholder="¿Qué pieza sale?"
                          extra={(q) => q.length >= 3 ? { contenido: <>+ Pieza nueva: «{q}»</>, alElegir: () => { setRetComo(null); setRetNueva(true); setRetNombre(q); setRetValor(""); } } : null}
                        />
                      </div>
                      {!unaPorVez ? (
                        <input type="number" min={1} step={1} value={retCantidad} onChange={(e) => setRetCantidad(e.target.value)} aria-label="Cantidad que sale" title="Cantidad" className={`${inputBase} w-14 shrink-0 text-center`} />
                      ) : null}
                      <button type="button" aria-label="No sale ninguna pieza" title="No sale ninguna pieza" onClick={() => { setConRetirada(false); limpiarRetirada(); }} className="text-[#8F908A] hover:text-[#EDEDE7]"><X className="h-4 w-4" aria-hidden="true" /></button>
                    </div>
                  )}
                </Fila>
                {conRetirada && retNueva ? (
                  <Fila label="Categoría">
                    <select value={retCategoria} onChange={(e) => setRetCategoria(e.target.value)} className={`${inputCls} animate-[sg-entrada_160ms_ease-out]`}>
                      <option value="">Elige</option>
                      {CATEGORIAS_REPUESTO_STOCK.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Fila>
                ) : null}
                {conRetirada && retElegida ? (
                  <Fila label="Precio">
                    <div className="flex items-center gap-1.5 animate-[sg-entrada_160ms_ease-out]">
                      <input type="number" min={0} step="0.01" value={retPrecio} onChange={(e) => setRetPrecio(e.target.value)} aria-label="Precio de venta"
                        placeholder={retComo?.precio ? retComo.precio.toFixed(2) : "Venta"} className={`${inputBase} w-24 shrink-0`} />
                      {panel.puedeVerCostos ? (
                        <>
                          <span className="ml-1 text-[11.5px] text-[#8F908A]">Vale</span>
                          <input type="number" min={0} step="0.01" value={retValor} onChange={(e) => setRetValor(e.target.value)} aria-label="Valor de la pieza que sale"
                            placeholder={automatico.valor.toFixed(2)} className={`${inputBase} w-24 shrink-0`} />
                          <span className="min-w-0 truncate text-[11px] text-[#6F706A]" title={retValor.trim() === "" ? criterioAyuda : "Escrito a mano"}>{retValor.trim() === "" ? criterioTexto : "a mano"}</span>
                        </>
                      ) : null}
                    </div>
                  </Fila>
                ) : null}

                <Fila label="Nota">
                  <input type="text" value={mejNota} onChange={(e) => setMejNota(e.target.value)} placeholder="Ej: de 8 a 16 GB" className={inputCls} />
                </Fila>

                {pieza && cantidadValida ? (
                  <p className="rounded-lg border border-dashed border-[#3A3A36] bg-[#11120F] px-2.5 py-1.5 text-[12px] tabular-nums text-[#B4B5AC]">
                    <span className="text-[#FFB07A]">−{cantidadNum} {pieza.sku}</span>
                    {cantidadNum === pieza.stock ? <span className="text-[#8F908A]"> (última: queda Agotado)</span> : null}
                    {conRetirada && retiradaValida ? <> · <span className="text-[#7BE495]">+{retCantidadNum} {retComo ? retComo.sku : "pieza nueva"}{panel.puedeVerCostos ? ` a ${money(retValorNum)}` : ""}</span></> : null}
                    {panel.puedeVerCostos && !variasUnidades ? (
                      <> · {panel.sku} {money(costoAntes)} → <b key={costoDespues} className="inline-block text-[#EDEDE7] animate-[sg-destello_700ms_ease-out]">{money(costoDespues)}</b></>
                    ) : null}
                    {variasUnidades ? <span className="block text-[#F4C95B]">Lote de {panel.cantidad} u.: el costo del equipo no cambia.</span> : null}
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <button type="button" className={botonPrincipal}
                    disabled={guardando || !mejTipo || !pieza || !cantidadValida || !retiradaValida || (panel.puedeVerCostos && !variasUnidades && !costoValido) || costoDespues < 0}
                    onClick={() => void registrar(
                      {
                        tipo: "Mejora", detalle: mejTipo, nota: mejNota.trim(), repuestoId: piezaId, cantidadUsada: cantidadNum,
                        ...(panel.puedeVerCostos && !variasUnidades ? { costoSumado: costoNum } : {}),
                        ...(conRetirada
                          ? { piezaRetirada: {
                              comoSku: retComo?.sku,
                              nombre: retComo ? retComo.nombre : retNombre.trim(),
                              categoria: retComo ? retComo.categoria : retCategoria,
                              cantidad: retCantidadNum,
                              valor: panel.puedeVerCostos && retValor.trim() !== "" ? Number(retValor) : null,
                              precioVenta: retPrecioNum,
                            } }
                          : {}),
                      },
                      () => {
                        setMejNota(""); setPiezaId(""); setCantidad("1");
                        setCostoEditado(false); setConRetirada(false); limpiarRetirada();
                      })}>
                    Registrar mejora
                  </button>
                </div>
              </>
            )}
          </section>
        ) : null}

        <section className="rounded-lg border border-[#30312D] bg-[#171814]">
          <div className="flex items-baseline gap-2 px-3 pb-2 pt-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-normal text-[#F5F5F5]">Historial</h3>
            <span className="ml-auto font-mono text-[12px] text-[#A7A7A7]">{panel.intervenciones.length}</span>
          </div>
          <div className="px-3 pb-3">
            {!panel.intervenciones.length ? (
              <p className="py-6 text-center text-sm text-[#696A64]">Todavía no se registró nada.</p>
            ) : panel.intervenciones.map((r) => (
              <div key={r.id} className={`flex gap-2.5 border-b border-[#30312D] py-2.5 last:border-b-0 ${r.anulada ? "opacity-60" : ""}`}>
                <span aria-hidden="true" className={`grid h-7 w-7 flex-none place-items-center rounded-lg text-[13px] ${
                  r.tipo === "Mejora" ? "bg-[#C99BFF]/16 text-[#C99BFF]" : "bg-[#5BC8F5]/16 text-[#5BC8F5]"}`}>
                  {r.tipo === "Mejora" ? "⬆" : "🛠"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-semibold text-[#F5F5F5] ${r.anulada ? "line-through" : ""}`}>{r.tipo} · {r.detalle || "—"}</span>
                    {r.anulada ? (
                      <span className="rounded-full border border-[#FF7A6B]/45 bg-[#FF7A6B]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#FFB3A9]">Anulada</span>
                    ) : null}
                  </div>
                  {r.nota ? <div className="mt-0.5 text-[12px] text-[#B4B5AC]">{r.nota}</div> : null}
                  <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-[#7E7F76]">
                    <span>Por <b className="text-[#B4B5AC]">{r.realizadoPor || "—"}</b></span>
                    <span>{fecha(r.fecha)}</span>
                    {r.cantidadUsada ? <span className="font-mono text-[#D7FF4F]">−{r.cantidadUsada} unidad(es)</span> : null}
                    {panel.puedeVerCostos && r.costoSumado ? <span className="font-mono text-[#B4B5AC]">+{money(r.costoSumado)} al costo</span> : null}
                    {panel.puedeVerCostos && r.valorPiezaRetirada ? <span className="font-mono text-[#B4B5AC]">−{money(r.valorPiezaRetirada)} pieza retirada</span> : null}
                    {r.piezaRetiradaId ? (
                      <EnlaceArticulo id={r.piezaRetiradaId} className="font-semibold text-[#D7FF4F] hover:underline">Ver pieza retirada</EnlaceArticulo>
                    ) : null}
                  </div>
                  {r.anulada ? (
                    <div className="mt-1.5 rounded-md border border-[#FF7A6B]/30 bg-[#FF7A6B]/5 px-2 py-1.5 text-[11px] text-[#FFB3A9]">
                      Anulada por <b>{r.anuladaPor || "—"}</b> · {fecha(r.fechaAnulacion)}
                      {r.motivoAnulacion ? <> · Motivo: {r.motivoAnulacion}</> : null}
                      {r.resultadoAnulacion ? <div className="mt-1 whitespace-pre-line text-[#B4B5AC]">{r.resultadoAnulacion}</div> : null}
                    </div>
                  ) : panel.puedeAnular ? (
                    anulandoId === r.id ? (
                      <div className="mt-2 space-y-2 rounded-md border border-[#FF7A6B]/35 bg-[#FF7A6B]/5 p-2">
                        <p className="text-[11.5px] text-[#FFB3A9]">
                          {r.tipo === "Mejora"
                            ? "Se devolverán las unidades a la pieza usada, el costo del equipo volverá a como estaba y se eliminará la pieza retirada. Queda registrado como anulado."
                            : "El mantenimiento quedará marcado como anulado (no mueve inventario)."}
                        </p>
                        <input type="text" value={motivoAnulacion} onChange={(e) => setMotivoAnulacion(e.target.value)}
                          placeholder="Motivo (obligatorio). Ej: era una prueba." className={inputCls} />
                        <div className="flex gap-2">
                          <button type="button" disabled={guardando || motivoAnulacion.trim().length < 5} onClick={() => void anular(r.id)}
                            className="rounded-lg border border-[#FF7A6B] bg-[#FF7A6B] px-3 py-1.5 text-sm font-bold text-[#151515] disabled:opacity-50">
                            Confirmar anulación
                          </button>
                          <button type="button" disabled={guardando} onClick={() => { setAnulandoId(""); setMotivoAnulacion(""); }}
                            className="rounded-lg border border-[#3A3A36] px-3 py-1.5 text-sm font-semibold text-[#A7A7A7]">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" disabled={guardando} onClick={() => { setAnulandoId(r.id); setMotivoAnulacion(""); setError(""); setAviso(""); }}
                        className="mt-1.5 text-[11px] font-semibold text-[#FFB3A9] hover:underline">
                        Anular (Administrador)
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
