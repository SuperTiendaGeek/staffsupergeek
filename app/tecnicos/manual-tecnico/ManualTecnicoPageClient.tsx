"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  TIPOS_MANUAL, TIPOS_NOTA, accionesPermitidas, fechaCortaEc, parsearUsos, pasosDeSolucion, tituloEntrada,
  type EntradaManual, type TipoManual,
} from "@/lib/manual-tecnico/reglas";
import { ChipEstado, btn, btnMain, cap, entrada, entradaBase } from "@/components/asistente/ui";

// Técnicos → Manual técnico (punto 11B · lienzo aprobado, tablero 9).
// Buscar, filtrar por tipo y estado; el administrador verifica, corrige o
// archiva (nunca se borra). Las soluciones nacen en una orden; aquí se
// agregan a mano solo procedimientos, reglas de la tienda y notas.

type Datos = { entradas: EntradaManual[]; ordenes: Record<string, string>; esAdmin: boolean };
type FiltroEstado = "todas" | "Probada" | "Verificada" | "Para revisar" | "Archivada";

const NOMBRE_TIPO: Record<TipoManual, string> = { Solución: "Soluciones", Procedimiento: "Procedimientos", "Regla de la tienda": "Reglas de la tienda", Nota: "Notas" };
const FILTROS: Array<{ clave: FiltroEstado; texto: string }> = [
  { clave: "todas", texto: "Todas" },
  { clave: "Probada", texto: "Por verificar" },
  { clave: "Verificada", texto: "Verificadas" },
  { clave: "Para revisar", texto: "Para revisar" },
  { clave: "Archivada", texto: "Archivadas" },
];

