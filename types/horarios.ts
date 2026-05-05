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
  jornadas: HorarioRegistro[];
  pagos: HorarioPago[];
};

export type HorarioAdminEmpleadoResumen = {
  empleadoKey: string;
  empleado: string;
  empleadoRecordId?: string;
  usuarioId: string;
  correo: string;
  minutosTrabajados: number;
  horasTrabajadas: number;
  totalGanado: number;
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
    totalPagado: number;
    saldoPendiente: number;
  };
  empleados: HorarioAdminEmpleadoResumen[];
};

export type EstadoPeriodoPago = "Abierto" | "Parcialmente pagado" | "Pagado" | "Anulado";

export type EstadoPagoHorario = "Registrado" | "Anulado";

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

export type HorarioPeriodoPago = {
  id: string;
  empleado: string;
  empleadoRecordId?: string;
  usuarioId: string;
  correo: string;
  fechaInicio: string;
  fechaFin: string;
  estadoPeriodo: EstadoPeriodoPago | string;
  registroIds: string[];
  pagoIds: string[];
  totalMinutos: number;
  totalHoras: number;
  totalGanado: number;
  totalPagado: number;
  saldoPendiente: number;
};

export type HorarioPeriodoPagoDetalle = HorarioPeriodoPago & {
  registros: HorarioRegistro[];
  pagos: HorarioPago[];
};

export type HorarioEmpleadoPeriodoOption = {
  empleadoRecordId: string;
  empleado: string;
  usuarioId: string;
  correo: string;
};
