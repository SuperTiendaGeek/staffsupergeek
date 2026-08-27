import type { ShippingV2Item } from "@/types/shipping-v2";

export type ShippingV2FacebookTextTone = "base" | "amigable" | "empatica" | "tecnica";

export type ShippingV2FacebookTextOption = {
  tone: ShippingV2FacebookTextTone;
  label: string;
  description: string;
  text: string;
};

type FacebookTextItem = Pick<
  ShippingV2Item,
  | "sku"
  | "nombre"
  | "marca"
  | "modelo"
  | "categoria"
  | "tipoItem"
  | "condicion"
  | "estado"
  | "cantidad"
  | "qty"
  | "precioVenta"
  | "disponibleVenta"
  | "textoFacebook"
  | "technicalSheet"
>;

const FACEBOOK_WHATSAPP_DISPLAY = "+593 968 808 149";
const FACEBOOK_WHATSAPP_LINK = "wa.me/593968808149";
const WARRANTY_TEXT = "6 meses en todos los electrónicos.";

function normalize(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function hasShippingV2FacebookPrice(item: Pick<ShippingV2Item, "precioVenta">) {
  return typeof item.precioVenta === "number" && Number.isFinite(item.precioVenta) && item.precioVenta > 0;
}

export function hasShippingV2FacebookText(item: Pick<ShippingV2Item, "textoFacebook">) {
  return Boolean(item.textoFacebook?.trim());
}

export function getShippingV2FacebookTextGenerationBlockReason(item: Pick<ShippingV2Item, "precioVenta">) {
  return hasShippingV2FacebookPrice(item) ? "" : "Agrega Precio venta final antes de generar Texto Facebook.";
}

export function getShippingV2FacebookPublicationBlockReason(item: Pick<ShippingV2Item, "precioVenta" | "textoFacebook">) {
  if (!hasShippingV2FacebookPrice(item)) return "Agrega Precio venta final antes de activar Facebook Super Geek.";
  if (!hasShippingV2FacebookText(item)) return "Genera y guarda Texto Facebook antes de activar Facebook Super Geek.";
  return "";
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function productIcon(item: FacebookTextItem) {
  const text = normalize(`${item.categoria} ${item.tipoItem} ${item.nombre}`);
  if (text.includes("laptop") || text.includes("macbook") || text.includes("notebook") || text.includes("computador")) return "💻";
  if (text.includes("telefono") || text.includes("celular") || text.includes("iphone")) return "📱";
  if (text.includes("monitor") || text.includes("pantalla")) return "🖥️";
  if (text.includes("audio") || text.includes("parlante") || text.includes("microfono") || text.includes("interfaz")) return "🎛️";
  if (text.includes("repuesto") || text.includes("parte") || text.includes("componente")) return "🔧";
  if (text.includes("cargador") || text.includes("dock") || text.includes("docking") || text.includes("usb")) return "💻";
  return "🛒";
}

function itemName(item: FacebookTextItem) {
  return item.nombre?.trim() || item.modelo?.trim() || item.sku?.trim() || "Producto Super Geek";
}

function availabilityLine(item: FacebookTextItem) {
  const state = normalize(item.estado);
  const quantity = typeof item.cantidad === "number" ? item.cantidad : item.qty;
  if (item.disponibleVenta || state.includes("disponible")) {
    return quantity === 1 ? "Disponible para reserva o compra inmediata." : "Disponible para reserva o compra inmediata.";
  }
  return "Llega pronto a tienda (reserva para asegurarlo antes de que se agote)";
}

function optionalDetails(item: FacebookTextItem) {
  const details: string[] = [];
  const sheet = item.technicalSheet;
  if (item.condicion?.trim()) details.push(`🔎 Condición: ${item.condicion.trim()}`);
  if (sheet?.pantallaTamano?.trim()) details.push(`📐 Pantalla: ${sheet.pantallaTamano.trim()}`);
  if (sheet?.ramCapacidad?.trim()) details.push(`⚙️ RAM: ${sheet.ramCapacidad.trim()}`);
  if (sheet?.almacenamientoPrincipal?.trim()) details.push(`💾 Almacenamiento: ${sheet.almacenamientoPrincipal.trim()}`);
  if (sheet?.bateriaSalud !== null && sheet?.bateriaSalud !== undefined) details.push(`🔋 Batería: ${sheet.bateriaSalud}%`);
  return details;
}

function baseLines(item: FacebookTextItem) {
  const price = formatPrice(item.precioVenta);
  const details = optionalDetails(item);
  return {
    icon: productIcon(item),
    name: itemName(item),
    sku: item.sku?.trim() || "Sin código",
    price,
    details,
    availability: availabilityLine(item),
  };
}

export function generateShippingV2FacebookTextOptions(item: FacebookTextItem): ShippingV2FacebookTextOption[] {
  const data = baseLines(item);
  const detailBlock = data.details.length ? ["", ...data.details] : [];

  return [
    {
      tone: "base",
      label: "Base Super Geek",
      description: "Formato clásico, directo y listo para reserva.",
      text: [
        "🔥 DISPONIBLE PARA RESERVA 🔥",
        "",
        `${data.icon} ${data.name}`,
        `🏷️ Código: ${data.sku}`,
        `💰 Precio: ${data.price}`,
        ...detailBlock,
        "",
        `✅ Garantía: ${WARRANTY_TEXT}`,
        `📦 ${data.availability}`,
        "",
        `📲 Reserva por WhatsApp: ${FACEBOOK_WHATSAPP_DISPLAY}`,
        `🔗 ${FACEBOOK_WHATSAPP_LINK}`,
        "",
        "⚡ Cupos limitados • Se separa con abono",
        "🤝 ¡Escríbenos ahora y te lo apartamos!",
      ].join("\n"),
    },
    {
      tone: "amigable",
      label: "Más amigable",
      description: "Suena cercano, conversacional y fácil de responder.",
      text: [
        "✨ ¡Nuevo disponible para reservar! ✨",
        "",
        `${data.icon} Tenemos para ti: ${data.name}`,
        `🏷️ Código: ${data.sku}`,
        `💰 Precio: ${data.price}`,
        ...detailBlock,
        "",
        `✅ Incluye garantía de ${WARRANTY_TEXT}`,
        `📦 ${data.availability}`,
        "",
        "Si te interesa, escríbenos y te ayudamos a separarlo enseguida.",
        `📲 WhatsApp: ${FACEBOOK_WHATSAPP_DISPLAY}`,
        `🔗 ${FACEBOOK_WHATSAPP_LINK}`,
        "",
        "⚡ Se separa con abono • Cupos limitados",
      ].join("\n"),
    },
    {
      tone: "empatica",
      label: "Más empática",
      description: "Acompaña mejor a clientes que buscan seguridad antes de reservar.",
      text: [
        "💚 Disponible para reservar en Super Geek",
        "",
        `Sabemos que elegir bien importa. Por eso te compartimos esta opción revisada para que puedas apartarla con tranquilidad:`,
        "",
        `${data.icon} ${data.name}`,
        `🏷️ Código: ${data.sku}`,
        `💰 Precio: ${data.price}`,
        ...detailBlock,
        "",
        `✅ Garantía: ${WARRANTY_TEXT}`,
        `📦 ${data.availability}`,
        "",
        "Podemos resolver tus dudas por WhatsApp antes de que reserves.",
        `📲 ${FACEBOOK_WHATSAPP_DISPLAY}`,
        `🔗 ${FACEBOOK_WHATSAPP_LINK}`,
        "",
        "🤝 Si te sirve, te lo apartamos con abono.",
      ].join("\n"),
    },
    {
      tone: "tecnica",
      label: "Más técnica",
      description: "Prioriza datos claros para equipos, partes y accesorios.",
      text: [
        "⚙️ DISPONIBLE PARA RESERVA",
        "",
        `${data.icon} Producto: ${data.name}`,
        `🏷️ Código: ${data.sku}`,
        `💰 Precio: ${data.price}`,
        ...detailBlock,
        "",
        `✅ Garantía: ${WARRANTY_TEXT}`,
        `📦 Estado de disponibilidad: ${data.availability}`,
        "",
        `📲 Reserva por WhatsApp: ${FACEBOOK_WHATSAPP_DISPLAY}`,
        `🔗 ${FACEBOOK_WHATSAPP_LINK}`,
        "",
        "⚡ Stock limitado • Reserva con abono",
      ].join("\n"),
    },
  ];
}
