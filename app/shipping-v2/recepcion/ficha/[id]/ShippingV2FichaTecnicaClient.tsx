"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { buildFichaVentaData, type FichaVentaData } from "@/lib/shipping-v2/ficha-venta-data";
import { SHIPPING_V2_ITEM_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";
import { calculateShippingV2BatteryState, inferShippingV2TechnicalSheetFromItem, shippingV2CategoryDoesNotUseScreenOrBattery } from "@/lib/shipping-v2/technical-sheet";
import type { ShippingV2Item, ShippingV2TechnicalOption, ShippingV2TechnicalSheetInput } from "@/types/shipping-v2";
import { FichaVentaPrintTemplate } from "./print/FichaVentaPrintTemplate";

type Props = {
  item: ShippingV2Item;
  technicalOptions: {
    connectivity: ShippingV2TechnicalOption[];
    ports: ShippingV2TechnicalOption[];
    extraFeatures: ShippingV2TechnicalOption[];
  };
};

type FieldKey = keyof ShippingV2TechnicalSheetInput;
type CpuCatalogResult = {
  id: string;
  cpuModel: string;
  cpuBrand?: string;
  baseFrequency?: string;
  turboFrequency?: string;
  suggestedRamType?: string;
  integratedGpu?: string;
  verified: boolean | null;
  sourceName?: string;
};
type CpuAutofillKey = "cpuMarca" | "cpuFrecuenciaBase" | "cpuFrecuenciaTurbo" | "ramTipo" | "gpuIntegrada";
type ComputerCatalogResult = {
  id: string;
  computerModel: string;
  brand?: string;
  suggestedScreenSize?: string;
  suggestedScreenResolution?: string;
  suggestedOperatingSystem?: string;
  suggestedConnectivityV2Ids: string[];
  suggestedPortV2Ids: string[];
  suggestedExtraFeatureV2Ids: string[];
  batteryApplies?: string;
  suggestedGpu?: string;
  verified: boolean | null;
  sourceName?: string;
};
type ComputerAutofillKey = "sistemaOperativo" | "pantallaTamano" | "pantallaResolucion" | "gpu" | "bateriaEstado";
type TechnicalOptionType = "connectivity" | "port" | "extraFeature";
type FieldSource = "name" | "computerCatalog" | "cpuCatalog" | "manual";
type FieldSources = Partial<Record<FieldKey, FieldSource>>;

const inputClass = "mt-1 h-10 w-full rounded-lg border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70";
const sectionClass = "rounded-xl border border-[#30312D] bg-[#11120F] p-4";

const technicalTypeOptions: Array<{ value: TechnicalOptionType; label: string }> = [
  { value: "connectivity", label: "Conectividad" },
  { value: "port", label: "Puerto" },
  { value: "extraFeature", label: "Característica extra" },
];

const sourceLabels: Record<FieldSource, string> = {
  name: "Completado desde nombre",
  computerCatalog: "Sugerido desde Catálogo Computadores",
  cpuCatalog: "Sugerido desde Catálogo CPUs",
  manual: "Editado manualmente",
};

function cpuAutofillLabel(key: CpuAutofillKey) {
  if (key === "cpuMarca") return "CPU marca";
  if (key === "cpuFrecuenciaBase") return "frecuencia base";
  if (key === "cpuFrecuenciaTurbo") return "frecuencia turbo";
  if (key === "ramTipo") return "RAM tipo";
  return "GPU integrada";
}

function sourceText(source?: FieldSource) {
  return source ? sourceLabels[source] : "";
}

function mergeSources(current: FieldSources, keys: FieldKey[], source: FieldSource) {
  const next = { ...current };
  for (const key of keys) next[key] = source;
  return next;
}

function FieldHint({ source }: { source?: FieldSource }) {
  if (!source) return null;
  const isManual = source === "manual";
  return <p className={`mt-1 text-[11px] font-semibold ${isManual ? "text-[#BDEAFF]" : "text-[#D7FF4F]"}`}>{sourceText(source)}</p>;
}

function normalizeOptionText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTechnicalLabel(value: string, type?: TechnicalOptionType) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    bluetooh: "Bluetooth",
    wifi: "Wi-Fi",
    "wi fi": "Wi-Fi",
    lan: "Ethernet",
    rj45: "Ethernet",
    "usb c": "USB-C",
    "usb type c": "USB-C",
    usbc: "USB-C",
    "usb c port": "USB-C",
    "usb-c port": "USB-C",
    audio: "Audio Jack",
    jack: "Audio Jack",
  };
  const normalized = normalizeOptionText(trimmed);
  if (normalized === "rj45" && type !== "connectivity") return trimmed;
  return aliases[normalized] || trimmed;
}

function optionName(options: ShippingV2TechnicalOption[], id: string) {
  return options.find((option) => option.id === id)?.name || id;
}

function sanitizeSuggestedOptionIds(values: string[] | undefined, validOptions: ShippingV2TechnicalOption[]) {
  const validIds = new Set(validOptions.map((option) => option.id));
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const value of values || []) {
    if (validIds.has(value) && !accepted.includes(value)) accepted.push(value);
    if (!validIds.has(value) && !rejected.includes(value)) rejected.push(value);
  }
  return { accepted, rejected };
}

