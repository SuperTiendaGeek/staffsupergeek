"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { Loader2, PackageSearch, Search, X } from "lucide-react";
import {
  normalizeSearchText,
  prepareShippingV2ItemSearchIndex,
  searchShippingV2ItemIndex,
  type ShippingV2SearchResult,
} from "@/lib/shipping-v2/item-search";
import type { ShippingV2Item, ShippingV2ItemSearchEntry } from "@/types/shipping-v2";

type FallbackItem = ShippingV2Item & {
  proveedorCompraDisplay?: string;
  proveedorLogisticoDisplay?: string;
};

type SearchIndexPayload = {
  items?: ShippingV2ItemSearchEntry[];
  total?: number;
  generatedAt?: string;
  error?: string;
};

type IndexStatus = "loading" | "ready" | "fallback";

type Props = {
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  fallbackItems: FallbackItem[];
  canViewCosts?: boolean;
};

function availabilityLabel(item: FallbackItem) {
  if (item.conNovedad) return "Con novedad";
  if (item.reservado) return "Reservado";
  if (item.usoLocal) return "Uso local";
  if (item.esRepuesto) return "Repuesto";
  if (item.disponibleVenta) return "Disponible para venta";
  return "No disponible";
}

function fallbackItemToSearchEntry(item: FallbackItem): ShippingV2ItemSearchEntry {
  return {
    id: item.id,
    createdTime: item.createdTime,
    sku: item.sku,
    skuProveedor: item.skuProveedor,
    nombre: item.nombre,
    marca: item.marca,
    modelo: item.modelo,
    numeroSerie: item.numeroSerie,
    estado: item.estado,
    tipoOperacion: item.tipoOperacion,
    proveedorCompra: item.proveedorCompraDisplay || item.proveedorNombre,
    proveedorLogistico: item.proveedorLogisticoDisplay || item.proveedorLogisticoNombre,
    packingId: item.packingId,
    legacyPackingId: item.legacyPackingId,
    trackingDirecto: item.trackingDirecto,
    trackingHaciaIntermediario: item.trackingHaciaIntermediario,
    trackingDesdeIntermediario: item.trackingDesdeIntermediario,
    trackingUsa: item.trackingUsa,
    trackingEc: item.trackingEc,
    precioVenta: item.precioVenta,
    disponibilidad: availabilityLabel(item),
    ubicacionActual: item.ubicacionActual,
    fechaRegistro: item.fechaRegistro || item.createdTime,
    thumbnailUrl: item.fotos[0]?.thumbnailUrl || item.fotos[0]?.url,
  };
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "Sin precio";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function displayValue(value?: string | null, fallback = "Sin dato") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function statusTone(value?: string) {
  const normalized = normalizeSearchText(value);
  if (normalized.includes("disponible") || normalized.includes("pagado")) return "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  if (normalized.includes("transito") || normalized.includes("camino")) return "border-[#8B73FF]/35 bg-[#8B73FF]/12 text-[#C9BFFF]";
  if (normalized.includes("pendiente") || normalized.includes("borrador")) return "border-[#F4E85B]/35 bg-[#F4E85B]/12 text-[#F4E85B]";
  if (normalized.includes("cancelado") || normalized.includes("novedad") || normalized.includes("observado")) return "border-[#FF914D]/35 bg-[#FF914D]/12 text-[#FFB07A]";
  return "border-[#3A3A36] bg-[#151613] text-[#A7A7A7]";
}

function preferredMatch(result: ShippingV2SearchResult) {
  return result.matchedFields.find((match) => !["sku", "nombre", "estado"].includes(match.key)) || result.matchedFields[0];
}

export function ShippingV2ItemsPredictiveSearch({ search, setSearch, fallbackItems, canViewCosts = true }: Props) {
  const router = useRouter();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestedRef = useRef(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [globalEntries, setGlobalEntries] = useState<ShippingV2ItemSearchEntry[]>([]);
  const [indexStatus, setIndexStatus] = useState<IndexStatus>("loading");
  const [navigatingId, setNavigatingId] = useState("");

  const normalizedQuery = normalizeSearchText(search);
  const fallbackEntries = useMemo(() => fallbackItems.map(fallbackItemToSearchEntry), [fallbackItems]);
  const activeEntries = indexStatus === "ready" ? globalEntries : fallbackEntries;
  const preparedIndex = useMemo(() => prepareShippingV2ItemSearchIndex(activeEntries), [activeEntries]);
  const searchResults = useMemo(() => searchShippingV2ItemIndex(preparedIndex, search, { limit: 8 }), [preparedIndex, search]);
  const results = searchResults.results;
  const activeResult = activeIndex >= 0 ? results[activeIndex] : null;
  const activeOptionId = activeResult ? `${listboxId}-${activeResult.item.id}` : undefined;
  const shouldShowPanel = panelOpen && Boolean(normalizedQuery);

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;

    const controller = new AbortController();
    let didTimeout = false;
    const timeout = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
      setIndexStatus("fallback");
    }, 10000);

    async function loadIndex() {
      try {
        const response = await fetch("/api/shipping-v2/items/search-index", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as SearchIndexPayload;
        if (!response.ok) throw new Error(payload.error || "search-index-error");
        setGlobalEntries(payload.items ?? []);
        setIndexStatus("ready");
      } catch (error) {
        if (controller.signal.aborted && didTimeout) return;
        if (controller.signal.aborted) return;
        console.warn("No se pudo cargar el índice global de Shipping Items:", error);
        setIndexStatus("fallback");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void loadIndex();

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!normalizedQuery) {
      setPanelOpen(false);
      setActiveIndex(-1);
      setNavigatingId("");
    }
  }, [normalizedQuery]);

  useEffect(() => {
    setActiveIndex((current) => {
      if (!results.length) return -1;
      if (current < 0) return -1;
      return Math.min(current, results.length - 1);
    });
  }, [results.length]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current || rootRef.current.contains(event.target as Node)) return;
      setPanelOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
      if (normalizeSearchText(search)) setPanelOpen(true);
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [search]);

  function navigateToResult(result?: ShippingV2SearchResult | null) {
    if (!result) return;
    setNavigatingId(result.item.id);
    setPanelOpen(false);
    router.push(`/shipping-v2/items/${result.item.id}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (!normalizedQuery) return;
      event.preventDefault();
      setPanelOpen(true);
      setActiveIndex((current) => (results.length ? (current + 1) % results.length : -1));
      return;
    }

    if (event.key === "ArrowUp") {
      if (!normalizedQuery) return;
      event.preventDefault();
      setPanelOpen(true);
      setActiveIndex((current) => (results.length ? (current <= 0 ? results.length - 1 : current - 1) : -1));
      return;
    }

    if (event.key === "Enter") {
      if (!normalizedQuery) return;
      const target = activeIndex >= 0 ? results[activeIndex] : results[0];
      if (!target) return;
      event.preventDefault();
      navigateToResult(target);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setPanelOpen(false);
      setActiveIndex(-1);
    }
  }

  function updateSearch(value: string) {
    setSearch(value);
    setActiveIndex(-1);
    setPanelOpen(Boolean(normalizeSearchText(value)));
  }

  return (
    <div ref={rootRef} className="relative z-40 w-full max-w-[740px]">
      <div className={`group flex h-11 items-center gap-2 rounded-xl border bg-[#10110F] px-3 shadow-xl shadow-black/25 motion-safe:transition ${shouldShowPanel ? "border-[#D7FF4F]/70 ring-2 ring-[#D7FF4F]/15" : "border-[#3A3A36] hover:border-[#D7FF4F]/45"}`}>
        <Search className="h-4 w-4 shrink-0 text-[#D7FF4F]" aria-hidden="true" />
        <input
          ref={inputRef}
          value={search}
          onChange={(event) => updateSearch(event.target.value)}
          onFocus={() => {
            if (normalizedQuery) setPanelOpen(true);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={shouldShowPanel}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          placeholder="Buscar por nombre, SKU, serie, proveedor, packing o tracking"
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#F5F5F5] outline-none placeholder:text-[#696A64]"
        />
        {search ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setPanelOpen(false);
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            aria-label="Limpiar búsqueda"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#30312D] bg-[#171814] text-[#A7A7A7] transition hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F] focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {shouldShowPanel ? (
        <div className="absolute left-0 right-0 top-full z-[80] mt-2 overflow-hidden rounded-xl border border-[#30312D] bg-[#11120F] shadow-2xl shadow-black/45">
          {indexStatus === "loading" ? (
            <div className="flex items-center gap-2 border-b border-[#30312D] px-3 py-2 text-[12px] font-semibold text-[#A7A7A7]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Cargando búsqueda global...
            </div>
          ) : null}
          {indexStatus === "fallback" ? (
            <div className="border-b border-[#30312D] px-3 py-2 text-[12px] font-semibold text-[#F4E85B]">
              No se pudo cargar la búsqueda global. Se buscará temporalmente en los Items visibles.
            </div>
          ) : null}

          <div id={listboxId} role="listbox" className="max-h-[540px] overflow-y-auto py-1">
            {results.length ? results.map((result, index) => {
              const item = result.item;
              const active = index === activeIndex;
              const match = preferredMatch(result);
              const optionId = `${listboxId}-${item.id}`;
              const meta = [item.marca, item.modelo].filter(Boolean).join(" ");
              const routePending = navigatingId === item.id;

              return (
                <button
                  key={item.id}
                  id={optionId}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => navigateToResult(result)}
                  className={`grid w-full grid-cols-[44px_minmax(0,1fr)] gap-3 px-3 py-2.5 text-left motion-safe:transition ${active ? "bg-[#D7FF4F]/12" : "hover:bg-[#CFFF3A]/[0.055]"}`}
                >
                  <span className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border ${active ? "border-[#D7FF4F]/45 bg-[#D7FF4F]/10" : "border-[#30312D] bg-[#171814]"}`}>
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <PackageSearch className="h-5 w-5 text-[#D7FF4F]" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[#F5F5F5]">{displayValue(item.nombre, "Item sin nombre")}</span>
                        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold text-[#A7A7A7]">
                          <span className="text-[#D7FF4F]">{displayValue(item.sku, "Sin SKU")}</span>
                          {meta ? <span className="truncate">{meta}</span> : null}
                          {canViewCosts ? <span>{formatCurrency(item.precioVenta)}</span> : null}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(item.estado)}`}>
                        {displayValue(item.estado, "Sin estado")}
                      </span>
                    </span>
                    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#8F908A]">
                      <span className="truncate">{displayValue(item.proveedorCompra, "Sin proveedor")}</span>
                      {match ? <span className="truncate text-[#D8D8D3]">{match.label}: {match.value}</span> : null}
                      {routePending ? <span className="text-[#D7FF4F]">Abriendo...</span> : null}
                    </span>
                  </span>
                </button>
              );
            }) : (
              <div className="px-4 py-8 text-center text-sm text-[#A7A7A7]">
                Sin coincidencias para esta búsqueda.
              </div>
            )}
          </div>

          <div className="border-t border-[#30312D] px-3 py-2 text-[12px] font-semibold text-[#8F908A]">
            {results.length ? `${results.length} resultados principales de ${searchResults.total} coincidencias` : "Sin resultados principales"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
