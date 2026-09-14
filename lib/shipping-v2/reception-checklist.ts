// Cuándo un artículo terminó su ciclo dentro de un packing.
//
// ─── Definición acordada con el negocio (2026-09-14) ─────────────────────────
//
// Un artículo completa su ciclo cuando tiene marcadas estas SEIS casillas:
//
//   Bodega      1. Recibido                      (confirma que llegó físicamente)
//               2. Revisado física/técnicamente
//               3. Fotos tomadas
//   Publicación 4. Shopify publicado
//               5. Marketplace publicado
//               6. Mercado Libre publicado
//
// Dos casillas quedan como OPCIONALES: se siguen mostrando y se pueden marcar,
// pero no impiden cerrar el ciclo.
//
//   · Grupos Facebook — útil, pero no fundamental para dar por vendible un
//     artículo (decisión del negocio, 2026-09-14). Era el cuello de botella en
//     casi todos los packings.
//   · Facebook Super Geek — publicación especial que el sistema no puede
//     desactivar una vez encendida y con sus propias reglas de bloqueo
//     (ver getShippingV2FacebookPublicationBlockReason). Ni siquiera aparece
//     en este checklist.
//
// Cuando TODOS los artículos de un packing tienen su ciclo completo y el
// packing no tiene novedades abiertas, el packing puede pasar a Ciclo cerrado.
//
// ─── Publicaciones que no aplican ────────────────────────────────────────────
//
// Exigir las 4 publicaciones a todo artículo dejaría packings imposibles de
// cerrar, porque hay mercadería que nunca se publica al público:
//
//   · Repuestos y artículos de uso local — el propio modelo de Shipping V2 los
//     define así ("Uso local: afecta inventario pero no disponible para venta";
//     "Repuesto: disponible internamente, no necesariamente venta pública").
//   · Artículos que ya salieron del inventario (vendidos, usados en una
//     reparación, destinados a partes o desarmados): publicarlos ahora no
//     tiene sentido y el checklist quedaría abierto para siempre.
//
// Para esos, los 4 pasos de publicación cuentan como "no aplica", no como
// "hecho": la pantalla lo dice explícitamente para que nadie crea que se
// publicaron. Los 3 pasos de bodega se exigen SIEMPRE, sin excepción.

export type ShippingV2ChecklistKey =
  | "recibido"
  | "revisado"
  | "fotos"
  | "shopify"
  | "marketplace"
  | "mercadoLibre"
  | "gruposFacebook";

export type ShippingV2ChecklistGroup = "bodega" | "publicacion";

export type ShippingV2ChecklistStep = {
  key: ShippingV2ChecklistKey;
  label: string;
  grupo: ShippingV2ChecklistGroup;
  /** false = se puede marcar, pero no bloquea el cierre del ciclo. */
  requerido: boolean;
};

export const SHIPPING_V2_CHECKLIST_STEPS: ShippingV2ChecklistStep[] = [
  { key: "recibido", label: "Recibido", grupo: "bodega", requerido: true },
  { key: "revisado", label: "Revisado física/técnicamente", grupo: "bodega", requerido: true },
  { key: "fotos", label: "Fotos tomadas", grupo: "bodega", requerido: true },
  { key: "shopify", label: "Shopify", grupo: "publicacion", requerido: true },
  { key: "marketplace", label: "Marketplace", grupo: "publicacion", requerido: true },
  { key: "mercadoLibre", label: "Mercado Libre", grupo: "publicacion", requerido: true },
  { key: "gruposFacebook", label: "Grupos Facebook", grupo: "publicacion", requerido: false },
];

export const SHIPPING_V2_CHECKLIST_STEPS_REQUERIDOS = SHIPPING_V2_CHECKLIST_STEPS.filter(
  (paso) => paso.requerido
);

export type ShippingV2ChecklistStepState = "hecho" | "pendiente" | "no-aplica";

export type ShippingV2ReceptionChecklistItemLike = {
  id?: string;
  sku?: string;
  estado?: string | null;
  recibido?: boolean | null;
  revisadoFisicamente?: boolean | null;
  fotosTomadas?: boolean | null;
  shopifyPublicado?: boolean | null;
  marketplacePublicado?: boolean | null;
  mercadoLibrePublicado?: boolean | null;
  gruposFacebookPublicado?: boolean | null;
  esRepuesto?: boolean | null;
  usoLocal?: boolean | null;
};

