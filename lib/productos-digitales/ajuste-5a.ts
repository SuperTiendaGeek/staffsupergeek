// Ajuste de datos — punto 5A (7-nov-2026). Regla PURA.
// 13 unidades de "Usuario/Contraseña" tienen en "Clave de activación" el
// texto que autocompletó el navegador ("Elfina.8990"). Se vacía ese campo y
// se quita el PDF guardado (llevaba la clave falsa): el próximo "Generar PDF"
// sale limpio. Usuario y contraseña no se tocan.

import { camposDeCredenciales } from "./reglas";

export const VALOR_AUTOCOMPLETADO = "Elfina.8990";

export type UnidadParaAjuste = { id: string; sku: string; producto: string; tipo: string | null; clave: string | null; tienePdf: boolean };

export type AccionAjuste5A = { id: string; sku: string; producto: string; limpiarClave: true; quitarPdf: boolean };

export function planLimpiezaClave(unidades: readonly UnidadParaAjuste[]): AccionAjuste5A[] {
  return unidades
    .filter((u) => !camposDeCredenciales(u.tipo).clave && (u.clave ?? "").trim() === VALOR_AUTOCOMPLETADO)
    .map((u) => ({ id: u.id, sku: u.sku, producto: u.producto, limpiarClave: true as const, quitarPdf: u.tienePdf }));
}
