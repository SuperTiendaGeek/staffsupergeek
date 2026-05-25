import { NextResponse } from "next/server";
import { getShippingV2ItemById, updateShippingV2Item, updateShippingV2ItemField } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { ShippingV2ItemWriteInput } from "@/types/shipping-v2";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

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
    sku: String(body.sku ?? body.skuInterno ?? ""),
    skuInterno: String(body.skuInterno ?? ""),
    skuProveedor: String(body.skuProveedor ?? ""),
    modelo: String(body.modelo ?? ""),
    marca: String(body.marca ?? ""),
    numeroSerie: String(body.numeroSerie ?? ""),
    condicion: String(body.condicion ?? ""),
    cantidad: toNumber(body.cantidad),
    unidad: String(body.unidad ?? ""),
    costoProveedor: toNumber(body.costoProveedor),
    precioVentaSugerido: toNumber(body.precioVentaSugerido),
    precioVenta: toNumber(body.precioVenta),
    ubicacionActual: String(body.ubicacionActual ?? ""),
    observacionesInternas: String(body.observacionesInternas ?? ""),
    observacionVenta: String(body.observacionVenta ?? ""),
    esRepuesto: toBoolean(body.esRepuesto),
    usoLocal: toBoolean(body.usoLocal),
    estadoRevision: String(body.estadoRevision ?? ""),
    estadoTriangulacion: String(body.estadoTriangulacion ?? ""),
    estadoDespiece: String(body.estadoDespiece ?? ""),
  };
}

export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;

  try {
    const item = await getShippingV2ItemById(id);
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
    const actor = getShippingV2SessionName(session);
    const item = typeof body?.field === "string"
      ? await updateShippingV2ItemField(id, {
        field: body.field,
        value: body.value,
        eventDescription: typeof body.eventDescription === "string" ? body.eventDescription : undefined,
      }, { actualizadoPor: actor })
      : await updateShippingV2Item(id, parseInput(body), {
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
