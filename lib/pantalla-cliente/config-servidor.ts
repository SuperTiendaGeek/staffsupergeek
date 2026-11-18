import "server-only";

// Ajustes de la pantalla del cliente (10E-C): leer (con 60 s de memoria para
// no consultar Airtable en cada pantalla) y guardar desde Administrar.

import { withLock } from "@/lib/concurrencia";
import { guardarConfiguracion, leerConfiguracion } from "@/lib/configuracion/airtable";
import {
  CLAVE_PANTALLA, agregarAlHistorial, describirCambios, normalizarConfig, type ConfigPantalla,
} from "./config";

let memoria: { config: ConfigPantalla; hasta: number } | null = null;

export async function configPantalla(): Promise<ConfigPantalla> {
  if (memoria && memoria.hasta > Date.now()) return memoria.config;
  const r = await leerConfiguracion(CLAVE_PANTALLA);
  const config = normalizarConfig(r.valor);
  memoria = { config, hasta: Date.now() + 60_000 };
  return config;
}

export type ConfigPantallaAdmin = { config: ConfigPantalla; actualizadoPor: string; actualizadoEn: string; historial: string[] };

export async function configPantallaAdmin(): Promise<ConfigPantallaAdmin> {
  const r = await leerConfiguracion(CLAVE_PANTALLA);
  return {
    config: normalizarConfig(r.valor),
    actualizadoPor: r.actualizadoPor,
    actualizadoEn: r.actualizadoEn,
    historial: r.historial.split("\n").map((l) => l.trim()).filter(Boolean),
  };
}

/** Guarda y deja constancia (quién, cuándo, qué cambió). */
export async function guardarConfigPantalla(nueva: ConfigPantalla, quien: string): Promise<ConfigPantallaAdmin> {
  return withLock(`configuracion:${CLAVE_PANTALLA}`, async () => {
    const r = await leerConfiguracion(CLAVE_PANTALLA);
    const antes = normalizarConfig(r.valor);
    const cambio = describirCambios(antes, nueva) || (r.id ? "" : "valores iniciales");
    if (r.id && !cambio) return configPantallaAdmin();
    const fecha = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    await guardarConfiguracion({
      id: r.id, clave: CLAVE_PANTALLA, valor: nueva, por: quien,
      historial: agregarAlHistorial(r.historial, `${fecha} · ${quien} · ${cambio}`),
    });
    memoria = null;
    return configPantallaAdmin();
  });
}
