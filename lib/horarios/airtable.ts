import "server-only";

import { findUserByEmail, listPortalUsers } from "@/lib/airtable";
import { canAccessApp, isAdministratorRole } from "@/lib/apps";
import type { SessionUser } from "@/lib/session";
import type {
  EstadoDia,
  EstadoPeriodoPago,
  HorarioAdminEmpleadoResumen,
  HorarioAdminResumen,
  HorarioEmpleadoResumen,
  HorarioEmpleadoPeriodoOption,
  HorarioEmpleadoVista,
  HorarioEstado,
  HorarioMarcacion,
  HorarioMetodoPago,
  HorarioPago,
  HorarioPagoComprobante,
  HorarioPeriodoPago,
  HorarioPeriodoPagoDetalle,
  HorarioRegistro,
  TipoMarcacion
} from "@/types/horarios";
import { HORARIO_METODOS_PAGO } from "@/types/horarios";

const SUELDO_BASE = 482;
const HORAS_BASE_MES = 160;
const VALOR_HORA = SUELDO_BASE / HORAS_BASE_MES;
const HORARIOS_TIME_ZONE = process.env.HORARIOS_TIME_ZONE?.trim() || "America/Guayaquil";
const REGISTROS_TABLE = process.env.AIRTABLE_HORARIOS_REGISTROS_TABLE?.trim() || "Horarios Registros";
const MARCACIONES_TABLE = process.env.AIRTABLE_HORARIOS_MARCACIONES_TABLE?.trim() || "Horarios Marcaciones";
const PAGOS_TABLE = process.env.AIRTABLE_HORARIOS_PAGOS_TABLE?.trim() || "Horarios Pagos";
const PERIODOS_TABLE = process.env.AIRTABLE_HORARIOS_PERIODOS_TABLE?.trim() || "Horarios Periodos de Pago";

const HORARIOS_REGISTROS_FIELDS = {
  empleado: "Empleado",
  usuarioId: "Usuario ID",
  correo: "Correo",
  fecha: "Fecha",
  estadoDia: "Estado del día",
  entrada: "Entrada",
  salidaAlmuerzo: "Salida Almuerzo",
  regresoAlmuerzo: "Regreso Almuerzo",
  salidaFinal: "Salida Final",
  minutosTrabajados: "Minutos Trabajados",
  horasTrabajadas: "Horas Trabajadas",
  sueldoBase: "Sueldo Base",
  horasBaseMes: "Horas Base Mes",
  valorHora: "Valor Hora",
  totalEstimadoDia: "Total Estimado Día",
  observaciones: "Observaciones",
  ipEntrada: "IP Entrada",
  ipSalida: "IP Salida",
  userAgent: "User Agent",
  creadoPor: "Creado por"
} as const;

const HORARIOS_MARCACIONES_FIELDS = {
  registroDelDia: "Registro del Día",
  empleado: "Empleado",
  usuarioId: "Usuario ID",
  correo: "Correo",
  fechaHora: "Fecha y Hora",
  tipoMarcacion: "Tipo de Marcación",
  estadoResultante: "Estado resultante",
  ip: "IP",
  userAgent: "User Agent",
  origen: "Origen",
  observacion: "Observación"
} as const;

const HORARIOS_PAGOS_FIELDS = {
  empleado: "Empleado",
  periodoPago: "Periodo de Pago",
  fechaPago: "Fecha de Pago",
  montoPagado: "Monto Pagado",
  metodoPago: "Método de Pago",
  comprobante: "Comprobante",
  numeroTransaccion: "Número de Transacción",
  bancoCuentaOrigen: "Banco / Cuenta Origen",
  observacion: "Observación",
  registradoPor: "Registrado por",
  estadoPago: "Estado del Pago"
} as const;

const HORARIOS_PERIODOS_FIELDS = {
  empleado: "Empleado",
  usuarioId: "Usuario ID",
  correo: "Correo",
  fechaInicio: "Fecha Inicio",
  fechaFin: "Fecha Fin",
  estadoPeriodo: "Estado del Periodo",
  registrosPeriodo: "Registros del Periodo",
  totalMinutos: "Total Minutos",
  totalHoras: "Total Horas",
  totalGanado: "Total Ganado",
  pagos: "Pagos",
  totalPagado: "Total Pagado",
  saldoPendiente: "Saldo Pendiente"
} as const;

type AirtableRecord<TFields> = {
  id: string;
  fields: TFields;
};

type AirtableListResponse<TFields> = {
  records: Array<AirtableRecord<TFields>>;
  offset?: string;
};

type HorarioRegistroFields = {
  Empleado?: string | string[];
  "Usuario ID"?: string;
  Correo?: string;
  Fecha?: string;
  "Estado del día"?: EstadoDia;
  Entrada?: string;
  "Salida Almuerzo"?: string;
  "Regreso Almuerzo"?: string;
  "Salida Final"?: string;
  "Minutos Trabajados"?: number;
  "Horas Trabajadas"?: number;
  "Sueldo Base"?: number;
  "Horas Base Mes"?: number;
  "Valor Hora"?: number;
  "Total Estimado Día"?: number;
  Observaciones?: string;
  "IP Entrada"?: string;
  "IP Salida"?: string;
  "User Agent"?: string;
};

type HorarioMarcacionFields = {
  Empleado?: string | string[];
  "Usuario ID"?: string;
  Correo?: string;
  "Fecha y Hora"?: string;
  "Tipo de Marcación"?: TipoMarcacion;
  "Estado resultante"?: EstadoDia;
  "Registro del Día"?: string[];
  IP?: string;
  "User Agent"?: string;
  Origen?: string;
  Observación?: string;
};

type HorarioPagoFields = {
  Empleado?: string | string[];
  "Periodo de Pago"?: string | string[];
  "Fecha de Pago"?: string;
  "Monto Pagado"?: number;
  "Método de Pago"?: string;
  Comprobante?: unknown;
  "Número de Transacción"?: string;
  "Banco / Cuenta Origen"?: string;
  Observación?: string;
  "Registrado por"?: string;
  "Estado del Pago"?: string;
};

type HorarioPeriodoPagoFields = {
  Empleado?: string | string[];
  "Usuario ID"?: string;
  Correo?: string;
  "Fecha Inicio"?: string;
  "Fecha Fin"?: string;
  "Estado del Periodo"?: EstadoPeriodoPago | string;
  "Registros del Periodo"?: string[];
  "Total Minutos"?: number;
  "Total Horas"?: number;
  "Total Ganado"?: number;
  Pagos?: string[];
  "Total Pagado"?: number;
  "Saldo Pendiente"?: number;
};

type EstadoResultanteMarcacion = Exclude<EstadoDia, "Pendiente">;

type CrearPeriodoPagoInput = {
  empleadoId: string;
  fechaInicio: string;
  fechaFin: string;
};

type RegistrarPagoHorarioInput = {
  periodoId: string;
  fechaPago: string;
  montoPagado: number;
  metodoPago?: string | null;
  numeroTransaccion?: string | null;
  bancoCuentaOrigen?: string | null;
  observacion?: string | null;
  registradoPor?: string | null;
  comprobanteArchivo?: {
    filename: string;
    contentType: string;
    fileBase64: string;
  } | null;
};

