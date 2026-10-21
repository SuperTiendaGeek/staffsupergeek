"use client";

// Conteo físico (punto 10c-2a). Mientras se cuenta: un solo campo que acepta
// el escáner (SKU o serie) o lo que se escriba (busca por nombre si no es un
// código). Conteo a la vista (decisión del dueño, 18-oct noche): quien cuenta
// ve "N de N", lo que falta por encontrar y lo que sobra, como la lista de
// "faltantes" de los sistemas de tienda. Varias personas pueden contar a la
// vez. Cada acción se ve: guardando → contado ✓ → la fila sale suave (pedido
// del dueño, 21-oct). Al terminar se revisa y el Administrador aplica los
// ajustes desde la misma pantalla (10c-2b).

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Minus, Plus, X } from "lucide-react";
import {
  accionesPara,
  buscarParaContar,
  MOTIVO_AJUSTE,
  compararConteo,
  esUnidad,
  leerCodigo,
  lineasVivas,
  progresoConteo,
  totalContado,
  type AccionAjuste,
  type FilaConteo,
  type ItemConteo,
  type Lectura,
  type LineaConteo,
  type ProgresoFila,
  type ResultadoConteo,
  type TipoLinea,
} from "@/lib/shipping-v2/conteo";
import type { ResultadoAjusteConteo, ShippingV2Conteo } from "@/lib/shipping-v2/airtable";

type Datos = { conteo: ShippingV2Conteo; lineas: LineaConteo[]; indice?: ItemConteo[]; resultado?: ResultadoConteo };

const API = "/api/shipping-v2/control/conteos";
const VOLVER = "/shipping-v2/control?vista=conteos";
const boton = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-3 text-[12.5px] font-semibold text-[#EDEDE7] transition hover:border-[#D7FF4F]/50 disabled:opacity-50";
const botonPrincipal = "inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#D7FF4F] px-3 text-[12.5px] font-bold text-[#141510] hover:bg-[#E4FF7A] disabled:opacity-50";
const botonFila = "h-7 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-2.5 text-[12px] font-semibold text-[#EDEDE7] hover:border-[#D7FF4F]/60";
const formato = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });
const dinero = { format: (v: number) => `${v < 0 ? "−" : v > 0 ? "+" : ""}${formato.format(Math.abs(v))}` };
const FUERA_DE_TIENDA = /vendido|agotado|baja|cancelado|archivado|usado en|perdido|partes|devuelto|desarmado/i;
const chip = (activo: boolean) =>
  `h-7 rounded-lg border px-2.5 text-[12px] font-semibold ${activo ? "border-[#D7FF4F] bg-[#D7FF4F]/10 text-[#F5F5F5]" : "border-[#3A3B35] bg-[#151515] text-[#B4B5AC] hover:text-[#EDEDE7]"}`;

