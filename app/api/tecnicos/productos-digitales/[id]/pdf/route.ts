import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import {
  fetchProductoDigitalById,
  fetchProductoDigitalConCredenciales,
  fetchClienteById,
  fetchOrdenById,
  saveProductoDigitalPdf,
  clearProductoDigitalPdf,
} from "@/lib/tecnicos/airtable";
import { generateProductoDigitalPDF, type PDFProductoData } from "@/lib/tecnicos/pdf/generate";
import { isAdministratorRole } from "@/lib/apps";
import type { StaffSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function buildAndStorePdf(
  recordId: string,
  session: StaffSession,
): Promise<{ pdfBytes: Buffer; filename: string }> {
  const producto = await fetchProductoDigitalConCredenciales(recordId);
  if (!producto) throw new Error("Producto digital no encontrado.");

  let clienteNombre: string | null = null;
  if (producto.clienteId) {
    try {
      const c = await fetchClienteById(producto.clienteId);
      clienteNombre = c?.nombre ?? null;
    } catch { /* ignore */ }
  }

  let ordenIdVisible: string | null = null;
  if (producto.ordenReparacionId) {
    try {
      const o = await fetchOrdenById(producto.ordenReparacionId);
      ordenIdVisible = o?.idVisible ?? null;
    } catch { /* ignore */ }
  }

  const now = new Date();
  const fechaGeneracion = now.toLocaleString("es-CR", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const pdfData: PDFProductoData = {
    softwareProducto: producto.softwareProducto,
    marcaProducto: producto.marcaProducto,
    tipoProducto: producto.tipoProducto,
    logoProductoUrl: producto.logoProductoUrl,
    portalActivacionCatalogo: producto.portalActivacionCatalogo,
    instruccionesPdfCatalogo: producto.instruccionesPdfCatalogo,
    notasParaClienteCatalogo: producto.notasParaClienteCatalogo,
    duracion: producto.duracion,
    fechaUsoVenta: producto.fechaUsoVenta,
    expira: producto.expira,
    clienteNombre,
    ordenIdVisible,
    claveActivacion: producto.claveActivacion,
    usuarioCorreo: producto.usuarioCorreo,
    contrasena: producto.contrasena,
    generadoPor: session.user.nombre,
    fechaGeneracion,
  };

  const pdfUint8 = await generateProductoDigitalPDF(pdfData);
  const pdfBytes = Buffer.from(pdfUint8);

  const safeName = producto.softwareProducto
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const safeCliente = (clienteNombre ?? "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 20);
  const dateStr = now.toISOString().slice(0, 10);
  const filename = `SUPER-GEEK-${safeName}${safeCliente ? `-${safeCliente}` : ""}-${dateStr}.pdf`;

  await saveProductoDigitalPdf({
    recordId,
    filename,
    pdfBytes,
    generadoPor: `${session.user.nombre} (${session.user.email})`,
  });

  return { pdfBytes, filename };
}

function toPlainArrayBuffer(buf: Buffer | ArrayBuffer): ArrayBuffer {
  if (buf instanceof ArrayBuffer) return buf;
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

function pdfResponse(pdfBytes: Buffer | ArrayBuffer, filename: string): Response {
  const ab = toPlainArrayBuffer(pdfBytes);
  return new Response(ab, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// POST — Genera un PDF nuevo, lo guarda en Airtable y lo descarga.
export async function POST(_req: Request, { params }: RouteContext) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  if (!session) return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const recordId = decodeURIComponent(id);

  try {
    const { pdfBytes, filename } = await buildAndStorePdf(recordId, session);
    return pdfResponse(pdfBytes, filename);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al generar PDF";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// GET — Descarga el PDF existente. No regenera. Si no existe, devuelve 404.
export async function GET(_req: Request, { params }: RouteContext) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  if (!session) return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const recordId = decodeURIComponent(id);

  const producto = await fetchProductoDigitalById(recordId);
  if (!producto) {
    return NextResponse.json({ success: false, error: "Producto no encontrado" }, { status: 404 });
  }

  if (!producto.documentoPdfUrl) {
    return NextResponse.json(
      { success: false, error: "PDF no generado todavía" },
      { status: 404 }
    );
  }

  try {
    const pdfRes = await fetch(producto.documentoPdfUrl);
    if (!pdfRes.ok) throw new Error("No se pudo descargar el archivo PDF almacenado");
    const buffer = await pdfRes.arrayBuffer();
    const safeName = producto.softwareProducto
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 50);
    return pdfResponse(buffer, `SUPER-GEEK-${safeName}.pdf`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al descargar PDF";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE — Elimina el PDF almacenado. Solo administradores.
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  if (!session) return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });

  if (!isAdministratorRole(session.user.rol)) {
    return NextResponse.json(
      { success: false, error: "Sin permisos. Solo administradores pueden eliminar PDFs." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const recordId = decodeURIComponent(id);

  try {
    await clearProductoDigitalPdf(recordId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al eliminar PDF";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
