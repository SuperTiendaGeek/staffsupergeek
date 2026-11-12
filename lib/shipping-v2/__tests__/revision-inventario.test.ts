/**
 * Revisión de inventario (punto 10c-1): reglas y sincronización.
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/revision-inventario.test.ts
 */
import { corteDeConteos, detectarAsuntos, gruposDuplicados, palabrasNombre, planSincronizacion, verificadoEnCorte, type CorteInventario, type DatosRevision, type ItemRevision } from "../revision-inventario";

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}

const base: ItemRevision = {
  id: "r1", sku: "OTR-000028", nombre: "Cables USB-C a Lightning de Tela", categoria: "Cable", estado: "Disponible", cantidad: 2,
  compradas: 3, recibido: true, precio: 6, tipoOperacion: "Compra a proveedor", origen: "Proveedor extranjero",
  fechaRegistro: "2026-09-01T12:00:00Z", requierePago: false, esRegalo: false, tienePago: false,
};
const vacio: DatosRevision = { items: [], ventas: [], devoluciones: [], reservasActivas: [], novedadesAbiertas: [], cajasCerradas: [], documentosConError: [] };
const hoy = new Date("2026-10-18T20:00:00Z");

console.log("\n— Unidades —");
let a = detectarAsuntos({ ...vacio, items: [base], ventas: [{ itemId: "r1", cantidad: 2 }] }, hoy);
assert(a.length === 1 && a[0].tipo === "Unidades no cuadran" && a[0].detalle === "1 más de lo comprado", "OTR-000028: 3 compradas, 2 vendidas, 2 en tienda → 1 de más");
a = detectarAsuntos({ ...vacio, items: [{ ...base, cantidad: 1 }], ventas: [{ itemId: "r1", cantidad: 2 }] }, hoy);
assert(a.length === 0, "Cuadra: no hay asunto");
a = detectarAsuntos({ ...vacio, items: [{ ...base, cantidad: 0, estado: "Vendido", compradas: 1 }], ventas: [{ itemId: "r1", cantidad: 2 }], devoluciones: [{ itemId: "r1", cantidad: 1 }] }, hoy);
assert(a.length === 0, "La nota de crédito con devolución resta lo vendido");
a = detectarAsuntos({ ...vacio, items: [{ ...base, compradas: 7, cantidad: 4, bajas: 1, vendidasFuera: 1, salidasInternas: 1 }] }, hoy);
assert(a.length === 0, "Punto 10c-4: bajas, vendidas fuera del sistema y salidas internas cuentan para cuadrar");
a = detectarAsuntos({ ...vacio, items: [{ ...base, estado: "Vendido", compradas: 1, cantidad: 0, ventasOtro: 2 }], ventas: [{ itemId: "r1", cantidad: 3 }] }, hoy);
assert(a.length === 0, "Punto 10c-4: las ventas de otro artículo se descuentan");
a = detectarAsuntos({ ...vacio, items: [{ ...base, compradas: 7, cantidad: 5, bajas: 1 }] }, hoy);
assert(a[0]?.asunto.includes("bajas 1") && a[0]?.detalle === "Falta 1", "El asunto muestra las bajas y lo que falta");
a = detectarAsuntos({ ...vacio, items: [{ ...base, compradas: null }] }, hoy);
assert(a.length === 0, "Sin \"Unidades compradas\" no se compara");
a = detectarAsuntos({ ...vacio, items: [{ ...base, estado: "Vendido", compradas: null }] }, hoy);
assert(a.some((x) => x.tipo === "Vendido con unidades"), "\"Vendido\" con unidades en tienda");

