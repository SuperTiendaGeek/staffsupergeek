import "server-only";

// Orden cerrada y «Regresó el equipo» — lado servidor (rediseño R6).
// Las reglas están en ./reglas.ts; aquí solo se lee y se escribe en Airtable.

import { CAMPO_ES_PRUEBA, esPrueba } from "@/lib/pruebas/reglas";
import { ErrorMotivo, camposDeMotivos } from "@/lib/tecnicos/motivos/servidor";
import { withLock } from "@/lib/concurrencia";
import { ids, porIds, texto } from "@/lib/estado-cuenta/airtable";
import { origenesDeGarantia } from "@/lib/garantias/servidor";
import type { OrigenGarantia } from "@/lib/garantias/plazos";
import { AIRTABLE_TABLES } from "@/lib/tecnicos/config/airtable";
import { createHistorialEntrada, createOrdenReparacion } from "@/lib/tecnicos/airtable";
import { fichaParaOrdenNueva } from "@/lib/tecnicos/equipos/servidor";
import {
  origenesDeLaOrden, revisarRegreso, textoQueFallo, textoRegresoEnAnterior, textoRegresoEnNueva,
  type TipoRegreso,
} from "./reglas";

export class ErrorRegreso extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const CAMPOS = ["ID", "Estado Actual", "Cliente", "ClienteTXT", "Equipo", "Ficha del equipo", "Facturas Electrónicas", "Recibos", CAMPO_ES_PRUEBA];

export type OrdenBasica = {
  /** Punto 16: el regreso de una orden de prueba también es de prueba. */
  esPrueba?: boolean;
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
    esPrueba: esPrueba(f),
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
  /** Rediseño R7: chips del motivo (el texto pasa a ser «lo que dijo el cliente»). */
  motivoIds?: unknown;
  queFalloClave?: string | null;
  usuario: Usuario;
}): Promise<{ ordenId: string; codigo: string; tipo: TipoRegreso }> {
  return withLock(`regreso:${o.ordenId}`, async () => {
    const orden = await leerOrdenBasica(o.ordenId);
    if (!orden) throw new ErrorRegreso("Orden no encontrada.", 404);
    let motivoIds: string[] | undefined;
    let motivo = o.motivo;
    if (o.motivoIds !== undefined) {
      try {
        const m = await camposDeMotivos(o.motivoIds, typeof o.motivo === "string" ? o.motivo : "");
        motivoIds = m.fields["Motivos"] as string[];
        motivo = m.fields["Ingresa Por"];
      } catch (e) {
        if (e instanceof ErrorMotivo) throw new ErrorRegreso(e.message, e.status);
        throw e;
      }
    }
    const r = revisarRegreso({ estadoActual: orden.estado, tipo: o.tipo, motivo });
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
      enlaces: { ordenAnteriorId: orden.id, tipoRegreso: tipo, fichaEquipoIds: orden.fichaEquipoIds, motivoIds, ordenAnteriorEsPrueba: orden.esPrueba },
    });

    // Rediseño R5: si la orden vieja no tenía ficha, la nueva la saca del texto.
    if (!orden.fichaEquipoIds.length && orden.equipo) {
      await fichaParaOrdenNueva({ ordenId: creada.airtableRecordId, clienteId: orden.clienteId, equipoTexto: orden.equipo, creadoPor: o.usuario.nombre || "Regreso" })
        .catch((e) => console.error("[regreso] ficha del equipo", e));
    }

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
