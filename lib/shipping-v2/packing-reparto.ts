// Reparto de los costos logísticos de un packing (flete, arancel y otros)
// entre sus registros de Shipping Items. Puro y testeable: sin Airtable.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
//
// Hasta septiembre 2026 el reparto lo hacían fórmulas de Airtable, con dos
// errores que se sumaban cuando un registro traía más de una unidad
// (caso real PK-20260928-97012: 8 × $10,00 y 1 × $35,53, flete $55,80):
//
//   1. El peso de cada registro era su costo UNITARIO, no su subtotal
//      (costo × cantidad). El total del packing sumaba $45,53 en vez de
//      $115,53, así que 8 unidades pesaban lo mismo que 1.
//   2. Ese monto, que era del registro completo, se sumaba ENTERO al costo
//      de CADA unidad en "Costo total unidad". El flete se multiplicaba:
//      $141,62 cargados contra $55,80 pagados.
//
// Ahora el portal calcula aquí el monto de cada REGISTRO, lo cuadra al
// centavo con el total del packing y lo guarda en Airtable
// ("Flete asignado registro", etc. + "Unidades en packing"). Las fórmulas de
// Airtable ya solo dividen: por unidad = monto del registro ÷ unidades. Así
// Airtable y el portal muestran exactamente el mismo número.
//
// ─── Unidades: por qué no basta con "Cantidad" ───────────────────────────────
//
// "Cantidad" en Shipping Items es STOCK ACTUAL: baja con cada factura o
// recibo. Si el reparto usara la Cantidad de hoy, vender 3 de 8 unidades
// movería el flete entre artículos y cambiaría el costo de lo ya vendido.
// Por eso se guarda "Unidades en packing":
//   - mientras el packing NO se ha recibido, se sincroniza con Cantidad
//     (todavía es el dato de lo que viaja y puede corregirse);
//   - desde que se recibe, queda FIJO y es la única fuente válida.
// Un packing recibido cuyos registros nunca guardaron unidades (packings
// anteriores a este cambio) no se recalcula: conserva las fórmulas heredadas.

/** Estados en los que las unidades del packing ya quedaron fijas. */
export const ESTADOS_PACKING_UNIDADES_FIJAS = ["Recibido", "En revisión", "Con novedad", "Cerrado final"] as const;

/** Estados en los que no tiene sentido repartir costos. */
export const ESTADOS_PACKING_SIN_REPARTO = ["Cancelado"] as const;

export type ReglaReparto = "costo" | "cantidad" | "ninguna";

export type ItemParaReparto = {
  id: string;
  sku?: string;
  /** Stock actual del registro (campo Cantidad). */
  cantidad?: number | null;
  /** Unidades guardadas cuando se repartió por última vez. */
  unidadesEnPacking?: number | null;
  costoProveedor?: number | null;
  esRegalo?: boolean | null;
};

export type CostosPacking = {
  estado: string;
  regla?: string | null;
  flete?: number | null;
  arancel?: number | null;
  otrosCostos?: number | null;
};

export type RepartoRegistro = {
  id: string;
  sku: string;
  unidades: number;
  costoProveedorUnidad: number;
  /** costo proveedor por unidad × unidades (0 si es regalo). */
  subtotalProveedor: number;
  fleteRegistro: number;
  arancelRegistro: number;
  otrosRegistro: number;
  fletePorUnidad: number;
  arancelPorUnidad: number;
  otrosPorUnidad: number;
  totalUnidad: number;
};

export type ResultadoReparto =
  | {
      ok: true;
      regla: ReglaReparto;
      unidadesFijas: boolean;
      registros: RepartoRegistro[];
      totales: { subtotalProveedor: number; unidades: number; flete: number; arancel: number; otros: number };
      advertencias: string[];
    }
  | { ok: false; motivo: string };

function normalizar(valor?: string | null): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function enLista(estado: string, lista: readonly string[]) {
  const e = normalizar(estado);
  return lista.some((v) => normalizar(v) === e);
}

export function packingTieneUnidadesFijas(estado: string): boolean {
  return enLista(estado, ESTADOS_PACKING_UNIDADES_FIJAS);
}

export function packingSinReparto(estado: string): boolean {
  return enLista(estado, ESTADOS_PACKING_SIN_REPARTO);
}

/** Traduce el valor del select de Airtable a la regla que se aplica. */
export function reglaDeReparto(regla?: string | null): ReglaReparto {
  const r = normalizar(regla);
  if (r === "por costo del item") return "costo";
  if (r === "por cantidad") return "cantidad";
  return "ninguna"; // Manual, No definida, Por peso (bloqueada al guardar) o vacío
}

const aCentavos = (monto: number) => Math.round((monto + Number.EPSILON) * 100);

function montoValido(valor: number | null | undefined, etiqueta: string): number {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
    throw new Error(`${etiqueta} del packing no es un monto válido (${valor}).`);
  }
  return valor;
}

/**
 * Reparte `total` en proporción a `pesos`, en centavos exactos
 * (método del mayor residuo): cada parte se redondea hacia abajo y los
 * centavos que faltan van a las partes con mayor fracción descartada. La
 * suma de lo devuelto es SIEMPRE exactamente `total`.
 *
 * Desempates (para que el resultado no dependa del azar): mayor fracción,
 * luego mayor peso, luego el orden original.
 *
 * Si todos los pesos son 0 devuelve todo en 0 (quien llama decide si avisar).
 */
