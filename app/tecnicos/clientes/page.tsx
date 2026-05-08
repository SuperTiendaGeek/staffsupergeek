"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/tecnicos/layout/AppShell";
import { Button, FieldShell, Input, Textarea } from "@/components/tecnicos/ui";

type ClienteListado = {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string;
  direccion: string;
  numeroOrdenes: number | null;
  ultimaFechaIngreso: string;
};

type ClientesApiResponse = {
  success?: boolean;
  records?: ClienteListado[];
  data?: ClienteListado[];
  error?: string;
  nextOffset?: string | null;
  pageSize?: number;
  hasNext?: boolean;
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

export default function ClientesPage() {
  const [clientes, setClientes] = useState<ClienteListado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [currentOffset, setCurrentOffset] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<string | null>(null);
  const [offsetHistory, setOffsetHistory] = useState<(string | null)[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openNuevoClienteModal, setOpenNuevoClienteModal] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState<NuevoClienteForm>(emptyNuevoCliente);
  const [crearClienteError, setCrearClienteError] = useState<string | null>(null);
  const [crearClienteSaving, setCrearClienteSaving] = useState(false);

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
        if (currentOffset) {
          params.set("offset", currentOffset);
        }

        const res = await fetch(`/api/tecnicos/clientes?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as ClientesApiResponse;
        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudieron cargar los clientes");
        }

        setClientes(json.records ?? json.data ?? []);
        setNextOffset(json.nextOffset ?? null);
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
  }, [currentOffset, debouncedSearchTerm, refreshKey]);

  const resetPagination = () => {
    setCurrentOffset(null);
    setNextOffset(null);
    setOffsetHistory([]);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
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

  const resetNuevoClienteForm = () => {
    setNuevoCliente(emptyNuevoCliente);
    setCrearClienteError(null);
    setCrearClienteSaving(false);
  };

  const closeNuevoClienteModal = () => {
    if (crearClienteSaving) return;
    setOpenNuevoClienteModal(false);
    resetNuevoClienteForm();
  };

  const updateNuevoCliente = (field: keyof NuevoClienteForm, value: string) => {
    setNuevoCliente((prev) => ({ ...prev, [field]: value }));
  };

  const handleCrearCliente = async () => {
    if (crearClienteSaving) return;

    const nombre = nuevoCliente.nombre.trim();
    if (!nombre) {
      setCrearClienteError("El nombre del cliente es obligatorio.");
      return;
    }

    try {
      setCrearClienteSaving(true);
      setCrearClienteError(null);

      const res = await fetch("/api/tecnicos/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          cedula: nuevoCliente.cedula.trim(),
          telefono: nuevoCliente.telefono.trim(),
          correo: nuevoCliente.correo.trim(),
          direccion: nuevoCliente.direccion.trim(),
          notas: nuevoCliente.notas.trim(),
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo crear el cliente");
      }

      setOpenNuevoClienteModal(false);
      resetNuevoClienteForm();
      resetPagination();
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setCrearClienteError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCrearClienteSaving(false);
    }
  };

  return (
    <AppShell
      title="Clientes"
      active="clientes"
      hideTopBar
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(300px,1.1fr)]">
        <div className="w-full space-y-4">
          <section className="w-full space-y-4 rounded-2xl border border-zinc-900/70 bg-[#181818] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <div className="grid w-full items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-4">
              <label className="w-full">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#e3fc02]">
                  Buscar en todos los clientes
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
                    placeholder="Cliente, cédula, teléfono o correo"
                    value={searchTerm}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
                  />
                </div>
              </label>

              <button
                type="button"
                onClick={() => setOpenNuevoClienteModal(true)}
                className="inline-flex h-[54px] items-center justify-center whitespace-nowrap rounded-lg bg-[#e3fc02] px-5 text-sm font-semibold text-black shadow-[0_10px_20px_rgba(227,252,2,0.25)] transition hover:brightness-95"
              >
                + Nuevo cliente
              </button>
            </div>

            {loading && <div className="text-sm text-zinc-300">Cargando clientes...</div>}
            {error && (
              <div className="text-sm text-red-400">
                Ocurrió un problema al cargar los clientes: {error}
              </div>
            )}

            {!loading && !error && (
              <>
                {clientes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--sg-border)] bg-[#151515] px-4 py-6 text-sm text-zinc-300">
                    No se encontraron clientes con esa búsqueda.
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto rounded-xl border border-zinc-900/80 bg-[#151515]">
                    <div className="grid min-w-[980px] grid-cols-[minmax(0,1.4fr)_minmax(120px,0.9fr)_minmax(120px,0.9fr)_minmax(0,1.4fr)_110px_minmax(120px,0.9fr)_90px] border-b border-zinc-900/80 bg-[#0f0f0f]/70 px-6 py-3 text-[12px] uppercase tracking-wide text-zinc-500">
                      <span>Nombre</span>
                      <span>Teléfono</span>
                      <span>Cédula</span>
                      <span>Correo</span>
                      <span>Nº órdenes</span>
                      <span>Última orden</span>
                      <span className="text-right">Acción</span>
                    </div>
                    <div className="divide-y divide-zinc-900/80">
                      {clientes.map((cliente, idx) => (
                        <div
                          key={cliente.id}
                          className={`grid min-w-[980px] grid-cols-[minmax(0,1.4fr)_minmax(120px,0.9fr)_minmax(120px,0.9fr)_minmax(0,1.4fr)_110px_minmax(120px,0.9fr)_90px] items-center px-6 py-3 text-sm text-zinc-200 transition ${
                            idx % 2 === 0 ? "bg-[#161616]" : "bg-[#1a1a1a]"
                          } hover:bg-[#1d1d1d]`}
                        >
                          <span className="truncate font-semibold text-zinc-100">
                            {cliente.nombre || "Cliente sin nombre"}
                          </span>
                          <span className="truncate text-zinc-300">{cliente.telefono || "-"}</span>
                          <span className="truncate text-zinc-300">{cliente.cedula || "-"}</span>
                          <span className="truncate text-zinc-300" title={cliente.correo || "-"}>
                            {cliente.correo || "-"}
                          </span>
                          <span className="font-semibold text-[#e3fc02]">
                            {cliente.numeroOrdenes ?? 0}
                          </span>
                          <span className="text-zinc-400">
                            {formatDate(cliente.ultimaFechaIngreso)}
                          </span>
                          <span className="flex justify-end">
                            <Link
                              href={`/tecnicos/clientes/${encodeURIComponent(cliente.id)}`}
                              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-semibold text-white transition hover:border-[#e3fc02] hover:text-[#e3fc02]"
                            >
                              Ver
                            </Link>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-zinc-900/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-zinc-500">
                    Página {pageNumber} | {clientes.length} registros cargados
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
            <p className="text-sm font-semibold text-white">Clientes en esta página</p>
            <p className="mt-2 text-3xl font-bold text-[#e3fc02]">{clientes.length}</p>
            <p className="mt-1 text-xs text-zinc-500">Registros visibles</p>
          </div>
        </aside>
      </div>

      {openNuevoClienteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[var(--sg-radius-lg)] border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--sg-divider)] px-5 py-4">
              <div>
                <h3 className="text-xl font-extrabold text-[var(--sg-text-primary)]">
                  Nuevo cliente
                </h3>
                <p className="mt-1 text-sm leading-6 text-[var(--sg-text-secondary)]">
                  Registra la información básica del cliente.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={closeNuevoClienteModal}
                disabled={crearClienteSaving}
                aria-label="Cerrar modal"
                className="text-[var(--sg-text-secondary)]"
              >
                X
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldShell label="Nombre">
                  <Input
                    value={nuevoCliente.nombre}
                    onChange={(event) => updateNuevoCliente("nombre", event.target.value)}
                    placeholder="Nombre del cliente"
                    disabled={crearClienteSaving}
                  />
                </FieldShell>
                <FieldShell label="Cédula">
                  <Input
                    value={nuevoCliente.cedula}
                    onChange={(event) => updateNuevoCliente("cedula", event.target.value)}
                    placeholder="Cédula o identificación"
                    disabled={crearClienteSaving}
                  />
                </FieldShell>
                <FieldShell label="Teléfono" hint="Recomendado">
                  <Input
                    value={nuevoCliente.telefono}
                    onChange={(event) => updateNuevoCliente("telefono", event.target.value)}
                    placeholder="Teléfono"
                    disabled={crearClienteSaving}
                  />
                </FieldShell>
                <FieldShell label="Correo">
                  <Input
                    type="email"
                    value={nuevoCliente.correo}
                    onChange={(event) => updateNuevoCliente("correo", event.target.value)}
                    placeholder="Correo"
                    disabled={crearClienteSaving}
                  />
                </FieldShell>
                <FieldShell label="Dirección" className="sm:col-span-2">
                  <Input
                    value={nuevoCliente.direccion}
                    onChange={(event) => updateNuevoCliente("direccion", event.target.value)}
                    placeholder="Dirección"
                    disabled={crearClienteSaving}
                  />
                </FieldShell>
                <FieldShell label="Notas" className="sm:col-span-2">
                  <Textarea
                    value={nuevoCliente.notas}
                    onChange={(event) => updateNuevoCliente("notas", event.target.value)}
                    placeholder="Notas del cliente"
                    disabled={crearClienteSaving}
                  />
                </FieldShell>
              </div>

              {crearClienteError && (
                <div className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-4 py-3 text-sm text-[var(--sg-danger)]">
                  {crearClienteError}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[var(--sg-divider)] px-5 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={closeNuevoClienteModal}
                disabled={crearClienteSaving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleCrearCliente}
                disabled={crearClienteSaving}
              >
                {crearClienteSaving ? "Creando..." : "Crear cliente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
