import "server-only";

// Alertas de atención — lado servidor (rediseño R10). Reglas en ./reglas.ts.
// Lee las órdenes abiertas (unas 30) con sus líneas y calcula el semáforo de
// cada una. Los ajustes (horario y tiempos) viven en «Configuración del
// portal», clave «alertas-ordenes»; sin registro se usan los del tablero 11.

import { ids, listarTodo, porIds, texto } from "@/lib/estado-cuenta/airtable";
import { airtableMutation, tableUrl } from "@/lib/finanzas/airtable-client";
import { guardarConfiguracion, leerConfiguracion } from "@/lib/configuracion/airtable";
import { AIRTABLE_TABLES } from "@/lib/tecnicos/config/airtable";
import { createHistorialEntrada } from "@/lib/tecnicos/airtable";
import { lineasPorIds, T_PRESUPUESTO } from "@/lib/tecnicos/presupuesto/airtable";
import {
  evaluarOrden, mezclarConfig, minutosHabiles, notaSinAlerta, textoTarjeta, ordenarFilas, resumenAlertas, revisarConfig, revisarPosponer, textoFecha,
  textoHace, ultimoMovimiento,
  type Alerta, type ConfigAlertas, type FilaAlerta, type LineaAlerta, type OrdenAlerta,
} from "./reglas";
import { ETIQUETA_BAJA, evaluarBaja } from "@/lib/tecnicos/orden/baja";
import type { FilaTablero } from "@/lib/tecnicos/orden/tablero";
import { compartirLectura } from "@/lib/compartir-lectura";

export const CLAVE_CONFIG = "alertas-ordenes";
export const CAMPOS_ALERTA = {
  responsable: "Responsable",
  movimiento: "Último movimiento",
  pospuesta: "Alerta pospuesta hasta",
  avisado: "Cliente avisado",
  enviado: "Presupuesto enviado",
  completada: "Completada el",
  estadoCambiado: "Estado cambiado el",
} as const;

export class ErrorAlerta extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

type Usuario = { nombre: string | null; email: string | null; id: string | null };

// ─── Ajustes ─────────────────────────────────────────────────────────────────

let memoriaConfig: { en: number; config: ConfigAlertas; id: string | null; historial: string } | null = null;

export async function leerConfigAlertas(): Promise<ConfigAlertas> {
  if (memoriaConfig && Date.now() - memoriaConfig.en < 60_000) return memoriaConfig.config;
  const r = await leerConfiguracion(CLAVE_CONFIG).catch(() => ({ id: null, valor: null, historial: "" }));
  const config = mezclarConfig(r.valor);
  memoriaConfig = { en: Date.now(), config, id: r.id, historial: r.historial ?? "" };
  return config;
}

export async function guardarConfigAlertas(body: unknown, usuario: Usuario): Promise<ConfigAlertas> {
  const r = revisarConfig(body);
  if (!r.ok) throw new ErrorAlerta(r.error);
  const actual = await leerConfiguracion(CLAVE_CONFIG);
  const quien = usuario.nombre || usuario.email || "Administrador";
  const linea = `${new Date().toISOString()} · ${quien} cambió el horario o los tiempos de las alertas`;
  await guardarConfiguracion({
    id: actual.id, clave: CLAVE_CONFIG, valor: r.config, por: quien,
    historial: [linea, actual.historial].filter(Boolean).join("\n").slice(0, 20_000),
  });
  memoriaConfig = null;
  memoria = null;
  return r.config;
}

// ─── Lectura de las órdenes abiertas ─────────────────────────────────────────

const CAMPOS_ORDEN = [
  "ID", "Estado Actual", "Fecha de Ingreso", "ClienteTXT", "Equipo", T_PRESUPUESTO,
  CAMPOS_ALERTA.responsable, CAMPOS_ALERTA.movimiento, CAMPOS_ALERTA.pospuesta, CAMPOS_ALERTA.avisado, CAMPOS_ALERTA.enviado,
  CAMPOS_ALERTA.completada, CAMPOS_ALERTA.estadoCambiado,
];
const FORMULA_ABIERTAS = "AND({Estado Actual} != 'Finalizado Entregado', {Estado Actual} != 'Enviado a Reciclaje')";

type Registro = { id: string; fields: Record<string, unknown>; createdTime?: string };

/** «ClienteTXT» es un lookup: puede venir como lista o traer un id. */
function clienteDe(f: Record<string, unknown>): string {
  const v = Array.isArray(f["ClienteTXT"]) ? (f["ClienteTXT"] as unknown[])[0] : f["ClienteTXT"];
  const t = typeof v === "string" ? v : "";
  return t.startsWith("rec") ? "" : t;
}

function aOrdenAlerta(r: Registro, lineas: Map<string, LineaAlerta>): OrdenAlerta {
  const f = r.fields;
  const fecha = (k: string) => (texto(f[k]) || null);
  return {
    id: r.id,
    codigo: texto(f["ID"]) || r.id,
    estado: texto(f["Estado Actual"]) || "Pendiente",
    fechaIngreso: texto(f["Fecha de Ingreso"]) || r.createdTime || new Date().toISOString(),
    responsableId: ids(f[CAMPOS_ALERTA.responsable])[0] ?? null,
    ultimoMovimiento: fecha(CAMPOS_ALERTA.movimiento),
    pospuestaHasta: fecha(CAMPOS_ALERTA.pospuesta),
    clienteAvisado: fecha(CAMPOS_ALERTA.avisado),
    presupuestoEnviado: fecha(CAMPOS_ALERTA.enviado),
    completadaEl: fecha(CAMPOS_ALERTA.completada),
    estadoCambiadoEl: fecha(CAMPOS_ALERTA.estadoCambiado),
    lineas: ids(f[T_PRESUPUESTO]).map((id) => lineas.get(id)).filter((l): l is LineaAlerta => !!l),
  };
}

