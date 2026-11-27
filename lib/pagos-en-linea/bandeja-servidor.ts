import "server-only";

// Bandeja "Pagos recibidos" (maquetas 12 y 12b, aprobadas 18-nov-2026) —
// lado servidor. Reglas puras en ./bandeja.ts; asignar y descartar viven en
// ./servidor.ts (mismo motor que el resto de los pagos en línea).

import { isAdministratorRole } from "@/lib/apps";
import { CAMPO_ES_PRUEBA, esPrueba } from "@/lib/pruebas/reglas";
import { getSessionFromCookie } from "@/lib/session";
import { buscarClientesOp } from "@/lib/operaciones/airtable";
import {
  CAMPOS_ORDEN_CUENTA, estadosDeCuentaDeOperaciones, estadosDeCuentaDeOrdenes, ids, listarTodo, porIds, texto, type Registro,
} from "@/lib/estado-cuenta/airtable";
import { escapeFormulaString } from "@/lib/finanzas/airtable-client";
import { fetchCuentaPorNombre } from "@/lib/finanzas/cuentas";
import { fetchMovimientosDeCuentaPorEstado } from "@/lib/finanzas/saldos";
import { procesarAcreditacion } from "@/lib/finanzas/acreditacion";
import { normalizeCedula } from "@/lib/clientes/normalizeCedula";
import { hoyEcuador } from "@/lib/pedidos-especiales/retiro";
import type { Movimiento } from "@/types/finanzas";
import {
  actualizarIntento, deUnaPorAsignarRecientes, intentoDeAbono, intentosEntre, intentosPendientesDeBandeja, type IntentoRegistro,
} from "./airtable";
import {
  cierre, cuentaDelResumen, mismoMundo, puedeVerBandeja, diaEcuador, diasDelPeriodo, mejorSugerencia, rangoDias, resumenDelDia, sugerir,
  type Candidato, type CandidatoSugerido, type CierrePasarela, type FilaPago, type MovimientoCierre, type Periodo, type ResumenBandeja,
} from "./bandeja";
import { identificacionCorta } from "./deuna-reglas";
import { tarifaYNeto, type Pasarela } from "./reglas";
import { abonosDeTransaccion } from "./servidor";
import { configPasarela } from "./config";

// ─── Quién la usa ───────────────────────────────────────────────────────────

/** "No corresponde", Cierre del día y acreditar: solo Administradores. */
export const esAdministrador = (rol: string | undefined) => isAdministratorRole(rol);

export type SesionBandeja = { ok: true; usuario: string; admin: boolean } | { ok: false; status: number; error: string };

/** Sesión del empleado para la bandeja (y, si se pide, solo Administradores). */
export async function sesionBandeja(soloAdmin = false): Promise<SesionBandeja> {
  const session = await getSessionFromCookie();
  if (!session) return { ok: false, status: 401, error: "No autenticado." };
  const rol = session.user.rol;
  if (!puedeVerBandeja(rol)) return { ok: false, status: 403, error: "Tu usuario no puede usar Pagos recibidos." };
  const admin = esAdministrador(rol);
  if (soloAdmin && !admin) return { ok: false, status: 403, error: "Solo un Administrador puede hacer esto." };
  return { ok: true, usuario: session.user.nombre || session.user.email || "Portal", admin };
}

// ─── Filas ──────────────────────────────────────────────────────────────────

const CUENTAS_TRANSITO: Record<Pasarela, string> = { DeUna: "DeUna", PayPhone: "Tarjetas en Tránsito" };

async function movimientosDe(pasarela: Pasarela): Promise<Movimiento[]> {
  const cuenta = await fetchCuentaPorNombre(CUENTAS_TRANSITO[pasarela]);
  if (!cuenta) return [];
  const movs = await fetchMovimientosDeCuentaPorEstado(cuenta.id, cuenta.fechaCorte, ["Pendiente", "Acreditado"]);
  return movs.filter((m) => m.tipo === "Ingreso" && m.cuentaDestinoId === cuenta.id && (pasarela === "DeUna" || m.metodo === "PayPhone"));
}

