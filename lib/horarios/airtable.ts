import "server-only";

import type { SessionUser } from "@/lib/session";
import type { EstadoDia, HorarioEstado, HorarioMarcacion, HorarioRegistro, TipoMarcacion } from "@/types/horarios";

const SUELDO_BASE = 482;
const HORAS_BASE_MES = 160;
const VALOR_HORA = SUELDO_BASE / HORAS_BASE_MES;
const HORARIOS_TIME_ZONE = process.env.HORARIOS_TIME_ZONE?.trim() || "America/Guayaquil";
const REGISTROS_TABLE = process.env.AIRTABLE_HORARIOS_REGISTROS_TABLE?.trim() || "Horarios Registros";
const MARCACIONES_TABLE = process.env.AIRTABLE_HORARIOS_MARCACIONES_TABLE?.trim() || "Horarios Marcaciones";

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
  "Fecha y Hora"?: string;
  "Tipo de Marcación"?: TipoMarcacion;
  "Registro del Día"?: string[];
  IP?: string;
  "User Agent"?: string;
  Origen?: string;
  Observación?: string;
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

function getTableUrl(tableName: string, recordId?: string) {
  const baseId = getRequiredEnv("AIRTABLE_BASE_ID");
  const recordPath = recordId ? `/${encodeURIComponent(recordId)}` : "";

  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}${recordPath}`;
}

function escapeFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
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

function getEmpleadoLabel(value: string | string[] | undefined, fallback: string) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return fallback;
}

function mapRegistro(record: AirtableRecord<HorarioRegistroFields>): HorarioRegistro {
  const fields = record.fields;

  return {
    id: record.id,
    empleado: getEmpleadoLabel(fields.Empleado, fields.Correo || "Staff SUPER GEEK"),
    usuarioId: fields["Usuario ID"] || "",
    correo: fields.Correo || "",
    fecha: fields.Fecha || "",
    estadoDia: fields["Estado del día"] || "Pendiente",
    entrada: fields.Entrada,
    salidaAlmuerzo: fields["Salida Almuerzo"],
    regresoAlmuerzo: fields["Regreso Almuerzo"],
    salidaFinal: fields["Salida Final"],
    minutosTrabajados: fields["Minutos Trabajados"] || 0,
    horasTrabajadas: fields["Horas Trabajadas"] || 0,
    sueldoBase: fields["Sueldo Base"] || SUELDO_BASE,
    horasBaseMes: fields["Horas Base Mes"] || HORAS_BASE_MES,
    valorHora: fields["Valor Hora"] || VALOR_HORA,
    totalEstimadoDia: fields["Total Estimado Día"] || 0,
    observaciones: fields.Observaciones
  };
}

function mapMarcacion(record: AirtableRecord<HorarioMarcacionFields>): HorarioMarcacion {
  const fields = record.fields;

  return {
    id: record.id,
    empleado: getEmpleadoLabel(fields.Empleado, fields["Usuario ID"] || "Staff SUPER GEEK"),
    usuarioId: fields["Usuario ID"] || "",
    fechaHora: fields["Fecha y Hora"] || "",
    tipo: fields["Tipo de Marcación"] || "entrada",
    registroDiaId: fields["Registro del Día"]?.[0],
    ip: fields.IP,
    userAgent: fields["User Agent"],
    origen: fields.Origen,
    observacion: fields.Observación
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

async function findRegistroByUserAndDate(usuarioId: string, fecha: string) {
  const formula = `AND({Usuario ID} = '${escapeFormulaString(usuarioId)}', {Fecha} = '${escapeFormulaString(fecha)}')`;
  const url = `${getTableUrl(REGISTROS_TABLE)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableRequest<AirtableListResponse<HorarioRegistroFields>>(url);
  const record = data.records[0];

  return record ? mapRegistro(record) : null;
}

async function listMarcacionesByUserAndDate(usuarioId: string, fecha: string) {
  const formula = `AND({Usuario ID} = '${escapeFormulaString(usuarioId)}', DATETIME_FORMAT(SET_TIMEZONE({Fecha y Hora}, '${escapeFormulaString(HORARIOS_TIME_ZONE)}'), 'YYYY-MM-DD') = '${escapeFormulaString(fecha)}')`;
  const query = new URLSearchParams({
    filterByFormula: formula,
    "sort[0][field]": "Fecha y Hora",
    "sort[0][direction]": "asc"
  });
  const data = await airtableRequest<AirtableListResponse<HorarioMarcacionFields>>(`${getTableUrl(MARCACIONES_TABLE)}?${query.toString()}`);

  return data.records.map(mapMarcacion);
}

