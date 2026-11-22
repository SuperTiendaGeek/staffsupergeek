/**
 * Test — Manual técnico, biblioteca de soluciones probadas (punto 11B · 21-nov-2026).
 * Ejecutar: npm test manual-tecnico
 *
 * Caso del dueño: HP EliteBook 840 G3, no funciona ninguna tecla → era
 * «Inicio rápido» de Windows. Si vuelve el mismo modelo con el mismo síntoma,
 * el técnico experto lo muestra primero.
 */
import {
  aplicarVoto, accionesPermitidas, buscarCoincidencias, camposCorreccion, camposNuevaNota, camposNuevaSolucion,
  codigoManual, entradaDesdeRegistro, errorFicha, errorNota, fechaCortaEc, hayMaterialParaFicha, limpiarEquipo,
  normalizarBorrador, normalizarFicha, parsearUsos, pasosDeSolucion, textoNotaVoto, tituloEntrada, tokens,
  CAMPOS_MANUAL as C, type EntradaManual,
} from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const entrada = (o: Partial<EntradaManual> = {}): EntradaManual => ({
  id: "recMT", cod: 12, codigo: "MT-000012", tipo: "Solución", estado: "Verificada",
  marca: "HP", modelo: "EliteBook 840 G3", sistema: "Windows 10 Pro",
  sintoma: "No funciona ninguna tecla; el touchpad sí.", causa: "«Inicio rápido» de Windows no vuelve a cargar el controlador del teclado.",
  solucion: "Opciones de energía → Elegir el comportamiento de los botones\nDesmarcar «Activar inicio rápido»\nReiniciar y probar",
  noFunciono: "Cambiar el teclado", notas: "", claves: "", ordenOrigen: "OR000580",
  usos: "OR000580 · Funcionó · Kevin · 20/11/2026 · origen", vecesFunciono: 1, vecesFallo: 0,
  registradoPor: "Kevin", verificadoPor: "", fechaVerificacion: "", creado: "", ...o,
});

// ── El equipo, sin número de serie ──────────────────────────────────────────
assert(limpiarEquipo("Laptop Dell Latitude 7400 ST 4F1N3X2") === "Laptop Dell Latitude 7400", "quita «ST …» (service tag)");
assert(limpiarEquipo("Laptop Lenovo Thinkpad 480S S/8265NGW") === "Laptop Lenovo Thinkpad 480S", "quita «S/…» pegado");
assert(limpiarEquipo("Laptop Lenovo ThinkPad T570 SN R9-0PZGKQ 18/02") === "Laptop Lenovo ThinkPad T570", "quita «SN …» y lo que sigue");
assert(limpiarEquipo("Laptop HP 14-CK0004LA") === "Laptop HP 14-CK0004LA", "no toca el número de modelo");
assert(limpiarEquipo("Cooler Marvo FN-43") === "Cooler Marvo FN-43", "no toca equipos sin serie");
assert(tokens("Laptop HP EliteBook 840 G3, color plata").join(" ") === "hp elitebook 840 g3", "palabras útiles, sin tildes ni palabras vacías");

// ── Buscar lo probado ───────────────────────────────────────────────────────
const g3 = entrada();
const g2 = entrada({ id: "recG2", codigo: "MT-000009", modelo: "EliteBook 840 G2", sintoma: "Algunas teclas no responden", causa: "Conector del teclado sucio", estado: "Probada" });
const t480 = entrada({ id: "recT480", codigo: "MT-000010", marca: "Lenovo", modelo: "ThinkPad T480s", sintoma: "Se apaga la imagen al mover la pantalla", causa: "Flex pelado" });
const archivada = entrada({ id: "recArch", estado: "Archivada" });
const bateria = entrada({ id: "recBat", codigo: "MT-000013", sintoma: "No carga la batería", causa: "Conector DC", vecesFunciono: 5 });
const notaDell = entrada({ id: "recDell", tipo: "Procedimiento", marca: "", modelo: "", notas: "Tecla de Booteo laptops Dell con F2 para entrar a BIOS." });
const regla = entrada({ id: "recRegla", tipo: "Regla de la tienda", marca: "", modelo: "", notas: "No recibir impresoras Canon de cartucho" });
const todas = [g3, g2, t480, archivada, bateria, notaDell, regla];

{
  const c = buscarCoincidencias(todas, { equipo: "Laptop HP Elitebook 840 G3 SN 5CG7041XYZ", sintoma: "el teclado no responde, ninguna tecla" });
  assert(c.probadas.map((e) => e.id).join(",") === "recMT,recBat", "mismo modelo: primero la del síntoma parecido (teclado), luego la otra");
  assert(c.parecidas.map((e) => e.id).join(",") === "recG2", "la del EliteBook 840 G2 sale como «Parecida»");
  assert(!c.probadas.some((e) => e.id === "recArch"), "una solución archivada nunca se muestra");
  assert(c.relacionadas.length === 0, "las notas de Dell no salen para una HP");
}
{
  const c = buscarCoincidencias(todas, { equipo: "Laptop Lenovo Thinkpad 480S S/8265NGW", sintoma: "" });
  assert(c.probadas.map((e) => e.id).join(",") === "recT480", "«Thinkpad 480S» encuentra la del ThinkPad T480s");
}
{
  const c = buscarCoincidencias(todas, { equipo: "Laptop Dell Latitude 7400 ST 4F1N3X2", sintoma: "no enciende" });
  assert(c.probadas.length === 0 && c.parecidas.length === 0, "otra marca: nada probado");
  assert(c.relacionadas.map((e) => e.id).join(",") === "recDell", "pero sí el procedimiento de la tienda para Dell");
}
assert(buscarCoincidencias(todas, { equipo: "", sintoma: "x" }).probadas.length === 0, "sin equipo no busca");

