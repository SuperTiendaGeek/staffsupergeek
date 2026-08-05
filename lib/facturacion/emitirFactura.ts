import "server-only";

// Orquestación de la emisión de facturas electrónicas:
//   asignar secuencial → construir XML → firmar → recepción SRI →
//   autorización SRI → persistir (Airtable + disco) → RIDE PDF → enviar correo
//
// INVENTARIO: este flujo es de SOLO EMISIÓN al SRI. No modifica ningún campo
// de "Shipping Items" ni ninguna otra tabla de inventario. El descuento de stock
// se implementará en un flujo separado cuando se defina esa lógica de negocio.
//
// Manejo de errores:
//   - Si el SRI devuelve "clave de acceso ya registrada" (error 43),
//     reintenta automáticamente con el siguiente secuencial.
//   - Si la autorización falla, registra el intento como DEVUELTA/NO AUTORIZADO
//     sin crear una fila como AUTORIZADO y sin consumir el secuencial permanente.
//   - El PDF y el correo son best-effort: si fallan, se loguea pero no revierten la persistencia.

import fs   from "fs";
import path from "path";

import { getFacturacionConfig,
         getConsumidorFinalLimite } from "./config";
import { generateAccessKey }      from "./claveAcceso";
import { construirFacturaXml }    from "./xml/construirFacturaXml";
import { firmarXml }              from "./firma/firmar";
import { obtenerFirmaActiva }     from "./firma/resolverFirmaActiva";
import { enviarComprobante }      from "./sri/recepcion";
import { esperarAutorizacion }    from "./sri/cola";
import { siguienteSecuencial }    from "./secuencial/asignar";
import { persistirAutorizado,
         registrarIntento }       from "./almacenamiento/repositorio";
import { actualizarEstadoCorreo } from "./airtable/facturas";
import { generarRide }            from "./ride/generarRide";
import { enviarRide }             from "./correo/enviarRide";
import { assertConsumidorFinalPermitido } from "./reglas/consumidorFinal";
import { ahoraEnEcuador }         from "./fechaEcuador";
import { assertXmlValidoSri }     from "./reglas/validacionXsd";
import { assertPagosCuadranConTotal } from "./reglas/pagos";

import type { FacturaInput,
              DetalleFactura,
              TotalImpuesto,
              Pago,
              CampoAdicional }    from "./types/factura";
import type { RideInput }         from "./ride/generarRide";

export { FacturacionRechazoError } from "./errores";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

// Fase 16 PR2: origen desde el gancho Cuenta Unificada (orden/operación).
// Ausente en el flujo de mostrador. Se usa para idempotencia (releer antes
// de emitir) y para vincular la factura de vuelta al persistir.
export type OrigenGancho = { tipo: "orden" | "operacion" | "reserva"; recordId: string };

export type DatosVenta = {
  tipoIdentificacionComprador: string;
  razonSocialComprador:        string;
  identificacionComprador:     string;
  correoComprador?:            string;
  detalles:                    DetalleFactura[];
  totalSinImpuestos:           number;
  totalDescuento:              number;
  totalConImpuestos:           TotalImpuesto[];
  importeTotal:                number;
  pagos:                       Pago[];
  infoAdicional?:              CampoAdicional[];
  // Inyectado por el servidor desde la sesión autenticada — nunca del cliente
  vendedor?:                   string;
  // Opcionales del emisor (sobreescriben config si se proporcionan)
  dirEstablecimiento?:         string;
  contribuyenteEspecial?:      string;
  guiaRemision?:               string;
  // Fase 16 PR2 (gancho): presentes solo cuando la emisión viene de una
  // orden/operación vía cuentaUnificadaToDatosVenta(). record id real de
  // Clientes, si el origen tiene cliente vinculado.
  origen?:                     OrigenGancho;
  clienteRecordId?:            string;
};

