/**
 * Pruebas — datos de prueba (auditoría ops, punto 16, 26-nov-2026).
 * Ejecutar: npm test pruebas/__tests__/reglas
 */
import {
  CAMPO_ES_PRUEBA, FORMULA_SIN_PRUEBAS, bloqueaDocumento, esPrueba, facturaBloqueaEnAmbiente, facturaCuentaComoDocumento,
  heredaPrueba, revisarMarca, sinPruebas, textoActividadMarca,
} from "../reglas";
import { evaluarEntrega } from "../../entrega/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// La marca
assert(CAMPO_ES_PRUEBA === "Es prueba", "el campo de Airtable se llama «Es prueba»");
assert(esPrueba({ "Es prueba": true }) && !esPrueba({ "Es prueba": false }) && !esPrueba({}) && !esPrueba(null), "solo la casilla marcada es prueba");
assert(FORMULA_SIN_PRUEBAS === "NOT({Es prueba})", "fórmula que deja fuera lo marcado");
assert(sinPruebas(null) === "NOT({Es prueba})", "sin otra fórmula: solo el filtro de pruebas");
assert(sinPruebas("{Estado}='X'") === "AND({Estado}='X',NOT({Es prueba}))", "con otra fórmula: se suman con AND");

// Herencia: cliente PRUEBA INTERNA u orden de origen de prueba
assert(heredaPrueba(true, undefined) && heredaPrueba(false, true) && !heredaPrueba(false, null, undefined), "nace de prueba si el cliente o el origen lo es");

// Documentos: solo se bloquean en producción
assert(bloqueaDocumento(true, "2"), "orden de prueba en producción: sin documento");
assert(!bloqueaDocumento(true, "1") && !bloqueaDocumento(true, undefined), "en local (ambiente de pruebas del SRI) sí se emite");
assert(!bloqueaDocumento(false, "2"), "una orden real emite normal");
assert(!facturaCuentaComoDocumento("PRUEBAS") && !facturaCuentaComoDocumento({ name: "PRUEBAS" }), "una factura de PRUEBAS no es documento de una cuenta real");
assert(facturaCuentaComoDocumento("PRODUCCIÓN") && facturaCuentaComoDocumento(""), "producción (o sin ambiente) sí cuenta");
assert(!facturaBloqueaEnAmbiente("PRUEBAS", "2"), "en producción, una factura de PRUEBAS no impide emitir el documento real (OR000342)");
assert(facturaBloqueaEnAmbiente("PRUEBAS", "1"), "en local, la de PRUEBAS sí bloquea (la prueba se comporta como la vida real)");
assert(facturaBloqueaEnAmbiente("PRODUCCIÓN", "2"), "una factura real siempre bloquea un segundo documento");

// Marcar / desmarcar
assert(revisarMarca({ esPrueba: true }).ok && revisarMarca({ esPrueba: false }).ok, "acepta marcar y desmarcar");
assert(!revisarMarca({}).ok && !revisarMarca({ esPrueba: "si" }).ok && !revisarMarca(null).ok, "rechaza cuerpos sin un sí/no claro");
assert(textoActividadMarca(true, "Alexis").startsWith("Alexis marcó esta orden como PRUEBA"), "la Actividad dice quién la marcó");
assert(textoActividadMarca(false, "Alexis").includes("vuelve a contar como real"), "y quién la desmarcó");

// Entregar una orden de prueba en producción: sin documento
{
  const base = { estadoOrden: "Completado", saldo: 0, totalCobrable: 45, enGarantia: 0, documento: null, pendientes: [] };
  const real = evaluarEntrega(base);
  assert(!real.puedeEntregar && real.faltas.includes("Falta emitir la factura o el recibo"), "una orden real con cobro exige su documento");
  const prueba = evaluarEntrega({ ...base, sinDocumentoPorPrueba: true });
  assert(prueba.puedeEntregar && prueba.revisiones.some((r) => r.clave === "documento" && r.ok && r.texto.startsWith("Prueba")), "la de prueba se entrega sin documento");
  const debe = evaluarEntrega({ ...base, saldo: 45, sinDocumentoPorPrueba: true });
  assert(!debe.puedeEntregar, "aunque sea de prueba, no se entrega debiendo");
}

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
