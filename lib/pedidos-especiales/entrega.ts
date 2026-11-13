// Entregar un PEDIDO ESPECIAL al cliente — regla PURA (auditoría ops, punto 10C-2 · 12-nov-2026).
// Con prueba en __tests__/entrega.test.ts.
//
// Decisión del dueño (12-nov, Diseno_Fase3_Pedidos.md, 16): el pedido pasa a
// "Entregado" SOLO con "Entregar al cliente" (maqueta 4b), igual que la
// orden: llegó + cuenta en $0 + factura o recibo + quién retira. Emitir el
// documento ya no lo cierra por sí solo. Lo del dinero y el documento es la
// MISMA regla de la orden (lib/entrega/reglas.ts): aquí solo se agrega
// "¿llegó?" y el estado del pedido.
//
// Ejemplo (OP-2026-000134, Luis Andrade, Kindle $160): llegó el 17-nov,
// pagó $80. Panel: ✓ Llegó · ✕ Falta cobrar $80 · ✕ Falta el documento →
// Registrar pago → Emitir → Retira "Luis Andrade" → Entregar.

import { evaluarEntrega, type DocumentoDeEntrega } from "@/lib/entrega/reglas";

export type ArticuloParaEntrega = {
  /** Id de la línea aceptada. */
  id: string;
  descripcion: string;
  llego: boolean;
  /** Qué falta, si no llegó ("En camino", "Falta pedir · 2 días"…). */
  detalle: string;
};

export type RevisionPedido = { clave: "llego" | "cobro" | "documento"; ok: boolean; texto: string };

export type EvaluacionEntregaPedido = {
  revisiones: RevisionPedido[];
  /** Lo que todavía impide entregar (vacío = se puede). */
  faltas: string[];
  puedeEntregar: boolean;
};

export function evaluarEntregaPedido(input: {
  /** Estado comercial (Cotizando · Esperando al cliente · Aceptado · Entregado · Cancelado). */
  estado: string;
  /** Saldo de la cuenta: + falta cobrar · − sobra. */
  saldo: number;
  total: number;
  documento: DocumentoDeEntrega | null;
  articulos: readonly ArticuloParaEntrega[];
  /** Sin datos = solo se revisa (al abrir el panel). */
  datos?: { retiradoPor: string } | null;
}): EvaluacionEntregaPedido {
  const faltas: string[] = [];
  if (input.estado === "Entregado") faltas.push("El pedido ya está entregado.");
  else if (input.estado !== "Aceptado") faltas.push(`El pedido está "${input.estado}": no se entrega.`);

  const sinLlegar = input.articulos.filter((a) => !a.llego);
  const llego: RevisionPedido = input.articulos.length === 0
    ? { clave: "llego", ok: false, texto: "No hay nada aceptado para entregar" }
    : sinLlegar.length === 0
      ? { clave: "llego", ok: true, texto: "Llegó a la tienda" }
      : {
          clave: "llego", ok: false,
          texto: sinLlegar.length === 1
            ? `Aún no llega${sinLlegar[0].detalle ? ` · ${sinLlegar[0].detalle}` : ""}`
            : `Aún no llegan ${sinLlegar.length} artículos`,
        };

  // Dinero y documento: la regla de la orden, tal cual.
  const base = evaluarEntrega({
    estadoOrden: "",
    saldo: input.saldo,
    totalCobrable: input.total,
    enGarantia: 0,
    documento: input.documento,
    pendientes: [],
  });
  const cobro = base.revisiones.find((r) => r.clave === "cobro")!;
  const documento = base.revisiones.find((r) => r.clave === "documento")!;
  const revisiones: RevisionPedido[] = [llego, { ...cobro, clave: "cobro" }, { ...documento, clave: "documento" }];

  for (const r of revisiones) if (!r.ok) faltas.push(r.texto);
  if (input.datos && !input.datos.retiradoPor.trim()) faltas.push("Escribe quién retira.");
  return { revisiones, faltas, puedeEntregar: faltas.length === 0 };
}

/** Lo que queda en el historial interno del pedido al entregar. */
export function notaDeEntrega(retiradoPor: string, observacion?: string): string {
  const obs = (observacion ?? "").trim();
  return `Entregado. Retira: ${retiradoPor.trim()}.${obs ? ` ${obs}` : ""}`;
}
