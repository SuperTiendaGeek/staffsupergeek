import { type NextRequest, NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { crearOpcion, uploadFotoOpcion } from "@/lib/operaciones/airtable";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  const { id: operacionId } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 });
  }

  const productoDescripcion = (formData.get("productoDescripcion") as string | null)?.trim() ?? "";
  if (!productoDescripcion) {
    return NextResponse.json({ success: false, error: "Producto / Descripción es obligatorio." }, { status: 400 });
  }

  const proveedorId = (formData.get("proveedorId") as string | null)?.trim() || null;
  const tiempoEstimado = (formData.get("tiempoEstimado") as string | null)?.trim() || undefined;
  const urlProveedor = (formData.get("urlProveedor") as string | null)?.trim() || undefined;
  const notaParaCliente = (formData.get("notaParaCliente") as string | null)?.trim() || undefined;
  const notaInterna = (formData.get("notaInterna") as string | null)?.trim() || undefined;

  const costoRaw = formData.get("costoProveedor");
  const costoProveedor = costoRaw !== null && costoRaw !== "" ? parseFloat(costoRaw as string) : null;
  const precioRaw = formData.get("precioVentaCliente");
  const precioVentaCliente = precioRaw !== null && precioRaw !== "" ? parseFloat(precioRaw as string) : null;

  const fotos = formData.getAll("fotos").filter((f) => f instanceof File && f.size > 0) as File[];

  try {
    const { id } = await crearOpcion(operacionId, {
      productoDescripcion,
      proveedorId,
      tiempoEstimado,
      costoProveedor: Number.isFinite(costoProveedor ?? NaN) ? costoProveedor : null,
      precioVentaCliente: Number.isFinite(precioVentaCliente ?? NaN) ? precioVentaCliente : null,
      urlProveedor,
      notaParaCliente,
      notaInterna,
    });

    for (const file of fotos) {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      await uploadFotoOpcion(id, file.name, file.type || "application/octet-stream", base64);
    }

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error("[api/operaciones/[id]/opciones] POST error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al crear la opción." },
      { status: 500 }
    );
  }
}
