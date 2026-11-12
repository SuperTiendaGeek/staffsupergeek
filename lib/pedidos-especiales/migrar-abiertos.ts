// Punto 10A-3 (12-nov-2026) — pasar los pedidos ABIERTOS del Operaciones viejo
// al pedido especial nuevo. Regla PURA, con prueba en __tests__/migrar-abiertos.test.ts.
//
// Decisión 6 del dueño (10-nov): los pedidos abiertos (Requerimiento sin orden
// + OP-126 Camila Gonzalez) pasan al pedido nuevo con su dinero; Rechazados,
// Cancelados y Entregados quedan como historia.
//
//   · Requerimiento / Cotizado → sus Opciones con precio pasan a ser
//     alternativas propuestas (líneas del Presupuesto con "Pedido") y el
//     pedido queda en "Cotizando": el empleado revisa precios y la envía (así
//     nace el enlace del cliente). Sin opciones → solo "Cotizando".
//   · Aprobado / Pedido con opción elegida → esa opción pasa a una línea
//     aceptada: "Cargada" con su artículo si ya se compró, si no "Aprobada";
//     el pedido queda "Aceptado". La cuenta NO cambia (el artículo ya cobraba
//     su precio; una línea Cargada no suma aparte).
//   · Las Opciones viejas NO se borran: quedan como historia.
// Nada de esto mueve dinero: los abonos siguen en el mismo pedido.

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const USUARIO_MIGRACION = "Migración 10A-3";
export const GRUPO_ALTERNATIVAS = "pedido";

export type OpParaMigrar = {
  id: string;
  codigo: string;
  estado: string;
  ordenId: string | null;
  categoria: string;
  /** "Líneas del pedido" ya existentes (si tiene, ya está en el modelo nuevo). */
  lineaIds: string[];
  opcionIds: string[];
  opcionElegidaId: string | null;
  itemIds: string[];
  abonado: number;
};

export type OpcionVieja = {
  id: string;
  texto: string;
  cantidad: number | null;
  precioUnitario: number | null;
  precioVenta: number | null;
  costo: number | null;
  url: string;
  tiempo: string;
  nota: string;
  proveedorId: string | null;
  /** Artículo creado desde esta opción (Shipping Items."Opción origen"). */
  itemIds: string[];
};

export type LineaNueva = {
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
  estado: "Propuesta" | "Aprobada" | "Cargada";
  grupo: string;
  itemId: string | null;
};

export type AccionMigracion =
  | { tipo: "crear_linea"; linea: LineaNueva }
  | { tipo: "estado"; op: string; pedidoId: string; estado: "Cotizando" | "Aceptado"; observacion: string };

export type AvisoMigracion = { op: string; texto: string };

const ABIERTOS_COTIZANDO = new Set(["Requerimiento", "Cotizado"]);
const ABIERTOS_ACEPTADOS = new Set(["Aprobado", "Pedido"]);

/**
 * "Laptop Lenovo … $690\r\n\r\n*USADA, GRADO A. … Bajo pedido." →
 * descripción "Laptop Lenovo …" + nota "*USADA, GRADO A. … Bajo pedido."
 * (el precio pegado al final del nombre se quita: el precio es el de la línea).
 */