async function lineasDe(registros: Registro[]): Promise<Map<string, LineaAlerta>> {
  const todas = registros.flatMap((r) => ids(r.fields[T_PRESUPUESTO]));
  const lineas = await lineasPorIds(todas);
  return new Map(lineas.map((l) => [l.id, {
    estado: l.estado,
    estadoTrabajo: l.estadoTrabajo ?? "",
    motivoEspera: l.motivoEspera ?? "",
    trabajoEn: l.trabajoEn || null,
    fechaAprobacion: l.fechaAprobacion || null,
    bajoPedido: l.bajoPedido,
    tiempoEstimado: l.tiempoEstimado ?? "",
    descripcion: l.descripcion,
  }]));
}

export type FilaLista = FilaAlerta & { cliente: string; equipo: string; estado: string };

// Memoria corta: la barra de arriba pregunta cada pocos minutos desde cada pantalla.
let memoria: { en: number; filas: FilaLista[]; tablero: FilaTablero[] } | null = null;
export function olvidarAlertas() { memoria = null; }

export async function leerAlertas(): Promise<FilaLista[]> {
  return (await leerAbiertas()).filas;
}

/** Todas las órdenes abiertas para el tablero y la Lista (R8): la misma lectura que las alertas. */
export async function leerTablero(): Promise<FilaTablero[]> {
  return (await leerAbiertas()).tablero;
}

async function leerAbiertas(): Promise<{ filas: FilaLista[]; tablero: FilaTablero[] }> {
  if (memoria && Date.now() - memoria.en < 30_000) return memoria;
  // Si otra pantalla ya está leyendo lo mismo en esta instancia, se espera esa lectura (incidente 24-nov).
  return compartirLectura("alertas-ordenes-abiertas", leerAbiertasDeAirtable);
}

async function leerAbiertasDeAirtable(): Promise<{ filas: FilaLista[]; tablero: FilaTablero[] }> {
  const [registros, config] = await Promise.all([
    listarTodo(AIRTABLE_TABLES.ordenes, CAMPOS_ORDEN, FORMULA_ABIERTAS) as Promise<Registro[]>,
    leerConfigAlertas(),
  ]);
  const lineas = await lineasDe(registros);
  const ahora = new Date();
  const filas: FilaLista[] = [];
  const tablero: FilaTablero[] = [];
  for (const r of registros) {
    const o = aOrdenAlerta(r, lineas);
    const alerta = evaluarOrden(o, config, ahora);
    const baja = evaluarBaja(o, ahora);
    const cliente = clienteDe(r.fields);
    const equipo = texto(r.fields["Equipo"]);
    if (alerta) filas.push({ ordenId: o.id, codigo: o.codigo, responsableId: o.responsableId, alerta, cliente, equipo, estado: o.estado });
    const minutos = alerta ? alerta.minutos : minutosHabiles(ultimoMovimiento(o), ahora, config.horario);
    tablero.push({
      ordenId: o.id, codigo: o.codigo, cliente, equipo, estado: o.estado, responsableId: o.responsableId, fechaIngreso: o.fechaIngreso,
      nivel: alerta?.nivel ?? "alDia",
      texto: alerta ? textoTarjeta(alerta) : baja ? ETIQUETA_BAJA[baja.nivel] : notaSinAlerta(o),
      hace: alerta ? alerta.hace : baja ? `${baja.dias} d` : textoHace(minutos, config.horario),
      minutos,
      pospuestaHasta: alerta?.pospuestaHasta ?? null,
      baja,
    });
  }
  memoria = { en: Date.now(), filas: ordenarFilas(filas), tablero };
  return memoria;
}

export async function resumenParaBarra(yo: string | null) {
  const { filas, tablero } = await leerAbiertas();
  return { resumen: resumenAlertas(filas, yo), filas, tablero };
}

/** La alerta de una sola orden (franja dentro de la orden). */
export async function alertaDeOrden(ordenId: string): Promise<Alerta | null> {
  const r = (await porIds(AIRTABLE_TABLES.ordenes, [ordenId], CAMPOS_ORDEN)).get(ordenId) as Registro | undefined;
  if (!r) throw new ErrorAlerta("Orden no encontrada.", 404);
  const [lineas, config] = await Promise.all([lineasDe([r]), leerConfigAlertas()]);
  return evaluarOrden(aOrdenAlerta(r, lineas), config, new Date());
}

// ─── Posponer y último movimiento ────────────────────────────────────────────

export async function posponerAlerta(o: { ordenId: string; body: unknown; usuario: Usuario }): Promise<{ hasta: string }> {
  const config = await leerConfigAlertas();
  const r = revisarPosponer(o.body, new Date(), config.horario);
  if (!r.ok) throw new ErrorAlerta(r.error);
  await airtableMutation(`${tableUrl(AIRTABLE_TABLES.ordenes)}/${encodeURIComponent(o.ordenId)}`, {
    method: "PATCH", body: JSON.stringify({ fields: { [CAMPOS_ALERTA.pospuesta]: r.hasta } }),
  });
  await createHistorialEntrada({
    ordenRecordId: o.ordenId,
    avanceTexto: `Alerta pospuesta hasta el ${textoFecha(r.fecha)}: ${r.motivo}`,
    tipoActividad: "Alerta pospuesta",
    visibilidad: "Interna",
    creadoPorNombre: o.usuario.nombre,
    creadoPorEmail: o.usuario.email,
    creadoPorUsuarioId: o.usuario.id,
  });
  olvidarAlertas();
  return { hasta: r.hasta };
}
