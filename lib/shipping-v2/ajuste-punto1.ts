// Ajuste de datos de UNA SOLA VEZ para la regla de venta (auditoría Shipping
// V2, punto 1, aprobado por el dueño el 4-oct-2026). Lo corre
// scripts/ajuste-punto1-regla-venta.ts. Parte pura y con pruebas.
//
// Qué hace, por grupo de artículos:
//
//  · "Disponible" o "Reservado" (ya están a la venta y en la tienda): marca
//    "Recibido" y "Requiere inspección" apagada — salvo que la inspección ya
//    esté firmada, en cuyo caso se deja el valor de su categoría (sigue
//    vendible igual). Deja una nota en "Observaciones internas".
//  · "En revisión": requieren inspección. Los que ya tienen "Revisado" se dan
//    por inspeccionados y pasan a "Disponible"; los demás siguen su revisión.
//  · Lo que todavía no llega: "Requiere inspección" según su categoría.
//  · Lo que llegó directo y quedó congelado en "Pagado"/"Pendiente de pago"
//    (C-1): toma la etiqueta que le corresponde (Disponible / En revisión).
//    Si su revisión ya decía "Recibido correctamente" (o "Aceptado con
//    observación"), hoy se vende: se trata igual que lo que está a la venta
//    (sin inspección pendiente, con nota) para no bloquearlo.
//  · "Disponible para venta" (= se puede reservar) se recalcula con la regla
//    del sistema, sin encenderla nunca en un artículo con novedades
//    vinculadas (eso lo decide el ciclo de novedades, no este ajuste).
//  · Vendidos y demás estados finales: no se tocan.

import { calcularDisponibleVenta } from "./item-comercial";
import { unidadesLibres } from "./unidades";
import { estadoSegunLlegada, requiereInspeccionPorDefecto } from "./item-venta";

export const NOTA_AJUSTE_PUNTO1 =
  "[4-oct-2026] Ajuste auditoría Shipping V2 (punto 1): ya estaba a la venta en la tienda; queda Recibido y sin inspección pendiente.";

export type RegistroAjuste = {
  id: string;
  sku: string;
  estado: string;
  estadoRevision: string;
  categoria: string;
  tipoOperacion: string;
  recibido: boolean;
  requiereInspeccion: boolean;
  revisado: boolean;
  usoLocal: boolean;
  disponibleVenta: boolean;
  reservado: boolean;
  cantidad: number;
  cantidadReservada: number;
  tieneNovedades: boolean;
  observacionesInternas: string;
};

export type CambioAjuste = {
  id: string;
  sku: string;
  grupo: "a-la-venta" | "en-revision" | "en-camino" | "llego-directo" | "otro";
  fields: Record<string, unknown>;
  resumen: string[];
};

