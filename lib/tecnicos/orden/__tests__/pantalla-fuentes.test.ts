/**
 * Test de fuentes — pantalla nueva de la orden (rediseño R1, tablero 1).
 * Revisa que el código siga el diseño aprobado: cabecera de una línea con
 * etapas y «Qué sigue», botón principal según la etapa, columnas en el orden
 * del flujo del taller y el código viejo del historial fuera.
 * Ejecutar: npm test pantalla-fuentes
 */
import { readFileSync } from "node:fs";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const leer = (p: string) => readFileSync(p, "utf8");

const pantalla = leer("app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx");

// ─── Cabecera ────────────────────────────────────────────────────────────────
assert(pantalla.includes("‹ Órdenes") && !pantalla.includes("Volver a órdenes"), "volver es un enlace corto «‹ Órdenes»");
assert(pantalla.includes("<ResponsableSelector") && pantalla.includes("<OrdenEtapas"), "la cabecera tiene responsable y etapas");
assert(/pasosDeLaOrden\(datosEtapas, resumen\)/.test(pantalla) && /queSigue\(datosEtapas, resumen\)/.test(pantalla), "etapas y «Qué sigue» salen de las reglas puras");
assert(pantalla.includes("onResumen={setResumen}"), "el resumen del presupuesto llega con una función estable (sin bucle de renders)");
assert(/sigue\.accion === "avisar"[\s\S]{0,200}setPedirMensaje/.test(pantalla), "Completado sin avisar → «Avisar al cliente» pide el borrador a la Actividad");
assert(/sigue\.accion === "regreso"[\s\S]{0,200}setRegresoAbierto\(true\)/.test(pantalla), "entregada → «Regresó el equipo»");
assert(/sigue\.accion === "entregar" \? BTN_PRINCIPAL : BTN_SECUNDARIO/.test(pantalla), "«Entregar» solo se destaca cuando ya se avisó al cliente");
for (const t of ["Constancia de ingreso", "Etiqueta del equipo", "Etiqueta de mantenimiento"]) {
  assert(pantalla.includes(t), `el menú de imprimir tiene «${t}»`);
}
assert((pantalla.match(/<PrintIcon/g) ?? []).length === 1, "un solo botón de imprimir (antes eran tres enlaces)");

// ─── Columnas en el orden del taller ─────────────────────────────────────────
const i = (t: string) => pantalla.indexOf(t);
assert(i("<MotivoIngresoCard") < i("<PresupuestoCard") && i("<PresupuestoCard") < i("<ActividadCard"), "izquierda: Motivo → Trabajos → Actividad");
assert(i("<ActividadCard") < i("<aside") && i("<aside") < i(">Cliente</p>") && i(">Cliente</p>") < i("<EquipoFicha") && i("<EquipoFicha") < i("<CuentaCard")
  && i("<CuentaCard") < i("<OrdenDocumentosCard") && i("<OrdenDocumentosCard") < i("<OrdenCotizacionCard"), "derecha: Cliente → Equipo → Cuenta → Archivos → Cotización");
assert(!/order-[123]/.test(pantalla), "la columna derecha ya no reordena con order-1/2/3");
// R7: el motivo vive en su tarjeta (chips); ella esconde los «\-» viejos de Recomendaciones.
assert(pantalla.includes("<MotivoIngresoCard") && leer("components/tecnicos/motivos/MotivoIngresoCard.tsx").includes("conTexto(recomendaciones)"), "«Recomendaciones: \\-» de las órdenes viejas no se muestra");

// ─── Código viejo fuera ──────────────────────────────────────────────────────
for (const t of ["handleGenerarMensaje", "pollHistorialMensaje", "handleSaveInline", "saveNotaInterna", "formatTimelineDate", "mensajeVisible"]) {
  assert(!pantalla.includes(t), `ya no está el código viejo del historial (${t})`);
}

// ─── Trabajos (PresupuestoCard) ──────────────────────────────────────────────
const card = leer("components/tecnicos/ordenes/PresupuestoCard.tsx");
assert(!card.includes("Resumen financiero"), "la tarjeta dice «Cuenta», ya no «Resumen financiero»");
assert(!card.includes("Armar el presupuesto no reserva repuestos"), "sin el párrafo de explicación en la cabecera");
assert(card.includes(">Trabajos</h2>"), "la tarjeta se llama «Trabajos»");
assert(card.includes("Renovar y copiar") && card.includes('avisarEnvio("whatsapp")') && card.includes('avisarEnvio("copiado")'), "el enlace va en la cabecera; copiar o WhatsApp marca «Presupuesto enviado»");

// ─── Actividad y rutas ───────────────────────────────────────────────────────
const actividad = leer("components/tecnicos/ordenes/ActividadCard.tsx");
assert(/if \(!pedirMensaje \|\| !datos[\s\S]{0,400}lineaParaAvisar\(datos\.entradas, datos\.estado\)[\s\S]{0,600}mensaje\(id, "crear"\)/.test(actividad), "«Avisar al cliente» crea el mensaje en la línea que toca (Completado → «Estado: Completado»)");
const ruta = leer("app/api/tecnicos/ordenes/[id]/responsable/route.ts");
assert((ruta.match(/requireTecnicosSession\(\)/g) ?? []).length === 2, "la ruta del responsable pide sesión en GET y POST");
const servidor = leer("lib/tecnicos/responsable/servidor.ts");
assert(/asignarResponsable[\s\S]*createHistorialEntrada\([\s\S]*tipoActividad: "Responsable"/.test(servidor), "cada cambio de responsable queda en la Actividad");
const enlace = leer("app/api/tecnicos/ordenes/[id]/presupuesto/enlace/route.ts");
assert(enlace.includes("marcarPresupuestoEnviado(") && enlace.includes("esMedioEnvio(body.enviado)"), "la ruta del enlace marca «Presupuesto enviado»");
const detalle = leer("lib/tecnicos/airtable/index.ts");
assert(detalle.includes('clienteAvisado: typeof f["Cliente avisado"]') && detalle.includes('presupuestoEnviado: typeof f["Presupuesto enviado"]'), "la orden trae «Cliente avisado» y «Presupuesto enviado»");

// ─── Tailwind lee lib/**: nada de corchetes con dos puntos ───────────────────
for (const p of ["lib/tecnicos/orden/etapas.ts", "lib/tecnicos/responsable/reglas.ts", "lib/tecnicos/presupuesto/enviado.ts"]) {
  assert(!/\[[^\]\n]*:[^\]\n]*\]/.test(leer(p).replace(/"[^"\n]*"/g, '""')), `${p} no tiene corchetes con «:» (rompen el CSS)`);
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");
