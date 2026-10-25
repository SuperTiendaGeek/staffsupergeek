/**
 * Escritura del Kardex contra un Airtable simulado (punto 12).
 * Ejecutar: npm test kardex-registro
 */
process.env.AIRTABLE_API_KEY = "test";
process.env.AIRTABLE_BASE_ID = "appTEST";

type Rec = { id: string; createdTime: string; fields: Record<string, unknown> };
const tablas = new Map<string, Rec[]>();
let siguiente = 1;
let posts = 0;
let fallarEscritura = false;
function tabla(nombre: string) {
  if (!tablas.has(nombre)) tablas.set(nombre, []);
  return tablas.get(nombre)!;
}
function coincide(rec: Rec, formula: string | null) {
  if (!formula) return true;
  const pares = [...formula.matchAll(/(?:\{([^}]+)\}|RECORD_ID\(\))='((?:[^'\\]|\\.)*)'/g)];
  return pares.some(([, campo, valor]) => (campo ? String(rec.fields[campo] ?? "") : rec.id) === valor.replace(/\\'/g, "'"));
}
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const nombre = decodeURIComponent(url.pathname.split("/")[3] ?? "");
  const t = tabla(nombre);
  if (!init?.method || init.method === "GET") {
    const records = t.filter((r) => coincide(r, url.searchParams.get("filterByFormula")));
    return new Response(JSON.stringify({ records }), { status: 200 });
  }
  if (init.method === "POST") {
    if (fallarEscritura) return new Response("boom", { status: 422 });
    posts++;
    const body = JSON.parse(String(init.body));
    const creados = body.records.map((r: { fields: Record<string, unknown> }) => {
      const rec = { id: `rec${String(siguiente++).padStart(14, "0")}`, createdTime: new Date().toISOString(), fields: r.fields };
      t.push(rec);
      return rec;
    });
    return new Response(JSON.stringify({ records: creados }), { status: 200 });
  }
  return new Response("no soportado", { status: 400 });
}) as typeof fetch;

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}

