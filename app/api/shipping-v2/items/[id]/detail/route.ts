import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import {
  getShippingV2AccessContextForSession,
  getShippingV2ItemById,
  getShippingV2NovedadesForItem,
  getShippingV2PackingById,
  getShippingV2PagoById,
  getShippingV2Proveedores,
} from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { resolveShippingV2Items } from "@/lib/shipping-v2/item-list-view";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    const [loadedItem, loadedProveedores, loadedNovedades] = await Promise.all([
      getShippingV2ItemById(id, { access }),
      getShippingV2Proveedores(),
      getShippingV2NovedadesForItem(id, access),
    ]);
    const proveedores = access.providerId
      ? loadedProveedores.filter((provider) => provider.id === access.providerId)
      : loadedProveedores;
    const item = resolveShippingV2Items([loadedItem], proveedores)[0];
    const [pago, packing] = await Promise.all([
      item.pagoId
        ? getShippingV2PagoById(item.pagoId, access).catch((error) => {
            console.warn("No se pudo cargar pago relacionado del item Shipping V2:", error);
            return null;
          })
        : Promise.resolve(null),
      item.packingId
        ? getShippingV2PackingById(item.packingId, access, { includeItems: false, includeAiName: false }).catch((error) => {
            console.warn("No se pudo cargar packing relacionado del item Shipping V2:", error);
            return null;
          })
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        item,
        proveedores,
        pago,
        packing,
        novedades: loadedNovedades,
        permissions: access.permissions,
        esAdmin: isAdministratorRole(session?.user.rol),
      },
    });
  } catch (error) {
    console.error("Error al obtener detalle de item Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
