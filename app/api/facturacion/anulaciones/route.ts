import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { listarSolicitudesAnulacion } from "@/lib/facturacion/anulaciones/airtable";
import { fechaLimiteAnulacion, diasRestantesAnulacion } from "@/lib/facturacion/anulaciones/fechas";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";

export const dynamic = "force-dynamic";

// GET /api/facturacion/anulaciones — solicitudes pendientes con su plazo.
export async function GET() {
  const { response } = await requireFacturacionSession();
  if (response) return response;
  try {
    const hoy = ahoraEnEcuador();
    const solicitudes = (await listarSolicitudesAnulacion()).map((s) => {
      const emision = new Date(`${s.fechaEmision}T00:00:00`);
      return {
        ...s,
        fechaLimite: fechaLimiteAnulacion(emision).toISOString().slice(0, 10),
        diasRestantes: diasRestantesAnulacion(emision, hoy),
      };
    });
    return NextResponse.json({ success: true, data: { solicitudes } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al listar anulaciones" }, { status: 500 });
  }
}
