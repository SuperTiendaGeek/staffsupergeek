// Lo que devuelve GET /api/tecnicos/alertas (rediseño R10), para la barra, la lista y la orden.
import type { Alerta } from "@/lib/tecnicos/alertas/reglas";

export type FilaAlertaUI = {
  ordenId: string;
  codigo: string;
  responsableId: string | null;
  alerta: Alerta;
  cliente: string;
  equipo: string;
  estado: string;
};

export type DatosAlertas = {
  resumen: { atencion: number; porVencer: number; mias: number; sinResponsable: number };
  filas: FilaAlertaUI[];
  responsables: Record<string, { nombre: string; iniciales: string }>;
  yo: string | null;
  esAdmin: boolean;
};

/** Otras pantallas avisan que algo cambió (pospuesta, responsable, avance) y la barra se relee. */
export const EVENTO_ALERTAS = "sg-alertas-actualizar";
export const avisarCambioAlertas = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_ALERTAS)); };

export const PUNTO: Record<string, string> = {
  atencion: "bg-[#FF7A70]",
  porVencer: "bg-[#FFB547]",
  alDia: "bg-[#56E3A4]",
};

// Una sola lectura para la barra y la lista (evita dos consultas iguales a
// Airtable al abrir la lista de órdenes). Vale 20 s; «forzar» relee.
let enVuelo: Promise<DatosAlertas> | null = null;
let ultima: { en: number; datos: DatosAlertas } | null = null;

export function leerAlertasCompartidas(forzar = false): Promise<DatosAlertas> {
  if (!forzar && ultima && Date.now() - ultima.en < 20_000) return Promise.resolve(ultima.datos);
  if (enVuelo) return enVuelo;
  enVuelo = fetch("/api/tecnicos/alertas", { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => {
      if (!j.success) throw new Error(j.error || "No se pudieron leer las alertas.");
      ultima = { en: Date.now(), datos: j.data as DatosAlertas };
      return ultima.datos;
    })
    .finally(() => { enVuelo = null; });
  return enVuelo;
}
