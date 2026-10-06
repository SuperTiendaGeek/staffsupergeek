"use client";

// Registro de un artículo en UNA sola pantalla (auditoría Shipping V2, punto 2).
//
// Arriba las tres preguntas que ordenan todo lo demás: ¿Dónde está el
// artículo?, proveedor y categoría. Si viene de afuera, la sección "Llegada"
// recoge en el mismo lugar el casillero, los rastreos y si viaja en una caja.
// Al guardar no hace falta ir a otra pantalla. Ya no se preguntan: Rol general,
// Estado sugerido, Modo logístico, Ubicación actual ni Origen físico.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import {
  SHIPPING_V2_CATEGORIAS,
  SHIPPING_V2_CONDICIONES,
  SHIPPING_V2_UNIDADES,
  type ShippingV2Proveedor,
} from "@/types/shipping-v2";
import { normalizeItemNameFast } from "@/lib/shipping-v2/item-name-normalizer";
import { getDefaultItemFlowByOperation } from "@/lib/shipping-v2/item-operation-rules";
import { requiereInspeccionPorDefecto } from "@/lib/shipping-v2/item-venta";
import {
  ORIGEN_EXTRANJERO,
  ORIGEN_LOCAL,
  ORIGEN_TIENDA,
  ORIGENES_ARTICULO,
  TIPOS_OPERACION_POR_ORIGEN,
  origenSegunZona,
  type OrigenArticulo,
} from "@/lib/shipping-v2/item-origen";
import { esProveedorLogistico } from "@/lib/shipping-v2/provider-types";
import { isShippingV2GiftOperation, isShippingV2PurchaseOperation } from "@/lib/shipping-v2/item-money-quantity";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";
import { requisitosFaltantesItem } from "@/lib/shipping-v2/item-requisitos";
import { ACCEPT_FOTOS_ITEM, validarSeleccionFotosItem } from "@/lib/shipping-v2/fotos-item";
import { FotosInvalidasError, subirFotosItem } from "@/lib/shipping-v2/subir-fotos-item";

/** Caja (packing "En Proceso") a la que se puede agregar el artículo al registrarlo. */
export type ShippingV2CajaAbierta = {
  id: string;
  codigo: string;
  nombre: string;
  proveedorResponsableId?: string;
  proveedorLogisticoEcId?: string;
};

type Props = {
  proveedores: ShippingV2Proveedor[];
  cajasAbiertas: ShippingV2CajaAbierta[];
};

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type ViajeOpcion = "solo" | "caja" | "nose";

type FormState = {
  origen: OrigenArticulo | "";
  proveedorId: string;
  categoria: string;
  tipoOperacion: string;
  nombre: string;
  sku: string;
  skuProveedor: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  condicion: string;
  /** null = sigue el valor por defecto de la categoría. */
  requiereInspeccion: boolean | null;
  cantidad: string;
  unidad: string;
  costoProveedor: string;
  precioVentaSugerido: string;
  precioVentaFinal: string;
  descripcion: string;
  observacionesInternas: string;
  // Llegada (solo si viene de afuera)
  casilleroId: string;
  trackingOrigen: string;
  transportistaOrigenId: string;
  trackingEcuador: string;
  transportistaEcuadorId: string;
  trackingLocal: string;
  viaje: ViajeOpcion;
  packingDestinoId: string;
};

function firstOption(options: readonly string[]) {
  return options[0] ?? "";
}

const initialState: FormState = {
  origen: "",
  proveedorId: "",
  categoria: "",
  tipoOperacion: "",
  nombre: "",
  sku: "",
  skuProveedor: "",
  marca: "",
  modelo: "",
  numeroSerie: "",
  condicion: firstOption(SHIPPING_V2_CONDICIONES),
  requiereInspeccion: null,
  cantidad: "1",
  unidad: "Unidad",
  costoProveedor: "",
  precioVentaSugerido: "",
  precioVentaFinal: "",
  descripcion: "",
  observacionesInternas: "",
  casilleroId: "",
  trackingOrigen: "",
  transportistaOrigenId: "",
  trackingEcuador: "",
  transportistaEcuadorId: "",
  trackingLocal: "",
  viaje: "nose",
  packingDestinoId: "",
};

