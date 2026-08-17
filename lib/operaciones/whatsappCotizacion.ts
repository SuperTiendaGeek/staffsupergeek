import type { OperacionDetalle, OpcionDetalle } from "@/types/operaciones";

type OperacionCotizacionWhatsapp = Pick<
  OperacionDetalle,
  "codigo" | "clienteNombre"
>;

type OpcionCotizacionWhatsapp = Pick<
  OpcionDetalle,
  "productoDescripcion" | "proveedorNombre" | "tiempoEstimado" | "precioVentaCliente" | "notaParaCliente"
>;

const CIERRE_COTIZACION = "Quedamos atentos a su confirmación para proceder con el pedido.";

function textoLimpio(valor: string | null | undefined): string {
  return valor?.trim() ?? "";
}

function formatearDinero(valor: number | null | undefined): string | null {
  if (valor == null || !Number.isFinite(valor)) return null;
  return valor.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function normalizarTelefonoWhatsApp(telefono: string): string | null {
  let digits = telefono.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("5930") && digits.length >= 12) return `593${digits.slice(4)}`;
  if (digits.startsWith("593") && digits.length >= 11) return digits;
  if (digits.startsWith("0") && digits.length >= 9) return `593${digits.slice(1)}`;
  if (digits.length === 9) return `593${digits}`;

  return null;
}

function construirBloqueOpcion(opcion: OpcionCotizacionWhatsapp, titulo?: string): string {
  const producto = textoLimpio(opcion.productoDescripcion) || "Artículo cotizado";
  const proveedor = textoLimpio(opcion.proveedorNombre);
  const tiempo = textoLimpio(opcion.tiempoEstimado);
  const precio = formatearDinero(opcion.precioVentaCliente);
  const notaCliente = textoLimpio(opcion.notaParaCliente);

  const lineas = [
    titulo,
    `*Artículo:* ${producto}`,
    proveedor ? `*Proveedor:* ${proveedor}` : null,
    precio ? `*Precio:* $${precio}` : null,
    tiempo ? `*Entrega estimada:* ${tiempo}` : null,
    notaCliente ? `*Nota para el cliente:*\n${notaCliente}` : null,
  ].filter((linea): linea is string => Boolean(linea));

  return lineas.join("\n");
}

export function construirMensajeOpcionCotizada({
  operacion,
  opcion,
  saludo = "Buenas tardes",
}: {
  operacion: OperacionCotizacionWhatsapp;
  opcion: OpcionCotizacionWhatsapp;
  saludo?: string;
}): string {
  const cliente = textoLimpio(operacion.clienteNombre) || "cliente";
  const codigo = textoLimpio(operacion.codigo) || "la operación";

  return [
    `${saludo} estimado *${cliente}*, le compartimos la cotización *${codigo}* solicitada del siguiente artículo:`,
    construirBloqueOpcion(opcion),
    CIERRE_COTIZACION,
  ].join("\n\n");
}

export function construirMensajeOpcionesCotizadas({
  operacion,
  opciones,
  saludo = "Buenas tardes",
}: {
  operacion: OperacionCotizacionWhatsapp;
  opciones: OpcionCotizacionWhatsapp[];
  saludo?: string;
}): string {
  const cliente = textoLimpio(operacion.clienteNombre) || "cliente";
  const codigo = textoLimpio(operacion.codigo) || "la operación";
  const bloques = opciones.map((opcion, index) => construirBloqueOpcion(opcion, `*Opción ${index + 1}*`));

  return [
    `${saludo} estimado *${cliente}*, le compartimos la cotización *${codigo}* solicitada con las siguientes opciones:`,
    bloques.join("\n\n"),
    CIERRE_COTIZACION,
  ].join("\n\n");
}

export function construirUrlWhatsApp(telefono: string, mensaje: string): string | null {
  const telefonoWhatsApp = normalizarTelefonoWhatsApp(telefono);
  if (!telefonoWhatsApp) return null;
  return `https://wa.me/${telefonoWhatsApp}?text=${encodeURIComponent(mensaje)}`;
}
