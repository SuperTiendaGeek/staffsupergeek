import "server-only";

import type { PortalUser, PortalUserInput } from "@/types/admin-users";
import {
  parsePantallasRestringidas,
  serializePantallasRestringidas,
  type PantallasRestringidas,
} from "@/lib/permissions/pantallas";
import {
  parseCamposRestringidos,
  serializeCamposRestringidos,
  type CamposRestringidos,
} from "@/lib/permissions/campos";

export type AirtableUser = {
  recordId: string;
  nombre: string;
  cedula?: string;
  email: string;
  passwordHash: string;
  rol: string;
  activo: boolean;
  activoDesde?: string;
  ultimoLogin?: string;
  appsPermitidas: string[];
  requiere2FA: boolean;
  pantallasRestringidas: PantallasRestringidas;
  camposRestringidos: CamposRestringidos;
};

type AirtableRecord<TFields> = {
  id: string;
  createdTime?: string;
  fields: TFields;
};

type AirtableListResponse<TFields> = {
  records: Array<AirtableRecord<TFields>>;
  offset?: string;
};

type AirtableUserFields = {
  Nombre?: string;
  Email?: string;
  "Cédula"?: string;
  "Password Hash"?: string;
  Rol?: string;
  Activo?: boolean;
  "Apps Permitidas"?: string[] | string;
  "Requiere 2FA"?: boolean;
  "Activo desde"?: string;
  "Fecha de ingreso"?: string;
  "Fecha Ingreso"?: string;
  "Último Login"?: string;
  "Pantallas Restringidas"?: string;
  "Campos Restringidos"?: string;
};

function getRequiredEnv(name: "AIRTABLE_API_KEY" | "AIRTABLE_BASE_ID" | "AIRTABLE_USERS_TABLE") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing Airtable environment variable: ${name}`);
  }

  return value;
}

function getAirtableConfig() {
  return {
    apiKey: getRequiredEnv("AIRTABLE_API_KEY"),
    baseId: getRequiredEnv("AIRTABLE_BASE_ID"),
    usersTable: getRequiredEnv("AIRTABLE_USERS_TABLE")
  };
}

function getUsersTableUrl(recordId?: string) {
  const { baseId, usersTable } = getAirtableConfig();
  const tablePath = encodeURIComponent(usersTable);
  const recordPath = recordId ? `/${encodeURIComponent(recordId)}` : "";

  return `https://api.airtable.com/v0/${baseId}/${tablePath}${recordPath}`;
}

function getAirtableHeaders() {
  const { apiKey } = getAirtableConfig();

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function escapeFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function maskBaseId(baseId: string) {
  if (baseId.length <= 8) {
    return `${baseId.slice(0, 2)}...`;
  }

  return `${baseId.slice(0, 6)}...${baseId.slice(-3)}`;
}

function logAirtableDebug(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info(`[Airtable] ${message}`, details);
}

function logAirtableFailure(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.error(`[Airtable] ${message}`, details);
}

function normalizeAppsPermitidas(value: AirtableUserFields["Apps Permitidas"]) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((app) => app.trim())
      .filter(Boolean);
  }

  return [];
}

function mapAirtableUser(record: AirtableRecord<AirtableUserFields>): AirtableUser | null {
  const { fields } = record;

  if (!fields.Email || !fields["Password Hash"]) {
    return null;
  }

  return {
    recordId: record.id,
    nombre: fields.Nombre || fields.Email,
    cedula: fields["Cédula"],
    email: fields.Email,
    passwordHash: fields["Password Hash"],
    rol: fields.Rol || "staff",
    activo: fields.Activo === true,
    activoDesde: fields["Activo desde"] || fields["Fecha de ingreso"] || fields["Fecha Ingreso"] || record.createdTime,
    ultimoLogin: fields["Último Login"],
    appsPermitidas: normalizeAppsPermitidas(fields["Apps Permitidas"]),
    requiere2FA: fields["Requiere 2FA"] === true,
    pantallasRestringidas: parsePantallasRestringidas(fields["Pantallas Restringidas"]),
    camposRestringidos: parseCamposRestringidos(fields["Campos Restringidos"])
  };
}

function mapPortalUser(record: AirtableRecord<AirtableUserFields>): PortalUser | null {
  const { fields } = record;

  if (!fields.Email) {
    return null;
  }

  return {
    id: record.id,
    nombre: fields.Nombre || fields.Email,
    cedula: fields["Cédula"],
    email: fields.Email,
    rol: fields.Rol || "staff",
    activo: fields.Activo === true,
    activoDesde: fields["Activo desde"] || fields["Fecha de ingreso"] || fields["Fecha Ingreso"] || record.createdTime,
    ultimoLogin: fields["Último Login"],
    appsPermitidas: normalizeAppsPermitidas(fields["Apps Permitidas"]),
    requiere2FA: fields["Requiere 2FA"] === true,
    pantallasRestringidas: parsePantallasRestringidas(fields["Pantallas Restringidas"]),
    camposRestringidos: parseCamposRestringidos(fields["Campos Restringidos"])
  };
}