export type ResultadoEmision = {
  estado:            "AUTORIZADO" | "DEVUELTA" | "NO AUTORIZADO";
  claveAcceso:       string;
  numeroFactura:     string;
  numeroAutorizacion?: string;
  fechaAutorizacion?:  string;
  mensajes?:           Array<{ identificador: string; tipo: string; mensaje: string }>;
  recordId?:           string;   // ID del registro en Airtable
  // Fase 20.2 — el puente Facturación→Movimientos necesita saber el
  // ambiente real (nunca crear movimientos sobre Ambiente=PRUEBAS) sin
  // tener que releer el registro recién persistido.
  ambiente?:           string;
};

// ─── Constante: código de error "clave ya registrada" ───────────────────────

// Error 43: "CLAVE DE ACCESO REGISTRADA" — misma clave de 49 dígitos ya enviada
// Error 45: "SECUENCIAL REGISTRADO" — ese número de secuencial ya tiene un comprobante en el SRI
const ERRORES_DUPLICADO = new Set(["43", "45"]);
const MAX_REINTENTOS    = 3;

// ─── Calcular IVA desde totalConImpuestos ─────────────────────────────────────

function calcularIva(totales: TotalImpuesto[]): number {
  return totales
    .filter((t) => t.codigo === "2")
    .reduce((acc, t) => acc + t.valor, 0);
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function emitirFactura(datos: DatosVenta): Promise<ResultadoEmision> {
  // ── 0. Regla Consumidor Final ≥ límite ──────────────────────────────────
  // Se valida antes de tocar Airtable o el SRI: emitirFactura() es el único
  // punto de entrada compartido por /api/facturacion/emitir, /reintentar y
  // el futuro gancho de Fase 16 — un guard puesto solo en un endpoint no
  // cubre a los demás llamadores. La UI (FacturacionForm.tsx) sigue teniendo
  // su propio bloqueo como primera línea; este es el que no se puede saltar.
  assertConsumidorFinalPermitido(
    datos.tipoIdentificacionComprador,
    datos.importeTotal,
    getConsumidorFinalLimite()
  );

  // El formulario manual siempre manda una sola forma de pago igual al
  // total (nunca dispara esto); el gancho de Fase 16 arma varias líneas
  // (abonos + saldo) y necesita esta red de seguridad server-side.
  assertPagosCuadranConTotal(datos.pagos, datos.importeTotal);

  const cfg         = getFacturacionConfig();
  // Fecha civil de Ecuador, NO la del servidor (Vercel = UTC) — ver
  // lib/facturacion/fechaEcuador.ts. Con new Date() a secas, toda emisión
  // entre las 19:00 y las 24:00 de Ecuador salía fechada al día siguiente y
  // el SRI la devolvía con [65] FECHA EMISIÓN EXTEMPORANEA.
  const fechaEmision = ahoraEnEcuador();

  // Firma: viene de Airtable si el administrador cargó una en
  // /facturacion/firma; si no, de las variables de entorno de siempre.
  // Se resuelve una sola vez, fuera del bucle de reintentos.
  const firma = await obtenerFirmaActiva();

  // Leer el secuencial base una sola vez; los reintentos usan offset creciente
  const base = await siguienteSecuencial(cfg.establecimiento, cfg.puntoEmision);

  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    // ── 1. Secuencial con offset para reintentos por "clave ya registrada" ──
    const secNum    = parseInt(base.secuencial, 10) + intento;
    const secuencial    = String(secNum).padStart(9, "0");
    const numeroFactura = `${cfg.establecimiento}-${cfg.puntoEmision}-${secuencial}`;

    // ── 2. Clave de acceso ──────────────────────────────────────────────────
    const claveAcceso = generateAccessKey({
      fechaEmision,
      tipoComprobante: "01",
      ruc:             cfg.ruc,
      ambiente:        cfg.ambiente,
      establecimiento: cfg.establecimiento,
      puntoEmision:    cfg.puntoEmision,
      secuencial,
    });

    // ── 3. Construir XML ────────────────────────────────────────────────────
    // Vendedor: inyectado como primer campo de infoAdicional.
    // El valor viene del servidor (sesión autenticada), nunca del body del cliente.
    // construirFacturaXml pasa los valores de infoAdicional por escFree(), así que
    // cualquier carácter especial en el nombre del vendedor queda normalizado antes
    // de entrar al XML que se firma.
    const infoAdicionalFinal: CampoAdicional[] = [
      ...(datos.vendedor?.trim() ? [{ nombre: "Vendedor", valor: datos.vendedor.trim() }] : []),
      ...(datos.infoAdicional ?? []),
    ];

    const facturaInput: FacturaInput = {
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
      tipoIdentificacionComprador: datos.tipoIdentificacionComprador,
      razonSocialComprador:        datos.razonSocialComprador,
      identificacionComprador:     datos.identificacionComprador,
      totalSinImpuestos:           datos.totalSinImpuestos,
      totalDescuento:              datos.totalDescuento,
      totalConImpuestos:           datos.totalConImpuestos,
      importeTotal:                datos.importeTotal,
      pagos:                       datos.pagos,
      detalles:                    datos.detalles,
      ...(cfg.dirEstablecimiento       ? { dirEstablecimiento:       cfg.dirEstablecimiento }       : {}),
      ...(cfg.obligadoContabilidad     ? { obligadoContabilidad:     cfg.obligadoContabilidad }     : {}),
      ...(datos.dirEstablecimiento     ? { dirEstablecimiento:       datos.dirEstablecimiento }     : {}),
      ...(datos.contribuyenteEspecial  ? { contribuyenteEspecial:    datos.contribuyenteEspecial }  : {}),
      ...(datos.guiaRemision           ? { guiaRemision:             datos.guiaRemision }           : {}),
      ...(infoAdicionalFinal.length    ? { infoAdicional:            infoAdicionalFinal }           : {}),
    };

    const xmlSinFirmar = construirFacturaXml(facturaInput);

    // ── 3.5 Validar contra el XSD oficial del SRI ───────────────────────────
    // Aborta antes de firmar y antes de contactar al SRI si el XML no es
    // conforme. siguienteSecuencial() (arriba) es una lectura pura de
    // MAX(Secuencial) — no reserva ni escribe nada — así que abortar aquí no
    // "quema" el número: el próximo intento (incluso en un request nuevo)
    // vuelve a calcular el mismo MAX+1. A diferencia de DEVUELTA/NO AUTORIZADO
    // (resultados de negocio esperables que sí se registran en Airtable vía
    // registrarIntento), un XML inválido indica un bug en la construcción —
    // no se persiste como intento; se relanza para que quede visible en los
    // logs y se corrija el código, no el dato.
    assertXmlValidoSri(xmlSinFirmar);

    // ── 4. Firmar ───────────────────────────────────────────────────────────
    const xmlFirmado = await firmarXml({
      xmlSinFirmar,
      p12Path:  firma.p12Path,
      p12Clave: firma.password,
    });

    // ── 5. Recepción SRI ────────────────────────────────────────────────────
    // Captura forense: guarda los bytes exactos del XML firmado antes de enviarlo.
    // Solo en no-producción; útil para diagnosticar errores 39 (FIRMA INVALIDA).
    if (process.env.NODE_ENV !== "production") {
      try {
        const debugDir = path.join(process.cwd(), "debug");
        fs.mkdirSync(debugDir, { recursive: true });
        fs.writeFileSync(path.join(debugDir, "ultima-firma.xml"), Buffer.from(xmlFirmado, "utf8"));
        console.log(`[emitirFactura] XML firmado → debug/ultima-firma.xml (${Buffer.byteLength(xmlFirmado, "utf8")} bytes)`);
      } catch { /* best-effort */ }
    }
    const recepcion = await enviarComprobante(xmlFirmado, cfg);

    if (recepcion.estado === "DEVUELTA") {
      const esClaveRegistrada = recepcion.mensajes?.some(
        (m) => ERRORES_DUPLICADO.has(m.identificador)
      );

      if (esClaveRegistrada && intento < MAX_REINTENTOS - 1) {
        // Reintento automático con el siguiente secuencial
        continue;
      }

      // Registrar intento fallido sin consumir secuencial para una factura válida
      const recordId = await registrarIntento({
        claveAcceso,
        numeroFactura,
        secuencial,
        estado:      "DEVUELTA",
        fechaEmision,
        ambiente:    cfg.ambiente,
        cliente: {
          nombre:         datos.razonSocialComprador,
          identificacion: datos.identificacionComprador,
          correo:         datos.correoComprador,
        },
        subtotal:    datos.totalSinImpuestos,
        iva:         calcularIva(datos.totalConImpuestos),
        total:       datos.importeTotal,
        mensajesSri: recepcion.mensajes ?? [],
      }).catch(() => undefined);

      return {
        estado:        "DEVUELTA",
        claveAcceso,
        numeroFactura,
        mensajes:      recepcion.mensajes,
        recordId,
      };
    }

    // ── 6. Autorización SRI ─────────────────────────────────────────────────
    const autorizacion = await esperarAutorizacion(claveAcceso, cfg, {
      maxEsperaMs:    60_000,
      intervaloBase:   2_000,
    });

    if (autorizacion.estado !== "AUTORIZADO") {
      const mensajes = "mensajes" in autorizacion ? autorizacion.mensajes : [];

      await registrarIntento({
        claveAcceso,
        numeroFactura,
        secuencial,
        estado:      autorizacion.estado === "NO AUTORIZADO" ? "NO AUTORIZADO" : "DEVUELTA",
        fechaEmision,
        ambiente:    cfg.ambiente,
        cliente: {
          nombre:         datos.razonSocialComprador,
          identificacion: datos.identificacionComprador,
          correo:         datos.correoComprador,
        },
        subtotal:    datos.totalSinImpuestos,
        iva:         calcularIva(datos.totalConImpuestos),
        total:       datos.importeTotal,
        mensajesSri: mensajes,
      }).catch(() => undefined);

      return {
        estado:        autorizacion.estado === "NO AUTORIZADO" ? "NO AUTORIZADO" : "DEVUELTA",
        claveAcceso,
        numeroFactura,
        mensajes,
      };
    }

    // ── 7. Generar RIDE PDF ─────────────────────────────────────────────────
    const rideInput: RideInput = {
      ruc:                   cfg.ruc,
      razonSocial:           cfg.razonSocial,
      nombreComercial:       cfg.nombreComercial,
      dirMatriz:             cfg.dirMatriz,
      dirEstablecimiento:    cfg.dirEstablecimiento ?? datos.dirEstablecimiento,
      obligadoContabilidad:  cfg.obligadoContabilidad,
      claveAcceso,
      ambiente:              cfg.ambiente,
      numeroFactura,
      fechaEmision,
      numeroAutorizacion:    autorizacion.numeroAutorizacion,
      fechaAutorizacion:     autorizacion.fechaAutorizacion,
      tipoIdentificacion:    datos.tipoIdentificacionComprador,
      identificacion:        datos.identificacionComprador,
      razonSocialComprador:  datos.razonSocialComprador,
      totalConImpuestos:     datos.totalConImpuestos,
      totalSinImpuestos:     datos.totalSinImpuestos,
      totalDescuento:        datos.totalDescuento,
      total:                 datos.importeTotal,
      pagos:                 datos.pagos,
      detalles:              datos.detalles.map((d) => ({
        codigo:         d.codigoPrincipal,
        descripcion:    d.descripcion,
        unidadMedida:   d.unidadMedida,
        cantidad:       d.cantidad,
        precioUnitario: d.precioUnitario,
        descuento:      d.descuento,
        total:          d.precioTotalSinImpuesto,
      })),
      infoAdicional: infoAdicionalFinal.length ? infoAdicionalFinal : undefined,
    };

    let ridePdf: Uint8Array | undefined;
    try {
      ridePdf = await generarRide(rideInput);
    } catch (e) {
      console.error("[emitirFactura] Error generando RIDE:", e);
    }

    // ── 8. Persistir (Airtable + disco) ────────────────────────────────────
    // version 3 (Fase 16 PR2): agrega "origen" y el "tipo" por línea (ya
    // dentro de cada objeto de "detalles", ver types/factura.ts). version 2
    // (sin estos dos) sigue siendo válida de leer — los campos nuevos son
    // opcionales. El XML del SRI no cambia con ninguna de las dos versiones.
    // Fase 20.2 — fix del bug de reintento: antes solo se guardaba
    // `formaPago` (string suelto, primer pago) y el array completo se
    // perdía. Se agrega `pagos` (el array `Pago[]` completo, con
    // `origenPago` intacto) sin quitar `formaPago` — compatibilidad con
    // lectores viejos que ya lo esperan. `reintentar/route.ts` lee `pagos`
    // primero y solo cae al hardcode legacy si una factura vieja no lo tiene.
    const lineasJson = JSON.stringify({
      version:       3,
      detalles:      datos.detalles,
      formaPago:     datos.pagos[0]?.formaPago,
      pagos:         datos.pagos,
      infoAdicional: infoAdicionalFinal.length ? infoAdicionalFinal : undefined,
      origen:        datos.origen,
    });

    const recordId = await persistirAutorizado({
      claveAcceso,
      numeroFactura,
      secuencial,
      numeroAutorizacion:  autorizacion.numeroAutorizacion,
      fechaAutorizacion:   autorizacion.fechaAutorizacion,
      fechaEmision,
      ambiente:            cfg.ambiente,
      cliente: {
        nombre:         datos.razonSocialComprador,
        identificacion: datos.identificacionComprador,
        correo:         datos.correoComprador,
      },
      subtotal:   datos.totalSinImpuestos,
      iva:        calcularIva(datos.totalConImpuestos),
      total:      datos.importeTotal,
      xmlAutorizado: autorizacion.xmlAutorizado,
      ridePdf,
      lineasJson,
      ordenId:     datos.origen?.tipo === "orden" ? datos.origen.recordId : undefined,
      operacionId: datos.origen?.tipo === "operacion" ? datos.origen.recordId : undefined,
      clienteId:   datos.clienteRecordId,
    });

    // ── 9. Enviar correo (best-effort) + persistir Estado Correo ───────────
    if (datos.correoComprador) {
      try {
        await enviarRide({
          destinatario:    datos.correoComprador,
          nombreComprador: datos.razonSocialComprador,
          numeroFactura,
          fechaEmision,
          ambiente:        cfg.ambiente,
          xmlBuffer:       Buffer.from(autorizacion.xmlAutorizado, "utf8"),
          pdfBuffer:       ridePdf ? Buffer.from(ridePdf) : Buffer.alloc(0),
          claveAcceso,
        });
        await actualizarEstadoCorreo(recordId, "ENVIADO").catch(() => {});
      } catch (e) {
        console.error("[emitirFactura] Error enviando correo:", e);
        await actualizarEstadoCorreo(recordId, "ERROR").catch(() => {});
      }
    } else {
      await actualizarEstadoCorreo(recordId, "NO_ENVIADO").catch(() => {});
    }

    return {
      estado:             "AUTORIZADO",
      claveAcceso,
      numeroFactura,
      numeroAutorizacion: autorizacion.numeroAutorizacion,
      fechaAutorizacion:  autorizacion.fechaAutorizacion,
      mensajes:           autorizacion.mensajes,
      recordId,
      ambiente:           cfg.ambiente,
    };
  }

  throw new Error(`emitirFactura: se agotaron ${MAX_REINTENTOS} reintentos por clave de acceso registrada`);
}