type RequestMeta = {
  ip?: string;
  userAgent?: string;
  observacion?: string;
};

function getRequiredEnv(name: "AIRTABLE_API_KEY" | "AIRTABLE_BASE_ID") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing Airtable environment variable: ${name}`);
  }

  return value;
}

function getAirtableHeaders() {
  return {
    Authorization: `Bearer ${getRequiredEnv("AIRTABLE_API_KEY")}`,
    "Content-Type": "application/json"
  };
}

function getAirtableBaseId() {
  return getRequiredEnv("AIRTABLE_BASE_ID");
}

function getTableUrl(tableName: string, recordId?: string) {
  const baseId = getAirtableBaseId();
  const recordPath = recordId ? `/${encodeURIComponent(recordId)}` : "";

  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}${recordPath}`;
}

function escapeFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function debugHorarios(message: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info(`[horarios] ${message}`, payload);
}

function isAirtableRecordId(value: string) {
  return /^rec[a-zA-Z0-9]{14}$/.test(value);
}

async function getEmpleadoRecordId(user: SessionUser) {
  if (isAirtableRecordId(user.userId)) {
    return user.userId;
  }

  const airtableUser = await findUserByEmail(user.email);

  if (!airtableUser) {
    throw new Error("No se encontró el usuario autenticado en Airtable.");
  }

  return airtableUser.recordId;
}

async function parseAirtableJson<T>(response: Response) {
  return (await response.json()) as T;
}

async function airtableRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...getAirtableHeaders(),
      ...init?.headers
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Airtable horarios request failed with status ${response.status}: ${responseText}`);
  }

  return parseAirtableJson<T>(response);
}

async function uploadAttachmentToRecord(input: {
  recordId: string;
  attachmentFieldIdOrName: string;
  filename: string;
  contentType: string;
  fileBase64: string;
}) {
  const url = `https://content.airtable.com/v0/${encodeURIComponent(getAirtableBaseId())}/${encodeURIComponent(input.recordId)}/${encodeURIComponent(input.attachmentFieldIdOrName)}/uploadAttachment`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getRequiredEnv("AIRTABLE_API_KEY")}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      contentType: input.contentType,
      filename: input.filename,
      file: input.fileBase64
    })
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Airtable horarios attachment upload failed with status ${response.status}: ${responseText}`);
  }
}

async function listAllAirtableRecords<TFields>(tableName: string, query: URLSearchParams) {
  const records: Array<AirtableRecord<TFields>> = [];
  let offset: string | undefined;

  do {
    const pageQuery = new URLSearchParams(query);

    if (offset) {
      pageQuery.set("offset", offset);
    }

    const data = await airtableRequest<AirtableListResponse<TFields>>(`${getTableUrl(tableName)}?${pageQuery.toString()}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

function getLocalDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HORARIOS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function getCurrentWeekRange(date = new Date()) {
  const todayKey = getLocalDateKey(date);
  const today = new Date(`${todayKey}T12:00:00.000Z`);
  const day = today.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const fechaInicio = addDaysToDateKey(todayKey, mondayOffset);
  const fechaFin = addDaysToDateKey(fechaInicio, 6);

  return { fechaInicio, fechaFin };
}

