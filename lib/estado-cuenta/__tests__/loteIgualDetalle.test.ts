/**
 * Test — las dos formas de leer la cuenta dan LA MISMA cifra (auditoría ops,
 * punto 4).
 *   · detallada: getCuentaUnificada() (pantalla de la orden, emisión);
 *   · en bloque: estadosDeCuentaDeOrdenes() / estadosDeCuentaDeOperaciones()
 *     (panel de Cobros, tablero de Operaciones).
 * Ejecutar: npm test loteIgualDetalle
 *
 * Una orden con TODO a la vez: servicio, repuesto histórico, producto
 * digital, repuesto de stock, un pedido con artículo de 2 unidades (el
 * artículo tiene más para stock), un pedido aprobado sin artículo enlazado a
 * mano (sin línea), una línea del presupuesto bajo pedido sin artículo, un
 * abono con los dos enlaces y un abono anulado.
 *
 * global.fetch es un doble genérico de Airtable (GET por id y listados con
 * RECORD_ID()); nunca toca la base real.
 */

import { getCuentaUnificada } from "../../cuenta-unificada";
import { estadosDeCuentaDeOrdenes, estadosDeCuentaDeOperaciones, CAMPOS_ORDEN_CUENTA } from "../airtable";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

type Rec = { id: string; fields: Record<string, unknown> };
const T: Record<string, Rec[]> = {
  "Órdenes de Reparación": [{
    id: "recORDEN0000000001",
    fields: {
      "ID": "OR000900",
      "Modo repuestos": "V2",
      "Costo Total Servicios NV": 25,
      "Total Productos Digitales": 30,
      "Costo Total Repuestos NV": 10,
      // Lo que leía el panel de Cobros: 25 + 10 + 30 + 45 (stock) + 30 (el
      // artículo del pedido, UNA vez) = 140. Le faltaban la segunda unidad y
      // lo aprobado sin artículo.
      "Total a Pagar NV": 140,
      "Repuestos de Stock (V2)": ["recSTOCK000000001"],
      "Operaciones Comerciales": ["recOPCONART000001", "recOPMANUAL000001", "recOPLINEA0000001"],
      "Abonos (Operación)": ["recABONODUAL00001", "recABONOANUL00001"],
      "Presupuesto por Orden": ["recLINEA000000001"],
      "Servicios por Orden": ["recSERV0000000001"],
      "Productos Digitales": ["recDIGI0000000001"],
      "Repuestos por Orden": ["recLEGACY00000001"],
      "Descuentos de Cuenta": ["recDESC0000000001", "recDESCANULADO001"],
    },
  }],
  "Operación Comercial": [
    { id: "recOPCONART000001", fields: { "Código Operación": "OP-1", "Producto Solicitado": "SSD", "Estado": "Pedido", "Orden de Reparación": ["recORDEN0000000001"], "Opción Elegida": ["recOPCION2UNID001"], "Artículo físico": ["recARTPEDIDO00001"], "Abonos": ["recABONODUAL00001"] } },
    { id: "recOPMANUAL000001", fields: { "Código Operación": "OP-2", "Producto Solicitado": "Teclado", "Estado": "Aprobado", "Orden de Reparación": ["recORDEN0000000001"], "Opción Elegida": ["recOPCION40000001"] } },
    { id: "recOPLINEA0000001", fields: { "Código Operación": "OP-3", "Producto Solicitado": "Pantalla", "Estado": "Pedido", "Orden de Reparación": ["recORDEN0000000001"], "Opción Elegida": ["recOPCION70000001"] } },
    { id: "recOPSUELTA000024", fields: { "Código Operación": "OP-2026-000024", "Producto Solicitado": "Batería Dell", "Estado": "Pedido", "Opción Elegida": ["recOPCION70SUELTA"], "Abonos": ["recABONO70SUELTA1"] } },
  ],
  "Opciones": [
    { id: "recOPCION2UNID001", fields: { "Cantidad": 2, "Precio Venta Cliente": 60 } },
    { id: "recOPCION40000001", fields: { "Cantidad": 1, "Precio Venta Cliente": 40 } },
    { id: "recOPCION70000001", fields: { "Cantidad": 1, "Precio Venta Cliente": 70 } },
    { id: "recOPCION70SUELTA", fields: { "Cantidad": 1, "Precio Venta Cliente": 70 } },
  ],
  "Shipping Items": [
    { id: "recARTPEDIDO00001", fields: { "Nombre del item": "SSD 1TB", "Precio venta final": 30, "Cantidad": 3, "Opción origen": ["recOPCION2UNID001"] } },
    { id: "recSTOCK000000001", fields: { "Nombre del item": "Ventilador", "Precio venta final": 45 } },
  ],
  "Abonos": [
    { id: "recABONODUAL00001", fields: { "ID Abono": 1, "Monto": 100, "Estado del Abono": "Registrado", "Fecha de Abono": "2026-10-01" } },
    { id: "recABONOANUL00001", fields: { "ID Abono": 2, "Monto": 20, "Estado del Abono": "Anulado", "Fecha de Abono": "2026-10-02" } },
    { id: "recABONO70SUELTA1", fields: { "ID Abono": 3, "Monto": 70, "Estado del Abono": "Registrado", "Fecha de Abono": "2026-07-01" } },
  ],
  "Presupuesto por Orden": [
    { id: "recLINEA000000001", fields: { "Descripción": "Pantalla", "Tipo": "Repuesto", "Cantidad": 1, "Precio unitario": 70, "Estado": "Aprobada", "Operación Comercial": ["recOPLINEA0000001"], "Bajo pedido": true, "Orden de Reparación": ["recORDEN0000000001"] } },
  ],
  "Servicios por Orden": [
    { id: "recSERV0000000001", fields: { "Orden de Reparación": ["recORDEN0000000001"], "Costo real": 25 } },
  ],
  "Repuestos por Orden": [
    { id: "recLEGACY00000001", fields: { "Orden de Reparación": ["recORDEN0000000001"], "Cantidad": 1, "Precio cliente real": 10, "Subtotal cliente": 10 } },
  ],
  "Productos Digitales": [
    { id: "recDIGI0000000001", fields: { "Orden de Reparación": ["recORDEN0000000001"], "Precio Venta": 30 } },
  ],
  "Catálogo Productos Digitales": [],
  "Descuentos de Cuenta": [
    { id: "recDESC0000000001", fields: { "Cargo ID": "recSERV0000000001", "Tipo de cargo": "Servicio", "Monto": 5, "Estado": "Vigente", "Motivo": "cliente frecuente" } },
    { id: "recDESCANULADO001", fields: { "Cargo ID": "recSTOCK000000001", "Tipo de cargo": "Repuesto", "Monto": 10, "Estado": "Anulado", "Motivo": "error" } },
  ],
};

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
  const partes = u.pathname.split("/").map(decodeURIComponent);
  const tabla = partes[3];
  const id = partes[4];
  const registros = T[tabla];
  if (!registros) throw new Error(`tabla inesperada: ${tabla}`);
  if (id) {
    const r = registros.find((x) => x.id === id);
    return Promise.resolve(r ? json(r) : new Response("{}", { status: 404 }));
  }
  const formula = u.searchParams.get("filterByFormula") ?? "";
  const pedidos = [...formula.matchAll(/RECORD_ID\(\)='(rec[A-Za-z0-9]+)'/g)].map((m) => m[1]);
  return Promise.resolve(json({ records: formula ? registros.filter((r) => pedidos.includes(r.id)) : registros }));
}

