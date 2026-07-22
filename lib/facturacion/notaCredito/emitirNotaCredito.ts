import "server-only";

// Orquestador de emisión de la nota de crédito (Fase 18 PR1b).
//
// Reutiliza SIN MODIFICAR todo el andamiaje de la factura: clave de acceso,
// firma XAdES-BES, cliente SOAP de recepción/autorización, cola con backoff,
// config y fecha Ecuador. Lo único propio es el XML (v1.1.0), el secuencial
// y la persistencia — ver los módulos hermanos de esta carpeta.
//
// Igual que emitirFactura(), esta función es PURA respecto a los efectos de
// negocio: emite y persiste el comprobante, nada más. El reverso de
// inventario, el movimiento contable y el abono a favor corren DESPUÉS,
// desde el endpoint, cada uno en su propio try/catch (PR2) — un fallo suyo
// jamás debe alterar el resultado de una NC que el SRI ya autorizó.

import { generateAccessKey }       from "../claveAcceso";
import { getFacturacionConfig }    from "../config";
import { ahoraEnEcuador }          from "../fechaEcuador";
import { firmarXml }               from "../firma/firmar";
import { enviarComprobante }       from "../sri/recepcion";
import { esperarAutorizacion }     from "../sri/cola";
import { generarRide }             from "../ride/generarRide";
import { enviarRide }              from "../correo/enviarRide";
import { construirNotaCreditoXml } from "./construirNotaCreditoXml";
import { calcularTotalesNotaCredito, round2 } from "./calculos";
import {
  maxSecuencialNotaCreditoUsado,
  crearRegistroNotaCredito,
  subirAdjuntoNotaCredito,
} from "./airtable";
import type { DetalleNotaCredito } from "./types";
import type { MensajeSRI } from "../sri/recepcion";

const MAX_REINTENTOS = 3;
// Mismos códigos que en facturas: "clave de acceso ya registrada".
const ERRORES_DUPLICADO = new Set(["43", "45"]);

// ─── Secuencial propio, serializado por proceso ──────────────────────────────

const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => { release = r; });
  locks.set(key, next);
  await prev;
  try { return await fn(); } finally { release(); }
}

export async function siguienteSecuencialNotaCredito(
  estab: string,
  ptoEmi: string
): Promise<{ secuencial: string; numeroNotaCredito: string }> {
  return withLock(`nc-${estab}-${ptoEmi}`, async () => {
    const max = await maxSecuencialNotaCreditoUsado(estab, ptoEmi);
    let siguiente: number;
    if (max !== null) {
      siguiente = max + 1;
    } else {
      // Semilla solo con la tabla vacía. En producción debe valer 2: la
      // última NC del sistema viejo fue la 001-002-000000001.
      const seed = parseInt((process.env.SRI_SECUENCIAL_NC ?? "1").replace(/\D/g, ""), 10);
      siguiente = Number.isFinite(seed) && seed > 0 ? seed : 1;
    }
    const secuencial = String(siguiente).padStart(9, "0");
    return { secuencial, numeroNotaCredito: `${estab}-${ptoEmi}-${secuencial}` };
  });
}

// ─── Entrada / salida ────────────────────────────────────────────────────────

export type DatosNotaCredito = {
  // Comprador (se copian de la factura original — nunca se teclean)
  tipoIdentificacionComprador: string;
  razonSocialComprador:        string;
  identificacionComprador:     string;
  correoComprador?:            string;
  clienteRecordId?:            string;

  // Documento modificado
  numeroFacturaModificada: string;   // "001-002-000000681"
  fechaEmisionFactura:     Date;
  facturaRecordId?:        string;

  motivo:   string;
  detalles: DetalleNotaCredito[];
};

export type ResultadoNotaCredito = {
  estado:              "AUTORIZADO" | "DEVUELTA" | "NO AUTORIZADO";
  claveAcceso:         string;
  numeroNotaCredito:   string;
  numeroAutorizacion?: string;
  fechaAutorizacion?:  string;
  mensajes?:           MensajeSRI[];
  recordId?:           string;
  ambiente?:           string;
  /** XML autorizado — lo necesita el RIDE (PR1c) sin re-consultar al SRI. */
  xmlAutorizado?:      string;
  fechaEmision?:       Date;
  valorModificacion?:  number;
};

/** +5 días hábiles (sin contar sábados ni domingos) desde la emisión. */
export function fechaLimiteAceptacion(desde: Date): Date {
  const d = new Date(desde);
  let habiles = 0;
  while (habiles < 5) {
    d.setDate(d.getDate() + 1);
    const dia = d.getDay();
    if (dia !== 0 && dia !== 6) habiles++;
  }
  return d;
}

// ─── Emisión ─────────────────────────────────────────────────────────────────

