import { errorDeFoto, fotosDeAdjuntos, idsSinFoto, MAX_FOTOS_OPCION, nombreSeguro } from "../fotos";

let fallos = 0;
function assert(c: boolean, m: string) { if (!c) { fallos++; console.error("FALLÓ:", m); } else console.log("✓", m); }

const adj = [
  { id: "att1", url: "https://x/1.jpg", filename: "tapa.jpg", thumbnails: { small: { url: "https://x/1s.jpg" }, large: { url: "https://x/1l.jpg" } } },
  { id: "att2", url: "https://x/2.jpg" },
  { id: "", url: "https://x/3.jpg" },
  { id: "att4" },
  null,
];
const f = fotosDeAdjuntos(adj);
assert(f.length === 2, "descarta adjuntos sin id o sin url");
assert(f[0].miniatura === "https://x/1s.jpg" && f[0].grande === "https://x/1l.jpg", "usa miniatura chica y grande de Airtable");
assert(f[1].miniatura === "https://x/2.jpg" && f[1].grande === "https://x/2.jpg" && f[1].nombre === "foto", "sin miniaturas cae al original");
assert(fotosDeAdjuntos(undefined).length === 0 && fotosDeAdjuntos("x").length === 0, "valor raro = sin fotos");

assert(errorDeFoto({ tipo: "image/jpeg", bytes: 500_000, yaHay: 0 }) === null, "foto normal: ok");
assert(errorDeFoto({ tipo: "application/pdf", bytes: 1000, yaHay: 0 }) !== null, "PDF: no");
assert(errorDeFoto({ tipo: "image/jpeg", bytes: 9_000_000, yaHay: 0 }) !== null, "muy pesada: no");
assert(errorDeFoto({ tipo: "image/jpeg", bytes: 0, yaHay: 0 }) !== null, "vacía: no");
assert(errorDeFoto({ tipo: "image/png", bytes: 1000, yaHay: MAX_FOTOS_OPCION - 1 }) === null, "la sexta entra");
assert(errorDeFoto({ tipo: "image/png", bytes: 1000, yaHay: MAX_FOTOS_OPCION }) !== null, "la séptima no");

assert(idsSinFoto(f, "att1").join() === "att2", "quitar deja las demás");
assert(idsSinFoto(f, "nada").length === 2, "quitar una que no existe no cambia nada");
assert(nombreSeguro("Mi foto (1).HEIC", "image/jpeg") === "Mi_foto_1_.jpg", "nombre seguro con extensión según el tipo");
assert(nombreSeguro("", "image/webp") === "foto.webp", "nombre vacío");

if (fallos) { console.error(`${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("Todo OK");
