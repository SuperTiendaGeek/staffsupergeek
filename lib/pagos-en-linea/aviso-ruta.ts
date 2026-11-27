import "server-only";

// Receptor del aviso de DeUna (webhook) — común a los dos ambientes (etapa D2):
//   producción → POST /api/webhooks/deuna     (DEUNA_AVISOS_ACTIVO + DEUNA_WEBHOOK_SECRET)
//   QA         → POST /api/webhooks/deuna-qa  (DEUNA_QA_AVISOS_ACTIVO + DEUNA_QA_WEBHOOK_SECRET)
//
// Seguridad (Codex + documentación de DeUna):
//   - Interruptor propio: con el receptor apagado se rechaza TODO (503), aunque
//     haya clave. El botón de cobro (DEUNA_ACTIVO) es otro interruptor.
//   - Cabecera fija "x-supergeek-deuna: <clave>" (≥ 32 caracteres), comparada
//     en tiempo constante. Sin clave → 503; distinta o ausente → 401.
//   - El cuerpo nunca se cree: solo el ID; se vuelve a preguntar a DeUna (del
//     MISMO ambiente) el estado, el monto y la caja.
//   - Respuestas sin datos; nada del cuerpo va a los registros.
//   - 5xx = DeUna reintenta (3 veces, cada 30 s); además la revisión automática lo recoge.

import { NextResponse } from "next/server";
import { configPasarela } from "./config";
import { CABECERA_AVISO_DEUNA, leerAviso, verificarCabecera } from "./deuna-reglas";
import { procesarAvisoDeUna } from "./servidor";
import type { Ambiente } from "./reglas";

const MAX_BYTES = 8_192;

export async function manejarAvisoDeUna(req: Request, ambiente: Ambiente): Promise<NextResponse> {
  const etiqueta = ambiente === "Prueba" ? "[aviso DeUna QA]" : "[aviso DeUna]";
  const config = configPasarela("DeUna", ambiente);
  if (!config.avisos) {
    console.warn(`${etiqueta} rechazado: el receptor está apagado.`);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const cabecera = verificarCabecera(config.secretoAviso, req.headers.get(CABECERA_AVISO_DEUNA));
  if (cabecera === "sin_configurar") {
    console.warn(`${etiqueta} rechazado: la clave del aviso no está configurada.`);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (cabecera === "rechazado") {
    console.warn(`${etiqueta} rechazado: cabecera ausente o distinta.`);
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
    const resultado = await procesarAvisoDeUna(aviso, ambiente);
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    console.error(`${etiqueta} se pide reintento:`, e instanceof Error ? e.message : "error");
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
