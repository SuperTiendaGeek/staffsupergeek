import "server-only";

import { put } from "@vercel/blob";
import { findUserByEmail, listPortalUsers } from "@/lib/airtable";
import { canAccessApp, isAdministratorRole } from "@/lib/apps";
import { crearNotificacion } from "@/lib/notificaciones/airtable";
import type { SessionUser } from "@/lib/session";
import { generateRolPagoPdf } from "@/lib/horarios/rol-pago-pdf";
import type { PortalUser } from "@/types/admin-users";
import type {
  CorregirJornadaAdminInput,
  EstadoDia,
  EstadoPeriodoPago,
  HorarioAdminEmpleadoResumen,
  HorarioAdminResumen,
  HorarioEmpleadoResumen,
  HorarioEmpleadoPeriodoOption,
  HorarioEmpleadoRolPago,
  HorarioEmpleadoResumenPagos,
  HorarioEmpleadoVista,
  HorarioEstado,
  HorarioAjuste,
  HorarioMarcacion,
  HorarioMetodoPago,
  HorarioPago,
  HorarioPagoComprobante,
  HorarioPeriodoPago,
  HorarioPeriodoPagoDetalle,
  HorarioAdminEmpleadoDetalle,
  HorarioImpactoAjuste,
  HorarioRegistro,
  HorarioTipoAjuste,
  HorarioTipoCalculoAjuste,
  TipoMarcacion
} from "@/types/horarios";
import { HORARIO_METODOS_PAGO, HORARIO_TIPOS_AJUSTE } from "@/types/horarios";

const SUELDO_BASE = 482;
const HORAS_BASE_MES = 160;
const VALOR_HORA = SUELDO_BASE / HORAS_BASE_MES;
const MONEY_TOLERANCE = 0.01;
const HORARIOS_TIME_ZONE = process.env.HORARIOS_TIME_ZONE?.trim() || "America/Guayaquil";
const REGISTROS_TABLE = process.env.AIRTABLE_HORARIOS_REGISTROS_TABLE?.trim() || "Horarios Registros";
const MARCACIONES_TABLE = process.env.AIRTABLE_HORARIOS_MARCACIONES_TABLE?.trim() || "Horarios Marcaciones";
const PAGOS_TABLE = process.env.AIRTABLE_HORARIOS_PAGOS_TABLE?.trim() || "Horarios Pagos";
const PERIODOS_TABLE = process.env.AIRTABLE_HORARIOS_PERIODOS_TABLE?.trim() || "Horarios Periodos de Pago";
const AJUSTES_TABLE = process.env.AIRTABLE_HORARIOS_AJUSTES_TABLE?.trim() || "Horarios Ajustes";

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
  ajustes: "Ajustes",
  totalMinutos: "Total Minutos",
  totalHoras: "Total Horas",
  totalGanado: "Total Ganado",
  totalAjustes: "Total Ajustes",
  totalNeto: "Total Neto",
  pagos: "Pagos",
  totalPagado: "Total Pagado",
  saldoPendiente: "Saldo Pendiente",
  saldoPendienteNeto: "Saldo Pendiente Neto",
  rolPagoPdf: "Rol de Pago PDF",
  rolPagoBlobUrl: "Rol de Pago Blob URL",
  rolPagoBlobPathname: "Rol de Pago Blob Pathname",
  rolGenerado: "Rol generado",
  fechaGeneracionRol: "Fecha generación rol",
  generadoPor: "Generado por",
  observacionRol: "Observación rol",
  estadoRol: "Estado rol"
} as const;

const HORARIOS_AJUSTES_FIELDS = {
  empleado: "Empleado",
  registroDelDia: "Registro del Día",
  periodoPago: "Periodo de Pago",
  tipoAjuste: "Tipo de Ajuste",
  minutosAjustados: "Minutos Ajustados",
  montoAjustado: "Monto Ajustado",
  motivo: "Motivo",
  aprobadoPor: "Aprobado por",
  fechaAjuste: "Fecha de Ajuste",
  estado: "Estado",
  horasAjustadas: "Horas Ajustadas",
  esDescuento: "Es Descuento"
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
  Entrada?: string | null;
  "Salida Almuerzo"?: string | null;
  "Regreso Almuerzo"?: string | null;
  "Salida Final"?: string | null;
  "Minutos Trabajados"?: number;
  "Horas Trabajadas"?: number;
  "Sueldo Base"?: number;
  "Horas Base Mes"?: number;
  "Valor Hora"?: number;
  "Total Estimado Día"?: number;
  Observaciones?: string | null;
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
  Ajustes?: string[];
  "Total Minutos"?: number;
  "Total Horas"?: number;
  "Total Ganado"?: number;
  "Total Ajustes"?: number;
  "Total Neto"?: number;
  Pagos?: string[];
  "Total Pagado"?: number;
  "Saldo Pendiente"?: number;
  "Saldo Pendiente Neto"?: number;
  "Rol de Pago PDF"?: unknown;
  "Rol de Pago Blob URL"?: string;
  "Rol de Pago Blob Pathname"?: string;
  "Rol generado"?: boolean;
  "Fecha generación rol"?: string;
  "Generado por"?: string;
  "Observación rol"?: string;
  "Estado rol"?: string;
};

type HorarioAjusteFields = {
  Empleado?: string | string[];
  "Registro del Día"?: string | string[];
  "Periodo de Pago"?: string | string[];
  "Tipo de Ajuste"?: string;
  "Minutos Ajustados"?: number;
  "Monto Ajustado"?: number;
  Motivo?: string;
  "Aprobado por"?: string;
  "Fecha de Ajuste"?: string;
  Estado?: string;
  "Horas Ajustadas"?: number;
  "Es Descuento"?: boolean | string;
};

type EstadoResultanteMarcacion = Exclude<EstadoDia, "Pendiente">;

type CrearPeriodoPagoInput = {
  empleadoId: string;
  fechaInicio: string;
  fechaFin: string;
};

