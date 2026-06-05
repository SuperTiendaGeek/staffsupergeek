"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { getEcuadorTransportProvidersForPacking, getUsaTransportProviders, providerTrackingLabel } from "@/lib/shipping-v2/tracking-providers";
import { SHIPPING_V2_PACKING_TIPOS, type ShippingV2Proveedor } from "@/types/shipping-v2";

type Props = { proveedores: ShippingV2Proveedor[] };

const initialState = {
  nombre: "",
  tipo: SHIPPING_V2_PACKING_TIPOS[0] ?? "Caja",
  proveedorResponsableId: "",
  trackingUsa: "",
  transportistaUsa: "",
  trackingEc: "",
  transportistaEc: "",
  peso: "",
  observaciones: "",
};

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</span>
      {children}
      {help ? <span className="block text-[12px] leading-4 text-[#A7A7A7]">{help}</span> : null}
    </label>
  );
}

const inputClass = "h-9 w-full rounded-lg border border-[#3A3A36] bg-[#121310] px-3 text-[13px] font-semibold text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70";

function isLocalPacking(tipo: string) {
  return tipo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("local") ||
    tipo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("nacional");
}

function isLocalProvider(provider?: ShippingV2Proveedor) {
  const value = `${provider?.tipoProveedor || ""} ${provider?.paisZonaLogistica || provider?.pais || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return value.includes("local") || value.includes("nacional") || value.includes("ecuador");
}

export function ShippingV2NewPackingForm({ proveedores }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedResponsibleProvider = useMemo(
    () => proveedores.find((provider) => provider.id === form.proveedorResponsableId),
    [form.proveedorResponsableId, proveedores]
  );
  const usaTransportProviders = useMemo(() => getUsaTransportProviders(proveedores), [proveedores]);
  const ecuadorTransportProviders = useMemo(
    () => getEcuadorTransportProvidersForPacking(proveedores, form),
    [form, proveedores]
  );
  const showLocalHelp = isLocalPacking(form.tipo) || isLocalProvider(selectedResponsibleProvider);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const normalizedWeight = form.peso.trim().replace(",", ".");
    if (normalizedWeight) {
      const parsedWeight = Number(normalizedWeight);
      if (!Number.isFinite(parsedWeight) || parsedWeight < 0) {
        setError("El peso debe ser un número válido y no negativo.");
        setSaving(false);
        return;
      }
    }

    const response = await fetch("/api/shipping-v2/packings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, peso: normalizedWeight, estado: "En Proceso" }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      setError(String(payload.error || "No se pudo crear el packing."));
      setSaving(false);
      return;
    }
    router.push(`/shipping-v2/packings/${payload.recordId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-2.5">
      <section className="rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-2.5 py-0.5 text-[11px] font-bold uppercase text-[#151515]">Nuevo Packing</span>
            <h2 className="mt-1.5 text-lg font-semibold text-[#F5F5F5]">Crear Packing</h2>
            <p className="mt-0.5 text-sm text-[#A7A7A7]">Crea el grupo físico. No crea recepción, finanzas ni costos distribuidos.</p>
          </div>
          <Link href="/shipping-v2/packings" className="rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-center text-sm font-bold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">Volver</Link>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2.5 text-sm text-[#FFB07A]">{error}</div> : null}

      <section className="grid gap-3 rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-2xl shadow-black/20 md:grid-cols-2">
        <Field label="Alias / nombre interno" help="Opcional. Sirve para identificar la caja de forma más amigable."><input className={inputClass} value={form.nombre} onChange={(event) => update("nombre", event.target.value)} /></Field>
        <Field label="Tipo de packing"><select className={inputClass} value={form.tipo} onChange={(event) => update("tipo", event.target.value)}>{SHIPPING_V2_PACKING_TIPOS.map((option) => <option key={option}>{option}</option>)}</select></Field>
        <Field label="Estado Packing"><div className="flex h-9 items-center rounded-lg border border-[#3A3A36] bg-[#121310] px-3 text-[13px] font-semibold text-[#D7FF4F]">En Proceso</div></Field>
        <Field label="Proveedor responsable"><select className={inputClass} value={form.proveedorResponsableId} onChange={(event) => update("proveedorResponsableId", event.target.value)}><option value="">Sin proveedor</option>{proveedores.map((provider) => <option key={provider.id} value={provider.id}>{getShippingV2ProveedorLabel(provider)}</option>)}</select></Field>
        <Field label="Peso en kg" help="Opcional. Puede registrarse cuando la caja este lista para pesarse."><input className={inputClass} inputMode="decimal" value={form.peso} onChange={(event) => update("peso", event.target.value)} /></Field>
        <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-3 md:col-span-2">
          <h3 className="text-sm font-semibold text-[#F5F5F5]">Ruta USA · Proveedor a Miami</h3>
          {showLocalHelp ? <p className="mt-1 text-[12px] text-[#A7A7A7]">Para packings locales normalmente no se usa Tracking USA. Registra la guía en Tracking EC.</p> : null}
          <p className="mt-1 text-[12px] text-[#A7A7A7]">Usa estos campos para la guía del proveedor o vendedor hasta Miami.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="Tracking USA"><input className={inputClass} value={form.trackingUsa} onChange={(event) => update("trackingUsa", event.target.value)} /></Field>
            <Field label="Transportista USA"><select className={inputClass} value={form.transportistaUsa} onChange={(event) => update("transportistaUsa", event.target.value)}><option value="">Sin transportista USA</option>{usaTransportProviders.map((provider) => <option key={provider.id} value={provider.id}>{providerTrackingLabel(provider)}</option>)}</select></Field>
          </div>
        </div>
        <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-3 md:col-span-2">
          <h3 className="text-sm font-semibold text-[#F5F5F5]">Ruta Ecuador · Miami a SUPER GEEK</h3>
          <p className="mt-1 text-[12px] text-[#A7A7A7]">Usa estos campos para la guía del operador logístico desde Miami hacia Ecuador.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="Tracking EC"><input className={inputClass} value={form.trackingEc} onChange={(event) => update("trackingEc", event.target.value)} /></Field>
            <Field label="Transportista EC"><select className={inputClass} value={form.transportistaEc} onChange={(event) => update("transportistaEc", event.target.value)}><option value="">Sin transportista EC</option>{ecuadorTransportProviders.map((provider) => <option key={provider.id} value={provider.id}>{providerTrackingLabel(provider)}</option>)}</select></Field>
          </div>
        </div>
        <label className="block space-y-1 md:col-span-2">
          <span className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">Observaciones</span>
          <textarea value={form.observaciones} onChange={(event) => update("observaciones", event.target.value)} className="min-h-20 w-full rounded-xl border border-[#3A3A36] bg-[#121310] px-3 py-2 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70" />
        </label>
      </section>

      <div className="flex justify-end">
        <button disabled={saving} className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Creando..." : "Crear Packing"}</button>
      </div>
    </form>
  );
}
