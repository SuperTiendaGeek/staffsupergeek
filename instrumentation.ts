// Se ejecuta una vez al arrancar cada instancia del servidor (Next.js).
// Pone en fila las llamadas a Airtable para no pasar su límite de 5 por segundo
// (ver lib/airtable-ritmo.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { instalarRitmoAirtable } = await import("./lib/airtable-ritmo");
  instalarRitmoAirtable();
}
