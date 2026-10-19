"use client";

// Pestaña Control → Conteos (punto 10c-2): la lista de conteos físicos y el
// panel para empezar uno nuevo por categorías.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import type { ShippingV2Conteo } from "@/lib/shipping-v2/airtable";

type Resumen = { categorias: Array<{ nombre: string; cantidad: number }>; activos: number };

const ESTADO: Record<ShippingV2Conteo["estado"], { texto: string; clase: string }> = {
  Contando: { texto: "Contando", clase: "border-[#D7FF4F]/40 bg-[#D7FF4F]/10 text-[#E9FF9E]" },
  Terminado: { texto: "Por revisar", clase: "border-[#FF914D]/40 bg-[#FF914D]/10 text-[#FFB07A]" },
  Aplicado: { texto: "Aplicado", clase: "border-[#7BE495]/35 bg-[#7BE495]/10 text-[#9FEFB3]" },
  Cancelado: { texto: "Cancelado", clase: "border-[#3A3B35] bg-[#151515] text-[#8F908A]" },
};

const chip = (activo: boolean) =>
  `h-7 rounded-lg border px-2.5 text-[12px] font-semibold ${activo ? "border-[#D7FF4F] bg-[#D7FF4F]/10 text-[#F5F5F5]" : "border-[#3A3B35] bg-[#151515] text-[#B4B5AC] hover:border-[#D7FF4F]/40"}`;

function fecha(valor?: string) {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-EC", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function hoyCorto() {
  return new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "short" }).replace(".", "");
}

