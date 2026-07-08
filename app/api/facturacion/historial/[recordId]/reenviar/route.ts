import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura, actualizarEstadoCorreo } from "@/lib/facturacion/airtable/facturas";
import { enviarRide }                from "@/lib/facturacion/correo/enviarRide";
import { directorioBaseFacturas }    from "@/lib/facturacion/almacenamiento/directorioFacturas";
import fs                            from "fs";
import path                          from "path";

export const dynamic    = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ recordId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { recordId } = await params;
  const factura = await obtenerFactura(recordId);

  if (!factura) {
    return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });
  }
  if (factura.estado !== "AUTORIZADO") {
    return NextResponse.json(
      { success: false, error: "Solo se puede reenviar el correo de facturas AUTORIZADAS" },
      { status: 400 }
    );
  }
  if (!factura.clienteCorreo) {
    return NextResponse.json(
      { success: false, error: "Esta factura no tiene correo registrado para el cliente" },
      { status: 400 }
    );
  }

  // Leer archivos desde disco
  const ambiente = factura.ambiente === "PRODUCCIÓN" ? "2" : "1";
  const añoMes   = factura.fechaEmision.slice(0, 7).replace("-", "/");
  const dir      = path.join(directorioBaseFacturas(), añoMes.replace("/", "/"));

  const xmlPath = path.join(directorioBaseFacturas(),
    factura.fechaEmision.slice(0, 4),
    factura.fechaEmision.slice(5, 7),
    `${factura.claveAcceso}.xml`
  );
  const pdfPath = xmlPath.replace(".xml", ".pdf");

  let xmlBuffer: Buffer;
  let pdfBuffer: Buffer;
  try {
    xmlBuffer = fs.readFileSync(xmlPath);
    pdfBuffer = fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath) : Buffer.alloc(0);
  } catch {
    return NextResponse.json(
      { success: false, error: "No se encontraron los archivos en disco para reenviar" },
      { status: 404 }
    );
  }

  try {
    await enviarRide({
      destinatario:    factura.clienteCorreo,
      nombreComprador: factura.clienteNombre,
      numeroFactura:   factura.numeroFactura,
      fechaEmision:    new Date(factura.fechaEmision),
      ambiente,
      xmlBuffer,
      pdfBuffer,
      claveAcceso:     factura.claveAcceso,
    });
    await actualizarEstadoCorreo(recordId, "ENVIADO").catch(() => {});
    return NextResponse.json({ success: true });
  } catch (e) {
    await actualizarEstadoCorreo(recordId, "ERROR").catch(() => {});
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al reenviar correo" },
      { status: 500 }
    );
  }
}
