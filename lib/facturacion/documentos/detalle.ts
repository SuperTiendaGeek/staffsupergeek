import "server-only";

// Cuerpo de un documento para el visualizador flotante. El encabezado (número,
// fecha, cliente, estado, badges de acción) ya lo tiene el cliente en el
// DocumentoResumen del listado; esto agrega lo que falta para "ver el detalle
// sin abrir el PDF": los ítems, el desglose y la forma de pago. Solo LEE.

import { obtenerFactura }         from "@/lib/facturacion/airtable/facturas";
import { obtenerReciboPorId }     from "@/lib/facturacion/recibos/airtable";
import { obtenerProformaPorId }   from "@/lib/facturacion/proformas/airtable";
import { obtenerNotaCreditoPorId } from "@/lib/facturacion/notaCredito/airtable";
import { parsearLineasFactura }   from "@/lib/facturacion/print/lineasFactura";
import { calcularTotalesProforma } from "@/lib/facturacion/proformas/calculos";
import { buscarClientes }         from "@/lib/tecnicos/airtable/index";
import type { LineaProforma }     from "@/lib/facturacion/proformas/types";
import type { TipoDocumento, ItemDetalle, DocumentoCuerpo } from "./tipos";

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const TARIFA_PCT: Record<string, number> = { "4": 15, "2": 0, "1": 0, "0": 0 };
const soloDigitos = (s: string) => s.replace(/\D/g, "");

// Resuelve el teléfono del cliente desde la tabla Clientes por su cédula/RUC
// (los documentos no guardan el teléfono, solo el vínculo al cliente). Devuelve
// "" para consumidor final o si no se encuentra. Best-effort: nunca lanza.
async function resolverTelefono(identificacion: string): Promise<string> {
  const id = identificacion.trim();
  if (!id || soloDigitos(id) === "9999999999999") return "";
  try {
    const encontrados = await buscarClientes({ q: id, pageSize: 5 });
    const match = encontrados.find((c) => soloDigitos(c.cedula) === soloDigitos(id)) ?? encontrados[0];
    return match?.telefono?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function obtenerCuerpoDocumento(tipo: TipoDocumento, recordId: string): Promise<DocumentoCuerpo | null> {
  if (tipo === "factura") {
    const f = await obtenerFactura(recordId);
    if (!f) return null;
    const { items, formaPago } = parsearLineasFactura(f.lineasJson);
    const clienteTelefono = await resolverTelefono(f.clienteIdentificacion);
    return { mostrarIva: true, items, subtotal: f.subtotal, iva: f.iva, total: f.total, formaPago, nota: "", motivo: "", validezDias: null, clienteTelefono };
  }

  if (tipo === "recibo") {
    const rec = await obtenerReciboPorId(recordId);
    if (!rec) return null;
    const items: ItemDetalle[] = rec.lineas.map((l) => ({
      codigo: l.codigo ?? "", descripcion: l.descripcion, cantidad: l.cantidad ?? 0, precioUnitario: l.precioUnitario ?? 0,
      descuento: l.descuento ?? 0, ivaPct: 0, total: r2((l.cantidad ?? 0) * (l.precioUnitario ?? 0) - (l.descuento ?? 0)),
    }));
    const clienteTelefono = await resolverTelefono(rec.clienteIdentificacion);
    return { mostrarIva: false, items, subtotal: null, iva: null, total: rec.total, formaPago: rec.formaPago, nota: rec.nota, motivo: "", validezDias: null, clienteTelefono };
  }

  if (tipo === "proforma") {
    const p = await obtenerProformaPorId(recordId);
    if (!p) return null;
    let lineas: LineaProforma[] = [];
    let nota = "";
    let validezDias: number | null = null;
    let identificacion = "";
    try {
      const parsed = JSON.parse(p.lineasJson || "{}");
      lineas = Array.isArray(parsed?.lineas) ? parsed.lineas : [];
      nota = typeof parsed?.nota === "string" ? parsed.nota : "";
      validezDias = typeof parsed?.validezDias === "number" ? parsed.validezDias : null;
      if (parsed?.cliente && typeof parsed.cliente.identificacion === "string") identificacion = parsed.cliente.identificacion;
    } catch { /* ignore */ }
    const tot = calcularTotalesProforma(lineas);
    const items: ItemDetalle[] = lineas.map((l) => ({
      codigo: l.codigo ?? "", descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario,
      descuento: l.descuento, ivaPct: TARIFA_PCT[l.tarifaIva] ?? 0, total: r2(l.cantidad * l.precioUnitario - l.descuento),
    }));
    const clienteTelefono = await resolverTelefono(identificacion);
    return { mostrarIva: true, items, subtotal: tot.totalSinImpuestos, iva: tot.iva, total: tot.importeTotal, formaPago: "", nota, motivo: "", validezDias, clienteTelefono };
  }

  // notaCredito
  const nc = await obtenerNotaCreditoPorId(recordId);
  if (!nc) return null;
  const { items } = parsearLineasFactura(nc.lineasJson);
  const subtotal = r2(items.reduce((s, it) => s + it.total, 0));
  const iva = r2(items.reduce((s, it) => s + it.total * (it.ivaPct / 100), 0));
  const clienteTelefono = await resolverTelefono(nc.clienteIdentificacion);
  return { mostrarIva: true, items, subtotal, iva, total: nc.total, formaPago: "", nota: "", motivo: "", validezDias: null, clienteTelefono };
}
