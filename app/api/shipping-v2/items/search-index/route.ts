import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, getShippingV2ItemSearchIndex } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { isAdministratorRole } from "@/lib/apps";
import { camposConEstado, ocultarCamposDeObjeto } from "@/lib/permissions/campos";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    const index = await getShippingV2ItemSearchIndex(access);

    // Personalización por usuario (Fase 2 de permisos, ver
    // lib/permissions/campos.ts). El índice se cachea compartido entre
    // sesiones (getShippingV2ItemSearchIndex), así que la redacción se aplica
    // aquí, después de leer el caché — nunca dentro de él — para no filtrar
    // el dato real hacia una sesión que no debe verlo. "Cache-Control:
    // private" abajo asegura que esta respuesta ya redactada no se comparte
    // entre navegadores.
    const restringidosDelUsuario = isAdministratorRole(session?.user.rol) ? {} : (session?.user.camposRestringidos ?? {});
    const camposOcultos = camposConEstado(restringidosDelUsuario, "shipping-v2", "items", "oculto");
    const items = camposOcultos.length > 0 ? index.items.map((item) => ocultarCamposDeObjeto(item, camposOcultos)) : index.items;

    return NextResponse.json(
      {
        items,
        total: items.length,
        generatedAt: index.generatedAt,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Error al obtener índice de búsqueda Shipping V2:", error);
    return NextResponse.json(
      { items: [], total: 0, generatedAt: new Date().toISOString(), error: "No se pudo cargar la búsqueda global." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
