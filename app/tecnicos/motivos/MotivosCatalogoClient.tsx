"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
import { Desplegable, OPCION_MENU } from "@/components/tecnicos/ordenes/Desplegable";
import { GRUPOS_MOTIVO, buscarMotivos, masParecido, type GrupoMotivo, type Motivo } from "@/lib/tecnicos/motivos/reglas";

// Catálogo de motivos de ingreso (rediseño R7, tablero 8 aprobado el 22-nov).
// Todos lo ven; solo un administrador cambia: renombrar, grupo, palabras
// parecidas, unir dos (las órdenes pasan al que queda) y desactivar. Nunca se
// borra. Los «Nuevo» (creados desde el registro) van arriba para revisarlos.

const COLOR_GRUPO: Record<GrupoMotivo, string> = {
  Falla: "bg-[rgba(255,122,112,.12)] text-[#FF9C94]",
  Mantenimiento: "bg-[rgba(86,227,164,.13)] text-[#56E3A4]",
  Software: "bg-[rgba(120,183,255,.14)] text-[#9CCBFF]",
  "Otro servicio": "bg-[#2C2D29] text-[#D6D6D0]",
};

const BTN = "inline-flex h-[26px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] border border-[#3A3A36] bg-[#252622] px-2.5 text-[11px] font-semibold text-[#F0F0EC] transition hover:border-[#D7FF4F] disabled:opacity-50";
const BTN_MAIN = "inline-flex h-[26px] items-center justify-center whitespace-nowrap rounded-[7px] bg-[#D7FF4F] px-2.5 text-[11px] font-bold text-[#151613] disabled:opacity-50";
const CAMPO = "h-[28px] min-w-0 flex-1 rounded-md border border-[#3A3A36] bg-[#151613] px-2 text-sm text-[#F0F0EC] outline-none focus:border-[#D7FF4F]";
const FILA = "grid grid-cols-[minmax(0,1.3fr)_104px_minmax(0,1.2fr)_48px_30px] items-center gap-2.5 border-t border-[#2C2D29] px-3 py-2";

type Edicion = { id: string; campo: "nombre" | "palabras" | "unir"; valor: string };

