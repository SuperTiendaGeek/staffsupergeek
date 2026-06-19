"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
import { OrdenDocumentosCard } from "@/components/tecnicos/OrdenDocumentosCard";
import OrdenCotizacionCard from "@/components/tecnicos/OrdenCotizacionCard";
import { ESTADOS_ORDEN, EstadoOrden } from "@/types/tecnicos";
import { StatusFilterDropdown } from "@/components/tecnicos/ui/StatusFilterDropdown";
import { getAbandonmentStatus } from "@/lib/tecnicos/orders/abandonmentPolicy";
import { buildAbandonmentWhatsAppMessage } from "@/lib/tecnicos/orders/abandonmentWhatsApp";
import { buildWhatsAppUrl } from "@/lib/tecnicos/whatsapp";

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
  observacion: string | null;
  registradoPor: string | null;
  comprobante: string | null;
};

type AbonoAdjuntoItem = AbonoItem["comprobantes"][number];

type OrdenDocumentoItem = AbonoAdjuntoItem;

type CatalogoRepuestoItem = {
  id: string;
  nombre: string;
  descripcionCorta: string | null;
  skuCodigoInterno: string | null;
  proveedorHabitual: string | null;
  costoBase: number | null;
  precioSugeridoCliente: number | null;
  activo: boolean;
};

type CatalogoServicioItem = {
  id: string;
  nombre: string;
  descripcion: string | null;
  costoSugerido: number | null;
  activo: boolean;
};

type ProductoDigitalItem = {
  id: string;
  softwareProducto: string;
  tipo: string | null;
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
  link: string | null;
};

