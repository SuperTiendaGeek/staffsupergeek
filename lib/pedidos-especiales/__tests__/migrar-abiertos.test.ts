/**
 * Test — migración de los pedidos abiertos al pedido especial (punto 10A-3).
 * Ejecutar: npm test migrar-abiertos
 */
import { planMigracionAbiertos, precioUnitarioDeOpcion, separarTexto, type OpParaMigrar, type OpcionVieja } from "../migrar-abiertos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// 1. Texto de la opción
const t = separarTexto("Laptop Lenovo ThinkPad P1 Gen 4 16\" $690\r\n\r\n*USADA, GRADO A. Bajo pedido.");
assert(t.descripcion === "Laptop Lenovo ThinkPad P1 Gen 4 16\"" && t.nota === "*USADA, GRADO A. Bajo pedido.", "nombre sin el precio pegado + nota");
assert(separarTexto("BISAGRAS HP 15-DW").descripcion === "BISAGRAS HP 15-DW", "una sola línea");

// 2. Precio unitario
assert(precioUnitarioDeOpcion({ precioUnitario: 30, precioVenta: 120, cantidad: 4 }) === 30, "unitario si existe");
assert(precioUnitarioDeOpcion({ precioUnitario: null, precioVenta: 120, cantidad: 4 }) === 30, "si no, total ÷ cantidad");
assert(precioUnitarioDeOpcion({ precioUnitario: null, precioVenta: 65, cantidad: null }) === 65, "cantidad vacía = 1");

const opc = (id: string, texto: string, precio: number | null, extra: Partial<OpcionVieja> = {}): OpcionVieja => ({
  id, texto, cantidad: null, precioUnitario: null, precioVenta: precio, costo: 100, url: "", tiempo: "", nota: "", proveedorId: "recPROV", itemIds: [], ...extra,
});
const op = (id: string, estado: string, extra: Partial<OpParaMigrar> = {}): OpParaMigrar => ({
  id, codigo: `OP-${id}`, estado, ordenId: null, categoria: "Laptop", lineaIds: [], opcionIds: [], opcionElegidaId: null, itemIds: [], abonado: 0, ...extra,
});

const OPCIONES = [
  opc("o1", "Lenovo P1 $690\n*USADA", 690),
  opc("o2", "Dell XPS 15", 520, { proveedorId: null }),
  opc("o3", "Listado de items en el pdf adjunto", null),
  opc("o4", "Tapa trasera HP", 130, { itemIds: ["recITEM"] }),
];

const { acciones, avisos } = planMigracionAbiertos({
  operaciones: [
    op("127", "Requerimiento", { opcionIds: ["o1", "o2", "o3"] }),
    op("133", "Requerimiento", { categoria: "" }),
    op("126", "Pedido", { opcionIds: ["o4"], opcionElegidaId: "o4", itemIds: ["recITEM"], abonado: 130 }),
    op("200", "Requerimiento", { ordenId: "recORDEN", opcionIds: ["o1"] }),
    op("137", "Aceptado", { lineaIds: ["recL"] }),
    op("046", "Rechazado", { opcionIds: ["o1"] }),
    op("210", "Aprobado", { opcionIds: ["o1"] }),
  ],
  opciones: OPCIONES,
});

const de = (codigo: string) => acciones.filter((a) => (a.tipo === "crear_linea" ? a.linea.op : a.op) === codigo);

// 3. Requerimiento con opciones → alternativas propuestas + Cotizando
const a127 = de("OP-127");
const lineas127 = a127.filter((a) => a.tipo === "crear_linea");
assert(lineas127.length === 2, "OP-127: pasan las 2 opciones con precio (la de \"listado\" no)");
assert(lineas127.every((a) => a.tipo === "crear_linea" && a.linea.estado === "Propuesta" && a.linea.grupo === "pedido"), "como alternativas propuestas");
assert(a127.some((a) => a.tipo === "estado" && a.estado === "Cotizando"), "OP-127 queda Cotizando");
assert(avisos.some((x) => x.op === "OP-127" && x.texto.includes("no tiene proveedor")), "avisa la opción sin proveedor");
assert(avisos.some((x) => x.op === "OP-127" && x.texto.includes("sin precio")), "avisa la opción sin precio");

// 4. Requerimiento sin opciones → solo Cotizando
const a133 = de("OP-133");
assert(a133.length === 1 && a133[0].tipo === "estado" && a133[0].estado === "Cotizando", "OP-133: solo pasa a Cotizando");
assert(avisos.some((x) => x.op === "OP-133" && x.texto === "sin categoría"), "avisa que no tiene categoría");

// 5. Pedido con artículo → línea Cargada con su artículo + Aceptado
const a126 = de("OP-126");
const l126 = a126.find((a) => a.tipo === "crear_linea");
assert(!!l126 && l126.tipo === "crear_linea" && l126.linea.estado === "Cargada" && l126.linea.itemId === "recITEM" && l126.linea.precioUnitario === 130, "OP-126: línea Cargada con su artículo a $130");
assert(a126.some((a) => a.tipo === "estado" && a.estado === "Aceptado"), "OP-126 queda Aceptado");

// 6. Lo que no se toca
assert(de("OP-200").length === 0, "con orden: no (10A-0)");
assert(de("OP-137").length === 0, "ya en el modelo nuevo: no");
assert(de("OP-046").length === 0, "rechazado: historia");
assert(de("OP-210").length === 0 && avisos.some((x) => x.op === "OP-210"), "aceptado sin opción elegida: no se toca y avisa");

// 7. Idempotente: con sus líneas ya creadas no hay nada que hacer
const otra = planMigracionAbiertos({ operaciones: [op("127", "Cotizando", { lineaIds: ["l1"], opcionIds: ["o1"] })], opciones: OPCIONES });
assert(otra.acciones.length === 0, "segunda pasada: 0 acciones");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
