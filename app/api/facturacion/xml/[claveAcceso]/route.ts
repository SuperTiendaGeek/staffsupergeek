import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { resolverArchivoFactura }    from "@/lib/facturacion/almacenamiento/resolverArchivo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ claveAcceso: string }> };

// Sirve el XML autorizado: primero desde disco, con fallback al adjunto en
// Airtable si no está ahí (ver resolverArchivoFactura).
export async function GET(_req: Request, { params }: Params) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { claveAcceso } = await params;

  // Extraer año y mes desde los primeros 8 dígitos de la clave de acceso (DDMMAAAA)
  const dia  = claveAcceso.slice(0, 2);
  const mes  = claveAcceso.slice(2, 4);
  const anio = claveAcceso.slice(4, 8);

  if (!dia || !mes || !anio || anio.length < 4) {
    return NextResponse.json({ error: "Clave de acceso inválida" }, { status: 400 });
  }

  const archivo = await resolverArchivoFactura(claveAcceso, "xml");

  if (!archivo) {
    return NextResponse.json(
      {
        error:
          "XML no encontrado en disco ni en Airtable para esta clave de acceso. " +
          "Si el cliente tiene correo registrado, es posible que la factura ya se le haya enviado por email.",
      },
      { status: 404 }
    );
  }

  return new Response(new Uint8Array(archivo.buffer), {
    headers: {
      "Content-Type":        "text/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${claveAcceso}.xml"`,
    },
  });
}
