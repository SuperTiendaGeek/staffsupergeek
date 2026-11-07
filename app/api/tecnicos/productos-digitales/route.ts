import { NextResponse } from "next/server";
import {
  fetchAllProductosDigitales,
  fetchProductosDigitalesDisponibles,
} from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { puedeGestionarLicencias } from "@/lib/productos-digitales/permiso-servidor";

export const dynamic = "force-dynamic";

// GET /api/tecnicos/productos-digitales?estado=Disponible&q=texto
export async function GET(request: Request) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const estado = searchParams.get("estado") ?? undefined;

  try {
    let productos;
    if (estado === "Disponible") {
      productos = await fetchProductosDigitalesDisponibles(q);
    } else {
      productos = await fetchAllProductosDigitales({ estado, query: q });
    }
    // Punto 5B-2: Editar, Reclamo y Anular solo para Staff y Administradores.
    const puedeGestionar = await puedeGestionarLicencias(session).catch(() => false);
    return NextResponse.json({ success: true, data: productos, puedeGestionar });
  } catch (error) {
    console.error("Error al obtener productos digitales:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener productos digitales" },
      { status: 500 }
    );
  }
}

// POST /api/tecnicos/productos-digitales — retirado en el punto 5B-2
// (decisión del dueño, 7-nov-2026): una licencia entra SOLO por su compra en
// Shipping V2 → Registrar compra → Producto digital (costo, orden de compra,
// pago y egreso en Finanzas). Ver app/api/shipping-v2/licencias.
export async function POST() {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  return NextResponse.json(
    { success: false, error: "Las licencias se registran en Shipping V2 → Registrar compra → Producto digital." },
    { status: 410 }
  );
}
