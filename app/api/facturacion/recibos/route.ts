import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { crearRecibo, adjuntarPdfRecibo, listarRecibos } from "@/lib/facturacion/recibos/airtable";
import { descontarInventarioRecibo, registrarIngresoRecibo } from "@/lib/facturacion/recibos/efectos";
import { generarReciboPdf }          from "@/lib/facturacion/recibos/pdf";
import { verificarStockDisponible, mensajeFaltantes } from "@/lib/facturacion/reglas/stock";
import { mensajePrecioShippingItemInvalido } from "@/lib/facturacion/reglas/preciosShippingItems";
import { getFacturacionConfig }      from "@/lib/facturacion/config";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";
import type { CrearReciboInput }     from "@/lib/facturacion/recibos/types";
import type { DetalleFactura }       from "@/lib/facturacion/types/factura";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

// GET — listado
export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;
  const q = new URL(request.url).searchParams;
  try {
    const data = await listarRecibos({ cliente: q.get("cliente")?.trim() || undefined, numero: q.get("numero")?.trim() || undefined, estado: q.get("estado")?.trim() || undefined });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al listar recibos" }, { status: 500 });
  }
}

// POST — crear (verifica stock, guarda, PDF, descuenta inventario, registra ingreso)
export async function POST(request: Request) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  let body: CrearReciboInput;
  try { body = (await request.json()) as CrearReciboInput; }
  catch { return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 }); }

  if (!body.cliente?.razonSocial?.trim()) return NextResponse.json({ success: false, error: "Falta el nombre del cliente" }, { status: 400 });
  if (!Array.isArray(body.lineas) || body.lineas.length === 0) return NextResponse.json({ success: false, error: "Agrega al menos una línea" }, { status: 400 });
  if (body.lineas.some((l) => !l.descripcion?.trim())) return NextResponse.json({ success: false, error: "Todas las líneas deben tener descripción" }, { status: 400 });
  if (body.lineas.some((l) => !(l.cantidad > 0) || !Number.isInteger(l.cantidad) || l.precioUnitario < 0)) return NextResponse.json({ success: false, error: "Cantidad entera > 0 y precio ≥ 0 en todas las líneas" }, { status: 400 });
  const errorPrecioShipping = mensajePrecioShippingItemInvalido(body.lineas);
  if (errorPrecioShipping) return NextResponse.json({ success: false, error: errorPrecioShipping }, { status: 400 });
  if (!body.formaPago?.trim()) return NextResponse.json({ success: false, error: "Elige una forma de pago" }, { status: 400 });

  // Verificar stock (como una factura) — bloquea antes de crear el recibo.
  const detallesParaStock: DetalleFactura[] = body.lineas
    .filter((l) => !!l.shippingItemId)
    .map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento, precioTotalSinImpuesto: 0, impuestos: [], tipo: "producto", shippingItemId: l.shippingItemId }));
  try {
    const faltantes = await verificarStockDisponible(detallesParaStock);
    if (faltantes.length > 0) return NextResponse.json({ success: false, error: mensajeFaltantes(faltantes) }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, error: "No se pudo verificar el stock. Intenta de nuevo." }, { status: 503 });
  }

  try {
    const { recordId, numero, total } = await crearRecibo(body);
    const cfg = getFacturacionConfig();

    // PDF best-effort.
    try {
      const pdf = await generarReciboPdf({ numero, fecha: ahoraEnEcuador(), ruc: cfg.ruc, razonSocial: cfg.razonSocial, nombreComercial: cfg.nombreComercial, dirMatriz: cfg.dirMatriz, cliente: body.cliente, lineas: body.lineas, formaPago: body.formaPago, nota: body.nota });
      await adjuntarPdfRecibo(recordId, `${numero}.pdf`, Buffer.from(pdf).toString("base64"));
    } catch (e) { console.error("[recibos POST] PDF no generado:", e); }

    // Efectos (guardados a producción por su ambiente). Best-effort cada uno.
    try { await descontarInventarioRecibo({ reciboRecordId: recordId, numeroRecibo: numero, lineas: body.lineas, ambiente: cfg.ambiente }); }
    catch (e) { console.error("[recibos POST] inventario:", e); }
    try { await registrarIngresoRecibo({ reciboRecordId: recordId, numeroRecibo: numero, total, formaPago: body.formaPago, clienteRecordId: body.cliente.airtableId, registradoPor: session.user.nombre || session.user.email || "Portal", ambiente: cfg.ambiente }); }
    catch (e) { console.error("[recibos POST] contable:", e); }

    return NextResponse.json({ success: true, data: { recordId, numero, total } });
  } catch (e) {
    console.error("[recibos POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al crear el recibo" }, { status: 500 });
  }
}
