// Punto 10D-0 (14-nov-2026) — pasar el HISTORIAL del Operaciones viejo
// (Entregado, Rechazado y Cancelado sin orden) al pedido especial nuevo, para
// que todo se vea en una sola pantalla. Regla PURA, con prueba en
// __tests__/migrar-historial.test.ts.
//
//   · Entregado → sigue Entregado. La opción elegida pasa a una línea
//     "Cargada" (con su artículo si lo tiene); las demás, a "Rechazada".
//   · Rechazado → pasa a Cancelado; todas sus opciones, a líneas "Rechazada".
//   · Cancelado → sigue Cancelado; sus opciones, a líneas "Rechazada".
//   · Las que tienen ORDEN de reparación no se tocan: viven en el presupuesto
//     de la orden y su estado "Rechazado" lo usa el cobro de la orden.
//   · Nunca se crea una línea "Aprobada" ni "Propuesta": no suman a la cuenta
//     ni quedan pendientes. Las Opciones viejas NO se borran.
// Nada de esto mueve dinero.

import { separarTexto, precioUnitarioDeOpcion, GRUPO_ALTERNATIVAS, type OpParaMigrar, type OpcionVieja } from "./migrar-abiertos";

export const USUARIO_MIGRACION_HISTORIAL = "Migración 10D-0";

export type LineaHistorial = {
  op: string;
  pedidoId: string;
  opcionId: string;
  descripcion: string;
  notaCliente: string;
  cantidad: number;
  precioUnitario: number;
  costo: number | null;
  url: string;
  tiempo: string;
  proveedorId: string | null;
  categoria: string;
  estado: "Cargada" | "Rechazada";
  grupo: string;
  itemId: string | null;
};

export type AccionHistorial =
  | { tipo: "crear_linea"; linea: LineaHistorial }
  | { tipo: "estado"; op: string; pedidoId: string; estado: "Cancelado"; observacion: string };

export type AvisoHistorial = { op: string; texto: string };

const ESTADOS_HISTORIA = new Set(["Entregado", "Rechazado", "Cancelado"]);

export function planMigracionHistorial(input: {
  operaciones: readonly OpParaMigrar[];
  opciones: readonly OpcionVieja[];
}): { acciones: AccionHistorial[]; avisos: AvisoHistorial[]; omitidasPorOrden: string[] } {
  const acciones: AccionHistorial[] = [];
  const avisos: AvisoHistorial[] = [];
  const omitidasPorOrden: string[] = [];
  const opcionPorId = new Map(input.opciones.map((o) => [o.id, o]));

  for (const op of input.operaciones) {
    if (!ESTADOS_HISTORIA.has(op.estado)) continue;
    if (op.lineaIds.length) continue; // ya está en el modelo nuevo
    if (op.ordenId) { omitidasPorOrden.push(op.codigo); continue; }

    let n = 0;
    for (const id of op.opcionIds) {
      const o = opcionPorId.get(id);
      if (!o) continue;
      const { descripcion, nota } = separarTexto(o.texto);
      const precio = precioUnitarioDeOpcion(o);
      if (!descripcion || !(precio > 0)) {
        avisos.push({ op: op.codigo, texto: `opción sin nombre o sin precio ("${o.texto.slice(0, 40)}"): queda como historia vieja` });
        continue;
      }
      const esLaElegida = op.estado === "Entregado" && op.opcionElegidaId === o.id;
      const itemId = esLaElegida
        ? (o.itemIds.find((i) => op.itemIds.includes(i)) ?? (op.itemIds.length === 1 ? op.itemIds[0] : null))
        : null;
      acciones.push({
        tipo: "crear_linea",
        linea: {
          op: op.codigo, pedidoId: op.id, opcionId: o.id, descripcion,
          notaCliente: [o.nota.trim(), nota].filter(Boolean).join(" "),
          cantidad: o.cantidad && o.cantidad > 0 ? Math.trunc(o.cantidad) : 1,
          precioUnitario: precio, costo: o.costo, url: o.url, tiempo: o.tiempo, proveedorId: o.proveedorId,
          categoria: op.categoria, estado: esLaElegida ? "Cargada" : "Rechazada", grupo: GRUPO_ALTERNATIVAS, itemId,
        },
      });
      n++;
    }
    if (op.estado === "Entregado" && n === 0) avisos.push({ op: op.codigo, texto: "entregado sin opciones migrables: sigue en la pantalla vieja (revisar a mano)" });
    if (op.estado === "Entregado" && n > 0 && !op.opcionElegidaId) avisos.push({ op: op.codigo, texto: "entregado sin opción elegida: todas pasan como rechazadas (revisar a mano)" });
    if (op.estado === "Rechazado") {
      acciones.push({
        tipo: "estado", op: op.codigo, pedidoId: op.id, estado: "Cancelado",
        observacion: n ? `Pasó al pedido nuevo como Cancelado (antes Rechazado) con ${n} ${n === 1 ? "opción" : "opciones"} de historia.` : "Pasó al pedido nuevo como Cancelado (antes Rechazado).",
      });
    }
  }
  return { acciones, avisos, omitidasPorOrden };
}
