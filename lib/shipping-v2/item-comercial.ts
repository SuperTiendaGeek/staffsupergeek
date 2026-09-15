// Disponibilidad comercial de un artículo: ¿se puede apartar o vender?
//
// ─── Por qué existe este archivo ─────────────────────────────────────────────
//
// `Estado Item` venía mezclando DOS ejes que no dependen uno del otro:
//
//   Eje logístico  ¿dónde está?      Registrado → Pagado → En packing →
//                                    En tránsito → Recibido → En revisión
//   Eje comercial  ¿se puede vender? Disponible / Apartado / Vendido / Bloqueado
//
// Como es un solo single-select, "En revisión" y "Disponible" se pisan: un
// artículo no podía estar en revisión Y apartable a la vez, cuando en la
// realidad sí lo está. Por eso packings con todo el checklist en verde seguían
// mostrando sus artículos "En revisión" y parecían no vendibles.
//
// Airtable ya tiene el eje comercial en campos propios: `Disponible para
// venta`, `Reservado` y `Cantidad Reservada`. Este módulo decide ese eje SIN
// mirar la etapa logística.
//
// ─── Regla de negocio (2026-09-14) ───────────────────────────────────────────
//
// Un artículo se puede apartar DESDE QUE EXISTE en el sistema. SUPER GEEK
// vende importaciones bajo pedido: un cliente puede apartar algo que todavía
// está en eBay o en la caja de Roberto. Bloquearlo hasta que llegue a Otavalo
// mataría esa venta.
//
// Lo que sí bloquea es que el artículo ya NO EXISTA como mercadería vendible:
// porque se vendió, se consumió, se anuló, o porque la revisión encontró un
// problema que hay que resolver antes de prometérselo a nadie.

export type ShippingV2ItemComercialLike = {
  id?: string;
  sku?: string;
  estado?: string | null;
  estadoRevision?: string | null;
  usoLocal?: boolean | null;
};

export type MotivoBloqueoComercial =
  | "estado-terminal"
  | "estado-con-problema"
  | "revision-bloqueante"
  | "novedades-abiertas"
  | "uso-local";

export type DisponibilidadComercial =
  | { apartable: true }
  | { apartable: false; motivo: MotivoBloqueoComercial; detalle: string };

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Estados en los que el artículo ya salió del inventario vendible.
 *
 * Ojo: esta lista es de SALIDAS, no de etapas. "En tránsito" o "En revisión"
 * NO están aquí a propósito: son etapas del camino, no finales.
 */
const ESTADOS_TERMINALES = new Set([
  "vendido",
  "usado en reparacion",
  "destinado a partes",
  "desarmado parcialmente",
  "desarmado completamente",
  "migrado",
  "cancelado",
  "archivado",
  "devuelto",
]);

/**
 * Veredictos de revisión que impiden prometer el artículo a un cliente.
 * Son los mismos que ya usaba item-availability.ts para publicar.
 */
export const VEREDICTOS_BLOQUEANTES = [
  "Faltante",
  "Dañado",
  "Incompleto",
  "Diferente al comprado",
  "En garantía con proveedor",
] as const;

const VEREDICTOS_BLOQUEANTES_NORMALIZADOS = new Set(VEREDICTOS_BLOQUEANTES.map((v) => normalize(v)));

export function tieneVeredictoBloqueante(item: ShippingV2ItemComercialLike): boolean {
  return VEREDICTOS_BLOQUEANTES_NORMALIZADOS.has(normalize(item.estadoRevision));
}

/**
 * Estados que marcan un problema abierto sobre el artículo.
 *
 * No son salidas del inventario (el artículo sigue siendo nuestro y puede
 * volver a estar bien), pero mientras esté así no se le promete a nadie.
 * Antes esto lo cubría la lista de estados no apartables de facturación; al
 * dejar de bloquear por etapa había que reponerlo aquí explícitamente.
 */
const ESTADOS_CON_PROBLEMA = new Set([
  "con novedad",
  "en garantia con proveedor",
]);

export const MENSAJE_BLOQUEO_COMERCIAL: Record<MotivoBloqueoComercial, string> = {
  "estado-terminal": "Este artículo ya salió del inventario vendible.",
  "estado-con-problema": "Este artículo tiene un problema abierto. Resuélvelo antes de apartarlo o venderlo.",
  "revision-bloqueante": "La revisión encontró un problema. Resuélvelo antes de apartarlo o venderlo.",
  "novedades-abiertas": "Este artículo tiene novedades abiertas sin resolver.",
  "uso-local": "Este artículo está destinado a uso local, no a la venta.",
};

/**
 * ¿Se puede apartar o vender este artículo?
 *
 * NO mira la etapa logística: un artículo en tránsito, en packing o recién
 * registrado es apartable. Solo bloquea lo que de verdad lo impide.
 *
 * Esto decide la BANDERA `Disponible para venta`. Cuántas unidades quedan
 * libres es otra cosa y la resuelve unidades.ts (comprometerUnidades).
 */
export function evaluarDisponibilidadComercial(input: {
  estado?: string | null;
  estadoRevision?: string | null;
  usoLocal?: boolean | null;
  novedadesAbiertas?: number;
}): DisponibilidadComercial {
  const estado = normalize(input.estado);

  if (ESTADOS_TERMINALES.has(estado)) {
    return {
      apartable: false,
      motivo: "estado-terminal",
      detalle: `${MENSAJE_BLOQUEO_COMERCIAL["estado-terminal"]} (${input.estado})`,
    };
  }
  if (ESTADOS_CON_PROBLEMA.has(estado)) {
    return {
      apartable: false,
      motivo: "estado-con-problema",
      detalle: `${MENSAJE_BLOQUEO_COMERCIAL["estado-con-problema"]} (${input.estado})`,
    };
  }
  if (input.usoLocal === true || estado === "uso local") {
    return { apartable: false, motivo: "uso-local", detalle: MENSAJE_BLOQUEO_COMERCIAL["uso-local"] };
  }
  if (tieneVeredictoBloqueante({ estadoRevision: input.estadoRevision })) {
    return {
      apartable: false,
      motivo: "revision-bloqueante",
      detalle: `${MENSAJE_BLOQUEO_COMERCIAL["revision-bloqueante"]} (${input.estadoRevision})`,
    };
  }
  if ((input.novedadesAbiertas ?? 0) > 0) {
    return {
      apartable: false,
      motivo: "novedades-abiertas",
      detalle: MENSAJE_BLOQUEO_COMERCIAL["novedades-abiertas"],
    };
  }

  return { apartable: true };
}

/**
 * Valor que debe tener la bandera `Disponible para venta` en Airtable.
 *
 * Se deriva: bloqueado → false; libre y con unidades sin comprometer → true.
 * Si todas las unidades están comprometidas la bandera baja, pero eso NO es un
 * bloqueo: el artículo sigue siendo bueno, solo que ya no queda nada libre.
 */
export function calcularDisponibleVenta(input: {
  estado?: string | null;
  estadoRevision?: string | null;
  usoLocal?: boolean | null;
  novedadesAbiertas?: number;
  unidadesLibres: number;
}): boolean {
  if (!evaluarDisponibilidadComercial(input).apartable) return false;
  return input.unidadesLibres > 0;
}
