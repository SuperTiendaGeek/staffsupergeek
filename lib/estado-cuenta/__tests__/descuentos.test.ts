/**
 * Test — descuentos por línea de la cuenta (auditoría ops, punto 4B).
 * Ejecutar: npm test descuentos
 *
 * Caso real OR000423: el SSD REP-000017 ($40) se facturó a $20 y el −$20 se
 * anotó como un "servicio" de costo negativo. Ahora es un descuento de $20
 * sobre la línea del SSD: el total no cambia, pero queda bien registrado y
 * la factura lo lleva en la columna "Descuento".
 */
import {
  cargosDescontables, descripcionDescuento, descuentoDesdeCampos, descuentoPorCargo,
  montoDesdePorcentaje, validarAnulacion, validarDescuento, type CargoDescontable,
} from "../descuentos";
import { calcularEstadoCuenta } from "../reglas";
import fs from "fs";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const ssd: CargoDescontable = { id: "recSSD", tipo: "Repuesto", nombre: "SSD 120GB", precio: 40 };
const ok = { esAdmin: true, cargo: ssd, monto: 20, motivo: "Precio acordado con el cliente", descuentos: [], hayDocumentoVigente: false };

// 1. Validación.
assert(validarDescuento(ok) === null, "admin, línea cargada, monto y motivo → se puede");
assert(validarDescuento({ ...ok, esAdmin: false })?.includes("administrador") === true, "solo el administrador");
assert(validarDescuento({ ...ok, cargo: null })?.includes("presupuesto") === true, "lo aprobado sin artículo no se descuenta: se ajusta en el presupuesto");
assert(validarDescuento({ ...ok, hayDocumentoVigente: true })?.includes("anula primero") === true, "con documento vigente no se toca la cuenta");
assert(validarDescuento({ ...ok, monto: 0 }) !== null, "monto $0 no");
assert(validarDescuento({ ...ok, monto: 40.01 })?.includes("$40.00") === true, "nunca más que el precio de la línea");
assert(validarDescuento({ ...ok, monto: 40 }) === null, "puede ser el 100 % de la línea (sin tope)");
assert(validarDescuento({ ...ok, motivo: "  " })?.includes("motivo") === true, "motivo obligatorio");
assert(validarDescuento({ ...ok, descuentos: [{ estado: "Vigente", cargoId: "recSSD" }] })?.includes("ya tiene") === true, "un descuento vigente por línea");
assert(validarDescuento({ ...ok, descuentos: [{ estado: "Anulado", cargoId: "recSSD" }] }) === null, "uno anulado no impide dar otro");

assert(validarAnulacion({ esAdmin: true, descuento: { estado: "Vigente" }, hayDocumentoVigente: false }) === null, "quitar un descuento vigente");
assert(validarAnulacion({ esAdmin: false, descuento: { estado: "Vigente" }, hayDocumentoVigente: false }) !== null, "quitar: solo admin");
assert(validarAnulacion({ esAdmin: true, descuento: { estado: "Anulado" }, hayDocumentoVigente: false }) !== null, "no se quita dos veces");
assert(validarAnulacion({ esAdmin: true, descuento: { estado: "Vigente" }, hayDocumentoVigente: true }) !== null, "quitar: tampoco con documento vigente");

// 2. Porcentaje y textos.
assert(montoDesdePorcentaje(40, 10) === 4 && montoDesdePorcentaje(19.99, 15) === 3, "10 % de $40 = $4; 15 % de $19.99 = $3.00");
assert(descripcionDescuento(20, "SSD 120GB", "OR000423") === "−$20.00 · SSD 120GB · OR000423", "descripción legible para Airtable");

