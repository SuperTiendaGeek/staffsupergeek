import { NextResponse } from "next/server";
import {
  addEvidenciasToShippingV2Novedad,
  canShippingV2,
  getShippingV2AccessContextForSession,
  removeEvidenciaFromShippingV2Novedad,
  type ShippingV2AttachmentUpload,
} from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { MAX_EVIDENCIAS_POR_NOVEDAD, validarEvidencias } from "@/lib/shipping-v2/evidencias";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Convierte el FormData en adjuntos listos para Airtable.
 *
 * Valida ANTES de leer los bytes: no tiene sentido cargar 25 MB en memoria
 * para después descubrir que el archivo era un PDF. La validación es
 * exactamente la misma función que corre el navegador, así el usuario nunca
 * ve un rechazo distinto al que ya le avisó el selector.
 */
async function parseEvidencias(formData: FormData, yaSubidas: number): Promise<ShippingV2AttachmentUpload[]> {
  const archivos = formData
    .getAll("evidencias")
    .filter((valor): valor is File => valor instanceof File);

  const validacion = validarEvidencias(
    archivos.map((archivo) => ({ name: archivo.name, type: archivo.type, size: archivo.size })),
    { yaSubidas }
  );
  if (!validacion.ok) throw new Error(validacion.motivo);

  const adjuntos: ShippingV2AttachmentUpload[] = [];
  for (const archivo of archivos) {
    const bytes = await archivo.arrayBuffer();
    if (bytes.byteLength === 0) {
      throw new Error(`"${archivo.name || "archivo"}" llegó vacío. Vuelve a seleccionarlo.`);
    }
    adjuntos.push({
      filename: archivo.name || `evidencia-${Date.now()}`,
      contentType: archivo.type || "application/octet-stream",
      fileBase64: Buffer.from(bytes).toString("base64"),
      sizeBytes: bytes.byteLength,
    });
  }

  return adjuntos;
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    // "Ver novedades" es permiso de LECTURA. Subir evidencia es escribir en el
    // expediente del reclamo, así que exige poder responder o registrar
    // novedades — igual que hacen las otras rutas del módulo antes de tocar
    // nada. Un proveedor marcado solo como observador no debe poder escribir.
    if (!canShippingV2(access, "canRespondNovedades") && !canShippingV2(access, "canCreateNovedades")) {
      return NextResponse.json(
        { success: false, error: "No tienes permiso para agregar evidencias a novedades." },
        { status: 403 }
      );
    }
    const formData = await request.formData();
    // El tope real lo revalida `addEvidenciasToShippingV2Novedad` contra lo que
    // la novedad tiene AHORA en Airtable; aquí solo se filtra lo obvio antes
    // de gastar memoria leyendo los archivos.
    const adjuntos = await parseEvidencias(formData, 0);

    const resultado = await addEvidenciasToShippingV2Novedad(id, adjuntos, {
      actor: getShippingV2SessionName(session),
      access,
    });

    return NextResponse.json({
      success: true,
      data: resultado.novedad,
      warning: resultado.warning,
      uploadedCount: resultado.uploadedCount,
      max: MAX_EVIDENCIAS_POR_NOVEDAD,
    });
  } catch (error) {
    console.error("Error al subir evidencias de novedad Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canRespondNovedades") && !canShippingV2(access, "canCreateNovedades")) {
      return NextResponse.json(
        { success: false, error: "No tienes permiso para eliminar evidencias de novedades." },
        { status: 403 }
      );
    }
    const novedad = await removeEvidenciaFromShippingV2Novedad(
      id,
      {
        attachmentId: typeof body.attachmentId === "string" ? body.attachmentId : null,
        url: typeof body.url === "string" ? body.url : null,
        filename: typeof body.filename === "string" ? body.filename : null,
      },
      { actor: getShippingV2SessionName(session), access }
    );

    return NextResponse.json({ success: true, data: novedad });
  } catch (error) {
    console.error("Error al eliminar evidencia de novedad Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
