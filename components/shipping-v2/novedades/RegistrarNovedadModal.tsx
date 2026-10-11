"use client";

// Registrar una novedad de un artículo (punto 8). Lo usan Recepción y la ficha
// del artículo: un solo formulario para que las reglas no se separen.
//
// Tiene su propio estado a propósito: escribir aquí no repinta la pantalla de
// fondo (en Recepción, ~175 filas).

import { useEffect, useRef, useState } from "react";
import { ACCEPT_EVIDENCIAS, clasificarEvidencia, validarSeleccionEvidencias } from "@/lib/shipping-v2/evidencias";
import { SHIPPING_V2_TIPOS_INTERNOS, SHIPPING_V2_TIPOS_PROVEEDOR, TIPO_PERDIDO_EN_TIENDA } from "@/lib/shipping-v2/novedades";
import { EvidenciasInvalidasError, subirEvidenciasNovedad } from "@/lib/shipping-v2/subir-evidencias";
import type { ShippingV2Item, ShippingV2Novedad } from "@/types/shipping-v2";

export type NovedadRegistrada = { item: ShippingV2Item; novedad: ShippingV2Novedad | null; aviso: string };

export function RegistrarNovedadModal({
  itemId,
  sku,
  nombre,
  packingId,
  onClose,
  onSaved,
}: {
  itemId: string;
  sku?: string;
  nombre?: string;
  packingId?: string;
  onClose: () => void;
  onSaved: (resultado: NovedadRegistrada) => void;
}) {
  const [tipo, setTipo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [bloquearVenta, setBloquearVenta] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [errorArchivos, setErrorArchivos] = useState("");
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState("");
  // Si la novedad ya se creó pero alguna evidencia no subió, reintentar solo
  // sube las evidencias (no se crea otra novedad).
  const [creada, setCreada] = useState<NovedadRegistrada | null>(null);
  const archivosInputRef = useRef<HTMLInputElement | null>(null);
  const perdido = tipo === TIPO_PERDIDO_EN_TIENDA;

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = original; document.removeEventListener("keydown", onKey); };
  }, [busy, onClose]);

  function agregarArchivos(nuevos: File[]) {
    if (!nuevos.length) return;
    const validacion = validarSeleccionEvidencias(
      nuevos.map((archivo) => ({ name: archivo.name, type: archivo.type, size: archivo.size })),
      { yaSubidas: archivos.length }
    );
    if (!validacion.ok) { setErrorArchivos(validacion.motivo); return; }
    setErrorArchivos("");
    setArchivos((actuales) => [...actuales, ...nuevos]);
  }

  async function guardar() {
    setBusy(true);
    setMensaje("");
    try {
      let resultado = creada;
      if (!resultado) {
        const response = await fetch(`/api/shipping-v2/recepcion/items/${itemId}/novedades`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo, descripcion, bloquearVenta: perdido || bloquearVenta, packingId: packingId || "" }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo registrar la novedad."));
        resultado = { item: payload.data as ShippingV2Item, novedad: (payload.novedad as ShippingV2Novedad) ?? null, aviso: String(payload.aviso || "") };
        setCreada(resultado);
      }

      // Evidencias en un segundo paso: Airtable solo acepta adjuntos en un
      // registro que ya existe. Si fallan, la novedad YA quedó guardada.
      if (archivos.length && resultado.novedad?.id) {
        try {
          const subida = await subirEvidenciasNovedad(resultado.novedad.id, archivos, { yaSubidas: resultado.novedad.evidencias?.length ?? 0 });
          if (subida.novedad) resultado = { ...resultado, novedad: subida.novedad as ShippingV2Novedad };
          if (subida.fallidos.length) {
            setArchivos((actuales) => actuales.filter((a) => subida.fallidos.includes(a.name)));
            setMensaje(subida.aviso || "La novedad se guardó, pero algunas evidencias no subieron. Pulsa Guardar para reintentarlas.");
            setCreada(resultado);
            return;
          }
        } catch (error) {
          setMensaje(
            error instanceof EvidenciasInvalidasError
              ? `La novedad se guardó. Las evidencias no: ${error.message}`
              : `La novedad se guardó, pero las evidencias no subieron: ${error instanceof Error ? error.message : "error inesperado"}. Pulsa Guardar para reintentar.`
          );
          setCreada(resultado);
          return;
        }
      }
      onSaved(resultado);
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const chip = (activo: boolean, interno: boolean) =>
    `rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition disabled:opacity-50 ${
      activo
        ? interno ? "border-[#D7FF4F] bg-[#D7FF4F]/12 text-[#D7FF4F]" : "border-[#4FC3FF] bg-[#4FC3FF]/15 text-[#BDEAFF]"
        : "border-[#3A3A36] bg-[#101010] text-[#A7A7A7] hover:text-[#F5F5F5]"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#3A3A36] bg-[#151613] p-4 shadow-2xl shadow-black/60">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold text-[#F5F5F5]">Registrar novedad</h3>
          <span className="truncate text-[12px] text-[#8F908A]">{[sku, nombre].filter(Boolean).join(" · ")}</span>
        </div>

        <div className="mt-3 grid gap-3">
          {/* El tipo decide quién la resuelve: garantía del proveedor o nosotros. */}
          <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-start">
            <span className="pt-1 text-[11px] font-semibold uppercase tracking-normal text-[#8F908A]">Proveedor</span>
            <div className="flex flex-wrap gap-1">
              {SHIPPING_V2_TIPOS_PROVEEDOR.map((opcion) => (
                <button key={opcion} type="button" disabled={Boolean(creada)} onClick={() => setTipo(opcion)} className={chip(tipo === opcion, false)}>{opcion}</button>
              ))}
            </div>
            <span className="pt-1 text-[11px] font-semibold uppercase tracking-normal text-[#8F908A]">Interno</span>
            <div className="flex flex-wrap gap-1">
              {SHIPPING_V2_TIPOS_INTERNOS.map((opcion) => (
                <button key={opcion} type="button" disabled={Boolean(creada)} onClick={() => setTipo(opcion)} className={chip(tipo === opcion, true)}>{opcion}</button>
              ))}
            </div>
          </div>
          {tipo ? (
            <p className="-mt-1 text-[11px] text-[#8F908A]">
              {(SHIPPING_V2_TIPOS_PROVEEDOR as readonly string[]).includes(tipo) ? "Garantía del proveedor: se le notifica para resolverla con él." : "La resolvemos nosotros."}
            </p>
          ) : null}

          <label className={`flex items-center gap-2 ${perdido ? "cursor-not-allowed" : "cursor-pointer"}`} title="Impide reservar y vender el artículo. Solo un Administrador lo desbloquea.">
            <input type="checkbox" checked={perdido || bloquearVenta} disabled={perdido || Boolean(creada)} onChange={(e) => setBloquearVenta(e.target.checked)} className="h-4 w-4 accent-[#FF6B6B]" />
            <span className="text-[13px] font-semibold text-[#F5F5F5]">Bloquear venta</span>
            <span className="text-[11px] text-[#8F908A]">{perdido ? "Lo perdido siempre se bloquea." : "Sin marcar, se puede vender avisando de la novedad."}</span>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-normal text-[#8F908A]">Descripción</span>
            <textarea value={descripcion} disabled={Boolean(creada)} onChange={(e) => setDescripcion(e.target.value)} rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-[#3A3A36] bg-[#101010] px-3 py-2 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-60" />
          </label>

          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-normal text-[#8F908A]" title="Fotos o un video corto (hasta 3.5 MB). Opcional, pero una foto evita discutir después con el proveedor.">Evidencia</span>
              {archivos.map((archivo, indice) => (
                <span key={`${archivo.name}-${indice}`} className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-lg border border-[#3A3A36] bg-[#101010] py-0.5 pl-2 pr-1 text-[11px] text-[#C9C9C4]">
                  <span aria-hidden="true">{clasificarEvidencia({ type: archivo.type, filename: archivo.name }) === "video" ? "▶" : "▣"}</span>
                  <span className="truncate" title={archivo.name}>{archivo.name}</span>
                  <button type="button" onClick={() => setArchivos((a) => a.filter((_, i) => i !== indice))} className="grid h-5 w-5 place-items-center rounded text-[#8F908A] hover:text-[#FF9C9C]" aria-label={`Quitar ${archivo.name}`}>&times;</button>
                </span>
              ))}
              <button type="button" disabled={busy} onClick={() => archivosInputRef.current?.click()}
                className="h-7 rounded-lg border border-dashed border-[#3A3A36] px-2.5 text-[12px] font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-40">
                + Foto o video
              </button>
            </div>
            <input ref={archivosInputRef} type="file" accept={ACCEPT_EVIDENCIAS} multiple className="hidden"
              onChange={(e) => { agregarArchivos(Array.from(e.target.files || [])); if (archivosInputRef.current) archivosInputRef.current.value = ""; }} />
            {errorArchivos ? <p className="mt-1 text-[11px] text-[#FF9C9C]">{errorArchivos}</p> : null}
          </div>
        </div>

        {mensaje ? <p className="mt-2 text-sm font-semibold text-[#FFB07A]">{mensaje}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => (creada ? onSaved(creada) : onClose())} className="h-9 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-semibold text-[#F5F5F5] disabled:opacity-50">
            {creada ? "Cerrar" : "Cancelar"}
          </button>
          <button type="button" disabled={busy || !tipo || !descripcion.trim()} onClick={() => void guardar()}
            className="h-9 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50">
            {busy ? "Guardando..." : creada ? "Reintentar evidencias" : "Guardar novedad"}
          </button>
        </div>
      </div>
    </div>
  );
}