function normalizeForm(item: ShippingV2Item): ShippingV2TechnicalSheetInput {
  return {
    marcaFicha: item.technicalSheet.marcaFicha || item.marca || "",
    modeloFicha: item.technicalSheet.modeloFicha || item.modelo || "",
    sistemaOperativo: item.technicalSheet.sistemaOperativo || "",
    pantallaTamano: item.technicalSheet.pantallaTamano || "",
    pantallaResolucion: item.technicalSheet.pantallaResolucion || "",
    cpuMarca: item.technicalSheet.cpuMarca || "",
    cpuModelo: item.technicalSheet.cpuModelo || "",
    cpuFrecuenciaBase: item.technicalSheet.cpuFrecuenciaBase || "",
    cpuFrecuenciaTurbo: item.technicalSheet.cpuFrecuenciaTurbo || "",
    ramCapacidad: item.technicalSheet.ramCapacidad || "",
    ramTipo: item.technicalSheet.ramTipo || "",
    almacenamientoPrincipal: item.technicalSheet.almacenamientoPrincipal || "",
    almacenamientoTipo: item.technicalSheet.almacenamientoTipo || "",
    gpu: item.technicalSheet.gpu || "",
    gpuIntegrada: item.technicalSheet.gpuIntegrada || "",
    bateriaSalud: item.technicalSheet.bateriaSalud,
    bateriaEstado: item.technicalSheet.bateriaEstado || "",
    connectivityV2Ids: item.technicalSheet.connectivityV2Ids || [],
    portV2Ids: item.technicalSheet.portV2Ids || [],
    extraFeatureV2Ids: item.technicalSheet.extraFeatureV2Ids || [],
    observacionFichaTecnica: item.technicalSheet.observacionFichaTecnica || "",
  };
}

function display(value?: string | number | string[] | null) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  const text = String(value ?? "").trim();
  return text || "-";
}

function normalizeCpu(value?: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(intel|amd|apple|qualcomm)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComputer(value?: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isEmptyOrUnspecified(value?: string | number | null) {
  const text = String(value ?? "").trim().toLowerCase();
  return !text || text === "no especificado";
}

function hasValues(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : !isEmptyOrUnspecified(value as string | number | null | undefined);
}

function SelectField({ label, value, options, onChange, disabled, source }: { label: string; value?: string; options: readonly string[]; onChange: (value: string) => void; disabled?: boolean; source?: FieldSource }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</span>
      <select value={value || ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-65`}>
        <option value="">Sin definir</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <FieldHint source={source} />
    </label>
  );
}

function SelectFieldWithLabels({ label, value, options, onChange }: { label: string; value?: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, type = "text", disabled, source }: { label: string; value?: string | number | null; onChange: (value: string) => void; type?: string; disabled?: boolean; source?: FieldSource }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</span>
      <input type={type} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-65`} />
      <FieldHint source={source} />
    </label>
  );
}

function MultiSelectField({ label, value, options, onChange, source }: { label: string; value?: string[]; options: ShippingV2TechnicalOption[]; onChange: (value: string[]) => void; source?: FieldSource }) {
  const selected = value || [];
  const available = options.filter((option) => !selected.includes(option.id));
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</span>
      <div className="mt-1 rounded-lg border border-[#3A3A36] bg-[#101010] px-2 py-2">
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="inline-flex h-6 items-center gap-1 rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-2 text-[11px] font-semibold text-[#E9FF9A]">
              {optionName(options, id)}
              <button type="button" onClick={() => onChange(selected.filter((current) => current !== id))} className="grid h-4 w-4 place-items-center rounded-full text-[10px] text-[#F5F5F5] hover:bg-[#F5F5F5]/10" aria-label={`Quitar ${optionName(options, id)}`}>x</button>
            </span>
          ))}
          {!selected.length ? <span className="py-1 text-xs text-[#6E6F68]">Sin seleccionar</span> : null}
        </div>
        <select value="" onChange={(event) => {
          const next = event.target.value;
          if (next) onChange([...selected, next]);
        }} className="mt-2 h-8 w-full rounded-md border border-[#2A2A28] bg-[#151515] px-2 text-xs font-semibold text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70">
          <option value="">Agregar opción</option>
          {available.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </div>
      <FieldHint source={source} />
    </label>
  );
}

function SectionCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className={sectionClass}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-normal text-[#F5F5F5]">{title}</h3>
        {action}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function FichaVentaLivePreview({ ficha }: { ficha: FichaVentaData }) {
  return (
    <aside className="self-start rounded-xl border border-[#30312D] bg-[#11120F] p-4 2xl:sticky 2xl:top-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#F5F5F5]">Vista previa</h3>
        </div>
        <span className="rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-2 py-1 text-[11px] font-bold text-[#D7FF4F]">Ficha</span>
      </div>
      <div className="overflow-auto rounded-xl border border-[#3A3A36] bg-[#f2f2f2] p-3">
        <div className="mx-auto" style={{ width: "287px", height: "412px" }}>
          <div style={{ width: "140.5mm", height: "202mm", transform: "scale(0.54)", transformOrigin: "top left" }}>
            <FichaVentaPrintTemplate ficha={ficha} />
          </div>
        </div>
      </div>
    </aside>
  );
}

export function ShippingV2FichaTecnicaClient({ item: initialItem, technicalOptions }: Props) {
  const [item, setItem] = useState(initialItem);
  const [form, setForm] = useState<ShippingV2TechnicalSheetInput>(() => normalizeForm(initialItem));
  const [fieldSources, setFieldSources] = useState<FieldSources>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [cpuCatalogStatus, setCpuCatalogStatus] = useState("");
  const [cpuMatches, setCpuMatches] = useState<CpuCatalogResult[]>([]);
  const [computerCatalogStatus, setComputerCatalogStatus] = useState("");
  const [computerMatches, setComputerMatches] = useState<ComputerCatalogResult[]>([]);
  const [technicalOptionWarning, setTechnicalOptionWarning] = useState("");
  const [technicalOptionModal, setTechnicalOptionModal] = useState<{ open: boolean; type: TechnicalOptionType; label: string; message: string; busy: boolean }>({ open: false, type: "connectivity", label: "", message: "", busy: false });
  const [connectivityOptions, setConnectivityOptions] = useState(() => technicalOptions.connectivity);
  const [portOptions, setPortOptions] = useState(() => technicalOptions.ports);
  const [extraOptions, setExtraOptions] = useState(() => technicalOptions.extraFeatures);
  const isDesktopLike = shippingV2CategoryDoesNotUseScreenOrBattery(item.categoria);
  const calculatedBatteryState = useMemo(() => calculateShippingV2BatteryState(item.categoria, typeof form.bateriaSalud === "number" ? form.bateriaSalud : Number(form.bateriaSalud)), [form.bateriaSalud, item.categoria]);
  const technicalOptionPreview = normalizeTechnicalLabel(technicalOptionModal.label, technicalOptionModal.type);
  const previewFicha = useMemo(() => buildFichaVentaData(item, {
    connectivity: connectivityOptions,
    ports: portOptions,
    extraFeatures: extraOptions,
  }, {
    sheet: {
      ...form,
      pantallaTamano: isDesktopLike ? "No aplica" : form.pantallaTamano,
      pantallaResolucion: isDesktopLike ? "No aplica" : form.pantallaResolucion,
      bateriaEstado: isDesktopLike ? "No aplica" : (calculatedBatteryState || form.bateriaEstado || ""),
    },
  }), [calculatedBatteryState, connectivityOptions, extraOptions, form, isDesktopLike, item, portOptions]);

  function updateField(key: FieldKey, value: string | string[], source: FieldSource = "manual") {
    setForm((current) => ({
      ...current,
      [key]: key === "bateriaSalud" ? value : value,
      ...(key === "bateriaSalud" && typeof value === "string" ? { bateriaEstado: calculateShippingV2BatteryState(item.categoria, value ? Number(value) : null) } : {}),
    }));
    setFieldSources((current) => mergeSources(current, [key, ...(key === "bateriaSalud" ? ["bateriaEstado" as FieldKey] : [])], source));
  }

  function applyValue(next: ShippingV2TechnicalSheetInput, sources: FieldSources, key: ComputerAutofillKey | "cpuModelo", value: string | undefined, source: FieldSource) {
    if (!value) return false;
    const current = next[key];
    if (!hasValues(current)) {
      next[key] = value;
      sources[key] = source;
      return true;
    } else if (String(current) !== value && window.confirm(`"${String(current)}" ya tiene valor. ¿Deseas reemplazarlo con "${value}" del catálogo?`)) {
      next[key] = value;
      sources[key] = source;
      return true;
    }
    return false;
  }

  function applyMultiValue(next: ShippingV2TechnicalSheetInput, sources: FieldSources, key: "connectivityV2Ids" | "portV2Ids" | "extraFeatureV2Ids", value?: string[]) {
    if (!value?.length) return false;
    const validOptions = key === "connectivityV2Ids" ? connectivityOptions : key === "portV2Ids" ? portOptions : extraOptions;
    const fieldLabel = key === "connectivityV2Ids" ? "Conectividad" : key === "portV2Ids" ? "Puertos" : "Características extras";
    const { accepted, rejected } = sanitizeSuggestedOptionIds(value, validOptions);
    if (rejected.length) {
      setTechnicalOptionWarning(`El catálogo sugirió opciones V2 que no están en la lista activa: ${rejected.join(", ")}.`);
    }
    if (!accepted.length) return false;
    const current = next[key] || [];
    if (!current.length) {
      next[key] = accepted;
      sources[key] = "computerCatalog";
      return true;
    } else if (accepted.some((id) => !current.includes(id)) && window.confirm(`${fieldLabel} ya tiene valores. ¿Deseas agregar las sugerencias del catálogo sin duplicar?`)) {
      next[key] = [...new Set([...current, ...accepted])];
      sources[key] = "computerCatalog";
      return true;
    }
    return false;
  }

  function applyComputerCatalogEntry(entry: ComputerCatalogResult, sourceForm: ShippingV2TechnicalSheetInput = form) {
    const next: ShippingV2TechnicalSheetInput = { ...sourceForm, marcaFicha: entry.brand || sourceForm.marcaFicha, modeloFicha: entry.computerModel || sourceForm.modeloFicha };
    const sources: FieldSources = {};
    const applied: string[] = [];
    if (entry.brand && !sourceForm.marcaFicha) sources.marcaFicha = "computerCatalog";
    if (entry.computerModel && !sourceForm.modeloFicha) sources.modeloFicha = "computerCatalog";
    if (applyValue(next, sources, "sistemaOperativo", entry.suggestedOperatingSystem, "computerCatalog")) applied.push("sistema operativo");
    if (applyValue(next, sources, "pantallaTamano", entry.suggestedScreenSize, "computerCatalog")) applied.push("pantalla");
    if (applyValue(next, sources, "pantallaResolucion", entry.suggestedScreenResolution, "computerCatalog")) applied.push("resolución");
    if (applyValue(next, sources, "gpu", entry.suggestedGpu, "computerCatalog")) applied.push("GPU");
    if (entry.batteryApplies === "No" && applyValue(next, sources, "bateriaEstado", "No aplica", "computerCatalog")) applied.push("batería");
    if (applyMultiValue(next, sources, "connectivityV2Ids", entry.suggestedConnectivityV2Ids)) applied.push("conectividad");
    if (applyMultiValue(next, sources, "portV2Ids", entry.suggestedPortV2Ids)) applied.push("puertos");
    if (applyMultiValue(next, sources, "extraFeatureV2Ids", entry.suggestedExtraFeatureV2Ids)) applied.push("extras");

    setForm(next);
    setFieldSources((current) => ({ ...current, ...sources }));
    setComputerMatches([]);
    setComputerCatalogStatus(applied.length ? `Catálogo Computadores: ${applied.join(", ")}` : "Modelo encontrado sin cambios nuevos");
    return next;
  }

  async function searchComputerCatalog(brand = String(form.marcaFicha || ""), model = String(form.modeloFicha || ""), options: { autoApply?: boolean; sourceForm?: ShippingV2TechnicalSheetInput } = {}) {
    const cleanBrand = brand.trim();
    const cleanModel = model.trim();
    if (!cleanBrand && !cleanModel) {
      setComputerCatalogStatus("Ingresa marca o modelo para buscar en catálogo.");
      setComputerMatches([]);
      return null;
    }

    setBusy("computer-catalog");
    setComputerCatalogStatus("");
    try {
      const response = await fetch(`/api/shipping-v2/recepcion/ficha/computer-catalog?brand=${encodeURIComponent(cleanBrand)}&model=${encodeURIComponent(cleanModel)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo buscar en Catálogo Computadores."));
      const results = (payload.data || []) as ComputerCatalogResult[];
      const exact = results.find((entry) => normalizeComputer([entry.brand, entry.computerModel].filter(Boolean).join(" ")) === normalizeComputer([cleanBrand, cleanModel].filter(Boolean).join(" ")) || normalizeComputer(entry.computerModel) === normalizeComputer(cleanModel));
      if (exact && options.autoApply) {
        setComputerCatalogStatus("Modelo encontrado en catálogo");
        return applyComputerCatalogEntry(exact, options.sourceForm);
      }
      if (exact) {
        setComputerCatalogStatus("Modelo encontrado en catálogo");
        setComputerMatches(results.length > 1 ? results : []);
        if (results.length === 1) return applyComputerCatalogEntry(exact);
      } else if (results.length) {
        setComputerMatches(results);
        setComputerCatalogStatus("Coincidencias encontradas: elegir modelo");
      } else {
        setComputerMatches([]);
        setComputerCatalogStatus("Modelo no encontrado, se podrá guardar como nuevo");
      }
      return null;
    } catch (error) {
      setComputerMatches([]);
      setComputerCatalogStatus(error instanceof Error ? error.message : "Error inesperado al buscar modelo.");
      return null;
    } finally {
      setBusy("");
    }
  }

  function applyCpuCatalogEntry(entry: CpuCatalogResult, sourceForm: ShippingV2TechnicalSheetInput = form) {
    const next: ShippingV2TechnicalSheetInput = { ...sourceForm };
    const sources: FieldSources = {};
    const applied: string[] = [];
    if (applyValue(next, sources, "cpuModelo", entry.cpuModel, "cpuCatalog")) applied.push("CPU modelo");
    const replacements: Array<[CpuAutofillKey, string | undefined]> = [
      ["cpuMarca", entry.cpuBrand],
      ["cpuFrecuenciaBase", entry.baseFrequency],
      ["cpuFrecuenciaTurbo", entry.turboFrequency],
      ["ramTipo", entry.suggestedRamType],
      ["gpuIntegrada", entry.integratedGpu],
    ];

    for (const [key, value] of replacements) {
      if (!value) continue;
      const current = next[key];
      if (key === "ramTipo" || key === "gpuIntegrada") {
        if (isEmptyOrUnspecified(current as string | undefined)) {
          next[key] = value;
          sources[key] = "cpuCatalog";
          applied.push(cpuAutofillLabel(key));
        }
        continue;
      }
      if (isEmptyOrUnspecified(current as string | undefined)) {
        next[key] = value;
        sources[key] = "cpuCatalog";
        applied.push(cpuAutofillLabel(key));
      } else if (String(current) !== value && window.confirm(`"${String(current)}" ya tiene valor. ¿Deseas reemplazarlo con "${value}" del catálogo?`)) {
        next[key] = value;
        sources[key] = "cpuCatalog";
        applied.push(cpuAutofillLabel(key));
      }
    }

    setForm(next);
    setFieldSources((current) => ({ ...current, ...sources }));
    setCpuMatches([]);
    setCpuCatalogStatus(applied.length ? `Catálogo CPUs: ${applied.join(", ")}` : "CPU encontrado sin cambios nuevos");
    return next;
  }

  async function searchCpuCatalog(cpuModel = String(form.cpuModelo || ""), options: { autoApply?: boolean; sourceForm?: ShippingV2TechnicalSheetInput } = {}) {
    const query = cpuModel.trim();
    if (!query) {
      setCpuCatalogStatus("Ingresa un CPU modelo para buscar en catálogo.");
      setCpuMatches([]);
      return null;
    }

    setBusy("cpu-catalog");
    setCpuCatalogStatus("");
    try {
      const response = await fetch(`/api/shipping-v2/recepcion/ficha/cpu-catalog?query=${encodeURIComponent(query)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo buscar en Catálogo CPUs."));
      const results = (payload.data || []) as CpuCatalogResult[];
      const exact = results.find((entry) => normalizeCpu(entry.cpuModel) === normalizeCpu(query));
      if (exact && options.autoApply) {
        setCpuCatalogStatus("CPU encontrado en catálogo");
        return applyCpuCatalogEntry(exact, options.sourceForm);
      } else if (exact) {
        setCpuMatches(results.length > 1 ? results : []);
        setCpuCatalogStatus("CPU encontrado en catálogo");
        if (results.length === 1) return applyCpuCatalogEntry(exact);
      } else if (results.length) {
        setCpuMatches(results);
        setCpuCatalogStatus("Coincidencias encontradas: elegir CPU");
      } else {
        setCpuMatches([]);
        setCpuCatalogStatus("CPU no encontrado, se podrá guardar como nuevo");
      }
      return null;
    } catch (error) {
      setCpuMatches([]);
      setCpuCatalogStatus(error instanceof Error ? error.message : "Error inesperado al buscar CPU.");
      return null;
    } finally {
      setBusy("");
    }
  }

  function applyInferredValue(next: ShippingV2TechnicalSheetInput, sources: FieldSources, key: FieldKey, value: unknown) {
    if (value === "" || value === undefined || value === null) return false;
    const current = next[key];
    if (!hasValues(current)) {
      next[key] = value as never;
      sources[key] = "name";
      return true;
    }
    if (String(current) !== String(value) && window.confirm(`"${String(current)}" ya tiene valor. ¿Deseas reemplazarlo con "${String(value)}" detectado desde el nombre?`)) {
      next[key] = value as never;
      sources[key] = "name";
      return true;
    }
    return false;
  }

  async function completeFromCatalogs() {
    const inferred = inferShippingV2TechnicalSheetFromItem(item);
    let nextForm: ShippingV2TechnicalSheetInput = { ...form };
    const inferredSources: FieldSources = {};
    const completed: string[] = [];
    for (const [key, value] of Object.entries(inferred) as Array<[FieldKey, unknown]>) {
      if (applyInferredValue(nextForm, inferredSources, key, value)) completed.push("nombre");
    }
    setForm(nextForm);
    setFieldSources((current) => ({ ...current, ...inferredSources }));
    setMessage("");
    setBusy("complete-catalogs");
    if (nextForm.marcaFicha || nextForm.modeloFicha) {
      const computerApplied = await searchComputerCatalog(String(nextForm.marcaFicha || ""), String(nextForm.modeloFicha || ""), { autoApply: true, sourceForm: nextForm });
      if (computerApplied) {
        nextForm = computerApplied;
        completed.push("modelo");
      }
    } else {
      setComputerCatalogStatus("No hay marca/modelo suficiente para buscar en Catálogo Computadores.");
    }
    const cpuQuery = String(nextForm.cpuModelo || inferred.cpuModelo || "").trim();
    if (cpuQuery) {
      const cpuApplied = await searchCpuCatalog(cpuQuery, { autoApply: true, sourceForm: nextForm });
      if (cpuApplied) completed.push("CPU");
    } else {
      setCpuCatalogStatus("No hay CPU modelo suficiente para buscar en Catálogo CPUs.");
    }
    setBusy("");
    const unique = [...new Set(completed)];
    setMessage(unique.length ? `Datos completados desde catálogos: ${unique.join(", ")}.` : "No se encontraron coincidencias exactas en catálogos. Puedes completar los datos manualmente.");
  }

  function optionsForTechnicalType(type: TechnicalOptionType) {
    if (type === "connectivity") return connectivityOptions;
    if (type === "port") return portOptions;
    return extraOptions;
  }

  function addLocalTechnicalOption(type: TechnicalOptionType, option: Pick<ShippingV2TechnicalOption, "id" | "name">) {
    const nextOption: ShippingV2TechnicalOption = {
      id: option.id,
      name: option.name,
      aliases: [],
      active: true,
      order: null,
      createdFromPortal: true,
    };
    if (type === "connectivity") {
      setConnectivityOptions((current) => current.some((item) => item.id === option.id) ? current : [...current, nextOption]);
      updateField("connectivityV2Ids", [...(form.connectivityV2Ids || []).filter((id) => id !== option.id), option.id]);
    } else if (type === "port") {
      setPortOptions((current) => current.some((item) => item.id === option.id) ? current : [...current, nextOption]);
      updateField("portV2Ids", [...(form.portV2Ids || []).filter((id) => id !== option.id), option.id]);
    } else {
      setExtraOptions((current) => current.some((item) => item.id === option.id) ? current : [...current, nextOption]);
      updateField("extraFeatureV2Ids", [...(form.extraFeatureV2Ids || []).filter((id) => id !== option.id), option.id]);
    }
  }

  async function createTechnicalOption() {
    const option = technicalOptionPreview;
    const currentOptions = optionsForTechnicalType(technicalOptionModal.type);
    if (!option) {
      setTechnicalOptionModal((current) => ({ ...current, message: "Nombre de opción obligatorio." }));
      return;
    }

    const exact = currentOptions.find((item) => item.name === option);
    const normalizedDuplicate = currentOptions.find((item) => normalizeOptionText(item.name) === normalizeOptionText(option));
    if (exact || normalizedDuplicate) {
      const existing = normalizedDuplicate || exact;
      if (existing) addLocalTechnicalOption(technicalOptionModal.type, existing);
      setTechnicalOptionModal((current) => ({ ...current, open: false, message: "" }));
      setMessage(`La opción "${existing?.name || option}" ya existía y fue seleccionada.`);
      return;
    }

    const similar = currentOptions.find((item) => normalizeOptionText(item.name).includes(normalizeOptionText(option)) || normalizeOptionText(option).includes(normalizeOptionText(item.name)));
    if (similar && !window.confirm(`"${option}" se parece a "${similar.name}". ¿Crear de todos modos?`)) return;

    setTechnicalOptionModal((current) => ({ ...current, busy: true, message: "" }));
    try {
      const response = await fetch("/api/shipping-v2/recepcion/ficha/technical-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: technicalOptionModal.type, label: option }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(String(payload.error || "No se pudo crear la opción técnica."));
      const createdOption = payload.option as { id?: string; name?: string } | undefined;
      if (!createdOption?.id || !createdOption.name) throw new Error("Airtable no devolvió la opción técnica creada.");
      const optionToSelect = { id: createdOption.id, name: createdOption.name };
      addLocalTechnicalOption(technicalOptionModal.type, optionToSelect);
      setTechnicalOptionWarning("");
      setTechnicalOptionModal({ open: false, type: technicalOptionModal.type, label: "", message: "", busy: false });
      setMessage(payload.alreadyExists ? `La opción "${optionToSelect.name}" ya existía y fue seleccionada.` : `Opción técnica "${optionToSelect.name}" creada y seleccionada.`);
    } catch (error) {
      setTechnicalOptionModal((current) => ({ ...current, busy: false, message: error instanceof Error ? error.message : "Error inesperado." }));
    }
  }

  async function save(options: { reviewed?: boolean } = {}) {
    const invalidTechnicalOptions = [
      ...(form.connectivityV2Ids || []).filter((value) => !connectivityOptions.some((option) => option.id === value)),
      ...(form.portV2Ids || []).filter((value) => !portOptions.some((option) => option.id === value)),
      ...(form.extraFeatureV2Ids || []).filter((value) => !extraOptions.some((option) => option.id === value)),
    ];
    if (invalidTechnicalOptions.length) {
      setMessage(`No se guardaron algunas opciones V2 porque no existen en los catálogos maestros: ${Array.from(new Set(invalidTechnicalOptions)).join(", ")}.`);
      return;
    }

    setBusy(options.reviewed ? "review" : "save");
    setMessage("");
    try {
      const response = await fetch(`/api/shipping-v2/recepcion/ficha/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, reviewed: options.reviewed === true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo guardar la ficha técnica."));
      const updated = payload.data as ShippingV2Item;
      setItem(updated);
      setForm(normalizeForm(updated));
      setMessage(options.reviewed ? "Ficha guardada y marcada como revisada." : "Ficha técnica guardada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-3">
      {message ? <div className="rounded-xl border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-2 text-sm text-[#E9FF9A]">{message}</div> : null}
      {technicalOptionWarning ? <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{technicalOptionWarning}</div> : null}

      <section className="rounded-xl border border-[#30312D] bg-[#151613] px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold text-[#D7FF4F]">{display(item.sku)}</p>
              <span className="rounded-full border border-[#3A3A36] px-2 py-0.5 text-[11px] font-semibold text-[#A7A7A7]">{display(item.categoria)}</span>
            </div>
            <h2 className="mt-1 text-lg font-semibold leading-6 text-[#F5F5F5]">{display(item.nombre)}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#A7A7A7]">
              <span>Precio: <b className="text-[#F5F5F5]">{display(item.precioVenta || item.precioVentaSugerido)}</b></span>
              <span>Generada: <b className="text-[#F5F5F5]">{item.technicalSheet.fichaTecnicaGenerada ? "Sí" : "No"}</b></span>
              <span>Revisada: <b className="text-[#F5F5F5]">{item.technicalSheet.fichaTecnicaRevisada ? "Sí" : "No"}</b></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => void completeFromCatalogs()} className="h-9 rounded-lg border border-[#D7FF4F]/55 bg-[#D7FF4F] px-3 text-xs font-bold text-[#151515] disabled:opacity-60">{busy === "complete-catalogs" ? "Completando..." : "Completar desde catálogos"}</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void save()} className="h-9 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-xs font-bold text-[#F5F5F5] disabled:opacity-60">{busy === "save" ? "Guardando..." : "Guardar ficha"}</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void save({ reviewed: true })} className="h-9 rounded-lg border border-[#4FC3FF]/45 bg-[#4FC3FF]/10 px-3 text-xs font-bold text-[#BDEAFF] disabled:opacity-60">{busy === "review" ? "Marcando..." : "Marcar ficha revisada"}</button>
            <Link href={`/shipping-v2/recepcion/ficha/${encodeURIComponent(item.id)}/print`} className="flex h-9 items-center rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-xs font-bold text-[#F5F5F5]">Vista previa</Link>
            <Link href={`/shipping-v2/recepcion/ficha/${encodeURIComponent(item.id)}/print?print=1`} target="_blank" className="flex h-9 items-center rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-xs font-bold text-[#F5F5F5]">Imprimir ficha</Link>
          </div>
        </div>
      </section>

      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-3 xl:grid-cols-2">
          <SectionCard title="Identificación del equipo" action={
            <button type="button" disabled={busy === "computer-catalog"} onClick={() => void searchComputerCatalog()} className="h-7 rounded-lg border border-[#4FC3FF]/45 bg-[#4FC3FF]/10 px-2 text-[11px] font-bold text-[#BDEAFF] disabled:opacity-60">
              {busy === "computer-catalog" ? "Buscando..." : "Buscar modelo"}
            </button>
          }>
            <TextField label="Marca ficha" value={form.marcaFicha} source={fieldSources.marcaFicha} onChange={(value) => updateField("marcaFicha", value)} />
            <TextField label="Modelo ficha" value={form.modeloFicha} source={fieldSources.modeloFicha} onChange={(value) => updateField("modeloFicha", value)} />
            <SelectField label="Sistema operativo" value={form.sistemaOperativo} source={fieldSources.sistemaOperativo} options={SHIPPING_V2_ITEM_SELECT_OPTIONS.sistemaOperativo} onChange={(value) => updateField("sistemaOperativo", value)} />
            <div className="rounded-lg border border-[#30312D] bg-[#151613] p-3">
              <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Catálogo Computadores</span>
              {computerCatalogStatus ? <p className="mt-2 text-xs font-semibold text-[#D7FF4F]">{computerCatalogStatus}</p> : <p className="mt-2 text-xs text-[#6E6F68]">Usa el botón principal o búsqueda manual.</p>}
              {computerMatches.length ? (
                <select value="" onChange={(event) => {
                  const selected = computerMatches.find((entry) => entry.id === event.target.value);
                  if (selected) applyComputerCatalogEntry(selected);
                }} className="mt-2 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#101010] px-3 text-xs font-semibold text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70">
                  <option value="">Elegir modelo del catálogo</option>
                  {computerMatches.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {[entry.brand, entry.computerModel].filter(Boolean).join(" ")}{entry.verified ? " · verificado" : ""}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Procesador y memoria" action={
            <button type="button" disabled={busy === "cpu-catalog"} onClick={() => void searchCpuCatalog()} className="h-7 rounded-lg border border-[#4FC3FF]/45 bg-[#4FC3FF]/10 px-2 text-[11px] font-bold text-[#BDEAFF] disabled:opacity-60">
              {busy === "cpu-catalog" ? "Buscando..." : "Buscar CPU"}
            </button>
          }>
            <SelectField label="CPU marca" value={form.cpuMarca} source={fieldSources.cpuMarca} options={SHIPPING_V2_ITEM_SELECT_OPTIONS.cpuMarca} onChange={(value) => updateField("cpuMarca", value)} />
            <div className="block">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">CPU modelo</span>
              </div>
              <input value={form.cpuModelo || ""} onChange={(event) => updateField("cpuModelo", event.target.value)} className={inputClass} />
              <FieldHint source={fieldSources.cpuModelo} />
              {cpuCatalogStatus ? <p className="mt-1 text-xs font-semibold text-[#D7FF4F]">{cpuCatalogStatus}</p> : null}
              {cpuMatches.length ? (
                <select value="" onChange={(event) => {
                  const selected = cpuMatches.find((entry) => entry.id === event.target.value);
                  if (selected) applyCpuCatalogEntry(selected);
                }} className="mt-2 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#101010] px-3 text-xs font-semibold text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70">
                  <option value="">Elegir CPU del catálogo</option>
                  {cpuMatches.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.cpuModel}{entry.cpuBrand ? ` · ${entry.cpuBrand}` : ""}{entry.verified ? " · verificado" : ""}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <TextField label="CPU frecuencia base" value={form.cpuFrecuenciaBase} source={fieldSources.cpuFrecuenciaBase} onChange={(value) => updateField("cpuFrecuenciaBase", value)} />
            <TextField label="CPU frecuencia turbo" value={form.cpuFrecuenciaTurbo} source={fieldSources.cpuFrecuenciaTurbo} onChange={(value) => updateField("cpuFrecuenciaTurbo", value)} />
            <SelectField label="RAM capacidad" value={form.ramCapacidad} source={fieldSources.ramCapacidad} options={SHIPPING_V2_ITEM_SELECT_OPTIONS.ramCapacidad} onChange={(value) => updateField("ramCapacidad", value)} />
            <SelectField label="RAM tipo" value={form.ramTipo} source={fieldSources.ramTipo} options={SHIPPING_V2_ITEM_SELECT_OPTIONS.ramTipo} onChange={(value) => updateField("ramTipo", value)} />
          </SectionCard>

          <SectionCard title="Gráficos y almacenamiento">
            <SelectField label="Pantalla tamaño" value={isDesktopLike ? "No aplica" : form.pantallaTamano} source={fieldSources.pantallaTamano} options={SHIPPING_V2_ITEM_SELECT_OPTIONS.pantallaTamano} onChange={(value) => updateField("pantallaTamano", value)} disabled={isDesktopLike} />
            <SelectField label="Pantalla resolución" value={isDesktopLike ? "No aplica" : form.pantallaResolucion} source={fieldSources.pantallaResolucion} options={SHIPPING_V2_ITEM_SELECT_OPTIONS.pantallaResolucion} onChange={(value) => updateField("pantallaResolucion", value)} disabled={isDesktopLike} />
            <TextField label="GPU" value={form.gpu} source={fieldSources.gpu} onChange={(value) => updateField("gpu", value)} />
            <TextField label="GPU integrada" value={form.gpuIntegrada} source={fieldSources.gpuIntegrada} onChange={(value) => updateField("gpuIntegrada", value)} />
            <TextField label="Almacenamiento principal" value={form.almacenamientoPrincipal} source={fieldSources.almacenamientoPrincipal} onChange={(value) => updateField("almacenamientoPrincipal", value)} />
            <SelectField label="Almacenamiento tipo" value={form.almacenamientoTipo} source={fieldSources.almacenamientoTipo} options={SHIPPING_V2_ITEM_SELECT_OPTIONS.almacenamientoTipo} onChange={(value) => updateField("almacenamientoTipo", value)} />
          </SectionCard>

          <SectionCard title="Conectividad, puertos y extras" action={
            <button type="button" onClick={() => setTechnicalOptionModal({ open: true, type: "connectivity", label: "", message: "", busy: false })} className="h-8 rounded-lg border border-[#4FC3FF]/45 bg-[#4FC3FF]/10 px-3 text-xs font-bold text-[#BDEAFF]">
              Nueva opción técnica
            </button>
          }>
            <MultiSelectField label="Conectividad" value={form.connectivityV2Ids} source={fieldSources.connectivityV2Ids} options={connectivityOptions} onChange={(value) => updateField("connectivityV2Ids", value)} />
            <MultiSelectField label="Puertos" value={form.portV2Ids} source={fieldSources.portV2Ids} options={portOptions} onChange={(value) => updateField("portV2Ids", value)} />
            <MultiSelectField label="Características extras" value={form.extraFeatureV2Ids} source={fieldSources.extraFeatureV2Ids} options={extraOptions} onChange={(value) => updateField("extraFeatureV2Ids", value)} />
          </SectionCard>

          <SectionCard title="Batería y observaciones">
            <TextField label="Batería salud %" type="number" value={isDesktopLike ? "" : form.bateriaSalud} source={fieldSources.bateriaSalud} onChange={(value) => updateField("bateriaSalud", value)} disabled={isDesktopLike} />
            <SelectField label="Batería estado" value={isDesktopLike ? "No aplica" : (calculatedBatteryState || form.bateriaEstado || "")} source={fieldSources.bateriaEstado} options={SHIPPING_V2_ITEM_SELECT_OPTIONS.bateriaEstado} onChange={(value) => updateField("bateriaEstado", value)} disabled />
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Observación ficha técnica</span>
              <textarea value={form.observacionFichaTecnica || ""} onChange={(event) => updateField("observacionFichaTecnica", event.target.value)} className="mt-1 min-h-24 w-full resize-y rounded-lg border border-[#3A3A36] bg-[#101010] px-3 py-2 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70" />
              <FieldHint source={fieldSources.observacionFichaTecnica} />
            </label>
          </SectionCard>
        </div>
        <FichaVentaLivePreview ficha={previewFicha} />
      </div>

      {technicalOptionModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-md rounded-xl border border-[#3A3A36] bg-[#151613] p-4 shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#F5F5F5]">Nueva opción técnica</h3>
                <p className="mt-1 text-sm text-[#A7A7A7]">Se creará como registro en el catálogo maestro correspondiente.</p>
              </div>
              <button type="button" onClick={() => setTechnicalOptionModal((current) => ({ ...current, open: false }))} className="h-8 w-8 rounded-lg border border-[#3A3A36] bg-[#20211D] text-sm font-bold text-[#A7A7A7]">X</button>
            </div>
            <div className="mt-4 grid gap-3">
              <SelectFieldWithLabels label="Tipo de opción" value={technicalOptionModal.type} options={technicalTypeOptions} onChange={(value) => setTechnicalOptionModal((current) => ({ ...current, type: value as TechnicalOptionType, message: "" }))} />
              <TextField label="Nombre de la opción" value={technicalOptionModal.label} onChange={(value) => setTechnicalOptionModal((current) => ({ ...current, label: value, message: "" }))} />
              <div className="rounded-lg border border-[#30312D] bg-[#101010] px-3 py-2 text-sm text-[#A7A7A7]">
                Vista previa: <span className="font-semibold text-[#F5F5F5]">{technicalOptionPreview || "-"}</span>
              </div>
              {technicalOptionModal.message ? <div className="rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{technicalOptionModal.message}</div> : null}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setTechnicalOptionModal((current) => ({ ...current, open: false }))} className="h-9 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-xs font-bold text-[#F5F5F5]">Cancelar</button>
                <button type="button" disabled={technicalOptionModal.busy} onClick={() => void createTechnicalOption()} className="h-9 rounded-lg border border-[#D7FF4F]/55 bg-[#D7FF4F] px-3 text-xs font-bold text-[#151515] disabled:opacity-60">
                  {technicalOptionModal.busy ? "Creando..." : "Crear opción"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
