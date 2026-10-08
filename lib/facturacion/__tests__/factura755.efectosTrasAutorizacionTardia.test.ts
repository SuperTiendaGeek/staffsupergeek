/**
 * Test — factura 001-002-000000755: autorizada tarde, sin descargo.
 * Ejecutar: npm test factura755
 *
 * Reproduce el bug: cuando el SRI no autorizaba dentro de la petición de
 * emisión, la fila RECIBIDA se guardaba SIN "Líneas JSON". Al autorizarse
 * después por "⟳ Consultar estado" quedaba AUTORIZADO, "Sincronización
 * Inventario" = N/A, sin líneas, sin descargo y sin ingreso — y nada en la
 * pantalla lo delataba.
 *
 * Cubre:
 *  1. registrarIntento(RECIBIDA) ahora guarda las líneas (con shippingItemId).
 *  2. serializar/leer las líneas ida y vuelta (origen, pagos, cliente).
 *  3. planificarCompletarFactura: qué falta en cada caso.
 *  4. inventarioSinProcesar: el aviso que antes no existía.
 * global.fetch reemplazado por un doble; nunca toca Airtable real.
 */

import { registrarIntento } from "../almacenamiento/repositorio";
import {
  inventarioSinProcesar,
  leerLineasFactura,
  planificarCompletarFactura,
  serializarLineasFactura,
} from "../reglas/lineasFactura";
import type { DetalleFactura } from "../types/factura";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const linea = (sku: string, item: string, precio: number): DetalleFactura => ({
  codigoPrincipal: sku, descripcion: sku, unidadMedida: "Unidad", cantidad: 1, precioUnitario: precio,
  descuento: 0, precioTotalSinImpuesto: precio,
  impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: precio, valor: Math.round(precio * 15) / 100 }],
  tipo: "producto", shippingItemId: item,
});

// La venta real de la 755: Optiplex + monitor, efectivo $260.
const detalles755 = [linea("DES-000007", "recxoodfsKnBxpSUs", 139.13), linea("MON-000003", "recTPy8Q2xhokA7gI", 86.96)];
const pagos755 = [{ formaPago: "01", total: 260 }];

const fetchOriginal = global.fetch;
const capturado: { body: { fields?: Record<string, unknown> } | null } = { body: null };
function fetchDoble(_url: string | URL, init?: RequestInit) {
  capturado.body = init?.body ? JSON.parse(String(init.body)) : null;
  return Promise.resolve({ ok: true, json: async () => ({ id: "recTEST0755" }) } as Response);
}