const ORIGEN_AYUDA: Record<OrigenArticulo, string> = {
  [ORIGEN_TIENDA]: "Ya lo tenemos aquí. Nace recibido: no pide rastreo ni caja.",
  [ORIGEN_EXTRANJERO]: "Viene de fuera del país, normalmente por el casillero. Aparecerá en Recepción → Por llegar.",
  [ORIGEN_LOCAL]: "Viene de un proveedor dentro de Ecuador. Aparecerá en Recepción → Por llegar.",
};

function OrigenBoton({ origen, activo, onClick }: { origen: OrigenArticulo; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`min-w-0 rounded-xl border px-3 py-2.5 text-left transition ${activo ? "border-[#D7FF4F] bg-[#D7FF4F]/12" : "border-[#3A3A36] bg-[#151515] hover:border-[#D7FF4F]/50"}`}
    >
      <span className={`block text-sm font-bold ${activo ? "text-[#D7FF4F]" : "text-[#F5F5F5]"}`}>{origen}</span>
      <span className="mt-0.5 block text-xs leading-5 text-[#A7A7A7]">{ORIGEN_AYUDA[origen]}</span>
    </button>
  );
}

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

export function ShippingV2NewItemForm({ proveedores, cajasAbiertas }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const photosRef = useRef<SelectedPhoto[]>([]);

  const origen = form.origen || null;
  const vieneDeAfuera = origen === ORIGEN_EXTRANJERO || origen === ORIGEN_LOCAL;
  const activos = proveedores.filter((p) => (p.estado || "").toLowerCase() === "activo");

  // Proveedores de compra según el origen: Ecuador = local; el resto, extranjero.
  const proveedoresCompra = useMemo(() => {
    const compra = proveedores.filter(canBePurchaseProvider);
    if (origen === ORIGEN_EXTRANJERO || origen === ORIGEN_LOCAL) {
      return compra.filter((p) => origenSegunZona(p.paisZonaLogistica) === origen);
    }
    return compra;
  }, [proveedores, origen]);
  const casilleros = activos.filter((p) => p.esCasillero === true);
  const logisticos = activos.filter((p) => esProveedorLogistico(p));
  const transportistasOrigen = logisticos.filter((p) => p.esCasillero !== true && origenSegunZona(p.paisZonaLogistica) === ORIGEN_EXTRANJERO);
  const transportistasEcuador = logisticos.filter((p) => p.esCasillero === true || origenSegunZona(p.paisZonaLogistica) === ORIGEN_LOCAL);
  const tiposOperacion = origen ? TIPOS_OPERACION_POR_ORIGEN[origen] : [];

  // Cajas abiertas donde puede entrar: del mismo proveedor o del mismo casillero.
  const cajasCompatibles = cajasAbiertas.filter((caja) => {
    const ids = new Set([caja.proveedorResponsableId, caja.proveedorLogisticoEcId].filter(Boolean));
    if (!ids.size) return true;
    return (form.proveedorId && ids.has(form.proveedorId)) || (form.casilleroId && ids.has(form.casilleroId));
  });

  const calculatedFlow = useMemo(
    () => getDefaultItemFlowByOperation({ tipoOperacion: form.tipoOperacion, categoria: form.categoria, proveedorCompra: form.proveedorId }),
    [form.categoria, form.proveedorId, form.tipoOperacion]
  );
  const fastNameSuggestion = useMemo(() => normalizeItemNameFast(form.nombre), [form.nombre]);
  const showFastNameSuggestion = Boolean(fastNameSuggestion && fastNameSuggestion !== form.nombre.trim());
  const requiereInspeccion = form.requiereInspeccion ?? requiereInspeccionPorDefecto({ categoria: form.categoria, tipoOperacion: form.tipoOperacion });
  const cantidadNormalizada = parsePositiveIntegerInput(form.cantidad);
  const costoProveedorUnitario = parseNonNegativeMoneyInput(form.costoProveedor);
  const precioVentaFinalDecimal = parseDecimalInput(form.precioVentaFinal);
  const precioVentaFinalUnitario = parsePositiveMoneyInput(form.precioVentaFinal);
  const isPurchaseOperation = isShippingV2PurchaseOperation(form.tipoOperacion);
  const isGiftOperation = isShippingV2GiftOperation(form.tipoOperacion);
  const subtotalProveedor = cantidadNormalizada !== null && costoProveedorUnitario !== null ? cantidadNormalizada * costoProveedorUnitario : null;
  const valorPotencialVenta = cantidadNormalizada !== null && precioVentaFinalUnitario !== null ? cantidadNormalizada * precioVentaFinalUnitario : null;
  const showQuantityWarning = submitAttempted && cantidadNormalizada === null;
  const showCostWarning = isPurchaseOperation && !parsePositiveMoneyInput(form.costoProveedor);
  const showGiftCostWarning = isGiftOperation && costoProveedorUnitario !== null && costoProveedorUnitario > 0;
  const finalPriceProvided = form.precioVentaFinal.trim() !== "";
  const showFinalPriceWarning = submitAttempted && finalPriceProvided && (precioVentaFinalDecimal === null || precioVentaFinalDecimal < 0);
  const showCategoryWarning = submitAttempted && !form.categoria;
  const showOrigenWarning = submitAttempted && !form.origen;

  const requisitosFaltantes = [
    ...(form.origen ? [] : [{ mensaje: "Elige dónde está el artículo." }]),
    ...(form.viaje === "caja" && !form.packingDestinoId ? [{ mensaje: "Elige la caja en la que viaja, o marca que viaja solo." }] : []),
    ...requisitosFaltantesItem({
      categoria: form.categoria,
      cantidad: cantidadNormalizada,
      requierePago: calculatedFlow.requierePago,
      esCompraProveedor: isPurchaseOperation,
      esRegaloProveedor: isGiftOperation,
      proveedorId: form.proveedorId,
      costoProveedor: costoProveedorUnitario,
      precioVentaFinal: finalPriceProvided ? precioVentaFinalDecimal : null,
    }),
  ];

  // Al cambiar el origen: el proveedor y el tipo de operación deben seguir
  // siendo válidos, y lo extranjero propone el primer casillero activo.
  useEffect(() => {
    setForm((current) => {
      const next = { ...current };
      if (current.proveedorId && !proveedoresCompra.some((p) => p.id === current.proveedorId)) next.proveedorId = "";
      if (!tiposOperacion.includes(current.tipoOperacion)) next.tipoOperacion = tiposOperacion[0] ?? "";
      if (current.origen === ORIGEN_EXTRANJERO && !current.casilleroId && casilleros[0]) next.casilleroId = casilleros[0].id;
      if (current.origen !== ORIGEN_EXTRANJERO && current.casilleroId) next.casilleroId = "";
      const changed = (Object.keys(next) as Array<keyof FormState>).some((k) => next[k] !== current[k]);
      return changed ? next : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.origen, proveedoresCompra.length]);

  useEffect(() => {
    if (form.packingDestinoId && !cajasCompatibles.some((c) => c.id === form.packingDestinoId)) update("packingDestinoId", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.proveedorId, form.casilleroId]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      // Al cambiar la categoría o el tipo de operación se vuelve a proponer
      // "Requiere inspección" según la nueva categoría.
      ...(key === "categoria" || key === "tipoOperacion" ? { requiereInspeccion: null } : {}),
    }));
  }

  function addPhotos(files: File[]) {
    setError("");
    if (!files.length) return;
    const nextPhotos: SelectedPhoto[] = [];
    const currentKeys = new Set(photos.map((photo) => `${photo.file.name}:${photo.file.size}:${photo.file.lastModified}`));
    const validacion = validarSeleccionFotosItem(
      files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
      { yaSubidas: photos.length }
    );
    if (!validacion.ok) {
      setError(validacion.motivo);
      return;
    }
    for (const file of files) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (currentKeys.has(key)) continue;
      currentKeys.add(key);
      nextPhotos.push({ id: `${key}:${crypto.randomUUID()}`, file, previewUrl: URL.createObjectURL(file) });
    }
    if (nextPhotos.length > 0) setPhotos((current) => [...current, ...nextPhotos]);
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
    if (requisitosFaltantes.length > 0) {
      setError(requisitosFaltantes.map((r) => `· ${r.mensaje}`).join("\n"));
      return;
    }
    setSaving(true);

    const extranjero = form.origen === ORIGEN_EXTRANJERO;
    const local = form.origen === ORIGEN_LOCAL;
    const enCaja = vieneDeAfuera && form.viaje === "caja";
    const campos: Record<string, string> = {
      origenArticulo: form.origen,
      proveedorId: form.proveedorId,
      categoria: form.categoria,
      tipoOperacion: form.tipoOperacion,
      nombre: form.nombre,
      sku: form.sku,
      skuProveedor: form.skuProveedor,
      marca: form.marca,
      modelo: form.modelo,
      numeroSerie: form.numeroSerie,
      condicion: form.condicion,
      requiereInspeccion: String(requiereInspeccion),
      cantidad: form.cantidad,
      unidad: form.unidad,
      costoProveedor: form.costoProveedor,
      precioVentaSugerido: form.precioVentaSugerido,
      precioVentaFinal: form.precioVentaFinal,
      descripcion: form.descripcion,
      observacionesInternas: form.observacionesInternas,
      proveedorLogisticoId: extranjero ? form.casilleroId : "",
      trackingHaciaIntermediario: extranjero ? form.trackingOrigen : "",
      transportistaOrigenId: extranjero ? form.transportistaOrigenId : "",
      // Si viaja en una caja, el tramo a Ecuador lo gobierna la caja.
      trackingDesdeIntermediario: extranjero && !enCaja ? form.trackingEcuador : "",
      trackingDirecto: local && !enCaja ? form.trackingLocal : "",
      transportistaEcuadorId: (extranjero || local) && !enCaja ? form.transportistaEcuadorId : "",
      packingDestinoId: enCaja ? form.packingDestinoId : "",
    };
    const formData = new FormData();
    Object.entries(campos).forEach(([key, value]) => formData.set(key, value));
    // Las fotos NO van aquí (tope de 4.5 MB de Vercel): se suben después.

    const response = await fetch("/api/shipping-v2/items", { method: "POST", body: formData });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      setError(String(payload.error || "No se pudo crear el artículo."));
      setSaving(false);
      return;
    }

    const creado = payload.data as { id?: string; sku?: string } | undefined;
    let avisoFotos = "";
    if (photos.length && !creado?.id) {
      avisoFotos = "Las fotos no se subieron: el servidor no devolvió el artículo creado. Agrégalas desde su ficha.";
    } else if (photos.length && creado?.id) {
      try {
        const resultado = await subirFotosItem(creado.id, photos.map((photo) => photo.file));
        avisoFotos = resultado.aviso;
      } catch (errorFotos) {
        avisoFotos = errorFotos instanceof FotosInvalidasError || errorFotos instanceof Error
          ? `Las fotos no subieron: ${errorFotos.message}`
          : "Las fotos no subieron.";
      }
    }

    const avisos = [payload.packingWarning, avisoFotos].filter(Boolean).join(" ");
    const notice = `Artículo ${creado?.sku || ""} creado.${avisos ? ` ${avisos}` : ""}`;
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
          <FormCard title="1. ¿Dónde está el artículo?" description="Esto ordena todo lo demás: qué proveedores aparecen, qué tipos de operación aplican y si hace falta seguir su llegada.">
            <div className="grid gap-2 sm:grid-cols-3">
              {ORIGENES_ARTICULO.map((o) => (
                <OrigenBoton key={o} origen={o} activo={form.origen === o} onClick={() => update("origen", o)} />
              ))}
            </div>
            {showOrigenWarning ? <p className="mt-2 text-xs leading-5 text-[#FFB07A]">Elige una opción.</p> : null}
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Field label="Proveedor" required={calculatedFlow.requierePago}>
                <SelectInput value={form.proveedorId} onChange={(event) => update("proveedorId", event.target.value)} disabled={!origen}>
                  <option value="">{origen ? "Sin proveedor" : "Primero elige dónde está"}</option>
                  {proveedoresCompra.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                </SelectInput>
              </Field>
              <Field label="Categoría" required={showCategoryWarning} error={showCategoryWarning ? "Campo obligatorio." : undefined}>
                <SelectInput value={form.categoria} aria-invalid={showCategoryWarning} onChange={(event) => update("categoria", event.target.value)}>
                  <option value="">Selecciona una categoría</option>
                  {SHIPPING_V2_CATEGORIAS.map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              </Field>
              <Field label="Tipo de operación">
                <SelectInput value={form.tipoOperacion} onChange={(event) => update("tipoOperacion", event.target.value)} disabled={!origen}>
                  {!origen ? <option value="">Primero elige dónde está</option> : null}
                  {tiposOperacion.map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              </Field>
            </div>
          </FormCard>

          <FormCard title="2. Datos del artículo">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="md:col-span-2 xl:col-span-3">
                <Field label="Nombre del artículo">
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
              <Field label="Marca">
                <TextInput value={form.marca} onChange={(event) => update("marca", event.target.value)} />
              </Field>
              <Field label="Modelo">
                <TextInput value={form.modelo} onChange={(event) => update("modelo", event.target.value)} />
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
              <Field label="SKU">
                <TextInput value={form.sku} onChange={(event) => update("sku", event.target.value)} placeholder="Se genera solo si se deja vacío" />
              </Field>
              <Field label="SKU proveedor">
                <TextInput value={form.skuProveedor} onChange={(event) => update("skuProveedor", event.target.value)} />
              </Field>
              <label className="flex min-w-0 cursor-pointer items-start gap-2.5 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 py-2.5 md:col-span-2 xl:col-span-3">
                <input
                  id="requiereInspeccion"
                  type="checkbox"
                  checked={requiereInspeccion}
                  onChange={(event) => update("requiereInspeccion", event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#D7FF4F]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#F5F5F5]">Requiere inspección técnica</span>
                  <span className="block text-xs leading-5 text-[#A7A7A7]">
                    {requiereInspeccion
                      ? "Se vende cuando esté en la tienda y se firme su ficha de inspección."
                      : "Se vende apenas esté en la tienda. No pasa por Inspección."}
                    {form.requiereInspeccion === null && form.categoria ? " (Propuesto por la categoría.)" : ""}
                  </span>
                </span>
              </label>
            </div>
          </FormCard>

          <FormCard title="3. Cantidad, costo y precio">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Cantidad" required error={showQuantityWarning ? "Entero mayor a 0." : undefined}>
                <TextInput type="number" min="1" step="1" value={form.cantidad} aria-invalid={showQuantityWarning} onChange={(event) => update("cantidad", event.target.value)} />
              </Field>
              <Field label="Unidad">
                <SelectInput value={form.unidad} onChange={(event) => update("unidad", event.target.value)}>
                  {SHIPPING_V2_UNIDADES.map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              </Field>
              <Field label="Costo proveedor por unidad">
                <TextInput type="number" min="0" step="0.01" value={form.costoProveedor} onChange={(event) => update("costoProveedor", event.target.value)} />
                {showCostWarning ? <p className="text-xs leading-5 text-[#FFB07A]">Una compra a proveedor requiere costo.</p> : null}
                {showGiftCostWarning ? <p className="text-xs leading-5 text-[#FFB07A]">En regalos debe estar vacío o en 0.</p> : null}
              </Field>
              <Field label="Precio venta sugerido por unidad">
                <TextInput type="number" min="0.01" step="0.01" value={form.precioVentaSugerido} onChange={(event) => update("precioVentaSugerido", event.target.value)} />
              </Field>
              <Field label="Precio venta final por unidad" error={showFinalPriceWarning ? "No puede ser negativo." : undefined}>
                <TextInput type="number" min="0" step="0.01" value={form.precioVentaFinal} aria-invalid={showFinalPriceWarning} onChange={(event) => update("precioVentaFinal", event.target.value)} />
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

          {vieneDeAfuera ? (
            <FormCard
              title="4. Llegada"
              description="Nada aquí es obligatorio. Si escribes un número de rastreo, el artículo pasa solo a “En tránsito”. Todo esto también se puede completar después en Logística."
            >
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    ["solo", "Viaja solo"],
                    ["caja", "Va en una caja"],
                    ["nose", "Todavía no sé"],
                  ] as const).map(([valor, texto]) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => update("viaje", valor)}
                      aria-pressed={form.viaje === valor}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${form.viaje === valor ? "border-[#D7FF4F] bg-[#D7FF4F]/12 text-[#D7FF4F]" : "border-[#3A3A36] bg-[#151515] text-[#F5F5F5] hover:border-[#D7FF4F]/50"}`}
                    >
                      {texto}
                    </button>
                  ))}
                </div>

                {form.viaje === "caja" ? (
                  <Field label="Caja en la que viaja">
                    <SelectInput value={form.packingDestinoId} onChange={(event) => update("packingDestinoId", event.target.value)}>
                      <option value="">{cajasCompatibles.length ? "Elige una caja abierta" : "No hay cajas abiertas de este proveedor o casillero"}</option>
                      {cajasCompatibles.map((c) => <option key={c.id} value={c.id}>{c.codigo}{c.nombre ? ` · ${c.nombre}` : ""}</option>)}
                    </SelectInput>
                    <p className="text-xs leading-5 text-[#A7A7A7]">Desde que entra a la caja, el rastreo de la caja lo gobierna. Si no está la caja, créala en Logística y agrégalo ahí.</p>
                  </Field>
                ) : null}

                {origen === ORIGEN_EXTRANJERO ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Casillero">
                      <SelectInput value={form.casilleroId} onChange={(event) => update("casilleroId", event.target.value)}>
                        <option value="">Sin casillero</option>
                        {casilleros.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                      </SelectInput>
                    </Field>
                    <div className="hidden md:block" />
                    <Field label="Rastreo hasta el casillero">
                      <TextInput value={form.trackingOrigen} onChange={(event) => update("trackingOrigen", event.target.value)} placeholder="Ej. 9400 1000 0000…" />
                    </Field>
                    <Field label="Transportista hasta el casillero">
                      <SelectInput value={form.transportistaOrigenId} onChange={(event) => update("transportistaOrigenId", event.target.value)}>
                        <option value="">—</option>
                        {(transportistasOrigen.length ? transportistasOrigen : logisticos).map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                      </SelectInput>
                    </Field>
                    {form.viaje !== "caja" ? (
                      <>
                        <Field label="Rastreo casillero → Ecuador">
                          <TextInput value={form.trackingEcuador} onChange={(event) => update("trackingEcuador", event.target.value)} />
                        </Field>
                        <Field label="Transportista en Ecuador">
                          <SelectInput value={form.transportistaEcuadorId} onChange={(event) => update("transportistaEcuadorId", event.target.value)}>
                            <option value="">—</option>
                            {(transportistasEcuador.length ? transportistasEcuador : logisticos).map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                          </SelectInput>
                        </Field>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {origen === ORIGEN_LOCAL && form.viaje !== "caja" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Rastreo">
                      <TextInput value={form.trackingLocal} onChange={(event) => update("trackingLocal", event.target.value)} />
                    </Field>
                    <Field label="Transportista">
                      <SelectInput value={form.transportistaEcuadorId} onChange={(event) => update("transportistaEcuadorId", event.target.value)}>
                        <option value="">—</option>
                        {(transportistasEcuador.length ? transportistasEcuador : logisticos).map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                      </SelectInput>
                    </Field>
                  </div>
                ) : null}
              </div>
            </FormCard>
          ) : null}

          <FormCard title={vieneDeAfuera ? "5. Descripción y observaciones" : "4. Descripción y observaciones"}>
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
          <FormCard title="Fotos del artículo" description="Hasta 10 imágenes JPG, PNG o WebP.">
            <label onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} className="grid min-h-28 cursor-pointer place-items-center rounded-xl border border-dashed border-[#D7FF4F]/35 bg-[#151515] px-4 py-5 text-center transition hover:border-[#D7FF4F]/70 hover:bg-[#1E1F1C]">
              <input type="file" accept={ACCEPT_FOTOS_ITEM} multiple className="sr-only" onChange={handlePhotoInput} />
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

          <FormCard title="Qué pasará al guardar">
            <ul className="space-y-1.5 text-xs leading-5 text-[#A7A7A7]">
              {!origen ? <li>Elige dónde está el artículo.</li> : null}
              {origen === ORIGEN_TIENDA ? <li>Queda <b className="text-[#F5F5F5]">recibido</b> en la tienda.</li> : null}
              {vieneDeAfuera ? <li>Aparece en <b className="text-[#F5F5F5]">Recepción → Por llegar</b> hasta que alguien marque que llegó.</li> : null}
              {vieneDeAfuera && form.viaje === "caja" && form.packingDestinoId ? <li>Se agrega a la caja elegida.</li> : null}
              {vieneDeAfuera && form.viaje !== "caja" && (form.trackingOrigen || form.trackingEcuador || form.trackingLocal) ? <li>Como tiene rastreo, pasa a <b className="text-[#F5F5F5]">En tránsito</b>.</li> : null}
              {origen ? (
                <li>{requiereInspeccion ? "Se vende cuando esté en la tienda y se firme su inspección." : "Se vende apenas esté en la tienda."}</li>
              ) : null}
              {calculatedFlow.requierePago ? <li>Aparece en <b className="text-[#F5F5F5]">Pagos → Por pagar</b> hasta registrar el pago al proveedor.</li> : null}
            </ul>
          </FormCard>

          <section className="rounded-xl border border-[#30312D] bg-[#11120F] p-3 shadow-xl shadow-black/15">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <Link href="/shipping-v2/items" className="rounded-lg border border-[#3A3A36] bg-[#252622] px-4 py-2.5 text-center text-sm font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">
                Cancelar
              </Link>
              <button type="submit" disabled={saving} className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2.5 text-sm font-black text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? "Guardando..." : "Registrar artículo"}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