export async function emitirNotaCredito(datos: DatosNotaCredito): Promise<ResultadoNotaCredito> {
  const cfg          = getFacturacionConfig();
  const fechaEmision = ahoraEnEcuador();
  const totales      = calcularTotalesNotaCredito(datos.detalles);

  const base = await siguienteSecuencialNotaCredito(cfg.establecimiento, cfg.puntoEmision);

  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    const secNum      = parseInt(base.secuencial, 10) + intento;
    const secuencial  = String(secNum).padStart(9, "0");
    const numeroNotaCredito = `${cfg.establecimiento}-${cfg.puntoEmision}-${secuencial}`;

    const claveAcceso = generateAccessKey({
      fechaEmision,
      tipoComprobante: "04",           // nota de crédito
      ruc:             cfg.ruc,
      ambiente:        cfg.ambiente,
      establecimiento: cfg.establecimiento,
      puntoEmision:    cfg.puntoEmision,
      secuencial,
    });

    const xmlSinFirmar = construirNotaCreditoXml({
      ambiente:        cfg.ambiente,
      razonSocial:     cfg.razonSocial,
      nombreComercial: cfg.nombreComercial,
      ruc:             cfg.ruc,
      claveAcceso,
      estab:           cfg.establecimiento,
      ptoEmi:          cfg.puntoEmision,
      secuencial,
      dirMatriz:       cfg.dirMatriz,
      fechaEmision,
      dirEstablecimiento: cfg.dirEstablecimiento,
      tipoIdentificacionComprador: datos.tipoIdentificacionComprador,
      razonSocialComprador:        datos.razonSocialComprador,
      identificacionComprador:     datos.identificacionComprador,
      obligadoContabilidad:        cfg.obligadoContabilidad,
      codDocModificado:            "01",
      numDocModificado:            datos.numeroFacturaModificada,
      fechaEmisionDocSustento:     datos.fechaEmisionFactura,
      totalSinImpuestos:           totales.totalSinImpuestos,
      valorModificacion:           totales.valorModificacion,
      moneda:                      "DOLAR",
      totalConImpuestos:           totales.totalConImpuestos,
      motivo:                      datos.motivo,
      detalles:                    datos.detalles,
    });

    const xmlFirmado = await firmarXml({
      xmlSinFirmar,
      p12Path:  cfg.firmaPath,
      p12Clave: cfg.firmaPassword,
      tipo:     "notaCredito",   // firma con signCreditNoteXml (inserta antes de </notaCredito>)
    });

    const ivaTotal = round2(totales.valorModificacion - totales.totalSinImpuestos);

    // Payload común para persistir cualquier desenlace.
    const registroBase = {
      claveAcceso,
      numeroNotaCredito,
      secuencial,
      fechaEmision:            fechaEmision.toISOString(),
      ambiente:                cfg.ambiente,
      clienteNombre:           datos.razonSocialComprador,
      clienteIdentificacion:   datos.identificacionComprador,
      clienteCorreo:           datos.correoComprador,
      motivo:                  datos.motivo,
      numeroFacturaModificada: datos.numeroFacturaModificada,
      facturaRecordId:         datos.facturaRecordId,
      clienteRecordId:         datos.clienteRecordId,
      subtotal:                totales.totalSinImpuestos,
      iva:                     ivaTotal,
      total:                   totales.valorModificacion,
    };

    // ── Recepción ───────────────────────────────────────────────────────────
    const recepcion = await enviarComprobante(xmlFirmado, cfg);

    if (recepcion.estado === "DEVUELTA") {
      const esClaveRegistrada = recepcion.mensajes?.some((m) => ERRORES_DUPLICADO.has(m.identificador));
      if (esClaveRegistrada && intento < MAX_REINTENTOS - 1) continue;

      const recordId = await crearRegistroNotaCredito({
        ...registroBase,
        estado:      "DEVUELTA",
        mensajesSri: recepcion.mensajes ?? [],
      }).catch(() => undefined);

      return { estado: "DEVUELTA", claveAcceso, numeroNotaCredito, mensajes: recepcion.mensajes, recordId, ambiente: cfg.ambiente };
    }

    // ── Autorización ────────────────────────────────────────────────────────
    const autorizacion = await esperarAutorizacion(claveAcceso, cfg, { maxEsperaMs: 60_000, intervaloBase: 2_000 });

    if (autorizacion.estado !== "AUTORIZADO") {
      const mensajes = "mensajes" in autorizacion ? autorizacion.mensajes : [];
      const recordId = await crearRegistroNotaCredito({
        ...registroBase,
        estado:      autorizacion.estado === "NO AUTORIZADO" ? "NO AUTORIZADO" : "DEVUELTA",
        mensajesSri: mensajes,
      }).catch(() => undefined);

      return {
        estado: autorizacion.estado === "NO AUTORIZADO" ? "NO AUTORIZADO" : "DEVUELTA",
        claveAcceso, numeroNotaCredito, mensajes, recordId, ambiente: cfg.ambiente,
      };
    }

    // ── Autorizada: persistir ───────────────────────────────────────────────
    const recordId = await crearRegistroNotaCredito({
      ...registroBase,
      estado:                "AUTORIZADO",
      numeroAutorizacion:    autorizacion.numeroAutorizacion,
      fechaAutorizacion:     autorizacion.fechaAutorizacion,
      estadoAceptacion:      "Pendiente de aceptación",
      fechaLimiteAceptacion: fechaLimiteAceptacion(fechaEmision).toISOString(),
      lineasJson: JSON.stringify({
        version:  1,
        detalles: datos.detalles,
        origen:   { numeroFacturaModificada: datos.numeroFacturaModificada, facturaRecordId: datos.facturaRecordId },
      }),
    });

    // Adjuntar el XML autorizado — best-effort, igual que en facturas: la NC
    // ya es real ante el SRI aunque el adjunto falle.
    await subirAdjuntoNotaCredito(
      recordId, "XML Autorizado", `${claveAcceso}.xml`, "text/xml",
      Buffer.from(autorizacion.xmlAutorizado, "utf8").toString("base64")
    ).catch((e) => console.error("[emitirNotaCredito] XML no adjuntado a Airtable:", e));

    // ── RIDE + correo — todo best-effort por el mismo motivo ────────────────
    let ridePdf: Uint8Array | undefined;
    try {
      ridePdf = await generarRide({
        ruc:                  cfg.ruc,
        razonSocial:          cfg.razonSocial,
        nombreComercial:      cfg.nombreComercial,
        dirMatriz:            cfg.dirMatriz,
        dirEstablecimiento:   cfg.dirEstablecimiento,
        obligadoContabilidad: cfg.obligadoContabilidad,
        claveAcceso,
        ambiente:             cfg.ambiente,
        numeroFactura:        numeroNotaCredito,
        fechaEmision,
        numeroAutorizacion:   autorizacion.numeroAutorizacion,
        fechaAutorizacion:    autorizacion.fechaAutorizacion,
        tipoIdentificacion:   datos.tipoIdentificacionComprador,
        identificacion:       datos.identificacionComprador,
        razonSocialComprador: datos.razonSocialComprador,
        totalConImpuestos: totales.totalConImpuestos.map((t) => ({
          codigo: t.codigo, codigoPorcentaje: t.codigoPorcentaje,
          baseImponible: t.baseImponible, valor: t.valor,
        })),
        totalSinImpuestos: totales.totalSinImpuestos,
        totalDescuento:    0,
        total:             totales.valorModificacion,
        pagos:             [],   // una NC acredita, no cobra
        detalles: datos.detalles.map((d) => ({
          codigo:         d.codigoInterno,
          descripcion:    d.descripcion,
          cantidad:       d.cantidad,
          precioUnitario: d.precioUnitario,
          descuento:      d.descuento,
          total:          d.precioTotalSinImpuesto,
        })),
        tipoDocumento:       "NOTA DE CRÉDITO",
        documentoModificado: { numero: datos.numeroFacturaModificada, fechaEmision: datos.fechaEmisionFactura },
        motivo:              datos.motivo,
      });

      await subirAdjuntoNotaCredito(
        recordId, "RIDE PDF", `${claveAcceso}.pdf`, "application/pdf",
        Buffer.from(ridePdf).toString("base64")
      ).catch((e) => console.error("[emitirNotaCredito] RIDE no adjuntado a Airtable:", e));
    } catch (e) {
      console.error("[emitirNotaCredito] RIDE no generado (la NC ya está AUTORIZADA):", e);
    }

    if (datos.correoComprador && ridePdf) {
      try {
        await enviarRide({
          destinatario:    datos.correoComprador,
          nombreComprador: datos.razonSocialComprador,
          numeroFactura:   numeroNotaCredito,
          fechaEmision,
          ambiente:        cfg.ambiente,
          xmlBuffer:       Buffer.from(autorizacion.xmlAutorizado, "utf8"),
          pdfBuffer:       Buffer.from(ridePdf),
          claveAcceso,
          tipoDocumento:   "Nota de Crédito",
        });
      } catch (e) {
        console.error("[emitirNotaCredito] correo no enviado:", e);
      }
    }

    return {
      estado:             "AUTORIZADO",
      claveAcceso,
      numeroNotaCredito,
      numeroAutorizacion: autorizacion.numeroAutorizacion,
      fechaAutorizacion:  autorizacion.fechaAutorizacion,
      recordId,
      ambiente:           cfg.ambiente,
      xmlAutorizado:      autorizacion.xmlAutorizado,
      fechaEmision,
      valorModificacion:  totales.valorModificacion,
    };
  }

  throw new Error(`No se pudo emitir la nota de crédito tras ${MAX_REINTENTOS} intentos (clave duplicada).`);
}
