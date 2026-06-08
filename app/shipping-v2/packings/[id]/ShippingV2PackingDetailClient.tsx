"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { InlineEditableField } from "@/components/shipping-v2/InlineEditableField";
import { createShippingV2ProveedorLabelMap, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { buildTrackingUrl } from "@/lib/shipping-v2/tracking";
import { getEcuadorTransportProvidersForPacking, getUsaTransportProviders, providerTrackingLabel } from "@/lib/shipping-v2/tracking-providers";
import { SHIPPING_V2_PACKING_TIPOS, SHIPPING_V2_REGLAS_DISTRIBUCION_COSTOS, type ShippingV2Item, type ShippingV2Novedad, type ShippingV2Packing, type ShippingV2PackingStatusAction, type ShippingV2Proveedor } from "@/types/shipping-v2";

type Props = { packing: ShippingV2Packing; candidates: ShippingV2Item[]; proveedores: ShippingV2Proveedor[]; novedades: ShippingV2Novedad[]; isAdmin: boolean };
type EditablePackingField = "nombre" | "tipo" | "observaciones" | "proveedorResponsableId" | "trackingUsa" | "transportistaUsa" | "trackingEc" | "transportistaEc" | "peso";
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
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function formatCurrencyZero(value: number | null | undefined) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value ?? 0);
}