function getCurrentMonthRange(date = new Date()) {
  const todayKey = getLocalDateKey(date);
  const [year = "", month = ""] = todayKey.split("-");
  const monthStart = `${year}-${month}-01`;
  const nextMonth = new Date(`${monthStart}T12:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(0);

  return {
    fechaInicio: monthStart,
    fechaFin: nextMonth.toISOString().slice(0, 10)
  };
}

function toTimestamp(value?: string) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function diffMinutes(start?: string, end?: string) {
  const startTime = toTimestamp(start);
  const endTime = toTimestamp(end);

  if (startTime === null || endTime === null || endTime <= startTime) {
    return 0;
  }

  return Math.floor((endTime - startTime) / 60000);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundHours(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

function calculateMinutes(registro: Pick<HorarioRegistro, "entrada" | "salidaAlmuerzo" | "regresoAlmuerzo" | "salidaFinal">, now: Date, includeOpenSegment: boolean) {
  if (!registro.entrada) {
    return 0;
  }

  if (registro.salidaFinal) {
    if (registro.salidaAlmuerzo) {
      return diffMinutes(registro.entrada, registro.salidaAlmuerzo) + diffMinutes(registro.regresoAlmuerzo, registro.salidaFinal);
    }

    return diffMinutes(registro.entrada, registro.salidaFinal);
  }

  if (registro.salidaAlmuerzo) {
    const lunchStartMinutes = diffMinutes(registro.entrada, registro.salidaAlmuerzo);

    if (registro.regresoAlmuerzo && includeOpenSegment) {
      return lunchStartMinutes + diffMinutes(registro.regresoAlmuerzo, now.toISOString());
    }

    return lunchStartMinutes;
  }

  return includeOpenSegment ? diffMinutes(registro.entrada, now.toISOString()) : 0;
}

function getTotals(minutes: number) {
  const horasTrabajadas = roundHours(minutes);

  return {
    minutosTrabajados: minutes,
    horasTrabajadas,
    sueldoBase: SUELDO_BASE,
    horasBaseMes: HORAS_BASE_MES,
    valorHora: VALOR_HORA,
    totalEstimadoDia: roundMoney(horasTrabajadas * VALOR_HORA)
  };
}

function mapTotalsToRegistroFields(totals: ReturnType<typeof getTotals>): HorarioRegistroFields {
  return {
    [HORARIOS_REGISTROS_FIELDS.minutosTrabajados]: totals.minutosTrabajados,
    [HORARIOS_REGISTROS_FIELDS.horasTrabajadas]: totals.horasTrabajadas,
    [HORARIOS_REGISTROS_FIELDS.sueldoBase]: totals.sueldoBase,
    [HORARIOS_REGISTROS_FIELDS.horasBaseMes]: totals.horasBaseMes,
    [HORARIOS_REGISTROS_FIELDS.valorHora]: totals.valorHora,
    [HORARIOS_REGISTROS_FIELDS.totalEstimadoDia]: totals.totalEstimadoDia
  };
}

function getEmpleadoLabel(value: string | string[] | undefined, fallback: string) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return fallback;
}

function getLinkedRecordId(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return isAirtableRecordId(value || "") ? value : undefined;
}

function normalizeRegistradoPor(value?: string | null) {
  const textValue = typeof value === "string" ? value.trim() : "";

  return textValue || "Administrador";
}

export function normalizeHorarioMetodoPago(value?: string | null): HorarioMetodoPago {
  const textValue = typeof value === "string" ? value.trim() : "";

  if (textValue === "Transferencia") {
    return "Transferencia bancaria";
  }

  if ((HORARIO_METODOS_PAGO as readonly string[]).includes(textValue)) {
    return textValue as HorarioMetodoPago;
  }

  return "Transferencia bancaria";
}

function normalizeTextForComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isEligibleHorarioRole(role: string) {
  const normalizedRole = normalizeTextForComparison(role);
  const allowedRoles = new Set([
    "admin",
    "administrador",
    "manager",
    "technical",
    "tecnico",
    "finance",
    "finanzas",
    "staff",
    "empleado",
    "empleado general"
  ]);

  return allowedRoles.has(normalizedRole);
}

function mapRegistro(record: AirtableRecord<HorarioRegistroFields>): HorarioRegistro {
  const fields = record.fields;

  return {
    id: record.id,
    empleadoRecordId: getLinkedRecordId(fields[HORARIOS_REGISTROS_FIELDS.empleado]),
    empleado: getEmpleadoLabel(fields[HORARIOS_REGISTROS_FIELDS.empleado], fields[HORARIOS_REGISTROS_FIELDS.correo] || "Staff SUPER GEEK"),
    usuarioId: fields[HORARIOS_REGISTROS_FIELDS.usuarioId] || "",
    correo: fields[HORARIOS_REGISTROS_FIELDS.correo] || "",
    fecha: fields[HORARIOS_REGISTROS_FIELDS.fecha] || "",
    estadoDia: fields[HORARIOS_REGISTROS_FIELDS.estadoDia] || "Pendiente",
    entrada: fields[HORARIOS_REGISTROS_FIELDS.entrada],
    salidaAlmuerzo: fields[HORARIOS_REGISTROS_FIELDS.salidaAlmuerzo],
    regresoAlmuerzo: fields[HORARIOS_REGISTROS_FIELDS.regresoAlmuerzo],
    salidaFinal: fields[HORARIOS_REGISTROS_FIELDS.salidaFinal],
    minutosTrabajados: fields[HORARIOS_REGISTROS_FIELDS.minutosTrabajados] || 0,
    horasTrabajadas: fields[HORARIOS_REGISTROS_FIELDS.horasTrabajadas] || 0,
    sueldoBase: fields[HORARIOS_REGISTROS_FIELDS.sueldoBase] || SUELDO_BASE,
    horasBaseMes: fields[HORARIOS_REGISTROS_FIELDS.horasBaseMes] || HORAS_BASE_MES,
    valorHora: fields[HORARIOS_REGISTROS_FIELDS.valorHora] || VALOR_HORA,
    totalEstimadoDia: fields[HORARIOS_REGISTROS_FIELDS.totalEstimadoDia] || 0,
    observaciones: fields[HORARIOS_REGISTROS_FIELDS.observaciones]
  };
}

function mapMarcacion(record: AirtableRecord<HorarioMarcacionFields>): HorarioMarcacion {
  const fields = record.fields;

  return {
    id: record.id,
    empleado: getEmpleadoLabel(fields[HORARIOS_MARCACIONES_FIELDS.empleado], fields[HORARIOS_MARCACIONES_FIELDS.usuarioId] || "Staff SUPER GEEK"),
    usuarioId: fields[HORARIOS_MARCACIONES_FIELDS.usuarioId] || "",
    fechaHora: fields[HORARIOS_MARCACIONES_FIELDS.fechaHora] || "",
    tipo: fields[HORARIOS_MARCACIONES_FIELDS.tipoMarcacion] || "entrada",
    registroDiaId: fields[HORARIOS_MARCACIONES_FIELDS.registroDelDia]?.[0],
    ip: fields[HORARIOS_MARCACIONES_FIELDS.ip],
    userAgent: fields[HORARIOS_MARCACIONES_FIELDS.userAgent],
    origen: fields[HORARIOS_MARCACIONES_FIELDS.origen],
    observacion: fields[HORARIOS_MARCACIONES_FIELDS.observacion]
  };
}

function parsePagoComprobantes(value: unknown): HorarioPagoComprobante[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<HorarioPagoComprobante[]>((attachments, item) => {
    if (!item || typeof item !== "object") {
      return attachments;
    }

    const attachment = item as {
      id?: unknown;
      url?: unknown;
      filename?: unknown;
      type?: unknown;
      thumbnails?: { small?: { url?: unknown }; large?: { url?: unknown } };
    };

    if (typeof attachment.url !== "string") {
      return attachments;
    }

    attachments.push({
        id: typeof attachment.id === "string" ? attachment.id : undefined,
        url: attachment.url,
        filename: typeof attachment.filename === "string" ? attachment.filename : undefined,
        contentType: typeof attachment.type === "string" ? attachment.type : undefined,
        thumbnailUrl:
          typeof attachment.thumbnails?.small?.url === "string"
            ? attachment.thumbnails.small.url
            : typeof attachment.thumbnails?.large?.url === "string"
              ? attachment.thumbnails.large.url
              : undefined
    });

    return attachments;
  }, []);
}

function mapPago(record: AirtableRecord<HorarioPagoFields>): HorarioPago {
  const fields = record.fields;

  return {
    id: record.id,
    empleadoRecordId: getLinkedRecordId(fields[HORARIOS_PAGOS_FIELDS.empleado]),
    periodoPagoId: getLinkedRecordId(fields[HORARIOS_PAGOS_FIELDS.periodoPago]),
    fechaPago: fields[HORARIOS_PAGOS_FIELDS.fechaPago] || "",
    montoPagado: fields[HORARIOS_PAGOS_FIELDS.montoPagado] || 0,
    metodoPago: fields[HORARIOS_PAGOS_FIELDS.metodoPago],
    comprobantes: parsePagoComprobantes(fields[HORARIOS_PAGOS_FIELDS.comprobante]),
    numeroTransaccion: fields[HORARIOS_PAGOS_FIELDS.numeroTransaccion],
    bancoCuentaOrigen: fields[HORARIOS_PAGOS_FIELDS.bancoCuentaOrigen],
    observacion: fields[HORARIOS_PAGOS_FIELDS.observacion],
    registradoPor: getEmpleadoLabel(fields[HORARIOS_PAGOS_FIELDS.registradoPor], ""),
    estadoPago: fields[HORARIOS_PAGOS_FIELDS.estadoPago] || "Registrado"
  };
}

function mapPeriodo(record: AirtableRecord<HorarioPeriodoPagoFields>): HorarioPeriodoPago {
  const fields = record.fields;

  return {
    id: record.id,
    empleadoRecordId: getLinkedRecordId(fields[HORARIOS_PERIODOS_FIELDS.empleado]),
    empleado: getEmpleadoLabel(fields[HORARIOS_PERIODOS_FIELDS.empleado], fields[HORARIOS_PERIODOS_FIELDS.correo] || "Staff SUPER GEEK"),
    usuarioId: fields[HORARIOS_PERIODOS_FIELDS.usuarioId] || "",
    correo: fields[HORARIOS_PERIODOS_FIELDS.correo] || "",
    fechaInicio: fields[HORARIOS_PERIODOS_FIELDS.fechaInicio] || "",
    fechaFin: fields[HORARIOS_PERIODOS_FIELDS.fechaFin] || "",
    estadoPeriodo: fields[HORARIOS_PERIODOS_FIELDS.estadoPeriodo] || "Abierto",
    registroIds: fields[HORARIOS_PERIODOS_FIELDS.registrosPeriodo] || [],
    pagoIds: fields[HORARIOS_PERIODOS_FIELDS.pagos] || [],
    totalMinutos: fields[HORARIOS_PERIODOS_FIELDS.totalMinutos] || 0,
    totalHoras: fields[HORARIOS_PERIODOS_FIELDS.totalHoras] || 0,
    totalGanado: fields[HORARIOS_PERIODOS_FIELDS.totalGanado] || 0,
    totalPagado: fields[HORARIOS_PERIODOS_FIELDS.totalPagado] || 0,
    saldoPendiente: fields[HORARIOS_PERIODOS_FIELDS.saldoPendiente] || 0
  };
}

function getNextAction(registro: HorarioRegistro | null): Pick<HorarioEstado, "siguienteMarcacion" | "siguienteEtiqueta" | "puedeMarcar"> {
  if (!registro || !registro.entrada) {
    return { siguienteMarcacion: "entrada", siguienteEtiqueta: "Marcar entrada", puedeMarcar: true };
  }

  if (registro.salidaFinal || registro.estadoDia === "Finalizado") {
    return { siguienteMarcacion: null, siguienteEtiqueta: "Jornada finalizada", puedeMarcar: false };
  }

  if (!registro.salidaAlmuerzo) {
    return { siguienteMarcacion: "salida_almuerzo", siguienteEtiqueta: "Salir al almuerzo", puedeMarcar: true };
  }

  if (!registro.regresoAlmuerzo) {
    return { siguienteMarcacion: "regreso_almuerzo", siguienteEtiqueta: "Regresar del almuerzo", puedeMarcar: true };
  }

  return { siguienteMarcacion: "salida_final", siguienteEtiqueta: "Marcar salida final", puedeMarcar: true };
}

function buildRegistroActualFormula(user: SessionUser, fecha: string) {
  const fechaField = HORARIOS_REGISTROS_FIELDS.fecha;
  const fechaFormula = `OR({${fechaField}} = '${escapeFormulaString(fecha)}', DATETIME_FORMAT({${fechaField}}, 'YYYY-MM-DD') = '${escapeFormulaString(fecha)}')`;
  const userFormula = `OR({${HORARIOS_REGISTROS_FIELDS.usuarioId}} = '${escapeFormulaString(user.userId)}', LOWER({${HORARIOS_REGISTROS_FIELDS.correo}}) = '${escapeFormulaString(user.email.toLowerCase())}')`;

  return `AND(${userFormula}, ${fechaFormula})`;
}

async function findRegistroByUserAndDate(user: SessionUser, fecha: string) {
  const formula = buildRegistroActualFormula(user, fecha);
  const url = `${getTableUrl(REGISTROS_TABLE)}?maxRecords=5&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableRequest<AirtableListResponse<HorarioRegistroFields>>(url);
  const record = data.records[0];

  debugHorarios("busqueda registro actual", {
    fecha,
    userId: user.userId,
    correo: user.email,
    registrosEncontrados: data.records.length,
    formula
  });

  return record ? mapRegistro(record) : null;
}

async function listMarcacionesByUserAndDate(usuarioId: string, fecha: string) {
  const formula = `AND({${HORARIOS_MARCACIONES_FIELDS.usuarioId}} = '${escapeFormulaString(usuarioId)}', DATETIME_FORMAT(SET_TIMEZONE({${HORARIOS_MARCACIONES_FIELDS.fechaHora}}, '${escapeFormulaString(HORARIOS_TIME_ZONE)}'), 'YYYY-MM-DD') = '${escapeFormulaString(fecha)}')`;
  const query = new URLSearchParams({
    filterByFormula: formula,
    "sort[0][field]": HORARIOS_MARCACIONES_FIELDS.fechaHora,
    "sort[0][direction]": "asc"
  });
  const data = await airtableRequest<AirtableListResponse<HorarioMarcacionFields>>(`${getTableUrl(MARCACIONES_TABLE)}?${query.toString()}`);

  return data.records.map(mapMarcacion);
}

async function createMarcacion(
  user: SessionUser,
  empleadoRecordId: string,
  tipo: TipoMarcacion,
  registroId: string,
  now: Date,
  meta: RequestMeta,
  estadoResultante: EstadoResultanteMarcacion
) {
  const record = await airtableRequest<AirtableRecord<HorarioMarcacionFields>>(getTableUrl(MARCACIONES_TABLE), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        [HORARIOS_MARCACIONES_FIELDS.empleado]: [empleadoRecordId],
        [HORARIOS_MARCACIONES_FIELDS.usuarioId]: user.userId,
        [HORARIOS_MARCACIONES_FIELDS.correo]: user.email,
        [HORARIOS_MARCACIONES_FIELDS.fechaHora]: now.toISOString(),
        [HORARIOS_MARCACIONES_FIELDS.tipoMarcacion]: tipo,
        [HORARIOS_MARCACIONES_FIELDS.estadoResultante]: estadoResultante,
        [HORARIOS_MARCACIONES_FIELDS.registroDelDia]: [registroId],
        [HORARIOS_MARCACIONES_FIELDS.ip]: meta.ip,
        [HORARIOS_MARCACIONES_FIELDS.userAgent]: meta.userAgent,
        [HORARIOS_MARCACIONES_FIELDS.origen]: "Portal Staff",
        [HORARIOS_MARCACIONES_FIELDS.observacion]: meta.observacion
      }
    })
  });

  return mapMarcacion(record);
}