export function ManualTecnicoPageClient({ ver }: { ver: string | null }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoManual>("Solución");
  const [filtro, setFiltro] = useState<FiltroEstado>("todas");
  const [q, setQ] = useState("");
  const [seleccion, setSeleccion] = useState<string | null>(ver);
  const [nueva, setNueva] = useState(false);

  async function cargar() {
    try {
      const r = await fetch("/api/tecnicos/manual-tecnico", { cache: "no-store" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "No se pudo leer el Manual técnico.");
      setDatos(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el Manual técnico.");
    }
  }
  useEffect(() => { void cargar(); }, []);

  // Si llega con ?ver=…, abre esa entrada en su pestaña.
  useEffect(() => {
    if (!datos || !ver) return;
    const e = datos.entradas.find((x) => x.id === ver);
    if (e) { setTipo(e.tipo); setFiltro(e.estado === "Archivada" ? "Archivada" : "todas"); setSeleccion(e.id); }
  }, [datos, ver]);

  const conteoTipo = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of datos?.entradas ?? []) if (e.estado !== "Archivada") c[e.tipo] = (c[e.tipo] ?? 0) + 1;
    return c;
  }, [datos]);
  const porVerificar = (datos?.entradas ?? []).filter((e) => e.estado === "Probada").length;
  const conteoFiltro = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of datos?.entradas ?? []) if (e.tipo === tipo) c[e.estado] = (c[e.estado] ?? 0) + 1;
    return c;
  }, [datos, tipo]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.entradas ?? [])
      .filter((e) => e.tipo === tipo)
      .filter((e) => (filtro === "todas" ? e.estado !== "Archivada" : e.estado === filtro))
      .filter((e) => !t || [e.codigo, e.marca, e.modelo, e.sistema, e.sintoma, e.causa, e.solucion, e.noFunciono, e.notas, e.claves, e.ordenOrigen]
        .join(" ").toLowerCase().includes(t));
  }, [datos, tipo, filtro, q]);

  const elegida = datos?.entradas.find((e) => e.id === seleccion) ?? null;
  const reemplazar = (e: EntradaManual) => setDatos((d) => (d ? { ...d, entradas: d.entradas.map((x) => (x.id === e.id ? e : x)) } : d));

  return (
    <section className="flex flex-col gap-3 text-[13px] text-[#F0F0EC]">
      <div className="flex flex-wrap items-center gap-2.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A7A7A7]">Técnicos</p>
          <h1 className="text-lg font-bold">Manual técnico</h1>
        </div>
        {porVerificar > 0 && (
          <span className="mt-4 inline-flex h-5 items-center rounded-full bg-[rgba(255,181,71,.12)] px-[7px] text-[10px] font-bold text-[#FFB547]">{porVerificar} por verificar</span>
        )}
        <div className="flex-1" />
        <label htmlFor="manual-buscar" className="sr-only">Buscar en el manual</label>
        <input id="manual-buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Modelo, síntoma o palabra…" className={`${entradaBase} h-8 w-[280px] max-w-full`} />
        <button type="button" className={btn} onClick={() => { setNueva(true); setSeleccion(null); }}>+ Nota</button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div role="tablist" aria-label="Tipo" className="inline-flex overflow-hidden rounded-lg border border-[#3A3A36]">
          {TIPOS_MANUAL.map((t, i) => (
            <button key={t} role="tab" type="button" aria-selected={tipo === t} onClick={() => { setTipo(t); setSeleccion(null); }}
              className={`h-[30px] px-3 text-xs font-semibold ${i ? "border-l border-[#3A3A36]" : ""} ${tipo === t ? "bg-[#D7FF4F] text-[#151613]" : "bg-[#252622] text-[#F0F0EC]"}`}>
              {NOMBRE_TIPO[t]} · {conteoTipo[t] ?? 0}
            </button>
          ))}
        </div>
        <div className="inline-flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button key={f.clave} type="button" onClick={() => setFiltro(f.clave)}
              className={`${btn} h-[26px] ${filtro === f.clave ? "!border-[#D7FF4F] !text-[#D7FF4F]" : ""}`}>
              {f.texto}{f.clave !== "todas" && conteoFiltro[f.clave] ? ` · ${conteoFiltro[f.clave]}` : ""}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[#FFB0A8]">{error}</p>}
      {!datos && !error && <p className="text-[#B5B5AE]">Cargando…</p>}

      {datos && (
        <div className="flex flex-wrap items-start gap-3">
          <section className="min-w-0 flex-[999_1_640px] overflow-x-auto rounded-xl border border-[#3A3A36] bg-[#1E1F1C]">
            {visibles.length === 0 ? (
              <p className="p-4 text-[#B5B5AE]">
                {tipo === "Solución" && !q && filtro === "todas"
                  ? "Todavía no hay soluciones. Se guardan desde una orden al pasar a Completado."
                  : "Nada con ese filtro."}
              </p>
            ) : tipo === "Solución" ? (
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-[#B5B5AE]">
                    <th className="border-b border-[#3A3A36] px-2.5 py-2 pl-3.5">Equipo</th>
                    <th className="border-b border-[#3A3A36] px-2.5 py-2">Síntoma</th>
                    <th className="border-b border-[#3A3A36] px-2.5 py-2">Causa</th>
                    <th className="border-b border-[#3A3A36] px-2.5 py-2 text-right">Funcionó</th>
                    <th className="border-b border-[#3A3A36] px-2.5 py-2">Estado</th>
                    <th className="border-b border-[#3A3A36] px-2.5 py-2 pr-3.5">Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((e) => (
                    <tr key={e.id} onClick={() => { setSeleccion(e.id); setNueva(false); }}
                      className={`cursor-pointer align-top hover:bg-[#252622] ${seleccion === e.id ? "bg-[rgba(215,255,79,.06)]" : ""}`}>
                      <td className="border-b border-[#2C2D29] px-2.5 py-2.5 pl-3.5 font-semibold">{tituloEntrada(e)}</td>
                      <td className="border-b border-[#2C2D29] px-2.5 py-2.5">{e.sintoma}</td>
                      <td className="border-b border-[#2C2D29] px-2.5 py-2.5 text-[#B5B5AE]">{e.causa}</td>
                      <td className="border-b border-[#2C2D29] px-2.5 py-2.5 text-right tabular-nums">{e.vecesFunciono} · {e.vecesFallo}</td>
                      <td className="border-b border-[#2C2D29] px-2.5 py-2.5"><ChipEstado estado={e.estado} /></td>
                      <td className="border-b border-[#2C2D29] px-2.5 py-2.5 pr-3.5">
                        {e.ordenOrigen && datos.ordenes[e.ordenOrigen]
                          ? <Link href={`/tecnicos/ordenes/${datos.ordenes[e.ordenOrigen]}`} onClick={(ev) => ev.stopPropagation()} className="text-[#D7FF4F] hover:underline">{e.ordenOrigen}</Link>
                          : <span className="text-[#B5B5AE]">{e.ordenOrigen || "—"}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-[#B5B5AE]">
                    <th className="border-b border-[#3A3A36] px-2.5 py-2 pl-3.5">{tipo === "Regla de la tienda" ? "Regla" : tipo}</th>
                    <th className="border-b border-[#3A3A36] px-2.5 py-2">Claves</th>
                    <th className="border-b border-[#3A3A36] px-2.5 py-2">Estado</th>
                    <th className="border-b border-[#3A3A36] px-2.5 py-2 pr-3.5">Código</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((e) => (
                    <tr key={e.id} onClick={() => { setSeleccion(e.id); setNueva(false); }}
                      className={`cursor-pointer align-top hover:bg-[#252622] ${seleccion === e.id ? "bg-[rgba(215,255,79,.06)]" : ""}`}>
                      <td className="border-b border-[#2C2D29] px-2.5 py-2.5 pl-3.5 font-semibold">{tituloEntrada(e)}</td>
                      <td className="border-b border-[#2C2D29] px-2.5 py-2.5 text-[#B5B5AE]">{e.claves || "—"}</td>
                      <td className="border-b border-[#2C2D29] px-2.5 py-2.5"><ChipEstado estado={e.estado} /></td>
                      <td className="border-b border-[#2C2D29] px-2.5 py-2.5 pr-3.5 text-[#B5B5AE]">{e.codigo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {(elegida || nueva) && (
            <aside className="flex max-w-[420px] flex-[1_1_360px] flex-col gap-2.5 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-3.5">
              {nueva ? (
                <NuevaNota tipoInicial={tipo === "Solución" ? "Procedimiento" : tipo}
                  onCancelar={() => setNueva(false)}
                  onCreada={(e) => { setDatos((d) => (d ? { ...d, entradas: [e, ...d.entradas] } : d)); setNueva(false); setTipo(e.tipo); setSeleccion(e.id); }} />
              ) : elegida ? (
                <Detalle key={elegida.id} e={elegida} esAdmin={datos.esAdmin} ordenes={datos.ordenes} onCambio={reemplazar} />
              ) : null}
            </aside>
          )}
        </div>
      )}
    </section>
  );
}

function Detalle({ e, esAdmin, ordenes, onCambio }: { e: EntradaManual; esAdmin: boolean; ordenes: Record<string, string>; onCambio: (e: EntradaManual) => void }) {
  const [editando, setEditando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acciones = accionesPermitidas(esAdmin, e);
  const usos = parsearUsos(e.usos);

  async function accion(a: "verificar" | "archivar" | "corregir", cambios?: Record<string, unknown>) {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(`/api/tecnicos/manual-tecnico/${e.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: a, cambios }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      onCambio(j.data.entrada);
      setEditando(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  if (editando) {
    return <Editor e={e} enviando={enviando} error={error} onGuardar={(c) => void accion("corregir", c)} onCancelar={() => setEditando(false)} />;
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold">{tituloEntrada(e)}</h2>
        <ChipEstado estado={e.estado} />
        <span className="ml-auto text-xs text-[#B5B5AE]">{e.codigo}</span>
      </div>
      {e.tipo === "Solución" ? (
        <>
          {e.sistema && <Bloque etiqueta="Sistema">{e.sistema}</Bloque>}
          <Bloque etiqueta="Síntoma">{e.sintoma}</Bloque>
          {e.causa && <Bloque etiqueta="Causa">{e.causa}</Bloque>}
          {pasosDeSolucion(e.solucion).length > 0 && (
            <Bloque etiqueta="Solución">
              <ol className="list-decimal space-y-0.5 pl-[18px] leading-snug">{pasosDeSolucion(e.solucion).map((p, i) => <li key={i}>{p}</li>)}</ol>
            </Bloque>
          )}
          {e.noFunciono && <Bloque etiqueta="No funcionó"><span className="text-[#B5B5AE]">{e.noFunciono}</span></Bloque>}
          <p className="text-xs text-[#B5B5AE]">
            {[e.registradoPor && `Guardó ${e.registradoPor}`, e.creado && fechaCortaEc(e.creado), `funcionó ${e.vecesFunciono} ${e.vecesFunciono === 1 ? "vez" : "veces"} · falló ${e.vecesFallo}`].filter(Boolean).join(" · ")}
          </p>
          {usos.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs text-[#B5B5AE]">
              {usos.map((u, i) => (
                <li key={i}>
                  {ordenes[u.orden] ? <Link href={`/tecnicos/ordenes/${ordenes[u.orden]}`} className="text-[#D7FF4F] hover:underline">{u.orden}</Link> : u.orden}
                  {" · "}<span className={u.funciono ? "text-[#56E3A4]" : "text-[#FF7A70]"}>{u.funciono ? "Funcionó" : "No funcionó"}</span>
                  {` · ${u.usuario} · ${u.fecha}${u.origen ? " · origen" : ""}`}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <pre className={`max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-[#151613] p-2.5 leading-snug ${e.tipo === "Procedimiento" ? "font-mono text-xs" : "font-sans text-[13px]"}`}>{e.notas || "—"}</pre>
          {e.claves && <Bloque etiqueta="Claves"><span className="text-[#B5B5AE]">{e.claves}</span></Bloque>}
          {e.registradoPor && <p className="text-xs text-[#B5B5AE]">Agregó {e.registradoPor}{e.creado ? ` · ${fechaCortaEc(e.creado)}` : ""}</p>}
        </>
      )}
      {e.verificadoPor && <p className="text-xs text-[#B5B5AE]">Verificó {e.verificadoPor}{e.fechaVerificacion ? ` · ${fechaCortaEc(e.fechaVerificacion)}` : ""}</p>}
      {acciones.length > 0 && (
        <div className="flex gap-2 pt-1">
          {acciones.includes("verificar") && <button type="button" className={`${btnMain} h-[30px] flex-1`} disabled={enviando} onClick={() => void accion("verificar")}>Verificar</button>}
          {acciones.includes("corregir") && <button type="button" className={`${btn} h-[30px]`} disabled={enviando} onClick={() => setEditando(true)}>Corregir</button>}
          {acciones.includes("archivar") && <button type="button" className={`${btn} h-[30px]`} disabled={enviando} onClick={() => void accion("archivar")}>Archivar</button>}
        </div>
      )}
      {!esAdmin && e.estado === "Probada" && <p className="text-xs text-[#B5B5AE]">Un administrador la verificará.</p>}
      {error && <p className="text-xs text-[#FFB0A8]">{error}</p>}
    </>
  );
}

function Bloque({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className={cap}>{etiqueta}</span>
      <div className="leading-snug">{children}</div>
    </div>
  );
}

function Editor({ e, enviando, error, onGuardar, onCancelar }: {
  e: EntradaManual; enviando: boolean; error: string | null;
  onGuardar: (cambios: Record<string, unknown>) => void; onCancelar: () => void;
}) {
  const [v, setV] = useState({
    marca: e.marca, modelo: e.modelo, sistema: e.sistema, sintoma: e.sintoma, causa: e.causa,
    solucion: e.solucion, noFunciono: e.noFunciono, texto: e.notas, claves: e.claves, tipo: e.tipo as string,
  });
  const campo = (k: keyof typeof v, etiqueta: string, filas = 0) => (
    <label className="flex flex-col gap-1">
      <span className={cap}>{etiqueta}</span>
      {filas
        ? <textarea rows={filas} className={`${entrada} py-1.5`} value={v[k]} onChange={(ev) => setV({ ...v, [k]: ev.target.value })} />
        : <input className={`${entrada} h-8`} value={v[k]} onChange={(ev) => setV({ ...v, [k]: ev.target.value })} />}
    </label>
  );
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-bold">Corregir {e.codigo}</h2>
      {e.tipo === "Solución" ? (
        <>
          <div className="grid grid-cols-2 gap-2">{campo("marca", "Marca")}{campo("modelo", "Modelo")}</div>
          {campo("sistema", "Sistema")}
          {campo("sintoma", "Síntoma", 2)}
          {campo("causa", "Causa", 2)}
          {campo("solucion", "Solución (un paso por línea)", 4)}
          {campo("noFunciono", "No funcionó", 2)}
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className={cap}>Tipo</span>
            <select className={`${entrada} h-8`} value={v.tipo} onChange={(ev) => setV({ ...v, tipo: ev.target.value })}>
              {TIPOS_NOTA.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {campo("texto", "Texto", 8)}
          {campo("claves", "Claves (para buscar)")}
        </>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" className={`${btnMain} h-[30px] flex-1`} disabled={enviando}
          onClick={() => onGuardar(e.tipo === "Solución"
            ? { marca: v.marca, modelo: v.modelo, sistema: v.sistema, sintoma: v.sintoma, causa: v.causa, solucion: v.solucion, noFunciono: v.noFunciono }
            : { texto: v.texto, claves: v.claves, tipo: v.tipo })}>
          {enviando ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" className={`${btn} h-[30px]`} disabled={enviando} onClick={onCancelar}>Cancelar</button>
      </div>
      {error && <p className="text-xs text-[#FFB0A8]">{error}</p>}
    </div>
  );
}

function NuevaNota({ tipoInicial, onCancelar, onCreada }: { tipoInicial: TipoManual; onCancelar: () => void; onCreada: (e: EntradaManual) => void }) {
  const [tipo, setTipo] = useState<string>(tipoInicial);
  const [texto, setTexto] = useState("");
  const [claves, setClaves] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/tecnicos/manual-tecnico", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, texto, claves }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      onCreada(j.data.entrada);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-bold">Nueva nota</h2>
      <p className="text-xs text-[#B5B5AE]">Las soluciones se guardan desde la orden, al pasar a Completado.</p>
      <label className="flex flex-col gap-1">
        <span className={cap}>Tipo</span>
        <select className={`${entrada} h-8`} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_NOTA.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={cap}>Texto</span>
        <textarea rows={8} className={`${entrada} py-1.5`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: No recibir impresoras Canon de cartucho." />
      </label>
      <label className="flex flex-col gap-1">
        <span className={cap}>Claves (para buscar)</span>
        <input className={`${entrada} h-8`} value={claves} onChange={(e) => setClaves(e.target.value)} placeholder="bios, dell, usb" />
      </label>
      <div className="flex gap-2 pt-1">
        <button type="button" className={`${btnMain} h-[30px] flex-1`} disabled={enviando || !texto.trim()} onClick={() => void crear()}>{enviando ? "Guardando…" : "Guardar"}</button>
        <button type="button" className={`${btn} h-[30px]`} disabled={enviando} onClick={onCancelar}>Cancelar</button>
      </div>
      {error && <p className="text-xs text-[#FFB0A8]">{error}</p>}
    </div>
  );
}
