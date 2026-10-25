/**
 * Visor de documentos: un solo formato para factura, recibo, nota de crédito
 * y reserva (Kardex, ficha del artículo, Facturación, Técnicos).
 *
 * Ejecutar: npm test visor-documentos
 */

import { obtenerDocumentoVisor } from "../documentos/visor";
import { estadoTexto, tipoVisorDeKardex, tonoEstado } from "../documentos/visor-tipos";
import {
  activarEnvFalso,
  construirFetchDouble,
  crearEstadoDouble,
  crearRegistroDouble,
  limpiarEnvFalso,
  registrarTablaDouble,
} from "../../finanzas/__tests__/_airtableDouble";

let fallos = 0;
function assert(cond: unknown, msg: string) {
  if (cond) console.log("✓", msg);
  else { fallos++; console.error("✗", msg); }
}

async function main() {
  // Reglas sin red.
  assert(tipoVisorDeKardex("Factura") === "factura" && tipoVisorDeKardex("Nota de crédito") === "notaCredito" && tipoVisorDeKardex("Reserva") === "reserva", "Kardex → visor: factura, nota de crédito y reserva");
  assert(tipoVisorDeKardex("Caja") === null && tipoVisorDeKardex("Orden de compra") === null, "Caja y orden de compra siguen en su pantalla");
  assert(estadoTexto("factura", "AUTORIZADO") === "Autorizada" && tonoEstado("AUTORIZADO") === "ok" && tonoEstado("Anulado") === "mal", "Estado en palabras y con su color");

  const fetchOriginal = global.fetch;
  activarEnvFalso();
  const state = crearEstadoDouble();
  for (const t of ["Facturas Electrónicas", "Recibos", "Reservas", "Notas de Crédito Electrónicas", "Clientes"]) registrarTablaDouble(state, t);
  global.fetch = construirFetchDouble(state) as typeof fetch;
  try {
    const fac = crearRegistroDouble(state, "Facturas Electrónicas", {
      "Número de Factura": "001-002-000000764", Estado: "AUTORIZADO", Ambiente: "PRODUCCIÓN", "Fecha de Emisión": "2026-10-10",
      "Cliente - Nombre": "JUAN CARLOS MORÁN", "Cliente - Identificación": "1002582425001", "Cliente - Correo": "j@x.com",
      Subtotal: 478.26, IVA: 71.74, Total: 550, "Clave de Acceso": "1010202601100371027200120010020000007647116421319",
      "Líneas JSON": JSON.stringify({ formaPago: "20", detalles: [{ codigoPrincipal: "LAP-000042", descripcion: "Surface Laptop 3", cantidad: 1, precioUnitario: 478.26, descuento: 0, precioTotalSinImpuesto: 478.26, impuestos: [{ tarifa: 15 }] }] }),
    });

    const f = await obtenerDocumentoVisor("factura", fac, { facturacion: true });
    assert(f?.numero === "001-002-000000764" && f.estado === "Autorizada" && f.tono === "ok", "Factura: número y estado");
    assert(f?.cliente.nombre === "JUAN CARLOS MORÁN" && f.total === 550 && f.iva === 71.74, "Factura: cliente y totales");
    assert(f?.items.length === 1 && f.items[0].codigo === "LAP-000042", "Factura: la línea con su SKU (para marcarla desde el Kardex)");
    assert(f?.datos.some((d) => d.etiqueta === "Pago" && d.valor === "Otros (sist. financiero)"), "Factura: forma de pago en palabras");
    assert(f?.enlaces.some((e) => e.etiqueta === "Imprimir"), "Con Facturación: Imprimir");
    const sinPermiso = await obtenerDocumentoVisor("factura", fac, { facturacion: false });
    assert(sinPermiso?.enlaces.length === 0 && sinPermiso.total === 550, "Sin Facturación: se ve el documento pero sin Imprimir/PDF/XML");

    const rec = crearRegistroDouble(state, "Recibos", {
      "Número": "REC-000077", Fecha: "2026-10-23", Estado: "Vigente", Total: 53, "Forma de Pago": "01",
      "Líneas JSON": JSON.stringify({ cliente: { razonSocial: "ALICE QUIÑONEZ", identificacion: "0912345678" }, lineas: [{ codigo: "REP-000102", descripcion: "Sensor de huella", cantidad: 1, precioUnitario: 20, descuento: 0 }, { codigo: "REP-000097", descripcion: "Palmrest", cantidad: 1, precioUnitario: 35, descuento: 2 }] }),
    });
    const r = await obtenerDocumentoVisor("recibo", rec, { facturacion: true });
    assert(r?.numero === "REC-000077" && r.cliente.nombre === "ALICE QUIÑONEZ" && r.items.length === 2 && r.items[1].total === 33, "Recibo: cliente y líneas con descuento");
    assert(r?.mostrarIva === false && r.datos.some((d) => d.valor === "Efectivo"), "Recibo: sin IVA, forma de pago Efectivo");

    const nc = crearRegistroDouble(state, "Notas de Crédito Electrónicas", {
      "Número de Nota de Crédito": "001-002-000000031", Estado: "AUTORIZADO", Ambiente: "PRODUCCIÓN", "Fecha de Emisión": "2026-10-20",
      "Cliente Nombre": "JUAN CARLOS MORÁN", Total: 550, "Saldo Disponible": 550, Motivo: "Devolución", "Factura Modificada (Número)": "001-002-000000764", Factura: [fac],
      "Líneas JSON": JSON.stringify({ detalles: [{ codigoPrincipal: "LAP-000042", descripcion: "Surface Laptop 3", cantidad: 1, precioUnitario: 478.26, descuento: 0, precioTotalSinImpuesto: 478.26 }] }),
    });
    const n = await obtenerDocumentoVisor("notaCredito", nc, { facturacion: true });
    assert(n?.relacionados[0]?.tipo === "factura" && n.relacionados[0].recordId === fac && n.relacionados[0].numero === "001-002-000000764", "Nota de crédito: la factura que corrige se abre en el mismo visor");
    assert(n?.datos.some((d) => d.etiqueta === "Crédito" && d.valor === "$550,00"), "Nota de crédito: crédito disponible");

    const res = crearRegistroDouble(state, "Reservas", {
      "Número": "RES-000012", Fecha: "2026-10-05", Estado: "Facturada", "Cliente Nombre": "María Andrade", "Descripción Item": "LAP-000042 Surface Laptop 3",
      Precio: 550, "Total Abonado": 550, "Fecha Límite": "2026-10-20", "Plazo Días": 15, Factura: [fac],
      "Abonos JSON": JSON.stringify({ abonos: [{ monto: 200, fecha: "2026-10-05T15:00:00.000Z", formaPago: "01", registradoPor: "Joseph" }, { monto: 350, fecha: "2026-10-10T15:00:00.000Z", formaPago: "19", registradoPor: "Joseph" }] }),
    });
    const v = await obtenerDocumentoVisor("reserva", res, { facturacion: true });
    assert(v?.abonos.length === 2 && v.abonos[1].formaPago === "Tarjeta de crédito", "Reserva: abonos con su forma de pago");
    assert(v?.datos.some((d) => d.etiqueta === "Saldo" && d.valor === "$0,00") && v.relacionados[0]?.numero === "001-002-000000764", "Reserva: saldo y la factura con la que se cerró");
    assert(v?.enlaces.some((e) => e.etiqueta === "Imprimir"), "Reserva: Imprimir abre otra pestaña (ya no la impresión encima del Kardex)");

    assert(await obtenerDocumentoVisor("recibo", "recNOEXISTE0000000", { facturacion: true }) === null, "Documento que no existe: null (el visor dice «no encontrado»)");
  } finally {
    global.fetch = fetchOriginal;
    limpiarEnvFalso();
  }

  if (fallos) { console.error(`Fallaron ${fallos} comprobaciones.`); process.exit(1); }
  console.log("Visor de documentos: OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
