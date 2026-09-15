// Contrato de las evidencias de novedades: qué se acepta y cómo se clasifica.
// Ejecutar: npx tsx lib/shipping-v2/__tests__/evidencias.test.ts

import {
  LIMITE_SUBIDA_AIRTABLE_BYTES,
  MAX_EVIDENCIAS_POR_NOVEDAD,
  MAX_FOTO_ORIGINAL_BYTES,
  MAX_VIDEO_EVIDENCIA_BYTES,
  clasificarEvidencia,
  esFotoPrevisualizable,
  etiquetaEvidencia,
  urlMiniaturaEvidencia,
  validarEvidencias,
  validarSeleccionEvidencias,
} from "../evidencias";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const MB = 1024 * 1024;

// ─── El límite de Airtable es la regla que manda ────────────────────────────
//
// Airtable no acepta adjuntos de más de 5 MB. Si este número sube por encima
// de eso, las subidas empiezan a fallar en producción sin que nadie lo note
// hasta que un técnico pierde una foto.

assert(LIMITE_SUBIDA_AIRTABLE_BYTES < 5 * MB, "El tope de subida queda por debajo de los 5 MB de Airtable");
assert(MAX_VIDEO_EVIDENCIA_BYTES <= LIMITE_SUBIDA_AIRTABLE_BYTES, "El video nunca puede superar el tope de Airtable");

// ─── Clasificación ──────────────────────────────────────────────────────────

assert(clasificarEvidencia({ type: "image/jpeg" }) === "foto", "JPEG es foto");
assert(clasificarEvidencia({ type: "video/mp4" }) === "video", "MP4 es video");
assert(clasificarEvidencia({ type: "video/quicktime" }) === "video", "MOV del iPhone es video");
assert(clasificarEvidencia({ type: "application/pdf" }) === "archivo", "PDF no es foto ni video");

// Algunos Android suben todo como octet-stream: hay que caer a la extensión,
// si no la foto se mostraría como archivo genérico.
assert(
  clasificarEvidencia({ type: "application/octet-stream", filename: "IMG_2231.JPG" }) === "foto",
  "Sin content-type confiable se deduce por la extensión"
);
assert(
  clasificarEvidencia({ type: "", filename: "clip.mov" }) === "video",
  "Sin content-type, .mov se reconoce como video"
);
assert(
  clasificarEvidencia({ type: "", filename: "notas" }) === "archivo",
  "Sin tipo ni extensión conocida cae en archivo"
);

// HEIC se acepta pero el navegador no lo dibuja.
assert(clasificarEvidencia({ type: "image/heic" }) === "foto", "HEIC cuenta como foto");
assert(!esFotoPrevisualizable({ type: "image/heic" }), "HEIC no se puede previsualizar en un <img>");
assert(esFotoPrevisualizable({ type: "image/png" }), "PNG sí se previsualiza");
assert(!esFotoPrevisualizable({ type: "video/mp4" }), "Un video no se previsualiza como imagen");

// ─── Miniaturas ─────────────────────────────────────────────────────────────

assert(
  urlMiniaturaEvidencia({ url: "https://a/f.jpg", type: "image/jpeg", thumbnailUrl: "https://a/thumb.jpg" }) === "https://a/thumb.jpg",
  "Prefiere la miniatura de Airtable para no bajar el original"
);
assert(
  urlMiniaturaEvidencia({ url: "https://a/f.jpg", type: "image/jpeg" }) === "https://a/f.jpg",
  "Sin miniatura usa la URL original"
);
assert(
  urlMiniaturaEvidencia({ url: "https://a/v.mp4", type: "video/mp4", thumbnailUrl: "https://a/x.jpg" }) === "",
  "Un video no tiene miniatura de imagen aunque Airtable mande algo"
);

// ─── Etiquetas ──────────────────────────────────────────────────────────────

assert(
  etiquetaEvidencia({ url: "u", filename: "bisagra.jpg" }, 0) === "bisagra.jpg",
  "Usa el nombre real del archivo cuando existe"
);
assert(
  etiquetaEvidencia({ url: "u", type: "video/mp4" }, 2) === "Video 3",
  "Sin nombre, numera según la clase"
);

// ─── Selección: lo que el usuario ELIGE, antes de comprimir ─────────────────
//
// La diferencia entre las dos validaciones es el punto delicado de todo esto:
// una foto de 12 MB se ACEPTA al elegirla (se va a comprimir) pero se
// RECHAZA si llegara así al servidor.

const FOTO_DE_CELULAR = { name: "IMG_0042.HEIC", type: "image/heic", size: 12 * MB };