export function separarTexto(texto: string): { descripcion: string; nota: string } {
  const lineas = (texto ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const primera = (lineas[0] ?? "").replace(/\s+\$\s?\d+(?:[.,]\d+)?\s*$/, "").trim();
  return { descripcion: primera, nota: lineas.slice(1).join(" ").trim() };
}

/** Precio por UNA unidad: el unitario si está; si no, el total ÷ cantidad. */
export function precioUnitarioDeOpcion(o: Pick<OpcionVieja, "precioUnitario" | "precioVenta" | "cantidad">): number {
  if (o.precioUnitario && o.precioUnitario > 0) return r2(o.precioUnitario);
  const cant = o.cantidad && o.cantidad > 0 ? o.cantidad : 1;
  return o.precioVenta && o.precioVenta > 0 ? r2(o.precioVenta / cant) : 0;
}

export function planMigracionAbiertos(input: {
  operaciones: readonly OpParaMigrar[];
  opciones: readonly OpcionVieja[];
}): { acciones: AccionMigracion[]; avisos: AvisoMigracion[] } {
  const acciones: AccionMigracion[] = [];
  const avisos: AvisoMigracion[] = [];
  const opcionPorId = new Map(input.opciones.map((o) => [o.id, o]));

  for (const op of input.operaciones) {
    if (op.ordenId) continue; // las de órdenes se separaron en 10A-0
    if (op.lineaIds.length) continue; // ya está en el modelo nuevo
    const cotizando = ABIERTOS_COTIZANDO.has(op.estado);
    const aceptado = ABIERTOS_ACEPTADOS.has(op.estado);
    if (!cotizando && !aceptado) continue;

    const base = (o: OpcionVieja, estado: LineaNueva["estado"], itemId: string | null): LineaNueva | null => {
      const { descripcion, nota } = separarTexto(o.texto);
      const precio = precioUnitarioDeOpcion(o);
      if (!descripcion || !(precio > 0)) {
        avisos.push({ op: op.codigo, texto: `opción sin nombre o sin precio ("${o.texto.slice(0, 40)}"): no pasa, queda como historia` });
        return null;
      }
      if (!o.proveedorId) avisos.push({ op: op.codigo, texto: `"${descripcion.slice(0, 40)}" no tiene proveedor: elegirlo antes de enviar` });
      return {
        op: op.codigo, pedidoId: op.id, opcionId: o.id, descripcion,
        notaCliente: [o.nota.trim(), nota].filter(Boolean).join(" "),
        cantidad: o.cantidad && o.cantidad > 0 ? Math.trunc(o.cantidad) : 1,
        precioUnitario: precio, costo: o.costo, url: o.url, tiempo: o.tiempo, proveedorId: o.proveedorId,
        categoria: op.categoria, estado, grupo: GRUPO_ALTERNATIVAS, itemId,
      };
    };

    if (cotizando) {
      let n = 0;
      for (const id of op.opcionIds) {
        const o = opcionPorId.get(id);
        if (!o) continue;
        const l = base(o, "Propuesta", null);
        if (l) { acciones.push({ tipo: "crear_linea", linea: l }); n++; }
      }
      if (!op.categoria) avisos.push({ op: op.codigo, texto: "sin categoría" });
      if (op.abonado > 0) avisos.push({ op: op.codigo, texto: `tiene $${r2(op.abonado)} abonados: siguen en el pedido` });
      acciones.push({
        tipo: "estado", op: op.codigo, pedidoId: op.id, estado: "Cotizando",
        observacion: n ? `Pasó al pedido nuevo con ${n} ${n === 1 ? "opción" : "opciones"} (revisar precios y enviar).` : "Pasó al pedido nuevo (sin opciones: cotizar).",
      });
      continue;
    }

    // Aceptado (Aprobado / Pedido): solo la opción elegida.
    const elegida = op.opcionElegidaId ? opcionPorId.get(op.opcionElegidaId) : undefined;
    if (!elegida) {
      avisos.push({ op: op.codigo, texto: "aceptado sin opción elegida: no se toca (revisar a mano)" });
      continue;
    }
    // El artículo de la opción: el que nació de ella, o el único del pedido.
    const itemId = elegida.itemIds.find((i) => op.itemIds.includes(i)) ?? (op.itemIds.length === 1 ? op.itemIds[0] : null);
    if (op.itemIds.length > 1 && !elegida.itemIds.some((i) => op.itemIds.includes(i))) {
      avisos.push({ op: op.codigo, texto: "varios artículos y ninguno nació de la opción elegida: no se toca (revisar a mano)" });
      continue;
    }
    const l = base(elegida, itemId ? "Cargada" : "Aprobada", itemId);
    if (!l) continue;
    if (!itemId) avisos.push({ op: op.codigo, texto: "aceptado sin artículo: queda Aprobada; crear su solicitud de compra desde Compras" });
    acciones.push({ tipo: "crear_linea", linea: l });
    acciones.push({
      tipo: "estado", op: op.codigo, pedidoId: op.id, estado: "Aceptado",
      observacion: `Pasó al pedido nuevo: aceptado "${l.descripcion}"${itemId ? " (ya comprado)" : ""}.`,
    });
  }
  return { acciones, avisos };
}
