// Reserva (apartado) — documento INTERNO no tributario. El cliente abona para
// apartar un ítem del inventario y lo va pagando en varios abonos dentro de un
// plazo (7/15/30 días). Si vence sin completarse, el empleado la libera y lo
// abonado queda como SALDO A FAVOR del cliente. Si se completa el pago o se
// factura, el ítem pasa a "Vendido" y se descuenta de inventario.

export type PlazoReserva = 7 | 15 | 30;

// Estado persistido de la reserva. "Activa" vencida (hoy > fecha límite) se
// muestra en la bandeja de vencidas hasta que el empleado la libere ("Liberada",
// generando el saldo a favor). "Cancelada" = anulada antes de vencer.
export type ReservaEstado = "Activa" | "Facturada" | "Liberada" | "Cancelada";

export type AbonoReserva = {
  monto:         number;
  fecha:         string;   // ISO
  formaPago:     string;   // código SRI del catálogo de formas de pago
  registradoPor: string;
};

export type ReservaCliente = {
  identificacion?: string;
  razonSocial:     string;
  correo?:         string;
  telefono?:       string;
  airtableId?:     string;
};

export type CrearReservaInput = {
  cliente:         ReservaCliente;
  shippingItemId:  string;
  descripcionItem: string;
  precioVenta:     number;
  plazoDias:       PlazoReserva;
  // Abono inicial (obligatorio: debe alcanzar el mínimo). Los siguientes abonos
  // se registran con otro endpoint sobre la reserva ya creada.
  abonoInicial:    { monto: number; formaPago: string };
};
