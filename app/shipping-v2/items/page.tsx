import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2ItemsPage, getShippingV2Proveedores, type ShippingV2ItemsListSortKey } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import { camposConEstado, ocultarCamposDeObjeto } from "@/lib/permissions/campos";
import { isAdministratorRole } from "@/lib/apps";
import type { ShippingV2AccessPermissions, ShippingV2Item, ShippingV2Proveedor } from "@/types/shipping-v2";
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
  searchParams?: Promise<{
    cursor?: string | string[];
    prev?: string | string[];
    sort?: string | string[];
  }>;
};

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanCursor(value?: string | string[]) {
  const cursor = firstSearchParam(value)?.trim();
  if (!cursor || cursor.length > 500) return undefined;
  return cursor;
}

function parseSortKey(value?: string | string[]): ShippingV2ItemsListSortKey {
  const sort = firstSearchParam(value)?.trim();
  return SHIPPING_V2_ITEMS_SORT_KEYS.includes(sort as ShippingV2ItemsListSortKey)
    ? sort as ShippingV2ItemsListSortKey
    : "newest";
}

function parseCursorStack(value?: string | string[]) {
  const encoded = firstSearchParam(value)?.trim();
  if (!encoded) return [] as string[];
  if (encoded.length > 4096) return [] as string[];

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((cursor): cursor is string => typeof cursor === "string" && cursor.length <= 500).slice(-25);
  } catch {
    return [];
  }
}

function encodeCursorStack(stack: string[]) {
  return Buffer.from(JSON.stringify(stack.slice(-25)), "utf8").toString("base64url");
}

function buildItemsPageHref(input: {
  cursor?: string;
  stack?: string[];
  sortBy: ShippingV2ItemsListSortKey;
}) {
  const params = new URLSearchParams();
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.stack?.length) params.set("prev", encodeCursorStack(input.stack));
  if (input.sortBy !== "newest") params.set("sort", input.sortBy);
  const query = params.toString();
  return `/shipping-v2/items${query ? `?${query}` : ""}`;
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
  let nextOffset: string | undefined;
  const params = await searchParams;
  const currentCursor = cleanCursor(params?.cursor);
  const cursorStack = parseCursorStack(params?.prev);
  let sortBy = parseSortKey(params?.sort);

  try {
    const session = await getSessionFromCookie();
    const access = await getShippingV2AccessContextForSession(session);
    permissions = access.permissions;
    providerName = access.providerName || access.providerCode || "";
    if (
      (!access.permissions.canViewProviderCost && sortBy === "costo-desc") ||
      (!access.permissions.canViewCosts && sortBy === "precio-desc")
    ) {
      sortBy = "newest";
    }
    const [itemsPage, proveedoresResult] = await Promise.all([
      getShippingV2ItemsPage({
        pageSize: SHIPPING_V2_ITEMS_PAGE_SIZE,
        offset: currentCursor,
        sortBy,
        access,
      }),
      getShippingV2Proveedores(),
    ]);
    items = itemsPage.items.map((item) => ocultarCamposDeObjeto(item, camposOcultos));
    nextOffset = itemsPage.nextOffset;
    proveedores = access.providerId ? proveedoresResult.filter((provider) => provider.id === access.providerId) : proveedoresResult;
  } catch (loadError) {
    console.error("Error al cargar items de Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los items.";
  }

  const previousCursor = cursorStack.at(-1);
  const previousStack = cursorStack.slice(0, -1);
  const nextStack = [...cursorStack, currentCursor ?? ""];
  const pageIndex = cursorStack.length + 1;
  const firstHref = buildItemsPageHref({ sortBy });
  const previousHref = previousCursor !== undefined
    ? buildItemsPageHref({ cursor: previousCursor || undefined, stack: previousStack, sortBy })
    : undefined;
  const nextHref = nextOffset
    ? buildItemsPageHref({ cursor: nextOffset, stack: nextStack, sortBy })
    : undefined;

  return (
    <StaffAppShell activeHref="/shipping-v2/items" sectionLabel="Shipping V2">
      <ShippingV2ItemsClient
        items={items}
        proveedores={proveedores}
        error={error}
        permissions={permissions}
        providerName={providerName}
        camposOcultos={camposOcultos}
        initialSortBy={sortBy}
        pagination={{
          pageIndex,
          pageSize: SHIPPING_V2_ITEMS_PAGE_SIZE,
          firstHref,
          previousHref,
          nextHref,
          hasPreviousPage: Boolean(previousHref),
          hasNextPage: Boolean(nextHref),
        }}
      />
    </StaffAppShell>
  );
}
