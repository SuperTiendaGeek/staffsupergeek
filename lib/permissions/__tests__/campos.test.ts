/**
 * Control de acceso a CAMPOS dentro de una pantalla (Fase 2 de personalizar
 * el acceso — se construye sobre pantallas.ts, ver su cabecera).
 * Ejecutar: npx tsx lib/permissions/__tests__/campos.test.ts
 */

import {
  parseCamposRestringidos,
  serializeCamposRestringidos,
  estadoCampo,
  puedeVerCampo,
  puedeEditarCampo,
  camposConEstado,
  ocultarCamposDeObjeto,
  camposConfigurables,
} from "../campos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ── El catálogo configurable nunca incluye Cantidad ─────────────────────────
// Es la garantía central de esta fase: Cantidad se queda con el candado
// absoluto de adminOnly (Tarea de "solo Administrador"), nunca con este
// panel de oculto/solo-lectura por usuario.
assert(
  !camposConfigurables("shipping-v2", "items").some((c) => c.key === "cantidad"),
  "Cantidad NUNCA aparece en el catálogo configurable — se queda con el candado absoluto"
);
assert(
  camposConfigurables("shipping-v2", "items").length > 0,
  "Shipping → Items sí tiene campos configurables (todos menos adminOnly/readOnly/hidden)"
);

// Los 5 valores de la tarjeta "Resumen rápido" (JSX a mano, no pasa por
// SHIPPING_V2_ITEM_EDIT_FIELDS) también deben poder ocultarse — es el pedido
// concreto: un técnico debe poder ver solo el precio de venta, nunca el
// costo ni la ganancia.
for (const key of ["costoTotalUnidad", "costoLogisticoAsignado", "costoTotalStock", "gananciaUnidad", "gananciaStock"]) {
  assert(
    camposConfigurables("shipping-v2", "items").some((c) => c.key === key),
    `"${key}" (tarjeta Resumen rápido) está en el catálogo configurable`
  );
}
// costoProveedor y precioVenta ya venían del catálogo editable — se
// verifica que sigan ahí, porque son los otros dos campos de esa tarjeta.
for (const key of ["costoProveedor", "precioVenta"]) {
  assert(
    camposConfigurables("shipping-v2", "items").some((c) => c.key === key),
    `"${key}" (tarjeta Resumen rápido) sigue en el catálogo configurable`
  );
}
assert(
  camposConfigurables("shipping-v2", "pagos").length === 0,
  "Una pantalla sin catálogo data-driven (Pagos) no tiene campos configurables todavía"
);

// ── parseCamposRestringidos: defensivo, nunca lanza ─────────────────────────
assert(Object.keys(parseCamposRestringidos("")).length === 0, "vacío → sin restricciones");
assert(Object.keys(parseCamposRestringidos(undefined)).length === 0, "undefined → sin restricciones");
assert(Object.keys(parseCamposRestringidos("no es json")).length === 0, "JSON inválido → sin restricciones, no lanza");
assert(Object.keys(parseCamposRestringidos("[1,2]")).length === 0, "un array en vez de objeto → sin restricciones");

const parsed = parseCamposRestringidos('{"shipping-v2":{"items":{"marca":"oculto","modelo":"solo-lectura","x":"cualquier-cosa"}}}');
assert(parsed["shipping-v2"]?.items?.marca === "oculto", "parsea un estado válido");
assert(parsed["shipping-v2"]?.items?.modelo === "solo-lectura", "parsea el otro estado válido");
assert(parsed["shipping-v2"]?.items?.x === undefined, "descarta un estado que no es ni oculto ni solo-lectura");

// ── serializeCamposRestringidos ─────────────────────────────────────────────
assert(serializeCamposRestringidos({}) === "", "sin restricciones serializa a string vacío");
assert(
  serializeCamposRestringidos({ "shipping-v2": { items: { marca: "oculto" } } }) ===
    '{"shipping-v2":{"items":{"marca":"oculto"}}}',
  "serializa una restricción real"
);

