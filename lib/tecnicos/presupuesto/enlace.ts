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
  type DetalleRespondido, type EnvioRespuesta, type EstadoEnlace,
} from "./enlace-reglas";
import { entradaHistorial } from "./reglas";
import { getFacturacionConfig } from "@/lib/facturacion/config";
import { enmascararCedula, generarPresupuestoPdf } from "./pdf";

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
} & ReturnType<typeof construirVista>;

export async function vistaPublica(token: string): Promise<VistaPublica | null> {
  const o = await ordenDelToken(token);
  if (!o) return null;
  const [lineas, resps] = await Promise.all([listarLineas(o.id), leerRespuestasOrden(o.id)]);
  const vista = construirVista(lineas, detalleDeRespuestas(resps));
  return {
    estado: estadoEnlace(o.vence, o.bloqueadoHasta),
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
    const v = validarEnvio(vista.lineas, envio, orden.cedula);
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
        notaCarga: aprobar ? "Aprobada por el cliente desde el enlace. Falta cargarla a la orden." : "No aprobada por el cliente desde el enlace.",
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
      detalle: { version: 1, cambios: v.cambios.map((c) => ({ lineaId: c.lineaId, decision: c.decision })), lineas: detalle },
    });
    if (orden.intentos > 0) await guardarIntentosEnlace(orden.id, 0, null).catch(() => {});

    await avisarAlTaller(orden, nombre, aprobadas.length, v.cambios.length - aprobadas.length, v.necesariasRechazadas).catch((e) =>
      console.warn("[presupuesto enlace] no se pudo notificar:", e)
    );
    return { ok: true, aprobadas: aprobadas.length, noAprobadas: v.cambios.length - aprobadas.length, totalAprobado };
  });
}

async function avisarAlTaller(orden: OrdenEnlace, nombre: string, aprobadas: number, noAprobadas: number, necesariasRechazadas: string[]) {
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
      + (aprobadas ? " Falta cargar lo aprobado a la orden." : ""),
    prioridad: necesariasRechazadas.length ? "Crítica" : aprobadas ? "Alta" : "Normal",
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
