import { NextResponse } from "next/server";
import { createAccessLog } from "@/lib/access-log";
import { logAuthFlow } from "@/lib/auth-flow-log";
import { authenticateWithPassword, GENERIC_LOGIN_ERROR, touchLastLogin } from "@/lib/auth";
import { sendTwoFactorCodeEmail } from "@/lib/email";
import {
  createSessionToken,
  createTwoFactorPendingToken,
  getExpiredTwoFactorPendingCookieOptions,
  getSessionCookieOptions,
  getTwoFactorPendingCookieOptions,
  SESSION_COOKIE_NAME,
  TWO_FACTOR_PENDING_COOKIE_NAME
} from "@/lib/session";
import { createTwoFactorCode, markTwoFactorCodeUsed } from "@/lib/two-factor";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

function isValidLoginBody(body: LoginBody | null): body is { email: string; password: string } {
  return typeof body?.email === "string" && typeof body?.password === "string";
}

function getLoginEmail(body: LoginBody | null) {
  return typeof body?.email === "string" ? body.email.trim().toLowerCase() : undefined;
}

async function logFailedLogin(request: Request, body: LoginBody | null) {
  await createAccessLog({
    email: getLoginEmail(body),
    accion: "Login fallido",
    app: "Login",
    resultado: "Bloqueado",
    request
  });
}

export async function POST(request: Request) {
  let body: LoginBody | null = null;

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    await logFailedLogin(request, body);
    return NextResponse.json({ success: false, error: GENERIC_LOGIN_ERROR }, { status: 400 });
  }

  if (!isValidLoginBody(body) || !body.email.trim() || !body.password) {
    await logFailedLogin(request, body);
    return NextResponse.json({ success: false, error: GENERIC_LOGIN_ERROR }, { status: 400 });
  }

  try {
    const authenticatedUser = await authenticateWithPassword(body.email, body.password);

    if (!authenticatedUser) {
      await logFailedLogin(request, body);
      return NextResponse.json({ success: false, error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }

    if (authenticatedUser.requiresTwoFactor) {
      const twoFactorCode = await createTwoFactorCode(authenticatedUser.sessionUser);

      try {
        await sendTwoFactorCodeEmail({
          to: authenticatedUser.sessionUser.email,
          code: twoFactorCode.code,
          userName: authenticatedUser.sessionUser.nombre
        });
      } catch (error) {
        try {
          await markTwoFactorCodeUsed(twoFactorCode.recordId);
        } catch (markUsedError) {
          if (process.env.NODE_ENV === "development") {
            console.error("Could not invalidate 2FA code after email failure", markUsedError);
          }
        }

        if (process.env.NODE_ENV === "development") {
          console.error("Could not send 2FA email", error);
        }

        return NextResponse.json(
          { success: false, error: "No pudimos enviar el código de verificación. Intenta nuevamente." },
          { status: 500 }
        );
      }

      const pendingToken = await createTwoFactorPendingToken({
        ...authenticatedUser.sessionUser,
        twoFactorCodeRecordId: twoFactorCode.recordId
      });
      const response = NextResponse.json({
        success: true,
        requiresTwoFactor: true
      });

      response.cookies.set(TWO_FACTOR_PENDING_COOKIE_NAME, pendingToken, getTwoFactorPendingCookieOptions());
      logAuthFlow("2FA pending cookie set on response", {
        userId: authenticatedUser.sessionUser.userId,
        cookieName: TWO_FACTOR_PENDING_COOKIE_NAME
      });

      return response;
    }

    const token = await createSessionToken(authenticatedUser.sessionUser);
    const response = NextResponse.json({
      success: true,
      requiresTwoFactor: false,
      redirectTo: "/dashboard"
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    response.cookies.set(TWO_FACTOR_PENDING_COOKIE_NAME, "", getExpiredTwoFactorPendingCookieOptions());
    logAuthFlow("Session cookie set on response", {
      userId: authenticatedUser.sessionUser.userId,
      cookieName: SESSION_COOKIE_NAME
    });

    await createAccessLog({
      userId: authenticatedUser.sessionUser.userId,
      email: authenticatedUser.sessionUser.email,
      accion: "Login",
      app: "Login",
      resultado: "Permitido",
      request
    });
    await touchLastLogin(authenticatedUser.airtableRecordId);

    return response;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Login failed", error);
    }

    return NextResponse.json(
      { success: false, error: "No se pudo iniciar sesión. Intenta de nuevo más tarde." },
      { status: 500 }
    );
  }
}