assert(validarSeleccionEvidencias([FOTO_DE_CELULAR]).ok, "Una foto de 12 MB del celular se puede elegir: se comprimirá");
assert(!validarEvidencias([FOTO_DE_CELULAR]).ok, "Esa misma foto sin comprimir NO se sube a Airtable");

assert(
  !validarSeleccionEvidencias([{ name: "enorme.jpg", type: "image/jpeg", size: MAX_FOTO_ORIGINAL_BYTES + 1 }]).ok,
  "Una foto absurdamente grande se rechaza antes de intentar comprimirla"
);

// El video no se puede comprimir: el tope se aplica desde que se elige.
assert(
  validarSeleccionEvidencias([{ name: "clip.mp4", type: "video/mp4", size: 3 * MB }]).ok,
  "Un clip de 3 MB se puede elegir"
);
// El tope no lo pone solo Airtable: en Vercel el cuerpo de una función
// serverless no puede pasar de 4.5 MB, y el archivo viaja dentro de un sobre
// multipart. Por eso el corte está en 3.5 y no en 5.
assert(
  !validarSeleccionEvidencias([{ name: "clip.mp4", type: "video/mp4", size: 4 * MB }]).ok,
  "Un clip de 4 MB ya no cabe: el cuerpo de la petición tiene su propio límite"
);
const videoGrande = validarSeleccionEvidencias([{ name: "clip.mp4", type: "video/mp4", size: 20 * MB }]);
assert(!videoGrande.ok, "Un video de 20 MB se rechaza al elegirlo, no después de subirlo");
assert(
  !videoGrande.ok && videoGrande.motivo.includes("más corto"),
  "El mensaje del video dice qué hacer: grabar un clip más corto"
);

assert(!validarSeleccionEvidencias([]).ok, "Sin archivos no se sube nada");
assert(
  !validarSeleccionEvidencias([{ name: "doc.pdf", type: "application/pdf", size: MB }]).ok,
  "Un PDF se rechaza"
);
assert(
  !validarSeleccionEvidencias([{ name: "a.jpg", type: "image/jpeg", size: 0 }]).ok,
  "Un archivo vacío se rechaza"
);

// Si un solo archivo del lote es inválido, se rechaza el lote entero: subir
// la mitad y fallar en la otra deja la novedad en un estado confuso.
assert(
  !validarSeleccionEvidencias([
    { name: "a.jpg", type: "image/jpeg", size: MB },
    { name: "b.pdf", type: "application/pdf", size: MB },
  ]).ok,
  "Un archivo malo invalida todo el lote"
);

// ─── Subida: lo que REALMENTE llega a Airtable ──────────────────────────────

assert(
  validarEvidencias([{ name: "a.jpg", type: "image/jpeg", size: LIMITE_SUBIDA_AIRTABLE_BYTES }]).ok,
  "Exactamente en el tope todavía pasa"
);
assert(
  !validarEvidencias([{ name: "a.jpg", type: "image/jpeg", size: LIMITE_SUBIDA_AIRTABLE_BYTES + 1 }]).ok,
  "Un byte por encima del tope se rechaza"
);
assert(
  validarEvidencias([{ name: "comprimida.jpg", type: "image/jpeg", size: 900 * 1024 }]).ok,
  "Una foto ya comprimida pasa sin problema"
);

// ─── Tope por novedad ───────────────────────────────────────────────────────

const unaFoto = { name: "a.jpg", type: "image/jpeg", size: MB };

assert(
  validarSeleccionEvidencias([unaFoto], { yaSubidas: MAX_EVIDENCIAS_POR_NOVEDAD - 1 }).ok,
  "Cabe la última evidencia"
);
assert(
  !validarSeleccionEvidencias([unaFoto], { yaSubidas: MAX_EVIDENCIAS_POR_NOVEDAD }).ok,
  "Con la novedad llena no se acepta ninguna más"
);
assert(
  !validarEvidencias([unaFoto], { yaSubidas: MAX_EVIDENCIAS_POR_NOVEDAD }).ok,
  "El servidor aplica el mismo tope que el navegador"
);

const lleno = validarSeleccionEvidencias([unaFoto], { yaSubidas: MAX_EVIDENCIAS_POR_NOVEDAD });
assert(
  !lleno.ok && lleno.motivo.includes("Elimina"),
  "Cuando está llena el mensaje dice qué hacer, no solo que falló"
);

const parcial = validarSeleccionEvidencias([unaFoto, unaFoto, unaFoto], { yaSubidas: MAX_EVIDENCIAS_POR_NOVEDAD - 1 });
assert(
  !parcial.ok && parcial.motivo.includes("1"),
  "Cuando caben menos de las elegidas, el mensaje dice cuántas caben"
);

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}

console.log("✅ evidencias.test.ts — todos los asserts pasaron");
