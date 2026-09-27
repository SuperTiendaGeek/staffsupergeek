import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { borrarCartel, cartelesDeServicios, guardarCartel } from "@/lib/tecnicos/carteles/airtable";
import { cartelVacio, lineas, validarCartel, type CartelServicio } from "@/lib/tecnicos/carteles/reglas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT    — guarda el cartel del servicio (y opcionalmente lo copia a otros).
// DELETE — borra el cartel del servicio.
// El texto NO vive en el código: se edita desde /tecnicos/catalogo-servicios.
export async function PUT(request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & { aplicarA?: unknown };

  const cartel: CartelServicio = {
    ...cartelVacio(id),
    activo: body.activo === true,
    titulo: String(body.titulo ?? "").slice(0, 200),
    intro: String(body.intro ?? "").slice(0, 2000),
    incluye: lineas(String(body.incluye ?? "")),
    noIncluye: lineas(String(body.noIncluye ?? "")),
    avisos: lineas(String(body.avisos ?? "")),
    consentimiento: String(body.consentimiento ?? "").slice(0, 3000),
    textoBoton: String(body.textoBoton ?? "").slice(0, 60),
  };
  const error = validarCartel(cartel);
  if (error) return NextResponse.json({ success: false, error }, { status: 400 });

  const otros = Array.isArray(body.aplicarA) ? body.aplicarA.filter((x): x is string => typeof x === "string" && x !== id).slice(0, 50) : [];

  try {
    const guardado = await guardarCartel(id, cartel);
    for (const otroId of otros) await guardarCartel(otroId, { ...cartel, servicioId: otroId });
    const copiados = otros.length ? [...(await cartelesDeServicios(otros)).values()] : [];
    return NextResponse.json({ success: true, data: { cartel: guardado, copiados } });
  } catch (e) {
    console.error("[cartel PUT]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo guardar el cartel" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: { cartel: await borrarCartel(id) } });
  } catch (e) {
    console.error("[cartel DELETE]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo borrar el cartel" }, { status: 500 });
  }
}
