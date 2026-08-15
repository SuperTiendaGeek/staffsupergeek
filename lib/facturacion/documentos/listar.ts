import "server-only";

// Combinador de los cuatro listados en un solo DocumentoResumen[] para la
// pantalla única. NO modifica ninguna de las funciones de listado originales
// (facturas está en producción) — solo las invoca y proyecta el resultado.
//
// Dos modos:
//   · Navegar (sin q): trae el grupo pedido (ventas = facturas + recibos,
//     proformas, o notas de crédito) con su paginación normal del servidor.
//   · Buscar (con q): el buscador es UNIVERSAL y trasciende los chips. Trae los
//     registros recientes de las cuatro fuentes en paralelo y filtra en memoria
//     por nombre, cédula/RUC, correo o número — un comportamiento idéntico en
//     todos los campos. Límite actual: busca dentro de los registros recientes
//     (PAGE_BUSQUEDA por fuente); suficiente para el volumen actual y ampliable
//     subiendo el tamaño de página o paginando si hiciera falta.

import { listarFacturas }      from "@/lib/facturacion/airtable/facturas";
import { listarRecibos }       from "@/lib/facturacion/recibos/airtable";
import { listarProformas }     from "@/lib/facturacion/proformas/airtable";
import { listarNotasCredito }  from "@/lib/facturacion/notaCredito/airtable";
import type { DocumentoResumen, ListadoDocumentos, OpcionesListado } from "./tipos";

const PAGE_NAV      = 50;   // registros por fuente al navegar un grupo
const PAGE_BUSQUEDA = 100;  // registros por fuente al buscar (filtro en memoria)

// ─── Proyecciones a DocumentoResumen ─────────────────────────────────────────

async function mapFacturas(pageSize: number, incluirPruebas: boolean): Promise<DocumentoResumen[]> {
  const { facturas } = await listarFacturas({
    pageSize,
    ...(incluirPruebas ? {} : { ambiente: "PRODUCCIÓN" }),
  });
  return facturas.map((f): DocumentoResumen => ({
    tipo: "factura",
    recordId: f.recordId,
    numero: f.numeroFactura,
    fecha: f.fechaEmision,
    clienteNombre: f.clienteNombre,
    clienteIdentificacion: f.clienteIdentificacion,
    clienteCorreo: f.clienteCorreo,
    total: f.total,
    estado: f.estado,
    ambiente: f.ambiente,
    claveAcceso: f.claveAcceso,
    tieneXml: f.tieneXml,
    tieneRide: f.tieneRide,
    tienePdf: f.tieneRide,      // el RIDE es el PDF de la factura
    numeroDocModificado: "",
  }));
}

async function mapRecibos(pageSize: number): Promise<DocumentoResumen[]> {
  const { recibos } = await listarRecibos({ pageSize });
  return recibos.map((r): DocumentoResumen => ({
    tipo: "recibo",
    recordId: r.recordId,
    numero: r.numero,
    fecha: r.fecha,
    clienteNombre: r.clienteNombre,
    clienteIdentificacion: r.clienteIdentificacion,
    clienteCorreo: "",
    total: r.total,
    estado: r.estado,
    ambiente: "",
    claveAcceso: "",
    tieneXml: false,
    tieneRide: false,
    tienePdf: r.tienePdf,
    numeroDocModificado: "",
  }));
}

async function mapProformas(pageSize: number): Promise<DocumentoResumen[]> {
  const { proformas } = await listarProformas({ pageSize });
  return proformas.map((p): DocumentoResumen => ({
    tipo: "proforma",
    recordId: p.recordId,
    numero: p.numero,
    fecha: p.fecha,
    clienteNombre: p.clienteNombre,
    clienteIdentificacion: p.clienteIdentificacion,
    clienteCorreo: "",
    total: p.total,
    estado: p.estado,
    ambiente: "",
    claveAcceso: "",
    tieneXml: false,
    tieneRide: false,
    tienePdf: p.tienePdf,
    numeroDocModificado: "",
  }));
}

