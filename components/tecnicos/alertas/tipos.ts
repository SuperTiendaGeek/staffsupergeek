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
