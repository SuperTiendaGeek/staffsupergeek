/**
 * Punto 18 (25-oct-2026): ficha del artículo por rol.
 * Ejecutar: npm test ficha-por-rol
 *
 * Protege lo que el dueño pidió:
 * 1. El técnico es un perfil propio: no recibe costos, no usa Recepción,
 *    Logística, Pagos ni Kardex; sí ve el precio (como dato) e inspecciona.
 * 2. Lo que recibe cada perfil sale de LISTAS DE LO PERMITIDO: ni un costo,
 *    ganancia, pago o dato de logística llega al técnico; ni inspección,
 *    precio de venta ni publicaciones al proveedor.
 * 3. El precio de venta de un artículo existente solo lo cambia el Administrador.
 * 4. El despiece llega sin costos a quien no los ve.
 * 5. Publicaciones: canal, quién, cuándo, estado e historial sin inventar nada.
 */

import type { ShippingV2Item, ShippingV2Novedad, ShippingV2Pago, ShippingV2Proveedor } from "@/types/shipping-v2";
import {
  STAFF_SHIPPING_V2_PERMISSIONS,
  TECNICO_SHIPPING_V2_PERMISSIONS,
  canShippingV2,
  esTecnicoShippingV2,
  noShippingV2Access,
  perfilShippingV2,
  providerShippingV2Access,
  puedeAlcanzarProveedor,
  puedeInspeccionarShippingV2,
  staffShippingV2Access,
  tecnicoShippingV2Access,
} from "../access";
import { isTechnicianRole, isAdministratorRole } from "@/lib/apps";
import {
  CAMPOS_ITEM_PROVEEDOR,
  CAMPOS_ITEM_TECNICO,
  novedadParaTecnico,
  pagosVisiblesParaProveedor,
  recortarItemProveedor,
  recortarItemTecnico,
  resumenPublicaciones,
} from "../ficha-articulo";
import { FICHA_ADMIN, FICHA_PROVEEDOR, FICHA_STAFF, FICHA_TECNICO } from "../ficha-secciones";
import { cambioDePrecioBloqueado, esCampoPrecioVenta, MENSAJE_PRECIO_SOLO_ADMIN } from "../precio-candado";
import { despieceSinCostos } from "../despiece";
import { FILTRO_ARTICULOS_VACIO, formulaFiltroArticulos, hrefArticulos, leerFiltroArticulos } from "../items-filtro";
import { PESTANAS_SHIPPING_V2 } from "../pestanas";
import type { Publicacion } from "../publicaciones";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// Un artículo con TODO lleno, para ver qué sobrevive a cada recorte.
const itemCompleto = {
  id: "recITEM0000000001",
  createdTime: "2026-10-01T10:00:00.000Z",
  sku: "LAP-000042",
  codigo: "LAP-000042",
  skuProveedor: "EB-998",
  nombre: "Laptop HP 840 G5",
  descripcion: "i5 8th, 16GB",
  marca: "HP",
  modelo: "840 G5",
  numeroSerie: "5CG8123ABC",
  seguimiento: "Unidad",
  accesoriosIncluidos: "Cargador",
  categoria: "Laptop",
  condicion: "Usado",
  tipoOperacion: "Compra a proveedor",
  tipoItem: "",
  cantidad: 1,
  unidad: "Unidad",
  estado: "Disponible",
  estadoRevision: "Revisado",
  estadoDespiece: "No aplica",
  afectaInventario: true,
  proveedorId: "recPROV0000000001",
  proveedorNombre: "Roberto",
  proveedorLogisticoId: "recLAAR0000000001",
  requierePago: true,
  costoProveedor: 210,
  fletePacking: 40,
  arancelPacking: 12,
  otrosCostosPacking: 3,
  totalCostoProveedorPacking: 900,
  cantidadItemsPacking: 5,
  costoFleteAsignado: 8,
  costoArancelAsignado: 2.4,
  otrosCostosAsignados: 0.6,
  costoAsignadoDespiece: 0,
  costoLogisticoAsignado: 11,
  costoTotalUnidad: 221,
  costoMejoras: 15,
  unidadesDadasDeBaja: 0,
  unidadesEnPacking: 1,
  fleteAsignadoRegistro: 8,
  arancelAsignadoRegistro: 2.4,
  otrosCostosAsignadosRegistro: 0.6,
  costoTotalEstimado: 221,
  precioVentaSugerido: 380,
  precioVenta: 399,
  qty: 1,
  disponibleVenta: true,
  reservado: false,
  cantidadReservada: 0,
  usoLocal: false,
  esRepuesto: false,
  esRegalo: false,
  conNovedad: false,
  recibido: true,
  requiereInspeccion: true,
  revisadoFisicamente: true,
  revisadoPor: "Enrique Martinez",
  fechaRevision: "2026-10-03",
  revisionTecnicaDetalle: "{}",
  puntosRevisionFallidos: 0,
  fotosTomadas: true,
  shopifyPublicado: true,
  shopifyPublicadoPor: "Maritza Moreno",
  fechaShopifyPublicado: "2026-10-10T15:00:00.000Z",
  marketplacePublicado: true,
  marketplacePublicadoPor: "Maritza Moreno",
  fechaMarketplacePublicado: "2026-10-10T15:05:00.000Z",
  mercadoLibrePublicado: false,
  gruposFacebookPublicado: false,
  facebookSuperGeek: true,
  textoFacebook: "Laptop…",
  observacionesInternas: "Margen bajo, no rebajar",
  observacionVenta: "",
  technicalSheet: {} as ShippingV2Item["technicalSheet"],
  pagoV2ItemIds: ["recPAGO0000000001"],
  pagoV2RegaloIds: [],
  ordenCompraId: "recOC00000000001",
  packingId: "recPACK000000001",
  legacyPagoRelacionadoIds: ["recLEG0000000001"],
  itemHijoIds: [],
  esParteRecuperada: false,
  fotos: [{ url: "https://x/foto.jpg" }],
  evidencias: [],
  trackingDirecto: "TRK-LOCAL",
  registradoPor: "Joseph Bolaños",
} as unknown as ShippingV2Item;

