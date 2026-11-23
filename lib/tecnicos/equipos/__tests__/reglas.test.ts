/**
 * Test — ficha del equipo y contraseña (rediseño de la orden, R4 + R5).
 * Ejecutar: npm test equipos
 */
import { claveEquipo, extraerContrasena, historiaSinActual, interpretarEquipo, nombreEquipo, revisarDatosEquipo } from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Interpretar el texto viejo (ejemplos reales de las órdenes)
const casos: Array<[string, { tipo: string; marca: string; modelo: string; serie: string }]> = [
  ["Laptop HP 14-dq1004la SN SCD04450QJ", { tipo: "Laptop", marca: "HP", modelo: "14-dq1004la", serie: "SCD04450QJ" }],
  ["Laptop Dell Latitude 7400 ST 4F1N3X2", { tipo: "Laptop", marca: "Dell", modelo: "Latitude 7400", serie: "4F1N3X2" }],
  ["Laptop Lenovo Thinkpad 480S S/8265NGW", { tipo: "Laptop", marca: "Lenovo", modelo: "Thinkpad 480S", serie: "8265NGW" }],
  ["Laptop Lenovo Thinkpad P14S S:JVHFC1", { tipo: "Laptop", marca: "Lenovo", modelo: "Thinkpad P14S", serie: "JVHFC1" }],
  ["Impresora Epson L2010", { tipo: "Impresora", marca: "Epson", modelo: "L2010", serie: "" }],
  ["Consola PlayStation 4", { tipo: "Consola", marca: "Sony", modelo: "PlayStation 4", serie: "" }],
  ["Macbook Air A2337 13", { tipo: "Laptop", marca: "Apple", modelo: "Macbook Air A2337 13", serie: "" }],
  ["Hp Chromebook 11", { tipo: "Laptop", marca: "HP", modelo: "Chromebook 11", serie: "" }],
  ["Desktop Genérico Intel Pentium HDD 2GB RAM", { tipo: "Computador de escritorio", marca: "Genérico", modelo: "Intel Pentium HDD 2GB RAM", serie: "" }],
  ["Laptop Asus TUF Gaming A15 SN SANRCX012382418", { tipo: "Laptop", marca: "Asus", modelo: "TUF Gaming A15", serie: "SANRCX012382418" }],
  ["Proyector Epson Power Lite S6+", { tipo: "Otro", marca: "Epson", modelo: "Proyector Power Lite S6+", serie: "" }],
];
for (const [texto, esperado] of casos) {
  const r = interpretarEquipo(texto);
  assert(eq(r, esperado), `«${texto}» → ${JSON.stringify(r)}`);
}
assert(nombreEquipo({ tipo: "Laptop", marca: "HP", modelo: "14-dq1004la" }) === "HP 14-dq1004la", "nombre de la ficha");
assert(nombreEquipo({ tipo: "Laptop", marca: "", modelo: "" }) === "Laptop", "sin marca ni modelo: el tipo");

// Clave para no repetir fichas
{
  const a = interpretarEquipo("Laptop HP 14-dq1004la SN SCD04450QJ");
  const b = interpretarEquipo("Laptop Hp 14-DQ1004LA sn scd04450qj");
  assert(claveEquipo("recC", a) === claveEquipo("recC", b), "misma serie del mismo cliente: una sola ficha");
  assert(claveEquipo("recC", interpretarEquipo("Laptop HP 14")) === claveEquipo("recC", interpretarEquipo("laptop  hp 14")), "sin serie: por nombre");
  assert(claveEquipo("recC", a) !== claveEquipo("recD", a), "otro cliente: otra ficha");
}

