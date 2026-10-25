/**
 * Punto 18 (25-oct-2026): el cargador de la ficha (el mismo de la página y de
 * la ventana) con sesiones reales de cada rol, contra una base de Airtable
 * simulada en memoria. Comprueba lo que de verdad SALE del servidor:
 *
 * - Administrador y Staff: su ficha completa; Staff con "Campos restringidos".
 * - Técnico: ningún costo, pago, caja ni proveedor; sí precio, inspección y novedades.
 * - Proveedor: solo su artículo, su orden, su caja y SUS pagos; nunca precio de
 *   venta, inspección ni pagos de otros. Un artículo ajeno = "no existe".
 * - Sin sesión, sin Shipping o sin la pantalla Artículos: no se lee nada.
 * - Cambio de sesión: lo que vio el Administrador no se le pega al técnico.
 * - El cargador nunca escribe en Airtable.
 *
 * Ejecutar: npm test ficha-cargador-roles
 */

import type { StaffSession } from "@/lib/session";
import { cargarFichaArticulo } from "../ficha-articulo-servidor";
import { SHIPPING_V2_ITEM_FIELDS as F, SHIPPING_V2_PACKING_FIELDS as FP, SHIPPING_V2_PAYMENT_FIELDS as FPAGO, SHIPPING_V2_TABLES as T } from "../schema.generated";
import { CAMPOS_PROVEEDOR } from "../proveedores-admin";
import { ORDEN_COMPRA_FIELDS as OC } from "../ordenes-compra";
import { ETIQUETAS_PERMISO_PROVEEDOR } from "../access";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ── Base simulada ───────────────────────────────────────────────────────────

type Registro = { id: string; createdTime: string; fields: Record<string, unknown> };
const tablas = new Map<string, Map<string, Registro>>();
let escrituras = 0;

function crear(tabla: string, id: string, fields: Record<string, unknown>) {
  if (!tablas.has(tabla)) tablas.set(tabla, new Map());
  tablas.get(tabla)!.set(id, { id, createdTime: "2026-10-01T10:00:00.000Z", fields });
  return id;
}

function respuesta(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

const fetchOriginal = global.fetch;
global.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(entrada instanceof Request ? entrada.url : entrada));
  const metodo = (init?.method ?? "GET").toUpperCase();
  if (metodo !== "GET") {
    escrituras++;
    return respuesta(405, { error: "El cargador no debe escribir" });
  }
  const partes = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  const store = tablas.get(partes[2]);
  if (!store) return respuesta(404, { error: { type: "TABLE_NOT_FOUND" } });
  if (partes[3]) {
    const r = store.get(partes[3]);
    return r ? respuesta(200, r) : respuesta(404, { error: { type: "NOT_FOUND" } });
  }
  let registros = [...store.values()];
  const formula = url.searchParams.get("filterByFormula") ?? "";
  if (formula.includes("RECORD_ID()")) {
    const ids: string[] = formula.match(/rec[A-Za-z0-9]{14}/g) ?? [];
    registros = registros.filter((r) => ids.includes(r.id));
  }
  const porSku = formula.match(/LOWER\(\{([^}]+)\}\)\s*=\s*LOWER\('([^']*)'\)/);
  if (porSku) registros = registros.filter((r) => String(r.fields[porSku[1]] ?? "").toLowerCase() === porSku[2].toLowerCase());
  return respuesta(200, { records: registros });
}) as typeof fetch;

process.env.AIRTABLE_API_KEY = "fake-token-para-test";
process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";

const ROBERTO = crear(T.proveedores, "recPROVROBERTO001", {
  [CAMPOS_PROVEEDOR.proveedorId]: "Roberto",
  [CAMPOS_PROVEEDOR.nombre]: "Roberto",
  [CAMPOS_PROVEEDOR.estado]: "Activo",
  [CAMPOS_PROVEEDOR.tipos]: ["Hardware"],
  [CAMPOS_PROVEEDOR.pais]: "USA",
  [CAMPOS_PROVEEDOR.email]: "roberto@lv.test",
  [CAMPOS_PROVEEDOR.portal]: true,
  [CAMPOS_PROVEEDOR.permisosPortal]: [...ETIQUETAS_PERMISO_PROVEEDOR],
});
const OTRO = crear(T.proveedores, "recPROVOTRO000001", {
  [CAMPOS_PROVEEDOR.proveedorId]: "eBay",
  [CAMPOS_PROVEEDOR.nombre]: "eBay",
  [CAMPOS_PROVEEDOR.estado]: "Activo",
  [CAMPOS_PROVEEDOR.tipos]: ["Hardware"],
  [CAMPOS_PROVEEDOR.pais]: "USA",
});

