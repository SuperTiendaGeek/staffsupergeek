"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/tecnicos/layout/AppShell";
import { Button, FieldShell, Input, Textarea } from "@/components/tecnicos/ui";

type ClienteDetalle = {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string;
  direccion: string;
  notas: string | null;
  numeroOrdenes: number | null;
  ultimaFechaIngreso: string;
  ordenesRelacionadas: string[];
};

type OrdenCliente = {
  recordId: string;
  idVisible: string;
  equipo: string;
  fechaIngreso: string;
  estadoActual: string;
};

type ClienteForm = {
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string;
  direccion: string;
  notas: string;
};

type NuevaOrdenForm = {
  equipo: string;
  accesorios: string;
  ingresaPor: string;
};

const emptyClienteForm: ClienteForm = {
  nombre: "",
  cedula: "",
  telefono: "",
  correo: "",
  direccion: "",
  notas: "",
};

const emptyNuevaOrdenForm: NuevaOrdenForm = {
  equipo: "",
  accesorios: "",
  ingresaPor: "",
};

const finalOrderStates = new Set([
  "Completado",
  "Finalizado Entregado",
  "Enviado a Reciclaje",
]);

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

const buildWhatsAppLink = (telefono?: string | null) => {
  if (!telefono) return null;
  const cleaned = telefono.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  let normalized = cleaned;
  if (normalized.startsWith("+")) normalized = normalized.slice(1);
  if (normalized.startsWith("0")) {
    normalized = `593${normalized.slice(1)}`;
  } else if (normalized.startsWith("593")) {
    normalized = normalized;
  }
  const digitsOnly = normalized.replace(/[^\d]/g, "");
  if (digitsOnly.length < 9) return null;
  return `https://wa.me/${digitsOnly}`;
};

const toClienteForm = (cliente: ClienteDetalle): ClienteForm => ({
  nombre: cliente.nombre ?? "",
  cedula: cliente.cedula ?? "",
  telefono: cliente.telefono ?? "",
  correo: cliente.correo ?? "",
  direccion: cliente.direccion ?? "",
  notas: cliente.notas ?? "",
});

const PencilIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 20h9" />
    <path d="m16.5 3.5 4 4L7 21H3v-4L16.5 3.5Z" />
  </svg>
);

const WhatsappIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.52 3.48A11.86 11.86 0 0 0 12.04 0C5.5.03.17 5.36.2 11.92c0 2.09.55 4.12 1.6 5.92L0 24l6.33-1.65A11.9 11.9 0 0 0 12 24h.05c6.56-.03 11.89-5.36 11.92-11.92.02-3.18-1.21-6.17-3.45-8.6ZM12 21.3h-.04a9.3 9.3 0 0 1-4.74-1.3l-.34-.2-3.76.98 1-3.67-.22-.38A9.25 9.25 0 0 1 2.7 12c-.03-5.13 4.13-9.31 9.26-9.33h.04c2.48 0 4.82.96 6.57 2.7a9.21 9.21 0 0 1 2.7 6.6c-.03 5.13-4.2 9.3-9.33 9.33Zm5.1-6.96c-.28-.14-1.65-.81-1.9-.91-.25-.09-.43-.14-.6.14-.17.28-.69.91-.85 1.1-.16.2-.31.21-.59.07-.28-.14-1.2-.44-2.28-1.41-.84-.75-1.4-1.67-1.57-1.95-.16-.28-.02-.43.12-.57.12-.12.28-.31.42-.46.14-.16.18-.28.28-.47.09-.2.05-.35-.02-.49-.07-.14-.6-1.45-.82-1.98-.22-.53-.44-.45-.6-.46l-.51-.01c-.17 0-.45.07-.68.35-.23.28-.89.87-.89 2.12 0 1.25.91 2.46 1.04 2.63.14.19 1.77 2.7 4.3 3.79.6.26 1.07.42 1.43.54.6.19 1.15.16 1.58.1.48-.07 1.48-.6 1.69-1.18.21-.57.21-1.06.14-1.17-.07-.1-.25-.17-.53-.31Z" />
  </svg>
);

const PlusIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    className={className}
  >
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

