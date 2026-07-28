"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SHIPPING_V2_PACKING_ESTADOS, SHIPPING_V2_PACKING_TIPOS, type ShippingV2AccessPermissions, type ShippingV2Packing, type ShippingV2Proveedor } from "@/types/shipping-v2";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";

type Props = {
  packings: ShippingV2Packing[];
  proveedores: ShippingV2Proveedor[];
  error: string;
  permissions: ShippingV2AccessPermissions | null;
  providerName?: string;
};

const ALL = "Todos";

function statusTone(status: string) {
  const normalized = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("proceso")) return "border-[#D7FF4F]/45 bg-[#D7FF4F]/12 text-[#D7FF4F]";
  if (normalized.includes("cerrado")) return "border-[#F4E85B]/35 bg-[#F4E85B]/10 text-[#F4E85B]";
  if (normalized.includes("transito")) return "border-[#8B73FF]/35 bg-[#8B73FF]/10 text-[#C9BFFF]";
  if (normalized.includes("recibido")) return "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  if (normalized.includes("novedad") || normalized.includes("cancelado")) return "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]";
  return "border-[#3A3A36] bg-[#151515] text-[#A7A7A7]";
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

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-2 shadow-lg shadow-black/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</p>
          <p className="mt-0.5 text-lg font-semibold leading-none tabular-nums text-[#D7FF4F] xl:text-xl">{value}</p>
        </div>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#D7FF4F]" />
      </div>
    </article>
  );
}

export function ShippingV2PackingsClient({ packings, proveedores, error, permissions, providerName }: Props) {
  const [estado, setEstado] = useState(ALL);
  const [tipo, setTipo] = useState(ALL);
  const [responsable, setResponsable] = useState(ALL);
  const canCreatePacking = permissions?.canCreatePacking !== false;
  const isProviderPortal = Boolean(providerName && permissions?.canCreatePacking === false);

  const filtered = useMemo(() => packings.filter((packing) => {
    if (estado !== ALL && packing.estado !== estado) return false;
    if (tipo !== ALL && packing.tipo !== tipo) return false;
    if (responsable !== ALL && packing.proveedorResponsableId !== responsable) return false;
    return true;
  }), [estado, packings, responsable, tipo]);

  const kpis = {
    total: packings.length,
    enProceso: packings.filter((packing) => packing.estado === "En Proceso").length,
    cerrados: packings.filter((packing) => packing.estado === "Cerrado" || packing.estado === "Cerrado final").length,
    enTransito: packings.filter((packing) => packing.estado === "En tránsito").length,
    recibidos: packings.filter((packing) => packing.estado === "Recibido").length,
    conNovedad: packings.filter((packing) => packing.estado === "Con novedad" || packing.conNovedad).length,
  };

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
        <Kpi label="En proceso" value={kpis.enProceso} />
        <Kpi label="Cerrados" value={kpis.cerrados} />
        <Kpi label="En tránsito" value={kpis.enTransito} />
        <Kpi label="Recibidos" value={kpis.recibidos} />
        <Kpi label="Con novedad" value={kpis.conNovedad} />
      </section>

      <section className="grid gap-2 rounded-xl border border-[#30312D] bg-[#11120F] p-2 shadow-xl shadow-black/15 md:grid-cols-3">
        <select value={estado} onChange={(event) => setEstado(event.target.value)} className="h-9 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] font-semibold text-[#F5F5F5]"><option>{ALL}</option>{SHIPPING_V2_PACKING_ESTADOS.map((option) => <option key={option}>{option}</option>)}</select>
        <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="h-9 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] font-semibold text-[#F5F5F5]"><option>{ALL}</option>{SHIPPING_V2_PACKING_TIPOS.map((option) => <option key={option}>{option}</option>)}</select>
        <select value={responsable} onChange={(event) => setResponsable(event.target.value)} className="h-9 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] font-semibold text-[#F5F5F5]"><option>{ALL}</option>{proveedores.map((provider) => <option key={provider.id} value={provider.id}>{getShippingV2ProveedorLabel(provider)}</option>)}</select>
      </section>

      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/25">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="bg-[#20211D] text-[12px] uppercase text-[#A7A7A7]">
              <tr>
                {["Packing ID", "Alias / nombre interno", "Estado", "Items", "Peso", "Proveedor responsable", "Tracking USA", "Transportista USA", "Tracking EC", "Transportista EC", "Fecha creación"].map((head) => <th key={head} className="px-3 py-2 font-semibold">{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((packing) => (
                <tr key={packing.id} className="border-t border-[#3A3A36]/80 hover:bg-[#1E1F1C]">
                  <td className="px-3 py-2.5 font-semibold text-[#D7FF4F]"><Link href={`/shipping-v2/packings/${packing.id}`}>{display(packing.packingId)}</Link></td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{display(packing.nombre)}</td>
                  <td className="px-3 py-2.5"><span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${statusTone(packing.estado)}`}>{display(packing.estado)}</span></td>
                  <td className="px-3 py-2.5 text-[#F5F5F5]">{packing.itemCount} items</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{formatWeight(packing.peso)}</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{display(packing.proveedorResponsableNombre)}</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{display(packing.trackingUsa)}</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{display(packing.transportistaUsaNombre)}</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{display(packing.trackingEc)}</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{display(packing.transportistaEcNombre)}</td>
                  <td className="px-3 py-2.5 text-[#A7A7A7]">{formatDate(packing.fechaCreacion || packing.createdTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
