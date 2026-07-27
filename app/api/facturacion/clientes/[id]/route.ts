import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { fetchClienteById, updateClienteById } from "@/lib/tecnicos/airtable/index";

export const dynamic = "force-dynamic";

// GET /api/facturacion/clientes/[id] — detalle completo (para el modal de editar).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;
  const { id } = await params;
  try {
    const c = await fetchClienteById(id);
    if (!c) return NextResponse.json({ success: false, error: "Cliente no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data: { id: c.id, nombre: c.nombre, cedula: c.cedula, telefono: c.telefono, correo: c.correo, direccion: c.direccion, notas: c.notas ?? "" } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al cargar el cliente" }, { status: 500 });
  }
}

// PATCH /api/facturacion/clientes/[id] — actualizar la ficha. El modal envía TODOS
// los campos (incluida la nota original) para no borrar nada.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;
  const { id } = await params;

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nombre = String(b.nombre ?? "").trim();
  if (!nombre) return NextResponse.json({ success: false, error: "Nombre requerido" }, { status: 400 });

  try {
    const c = await updateClienteById(id, {
      nombre,
      cedula:    String(b.cedula ?? "").trim() || null,
      telefono:  String(b.telefono ?? "").trim() || null,
      correo:    String(b.correo ?? "").trim() || null,
      direccion: String(b.direccion ?? "").trim() || null,
      notas:     String(b.notas ?? "").trim() || null,
    });
    return NextResponse.json({ success: true, data: { id: c.id, nombre: c.nombre, cedula: c.cedula, telefono: c.telefono, correo: c.correo, direccion: c.direccion } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al actualizar el cliente" }, { status: 400 });
  }
}
