import "server-only";

import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import type { SessionUser } from "@/lib/session";

const TWO_FACTOR_CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_TWO_FACTOR_ATTEMPTS = 5;

export type TwoFactorCodeRecord = {
  recordId: string;
  userIds: string[];
  email: string;
  codeHash: string;
  expiresAt: string;
  used: boolean;
  attempts: number;
};

type AirtableRecord<TFields> = {
  id: string;
  fields: TFields;
};

type TwoFactorCodeFields = {
  Usuario?: string[];
  Email?: string;
  "Codigo Hash"?: string;
  "Expira En"?: string;
  Usado?: boolean;
  Intentos?: number;
  "Fecha Creacion"?: string;
};

function getRequiredEnv(name: "AIRTABLE_API_KEY" | "AIRTABLE_BASE_ID" | "AIRTABLE_2FA_CODES_TABLE") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing two factor environment variable: ${name}`);
  }

  return value;
}

function getTwoFactorConfig() {
  return {
    apiKey: getRequiredEnv("AIRTABLE_API_KEY"),
    baseId: getRequiredEnv("AIRTABLE_BASE_ID"),
    tableName: getRequiredEnv("AIRTABLE_2FA_CODES_TABLE")
  };
}

function getTwoFactorTableUrl(recordId?: string) {
  const { baseId, tableName } = getTwoFactorConfig();
  const recordPath = recordId ? `/${encodeURIComponent(recordId)}` : "";

  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}${recordPath}`;
}

function getTwoFactorHeaders() {
  const { apiKey } = getTwoFactorConfig();

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function logTwoFactorError(message: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.error(`[2FA] ${message}`, error);
}

function generateSixDigitCode() {
  return randomInt(100000, 1000000).toString();
}

function mapTwoFactorCodeRecord(record: AirtableRecord<TwoFactorCodeFields>): TwoFactorCodeRecord | null {
  const { fields } = record;

  if (!fields["Codigo Hash"] || !fields["Expira En"]) {
    return null;
  }

  return {
    recordId: record.id,
    userIds: fields.Usuario || [],
    email: fields.Email || "",
    codeHash: fields["Codigo Hash"],
    expiresAt: fields["Expira En"],
    used: fields.Usado === true,
    attempts: typeof fields.Intentos === "number" ? fields.Intentos : 0
  };
}

export async function createTwoFactorCode(user: SessionUser) {
  const code = generateSixDigitCode();
  const codeHash = await bcrypt.hash(code, 12);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TWO_FACTOR_CODE_TTL_MS);

  const response = await fetch(getTwoFactorTableUrl(), {
    method: "POST",
    headers: getTwoFactorHeaders(),
    body: JSON.stringify({
      fields: {
        Usuario: [user.userId],
        Email: user.email,
        "Codigo Hash": codeHash,
        "Expira En": expiresAt.toISOString(),
        Usado: false,
        Intentos: 0,
        "Fecha Creacion": now.toISOString()
      }
    })
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Airtable 2FA code creation failed with status ${response.status}: ${responseText}`);
  }

  const data = (await response.json()) as AirtableRecord<TwoFactorCodeFields>;

  if (process.env.NODE_ENV === "development") {
    console.info(`[2FA DEV CODE] ${user.email}: ${code}`);
  }

  return {
    code,
    recordId: data.id,
    expiresAt: expiresAt.toISOString()
  };
}

export async function getTwoFactorCodeRecord(recordId: string) {
  const response = await fetch(getTwoFactorTableUrl(recordId), {
    headers: getTwoFactorHeaders(),
    cache: "no-store"
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Airtable 2FA code lookup failed with status ${response.status}: ${responseText}`);
  }

  const data = (await response.json()) as AirtableRecord<TwoFactorCodeFields>;

  return mapTwoFactorCodeRecord(data);
}

export async function incrementTwoFactorAttempts(record: TwoFactorCodeRecord) {
  try {
    await fetch(getTwoFactorTableUrl(record.recordId), {
      method: "PATCH",
      headers: getTwoFactorHeaders(),
      body: JSON.stringify({
        fields: {
          Intentos: record.attempts + 1
        }
      })
    });
  } catch (error) {
    logTwoFactorError("Could not increment attempts", error);
  }
}

export async function markTwoFactorCodeUsed(recordId: string) {
  const response = await fetch(getTwoFactorTableUrl(recordId), {
    method: "PATCH",
    headers: getTwoFactorHeaders(),
    body: JSON.stringify({
      fields: {
        Usado: true
      }
    })
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Airtable 2FA code update failed with status ${response.status}: ${responseText}`);
  }
}

export async function isTwoFactorCodeMatch(code: string, codeHash: string) {
  return bcrypt.compare(code, codeHash);
}

export function isTwoFactorCodeExpired(record: TwoFactorCodeRecord) {
  return new Date(record.expiresAt).getTime() <= Date.now();
}
