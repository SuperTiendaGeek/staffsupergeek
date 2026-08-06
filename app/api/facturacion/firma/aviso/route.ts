import { NextResponse } from "next/server";

import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFirmaActiva } from "@/lib/facturacion/firma/resolverFirmaActiva";
import { notificarVencimientoFirma } from "@/lib/facturacion/firma/avisos";
import { diasRestantes, nivelVigencia, mensajeVigencia } from "@/lib/facturacion/firma/vigencia";

export const dynamic = "force-dynamic";

// GET /api/facturacion/firma/aviso
//
// Estado mínimo de la firma para el banner. A diferencia de
// /api/facturacion/firma (solo administrador), este lo puede consultar
// CUALQUIER usuario de facturación: son ellos los que emiten y los que se
// quedarían tirados si la firma vence.
//
// Solo devuelve nivel, días y el texto del aviso. Ni titular, ni emisor, ni
// nada del certificado.
//
// Además dispara la notificación del día cuando corresponde (ver avisos.ts:
// el proyecto no tiene cron, y este endpoint es el que se llama al abrir
// facturación). Está deduplicado por clave, así que llamarlo mil veces crea
// una sola notificación.

export async function GET() {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  try {
    const firma = await obtenerFirmaActiva();

    if (!firma.metadatos) {
      return NextResponse.json({ success: true, data: { nivel: null } });
    }

    const ahora = new Date();
    const m     = firma.metadatos;
    const nivel = nivelVigencia(m.validoHasta, ahora);

    // Best-effort y sin bloquear la respuesta del banner.
    if (nivel !== "vigente") {
      void notificarVencimientoFirma(m, ahora);
    }

    return NextResponse.json({
      success: true,
      data: {
        nivel,
        diasRestantes: diasRestantes(m.validoHasta, ahora),
        validoHasta:   m.validoHasta.toISOString(),
        mensaje:       mensajeVigencia(m.validoHasta, ahora),
      },
    });
  } catch (e) {
    // Que el banner no pueda resolverse no debe romper la pantalla que lo
    // incluye. Se devuelve "sin nivel" y la UI no pinta nada.
    console.error("[/api/facturacion/firma/aviso]", e);
    return NextResponse.json({ success: true, data: { nivel: null } });
  }
}
