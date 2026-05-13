export type TipoMarcacion =
  | "entrada"
  | "salida_almuerzo"
  | "regreso_almuerzo"
  | "salida_final"
  | "ajuste_admin";

export type EstadoDia =
  | "Pendiente"
  | "Trabajando"
  | "En almuerzo"
  | "Finalizado"
  | "Incompleto"
  | "Revisado";

export type HorarioMarcacion = {
  id: string;
  empleado: string;
  usuarioId: string;
  fechaHora: string;
  tipo: TipoMarcacion;
  registroDiaId?: string;
  ip?: string;
  userAgent?: string;
  origen?: string;
  observacion?: string;
};

export type HorarioRegistro = {
  id: string;
  empleado: string;
  empleadoRecordId?: string;
  empleadoCedula?: string;
  empleadoRol?: string;
  usuarioId: string;
  correo: string;
  fecha: string;
  estadoDia: EstadoDia;
  entrada?: string;
  salidaAlmuerzo?: string;
  regresoAlmuerzo?: string;
  salidaFinal?: string;
  minutosTrabajados: number;
  horasTrabajadas: number;
  sueldoBase: number;
  horasBaseMes: number;
  valorHora: number;
  totalEstimadoDia: number;
  observaciones?: string;
};

export type HorarioEstado = {
  registro: HorarioRegistro | null;
  marcaciones: HorarioMarcacion[];
  siguienteMarcacion: TipoMarcacion | null;
  siguienteEtiqueta: string;
  puedeMarcar: boolean;
  fecha: string;
  ahoraServidor: string;
  resumen: {
    minutosTrabajados: number;
    horasTrabajadas: number;
    totalEstimadoDia: number;
    valorHora: number;
    sueldoBase: number;
    horasBaseMes: number;
  };
};

export type HorarioEmpleadoResumenBloque = {
  minutosTrabajados: number;
  horasTrabajadas: number;
  totalEstimado: number;
};

export type HorarioEmpleadoResumen = {
  hoy: HorarioEmpleadoResumenBloque;
  semana: HorarioEmpleadoResumenBloque;
  mes: HorarioEmpleadoResumenBloque;
  periodoJornadas: {
    fechaInicio: string;
    fechaFin: string;
  };
};

export type HorarioEmpleadoVista = {
  resumen: HorarioEmpleadoResumen;
  resumenPagos: HorarioEmpleadoResumenPagos;
  jornadas: HorarioRegistro[];
  ajustes: HorarioAjuste[];
  pagos: HorarioPago[];
  rolesPago: HorarioEmpleadoRolPago[];
};

export type HorarioAdminEmpleadoResumen = {
  empleadoKey: string;
  empleado: string;
  empleadoRecordId?: string;
  empleadoCedula?: string;
  empleadoRol?: string;
  usuarioId: string;
  correo: string;
  minutosTrabajados: number;
  horasTrabajadas: number;
  totalGanado: number;
  totalAjustes: number;
  totalNeto: number;
  totalPagado: number;
  saldoPendiente: number;
  registrosCount: number;
};

export type HorarioAdminResumen = {
  periodo: {
    fechaInicio: string;
    fechaFin: string;
  };
  totales: {
    minutosTrabajados: number;
    horasTrabajadas: number;
    totalGanado: number;
    totalAjustes: number;
    totalNeto: number;
    totalPagado: number;
    saldoPendiente: number;
  };
  empleados: HorarioAdminEmpleadoResumen[];
};

export type EstadoPeriodoPago = "Abierto" | "Parcialmente pagado" | "Pagado" | "Anulado";

export type EstadoPagoHorario = "Registrado" | "Anulado";

export type EstadoRolPago = "Pendiente" | "Generado" | "Regenerado" | "Anulado";

export type HorarioEstadoGeneralPago =
  | "Sin jornadas pagables"
  | "Sin pagos registrados"
  | "Parcialmente pagado"
  | "Pagado";

export const HORARIO_METODOS_PAGO = ["Transferencia bancaria", "Efectivo", "Depósito", "Otro"] as const;

export type HorarioMetodoPago = (typeof HORARIO_METODOS_PAGO)[number];

export type HorarioPagoComprobante = {
  id?: string;
  url: string;
  filename?: string;
  contentType?: string;
  thumbnailUrl?: string;
};

