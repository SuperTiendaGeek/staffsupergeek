import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import fs   from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// Sirve el RIDE PDF desde disco.
// La clave de acceso de 49 dígitos tiene la fecha de emisión en los primeros 8 dígitos (DDMMAAAA).
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

  // Extraer fecha del comprobante: posiciones 0-7 → DDMMAAAA
  const dd   = claveAcceso.slice(0, 2);
  const mm   = claveAcceso.slice(2, 4);
  const aaaa = claveAcceso.slice(4, 8);

  const base   = process.env.FACTURAS_DIR?.trim() || "facturas-autorizadas";
  const pdfPath = path.join(process.cwd(), base, aaaa, mm, `${claveAcceso}.pdf`);

  if (!fs.existsSync(pdfPath)) {
    // Fallback: buscar en todos los meses del año (por si hay diferencia de timezone)
    const yearDir = path.join(process.cwd(), base, aaaa);
    let found: string | null = null;
    if (fs.existsSync(yearDir)) {
      for (const monthDir of fs.readdirSync(yearDir)) {
        const candidate = path.join(yearDir, monthDir, `${claveAcceso}.pdf`);
        if (fs.existsSync(candidate)) { found = candidate; break; }
      }
    }
    if (!found) {
      void dd; // suppress unused warning
      return NextResponse.json({ error: "RIDE no encontrado en disco" }, { status: 404 });
    }
    const buf = fs.readFileSync(found);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${claveAcceso}.pdf"`,
      },
    });
  }

  const buf = fs.readFileSync(pdfPath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${claveAcceso}.pdf"`,
    },
  });
}
