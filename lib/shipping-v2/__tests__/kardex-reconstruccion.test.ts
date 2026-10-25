/**
 * Reconstrucción de la historia del Kardex (punto 12).
 * Ejecutar: npm test kardex-reconstruccion
 */
import { crearMovimiento, registroDeCampos, saldosPorRegistro } from "../kardex";
import { reconstruirKardex, type FuentesReconstruccion } from "../kardex-reconstruccion";

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}

const base = (id: string, x: Record<string, unknown>) => ({
  id, createdTime: "2026-09-01T15:00:00.000Z",
  fields: { SKU: "LAP-000500", "Nombre del item": "Dell", "Categoría": "Laptop", Recibido: true, "Estado Item": "Disponible", Cantidad: 1, "Costo total unidad": 231, "Tipo de operación": "Compra a proveedor", ...x },
});

function fuentes(x: Partial<FuentesReconstruccion>): FuentesReconstruccion {
  return { items: [], facturas: [], recibos: [], notas: [], intervenciones: [], eventos: [], packings: [], proveedores: [], existentes: [], ...x };
}

// 1) Compra de 3 cables, 1 vendida con factura, 1 dada de baja (historial), 1 en la tienda.
const cable = base("recCABLE", {
  SKU: "CAB-000010", "Categoría": "Cable", Cantidad: 1, "Unidades compradas": 3, "Costo total unidad": 2.5, Factura: ["recFAC"], "Unidades dadas de baja": 1,
  "Proveedor de compra": ["recPROV"], "Shipping Packings": ["recCAJA"],
});
const fuentes1 = fuentes({
  items: [cable],
  proveedores: [{ id: "recPROV", fields: { "Nombre proveedor": "JIM" } }],
  packings: [{ id: "recCAJA", fields: { "Fecha de recepción": "2026-09-05T15:00:00.000Z" } }],
  facturas: [{ id: "recFAC", createdTime: "2026-09-10T17:00:00.000Z", fields: {
    Estado: "AUTORIZADO", Ambiente: "PRODUCCIÓN", "Número de Factura": "001-002-000000700", "Cliente - Nombre": "ANA", "Fecha de Emisión": "2026-09-10",
    "Líneas JSON": JSON.stringify({ detalles: [{ tipo: "producto", shippingItemId: "recCABLE", cantidad: 1, precioTotalSinImpuesto: 5 }] }),
  } }],
  eventos: [{ id: "recEV", createdTime: "", fields: { "Item relacionado": ["recCABLE"], "Descripción del evento": "Mercadería dada de baja: 1 de 2 unidad(es). Motivo: Se rompió el conector", "Fecha del evento": "2026-09-20T10:00:00.000Z", "Registrado por": "Alexis" } }],
});
const r1 = reconstruirKardex(fuentes1);
const m1 = r1.nuevos;
const entrada = m1.find((m) => m.motivo === "Compra recibida");
assert(entrada?.cantidad === 3 && entrada.fecha === "2026-09-05T15:00:00.000Z" && entrada.contraparte === "JIM", "Entrada: las 3 compradas, el día que llegó su caja, de JIM");
assert(m1.some((m) => m.motivo === "Venta con factura" && m.cantidad === -1 && m.precioVenta === 5 && m.contraparte === "ANA"), "Venta con factura con precio y cliente");
const baja = m1.find((m) => m.motivo === "Dada de baja");
assert(baja?.cantidad === -1 && baja.causa === "Daño" && baja.nota === "Se rompió el conector", "Baja del historial con su causa y motivo");
assert(r1.noCuadran.length === 0 && saldosPorRegistro(m1).get("recCABLE")?.cantidad === 1, "El libro queda en 1, igual que la tienda");
assert(m1.every((m) => m.origen === "Reconstrucción"), "Todo marcado como reconstruido");

// 2) Sin "Unidades compradas" (migrado): Saldo inicial con lo que hay.
const migrado = base("recMIG", { SKU: "OTR-000100", Cantidad: 4, "Tipo de operación": "Reajuste de inventario" });
const r2 = reconstruirKardex(fuentes({ items: [migrado] }));
assert(r2.nuevos.length === 1 && r2.nuevos[0].motivo === "Saldo inicial" && r2.nuevos[0].cantidad === 4, "Migrado sin compra: Saldo inicial de 4");

