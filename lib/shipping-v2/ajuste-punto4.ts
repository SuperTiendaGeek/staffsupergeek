// Ajuste de datos del punto 4 de la auditoría (Activos de la tienda),
// aprobado por el dueño el 8-oct-2026.
//
// · "Uso local" deja de ser un tipo de operación: lo que lo tenía pasa a
//   "Reajuste de inventario" (ya estaba en la tienda).
// · UN solo dato decide si es activo: la casilla "Es uso local".
//     - Tipo "Uso local" con etiqueta "Uso local" (OTR-000185, cable de la
//       impresora) → activo: casilla marcada, en la tienda (Recibido).
//     - Tipo "Uso local" a la venta (SSD-000011 a SSD-000016) → el dueño dijo
//       que son mercadería: casilla apagada, siguen a la venta.
// · Coherencia: etiqueta "Uso local" sin casilla → casilla marcada; casilla
//   marcada con etiqueta "Disponible" → etiqueta "Uso local".
//
// Módulo puro: sin red.

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type RegistroAjuste4 = {
  id: string;
  sku: string;
  tipoOperacion: string;
  estado: string;
  esUsoLocal: boolean;
  recibido: boolean;
  origenArticulo: string;
};

export type CambioAjuste4 = { id: string; sku: string; fields: Record<string, unknown>; resumen: string[] };

export function planAjustePunto4(r: RegistroAjuste4): CambioAjuste4 | null {
  const fields: Record<string, unknown> = {};
  const resumen: string[] = [];
  const tipoUsoLocal = normalize(r.tipoOperacion) === "uso local";
  const etiquetaUsoLocal = normalize(r.estado) === "uso local";
  const enTienda = normalize(r.origenArticulo) === "ya esta en la tienda" || r.recibido;

  let activo = r.esUsoLocal;
  if (tipoUsoLocal) {
    fields["Tipo de operación"] = "Reajuste de inventario";
    resumen.push("tipo Uso local → Reajuste de inventario");
    activo = etiquetaUsoLocal; // a la venta = mercadería (decisión del dueño)
  } else if (etiquetaUsoLocal) {
    activo = true;
  }

  if (activo !== r.esUsoLocal) {
    fields["Es uso local"] = activo;
    resumen.push(activo ? "pasa a activo de la tienda" : "es mercadería (casilla apagada)");
  }
  if (activo) {
    if (enTienda && !r.recibido) {
      fields["Recibido"] = true;
      resumen.push("Recibido (está en la tienda)");
    }
    if (enTienda && ["disponible", "reservado"].includes(normalize(r.estado))) {
      fields["Estado Item"] = "Uso local";
      resumen.push(`${r.estado} → Uso local`);
    }
    if (fields["Es uso local"] === true) fields["Disponible para venta"] = false;
  }
  return Object.keys(fields).length ? { id: r.id, sku: r.sku, fields, resumen } : null;
}
