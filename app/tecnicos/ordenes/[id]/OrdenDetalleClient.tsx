"use client";

import { ElegirPagoDeUna } from "@/components/pagos-en-linea/ElegirPagoDeUna";
import { isAdministratorRole } from "@/lib/apps";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
import { OrdenDocumentosCard } from "@/components/tecnicos/OrdenDocumentosCard";
import OrdenCotizacionCard from "@/components/tecnicos/OrdenCotizacionCard";
import { ESTADOS_ORDEN, EstadoOrden } from "@/types/tecnicos";
import { StatusFilterDropdown } from "@/components/tecnicos/ui/StatusFilterDropdown";
import { getAbandonmentStatus } from "@/lib/tecnicos/orders/abandonmentPolicy";
import { buildAbandonmentWhatsAppMessage } from "@/lib/tecnicos/orders/abandonmentWhatsApp";
import { buildWhatsAppUrl } from "@/lib/tecnicos/whatsapp";
import { CuentaCard } from "@/components/cuenta/CuentaCard";
import { AsistentePanel, type Pestana } from "@/components/asistente/AsistentePanel";
import { GuardarSolucionCard } from "@/components/asistente/GuardarSolucionCard";
import { Destello } from "@/components/asistente/ui";
import type { DocumentoCuenta } from "@/lib/estado-cuenta/tarjeta";
import { PresupuestoCard } from "@/components/tecnicos/ordenes/PresupuestoCard";
import type { CuentaUnificada } from "@/types/cuenta-unificada";
import { METODOS_COBRO_NUEVO, esMetodoCobroNuevoValido, etiquetaMetodoPago, requiereNumeroTransaccion } from "@/types/abonos";
import { METODO_SALDO_A_FAVOR, maximoUsable } from "@/lib/saldo-favor/reglas";
import { ImprimirEtiquetaMantenimientoModal } from "@/components/print/ImprimirEtiquetaMantenimientoModal";
import { EntregarClientePanel } from "@/components/tecnicos/ordenes/EntregarClientePanel";
import { RegresoEquipoDialog } from "@/components/tecnicos/ordenes/RegresoEquipoDialog";
import { desplazar } from "@/components/tecnicos/desplazar";
import { ActividadCard } from "@/components/tecnicos/ordenes/ActividadCard";
import { EquipoFicha } from "@/components/tecnicos/ordenes/EquipoFicha";
import { ReabrirOrdenDialog } from "@/components/tecnicos/ordenes/ReabrirOrdenDialog";
import { esOrdenCerrada } from "@/lib/tecnicos/regreso/reglas";
import { ResponsableSelector } from "@/components/tecnicos/ordenes/ResponsableSelector";
import { MotivoIngresoCard } from "@/components/tecnicos/motivos/MotivoIngresoCard";
import { AlertaFranja } from "@/components/tecnicos/alertas/AlertaFranja";
import { avisarCambioAlertas } from "@/components/tecnicos/alertas/tipos";
import { debeProponerMantenimiento, type MotivoCorto } from "@/lib/tecnicos/motivos/reglas";
import { OrdenEtapas } from "@/components/tecnicos/ordenes/OrdenEtapas";
import { Desplegable, OPCION_MENU } from "@/components/tecnicos/ordenes/Desplegable";
import { diasEnTaller, fechaCorta, pasosDeLaOrden, queSigue, type ResumenPresupuesto } from "@/lib/tecnicos/orden/etapas";
import { avisoAbonoDeMas } from "@/lib/cobros/aviso-abono";

type HistorialItem = {
  id: string;
  fecha: string;
  estadoNuevo: string;
  tecnicoNombre: string | null;
  nota: string | null;
  estadoGeneradoIA?: string | null;
  solicitarMensajeCliente?: boolean;
  creadoPorNombre?: string | null;
  creadoPorEmail?: string | null;
  creadoPorUsuarioId?: string | null;
};

type RepuestoItem = {
  id: string;
  repuestoNombre: string;
  cantidad: number | null;
  precioCliente: number | null;
  subtotalCliente: number | null;
  costoProveedor: number | null;
  proveedor: string | null;
  observacion: string | null;
};

type ServicioItem = {
  id: string;
  servicioNombre: string;
  costo: number | null;
  observacion: string | null;
};

type AbonoItem = {
  comprobantes: {
    id: string | null;
    url: string;
    filename: string | null;
    contentType: string | null;
    size: number | null;
    thumbnailUrl: string | null;
  }[];
  id: string;
  idAbono: string | null;
  fecha: string | null;
  monto: number | null;
  metodoPago: string | null;
  estado: string;
  numeroTransaccion: string | null;
  observacion: string | null;
  registradoPor: string | null;
  comprobante: string | null;
};

type AbonoAdjuntoItem = AbonoItem["comprobantes"][number];

type OrdenDocumentoItem = AbonoAdjuntoItem;

type ProductoDigitalItem = {
  id: string;
  catalogoId: string | null;
  softwareProducto: string;
  marcaProducto: string | null;
  tipoProducto: string | null;
  portalActivacionCatalogo: string | null;
  estado: string;
  proveedor: string | null;
  costoProveedor: number | null;
  precioVenta: number | null;
  claveTruncada: string | null;
  usuarioCorreo: string | null;
  duracion: string | null;
  expira: string | null;
  fechaCompra: string | null;
  fechaUsoVenta: string | null;
  ordenReparacionId: string | null;
  tipoUso: string | null;
  usadoVendidoPor: string | null;
  documentoPdfUrl: string | null;
  documentoGeneradoPor: string | null;
  fechaUltimoPdf: string | null;
};

type OrdenDetalle = {
  /** Rediseño R1: cuándo se avisó al cliente que retire y cuándo se le envió el presupuesto. */
  clienteAvisado?: string | null;
  presupuestoEnviado?: string | null;
  /** Rediseño R6: de qué orden nace y qué regresos tuvo. */
  regreso?: { ordenAnteriorId: string | null; ordenAnteriorCodigo: string; tipo: string; regresos: Array<{ id: string; codigo: string }> };
  /** Entregar al cliente (punto 6). */
  entrega?: { fecha: string; retiradoPor: string; motivoSinCobro: string } | null;
  recordId: string;
  idVisible: string;
  estadoActual: string;
  fechaIngreso: string;
  ultimaModificacion: string;
  ingresaPor: string;
  tipoOrden: string;
  clienteNombre: string;
  clienteRecordId: string | null;
  cedula: string;
  telefono: string;
  equipo: string;
  accesorios: string;
  diagnosticoInicial: string;
  notaInterna: string;
  recomendaciones: string;
  costoTotalServiciosNV: number | null;
  costoTotalRepuestosNV: number | null;
  totalProductosDigitalesNV: number | null;
  totalAPagarNV: number | null;
  totalAbonadoNV: number | null;
  saldoNV: number | null;
  historial: HistorialItem[];
  repuestosPorOrden: RepuestoItem[];
  serviciosPorOrden: ServicioItem[];
  abonosPorOrden: AbonoItem[];
  productosDigitales: ProductoDigitalItem[];
  documentos: OrdenDocumentoItem[];
  cotizacionId: string;
  cotizacionCodigo: string;
  proximoMantenimiento: string;
};

const formatDate = (value?: string | null) => {
  if (!value) return "No disponible";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};


const parseNumberInput = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const todayDateInputValue = () => new Date().toISOString().slice(0, 10);
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type ApiResponsePayload = {
  success?: boolean;
  error?: string;
  warning?: string | null;
  data?: unknown;
};

const parseApiResponseSafely = async (res: Response): Promise<ApiResponsePayload | null> => {
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return (await res.json()) as ApiResponsePayload;
  } catch {
    return null;
  }
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

