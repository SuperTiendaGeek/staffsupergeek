import type { CotizacionDetalle, OpcionCotizacion } from "@/types/cotizaciones";

function normalizeEcuadorPhone(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("593")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `593${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("9")) return `593${digits}`;
  return digits;
}

function greeting(clienteNombre: string) {
  const name = clienteNombre.trim();
  return name ? `Buenas tardes, estimado/a ${name}.` : "Buenas tardes, estimado/a cliente.";
}

function cotizacionLabel(cotizacion: CotizacionDetalle) {
  return cotizacion.codigo ? ` ${cotizacion.codigo}` : "";
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) return "Por confirmar";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatTiempo(value: string | null | undefined) {
  const tiempo = String(value ?? "").trim();
  return tiempo || "Por confirmar";
}

function optionMessageBody(opcion: OpcionCotizacion) {
  return [
    opcion.descripcion || opcion.nombre || "Opción sin descripción",
    opcion.notaParaCliente.trim() || null,
    `💰 Precio: ${formatPrice(opcion.precioVentaCliente)}`,
    `📦 Entrega estimada: ${formatTiempo(opcion.tiempoEstimado)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOpcionWhatsAppMessage(cotizacion: CotizacionDetalle, opcion: OpcionCotizacion) {
  return [
    greeting(cotizacion.clienteNombre),
    "",
    `Le compartimos la cotización${cotizacionLabel(cotizacion)} solicitada:`,
    "",
    opcion.descripcion || opcion.nombre || "Opción sin descripción",
    "",
    opcion.notaParaCliente.trim() || null,
    opcion.notaParaCliente.trim() ? "" : null,
    `💰 Precio: ${formatPrice(opcion.precioVentaCliente)}`,
    `📦 Entrega estimada: ${formatTiempo(opcion.tiempoEstimado)} tras confirmar el pago total.`,
    "",
    "Quedamos atentos a su confirmación para proceder.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildTodasOpcionesWhatsAppMessage(
  cotizacion: CotizacionDetalle,
  opciones: OpcionCotizacion[]
) {
  const availableOptions = opciones.filter(
    (opcion) => opcion.estado !== "No Disponible" && opcion.estado !== "Descartada"
  );
  const optionsText = availableOptions
    .map((opcion, index) => [`Opción ${index + 1}:`, optionMessageBody(opcion)].join("\n"))
    .join("\n\n");

  return [
    greeting(cotizacion.clienteNombre),
    "",
    `Le compartimos las opciones disponibles para su cotización${cotizacionLabel(cotizacion)}:`,
    "",
    optionsText || "No hay opciones disponibles para compartir.",
    "",
    "Quedamos atentos a su confirmación para proceder.",
  ].join("\n");
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string) {
  const normalizedPhone = normalizeEcuadorPhone(phone);
  if (!normalizedPhone) return null;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
