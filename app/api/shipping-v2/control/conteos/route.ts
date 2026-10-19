import { NextResponse } from "next/server";
import { crearConteoShippingV2, getShippingV2Conteos, getShippingV2ResumenParaConteo } from "@/lib/shipping-v2/airtable";
import { accesoControl, errorJson } from "../acceso";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Punto 10c-2: conteos físicos (lista y nuevo).
export async function GET() {
  const a = await accesoControl();
  if (a.response) return a.response;
  try {
    const [conteos, resumen] = await Promise.all([getShippingV2Conteos(), getShippingV2ResumenParaConteo()]);
    return NextResponse.json({ success: true, data: { conteos, resumen } });
  } catch (error) {
    return errorJson(error, "Error al leer los conteos:");
  }
}

export async function POST(request: Request) {
  const a = await accesoControl();
  if (a.response) return a.response;
  try {
    const body = await request.json().catch(() => ({}));
    const conteo = await crearConteoShippingV2(
      {
        nombre: String(body.nombre ?? "").slice(0, 120),
        categorias: Array.isArray(body.categorias) ? body.categorias.map(String).slice(0, 40) : [],
        incluyeActivos: body.incluyeActivos === true,
      },
      { actor: a.actor }
    );
    return NextResponse.json({ success: true, data: { ...conteo, foto: null } });
  } catch (error) {
    return errorJson(error, "Error al crear el conteo:");
  }
}
