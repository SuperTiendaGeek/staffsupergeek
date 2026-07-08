import "server-only";

import path from "path";

// Única fuente de verdad para resolver FACTURAS_DIR. Antes cada archivo que
// tocaba disco (repositorio.ts, recuperar.ts, los endpoints de ride/xml,
// reenviar) hacía su propio path.join(process.cwd(), base, …) — eso ignora
// por completo una FACTURAS_DIR absoluta (path.join no resetea en un
// segundo argumento absoluto, a diferencia de path.resolve), convirtiendo
// p.ej. "/tmp/facturas-autorizadas" en "<cwd>/tmp/facturas-autorizadas".
// Visto en producción (Vercel): con FACTURAS_DIR="/tmp/facturas-autorizadas"
// el mkdir terminaba intentando crear "/var/task/tmp/facturas-autorizadas/…",
// que no existe y no se puede crear (el filesystem ahí es de solo lectura
// fuera de /tmp).
export function directorioBaseFacturas(): string {
  const base = process.env.FACTURAS_DIR?.trim() || "facturas-autorizadas";
  return path.isAbsolute(base) ? base : path.join(process.cwd(), base);
}