async function main() {
  const { kardexAjustarCostos, kardexConciliar, kardexDocumento, kardexMovimientos, kardexPorCambio, leerMovimientosDeRegistros, registrarMovimientosKardex } = await import("../kardex-registro");
  const { crearMovimiento, registroDeCampos, saldosPorRegistro } = await import("../kardex");

  const item = (id: string, f: Record<string, unknown>) => tabla("Shipping Items").push({ id, createdTime: "", fields: f });
  item("recCABLE00000001", { SKU: "CAB-000010", "Nombre del item": "Cable USB-C", "Categoría": "Cable", Recibido: true, Cantidad: 10, "Estado Item": "Disponible", "Costo proveedor": 2, "Costo total unidad": 2.3, "Costo flete asignado": 0.3 });
  const cable = "recCABLE00000001";

  // Recepción: entran 10.
  await kardexPorCambio({ itemId: cable, antes: { Recibido: false, Cantidad: 10 }, motivo: "Compra recibida", clave: "recepcion|cable|1", contexto: { contraparte: "JIM" } });
  let movs = await leerMovimientosDeRegistros([cable]);
  assert(movs.length === 1 && movs[0].cantidad === 10 && movs[0].valor === 23 && movs[0].contraparte === "JIM", "Recibir 10 cables a $2,30: +10 / $23");

  // La misma clave otra vez no duplica.
  await kardexPorCambio({ itemId: cable, antes: { Recibido: false, Cantidad: 10 }, motivo: "Compra recibida", clave: "recepcion|cable|1" });
  movs = await leerMovimientosDeRegistros([cable]);
  assert(movs.length === 1, "Un reintento con la misma clave no duplica el movimiento");

  // Venta con recibo de 2 (el inventario ya se descontó).
  tabla("Shipping Items")[0].fields.Cantidad = 8;
  tabla("Recibos").push({ id: "recRECIBO0000001", createdTime: "", fields: { "Número": "REC-000061", "Cliente Nombre": "Carlos Vega" } });
  await kardexDocumento({ tipo: "venta-recibo", documentoId: "recRECIBO0000001", lineas: [{ itemId: cable, cantidad: 2, precio: 5 }] });
  await kardexDocumento({ tipo: "venta-recibo", documentoId: "recRECIBO0000001", lineas: [{ itemId: cable, cantidad: 2, precio: 5 }] });
  movs = await leerMovimientosDeRegistros([cable]);
  const venta = movs.find((m) => m.motivo === "Venta con recibo");
  assert(movs.length === 2 && venta?.cantidad === -2 && venta.documento === "Recibo REC-000061" && venta.contraparte === "Carlos Vega" && venta.precioVenta === 5, "Venta con recibo: −2, número, cliente y precio; el reintento no duplica");
  assert(saldosPorRegistro(movs).get(cable)?.cantidad === 8, "El libro dice 8, igual que el inventario");

  // Llega el flete: el costo sube $0,20 por unidad → ajuste sobre las 8 que quedan.
  Object.assign(tabla("Shipping Items")[0].fields, { "Costo flete asignado": 0.5, "Costo total unidad": 2.5 });
  const ajustes = await kardexAjustarCostos([cable], { documentoTipo: "Caja" });
  movs = await leerMovimientosDeRegistros([cable]);
  const aj = movs.find((m) => m.motivo === "Ajuste de costo");
  assert(ajustes === 1 && aj?.valor === 1.6 && aj.cantidad === 0 && aj.nota.startsWith("flete"), "Ajuste de costo: +$0,20 × 8 = +$1,60, explicado como flete");
  assert(await kardexAjustarCostos([cable]) === 0, "Sin cambio de costo, la revisión diaria no escribe nada");

  // Cuadre: hay 7 en la tienda y el Administrador dice que 1 se usó en la tienda.
  tabla("Shipping Items")[0].fields.Cantidad = 7;
  await kardexConciliar({ itemId: cable, motivoSube: "Encontrada", motivoBaja: "Salida interna", clave: "cuadre|cable|1" });
  movs = await leerMovimientosDeRegistros([cable]);
  const interna = movs.find((m) => m.motivo === "Salida interna");
  assert(interna?.cantidad === -1 && saldosPorRegistro(movs).get(cable)?.cantidad === 7, "Conciliar: −1 Salida interna y el libro queda en 7");
  assert(await kardexConciliar({ itemId: cable, motivoSube: "Encontrada", motivoBaja: "Salida interna", clave: "cuadre|cable|2" }) === 0, "Si el libro ya cuadra, conciliar no escribe nada");

  // Separar / trasladar: dos renglones en una llamada.
  item("recCABLE00000002", { SKU: "CAB-000010", "Nombre del item": "Cable USB-C", "Categoría": "Cable", Recibido: true, Cantidad: 1, "Estado Item": "Disponible", "Costo total unidad": 2.5 });
  await kardexMovimientos([
    { itemId: cable, motivo: "Separación de unidad", cantidad: -1, clave: "sep|1|sale" },
    { itemId: "recCABLE00000002", motivo: "Separación de unidad", cantidad: 1, clave: "sep|1|entra" },
  ]);
  const ambos = await leerMovimientosDeRegistros([cable, "recCABLE00000002"]);
  assert(ambos.filter((m) => m.tipo === "Traslado").length === 2, "Separar: un traslado que sale y otro que entra");

  // Si Airtable falla, el Kardex no rompe la operación.
  fallarEscritura = true;
  const antes = posts;
  const r = await registrarMovimientosKardex([crearMovimiento({ clave: "falla|1", motivo: "Dada de baja", cantidad: -1, registro: registroDeCampos(cable, tabla("Shipping Items")[0].fields) })]);
  assert(r === 0 && posts === antes, "Un error al escribir no lanza: devuelve 0 y la revisión diaria lo detecta");
  fallarEscritura = false;

  // Apagado (pruebas de otros módulos).
  process.env.SHIPPING_KARDEX_OFF = "1";
  assert(await registrarMovimientosKardex([crearMovimiento({ clave: "off|1", motivo: "Dada de baja", cantidad: -1, registro: registroDeCampos(cable, tabla("Shipping Items")[0].fields) })]) === 0, "SHIPPING_KARDEX_OFF=1 apaga la escritura");
  delete process.env.SHIPPING_KARDEX_OFF;

  if (fallos > 0) {
    console.error(`Fallaron ${fallos} comprobaciones.`);
    process.exit(1);
  }
  console.log("Kardex (escritura): OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
