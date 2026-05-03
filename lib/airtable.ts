import "server-only";

export type AirtableUser = {
  recordId: string;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: string;
  activo: boolean;
  appsPermitidas: string[];
  requiere2FA: boolean;
};

type AirtableRecord<TFields> = {
  id: string;
  fields: TFields;
};

type AirtableListResponse<TFields> = {
  records: Array<AirtableRecord<TFields>>;
};

type AirtableUserFields = {
  Nombre?: string;
  Email?: string;
  "Password Hash"?: string;
  Rol?: string;
  Activo?: boolean;
  "Apps Permitidas"?: string[] | string;
  "Requiere 2FA"?: boolean;
  "Último Login"?: string;
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
    email: fields.Email,
    passwordHash: fields["Password Hash"],
    rol: fields.Rol || "staff",
    activo: fields.Activo === true,
    appsPermitidas: normalizeAppsPermitidas(fields["Apps Permitidas"]),
    requiere2FA: fields["Requiere 2FA"] === true
  };
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
