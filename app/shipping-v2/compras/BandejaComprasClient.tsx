"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FilaBandeja } from "@/lib/compras/servidor";

// Bandeja "Por comprar" (auditoría ops, Fase 2). Pantalla de uso diario de
// quien compra (Maritza, Alexis): filas compactas agrupadas por proveedor
// sugerido, para comprar juntas las cosas del mismo proveedor (como Odoo).
//   · Comprar: abre Registrar compra con las filas marcadas (la única
//     pantalla de compras). Sin anticipo completo pide confirmar (decisión A).
//   · Ya la tenemos: aparta un artículo que ya existe (SKU).
//   · Cancelar: con motivo; la línea de la orden queda avisada.

type Pestana = "por_comprar" | "en_camino" | "llego" | "cerradas";
const PESTANAS: Array<{ id: Pestana; label: string }> = [
  { id: "por_comprar", label: "Por comprar" },
  { id: "en_camino", label: "Comprado" },
  { id: "llego", label: "Llegó" },
  { id: "cerradas", label: "Entregado / cancelado" },
];

function pestanaDe(f: FilaBandeja): Pestana {
  const c = f.situacion.clave;
  if (c === "esperando_pago" || c === "falta_pedir") return "por_comprar";
  if (c === "falta_pagar_proveedor" || c === "en_camino") return "en_camino";
  if (c === "llego") return "llego";
  return "cerradas";
}

const TONO: Record<string, string> = {
  exito: "border-[#56e3a4]/40 text-[#56e3a4]",
  aviso: "border-[#f0c75e]/45 text-[#f0c75e]",
  peligro: "border-[#ff5a4f]/45 text-[#ff5a4f]",
  info: "border-[#78b7ff]/40 text-[#78b7ff]",
  neutro: "border-[#3A3A36] text-[#A7A7A7]",
};

const dinero = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

function Anticipo({ f }: { f: FilaBandeja }) {
  const c = f.cobertura;
  if (!c || c.tipo === "cubierta") return <span className="text-[11px] font-semibold text-[#56e3a4]" title="El cliente ya pagó este repuesto">Pagado ✓</span>;
  if (c.tipo === "parcial") return <span className="text-[11px] font-semibold text-[#f0c75e]" title="Anticipo parcial">{dinero(c.pagado)} de {dinero(c.precio)}</span>;
  return <span className="text-[11px] font-semibold text-[#f0c75e]">Sin anticipo</span>;
}

