/**
 * Test — aviso de abono por más de lo que se debe (auditoría ops, punto 22).
 * Ejecutar: npm test aviso-abono
 */
import { avisoAbonoDeMas } from "../aviso-abono";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

assert(avisoAbonoDeMas(60, 60) === null, "paga exactamente lo que debe: sin aviso");
assert(avisoAbonoDeMas(30, 60) === null, "paga una parte: sin aviso");
const a = avisoAbonoDeMas(63, 60);
assert(!!a && a.includes("$3.00") && a.includes("registra $60.00") && a.includes("venta adicional"), "OR000525: $63 con $60 pendientes → avisa los $3 y sugiere registrar $60");
const b = avisoAbonoDeMas(10, 0);
assert(!!b && b.startsWith("La cuenta ya está pagada"), "cuenta pagada: cualquier abono queda de más");
assert(avisoAbonoDeMas(5, -3)?.includes("$5.00") === true, "con saldo a favor ya existente cuenta como pagada");
assert(avisoAbonoDeMas(60.004, 60) === null, "un centavo de redondeo no avisa");
assert(avisoAbonoDeMas(0, 60) === null && avisoAbonoDeMas(NaN, 60) === null, "sin monto: sin aviso");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nAviso de abono de más: todo OK");