export default function ClienteDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [cliente, setCliente] = useState<ClienteDetalle | null>(null);
  const [ordenes, setOrdenes] = useState<OrdenCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<ClienteForm>(emptyClienteForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState<NuevaOrdenForm>(emptyNuevaOrdenForm);
  const [newOrderSaving, setNewOrderSaving] = useState(false);
  const [newOrderError, setNewOrderError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const whatsappLink = useMemo(() => buildWhatsAppLink(cliente?.telefono), [cliente?.telefono]);
  const finishedOrders = useMemo(
    () => ordenes.filter((orden) => finalOrderStates.has(orden.estadoActual)).length,
    [ordenes]
  );
  const activeOrders = useMemo(
    () => ordenes.filter((orden) => !finalOrderStates.has(orden.estadoActual)).length,
    [ordenes]
  );
  const latestOrder = ordenes[0] ?? null;
  const totalOrders = Math.max(ordenes.length, cliente?.numeroOrdenes ?? 0);
  const hasOrders = totalOrders > 0;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    const fetchCliente = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: ClienteDetalle;
          error?: string;
        };
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || "No se pudo cargar el cliente");
        }

        setCliente(json.data);
        setEditForm(toClienteForm(json.data));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchCliente();
    return () => controller.abort();
  }, [id, refreshKey]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    const fetchOrdenes = async () => {
      try {
        setOrdersLoading(true);
        setOrdersError(null);

        const res = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(id)}/ordenes`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as {
          success?: boolean;
          records?: OrdenCliente[];
          data?: OrdenCliente[];
          error?: string;
        };
        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudieron cargar las órdenes del cliente");
        }

        setOrdenes(json.records ?? json.data ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setOrdersError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        if (!controller.signal.aborted) {
          setOrdersLoading(false);
        }
      }
    };

    void fetchOrdenes();
    return () => controller.abort();
  }, [id, refreshKey]);

  const updateEditForm = (field: keyof ClienteForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateNewOrderForm = (field: keyof NuevaOrdenForm, value: string) => {
    setNewOrderForm((prev) => ({ ...prev, [field]: value }));
  };

  const closeEditModal = () => {
    if (editSaving) return;
    setEditOpen(false);
    setEditError(null);
    if (cliente) setEditForm(toClienteForm(cliente));
  };

  const closeNewOrderModal = () => {
    if (newOrderSaving) return;
    setNewOrderOpen(false);
    setNewOrderError(null);
    setNewOrderForm(emptyNuevaOrdenForm);
  };

  const handleSaveCliente = async () => {
    if (!id || editSaving) return;
    const nombre = editForm.nombre.trim();
    if (!nombre) {
      setEditError("El nombre del cliente es obligatorio.");
      return;
    }

    try {
      setEditSaving(true);
      setEditError(null);

      const res = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          cedula: editForm.cedula.trim(),
          telefono: editForm.telefono.trim(),
          correo: editForm.correo.trim(),
          direccion: editForm.direccion.trim(),
          notas: editForm.notas.trim(),
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: ClienteDetalle;
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "No se pudo actualizar el cliente");
      }

      setCliente(json.data);
      setEditForm(toClienteForm(json.data));
      setEditOpen(false);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setEditSaving(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!id || newOrderSaving) return;
    const equipo = newOrderForm.equipo.trim();
    const ingresaPor = newOrderForm.ingresaPor.trim();
    if (!equipo) {
      setNewOrderError("El equipo es obligatorio.");
      return;
    }
    if (!ingresaPor) {
      setNewOrderError("Ingresa Por es obligatorio.");
      return;
    }

    try {
      setNewOrderSaving(true);
      setNewOrderError(null);

      const res = await fetch("/api/tecnicos/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: id,
          orden: {
            equipo,
            accesorios: newOrderForm.accesorios.trim(),
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

      setNewOrderOpen(false);
      setNewOrderForm(emptyNuevaOrdenForm);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setNewOrderError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setNewOrderSaving(false);
    }
  };

  const handleDeleteCliente = async () => {
    if (!id || deleteSaving || hasOrders) return;

    try {
      setDeleteSaving(true);
      setDeleteError(null);

      const res = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo eliminar el cliente");
      }

      router.push("/tecnicos/clientes");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setDeleteSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Cliente" subtitle="Cargando datos del cliente" active="clientes">
        <section className="rounded-2xl border border-zinc-900/70 bg-[#181818] p-6 text-sm text-zinc-300 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
          Cargando cliente...
        </section>
      </AppShell>
    );
  }

  if (error || !cliente) {
    return (
      <AppShell title="Cliente" subtitle="No se pudo cargar el registro" active="clientes">
        <section className="space-y-4 rounded-2xl border border-zinc-900/70 bg-[#181818] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
          <p className="text-sm text-[var(--sg-danger)]">
            {error || "Cliente no encontrado"}
          </p>
          <Link
            href="/tecnicos/clientes"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-800 bg-[#151515] px-4 text-sm font-semibold text-zinc-200 transition hover:border-[#e3fc02] hover:text-[#e3fc02]"
          >
            Volver a clientes
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={cliente.nombre || "Cliente"}
      subtitle="Dashboard del cliente registrado en SUPER GEEK"
      active="clientes"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(300px,1.1fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-zinc-900/70 bg-[#181818] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-[#e3fc02]">Cliente</p>
                <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-white">
                  {cliente.nombre || "Cliente sin nombre"}
                </h2>
                {cliente.notas && (
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">{cliente.notas}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditOpen(true)}
                  leftIcon={<PencilIcon />}
                >
                  Editar cliente
                </Button>
                {whatsappLink && (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    className="sg-focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-5 text-sm font-semibold text-[var(--sg-text-primary)] transition hover:border-[var(--sg-lime)] hover:bg-[var(--sg-card-elevated)]"
                  >
                    <WhatsappIcon className="h-4 w-4 text-[var(--sg-lime)]" />
                    WhatsApp
                  </a>
                )}
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setNewOrderOpen(true)}
                  leftIcon={<PlusIcon />}
                >
                  Nueva orden
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[#151515] p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Teléfono</p>
                <p className="mt-2 truncate text-sm font-semibold text-zinc-100">
                  {cliente.telefono || "-"}
                </p>
              </div>
              <div className="rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[#151515] p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Cédula</p>
                <p className="mt-2 truncate text-sm font-semibold text-zinc-100">
                  {cliente.cedula || "-"}
                </p>
              </div>
              <div className="rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[#151515] p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Correo</p>
                <p className="mt-2 truncate text-sm font-semibold text-zinc-100" title={cliente.correo || "-"}>
                  {cliente.correo || "-"}
                </p>
              </div>
              <div className="rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[#151515] p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Dirección</p>
                <p className="mt-2 truncate text-sm font-semibold text-zinc-100" title={cliente.direccion || "-"}>
                  {cliente.direccion || "-"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-900/70 bg-[#181818] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <div className="grid overflow-hidden rounded-xl border border-[var(--sg-border)] bg-[#151515] sm:grid-cols-2 xl:grid-cols-4">
              <div className="border-b border-[var(--sg-divider)] p-4 sm:border-r xl:border-b-0">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Total de órdenes</p>
                <p className="mt-2 text-3xl font-extrabold text-[#e3fc02]">{totalOrders}</p>
              </div>
              <div className="border-b border-[var(--sg-divider)] p-4 xl:border-r xl:border-b-0">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Órdenes activas</p>
                <p className="mt-2 text-3xl font-extrabold text-white">{activeOrders}</p>
              </div>
              <div className="border-b border-[var(--sg-divider)] p-4 sm:border-r sm:border-b-0">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Finalizadas</p>
                <p className="mt-2 text-3xl font-extrabold text-[var(--sg-success)]">
                  {finishedOrders}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Última orden</p>
                <p className="mt-2 text-lg font-extrabold text-white">
                  {formatDate(latestOrder?.fechaIngreso || cliente.ultimaFechaIngreso)}
                </p>
                {latestOrder && (
                  <p className="mt-1 text-xs text-zinc-500">{latestOrder.idVisible}</p>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-zinc-900/70 bg-[#181818] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Historial</p>
                <h3 className="text-xl font-extrabold text-white">Órdenes vinculadas</h3>
              </div>
              <p className="text-xs text-zinc-500">{ordenes.length} registros cargados</p>
            </div>

            {ordersLoading && <p className="text-sm text-zinc-300">Cargando órdenes...</p>}
            {ordersError && (
              <p className="text-sm text-[var(--sg-danger)]">
                Ocurrió un problema al cargar las órdenes: {ordersError}
              </p>
            )}

            {!ordersLoading && !ordersError && (
              <>
                {ordenes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--sg-border)] bg-[#151515] px-4 py-6 text-sm text-zinc-300">
                    Este cliente aún no tiene órdenes registradas.
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto rounded-xl border border-zinc-900/80 bg-[#151515]">
                    <div className="grid min-w-[760px] grid-cols-[100px_minmax(0,1.8fr)_minmax(130px,0.9fr)_minmax(140px,0.9fr)_100px] border-b border-zinc-900/80 bg-[#0f0f0f]/70 px-6 py-3 text-[12px] uppercase tracking-wide text-zinc-500">
                      <span>ID</span>
                      <span>Equipo</span>
                      <span>Fecha de ingreso</span>
                      <span>Estado actual</span>
                      <span className="text-right">Acción</span>
                    </div>
                    <div className="divide-y divide-zinc-900/80">
                      {ordenes.map((orden, idx) => (
                        <div
                          key={orden.recordId}
                          className={`grid min-w-[760px] grid-cols-[100px_minmax(0,1.8fr)_minmax(130px,0.9fr)_minmax(140px,0.9fr)_100px] items-center px-6 py-3 text-sm text-zinc-200 transition ${
                            idx % 2 === 0 ? "bg-[#161616]" : "bg-[#1a1a1a]"
                          } hover:bg-[#1d1d1d]`}
                        >
                          <span className="truncate font-semibold text-zinc-100">{orden.idVisible}</span>
                          <span className="truncate text-zinc-300">{orden.equipo || "Sin equipo"}</span>
                          <span className="text-zinc-400">{formatDate(orden.fechaIngreso)}</span>
                          <span>
                            <span className="inline-block rounded-full border border-[#e3fc02] bg-[#e3fc02]/10 px-3 py-1 text-[12px] font-semibold text-[#e3fc02]">
                              {orden.estadoActual || "Sin estado"}
                            </span>
                          </span>
                          <span className="flex justify-end">
                            <Link
                              href={`/tecnicos/ordenes/${encodeURIComponent(orden.recordId)}`}
                              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-semibold text-white transition hover:border-[#e3fc02] hover:text-[#e3fc02]"
                            >
                              Ver orden
                            </Link>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-zinc-900/70 bg-[#181818] p-4 shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
            <p className="text-sm font-semibold text-white">Acciones rápidas</p>
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => setNewOrderOpen(true)}
              leftIcon={<PlusIcon />}
            >
              Nueva orden
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setEditOpen(true)}
              leftIcon={<PencilIcon />}
            >
              Editar cliente
            </Button>
            <Button
              type="button"
              variant="danger"
              className="w-full"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              Eliminar cliente
            </Button>
          </div>

          <div className="space-y-2 rounded-2xl border border-zinc-900/70 bg-[#181818] p-4 shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
            <p className="text-sm font-semibold text-white">Conservación de historial</p>
            <p className="text-sm leading-6 text-zinc-300">
              Los clientes con órdenes vinculadas quedan protegidos contra eliminación para mantener trazabilidad.
            </p>
          </div>
        </aside>
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[var(--sg-radius-lg)] border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--sg-divider)] px-5 py-4">
              <div>
                <h3 className="text-xl font-extrabold text-[var(--sg-text-primary)]">
                  Editar cliente
                </h3>
                <p className="mt-1 text-sm leading-6 text-[var(--sg-text-secondary)]">
                  Actualiza los datos registrados en Airtable.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={closeEditModal}
                disabled={editSaving}
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
                    value={editForm.nombre}
                    onChange={(event) => updateEditForm("nombre", event.target.value)}
                    placeholder="Nombre del cliente"
                    disabled={editSaving}
                  />
                </FieldShell>
                <FieldShell label="Cédula">
                  <Input
                    value={editForm.cedula}
                    onChange={(event) => updateEditForm("cedula", event.target.value)}
                    placeholder="Cédula o identificación"
                    disabled={editSaving}
                  />
                </FieldShell>
                <FieldShell label="Teléfono" hint="Recomendado">
                  <Input
                    value={editForm.telefono}
                    onChange={(event) => updateEditForm("telefono", event.target.value)}
                    placeholder="Teléfono"
                    disabled={editSaving}
                  />
                </FieldShell>
                <FieldShell label="Correo">
                  <Input
                    type="email"
                    value={editForm.correo}
                    onChange={(event) => updateEditForm("correo", event.target.value)}
                    placeholder="Correo"
                    disabled={editSaving}
                  />
                </FieldShell>
                <FieldShell label="Dirección" className="sm:col-span-2">
                  <Input
                    value={editForm.direccion}
                    onChange={(event) => updateEditForm("direccion", event.target.value)}
                    placeholder="Dirección"
                    disabled={editSaving}
                  />
                </FieldShell>
                <FieldShell label="Notas" className="sm:col-span-2">
                  <Textarea
                    value={editForm.notas}
                    onChange={(event) => updateEditForm("notas", event.target.value)}
                    placeholder="Notas del cliente"
                    disabled={editSaving}
                  />
                </FieldShell>
              </div>

              {editError && (
                <div className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-4 py-3 text-sm text-[var(--sg-danger)]">
                  {editError}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[var(--sg-divider)] px-5 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={closeEditModal} disabled={editSaving}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" onClick={handleSaveCliente} disabled={editSaving}>
                {editSaving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {newOrderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[var(--sg-radius-lg)] border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--sg-divider)] px-5 py-4">
              <div>
                <h3 className="text-xl font-extrabold text-[var(--sg-text-primary)]">
                  Nueva orden
                </h3>
                <p className="mt-1 text-sm leading-6 text-[var(--sg-text-secondary)]">
                  La orden quedará vinculada a {cliente.nombre}.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={closeNewOrderModal}
                disabled={newOrderSaving}
                aria-label="Cerrar modal"
                className="text-[var(--sg-text-secondary)]"
              >
                X
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldShell label="Equipo" className="sm:col-span-2">
                  <Input
                    value={newOrderForm.equipo}
                    onChange={(event) => updateNewOrderForm("equipo", event.target.value)}
                    placeholder="Equipo recibido"
                    disabled={newOrderSaving}
                  />
                </FieldShell>
                <FieldShell label="Accesorios">
                  <Input
                    value={newOrderForm.accesorios}
                    onChange={(event) => updateNewOrderForm("accesorios", event.target.value)}
                    placeholder="Accesorios recibidos"
                    disabled={newOrderSaving}
                  />
                </FieldShell>
                <FieldShell label="Ingresa Por">
                  <Input
                    value={newOrderForm.ingresaPor}
                    onChange={(event) => updateNewOrderForm("ingresaPor", event.target.value)}
                    placeholder="Técnico o canal de ingreso"
                    disabled={newOrderSaving}
                  />
                </FieldShell>
              </div>

              {newOrderError && (
                <div className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-4 py-3 text-sm text-[var(--sg-danger)]">
                  {newOrderError}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[var(--sg-divider)] px-5 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={closeNewOrderModal}
                disabled={newOrderSaving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleCreateOrder}
                disabled={newOrderSaving}
              >
                {newOrderSaving ? "Creando..." : "Crear orden"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-[560px] overflow-hidden rounded-[var(--sg-radius-lg)] border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl">
            <div className="border-b border-[var(--sg-divider)] px-5 py-4">
              <h3 className="text-xl font-extrabold text-[var(--sg-text-primary)]">
                Eliminar cliente
              </h3>
              <p className="mt-1 text-sm leading-6 text-[var(--sg-text-secondary)]">
                Esta acción solo está disponible para clientes sin órdenes registradas.
              </p>
            </div>

            <div className="space-y-4 px-5 py-5">
              {hasOrders ? (
                <div className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-warning)] bg-[var(--sg-warning-soft)] px-4 py-3 text-sm text-[var(--sg-warning)]">
                  Este cliente tiene órdenes registradas. Para conservar el historial, no se puede eliminar.
                </div>
              ) : (
                <p className="text-sm leading-6 text-zinc-300">
                  Confirma que deseas eliminar a {cliente.nombre}. Esta operación no se puede deshacer.
                </p>
              )}

              {deleteError && (
                <div className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-4 py-3 text-sm text-[var(--sg-danger)]">
                  {deleteError}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[var(--sg-divider)] px-5 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteSaving}
              >
                {hasOrders ? "Entendido" : "Cancelar"}
              </Button>
              {!hasOrders && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleDeleteCliente}
                  disabled={deleteSaving}
                >
                  {deleteSaving ? "Eliminando..." : "Eliminar cliente"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
