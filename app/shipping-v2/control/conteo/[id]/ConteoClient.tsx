"use client";

// Conteo físico (punto 10c-2a). Mientras se cuenta: un solo campo que acepta
// el escáner (SKU o serie) o lo que se escriba (busca por nombre si no es un
// código). Conteo ciego: solo se ve cuántos se llevan contados, nunca cuántos
// debería haber. Varias personas pueden contar a la vez. Al terminar se ve la
// comparación con el sistema; aquí no se cambia el stock (eso es 10c-2b, solo
// el Administrador).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Loader2, Minus, Plus, X } from "lucide-react";
import {
  buscarParaContar,
  esUnidad,
  leerCodigo,
  lineasVivas,
  totalContado,
  type FilaConteo,
  type ItemConteo,
  type Lectura,
  type LineaConteo,
  type ResultadoConteo,
  type TipoLinea,
} from "@/lib/shipping-v2/conteo";
import type { ShippingV2Conteo } from "@/lib/shipping-v2/airtable";

type Datos = { conteo: ShippingV2Conteo; lineas: LineaConteo[]; indice?: ItemConteo[]; resultado?: ResultadoConteo };

const API = "/api/shipping-v2/control/conteos";
const VOLVER = "/shipping-v2/control?vista=conteos";
const boton = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-3 text-[12.5px] font-semibold text-[#EDEDE7] transition hover:border-[#D7FF4F]/50 disabled:opacity-50";
const botonPrincipal = "inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#D7FF4F] px-3 text-[12.5px] font-bold text-[#141510] hover:bg-[#E4FF7A] disabled:opacity-50";
const formato = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });
const dinero = { format: (v: number) => `${v < 0 ? "−" : v > 0 ? "+" : ""}${formato.format(Math.abs(v))}` };
const FUERA_DE_TIENDA = /vendido|agotado|baja|cancelado|archivado|usado en|perdido|partes|devuelto|desarmado/i;