console.log("\n— Tiempos, precio y tipo —");
a = detectarAsuntos({ ...vacio, items: [{ ...base, compradas: null, recibido: false, fechaRegistro: "2026-08-18T12:00:00Z" }] }, hoy);
assert(a.some((x) => x.tipo === "En camino demasiado" && x.asunto.includes("61 días")), "En camino más de 45 días");
a = detectarAsuntos({ ...vacio, items: [{ ...base, compradas: null, recibido: false, origen: "Ya está en la tienda", fechaRegistro: "2026-08-18T12:00:00Z" }] }, hoy);
assert(!a.some((x) => x.tipo === "En camino demasiado"), "Lo que ya estaba en la tienda no está \"en camino\"");
a = detectarAsuntos({ ...vacio, items: [{ ...base, compradas: null, precio: null }] }, hoy);
assert(a.some((x) => x.tipo === "A la venta sin precio"), "A la venta sin precio");
a = detectarAsuntos({ ...vacio, items: [{ ...base, compradas: null, tipoOperacion: "Compra ya pagada" }, { ...base, id: "r2", sku: "X-1", compradas: null, estado: "Vendido", cantidad: 0, tipoOperacion: "Compra ya pagada" }] }, hoy);
assert(a.filter((x) => x.tipo === "Tipo antiguo").length === 1, "Tipo antiguo solo en lo que sigue a la venta");

console.log("\n— Duplicados —");
const t544 = [
  { ...base, id: "a", sku: "REP-000043", nombre: "Kit Botellas Epson T544 4 Colores", categoria: "Repuesto" },
  { ...base, id: "b", sku: "ACC-000170", nombre: "KIT BOTELLAS EPSON T544 4 COLORES BLACK-CYAN-MAGENTA-YELLOW", categoria: "Accesorio", estado: "Vendido", cantidad: 0 },
  { ...base, id: "c", sku: "OTR-000214", nombre: "PAQUETE PACK DE BOTELLAS DE TINTA EPSON T544 – 4 COLORES NEGRO/CYAN/MAG/YELLOW", categoria: "Otro", estado: "Vendido", cantidad: 0 },
];
const grupos = gruposDuplicados(t544);
assert(grupos.length === 1 && grupos[0].length === 3, "T544 en 3 SKU (categorías distintas, mismo modelo)");
assert(!palabrasNombre("Cables USB-A a Lightning").has("usbc") && palabrasNombre("Cable USB-C").has("usbc"), "USB-A y USB-C no se confunden");
assert(gruposDuplicados([{ ...base, id: "x", sku: "OTR-000027", nombre: "Cables USB-A a Lightning de Tela" }, base]).length === 0, "OTR-000027 (USB-A) no es duplicado de OTR-000028 (USB-C)");
assert(gruposDuplicados(t544.map((i) => ({ ...i, estado: "Vendido", cantidad: 0 }))).length === 0, "Si todo está vendido, no se avisa");
a = detectarAsuntos({ ...vacio, items: t544.map((i) => ({ ...i, compradas: null })) }, hoy);
const dup = a.find((x) => x.tipo === "Posible duplicado");
assert(dup?.sku === "REP-000043" && dup.sugerencia === "Fusionar en REP-000043", "Sugiere fusionar en el que sigue a la venta");

console.log("\n— Otros —");
a = detectarAsuntos({
  ...vacio,
  items: [{ ...base, compradas: null }, { ...base, id: "r9", sku: "LAP-000500", compradas: null, recibido: false }],
  reservasActivas: [{ id: "res1", numero: "RES-000021", fechaLimite: "2026-10-14", itemId: "r1" }, { id: "res2", numero: "RES-000022", fechaLimite: "2026-10-30", itemId: "r1" }],
  novedadesAbiertas: [{ id: "n1", codigo: "NOV-1", tipo: "Daño", itemId: "r1", ultimaActualizacion: "2026-09-20T12:00:00Z" }, { id: "n2", codigo: "NOV-2", tipo: "", ultimaActualizacion: "2026-10-15T12:00:00Z" }],
  cajasCerradas: [{ id: "pk1", codigo: "PK-1", itemIds: ["r1", "r9"] }],
  documentosConError: [{ tipo: "Recibo", numero: "REC-000040", itemIds: ["r1"], error: "Timeout" }],
}, hoy);
assert(a.filter((x) => x.tipo === "Reserva vencida").length === 1, "Solo la reserva vencida");
assert(a.filter((x) => x.tipo === "Novedad sin movimiento").length === 1, "Novedad sin cambios más de 15 días");
assert(a.find((x) => x.tipo === "Caja cerrada sin recibir")?.asunto.includes("LAP-000500"), "Caja cerrada con un artículo sin recibir");
assert(a.find((x) => x.tipo === "Descargo con error")?.sugerencia === "Reintentar descargo", "Recibo con error de descargo");
a = detectarAsuntos({ ...vacio, items: [{ ...base, compradas: null, requierePago: true }, { ...base, id: "r3", compradas: null, requierePago: true, tienePago: true }] }, hoy);
assert(a.filter((x) => x.tipo === "Falta respaldo").length === 1 && a.find((x) => x.tipo === "Falta respaldo")?.asunto.startsWith("1 artículo"), "Compras sin pago: un solo asunto con el total");

