import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, getShippingV2ItemById, updateShippingV2Item, updateShippingV2ItemField } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { isShippingV2ProviderItemEditableField, SHIPPING_V2_PROVIDER_ITEM_EDITABLE_FIELDS } from "@/lib/shipping-v2/item-edit-config";
import { isAdministratorRole } from "@/lib/apps";
import type { ShippingV2ItemWriteInput } from "@/types/shipping-v2";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

function toBoolean(value: unknown) {
  return value === true || value === "true" || value === "on";
}

function parseInput(body: Record<string, unknown>): ShippingV2ItemWriteInput {
  return {
    nombre: String(body.nombre ?? ""),
    descripcion: String(body.descripcion ?? ""),
    tipoOperacion: String(body.tipoOperacion ?? ""),
    tipoItem: String(body.tipoItem ?? ""),
    categoria: String(body.categoria ?? ""),
    estado: String(body.estado ?? ""),
    proveedorId: String(body.proveedorId ?? ""),
    proveedorLogisticoId: String(body.proveedorLogisticoId ?? ""),
    requierePago: toBoolean(body.requierePago),
    requierePacking: toBoolean(body.requierePacking),
    afectaInventario: toBoolean(body.afectaInventario),
    disponibleVenta: toBoolean(body.disponibleVenta),
    reservado: toBoolean(body.reservado),
    sku: String(body.sku ?? ""),
    skuProveedor: String(body.skuProveedor ?? ""),
    modelo: String(body.modelo ?? ""),
    marca: String(body.marca ?? ""),
    numeroSerie: String(body.numeroSerie ?? ""),
    condicion: String(body.condicion ?? ""),
    cantidad: body.cantidad as number | null,
    unidad: String(body.unidad ?? ""),
    costoProveedor: body.costoProveedor as number | null,
    precioVentaSugerido: body.precioVentaSugerido as number | null,
    precioVenta: (body.precioVentaFinal ?? body.precioVenta) as number | null,
    ubicacionActual: String(body.ubicacionActual ?? ""),
    observacionesInternas: String(body.observacionesInternas ?? ""),
    observacionVenta: String(body.observacionVenta ?? ""),
    esRepuesto: toBoolean(body.esRepuesto),
    usoLocal: toBoolean(body.usoLocal),
    estadoRevision: String(body.estadoRevision ?? ""),
    estadoTriangulacion: String(body.estadoTriangulacion ?? ""),
    estadoDespiece: String(body.estadoDespiece ?? ""),
    modoLogistico: String(body.modoLogistico ?? ""),
    trackingDirecto: String(body.trackingDirecto ?? ""),
  };
}

export async function GET(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    const item = await getShippingV2ItemById(id, { access });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error al obtener item Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const access = await getShippingV2AccessContextForSession(session);
    const actor = getShippingV2SessionName(session);
    const isInlineFieldUpdate = typeof body?.field === "string";

    if (isInlineFieldUpdate) {
      const canEditAnyItemField = canShippingV2(access, "canEditItems");
      const canEditProviderItemField =
        canShippingV2(access, "canEditProviderItemFields") && isShippingV2ProviderItemEditableField(body.field);

      if (!canEditAnyItemField && !canEditProviderItemField) {
        return NextResponse.json({ success: false, error: "No tienes permiso para editar este campo." }, { status: 403 });
      }

      const item = await updateShippingV2ItemField(id, {
        field: body.field,
        value: body.value,
        eventDescription: typeof body.eventDescription === "string" ? body.eventDescription : undefined,
      }, {
        actualizadoPor: actor,
        esAdmin: isAdministratorRole(session?.user.rol),
        access,
        allowedFields: canEditAnyItemField ? undefined : SHIPPING_V2_PROVIDER_ITEM_EDITABLE_FIELDS,
      });

      return NextResponse.json({ success: true, data: item });
    }

    if (!canShippingV2(access, "canEditItems")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para editar items." }, { status: 403 });
    }

    const item = await updateShippingV2Item(id, parseInput(body), {
      actualizadoPor: actor,
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error al actualizar item Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
