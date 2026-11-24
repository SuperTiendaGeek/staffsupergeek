// Lo que devuelve GET /api/tecnicos/alertas (rediseño R10), para la barra, la lista y la orden.
import type { Alerta } from "@/lib/tecnicos/alertas/reglas";
import type { FilaTablero } from "@/lib/tecnicos/orden/tablero";

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
  /** Todas las órdenes abiertas (tablero y Lista, R8). Puede faltar si el servidor es anterior. */
  tablero?: FilaTablero[];
  responsables: Record<string, { nombre: string; iniciales: string }>;
  yo: string | null;
  esAdmin: boolean;
};

/** Otras pantallas avisan que algo cambió (pospuesta, responsable, avance) y la barra se relee. */
export const EVENTO_ALERTAS = "sg-alertas-actualizar";
/** Datos nuevos de alertas (lo dispara leerAlertasCompartidas). */
export const EVENTO_DATOS_ALERTAS = "sg-alertas-datos";
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
      // El tablero de órdenes (R8) escucha esto: cuando la barra relee, el tablero se pone al día sin otra consulta.
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_DATOS_ALERTAS, { detail: ultima.datos }));
      return ultima.datos;
    })
    .finally(() => { enVuelo = null; });
  return enVuelo;
}
