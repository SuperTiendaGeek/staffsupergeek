/**
 * La guía visual de la inspección no puede señalar zonas que no existen.
 * Ejecutar: npm test guia-visual
 *
 * Los dibujos (app/.../inspeccion/[id]/trazos.tsx) traen dos mapas con ids de
 * zona escritos a mano: `capas` (el contorno que se enciende) y `coords` (dónde
 * va el número). Los ids reales los decide construirZonasRevision(). TypeScript
 * no puede casar esos dos lados —son Record<string, …>— así que un id mal
 * escrito, o una zona que se renombró en revision-tecnica.ts, pasaba sin ruido:
 * el número quedaba flotando en el vacío o la zona nunca se encendía. Esta
 * prueba es ese chequeo.
 */
import { construirZonasRevision, getPerfilRevision, idsDeZonaDelPerfil, type PerfilRevision } from "../revision-tecnica";
import { TRAZOS } from "../../../app/shipping-v2/recepcion/inspeccion/[id]/trazos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Una categoría real por perfil dibujado. Se usa la categoría y no el perfil
// porque es lo que llega desde Airtable, que es como se rompería de verdad.
const CATEGORIA_DE: Partial<Record<PerfilRevision, string>> = {
  laptop: "Laptop",
  desktop: "Desktop",
  allinone: "All in One",
  monitor: "Monitor",
  tablet: "Tablet",
  celular: "Celular",
  consola: "Consola",
  camara: "Cámara / Seguridad",
  audio: "Audio",
  impresora: "Impresora",
  smarthome: "Smart Home",
  red: "Red / Wi-Fi",
  energia: "Energía / Protección",
  adaptador: "Adaptador / Dock / Lector",
};

for (const perfil of Object.keys(TRAZOS) as PerfilRevision[]) {
  const categoria = CATEGORIA_DE[perfil];
  assert(!!categoria, `El perfil dibujado "${perfil}" tiene una categoría de ejemplo en la prueba`);
  if (!categoria) continue;

  assert(
    getPerfilRevision(categoria) === perfil,
    `La categoría "${categoria}" sigue cayendo en el perfil ${perfil}`
  );

  const trazo = TRAZOS[perfil]!;
  // Las posibles, no las de un item vacío: Conectividad, Puertos y Otras
  // características solo aparecen cuando el item declaró opciones, pero el
  // dibujo las trae listas para ese caso y eso no es un error.
  const reales = new Set(idsDeZonaDelPerfil(perfil));

  // Y lo que sí debe cumplirse siempre: un item recién recibido, sin opciones
  // declaradas, tiene que poder ubicar cada una de sus zonas en el dibujo.
  const minimas = construirZonasRevision(categoria, []).map((z) => z.id);
  const sinUbicar = minimas.filter((id) => !trazo.coords[id]);
  assert(
    sinUbicar.length === 0,
    `${perfil}: un item sin opciones declaradas tiene todas sus zonas en el dibujo${
      sinUbicar.length ? ` (faltan: ${sinUbicar.join(", ")})` : ""}`
  );

  const capasHuerfanas = Object.keys(trazo.capas).filter((id) => !reales.has(id));
  assert(
    capasHuerfanas.length === 0,
    `${perfil}: todas las capas dibujadas corresponden a zonas reales${
      capasHuerfanas.length ? ` (sobran: ${capasHuerfanas.join(", ")})` : ""}`
  );

  const numerosHuerfanos = Object.keys(trazo.coords).filter((id) => !reales.has(id));
  assert(
    numerosHuerfanos.length === 0,
    `${perfil}: todos los números apuntan a zonas reales${
      numerosHuerfanos.length ? ` (sobran: ${numerosHuerfanos.join(", ")})` : ""}`
  );

  // Un número sin capa se puede tocar pero no enciende nada: es un botón muerto.
  const sinCapa = Object.keys(trazo.coords).filter((id) => !trazo.capas[id]);
  assert(
    sinCapa.length === 0,
    `${perfil}: ningún número queda sin su contorno${sinCapa.length ? ` (sin capa: ${sinCapa.join(", ")})` : ""}`
  );

  // Dentro del lienzo, con margen para que la chapa de 26px no se corte.
  const fuera = Object.entries(trazo.coords).filter(
    ([, p]) => p.x < 3 || p.x > 97 || p.y < 4 || p.y > 96
  );
  assert(fuera.length === 0, `${perfil}: todos los números caen dentro del lienzo`);
}

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}
console.log("Guía visual de la inspección: OK");
