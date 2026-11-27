import { manejarAvisoDeUna } from "@/lib/pagos-en-linea/aviso-ruta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Aviso de pago de DeUna — QA (pruebas, sin dinero real). URL para DeUna QA:
// https://staff.supertiendageek.com/api/webhooks/deuna-qa
// Apagado hasta DEUNA_QA_AVISOS_ACTIVO=1 (y la clave DEUNA_QA_WEBHOOK_SECRET, distinta de la de producción).
// Solo toca cobros QA, que solo existen en cuentas «Es prueba».
export async function POST(req: Request) {
  return manejarAvisoDeUna(req, "Prueba");
}
