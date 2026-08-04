"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import {
  SHIPPING_V2_CATEGORIAS,
  SHIPPING_V2_CONDICIONES,
  SHIPPING_V2_MODOS_LOGISTICOS,
  SHIPPING_V2_TIPOS_ITEM,
  SHIPPING_V2_TIPOS_OPERACION,
  SHIPPING_V2_UNIDADES,
  type ShippingV2Proveedor,
} from "@/types/shipping-v2";
import { normalizeItemNameFast } from "@/lib/shipping-v2/item-name-normalizer";
import { getDefaultItemFlowByOperation } from "@/lib/shipping-v2/item-operation-rules";
import { isShippingV2GiftOperation, isShippingV2PurchaseOperation } from "@/lib/shipping-v2/item-money-quantity";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { canBeItemLogisticsProvider, canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";
import { requisitosFaltantesItem } from "@/lib/shipping-v2/item-requisitos";

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
  // Solo alimenta el cálculo del flujo (getDefaultItemFlowByOperation lo usa
  // como estado actual). Lo que se guarda es calculatedFlow.estadoItemSugerido.
  estado: string;
  proveedorId: string;
  proveedorLogisticoId: string;
  modoLogistico: string;
  trackingDirecto: string;
  sku: string;
  skuProveedor: string;
  modelo: string;
  marca: string;
  numeroSerie: string;
  condicion: string;
  cantidad: string;
  unidad: string;
  costoProveedor: string;
  precioVentaSugerido: string;
  precioVentaFinal: string;
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
  categoria: "",
  estado: "Registrado",
  proveedorId: "",
  proveedorLogisticoId: "",
  modoLogistico: "Pendiente de packing",
  trackingDirecto: "",
  sku: "",
  skuProveedor: "",
  modelo: "",
  marca: "",
  numeroSerie: "",
  condicion: firstOption(SHIPPING_V2_CONDICIONES),
  cantidad: "1",
  unidad: "Unidad",
  costoProveedor: "",
  precioVentaSugerido: "",
  precioVentaFinal: "",
  ubicacionActual: "",
  observacionesInternas: "",
};

function Field({ label, children, required, error }: { label: string; children: ReactNode; required?: boolean; error?: string }) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">
        {label}
        {required ? <span className="ml-1 text-[#FF914D]">*</span> : null}
      </span>
      {children}
      {error ? <p className="text-xs leading-5 text-[#FFB07A]">{error}</p> : null}
    </label>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-9 w-full rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-sm text-[#F5F5F5] outline-none placeholder:text-[#696A64] transition focus:border-[#D7FF4F]/70"
    />
  );
}

function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";

  return (
    <select
      {...props}
      className={`h-9 w-full rounded-lg border bg-[#151515] px-3 text-sm font-semibold text-[#F5F5F5] outline-none transition ${invalid ? "border-[#FF914D]/70 focus:border-[#FF914D]" : "border-[#3A3A36] focus:border-[#D7FF4F]/70"}`}
    />
  );
}

function FlowBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${active ? "border-[#D7FF4F]/55 bg-[#D7FF4F]/12" : "border-[#3A3A36] bg-[#151515]"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${active ? "text-[#D7FF4F]" : "text-[#A7A7A7]"}`}>{active ? "Sí" : "No"}</p>
    </div>
  );
}

function FormCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-xl shadow-black/15">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#F5F5F5]">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] leading-5 text-[#A7A7A7]">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="min-h-20 w-full rounded-lg border border-[#3A3A36] bg-[#151515] px-3 py-2 text-sm text-[#F5F5F5] outline-none placeholder:text-[#696A64] transition focus:border-[#D7FF4F]/70"
    />
  );
}

const MAX_PHOTOS = 10;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PACKING_LOGISTICS_OPTIONS = ["Pendiente de packing", "Crear packing individual", "Asignar a packing existente"];
const SIMPLE_LOGISTICS_OPTIONS = ["No aplica", "Tracking directo"];

const LOGISTICS_MODE_HELP: Record<string, string> = {
  "No aplica": "Este item no requiere gestión logística.",
  "Tracking directo": "Usar para compras locales o envíos simples sin packing.",
  "Pendiente de packing": "El item quedará pendiente para ser agregado luego a un packing.",
  "Crear packing individual": "Usar cuando este item viajará solo en su propio paquete. La creación automática del packing se implementará después.",
  "Asignar a packing existente": "Usar cuando el item debe agregarse a un packing ya creado. La selección de packing se implementará después.",
};

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function parseDecimalInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveIntegerInput(value: string) {
  const parsed = parseDecimalInput(value);
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeMoneyInput(value: string) {
  const parsed = parseDecimalInput(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function parsePositiveMoneyInput(value: string) {
  const parsed = parseDecimalInput(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function formatMoneyPreview(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function ShippingV2NewItemForm({ proveedores }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
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
  const logisticsOptions = useMemo(() => {
    const allowed = calculatedFlow.requierePacking ? [...PACKING_LOGISTICS_OPTIONS, "Tracking directo"] : SIMPLE_LOGISTICS_OPTIONS;
    return SHIPPING_V2_MODOS_LOGISTICOS.filter((option) => allowed.includes(option));
  }, [calculatedFlow.requierePacking]);
  const selectedModeUsesPacking = PACKING_LOGISTICS_OPTIONS.includes(form.modoLogistico);
  const selectedModeUsesDirectTracking = form.modoLogistico === "Tracking directo";
  const effectiveRequiresPacking = selectedModeUsesDirectTracking ? false : selectedModeUsesPacking ? true : calculatedFlow.requierePacking;
  const modeHelpText = LOGISTICS_MODE_HELP[form.modoLogistico] ?? "";
  const cantidadNormalizada = parsePositiveIntegerInput(form.cantidad);
  const costoProveedorUnitario = parseNonNegativeMoneyInput(form.costoProveedor);
  const precioVentaFinalDecimal = parseDecimalInput(form.precioVentaFinal);
  const precioVentaFinalUnitario = parsePositiveMoneyInput(form.precioVentaFinal);
  const isPurchaseOperation = isShippingV2PurchaseOperation(form.tipoOperacion);
  const isGiftOperation = isShippingV2GiftOperation(form.tipoOperacion);
  const subtotalProveedor = cantidadNormalizada !== null && costoProveedorUnitario !== null
    ? cantidadNormalizada * costoProveedorUnitario
    : null;
  const valorPotencialVenta = cantidadNormalizada !== null && precioVentaFinalUnitario !== null
    ? cantidadNormalizada * precioVentaFinalUnitario
    : null;
  const showProviderWarning = calculatedFlow.requierePago && !form.proveedorId;
  const showQuantityWarning = submitAttempted && cantidadNormalizada === null;
  const showCostWarning = isPurchaseOperation && !parsePositiveMoneyInput(form.costoProveedor);
  const showGiftCostWarning = isGiftOperation && costoProveedorUnitario !== null && costoProveedorUnitario > 0;
  const finalPriceProvided = form.precioVentaFinal.trim() !== "";
  const showFinalPriceWarning = submitAttempted && finalPriceProvided && (precioVentaFinalDecimal === null || precioVentaFinalDecimal < 0);
  const showCategoryWarning = submitAttempted && !form.categoria;

  // F-30 — una sola fuente para "qué le falta a este item". Antes las mismas
  // reglas vivían aquí como avisos y otra vez en el servidor, y no coincidían:
  // el aviso de proveedor se mostraba pero no impedía enviar.
  const requisitosFaltantes = requisitosFaltantesItem({
    categoria: form.categoria,
    cantidad: cantidadNormalizada,
    requierePago: calculatedFlow.requierePago,
    esCompraProveedor: isPurchaseOperation,
    esRegaloProveedor: isGiftOperation,
    proveedorId: form.proveedorId,
    costoProveedor: costoProveedorUnitario,
    precioVentaFinal: finalPriceProvided ? precioVentaFinalDecimal : null,
  });

  useEffect(() => {
    if (logisticsOptions.some((option) => option === form.modoLogistico)) return;
    update("modoLogistico", logisticsOptions[0] ?? "No aplica");
  }, [form.modoLogistico, logisticsOptions]);

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
    setSubmitAttempted(true);

    // F-30 — se informan TODOS los faltantes de una vez. Antes se devolvía el
    // primero, así que con tres campos mal había que enviar tres veces; y el
    // proveedor no se comprobaba aquí, de modo que ese error solo aparecía
    // después del viaje al servidor.
    if (requisitosFaltantes.length > 0) {
      setError(requisitosFaltantes.map((r) => `· ${r.mensaje}`).join("\n"));
      return;
    }

    setSaving(true);

    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => formData.set(key, String(value)));
    formData.set("requierePago", String(calculatedFlow.requierePago));
    formData.set("requierePacking", String(effectiveRequiresPacking));
    formData.set("afectaInventario", String(calculatedFlow.afectaInventario));
    formData.set("disponibleVenta", String(calculatedFlow.disponibleParaVenta));
    formData.set("modoLogistico", form.modoLogistico);
    formData.set("trackingDirecto", selectedModeUsesDirectTracking ? form.trackingDirecto : "");
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

    const photoUploadStatus = String(payload.photoUploadStatus || "");
    const uploadedFotos = Number(payload.uploadedFotos || 0);
    const photoWarning = String(payload.photoWarning || payload.warning || "").trim();
    const notice = photoUploadStatus === "failed" || photoUploadStatus === "partial" || photoWarning
      ? `Item registrado correctamente, con fotos fallidas o pendientes.${photoWarning ? ` ${photoWarning}` : ""}`
      : uploadedFotos > 0 || photoUploadStatus === "complete"
        ? "Item creado correctamente con fotos. La sugerencia IA se generará en segundo plano."
        : "Item creado correctamente. La sugerencia IA se generará en segundo plano.";

    window.sessionStorage.setItem("shipping-v2:notice", notice);
    router.push("/shipping-v2/items");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full max-w-none space-y-3">
      {error ? (
        <div className="whitespace-pre-line rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-4 py-3 text-sm text-[#FFB07A]">{error}</div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-12 lg:items-start">
        <div className="space-y-3 lg:col-span-8">
          <FormCard title="Datos principales" description="Alta manual en Shipping Items. No crea pagos, packings ni movimientos financieros.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="md:col-span-2 xl:col-span-3">
                <Field label="Nombre del item">
                  <TextInput value={form.nombre} onChange={(event) => update("nombre", event.target.value)} placeholder="Sin nombre si se deja vacío" />
                  {showFastNameSuggestion ? (
                    <div className="mt-2 rounded-lg border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#D7FF4F]">Versión rápida sugerida</p>
                      <p className="mt-1 text-sm text-[#F5F5F5]">{fastNameSuggestion}</p>
                      <button type="button" onClick={() => update("nombre", fastNameSuggestion)} className="mt-2 rounded-lg border border-[#D7FF4F] px-3 py-1.5 text-xs font-bold uppercase tracking-normal text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#151515]">
                        Usar versión rápida
                      </button>
                    </div>
                  ) : null}
                </Field>
              </div>
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
              <Field label="Estado item sugerido">
                <div className="flex h-9 items-center rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-sm font-semibold text-[#F5F5F5]">
                  {calculatedFlow.estadoItemSugerido}
                </div>
              </Field>
              <Field label="Categoría técnica/comercial" required={showCategoryWarning} error={showCategoryWarning ? "Campo obligatorio." : undefined}>
                <SelectInput value={form.categoria} aria-invalid={showCategoryWarning} onChange={(event) => update("categoria", event.target.value)}>
                  <option value="">Selecciona una categoría</option>
                  {SHIPPING_V2_CATEGORIAS.map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              </Field>
              <Field label="Condición">
                <SelectInput value={form.condicion} onChange={(event) => update("condicion", event.target.value)}>
                  <option value="">—</option>
                  {SHIPPING_V2_CONDICIONES.map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              </Field>
            </div>
          </FormCard>

          <FormCard title="Proveedor y logística">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Proveedor de compra">
                <SelectInput value={form.proveedorId} onChange={(event) => update("proveedorId", event.target.value)}>
                  <option value="">Sin proveedor</option>
                  {purchaseProviders.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{getShippingV2ProveedorLabel(proveedor)}</option>)}
                </SelectInput>
                {showProviderWarning ? <p className="text-xs leading-5 text-[#FFB07A]">Este flujo requiere proveedor de compra.</p> : null}
              </Field>
              <Field label="Proveedor logístico / intermediario">
                <SelectInput value={form.proveedorLogisticoId} onChange={(event) => update("proveedorLogisticoId", event.target.value)}>
                  <option value="">Sin proveedor logístico</option>
                  {itemLogisticsProviders.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{getShippingV2ProveedorLabel(proveedor)}</option>)}
                </SelectInput>
              </Field>
              <Field label="Modo logístico">
                <SelectInput value={form.modoLogistico} onChange={(event) => update("modoLogistico", event.target.value)}>
                  {logisticsOptions.map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              </Field>
              <Field label="Ubicación actual">
                <TextInput value={form.ubicacionActual} onChange={(event) => update("ubicacionActual", event.target.value)} />
              </Field>
              {selectedModeUsesDirectTracking ? (
                <div className="md:col-span-2">
                  <Field label="Tracking directo">
                    <TextInput value={form.trackingDirecto} onChange={(event) => update("trackingDirecto", event.target.value)} placeholder="Número o URL de tracking simple" />
                  </Field>
                </div>
              ) : null}
            </div>
            {modeHelpText ? <p className="mt-2 text-xs leading-5 text-[#A7A7A7]">{modeHelpText}</p> : null}
          </FormCard>

          <FormCard title="Identificación técnica">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Field label="SKU">
                <TextInput value={form.sku} onChange={(event) => update("sku", event.target.value.toUpperCase())} placeholder="Opcional" />
                {!form.sku ? <p className="text-xs leading-5 text-[#D7FF4F]">Se generará automáticamente si lo dejas vacío.</p> : null}
              </Field>
              <Field label="SKU proveedor">
                <TextInput value={form.skuProveedor} onChange={(event) => update("skuProveedor", event.target.value)} placeholder="Opcional" />
              </Field>
              <Field label="Marca">
                <TextInput value={form.marca} onChange={(event) => update("marca", event.target.value)} />
              </Field>
              <Field label="Modelo">
                <TextInput value={form.modelo} onChange={(event) => update("modelo", event.target.value)} />
              </Field>
              <Field label="Número de serie">
                <TextInput value={form.numeroSerie} onChange={(event) => update("numeroSerie", event.target.value)} />
              </Field>
            </div>
          </FormCard>

          <FormCard title="Cantidad, costos y venta" description="Flete, arancel y costo total unitario se calculan luego desde Packing.">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Cantidad" required error={showQuantityWarning ? "Entero mayor a 0." : undefined}>
                <TextInput
                  type="number"
                  min="1"
                  step="1"
                  value={form.cantidad}
                  aria-invalid={showQuantityWarning}
                  onChange={(event) => update("cantidad", event.target.value)}
                />
              </Field>
              <Field label="Unidad">
                <SelectInput value={form.unidad} onChange={(event) => update("unidad", event.target.value)}>
                  {SHIPPING_V2_UNIDADES.map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              </Field>
              <Field label="Costo proveedor por unidad">
                <TextInput
                  type="number"
                  min={isPurchaseOperation ? "0.01" : "0"}
                  step="0.01"
                  value={form.costoProveedor}
                  aria-invalid={showCostWarning || showGiftCostWarning}
                  onChange={(event) => update("costoProveedor", event.target.value)}
                />
                {showCostWarning ? <p className="text-xs leading-5 text-[#FFB07A]">Este flujo requiere costo proveedor.</p> : null}
                {showGiftCostWarning ? <p className="text-xs leading-5 text-[#FFB07A]">En regalos debe estar vacío o en 0.</p> : null}
              </Field>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field label="Precio venta sugerido por unidad">
                <TextInput type="number" min="0.01" step="0.01" value={form.precioVentaSugerido} onChange={(event) => update("precioVentaSugerido", event.target.value)} />
              </Field>
              <Field label="Precio venta final por unidad" error={showFinalPriceWarning ? "No puede ser negativo." : undefined}>
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precioVentaFinal}
                  aria-invalid={showFinalPriceWarning}
                  onChange={(event) => update("precioVentaFinal", event.target.value)}
                />
              </Field>
            </div>
            <div className="mt-3 grid gap-2 border-t border-[#30312D] pt-3 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-normal text-[#8F908A]">Subtotal proveedor</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[#F5F5F5]">{formatMoneyPreview(subtotalProveedor)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-normal text-[#8F908A]">Valor potencial de venta</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[#D7FF4F]">{formatMoneyPreview(valorPotencialVenta)}</p>
              </div>
            </div>
          </FormCard>

          <FormCard title="Descripción y observaciones">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Descripción">
                <TextArea value={form.descripcion} onChange={(event) => update("descripcion", event.target.value)} />
              </Field>
              <Field label="Observaciones internas">
                <TextArea value={form.observacionesInternas} onChange={(event) => update("observacionesInternas", event.target.value)} />
              </Field>
            </div>
          </FormCard>
        </div>

        <aside className="space-y-3 lg:col-span-4">
          {/* Estos cuatro valores NO se editan aquí: los decide el tipo de
              operación (ver lib/shipping-v2/item-operation-rules.ts) y el
              servidor los recalcula al guardar. El único que el usuario mueve
              es el modo logístico, y solo afecta a "Requiere packing". El texto
              anterior decía "puedes ajustar algunos valores si el formulario lo
              permite", que invitaba a buscar dónde. */}
          <FormCard
            title="Flujo calculado"
            description="Lo decide el tipo de operación, no se edita a mano. Cambia el tipo de operación o el modo logístico para que cambien."
          >
            <div className="grid grid-cols-2 gap-2">
              <FlowBadge label="Requiere pago" active={calculatedFlow.requierePago} />
              <FlowBadge label="Requiere packing" active={effectiveRequiresPacking} />
              <FlowBadge label="Afecta inventario" active={calculatedFlow.afectaInventario} />
              <FlowBadge label="Disponible venta" active={calculatedFlow.disponibleParaVenta} />
            </div>
            <div className="mt-3 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-normal text-[#8F908A]">Modo logístico</p>
              <p className="mt-0.5 text-sm font-semibold text-[#F5F5F5]">{form.modoLogistico}</p>
            </div>
            {selectedModeUsesPacking ? (
              <p className="mt-2 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 py-2 text-xs leading-5 text-[#A7A7A7]">La logística principal se gestionará desde Packings.</p>
            ) : null}
            {calculatedFlow.notas.length > 0 ? (
              <div className="mt-2 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 py-2 text-xs leading-5 text-[#A7A7A7]">
                {calculatedFlow.notas.map((nota) => <p key={nota}>{nota}</p>)}
              </div>
            ) : null}
          </FormCard>

          <FormCard title="Fotos del item" description="Hasta 10 imágenes JPG, PNG o WebP.">
            <label onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} className="grid min-h-28 cursor-pointer place-items-center rounded-xl border border-dashed border-[#D7FF4F]/35 bg-[#151515] px-4 py-5 text-center transition hover:border-[#D7FF4F]/70 hover:bg-[#1E1F1C]">
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={handlePhotoInput} />
              <span className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-2 text-xs font-bold uppercase tracking-normal text-[#151515]">Seleccionar fotos</span>
              <span className="mt-2 block text-xs text-[#A7A7A7]">También puedes arrastrarlas aquí</span>
            </label>
            {photos.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                {photos.map((photo) => (
                  <div key={photo.id} className="overflow-hidden rounded-xl border border-[#3A3A36] bg-[#151515]">
                    <img src={photo.previewUrl} alt={photo.file.name} className="h-24 w-full object-cover" />
                    <div className="space-y-2 p-2">
                      <div>
                        <p className="truncate text-xs font-semibold text-[#F5F5F5]" title={photo.file.name}>{photo.file.name}</p>
                        <p className="mt-0.5 text-[11px] text-[#A7A7A7]">{formatFileSize(photo.file.size)}</p>
                      </div>
                      <button type="button" onClick={() => removePhoto(photo.id)} className="w-full rounded-lg border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#F5F5F5] transition hover:border-[#FF914D]/60 hover:text-[#FFB07A]">
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </FormCard>

          <section className="rounded-xl border border-[#30312D] bg-[#11120F] p-3 shadow-xl shadow-black/15">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <Link href="/shipping-v2/items" className="rounded-lg border border-[#3A3A36] bg-[#252622] px-4 py-2.5 text-center text-sm font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">
                Cancelar
              </Link>
              <button type="submit" disabled={saving} className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2.5 text-sm font-black text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? "Guardando..." : "Crear item"}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
