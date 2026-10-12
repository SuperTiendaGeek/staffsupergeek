"use client";

// Cartel al vender (auditoría Shipping V2, punto 8b · 10-oct-2026).
//
// Sale apenas se agrega a una factura, recibo, reserva o presupuesto un
// artículo con una novedad ABIERTA (sin bloqueo). Pide escribir cómo se vende
// (obligatorio, con detalle) y confirmarlo con su botón. Mientras falte, la
// pantalla no deja emitir.
// Después de emitir con éxito, cerrarNovedadesVendidas() cierra la novedad
// como "Vendido con novedad" (o la deja "En solución" si el reclamo con el
// proveedor continúa). Si no se emite, la novedad sigue abierta.
//
// Es una capa encima de cada formulario: no cambia cálculos ni el envío.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MINIMO_ACLARACION_VENTA } from "@/lib/shipping-v2/novedades";

export type ModuloVenta = "facturacion" | "tecnicos";
export type CierreNovedadVenta = { novedadId: string; itemId: string; texto: string; reclamoContinua: boolean };
export type EstadoAvisoNovedad = { pendiente: boolean; cierres: CierreNovedadVenta[] };

type NovedadParaVenta = { id: string; novedadId: string; tipo: string; descripcion: string; conProveedor: boolean };

const RUTA: Record<ModuloVenta, string> = {
  facturacion: "/api/facturacion/novedades-venta",
  tecnicos: "/api/tecnicos/novedades-venta",
};