async function main(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000000";
  const original = global.fetch;
  global.fetch = fakeFetch as unknown as typeof global.fetch;
  try {
    const detalle = await getCuentaUnificada({ ordenId: "recORDEN0000000001" });
    const orden = T["Órdenes de Reparación"][0];
    const campos = Object.fromEntries(CAMPOS_ORDEN_CUENTA.map((c) => [c, orden.fields[c]]));
    const bloque = (await estadosDeCuentaDeOrdenes([{ id: orden.id, fields: campos }])).get(orden.id)!;

    // Esperado: artículos 60 (2 × 30) + 45 + históricos 10 = 115; servicios 25;
    // digitales 30; aprobado sin artículo 70 (línea) + 40 (pedido manual) = 110;
    // descuento vigente de $5 sobre el servicio (el anulado no resta) → 275.
    assert(detalle.totalCuenta === 275 && detalle.totalDescuentos === 5, `detallada: total $275 con $5 de descuento — vino ${detalle.totalCuenta} / ${detalle.totalDescuentos}`);
    assert(detalle.descuentos.length === 1 && detalle.descuentos[0].cargoId === "recSERV0000000001", "la cuenta lista solo el descuento vigente");
    assert(detalle.totalAbonado === 100 && detalle.saldo === 175, `detallada: $100 abonados (el anulado no suma), saldo $175 — vino ${detalle.totalAbonado} / ${detalle.saldo}`);
    assert(detalle.estadoPago === "pago_parcial", "detallada: Pago parcial");

    for (const k of ["totalCuenta", "totalDescuentos", "totalRepuestos", "totalServicios", "totalProductosDigitales", "totalAprobadoSinArticulo", "totalAbonado", "saldo"] as const) {
      assert(bloque[k] === detalle[k], `en bloque = detallada en ${k} (${bloque[k]} vs ${detalle[k]})`);
    }
    assert(bloque.estadoPago === detalle.estadoPago, "en bloque = detallada en el estado de pago");
    assert(
      bloque.aprobadoSinArticulo.map((p) => p.id).sort().join() === detalle.aprobadoSinArticulo.map((p) => p.id).sort().join(),
      "mismas líneas aprobadas sin artículo (la del presupuesto y el pedido manual; el pedido de la línea no se cuenta dos veces)",
    );
    assert(orden.fields["Total a Pagar NV"] !== bloque.totalCuenta, "el campo viejo de Airtable ($140) no coincidía: por eso el panel de Cobros daba otra cifra");

    // Tablero: cada pedido de la orden muestra la cuenta COMPLETA; el suelto, la suya.
    const tablero = await estadosDeCuentaDeOperaciones(["recOPCONART000001", "recOPMANUAL000001", "recOPSUELTA000024"]);
    assert(tablero.get("recOPCONART000001")?.saldo === 175 && tablero.get("recOPMANUAL000001")?.saldo === 175, "los pedidos de la orden muestran el saldo de toda la cuenta ($175)");
    assert(tablero.get("recOPCONART000001")?.ordenId === "recORDEN0000000001", "se sabe que es la cuenta de la orden");
    const suelta = tablero.get("recOPSUELTA000024");
    assert(!!suelta && suelta.totalCuenta === 70 && suelta.estadoPago === "pagado" && suelta.ordenId === null, "OP-2026-000024 suelta: $70 aprobado y pagado → Pagado");
    const detalleSuelta = await getCuentaUnificada({ operacionId: "recOPSUELTA000024" });
    assert(detalleSuelta.saldo === suelta!.saldo && detalleSuelta.estadoPago === suelta!.estadoPago, "pedido suelto: en bloque = detallada");
  } finally {
    global.fetch = original;
  }
  if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
  console.log("\nTodas las pruebas pasaron.");
}

void main();
