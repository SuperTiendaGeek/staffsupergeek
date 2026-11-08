/**
 * Test — ajuste de datos del punto 5C (catálogo duplicado, nombres, prueba,
 * solicitud de OR000535) y aviso de catálogo duplicado.
 * Ejecutar: npm test ajuste-5c
 */
import {
  planAjuste5C,
  puedeBorrarCatalogo,
  CATALOGO_DESTINO,
  CATALOGO_DUPLICADO,
  NOTA_ANULADA_PRUEBA,
  type LineaAjuste,
  type UnidadAjuste,
} from "../ajuste-5c";
import { posiblesDuplicadosCatalogo } from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const catalogo = [
  { id: CATALOGO_DESTINO, nombre: "Microsoft 365 Education (PC, Mac)" },
  { id: CATALOGO_DUPLICADO, nombre: "Microsoft Office 365 Education" },
  { id: "recPro", nombre: "Microsoft Office 365 Pro Plus Perpetual" },
  { id: "recBit", nombre: "Bitdefender Internet Security" },
  { id: "recMc", nombre: "McAfee AntiVirus 1 Year" },
];

const U = (p: Partial<UnidadAjuste> & { id: string; sku: string }): UnidadAjuste => ({
  catalogoId: CATALOGO_DESTINO, nombreActual: "Microsoft 365 Education (PC, Mac)", estado: "Usado",
  fechaCompra: "2026-09-01", fechaRegistro: "2026-09-01", observaciones: "", ...p,
});
const L = (p: Partial<LineaAjuste> & { id: string; orden: string }): LineaAjuste => ({
  ordenId: `rec${p.orden}`, descripcion: "McAfee AntiVirus 1 Year", tipo: "Producto digital", estado: "Cargada",
  catalogoId: "recMc", solicitudId: null, cargoProductoDigitalId: "recDIG", ...p,
});

// Datos reales (8-nov-2026), resumidos.
const unidades: UnidadAjuste[] = [
  U({ id: "u74", sku: "DIG-000074", catalogoId: CATALOGO_DUPLICADO, nombreActual: "Microsoft Office 365 Education · Disponible · 30/09/2026", estado: "Disponible" }),
  U({ id: "u49", sku: "DIG-000049", catalogoId: CATALOGO_DUPLICADO, nombreActual: "Microsoft Office 365 Education · Usado · 11/08/2026" }),
  U({ id: "u76", sku: "DIG-000076", nombreActual: '"Microsoft 365 Education (PC, Mac)" · Usado · 20/10/2026' }),
  U({ id: "u80", sku: "DIG-000080", nombreActual: "Microsoft 365 Education (PC, Mac) · Disponible · 03/11/2026" }),
  U({ id: "u59", sku: "DIG-000059", catalogoId: "recPro", nombreActual: "#ERROR!", fechaCompra: null, fechaRegistro: "2026-09-04" }),
  U({ id: "recn4FGiTwN4n4A3g", sku: "DIG-000082", catalogoId: "recBit", nombreActual: "", estado: "Disponible", fechaCompra: "2026-11-07", observaciones: "ESTO ES UNA PRUEBA DE REGISTRO DE PRODUCTO DIGITAL" }),
  U({ id: "u90", sku: "DIG-000090", catalogoId: "recBit", nombreActual: "Bitdefender Internet Security" }),
];
const lineas: LineaAjuste[] = [
  L({ id: "l517", orden: "OR000517", catalogoId: CATALOGO_DUPLICADO, descripcion: "Microsoft Microsoft Office 365 Education" }),
  L({ id: "l535", orden: "OR000535", estado: "Aprobada", cargoProductoDigitalId: null }),
  L({ id: "l368", orden: "OR000368", estado: "Aprobada", cargoProductoDigitalId: null, catalogoId: "recBit", descripcion: "Bitdefender" }),
  L({ id: "l542", orden: "OR000542", estado: "Propuesta", cargoProductoDigitalId: null }),
  L({ id: "l540", orden: "OR000540", estado: "Aprobada", cargoProductoDigitalId: null, solicitudId: "recSOL" }),
];

const { acciones, omitidos } = planAjuste5C({ catalogo, unidades, lineas });
const de = (tipo: string) => acciones.filter((a) => a.tipo === tipo);
const ids = (tipo: string) => de(tipo).map((a) => ("id" in a ? a.id : (a as { lineaId: string }).lineaId)).sort();

