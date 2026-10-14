"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { CostosTraerlo } from "@/components/shipping-v2/CostosTraerlo";
import {
  calculateShippingV2PackingProviderCostSummary,
  calculateShippingV2PackingProviderItemSubtotal,
  formatShippingV2PackingItemsUnitsSummary,
  resolveShippingV2PackingItemUnits,
} from "@/lib/shipping-v2/packing-calculations";
import {
  calculateShippingV2PackingReviewProgress,
  formatShippingV2PackingBodegaProgress,
  formatShippingV2PackingReviewProgress,
  getShippingV2PackingFaseInfo,
  getShippingV2PackingWorkHint,
} from "@/lib/shipping-v2/packing-lifecycle";
import { createShippingV2ProveedorLabelMap, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { buildTrackingUrl } from "@/lib/shipping-v2/tracking";
import { getEcuadorTransportProvidersForPacking, getUsaTransportProviders, providerTrackingLabel } from "@/lib/shipping-v2/tracking-providers";
import { SHIPPING_V2_PACKING_TIPOS, SHIPPING_V2_REGLAS_DISTRIBUCION_COSTOS, type ShippingV2AccessPermissions, type ShippingV2Destinatario, type ShippingV2Item, type ShippingV2Novedad, type ShippingV2Packing, type ShippingV2PackingStatusAction, type ShippingV2Proveedor } from "@/types/shipping-v2";

type Props = {
  packing: ShippingV2Packing;
  candidates: ShippingV2Item[];
  proveedores: ShippingV2Proveedor[];
  novedades: ShippingV2Novedad[];
  destinatarios: ShippingV2Destinatario[];
  isAdmin: boolean;
  /** Rol "Administrador" real del sistema — distinto de isAdmin (cualquier staff). Solo esto habilita reabrir un packing cerrado. */
  isSiteAdmin: boolean;
  permissions: ShippingV2AccessPermissions | null;
  providerName?: string;
};
type EditablePackingField = "nombre" | "tipo" | "ordenReferencia" | "observaciones" | "proveedorResponsableId" | "trackingUsa" | "transportistaUsa" | "trackingEc" | "transportistaEc" | "peso";
type SaveState = Record<string, "saving" | "saved" | "error" | undefined>;

function display(value?: string | number | null) {
  if (value === null || value === undefined) return "-";
  const text = String(value).trim();
  return text || "-";
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium" }).format(date);
}

function formatCurrencyZero(value: number | null | undefined) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value ?? 0);
}

function packingProviderItemCalculation(item: ShippingV2Item) {
  try {
    return { subtotal: item.subtotalProveedorPacking ?? calculateShippingV2PackingProviderItemSubtotal(item), error: "" };
  } catch (error) {
    return { subtotal: null, error: error instanceof Error ? error.message : "No se pudo calcular el subtotal proveedor." };
  }
}

