import { NextResponse } from "next/server";
import { ErrorValidacionProveedor } from "@/lib/shipping-v2/proveedores-admin";

/** Respuesta de error común de las rutas de Administrar › Proveedores. */
export function respuestaErrorProveedor(error: unknown, contexto: string) {
  if (error instanceof ErrorValidacionProveedor) {
    return NextResponse.json({ success: false, error: error.message, errores: error.errores }, { status: 422 });
  }
  console.error(`[admin/proveedores] ${contexto}:`, error);
  const mensaje = error instanceof Error ? error.message : "No se pudo completar la acción.";
  const visible = mensaje.startsWith("Airtable") ? "Airtable no respondió. Intenta de nuevo." : mensaje;
  return NextResponse.json({ success: false, error: visible }, { status: 400 });
}