/** abonoId → "Por acreditar" / "Acreditado" (del movimiento de Finanzas). */
async function finanzasPorAbono(): Promise<Map<string, FilaPago["finanzas"]>> {
  const [a, b] = await Promise.all([movimientosDe("DeUna"), movimientosDe("PayPhone")]);
  const mapa = new Map<string, FilaPago["finanzas"]>();
  for (const m of [...a, ...b]) for (const id of m.abonoIds) mapa.set(id, m.estado === "Acreditado" ? "Acreditado" : "Por acreditar");
  return mapa;
}

function fila(i: IntentoRegistro, finanzas: Map<string, FilaPago["finanzas"]>): FilaPago {
  return {
    codigo: i.codigo,
    pasarela: i.pasarela,
    estado: i.estado,
    cuenta: cuentaDelResumen(i.pago),
    origen: i.origen,
    monto: i.monto,
    tarifa: i.tarifa,
    neto: i.neto,
    pagador: i.pagador || i.tarjeta || (i.medio && i.medio !== "DeUna" ? i.medio : ""),
    cedula: identificacionCorta(i.identificacion),
    referencia: i.autorizacion,
    creado: i.creado,
    pagadoEn: i.confirmadoEn,
    detalle: i.detalle,
    asignadoPor: i.asignadoPor,
    asignadoEn: i.asignadoEn,
    finanzas: i.abonoId ? finanzas.get(i.abonoId) ?? "" : "",
    ambiente: i.ambiente,
    destino: i.ordenId ? { origen: "Orden", id: i.ordenId } : i.pedidoId ? { origen: "Pedido", id: i.pedidoId } : null,
    conAbono: !!i.abonoId,
  };
}

// ─── La bandeja ─────────────────────────────────────────────────────────────

export type FilaPendiente = FilaPago & { sugerencia: CandidatoSugerido | null };

export type DatosBandeja = {
  hoy: string;
  resumen: ResumenBandeja;
  pendientes: FilaPendiente[];
  historial: FilaPago[];
  desde: string;
  hasta: string;
};

export async function datosBandeja(input: { periodo?: Periodo; desde?: string; hasta?: string }): Promise<DatosBandeja & { encendidas: Record<Pasarela, boolean> }> {
  const hoy = hoyEcuador();
  const dias = input.desde && input.hasta ? { desde: input.desde, hasta: input.hasta } : diasDelPeriodo(input.periodo ?? "hoy", hoy);
  const rango = rangoDias(dias.desde, dias.hasta);
  const deHoy = rangoDias(hoy, hoy);
  const [pend, hist, histHoy, finanzas] = await Promise.all([
    intentosPendientesDeBandeja(),
    intentosEntre(rango.desde, rango.hasta),
    dias.desde === hoy && dias.hasta === hoy ? Promise.resolve(null) : intentosEntre(deHoy.desde, deHoy.hasta),
    finanzasPorAbono(),
  ]);

  const pendientes = await pendientesConSugerencia(pend, finanzas);
  const historial = hist.map((i) => fila(i, finanzas));
  const filasHoy = histHoy ? histHoy.map((i) => fila(i, finanzas)) : historial;
  // La bandeja muestra lo REAL: QA aparece con la etiqueta PRUEBA y no suma en las tarjetas.
  const encendidas = { DeUna: configPasarela("DeUna", "Producción").activa, PayPhone: configPasarela("PayPhone").activa };
  return { hoy, resumen: resumenDelDia(filasHoy, hoy, pendientes), pendientes, historial, desde: dias.desde, hasta: dias.hasta, encendidas };
}

/**
 * Pagos por asignar o por revisar, con su sugerencia. Si el empleado ya
 * registró a mano un pago DeUna (mismo N.º de transferencia), se enlaza solo
 * y sale de la bandeja: así el mismo dinero nunca entra dos veces.
 */
