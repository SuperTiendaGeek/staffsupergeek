/**
 * Test — pantalla del cliente (etapa 10E-B).
 * Ejecutar: npm test pantalla-cliente
 */
import {
  MINUTOS_SIN_ACTIVIDAD, SEGUNDOS_GRACIAS, alLeerLaCuenta, alPasarElTiempo, aplicarComando, cobrarDeLaUrl, mensajeCobro,
  pantallaConectada, reposo, urlConCobro, type CobroEnPantalla,
} from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const T0 = Date.parse("2026-11-18T15:00:00Z");
const cobro: CobroEnPantalla = {
  origen: "orden", id: "recOR", codigo: "OR000507", cliente: "Camila", detalle: "Lenovo IdeaPad 3",
  lineas: [{ descripcion: "Bisagras", monto: 30, nota: "aprobado" }], total: 145, pagado: 105, falta: 40,
  para: "Lo que falta", vasAPagar: 40, url: "https://staff.supertiendageek.com/presupuesto/abc?cobrar=Lo+que+falta",
};

// Comandos del empleado.
const enCobro = aplicarComando(reposo(T0), { tipo: "mostrar_cobro", cobro }, T0);
assert(enCobro.vista === "cobro", "Mostrar en la pantalla del cliente → cobro");
assert(aplicarComando(enCobro, { tipo: "reposo" }, T0).vista === "reposo", "Volver al reposo");
assert(aplicarComando(enCobro, { tipo: "quien_esta" }, T0) === enCobro, "preguntar si está no cambia nada");

// Pago detectado al leer la cuenta.
assert(alLeerLaCuenta(enCobro, { pagado: 105, falta: 40 }, T0 + 4000) === enCobro, "sin pago nuevo: sigue cobrando");
const gracias = alLeerLaCuenta(enCobro, { pagado: 145, falta: 0 }, T0 + 8000);
assert(gracias.vista === "gracias" && gracias.recibido === 40 && gracias.cobro.falta === 0, "pagó $40: ¡Gracias! y la cuenta queda en $0");
assert(alLeerLaCuenta(reposo(T0), { pagado: 999, falta: 0 }, T0).vista === "reposo", "en reposo no se muestra nada aunque cambie la cuenta");

// Vuelta al reposo (dueño, 17-nov).
assert(alPasarElTiempo(gracias, T0 + 8000 + (SEGUNDOS_GRACIAS - 1) * 1000).vista === "gracias", "el ¡Gracias! se queda 30 s");
assert(alPasarElTiempo(gracias, T0 + 8000 + SEGUNDOS_GRACIAS * 1000).vista === "reposo", "a los 30 s vuelve al logo");
assert(alPasarElTiempo(enCobro, T0 + (MINUTOS_SIN_ACTIVIDAD * 60 - 1) * 1000).vista === "cobro", "el cobro espera hasta 3 minutos");
assert(alPasarElTiempo(enCobro, T0 + MINUTOS_SIN_ACTIVIDAD * 60_000).vista === "reposo", "a los 3 minutos sin nada nuevo vuelve al logo");

// Tiempos de Administrar (10E-C): 5 minutos sin actividad.
assert(alPasarElTiempo(enCobro, T0 + 4 * 60_000, { segundosGracias: 30, minutosSinActividad: 5 }).vista === "cobro", "con 5 min configurados, a los 4 sigue cobrando");
assert(alPasarElTiempo(gracias, T0 + 8000 + 15_000, { segundosGracias: 15, minutosSinActividad: 3 }).vista === "reposo", "con 15 s configurados, el ¡Gracias! se va a los 15 s");

// Conexión por latido.
assert(pantallaConectada(T0, T0 + 5000), "latido hace 5 s: conectada");
assert(!pantallaConectada(T0, T0 + 7000), "sin latido 7 s: apagada");
assert(!pantallaConectada(null, T0), "nunca hubo latido: apagada");

// El QR abre la cajita lista.
const u = urlConCobro("https://staff.supertiendageek.com/presupuesto/abc", "Lo que falta");
assert(cobrarDeLaUrl(new URL(u).search) === "Lo que falta", "el enlace lleva la opción y se vuelve a leer igual");
assert(cobrarDeLaUrl("?cobrar=999") === null && cobrarDeLaUrl("") === null, "una opción inventada se ignora");
assert(mensajeCobro({ nombre: "Camila Andrade", codigo: "OR000507", monto: 40, url: "https://x" }) === "Hola Camila, aquí puedes pagar $40.00 de tu orden OR000507 en línea: https://x",
  "mensaje de WhatsApp sin datos internos");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
