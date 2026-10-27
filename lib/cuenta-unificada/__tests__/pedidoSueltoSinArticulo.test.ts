/**
 * Test de integración — getCuentaUnificada() de un pedido SUELTO (sin orden)
 * aprobado y pagado, cuyo artículo todavía no existe.
 * Ejecutar: npm test pedidoSueltoSinArticulo
 *
 * Caso real OP-2026-000024 (27-oct-2026): batería Dell, opción elegida $70,
 * estado "Pedido", sin "Artículo físico", $70 abonados. La cuenta sumaba solo
 * artículos → total $0, saldo −$70 → "Saldo a favor del cliente $70" (le
 * debíamos al cliente), mientras el tablero decía "Pagado". Auditoría ops,
 * punto 4: lo aprobado cuenta desde que el cliente aprueba (regla del dueño
 * para las órdenes, fase 3b), también en un pedido suelto.
 */

import { getCuentaUnificada } from "../index";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const fetchOriginal = global.fetch;

let estadoOperacion = "Pedido";
const operacion = () => ({
  id: "recOP24",
  fields: {
    "Código Operación": "OP-2026-000024",
    "Producto Solicitado": "Batería Dell Type F62G0",
    "Estado": estadoOperacion,
    "Opción Elegida": ["recOPC70"],
    "Abonos": ["recABONO70"],
  },
});
const OPCION = { id: "recOPC70", fields: { "Precio Venta Cliente": 70 } };
const ABONO = {
  id: "recABONO70",
  fields: { "ID Abono": 1, "Monto": 70, "Estado del Abono": "Registrado", "Fecha de Abono": "2026-07-01" },
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const d = decodeURIComponent(urlStr);
  if (d.includes("/Operación Comercial/recOP24")) return Promise.resolve(json(operacion()));
  if (d.includes("/Opciones")) return Promise.resolve(json({ records: d.includes("recOPC70") ? [OPCION] : [] }));
  if (d.includes("/Abonos")) return Promise.resolve(json({ records: d.includes("recABONO70") ? [ABONO] : [] }));
  if (d.includes("/Shipping Items")) return Promise.resolve(json({ records: [] }));
  throw new Error(`fetch inesperado: ${urlStr}`);
}

async function main(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000000";
  global.fetch = fakeFetch as unknown as typeof global.fetch;
  try {
    const c = await getCuentaUnificada({ operacionId: "recOP24" });
    assert(c.totalCuenta === 70, `total $70 (el precio aprobado), no $0 — vino ${c.totalCuenta}`);
    assert(c.saldo === 0, `saldo $0, no −$70 — vino ${c.saldo}`);
    assert(c.estadoPago === "pagado", `estado de pago "pagado", no "saldo a favor" — vino ${c.estadoPago}`);
    assert(c.aprobadoSinArticulo.length === 1 && c.aprobadoSinArticulo[0].id === "recOP24", "el pedido sale como aprobado sin artículo (la factura espera al artículo)");

    estadoOperacion = "Cotizado";
    const cotizado = await getCuentaUnificada({ operacionId: "recOP24" });
    assert(cotizado.totalCuenta === 0 && cotizado.estadoPago === "saldo_a_favor", "sin aprobar no hay precio: un anticipo queda como saldo a favor");
  } finally {
    global.fetch = fetchOriginal;
  }
  if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
  console.log("\nTodo OK.");
}

void main();