type OrdenDetalle = {
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

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return "No disponible";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
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

const INITIAL_SEARCH_SUGGESTIONS = 5;
const MAX_SEARCH_RESULTS = 12;
const ABONO_METODOS_PAGO = ["Efectivo", "Transferencia", "Tarjeta", "PayPal"] as const;
const ABONO_REGISTRADO_POR_TEMP = "Pendiente de login (mock)";

const formatTimelineDate = (value?: string | null) => {
  if (!value) return "â€“";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value ?? "â€“";
  return parsed.toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildTimelineTitle = (estadoNuevo?: string | null) => {
  const val = (estadoNuevo ?? "").trim();
  if (!val) return "Movimiento registrado";
  if (val.toLowerCase() === "sin estado") return "Movimiento registrado";
  return val;
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

const normalizeWhatsappPhone = (telefono?: string | null) => {
  if (!telefono) return null;
  let t = telefono.replace(/[^\d+]/g, "");
  if (!t) return null;
  if (t.startsWith("+")) t = t.slice(1);
  if (t.startsWith("0")) t = `593${t.slice(1)}`;
  else if (t.startsWith("593")) t = t;
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length < 9) return null;
  return digits;
};

const buildWhatsappUrl = (phone: string, message: string) =>
  `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

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

const RefreshIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21 12a9 9 0 0 0-9-9 9.5 9.5 0 0 0-6.34 2.48" />
    <path d="M3 4v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.5 9.5 0 0 0 6.34-2.48" />
    <path d="M21 20v-5h-5" />
  </svg>
);

const EditIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
  </svg>
);

const EyeIcon = ({
  className = "h-4 w-4",
  off = false,
}: {
  className?: string;
  off?: boolean;
}) =>
  off ? (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 3l18 18" />
      <path d="M10.73 10.73a2 2 0 0 0 2.54 2.54" />
      <path d="M9.51 9.51a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83" />
      <path d="M6.4 6.4a10.13 10.13 0 0 0-3.4 5.6 10.13 10.13 0 0 0 12 6 10.13 10.13 0 0 0 4.17-3.2" />
      <path d="M14.12 14.12a2 2 0 0 1-2.12 2 2 2 0 0 1-2-2 2 2 0 0 1 2-2 2 2 0 0 1 2.12 2Z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

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


const DesktopIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="2" y="4" width="13" height="10" rx="1.8" />
    <path d="M6 19h6" />
    <path d="M9 14v5" />
    <rect x="18" y="5" width="4" height="15" rx="1.2" />
    <path d="M20 16h.01" />
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

const TrashIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const PaperclipIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21.44 11.05 12.25 20.24a5 5 0 1 1-7.07-7.07l9.2-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 1 1-2.82-2.82l8.49-8.49" />
  </svg>
);

const FileIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 15h6" />
    <path d="M9 19h6" />
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

// ─── Page component ───────────────────────────────────────────────────────────

export function OrdenDetalleClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [orden, setOrden] = useState<OrdenDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avanceTexto, setAvanceTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [inlineEditing, setInlineEditing] = useState(false);
  const [estadoSeleccionado, setEstadoSeleccionado] = useState<string>("");
  const [estadoSaving, setEstadoSaving] = useState(false);
  const [estadoMessage, setEstadoMessage] = useState<string | null>(null);
  const [estadoError, setEstadoError] = useState<string | null>(null);
  const [nuevoEstadoError, setNuevoEstadoError] = useState<string | null>(null);
  const [mensajeLoading, setMensajeLoading] = useState<Record<string, boolean>>({});
  const [mensajeError, setMensajeError] = useState<Record<string, string | null>>({});
  const [mensajeVisible, setMensajeVisible] = useState<Record<string, boolean>>({});
  const pollingRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const inlineInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editInlineRef = useRef<HTMLTextAreaElement | null>(null);
  const repuestoComposerRef = useRef<HTMLDivElement | null>(null);
  const servicioComposerRef = useRef<HTMLDivElement | null>(null);
  const submitLocked = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingOriginal, setEditingOriginal] = useState("");
  const [editingSaving, setEditingSaving] = useState(false);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [repuestoDeleteConfirmId, setRepuestoDeleteConfirmId] = useState<string | null>(null);
  const [repuestoDeletingId, setRepuestoDeletingId] = useState<string | null>(null);
  const [repuestoDeleteError, setRepuestoDeleteError] = useState<string | null>(null);
  const [servicioDeleteConfirmId, setServicioDeleteConfirmId] = useState<string | null>(null);
  const [servicioDeletingId, setServicioDeletingId] = useState<string | null>(null);
  const [servicioDeleteError, setServicioDeleteError] = useState<string | null>(null);
  const [abonoDeleteConfirmId, setAbonoDeleteConfirmId] = useState<string | null>(null);
  const [abonoDeletingId, setAbonoDeletingId] = useState<string | null>(null);
  const [abonoDeleteError, setAbonoDeleteError] = useState<string | null>(null);
  const [abonoAdjuntoUploadingId, setAbonoAdjuntoUploadingId] = useState<string | null>(null);
  const [abonoAdjuntoDeletingKey, setAbonoAdjuntoDeletingKey] = useState<string | null>(null);
  const [abonoAdjuntoError, setAbonoAdjuntoError] = useState<Record<string, string | null>>({});
  const [comprobanteViewer, setComprobanteViewer] = useState<{
    abonoId: string;
    attachment: AbonoAdjuntoItem;
  } | null>(null);
  const [comprobanteViewerLoading, setComprobanteViewerLoading] = useState(false);
  const [comprobanteViewerError, setComprobanteViewerError] = useState<string | null>(null);
  const [comprobanteViewerResolvedUrl, setComprobanteViewerResolvedUrl] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<Record<string, string | null>>({});
  const [catalogoRepuestos, setCatalogoRepuestos] = useState<CatalogoRepuestoItem[]>([]);
  const [catalogoServicios, setCatalogoServicios] = useState<CatalogoServicioItem[]>([]);
  const [catalogoRepuestosLoading, setCatalogoRepuestosLoading] = useState(false);
  const [catalogoServiciosLoading, setCatalogoServiciosLoading] = useState(false);
  const [catalogoRepuestosError, setCatalogoRepuestosError] = useState<string | null>(null);
  const [catalogoServiciosError, setCatalogoServiciosError] = useState<string | null>(null);
  const [repuestoSearch, setRepuestoSearch] = useState("");
  const [servicioSearch, setServicioSearch] = useState("");
  const [selectedRepuesto, setSelectedRepuesto] = useState<CatalogoRepuestoItem | null>(null);
  const [selectedServicio, setSelectedServicio] = useState<CatalogoServicioItem | null>(null);
  const [showRepuestoResults, setShowRepuestoResults] = useState(false);
  const [showServicioResults, setShowServicioResults] = useState(false);
  const [repuestoPlacement, setRepuestoPlacement] = useState<"top" | "bottom">("bottom");
  const [servicioPlacement, setServicioPlacement] = useState<"top" | "bottom">("bottom");
  const [repuestoCantidad, setRepuestoCantidad] = useState("1");
  const [repuestoPrecioCliente, setRepuestoPrecioCliente] = useState("");
  const [repuestoCostoProveedor, setRepuestoCostoProveedor] = useState("");
  const [repuestoProveedor, setRepuestoProveedor] = useState("");
  const [repuestoObservacion, setRepuestoObservacion] = useState("");
  const [repuestoSaving, setRepuestoSaving] = useState(false);
  const [repuestoError, setRepuestoError] = useState<string | null>(null);
  const [servicioCosto, setServicioCosto] = useState("");
  const [servicioObservacion, setServicioObservacion] = useState("");
  const [servicioSaving, setServicioSaving] = useState(false);
  const [servicioError, setServicioError] = useState<string | null>(null);
  const [openCreateRepuestoModal, setOpenCreateRepuestoModal] = useState(false);
  const [openCreateServicioModal, setOpenCreateServicioModal] = useState(false);
  const [nuevoRepuestoNombre, setNuevoRepuestoNombre] = useState("");
  const [nuevoRepuestoCostoBase, setNuevoRepuestoCostoBase] = useState("");
  const [nuevoRepuestoPrecioSugerido, setNuevoRepuestoPrecioSugerido] = useState("");
  const [nuevoRepuestoProveedorHabitual, setNuevoRepuestoProveedorHabitual] = useState("");
  const [nuevoRepuestoSaving, setNuevoRepuestoSaving] = useState(false);
  const [nuevoRepuestoError, setNuevoRepuestoError] = useState<string | null>(null);
  const [nuevoServicioNombre, setNuevoServicioNombre] = useState("");
  const [nuevoServicioCostoSugerido, setNuevoServicioCostoSugerido] = useState("");
  const [nuevoServicioSaving, setNuevoServicioSaving] = useState(false);
  const [nuevoServicioError, setNuevoServicioError] = useState<string | null>(null);
  const [openAbonoModal, setOpenAbonoModal] = useState(false);
  const [abonoFecha, setAbonoFecha] = useState(todayDateInputValue);
  const [abonoMonto, setAbonoMonto] = useState("");
  const [abonoMetodoPago, setAbonoMetodoPago] = useState("");
  const [abonoObservacion, setAbonoObservacion] = useState("");
  const [abonoComprobanteFile, setAbonoComprobanteFile] = useState<File | null>(null);
  const [abonoSaving, setAbonoSaving] = useState(false);
  const [abonoError, setAbonoError] = useState<string | null>(null);
  const [abonoMessage, setAbonoMessage] = useState<string | null>(null);
  const [bajaModalOpen, setBajaModalOpen] = useState(false);
  const [bajaSaving, setBajaSaving] = useState(false);
  const [bajaError, setBajaError] = useState<string | null>(null);
  const [showProductoDigitalModal, setShowProductoDigitalModal] = useState(false);
  const [pdSearch, setPdSearch] = useState("");
  const [productosDisponibles, setProductosDisponibles] = useState<ProductoDigitalItem[]>([]);
  const [pdSearchLoading, setPdSearchLoading] = useState(false);
  const [pdSearchError, setPdSearchError] = useState<string | null>(null);
  const [selectedPd, setSelectedPd] = useState<ProductoDigitalItem | null>(null);
  const [pdPrecioVenta, setPdPrecioVenta] = useState("");
  const [pdSaving, setPdSaving] = useState(false);
  const [pdError, setPdError] = useState<string | null>(null);
  const [pdDeleteConfirmId, setPdDeleteConfirmId] = useState<string | null>(null);
  const [pdDeletingId, setPdDeletingId] = useState<string | null>(null);
  const [pdDeleteError, setPdDeleteError] = useState<string | null>(null);
  const [pdCredencialesVisible, setPdCredencialesVisible] = useState<Record<string, boolean>>({});
  const [pdCredencialesData, setPdCredencialesData] = useState<Record<string, { claveActivacion?: string | null; usuarioCorreo?: string | null; contraseña?: string | null }>>({});
  const [pdCredencialesLoading, setPdCredencialesLoading] = useState<Record<string, boolean>>({});
  const [pdCredencialesError, setPdCredencialesError] = useState<Record<string, string | null>>({});
  const lineDeleteActionButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-danger)] hover:bg-[var(--sg-danger-soft)] hover:text-[var(--sg-danger)] focus:outline-none focus:ring-1 focus:ring-[var(--sg-lime)] disabled:cursor-not-allowed disabled:opacity-50";

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
      const notaValue = json.data?.notaInterna;
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
    await wait(450);
    await fetchData({ showLoading: false, preserveError: true });
  };

  const resetRepuestoComposer = () => {
    setRepuestoSearch("");
    setSelectedRepuesto(null);
    setRepuestoCantidad("1");
    setRepuestoPrecioCliente("");
    setRepuestoCostoProveedor("");
    setRepuestoProveedor("");
    setRepuestoObservacion("");
    setRepuestoError(null);
    setShowRepuestoResults(false);
  };

  const resetServicioComposer = () => {
    setServicioSearch("");
    setSelectedServicio(null);
    setServicioCosto("");
    setServicioObservacion("");
    setServicioError(null);
    setShowServicioResults(false);
  };

  const resetCrearRepuestoForm = () => {
    setNuevoRepuestoNombre("");
    setNuevoRepuestoCostoBase("");
    setNuevoRepuestoPrecioSugerido("");
    setNuevoRepuestoProveedorHabitual("");
    setNuevoRepuestoError(null);
  };

  const resetCrearServicioForm = () => {
    setNuevoServicioNombre("");
    setNuevoServicioCostoSugerido("");
    setNuevoServicioError(null);
  };

  const resetAbonoForm = () => {
    setAbonoFecha(todayDateInputValue());
    setAbonoMonto("");
    setAbonoMetodoPago("");
    setAbonoObservacion("");
    setAbonoComprobanteFile(null);
    setAbonoError(null);
  };

  const resetProductoDigitalModal = () => {
    setPdSearch("");
    setProductosDisponibles([]);
    setSelectedPd(null);
    setPdPrecioVenta("");
    setPdError(null);
    setPdSearchError(null);
  };

  const handleBuscarProductosDigitales = async (q: string) => {
    setPdSearchLoading(true);
    setPdSearchError(null);
    try {
      const params = new URLSearchParams({ estado: "Disponible" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/tecnicos/productos-digitales?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al buscar");
      setProductosDisponibles((json.data ?? []) as ProductoDigitalItem[]);
    } catch (err) {
      setPdSearchError(err instanceof Error ? err.message : "Error al buscar");
    } finally {
      setPdSearchLoading(false);
    }
  };

  const handleAsignarProductoDigital = async () => {
    if (!selectedPd || !orden) return;
    setPdSaving(true);
    setPdError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(orden.recordId)}/productos-digitales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productoId: selectedPd.id,
          precioVenta: parseNumberInput(pdPrecioVenta),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al asignar");
      setShowProductoDigitalModal(false);
      resetProductoDigitalModal();
      await refreshOrdenDetalleFinanzas();
    } catch (err) {
      setPdError(err instanceof Error ? err.message : "Error al asignar");
    } finally {
      setPdSaving(false);
    }
  };

  const handleDesasignarProductoDigital = async (productoId: string) => {
    if (!orden) return;
    setPdDeletingId(productoId);
    setPdDeleteError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(orden.recordId)}/productos-digitales`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productoId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al desasignar");
      setPdDeleteConfirmId(null);
      await refreshOrdenDetalleFinanzas();
    } catch (err) {
      setPdDeleteError(err instanceof Error ? err.message : "Error al desasignar");
    } finally {
      setPdDeletingId(null);
    }
  };

  const handleVerCredenciales = async (productoId: string) => {
    if (pdCredencialesVisible[productoId]) {
      setPdCredencialesVisible((prev) => ({ ...prev, [productoId]: false }));
      return;
    }
    if (pdCredencialesData[productoId]) {
      setPdCredencialesVisible((prev) => ({ ...prev, [productoId]: true }));
      return;
    }
    setPdCredencialesLoading((prev) => ({ ...prev, [productoId]: true }));
    setPdCredencialesError((prev) => ({ ...prev, [productoId]: null }));
    try {
      const res = await fetch(`/api/tecnicos/productos-digitales/${encodeURIComponent(productoId)}/credenciales`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al obtener credenciales");
      setPdCredencialesData((prev) => ({ ...prev, [productoId]: json.data }));
      setPdCredencialesVisible((prev) => ({ ...prev, [productoId]: true }));
    } catch (err) {
      setPdCredencialesError((prev) => ({ ...prev, [productoId]: err instanceof Error ? err.message : "Error" }));
    } finally {
      setPdCredencialesLoading((prev) => ({ ...prev, [productoId]: false }));
    }
  };

  const selectRepuesto = (item: CatalogoRepuestoItem) => {
    setSelectedRepuesto(item);
    setRepuestoSearch("");
    setShowRepuestoResults(false);
    setRepuestoPrecioCliente(
      item.precioSugeridoCliente !== null && item.precioSugeridoCliente !== undefined
        ? String(item.precioSugeridoCliente)
        : ""
    );
    setRepuestoCostoProveedor(
      item.costoBase !== null && item.costoBase !== undefined ? String(item.costoBase) : ""
    );
    setRepuestoProveedor(item.proveedorHabitual ?? "");
  };

  const selectServicio = (item: CatalogoServicioItem) => {
    setSelectedServicio(item);
    setServicioSearch("");
    setShowServicioResults(false);
    setServicioCosto(
      item.costoSugerido !== null && item.costoSugerido !== undefined
        ? String(item.costoSugerido)
        : ""
    );
  };

  const loadCatalogoRepuestos = async () => {
    if (catalogoRepuestosLoading) return;
    setCatalogoRepuestosLoading(true);
    setCatalogoRepuestosError(null);

    try {
      const res = await fetch("/api/tecnicos/catalogo/repuestos");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo cargar el catÃ¡logo de repuestos");
      }

      const data = (json.data ?? []) as CatalogoRepuestoItem[];
      setCatalogoRepuestos(data);
    } catch (err) {
      setCatalogoRepuestosError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCatalogoRepuestosLoading(false);
    }
  };

  const loadCatalogoServicios = async () => {
    if (catalogoServiciosLoading) return;
    setCatalogoServiciosLoading(true);
    setCatalogoServiciosError(null);

    try {
      const res = await fetch("/api/tecnicos/catalogo/servicios");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo cargar el catÃ¡logo de servicios");
      }

      const data = (json.data ?? []) as CatalogoServicioItem[];
      setCatalogoServicios(data);
    } catch (err) {
      setCatalogoServiciosError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCatalogoServiciosLoading(false);
    }
  };

  const filteredCatalogoRepuestos = useMemo(() => {
    const query = repuestoSearch.trim().toLowerCase();
    if (!query) return catalogoRepuestos.slice(0, INITIAL_SEARCH_SUGGESTIONS);

    return catalogoRepuestos
      .filter((item) => {
        const byName = item.nombre.toLowerCase().includes(query);
        const bySku = item.skuCodigoInterno?.toLowerCase().includes(query);
        const byProveedor = item.proveedorHabitual?.toLowerCase().includes(query);
        return byName || bySku || byProveedor;
      })
      .slice(0, MAX_SEARCH_RESULTS);
  }, [catalogoRepuestos, repuestoSearch]);

  const filteredCatalogoServicios = useMemo(() => {
    const query = servicioSearch.trim().toLowerCase();
    if (!query) return catalogoServicios.slice(0, INITIAL_SEARCH_SUGGESTIONS);

    return catalogoServicios
      .filter((item) => {
        const byName = item.nombre.toLowerCase().includes(query);
        const byDescripcion = item.descripcion?.toLowerCase().includes(query);
        return byName || byDescripcion;
      })
      .slice(0, MAX_SEARCH_RESULTS);
  }, [catalogoServicios, servicioSearch]);

  const handleCrearRepuestoCatalogo = async () => {
    if (nuevoRepuestoSaving) return;
    const nombre = nuevoRepuestoNombre.trim();
    const costoBase = parseNumberInput(nuevoRepuestoCostoBase);
    const precioSugeridoCliente = parseNumberInput(nuevoRepuestoPrecioSugerido);

    if (!nombre) {
      setNuevoRepuestoError("El nombre del repuesto es obligatorio.");
      return;
    }

    setNuevoRepuestoSaving(true);
    setNuevoRepuestoError(null);
    try {
      const res = await fetch("/api/tecnicos/catalogo/repuestos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          costoBase,
          precioSugeridoCliente,
          proveedorHabitual: nuevoRepuestoProveedorHabitual.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo crear el repuesto");
      }

      const created = json.data as CatalogoRepuestoItem;
      setCatalogoRepuestos((prev) =>
        [...prev, created].sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
        )
      );
      selectRepuesto(created);
      setOpenCreateRepuestoModal(false);
      resetCrearRepuestoForm();
    } catch (err) {
      setNuevoRepuestoError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setNuevoRepuestoSaving(false);
    }
  };

  const handleCrearServicioCatalogo = async () => {
    if (nuevoServicioSaving) return;
    const nombre = nuevoServicioNombre.trim();
    const costoSugerido = parseNumberInput(nuevoServicioCostoSugerido);

    if (!nombre) {
      setNuevoServicioError("El nombre del servicio es obligatorio.");
      return;
    }

    setNuevoServicioSaving(true);
    setNuevoServicioError(null);
    try {
      const res = await fetch("/api/tecnicos/catalogo/servicios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, costoSugerido }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo crear el servicio");
      }

      const created = json.data as CatalogoServicioItem;
      setCatalogoServicios((prev) =>
        [...prev, created].sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
        )
      );
      selectServicio(created);
      setOpenCreateServicioModal(false);
      resetCrearServicioForm();
    } catch (err) {
      setNuevoServicioError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setNuevoServicioSaving(false);
    }
  };

  const handleGuardarRepuesto = async () => {
    if (!id || repuestoSaving) return;
    setRepuestoError(null);

    const cantidad = parseNumberInput(repuestoCantidad);
    const precioCliente = parseNumberInput(repuestoPrecioCliente);
    const costoProveedor = parseNumberInput(repuestoCostoProveedor);

    if (!selectedRepuesto) {
      setRepuestoError("Selecciona un repuesto del catÃ¡logo.");
      return;
    }
    if (cantidad === null || cantidad <= 0) {
      setRepuestoError("La cantidad debe ser mayor a 0.");
      return;
    }
    if (precioCliente === null || precioCliente < 0) {
      setRepuestoError("Ingresa el precio cliente real.");
      return;
    }

    setRepuestoSaving(true);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(id)}/repuestos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogoRepuestoId: selectedRepuesto.id,
          nombreSnapshot: selectedRepuesto.nombre,
          cantidad,
          precioCliente,
          costoProveedor,
          proveedor: repuestoProveedor.trim() || null,
          observacion: repuestoObservacion.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo agregar el repuesto");
      }

      const nuevo = json.data as RepuestoItem;
      setOrden((prev) =>
        prev
          ? {
              ...prev,
              repuestosPorOrden: [...(prev.repuestosPorOrden ?? []), nuevo],
            }
          : prev
      );
      resetRepuestoComposer();
      await refreshOrdenDetalleFinanzas();
    } catch (err) {
      setRepuestoError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setRepuestoSaving(false);
    }
  };

  const handleGuardarServicio = async () => {
    if (!id || servicioSaving) return;
    setServicioError(null);

    const costo = parseNumberInput(servicioCosto);
    if (!selectedServicio) {
      setServicioError("Selecciona un servicio del catÃ¡logo.");
      return;
    }
    if (costo === null || costo < 0) {
      setServicioError("Ingresa el costo real.");
      return;
    }

    setServicioSaving(true);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(id)}/servicios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogoServicioId: selectedServicio.id,
          nombreSnapshot: selectedServicio.nombre,
          costo,
          observacion: servicioObservacion.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo agregar el servicio");
      }

      const nuevo = json.data as ServicioItem;
      setOrden((prev) =>
        prev
          ? {
              ...prev,
              serviciosPorOrden: [...(prev.serviciosPorOrden ?? []), nuevo],
            }
          : prev
      );
      resetServicioComposer();
      await refreshOrdenDetalleFinanzas();
    } catch (err) {
      setServicioError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setServicioSaving(false);
    }
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
    if (!ABONO_METODOS_PAGO.includes(metodoPago as (typeof ABONO_METODOS_PAGO)[number])) {
      setAbonoError("El método de pago seleccionado no es válido.");
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
      formData.set("observacion", abonoObservacion.trim());
      formData.set("registradoPor", "");
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

  const handleDeleteRepuestoConfirm = async (repuestoPorOrdenId: string) => {
    setRepuestoDeleteError(null);
    setRepuestoDeletingId(repuestoPorOrdenId);
    try {
      const res = await fetch(
        `/api/tecnicos/repuestos-por-orden/${encodeURIComponent(repuestoPorOrdenId)}`,
        {
          method: "DELETE",
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo eliminar el repuesto");
      }

      setOrden((prev) =>
        prev
          ? {
              ...prev,
              repuestosPorOrden: (prev.repuestosPorOrden ?? []).filter(
                (item) => item.id !== repuestoPorOrdenId
              ),
            }
          : prev
      );
      setRepuestoDeleteConfirmId(null);
      await refreshOrdenDetalleFinanzas();
    } catch (err) {
      setRepuestoDeleteError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setRepuestoDeletingId(null);
    }
  };

  const handleDeleteServicioConfirm = async (servicioPorOrdenId: string) => {
    setServicioDeleteError(null);
    setServicioDeletingId(servicioPorOrdenId);
    try {
      const res = await fetch(
        `/api/tecnicos/servicios-por-orden/${encodeURIComponent(servicioPorOrdenId)}`,
        {
          method: "DELETE",
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo eliminar el servicio");
      }

      setOrden((prev) =>
        prev
          ? {
              ...prev,
              serviciosPorOrden: (prev.serviciosPorOrden ?? []).filter(
                (item) => item.id !== servicioPorOrdenId
              ),
            }
          : prev
      );
      setServicioDeleteConfirmId(null);
      await refreshOrdenDetalleFinanzas();
    } catch (err) {
      setServicioDeleteError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setServicioDeletingId(null);
    }
  };

  const handleDeleteAbonoConfirm = async (abonoPorOrdenId: string) => {
    setAbonoDeleteError(null);
    setAbonoDeletingId(abonoPorOrdenId);
    try {
      const res = await fetch(`/api/tecnicos/abonos-por-orden/${encodeURIComponent(abonoPorOrdenId)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo eliminar el abono");
      }

      setOrden((prev) =>
        prev
          ? {
              ...prev,
              abonosPorOrden: (prev.abonosPorOrden ?? []).filter((item) => item.id !== abonoPorOrdenId),
            }
          : prev
      );
      setAbonoDeleteConfirmId(null);
      if (comprobanteViewer?.abonoId === abonoPorOrdenId) {
        closeComprobanteViewer();
      }
      await refreshOrdenDetalleFinanzas();
      setAbonoMessage("Abono eliminado correctamente.");
    } catch (err) {
      setAbonoDeleteError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAbonoDeletingId(null);
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

  const handleAgregarComprobanteAbono = async (abonoId: string, file: File | null) => {
    if (!file || abonoAdjuntoUploadingId) return;
    setAbonoAdjuntoError((prev) => ({ ...prev, [abonoId]: null }));
    setAbonoAdjuntoUploadingId(abonoId);

    try {
      const formData = new FormData();
      formData.set("comprobanteArchivo", file);

      const res = await fetch(`/api/tecnicos/abonos-por-orden/${encodeURIComponent(abonoId)}/comprobantes`, {
        method: "POST",
        body: formData,
      });
      const payload = await parseApiResponseSafely(res);

      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.trim() || "No se pudo agregar el comprobante");
      }

      replaceAbonoInState(payload.data as AbonoItem);
      setAbonoMessage(
        typeof payload.warning === "string" && payload.warning.trim()
          ? `Comprobante agregado. ${payload.warning}`
          : "Comprobante agregado correctamente."
      );
    } catch (err) {
      setAbonoAdjuntoError((prev) => ({
        ...prev,
        [abonoId]: err instanceof Error ? err.message : "Error desconocido",
      }));
    } finally {
      setAbonoAdjuntoUploadingId(null);
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

  const handleSaveInline = async () => {
    if (submitLocked.current || saving) return;
    const text = avanceTexto.trim();
    if (!text) {
      setNuevoEstadoError("El estado no puede estar vacÃ­o");
      return;
    }
    setNuevoEstadoError(null);
    submitLocked.current = true;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/historial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avanceTexto: text }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo guardar el avance");
      }
      const nuevo = json.data;
      setOrden((prev) =>
        prev
          ? {
              ...prev,
              historial: [...prev.historial, nuevo],
            }
          : prev
      );
      setSaveMessage("Avance guardado correctamente.");
      setAvanceTexto("");
      setInlineEditing(false);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
      submitLocked.current = false;
    }
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
      setEstadoMessage("Estado guardado");
      setTimeout(() => setEstadoMessage(null), 1200);
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

  const replaceHistorialItem = (updated: HistorialItem) => {
    setOrden((prev) =>
      prev
        ? {
            ...prev,
            historial: prev.historial.map((h) => (h.id === updated.id ? { ...h, ...updated } : h)),
          }
        : prev
    );
  };

  const pollHistorialMensaje = (historialId: string, attempt = 0) => {
    const maxAttempts = 10;
    const delay = 2000;

    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tecnicos/historial/${encodeURIComponent(historialId)}`);
        const json = await res.json();
        if (res.ok && json.success && json.data?.estadoGeneradoIA) {
          replaceHistorialItem(json.data);
          setMensajeLoading((prev) => ({ ...prev, [historialId]: false }));
          setMensajeVisible((prev) => ({ ...prev, [historialId]: true }));
          pollingRefs.current.delete(historialId);
          return;
        }
      } catch (err) {
        setMensajeError((prev) => ({
          ...prev,
          [historialId]: err instanceof Error ? err.message : "Error al consultar",
        }));
        setMensajeLoading((prev) => ({ ...prev, [historialId]: false }));
        pollingRefs.current.delete(historialId);
        return;
      }

      if (attempt + 1 >= maxAttempts) {
        setMensajeError((prev) => ({
          ...prev,
          [historialId]: "Aún no disponible, intenta de nuevo.",
        }));
        setMensajeLoading((prev) => ({ ...prev, [historialId]: false }));
        pollingRefs.current.delete(historialId);
        return;
      }

      pollHistorialMensaje(historialId, attempt + 1);
    }, delay);

    pollingRefs.current.set(historialId, timeoutId);
  };

  const handleGenerarMensaje = async (historialId: string) => {
    if (!historialId) return;
    setMensajeError((prev) => ({ ...prev, [historialId]: null }));
    setMensajeLoading((prev) => ({ ...prev, [historialId]: true }));

    try {
      const res = await fetch(`/api/tecnicos/historial/${encodeURIComponent(historialId)}/generar-mensaje`, {
        method: "PATCH",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo solicitar el mensaje");
      }
      pollHistorialMensaje(historialId, 0);
    } catch (err) {
      setMensajeError((prev) => ({
        ...prev,
        [historialId]: err instanceof Error ? err.message : "Error desconocido",
      }));
      setMensajeLoading((prev) => ({ ...prev, [historialId]: false }));
    }
  };

  
  const handleStartEdit = (item: HistorialItem) => {
    setEditingId(item.id);
    const texto = item.estadoNuevo ?? "";
    setEditingValue(texto);
    setEditingOriginal(texto);
    setEditingError(null);
    setTimeout(() => editInlineRef.current?.focus(), 10);
  };

  const resetEditing = () => {
    setEditingId(null);
    setEditingValue("");
    setEditingOriginal("");
    setEditingError(null);
  };

  const handleSaveEdicion = async () => {
    if (!editingId || editingSaving) return;
    const trimmed = editingValue.trim();
    if (!trimmed) {
      setEditingError("El estado no puede estar vac?o");
      return;
    }

    setEditingSaving(true);
    setEditingError(null);
    try {
      const res = await fetch(`/api/tecnicos/historial/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estadoNuevo: trimmed, estadoGeneradoIA: "" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo actualizar el estado");
      }
      const updated = json.data as HistorialItem;
      replaceHistorialItem({
        ...updated,
        estadoGeneradoIA: updated.estadoGeneradoIA ?? null,
      });
      setMensajeError((prev) => ({ ...prev, [editingId]: null }));
      setMensajeVisible((prev) => ({ ...prev, [editingId]: false }));
      resetEditing();
    } catch (err) {
      setEditingError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setEditingSaving(false);
    }
  };

  const handleBlurEdicion = () => {
    if (!editingId || editingSaving) return;
    const trimmed = editingValue.trim();
    if (!trimmed) return;
    if (trimmed === editingOriginal.trim()) {
      resetEditing();
      return;
    }
    handleSaveEdicion();
  };

  const handleDeleteConfirm = async (historialId: string) => {
    setDeleteError(null);
    setDeletingId(historialId);
    try {
      const res = await fetch(`/api/tecnicos/historial/${encodeURIComponent(historialId)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudo eliminar el estado");
      }
      setOrden((prev) =>
        prev
          ? {
              ...prev,
              historial: prev.historial.filter((h) => h.id !== historialId),
            }
          : prev
      );
      setMensajeVisible((prev) => {
        const copy = { ...prev };
        delete copy[historialId];
        return copy;
      });
      setMensajeError((prev) => {
        const copy = { ...prev };
        delete copy[historialId];
        return copy;
      });
      setMensajeLoading((prev) => {
        const copy = { ...prev };
        delete copy[historialId];
        return copy;
      });
      setDeleteConfirmId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleMensajeVisible = (historialId: string) => {
    setMensajeVisible((prev) => ({ ...prev, [historialId]: !prev[historialId] }));
  };

  const handleWhatsappSend = (historialId: string, mensaje?: string | null) => {
    if (!orden || !mensaje) return;
    const phone = normalizeWhatsappPhone(orden.telefono);
    if (!phone) {
      setWhatsappError((prev) => ({ ...prev, [historialId]: "TelÃ©fono no disponible" }));
      return;
    }
    const url = buildWhatsappUrl(phone, mensaje);
    window.open(url, "_blank", "noopener,noreferrer");
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

  const saveNotaInterna = async (value: string) => {
    const trimmed = value.trim();
    const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/nota`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notaInterna: trimmed }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || "No se pudo actualizar la nota interna");
    setOrden((prev) => (prev ? { ...prev, notaInterna: trimmed } : prev));
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (repuestoComposerRef.current && !repuestoComposerRef.current.contains(target)) {
        setShowRepuestoResults(false);
      }
      if (servicioComposerRef.current && !servicioComposerRef.current.contains(target)) {
        setShowServicioResults(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowRepuestoResults(false);
      setShowServicioResults(false);
      setRepuestoSearch("");
      setServicioSearch("");
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    return () => {
      pollingRefs.current.forEach((timeoutId) => clearTimeout(timeoutId));
      pollingRefs.current.clear();
    }
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
            <section className="overflow-hidden rounded-xl border border-[var(--sg-border)] bg-[#1E1F1C] shadow-[var(--sg-shadow-card)]">
              <div className={`h-[3px] w-full ${
                estadoSeleccionado === "En Proceso" ? "bg-[var(--sg-lime)]" :
                estadoSeleccionado === "Completado" || estadoSeleccionado === "Finalizado Entregado" ? "bg-[var(--sg-success)]" :
                estadoSeleccionado === "Esperando Respuesta" ? "bg-[var(--sg-warning)]" :
                estadoSeleccionado === "Enviado a Reciclaje" ? "bg-[var(--sg-danger)]" :
                "bg-[var(--sg-border)]"
              }`} />
              <div className="px-5 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <Link
                      href="/tecnicos/ordenes"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--sg-text-muted)] transition hover:text-[var(--sg-lime)]"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                      Volver a órdenes
                    </Link>
                    <p className="mt-2 font-mono text-[2.4rem] font-black leading-none tracking-tight text-[var(--sg-lime)]">
                      {orden.idVisible}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-sm text-[var(--sg-text-muted)]">
                        {[orden.tipoOrden, formatDate(orden.fechaIngreso)].filter(Boolean).join(" · ")}
                      </span>
                      <span className="select-none text-[var(--sg-border)]">|</span>
                      <a
                        href={`/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/imprimir/ticket`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--sg-text-muted)] transition hover:text-[var(--sg-lime)]"
                      >
                        <PrintIcon className="h-3.5 w-3.5" />
                        Constancia
                      </a>
                      <a
                        href={`/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/imprimir/etiqueta`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--sg-text-muted)] transition hover:text-[var(--sg-lime)]"
                      >
                        <PrintIcon className="h-3.5 w-3.5" />
                        Etiqueta
                      </a>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
                    <div
                      className={`relative w-52 ${
                        estadoSaving || loading ? "pointer-events-none opacity-70" : ""
                      }`}
                    >
                      <StatusFilterDropdown
                        value={estadoSeleccionado}
                        onChange={(value) => handleEstadoChange(value as EstadoOrden)}
                        options={ESTADOS_ORDEN.map((estado) => ({
                          value: estado,
                          label: estado,
                        }))}
                        label=""
                        className="text-left"
                        dropdownClassName="max-w-[280px]"
                        buttonClassName="!h-[28px] !rounded-full !px-3.5 !py-0 !text-xs !font-bold !uppercase !tracking-wide !text-[var(--sg-lime)] !shadow-none !border !border-[var(--sg-lime)]/30"
                      />
                    </div>
                    {(estadoSaving || estadoMessage || estadoError) && (
                      <div className="min-h-4 text-[11px] text-[var(--sg-text-muted)]">
                        {estadoSaving && <span className="text-[var(--sg-lime)]">Guardando...</span>}
                        {!estadoSaving && estadoMessage && <span>{estadoMessage}</span>}
                        {estadoError && <span className="text-red-400">{estadoError}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {abandonmentStatus.level !== "none" && (
              <section
                className={`rounded-xl border px-3 py-2.5 shadow-[var(--sg-shadow-card)] ${
                  abandonmentStatus.level === "critical"
                    ? "border-[var(--sg-danger)] bg-[var(--sg-danger-soft)]"
                    : "border-[var(--sg-warning)] bg-[var(--sg-warning-soft)]"
                }`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                        abandonmentStatus.level === "critical"
                          ? "text-[var(--sg-danger)]"
                          : "text-[var(--sg-warning)]"
                      }`}
                    >
                      Alertas de orden
                    </p>
                    <h3 className="mt-1 text-lg font-extrabold text-[var(--sg-text-primary)]">
                      {abandonmentStatus.level === "critical"
                        ? "Cumple política para baja"
                        : "Orden próxima a baja"}
                    </h3>
                    <p className="mt-1 max-w-3xl text-sm leading-5 text-[var(--sg-text-primary)]">
                      {abandonmentStatus.message}
                    </p>
                    {abandonmentStatus.referenceDate && (
                      <p className="mt-2 text-xs text-[var(--sg-text-secondary)]">
                        Fecha de referencia: {formatDate(abandonmentStatus.referenceDate)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 md:items-end">
                    {abandonmentWhatsAppUrl ? (
                      <a
                        href={abandonmentWhatsAppUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--sg-radius-md)] border border-[var(--sg-lime)] bg-[var(--sg-card)] px-4 text-sm font-semibold text-[var(--sg-text-primary)] transition hover:bg-[var(--sg-lime-soft)] hover:text-[var(--sg-lime)] focus:outline-none focus:ring-2 focus:ring-[var(--sg-lime)] focus:ring-offset-2 focus:ring-offset-[var(--sg-panel)]"
                      >
                        <WhatsappIcon className="h-4 w-4 text-[var(--sg-lime)]" />
                        Enviar aviso por WhatsApp
                      </a>
                    ) : (
                      <span className="inline-flex min-h-10 items-center rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-4 py-2 text-xs font-semibold text-[var(--sg-text-secondary)]">
                        Cliente sin teléfono registrado
                      </span>
                    )}
                    {abandonmentStatus.level === "critical" && (
                      <button
                        type="button"
                        onClick={() => {
                          setBajaError(null);
                          setBajaModalOpen(true);
                        }}
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-[var(--sg-radius-md)] border border-[var(--sg-danger)] bg-[var(--sg-card)] px-4 text-sm font-semibold text-[var(--sg-danger)] transition hover:bg-[var(--sg-danger-soft)]"
                      >
                        Marcar baja interna
                      </button>
                    )}
                  </div>
                </div>
              </section>
            )}

            <div className="grid items-start gap-2.5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.75fr)]">
              <div className="min-w-0 space-y-2.5">
                <section className="rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-3 shadow-[var(--sg-shadow-card)]">
                  <div className="grid gap-4 lg:grid-cols-2 lg:gap-0">
                    {/* CLIENTE */}
                    <div className="relative min-w-0 lg:pl-3 lg:pr-6">
                      <div className="absolute inset-y-0 left-0 hidden w-px bg-[var(--sg-lime)]/30 lg:block" />
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sg-lime)]/70">Cliente</p>
                      <div className="mt-1.5 space-y-1">
                        <InlineEditField
                          value={orden.clienteNombre}
                          onSave={saveClienteNombre}
                          required
                          placeholder="Sin nombre"
                        />
                        <div className="flex items-center gap-1.5">
                          <PhoneIcon className="h-3.5 w-3.5 shrink-0 text-[var(--sg-text-muted)]" />
                          <div className="min-w-0">
                            <InlineEditField
                              value={orden.telefono}
                              onSave={(v) => saveOrdenField("telefono", v)}
                              placeholder="Sin teléfono"
                            />
                          </div>
                          {buildWhatsAppLink(orden.telefono) ? (
                            <a
                              href={buildWhatsAppLink(orden.telefono) ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir WhatsApp"
                              className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--sg-lime)] text-[var(--sg-text-on-accent)] shadow-[0_0_12px_rgba(227,252,2,0.35)] transition hover:brightness-110"
                            >
                              <WhatsappIcon className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--sg-border)] bg-[var(--sg-panel)] text-[var(--sg-text-muted)]">
                              <WhatsappIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <IdCardIcon className="h-3.5 w-3.5 shrink-0 text-[var(--sg-text-muted)]" />
                          <div className="min-w-0 flex-1">
                            <InlineEditField
                              value={orden.cedula}
                              onSave={saveClienteCedula}
                              placeholder="Sin cédula"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* DISPOSITIVO */}
                    <div className="min-w-0 border-t border-[var(--sg-divider)] pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">Dispositivo</p>
                      <div className="mt-1.5 space-y-2">
                        <div className="flex items-start gap-2">
                          <DesktopIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sg-text-muted)]" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-wide text-[var(--sg-text-muted)]">Equipo</p>
                            <InlineEditField
                              value={orden.equipo}
                              onSave={(v) => saveOrdenField("equipo", v)}
                              required
                              placeholder="Sin equipo"
                            />
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <UsbIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sg-text-muted)]" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-wide text-[var(--sg-text-muted)]">Accesorios</p>
                            <InlineEditField
                              value={orden.accesorios}
                              onSave={(v) => saveOrdenField("accesorios", v)}
                              placeholder="Sin accesorios"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

            <section className="grid gap-2 md:grid-cols-2">
              <div className="relative overflow-hidden rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-2.5 shadow-[var(--sg-shadow-card)]">
                <div className="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-[var(--sg-lime)]" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sg-lime)]">Motivo de ingreso</p>
                <div className="mt-1">
                  <InlineEditField
                    value={orden.ingresaPor === "No disponible" ? "" : orden.ingresaPor}
                    onSave={(v) => saveOrdenField("ingresaPor", v)}
                    placeholder="No disponible"
                  />
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-2.5 shadow-[var(--sg-shadow-card)]">
                <div className="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-[var(--sg-lime)]" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sg-lime)]">Nota interna</p>
                <div className="mt-1">
                  <InlineEditField
                    value={orden.notaInterna === "No disponible" ? "" : orden.notaInterna}
                    onSave={saveNotaInterna}
                    multiline
                    placeholder="Sin nota interna"
                  />
                </div>
                {orden.recomendaciones && (
                  <p className="mt-1.5 text-xs text-[var(--sg-text-muted)]">Recomendaciones: {orden.recomendaciones}</p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-3 shadow-[var(--sg-shadow-card)]">
              <div className="flex items-center justify-between border-b border-[var(--sg-divider)] pb-2">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">
                    Historial
                  </p>
                  <span className="rounded-full bg-[var(--sg-panel)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--sg-text-secondary)]">
                    {orden.historial.length}
                  </span>
                </div>
                {!inlineEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setInlineEditing(true);
                      setTimeout(() => inlineInputRef.current?.focus(), 10);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--sg-lime)]/40 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--sg-lime)] transition hover:border-[var(--sg-lime)] hover:bg-[var(--sg-lime-soft)]"
                  >
                    <span aria-hidden>+</span> Agregar
                  </button>
                )}
              </div>

              {inlineEditing && (
                <div className="mt-2.5 rounded-[var(--sg-radius-md)] border border-[var(--sg-lime)]/30 bg-[var(--sg-panel)] px-3 py-3">
                  <div className="space-y-1.5">
                    <textarea
                      ref={inlineInputRef}
                      value={avanceTexto}
                      onChange={(e) => setAvanceTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSaveInline();
                        }
                        if (e.key === "Escape") {
                          setInlineEditing(false);
                          setAvanceTexto("");
                          setSaveMessage(null);
                          setNuevoEstadoError(null);
                        }
                      }}
                      onBlur={() => {
                        if (avanceTexto.trim()) handleSaveInline();
                      }}
                      rows={2}
                      className="w-full resize-none rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-2 text-sm leading-relaxed text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] transition focus:border-[var(--sg-lime)] focus:outline-none"
                      placeholder="Escribe una actualización rápida…"
                      disabled={saving}
                    />
                    {nuevoEstadoError && (
                      <p className="text-xs text-red-400">{nuevoEstadoError}</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-[var(--sg-text-muted)]">
                      <span>Enter guarda · Esc cancela</span>
                      {saving && <span className="text-[var(--sg-lime)]">Guardando…</span>}
                    </div>
                  </div>
                </div>
              )}

              {orden.historial.length === 0 && !inlineEditing ? (
                <p className="mt-2.5 rounded-[var(--sg-radius-md)] border border-dashed border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-4 text-sm text-[var(--sg-text-secondary)]">
                  Sin historial registrado.
                </p>
              ) : (
                <div className="mt-1 divide-y divide-[var(--sg-divider)]">
                  {orden.historial.map((item) => {
                    const title = buildTimelineTitle(item.estadoNuevo);
                    const notaLimpia = (item.nota ?? "").trim();
                    const showNota =
                      notaLimpia &&
                      notaLimpia.toLowerCase() !== title.toLowerCase();
                    const isEditing = editingId === item.id;
                    const isMensajeLoading = mensajeLoading[item.id];
                    const actionButtonClass =
                      "inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--sg-text-muted)] transition hover:bg-[var(--sg-panel)] hover:text-[var(--sg-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--sg-lime)] disabled:cursor-not-allowed disabled:opacity-40";
                    return (
                      <div
                        key={item.id}
                        className="group py-2.5 text-sm text-[var(--sg-text-primary)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            {isEditing ? (
                              <div className="space-y-1">
                                <textarea
                                  ref={editInlineRef}
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      handleSaveEdicion();
                                    }
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      resetEditing();
                                    }
                                  }}
                                  onBlur={handleBlurEdicion}
                                  rows={3}
                                  className="w-full resize-none rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-sm leading-relaxed text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] transition focus:border-[var(--sg-lime)] focus:outline-none"
                                  placeholder="Ajusta el estado"
                                  disabled={editingSaving}
                                />
                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--sg-text-muted)]">
                                  <span>Enter guarda · Esc cancela</span>
                                  {editingSaving && <span className="text-[var(--sg-lime)]">Guardando…</span>}
                                  {editingError && <span className="text-red-400">{editingError}</span>}
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="font-semibold leading-snug text-[var(--sg-text-primary)]">{title}</p>
                                {showNota && (
                                  <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-[var(--sg-text-secondary)]">
                                    {notaLimpia}
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-[var(--sg-text-muted)]">
                                  <span>{formatTimelineDate(item.fecha)}</span>
                                  {item.creadoPorNombre ? (
                                    <>
                                      <span className="select-none">·</span>
                                      <span>{item.creadoPorNombre}</span>
                                    </>
                                  ) : item.tecnicoNombre ? (
                                    <>
                                      <span className="select-none">·</span>
                                      <span>{item.tecnicoNombre}</span>
                                    </>
                                  ) : null}
                                  {isMensajeLoading && <span className="text-[var(--sg-lime)]">Generando…</span>}
                                  {mensajeError[item.id] && <span className="text-red-400">{mensajeError[item.id]}</span>}
                                  {whatsappError[item.id] && <span className="text-red-400">{whatsappError[item.id]}</span>}
                                </div>
                              </>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              className={actionButtonClass}
                              title="Editar"
                              disabled={editingSaving && isEditing}
                            >
                              <EditIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleGenerarMensaje(item.id)}
                              className={actionButtonClass}
                              title={item.estadoGeneradoIA ? "Regenerar mensaje IA" : "Generar mensaje IA"}
                              disabled={isMensajeLoading || editingId === item.id}
                            >
                              {isMensajeLoading ? (
                                <span className="h-3 w-3 animate-spin rounded-full border border-[var(--sg-lime)] border-t-transparent" />
                              ) : (
                                <RefreshIcon className="h-3.5 w-3.5" />
                              )}
                            </button>
                            {item.estadoGeneradoIA && (
                              <button
                                type="button"
                                onClick={() => toggleMensajeVisible(item.id)}
                                className={actionButtonClass}
                                title={mensajeVisible[item.id] ? "Ocultar mensaje IA" : "Ver mensaje IA"}
                              >
                                <EyeIcon className="h-3.5 w-3.5" off={mensajeVisible[item.id]} />
                              </button>
                            )}
                            {item.estadoGeneradoIA && (
                              <button
                                type="button"
                                onClick={() => handleWhatsappSend(item.id, item.estadoGeneradoIA)}
                                className={actionButtonClass}
                                title="Enviar por WhatsApp"
                              >
                                <WhatsappIcon className="h-3.5 w-3.5 text-[var(--sg-lime)]" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteConfirmId((prev) => (prev === item.id ? null : item.id))
                              }
                              className={`${actionButtonClass} hover:text-[var(--sg-danger)]`}
                              title="Eliminar"
                              disabled={deletingId === item.id}
                            >
                              {deletingId === item.id ? (
                                <span className="h-3 w-3 animate-spin rounded-full border border-red-400/70 border-t-transparent" />
                              ) : (
                                <TrashIcon className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {item.estadoGeneradoIA && mensajeVisible[item.id] && (
                          <div className="mt-2 whitespace-pre-wrap rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2.5 text-[0.8125rem] leading-relaxed text-[var(--sg-text-secondary)]">
                            {item.estadoGeneradoIA}
                          </div>
                        )}
                        {deleteConfirmId === item.id && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-[12px] text-[var(--sg-text-secondary)]">
                            <span className="flex-1 text-[var(--sg-text-muted)]">¿Eliminar este estado?</span>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              className="rounded border border-[var(--sg-border)] px-2 py-0.5 text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)] hover:text-[var(--sg-text-primary)]"
                              disabled={deletingId === item.id}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteConfirm(item.id)}
                              className="rounded border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-2 py-0.5 text-[var(--sg-danger)] transition hover:brightness-110 disabled:opacity-60"
                              disabled={deletingId === item.id}
                            >
                              Eliminar
                            </button>
                            {deleteError && <span className="text-red-400">{deleteError}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="grid items-start gap-4 overflow-visible xl:grid-cols-2">
              <div
                className={`relative min-w-0 ${
                  showRepuestoResults ? "z-[80]" : "z-10"
                }`}
              >
                <section className="relative isolate h-full space-y-3 overflow-visible rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-4 py-4 shadow-[var(--sg-shadow-card)]">
              <div className="flex items-start justify-between gap-4 border-b border-[var(--sg-divider)] pb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">
                    Repuestos usados
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--sg-text-muted)]">
                    {orden.repuestosPorOrden?.length ?? 0} líneas registradas
                  </p>
                </div>
                <div className="rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sg-text-muted)]">Total cliente</p>
                  <p className="mt-1 text-base font-extrabold text-[var(--sg-lime)]">
                    {formatCurrency(
                      (orden.repuestosPorOrden ?? []).reduce((acc, item) => {
                        if (item.subtotalCliente !== null && item.subtotalCliente !== undefined) {
                          return acc + item.subtotalCliente;
                        }
                        const qty = item.cantidad ?? 1;
                        const price = item.precioCliente ?? 0;
                        return acc + qty * price;
                      }, 0)
                    )}
                  </p>
                </div>
              </div>

              <div
                ref={repuestoComposerRef}
                className="relative z-30 isolate space-y-3 overflow-visible rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card-elevated)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <div className="relative z-30">
                  <input
                    type="text"
                    value={repuestoSearch}
                    onChange={(e) => {
                      setRepuestoSearch(e.target.value);
                      if (repuestoComposerRef.current) {
                        const rect = repuestoComposerRef.current.getBoundingClientRect();
                        setRepuestoPlacement(window.innerHeight - rect.bottom < 280 && rect.top > 280 ? "top" : "bottom");
                      }
                      setShowRepuestoResults(true);
                      if (catalogoRepuestos.length === 0 && !catalogoRepuestosLoading) {
                        loadCatalogoRepuestos();
                      }
                    }}
                    onFocus={() => {
                      if (repuestoComposerRef.current) {
                        const rect = repuestoComposerRef.current.getBoundingClientRect();
                        setRepuestoPlacement(window.innerHeight - rect.bottom < 280 && rect.top > 280 ? "top" : "bottom");
                      }
                      setShowRepuestoResults(true);
                      if (catalogoRepuestos.length === 0) {
                        loadCatalogoRepuestos();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setShowRepuestoResults(false);
                        setRepuestoSearch("");
                      }
                    }}
                    placeholder="Buscar repuesto..."
                    className="w-full rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] transition focus:border-[var(--sg-lime)] focus:outline-none"
                  />
                  {showRepuestoResults && (
                    <div className={`absolute left-0 right-0 z-[120] flex rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-bg)] shadow-2xl ring-1 ring-black/40 ${repuestoPlacement === "top" ? "bottom-full mb-2 flex-col-reverse" : "top-full mt-2 flex-col"}`}>
                      {catalogoRepuestosLoading ? (
                        <p className="px-3 py-2 text-xs text-[var(--sg-text-muted)]">Cargando repuestos...</p>
                      ) : catalogoRepuestosError ? (
                        <p className="px-3 py-2 text-xs text-red-400">{catalogoRepuestosError}</p>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenCreateRepuestoModal(true);
                              setShowRepuestoResults(false);
                            }}
                            className={`flex w-full flex-none items-center gap-1.5 px-3 py-2 text-left text-sm font-semibold text-[var(--sg-lime)] transition hover:bg-[var(--sg-card)] border-[var(--sg-border)] ${repuestoPlacement === "top" ? "border-t" : "border-b"}`}
                          >
                            + Crear repuesto nuevo
                          </button>
                          <div className="max-h-52 overflow-auto overscroll-contain">
                            {filteredCatalogoRepuestos.length === 0 && (
                              <p className="px-3 py-2 text-xs text-[var(--sg-text-muted)]">Sin coincidencias.</p>
                            )}
                            {filteredCatalogoRepuestos.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => selectRepuesto(item)}
                                className="flex w-full flex-col items-start gap-1 border-b border-[var(--sg-border)] px-3 py-2 text-left transition hover:bg-[var(--sg-card)]"
                              >
                                <span className="text-sm font-semibold text-[var(--sg-text-primary)]">{item.nombre}</span>
                                <span className="text-[11px] text-[var(--sg-text-muted)]">
                                  {item.proveedorHabitual ?? "Proveedor no definido"} · {formatCurrency(item.precioSugeridoCliente)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {selectedRepuesto && (
                  <div className="space-y-3 rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--sg-text-primary)]">{selectedRepuesto.nombre}</p>
                        <p className="text-[11px] text-[var(--sg-text-muted)]">
                          {selectedRepuesto.proveedorHabitual ?? "Proveedor no definido"} · Precio sugerido {formatCurrency(selectedRepuesto.precioSugeridoCliente)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedRepuesto(null)}
                        className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] px-2 py-1 text-[11px] text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)] hover:text-[var(--sg-text-primary)]"
                      >
                        Cambiar
                      </button>
                    </div>

                    <div className="grid gap-2 md:grid-cols-5">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={repuestoCantidad}
                        onChange={(e) => setRepuestoCantidad(e.target.value)}
                        placeholder="Cantidad"
                        className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] transition focus:border-[var(--sg-lime)] focus:outline-none"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={repuestoPrecioCliente}
                        onChange={(e) => setRepuestoPrecioCliente(e.target.value)}
                        placeholder="Precio cliente real"
                        className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] transition focus:border-[var(--sg-lime)] focus:outline-none"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={repuestoCostoProveedor}
                        onChange={(e) => setRepuestoCostoProveedor(e.target.value)}
                        placeholder="Costo proveedor real"
                        className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] transition focus:border-[var(--sg-lime)] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={repuestoProveedor}
                        onChange={(e) => setRepuestoProveedor(e.target.value)}
                        placeholder="Proveedor real"
                        className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] transition focus:border-[var(--sg-lime)] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={repuestoObservacion}
                        onChange={(e) => setRepuestoObservacion(e.target.value)}
                        placeholder="Observación"
                        className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] transition focus:border-[var(--sg-lime)] focus:outline-none"
                      />
                    </div>

                    {repuestoError && <p className="text-xs text-red-400">{repuestoError}</p>}

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={handleGuardarRepuesto}
                        disabled={repuestoSaving}
                        className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-lime)] bg-[var(--sg-lime-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--sg-lime)] transition hover:brightness-110 disabled:opacity-60"
                      >
                        {repuestoSaving ? "Guardando..." : "Guardar repuesto"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {(orden.repuestosPorOrden ?? []).length === 0 ? (
                <p className="rounded-[var(--sg-radius-md)] border border-dashed border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-4 text-sm text-[var(--sg-text-secondary)]">
                  Aun no se han registrado repuestos en esta orden.
                </p>
              ) : (
                <div className="space-y-2">
                  {(orden.repuestosPorOrden ?? []).map((item) => {
                    const qty = item.cantidad ?? 1;
                    const price = item.precioCliente ?? 0;
                    const isDeleting = repuestoDeletingId === item.id;
                    const isConfirming = repuestoDeleteConfirmId === item.id;
                    const subtotal =
                      item.subtotalCliente !== null && item.subtotalCliente !== undefined
                        ? item.subtotalCliente
                        : qty * price;

                    return (
                      <div
                        key={item.id}
                        className="relative flex flex-col gap-2 overflow-hidden rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-4 py-3 text-sm"
                      >
                        <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-[var(--sg-lime)]" />
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-semibold leading-5 text-[var(--sg-text-primary)]">{item.repuestoNombre}</p>
                            <p className="text-xs text-[var(--sg-text-secondary)]">
                              Cantidad: {qty} · Precio cliente: {formatCurrency(item.precioCliente)}
                            </p>
                            {(item.costoProveedor !== null || item.proveedor || item.observacion) && (
                              <p className="text-xs text-[var(--sg-text-muted)]">
                                Costo proveedor: {formatCurrency(item.costoProveedor)} · Proveedor: {item.proveedor ?? "-"}
                              </p>
                            )}
                            {item.observacion && <p className="text-xs text-[var(--sg-text-muted)]">Obs: {item.observacion}</p>}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRepuestoDeleteError(null);
                                setRepuestoDeleteConfirmId((prev) => (prev === item.id ? null : item.id));
                              }}
                              className={lineDeleteActionButtonClass}
                              title="Eliminar repuesto"
                              aria-label="Eliminar repuesto"
                              disabled={isDeleting}
                            >
                              {isDeleting ? (
                                <span className="h-3 w-3 animate-spin rounded-full border border-red-400/70 border-t-transparent" />
                              ) : (
                                <TrashIcon className="h-4 w-4" />
                              )}
                            </button>
                            <div className="rounded-full border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-1 text-right text-sm font-semibold text-[var(--sg-text-primary)]">{formatCurrency(subtotal)}</div>
                          </div>
                        </div>
                        {isConfirming && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-[12px] text-[var(--sg-text-secondary)]">
                            <span className="text-[var(--sg-text-muted)]">¿Eliminar este repuesto de la orden?</span>
                            <button
                              type="button"
                              onClick={() => setRepuestoDeleteConfirmId(null)}
                              className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] px-2 py-1 text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)] hover:text-[var(--sg-text-primary)]"
                              disabled={isDeleting}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRepuestoConfirm(item.id)}
                              className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-2 py-1 text-[var(--sg-danger)] transition hover:brightness-110 disabled:opacity-60"
                              disabled={isDeleting}
                            >
                              Eliminar
                            </button>
                            {repuestoDeleteError && <span className="text-red-400">{repuestoDeleteError}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
                </section>
              </div>

              <div
                className={`relative min-w-0 ${
                  showServicioResults ? "z-[80]" : "z-10"
                }`}
              >
                <section className="relative isolate h-full space-y-3 overflow-visible rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-4 py-4 shadow-[var(--sg-shadow-card)]">
              <div className="flex items-start justify-between gap-4 border-b border-[var(--sg-divider)] pb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">
                    Servicios
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--sg-text-muted)]">
                    {orden.serviciosPorOrden?.length ?? 0} líneas registradas
                  </p>
                </div>
                <div className="rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sg-text-muted)]">Total</p>
                  <p className="mt-1 text-base font-extrabold text-[var(--sg-lime)]">
                    {formatCurrency(
                      (orden.serviciosPorOrden ?? []).reduce((acc, item) => acc + (item.costo ?? 0), 0)
                    )}
                  </p>
                </div>
              </div>

              <div
                ref={servicioComposerRef}
                className="relative z-30 isolate space-y-3 overflow-visible rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card-elevated)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <div className="relative z-30">
                  <input
                    type="text"
                    value={servicioSearch}
                    onChange={(e) => {
                      setServicioSearch(e.target.value);
                      if (servicioComposerRef.current) {
                        const rect = servicioComposerRef.current.getBoundingClientRect();
                        setServicioPlacement(window.innerHeight - rect.bottom < 280 && rect.top > 280 ? "top" : "bottom");
                      }
                      setShowServicioResults(true);
                      if (catalogoServicios.length === 0 && !catalogoServiciosLoading) {
                        loadCatalogoServicios();
                      }
                    }}
                    onFocus={() => {
                      if (servicioComposerRef.current) {
                        const rect = servicioComposerRef.current.getBoundingClientRect();
                        setServicioPlacement(window.innerHeight - rect.bottom < 280 && rect.top > 280 ? "top" : "bottom");
                      }
                      setShowServicioResults(true);
                      if (catalogoServicios.length === 0) {
                        loadCatalogoServicios();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setShowServicioResults(false);
                        setServicioSearch("");
                      }
                    }}
                    placeholder="Buscar servicio..."
                    className="w-full rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] transition focus:border-[var(--sg-lime)] focus:outline-none"
                  />
                  {showServicioResults && (
                    <div className={`absolute left-0 right-0 z-[120] flex rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-bg)] shadow-2xl ring-1 ring-black/40 ${servicioPlacement === "top" ? "bottom-full mb-2 flex-col-reverse" : "top-full mt-2 flex-col"}`}>
                      {catalogoServiciosLoading ? (
                        <p className="px-3 py-2 text-xs text-[var(--sg-text-muted)]">Cargando servicios...</p>
                      ) : catalogoServiciosError ? (
                        <p className="px-3 py-2 text-xs text-red-400">{catalogoServiciosError}</p>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenCreateServicioModal(true);
                              setShowServicioResults(false);
                            }}
                            className={`flex w-full flex-none items-center gap-1.5 px-3 py-2 text-left text-sm font-semibold text-[var(--sg-lime)] transition hover:bg-[var(--sg-card)] border-[var(--sg-border)] ${servicioPlacement === "top" ? "border-t" : "border-b"}`}
                          >
                            + Crear servicio nuevo
                          </button>
                          <div className="max-h-52 overflow-auto overscroll-contain">
                            {filteredCatalogoServicios.length === 0 && (
                              <p className="px-3 py-2 text-xs text-[var(--sg-text-muted)]">Sin coincidencias.</p>
                            )}
                            {filteredCatalogoServicios.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => selectServicio(item)}
                                className="flex w-full flex-col items-start gap-1 border-b border-[var(--sg-border)] px-3 py-2 text-left transition hover:bg-[var(--sg-card)]"
                              >
                                <span className="text-sm font-semibold text-[var(--sg-text-primary)]">{item.nombre}</span>
                                <span className="text-[11px] text-[var(--sg-text-muted)]">Costo sugerido: {formatCurrency(item.costoSugerido)}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {selectedServicio && (
                  <div className="space-y-3 rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--sg-text-primary)]">{selectedServicio.nombre}</p>
                        <p className="text-[11px] text-[var(--sg-text-muted)]">
                          Costo sugerido: {formatCurrency(selectedServicio.costoSugerido)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedServicio(null)}
                        className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] px-2 py-1 text-[11px] text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)] hover:text-[var(--sg-text-primary)]"
                      >
                        Cambiar
                      </button>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={servicioCosto}
                        onChange={(e) => setServicioCosto(e.target.value)}
                        placeholder="Costo real"
                        className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] transition focus:border-[var(--sg-lime)] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={servicioObservacion}
                        onChange={(e) => setServicioObservacion(e.target.value)}
                        placeholder="Observación"
                        className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] transition focus:border-[var(--sg-lime)] focus:outline-none"
                      />
                    </div>

                    {servicioError && <p className="text-xs text-red-400">{servicioError}</p>}

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={handleGuardarServicio}
                        disabled={servicioSaving}
                        className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-lime)] bg-[var(--sg-lime-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--sg-lime)] transition hover:brightness-110 disabled:opacity-60"
                      >
                        {servicioSaving ? "Guardando..." : "Guardar servicio"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {(orden.serviciosPorOrden ?? []).length === 0 ? (
                <p className="rounded-[var(--sg-radius-md)] border border-dashed border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-4 text-sm text-[var(--sg-text-secondary)]">
                  Aun no se han registrado servicios en esta orden.
                </p>
              ) : (
                <div className="space-y-2">
                  {(orden.serviciosPorOrden ?? []).map((item) => {
                    const isDeleting = servicioDeletingId === item.id;
                    const isConfirming = servicioDeleteConfirmId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="relative flex flex-col gap-2 overflow-hidden rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-4 py-3 text-sm"
                      >
                        <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-[var(--sg-lime)]" />
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-semibold leading-5 text-[var(--sg-text-primary)]">{item.servicioNombre}</p>
                            {item.observacion && <p className="text-xs text-[var(--sg-text-muted)]">Obs: {item.observacion}</p>}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setServicioDeleteError(null);
                                setServicioDeleteConfirmId((prev) => (prev === item.id ? null : item.id));
                              }}
                              className={lineDeleteActionButtonClass}
                              title="Eliminar servicio"
                              aria-label="Eliminar servicio"
                              disabled={isDeleting}
                            >
                              {isDeleting ? (
                                <span className="h-3 w-3 animate-spin rounded-full border border-red-400/70 border-t-transparent" />
                              ) : (
                                <TrashIcon className="h-4 w-4" />
                              )}
                            </button>
                            <div className="rounded-full border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-1 text-right text-sm font-semibold text-[var(--sg-text-primary)]">
                              {formatCurrency(item.costo)}
                            </div>
                          </div>
                        </div>
                        {isConfirming && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-[12px] text-[var(--sg-text-secondary)]">
                            <span className="text-[var(--sg-text-muted)]">¿Eliminar este servicio de la orden?</span>
                            <button
                              type="button"
                              onClick={() => setServicioDeleteConfirmId(null)}
                              className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] px-2 py-1 text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)] hover:text-[var(--sg-text-primary)]"
                              disabled={isDeleting}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteServicioConfirm(item.id)}
                              className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-2 py-1 text-[var(--sg-danger)] transition hover:brightness-110 disabled:opacity-60"
                              disabled={isDeleting}
                            >
                              Eliminar
                            </button>
                            {servicioDeleteError && <span className="text-red-400">{servicioDeleteError}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
                </section>
              </div>
            </div>

            {/* ─── Productos Digitales ──────────────────────────────────────── */}
            <section className="rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-4 py-4 shadow-[var(--sg-shadow-card)]">
              <div className="mb-3 flex items-center justify-between border-b border-[var(--sg-divider)] pb-3">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">
                    Productos Digitales
                  </p>
                  <span className="rounded-full bg-[var(--sg-panel)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--sg-text-secondary)]">
                    {(orden.productosDigitales ?? []).length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetProductoDigitalModal();
                    void handleBuscarProductosDigitales("");
                    setShowProductoDigitalModal(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--sg-lime)]/40 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--sg-lime)] transition hover:border-[var(--sg-lime)] hover:bg-[var(--sg-lime-soft)]"
                >
                  <span aria-hidden>+</span> Añadir
                </button>
              </div>

              {(orden.productosDigitales ?? []).length === 0 ? (
                <p className="rounded-[var(--sg-radius-md)] border border-dashed border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-3 text-sm text-[var(--sg-text-secondary)]">
                  Sin productos digitales asignados.
                </p>
              ) : (
                <div className="space-y-2">
                  {(orden.productosDigitales ?? []).map((pd) => {
                    const isConfirming = pdDeleteConfirmId === pd.id;
                    const isDeleting = pdDeletingId === pd.id;
                    const credVisible = pdCredencialesVisible[pd.id] ?? false;
                    const credData = pdCredencialesData[pd.id];
                    const credLoading = pdCredencialesLoading[pd.id] ?? false;
                    const credError = pdCredencialesError[pd.id];
                    return (
                      <div
                        key={pd.id}
                        className="relative rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-3"
                      >
                        <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-[var(--sg-lime)]" />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="font-semibold leading-5 text-[var(--sg-text-primary)]">
                              {pd.softwareProducto}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--sg-text-muted)]">
                              {pd.tipo && <span>{pd.tipo}</span>}
                              {pd.duracion && (
                                <span>
                                  {pd.duracion === "Perpetua" ? "Licencia perpetua" : pd.duracion}
                                </span>
                              )}
                              {pd.duracion !== "Perpetua" && pd.expira && (
                                <span className="text-[var(--sg-warning)]">
                                  Expira: {formatDate(pd.expira)}
                                </span>
                              )}
                              {pd.duracion === "Perpetua" && (
                                <span className="text-[var(--sg-success)]">No expira</span>
                              )}
                              {pd.claveTruncada && (
                                <span className="font-mono text-[var(--sg-text-secondary)]">
                                  {pd.claveTruncada}
                                </span>
                              )}
                            </div>
                            {pd.link && (
                              <a
                                href={pd.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-[var(--sg-lime)] underline underline-offset-2 transition hover:brightness-110"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                {pd.link.replace(/^https?:\/\//i, "").slice(0, 40)}{pd.link.length > 47 ? "…" : ""}
                              </a>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {pd.precioVenta !== null && (
                              <span className="rounded-full border border-[var(--sg-border)] bg-[var(--sg-card)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--sg-text-primary)]">
                                {formatCurrency(pd.precioVenta)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleVerCredenciales(pd.id)}
                              disabled={credLoading}
                              title={credVisible ? "Ocultar credenciales" : "Ver credenciales"}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)]/50 hover:text-[var(--sg-lime)] focus:outline-none disabled:opacity-50"
                            >
                              {credLoading ? (
                                <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                              ) : (
                                <EyeIcon className="h-4 w-4" off={credVisible} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPdDeleteError(null);
                                setPdDeleteConfirmId((prev) => (prev === pd.id ? null : pd.id));
                              }}
                              className={lineDeleteActionButtonClass}
                              title="Desasignar producto"
                              disabled={isDeleting}
                            >
                              {isDeleting ? (
                                <span className="h-3 w-3 animate-spin rounded-full border border-red-400/70 border-t-transparent" />
                              ) : (
                                <TrashIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {credVisible && credData && (
                          <div className="mt-2 space-y-1 rounded-[var(--sg-radius-sm)] border border-[var(--sg-lime)]/20 bg-[var(--sg-lime)]/5 px-3 py-2 text-xs">
                            {credData.claveActivacion && (
                              <div className="flex items-center gap-2">
                                <span className="w-24 shrink-0 text-[var(--sg-text-muted)]">Clave:</span>
                                <span className="font-mono font-semibold text-[var(--sg-lime)] break-all">{credData.claveActivacion}</span>
                              </div>
                            )}
                            {credData.usuarioCorreo && (
                              <div className="flex items-center gap-2">
                                <span className="w-24 shrink-0 text-[var(--sg-text-muted)]">Usuario:</span>
                                <span className="font-mono text-[var(--sg-text-primary)]">{credData.usuarioCorreo}</span>
                              </div>
                            )}
                            {credData.contraseña && (
                              <div className="flex items-center gap-2">
                                <span className="w-24 shrink-0 text-[var(--sg-text-muted)]">Contraseña:</span>
                                <span className="font-mono text-[var(--sg-text-primary)]">{credData.contraseña}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {credError && (
                          <p className="mt-1 text-xs text-[var(--sg-danger)]">{credError}</p>
                        )}

                        {isConfirming && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)]/30 bg-[var(--sg-danger-soft)] px-3 py-2 text-[12px] text-[var(--sg-text-secondary)]">
                            <span>¿Desasignar este producto de la orden?</span>
                            <button
                              type="button"
                              onClick={() => void handleDesasignarProductoDigital(pd.id)}
                              disabled={isDeleting}
                              className="rounded-full border border-[var(--sg-danger)] px-3 py-0.5 text-[11px] font-semibold text-[var(--sg-danger)] transition hover:bg-[var(--sg-danger)] hover:text-white disabled:opacity-60"
                            >
                              Desasignar
                            </button>
                            <button
                              type="button"
                              onClick={() => setPdDeleteConfirmId(null)}
                              className="rounded-full border border-[var(--sg-border)] px-3 py-0.5 text-[11px] text-[var(--sg-text-muted)] transition hover:border-[var(--sg-text-muted)]"
                            >
                              Cancelar
                            </button>
                            {pdDeleteError && <span className="text-[var(--sg-danger)]">{pdDeleteError}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="min-w-0 flex flex-col gap-2.5 xl:sticky xl:top-20">
            <div className="order-3">
              <OrdenDocumentosCard
                ordenId={orden.recordId}
                documentos={orden.documentos ?? []}
                onOrdenUpdated={(updatedOrden) => setOrden(updatedOrden as OrdenDetalle)}
              />
            </div>

            <div className="order-2">
              <OrdenCotizacionCard
                orden={orden}
                onLinked={(cotizacionId, cotizacionCodigo) =>
                  setOrden((prev) => prev ? { ...prev, cotizacionId, cotizacionCodigo } : prev)
                }
              />
            </div>

            <section className="order-1 rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-3 shadow-[var(--sg-shadow-card)]">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">
                Resumen financiero
              </p>

              {abonoMessage && (
                <div className="mb-3 flex items-center gap-3 rounded-[var(--sg-radius-sm)] border border-[var(--sg-success)] bg-[var(--sg-success-soft)] px-3 py-2 text-sm text-[var(--sg-text-primary)]">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--sg-success)] text-[var(--sg-text-on-accent)]">
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3 fill-current">
                      <path d="M8.35 13.2 4.9 9.75l1.06-1.06 2.39 2.39 5.69-5.69 1.06 1.06-6.75 6.75Z" />
                    </svg>
                  </span>
                  <span>{abonoMessage}</span>
                </div>
              )}

              {/* Saldo hero */}
              <div className="mb-3 rounded-xl border border-[var(--sg-lime)]/20 bg-[var(--sg-lime)]/5 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sg-lime)]/60">Saldo pendiente</p>
                <p className="mt-1 text-[1.75rem] font-black leading-none tabular-nums text-[var(--sg-lime)]">
                  {formatCurrency(orden.saldoNV)}
                </p>
              </div>

              {/* Breakdown grid */}
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--sg-border)] bg-[var(--sg-divider)]">
                <div className="bg-[var(--sg-card)] px-3 py-2.5">
                  <p className="text-[0.68rem] font-medium uppercase leading-snug tracking-wide text-[var(--sg-text-muted)]">Total a pagar</p>
                  <p className="mt-0.5 text-sm font-extrabold leading-none tabular-nums text-[var(--sg-lime)]">
                    {formatCurrency(orden.totalAPagarNV)}
                  </p>
                </div>
                <div className="bg-[var(--sg-card)] px-3 py-2.5">
                  <p className="text-[0.68rem] font-medium uppercase leading-snug tracking-wide text-[var(--sg-text-muted)]">Total abonado</p>
                  <p className="mt-0.5 text-sm font-extrabold leading-none tabular-nums text-[var(--sg-lime)]">
                    {formatCurrency(orden.totalAbonadoNV)}
                  </p>
                </div>
                <div className="bg-[var(--sg-panel)] px-3 py-2">
                  <p className="text-[0.68rem] font-medium uppercase leading-snug tracking-wide text-[var(--sg-text-muted)]">Repuestos</p>
                  <p className="mt-0.5 text-xs font-bold leading-none tabular-nums text-[var(--sg-text-secondary)]">
                    {formatCurrency(orden.costoTotalRepuestosNV)}
                  </p>
                </div>
                <div className="bg-[var(--sg-panel)] px-3 py-2">
                  <p className="text-[0.68rem] font-medium uppercase leading-snug tracking-wide text-[var(--sg-text-muted)]">Servicios</p>
                  <p className="mt-0.5 text-xs font-bold leading-none tabular-nums text-[var(--sg-text-secondary)]">
                    {formatCurrency(orden.costoTotalServiciosNV)}
                  </p>
                </div>
                {(orden.totalProductosDigitalesNV ?? 0) > 0 && (
                  <div className="col-span-2 bg-[var(--sg-panel)] px-3 py-2">
                    <p className="text-[0.68rem] font-medium uppercase leading-snug tracking-wide text-[var(--sg-text-muted)]">Productos Digitales</p>
                    <p className="mt-0.5 text-xs font-bold leading-none tabular-nums text-[var(--sg-text-secondary)]">
                      {formatCurrency(orden.totalProductosDigitalesNV)}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">Abonos</p>
                    <span className="rounded-full bg-[var(--sg-panel)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--sg-text-secondary)]">
                      {(orden.abonosPorOrden ?? []).length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAbonoError(null);
                      setAbonoMessage(null);
                      setOpenAbonoModal(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--sg-lime)]/40 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--sg-lime)] transition hover:border-[var(--sg-lime)] hover:bg-[var(--sg-lime-soft)]"
                  >
                    <span aria-hidden>+</span> Registrar
                  </button>
                </div>

                {(orden.abonosPorOrden ?? []).length === 0 ? (
                  <p className="rounded-[var(--sg-radius-md)] border border-dashed border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-3 text-sm text-[var(--sg-text-secondary)]">
                    Sin abonos registrados.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(orden.abonosPorOrden ?? []).map((abono) => {
                      const isConfirming = abonoDeleteConfirmId === abono.id;
                      const isDeleting = abonoDeletingId === abono.id;
                      const attachments =
                        (abono.comprobantes ?? []).length > 0
                          ? abono.comprobantes
                          : abono.comprobante
                          ? [
                              {
                                id: null,
                                url: abono.comprobante,
                                filename: null,
                                contentType: null,
                                size: null,
                                thumbnailUrl: null,
                              },
                            ]
                          : [];
                      const hasAttachments = attachments.length > 0;
                      const isAdjuntoUploading = abonoAdjuntoUploadingId === abono.id;
                      const attachmentError = abonoAdjuntoError[abono.id];
                      return (
                        <div
                          key={abono.id}
                          className="rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1.5">
                              <p className="text-sm font-semibold text-[var(--sg-text-primary)]">
                                {abono.idAbono ? `Abono ${abono.idAbono}` : "Abono registrado"}
                              </p>
                              <p className="text-xs text-[var(--sg-text-secondary)]">Fecha: {formatDate(abono.fecha)}</p>
                              <p className="text-xs text-[var(--sg-text-secondary)]">
                                Metodo de pago: {abono.metodoPago || "No disponible"}
                              </p>
                              {abono.registradoPor && (
                                <p className="text-xs text-[var(--sg-text-muted)]">
                                  Registrado por: {abono.registradoPor}
                                </p>
                              )}
                              {abono.observacion && (
                                <p className="text-xs text-[var(--sg-text-muted)]">
                                  Obs: {abono.observacion}
                                </p>
                              )}
                            </div>
                            <p className="shrink-0 text-lg font-extrabold text-[var(--sg-text-primary)]">
                              {formatCurrency(abono.monto)}
                            </p>
                          </div>

                          {hasAttachments && (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              {attachments.map((attachment, idx) => {
                                const isImage = isImageAttachment(attachment);
                                const isPdf = isPdfAttachment(attachment);
                                const filename = attachment.filename || `Comprobante ${idx + 1}`;
                                return (
                                  <button
                                    key={attachment.id ?? `${abono.id}-${idx}`}
                                    type="button"
                                    onClick={() => openComprobanteViewer(abono.id, attachment)}
                                    className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] transition hover:border-[var(--sg-lime)] focus:outline-none focus:ring-1 focus:ring-[var(--sg-lime)]"
                                    title={filename}
                                    aria-label={`Abrir comprobante ${idx + 1}`}
                                  >
                                    {isImage ? (
                                      <Image
                                        src={attachment.thumbnailUrl || attachment.url}
                                        alt={filename}
                                        width={40}
                                        height={40}
                                        unoptimized
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full flex-col items-center justify-center gap-0.5">
                                        <FileIcon className="h-3 w-3 text-[var(--sg-text-secondary)]" />
                                        <span
                                          className={`rounded px-1 py-0.5 text-[9px] font-bold tracking-wide ${
                                            isPdf
                                              ? "bg-red-500/20 text-red-300"
                                              : "bg-[var(--sg-card-elevated)] text-[var(--sg-text-secondary)]"
                                          }`}
                                        >
                                          {isPdf ? "PDF" : "FILE"}
                                        </span>
                                      </div>
                                    )}
                                    <span className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/35 text-[var(--sg-text-primary)] sm:flex sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
                                      <EyeIcon className="h-3.5 w-3.5" />
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <a
                              href={`/tecnicos/ordenes/${encodeURIComponent(
                                id ?? ""
                              )}/abonos/${encodeURIComponent(abono.id)}/imprimir`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-2 py-1 text-[11px] font-semibold text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)] hover:text-[var(--sg-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--sg-lime)]"
                            >
                              <PrintIcon className="h-3.5 w-3.5" />
                              Imprimir comprobante
                            </a>
                            <label
                              className={`inline-flex cursor-pointer items-center gap-1 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-2 py-1 text-[11px] font-semibold text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)] hover:text-[var(--sg-text-primary)] focus-within:outline-none focus-within:ring-1 focus-within:ring-[var(--sg-lime)] ${
                                isAdjuntoUploading ? "opacity-60 pointer-events-none" : ""
                              }`}
                            >
                              <PaperclipIcon className="h-3.5 w-3.5" />
                              {isAdjuntoUploading ? "Subiendo..." : "Agregar comprobante"}
                              <input
                                type="file"
                                className="sr-only"
                                accept="image/*,.pdf"
                                disabled={isAdjuntoUploading}
                                onChange={(event) => {
                                  const selectedFile = event.target.files?.[0] ?? null;
                                  void handleAgregarComprobanteAbono(abono.id, selectedFile);
                                  event.target.value = "";
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setAbonoDeleteError(null);
                                setAbonoDeleteConfirmId((prev) => (prev === abono.id ? null : abono.id));
                              }}
                              className={lineDeleteActionButtonClass}
                              title="Eliminar abono"
                              aria-label="Eliminar abono"
                              disabled={isDeleting}
                            >
                              {isDeleting ? (
                                <span className="h-3 w-3 animate-spin rounded-full border border-red-400/70 border-t-transparent" />
                              ) : (
                                <TrashIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>

                          {attachmentError && (
                            <p className="mt-2 text-xs text-red-400">{attachmentError}</p>
                          )}
                          {isConfirming && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-[12px] text-[var(--sg-text-secondary)]">
                              <span className="text-[var(--sg-text-muted)]">¿Eliminar este abono de la orden?</span>
                              <button
                                type="button"
                                onClick={() => setAbonoDeleteConfirmId(null)}
                                className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] px-2 py-1 text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)] hover:text-[var(--sg-text-primary)]"
                                disabled={isDeleting}
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAbonoConfirm(abono.id)}
                                className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-2 py-1 text-[var(--sg-danger)] transition hover:brightness-110 disabled:opacity-60"
                                disabled={isDeleting}
                              >
                                Eliminar
                              </button>
                              {abonoDeleteError && <span className="text-red-400">{abonoDeleteError}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </section>
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
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#A7A7A7]">Método de pago</label>
                    <select
                      value={abonoMetodoPago}
                      onChange={(e) => setAbonoMetodoPago(e.target.value)}
                      className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none"
                      disabled={abonoSaving}
                    >
                      <option value="">Seleccionar método de pago</option>
                      {ABONO_METODOS_PAGO.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#A7A7A7]">Registrado por</label>
                    <div className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C]/60 px-3 py-2 text-sm text-[#A7A7A7]">
                      {ABONO_REGISTRADO_POR_TEMP}
                    </div>
                    <p className="text-[11px] text-[#A7A7A7]/70">
                      Este valor se completará automáticamente cuando el login esté activo.
                    </p>
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

            {openCreateRepuestoModal && (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
                <div className="w-full max-w-md rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-2xl space-y-3">
                  <h4 className="text-sm font-semibold text-white">Crear repuesto nuevo</h4>
                  <input
                    type="text"
                    value={nuevoRepuestoNombre}
                    onChange={(e) => setNuevoRepuestoNombre(e.target.value)}
                    placeholder="Nombre del repuesto"
                    className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={nuevoRepuestoCostoBase}
                      onChange={(e) => setNuevoRepuestoCostoBase(e.target.value)}
                      placeholder="Costo base"
                      className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70 focus:outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={nuevoRepuestoPrecioSugerido}
                      onChange={(e) => setNuevoRepuestoPrecioSugerido(e.target.value)}
                      placeholder="Precio sugerido"
                      className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70 focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    value={nuevoRepuestoProveedorHabitual}
                    onChange={(e) => setNuevoRepuestoProveedorHabitual(e.target.value)}
                    placeholder="Proveedor habitual"
                    className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70 focus:outline-none"
                  />
                  {nuevoRepuestoError && <p className="text-xs text-red-400">{nuevoRepuestoError}</p>}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenCreateRepuestoModal(false);
                        resetCrearRepuestoForm();
                      }}
                      className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCrearRepuestoCatalogo}
                      disabled={nuevoRepuestoSaving}
                      className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-xs font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-60"
                    >
                      {nuevoRepuestoSaving ? "Guardando..." : "Crear repuesto"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showProductoDigitalModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
                <div className="w-full max-w-lg rounded-[1rem] border border-[var(--sg-border)] bg-[var(--sg-card)] p-5 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[var(--sg-text-primary)]">Asignar producto digital</h4>
                    <button
                      type="button"
                      onClick={() => { setShowProductoDigitalModal(false); resetProductoDigitalModal(); }}
                      className="text-[var(--sg-text-muted)] transition hover:text-[var(--sg-text-primary)]"
                      aria-label="Cerrar"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <p className="text-[11px] text-[var(--sg-text-muted)]">
                    Solo se muestran productos con estado <strong>Disponible</strong>.
                  </p>

                  <div className="relative">
                    <input
                      type="text"
                      value={pdSearch}
                      onChange={(e) => {
                        setPdSearch(e.target.value);
                        setSelectedPd(null);
                        void handleBuscarProductosDigitales(e.target.value);
                      }}
                      placeholder="Buscar por nombre, tipo o proveedor..."
                      className="w-full rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)]/60 focus:border-[var(--sg-lime)]/70 focus:outline-none"
                    />
                    {pdSearchLoading && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <span className="h-3 w-3 animate-spin rounded-full border border-[var(--sg-lime)] border-t-transparent block" />
                      </span>
                    )}
                  </div>

                  {pdSearchError && <p className="text-xs text-[var(--sg-danger)]">{pdSearchError}</p>}

                  {!selectedPd && productosDisponibles.length > 0 && (
                    <div className="max-h-60 overflow-y-auto rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)]">
                      {productosDisponibles.map((pd) => (
                        <button
                          key={pd.id}
                          type="button"
                          onClick={() => {
                            setSelectedPd(pd);
                            setPdPrecioVenta(pd.precioVenta !== null ? String(pd.precioVenta) : "");
                          }}
                          className="flex w-full items-start gap-3 border-b border-[var(--sg-border)] px-3 py-2.5 text-left last:border-0 transition hover:bg-[var(--sg-card)]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[var(--sg-text-primary)]">{pd.softwareProducto}</p>
                            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[var(--sg-text-muted)]">
                              {pd.tipo && <span>{pd.tipo}</span>}
                              {pd.duracion && <span>{pd.duracion}</span>}
                              {pd.claveTruncada && <span className="font-mono">{pd.claveTruncada}</span>}
                            </div>
                          </div>
                          {pd.precioVenta !== null && (
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--sg-lime)]">
                              {formatCurrency(pd.precioVenta)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {!selectedPd && !pdSearchLoading && productosDisponibles.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[var(--sg-border)] bg-[var(--sg-panel)] px-4 py-4 text-center">
                      <p className="text-xs text-[var(--sg-text-secondary)]">
                        {pdSearch.trim()
                          ? "No encontramos productos digitales disponibles con esa búsqueda."
                          : "No hay productos digitales disponibles para asignar."}
                      </p>
                      <a
                        href="/tecnicos/productos-digitales"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--sg-lime)] underline underline-offset-2 transition hover:brightness-110"
                      >
                        Ir a Productos Digitales para crear uno
                      </a>
                    </div>
                  )}

                  {selectedPd && (
                    <div className="space-y-3 rounded-lg border border-[var(--sg-lime)]/20 bg-[var(--sg-lime)]/5 px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[var(--sg-text-primary)]">{selectedPd.softwareProducto}</p>
                          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-[var(--sg-text-muted)]">
                            {selectedPd.tipo && <span>{selectedPd.tipo}</span>}
                            {selectedPd.duracion && <span>{selectedPd.duracion}</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedPd(null)}
                          className="shrink-0 text-[10px] font-semibold text-[var(--sg-text-muted)] underline underline-offset-2 transition hover:text-[var(--sg-text-primary)]"
                        >
                          Cambiar
                        </button>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--sg-text-muted)]">
                          Precio de venta (opcional)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={pdPrecioVenta}
                          onChange={(e) => setPdPrecioVenta(e.target.value)}
                          placeholder="Dejar vacío para usar precio del catálogo"
                          className="w-full rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)]/50 focus:border-[var(--sg-lime)]/70 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {pdError && <p className="text-xs text-[var(--sg-danger)]">{pdError}</p>}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowProductoDigitalModal(false); resetProductoDigitalModal(); }}
                      className="rounded-full border border-[var(--sg-border)] px-3 py-1.5 text-xs font-semibold text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)]/50 hover:text-[var(--sg-lime)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAsignarProductoDigital()}
                      disabled={!selectedPd || pdSaving}
                      className="rounded-full border border-[var(--sg-lime)] bg-[var(--sg-lime)] px-3 py-1.5 text-xs font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-50"
                    >
                      {pdSaving ? "Asignando..." : "Asignar producto"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {openCreateServicioModal && (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
                <div className="w-full max-w-md rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-2xl space-y-3">
                  <h4 className="text-sm font-semibold text-white">Crear servicio nuevo</h4>
                  <input
                    type="text"
                    value={nuevoServicioNombre}
                    onChange={(e) => setNuevoServicioNombre(e.target.value)}
                    placeholder="Nombre del servicio"
                    className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70 focus:outline-none"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={nuevoServicioCostoSugerido}
                    onChange={(e) => setNuevoServicioCostoSugerido(e.target.value)}
                    placeholder="Costo sugerido"
                    className="w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70 focus:outline-none"
                  />
                  {nuevoServicioError && <p className="text-xs text-red-400">{nuevoServicioError}</p>}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenCreateServicioModal(false);
                        resetCrearServicioForm();
                      }}
                      className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCrearServicioCatalogo}
                      disabled={nuevoServicioSaving}
                      className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-xs font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-60"
                    >
                      {nuevoServicioSaving ? "Guardando..." : "Crear servicio"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