async function pendientesConSugerencia(intentos: IntentoRegistro[], finanzas: Map<string, FilaPago["finanzas"]>): Promise<FilaPendiente[]> {
  const out: FilaPendiente[] = [];
  const porCedula = new Map<string, Candidato[]>();
  for (const i of intentos) {
    if (i.estado === "Por asignar" && i.pasarela === "DeUna" && i.autorizacion && !i.abonoId) {
      const manual = (await abonosDeTransaccion(i.autorizacion, "DeUna").catch(() => []))[0];
      if (manual) {
        await actualizarIntento(i.id, { estado: "Aplicado", abonoId: manual.id, detalle: "Ya estaba registrado a mano (mismo N.º de transferencia)." }).catch(() => undefined);
        continue;
      }
    }
    let sugerencia: CandidatoSugerido | null = null;
    if (i.estado === "Por asignar" && i.identificacion) {
      const ced = normalizeCedula(i.identificacion);
      if (!porCedula.has(ced)) porCedula.set(ced, await candidatosPorCedula(ced).catch(() => []));
      sugerencia = mejorSugerencia({ monto: i.monto, identificacion: i.identificacion }, (porCedula.get(ced) ?? []).filter((c) => mismoMundo(c, i.ambiente)));
    }
    out.push({ ...fila(i, finanzas), sugerencia });
  }
  return out;
}

// ─── Cuentas abiertas (para asignar) ────────────────────────────────────────

const ORDEN_CERRADA = new Set(["Finalizado Entregado", "Enviado a Reciclaje"]);
const PEDIDO_CERRADO = new Set(["Cancelado", "Entregado"]);
const CAMPOS_ORDEN = ["ID", "Equipo", "Estado Actual", "ClienteTXT", "Cliente", CAMPO_ES_PRUEBA, ...CAMPOS_ORDEN_CUENTA];
const CAMPOS_PEDIDO = ["Código Operación", "Producto Solicitado", "Estado", "Orden de Reparación", "Cliente Nombre", "Cliente Cédula", CAMPO_ES_PRUEBA];

const primero = (v: unknown) => (Array.isArray(v) ? texto(v[0]) : texto(v));

async function candidatosDeOrdenes(ordenes: Registro[], cedulaPorCliente: Map<string, string>, nombrePorCliente: Map<string, string>): Promise<Candidato[]> {
  const abiertas = ordenes.filter((o) => !ORDEN_CERRADA.has(texto(o.fields["Estado Actual"])));
  const cuentas = await estadosDeCuentaDeOrdenes(abiertas);
  return abiertas.flatMap((o) => {
    const c = cuentas.get(o.id);
    if (!c || !(c.porCobrar > 0.009)) return [];
    const clienteId = ids(o.fields["Cliente"])[0] ?? "";
    return [{
      origen: "Orden" as const, id: o.id, codigo: texto(o.fields["ID"]) || o.id,
      cliente: nombrePorCliente.get(clienteId) || primero(o.fields["ClienteTXT"]),
      detalle: texto(o.fields["Equipo"]), falta: c.porCobrar, cedula: cedulaPorCliente.get(clienteId) ?? "",
      esPrueba: esPrueba(o.fields),
    }];
  });
}

async function candidatosDePedidos(pedidos: Registro[]): Promise<Candidato[]> {
  // Un pedido que es parte de una orden se cobra en la cuenta de la orden.
  const sueltos = pedidos.filter((p) => ids(p.fields["Orden de Reparación"]).length === 0 && !PEDIDO_CERRADO.has(texto(p.fields["Estado"])));
  const cuentas = await estadosDeCuentaDeOperaciones(sueltos.map((p) => p.id));
  return sueltos.flatMap((p) => {
    const c = cuentas.get(p.id);
    if (!c || !(c.porCobrar > 0.009)) return [];
    return [{
      origen: "Pedido" as const, id: p.id, codigo: texto(p.fields["Código Operación"]) || p.id,
      cliente: primero(p.fields["Cliente Nombre"]), detalle: texto(p.fields["Producto Solicitado"]),
      falta: c.porCobrar, cedula: primero(p.fields["Cliente Cédula"]),
      esPrueba: esPrueba(p.fields),
    }];
  });
}

