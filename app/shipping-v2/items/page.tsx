import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2ItemsPorSkuPage, getShippingV2Proveedores, type ShippingV2ItemsListSortKey } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { camposConEstado, ocultarCamposDeObjeto } from "@/lib/permissions/campos";
import { isAdministratorRole } from "@/lib/apps";
import type { ShippingV2AccessPermissions, ShippingV2Item, ShippingV2Proveedor } from "@/types/shipping-v2";
import { hrefArticulos, leerFiltroArticulos, type FiltroArticulos } from "@/lib/shipping-v2/items-filtro";
import { ShippingV2ItemsClient } from "./ShippingV2ItemsClient";

export const dynamic = "force-dynamic";

const SHIPPING_V2_ITEMS_PAGE_SIZE = 100;
const SHIPPING_V2_ITEMS_SORT_KEYS: ShippingV2ItemsListSortKey[] = [
  "newest",
  "oldest",
  "sku-asc",
  "sku-desc",
  "name-asc",
  "name-desc",
  "estado",
  "proveedor-compra",
  "costo-desc",
  "precio-desc",
];

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePagina(value?: string | string[]) {
  const pagina = Number.parseInt(firstSearchParam(value)?.trim() ?? "", 10);
  return Number.isFinite(pagina) && pagina > 0 && pagina < 100000 ? pagina : 1;
}

function parseSortKey(value?: string | string[]): ShippingV2ItemsListSortKey {
  const sort = firstSearchParam(value)?.trim();
  return SHIPPING_V2_ITEMS_SORT_KEYS.includes(sort as ShippingV2ItemsListSortKey)
    ? sort as ShippingV2ItemsListSortKey
    : "newest";
}

function buildItemsPageHref(input: {
  pagina: number;
  sortBy: ShippingV2ItemsListSortKey;
  filtro: FiltroArticulos;
}) {
  // Rediseño 15-oct-2026: el filtro viaja con la página. Punto 18b: la lista
  // va por SKU y se pagina por número de página (se conoce el total).
  return hrefArticulos(input.filtro, { sort: input.sortBy, pagina: input.pagina });
}

export default async function ShippingV2ItemsPage({ searchParams }: PageProps) {
  // Fuera del try/catch de abajo a propósito: requirePantallaVisible() usa
  // redirect(), que lanza una excepción especial de Next.js — si quedara
  // dentro del try, el catch la atraparía como un error de carga cualquiera
  // y el redirect nunca ocurriría.
  const sessionForGuard = await getSessionFromCookie();
  requirePantallaVisible(sessionForGuard?.user.pantallasRestringidas ?? {}, "shipping-v2", "items");

  // Personalización por usuario (Fase 2 de permisos, ver
  // lib/permissions/campos.ts). Un administrador nunca queda restringido.
  const restringidosDelUsuario = isAdministratorRole(sessionForGuard?.user.rol)
    ? {}
    : (sessionForGuard?.user.camposRestringidos ?? {});
  const camposOcultos = camposConEstado(restringidosDelUsuario, "shipping-v2", "items", "oculto");

  let items: ShippingV2Item[] = [];
  let proveedores: ShippingV2Proveedor[] = [];
  let permissions: ShippingV2AccessPermissions | null = null;
  let providerName = "";
  let error = "";
  const params = await searchParams;
  const filtro = leerFiltroArticulos(params ?? {});
  let pagina = parsePagina(params?.pagina);
  let totalPaginas = 1;
  let totalGrupos = 0;
  let totalRegistros = 0;
  let sortBy = parseSortKey(params?.sort);

  try {
    const session = await getSessionFromCookie();
    const access = await getShippingV2AccessContextForSession(session);
    permissions = access.permissions;
    providerName = access.providerName || access.providerCode || "";
    if (
      (!access.permissions.canViewProviderCost && sortBy === "costo-desc") ||
      (!(access.permissions.canViewCosts || access.permissions.canViewSalePrice) && sortBy === "precio-desc")
    ) {
      sortBy = "newest";
    }
    // Con filtro de proveedor se leen antes los proveedores (hace falta su etiqueta).
    const proveedoresPrevios = filtro.proveedor ? await getShippingV2Proveedores() : undefined;
    const [itemsPage, proveedoresResult] = await Promise.all([
      getShippingV2ItemsPorSkuPage({
        gruposPorPagina: SHIPPING_V2_ITEMS_PAGE_SIZE,
        pagina,
        sortBy,
        access,
        filtro,
        proveedores: proveedoresPrevios,
      }),
      proveedoresPrevios ? Promise.resolve(proveedoresPrevios) : getShippingV2Proveedores(),
    ]);
    items = itemsPage.items.map((item) => ocultarCamposDeObjeto(item, camposOcultos));
    pagina = itemsPage.pagina;
    totalPaginas = itemsPage.totalPaginas;
    totalGrupos = itemsPage.totalGrupos;
    totalRegistros = itemsPage.totalRegistros;
    proveedores = access.providerId ? proveedoresResult.filter((provider) => provider.id === access.providerId) : proveedoresResult;
  } catch (loadError) {
    console.error("Error al cargar items de Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los items.";
  }

  const firstHref = buildItemsPageHref({ pagina: 1, sortBy, filtro });
  const previousHref = pagina > 1 ? buildItemsPageHref({ pagina: pagina - 1, sortBy, filtro }) : undefined;
  const nextHref = pagina < totalPaginas ? buildItemsPageHref({ pagina: pagina + 1, sortBy, filtro }) : undefined;

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
      <ShippingV2Pestanas />
      <ShippingV2ItemsClient
        items={items}
        proveedores={proveedores}
        error={error}
        permissions={permissions}
        providerName={providerName}
        camposOcultos={camposOcultos}
        initialSortBy={sortBy}
        filtro={filtro}
        pagination={{
          pageIndex: pagina,
          pageSize: SHIPPING_V2_ITEMS_PAGE_SIZE,
          totalPages: totalPaginas,
          totalGroups: totalGrupos,
          totalRecords: totalRegistros,
          firstHref,
          previousHref,
          nextHref,
          hasPreviousPage: Boolean(previousHref),
          hasNextPage: Boolean(nextHref),
        }}
      />
    </div>
    </StaffAppShell>
  );
}
