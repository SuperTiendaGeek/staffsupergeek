"use client";

import { useEffect, useState } from "react";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
import { Button, FieldShell, Input, Textarea } from "@/components/tecnicos/ui";
import { VistasOrdenes } from "@/components/tecnicos/ordenes/lista/VistasOrdenes";
import { MotivosSelector } from "@/components/tecnicos/motivos/MotivosSelector";
import type { MotivoCorto } from "@/lib/tecnicos/motivos/reglas";

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

const emptyNuevoCliente: NuevoClienteForm = {
  nombre: "",
  cedula: "",
  telefono: "",
  correo: "",
  direccion: "",
  notas: "",
};

export function OrdenesPageClient() {
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
  // Rediseño R7: el motivo de ingreso son chips; «Cliente dice» queda en «Ingresa Por».
  const [ordenMotivos, setOrdenMotivos] = useState<MotivoCorto[]>([]);
  const [ordenClienteDice, setOrdenClienteDice] = useState("");
  const [ordenContrasena, setOrdenContrasena] = useState("");
  const [crearOrdenIntento, setCrearOrdenIntento] = useState(false);
  const [crearOrdenError, setCrearOrdenError] = useState<string | null>(null);
  const [crearOrdenDuplicado, setCrearOrdenDuplicado] = useState<ClienteBusqueda | null>(null);
  const [crearOrdenSaving, setCrearOrdenSaving] = useState(false);

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


  const resetNuevaOrdenForm = () => {
    setClienteSearch("");
    setClienteResults([]);
    setClientesError(null);
    setSelectedCliente(null);
    setShowNuevoCliente(false);
    setNuevoCliente(emptyNuevoCliente);
    setOrdenEquipo("");
    setOrdenAccesorios("");
    setOrdenMotivos([]);
    setOrdenClienteDice("");
    setOrdenContrasena("");
    setCrearOrdenIntento(false);
    setCrearOrdenError(null);
    setCrearOrdenDuplicado(null);
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
    setCrearOrdenIntento(true);
    if (!ordenMotivos.length) {
      setCrearOrdenError("Elige al menos un motivo de ingreso.");
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
            motivoIds: ordenMotivos.map((m) => m.id),
            clienteDice: ordenClienteDice.trim(),
            contrasena: ordenContrasena.trim(),
          },
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        ok?: boolean;
        error?: string;
        data?: ClienteBusqueda;
      };

      if (res.status === 409 && json.data) {
        setCrearOrdenDuplicado(json.data);
        setCrearOrdenError(json.error || "Ya existe un cliente registrado con esta cédula.");
        return;
      }

      if (!res.ok || (!json.success && !json.ok)) {
        throw new Error(json.error || "No se pudo crear la orden");
      }

      setOpenNuevaOrdenModal(false);
      resetNuevaOrdenForm();
      // La orden nueva aparece en el tablero (se relee la lista de abiertas).
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      setCrearOrdenError(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setCrearOrdenSaving(false);
    }
  };

  return (
    <div className={styles.theme}>
      {/* Rediseño R8: tablero por etapas, Lista con bandejas y Cobros bajo demanda. */}
      <VistasOrdenes onNuevaOrden={() => setOpenNuevaOrdenModal(true)} refresco={refreshKey} />

      {openNuevaOrdenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-[var(--sg-radius-lg)] border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--sg-divider)] px-4 py-3">
              <div>
                <h3 className="text-lg font-extrabold text-[var(--sg-text-primary)]">
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

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
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
                  <FieldShell label="Contraseña del equipo">
                    <Input
                      value={ordenContrasena}
                      onChange={(event) => setOrdenContrasena(event.target.value)}
                      placeholder="Opcional · queda oculta en la ficha"
                      autoComplete="off"
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
                  {/* Rediseño R7 (tablero 7): chips + buscador; si no existe, se crea con la revisión «¿Es lo mismo que…?». */}
                  {/* No va dentro de <label>: tiene varios botones (un label los «clickearía»). */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <span className="block text-sm font-semibold text-[var(--sg-text-secondary)]">
                      Motivo de ingreso <span className="text-[#FF7A70]">*</span>
                    </span>
                    <MotivosSelector valor={ordenMotivos} onCambio={setOrdenMotivos} invalido={crearOrdenIntento} deshabilitado={crearOrdenSaving} />
                  </div>
                  <FieldShell label="Cliente dice" className="sm:col-span-2">
                    <Input
                      value={ordenClienteDice}
                      onChange={(event) => setOrdenClienteDice(event.target.value)}
                      placeholder="Opcional · sus palabras, tal cual"
                      disabled={crearOrdenSaving}
                    />
                  </FieldShell>
                </div>
              </section>

              {crearOrdenError && (
                <div className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-4 py-3 text-sm text-[var(--sg-danger)]">
                  <p>{crearOrdenError}</p>
                  {crearOrdenDuplicado && (
                    <div className="mt-3 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-bg)] p-3 text-[var(--sg-text-primary)]">
                      <p className="font-semibold">{crearOrdenDuplicado.nombre}</p>
                      {crearOrdenDuplicado.cedula && <p className="mt-0.5 text-[var(--sg-text-secondary)]">CI: {crearOrdenDuplicado.cedula}</p>}
                      {crearOrdenDuplicado.telefono && <p className="text-[var(--sg-text-secondary)]">{crearOrdenDuplicado.telefono}</p>}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCliente(crearOrdenDuplicado);
                          setShowNuevoCliente(false);
                          setCrearOrdenError(null);
                          setCrearOrdenDuplicado(null);
                        }}
                        className="mt-2 inline-flex rounded-full border border-[var(--sg-lime)] bg-[var(--sg-lime)] px-3 py-1.5 text-xs font-bold text-[var(--sg-text-on-accent)] transition hover:brightness-105"
                      >
                        Usar este cliente
                      </button>
                    </div>
                  )}
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
    </div>
  );
}
