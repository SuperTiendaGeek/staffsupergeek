import { NextResponse } from "next/server";
import { addFotosToShippingV2Item, addItemsToShippingV2Packing, canShippingV2, createShippingV2Item, createShippingV2Pago, getShippingV2AccessContextForSession, getShippingV2Items, type ShippingV2AttachmentUpload } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { ShippingV2ItemWriteInput } from "@/types/shipping-v2";
import { validarFotosItem } from "@/lib/shipping-v2/fotos-item";
import { validarRespaldo, type RespaldoAlRegistrar } from "@/lib/shipping-v2/pagos-situacion";

export const dynamic = "force-dynamic";

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
    // Vacío = el servidor usa el valor por defecto de la categoría.
    requiereInspeccion: body.requiereInspeccion === "true" || body.requiereInspeccion === true
      ? true
      : body.requiereInspeccion === "false" || body.requiereInspeccion === false
        ? false
        : undefined,
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
    estadoRevision: String(body.estadoRevision ?? ""),
    estadoTriangulacion: String(body.estadoTriangulacion ?? ""),
    estadoDespiece: String(body.estadoDespiece ?? ""),
    modoLogistico: String(body.modoLogistico ?? ""),
    trackingDirecto: String(body.trackingDirecto ?? ""),
    // Punto 2 (oct-2026): "¿Dónde está el artículo?" y la llegada.
    origenArticulo: String(body.origenArticulo ?? ""),
    trackingHaciaIntermediario: String(body.trackingHaciaIntermediario ?? ""),
    trackingDesdeIntermediario: String(body.trackingDesdeIntermediario ?? ""),
    transportistaOrigenId: String(body.transportistaOrigenId ?? ""),
    transportistaEcuadorId: String(body.transportistaEcuadorId ?? ""),
    packingDestinoId: String(body.packingDestinoId ?? ""),
    // Punto 4 (8-oct): "¿Para qué es?" → activo de la tienda.
    usoLocal: toBoolean(body.usoLocal),
  };
}

