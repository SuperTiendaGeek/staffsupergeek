"use client";

// Pestaña Control (punto 10c-1): revisión de inventario. Lista compacta de
// asuntos con filtros por grupo, "Revisar ahora", "Abrir" y "Está bien" con
// motivo. Conteos, Fusionar SKU y Cambios de código llegan en 10c-2 y 10c-3.

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { GRUPO_TIPO, TIPOS_ASUNTO, type TipoAsunto } from "@/lib/shipping-v2/revision-inventario";
import type { ShippingV2AsuntoRevision } from "@/lib/shipping-v2/airtable";

const TODOS = "Todos";
const botonClass = "inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-2.5 text-[12px] font-semibold text-[#EDEDE7] transition hover:border-[#D7FF4F]/50 disabled:opacity-50";

function fechaHora(valor?: string) {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-EC", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** A dónde lleva "Abrir" según el tipo. */
function enlaceAsunto(a: ShippingV2AsuntoRevision): string | null {
  const idClave = a.clave.split("|").pop() ?? "";
  if (a.tipo === "Falta respaldo") return "/shipping-v2/pagos";
  if (a.tipo === "Novedad sin movimiento") return "/shipping-v2/novedades";
  if (a.tipo === "Caja cerrada sin recibir" && idClave.startsWith("rec")) return `/shipping-v2/packings/${idClave}`;
  return a.itemIds[0] ? `/shipping-v2/items/${a.itemIds[0]}` : null;
}

/** El texto sin el "SKU · " del principio (el SKU tiene su columna). */
function textoAsunto(a: ShippingV2AsuntoRevision) {
  return a.sku && a.asunto.startsWith(`${a.sku} · `) ? a.asunto.slice(a.sku.length + 3) : a.asunto;
}

export function ShippingV2ControlClient({ asuntosIniciales }: { asuntosIniciales: ShippingV2AsuntoRevision[] }) {
  const [abiertos, setAbiertos] = useState(asuntosIniciales);
  const [resueltos, setResueltos] = useState<ShippingV2AsuntoRevision[] | null>(null);
  const [verResueltos, setVerResueltos] = useState(false);
  const [grupo, setGrupo] = useState(TODOS);
  const [busy, setBusy] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [motivoDe, setMotivoDe] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  const ultima = useMemo(() => abiertos.map((a) => a.ultimaRevision).sort().pop() ?? "", [abiertos]);
  // Por tipo (en el orden de importancia) y luego por SKU; los resueltos, del más reciente.
  const lista = useMemo(() => {
    if (verResueltos) return (resueltos ?? []).filter((a) => a.estado !== "Abierto").sort((a, b) => b.fechaResuelto.localeCompare(a.fechaResuelto));
    const orden = (t: string) => (TIPOS_ASUNTO as readonly string[]).indexOf(t);
    return [...abiertos].sort((a, b) => orden(a.tipo) - orden(b.tipo) || a.sku.localeCompare(b.sku));
  }, [verResueltos, resueltos, abiertos]);
  const grupos = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const a of lista) conteo.set(GRUPO_TIPO[a.tipo as TipoAsunto] ?? "Otros", (conteo.get(GRUPO_TIPO[a.tipo as TipoAsunto] ?? "Otros") ?? 0) + 1);
    return Array.from(conteo.entries()).sort((a, b) => b[1] - a[1]);
  }, [lista]);
  const visibles = grupo === TODOS ? lista : lista.filter((a) => (GRUPO_TIPO[a.tipo as TipoAsunto] ?? "Otros") === grupo);

  async function revisarAhora() {
    setBusy("revisar");
    setMensaje("");
    try {
      const response = await fetch("/api/shipping-v2/control/revision", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo revisar."));
      const { resumen, asuntos } = payload.data as { resumen: { nuevos: number; resueltos: number }; asuntos: ShippingV2AsuntoRevision[] };
      setAbiertos(asuntos);
      setResueltos(null);
      setMensaje(`${resumen.nuevos} nuevo${resumen.nuevos === 1 ? "" : "s"} · ${resumen.resueltos} resuelto${resumen.resueltos === 1 ? "" : "s"} solo${resumen.resueltos === 1 ? "" : "s"}`);
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy("");
    }
  }

  async function cambiarVista(ver: boolean) {
    setVerResueltos(ver);
    setGrupo(TODOS);
    if (!ver || resueltos) return;
    setBusy("resueltos");
    try {
      const response = await fetch("/api/shipping-v2/control/revision?resueltos=1");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo cargar."));
      setResueltos(payload.data as ShippingV2AsuntoRevision[]);
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy("");
    }
  }

  async function resolver(a: ShippingV2AsuntoRevision, estado: "Está bien" | "Abierto", texto = "") {
    setBusy(a.id);
    setMensaje("");
    try {
      const response = await fetch(`/api/shipping-v2/control/revision/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, motivo: texto }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo guardar."));
      const actualizado = payload.data as ShippingV2AsuntoRevision;
      if (estado === "Abierto") {
        setAbiertos((l) => [actualizado, ...l]);
        setResueltos((l) => (l ? l.filter((x) => x.id !== a.id) : l));
      } else {
        setAbiertos((l) => l.filter((x) => x.id !== a.id));
        setResueltos((l) => (l ? [actualizado, ...l] : l));
      }
      setMotivoDe(null);
      setMotivo("");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex overflow-hidden rounded-lg border border-[#3A3B35]">
          <button type="button" role="tab" aria-selected className="h-8 bg-[#D7FF4F] px-3 text-[12.5px] font-bold text-[#141510]">
            Revisión{abiertos.length ? ` · ${abiertos.length}` : ""}
          </button>
        </div>
        {mensaje ? <span className="text-[12px] text-[#C9CAC1]">{mensaje}</span> : null}
        <span className="ml-auto text-[12px] text-[#8F908A]">{ultima ? `Revisado ${fechaHora(ultima)}` : ""}</span>
        <button type="button" onClick={() => void revisarAhora()} disabled={Boolean(busy)} className={`${botonClass} h-8`}>
          {busy === "revisar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          Revisar ahora
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {[[TODOS, lista.length] as const, ...grupos].map(([g, n]) => (
          <button
            key={g}
            type="button"
            aria-pressed={grupo === g}
            onClick={() => setGrupo(g)}
            className={`h-7 rounded-lg border px-2.5 text-[12px] font-semibold ${grupo === g ? "border-[#D7FF4F] bg-[#D7FF4F]/10 text-[#F5F5F5]" : "border-[#3A3B35] bg-[#151515] text-[#B4B5AC]"}`}
          >
            {g} · {n}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-[#8F908A]">
          <input type="checkbox" checked={verResueltos} onChange={(e) => void cambiarVista(e.target.checked)} className="h-3.5 w-3.5 accent-[#D7FF4F]" />
          Ver resueltos
          {busy === "resueltos" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] text-[12.5px]">
        <div className="hidden grid-cols-[108px_minmax(0,1fr)_200px_190px] gap-2.5 border-b border-[#30312D] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] md:grid">
          <span>SKU</span><span>Qué pasa</span><span>{verResueltos ? "Cómo quedó" : "Sugerencia"}</span><span />
        </div>
        {visibles.length ? visibles.map((a) => {
          const enlace = enlaceAsunto(a);
          const conDetalle = Boolean(a.detalle);
          return (
            <div key={a.id} className="border-b border-[#252622] last:border-b-0">
              <div className="grid items-center gap-2.5 px-3 py-1.5 md:grid-cols-[108px_minmax(0,1fr)_200px_190px]">
                <span className="font-mono font-semibold">{a.sku || "—"}</span>
                <span className="min-w-0">
                  {textoAsunto(a)}
                  {conDetalle && a.tipo !== "Posible duplicado" && a.tipo !== "Falta respaldo" ? <span className="ml-1.5 font-semibold text-[#FFB07A]">({a.detalle})</span> : null}
                  {conDetalle && (a.tipo === "Posible duplicado" || a.tipo === "Falta respaldo") ? (
                    <button type="button" onClick={() => setExpandido((x) => (x === a.id ? null : a.id))} aria-expanded={expandido === a.id} className="ml-1 inline-flex align-middle text-[#8F908A] hover:text-[#F5F5F5]" aria-label="Ver detalle">
                      <ChevronDown className={`h-3.5 w-3.5 transition ${expandido === a.id ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
                <span className="text-[#B4B5AC]">
                  {verResueltos ? (
                    <span title={a.motivo}>{a.estado}{a.resueltoPor ? ` · ${a.resueltoPor}` : ""}{a.fechaResuelto ? ` · ${fechaHora(a.fechaResuelto)}` : ""}</span>
                  ) : a.sugerencia}
                </span>
                <span className="flex items-center justify-end gap-2">
                  {enlace ? <Link href={enlace} className="text-[12px] font-semibold text-[#D7FF4F] hover:underline">Abrir</Link> : null}
                  {verResueltos ? (
                    a.estado === "Está bien" ? (
                      <button type="button" onClick={() => void resolver(a, "Abierto")} disabled={busy === a.id} className={botonClass}>Reabrir</button>
                    ) : null
                  ) : (
                    <button type="button" onClick={() => { setMotivoDe(motivoDe === a.id ? null : a.id); setMotivo(""); }} className={botonClass} aria-expanded={motivoDe === a.id}>
                      Está bien
                    </button>
                  )}
                </span>
              </div>
              {expandido === a.id ? (
                <div className="whitespace-pre-line px-3 pb-2 font-mono text-[11.5px] text-[#B4B5AC]">{a.detalle}</div>
              ) : null}
              {verResueltos && a.motivo ? <div className="px-3 pb-2 text-[11.5px] text-[#8F908A]">{a.motivo}</div> : null}
              {motivoDe === a.id ? (
                <form
                  className="flex items-center gap-2 px-3 pb-2"
                  onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) void resolver(a, "Está bien", motivo); }}
                >
                  <input
                    autoFocus
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo"
                    aria-label="Motivo"
                    maxLength={500}
                    className="h-7 min-w-0 flex-1 rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 text-[12px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/60"
                  />
                  <button type="submit" disabled={busy === a.id || !motivo.trim()} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-2.5 text-[12px] font-bold text-[#141510] disabled:opacity-50">
                    {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Guardar
                  </button>
                </form>
              ) : null}
            </div>
          );
        }) : (
          <p className="px-3 py-6 text-center text-[12.5px] text-[#8F908A]">
            {verResueltos ? "Sin asuntos resueltos." : abiertos.length ? "Nada en este grupo." : "Todo en orden. Pulsa \"Revisar ahora\" para volver a revisar."}
          </p>
        )}
      </div>
    </div>
  );
}