const SENSIBLES_TECNICO = [
  "costoProveedor", "fletePacking", "arancelPacking", "otrosCostosPacking", "totalCostoProveedorPacking",
  "costoFleteAsignado", "costoArancelAsignado", "otrosCostosAsignados", "costoAsignadoDespiece",
  "costoLogisticoAsignado", "costoTotalUnidad", "costoMejoras", "fleteAsignadoRegistro", "arancelAsignadoRegistro",
  "otrosCostosAsignadosRegistro", "costoTotalEstimado", "precioVentaSugerido", "proveedorId", "proveedorNombre",
  "proveedorLogisticoId", "requierePago", "pagoV2ItemIds", "ordenCompraId", "packingId", "legacyPagoRelacionadoIds",
  "trackingDirecto", "shopifyPublicado", "marketplacePublicadoPor", "facebookSuperGeek", "textoFacebook",
  "observacionesInternas", "situacionPago",
];

// ── 1. Perfiles ─────────────────────────────────────────────────────────────

{
  assert(isTechnicianRole("Técnico") && isTechnicianRole("tecnico") && isTechnicianRole("Technical"), "El rol Técnico se reconoce con o sin tilde");
  assert(!isTechnicianRole("Staff") && !isTechnicianRole("Administrador") && !isTechnicianRole(undefined), "Staff y Administrador no son técnicos");
  assert(isAdministratorRole("Administrador") && !isAdministratorRole("Técnico"), "Técnico nunca es Administrador");

  const tecnico = tecnicoShippingV2Access();
  const proveedor = providerShippingV2Access({ id: "recPROV0000000001", permisosPortal: ["Ver artículos", "Ver pagos"] } as ShippingV2Proveedor);
  assert(perfilShippingV2(tecnico) === "tecnico", "perfil: técnico");
  assert(perfilShippingV2({ ...staffShippingV2Access(), isSiteAdmin: true }) === "admin", "perfil: Administrador (solo isSiteAdmin)");
  assert(perfilShippingV2(staffShippingV2Access()) === "staff", "perfil: staff");
  assert(perfilShippingV2(proveedor) === "proveedor", "perfil: proveedor");
  assert(perfilShippingV2(noShippingV2Access()) === "ninguno" && perfilShippingV2(undefined) === "ninguno", "perfil: sin acceso = ninguno");
  assert(esTecnicoShippingV2(tecnico) && !esTecnicoShippingV2(staffShippingV2Access()), "esTecnicoShippingV2");

  // El técnico: solo su trabajo.
  for (const permiso of ["canViewCosts", "canViewProviderCost", "canEditItems", "canUseRecepcion", "canViewPackings", "canViewPayments", "canManagePayments", "canViewInvoice", "canGenerateInvoice", "canCreatePacking", "canLinkDestinatario"] as const) {
    assert(!canShippingV2(tecnico, permiso), `FIX: el técnico NO tiene ${permiso}`);
  }
  for (const permiso of ["canViewItems", "canViewSalePrice", "canTrabajoTecnico", "canViewNovedades", "canCreateNovedades"] as const) {
    assert(canShippingV2(tecnico, permiso), `El técnico sí tiene ${permiso}`);
  }
  assert(puedeInspeccionarShippingV2(tecnico), "El técnico inspecciona sin usar Recepción");
  assert(puedeInspeccionarShippingV2(staffShippingV2Access()), "El personal de Recepción sigue inspeccionando");
  assert(!puedeInspeccionarShippingV2(proveedor), "Un proveedor nunca inspecciona");
  assert(puedeAlcanzarProveedor(tecnico, "recCUALQUIERA"), "El técnico es personal interno: ve artículos de cualquier proveedor");

  // Lo de siempre del staff no cambió.
  assert(STAFF_SHIPPING_V2_PERMISSIONS.canViewCosts && STAFF_SHIPPING_V2_PERMISSIONS.canManagePayments && STAFF_SHIPPING_V2_PERMISSIONS.canUseRecepcion, "Staff conserva costos, pagos y Recepción");
  assert(STAFF_SHIPPING_V2_PERMISSIONS.canTrabajoTecnico && STAFF_SHIPPING_V2_PERMISSIONS.canViewSalePrice, "Staff también hace trabajo técnico y ve el precio");
  assert(!canShippingV2(proveedor, "canViewSalePrice") && !canShippingV2(proveedor, "canTrabajoTecnico"), "Un proveedor no ve el precio de venta ni hace trabajo técnico (no se configura)");
  assert(TECNICO_SHIPPING_V2_PERMISSIONS !== STAFF_SHIPPING_V2_PERMISSIONS, "El técnico tiene su propio juego de permisos");

  // Pestañas que el técnico no ve.
  const ocultas = PESTANAS_SHIPPING_V2.filter((p) => p.noTecnico).map((p) => p.key).sort();
  assert(JSON.stringify(ocultas) === JSON.stringify(["activos", "anuncios", "control", "kardex"]), "Activos, Anuncios, Control y Kardex se ocultan al técnico");
  const visibles = PESTANAS_SHIPPING_V2.filter((p) => !p.noTecnico && tecnico.permissions[p.permiso]).map((p) => p.key);
  assert(JSON.stringify(visibles) === JSON.stringify(["items", "novedades"]), `El técnico ve solo Artículos y Novedades (ve: ${visibles.join(", ")})`);
}

