/**
 * Mensajes de cotización para WhatsApp.
 * Ejecutar: npx tsx lib/operaciones/__tests__/whatsappCotizacion.test.ts
 */

import {
  construirMensajeOpcionCotizada,
  construirMensajeOpcionesCotizadas,
  construirUrlWhatsApp,
  normalizarTelefonoWhatsApp,
} from "../whatsappCotizacion";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const operacion = {
  codigo: "OP-2026-000065",
  clienteNombre: "Juan Mateo",
  clienteTelefono: "0963023673",
};

const opcion = {
  productoDescripcion: "M-Audio Fast Track Ultra 8x8 Usb 2.0 W/ Mx Core Dsp Technology",
  proveedorNombre: "eBay",
  tiempoEstimado: "2 a 3 semanas",
  precioVentaCliente: 180,
  notaParaCliente: "OPEN BOX",
};

assert(normalizarTelefonoWhatsApp("0963023673") === "593963023673", "Normaliza celular local con 0");
assert(normalizarTelefonoWhatsApp("+593 96 302 3673") === "593963023673", "Mantiene prefijo Ecuador");
assert(normalizarTelefonoWhatsApp("+593 096 302 3673") === "593963023673", "Quita 0 local tras prefijo Ecuador");
assert(normalizarTelefonoWhatsApp("963023673") === "593963023673", "Agrega prefijo Ecuador a celular sin 0");
assert(normalizarTelefonoWhatsApp("") === null, "Teléfono vacío no genera enlace");

const mensajeIndividual = construirMensajeOpcionCotizada({ operacion, opcion });
assert(mensajeIndividual.includes("*Juan Mateo*"), "Incluye nombre del cliente");
assert(mensajeIndividual.includes("*OP-2026-000065*"), "Incluye código de operación");
assert(mensajeIndividual.includes("*Artículo:* M-Audio Fast Track Ultra"), "Incluye producto");
assert(!mensajeIndividual.includes("eBay") && !mensajeIndividual.includes("Proveedor"), "NO incluye el proveedor: es información interna");
assert(mensajeIndividual.includes("*Precio:* $180,00"), "Incluye precio al cliente");
assert(mensajeIndividual.includes("*Entrega estimada:* 2 a 3 semanas"), "Incluye tiempo estimado");
assert(mensajeIndividual.includes("OPEN BOX"), "Incluye nota para el cliente");
assert(!/[\uD800-\uDFFF]/u.test(mensajeIndividual), "No incluye emojis ni pares sustitutos");

const mensajeTodas = construirMensajeOpcionesCotizadas({
  operacion,
  opciones: [
    opcion,
    { ...opcion, productoDescripcion: "Interfaz alternativa", proveedorNombre: "" },
  ],
});
assert(mensajeTodas.includes("*Opción 1*"), "Enumera la primera opción");
assert(mensajeTodas.includes("*Opción 2*"), "Enumera la segunda opción");
assert(mensajeTodas.includes("Interfaz alternativa"), "Incluye todas las opciones");

const url = construirUrlWhatsApp(operacion.clienteTelefono, mensajeIndividual);
assert(url?.startsWith("https://wa.me/593963023673?text=") === true, "Construye URL wa.me Ecuador");
assert(url?.includes(encodeURIComponent("OP-2026-000065")) === true, "Codifica el mensaje en la URL");

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ whatsappCotizacion.test.ts — todos los asserts pasaron");
