import { NextResponse } from "next/server";

/**
 * Respuesta para endpoints de módulos que ya no existen.
 *
 * Cotizaciones y Pedidos se fundieron en Operación Comercial. Sus PANTALLAS ya
 * redirigen (ver components/operaciones/ModuloMudadoRedirect.tsx), pero sus
 * rutas de API siguieron respondiendo, y apuntan a tablas de Airtable que se
 * borraron en esa migración: "Cotizaciones", "Opciones de Cotización" y
 * "Abonos de Cotización".
 *
 * Llamarlas hoy da un error críptico de Airtable ("NOT_FOUND: table"). Es mejor
 * decir la verdad: el módulo se movió. Se usa 410 Gone porque describe
 * exactamente esto — el recurso existió y ya no, de forma permanente.
 *
 * Mismo patrón que app/api/tecnicos/ordenes/[id]/repuestos, congelado cuando
 * los repuestos pasaron a salir de Shipping Items.
 */
export function moduloMudadoAOperaciones(modulo: "Cotizaciones" | "Pedidos") {
  return NextResponse.json(
    {
      success: false,
      error: `El módulo de ${modulo} se fusionó en Operaciones Comerciales. Esta acción ya no está disponible aquí.`,
      redirectTo: "/operaciones",
    },
    { status: 410 }
  );
}
