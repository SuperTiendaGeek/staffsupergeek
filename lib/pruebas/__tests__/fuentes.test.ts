/**
 * Pruebas — la marca «Es prueba» está conectada en cada lector y en cada candado (punto 16).
 * Lee las fuentes: si alguien quita un filtro, esta suite lo dice.
 * Ejecutar: npm test pruebas/__tests__/fuentes
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const raiz = path.resolve(__dirname, "../../..");
const leer = (r: string) => readFileSync(path.join(raiz, r), "utf8");

// Fuera de tableros y reportes
assert(/FORMULA_ABIERTAS = sinPruebas\(/.test(leer("lib/tecnicos/alertas/servidor.ts")), "tablero, Lista › Abiertas/Para baja y alertas: sin pruebas");
const lista = leer("lib/tecnicos/airtable/index.ts");
assert(/if \(searchFormula\) clauses\.push\(searchFormula\);\s*\/\/[^\n]*\n[^\n]*\n\s*else clauses\.push\(FORMULA_SIN_PRUEBAS\);/.test(lista), "bandejas y conteos sin pruebas; el buscador sí las encuentra");
assert(lista.includes("esPrueba: esPrueba(f),") && lista.includes("CAMPO_ES_PRUEBA,\n  ].forEach("), "la Lista y la orden traen la marca (etiqueta)");
assert(/heredaPrueba\(clienteDePrueba, enlaces\?\.ordenAnteriorEsPrueba\)/.test(lista), "la orden de un cliente de prueba (o el regreso de una de prueba) nace marcada");
assert(leer("lib/tecnicos/regreso/servidor.ts").includes("ordenAnteriorEsPrueba: orden.esPrueba"), "«Regresó el equipo» pasa la marca");
const cobros = leer("lib/tecnicos/cobros/airtable.ts");
assert(cobros.includes(": sinPruebas(desde") && cobros.includes("facturaCuentaComoDocumento(r.fields[\"Ambiente\"])"), "Cobros: sin órdenes de prueba y sin contar facturas de PRUEBAS como documento");
const historial = leer("lib/clientes/historial-servidor.ts");
assert(historial.includes("verPruebas || !esPrueba(o.fields)") && historial.includes("verPruebas || !esPrueba(op.fields)"), "ficha del cliente real: sin sus órdenes ni pedidos de prueba");
const ops = leer("lib/operaciones/airtable.ts");
assert(ops.includes(".filter((r) => !esPrueba(r.fields))") && ops.includes("clienteEsDePruebaOp(client, input.clienteId)"), "tablero de pedidos sin pruebas; el pedido de PRUEBA INTERNA nace marcado");
assert(leer("lib/pedidos-especiales/pedido-aparte-servidor.ts").includes("esPrueba(l.orden.fields) ? { [CAMPO_ES_PRUEBA]: true }"), "el pedido aparte de una orden de prueba nace marcado");
assert(/if \(esPrueba\(reg\?\.fields\)\) continue;\s*const conChip/.test(leer("lib/compras/servidor.ts")), "«Por comprar»: Logística nunca ve lo de una prueba");

// Candados
const puente = leer("lib/finanzas/puentes/abonos.ts");
assert(puente.includes("if (input.excluirPrueba && deUnaPrueba)"), "Finanzas: el puente de abonos sabe excluir pruebas");
for (const r of ["app/api/tecnicos/ordenes/[id]/abonos/route.ts", "app/api/operaciones/[id]/abonos/route.ts", "app/api/finanzas/reparar-abono/[id]/route.ts"]) {
  assert(leer(r).includes("excluirPrueba: true"), `abono a mano no llega a Finanzas: ${r}`);
}
assert(!leer("lib/pagos-en-linea/servidor.ts").includes("excluirPrueba"), "los pagos en línea no se tocan (proyecto aparte)");
const traductor = leer("lib/facturacion/gancho/traductor.ts");
assert(traductor.includes('return { bloqueado: true, motivo: "ES_PRUEBA" };') && traductor.includes("process.env.SRI_AMBIENTE"), "sin factura ni recibo de una prueba en producción");
assert(leer("lib/facturacion/gancho/cobroOrigen.ts").includes('case "ES_PRUEBA":'), "el servidor explica el bloqueo");
assert(leer("components/facturacion/EmisionDesdeOrigen.tsx").includes('resultado.motivo === "ES_PRUEBA"') && leer("components/facturacion/FacturacionForm.tsx").includes('resultado.motivo === "ES_PRUEBA"'), "y la pantalla también");
assert(leer("lib/facturacion/gancho/idempotencia.ts").includes("facturaBloqueaEnAmbiente(f.ambiente, ambiente)"), "en producción una factura de PRUEBAS no cierra una cuenta real");
assert(leer("lib/entrega/servidor.ts").includes("sinDocumentoPorPrueba: bloqueaDocumento(esPrueba(orden.fields), ambienteSri())"), "la prueba se entrega sin documento en producción");
assert(leer("lib/tecnicos/repuestos-v2.ts").includes("if (orden.esPrueba) throw new ErrorPrueba(MENSAJE_SIN_INVENTARIO);"), "una prueba no aparta repuestos reales");
assert(leer("app/api/tecnicos/ordenes/[id]/presupuesto/[lineaId]/licencia/route.ts").includes('exigirNoPrueba({ tipo: "orden", id }, MENSAJE_SIN_INVENTARIO)'), "ni licencias reales");

// Pantallas
const ruta = leer("app/api/tecnicos/ordenes/[id]/prueba/route.ts");
assert(ruta.includes("isAdministratorRole(session.user.rol)") && ruta.includes("createHistorialEntrada"), "marcar/desmarcar: solo administrador y queda en la Actividad");
const cabecera = leer("app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx");
assert(cabecera.includes("{orden.esPrueba && <EtiquetaPrueba />}") && cabecera.includes('"Quitar la marca de prueba" : "Marcar como prueba"'), "cabecera de la orden: etiqueta y opción en ⋯");
assert(leer("components/tecnicos/ordenes/lista/ListaOrdenes.tsx").includes("{o.esPrueba && <EtiquetaPrueba />}"), "búsqueda de la Lista: etiqueta");
assert(leer("components/operaciones/OperacionDetalleClient.tsx").includes("{operacion.esPrueba && <EtiquetaPrueba />}"), "pedido: etiqueta");
// Tailwind lee lib/**: nada de corchetes con dos puntos dentro en las reglas.
assert(!/\[[^\]\n]*\x3a[^\]\n]*\]/.test(leer("lib/pruebas/reglas.ts").replace(/\/\/.*$/gm, "")), "lib/pruebas/reglas.ts sin clases que Tailwind malinterprete");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
