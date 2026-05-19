import { NextResponse } from "next/server";
import { canAccessApp } from "@/lib/apps";
import {
  actualizarLogisticaShippingPacking,
  agregarItemsAShippingPacking,
  cerrarShippingPacking,
  marcarShippingPackingEnTransito,
  quitarItemDeShippingPacking,
} from "@/lib/shipping/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { ShippingPackingLogisticsInput } from "@/types/shipping";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
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

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionFromCookie();

  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  if (!canAccessApp(session, "Shipping")) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isAirtableRecordId(id)) {
    return NextResponse.json({ success: false, error: "Packing inválido." }, { status: 400 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ success: false, error: "Formulario inválido." }, { status: 400 });
  }

  const action = getString(formData, "action");

  try {
    if (action === "add-items") {
      const itemIds = formData.getAll("itemIds").filter((value): value is string => typeof value === "string" && isAirtableRecordId(value));
      if (itemIds.length === 0) return NextResponse.json({ success: false, error: "Selecciona al menos un item." }, { status: 400 });
      const detail = await agregarItemsAShippingPacking(id, itemIds);
      return NextResponse.json({ success: true, data: detail });
    }

    if (action === "remove-item") {
      const itemId = getString(formData, "itemId");
      if (!isAirtableRecordId(itemId)) return NextResponse.json({ success: false, error: "Item inválido." }, { status: 400 });
      const detail = await quitarItemDeShippingPacking(id, itemId);
      return NextResponse.json({ success: true, data: detail });
    }

    if (action === "close") {
      const detail = await cerrarShippingPacking(id);
      return NextResponse.json({ success: true, data: detail });
    }

    if (action === "update-logistics") {
      const peso = getOptionalNumber(formData, "peso");
      const fleteEc = getOptionalNumber(formData, "fleteEc");
      const arancel = getOptionalNumber(formData, "arancel");
      if ([peso, fleteEc, arancel].some((value) => Number.isNaN(value))) {
        return NextResponse.json({ success: false, error: "Los valores numéricos no son válidos." }, { status: 400 });
      }
      if ([peso, fleteEc, arancel].some((value) => value !== null && value < 0)) {
        return NextResponse.json({ success: false, error: "Peso, flete y arancel no pueden ser negativos." }, { status: 400 });
      }

      const input: ShippingPackingLogisticsInput = {
        peso,
        usaTracking: getString(formData, "usaTracking"),
        ecTracking: getString(formData, "ecTracking"),
        fechaEnvio: getString(formData, "fechaEnvio"),
        arriboEstimado: getString(formData, "arriboEstimado"),
        fleteEc,
        arancel,
      };
      const result = await actualizarLogisticaShippingPacking(id, input);
      return NextResponse.json({ success: true, data: result.detail, warning: result.warning });
    }

    if (action === "mark-transit") {
      const detail = await marcarShippingPackingEnTransito(id);
      return NextResponse.json({ success: true, data: detail });
    }

    return NextResponse.json({ success: false, error: "Acción inválida." }, { status: 400 });
  } catch (error) {
    console.error("Error al actualizar packing de Shipping:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "No se pudo actualizar el packing." },
      { status: 500 }
    );
  }
}