export function MotivosCatalogoClient() {
  const [motivos, setMotivos] = useState<Motivo[] | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);
  const [destello, setDestello] = useState<string | null>(null);

  async function cargar() {
    try {
      const r = await fetch("/api/tecnicos/motivos?todos=1", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo leer los motivos.");
      setMotivos(j.data.motivos);
      setEsAdmin(j.data.esAdmin === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer los motivos.");
    }
  }
  useEffect(() => { void cargar(); }, []);

  async function cambiar(id: string, cambios: Record<string, unknown>) {
    setOcupado(id);
    setError(null);
    try {
      const r = await fetch(`/api/tecnicos/motivos/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      setEdicion(null);
      setDestello(id);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(null);
    }
  }

  async function unir(origen: Motivo, destino: Motivo) {
    setOcupado(origen.id);
    setError(null);
    try {
      const r = await fetch(`/api/tecnicos/motivos/${encodeURIComponent(origen.id)}/unir`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinoId: destino.id }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo unir.");
      setEdicion(null);
      setDestello(destino.id);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo unir.");
    } finally {
      setOcupado(null);
    }
  }

  const activos = useMemo(() => (motivos ?? []).filter((m) => m.activo), [motivos]);
  const inactivos = useMemo(() => (motivos ?? []).filter((m) => !m.activo), [motivos]);
  const porRevisar = activos.filter((m) => m.nuevo).length;
  const ordenados = [...activos].sort((a, b) => Number(b.nuevo) - Number(a.nuevo) || b.usos - a.usos || a.nombre.localeCompare(b.nombre, "es"));
  const parecidoA = (m: Motivo) => masParecido(activos, m.nombre, m.id);

  function fila(m: Motivo) {
    const editando = edicion?.id === m.id ? edicion : null;
    const sugerido = m.nuevo ? parecidoA(m) : null;
    const destinosUnir = editando?.campo === "unir"
      ? (editando.valor.trim() ? buscarMotivos(activos.filter((x) => x.id !== m.id), editando.valor, 5).map((r) => r.motivo) : activos.filter((x) => x.id !== m.id).slice(0, 5))
      : [];
    return (
      <div key={m.id} className={`${FILA} ${m.nuevo ? "bg-[rgba(255,181,71,.05)]" : ""} ${destello === m.id ? "animate-[sg-destello_700ms_ease-out]" : ""} ${!m.activo ? "opacity-60" : ""}`}>
        <div className="flex min-w-0 flex-col gap-1.5">
          {editando?.campo === "nombre" ? (
            <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void cambiar(m.id, { nombre: editando.valor }); }}>
              <input autoFocus value={editando.valor} onChange={(e) => setEdicion({ ...editando, valor: e.target.value })} className={CAMPO} aria-label="Nuevo nombre" />
              <button type="submit" disabled={ocupado === m.id} className={BTN_MAIN}>Guardar</button>
              <button type="button" onClick={() => setEdicion(null)} className="text-[11px] font-semibold text-[#B5B5AE] hover:text-white">Cancelar</button>
            </form>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-[#F0F0EC]">
              {m.nombre}
              {m.nuevo && <span className="inline-flex h-5 items-center rounded-full bg-[rgba(255,181,71,.13)] px-2 text-[10px] font-bold text-[#FFB547]">Nuevo</span>}
            </span>
          )}
          {m.nuevo && esAdmin && !editando && (
            <span className="flex flex-wrap gap-1.5">
              {sugerido && <button type="button" disabled={ocupado === m.id} onClick={() => void unir(m, sugerido)} className={BTN_MAIN}>Unir con «{sugerido.nombre}»</button>}
              <button type="button" disabled={ocupado === m.id} onClick={() => void cambiar(m.id, { nuevo: false })} className={BTN}>Aprobar</button>
            </span>
          )}
          {editando?.campo === "unir" && (
            <div className="space-y-1.5 rounded-lg border border-[#3A3A36] bg-[#191A17] p-2 animate-[sg-entrada_140ms_ease-out]">
              <input autoFocus value={editando.valor} onChange={(e) => setEdicion({ ...editando, valor: e.target.value })} placeholder="¿Con cuál se une?" className={`${CAMPO} w-full`} />
              <div className="flex flex-wrap gap-1.5">
                {destinosUnir.map((d) => (
                  <button key={d.id} type="button" disabled={ocupado === m.id} onClick={() => void unir(m, d)} className={BTN}>{d.nombre}</button>
                ))}
              </div>
              <p className="text-[11px] text-[#FFB547]">Sus {m.usos} órdenes pasan al elegido y «{m.nombre}» queda desactivado.</p>
              <button type="button" onClick={() => setEdicion(null)} className="text-[11px] font-semibold text-[#B5B5AE] hover:text-white">Cancelar</button>
            </div>
          )}
        </div>

        <div>
          {esAdmin && m.activo ? (
            <Desplegable ancho={170} boton={({ ref, abierto, alternar }) => (
              <button ref={ref} type="button" onClick={alternar} aria-haspopup="menu" aria-expanded={abierto} title="Cambiar grupo"
                className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold ${m.grupo ? COLOR_GRUPO[m.grupo] : "border border-dashed border-[#6E6E68] text-[#B5B5AE]"}`}>
                {m.grupo ?? "Sin grupo"}
              </button>
            )}>
              {(cerrar) => GRUPOS_MOTIVO.map((g) => (
                <button key={g} type="button" role="menuitem" className={OPCION_MENU} onClick={() => { cerrar(); void cambiar(m.id, { grupo: g }); }}>
                  <span className="flex-1">{g}</span>{m.grupo === g && <span className="text-[#D7FF4F]">✓</span>}
                </button>
              ))}
            </Desplegable>
          ) : (
            <span className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold ${m.grupo ? COLOR_GRUPO[m.grupo] : "text-[#B5B5AE]"}`}>{m.grupo ?? "—"}</span>
          )}
        </div>

        <div className="min-w-0">
          {editando?.campo === "palabras" ? (
            <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void cambiar(m.id, { palabras: editando.valor }); }}>
              <input autoFocus value={editando.valor} onChange={(e) => setEdicion({ ...editando, valor: e.target.value })} className={CAMPO} aria-label="Palabras parecidas, separadas por coma" />
              <button type="submit" disabled={ocupado === m.id} className={BTN_MAIN}>Guardar</button>
            </form>
          ) : (
            <span className="block truncate text-xs text-[#B5B5AE]" title={m.palabras.join(", ")}>{m.palabras.join(", ") || "—"}</span>
          )}
        </div>

        <span className="text-right text-sm tabular-nums text-[#F0F0EC]" title={`${m.usos90} en los últimos 90 días`}>{m.usos}</span>

        <div>
          {esAdmin && (
            <Desplegable derecha ancho={190} boton={({ ref, abierto, alternar }) => (
              <button ref={ref} type="button" onClick={alternar} aria-haspopup="menu" aria-expanded={abierto} aria-label={`Más acciones de ${m.nombre}`}
                title="Renombrar · Palabras · Unir · Desactivar" className={`${BTN} w-[26px] !px-0`}>⋯</button>
            )}>
              {(cerrar) => m.activo ? (
                <>
                  <button type="button" role="menuitem" className={OPCION_MENU} onClick={() => { cerrar(); setEdicion({ id: m.id, campo: "nombre", valor: m.nombre }); }}>Renombrar</button>
                  <button type="button" role="menuitem" className={OPCION_MENU} onClick={() => { cerrar(); setEdicion({ id: m.id, campo: "palabras", valor: m.palabras.join(", ") }); }}>Palabras parecidas</button>
                  <button type="button" role="menuitem" className={OPCION_MENU} onClick={() => { cerrar(); setEdicion({ id: m.id, campo: "unir", valor: "" }); }}>Unir con otro…</button>
                  <button type="button" role="menuitem" className={`${OPCION_MENU} mt-1 border-t border-[#2C2D29] pt-2 text-[#FF9C94]`} onClick={() => { cerrar(); void cambiar(m.id, { activo: false, nuevo: false }); }}>Desactivar</button>
                </>
              ) : (
                <button type="button" role="menuitem" className={OPCION_MENU} onClick={() => { cerrar(); void cambiar(m.id, { activo: true }); }} disabled={!!m.unidoEn}>
                  {m.unidoEn ? "Unido a otro motivo" : "Activar"}
                </button>
              )}
            </Desplegable>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.theme} w-full`}>
      <section className="overflow-visible rounded-xl border border-[#3A3A36] bg-[#1E1F1C]">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <h1 className="text-sm font-bold text-[#F0F0EC]">Motivos de ingreso</h1>
          {motivos && <span className="text-xs text-[#B5B5AE]">{activos.length} activos</span>}
          {porRevisar > 0 && <span className="ml-auto inline-flex h-5 items-center rounded-full bg-[rgba(255,181,71,.13)] px-2 text-[10px] font-bold text-[#FFB547]">{porRevisar} por revisar</span>}
        </div>
        {error && <p role="alert" className="px-3 pb-2 text-xs text-[#FF7A70] animate-[sg-sacudir_240ms_ease-out]">{error}</p>}
        <div className={`${FILA} py-1.5 text-[11px] font-semibold text-[#B5B5AE]`}>
          <span>MOTIVO</span><span>GRUPO</span><span>PALABRAS PARECIDAS</span><span className="text-right">USOS</span><span />
        </div>
        {motivos === null ? (
          <p className="border-t border-[#2C2D29] px-3 py-3 text-xs text-[#B5B5AE]">Cargando…</p>
        ) : (
          ordenados.map(fila)
        )}
        {inactivos.length > 0 && (
          <div className="border-t border-[#2C2D29] px-3 py-2">
            <button type="button" onClick={() => setVerInactivos((v) => !v)} className="text-xs text-[#D7FF4F] hover:underline">
              {verInactivos ? "Ocultar desactivados" : `Desactivados (${inactivos.length})`}
            </button>
          </div>
        )}
        {verInactivos && inactivos.map(fila)}
      </section>
    </div>
  );
}