async function createRegistro(user: SessionUser, empleadoRecordId: string, fecha: string, now: Date, meta: RequestMeta) {
  const totals = getTotals(0);
  const record = await airtableRequest<AirtableRecord<HorarioRegistroFields>>(getTableUrl(REGISTROS_TABLE), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        [HORARIOS_REGISTROS_FIELDS.empleado]: [empleadoRecordId],
        [HORARIOS_REGISTROS_FIELDS.usuarioId]: user.userId,
        [HORARIOS_REGISTROS_FIELDS.correo]: user.email,
        [HORARIOS_REGISTROS_FIELDS.fecha]: fecha,
        [HORARIOS_REGISTROS_FIELDS.estadoDia]: "Trabajando",
        [HORARIOS_REGISTROS_FIELDS.entrada]: now.toISOString(),
        ...mapTotalsToRegistroFields(totals),
        [HORARIOS_REGISTROS_FIELDS.ipEntrada]: meta.ip,
        [HORARIOS_REGISTROS_FIELDS.userAgent]: meta.userAgent
      }
    })
  });

  return mapRegistro(record);
}

async function updateRegistro(registro: HorarioRegistro, fields: HorarioRegistroFields) {
  const record = await airtableRequest<AirtableRecord<HorarioRegistroFields>>(getTableUrl(REGISTROS_TABLE, registro.id), {
    method: "PATCH",
    body: JSON.stringify({ fields })
  });

  return mapRegistro(record);
}

function buildEstado(registro: HorarioRegistro | null, marcaciones: HorarioMarcacion[], fecha: string, now: Date): HorarioEstado {
  const minutes = registro ? calculateMinutes(registro, now, true) : 0;
  const resumen = getTotals(minutes);

  return {
    registro: registro ? { ...registro, ...resumen } : null,
    marcaciones,
    ...getNextAction(registro),
    fecha,
    ahoraServidor: now.toISOString(),
    resumen
  };
}

