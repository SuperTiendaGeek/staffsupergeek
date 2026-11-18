import "server-only";

// Enlace público de aprobación del presupuesto — lado servidor.
// Reglas puras en ./enlace-reglas.ts; persistencia en ./airtable.ts.
//
// Seguridad:
//   - El token es aleatorio (24 bytes → 32 caracteres), no es el record id.
//   - Se valida con TOKEN_REGEX antes de tocar Airtable (sin inyección en la fórmula).
//   - Vence a los 7 días; el técnico lo renueva (mismo enlace) al volver a enviarlo.
//   - 5 intentos fallidos de cédula bloquean el enlace 30 minutos.
//   - La vista pública no incluye proveedor, URL, costo, cédula ni teléfono.
//   - Todo cambio pasa por el mismo turno por orden que usa el técnico.

import { randomBytes } from "crypto";
import { withLock } from "@/lib/concurrencia";
import { canAccessApp, isAdministratorRole } from "@/lib/apps";
import { listPortalUsers } from "@/lib/airtable";
import { crearNotificacion } from "@/lib/notificaciones/airtable";
import {
  actualizarLinea, buscarOrdenPorToken, crearRespuestaFirmada, guardarEnlace, guardarIntentosEnlace,
  leerOrdenEnlace, leerRespuestasOrden, listarLineas, type OrdenEnlace,
} from "./airtable";
import {
  TOKEN_REGEX, construirVista, estadoEnlace, nuevaVigencia, primerNombre, registrarIntentoFallido, validarEnvio,
  resumirCargaAutomatica, textoCargaAutomatica,
  type DetalleRespondido, type EnvioRespuesta, type EstadoEnlace, type ResumenCargaAutomatica,
} from "./enlace-reglas";
import { entradaHistorial } from "./reglas";
import { aprobarYCargarSinTurno } from "./cargar";
import { cartelesDeServicios, listarAlertasGenerales } from "@/lib/tecnicos/carteles/airtable";
import {
  alertaAPublica, aPublico, cartelVisible, huellaCartel, textoCompletoAlerta, textoCompletoCartel,
  type AlertaPublica, type CartelPublico, type CartelServicio, type RequisitosConsentimiento,
} from "@/lib/tecnicos/carteles/reglas";
import { getFacturacionConfig } from "@/lib/facturacion/config";
import { enmascararCedula, generarPresupuestoPdf } from "./pdf";
import { porIds, estadosDeCuentaDeOrdenes, CAMPOS_ORDEN_CUENTA } from "@/lib/estado-cuenta/airtable";
import { CAMPO_INVERSO as CAMPO_SOLICITUDES, solicitudesPorIds } from "@/lib/compras/airtable";
import { faltaParaRepuestos } from "@/lib/compras/reglas";
import { linkedIds } from "@/lib/finanzas/airtable-client";
import { mediosDisponibles } from "@/lib/pagos-en-linea/config";
import { intentosDeLaOrden } from "@/lib/pagos-en-linea/airtable";
import {
  opcionesDePagoOrden, pagoParaMostrar, SIN_MEDIOS, type CuentaOrdenParaCobro, type PagoEnLineaVista,
} from "@/lib/pagos-en-linea/reglas";

export const RUTA_PUBLICA = "/presupuesto";

