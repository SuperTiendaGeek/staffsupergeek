import "server-only";

// Enlace del cliente para su PEDIDO ESPECIAL — lado servidor (punto 10A-3, 12-nov-2026).
// Reglas puras en ./enlace-reglas.ts.
//
// Seguridad (igual que el enlace del Presupuesto):
//   - El token es aleatorio (24 bytes → 32 caracteres), no es el record id, y
//     se valida con TOKEN_PEDIDO_REGEX antes de tocar Airtable.
//   - La vista pública no lleva proveedor, costo, URL, cédula ni teléfono.
//   - Lo único que el cliente puede hacer es ELEGIR su opción: eso no mueve
//     dinero ni acepta el pedido. El pedido se acepta solo con un pago
//     registrado por la tienda (o PayPhone, verificado por el servidor).

import { randomBytes } from "crypto";
import { withLock } from "@/lib/concurrencia";
import { airtableMutation, airtableRequest, escapeFormulaString, fetchRecordById, tableUrl, type AirtableListResponse } from "@/lib/finanzas/airtable-client";
import { listarLineasDePedido, leerRespuestasDePedido, crearRespuestaDePedido } from "@/lib/tecnicos/presupuesto/airtable";
import type { LineaPresupuesto } from "@/lib/tecnicos/presupuesto/reglas";
import { estadosDeCuentaDeOperaciones } from "@/lib/estado-cuenta/airtable";
import { listPortalUsers } from "@/lib/airtable";
import { crearNotificacion } from "@/lib/notificaciones/airtable";
import { esRolNotificable } from "@/lib/operaciones/depuracion";
import { payphoneActivo } from "@/lib/pagos/payphone";
import { aceptarPedido } from "./servidor";
import {
  TOKEN_PEDIDO_REGEX, confirmacionPorPago, construirVistaCliente, detalleEleccion, elegidasDeOpcion, eleccionVigente,
  errorEleccion, leerEleccion, type EleccionCliente, type LineaCliente, type VistaCliente,
} from "./enlace-reglas";

const T_OPERACIONES = "Operación Comercial";
const CAMPO_TOKEN = "Enlace pedido token";
export const RUTA_PUBLICA_PEDIDO = "/mi-pedido";

const texto = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return texto(v[0]);
  return v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
};

