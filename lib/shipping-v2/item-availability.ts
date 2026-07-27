// Reglas PURAS de "listo para vender" (sin Airtable, sin React, testeables).
//
// Contexto: el ciclo de vida de un item que se compra a proveedor avanza solo
// hasta "En revisión" (alta → Pendiente de pago → Pagado → Pendiente de packing
// → En packing → En tránsito → Recibido → En revisión) y ahí se quedaba: no
// existía ningún paso que lo pasara a "Disponible", y el cambio manual estaba
// bloqueado por un guard que exigía "una acción controlada" que nunca se
// construyó. Resultado: 22 de 86 items estancados en "En revisión" y los que
// figuraban como "Disponible" habían sido editados a mano en Airtable.
//
// Esta es esa acción controlada.

export type MotivoNoPublicable =
  | "ya-disponible"
  | "estado-no-apto"
  | "sin-revisar"
  | "revision-con-novedad"
  | "novedades-abiertas";

export type EvaluacionPublicacion =
  | { puede: true }
  | { puede: false; motivo: MotivoNoPublicable; detalle: string };

/** Estados desde los que tiene sentido publicar: el item ya llegó físicamente. */
const ESTADOS_APTOS = new Set(["recibido", "en revision"]);

/**
 * Resultados de revisión que impiden publicar: el item llegó, pero mal.
 * Deben resolverse (garantía, reclamo, reemplazo) antes de ofrecerlo.
 */
const REVISIONES_BLOQUEANTES = new Set([
  "faltante",
  "danado",
  "incompleto",
  "diferente al comprado",
  "en garantia con proveedor",
]);

function normalizar(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export const MENSAJE_NO_PUBLICABLE: Record<MotivoNoPublicable, string> = {
  "ya-disponible": "Este artículo ya está disponible.",
  "estado-no-apto": "Solo se puede publicar un artículo recibido o en revisión.",
  "sin-revisar": "Marca primero “Revisado física/técnicamente”.",
  "revision-con-novedad": "La revisión reportó un problema. Resuélvelo antes de publicar.",
  "novedades-abiertas": "Este artículo tiene novedades abiertas sin resolver.",
};

export function evaluarPublicacionItem(input: {
  estado: string;
  estadoRevision?: string | null;
  revisadoFisicamente?: boolean | null;
  novedadesAbiertas: number;
}): EvaluacionPublicacion {
  const estado = normalizar(input.estado);

  if (estado === "disponible") {
    return { puede: false, motivo: "ya-disponible", detalle: MENSAJE_NO_PUBLICABLE["ya-disponible"] };
  }
  if (!ESTADOS_APTOS.has(estado)) {
    return { puede: false, motivo: "estado-no-apto", detalle: MENSAJE_NO_PUBLICABLE["estado-no-apto"] };
  }
  if (input.revisadoFisicamente !== true) {
    return { puede: false, motivo: "sin-revisar", detalle: MENSAJE_NO_PUBLICABLE["sin-revisar"] };
  }
  if (REVISIONES_BLOQUEANTES.has(normalizar(input.estadoRevision))) {
    return { puede: false, motivo: "revision-con-novedad", detalle: MENSAJE_NO_PUBLICABLE["revision-con-novedad"] };
  }
  if (input.novedadesAbiertas > 0) {
    return { puede: false, motivo: "novedades-abiertas", detalle: MENSAJE_NO_PUBLICABLE["novedades-abiertas"] };
  }

  return { puede: true };
}
