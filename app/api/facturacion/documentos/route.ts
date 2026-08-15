import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { listarDocumentos }          from "@/lib/facturacion/documentos/listar";
import type { GrupoVista }           from "@/lib/facturacion/documentos/tipos";

export const dynamic = "force-dynamic";

// GET /api/facturacion/documentos?grupo=ventas|proformas|nc&q=...&pruebas=1
// Listado unificado para la pantalla única. Cuando q está presente, el buscador
// es universal (nombre, cédula/RUC, correo, número) y trasciende el grupo.
// ?pruebas=1 muestra también los documentos de ambiente PRUEBAS — ocultos por
// defecto porque no son ventas reales.
export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const params = new URL(request.url).searchParams;
  const grupoRaw = params.get("grupo") ?? "ventas";
  const grupo: GrupoVista = grupoRaw === "proformas" || grupoRaw === "nc" ? grupoRaw : "ventas";
  const q = params.get("q") ?? undefined;
  const incluirPruebas = params.get("pruebas") === "1";

  try {
    const data = await listarDocumentos({ grupo, q, incluirPruebas });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[/api/facturacion/documentos GET]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al listar documentos" },
      { status: 500 }
    );
  }
}
