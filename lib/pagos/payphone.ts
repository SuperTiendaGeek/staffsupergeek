import "server-only";

// PayPhone — los "cables tendidos" de la 10A-3 ya están conectados (punto 23 /
// 10D, 17-nov-2026). Todo vive en lib/pagos-en-linea/ (reglas, config,
// adaptador, servidor). Esta función queda solo por compatibilidad.

import { configPasarela } from "@/lib/pagos-en-linea/config";

export function payphoneActivo(): boolean {
  return configPasarela("PayPhone").activa;
}
