import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { getFacturacionConfig }      from "@/lib/facturacion/config";
import { procesarCaducidades }       from "@/lib/finanzas/puentes/notaCreditoCaducidad";

export const dynamic = "force-dynamic";

// POST /api/facturacion/nota-credito/caducidades
//
// Convierte en ingreso el crédito de las notas que vencieron sin usarse.
// Lo dispara el botón "Procesar caducidades" de /facturacion/nota-credito/historial.
//
// No hay cron: SUPER GEEK emite un puñado de notas de crédito al año, y un
// botón que se pulsa al cerrar el mes es menos maquinaria que mantener que una
// tarea programada. El endpoint ya sirve tal cual para colgarlo de un cron de
// Vercel el día que el volumen lo pida.
//
// Es IDEMPOTENTE: pulsarlo dos veces seguidas no anota el ingreso dos veces.
// La segunda vez devuelve cero procesadas. Ver debeCaducar() en
// lib/facturacion/notaCredito/caducidad.ts.
//
// Guardián de ambiente: en pruebas no escribe nada en la contabilidad real.

export async function POST() {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) {
    return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  }

  try {
    const cfg = getFacturacionConfig();
    const resultado = await procesarCaducidades({
      ambiente:      cfg.ambiente,
      registradoPor: session.user.nombre || session.user.email || "Portal",
    });

    return NextResponse.json({ success: true, data: resultado });
  } catch (e) {
    // procesarCaducidades() no lanza, pero si algo se rompiera antes (leer la
    // configuración, por ejemplo) el usuario merece un mensaje y no un 500 mudo.
    console.error("[/api/facturacion/nota-credito/caducidades]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error interno al procesar las caducidades" },
      { status: 500 }
    );
  }
}
