/**
 * Test — ajuste de datos del punto 5A ("Elfina.8990" en la clave).
 * Ejecutar: npm test ajuste-5a
 */
import { planLimpiezaClave } from "../ajuste-5a";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const plan = planLimpiezaClave([
  { id: "a", sku: "DIG-000010", producto: "Office 365 Education", tipo: "Usuario/Contraseña", clave: "Elfina.8990", tienePdf: true },
  { id: "b", sku: "DIG-000011", producto: "Office 365 Education", tipo: "Usuario/Contraseña", clave: " Elfina.8990 ", tienePdf: false },
  { id: "c", sku: "DIG-000012", producto: "Windows 11 Pro", tipo: "Clave de activación", clave: "Elfina.8990", tienePdf: true },
  { id: "d", sku: "DIG-000013", producto: "Office 365 Education", tipo: "Usuario/Contraseña", clave: null, tienePdf: true },
  { id: "e", sku: "DIG-000014", producto: "Otro", tipo: "Otro", clave: "Elfina.8990", tienePdf: true },
]);
assert(plan.map((p) => p.id).join() === "a,b", "solo unidades de usuario/contraseña con el valor autocompletado");
assert(plan[0].quitarPdf && !plan[1].quitarPdf, "quita el PDF guardado solo si había uno");
assert(planLimpiezaClave([]).length === 0, "sin unidades: nada");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nAjuste 5A: todo OK");
