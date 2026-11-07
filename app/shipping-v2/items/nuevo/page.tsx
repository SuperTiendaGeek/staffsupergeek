import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffBadge, StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import { Button } from "@/components/ui/button";
import { getShippingV2AccessContextForSession, getShippingV2OrdenCompraById, getShippingV2Packings, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import type { ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2NewItemForm, type ShippingV2CajaAbierta, type ShippingV2OrdenParaAgregar, type ShippingV2SolicitudParaComprar } from "./ShippingV2NewItemForm";
import { solicitudesParaComprar } from "@/lib/compras/servidor";
import { puedeComprar } from "@/lib/compras/reglas";
import { perfilShippingV2 } from "@/lib/shipping-v2/access";
import { canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";
import { tiposDeProveedor } from "@/lib/shipping-v2/provider-types";
import { esCategoriaLicencia } from "@/lib/productos-digitales/compra";
import { RegistrarLicenciasForm, type CatalogoParaCompra, type SolicitudDeLicencia } from "./RegistrarLicenciasForm";

export const dynamic = "force-dynamic";

export default async function ShippingV2NewItemPage({ searchParams }: { searchParams?: Promise<{ activo?: string | string[]; orden?: string | string[]; solicitudes?: string | string[]; tipo?: string | string[]; volver?: string | string[] }> }) {
  const params = searchParams ? await searchParams : {};
  // Punto 5B-2: "Registrar compra" en modo Producto digital (?tipo=digital).
  const tipoParam = Array.isArray(params.tipo) ? params.tipo[0] : params.tipo;
  const volverParam = (Array.isArray(params.volver) ? params.volver[0] : params.volver) || "";
  const volver = /^\/tecnicos\/ordenes\/rec[A-Za-z0-9]{14}$/.test(volverParam) ? volverParam : null;
  const activoParam = Array.isArray(params.activo) ? params.activo[0] : params.activo;
  const esActivo = activoParam === "1";
  // Punto 9d: "+ Agregar artículo" desde una orden de compra.
  const ordenParam = (Array.isArray(params.orden) ? params.orden[0] : params.orden) || "";
  let ordenExistente: ShippingV2OrdenParaAgregar | null = null;
  let proveedores: ShippingV2Proveedor[] = [];
  let cajasAbiertas: ShippingV2CajaAbierta[] = [];
  // Fase 2: "Comprar" desde la bandeja "Por comprar" (?solicitudes=rec1,rec2).
  const solicitudesParam = (Array.isArray(params.solicitudes) ? params.solicitudes[0] : params.solicitudes) || "";
  let solicitudes: ShippingV2SolicitudParaComprar[] = [];
  // Punto 3: lo abierto por comprar, para sugerir "¿Es para OR000507?" al registrar para stock.
  let abiertas: ShippingV2SolicitudParaComprar[] = [];
  let error = "";
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "items");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canEditItems) {
    redirect("/shipping-v2/packings");
  }

  if (tipoParam === "digital") {
    return <PaginaLicencias access={access} solicitudesParam={solicitudesParam} volver={volver} />;
  }

  try {
    const [listaProveedores, packings, orden] = await Promise.all([
      getShippingV2Proveedores(),
      getShippingV2Packings(access),
      ordenParam ? getShippingV2OrdenCompraById(ordenParam, access) : Promise.resolve(null),
    ]);
    proveedores = listaProveedores;
    const idsSolicitudes = solicitudesParam.split(",").map((x) => x.trim()).filter((x) => /^rec[A-Za-z0-9]{14}$/.test(x));
    const comprador = puedeComprar(perfilShippingV2(access));
    if (comprador && !esActivo && !idsSolicitudes.length) {
      const { solicitudesEnEstados } = await import("@/lib/compras/airtable");
      const ids = (await solicitudesEnEstados(["Por comprar"]).catch(() => [])).map((s) => s.id);
      abiertas = ids.length ? (await solicitudesParaComprar(ids)).filter((s) => !esCategoriaLicencia(s.categoria)).map((s) => ({
        id: s.id, codigo: s.codigo, descripcion: s.descripcion, cantidad: s.cantidad, categoria: s.categoria,
        costoCotizado: s.costoCotizado, precioCliente: s.precioCliente, proveedorId: s.proveedorId, para: s.para,
      })) : [];
    }
    if (idsSolicitudes.length && comprador) {
      // Las licencias se compran en modo Producto digital (nunca como artículo).
      solicitudes = (await solicitudesParaComprar(idsSolicitudes)).filter((s) => !esCategoriaLicencia(s.categoria)).map((s) => ({
        id: s.id,
        codigo: s.codigo,
        descripcion: s.descripcion,
        cantidad: s.cantidad,
        categoria: s.categoria,
        costoCotizado: s.costoCotizado,
        precioCliente: s.precioCliente,
        proveedorId: s.proveedorId,
        para: s.para,
      }));
    }
    if (orden && !orden.anulada && orden.proveedorId) {
      ordenExistente = {
        id: orden.id,
        ocId: orden.ocId,
        proveedorId: orden.proveedorId,
        proveedorNombre: orden.proveedorNombre || orden.proveedorId,
        numeroProveedor: orden.numeroProveedor,
        fechaCompra: orden.fechaCompra,
        falta: orden.resumen.falta,
      };
    }
    // Cajas donde todavía se pueden meter artículos ("En Proceso").
    cajasAbiertas = packings
      .filter((p) => (p.estado || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "en proceso")
      .map((p) => ({
        id: p.id,
        codigo: p.packingId || p.id,
        nombre: p.nombre || "",
        proveedorResponsableId: p.proveedorResponsableId,
        proveedorLogisticoEcId: p.proveedorLogisticoEcId,
      }));
  } catch (loadError) {
    console.error("Error al cargar proveedores de Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar proveedores.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
      <ShippingV2Pestanas />
      <div className="w-full max-w-none space-y-3">
        <StaffPageHeader
          eyebrow={<StaffBadge tone="lime">SHIPPING V2</StaffBadge>}
          title={esActivo ? "Registrar activo de la tienda" : ordenExistente ? `Agregar artículos a ${ordenExistente.ocId}` : "Registrar compra"}
          density="compact"
          actions={
            <div className="flex items-center gap-2">
              {!esActivo && !ordenExistente && puedeComprar(perfilShippingV2(access)) ? (
                <Link href="/shipping-v2/items/nuevo?tipo=digital" className="text-sm text-[#8F908A] hover:text-[#D7FF4F]" title="Licencias: sin logística, con sus credenciales">Producto digital</Link>
              ) : null}
              <Button asChild className="h-9 rounded-lg bg-[#D7FF4F] px-4 text-sm font-black text-[#151515] hover:bg-[#D7FF4F]/90">
                <Link href={ordenExistente ? `/shipping-v2/pagos/ordenes/${ordenExistente.id}` : esActivo ? "/shipping-v2/activos" : "/shipping-v2/items"}>{ordenExistente ? `Volver a ${ordenExistente.ocId}` : esActivo ? "Volver a Activos" : "Volver a Items"}</Link>
              </Button>
            </div>
          }
        />
        {error ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-4 text-orange-100">
            <p className="text-sm font-semibold uppercase tracking-normal">Airtable V2 no disponible</p>
            <p className="mt-2 text-sm leading-6 text-orange-100/85">{error}</p>
          </section>
        ) : null}
        <ShippingV2NewItemForm proveedores={proveedores} cajasAbiertas={cajasAbiertas} esActivoInicial={esActivo} puedeRegistrarRespaldo={access.permissions.canManagePayments === true} ordenExistente={ordenExistente} solicitudes={solicitudes} abiertas={abiertas} />
      </div>
    </div>
    </StaffAppShell>
  );
}


// ─── Punto 5B-2: modo Producto digital ───────────────────────────────────────

type Acceso = Awaited<ReturnType<typeof getShippingV2AccessContextForSession>>;

async function PaginaLicencias({ access, solicitudesParam, volver }: { access: Acceso; solicitudesParam: string; volver: string | null }) {
  const comprador = puedeComprar(perfilShippingV2(access));
  let error = "";
  let catalogo: CatalogoParaCompra[] = [];
  let proveedores: Array<{ id: string; nombre: string }> = [];
  let solicitudes: SolicitudDeLicencia[] = [];
  if (comprador) {
    try {
      const { fetchCatalogoProductosDigitales } = await import("@/lib/tecnicos/airtable");
      const { listarLineas } = await import("@/lib/tecnicos/presupuesto/airtable");
      const [cat, lista] = await Promise.all([fetchCatalogoProductosDigitales({ activoOnly: false }), getShippingV2Proveedores()]);
      catalogo = cat.map((c) => ({ id: c.id, nombre: c.productoBase, marca: c.marca ?? "", tipo: c.tipo ?? "", precio: c.precioVentaCatalogo, activo: c.activo }));
      proveedores = lista
        .filter((p) => canBePurchaseProvider(p) && tiposDeProveedor(p).includes("software"))
        .map((p) => ({ id: p.id, nombre: p.nombre || p.id }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      const ids = solicitudesParam.split(",").map((x) => x.trim()).filter((x) => /^rec[A-Za-z0-9]{14}$/.test(x));
      const lic = ids.length ? (await solicitudesParaComprar(ids)).filter((s) => esCategoriaLicencia(s.categoria)) : [];
      const lineasPorOrden = new Map<string, Awaited<ReturnType<typeof listarLineas>>>();
      for (const ordenId of [...new Set(lic.map((s) => s.ordenId).filter((x): x is string => !!x))]) {
        lineasPorOrden.set(ordenId, await listarLineas(ordenId));
      }
      solicitudes = lic.map((s) => ({
        id: s.id, codigo: s.codigo, para: s.para, descripcion: s.descripcion,
        catalogoId: (s.ordenId && s.lineaId ? lineasPorOrden.get(s.ordenId)?.find((l) => l.id === s.lineaId)?.productoCatalogoId : null) ?? null,
        precioCliente: s.precioCliente, costoCotizado: s.costoCotizado, proveedorId: s.proveedorId,
      }));
    } catch (e) {
      console.error("Registrar compra (licencias):", e);
      error = e instanceof Error ? e.message : "No se pudo cargar el catálogo.";
    }
  }
  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
        <ShippingV2Pestanas />
        <StaffPageHeader
          eyebrow={<StaffBadge tone="lime">SHIPPING V2</StaffBadge>}
          title="Registrar compra · Producto digital"
          density="compact"
          actions={
            <div className="flex items-center gap-2">
              <Link href="/shipping-v2/items/nuevo" className="text-sm text-[#8F908A] hover:text-[#F5F5F5]">Artículos</Link>
              <Button asChild className="h-9 rounded-lg bg-[#D7FF4F] px-4 text-sm font-black text-[#151515] hover:bg-[#D7FF4F]/90">
                <Link href={volver ?? "/shipping-v2/compras"}>{volver ? "Volver a la orden" : "Volver a Por comprar"}</Link>
              </Button>
            </div>
          }
        />
        {!comprador ? (
          <p className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-4 text-sm text-orange-100">Las licencias las compran Staff o un Administrador.</p>
        ) : error ? (
          <p className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-4 text-sm text-orange-100">{error}</p>
        ) : (
          <RegistrarLicenciasForm catalogo={catalogo} proveedores={proveedores} solicitudes={solicitudes} puedeRegistrarPago={access.permissions.canManagePayments === true} volver={volver} />
        )}
      </div>
    </StaffAppShell>
  );
}
