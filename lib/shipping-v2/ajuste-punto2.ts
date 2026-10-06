// Ajuste de datos de UNA SOLA VEZ para el punto 2 de la auditoría Shipping V2
// ("¿Dónde está el artículo?"), aprobado por el dueño el 6-oct-2026. Lo corre
// scripts/ajuste-punto2-origen.ts. Parte pura y con pruebas.
//
//  · Origen: lo recibido → "Ya está en la tienda"; lo que no llegó → local o
//    extranjero según el país de su proveedor. Sin proveedor: se reporta al
//    dueño y no se toca.
//  · Lo extranjero que no llegó y no tiene casillero → el casillero por
//    defecto (Laarbox). Así puede entrar a una caja de Laarbox junto con
//    compras de otros proveedores.
//  · Lo que viene de afuera, no llegó y tenía revisión "No aplica" o vacía →
//    "Pendiente de recepción" (C-2: nunca aparecía en Recepción).
//  · Tipos que ya no existen: Migración histórica → Reajuste de inventario
//    (con nota); Repuesto y Parte / componente → Compra a proveedor si tienen
//    proveedor, si no Reajuste de inventario. "Compra ya pagada" NO se toca
//    aquí: se convierte en el punto 9 (pagos) para no mover la pantalla de Pagos.
//  · Vendidos y demás estados finales: solo se convierte el tipo.

import { deducirOrigen, normalizarOrigen, vieneDeAfuera, ORIGEN_EXTRANJERO } from "./item-origen";

export const NOTA_MIGRADO = "[6-oct-2026] Migrado del sistema anterior (ago-2026). Tipo cambiado de “Migración histórica” a “Reajuste de inventario” (auditoría Shipping V2, punto 2).";

export type RegistroAjuste2 = {
  id: string;
  sku: string;
  estado: string;
  estadoRevision: string;
  tipoOperacion: string;
  recibido: boolean;
  origenArticulo: string;
  proveedorId: string;
  paisZonaProveedor: string;
  casilleroId: string;
  packingId: string;
  cantidad: number;
  observacionesInternas: string;
};

export type CambioAjuste2 = {
  id: string;
  sku: string;
  fields: Record<string, unknown>;
  resumen: string[];
};

function normalize(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const FINALES = new Set([
  "vendido", "usado en reparacion", "destinado a partes", "desarmado parcialmente", "desarmado completamente",
  "migrado", "cancelado", "archivado", "devuelto",
]);

export function planAjustePunto2(r: RegistroAjuste2, casilleroPorDefectoId: string | null): {
  cambio: CambioAjuste2 | null;
  sinProveedor: boolean;
} {
  const fields: Record<string, unknown> = {};
  const resumen: string[] = [];
  const tipo = normalize(r.tipoOperacion);

  // Tipos que ya no existen (también en vendidos: así la opción se puede borrar).
  if (tipo === "migracion historica") {
    fields["Tipo de operación"] = "Reajuste de inventario";
    resumen.push("Tipo: Migración histórica → Reajuste de inventario");
    if (!r.observacionesInternas.includes("Migrado del sistema anterior")) {
      fields["Observaciones internas"] = r.observacionesInternas ? `${r.observacionesInternas}\n${NOTA_MIGRADO}` : NOTA_MIGRADO;
    }
  } else if (tipo === "repuesto" || tipo === "parte / componente") {
    const nuevo = r.proveedorId ? "Compra a proveedor" : "Reajuste de inventario";
    fields["Tipo de operación"] = nuevo;
    resumen.push(`Tipo: ${r.tipoOperacion} → ${nuevo}`);
  }

  let sinProveedor = false;
  if (!FINALES.has(normalize(r.estado))) {
    let origen = normalizarOrigen(r.origenArticulo);
    if (!origen) {
      origen = deducirOrigen({ recibido: r.recibido, estado: r.estado, tipoOperacion: r.tipoOperacion, tieneProveedor: Boolean(r.proveedorId), paisZonaProveedor: r.paisZonaProveedor });
      if (origen) {
        fields["Origen del artículo"] = origen;
        resumen.push(`Origen: ${origen}`);
      } else {
        sinProveedor = true;
      }
    }

    if (origen && vieneDeAfuera(origen) && !r.recibido && r.cantidad > 0) {
      if (origen === ORIGEN_EXTRANJERO && !r.casilleroId && casilleroPorDefectoId) {
        fields["Proveedor logístico / intermediario"] = [casilleroPorDefectoId];
        resumen.push("Casillero: Laarbox");
      }
      if (["", "no aplica"].includes(normalize(r.estadoRevision))) {
        fields["Estado de revisión"] = "Pendiente de recepción";
        resumen.push("Revisión: Pendiente de recepción (aparece en Por llegar)");
      }
    }
  }

  if (!Object.keys(fields).length) return { cambio: null, sinProveedor };
  return { cambio: { id: r.id, sku: r.sku, fields, resumen }, sinProveedor };
}