// listarNotasCredito no acepta filtro de ambiente (a propósito: no se le
// cambió la firma por esto — ver PASO 3 del pedido). Se filtra aquí, en
// memoria, sobre el campo ya proyectado.
async function mapNotasCredito(pageSize: number, incluirPruebas: boolean): Promise<DocumentoResumen[]> {
  const { notas } = await listarNotasCredito({ pageSize });
  const filtradas = incluirPruebas ? notas : notas.filter((n) => n.ambiente === "PRODUCCIÓN");
  return filtradas.map((n): DocumentoResumen => ({
    tipo: "notaCredito",
    recordId: n.recordId,
    numero: n.numeroNotaCredito,
    fecha: n.fechaEmision,
    clienteNombre: n.clienteNombre,
    clienteIdentificacion: n.clienteIdentificacion,
    clienteCorreo: n.clienteCorreo,
    total: n.total,
    estado: n.estado,
    ambiente: n.ambiente,
    claveAcceso: n.claveAcceso,
    tieneXml: n.tieneXml,
    tieneRide: n.tieneRide,
    tienePdf: n.tieneRide,
    numeroDocModificado: n.numeroFacturaModificada,
  }));
}

// ─── Orden y filtro ──────────────────────────────────────────────────────────

// doc.fecha también guarda solo el día: varios documentos del mismo día
// quedan empatados en ese criterio. Se desempata por doc.numero descendente
// como texto — NUNCA parseando a número, porque los cuatro tipos conviven en
// el mismo array con formatos de número distintos ("001-002-000000678" vs
// "REC-000001") y una comparación numérica no tiene sentido entre ellos.
// Dentro de un mismo tipo, la comparación de texto sí ordena correctamente
// porque el secuencial va con ceros a la izquierda de ancho fijo.
const porFechaDesc = (a: DocumentoResumen, b: DocumentoResumen) => {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
  return a.numero < b.numero ? 1 : a.numero > b.numero ? -1 : 0;
};

function coincide(doc: DocumentoResumen, q: string): boolean {
  const campos = [doc.clienteNombre, doc.clienteIdentificacion, doc.clienteCorreo, doc.numero];
  return campos.some((c) => c.toLowerCase().includes(q));
}

// ─── API pública ─────────────────────────────────────────────────────────────

export async function listarDocumentos(opts: OpcionesListado): Promise<ListadoDocumentos> {
  const q = opts.q?.trim().toLowerCase() ?? "";
  // Defecto: false → solo PRODUCCIÓN. Proformas y recibos no tienen campo
  // Ambiente y nunca se filtran por esto (ver mapProformas/mapRecibos).
  const incluirPruebas = opts.incluirPruebas === true;

  let documentos: DocumentoResumen[];

  if (q) {
    // Búsqueda universal: las cuatro fuentes, filtro en memoria, ignora el grupo.
    const [fac, rec, pro, nc] = await Promise.all([
      mapFacturas(PAGE_BUSQUEDA, incluirPruebas),
      mapRecibos(PAGE_BUSQUEDA),
      mapProformas(PAGE_BUSQUEDA),
      mapNotasCredito(PAGE_BUSQUEDA, incluirPruebas),
    ]);
    documentos = [...fac, ...rec, ...pro, ...nc].filter((d) => coincide(d, q)).sort(porFechaDesc);
  } else if (opts.grupo === "ventas") {
    const [fac, rec] = await Promise.all([mapFacturas(PAGE_NAV, incluirPruebas), mapRecibos(PAGE_NAV)]);
    documentos = [...fac, ...rec].sort(porFechaDesc);
  } else if (opts.grupo === "proformas") {
    documentos = (await mapProformas(PAGE_BUSQUEDA)).sort(porFechaDesc);
  } else {
    documentos = (await mapNotasCredito(PAGE_BUSQUEDA, incluirPruebas)).sort(porFechaDesc);
  }

  const suma = documentos.reduce((s, d) => s + d.total, 0);
  return { documentos, suma };
}
