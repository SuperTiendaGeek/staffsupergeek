import "server-only";
import { lineaConTrabajo, trabajoVisible } from "@/lib/tecnicos/presupuesto/trabajo";

// Asistente de la orden (punto 11B · 21-nov-2026) — servidor.
// Solo LEE lo que la regla pura (./contexto.ts) necesita. Lo que falta para
// entregar viene de la MISMA revisión de «Entregar al cliente»
// (lib/entrega/servidor.ts), no lo decide la IA. No lee teléfono ni cédula:
// el botón de WhatsApp usa el teléfono que ya tiene la pantalla.

import { fetchOrden, firstString, linkedIds } from "@/lib/facturacion/gancho/airtableGancho";
import { porIds, texto } from "@/lib/estado-cuenta/airtable";
import { listarLineas } from "@/lib/tecnicos/presupuesto/airtable";
import { revisarEntrega } from "@/lib/entrega/servidor";
import { fetchCatalogoServicios } from "@/lib/tecnicos/airtable";
import { coincidenciasParaOrden } from "@/lib/manual-tecnico/servidor";
import type { DatosOrdenIA, DatosTecnicoIA, EntradaHistorialIA, LineaIA } from "./contexto";
import { notasDelHistorial } from "./contexto";

export class ErrorAsistente extends Error {}

type CamposBase = {
  codigo: string;
  estado: string;
  tipoOrden: string;
  fechaIngreso: string;
  clienteNombre: string;
  equipo: string;
  ingresaPor: string;
  accesorios: string;
  diagnostico: string;
  notaInterna: string;
  entregadaEl: string | null;
  historialIds: string[];
};

async function leerBase(ordenId: string): Promise<CamposBase> {
  const orden = await fetchOrden(ordenId).catch(() => null);
  if (!orden) throw new ErrorAsistente("Orden no encontrada.");
  const f = orden.fields;
  return {
    codigo: firstString(f["ID"], ordenId),
    estado: texto(f["Estado Actual"]),
    tipoOrden: texto(f["Tipo Orden"]),
    fechaIngreso: firstString(f["Fecha de Ingreso"]),
    clienteNombre: texto(f["ClienteTXT"]),
    equipo: firstString(f["Equipo"]),
    ingresaPor: firstString(f["Ingresa Por"]),
    accesorios: firstString(f["Accesorios"]),
    diagnostico: firstString(f["Diagnostico Inicial"]),
    notaInterna: firstString(f["Nota interna"]),
    entregadaEl: firstString(f["Fecha de entrega"]) || null,
    historialIds: linkedIds(f["Historial de Estados"]),
  };
}

/** Historial con su autor, más antiguo primero. */
async function leerHistorial(ids: string[]): Promise<EntradaHistorialIA[]> {
  if (!ids.length) return [];
  const mapa = await porIds("Historial de Estados", ids, ["Estado Nuevo", "Fecha", "Creado por Nombre", "Técnico"]);
  return [...mapa.values()]
    .map((r) => ({
      fecha: texto(r.fields["Fecha"]) || r.createdTime || "",
      texto: texto(r.fields["Estado Nuevo"]),
      autor: texto(r.fields["Creado por Nombre"]) || texto(r.fields["Técnico"]),
    }))
    .filter((h) => h.texto.trim())
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Todo lo que la pestaña «La orden» le pasa a la IA. */
export async function leerOrdenParaIA(ordenId: string): Promise<DatosOrdenIA> {
  const base = await leerBase(ordenId);
  const [historial, lineas, revision] = await Promise.all([
    leerHistorial(base.historialIds),
    listarLineas(ordenId),
    revisarEntrega(ordenId),
  ]);
  const lineasIA: LineaIA[] = lineas.map((l) => ({
    descripcion: l.descripcion,
    tipo: l.tipo,
    estado: l.estado,
    cantidad: l.cantidad,
    precio: l.precioUnitario,
    respuestaCliente: l.respuestaCliente ?? "",
    garantia: l.garantia ?? "",
    fechaAprobacion: l.fechaAprobacion,
    // Lo que marcó el técnico (la espera automática del repuesto la ve en el pedido).
    avance: lineaConTrabajo(l) ? trabajoVisible(l).texto : "",
  }));
  const total = revision.totalCobrable;
  const saldo = revision.saldo;
  return {
    codigo: base.codigo,
    estado: base.estado,
    tipoOrden: base.tipoOrden,
    fechaIngreso: base.fechaIngreso,
    clienteNombre: base.clienteNombre,
    equipo: base.equipo,
    ingresaPor: base.ingresaPor,
    accesorios: base.accesorios,
    diagnostico: base.diagnostico,
    notaInterna: base.notaInterna,
    historial,
    lineas: lineasIA,
    cuenta: { total, pagado: Math.round((total - saldo) * 100) / 100, saldo },
    revisiones: revision.revisiones.map((r) => ({ clave: r.clave, ok: r.ok, texto: r.texto })),
    pendientes: revision.pendientes.map((p) => ({ texto: p.texto, detalle: p.detalle, tipo: p.tipo })),
    entregadaEl: base.entregadaEl,
  };
}

/** Lo que necesita el técnico experto (sin la cuenta). */
export async function leerTecnicoParaIA(ordenId: string, conPrecios: boolean): Promise<DatosTecnicoIA & { estado: string }> {
  const base = await leerBase(ordenId);
  const [historial, biblioteca, servicios] = await Promise.all([
    leerHistorial(base.historialIds),
    coincidenciasParaOrden({ equipo: base.equipo, sintoma: `${base.ingresaPor} ${base.diagnostico}` }),
    conPrecios ? fetchCatalogoServicios().catch(() => []) : Promise.resolve([]),
  ]);
  return {
    codigo: base.codigo,
    estado: base.estado,
    equipo: base.equipo,
    ingresaPor: base.ingresaPor,
    diagnostico: base.diagnostico,
    notas: notasDelHistorial(historial),
    biblioteca,
    precios: servicios
      .filter((s) => s.activo && typeof s.costoSugerido === "number")
      .slice(0, 60)
      .map((s) => ({ nombre: s.nombre, precio: s.costoSugerido as number })),
  };
}

/** Lo que necesita el borrador del Manual técnico (al pasar a Completado). */
export async function leerOrdenParaBorrador(ordenId: string) {
  const base = await leerBase(ordenId);
  const [historial, lineas] = await Promise.all([leerHistorial(base.historialIds), listarLineas(ordenId)]);
  return {
    codigo: base.codigo,
    estado: base.estado,
    equipo: base.equipo,
    ingresaPor: base.ingresaPor,
    diagnostico: base.diagnostico,
    notaInterna: base.notaInterna,
    historial,
    lineas: lineas.map((l) => ({ descripcion: l.descripcion, tipo: l.tipo, estado: l.estado })),
  };
}

/** Datos mínimos para la tarjeta «Guardar en el Manual» (sin IA). */
export async function leerOrdenParaTarjeta(ordenId: string) {
  const base = await leerBase(ordenId);
  const historial = await leerHistorial(base.historialIds);
  return { codigo: base.codigo, estado: base.estado, equipo: base.equipo, ingresaPor: base.ingresaPor, diagnostico: base.diagnostico, historial };
}
