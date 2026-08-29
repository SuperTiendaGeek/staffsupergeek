import "server-only";

import bcrypt from "bcryptjs";
import { findUserByEmail, updateLastLogin } from "@/lib/airtable";
import type { SessionUser } from "@/lib/session";

const PASSWORD_SALT_ROUNDS = 12;

export const GENERIC_LOGIN_ERROR = "Correo o contraseña incorrectos.";

type AuthenticatedUser = {
  sessionUser: SessionUser;
  airtableRecordId: string;
  requiresTwoFactor: boolean;
};

export async function authenticateWithPassword(email: string, password: string): Promise<AuthenticatedUser | null> {
  const user = await findUserByEmail(email);

  if (!user || !user.activo) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  return {
    airtableRecordId: user.recordId,
    requiresTwoFactor: user.requiere2FA,
    sessionUser: {
      userId: user.recordId,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      appsPermitidas: user.appsPermitidas,
      pantallasRestringidas: user.pantallasRestringidas,
      camposRestringidos: user.camposRestringidos
    }
  };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

export async function touchLastLogin(recordId: string) {
  try {
    await updateLastLogin(recordId);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Could not update Airtable last login", error);
    }
  }
}