type CerrarPeriodoHastaFechaInput = {
  periodoId: string;
  fechaCorte: string;
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

type AnularPagoHorarioInput = {
  periodoId: string;
  pagoId: string;
  motivo: string;
  adminUser: SessionUser;
};

type RegistrarAmonestacionHorarioInput = {
  periodoId: string;
  horasDescontadas: number;
  motivo: string;
  registroId?: string | null;
  adminUser: SessionUser;
};

type RegistrarAjusteHorarioInput = {
  periodoId: string;
  tipoAjuste: HorarioTipoAjuste | string;
  tipoCalculo: HorarioTipoCalculoAjuste;
  horas?: number | null;
  monto?: number | null;
  impacto?: HorarioImpactoAjuste | null;
  motivo: string;
  registroId?: string | null;
  adminUser: SessionUser;
};

type GenerarRolPagoInput = {
  periodoId: string;
  adminUser: SessionUser;
  observacionRol?: string | null;
};

type CorregirJornadaAdminOptions = {
  adminUser: SessionUser;
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function airtableRequest<T>(url: string, init?: RequestInit) {
  let response: Response | null = null;
  const retryableStatuses = new Set([429, 502, 503, 504]);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(url, {
      ...init,
      headers: {
        ...getAirtableHeaders(),
        ...init?.headers
      },
      cache: "no-store"
    });

    if (!retryableStatuses.has(response.status) || attempt === 2) {
      break;
    }

    await wait(450 * (attempt + 1));
  }

  if (!response) {
    throw new Error("Airtable horarios request failed without response");
  }

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

function getLast6MonthsRange(date = new Date()) {
  const current = getCurrentMonthRange(date);
  const startDate = new Date(`${current.fechaInicio}T12:00:00.000Z`);
  startDate.setUTCMonth(startDate.getUTCMonth() - 5);
  return {
    fechaInicio: startDate.toISOString().slice(0, 10),
    fechaFin: current.fechaFin
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

function calculateClosedJornadaMinutes(registro: Pick<HorarioRegistro, "entrada" | "salidaAlmuerzo" | "regresoAlmuerzo" | "salidaFinal">) {
  return calculateMinutes(registro, new Date(), false);
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

function getTotalsForValorHora(minutes: number, valorHora: number) {
  const horasTrabajadas = roundHours(minutes);
  const safeValorHora = Number.isFinite(valorHora) && valorHora > 0 ? valorHora : VALOR_HORA;

  return {
    minutosTrabajados: minutes,
    horasTrabajadas,
    sueldoBase: SUELDO_BASE,
    horasBaseMes: HORAS_BASE_MES,
    valorHora: safeValorHora,
    totalEstimadoDia: roundMoney(horasTrabajadas * safeValorHora)
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

function normalizeEmail(value?: string) {
  return value?.trim().toLowerCase() || "";
}

function buildPortalUserMaps(users: PortalUser[]) {
  return {
    byId: new Map<string, PortalUser>(users.map((user) => [user.id, user])),
    byEmail: new Map<string, PortalUser>(
      users
        .map((user): [string, PortalUser] => [normalizeEmail(user.email), user])
        .filter(([email]) => Boolean(email))
    )
  };
}

function findPortalUserForEmpleado(
  maps: ReturnType<typeof buildPortalUserMaps>,
  empleadoRecordId?: string,
  correo?: string
) {
  return (empleadoRecordId ? maps.byId.get(empleadoRecordId) : undefined) || maps.byEmail.get(normalizeEmail(correo));
}

function applyPortalUserToRegistro(registro: HorarioRegistro, user?: PortalUser): HorarioRegistro {
  if (!user) {
    return registro;
  }

  return {
    ...registro,
    empleado: user.nombre || user.email || registro.empleado,
    empleadoCedula: user.cedula,
    empleadoRol: user.rol,
    correo: user.email || registro.correo
  };
}

function applyPortalUserToPeriodo(periodo: HorarioPeriodoPago, user?: PortalUser): HorarioPeriodoPago {
  if (!user) {
    return periodo;
  }

  return {
    ...periodo,
    empleado: user.nombre || user.email || periodo.empleado,
    empleadoCedula: user.cedula,
    empleadoRol: user.rol,
    correo: user.email || periodo.correo
  };
}

function normalizeRegistradoPor(value?: string | null) {
  const textValue = typeof value === "string" ? value.trim() : "";

  return textValue || "Administrador";
}

function formatAuditDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HORARIOS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";

  return `${getPart("day")}/${getPart("month")}/${getPart("year")} ${getPart("hour")}:${getPart("minute")}`;
}

function slugifyFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function buildRolPagoFilename(periodo: HorarioPeriodoPagoDetalle) {
  const empleado = slugifyFilePart(periodo.empleado || periodo.correo || "empleado") || "empleado";

  return `rol-pago-${empleado}-${periodo.fechaInicio}-${periodo.fechaFin}.pdf`;
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

function normalizeTipoAjuste(value: string): HorarioTipoAjuste {
  const textValue = value.trim();

  if ((HORARIO_TIPOS_AJUSTE as readonly string[]).includes(textValue)) {
    return textValue as HorarioTipoAjuste;
  }

  throw new Error("Tipo de ajuste no válido.");
}

function getMontoAjusteSign(tipoAjuste: HorarioTipoAjuste, impacto?: HorarioImpactoAjuste | null) {
  if (tipoAjuste === "Compra empleado" || tipoAjuste === "Descuento") {
    return -1;
  }

  if (tipoAjuste === "Bono") {
    return 1;
  }

  if (impacto === "suma") {
    return 1;
  }

  if (impacto === "resta") {
    return -1;
  }

  throw new Error("Selecciona si el ajuste por monto suma o resta al rol.");
}

function requiresMontoImpacto(tipoAjuste: HorarioTipoAjuste) {
  return tipoAjuste === "Corrección de hora" || tipoAjuste === "Regularización" || tipoAjuste === "Otro";
}

function supportsHorasAjuste(tipoAjuste: HorarioTipoAjuste) {
  return tipoAjuste === "Descuento" || tipoAjuste === "Corrección de hora" || tipoAjuste === "Regularización" || tipoAjuste === "Otro";
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
    entrada: fields[HORARIOS_REGISTROS_FIELDS.entrada] ?? undefined,
    salidaAlmuerzo: fields[HORARIOS_REGISTROS_FIELDS.salidaAlmuerzo] ?? undefined,
    regresoAlmuerzo: fields[HORARIOS_REGISTROS_FIELDS.regresoAlmuerzo] ?? undefined,
    salidaFinal: fields[HORARIOS_REGISTROS_FIELDS.salidaFinal] ?? undefined,
    minutosTrabajados: fields[HORARIOS_REGISTROS_FIELDS.minutosTrabajados] || 0,
    horasTrabajadas: fields[HORARIOS_REGISTROS_FIELDS.horasTrabajadas] || 0,
    sueldoBase: fields[HORARIOS_REGISTROS_FIELDS.sueldoBase] || SUELDO_BASE,
    horasBaseMes: fields[HORARIOS_REGISTROS_FIELDS.horasBaseMes] || HORAS_BASE_MES,
    valorHora: fields[HORARIOS_REGISTROS_FIELDS.valorHora] || VALOR_HORA,
    totalEstimadoDia: fields[HORARIOS_REGISTROS_FIELDS.totalEstimadoDia] || 0,
    observaciones: fields[HORARIOS_REGISTROS_FIELDS.observaciones] ?? undefined
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

function mapAjuste(record: AirtableRecord<HorarioAjusteFields>): HorarioAjuste {
  const fields = record.fields;
  const minutosAjustados = fields[HORARIOS_AJUSTES_FIELDS.minutosAjustados] || 0;
  const horasAjustadas = fields[HORARIOS_AJUSTES_FIELDS.horasAjustadas] ?? roundHours(minutosAjustados);
  const montoAjustado = fields[HORARIOS_AJUSTES_FIELDS.montoAjustado] || 0;

  return {
    id: record.id,
    empleadoRecordId: getLinkedRecordId(fields[HORARIOS_AJUSTES_FIELDS.empleado]),
    registroDelDiaId: getLinkedRecordId(fields[HORARIOS_AJUSTES_FIELDS.registroDelDia]),
    periodoPagoId: getLinkedRecordId(fields[HORARIOS_AJUSTES_FIELDS.periodoPago]),
    tipoAjuste: fields[HORARIOS_AJUSTES_FIELDS.tipoAjuste] || "Descuento",
    minutosAjustados,
    horasAjustadas,
    montoAjustado,
    motivo: fields[HORARIOS_AJUSTES_FIELDS.motivo] || "",
    aprobadoPor: fields[HORARIOS_AJUSTES_FIELDS.aprobadoPor],
    fechaAjuste: fields[HORARIOS_AJUSTES_FIELDS.fechaAjuste] || "",
    estado: fields[HORARIOS_AJUSTES_FIELDS.estado] || "Aplicado",
    esDescuento: montoAjustado < 0 || minutosAjustados < 0
  };
}

function mapPeriodo(record: AirtableRecord<HorarioPeriodoPagoFields>): HorarioPeriodoPago {
  const fields = record.fields;
  const totalAjustes = fields[HORARIOS_PERIODOS_FIELDS.totalAjustes] || 0;
  const totalNeto = fields[HORARIOS_PERIODOS_FIELDS.totalNeto] ?? roundMoney((fields[HORARIOS_PERIODOS_FIELDS.totalGanado] || 0) + totalAjustes);
  const saldoPendienteNeto =
    fields[HORARIOS_PERIODOS_FIELDS.saldoPendienteNeto] ??
    roundMoney(totalNeto - (fields[HORARIOS_PERIODOS_FIELDS.totalPagado] || 0));

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
    ajusteIds: fields[HORARIOS_PERIODOS_FIELDS.ajustes] || [],
    totalMinutos: fields[HORARIOS_PERIODOS_FIELDS.totalMinutos] || 0,
    totalHoras: fields[HORARIOS_PERIODOS_FIELDS.totalHoras] || 0,
    totalGanado: fields[HORARIOS_PERIODOS_FIELDS.totalGanado] || 0,
    totalAjustes,
    totalNeto,
    totalPagado: fields[HORARIOS_PERIODOS_FIELDS.totalPagado] || 0,
    saldoPendiente: saldoPendienteNeto,
    saldoPendienteNeto,
    rolPagoPdf: parsePagoComprobantes(fields[HORARIOS_PERIODOS_FIELDS.rolPagoPdf]),
    rolPagoBlobUrl: fields[HORARIOS_PERIODOS_FIELDS.rolPagoBlobUrl],
    rolPagoBlobPathname: fields[HORARIOS_PERIODOS_FIELDS.rolPagoBlobPathname],
    rolGenerado: Boolean(fields[HORARIOS_PERIODOS_FIELDS.rolGenerado]),
    fechaGeneracionRol: fields[HORARIOS_PERIODOS_FIELDS.fechaGeneracionRol],
    generadoPor: fields[HORARIOS_PERIODOS_FIELDS.generadoPor],
    observacionRol: fields[HORARIOS_PERIODOS_FIELDS.observacionRol],
    estadoRol: fields[HORARIOS_PERIODOS_FIELDS.estadoRol] || "Pendiente"
  };
}

function attachPeriodoInfoToAjustes(ajustes: HorarioAjuste[], periodos: HorarioPeriodoPago[]) {
  const periodosById = new Map(periodos.map((periodo) => [periodo.id, periodo]));

  return ajustes.map((ajuste) => {
    const periodo = ajuste.periodoPagoId ? periodosById.get(ajuste.periodoPagoId) : undefined;

    if (!periodo) {
      return ajuste;
    }

    return {
      ...ajuste,
      periodoFechaInicio: periodo.fechaInicio,
      periodoFechaFin: periodo.fechaFin
    };
  });
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

async function createAdminAjusteMarcacion(
  registro: HorarioRegistro,
  now: Date,
  adminUser: SessionUser,
  estadoResultante: Extract<EstadoDia, "Finalizado" | "Revisado">
) {
  const empleadoRecordId = registro.empleadoRecordId;

  if (!empleadoRecordId) {
    throw new Error("La jornada no tiene un empleado vinculado válido.");
  }

  const record = await airtableRequest<AirtableRecord<HorarioMarcacionFields>>(getTableUrl(MARCACIONES_TABLE), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        [HORARIOS_MARCACIONES_FIELDS.empleado]: [empleadoRecordId],
        [HORARIOS_MARCACIONES_FIELDS.usuarioId]: registro.usuarioId,
        [HORARIOS_MARCACIONES_FIELDS.correo]: registro.correo,
        [HORARIOS_MARCACIONES_FIELDS.fechaHora]: now.toISOString(),
        [HORARIOS_MARCACIONES_FIELDS.tipoMarcacion]: "ajuste_admin",
        [HORARIOS_MARCACIONES_FIELDS.estadoResultante]: estadoResultante,
        [HORARIOS_MARCACIONES_FIELDS.registroDelDia]: [registro.id],
        [HORARIOS_MARCACIONES_FIELDS.origen]: "Ajuste administrador",
        [HORARIOS_MARCACIONES_FIELDS.observacion]: `Corrección administrativa realizada por ${adminUser.email || adminUser.nombre || "Administrador"}.`
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

export async function fetchJornadasIncompletasAdmin() {
  const query = new URLSearchParams({
    filterByFormula: `OR({${HORARIOS_REGISTROS_FIELDS.estadoDia}} = 'Trabajando', {${HORARIOS_REGISTROS_FIELDS.estadoDia}} = 'En almuerzo', {${HORARIOS_REGISTROS_FIELDS.estadoDia}} = 'Incompleto')`,
    "sort[0][field]": HORARIOS_REGISTROS_FIELDS.fecha,
    "sort[0][direction]": "desc",
    "sort[1][field]": HORARIOS_REGISTROS_FIELDS.empleado,
    "sort[1][direction]": "asc"
  });
  const records = await listAllAirtableRecords<HorarioRegistroFields>(REGISTROS_TABLE, query);

  return records.map(mapRegistro);
}

export async function fetchHorarioRegistroById(id: string) {
  if (!isAirtableRecordId(id)) {
    return null;
  }

  const record = await airtableRequest<AirtableRecord<HorarioRegistroFields>>(getTableUrl(REGISTROS_TABLE, id));

  return mapRegistro(record);
}

function assertValidCorrectionInput(input: CorregirJornadaAdminInput) {
  const entrada = toTimestamp(input.entrada);
  const salidaAlmuerzo = toTimestamp(input.salidaAlmuerzo);
  const regresoAlmuerzo = toTimestamp(input.regresoAlmuerzo);
  const salidaFinal = toTimestamp(input.salidaFinal);

  if (entrada === null || salidaFinal === null) {
    throw new Error("Entrada y salida final son obligatorias para cerrar una jornada corregida.");
  }

  if ((input.salidaAlmuerzo && !input.regresoAlmuerzo) || (!input.salidaAlmuerzo && input.regresoAlmuerzo)) {
    throw new Error("Si corriges almuerzo, debes registrar salida y regreso de almuerzo.");
  }

  if (salidaFinal <= entrada) {
    throw new Error("La salida final debe ser posterior a la entrada.");
  }

  if (salidaAlmuerzo !== null && regresoAlmuerzo !== null) {
    if (salidaAlmuerzo <= entrada) {
      throw new Error("La salida de almuerzo debe ser posterior a la entrada.");
    }

    if (regresoAlmuerzo <= salidaAlmuerzo) {
      throw new Error("El regreso de almuerzo debe ser posterior a la salida de almuerzo.");
    }

    if (salidaFinal <= regresoAlmuerzo) {
      throw new Error("La salida final debe ser posterior al regreso de almuerzo.");
    }
  }

  if (input.estadoDia !== "Finalizado" && input.estadoDia !== "Revisado") {
    throw new Error("El estado corregido debe ser Finalizado o Revisado.");
  }
}

export async function corregirJornadaAdmin(
  registroId: string,
  input: CorregirJornadaAdminInput,
  options: CorregirJornadaAdminOptions
) {
  assertValidCorrectionInput(input);

  const registro = await fetchHorarioRegistroById(registroId);

  if (!registro) {
    throw new Error("No se encontró la jornada.");
  }

  const draft: HorarioRegistro = {
    ...registro,
    entrada: input.entrada,
    salidaAlmuerzo: input.salidaAlmuerzo || undefined,
    regresoAlmuerzo: input.regresoAlmuerzo || undefined,
    salidaFinal: input.salidaFinal
  };
  const totals = getTotalsForValorHora(calculateClosedJornadaMinutes(draft), registro.valorHora);
  const updatedRegistro = await updateRegistro(registro, {
    [HORARIOS_REGISTROS_FIELDS.entrada]: input.entrada,
    [HORARIOS_REGISTROS_FIELDS.salidaAlmuerzo]: input.salidaAlmuerzo || null,
    [HORARIOS_REGISTROS_FIELDS.regresoAlmuerzo]: input.regresoAlmuerzo || null,
    [HORARIOS_REGISTROS_FIELDS.salidaFinal]: input.salidaFinal,
    [HORARIOS_REGISTROS_FIELDS.estadoDia]: input.estadoDia,
    [HORARIOS_REGISTROS_FIELDS.observaciones]: input.observaciones?.trim() || null,
    ...mapTotalsToRegistroFields(totals)
  });

  await createAdminAjusteMarcacion(updatedRegistro, new Date(), options.adminUser, input.estadoDia);

  return updatedRegistro;
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
    empleadoCedula: registro.empleadoCedula,
    empleadoRol: registro.empleadoRol,
    usuarioId: registro.usuarioId,
    correo: registro.correo,
    minutosTrabajados: 0,
    horasTrabajadas: 0,
    totalGanado: 0,
    totalAjustes: 0,
    totalNeto: 0,
    totalPagado: 0,
    saldoPendiente: 0,
    generadoEnRango: 0,
    pagadoAsociado: 0,
    saldoPendienteReal: 0,
    pendienteNuevoSinPeriodo: 0,
    jornadasSinPeriodoCount: 0,
    registrosCount: 0
  };
}

function createEmptyEmpleadoResumenFromUser(user: PortalUser): HorarioAdminEmpleadoResumen {
  return {
    empleadoKey: user.id,
    empleado: user.nombre || user.email || "Empleado",
    empleadoRecordId: user.id,
    empleadoCedula: user.cedula,
    empleadoRol: user.rol,
    usuarioId: user.id,
    correo: user.email,
    minutosTrabajados: 0,
    horasTrabajadas: 0,
    totalGanado: 0,
    totalAjustes: 0,
    totalNeto: 0,
    totalPagado: 0,
    saldoPendiente: 0,
    generadoEnRango: 0,
    pagadoAsociado: 0,
    saldoPendienteReal: 0,
    pendienteNuevoSinPeriodo: 0,
    jornadasSinPeriodoCount: 0,
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

async function listPagosActivosByDateRange(fechaInicio: string, fechaFin: string) {
  const fechaField = HORARIOS_PAGOS_FIELDS.fechaPago;
  const query = new URLSearchParams({
    filterByFormula: `AND(OR({${HORARIOS_PAGOS_FIELDS.estadoPago}} = BLANK(), {${HORARIOS_PAGOS_FIELDS.estadoPago}} != 'Anulado'), DATETIME_FORMAT({${fechaField}}, 'YYYY-MM-DD') >= '${escapeFormulaString(fechaInicio)}', DATETIME_FORMAT({${fechaField}}, 'YYYY-MM-DD') <= '${escapeFormulaString(fechaFin)}')`
  });

  return listAllAirtableRecords<HorarioPagoFields>(PAGOS_TABLE, query);
}

async function listAjustesAplicadosByDateRange(fechaInicio: string, fechaFin: string) {
  const fechaField = HORARIOS_AJUSTES_FIELDS.fechaAjuste;
  const query = new URLSearchParams({
    filterByFormula: `AND({${HORARIOS_AJUSTES_FIELDS.estado}} = 'Aplicado', DATETIME_FORMAT({${fechaField}}, 'YYYY-MM-DD') >= '${escapeFormulaString(fechaInicio)}', DATETIME_FORMAT({${fechaField}}, 'YYYY-MM-DD') <= '${escapeFormulaString(fechaFin)}')`,
    "sort[0][field]": HORARIOS_AJUSTES_FIELDS.fechaAjuste,
    "sort[0][direction]": "desc"
  });

  return listAllAirtableRecords<HorarioAjusteFields>(AJUSTES_TABLE, query).then((records) => records.map(mapAjuste));
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
  const [empleadoRecordId, users] = await Promise.all([getEmpleadoRecordId(user), listPortalUsers()]);
  const userMaps = buildPortalUserMaps(users);
  const query = new URLSearchParams({
    filterByFormula: buildRegistrosFechaRangeFormula(fechaInicio, fechaFin),
    "sort[0][field]": HORARIOS_REGISTROS_FIELDS.fecha,
    "sort[0][direction]": "desc"
  });
  const records = await listAllAirtableRecords<HorarioRegistroFields>(REGISTROS_TABLE, query);

  return records
    .map(mapRegistro)
    .filter((registro) => registroBelongsToUser(registro, user, empleadoRecordId))
    .map((registro) => applyPortalUserToRegistro(registro, findPortalUserForEmpleado(userMaps, registro.empleadoRecordId, registro.correo)));
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
  const { fechaInicio, fechaFin } = getLast6MonthsRange();

  return listRegistrosEmpleadoByDateRange(user, fechaInicio, fechaFin);
}

export async function fetchMisPagos(user: SessionUser) {
  const [empleadoRecordId, records, periodos] = await Promise.all([
    getEmpleadoRecordId(user),
    listPagosActivos(),
    fetchMisPeriodosPago(user)
  ]);
  const periodosById = new Map(periodos.map((periodo) => [periodo.id, periodo]));

  return records
    .map(mapPago)
    .filter((pago) => pago.empleadoRecordId === empleadoRecordId && pago.estadoPago !== "Anulado")
    .map((pago) => {
      const periodo = pago.periodoPagoId ? periodosById.get(pago.periodoPagoId) : undefined;

      return {
        ...pago,
        periodoFechaInicio: periodo?.fechaInicio,
        periodoFechaFin: periodo?.fechaFin,
        periodoRolGenerado: periodo?.rolGenerado,
        periodoRolPagoBlobPathname: periodo?.rolPagoBlobPathname
      };
    })
    .sort((first, second) => second.fechaPago.localeCompare(first.fechaPago));
}

async function fetchMisPeriodosPago(user: SessionUser) {
  const [empleadoRecordId, users] = await Promise.all([getEmpleadoRecordId(user), listPortalUsers()]);
  const userMaps = buildPortalUserMaps(users);
  const email = user.email.trim().toLowerCase();
  const records = await listAllAirtableRecords<HorarioPeriodoPagoFields>(PERIODOS_TABLE, new URLSearchParams({
    "sort[0][field]": HORARIOS_PERIODOS_FIELDS.fechaInicio,
    "sort[0][direction]": "desc"
  }));

  return records
    .map(mapPeriodo)
    .filter((periodo) => {
      if (periodo.estadoPeriodo === "Anulado") {
        return false;
      }

      return (
        periodo.empleadoRecordId === empleadoRecordId ||
        Boolean(periodo.usuarioId && periodo.usuarioId === user.userId) ||
        Boolean(email && periodo.correo.trim().toLowerCase() === email)
      );
    })
    .map((periodo) => applyPortalUserToPeriodo(periodo, findPortalUserForEmpleado(userMaps, periodo.empleadoRecordId, periodo.correo)));
}

async function fetchMisAjustes(user: SessionUser) {
  const periodos = await fetchMisPeriodosPago(user);
  const ajustes = await fetchAjustesByPeriodos(periodos.map((periodo) => periodo.id));

  return ajustes
    .filter((ajuste) => ajuste.estado === "Aplicado")
    .sort((first, second) => second.fechaAjuste.localeCompare(first.fechaAjuste));
}

export async function fetchMisRolesPago(user: SessionUser): Promise<HorarioEmpleadoRolPago[]> {
  const periodos = await fetchMisPeriodosPago(user);

  return periodos
    .filter((periodo) => periodo.rolGenerado && Boolean(periodo.rolPagoBlobPathname))
    .map((periodo) => ({
      periodoId: periodo.id,
      empleado: periodo.empleado,
      correo: periodo.correo,
      fechaInicio: periodo.fechaInicio,
      fechaFin: periodo.fechaFin,
      estadoPeriodo: periodo.estadoPeriodo,
      totalGanado: periodo.totalGanado,
      totalAjustes: periodo.totalAjustes,
      totalNeto: periodo.totalNeto,
      totalPagado: periodo.totalPagado,
      saldoPendiente: periodo.saldoPendiente,
      saldoPendienteNeto: periodo.saldoPendienteNeto,
      rolPagoPdf: periodo.rolPagoPdf,
      rolPagoBlobUrl: periodo.rolPagoBlobUrl,
      rolPagoBlobPathname: periodo.rolPagoBlobPathname,
      fechaGeneracionRol: periodo.fechaGeneracionRol,
      estadoRol: periodo.estadoRol
    }));
}

function isPeriodoPagoRelevantForEmployeeSummary(periodo: HorarioPeriodoPago) {
  return (
    periodo.saldoPendienteNeto > 0 ||
    periodo.estadoPeriodo === "Abierto" ||
    periodo.estadoPeriodo === "Parcialmente pagado" ||
    periodo.estadoPeriodo === "Revisado"
  );
}

function getEstadoGeneralPago(totalGanado: number, totalPagado: number, saldoPendiente: number, hasUltimoPago: boolean): HorarioEmpleadoResumenPagos["estadoGeneral"] {
  if (saldoPendiente <= 0 && hasUltimoPago) {
    return "Pagado";
  }

  if (totalGanado <= 0) {
    return "Sin jornadas pagables";
  }

  if (totalPagado <= 0) {
    return "Sin pagos registrados";
  }

  if (saldoPendiente > 0) {
    return "Parcialmente pagado";
  }

  return "Pagado";
}

export async function fetchMiResumenPagos(user: SessionUser): Promise<HorarioEmpleadoResumenPagos> {
  const [periodos, pagos] = await Promise.all([
    fetchMisPeriodosPago(user),
    fetchMisPagos(user)
  ]);
  const periodosRelevantes = periodos.filter(isPeriodoPagoRelevantForEmployeeSummary);
  const totalGanado = periodosRelevantes.reduce((total, periodo) => total + periodo.totalNeto, 0);
  const totalPagado = periodosRelevantes.reduce((total, periodo) => total + periodo.totalPagado, 0);
  const saldoPendiente = periodosRelevantes.reduce((total, periodo) => total + periodo.saldoPendienteNeto, 0);
  const ultimoPago = pagos[0] || null;
  const totalGanadoPeriodos = roundMoney(totalGanado);
  const totalPagadoPeriodos = roundMoney(totalPagado);
  const saldoPendientePeriodos = roundMoney(saldoPendiente);

  return {
    totalGanadoPeriodos,
    totalPagadoPeriodos,
    saldoPendientePeriodos,
    ultimoPagoMonto: ultimoPago ? ultimoPago.montoPagado : null,
    ultimoPagoFecha: ultimoPago?.fechaPago || null,
    periodosRegistrados: periodos.length,
    periodosConsiderados: periodosRelevantes.length,
    estadoGeneral: getEstadoGeneralPago(totalGanadoPeriodos, totalPagadoPeriodos, saldoPendientePeriodos, Boolean(ultimoPago))
  };
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
  const [resumen, resumenPagos, jornadas, ajustes, pagos, rolesPago, periodos] = await Promise.all([
    fetchMiResumenHorarios(user),
    fetchMiResumenPagos(user),
    fetchMisJornadas(user),
    fetchMisAjustes(user),
    fetchMisPagos(user),
    fetchMisRolesPago(user),
    fetchMisPeriodosPago(user)
  ]);

  return {
    resumen,
    resumenPagos,
    jornadas,
    ajustes,
    pagos,
    rolesPago,
    periodos
  };
}

export async function fetchHorariosAdminResumen(input?: { fechaInicio?: string; fechaFin?: string }): Promise<HorarioAdminResumen> {
  const defaultRange = getCurrentWeekRange();
  const fechaInicio = input?.fechaInicio || defaultRange.fechaInicio;
  const fechaFin = input?.fechaFin || defaultRange.fechaFin;

  validateDateKey(fechaInicio, "Fecha inicio");
  validateDateKey(fechaFin, "Fecha fin");

  if (fechaFin < fechaInicio) {
    throw new Error("La fecha fin no puede ser anterior a la fecha inicio.");
  }

  const [rawRegistros, pagos, ajustes, users, periodosRecords] = await Promise.all([
    listRegistrosSemana(fechaInicio, fechaFin),
    listPagosActivosByDateRange(fechaInicio, fechaFin),
    listAjustesAplicadosByDateRange(fechaInicio, fechaFin).catch((error) => {
      console.warn("No se pudieron cargar ajustes del rango. Se continuará sin ajustes en el resumen admin.", error);
      return [];
    }),
    listPortalUsers(),
    listAllAirtableRecords<HorarioPeriodoPagoFields>(PERIODOS_TABLE, new URLSearchParams({
      "sort[0][field]": HORARIOS_PERIODOS_FIELDS.fechaInicio,
      "sort[0][direction]": "desc"
    }))
  ]);
  const userMaps = buildPortalUserMaps(users);
  const pagosMapeados = pagos.map(mapPago);
  const periodos = periodosRecords.map(mapPeriodo);
  const periodosActivos = periodos.filter((periodo) => getEffectiveEstadoPeriodo(periodo) !== "Anulado");
  const registrosEnPeriodo = new Set(periodosActivos.flatMap((periodo) => periodo.registroIds));
  const periodosConSaldoReal = periodosActivos.filter((periodo) => {
    const estado = getEffectiveEstadoPeriodo(periodo);

    return estado !== "Pagado" && estado !== "Cerrado" && periodo.saldoPendienteNeto > 0;
  });
  const registros = rawRegistros.map((registro) =>
    applyPortalUserToRegistro(registro, findPortalUserForEmpleado(userMaps, registro.empleadoRecordId, registro.correo))
  );
  const empleadosMap = new Map<string, HorarioAdminEmpleadoResumen>();

  registros.forEach((registro) => {
    const key = getEmpleadoSummaryKey(registro);
    const empleadoResumen = empleadosMap.get(key) || createEmptyEmpleadoResumen(registro);

    empleadoResumen.minutosTrabajados += registro.minutosTrabajados;
    empleadoResumen.horasTrabajadas += registro.horasTrabajadas;
    empleadoResumen.totalGanado += registro.totalEstimadoDia;
    empleadoResumen.generadoEnRango += registro.totalEstimadoDia;
    empleadoResumen.registrosCount += 1;

    if (!registrosEnPeriodo.has(registro.id)) {
      empleadoResumen.pendienteNuevoSinPeriodo += registro.totalEstimadoDia;
      empleadoResumen.jornadasSinPeriodoCount += 1;
    }

    empleadosMap.set(key, empleadoResumen);
  });

  ajustes.forEach((ajuste) => {
    if (!ajuste.empleadoRecordId || ajuste.estado !== "Aplicado") {
      return;
    }

    const empleadoUser = userMaps.byId.get(ajuste.empleadoRecordId);
    const empleadoResumen =
      empleadosMap.get(ajuste.empleadoRecordId) ||
      (empleadoUser ? createEmptyEmpleadoResumenFromUser(empleadoUser) : null);

    if (!empleadoResumen) {
      return;
    }

    empleadoResumen.totalAjustes += ajuste.montoAjustado;
    empleadosMap.set(ajuste.empleadoRecordId, empleadoResumen);
  });

  pagosMapeados.forEach((pago) => {
    const empleadoRecordId = pago.empleadoRecordId;

    if (!empleadoRecordId) {
      return;
    }

    const empleadoUser = userMaps.byId.get(empleadoRecordId);
    const empleadoResumen =
      empleadosMap.get(empleadoRecordId) ||
      (empleadoUser ? createEmptyEmpleadoResumenFromUser(empleadoUser) : null);

    if (!empleadoResumen) {
      return;
    }

    empleadoResumen.totalPagado += pago.montoPagado;
    empleadoResumen.pagadoAsociado += pago.montoPagado;
    empleadosMap.set(empleadoRecordId, empleadoResumen);
  });

  periodosConSaldoReal.forEach((periodo) => {
    if (!periodo.empleadoRecordId) {
      return;
    }

    const empleadoUser = userMaps.byId.get(periodo.empleadoRecordId);
    const empleadoResumen =
      empleadosMap.get(periodo.empleadoRecordId) ||
      (empleadoUser ? createEmptyEmpleadoResumenFromUser(empleadoUser) : null);

    if (!empleadoResumen) {
      return;
    }

    empleadoResumen.saldoPendienteReal += periodo.saldoPendienteNeto;
    empleadosMap.set(periodo.empleadoRecordId, empleadoResumen);
  });

  const empleados = Array.from(empleadosMap.values())
    .map((empleado) => ({
      ...empleado,
      horasTrabajadas: roundHours(empleado.minutosTrabajados),
      totalGanado: roundMoney(empleado.totalGanado),
      totalAjustes: roundMoney(empleado.totalAjustes),
      totalNeto: roundMoney(empleado.totalGanado + empleado.totalAjustes),
      totalPagado: roundMoney(empleado.totalPagado),
      saldoPendiente: Math.max(0, roundMoney(empleado.saldoPendienteReal)),
      generadoEnRango: roundMoney(empleado.generadoEnRango),
      pagadoAsociado: roundMoney(empleado.pagadoAsociado),
      saldoPendienteReal: Math.max(0, roundMoney(empleado.saldoPendienteReal)),
      pendienteNuevoSinPeriodo: roundMoney(empleado.pendienteNuevoSinPeriodo)
    }))
    .sort((first, second) => second.saldoPendienteReal - first.saldoPendienteReal || first.empleado.localeCompare(second.empleado));

  const totalMinutos = empleados.reduce((total, empleado) => total + empleado.minutosTrabajados, 0);
  const totalGanado = empleados.reduce((total, empleado) => total + empleado.totalGanado, 0);
  const totalAjustes = empleados.reduce((total, empleado) => total + empleado.totalAjustes, 0);
  const totalNeto = empleados.reduce((total, empleado) => total + empleado.totalNeto, 0);
  const totalPagado = pagosMapeados.reduce((total, pago) => total + pago.montoPagado, 0);
  const saldoPendienteReal = periodosConSaldoReal.reduce((total, periodo) => total + periodo.saldoPendienteNeto, 0);
  const pendienteNuevoSinPeriodo = empleados.reduce((total, empleado) => total + empleado.pendienteNuevoSinPeriodo, 0);

  return {
    periodo: {
      fechaInicio,
      fechaFin
    },
    totales: {
      minutosTrabajados: totalMinutos,
      horasTrabajadas: roundHours(totalMinutos),
      totalGanado: roundMoney(totalGanado),
      totalAjustes: roundMoney(totalAjustes),
      totalNeto: roundMoney(totalNeto),
      totalPagado: roundMoney(totalPagado),
      saldoPendiente: Math.max(0, roundMoney(saldoPendienteReal)),
      generadoEnRango: roundMoney(totalGanado),
      pagadoEnRango: roundMoney(totalPagado),
      saldoPendienteReal: Math.max(0, roundMoney(saldoPendienteReal)),
      pendienteNuevoSinPeriodo: roundMoney(pendienteNuevoSinPeriodo)
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

function calculatePeriodoTotals(registros: HorarioRegistro[], pagos: HorarioPago[], ajustes: HorarioAjuste[] = []) {
  const totalMinutos = registros.reduce((total, registro) => total + registro.minutosTrabajados, 0);
  const totalGanado = registros.reduce((total, registro) => total + registro.totalEstimadoDia, 0);
  const totalPagado = pagos.reduce((total, pago) => {
    if (pago.estadoPago === "Anulado") {
      return total;
    }

    return total + pago.montoPagado;
  }, 0);
  const totalAjustes = ajustes.reduce((total, ajuste) => {
    if (ajuste.estado !== "Aplicado") {
      return total;
    }

    return total + ajuste.montoAjustado;
  }, 0);
  const totalNeto = totalGanado + totalAjustes;

  return {
    totalMinutos,
    totalHoras: roundHours(totalMinutos),
    totalGanado: roundMoney(totalGanado),
    totalAjustes: roundMoney(totalAjustes),
    totalNeto: roundMoney(totalNeto),
    totalPagado: roundMoney(totalPagado),
    saldoPendiente: roundMoney(totalNeto - totalPagado),
    saldoPendienteNeto: roundMoney(totalNeto - totalPagado)
  };
}

function getEstadoPeriodoFromTotals(totalPagado: number, saldoPendiente: number, totalNeto = 0): EstadoPeriodoPago {
  if (totalNeto > 0 && (totalPagado >= totalNeto - MONEY_TOLERANCE || saldoPendiente <= MONEY_TOLERANCE)) {
    return "Pagado";
  }

  if (totalPagado <= 0) {
    return "Abierto";
  }

  if (saldoPendiente <= MONEY_TOLERANCE) {
    return "Pagado";
  }

  return "Parcialmente pagado";
}

function getEffectiveEstadoPeriodo(periodo: Pick<HorarioPeriodoPago, "estadoPeriodo" | "totalNeto" | "totalPagado" | "saldoPendienteNeto">): EstadoPeriodoPago | string {
  if (periodo.estadoPeriodo === "Anulado" || periodo.estadoPeriodo === "Cerrado") {
    return periodo.estadoPeriodo;
  }

  return getEstadoPeriodoFromTotals(periodo.totalPagado, periodo.saldoPendienteNeto, periodo.totalNeto);
}

function hasPagosActivos(pagos: HorarioPago[]) {
  return pagos.some((pago) => pago.estadoPago !== "Anulado");
}

function shouldBlockPeriodoAutoSync(periodo: HorarioPeriodoPago, pagos?: HorarioPago[]) {
  const estado = getEffectiveEstadoPeriodo(periodo);

  return estado === "Anulado" || estado === "Pagado" || estado === "Cerrado" || periodo.totalPagado > 0 || Boolean(pagos && hasPagosActivos(pagos));
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

async function listRegistroIdsVinculadosAotrosPeriodos(excludedPeriodoId?: string) {
  const records = await listAllAirtableRecords<HorarioPeriodoPagoFields>(PERIODOS_TABLE, new URLSearchParams());
  const linkedIds = new Set<string>();

  records
    .map(mapPeriodo)
    .filter((periodo) => periodo.id !== excludedPeriodoId && getEffectiveEstadoPeriodo(periodo) !== "Anulado")
    .forEach((periodo) => {
      periodo.registroIds.forEach((registroId) => linkedIds.add(registroId));
    });

  return linkedIds;
}

async function listRegistrosPeriodoDisponibles(fechaInicio: string, fechaFin: string, empleadoId: string, excludedPeriodoId?: string) {
  const [registros, registrosVinculados] = await Promise.all([
    listRegistrosPeriodoCandidate(fechaInicio, fechaFin, empleadoId),
    listRegistroIdsVinculadosAotrosPeriodos(excludedPeriodoId)
  ]);

  return registros.filter((registro) => !registrosVinculados.has(registro.id));
}

async function listRegistrosPagablesByEmpleado(empleadoId: string) {
  const query = new URLSearchParams({
    filterByFormula: `OR({${HORARIOS_REGISTROS_FIELDS.estadoDia}} = 'Finalizado', {${HORARIOS_REGISTROS_FIELDS.estadoDia}} = 'Revisado')`,
    "sort[0][field]": HORARIOS_REGISTROS_FIELDS.fecha,
    "sort[0][direction]": "desc"
  });
  const records = await listAllAirtableRecords<HorarioRegistroFields>(REGISTROS_TABLE, query);

  return records.map(mapRegistro).filter((registro) => registro.empleadoRecordId === empleadoId);
}

async function findPeriodoSolapado(empleadoId: string, fechaInicio: string, fechaFin: string, excludedPeriodoId?: string) {
  const records = await listAllAirtableRecords<HorarioPeriodoPagoFields>(PERIODOS_TABLE, new URLSearchParams());

  return records
    .map(mapPeriodo)
    .find((periodo) => {
      if (periodo.id === excludedPeriodoId || periodo.empleadoRecordId !== empleadoId || getEffectiveEstadoPeriodo(periodo) === "Anulado") {
        return false;
      }

      return periodo.fechaInicio <= fechaFin && periodo.fechaFin >= fechaInicio;
    }) || null;
}

async function updatePeriodoEstado(periodoId: string, estadoPeriodo: EstadoPeriodoPago | string) {
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

async function updatePeriodoFields(periodoId: string, fields: HorarioPeriodoPagoFields) {
  const record = await airtableRequest<AirtableRecord<HorarioPeriodoPagoFields>>(getTableUrl(PERIODOS_TABLE, periodoId), {
    method: "PATCH",
    body: JSON.stringify({ fields })
  });

  return mapPeriodo(record);
}

function sameRecordIds(first: string[], second: string[]) {
  if (first.length !== second.length) {
    return false;
  }

  const firstSet = new Set(first);

  return second.every((id) => firstSet.has(id));
}

async function syncPeriodoRegistros(periodo: HorarioPeriodoPago) {
  if (periodo.estadoPeriodo === "Anulado" || !periodo.empleadoRecordId || !periodo.fechaInicio || !periodo.fechaFin) {
    return periodo;
  }

  const pagos = await fetchPagosByPeriodo(periodo.id);

  if (shouldBlockPeriodoAutoSync(periodo, pagos)) {
    return periodo;
  }

  const registros = await listRegistrosPeriodoDisponibles(periodo.fechaInicio, periodo.fechaFin, periodo.empleadoRecordId, periodo.id);
  const registroIds = Array.from(new Set([...periodo.registroIds, ...registros.map((registro) => registro.id)]));

  if (sameRecordIds(periodo.registroIds, registroIds)) {
    return periodo;
  }

  const record = await airtableRequest<AirtableRecord<HorarioPeriodoPagoFields>>(getTableUrl(PERIODOS_TABLE, periodo.id), {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [HORARIOS_PERIODOS_FIELDS.registrosPeriodo]: registroIds
      }
    })
  });

  return mapPeriodo(record);
}

async function hydratePeriodo(
  periodo: HorarioPeriodoPago,
  userMaps?: ReturnType<typeof buildPortalUserMaps>,
  options?: { syncRegistros?: boolean }
): Promise<HorarioPeriodoPagoDetalle> {
  const syncedPeriodo = options?.syncRegistros ? await syncPeriodoRegistros(periodo) : periodo;
  const [registros, pagos, ajustesResult, ajustesEmpleadoResult] = await Promise.all([
    listRegistrosByIds(syncedPeriodo.registroIds),
    fetchPagosByPeriodo(syncedPeriodo.id),
    fetchAjustesByPeriodo(syncedPeriodo.id).catch((error) => {
      console.warn(`No se pudieron cargar ajustes del periodo ${syncedPeriodo.id}. Se continuará sin ajustes.`, error);
      return [];
    }),
    syncedPeriodo.empleadoRecordId
      ? fetchAjustesByEmpleado(syncedPeriodo.empleadoRecordId).catch((error) => {
          console.warn(`No se pudo cargar el historial de ajustes del empleado ${syncedPeriodo.empleadoRecordId}.`, error);
          return [];
        })
      : Promise.resolve([])
  ]);
  const ajustes = ajustesResult;
  const ajustesEmpleado = ajustesEmpleadoResult;
  const maps = userMaps || buildPortalUserMaps(await listPortalUsers());
  const periodoUser = findPortalUserForEmpleado(maps, syncedPeriodo.empleadoRecordId, syncedPeriodo.correo);
  const enrichedPeriodo = applyPortalUserToPeriodo(syncedPeriodo, periodoUser);
  const enrichedRegistros = registros.map((registro) =>
    applyPortalUserToRegistro(registro, findPortalUserForEmpleado(maps, registro.empleadoRecordId, registro.correo))
  );
  const totals = calculatePeriodoTotals(enrichedRegistros, pagos, ajustes);
  const estadoCalculado =
    syncedPeriodo.estadoPeriodo === "Anulado" || syncedPeriodo.estadoPeriodo === "Cerrado"
      ? syncedPeriodo.estadoPeriodo
      : getEstadoPeriodoFromTotals(totals.totalPagado, totals.saldoPendiente, totals.totalNeto);

  if (estadoCalculado !== syncedPeriodo.estadoPeriodo && syncedPeriodo.estadoPeriodo !== "Anulado" && syncedPeriodo.estadoPeriodo !== "Cerrado") {
    await updatePeriodoEstado(syncedPeriodo.id, estadoCalculado);
  }

  return {
    ...enrichedPeriodo,
    estadoPeriodo: estadoCalculado,
    totalMinutos: totals.totalMinutos,
    totalHoras: totals.totalHoras,
    totalGanado: totals.totalGanado,
    totalAjustes: totals.totalAjustes,
    totalNeto: totals.totalNeto,
    totalPagado: totals.totalPagado,
    saldoPendiente: totals.saldoPendiente,
    saldoPendienteNeto: totals.saldoPendienteNeto,
    registros: enrichedRegistros,
    pagos,
    ajustes,
    ajustesEmpleado
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
  const userMaps = buildPortalUserMaps(await listPortalUsers());

  return records.map((record) => {
    const periodo = mapPeriodo(record);
    const periodoUser = findPortalUserForEmpleado(userMaps, periodo.empleadoRecordId, periodo.correo);
    const enrichedPeriodo = applyPortalUserToPeriodo(periodo, periodoUser);

    return {
      ...enrichedPeriodo,
      estadoPeriodo: getEffectiveEstadoPeriodo(enrichedPeriodo),
      registros: [],
      pagos: [],
      ajustes: [],
      ajustesEmpleado: []
    };
  });
}

export async function actualizarEstadosPeriodosPago(): Promise<{
  revisados: number;
  actualizados: number;
  periodos: Array<{ id: string; estadoAnterior: string; estadoNuevo: string }>;
}> {
  const records = await listAllAirtableRecords<HorarioPeriodoPagoFields>(PERIODOS_TABLE, new URLSearchParams({
    "sort[0][field]": HORARIOS_PERIODOS_FIELDS.fechaInicio,
    "sort[0][direction]": "desc"
  }));
  const cambios: Array<{ id: string; estadoAnterior: string; estadoNuevo: string }> = [];

  for (const record of records) {
    const periodo = mapPeriodo(record);

    if (periodo.estadoPeriodo === "Anulado" || periodo.estadoPeriodo === "Cerrado") {
      continue;
    }

    const estadoNuevo = getEffectiveEstadoPeriodo(periodo);

    if (estadoNuevo !== periodo.estadoPeriodo) {
      await updatePeriodoEstado(periodo.id, estadoNuevo);
      cambios.push({
        id: periodo.id,
        estadoAnterior: periodo.estadoPeriodo,
        estadoNuevo
      });
    }
  }

  return {
    revisados: records.length,
    actualizados: cambios.length,
    periodos: cambios
  };
}

export async function fetchPeriodoPagoById(id: string): Promise<HorarioPeriodoPagoDetalle | null> {
  if (!isAirtableRecordId(id)) {
    return null;
  }

  const record = await airtableRequest<AirtableRecord<HorarioPeriodoPagoFields>>(getTableUrl(PERIODOS_TABLE, id));

  return hydratePeriodo(mapPeriodo(record), undefined, { syncRegistros: true });
}

export async function generarRolPagoPeriodo(input: GenerarRolPagoInput): Promise<HorarioPeriodoPagoDetalle> {
  const periodo = await fetchPeriodoPagoById(input.periodoId);

  if (!periodo) {
    throw new Error("No se encontró el periodo de pago.");
  }

  if (!periodo.registros.length) {
    throw new Error("No se puede generar un rol sin registros diarios vinculados.");
  }

  if (periodo.totalNeto <= 0) {
    throw new Error("No se puede generar un rol sin total neto.");
  }

  const pagosActivos = periodo.pagos.filter((pago) => pago.estadoPago === "Registrado");

  if (!pagosActivos.length || periodo.totalPagado <= 0) {
    throw new Error("No se puede generar el rol de pago porque este periodo aún no tiene pagos registrados.");
  }

  const generadoEn = new Date();
  const generadoPor = input.adminUser.email || input.adminUser.nombre || "Administrador";
  const pdfBytes = await generateRolPagoPdf({ periodo, generadoPor, generadoEn });
  const filename = buildRolPagoFilename(periodo);
  const blob = await put(`horarios/roles-pago/${periodo.id}/${Date.now()}-${filename}`, Buffer.from(pdfBytes), {
    access: "private",
    contentType: "application/pdf"
  });
  const estadoRol = periodo.rolGenerado || periodo.rolPagoBlobPathname ? "Regenerado" : "Generado";
  const observacionRol = input.observacionRol?.trim();
  const fields: HorarioPeriodoPagoFields = {
    [HORARIOS_PERIODOS_FIELDS.rolPagoBlobUrl]: blob.url,
    [HORARIOS_PERIODOS_FIELDS.rolPagoBlobPathname]: blob.pathname,
    [HORARIOS_PERIODOS_FIELDS.rolGenerado]: true,
    [HORARIOS_PERIODOS_FIELDS.fechaGeneracionRol]: generadoEn.toISOString(),
    [HORARIOS_PERIODOS_FIELDS.generadoPor]: generadoPor,
    [HORARIOS_PERIODOS_FIELDS.estadoRol]: estadoRol
  };

  if (observacionRol) {
    fields[HORARIOS_PERIODOS_FIELDS.observacionRol] = observacionRol;
  }

  const record = await airtableRequest<AirtableRecord<HorarioPeriodoPagoFields>>(getTableUrl(PERIODOS_TABLE, periodo.id), {
    method: "PATCH",
    body: JSON.stringify({ fields })
  });

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
      cedula: user.cedula,
      rol: user.rol,
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

  const overlapping = await findPeriodoSolapado(empleadoId, fechaInicio, fechaFin);

  if (overlapping) {
    throw new Error(`Ya existe un periodo para este empleado que se solapa con el rango seleccionado: ${overlapping.fechaInicio} - ${overlapping.fechaFin}.`);
  }

  const registros = await listRegistrosPeriodoDisponibles(fechaInicio, fechaFin, empleadoId);

  if (!registros.length) {
    throw new Error("No hay jornadas finalizadas o revisadas disponibles para este empleado en el rango seleccionado.");
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

export async function eliminarPeriodoPago(periodoId: string): Promise<{ deleted: true; id: string }> {
  assertAirtableRecordId(periodoId, "Periodo");

  const periodo = await fetchPeriodoPagoById(periodoId);

  if (!periodo) {
    throw new Error("No se encontró el periodo de pago.");
  }

  if (hasPagosActivos(periodo.pagos)) {
    throw new Error("Este periodo tiene pagos registrados. Primero anula o elimina los pagos antes de eliminar el periodo.");
  }

  if (periodo.registroIds.length) {
    await airtableRequest<AirtableRecord<HorarioPeriodoPagoFields>>(getTableUrl(PERIODOS_TABLE, periodo.id), {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [HORARIOS_PERIODOS_FIELDS.registrosPeriodo]: []
        }
      })
    });
  }

  await airtableRequest<{ deleted: boolean; id: string }>(getTableUrl(PERIODOS_TABLE, periodo.id), {
    method: "DELETE"
  });

  return { deleted: true, id: periodo.id };
}

export async function cerrarPeriodoHastaFecha(input: CerrarPeriodoHastaFechaInput): Promise<{
  periodo: HorarioPeriodoPagoDetalle;
  nuevoPeriodo: HorarioPeriodoPagoDetalle | null;
  jornadasRetiradas: number;
}> {
  const periodoId = input.periodoId.trim();
  const fechaCorte = input.fechaCorte.trim();

  assertAirtableRecordId(periodoId, "Periodo");
  validateDateKey(fechaCorte, "Fecha de corte");

  const periodo = await fetchPeriodoPagoById(periodoId);

  if (!periodo) {
    throw new Error("No se encontró el periodo de pago.");
  }

  if (periodo.estadoPeriodo === "Anulado") {
    throw new Error("No se puede cerrar un periodo anulado.");
  }

  if (!periodo.empleadoRecordId) {
    throw new Error("El periodo no tiene empleado vinculado.");
  }

  if (fechaCorte < periodo.fechaInicio || fechaCorte > periodo.fechaFin) {
    throw new Error("La fecha de corte debe estar dentro del rango actual del periodo.");
  }

  const registrosDentro = periodo.registros.filter((registro) => registro.fecha <= fechaCorte);
  const registrosPosteriores = periodo.registros.filter((registro) => registro.fecha > fechaCorte);

  if (!registrosDentro.length) {
    throw new Error("El periodo debe conservar al menos una jornada hasta la fecha de corte.");
  }

  if (!registrosPosteriores.length && periodo.fechaFin === fechaCorte) {
    throw new Error("No hay jornadas posteriores para retirar de este periodo.");
  }

  const totals = calculatePeriodoTotals(registrosDentro, periodo.pagos, periodo.ajustes);
  const estadoPeriodo =
    periodo.estadoPeriodo === "Cerrado"
      ? periodo.estadoPeriodo
      : getEstadoPeriodoFromTotals(totals.totalPagado, totals.saldoPendiente, totals.totalNeto);
  const periodoActualizadoBase = await updatePeriodoFields(periodo.id, {
    [HORARIOS_PERIODOS_FIELDS.fechaFin]: fechaCorte,
    [HORARIOS_PERIODOS_FIELDS.registrosPeriodo]: registrosDentro.map((registro) => registro.id),
    [HORARIOS_PERIODOS_FIELDS.estadoPeriodo]: estadoPeriodo
  });

  const periodoActualizado = await hydratePeriodo(periodoActualizadoBase);

  return {
    periodo: periodoActualizado,
    nuevoPeriodo: null,
    jornadasRetiradas: registrosPosteriores.length
  };
}

export async function fetchHorarioEmpleadoAdminDetalle(empleadoId: string): Promise<HorarioAdminEmpleadoDetalle | null> {
  if (!isAirtableRecordId(empleadoId)) {
    return null;
  }

  const [users, periodos, pagosRecords, registros] = await Promise.all([
    listPortalUsers(),
    fetchPeriodosPago(),
    listPagosActivos(),
    listRegistrosPagablesByEmpleado(empleadoId)
  ]);
  const maps = buildPortalUserMaps(users);
  const empleadoUser = maps.byId.get(empleadoId);
  const periodosEmpleadoBase = periodos.filter((periodo) => periodo.empleadoRecordId === empleadoId && periodo.estadoPeriodo !== "Anulado");
  const periodosEmpleado = (
    await Promise.all(periodosEmpleadoBase.map((periodo) => fetchPeriodoPagoById(periodo.id)))
  ).filter((periodo): periodo is HorarioPeriodoPagoDetalle => Boolean(periodo));
  const pagos = pagosRecords
    .map(mapPago)
    .filter((pago) => pago.empleadoRecordId === empleadoId && pago.estadoPago !== "Anulado")
    .sort((first, second) => second.fechaPago.localeCompare(first.fechaPago));
  const periodosRegistrosIds = new Set(periodosEmpleado.flatMap((periodo) => periodo.registroIds));
  const jornadasPendientes = registros
    .filter((registro) => !periodosRegistrosIds.has(registro.id))
    .map((registro) => applyPortalUserToRegistro(registro, findPortalUserForEmpleado(maps, registro.empleadoRecordId, registro.correo)));
  const totalPagado = roundMoney(pagos.reduce((total, pago) => total + pago.montoPagado, 0));
  const totalPendienteJornadas = roundMoney(jornadasPendientes.reduce((total, registro) => total + registro.totalEstimadoDia, 0));
  const saldoPendiente = roundMoney(periodosEmpleado.reduce((total, periodo) => total + periodo.saldoPendiente, 0) + totalPendienteJornadas);

  return {
    empleado: {
      empleadoRecordId: empleadoId,
      empleado: empleadoUser?.nombre || empleadoUser?.email || periodosEmpleado[0]?.empleado || registros[0]?.empleado || "Empleado",
      cedula: empleadoUser?.cedula || periodosEmpleado[0]?.empleadoCedula || registros[0]?.empleadoCedula,
      rol: empleadoUser?.rol || periodosEmpleado[0]?.empleadoRol || registros[0]?.empleadoRol,
      usuarioId: empleadoUser?.id || periodosEmpleado[0]?.usuarioId || registros[0]?.usuarioId || empleadoId,
      correo: empleadoUser?.email || periodosEmpleado[0]?.correo || registros[0]?.correo || ""
    },
    resumen: {
      totalGanadoPendiente: roundMoney(periodosEmpleado.reduce((total, periodo) => total + periodo.saldoPendiente, 0) + totalPendienteJornadas),
      totalPagado,
      saldoPendiente,
      jornadasPendientesCount: jornadasPendientes.length,
      periodosCount: periodosEmpleado.length,
      pagosCount: pagos.length
    },
    jornadasPendientes,
    periodos: periodosEmpleado,
    pagos
  };
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

export async function fetchAjustesByPeriodo(periodoId: string) {
  if (!isAirtableRecordId(periodoId)) {
    return [];
  }

  const records = await listAllAirtableRecords<HorarioAjusteFields>(AJUSTES_TABLE, new URLSearchParams({
    "sort[0][field]": HORARIOS_AJUSTES_FIELDS.fechaAjuste,
    "sort[0][direction]": "desc"
  }));

  return records
    .map(mapAjuste)
    .filter((ajuste) => ajuste.periodoPagoId === periodoId);
}

export async function fetchAjustesByEmpleado(empleadoId: string) {
  if (!isAirtableRecordId(empleadoId)) {
    return [];
  }

  const [ajusteRecords, periodoRecords] = await Promise.all([
    listAllAirtableRecords<HorarioAjusteFields>(AJUSTES_TABLE, new URLSearchParams({
      "sort[0][field]": HORARIOS_AJUSTES_FIELDS.fechaAjuste,
      "sort[0][direction]": "desc"
    })),
    listAllAirtableRecords<HorarioPeriodoPagoFields>(PERIODOS_TABLE, new URLSearchParams())
  ]);
  const periodos = periodoRecords.map(mapPeriodo);
  const periodosEmpleadoIds = new Set(periodos.filter((periodo) => periodo.empleadoRecordId === empleadoId).map((periodo) => periodo.id));

  const ajustes = ajusteRecords
    .map(mapAjuste)
    .filter((ajuste) => ajuste.empleadoRecordId === empleadoId || Boolean(ajuste.periodoPagoId && periodosEmpleadoIds.has(ajuste.periodoPagoId)))
    .sort((first, second) => second.fechaAjuste.localeCompare(first.fechaAjuste));

  return attachPeriodoInfoToAjustes(ajustes, periodos);
}

async function fetchAjustesByPeriodos(periodoIds: string[]) {
  const ids = new Set(periodoIds.filter(isAirtableRecordId));

  if (!ids.size) {
    return [];
  }

  const records = await listAllAirtableRecords<HorarioAjusteFields>(AJUSTES_TABLE, new URLSearchParams({
    "sort[0][field]": HORARIOS_AJUSTES_FIELDS.fechaAjuste,
    "sort[0][direction]": "desc"
  }));

  return records
    .map(mapAjuste)
    .filter((ajuste) => Boolean(ajuste.periodoPagoId && ids.has(ajuste.periodoPagoId)));
}

async function fetchPagoById(id: string) {
  if (!isAirtableRecordId(id)) {
    return null;
  }

  const record = await airtableRequest<AirtableRecord<HorarioPagoFields>>(getTableUrl(PAGOS_TABLE, id));

  return mapPago(record);
}

export async function anularPagoHorario(input: AnularPagoHorarioInput): Promise<{ pago: HorarioPago; periodo: HorarioPeriodoPagoDetalle }> {
  const motivo = input.motivo.trim();

  if (!motivo) {
    throw new Error("El motivo de anulación es obligatorio.");
  }

  const [periodo, pago] = await Promise.all([
    fetchPeriodoPagoById(input.periodoId),
    fetchPagoById(input.pagoId)
  ]);

  if (!periodo) {
    throw new Error("No se encontró el periodo de pago.");
  }

  if (!pago || pago.periodoPagoId !== periodo.id) {
    throw new Error("No se encontró el pago en este periodo.");
  }

  if (pago.estadoPago === "Anulado") {
    return { pago, periodo };
  }

  const adminLabel = input.adminUser.email || input.adminUser.nombre || "Administrador";
  const anuladoLine = `[Anulado por administrador el ${formatAuditDate(new Date())}] Motivo: ${motivo} (${adminLabel})`;
  const observacion = pago.observacion?.trim() ? `${pago.observacion.trim()}\n${anuladoLine}` : anuladoLine;
  const updatedPagoRecord = await airtableRequest<AirtableRecord<HorarioPagoFields>>(getTableUrl(PAGOS_TABLE, pago.id), {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [HORARIOS_PAGOS_FIELDS.estadoPago]: "Anulado",
        [HORARIOS_PAGOS_FIELDS.observacion]: observacion
      }
    })
  });
  const pagos = await fetchPagosByPeriodo(periodo.id);
  const totals = calculatePeriodoTotals(periodo.registros, pagos, periodo.ajustes);
  const estadoPeriodo =
    periodo.estadoPeriodo === "Anulado" || periodo.estadoPeriodo === "Cerrado"
      ? periodo.estadoPeriodo
      : getEstadoPeriodoFromTotals(totals.totalPagado, totals.saldoPendiente, totals.totalNeto);

  if (estadoPeriodo !== periodo.estadoPeriodo) {
    await updatePeriodoEstado(periodo.id, estadoPeriodo);
  }

  const updatedPeriodo = await fetchPeriodoPagoById(periodo.id);

  if (!updatedPeriodo) {
    throw new Error("El pago se anuló, pero no se pudo refrescar el periodo.");
  }

  return {
    pago: mapPago(updatedPagoRecord),
    periodo: updatedPeriodo
  };
}

export async function registrarAjusteHorario(input: RegistrarAjusteHorarioInput): Promise<{ ajuste: HorarioAjuste; periodo: HorarioPeriodoPagoDetalle }> {
  const periodo = await fetchPeriodoPagoById(input.periodoId);
  const motivo = input.motivo.trim();
  const tipoAjuste = normalizeTipoAjuste(input.tipoAjuste);

  if (!periodo) {
    throw new Error("No se encontró el periodo de pago.");
  }

  if (periodo.estadoPeriodo === "Anulado") {
    throw new Error("No se puede registrar un ajuste en un periodo anulado.");
  }

  if (!motivo) {
    throw new Error("El motivo del ajuste es obligatorio.");
  }

  const registroRelacionado = input.registroId
    ? periodo.registros.find((registro) => registro.id === input.registroId)
    : null;

  if (input.registroId && !registroRelacionado) {
    throw new Error("El registro del día seleccionado no pertenece a este periodo.");
  }

  const valorHora = registroRelacionado?.valorHora || periodo.registros.find((registro) => registro.valorHora > 0)?.valorHora || VALOR_HORA;
  let minutosAjustados = 0;
  let montoAjustado = 0;
  let detalleNotificacion = "";

  if (input.tipoCalculo === "horas") {
    if (!supportsHorasAjuste(tipoAjuste)) {
      throw new Error("Este tipo de ajuste debe registrarse por monto.");
    }

    const horasInput = input.horas;

    if (typeof horasInput !== "number" || !Number.isFinite(horasInput) || horasInput <= 0) {
      throw new Error("Las horas a ajustar deben ser mayores a 0.");
    }

    const horasAjustadas = Math.round(horasInput * 100) / 100;
    minutosAjustados = -Math.round(horasAjustadas * 60);
    montoAjustado = -roundMoney(horasAjustadas * valorHora);
    detalleNotificacion = `${horasAjustadas.toFixed(2)} h (${new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(montoAjustado)})`;
  } else if (input.tipoCalculo === "monto") {
    const montoInput = input.monto;

    if (typeof montoInput !== "number" || !Number.isFinite(montoInput) || montoInput <= 0) {
      throw new Error("El monto a ajustar debe ser mayor a 0.");
    }

    const impacto = requiresMontoImpacto(tipoAjuste) ? input.impacto : null;
    const sign = getMontoAjusteSign(tipoAjuste, impacto);
    montoAjustado = sign * roundMoney(montoInput);
    minutosAjustados = 0;
    detalleNotificacion = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(montoAjustado);
  } else {
    throw new Error("Tipo de cálculo no válido.");
  }

  const aprobadoPor = input.adminUser.email || input.adminUser.nombre || "Administrador";
  const fields: HorarioAjusteFields = {
    [HORARIOS_AJUSTES_FIELDS.empleado]: periodo.empleadoRecordId ? [periodo.empleadoRecordId] : undefined,
    [HORARIOS_AJUSTES_FIELDS.periodoPago]: [periodo.id],
    [HORARIOS_AJUSTES_FIELDS.tipoAjuste]: tipoAjuste,
    [HORARIOS_AJUSTES_FIELDS.minutosAjustados]: minutosAjustados,
    [HORARIOS_AJUSTES_FIELDS.montoAjustado]: montoAjustado,
    [HORARIOS_AJUSTES_FIELDS.motivo]: motivo,
    [HORARIOS_AJUSTES_FIELDS.aprobadoPor]: aprobadoPor,
    [HORARIOS_AJUSTES_FIELDS.fechaAjuste]: getLocalDateKey(new Date()),
    [HORARIOS_AJUSTES_FIELDS.estado]: "Aplicado"
  };

  if (registroRelacionado) {
    fields[HORARIOS_AJUSTES_FIELDS.registroDelDia] = [registroRelacionado.id];
  }

  const created = await airtableRequest<AirtableRecord<HorarioAjusteFields>>(getTableUrl(AJUSTES_TABLE), {
    method: "POST",
    body: JSON.stringify({ fields })
  });
  const ajustes = await fetchAjustesByPeriodo(periodo.id);
  const totals = calculatePeriodoTotals(periodo.registros, periodo.pagos, ajustes);
  const estadoPeriodo =
    periodo.estadoPeriodo === "Anulado" || periodo.estadoPeriodo === "Cerrado"
      ? periodo.estadoPeriodo
      : getEstadoPeriodoFromTotals(totals.totalPagado, totals.saldoPendienteNeto, totals.totalNeto);

  if (estadoPeriodo !== periodo.estadoPeriodo) {
    await updatePeriodoEstado(periodo.id, estadoPeriodo);
  }

  if (periodo.empleadoRecordId) {
    try {
      await crearNotificacion({
        destinatarioId: periodo.empleadoRecordId,
        tipo: "Amonestación",
        titulo: "Ajuste registrado",
        mensaje: `Se registró ${tipoAjuste.toLowerCase()} por ${detalleNotificacion} en tu periodo de pago. Motivo: ${motivo}`,
        urlAccion: "/horarios",
        prioridad: "Alta",
        enviarEmail: false,
        entidadTipo: "Ajuste de horario",
        entidadId: created.id,
        creadoPorId: input.adminUser.userId
      });
    } catch (error) {
      console.error("No se pudo crear la notificación de ajuste:", error);
    }
  }

  const updatedPeriodo = await fetchPeriodoPagoById(periodo.id);

  if (!updatedPeriodo) {
    throw new Error("El ajuste se guardó, pero no se pudo refrescar el periodo.");
  }

  return {
    ajuste: {
      ...mapAjuste(created),
      periodoFechaInicio: periodo.fechaInicio,
      periodoFechaFin: periodo.fechaFin
    },
    periodo: updatedPeriodo
  };
}

export async function registrarAmonestacionHorario(input: RegistrarAmonestacionHorarioInput): Promise<{ ajuste: HorarioAjuste; periodo: HorarioPeriodoPagoDetalle }> {
  return registrarAjusteHorario({
    periodoId: input.periodoId,
    tipoAjuste: "Descuento",
    tipoCalculo: "horas",
    horas: input.horasDescontadas,
    motivo: input.motivo,
    registroId: input.registroId,
    adminUser: input.adminUser
  });
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
  const totals = calculatePeriodoTotals(periodo.registros, pagos, periodo.ajustes);
  const estadoPeriodo =
    periodo.estadoPeriodo === "Anulado" || periodo.estadoPeriodo === "Cerrado"
      ? periodo.estadoPeriodo
      : getEstadoPeriodoFromTotals(totals.totalPagado, totals.saldoPendiente, totals.totalNeto);

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