export type ShippingV2ItemChecklist = {
  pasos: Array<ShippingV2ChecklistStep & { estado: ShippingV2ChecklistStepState }>;
  /** Pasos REQUERIDOS que faltan. Vacío cuando el ciclo está completo. */
  pendientes: ShippingV2ChecklistKey[];
  /** Pasos opcionales sin marcar. No bloquean nada; solo se informan. */
  opcionalesPendientes: ShippingV2ChecklistKey[];
  /** false cuando este artículo no se publica al público. */
  publicacionAplica: boolean;
  /** Por qué no aplica la publicación, para mostrarlo en pantalla. */
  motivoPublicacionNoAplica: string;
  completo: boolean;
};

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Estados en los que el artículo ya salió del inventario vendible. */
const ESTADOS_FUERA_DE_VENTA = new Set([
  "vendido",
  "usado en reparacion",
  "uso local",
  "repuesto",
  "destinado a partes",
  "desarmado parcialmente",
  "desarmado completamente",
  "migrado",
  "cancelado",
  "archivado",
]);

export function evaluarPublicacionAplica(item: ShippingV2ReceptionChecklistItemLike): {
  aplica: boolean;
  motivo: string;
} {
  if (item.esRepuesto === true) return { aplica: false, motivo: "Es repuesto: no se publica al público." };
  if (item.usoLocal === true) return { aplica: false, motivo: "Es de uso local: no se publica al público." };

  const estado = normalize(item.estado);
  if (ESTADOS_FUERA_DE_VENTA.has(estado)) {
    return { aplica: false, motivo: `Ya salió del inventario vendible (${item.estado}).` };
  }
  return { aplica: true, motivo: "" };
}

const CHECKBOX_POR_PASO: Record<
  ShippingV2ChecklistKey,
  (item: ShippingV2ReceptionChecklistItemLike) => boolean
> = {
  recibido: (item) => item.recibido === true,
  revisado: (item) => item.revisadoFisicamente === true,
  fotos: (item) => item.fotosTomadas === true,
  shopify: (item) => item.shopifyPublicado === true,
  marketplace: (item) => item.marketplacePublicado === true,
  mercadoLibre: (item) => item.mercadoLibrePublicado === true,
  gruposFacebook: (item) => item.gruposFacebookPublicado === true,
};

export function calculateShippingV2ItemChecklist(
  item: ShippingV2ReceptionChecklistItemLike
): ShippingV2ItemChecklist {
  const publicacion = evaluarPublicacionAplica(item);

  const pasos = SHIPPING_V2_CHECKLIST_STEPS.map((paso) => {
    const hecho = CHECKBOX_POR_PASO[paso.key](item);
    // Una publicación ya marcada se muestra como hecha aunque hoy no aplique:
    // el trabajo se hizo y ocultarlo sería mentir.
    if (paso.grupo === "publicacion" && !publicacion.aplica && !hecho) {
      return { ...paso, estado: "no-aplica" as ShippingV2ChecklistStepState };
    }
    return { ...paso, estado: (hecho ? "hecho" : "pendiente") as ShippingV2ChecklistStepState };
  });

  const pendientes = pasos
    .filter((paso) => paso.estado === "pendiente" && paso.requerido)
    .map((paso) => paso.key);
  const opcionalesPendientes = pasos
    .filter((paso) => paso.estado === "pendiente" && !paso.requerido)
    .map((paso) => paso.key);

  return {
    pasos,
    pendientes,
    opcionalesPendientes,
    publicacionAplica: publicacion.aplica,
    motivoPublicacionNoAplica: publicacion.motivo,
    completo: pendientes.length === 0,
  };
}

export function isShippingV2ItemCicloCompleto(item: ShippingV2ReceptionChecklistItemLike): boolean {
  return calculateShippingV2ItemChecklist(item).completo;
}

export function shippingV2ChecklistStepLabel(key: ShippingV2ChecklistKey): string {
  return SHIPPING_V2_CHECKLIST_STEPS.find((paso) => paso.key === key)?.label ?? key;
}
