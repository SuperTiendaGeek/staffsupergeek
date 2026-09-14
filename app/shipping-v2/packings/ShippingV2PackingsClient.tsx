"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SHIPPING_V2_PACKING_ESTADOS, SHIPPING_V2_PACKING_TIPOS, type ShippingV2AccessPermissions, type ShippingV2Packing, type ShippingV2PackingReviewSummary, type ShippingV2Proveedor } from "@/types/shipping-v2";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import {
  formatShippingV2PackingBodegaProgress,
  formatShippingV2PackingReviewProgress,
  getShippingV2PackingFaseInfo,
  SHIPPING_V2_PACKING_FASES_ORDEN,
  type ShippingV2PackingFase,
} from "@/lib/shipping-v2/packing-lifecycle";

type Props = {
  packings: ShippingV2Packing[];
  proveedores: ShippingV2Proveedor[];
  error: string;
  permissions: ShippingV2AccessPermissions | null;
  providerName?: string;
  reviewSummaries?: Record<string, ShippingV2PackingReviewSummary>;
};

const ALL = "Todos";

function faseTone(fase: ShippingV2PackingFase) {
  if (fase === "preparacion") return "border-[#D7FF4F]/45 bg-[#D7FF4F]/12 text-[#D7FF4F]";
  if (fase === "en-camino") return "border-[#8B73FF]/35 bg-[#8B73FF]/10 text-[#C9BFFF]";
  if (fase === "en-bodega") return "border-[#4FC3FF]/35 bg-[#4FC3FF]/10 text-[#BDEAFF]";
  if (fase === "revision") return "border-[#F4E85B]/35 bg-[#F4E85B]/10 text-[#F4E85B]";
  if (fase === "cerrado") return "border-[#7BE495]/35 bg-[#7BE495]/10 text-[#9FEFB3]";
  if (fase === "cancelado") return "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]";
  return "border-[#3A3A36] bg-[#151515] text-[#A7A7A7]";
}

function hintTone(tono: "accion" | "espera" | "listo" | "alerta") {
  if (tono === "alerta") return "text-[#FFB07A]";
  if (tono === "accion") return "text-[#F5F5F5]";
  if (tono === "listo") return "text-[#9FEFB3]";
  return "text-[#A7A7A7]";
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium" }).format(date);
}

function display(value?: string | number | null) {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  return text || "—";
}

function formatWeight(peso: number | null | undefined) {
  if (peso === null || peso === undefined) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(peso)} kg`;
}

function Kpi({ label, value, hint, accent = false }: { label: string; value: number; hint?: string; accent?: boolean }) {
  return (
    <article className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-2 shadow-lg shadow-black/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</p>
          <p className={`mt-0.5 text-lg font-semibold leading-none tabular-nums xl:text-xl ${accent ? "text-[#9FEFB3]" : "text-[#D7FF4F]"}`}>{value}</p>
          {hint ? <p className="mt-0.5 truncate text-[11px] text-[#8F908A]">{hint}</p> : null}
        </div>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent ? "bg-[#9FEFB3]" : "bg-[#D7FF4F]"}`} />
      </div>
    </article>
  );
}

function ReviewCell({ summary }: { summary?: ShippingV2PackingReviewSummary }) {
  if (!summary) return <span className="text-[#8F908A]">—</span>;
  const { progress } = summary;
  if (progress.total === 0) return <span className="text-[#8F908A]">Sin artículos</span>;

  const done = progress.completo;
  return (
    <div className="min-w-[7.5rem]">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#2A2A28]">
          <div
            className={`h-full rounded-full ${done ? "bg-[#9FEFB3]" : "bg-[#D7FF4F]"}`}
            style={{ width: `${Math.max(progress.porcentaje, progress.revisados > 0 ? 6 : 0)}%` }}
          />
        </div>
        <span className={`text-[12px] font-semibold tabular-nums ${done ? "text-[#9FEFB3]" : "text-[#F5F5F5]"}`}>
          {formatShippingV2PackingReviewProgress(progress)}
        </span>
      </div>
      <p className={`mt-0.5 text-[11px] leading-4 ${progress.bodegaCompleta ? "text-[#9FEFB3]" : "text-[#A7A7A7]"}`}>
        Bodega: {formatShippingV2PackingBodegaProgress(progress)}
      </p>
      {progress.sinPublicacionAplicable > 0 ? (
        <p className="mt-0.5 text-[11px] leading-4 text-[#8F908A]">
          {progress.sinPublicacionAplicable} sin publicación aplicable
        </p>
      ) : null}
    </div>
  );
}

