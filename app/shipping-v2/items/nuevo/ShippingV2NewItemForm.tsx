"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import {
  SHIPPING_V2_CATEGORIAS,
  SHIPPING_V2_CONDICIONES,
  SHIPPING_V2_ITEM_ESTADOS,
  SHIPPING_V2_TIPOS_ITEM,
  SHIPPING_V2_TIPOS_OPERACION,
  type ShippingV2Proveedor,
} from "@/types/shipping-v2";

type Props = {
  proveedores: ShippingV2Proveedor[];
};

type FormState = {
  nombre: string;
  descripcion: string;
  tipoOperacion: string;
  tipoItem: string;
  categoria: string;
  estado: string;
  proveedorId: string;
  proveedorLogisticoId: string;
  requierePago: boolean;
  requierePacking: boolean;
  afectaInventario: boolean;
  disponibleVenta: boolean;
  skuInterno: string;
  skuProveedor: string;
  modelo: string;
  marca: string;
  numeroSerie: string;
  condicion: string;
  costoProveedor: string;
  precioVentaSugerido: string;
  ubicacionActual: string;
  observacionesInternas: string;
};

function firstOption(options: readonly string[]) {
  return options[0] ?? "";
}

const initialState: FormState = {
  nombre: "",
  descripcion: "",
  tipoOperacion: firstOption(SHIPPING_V2_TIPOS_OPERACION),
  tipoItem: firstOption(SHIPPING_V2_TIPOS_ITEM),
  categoria: firstOption(SHIPPING_V2_CATEGORIAS),
  estado: firstOption(SHIPPING_V2_ITEM_ESTADOS),
  proveedorId: "",
  proveedorLogisticoId: "",
  requierePago: true,
  requierePacking: true,
  afectaInventario: true,
  disponibleVenta: false,
  skuInterno: "",
  skuProveedor: "",
  modelo: "",
  marca: "",
  numeroSerie: "",
  condicion: firstOption(SHIPPING_V2_CONDICIONES),
  costoProveedor: "",
  precioVentaSugerido: "",
  ubicacionActual: "",
  observacionesInternas: "",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-12 w-full rounded-full border border-[#3A3A36] bg-[#151515] px-4 text-sm text-[#F5F5F5] outline-none placeholder:text-[#A7A7A7] transition focus:border-[#D7FF4F]/70"
    />
  );
}

function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-12 w-full rounded-full border border-[#3A3A36] bg-[#151515] px-4 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70"
    />
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${checked ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] bg-[#151515] text-[#F5F5F5] hover:border-[#D7FF4F]/50"}`}
    >
      {label}
    </button>
  );
}

