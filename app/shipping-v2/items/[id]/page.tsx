import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ShippingV2NovedadRol } from "@/lib/shipping-v2/novedades";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffBadge, StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import { Button } from "@/components/ui/button";
import { canAccessApp, isAdministratorRole } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { camposConEstado, ocultarCamposDeObjeto } from "@/lib/permissions/campos";
import {
  getShippingV2AccessContextForSession,
  getShippingV2ItemById,
  getShippingV2ItemNavigation,
  getShippingV2NovedadesForItem,
  getShippingV2PackingById,
  getShippingV2PagoById,
  getShippingV2SituacionPagoDeItem,
  getShippingV2Proveedores,
  getShippingV2TrazabilidadDeItem,
  getShippingV2UnidadesDelProducto,
  type ShippingV2ItemNavigation,
} from "@/lib/shipping-v2/airtable";
import { createShippingV2ProveedorLabelMap, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import type { ShippingV2AccessPermissions, ShippingV2Item, ShippingV2ItemTrazabilidad, ShippingV2Novedad, ShippingV2Packing, ShippingV2Pago, ShippingV2Proveedor, ShippingV2UnidadHermana } from "@/types/shipping-v2";
import { ShippingV2ItemHeaderNavigation } from "./ShippingV2ItemHeaderNavigation";
import { EliminarItemAdmin } from "./EliminarItemAdmin";
import { ShippingV2ActivoAcciones } from "./ShippingV2ActivoAcciones";
import { CostosTraerlo } from "@/components/shipping-v2/CostosTraerlo";
import { vieneDeAfuera } from "@/lib/shipping-v2/item-origen";
import { ShippingV2ItemDetailView, type ResolvedItem } from "../ShippingV2ItemsClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

const emptyItemNavigation: ShippingV2ItemNavigation = {
  previous: null,
  next: null,
  index: null,
  total: 0,
  items: [],
};

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
  requirePantallaVisible(session.user.pantallasRestringidas, "shipping-v2", "items");

  // Personalización por usuario (Fase 2 de permisos, ver
  // lib/permissions/campos.ts). Un administrador nunca queda restringido.
  const esAdmin = isAdministratorRole(session.user.rol);
  const restringidosDelUsuario = esAdmin ? {} : session.user.camposRestringidos;
  const camposOcultos = camposConEstado(restringidosDelUsuario, "shipping-v2", "items", "oculto");
  const camposSoloLectura = camposConEstado(restringidosDelUsuario, "shipping-v2", "items", "solo-lectura");

  const { id } = await params;
  let item: ResolvedItem | null = null;
  let pago: ShippingV2Pago | null = null;
  let packing: ShippingV2Packing | null = null;
  let proveedores: ShippingV2Proveedor[] = [];
  let novedades: ShippingV2Novedad[] = [];
  let permissions: ShippingV2AccessPermissions | null = null;
  let rolNovedades: ShippingV2NovedadRol = "ninguno";
  let navigation = emptyItemNavigation;
  let trazabilidad: ShippingV2ItemTrazabilidad | null = null;
  let hermanas: ShippingV2UnidadHermana[] = [];
  let error = "";
  let notFound = false;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    permissions = access.permissions;
    // Punto 8: el rol frente a las novedades se decide aquí (servidor).
    rolNovedades = access.isAdmin
      ? access.isSiteAdmin ? "admin" : "staff"
      : access.providerId && access.permissions.canRespondNovedades ? "proveedor" : "ninguno";
    const [loadedItem, loadedProveedores, loadedNovedades, loadedNavigation] = await Promise.all([
      getShippingV2ItemById(id, { access }),
      getShippingV2Proveedores(),
      getShippingV2NovedadesForItem(id, access),
      getShippingV2ItemNavigation(id, access).catch((navigationError) => {
        console.warn("No se pudo cargar navegación de item Shipping V2:", navigationError);
        return emptyItemNavigation;
      }),
    ]);
    proveedores = access.providerId ? loadedProveedores.filter((provider) => provider.id === access.providerId) : loadedProveedores;
    novedades = loadedNovedades;
    navigation = loadedNavigation;
    // Punto 9: la situación del pago se calcula desde Shipping Pagos (no del estado).
    const situacionPago = await getShippingV2SituacionPagoDeItem(loadedItem).catch((pagoError) => {
      console.warn("No se pudo calcular la situación del pago del item Shipping V2:", pagoError);
      return undefined;
    });
    item = ocultarCamposDeObjeto(resolveItem({ ...loadedItem, situacionPago }, proveedores), camposOcultos);
    const [loadedPago, loadedPacking, loadedTrazabilidad, loadedHermanas] = await Promise.all([
      item.pagoId ? getShippingV2PagoById(item.pagoId, access).catch((relatedError) => {
        console.warn("No se pudo cargar pago relacionado del item Shipping V2:", relatedError);
        return null;
      }) : Promise.resolve(null),
      item.packingId ? getShippingV2PackingById(item.packingId, access, { includeItems: false, includeAiName: false }).catch((relatedError) => {
        console.warn("No se pudo cargar packing relacionado del item Shipping V2:", relatedError);
        return null;
      }) : Promise.resolve(null),
      // Rediseño 15-oct-2026: orden de compra, pedido y documentos de venta
      // para el bloque "Recorrido". Solo el personal (un proveedor no los ve).
      access.isAdmin ? getShippingV2TrazabilidadDeItem(item).catch((relatedError) => {
        console.warn("No se pudo cargar el recorrido del item Shipping V2:", relatedError);
        return null;
      }) : Promise.resolve(null),
      // Punto 10b-4: las otras unidades (o lotes) del mismo SKU.
      getShippingV2UnidadesDelProducto(item.sku, access).catch((relatedError) => {
        console.warn("No se pudieron cargar las otras unidades del producto:", relatedError);
        return [];
      }),
    ]);
    pago = loadedPago;
    packing = loadedPacking;
    trazabilidad = loadedTrazabilidad;
    hermanas = loadedHermanas;
  } catch (loadError) {
    console.error("Error al cargar detalle de item Shipping V2:", loadError);
    notFound = isNotFoundError(loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar el item.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
      <ShippingV2Pestanas />
      {notFound ? (
        <DetailUnavailable title="Item no encontrado" message="No existe un item de Shipping V2 con ese ID." />
      ) : error || !item ? (
        <DetailUnavailable title="Item no disponible" message={error || "No se pudo cargar el item."} />
      ) : (
        <div className="w-full max-w-none space-y-2">
          {/* Rediseño 15-oct-2026: una barra fina (volver y anterior/siguiente); el nombre va en la ficha. */}
          <div className="flex items-center gap-2">
            <Link href={item.usoLocal ? "/shipping-v2/activos" : "/shipping-v2/items"} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-semibold text-[#B4B5AC] transition hover:bg-[#20211D] hover:text-[#D7FF4F]">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {item.usoLocal ? "Activos" : "Artículos"}
            </Link>
            <div className="ml-auto">
              <ShippingV2ItemHeaderNavigation currentItemId={item.id} navigation={navigation} />
            </div>
          </div>
          <ShippingV2ItemDetailView
            item={item}
            proveedores={proveedores}
            pago={pago}
            packing={packing}
            novedades={novedades}
            esAdmin={esAdmin}
            camposOcultos={camposOcultos}
            camposSoloLectura={camposSoloLectura}
            permissions={permissions}
            rolNovedades={rolNovedades}
            trazabilidad={trazabilidad}
            hermanas={hermanas}
            enlaces={{
              facturacion: canAccessApp(session, "Facturación"),
              operaciones: canAccessApp(session, "Operaciones"),
              tecnicos: canAccessApp(session, "Técnicos"),
            }}
            // Puntos 4 y 5: acciones de Administrador (activos, dar de baja,
            // corregir estado) y eliminar: detrás del botón "Administrar".
            adminPanel={esAdmin ? (
              <>
                <ShippingV2ActivoAcciones
                  itemId={item.id}
                  sku={item.sku}
                  esActivo={item.usoLocal === true}
                  cantidad={item.cantidad ?? 0}
                  estado={item.estado ?? ""}
                  estadoRevision={item.estadoRevision ?? ""}
                  unidadesDadasDeBaja={item.unidadesDadasDeBaja ?? 0}
                />
                <EliminarItemAdmin itemId={item.id} />
              </>
            ) : undefined}
            // Punto 9c · fase 1: un artículo que viaja solo tiene sus costos de
            // traerlo en la pestaña Logística (si va en una caja, están en la caja).
            costosTraerlo={permissions?.canViewCosts && !item.packingId && vieneDeAfuera(item.origenArticulo) ? <CostosTraerlo itemId={item.id} /> : undefined}
          />
        </div>
      )}
    </div>
    </StaffAppShell>
  );
}