const extractFileExtension = (value: string | null | undefined) => {
  if (!value) return "";
  const cleaned = value.split(/[?#]/)[0];
  const dot = cleaned.lastIndexOf(".");
  if (dot === -1 || dot === cleaned.length - 1) return "";
  return cleaned.slice(dot + 1).toLowerCase();
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "text/plain": "txt",
  "application/zip": "zip",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractFilenameFromContentDisposition = (value: string | null) => {
  if (!value) return null;
  const filenameStarMatch = value.match(/filename\*\s*=\s*([^;]+)/i);
  if (filenameStarMatch?.[1]) {
    const raw = filenameStarMatch[1].trim().replace(/^UTF-8''/i, "").replace(/^"(.*)"$/, "$1");
    return safeDecodeURIComponent(raw);
  }
  const filenameMatch = value.match(/filename\s*=\s*([^;]+)/i);
  if (!filenameMatch?.[1]) return null;
  return filenameMatch[1].trim().replace(/^"(.*)"$/, "$1");
};

const extractFilenameFromUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const lastSegment = parsed.pathname.split("/").pop();
    return lastSegment ? safeDecodeURIComponent(lastSegment) : null;
  } catch {
    const withoutParams = value.split(/[?#]/)[0];
    const lastSlash = withoutParams.lastIndexOf("/");
    const fallback = lastSlash >= 0 ? withoutParams.slice(lastSlash + 1) : withoutParams;
    return fallback ? safeDecodeURIComponent(fallback) : null;
  }
};

const sanitizeFilename = (value: string) => value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();

const ensureFilenameExtension = (filename: string, mimeType: string | null) => {
  if (extractFileExtension(filename)) return filename;
  const normalizedMime = (mimeType ?? "").toLowerCase().split(";")[0].trim();
  const ext = MIME_EXTENSION_MAP[normalizedMime];
  return ext ? `${filename}.${ext}` : filename;
};

const resolveAttachmentDownloadName = ({
  attachment,
  fallbackFromHeader,
  mimeType,
}: {
  attachment: AbonoAdjuntoItem;
  fallbackFromHeader: string | null;
  mimeType: string | null;
}) => {
  const candidate =
    fallbackFromHeader?.trim() ||
    attachment.filename?.trim() ||
    extractFilenameFromUrl(attachment.url)?.trim() ||
    "comprobante";
  const sanitized = sanitizeFilename(candidate) || "comprobante";
  return ensureFilenameExtension(sanitized, mimeType || attachment.contentType);
};

const isImageAttachment = (attachment: {
  filename: string | null;
  contentType: string | null;
  url: string;
}) => {
  const mime = (attachment.contentType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const ext = extractFileExtension(attachment.filename) || extractFileExtension(attachment.url);
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"].includes(ext);
};

const isPdfAttachment = (attachment: {
  filename: string | null;
  contentType: string | null;
  url: string;
}) => {
  const mime = (attachment.contentType ?? "").toLowerCase();
  if (mime === "application/pdf") return true;
  const ext = extractFileExtension(attachment.filename) || extractFileExtension(attachment.url);
  return ext === "pdf";
};

const WhatsappIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.52 3.48A11.86 11.86 0 0 0 12.04 0C5.5.03.17 5.36.2 11.92c0 2.09.55 4.12 1.6 5.92L0 24l6.33-1.65A11.9 11.9 0 0 0 12 24h.05c6.56-.03 11.89-5.36 11.92-11.92.02-3.18-1.21-6.17-3.45-8.6ZM12 21.3h-.04a9.3 9.3 0 0 1-4.74-1.3l-.34-.2-3.76.98 1-3.67-.22-.38A9.25 9.25 0 0 1 2.7 12c-.03-5.13 4.13-9.31 9.26-9.33h.04c2.48 0 4.82.96 6.57 2.7a9.21 9.21 0 0 1 2.7 6.6c-.03 5.13-4.2 9.3-9.33 9.33Zm5.1-6.96c-.28-.14-1.65-.81-1.9-.91-.25-.09-.43-.14-.6.14-.17.28-.69.91-.85 1.1-.16.2-.31.21-.59.07-.28-.14-1.2-.44-2.28-1.41-.84-.75-1.4-1.67-1.57-1.95-.16-.28-.02-.43.12-.57.12-.12.28-.31.42-.46.14-.16.18-.28.28-.47.09-.2.05-.35-.02-.49-.07-.14-.6-1.45-.82-1.98-.22-.53-.44-.45-.6-.46l-.51-.01c-.17 0-.45.07-.68.35-.23.28-.89.87-.89 2.12 0 1.25.91 2.46 1.04 2.63.14.19 1.77 2.7 4.3 3.79.6.26 1.07.42 1.43.54.6.19 1.15.16 1.58.1.48-.07 1.48-.6 1.69-1.18.21-.57.21-1.06.14-1.17-.07-.1-.25-.17-.53-.31Z" />
  </svg>
);

const PrintIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M6 9V2h12v7" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <path d="M6 14h12v8H6z" />
    <path d="M8 18h8" />
  </svg>
);

const PhoneIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.67 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.28-1.24a2 2 0 0 1 2.11-.45c.9.32 1.84.54 2.8.67A2 2 0 0 1 22 16.92Z" />
  </svg>
);

const IdCardIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <circle cx="8" cy="12" r="2" />
    <path d="M13 10h4" />
    <path d="M13 14h4" />
  </svg>
);

const UsbIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M7 3h4v5H7z" />
    <path d="M9 8v5a3 3 0 0 0 3 3h2.5a3.5 3.5 0 0 1 3.5 3.5V21" />
    <path d="M18 21h3" />
    <path d="M19.5 18v3" />
    <path d="M9 13H6a3 3 0 0 0-3 3v3" />
    <path d="M3 19h3" />
  </svg>
);



// ─── Inline edit field ────────────────────────────────────────────────────────

function InlineEditField({
  value,
  onSave,
  placeholder = "—",
  multiline = false,
  required = false,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
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
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, [editing, multiline]);

  const cancel = () => { setEditing(false); setDraft(value); setFieldError(null); };

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

  const inputClass = "w-full rounded border border-[#D7FF4F]/60 bg-[var(--sg-panel)] px-2 py-1 text-sm text-[var(--sg-text-primary)] outline-none ring-1 ring-[#D7FF4F]/15 disabled:opacity-50";

  if (editing) {
    return (
      <div>
        {multiline ? (
          <textarea ref={textareaRef} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => void commit()} onKeyDown={handleKeyDown} disabled={saving} rows={2} className={`${inputClass} resize-none`} />
        ) : (
          <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => void commit()} onKeyDown={handleKeyDown} disabled={saving} className={inputClass} />
        )}
        {fieldError ? (
          <p className="mt-0.5 text-[10px] text-[var(--sg-danger)]">{fieldError}</p>
        ) : (
          <p className="mt-0.5 text-[10px] text-[var(--sg-text-muted)]">{saving ? "Guardando..." : "Enter · Esc para cancelar"}</p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value); setFieldError(null); setSavedOk(false); setEditing(true); }}
      title="Clic para editar"
      className="group/ef flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left transition hover:bg-[#2D2E2A]/60"
    >
      <span className="flex-1 text-sm font-semibold leading-snug text-[var(--sg-text-primary)]">
        {value || <span className="font-normal text-[var(--sg-text-muted)]">{placeholder}</span>}
      </span>
      {savedOk ? (
        <span className="mt-0.5 shrink-0 text-[10px] text-[var(--sg-success)]">✓</span>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-3 w-3 shrink-0 text-[var(--sg-text-muted)] opacity-0 transition group-hover/ef:opacity-60">
          <path d="M12 20h9" /><path d="m16.5 3.5 4 4L7 21H3v-4L16.5 3.5Z" />
        </svg>
      )}
    </button>
  );
}

// ─── Cabecera (rediseño R1) ────────────────────────────────────────────────────

const BTN_CABECERA = "inline-flex h-[30px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition disabled:opacity-50";
const BTN_PRINCIPAL = `${BTN_CABECERA} border-[var(--sg-lime)] bg-[var(--sg-lime)] text-[#151613] hover:brightness-95 animate-[sg-entrada_200ms_ease-out]`;
const BTN_SECUNDARIO = `${BTN_CABECERA} border-[#3A3A36] bg-[#252622] text-[#F0F0EC] hover:border-[var(--sg-lime)]`;

/** Color del selector de estado (el mismo código de color de las etapas). */
const COLOR_ESTADO: Record<string, string> = {
  Pendiente: "!border-[#4A4A45] !bg-[#2C2D29] !text-[#D6D6D0]",
  "En Proceso": "!border-[rgba(120,183,255,.45)] !bg-transparent !text-[#9CCBFF]",
  "Esperando Respuesta": "!border-[rgba(255,181,71,.45)] !bg-transparent !text-[#FFB547]",
  Completado: "!border-[rgba(86,227,164,.45)] !bg-transparent !text-[#56E3A4]",
};

// ─── Page component ───────────────────────────────────────────────────────────