async function cuentasDeClientes(clienteIds: string[]): Promise<Candidato[]> {
  if (!clienteIds.length) return [];
  const clientes = [...(await porIds("Clientes", clienteIds.slice(0, 6), ["Nombre", "Cédula", "Órdenes Relacionadas", "Operaciones Comerciales"])).values()];
  const cedula = new Map(clientes.map((c) => [c.id, texto(c.fields["Cédula"])]));
  const nombre = new Map(clientes.map((c) => [c.id, texto(c.fields["Nombre"])]));
  const [ordenes, pedidos] = await Promise.all([
    porIds("Órdenes de Reparación", clientes.flatMap((c) => ids(c.fields["Órdenes Relacionadas"])).slice(0, 60), CAMPOS_ORDEN),
    porIds("Operación Comercial", clientes.flatMap((c) => ids(c.fields["Operaciones Comerciales"])).slice(0, 60), CAMPOS_PEDIDO),
  ]);
  const [a, b] = await Promise.all([candidatosDeOrdenes([...ordenes.values()], cedula, nombre), candidatosDePedidos([...pedidos.values()])]);
  return [...a, ...b];
}

async function candidatosPorCedula(cedulaNormalizada: string): Promise<Candidato[]> {
  if (cedulaNormalizada.length < 6) return [];
  const clientes = await listarTodo("Clientes", ["Nombre"],
    `LOWER(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({Cédula}&""," ",""),"-",""),".",""))="${escapeFormulaString(cedulaNormalizada)}"`);
  return cuentasDeClientes(clientes.map((c) => c.id));
}

/**
 * Buscar a qué cuenta asignar: "OR000552", "OP-2026-000151", un nombre o una
 * cédula. Si hay pago, se ordena por coincidencia (misma cédula, mismo monto).
 */
export async function buscarCuentas(q: string, pago?: { monto: number; identificacion: string; ambiente: string }): Promise<CandidatoSugerido[]> {
  const t = q.trim();
  let candidatos: Candidato[] = [];
  if (/^OR\d{3,}$/i.test(t)) {
    const ordenes = await listarTodo("Órdenes de Reparación", CAMPOS_ORDEN, `{ID}='${escapeFormulaString(t.toUpperCase())}'`);
    candidatos = await candidatosDeOrdenes(ordenes, new Map(), new Map());
  } else if (/^OP-[\d-]{3,}$/i.test(t)) {
    const pedidos = await listarTodo("Operación Comercial", CAMPOS_PEDIDO, `{Código Operación}='${escapeFormulaString(t.toUpperCase())}'`);
    candidatos = await candidatosDePedidos(pedidos);
  } else if (t.length >= 3) {
    const clientes = await buscarClientesOp(t);
    candidatos = await cuentasDeClientes(clientes.map((c) => c.id));
  }
  // D2: un pago de pruebas (QA) solo ve cuentas «Es prueba»; uno real, solo reales.
  const ambiente = pago?.ambiente ?? "Producción";
  return sugerir(pago ?? { monto: 0, identificacion: "" }, candidatos.filter((c) => mismoMundo(c, ambiente))).slice(0, 12);
}

// ─── 12b: "Registrar pago" con DeUna ────────────────────────────────────────

export type PagoDeUnaReciente = { codigo: string; monto: number; pagador: string; cedula: string; referencia: string; pagadoEn: string };