function normalize(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const EN_CAMINO = new Set(["registrado", "pendiente de pago", "pagado", "pendiente de packing", "en packing", "en transito"]);
const FINALES = new Set([
  "vendido", "usado en reparacion", "destinado a partes", "desarmado parcialmente", "desarmado completamente",
  "migrado", "cancelado", "archivado", "devuelto",
]);

export function planAjustePunto1(r: RegistroAjuste): CambioAjuste | null {
  const estado = normalize(r.estado);
  if (FINALES.has(estado)) return null;

  const porCategoria = requiereInspeccionPorDefecto({ categoria: r.categoria, tipoOperacion: r.tipoOperacion });
  const fields: Record<string, unknown> = {};
  const resumen: string[] = [];
  let grupo: CambioAjuste["grupo"] = "otro";

  let recibido = r.recibido;
  let requiere = r.requiereInspeccion;
  let estadoNuevo = r.estado;

  const revisionCerrada = ["recibido correctamente", "aceptado con observacion"].includes(normalize(r.estadoRevision));
  const yaALaVenta = estado === "disponible" || estado === "reservado" || (EN_CAMINO.has(estado) && r.recibido && revisionCerrada);

  if (yaALaVenta) {
    grupo = estado === "disponible" || estado === "reservado" ? "a-la-venta" : "llego-directo";
    // Con la inspección ya firmada se vende igual con cualquier valor: no se
    // toca. Antes se forzaba el valor de la categoría y chocaba con lo que el
    // grupo "En revisión" acababa de escribir (en la 2.ª corrida un cable
    // inspeccionado que pasó a "Disponible" volvía a cambiar: 63 casos).
    const requiereFinal = r.revisado ? requiere : false;
    if (!recibido) {
      recibido = true;
      fields["Recibido"] = true;
      resumen.push("Recibido ✓");
    }
    if (requiere !== requiereFinal) {
      requiere = requiereFinal;
      fields["Requiere inspección"] = requiereFinal;
      resumen.push(`Requiere inspección = ${requiereFinal ? "sí" : "no"}`);
    }
  } else if (estado === "en revision") {
    grupo = "en-revision";
    if (!requiere) {
      requiere = true;
      fields["Requiere inspección"] = true;
      resumen.push("Requiere inspección = sí");
    }
  } else if (EN_CAMINO.has(estado) && !recibido) {
    grupo = "en-camino";
    if (requiere !== porCategoria) {
      requiere = porCategoria;
      fields["Requiere inspección"] = porCategoria;
      resumen.push(`Requiere inspección = ${porCategoria ? "sí" : "no"} (por categoría)`);
    }
  } else if (EN_CAMINO.has(estado) && recibido) {
    grupo = "llego-directo";
    if (requiere !== porCategoria) {
      requiere = porCategoria;
      fields["Requiere inspección"] = porCategoria;
      resumen.push(`Requiere inspección = ${porCategoria ? "sí" : "no"} (por categoría)`);
    }
  } else if (estado === "recibido" || estado === "con novedad") {
    if (requiere !== porCategoria) {
      requiere = porCategoria;
      fields["Requiere inspección"] = porCategoria;
      resumen.push(`Requiere inspección = ${porCategoria ? "sí" : "no"} (por categoría)`);
    }
  }

  // Etiqueta según la regla nueva (solo dentro del camino de llegada).
  const etiqueta = estadoSegunLlegada({ estado: r.estado, recibido, requiereInspeccion: requiere, inspeccionFirmada: r.revisado });
  if (etiqueta) {
    estadoNuevo = etiqueta;
    fields["Estado Item"] = etiqueta;
    resumen.push(`Estado: ${r.estado} → ${etiqueta}`);
  }

  // "Disponible para venta" = se puede reservar. Nunca se enciende sobre un
  // artículo con novedades vinculadas: eso lo resuelve el ciclo de novedades.
  const dv = calcularDisponibleVenta({
    estado: estadoNuevo,
    estadoRevision: r.estadoRevision,
    usoLocal: r.usoLocal,
    unidadesLibres: unidadesLibres({ cantidad: r.cantidad, cantidadReservada: r.cantidadReservada, reservado: r.reservado }),
  });
  if (dv !== r.disponibleVenta && !(dv && r.tieneNovedades)) {
    fields["Disponible para venta"] = dv;
    resumen.push(`Se puede reservar = ${dv ? "sí" : "no"}`);
  }

  // La nota va solo a lo que estaba a la venta y efectivamente cambió.
  if (yaALaVenta && ["Recibido", "Requiere inspección", "Estado Item"].some((k) => k in fields) && !r.observacionesInternas.includes("[4-oct-2026] Ajuste auditoría Shipping V2 (punto 1)")) {
    fields["Observaciones internas"] = r.observacionesInternas ? `${r.observacionesInternas}\n${NOTA_AJUSTE_PUNTO1}` : NOTA_AJUSTE_PUNTO1;
  }

  if (!Object.keys(fields).length) return null;
  return { id: r.id, sku: r.sku, grupo, fields, resumen };
}