export function urlEnlace(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${RUTA_PUBLICA}/${token}`;
}

function nuevoToken(): string {
  return randomBytes(24).toString("base64url");
}

export type InfoEnlace = { token: string; vence: string; estado: EstadoEnlace | "sin_enlace" };

export async function infoEnlace(ordenId: string): Promise<InfoEnlace> {
  const o = await leerOrdenEnlace(ordenId);
  if (!o.token) return { token: "", vence: "", estado: "sin_enlace" };
  return { token: o.token, vence: o.vence, estado: estadoEnlace(o.vence, o.bloqueadoHasta) };
}

/**
 * Devuelve el enlace de la orden: lo crea si no existe y, si `renovar` o si
 * ya venció, le da 7 días más. El token NO cambia al renovar: es un solo
 * enlace por orden.
 */
export async function asegurarEnlace(ordenId: string, opts: { renovar?: boolean } = {}): Promise<InfoEnlace> {
  return withLock(`presupuesto:${ordenId}`, async () => {
    const o = await leerOrdenEnlace(ordenId);
    const token = o.token && TOKEN_REGEX.test(o.token) ? o.token : nuevoToken();
    const estado = o.token ? estadoEnlace(o.vence, o.bloqueadoHasta) : "vencido";
    if (token !== o.token || opts.renovar || estado === "vencido") {
      const vence = nuevaVigencia();
      await guardarEnlace(ordenId, token, vence);
      return { token, vence, estado: "vigente" };
    }
    return { token, vence: o.vence, estado };
  });
}

function detalleDeRespuestas(resps: Array<{ detalle: DetalleRespondido[] }>) {
  return resps.map((r) => r.detalle);
}

/** Resolución del token → orden. null si no es válido o no existe. */
async function ordenDelToken(token: string): Promise<OrdenEnlace | null> {
  if (!TOKEN_REGEX.test(token)) return null;
  return buscarOrdenPorToken(token);
}

/** Carteles que aplican a las líneas de una orden + avisos generales. */
async function consentimientosDeLaOrden(lineas: Awaited<ReturnType<typeof listarLineas>>) {
  const servicioIds = lineas.map((l) => l.servicioCatalogoId).filter((x): x is string => !!x);
  const [carteles, generales] = await Promise.all([
    servicioIds.length ? cartelesDeServicios(servicioIds).catch(() => new Map<string, CartelServicio>()) : Promise.resolve(new Map<string, CartelServicio>()),
    listarAlertasGenerales({ soloActivas: true }).catch(() => []),
  ]);
  // Solo las líneas que el cliente todavía puede aprobar necesitan cartel.
  const porLinea = new Map<string, CartelPublico>();
  for (const l of lineas) {
    const c = l.servicioCatalogoId ? carteles.get(l.servicioCatalogoId) : undefined;
    if (cartelVisible(c)) porLinea.set(l.id, aPublico(c));
  }
  const alertas: AlertaPublica[] = generales.map(alertaAPublica);
  const requisitos: RequisitosConsentimiento = {
    porLinea: new Map([...porLinea].map(([id, c]) => [id, c.huella])),
    generales: alertas,
  };
  return { porLinea, alertas, requisitos, carteles, generales };
}

export type VistaPublica = {
  estado: EstadoEnlace;
  orden: {
    idVisible: string;
    fechaIngreso: string;
    cliente: string;
    equipo: string;
    problema: string;
    recomendaciones: string;
  };
  vence: string;
  pideCedula: boolean;
  ultimaRespuesta: { fecha: string; nombre: string } | null;
  /** lineaId → cartel que debe aceptar para aprobar esa línea. */
  carteles: Record<string, CartelPublico>;
  /** Avisos de toda la orden que se aceptan al enviar. */
  alertasGenerales: AlertaPublica[];
  /**
   * Maquetas 7a/7b (dueño, 17-nov): "Tus pagos" con la cuenta de la orden
   * (calculadora única) y la caja de cobro en línea. El vencimiento del
   * enlace solo frena aprobar o cambiar: ver la cuenta y pagar sigue hasta
   * entregar.
   */
  cuenta: { total: number; pagado: number; falta: number; faltaRepuestos: number } | null;
  pagoEnLinea: PagoEnLineaVista;
} & ReturnType<typeof construirVista>;

export async function vistaPublica(token: string): Promise<VistaPublica | null> {
  const o = await ordenDelToken(token);
  if (!o) return null;
  const [lineas, resps] = await Promise.all([listarLineas(o.id), leerRespuestasOrden(o.id)]);
  const vista = construirVista(lineas, detalleDeRespuestas(resps));
  const [cons, cobro] = await Promise.all([
    consentimientosDeLaOrden(lineas),
    cobroDeLaOrden(o).catch((e) => { console.error("[presupuesto enlace] cuenta:", e); return null; }),
  ]);
  return {
    cuenta: cobro ? cobro.cuentaVisible : null,
    pagoEnLinea: cobro ? cobro.pagoEnLinea : { disponible: false, opciones: [], ultimo: null, medios: SIN_MEDIOS },
    estado: estadoEnlace(o.vence, o.bloqueadoHasta),
    carteles: Object.fromEntries(cons.porLinea),
    alertasGenerales: cons.alertas,
    orden: {
      idVisible: o.idVisible,
      fechaIngreso: o.fechaIngreso,
      cliente: primerNombre(o.clienteNombre),
      equipo: o.equipo,
      problema: o.diagnostico,
      recomendaciones: o.recomendaciones,
    },
    vence: o.vence,
    pideCedula: o.cedula.replace(/\D/g, "").length >= 4,
    ultimaRespuesta: resps[0] ? { fecha: resps[0].fecha, nombre: resps[0].nombre } : null,
    ...vista,
  };
}

// ─── Caja de cobro de la orden (maquetas 7a/7b, dueño 17-nov) ────────────────

/** Estados en los que la orden ya no recibe pagos en línea (ver lib/entrega/reglas.ts). */
const ESTADOS_ORDEN_CERRADA = new Set(["Finalizado Entregado", "Enviado a Reciclaje"]);

type CobroDeLaOrden = {
  codigo: string;
  clienteNombre: string;
  equipo: string;
  cuenta: CuentaOrdenParaCobro;
  cuentaVisible: { total: number; pagado: number; falta: number; faltaRepuestos: number } | null;
  pagoEnLinea: PagoEnLineaVista;
};

/**
 * La cuenta de la orden tal como la ve el cliente. Sale de la calculadora
 * única (estadosDeCuentaDeOrdenes) y de las solicitudes de compra (repuestos
 * bajo pedido); el monto a cobrar sale de aquí, nunca del navegador.
 */
async function cobroDeLaOrden(o: OrdenEnlace): Promise<CobroDeLaOrden> {
  const reg = (await porIds("Órdenes de Reparación", [o.id], [CAMPO_SOLICITUDES, ...CAMPOS_ORDEN_CUENTA])).get(o.id);
  const [cuentas, solicitudes, intentos] = await Promise.all([
    reg ? estadosDeCuentaDeOrdenes([reg]) : Promise.resolve(new Map()),
    reg ? solicitudesPorIds(linkedIds(reg.fields[CAMPO_SOLICITUDES])) : Promise.resolve([]),
    intentosDeLaOrden(o.id).catch((e) => { console.error("[presupuesto enlace] pagos en línea:", e); return []; }),
  ]);
  const c = cuentas.get(o.id);
  const pagado = c?.totalAbonado ?? 0;
  const cuenta: CuentaOrdenParaCobro = {
    cerrada: ESTADOS_ORDEN_CERRADA.has(o.estadoOrden),
    porCobrar: c?.porCobrar ?? 0,
    faltaRepuestos: faltaParaRepuestos(solicitudes, pagado),
  };
  const medios = mediosDisponibles(o.idVisible);
  const disponible = medios.tarjeta || medios.deuna;
  const opciones = disponible ? opcionesDePagoOrden(cuenta) : [];
  const ultimo = pagoParaMostrar(intentos);
  // Volvió de PayPhone y todavía no se confirma: no se ofrece pagar otra vez.
  const bloquear = ultimo?.estado === "sin_respuesta";
  return {
    codigo: o.idVisible,
    clienteNombre: o.clienteNombre,
    equipo: o.equipo,
    cuenta,
    cuentaVisible: c && c.totalCuenta > 0.009
      ? { total: c.totalCuenta, pagado, falta: cuenta.porCobrar, faltaRepuestos: Math.min(cuenta.faltaRepuestos, cuenta.porCobrar) }
      : null,
    pagoEnLinea: { disponible: disponible && opciones.length > 0 && !bloquear, opciones, ultimo, medios },
  };
}

/** Pagos en línea: la orden de un enlace (null si el token no vale). */
export async function ordenIdDelToken(token: string): Promise<string | null> {
  return (await ordenDelToken(token))?.id ?? null;
}

/** Pagos en línea: el token del enlace de una orden ("" si no tiene). */
export async function tokenDeLaOrden(ordenId: string): Promise<string> {
  const o = await leerOrdenEnlace(ordenId);
  return o.token && TOKEN_REGEX.test(o.token) ? o.token : "";
}

/** Pagos en línea: la cuenta de la orden para abrir y aplicar un pago. */
export async function cuentaParaCobroDeLaOrden(ordenId: string): Promise<Omit<CobroDeLaOrden, "cuentaVisible" | "pagoEnLinea">> {
  const c = await cobroDeLaOrden(await leerOrdenEnlace(ordenId));
  return { codigo: c.codigo, clienteNombre: c.clienteNombre, equipo: c.equipo, cuenta: c.cuenta };
}

/** Pagos en línea: avisa a técnicos y administradores (mismos destinatarios que la respuesta del cliente). */
export async function avisarOrden(ordenId: string, titulo: string, mensaje: string, prioridad: "Normal" | "Alta"): Promise<void> {
  const usuarios = (await listPortalUsers()).filter((u) => u.activo && (isAdministratorRole(u.rol) || canAccessApp({ rol: u.rol, appsPermitidas: u.appsPermitidas } as never, "Técnicos")));
  await Promise.allSettled(usuarios.map((u) => crearNotificacion({
    destinatarioId: u.id,
    tipo: "Reparación",
    titulo,
    mensaje,
    prioridad,
    urlAccion: `/tecnicos/ordenes/${ordenId}`,
    entidadTipo: "Orden Reparación",
    entidadId: ordenId,
  })));
}

export type ResultadoRespuesta =
  | { ok: true; aprobadas: number; noAprobadas: number; totalAprobado: number }
  | { ok: false; status: number; error: string; codigo: string };

export async function responderPresupuesto(
  token: string,
  envio: EnvioRespuesta,
  meta: { ip: string; dispositivo: string }
): Promise<ResultadoRespuesta> {
  const o = await ordenDelToken(token);
  if (!o) return { ok: false, status: 404, codigo: "NO_EXISTE", error: "Este enlace no existe." };

  return withLock(`presupuesto:${o.id}`, async () => {
    // Se relee dentro del turno: el técnico pudo cambiar algo recién.
    const orden = await leerOrdenEnlace(o.id);
    const estado = estadoEnlace(orden.vence, orden.bloqueadoHasta);
    if (estado === "bloqueado") return { ok: false, status: 429, codigo: "BLOQUEADO", error: "Demasiados intentos. Intenta de nuevo en 30 minutos o comunícate con la tienda." };
    if (estado === "vencido") return { ok: false, status: 410, codigo: "VENCIDO", error: "Este enlace venció. Pide a SUPER GEEK que te lo vuelva a enviar." };

    const [lineas, resps] = await Promise.all([listarLineas(orden.id), leerRespuestasOrden(orden.id)]);
    const vista = construirVista(lineas, detalleDeRespuestas(resps));
    const cons = await consentimientosDeLaOrden(lineas);
    const v = validarEnvio(vista.lineas, envio, orden.cedula, cons.requisitos);
    if (!v.ok) {
      if (v.codigo === "CEDULA") {
        const r = registrarIntentoFallido(orden.intentos);
        await guardarIntentosEnlace(orden.id, r.intentos, r.bloqueadoHasta);
        return { ok: false, status: 403, codigo: v.codigo, error: r.bloqueadoHasta ? "Demasiados intentos. El enlace quedó bloqueado 30 minutos." : v.error };
      }
      return { ok: false, status: v.codigo === "CAMBIO" ? 409 : 400, codigo: v.codigo, error: v.error };
    }

    const ahora = new Date().toISOString();
    const nombre = envio.nombre.trim().replace(/\s+/g, " ").slice(0, 120);
    const firma = `Cliente: ${nombre} (enlace)`;
    const porLinea = new Map(lineas.map((l) => [l.id, l]));

    for (const c of v.cambios) {
      const l = porLinea.get(c.lineaId)!;
      const aprobar = c.decision === "aprobar";
      await actualizarLinea(l.id, {
        estado: c.nuevoEstado,
        notaCarga: aprobar ? "Aprobada por el cliente desde el enlace." : "No aprobada por el cliente desde el enlace.",
        ...(aprobar ? { aprobadoPor: firma, fechaAprobacion: ahora } : {}),
        respuestaCliente: { valor: aprobar ? "Aprobó" : "No aprobó", huella: c.vista.huella, fecha: ahora },
        agregarHistorial: {
          anterior: l.historial,
          entrada: entradaHistorial(aprobar ? "El cliente APROBÓ desde el enlace." : "El cliente NO aprobó desde el enlace.", firma),
        },
      });
    }

    // Constancia firmada: lo que vio y decidió en cada línea que tiene decisión.
    const decisionDe = new Map(v.cambios.map((c) => [c.lineaId, c.decision]));
    const detalle: DetalleRespondido[] = vista.lineas
      .map((x) => ({ x, d: decisionDe.get(x.id) ?? x.decisionActual }))
      .filter((p): p is { x: typeof p.x; d: "aprobar" | "no" } => p.d === "aprobar" || p.d === "no")
      .map(({ x, d }) => ({ lineaId: x.id, descripcion: x.descripcion, cantidad: x.cantidad, precioUnitario: x.precioUnitario, huella: x.huella, decision: d }));
    const aprobadas = v.cambios.filter((c) => c.decision === "aprobar");
    const totalAprobado = Math.round(aprobadas.reduce((s, c) => s + c.vista.subtotal, 0) * 100) / 100;

    await crearRespuestaFirmada({
      ordenId: orden.id,
      codigo: `${orden.idVisible} · ${ahora.slice(0, 16).replace("T", " ")}`,
      fecha: ahora,
      nombre,
      cedulaVerificada: v.cedulaVerificada,
      ip: meta.ip,
      dispositivo: meta.dispositivo,
      lineaIds: v.cambios.map((c) => c.lineaId),
      aprobadas: aprobadas.length,
      noAprobadas: v.cambios.length - aprobadas.length,
      totalAprobado,
      detalle: {
        version: 2,
        cambios: v.cambios.map((c) => ({ lineaId: c.lineaId, decision: c.decision })),
        lineas: detalle,
        // Constancia: el texto COMPLETO que el cliente leyó y aceptó.
        consentimientos: [
          ...aprobadas
            .filter((c) => cons.porLinea.has(c.lineaId))
            .map((c) => {
              const servicio = lineas.find((l) => l.id === c.lineaId);
              const cartel = servicio?.servicioCatalogoId ? cons.carteles.get(servicio.servicioCatalogoId) : undefined;
              return {
                tipo: "servicio" as const,
                lineaId: c.lineaId,
                titulo: cartel ? cartel.titulo : cons.porLinea.get(c.lineaId)?.titulo ?? "",
                linea: c.vista.descripcion,
                huella: cartel ? huellaCartel(cartel) : cons.porLinea.get(c.lineaId)?.huella ?? "",
                texto: cartel ? textoCompletoCartel(cartel) : "",
                fecha: ahora,
              };
            }),
          ...cons.generales.map((a) => ({
            tipo: "general" as const,
            lineaId: "",
            titulo: a.titulo,
            linea: "",
            huella: alertaAPublica(a).huella,
            texto: textoCompletoAlerta(a),
            fecha: ahora,
          })),
        ],
      },
    });
    if (orden.intentos > 0) await guardarIntentosEnlace(orden.id, 0, null).catch(() => {});

    // Aprobado = cargado: lo aprobado se reserva/crea/asigna AHORA, en el mismo
    // turno de la orden (por eso la versión SinTurno: withLock no es
    // reentrante). La respuesta del cliente ya quedó guardada arriba; si la
    // carga falla, las líneas quedan "Aprobada" con el motivo y el técnico usa
    // "Reintentar carga". Nunca se le devuelve un error al cliente por esto.
    let carga: ResumenCargaAutomatica | null = null;
    if (aprobadas.length) {
      try {
        carga = resumirCargaAutomatica(await aprobarYCargarSinTurno({
          ordenId: orden.id,
          lineaIds: aprobadas.map((c) => c.lineaId),
          usuario: { nombre: firma },
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[presupuesto enlace] carga automática:", e);
        for (const c of aprobadas) {
          await actualizarLinea(c.lineaId, { notaCarga: `Aprobada por el cliente, pero no se pudo cargar: ${msg}` }).catch(() => {});
        }
      }
    }

    await avisarAlTaller(orden, nombre, aprobadas.length, v.cambios.length - aprobadas.length, v.necesariasRechazadas, carga).catch((e) =>
      console.warn("[presupuesto enlace] no se pudo notificar:", e)
    );
    return { ok: true, aprobadas: aprobadas.length, noAprobadas: v.cambios.length - aprobadas.length, totalAprobado };
  });
}

async function avisarAlTaller(
  orden: OrdenEnlace,
  nombre: string,
  aprobadas: number,
  noAprobadas: number,
  necesariasRechazadas: string[],
  carga: ResumenCargaAutomatica | null,
) {
  const faltoCargar = aprobadas > 0 && (!carga || carga.sinCargar.length > 0);
  const usuarios = (await listPortalUsers()).filter((u) => u.activo && (isAdministratorRole(u.rol) || canAccessApp({ rol: u.rol, appsPermitidas: u.appsPermitidas } as never, "Técnicos")));
  const partes = [aprobadas ? `aprobó ${aprobadas}` : "", noAprobadas ? `no aprobó ${noAprobadas}` : ""].filter(Boolean).join(" y ");
  await Promise.allSettled(usuarios.map((u) => crearNotificacion({
    destinatarioId: u.id,
    tipo: "Reparación",
    titulo: necesariasRechazadas.length
      ? `⚠ ${orden.idVisible}: el cliente NO aprobó algo necesario`
      : `Respuesta al presupuesto ${orden.idVisible}`,
    mensaje: `${nombre} ${partes} ${aprobadas + noAprobadas === 1 ? "línea" : "líneas"} desde el enlace.`
      + (necesariasRechazadas.length ? ` Rechazó lo NECESARIO: ${necesariasRechazadas.join("; ")}. Sin eso no se puede reparar: comunícate con el cliente.` : "")
      + textoCargaAutomatica(carga, aprobadas),
    prioridad: necesariasRechazadas.length ? "Crítica" : faltoCargar || aprobadas ? "Alta" : "Normal",
    urlAccion: `/tecnicos/ordenes/${orden.id}`,
    entidadTipo: "Orden Reparación",
    entidadId: orden.id,
  })));
}

// ─── PDF ─────────────────────────────────────────────────────────────────────


function emisorPdf() {
  try {
    const c = getFacturacionConfig();
    return { nombreComercial: c.nombreComercial ?? "", razonSocial: c.razonSocial ?? "SUPER GEEK", ruc: c.ruc ?? "", dirMatriz: c.dirMatriz ?? "" };
  } catch {
    return { nombreComercial: "SUPER GEEK", razonSocial: "SUPER GEEK", ruc: "", dirMatriz: "Otavalo, Ecuador" };
  }
}

async function pdfDeOrden(o: OrdenEnlace, origin: string, enlace: { token: string; vence: string } | null) {
  const [lineas, resps] = await Promise.all([listarLineas(o.id), leerRespuestasOrden(o.id)]);
  const vista = construirVista(lineas, detalleDeRespuestas(resps));
  const pdf = await generarPresupuestoPdf({
    emisor: emisorPdf(),
    orden: {
      idVisible: o.idVisible,
      fechaIngreso: o.fechaIngreso,
      cliente: o.clienteNombre,
      cedula: enmascararCedula(o.cedula),
      equipo: o.equipo,
      problema: o.diagnostico,
      recomendaciones: o.recomendaciones,
    },
    lineas: vista.lineas,
    retiradas: vista.retiradas,
    totalAprobado: vista.totalAprobado,
    totalPendiente: vista.totalPendiente,
    porPrioridad: vista.porPrioridad,
    // Constancia: lo aceptado en la respuesta más reciente que traiga carteles.
    consentimientos: (resps.find((r) => r.consentimientos.length > 0)?.consentimientos ?? []).map((c) => ({
      titulo: c.titulo, linea: c.linea, texto: c.texto, fecha: c.fecha,
      nombre: resps.find((r) => r.consentimientos.some((x) => x.fecha === c.fecha))?.nombre ?? "",
    })),
    fecha: new Date(),
    enlace: enlace ? { url: urlEnlace(origin, enlace.token), vence: enlace.vence } : null,
  });
  return { pdf, nombre: `Presupuesto-${o.idVisible}.pdf` };
}

/** PDF para el técnico: asegura (crea o renueva si venció) el enlace que va al pie. */
export async function pdfParaTaller(ordenId: string, origin: string) {
  const enlace = await asegurarEnlace(ordenId);
  return pdfDeOrden(await leerOrdenEnlace(ordenId), origin, enlace);
}

/** PDF desde el enlace público (no renueva nada). */
export async function pdfPublico(token: string, origin: string) {
  const o = await ordenDelToken(token);
  if (!o) return null;
  return pdfDeOrden(o, origin, { token: o.token, vence: o.vence });
}