/** Pagos DeUna sin asignar de las últimas 2 horas (el empleado elige el suyo). */
export async function deUnaRecientes(): Promise<PagoDeUnaReciente[]> {
  const lista = await deUnaPorAsignarRecientes(2);
  // Los que ya se registraron a mano (mismo N.º de transferencia) no se ofrecen.
  const libres: IntentoRegistro[] = [];
  for (const i of lista) {
    const manual = i.autorizacion ? (await abonosDeTransaccion(i.autorizacion, "DeUna").catch(() => []))[0] : null;
    if (manual) await actualizarIntento(i.id, { estado: "Aplicado", abonoId: manual.id, detalle: "Ya estaba registrado a mano (mismo N.º de transferencia)." }).catch(() => undefined);
    else libres.push(i);
  }
  return libres.map((i) => ({
    codigo: i.codigo, monto: i.monto, pagador: i.pagador, cedula: identificacionCorta(i.identificacion), referencia: i.autorizacion, pagadoEn: i.confirmadoEn || i.creado,
  }));
}

// ─── Cierre del día ─────────────────────────────────────────────────────────

export type DatosCierre = {
  fecha: string;
  pasarelas: CierrePasarela[];
  /** Pagos del día que todavía están por asignar o revisar (asígnalos primero). */
  pendientes: Record<Pasarela, { cantidad: number; monto: number }>;
};

async function movimientosCierre(pasarela: Pasarela, fecha: string): Promise<MovimientoCierre[]> {
  const movs = (await movimientosDe(pasarela)).filter((m) => diaEcuador(m.fecha) === fecha);
  return Promise.all(movs.map(async (m): Promise<MovimientoCierre> => {
    if (m.estado === "Acreditado") return { id: m.id, monto: m.monto, neto: m.montoNeto ?? m.monto, estado: "Acreditado", observacion: m.observacion ?? "" };
    const pago = m.abonoIds[0] ? await intentoDeAbono(m.abonoIds[0]).catch(() => null) : null;
    // Sin pago en línea (registrado a mano): la comisión de esa pasarela (tarjeta: 5,75 %).
    const neto = pago?.neto ?? tarifaYNeto(m.monto, pasarela, pasarela === "DeUna" ? "DeUna" : "Tarjeta de crédito").neto;
    return { id: m.id, monto: m.monto, neto, estado: "Pendiente", observacion: m.observacion ?? "" };
  }));
}

export async function datosCierre(fecha: string): Promise<DatosCierre> {
  const [deuna, payphone, pend] = await Promise.all([
    movimientosCierre("DeUna", fecha), movimientosCierre("PayPhone", fecha), intentosPendientesDeBandeja(),
  ]);
  const pendientes: DatosCierre["pendientes"] = { DeUna: { cantidad: 0, monto: 0 }, PayPhone: { cantidad: 0, monto: 0 } };
  for (const i of pend) {
    if (diaEcuador(i.confirmadoEn || i.creado) !== fecha || i.abonoId) continue;
    pendientes[i.pasarela].cantidad++;
    pendientes[i.pasarela].monto = Math.round((pendientes[i.pasarela].monto + i.monto) * 100) / 100;
  }
  return { fecha, pasarelas: [cierre("DeUna", deuna), cierre("PayPhone", payphone)], pendientes };
}

/**
 * "Acreditar el día en Finanzas": cada movimiento por acreditar de esa pasarela
 * y ese día pasa a SGINGRESOS con su neto (la comisión queda como ajuste). Es
 * el mismo Acreditar de Finanzas, uno por uno; si uno falla, los demás siguen.
 */
export async function acreditarDia(fecha: string, pasarela: Pasarela, usuario: string): Promise<{ acreditados: number; errores: string[] }> {
  const movs = (await movimientosCierre(pasarela, fecha)).filter((m) => m.estado === "Pendiente");
  let acreditados = 0;
  const errores: string[] = [];
  for (const m of movs) {
    try {
      await procesarAcreditacion(m.id, { montoNeto: m.neto, fecha: hoyEcuador(), registradoPor: usuario });
      acreditados++;
    } catch (e) {
      errores.push(e instanceof Error ? e.message : "error");
    }
  }
  return { acreditados, errores };
}
