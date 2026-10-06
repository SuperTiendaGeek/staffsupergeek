// ¿Dónde está el artículo y por dónde llega? (auditoría Shipping V2, punto 2)
//
// ─── Reglas del dueño (4 y 6-oct-2026) ───────────────────────────────────────
//
// Al registrar se pregunta "¿Dónde está el artículo?":
//   · Ya está en la tienda   → nace recibido; no pide rastreo, caja ni casillero.
//   · Proveedor extranjero   → viene en camino. Normalmente llega a un
//                              casillero (Laarbox, Doral) y de ahí a Ecuador:
//                              DOS rastreos posibles (origen y Ecuador).
//   · Proveedor local        → viene en camino dentro de Ecuador: un rastreo.
// Local o extranjero sale del "País / zona logística" del proveedor: Ecuador =
// local; cualquier otro valor = extranjero.
//
// Todo lo que viene de afuera:
//   · puede tener rastreo individual (nunca obligatorio);
//   · al escribir el primer rastreo pasa SOLO a "En tránsito" (un número de
//     rastreo ya afirma el despacho; no se confirma con un botón);
//   · puede agruparse en una caja (packing), local o extranjera. Desde que
//     entra a una caja, el rastreo de la caja lo gobierna;
//   · aparece en Recepción → "Por llegar" hasta que alguien marque "Recibido".