export function BandejaComprasClient({ filas, error }: { filas: FilaBandeja[]; error: string }) {
  const router = useRouter();
  const [pestana, setPestana] = useState<Pestana>("por_comprar");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState<string[] | null>(null);
  const [accion, setAccion] = useState<{ id: string; tipo: "asignar" | "cancelar"; valor: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const conteo = useMemo(() => {
    const c: Record<Pestana, number> = { por_comprar: 0, en_camino: 0, llego: 0, cerradas: 0 };
    for (const f of filas) c[pestanaDe(f)]++;
    return c;
  }, [filas]);

  const visibles = filas.filter((f) => pestanaDe(f) === pestana);
  // Agrupadas por proveedor sugerido; lo más viejo primero dentro de cada grupo.
  const grupos = useMemo(() => {
    const m = new Map<string, FilaBandeja[]>();
    for (const f of visibles) {
      const k = f.proveedorNombre || "Sin proveedor sugerido";
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return [...m.entries()]
      .map(([prov, lista]) => [prov, lista.sort((a, b) => (a.fechaAprobacion || "").localeCompare(b.fechaAprobacion || ""))] as const)
      .sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [visibles]);

  const marcadasFilas = filas.filter((f) => marcadas.has(f.id));

  function alternar(id: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function comprar(confirmado = false) {
    const sinAnticipo = marcadasFilas.filter((f) => f.cobertura && f.cobertura.tipo !== "cubierta");
    if (sinAnticipo.length && !confirmado) {
      setConfirmar(sinAnticipo.map((f) => `${f.descripcion} · ${f.para}`));
      return;
    }
    router.push(`/shipping-v2/items/nuevo?solicitudes=${marcadasFilas.map((f) => f.id).join(",")}`);
  }

  async function enviarAccion() {
    if (!accion) return;
    setEnviando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/shipping-v2/compras/${accion.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accion.tipo === "asignar" ? { accion: "asignar", sku: accion.valor } : { accion: "cancelar", motivo: accion.valor }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      setAviso({ tipo: "ok", texto: accion.tipo === "asignar" ? `Apartado ${j.data?.sku ?? ""} para su cliente.` : "Solicitud cancelada." });
      setAccion(null);
      router.refresh();
    } catch (e) {
      setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo guardar." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-[#2A2B26] bg-[#161714] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-black text-white">Por comprar</h1>
        <div role="tablist" className="flex max-w-full gap-0.5 overflow-x-auto rounded-full border border-[#2A2B26] bg-[#1E1F19] p-0.5">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pestana === p.id}
              onClick={() => { setPestana(p.id); setMarcadas(new Set()); setAccion(null); }}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition ${pestana === p.id ? "bg-[#D7FF4F] text-[#10110E]" : "text-[#C9C9C3] hover:text-white"}`}
            >
              {p.label}
              <span className={`ml-1 tabular-nums ${pestana === p.id ? "text-[#10110E]/60" : "text-[#8F908A]"}`}>{conteo[p.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg border border-[#ff5a4f]/40 bg-[#ff5a4f]/10 px-3 py-2 text-sm text-[#ff5a4f]">{error}</p>}
      {aviso && (
        <p className={`rounded-lg border px-3 py-2 text-sm animate-[sg-entrada_180ms_ease-out] ${aviso.tipo === "ok" ? "border-[#56e3a4]/40 bg-[#56e3a4]/10 text-[#56e3a4]" : "border-[#ff5a4f]/40 bg-[#ff5a4f]/10 text-[#ff5a4f]"}`}>{aviso.texto}</p>
      )}

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#2A2B26] px-4 py-6 text-sm text-[#8F908A]">
          {pestana === "por_comprar" ? "No hay nada por comprar." : "Nada aquí."}
        </p>
      ) : (
        <div key={pestana} className="space-y-3">
          {grupos.map(([prov, lista]) => (
            <div key={prov} className="overflow-hidden rounded-lg border border-[#2A2B26]">
              <div className="flex items-center justify-between bg-[#1E1F19] px-3 py-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-[#C9C9C3]">{prov} <span className="text-[#8F908A]">· {lista.length}</span></span>
                {pestana === "por_comprar" && (
                  <button
                    type="button"
                    onClick={() => setMarcadas((m) => { const n = new Set(m); const todas = lista.every((f) => n.has(f.id)); lista.forEach((f) => (todas ? n.delete(f.id) : n.add(f.id))); return n; })}
                    className="text-[11px] font-semibold text-[#D7FF4F] hover:underline"
                  >
                    {lista.every((f) => marcadas.has(f.id)) ? "Quitar todas" : "Marcar todas"}
                  </button>
                )}
              </div>
              <ul className="divide-y divide-[#2A2B26]">
                {lista.map((f, i) => (
                  <li key={f.id} className="animate-[sg-entrada_180ms_ease-out_both]" style={{ animationDelay: `${Math.min(i, 10) * 18}ms` }}>
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[22px_minmax(0,2fr)_minmax(0,1.3fr)_90px_90px_100px_auto]">
                      {pestana === "por_comprar" ? (
                        <input type="checkbox" checked={marcadas.has(f.id)} onChange={() => alternar(f.id)} aria-label={`Marcar ${f.descripcion}`} className="h-4 w-4 accent-[#D7FF4F]" />
                      ) : <span className="text-[10px] text-[#6F706A]">{f.codigo.replace("SOL-", "")}</span>}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white" title={f.descripcion}>
                          {f.cantidad > 1 ? <span className="text-[#D7FF4F]">{f.cantidad}× </span> : null}{f.descripcion}
                        </p>
                        <p className="truncate text-[11px] text-[#8F908A] sm:hidden">
                          {f.para} · {dinero(f.costoCotizado)}
                        </p>
                      </div>
                      <div className="hidden min-w-0 sm:block">
                        {f.paraHref ? (
                          <Link href={f.paraHref} className="block truncate text-xs font-semibold text-[#78b7ff] hover:underline" title={f.equipo || f.para}>{f.para}</Link>
                        ) : <span className="block truncate text-xs text-[#C9C9C3]">{f.para}</span>}
                        {f.equipo ? <span className="block truncate text-[10.5px] text-[#6F706A]">{f.equipo}</span> : null}
                      </div>
                      <span className="hidden text-right text-xs tabular-nums text-[#C9C9C3] sm:block" title="Costo cotizado al proveedor">{dinero(f.costoCotizado)}</span>
                      <span className="hidden text-right text-xs tabular-nums text-white sm:block" title="Precio que aprobó el cliente (por unidad)">{dinero(f.precioCliente)}</span>
                      <span className="hidden sm:block">{pestana === "por_comprar" ? <Anticipo f={f} /> : f.sku ? <span className="text-[11px] font-semibold text-[#C9C9C3]">{f.sku}</span> : null}</span>
                      <div className="flex items-center justify-end gap-1.5">
                        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${TONO[f.situacion.tono] ?? TONO.neutro}`}>
                          {pestana === "por_comprar" && f.situacion.clave === "falta_pedir" ? `${f.situacion.dias} d` : f.situacion.texto}
                        </span>
                        {pestana === "por_comprar" && (
                          <>
                            <button type="button" onClick={() => { setAviso(null); setAccion({ id: f.id, tipo: "asignar", valor: "" }); }} className="whitespace-nowrap rounded-full border border-[#2A2B26] px-2 py-0.5 text-[10.5px] font-semibold text-[#C9C9C3] hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]" title="El repuesto ya existe en la tienda o viene en camino: apártalo">
                              Ya la tenemos
                            </button>
                            <button type="button" onClick={() => { setAviso(null); setAccion({ id: f.id, tipo: "cancelar", valor: "" }); }} className="rounded-full px-1.5 py-0.5 text-[10.5px] text-[#6F706A] hover:text-[#ff5a4f]" title="Cancelar esta compra">
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {accion?.id === f.id && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-[#2A2B26] bg-[#1E1F19] px-3 py-2 animate-[sg-entrada_160ms_ease-out]">
                        <input
                          autoFocus
                          value={accion.valor}
                          onChange={(e) => setAccion({ ...accion, valor: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter" && accion.valor.trim()) void enviarAccion(); if (e.key === "Escape") setAccion(null); }}
                          placeholder={accion.tipo === "asignar" ? "SKU del artículo (ej. REP-000038)" : "Motivo de la cancelación"}
                          className="h-8 min-w-[14rem] flex-1 rounded-md border border-[#2A2B26] bg-[#10110E] px-2.5 text-sm text-white outline-none focus:border-[#D7FF4F]/60"
                        />
                        <button type="button" disabled={enviando || !accion.valor.trim()} onClick={() => void enviarAccion()}
                          className={`rounded-full px-3 py-1 text-xs font-bold disabled:opacity-40 ${accion.tipo === "asignar" ? "bg-[#D7FF4F] text-[#10110E]" : "border border-[#ff5a4f]/60 text-[#ff5a4f]"}`}>
                          {enviando ? "Guardando…" : accion.tipo === "asignar" ? "Apartar" : "Cancelar compra"}
                        </button>
                        <button type="button" onClick={() => setAccion(null)} className="text-xs text-[#8F908A] hover:text-white">Volver</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {pestana === "por_comprar" && marcadasFilas.length > 0 && (
        <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D7FF4F]/40 bg-[#1E1F19]/95 px-3 py-2 shadow-2xl backdrop-blur animate-[sg-entrada_160ms_ease-out]">
          <span className="text-sm text-[#C9C9C3]">
            {marcadasFilas.length} marcada{marcadasFilas.length === 1 ? "" : "s"} · cotizado {dinero(marcadasFilas.reduce((s, f) => s + (f.costoCotizado ?? 0) * Math.max(1, f.cantidad), 0))}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMarcadas(new Set())} className="rounded-full px-3 py-1.5 text-xs text-[#8F908A] hover:text-white">Quitar</button>
            <button type="button" onClick={() => comprar()} className="rounded-full bg-[#D7FF4F] px-4 py-1.5 text-sm font-black text-[#10110E] hover:brightness-105">
              Comprar {marcadasFilas.length}
            </button>
          </div>
        </div>
      )}

      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 animate-[sg-velo_160ms_ease-out]">
          <div className="w-full max-w-[460px] rounded-xl border border-[#2A2B26] bg-[#161714] p-4 shadow-2xl animate-[sg-modal_200ms_ease-out]">
            <h2 className="text-base font-black text-white">Sin anticipo completo</h2>
            <ul className="mt-2 space-y-1 text-sm text-[#f0c75e]">
              {confirmar.map((t) => <li key={t}>· {t}</li>)}
            </ul>
            <p className="mt-2 text-xs text-[#8F908A]">El cliente todavía no pagó el precio completo de {confirmar.length === 1 ? "este repuesto" : "estos repuestos"}.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmar(null)} className="rounded-full border border-[#2A2B26] px-3 py-1.5 text-xs text-[#C9C9C3]">Volver</button>
              <button type="button" onClick={() => { setConfirmar(null); comprar(true); }} className="rounded-full bg-[#f0c75e] px-4 py-1.5 text-xs font-black text-[#10110E]">Comprar igual</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