export async function getHorarioEstado(user: SessionUser) {
  const now = new Date();
  const fecha = getLocalDateKey(now);
  const [registro, marcaciones] = await Promise.all([
    findRegistroByUserAndDate(user, fecha),
    listMarcacionesByUserAndDate(user.userId, fecha)
  ]);

  return buildEstado(registro, marcaciones, fecha, now);
}

export async function marcarHorario(user: SessionUser, tipo: TipoMarcacion, meta: RequestMeta) {
  const now = new Date();
  const fecha = getLocalDateKey(now);
  const registro = await findRegistroByUserAndDate(user, fecha);
  const empleadoRecordId = await getEmpleadoRecordId(user);

  if (tipo === "entrada") {
    if (registro?.entrada) {
      throw new Error("Ya registraste la entrada de hoy.");
    }

    const newRegistro = await createRegistro(user, empleadoRecordId, fecha, now, meta);
    await createMarcacion(user, empleadoRecordId, tipo, newRegistro.id, now, meta, "Trabajando");
    const marcaciones = await listMarcacionesByUserAndDate(user.userId, fecha);

    return buildEstado(newRegistro, marcaciones, fecha, now);
  }

  if (!registro?.entrada) {
    throw new Error("Primero debes marcar la entrada.");
  }

  if (registro.salidaFinal || registro.estadoDia === "Finalizado") {
    throw new Error("La jornada de hoy ya fue finalizada.");
  }

  let updatedRegistro: HorarioRegistro;
  let estadoResultante: EstadoResultanteMarcacion;

  if (tipo === "salida_almuerzo") {
    if (registro.salidaAlmuerzo) {
      throw new Error("Ya registraste la salida al almuerzo.");
    }

    const draft = { ...registro, salidaAlmuerzo: now.toISOString() };
    const totals = getTotals(calculateMinutes(draft, now, false));
    updatedRegistro = await updateRegistro(registro, {
      [HORARIOS_REGISTROS_FIELDS.salidaAlmuerzo]: now.toISOString(),
      [HORARIOS_REGISTROS_FIELDS.estadoDia]: "En almuerzo",
      ...mapTotalsToRegistroFields(totals)
    });
    estadoResultante = "En almuerzo";
  } else if (tipo === "regreso_almuerzo") {
    if (!registro.salidaAlmuerzo) {
      throw new Error("Primero debes marcar la salida al almuerzo.");
    }

    if (registro.regresoAlmuerzo) {
      throw new Error("Ya registraste el regreso del almuerzo.");
    }

    updatedRegistro = await updateRegistro(registro, {
      [HORARIOS_REGISTROS_FIELDS.regresoAlmuerzo]: now.toISOString(),
      [HORARIOS_REGISTROS_FIELDS.estadoDia]: "Trabajando"
    });
    estadoResultante = "Trabajando";
  } else if (tipo === "salida_final") {
    if (registro.salidaAlmuerzo && !registro.regresoAlmuerzo) {
      throw new Error("Primero debes marcar el regreso del almuerzo.");
    }

    const draft = { ...registro, salidaFinal: now.toISOString() };
    const totals = getTotals(calculateMinutes(draft, now, false));
    updatedRegistro = await updateRegistro(registro, {
      [HORARIOS_REGISTROS_FIELDS.salidaFinal]: now.toISOString(),
      [HORARIOS_REGISTROS_FIELDS.estadoDia]: "Finalizado",
      [HORARIOS_REGISTROS_FIELDS.ipSalida]: meta.ip,
      [HORARIOS_REGISTROS_FIELDS.userAgent]: meta.userAgent,
      ...mapTotalsToRegistroFields(totals)
    });
    estadoResultante = "Finalizado";
  } else {
    throw new Error("Tipo de marcación no permitido.");
  }

  await createMarcacion(user, empleadoRecordId, tipo, updatedRegistro.id, now, meta, estadoResultante);
  const marcaciones = await listMarcacionesByUserAndDate(user.userId, fecha);

  return buildEstado(updatedRegistro, marcaciones, fecha, now);
}

export async function listHorariosRegistrosByDate(fecha = getLocalDateKey(new Date())) {
  const query = new URLSearchParams({
    filterByFormula: `{${HORARIOS_REGISTROS_FIELDS.fecha}} = '${escapeFormulaString(fecha)}'`,
    "sort[0][field]": HORARIOS_REGISTROS_FIELDS.empleado,
    "sort[0][direction]": "asc"
  });
  const data = await airtableRequest<AirtableListResponse<HorarioRegistroFields>>(`${getTableUrl(REGISTROS_TABLE)}?${query.toString()}`);

  return {
    fecha,
    registros: data.records.map(mapRegistro)
  };
}

function buildRegistrosSemanaFormula(fechaInicio: string, fechaFin: string) {
  const fechaField = HORARIOS_REGISTROS_FIELDS.fecha;

  return `AND(OR({${HORARIOS_REGISTROS_FIELDS.estadoDia}} = 'Finalizado', {${HORARIOS_REGISTROS_FIELDS.estadoDia}} = 'Revisado'), DATETIME_FORMAT({${fechaField}}, 'YYYY-MM-DD') >= '${escapeFormulaString(fechaInicio)}', DATETIME_FORMAT({${fechaField}}, 'YYYY-MM-DD') <= '${escapeFormulaString(fechaFin)}')`;
}

function getEmpleadoSummaryKey(registro: HorarioRegistro) {
  return registro.empleadoRecordId || registro.usuarioId || registro.correo || registro.empleado;
}

function createEmptyEmpleadoResumen(registro: HorarioRegistro): HorarioAdminEmpleadoResumen {
  return {
    empleadoKey: getEmpleadoSummaryKey(registro),
    empleado: registro.empleado,
    empleadoRecordId: registro.empleadoRecordId,
    usuarioId: registro.usuarioId,
    correo: registro.correo,
    minutosTrabajados: 0,
    horasTrabajadas: 0,
    totalGanado: 0,
    totalPagado: 0,
    saldoPendiente: 0,
    registrosCount: 0
  };
}

async function listRegistrosSemana(fechaInicio: string, fechaFin: string) {
  const query = new URLSearchParams({
    filterByFormula: buildRegistrosSemanaFormula(fechaInicio, fechaFin),
    "sort[0][field]": HORARIOS_REGISTROS_FIELDS.empleado,
    "sort[0][direction]": "asc",
    "sort[1][field]": HORARIOS_REGISTROS_FIELDS.fecha,
    "sort[1][direction]": "asc"
  });
  const records = await listAllAirtableRecords<HorarioRegistroFields>(REGISTROS_TABLE, query);

  return records.map(mapRegistro);
}

async function listPagosActivos() {
  const query = new URLSearchParams({
    filterByFormula: `OR({${HORARIOS_PAGOS_FIELDS.estadoPago}} = BLANK(), {${HORARIOS_PAGOS_FIELDS.estadoPago}} != 'Anulado')`
  });

  return listAllAirtableRecords<HorarioPagoFields>(PAGOS_TABLE, query);
}