function mapUserInputToAirtableFields(input: PortalUserInput, passwordHash?: string): AirtableUserFields {
  return {
    Nombre: input.nombre,
    Email: input.email,
    Rol: input.rol,
    Activo: input.activo,
    "Apps Permitidas": input.appsPermitidas,
    "Requiere 2FA": input.requiere2FA === true,
    ...(passwordHash ? { "Password Hash": passwordHash } : {})
  };
}

async function parseAirtableJson<T>(response: Response) {
  return (await response.json()) as T;
}

export async function findUserByEmail(email: string) {
  const { baseId, usersTable } = getAirtableConfig();
  const normalizedEmail = email.trim().toLowerCase();
  const formula = `LOWER({Email}) = '${escapeFormulaString(normalizedEmail)}'`;
  const requestUrl = `${getUsersTableUrl()}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;

  logAirtableDebug("Looking up user", {
    baseId: maskBaseId(baseId),
    tableName: usersTable,
    url: requestUrl
  });

  const response = await fetch(requestUrl, {
    headers: getAirtableHeaders(),
    cache: "no-store"
  });

  logAirtableDebug("Lookup response received", {
    baseId: maskBaseId(baseId),
    tableName: usersTable,
    url: requestUrl,
    status: response.status
  });

  if (!response.ok) {
    const responseText = await response.text();

    logAirtableFailure("Lookup failed", {
      baseId: maskBaseId(baseId),
      tableName: usersTable,
      url: requestUrl,
      status: response.status,
      responseText
    });

    throw new Error(`Airtable user lookup failed with status ${response.status}`);
  }

  const data = (await response.json()) as AirtableListResponse<AirtableUserFields>;
  const record = data.records[0];

  return record ? mapAirtableUser(record) : null;
}

export async function findPortalUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const formula = `LOWER({Email}) = '${escapeFormulaString(normalizedEmail)}'`;
  const requestUrl = `${getUsersTableUrl()}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;

  const response = await fetch(requestUrl, {
    headers: getAirtableHeaders(),
    cache: "no-store"
  });

  if (!response.ok) {
    const responseText = await response.text();

    logAirtableFailure("Portal user lookup failed", {
      status: response.status,
      responseText
    });

    throw new Error(`Airtable portal user lookup failed with status ${response.status}`);
  }

  const data = await parseAirtableJson<AirtableListResponse<AirtableUserFields>>(response);
  const record = data.records[0];

  return record ? mapPortalUser(record) : null;
}

export async function listPortalUsers() {
  const users: PortalUser[] = [];
  let offset: string | undefined;

  do {
    const query = new URLSearchParams({
      pageSize: "100",
      "sort[0][field]": "Nombre",
      "sort[0][direction]": "asc"
    });

    if (offset) {
      query.set("offset", offset);
    }

    const response = await fetch(`${getUsersTableUrl()}?${query.toString()}`, {
      headers: getAirtableHeaders(),
      cache: "no-store"
    });

    if (!response.ok) {
      const responseText = await response.text();

      logAirtableFailure("Portal users list failed", {
        status: response.status,
        responseText
      });

      throw new Error(`Airtable portal users list failed with status ${response.status}`);
    }

    const data = await parseAirtableJson<AirtableListResponse<AirtableUserFields>>(response);
    users.push(...data.records.map(mapPortalUser).filter((user): user is PortalUser => Boolean(user)));
    offset = data.offset;
  } while (offset);

  return users;
}

export async function createPortalUser(input: PortalUserInput, passwordHash: string) {
  const response = await fetch(getUsersTableUrl(), {
    method: "POST",
    headers: getAirtableHeaders(),
    body: JSON.stringify({
      fields: mapUserInputToAirtableFields(input, passwordHash)
    })
  });

  if (!response.ok) {
    const responseText = await response.text();

    logAirtableFailure("Portal user create failed", {
      status: response.status,
      responseText
    });

    throw new Error(`Airtable portal user create failed with status ${response.status}`);
  }

  const record = await parseAirtableJson<AirtableRecord<AirtableUserFields>>(response);
  const user = mapPortalUser(record);

  if (!user) {
    throw new Error("Airtable returned an invalid portal user record");
  }

  return user;
}