// ── 2. Lo que recibe el técnico ─────────────────────────────────────────────

{
  const t = recortarItemTecnico(itemCompleto) as Record<string, unknown>;
  const sobrantes = Object.keys(t).filter((k) => !(CAMPOS_ITEM_TECNICO as readonly string[]).includes(k));
  assert(sobrantes.length === 0, `Técnico: solo campos de su lista (sobran: ${sobrantes.join(", ") || "ninguno"})`);
  const fugas = SENSIBLES_TECNICO.filter((k) => k in t);
  assert(fugas.length === 0, `FIX: ningún costo, pago, logística ni publicación llega al técnico (llegan: ${fugas.join(", ") || "ninguno"})`);
  assert(t.precioVenta === 399, "El técnico ve el precio de venta (como dato)");
  assert(t.sku === "LAP-000042" && t.numeroSerie === "5CG8123ABC" && t.skuProveedor === "EB-998", "Identifica por SKU, serie y SKU del proveedor");
  assert(t.revisadoPor === "Enrique Martinez" && t.requiereInspeccion === true, "Ve su inspección");

  const novedad = { id: "recNOV", montoReclamado: 50, montoRecuperado: 20, precioConDescuento: 300, valorPerdida: 210, descripcion: "Pantalla rayada" } as unknown as ShippingV2Novedad;
  const n = novedadParaTecnico(novedad);
  assert(n.montoReclamado === null && n.montoRecuperado === null && n.precioConDescuento === null && n.valorPerdida === null, "Novedades del técnico sin montos");
  assert(n.descripcion === "Pantalla rayada", "La novedad conserva lo que el técnico necesita");
}

