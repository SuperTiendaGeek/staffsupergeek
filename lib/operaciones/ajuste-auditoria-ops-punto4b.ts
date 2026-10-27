// Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones,
// punto 4B (descuentos). Reglas PURAS; el script
// scripts/ajuste-auditoria-ops-punto4b.ts lee, muestra la vista previa y, con
// --aplicar, escribe.
//
// OR000423: en el punto 1 el −$20 del SSD REP-000017 (facturado a $20 en vez
// de $40, factura 001-002-000000683) se registró como un "servicio" de costo
// negativo, porque no existía otra forma. Ahora es un descuento de $20 sobre
// la línea del SSD (tabla "Descuentos de Cuenta") y el servicio negativo se
// borra. El total de la orden NO cambia ($110). Autorizado por el dueño
// (27-oct-2026).

import { descripcionDescuento } from "@/lib/estado-cuenta/descuentos";

export const MARCA_PUNTO4B = "Regularización auditoría ops punto 4B";

export const CASO_OR000423 = {
  ordenId: "recKaXWnpsFp6u744",
  ordenVisible: "OR000423",
  servicioNegativoId: "recYFzp1EazjNaLWb",
  ssdId: "recZHqQO1Klq1JGmi",
  ssdSku: "REP-000017",
  precioSsd: 40,
  monto: 20,
} as const;

export type LecturaServicio = { existe: boolean; costo: number; ordenIds: string[]; observacion: string; fecha: string | null };
export type LecturaItem = { existe: boolean; sku: string; nombre: string; precio: number; ordenStockIds: string[] };
export type LecturaDescuento = { cargoId: string; estado: string; monto: number };

export type AccionPunto4B =
  | { tipo: "crear-descuento"; descripcion: string; campos: Record<string, unknown> }
  | { tipo: "eliminar-servicio"; descripcion: string; id: string };

export type PlanPunto4B = { caso: string; acciones: AccionPunto4B[]; bloqueos: string[] };

export function planOR000423(input: {
  servicio: LecturaServicio;
  ssd: LecturaItem;
  descuentosDeLaOrden: LecturaDescuento[];
}): PlanPunto4B {
  const C = CASO_OR000423;
  const caso = C.ordenVisible;
  const bloqueos: string[] = [];
  const { servicio, ssd } = input;

  if (!ssd.existe) bloqueos.push(`${C.ssdSku} no existe`);
  else {
    if (ssd.sku !== C.ssdSku) bloqueos.push(`el artículo no es ${C.ssdSku} (es ${ssd.sku})`);
    if (Math.abs(ssd.precio - C.precioSsd) > 0.005) bloqueos.push(`${C.ssdSku} ya no cuesta $${C.precioSsd} (cuesta $${ssd.precio})`);
    if (!ssd.ordenStockIds.includes(C.ordenId)) bloqueos.push(`${C.ssdSku} ya no está cargado a ${caso}`);
  }
  if (servicio.existe) {
    if (Math.abs(servicio.costo + C.monto) > 0.005) bloqueos.push(`el servicio negativo ya no es de −$${C.monto} (es $${servicio.costo})`);
    if (!servicio.ordenIds.includes(C.ordenId)) bloqueos.push(`el servicio negativo ya no está en ${caso}`);
  }
  if (bloqueos.length) return { caso, acciones: [], bloqueos };

  const acciones: AccionPunto4B[] = [];
  const yaHayDescuento = input.descuentosDeLaOrden.some((d) => d.cargoId === C.ssdId && d.estado === "Vigente");
  if (!yaHayDescuento) {
    acciones.push({
      tipo: "crear-descuento",
      descripcion: `${caso}: descuento de $${C.monto} sobre ${C.ssdSku} (${ssd.nombre})`,
      campos: {
        "Descripción": descripcionDescuento(C.monto, ssd.nombre, caso),
        "Orden de Reparación": [C.ordenId],
        "Cargo ID": C.ssdId,
        "Tipo de cargo": "Repuesto",
        "Cargo": ssd.nombre,
        "Precio del cargo": C.precioSsd,
        "Monto": C.monto,
        "Motivo": `${MARCA_PUNTO4B}: SSD ${C.ssdSku} facturado a $20 (precio $40) en la factura 001-002-000000683. Antes estaba anotado como un servicio de −$20.${servicio.observacion ? ` Nota original: ${servicio.observacion}` : ""}`,
        "Estado": "Vigente",
        "Autorizado por": "Dueño (regularización de datos)",
        "Fecha": servicio.fecha ?? "2026-08-18T17:00:00.000Z",
      },
    });
  }
  if (servicio.existe) {
    acciones.push({
      tipo: "eliminar-servicio",
      descripcion: `${caso}: se borra el servicio negativo "Descuento: SSD ${C.ssdSku}…" (−$${C.monto}); ahora es un descuento de línea`,
      id: C.servicioNegativoId,
    });
  }
  return { caso, acciones, bloqueos };
}