function packingProviderCostSummary(items: ShippingV2Item[]) {
  try {
    return { ...calculateShippingV2PackingProviderCostSummary(items), error: "" };
  } catch (error) {
    // Red de seguridad: el cálculo de unidades ya no lanza, pero un costo
    // proveedor corrupto sí. Se muestra lo que sí se pudo sumar en vez de
    // dejar la tarjeta de costos en blanco.
    const subtotalSeguro = items.reduce((sum, item) => sum + (packingProviderItemCalculation(item).subtotal ?? 0), 0);
    const unidades = items.map((item) => resolveShippingV2PackingItemUnits(item));
    return {
      costoTotalProveedorItems: subtotalSeguro,
      referenciasIncluidas: items.length,
      unidadesTotales: unidades.reduce((sum, unidad) => sum + unidad.unidades, 0),
      referenciasConUnidadesEstimadas: unidades.filter((unidad) => unidad.estimada).length,
      advertenciasUnidades: unidades.filter((unidad) => unidad.estimada).map((unidad) => unidad.advertencia),
      error: error instanceof Error ? error.message : "No se pudo calcular el total proveedor de items.",
    };
  }
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isOpen(status: string) {
  return normalize(status) === "en proceso";
}

function itemSearchText(item: ShippingV2Item, providerLabel: string, logisticsProviderLabel: string) {
  return [item.sku, item.nombre, item.estado, item.tipoOperacion, item.categoria, providerLabel, logisticsProviderLabel, item.modoLogistico].join(" ").toLowerCase();
}

function isAirtableRecordId(value?: string) {
  return Boolean(value?.trim().match(/^rec[A-Za-z0-9]{14,}$/));
}

function providerDisplayValue(...values: Array<string | undefined>) {
  for (const value of values) {
    const text = value?.trim();
    if (text && !isAirtableRecordId(text)) return text;
  }
  return "";
}

// ─── Estilo compacto (regla UX/UI del dueño, 14-oct): uso número 100 ───────
const lbl = "mb-0.5 flex items-center justify-between gap-2 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]";
const inp = "h-8 w-full min-w-0 rounded-md border border-[#3A3A36] bg-[#151515] px-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:cursor-not-allowed disabled:opacity-60";
const btn = "inline-flex h-8 items-center whitespace-nowrap rounded-md border border-[#3A3A36] px-2.5 text-[12.5px] font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:cursor-not-allowed disabled:opacity-50";
const btnPrim = "inline-flex h-8 items-center whitespace-nowrap rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-[12.5px] font-black text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";
const seccion = "rounded-lg border border-[#2E2F28] bg-[#171814]";
const chipBase = "inline-flex items-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10.5px] font-bold";
const chip = {
  falta: `${chipBase} border border-yellow-300/40 text-yellow-200`,
  mal: `${chipBase} border border-[#FF914D]/45 text-[#FFB07A]`,
  ok: `${chipBase} border border-[#D7FF4F]/40 text-[#D7FF4F]`,
  mute: `${chipBase} border border-[#3A3A36] text-[#A7A7A7]`,
};

/** Costos de un artículo en una línea (el detalle completo va en el tooltip). */
function CostosDelItem({ item, includeAssignedCosts = false }: { item: ShippingV2Item; includeAssignedCosts?: boolean }) {
  const calculation = packingProviderItemCalculation(item);
  const unidades = resolveShippingV2PackingItemUnits(item);
  const detalle = [
    unidades.estimada ? `Unidades en caja estimadas: ${unidades.unidades} (stock actual ${display(item.cantidad)})` : "",
    ...(includeAssignedCosts ? [
      item.unidadesEnPacking !== null ? `Flete del registro: ${formatCurrencyZero(item.fleteAsignadoRegistro)}` : "",
      `Flete por unidad: ${formatCurrencyZero(item.costoFleteAsignado)}`,
      item.unidadesEnPacking !== null && item.arancelAsignadoRegistro ? `Arancel del registro: ${formatCurrencyZero(item.arancelAsignadoRegistro)}` : "",
      `Arancel por unidad: ${formatCurrencyZero(item.costoArancelAsignado)}`,
      item.unidadesEnPacking !== null && item.otrosCostosAsignadosRegistro ? `Otros del registro: ${formatCurrencyZero(item.otrosCostosAsignadosRegistro)}` : "",
      `Otros por unidad: ${formatCurrencyZero(item.otrosCostosAsignados)}`,
    ] : []),
  ].filter(Boolean).join("\n");
  return (
    <div className="text-right text-[12px] tabular-nums leading-5 text-[#A7A7A7]" title={detalle || undefined}>
      <p>
        <span className={unidades.estimada ? "text-[#BDEAFF]" : ""}>{unidades.estimada ? "≈" : ""}{unidades.unidades}</span>
        {" × "}{formatCurrencyZero(item.costoProveedor)}{" = "}
        {item.esRegalo ? <span className={chip.mute}>Regalo · no suma</span>
          : <b className="text-[#F5F5F5]">{calculation.error ? "—" : formatCurrencyZero(calculation.subtotal)}</b>}
      </p>
      {includeAssignedCosts ? (
        <p>Log. {formatCurrencyZero(item.costoLogisticoAsignado)}/u · Total <b className="text-[#D7FF4F]">{formatCurrencyZero(item.costoTotalUnidad)}</b>/u</p>
      ) : null}
      {calculation.error ? <p className="text-[11px] font-semibold text-[#FFB07A]">{calculation.error}</p> : null}
    </div>
  );
}

function destinatarioMatchesPacking(destinatario: ShippingV2Destinatario, packing: ShippingV2Packing) {
  return destinatario.packingIds.includes(packing.id) || destinatario.packingLabels.includes(packing.packingId);
}

function destinatarioOptionLabel(destinatario: ShippingV2Destinatario) {
  return [
    destinatario.nombre,
    destinatario.empresa,
    [destinatario.ciudad, destinatario.estado].filter(Boolean).join(", "),
    destinatario.direccion,
  ].filter(Boolean).join(" · ");
}

function destinatarioResumen(destinatario: ShippingV2Destinatario) {
  return [
    destinatario.nombre,
    destinatario.empresa,
    [destinatario.direccion, destinatario.direccionLinea2].filter(Boolean).join(" "),
    [destinatario.ciudad, destinatario.estado, destinatario.codigoPostal].filter(Boolean).join(", "),
    destinatario.pais,
    destinatario.telefono ? `Tel. ${destinatario.telefono}` : "",
  ].filter(Boolean).join(" · ");
}

function SaveBadge({ status }: { status?: "saving" | "saved" | "error" }) {
  if (!status) return null;
  const label = status === "saving" ? "Guardando…" : status === "saved" ? "✓" : "Error";
  const color = status === "error" ? "text-[#FFB07A]" : "text-[#D7FF4F]";
  return <span className={`normal-case tracking-normal text-[11px] font-semibold ${color}`}>{label}</span>;
}

function TextoCampo({
  label,
  value,
  disabled,
  status,
  multiline,
  placeholder,
  title,
  inputMode,
  className = "",
  onSave,
}: {
  label: string;
  value?: string;
  disabled?: boolean;
  status?: "saving" | "saved" | "error";
  multiline?: boolean;
  placeholder?: string;
  title?: string;
  inputMode?: "decimal" | "text";
  className?: string;
  onSave: (value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value || "");
  useEffect(() => setLocalValue(value || ""), [value]);
  const commit = () => {
    if (!disabled && localValue !== (value || "")) onSave(localValue);
  };
  return (
    <label className={`block min-w-0 ${className}`} title={title}>
      <span className={lbl}>{label}<SaveBadge status={status} /></span>
      {multiline ? (
        <textarea
          value={localValue}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          onChange={(event) => setLocalValue(event.target.value)}
          onBlur={commit}
          className={`${inp} h-auto min-h-8 resize-y py-1.5`}
        />
      ) : (
        <input
          value={localValue}
          disabled={disabled}
          placeholder={placeholder}
          inputMode={inputMode}
          onChange={(event) => setLocalValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
          className={inp}
        />
      )}
    </label>
  );
}

function SelectCampo({
  label,
  value,
  options,
  disabled,
  status,
  className = "",
  onSave,
}: {
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  status?: "saving" | "saved" | "error";
  className?: string;
  onSave: (value: string) => void;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className={lbl}>{label}<SaveBadge status={status} /></span>
      <select value={value || ""} disabled={disabled} onChange={(event) => onSave(event.target.value)} className={inp}>
        {options.map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

/** Rastreo con copiar y "ver" al lado; si falta configurar el transportista, lo dice en el tooltip. */
function RastreoCampo({
  label,
  value,
  disabled,
  status,
  trackingUrl,
  help,
  copied,
  className = "",
  onCopy,
  onSave,
}: {
  label: string;
  value?: string;
  disabled?: boolean;
  status?: "saving" | "saved" | "error";
  trackingUrl: string | null;
  help?: string | null;
  copied: boolean;
  className?: string;
  onCopy: () => void;
  onSave: (value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value || "");
  useEffect(() => setLocalValue(value || ""), [value]);
  const commit = () => {
    if (!disabled && localValue !== (value || "")) onSave(localValue);
  };
  const tiene = Boolean(value?.trim());
  return (
    <div className={`min-w-0 ${className}`}>
      <span className={lbl}>{label}<SaveBadge status={status} /></span>
      <div className="flex gap-1">
        <input
          value={localValue}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => setLocalValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
          className={`${inp} font-mono text-[12.5px]`}
        />
        {tiene ? <button type="button" onClick={onCopy} className={`${btn} px-2`} title="Copiar">{copied ? "✓" : "Copiar"}</button> : null}
        {tiene && trackingUrl ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className={`${btn} px-2 text-[#D7FF4F]`}>Ver</a> : null}
        {tiene && !trackingUrl && help ? <span className={`${chip.falta} self-center`} title={help}>Sin enlace</span> : null}
      </div>
    </div>
  );
}

type PackingStatusConfig = {
  action?: ShippingV2PackingStatusAction;
  label?: string;
  description: string;
  disabled?: boolean;
  legacyNovedad?: boolean;
};

type StatusModalAction = {
  action: ShippingV2PackingStatusAction;
  title: string;
  label: string;
  description: string;
  fieldLabel: string;
};


function statusToneClass(status: string) {
  const { fase } = getShippingV2PackingFaseInfo(status);
  if (fase === "preparacion") return "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  if (fase === "en-camino") return "border-[#8B73FF]/35 bg-[#8B73FF]/10 text-[#C9BFFF]";
  if (fase === "en-bodega") return "border-[#4FC3FF]/35 bg-[#4FC3FF]/10 text-[#BDEAFF]";
  if (fase === "revision") return "border-[#F4E85B]/35 bg-[#F4E85B]/10 text-[#F4E85B]";
  if (fase === "cerrado") return "border-[#7BE495]/35 bg-[#7BE495]/10 text-[#9FEFB3]";
  if (fase === "cancelado") return "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]";
  return "border-[#3A3A36] bg-[#151515] text-[#A7A7A7]";
}

function getPackingStatusConfig(
  status: string,
  input: { hasOpenNovedades: boolean; cicloCompleto: boolean; pendientesCiclo: number; totalCiclo: number; isAdmin: boolean }
): PackingStatusConfig {
  const state = normalize(status);
  if (state === "en proceso") {
    return { action: "close", label: "Cerrar packing", description: "Finaliza el armado y bloquea cambios normales de items." };
  }
  if (state === "cerrado") {
    return { action: "mark-in-transit", label: "Marcar en tránsito", description: "Confirma manualmente que el packing ya salió hacia destino." };
  }
  if (state === "en transito") {
    return { action: "mark-received", label: "Marcar recibido", description: "Registra recepción sin liberar inventario automáticamente." };
  }
  if (state === "recibido") {
    return { action: "start-review", label: "Iniciar revisión", description: "Pasa el contenido a revisión operativa." };
  }
  if (state === "en revision") {
    if (input.hasOpenNovedades) {
      return {
        action: "close-final",
        label: "Cerrar ciclo",
        description: "Hay novedades pendientes antes de cerrar el ciclo.",
        disabled: true,
      };
    }
    if (!input.cicloCompleto) {
      // Bloqueado para todos; el Administrador tiene una salida aparte, con
      // justificación, en el menú "Más acciones".
      return {
        action: "close-final",
        label: "Cerrar ciclo",
        description: input.totalCiclo === 0
          ? "Este packing no tiene artículos vinculados."
          : `Faltan ${input.pendientesCiclo} de ${input.totalCiclo} artículos por completar su ciclo en Recepción.${input.isAdmin ? " Como administrador puedes cerrarlo igualmente desde Más acciones, con justificación." : ""}`,
        disabled: true,
      };
    }
    return {
      action: "close-final",
      label: "Cerrar ciclo",
      description: "Todos los artículos completaron su ciclo y no hay novedades pendientes.",
    };
  }
  if (state === "con novedad") {
    return {
      description: "Estado legacy: restaura manualmente el estado operativo correcto.",
      legacyNovedad: true,
    };
  }
  if (state === "cancelado") {
    return { description: "Packing cancelado. La operación quedó bloqueada.", disabled: true };
  }
  if (state === "cerrado final") {
    return { description: "Ciclo cerrado: logística y revisión terminadas. Lo único que queda es vender. Solo lectura.", disabled: true };
  }
  return { description: "Estado sin acción operativa configurada.", disabled: true };
}

function StatusActionPanel({
  packing,
  novedades,
  isAdmin,
  isSiteAdmin,
  canClose,
  canTransition,
  canViewNovedades,
  busy,
  actionBusy,
  onRunAction,
  onOpenNovedades,
  onOpenStatusModal,
  extra,
}: {
  extra?: ReactNode;
  packing: ShippingV2Packing;
  novedades: ShippingV2Novedad[];
  isAdmin: boolean;
  isSiteAdmin: boolean;
  canClose: boolean;
  canTransition: boolean;
  canViewNovedades: boolean;
  busy: boolean;
  actionBusy: ShippingV2PackingStatusAction | "";
  onRunAction: (action: ShippingV2PackingStatusAction) => void;
  onOpenNovedades: () => void;
  onOpenStatusModal: (action: StatusModalAction) => void;
}) {
  const openNovedades = novedades.filter((novedad) => isOpenNovedadStatus(novedad.estado));
  const state = normalize(packing.estado);
  const faseInfo = getShippingV2PackingFaseInfo(packing.estado);
  const reviewProgress = calculateShippingV2PackingReviewProgress(packing.items);
  const workHint = getShippingV2PackingWorkHint({
    estado: packing.estado,
    progress: reviewProgress,
    novedadesAbiertas: openNovedades.length,
  });
  const config = getPackingStatusConfig(packing.estado, {
    hasOpenNovedades: openNovedades.length > 0,
    cicloCompleto: reviewProgress.completo,
    pendientesCiclo: reviewProgress.pendientes,
    totalCiclo: reviewProgress.total,
    isAdmin,
  });
  // Salida administrativa: cerrar el ciclo con artículos incompletos, dejando
  // registrada la justificación. Nunca se ofrece si hay novedades abiertas.
  const canForceCloseCycle = isAdmin
    && canTransition
    && state === "en revision"
    && !openNovedades.length
    && !reviewProgress.completo;
  const canCancel = isAdmin && canTransition && !["cancelado", "cerrado final"].includes(state);
  const canRestoreLegacyNovedad = isAdmin && canTransition && state === "con novedad";
  // Deliberadamente MÁS estricto que canCancel/canRestoreLegacyNovedad: esos
  // usan isAdmin (cualquier staff interno). Reabrir un packing cerrado es
  // exclusivo del rol Administrador del sistema — ver isSiteAdmin.
  const canReopen = isSiteAdmin && canTransition && state === "cerrado";
  const canRunConfiguredAction = config.action === "close" ? canClose : canTransition;

  const tonoHint = workHint.tono === "alerta" ? "text-[#FFB07A]" : workHint.tono === "listo" ? "text-[#9FEFB3]" : "text-[#D7FF4F]";
  const ayudaAccion = [config.description, (packing.trackingUsa || packing.trackingEc) && state === "cerrado" ? "Hay rastreo, pero el tránsito se confirma con este botón." : ""].filter(Boolean).join(" ");
  const item = "block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] font-semibold hover:bg-[#1E1F1C] disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-bold ${statusToneClass(packing.estado)}`}
        title={`${faseInfo.faseLabel}: ${faseInfo.significado}${packing.estado && faseInfo.estadoLabel !== packing.estado ? ` (Airtable: ${packing.estado})` : ""}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {faseInfo.estadoLabel}
      </span>
      <span className={`text-[12.5px] ${tonoHint}`}>{workHint.texto}</span>
      {reviewProgress.total > 0 ? (
        <span className="text-[12px] text-[#8F908A]" title="Bodega: recibido · revisado · fotos. Ciclo completo: incluye publicaciones.">
          Bodega <b className="text-[#E6E6E1]">{formatShippingV2PackingBodegaProgress(reviewProgress)}</b>
          {" · "}Ciclo <b className="text-[#E6E6E1]">{formatShippingV2PackingReviewProgress(reviewProgress)}</b>
          {reviewProgress.sinPublicacionAplicable > 0 ? ` · ${reviewProgress.sinPublicacionAplicable} sin publicación` : ""}
        </span>
      ) : null}
      {(config.action && config.disabled) || config.legacyNovedad ? <span className="text-[12px] text-[#8F908A]">{config.description}</span> : null}

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {extra}
        {canViewNovedades && novedades.length ? (
          <button type="button" onClick={onOpenNovedades} className={`${btn} ${openNovedades.length ? "border-[#FF914D]/45 text-[#FFB07A]" : ""}`}>
            Novedades {openNovedades.length ? `· ${openNovedades.length} abiertas` : novedades.length}
          </button>
        ) : openNovedades.length ? <span className={chip.mal}>{openNovedades.length} novedades abiertas</span> : null}

        {config.action && canRunConfiguredAction ? (
          <button
            type="button"
            disabled={busy || config.disabled}
            title={ayudaAccion}
            onClick={() => onRunAction(config.action as ShippingV2PackingStatusAction)}
            className={btnPrim}
          >
            {actionBusy === config.action ? "Procesando…" : config.label}
          </button>
        ) : null}

        {(canCancel || canRestoreLegacyNovedad || canReopen || canForceCloseCycle) ? (
          <details className="relative">
            <summary className={`${btn} cursor-pointer list-none text-[#A7A7A7]`}>Más</summary>
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-[#3A3A36] bg-[#10110F] p-1 shadow-2xl shadow-black/50">
              {canForceCloseCycle ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onOpenStatusModal({
                    action: "close-final",
                    title: "Cerrar ciclo con artículos incompletos",
                    label: "Cerrar ciclo igualmente",
                    fieldLabel: "Justificación administrativa",
                    description: `Faltan ${reviewProgress.pendientes} de ${reviewProgress.total} artículos por completar su checklist. Cerrar el ciclo ahora deja ese trabajo sin hacer; la justificación queda registrada en el historial del packing.`,
                  })}
                  className={`${item} text-[#D7FF4F]`}
                >
                  Cerrar ciclo igualmente
                </button>
              ) : null}
              {canReopen ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onOpenStatusModal({
                    action: "reopen",
                    title: "Reabrir packing",
                    label: "Reabrir packing",
                    fieldLabel: "Motivo de la reapertura",
                    description: "Vuelve el packing a En Proceso para poder agregar o quitar items. Solo disponible para Administradores.",
                  })}
                  className={`${item} text-[#D7FF4F]`}
                >
                  Reabrir caja
                </button>
              ) : null}
              {canRestoreLegacyNovedad ? (
                <>
                  {([
                    ["restore-in-transit", "Volver a En tránsito"],
                    ["restore-received", "Volver a Recibido"],
                    ["restore-review", "Volver a En revisión"],
                  ] as const).map(([action, texto]) => (
                    <button
                      key={action}
                      type="button"
                      disabled={busy}
                      onClick={() => onOpenStatusModal({
                        action,
                        title: texto,
                        label: "Restaurar estado",
                        fieldLabel: "Confirmación administrativa",
                        description: "Solo cambia el estado principal del packing. No modifica items ni novedades.",
                      })}
                      className={`${item} text-[#F5F5F5]`}
                    >
                      {texto}
                    </button>
                  ))}
                </>
              ) : null}
              {canCancel ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onOpenStatusModal({
                    action: "cancel",
                    title: "Cancelar packing",
                    label: "Cancelar packing",
                    fieldLabel: "Motivo de cancelación",
                    description: "Esta acción queda registrada como administrativa.",
                  })}
                  className={`${item} text-[#FFB07A] hover:bg-[#2A1B14]`}
                >
                  Cancelar caja
                </button>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function isOpenNovedadStatus(status: string) {
  const state = normalize(status);
  return Boolean(state && !["resuelta", "resuelto", "cancelada", "cancelado", "cerrada", "cerrado"].includes(state));
}

function ModalShell({ title, description, children, onClose }: { title: string; description?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-lg rounded-xl border border-[#3A3A36] bg-[#151613] shadow-2xl shadow-black/50">
        <div className="border-b border-[#30312D] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F5]">{title}</h3>
              {description ? <p className="mt-1 text-sm leading-5 text-[#A7A7A7]">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#3A3A36] bg-[#20211D] text-sm font-bold text-[#A7A7A7] transition hover:border-[#D7FF4F]/55 hover:text-[#F5F5F5]"
              aria-label="Cerrar modal"
            >
              X
            </button>
          </div>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function StatusDecisionModal({
  modal,
  value,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  modal: StatusModalAction;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <ModalShell title={modal.title} description={modal.description} onClose={onClose}>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">{modal.fieldLabel}</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={busy}
          className="mt-2 min-h-28 w-full resize-y rounded-lg border border-[#3A3A36] bg-[#101010] px-3 py-2 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-60"
        />
      </label>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={busy} onClick={onClose} className="h-9 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/45 disabled:opacity-50">Cancelar</button>
        <button type="button" disabled={busy || !value.trim()} onClick={onSubmit} className="h-9 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50">{busy ? "Guardando..." : modal.label}</button>
      </div>
    </ModalShell>
  );
}

function NovedadesModal({ novedades, onClose }: { novedades: ShippingV2Novedad[]; onClose: () => void }) {
  return (
    <ModalShell title="Novedades del packing" description={`${novedades.length} novedad(es) relacionadas.`} onClose={onClose}>
      <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1">
        {novedades.map((novedad) => (
          <article key={novedad.id} className="rounded-lg border border-[#30312D] bg-[#101010] px-3 py-2">
            <p className="text-sm font-semibold text-[#F5F5F5]">{display(novedad.titulo)}</p>
            <p className="mt-1 text-xs text-[#A7A7A7]">Estado: {display(novedad.estado)} · Severidad: {display(novedad.severidad)}</p>
            {novedad.descripcion ? <p className="mt-2 text-sm leading-5 text-[#A7A7A7]">{novedad.descripcion}</p> : null}
          </article>
        ))}
        {!novedades.length ? <p className="rounded-lg border border-[#30312D] bg-[#101010] px-3 py-3 text-sm text-[#A7A7A7]">No hay novedades relacionadas cargadas para este packing.</p> : null}
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/45">Cerrar</button>
      </div>
    </ModalShell>
  );
}

function trackingHelpMessage({
  tracking,
  providerId,
  provider,
  trackingUrl,
  missingProviderText,
}: {
  tracking?: string;
  providerId?: string;
  provider?: ShippingV2Proveedor;
  trackingUrl: string | null;
  missingProviderText: string;
}) {
  if (!tracking?.trim() || trackingUrl) return null;
  if (!providerId?.trim()) return missingProviderText;
  if (!provider) return "No se pudo cargar la configuracion de rastreo del transportista seleccionado.";
  return "Este transportista no tiene URL de rastreo configurada.";
}

function ItemCard({
  item,
  providerLabel,
  logisticsProviderLabel,
  action,
  draggable,
  showCosts = false,
  canViewCosts = true,
  canViewProviderCost = true,
  onDragStart,
}: {
  item: ShippingV2Item;
  providerLabel: string;
  logisticsProviderLabel?: string;
  action: ReactNode;
  draggable?: boolean;
  showCosts?: boolean;
  canViewCosts?: boolean;
  canViewProviderCost?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
}) {
  const itemHref = `/shipping-v2/items/${encodeURIComponent(item.id)}`;
  const purchaseProviderLabel = providerDisplayValue(providerLabel, item.proveedorNombre);
  const logisticsDisplayLabel = providerDisplayValue(logisticsProviderLabel, item.proveedorLogisticoNombre);
  const supplierSku = item.skuProveedor?.trim();
  const foto = item.fotos[0];
  const secundario = [
    purchaseProviderLabel,
    logisticsDisplayLabel ? `vía ${logisticsDisplayLabel}` : "",
    item.categoria,
    item.tipoOperacion,
    item.modoLogistico,
  ].filter(Boolean).join(" · ");

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      className={`grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 border-t border-[#2A2B26] px-2 py-1.5 first:border-t-0 ${draggable ? "cursor-grab hover:bg-[#1D1E1A] active:cursor-grabbing" : ""}`}
    >
      {foto ? (
        <a href={foto.url} target="_blank" rel="noreferrer" title="Ver foto" className="block h-10 w-10 overflow-hidden rounded-md border border-[#3A3A36] bg-black">
          <img src={foto.thumbnailUrl || foto.url} alt={item.nombre || item.sku || "Foto"} loading="lazy" className="h-full w-full object-cover" />
        </a>
      ) : (
        <span className="grid h-10 w-10 place-items-center rounded-md border border-[#3A3A36] bg-[#1E1F1C] text-[10px] font-black text-[#6F706A]">{(item.nombre || item.sku || "?").slice(0, 2).toUpperCase()}</span>
      )}
      <div className="min-w-0 leading-5">
        <p className="flex min-w-0 items-center gap-1.5 text-[12px]">
          <Link href={itemHref} className="shrink-0 font-semibold text-[#D7FF4F] hover:underline">{display(item.sku)}</Link>
          <span className={`truncate ${supplierSku ? "text-[#B4B5AC]" : "text-[#6F706A]"}`}>{supplierSku || "sin SKU proveedor"}</span>
          <span className="shrink-0 text-[#8F908A]">· {display(item.estado)}</span>
        </p>
        <Link href={itemHref} className="block truncate text-[13px] font-semibold text-[#F5F5F5] hover:text-[#D7FF4F]" title={item.nombre}>{display(item.nombre)}</Link>
        {secundario ? <p className="truncate text-[11.5px] text-[#8F908A]" title={secundario}>{secundario}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {showCosts && canViewCosts ? <CostosDelItem item={item} includeAssignedCosts /> : canViewProviderCost ? <CostosDelItem item={item} /> : null}
        {action}
      </div>
    </article>
  );
}

// Punto 9c · fase 1 (14-oct): los costos de la caja viven en un solo bloque,
// "Costos de traerlo". El flete, el arancel y otros ya no se escriben a mano:
// nacen del pago. Aquí se quedan la regla de reparto, la observación y el
// resumen de la caja.
function LogisticsCostsSection({
  packing,
  canEditDistributionRule,
  canEditNote,
  providerSummary,
  onSaved,
  onPagado,
}: {
  packing: ShippingV2Packing;
  canEditDistributionRule: boolean;
  canEditNote: boolean;
  providerSummary: ReturnType<typeof packingProviderCostSummary>;
  onSaved: (packing: ShippingV2Packing) => void;
  onPagado: () => void;
}) {
  const [regla, setRegla] = useState(packing.reglaDistribucionCostos || "No definida");
  const [nota, setNota] = useState(packing.observacionCostos || "");
  const [status, setStatus] = useState<"saving" | "saved" | "error" | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    setRegla(packing.reglaDistribucionCostos || "No definida");
    setNota(packing.observacionCostos || "");
  }, [packing.reglaDistribucionCostos, packing.observacionCostos]);

  async function guardar(payload: Record<string, string>) {
    setStatus("saving");
    setError("");
    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => ({}));
      if (!response.ok || !responsePayload.success) throw new Error(String(responsePayload.error || "No se pudo guardar."));
      onSaved(responsePayload.data as ShippingV2Packing);
      setStatus("saved");
      window.setTimeout(() => setStatus(undefined), 1400);
    } catch (saveError) {
      setStatus("error");
      setError(saveError instanceof Error ? saveError.message : "Error inesperado.");
    }
  }

  return (
    <CostosTraerlo
      packingId={packing.id}
      onPagado={onPagado}
      cabecera={(
        <>
          {error ? <span className="text-[12px] text-[#FFB07A]">{error}</span> : null}
          <SaveBadge status={status} />
          <label className="flex items-center gap-1.5 text-[12px] text-[#8F908A]">
            Reparto
            <select
              value={regla}
              disabled={!canEditDistributionRule}
              onChange={(event) => { setRegla(event.target.value); void guardar({ reglaDistribucionCostos: event.target.value }); }}
              className="h-7 rounded-md border border-[#3A3A36] bg-[#151515] px-1.5 text-[12.5px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-60"
            >
              {SHIPPING_V2_REGLAS_DISTRIBUCION_COSTOS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </>
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#8F908A]">
        <span>Compra <b className="tabular-nums text-[#E6E6E1]">{formatCurrencyZero(providerSummary.costoTotalProveedorItems)}</b></span>
        <span><b className="text-[#E6E6E1]">{display(providerSummary.referenciasIncluidas)}</b> ítems · <b className="text-[#E6E6E1]">{display(providerSummary.unidadesTotales)}</b> u.</span>
        <input
          value={nota}
          disabled={!canEditNote}
          onChange={(event) => setNota(event.target.value)}
          onBlur={() => { if (nota !== (packing.observacionCostos || "")) void guardar({ observacionCostos: nota }); }}
          placeholder="Nota de costos"
          aria-label="Nota de costos"
          className="h-7 min-w-[180px] flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-[12.5px] text-[#E6E6E1] outline-none placeholder:text-[#5E5F59] hover:border-[#3A3A36] focus:border-[#D7FF4F]/70 focus:bg-[#151515] disabled:opacity-60"
        />
      </div>
      {providerSummary.error ? <p className="mt-1 text-[12px] font-semibold text-[#FFB07A]">{providerSummary.error}</p> : null}
      {providerSummary.referenciasConUnidadesEstimadas ? (
        <p className="mt-1 text-[12px] text-[#BDEAFF]" title="Su cantidad actual es 0: el histórico de la caja cuenta 1 unidad por registro. No afecta inventario ni pagos.">
          {providerSummary.referenciasConUnidadesEstimadas} ítem(s) ya vendidos o consumidos: se cuentan con 1 unidad.
        </p>
      ) : null}
    </CostosTraerlo>
  );
}

export function ShippingV2PackingDetailClient({ packing: initialPacking, candidates, proveedores, novedades, destinatarios, isAdmin, isSiteAdmin, permissions, providerName }: Props) {
  const router = useRouter();
  const [packing, setPacking] = useState(initialPacking);
  const [shippingDestinatarios, setShippingDestinatarios] = useState(destinatarios);
  const [selectedDestinatarioId, setSelectedDestinatarioId] = useState("");
  const [destinatarioBusy, setDestinatarioBusy] = useState(false);
  const [destinatarioNotice, setDestinatarioNotice] = useState("");
  const [availableItems, setAvailableItems] = useState(candidates.filter((item) => !initialPacking.itemIds.includes(item.id)));
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busyItemId, setBusyItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<ShippingV2PackingStatusAction | "">("");
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceNotice, setInvoiceNotice] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({});
  const [copiedTracking, setCopiedTracking] = useState<"usa" | "ec" | null>(null);
  const [packingNovedades, setPackingNovedades] = useState(novedades);
  const [statusModal, setStatusModal] = useState<StatusModalAction | null>(null);
  const [statusDecision, setStatusDecision] = useState("");
  const [showNovedadesModal, setShowNovedadesModal] = useState(false);
  const canEditPacking = permissions?.canEditPacking !== false;
  const canEditPackingWeight = permissions?.canEditPackingWeight !== false;
  const canEditPackingShippingFields = permissions?.canEditPackingShippingFields !== false;
  const canAddItems = isOpen(packing.estado) && permissions?.canAddItemsToPacking !== false;
  const canRemoveItems = isOpen(packing.estado) && permissions?.canRemoveItemsFromPacking !== false;
  const canViewCosts = permissions?.canViewCosts !== false;
  const canViewProviderCost = canViewCosts || permissions?.canViewProviderCost !== false;
  const canViewInvoice = permissions?.canViewInvoice !== false;
  const canGenerateInvoice = permissions?.canGenerateInvoice !== false;
  const canLinkDestinatario = permissions?.canLinkDestinatario !== false;
  const canViewNovedades = permissions?.canViewNovedades !== false;
  const canClosePacking = permissions?.canClosePacking !== false;
  const canTransitionPackingStatus = permissions?.canTransitionPackingStatus !== false;
  const isProviderPortal = Boolean(providerName && permissions?.canEditPacking === false);
  const providerLabels = useMemo(() => createShippingV2ProveedorLabelMap(proveedores), [proveedores]);
  const providerById = useMemo(() => new Map(proveedores.map((provider) => [provider.id, provider])), [proveedores]);
  const responsableLabel = resolveShippingV2ProveedorLabel(packing.proveedorResponsableId, providerLabels);
  const usaTransportProviders = useMemo(() => getUsaTransportProviders(proveedores), [proveedores]);
  const ecuadorTransportProviders = useMemo(
    () => getEcuadorTransportProvidersForPacking(proveedores, packing),
    [packing, proveedores]
  );
  const selectedUsaTransportProvider = packing.transportistaUsa ? providerById.get(packing.transportistaUsa) : undefined;
  const selectedEcTransportProvider = packing.transportistaEc ? providerById.get(packing.transportistaEc) : undefined;
  const providerOptions = useMemo(
    () => [{ value: "", label: "Sin proveedor" }, ...proveedores.map((provider) => ({ value: provider.id, label: provider.label || provider.proveedorId || provider.nombre || provider.id }))],
    [proveedores]
  );
  const usaTransportProviderOptions = useMemo(
    () => {
      const options = usaTransportProviders.map((provider) => ({ value: provider.id, label: providerTrackingLabel(provider) }));
      if (selectedUsaTransportProvider && !options.some((option) => option.value === selectedUsaTransportProvider.id)) {
        options.unshift({ value: selectedUsaTransportProvider.id, label: providerTrackingLabel(selectedUsaTransportProvider) });
      }
      return [{ value: "", label: "Sin transportista USA" }, ...options];
    },
    [selectedUsaTransportProvider, usaTransportProviders]
  );
  const ecuadorTransportProviderOptions = useMemo(
    () => {
      const options = ecuadorTransportProviders.map((provider) => ({ value: provider.id, label: providerTrackingLabel(provider) }));
      if (selectedEcTransportProvider && !options.some((option) => option.value === selectedEcTransportProvider.id)) {
        options.unshift({ value: selectedEcTransportProvider.id, label: providerTrackingLabel(selectedEcTransportProvider) });
      }
      return [{ value: "", label: "Sin transportista EC" }, ...options];
    },
    [ecuadorTransportProviders, selectedEcTransportProvider]
  );
  const packingTypeOptions = useMemo(() => SHIPPING_V2_PACKING_TIPOS.map((option) => ({ value: option, label: option })), []);
  const trackingUsaUrl = buildTrackingUrl(selectedUsaTransportProvider, packing.trackingUsa);
  const trackingEcUrl = buildTrackingUrl(selectedEcTransportProvider, packing.trackingEc);
  const trackingUsaHelp = trackingHelpMessage({
    tracking: packing.trackingUsa,
    providerId: packing.transportistaUsa,
    provider: selectedUsaTransportProvider,
    trackingUrl: trackingUsaUrl,
    missingProviderText: "Selecciona un transportista USA para habilitar el rastreo externo.",
  });
  const trackingEcHelp = trackingHelpMessage({
    tracking: packing.trackingEc,
    providerId: packing.transportistaEc,
    provider: selectedEcTransportProvider,
    trackingUrl: trackingEcUrl,
    missingProviderText: "Selecciona un transportista EC para habilitar el rastreo externo.",
  });
  const currentDestinatario = useMemo(
    () => shippingDestinatarios.find((destinatario) => destinatarioMatchesPacking(destinatario, packing)) ?? null,
    [packing, shippingDestinatarios]
  );
  const missingTracking = !packing.trackingUsa?.trim() && !packing.trackingEc?.trim();
  const providerSummary = useMemo(() => packingProviderCostSummary(packing.items), [packing.items]);
  const packingItemsUnitsSummary = formatShippingV2PackingItemsUnitsSummary(providerSummary);

  useEffect(() => setPackingNovedades(novedades), [novedades]);
  useEffect(() => setShippingDestinatarios(destinatarios), [destinatarios]);
  useEffect(() => {
    if (currentDestinatario) setSelectedDestinatarioId(currentDestinatario.id);
  }, [currentDestinatario]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    console.log("[Shipping V2 Tracking USA]", {
      trackingUsa: packing.trackingUsa,
      transportistaUsa: packing.transportistaUsa,
      permiteRastreoWeb: selectedUsaTransportProvider?.permiteRastreoWeb,
      plantillaUrlRastreo: selectedUsaTransportProvider?.plantillaUrlRastreo,
      urlRastreo: selectedUsaTransportProvider?.urlRastreo,
      trackingUrl: trackingUsaUrl,
    });
    console.log("[Shipping V2 Tracking EC]", {
      trackingEc: packing.trackingEc,
      transportistaEc: packing.transportistaEc,
      permiteRastreoWeb: selectedEcTransportProvider?.permiteRastreoWeb,
      plantillaUrlRastreo: selectedEcTransportProvider?.plantillaUrlRastreo,
      urlRastreo: selectedEcTransportProvider?.urlRastreo,
      trackingUrl: trackingEcUrl,
    });
  }, [
    packing.trackingEc,
    packing.trackingUsa,
    packing.transportistaEc,
    packing.transportistaUsa,
    selectedEcTransportProvider,
    selectedUsaTransportProvider,
    trackingEcUrl,
    trackingUsaUrl,
  ]);

  const visibleCandidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return availableItems.filter((item) => {
      const providerLabel = resolveShippingV2ProveedorLabel(item.proveedorId, providerLabels) || item.proveedorNombre || "";
      const logisticsProviderLabel = resolveShippingV2ProveedorLabel(item.proveedorLogisticoId, providerLabels) || item.proveedorLogisticoNombre || "";
      return !needle || itemSearchText(item, providerLabel, logisticsProviderLabel).includes(needle);
    });
  }, [availableItems, providerLabels, query]);

  function canEditField(field: EditablePackingField) {
    const state = normalize(packing.estado);
    if (field === "peso" && canEditPackingWeight) return ["en proceso", "cerrado", "en transito"].includes(state);
    // Mismo alcance que ya tiene el staff para estos 3 campos en cada estado
    // (ver más abajo) — canEditPackingShippingFields solo destraba el rol,
    // no relaja en qué estado del packing se puede tocar cada uno.
    if ((field === "trackingUsa" || field === "transportistaUsa") && canEditPackingShippingFields) {
      return ["en proceso", "cerrado", "en transito"].includes(state);
    }
    if (field === "observaciones" && canEditPackingShippingFields) {
      return state === "en proceso";
    }
    if (!canEditPacking) return false;
    if (field === "ordenReferencia") return true;
    if (state === "en proceso") return true;
    if (state === "cerrado") return ["trackingUsa", "transportistaUsa", "trackingEc", "transportistaEc", "peso"].includes(field);
    if (state === "en transito") return ["trackingUsa", "transportistaUsa", "trackingEc", "transportistaEc", "peso"].includes(field);
    return false;
  }

  function canEditLogisticsCosts() {
    if (!canEditPacking || !canViewCosts) return false;
    const state = normalize(packing.estado);
    return ["en proceso", "cerrado", "en transito", "recibido"].includes(state);
  }

  function canEditDistributionRule() {
    if (!canEditPacking || !canViewCosts) return false;
    const state = normalize(packing.estado);
    return ["en proceso", "cerrado", "en transito", "recibido", "en revision"].includes(state);
  }

  // Tras pagar un gasto, el valor de la caja y el reparto de sus artículos cambian.
  async function recargarPacking() {
    const response = await fetch(`/api/shipping-v2/packings/${packing.id}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.success && payload.data) setPacking(payload.data as ShippingV2Packing);
    router.refresh();
  }

  async function copyTracking(kind: "usa" | "ec", value?: string) {
    const text = value?.trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedTracking(kind);
    window.setTimeout(() => setCopiedTracking((current) => current === kind ? null : current), 1400);
  }

  async function savePackingField(field: EditablePackingField, value: string | number | null) {
    if (!canEditField(field)) return;
    const previousPacking = packing;
    setSaveState((current) => ({ ...current, [field]: "saving" }));
    setError("");
    setPacking((current) => ({ ...current, [field]: value }));
    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo guardar el cambio."));
      setPacking(payload.data as ShippingV2Packing);
      setSaveState((current) => ({ ...current, [field]: "saved" }));
      window.setTimeout(() => setSaveState((current) => ({ ...current, [field]: undefined })), 1400);
    } catch (saveError) {
      setPacking(previousPacking);
      setSaveState((current) => ({ ...current, [field]: "error" }));
      setError(saveError instanceof Error ? saveError.message : "Error inesperado.");
    }
  }

  async function addItems(itemIds: string[]) {
    if (!canAddItems || !itemIds.length || busy) return;
    const uniqueItemIds = Array.from(new Set(itemIds));
    const itemsToAdd = availableItems.filter((item) => uniqueItemIds.includes(item.id));
    if (!itemsToAdd.length) return;
    const previousPacking = packing;
    const previousAvailableItems = availableItems;
    const optimisticItems = itemsToAdd.map((item) => ({
      ...item,
      estado: "En packing",
      modoLogistico: "Asignar a packing existente",
      packingId: packing.id,
      requierePacking: true,
    }));

    setBusy(true);
    setBusyItemId(uniqueItemIds[0] || "");
    setError("");
    setAvailableItems((current) => current.filter((item) => !uniqueItemIds.includes(item.id)));
    setPacking((current) => {
      const nextItems = [
        ...current.items.filter((item) => !uniqueItemIds.includes(item.id)),
        ...optimisticItems,
      ];
      return {
        ...current,
        items: nextItems,
        itemIds: Array.from(new Set([...current.itemIds, ...uniqueItemIds])),
        itemCount: nextItems.length,
      };
    });

    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: uniqueItemIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudieron agregar items."));
      setPacking((current) => {
        const serverItems = Array.isArray(payload.addedItems) ? payload.addedItems as ShippingV2Item[] : [];
        const itemsById = new Map(serverItems.map((item) => [item.id, item]));
        const serverItemIds = Array.isArray(payload.packing?.itemIds) ? payload.packing.itemIds.map(String) : current.itemIds;
        const items = current.items
          .map((item) => itemsById.get(item.id) || item)
          .filter((item) => serverItemIds.includes(item.id));
        return {
          ...current,
          itemIds: serverItemIds,
          itemCount: typeof payload.packing?.itemCount === "number" ? payload.packing.itemCount : items.length,
          items,
        };
      });
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : "Error inesperado.";
      setPacking(previousPacking);
      setAvailableItems(previousAvailableItems);
      setError(message);
      router.refresh();
    } finally {
      setBusy(false);
      setBusyItemId("");
      setDragOver(false);
    }
  }

  async function removeItem(item: ShippingV2Item) {
    if (!canRemoveItems || busy) return;
    const previousPacking = packing;
    const previousAvailableItems = availableItems;
    const optimisticAvailableItem = {
      ...item,
      estado: "Pendiente de packing",
      modoLogistico: "Pendiente de packing",
      packingId: "",
      requierePacking: true,
    };

    setBusy(true);
    setBusyItemId(item.id);
    setError("");
    setPacking((current) => {
      const nextItems = current.items.filter((included) => included.id !== item.id);
      return {
        ...current,
        items: nextItems,
        itemIds: current.itemIds.filter((id) => id !== item.id),
        itemCount: nextItems.length,
      };
    });
    setAvailableItems((current) => [optimisticAvailableItem, ...current.filter((candidate) => candidate.id !== item.id)]);

    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo quitar el item."));
      const removedItem = payload.removedItem as ShippingV2Item | undefined;
      setAvailableItems((current) => [
        removedItem || optimisticAvailableItem,
        ...current.filter((candidate) => candidate.id !== item.id),
      ]);
      setPacking((current) => {
        const serverItemIds = Array.isArray(payload.packing?.itemIds) ? payload.packing.itemIds.map(String) : current.itemIds;
        const items = current.items.filter((included) => serverItemIds.includes(included.id));
        return {
          ...current,
          itemIds: serverItemIds,
          itemCount: typeof payload.packing?.itemCount === "number" ? payload.packing.itemCount : items.length,
          items,
        };
      });
    } catch (mutationError) {
      setPacking(previousPacking);
      setAvailableItems(previousAvailableItems);
      setError(mutationError instanceof Error ? mutationError.message : "Error inesperado.");
      router.refresh();
    } finally {
      setBusy(false);
      setBusyItemId("");
    }
  }

  async function runStatusAction(action: ShippingV2PackingStatusAction, decisionText = "") {
    if (busy) return;
    setBusy(true);
    setActionBusy(action);
    setError("");
    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, decision: decisionText }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo cambiar el estado del packing."));
      setPacking(payload.data as ShippingV2Packing);
      setStatusDecision("");
      setStatusModal(null);
      router.refresh();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Error inesperado.");
      router.refresh();
    } finally {
      setBusy(false);
      setActionBusy("");
    }
  }

  async function linkDestinatario() {
    if (!canLinkDestinatario) return;
    const destinatarioId = selectedDestinatarioId.trim();
    if (!destinatarioId || destinatarioBusy) return;
    setDestinatarioBusy(true);
    setDestinatarioNotice("");
    setError("");
    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}/destinatario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinatarioId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo vincular el destinatario."));
      const updatedDestinatario = payload.data as ShippingV2Destinatario;
      setShippingDestinatarios((current) => [
        updatedDestinatario,
        ...current.filter((destinatario) => destinatario.id !== updatedDestinatario.id),
      ]);
      setDestinatarioNotice("Destinatario vinculado correctamente.");
      router.refresh();
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Error al vincular destinatario.");
    } finally {
      setDestinatarioBusy(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!canAddItems) return;
    const itemId = event.dataTransfer.getData("text/plain");
    if (itemId) void addItems([itemId]);
  }

  async function generateProviderInvoice() {
    if (!canGenerateInvoice) return;
    if (invoiceBusy) return;
    if (!currentDestinatario) {
      setError("Falta vincular destinatario para generar la factura.");
      return;
    }
    if (packing.factura.length) {
      const confirmed = window.confirm("Este packing ya tiene una factura. ¿Quieres reemplazarla?");
      if (!confirmed) return;
    }
    setInvoiceBusy(true);
    setInvoiceNotice("");
    setError("");
    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}/invoice`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo generar la factura proveedor."));
      setPacking(payload.data as ShippingV2Packing);
      setInvoiceNotice("Factura generada correctamente.");
      router.refresh();
    } catch (invoiceError) {
      setError(invoiceError instanceof Error ? invoiceError.message : "Error inesperado al generar factura.");
    } finally {
      setInvoiceBusy(false);
    }
  }

  const facturaAcciones = (
    <>
      {packing.factura[0]?.url && canViewInvoice ? (
        <a href={packing.factura[0].url} target="_blank" rel="noreferrer" className={btn}>Ver factura</a>
      ) : null}
      {canGenerateInvoice ? (
        <button
          type="button"
          disabled={invoiceBusy || !currentDestinatario}
          title={!currentDestinatario ? "Vincula un destinatario antes de generar la factura." : !packing.ordenReferencia ? "Recomendado: escribe la orden de referencia antes." : undefined}
          onClick={() => void generateProviderInvoice()}
          className={btn}
        >
          {invoiceBusy ? "Generando…" : packing.factura.length ? "Regenerar factura" : "Generar factura"}
        </button>
      ) : null}
    </>
  );
  const pesoTexto = packing.peso === null || packing.peso === undefined ? "" : String(packing.peso);

  return (
    <div className="w-full space-y-2">
      {/* Cabecera: qué caja es, en qué etapa está y qué sigue */}
      <section className={`${seccion} space-y-1.5 px-2 py-1.5`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href="/shipping-v2/packings" className={`${btn} px-2 text-[#A7A7A7]`} title="Volver a Logística">← Logística</Link>
          <h2 className="text-[15px] font-semibold text-[#F5F5F5]">{display(packing.packingId)}</h2>
          {packing.nombre?.trim() ? <span className="truncate text-[13px] text-[#A7A7A7]">{packing.nombre.trim()}</span> : null}
          {isProviderPortal ? <span className={chip.ok} title="Puedes agregar artículos y cerrar la caja cuando esté completa.">Vista proveedor</span> : null}
          {!currentDestinatario && canGenerateInvoice ? <span className={chip.mal} title="Necesario para generar la factura">Sin destinatario</span> : null}
          {!packing.ordenReferencia && canGenerateInvoice ? <span className={chip.mute} title="Recomendado para la factura; no la bloquea">Sin orden</span> : null}
          {missingTracking ? <span className={chip.falta}>Sin rastreo</span> : null}
          {invoiceNotice ? <span className="text-[12px] font-semibold text-[#D7FF4F]">{invoiceNotice}</span> : null}
          {destinatarioNotice ? <span className="text-[12px] font-semibold text-[#D7FF4F]">{destinatarioNotice}</span> : null}
        </div>
        <StatusActionPanel
          packing={packing}
          novedades={packingNovedades}
          isAdmin={isAdmin}
          isSiteAdmin={isSiteAdmin}
          canClose={canClosePacking}
          canTransition={canTransitionPackingStatus}
          canViewNovedades={canViewNovedades}
          busy={busy}
          actionBusy={actionBusy}
          extra={facturaAcciones}
          onRunAction={(action) => void runStatusAction(action)}
          onOpenNovedades={() => setShowNovedadesModal(true)}
          onOpenStatusModal={(modal) => {
            setStatusDecision("");
            setStatusModal(modal);
          }}
        />
      </section>

      {error ? <div className="rounded-md border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-1.5 text-[13px] text-[#FFB07A]">{error}</div> : null}

      {/* Envío: datos de la caja, rastreos y destinatario */}
      <section className={seccion}>
        <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
          <h3 className="text-[13px] font-semibold text-[#F5F5F5]">Envío</h3>
          <span className="ml-auto text-[12px] text-[#8F908A]">
            Creado <b className="text-[#E6E6E1]">{formatDate(packing.fechaCreacion || packing.createdTime)}</b>
            {packing.fechaCierre ? <> · Cierre <b className="text-[#E6E6E1]">{formatDate(packing.fechaCierre)}</b></> : null}
            {packing.fechaEnvio ? <> · Envío <b className="text-[#E6E6E1]">{formatDate(packing.fechaEnvio)}</b></> : null}
            {packing.fechaRecepcion ? <> · Recepción <b className="text-[#E6E6E1]">{formatDate(packing.fechaRecepcion)}</b></> : null}
          </span>
        </div>
        <div className="grid gap-2 border-t border-[#2A2B26] p-2 sm:grid-cols-2 lg:grid-cols-6">
          <SelectCampo label="Responsable" value={packing.proveedorResponsableId} options={providerOptions} disabled={!canEditField("proveedorResponsableId")} status={saveState.proveedorResponsableId} onSave={(value) => void savePackingField("proveedorResponsableId", value)} />
          <SelectCampo label="Tipo" value={packing.tipo} options={packingTypeOptions} disabled={!canEditField("tipo")} status={saveState.tipo} onSave={(value) => void savePackingField("tipo", value)} />
          <TextoCampo
            label="Peso (kg)"
            value={pesoTexto}
            inputMode="decimal"
            disabled={!canEditField("peso")}
            status={saveState.peso}
            onSave={(value) => {
              const text = value.trim().replace(",", ".");
              const numero = text ? Number(text) : null;
              if (numero !== null && (!Number.isFinite(numero) || numero < 0)) { setError("El peso debe ser un número mayor o igual a 0."); return; }
              void savePackingField("peso", numero);
            }}
          />
          <TextoCampo label="Orden referencia" value={packing.ordenReferencia} placeholder="#6739, PO-12345…" title="Recomendado para la factura; no la bloquea." disabled={!canEditField("ordenReferencia")} status={saveState.ordenReferencia} onSave={(value) => void savePackingField("ordenReferencia", value)} />
          <div className="min-w-0 sm:col-span-2">
            <span className={lbl}>Destinatario</span>
            {canLinkDestinatario ? (
              <div className="flex gap-1">
                <select value={selectedDestinatarioId} onChange={(event) => setSelectedDestinatarioId(event.target.value)} className={inp} title={currentDestinatario ? destinatarioResumen(currentDestinatario) : undefined}>
                  <option value="">Sin destinatario</option>
                  {shippingDestinatarios.map((destinatario) => (
                    <option key={destinatario.id} value={destinatario.id}>{destinatarioOptionLabel(destinatario)}</option>
                  ))}
                </select>
                {selectedDestinatarioId && selectedDestinatarioId !== currentDestinatario?.id ? (
                  <button type="button" disabled={destinatarioBusy} onClick={() => void linkDestinatario()} className={btnPrim}>
                    {destinatarioBusy ? "Vinculando…" : currentDestinatario ? "Cambiar" : "Vincular"}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="truncate py-1.5 text-[13px] text-[#E6E6E1]" title={currentDestinatario ? destinatarioResumen(currentDestinatario) : undefined}>
                {currentDestinatario ? destinatarioResumen(currentDestinatario) : "—"}
              </p>
            )}
          </div>
          <RastreoCampo
            label="Rastreo USA"
            className="lg:col-span-2"
            value={packing.trackingUsa}
            disabled={!canEditField("trackingUsa")}
            status={saveState.trackingUsa}
            trackingUrl={trackingUsaUrl}
            help={trackingUsaHelp}
            copied={copiedTracking === "usa"}
            onCopy={() => void copyTracking("usa", packing.trackingUsa)}
            onSave={(value) => void savePackingField("trackingUsa", value)}
          />
          <SelectCampo label="Transportista USA" value={packing.transportistaUsa} options={usaTransportProviderOptions} disabled={!canEditField("transportistaUsa")} status={saveState.transportistaUsa} onSave={(value) => void savePackingField("transportistaUsa", value)} />
          <RastreoCampo
            label="Rastreo Ecuador"
            className="lg:col-span-2"
            value={packing.trackingEc}
            disabled={!canEditField("trackingEc")}
            status={saveState.trackingEc}
            trackingUrl={trackingEcUrl}
            help={trackingEcHelp}
            copied={copiedTracking === "ec"}
            onCopy={() => void copyTracking("ec", packing.trackingEc)}
            onSave={(value) => void savePackingField("trackingEc", value)}
          />
          <SelectCampo label="Transportista Ecuador" value={packing.transportistaEc} options={ecuadorTransportProviderOptions} disabled={!canEditField("transportistaEc")} status={saveState.transportistaEc} onSave={(value) => void savePackingField("transportistaEc", value)} />
          <TextoCampo label="Notas" className="sm:col-span-2 lg:col-span-6" multiline value={packing.observaciones} disabled={!canEditField("observaciones")} status={saveState.observaciones} onSave={(value) => void savePackingField("observaciones", value)} />
        </div>
      </section>

      {/* Contenido: lo que va en la caja (agregar, quitar, arrastrar) */}
      <section className={seccion}>
        <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
          <h3 className="text-[13px] font-semibold text-[#F5F5F5]">Contenido</h3>
          <span className="text-[12px] text-[#8F908A]">{packingItemsUnitsSummary}</span>
          {responsableLabel || packing.proveedorResponsableNombre ? <span className="text-[12px] text-[#8F908A]">· {responsableLabel || packing.proveedorResponsableNombre}</span> : null}
        </div>
        <div className={`grid border-t border-[#2A2B26] ${canAddItems ? "lg:grid-cols-2" : ""}`}>
          {canAddItems ? (
            <div className="min-w-0 border-[#2A2B26] lg:border-r">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="text-[12px] font-semibold text-[#B4B5AC]">Disponibles <span className="tabular-nums text-[#8F908A]">{availableItems.length}</span></span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar SKU, nombre, proveedor…" className={`${inp} ml-auto max-w-[260px]`} />
              </div>
              <div className="max-h-[560px] overflow-y-auto border-t border-[#2A2B26]">
                {visibleCandidates.map((item) => {
                  const providerLabel = resolveShippingV2ProveedorLabel(item.proveedorId, providerLabels) || item.proveedorNombre || "";
                  const logisticsProviderLabel = resolveShippingV2ProveedorLabel(item.proveedorLogisticoId, providerLabels) || item.proveedorLogisticoNombre || "";
                  return (
                    <ItemCard
                      key={item.id}
                      item={item}
                      providerLabel={providerLabel}
                      logisticsProviderLabel={logisticsProviderLabel}
                      draggable={canAddItems && !busy}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", item.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      canViewCosts={canViewCosts}
                      canViewProviderCost={canViewProviderCost}
                      action={<button type="button" disabled={busy} onClick={() => void addItems([item.id])} className={`${btn} border-[#D7FF4F]/55 text-[#D7FF4F]`}>{busyItemId === item.id ? "…" : "Agregar"}</button>}
                    />
                  );
                })}
                {!visibleCandidates.length ? (
                  <p
                    className="px-2 py-4 text-center text-[12.5px] text-[#8F908A]"
                    title={"Para aparecer aquí un artículo debe: requerir packing, no estar en otra caja, tener modo Pendiente de packing / Crear packing individual / Asignar a packing existente, y ser de un proveedor compatible con esta caja."}
                  >
                    {availableItems.length ? "Nada coincide con la búsqueda." : "No hay artículos disponibles para esta caja."}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <div
            onDragOver={(event) => {
              if (!canAddItems) return;
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`min-w-0 transition ${dragOver ? "bg-[#D7FF4F]/10 outline outline-1 outline-[#D7FF4F]" : ""}`}
          >
            {canAddItems ? (
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="text-[12px] font-semibold text-[#B4B5AC]">En la caja <span className="tabular-nums text-[#8F908A]">{packing.items.length}</span></span>
                <span className="ml-auto text-[11.5px] text-[#6F706A]">Arrastra aquí o usa Agregar</span>
              </div>
            ) : null}
            <div className={`max-h-[560px] overflow-y-auto ${canAddItems ? "border-t border-[#2A2B26]" : ""}`}>
              {packing.items.map((item) => {
                const providerLabel = resolveShippingV2ProveedorLabel(item.proveedorId, providerLabels) || item.proveedorNombre || "";
                const logisticsProviderLabel = resolveShippingV2ProveedorLabel(item.proveedorLogisticoId, providerLabels) || item.proveedorLogisticoNombre || "";
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    providerLabel={providerLabel}
                    logisticsProviderLabel={logisticsProviderLabel}
                    showCosts
                    canViewCosts={canViewCosts}
                    canViewProviderCost={canViewProviderCost}
                    action={canRemoveItems ? <button type="button" disabled={busy} onClick={() => void removeItem(item)} className={`${btn} border-[#FF914D]/45 text-[#FFB07A]`}>{busyItemId === item.id ? "…" : "Quitar"}</button> : null}
                  />
                );
              })}
              {!packing.items.length ? <p className="px-2 py-5 text-center text-[12.5px] text-[#8F908A]">Caja vacía.</p> : null}
            </div>
          </div>
        </div>
      </section>

      {canViewCosts ? (
        <LogisticsCostsSection
          packing={packing}
          canEditDistributionRule={canEditDistributionRule()}
          canEditNote={canEditLogisticsCosts()}
          providerSummary={providerSummary}
          onSaved={(updatedPacking) => {
            setPacking(updatedPacking);
            router.refresh();
          }}
          onPagado={() => void recargarPacking()}
        />
      ) : null}

      {statusModal ? (
        <StatusDecisionModal
          modal={statusModal}
          value={statusDecision}
          busy={busy}
          onChange={setStatusDecision}
          onClose={() => {
            if (busy) return;
            setStatusModal(null);
            setStatusDecision("");
          }}
          onSubmit={() => void runStatusAction(statusModal.action, statusDecision.trim())}
        />
      ) : null}


      {showNovedadesModal ? (
        <NovedadesModal novedades={packingNovedades} onClose={() => setShowNovedadesModal(false)} />
      ) : null}
    </div>
  );
}