export function OrdenDetalleClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  // Rediseño R6: la orden entregada queda cerrada; el regreso crea otra.
  const [regresoAbierto, setRegresoAbierto] = useState(false);
  // Rediseño R3: algo se anotó en la Actividad desde otra tarjeta (trabajos, asistente).
  const [actividadVersion, setActividadVersion] = useState(0);
  const [reabrirAbierto, setReabrirAbierto] = useState(false);
  const [orden, setOrden] = useState<OrdenDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estadoSeleccionado, setEstadoSeleccionado] = useState<string>("");
  const [estadoSaving, setEstadoSaving] = useState(false);
  // Entregar al cliente (auditoría ops, punto 6): el único camino a "Finalizado Entregado".
  const [entregaAbierta, setEntregaAbierta] = useState(false);
  const [estadoMessage, setEstadoMessage] = useState<string | null>(null);
  const [estadoError, setEstadoError] = useState<string | null>(null);
  // Cuenta unificada de repuestos (Fase 11 — Etapa 2).
  const [cuentaUnificada, setCuentaUnificada] = useState<CuentaUnificada | null>(null);
  // Punto 11: el documento vigente de la cuenta (lo trae la misma ruta de la cuenta).
  const [cuentaDocumento, setCuentaDocumento] = useState<DocumentoCuenta | null>(null);
  const [cuentaUnificadaLoading, setCuentaUnificadaLoading] = useState(false);
  const [cuentaUnificadaError, setCuentaUnificadaError] = useState<string | null>(null);
  const [showMantenimientoModal, setShowMantenimientoModal] = useState(false);
  const [abonoAdjuntoDeletingKey, setAbonoAdjuntoDeletingKey] = useState<string | null>(null);
  const [abonoAdjuntoError, setAbonoAdjuntoError] = useState<Record<string, string | null>>({});
  const [comprobanteViewer, setComprobanteViewer] = useState<{
    abonoId: string;
    attachment: AbonoAdjuntoItem;
  } | null>(null);
  const [comprobanteViewerLoading, setComprobanteViewerLoading] = useState(false);
  const [comprobanteViewerError, setComprobanteViewerError] = useState<string | null>(null);
  const [comprobanteViewerResolvedUrl, setComprobanteViewerResolvedUrl] = useState<string | null>(null);
  const [openAbonoModal, setOpenAbonoModal] = useState(false);
  const [abonoFecha, setAbonoFecha] = useState(todayDateInputValue);
  const [abonoMonto, setAbonoMonto] = useState("");
  const [abonoMetodoPago, setAbonoMetodoPago] = useState("");
  const [abonoNumeroTransaccion, setAbonoNumeroTransaccion] = useState("");
  const [abonoObservacion, setAbonoObservacion] = useState("");
  const [abonoComprobanteFile, setAbonoComprobanteFile] = useState<File | null>(null);
  const [abonoSaving, setAbonoSaving] = useState(false);
  const [abonoError, setAbonoError] = useState<string | null>(null);
  const [abonoMessage, setAbonoMessage] = useState<string | null>(null);
  const [bajaModalOpen, setBajaModalOpen] = useState(false);
  const [bajaSaving, setBajaSaving] = useState(false);
  const [bajaError, setBajaError] = useState<string | null>(null);
  const [userRol, setUserRol] = useState("");
  const [userNombre, setUserNombre] = useState("");
  // Asistente de la orden (punto 11B): se abre solo al tocar «Asistente».
  const [asistente, setAsistente] = useState<{ abierto: boolean; pestana: Pestana }>({ abierto: false, pestana: "orden" });
  // Recién pasó a Completado en esta pantalla: la IA propone guardar la solución.
  const [recienCompletado, setRecienCompletado] = useState(false);
  // Rediseño R1: resumen de los trabajos (lo da el presupuesto) para las etapas,
  // y «Avisar al cliente» de la cabecera pide el borrador a la Actividad.
  const [resumen, setResumen] = useState<ResumenPresupuesto | null>(null);
  const [pedirMensaje, setPedirMensaje] = useState(0);
  // Rediseño R10: «Anotar avance» de la franja de alerta.
  const [pedirNota, setPedirNota] = useState(0);
  // Rediseño R7: chips del motivo (para el Asistente y para proponer el próximo mantenimiento al entregar).
  const [motivosOrden, setMotivosOrden] = useState<MotivoCorto[]>([]);

  const abandonmentStatus = useMemo(
    () => (orden ? getAbandonmentStatus(orden) : getAbandonmentStatus({})),
    [orden]
  );
  const abandonmentWhatsAppUrl = useMemo(() => {
    if (!orden || abandonmentStatus.level === "none") return null;

    return buildWhatsAppUrl(
      orden.telefono,
      buildAbandonmentWhatsAppMessage(orden, abandonmentStatus)
    );
  }, [abandonmentStatus, orden]);

  type FetchDataOptions = {
    showLoading?: boolean;
    preserveError?: boolean;
  };

  const [datosVersion, setDatosVersion] = useState(0);

  const fetchData = async ({
    showLoading = true,
    preserveError = false,
  }: FetchDataOptions = {}): Promise<boolean> => {
    if (!id) return false;
    if (showLoading) setLoading(true);
    if (!preserveError) setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo cargar la orden");
      }
      setOrden(json.data);
      setEstadoSeleccionado(json.data?.estadoActual ?? ESTADOS_ORDEN[0]);
      // El presupuesto se vuelve a leer con este contador cada vez que la orden
      // se relee (p. ej. tras un abono o un cambio hecho fuera del presupuesto).
      setDatosVersion((v) => v + 1);
      return true;
    } catch (err) {
      if (!preserveError) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
      return false;
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const refreshOrdenDetalleFinanzas = async () => {
    await fetchData({ showLoading: false, preserveError: true });
    await loadCuentaUnificada();
    await wait(450);
    await fetchData({ showLoading: false, preserveError: true });
    await loadCuentaUnificada();
  };

  const resetAbonoForm = () => {
    setAbonoFecha(todayDateInputValue());
    setAbonoMonto("");
    setAbonoMetodoPago("");
    setAbonoNumeroTransaccion("");
    setAbonoObservacion("");
    setAbonoComprobanteFile(null);
    setAbonoError(null);
  };

  const loadCuentaUnificada = async () => {
    if (!id) return;
    setCuentaUnificadaLoading(true);
    setCuentaUnificadaError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(id)}/cuenta-unificada`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo cargar la cuenta unificada");
      }
      setCuentaUnificada(json.data as CuentaUnificada);
      setCuentaDocumento((json.documento as DocumentoCuenta | null | undefined) ?? null);
    } catch (err) {
      setCuentaUnificadaError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCuentaUnificadaLoading(false);
    }
  };

  // Auditoría ops, punto 13B: saldo a favor del cliente, para ofrecerlo como
  // método en "Registrar abono" (se lee al abrir el formulario).
  const [saldoAFavorCliente, setSaldoAFavorCliente] = useState(0);
  const cargarSaldoAFavorCliente = () => {
    if (!id) return;
    fetch(`/api/tecnicos/ordenes/${encodeURIComponent(id)}/saldo-favor`)
      .then((r) => r.json())
      .then((j) => setSaldoAFavorCliente(j?.success ? Number(j.data?.disponible) || 0 : 0))
      .catch(() => setSaldoAFavorCliente(0));
  };

  const handleGuardarAbono = async () => {
    if (!id || abonoSaving) return;

    const fecha = abonoFecha.trim();
    if (!fecha) {
      setAbonoError("La fecha del abono es obligatoria.");
      return;
    }

    const monto = parseNumberInput(abonoMonto);
    if (monto === null || monto <= 0) {
      setAbonoError("Ingresa un monto válido mayor a 0.");
      return;
    }

    const metodoPago = abonoMetodoPago.trim();
    if (!metodoPago) {
      setAbonoError("Selecciona un método de pago.");
      return;
    }
    // Pagar con el saldo a favor del cliente: no entra dinero nuevo, lo
    // registra el servidor del saldo a favor (valida disponible y pendiente).
    if (metodoPago === METODO_SALDO_A_FAVOR) {
      setAbonoSaving(true);
      setAbonoError(null);
      setAbonoMessage(null);
      try {
        const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(id)}/saldo-favor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "usar", monto }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "No se pudo usar el saldo a favor");
        setOpenAbonoModal(false);
        await refreshOrdenDetalleFinanzas();
        resetAbonoForm();
        setAbonoMessage(json.warning ? `Pago con saldo a favor registrado. ${json.warning}` : "Pago con saldo a favor registrado.");
      } catch (err) {
        setAbonoError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setAbonoSaving(false);
      }
      return;
    }
    if (!esMetodoCobroNuevoValido(metodoPago)) {
      setAbonoError("El método de pago seleccionado no es válido.");
      return;
    }
    if (requiereNumeroTransaccion(metodoPago) && !abonoNumeroTransaccion.trim()) {
      setAbonoError(`El número de transacción es obligatorio para el método "${metodoPago}".`);
      return;
    }

    setAbonoSaving(true);
    setAbonoError(null);
    setAbonoMessage(null);
    try {
      const formData = new FormData();
      formData.set("fecha", fecha);
      formData.set("monto", String(monto));
      formData.set("metodoPago", metodoPago);
      formData.set("numeroTransaccion", abonoNumeroTransaccion.trim());
      formData.set("observacion", abonoObservacion.trim());
      formData.set("comprobante", "");
      if (abonoComprobanteFile) {
        formData.set("comprobanteArchivo", abonoComprobanteFile);
      }

      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(id)}/abonos`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo registrar el abono");
      }

      setOpenAbonoModal(false);
      await refreshOrdenDetalleFinanzas();
      resetAbonoForm();
      setAbonoMessage(
        typeof json.warning === "string" && json.warning.trim()
          ? `Abono registrado. ${json.warning}`
          : "Abono registrado correctamente."
      );
    } catch (err) {
      setAbonoError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAbonoSaving(false);
    }
  };

  const replaceAbonoInState = (updatedAbono: AbonoItem) => {
    setOrden((prev) =>
      prev
        ? {
            ...prev,
            abonosPorOrden: (prev.abonosPorOrden ?? []).map((item) =>
              item.id === updatedAbono.id ? { ...item, ...updatedAbono } : item
            ),
          }
        : prev
    );
  };

  const openComprobanteViewer = (abonoId: string, attachment: AbonoAdjuntoItem) => {
    setComprobanteViewer({ abonoId, attachment });
    setComprobanteViewerLoading(true);
    setComprobanteViewerError(null);
    setComprobanteViewerResolvedUrl(null);
  };

  const closeComprobanteViewer = () => {
    setComprobanteViewer(null);
    setComprobanteViewerLoading(false);
    setComprobanteViewerError(null);
    setComprobanteViewerResolvedUrl(null);
  };

  const downloadAttachment = async (attachment: AbonoAdjuntoItem) => {
    let objectUrl: string | null = null;
    let link: HTMLAnchorElement | null = null;

    try {
      const res = await fetch(attachment.url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`No se pudo descargar el archivo (${res.status}).`);
      }

      const blob = await res.blob();
      const filenameFromHeader = extractFilenameFromContentDisposition(
        res.headers.get("content-disposition")
      );
      const contentType = res.headers.get("content-type") || blob.type || attachment.contentType;
      const downloadName = resolveAttachmentDownloadName({
        attachment,
        fallbackFromHeader: filenameFromHeader,
        mimeType: contentType || null,
      });

      objectUrl = URL.createObjectURL(blob);
      link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
    } catch (error) {
      console.error("No se pudo descargar el comprobante:", error);
    } finally {
      if (link && link.parentNode) {
        link.parentNode.removeChild(link);
      }
      if (objectUrl) {
        const urlToRevoke = objectUrl;
        setTimeout(() => URL.revokeObjectURL(urlToRevoke), 0);
      }
    }
  };

  const handleEliminarComprobanteAbono = async (abonoId: string, attachment: AbonoAdjuntoItem) => {
    if (!attachment.id) {
      setAbonoAdjuntoError((prev) => ({
        ...prev,
        [abonoId]: "No se pudo identificar el adjunto para eliminarlo.",
      }));
      return;
    }

    const deletionKey = `${abonoId}:${attachment.id}`;
    setAbonoAdjuntoError((prev) => ({ ...prev, [abonoId]: null }));
    setAbonoAdjuntoDeletingKey(deletionKey);

    try {
      const res = await fetch(
        `/api/tecnicos/abonos-por-orden/${encodeURIComponent(abonoId)}/comprobantes?attachmentId=${encodeURIComponent(
          attachment.id
        )}`,
        { method: "DELETE" }
      );
      const payload = await parseApiResponseSafely(res);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.trim() || "No se pudo eliminar el comprobante");
      }

      replaceAbonoInState(payload.data as AbonoItem);
      void loadCuentaUnificada();
      setAbonoMessage("Comprobante eliminado correctamente.");
      if (comprobanteViewer?.attachment.id === attachment.id) {
        closeComprobanteViewer();
      }
    } catch (err) {
      setAbonoAdjuntoError((prev) => ({
        ...prev,
        [abonoId]: err instanceof Error ? err.message : "Error desconocido",
      }));
    } finally {
      setAbonoAdjuntoDeletingKey(null);
    }
  };

  // Abre el cobro con el saldo ya puesto (se puede cambiar para pagos en
  // varias partes). Lo usan la tarjeta Cuenta y el Asistente.
  const abrirRegistrarPago = () => {
    setAbonoError(null);
    setAbonoMessage(null);
    const saldo = cuentaUnificada?.saldo ?? 0;
    if (saldo > 0) setAbonoMonto(saldo.toFixed(2));
    cargarSaldoAFavorCliente();
    setOpenAbonoModal(true);
  };

  const handleEstadoChange = async (nuevoEstado: EstadoOrden) => {
    if (!orden || estadoSaving) return;
    if (nuevoEstado === orden.estadoActual) {
      setEstadoMessage(null);
      setEstadoError(null);
      return;
    }

    const previousEstado = orden.estadoActual;
    setEstadoSeleccionado(nuevoEstado);
    setEstadoSaving(true);
    setEstadoMessage("Guardando...");
    setEstadoError(null);

    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo actualizar el estado");
      }

      setOrden((prev) =>
        prev
          ? {
              ...prev,
              estadoActual: nuevoEstado,
              historial: json.data?.historial
                ? [...prev.historial, json.data.historial]
                : prev.historial,
            }
          : prev
      );
      if (nuevoEstado === "Completado") setRecienCompletado(true);
      // Garantía SUPER GEEK (punto 20): la pieza salió o volvió al inventario.
      const g = json.data?.garantias as { salidas?: string[]; vueltas?: string[]; reclamos?: string[]; avisos?: string[] } | undefined;
      const partes = [
        g?.salidas?.length ? `salió por garantía: ${g.salidas.join(", ")}` : "",
        g?.vueltas?.length ? `vuelve apartada: ${g.vueltas.join(", ")}` : "",
        g?.reclamos?.length ? `pieza retirada al reclamo: ${g.reclamos.join(", ")}` : "",
      ].filter(Boolean);
      if (g?.avisos?.length) setEstadoError(g.avisos.join(" "));
      setEstadoMessage(partes.length ? `Estado guardado · ${partes.join(" · ")}` : "Estado guardado");
      setTimeout(() => setEstadoMessage(null), partes.length ? 4000 : 1200);
    } catch (err) {
      setEstadoSeleccionado(previousEstado);
      setOrden((prev) =>
        prev ? { ...prev, estadoActual: previousEstado } : prev
      );
      setEstadoMessage(null);
      setEstadoError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setEstadoSaving(false);
    }
  };

  const handleMarcarBajaInterna = async () => {
    if (!orden || bajaSaving || abandonmentStatus.level !== "critical") return;

    setBajaSaving(true);
    setBajaError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/baja-interna`, {
        method: "PATCH",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo marcar la baja interna");
      }

      setOrden((prev) =>
        prev
          ? {
              ...prev,
              estadoActual: json.data?.estadoActual ?? "Enviado a Reciclaje",
              historial: json.data?.historial
                ? [...prev.historial, json.data.historial]
                : prev.historial,
            }
          : prev
      );
      setEstadoSeleccionado("Enviado a Reciclaje");
      setBajaModalOpen(false);
      setEstadoMessage("Orden marcada como baja interna");
      setTimeout(() => setEstadoMessage(null), 1800);
    } catch (err) {
      setBajaError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBajaSaving(false);
    }
  };

  // ── Inline save helpers ──────────────────────────────────────────────────────

  const saveOrdenField = async (
    field: "equipo" | "accesorios" | "telefono" | "ingresaPor",
    value: string
  ) => {
    if (!orden) throw new Error("Orden no disponible");
    const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(orden.recordId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const json = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) throw new Error(json.error || "No se pudo actualizar");
    setOrden((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const saveClienteNombre = async (newNombre: string) => {
    if (!orden?.clienteRecordId) throw new Error("ID del cliente no disponible para esta orden");
    const clienteRes = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(orden.clienteRecordId)}`);
    const clienteJson = (await clienteRes.json()) as { success?: boolean; data?: { cedula?: string; telefono?: string; correo?: string; direccion?: string; notas?: string | null }; error?: string };
    if (!clienteRes.ok || !clienteJson.success || !clienteJson.data) {
      throw new Error(clienteJson.error || "No se pudo obtener datos del cliente");
    }
    const cd = clienteJson.data;
    const patchRes = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(orden.clienteRecordId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: newNombre,
        cedula: cd.cedula ?? "",
        telefono: cd.telefono ?? "",
        correo: cd.correo ?? "",
        direccion: cd.direccion ?? "",
        notas: cd.notas ?? "",
      }),
    });
    const patchJson = (await patchRes.json()) as { success?: boolean; error?: string };
    if (!patchRes.ok || !patchJson.success) throw new Error(patchJson.error || "No se pudo actualizar el nombre");
    setOrden((prev) => (prev ? { ...prev, clienteNombre: newNombre } : prev));
  };

  const saveClienteCedula = async (newCedula: string) => {
    if (!orden?.clienteRecordId) throw new Error("ID del cliente no disponible para esta orden");
    const clienteRes = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(orden.clienteRecordId)}`);
    const clienteJson = (await clienteRes.json()) as { success?: boolean; data?: { cedula?: string; telefono?: string; correo?: string; direccion?: string; notas?: string | null }; error?: string };
    if (!clienteRes.ok || !clienteJson.success || !clienteJson.data) {
      throw new Error(clienteJson.error || "No se pudo obtener datos del cliente");
    }
    const cd = clienteJson.data;
    const patchRes = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(orden.clienteRecordId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: orden.clienteNombre,
        cedula: newCedula,
        telefono: cd.telefono ?? "",
        correo: cd.correo ?? "",
        direccion: cd.direccion ?? "",
        notas: cd.notas ?? "",
      }),
    });
    const patchJson = (await patchRes.json()) as { success?: boolean; error?: string };
    if (!patchRes.ok || !patchJson.success) throw new Error(patchJson.error || "No se pudo actualizar la cédula");
    setOrden((prev) => (prev ? { ...prev, cedula: newCedula } : prev));
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadCuentaUnificada();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/tecnicos/session");
        const json = await res.json();
        if (json.success) {
          setUserRol(json.user?.rol ?? "");
          setUserNombre(json.user?.nombre || json.user?.email || "");
        }
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (!comprobanteViewer) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeComprobanteViewer();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [comprobanteViewer]);

  const viewerAttachment = comprobanteViewer?.attachment ?? null;
  const viewerAttachmentIsImage = viewerAttachment ? isImageAttachment(viewerAttachment) : false;
  const viewerAttachmentIsPdf = viewerAttachment ? isPdfAttachment(viewerAttachment) : false;
  const viewerAttachmentName = viewerAttachment?.filename || "Comprobante";
  const viewerAttachmentDeletionKey =
    viewerAttachment?.id && comprobanteViewer
      ? `${comprobanteViewer.abonoId}:${viewerAttachment.id}`
      : null;
  const isViewerAttachmentDeleting =
    viewerAttachmentDeletionKey !== null && abonoAdjuntoDeletingKey === viewerAttachmentDeletionKey;

  useEffect(() => {
    if (!viewerAttachment) return;
    if (!viewerAttachmentIsImage && !viewerAttachmentIsPdf) {
      setComprobanteViewerLoading(false);
    }
  }, [viewerAttachment, viewerAttachmentIsImage, viewerAttachmentIsPdf]);

  useEffect(() => {
    if (!viewerAttachment) {
      setComprobanteViewerResolvedUrl(null);
      setComprobanteViewerError(null);
      return;
    }

    let cancelled = false;
    let localObjectUrl: string | null = null;

    const resolvePreviewUrl = async () => {
      if (!viewerAttachmentIsPdf) {
        setComprobanteViewerResolvedUrl(viewerAttachment.url);
        if (!viewerAttachmentIsImage) {
          setComprobanteViewerLoading(false);
        }
        return;
      }

      try {
        const res = await fetch(viewerAttachment.url, { cache: "no-store" });
        if (!res.ok) {
          throw new Error("No se pudo obtener el archivo PDF.");
        }
        const blob = await res.blob();
        localObjectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(localObjectUrl);
          return;
        }
        setComprobanteViewerResolvedUrl(localObjectUrl);
        setComprobanteViewerError(null);
      } catch (error) {
        if (cancelled) return;
        setComprobanteViewerResolvedUrl(viewerAttachment.url);
        setComprobanteViewerError(
          error instanceof Error
            ? `${error.message} Se intentará mostrar con la URL directa.`
            : "No se pudo preparar el PDF para vista embebida."
        );
      } finally {
        if (!cancelled) {
          setComprobanteViewerLoading(false);
        }
      }
    };

    void resolvePreviewUrl();
    return () => {
      cancelled = true;
      if (localObjectUrl) {
        URL.revokeObjectURL(localObjectUrl);
      }
    };
  }, [viewerAttachment, viewerAttachmentIsImage, viewerAttachmentIsPdf]);

  const cerrada = !!orden && esOrdenCerrada(orden.estadoActual);
  const datosEtapas = orden
    ? { estado: orden.estadoActual, fechaIngreso: orden.fechaIngreso || null, fechaEntrega: orden.entrega?.fecha ?? null, presupuestoEnviado: orden.presupuestoEnviado ?? null, clienteAvisado: orden.clienteAvisado ?? null }
    : null;
  const pasos = datosEtapas ? pasosDeLaOrden(datosEtapas, resumen) : [];
  const sigue = datosEtapas ? queSigue(datosEtapas, resumen) : { texto: "", accion: null };
  const dias = orden ? diasEnTaller(orden.fechaIngreso || null, orden.entrega?.fecha ?? null, new Date()) : 0;

  return (
    <div className={`${styles.theme} w-full space-y-2.5`}>
        {loading && <div className="text-sm text-[var(--sg-text-secondary)]">Cargando orden...</div>}

        {error && (
          <div className="text-sm text-red-400">
            OcurriÃ³ un problema al cargar la orden: {error}
          </div>
        )}

        {!loading && !error && orden && (
          <div className="space-y-2.5">
            {/* Rediseño R1 (tablero 1): cabecera de una línea + etapas con «Qué sigue». */}
            <section className="space-y-2.5 rounded-xl border border-[var(--sg-border)] bg-[#1E1F1C] px-4 py-3 shadow-[var(--sg-shadow-card)]">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                <Link href="/tecnicos/ordenes" className="text-xs text-[var(--sg-text-muted)] transition hover:text-[var(--sg-lime)]">‹ Órdenes</Link>
                <h1 className="font-mono text-[22px] font-extrabold leading-none tracking-wide text-[var(--sg-lime)]">{orden.idVisible}</h1>
                {cerrada ? (
                  <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-[rgba(86,227,164,.13)] px-2.5 text-[11px] font-bold text-[#56E3A4]">
                    <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true"><rect x="3" y="6" width="8" height="6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M4.8 6V4.5a2.2 2.2 0 0 1 4.4 0V6" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>
                    {orden.estadoActual === "Finalizado Entregado" ? "Entregada · cerrada" : "Reciclaje · cerrada"}
                  </span>
                ) : (
                  <div className={`relative w-44 ${estadoSaving || loading ? "pointer-events-none opacity-70" : ""}`}>
                    <StatusFilterDropdown
                      value={estadoSeleccionado}
                      onChange={(value) => handleEstadoChange(value as EstadoOrden)}
                      options={ESTADOS_ORDEN
                        // Punto 6: a "Finalizado Entregado" solo se llega con "Entregar al cliente".
                        .filter((estado) => estado !== "Finalizado Entregado" || orden.estadoActual === "Finalizado Entregado")
                        .map((estado) => ({ value: estado, label: estado }))}
                      label=""
                      className="text-left"
                      dropdownClassName="max-w-[280px]"
                      buttonClassName={`!h-[26px] !rounded-lg !px-2.5 !py-0 !text-[11px] !font-bold !shadow-none !border ${COLOR_ESTADO[estadoSeleccionado] ?? COLOR_ESTADO.Pendiente}`}
                    />
                  </div>
                )}
                <span className="text-xs text-[var(--sg-text-muted)]">
                  {cerrada && orden.entrega?.fecha
                    ? [fechaCorta(orden.entrega.fecha), orden.entrega.retiradoPor ? `retiró ${orden.entrega.retiradoPor}` : ""].filter(Boolean).join(" · ")
                    : [orden.tipoOrden === "Tipo no disponible" ? "" : orden.tipoOrden, `ingresó ${fechaCorta(orden.fechaIngreso)}`].filter(Boolean).join(" · ")}
                  {" · "}<b className="font-semibold text-[var(--sg-text-primary)]">{dias === 0 ? "hoy" : dias === 1 ? "1 día" : `${dias} días`}</b>
                </span>
                {orden.regreso?.ordenAnteriorId && (
                  <Link href={`/tecnicos/ordenes/${encodeURIComponent(orden.regreso.ordenAnteriorId)}`}
                    className="inline-flex h-[22px] items-center rounded-full bg-[rgba(120,183,255,.14)] px-2 text-[11px] font-bold text-[#9CCBFF] transition hover:brightness-110">
                    Regreso de {orden.regreso.ordenAnteriorCodigo || "otra orden"}{orden.regreso.tipo ? ` · ${orden.regreso.tipo}` : ""}
                  </Link>
                )}
                {orden.regreso?.regresos.map((r) => (
                  <Link key={r.id} href={`/tecnicos/ordenes/${encodeURIComponent(r.id)}`}
                    className="inline-flex h-[22px] items-center rounded-full bg-[rgba(120,183,255,.14)] px-2 text-[11px] font-bold text-[#9CCBFF] transition hover:brightness-110">
                    Regresó → {r.codigo}
                  </Link>
                ))}
                <ResponsableSelector
                  ordenId={orden.recordId}
                  refrescar={`${actividadVersion}-${orden.estadoActual}`}
                  soloLectura={cerrada}
                  onCambio={() => { setActividadVersion((v) => v + 1); avisarCambioAlertas(); }}
                />
                {(estadoSaving || estadoMessage || estadoError) && (
                  <span role="status" className="text-[11px] animate-[sg-entrada_160ms_ease-out]">
                    {estadoSaving ? <span className="text-[var(--sg-lime)]">Guardando…</span> : estadoMessage && <span className="text-[var(--sg-text-muted)]">{estadoMessage}</span>}
                    {estadoError && <span className="ml-1 text-red-400">{estadoError}</span>}
                  </span>
                )}
                <div className="flex-1" />
                <button type="button" onClick={() => setAsistente((a) => ({ ...a, abierto: true }))}
                  className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-[rgba(215,255,79,.5)] px-3 text-xs font-semibold text-[var(--sg-lime)] transition hover:bg-[var(--sg-lime-soft)]">
                  <Destello size={14} />Asistente
                </button>
                {sigue.accion === "avisar" && (
                  <button type="button" onClick={() => setPedirMensaje((n) => n + 1)} className={BTN_PRINCIPAL}>Avisar al cliente</button>
                )}
                {sigue.accion === "regreso" && (
                  <button type="button" onClick={() => setRegresoAbierto(true)} className={BTN_PRINCIPAL}>Regresó el equipo</button>
                )}
                {!cerrada && (
                  <button type="button" onClick={() => setEntregaAbierta(true)} disabled={estadoSaving}
                    className={sigue.accion === "entregar" ? BTN_PRINCIPAL : BTN_SECUNDARIO}>
                    Entregar
                  </button>
                )}
                <Desplegable derecha ancho={236} boton={({ ref, abierto, alternar }) => (
                  <button ref={ref} type="button" onClick={alternar} aria-haspopup="menu" aria-expanded={abierto}
                    aria-label="Imprimir: constancia, etiqueta, mantenimiento" title="Imprimir"
                    className={`${BTN_SECUNDARIO} w-[30px] !px-0`}>
                    <PrintIcon className="h-[15px] w-[15px]" />
                  </button>
                )}>
                  {(cerrar) => (
                    <>
                      <a role="menuitem" href={`/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/imprimir/ticket`} target="_blank" rel="noreferrer" onClick={cerrar} className={OPCION_MENU}>Constancia de ingreso</a>
                      <a role="menuitem" href={`/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/imprimir/etiqueta`} target="_blank" rel="noreferrer" onClick={cerrar} className={OPCION_MENU}>Etiqueta del equipo</a>
                      <button type="button" role="menuitem" onClick={() => { cerrar(); setShowMantenimientoModal(true); }} className={OPCION_MENU}>
                        <span className="flex-1">Etiqueta de mantenimiento</span>
                        {orden.proximoMantenimiento && <span className="font-medium text-[var(--sg-text-muted)]">{fechaCorta(orden.proximoMantenimiento)}</span>}
                      </button>
                      {orden.estadoActual === "Finalizado Entregado" && orden.entrega?.motivoSinCobro && (
                        <>
                          <a role="menuitem" href={`/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/entrega/imprimir`} target="_blank" rel="noreferrer" onClick={cerrar} className={`${OPCION_MENU} mt-1 border-t border-[#2C2D29] pt-2`}>Entrega sin cobro · ticket</a>
                          <a role="menuitem" href={`/api/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/entrega/pdf`} target="_blank" rel="noreferrer" onClick={cerrar} className={OPCION_MENU}>Entrega sin cobro · PDF</a>
                        </>
                      )}
                    </>
                  )}
                </Desplegable>
                {cerrada && isAdministratorRole(userRol) && (
                  <Desplegable derecha ancho={200} boton={({ ref, abierto, alternar }) => (
                    <button ref={ref} type="button" onClick={alternar} aria-haspopup="menu" aria-expanded={abierto}
                      aria-label="Más: reabrir (solo administrador, con motivo)" title="Reabrir (solo administrador, con motivo)"
                      className={`${BTN_SECUNDARIO} w-[30px] !px-0`}>⋯</button>
                  )}>
                    {(cerrar) => (
                      <button type="button" role="menuitem" onClick={() => { cerrar(); setReabrirAbierto(true); }} className={`${OPCION_MENU} text-[#FF9C94]`}>Reabrir la orden…</button>
                    )}
                  </Desplegable>
                )}
              </div>
              {resumen || cerrada ? (
                <OrdenEtapas pasos={pasos} queSigue={sigue.texto} />
              ) : (
                <div className="h-[29px] border-t border-[#2C2D29]" aria-hidden="true" />
              )}
            </section>

            {/* Rediseño R10 (tablero 10 C): la orden se está quedando atrás → una línea con la acción y «Posponer». */}
            {!cerrada && (
              <AlertaFranja
                ordenId={orden.recordId}
                refrescar={`${actividadVersion}-${orden.estadoActual}`}
                onAccion={(accion) => {
                  if (accion === "escribir") setPedirMensaje((n) => n + 1);
                  else if (accion === "anotar") setPedirNota((n) => n + 1);
                  else if (accion === "completar") handleEstadoChange("Completado");
                  else desplazar(document.getElementById("orden-presupuesto"), "start");
                }}
              />
            )}

            {orden.estadoActual === "Completado" && (
              <GuardarSolucionCard ordenId={orden.recordId} estadoOrden={orden.estadoActual} recienCompletado={recienCompletado} />
            )}

            {/* Política de baja (60/90 días en «Esperando Respuesta»): una franja con su acción. */}
            {abandonmentStatus.level !== "none" && (
              <section className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 ${
                abandonmentStatus.level === "critical" ? "border-[var(--sg-danger)] bg-[var(--sg-danger-soft)]" : "border-[var(--sg-warning)] bg-[var(--sg-warning-soft)]"
              }`}>
                <span className={`text-xs font-bold ${abandonmentStatus.level === "critical" ? "text-[var(--sg-danger)]" : "text-[var(--sg-warning)]"}`}>
                  {abandonmentStatus.level === "critical" ? "Cumple política de baja" : "Próxima a baja"}
                </span>
                <span className="min-w-0 flex-1 text-xs text-[var(--sg-text-primary)]" title={abandonmentStatus.referenceDate ? `Desde ${formatDate(abandonmentStatus.referenceDate)}` : undefined}>
                  {abandonmentStatus.message}
                </span>
                {abandonmentWhatsAppUrl ? (
                  <a href={abandonmentWhatsAppUrl} target="_blank" rel="noopener noreferrer" className={BTN_SECUNDARIO}>
                    <WhatsappIcon className="h-3.5 w-3.5 text-[var(--sg-lime)]" />Avisar por WhatsApp
                  </a>
                ) : (
                  <span className="text-[11px] text-[var(--sg-text-secondary)]">Cliente sin teléfono</span>
                )}
                {abandonmentStatus.level === "critical" && (
                  <button type="button" onClick={() => { setBajaError(null); setBajaModalOpen(true); }}
                    className={`${BTN_SECUNDARIO} !border-[var(--sg-danger)] !text-[var(--sg-danger)]`}>
                    Marcar baja interna
                  </button>
                )}
              </section>
            )}

            <div className="grid items-start gap-2.5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.75fr)]">
              <div className="min-w-0 space-y-2.5">
                {/* Lo primero que mira el técnico (flujo del dueño, paso 2): chips + lo que dijo el cliente (R7). */}
                <MotivoIngresoCard
                  ordenId={orden.recordId}
                  diagnostico={orden.diagnosticoInicial}
                  recomendaciones={orden.recomendaciones}
                  onMotivos={setMotivosOrden}
                  onCambio={() => {
                    setActividadVersion((v) => v + 1);
                    void fetchData({ showLoading: false, preserveError: true });
                  }}
                />

                {/* Trabajos: el único lugar para agregar, aprobar, quitar y modificar
                    cargos (fase 4) y para marcar el avance de cada uno (R2). */}
                <div id="orden-presupuesto" className="scroll-mt-4" />
                <PresupuestoCard
                  ordenId={orden.recordId}
                  refrescar={datosVersion}
                  productosDigitales={orden.productosDigitales ?? []}
                  esAdmin={userRol === "admin" || userRol === "administrador"}
                  onProductoDigitalCambiado={async () => {
                    await fetchData({ showLoading: false, preserveError: true });
                  }}
                  onCargado={async () => {
                    await fetchData({ showLoading: false, preserveError: true });
                    await loadCuentaUnificada();
                  }}
                  onActividad={() => setActividadVersion((v) => v + 1)}
                  onResumen={setResumen}
                  onEnviado={(iso) => {
                    setOrden((prev) => (prev ? { ...prev, presupuestoEnviado: iso } : prev));
                    setActividadVersion((v) => v + 1);
                  }}
                />

                {/* Rediseño R3: historial, notas y mensajes al cliente en una sola línea de tiempo. */}
                <ActividadCard
                  ordenId={orden.recordId}
                  refrescar={`${actividadVersion}-${orden.historial.length}-${orden.estadoActual}-${cuentaUnificada?.abonos?.length ?? 0}`}
                  pedirMensaje={pedirMensaje}
                  pedirNota={pedirNota}
                  onGuardada={(enviado) => {
                    // Una nota o un mensaje enviado mueven la orden: la franja y la barra de alertas se releen.
                    setActividadVersion((v) => v + 1);
                    avisarCambioAlertas();
                    // Un mensaje enviado con la orden Completada deja «Cliente avisado»: el botón pasa a «Entregar».
                    if (enviado) void fetchData({ showLoading: false, preserveError: true });
                  }}
                />
              </div>

              <aside className="flex min-w-0 flex-col gap-2.5 xl:sticky xl:top-20">
                <section className="space-y-1 rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] px-3.5 py-3 shadow-[var(--sg-shadow-card)]">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">Cliente</p>
                    {orden.clienteRecordId && (
                      <Link href={`/tecnicos/clientes/${encodeURIComponent(orden.clienteRecordId)}`} className="ml-auto text-xs text-[var(--sg-lime)] hover:underline">Ficha del cliente</Link>
                    )}
                  </div>
                  <InlineEditField value={orden.clienteNombre} onSave={saveClienteNombre} required placeholder="Sin nombre" />
                  <div className="flex items-center gap-1.5">
                    <PhoneIcon className="h-3.5 w-3.5 shrink-0 text-[var(--sg-text-muted)]" />
                    <div className="min-w-0 flex-1">
                      <InlineEditField value={orden.telefono} onSave={(v) => saveOrdenField("telefono", v)} placeholder="Sin teléfono" />
                    </div>
                    {buildWhatsAppLink(orden.telefono) && (
                      <a href={buildWhatsAppLink(orden.telefono) ?? undefined} target="_blank" rel="noreferrer" title="Abrir WhatsApp"
                        className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded-lg border border-[rgba(86,227,164,.45)] px-2 text-[11px] font-semibold text-[#56E3A4] transition hover:bg-[rgba(86,227,164,.08)]">
                        <WhatsappIcon className="h-3.5 w-3.5" />WhatsApp
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <IdCardIcon className="h-3.5 w-3.5 shrink-0 text-[var(--sg-text-muted)]" />
                    <div className="min-w-0 flex-1">
                      <InlineEditField value={orden.cedula} onSave={saveClienteCedula} placeholder="Sin cédula" />
                    </div>
                  </div>
                </section>

                <section className="space-y-2 rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] px-3.5 py-3 shadow-[var(--sg-shadow-card)]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">Equipo</p>
                  {/* Rediseño R4 + R5: ficha del equipo con contraseña oculta e historia. */}
                  <EquipoFicha
                    ordenId={orden.recordId}
                    onCambio={async () => {
                      setActividadVersion((v) => v + 1);
                      await fetchData({ showLoading: false, preserveError: true });
                    }}
                  />
                  <div className="flex items-start gap-2">
                    <UsbIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sg-text-muted)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wide text-[var(--sg-text-muted)]">Accesorios</p>
                      <InlineEditField value={orden.accesorios === "No disponible" ? "" : orden.accesorios} onSave={(v) => saveOrdenField("accesorios", v)} placeholder="Ninguno" />
                    </div>
                  </div>
                </section>

                {/* Tarjeta "Cuenta" (auditoría ops, punto 11): una sola, como estado de cuenta. */}
                <section id="orden-cuenta" className="flex scroll-mt-4 flex-col gap-2">
                  {/* Sin la cuenta no hay cifras: se avisa (no se cae a los rollups NV). */}
                  {cuentaUnificadaError && (
                    <p className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] px-3 py-2 text-xs text-[var(--sg-danger)]">
                      No se pudo cargar la cuenta ({cuentaUnificadaError}). Recarga la página.
                    </p>
                  )}
                  {abonoMessage && (
                    <div className="flex items-center gap-2 rounded-[var(--sg-radius-sm)] border border-[var(--sg-success)] bg-[var(--sg-success-soft)] px-3 py-2 text-sm text-[var(--sg-text-primary)] animate-[sg-entrada_200ms_ease-out]">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--sg-success)] text-[var(--sg-text-on-accent)]">
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3 fill-current">
                          <path d="M8.35 13.2 4.9 9.75l1.06-1.06 2.39 2.39 5.69-5.69 1.06 1.06-6.75 6.75Z" />
                        </svg>
                      </span>
                      <span>{abonoMessage}</span>
                    </div>
                  )}
                  <CuentaCard
                    cuenta={cuentaUnificada}
                    documento={cuentaDocumento}
                    origenTipo="orden"
                    esAdmin={isAdministratorRole(userRol)}
                    cargando={cuentaUnificadaLoading}
                    onCuentaCambiada={() => void refreshOrdenDetalleFinanzas()}
                    onVerComprobante={(abonoId, adjunto) => openComprobanteViewer(abonoId, adjunto)}
                    onRegistrarPago={abrirRegistrarPago}
                  />
                </section>

                <OrdenDocumentosCard
                  ordenId={orden.recordId}
                  documentos={orden.documentos ?? []}
                  onOrdenUpdated={(updatedOrden) => setOrden(updatedOrden as OrdenDetalle)}
                />

                <OrdenCotizacionCard
                  orden={orden}
                  onLinked={(cotizacionId, cotizacionCodigo) =>
                    setOrden((prev) => prev ? { ...prev, cotizacionId, cotizacionCodigo } : prev)
                  }
                />
              </aside>
            </div>

            {bajaModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
                <div className="w-full max-w-lg rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] p-4 shadow-2xl">
                  <div className="space-y-2 border-b border-[var(--sg-divider)] pb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--sg-danger)]">
                      Confirmación requerida
                    </p>
                    <h3 className="text-lg font-extrabold text-[var(--sg-text-primary)]">
                      Marcar baja interna
                    </h3>
                    <p className="text-sm leading-6 text-[var(--sg-text-secondary)]">
                      Esta acción cambiará el estado a Enviado a Reciclaje y registrará un movimiento en el historial. No se ejecuta automáticamente.
                    </p>
                  </div>

                  <div className="space-y-3 py-4">
                    <div className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-4 py-3 text-sm leading-6 text-[var(--sg-text-primary)]">
                      {abandonmentStatus.message}
                    </div>
                    {bajaError && (
                      <p className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-panel)] px-3 py-2 text-sm text-[var(--sg-danger)]">
                        {bajaError}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col-reverse gap-3 border-t border-[var(--sg-divider)] pt-4 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setBajaModalOpen(false)}
                      disabled={bajaSaving}
                      className="inline-flex h-10 items-center justify-center rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-4 text-sm font-semibold text-[var(--sg-text-primary)] transition hover:border-[var(--sg-lime)] disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleMarcarBajaInterna}
                      disabled={bajaSaving}
                      className="inline-flex h-10 items-center justify-center rounded-[var(--sg-radius-md)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-4 text-sm font-semibold text-[var(--sg-danger)] transition hover:brightness-110 disabled:opacity-60"
                    >
                      {bajaSaving ? "Marcando..." : "Confirmar baja interna"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {viewerAttachment && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
                <div className="relative w-full max-w-[1800px] rounded-xl border border-[#3A3A36] bg-[#1E1F1C] shadow-2xl">
                  <div className="flex items-center justify-between gap-3 border-b border-[#3A3A36] px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-[#A7A7A7]">Comprobante</p>
                      <p className="truncate text-sm font-semibold text-white" title={viewerAttachmentName}>
                        {viewerAttachmentName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void downloadAttachment(viewerAttachment);
                        }}
                        className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
                      >
                        Descargar
                      </button>
                      {viewerAttachment.id && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!comprobanteViewer) return;
                            void handleEliminarComprobanteAbono(
                              comprobanteViewer.abonoId,
                              viewerAttachment
                            );
                          }}
                          disabled={isViewerAttachmentDeleting}
                          className="rounded-full border border-red-500/70 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 hover:text-red-100 disabled:opacity-60"
                        >
                          {isViewerAttachmentDeleting ? "Eliminando..." : "Eliminar"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={closeComprobanteViewer}
                        className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#F5F5F5]"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                  <div className="relative px-4 py-4">
                    {comprobanteViewerLoading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1E1F1C]/80">
                        <span className="h-6 w-6 animate-spin rounded-full border border-[#D7FF4F]/70 border-t-transparent" />
                      </div>
                    )}
                    {comprobanteViewerError && (
                      <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                        {comprobanteViewerError}
                      </p>
                    )}
                    {viewerAttachmentIsImage && (
                      <div className="max-h-[78vh] overflow-auto rounded-md border border-[#3A3A36] bg-black/30">
                        <Image
                          src={comprobanteViewerResolvedUrl || viewerAttachment.url}
                          alt={viewerAttachmentName}
                          width={1600}
                          height={1200}
                          unoptimized
                          className="h-auto w-full object-contain"
                          onLoad={() => setComprobanteViewerLoading(false)}
                          onError={() => {
                            setComprobanteViewerLoading(false);
                            setComprobanteViewerError(
                              "No se pudo cargar la imagen en el visor."
                            );
                          }}
                        />
                      </div>
                    )}
                    {viewerAttachmentIsPdf && (
                      <div className="h-[78vh] overflow-hidden rounded-md border border-[#3A3A36] bg-[#252622]">
                        <object
                          data={comprobanteViewerResolvedUrl || viewerAttachment.url}
                          type="application/pdf"
                          className="h-full w-full"
                          aria-label={viewerAttachmentName}
                        >
                          <embed
                            src={comprobanteViewerResolvedUrl || viewerAttachment.url}
                            type="application/pdf"
                            className="h-full w-full"
                            onLoad={() => setComprobanteViewerLoading(false)}
                          />
                        </object>
                      </div>
                    )}
                    {!viewerAttachmentIsImage && !viewerAttachmentIsPdf && (
                      <div className="rounded-md border border-[#3A3A36] bg-[#252622]/70 px-3 py-4 text-sm text-[#CFCFCB]">
                        Este archivo no tiene vista previa embebida.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {regresoAbierto && orden && (
              <RegresoEquipoDialog
                ordenId={orden.recordId}
                onCerrar={() => setRegresoAbierto(false)}
                onCreada={(r) => {
                  setRegresoAbierto(false);
                  router.push(`/tecnicos/ordenes/${encodeURIComponent(r.ordenId)}`);
                }}
              />
            )}

            {reabrirAbierto && orden && (
              <ReabrirOrdenDialog
                ordenId={orden.recordId}
                codigo={orden.idVisible}
                onCerrar={() => setReabrirAbierto(false)}
                onReabierta={async () => {
                  setReabrirAbierto(false);
                  await fetchData({ showLoading: false, preserveError: true });
                }}
              />
            )}

            {entregaAbierta && orden && (
              <EntregarClientePanel
                ordenId={orden.recordId}
                onCerrar={() => setEntregaAbierta(false)}
                onCambio={async () => {
                  await fetchData({ showLoading: false, preserveError: true });
                  await loadCuentaUnificada();
                }}
                onIrA={(donde) => {
                  setEntregaAbierta(false);
                  desplazar(document.getElementById(donde === "presupuesto" ? "orden-presupuesto" : "orden-cuenta"), "start");
                }}
                onRegistrarPago={() => {
                  setEntregaAbierta(false);
                  setAbonoError(null);
                  setAbonoMessage(null);
                  const saldo = cuentaUnificada?.saldo ?? 0;
                  if (saldo > 0) setAbonoMonto(saldo.toFixed(2));
                  cargarSaldoAFavorCliente();
                  setOpenAbonoModal(true);
                }}
                onEntregada={(r) => {
                  setEntregaAbierta(false);
                  const g = r.garantias;
                  const partes = [
                    g?.salidas?.length ? `salió por garantía: ${g.salidas.join(", ")}` : "",
                    g?.reclamos?.length ? `pieza retirada al reclamo: ${g.reclamos.join(", ")}` : "",
                  ].filter(Boolean);
                  if (g?.avisos?.length) setEstadoError(g.avisos.join(" "));
                  setEstadoMessage(partes.length ? `Entregado · ${partes.join(" · ")}` : "Entregado");
                  setTimeout(() => setEstadoMessage(null), partes.length ? 4000 : 1800);
                  // Se relee la orden: estado, historial y datos de la entrega.
                  void fetchData({ showLoading: false, preserveError: true });
                  if (r.comprobante === "sin-cobro") {
                    window.open(`/tecnicos/ordenes/${encodeURIComponent(orden.recordId)}/entrega/imprimir`, "_blank", "noopener");
                  }
                  // Rediseño R7: un motivo del grupo Mantenimiento propone la fecha del próximo
                  // mantenimiento (la etiqueta de siempre, con 6 meses ya puestos).
                  if (debeProponerMantenimiento(motivosOrden, orden.proximoMantenimiento)) setShowMantenimientoModal(true);
                }}
              />
            )}

            {openAbonoModal && (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
                <div className="w-full max-w-md rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-2xl space-y-3">
                  <h4 className="text-sm font-semibold text-white">Registrar abono</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-[#A7A7A7]">Fecha</label>
                      <input
                        type="date"
                        value={abonoFecha}
                        onChange={(e) => setAbonoFecha(e.target.value)}
                        className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none"
                        disabled={abonoSaving}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-[#A7A7A7]">Monto</label>
                      <div className="flex overflow-hidden rounded-lg border border-[#3A3A36] bg-[#1E1F1C] focus-within:border-[#D7FF4F]/70">
                        <span className="inline-flex items-center border-r border-[#3A3A36] px-3 text-sm font-semibold text-[#CFCFCB]">
                          $
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={abonoMonto}
                          onChange={(e) => setAbonoMonto(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-transparent px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:outline-none"
                          disabled={abonoSaving}
                        />
                      </div>
                    </div>
                  </div>
                  {cuentaUnificada && abonoMetodoPago !== METODO_SALDO_A_FAVOR && avisoAbonoDeMas(parseFloat(abonoMonto), cuentaUnificada.saldo) && (
                    <p className="text-[11px] leading-snug text-[#F0C75E] animate-[sg-entrada_180ms_ease-out]">{avisoAbonoDeMas(parseFloat(abonoMonto), cuentaUnificada.saldo)}</p>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#A7A7A7]">Método de pago</label>
                    <select
                      value={abonoMetodoPago}
                      onChange={(e) => {
                        setAbonoMetodoPago(e.target.value);
                        if (e.target.value === METODO_SALDO_A_FAVOR) {
                          const usable = maximoUsable(saldoAFavorCliente, Math.max(0, cuentaUnificada?.saldo ?? 0));
                          if (usable > 0) setAbonoMonto(usable.toFixed(2));
                        }
                      }}
                      className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none"
                      disabled={abonoSaving}
                    >
                      <option value="">Seleccionar método de pago</option>
                      {saldoAFavorCliente > 0.01 && (
                        <option value={METODO_SALDO_A_FAVOR}>
                          Saldo a favor del cliente · disponible ${saldoAFavorCliente.toFixed(2)}
                        </option>
                      )}
                      {/* Auditoría ops, punto 1: solo métodos con cuenta real, y
                          cada uno dice a qué cuenta entra (Banco Pichincha ≠ DeUna). */}
                      {METODOS_COBRO_NUEVO.map((method) => (
                        <option key={method} value={method}>
                          {etiquetaMetodoPago(method)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {abonoMetodoPago === "DeUna" && (
                    <ElegirPagoDeUna referencia={abonoNumeroTransaccion}
                      onElegir={(p) => { setAbonoNumeroTransaccion(p.referencia); setAbonoMonto(p.monto.toFixed(2)); }} />
                  )}
                  {abonoMetodoPago !== METODO_SALDO_A_FAVOR && (<>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#A7A7A7]">
                      N° de transacción{" "}
                      {requiereNumeroTransaccion(abonoMetodoPago) ? (
                        <span className="text-[#FF5A4F]">*</span>
                      ) : (
                        "(opcional)"
                      )}
                    </label>
                    <input
                      type="text"
                      value={abonoNumeroTransaccion}
                      onChange={(e) => setAbonoNumeroTransaccion(e.target.value)}
                      placeholder="Ej. referencia de la transferencia"
                      className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none"
                      disabled={abonoSaving}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#A7A7A7]">Registrado por</label>
                    <div className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C]/60 px-3 py-2 text-sm text-[#A7A7A7]">
                      {userNombre || "Cargando..."}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#A7A7A7]">Comprobante</label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setAbonoComprobanteFile(e.target.files?.[0] ?? null)}
                      className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#CFCFCB] file:mr-3 file:rounded-md file:border file:border-[#3A3A36] file:bg-[#30312D] file:px-2 file:py-1 file:text-xs file:font-semibold file:text-[#CFCFCB] hover:file:text-[#D7FF4F] focus:border-[#D7FF4F]/70 focus:outline-none"
                      disabled={abonoSaving}
                    />
                    {abonoComprobanteFile && (
                      <p className="text-xs text-[#A7A7A7]">
                        Archivo seleccionado: {abonoComprobanteFile.name}
                      </p>
                    )}
                    <p className="text-[11px] text-[#A7A7A7]/70">
                      Se sube al guardar (máx. 5MB, imagen o PDF).
                    </p>
                  </div>
                  </>)}
                  <textarea
                    value={abonoObservacion}
                    onChange={(e) => setAbonoObservacion(e.target.value)}
                    placeholder="Observacion"
                    rows={3}
                    className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none resize-none"
                    disabled={abonoSaving}
                  />
                  {abonoError && <p className="text-xs text-red-400">{abonoError}</p>}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenAbonoModal(false);
                        setAbonoError(null);
                      }}
                      className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
                      disabled={abonoSaving}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleGuardarAbono}
                      disabled={abonoSaving}
                      className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-xs font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-60"
                    >
                      {abonoSaving ? "Guardando..." : "Guardar abono"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showMantenimientoModal && (
              <ImprimirEtiquetaMantenimientoModal
                ordenId={id}
                onClose={() => setShowMantenimientoModal(false)}
              />
            )}

            <AsistentePanel
              abierto={asistente.abierto}
              pestana={asistente.pestana}
              onPestana={(pestana) => setAsistente((a) => ({ ...a, pestana }))}
              onCerrar={() => setAsistente((a) => ({ ...a, abierto: false }))}
              ordenId={orden.recordId}
              codigo={orden.idVisible}
              equipo={orden.equipo}
              ingresaPor={orden.ingresaPor}
              motivos={motivosOrden.map((m) => m.nombre)}
              telefono={orden.telefono}
              usuario={userNombre}
              onRegistrarPago={abrirRegistrarPago}
              onIrA={(seccion) => {
                setTimeout(() => desplazar(document.getElementById(seccion === "cuenta" ? "orden-cuenta" : "orden-presupuesto"), "start"), 250);
              }}
              onActividad={() => setActividadVersion((v) => v + 1)}
            />
          </div>
        )}
    </div>
  );
}