// 3. Qué líneas se pueden descontar.
{
  const c = cargosDescontables({
    items: [{ id: "recSSD", nombre: "SSD", precio: 40 }],
    servicios: [{ id: "recS", nombre: "Limpieza", costo: 25 }, { id: "recNEG", nombre: "Descuento viejo", costo: -20 }],
    productosDigitales: [{ id: "recD", nombre: "Office", precioVenta: 30 }],
    repuestosHistoricos: [{ id: "recH", nombre: "Pantalla", subtotal: 80 }],
    repuestosHistoricosCuentanParaTotal: true,
  });
  assert(c.map((x) => x.id).join() === "recSSD,recS,recD,recH", "artículos, servicios, digitales e históricos; nunca un cargo negativo");
}

// 4. La calculadora resta solo descuentos vigentes de cargos que siguen en la cuenta.
{
  const base = {
    servicios: 70, productosDigitales: 0, repuestosHistoricos: 0,
    items: [{ id: "recSSD", precio: 40 }], aprobadoSinArticulo: [],
    cargosExistentes: new Set(["recSSD", "recS1"]),
  };
  const c = calcularEstadoCuenta({
    cargos: {
      ...base,
      descuentos: [
        { cargoId: "recSSD", monto: 20, estado: "Vigente" },
        { cargoId: "recSSD", monto: 5, estado: "Vigente" }, // repetido: solo uno por línea
        { cargoId: "recS1", monto: 10, estado: "Anulado" },
        { cargoId: "recBORRADO", monto: 15, estado: "Vigente" }, // su cargo ya no está
      ],
    },
    abonos: [{ id: "a", monto: 90, estado: "Registrado" }],
  });
  assert(c.totalDescuentos === 20, `solo cuenta el descuento vigente del SSD ($20) — vino ${c.totalDescuentos}`);
  assert(c.totalCuenta === 90 && c.estadoPago === "pagado", "OR000423: $110 − $20 = $90, pagado con $90");
}

// 5. Lectura desde Airtable.
{
  const d = descuentoDesdeCampos("recDSC", {
    "Cargo ID": "recSSD", "Tipo de cargo": { name: "Repuesto" }, "Cargo": "SSD", "Precio del cargo": 40,
    "Monto": 20, "Motivo": "x", "Estado": { name: "Vigente" }, "Autorizado por": "Alex", "Fecha": "2026-10-27T20:00:00.000Z",
  });
  assert(d.estado === "Vigente" && d.tipoCargo === "Repuesto" && d.monto === 20 && d.cargoId === "recSSD", "se lee bien (los select llegan como objeto o texto)");
  assert(descuentoPorCargo([d]).get("recSSD")?.id === "recDSC", "descuento por cargo");
  assert(descuentoDesdeCampos("x", {}).estado === "Anulado", "sin estado no resta (seguro por defecto)");
}

// 6. Escritura solo desde el servidor y solo administrador.
{
  const ruta = fs.readFileSync("lib/estado-cuenta/descuentos-ruta.ts", "utf8");
  const serv = fs.readFileSync("lib/estado-cuenta/descuentos-servidor.ts", "utf8");
  assert(ruta.includes("isAdministratorRole(session.user.rol)"), "las rutas toman el rol de la sesión (no del navegador)");
  assert(serv.includes('if (!input.usuario.esAdmin) return { ok: false, error: "Solo el administrador puede dar descuentos.", status: 403 }'), "dar descuento: 403 si no es administrador");
  assert(serv.includes("buscarDocumentoBloqueante(") && serv.includes("status: 503"), "si no se puede leer la cuenta o el documento, no se escribe (falla cerrado)");
  assert(serv.includes('"Estado": "Anulado"') && !serv.includes('method: "DELETE"'), "quitar = anular; nunca se borra un descuento");
  for (const r of [
    "app/api/tecnicos/ordenes/[id]/descuentos/route.ts",
    "app/api/tecnicos/ordenes/[id]/descuentos/[descuentoId]/route.ts",
    "app/api/operaciones/[id]/descuentos/route.ts",
    "app/api/operaciones/[id]/descuentos/[descuentoId]/route.ts",
  ]) {
    const src = fs.readFileSync(r, "utf8");
    assert(/require(Tecnicos|Operaciones)Session\(\)/.test(src), `${r}: exige sesión del módulo`);
  }
}

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