function buildRegistrosFechaRangeFormula(fechaInicio: string, fechaFin: string) {
  const fechaField = HORARIOS_REGISTROS_FIELDS.fecha;

  return `AND(DATETIME_FORMAT({${fechaField}}, 'YYYY-MM-DD') >= '${escapeFormulaString(fechaInicio)}', DATETIME_FORMAT({${fechaField}}, 'YYYY-MM-DD') <= '${escapeFormulaString(fechaFin)}')`;
}

function registroBelongsToUser(registro: HorarioRegistro, user: SessionUser, empleadoRecordId: string) {
  const email = user.email.trim().toLowerCase();

  return (
    registro.empleadoRecordId === empleadoRecordId ||
    Boolean(registro.usuarioId && registro.usuarioId === user.userId) ||
    Boolean(email && registro.correo.trim().toLowerCase() === email)
  );
}

async function listRegistrosEmpleadoByDateRange(user: SessionUser, fechaInicio: string, fechaFin: string) {
  const empleadoRecordId = await getEmpleadoRecordId(user);
  const query = new URLSearchParams({
    filterByFormula: buildRegistrosFechaRangeFormula(fechaInicio, fechaFin),
    "sort[0][field]": HORARIOS_REGISTROS_FIELDS.fecha,
    "sort[0][direction]": "desc"
  });
  const records = await listAllAirtableRecords<HorarioRegistroFields>(REGISTROS_TABLE, query);

  return records
    .map(mapRegistro)
    .filter((registro) => registroBelongsToUser(registro, user, empleadoRecordId));
}

function getRegistroResumenTotals(registro: HorarioRegistro, now: Date) {
  const todayKey = getLocalDateKey(now);

  if (registro.fecha === todayKey && registro.estadoDia !== "Finalizado" && registro.estadoDia !== "Revisado") {
    const liveTotals = getTotals(calculateMinutes(registro, now, true));

    return {
      minutosTrabajados: liveTotals.minutosTrabajados,
      totalEstimadoDia: liveTotals.totalEstimadoDia
    };
  }

  return {
    minutosTrabajados: registro.minutosTrabajados,
    totalEstimadoDia: registro.totalEstimadoDia
  };
}

function summarizeEmployeeRegistros(registros: HorarioRegistro[], now: Date): HorarioEmpleadoResumen["hoy"] {
  const totals = registros.reduce(
    (summary, registro) => {
      const registroTotals = getRegistroResumenTotals(registro, now);

      summary.minutosTrabajados += registroTotals.minutosTrabajados;
      summary.totalEstimado += registroTotals.totalEstimadoDia;

      return summary;
    },
    {
      minutosTrabajados: 0,
      totalEstimado: 0
    }
  );

  return {
    minutosTrabajados: totals.minutosTrabajados,
    horasTrabajadas: roundHours(totals.minutosTrabajados),
    totalEstimado: roundMoney(totals.totalEstimado)
  };
}

export async function fetchMisJornadas(user: SessionUser) {
  const { fechaInicio, fechaFin } = getCurrentMonthRange();

  return listRegistrosEmpleadoByDateRange(user, fechaInicio, fechaFin);
}

export async function fetchMisPagos(user: SessionUser) {
  const empleadoRecordId = await getEmpleadoRecordId(user);
  const records = await listPagosActivos();

  return records
    .map(mapPago)
    .filter((pago) => pago.empleadoRecordId === empleadoRecordId && pago.estadoPago !== "Anulado")
    .sort((first, second) => second.fechaPago.localeCompare(first.fechaPago));
}

export async function fetchMiResumenHorarios(user: SessionUser): Promise<HorarioEmpleadoResumen> {
  const now = new Date();
  const todayKey = getLocalDateKey(now);
  const weekRange = getCurrentWeekRange(now);
  const monthRange = getCurrentMonthRange(now);
  const fechaInicioConsulta = weekRange.fechaInicio < monthRange.fechaInicio ? weekRange.fechaInicio : monthRange.fechaInicio;
  const registros = await listRegistrosEmpleadoByDateRange(user, fechaInicioConsulta, monthRange.fechaFin);
  const registrosHoy = registros.filter((registro) => registro.fecha === todayKey);
  const registrosSemana = registros.filter((registro) => registro.fecha >= weekRange.fechaInicio && registro.fecha <= weekRange.fechaFin);
  const registrosMes = registros.filter((registro) => registro.fecha >= monthRange.fechaInicio && registro.fecha <= monthRange.fechaFin);

  return {
    hoy: summarizeEmployeeRegistros(registrosHoy, now),
    semana: summarizeEmployeeRegistros(registrosSemana, now),
    mes: summarizeEmployeeRegistros(registrosMes, now),
    periodoJornadas: monthRange
  };
}

export async function fetchMiVistaHorarios(user: SessionUser): Promise<HorarioEmpleadoVista> {
  const [resumen, jornadas, pagos] = await Promise.all([
    fetchMiResumenHorarios(user),
    fetchMisJornadas(user),
    fetchMisPagos(user)
  ]);

  return {
    resumen,
    jornadas,
    pagos
  };
}

function getPagoEmpleadoRecordId(record: AirtableRecord<HorarioPagoFields>) {
  return getLinkedRecordId(record.fields[HORARIOS_PAGOS_FIELDS.empleado]);
}

export async function fetchHorariosAdminResumen(): Promise<HorarioAdminResumen> {
  const { fechaInicio, fechaFin } = getCurrentWeekRange();
  const [registros, pagos] = await Promise.all([
    listRegistrosSemana(fechaInicio, fechaFin),
    listPagosActivos()
  ]);
  const empleadosMap = new Map<string, HorarioAdminEmpleadoResumen>();

  registros.forEach((registro) => {
    const key = getEmpleadoSummaryKey(registro);
    const empleadoResumen = empleadosMap.get(key) || createEmptyEmpleadoResumen(registro);

    empleadoResumen.minutosTrabajados += registro.minutosTrabajados;
    empleadoResumen.horasTrabajadas += registro.horasTrabajadas;
    empleadoResumen.totalGanado += registro.totalEstimadoDia;
    empleadoResumen.registrosCount += 1;
    empleadosMap.set(key, empleadoResumen);
  });

  pagos.forEach((pago) => {
    const empleadoRecordId = getPagoEmpleadoRecordId(pago);

    if (!empleadoRecordId) {
      return;
    }

    const empleadoResumen = empleadosMap.get(empleadoRecordId);

    if (!empleadoResumen) {
      return;
    }

    empleadoResumen.totalPagado += pago.fields[HORARIOS_PAGOS_FIELDS.montoPagado] || 0;
  });

  const empleados = Array.from(empleadosMap.values())
    .map((empleado) => ({
      ...empleado,
      horasTrabajadas: roundHours(empleado.minutosTrabajados),
      totalGanado: roundMoney(empleado.totalGanado),
      totalPagado: roundMoney(empleado.totalPagado),
      saldoPendiente: roundMoney(empleado.totalGanado - empleado.totalPagado)
    }))
    .sort((first, second) => second.saldoPendiente - first.saldoPendiente || first.empleado.localeCompare(second.empleado));

  const totalMinutos = empleados.reduce((total, empleado) => total + empleado.minutosTrabajados, 0);
  const totalGanado = empleados.reduce((total, empleado) => total + empleado.totalGanado, 0);
  const totalPagado = empleados.reduce((total, empleado) => total + empleado.totalPagado, 0);

  return {
    periodo: {
      fechaInicio,
      fechaFin
    },
    totales: {
      minutosTrabajados: totalMinutos,
      horasTrabajadas: roundHours(totalMinutos),
      totalGanado: roundMoney(totalGanado),
      totalPagado: roundMoney(totalPagado),
      saldoPendiente: roundMoney(totalGanado - totalPagado)
    },
    empleados
  };
}

