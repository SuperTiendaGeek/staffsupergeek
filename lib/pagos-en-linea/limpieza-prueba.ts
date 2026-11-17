// Limpieza de un pedido de PRUEBA de pagos en línea (punto 23 / 10D, 17-nov-2026).
// Regla pura (con prueba); el script es scripts/limpieza-prueba-payphone.ts.
//
// Qué hace (decisión del dueño, 17-nov): solo con el pedido de prueba indicado,
//   1. anula los abonos "PRUEBA PayPhone (no es dinero real)" (nunca se borran);
//   2. cancela el pedido con la función oficial (líneas rechazadas, solicitudes
//      de compra "Por comprar" canceladas, pedido "Cancelado").
// Los tickets de la tabla "Pagos en línea" (PL-…) NO se tocan: quedan como
// evidencia de las pruebas.
//
// Se detiene sin escribir nada si encuentra algo que no sea de prueba: un abono
// real, un abono de prueba con movimiento en Finanzas, una compra ya hecha o un
// pedido entregado.

export const MARCA_ABONO_PRUEBA = "PRUEBA PayPhone";

export type AbonoLeido = {
  id: string;
  idAbono: number | null;
  monto: number;
  metodo: string;
  estado: string;
  observacion: string;
  movimientoId: string | null;
};

export type EstadoPedidoPrueba = {
  codigo: string;
  /** Estado comercial del pedido (Cotizando, Pedido confirmado, Cancelado…). */
  estado: string;
  abonos: AbonoLeido[];
  solicitudes: Array<{ codigo: string; estado: string }>;
};

export type PasoLimpieza =
  | { tipo: "anular_abono"; abonoId: string; texto: string }
  | { tipo: "cancelar_pedido"; texto: string };

export const esAbonoDePrueba = (a: AbonoLeido): boolean =>
  a.metodo === "PayPhone" && a.observacion.trim().startsWith(MARCA_ABONO_PRUEBA);

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

export function planLimpiezaPrueba(e: EstadoPedidoPrueba, codigoEsperado: string): { bloqueos: string[]; pasos: PasoLimpieza[] } {
  const bloqueos: string[] = [];
  if (e.codigo.trim().toUpperCase() !== codigoEsperado.trim().toUpperCase()) {
    bloqueos.push(`Se esperaba ${codigoEsperado} y se leyó ${e.codigo || "—"}.`);
  }
  if (e.estado === "Entregado") bloqueos.push("El pedido figura como Entregado: no es un pedido de prueba sin cerrar.");

  const vigentes = e.abonos.filter((a) => a.estado !== "Anulado");
  for (const a of vigentes) {
    const nombre = `Abono ${a.idAbono ?? a.id} (${usd(a.monto)}, ${a.metodo || "sin método"})`;
    if (!esAbonoDePrueba(a)) bloqueos.push(`${nombre} no está marcado "${MARCA_ABONO_PRUEBA}": podría ser dinero real. Revisar a mano.`);
    else if (a.movimientoId) bloqueos.push(`${nombre} tiene un movimiento en Finanzas: en Prueba no debería. Revisar a mano.`);
  }
  for (const s of e.solicitudes) {
    if (s.estado === "Comprada" || s.estado === "Entregada") {
      bloqueos.push(`La solicitud ${s.codigo} está "${s.estado}": hubo una compra real. Revisar a mano.`);
    }
  }
  if (bloqueos.length) return { bloqueos, pasos: [] };

  const pasos: PasoLimpieza[] = vigentes.map((a) => ({
    tipo: "anular_abono" as const,
    abonoId: a.id,
    texto: `Anular abono ${a.idAbono ?? a.id} · ${usd(a.monto)} · ${a.observacion.split(" · ").slice(0, 2).join(" · ")}`,
  }));
  if (e.estado !== "Cancelado") {
    const porComprar = e.solicitudes.filter((s) => s.estado === "Por comprar").map((s) => s.codigo);
    pasos.push({
      tipo: "cancelar_pedido",
      texto: `Cancelar ${e.codigo} (hoy "${e.estado}")${porComprar.length ? ` y su solicitud de compra ${porComprar.join(", ")}` : ""}`,
    });
  }
  return { bloqueos, pasos };
}
