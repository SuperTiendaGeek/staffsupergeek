import { NextResponse } from "next/server";
import {
  canShippingV2,
  getShippingV2AccessContextForSession,
  guardarShippingV2InspeccionTecnica,
  type ShippingV2InspeccionCambios,
} from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { ResultadoPunto } from "@/lib/shipping-v2/revision-tecnica";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const RESULTADOS = new Set(["ok", "falla", "na"]);

function listaDeIds(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/**
 * Traduce el cuerpo de la petición a cambios válidos.
 *
 * Descarta lo que no entiende en vez de fallar: este endpoint es el
 * autoguardado de la pantalla y se llama muchas veces. Un campo raro no puede
 * tumbar el guardado de los otros treinta.
 */
function parsearCambios(body: Record<string, unknown>): ShippingV2InspeccionCambios {
  const cambios: ShippingV2InspeccionCambios = {};

  if (Array.isArray(body.puntos)) {
    cambios.puntos = body.puntos
      .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
      .map((p) => {
        const puntoId = typeof p.puntoId === "string" ? p.puntoId.trim() : "";
        const bruto = typeof p.resultado === "string" ? p.resultado : null;
        const resultado = bruto && RESULTADOS.has(bruto) ? (bruto as ResultadoPunto) : null;
        return { puntoId, resultado };
      })
      .filter((p) => p.puntoId.length > 0);
  }

  if (Array.isArray(body.observaciones)) {
    cambios.observaciones = body.observaciones
      .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object")
      .map((o) => ({
        zonaId: typeof o.zonaId === "string" ? o.zonaId.trim() : "",
        nota: typeof o.nota === "string" ? o.nota : "",
      }))
      .filter((o) => o.zonaId.length > 0);
  }

  if (body.equipamiento && typeof body.equipamiento === "object") {
    const eq = body.equipamiento as Record<string, unknown>;
    cambios.equipamiento = {
      conectividadIds: listaDeIds(eq.conectividadIds),
      puertosIds: listaDeIds(eq.puertosIds),
      extrasIds: listaDeIds(eq.extrasIds),
      confirmar: eq.confirmar === true,
    };
  }

  if (body.ficha && typeof body.ficha === "object" && !Array.isArray(body.ficha)) {
    // Los valores los valida `updateShippingV2ItemTechnicalSheet`, que descarta
    // opciones que no existen en el select de Airtable.
    cambios.ficha = body.ficha as ShippingV2InspeccionCambios["ficha"];
  }

  return cambios;
}

export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canUseRecepcion")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para usar Recepción." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const cambios = parsearCambios(body);

    const resultado = await guardarShippingV2InspeccionTecnica(id, cambios, {
      actor: getShippingV2SessionName(session),
      access,
    });

    return NextResponse.json({
      success: true,
      data: {
        item: resultado.item,
        snapshot: resultado.snapshot,
        zonas: resultado.zonas,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("Error al guardar la inspección técnica:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}