export async function updatePortalUser(recordId: string, input: PortalUserInput) {
  const response = await fetch(getUsersTableUrl(recordId), {
    method: "PATCH",
    headers: getAirtableHeaders(),
    body: JSON.stringify({
      fields: mapUserInputToAirtableFields(input)
    })
  });

  if (!response.ok) {
    const responseText = await response.text();

    logAirtableFailure("Portal user update failed", {
      status: response.status,
      responseText
    });

    throw new Error(`Airtable portal user update failed with status ${response.status}`);
  }

  const record = await parseAirtableJson<AirtableRecord<AirtableUserFields>>(response);
  const user = mapPortalUser(record);

  if (!user) {
    throw new Error("Airtable returned an invalid portal user record");
  }

  return user;
}

export async function updatePortalUserPassword(recordId: string, passwordHash: string) {
  const response = await fetch(getUsersTableUrl(recordId), {
    method: "PATCH",
    headers: getAirtableHeaders(),
    body: JSON.stringify({
      fields: {
        "Password Hash": passwordHash
      }
    })
  });

  if (!response.ok) {
    const responseText = await response.text();

    logAirtableFailure("Portal user password update failed", {
      status: response.status,
      responseText
    });

    throw new Error(`Airtable portal user password update failed with status ${response.status}`);
  }
}

export async function updatePortalUserStatus(recordId: string, activo: boolean) {
  const response = await fetch(getUsersTableUrl(recordId), {
    method: "PATCH",
    headers: getAirtableHeaders(),
    body: JSON.stringify({
      fields: {
        Activo: activo
      }
    })
  });

  if (!response.ok) {
    const responseText = await response.text();

    logAirtableFailure("Portal user status update failed", {
      status: response.status,
      responseText
    });

    throw new Error(`Airtable portal user status update failed with status ${response.status}`);
  }

  const record = await parseAirtableJson<AirtableRecord<AirtableUserFields>>(response);
  const user = mapPortalUser(record);

  if (!user) {
    throw new Error("Airtable returned an invalid portal user record");
  }

  return user;
}

export async function updatePortalUserPantallasRestringidas(recordId: string, value: PantallasRestringidas) {
  const response = await fetch(getUsersTableUrl(recordId), {
    method: "PATCH",
    headers: getAirtableHeaders(),
    body: JSON.stringify({
      fields: {
        "Pantallas Restringidas": serializePantallasRestringidas(value)
      }
    })
  });

  if (!response.ok) {
    const responseText = await response.text();

    logAirtableFailure("Portal user pantallas restringidas update failed", {
      status: response.status,
      responseText
    });

    throw new Error(`Airtable portal user pantallas restringidas update failed with status ${response.status}`);
  }

  const record = await parseAirtableJson<AirtableRecord<AirtableUserFields>>(response);
  const user = mapPortalUser(record);

  if (!user) {
    throw new Error("Airtable returned an invalid portal user record");
  }

  return user;
}

export async function updatePortalUserCamposRestringidos(recordId: string, value: CamposRestringidos) {
  const response = await fetch(getUsersTableUrl(recordId), {
    method: "PATCH",
    headers: getAirtableHeaders(),
    body: JSON.stringify({
      fields: {
        "Campos Restringidos": serializeCamposRestringidos(value)
      }
    })
  });

  if (!response.ok) {
    const responseText = await response.text();

    logAirtableFailure("Portal user campos restringidos update failed", {
      status: response.status,
      responseText
    });

    throw new Error(`Airtable portal user campos restringidos update failed with status ${response.status}`);
  }

  const record = await parseAirtableJson<AirtableRecord<AirtableUserFields>>(response);
  const user = mapPortalUser(record);

  if (!user) {
    throw new Error("Airtable returned an invalid portal user record");
  }

  return user;
}

export async function updateLastLogin(recordId: string) {
  const { baseId, usersTable } = getAirtableConfig();
  const requestUrl = getUsersTableUrl(recordId);

  logAirtableDebug("Updating last login", {
    baseId: maskBaseId(baseId),
    tableName: usersTable,
    url: requestUrl
  });

  const response = await fetch(requestUrl, {
    method: "PATCH",
    headers: getAirtableHeaders(),
    body: JSON.stringify({
      fields: {
        "Último Login": new Date().toISOString()
      }
    })
  });

  logAirtableDebug("Last login update response received", {
    baseId: maskBaseId(baseId),
    tableName: usersTable,
    url: requestUrl,
    status: response.status
  });

  if (!response.ok) {
    const responseText = await response.text();

    logAirtableFailure("Last login update failed", {
      baseId: maskBaseId(baseId),
      tableName: usersTable,
      url: requestUrl,
      status: response.status,
      responseText
    });

    throw new Error(`Airtable last login update failed with status ${response.status}`);
  }
}
