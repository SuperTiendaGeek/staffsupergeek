import { NextResponse } from "next/server";
import { createAccessLog } from "@/lib/access-log";
import {
  createSessionToken,
  getExpiredTwoFactorPendingCookieOptions,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  TWO_FACTOR_PENDING_COOKIE_NAME,
  verifyTwoFactorPendingToken
} from "@/lib/session";
import { touchLastLogin } from "@/lib/auth";
import {
  getTwoFactorCodeRecord,
  incrementTwoFactorAttempts,
  isTwoFactorCodeExpired,
  isTwoFactorCodeMatch,
  markTwoFactorCodeUsed,
  MAX_TWO_FACTOR_ATTEMPTS
} from "@/lib/two-factor";

const genericTwoFactorError = "Código inválido o vencido.";
const restartLoginError = "Debes volver a iniciar sesión.";

type VerifyTwoFactorBody = {
  code?: unknown;
};

function getCookieValue(request: Request, name: string) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function isValidCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value.trim());
}

export async function POST(request: Request) {
  let body: VerifyTwoFactorBody | null = null;

  try {
    body = (await request.json()) as VerifyTwoFactorBody;
  } catch {
    return NextResponse.json({ success: false, error: genericTwoFactorError }, { status: 400 });
  }

  if (!isValidCode(body?.code)) {
    return NextResponse.json({ success: false, error: genericTwoFactorError }, { status: 400 });
  }

  const pendingToken = getCookieValue(request, TWO_FACTOR_PENDING_COOKIE_NAME);
  const pendingSession = await verifyTwoFactorPendingToken(pendingToken);

  if (!pendingSession) {
    return NextResponse.json({ success: false, error: restartLoginError }, { status: 401 });
  }

  try {
    const codeRecord = await getTwoFactorCodeRecord(pendingSession.twoFactorCodeRecordId);

    if (
      !codeRecord ||
      codeRecord.used ||
      isTwoFactorCodeExpired(codeRecord) ||
      codeRecord.attempts >= MAX_TWO_FACTOR_ATTEMPTS ||
      (codeRecord.userIds.length > 0 && !codeRecord.userIds.includes(pendingSession.user.userId))
    ) {
      return NextResponse.json({ success: false, error: genericTwoFactorError }, { status: 401 });
    }

    const codeMatches = await isTwoFactorCodeMatch(body.code.trim(), codeRecord.codeHash);

    if (!codeMatches) {
      await incrementTwoFactorAttempts(codeRecord);
      return NextResponse.json({ success: false, error: genericTwoFactorError }, { status: 401 });
    }

    await markTwoFactorCodeUsed(codeRecord.recordId);

    const token = await createSessionToken(pendingSession.user);
    const response = NextResponse.json({ success: true, redirectTo: "/dashboard" });

    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    response.cookies.set(TWO_FACTOR_PENDING_COOKIE_NAME, "", getExpiredTwoFactorPendingCookieOptions());

    await createAccessLog({
      userId: pendingSession.user.userId,
      email: pendingSession.user.email,
      accion: "Login",
      app: "Login",
      resultado: "Permitido",
      request
    });
    await touchLastLogin(pendingSession.user.userId);

    return response;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("2FA verification failed", error);
    }

    return NextResponse.json(
      { success: false, error: "No se pudo verificar el código. Intenta de nuevo más tarde." },
      { status: 500 }
    );
  }
}
