"use client";

// Cargar la lista de una compra desde una hoja (punto 9d, entrega 2 · 15-oct-2026).
//
// Panel azul dentro de "Artículos": se pegan las filas copiadas de Excel o
// Google Sheets, o se sube el archivo (.xlsx o .csv). Las columnas se
// reconocen por su título; lo que no se reconoce se elige aquí una vez y se
// puede recordar para el proveedor. Las filas entran a la tabla de abajo para
// revisarlas: nada se crea hasta "Registrar compra".

import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { SHIPPING_V2_CATEGORIAS, SHIPPING_V2_CONDICIONES } from "@/types/shipping-v2";
import {
  CAMPOS_IMPORTABLES,
  ETIQUETA_CAMPO,
  campoDeEncabezado,
  filasALineas,
  mapeoInicial,
  mapeoParaRecordar,
  mapeoSinTitulos,
  parsearTextoTabla,
  separarEncabezado,
  type CampoImportable,
  type MapeoColumnas,
  type TablaLeida,
} from "@/lib/shipping-v2/importar-lineas";
import { nuevaLinea, totalesLineas, type LineaCompra } from "@/lib/shipping-v2/ordenes-compra";

export type EntradaImportacion = { n: number; texto?: string; archivo?: File };

export const ACCEPT_HOJAS = ".xlsx,.csv,.tsv,.txt,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Props = {
  entrada: EntradaImportacion;
  proveedor: { id: string; nombre: string } | null;
  /** Lo recordado para el proveedor (título normalizado → campo). */
  recordado: Record<string, string>;
  condicionPorDefecto: string;
  onAgregar: (lineas: Array<Partial<LineaCompra>>, avisos: string[]) => void;
  onRecordar: (columnas: Record<string, string>) => void;
  onCerrar: () => void;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

