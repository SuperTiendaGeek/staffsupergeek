import { NextResponse } from "next/server";
import { updateHistorialSolicitarMensaje } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ordenDeHistorial, resumenParaMensajeDeOrden } from "@/lib/estado-cuenta/resumen-servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/tecnicos/historial/[id]/generar-mensaje
// Activa la Automatización 2 de Airtable (redacta el WhatsApp con IA).
// Auditoría ops, punto 4C:
//   · exige sesión de Técnicos (antes la ruta no pedía ninguna);
//   · escribe en el mismo cambio la foto de la cuenta de la orden
//     ("Resumen de cuenta (sistema)"), calculada con la calculadora única.
export async function PATCH(_: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { id } = await params;
  if (!id || !/^rec[A-Za-z0-9]{14}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Falta id de historial" }, { status: 400 });
  }

  try {
    const ordenId = await ordenDeHistorial(id);
    const resumenCuenta = ordenId ? await resumenParaMensajeDeOrden(ordenId) : "";
    const result = await updateHistorialSolicitarMensaje({ historialRecordId: id, resumenCuenta });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error al solicitar mensaje cliente en historial", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
