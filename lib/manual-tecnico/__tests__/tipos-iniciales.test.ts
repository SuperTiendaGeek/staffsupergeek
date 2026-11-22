/**
 * Test — tipos de las 8 notas que ya había en el Manual Técnico (punto 11B · 21-nov-2026).
 * Ejecutar: npm test tipos-iniciales
 */
import { planTiposIniciales, type RegistroNota } from "../tipos-iniciales";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Los 8 registros tal como estaban el 21-nov-2026.
const reales: RegistroNota[] = [
  { id: "reclf07pNnkDX5mMM", cod: 1, notas: "Tecla de Booteo laptops Dell con F2 para entrar a BIOS.\n", claves: "", tipo: "", estado: "" },
  { id: "recCPxUR72lQhpSPa", cod: 2, notas: "Tecla para opciones de Booteo laptops Dell con F12.", claves: "", tipo: "", estado: "" },
  { id: "recPUlkbRpCjElS0A", cod: 3, notas: "", claves: "", tipo: "", estado: "" },
  { id: "recvRIv8G6k7SfD0h", cod: 4, notas: "No recibir impresoras que tengan sistema de tintas no originales.", claves: "", tipo: "", estado: "" },
  { id: "recL9zWMRpesCInhP", cod: 5, notas: "No recibir impresoras Canon de cartucho", claves: "", tipo: "", estado: "" },
  { id: "rec0xz6bl3W1PUkp7", cod: 6, notas: "\nMicrosoft Office Professional Plus 2021 (PC) (5 Devices, Lifetime) GLOBAL $55 https://www.g2a.com/…", claves: "", tipo: "", estado: "" },
  { id: "recHchHmNBw8fpqiY", cod: 7, notas: ":: ====\n:: ACTUALIZAR BIOS DELL SIN BATERÍA USANDO /forceit\n:: ====", claves: "", tipo: "", estado: "" },
  { id: "reczpNMAER7AruZUK", cod: 8, notas: "create partition primary\nselect partition 1\nformat fs=ntfs quick\nassign\nexit", claves: "formatear, comandos, cmd, usb, hdd, diskpart", tipo: "", estado: "" },
];

{
  const p = planTiposIniciales(reales);
  assert(p.acciones.length === 8 && p.saltadas.length === 0, "las 8 notas reciben su tipo");
  const cuenta = (t: string) => p.acciones.filter((a) => a.tipo === t).length;
  assert(cuenta("Procedimiento") === 4 && cuenta("Regla de la tienda") === 2 && cuenta("Nota") === 2, "4 procedimientos, 2 reglas de la tienda y 2 notas (tablero 9)");
  assert(p.acciones.every((a) => a.estado === "Verificada"), "todas quedan verificadas (las escribió la tienda)");
  assert(p.acciones.find((a) => a.cod === 7)?.resumen === "ACTUALIZAR BIOS DELL SIN BATERÍA USANDO /forceit", "el resumen salta los adornos");
}
{
  const ya = reales.map((r) => ({ ...r, tipo: "Procedimiento", estado: "Verificada" }));
  assert(planTiposIniciales(ya).acciones.length === 0, "después de aplicar, la vista previa queda en 0");
}
{
  const cambiada = reales.map((r) => (r.cod === 5 ? { ...r, notas: "Impresoras: revisar antes de recibir" } : r));
  const p = planTiposIniciales(cambiada);
  assert(p.acciones.length === 7 && p.saltadas[0]?.cod === 5, "si alguien cambió una nota, se salta y se avisa");
  const llena = reales.map((r) => (r.cod === 3 ? { ...r, notas: "algo" } : r));
  assert(planTiposIniciales(llena).saltadas[0]?.motivo === "ya no está vacía", "la vacía solo se ajusta si sigue vacía");
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