function hora(valor?: string) {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("es-EC", hoy ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function serieDe(i: Pick<ItemConteo, "numeroSerie">) {
  return i.numeroSerie ? `S/N ${i.numeroSerie}` : "sin serie";
}

/** "S/N A, S/N B y 2 sin serie" (las unidades sin serie no se distinguen entre sí). */
function listaUnidades(unidades: ItemConteo[]) {
  const conSerie = unidades.filter((i) => i.numeroSerie).map(serieDe);
  const sinSerie = unidades.length - conSerie.length;
  if (!conSerie.length) return sinSerie ? `${sinSerie} sin serie` : "";
  return `${conSerie.join(", ")}${sinSerie ? ` y ${sinSerie} sin serie` : ""}`;
}

function nombres(lista: string[]) {
  return Array.from(new Set(lista.filter(Boolean))).join(", ");
}

function motivoSobra(i: ItemConteo, conteo: ShippingV2Conteo) {
  if (!i.recibido) return "no figuraba como recibido";
  if (i.cantidad <= 0 || FUERA_DE_TIENDA.test(i.estado)) return `figuraba "${i.estado || "sin stock"}"`;
  if (i.usoLocal && !conteo.incluyeActivos) return "es activo de la tienda";
  if (conteo.categorias.length && !conteo.categorias.includes(i.categoria)) return `es de ${i.categoria || "otra categoría"}`;
  return `figuraba "${i.estado}"`;
}

/** Qué sobra en un SKU, en pocas palabras. */
function textoSobra(f: FilaConteo, conteo: ShippingV2Conteo): ReactNode {
  if (f.tipo === "lote") return <>{f.contado - f.sistema} más que el sistema <span className="text-[#8F908A]">· lote</span></>;
  return (
    <>
      {f.sobran.map((i, n) => (
        <span key={i.id}>{n ? "; " : ""}<span className="font-mono">{serieDe(i)}</span> {motivoSobra(i, conteo)}</span>
      ))}
      {f.sinIdentificarDeMas > 0 ? <span>{f.sobran.length ? "; " : ""}{f.sinIdentificarDeMas} sin identificar de más</span> : null}
    </>
  );
}

/** Qué falta en un SKU, en pocas palabras. */
function textoFalta(f: FilaConteo): ReactNode {
  if (f.tipo === "lote") return <>{f.sistema - f.contado} menos que el sistema <span className="text-[#8F908A]">· lote</span></>;
  const n = f.faltan.length;
  const conSerie = f.faltan.some((i) => i.numeroSerie);
  const detalle = conSerie ? listaUnidades(f.faltan) : "";
  return (
    <>
      {f.sistema === 1 ? "No se encontró" : `Falta${n > 1 ? "n" : ""} ${n}`}
      {detalle ? <span className="font-mono">{f.sistema === 1 ? " · " : ": "}{detalle}</span> : f.sistema > 1 ? <span className="text-[#8F908A]"> · sin serie</span> : null}
      {f.sinIdentificar ? <span className="text-[#8F908A]" title="Se contaron sin decir cuál y cubrieron a otras"> · {f.sinIdentificar} sin identificar</span> : null}
    </>
  );
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
  return <Revision conteo={datos.conteo} lineas={datos.lineas} resultado={datos.resultado ?? null} puedeCancelar={puedeCancelar} esAdministrador={esAdministrador} onCambio={cargar} />;
}

// ─── Mientras se cuenta ──────────────────────────────────────────────────────

type Aviso = { tipo: "ok" | "aviso" | "error"; titulo: string; detalle?: string } | null;
type Pestana = "porContar" | "contados" | "deMas";
type Salida = { p: ProgresoFila; fase: "guardando" | "ok" | "saliendo" };
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
  const [pestana, setPestana] = useState<Pestana>("porContar");
  // Microinteracciones: filas que salen (guardando → contado → saliendo),
  // destellos al sumar, errores por SKU, lecturas que se quitan.
  const [salidas, setSalidas] = useState<Record<string, Salida>>({});
  const [destellos, setDestellos] = useState<Record<string, number>>({});
  const [fallidos, setFallidos] = useState<Record<string, string>>({});
  const [quitando, setQuitando] = useState<string[]>([]);
  const [avisoN, setAvisoN] = useState(0);
  const [pulso, setPulso] = useState<"" | "ok" | "aviso" | "error">("");
  const pulsoT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previoPorContar = useRef<Map<string, ProgresoFila> | null>(null);
  const programadas = useRef(new Set<string>());
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

  // La comparación en vivo: "N de N", lo que falta encontrar y lo que sobra.
  const resultado = useMemo(
    () => compararConteo({ items: indice, lineas: todas, alcance: { categorias: conteo.categorias, incluyeActivos: conteo.incluyeActivos }, inicio: conteo.inicio, foto: conteo.foto }),
    [indice, todas, conteo]
  );
  const avance = useMemo(() => progresoConteo(resultado), [resultado]);
  const porEncontrar = avance.total - avance.encontrados;
  const deMas = avance.deMas.reduce((s, p) => s + p.sobra, 0) + resultado.sinRegistro.reduce((s, x) => s + x.cantidad, 0) + resultado.cambiaron.length;
  const pct = avance.total ? Math.round((avance.encontrados / avance.total) * 100) : 0;

  const enfocar = () => requestAnimationFrame(() => entrada.current?.focus());

  function avisar(a: NonNullable<Aviso>) {
    setAviso(a);
    setAvisoN((n) => n + 1);
    setPulso(a.tipo);
    clearTimeout(pulsoT.current);
    pulsoT.current = setTimeout(() => setPulso(""), 700);
  }

  // Las lecturas se guardan en orden, una tras otra (el escáner puede leer más rápido que el servidor).
  const enviar = useCallback(
    (tarea: () => Promise<LineaConteo[]>, temporales: string[], skus: string[] = []) => {
      enCurso.current++;
      cola.current = cola.current.then(async () => {
        try {
          setLineas(await tarea());
        } catch (e) {
          const msg = e instanceof Error ? e.message : "No se pudo guardar.";
          setAviso({ tipo: "error", titulo: `No se guardó: ${msg}` });
          setAvisoN((n) => n + 1);
          setPulso("error");
          if (skus.length) {
            setFallidos((f) => ({ ...f, ...Object.fromEntries(skus.map((s) => [s, msg])) }));
            setTimeout(() => setFallidos((f) => Object.fromEntries(Object.entries(f).filter(([k]) => !skus.includes(k)))), 3500);
          }
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
      [tmp.id],
      [tmp.sku.toUpperCase()]
    );
  }

  function totalLote(sku: string) {
    return vivas.filter((l) => l.tipo === "Lote" && l.sku.toUpperCase() === sku.toUpperCase()).reduce((s, l) => s + l.cantidad, 0);
  }

  function avanceDe(sku: string) {
    const p = [...avance.porContar, ...avance.deMas].find((x) => x.fila.sku === sku.toUpperCase());
    const f = p?.fila ?? resultado.coinciden.find((x) => x.sku === sku.toUpperCase());
    return f ? ` · ${f.contado} de ${f.sistema}` : "";
  }

  function contarUnidad(item: ItemConteo, codigo: string) {
    const ya = vivas.find((l) => l.tipo === "Unidad" && l.itemId === item.id);
    if (ya) {
      avisar({ tipo: "aviso", titulo: `${item.sku} · ${serieDe(item)} ya contada por ${ya.contadoPor === actor ? "ti" : ya.contadoPor} · ${hora(ya.fecha)}`, detalle: item.nombre });
      return;
    }
    agregar("Unidad", 1, item, codigo);
    const f = [...avance.porContar].find((x) => x.fila.sku === item.sku.toUpperCase())?.fila;
    avisar({ tipo: "ok", titulo: `${item.sku} · ${serieDe(item)}${f ? ` · ${f.contado + 1} de ${f.sistema}` : avanceDe(item.sku) ? "" : " · no estaba en este conteo"}`, detalle: item.nombre });
  }

  function contarLote(item: ItemConteo, codigo: string, cantidad = 1) {
    agregar("Lote", cantidad, item, codigo);
    const f = [...avance.porContar, ...avance.deMas].find((x) => x.fila.sku === item.sku.toUpperCase())?.fila ?? resultado.coinciden.find((x) => x.sku === item.sku.toUpperCase());
    avisar({ tipo: "ok", titulo: `${item.sku} · lote · ${totalLote(item.sku) + cantidad}${f ? ` de ${f.sistema}` : ""}`, detalle: item.nombre });
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
    if (lectura.tipo === "unidad" || lectura.tipo === "ya-contada") contarUnidad(lectura.item, codigo);
    else if (lectura.tipo === "lote") contarLote(lectura.item, codigo);
    else if (lectura.tipo === "elegir") {
      // Las unidades sin serie no se distinguen entre sí: se cuenta una sin preguntar.
      if (lectura.opciones.length && lectura.opciones.every((i) => !i.numeroSerie)) contarUnidad(lectura.opciones[0], codigo);
      else {
        setAviso(null);
        setElegir(lectura);
      }
    } else {
      setAviso(null);
      setNoEncontrado({ codigo, resultados: buscarParaContar(codigo, indice) });
    }
    enfocar();
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

  /** La lectura se desvanece y luego se quita. */
  function quitarSuave(linea: LineaConteo) {
    setQuitando((q) => [...q, linea.id]);
    setTimeout(() => {
      quitar(linea);
      setQuitando((q) => q.filter((x) => x !== linea.id));
    }, 200);
  }

  async function cambiarEstado(accion: "terminar" | "cancelar") {
    setOcupado(true);
    try {
      await cola.current; // primero que se guarde todo lo leído
      await pedir(`${API}/${conteo.id}`, { method: "POST", body: JSON.stringify({ accion }) });
      if (accion === "cancelar") window.location.href = VOLVER;
      else await onCambio();
    } catch (e) {
      avisar({ tipo: "error", titulo: e instanceof Error ? e.message : "No se pudo." });
      setOcupado(false);
      setConfirmar("");
    }
  }

  // Lecturas: cada unidad por separado; los lotes, una fila por SKU con su total.
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

  // Cuando un producto queda completo: se queda un momento ("Guardando" hasta que
  // el servidor confirma, luego "✓ Contado") y sale con una animación. Se
  // calcula antes de pintar para que la fila nunca "salte".
  useLayoutEffect(() => {
    const actual = new Map(avance.porContar.map((p) => [p.fila.sku, p]));
    const previo = previoPorContar.current;
    previoPorContar.current = actual;
    const pendiente = (sku: string) => pendientes.some((l) => l.sku.toUpperCase() === sku);
    const crecio: string[] = [];
    if (previo) {
      actual.forEach((p, sku) => {
        const antes = previo.get(sku);
        if (antes && p.fila.contado > antes.fila.contado) crecio.push(sku);
      });
    }
    if (crecio.length) setDestellos((d) => ({ ...d, ...Object.fromEntries(crecio.map((s) => [s, (d[s] ?? 0) + 1])) }));
    setSalidas((prev) => {
      let next = prev;
      const editar = () => {
        if (next === prev) next = { ...prev };
      };
      previo?.forEach((p, sku) => {
        if (!actual.has(sku) && !next[sku]) {
          editar();
          next[sku] = { p: { ...p, falta: 0, fila: { ...p.fila, contado: p.fila.sistema } }, fase: pendiente(sku) ? "guardando" : "ok" };
        }
      });
      for (const sku of Object.keys(next)) {
        if (actual.has(sku)) {
          editar();
          delete next[sku];
          programadas.current.delete(sku);
        } else if (next[sku].fase === "guardando" && !pendiente(sku)) {
          editar();
          next[sku] = { ...next[sku], fase: "ok" };
        }
      }
      return next;
    });
  }, [avance.porContar, pendientes]);

  useEffect(() => {
    for (const [sku, s] of Object.entries(salidas)) {
      if (s.fase !== "ok" || programadas.current.has(sku)) continue;
      programadas.current.add(sku);
      setTimeout(() => setSalidas((x) => (x[sku]?.fase === "ok" ? { ...x, [sku]: { ...x[sku], fase: "saliendo" } } : x)), 900);
      setTimeout(() => {
        programadas.current.delete(sku);
        setSalidas((x) => {
          if (x[sku]?.fase !== "saliendo") return x;
          const n = { ...x };
          delete n[sku];
          return n;
        });
      }, 1250);
    }
  }, [salidas]);

  const filasPorEncontrar = useMemo(() => {
    const actuales = new Set(avance.porContar.map((p) => p.fila.sku));
    return [
      ...avance.porContar.map((p) => ({ p, fase: undefined as Salida["fase"] | undefined })),
      ...Object.values(salidas).filter((s) => !actuales.has(s.p.fila.sku)).map((s) => ({ p: s.p, fase: s.fase as Salida["fase"] | undefined })),
    ].sort((a, b) => a.p.fila.sku.localeCompare(b.p.fila.sku));
  }, [avance.porContar, salidas]);

  const controlLote = (sku: string, item: ItemConteo | undefined, valor: number) => (
    <span className="flex items-center gap-1">
      <button type="button" onClick={() => ajustarLote(sku, item, valor - 1)} disabled={valor <= 0} aria-label="Uno menos" className="flex h-7 w-7 items-center justify-center rounded-md border border-[#3A3B35] bg-[#1A1B17] text-[#EDEDE7] disabled:opacity-40"><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button>
      <CantidadLote valor={valor} onCambio={(n) => ajustarLote(sku, item, n)} />
      <button type="button" onClick={() => ajustarLote(sku, item, valor + 1)} aria-label="Uno más" className="flex h-7 w-7 items-center justify-center rounded-md border border-[#3A3B35] bg-[#1A1B17] text-[#EDEDE7]"><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
    </span>
  );

  const colLecturas = "grid-cols-[minmax(0,1fr)_auto_28px] md:grid-cols-[104px_minmax(0,1fr)_150px_112px_minmax(0,110px)_28px]";
  const colAvance = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[104px_minmax(0,1fr)_minmax(0,220px)_64px_128px]";
  const encabezado = (cols: string, celdas: ReactNode) => (
    <div className={`hidden ${cols} gap-2.5 border-b border-[#30312D] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] md:grid`}>{celdas}</div>
  );
  const filaAvance = (p: ProgresoFila, lado: "falta" | "sobra", fase?: Salida["fase"]) => {
    const f = p.fila;
    const item = f.registros.find((i) => i.cantidad > 0) ?? f.registros[0] ?? porSku.get(f.sku);
    const guardandoSku = pendientes.some((l) => l.sku.toUpperCase() === f.sku);
    const fallo = fallidos[f.sku];
    const listo = fase === "ok" || fase === "saliendo";
    const fondo = listo ? "bg-[#7BE495]/[0.10]" : fase === "guardando" ? "bg-[#D7FF4F]/[0.05]" : fallo ? "bg-[#FF914D]/[0.10]" : "";
    const anim = fallo ? "animate-[sg-sacudir_380ms_ease-in-out]" : destellos[f.sku] && !fase ? "animate-[sg-destello_900ms_ease-out]" : "";
    return (
      <div
        key={`${lado}:${f.sku}:${destellos[f.sku] ?? 0}:${fallo ? "x" : ""}`}
        className={`grid transition-all duration-300 ease-out ${fase === "saliendo" ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={`grid ${colAvance} items-center gap-2.5 border-b border-[#252622] px-3 py-1.5 transition-colors duration-300 ${fondo} ${anim}`}>
            <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{f.sku}</span>
            <span className="min-w-0 truncate text-[#C9CAC1]"><span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{f.sku} · </span>{f.nombre}</span>
            <span className={`hidden min-w-0 truncate text-[12px] md:block ${fallo ? "text-[#FFB07A]" : listo ? "text-[#9FEFB3]" : "text-[#B4B5AC]"}`}>
              {fallo ? `No se guardó: ${fallo}` : listo ? "Completo" : lado === "falta" ? (f.tipo === "lote" ? `faltan ${p.falta}` : listaUnidades(f.faltan)) : textoSobra(f, conteo)}
            </span>
            <span className="hidden text-right md:block">
              <b className={listo ? "text-[#9FEFB3]" : "text-[#EDEDE7]"}>{f.contado}</b><span className="text-[#8F908A]"> de {f.sistema}</span>
            </span>
            <span className="flex justify-end">
              {listo ? (
                <span className="inline-flex h-7 items-center gap-1 text-[12px] font-semibold text-[#9FEFB3] animate-[sg-entrada_200ms_ease-out]"><Check className="h-4 w-4" aria-hidden="true" />Contado</span>
              ) : fase === "guardando" ? (
                <span className="inline-flex h-7 items-center gap-1.5 text-[12px] text-[#B4B5AC]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Guardando</span>
              ) : f.tipo === "lote" ? (
                controlLote(f.sku, item, f.contado)
              ) : lado === "falta" ? (
                <span className="flex items-center gap-2">
                  <span className="text-[12px] text-[#8F908A] md:hidden">{f.contado}/{f.sistema}</span>
                  <button type="button" onClick={() => procesar(f.sku)} disabled={guardandoSku} className={`${botonFila} inline-flex items-center gap-1.5 transition active:scale-95`} title="Contar sin escanear">
                    {guardandoSku ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Contar
                  </button>
                </span>
              ) : (
                <span className="text-[12px] text-[#FFC857] md:hidden">+{p.sobra}</span>
              )}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[16px] font-bold text-[#F5F5F5]">{conteo.nombre}</h1>
        <span className="text-[12px] text-[#8F908A]">
          {conteo.categorias.join(", ") || "Todo"}
          {conteo.incluyeActivos ? " + activos" : ""}
          {quienes ? ` · cuentan ${quienes}` : ""}
        </span>
        <span className="ml-auto flex items-center gap-2" title={`Encontrados de lo que tiene el sistema en este conteo${deMas ? ` · ${deMas} de más` : ""}`}>
          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-[#2A2B27]">
            <span className="block h-full rounded-full bg-[#D7FF4F] transition-all duration-300" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-[13px] font-semibold text-[#EDEDE7]">{avance.encontrados} <span className="font-normal text-[#8F908A]">de</span> {avance.total}</span>
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
          className={`h-12 w-full rounded-xl border bg-[#11120F] px-4 font-mono text-[16px] text-[#F5F5F5] transition-[border-color,box-shadow] duration-300 placeholder:font-sans placeholder:text-[#77786F] focus:outline-none ${
            pulso === "ok"
              ? "border-[#7BE495] shadow-[0_0_0_3px_rgba(123,228,149,0.18)]"
              : pulso === "aviso"
                ? "border-[#FFC857] shadow-[0_0_0_3px_rgba(255,200,87,0.18)]"
                : pulso === "error"
                  ? "border-[#FF914D] shadow-[0_0_0_3px_rgba(255,145,77,0.2)]"
                  : "border-[#D7FF4F]/40 focus:border-[#D7FF4F]"
          }`}
        />
      </form>

      {elegir ? (
        <div className="space-y-2 rounded-xl border border-[#D7FF4F]/30 bg-[#171814] p-3 animate-[sg-entrada_180ms_ease-out]">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[13px] font-semibold text-[#D7FF4F]">{elegir.sku}</span>
            <span className="min-w-0 truncate text-[13px] text-[#EDEDE7]">{elegir.nombre}</span>
            <span className="shrink-0 text-[12px] text-[#8F908A]">{avanceDe(elegir.sku).replace(" · ", "")}</span>
            <button type="button" onClick={() => { setElegir(null); enfocar(); }} aria-label="Cerrar" className="ml-auto text-[#8F908A] hover:text-[#F5F5F5]"><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] font-semibold text-[#8F908A]">¿Cuál?</span>
            {elegir.opciones.filter((i) => i.numeroSerie).map((i) => (
              <button key={i.id} type="button" onClick={() => elegirItem(i, i.numeroSerie || elegir.sku)} className="h-8 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-2.5 font-mono text-[12.5px] text-[#EDEDE7] hover:border-[#D7FF4F]/60">
                {serieDe(i)}
              </button>
            ))}
            {elegir.opciones.some((i) => !i.numeroSerie) ? (
              <button type="button" onClick={() => elegirItem(elegir.opciones.find((i) => !i.numeroSerie)!, elegir.sku)} className="h-8 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-2.5 text-[12.5px] text-[#EDEDE7] hover:border-[#D7FF4F]/60">
                Sin serie · {elegir.opciones.filter((i) => !i.numeroSerie).length}
              </button>
            ) : null}
            {elegir.contadas.map((i) => (
              <button key={i.id} type="button" disabled title="Ya contada" className="h-8 rounded-lg border border-[#2A2B27] bg-[#151515] px-2.5 font-mono text-[12.5px] text-[#77786F]">
                {serieDe(i)} ✓
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                agregar("Sin identificar", 1, elegir.opciones[0] ?? elegir.contadas[0], elegir.sku);
                avisar({ tipo: "ok", titulo: `${elegir.sku} · sin identificar`, detalle: elegir.nombre });
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
        <div className="space-y-1.5 rounded-xl border border-[#30312D] bg-[#171814] p-2 animate-[sg-entrada_180ms_ease-out]">
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
                avisar({ tipo: "aviso", titulo: `${noEncontrado.codigo} anotado como sin registro` });
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
          key={avisoN}
          role="status"
          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 animate-[sg-entrada_200ms_ease-out] ${aviso.tipo === "ok" ? "border-[#7BE495]/30 bg-[#7BE495]/[0.08]" : aviso.tipo === "aviso" ? "border-[#FFC857]/30 bg-[#FFC857]/[0.08]" : "border-[#FF914D]/35 bg-[#FF914D]/10"}`}
        >
          {aviso.tipo === "ok" ? <Check className="h-5 w-5 shrink-0 text-[#9FEFB3]" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-[#FFC857]" aria-hidden="true" />}
          <span className="min-w-0">
            <span className={`block font-mono text-[13px] font-semibold ${aviso.tipo === "ok" ? "text-[#F5F5F5]" : aviso.tipo === "aviso" ? "text-[#FFDB8A]" : "text-[#FFB07A]"}`}>{aviso.titulo}</span>
            {aviso.detalle ? <span className="block truncate text-[12px] text-[#B4B5AC]">{aviso.detalle}</span> : null}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5" role="tablist">
        <button type="button" role="tab" aria-selected={pestana === "porContar"} onClick={() => setPestana("porContar")} className={chip(pestana === "porContar")}>Por encontrar · {porEncontrar}</button>
        <button type="button" role="tab" aria-selected={pestana === "contados"} onClick={() => setPestana("contados")} className={chip(pestana === "contados")}>Contados · {contados}</button>
        <button type="button" role="tab" aria-selected={pestana === "deMas"} onClick={() => setPestana("deMas")} className={chip(pestana === "deMas")} title="Contado y no esperado aquí: de más, no existe en el sistema o cambió mientras se contaba">
          De más · {deMas}
        </button>
        <span className="ml-auto text-[12px] text-[#8F908A]">{avance.completos} {avance.completos === 1 ? "producto completo" : "productos completos"}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] text-[12.5px]">
        {pestana === "porContar" ? (
          filasPorEncontrar.length ? (
            <>
              {encabezado(colAvance, <><span>SKU</span><span>Artículo</span><span>Falta</span><span className="text-right">Contado</span><span /></>)}
              {filasPorEncontrar.map(({ p, fase }) => filaAvance(p, "falta", fase))}
            </>
          ) : (
            <p className="flex items-center justify-center gap-2 px-3 py-6 text-center text-[#9FEFB3] animate-[sg-entrada_300ms_ease-out]">{avance.total ? <><Check className="h-4 w-4" aria-hidden="true" />Se encontró todo lo del sistema.</> : "Nada por contar."}</p>
          )
        ) : pestana === "deMas" ? (
          deMas ? (
            <>
              {encabezado(colAvance, <><span>SKU</span><span>Artículo</span><span>Qué pasa</span><span className="text-right">Contado</span><span /></>)}
              {avance.deMas.map((p) => filaAvance(p, "sobra"))}
              {resultado.sinRegistro.map((s) => (
                <div key={`sr:${s.codigo}`} className={`grid ${colAvance} items-center gap-2.5 border-b border-[#252622] px-3 py-1.5 last:border-b-0`}>
                  <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{s.codigo}</span>
                  <span className="min-w-0 truncate text-[#FFB07A]"><span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{s.codigo} · </span>No existe en el sistema</span>
                  <span className="hidden text-[12px] text-[#8F908A] md:block">{s.contadoPor}</span>
                  <span className="hidden text-right font-semibold text-[#EDEDE7] md:block">{s.cantidad}</span>
                  <span />
                </div>
              ))}
              {resultado.cambiaron.map(({ item, contado }) => (
                <div key={`cb:${item.id}`} className={`grid ${colAvance} items-center gap-2.5 border-b border-[#252622] px-3 py-1.5 last:border-b-0`}>
                  <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{item.sku}</span>
                  <span className="min-w-0 truncate text-[#C9CAC1]"><span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{item.sku} · </span>{item.nombre}</span>
                  <span className="hidden text-[12px] text-[#8F908A] md:block" title="Se vendió, recibió o ajustó mientras se contaba: no se compara">Cambió al contar · ahora &quot;{item.estado}&quot;</span>
                  <span className="hidden text-right font-semibold text-[#EDEDE7] md:block">{contado}</span>
                  <span />
                </div>
              ))}
            </>
          ) : (
            <p className="px-3 py-6 text-center text-[#8F908A]">Nada de más.</p>
          )
        ) : filas.length ? (
          <>
            {encabezado(colLecturas, <><span>SKU</span><span>Artículo</span><span>Unidad</span><span>Cantidad</span><span>Quién</span><span /></>)}
            {filas.map((f) => {
              if (f.tipo === "lote") {
                return (
                  <div key={f.clave} className={`grid ${colLecturas} items-center gap-2.5 border-b border-[#252622] px-3 py-1.5 last:border-b-0`}>
                    <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{f.sku}</span>
                    <span className="min-w-0 truncate text-[#C9CAC1]"><span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{f.sku} · </span>{f.item?.nombre ?? ""}</span>
                    <span className="hidden text-[#8F908A] md:block">lote</span>
                    {controlLote(f.sku, f.item, f.total)}
                    <span className="hidden truncate text-[#8F908A] md:block">{f.quien}</span>
                    <button type="button" onClick={() => ajustarLote(f.sku, f.item, 0)} aria-label="Quitar" className="text-[16px] leading-none text-[#77786F] hover:text-[#FFB07A]">×</button>
                  </div>
                );
              }
              const l = f.linea;
              const item = l.itemId ? porId.get(l.itemId) : porSku.get(l.sku.toUpperCase());
              const pendiente = l.id.startsWith("tmp-");
              return (
                <div
                  key={f.clave}
                  className={`grid ${colLecturas} items-center gap-2.5 border-b border-[#252622] px-3 py-1.5 transition-all duration-200 last:border-b-0 ${pendiente ? "bg-[#D7FF4F]/[0.04] animate-[sg-entrada_220ms_ease-out]" : ""} ${quitando.includes(l.id) ? "-translate-x-2 opacity-0" : ""}`}
                >
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
                  <button type="button" onClick={() => quitarSuave(l)} disabled={pendiente || quitando.includes(l.id)} aria-label="Quitar" className="text-[16px] leading-none text-[#77786F] hover:text-[#FFB07A] disabled:opacity-30">×</button>
                </div>
              );
            })}
          </>
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
            <span className="text-[12px] text-[#C9CAC1]">{porEncontrar ? `Quedan ${porEncontrar} por encontrar. ¿Terminar igual?` : "¿Terminar el conteo?"}</span>
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

// ─── Revisión (conteo terminado) y ajustes (10c-2b) ──────────────────────────

type Vista = "diferencias" | "coinciden" | "cambiaron";
type EstadoAjuste = "aplicando" | { ok: boolean; texto: string };

function costoDe(i: ItemConteo) {
  return typeof i.costoUnidad === "number" && Number.isFinite(i.costoUnidad) ? i.costoUnidad : 0;
}

/** Valor a costo de una fila según el lado (una unidad puede faltar y sobrar a la vez). */
function valorFila(f: FilaConteo, lado: "falta" | "sobra") {
  if (f.tipo === "lote") return f.valor;
  const faltan = -f.faltan.reduce((s, i) => s + costoDe(i), 0);
  return lado === "falta" ? faltan : f.valor - faltan;
}

/** Primera línea de cada aplicación en el resumen: "4 ajustes · −$60,00 · Alexis". */
const ES_CABECERA = /^\d+ ajuste/;

const ETIQUETA_CORTA: Record<AccionAjuste, string> = {
  "baja-perdido": "Dado de baja",
  "baja-robo": "Dado de baja",
  "baja-error": "Dado de baja",
  fuera: "Anotado: está fuera",
  devolver: "Devuelto al stock",
};

function Revision({
  conteo,
  lineas,
  resultado,
  puedeCancelar,
  esAdministrador,
  onCambio,
}: {
  conteo: ShippingV2Conteo;
  lineas: LineaConteo[];
  resultado: ResultadoConteo | null;
  puedeCancelar: boolean;
  esAdministrador: boolean;
  onCambio: () => Promise<void>;
}) {
  const [vista, setVista] = useState<Vista>("diferencias");
  const [marcados, setMarcados] = useState<string[]>([]);
  const [decision, setDecision] = useState<Record<string, AccionAjuste | "">>({});
  const [estados, setEstados] = useState<Record<string, EstadoAjuste>>({});
  const [ocupado, setOcupado] = useState<"" | "recontar" | "cancelar" | "aplicar">("");
  const [confirmar, setConfirmar] = useState<"" | "cancelar" | "aplicar">("");
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const abierto = conteo.estado === "Terminado";
  const ajusta = abierto && esAdministrador;
  const quienes = nombres(lineasVivas(lineas).map((l) => l.contadoPor));

  if (conteo.estado === "Aplicado") return <Aplicado conteo={conteo} quienes={quienes} />;
  if (!resultado) return <p className="text-[12.5px] text-[#8F908A]">Sin resultado.</p>;
  const r = resultado;
  const diferencias = new Set([...r.faltan, ...r.sobran].map((f) => f.sku)).size + r.sinRegistro.length;
  const avance = progresoConteo(r);
  const elegidas = Object.entries(decision).filter(([, a]) => a) as Array<[string, AccionAjuste]>;

  // Lo que se va a hacer, en una línea (para confirmar).
  const resumenAplicar = (() => {
    let bajas = 0;
    let valor = 0;
    let fuera = 0;
    let devolver = 0;
    for (const [k, a] of elegidas) {
      const [lado, sku] = [k.slice(0, 5) as "falta" | "sobra", k.slice(6)];
      const f = (lado === "falta" ? r.faltan : r.sobran).find((x) => x.sku === sku);
      if (!f) continue;
      if (a.startsWith("baja")) {
        bajas += f.tipo === "lote" ? f.sistema - f.contado : f.faltan.length;
        valor += valorFila(f, "falta");
      } else if (a === "fuera") fuera++;
      else {
        devolver += f.tipo === "lote" ? f.contado - f.sistema : f.sobran.length;
        valor += valorFila(f, "sobra");
      }
    }
    return [
      bajas ? `dar de baja ${bajas}` : "",
      devolver ? `devolver ${devolver} al stock` : "",
      fuera ? `${fuera} anotado${fuera > 1 ? "s" : ""} como fuera` : "",
    ].filter(Boolean).join(", ") + (valor ? ` (${dinero.format(valor)})` : "");
  })();

  function marcar(sku: string) {
    setMarcados((l) => (l.includes(sku) ? l.filter((x) => x !== sku) : [...l, sku]));
  }

  function elegir(lado: "falta" | "sobra", sku: string, accion: AccionAjuste | "") {
    setDecision((d) => ({ ...d, [`${lado}:${sku}`]: accion }));
    setConfirmar("");
  }

  async function accion(cual: "recontar" | "cancelar") {
    setOcupado(cual);
    setMensaje(null);
    try {
      await pedir(`${API}/${conteo.id}`, { method: "POST", body: JSON.stringify({ accion: cual, skus: marcados }) });
      if (cual === "cancelar") window.location.href = VOLVER;
      else await onCambio();
    } catch (e) {
      setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo." });
      setOcupado("");
    }
  }

  async function aplicar() {
    const decisiones = elegidas.map(([k, a]) => ({ lado: k.slice(0, 5), sku: k.slice(6), accion: a }));
    setOcupado("aplicar");
    setConfirmar("");
    setMensaje(null);
    setEstados(Object.fromEntries(elegidas.map(([k]) => [k, "aplicando" as const])));
    try {
      const data = await pedir<{ conteo: ShippingV2Conteo; resultados: ResultadoAjusteConteo[] }>(`${API}/${conteo.id}/aplicar`, {
        method: "POST",
        body: JSON.stringify({ decisiones }),
      });
      setEstados(Object.fromEntries(data.resultados.map((x) => [`${x.lado}:${x.sku}`, { ok: x.ok, texto: x.ok ? ETIQUETA_CORTA[x.accion] : x.texto }])));
      const errores = data.resultados.filter((x) => !x.ok);
      if (!errores.length) {
        setMensaje({ tipo: "ok", texto: `Listo: ${data.resultados.length} ajuste${data.resultados.length > 1 ? "s" : ""} aplicado${data.resultados.length > 1 ? "s" : ""}.` });
        setTimeout(() => void onCambio(), 1600);
      } else {
        setMensaje({ tipo: "error", texto: `${errores.length} no se aplic${errores.length > 1 ? "aron" : "ó"} (mira cada fila). Lo demás quedó aplicado.` });
        setDecision((d) => Object.fromEntries(Object.entries(d).filter(([k]) => errores.some((x) => `${x.lado}:${x.sku}` === k))));
        setOcupado("");
      }
    } catch (e) {
      setEstados({});
      setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo aplicar." });
      setOcupado("");
    }
  }

  const columnas = ajusta
    ? "grid-cols-[22px_minmax(0,1fr)_auto] md:grid-cols-[22px_104px_minmax(0,1fr)_56px_60px_88px_210px]"
    : "grid-cols-[22px_minmax(0,1fr)_auto] md:grid-cols-[22px_104px_minmax(0,1fr)_64px_64px_96px]";
  const casilla = (sku: string) =>
    abierto ? (
      <input type="checkbox" checked={marcados.includes(sku)} onChange={() => marcar(sku)} disabled={Boolean(ocupado)} aria-label={`Recontar ${sku}`} title="Recontar" className="h-3.5 w-3.5 accent-[#D7FF4F]" />
    ) : (
      <span />
    );
  const selectClass = "h-7 w-full rounded-md border border-[#3A3B35] bg-[#11120F] px-1.5 text-[12px] text-[#EDEDE7] transition focus:border-[#D7FF4F]/60 focus:outline-none disabled:opacity-50";

  const celdaAjuste = (f: FilaConteo, lado: "falta" | "sobra") => {
    const k = `${lado}:${f.sku}`;
    const est = estados[k];
    if (est === "aplicando") return <span className="inline-flex items-center gap-1.5 text-[12px] text-[#B4B5AC]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Aplicando</span>;
    if (est?.ok) return <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#9FEFB3] animate-[sg-entrada_200ms_ease-out]"><Check className="h-4 w-4" aria-hidden="true" />{est.texto}</span>;
    const acciones = accionesPara(f, lado);
    if (!acciones.length) {
      const it = f.sobran[0];
      return it ? (
        <a href={`/shipping-v2/items/${it.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#D7FF4F] hover:underline" title="Revisar la venta o el estado en la ficha">
          Revisar en la ficha<ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : <span />;
    }
    return (
      <select value={decision[k] ?? ""} onChange={(e) => elegir(lado, f.sku, e.target.value as AccionAjuste | "")} disabled={Boolean(ocupado)} aria-label={`Qué hacer con ${f.sku}`} className={`${selectClass} ${decision[k] ? "border-[#D7FF4F]/50" : ""}`}>
        <option value="">Sin cambio</option>
        {acciones.map((a) => (
          <option key={a} value={a}>{MOTIVO_AJUSTE[a]}</option>
        ))}
      </select>
    );
  };

  const filaDif = (f: FilaConteo, lado: "falta" | "sobra") => {
    const valor = valorFila(f, lado);
    const est = estados[`${lado}:${f.sku}`];
    const fondo = est && est !== "aplicando" ? (est.ok ? "bg-[#7BE495]/[0.08]" : "bg-[#FF914D]/[0.08]") : decision[`${lado}:${f.sku}`] ? "bg-[#D7FF4F]/[0.04]" : "";
    return (
      <div key={`${lado}:${f.sku}`} className={`grid ${columnas} items-center gap-x-2.5 gap-y-1 border-b border-[#252622] px-3 py-1.5 transition-colors duration-300 ${fondo}`}>
        {casilla(f.sku)}
        <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{f.sku}</span>
        <span className="min-w-0 text-[#C9CAC1]">
          <span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{f.sku} · </span>
          {lado === "falta" ? textoFalta(f) : textoSobra(f, conteo)}
          <span className="block truncate text-[11.5px] text-[#77786F]">{f.nombre}</span>
          {est && est !== "aplicando" && !est.ok ? <span className="block text-[11.5px] text-[#FFB07A]">{est.texto}</span> : null}
        </span>
        <span className="hidden text-right text-[#B4B5AC] md:block">{f.sistema}</span>
        <span className="hidden text-right font-semibold text-[#EDEDE7] md:block">{f.contado}</span>
        <span className={`text-right font-semibold ${valor < 0 ? "text-[#FFB07A]" : valor > 0 ? "text-[#9FEFB3]" : "text-[#8F908A]"}`} title={valor ? undefined : "Sin costo registrado"}>{valor ? dinero.format(valor) : "—"}</span>
        {ajusta ? <span className="col-span-3 md:col-span-1">{celdaAjuste(f, lado)}</span> : null}
      </div>
    );
  };

  const seccion = (titulo: string, n: number, lado?: "falta") =>
    n ? (
      <div className="flex items-center gap-2 border-b border-[#252622] bg-[#141511] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">
        {titulo} · {n}
        {ajusta && lado && n > 1 ? (
          <select
            value=""
            onChange={(e) => {
              const a = e.target.value as AccionAjuste;
              if (!a) return;
              setDecision((d) => ({ ...d, ...Object.fromEntries(r.faltan.map((f) => [`falta:${f.sku}`, a])) }));
              setConfirmar("");
            }}
            disabled={Boolean(ocupado)}
            aria-label="Para todos los faltantes"
            className="ml-auto h-6 w-[210px] rounded-md border border-[#3A3B35] bg-[#11120F] px-1.5 text-[11.5px] font-normal normal-case tracking-normal text-[#B4B5AC] focus:outline-none"
          >
            <option value="">Para todos…</option>
            {(["baja-perdido", "baja-robo", "baja-error", "fuera"] as const).map((a) => (
              <option key={a} value={a}>{MOTIVO_AJUSTE[a]}</option>
            ))}
          </select>
        ) : null}
      </div>
    ) : null;

  const yaAplicado = abierto && conteo.resumen ? conteo.resumen.split("\n").filter(Boolean) : [];

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[16px] font-bold text-[#F5F5F5]">{conteo.nombre}</h1>
        <span className="text-[12px] text-[#8F908A]">
          {conteo.estado} {hora(conteo.fin)}
          {quienes ? ` · ${quienes}` : ""}
          {` · ${avance.encontrados} de ${avance.total} encontrados`}
        </span>
        <Link href={VOLVER} className="ml-auto text-[12px] font-semibold text-[#D7FF4F] hover:underline">Conteos</Link>
      </div>

      {conteo.estado === "Cancelado" ? (
        <p className="rounded-lg border border-[#3A3B35] bg-[#151515] px-3 py-1.5 text-[12px] text-[#B4B5AC]">Conteo cancelado: no cambió nada en el inventario. Abajo queda cómo iba al cancelarlo.</p>
      ) : yaAplicado.length ? (
        <p className="rounded-lg border border-[#7BE495]/25 bg-[#7BE495]/[0.06] px-3 py-1.5 text-[12px] text-[#C9CAC1]" title={yaAplicado.join("\n")}>
          Ya aplicado: {yaAplicado.filter((l) => !ES_CABECERA.test(l)).length} ajuste(s). Lo que falta sigue abajo.
        </p>
      ) : null}

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
            className={chip(vista === v)}
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
              <span /><span>SKU</span><span>Diferencia</span><span className="text-right">Sistema</span><span className="text-right">Contado</span><span className="text-right">A costo</span>{ajusta ? <span>Qué hacer</span> : null}
            </div>
            {seccion("Faltan", r.faltan.length, "falta")}
            {r.faltan.map((f) => filaDif(f, "falta"))}
            {seccion("Sobran", r.sobran.length)}
            {r.sobran.map((f) => filaDif(f, "sobra"))}
            {seccion("Sin registro", r.sinRegistro.length)}
            {r.sinRegistro.map((s) => (
              <div key={s.codigo} className={`grid ${columnas} items-center gap-x-2.5 gap-y-1 border-b border-[#252622] px-3 py-1.5`}>
                <span />
                <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{s.codigo}</span>
                <span className="min-w-0 text-[#C9CAC1]"><span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{s.codigo} · </span>Código que no existe en el sistema <span className="text-[#8F908A]">· {s.contadoPor}</span></span>
                <span className="hidden text-right text-[#8F908A] md:block">—</span>
                <span className="hidden text-right font-semibold text-[#EDEDE7] md:block">{s.cantidad}</span>
                <span className="text-right text-[#8F908A]">—</span>
                {ajusta ? (
                  <span className="col-span-3 md:col-span-1">
                    <a href="/shipping-v2/items/nuevo" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#D7FF4F] hover:underline" title="Si es mercadería real, regístrala como compra">
                      Registrar compra<ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </span>
                ) : null}
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
            <div key={item.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[#252622] px-3 py-1.5 last:border-b-0 md:grid-cols-[22px_104px_minmax(0,1fr)_64px_64px]">
              {casilla(item.sku)}
              <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{item.sku}</span>
              <span className="min-w-0 truncate text-[#C9CAC1]"><span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{item.sku} · </span>{item.nombre} <span className="text-[#8F908A]">· ahora &quot;{item.estado}&quot;</span></span>
              <span className="hidden text-right text-[#B4B5AC] md:block">{esUnidad(item) ? (item.cantidad > 0 ? 1 : 0) : item.cantidad}</span>
              <span className="hidden text-right font-semibold text-[#EDEDE7] md:block">{contado}</span>
            </div>
          ))
        ) : (
          <p className="px-3 py-6 text-center text-[#8F908A]">Nada cambió mientras se contaba.</p>
        )}
      </div>

      {abierto ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {puedeCancelar ? (
            confirmar === "cancelar" ? (
              <span className="mr-auto flex items-center gap-2 text-[12px] text-[#FFB07A]">
                ¿Cancelar el conteo?
                <button type="button" onClick={() => void accion("cancelar")} disabled={Boolean(ocupado)} className={boton}>Sí, cancelar</button>
                <button type="button" onClick={() => setConfirmar("")} className="text-[#8F908A] hover:text-[#EDEDE7]">No</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmar("cancelar")} disabled={Boolean(ocupado)} className="mr-auto text-[12px] text-[#8F908A] hover:text-[#FFB07A] disabled:opacity-50">Cancelar conteo</button>
            )
          ) : null}
          {mensaje ? (
            <span key={mensaje.texto} className={`inline-flex items-center gap-1.5 text-[12px] animate-[sg-entrada_200ms_ease-out] ${mensaje.tipo === "ok" ? "font-semibold text-[#9FEFB3]" : "text-[#FFB07A]"}`}>
              {mensaje.tipo === "ok" ? <Check className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
              {mensaje.texto}
            </span>
          ) : !esAdministrador && diferencias ? (
            <span className="text-[12px] text-[#8F908A]">Los ajustes los aplica el Administrador.</span>
          ) : null}
          <button type="button" onClick={() => void accion("recontar")} disabled={Boolean(ocupado) || !marcados.length} className={boton} title="Vuelve a contar solo lo marcado">
            {ocupado === "recontar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Recontar{marcados.length ? ` ${marcados.length}` : ""}
          </button>
          {ajusta ? (
            confirmar === "aplicar" ? (
              <span className="flex items-center gap-2 animate-[sg-entrada_180ms_ease-out]">
                <span className="text-[12px] text-[#C9CAC1]">{resumenAplicar.charAt(0).toUpperCase() + resumenAplicar.slice(1)}. ¿Aplicar?</span>
                <button type="button" onClick={() => void aplicar()} className={botonPrincipal}>Sí, aplicar</button>
                <button type="button" onClick={() => setConfirmar("")} className="text-[12px] text-[#8F908A] hover:text-[#EDEDE7]">No</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmar("aplicar")} disabled={Boolean(ocupado) || !elegidas.length} className={botonPrincipal} title={elegidas.length ? undefined : "Elige qué hacer en cada diferencia"}>
                {ocupado === "aplicar" ? mensaje?.tipo === "ok" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                {ocupado === "aplicar" ? (mensaje?.tipo === "ok" ? "Aplicado" : "Aplicando…") : `Aplicar${elegidas.length ? ` ${elegidas.length}` : ""} ajuste${elegidas.length === 1 ? "" : "s"}`}
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Conteo aplicado: lo que se hizo (cada cambio también queda en la ficha del artículo). */
function Aplicado({ conteo, quienes }: { conteo: ShippingV2Conteo; quienes: string }) {
  const lineasResumen = conteo.resumen.split("\n").filter(Boolean);
  return (
    <div className="space-y-2.5 animate-[sg-entrada_250ms_ease-out]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[16px] font-bold text-[#F5F5F5]">{conteo.nombre}</h1>
        <span className="inline-flex h-6 items-center gap-1 rounded-md border border-[#7BE495]/35 bg-[#7BE495]/10 px-2 text-[11.5px] font-semibold text-[#9FEFB3]"><Check className="h-3.5 w-3.5" aria-hidden="true" />Aplicado</span>
        <span className="text-[12px] text-[#8F908A]">
          {hora(conteo.fechaAplicado)}
          {conteo.aplicadoPor ? ` · por ${conteo.aplicadoPor}` : ""}
          {quienes ? ` · contaron ${quienes}` : ""}
        </span>
        <Link href={VOLVER} className="ml-auto text-[12px] font-semibold text-[#D7FF4F] hover:underline">Conteos</Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] text-[12.5px]">
        {lineasResumen.length ? (
          lineasResumen.map((l, n) => {
            if (ES_CABECERA.test(l)) {
              return <div key={n} className="border-b border-[#252622] bg-[#141511] px-3 py-1 text-[11.5px] font-semibold text-[#8F908A]">{l}</div>;
            }
            const partes = l.split(" · ");
            const sku = partes[0];
            const valor = /^[−+]\$/.test(partes[partes.length - 1] ?? "") && partes.length > 2 ? partes.pop() : "";
            const que = partes.slice(1).join(" · ");
            return (
              <div key={n} className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[#252622] px-3 py-1.5 last:border-b-0">
                <span className="font-mono font-semibold text-[#EDEDE7]">{sku}</span>
                <span className="text-[#C9CAC1]">{que}</span>
                <span className={`font-semibold ${valor?.startsWith("−") ? "text-[#FFB07A]" : "text-[#9FEFB3]"}`}>{valor ?? ""}</span>
              </div>
            );
          })
        ) : (
          <p className="px-3 py-6 text-center text-[#8F908A]">Se aplicó sin cambios.</p>
        )}
      </div>
      <p className="text-[12px] text-[#8F908A]">Cada cambio quedó en el historial de su artículo y se puede revertir desde la ficha.</p>
    </div>
  );
}