export function urlEnlacePedido(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${RUTA_PUBLICA_PEDIDO}/${token}`;
}

/** Devuelve el token del pedido; lo crea la primera vez. Un enlace por pedido, para siempre. */
export async function asegurarEnlacePedido(pedidoId: string): Promise<string> {
  return withLock(`pedido-enlace:${pedidoId}`, async () => {
    const op = await fetchRecordById(T_OPERACIONES, pedidoId);
    if (!op) throw new Error("El pedido no existe.");
    const actual = texto(op.fields[CAMPO_TOKEN]);
    if (TOKEN_PEDIDO_REGEX.test(actual)) return actual;
    const token = randomBytes(24).toString("base64url");
    await airtableMutation(tableUrl(T_OPERACIONES), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id: pedidoId, fields: { [CAMPO_TOKEN]: token } }] }),
    });
    return token;
  });
}

/** Token del pedido si ya existe ("" si no). No lo crea. */
export async function tokenDelPedido(pedidoId: string): Promise<string> {
  const op = await fetchRecordById(T_OPERACIONES, pedidoId);
  const t = texto(op?.fields[CAMPO_TOKEN]);
  return TOKEN_PEDIDO_REGEX.test(t) ? t : "";
}

async function pedidoDelToken(token: string): Promise<string | null> {
  if (!TOKEN_PEDIDO_REGEX.test(token)) return null;
  const u = new URL(tableUrl(T_OPERACIONES));
  u.searchParams.set("filterByFormula", `{${CAMPO_TOKEN}}='${escapeFormulaString(token)}'`);
  u.searchParams.set("maxRecords", "2");
  u.searchParams.append("fields[]", CAMPO_TOKEN);
  const data = await airtableRequest<AirtableListResponse>(u.toString());
  const recs = data.records ?? [];
  // Un token repetido sería un error grave: se rechaza en vez de adivinar.
  return recs.length === 1 ? recs[0].id : null;
}

const aLineaCliente = (l: LineaPresupuesto): LineaCliente => ({
  id: l.id,
  descripcion: l.descripcion,
  cantidad: l.cantidad,
  precioUnitario: l.precioUnitario,
  estado: l.estado,
  grupoAlternativas: l.grupoAlternativas,
  tiempoEstimado: l.tiempoEstimado,
  notaCliente: l.notaCliente,
});

type Contexto = {
  id: string;
  codigo: string;
  clienteNombre: string;
  producto: string;
  estado: string;
  vence: string;
  lineas: LineaCliente[];
  elecciones: EleccionCliente[];
  pagado: number;
};

async function leerContexto(pedidoId: string): Promise<Contexto> {
  const op = await fetchRecordById(T_OPERACIONES, pedidoId);
  if (!op) throw new Error("El pedido no existe.");
  const [lineas, respuestas, cuentas] = await Promise.all([
    listarLineasDePedido(pedidoId),
    leerRespuestasDePedido(pedidoId),
    estadosDeCuentaDeOperaciones([pedidoId]),
  ]);
  const f = op.fields;
  return {
    id: op.id,
    codigo: texto(f["Código Operación"]) || op.id,
    clienteNombre: texto(f["Cliente Nombre"]),
    producto: texto(f["Producto Solicitado"]),
    estado: texto(f["Estado"]),
    vence: texto(f["Cotización vence"]),
    lineas: lineas.map(aLineaCliente),
    elecciones: respuestas.map((r) => leerEleccion(r.fecha, r.detalle)).filter((e): e is EleccionCliente => !!e),
    pagado: cuentas.get(pedidoId)?.totalAbonado ?? 0,
  };
}

export type VistaPublicaPedido = VistaCliente & { producto: string; pagoTarjeta: boolean };

function vistaDe(c: Contexto): VistaPublicaPedido {
  const vista = construirVistaCliente({
    codigo: c.codigo, clienteNombre: c.clienteNombre, estado: c.estado, vence: c.vence,
    lineas: c.lineas, elecciones: c.elecciones, pagado: c.pagado,
  });
  const producto = vista.elegido?.items[0]?.descripcion || vista.opciones[0]?.descripcion || c.producto;
  return { ...vista, producto, pagoTarjeta: payphoneActivo() };
}

export async function vistaPublicaPedido(token: string): Promise<VistaPublicaPedido | null> {
  const id = await pedidoDelToken(token);
  if (!id) return null;
  return vistaDe(await leerContexto(id));
}

/** Para la pantalla del empleado: la elección vigente del cliente (o null). */
export async function eleccionDelCliente(pedidoId: string, lineas: LineaPresupuesto[]): Promise<{ fecha: string; elegidas: string[] } | null> {
  const respuestas = await leerRespuestasDePedido(pedidoId);
  const elecciones = respuestas.map((r) => leerEleccion(r.fecha, r.detalle)).filter((e): e is EleccionCliente => !!e);
  const e = eleccionVigente(elecciones, lineas.map(aLineaCliente));
  return e ? { fecha: e.fecha, elegidas: e.elegidas } : null;
}

export type ResultadoEleccion =
  | { ok: true; vista: VistaPublicaPedido; confirmado: boolean }
  | { ok: false; status: number; codigo: string; error: string };

/**
 * "Acepto la opción N": guarda la ELECCIÓN del cliente (constancia en
 * "Presupuesto Respuestas") y avisa a la tienda. No acepta el pedido: eso lo
 * hace el pago. Si ya había pagado lo suficiente, se confirma enseguida.
 */
export async function elegirOpcionPedido(
  token: string,
  envio: { opcionId: string | null; huellas: Record<string, string> },
  meta: { ip: string; dispositivo: string },
): Promise<ResultadoEleccion> {
  const id = await pedidoDelToken(token);
  if (!id) return { ok: false, status: 404, codigo: "NO_EXISTE", error: "Este enlace no existe." };

  const r = await withLock(`pedido:${id}`, async (): Promise<ResultadoEleccion | { ok: true; ctx: Contexto; total: number }> => {
    const c = await leerContexto(id);
    const err = errorEleccion({ estado: c.estado, vence: c.vence, lineas: c.lineas, opcionId: envio.opcionId, huellasVistas: envio.huellas });
    if (err) return { ok: false, status: err.codigo === "CAMBIO" ? 409 : err.codigo === "CERRADO" ? 409 : 400, codigo: err.codigo, error: err.error };
    const sel = elegidasDeOpcion(c.lineas, envio.opcionId);
    if (!sel.ok) return { ok: false, status: 400, codigo: "OPCION", error: sel.error };
    const detalle = detalleEleccion(c.lineas, sel.elegidas);
    const ahora = new Date().toISOString();
    await crearRespuestaDePedido({
      pedidoId: id,
      codigo: `${c.codigo} · ${ahora.slice(0, 16).replace("T", " ")}`,
      fecha: ahora,
      nombre: `${c.clienteNombre || "Cliente"} (enlace)`,
      ip: meta.ip,
      dispositivo: meta.dispositivo,
      lineaIds: sel.elegidas,
      total: detalle.total,
      detalle,
    });
    return { ok: true, ctx: { ...c, elecciones: [...c.elecciones, leerEleccion(ahora, JSON.stringify(detalle))!] }, total: detalle.total };
  });
  if (!r.ok) return r;
  if (!("ctx" in r)) return r;

  // ¿Ya pagó lo suficiente antes de elegir? (p. ej. transfirió primero)
  const confirmado = await confirmarPedidoSiPagado(id, `${r.ctx.clienteNombre || "Cliente"} (enlace)`).catch((e) => {
    console.error("[pedido enlace] confirmar tras elegir:", e);
    return false;
  });
  const ctx = confirmado ? await leerContexto(id) : r.ctx;
  const v = vistaDe(ctx);
  if (!confirmado) {
    await avisar(id, `Eligió su opción · ${ctx.codigo}`,
      `${ctx.clienteNombre} eligió ${v.elegido?.items.map((x) => x.descripcion).join(" + ") ?? "su opción"} desde el enlace (${usd(r.total)}). Para confirmar paga ${usd(v.pago.faltaParaConfirmar)}: registra el abono cuando llegue.`,
      "Alta").catch((e) => console.warn("[pedido enlace] aviso:", e));
  }
  return { ok: true, vista: v, confirmado };
}

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;

/**
 * La puerta única del "pago confirma el pedido": la llaman el abono del
 * empleado (Operaciones), el pago con saldo a favor y, más adelante,
 * PayPhone. Si hay una elección vigente del cliente y lo pagado cubre la
 * regla de tramos → el pedido pasa a "Aceptado" (vía Enlace) y nace la
 * solicitud de compra. Devuelve true si lo confirmó.
 */
export async function confirmarPedidoSiPagado(pedidoId: string, quien: string): Promise<boolean> {
  const c = await leerContexto(pedidoId);
  const eleccion = eleccionVigente(c.elecciones, c.lineas);
  const conf = confirmacionPorPago({ estado: c.estado, eleccion, lineas: c.lineas, pagado: c.pagado });
  if (!conf || !eleccion) return false;
  // El precio que el cliente eligió se respeta aunque la cotización haya
  // vencido después: se valida la vigencia al momento de elegir.
  await aceptarPedido({
    pedidoId, elegidas: conf.elegidas, usuario: quien, via: "Enlace", vigenteAl: new Date(eleccion.fecha),
  });
  await avisar(pedidoId, `Pedido confirmado · ${c.codigo}`,
    `${c.clienteNombre} pagó ${usd(c.pagado)} de ${usd(conf.total)}. El pedido quedó Aceptado y su compra está en "Por comprar".`,
    "Alta").catch((e) => console.warn("[pedido enlace] aviso confirmado:", e));
  return true;
}

async function avisar(pedidoId: string, titulo: string, mensaje: string, prioridad: "Normal" | "Alta"): Promise<void> {
  const usuarios = (await listPortalUsers()).filter((u) => u.activo && esRolNotificable(u.rol));
  await Promise.allSettled(usuarios.map((u) => crearNotificacion({
    destinatarioId: u.id, tipo: "Sistema", titulo, mensaje, prioridad,
    urlAccion: `/operaciones/${pedidoId}`, entidadTipo: "Sistema", entidadId: pedidoId,
  })));
}