export type HorarioPago = {
  id: string;
  empleadoRecordId?: string;
  periodoPagoId?: string;
  periodoFechaInicio?: string;
  periodoFechaFin?: string;
  periodoRolGenerado?: boolean;
  periodoRolPagoBlobPathname?: string;
  fechaPago: string;
  montoPagado: number;
  metodoPago?: HorarioMetodoPago | string;
  comprobantes: HorarioPagoComprobante[];
  numeroTransaccion?: string;
  bancoCuentaOrigen?: string;
  observacion?: string;
  registradoPor?: string;
  estadoPago: EstadoPagoHorario | string;
};

export type HorarioAjuste = {
  id: string;
  empleadoRecordId?: string;
  registroDelDiaId?: string;
  periodoPagoId?: string;
  tipoAjuste: string;
  minutosAjustados: number;
  horasAjustadas: number;
  montoAjustado: number;
  motivo: string;
  aprobadoPor?: string;
  fechaAjuste: string;
  estado: string;
  esDescuento: boolean;
};

export type HorarioPeriodoPago = {
  id: string;
  empleado: string;
  empleadoRecordId?: string;
  empleadoCedula?: string;
  empleadoRol?: string;
  usuarioId: string;
  correo: string;
  fechaInicio: string;
  fechaFin: string;
  estadoPeriodo: EstadoPeriodoPago | string;
  registroIds: string[];
  pagoIds: string[];
  ajusteIds: string[];
  totalMinutos: number;
  totalHoras: number;
  totalGanado: number;
  totalAjustes: number;
  totalNeto: number;
  totalPagado: number;
  saldoPendiente: number;
  saldoPendienteNeto: number;
  rolPagoPdf: HorarioPagoComprobante[];
  rolPagoBlobUrl?: string;
  rolPagoBlobPathname?: string;
  rolGenerado: boolean;
  fechaGeneracionRol?: string;
  generadoPor?: string;
  observacionRol?: string;
  estadoRol: EstadoRolPago | string;
};

export type HorarioPeriodoPagoDetalle = HorarioPeriodoPago & {
  registros: HorarioRegistro[];
  pagos: HorarioPago[];
  ajustes: HorarioAjuste[];
};

export type HorarioEmpleadoResumenPagos = {
  totalGanadoPeriodos: number;
  totalPagadoPeriodos: number;
  saldoPendientePeriodos: number;
  ultimoPagoMonto: number | null;
  ultimoPagoFecha: string | null;
  periodosRegistrados: number;
  periodosConsiderados: number;
  estadoGeneral: HorarioEstadoGeneralPago;
};

export type HorarioEmpleadoRolPago = {
  periodoId: string;
  empleado: string;
  correo: string;
  fechaInicio: string;
  fechaFin: string;
  estadoPeriodo: EstadoPeriodoPago | string;
  totalGanado: number;
  totalAjustes: number;
  totalNeto: number;
  totalPagado: number;
  saldoPendiente: number;
  saldoPendienteNeto: number;
  rolPagoPdf: HorarioPagoComprobante[];
  rolPagoBlobUrl?: string;
  rolPagoBlobPathname?: string;
  fechaGeneracionRol?: string;
  estadoRol: EstadoRolPago | string;
};

export type HorarioEmpleadoPeriodoOption = {
  empleadoRecordId: string;
  empleado: string;
  cedula?: string;
  rol?: string;
  usuarioId: string;
  correo: string;
};

export type HorarioAdminEmpleadoDetalle = {
  empleado: HorarioEmpleadoPeriodoOption;
  resumen: {
    totalGanadoPendiente: number;
    totalPagado: number;
    saldoPendiente: number;
    jornadasPendientesCount: number;
    periodosCount: number;
    pagosCount: number;
  };
  jornadasPendientes: HorarioRegistro[];
  periodos: HorarioPeriodoPagoDetalle[];
  pagos: HorarioPago[];
};

export type CorregirJornadaAdminInput = {
  entrada: string;
  salidaAlmuerzo?: string;
  regresoAlmuerzo?: string;
  salidaFinal: string;
  observaciones?: string;
  estadoDia: "Finalizado" | "Revisado";
};
