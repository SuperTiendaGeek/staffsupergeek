"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TIPOS_EQUIPO, type DatosEquipo, type OrdenDeHistoria } from "@/lib/tecnicos/equipos/reglas";

// Ficha del equipo en la orden (rediseño R4 + R5, tableros 1 y 5 aprobados el
// 22-nov): datos del equipo, contraseña oculta («Mostrar» queda en la
// Actividad) e historia de sus órdenes. Si la orden vieja no tiene ficha, se
// registra con un toque (datos propuestos desde el texto).

type Ficha = { id: string; nombre: string; tipo: string; marca: string; modelo: string; serie: string; tieneContrasena: boolean; ordenIds: string[] };
type Datos = { ordenCodigo: string; equipoTexto: string; ficha: Ficha | null; sugerida: DatosEquipo; delCliente: Ficha[]; historia: OrdenDeHistoria[] };

const etiqueta = "text-[10px] uppercase tracking-wide text-[var(--sg-text-muted)]";
const campo = "h-8 w-full rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 text-sm text-[#F0F0EC] outline-none transition focus:border-[#D7FF4F]";
const fecha = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short", year: "numeric" });
};

export function EquipoFicha({ ordenId, onCambio }: { ordenId: string; onCambio?: () => void | Promise<void> }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<"crear" | "editar" | "historia" | null>(null);
  const [contrasena, setContrasena] = useState<string | null>(null);
  const [editandoClave, setEditandoClave] = useState(false);
  const [claveNueva, setClaveNueva] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const ocultar = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/equipo`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo leer el equipo.");
      setDatos(j.data as Datos);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el equipo.");
    }
  }, [ordenId]);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => () => { if (ocultar.current) clearTimeout(ocultar.current); }, []);

  async function mostrar() {
    if (!datos?.ficha || ocupado) return;
    setOcupado(true);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/equipo/contrasena`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ equipoId: datos.ficha.id }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo mostrar.");
      setContrasena(String(j.data.contrasena ?? ""));
      // Se vuelve a ocultar sola a los 30 segundos.
      if (ocultar.current) clearTimeout(ocultar.current);
      ocultar.current = setTimeout(() => setContrasena(null), 30_000);
      await onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo mostrar.");
    } finally {
      setOcupado(false);
    }
  }

  async function guardarClave() {
    if (!datos?.ficha || ocupado) return;
    setOcupado(true);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/equipo/contrasena`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ equipoId: datos.ficha.id, valor: claveNueva }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      setEditandoClave(false);
      setContrasena(null);
      await cargar();
      await onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  if (!datos) {
    return <p className="text-xs text-[var(--sg-text-muted)]">{error ?? "Cargando equipo…"}</p>;
  }

  const f = datos.ficha;
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sg-text-muted)]" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M1 13h14" stroke="currentColor" strokeWidth="1.3" /></svg>
        <div className="min-w-0 flex-1">
          <p className={etiqueta}>Equipo</p>
          {f ? (
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--sg-text-primary)]">{f.nombre} <span className="font-normal text-[var(--sg-text-muted)]">· {f.tipo}</span></p>
                {f.serie && <p className="font-mono text-xs text-[var(--sg-text-secondary)]">Serie {f.serie}</p>}
              </div>
              <button type="button" onClick={() => setDialogo("editar")} aria-label="Corregir equipo" title="Corregir" className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--sg-text-muted)] hover:bg-[#2C2D29] hover:text-white">
                <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-[var(--sg-text-primary)]">{datos.equipoTexto || "Sin equipo"}</span>
              <button type="button" onClick={() => setDialogo("crear")} className="h-6 rounded-md border border-[rgba(215,255,79,.45)] px-2 text-[11px] font-bold text-[#D7FF4F] transition hover:bg-[rgba(215,255,79,.08)]">Registrar ficha</button>
            </div>
          )}
        </div>
      </div>

      {f && (
        <div className="flex items-start gap-2">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sg-text-muted)]" viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="8" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M7.6 8H14M12 8v2.2M10 8v1.6" stroke="currentColor" strokeWidth="1.3" /></svg>
          <div className="min-w-0 flex-1">
            <p className={etiqueta}>Contraseña</p>
            {editandoClave ? (
              <div className="flex items-center gap-1.5 animate-[sg-entrada_120ms_ease-out]">
                <input autoFocus value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void guardarClave(); if (e.key === "Escape") setEditandoClave(false); }}
                  aria-label="Contraseña del equipo" className={`${campo} h-7 font-mono`} />
                <button type="button" onClick={() => void guardarClave()} disabled={ocupado} className="h-7 rounded-md bg-[#D7FF4F] px-2.5 text-[11px] font-bold text-[#151613] disabled:opacity-50">Guardar</button>
                <button type="button" onClick={() => setEditandoClave(false)} className="h-7 px-1 text-[11px] font-semibold text-[var(--sg-text-muted)] hover:text-white">Cancelar</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                {f.tieneContrasena ? (
                  contrasena !== null ? (
                    <>
                      <span className="font-mono text-[var(--sg-text-primary)] animate-[sg-destello_600ms_ease-out]">{contrasena}</span>
                      <button type="button" onClick={() => void navigator.clipboard?.writeText(contrasena)} className="text-[11px] font-semibold text-[#D7FF4F] hover:underline">Copiar</button>
                      <button type="button" onClick={() => setContrasena(null)} className="text-[11px] font-semibold text-[var(--sg-text-muted)] hover:text-white">Ocultar</button>
                    </>
                  ) : (
                    <>
                      <span className="tracking-[2px] text-[var(--sg-text-secondary)]">••••••</span>
                      <button type="button" onClick={() => void mostrar()} disabled={ocupado} title="Queda anotado en la Actividad" className="text-[11px] font-semibold text-[#D7FF4F] hover:underline disabled:opacity-50">Mostrar</button>
                    </>
                  )
                ) : (
                  <span className="text-[var(--sg-text-muted)]">Sin contraseña</span>
                )}
                <button type="button" onClick={() => { setClaveNueva(contrasena ?? ""); setEditandoClave(true); }} className="ml-auto text-[11px] font-semibold text-[var(--sg-text-muted)] hover:text-white">
                  {f.tieneContrasena ? "Cambiar" : "Agregar"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {f && datos.historia.length > 0 && (
        <button type="button" onClick={() => setDialogo("historia")} className="ml-6 text-xs font-semibold text-[#D7FF4F] hover:underline">
          Historia · {datos.historia.length} {datos.historia.length === 1 ? "orden antes" : "órdenes antes"}
        </button>
      )}

      {error && <p role="alert" className="text-xs text-[#FF7A70] animate-[sg-sacudir_240ms_ease-out]">{error}</p>}

      {(dialogo === "crear" || dialogo === "editar") && (
        <FichaDialog
          ordenId={ordenId}
          modo={dialogo}
          ficha={f}
          sugerida={datos.sugerida}
          delCliente={dialogo === "crear" ? datos.delCliente : []}
          onCerrar={() => setDialogo(null)}
          onGuardado={async () => { setDialogo(null); await cargar(); await onCambio?.(); }}
        />
      )}
      {dialogo === "historia" && f && <HistoriaDialog nombre={f.nombre} historia={datos.historia} onCerrar={() => setDialogo(null)} />}
    </div>
  );
}

function Velo({ children, onCerrar, titulo }: { children: React.ReactNode; onCerrar: () => void; titulo: string }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm animate-[sg-velo_160ms_ease-out]" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="w-full max-w-md space-y-3 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-2xl animate-[sg-modal_200ms_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h4 className="flex-1 text-sm font-semibold text-white">{titulo}</h4>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="grid h-7 w-7 place-items-center rounded-lg border border-[#3A3A36] text-[#B5B5AE] hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FichaDialog({ ordenId, modo, ficha, sugerida, delCliente, onCerrar, onGuardado }: {
  ordenId: string;
  modo: "crear" | "editar";
  ficha: Ficha | null;
  sugerida: DatosEquipo;
  delCliente: Ficha[];
  onCerrar: () => void;
  onGuardado: () => void | Promise<void>;
}) {
  const base = modo === "editar" && ficha ? { tipo: ficha.tipo, marca: ficha.marca, modelo: ficha.modelo, serie: ficha.serie } : sugerida;
  const [d, setD] = useState({ tipo: base.tipo as string, marca: base.marca, modelo: base.modelo, serie: base.serie });
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(cuerpo: Record<string, unknown>) {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/equipo`, {
        method: modo === "editar" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      await onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      setEnviando(false);
    }
  }

  return (
    <Velo titulo={modo === "editar" ? "Corregir equipo" : "Ficha del equipo"} onCerrar={() => !enviando && onCerrar()}>
      {delCliente.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-[#B5B5AE]">Es uno de sus equipos</p>
          <div className="flex flex-wrap gap-1.5">
            {delCliente.map((x) => (
              <button key={x.id} type="button" disabled={enviando} onClick={() => void enviar({ equipoId: x.id })}
                className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-2.5 py-1.5 text-left text-xs text-[#F0F0EC] transition hover:border-[#D7FF4F]">
                <span className="font-semibold">{x.nombre}</span>{x.serie && <span className="ml-1 font-mono text-[#B5B5AE]">{x.serie}</span>}
              </button>
            ))}
          </div>
          <p className="pt-1 text-[11px] font-semibold text-[#B5B5AE]">O es otro equipo</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 space-y-1"><span className="text-[11px] font-semibold text-[#B5B5AE]">Tipo</span>
          <select value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })} className={campo}>
            {TIPOS_EQUIPO.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="text-[11px] font-semibold text-[#B5B5AE]">Marca</span>
          <input value={d.marca} onChange={(e) => setD({ ...d, marca: e.target.value })} className={campo} />
        </label>
        <label className="space-y-1"><span className="text-[11px] font-semibold text-[#B5B5AE]">Serie</span>
          <input value={d.serie} onChange={(e) => setD({ ...d, serie: e.target.value })} className={`${campo} font-mono`} />
        </label>
        <label className="col-span-2 space-y-1"><span className="text-[11px] font-semibold text-[#B5B5AE]">Modelo</span>
          <input value={d.modelo} onChange={(e) => setD({ ...d, modelo: e.target.value })} className={campo} />
        </label>
        {modo === "crear" && (
          <label className="col-span-2 space-y-1"><span className="text-[11px] font-semibold text-[#B5B5AE]">Contraseña</span>
            <input value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Opcional" className={`${campo} font-mono`} />
          </label>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-[#FF7A70] animate-[sg-sacudir_240ms_ease-out]">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} disabled={enviando} className="h-8 rounded-lg border border-[#3A3A36] px-3 text-xs font-semibold text-[#F0F0EC]">Cancelar</button>
        <button type="button" disabled={enviando}
          onClick={() => void enviar(modo === "editar" ? { equipoId: ficha?.id, datos: d } : { datos: d, contrasena: clave })}
          className="h-8 rounded-lg bg-[#D7FF4F] px-3 text-xs font-bold text-[#151613] disabled:opacity-50">
          {enviando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Velo>
  );
}

const TONO_ESTADO: Record<string, string> = {
  "Finalizado Entregado": "bg-[rgba(86,227,164,.13)] text-[#56E3A4]",
  "Enviado a Reciclaje": "bg-[#2C2D29] text-[#D6D6D0]",
};

function HistoriaDialog({ nombre, historia, onCerrar }: { nombre: string; historia: OrdenDeHistoria[]; onCerrar: () => void }) {
  return (
    <Velo titulo={`Historia · ${nombre}`} onCerrar={onCerrar}>
      <ul className="max-h-[60vh] overflow-y-auto">
        {historia.map((o) => (
          <li key={o.id} className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-start gap-2 border-t border-[#2C2D29] py-2 first:border-t-0">
            <Link href={`/tecnicos/ordenes/${encodeURIComponent(o.id)}`} className="font-bold text-[#D7FF4F] hover:underline">{o.codigo}</Link>
            <span className="min-w-0 text-sm text-[#F0F0EC]">
              <span className="block truncate">{o.motivo || "—"}</span>
              <span className="text-xs text-[#B5B5AE]">{fecha(o.fecha)}{o.tipoRegreso ? ` · ${o.tipoRegreso}` : ""}</span>
            </span>
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${TONO_ESTADO[o.estado] ?? "bg-[rgba(120,183,255,.14)] text-[#9CCBFF]"}`}>{o.estado || "—"}</span>
          </li>
        ))}
      </ul>
    </Velo>
  );
}