// ── Leer la tabla ───────────────────────────────────────────────────────────
{
  const vieja = entradaDesdeRegistro({ id: "recOld", fields: { "Cod.": 7, Notas: ":: ======\n:: ACTUALIZAR BIOS DELL SIN BATERÍA USANDO /forceit\n:: ======" } });
  assert(vieja.tipo === "Nota" && vieja.estado === "Verificada", "una nota vieja sin Tipo ni Estado se lee como Nota verificada");
  assert(vieja.codigo === "MT-000007" && codigoManual(12) === "MT-000012", "código MT-000007");
  assert(tituloEntrada(vieja) === "ACTUALIZAR BIOS DELL SIN BATERÍA USANDO /forceit", "el título salta los adornos «::» y «===»");
  const nueva = entradaDesdeRegistro({ id: "recN", fields: { [C.tipo]: { name: "Solución" }, [C.marca]: "HP", [C.modelo]: "EliteBook 840 G3" } });
  assert(nueva.tipo === "Solución" && nueva.estado === "Probada" && tituloEntrada(nueva) === "HP EliteBook 840 G3", "una solución sin estado se lee como Probada");
}
assert(pasosDeSolucion("1. Abrir\n2) Desmarcar\n- Reiniciar\n\n").join("|") === "Abrir|Desmarcar|Reiniciar", "pasos sin la numeración");

// ── La ficha ────────────────────────────────────────────────────────────────
{
  const f = normalizarFicha({ marca: "HP", modelo: "EliteBook 840 G3 SN 5CG7041XYZ", sintoma: "No funciona ninguna tecla", causa: "Inicio rápido", solucion: "1. Desmarcar\n2. Reiniciar" });
  assert(f.modelo === "EliteBook 840 G3", "el modelo de la ficha nunca lleva la serie");
  assert(f.solucion.join("|") === "Desmarcar|Reiniciar", "los pasos pueden venir en texto o en lista");
  assert(errorFicha(f) === null, "ficha completa: sin error");
  assert(errorFicha({ ...f, modelo: "", marca: "" })?.includes("marca") === true, "sin equipo: pide marca y modelo");
  assert(errorFicha({ ...f, sintoma: "" })?.includes("síntoma") === true, "sin síntoma: lo pide");
  assert(errorFicha({ ...f, causa: "", solucion: [] })?.includes("causa") === true, "sin causa ni pasos: los pide");

  const ahora = "2026-11-21T22:30:00.000Z";
  const tec = camposNuevaSolucion(f, { ordenCodigo: "OR000580", usuario: "Kevin", esAdmin: false, ahora });
  assert(tec[C.estado] === "Probada" && !(C.verificadoPor in tec), "la guarda un técnico: queda Probada (por verificar)");
  assert(tec[C.vecesFunciono] === 1 && tec[C.vecesFallo] === 0, "la orden de origen cuenta como la primera vez que funcionó");
  assert(tec[C.usos] === "OR000580 · Funcionó · Kevin · 21/11/2026 · origen", "anota la orden de origen");
  assert(tec[C.tipo] === "Solución" && tec[C.ordenOrigen] === "OR000580", "tipo Solución con su orden de origen");
  const adm = camposNuevaSolucion(f, { ordenCodigo: "OR000580", usuario: "Dueño", esAdmin: true, ahora });
  assert(adm[C.estado] === "Verificada" && adm[C.verificadoPor] === "Dueño" && adm[C.fechaVerificacion] === ahora, "si la guarda un administrador queda verificada de una vez");
}
assert(fechaCortaEc("2026-11-21T03:00:00.000Z") === "20/11/2026", "fecha de Ecuador (UTC-5)");

// ── Notas a mano ────────────────────────────────────────────────────────────
assert(errorNota({ tipo: "Solución", texto: "x", claves: "" }) !== null, "+ Nota no crea soluciones (esas salen de una orden)");
assert(errorNota({ tipo: "Regla de la tienda", texto: "  ", claves: "" }) !== null, "+ Nota pide el texto");
{
  const n = camposNuevaNota({ tipo: "Regla de la tienda", texto: " No recibir impresoras Canon de cartucho ", claves: "impresoras" }, { usuario: "Maritza", esAdmin: false, ahora: "2026-11-21T22:30:00.000Z" });
  assert(n[C.notas] === "No recibir impresoras Canon de cartucho" && n[C.estado] === "Probada", "una nota de un técnico también queda por verificar");
}