// ── 3. Lo que recibe el proveedor ───────────────────────────────────────────

{
  const p = recortarItemProveedor(itemCompleto, { verCosto: false, verObservaciones: false }) as Record<string, unknown>;
  const permitidos = [...CAMPOS_ITEM_PROVEEDOR, "situacion"] as readonly string[];
  const sobrantes = Object.keys(p).filter((k) => !permitidos.includes(k));
  assert(sobrantes.length === 0, `Proveedor: solo campos de su lista (sobran: ${sobrantes.join(", ") || "ninguno"})`);
  for (const k of ["precioVenta", "precioVentaSugerido", "costoTotalUnidad", "costoLogisticoAsignado", "revisadoPor", "revisionTecnicaDetalle", "puntosRevisionFallidos", "shopifyPublicadoPor", "facebookSuperGeek", "estado", "estadoRevision", "proveedorLogisticoId", "costoProveedor", "observacionesInternas"]) {
    assert(!(k in p), `FIX: al proveedor no le llega "${k}"`);
  }
  assert(p.situacion === "Recibido en SUPER GEEK", "El proveedor ve una situación sencilla, no los estados internos");
  const conCosto = recortarItemProveedor(itemCompleto, { verCosto: true, verObservaciones: true }) as Record<string, unknown>;
  assert(conCosto.costoProveedor === 210 && conCosto.observacionesInternas === "Margen bajo, no rebajar", "Con sus permisos ve SU costo y las observaciones que comparte");
  assert(!("costoTotalUnidad" in conCosto) && !("precioVenta" in conCosto), "Aun con permisos, nunca el costo total ni el precio de venta");
  assert(recortarItemProveedor({ ...itemCompleto, recibido: false }, { verCosto: false, verObservaciones: false }).situacion === "En camino", "En camino si aún no llega");

  const pago = (extra: Partial<ShippingV2Pago>) => ({ id: "recP", proveedorId: "recPROV0000000001", concepto: "Compra", estadoPago: "Pagado", estado: "Pagado", ...extra }) as ShippingV2Pago;
  const visibles = pagosVisiblesParaProveedor([
    pago({ id: "recA" }),
    pago({ id: "recB", proveedorId: "recOTRO0000000001" }),
    pago({ id: "recC", concepto: "Flete" }),
    pago({ id: "recD", estadoPago: "Anulado", estado: "Anulado" }),
    pago({ id: "recE", concepto: undefined }),
  ], "recPROV0000000001").map((x) => x.id);
  assert(JSON.stringify(visibles) === JSON.stringify(["recA", "recE"]), `FIX: el proveedor ve solo SUS pagos de compra vivos (ve: ${visibles.join(", ")})`);
}

