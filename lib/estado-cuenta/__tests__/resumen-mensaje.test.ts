/**
 * Test — resumen de la cuenta para el mensaje de WhatsApp (auditoría ops, punto 4C).
 * Ejecutar: npm test resumen-mensaje
 */
import fs from "fs";
import { presupuestoPorConfirmar, resumenCuentaParaMensaje, type CuentaParaResumen } from "../resumen-mensaje";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const vacia: CuentaParaResumen = {
  items: [], servicios: [], productosDigitales: [], repuestosHistoricos: [], repuestosHistoricosCuentanParaTotal: true,
  aprobadoSinArticulo: [], descuentos: [], totalCuenta: 0, totalAbonado: 0, saldo: 0, estadoPago: "sin_cargos",
};

// 1. OR000423-like: servicio + SSD con descuento + RAM, todo pagado.
{
  const r = resumenCuentaParaMensaje({
    ...vacia,
    servicios: [{ id: "s1", nombre: "Limpieza y cambio de pasta térmica", costo: 40 }],
    items: [{ id: "ssd", nombre: "SSD 120GB", precio: 40 }, { id: "ram", nombre: "RAM 8GB", precio: 30 }],
    descuentos: [{ cargoId: "ssd", monto: 20, estado: "Vigente" }, { cargoId: "ram", monto: 5, estado: "Anulado" }],
    totalCuenta: 90, totalAbonado: 90, saldo: 0, estadoPago: "pagado",
  });
  assert(r.startsWith("Estado de pago: Pagado\nCargos:\n"), "empieza con el estado de pago y los cargos");
  assert(r.includes("• SSD 120GB: $40.00 − descuento $20.00 = $20.00"), "el descuento se ve en su línea");
  assert(r.includes("• RAM 8GB: $30.00") && !r.includes("$5.00"), "un descuento anulado no aparece");
  assert(r.includes("Total: $90.00") && r.includes("Pagado: $90.00") && r.includes("Cuenta pagada en su totalidad."), "totales y cuenta pagada");
  assert(!r.includes("Saldo pendiente"), "sin saldo no se menciona saldo");
}

// 2. OR000523-like: servicios, Windows aprobado sin código, sin pagos, y presupuesto por confirmar.
{
  const r = resumenCuentaParaMensaje(
    {
      ...vacia,
      servicios: [{ id: "a", nombre: "Limpieza", costo: 35 }, { id: "b", nombre: "Formateo", costo: 10 }, { id: "c", nombre: "Respaldo", costo: 15 }, { id: "neg", nombre: "Ajuste", costo: -5 }],
      aprobadoSinArticulo: [{ id: "w", nombre: "Microsoft Windows 11 Pro", monto: 25 }],
      totalCuenta: 85, totalAbonado: 0, saldo: 85, estadoPago: "sin_pago",
    },
    presupuestoPorConfirmar([
      { estado: "Propuesta", cantidad: 1, precioUnitario: 60 },
      { estado: "Propuesta", cantidad: 1, precioUnitario: 120, grupoAlternativas: "pantalla" },
      { estado: "Propuesta", cantidad: 1, precioUnitario: 90, grupoAlternativas: "pantalla" },
      { estado: "Aprobada", cantidad: 1, precioUnitario: 25 },
    ]),
  );
  assert(r.includes("• Microsoft Windows 11 Pro: $25.00 (aprobado, en espera)"), "lo aprobado sin artículo se aclara");
  assert(!r.includes("Ajuste"), "nunca se muestran cargos en $0 o negativos");
  assert(r.includes("Saldo pendiente: $85.00") && !r.includes("Pagado:"), "saldo pendiente; sin pagos no hay línea 'Pagado'");
  assert(r.endsWith("Presupuesto por confirmar: 2 ítems desde $150.00"), "por confirmar: la suelta + la alternativa más barata ($60 + $90), 'desde'");
}

// 3. Casos borde.
assert(resumenCuentaParaMensaje(vacia) === "Sin cargos ni pagos registrados.", "cuenta vacía");
{
  const r = resumenCuentaParaMensaje({ ...vacia, totalAbonado: 100, saldo: -100, estadoPago: "saldo_a_favor" });
  assert(r.includes("Pagado: $100.00") && r.includes("Saldo a favor del cliente: $100.00") && !r.includes("Cargos:"), "anticipo sin cargos");
}
{
  const r = resumenCuentaParaMensaje(vacia, presupuestoPorConfirmar([{ estado: "Propuesta", cantidad: 2, precioUnitario: 30 }]));
  assert(r === "Presupuesto por confirmar: 1 ítem por $60.00", "solo presupuesto propuesto");
}

// 4. La ruta exige sesión y escribe el resumen en el mismo cambio que activa la automatización.
{
  const ruta = fs.readFileSync("app/api/tecnicos/historial/[id]/generar-mensaje/route.ts", "utf8");
  assert(ruta.includes("await requireTecnicosSession()"), "la ruta 'Generar mensaje' exige sesión");
  const at = fs.readFileSync("lib/tecnicos/airtable/index.ts", "utf8");
  assert(at.includes('"Resumen de cuenta (sistema)": resumenCuenta'), "el resumen viaja en el mismo PATCH que 'Solicitar Mensaje Cliente'");
}

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
