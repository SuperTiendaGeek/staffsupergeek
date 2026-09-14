// Contrato: cuándo un artículo completó su ciclo dentro de un packing.
// Ejecutar: npx tsx lib/shipping-v2/__tests__/reception-checklist.test.ts

import {
  calculateShippingV2ItemChecklist,
  evaluarPublicacionAplica,
  isShippingV2ItemCicloCompleto,
  SHIPPING_V2_CHECKLIST_STEPS,
  SHIPPING_V2_CHECKLIST_STEPS_REQUERIDOS,
} from "../reception-checklist";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const completo = {
  sku: "LAP-OK",
  estado: "Disponible",
  recibido: true,
  revisadoFisicamente: true,
  fotosTomadas: true,
  shopifyPublicado: true,
  marketplacePublicado: true,
  mercadoLibrePublicado: true,
  gruposFacebookPublicado: true,
};

assert(SHIPPING_V2_CHECKLIST_STEPS.length === 7, "El checklist muestra 7 pasos");
assert(SHIPPING_V2_CHECKLIST_STEPS_REQUERIDOS.length === 6, "Solo 6 pasos son requeridos para cerrar el ciclo");
assert(
  SHIPPING_V2_CHECKLIST_STEPS.filter((paso) => paso.grupo === "bodega").length === 3,
  "Tres pasos de bodega: Recibido, Revisado, Fotos"
);
assert(
  SHIPPING_V2_CHECKLIST_STEPS.find((paso) => paso.key === "gruposFacebook")?.requerido === false,
  "Grupos Facebook es opcional: útil pero no fundamental"
);
assert(
  !SHIPPING_V2_CHECKLIST_STEPS.some((paso) => paso.label.includes("Super Geek")),
  "Facebook Super Geek ni siquiera aparece en el checklist de ciclo"
);

assert(isShippingV2ItemCicloCompleto(completo), "Las casillas marcadas completan el ciclo");

// Grupos Facebook sin marcar NO impide cerrar el ciclo.
const sinGruposFacebook = { ...completo, gruposFacebookPublicado: false };
assert(isShippingV2ItemCicloCompleto(sinGruposFacebook), "Sin Grupos Facebook el ciclo se completa igual");
const checklistSinFB = calculateShippingV2ItemChecklist(sinGruposFacebook);
assert(checklistSinFB.pendientes.length === 0, "Grupos Facebook no cuenta como pendiente bloqueante");
assert(
  checklistSinFB.opcionalesPendientes.includes("gruposFacebook"),
  "Grupos Facebook sí se informa como opcional pendiente"
);

for (const paso of SHIPPING_V2_CHECKLIST_STEPS_REQUERIDOS) {
  const campo = {
    recibido: "recibido",
    revisado: "revisadoFisicamente",
    fotos: "fotosTomadas",
    shopify: "shopifyPublicado",
    marketplace: "marketplacePublicado",
    mercadoLibre: "mercadoLibrePublicado",
    gruposFacebook: "gruposFacebookPublicado",
  }[paso.key];
  const sinEsePaso = { ...completo, [campo]: false };
  assert(!isShippingV2ItemCicloCompleto(sinEsePaso), `Falta "${paso.label}" → el ciclo NO está completo`);
}

// Caso real del checklist nuevo: el packing de junio tenía Recibido apagado
// en los 10 porque la casilla se agregó después.
const sinRecibido = { ...completo, recibido: false };
const checklistSinRecibido = calculateShippingV2ItemChecklist(sinRecibido);
assert(checklistSinRecibido.pendientes.length === 1 && checklistSinRecibido.pendientes[0] === "recibido", "Solo queda pendiente Recibido");

// ─── Publicaciones que no aplican ────────────────────────────────────────────

const repuesto = {
  sku: "REP-1",
  estado: "Repuesto",
  esRepuesto: true,
  recibido: true,
  revisadoFisicamente: true,
  fotosTomadas: true,
};
assert(!evaluarPublicacionAplica(repuesto).aplica, "Un repuesto no se publica al público");
assert(isShippingV2ItemCicloCompleto(repuesto), "Un repuesto con bodega completa cierra su ciclo sin publicaciones");
const checklistRepuesto = calculateShippingV2ItemChecklist(repuesto);
assert(
  checklistRepuesto.pasos.filter((paso) => paso.estado === "no-aplica").length === 4,
  "Los 4 pasos de publicación quedan como 'no aplica', no como 'hecho'"
);
assert(checklistRepuesto.motivoPublicacionNoAplica.includes("repuesto"), "El motivo explica por qué no aplica");

const usoLocal = { sku: "USO-1", estado: "Uso local", usoLocal: true, recibido: true, revisadoFisicamente: true, fotosTomadas: true };
assert(isShippingV2ItemCicloCompleto(usoLocal), "Un artículo de uso local cierra su ciclo sin publicaciones");

const vendido = { sku: "LAP-000013", estado: "Vendido", recibido: true, revisadoFisicamente: true, fotosTomadas: true };
assert(!evaluarPublicacionAplica(vendido).aplica, "Un artículo ya vendido no necesita publicarse");
assert(isShippingV2ItemCicloCompleto(vendido), "Un artículo vendido con bodega completa cierra su ciclo");

// La bodega NUNCA se exime, ni siquiera para un repuesto.
assert(
  !isShippingV2ItemCicloCompleto({ ...repuesto, revisadoFisicamente: false }),
  "Un repuesto sin revisión física NO cierra su ciclo"
);
assert(
  !isShippingV2ItemCicloCompleto({ ...vendido, recibido: false }),
  "Un artículo vendido sin confirmar recepción NO cierra su ciclo"
);

// Una publicación ya marcada se sigue mostrando como hecha aunque hoy no aplique.
const vendidoPublicado = { ...vendido, shopifyPublicado: true };
const checklistVendidoPublicado = calculateShippingV2ItemChecklist(vendidoPublicado);
assert(
  checklistVendidoPublicado.pasos.find((paso) => paso.key === "shopify")?.estado === "hecho",
  "Una publicación ya hecha no se oculta como 'no aplica'"
);

// Un artículo normal a la venta sí necesita las 4 publicaciones.
const disponibleSinPublicar = { sku: "LAP-NEW", estado: "En revisión", recibido: true, revisadoFisicamente: true, fotosTomadas: true };
assert(evaluarPublicacionAplica(disponibleSinPublicar).aplica, "Un artículo en revisión sí debe publicarse");
assert(!isShippingV2ItemCicloCompleto(disponibleSinPublicar), "Sin publicaciones, un artículo vendible no cierra su ciclo");
assert(calculateShippingV2ItemChecklist(disponibleSinPublicar).pendientes.length === 3, "Le faltan las 3 publicaciones requeridas");

// Campos vacíos: nada se da por hecho.
assert(!isShippingV2ItemCicloCompleto({ sku: "VACIO", estado: "Recibido" }), "Un artículo sin ninguna casilla no está completo");

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("✅ reception-checklist.test.ts — todos los asserts pasaron");
