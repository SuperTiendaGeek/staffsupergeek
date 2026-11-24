// Se ejecuta una vez al arrancar cada instancia del servidor (Next.js).
// Pone las llamadas a Airtable en una fila de 8 por segundo por instancia,
// reintenta los 429 (1,5 s, 4 s y 30 s) y anota un resumen por minuto
// (ver lib/airtable-ritmo.ts y docs/incidentes/2026-11-24-lentitud.md).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { instalarRitmoAirtable } = await import("./lib/airtable-ritmo");
  instalarRitmoAirtable();
}