(async () => {
  // ── 1. La fila RECIBIDA ya lleva las líneas ─────────────────────────────
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";
  global.fetch = fetchDoble as unknown as typeof fetch;

  const lineasJson = serializarLineasFactura({ detalles: detalles755, pagos: pagos755 });
  await registrarIntento({
    claveAcceso: "0".repeat(49), numeroFactura: "001-002-000000755", secuencial: "000000755",
    estado: "RECIBIDA", fechaEmision: new Date("2026-10-05T17:45:00-05:00"), ambiente: "2",
    cliente: { nombre: "JOSE MALDONADO", identificacion: "1004735286" },
    subtotal: 226.09, iva: 33.91, total: 260, mensajesSri: [], lineasJson,
  });
  const campos = capturado.body?.fields ?? {};
  assert(campos["Estado"] === "RECIBIDA", "RECIBIDA: se registra con su estado");
  assert(typeof campos["Líneas JSON"] === "string" && (campos["Líneas JSON"] as string).includes("recxoodfsKnBxpSUs"),
    "RECIBIDA: 'Líneas JSON' se guarda YA, con el record id del Shipping Item (antes llegaba vacío)");

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  // ── 2. Ida y vuelta ─────────────────────────────────────────────────────
  const conOrigen = serializarLineasFactura({
    detalles: detalles755, pagos: [{ formaPago: "20", total: 45, origenPago: "saldo" } as never],
    origen: { tipo: "operacion", recordId: "recDCnoBHb5021Kfv" }, clienteRecordId: "rec86rDii3YN0C1vj",
  });
  const leidas = leerLineasFactura(conOrigen);
  assert(!!leidas && leidas.version === 3, "leer: versión 3");
  assert(leidas?.detalles.length === 2 && leidas.detalles[0].shippingItemId === "recxoodfsKnBxpSUs", "leer: detalles con shippingItemId");
  assert(leidas?.origen?.tipo === "operacion" && leidas.origen.recordId === "recDCnoBHb5021Kfv", "leer: origen intacto");
  assert(leidas?.clienteRecordId === "rec86rDii3YN0C1vj", "leer: clienteRecordId (antes se perdía)");
  assert(leidas?.pagos[0].total === 45, "leer: pagos completos");
  assert(leerLineasFactura("") === null, "leer: vacío → null");
  assert(leerLineasFactura("{roto") === null, "leer: JSON roto → null, sin lanzar");
  assert(leerLineasFactura("[1,2]") === null, "leer: array suelto (legacy) → null");
  assert(leerLineasFactura(JSON.stringify({ version: 3, lineas: [] })) === null, "leer: borrador (lineas, no detalles) → null");

  // ── 3. Plan ─────────────────────────────────────────────────────────────
  // `ahora` 10 minutos después de armar las líneas: la emisión ya terminó.
  const despues = new Date(Date.now() + 10 * 60_000);
  const base = { estado: "AUTORIZADO", ambiente: "PRODUCCIÓN", sincronizacionInventario: "N/A" as const, movimientosFinancierosIds: [] as string[], ahora: despues };

  // Mientras la propia emisión pueda seguir viva, otro camino NO descarga
  // (se descontaría dos veces: ambos leen el stock antes de que el otro escriba).
  const pCurso = planificarCompletarFactura({ ...base, ahora: new Date(), lineas: leerLineasFactura(lineasJson) });
  assert(pCurso.accion === "en-curso", "Recién emitida (< 100 s): 'en-curso', no descarga en paralelo con la emisión");
  assert(typeof leerLineasFactura(lineasJson)?.preparadaEn === "string", "Las líneas guardan cuándo se armaron (preparadaEn)");

  // El caso real de la 755 antes del arreglo: sin líneas.
  const p755 = planificarCompletarFactura({ ...base, lineas: null });
  assert(p755.accion === "sin-lineas", "755 tal como quedó (sin líneas): se marca para regularizar a mano, no se calla");

  // Con el arreglo: la fila trae líneas → se completa todo.
  const pOk = planificarCompletarFactura({ ...base, lineas: leerLineasFactura(lineasJson) });
  assert(pOk.accion === "completar" && pOk.inventario && pOk.finanzas, "Con líneas: descargo + ingreso en Finanzas");

  // Ya completa: nada que hacer (idempotencia).
  const pNada = planificarCompletarFactura({ ...base, sincronizacionInventario: "OK", movimientosFinancierosIds: ["recMOV"], lineas: leerLineasFactura(lineasJson) });
  assert(pNada.accion === "nada", "Inventario OK y con movimiento: no repite nada");

  // Finanzas ya registrado pero inventario no: solo inventario.
  const pInv = planificarCompletarFactura({ ...base, sincronizacionInventario: "ERROR", movimientosFinancierosIds: ["recMOV"], lineas: leerLineasFactura(lineasJson) });
  assert(pInv.accion === "completar" && pInv.inventario && !pInv.finanzas, "ERROR de inventario con ingreso ya hecho: reintenta solo el inventario");

  // Operación sin vínculo (caso 746): hay que vincular.
  const p746 = planificarCompletarFactura({ ...base, sincronizacionInventario: "OK", movimientosFinancierosIds: ["recMOV"], lineas: leidas,
    vinculos: { orden: [], operacion: [], cliente: [] } });
  assert(p746.accion === "completar" && p746.vincularOrigen, "746: factura de operación sin vínculo → se vincula (cierra la puerta a facturarla dos veces)");
  const p746b = planificarCompletarFactura({ ...base, sincronizacionInventario: "OK", movimientosFinancierosIds: ["recMOV"], lineas: leidas,
    vinculos: { orden: [], operacion: ["recDCnoBHb5021Kfv"], cliente: ["rec86rDii3YN0C1vj"] } });
  assert(p746b.accion === "nada", "746 ya vinculada: nada");

  // Pruebas: nunca toca inventario ni Finanzas.
  assert(planificarCompletarFactura({ ...base, ambiente: "PRUEBAS", lineas: leerLineasFactura(lineasJson) }).accion === "nada", "PRUEBAS: nada");
  // No autorizada: nada.
  assert(planificarCompletarFactura({ ...base, estado: "RECIBIDA", lineas: leerLineasFactura(lineasJson) }).accion === "nada", "RECIBIDA: nada todavía");

  // Líneas reconstruidas desde el XML (recuperar): describen la venta pero no
  // sirven para descargar → a mano, y que se vea.
  const desdeXml = JSON.stringify({ version: 2, fuente: "xml-sri", detalles: [{ codigoPrincipal: "DES-000007", descripcion: "Optiplex", cantidad: 1, precioUnitario: 139.13, descuento: 0, precioTotalSinImpuesto: 139.13, impuestos: [] }], formaPago: "01" });
  const pXml = planificarCompletarFactura({ ...base, lineas: leerLineasFactura(desdeXml) });
  assert(pXml.accion === "sin-lineas" && pXml.motivo.includes("DES-000007"), "Líneas desde el XML: no se marcan OK en silencio; piden descargo manual con el SKU");

  // ── 4. Aviso en el historial ────────────────────────────────────────────
  assert(inventarioSinProcesar({ estado: "AUTORIZADO", ambiente: "PRODUCCIÓN", sincronizacionInventario: "N/A" }), "AUTORIZADO + N/A en producción → aviso 'sin procesar'");
  assert(!inventarioSinProcesar({ estado: "AUTORIZADO", ambiente: "PRODUCCIÓN", sincronizacionInventario: "OK" }), "OK → sin aviso");
  assert(!inventarioSinProcesar({ estado: "AUTORIZADO", ambiente: "PRUEBAS", sincronizacionInventario: "N/A" }), "PRUEBAS → sin aviso");
  assert(!inventarioSinProcesar({ estado: "RECIBIDA", ambiente: "PRODUCCIÓN", sincronizacionInventario: "N/A" }), "RECIBIDA → sin aviso (todavía no hay venta autorizada)");

  if (fallos > 0) {
    console.error(`\n❌ factura755.efectosTrasAutorizacionTardia.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ factura755.efectosTrasAutorizacionTardia.test.ts — todos los asserts pasaron");
})();