async function createMarcacion(user: SessionUser, tipo: TipoMarcacion, registroId: string, now: Date, meta: RequestMeta) {
  const record = await airtableRequest<AirtableRecord<HorarioMarcacionFields>>(getTableUrl(MARCACIONES_TABLE), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Empleado: [user.userId],
        "Usuario ID": user.userId,
        "Fecha y Hora": now.toISOString(),
        "Tipo de Marcación": tipo,
        "Registro del Día": [registroId],
        IP: meta.ip,
        "User Agent": meta.userAgent,
        Origen: "portal_staff",
        Observación: meta.observacion
      }
    })
  });

  return mapMarcacion(record);
}

async function createRegistro(user: SessionUser, fecha: string, now: Date, meta: RequestMeta) {
  const totals = getTotals(0);
  const record = await airtableRequest<AirtableRecord<HorarioRegistroFields>>(getTableUrl(REGISTROS_TABLE), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Empleado: [user.userId],
        "Usuario ID": user.userId,
        Correo: user.email,
        Fecha: fecha,
        "Estado del día": "Trabajando",
        Entrada: now.toISOString(),
        "Minutos Trabajados": totals.minutosTrabajados,
        "Horas Trabajadas": totals.horasTrabajadas,
        "Sueldo Base": totals.sueldoBase,
        "Horas Base Mes": totals.horasBaseMes,
        "Valor Hora": totals.valorHora,
        "Total Estimado Día": totals.totalEstimadoDia,
        "IP Entrada": meta.ip,
        "User Agent": meta.userAgent
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
    findRegistroByUserAndDate(user.userId, fecha),
    listMarcacionesByUserAndDate(user.userId, fecha)
  ]);

  return buildEstado(registro, marcaciones, fecha, now);
}

export async function marcarHorario(user: SessionUser, tipo: TipoMarcacion, meta: RequestMeta) {
  const now = new Date();
  const fecha = getLocalDateKey(now);
  const registro = await findRegistroByUserAndDate(user.userId, fecha);

  if (tipo === "entrada") {
    if (registro?.entrada) {
      throw new Error("Ya registraste la entrada de hoy.");
    }

    const newRegistro = await createRegistro(user, fecha, now, meta);
    await createMarcacion(user, tipo, newRegistro.id, now, meta);
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

  if (tipo === "salida_almuerzo") {
    if (registro.salidaAlmuerzo) {
      throw new Error("Ya registraste la salida al almuerzo.");
    }

    const draft = { ...registro, salidaAlmuerzo: now.toISOString() };
    const totals = getTotals(calculateMinutes(draft, now, false));
    updatedRegistro = await updateRegistro(registro, {
      "Salida Almuerzo": now.toISOString(),
      "Estado del día": "En almuerzo",
      ...totals
    });
  } else if (tipo === "regreso_almuerzo") {
    if (!registro.salidaAlmuerzo) {
      throw new Error("Primero debes marcar la salida al almuerzo.");
    }

    if (registro.regresoAlmuerzo) {
      throw new Error("Ya registraste el regreso del almuerzo.");
    }

    updatedRegistro = await updateRegistro(registro, {
      "Regreso Almuerzo": now.toISOString(),
      "Estado del día": "Trabajando"
    });
  } else if (tipo === "salida_final") {
    if (registro.salidaAlmuerzo && !registro.regresoAlmuerzo) {
      throw new Error("Primero debes marcar el regreso del almuerzo.");
    }

    const draft = { ...registro, salidaFinal: now.toISOString() };
    const totals = getTotals(calculateMinutes(draft, now, false));
    updatedRegistro = await updateRegistro(registro, {
      "Salida Final": now.toISOString(),
      "Estado del día": "Finalizado",
      "IP Salida": meta.ip,
      "User Agent": meta.userAgent,
      ...totals
    });
  } else {
    throw new Error("Tipo de marcación no permitido.");
  }

  await createMarcacion(user, tipo, updatedRegistro.id, now, meta);
  const marcaciones = await listMarcacionesByUserAndDate(user.userId, fecha);

  return buildEstado(updatedRegistro, marcaciones, fecha, now);
}

export async function listHorariosRegistrosByDate(fecha = getLocalDateKey(new Date())) {
  const query = new URLSearchParams({
    filterByFormula: `{Fecha} = '${escapeFormulaString(fecha)}'`,
    "sort[0][field]": "Empleado",
    "sort[0][direction]": "asc"
  });
  const data = await airtableRequest<AirtableListResponse<HorarioRegistroFields>>(`${getTableUrl(REGISTROS_TABLE)}?${query.toString()}`);

  return {
    fecha,
    registros: data.records.map(mapRegistro)
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
