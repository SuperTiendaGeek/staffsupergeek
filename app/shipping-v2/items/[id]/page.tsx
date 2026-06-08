import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffBadge, StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import { Button } from "@/components/ui/button";
import { canAccessApp } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import { getShippingV2AccessContextForSession, getShippingV2ItemById, getShippingV2PackingById, getShippingV2PagoById, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { createShippingV2ProveedorLabelMap, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import type { ShippingV2Item, ShippingV2Packing, ShippingV2Pago, ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2ItemDetailView, type ResolvedItem } from "../ShippingV2ItemsClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

function displayValue(value?: string | null, fallback = "-") {
  const stringValue = String(value ?? "").trim();
  return stringValue || fallback;
}

function isNotFoundError(error: unknown) {
  return error instanceof Error && error.message.includes("Airtable Shipping V2 error 404");
}

function resolveItem(item: ShippingV2Item, proveedores: ShippingV2Proveedor[]): ResolvedItem {
  const labelsById = createShippingV2ProveedorLabelMap(proveedores);

  return {
    ...item,
    proveedorCompraDisplay: resolveShippingV2ProveedorLabel(item.proveedorId, labelsById),
    proveedorLogisticoDisplay: resolveShippingV2ProveedorLabel(item.proveedorLogisticoId, labelsById),
  };
}

function DetailUnavailable({ title, message }: { title: string; message: string }) {
  return (
    <div className="w-full max-w-none space-y-3">
      <StaffPageHeader
        eyebrow={<StaffBadge tone="lime">SHIPPING V2</StaffBadge>}
        title={title}
        description={message}
        actions={
          <Button asChild className="h-9 rounded-lg bg-[#D7FF4F] px-4 text-sm font-black text-[#151515] hover:bg-[#D7FF4F]/90">
            <Link href="/shipping-v2/items">Volver a Items</Link>
          </Button>
        }
      />
      <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-4 text-orange-100">
        <p className="text-sm font-semibold uppercase tracking-normal">{title}</p>
        <p className="mt-2 text-sm leading-6 text-orange-100/85">{message}</p>
      </section>
    </div>
  );
}

export default async function ShippingV2ItemDetailPage({ params }: Props) {
  const session = await getSessionFromCookie();

  if (!session || !canAccessApp(session, "Shipping")) {
    redirect("/acceso-denegado");
  }

  const { id } = await params;
  let item: ResolvedItem | null = null;
  let pago: ShippingV2Pago | null = null;
  let packing: ShippingV2Packing | null = null;
  let proveedores: ShippingV2Proveedor[] = [];
  let error = "";
  let notFound = false;

  try {
    const [loadedItem, loadedProveedores] = await Promise.all([
      getShippingV2ItemById(id),
      getShippingV2Proveedores(),
    ]);
    proveedores = loadedProveedores;
    item = resolveItem(loadedItem, proveedores);
    const access = await getShippingV2AccessContextForSession(session);
    const [loadedPago, loadedPacking] = await Promise.all([
      item.pagoId ? getShippingV2PagoById(item.pagoId).catch((relatedError) => {
        console.warn("No se pudo cargar pago relacionado del item Shipping V2:", relatedError);
        return null;
      }) : Promise.resolve(null),
      item.packingId ? getShippingV2PackingById(item.packingId, access, { includeItems: false, includeAiName: false }).catch((relatedError) => {
        console.warn("No se pudo cargar packing relacionado del item Shipping V2:", relatedError);
        return null;
      }) : Promise.resolve(null),
    ]);
    pago = loadedPago;
    packing = loadedPacking;
  } catch (loadError) {
    console.error("Error al cargar detalle de item Shipping V2:", loadError);
    notFound = isNotFoundError(loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar el item.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      {notFound ? (
        <DetailUnavailable title="Item no encontrado" message="No existe un item de Shipping V2 con ese ID." />
      ) : error || !item ? (
        <DetailUnavailable title="Item no disponible" message={error || "No se pudo cargar el item."} />
      ) : (
        <div className="w-full max-w-none space-y-3">
          <StaffPageHeader
            eyebrow={<StaffBadge tone="lime">SHIPPING V2</StaffBadge>}
            title={displayValue(item.nombre, "Item sin nombre")}
            description={`${displayValue(item.sku)} / ${displayValue(item.estado)} / ${displayValue(item.tipoOperacion)}`}
            actions={
              <Button asChild className="h-9 rounded-lg bg-[#D7FF4F] px-4 text-sm font-black text-[#151515] hover:bg-[#D7FF4F]/90">
                <Link href="/shipping-v2/items">Volver a Items</Link>
              </Button>
            }
          />
          <ShippingV2ItemDetailView item={item} proveedores={proveedores} pago={pago} packing={packing} />
        </div>
      )}
    </StaffAppShell>
  );
}