export function ConteosLista({ onAbiertos }: { onAbiertos?: (n: number) => void }) {
  const router = useRouter();
  const [conteos, setConteos] = useState<ShippingV2Conteo[] | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [activos, setActivos] = useState(false);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/shipping-v2/control/conteos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (!j.success) throw new Error(j.error || "No se pudo cargar.");
        setConteos(j.data.conteos);
        setResumen(j.data.resumen);
        onAbiertos?.(j.data.conteos.filter((c: ShippingV2Conteo) => c.estado === "Contando" || c.estado === "Terminado").length);
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar."));
    return () => {
      vivo = false;
    };
  }, [onAbiertos]);

  const total = useMemo(() => (resumen ? resumen.categorias.reduce((s, c) => s + c.cantidad, 0) : 0), [resumen]);
  const elegidos = useMemo(() => {
    if (!resumen) return 0;
    const base = categorias.length ? resumen.categorias.filter((c) => categorias.includes(c.nombre)).reduce((s, c) => s + c.cantidad, 0) : total;
    return base + (activos ? resumen.activos : 0);
  }, [resumen, categorias, activos, total]);

  // "Laptop contado hace 16 días": el último conteo terminado que cubrió lo elegido.
  const ultimo = useMemo(() => {
    if (!conteos) return "";
    const cubre = (c: ShippingV2Conteo) =>
      (c.estado === "Terminado" || c.estado === "Aplicado") &&
      (!c.categorias.length || (categorias.length > 0 && categorias.every((x) => c.categorias.includes(x))));
    const c = conteos.find(cubre);
    if (!c) return categorias.length || conteos.length ? "Nunca contado" : "";
    const dias = Math.floor((Date.now() - new Date(c.fin || c.inicio).getTime()) / 86400000);
    return `Último conteo ${dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`}`;
  }, [conteos, categorias]);

  const nombreSugerido = `${categorias.length ? categorias.join(", ") : "Todo"}${activos ? " + activos" : ""} · ${hoyCorto()}`;

  function alternar(c: string) {
    setCategorias((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));
  }

  async function empezar() {
    setCreando(true);
    setError("");
    try {
      const r = await fetch("/api/shipping-v2/control/conteos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim() || nombreSugerido, categorias, incluyeActivos: activos }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "No se pudo crear el conteo.");
      router.push(`/shipping-v2/control/conteo/${j.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el conteo.");
      setCreando(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {error ? <span className="text-[12px] text-[#FFB07A]">{error}</span> : null}
        <button
          type="button"
          onClick={() => setNuevo((v) => !v)}
          aria-expanded={nuevo}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#D7FF4F] px-3 text-[12.5px] font-bold text-[#141510] hover:bg-[#E4FF7A]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />Nuevo conteo
        </button>
      </div>

      {nuevo ? (
        <div className="space-y-2 rounded-xl border border-[#30312D] bg-[#171814] p-3">
          {resumen ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[12px] font-semibold text-[#8F908A]" title="Lo que está en la tienda. Lo que viene en camino no se cuenta.">Qué contar</span>
                <button type="button" aria-pressed={!categorias.length} onClick={() => setCategorias([])} className={chip(!categorias.length)}>
                  Todo · {total}
                </button>
                {resumen.categorias.map((c) => (
                  <button key={c.nombre} type="button" aria-pressed={categorias.includes(c.nombre)} onClick={() => alternar(c.nombre)} className={chip(categorias.includes(c.nombre))}>
                    {c.nombre} · {c.cantidad}
                  </button>
                ))}
                {resumen.activos ? (
                  <button type="button" aria-pressed={activos} onClick={() => setActivos((v) => !v)} className={chip(activos)} title="Lo que usa la tienda y no vende">
                    + Activos de la tienda · {resumen.activos}
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder={nombreSugerido}
                  aria-label="Nombre del conteo"
                  className="h-8 w-full max-w-xs rounded-lg border border-[#3A3B35] bg-[#11120F] px-2.5 text-[12.5px] text-[#EDEDE7] placeholder:text-[#77786F] focus:border-[#D7FF4F]/60 focus:outline-none"
                />
                <span className="text-[12px] text-[#8F908A]">
                  {elegidos} por contar{ultimo ? ` · ${ultimo}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => void empezar()}
                  disabled={creando || !elegidos}
                  className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#D7FF4F] px-3 text-[12.5px] font-bold text-[#141510] hover:bg-[#E4FF7A] disabled:opacity-50"
                >
                  {creando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  Empezar a contar
                </button>
              </div>
            </>
          ) : (
            <p className="flex items-center gap-2 text-[12.5px] text-[#8F908A]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Cargando…</p>
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] text-[12.5px]">
        <div className="hidden grid-cols-[minmax(0,1fr)_110px_minmax(0,220px)_128px_110px] gap-2.5 border-b border-[#30312D] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] md:grid">
          <span>Conteo</span><span>Estado</span><span>Quién</span><span>Empezó</span><span />
        </div>
        {conteos === null ? (
          <p className="flex items-center justify-center gap-2 px-3 py-6 text-[#8F908A]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Cargando…</p>
        ) : conteos.length ? (
          conteos.map((c) => {
            const e = ESTADO[c.estado];
            const quien = c.estado === "Contando" ? c.creadoPor : [c.creadoPor, c.terminadoPor].filter((x, i, l) => x && l.indexOf(x) === i).join(", ");
            return (
              <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 border-b border-[#252622] px-3 py-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_110px_minmax(0,220px)_128px_110px]">
                <span className="min-w-0 truncate font-semibold text-[#EDEDE7]" title={c.categorias.join(", ") || "Todo"}>{c.nombre}</span>
                <span><span className={`inline-flex h-6 items-center rounded-md border px-2 text-[11.5px] font-semibold ${e.clase}`}>{e.texto}</span></span>
                <span className="hidden truncate text-[#B4B5AC] md:block">{quien}</span>
                <span className="hidden text-[#8F908A] md:block">{fecha(c.inicio)}</span>
                <span className="col-span-2 text-right md:col-span-1">
                  <Link href={`/shipping-v2/control/conteo/${c.id}`} className="text-[12px] font-semibold text-[#D7FF4F] hover:underline">
                    {c.estado === "Contando" ? "Seguir contando" : c.estado === "Terminado" ? "Revisar" : "Ver"}
                  </Link>
                </span>
              </div>
            );
          })
        ) : (
          <p className="px-3 py-6 text-center text-[#8F908A]">Todavía no hay conteos.</p>
        )}
      </div>
    </div>
  );
}
