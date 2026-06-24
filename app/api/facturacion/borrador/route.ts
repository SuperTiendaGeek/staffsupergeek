import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { crearBorrador }             from "@/lib/facturacion/airtable/facturas";
import { getFacturacionConfig }      from "@/lib/facturacion/config";
import type { BorradorInput }        from "@/lib/facturacion/airtable/facturas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  let body: {
    clienteNombre:         string;
    clienteIdentificacion: string;
    clienteCorreo?:        string;
    subtotal:              number;
    iva:                   number;
    total:                 number;
    lineasJson:            string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.lineasJson) {
    return NextResponse.json({ success: false, error: "lineasJson requerido" }, { status: 400 });
  }

  const cfg = getFacturacionConfig();

  const input: BorradorInput = {
    ambiente:              cfg.ambiente,
    clienteNombre:         body.clienteNombre || "Sin nombre",
    clienteIdentificacion: body.clienteIdentificacion || "9999999999999",
    clienteCorreo:         body.clienteCorreo,
    subtotal:              body.subtotal ?? 0,
    iva:                   body.iva      ?? 0,
    total:                 body.total    ?? 0,
    lineasJson:            body.lineasJson,
  };

  try {
    const recordId = await crearBorrador(input);
    return NextResponse.json({ success: true, data: { recordId } });
  } catch (e) {
    console.error("[/api/facturacion/borrador POST]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al guardar borrador" },
      { status: 500 }
    );
  }
}
