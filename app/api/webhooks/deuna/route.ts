import { manejarAvisoDeUna } from "@/lib/pagos-en-linea/aviso-ruta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Aviso de pago de DeUna — PRODUCCIÓN (dinero real). URL registrada en DeUna:
// https://staff.supertiendageek.com/api/webhooks/deuna
// Apagado hasta DEUNA_AVISOS_ACTIVO=1 (y la clave DEUNA_WEBHOOK_SECRET). Ver lib/pagos-en-linea/aviso-ruta.ts.
export async function POST(req: Request) {
  return manejarAvisoDeUna(req, "Producción");
}
