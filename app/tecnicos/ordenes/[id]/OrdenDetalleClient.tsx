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
import { ActividadCard } from "@/components/tecnicos/ordenes/ActividadCard";
import { EquipoFicha } from "@/components/tecnicos/ordenes/EquipoFicha";
import { ReabrirOrdenDialog } from "@/components/tecnicos/ordenes/ReabrirOrdenDialog";
import { esOrdenCerrada } from "@/lib/tecnicos/regreso/reglas";
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
  const router = useRouter();
  // Rediseño R6: la orden entregada queda cerrada; el regreso crea otra.
  const [regresoAbierto, setRegresoAbierto] = useState(false);
  // Rediseño R3: algo se anotó en la Actividad desde otra tarjeta (trabajos, asistente).
  const [actividadVersion, setActividadVersion] = useState(0);
  const [reabrirAbierto, setReabrirAbierto] = useState(false);
  const [orden, setOrden] = useState<OrdenDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avanceTexto, setAvanceTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [inlineEditing, setInlineEditing] = useState(false);
  const [estadoSeleccionado, setEstadoSeleccionado] = useState<string>("");
  const [estadoSaving, setEstadoSaving] = useState(false);
  // Entregar al cliente (auditoría ops, punto 6): el único camino a "Finalizado Entregado".
  const [entregaAbierta, setEntregaAbierta] = useState(false);
  const [estadoMessage, setEstadoMessage] = useState<string | null>(null);
  const [estadoError, setEstadoError] = useState<string | null>(null);
  const [nuevoEstadoError, setNuevoEstadoError] = useState<string | null>(null);
  const [mensajeLoading, setMensajeLoading] = useState<Record<string, boolean>>({});
  const [mensajeError, setMensajeError] = useState<Record<string, string | null>>({});
  const [mensajeVisible, setMensajeVisible] = useState<Record<string, boolean>>({});
  const pollingRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const inlineInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editInlineRef = useRef<HTMLTextAreaElement | null>(null);
  const submitLocked = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingOriginal, setEditingOriginal] = useState("");
  const [editingSaving, setEditingSaving] = useState(false);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
  const [whatsappError, setWhatsappError] = useState<Record<string, string | null>>({});
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
            <section className="rounded-xl border border-[var(--sg-border)] bg-[#1E1F1C] shadow-[var(--sg-shadow-card)]">
              <div className={`h-[3px] w-full rounded-t-xl ${
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
                      {orden.regreso?.ordenAnteriorId && (
                        <Link
                          href={`/tecnicos/ordenes/${encodeURIComponent(orden.regreso.ordenAnteriorId)}`}
                          className="inline-flex h-[22px] items-center rounded-full bg-[rgba(120,183,255,.14)] px-2 text-[11px] font-bold text-[#9CCBFF] transition hover:brightness-110"
                        >
                          Regreso de {orden.regreso.ordenAnteriorCodigo || "otra orden"}{orden.regreso.tipo ? ` · ${orden.regreso.tipo}` : ""}
                        </Link>
                      )}
                      {orden.regreso?.regresos.map((r) => (
                        <Link
                          key={r.id}
                          href={`/tecnicos/ordenes/${encodeURIComponent(r.id)}`}
                          className="inline-flex h-[22px] items-center rounded-full bg-[rgba(120,183,255,.14)] px-2 text-[11px] font-bold text-[#9CCBFF] transition hover:brightness-110"
                        >
                          Regresó → {r.codigo}
                        </Link>
                      ))}
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
                      <button
                        type="button"
                        onClick={() => setShowMantenimientoModal(true)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--sg-text-muted)] transition hover:text-[var(--sg-lime)]"
                      >
                        <PrintIcon className="h-3.5 w-3.5" />
                        Mantenimiento
                        {orden.proximoMantenimiento && (
                          <span className="text-[var(--sg-text-muted)]/70">
                            ({formatDate(orden.proximoMantenimiento)})
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
                    {esOrdenCerrada(orden.estadoActual) ? (
                      <div className="flex w-52 items-center justify-between gap-2">
                        <span className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-[rgba(86,227,164,.13)] px-3 text-xs font-bold text-[#56E3A4]">
                          <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true"><rect x="3" y="6" width="8" height="6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M4.8 6V4.5a2.2 2.2 0 0 1 4.4 0V6" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>
                          {orden.estadoActual === "Finalizado Entregado" ? "Entregada · cerrada" : "Reciclaje · cerrada"}
                        </span>
                        {isAdministratorRole(userRol) && (
                          <button type="button" onClick={() => setReabrirAbierto(true)} className="text-[11px] font-semibold text-[var(--sg-text-muted)] transition hover:text-[#FF9C94]">
                            Reabrir…
                          </button>
                        )}
                      </div>
                    ) : (
                    <div
                      className={`relative w-52 ${
                        estadoSaving || loading ? "pointer-events-none opacity-70" : ""
                      }`}
                    >
                      <StatusFilterDropdown
                        value={estadoSeleccionado}
                        onChange={(value) => handleEstadoChange(value as EstadoOrden)}
                        options={ESTADOS_ORDEN
                          // Punto 6: a "Finalizado Entregado" solo se llega con "Entregar al cliente".
                          .filter((estado) => estado !== "Finalizado Entregado" || orden.estadoActual === "Finalizado Entregado")
                          .map((estado) => ({
                            value: estado,
                            label: estado,
                          }))}
                        label=""
                        className="text-left"
                        dropdownClassName="max-w-[280px]"
                        buttonClassName="!h-[28px] !rounded-full !px-3.5 !py-0 !text-xs !font-bold !uppercase !tracking-wide !text-[var(--sg-lime)] !shadow-none !border !border-[var(--sg-lime)]/30"
                      />
                    </div>
                    )}
                    {orden.estadoActual === "Finalizado Entregado" && (
                      <button
                        type="button"
                        onClick={() => setRegresoAbierto(true)}
                        className="h-[28px] w-52 rounded-full bg-[var(--sg-lime)] px-3.5 text-xs font-bold uppercase tracking-wide text-[#1E1F1C] transition hover:brightness-95"
                      >
                        Regresó el equipo
                      </button>
                    )}
                    {orden.estadoActual !== "Finalizado Entregado" && orden.estadoActual !== "Enviado a Reciclaje" ? (
                      <button
                        type="button"
                        onClick={() => setEntregaAbierta(true)}
                        disabled={estadoSaving}
                        className="h-[28px] w-52 rounded-full bg-[var(--sg-lime)] px-3.5 text-xs font-bold uppercase tracking-wide text-[#1E1F1C] transition hover:brightness-95 disabled:opacity-50"
                      >
                        Entregar al cliente
                      </button>
                    ) : orden.estadoActual === "Finalizado Entregado" && orden.entrega?.motivoSinCobro ? (
                      <div className="flex items-center gap-2 text-[11px] text-[var(--sg-text-muted)]">
                        <span>Entrega sin cobro:</span>
                        <a href={`/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/entrega/imprimir`} target="_blank" rel="noreferrer" className="font-semibold text-[var(--sg-lime)] hover:underline">Ticket</a>
                        <a href={`/api/tecnicos/ordenes/${encodeURIComponent(id ?? "")}/entrega/pdf`} target="_blank" rel="noreferrer" className="font-semibold text-[var(--sg-lime)] hover:underline">PDF</a>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setAsistente((a) => ({ ...a, abierto: true }))}
                      className="inline-flex h-[28px] w-52 items-center justify-center gap-1.5 rounded-full border border-[var(--sg-lime)]/45 px-3.5 text-xs font-bold uppercase tracking-wide text-[var(--sg-lime)] transition hover:bg-[var(--sg-lime-soft)]"
                    >
                      <Destello size={14} />
                      Asistente
                    </button>
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

            {orden.estadoActual === "Completado" && (
              <GuardarSolucionCard ordenId={orden.recordId} estadoOrden={orden.estadoActual} recienCompletado={recienCompletado} />
            )}

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

            {/* Rediseño R5: la «Nota interna» ya no se usa: su contenido pasó a la
                Actividad y la contraseña a la ficha del equipo (script R5). */}
            <section className="relative overflow-hidden rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-2.5 shadow-[var(--sg-shadow-card)]">
              <div className="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-[var(--sg-lime)]" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sg-lime)]">Motivo de ingreso</p>
              <div className="mt-1">
                <InlineEditField
                  value={orden.ingresaPor === "No disponible" ? "" : orden.ingresaPor}
                  onSave={(v) => saveOrdenField("ingresaPor", v)}
                  placeholder="No disponible"
                />
              </div>
              {orden.recomendaciones && (
                <p className="mt-1.5 text-xs text-[var(--sg-text-muted)]">Recomendaciones: {orden.recomendaciones}</p>
              )}
            </section>

            {/* Rediseño R3: historial, notas y mensajes al cliente en una sola
                línea de tiempo (reemplaza el historial y «Generar mensaje IA»). */}
            <ActividadCard
              ordenId={orden.recordId}
              refrescar={`${actividadVersion}-${orden.historial.length}-${orden.estadoActual}-${cuentaUnificada?.abonos?.length ?? 0}`}
            />

            {/* Presupuesto: el único lugar para agregar, aprobar, quitar y modificar
                cargos (fase 4: ya no hay tarjetas Repuestos/Servicios/Digitales). */}
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
            />
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

            {/* Tarjeta "Cuenta" (auditoría ops, punto 11): una sola, como estado de
                cuenta. Reemplaza el "Resumen financiero" (saldo repetido, cuadrícula,
                cuenta unificada, repuestos históricos y una segunda lista de abonos). */}
            <section id="orden-cuenta" className="order-1 flex scroll-mt-4 flex-col gap-2">
              {/* Sin la cuenta no hay cifras: se avisa (no se cae a los rollups NV). */}
              {cuentaUnificadaError && (
                <p className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] px-3 py-2 text-xs text-[var(--sg-danger)]">
                  No se pudo cargar la cuenta ({cuentaUnificadaError}). Recarga la página.
                </p>
              )}
              {abonoMessage && (
                <div className="flex items-center gap-3 rounded-[var(--sg-radius-sm)] border border-[var(--sg-success)] bg-[var(--sg-success-soft)] px-3 py-2 text-sm text-[var(--sg-text-primary)]">
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
                  document.getElementById(donde === "presupuesto" ? "orden-presupuesto" : "orden-cuenta")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
              telefono={orden.telefono}
              usuario={userNombre}
              onRegistrarPago={abrirRegistrarPago}
              onIrA={(seccion) => {
                setTimeout(() => document.getElementById(seccion === "cuenta" ? "orden-cuenta" : "orden-presupuesto")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
              }}
              onActividad={() => setActividadVersion((v) => v + 1)}
            />
          </div>
        )}
    </div>
  );
}
