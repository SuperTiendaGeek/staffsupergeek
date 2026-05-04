import { NextResponse } from "next/server";
import { createRepuestoPorOrden } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export async function POST(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;

  if (!ordenRecordId) {
    return NextResponse.json(
      { success: false, error: "Falta el id de la orden" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const catalogoRepuestoId = String(body?.catalogoRepuestoId ?? "").trim();
  const nombreSnapshot = String(body?.nombreSnapshot ?? "").trim();
  const cantidad = toNumber(body?.cantidad);
  const precioCliente = toNumber(body?.precioCliente);
  const costoProveedor = toNumber(body?.costoProveedor);
  const proveedor = typeof body?.proveedor === "string" ? body.proveedor.trim() : null;
  const observacion = typeof body?.observacion === "string" ? body.observacion.trim() : null;

  if (!catalogoRepuestoId) {
    return NextResponse.json(
      { success: false, error: "Debes seleccionar un repuesto del catálogo" },
      { status: 400 }
    );
  }
  if (!nombreSnapshot) {
    return NextResponse.json(
      { success: false, error: "Falta el nombre del repuesto seleccionado" },
      { status: 400 }
    );
  }
  if (cantidad === null || cantidad <= 0) {
    return NextResponse.json(
      { success: false, error: "La cantidad debe ser mayor a 0" },
      { status: 400 }
    );
  }
  if (precioCliente === null || precioCliente < 0) {
    return NextResponse.json(
      { success: false, error: "El precio cliente real es obligatorio" },
      { status: 400 }
    );
  }

  try {
    const created = await createRepuestoPorOrden({
      ordenRecordId,
      catalogoRepuestoId,
      nombreSnapshot,
      cantidad,
      precioCliente,
      costoProveedor,
      proveedor,
      observacion,
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error al crear repuesto por orden:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
