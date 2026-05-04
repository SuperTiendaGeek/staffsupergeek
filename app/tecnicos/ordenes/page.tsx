"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/tecnicos/layout/AppShell";
import { StatusFilterDropdown } from "@/components/tecnicos/ui/StatusFilterDropdown";
import { Button, FieldShell, Input, Textarea } from "@/components/tecnicos/ui";
import { ESTADOS_ORDEN } from "@/types/tecnicos";
import { getAbandonmentStatus } from "@/lib/tecnicos/orders/abandonmentPolicy";

type OrdenListado = {
  recordId: string;
  idVisible: string;
  clienteNombre: string;
  telefono: string;
  equipo: string;
  ingresaPor: string;
  estadoActual: string;
  fechaIngreso: string;
  ultimaModificacion: string;
};

type OrdenesApiResponse = {
  success?: boolean;
  records?: OrdenListado[];
  data?: OrdenListado[];
  error?: string;
  nextOffset?: string | null;
  pageSize?: number;
  hasNext?: boolean;
  riskSummary?: RiskSummary;
  statusCounts?: StatusCounts;
};

type RiskFilter = "warning" | "critical" | null;

type RiskSummary = {
  warningCount: number;
  criticalCount: number;
};

type StatusCounts = Record<(typeof ESTADOS_ORDEN)[number], number>;

type ClienteBusqueda = {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string;
  direccion: string;
};

type NuevoClienteForm = {
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string;
  direccion: string;
  notas: string;
};

const PAGE_SIZE = 30;

const emptyNuevoCliente: NuevoClienteForm = {
  nombre: "",
  cedula: "",
  telefono: "",
  correo: "",
  direccion: "",
  notas: "",
};

const emptyRiskSummary: RiskSummary = {
  warningCount: 0,
  criticalCount: 0,
};

const emptyStatusCounts = (): StatusCounts =>
  ESTADOS_ORDEN.reduce(
    (acc, estado) => {
      acc[estado] = 0;
      return acc;
    },
    {} as StatusCounts
  );

const riskFilterLabels: Record<Exclude<RiskFilter, null>, string> = {
  warning: "Próximas a baja",
  critical: "Cumplen política de baja",
};

const statusCountTone: Record<
  (typeof ESTADOS_ORDEN)[number],
  { valueClass: string; badgeClass: string; activeClass: string; hoverClass: string }
> = {
  Pendiente: {
    valueClass: "text-[var(--sg-lime)]",
    badgeClass: "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)] text-[var(--sg-lime)]",
    activeClass: "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)]",
    hoverClass: "hover:border-[var(--sg-lime)] hover:bg-[var(--sg-lime-soft)]",
  },
  "En Proceso": {
    valueClass: "text-[var(--sg-info)]",
    badgeClass: "border-[var(--sg-info)] bg-[var(--sg-info-soft)] text-[var(--sg-info)]",
    activeClass: "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)]",
    hoverClass: "hover:border-[var(--sg-info)] hover:bg-[var(--sg-info-soft)]",
  },
  "Esperando Respuesta": {
    valueClass: "text-[var(--sg-warning)]",
    badgeClass: "border-[var(--sg-warning)] bg-[var(--sg-warning-soft)] text-[var(--sg-warning)]",
    activeClass: "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)]",
    hoverClass: "hover:border-[var(--sg-warning)] hover:bg-[var(--sg-warning-soft)]",
  },
  Completado: {
    valueClass: "text-[var(--sg-success)]",
    badgeClass: "border-[var(--sg-success)] bg-[var(--sg-success-soft)] text-[var(--sg-success)]",
    activeClass: "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)]",
    hoverClass: "hover:border-[var(--sg-success)] hover:bg-[var(--sg-success-soft)]",
  },
  "Finalizado Entregado": {
    valueClass: "text-[var(--sg-success)]",
    badgeClass: "border-[var(--sg-success)] bg-[var(--sg-success-soft)] text-[var(--sg-success)]",
    activeClass: "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)]",
    hoverClass: "hover:border-[var(--sg-success)] hover:bg-[var(--sg-success-soft)]",
  },
  "Enviado a Reciclaje": {
    valueClass: "text-[var(--sg-danger)]",
    badgeClass: "border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] text-[var(--sg-danger)]",
    activeClass: "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)]",
    hoverClass: "hover:border-[var(--sg-danger)] hover:bg-[var(--sg-danger-soft)]",
  },
};

