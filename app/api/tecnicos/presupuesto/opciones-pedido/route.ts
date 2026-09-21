import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";
import { fetchTiemposEstimados } from "@/lib/operaciones/airtable";
import { CATEGORIAS_REPUESTO_PEDIDO } from "@/lib/tecnicos/presupuesto/reglas";

export const dynamic = "force-dynamic";

// GET /api/tecnicos/presupuesto/opciones-pedido
//
// Lo que necesita el formulario "Repuesto bajo pedido" de la tarjeta
// Presupuesto: proveedores de COMPRA (nunca los solo logísticos: un proveedor
// logístico no puede ser el proveedor del artículo, lo rechazaría Shipping al
// crearlo), tiempos estimados y categorías. Vive bajo /api/tecnicos a
// propósito: un técnico cotiza desde la orden aunque no tenga permiso de
// Operaciones (decisión del 21-sep-2026).
export async function GET() {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  try {
    const [proveedores, tiempos] = await Promise.all([getShippingV2Proveedores(), fetchTiemposEstimados()]);
    return NextResponse.json({
      success: true,
      data: {
        proveedores: proveedores
          .filter(canBePurchaseProvider)
          .map((p) => ({ id: p.id, nombre: p.nombre || p.label }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
        tiempos,
        categorias: CATEGORIAS_REPUESTO_PEDIDO,
      },
    });
  } catch (e) {
    console.error("[presupuesto opciones-pedido]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudieron cargar las opciones" }, { status: 500 });
  }
}
