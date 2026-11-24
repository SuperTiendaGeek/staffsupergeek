/**
 * Test de fuentes — rediseño R8: tablero por etapas, Lista con bandejas,
 * Cobros bajo demanda, política de baja unificada (tableros 16 a 20).
 * Ejecutar: npm test orden/__tests__/r8-fuentes
 */
import { existsSync, readFileSync } from "node:fs";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const leer = (p: string) => readFileSync(p, "utf8");

// Pantalla de órdenes
const pagina = leer("app/tecnicos/ordenes/OrdenesPageClient.tsx");
assert(pagina.includes("<VistasOrdenes") && !pagina.includes("<PanelCobros") && !pagina.includes("/api/tecnicos/ordenes?"), "la pantalla usa las vistas nuevas; el panel de cobros ya no carga al abrir");
assert(pagina.includes("<MotivosSelector") && pagina.includes("setRefreshKey((prev) => prev + 1)"), "«Nueva orden» sigue igual y la orden nueva aparece en el tablero");

const vistas = leer("components/tecnicos/ordenes/lista/VistasOrdenes.tsx");
assert(['"Tablero"', '"Lista"', '"Cobros"'].every((x) => vistas.includes(x)) && vistas.includes('role="radiogroup"'), "una barra con Tablero · Lista · Cobros");
assert(vistas.includes("localStorage.getItem(CLAVE_VISTA)") && vistas.includes("localStorage.setItem(CLAVE_VISTA"), "se recuerda la última vista de cada persona");
assert(/vista === "cobros" && <PanelCobros inmediato \/>/.test(vistas), "Cobros carga solo al tocar su pestaña, sin esperar");
assert(vistas.includes("EVENTO_DATOS_ALERTAS") && vistas.includes("visibilitychange"), "el tablero se pone al día cuando la barra relee (sin consultas nuevas)");

const tablero = leer("components/tecnicos/ordenes/lista/TableroOrdenes.tsx");
assert(!tablero.includes("draggable") && !tablero.includes("onDrag"), "no se arrastran tarjetas (el estado cambia dentro de la orden)");
assert(tablero.includes("sg-destello_700ms") && tablero.includes("Para baja") && tablero.includes("Buscar en todas (Lista)"), "destello al cambiar de columna, grupo «Para baja» y «Buscar en todas»");
assert(tablero.includes('role="tablist"') && tablero.includes("md:hidden"), "en el celular, una etapa a la vez");

const lista = leer("components/tecnicos/ordenes/lista/ListaOrdenes.tsx");
assert(lista.includes("resumen=0") && lista.includes("/api/tecnicos/ordenes/conteos"), "la Lista pide sin conteos pesados y los números de bandeja aparte");
assert(lista.includes("IconoReciclaje") && lista.includes("rgba(255,122,112,.08)"), "reciclaje: basurero rojo y fondo rojizo");
assert(['"Abiertas"', '"Para baja"', '"Entregadas"', '"Reciclaje"'].every((x) => lista.includes(x)), "cuatro bandejas");
// R8b (revisión UX de Claude Code): si falla la lectura no se queda en «Cargando…»; la leyenda de baja va en tooltip; la búsqueda no repite su aviso al pie.
assert(lista.includes("No se pudieron leer las órdenes abiertas.") && vistas.includes("fallo={fallo} onReintentar="), "si falla la lectura de abiertas, la Lista ofrece reintentar");
assert(!lista.includes("<span>Sin completar: desde el ingreso") && lista.includes('title="Sin completar: desde el ingreso.'), "«Para baja»: la explicación va en tooltip de la cabecera");
assert(!lista.includes('"En todas las bandejas"'), "la búsqueda no repite «en todas las bandejas» al pie");
assert(existsSync("app/api/tecnicos/ordenes/conteos/route.ts") && leer("app/api/tecnicos/ordenes/conteos/route.ts").includes("5 * 60_000"), "los conteos de bandeja se guardan 5 minutos");

// Datos
const airtable = leer("lib/tecnicos/airtable/index.ts");
assert(/nuevoEstado === "Completado"[\s\S]{0,120}"Completada el"/.test(airtable), "al pasar a Completado se escribe «Completada el»");
assert(airtable.includes('"Fecha de entrega",\n    "Estado cambiado el",\n    "Responsable",'), "la lista trae fecha de entrega, cambio de estado y responsable");
const servidor = leer("lib/tecnicos/alertas/servidor.ts");
assert(servidor.includes('completada: "Completada el"') && servidor.includes("tablero.push(") && servidor.includes("compartirLectura("), "la lectura de alertas arma el tablero, con la fecha de completada y compartida");
assert(leer("lib/tecnicos/alertas/reglas.ts").includes("if (evaluarBaja(o, ahora)) return [];"), "las de baja no suenan como alerta (están en «Para baja»)");
assert(leer("lib/tecnicos/orders/abandonmentPolicy.ts").includes("@/lib/tecnicos/orden/baja"), "la orden y su WhatsApp usan la misma regla de baja");

// Dentro de la orden
const orden = leer("app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx");
assert(orden.includes("Enviar a reciclaje") && orden.includes("Sí, enviar a reciclaje") && !orden.includes("Marcar baja interna"), "el botón de la franja dice «Enviar a reciclaje» y pide confirmación");
assert(leer("app/api/tecnicos/ordenes/[id]/baja-interna/route.ts").includes("motivoReciclaje(baja)"), "lo que queda en la Actividad dice desde cuándo se contó");

// Actividad: el guardado automático avisa si falla
const actividad = leer("components/tecnicos/ordenes/ActividadCard.tsx");
assert(actividad.includes("No se guardó · reintentar") && !actividad.includes('ocupado !== "guardar") setGuardado("listo")'), "si el guardado automático falla, dice «No se guardó · reintentar»");

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");
