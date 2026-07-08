import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { resolverArchivoFactura } from "@/lib/facturacion/almacenamiento/resolverArchivo";

export const dynamic = "force-dynamic";

// Sirve el RIDE PDF: primero desde disco, con fallback al adjunto en
// Airtable si no está ahí (ver resolverArchivoFactura).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ claveAcceso: string }> }
) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { claveAcceso } = await params;

  // Validar formato básico (49 dígitos numéricos)
  if (!/^\d{49}$/.test(claveAcceso)) {
    return NextResponse.json({ error: "Clave de acceso inválida" }, { status: 400 });
  }

  const archivo = await resolverArchivoFactura(claveAcceso, "ride", { escanearAnio: true });

  if (!archivo) {
    return NextResponse.json(
      {
        error:
          "RIDE no encontrado en disco ni en Airtable para esta clave de acceso. " +
          "Si el cliente tiene correo registrado, es posible que la factura ya se le haya enviado por email.",
      },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(archivo.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${claveAcceso}.pdf"`,
    },
  });
}
