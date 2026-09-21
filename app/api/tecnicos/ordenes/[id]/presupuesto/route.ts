import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { listarLineas, crearLinea } from "@/lib/tecnicos/presupuesto/airtable";
import { validarLinea, estadoPresupuesto, totalesPresupuesto, type NuevaLineaInput } from "@/lib/tecnicos/presupuesto/reglas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET  /api/tecnicos/ordenes/[id]/presupuesto — líneas + estado + totales
// POST /api/tecnicos/ordenes/[id]/presupuesto — agrega una línea Propuesta
//
// Armar el presupuesto NO toca inventario ni la cuenta de la orden: las
// líneas son solo una propuesta hasta que se aprueban y cargan (ver
// lib/tecnicos/presupuesto/cargar.ts).
export async function GET(_req: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    const lineas = await listarLineas(id);
    return NextResponse.json({ success: true, data: { lineas, estado: estadoPresupuesto(lineas), totales: totalesPresupuesto(lineas) } });
  } catch (e) {
    console.error("[presupuesto GET]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo leer el presupuesto" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  const { id } = await params;

  let body: NuevaLineaInput;
  try { body = (await request.json()) as NuevaLineaInput; }
  catch { return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 }); }

  const input: NuevaLineaInput = {
    tipo: body.tipo,
    descripcion: String(body.descripcion ?? ""),
    cantidad: Number(body.cantidad),
    precioUnitario: Number(body.precioUnitario),
    servicioCatalogoId: body.servicioCatalogoId || null,
    itemId: body.itemId || null,
    productoCatalogoId: body.productoCatalogoId || null,
  };
  const error = validarLinea(input);
  if (error) return NextResponse.json({ success: false, error }, { status: 400 });

  try {
    const linea = await crearLinea(id, input, session.user.nombre || session.user.email || "Portal");
    return NextResponse.json({ success: true, data: linea }, { status: 201 });
  } catch (e) {
    console.error("[presupuesto POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo agregar la línea" }, { status: 500 });
  }
}