function normalize(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export const ORIGEN_TIENDA = "Ya está en la tienda";
export const ORIGEN_EXTRANJERO = "Proveedor extranjero";
export const ORIGEN_LOCAL = "Proveedor local";
export const ORIGENES_ARTICULO = [ORIGEN_TIENDA, ORIGEN_EXTRANJERO, ORIGEN_LOCAL] as const;
export type OrigenArticulo = (typeof ORIGENES_ARTICULO)[number];

export function normalizarOrigen(value?: string | null): OrigenArticulo | null {
  const n = normalize(value);
  return ORIGENES_ARTICULO.find((o) => normalize(o) === n) ?? null;
}

/** Ecuador = local; cualquier otro país o zona (USA, Internacional…) = extranjero. */
export function origenSegunZona(paisZonaLogistica?: string | null): typeof ORIGEN_EXTRANJERO | typeof ORIGEN_LOCAL {
  return normalize(paisZonaLogistica) === "ecuador" ? ORIGEN_LOCAL : ORIGEN_EXTRANJERO;
}

export function vieneDeAfuera(origen?: string | null): boolean {
  const o = normalizarOrigen(origen);
  return o === ORIGEN_EXTRANJERO || o === ORIGEN_LOCAL;
}

/**
 * Tipos de operación que el formulario ofrece según el origen (tabla del
 * dueño, 4-oct-2026). "Compra ya pagada", "Parte / componente", "Repuesto",
 * "Migración histórica", "Corrección administrativa" y "Encargo enviado a
 * proveedor" ya no se ofrecen.
 */
export const TIPOS_OPERACION_POR_ORIGEN: Record<OrigenArticulo, readonly string[]> = {
  [ORIGEN_TIENDA]: ["Compra a proveedor", "Regalo de proveedor", "Reajuste de inventario", "Despiece de equipo", "Uso local"],
  [ORIGEN_EXTRANJERO]: ["Compra a proveedor", "Regalo de proveedor", "Uso local"],
  [ORIGEN_LOCAL]: ["Compra a proveedor", "Uso local"],
};

export function tipoOperacionPermitido(origen: string | null | undefined, tipoOperacion: string | null | undefined): boolean {
  const o = normalizarOrigen(origen);
  if (!o) return false;
  return TIPOS_OPERACION_POR_ORIGEN[o].some((t) => normalize(t) === normalize(tipoOperacion));
}

/**
 * Estados que solo puede tener algo que ya está en la tienda, aunque nadie
 * haya marcado la casilla "Recibido" (repuestos y uso local de antes).
 */
const ESTADOS_DE_TIENDA = new Set(["disponible", "reservado", "repuesto", "uso local"]);

/**
 * Origen de un artículo que todavía no lo tiene guardado (datos anteriores
 * a oct-2026). Lo que ya llegó está en la tienda; lo que no, viene de afuera
 * y se clasifica por el país de su proveedor; sin proveedor, null.
 */
export function deducirOrigen(item: {
  recibido?: boolean | null;
  estado?: string | null;
  tipoOperacion?: string | null;
  paisZonaProveedor?: string | null;
  tieneProveedor?: boolean;
}): OrigenArticulo | null {
  if (item.recibido === true || ESTADOS_DE_TIENDA.has(normalize(item.estado))) return ORIGEN_TIENDA;
  // Lo migrado del sistema anterior siempre estuvo en la tienda (ACC-000070).
  if (normalize(item.tipoOperacion) === "migracion historica") return ORIGEN_TIENDA;
  if (!item.tieneProveedor) return null;
  return origenSegunZona(item.paisZonaProveedor);
}

/** Etapas anteriores al despacho: aquí todavía no hay nada en camino. */
const ANTES_DEL_DESPACHO = new Set(["registrado", "pendiente de pago", "pagado", "pendiente de packing"]);

/**
 * Al escribir un rastreo individual el artículo pasa SOLO a "En tránsito".
 * No aplica si ya llegó o si viaja en una caja (ahí manda la caja).
 */
export function estadoAlPonerRastreo(item: {
  estado?: string | null;
  recibido?: boolean | null;
  packingId?: string | null;
}): "En tránsito" | null {
  if (item.recibido === true || item.packingId) return null;
  return ANTES_DEL_DESPACHO.has(normalize(item.estado)) ? "En tránsito" : null;
}

const ESTADOS_FINALES = new Set([
  "vendido", "cancelado", "archivado", "usado en reparacion", "destinado a partes",
  "desarmado parcialmente", "desarmado completamente", "migrado",
]);

type ItemLlegada = {
  origenArticulo?: string | null;
  recibido?: boolean | null;
  packingId?: string | null;
  estado?: string | null;
  /** Sin unidades no hay nada por llegar (restos de ventas viejas). */
  cantidad?: number | null;
};

/**
 * Recepción → "Por llegar": artículos SUELTOS (sin caja) que vienen de afuera
 * y todavía no llegan. Los que viajan en una caja aparecen dentro de su caja.
 */
export function esSueltoPorLlegar(item: ItemLlegada): boolean {
  return (
    vieneDeAfuera(item.origenArticulo) &&
    item.recibido !== true &&
    !item.packingId &&
    !ESTADOS_FINALES.has(normalize(item.estado)) &&
    !(typeof item.cantidad === "number" && item.cantidad <= 0)
  );
}

/** Estados desde los que un artículo de afuera todavía puede meterse en una caja. */
const PUEDE_ENTRAR_A_CAJA = new Set([...ANTES_DEL_DESPACHO, "en transito"]);

/**
 * ¿Puede entrar a una caja? Cualquier artículo que viene de afuera, que no
 * llegó y no está en otra caja. Incluye "En tránsito": lo que viajó solo de
 * eBay a Doral se junta allí con otros en una caja hacia Ecuador.
 */
export function puedeEntrarACaja(item: ItemLlegada): boolean {
  return (
    vieneDeAfuera(item.origenArticulo) &&
    item.recibido !== true &&
    !item.packingId &&
    PUEDE_ENTRAR_A_CAJA.has(normalize(item.estado))
  );
}

/**
 * Valor de los campos heredados "Modo logístico" y "Requiere packing", que
 * otras partes del sistema todavía leen. Ya no se preguntan en el formulario.
 */
export function modoLogisticoSegunOrigen(origen: string | null | undefined, viajaEnCaja: boolean): {
  modoLogistico: string;
  requierePacking: boolean;
} {
  if (!vieneDeAfuera(origen)) return { modoLogistico: "No aplica", requierePacking: false };
  return viajaEnCaja
    ? { modoLogistico: "Pendiente de packing", requierePacking: true }
    : { modoLogistico: "Tracking directo", requierePacking: false };
}

/**
 * Qué le falta a un artículo que viaja SOLO para tener su logística completa
 * (pestaña Logística). Nada de esto bloquea: es la lista de pendientes que la
 * pantalla muestra para que nada quede sin gestionar.
 */
export function pendientesLogisticos(item: {
  origenArticulo?: string | null;
  trackingHaciaIntermediario?: string | null;
  trackingDesdeIntermediario?: string | null;
  trackingDirecto?: string | null;
  fleteAsignadoRegistro?: number | null;
  arancelAsignadoRegistro?: number | null;
}): string[] {
  const o = normalizarOrigen(item.origenArticulo);
  const tiene = (v?: string | null) => Boolean(String(v ?? "").trim());
  const pendientes: string[] = [];
  if (o === ORIGEN_EXTRANJERO) {
    if (!tiene(item.trackingHaciaIntermediario)) pendientes.push("Rastreo al casillero");
    if (!tiene(item.trackingDesdeIntermediario)) pendientes.push("Rastreo a Ecuador");
    if (item.fleteAsignadoRegistro == null) pendientes.push("Flete");
    if (item.arancelAsignadoRegistro == null) pendientes.push("Arancel");
  } else if (o === ORIGEN_LOCAL) {
    if (!tiene(item.trackingDirecto)) pendientes.push("Rastreo");
    if (item.fleteAsignadoRegistro == null) pendientes.push("Flete");
  }
  return pendientes;
}
