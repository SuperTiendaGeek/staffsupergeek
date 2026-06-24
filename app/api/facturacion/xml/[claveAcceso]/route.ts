import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import fs                            from "fs";
import path                          from "path";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ claveAcceso: string }> };

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

  const baseDir = process.env.FACTURAS_DIR?.trim() || "facturas-autorizadas";
  const xmlPath = path.join(process.cwd(), baseDir, anio, mes, `${claveAcceso}.xml`);

  if (!fs.existsSync(xmlPath)) {
    return NextResponse.json({ error: "XML no encontrado en disco" }, { status: 404 });
  }

  const xml = fs.readFileSync(xmlPath, "utf8");
  return new Response(xml, {
    headers: {
      "Content-Type":        "text/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${claveAcceso}.xml"`,
    },
  });
}
