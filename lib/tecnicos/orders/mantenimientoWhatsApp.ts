// Mensaje de WhatsApp para el recordatorio de "próximo mantenimiento"
// (pantalla /tecnicos/mantenimientos). Mismo tono y firma que
// abandonmentWhatsApp.ts, para que los mensajes salientes de SUPER GEEK se
// sientan consistentes sin importar de qué pantalla vengan.

const FALLBACK_CLIENT = "estimado cliente";
const FALLBACK_EQUIPMENT = "su equipo";
const TELEFONO_CONTACTO = "0968808149";

const cleanText = (value?: string | null, fallback = "") => {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
};

const formatFecha = (fecha: string): string => {
  // new Date("YYYY-MM-DD") parsea en UTC — se fija la hora local a mediodía
  // para que no se corra un día en Ecuador (UTC-5).
  const parsed = new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return fecha;
  return parsed.toLocaleDateString("es-EC", { year: "numeric", month: "long", day: "numeric" });
};

export const buildMantenimientoWhatsAppMessage = (item: {
  clienteNombre?: string | null;
  equipo?: string | null;
  fecha: string;
}): string => {
  const clientName = cleanText(item.clienteNombre, FALLBACK_CLIENT);
  const equipment = cleanText(item.equipo, FALLBACK_EQUIPMENT);
  const fecha = formatFecha(item.fecha);

  return `Hola ${clientName}, le saludamos de SUPER GEEK.

Le recordamos que el mantenimiento programado de su equipo (${equipment}) está próximo a llegar, con fecha ${fecha}.

Agende su cita respondiendo a este mensaje o llamando al ${TELEFONO_CONTACTO}.

SUPER GEEK`;
};