console.log("\n— Sincronización —");
const det = detectarAsuntos({ ...vacio, items: [{ ...base, compradas: null, precio: null }, { ...base, id: "r2", sku: "X-2", nombre: "Mouse Logitech M185", compradas: null, precio: null }] }, hoy);
const plan = planSincronizacion([
  { id: "g1", clave: "A la venta sin precio|r1", estado: "Abierto", asunto: "", detalle: "" },
  { id: "g2", clave: "A la venta sin precio|r2", estado: "Está bien", asunto: "", detalle: "" },
  { id: "g3", clave: "Tipo antiguo|r7", estado: "Abierto", asunto: "", detalle: "" },
], det);
assert(plan.renovar.map((r) => r.id).join() === "g1", "Sigue abierto: se renueva");
assert(plan.crear.length === 0, "\"Está bien\" no se reabre");
assert(plan.cerrar.join() === "g3", "Lo que ya no aparece se cierra solo");
assert(planSincronizacion([{ id: "g4", clave: "A la venta sin precio|r1", estado: "Resuelto", asunto: "", detalle: "" }], det).crear.length === 2, "Si vuelve a pasar después de resuelto, es un asunto nuevo");

console.log("\n— Punto cero: inventario general 7-nov (12-nov-2026) —");
const conteos = [
  { id: "c1", nombre: "Pantalla, Monitor · 21-oct", estado: "Aplicado", categorias: ["Pantalla", "Monitor"], fechaAplicado: "2026-10-21T21:49:58Z", foto: { m1: [1, "Disponible"] } },
  { id: "c2", nombre: "Inventario general 7 nov", estado: "Aplicado", categorias: [], fechaAplicado: "2026-11-09T16:05:26Z", foto: { r1: [2, "Disponible"], r5: [3, "Disponible"] } },
  { id: "c3", nombre: "Todo · 07-nov", estado: "Contando", categorias: [], fechaAplicado: "", foto: { r9: [1, "Disponible"] } },
];
const corte = corteDeConteos(conteos) as CorteInventario;
assert(corte?.nombre === "Inventario general 7 nov" && corte.contados.join() === "r1,r5", "El punto cero es el último inventario GENERAL aplicado (no uno por categorías ni uno sin aplicar)");
assert(corteDeConteos(conteos.slice(0, 1)) === null, "Sin inventario general no hay punto cero");

// OTR-000028 tal como está hoy: compradas 3 (estimado por el 9b), vendidas 3, en tienda 1.
const otr28: ItemRevision = { ...base, cantidad: 1, compradas: 3, fechaRegistro: "2026-07-31T21:08:19Z", ultimoMovimiento: "2026-11-10T23:40:09Z" };
const ventas28 = [{ itemId: "r1", cantidad: 3 }];
a = detectarAsuntos({ ...vacio, items: [otr28], ventas: ventas28 }, hoy);
assert(a.some((x) => x.tipo === "Unidades no cuadran"), "Sin punto cero, OTR-000028 sigue con \"1 más de lo comprado\" (como hoy)");
a = detectarAsuntos({ ...vacio, items: [otr28], ventas: ventas28, corte }, hoy);
assert(!a.some((x) => x.tipo === "Unidades no cuadran"), "Con punto cero: estaba en la tienda al contar, ya no se compara contra lo comprado");