/** Lee un archivo de hoja (.xlsx o texto) en filas. La parte de Excel se carga solo cuando se usa. */
export async function filasDeArchivo(file: File): Promise<string[][]> {
  if (/\.xls$/i.test(file.name)) throw new Error("Es un Excel antiguo (.xls). Ábrelo y guárdalo como .xlsx o .csv.");
  if (file.size > 5 * 1024 * 1024) throw new Error("El archivo pesa más de 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { esXlsx, leerXlsx, textoDeArchivo } = await import("@/lib/shipping-v2/hoja-xlsx");
  return esXlsx(bytes) ? leerXlsx(bytes) : parsearTextoTabla(textoDeArchivo(bytes));
}

export function ImportarLineasPanel({ entrada, proveedor, recordado, condicionPorDefecto, onAgregar, onRecordar, onCerrar }: Props) {
  const [texto, setTexto] = useState(entrada.texto ?? "");
  const [fuente, setFuente] = useState(entrada.archivo ? entrada.archivo.name : "");
  const [filas, setFilas] = useState<string[][] | null>(null);
  const [mapeo, setMapeo] = useState<MapeoColumnas>([]);
  const [tocadas, setTocadas] = useState<Set<number>>(new Set());
  const [recordar, setRecordar] = useState(true);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const tabla: TablaLeida | null = useMemo(() => (filas ? separarEncabezado(filas, recordado) : null), [filas, recordado]);

  // Al llegar las filas (o al elegir el proveedor), se propone el mapeo; lo que se tocó a mano se respeta.
  useEffect(() => {
    if (!tabla) return;
    const propuesto = tabla.conTitulos ? mapeoInicial(tabla.encabezados, recordado) : mapeoSinTitulos(tabla);
    setMapeo((m) => propuesto.map((c, i) => (tocadas.has(i) ? (m[i] ?? "") : c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabla]);

  useEffect(() => {
    if (entrada.archivo) void leerArchivo(entrada.archivo);
    else if (entrada.texto) usarTexto(entrada.texto, "Pegado");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function usarFilas(nuevas: string[][], nombre: string) {
    if (!nuevas.length) { setError("No se encontraron filas con datos."); setFilas(null); return; }
    setError("");
    setTocadas(new Set());
    setFuente(nombre);
    setFilas(nuevas);
  }

  function usarTexto(t: string, nombre = "Pegado") {
    setTexto(t);
    if (!t.trim()) { setFilas(null); return; }
    usarFilas(parsearTextoTabla(t), nombre);
  }

  async function leerArchivo(file: File) {
    setError("");
    setCargando(true);
    try {
      usarFilas(await filasDeArchivo(file), file.name);
    } catch (e) {
      setFilas(null);
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setCargando(false);
    }
  }

  function elegir(i: number, campo: CampoImportable | "") {
    setTocadas((s) => new Set(s).add(i));
    // Cada campo va en una sola columna: si otra lo tenía, queda sin usar.
    setMapeo((m) => m.map((c, j) => (j === i ? campo : campo && c === campo ? "" : c)));
  }

  const ctx = { categorias: SHIPPING_V2_CATEGORIAS, condiciones: SHIPPING_V2_CONDICIONES, condicionPorDefecto };
  const resultado = tabla && mapeo.length === tabla.encabezados.length ? filasALineas(tabla.filas, mapeo, ctx) : null;
  const totales = resultado ? totalesLineas(resultado.lineas.map((l, i) => nuevaLinea(`p${i}`, l))) : null;
  const sinNombre = Boolean(tabla) && !mapeo.includes("nombre") && !mapeo.includes("descripcion");
  const paraRecordar = tabla?.conTitulos ? mapeoParaRecordar(tabla.encabezados, mapeo, recordado) : null;
  const cambioRecordado = Boolean(paraRecordar) && JSON.stringify(paraRecordar) !== JSON.stringify(recordado);
  const puedeAgregar = Boolean(resultado?.lineas.length) && !sinNombre;

  function agregar() {
    if (!resultado || !puedeAgregar) return;
    if (proveedor && recordar && cambioRecordado && paraRecordar) onRecordar(paraRecordar);
    onAgregar(resultado.lineas, resultado.avisos);
  }

  const ejemplo = (i: number) => tabla?.filas.find((f) => (f[i] ?? "").trim())?.[i] ?? "";
  const boton = "h-7 rounded-md border px-2.5 text-[12px] font-semibold transition";

  return (
    <div
      className="mb-2 rounded-md border border-[#4FC3FF]/45 bg-[#0F1519] p-2"
      onDragOver={(e: DragEvent<HTMLDivElement>) => e.preventDefault()}
      onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void leerArchivo(f); }}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#4FC3FF]">Cargar lista</h3>
        {filas ? (
          <span className="text-[11.5px] text-[#BDEAFF]">
            {fuente || "Pegado"} · {tabla?.filas.length ?? 0} fila(s){resultado?.ignoradas ? ` · ${resultado.ignoradas} sin usar (vacías o TOTAL)` : ""}
          </span>
        ) : (
          <span className="text-[11.5px] text-[#7E7F76]">Con sus títulos. También puedes soltar aquí un .xlsx o .csv.</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {filas ? (
            <button type="button" onClick={() => { setFilas(null); setTexto(""); setFuente(""); setError(""); }} className={`${boton} border-[#3A3A36] text-[#B4B5AC] hover:text-[#F5F5F5]`}>Cambiar</button>
          ) : null}
          <label className={`${boton} flex cursor-pointer items-center border-[#4FC3FF]/50 text-[#BDEAFF] hover:bg-[#4FC3FF]/10`}>
            <input type="file" accept={ACCEPT_HOJAS} className="sr-only" onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void leerArchivo(f); e.target.value = ""; }} />
            {filas ? "Otro archivo" : "Subir archivo"}
          </label>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" title="Cerrar sin agregar" className="grid h-7 w-7 place-items-center rounded-md text-[15px] text-[#8F908A] hover:text-[#FFB07A]">×</button>
        </div>
      </div>

      {!filas ? (
        <textarea
          autoFocus
          value={texto}
          onChange={(e) => usarTexto(e.target.value)}
          rows={4}
          placeholder={"Copia las filas en Excel o Google Sheets (con la fila de títulos) y pégalas aquí.\nEj.: Item · SKU proveedor · Precio unidad · Precio total línea"}
          className="w-full rounded-md border border-[#3A3A36] bg-[#151515] px-2 py-1.5 font-mono text-[12px] text-[#F5F5F5] outline-none placeholder:font-sans placeholder:text-[#5E5F59] focus:border-[#4FC3FF]/70"
        />
      ) : null}
      {cargando ? <p className="text-[12px] text-[#BDEAFF]">Leyendo el archivo…</p> : null}
      {error ? <p className="mt-1 text-[12px] text-[#FFB07A]">{error}</p> : null}

      {tabla && mapeo.length === tabla.encabezados.length ? (
        <>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">
            ¿Qué es cada columna?{!tabla.conTitulos ? <span className="ml-1 normal-case tracking-normal text-[#F4C95B]">No se reconoció una fila de títulos: elige cada columna.</span> : null}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {tabla.encabezados.map((titulo, i) => {
              const desconocida = !mapeo[i] && !tocadas.has(i) && !campoDeEncabezado(titulo, recordado);
              const usada = Boolean(mapeo[i]);
              return (
                <div key={i} className={`min-w-[124px] max-w-[200px] flex-1 rounded-md border p-1.5 ${desconocida ? "border-[#F4C95B]/55 bg-[#F4C95B]/[0.05]" : usada ? "border-[#4FC3FF]/35 bg-[#131B20]" : "border-[#2A2B26] opacity-70"}`}>
                  <div className="truncate text-[11.5px] font-semibold text-[#E6E6E1]" title={titulo}>{titulo || `Columna ${i + 1}`}</div>
                  <div className="mb-1 truncate text-[10.5px] text-[#7E7F76]" title={ejemplo(i)}>{ejemplo(i) || "—"}</div>
                  <select
                    value={mapeo[i] ?? ""}
                    onChange={(e) => elegir(i, e.target.value as CampoImportable | "")}
                    aria-label={`Qué es la columna ${titulo || i + 1}`}
                    className={`h-7 w-full rounded border bg-[#151515] px-1 text-[12px] outline-none ${usada ? "border-[#4FC3FF]/50 text-[#BDEAFF]" : desconocida ? "border-[#F4C95B]/60 text-[#F4C95B]" : "border-[#3A3A36] text-[#8F908A]"}`}
                  >
                    <option value="">{desconocida ? "¿Qué es?" : "No usar"}</option>
                    {CAMPOS_IMPORTABLES.map((c) => <option key={c} value={c}>{ETIQUETA_CAMPO[c]}</option>)}
                  </select>
                </div>
              );
            })}
          </div>

          {resultado?.avisos.length || sinNombre ? (
            <ul className="mt-1 space-y-0.5 text-[11.5px] text-[#F4C95B]">
              {sinNombre ? <li>· Elige qué columna es el Nombre.</li> : null}
              {resultado?.avisos.filter((a) => !(sinNombre && a.includes("Nombre"))).map((a) => <li key={a}>· {a}</li>)}
            </ul>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {proveedor && tabla.conTitulos && cambioRecordado ? (
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[#BDEAFF]" title="La próxima hoja de este proveedor sale con estas columnas.">
                <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="h-3.5 w-3.5 accent-[#4FC3FF]" />
                Recordar estas columnas para {proveedor.nombre}
              </label>
            ) : !proveedor && tabla.conTitulos && cambioRecordado ? (
              <span className="text-[11.5px] text-[#7E7F76]">Elige el proveedor para recordar estas columnas.</span>
            ) : null}
            <span className="ml-auto text-[12px] text-[#8F908A]">
              {resultado?.lineas.length ?? 0} artículo(s){totales && totales.unidades !== (resultado?.lineas.length ?? 0) ? ` · ${totales.unidades} u.` : ""}
              {totales && totales.total > 0 ? <> · <b className="tabular-nums text-[#F5F5F5]">{money(totales.total)}</b></> : null}
            </span>
            <button type="button" onClick={onCerrar} className={`${boton} border-[#3A3A36] text-[#B4B5AC] hover:text-[#F5F5F5]`}>Cancelar</button>
            <button type="button" onClick={agregar} disabled={!puedeAgregar}
              className={`${boton} border-[#4FC3FF] bg-[#4FC3FF] font-black text-[#0B1216] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50`}>
              Agregar {resultado?.lineas.length ?? 0} a la tabla
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
