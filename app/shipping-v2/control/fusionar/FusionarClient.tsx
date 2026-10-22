"use client";

// Fusionar SKU (punto 10c-3, solo Administrador). Se agregan los productos
// repetidos, se elige cuál queda como principal y el sistema muestra antes de
// confirmar qué va a cambiar o por qué no se puede.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Merge, X } from "lucide-react";
import type { ResultadoFusion, VistaFusion } from "@/lib/shipping-v2/airtable";
import { prepareShippingV2ItemSearchIndex, searchShippingV2ItemIndex } from "@/lib/shipping-v2/item-search";
import type { ShippingV2ItemSearchEntry } from "@/types/shipping-v2";

const API = "/api/shipping-v2/control/fusion";
const botonPrincipal = "inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#D7FF4F] px-3 text-[12.5px] font-bold text-[#141510] hover:bg-[#E4FF7A] disabled:opacity-50";
const dinero = (v: number) => `$${v.toFixed(2).replace(".", ",")}`;

function rangoCosto(min: number | null, max: number | null) {
  if (min === null || max === null) return "—";
  return min === max ? dinero(min) : `${dinero(min)}–${dinero(max)}`;
}

export function FusionarClient({ skusIniciales }: { skusIniciales: string[] }) {
  const [skus, setSkus] = useState<string[]>(skusIniciales);
  const [principal, setPrincipal] = useState("");
  const [vista, setVista] = useState<VistaFusion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [indice, setIndice] = useState<ReturnType<typeof prepareShippingV2ItemSearchIndex> | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [fusionando, setFusionando] = useState(false);
  const [hecho, setHecho] = useState<ResultadoFusion | null>(null);
  const pedido = useRef(0);

  // Buscador (el mismo índice de Artículos).
  useEffect(() => {
    let vivo = true;
    fetch("/api/shipping-v2/items/search-index", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setIndice(prepareShippingV2ItemSearchIndex((j.items ?? []) as ShippingV2ItemSearchEntry[])))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  // Vista previa cada vez que cambia la lista o el principal.
  useEffect(() => {
    try {
      window.history.replaceState(null, "", skus.length ? `?skus=${skus.join(",")}` : window.location.pathname);
    } catch {
      /* solo recuerda la lista */
    }
    if (!skus.length) {
      setVista(null);
      return;
    }
    const n = ++pedido.current;
    setCargando(true);
    setConfirmar(false);
    const qs = new URLSearchParams({ skus: skus.join(","), ...(principal ? { principal } : {}) });
    fetch(`${API}?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (n !== pedido.current) return;
        if (!j.success) throw new Error(j.error || "No se pudo preparar.");
        setVista(j.data);
        setError("");
        if (!principal && j.data.principal) setPrincipal(j.data.principal);
      })
      .catch((e) => n === pedido.current && setError(e instanceof Error ? e.message : "No se pudo preparar."))
      .finally(() => n === pedido.current && setCargando(false));
  }, [skus, principal]);

  const resultados = useMemo(() => {
    if (!indice || texto.trim().length < 2) return [];
    const vistos = new Set(skus);
    const salida: ShippingV2ItemSearchEntry[] = [];
    for (const r of searchShippingV2ItemIndex(indice, texto, { limit: 40 }).results) {
      const sku = r.item.sku.toUpperCase();
      if (vistos.has(sku)) continue;
      vistos.add(sku);
      salida.push(r.item);
      if (salida.length >= 8) break;
    }
    return salida;
  }, [indice, texto, skus]);

  function agregar(sku: string) {
    const s = sku.trim().toUpperCase();
    if (!s || skus.includes(s)) return;
    setSkus((l) => [...l, s]);
    setTexto("");
    setHecho(null);
  }

  function quitar(sku: string) {
    setSkus((l) => l.filter((x) => x !== sku));
    if (principal === sku) setPrincipal("");
    setHecho(null);
  }

  async function fusionar() {
    setFusionando(true);
    setError("");
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skus, principal }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "No se pudo fusionar.");
      setHecho(j.data);
      setConfirmar(false);
      setSkus([j.data.principal]);
      setPrincipal(j.data.principal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo fusionar.");
      setConfirmar(false);
    } finally {
      setFusionando(false);
    }
  }

  const plan = vista?.plan ?? null;
  const absorbidos = (vista?.productos ?? []).filter((p) => p.sku !== principal).map((p) => p.sku);
  const columnas = "grid-cols-[22px_minmax(0,1fr)_auto_28px] md:grid-cols-[22px_104px_minmax(0,1fr)_170px_76px_118px_70px_70px_28px]";

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[16px] font-bold text-[#F5F5F5]">Fusionar SKU</h1>
        <span className="text-[12px] text-[#8F908A]" title="Cada registro conserva su costo, su compra y su caja; facturas y recibos no cambian. El código viejo sigue funcionando al escanear.">
          Cada registro conserva su costo · los documentos no cambian
        </span>
        <Link href="/shipping-v2/control?vista=codigos" className="ml-auto text-[12px] font-semibold text-[#D7FF4F] hover:underline">Cambios de código</Link>
      </div>

      <div className="relative">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const exacto = resultados.find((r) => r.sku.toUpperCase() === texto.trim().toUpperCase());
              agregar(exacto?.sku ?? resultados[0]?.sku ?? texto);
            }
            if (e.key === "Escape") setTexto("");
          }}
          placeholder="Agregar por SKU, serie o nombre"
          aria-label="Agregar producto"
          autoComplete="off"
          className="h-10 w-full rounded-xl border border-[#3A3B35] bg-[#11120F] px-3.5 text-[13.5px] text-[#F5F5F5] placeholder:text-[#77786F] focus:border-[#D7FF4F]/60 focus:outline-none"
        />
        {resultados.length ? (
          <div className="absolute left-0 right-0 top-11 z-20 overflow-hidden rounded-xl border border-[#3A3B35] bg-[#171814] shadow-xl shadow-black/40 animate-[sg-entrada_150ms_ease-out]">
            {resultados.map((i) => (
              <button key={i.id} type="button" onClick={() => agregar(i.sku)} className="flex w-full items-baseline gap-2.5 px-3 py-1.5 text-left text-[12.5px] hover:bg-[#D7FF4F]/[0.07]">
                <span className="w-[104px] shrink-0 font-mono font-semibold text-[#D7FF4F]">{i.sku}</span>
                <span className="min-w-0 flex-1 truncate text-[#EDEDE7]">{i.nombre}</span>
                <span className="shrink-0 text-[12px] text-[#8F908A]">{[i.categoria, i.estado].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] text-[12.5px]">
        <div className={`hidden ${columnas} gap-2.5 border-b border-[#30312D] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] md:grid`}>
          <span title="Principal" /><span>SKU</span><span>Nombre</span><span>Categoría</span><span className="text-right">En tienda</span><span className="text-right">Costo c/u</span><span className="text-right">Ventas</span><span className="text-right">Anuncios</span><span />
        </div>
        {vista?.productos.length ? (
          vista.productos.map((p) => {
            const esPrincipal = p.sku === principal;
            return (
              <div
                key={p.sku}
                className={`grid ${columnas} items-center gap-x-2.5 gap-y-0.5 border-b border-[#252622] px-3 py-1.5 transition-colors duration-300 last:border-b-0 animate-[sg-entrada_200ms_ease-out] ${esPrincipal ? "bg-[#D7FF4F]/[0.06] shadow-[inset_3px_0_0_#D7FF4F]" : ""}`}
              >
                <input type="radio" name="principal" checked={esPrincipal} onChange={() => setPrincipal(p.sku)} disabled={fusionando} aria-label={`Principal ${p.sku}`} className="h-3.5 w-3.5 accent-[#D7FF4F]" />
                <span className="hidden font-mono font-semibold text-[#EDEDE7] md:block">{p.sku}</span>
                <span className="min-w-0">
                  <span className="font-mono font-semibold text-[#EDEDE7] md:hidden">{p.sku} · </span>
                  <span className="text-[#C9CAC1]">{p.nombre}</span>
                  {esPrincipal ? <span className="ml-1.5 rounded bg-[#D7FF4F]/15 px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-[#E9FF9E]">principal</span> : null}
                </span>
                <span className="hidden truncate text-[#B4B5AC] md:block">{[p.categoria, p.condicion].filter(Boolean).join(" · ")}</span>
                <span className={`text-right ${p.enTienda ? "font-semibold text-[#EDEDE7]" : "text-[#8F908A]"}`} title={p.estados.join(", ")}>
                  {p.enTienda || (p.estados[0] ? `0 · ${p.estados[0].toLowerCase()}` : "0")}
                </span>
                <span className="hidden text-right text-[#B4B5AC] md:block">{rangoCosto(p.costoMin, p.costoMax)}</span>
                <span className="hidden text-right text-[#8F908A] md:block">{p.documentos || "—"}</span>
                <span className="hidden text-right text-[#8F908A] md:block">{p.anuncios || "—"}</span>
                <button type="button" onClick={() => quitar(p.sku)} disabled={fusionando} aria-label={`Quitar ${p.sku}`} className="flex justify-end text-[#77786F] hover:text-[#FFB07A]">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            );
          })
        ) : (
          <p className="px-3 py-6 text-center text-[#8F908A]">{cargando ? <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden="true" /> : "Agrega los productos que son el mismo."}</p>
        )}
      </div>

      {vista?.noEncontrados.length ? <p className="text-[12px] text-[#FFB07A]">No existe: {vista.noEncontrados.join(", ")}</p> : null}

      {hecho ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#7BE495]/30 bg-[#7BE495]/[0.08] px-3 py-2 text-[12.5px] animate-[sg-entrada_220ms_ease-out]">
          <Check className="h-5 w-5 text-[#9FEFB3]" aria-hidden="true" />
          <span className="font-semibold text-[#F5F5F5]">Fusionado en {hecho.principal}</span>
          <span className="text-[#B4B5AC]">
            {hecho.movidos} registro{hecho.movidos === 1 ? "" : "s"} movido{hecho.movidos === 1 ? "" : "s"}
            {hecho.etiquetas ? ` · ${hecho.etiquetas} etiqueta${hecho.etiquetas === 1 ? "" : "s"} por reimprimir` : " · sin etiquetas por reimprimir"}
            {hecho.anuncios ? ` · ${hecho.anuncios} anuncio${hecho.anuncios === 1 ? "" : "s"} por corregir` : ""}
          </span>
          <Link href="/shipping-v2/control?vista=codigos" className="ml-auto text-[12px] font-semibold text-[#D7FF4F] hover:underline">Ver en Cambios de código</Link>
        </div>
      ) : null}

      {!hecho && skus.length >= 2 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto min-w-0 text-[12px]">
            {cargando ? (
              <span className="inline-flex items-center gap-1.5 text-[#8F908A]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Revisando…</span>
            ) : error ? (
              <span className="inline-flex items-center gap-1.5 text-[#FFB07A]"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</span>
            ) : plan && !plan.ok ? (
              <span className="inline-flex items-center gap-1.5 text-[#FFB07A]"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{plan.motivo}</span>
            ) : plan?.ok ? (
              <span className="text-[#C9CAC1]">
                <span className="font-mono">{absorbidos.join(", ")}</span> → <span className="font-mono font-semibold text-[#EDEDE7]">{principal}</span>
                <span className="text-[#8F908A]"> · {plan.registros} registro{plan.registros === 1 ? "" : "s"} · {plan.etiquetas ? `${plan.etiquetas} etiqueta${plan.etiquetas === 1 ? "" : "s"} por reimprimir` : "sin etiquetas por reimprimir"}</span>
                {plan.avisos.length ? <span className="block text-[#FFC857]">{plan.avisos.join(" ")}</span> : null}
              </span>
            ) : null}
          </span>
          {confirmar ? (
            <span className="flex items-center gap-2 animate-[sg-entrada_180ms_ease-out]">
              <span className="text-[12px] text-[#C9CAC1]">No se deshace con un clic. ¿Fusionar?</span>
              <button type="button" onClick={() => void fusionar()} disabled={fusionando} className={botonPrincipal}>
                {fusionando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                {fusionando ? "Fusionando…" : "Sí, fusionar"}
              </button>
              {!fusionando ? <button type="button" onClick={() => setConfirmar(false)} className="text-[12px] text-[#8F908A] hover:text-[#EDEDE7]">No</button> : null}
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmar(true)} disabled={cargando || !plan?.ok} className={botonPrincipal}>
              <Merge className="h-3.5 w-3.5" aria-hidden="true" />Fusionar en {principal || "…"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