function formatWeight(peso: number | null | undefined) {
  if (peso === null || peso === undefined) return "Sin registrar";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(peso)} kg`;
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

function SummaryBadge({ label, value, accent }: { label: string; value: string; accent?: "status" | "items" }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#3A3A36] bg-[#171816]/80 px-3 py-2">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">
        {accent === "items" ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-[#A7A7A7]">
            <path d="M12 3 4.5 7.2v9.6L12 21l7.5-4.2V7.2L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="m4.8 7.4 7.2 4.1 7.2-4.1M12 11.5v9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        ) : null}
        {label}
      </p>
      <p className="mt-1 flex min-h-6 items-center gap-2 break-words text-sm font-semibold leading-tight text-[#F5F5F5]">
        {accent === "status" ? <span className="h-2.5 w-2.5 rounded-full bg-[#7CFF4F] shadow-[0_0_14px_rgba(124,255,79,0.55)]" /> : null}
        {value}
      </p>
    </div>
  );
}

function WeightSummaryBadge({
  peso,
  canEditWeight,
  onSaveWeight,
}: {
  peso: number | null;
  canEditWeight: boolean;
  onSaveWeight: (value: string | number | boolean | null) => Promise<void>;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[#3A3A36] bg-[#171816]/80 px-3 py-2">
      <InlineEditableField
        label="Peso"
        value={peso}
        type="number"
        readOnly={!canEditWeight}
        displayValue={formatWeight(peso)}
        editSuffix="kg"
        className="rounded-lg transition"
        labelClassName="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]"
        valueClassName="mt-2 min-h-6 break-words text-sm font-semibold leading-tight text-[#F5F5F5] tabular-nums"
        onSave={onSaveWeight}
      />
    </div>
  );
}

function HeaderProviderSelect({
  label = "Proveedor responsable",
  value,
  options,
  disabled,
  status,
  onSave,
}: {
  label?: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  status?: "saving" | "saved" | "error";
  onSave: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 rounded-xl border border-[#3A3A36] bg-[#171816]/80 px-3 py-2">
      <span className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">
        {label}
        <SaveBadge status={status} />
      </span>
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(event) => onSave(event.target.value)}
        className="mt-1 h-9 w-full rounded-lg border border-[#4A4A45] bg-[#191A18]/80 px-3 text-[13px] font-semibold text-[#F5F5F5] outline-none transition hover:border-[#D7FF4F]/45 focus:border-[#D7FF4F]/70 disabled:opacity-70"
      >
        {options.map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function HeaderFooterSelect({
  label,
  value,
  options,
  disabled,
  status,
  onSave,
}: {
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  status?: "saving" | "saved" | "error";
  onSave: (value: string) => void;
}) {
  return (
    <label className="inline-flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}:</span>
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(event) => onSave(event.target.value)}
        className="h-8 min-w-24 rounded-full border border-[#4A4A45] bg-[#191A18]/80 px-3 text-sm font-semibold text-[#F5F5F5] outline-none transition hover:border-[#D7FF4F]/45 focus:border-[#D7FF4F]/70 disabled:opacity-70"
      >
        {options.map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}
      </select>
      <SaveBadge status={status} />
    </label>
  );
}

function SaveBadge({ status }: { status?: "saving" | "saved" | "error" }) {
  if (!status) return null;
  const label = status === "saving" ? "Guardando..." : status === "saved" ? "Guardado" : "Error";
  const color = status === "error" ? "text-[#FFB07A]" : "text-[#D7FF4F]";
  return <span className={`text-[11px] font-semibold ${color}`}>{label}</span>;
}

function EditableTextField({
  label,
  value,
  disabled,
  status,
  multiline,
  help,
  onSave,
}: {
  label: string;
  value?: string;
  disabled?: boolean;
  status?: "saving" | "saved" | "error";
  multiline?: boolean;
  help?: string;
  onSave: (value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value || "");
  useEffect(() => setLocalValue(value || ""), [value]);
  const commit = () => {
    if (!disabled && localValue !== (value || "")) onSave(localValue);
  };
  return (
    <label className="block rounded-[1rem] border border-[#3A3A36] bg-[#151515] px-4 py-3">
      <span className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">
        {label}
        <SaveBadge status={status} />
      </span>
      {multiline ? (
        <textarea
          value={localValue}
          disabled={disabled}
          onChange={(event) => setLocalValue(event.target.value)}
          onBlur={commit}
          className="mt-2 min-h-20 w-full resize-y rounded-[0.85rem] border border-[#3A3A36] bg-[#101010] px-3 py-2 text-sm font-medium text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-70"
        />
      ) : (
        <input
          value={localValue}
          disabled={disabled}
          onChange={(event) => setLocalValue(event.target.value)}
          onBlur={commit}
          className="mt-2 h-10 w-full rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm font-medium text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-70"
        />
      )}
      {help ? <span className="mt-2 block text-xs font-normal normal-case text-[#A7A7A7]">{help}</span> : null}
    </label>
  );
}

function EditableSelectField({
  label,
  value,
  options,
  disabled,
  status,
  onSave,
}: {
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  status?: "saving" | "saved" | "error";
  onSave: (value: string) => void;
}) {
  return (
    <label className="block rounded-[1rem] border border-[#3A3A36] bg-[#151515] px-4 py-3">
      <span className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">
        {label}
        <SaveBadge status={status} />
      </span>
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(event) => onSave(event.target.value)}
        className="mt-2 h-10 w-full rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm font-medium text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-70"
      >
        {options.map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function TrackingActions({
  tracking,
  trackingUrl,
  help,
  copied,
  onCopy,
}: {
  tracking?: string;
  trackingUrl: string | null;
  help?: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  if (!tracking?.trim()) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full border border-[#3A3A36] bg-[#151515] px-3 py-1 text-xs font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
        {trackingUrl ? (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-[#D7FF4F]/45 bg-[#D7FF4F]/10 px-3 py-1 text-xs font-semibold text-[#D7FF4F] transition hover:border-[#D7FF4F]"
          >
            Ver rastreo
          </a>
        ) : null}
      </div>
      {help ? <p className="text-xs leading-5 text-[#A7A7A7]">{help}</p> : null}
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

const NOVEDAD_TYPES = [
  "Demora en aduana",
  "Tracking sin movimiento",
  "Packing perdido",
  "Caja golpeada",
  "Diferencia de peso",
  "Retenido por courier",
  "Otro",
];

function statusToneClass(status: string) {
  const state = normalize(status);
  if (state === "en proceso") return "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  if (state === "cerrado") return "border-[#F4E85B]/35 bg-[#F4E85B]/10 text-[#F4E85B]";
  if (state === "en transito") return "border-[#8B73FF]/35 bg-[#8B73FF]/10 text-[#C9BFFF]";
  if (state === "recibido" || state === "en revision") return "border-[#4FC3FF]/35 bg-[#4FC3FF]/10 text-[#BDEAFF]";
  if (state === "con novedad" || state === "cancelado") return "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]";
  return "border-[#3A3A36] bg-[#151515] text-[#A7A7A7]";
}

function getPackingStatusConfig(status: string, input: { hasOpenNovedades: boolean }): PackingStatusConfig {
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
    return {
      action: "close-final",
      label: "Cerrar final",
      description: input.hasOpenNovedades ? "Hay novedades pendientes antes del cierre final." : "Sin novedades pendientes: listo para cierre final.",
      disabled: input.hasOpenNovedades,
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
    return { description: "Packing cerrado final. Solo lectura.", disabled: true };
  }
  return { description: "Estado sin acción operativa configurada.", disabled: true };
}

function StatusActionPanel({
  packing,
  novedades,
  isAdmin,
  busy,
  actionBusy,
  onRunAction,
  onOpenNovedad,
  onOpenNovedades,
  onOpenStatusModal,
}: {
  packing: ShippingV2Packing;
  novedades: ShippingV2Novedad[];
  isAdmin: boolean;
  busy: boolean;
  actionBusy: ShippingV2PackingStatusAction | "";
  onRunAction: (action: ShippingV2PackingStatusAction) => void;
  onOpenNovedad: () => void;
  onOpenNovedades: () => void;
  onOpenStatusModal: (action: StatusModalAction) => void;
}) {
  const openNovedades = novedades.filter((novedad) => isOpenNovedadStatus(novedad.estado));
  const state = normalize(packing.estado);
  const config = getPackingStatusConfig(packing.estado, { hasOpenNovedades: openNovedades.length > 0 });
  const canCancel = isAdmin && !["cancelado", "cerrado final"].includes(state);
  const canRegisterNovedad = ["en proceso", "cerrado", "en transito", "recibido", "en revision"].includes(state) || (isAdmin && state === "cerrado final");
  const canRestoreLegacyNovedad = isAdmin && state === "con novedad";

  return (
    <div className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid min-w-0 gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
          <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${statusToneClass(packing.estado)}`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            {display(packing.estado)}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Control operativo</p>
            <p className="mt-0.5 text-sm leading-5 text-[#F5F5F5]">{config.description}</p>
            {(packing.trackingUsa || packing.trackingEc) && state === "cerrado" ? (
              <p className="mt-0.5 text-xs leading-5 text-[#D7FF4F]">Tracking registrado; el tránsito sigue requiriendo confirmación.</p>
            ) : null}
            {openNovedades.length ? (
              <p className="mt-1 text-xs leading-5 text-[#FFB07A]">Este packing tiene novedades pendientes.</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          {openNovedades.length ? (
            <span className="inline-flex h-9 items-center rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 text-xs font-bold text-[#FFB07A]">
              {openNovedades.length} novedades abiertas
            </span>
          ) : null}

          {config.action ? (
            <button
              type="button"
              disabled={busy || config.disabled}
              onClick={() => onRunAction(config.action as ShippingV2PackingStatusAction)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50"
            >
              {actionBusy === config.action ? "Procesando..." : config.label}
            </button>
          ) : null}

          {canRegisterNovedad ? (
            <button
              type="button"
              disabled={busy}
              onClick={onOpenNovedad}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F] disabled:opacity-50"
            >
              Registrar novedad
            </button>
          ) : null}

          {novedades.length ? (
            <button
              type="button"
              onClick={onOpenNovedades}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[#D7FF4F]/45 bg-[#D7FF4F]/10 px-3 text-sm font-semibold text-[#D7FF4F] transition hover:border-[#D7FF4F]"
            >
              Ver novedades
            </button>
          ) : null}

          {(canCancel || canRestoreLegacyNovedad) ? (
            <details className="relative">
              <summary className="flex h-9 cursor-pointer list-none items-center rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/45 hover:text-[#F5F5F5]">
                Más acciones
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-[#3A3A36] bg-[#10110F] p-2 shadow-2xl shadow-black/50">
                {canRestoreLegacyNovedad ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onOpenStatusModal({
                        action: "restore-in-transit",
                        title: "Volver a En tránsito",
                        label: "Restaurar estado",
                        fieldLabel: "Confirmación administrativa",
                        description: "Solo cambia el estado principal del packing. No modifica items ni novedades.",
                      })}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#F5F5F5] hover:bg-[#1E1F1C] disabled:opacity-50"
                    >
                      Volver a En tránsito
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onOpenStatusModal({
                        action: "restore-received",
                        title: "Volver a Recibido",
                        label: "Restaurar estado",
                        fieldLabel: "Confirmación administrativa",
                        description: "Solo cambia el estado principal del packing. No modifica items ni novedades.",
                      })}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#F5F5F5] hover:bg-[#1E1F1C] disabled:opacity-50"
                    >
                      Volver a Recibido
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onOpenStatusModal({
                        action: "restore-review",
                        title: "Volver a En revisión",
                        label: "Restaurar estado",
                        fieldLabel: "Confirmación administrativa",
                        description: "Solo cambia el estado principal del packing. No modifica items ni novedades.",
                      })}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#F5F5F5] hover:bg-[#1E1F1C] disabled:opacity-50"
                    >
                      Volver a En revisión
                    </button>
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
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#FFB07A] hover:bg-[#2A1B14] disabled:opacity-50"
                  >
                    Cancelar packing
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
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

function NovedadModal({
  form,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  form: { tipo: string; descripcion: string; evidenciaUrl: string };
  busy: boolean;
  onChange: (form: { tipo: string; descripcion: string; evidenciaUrl: string }) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <ModalShell title="Registrar novedad" description="La novedad quedará relacionada al packing y moverá el estado a Con novedad cuando aplique." onClose={onClose}>
      <div className="grid gap-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Tipo de novedad</span>
          <select
            value={form.tipo}
            disabled={busy}
            onChange={(event) => onChange({ ...form, tipo: event.target.value })}
            className="mt-2 h-10 w-full rounded-lg border border-[#3A3A36] bg-[#101010] px-3 text-sm font-semibold text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-60"
          >
            {NOVEDAD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Descripción</span>
          <textarea
            value={form.descripcion}
            disabled={busy}
            onChange={(event) => onChange({ ...form, descripcion: event.target.value })}
            className="mt-2 min-h-28 w-full resize-y rounded-lg border border-[#3A3A36] bg-[#101010] px-3 py-2 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Evidencia URL</span>
          <input
            value={form.evidenciaUrl}
            disabled={busy}
            onChange={(event) => onChange({ ...form, evidenciaUrl: event.target.value })}
            placeholder="Opcional"
            className="mt-2 h-10 w-full rounded-lg border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-60"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={busy} onClick={onClose} className="h-9 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/45 disabled:opacity-50">Cancelar</button>
        <button type="button" disabled={busy || !form.descripcion.trim()} onClick={onSubmit} className="h-9 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50">{busy ? "Guardando..." : "Guardar novedad"}</button>
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
  onDragStart,
}: {
  item: ShippingV2Item;
  providerLabel: string;
  logisticsProviderLabel?: string;
  action: ReactNode;
  draggable?: boolean;
  showCosts?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
}) {
  const costRows = [
    { label: "Proveedor", value: item.costoProveedor },
    { label: "Flete", value: item.costoFleteAsignado },
    { label: "Arancel", value: item.costoArancelAsignado },
    { label: "Otros", value: item.otrosCostosAsignados },
    { label: "Logístico", value: item.costoLogisticoAsignado },
    { label: "Total unidad", value: item.costoTotalUnidad },
  ];

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      className={`rounded-[1rem] border border-[#3A3A36] bg-[#151515] p-4 transition ${draggable ? "cursor-grab hover:border-[#D7FF4F]/45 active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#D7FF4F]">{display(item.sku)}</p>
          <p className="mt-1 break-words text-sm font-semibold text-[#F5F5F5]">{display(item.nombre)}</p>
        </div>
        {action}
      </div>
      <div className="mt-3 grid gap-2 text-xs text-[#A7A7A7] sm:grid-cols-2">
        <p>Estado: <span className="text-[#F5F5F5]">{display(item.estado)}</span></p>
        <p>Operación: <span className="text-[#F5F5F5]">{display(item.tipoOperacion)}</span></p>
        <p>Proveedor compra: <span className="text-[#F5F5F5]">{display(providerLabel || item.proveedorNombre)}</span></p>
        <p>Proveedor logístico: <span className="text-[#F5F5F5]">{display(logisticsProviderLabel || item.proveedorLogisticoNombre)}</span></p>
        <p>Modo: <span className="text-[#F5F5F5]">{display(item.modoLogistico)}</span></p>
        <p>Categoría: <span className="text-[#F5F5F5]">{display(item.categoria)}</span></p>
        <p>Costo: <span className="text-[#F5F5F5]">{formatCurrency(item.costoProveedor)}</span></p>
      </div>
      {showCosts ? <div className="mt-3 border-t border-[#2F302C] pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-normal text-[#D7FF4F]">Costos</p>
          <p className="text-xs font-semibold text-[#F5F5F5]">{formatCurrencyZero(item.costoTotalUnidad)}</p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[#A7A7A7] sm:grid-cols-3">
          {costRows.map((row) => (
            <p key={row.label} className="flex min-w-0 justify-between gap-2">
              <span className="truncate">{row.label}</span>
              <span className="shrink-0 font-semibold text-[#F5F5F5]">{formatCurrencyZero(row.value)}</span>
            </p>
          ))}
        </div>
      </div> : null}
    </article>
  );
}

function moneyInputValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function parseMoneyInput(value: string) {
  const text = value.trim().replace(",", ".");
  if (!text) return 0;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error("Ingresa un valor numerico valido.");
  if (parsed < 0) throw new Error("Los costos no pueden ser negativos.");
  return parsed;
}

function safeMoneyInputValue(value: string) {
  try {
    return parseMoneyInput(value);
  } catch {
    return 0;
  }
}

function LogisticsCostsSection({
  packing,
  canEdit,
  onSaved,
}: {
  packing: ShippingV2Packing;
  canEdit: boolean;
  onSaved: (packing: ShippingV2Packing) => void;
}) {
  const [form, setForm] = useState({
    flete: moneyInputValue(packing.flete),
    arancel: moneyInputValue(packing.arancel),
    otrosCostos: moneyInputValue(packing.otrosCostos),
    reglaDistribucionCostos: packing.reglaDistribucionCostos || "No definida",
    observacionCostos: packing.observacionCostos || "",
  });
  const [status, setStatus] = useState<"saving" | "saved" | "error" | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      flete: moneyInputValue(packing.flete),
      arancel: moneyInputValue(packing.arancel),
      otrosCostos: moneyInputValue(packing.otrosCostos),
      reglaDistribucionCostos: packing.reglaDistribucionCostos || "No definida",
      observacionCostos: packing.observacionCostos || "",
    });
  }, [packing]);

  const flete = safeMoneyInputValue(form.flete);
  const arancel = safeMoneyInputValue(form.arancel);
  const otrosCostos = safeMoneyInputValue(form.otrosCostos);
  const total = flete + arancel + otrosCostos;
  const isPreliminary = normalize(packing.estado) === "en proceso";

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveCosts() {
    setStatus("saving");
    setError("");
    try {
      const payload = {
        flete: parseMoneyInput(form.flete),
        arancel: parseMoneyInput(form.arancel),
        otrosCostos: parseMoneyInput(form.otrosCostos),
        reglaDistribucionCostos: form.reglaDistribucionCostos,
        observacionCostos: form.observacionCostos,
      };
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => ({}));
      if (!response.ok || !responsePayload.success) throw new Error(String(responsePayload.error || "No se pudieron guardar los costos."));
      onSaved(responsePayload.data as ShippingV2Packing);
      setStatus("saved");
      window.setTimeout(() => setStatus(undefined), 1400);
    } catch (saveError) {
      setStatus("error");
      setError(saveError instanceof Error ? saveError.message : "Error inesperado.");
    }
  }

  const compactInputClass = "mt-1 h-7 w-full rounded border border-transparent bg-transparent p-0 text-sm font-semibold text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/55 focus:bg-[#101010] focus:px-2 disabled:opacity-70";
  const compactSelectClass = "mt-1 h-8 w-full rounded border border-transparent bg-transparent p-0 text-sm font-semibold text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/55 focus:bg-[#101010] focus:px-2 disabled:opacity-70";
  const compactTextareaClass = "mt-1 min-h-8 w-full resize-y rounded border border-transparent bg-transparent p-0 text-sm font-semibold text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/55 focus:bg-[#101010] focus:px-2 disabled:opacity-70";

  return (
    <section className="rounded-[1.5rem] border border-[#3A3A36] bg-[#2A2A28] p-4">
      <div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">Costos logísticos</p>
          <h3 className="mt-1 text-xl font-semibold text-[#F5F5F5]">Importación del packing</h3>
          <p className="mt-1 text-sm leading-6 text-[#A7A7A7]">
            {isPreliminary ? "Los costos finales se registran cuando el packing este cerrado o en transito." : "Registra los costos reales de importacion del grupo fisico."}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CostSummaryItem label="Flete">
          <input inputMode="decimal" value={form.flete} disabled={!canEdit} onChange={(event) => update("flete", event.target.value)} className={compactInputClass} />
        </CostSummaryItem>
        <CostSummaryItem label="Arancel">
          <input inputMode="decimal" value={form.arancel} disabled={!canEdit} onChange={(event) => update("arancel", event.target.value)} className={compactInputClass} />
        </CostSummaryItem>
        <CostSummaryItem label="Otros costos">
          <input inputMode="decimal" value={form.otrosCostos} disabled={!canEdit} onChange={(event) => update("otrosCostos", event.target.value)} className={compactInputClass} />
        </CostSummaryItem>
        <CostSummaryItem label="Total logístico" value={formatCurrencyZero(total)} strong />
        <CostSummaryItem label="Costo total proveedor items" value={formatCurrencyZero(packing.costoTotalItemsProveedor)} />
        <CostSummaryItem label="Cantidad items" value={display(packing.cantidadItemsPacking ?? packing.itemCount)} />
        <CostSummaryItem label="Regla distribución">
          <select value={form.reglaDistribucionCostos} disabled={!canEdit} onChange={(event) => update("reglaDistribucionCostos", event.target.value)} className={compactSelectClass}>
            {SHIPPING_V2_REGLAS_DISTRIBUCION_COSTOS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </CostSummaryItem>
        <CostSummaryItem label="Observación costos">
          <textarea value={form.observacionCostos} disabled={!canEdit} onChange={(event) => update("observacionCostos", event.target.value)} className={compactTextareaClass} />
        </CostSummaryItem>
      </div>

      <p className="mt-3 text-xs leading-5 text-[#A7A7A7]">
        La distribución por item se calcula automáticamente desde Airtable según la regla seleccionada.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1 text-xs text-[#A7A7A7] sm:grid-cols-3 sm:gap-4">
          <span>Cierre: <strong className="font-semibold text-[#F5F5F5]">{formatDate(packing.fechaCierre)}</strong></span>
          <span>Envío: <strong className="font-semibold text-[#F5F5F5]">{formatDate(packing.fechaEnvio)}</strong></span>
          <span>Recepción: <strong className="font-semibold text-[#F5F5F5]">{formatDate(packing.fechaRecepcion)}</strong></span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {error ? <span className="text-sm font-semibold text-[#FFB07A]">{error}</span> : null}
          <SaveBadge status={status} />
          <button type="button" disabled={!canEdit || status === "saving"} onClick={() => void saveCosts()} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-5 py-2.5 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50">
            Guardar costos
          </button>
        </div>
      </div>
    </section>
  );
}

function CostSummaryItem({ label, value, strong = false, children }: { label: string; value?: string; strong?: boolean; children?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[0.75rem] border border-[#3A3A36] bg-[#151515] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</p>
      {children ?? <p className={`mt-1 truncate text-sm ${strong ? "font-bold text-[#D7FF4F]" : "font-semibold text-[#F5F5F5]"}`}>{value}</p>}
    </div>
  );
}

export function ShippingV2PackingDetailClient({ packing: initialPacking, candidates, proveedores, novedades, isAdmin }: Props) {
  const router = useRouter();
  const [packing, setPacking] = useState(initialPacking);
  const [availableItems, setAvailableItems] = useState(candidates.filter((item) => !initialPacking.itemIds.includes(item.id)));
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busyItemId, setBusyItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<ShippingV2PackingStatusAction | "">("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({});
  const [copiedTracking, setCopiedTracking] = useState<"usa" | "ec" | null>(null);
  const [packingNovedades, setPackingNovedades] = useState(novedades);
  const [statusModal, setStatusModal] = useState<StatusModalAction | null>(null);
  const [statusDecision, setStatusDecision] = useState("");
  const [showNovedadModal, setShowNovedadModal] = useState(false);
  const [showNovedadesModal, setShowNovedadesModal] = useState(false);
  const [novedadForm, setNovedadForm] = useState({ tipo: NOVEDAD_TYPES[0], descripcion: "", evidenciaUrl: "" });
  const canEditItems = isOpen(packing.estado);
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

  useEffect(() => setPackingNovedades(novedades), [novedades]);

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
    if (state === "en proceso") return true;
    if (state === "cerrado") return ["trackingUsa", "transportistaUsa", "trackingEc", "transportistaEc", "peso"].includes(field);
    if (state === "en transito") return ["trackingUsa", "transportistaUsa", "trackingEc", "transportistaEc", "peso"].includes(field);
    return false;
  }

  function canEditLogisticsCosts() {
    const state = normalize(packing.estado);
    return ["en proceso", "cerrado", "en transito", "recibido"].includes(state);
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

  async function saveInlinePackingField(field: EditablePackingField, value: string | number | boolean | null) {
    if (!canEditField(field)) throw new Error("Este campo no se puede editar en el estado actual.");
    if (field === "peso" && typeof value === "number" && value < 0) throw new Error("El peso no puede ser negativo.");
    const previousPacking = packing;
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
    } catch (saveError) {
      setPacking(previousPacking);
      const message = saveError instanceof Error ? saveError.message : "Error al guardar.";
      setError(message);
      throw new Error(message);
    }
  }

  async function addItems(itemIds: string[]) {
    if (!canEditItems || !itemIds.length || busy) return;
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
    if (!canEditItems || busy) return;
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

  async function saveNovedad() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}/novedades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novedadForm),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo registrar la novedad."));
      setPacking(payload.data as ShippingV2Packing);
      if (payload.novedad) setPackingNovedades((current) => [payload.novedad as ShippingV2Novedad, ...current]);
      setNovedadForm({ tipo: NOVEDAD_TYPES[0], descripcion: "", evidenciaUrl: "" });
      setShowNovedadModal(false);
      router.refresh();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain");
    if (itemId) void addItems([itemId]);
  }

  return (
    <div className="w-full space-y-2.5">
      <section className="overflow-hidden rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2.5 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/shipping-v2/packings"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-bold text-[#151515] shadow-[0_0_20px_rgba(215,255,79,0.14)] transition hover:brightness-105"
          >
            Volver a Packings
          </Link>
        </div>

        <div className="mt-3">
          <StatusActionPanel
            packing={packing}
            novedades={packingNovedades}
            isAdmin={isAdmin}
            busy={busy}
            actionBusy={actionBusy}
            onRunAction={(action) => void runStatusAction(action)}
            onOpenNovedad={() => setShowNovedadModal(true)}
            onOpenNovedades={() => setShowNovedadesModal(true)}
            onOpenStatusModal={(modal) => {
              setStatusDecision("");
              setStatusModal(modal);
            }}
          />
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(280px,0.75fr)_minmax(520px,1.25fr)] xl:items-start">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Packing ID</p>
            <h2 className="mt-1 break-words text-xl font-semibold leading-tight text-[#F5F5F5] sm:text-2xl">{display(packing.packingId)}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-1 text-xs font-semibold text-[#D7FF4F]">
                <span className="h-2 w-2 rounded-full bg-[#7CFF4F] shadow-[0_0_14px_rgba(124,255,79,0.55)]" />
                {display(packing.estado)}
              </span>
              {packing.observaciones?.trim() ? <span className="rounded-full border border-[#3A3A36] bg-[#171816]/80 px-3 py-1 text-xs font-semibold text-[#A7A7A7]">Con observación</span> : null}
            </div>
            {packing.nombre?.trim() ? <p className="mt-2 text-sm font-medium text-[#A7A7A7]">{packing.nombre.trim()}</p> : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <SummaryBadge label="Items" value={String(packing.itemCount)} accent="items" />
            <WeightSummaryBadge
              peso={packing.peso}
              canEditWeight={canEditField("peso")}
              onSaveWeight={(value) => saveInlinePackingField("peso", value)}
            />
            <HeaderProviderSelect
              label="Responsable"
              value={packing.proveedorResponsableId}
              options={providerOptions}
              disabled={!canEditField("proveedorResponsableId")}
              status={saveState.proveedorResponsableId}
              onSave={(value) => void savePackingField("proveedorResponsableId", value)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#A7A7A7]">
          <HeaderFooterSelect
            label="Tipo"
            value={packing.tipo}
            options={packingTypeOptions}
            disabled={!canEditField("tipo")}
            status={saveState.tipo}
            onSave={(value) => void savePackingField("tipo", value)}
          />
          <span className="hidden text-[#5E5E58] sm:inline">·</span>
          <span><span className="font-semibold text-[#A7A7A7]">Creado:</span> <span className="text-[#F5F5F5]">{formatDate(packing.fechaCreacion || packing.createdTime)}</span></span>
          <span className="hidden text-[#5E5E58] sm:inline">·</span>
          <span><span className="font-semibold text-[#A7A7A7]">Cierre:</span> <span className="text-[#F5F5F5]">{formatDate(packing.fechaCierre)}</span></span>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2.5 text-sm text-[#FFB07A]">{error}</div> : null}

      <section className="rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/20">
        <div className="border-b border-[#30312D] bg-[#20211D] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">Armado del packing</p>
          <h3 className="mt-0.5 text-base font-semibold text-[#F5F5F5]">Items y caja</h3>
        </div>

        <div className="grid gap-2 p-2 xl:grid-cols-[minmax(340px,0.9fr)_minmax(520px,1.1fr)]">
          <aside className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-[#F5F5F5]">Items disponibles para packing</h4>
                <p className="mt-1 text-xs text-[#A7A7A7]">{availableItems.length} items disponibles</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-1">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar items" className="h-9 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 md:col-span-3 xl:col-span-1" />
            </div>
            <div className="mt-3 grid max-h-[640px] gap-2 overflow-y-auto pr-1">
              {visibleCandidates.map((item) => {
                const providerLabel = resolveShippingV2ProveedorLabel(item.proveedorId, providerLabels) || item.proveedorNombre || "";
                const logisticsProviderLabel = resolveShippingV2ProveedorLabel(item.proveedorLogisticoId, providerLabels) || item.proveedorLogisticoNombre || "";
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    providerLabel={providerLabel}
                    logisticsProviderLabel={logisticsProviderLabel}
                    draggable={canEditItems && !busy}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", item.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    action={<button type="button" disabled={!canEditItems || busy} onClick={() => void addItems([item.id])} className="min-w-[92px] rounded-full border border-[#D7FF4F]/55 px-3 py-1 text-xs font-semibold text-[#D7FF4F] disabled:opacity-50">{busyItemId === item.id ? "Guardando..." : "Agregar"}</button>}
                  />
                );
              })}
              {!visibleCandidates.length ? (
                <div className="rounded-xl border border-[#3A3A36] bg-[#151515] px-3 py-3 text-sm text-[#A7A7A7]">
                  <p className="font-semibold text-[#F5F5F5]">No hay items disponibles para este packing.</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5">
                    <li>Verifica que el Item tenga Requiere packing = Sí.</li>
                    <li>Verifica que no tenga Packing relacionado.</li>
                    <li>Verifica que su Modo logístico sea Pendiente de packing, Crear packing individual o Asignar a packing existente.</li>
                    <li>Verifica que el proveedor del Item sea compatible con este packing.</li>
                  </ul>
                </div>
              ) : null}
            </div>
          </aside>

          <section
            onDragOver={(event) => {
              if (!canEditItems) return;
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`relative overflow-hidden rounded-xl border p-3 transition ${dragOver ? "border-[#D7FF4F] bg-[#D7FF4F]/10" : "border-[#3A3A36] bg-[#151515]"}`}
          >
            <div className="pointer-events-none absolute right-5 top-4 text-5xl font-black text-[#2A2A28]">BOX</div>
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">Caja abierta / Packing actual</p>
                <h4 className="mt-1 text-xl font-semibold text-[#F5F5F5]">{display(packing.packingId)}</h4>
                <p className="mt-1 text-sm text-[#A7A7A7]">{display(packing.estado)} · {packing.items.length} items</p>
                <p className="mt-1 text-sm text-[#A7A7A7]">Proveedor: {display(responsableLabel || packing.proveedorResponsableNombre)}</p>
                {packing.trackingUsa ? <p className="mt-1 text-sm text-[#A7A7A7]">Tracking USA: {packing.trackingUsa}</p> : null}
                {packing.trackingEc ? <p className="mt-1 text-sm text-[#A7A7A7]">Tracking EC: {packing.trackingEc}</p> : null}
              </div>
              {canEditItems ? <span className="rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-1 text-xs font-semibold text-[#D7FF4F]">Arrastra aqui</span> : null}
            </div>
            {!canEditItems ? <p className="relative mt-3 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#A7A7A7]">Este packing ya no permite modificar items desde vista normal.</p> : null}
            <div className="relative mt-3 grid max-h-[640px] gap-2 overflow-y-auto pr-1">
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
                    action={canEditItems ? <button type="button" disabled={busy} onClick={() => void removeItem(item)} className="min-w-[92px] rounded-full border border-[#FF914D]/45 px-3 py-1 text-xs font-semibold text-[#FFB07A] disabled:opacity-50">{busyItemId === item.id ? "Guardando..." : "Quitar"}</button> : null}
                  />
                );
              })}
              {!packing.items.length ? <p className="rounded-xl border border-dashed border-[#3A3A36] px-3 py-5 text-center text-sm text-[#A7A7A7]">La caja esta vacia. Agrega items desde el panel izquierdo.</p> : null}
            </div>
          </section>
        </div>
      </section>

      <section>
        <div className="rounded-[1.5rem] border border-[#3A3A36] bg-[#2A2A28] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#F5F5F5]">Tracking y logística</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1rem] border border-[#3A3A36] bg-[#1E1F1C] p-3">
              <p className="text-xs font-semibold text-[#D7FF4F]">Ruta USA · Proveedor a Miami</p>
              <p className="mt-1 text-xs text-[#A7A7A7]">Usa estos campos para la guía del proveedor o vendedor hasta Miami.</p>
              <div className="mt-3 grid gap-3">
                <EditableTextField label="Tracking USA" value={packing.trackingUsa} disabled={!canEditField("trackingUsa")} status={saveState.trackingUsa} onSave={(value) => void savePackingField("trackingUsa", value)} />
                <TrackingActions
                  tracking={packing.trackingUsa}
                  trackingUrl={trackingUsaUrl}
                  help={trackingUsaHelp}
                  copied={copiedTracking === "usa"}
                  onCopy={() => void copyTracking("usa", packing.trackingUsa)}
                />
                <EditableSelectField label="Transportista USA" value={packing.transportistaUsa} options={usaTransportProviderOptions} disabled={!canEditField("transportistaUsa")} status={saveState.transportistaUsa} onSave={(value) => void savePackingField("transportistaUsa", value)} />
              </div>
            </div>
            <div className="rounded-[1rem] border border-[#3A3A36] bg-[#1E1F1C] p-3">
              <p className="text-xs font-semibold text-[#D7FF4F]">Ruta Ecuador · Miami a SUPER GEEK</p>
              <p className="mt-1 text-xs text-[#A7A7A7]">Usa estos campos para la guía del operador logístico desde Miami hacia Ecuador.</p>
              <div className="mt-3 grid gap-3">
                <EditableTextField label="Tracking EC" value={packing.trackingEc} disabled={!canEditField("trackingEc")} status={saveState.trackingEc} onSave={(value) => void savePackingField("trackingEc", value)} />
                <TrackingActions
                  tracking={packing.trackingEc}
                  trackingUrl={trackingEcUrl}
                  help={trackingEcHelp}
                  copied={copiedTracking === "ec"}
                  onCopy={() => void copyTracking("ec", packing.trackingEc)}
                />
                <EditableSelectField label="Transportista EC" value={packing.transportistaEc} options={ecuadorTransportProviderOptions} disabled={!canEditField("transportistaEc")} status={saveState.transportistaEc} onSave={(value) => void savePackingField("transportistaEc", value)} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <LogisticsCostsSection
        packing={packing}
        canEdit={canEditLogisticsCosts()}
        onSaved={(updatedPacking) => {
          setPacking(updatedPacking);
          router.refresh();
        }}
      />

      <section className="rounded-[1.5rem] border border-[#3A3A36] bg-[#2A2A28] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[#F5F5F5]">Notas del packing</h3>
        <EditableTextField label="Observaciones" value={packing.observaciones} multiline disabled={!canEditField("observaciones")} status={saveState.observaciones} onSave={(value) => void savePackingField("observaciones", value)} />
      </section>

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

      {showNovedadModal ? (
        <NovedadModal
          form={novedadForm}
          busy={busy}
          onChange={setNovedadForm}
          onClose={() => {
            if (busy) return;
            setShowNovedadModal(false);
          }}
          onSubmit={() => void saveNovedad()}
        />
      ) : null}

      {showNovedadesModal ? (
        <NovedadesModal novedades={packingNovedades} onClose={() => setShowNovedadesModal(false)} />
      ) : null}
    </div>
  );
}
