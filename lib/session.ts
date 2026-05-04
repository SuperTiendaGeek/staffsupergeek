import { jwtVerify, SignJWT, type JWTPayload } from "jose";

export const SESSION_COOKIE_NAME = "sg_staff_session";
export const TWO_FACTOR_PENDING_COOKIE_NAME = "sg_staff_2fa_pending";
export const SESSION_DURATION_SECONDS = 8 * 60 * 60;
export const TWO_FACTOR_PENDING_DURATION_SECONDS = 10 * 60;

export type SessionUser = {
  userId: string;
  nombre: string;
  email: string;
  rol: string;
  appsPermitidas: string[];
};

export type StaffSession = {
  user: SessionUser;
  expiresAt: string;
};

export type PendingTwoFactorSession = {
  user: SessionUser;
  twoFactorCodeRecordId: string;
  expiresAt: string;
};

type StaffJwtPayload = JWTPayload & {
  userId: string;
  nombre: string;
  email: string;
  rol: string;
  appsPermitidas: string[];
};

type PendingTwoFactorJwtPayload = StaffJwtPayload & {
  twoFactorCodeRecordId: string;
};

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }

  return new TextEncoder().encode(secret);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseSessionPayload(payload: JWTPayload): StaffSession | null {
  const staffPayload = payload as StaffJwtPayload;

  if (
    typeof staffPayload.userId !== "string" ||
    typeof staffPayload.nombre !== "string" ||
    typeof staffPayload.email !== "string" ||
    typeof staffPayload.rol !== "string" ||
    !isStringArray(staffPayload.appsPermitidas) ||
    typeof staffPayload.exp !== "number"
  ) {
    return null;
  }

  return {
    user: {
      userId: staffPayload.userId,
      nombre: staffPayload.nombre,
      email: staffPayload.email,
      rol: staffPayload.rol,
      appsPermitidas: staffPayload.appsPermitidas
    },
    expiresAt: new Date(staffPayload.exp * 1000).toISOString()
  };
}

function parsePendingTwoFactorPayload(payload: JWTPayload): PendingTwoFactorSession | null {
  const pendingPayload = payload as PendingTwoFactorJwtPayload;

  if (
    typeof pendingPayload.userId !== "string" ||
    typeof pendingPayload.nombre !== "string" ||
    typeof pendingPayload.email !== "string" ||
    typeof pendingPayload.rol !== "string" ||
    !isStringArray(pendingPayload.appsPermitidas) ||
    typeof pendingPayload.twoFactorCodeRecordId !== "string" ||
    typeof pendingPayload.exp !== "number"
  ) {
    return null;
  }

  return {
    user: {
      userId: pendingPayload.userId,
      nombre: pendingPayload.nombre,
      email: pendingPayload.email,
      rol: pendingPayload.rol,
      appsPermitidas: pendingPayload.appsPermitidas
    },
    twoFactorCodeRecordId: pendingPayload.twoFactorCodeRecordId,
    expiresAt: new Date(pendingPayload.exp * 1000).toISOString()
  };
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
    expires: new Date(Date.now() + SESSION_DURATION_SECONDS * 1000)
  };
}

export function getTwoFactorPendingCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TWO_FACTOR_PENDING_DURATION_SECONDS
  };
}

export function getExpiredSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0)
  };
}

export const getExpiredTwoFactorPendingCookieOptions = getExpiredSessionCookieOptions;

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    userId: user.userId,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    appsPermitidas: user.appsPermitidas
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function createTwoFactorPendingToken(input: SessionUser & { twoFactorCodeRecordId: string }) {
  return new SignJWT({
    userId: input.userId,
    nombre: input.nombre,
    email: input.email,
    rol: input.rol,
    appsPermitidas: input.appsPermitidas,
    twoFactorCodeRecordId: input.twoFactorCodeRecordId
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TWO_FACTOR_PENDING_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token?: string | null): Promise<StaffSession | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"]
    });

    return parseSessionPayload(payload);
  } catch {
    return null;
  }
}

export async function verifyTwoFactorPendingToken(token?: string | null): Promise<PendingTwoFactorSession | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"]
    });

    return parsePendingTwoFactorPayload(payload);
  } catch {
    return null;
  }
}

export async function getSessionFromCookie() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return verifySessionToken(token);
}
