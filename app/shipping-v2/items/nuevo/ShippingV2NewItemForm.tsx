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
  /** Punto 4: llega desde "Registrar activo" (pestaña Activos de la tienda). */
  esActivoInicial?: boolean;
};

/** Punto 4 (8-oct): ¿es mercadería para vender o un activo de la tienda? */
type Destino = "mercaderia" | "activo";

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type ViajeOpcion = "solo" | "caja" | "nose";

type FormState = {
  destino: Destino;
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
  destino: "mercaderia",
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

// Diseño (8-oct): pantalla de uso diario. Etiquetas cortas, controles
// segmentados en vez de tarjetas, ayuda solo en tooltips. Regla del dueño:
// optimizar para el uso número 100, no para el primero.

const ORIGEN_CORTO: Record<OrigenArticulo, string> = {
  [ORIGEN_TIENDA]: "En tienda",
  [ORIGEN_EXTRANJERO]: "Extranjero",
  [ORIGEN_LOCAL]: "Local",
};

const ORIGEN_AYUDA: Record<OrigenArticulo, string> = {
  [ORIGEN_TIENDA]: "Ya está aquí: nace recibido.",
  [ORIGEN_EXTRANJERO]: "Viene de fuera del país (casillero). Va a Recepción → Por llegar.",
  [ORIGEN_LOCAL]: "Proveedor en Ecuador. Va a Recepción → Por llegar.",
};

const inputBase = "h-8 w-full rounded-md border bg-[#151515] px-2.5 text-sm text-[#F5F5F5] outline-none placeholder:text-[#5E5F59] transition";

/** Control segmentado compacto. */
function Seg<T extends string>({ value, options, onChange, invalid }: {
  value: T | "";
  options: ReadonlyArray<{ value: T; label: string; title?: string }>;
  onChange: (value: T) => void;
  invalid?: boolean;
}) {
  return (
    <div role="radiogroup" className={`inline-flex w-full overflow-hidden rounded-md border ${invalid ? "border-[#FF914D]/70" : "border-[#3A3A36]"}`}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} title={o.title} onClick={() => onChange(o.value)}
            className={`h-8 flex-1 whitespace-nowrap border-r border-[#3A3A36] px-2.5 text-[13px] font-semibold transition last:border-r-0 ${on ? "bg-[#D7FF4F] text-[#151515]" : "bg-[#151515] text-[#B4B5AC] hover:text-[#D7FF4F]"}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children, required, error, className = "", grupo = false }: {
  label: string; children: ReactNode; required?: boolean; error?: string; className?: string;
  /** true para botones o casillas: no se envuelve en <label> (tocar el título no activa la primera opción). */
  grupo?: boolean;
}) {
  const Tag = grupo ? "div" : "label";
  return (
    <Tag className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">
        {label}
        {required ? <span className="ml-0.5 text-[#FF914D]">*</span> : null}
        {error ? <span className="ml-1.5 normal-case tracking-normal text-[#FFB07A]">{error}</span> : null}
      </span>
      {children}
    </Tag>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return <input {...props} className={`${inputBase} ${invalid ? "border-[#FF914D]/70" : "border-[#3A3A36] focus:border-[#D7FF4F]/70"}`} />;
}

function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return <select {...props} className={`${inputBase} ${invalid ? "border-[#FF914D]/70" : "border-[#3A3A36] focus:border-[#D7FF4F]/70"}`} />;
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#2E2F28] bg-[#171814] px-3 pb-3 pt-2">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#D7FF4F]">{title}</h2>
        {aside ? <div className="ml-auto text-[11px] text-[#7E7F76]">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
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

export function ShippingV2NewItemForm({ proveedores, cajasAbiertas, esActivoInicial = false }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ ...initialState, destino: esActivoInicial ? "activo" : "mercaderia" });
  const esActivo = form.destino === "activo";
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
  // Un activo no se registra como despiece (eso es para sacar piezas a la venta).
  const tiposOperacion = origen
    ? TIPOS_OPERACION_POR_ORIGEN[origen].filter((t) => !(esActivo && t === "Despiece de equipo"))
    : [];

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
  // Un activo no pide inspección salvo que se marque (dueño, 8-oct).
  const requiereInspeccion = form.requiereInspeccion ?? (esActivo ? false : requiereInspeccionPorDefecto({ categoria: form.categoria, tipoOperacion: form.tipoOperacion }));
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
  const finalPriceProvided = !esActivo && form.precioVentaFinal.trim() !== "";
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
  }, [form.origen, form.destino, proveedoresCompra.length]);

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
      // Al cambiar la categoría, el tipo de operación o el destino se vuelve a
      // proponer "Requiere inspección".
      ...(key === "categoria" || key === "tipoOperacion" || key === "destino" ? { requiereInspeccion: null } : {}),
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
      // Un activo no se vende: no lleva precio.
      precioVentaSugerido: esActivo ? "" : form.precioVentaSugerido,
      precioVentaFinal: esActivo ? "" : form.precioVentaFinal,
      usoLocal: esActivo ? "true" : "false",
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
    const notice = `${esActivo ? "Activo" : "Artículo"} ${creado?.sku || ""} creado.${avisos ? ` ${avisos}` : ""}`;
    window.sessionStorage.setItem("shipping-v2:notice", notice);
    router.push(esActivo ? "/shipping-v2/activos" : "/shipping-v2/items");
    router.refresh();
  }

  // Lo que pasará al guardar, en chips (sin frases largas).
  const resumen = [
    esActivo ? "Activo de la tienda" : null,
    origen === ORIGEN_TIENDA ? "Recibido" : null,
    vieneDeAfuera ? "Por llegar" : null,
    vieneDeAfuera && form.viaje !== "caja" && (form.trackingOrigen || form.trackingEcuador || form.trackingLocal) ? "En tránsito" : null,
    vieneDeAfuera && form.viaje === "caja" && form.packingDestinoId ? "En caja" : null,
    origen && requiereInspeccion ? "Con inspección" : null,
    calculatedFlow.requierePago ? "Por pagar" : null,
  ].filter(Boolean) as string[];

  const transportistasEc = transportistasEcuador.length ? transportistasEcuador : logisticos;

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full max-w-none space-y-2 pb-16">
      {error ? (
        <div className="whitespace-pre-line rounded-md border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{error}</div>
      ) : null}

      <div className="grid gap-2 lg:grid-cols-12 lg:items-start">
        <div className="space-y-2 lg:col-span-9">
          <Section
            title="Artículo"
            aside={
              // Casi todo es mercadería: "Uso local" queda discreto y solo se
              // marca para un activo de la tienda (decisión del dueño, 8-oct).
              <label title="Activo de la tienda: no se vende y aparece en Activos de la tienda."
                className={`flex cursor-pointer items-center gap-1.5 ${esActivo ? "font-semibold text-[#C9BFFF]" : ""}`}>
                <input type="checkbox" checked={esActivo} onChange={(event) => update("destino", event.target.checked ? "activo" : "mercaderia")}
                  className="h-3.5 w-3.5 accent-[#8B73FF]" />
                Uso local
              </label>
            }
          >
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-12">
              <Field label="Origen" grupo required error={showOrigenWarning ? "Elige uno" : undefined} className="xl:col-span-5">
                <Seg<OrigenArticulo>
                  value={form.origen}
                  invalid={showOrigenWarning}
                  onChange={(v) => update("origen", v)}
                  options={ORIGENES_ARTICULO.map((o) => ({ value: o, label: ORIGEN_CORTO[o], title: ORIGEN_AYUDA[o] }))}
                />
              </Field>
              <Field label="Operación" className="xl:col-span-3">
                <SelectInput value={form.tipoOperacion} onChange={(event) => update("tipoOperacion", event.target.value)} disabled={!origen}>
                  {!origen ? <option value="">—</option> : null}
                  {tiposOperacion.map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              </Field>

              <Field label="Proveedor" required={calculatedFlow.requierePago} className="xl:col-span-4">
                <SelectInput value={form.proveedorId} onChange={(event) => update("proveedorId", event.target.value)} disabled={!origen}>
                  <option value="">{origen ? "Sin proveedor" : "—"}</option>
                  {proveedoresCompra.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                </SelectInput>
              </Field>
              <Field label="Categoría" required error={showCategoryWarning ? "Obligatorio" : undefined} className="xl:col-span-4">
                <SelectInput value={form.categoria} aria-invalid={showCategoryWarning} onChange={(event) => update("categoria", event.target.value)}>
                  <option value="">—</option>
                  {SHIPPING_V2_CATEGORIAS.map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              </Field>
              <Field label="Condición" className="xl:col-span-3">
                <SelectInput value={form.condicion} onChange={(event) => update("condicion", event.target.value)}>
                  <option value="">—</option>
                  {SHIPPING_V2_CONDICIONES.map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              </Field>
              <Field label="Inspección" grupo className="xl:col-span-5">
                <label
                  title={requiereInspeccion ? "Se vende (o entra en uso) al firmar su ficha de inspección." : "No pasa por Inspección."}
                  className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[#3A3A36] bg-[#151515] px-2.5 text-[13px] text-[#F5F5F5]"
                >
                  <input type="checkbox" checked={requiereInspeccion} onChange={(event) => update("requiereInspeccion", event.target.checked)} className="h-3.5 w-3.5 accent-[#D7FF4F]" />
                  Requiere inspección
                  {form.requiereInspeccion === null && form.categoria && !esActivo ? <span className="ml-auto text-[10.5px] text-[#7E7F76]">por categoría</span> : null}
                </label>
              </Field>

              <Field label="Nombre" grupo className="sm:col-span-2 xl:col-span-12">
                <TextInput value={form.nombre} onChange={(event) => update("nombre", event.target.value)} />
                {showFastNameSuggestion ? (
                  <button type="button" onClick={() => update("nombre", fastNameSuggestion)}
                    className="mt-1 max-w-full truncate text-left text-[11.5px] text-[#D7FF4F] hover:underline" title="Usar este nombre">
                    Usar: {fastNameSuggestion}
                  </button>
                ) : null}
              </Field>
              <Field label="Marca" className="xl:col-span-3">
                <TextInput value={form.marca} onChange={(event) => update("marca", event.target.value)} />
              </Field>
              <Field label="Modelo" className="xl:col-span-3">
                <TextInput value={form.modelo} onChange={(event) => update("modelo", event.target.value)} />
              </Field>
              <Field label="Nº de serie" className="xl:col-span-2">
                <TextInput value={form.numeroSerie} onChange={(event) => update("numeroSerie", event.target.value)} />
              </Field>
              <Field label="SKU" className="xl:col-span-2">
                <TextInput value={form.sku} onChange={(event) => update("sku", event.target.value)} placeholder="Automático" />
              </Field>
              <Field label="SKU proveedor" className="xl:col-span-2">
                <TextInput value={form.skuProveedor} onChange={(event) => update("skuProveedor", event.target.value)} />
              </Field>
            </div>
          </Section>

          <Section
            title={esActivo ? "Cantidad y costo" : "Cantidad y precio"}
            aside={
              <span className="tabular-nums">
                Subtotal <b className="text-[#F5F5F5]">{formatMoneyPreview(subtotalProveedor)}</b>
                {!esActivo ? <> · Venta <b className="text-[#D7FF4F]">{formatMoneyPreview(valorPotencialVenta)}</b></> : null}
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              <Field label="Cantidad" required error={showQuantityWarning ? "Entero > 0" : undefined}>
                <TextInput type="number" min="1" step="1" value={form.cantidad} aria-invalid={showQuantityWarning} onChange={(event) => update("cantidad", event.target.value)} />
              </Field>
              <Field label="Unidad">
                <SelectInput value={form.unidad} onChange={(event) => update("unidad", event.target.value)}>
                  {SHIPPING_V2_UNIDADES.map((option) => <option key={option}>{option}</option>)}
                </SelectInput>
              </Field>
              <Field
                label="Costo unitario"
                required={isPurchaseOperation}
                error={showCostWarning ? "Obligatorio" : showGiftCostWarning ? "Regalo: vacío o 0" : undefined}
              >
                <TextInput type="number" min="0" step="0.01" value={form.costoProveedor} aria-invalid={showCostWarning || showGiftCostWarning} onChange={(event) => update("costoProveedor", event.target.value)} />
              </Field>
              {!esActivo ? (
                <>
                  <Field label="Precio sugerido">
                    <TextInput type="number" min="0.01" step="0.01" value={form.precioVentaSugerido} onChange={(event) => update("precioVentaSugerido", event.target.value)} />
                  </Field>
                  <Field label="Precio final" error={showFinalPriceWarning ? "No negativo" : undefined}>
                    <TextInput type="number" min="0" step="0.01" value={form.precioVentaFinal} aria-invalid={showFinalPriceWarning} onChange={(event) => update("precioVentaFinal", event.target.value)} />
                  </Field>
                </>
              ) : null}
            </div>
          </Section>

          {vieneDeAfuera ? (
            <Section title="Llegada" aside="Opcional · también en Logística">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-12">
                <Field label="Viaja" grupo className="xl:col-span-4">
                  <Seg<ViajeOpcion>
                    value={form.viaje}
                    onChange={(v) => update("viaje", v)}
                    options={[
                      { value: "solo", label: "Solo" },
                      { value: "caja", label: "En caja", title: "El rastreo de la caja lo gobierna desde que entra." },
                      { value: "nose", label: "Por definir" },
                    ]}
                  />
                </Field>
                {form.viaje === "caja" ? (
                  <Field label="Caja" className="xl:col-span-4" error={!cajasCompatibles.length ? "Sin cajas abiertas: créala en Logística" : undefined}>
                    <SelectInput value={form.packingDestinoId} onChange={(event) => update("packingDestinoId", event.target.value)}>
                      <option value="">—</option>
                      {cajasCompatibles.map((c) => <option key={c.id} value={c.id}>{c.codigo}{c.nombre ? ` · ${c.nombre}` : ""}</option>)}
                    </SelectInput>
                  </Field>
                ) : null}
                {origen === ORIGEN_EXTRANJERO ? (
                  <Field label="Casillero" className="xl:col-span-4">
                    <SelectInput value={form.casilleroId} onChange={(event) => update("casilleroId", event.target.value)}>
                      <option value="">Sin casillero</option>
                      {casilleros.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                    </SelectInput>
                  </Field>
                ) : null}
              </div>
              {origen === ORIGEN_EXTRANJERO ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" title="Un rastreo pasa el artículo a En tránsito.">
                  <Field label="Rastreo → casillero">
                    <TextInput value={form.trackingOrigen} onChange={(event) => update("trackingOrigen", event.target.value)} />
                  </Field>
                  <Field label="Transportista origen">
                    <SelectInput value={form.transportistaOrigenId} onChange={(event) => update("transportistaOrigenId", event.target.value)}>
                      <option value="">—</option>
                      {(transportistasOrigen.length ? transportistasOrigen : logisticos).map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                    </SelectInput>
                  </Field>
                  {form.viaje !== "caja" ? (
                    <>
                      <Field label="Rastreo → Ecuador">
                        <TextInput value={form.trackingEcuador} onChange={(event) => update("trackingEcuador", event.target.value)} />
                      </Field>
                      <Field label="Transportista Ecuador">
                        <SelectInput value={form.transportistaEcuadorId} onChange={(event) => update("transportistaEcuadorId", event.target.value)}>
                          <option value="">—</option>
                          {transportistasEc.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                        </SelectInput>
                      </Field>
                    </>
                  ) : null}
                </div>
              ) : null}
              {origen === ORIGEN_LOCAL && form.viaje !== "caja" ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" title="Un rastreo pasa el artículo a En tránsito.">
                  <Field label="Rastreo">
                    <TextInput value={form.trackingLocal} onChange={(event) => update("trackingLocal", event.target.value)} />
                  </Field>
                  <Field label="Transportista">
                    <SelectInput value={form.transportistaEcuadorId} onChange={(event) => update("transportistaEcuadorId", event.target.value)}>
                      <option value="">—</option>
                      {transportistasEc.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                    </SelectInput>
                  </Field>
                </div>
              ) : null}
            </Section>
          ) : null}

          <details className="group rounded-lg border border-[#2E2F28] bg-[#171814] px-3 py-2" open={Boolean(form.descripcion || form.observacionesInternas)}>
            <summary className="cursor-pointer list-none text-[11px] font-bold uppercase tracking-wider text-[#D7FF4F]">
              <span className="mr-1 inline-block transition group-open:rotate-90">›</span> Descripción y observaciones
            </summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <Field label="Descripción">
                <textarea value={form.descripcion} onChange={(event) => update("descripcion", event.target.value)} rows={2}
                  className="w-full rounded-md border border-[#3A3A36] bg-[#151515] px-2.5 py-1.5 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70" />
              </Field>
              <Field label="Observaciones internas">
                <textarea value={form.observacionesInternas} onChange={(event) => update("observacionesInternas", event.target.value)} rows={2}
                  className="w-full rounded-md border border-[#3A3A36] bg-[#151515] px-2.5 py-1.5 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70" />
              </Field>
            </div>
          </details>
        </div>

        <aside className="lg:col-span-3">
          <Section title="Fotos" aside={`${photos.length}/10`}>
            <label onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} title="JPG, PNG o WebP. También puedes arrastrarlas."
              className="flex h-9 cursor-pointer items-center justify-center rounded-md border border-dashed border-[#D7FF4F]/40 bg-[#151515] text-[13px] font-semibold text-[#D7FF4F] transition hover:border-[#D7FF4F]/80">
              <input type="file" accept={ACCEPT_FOTOS_ITEM} multiple className="sr-only" onChange={handlePhotoInput} />
              + Agregar fotos
            </label>
            {photos.length > 0 ? (
              <div className="mt-2 grid grid-cols-4 gap-1.5 lg:grid-cols-3">
                {photos.map((photo) => (
                  <div key={photo.id} className="group relative overflow-hidden rounded-md border border-[#3A3A36]">
                    <img src={photo.previewUrl} alt={photo.file.name} title={photo.file.name} className="aspect-square w-full object-cover" />
                    <button type="button" onClick={() => removePhoto(photo.id)} aria-label={`Quitar ${photo.file.name}`}
                      className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded bg-black/70 text-xs text-[#F5F5F5] hover:text-[#FFB07A]">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </Section>
        </aside>
      </div>

      {/* Barra fija: lo que pasará al guardar (chips) y las acciones. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-lg border border-[#2E2F28] bg-[#11120F]/95 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {resumen.map((r) => (
            <span key={r} className="rounded-full border border-[#3A3A36] bg-[#1B1C17] px-2 py-0.5 text-[11px] font-semibold text-[#B4B5AC]">{r}</span>
          ))}
        </div>
        <Link href={esActivo ? "/shipping-v2/activos" : "/shipping-v2/items"}
          className="rounded-md border border-[#3A3A36] px-3 py-1.5 text-sm font-semibold text-[#B4B5AC] transition hover:text-[#F5F5F5]">
          Cancelar
        </Link>
        <button type="submit" disabled={saving}
          className="rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-1.5 text-sm font-black text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Guardando…" : esActivo ? "Registrar activo" : "Registrar artículo"}
        </button>
      </div>
    </form>
  );
}