const PAGO_R = "recPAGOROBERTO001";
const PAGO_O = "recPAGOOTRO000001";
const OC_R = "recOCROBERTO00001";
const PACK_R = "recPACKROBERTO001";
const ITEM_R = "recITEMROBERTO001";
const ITEM_O = "recITEMOTRO000001";

crear(T.items, ITEM_R, {
  [F.sku]: "LAP-000042",
  [F.nombre]: "Laptop HP 840 G5",
  [F.categoria]: "Laptop",
  [F.condicion]: "Usado",
  [F.estadoItem]: "Disponible",
  [F.tipoOperacion]: "Compra a proveedor",
  [F.cantidad]: 1,
  [F.numeroSerie]: "5CG8123ABC",
  [F.skuProveedor]: "EB-998",
  [F.costoProveedor]: 210.11,
  [F.costoTotalUnidad]: 221.33,
  [F.precioVentaSugerido]: 380.44,
  [F.precioVentaFinal]: 399,
  [F.proveedorCompra]: [ROBERTO],
  [F.recibido]: true,
  [F.requiereInspeccion]: true,
  "Revisado física/técnicamente": true,
  "Revisado por": "Enrique Martinez",
  "Shipping Pagos (Items relacionados)": [PAGO_R, PAGO_O],
  [F.ordenCompra]: [OC_R],
  "Shipping Packings": [PACK_R],
  "Marketplace publicado": true,
  "Marketplace publicado por": "Maritza Moreno",
  "Fecha Marketplace publicado": "2026-10-10T15:05:00.000Z",
  [F.observacionesInternas]: "Margen bajo",
});
crear(T.items, ITEM_O, {
  [F.sku]: "LAP-000099",
  [F.nombre]: "Laptop de otro proveedor",
  [F.categoria]: "Laptop",
  [F.estadoItem]: "Disponible",
  [F.cantidad]: 1,
  [F.costoProveedor]: 150,
  [F.precioVentaFinal]: 300,
  [F.proveedorCompra]: [OTRO],
});
crear(T.pagos, PAGO_R, {
  [FPAGO.pagoId]: "PAY-000010",
  [FPAGO.proveedor]: [ROBERTO],
  [FPAGO.estadoPago]: "Pagado",
  [FPAGO.concepto]: "Compra",
  [FPAGO.totalPagado]: 1050.55,
  [FPAGO.fechaPagoReal]: "2026-10-05",
  [FPAGO.metodoPago]: "Transferencia",
  [FPAGO.transaccionId]: "TX-123",
  [FPAGO.itemsRelacionados]: [ITEM_R],
});
crear(T.pagos, PAGO_O, {
  [FPAGO.pagoId]: "PAY-000099",
  [FPAGO.proveedor]: [OTRO],
  [FPAGO.estadoPago]: "Pagado",
  [FPAGO.concepto]: "Compra",
  [FPAGO.totalPagado]: 999.77,
});
crear(T.ordenesCompra, OC_R, {
  [OC.ocId]: "OC-000007",
  [OC.proveedor]: [ROBERTO],
  [OC.numeroProveedor]: "INV-5521",
  [OC.fechaCompra]: "2026-09-28",
  [OC.articulos]: [ITEM_R],
  [OC.pagos]: [PAGO_R],
});
crear(T.packings, PACK_R, {
  [FP.packingId]: "PK-000057",
  [FP.nombre]: "Laptops Roberto",
  [FP.estado]: "En tránsito",
  [FP.proveedorResponsable]: [ROBERTO],
  [FP.trackingUsa]: "1Z999",
  [FP.peso]: 11,
  [FP.fechaEnvio]: "2026-10-02",
});
crear(T.novedades, "recNOVEDAD0000001", {
  "Novedad ID": "NOV-000003",
  "Tipo de novedad": "Dañado",
  "Estado": "Abierta",
  "Item relacionado": [ITEM_R],
  "Proveedor responsable": [ROBERTO],
  "Responsable": "Proveedor",
  "Descripción": "Bisagra floja",
  "Monto reclamado": 55.66,
  "Valor de la pérdida": 77.88,
});
crear("Shipping Publicaciones", "recPUBLICACION001", {
  SKU: "LAP-000042",
  Canal: "Mercado Libre",
  Alcance: "Producto",
  Estado: "Publicado",
  "Publicado por": "Maritza Moreno",
  "Fecha publicado": "2026-10-23T22:24:42.000Z",
});

// ── Sesiones ───────────────────────────────────────────────────────────────

