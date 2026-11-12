import "server-only";

// Seguimiento del PEDIDO ESPECIAL — lado servidor (punto 10B, 12-nov-2026).
// Reglas puras en ./seguimiento.ts. Lee lo que Logística ya registra en
// Shipping V2 (compra, rastreos, caja, flete, Recepción) EN BLOQUE: el tablero
// pide el seguimiento de todos sus pedidos aceptados con las mismas ~8
// lecturas que un solo pedido. Escribe únicamente "Seguimiento del pedido".

import { withLock } from "@/lib/concurrencia";
import { airtableMutation, fetchRecordsByIds, tableUrl, type AirtableRecord } from "@/lib/finanzas/airtable-client";
import { estadoComercial } from "./reglas";
import {
  conVistos, construirSeguimiento, corregirLlegada, deshacerUltimoManual, leerGuardado, marcarSiguiente, ponerAviso,
  quitarAviso, volverLlegadaAutomatica, type Ruta, type SenalArticulo, type SeguimientoGuardado, type SeguimientoVista,
} from "./seguimiento";

const T_OPERACIONES = "Operación Comercial";
const CAMPO = "Seguimiento del pedido";

const texto = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return texto(v[0]);
  return v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
};
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const porId = (rs: AirtableRecord[]) => new Map(rs.map((r) => [r.id, r]));

const ESTADOS_EN_CASILLERO = new Set(["En packing", "Pendiente de packing"]);
const ESTADOS_ENVIADO = new Set(["En tránsito", "En packing", "Pendiente de packing"]);

function fletePagado(pagos: AirtableRecord[]): { pagado: boolean; fecha: string | null } {
  const fletes = pagos.filter((p) => texto(p.fields["Concepto"]) === "Flete" && ["Pagado", "Parcial"].includes(texto(p.fields["Estado Pago"])));
  if (!fletes.length) return { pagado: false, fecha: null };
  const fechas = fletes.map((p) => texto(p.fields["Fecha real de pago"])).filter(Boolean).sort();
  return { pagado: true, fecha: fechas[0] ?? null };
}

/** El seguimiento de varios pedidos con lecturas en bloque. Guarda las fechas recién vistas. */
export async function seguimientosDePedidos(pedidoIds: string[], ahora: Date = new Date()): Promise<Map<string, SeguimientoVista>> {
  const out = new Map<string, SeguimientoVista>();
  if (!pedidoIds.length) return out;
  const ops = await fetchRecordsByIds(T_OPERACIONES, pedidoIds);
  const lineas = porId(await fetchRecordsByIds("Presupuesto por Orden", ops.flatMap((o) => ids(o.fields["Líneas del pedido"]))));
  const solicitudes = porId(await fetchRecordsByIds("Solicitudes de Compra", ops.flatMap((o) => ids(o.fields["Solicitudes de Compra"]))));
  const itemIds = [
    ...[...lineas.values()].flatMap((l) => ids(l.fields["Artículo de inventario"])),
    ...[...solicitudes.values()].flatMap((s) => ids(s.fields["Artículo"])),
  ];
  const provIds = [...lineas.values()].flatMap((l) => ids(l.fields["Proveedor"]));
  const [itemsL, provL] = await Promise.all([
    fetchRecordsByIds("Shipping Items", itemIds),
    fetchRecordsByIds("Shipping Proveedores", provIds),
  ]);
  const items = porId(itemsL);
  const proveedores = porId(provL);
  const packings = porId(await fetchRecordsByIds("Shipping Packings", itemsL.flatMap((i) => ids(i.fields["Shipping Packings"]))));
  const [pagosL, recepL] = await Promise.all([
    fetchRecordsByIds("Shipping Pagos", [
      ...itemsL.flatMap((i) => ids(i.fields["Shipping Pagos"])),
      ...[...packings.values()].flatMap((p) => ids(p.fields["Shipping Pagos"])),
    ]),
    fetchRecordsByIds("Shipping Recepciones", itemsL.flatMap((i) => ids(i.fields["Shipping Recepciones"]))),
  ]);
  const pagos = porId(pagosL);
  const recepciones = porId(recepL);

  for (const op of ops) {
    const estado = estadoComercial(texto(op.fields["Estado"]));
    const guardado = leerGuardado(texto(op.fields[CAMPO]));
    const aceptadas = ids(op.fields["Líneas del pedido"]).map((id) => lineas.get(id)).filter((l): l is AirtableRecord => !!l)
      .filter((l) => ["Aprobada", "Cargada"].includes(texto(l.fields["Estado"])));
    const solsDeOp = ids(op.fields["Solicitudes de Compra"]).map((id) => solicitudes.get(id)).filter((s): s is AirtableRecord => !!s)
      .filter((s) => texto(s.fields["Estado"]) !== "Cancelada");

    const rutas: Ruta[] = [];
    const articulos: SenalArticulo[] = aceptadas.map((l) => {
      const sol = solsDeOp.find((s) => ids(s.fields["Línea de presupuesto"]).includes(l.id));
      const itemId = ids(l.fields["Artículo de inventario"])[0] ?? (sol ? ids(sol.fields["Artículo"])[0] : undefined);
      const it = itemId ? items.get(itemId) : undefined;
      const origen = texto(it?.fields["Origen del artículo"]);
      if (origen === "Proveedor extranjero") rutas.push("extranjero");
      else if (origen === "Proveedor local" || origen === "Ya está en la tienda") rutas.push("local");
      else {
        const zona = texto(proveedores.get(ids(l.fields["Proveedor"])[0] ?? "")?.fields["País / zona logística"]);
        rutas.push(zona && zona.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() === "ecuador" ? "local" : "extranjero");
      }
      const comprada = sol && ["Comprada", "Entregada"].includes(texto(sol.fields["Estado"]));
      const compradoEn = comprada ? (texto(sol!.fields["Fecha compra"]) || texto(it?.fields["Fecha de registro"]) || null)
        : it ? (texto(it.fields["Fecha de registro"]) || null) : null;
      if (!it) {
        return { compradoEn, enviado: false, enCasillero: false, haciaEcuador: false, fleteEn: null, recibidoEn: null };
      }
      const estadoItem = texto(it.fields["Estado Item"]);
      const cajas = ids(it.fields["Shipping Packings"]).map((id) => packings.get(id)).filter((p): p is AirtableRecord => !!p);
      const pagosDeArt = [
        ...ids(it.fields["Shipping Pagos"]),
        ...cajas.flatMap((c) => ids(c.fields["Shipping Pagos"])),
      ].map((id) => pagos.get(id)).filter((p): p is AirtableRecord => !!p);
      const flete = fletePagado(pagosDeArt);
      const trackingEcuador = !!texto(it.fields["Tracking desde intermediario"]).trim() || cajas.some((c) => !!texto(c.fields["Tracking EC"]).trim());
      const recibido = it.fields["Recibido"] === true;
      const fechasRecepcion = ids(it.fields["Shipping Recepciones"]).map((id) => texto(recepciones.get(id)?.fields["Fecha de recepción"])).filter(Boolean).sort();
      return {
        compradoEn,
        enviado: !!texto(it.fields["Tracking hacia intermediario"]).trim() || !!texto(it.fields["Tracking directo"]).trim() || ESTADOS_ENVIADO.has(estadoItem),
        enCasillero: cajas.length > 0 || ESTADOS_EN_CASILLERO.has(estadoItem),
        haciaEcuador: trackingEcuador || flete.pagado,
        fleteEn: flete.fecha,
        recibidoEn: recibido ? (fechasRecepcion.pop() ?? (origen === "Ya está en la tienda" ? texto(it.fields["Fecha de registro"]) : "")) : null,
      };
    });
    const ruta: Ruta = rutas.includes("extranjero") || !rutas.length ? "extranjero" : "local";

    const vista = construirSeguimiento({
      estado,
      ruta,
      confirmadoEn: texto(op.fields["Aceptado en"]) || null,
      articulos,
      tiempos: aceptadas.map((l) => texto(l.fields["Tiempo estimado"])),
      guardado,
      ahora,
    });
    out.set(op.id, vista);
    if (Object.keys(vista.nuevosVistos).length) {
      await guardar(op.id, conVistos(guardado, vista.nuevosVistos)).catch((e) => console.warn("[seguimiento] no se guardó la fecha vista:", e));
    }
  }
  return out;
}

