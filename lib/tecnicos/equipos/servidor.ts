import "server-only";

// Ficha del equipo — lado servidor (rediseño R4 + R5). Las reglas están en
// ./reglas.ts. La contraseña nunca viaja en la lectura de la ficha: se pide
// aparte con «Mostrar» y esa vista queda en la Actividad de la orden.

import { ids, porIds, texto } from "@/lib/estado-cuenta/airtable";
import { airtableMutation, tableUrl } from "@/lib/finanzas/airtable-client";
import { AIRTABLE_TABLES } from "@/lib/tecnicos/config/airtable";
import { createHistorialEntrada } from "@/lib/tecnicos/airtable";
import {
  TABLA_EQUIPOS, claveEquipo, historiaSinActual, interpretarEquipo, nombreEquipo, normalizarTipoEquipo,
  type DatosEquipo, type OrdenDeHistoria,
} from "./reglas";

export class ErrorEquipo extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const E = {
  nombre: "Equipo", tipo: "Tipo", marca: "Marca", modelo: "Modelo", serie: "Serie", cliente: "Cliente",
  contrasena: "Contraseña", notas: "Notas", creadoPor: "Creado por", ordenes: "Órdenes",
} as const;
const CAMPOS_FICHA = [E.nombre, E.tipo, E.marca, E.modelo, E.serie, E.cliente, E.contrasena, E.ordenes];

export type Ficha = {
  id: string;
  nombre: string;
  tipo: string;
  marca: string;
  modelo: string;
  serie: string;
  clienteId: string | null;
  /** Solo si hay contraseña guardada (el valor se pide aparte). */
  tieneContrasena: boolean;
  ordenIds: string[];
};

type Usuario = { nombre: string | null; email: string | null; id: string | null };

const aFicha = (r: { id: string; fields: Record<string, unknown> }): Ficha => ({
  id: r.id,
  nombre: texto(r.fields[E.nombre]),
  tipo: normalizarTipoEquipo(r.fields[E.tipo]) || "Otro",
  marca: texto(r.fields[E.marca]),
  modelo: texto(r.fields[E.modelo]),
  serie: texto(r.fields[E.serie]),
  clienteId: ids(r.fields[E.cliente])[0] ?? null,
  tieneContrasena: !!texto(r.fields[E.contrasena]).trim(),
  ordenIds: ids(r.fields[E.ordenes]),
});

export async function leerFichas(lista: string[]): Promise<Ficha[]> {
  if (!lista.length) return [];
  return [...(await porIds(TABLA_EQUIPOS, lista, CAMPOS_FICHA)).values()].map(aFicha);
}

const camposDe = (d: DatosEquipo) => ({
  [E.nombre]: nombreEquipo(d),
  [E.tipo]: d.tipo,
  [E.marca]: d.marca,
  [E.modelo]: d.modelo,
  [E.serie]: d.serie,
});

/** Texto «Equipo» de la orden a partir de la ficha (lo leen los PDF, listas y la IA). */
export const textoEquipoDeFicha = (d: DatosEquipo) => [d.tipo !== "Otro" ? d.tipo : "", nombreEquipo(d), d.serie ? `SN ${d.serie}` : ""].filter(Boolean).join(" ");

export async function crearFicha(o: { clienteId: string; datos: DatosEquipo; contrasena?: string; creadoPor: string }): Promise<string> {
  const r = await airtableMutation<{ id: string }>(tableUrl(TABLA_EQUIPOS), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        ...camposDe(o.datos),
        [E.cliente]: [o.clienteId],
        ...(o.contrasena?.trim() ? { [E.contrasena]: o.contrasena.trim() } : {}),
        [E.creadoPor]: o.creadoPor,
      },
      typecast: true,
    }),
  });
  return r.id;
}

