// Fase 20.1 — Fundación del sistema contable SG.
// Ver docs/DISENO_FASE20_1_FUNDACION.md para el diseño completo aprobado.

export type TipoMovimiento = "Ingreso" | "Egreso" | "Movimiento Interno" | "Ajuste";

export type EstadoMovimiento = "Pendiente" | "Confirmado" | "Acreditado" | "Anulado";

export type EstadoDistribucion = "Sin distribuir" | "Distribuido" | "Pendiente de clasificar" | "No aplica";

export type OrigenMovimiento = "Shipping" | "Abonos" | "Facturación" | "Nómina" | "Manual" | "Sistema";

export type CategoriaMovimiento =
  | "Venta Mostrador"
  | "Venta Producto"
  | "Servicio Reparación"
  | "Repuesto"
  | "Producto Digital"
  | "Anticipo Cliente"
  | "Compra Proveedor Shipping"
  | "Compra Local Repuesto"
  | "Compra Licencia"
  | "Nómina"
  | "Recuperación Garantía"
  | "Depósito de Caja"
  | "Distribución de Rubros"
  | "Acreditación Pasarela"
  | "Pago SRI"
  | "Devolución"
  | "Ajuste de Caja"
  | "Otro";

export type TipoCuenta = "Temporal" | "Principal" | "Final" | "Tránsito";

// "Tarjeta" genérica se conserva solo por compatibilidad con selects legacy
// (§1.2 del diseño) — el código nuevo siempre escribe una opción específica.
export type MetodoMovimiento =
  | "Efectivo"
  | "Transferencia bancaria"
  | "Tarjeta débito"
  | "Tarjeta crédito"
  | "DataFast"
  | "PayPhone"
  | "PayPal"
  | "Dinero electrónico"
  | "Depósito"
  | "Tarjeta"
  | "Otro"
  | "No aplica";

export type Rubro = "capital" | "utilidad" | "iva" | "repuestoExterno";

export type RubrosMonto = {
  capital: number;
  utilidad: number;
  iva: number;
  repuestoExterno: number;
};

export type CuentaFinanciera = {
  id: string;
  nombre: string;
  tipo: TipoCuenta | string;
  permiteTransferirAIds: string[];
  permiteRecibirDeIds: string[];
  activa: boolean;
  saldoInicial: number;
  fechaCorte: string | null;
  movimientosOrigenIds: string[];
  movimientosDestinoIds: string[];
  // Fase 20.4 — inverso del link "Cuenta" en Finanzas Cuadres.
  cuadresIds: string[];
};

export type Movimiento = {
  id: string;
  movimientoId: string;
  origen: OrigenMovimiento | string;
  tipo: TipoMovimiento | string;
  categoria: CategoriaMovimiento | string;
  estado: EstadoMovimiento | string;
  estadoDistribucion: EstadoDistribucion | string;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
  monto: number;
  rubros: RubrosMonto;
  alertaDescuadre: boolean;
  metodo?: string;
  fecha: string;
  transaccionId?: string;
  observacion?: string;
  registradoPor?: string;
  fechaCreacion?: string;
  fechaAnulacion?: string;
  motivoAnulacion?: string;
  montoBruto: number | null;
  montoNeto: number | null;
  comision: number | null;
  abonoIds: string[];
  facturaElectronicaIds: string[];
  horariosPagoIds: string[];
  clienteIds: string[];
  proveedorIds: string[];
  pagoShippingIds: string[];
  reversaAId: string | null;
  // Inverso de reversaAId — Fase 20.3: los movimientos que compensan a este
  // (Interno-hijo/Ajuste-hijo de una acreditación, ver §3.3 del diseño).
  compensadoPorIds: string[];
  // Fase 20.4 — inverso de "Movimiento de Ajuste" en Finanzas Cuadres, si
  // este movimiento se originó como el ajuste de un cuadre de caja.
  cuadreDeCajaId: string | null;
};

export type CrearMovimientoInput = {
  tipo: TipoMovimiento;
  origen: OrigenMovimiento;
  categoria: CategoriaMovimiento;
  monto: number;
  cuentaOrigenId?: string | null;
  cuentaDestinoId?: string | null;
  // Default: "Confirmado". Úsalo explícito para dejar un Ingreso de tarjeta
  // en "Pendiente" hasta la acreditación (20.4).
  estado?: EstadoMovimiento;
  // Si no se pasa, se infiere (ver inferirEstadoDistribucion en validaciones.ts).
  estadoDistribucion?: EstadoDistribucion;
  rubros?: Partial<RubrosMonto>;
  metodo?: MetodoMovimiento | string;
  // ISO 8601. Default: ahora.
  fecha?: string;
  transaccionId?: string;
  comprobanteUrl?: string;
  observacion?: string;
  registradoPor: string;
  montoBruto?: number;
  montoNeto?: number;
  comision?: number;
  abonoId?: string;
  facturaElectronicaId?: string;
  horariosPagoId?: string;
  clienteId?: string;
  proveedorId?: string;
  pagoShippingId?: string;
  // Fase 20.3 — self-link "Reversa a": usado exclusivamente por
  // procesarAcreditacion() para enlazar el Interno-hijo/Ajuste-hijo al
  // movimiento Acreditado que compensan (ver lib/finanzas/acreditacion.ts).
  reversaAId?: string;
};

export type CrearMovimientoOptions = {
  // Escape hatch exclusivo del puente Shipping legacy (§4 del diseño): un
  // valor histórico de "Cuenta origen" (texto) sin mapeo conocido a
  // Cuentas Financieras no debe bloquear un pago a proveedor ya hecho —
  // el movimiento se crea sin Cuenta Origen y se loguea una advertencia,
  // en vez de fallar la operación completa. Ningún otro llamador debe
  // usar esto: todo origen nuevo (Abonos, Facturación, Nómina) siempre
  // debe poder resolver su cuenta.
  permitirCuentaFaltante?: boolean;
};

export type ListarMovimientosFiltros = {
  tipo?: TipoMovimiento;
  categoria?: CategoriaMovimiento;
  estado?: EstadoMovimiento;
  desde?: string;
  hasta?: string;
  maxRecords?: number;
};

// Fase 20.4 — Cuadre de caja (arqueo). Ver docs/DISENO_FASE20_4_CUADRE_REPORTE.md.

export type EstadoCuadre = "Cuadrado" | "Sobrante" | "Faltante";

export type EstadoAjusteCuadre = "Sin diferencia" | "Pendiente de revisión" | "Ajustado";

export type Cuadre = {
  id: string;
  cuadreId: string;
  cuentaId: string | null;
  saldoEsperado: number;
  montoContado: number;
  diferencia: number;
  estado: EstadoCuadre | string;
  estadoAjuste: EstadoAjusteCuadre | string;
  movimientoAjusteId: string | null;
  observacion?: string;
  realizadoPor?: string;
  fecha: string;
  fechaCreacion?: string;
};

export type CrearCuadreInput = {
  cuentaId: string;
  montoContado: number;
  // ISO 8601. Default: ahora.
  fecha?: string;
  observacion?: string;
  realizadoPor: string;
};