// Contraseña en la nota interna (ejemplos reales)
const notas: Array<[string, string | null, string, string]> = [
  // nota, contraseña esperada, confianza, resto
  ["PIN: 2008", "2008", "alta", ""],
  ["Clave: 7274", "7274", "alta", ""],
  ["Contraseña es 2001", "2001", "alta", ""],
  ["Contraseña: Familia", "Familia", "alta", ""],
  ["102010 PIN", "102010", "alta", ""],
  ["Contraseña: del 1 al 7", "del 1 al 7", "alta", ""],
  ["Pass 12345. Pitido al encender por un error", "12345", "alta", "Pitido al encender por un error"],
  ["Password> 095960", "095960", "alta", ""],
  ["Pass: \nflamenco21", "flamenco21", "alta", ""],
  ["Antiguo motivo de ingreso: Diagnóstico completo por lentitud. Pass:171717", "171717", "alta", "Antiguo motivo de ingreso: Diagnóstico completo por lentitud."],
  ["Pass> 2004. Antiguo motivo de ingreso: No enciende.", "2004", "alta", "Antiguo motivo de ingreso: No enciende."],
  ["Contraseña 2004. Equipo L2841", "2004", "alta", "Equipo L2841"],
  ["Bajo garantía parcial\nClave: 959595", "959595", "alta", "Bajo garantía parcial"],
  ["Ventilador con ruido. Probar.\nPassword : 0506 o 0605", "0506 o 0605", "alta", "Ventilador con ruido. Probar."],
  ["06072006", "06072006", "media", ""],
  ["1996", "1996", "media", ""],
];
for (const [nota, c, conf, resto] of notas) {
  const r = extraerContrasena(nota);
  assert(!!r && r.contrasena === c && r.confianza === conf && r.resto === resto, `«${nota.replace(/\n/g, "⏎")}» → ${JSON.stringify(r)}`);
}
{
  const r = extraerContrasena("Constraseñas: \nMOTOROLA\n: 2222 IPHONE: 061983");
  assert(!!r && r.contrasena.includes("2222") && r.contrasena.includes("061983"), "varias contraseñas en varias líneas: se guardan juntas");
}
// Casos reales que NO son la contraseña del equipo (vista previa del 22-nov)
for (const nada of [
  "Cliente informa que cambio pin de carga previamente.\n***Tiene informacion importante",
  "Clave de Office 2024 Stander:GQTY6-7NHV8-V8C7C-YHMK8-F3QTJ",
  "La portátil ingresa por respaldo, formateo y instalación de Windows 11 Pro y Antivirus:Pediente activar la licencia de windows 11 Pro,\n\nCLAVE Windows 11 Pro :               TVDNM-WCBKD-7RYYW-BCY88-K2FC6\nOrder ID : 1916585",
]) {
  assert(extraerContrasena(nada) === null, `no es contraseña del equipo: «${nada.slice(0, 50).replace(/\n/g, "⏎")}…»`);
}
{
  const r = extraerContrasena("Clave de Windows: 0401956768\n\nAnterior motivo de ingreso> No enciende");
  assert(r === null, "«Clave de Windows» no es la contraseña del equipo");
  const pin2 = extraerContrasena("PIN 170608 PIN 230924");
  assert(!!pin2 && pin2.contrasena === "170608 PIN 230924", "dos PIN: se guardan juntos");
  const larga = extraerContrasena("Deja laptop HP para reciclaje con cargador de orden 61\n\nPIN: 299998\n\n---\n\nSe apaga aleatoriamente");
  assert(!!larga && larga.contrasena === "299998" && !larga.resto.includes("299998"), "PIN en medio de una nota larga");
}
for (const nada of ["0989058550", "Equipo sufrio una caida", "SN: MP1FA388", "Se puede formatear", ""]) {
  assert(extraerContrasena(nada) === null, `sin contraseña: «${nada}»`);
}

// Historia y datos
{
  const h = historiaSinActual([
    { id: "a", codigo: "OR1", fecha: "2026-01-01", estado: "Finalizado Entregado", motivo: "x", tipoRegreso: "" },
    { id: "b", codigo: "OR2", fecha: "2026-06-01", estado: "Finalizado Entregado", motivo: "y", tipoRegreso: "" },
    { id: "c", codigo: "OR3", fecha: "2026-11-01", estado: "En Proceso", motivo: "z", tipoRegreso: "" },
  ], "c");
  assert(h.map((o) => o.codigo).join(",") === "OR2,OR1", "historia sin la orden actual, más reciente arriba");
  assert(!revisarDatosEquipo({ tipo: "Nave", marca: "HP" }).ok && !revisarDatosEquipo({ tipo: "Laptop" }).ok, "pide tipo válido y marca o modelo");
  const d = revisarDatosEquipo({ tipo: "Laptop", marca: " HP ", modelo: "14  dq", serie: "scd04450qj" });
  assert(d.ok && d.datos.serie === "SCD04450QJ" && d.datos.modelo === "14 dq", "limpia los datos");
}

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
