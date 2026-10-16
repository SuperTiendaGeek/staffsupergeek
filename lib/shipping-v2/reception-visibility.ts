import type { ShippingV2Item } from "@/types/shipping-v2";

type ReceptionVisibilityItem = Pick<
  ShippingV2Item,
  | "estado"
  | "estadoRevision"
  | "esRepuesto"
  | "fotosTomadas"
  | "shopifyPublicado"
  | "marketplacePublicado"
  | "mercadoLibrePublicado"
  | "gruposFacebookPublicado"
  | "facebookSuperGeek"
> & Partial<Pick<ShippingV2Item, "operacionComercialId" | "modoLogistico" | "recibido">>;

// Estados en los que un artículo ya no espera nada de Recepción.
//
// 15-oct-2026: se suman Agotado, Dado de baja, Migrado y Perdido en tienda, y
// la regla ahora vale SIEMPRE. Antes un artículo vendido seguía en Recepción
// si conservaba una marca vieja de revisión ("Recibido correctamente",
// "Recibido pendiente de revisión"…): eran 139 de los ~520 de la lista, sin
// ningún trabajo pendiente, y hacían la pantalla lenta y larga.
const ESTADOS_FINALES = new Set([
  "vendido",
  "agotado",
  "dado de baja",
  "cancelado",
  "archivado",
  "migrado",
  "perdido en tienda",
  "destinado a partes",
  "desarmado parcialmente",
  "desarmado completamente",
]);

/**
 * Pedido de un cliente (nació de una Operación Comercial) que llega directo,
 * sin packing, y todavía no se marcó Recibido. Sin esta regla un pedido
 * "Compra ya pagada" en estado "Pagado" no aparecía en Recepción y, como la
 * factura de su orden exige que esté recibido, quedaba atascado para siempre.
 */
export function esPedidoDirectoPorRecibir(item: ReceptionVisibilityItem): boolean {
  return (
    !!item.operacionComercialId &&
    normalize(item.modoLogistico) === "tracking directo" &&
    item.recibido !== true &&
    !ESTADOS_FINALES.has(normalize(item.estado))
  );
}

function normalize(value?: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Etapas en las que el artículo todavía NO llegó. Desde oct-2026 (auditoría,
 * punto 2) eso se ve aparte de la lista de trabajo de bodega: desde la fase 2
 * del punto 9 (15-oct) en Logística, etapa "En camino" (cajas en tránsito y
 * artículos sueltos), donde se pulsa "Llegó". Cuando una caja
 * llega, sus artículos pasan a "Recibido" y recién ahí aparecen aquí para
 * confirmarlos uno por uno.
 */
const ETAPAS_ANTES_DE_LLEGAR = new Set([
  "registrado",
  "pendiente de pago",
  "pagado",
  "pendiente de packing",
  "en packing",
  "en transito",
]);

// "Repuesto" dejó de ser un estado (punto 3, 6-oct): es una categoría.
const ESTADOS_PERMITIDOS = new Set(["recibido", "en revision", "con novedad"]);
const REVISIONES_PERMITIDAS = new Set([
  "pendiente de recepcion",
  "recibido pendiente de revision",
  "recibido correctamente",
  "faltante",
  "aceptado con observacion",
  "danado",
  "incompleto",
  "diferente al comprado",
  "en garantia con proveedor",
]);

export function shouldShowShippingV2ReceptionItem(item: ReceptionVisibilityItem) {
  const state = normalize(item.estado);
  if (ESTADOS_FINALES.has(state)) return false;
  if (item.recibido !== true && ETAPAS_ANTES_DE_LLEGAR.has(state)) return false;
  const review = normalize(item.estadoRevision);
  if (ESTADOS_PERMITIDOS.has(state) || REVISIONES_PERMITIDAS.has(review)) return true;
  if (esPedidoDirectoPorRecibir(item)) return true;
  return state === "disponible" && (
    item.fotosTomadas !== true ||
    item.shopifyPublicado !== true ||
    item.marketplacePublicado !== true ||
    item.mercadoLibrePublicado !== true ||
    item.gruposFacebookPublicado !== true ||
    item.facebookSuperGeek !== true
  );
}

/**
 * La misma regla, escrita como condición de Airtable, para que Airtable
 * devuelva solo lo que puede verse en Recepción (antes se leía toda la tabla).
 * Es un filtro grueso: la página sigue aplicando
 * shouldShowShippingV2ReceptionItem, que es la que decide.
 *
 * Las opciones se toman del esquema y se comparan sin tildes, igual que la
 * regla de arriba, para no depender de cómo se escribió cada estado.
 */
export function formulaRecepcionAirtable(
  campos: {
    estado: string;
    revision: string;
    recibido: string;
    operacionComercial: string;
    modoLogistico: string;
    /** Casillas de fotos y publicaciones (todas deben estar marcadas para salir de Recepción). */
    publicaciones: string[];
  },
  opciones: { estados: readonly string[]; revisiones: readonly string[]; modos: readonly string[] }
) {
  const literal = (texto: string) => `'${texto.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  const de = (lista: readonly string[], conjunto: Set<string>) => lista.filter((opcion) => conjunto.has(normalize(opcion)));
  const algunoDe = (campo: string, valores: string[]) =>
    valores.length ? `OR(${valores.map((valor) => `{${campo}}=${literal(valor)}`).join(",")})` : "FALSE()";

  const finales = algunoDe(campos.estado, de(opciones.estados, ESTADOS_FINALES));
  const antesDeLlegar = algunoDe(campos.estado, de(opciones.estados, ETAPAS_ANTES_DE_LLEGAR));
  const permitidos = algunoDe(campos.estado, de(opciones.estados, ESTADOS_PERMITIDOS));
  const revisiones = algunoDe(campos.revision, de(opciones.revisiones, REVISIONES_PERMITIDAS));
  const disponible = algunoDe(campos.estado, de(opciones.estados, new Set(["disponible"])));
  const trackingDirecto = algunoDe(campos.modoLogistico, de(opciones.modos, new Set(["tracking directo"])));
  const faltaPublicar = `OR(${campos.publicaciones.map((campo) => `NOT({${campo}})`).join(",")})`;
  const pedidoDirecto = `AND(LEN(ARRAYJOIN({${campos.operacionComercial}}))>0,${trackingDirecto},NOT({${campos.recibido}}))`;

  return `AND(NOT(${finales}),NOT(AND(NOT({${campos.recibido}}),${antesDeLlegar})),OR(${permitidos},${revisiones},${pedidoDirecto},AND(${disponible},${faltaPublicar})))`;
}
