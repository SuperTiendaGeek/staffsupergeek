export type AccessLogAction = "Login" | "Login fallido" | "Logout" | "Acceso Bloqueado";
export type AccessLogResult = "Permitido" | "Bloqueado";

type AccessLogInput = {
  userId?: string;
  email?: string;
  accion: AccessLogAction;
  app: string;
  resultado: AccessLogResult;
  request: Request;
};

type AccessLogFields = {
  Usuario?: string[];
  Email?: string;
  Acción: AccessLogAction;
  App: string;
  Resultado: AccessLogResult;
  IP: string;
  "User Agent": string;
  Fecha: string;
};

function getRequiredAccessLogEnv(name: "AIRTABLE_API_KEY" | "AIRTABLE_BASE_ID" | "AIRTABLE_ACCESS_LOG_TABLE") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing Airtable access log environment variable: ${name}`);
  }

  return value;
}

function getAccessLogConfig() {
  return {
    apiKey: getRequiredAccessLogEnv("AIRTABLE_API_KEY"),
    baseId: getRequiredAccessLogEnv("AIRTABLE_BASE_ID"),
    tableName: getRequiredAccessLogEnv("AIRTABLE_ACCESS_LOG_TABLE")
  };
}

function getAccessLogTableUrl() {
  const { baseId, tableName } = getAccessLogConfig();

  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "";
  }

  return request.headers.get("x-real-ip")?.trim() || "";
}

function logAccessLogError(error: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.error("Could not create Airtable access log", error);
}

export async function createAccessLog(input: AccessLogInput) {
  try {
    const { apiKey } = getAccessLogConfig();
    const fields: AccessLogFields = {
      Acción: input.accion,
      App: input.app,
      Resultado: input.resultado,
      IP: getClientIp(input.request),
      "User Agent": input.request.headers.get("user-agent") || "",
      Fecha: new Date().toISOString()
    };

    if (input.userId) {
      fields.Usuario = [input.userId];
    }

    if (input.email) {
      fields.Email = input.email;
    }

    const response = await fetch(getAccessLogTableUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Airtable access log failed with status ${response.status}: ${responseText}`);
    }
  } catch (error) {
    logAccessLogError(error);
  }
}