export function ShippingV2PackingsClient({ packings, proveedores, error, permissions, providerName, reviewSummaries = {} }: Props) {
  const [fase, setFase] = useState<ShippingV2PackingFase | typeof ALL>(ALL);
  const [estado, setEstado] = useState(ALL);
  const [tipo, setTipo] = useState(ALL);
  const [responsable, setResponsable] = useState(ALL);
  const canCreatePacking = permissions?.canCreatePacking !== false;
  const isProviderPortal = Boolean(providerName && permissions?.canCreatePacking === false);

  const enriched = useMemo(() => packings.map((packing) => ({
    packing,
    info: getShippingV2PackingFaseInfo(packing.estado),
    summary: reviewSummaries[packing.id],
  })), [packings, reviewSummaries]);

  const filtered = useMemo(() => enriched.filter(({ packing, info }) => {
    if (fase !== ALL && info.fase !== fase) return false;
    if (estado !== ALL && packing.estado !== estado) return false;
    if (tipo !== ALL && packing.tipo !== tipo) return false;
    if (responsable !== ALL && packing.proveedorResponsableId !== responsable) return false;
    return true;
  }), [enriched, estado, fase, responsable, tipo]);

  const fasesPresentes = useMemo(() => {
    const counts = new Map<ShippingV2PackingFase, { label: string; count: number }>();
    for (const { info } of enriched) {
      const current = counts.get(info.fase);
      if (current) current.count += 1;
      else counts.set(info.fase, { label: info.faseLabel, count: 1 });
    }
    return SHIPPING_V2_PACKING_FASES_ORDEN
      .filter((key) => counts.has(key))
      .map((key) => ({ fase: key, ...counts.get(key)! }));
  }, [enriched]);

  const kpis = useMemo(() => {
    const abiertos = enriched.filter(({ info }) => !info.terminado);
    return {
      total: enriched.length,
      cicloCerrado: enriched.filter(({ info }) => info.fase === "cerrado").length,
      listosParaCerrar: enriched.filter(({ summary }) => summary?.hint.listoParaCerrarCiclo).length,
      revisionPendiente: abiertos.filter(({ summary }) => (summary?.progress.pendientes ?? 0) > 0 && (summary?.progress.total ?? 0) > 0).length,
      enCamino: enriched.filter(({ info }) => info.fase === "en-camino" || info.fase === "preparacion").length,
      conNovedad: enriched.filter(({ packing, summary }) => (summary?.novedadesAbiertas ?? 0) > 0 || packing.conNovedad).length,
    };
  }, [enriched]);

  const sinAvance = Object.keys(reviewSummaries).length === 0 && packings.length > 0;

  return (
    <div className="w-full space-y-2.5">
      <section className="flex flex-col gap-2 rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20 lg:flex-row lg:items-center lg:justify-between 2xl:px-4 2xl:py-3">
        <div>
          <h2 className="text-lg font-semibold text-[#F5F5F5]">Packings</h2>
          <p className="mt-0.5 text-sm text-[#A7A7A7]">{isProviderPortal ? `Cajas asignadas a ${providerName}.` : "Cajas, paquetes y grupos físicos de Shipping V2"}</p>
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
          <Link
            href="/shipping-v2"
            className="rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-center text-sm font-bold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]"
          >
            Volver a Shipping
          </Link>
          {canCreatePacking ? (
            <Link href="/shipping-v2/packings/nuevo" className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-2 text-center text-sm font-bold text-[#151515] transition hover:brightness-105">Nuevo Packing</Link>
          ) : null}
        </div>
      </section>

      {error ? <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2.5 text-sm text-[#FFB07A]">{error}</div> : null}

      <section className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total packings" value={kpis.total} />
        <Kpi label="En preparación / camino" value={kpis.enCamino} hint="Todavía no llegan" />
        <Kpi label="Revisión pendiente" value={kpis.revisionPendiente} hint="Trabajo real en bodega" />
        <Kpi label="Listos para cerrar" value={kpis.listosParaCerrar} hint="Solo falta el botón" accent />
        <Kpi label="Ciclo cerrado" value={kpis.cicloCerrado} hint="Solo queda vender" accent />
        <Kpi label="Con novedad abierta" value={kpis.conNovedad} />
      </section>

      {sinAvance ? (
        <div className="rounded-xl border border-[#4FC3FF]/30 bg-[#4FC3FF]/10 px-3 py-2 text-xs text-[#BDEAFF]">
          No se pudo calcular el avance de revisión en esta carga. La lista se muestra igual, pero la columna Revisión queda vacía.
        </div>
      ) : null}

      <section className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#30312D] bg-[#11120F] p-2 shadow-xl shadow-black/15">
        <button
          type="button"
          onClick={() => setFase(ALL)}
          className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${fase === ALL ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] bg-[#151515] text-[#A7A7A7] hover:text-[#F5F5F5]"}`}
        >
          Todas las fases ({enriched.length})
        </button>
        {fasesPresentes.map((item) => (
          <button
            key={item.fase}
            type="button"
            onClick={() => setFase(item.fase)}
            className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${fase === item.fase ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : `${faseTone(item.fase)} hover:brightness-125`}`}
          >
            {item.label} ({item.count})
          </button>
        ))}
      </section>

      <section className="grid gap-2 rounded-xl border border-[#30312D] bg-[#11120F] p-2 shadow-xl shadow-black/15 md:grid-cols-3">
        <select value={estado} onChange={(event) => setEstado(event.target.value)} className="h-9 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] font-semibold text-[#F5F5F5]"><option>{ALL}</option>{SHIPPING_V2_PACKING_ESTADOS.map((option) => <option key={option}>{option}</option>)}</select>
        <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="h-9 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] font-semibold text-[#F5F5F5]"><option>{ALL}</option>{SHIPPING_V2_PACKING_TIPOS.map((option) => <option key={option}>{option}</option>)}</select>
        <select value={responsable} onChange={(event) => setResponsable(event.target.value)} className="h-9 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] font-semibold text-[#F5F5F5]"><option>{ALL}</option>{proveedores.map((provider) => <option key={provider.id} value={provider.id}>{getShippingV2ProveedorLabel(provider)}</option>)}</select>
      </section>

      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/25">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1360px] text-left text-sm">
            <thead className="bg-[#20211D] text-[12px] uppercase text-[#A7A7A7]">
              <tr>
                {["Packing ID", "Alias / nombre interno", "Estado", "Revisión", "Qué falta", "Items", "Peso", "Proveedor responsable", "Tracking USA", "Tracking EC", "Fecha creación"].map((head) => <th key={head} className="px-3 py-2 font-semibold">{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ packing, info, summary }) => (
                <tr key={packing.id} className="border-t border-[#3A3A36]/80 hover:bg-[#1E1F1C]">
                  <td className="px-3 py-2.5 font-semibold text-[#D7FF4F]"><Link href={`/shipping-v2/packings/${packing.id}`}>{display(packing.packingId)}</Link></td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{display(packing.nombre)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${faseTone(info.fase)}`}>{info.estadoLabel}</span>
                    <p className="mt-0.5 text-[11px] text-[#8F908A]">{info.faseLabel}</p>
                  </td>
                  <td className="px-3 py-2.5"><ReviewCell summary={summary} /></td>
                  <td className={`px-3 py-2.5 text-[12px] leading-5 ${hintTone(summary?.hint.tono ?? "espera")}`}>
                    {summary?.hint.texto ?? info.significado}
                  </td>
                  <td className="px-3 py-2.5 text-[#F5F5F5]">{packing.itemCount} items</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{formatWeight(packing.peso)}</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{display(packing.proveedorResponsableNombre)}</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{display(packing.trackingUsa)}{packing.transportistaUsaNombre ? <span className="block text-[11px] text-[#8F908A]">{packing.transportistaUsaNombre}</span> : null}</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{display(packing.trackingEc)}{packing.transportistaEcNombre ? <span className="block text-[11px] text-[#8F908A]">{packing.transportistaEcNombre}</span> : null}</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{formatDate(packing.fechaCreacion || packing.createdTime)}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-sm text-[#8F908A]">No hay packings con estos filtros.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