export async function actualizarFicha(id: string, datos: DatosEquipo): Promise<void> {
  await airtableMutation(`${tableUrl(TABLA_EQUIPOS)}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: camposDe(datos), typecast: true }),
  });
}

async function patchOrden(ordenId: string, fields: Record<string, unknown>): Promise<void> {
  await airtableMutation(`${tableUrl(AIRTABLE_TABLES.ordenes)}/${encodeURIComponent(ordenId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

const CAMPOS_ORDEN = ["ID", "Cliente", "Equipo", "Ficha del equipo"];
const CAMPOS_HISTORIA = ["ID", "Fecha de Ingreso", "Estado Actual", "Ingresa Por", "Tipo de regreso"];

async function leerOrden(ordenId: string) {
  const r = (await porIds(AIRTABLE_TABLES.ordenes, [ordenId], CAMPOS_ORDEN)).get(ordenId);
  if (!r) throw new ErrorEquipo("Orden no encontrada.", 404);
  return {
    id: r.id,
    codigo: texto(r.fields["ID"]),
    clienteId: ids(r.fields["Cliente"])[0] ?? null,
    equipoTexto: texto(r.fields["Equipo"]),
    fichaId: ids(r.fields["Ficha del equipo"])[0] ?? null,
  };
}

export async function historiaDe(ficha: Ficha | null, actualId: string | null): Promise<OrdenDeHistoria[]> {
  if (!ficha?.ordenIds.length) return [];
  const ordenes = await porIds(AIRTABLE_TABLES.ordenes, ficha.ordenIds, CAMPOS_HISTORIA);
  return historiaSinActual([...ordenes.values()].map((r) => ({
    id: r.id,
    codigo: texto(r.fields["ID"]),
    fecha: texto(r.fields["Fecha de Ingreso"]),
    estado: texto(r.fields["Estado Actual"]),
    motivo: texto(r.fields["Ingresa Por"]).split("\n")[0].slice(0, 140),
    tipoRegreso: texto(r.fields["Tipo de regreso"]),
  })), actualId);
}

/** Todo lo que la tarjeta «Equipo» de la orden necesita (sin la contraseña). */
export async function fichaDeOrden(ordenId: string) {
  const orden = await leerOrden(ordenId);
  const [ficha] = orden.fichaId ? await leerFichas([orden.fichaId]) : [null];
  let delCliente: Ficha[] = [];
  if (orden.clienteId) {
    delCliente = (await fichasDelCliente(orden.clienteId)).filter((f) => f.id !== ficha?.id);
  }
  return {
    ordenCodigo: orden.codigo,
    equipoTexto: orden.equipoTexto,
    ficha: ficha ?? null,
    sugerida: interpretarEquipo(orden.equipoTexto),
    delCliente,
    historia: await historiaDe(ficha ?? null, orden.id),
  };
}

/** «Historia de tu equipo» en el enlace del cliente: sus servicios anteriores. */
export async function historiaParaCliente(ordenId: string): Promise<Array<{ codigo: string; fecha: string; motivo: string }>> {
  const orden = await leerOrden(ordenId);
  if (!orden.fichaId) return [];
  const [ficha] = await leerFichas([orden.fichaId]);
  return (await historiaDe(ficha ?? null, orden.id)).map((o) => ({ codigo: o.codigo, fecha: o.fecha, motivo: o.motivo }));
}

/** Liga la orden a una ficha del cliente, o crea la ficha y la liga. */
export async function registrarFichaDeOrden(o: {
  ordenId: string;
  equipoId?: string | null;
  datos?: DatosEquipo | null;
  contrasena?: string | null;
  usuario: Usuario;
}): Promise<Ficha> {
  const orden = await leerOrden(o.ordenId);
  if (!orden.clienteId) throw new ErrorEquipo("La orden no tiene cliente.", 409);
  let id = o.equipoId ?? null;
  if (id) {
    const [f] = await leerFichas([id]);
    if (!f || f.clienteId !== orden.clienteId) throw new ErrorEquipo("Ese equipo no es de este cliente.", 409);
    await patchOrden(o.ordenId, { "Ficha del equipo": [id] });
  } else {
    if (!o.datos) throw new ErrorEquipo("Faltan los datos del equipo.");
    id = await crearFicha({ clienteId: orden.clienteId, datos: o.datos, contrasena: o.contrasena ?? undefined, creadoPor: o.usuario.nombre || o.usuario.email || "Portal" });
    await patchOrden(o.ordenId, { "Ficha del equipo": [id], Equipo: textoEquipoDeFicha(o.datos) });
  }
  const [f] = await leerFichas([id]);
  return f;
}

/** Corrige los datos de la ficha (y el texto «Equipo» de la orden desde donde se corrige). */
export async function corregirFicha(o: { equipoId: string; ordenId: string | null; datos: DatosEquipo }): Promise<Ficha> {
  await actualizarFicha(o.equipoId, o.datos);
  if (o.ordenId) await patchOrden(o.ordenId, { Equipo: textoEquipoDeFicha(o.datos) }).catch((e) => console.error("[equipos] texto de la orden", e));
  const [f] = await leerFichas([o.equipoId]);
  return f;
}

const autor = (u: Usuario) => ({ creadoPorNombre: u.nombre, creadoPorEmail: u.email, creadoPorUsuarioId: u.id });

/** «Mostrar»: devuelve la contraseña y deja constancia en la Actividad de la orden. */
export async function verContrasena(o: { equipoId: string; ordenId: string; usuario: Usuario }): Promise<string> {
  const r = (await porIds(TABLA_EQUIPOS, [o.equipoId], [E.contrasena, E.ordenes])).get(o.equipoId);
  if (!r) throw new ErrorEquipo("Equipo no encontrado.", 404);
  if (!ids(r.fields[E.ordenes]).includes(o.ordenId)) throw new ErrorEquipo("Ese equipo no es de esta orden.", 409);
  const valor = texto(r.fields[E.contrasena]);
  await createHistorialEntrada({
    ordenRecordId: o.ordenId,
    avanceTexto: `${o.usuario.nombre || o.usuario.email || "Alguien"} vio la contraseña del equipo`,
    tipoActividad: "Contraseña vista", visibilidad: "Interna", ...autor(o.usuario),
  });
  return valor;
}

export async function cambiarContrasena(o: { equipoId: string; ordenId: string; valor: string; usuario: Usuario }): Promise<void> {
  const r = (await porIds(TABLA_EQUIPOS, [o.equipoId], [E.ordenes])).get(o.equipoId);
  if (!r) throw new ErrorEquipo("Equipo no encontrado.", 404);
  if (!ids(r.fields[E.ordenes]).includes(o.ordenId)) throw new ErrorEquipo("Ese equipo no es de esta orden.", 409);
  await airtableMutation(`${tableUrl(TABLA_EQUIPOS)}/${encodeURIComponent(o.equipoId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { [E.contrasena]: o.valor.trim().slice(0, 120) } }),
  });
  await createHistorialEntrada({
    ordenRecordId: o.ordenId,
    avanceTexto: o.valor.trim() ? "Se actualizó la contraseña del equipo" : "Se borró la contraseña del equipo",
    tipoActividad: "Sistema", visibilidad: "Interna", ...autor(o.usuario),
  });
}

async function fichasDelCliente(clienteId: string): Promise<Ficha[]> {
  const cli = (await porIds(AIRTABLE_TABLES.clientes, [clienteId], ["Equipos"])).get(clienteId);
  return leerFichas(ids(cli?.fields["Equipos"]));
}

/**
 * Al crear una orden: la ficha sale sola del texto. Si el cliente ya tiene
 * ese equipo (misma serie o mismo nombre), se usa su ficha y su historia.
 */
export async function fichaParaOrdenNueva(o: { ordenId: string; clienteId: string; equipoTexto: string; creadoPor: string }): Promise<string | null> {
  const datos = interpretarEquipo(o.equipoTexto);
  if (!datos.marca && !datos.modelo) return null;
  const clave = claveEquipo(o.clienteId, datos);
  const existente = (await fichasDelCliente(o.clienteId)).find((f) =>
    claveEquipo(o.clienteId, { tipo: f.tipo as DatosEquipo["tipo"], marca: f.marca, modelo: f.modelo, serie: f.serie }) === clave);
  const id = existente?.id ?? await crearFicha({ clienteId: o.clienteId, datos, creadoPor: o.creadoPor });
  await patchOrden(o.ordenId, { "Ficha del equipo": [id] });
  return id;
}