// 1. Unir catálogos
assert(JSON.stringify(ids("mover_unidad")) === JSON.stringify(["u49", "u74"]), "las licencias del duplicado pasan al catálogo que queda (e4099 = DIG-000074 incluida)");
assert(JSON.stringify(ids("mover_linea")) === JSON.stringify(["l517"]), "la línea de OR000517 pasa al catálogo que queda");
const borrar = de("borrar_catalogo");
assert(borrar.length === 1 && acciones[acciones.length - 1].tipo === "borrar_catalogo", "el duplicado se borra al final");
assert(puedeBorrarCatalogo({ unidades: 0, lineas: 0 }) && !puedeBorrarCatalogo({ unidades: 1, lineas: 0 }) && !puedeBorrarCatalogo({ unidades: 0, lineas: 2 }),
  "solo se borra si ya no le queda nada enlazado");

// 2. Nombres limpios (el nombre del catálogo FINAL)
const nombre = (id: string) => (de("nombre") as Array<{ id: string; despues: string }>).find((a) => a.id === id);
assert(nombre("u74")?.despues === "Microsoft 365 Education (PC, Mac)", "la licencia movida toma el nombre del catálogo que queda");
assert(nombre("u76")?.despues === "Microsoft 365 Education (PC, Mac)", "sin comillas, sin estado ni fecha");
assert(nombre("u80")?.despues === "Microsoft 365 Education (PC, Mac)", "DIG-000080 deja de decir \"Disponible\"");
assert(nombre("u59")?.despues === "Microsoft Office 365 Pro Plus Perpetual", "DIG-000059 deja de decir \"#ERROR!\"");
assert(!nombre("u90"), "un nombre ya limpio no se toca");

// 3. Fecha de compra
const fechas = de("fecha_compra") as Array<{ id: string; fecha: string }>;
assert(fechas.length === 1 && fechas[0].id === "u59" && fechas[0].fecha === "2026-09-04", "DIG-000059 sin fecha de compra toma la de registro (04/09/2026); la prueba no");

// 4. Prueba anulada
const anular = de("anular_prueba") as Array<{ id: string; observaciones: string }>;
assert(anular.length === 1 && anular[0].observaciones.startsWith("ESTO ES UNA PRUEBA") && anular[0].observaciones.endsWith(NOTA_ANULADA_PRUEBA),
  "DIG-000082 → Anulado, conservando su nota");

// 5. Solicitud de OR000535
const sol = de("crear_solicitud") as Array<{ lineaId: string; orden: string }>;
assert(sol.length === 1 && sol[0].orden === "OR000535", "OR000535 (aprobada antes de la 5B-2) recibe su solicitud; OR000542 sigue propuesta; OR000540 ya la tiene");
assert(omitidos.some((o) => o.que.startsWith("OR000368")), "OR000368 (datos de prueba) no se toca y se informa");

// 6. Idempotente: con todo aplicado, 0 acciones
const aplicadas: UnidadAjuste[] = unidades.map((u) => ({
  ...u,
  catalogoId: u.catalogoId === CATALOGO_DUPLICADO ? CATALOGO_DESTINO : u.catalogoId,
  nombreActual: nombre(u.id)?.despues ?? u.nombreActual,
  fechaCompra: u.fechaCompra ?? u.fechaRegistro,
  estado: u.id === "recn4FGiTwN4n4A3g" ? "Anulado" : u.estado,
}));
const lineasAplicadas = lineas.map((l) => ({
  ...l,
  catalogoId: l.catalogoId === CATALOGO_DUPLICADO ? CATALOGO_DESTINO : l.catalogoId,
  solicitudId: l.id === "l535" ? "recNueva" : l.solicitudId,
}));
const otraVez = planAjuste5C({ catalogo: catalogo.filter((c) => c.id !== CATALOGO_DUPLICADO), unidades: aplicadas, lineas: lineasAplicadas });
assert(otraVez.acciones.length === 0, "aplicado, la vista previa da 0 acciones");

// 7. Aviso de catálogo duplicado al crear
const existentes = ["Microsoft 365 Education (PC, Mac)", "Windows 11 Home-Licencia", "Microsoft Office 365 (5 Dispositivos)", "Microsoft Office Professional Plus 2021 Non-binding"];
assert(JSON.stringify(posiblesDuplicadosCatalogo("Microsoft Office 365 Education", existentes)) === JSON.stringify(["Microsoft 365 Education (PC, Mac)"]),
  "el caso real se habría avisado");
assert(posiblesDuplicadosCatalogo("microsoft 365 éducation", existentes).length === 1, "sin importar mayúsculas ni tildes");
assert(posiblesDuplicadosCatalogo("Windows 11 Pro", existentes).length === 0, "Windows 11 Pro no es Windows 11 Home");
assert(posiblesDuplicadosCatalogo("Microsoft Office 2021 Home and Business para Mac", existentes).length === 0, "Office 2021 Home & Business no es Professional Plus 2021");
assert(posiblesDuplicadosCatalogo("   ", existentes).length === 0, "nombre vacío: sin aviso");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