export function AvisoNovedadVenta({
  modulo,
  itemId,
  onEstado,
  colSpan,
}: {
  modulo: ModuloVenta;
  itemId: string;
  onEstado: (estado: EstadoAvisoNovedad) => void;
  /** Dentro de una tabla: se dibuja como una fila que ocupa estas columnas. */
  colSpan?: number;
}) {
  const [novedades, setNovedades] = useState<NovedadParaVenta[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [continua, setContinua] = useState<Record<string, boolean>>({});
  // La aclaración se CONFIRMA con un botón (11-oct: sin él no se veía cómo avanzar).
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({});
  const onEstadoRef = useRef(onEstado);
  onEstadoRef.current = onEstado;

  useEffect(() => {
    let cancel = false;
    setNovedades(null);
    setFallo(false);
    fetch(`${RUTA[modulo]}?itemId=${encodeURIComponent(itemId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (j.success) setNovedades(j.data as NovedadParaVenta[]);
        else { setFallo(true); setNovedades([]); }
      })
      .catch(() => { if (!cancel) { setFallo(true); setNovedades([]); } });
    return () => { cancel = true; };
  }, [itemId, modulo]);

  // Avisa al formulario si falta la aclaración (mientras carga, también falta:
  // así no se emite antes de saber si hay novedad).
  useEffect(() => {
    if (novedades === null) { onEstadoRef.current({ pendiente: true, cierres: [] }); return; }
    const cierres = novedades.map((n) => ({
      novedadId: n.id,
      itemId,
      texto: (textos[n.id] ?? "").trim(),
      reclamoContinua: n.conProveedor && continua[n.id] === true,
    }));
    onEstadoRef.current({
      pendiente: cierres.some((c) => c.texto.length < MINIMO_ACLARACION_VENTA || confirmados[c.novedadId] !== true),
      cierres,
    });
  }, [novedades, textos, continua, confirmados, itemId]);

  if (novedades === null) {
    return envolver(<p className="text-[11px] text-[#8F908A]">Revisando novedades del artículo…</p>, colSpan);
  }
  if (fallo) {
    return envolver(<p className="text-[11px] text-[#F0C75E]">No se pudo revisar si este artículo tiene novedades. Puedes continuar.</p>, colSpan);
  }
  if (!novedades.length) return null;

  return envolver(
    <div className="grid gap-2">
      {novedades.map((n) => {
        const texto = textos[n.id] ?? "";
        const faltan = MINIMO_ACLARACION_VENTA - texto.trim().length;
        if (confirmados[n.id]) {
          return (
            <div key={n.id} className="flex items-start justify-between gap-3 rounded-lg border border-[#7BE495]/40 bg-[#7BE495]/10 px-3 py-2">
              <p className="min-w-0 text-[12px] leading-5 text-[#BFF2CC]">
                <span className="font-bold text-[#9FEFB3]">✓ Novedad aclarada ({n.tipo || "Novedad"}):</span> {texto.trim()}
                {continua[n.id] ? <span className="text-[#8F908A]"> · el reclamo con el proveedor continúa</span> : null}
                <span className="block text-[11px] text-[#8F908A]">Se registrará como «Vendido con novedad» al emitir.</span>
              </p>
              <button type="button" onClick={() => setConfirmados((c) => ({ ...c, [n.id]: false }))} className="shrink-0 text-[11px] font-semibold text-[#A7A7A7] underline hover:text-[#F5F5F5]">Editar</button>
            </div>
          );
        }
        return (
          <div key={n.id} className="rounded-lg border border-[#F0C75E]/45 bg-[#F0C75E]/10 px-3 py-2">
            <p className="text-[12px] font-bold text-[#F0C75E]">
              ⚠ Este artículo tiene una novedad abierta: {n.tipo || "Novedad"}
            </p>
            {n.descripcion ? <p className="mt-0.5 text-[12px] leading-5 text-[#E9E3C8]">{n.descripcion}</p> : null}
            <label className="mt-1.5 block">
              <span className="text-[11px] font-semibold uppercase tracking-normal text-[#C9C2A0]">¿Cómo se vende?</span>
              <textarea
                value={texto}
                rows={2}
                onChange={(e) => setTextos((t) => ({ ...t, [n.id]: e.target.value }))}
                placeholder="Ej.: se vende con 10% de descuento por la carcasa rota; el cliente lo acepta así."
                className="mt-1 w-full rounded-md border border-[#F0C75E]/50 bg-[#151613] px-2.5 py-1.5 text-[13px] text-[#F5F5F5] placeholder:text-[#5A5B57] outline-none focus:border-[#D7FF4F]/60"
              />
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {n.conProveedor ? (
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#E9E3C8]" title="Por ejemplo, el proveedor prometió un reembolso: la novedad queda “En solución” para seguir esperándolo.">
                  <input type="checkbox" checked={continua[n.id] === true} onChange={(e) => setContinua((c) => ({ ...c, [n.id]: e.target.checked }))} className="h-3.5 w-3.5 accent-[#F0C75E]" />
                  El reclamo con el proveedor continúa
                </label>
              ) : null}
              <span className="ml-auto text-[11px] text-[#C9C2A0]">{faltan > 0 ? `Faltan ${faltan} caracteres` : ""}</span>
              <button
                type="button"
                disabled={faltan > 0}
                onClick={() => setConfirmados((c) => ({ ...c, [n.id]: true }))}
                className="h-7 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-[12px] font-bold text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirmar
              </button>
            </div>
          </div>
        );
      })}
    </div>,
    colSpan
  );
}

function envolver(contenido: ReactNode, colSpan?: number) {
  if (!colSpan) return <div className="mt-1.5">{contenido}</div>;
  return (
    <tr>
      <td colSpan={colSpan} className="pb-2 pt-1">{contenido}</td>
    </tr>
  );
}

/** ¿Algún aviso de estas líneas sigue sin aclarar? */
export function hayAvisoPendiente(estados: Array<EstadoAvisoNovedad | undefined>): boolean {
  return estados.some((e) => e?.pendiente === true);
}

/**
 * Cierra las novedades aclaradas. Se llama SOLO después de emitir con éxito.
 * Devuelve un aviso para mostrar si algo falló ("" si todo bien). Nunca lanza:
 * la venta ya está hecha.
 */
export async function cerrarNovedadesVendidas(modulo: ModuloVenta, estados: Array<EstadoAvisoNovedad | undefined>, documento: string): Promise<string> {
  const cierres = estados.flatMap((e) => e?.cierres ?? []).filter((c) => c.texto.length >= MINIMO_ACLARACION_VENTA);
  if (!cierres.length) return "";
  try {
    const r = await fetch(RUTA[modulo], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documento, cierres }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.success) return `La venta se hizo, pero la novedad no se pudo cerrar: ${j.error ?? "error"}. Ciérrala en Shipping V2 › Novedades.`;
    const errores = (j.data?.errores ?? []) as string[];
    return errores.length ? `La venta se hizo, pero ${errores.length} novedad(es) no se cerraron (${errores.join("; ")}). Revísalas en Shipping V2 › Novedades.` : "";
  } catch {
    return "La venta se hizo, pero no se pudo cerrar la novedad (error de red). Ciérrala en Shipping V2 › Novedades.";
  }
}