const original = { "shipping-v2": { items: { marca: "oculto" as const, modelo: "solo-lectura" as const } } };
assert(
  JSON.stringify(parseCamposRestringidos(serializeCamposRestringidos(original))) === JSON.stringify(original),
  "serializar y volver a parsear reproduce el mismo valor"
);

// ── estadoCampo / puedeVerCampo / puedeEditarCampo ──────────────────────────
const restringidos = parseCamposRestringidos('{"shipping-v2":{"items":{"marca":"oculto","modelo":"solo-lectura"}}}');

assert(estadoCampo(restringidos, "shipping-v2", "items", "marca") === "oculto", "estadoCampo lee el estado guardado");
assert(estadoCampo(restringidos, "shipping-v2", "items", "nombre") === null, "un campo sin restricción → null (editable, como siempre)");

assert(puedeVerCampo(restringidos, "shipping-v2", "items", "marca") === false, "oculto → no se puede ver");
assert(puedeVerCampo(restringidos, "shipping-v2", "items", "modelo") === true, "solo-lectura → SÍ se puede ver");
assert(puedeVerCampo(restringidos, "shipping-v2", "items", "nombre") === true, "sin restricción → se puede ver");

assert(puedeEditarCampo(restringidos, "shipping-v2", "items", "marca") === false, "oculto → no se puede editar");
assert(puedeEditarCampo(restringidos, "shipping-v2", "items", "modelo") === false, "solo-lectura → no se puede editar");
assert(puedeEditarCampo(restringidos, "shipping-v2", "items", "nombre") === true, "sin restricción → se puede editar");

// ── camposConEstado ──────────────────────────────────────────────────────────
assert(
  camposConEstado(restringidos, "shipping-v2", "items", "oculto").join(",") === "marca",
  "camposConEstado agrupa por estado, para pasarlo tal cual al servidor"
);
assert(
  camposConEstado(restringidos, "shipping-v2", "items", "solo-lectura").join(",") === "modelo",
  "camposConEstado con el otro estado"
);

// ── ocultarCamposDeObjeto: la puerta de LECTURA ──────────────────────────────
const item = { nombre: "Laptop", marca: "HP", cantidad: 3, disponibleVenta: true, fotos: ["a.jpg"] };

assert(
  JSON.stringify(ocultarCamposDeObjeto(item, [])) === JSON.stringify(item),
  "sin nada que ocultar, devuelve el objeto intacto"
);

const redactado = ocultarCamposDeObjeto(item, ["marca", "cantidad", "disponibleVenta", "fotos"]);
assert(redactado.marca === "", "un string oculto se vacía, no se pone en null (sigue siendo un string válido)");
assert(redactado.cantidad === null, "un number oculto se vuelve null");
assert(redactado.disponibleVenta === false, "un boolean oculto se vuelve false");
assert(JSON.stringify(redactado.fotos) === "[]", "un array oculto se vacía");
assert(redactado.nombre === "Laptop", "un campo NO listado para ocultar queda intacto");

const conKeyInexistente = ocultarCamposDeObjeto(item, ["campoQueNoExiste"]);
assert(JSON.stringify(conKeyInexistente) === JSON.stringify(item), "una clave que no existe en el objeto no rompe nada");

// "costoTotalStock"/"gananciaUnidad"/"gananciaStock" no son propiedades del
// item (la pantalla los calcula al vuelo) — ocultarlos es un no-op seguro
// sobre el objeto; la fila se oculta aparte, en la propia pantalla.
const sinPropiedadPropia = ocultarCamposDeObjeto(item, ["costoTotalStock", "gananciaUnidad", "gananciaStock"]);
assert(
  JSON.stringify(sinPropiedadPropia) === JSON.stringify(item),
  "ocultar una clave calculada (sin propiedad propia en el objeto) no rompe ni cambia nada"
);

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ campos.test.ts — todos los asserts pasaron");
