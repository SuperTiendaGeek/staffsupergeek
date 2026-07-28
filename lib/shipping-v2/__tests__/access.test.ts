/**
 * Control de acceso de Shipping V2.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/shipping-v2/__tests__/access.test.ts
 *
 * Dos cosas que este archivo protege:
 *
 * 1. NEGAR POR OMISIÓN. `canShippingV2()` devolvía `true` cuando no le pasaban
 *    contexto: con 25 rutas de API y un portal para proveedores externos,
 *    bastaba con que una ruta nueva olvidara pasarlo para quedar abierta sin
 *    que nada avisara. Ahora sin contexto no hay permiso.
 *
 * 2. PERMISOS POR PROVEEDOR. Antes todos los proveedores recibían el mismo
 *    paquete fijo escrito en el código (solo "responder novedades" era
 *    configurable). Ahora sale de "Permisos portal proveedor" en Airtable, y un
 *    proveedor sin nada marcado no puede hacer nada.
 */

import type { ShippingV2AccessContext, ShippingV2Proveedor } from "@/types/shipping-v2";
import {
  ETIQUETAS_PERMISO_PROVEEDOR,
  PERMISOS_PORTAL_PROVEEDOR,
  assertShippingV2Permission,
  canShippingV2,
  isShippingV2ProviderAccess,
  noShippingV2Access,
  providerShippingV2Access,
  providerShippingV2Permissions,
  puedeAlcanzarProveedor,
  staffShippingV2Access,
  systemShippingV2Access,
} from "../access";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ── 1. Negar por omisión ────────────────────────────────────────────────────

{
  const todos = Object.values(PERMISOS_PORTAL_PROVEEDOR);
  const ningunoPasa = todos.every((p) => canShippingV2(undefined, p) === false);
  assert(ningunoPasa, "FIX: sin contexto NINGÚN permiso pasa (antes pasaban todos)");

  assert(canShippingV2(undefined, "canViewCosts") === false, "Sin contexto no se ven los costos internos");
  assert(canShippingV2(undefined, "canManagePayments") === false, "Sin contexto no se gestionan pagos");
  assert(canShippingV2(undefined, "canUseRecepcion") === false, "Sin contexto no se usa Recepción");

  let lanzo = false;
  try {
    assertShippingV2Permission(undefined, "canEditItems", "sin permiso");
  } catch {
    lanzo = true;
  }
  assert(lanzo, "assertShippingV2Permission lanza cuando no hay contexto");
}

{
  assert(puedeAlcanzarProveedor(undefined, "recPROV1") === false, "FIX: sin contexto no se alcanza ningún registro");
  assert(puedeAlcanzarProveedor(noShippingV2Access(), "recPROV1") === false, "Sin acceso no se alcanza nada");
}

// ── 2. Staff y sistema sí pueden ────────────────────────────────────────────

{
  const staff = staffShippingV2Access();
  assert(canShippingV2(staff, "canManagePayments"), "Staff gestiona pagos");
  assert(canShippingV2(staff, "canViewCosts"), "Staff ve los costos internos");
  assert(puedeAlcanzarProveedor(staff, "recCUALQUIERA"), "Staff alcanza registros de cualquier proveedor");
  assert(puedeAlcanzarProveedor(staff), "Staff alcanza registros sin proveedor asignado");

  const sistema = systemShippingV2Access();
  assert(canShippingV2(sistema, "canViewItems"), "El contexto de sistema puede leer");
  assert(puedeAlcanzarProveedor(sistema, "recCUALQUIERA"), "El contexto de sistema alcanza todo");
  assert(isShippingV2ProviderAccess(sistema) === false, "El contexto de sistema NO es un proveedor");
}

// ── 3. Permisos del proveedor: salen de Airtable ────────────────────────────

const proveedorBase = {
  id: "recPROV_ROBERTO",
  proveedorId: "PROV-001",
  nombre: "Roberto",
  label: "Roberto",
} as unknown as ShippingV2Proveedor;

function proveedorCon(permisos: string[]): ShippingV2Proveedor {
  return { ...proveedorBase, permisosPortal: permisos } as ShippingV2Proveedor;
}