function sesion(rol: string, extra: Partial<StaffSession["user"]> = {}): StaffSession {
  return {
    expiresAt: "2099-01-01T00:00:00.000Z",
    user: { userId: `rec${rol}`, nombre: rol, email: `${rol.toLowerCase()}@supergeek.test`, rol, appsPermitidas: ["Shipping"], pantallasRestringidas: {}, camposRestringidos: {}, ...extra },
  } as StaffSession;
}
const ADMIN = sesion("Administrador", { appsPermitidas: [] });
const STAFF = sesion("Staff");
const STAFF_RESTRINGIDO = sesion("Staff", { camposRestringidos: { "shipping-v2": { items: { costoProveedor: "oculto", precioVenta: "solo-lectura" } } } });
const TECNICO = sesion("Técnico", { pantallasRestringidas: { "shipping-v2": ["packings", "pagos"] } });
const PROVEEDOR = sesion("Proveedor", { email: "roberto@lv.test" });

/** Todos los números que contiene un objeto (para buscar montos que no deben salir). */
function numeros(valor: unknown, acc: number[] = []): number[] {
  if (typeof valor === "number") acc.push(valor);
  else if (Array.isArray(valor)) valor.forEach((v) => numeros(v, acc));
  else if (valor && typeof valor === "object") Object.values(valor).forEach((v) => numeros(v, acc));
  return acc;
}
/** Todas las claves de un objeto, a cualquier profundidad. */
function claves(valor: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(valor)) valor.forEach((v) => claves(v, acc));
  else if (valor && typeof valor === "object") for (const [k, v] of Object.entries(valor)) { acc.add(k); claves(v, acc); }
  return acc;
}

const COSTOS = [210.11, 221.33, 380.44, 1050.55, 999.77, 55.66, 77.88];