// ── Reusar es revisar (un toque) ────────────────────────────────────────────
{
  const ahora = "2026-11-22T15:00:00.000Z";
  const v1 = aplicarVoto(g3, { ordenCodigo: "OR000598", funciono: true, usuario: "Joseph", ahora });
  assert(v1.vecesFunciono === 2 && v1.vecesFallo === 0 && !v1.pasaARevisar, "Funcionó suma uno");
  assert(parsearUsos(String(v1.campos[C.usos])).length === 2, "anota la orden donde se usó");
  assert(!(C.estado in v1.campos), "Funcionó no cambia el estado");

  const repetido = aplicarVoto({ ...g3, usos: String(v1.campos[C.usos]), vecesFunciono: 2 }, { ordenCodigo: "OR000598", funciono: true, usuario: "Joseph", ahora });
  assert(repetido.yaEstaba && Object.keys(repetido.campos).length === 0, "tocar dos veces lo mismo en la misma orden no suma dos veces");

  const cambio = aplicarVoto({ ...g3, usos: String(v1.campos[C.usos]), vecesFunciono: 2 }, { ordenCodigo: "OR000598", funciono: false, usuario: "Joseph", ahora });
  assert(cambio.vecesFunciono === 1 && cambio.vecesFallo === 1, "si la misma orden cambia a No funcionó, se corrige el conteo");
  assert(cambio.estado === "Para revisar" && cambio.pasaARevisar && cambio.campos[C.estado] === "Para revisar", "No funcionó la deja «Para revisar» (aviso al administrador)");
  assert(parsearUsos(String(cambio.campos[C.usos])).filter((u) => u.orden === "OR000598").length === 1, "una sola línea por orden");

  const otraVez = aplicarVoto({ ...g3, estado: "Para revisar" }, { ordenCodigo: "OR000600", funciono: false, usuario: "Kevin", ahora });
  assert(!otraVez.pasaARevisar, "si ya estaba para revisar no avisa de nuevo");
  const arch = aplicarVoto({ ...g3, estado: "Archivada" }, { ordenCodigo: "OR000600", funciono: false, usuario: "Kevin", ahora });
  assert(arch.estado === "Archivada", "una archivada sigue archivada");
}
assert(textoNotaVoto(g3, true).startsWith("Manual técnico MT-000012") && textoNotaVoto(g3, true).endsWith("funcionó."), "lo que se anota en la nota interna de la orden");

// ── Lo que hace el administrador ────────────────────────────────────────────
assert(accionesPermitidas(false, g3).length === 0, "un técnico no verifica, corrige ni archiva");
assert(accionesPermitidas(true, { estado: "Probada" }).join(",") === "verificar,corregir,archivar", "admin con una por verificar: verificar, corregir, archivar");
assert(accionesPermitidas(true, { estado: "Verificada" }).join(",") === "corregir,archivar", "ya verificada: no se vuelve a verificar");
assert(accionesPermitidas(true, { estado: "Archivada" }).join(",") === "corregir", "archivada: nunca se borra, solo se corrige");
{
  const c = camposCorreccion(g3, { marca: "HP", modelo: "EliteBook 840 G3", sintoma: "x", causa: "y", solucion: ["a"], [C.vecesFunciono]: 99, vecesFunciono: 99 });
  assert(!(C.vecesFunciono in c) && !(C.usos in c) && !(C.estado in c), "corregir nunca toca contadores, usos ni estado");
  const n = camposCorreccion(regla, { texto: "No recibir impresoras Canon", claves: "canon", tipo: "Nota" });
  assert(n[C.notas] === "No recibir impresoras Canon" && n[C.tipo] === "Nota", "en una nota se corrige el texto, las claves y el tipo");
  assert(!(C.tipo in camposCorreccion(regla, { texto: "x", tipo: "Solución" })), "una nota no se convierte en solución");
}

// ── El borrador de la IA ────────────────────────────────────────────────────
{
  const ok = normalizarBorrador({ proponer: true, motivo: "Causa no evidente", marca: "HP", modelo: "EliteBook 840 G3", sintoma: "Sin teclado", causa: "Inicio rápido", solucion: ["Desmarcar"], saleDe: "Historial de Kevin" });
  assert(ok?.proponer === true && ok.saleDe === "Historial de Kevin", "propone cuando la ficha está completa");
  const incompleta = normalizarBorrador({ proponer: true, marca: "HP", modelo: "", sintoma: "x" });
  assert(incompleta?.proponer === false, "si la ficha viene incompleta no la propone");
  const obvio = normalizarBorrador({ proponer: false, motivo: "Solo limpieza" });
  assert(obvio?.proponer === false && obvio.motivo === "Solo limpieza", "respeta cuando la IA dice que no hace falta");
  assert(normalizarBorrador(null) === null, "sin respuesta: null");
}
assert(!hayMaterialParaFicha({ diagnostico: "No disponible", notas: ["En Proceso"] }), "sin diagnóstico ni notas: no se le pregunta a la IA");
assert(hayMaterialParaFicha({ diagnostico: "", notas: ["Se desactivó el inicio rápido y el teclado volvió a funcionar"] }), "con una nota escrita sí");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
