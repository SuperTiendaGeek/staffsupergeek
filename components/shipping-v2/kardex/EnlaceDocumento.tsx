"use client";

// El documento de un movimiento del Kardex: factura, recibo, nota de crédito y
// reserva se abren en el visor (ventana flotante, el Kardex queda detrás);
// lo demás (caja, orden de compra, conteo, ficha) lleva a su pantalla.

import Link from "next/link";
import type { MovimientoKardex } from "@/lib/shipping-v2/kardex";
import { tipoVisorDeKardex } from "@/lib/facturacion/documentos/visor-tipos";
import { useVisorDocumentos } from "@/components/documentos/DocumentoModal";
import { enlaceDocumento, enlaceReserva } from "./kardex-formato";

export function EnlaceDocumento({ documentoTipo, documentoId, registroId, texto, className = "text-[#D7FF4F] hover:underline", apagado = "text-[#B4B5AC]" }: {
  documentoTipo: string;
  documentoId: string;
  registroId: string;
  texto: string;
  className?: string;
  /** Clase cuando no hay a dónde ir. */
  apagado?: string;
}) {
  const visor = useVisorDocumentos();
  if (!texto) return null;
  const tipo = tipoVisorDeKardex(documentoTipo);
  if (visor && tipo && documentoId.startsWith("rec")) {
    return (
      <button type="button" onClick={() => visor.abrir(tipo, documentoId, texto.replace(/^Fac\. /, ""))} className={`${className} text-left`}>
        {texto}
      </button>
    );
  }
  const href = documentoTipo === "Reserva"
    ? (documentoId ? enlaceReserva(documentoId) : null)
    : enlaceDocumento({ documentoTipo: documentoTipo as MovimientoKardex["documentoTipo"], documentoId, registroId });
  return href ? <Link href={href} className={className}>{texto}</Link> : <span className={apagado}>{texto}</span>;
}
