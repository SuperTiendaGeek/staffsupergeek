import "server-only";

// Orden cerrada y «Regresó el equipo» — lado servidor (rediseño R6).
// Las reglas están en ./reglas.ts; aquí solo se lee y se escribe en Airtable.

import { withLock } from "@/lib/concurrencia";
import { ids, porIds, texto } from "@/lib/estado-cuenta/airtable";
import { origenesDeGarantia } from "@/lib/garantias/servidor";
import type { OrigenGarantia } from "@/lib/garantias/plazos";
import { AIRTABLE_TABLES } from "@/lib/tecnicos/config/airtable";
import { createHistorialEntrada, createOrdenReparacion } from "@/lib/tecnicos/airtable";
import {
  origenesDeLaOrden, revisarRegreso, textoQueFallo, textoRegresoEnAnterior, textoRegresoEnNueva,
  type TipoRegreso,
} from "./reglas";

export class ErrorRegreso extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const CAMPOS = ["ID", "Estado Actual", "Cliente", "ClienteTXT", "Equipo", "Ficha del equipo", "Facturas Electrónicas", "Recibos"];

export type OrdenBasica = {
  id: string;
  codigo: string;
  estado: string;
  clienteId: string | null;
  clienteNombre: string;
  equipo: string;
  fichaEquipoIds: string[];
  documentoIds: string[];
};

export async function leerOrdenBasica(ordenId: string): Promise<OrdenBasica | null> {
  const r = (await porIds(AIRTABLE_TABLES.ordenes, [ordenId], CAMPOS)).get(ordenId);
  if (!r) return null;
  const f = r.fields;
  return {
    id: r.id,
    codigo: texto(f["ID"]) || r.id,
    estado: texto(f["Estado Actual"]),
    clienteId: ids(f["Cliente"])[0] ?? null,
    clienteNombre: texto(f["ClienteTXT"]),
    equipo: texto(f["Equipo"]),
    fichaEquipoIds: ids(f["Ficha del equipo"]),
    documentoIds: [...ids(f["Facturas Electrónicas"]), ...ids(f["Recibos"])],
  };
}

/** «¿Qué falló?» de una orden: lo que salió con ella y su garantía. */
async function queFalloDe(orden: OrdenBasica): Promise<OrigenGarantia[]> {
  const todos = await origenesDeGarantia(orden.id).catch((e) => {
    console.error("[regreso] origenes de garantía", e);
    return [] as OrigenGarantia[];
  });
  return origenesDeLaOrden(todos, { documentoIds: orden.documentoIds, codigoOrden: orden.codigo });
}

export async function prepararRegreso(ordenId: string) {
  const orden = await leerOrdenBasica(ordenId);
  if (!orden) throw new ErrorRegreso("Orden no encontrada.", 404);
  return {
    codigo: orden.codigo,
    estado: orden.estado,
    equipo: orden.equipo,
    cliente: orden.clienteNombre,
    queFallo: (await queFalloDe(orden)).map((g) => ({
      clave: g.clave, nombre: g.nombre, tipo: g.tipo, documento: g.documento, vence: g.vence, vigente: g.vigente,
    })),
  };
}

type Usuario = { nombre: string | null; email: string | null; id: string | null };

/**
 * Crea la orden nueva enlazada (mismo cliente y equipo) y deja constancia en
 * la Actividad de las dos. Con turno por orden: dos clics seguidos no crean
 * dos órdenes a la vez.
 */
export async function registrarRegreso(o: {
  ordenId: string;
  tipo: unknown;
  motivo: unknown;
  queFalloClave?: string | null;
  usuario: Usuario;
}): Promise<{ ordenId: string; codigo: string; tipo: TipoRegreso }> {
  return withLock(`regreso:${o.ordenId}`, async () => {
    const orden = await leerOrdenBasica(o.ordenId);
    if (!orden) throw new ErrorRegreso("Orden no encontrada.", 404);
    const r = revisarRegreso({ estadoActual: orden.estado, tipo: o.tipo, motivo: o.motivo });
    if (!r.ok) throw new ErrorRegreso(r.error, r.status);
    const tipo = r.tipo as TipoRegreso;
    if (!orden.clienteId) throw new ErrorRegreso("La orden no tiene cliente: no se puede crear la nueva.", 409);

    let queFallo: string | null = null;
    if (tipo === "Garantía" && o.queFalloClave) {
      const g = (await queFalloDe(orden)).find((x) => x.clave === o.queFalloClave);
      if (!g) throw new ErrorRegreso("No se encontró lo que falló en esta orden. Vuelve a elegirlo.", 409);
      queFallo = textoQueFallo(g);
    }

    const creada = await createOrdenReparacion({
      clienteId: orden.clienteId,
      orden: { equipo: orden.equipo || "Equipo", ingresaPor: r.motivo as string },
      enlaces: { ordenAnteriorId: orden.id, tipoRegreso: tipo, fichaEquipoIds: orden.fichaEquipoIds },
    });

    const autor = { creadoPorNombre: o.usuario.nombre, creadoPorEmail: o.usuario.email, creadoPorUsuarioId: o.usuario.id };
    // Constancias: nunca frenan (la orden nueva ya existe).
    await Promise.allSettled([
      createHistorialEntrada({
        ordenRecordId: creada.airtableRecordId,
        avanceTexto: textoRegresoEnNueva({ codigoAnterior: orden.codigo, tipo, queFallo }),
        tipoActividad: "Regreso", visibilidad: "Interna", ...autor,
      }),
      createHistorialEntrada({
        ordenRecordId: orden.id,
        avanceTexto: textoRegresoEnAnterior({ codigoNueva: creada.ordenId, tipo }),
        tipoActividad: "Regreso", visibilidad: "Interna", ...autor,
      }),
    ]).then((rs) => rs.forEach((x) => { if (x.status === "rejected") console.error("[regreso] historial", x.reason); }));

    return { ordenId: creada.airtableRecordId, codigo: creada.ordenId, tipo };
  });
}
