/**
 * Punto cero del inventario 7-nov (12-nov-2026): plan del ajuste de datos.
 * Ejecutar: npm test punto-cero
 */
import { clavePuntoCero, planCorreccionesCompradas, planKardexPuntoCero, type CorteConId } from "../ajuste-punto-cero";
import { crearMovimiento, registroDeCampos, type MovimientoKardex } from "../kardex";

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}

const corte: CorteConId = { id: "recConteo", nombre: "Inventario general 7 nov", fecha: "2026-11-09T16:05:26.409Z", contados: ["recOTR28"] };
const campos = (x: Record<string, unknown>) => ({ "Recibido": true, "Estado Item": "Disponible", "Costo total unidad": 0.71, "Costo proveedor": 0.48, ...x });
const otr28 = { id: "recOTR28", fields: campos({ SKU: "OTR-000028", Cantidad: 1, "Unidades compradas": 3 }) };
const lap62 = { id: "recLAP62", fields: campos({ SKU: "LAP-000062", Cantidad: 0, "Estado Item": "Vendido", "Costo total unidad": 174, "Unidades compradas": 1 }) };
const sano = { id: "recSANO", fields: campos({ SKU: "ACC-000001", Cantidad: 4 }) };
const nuevo = { id: "recNUEVO", fields: campos({ SKU: "ACC-000300", Cantidad: 2 }) };
const r = (it: { id: string; fields: Record<string, unknown> }) => registroDeCampos(it.id, it.fields);
const mov = (clave: string, it: { id: string; fields: Record<string, unknown> }, motivo: MovimientoKardex["motivo"], cantidad: number, fecha: string) =>
  crearMovimiento({ clave, motivo, cantidad, registro: r(it), fecha });

const movimientos: MovimientoKardex[] = [
  // OTR-000028 tal como está: +3 −1 −1 antes del conteo, −1 después. Libro al corte 1, contado 2.
  mov("a1", otr28, "Compra recibida", 3, "2026-09-10T15:51:00Z"),
  mov("a2", otr28, "Venta con recibo", -1, "2026-09-18T22:57:21Z"),
  mov("a3", otr28, "Venta con factura", -1, "2026-10-14T21:02:44Z"),
  mov("a4", otr28, "Venta con factura", -1, "2026-11-10T23:40:09Z"),
  // LAP-000062: +1 −1 −2 (una laptop vendida 3 veces). Libro −2, tienda 0.
  mov("b1", lap62, "Compra recibida", 1, "2026-09-10T15:10:31Z"),
  mov("b2", lap62, "Venta con factura", -1, "2026-09-11T15:50:05Z"),
  mov("b3", lap62, "Venta con factura", -2, "2026-09-15T18:49:30Z"),
  // Sano: +5 antes, −1 después. Libro al corte 5, tienda al corte 4 + 1 = 5.
  mov("c1", sano, "Compra recibida", 5, "2026-08-01T12:00:00Z"),
  mov("c2", sano, "Venta con recibo", -1, "2026-11-10T12:00:00Z"),
  // Llegó después del conteo.
  mov("d1", nuevo, "Compra recibida", 2, "2026-11-10T12:00:00Z"),
];

const plan = planKardexPuntoCero({ corte, items: [otr28, lap62, sano, nuevo], movimientos });
const de = (id: string) => plan.movimientos.find((m) => m.registroId === id);
assert(plan.movimientos.length === 2, "Solo se ajustan los registros cuyo libro no decía lo contado (OTR-000028 y LAP-000062)");
assert(de("recOTR28")?.cantidad === 1 && de("recOTR28")?.fecha === corte.fecha, "OTR-000028: +1 con la fecha del conteo (libro 1 → contado 2)");
assert(de("recLAP62")?.cantidad === 2 && de("recLAP62")?.valor === 348, "LAP-000062: +2 (libro −2 → 0), a su costo");
assert(de("recLAP62")?.motivo === "Ajuste del Kardex", "Sin motivo conocido queda como ajuste");
{
  const conMotivo = planKardexPuntoCero({ corte, items: [lap62], movimientos, motivos: { recLAP62: { motivo: "Venta de otro artículo", nota: "Eran otras laptops." } } });
  const m = conMotivo.movimientos[0];
  assert(m?.motivo === "Venta de otro artículo" && m.cantidad === 2 && m.tipo === "Entrada" && m.nota.includes("Eran otras laptops"), "LAP-000062 con su motivo: 2 ventas eran de otras laptops (no entraron laptops)");
  const alReves = planKardexPuntoCero({ corte, items: [lap62], movimientos, motivos: { recLAP62: { motivo: "Vendida fuera del sistema", nota: "x" } } });
  assert(alReves.movimientos[0]?.motivo === "Ajuste del Kardex", "Un motivo en el sentido equivocado no se usa");
}
assert(de("recOTR28")?.motivo === "Ajuste del Kardex" && de("recOTR28")?.documentoTipo === "Conteo" && de("recOTR28")?.documentoId === "recConteo", "Queda como ajuste del conteo, con su documento");
const libroFinal = (id: string) => [...movimientos, ...plan.movimientos].filter((m) => m.registroId === id).reduce((s, m) => s + m.cantidad, 0);
assert(libroFinal("recOTR28") === 1 && libroFinal("recLAP62") === 0 && libroFinal("recSANO") === 4 && libroFinal("recNUEVO") === 2, "Después del ajuste, el libro de todos dice lo mismo que la tienda");

const otraVez = planKardexPuntoCero({ corte, items: [otr28, lap62, sano, nuevo], movimientos: [...movimientos, ...plan.movimientos] });
assert(otraVez.movimientos.length === 0, "Correrlo otra vez no agrega nada");
assert(clavePuntoCero("recConteo", "recOTR28") === de("recOTR28")?.clave, "La clave identifica conteo + registro");

const raro = { id: "recRARO", fields: campos({ SKU: "X-1", Cantidad: 0 }) };
const p2 = planKardexPuntoCero({ corte, items: [raro], movimientos: [mov("e1", raro, "Compra recibida", 3, "2026-11-10T12:00:00Z")] });
assert(p2.movimientos.length === 0 && p2.revisar.length === 1, "Si la tienda al corte saldría negativa, no se inventa nada: queda para revisar");

// El registro real de OTR-000028 en Airtable.
const real28 = { id: "recbHEfy31mJOdsfa", fields: otr28.fields };
const pc = planCorreccionesCompradas([real28]);
assert(pc.cambiar.length === 1 && pc.cambiar[0].despues === 4, "OTR-000028: compradas 3 → 4");
assert(planCorreccionesCompradas([{ ...real28, fields: { ...real28.fields, "Unidades compradas": 4 } }]).yaHechas.length === 1, "Si ya dice 4, no se toca");
assert(planCorreccionesCompradas([{ ...real28, fields: { ...real28.fields, "Unidades compradas": 5 } }]).revisar.length === 1, "Si dice otra cosa, no se pisa: queda para revisar");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
