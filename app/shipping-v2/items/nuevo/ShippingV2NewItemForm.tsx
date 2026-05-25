"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import {
  SHIPPING_V2_CATEGORIAS,
  SHIPPING_V2_CONDICIONES,
  SHIPPING_V2_TIPOS_ITEM,
  SHIPPING_V2_TIPOS_OPERACION,
  type ShippingV2Proveedor,
} from "@/types/shipping-v2";
import { normalizeItemNameFast } from "@/lib/shipping-v2/item-name-normalizer";
import { getDefaultItemFlowByOperation } from "@/lib/shipping-v2/item-operation-rules";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { canBeItemLogisticsProvider, canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";

type Props = {
  proveedores: ShippingV2Proveedor[];
};

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
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
  sku: string;
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
  estado: "Registrado",
  proveedorId: "",
  proveedorLogisticoId: "",
  requierePago: true,
  requierePacking: true,
  afectaInventario: true,
  disponibleVenta: false,
  sku: "",
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

function FlowBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`rounded-[1rem] border px-4 py-3 ${active ? "border-[#D7FF4F]/55 bg-[#D7FF4F]/12" : "border-[#3A3A36] bg-[#151515]"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</p>
      <p className={`mt-1 text-sm font-bold ${active ? "text-[#D7FF4F]" : "text-[#A7A7A7]"}`}>{active ? "Activo" : "No activo"}</p>
    </div>
  );
}

const MAX_PHOTOS = 10;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ShippingV2NewItemForm({ proveedores }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const photosRef = useRef<SelectedPhoto[]>([]);
  const purchaseProviders = proveedores.filter(canBePurchaseProvider);
  const itemLogisticsProviders = proveedores.filter(canBeItemLogisticsProvider);
  const fastNameSuggestion = useMemo(() => normalizeItemNameFast(form.nombre), [form.nombre]);
  const showFastNameSuggestion = Boolean(fastNameSuggestion && fastNameSuggestion !== form.nombre.trim());
  const calculatedFlow = useMemo(
    () => getDefaultItemFlowByOperation({
      tipoOperacion: form.tipoOperacion,
      categoria: form.categoria,
      tipoItem: form.tipoItem,
      proveedorCompra: form.proveedorId,
      proveedorLogistico: form.proveedorLogisticoId,
      estadoItem: form.estado,
    }),
    [form.categoria, form.estado, form.proveedorId, form.proveedorLogisticoId, form.tipoItem, form.tipoOperacion]
  );

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addPhotos(files: File[]) {
    setError("");
    if (!files.length) return;

    const nextPhotos: SelectedPhoto[] = [];
    const currentKeys = new Set(photos.map((photo) => `${photo.file.name}:${photo.file.size}:${photo.file.lastModified}`));

    if (photos.length + files.length > MAX_PHOTOS) {
      setError(`Puedes subir hasta ${MAX_PHOTOS} fotos por item.`);
      return;
    }

    for (const file of files) {
      if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
        setError("Las fotos deben ser JPEG, PNG o WebP.");
        return;
      }
      if (file.size > MAX_PHOTO_SIZE) {
        setError("Cada foto debe pesar máximo 10 MB.");
        return;
      }

      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (currentKeys.has(key)) continue;
      currentKeys.add(key);
      nextPhotos.push({
        id: `${key}:${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (nextPhotos.length > 0) {
      setPhotos((current) => [...current, ...nextPhotos]);
    }
  }

  function handlePhotoInput(event: ChangeEvent<HTMLInputElement>) {
    addPhotos(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    addPhotos(Array.from(event.dataTransfer.files ?? []));
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => formData.set(key, String(value)));
    formData.set("requierePago", String(calculatedFlow.requierePago));
    formData.set("requierePacking", String(calculatedFlow.requierePacking));
    formData.set("afectaInventario", String(calculatedFlow.afectaInventario));
    formData.set("disponibleVenta", String(calculatedFlow.disponibleParaVenta));
    formData.set("estado", calculatedFlow.estadoItemSugerido);
    formData.set("estadoRevision", calculatedFlow.estadoRevisionSugerido);
    photos.forEach((photo) => formData.append("fotos", photo.file, photo.file.name));

    const response = await fetch("/api/shipping-v2/items", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success) {
      setError(String(payload.error || "No se pudo crear el item."));
      setSaving(false);
      return;
    }

    if (payload.warning) {
      setError(String(payload.warning));
      setSaving(false);
      return;
    }

    window.sessionStorage.setItem("shipping-v2:notice", "Item creado correctamente. La sugerencia IA se generará en segundo plano.");
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
          {showFastNameSuggestion ? (
            <div className="rounded-[1rem] border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-normal text-[#D7FF4F]">Versión rápida sugerida</p>
              <p className="mt-1 text-sm text-[#F5F5F5]">{fastNameSuggestion}</p>
              <button
                type="button"
                onClick={() => update("nombre", fastNameSuggestion)}
                className="mt-2 rounded-full border border-[#D7FF4F] px-3 py-1.5 text-xs font-bold uppercase tracking-normal text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#151515]"
              >
                Usar versión rápida
              </button>
            </div>
          ) : null}
        </Field>
        <Field label="Tipo de operación">
          <SelectInput value={form.tipoOperacion} onChange={(event) => update("tipoOperacion", event.target.value)}>
            {SHIPPING_V2_TIPOS_OPERACION.map((option) => <option key={option}>{option}</option>)}
          </SelectInput>
        </Field>
        <Field label="Rol general del item">
          <SelectInput value={form.tipoItem} onChange={(event) => update("tipoItem", event.target.value)}>
            {SHIPPING_V2_TIPOS_ITEM.map((option) => <option key={option}>{option}</option>)}
          </SelectInput>
        </Field>
        <Field label="Estado Item sugerido">
          <div className="flex h-12 items-center rounded-full border border-[#3A3A36] bg-[#151515] px-4 text-sm font-semibold text-[#F5F5F5]">
            {calculatedFlow.estadoItemSugerido}
          </div>
        </Field>
        <Field label="Proveedor de compra">
          <SelectInput value={form.proveedorId} onChange={(event) => update("proveedorId", event.target.value)}>
            <option value="">Sin proveedor</option>
            {purchaseProviders.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{getShippingV2ProveedorLabel(proveedor)}</option>)}
          </SelectInput>
        </Field>
        <Field label="Proveedor logístico / intermediario">
          <SelectInput value={form.proveedorLogisticoId} onChange={(event) => update("proveedorLogisticoId", event.target.value)}>
            <option value="">Sin proveedor logístico</option>
            {itemLogisticsProviders.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{getShippingV2ProveedorLabel(proveedor)}</option>)}
          </SelectInput>
        </Field>
        <Field label="SKU">
          <TextInput value={form.sku} onChange={(event) => update("sku", event.target.value.toUpperCase())} placeholder="Opcional, se genera si queda vacío" />
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
        <Field label="Categoría técnica/comercial">
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
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-normal text-[#F5F5F5]">Flujo calculado</h3>
            <p className="mt-1 text-sm text-[#A7A7A7]">Estos valores se calculan según el tipo de operación para evitar errores de ingreso.</p>
            <p className="mt-2 text-xs text-[#D7FF4F]">Disponible para venta significa que el Item puede ofrecerse o reservarse. No necesariamente significa entrega inmediata.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FlowBadge label="Requiere pago" active={calculatedFlow.requierePago} />
            <FlowBadge label="Requiere packing" active={calculatedFlow.requierePacking} />
            <FlowBadge label="Afecta inventario" active={calculatedFlow.afectaInventario} />
            <FlowBadge label="Disponible venta/reserva" active={calculatedFlow.disponibleParaVenta} />
          </div>
          {calculatedFlow.notas.length > 0 ? (
            <div className="rounded-[1rem] border border-[#3A3A36] bg-[#151515] px-4 py-3 text-sm text-[#A7A7A7]">
              {calculatedFlow.notas.map((nota) => <p key={nota}>{nota}</p>)}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[2rem] border border-[#3A3A36] bg-[#2A2B27] p-5">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-normal text-[#F5F5F5]">Fotos del item</h3>
            <p className="mt-1 text-sm text-[#A7A7A7]">Hasta 10 imágenes JPEG, PNG o WebP. Máximo 10 MB por imagen.</p>
          </div>

          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className="grid min-h-36 cursor-pointer place-items-center rounded-[1.5rem] border border-dashed border-[#D7FF4F]/35 bg-[#151515] px-5 py-6 text-center transition hover:border-[#D7FF4F]/70 hover:bg-[#1E1F1C]"
          >
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={handlePhotoInput} />
            <span className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-xs font-bold uppercase tracking-normal text-[#151515]">Seleccionar fotos</span>
            <span className="mt-3 block text-sm text-[#A7A7A7]">También puedes arrastrarlas aquí</span>
          </label>

          {photos.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {photos.map((photo) => (
                <div key={photo.id} className="overflow-hidden rounded-[1.25rem] border border-[#3A3A36] bg-[#151515]">
                  <img src={photo.previewUrl} alt={photo.file.name} className="h-32 w-full object-cover" />
                  <div className="space-y-2 p-3">
                    <div>
                      <p className="truncate text-xs font-semibold text-[#F5F5F5]" title={photo.file.name}>{photo.file.name}</p>
                      <p className="mt-0.5 text-[11px] text-[#A7A7A7]">{formatFileSize(photo.file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="w-full rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#F5F5F5] transition hover:border-[#FF914D]/60 hover:text-[#FFB07A]"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
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