// 3) Lo que viene en camino no entra.
const camino = base("recCAM", { Recibido: false, Cantidad: 2, "Unidades compradas": 2 });
assert(reconstruirKardex(fuentes({ items: [camino] })).nuevos.length === 0, "En camino: sin movimientos (decisión 1)");

// 4) Vendida fuera del sistema (cuadre 10c-4): sale con la fecha del cuadre.
const lap16 = base("recL16", { SKU: "LAP-000016", Cantidad: 0, "Estado Item": "Vendido", "Unidades compradas": 1, "Vendidas fuera del sistema": 1 });
const r4 = reconstruirKardex(fuentes({
  items: [lap16],
  eventos: [{ id: "e", createdTime: "", fields: { "Item relacionado": ["recL16"], "Descripción del evento": "Cuadre de unidades (Control → Revisión): Vendida fuera del sistema: 1. Motivo: Sistema anterior 001-002-000001342", "Fecha del evento": "2026-10-22T12:00:00.000Z", "Registrado por": "Alexis" } }],
}));
assert(r4.nuevos.some((m) => m.motivo === "Vendida fuera del sistema" && m.cantidad === -1 && m.fecha === "2026-10-22T12:00:00.000Z" && m.nota.includes("Sistema anterior")), "Vendida fuera del sistema con la fecha y el motivo del cuadre");
assert(r4.noCuadran.length === 0, "LAP-000016 cuadra después del cuadre");

// 5) Una venta de más (LAP-000062): no se inventa nada, queda a la vista.
const lap62 = base("recL62", { SKU: "LAP-000062", Cantidad: 0, "Estado Item": "Vendido", "Unidades compradas": 1, Factura: ["f1", "f2"] });
const fact = (id: string) => ({ id, createdTime: "2026-09-10T17:00:00.000Z", fields: { Estado: "AUTORIZADO", Ambiente: "PRODUCCIÓN", "Número de Factura": id, "Líneas JSON": JSON.stringify({ detalles: [{ tipo: "producto", shippingItemId: "recL62", cantidad: 1, precioTotalSinImpuesto: 300 }] }) } });
const r5 = reconstruirKardex(fuentes({ items: [lap62], facturas: [fact("f1"), fact("f2")] }));
assert(r5.noCuadran.length === 1 && r5.noCuadran[0].libro === -1, "Dos ventas de una laptop comprada: el libro queda en −1 y se reporta");

// 6) Unidad separada después: llega con la fecha de su registro original.
const original = base("recO", { SKU: "LAP-000076", "Fecha de registro": "2026-08-14T14:57:00.000Z" });
const separada = base("recS", { SKU: "LAP-000076", "Fecha de registro": "2026-10-18T11:44:00.000Z", "Observaciones internas": "Unidad separada de LAP-000076 (9 → 8) el 2026-10-18." });
const r6 = reconstruirKardex(fuentes({ items: [original, separada] }));
assert(r6.nuevos.find((m) => m.registroId === "recS")?.fecha === "2026-08-14T14:57:00.000Z", "La unidad separada entra el día que llegó su original");

// 7) Lo que el sistema ya registró en vivo no se repite.
const vivo = crearMovimiento({ clave: "recepcion|recCABLE|x", motivo: "Compra recibida", cantidad: 3, registro: registroDeCampos("recCABLE", cable.fields), fecha: "2026-09-05T15:00:00.000Z" });
const r7 = reconstruirKardex(fuentes({ items: [cable], existentes: [vivo] }));
assert(!r7.nuevos.some((m) => m.motivo === "Compra recibida"), "Si ya entró en vivo, la reconstrucción no agrega otra entrada");
const r8 = reconstruirKardex({ ...fuentes1, existentes: [...r1.nuevos] });
assert(r8.nuevos.length === 0, "Correrla dos veces no duplica nada");

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}
console.log("Kardex (reconstrucción): OK");