function buildRegistrosRangoFormula(fechaInicio: string, fechaFin: string) {
  const fechaField = HORARIOS_REGISTROS_FIELDS.fecha;

  return `AND(OR({${HORARIOS_REGISTROS_FIELDS.estadoDia}} = 'Finalizado', {${HORARIOS_REGISTROS_FIELDS.estadoDia}} = 'Revisado'), DATETIME_FORMAT({${fechaField}}, 'YYYY-MM-DD') >= '${escapeFormulaString(fechaInicio)}', DATETIME_FORMAT({${fechaField}}, 'YYYY-MM-DD') <= '${escapeFormulaString(fechaFin)}')`;
}

function validateDateKey(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} debe tener formato YYYY-MM-DD.`);
  }
}

function assertAirtableRecordId(value: string, label: string) {
  if (!isAirtableRecordId(value)) {
    throw new Error(`${label} no es un record ID válido de Airtable.`);
  }
}

function calculatePeriodoTotals(registros: HorarioRegistro[], pagos: HorarioPago[]) {
  const totalMinutos = registros.reduce((total, registro) => total + registro.minutosTrabajados, 0);
  const totalGanado = registros.reduce((total, registro) => total + registro.totalEstimadoDia, 0);
  const totalPagado = pagos.reduce((total, pago) => {
    if (pago.estadoPago === "Anulado") {
      return total;
    }

    return total + pago.montoPagado;
  }, 0);

  return {
    totalMinutos,
    totalHoras: roundHours(totalMinutos),
    totalGanado: roundMoney(totalGanado),
    totalPagado: roundMoney(totalPagado),
    saldoPendiente: roundMoney(totalGanado - totalPagado)
  };
}

function getEstadoPeriodoFromTotals(totalPagado: number, saldoPendiente: number): EstadoPeriodoPago {
  if (totalPagado <= 0) {
    return "Abierto";
  }

  if (saldoPendiente <= 0) {
    return "Pagado";
  }

  return "Parcialmente pagado";
}

async function listRegistrosByIds(recordIds: string[]) {
  if (!recordIds.length) {
    return [];
  }

  const filterByFormula = `OR(${recordIds.map((id) => `RECORD_ID() = '${escapeFormulaString(id)}'`).join(", ")})`;
  const query = new URLSearchParams({
    filterByFormula,
    "sort[0][field]": HORARIOS_REGISTROS_FIELDS.fecha,
    "sort[0][direction]": "asc"
  });
  const records = await listAllAirtableRecords<HorarioRegistroFields>(REGISTROS_TABLE, query);

  return records.map(mapRegistro);
}

async function listRegistrosPeriodoCandidate(fechaInicio: string, fechaFin: string, empleadoId: string) {
  const query = new URLSearchParams({
    filterByFormula: buildRegistrosRangoFormula(fechaInicio, fechaFin),
    "sort[0][field]": HORARIOS_REGISTROS_FIELDS.fecha,
    "sort[0][direction]": "asc"
  });
  const records = await listAllAirtableRecords<HorarioRegistroFields>(REGISTROS_TABLE, query);

  return records.map(mapRegistro).filter((registro) => registro.empleadoRecordId === empleadoId);
}

async function findPeriodoDuplicado(empleadoId: string, fechaInicio: string, fechaFin: string) {
  const query = new URLSearchParams({
    filterByFormula: `AND(DATETIME_FORMAT({${HORARIOS_PERIODOS_FIELDS.fechaInicio}}, 'YYYY-MM-DD') = '${escapeFormulaString(fechaInicio)}', DATETIME_FORMAT({${HORARIOS_PERIODOS_FIELDS.fechaFin}}, 'YYYY-MM-DD') = '${escapeFormulaString(fechaFin)}')`
  });
  const records = await listAllAirtableRecords<HorarioPeriodoPagoFields>(PERIODOS_TABLE, query);

  return records.map(mapPeriodo).find((periodo) => periodo.empleadoRecordId === empleadoId) || null;
}

async function updatePeriodoEstado(periodoId: string, estadoPeriodo: EstadoPeriodoPago) {
  const record = await airtableRequest<AirtableRecord<HorarioPeriodoPagoFields>>(getTableUrl(PERIODOS_TABLE, periodoId), {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [HORARIOS_PERIODOS_FIELDS.estadoPeriodo]: estadoPeriodo
      }
    })
  });

  return mapPeriodo(record);
}

async function hydratePeriodo(periodo: HorarioPeriodoPago): Promise<HorarioPeriodoPagoDetalle> {
  const [registros, pagos] = await Promise.all([
    listRegistrosByIds(periodo.registroIds),
    fetchPagosByPeriodo(periodo.id)
  ]);
  const totals = calculatePeriodoTotals(registros, pagos);
  const estadoCalculado = periodo.estadoPeriodo === "Anulado" ? periodo.estadoPeriodo : getEstadoPeriodoFromTotals(totals.totalPagado, totals.saldoPendiente);

  return {
    ...periodo,
    estadoPeriodo: estadoCalculado,
    totalMinutos: totals.totalMinutos,
    totalHoras: totals.totalHoras,
    totalGanado: totals.totalGanado,
    totalPagado: totals.totalPagado,
    saldoPendiente: totals.saldoPendiente,
    registros,
    pagos
  };
}

export async function fetchPeriodosPago() {
  const query = new URLSearchParams({
    "sort[0][field]": HORARIOS_PERIODOS_FIELDS.fechaInicio,
    "sort[0][direction]": "desc",
    "sort[1][field]": HORARIOS_PERIODOS_FIELDS.empleado,
    "sort[1][direction]": "asc"
  });
  const records = await listAllAirtableRecords<HorarioPeriodoPagoFields>(PERIODOS_TABLE, query);
  const periodos = await Promise.all(records.map((record) => hydratePeriodo(mapPeriodo(record))));

  return periodos;
}

export async function fetchPeriodoPagoById(id: string): Promise<HorarioPeriodoPagoDetalle | null> {
  if (!isAirtableRecordId(id)) {
    return null;
  }

  const record = await airtableRequest<AirtableRecord<HorarioPeriodoPagoFields>>(getTableUrl(PERIODOS_TABLE, id));

  return hydratePeriodo(mapPeriodo(record));
}

export async function fetchHorariosEmpleadosParaPeriodo(): Promise<HorarioEmpleadoPeriodoOption[]> {
  const users = await listPortalUsers();

  return users
    .filter((user) => {
      if (!user.email.trim() || !user.activo) {
        return false;
      }

      return (
        canAccessApp({
          userId: user.id,
          nombre: user.nombre,
          email: user.email,
          rol: user.rol,
          appsPermitidas: user.appsPermitidas
        }, "Horarios") ||
        isAdministratorRole(user.rol) ||
        isEligibleHorarioRole(user.rol)
      );
    })
    .map((user) => ({
      empleadoRecordId: user.id,
      empleado: user.nombre || user.email,
      usuarioId: user.id,
      correo: user.email
    }))
    .sort((first, second) => first.empleado.localeCompare(second.empleado));
}

export async function crearPeriodoPago(input: CrearPeriodoPagoInput): Promise<HorarioPeriodoPagoDetalle> {
  const empleadoId = input.empleadoId.trim();
  const fechaInicio = input.fechaInicio.trim();
  const fechaFin = input.fechaFin.trim();

  assertAirtableRecordId(empleadoId, "Empleado");
  validateDateKey(fechaInicio, "Fecha inicio");
  validateDateKey(fechaFin, "Fecha fin");

  if (fechaFin < fechaInicio) {
    throw new Error("La fecha fin no puede ser anterior a la fecha inicio.");
  }

  const existing = await findPeriodoDuplicado(empleadoId, fechaInicio, fechaFin);

  if (existing) {
    return hydratePeriodo(existing);
  }

  const registros = await listRegistrosPeriodoCandidate(fechaInicio, fechaFin, empleadoId);

  if (!registros.length) {
    throw new Error("No hay jornadas finalizadas o revisadas para este empleado en el rango seleccionado.");
  }

  const firstRegistro = registros[0];
  const record = await airtableRequest<AirtableRecord<HorarioPeriodoPagoFields>>(getTableUrl(PERIODOS_TABLE), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        [HORARIOS_PERIODOS_FIELDS.empleado]: [empleadoId],
        [HORARIOS_PERIODOS_FIELDS.usuarioId]: firstRegistro.usuarioId,
        [HORARIOS_PERIODOS_FIELDS.correo]: firstRegistro.correo,
        [HORARIOS_PERIODOS_FIELDS.fechaInicio]: fechaInicio,
        [HORARIOS_PERIODOS_FIELDS.fechaFin]: fechaFin,
        [HORARIOS_PERIODOS_FIELDS.estadoPeriodo]: "Abierto",
        [HORARIOS_PERIODOS_FIELDS.registrosPeriodo]: registros.map((registro) => registro.id)
      }
    })
  });

  return hydratePeriodo(mapPeriodo(record));
}

export async function fetchPagosByPeriodo(periodoId: string) {
  if (!isAirtableRecordId(periodoId)) {
    return [];
  }

  const records = await listAllAirtableRecords<HorarioPagoFields>(PAGOS_TABLE, new URLSearchParams({
    "sort[0][field]": HORARIOS_PAGOS_FIELDS.fechaPago,
    "sort[0][direction]": "desc"
  }));

  return records
    .map(mapPago)
    .filter((pago) => pago.periodoPagoId === periodoId);
}

export async function registrarPagoHorario(input: RegistrarPagoHorarioInput): Promise<{ pago: HorarioPago; periodo: HorarioPeriodoPagoDetalle; warning?: string | null }> {
  const periodo = await fetchPeriodoPagoById(input.periodoId);

  if (!periodo) {
    throw new Error("No se encontró el periodo de pago.");
  }

  validateDateKey(input.fechaPago, "Fecha de pago");

  if (!Number.isFinite(input.montoPagado) || input.montoPagado <= 0) {
    throw new Error("El monto pagado debe ser mayor a 0.");
  }

  const metodoPago = normalizeHorarioMetodoPago(input.metodoPago);

  const fields: HorarioPagoFields = {
    [HORARIOS_PAGOS_FIELDS.empleado]: periodo.empleadoRecordId ? [periodo.empleadoRecordId] : undefined,
    [HORARIOS_PAGOS_FIELDS.periodoPago]: [periodo.id],
    [HORARIOS_PAGOS_FIELDS.fechaPago]: input.fechaPago,
    [HORARIOS_PAGOS_FIELDS.montoPagado]: input.montoPagado,
    [HORARIOS_PAGOS_FIELDS.metodoPago]: metodoPago,
    [HORARIOS_PAGOS_FIELDS.estadoPago]: "Registrado"
  };

  if (input.numeroTransaccion?.trim()) {
    fields[HORARIOS_PAGOS_FIELDS.numeroTransaccion] = input.numeroTransaccion.trim();
  }

  if (input.bancoCuentaOrigen?.trim()) {
    fields[HORARIOS_PAGOS_FIELDS.bancoCuentaOrigen] = input.bancoCuentaOrigen.trim();
  }

  if (input.observacion?.trim()) {
    fields[HORARIOS_PAGOS_FIELDS.observacion] = input.observacion.trim();
  }

  fields[HORARIOS_PAGOS_FIELDS.registradoPor] = normalizeRegistradoPor(input.registradoPor);

  const created = await airtableRequest<AirtableRecord<HorarioPagoFields>>(getTableUrl(PAGOS_TABLE), {
    method: "POST",
    body: JSON.stringify({ fields })
  });
  let warning: string | null = null;

  if (input.comprobanteArchivo?.fileBase64) {
    try {
      await uploadAttachmentToRecord({
        recordId: created.id,
        attachmentFieldIdOrName: HORARIOS_PAGOS_FIELDS.comprobante,
        filename: input.comprobanteArchivo.filename,
        contentType: input.comprobanteArchivo.contentType,
        fileBase64: input.comprobanteArchivo.fileBase64
      });
    } catch (error) {
      console.error("No se pudo subir el comprobante del pago de horario:", error);
      warning = "El pago se guardó, pero no se pudo subir el comprobante.";
    }
  }

  const pagos = await fetchPagosByPeriodo(periodo.id);
  const totals = calculatePeriodoTotals(periodo.registros, pagos);
  const estadoPeriodo = periodo.estadoPeriodo === "Anulado" ? "Anulado" : getEstadoPeriodoFromTotals(totals.totalPagado, totals.saldoPendiente);

  if (estadoPeriodo !== periodo.estadoPeriodo) {
    await updatePeriodoEstado(periodo.id, estadoPeriodo);
  }

  const updatedPeriodo = await fetchPeriodoPagoById(periodo.id);
  const freshPago = await airtableRequest<AirtableRecord<HorarioPagoFields>>(getTableUrl(PAGOS_TABLE, created.id));

  if (!updatedPeriodo) {
    throw new Error("El pago se guardó, pero no se pudo refrescar el periodo.");
  }

  return {
    pago: mapPago(freshPago),
    periodo: updatedPeriodo,
    warning
  };
}

export function isTipoMarcacion(value: unknown): value is TipoMarcacion {
  return (
    value === "entrada" ||
    value === "salida_almuerzo" ||
    value === "regreso_almuerzo" ||
    value === "salida_final" ||
    value === "ajuste_admin"
  );
}
