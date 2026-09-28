"use client";

// Entrega de un producto digital ya cargado a la orden: credenciales, PDF para
// el cliente, portal de activación y vencimiento.
//
// Presupuesto único (fase 4): antes vivía en la tarjeta "Productos Digitales"
// de la orden. Esa tarjeta ya no existe —los productos se agregan, quitan y
// modifican solo desde el presupuesto—, así que esto se muestra dentro de la
// línea aprobada del producto. Solo LEE y genera documentos: no asigna ni
// desasigna nada.
//
// Endpoints (ya existentes, con sesión de técnicos):
//   GET    /api/tecnicos/productos-digitales/[id]/credenciales
//   POST   /api/tecnicos/productos-digitales/[id]/pdf   → genera y descarga
//   GET    /api/tecnicos/productos-digitales/[id]/pdf   → descarga el último
//   DELETE /api/tecnicos/productos-digitales/[id]/pdf   → solo admin

import { useState } from "react";

export type ProductoDigitalEntrega = {
  id: string;
  softwareProducto: string;
  portalActivacionCatalogo: string | null;
  claveTruncada: string | null;
  duracion: string | null;
  expira: string | null;
  documentoPdfUrl: string | null;
  fechaUltimoPdf: string | null;
};

type Credenciales = { claveActivacion?: string | null; usuarioCorreo?: string | null; contraseña?: string | null };

const BTN =
  "inline-flex h-6 items-center gap-1 rounded-[var(--sg-radius-sm)] border px-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SEC = `${BTN} border-[var(--sg-border)] bg-[var(--sg-card)] text-[var(--sg-text-secondary)] hover:border-[var(--sg-lime)] hover:text-[var(--sg-text-primary)]`;
const BTN_LIMA = `${BTN} border-[var(--sg-lime)]/40 bg-[var(--sg-lime)]/10 text-[var(--sg-lime)] hover:brightness-110`;
const BTN_PELIGRO = `${BTN} border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] text-[var(--sg-danger)] hover:brightness-110`;

function fechaCorta(valor: string | null) {
  if (!valor) return "";
  const t = Date.parse(valor);
  return Number.isFinite(t)
    ? new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(t))
    : valor;
}