export function repartirEnCentavos(total: number, pesos: number[]): number[] {
  const centavos = aCentavos(total);
  const sumaPesos = pesos.reduce((acc, p) => acc + (p > 0 ? p : 0), 0);
  if (centavos === 0 || sumaPesos <= 0) return pesos.map(() => 0);

  const partes = pesos.map((peso, indice) => {
    const exacto = (centavos * (peso > 0 ? peso : 0)) / sumaPesos;
    // El 1e-9 absorbe errores de coma flotante (3863,9999999 → 3864).
    const base = Math.floor(exacto + 1e-9);
    return { indice, peso, base, fraccion: exacto - base };
  });

  let faltan = centavos - partes.reduce((acc, p) => acc + p.base, 0);
  const orden = [...partes].sort((a, b) =>
    b.fraccion - a.fraccion || b.peso - a.peso || a.indice - b.indice
  );
  for (let i = 0; faltan > 0 && i < orden.length; i++) {
    if (orden[i].peso <= 0) continue;
    orden[i].base += 1;
    faltan -= 1;
  }

  return partes.map((p) => p.base / 100);
}

/**
 * Unidades con las que se reparte un registro. Devuelve un número o el motivo
 * por el que no se puede (nunca inventa unidades).
 */
export function unidadesParaReparto(item: ItemParaReparto, unidadesFijas: boolean): number | string {
  const etiqueta = item.sku || item.id;
  if (unidadesFijas) {
    const guardadas = item.unidadesEnPacking;
    if (typeof guardadas === "number" && Number.isInteger(guardadas) && guardadas > 0) return guardadas;
    return `${etiqueta} no tiene "Unidades en packing" guardadas y el packing ya fue recibido (su Cantidad actual es stock, no lo que viajó).`;
  }
  const cantidad = item.cantidad;
  if (typeof cantidad === "number" && Number.isInteger(cantidad) && cantidad > 0) return cantidad;
  return `${etiqueta} tiene una Cantidad no válida (${cantidad ?? "vacía"}); debe ser un entero mayor a 0.`;
}

/**
 * Calcula el reparto completo de un packing. No escribe nada.
 *
 *  - "Por costo del item": peso = costo proveedor por unidad × unidades.
 *  - "Por cantidad":       peso = unidades.
 *  - Manual / No definida: todo en 0 (igual que antes).
 *
 * Total unidad = costo proveedor por unidad
 *              + flete del registro ÷ unidades
 *              + arancel del registro ÷ unidades
 *              + otros del registro ÷ unidades
 */
export function calcularRepartoPacking(packing: CostosPacking, items: ItemParaReparto[]): ResultadoReparto {
  if (packingSinReparto(packing.estado)) {
    return { ok: false, motivo: `El packing está ${packing.estado}: no se reparten costos.` };
  }

  const unidadesFijas = packingTieneUnidadesFijas(packing.estado);
  const regla = reglaDeReparto(packing.regla);
  const flete = montoValido(packing.flete, "Flete");
  const arancel = montoValido(packing.arancel, "Arancel");
  const otros = montoValido(packing.otrosCostos, "Otros costos");

  const base: Array<Omit<RepartoRegistro, "fleteRegistro" | "arancelRegistro" | "otrosRegistro" | "fletePorUnidad" | "arancelPorUnidad" | "otrosPorUnidad" | "totalUnidad">> = [];
  for (const item of items) {
    const unidades = unidadesParaReparto(item, unidadesFijas);
    if (typeof unidades === "string") return { ok: false, motivo: unidades };
    const costo = item.esRegalo ? 0 : montoValido(item.costoProveedor, `Costo proveedor de ${item.sku || item.id}`);
    base.push({
      id: item.id,
      sku: item.sku || item.id,
      unidades,
      costoProveedorUnidad: costo,
      subtotalProveedor: aCentavos(costo * unidades) / 100,
    });
  }

  const pesos = base.map((r) =>
    regla === "costo" ? r.subtotalProveedor : regla === "cantidad" ? r.unidades : 0
  );

  const advertencias: string[] = [];
  const hayCostos = flete > 0 || arancel > 0 || otros > 0;
  if (hayCostos && regla === "ninguna") {
    advertencias.push(
      `La regla "${packing.regla || "sin definir"}" no reparte automáticamente: los costos del packing quedan sin asignar a los artículos.`
    );
  } else if (hayCostos && base.length && pesos.every((p) => p <= 0)) {
    advertencias.push(
      regla === "costo"
        ? "Ningún artículo tiene costo proveedor: no hay base para repartir por costo. Usa \"Por cantidad\" o registra los costos."
        : "No hay unidades para repartir."
    );
  }

  const fletes = repartirEnCentavos(flete, pesos);
  const aranceles = repartirEnCentavos(arancel, pesos);
  const otrosRep = repartirEnCentavos(otros, pesos);

  const registros: RepartoRegistro[] = base.map((r, i) => {
    const fletePorUnidad = fletes[i] / r.unidades;
    const arancelPorUnidad = aranceles[i] / r.unidades;
    const otrosPorUnidad = otrosRep[i] / r.unidades;
    return {
      ...r,
      fleteRegistro: fletes[i],
      arancelRegistro: aranceles[i],
      otrosRegistro: otrosRep[i],
      fletePorUnidad,
      arancelPorUnidad,
      otrosPorUnidad,
      totalUnidad: r.costoProveedorUnidad + fletePorUnidad + arancelPorUnidad + otrosPorUnidad,
    };
  });

  const sumar = (f: (r: RepartoRegistro) => number) => aCentavos(registros.reduce((acc, r) => acc + f(r), 0)) / 100;
  return {
    ok: true,
    regla,
    unidadesFijas,
    registros,
    totales: {
      subtotalProveedor: sumar((r) => r.subtotalProveedor),
      unidades: registros.reduce((acc, r) => acc + r.unidades, 0),
      flete: sumar((r) => r.fleteRegistro),
      arancel: sumar((r) => r.arancelRegistro),
      otros: sumar((r) => r.otrosRegistro),
    },
    advertencias,
  };
}
