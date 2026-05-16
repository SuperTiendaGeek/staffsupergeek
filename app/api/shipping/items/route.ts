import { NextResponse } from "next/server";
import { canAccessApp } from "@/lib/apps";
import { crearOActualizarPagoPendienteParaItem, crearShippingItem, obtenerShippingProveedores } from "@/lib/shipping/airtable";
import { getSessionFromCookie } from "@/lib/session";
import {
  SHIPPING_CREATABLE_ITEM_FOR_OPTIONS,
  SHIPPING_ITEM_CARRIERS,
  SHIPPING_ITEM_CATEGORIES,
  type ShippingAttachmentInput,
  type ShippingCreatableItemPara,
  type ShippingNewItemInput,
} from "@/types/shipping";

export const dynamic = "force-dynamic";

const MAX_FILES_PER_REQUEST = 8;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(formData: FormData, name: string) {
  return formData.get(name) === "true";
}

function getOptionalNumber(formData: FormData, name: string) {
  const value = getString(formData, name);
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isAirtableRecordId(value: string) {
  return /^rec[a-zA-Z0-9]{14}$/.test(value);
}

function isAllowed(value: string, allowed: readonly string[]) {
  return allowed.includes(value);
}

function isCreatableItemPara(value: string): value is ShippingCreatableItemPara {
  return SHIPPING_CREATABLE_ITEM_FOR_OPTIONS.includes(value as ShippingCreatableItemPara);
}

export async function POST(request: Request) {
  const session = await getSessionFromCookie();

  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  if (!canAccessApp(session, "Shipping")) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ success: false, error: "Formulario inválido" }, { status: 400 });
  }

  const item = getString(formData, "item");
  const categoria = getString(formData, "categoria");
  const itemPara = getString(formData, "itemPara");
  const proveedorId = getString(formData, "proveedorId");
  const regalo = getBoolean(formData, "regalo");
  const encargo = getBoolean(formData, "encargo");
  const carrier = getString(formData, "carrier");
  const qty = getOptionalNumber(formData, "qty");
  const costoProveedor = getOptionalNumber(formData, "costoProveedor");
  const precioVenta = getOptionalNumber(formData, "precioVenta");
  const peso = getOptionalNumber(formData, "peso");

  if (!item || !categoria || !itemPara || !proveedorId || costoProveedor === null) {
    return NextResponse.json(
      { success: false, error: "Item, categoría, item para, proveedor y costo proveedor son obligatorios." },
      { status: 400 }
    );
  }

  if (!isAllowed(categoria, SHIPPING_ITEM_CATEGORIES)) {
    return NextResponse.json({ success: false, error: "Categoría inválida." }, { status: 400 });
  }

  if (!isCreatableItemPara(itemPara)) {
    return NextResponse.json(
      { success: false, error: "Este tipo de item no se puede crear desde Shipping. Usa el módulo correspondiente." },
      { status: 400 }
    );
  }

  if (carrier && !isAllowed(carrier, SHIPPING_ITEM_CARRIERS)) {
    return NextResponse.json({ success: false, error: "Carrier inválido." }, { status: 400 });
  }

  if (!isAirtableRecordId(proveedorId)) {
    return NextResponse.json({ success: false, error: "Proveedor inválido." }, { status: 400 });
  }

  const proveedores = await obtenerShippingProveedores(500);
  if (!proveedores.some((proveedor) => proveedor.id === proveedorId)) {
    return NextResponse.json({ success: false, error: "Selecciona un proveedor existente." }, { status: 400 });
  }

  if ([qty, costoProveedor, precioVenta, peso].some((value) => Number.isNaN(value))) {
    return NextResponse.json({ success: false, error: "Los valores numéricos no son válidos." }, { status: 400 });
  }

  if (qty !== null && qty <= 0) {
    return NextResponse.json({ success: false, error: "Qty debe ser mayor a 0." }, { status: 400 });
  }

  if (costoProveedor < 0) {
    return NextResponse.json({ success: false, error: "Costo Proveedor no puede ser negativo." }, { status: 400 });
  }

  if (!regalo && costoProveedor < 0) {
    return NextResponse.json({ success: false, error: "Costo Proveedor debe ser mayor o igual a 0." }, { status: 400 });
  }

  if ((precioVenta !== null && precioVenta < 0) || (peso !== null && peso < 0)) {
    return NextResponse.json({ success: false, error: "Precio Venta y Peso no pueden ser negativos." }, { status: 400 });
  }

  const fotoFiles = formData.getAll("fotos").filter((file): file is File => file instanceof File && file.size > 0);

  if (fotoFiles.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ success: false, error: `Puedes subir hasta ${MAX_FILES_PER_REQUEST} fotos.` }, { status: 400 });
  }

  const fotos: ShippingAttachmentInput[] = [];

  for (const file of fotoFiles) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ success: false, error: "Solo se pueden adjuntar imágenes en Fotos." }, { status: 400 });
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      return NextResponse.json({ success: false, error: `La foto ${file.name || "seleccionada"} excede 10MB.` }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    fotos.push({
      filename: file.name || `foto-${Date.now()}`,
      contentType: file.type || "application/octet-stream",
      fileBase64: Buffer.from(bytes).toString("base64"),
    });
  }

  const input: ShippingNewItemInput = {
    item,
    categoria,
    itemPara,
    proveedorId,
    qty,
    costoProveedor,
    precioVenta,
    peso,
    regalo,
    encargo,
    carrier,
    usaTracking: getString(formData, "usaTracking"),
    ecTracking: getString(formData, "ecTracking"),
    notaInterna: getString(formData, "notaInterna"),
    notaPublica: getString(formData, "notaPublica"),
  };

  try {
    const result = await crearShippingItem(input, fotos);
    const warnings = result.warning ? [result.warning] : [];
    const paymentWarnings: string[] = [];
    let paymentLink = null;

    try {
      paymentLink = await crearOActualizarPagoPendienteParaItem(result.item, { proveedorId });
      paymentWarnings.push(...paymentLink.warnings);
    } catch (paymentError) {
      console.error("Item creado, pero no se pudo vincular el pago de Shipping:", paymentError);
      paymentWarnings.push(
        `Item creado, pero revisar grupo de pago: ${paymentError instanceof Error ? paymentError.message : "no se pudo vincular el pago."}`
      );
    }
    warnings.push(...paymentWarnings);

    return NextResponse.json(
      {
        success: true,
        data: result.item,
        paymentLink,
        paymentWarning: paymentWarnings.length > 0,
        warning: warnings.length ? warnings.join(" ") : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al crear item de Shipping:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "No se pudo crear el item." },
      { status: 500 }
    );
  }
}
