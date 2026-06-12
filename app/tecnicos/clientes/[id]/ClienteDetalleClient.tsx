"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
import { Button, FieldShell, Input, Textarea } from "@/components/tecnicos/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type ClienteField = "nombre" | "cedula" | "telefono" | "correo" | "direccion" | "notas";

type NuevaOrdenForm = {
  equipo: string;
  accesorios: string;
  ingresaPor: string;
};

const finalOrderStates = new Set(["Completado", "Finalizado Entregado", "Enviado a Reciclaje"]);

const formatDate = (value: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
};

const buildWhatsAppLink = (telefono?: string | null) => {
  if (!telefono) return null;
  const cleaned = telefono.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  let normalized = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  if (normalized.startsWith("0")) normalized = `593${normalized.slice(1)}`;
  const digits = normalized.replace(/[^\d]/g, "");
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}`;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const PencilIcon = ({ className = "h-3 w-3" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21H3v-4L16.5 3.5Z" />
  </svg>
);

const WhatsappIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.52 3.48A11.86 11.86 0 0 0 12.04 0C5.5.03.17 5.36.2 11.92c0 2.09.55 4.12 1.6 5.92L0 24l6.33-1.65A11.9 11.9 0 0 0 12 24h.05c6.56-.03 11.89-5.36 11.92-11.92.02-3.18-1.21-6.17-3.45-8.6ZM12 21.3h-.04a9.3 9.3 0 0 1-4.74-1.3l-.34-.2-3.76.98 1-3.67-.22-.38A9.25 9.25 0 0 1 2.7 12c-.03-5.13 4.13-9.31 9.26-9.33h.04c2.48 0 4.82.96 6.57 2.7a9.21 9.21 0 0 1 2.7 6.6c-.03 5.13-4.2 9.3-9.33 9.33Zm5.1-6.96c-.28-.14-1.65-.81-1.9-.91-.25-.09-.43-.14-.6.14-.17.28-.69.91-.85 1.1-.16.2-.31.21-.59.07-.28-.14-1.2-.44-2.28-1.41-.84-.75-1.4-1.67-1.57-1.95-.16-.28-.02-.43.12-.57.12-.12.28-.31.42-.46.14-.16.18-.28.28-.47.09-.2.05-.35-.02-.49-.07-.14-.6-1.45-.82-1.98-.22-.53-.44-.45-.6-.46l-.51-.01c-.17 0-.45.07-.68.35-.23.28-.89.87-.89 2.12 0 1.25.91 2.46 1.04 2.63.14.19 1.77 2.7 4.3 3.79.6.26 1.07.42 1.43.54.6.19 1.15.16 1.58.1.48-.07 1.48-.6 1.69-1.18.21-.57.21-1.06.14-1.17-.07-.1-.25-.17-.53-.31Z" />
  </svg>
);

const CheckIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ─── InlineEditField ──────────────────────────────────────────────────────────

function InlineEditField({
  label,
  value,
  onSave,
  placeholder = "—",
  multiline = false,
  required = false,
  large = false,
}: {
  label?: string;
  value: string;
  onSave: (v: string) => Promise<void>;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  large?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = multiline ? textareaRef.current : inputRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [editing, multiline]);

  const cancel = () => {
    setEditing(false);
    setDraft(value);
    setFieldError(null);
  };

  const commit = async () => {
    const trimmed = draft.trim();
    if (required && !trimmed) { setFieldError("Este campo es obligatorio."); return; }
    if (trimmed === (value ?? "").trim()) { setEditing(false); return; }
    try {
      setSaving(true);
      setFieldError(null);
      await onSave(trimmed);
      setEditing(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) { e.preventDefault(); void commit(); }
    if (e.key === "Escape") cancel();
  };

  const startEdit = () => {
    setDraft(value);
    setFieldError(null);
    setSavedOk(false);
    setEditing(true);
  };

  const sharedInputClass = `w-full rounded-md border border-[#e3fc02]/60 bg-[#0d0d0d] px-2.5 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-[#e3fc02]/15 placeholder:text-zinc-600 disabled:opacity-50`;

  return (
    <div>
      {label && (
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      )}

      {editing ? (
        <div>
          {multiline ? (
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commit()}
              onKeyDown={handleKeyDown}
              disabled={saving}
              rows={3}
              className={`${sharedInputClass} resize-none`}
            />
          ) : (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commit()}
              onKeyDown={handleKeyDown}
              disabled={saving}
              className={sharedInputClass}
            />
          )}
          <div className="mt-1 flex items-center gap-2">
            {saving && <span className="text-[10px] text-zinc-500">Guardando...</span>}
            {fieldError && <span className="text-[10px] text-[var(--sg-danger)]">{fieldError}</span>}
            {!saving && !fieldError && (
              <span className="text-[10px] text-zinc-600">Enter · Esc para cancelar</span>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          title="Clic para editar"
          className="group/btn flex w-full items-start gap-1.5 rounded-md border border-transparent px-1.5 py-1 text-left transition hover:border-zinc-800 hover:bg-zinc-900/60"
        >
          <span className={`flex-1 overflow-hidden text-sm ${large ? "font-bold text-white" : "font-medium text-zinc-100"}`}>
            {value || <span className="font-normal text-zinc-600">{placeholder}</span>}
          </span>
          {savedOk ? (
            <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-[var(--sg-success)]">
              <CheckIcon className="h-2.5 w-2.5" /> OK
            </span>
          ) : (
            <PencilIcon className="mt-0.5 h-3 w-3 shrink-0 text-zinc-700 opacity-0 transition group-hover/btn:opacity-100" />
          )}
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClienteDetalleClient() {
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

  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState<NuevaOrdenForm>({ equipo: "", accesorios: "", ingresaPor: "" });
  const [newOrderSaving, setNewOrderSaving] = useState(false);
  const [newOrderError, setNewOrderError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const whatsappLink = useMemo(() => buildWhatsAppLink(cliente?.telefono), [cliente?.telefono]);
  const finishedOrders = useMemo(() => ordenes.filter((o) => finalOrderStates.has(o.estadoActual)).length, [ordenes]);
  const activeOrders = useMemo(() => ordenes.filter((o) => !finalOrderStates.has(o.estadoActual)).length, [ordenes]);
  const latestOrder = ordenes[0] ?? null;
  const totalOrders = Math.max(ordenes.length, cliente?.numeroOrdenes ?? 0);
  const hasOrders = totalOrders > 0;

  // Fetch cliente
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(id)}`, { signal: controller.signal });
        const json = (await res.json()) as { success?: boolean; data?: ClienteDetalle; error?: string };
        if (!res.ok || !json.success || !json.data) throw new Error(json.error || "No se pudo cargar el cliente");
        setCliente(json.data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [id, refreshKey]);

  // Fetch ordenes del cliente
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const run = async () => {
      try {
        setOrdersLoading(true);
        setOrdersError(null);
        const res = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(id)}/ordenes`, { signal: controller.signal });
        const json = (await res.json()) as { success?: boolean; records?: OrdenCliente[]; data?: OrdenCliente[]; error?: string };
        if (!res.ok || !json.success) throw new Error(json.error || "No se pudieron cargar las órdenes");
        setOrdenes(json.records ?? json.data ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setOrdersError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        if (!controller.signal.aborted) setOrdersLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [id, refreshKey]);

  // Save a single field inline
  const saveField = async (field: ClienteField, newValue: string) => {
    if (!id || !cliente) throw new Error("No se pudo guardar");
    const payload = {
      nombre: cliente.nombre ?? "",
      cedula: cliente.cedula ?? "",
      telefono: cliente.telefono ?? "",
      correo: cliente.correo ?? "",
      direccion: cliente.direccion ?? "",
      notas: cliente.notas ?? "",
      [field]: newValue,
    };
    const res = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { success?: boolean; data?: ClienteDetalle; error?: string };
    if (!res.ok || !json.success || !json.data) throw new Error(json.error || "No se pudo actualizar");
    setCliente(json.data);
  };

  const handleCreateOrder = async () => {
    if (!id || newOrderSaving) return;
    const equipo = newOrderForm.equipo.trim();
    const ingresaPor = newOrderForm.ingresaPor.trim();
    if (!equipo) { setNewOrderError("El equipo es obligatorio."); return; }
    if (!ingresaPor) { setNewOrderError("Ingresa Por es obligatorio."); return; }
    try {
      setNewOrderSaving(true);
      setNewOrderError(null);
      const res = await fetch("/api/tecnicos/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId: id, orden: { equipo, accesorios: newOrderForm.accesorios.trim(), ingresaPor } }),
      });
      const json = (await res.json()) as { success?: boolean; ok?: boolean; error?: string };
      if (!res.ok || (!json.success && !json.ok)) throw new Error(json.error || "No se pudo crear la orden");
      setNewOrderOpen(false);
      setNewOrderForm({ equipo: "", accesorios: "", ingresaPor: "" });
      setRefreshKey((k) => k + 1);
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
      const res = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo eliminar el cliente");
      router.push("/tecnicos/clientes");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setDeleteSaving(false);
    }
  };

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.theme}>
        <div className="rounded-2xl border border-zinc-900/70 bg-[#181818] p-6 text-sm text-zinc-400">
          Cargando cliente...
        </div>
      </div>
    );
  }

  if (error || !cliente) {
    return (
      <div className={styles.theme}>
        <div className="space-y-4 rounded-2xl border border-zinc-900/70 bg-[#181818] p-6">
          <p className="text-sm text-[var(--sg-danger)]">{error || "Cliente no encontrado"}</p>
          <Link href="/tecnicos/clientes" className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-800 bg-[#151515] px-4 text-sm font-semibold text-zinc-200 transition hover:border-[#e3fc02] hover:text-[#e3fc02]">
            Volver a clientes
          </Link>
        </div>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className={`${styles.theme} grid gap-5 xl:grid-cols-[minmax(0,4fr)_minmax(270px,1fr)]`}>

      {/* ── Left column ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">

        {/* Client card */}
        <section className="rounded-2xl border border-zinc-900/70 bg-[#181818] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">

          {/* Name + actions */}
          <div className="mb-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#e3fc02]">Cliente</p>
              <InlineEditField
                value={cliente.nombre ?? ""}
                onSave={(v) => saveField("nombre", v)}
                required
                large
                placeholder="Sin nombre"
              />
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-[#1a1a1a] px-3 text-sm font-semibold text-zinc-200 transition hover:border-[var(--sg-lime)] hover:text-[var(--sg-lime)]"
                >
                  <WhatsappIcon className="h-3.5 w-3.5 text-[var(--sg-lime)]" />
                  WhatsApp
                </a>
              )}
              <button
                type="button"
                onClick={() => setNewOrderOpen(true)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e3fc02] bg-[#e3fc02] px-3 text-sm font-extrabold text-black transition hover:brightness-95"
              >
                + Nueva orden
              </button>
            </div>
          </div>

          {/* Fields grid */}
          <div className="grid gap-x-4 gap-y-2 rounded-lg border border-zinc-900/60 bg-[#141414] p-3 sm:grid-cols-2 xl:grid-cols-4">
            <InlineEditField label="Teléfono" value={cliente.telefono ?? ""} onSave={(v) => saveField("telefono", v)} placeholder="Sin teléfono" />
            <InlineEditField label="Cédula" value={cliente.cedula ?? ""} onSave={(v) => saveField("cedula", v)} placeholder="Sin cédula" />
            <InlineEditField label="Correo" value={cliente.correo ?? ""} onSave={(v) => saveField("correo", v)} placeholder="Sin correo" />
            <InlineEditField label="Dirección" value={cliente.direccion ?? ""} onSave={(v) => saveField("direccion", v)} placeholder="Sin dirección" />
          </div>

          {/* Notes */}
          <div className="mt-2 rounded-lg border border-zinc-900/60 bg-[#141414] p-3">
            <InlineEditField
              label="Notas"
              value={cliente.notas ?? ""}
              onSave={(v) => saveField("notas", v)}
              multiline
              placeholder="Sin notas. Clic para agregar..."
            />
          </div>
        </section>

        {/* Stats strip */}
        <section className="overflow-hidden rounded-2xl border border-zinc-900/70 bg-[#181818] shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
          <div className="grid divide-y divide-zinc-900/80 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
            <div className="p-3 xl:border-r xl:border-zinc-900/80">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Total de órdenes</p>
              <p className="mt-1 text-2xl font-extrabold text-[#e3fc02]">{totalOrders}</p>
            </div>
            <div className="p-3 xl:border-r xl:border-zinc-900/80">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Órdenes activas</p>
              <p className="mt-1 text-2xl font-extrabold text-white">{activeOrders}</p>
            </div>
            <div className="p-3 xl:border-r xl:border-zinc-900/80">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Finalizadas</p>
              <p className="mt-1 text-2xl font-extrabold text-[var(--sg-success)]">{finishedOrders}</p>
            </div>
            <div className="p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Última orden</p>
              <p className="mt-1 text-base font-extrabold text-white">
                {formatDate(latestOrder?.fechaIngreso || cliente.ultimaFechaIngreso)}
              </p>
              {latestOrder && <p className="text-[10px] text-zinc-500">{latestOrder.idVisible}</p>}
            </div>
          </div>
        </section>

        {/* Orders table */}
        <section className="space-y-3 rounded-2xl border border-zinc-900/70 bg-[#181818] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Historial</p>
              <h3 className="text-lg font-extrabold text-white">Órdenes vinculadas</h3>
            </div>
            <p className="text-xs text-zinc-500">{ordenes.length} registros</p>
          </div>

          {ordersLoading && <p className="text-sm text-zinc-400">Cargando órdenes...</p>}
          {ordersError && <p className="text-sm text-[var(--sg-danger)]">{ordersError}</p>}

          {!ordersLoading && !ordersError && (
            ordenes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 bg-[#141414] px-4 py-6 text-sm text-zinc-500">
                Este cliente aún no tiene órdenes registradas.
              </div>
            ) : (
              <div className="w-full overflow-x-auto rounded-xl border border-zinc-900/80 bg-[#151515]">
                <div className="grid min-w-[700px] grid-cols-[100px_minmax(0,2fr)_130px_160px_100px] border-b border-zinc-900/80 bg-[#0f0f0f]/70 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  <span>ID</span><span>Equipo</span><span>Ingreso</span><span>Estado</span><span className="text-right">Acción</span>
                </div>
                <div className="divide-y divide-zinc-900/80">
                  {ordenes.map((orden, idx) => (
                    <div
                      key={orden.recordId}
                      className={`grid min-w-[700px] grid-cols-[100px_minmax(0,2fr)_130px_160px_100px] items-center px-5 py-3 text-sm transition ${idx % 2 === 0 ? "bg-[#161616]" : "bg-[#1a1a1a]"} hover:bg-[#1d1d1d]`}
                    >
                      <span className="truncate font-semibold text-zinc-100">{orden.idVisible}</span>
                      <span className="truncate text-zinc-300">{orden.equipo || "Sin equipo"}</span>
                      <span className="text-zinc-400">{formatDate(orden.fechaIngreso)}</span>
                      <span>
                        <span className="inline-flex rounded-full border border-[#e3fc02]/30 bg-[#e3fc02]/8 px-3 py-0.5 text-[11px] font-semibold text-[#e3fc02]">
                          {orden.estadoActual || "Sin estado"}
                        </span>
                      </span>
                      <span className="flex justify-end">
                        <Link href={`/tecnicos/ordenes/${encodeURIComponent(orden.recordId)}`} className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-semibold text-white transition hover:border-[#e3fc02] hover:text-[#e3fc02]">
                          Ver orden
                        </Link>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </section>
      </div>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="space-y-3">
        <div className="space-y-2 rounded-2xl border border-zinc-900/70 bg-[#181818] p-3 shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
          <p className="mb-2 text-sm font-semibold text-white">Acciones rápidas</p>
          <button
            type="button"
            onClick={() => setNewOrderOpen(true)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#e3fc02] bg-[#e3fc02] px-4 py-2.5 text-sm font-extrabold text-black transition hover:brightness-95"
          >
            + Nueva orden
          </button>
          <button
            type="button"
            onClick={() => { setDeleteError(null); setDeleteOpen(true); }}
            className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--sg-danger)] transition hover:border-[var(--sg-danger)] hover:bg-[var(--sg-danger-soft)]"
          >
            Eliminar cliente
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-900/70 bg-[#181818] p-3 shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
          <p className="text-sm font-semibold text-white">Conservación de historial</p>
          <p className="mt-1.5 text-sm leading-5 text-zinc-400">
            Los clientes con órdenes no pueden eliminarse para mantener trazabilidad.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-900/70 bg-[#181818] p-3 shadow-[0_14px_32px_rgba(0,0,0,0.4)]">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Edición inline</p>
          <p className="text-sm leading-5 text-zinc-400">
            Clic en cualquier campo para editarlo. Guarda con Enter o al salir del campo.
          </p>
        </div>
      </aside>

      {/* ── Modal: Nueva orden ───────────────────────────────────────────────── */}
      {newOrderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[var(--sg-radius-lg)] border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--sg-divider)] px-5 py-4">
              <div>
                <h3 className="text-lg font-extrabold text-[var(--sg-text-primary)]">Nueva orden</h3>
                <p className="mt-0.5 text-sm text-[var(--sg-text-secondary)]">La orden quedará vinculada a {cliente.nombre}.</p>
              </div>
              <button type="button" onClick={() => { if (!newOrderSaving) { setNewOrderOpen(false); setNewOrderError(null); setNewOrderForm({ equipo: "", accesorios: "", ingresaPor: "" }); } }} aria-label="Cerrar" className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200">✕</button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldShell label="Equipo" className="sm:col-span-2">
                  <Input value={newOrderForm.equipo} onChange={(e) => setNewOrderForm((p) => ({ ...p, equipo: e.target.value }))} placeholder="Equipo recibido" disabled={newOrderSaving} />
                </FieldShell>
                <FieldShell label="Accesorios">
                  <Input value={newOrderForm.accesorios} onChange={(e) => setNewOrderForm((p) => ({ ...p, accesorios: e.target.value }))} placeholder="Accesorios" disabled={newOrderSaving} />
                </FieldShell>
                <FieldShell label="Ingresa Por">
                  <Input value={newOrderForm.ingresaPor} onChange={(e) => setNewOrderForm((p) => ({ ...p, ingresaPor: e.target.value }))} placeholder="Técnico o canal" disabled={newOrderSaving} />
                </FieldShell>
              </div>
              {newOrderError && <div className="rounded-lg border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-4 py-3 text-sm text-[var(--sg-danger)]">{newOrderError}</div>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[var(--sg-divider)] px-5 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => { if (!newOrderSaving) { setNewOrderOpen(false); setNewOrderError(null); setNewOrderForm({ equipo: "", accesorios: "", ingresaPor: "" }); } }} disabled={newOrderSaving}>Cancelar</Button>
              <Button type="button" variant="primary" onClick={handleCreateOrder} disabled={newOrderSaving}>{newOrderSaving ? "Creando..." : "Crear orden"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Eliminar cliente ──────────────────────────────────────────── */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-[520px] overflow-hidden rounded-[var(--sg-radius-lg)] border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl">
            <div className="border-b border-[var(--sg-divider)] px-5 py-4">
              <h3 className="text-lg font-extrabold text-[var(--sg-text-primary)]">Eliminar cliente</h3>
              <p className="mt-0.5 text-sm text-[var(--sg-text-secondary)]">Solo disponible para clientes sin órdenes registradas.</p>
            </div>
            <div className="space-y-3 px-5 py-5">
              {hasOrders ? (
                <div className="rounded-lg border border-[var(--sg-warning)] bg-[var(--sg-warning-soft)] px-4 py-3 text-sm text-[var(--sg-warning)]">
                  Este cliente tiene órdenes registradas. No se puede eliminar para conservar el historial.
                </div>
              ) : (
                <p className="text-sm leading-6 text-zinc-300">
                  ¿Confirmas eliminar a <strong className="text-white">{cliente.nombre}</strong>? Esta operación no se puede deshacer.
                </p>
              )}
              {deleteError && <div className="rounded-lg border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-4 py-3 text-sm text-[var(--sg-danger)]">{deleteError}</div>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[var(--sg-divider)] px-5 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteSaving}>{hasOrders ? "Entendido" : "Cancelar"}</Button>
              {!hasOrders && (
                <Button type="button" variant="danger" onClick={handleDeleteCliente} disabled={deleteSaving}>{deleteSaving ? "Eliminando..." : "Eliminar cliente"}</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