async function main() {
  // ── Accesos que no deben leer nada ──
  {
    const r = await cargarFichaArticulo(ITEM_R, null);
    assert(!r.ok && r.estado === 401, "Sin sesión: 401");
    const sinApp = await cargarFichaArticulo(ITEM_R, sesion("Staff", { appsPermitidas: ["Técnicos"] }));
    assert(!sinApp.ok && sinApp.estado === 403, "Sin la app Shipping: 403");
    const sinPantalla = await cargarFichaArticulo(ITEM_R, sesion("Staff", { pantallasRestringidas: { "shipping-v2": ["items"] } }));
    assert(!sinPantalla.ok && sinPantalla.estado === 403, "Con la pantalla Artículos restringida: 403");
    const raro = await cargarFichaArticulo("../../Usuarios", ADMIN);
    assert(!raro.ok && raro.estado === 404, "Un id manipulado no llega a Airtable: 404");
    const noExiste = await cargarFichaArticulo("recNOEXISTE000001", ADMIN);
    assert(!noExiste.ok && noExiste.estado === 404, "Artículo inexistente: 404");
  }

  // ── Administrador ──
  {
    const r = await cargarFichaArticulo(ITEM_R, ADMIN);
    assert(r.ok && r.ficha.perfil === "admin", "Administrador recibe su ficha");
    if (r.ok && r.ficha.perfil === "admin") {
      const d = r.ficha.datos;
      assert(d.item.costoTotalUnidad === 221.33 && d.item.precioVenta === 399, "Administrador ve costos y precio");
      assert(d.permissions.canViewCosts === true, "Administrador con permisos completos");
      const canales = d.publicaciones.map((p) => `${p.canal}:${p.publicadoPor}`).sort().join(" | ");
      assert(canales === "Marketplace:Maritza Moreno | Mercado Libre:Maritza Moreno", `Publicaciones con canal y responsable (${canales})`);
    }
  }

  // ── Staff ──
  {
    const r = await cargarFichaArticulo(ITEM_R, STAFF);
    assert(r.ok && r.ficha.perfil === "staff", "Staff recibe la ficha de Staff (no la de Administrador)");
    if (r.ok && r.ficha.perfil === "staff") {
      assert(r.ficha.datos.item.costoTotalUnidad === 221.33, "Staff conserva sus costos operativos");
      assert(r.ficha.datos.publicaciones.length === 2, "Staff ve las publicaciones");
    }
    const restringido = await cargarFichaArticulo(ITEM_R, STAFF_RESTRINGIDO);
    if (restringido.ok && restringido.ficha.perfil === "staff") {
      assert(restringido.ficha.datos.item.costoProveedor === null && !numeros(restringido.ficha.datos.item).includes(210.11), "Staff con 'Campos restringidos': el valor oculto no sale del servidor");
      assert(restringido.ficha.datos.camposSoloLectura.includes("precioVenta"), "…y su solo-lectura viaja para la pantalla");
    } else assert(false, "Staff restringido recibe su ficha");
  }

  // ── Técnico ──
  {
    const r = await cargarFichaArticulo(ITEM_R, TECNICO);
    assert(r.ok && r.ficha.perfil === "tecnico", "El técnico recibe la ficha técnica");
    if (r.ok && r.ficha.perfil === "tecnico") {
      const encontrados = numeros(r.ficha).filter((n) => COSTOS.includes(n));
      assert(encontrados.length === 0, `FIX: ningún costo, pago ni monto llega al técnico (llegan: ${encontrados.join(", ") || "ninguno"})`);
      const k = claves(r.ficha);
      for (const prohibida of ["costoProveedor", "costoTotalUnidad", "precioVentaSugerido", "proveedorId", "pagoV2ItemIds", "ordenCompraId", "packingId", "publicaciones", "permissions", "trazabilidad", "observacionesInternas", "situacionPago", "proveedorResponsableNombre"]) {
        assert(!k.has(prohibida), `FIX: el técnico no recibe "${prohibida}"`);
      }
      const d = r.ficha.datos;
      assert(d.item.precioVenta === 399 && d.item.sku === "LAP-000042" && d.item.numeroSerie === "5CG8123ABC" && d.item.skuProveedor === "EB-998", "Ve precio (dato), SKU, serie y SKU del proveedor");
      assert(d.item.revisadoPor === "Enrique Martinez" && d.puedeInspeccionar && Boolean(d.inspeccionHref?.includes("/inspeccion")), "Ve su inspección y el enlace para inspeccionar");
      assert(d.novedades.length === 1 && d.novedades[0].descripcion === "Bisagra floja", "Ve las novedades del artículo (sin montos)");
      assert(!JSON.stringify(r.ficha).includes("PAY-0000") && !JSON.stringify(r.ficha).includes("PK-000057") && !JSON.stringify(r.ficha).includes("INV-5521"), "Ni pagos, ni cajas, ni órdenes en lo que recibe");
    }
  }

  // ── Cambio de sesión: Administrador y luego técnico ──
  {
    const admin = await cargarFichaArticulo(ITEM_R, ADMIN);
    const tecnico = await cargarFichaArticulo(ITEM_R, TECNICO);
    assert(admin.ok && admin.ficha.perfil === "admin" && tecnico.ok && tecnico.ficha.perfil === "tecnico", "Misma ficha, sesiones distintas, perfiles distintos");
    assert(numeros(tecnico).filter((n) => COSTOS.includes(n)).length === 0, "Lo que vio el Administrador no se le pega al técnico");
  }

  // ── Proveedor ──
  {
    const r = await cargarFichaArticulo(ITEM_R, PROVEEDOR);
    assert(r.ok && r.ficha.perfil === "proveedor", "El proveedor recibe su vista");
    if (r.ok && r.ficha.perfil === "proveedor") {
      const d = r.ficha.datos;
      const k = claves(r.ficha);
      for (const prohibida of ["precioVenta", "precioVentaSugerido", "costoTotalUnidad", "revisadoPor", "revisionTecnicaDetalle", "publicaciones", "novedades", "estadoRevision", "permissions", "trazabilidad"]) {
        assert(!k.has(prohibida), `FIX: el proveedor no recibe "${prohibida}"`);
      }
      const n = numeros(r.ficha);
      assert(!n.includes(399) && !n.includes(221.33) && !n.includes(380.44), "Ni precio de venta ni costos internos");
      assert(!n.includes(999.77) && !JSON.stringify(r.ficha).includes("PAY-000099"), "FIX: nunca el pago de otro proveedor");
      assert(d.item.costoProveedor === 210.11, "Ve SU costo (tiene 'Ver su costo de proveedor')");
      assert(d.compra?.numeroProveedor === "INV-5521" && d.compra.codigo === "OC-000007", "Ve su orden de compra con su número");
      assert(d.envio?.codigo === "PK-000057" && d.envio.trackingUsa === "1Z999", "Ve la caja en la que viaja");
      assert(d.pagos?.length === 1 && d.pagos[0].codigo === "PAY-000010" && d.pagos[0].transaccion === "TX-123" && d.estadoPago === "Pagado", "Ve SU pago con fecha, método y transacción");
      assert(d.item.situacion === "Recibido en SUPER GEEK", "Situación sencilla");
    }
    const ajeno = await cargarFichaArticulo(ITEM_O, PROVEEDOR);
    assert(!ajeno.ok && ajeno.estado === 404, "FIX: un artículo de otro proveedor 'no existe' para él");
  }

  assert(escrituras === 0, "El cargador nunca escribe en Airtable");

  global.fetch = fetchOriginal;
  if (fallos > 0) {
    console.error(`\n${fallos} assert(s) fallaron.`);
    process.exit(1);
  }
  console.log("\n✅ ficha-cargador-roles.test.ts — todos los asserts pasaron");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