// ── 4. Configuración de vistas (no da permisos) ─────────────────────────────

{
  assert(FICHA_ADMIN.precioEditable && FICHA_ADMIN.administrar, "Administrador: precio editable y Administrar");
  assert(!FICHA_STAFF.precioEditable && !FICHA_STAFF.administrar, "STAFF: precio solo lectura y sin Administrar");
  assert(FICHA_STAFF.bloques.includes("publicaciones") && FICHA_ADMIN.bloques.includes("publicaciones"), "Publicaciones para Administrador y STAFF");
  const tecnico = [...FICHA_TECNICO.bloques, ...FICHA_TECNICO.pestanas].join(",");
  assert(!/costo|pago|logistica|packing|publicacion|kardex/i.test(tecnico), "La vista del técnico no tiene secciones comerciales ni financieras");
  assert(FICHA_TECNICO.pestanas.includes("mejoras") && FICHA_TECNICO.pestanas.includes("despiece") && FICHA_TECNICO.bloques.includes("inspeccion") && FICHA_TECNICO.bloques.includes("novedades"), "La vista del técnico: inspección, mejoras, despiece y novedades");
  assert(!/inspeccion|mejora|despiece|kardex|publicacion|novedad/i.test(FICHA_PROVEEDOR.bloques.join(",")), "La vista del proveedor no tiene procesos internos");
}

// ── 5. Precio de venta: solo el Administrador ───────────────────────────────

{
  assert(esCampoPrecioVenta("Precio venta final") && esCampoPrecioVenta("precioVenta") && esCampoPrecioVenta("precioVentaSugerido"), "Reconoce los campos de precio");
  assert(!esCampoPrecioVenta("Nombre del item") && !esCampoPrecioVenta("costoProveedor"), "Otros campos no son precio");
  const antes = { precioVenta: 399, precioVentaSugerido: 380 };
  assert(cambioDePrecioBloqueado({ esAdmin: false, antes, despues: { precioVenta: 350, precioVentaSugerido: 380 } }) === MENSAJE_PRECIO_SOLO_ADMIN, "FIX: STAFF no puede bajar el precio");
  assert(cambioDePrecioBloqueado({ esAdmin: false, antes, despues: { precioVenta: 399, precioVentaSugerido: 400 } }) === MENSAJE_PRECIO_SOLO_ADMIN, "FIX: STAFF tampoco cambia el sugerido");
  assert(cambioDePrecioBloqueado({ esAdmin: false, antes, despues: { precioVenta: 399.0, precioVentaSugerido: 380 } }) === null, "Guardar sin tocar el precio sí se puede");
  assert(cambioDePrecioBloqueado({ esAdmin: false, antes, despues: { precioVenta: undefined } as { precioVenta?: unknown } }) === MENSAJE_PRECIO_SOLO_ADMIN, "Borrar el precio también es cambiarlo");
  assert(cambioDePrecioBloqueado({ esAdmin: false, antes, despues: {} }) === null, "Si no viene el precio, no se considera cambio");
  assert(cambioDePrecioBloqueado({ esAdmin: true, antes, despues: { precioVenta: 1 } }) === null, "El Administrador sí cambia el precio");
}

// ── 6. Despiece sin costos ──────────────────────────────────────────────────

