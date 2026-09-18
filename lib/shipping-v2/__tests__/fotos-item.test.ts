// Contrato de las fotos de un item: lo mismo que valida el navegador tiene que
// validar el servidor.
// Ejecutar: npx tsx lib/shipping-v2/__tests__/fotos-item.test.ts

import {
  LIMITE_FOTO_ITEM_BYTES,
  MAX_FOTOS_POR_ITEM,
  MAX_FOTO_ITEM_ORIGINAL_BYTES,
  esFotoItemValida,
  validarFotosItem,
  validarSeleccionFotosItem,
} from "../fotos-item";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const MB = 1024 * 1024;
const foto = (size: number, type = "image/jpeg", name = "foto.jpg") => ({ name, type, size });

// ── El límite que manda es el de Airtable, no el que teníamos ───────────────
assert(LIMITE_FOTO_ITEM_BYTES < 5 * MB, "el tope real queda por debajo de los 5 MB de Airtable");
assert(LIMITE_FOTO_ITEM_BYTES < 4.5 * MB, "y también por debajo del cuerpo de 4.5 MB de Vercel");

// Este es EL bug: 10 MB pasaba y Airtable lo rechazaba después, en silencio.
assert(!validarFotosItem([foto(10 * MB)]).ok, "una foto de 10 MB ya no se acepta para subir");
assert(validarFotosItem([foto(3 * MB)]).ok, "una foto de 3 MB sí");

// ── Elegir vs subir son dos momentos distintos ─────────────────────────────
assert(
  validarSeleccionFotosItem([foto(10 * MB)]).ok,
  "al ELEGIR, una foto grande pasa: se comprime enseguida en el navegador"
);
assert(
  !validarSeleccionFotosItem([foto(MAX_FOTO_ITEM_ORIGINAL_BYTES + 1)]).ok,
  "pero algo absurdo se frena antes de que el navegador se quede sin memoria"
);

// ── Formato ────────────────────────────────────────────────────────────────
assert(esFotoItemValida(foto(MB, "image/png", "a.png")), "PNG vale");
assert(esFotoItemValida(foto(MB, "image/webp", "a.webp")), "WebP vale");
assert(!esFotoItemValida(foto(MB, "image/heic", "a.heic")), "HEIC no: estas fotos se publican");
assert(!esFotoItemValida(foto(MB, "application/pdf", "a.pdf")), "un PDF no es una foto");
assert(
  esFotoItemValida(foto(MB, "application/octet-stream", "IMG_0042.JPG")),
  "si Android no manda el tipo, decide la extensión"
);
assert(
  !validarFotosItem([foto(MB, "application/octet-stream", "sin-extension")]).ok,
  "sin tipo ni extensión reconocible, se rechaza"
);

// ── Cupo ───────────────────────────────────────────────────────────────────
assert(!validarFotosItem([foto(MB)], { yaSubidas: MAX_FOTOS_POR_ITEM }).ok, "con el cupo lleno no entra otra");
assert(validarFotosItem([foto(MB)], { yaSubidas: MAX_FOTOS_POR_ITEM - 1 }).ok, "con un lugar libre sí");
assert(
  !validarFotosItem([foto(MB), foto(MB)], { yaSubidas: MAX_FOTOS_POR_ITEM - 1 }).ok,
  "dos fotos para un solo lugar libre no pasan"
);

// ── Casos que no pueden romper ─────────────────────────────────────────────
assert(!validarFotosItem([]).ok, "sin archivos no hay nada que subir");
assert(!validarFotosItem([foto(0)]).ok, "un archivo vacío se rechaza");
assert(validarFotosItem([foto(MB)], { yaSubidas: -5 }).ok, "un conteo previo absurdo no bloquea la subida");

// El motivo tiene que servirle a quien lo lee, no ser genérico.
const rechazo = validarFotosItem([foto(10 * MB, "image/jpeg", "bisagra.jpg")]);
assert(!rechazo.ok && rechazo.motivo.includes("bisagra.jpg"), "el mensaje dice CUÁL foto falló");

console.log(fallos ? `\n${fallos} fallo(s)` : "\n✅ fotos-item.test.ts — todos los asserts pasaron");
process.exit(fallos ? 1 : 0);
