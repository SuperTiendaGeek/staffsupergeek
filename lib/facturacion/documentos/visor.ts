import "server-only";

// Lectura de UN documento para el visor de documentos (factura, recibo,
// proforma, nota de crédito y reserva), con su encabezado, cliente, ítems,
// totales, datos propios del tipo y enlaces. Solo LEE.

import { obtenerFactura } from "@/lib/facturacion/airtable/facturas";
import { obtenerReciboPorId } from "@/lib/facturacion/recibos/airtable";
import { obtenerProformaPorId } from "@/lib/facturacion/proformas/airtable";
import { obtenerNotaCreditoPorId } from "@/lib/facturacion/notaCredito/airtable";
import { obtenerReservaPorId } from "@/lib/facturacion/reservas/airtable";
import { parsearLineasFactura } from "@/lib/facturacion/print/lineasFactura";
import { calcularTotalesProforma } from "@/lib/facturacion/proformas/calculos";
import type { LineaProforma } from "@/lib/facturacion/proformas/types";
import { resolverTelefono } from "./detalle";
import type { ItemDetalle } from "./tipos";
import { estadoTexto, formaPagoTexto, tonoEstado, type DocumentoVisor, type TipoVisor } from "./visor-tipos";

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const TARIFA_PCT: Record<string, number> = { "4": 15, "2": 0, "1": 0, "0": 0 };
// Mismo formato que la pantalla: "20 oct 2026" y "$1.234,50".
const dia = (v: string) => {
  if (!v) return "";
  const d = new Date(v.length === 10 ? `${v}T12:00:00-05:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Guayaquil" }).replace(".", "");
};
const dinero = (n: number) => `$${r2(n).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function base(tipo: TipoVisor, recordId: string): DocumentoVisor {
  return {
    tipo, recordId, numero: "", fecha: "", estado: "", estadoCrudo: "", tono: "neutro", ambiente: "",
    cliente: { nombre: "", identificacion: "", correo: "", telefono: "" },
    items: [], mostrarIva: false, subtotal: null, iva: null, total: 0,
    datos: [], relacionados: [], abonos: [], claveAcceso: "", enlaces: [],
    tieneXml: false, tieneRide: false, tienePdf: false, numeroDocModificado: "",
  };
}

function conEstado(d: DocumentoVisor, estado: string): DocumentoVisor {
  d.estadoCrudo = estado;
  d.estado = estadoTexto(d.tipo, estado);
  d.tono = tonoEstado(estado);
  return d;
}

export async function obtenerDocumentoVisor(tipo: TipoVisor, recordId: string, opciones: { facturacion: boolean }): Promise<DocumentoVisor | null> {
  const id = encodeURIComponent(recordId);

  if (tipo === "factura") {
    const f = await obtenerFactura(recordId);
    if (!f) return null;
    const { items, formaPago } = parsearLineasFactura(f.lineasJson);
    const d = conEstado(base(tipo, recordId), f.estado);
    d.numero = f.numeroFactura;
    d.fecha = f.fechaEmision;
    d.ambiente = f.ambiente;
    d.cliente = { nombre: f.clienteNombre, identificacion: f.clienteIdentificacion, correo: f.clienteCorreo, telefono: await resolverTelefono(f.clienteIdentificacion) };
    d.items = items;
    d.mostrarIva = true;
    d.subtotal = f.subtotal;
    d.iva = f.iva;
    d.total = f.total;
    if (formaPago) d.datos.push({ etiqueta: "Pago", valor: formaPagoTexto(formaPago) });
    d.claveAcceso = f.claveAcceso;
    d.tieneXml = f.tieneXml;
    d.tieneRide = f.tieneRide;
    d.tienePdf = f.tieneRide;
    if (opciones.facturacion) {
      d.enlaces.push({ etiqueta: "Imprimir", href: `/facturacion/imprimir/factura/${id}` });
      if (f.tieneRide && f.claveAcceso) d.enlaces.push({ etiqueta: "RIDE", href: `/api/facturacion/ride/${f.claveAcceso}` });
      if (f.tieneXml && f.claveAcceso) d.enlaces.push({ etiqueta: "XML", href: `/api/facturacion/xml/${f.claveAcceso}`, descarga: `${f.claveAcceso}.xml` });
    }
    return d;
  }

  if (tipo === "recibo") {
    const rec = await obtenerReciboPorId(recordId);
    if (!rec) return null;
    const d = conEstado(base(tipo, recordId), rec.estado);
    d.numero = rec.numero;
    d.fecha = rec.fecha;
    d.cliente = { nombre: rec.clienteNombre, identificacion: rec.clienteIdentificacion, correo: "", telefono: await resolverTelefono(rec.clienteIdentificacion) };
    d.items = rec.lineas.map((l): ItemDetalle => ({
      codigo: l.codigo ?? "", descripcion: l.descripcion, cantidad: l.cantidad ?? 0, precioUnitario: l.precioUnitario ?? 0,
      descuento: l.descuento ?? 0, ivaPct: 0, total: r2((l.cantidad ?? 0) * (l.precioUnitario ?? 0) - (l.descuento ?? 0)),
    }));
    d.total = rec.total;
    d.datos.push({ etiqueta: "Pago", valor: formaPagoTexto(rec.formaPago) });
    if (rec.origen) d.datos.push({ etiqueta: "Origen", valor: rec.origen.tipo === "orden" ? "Orden de reparación" : "Pedido de Operaciones" });
    if (rec.nota) d.datos.push({ etiqueta: "Nota", valor: rec.nota });
    d.tienePdf = Boolean(rec.pdfUrl);
    if (opciones.facturacion) {
      d.enlaces.push({ etiqueta: "Imprimir", href: `/facturacion/imprimir/recibo/${id}` });
      if (rec.pdfUrl) d.enlaces.push({ etiqueta: "PDF", href: `/api/facturacion/recibos/${id}/pdf` });
    }
    return d;
  }

  if (tipo === "proforma") {
    const p = await obtenerProformaPorId(recordId);
    if (!p) return null;
    let lineas: LineaProforma[] = [];
    let nota = "";
    let validezDias: number | null = null;
    const cliente = { nombre: "", identificacion: "", correo: "", telefono: "" };
    try {
      const parsed = JSON.parse(p.lineasJson || "{}");
      lineas = Array.isArray(parsed?.lineas) ? parsed.lineas : [];
      nota = typeof parsed?.nota === "string" ? parsed.nota : "";
      validezDias = typeof parsed?.validezDias === "number" ? parsed.validezDias : null;
      const c = parsed?.cliente;
      if (c && typeof c === "object") {
        cliente.nombre = typeof c.razonSocial === "string" ? c.razonSocial : "";
        cliente.identificacion = typeof c.identificacion === "string" ? c.identificacion : "";
        cliente.correo = typeof c.correo === "string" ? c.correo : "";
      }
    } catch { /* ignore */ }
    const tot = calcularTotalesProforma(lineas);
    const d = conEstado(base(tipo, recordId), p.estado);
    d.numero = p.numero;
    d.fecha = p.fecha;
    cliente.telefono = await resolverTelefono(cliente.identificacion);
    d.cliente = cliente;
    d.items = lineas.map((l): ItemDetalle => ({
      codigo: l.codigo ?? "", descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario,
      descuento: l.descuento, ivaPct: TARIFA_PCT[l.tarifaIva] ?? 0, total: r2(l.cantidad * l.precioUnitario - l.descuento),
    }));
    d.mostrarIva = true;
    d.subtotal = tot.totalSinImpuestos;
    d.iva = tot.iva;
    d.total = tot.importeTotal;
    if (validezDias !== null) d.datos.push({ etiqueta: "Validez", valor: `${validezDias} días` });
    if (nota) d.datos.push({ etiqueta: "Nota", valor: nota });
    d.tienePdf = Boolean(p.pdfUrl);
    if (opciones.facturacion && p.pdfUrl) d.enlaces.push({ etiqueta: "PDF", href: `/api/facturacion/proformas/${id}/pdf` });
    return d;
  }

  if (tipo === "notaCredito") {
    const nc = await obtenerNotaCreditoPorId(recordId);
    if (!nc) return null;
    const { items } = parsearLineasFactura(nc.lineasJson);
    const d = conEstado(base(tipo, recordId), nc.estado);
    d.numero = nc.numeroNotaCredito;
    d.fecha = nc.fechaEmision || nc.fechaAutorizacion;
    d.ambiente = nc.ambiente ?? "";
    d.cliente = { nombre: nc.clienteNombre, identificacion: nc.clienteIdentificacion, correo: nc.clienteCorreo, telefono: await resolverTelefono(nc.clienteIdentificacion) };
    d.items = items;
    d.mostrarIva = true;
    d.subtotal = r2(items.reduce((s, it) => s + it.total, 0));
    d.iva = r2(items.reduce((s, it) => s + it.total * (it.ivaPct / 100), 0));
    d.total = nc.total;
    if (nc.motivo) d.datos.push({ etiqueta: "Motivo", valor: nc.motivo });
    d.datos.push({ etiqueta: "Crédito", valor: dinero(nc.saldoDisponible) });
    if (nc.fechaCaducidad) d.datos.push({ etiqueta: "Caduca", valor: dia(nc.fechaCaducidad) });
    d.numeroDocModificado = nc.numeroFacturaModificada ?? "";
    if (nc.facturaRecordId) d.relacionados.push({ etiqueta: "Corrige", tipo: "factura", recordId: nc.facturaRecordId, numero: nc.numeroFacturaModificada || "Factura" });
    else if (nc.numeroFacturaModificada) d.datos.push({ etiqueta: "Corrige", valor: nc.numeroFacturaModificada });
    d.claveAcceso = nc.claveAcceso ?? "";
    d.tieneXml = nc.tieneXml === true;
    d.tieneRide = nc.tieneRide === true;
    d.tienePdf = d.tieneRide;
    if (opciones.facturacion && d.claveAcceso) {
      if (d.tieneRide) d.enlaces.push({ etiqueta: "RIDE", href: `/api/facturacion/nota-credito/ride/${d.claveAcceso}` });
      if (d.tieneXml) d.enlaces.push({ etiqueta: "XML", href: `/api/facturacion/nota-credito/xml/${d.claveAcceso}`, descarga: `${d.claveAcceso}.xml` });
    }
    return d;
  }

  // reserva
  const r = await obtenerReservaPorId(recordId);
  if (!r) return null;
  const d = conEstado(base("reserva", recordId), r.estado);
  d.numero = r.numero;
  d.fecha = r.fecha;
  d.cliente = { nombre: r.cliente.razonSocial, identificacion: r.cliente.identificacion ?? "", correo: r.cliente.correo ?? "", telefono: r.cliente.telefono ?? "" };
  d.items = [{ codigo: "", descripcion: r.descripcionItem, cantidad: 1, precioUnitario: r.precio, descuento: 0, ivaPct: 0, total: r.precio }];
  d.total = r.precio;
  d.datos.push({ etiqueta: "Abonado", valor: dinero(r.totalAbonado) });
  d.datos.push({ etiqueta: "Saldo", valor: dinero(Math.max(0, r.precio - r.totalAbonado)) });
  if (r.fechaLimite) d.datos.push({ etiqueta: "Vence", valor: `${dia(r.fechaLimite)}${r.plazoDias ? ` (${r.plazoDias} días)` : ""}` });
  if (r.saldoAFavor) d.datos.push({ etiqueta: "A favor", valor: dinero(r.saldoAFavor) });
  d.abonos = r.abonos.map((a) => ({ fecha: a.fecha, monto: a.monto, formaPago: formaPagoTexto(a.formaPago) }));
  if (r.facturaRecordId) {
    const f = await obtenerFactura(r.facturaRecordId).catch(() => null);
    d.relacionados.push({ etiqueta: "Facturada", tipo: "factura", recordId: r.facturaRecordId, numero: f?.numeroFactura || "Factura" });
  }
  d.tienePdf = r.tienePdf;
  if (opciones.facturacion) {
    d.enlaces.push({ etiqueta: "Imprimir", href: `/facturacion/imprimir/reserva/${id}` });
    if (r.tienePdf) d.enlaces.push({ etiqueta: "PDF", href: `/api/facturacion/reservas/${id}/pdf` });
  }
  return d;
}
