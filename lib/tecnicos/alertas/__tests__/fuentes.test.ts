/**
 * Test de fuentes — alertas de atención (rediseño R10, tableros 10 y 11).
 * Ejecutar: npm test alertas/__tests__/fuentes
 */
import { existsSync, readFileSync } from "node:fs";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const leer = (p: string) => readFileSync(p, "utf8");

// Barra de arriba
const marco = leer("components/staff/StaffAppFrame.tsx");
assert(marco.includes('apps.some((a) => a.id === "tecnicos") ? <AlertasBarra />'), "el botón de alertas sale en la barra solo a quien usa Técnicos");
const barra = leer("components/tecnicos/alertas/AlertasBarra.tsx");
assert(barra.includes("setInterval") && barra.includes("visibilitychange") && barra.includes("EVENTO_ALERTAS"), "la barra se actualiza sola, al volver a la pestaña y al cambiar algo en una orden");
assert(barra.includes('href="/tecnicos/alertas"') && barra.includes("datos.esAdmin &&"), "«Ajustes» solo para administrador");
assert(!/animate-\[sg-latido[^\]]*infinite/.test(barra) && barra.includes("sg-latido_400ms"), "el latido del botón rojo es una sola vez y dura 400 ms");
assert(barra.includes("No se pudieron leer las alertas"), "si no se pueden leer las alertas, se ve (no parece «todo al día»)");

// Dentro de la orden
const pantalla = leer("app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx");
assert(/!cerrada && \(?\s*<AlertaFranja/.test(pantalla), "la franja de alerta está en la orden (no en las cerradas)");
assert(pantalla.includes("avisarCambioAlertas()"), "cambiar el responsable avisa a la barra");
const franja = leer("components/tecnicos/alertas/AlertaFranja.tsx");
assert(franja.includes("JSON.stringify({ hasta: fecha, motivo })"), "posponer manda fecha y motivo");
assert(franja.includes("disabled={guardando || !listo}") && franja.includes("motivo.trim().length >= 5"), "«Posponer» se activa solo con fecha y motivo");
assert(franja.includes("proximoDiaHabil(ahora, horario, 1)") && leer("app/api/tecnicos/ordenes/[id]/alerta/route.ts").includes("horario: config.horario"), "los atajos usan el horario guardado en Ajustes");
const actividad = leer("components/tecnicos/ordenes/ActividadCard.tsx");
assert(actividad.includes("pedirNota"), "«Anotar avance» abre la nota interna de la Actividad");

// Una sola lectura de alertas para la barra y la lista (menos consultas a Airtable)
assert(barra.includes("leerAlertasCompartidas(") && leer("app/tecnicos/ordenes/OrdenesPageClient.tsx").includes("leerAlertasCompartidas("), "la barra y la lista comparten la lectura de alertas");
const panel = leer("components/tecnicos/ordenes/PanelCobros.tsx");
assert(panel.includes("j.ocupado") && panel.includes("30_000") && leer("app/api/tecnicos/ordenes/cobros/route.ts").includes("ocupado: true"), "panel de cobros: si Airtable está ocupado, aviso corto y otro intento solo (sin el error crudo)");

// Lista
const lista = leer("app/tecnicos/ordenes/OrdenesPageClient.tsx");
assert(lista.includes('"Atención"') && lista.includes('"Por vencer"') && lista.includes('"Sin responsable"'), "la lista tiene los filtros de alertas");
assert(!lista.includes("Alertas de abandono") && !lista.includes("Limpiar filtro"), "ya no está la tarjeta vieja «Alertas de abandono»");
assert(lista.includes("?alerta="), "la barra abre la lista ya filtrada");

// Último movimiento al escribir en la Actividad
const historial = leer("lib/tecnicos/airtable/index.ts");
assert(/cuentaComoMovimiento\(tipoActividad\)[\s\S]{0,300}"Último movimiento"/.test(historial), "cada entrada de una persona en la Actividad actualiza «Último movimiento»");

// Ajustes: todos ven, solo administrador guarda
const ajustes = leer("app/api/tecnicos/alertas/ajustes/route.ts");
assert(/export async function PUT[\s\S]*isAdministratorRole\(session\.user\.rol\)[\s\S]*status: 403/.test(ajustes), "solo un administrador cambia los ajustes");
assert(existsSync("app/tecnicos/alertas/page.tsx"), "existe la pantalla de ajustes");
const pantallaAjustes = leer("app/tecnicos/alertas/AjustesAlertasClient.tsx");
assert(pantallaAjustes.includes("disabled={!esAdmin}") && pantallaAjustes.includes("Dom no cuenta"), "ajustes: solo lectura para quien no es administrador; el domingo no cuenta");
const posponer = leer("app/api/tecnicos/ordenes/[id]/alerta/route.ts");
assert(posponer.includes("posponerAlerta"), "posponer pasa por el servidor (queda en la Actividad)");
assert(leer("lib/tecnicos/alertas/servidor.ts").includes('tipoActividad: "Alerta pospuesta"'), "posponer queda en la Actividad con su motivo");

// Asistente: la tarjeta se llama «Guías» (no siempre hay fotos)
assert(!leer("components/asistente/AsistentePanel.tsx").includes("Guías con fotos"), "la tarjeta del asistente se llama «Guías»");

// Tailwind lee lib/**: nada de corchetes con dos puntos
for (const p of ["lib/tecnicos/alertas/reglas.ts", "lib/tecnicos/alertas/servidor.ts", "lib/tecnicos/alertas/migracion.ts"]) {
  assert(!/\[[^\]\n\s]*:[^\]\n\s]*\]/.test(leer(p)), `${p} no tiene corchetes con «:» (rompen el CSS)`);
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");