/** Punto 9: datos del respaldo del pago, solo si se eligió "Ahora". */
function leerRespaldo(body: Record<string, unknown>): RespaldoAlRegistrar | null {
  if (String(body.respaldoAhora ?? "") !== "true") return null;
  const fecha = String(body.respaldoFecha ?? "").trim();
  return {
    // Solo la fecha: se guarda al mediodía de Ecuador para que no cambie de día.
    fechaPagoReal: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T17:00:00.000Z` : fecha,
    metodoPago: String(body.respaldoMetodo ?? "").trim(),
    cuentaOrigen: String(body.respaldoCuenta ?? ""),
    transaccionId: String(body.respaldoTransaccion ?? "").trim(),
    comprobanteUrl: String(body.respaldoComprobanteUrl ?? "").trim(),
  };
}

function formDataToBody(formData: FormData) {
  const body: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "fotos") continue;
    body[key] = typeof value === "string" ? value : "";
  }
  return body;
}

/**
 * Las fotos ya NO viajan en este POST: el formulario crea el item y después
 * las sube de a una al endpoint de fotos, porque en Vercel el cuerpo entero no
 * puede pasar de 4.5 MB y el formulario más diez fotos lo pasaba solo.
 *
 * Esto se conserva por compatibilidad con cualquier llamada vieja, y valida con
 * las mismas reglas que el navegador (`lib/shipping-v2/fotos-item`).
 */
async function parseFotos(formData: FormData): Promise<ShippingV2AttachmentUpload[]> {
  const files = formData.getAll("fotos").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return [];

  const validacion = validarFotosItem(files.map((f) => ({ name: f.name, type: f.type, size: f.size })));
  if (!validacion.ok) throw new Error(validacion.motivo);

  const fotos: ShippingV2AttachmentUpload[] = [];
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) {
      throw new Error("Una de las fotos seleccionadas está vacía.");
    }

    fotos.push({
      filename: file.name || `shipping-v2-foto-${Date.now()}`,
      contentType: file.type,
      fileBase64: Buffer.from(bytes).toString("base64"),
    });
  }

  return fotos;
}

export async function GET() {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    const items = await getShippingV2Items({ access });
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("Error al obtener items Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canEditItems")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para crear items." }, { status: 403 });
    }
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown>;
    let fotos: ShippingV2AttachmentUpload[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = formDataToBody(formData);
      fotos = await parseFotos(formData);
    } else {
      body = await request.json().catch(() => ({}));
    }

    const input = parseInput(body);

    // Punto 9 (12-oct): respaldo del pago al registrar la compra (opcional).
    // Se valida ANTES de crear el artículo para no dejar nada a medias por un
    // dato mal escrito; si después falla el registro del pago, el artículo
    // queda creado y aparece en Pagos → "Falta respaldo".
    const respaldo = leerRespaldo(body);
    if (respaldo) {
      if (!canShippingV2(access, "canManagePayments")) {
        return NextResponse.json({ success: false, error: "No tienes permiso para registrar el respaldo del pago. Regístralo después desde Pagos." }, { status: 403 });
      }
      const errorRespaldo = validarRespaldo(respaldo);
      if (errorRespaldo) return NextResponse.json({ success: false, error: `Respaldo: ${errorRespaldo}` }, { status: 400 });
    }

    // Punto 9d: desde "Registrar compra" cada artículo nace dentro de su orden.
    const ordenCompraId = String(body.ordenCompraId ?? "").trim();
    if (ordenCompraId && respaldo) {
      return NextResponse.json({ success: false, error: "El pago de una orden se registra en la orden, no en cada artículo." }, { status: 400 });
    }
    const item = await createShippingV2Item(input, {
      registradoPor: getShippingV2SessionName(session),
      ordenCompraId: ordenCompraId || undefined,
    });

    let responseItem = item;
    // Registro en una sola pantalla: si se eligió una caja, se agrega ahí
    // mismo. Con los permisos de quien registra. Si falla, el artículo ya
    // quedó creado y se avisa: se puede agregar después desde Logística.
    let packingWarning = "";
    if (input.packingDestinoId) {
      try {
        await addItemsToShippingV2Packing(input.packingDestinoId, [item.id], {
          registradoPor: getShippingV2SessionName(session),
          access,
        });
      } catch (packingError) {
        packingWarning = `El artículo se creó, pero no se pudo agregar a la caja: ${
          packingError instanceof Error ? packingError.message : "error inesperado"
        }. Agrégalo desde Logística.`;
      }
    }
    let respaldoWarning = "";
    if (respaldo) {
      if (!item.requierePago || item.esRegalo || !item.proveedorId) {
        respaldoWarning = "Este artículo no genera pago: no se registró respaldo.";
      } else {
        try {
          await createShippingV2Pago(
            {
              proveedorId: item.proveedorId,
              itemIds: [item.id],
              regalosIds: [],
              estadoPago: "Pagado",
              fechaPagoReal: respaldo.fechaPagoReal ?? undefined,
              metodoPago: respaldo.metodoPago ?? undefined,
              cuentaOrigen: respaldo.cuentaOrigen ?? undefined,
              transaccionId: respaldo.transaccionId ?? undefined,
              comprobanteUrl: respaldo.comprobanteUrl ?? undefined,
              observacion: `Respaldo registrado al crear ${item.sku || "el artículo"}.`,
            },
            { registradoPor: getShippingV2SessionName(session), access }
          );
        } catch (pagoError) {
          respaldoWarning = `El artículo se creó, pero no se pudo registrar el respaldo: ${
            pagoError instanceof Error ? pagoError.message : "error inesperado"
          }. Regístralo desde Pagos → Falta respaldo.`;
        }
      }
    }
    let photoUploadStatus: "none" | "complete" | "partial" | "failed" = fotos.length > 0 ? "complete" : "none";
    let photoWarning = "";
    let uploadedFotos = 0;
    let failedFotos: string[] = [];

    if (fotos.length > 0) {
      try {
        const result = await addFotosToShippingV2Item(item.id, fotos, {
          registradoPor: getShippingV2SessionName(session),
        });
        responseItem = result.item;
        uploadedFotos = result.uploadedCount;
        photoWarning = result.warning || "";
        photoUploadStatus = result.warning ? "partial" : "complete";
      } catch (photoError) {
        photoUploadStatus = "failed";
        photoWarning = photoError instanceof Error
          ? photoError.message
          : "El Item se creó, pero no se pudieron subir las fotos.";
        failedFotos = fotos.map((foto) => foto.filename);
      }
    }

    return NextResponse.json({
      success: true,
      data: responseItem,
      recordId: responseItem.id,
      aiNameSuggestionReviewAvailable: true,
      uploadedFotos,
      failedFotos,
      photoUploadStatus,
      photoWarning,
      packingWarning: packingWarning || undefined,
      respaldoWarning: respaldoWarning || undefined,
      warning: [photoWarning, packingWarning, respaldoWarning].filter(Boolean).join(" ") || undefined,
    }, { status: 201 });
  } catch (error) {
    console.error("Error al crear item Shipping V2:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
