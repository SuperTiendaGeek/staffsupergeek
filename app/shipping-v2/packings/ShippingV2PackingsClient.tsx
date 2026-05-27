"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SHIPPING_V2_PACKING_ESTADOS, SHIPPING_V2_PACKING_TIPOS, type ShippingV2Packing, type ShippingV2Proveedor } from "@/types/shipping-v2";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";

type Props = { packings: ShippingV2Packing[]; proveedores: ShippingV2Proveedor[]; error: string };

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

function formatWeight(peso: number | null | undefined, unidadPeso?: string) {
  if (peso === null || peso === undefined) return "—";
  return `${new Intl.NumberFormat("es-EC", { maximumFractionDigits: 2 }).format(peso)}${unidadPeso ? ` ${unidadPeso}` : ""}`;
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-[1.5rem] border border-[#3A3A36] bg-[#2A2A28] p-4">
      <p className="text-3xl font-semibold tabular-nums text-[#F5F5F5]">{value}</p>
      <p className="mt-1 text-sm text-[#A7A7A7]">{label}</p>
    </article>
  );
}

function canUseAsEcLogisticsProvider(provider: ShippingV2Proveedor) {
  const normalizedEstado = (provider.estado || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalizedTipo = (provider.tipoProveedor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalizedEstado === "activo" && (normalizedTipo === "logistico" || Boolean(provider.puedeArmarPackings || provider.permiteTriangulacion));
}

export function ShippingV2PackingsClient({ packings, proveedores, error }: Props) {
  const [estado, setEstado] = useState(ALL);
  const [tipo, setTipo] = useState(ALL);
  const [responsable, setResponsable] = useState(ALL);
  const [logistico, setLogistico] = useState(ALL);
  const logisticsProviders = useMemo(() => proveedores.filter(canUseAsEcLogisticsProvider), [proveedores]);

  const filtered = useMemo(() => packings.filter((packing) => {
    if (estado !== ALL && packing.estado !== estado) return false;
    if (tipo !== ALL && packing.tipo !== tipo) return false;
    if (responsable !== ALL && packing.proveedorResponsableId !== responsable) return false;
    if (logistico !== ALL && packing.proveedorLogisticoEcId !== logistico) return false;
    return true;
  }), [estado, logistico, packings, responsable, tipo]);

  const kpis = {
    total: packings.length,
    enProceso: packings.filter((packing) => packing.estado === "En Proceso").length,
    cerrados: packings.filter((packing) => packing.estado === "Cerrado" || packing.estado === "Cerrado final").length,
    enTransito: packings.filter((packing) => packing.estado === "En tránsito").length,
    recibidos: packings.filter((packing) => packing.estado === "Recibido").length,
    conNovedad: packings.filter((packing) => packing.estado === "Con novedad" || packing.conNovedad).length,
  };

  return (
    <div className="w-full space-y-5 rounded-[2rem] border border-[#3A3A36] bg-[#1B1B1B] p-4 shadow-2xl shadow-black/30 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#F5F5F5]">Packings</h2>
          <p className="mt-1 text-sm text-[#A7A7A7]">Cajas, paquetes y grupos físicos de Shipping V2</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link
            href="/shipping-v2"
            className="rounded-full border border-[#D7FF4F]/45 bg-[#D7FF4F]/10 px-5 py-2.5 text-center text-sm font-bold text-[#D7FF4F] transition hover:border-[#D7FF4F] hover:bg-[#D7FF4F]/15"
          >
            Volver a Shipping
          </Link>
          <Link href="/shipping-v2/packings/nuevo" className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-5 py-2.5 text-center text-sm font-bold text-[#151515] transition hover:brightness-105">Nuevo Packing</Link>
        </div>
      </div>

      {error ? <div className="rounded-[1.25rem] border border-[#FF914D]/35 bg-[#FF914D]/10 p-4 text-sm text-[#FFB07A]">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Total packings" value={kpis.total} />
        <Kpi label="En proceso" value={kpis.enProceso} />
        <Kpi label="Cerrados" value={kpis.cerrados} />
        <Kpi label="En tránsito" value={kpis.enTransito} />
        <Kpi label="Recibidos" value={kpis.recibidos} />
        <Kpi label="Con novedad" value={kpis.conNovedad} />
      </section>

      <section className="grid gap-3 rounded-[1.5rem] border border-[#3A3A36] bg-[#2A2A28] p-4 md:grid-cols-4">
        <select value={estado} onChange={(event) => setEstado(event.target.value)} className="h-11 rounded-full border border-[#3A3A36] bg-[#151515] px-4 text-sm text-[#F5F5F5]"><option>{ALL}</option>{SHIPPING_V2_PACKING_ESTADOS.map((option) => <option key={option}>{option}</option>)}</select>
        <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="h-11 rounded-full border border-[#3A3A36] bg-[#151515] px-4 text-sm text-[#F5F5F5]"><option>{ALL}</option>{SHIPPING_V2_PACKING_TIPOS.map((option) => <option key={option}>{option}</option>)}</select>
        <select value={responsable} onChange={(event) => setResponsable(event.target.value)} className="h-11 rounded-full border border-[#3A3A36] bg-[#151515] px-4 text-sm text-[#F5F5F5]"><option>{ALL}</option>{proveedores.map((provider) => <option key={provider.id} value={provider.id}>{getShippingV2ProveedorLabel(provider)}</option>)}</select>
        <select value={logistico} onChange={(event) => setLogistico(event.target.value)} className="h-11 rounded-full border border-[#3A3A36] bg-[#151515] px-4 text-sm text-[#F5F5F5]"><option>{ALL}</option>{logisticsProviders.map((provider) => <option key={provider.id} value={provider.id}>{getShippingV2ProveedorLabel(provider)}</option>)}</select>
      </section>

      <div className="overflow-hidden rounded-[1.5rem] border border-[#3A3A36] bg-[#2A2A28]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-[#151515] text-xs uppercase text-[#A7A7A7]">
              <tr>
                {["Packing ID", "Alias / nombre interno", "Estado", "Items", "Peso", "Proveedor responsable", "Proveedor logístico EC", "Tracking USA", "Tracking EC", "Fecha creación"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((packing) => (
                <tr key={packing.id} className="border-t border-[#3A3A36]/80 hover:bg-[#1E1F1C]">
                  <td className="px-4 py-3 font-semibold text-[#D7FF4F]"><Link href={`/shipping-v2/packings/${packing.id}`}>{display(packing.packingId)}</Link></td>
                  <td className="px-4 py-3 text-[#A7A7A7]">{display(packing.nombre)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-3 py-1 text-xs ${statusTone(packing.estado)}`}>{display(packing.estado)}</span></td>
                  <td className="px-4 py-3 text-[#F5F5F5]">{packing.itemCount} items</td>
                  <td className="px-4 py-3 text-[#A7A7A7]">{formatWeight(packing.peso, packing.unidadPeso)}</td>
                  <td className="px-4 py-3 text-[#A7A7A7]">{display(packing.proveedorResponsableNombre)}</td>
                  <td className="px-4 py-3 text-[#A7A7A7]">{display(packing.proveedorLogisticoEcNombre)}</td>
                  <td className="px-4 py-3 text-[#A7A7A7]">{display(packing.trackingUsa)}</td>
                  <td className="px-4 py-3 text-[#A7A7A7]">{display(packing.trackingEc)}</td>
                  <td className="px-4 py-3 text-[#A7A7A7]">{formatDate(packing.fechaCreacion || packing.createdTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
