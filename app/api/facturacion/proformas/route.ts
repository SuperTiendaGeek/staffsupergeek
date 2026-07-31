import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { crearProforma, adjuntarPdfProforma, listarProformas } from "@/lib/facturacion/proformas/airtable";
import { generarProformaPdf }        from "@/lib/facturacion/proformas/pdf";
import { getFacturacionConfig }      from "@/lib/facturacion/config";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";
import { validarLineasProformaShippingItems } from "@/lib/facturacion/proformas/preciosShippingItems";
import type { CrearProformaInput }   from "@/lib/facturacion/proformas/types";

export const dynamic = "force-dynamic";

// GET /api/facturacion/proformas — listado
export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;
  const q = new URL(request.url).searchParams;
  try {
    const data = await listarProformas({
      cliente: q.get("cliente")?.trim() || undefined,
      numero:  q.get("numero")?.trim() || undefined,
      estado:  q.get("estado")?.trim() || undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[/api/facturacion/proformas GET]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al listar proformas" }, { status: 500 });
  }
}

// POST /api/facturacion/proformas — crear (guarda + genera PDF, best-effort el PDF)
export async function POST(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  let body: CrearProformaInput;
  try { body = (await request.json()) as CrearProformaInput; }
  catch { return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 }); }

  if (!body.cliente?.razonSocial?.trim()) return NextResponse.json({ success: false, error: "Falta el nombre del cliente" }, { status: 400 });
  if (!Array.isArray(body.lineas) || body.lineas.length === 0) return NextResponse.json({ success: false, error: "Agrega al menos una línea" }, { status: 400 });
  if (body.lineas.some((l) => !l.descripcion?.trim())) return NextResponse.json({ success: false, error: "Todas las líneas deben tener descripción" }, { status: 400 });
  if (body.lineas.some((l) => !(l.cantidad > 0) || l.precioUnitario < 0)) return NextResponse.json({ success: false, error: "Cantidad > 0 y precio ≥ 0 en todas las líneas" }, { status: 400 });

  try {
    const errorShippingItems = await validarLineasProformaShippingItems(body.lineas);
    if (errorShippingItems) {
      return NextResponse.json({ success: false, error: errorShippingItems }, { status: 400 });
    }

    const { recordId, numero } = await crearProforma(body);

    // PDF best-effort — la proforma ya quedó guardada aunque el PDF falle.
    try {
      const cfg = getFacturacionConfig();
      const pdf = await generarProformaPdf({
        numero, fecha: ahoraEnEcuador(),
        ruc: cfg.ruc, razonSocial: cfg.razonSocial, nombreComercial: cfg.nombreComercial, dirMatriz: cfg.dirMatriz,
        cliente: body.cliente, lineas: body.lineas, nota: body.nota, validezDias: body.validezDias ?? null,
      });
      await adjuntarPdfProforma(recordId, `${numero}.pdf`, Buffer.from(pdf).toString("base64"));
    } catch (e) {
      console.error("[/api/facturacion/proformas POST] PDF no generado:", e);
    }

    return NextResponse.json({ success: true, data: { recordId, numero } });
  } catch (e) {
    console.error("[/api/facturacion/proformas POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al crear la proforma" }, { status: 500 });
  }
}
