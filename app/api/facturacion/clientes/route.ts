import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { buscarClientes, createCliente, CedulaEnUsoError } from "@/lib/tecnicos/airtable/index";
import { validarIdentificacion } from "@/lib/facturacion/reglas/identificacion";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  try {
    const data = await buscarClientes({ q, pageSize: 8 });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[/api/facturacion/clientes GET]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error buscando clientes" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nombre   = String(body.nombre   ?? "").trim();
  const cedula   = String(body.cedula   ?? "").trim();
  const telefono = String(body.telefono ?? "").trim() || undefined;
  const correo   = String(body.correo   ?? "").trim() || undefined;
  const direccion= String(body.direccion ?? "").trim() || undefined;
  const tipoId   = String(body.tipoIdentificacion ?? "").trim();

  if (!nombre) {
    return NextResponse.json({ success: false, error: "Nombre requerido" }, { status: 400 });
  }

  // La ficha del cliente se valida al guardarse, no solo al facturar: si se
  // guarda mal, el problema reaparece más tarde con una factura delante. El
  // navegador ya avisó; esto es lo que no se puede saltar.
  if (cedula) {
    const errId = validarIdentificacion(tipoId, cedula);
    if (errId) return NextResponse.json({ success: false, error: errId }, { status: 400 });
  }

  try {
    const data = await createCliente({ nombre, cedula: cedula || null, tipoIdentificacion: tipoId || null, telefono: telefono ?? null, correo: correo ?? null, direccion: direccion ?? null });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    // Cédula ya registrada: devolvemos el cliente existente para que el modal
    // ofrezca usarlo en vez de crear un duplicado.
    if (e instanceof CedulaEnUsoError) {
      return NextResponse.json({ success: false, error: e.message, clienteExistente: e.clienteExistente }, { status: 409 });
    }
    console.error("[/api/facturacion/clientes POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error creando cliente" }, { status: 400 });
  }
}