function hora(valor?: string) {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("es-EC", hoy ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function serieDe(i: Pick<ItemConteo, "numeroSerie" | "id">) {
  return i.numeroSerie ? `S/N ${i.numeroSerie}` : `sin serie · ${i.id.slice(-5)}`;
}

function nombres(lista: string[]) {
  return Array.from(new Set(lista.filter(Boolean))).join(", ");
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const j = await r.json().catch(() => ({ success: false, error: "Respuesta no válida." }));
  if (!j.success) throw new Error(j.error || "Error inesperado.");
  return j.data as T;
}

export function ConteoClient({ conteoId, actor, esAdministrador }: { conteoId: string; actor: string; esAdministrador: boolean }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      setDatos(await pedir<Datos>(`${API}/${conteoId}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    }
  }, [conteoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error && !datos) return <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-4 text-sm text-orange-100">{error}</section>;
  if (!datos) return <p className="flex items-center gap-2 py-10 text-[12.5px] text-[#8F908A]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Cargando el conteo…</p>;
  const puedeCancelar = esAdministrador || datos.conteo.creadoPor === actor;
  if (datos.conteo.estado === "Contando" && datos.indice) {
    return <Contando key={`${datos.conteo.id}:${datos.conteo.recontar.join()}`} conteo={datos.conteo} lineasIniciales={datos.lineas} indice={datos.indice} actor={actor} puedeCancelar={puedeCancelar} onCambio={cargar} />;
  }
  return <Revision conteo={datos.conteo} lineas={datos.lineas} resultado={datos.resultado ?? null} puedeCancelar={puedeCancelar} onCambio={cargar} />;
}

// ─── Mientras se cuenta ──────────────────────────────────────────────────────

type Aviso = { tipo: "ok" | "aviso" | "error"; titulo: string; detalle?: string } | null;
type FilaVista =
  | { clave: string; tipo: "linea"; linea: LineaConteo; fecha: string }
  | { clave: string; tipo: "lote"; sku: string; item?: ItemConteo; total: number; quien: string; fecha: string; pendiente: boolean };

function Contando({
  conteo,
  lineasIniciales,
  indice,
  actor,
  puedeCancelar,
  onCambio,
}: {
  conteo: ShippingV2Conteo;
  lineasIniciales: LineaConteo[];
  indice: ItemConteo[];
  actor: string;
  puedeCancelar: boolean;
  onCambio: () => Promise<void>;
}) {
  const [lineas, setLineas] = useState(lineasIniciales);
  const [pendientes, setPendientes] = useState<LineaConteo[]>([]);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<Aviso>(null);
  const [elegir, setElegir] = useState<Extract<Lectura, { tipo: "elegir" }> | null>(null);
  const [noEncontrado, setNoEncontrado] = useState<{ codigo: string; resultados: ItemConteo[] } | null>(null);
  const [confirmar, setConfirmar] = useState<"" | "terminar" | "cancelar">("");
  const [ocupado, setOcupado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const enCurso = useRef(0);
  const secuencia = useRef(0);

  const porId = useMemo(() => new Map(indice.map((i) => [i.id, i])), [indice]);
  const porSku = useMemo(() => {
    const m = new Map<string, ItemConteo>();
    for (const i of indice) if (!m.has(i.sku.toUpperCase()) || i.cantidad > 0) m.set(i.sku.toUpperCase(), i);
    return m;
  }, [indice]);
  const todas = useMemo(() => [...pendientes, ...lineas], [pendientes, lineas]);
  const vivas = useMemo(() => lineasVivas(todas), [todas]);
  const contados = totalContado(todas);
  const quienes = nombres(vivas.map((l) => l.contadoPor));

  const enfocar = () => requestAnimationFrame(() => entrada.current?.focus());

  // Las lecturas se guardan en orden, una tras otra (el escáner puede leer más rápido que el servidor).
  const enviar = useCallback(
    (tarea: () => Promise<LineaConteo[]>, temporales: string[]) => {
      enCurso.current++;
      cola.current = cola.current.then(async () => {
        try {
          setLineas(await tarea());
        } catch (e) {
          const msg = e instanceof Error ? e.message : "No se pudo guardar.";
          setAviso({ tipo: "error", titulo: msg });
          if (/terminó|cerrado/i.test(msg)) void onCambio();
        } finally {
          enCurso.current--;
          if (temporales.length) setPendientes((p) => p.filter((x) => !temporales.includes(x.id)));
        }
      });
    },
    [onCambio]
  );

  // Lo que cuentan los demás aparece solo (cada 15 s y al volver a la pestaña).
  useEffect(() => {
    let vivo = true;
    const traer = async () => {
      if (enCurso.current || document.visibilityState !== "visible") return;
      try {
        const nuevas = await pedir<LineaConteo[]>(`${API}/${conteo.id}/lecturas`);
        if (vivo && !enCurso.current) setLineas(nuevas);
      } catch {
        /* se reintenta en la próxima vuelta */
      }
    };
    const t = setInterval(traer, 15000);
    document.addEventListener("visibilitychange", traer);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", traer);
    };
  }, [conteo.id]);

  function agregar(tipo: TipoLinea, cantidad: number, item: ItemConteo | undefined, codigo: string) {
    const tmp: LineaConteo = {
      id: `tmp-${++secuencia.current}`,
      codigo,
      itemId: tipo === "Unidad" || tipo === "Lote" ? item?.id : undefined,
      sku: item?.sku ?? codigo.toUpperCase(),
      serie: tipo === "Unidad" ? item?.numeroSerie ?? "" : "",
      cantidad,
      tipo,
      contadoPor: actor,
      fecha: new Date().toISOString(),
      anulada: false,
    };
    setPendientes((p) => [tmp, ...p]);
    enviar(
      () => pedir<LineaConteo[]>(`${API}/${conteo.id}/lecturas`, {
        method: "POST",
        body: JSON.stringify({ codigo, itemId: tmp.itemId, sku: tmp.sku, serie: tmp.serie, cantidad, tipo }),
      }),
      [tmp.id]
    );
  }

  function totalLote(sku: string) {
    return vivas.filter((l) => l.tipo === "Lote" && l.sku.toUpperCase() === sku.toUpperCase()).reduce((s, l) => s + l.cantidad, 0);
  }

  function contarUnidad(item: ItemConteo, codigo: string) {
    const ya = vivas.find((l) => l.tipo === "Unidad" && l.itemId === item.id);
    if (ya) {
      setAviso({ tipo: "aviso", titulo: `${serieDe(item)} ya contada por ${ya.contadoPor === actor ? "ti" : ya.contadoPor} · ${hora(ya.fecha)}`, detalle: `${item.sku} · ${item.nombre}` });
      return;
    }
    agregar("Unidad", 1, item, codigo);
    setAviso({ tipo: "ok", titulo: `${item.sku} · ${serieDe(item)}`, detalle: item.nombre });
  }

  function contarLote(item: ItemConteo, codigo: string, cantidad = 1) {
    agregar("Lote", cantidad, item, codigo);
    setAviso({ tipo: "ok", titulo: `${item.sku} · lote · ${totalLote(item.sku) + cantidad}`, detalle: item.nombre });
  }

  function elegirItem(item: ItemConteo, codigo: string) {
    setNoEncontrado(null);
    setElegir(null);
    if (esUnidad(item)) contarUnidad(item, codigo);
    else contarLote(item, codigo);
    enfocar();
  }

  function procesar(valor: string) {
    const codigo = valor.trim();
    if (!codigo) return;
    setTexto("");
    setElegir(null);
    setNoEncontrado(null);
    setConfirmar("");
    const lectura = leerCodigo(codigo, indice, todas);
    if (lectura.tipo === "unidad") contarUnidad(lectura.item, codigo);
    else if (lectura.tipo === "ya-contada") contarUnidad(lectura.item, codigo);
    else if (lectura.tipo === "lote") contarLote(lectura.item, codigo);
    else if (lectura.tipo === "elegir") {
      setAviso(null);
      setElegir(lectura);
    } else {
      setAviso(null);
      setNoEncontrado({ codigo, resultados: buscarParaContar(codigo, indice) });
    }
  }

  function ajustarLote(sku: string, item: ItemConteo | undefined, nuevo: number) {
    const actual = totalLote(sku);
    const n = Math.max(0, Math.min(999, Math.trunc(nuevo)));
    if (!Number.isFinite(n) || n === actual) return;
    agregar("Lote", n - actual, item, item?.sku ?? sku);
  }

  function quitar(linea: LineaConteo) {
    setLineas((l) => l.map((x) => (x.id === linea.id ? { ...x, anulada: true } : x)));
    enviar(() => pedir<LineaConteo[]>(`${API}/${conteo.id}/lecturas`, { method: "PATCH", body: JSON.stringify({ lineaId: linea.id }) }), []);
    enfocar();
  }

  async function cambiarEstado(accion: "terminar" | "cancelar") {
    setOcupado(true);
    try {
      await cola.current; // primero que se guarde todo lo leído
      await pedir(`${API}/${conteo.id}`, { method: "POST", body: JSON.stringify({ accion }) });
      if (accion === "cancelar") window.location.href = VOLVER;
      else await onCambio();
    } catch (e) {
      setAviso({ tipo: "error", titulo: e instanceof Error ? e.message : "No se pudo." });
      setOcupado(false);
      setConfirmar("");
    }
  }

  // Filas: cada unidad por separado; los lotes, una fila por SKU con su total.
  const filas = useMemo<FilaVista[]>(() => {
    const salida: FilaVista[] = [];
    const lotes = new Map<string, Extract<FilaVista, { tipo: "lote" }>>();
    for (const l of todas) {
      if (l.anulada) continue;
      if (l.tipo !== "Lote") {
        salida.push({ clave: l.id, tipo: "linea", linea: l, fecha: l.fecha });
        continue;
      }
      const sku = l.sku.toUpperCase();
      const f = lotes.get(sku);
      if (f) {
        f.total += l.cantidad;
        f.quien = nombres([...f.quien.split(", "), l.contadoPor]);
        if (l.fecha > f.fecha) f.fecha = l.fecha;
        f.pendiente ||= l.id.startsWith("tmp-");
      } else {
        const fila = { clave: `lote:${sku}`, tipo: "lote" as const, sku, item: (l.itemId ? porId.get(l.itemId) : undefined) ?? porSku.get(sku), total: l.cantidad, quien: l.contadoPor, fecha: l.fecha, pendiente: l.id.startsWith("tmp-") };
        lotes.set(sku, fila);
        salida.push(fila);
      }
    }
    return salida.filter((f) => f.tipo === "linea" || f.total !== 0).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [todas, porId, porSku]);

  const columnas = "grid-cols-[minmax(0,1fr)_auto_28px] md:grid-cols-[104px_minmax(0,1fr)_150px_112px_minmax(0,110px)_28px]";

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[16px] font-bold text-[#F5F5F5]">{conteo.nombre}</h1>
        <span className="text-[12px] text-[#8F908A]">
          {conteo.categorias.join(", ") || "Todo"}
          {conteo.incluyeActivos ? " + activos" : ""}
          {quienes ? ` · cuentan ${quienes}` : ""}
        </span>
        <span className="ml-auto rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 py-1 text-[12.5px] font-semibold text-[#EDEDE7]" title="Cuántos llevan contados (no se muestra cuántos debería haber)">
          {contados} contados
        </span>
      </div>

      {conteo.recontar.length ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#FF914D]/30 bg-[#FF914D]/[0.07] px-3 py-1.5 text-[12px] text-[#FFB07A]">
          <span className="font-semibold">Recontar:</span>
          {conteo.recontar.map((s) => (
            <span key={s} className="font-mono">{s}</span>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          procesar(texto);
        }}
      >
        <input
          ref={entrada}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setElegir(null);
              setNoEncontrado(null);
            }
          }}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-label="SKU, serie o nombre"
          placeholder="Escanear o escribir SKU, serie o nombre"
          className="h-12 w-full rounded-xl border border-[#D7FF4F]/40 bg-[#11120F] px-4 font-mono text-[16px] text-[#F5F5F5] placeholder:font-sans placeholder:text-[#77786F] focus:border-[#D7FF4F] focus:outline-none"
        />
      </form>

      {elegir ? (
        <div className="space-y-2 rounded-xl border border-[#D7FF4F]/30 bg-[#171814] p-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[13px] font-semibold text-[#D7FF4F]">{elegir.sku}</span>
            <span className="min-w-0 truncate text-[13px] text-[#EDEDE7]">{elegir.nombre}</span>
            <button type="button" onClick={() => { setElegir(null); enfocar(); }} aria-label="Cerrar" className="ml-auto text-[#8F908A] hover:text-[#F5F5F5]"><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] font-semibold text-[#8F908A]">¿Cuál?</span>
            {elegir.opciones.map((i) => (
              <button key={i.id} type="button" onClick={() => elegirItem(i, i.numeroSerie || elegir.sku)} className="h-8 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-2.5 font-mono text-[12.5px] text-[#EDEDE7] hover:border-[#D7FF4F]/60">
                {serieDe(i)}
              </button>
            ))}
            {elegir.contadas.map((i) => (
              <button key={i.id} type="button" disabled title="Ya contada" className="h-8 rounded-lg border border-[#2A2B27] bg-[#151515] px-2.5 font-mono text-[12.5px] text-[#77786F]">
                {serieDe(i)} ✓
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                agregar("Sin identificar", 1, elegir.opciones[0] ?? elegir.contadas[0], elegir.sku);
                setAviso({ tipo: "ok", titulo: `${elegir.sku} · sin identificar`, detalle: elegir.nombre });
                setElegir(null);
                enfocar();
              }}
              title="La etiqueta de serie no se lee: cuenta 1 de este producto sin decir cuál"
              className="ml-auto h-8 rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 text-[12.5px] font-semibold text-[#B4B5AC] hover:text-[#EDEDE7]"
            >
              Contar sin identificar
            </button>
          </div>
        </div>
      ) : null}

      {noEncontrado ? (
        <div className="space-y-1.5 rounded-xl border border-[#30312D] bg-[#171814] p-2">
          {noEncontrado.resultados.map((i) => (
            <button key={i.id} type="button" onClick={() => elegirItem(i, noEncontrado.codigo)} className="flex w-full items-baseline gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-[#D7FF4F]/[0.07]">
              <span className="w-[104px] shrink-0 font-mono font-semibold text-[#D7FF4F]">{i.sku}</span>
              <span className="min-w-0 flex-1 truncate text-[#EDEDE7]">{i.nombre}</span>
              <span className="shrink-0 font-mono text-[12px] text-[#8F908A]">{esUnidad(i) ? serieDe(i) : "lote"}</span>
            </button>
          ))}
          <div className="flex items-center gap-2 px-2 py-1 text-[12px] text-[#8F908A]">
            <span>{noEncontrado.resultados.length ? "¿No es ninguno?" : <>No existe en el sistema: <span className="font-mono text-[#EDEDE7]">{noEncontrado.codigo}</span></>}</span>
            <button
              type="button"
              onClick={() => {
                agregar("Sin registro", 1, undefined, noEncontrado.codigo);
                setAviso({ tipo: "aviso", titulo: `${noEncontrado.codigo} anotado como sin registro` });
                setNoEncontrado(null);
                enfocar();
              }}
              className="ml-auto h-7 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-2.5 font-semibold text-[#EDEDE7] hover:border-[#D7FF4F]/50"
            >
              Anotar como sin registro
            </button>
          </div>
        </div>
      ) : null}

      {aviso ? (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${aviso.tipo === "ok" ? "border-[#7BE495]/30 bg-[#7BE495]/[0.08]" : aviso.tipo === "aviso" ? "border-[#FFC857]/30 bg-[#FFC857]/[0.08]" : "border-[#FF914D]/35 bg-[#FF914D]/10"}`}
        >
          {aviso.tipo === "ok" ? <Check className="h-5 w-5 shrink-0 text-[#9FEFB3]" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-[#FFC857]" aria-hidden="true" />}
          <span className="min-w-0">
            <span className={`block font-mono text-[13px] font-semibold ${aviso.tipo === "ok" ? "text-[#F5F5F5]" : aviso.tipo === "aviso" ? "text-[#FFDB8A]" : "text-[#FFB07A]"}`}>{aviso.titulo}</span>
            {aviso.detalle ? <span className="block truncate text-[12px] text-[#B4B5AC]">{aviso.detalle}</span> : null}
          </span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] text-[12.5px]">
        <div className={`hidden ${columnas} gap-2.5 border-b border-[#30312D] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] md:grid`}>
          <span>SKU</span><span>Artículo</span><span>Unidad</span><span>Cantidad</span><span>Quién</span><span />
        </div>
        {filas.length ? (
          filas.map((f) => {
            if (f.tipo === "lote") {
              return (
                <div key={f.clave} className={`grid ${columnas} items-center gap-2.5 border-b border-[#252622] px-3 py-1.5 last:border-b-0`}>
                  <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{f.sku}</span>
                  <span className="min-w-0 truncate text-[#C9CAC1]"><span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{f.sku} · </span>{f.item?.nombre ?? ""}</span>
                  <span className="hidden text-[#8F908A] md:block">lote</span>
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => ajustarLote(f.sku, f.item, f.total - 1)} aria-label="Uno menos" className="flex h-7 w-7 items-center justify-center rounded-md border border-[#3A3B35] bg-[#1A1B17] text-[#EDEDE7]"><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    <CantidadLote valor={f.total} onCambio={(n) => ajustarLote(f.sku, f.item, n)} />
                    <button type="button" onClick={() => ajustarLote(f.sku, f.item, f.total + 1)} aria-label="Uno más" className="flex h-7 w-7 items-center justify-center rounded-md border border-[#3A3B35] bg-[#1A1B17] text-[#EDEDE7]"><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  </span>
                  <span className="hidden truncate text-[#8F908A] md:block">{f.quien}</span>
                  <button type="button" onClick={() => ajustarLote(f.sku, f.item, 0)} aria-label="Quitar" className="text-[16px] leading-none text-[#77786F] hover:text-[#FFB07A]">×</button>
                </div>
              );
            }
            const l = f.linea;
            const item = l.itemId ? porId.get(l.itemId) : porSku.get(l.sku.toUpperCase());
            const pendiente = l.id.startsWith("tmp-");
            return (
              <div key={f.clave} className={`grid ${columnas} items-center gap-2.5 border-b border-[#252622] px-3 py-1.5 last:border-b-0 ${pendiente ? "opacity-60" : ""}`}>
                <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{l.tipo === "Sin registro" ? l.codigo : l.sku}</span>
                <span className="min-w-0 truncate text-[#C9CAC1]">
                  <span className="font-mono font-semibold text-[#EDEDE7] md:hidden">
                    {l.tipo === "Sin registro" ? l.codigo : l.sku}
                    {l.tipo === "Unidad" && l.serie ? <span className="font-normal text-[#B4B5AC]"> · {l.serie}</span> : l.tipo === "Sin identificar" ? <span className="font-sans font-normal text-[#FFC857]"> · sin identificar</span> : null}
                    {" · "}
                  </span>
                  {l.tipo === "Sin registro" ? <span className="text-[#FFB07A]">No existe en el sistema</span> : item?.nombre ?? ""}
                </span>
                <span className="hidden font-mono text-[12px] text-[#B4B5AC] md:block">
                  {l.tipo === "Unidad" ? (l.serie ? `S/N ${l.serie}` : "sin serie") : l.tipo === "Sin identificar" ? <span className="font-sans text-[#FFC857]" title="La etiqueta de serie no se leyó: cuenta 1 sin decir cuál">sin identificar</span> : ""}
                </span>
                <span className="text-[#EDEDE7]">{pendiente ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8F908A]" aria-label="Guardando" /> : l.cantidad}</span>
                <span className="hidden truncate text-[#8F908A] md:block">{l.contadoPor}</span>
                <button type="button" onClick={() => quitar(l)} disabled={pendiente} aria-label="Quitar" className="text-[16px] leading-none text-[#77786F] hover:text-[#FFB07A] disabled:opacity-30">×</button>
              </div>
            );
          })
        ) : (
          <p className="px-3 py-6 text-center text-[#8F908A]">Escanea el primer artículo.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {puedeCancelar ? (
          confirmar === "cancelar" ? (
            <span className="mr-auto flex items-center gap-2 text-[12px] text-[#FFB07A]">
              ¿Cancelar el conteo? Se pierde lo contado.
              <button type="button" onClick={() => void cambiarEstado("cancelar")} disabled={ocupado} className={boton}>Sí, cancelar</button>
              <button type="button" onClick={() => setConfirmar("")} className="text-[#8F908A] hover:text-[#EDEDE7]">No</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmar("cancelar")} className="mr-auto text-[12px] text-[#8F908A] hover:text-[#FFB07A]">Cancelar conteo</button>
          )
        ) : null}
        <Link href={VOLVER} className={boton}>Seguir después</Link>
        {confirmar === "terminar" ? (
          <>
            <span className="text-[12px] text-[#C9CAC1]">¿Ya se contó todo?</span>
            <button type="button" onClick={() => void cambiarEstado("terminar")} disabled={ocupado} className={botonPrincipal}>
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Sí, terminar
            </button>
            <button type="button" onClick={() => setConfirmar("")} className="text-[12px] text-[#8F908A] hover:text-[#EDEDE7]">No</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmar("terminar")} disabled={!contados} className={botonPrincipal}>Terminar conteo</button>
        )}
      </div>
    </div>
  );
}

/** Cantidad de un lote: se escribe y se aplica al salir del campo o con Enter. */
function CantidadLote({ valor, onCambio }: { valor: number; onCambio: (n: number) => void }) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  const aplicar = () => {
    const n = Number(texto);
    if (Number.isFinite(n) && n !== valor) onCambio(n);
    else setTexto(String(valor));
  };
  return (
    <input
      value={texto}
      inputMode="numeric"
      aria-label="Cantidad"
      onChange={(e) => setTexto(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={aplicar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          aplicar();
        }
      }}
      className="h-7 w-11 rounded-md border border-[#3A3B35] bg-[#11120F] text-center text-[12.5px] text-[#EDEDE7] focus:border-[#D7FF4F]/60 focus:outline-none"
    />
  );
}

// ─── Revisión (conteo terminado) ─────────────────────────────────────────────

type Vista = "diferencias" | "coinciden" | "cambiaron";

function costoDe(i: ItemConteo) {
  return typeof i.costoUnidad === "number" && Number.isFinite(i.costoUnidad) ? i.costoUnidad : 0;
}

function motivoSobra(i: ItemConteo, conteo: ShippingV2Conteo) {
  if (!i.recibido) return "no figuraba como recibido";
  if (i.cantidad <= 0 || FUERA_DE_TIENDA.test(i.estado)) return `figuraba "${i.estado || "sin stock"}"`;
  if (i.usoLocal && !conteo.incluyeActivos) return "es activo de la tienda";
  if (conteo.categorias.length && !conteo.categorias.includes(i.categoria)) return `es de ${i.categoria || "otra categoría"}`;
  return `figuraba "${i.estado}"`;
}

function Revision({
  conteo,
  lineas,
  resultado,
  puedeCancelar,
  onCambio,
}: {
  conteo: ShippingV2Conteo;
  lineas: LineaConteo[];
  resultado: ResultadoConteo | null;
  puedeCancelar: boolean;
  onCambio: () => Promise<void>;
}) {
  const [vista, setVista] = useState<Vista>("diferencias");
  const [marcados, setMarcados] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const abierto = conteo.estado === "Terminado";
  const quienes = nombres(lineasVivas(lineas).map((l) => l.contadoPor));

  if (!resultado) return <p className="text-[12.5px] text-[#8F908A]">Sin resultado.</p>;
  const r = resultado;
  const diferencias = new Set([...r.faltan, ...r.sobran].map((f) => f.sku)).size + r.sinRegistro.length;

  function marcar(sku: string) {
    setMarcados((l) => (l.includes(sku) ? l.filter((x) => x !== sku) : [...l, sku]));
  }

  async function accion(cual: "recontar" | "cancelar") {
    setOcupado(true);
    setMensaje("");
    try {
      await pedir(`${API}/${conteo.id}`, { method: "POST", body: JSON.stringify({ accion: cual, skus: marcados }) });
      if (cual === "cancelar") window.location.href = VOLVER;
      else await onCambio();
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo.");
      setOcupado(false);
    }
  }

  const columnas = "grid-cols-[22px_minmax(0,1fr)_auto] md:grid-cols-[22px_104px_minmax(0,1fr)_64px_64px_96px]";
  const casilla = (sku: string) =>
    abierto ? (
      <input type="checkbox" checked={marcados.includes(sku)} onChange={() => marcar(sku)} aria-label={`Recontar ${sku}`} title="Recontar" className="h-3.5 w-3.5 accent-[#D7FF4F]" />
    ) : (
      <span />
    );
  const filaDif = (f: FilaConteo, lado: "falta" | "sobra") => {
    const valorFaltan = f.tipo === "lote" ? f.valor : -f.faltan.reduce((s, i) => s + costoDe(i), 0);
    const valor = f.tipo === "lote" ? f.valor : lado === "falta" ? valorFaltan : f.valor - valorFaltan;
    const sinIdDeMas = f.sinIdentificarDeMas;
    let que: ReactNode;
    if (f.tipo === "lote") que = <>{Math.abs(f.contado - f.sistema)} {lado === "falta" ? "menos" : "más"} que el sistema <span className="text-[#8F908A]">· lote</span></>;
    else if (lado === "falta")
      que = (
        <>
          No apareció <span className="font-mono">{f.faltan.map(serieDe).join(", ")}</span>
          {f.sinIdentificar ? <span className="text-[#8F908A]" title="Se contaron sin serie y cubrieron a otras"> · {f.sinIdentificar} sin identificar</span> : null}
        </>
      );
    else
      que = (
        <>
          {f.sobran.map((i, n) => (
            <span key={i.id}>{n ? "; " : ""}<span className="font-mono">{serieDe(i)}</span> {motivoSobra(i, conteo)}</span>
          ))}
          {sinIdDeMas > 0 ? <span>{f.sobran.length ? "; " : ""}{sinIdDeMas} sin identificar de más</span> : null}
        </>
      );
    return (
      <div key={`${lado}:${f.sku}`} className={`grid ${columnas} items-center gap-2.5 border-b border-[#252622] px-3 py-1.5`}>
        {casilla(f.sku)}
        <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{f.sku}</span>
        <span className="min-w-0 text-[#C9CAC1]">
          <span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{f.sku} · </span>
          {que}
          <span className="block truncate text-[11.5px] text-[#77786F]">{f.nombre}</span>
        </span>
        <span className="hidden text-right text-[#B4B5AC] md:block">{f.sistema}</span>
        <span className="hidden text-right font-semibold text-[#EDEDE7] md:block">{f.contado}</span>
        <span className={`text-right font-semibold ${valor < 0 ? "text-[#FFB07A]" : valor > 0 ? "text-[#9FEFB3]" : "text-[#8F908A]"}`}>{valor ? dinero.format(valor) : "—"}</span>
      </div>
    );
  };
  const seccion = (titulo: string, n: number) =>
    n ? <div className="border-b border-[#252622] bg-[#141511] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">{titulo} · {n}</div> : null;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[16px] font-bold text-[#F5F5F5]">{conteo.nombre}</h1>
        <span className="text-[12px] text-[#8F908A]">
          {conteo.estado === "Terminado" ? "Terminado" : conteo.estado} {hora(conteo.estado === "Aplicado" ? conteo.fechaAplicado : conteo.fin)}
          {quienes ? ` · ${quienes}` : ""}
        </span>
        <Link href={VOLVER} className="ml-auto text-[12px] font-semibold text-[#D7FF4F] hover:underline">Conteos</Link>
      </div>

      {conteo.resumen ? <p className="text-[12px] text-[#B4B5AC]">{conteo.resumen}</p> : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {([
          ["diferencias", `Diferencias · ${diferencias}`],
          ["coinciden", `Coinciden · ${r.coinciden.length}`],
          ["cambiaron", `Cambió al contar · ${r.cambiaron.length}`],
        ] as const).map(([v, t]) => (
          <button
            key={v}
            type="button"
            aria-pressed={vista === v}
            onClick={() => setVista(v)}
            title={v === "cambiaron" ? "Se vendió, recibió o ajustó mientras se contaba: no se compara" : undefined}
            className={`h-7 rounded-lg border px-2.5 text-[12px] font-semibold ${vista === v ? "border-[#D7FF4F] bg-[#D7FF4F]/10 text-[#F5F5F5]" : "border-[#3A3B35] bg-[#151515] text-[#B4B5AC]"}`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto text-[12px] text-[#8F908A]">
          Diferencia a costo{" "}
          <b className={r.valorDiferencia < 0 ? "text-[#FFB07A]" : r.valorDiferencia > 0 ? "text-[#9FEFB3]" : "text-[#EDEDE7]"}>{dinero.format(r.valorDiferencia)}</b>
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] text-[12.5px]">
        {vista === "diferencias" ? (
          <>
            <div className={`hidden ${columnas} gap-2.5 border-b border-[#30312D] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] md:grid`}>
              <span /><span>SKU</span><span>Diferencia</span><span className="text-right">Sistema</span><span className="text-right">Contado</span><span className="text-right">A costo</span>
            </div>
            {seccion("Faltan", r.faltan.length)}
            {r.faltan.map((f) => filaDif(f, "falta"))}
            {seccion("Sobran", r.sobran.length)}
            {r.sobran.map((f) => filaDif(f, "sobra"))}
            {seccion("Sin registro", r.sinRegistro.length)}
            {r.sinRegistro.map((s) => (
              <div key={s.codigo} className={`grid ${columnas} items-center gap-2.5 border-b border-[#252622] px-3 py-1.5`}>
                <span />
                <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{s.codigo}</span>
                <span className="min-w-0 text-[#C9CAC1]"><span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{s.codigo} · </span>Código que no existe en el sistema <span className="text-[#8F908A]">· {s.contadoPor}</span></span>
                <span className="hidden text-right text-[#8F908A] md:block">—</span>
                <span className="hidden text-right font-semibold text-[#EDEDE7] md:block">{s.cantidad}</span>
                <span className="text-right text-[#8F908A]">—</span>
              </div>
            ))}
            {!diferencias ? <p className="px-3 py-6 text-center text-[#9FEFB3]">Todo coincide con el sistema.</p> : null}
          </>
        ) : vista === "coinciden" ? (
          r.coinciden.length ? (
            r.coinciden.map((f) => (
              <div key={f.sku} className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[#252622] px-3 py-1.5 last:border-b-0">
                <span className="font-mono font-semibold text-[#EDEDE7]">{f.sku}</span>
                <span className="min-w-0 truncate text-[#C9CAC1]">{f.nombre}</span>
                <span className="text-[#9FEFB3]">{f.contado}</span>
              </div>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-[#8F908A]">Nada coincide todavía.</p>
          )
        ) : r.cambiaron.length ? (
          r.cambiaron.map(({ item, contado }) => (
            <div key={item.id} className={`grid ${columnas} items-center gap-2.5 border-b border-[#252622] px-3 py-1.5 last:border-b-0`}>
              {casilla(item.sku)}
              <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{item.sku}</span>
              <span className="min-w-0 truncate text-[#C9CAC1]"><span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{item.sku} · </span>{item.nombre} <span className="text-[#8F908A]">· ahora "{item.estado}"</span></span>
              <span className="hidden text-right text-[#B4B5AC] md:block">{esUnidad(item) ? (item.cantidad > 0 ? 1 : 0) : item.cantidad}</span>
              <span className="hidden text-right font-semibold text-[#EDEDE7] md:block">{contado}</span>
              <span />
            </div>
          ))
        ) : (
          <p className="px-3 py-6 text-center text-[#8F908A]">Nada cambió mientras se contaba.</p>
        )}
      </div>

      {abierto ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {mensaje ? <span className="mr-auto text-[12px] text-[#FFB07A]">{mensaje}</span> : null}
          {puedeCancelar ? (
            confirmar ? (
              <span className={`${mensaje ? "" : "mr-auto "}flex items-center gap-2 text-[12px] text-[#FFB07A]`}>
                ¿Cancelar el conteo?
                <button type="button" onClick={() => void accion("cancelar")} disabled={ocupado} className={boton}>Sí, cancelar</button>
                <button type="button" onClick={() => setConfirmar(false)} className="text-[#8F908A] hover:text-[#EDEDE7]">No</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmar(true)} className={`${mensaje ? "" : "mr-auto "}text-[12px] text-[#8F908A] hover:text-[#FFB07A]`}>Cancelar conteo</button>
            )
          ) : null}
          <button type="button" onClick={() => void accion("recontar")} disabled={ocupado || !marcados.length} className={boton} title="Vuelve a contar solo lo marcado">
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Recontar{marcados.length ? ` ${marcados.length}` : ""}
          </button>
        </div>
      ) : null}
    </div>
  );
}