{
  const resumen = { padreId: "recX", costoTotalEquipo: 221, sinRepartir: 10, piezas: [{ id: "a", sku: "RAM-1", costoAsignado: 40 }, { id: "b", sku: "SSD-1", costoAsignado: 60 }] };
  const sin = despieceSinCostos(resumen);
  assert(sin.costoTotalEquipo === null && sin.sinRepartir === null && sin.piezas.every((p) => p.costoAsignado === null), "FIX: el despiece llega sin ningún costo");
  assert(sin.piezas.map((p) => p.sku).join(",") === "RAM-1,SSD-1" && sin.verCostos === false, "Conserva las piezas y avisa que no hay costos");
  assert(!JSON.stringify(sin).includes("221") && !JSON.stringify(sin).includes("\"costoAsignado\":40"), "Ni rastro de los montos en la respuesta");
}

// ── 7. Publicaciones ────────────────────────────────────────────────────────

{
  const pub = (extra: Partial<Publicacion>): Publicacion => ({
    id: "recPUB", sku: "LAP-000042", canal: "Marketplace", alcance: "Producto", titulo: "", presentacion: "", descripcion: "", precio: 399, enlace: "", estado: "Publicado", ...extra,
  });
  const lista = resumenPublicaciones(itemCompleto, [
    pub({ id: "r1", canal: "Mercado Libre", publicadoPor: "Maritza Moreno", fechaPublicado: "2026-10-23T22:24:42.000Z" }),
    pub({ id: "r2", canal: "Marketplace", estado: "Retirado", publicadoPor: "Joseph Bolaños", fechaPublicado: "2026-10-01T10:00:00.000Z", retiradoPor: "Maritza Moreno", fechaRetirado: "2026-10-20T10:00:00.000Z" }),
    pub({ id: "r3", canal: "Grupos Facebook", alcance: "Unidad", unidadId: "recOTRAUNIDAD0001" }),
    pub({ id: "r4", canal: "Grupos Facebook", alcance: "Unidad", unidadId: itemCompleto.id, publicadoPor: "Joseph Bolaños" }),
  ]);
  const ids = lista.map((p) => p.id);
  assert(!ids.includes("r3"), "El anuncio aparte de OTRA unidad no aparece");
  assert(ids.includes("r4") && ids.includes("r2"), "El anuncio aparte de esta unidad y los retirados (historial) sí");
  assert(ids.includes("casilla-Shopify") && !ids.includes("casilla-Marketplace"), "La casilla vieja solo aparece si el canal no tiene anuncio en el gestor");
  const shopify = lista.find((p) => p.id === "casilla-Shopify");
  assert(shopify?.publicadoPor === "Maritza Moreno" && shopify.fechaPublicado === "2026-10-10T15:00:00.000Z" && shopify.origen === "casilla", "Casilla vieja con quién y cuándo");
  assert(lista[lista.length - 1].estado === "Retirado", "Lo vigente primero; los retirados al final");
  const sinNada = resumenPublicaciones({ id: "recSOLO" }, []);
  assert(sinNada.length === 0, "Sin anuncios ni casillas: lista vacía (no se inventa nada)");
}

// ── 8. Lista de trabajo del técnico ("Por inspeccionar") ────────────────────

{
  const filtro = leerFiltroArticulos(new URLSearchParams("inspeccion=pendiente"));
  assert(filtro.inspeccion === "pendiente", "Lee ?inspeccion=pendiente");
  assert(leerFiltroArticulos(new URLSearchParams("inspeccion=otra")).inspeccion === "", "Un valor raro se ignora");
  assert(hrefArticulos(filtro) === "/shipping-v2/items?inspeccion=pendiente", "La dirección conserva el filtro");
  const formula = formulaFiltroArticulos(filtro);
  assert(formula.includes("{Recibido}") && formula.includes("{Requiere inspección}") && formula.includes("NOT({Revisado física/técnicamente})"), "Llegó, pide inspección y no está firmada");
  assert(formulaFiltroArticulos(FILTRO_ARTICULOS_VACIO) === "", "Sin filtro: sin condición");
}

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ ficha-por-rol.test.ts — todos los asserts pasaron");
