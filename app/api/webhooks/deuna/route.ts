import { NextResponse } from "next/server";
import { secretoAvisoDeUna } from "@/lib/pagos-en-linea/config";
import { CABECERA_AVISO_DEUNA, leerAviso, verificarCabecera } from "@/lib/pagos-en-linea/deuna-reglas";
import { procesarAvisoDeUna } from "@/lib/pagos-en-linea/servidor";

export const dynamic = "force-dynamic";

// Aviso de pago de DeUna (webhook, etapa D 18-nov-2026). URL registrada en
// DeUna: https://staff.supertiendageek.com/api/webhooks/deuna
//
// Seguridad (Codex + documentación de DeUna):
//   - DeUna solo permite UNA cabecera fija: "x-supergeek-deuna: <clave>". Si la
//     clave no está configurada en el portal (DEUNA_WEBHOOK_SECRET, ≥ 32
//     caracteres) se RECHAZA todo. Clave distinta o ausente → 401.
//   - El cuerpo nunca se cree: solo se toma el ID y se vuelve a preguntar a
//     DeUna (/payment/info) el estado, el monto y la caja.
//   - Respuestas cortas, sin datos: nada del cuerpo vuelve ni va a los registros.
//   - 5xx = DeUna reintenta (3 veces, cada 30 s). Si DeUna aún dice "pendiente"
//     o no responde, se pide el reintento.

const MAX_BYTES = 8_192;

export async function POST(req: Request) {
  const cabecera = verificarCabecera(secretoAvisoDeUna(), req.headers.get(CABECERA_AVISO_DEUNA));
  if (cabecera === "sin_configurar") {
    console.warn("[aviso DeUna] rechazado: la clave del aviso no está configurada.");
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (cabecera === "rechazado") {
    console.warn("[aviso DeUna] rechazado: cabecera ausente o distinta.");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const texto = await req.text().catch(() => "");
  if (!texto || texto.length > MAX_BYTES) return NextResponse.json({ ok: false }, { status: 400 });
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const aviso = leerAviso(cuerpo);
  // Un aviso que no es de pago exitoso no se reintenta.
  if (!aviso) return NextResponse.json({ ok: true, resultado: "ignorado" });

  try {
    const resultado = await procesarAvisoDeUna(aviso);
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    console.error("[aviso DeUna] se pide reintento:", e instanceof Error ? e.message : "error");
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