{
  const sinNada = providerShippingV2Permissions({ permisosPortal: [] });
  const algunoEnTrue = Object.values(sinNada).some((v) => v === true);
  assert(!algunoEnTrue, "FIX: proveedor sin permisos marcados NO puede hacer nada");

  const sinCampo = providerShippingV2Permissions(undefined);
  assert(!Object.values(sinCampo).some((v) => v === true), "Proveedor sin el campo tampoco puede nada");
}

{
  const soloMira = providerShippingV2Permissions({ permisosPortal: ["Ver artículos", "Ver packings"] });
  assert(soloMira.canViewItems === true, "Marcar 'Ver artículos' concede ver artículos");
  assert(soloMira.canViewPackings === true, "Marcar 'Ver packings' concede ver packings");
  assert(soloMira.canClosePacking === false, "Lo NO marcado sigue negado (cerrar packing)");
  assert(soloMira.canEditProviderItemFields === false, "Lo NO marcado sigue negado (editar)");
  assert(soloMira.canViewProviderCost === false, "Lo NO marcado sigue negado (ver su costo)");
}

{
  // Etiqueta escrita sin tilde o con otra caja: debe reconocerse igual.
  const conVariantes = providerShippingV2Permissions({
    permisosPortal: ["ver articulos", "VER PACKINGS", "  Cerrar packing  "],
  });
  assert(conVariantes.canViewItems === true, "Tolera la etiqueta sin tilde");
  assert(conVariantes.canViewPackings === true, "Tolera mayúsculas");
  assert(conVariantes.canClosePacking === true, "Tolera espacios sobrantes");
}

{
  const conBasura = providerShippingV2Permissions({ permisosPortal: ["Ver artículos", "Hackear el sistema"] });
  assert(conBasura.canViewItems === true, "Una etiqueta desconocida no anula las válidas");
  assert(
    Object.entries(conBasura).filter(([, v]) => v === true).length === 1,
    "Una etiqueta desconocida no concede nada"
  );
}

// ── 4. Lo que un proveedor NUNCA puede tener por configuración ──────────────

{
  const todoMarcado = providerShippingV2Permissions({ permisosPortal: [...ETIQUETAS_PERMISO_PROVEEDOR] });
  const prohibidos = [
    "canEditItems",
    "canCreatePacking",
    "canEditPacking",
    "canRemoveItemsFromPacking",
    "canTransitionPackingStatus",
    "canGenerateInvoice",
    "canManagePayments",
    "canCreateNovedades",
    "canLinkDestinatario",
    "canUseRecepcion",
    "canViewCosts",
  ] as const;
  for (const permiso of prohibidos) {
    assert(
      todoMarcado[permiso] === false,
      `Ni marcando TODO, un proveedor obtiene "${permiso}" (es de staff)`
    );
  }
}

// ── 5. Aislamiento entre proveedores ────────────────────────────────────────

{
  const roberto = providerShippingV2Access(proveedorCon(["Ver artículos"]));
  assert(isShippingV2ProviderAccess(roberto), "El contexto de Roberto es de proveedor");
  assert(roberto.isAdmin === false, "Un proveedor nunca es admin");
  assert(puedeAlcanzarProveedor(roberto, "recPROV_ROBERTO"), "Roberto alcanza lo suyo");
  assert(
    puedeAlcanzarProveedor(roberto, "recPROV_OTRO") === false,
    "FIX: Roberto NO alcanza lo de otro proveedor"
  );
  assert(
    puedeAlcanzarProveedor(roberto, "recPROV_OTRO", "recPROV_ROBERTO"),
    "Alcanza si es proveedor de compra O logístico"
  );
  assert(puedeAlcanzarProveedor(roberto) === false, "No alcanza registros sin proveedor asignado");
  assert(puedeAlcanzarProveedor(roberto, null, undefined, "") === false, "Ids vacíos no conceden alcance");
}

{
  // Un proveedor sin id resuelto no puede alcanzar nada, aunque tenga permisos.
  const sinId = { ...providerShippingV2Access(proveedorCon(["Ver artículos"])), providerId: undefined } as ShippingV2AccessContext;
  assert(puedeAlcanzarProveedor(sinId, "recPROV_ROBERTO") === false, "Proveedor sin id no alcanza nada");
}

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ access.test.ts — todos los asserts pasaron");