const getStatusTone = (status?: string | null) => {
  const normalized = (status ?? "").trim().toLowerCase();
  const matched = ESTADOS_ORDEN.find((estado) => estado.toLowerCase() === normalized);
  return matched ? statusCountTone[matched] : statusCountTone.Pendiente;
};

const formatDate = (value: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default function OrdenesPage() {
  const [ordenes, setOrdenes] = useState<OrdenListado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("Todos");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>(null);
  const [riskSummary, setRiskSummary] = useState<RiskSummary>(emptyRiskSummary);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>(emptyStatusCounts);
  const [currentOffset, setCurrentOffset] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<string | null>(null);
  const [offsetHistory, setOffsetHistory] = useState<(string | null)[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openNuevaOrdenModal, setOpenNuevaOrdenModal] = useState(false);
  const [clienteSearch, setClienteSearch] = useState("");
  const [clienteResults, setClienteResults] = useState<ClienteBusqueda[]>([]);
  const [clientesLoading, setClientesLoading] = useState(false);
  const [clientesError, setClientesError] = useState<string | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<ClienteBusqueda | null>(null);
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState<NuevoClienteForm>(emptyNuevoCliente);
  const [ordenEquipo, setOrdenEquipo] = useState("");
  const [ordenAccesorios, setOrdenAccesorios] = useState("");
  const [ordenIngresaPor, setOrdenIngresaPor] = useState("");
  const [crearOrdenError, setCrearOrdenError] = useState<string | null>(null);
  const [crearOrdenSaving, setCrearOrdenSaving] = useState(false);

  const openOrders = ordenes.length;
  const pageNumber = offsetHistory.length + 1;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          pageSize: String(PAGE_SIZE),
        });
        if (debouncedSearchTerm) {
          params.set("q", debouncedSearchTerm);
        }
        if (selectedStatus && selectedStatus !== "Todos") {
          params.set("estado", selectedStatus);
        }
        if (riskFilter) {
          params.set("risk", riskFilter);
        }
        if (currentOffset) {
          params.set("offset", currentOffset);
        }

        const res = await fetch(`/api/tecnicos/ordenes?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as OrdenesApiResponse;
        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudieron cargar las ordenes");
        }

        setOrdenes(json.records ?? json.data ?? []);
        setNextOffset(json.nextOffset ?? null);
        setRiskSummary(json.riskSummary ?? emptyRiskSummary);
        setStatusCounts(json.statusCounts ?? emptyStatusCounts());
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchData();
    return () => controller.abort();
  }, [currentOffset, debouncedSearchTerm, selectedStatus, riskFilter, refreshKey]);

  useEffect(() => {
    if (!openNuevaOrdenModal || showNuevoCliente) return;

    const query = clienteSearch.trim();
    if (query.length < 2) {
      setClienteResults([]);
      setClientesError(null);
      setClientesLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setClientesLoading(true);
        setClientesError(null);
        const params = new URLSearchParams({ q: query });
        const res = await fetch(`/api/tecnicos/clientes/buscar?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: ClienteBusqueda[];
          error?: string;
        };
        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudieron buscar clientes");
        }
        setClienteResults(json.data ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setClientesError(error instanceof Error ? error.message : "Error desconocido");
      } finally {
        if (!controller.signal.aborted) {
          setClientesLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [clienteSearch, openNuevaOrdenModal, showNuevoCliente]);

  const resetPagination = () => {
    setCurrentOffset(null);
    setNextOffset(null);
    setOffsetHistory([]);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    resetPagination();
  };

  const handleStatusChange = (value: string) => {
    setSelectedStatus(value);
    resetPagination();
  };

  const handleStatusSummaryClick = (value: (typeof ESTADOS_ORDEN)[number]) => {
    setSelectedStatus((prev) => (prev === value ? "Todos" : value));
    resetPagination();
  };

  const handleRiskFilterChange = (value: Exclude<RiskFilter, null>) => {
    setRiskFilter((prev) => (prev === value ? null : value));
    resetPagination();
  };

  const handleNextPage = () => {
    if (!nextOffset || loading) return;
    setOffsetHistory((prev) => [...prev, currentOffset]);
    setCurrentOffset(nextOffset);
  };

  const handlePreviousPage = () => {
    if (offsetHistory.length === 0 || loading) return;
    const previousOffset = offsetHistory[offsetHistory.length - 1] ?? null;
    setOffsetHistory((prev) => prev.slice(0, -1));
    setCurrentOffset(previousOffset);
  };

  const resetNuevaOrdenForm = () => {
    setClienteSearch("");
    setClienteResults([]);
    setClientesError(null);
    setSelectedCliente(null);
    setShowNuevoCliente(false);
    setNuevoCliente(emptyNuevoCliente);
    setOrdenEquipo("");
    setOrdenAccesorios("");
    setOrdenIngresaPor("");
    setCrearOrdenError(null);
    setCrearOrdenSaving(false);
  };

  const closeNuevaOrdenModal = () => {
    if (crearOrdenSaving) return;
    setOpenNuevaOrdenModal(false);
    resetNuevaOrdenForm();
  };

  const updateNuevoCliente = (field: keyof NuevoClienteForm, value: string) => {
    setNuevoCliente((prev) => ({ ...prev, [field]: value }));
  };

  const handleCrearOrden = async () => {
    if (crearOrdenSaving) return;

    const equipo = ordenEquipo.trim();
    const ingresaPor = ordenIngresaPor.trim();
    const nuevoClienteNombre = nuevoCliente.nombre.trim();

    if (!selectedCliente && !showNuevoCliente) {
      setCrearOrdenError("Selecciona un cliente o registra uno nuevo.");
      return;
    }
    if (showNuevoCliente && !nuevoClienteNombre) {
      setCrearOrdenError("El nombre del cliente nuevo es obligatorio.");
      return;
    }
    if (!equipo) {
      setCrearOrdenError("El equipo es obligatorio.");
      return;
    }
    if (!ingresaPor) {
      setCrearOrdenError("Ingresa Por es obligatorio.");
      return;
    }

    try {
      setCrearOrdenSaving(true);
      setCrearOrdenError(null);
      const res = await fetch("/api/tecnicos/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: showNuevoCliente ? undefined : selectedCliente?.id,
          nuevoCliente: showNuevoCliente ? nuevoCliente : undefined,
          orden: {
            equipo,
            accesorios: ordenAccesorios.trim(),
            ingresaPor,
          },
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || (!json.success && !json.ok)) {
        throw new Error(json.error || "No se pudo crear la orden");
      }

      setOpenNuevaOrdenModal(false);
      resetNuevaOrdenForm();
      setSearchTerm("");
      setDebouncedSearchTerm("");
      setSelectedStatus("Todos");
      resetPagination();
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      setCrearOrdenError(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setCrearOrdenSaving(false);
    }
  };

  return (
    <AppShell
      title="Ordenes"
      subtitle="Listado conectado a Airtable (solo lectura)"
      active="ordenes"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(300px,1.1fr)]">
        <div className="w-full space-y-4">
          <header className="flex items-center justify-between rounded-2xl border border-zinc-900/70 bg-[#181818] px-6 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Panel</p>
              <h2 className="text-2xl font-semibold text-white">Ordenes activas</h2>
            </div>
            <div className="text-xs text-zinc-500">Airtable | paginado</div>
          </header>

          <section className="w-full space-y-4 rounded-2xl border border-zinc-900/70 bg-[#181818] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <div className="grid w-full items-end gap-3 lg:grid-cols-[minmax(0,2.5fr)_minmax(260px,1.2fr)_auto] lg:gap-4">
              <label className="w-full">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#e3fc02]">
                  Buscar en todas las ordenes
                </span>
                <div className="mt-2 flex items-center gap-3 rounded-lg border border-[#e3fc02] bg-[#121212] px-4 py-3 text-sm text-zinc-200 shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="h-4 w-4 text-zinc-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="9" cy="9" r="5" />
                    <line x1="13.5" y1="13.5" x2="18" y2="18" strokeLinecap="round" />
                  </svg>
                  <input
                    placeholder="Cliente, ID, equipo, telefono o ingreso"
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
                  />
                </div>
              </label>

              <div className="w-full">
                <StatusFilterDropdown
                  value={selectedStatus}
                  onChange={handleStatusChange}
                  options={[
                    { value: "Todos", label: "Todos los estados" },
                    ...ESTADOS_ORDEN.map((estado) => ({ value: estado, label: estado })),
                  ]}
                />
              </div>

              <button
                type="button"
                onClick={() => setOpenNuevaOrdenModal(true)}
                className="inline-flex h-[54px] items-center justify-center whitespace-nowrap rounded-lg bg-[#e3fc02] px-5 text-sm font-semibold text-black shadow-[0_10px_20px_rgba(227,252,2,0.25)] transition hover:brightness-95"
              >
                + Nueva orden
              </button>
            </div>

            {loading && <div className="text-sm text-zinc-300">Cargando ordenes...</div>}
            {error && (
              <div className="text-sm text-red-400">
                Ocurrio un problema al cargar las ordenes: {error}
              </div>
            )}

            {riskFilter && (
              <div className="flex flex-col gap-2 rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[#151515] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-zinc-200">
                  Filtro activo:{" "}
                  <span
                    className={
                      riskFilter === "critical"
                        ? "text-[var(--sg-danger)]"
                        : "text-[var(--sg-warning)]"
                    }
                  >
                    {riskFilterLabels[riskFilter]}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRiskFilter(null);
                    resetPagination();
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-800 bg-[#151515] px-3 text-xs font-semibold text-zinc-200 transition hover:border-[#e3fc02] hover:text-[#e3fc02]"
                >
                  Limpiar filtro
                </button>
              </div>
            )}

            {!loading && !error && (
              <>
                {ordenes.length === 0 ? (
                  <div className="text-sm text-zinc-300">
                    No se encontraron ordenes con esos filtros.
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto rounded-xl border border-zinc-900/80 bg-[#151515]">
                    <div className="grid min-w-[960px] grid-cols-[90px_minmax(140px,1.15fr)_minmax(300px,2.7fr)_minmax(120px,0.9fr)_minmax(190px,1fr)_90px] border-b border-zinc-900/80 bg-[#0f0f0f]/70 px-6 py-3 text-[12px] uppercase tracking-wide text-zinc-500">
                      <span>ID</span>
                      <span>Cliente</span>
                      <span>Equipo</span>
                      <span>Fecha</span>
                      <span>Estado</span>
                      <span className="text-right">Accion</span>
                    </div>
                    <div className="divide-y divide-zinc-900/80">
                      {ordenes.map((orden, idx) => {
                        const abandonmentStatus = getAbandonmentStatus(orden);
                        const statusTone = getStatusTone(orden.estadoActual);
                        const riskRowClass =
                          abandonmentStatus.level === "critical"
                            ? "border-l-4 border-l-[var(--sg-danger)] bg-[var(--sg-danger-soft)] hover:bg-[var(--sg-danger-soft)]"
                            : abandonmentStatus.level === "warning"
                            ? "border-l-4 border-l-[var(--sg-warning)] bg-[var(--sg-warning-soft)] hover:bg-[var(--sg-warning-soft)]"
                            : `border-l-4 border-l-transparent ${
                                idx % 2 === 0 ? "bg-[#161616]" : "bg-[#1a1a1a]"
                              } hover:bg-[#1d1d1d]`;
                        return (
                          <div
                            key={orden.recordId}
                            className={`grid min-w-[960px] grid-cols-[90px_minmax(140px,1.15fr)_minmax(300px,2.7fr)_minmax(120px,0.9fr)_minmax(190px,1fr)_90px] items-center px-6 py-3 text-sm text-zinc-200 transition ${riskRowClass}`}
                          >
                            <span className="truncate font-semibold text-zinc-100">{orden.idVisible}</span>
                            <span className="truncate">{orden.clienteNombre || "Cliente no disponible"}</span>
                            <span className="min-w-0 pr-5">
                              <span className="block truncate font-semibold text-zinc-200">
                                {orden.equipo || "Equipo no especificado"}
                              </span>
                              <span
                                className="mt-0.5 block truncate text-xs text-[var(--sg-text-muted)]"
                                title={orden.ingresaPor || "No disponible"}
                              >
                                Ingreso: {orden.ingresaPor || "No disponible"}
                              </span>
                            </span>
                            <span className="text-zinc-400">{formatDate(orden.fechaIngreso)}</span>
                            <span>
                              <span
                                className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-semibold ${statusTone.badgeClass}`}
                              >
                                {orden.estadoActual || "Sin estado"}
                              </span>
                            </span>
                            <span className="flex justify-end">
                              <Link
                                href={`/tecnicos/ordenes/${encodeURIComponent(orden.recordId)}`}
                                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-semibold text-white transition hover:border-[#e3fc02] hover:text-[#e3fc02]"
                              >
                                Ver
                              </Link>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-zinc-900/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-zinc-500">
                    Pagina {pageNumber} | {ordenes.length} registros cargados
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handlePreviousPage}
                      disabled={loading || offsetHistory.length === 0}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-800 bg-[#151515] px-4 text-sm font-semibold text-zinc-200 transition hover:border-[#e3fc02] hover:text-[#e3fc02] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-zinc-800 disabled:hover:text-zinc-200"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={handleNextPage}
                      disabled={loading || !nextOffset}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-[#e3fc02] bg-[#e3fc02] px-4 text-sm font-semibold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-[#151515] disabled:text-zinc-500 disabled:hover:brightness-100"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-zinc-900/70 bg-[#181818] p-4 shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
            <p className="text-sm font-semibold text-white">Ordenes en esta pagina</p>
            <p className="mt-2 text-3xl font-bold text-[#e3fc02]">{openOrders}</p>
            <p className="mt-1 text-xs text-zinc-500">Tanda actual desde Airtable</p>
          </div>

          <div className="space-y-3 rounded-[var(--sg-radius-lg)] border border-[var(--sg-border)] bg-[var(--sg-panel)] p-4 shadow-[var(--sg-shadow-card)]">
            <div>
              <p className="text-sm font-semibold text-[var(--sg-text-primary)]">
                Resumen por estado
              </p>
              <p className="mt-1 text-xs text-[var(--sg-text-muted)]">
                Conteo global con los filtros activos
              </p>
            </div>
            <div className="space-y-2">
              {ESTADOS_ORDEN.map((estado) => {
                const active = selectedStatus === estado;
                const tone = statusCountTone[estado];
                return (
                  <button
                    key={estado}
                    type="button"
                    onClick={() => handleStatusSummaryClick(estado)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      active
                        ? tone.activeClass
                        : `border-[var(--sg-border)] bg-[var(--sg-card)] ${tone.hoverClass}`
                    }`}
                    aria-pressed={active}
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-[var(--sg-text-primary)]">
                      {estado}
                    </span>
                    <span className={`shrink-0 text-xl font-extrabold ${tone.valueClass}`}>
                      {statusCounts[estado] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedStatus !== "Todos" && (
              <button
                type="button"
                onClick={() => handleStatusChange("Todos")}
                className="inline-flex h-9 w-full items-center justify-center rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 text-xs font-semibold text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)] hover:text-[var(--sg-lime)]"
              >
                Limpiar estado
              </button>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-900/70 bg-[#181818] p-4 shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
            <div>
              <p className="text-sm font-semibold text-white">Alertas de abandono</p>
              <p className="mt-1 text-xs text-zinc-500">Conteo global con los filtros activos</p>
            </div>
            <button
              type="button"
              onClick={() => handleRiskFilterChange("warning")}
              className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                riskFilter === "warning"
                  ? "border-[var(--sg-warning)] bg-[var(--sg-warning-soft)]"
                  : "border-[var(--sg-border)] bg-[#151515] hover:border-[var(--sg-warning)] hover:bg-[var(--sg-warning-soft)]"
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">Próximas a baja</span>
                <span className="text-2xl font-extrabold text-[var(--sg-warning)]">
                  {riskSummary.warningCount}
                </span>
              </span>
              <span className="mt-1 block text-xs text-zinc-400">
                Entre 60 y 89 días sin respuesta
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleRiskFilterChange("critical")}
              className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                riskFilter === "critical"
                  ? "border-[var(--sg-danger)] bg-[var(--sg-danger-soft)]"
                  : "border-[var(--sg-border)] bg-[#151515] hover:border-[var(--sg-danger)] hover:bg-[var(--sg-danger-soft)]"
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">Cumplen política de baja</span>
                <span className="text-2xl font-extrabold text-[var(--sg-danger)]">
                  {riskSummary.criticalCount}
                </span>
              </span>
              <span className="mt-1 block text-xs text-zinc-400">
                90 días o más sin respuesta
              </span>
            </button>
            {riskFilter && (
              <button
                type="button"
                onClick={() => {
                  setRiskFilter(null);
                  resetPagination();
                }}
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-zinc-800 bg-[#151515] px-3 text-xs font-semibold text-zinc-200 transition hover:border-[#e3fc02] hover:text-[#e3fc02]"
              >
                Limpiar filtro
              </button>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-900/70 bg-[#181818] p-4 shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
            <p className="text-sm font-semibold text-white">Estado del sistema</p>
            <ul className="space-y-2 text-sm text-zinc-300">
              <li>UI: OK</li>
              <li>Backend (Airtable): OK</li>
              <li>Auth: pendiente</li>
            </ul>
          </div>
        </aside>
      </div>

      {openNuevaOrdenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-[var(--sg-radius-lg)] border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--sg-divider)] px-5 py-4">
              <div>
                <h3 className="text-xl font-extrabold text-[var(--sg-text-primary)]">
                  Nueva orden de reparación
                </h3>
                <p className="mt-1 text-sm leading-6 text-[var(--sg-text-secondary)]">
                  Registra el cliente y los datos iniciales del equipo recibido.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={closeNuevaOrdenModal}
                disabled={crearOrdenSaving}
                aria-label="Cerrar modal"
                className="text-[var(--sg-text-secondary)]"
              >
                X
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <section className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sg-text-muted)]">
                    Cliente
                  </p>
                  <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <FieldShell label="Buscar cliente">
                      <Input
                        value={clienteSearch}
                        onChange={(event) => {
                          setClienteSearch(event.target.value);
                          setSelectedCliente(null);
                        }}
                        placeholder="Buscar por nombre, cédula o teléfono"
                        disabled={showNuevoCliente || crearOrdenSaving}
                      />
                    </FieldShell>
                    <Button
                      type="button"
                      variant={showNuevoCliente ? "primary" : "secondary"}
                      onClick={() => {
                        setShowNuevoCliente((prev) => !prev);
                        setSelectedCliente(null);
                        setClientesError(null);
                      }}
                      disabled={crearOrdenSaving}
                      className="h-10"
                    >
                      + Registrar nuevo cliente
                    </Button>
                  </div>
                </div>

                {!showNuevoCliente && (
                  <div className="space-y-2">
                    {clientesLoading && (
                      <p className="text-sm text-[var(--sg-text-secondary)]">Buscando clientes...</p>
                    )}
                    {clientesError && (
                      <p className="text-sm text-[var(--sg-danger)]">{clientesError}</p>
                    )}
                    {!clientesLoading &&
                      !clientesError &&
                      clienteSearch.trim().length >= 2 &&
                      clienteResults.length === 0 && (
                        <p className="rounded-[var(--sg-radius-md)] border border-dashed border-[var(--sg-border)] bg-[var(--sg-panel)] px-4 py-3 text-sm text-[var(--sg-text-secondary)]">
                          No se encontraron clientes con esa búsqueda.
                        </p>
                      )}
                    {clienteResults.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {clienteResults.map((cliente) => {
                          const selected = selectedCliente?.id === cliente.id;
                          return (
                            <button
                              key={cliente.id}
                              type="button"
                              onClick={() => setSelectedCliente(cliente)}
                              disabled={crearOrdenSaving}
                              className={`rounded-[var(--sg-radius-md)] border px-4 py-3 text-left transition ${
                                selected
                                  ? "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)]"
                                  : "border-[var(--sg-border)] bg-[var(--sg-panel)] hover:border-[var(--sg-lime)]"
                              }`}
                            >
                              <span className="block text-sm font-extrabold text-[var(--sg-text-primary)]">
                                {cliente.nombre}
                              </span>
                              <span className="mt-1 block text-xs text-[var(--sg-text-secondary)]">
                                {cliente.telefono || "Sin teléfono"} · {cliente.cedula || "Sin cédula"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {showNuevoCliente && (
                  <div className="grid gap-3 rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-panel)] p-4 sm:grid-cols-2">
                    <FieldShell label="Nombre">
                      <Input
                        value={nuevoCliente.nombre}
                        onChange={(event) => updateNuevoCliente("nombre", event.target.value)}
                        placeholder="Nombre del cliente"
                        disabled={crearOrdenSaving}
                      />
                    </FieldShell>
                    <FieldShell label="Cédula">
                      <Input
                        value={nuevoCliente.cedula}
                        onChange={(event) => updateNuevoCliente("cedula", event.target.value)}
                        placeholder="Cédula o identificación"
                        disabled={crearOrdenSaving}
                      />
                    </FieldShell>
                    <FieldShell label="Teléfono">
                      <Input
                        value={nuevoCliente.telefono}
                        onChange={(event) => updateNuevoCliente("telefono", event.target.value)}
                        placeholder="Teléfono"
                        disabled={crearOrdenSaving}
                      />
                    </FieldShell>
                    <FieldShell label="Correo">
                      <Input
                        type="email"
                        value={nuevoCliente.correo}
                        onChange={(event) => updateNuevoCliente("correo", event.target.value)}
                        placeholder="Correo"
                        disabled={crearOrdenSaving}
                      />
                    </FieldShell>
                    <FieldShell label="Dirección">
                      <Input
                        value={nuevoCliente.direccion}
                        onChange={(event) => updateNuevoCliente("direccion", event.target.value)}
                        placeholder="Dirección"
                        disabled={crearOrdenSaving}
                      />
                    </FieldShell>
                    <FieldShell label="Notas" className="sm:col-span-2">
                      <Textarea
                        value={nuevoCliente.notas}
                        onChange={(event) => updateNuevoCliente("notas", event.target.value)}
                        placeholder="Notas del cliente"
                        disabled={crearOrdenSaving}
                      />
                    </FieldShell>
                  </div>
                )}
              </section>

              <section className="space-y-4 border-t border-[var(--sg-divider)] pt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sg-text-muted)]">
                  Datos del equipo
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldShell label="Equipo" className="sm:col-span-2">
                    <Input
                      value={ordenEquipo}
                      onChange={(event) => setOrdenEquipo(event.target.value)}
                      placeholder="Equipo recibido"
                      disabled={crearOrdenSaving}
                    />
                  </FieldShell>
                  <FieldShell label="Accesorios">
                    <Input
                      value={ordenAccesorios}
                      onChange={(event) => setOrdenAccesorios(event.target.value)}
                      placeholder="Accesorios recibidos"
                      disabled={crearOrdenSaving}
                    />
                  </FieldShell>
                  <FieldShell label="Ingresa Por">
                    <Input
                      value={ordenIngresaPor}
                      onChange={(event) => setOrdenIngresaPor(event.target.value)}
                      placeholder="Técnico o canal de ingreso"
                      disabled={crearOrdenSaving}
                    />
                  </FieldShell>
                </div>
              </section>

              {crearOrdenError && (
                <div className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-4 py-3 text-sm text-[var(--sg-danger)]">
                  {crearOrdenError}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[var(--sg-divider)] px-5 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={closeNuevaOrdenModal}
                disabled={crearOrdenSaving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleCrearOrden}
                disabled={crearOrdenSaving}
              >
                {crearOrdenSaving ? "Creando..." : "Crear orden"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