export function ShippingV2NewItemForm({ proveedores }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    const response = await fetch("/api/shipping-v2/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success) {
      setError(String(payload.error || "No se pudo crear el item."));
      setSaving(false);
      return;
    }

    router.push("/shipping-v2/items");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-5 rounded-[2.2rem] border border-[#3A3A36] bg-[#151515] p-4 shadow-2xl shadow-black/40 sm:p-5">
      <section className="rounded-[2rem] border border-[#3A3A36] bg-[#1E1F1C] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1 text-[11px] font-bold uppercase tracking-normal text-[#151515]">Nuevo registro</span>
            <h2 className="mt-4 text-2xl font-semibold text-[#F5F5F5]">Crear Item</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#A7A7A7]">Alta manual en Shipping Items. No crea pagos, packings ni movimientos financieros.</p>
          </div>
          <Link href="/shipping-v2/items" className="rounded-full border border-[#3A3A36] bg-[#252622] px-5 py-2.5 text-center text-sm font-medium text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">
            Volver
          </Link>
        </div>
      </section>

      {error ? (
        <div className="rounded-[1.35rem] border border-[#FF914D]/35 bg-[#FF914D]/10 px-4 py-3 text-sm text-[#FFB07A]">{error}</div>
      ) : null}

      <section className="grid gap-4 rounded-[2rem] border border-[#3A3A36] bg-[#2A2B27] p-5 md:grid-cols-2">
        <Field label="Nombre del item">
          <TextInput value={form.nombre} onChange={(event) => update("nombre", event.target.value)} placeholder="Sin nombre si se deja vacío" />
        </Field>
        <Field label="Tipo de operación">
          <SelectInput value={form.tipoOperacion} onChange={(event) => update("tipoOperacion", event.target.value)}>
            {SHIPPING_V2_TIPOS_OPERACION.map((option) => <option key={option}>{option}</option>)}
          </SelectInput>
        </Field>
        <Field label="Tipo de item">
          <SelectInput value={form.tipoItem} onChange={(event) => update("tipoItem", event.target.value)}>
            {SHIPPING_V2_TIPOS_ITEM.map((option) => <option key={option}>{option}</option>)}
          </SelectInput>
        </Field>
        <Field label="Estado Item">
          <SelectInput value={form.estado} onChange={(event) => update("estado", event.target.value)}>
            {SHIPPING_V2_ITEM_ESTADOS.map((option) => <option key={option}>{option}</option>)}
          </SelectInput>
        </Field>
        <Field label="Proveedor de compra">
          <SelectInput value={form.proveedorId} onChange={(event) => update("proveedorId", event.target.value)}>
            <option value="">Sin proveedor</option>
            {proveedores.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
          </SelectInput>
        </Field>
        <Field label="Proveedor logístico / intermediario">
          <SelectInput value={form.proveedorLogisticoId} onChange={(event) => update("proveedorLogisticoId", event.target.value)}>
            <option value="">Sin proveedor logístico</option>
            {proveedores.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
          </SelectInput>
        </Field>
        <Field label="SKU interno">
          <TextInput value={form.skuInterno} onChange={(event) => update("skuInterno", event.target.value)} placeholder="Opcional, se genera si queda vacío" />
        </Field>
        <Field label="SKU proveedor">
          <TextInput value={form.skuProveedor} onChange={(event) => update("skuProveedor", event.target.value)} />
        </Field>
        <Field label="Modelo">
          <TextInput value={form.modelo} onChange={(event) => update("modelo", event.target.value)} />
        </Field>
        <Field label="Marca">
          <TextInput value={form.marca} onChange={(event) => update("marca", event.target.value)} />
        </Field>
        <Field label="Número de serie">
          <TextInput value={form.numeroSerie} onChange={(event) => update("numeroSerie", event.target.value)} />
        </Field>
        <Field label="Condición">
          <SelectInput value={form.condicion} onChange={(event) => update("condicion", event.target.value)}>
            <option value="">—</option>
            {SHIPPING_V2_CONDICIONES.map((option) => <option key={option}>{option}</option>)}
          </SelectInput>
        </Field>
        <Field label="Categoría">
          <SelectInput value={form.categoria} onChange={(event) => update("categoria", event.target.value)}>
            <option value="">—</option>
            {SHIPPING_V2_CATEGORIAS.map((option) => <option key={option}>{option}</option>)}
          </SelectInput>
        </Field>
        <Field label="Ubicación actual">
          <TextInput value={form.ubicacionActual} onChange={(event) => update("ubicacionActual", event.target.value)} />
        </Field>
        <Field label="Costo proveedor">
          <TextInput type="number" step="0.01" value={form.costoProveedor} onChange={(event) => update("costoProveedor", event.target.value)} />
        </Field>
        <Field label="Precio venta sugerido">
          <TextInput type="number" step="0.01" value={form.precioVentaSugerido} onChange={(event) => update("precioVentaSugerido", event.target.value)} />
        </Field>
        <label className="block space-y-2 md:col-span-2">
          <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Descripción</span>
          <textarea value={form.descripcion} onChange={(event) => update("descripcion", event.target.value)} className="min-h-28 w-full rounded-[1.25rem] border border-[#3A3A36] bg-[#151515] px-4 py-3 text-sm text-[#F5F5F5] outline-none placeholder:text-[#A7A7A7] transition focus:border-[#D7FF4F]/70" />
        </label>
        <label className="block space-y-2 md:col-span-2">
          <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Observaciones internas</span>
          <textarea value={form.observacionesInternas} onChange={(event) => update("observacionesInternas", event.target.value)} className="min-h-28 w-full rounded-[1.25rem] border border-[#3A3A36] bg-[#151515] px-4 py-3 text-sm text-[#F5F5F5] outline-none placeholder:text-[#A7A7A7] transition focus:border-[#D7FF4F]/70" />
        </label>
      </section>

      <section className="rounded-[2rem] border border-[#3A3A36] bg-[#2A2B27] p-5">
        <div className="flex flex-wrap gap-2">
          <Toggle label="Requiere pago" checked={form.requierePago} onChange={(checked) => update("requierePago", checked)} />
          <Toggle label="Requiere packing" checked={form.requierePacking} onChange={(checked) => update("requierePacking", checked)} />
          <Toggle label="Afecta inventario" checked={form.afectaInventario} onChange={(checked) => update("afectaInventario", checked)} />
          <Toggle label="Disponible para venta" checked={form.disponibleVenta} onChange={(checked) => update("disponibleVenta", checked)} />
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Link href="/shipping-v2/items" className="rounded-full border border-[#3A3A36] bg-[#252622] px-5 py-3 text-center text-sm font-medium text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">
          Cancelar
        </Link>
        <button type="submit" disabled={saving} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-6 py-3 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Guardando..." : "Crear Item"}
        </button>
      </div>
    </form>
  );
}
