"use client";

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ShippingV2InlineFieldType } from "@/lib/shipping-v2/item-edit-config";

type Option = {
  value: string;
  label: string;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  label: string;
  value: string | number | boolean | null | undefined;
  type: ShippingV2InlineFieldType;
  options?: readonly Option[] | readonly string[];
  readOnly?: boolean;
  displayValue?: ReactNode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  hideLabel?: boolean;
  onSave?: (value: string | number | boolean | null) => Promise<void>;
};

function stringifyValue(value: Props["value"]) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function normalizeForSave(type: ShippingV2InlineFieldType, value: string | boolean) {
  if (type === "checkbox") return Boolean(value);
  if (type === "number" || type === "currency") {
    const text = String(value).trim();
    if (!text) return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) throw new Error("Valor numérico inválido.");
    return parsed;
  }
  return String(value);
}

function optionList(options: Props["options"]): Option[] {
  return (options ?? []).map((option) => {
    if (typeof option === "string") return { value: option, label: option };
    return option;
  });
}

function StatusLabel({ status, error }: { status: SaveStatus; error: string }) {
  if (status === "saving") return <span className="text-[#D7FF4F]">Guardando...</span>;
  if (status === "saved") return <span className="text-[#D7FF4F]/80">Guardado</span>;
  if (status === "error") return <span className="text-[#FFB07A]">{error || "Error"}</span>;
  return null;
}

export function InlineEditableField({ label, value, type, options, readOnly, displayValue, className, labelClassName, valueClassName, hideLabel, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stringifyValue(value));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const choices = useMemo(() => optionList(options), [options]);
  const editable = !readOnly && type !== "readOnly" && Boolean(onSave);
  const currentValue = stringifyValue(value);
  const textCursor = type === "text" || type === "number" || type === "currency" || type === "textarea";
  const valueTextClass = valueClassName ?? `min-h-6 break-words text-sm font-medium ${editable ? "text-[#F5F5F5]" : "text-[#A7A7A7]"}`;
  const editTextClass = `${valueTextClass} w-full border-0 bg-transparent p-0 outline-none ring-0 placeholder:text-[#A7A7A7]/70 focus:outline-none focus:ring-0`;

  useEffect(() => {
    if (!editing) setDraft(stringifyValue(value));
  }, [editing, value]);

  useEffect(() => {
    if (status !== "saved") return;
    const timeout = window.setTimeout(() => setStatus("idle"), 1600);
    return () => window.clearTimeout(timeout);
  }, [status]);

  async function commit(nextRaw: string | boolean = draft) {
    if (!editable || !onSave) return;

    setStatus("saving");
    setError("");
    try {
      const next = normalizeForSave(type, nextRaw);
      const comparableNext = type === "checkbox" ? String(Boolean(next)) : String(next ?? "");
      const comparableCurrent = type === "checkbox" ? String(Boolean(value)) : currentValue;
      if (comparableNext === comparableCurrent) {
        setEditing(false);
        setDraft(currentValue);
        setStatus("idle");
        return;
      }
      await onSave(next);
      setStatus("saved");
      setEditing(false);
    } catch (saveError) {
      setDraft(currentValue);
      setStatus("error");
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
      setEditing(false);
    }
  }

  function cancel() {
    setDraft(currentValue);
    setEditing(false);
    setStatus("idle");
    setError("");
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  const shellClass = `group rounded-[1rem] border px-3 py-2 transition ${
    status === "error"
      ? "border-[#FF914D]/55 bg-[#1E1F1C]"
      : editing
        ? "border-[#D7FF4F]/55 bg-[#1E1F1C]"
        : editable
          ? `${textCursor ? "cursor-text" : "cursor-pointer"} border-[#3A3A36] bg-[#1E1F1C] hover:border-[#D7FF4F]/35`
          : "border-[#3A3A36]/75 bg-[#1B1C19] opacity-80"
  }`;
  const rootClass = className
    ? `relative ${className} ${editing ? "ring-1 ring-[#D7FF4F]/55" : editable ? `${textCursor ? "cursor-text" : "cursor-pointer"} hover:ring-1 hover:ring-[#D7FF4F]/35` : "opacity-80"} ${status === "error" ? "ring-1 ring-[#FF914D]/65" : ""}`
    : shellClass;

  return (
    <div className={rootClass} onClick={() => { if (editable && !editing && type !== "checkbox") setEditing(true); }}>
      {hideLabel ? (
        <div className="pointer-events-none absolute right-2 top-1 z-10 text-[10px] font-semibold uppercase tracking-normal">
          <StatusLabel status={status} error={error} />
        </div>
      ) : (
        <div className="mb-1 flex items-center justify-between gap-2">
          <dt className={labelClassName ?? "text-[11px] font-medium uppercase tracking-normal text-[#A7A7A7]"}>{label}</dt>
          <dd className="text-[10px] font-semibold uppercase tracking-normal">
            <StatusLabel status={status} error={error} />
          </dd>
        </div>
      )}

      {editing && (type === "text" || type === "number" || type === "currency") ? (
        <input
          autoFocus
          type="text"
          inputMode={type === "text" ? undefined : "decimal"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={handleTextKeyDown}
          className={editTextClass}
        />
      ) : null}

      {editing && type === "textarea" ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={handleTextareaKeyDown}
          className={`${editTextClass} ${valueClassName ? "" : "min-h-24"} resize-y leading-6`}
        />
      ) : null}

      {editing && (type === "singleSelect" || type === "linkedRecord") ? (
        <select
          autoFocus
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            void commit(event.target.value);
          }}
          onBlur={() => setEditing(false)}
          className={`${valueTextClass} w-full border-0 bg-transparent p-0 outline-none ring-0 focus:outline-none focus:ring-0`}
        >
          <option value="">—</option>
          {choices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : null}

      {type === "checkbox" ? (
        <button
          type="button"
          disabled={!editable || status === "saving"}
          onClick={(event) => {
            event.stopPropagation();
            void commit(!Boolean(value));
          }}
          className={`mt-1 inline-flex rounded-full border px-3 py-1 text-xs font-medium transition ${value ? "border-[#D7FF4F]/60 bg-[#D7FF4F]/15 text-[#D7FF4F]" : "border-[#3A3A36] bg-[#151515] text-[#A7A7A7]"} disabled:cursor-not-allowed`}
        >
          {value ? "Sí" : "No"}
        </button>
      ) : null}

      {!editing && type !== "checkbox" ? (
        <dd className={valueTextClass}>
          {displayValue ?? (currentValue || "—")}
        </dd>
      ) : null}
    </div>
  );
}
