import type { AbandonmentStatus } from "@/lib/tecnicos/orders/abandonmentPolicy";

type AbandonmentWhatsAppOrder = {
  idVisible?: string | null;
  recordId?: string | null;
  clienteNombre?: string | null;
  equipo?: string | null;
};

const FALLBACK_CLIENT = "Cliente";
const FALLBACK_ORDER = "esta orden";
const FALLBACK_EQUIPMENT = "Equipo recibido";
const POLICY_DAYS = 90;

const cleanText = (value?: string | null, fallback = "") => {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
};

const formatLimitDate = (referenceDate?: string | null) => {
  if (!referenceDate) return "la fecha límite indicada por SUPER GEEK";

  const parsed = new Date(referenceDate);
  if (Number.isNaN(parsed.getTime())) return "la fecha límite indicada por SUPER GEEK";

  const limitDate = new Date(parsed);
  limitDate.setDate(limitDate.getDate() + POLICY_DAYS);

  return limitDate.toLocaleDateString("es-EC", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

export const buildAbandonmentWhatsAppMessage = (
  order: AbandonmentWhatsAppOrder,
  abandonmentStatus: AbandonmentStatus
) => {
  const clientName = cleanText(order.clienteNombre, FALLBACK_CLIENT);
  const orderId = cleanText(order.idVisible ?? order.recordId, FALLBACK_ORDER);
  const equipment = cleanText(order.equipo, FALLBACK_EQUIPMENT);
  const daysWaiting = abandonmentStatus.daysWaiting ?? 0;

  if (abandonmentStatus.level === "critical") {
    return `Hola ${clientName}, le saludamos de SUPER GEEK.

Le escribimos por su orden de reparación ${orderId} correspondiente a: ${equipment}.

Su equipo registra ${daysWaiting} días sin respuesta o retiro. Según las condiciones del servicio aceptadas al dejar el equipo, esta orden ya cumple el plazo establecido para baja por abandono.

Esto significa que SUPER GEEK podrá disponer del equipo o de sus partes para compensar costos de revisión, reparación, bodegaje o gestión, y posteriormente el equipo ya no podrá ser reclamado.

Si desea revisar este caso, por favor responda a este mensaje de forma inmediata.

SUPER GEEK`;
  }

  const limitDate = formatLimitDate(abandonmentStatus.referenceDate);

  return `Hola ${clientName}, le saludamos de SUPER GEEK.

Le escribimos por su orden de reparación ${orderId} correspondiente a: ${equipment}.

Su equipo se encuentra pendiente de respuesta o retiro desde hace ${daysWaiting} días. Según las condiciones del servicio aceptadas al dejar el equipo, si no recibimos respuesta o no se retira el equipo hasta el ${limitDate}, la orden podrá ser dada de baja por abandono.

Esto significa que SUPER GEEK podrá disponer del equipo o de sus partes para compensar costos de revisión, reparación, bodegaje o gestión, y posteriormente el equipo ya no podrá ser reclamado.

Por favor responda a este mensaje lo antes posible para confirmar si desea continuar con el proceso, retirar el equipo o recibir más información.

Gracias por su comprensión.
SUPER GEEK`;
};