// Vendido antes del conteo (LAP-000016: salió con el sistema anterior, sin documento en el portal).
const lap16: ItemRevision = { ...base, id: "r2", sku: "LAP-000016", estado: "Vendido", cantidad: 0, compradas: 1, fechaRegistro: "2026-06-22T12:00:00Z", ultimoMovimiento: "2026-09-14T17:02:00Z" };
assert(verificadoEnCorte(lap16, corte), "Registrado antes, en 0 y sin movimientos después del conteo: el conteo lo confirmó");
a = detectarAsuntos({ ...vacio, items: [lap16], corte }, hoy);
assert(!a.some((x) => x.tipo === "Unidades no cuadran"), "LAP-000016 ya no avisa \"Falta 1\"");

// Estaba en 0 y apareció en el conteo (REP-000005): lo encontrado lo dijo el conteo.
const rep5: ItemRevision = { ...base, id: "r8", sku: "REP-000005", cantidad: 1, compradas: 1, fechaRegistro: "2026-07-04T12:00:00Z", ultimoMovimiento: "2026-11-09T16:04:00Z" };
a = detectarAsuntos({ ...vacio, items: [rep5], ventas: [{ itemId: "r8", cantidad: 1 }], corte }, hoy);
assert(!a.some((x) => x.tipo === "Unidades no cuadran"), "Vendido antes y encontrado en el conteo: no avisa");
a = detectarAsuntos({ ...vacio, items: [{ ...rep5, ultimoMovimiento: "2026-11-10T12:00:00Z" }], ventas: [{ itemId: "r8", cantidad: 1 }], corte }, hoy);
assert(a.some((x) => x.tipo === "Unidades no cuadran"), "Pero si se mueve después del conteo sin estar en la foto, se vuelve a controlar");

// Llegó después del conteo: se sigue controlando contra lo comprado.
const nuevo: ItemRevision = { ...base, id: "r3", sku: "ACC-000300", cantidad: 1, compradas: 3, fechaRegistro: "2026-11-10T12:00:00Z", ultimoMovimiento: "2026-11-10T13:00:00Z" };
a = detectarAsuntos({ ...vacio, items: [nuevo], corte }, hoy);
assert(a.some((x) => x.tipo === "Unidades no cuadran" && x.detalle === "Faltan 2"), "Compra posterior al conteo: compradas 3, en tienda 1, sin ventas → Faltan 2");
// Registrado antes del conteo pero en camino (no estaba en la tienda): se recibe y se mueve después.
const enCamino: ItemRevision = { ...base, id: "r4", sku: "ACC-000301", cantidad: 0, compradas: 2, fechaRegistro: "2026-11-01T12:00:00Z", ultimoMovimiento: "2026-11-10T13:00:00Z" };
assert(!verificadoEnCorte(enCamino, corte), "Se movió después del conteo: no queda cubierto por el punto cero");

// Salidas por el taller (garantía) y licencias: no son faltantes.
const bateria: ItemRevision = { ...base, id: "r6", sku: "REP-000300", estado: "Usado en reparación", cantidad: 0, compradas: 1, fechaRegistro: "2026-11-10T12:00:00Z", salidasTaller: 1 };
a = detectarAsuntos({ ...vacio, items: [bateria], corte }, hoy);
assert(!a.some((x) => x.tipo === "Unidades no cuadran"), "Pieza entregada en garantía (salida del taller en el Kardex): cuadra");
const licencia: ItemRevision = { ...base, id: "r7", sku: "OTR-000226", categoria: "Licencia digital", estado: "Vendido", cantidad: 0, compradas: 1, fechaRegistro: "2026-11-10T12:00:00Z" };
a = detectarAsuntos({ ...vacio, items: [licencia], corte }, hoy);
assert(!a.some((x) => x.tipo === "Unidades no cuadran"), "Licencia digital vendida por su unidad DIG: la controla el Kardex, no esta regla");

// "Kardex no cuadra" ya no se oculta detrás de "Unidades no cuadran".
a = detectarAsuntos({ ...vacio, items: [nuevo], corte, kardex: [{ registroId: "r3", sku: "ACC-000300", libro: 3, inventario: 1 }] }, hoy);
assert(a.some((x) => x.tipo === "Unidades no cuadran") && a.some((x) => x.tipo === "Kardex no cuadra"), "Los dos asuntos se ven a la vez");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
