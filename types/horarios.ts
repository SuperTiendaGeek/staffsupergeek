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