export async function seguimientoDelPedido(pedidoId: string): Promise<SeguimientoVista | null> {
  return (await seguimientosDePedidos([pedidoId])).get(pedidoId) ?? null;
}

async function guardar(pedidoId: string, g: SeguimientoGuardado): Promise<void> {
  await airtableMutation(tableUrl(T_OPERACIONES), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: pedidoId, fields: { [CAMPO]: JSON.stringify(g) } }] }),
  });
}

async function guardadoActual(pedidoId: string): Promise<SeguimientoGuardado> {
  const [op] = await fetchRecordsByIds(T_OPERACIONES, [pedidoId]);
  if (!op) throw new Error("El pedido no existe.");
  return leerGuardado(texto(op.fields[CAMPO]));
}

export type AccionSeguimiento =
  | { tipo: "siguiente" }
  | { tipo: "deshacer" }
  | { tipo: "aviso"; nota: string }
  | { tipo: "quitar_aviso" }
  | { tipo: "llegada"; desde: string; hasta: string }
  | { tipo: "llegada_auto" };

/** Acciones del empleado sobre el seguimiento. Devuelve el seguimiento nuevo. */
export async function accionSeguimiento(pedidoId: string, accion: AccionSeguimiento, usuario: string): Promise<SeguimientoVista | null> {
  return withLock(`pedido-seguimiento:${pedidoId}`, async () => {
    const vista = await seguimientoDelPedido(pedidoId);
    if (!vista || !vista.actual) throw new Error("El pedido aún no está confirmado.");
    const g = await guardadoActual(pedidoId);
    let nuevo: SeguimientoGuardado;
    switch (accion.tipo) {
      case "siguiente": nuevo = marcarSiguiente(g, vista, usuario); break;
      case "deshacer": nuevo = deshacerUltimoManual(g, vista); break;
      case "aviso": nuevo = ponerAviso(g, accion.nota, usuario); break;
      case "quitar_aviso": nuevo = quitarAviso(g); break;
      case "llegada": nuevo = corregirLlegada(g, accion.desde, accion.hasta, usuario); break;
      case "llegada_auto": nuevo = volverLlegadaAutomatica(g); break;
    }
    await guardar(pedidoId, nuevo);
    return seguimientoDelPedido(pedidoId);
  });
}