async function mensajeDeError(res: Response, porDefecto: string) {
  try {
    const j = await res.json();
    return (j?.error as string | undefined) ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

export function EntregaProductoDigital({
  producto,
  esAdmin,
  onPdfCambiado,
}: {
  producto: ProductoDigitalEntrega;
  esAdmin: boolean;
  /** El PDF se generó o se borró: la orden debe releerse para saberlo. */
  onPdfCambiado?: () => void | Promise<void>;
}) {
  const [cred, setCred] = useState<Credenciales | null>(null);
  const [credVisible, setCredVisible] = useState(false);
  const [ocupado, setOcupado] = useState<"cred" | "pdf" | "borrar" | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perpetua = producto.duracion === "Perpetua";
  const tienePdf = Boolean(producto.documentoPdfUrl);

  async function alternarCredenciales() {
    if (credVisible) { setCredVisible(false); return; }
    if (cred) { setCredVisible(true); return; }
    setOcupado("cred"); setError(null);
    try {
      const res = await fetch(`/api/tecnicos/productos-digitales/${encodeURIComponent(producto.id)}/credenciales`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error ?? "No se pudieron leer las credenciales");
      setCred(j.data as Credenciales);
      setCredVisible(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las credenciales");
    } finally {
      setOcupado(null);
    }
  }

  async function pdf(metodo: "POST" | "GET") {
    setOcupado("pdf"); setError(null);
    try {
      const res = await fetch(`/api/tecnicos/productos-digitales/${encodeURIComponent(producto.id)}/pdf`, { method: metodo });
      if (!res.ok) throw new Error(await mensajeDeError(res, "No se pudo obtener el PDF"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SUPER-GEEK-${producto.softwareProducto.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      if (metodo === "POST") await onPdfCambiado?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo obtener el PDF");
    } finally {
      setOcupado(null);
    }
  }

  async function borrarPdf() {
    setOcupado("borrar"); setError(null);
    try {
      const res = await fetch(`/api/tecnicos/productos-digitales/${encodeURIComponent(producto.id)}/pdf`, { method: "DELETE" });
      if (!res.ok) throw new Error(await mensajeDeError(res, "No se pudo eliminar el PDF"));
      setConfirmarBorrado(false);
      await onPdfCambiado?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el PDF");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="mt-1.5 space-y-1.5 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--sg-text-muted)]">
        <span className="font-semibold uppercase tracking-wide text-[10px]">Entrega</span>
        {producto.duracion && <span>{perpetua ? "Licencia perpetua" : producto.duracion}</span>}
        {perpetua
          ? <span className="text-[var(--sg-success)]">No expira</span>
          : producto.expira && <span className="text-[var(--sg-warning)]">Expira {fechaCorta(producto.expira)}</span>}
        {producto.claveTruncada && <span className="font-mono text-[var(--sg-text-secondary)]">{producto.claveTruncada}</span>}
        {producto.portalActivacionCatalogo && (
          <a href={producto.portalActivacionCatalogo} target="_blank" rel="noopener noreferrer" className="text-[var(--sg-lime)] underline underline-offset-2 hover:brightness-110">
            Portal de activación
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => void alternarCredenciales()} disabled={ocupado !== null} className={BTN_SEC}>
          {ocupado === "cred" ? "Leyendo…" : credVisible ? "Ocultar credenciales" : "Ver credenciales"}
        </button>
        {tienePdf ? (
          <button type="button" onClick={() => void pdf("GET")} disabled={ocupado !== null} className={BTN_LIMA}
            title={producto.fechaUltimoPdf ? `Generado el ${fechaCorta(producto.fechaUltimoPdf)}` : undefined}>
            {ocupado === "pdf" ? "Descargando…" : "Descargar PDF"}
          </button>
        ) : (
          <button type="button" onClick={() => void pdf("POST")} disabled={ocupado !== null} className={BTN_SEC}>
            {ocupado === "pdf" ? "Generando…" : "Generar PDF"}
          </button>
        )}
        {tienePdf && esAdmin && (
          <button type="button" onClick={() => setConfirmarBorrado((v) => !v)} disabled={ocupado !== null} className={BTN_PELIGRO}>
            Eliminar PDF
          </button>
        )}
      </div>

      {credVisible && cred && (
        <div className="space-y-0.5 rounded-[var(--sg-radius-sm)] border border-[var(--sg-lime)]/20 bg-[var(--sg-lime)]/5 px-2 py-1.5 text-[11px]">
          {cred.claveActivacion && (
            <p><span className="inline-block w-20 text-[var(--sg-text-muted)]">Clave:</span><span className="break-all font-mono font-semibold text-[var(--sg-lime)]">{cred.claveActivacion}</span></p>
          )}
          {cred.usuarioCorreo && (
            <p><span className="inline-block w-20 text-[var(--sg-text-muted)]">Usuario:</span><span className="font-mono text-[var(--sg-text-primary)]">{cred.usuarioCorreo}</span></p>
          )}
          {cred.contraseña && (
            <p><span className="inline-block w-20 text-[var(--sg-text-muted)]">Contraseña:</span><span className="font-mono text-[var(--sg-text-primary)]">{cred.contraseña}</span></p>
          )}
          {!cred.claveActivacion && !cred.usuarioCorreo && !cred.contraseña && (
            <p className="text-[var(--sg-text-muted)]">Este producto no tiene credenciales guardadas.</p>
          )}
        </div>
      )}

      {confirmarBorrado && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)]/30 bg-[var(--sg-danger-soft)] px-2 py-1.5 text-[11px] text-[var(--sg-text-secondary)]">
          <span>¿Eliminar el PDF generado? Se puede volver a generar después.</span>
          <button type="button" onClick={() => void borrarPdf()} disabled={ocupado !== null} className={BTN_PELIGRO}>
            {ocupado === "borrar" ? "Eliminando…" : "Eliminar"}
          </button>
          <button type="button" onClick={() => setConfirmarBorrado(false)} className={BTN_SEC}>Cancelar</button>
        </div>
      )}

      {error && <p className="text-[11px] text-[var(--sg-danger)]">{error}</p>}
    </div>
  );
}
