import "server-only";

// Despiece — escrituras contra Airtable. Las reglas y la aritmética viven en
// ./despiece.ts, sin red y con pruebas. Ver docs/DISENO_DESPIECE.md.
//
// Nota sobre nombres de campo: `Item padre`, `Items hijos`, `Costo asignado
// por despiece`, `Motivo de despiece`, `Fecha de despiece` y `Responsable de
// despiece` NO están en el mapa `SHIPPING_V2_ITEM_FIELDS` del esquema
// generado, así que se nombran por literal — igual que ya lo hace el mapeador
// de items para estos mismos campos. Si algún día se agregan al generador,
// conviene cambiarlos aquí también.

import {
  calcularCierreDespiece,
  evaluarSiSePuedeDespiezar,
  puedeCancelarseDespiece,
  repartirCostoEntrePiezas,
  type PiezaParaReparto,
} from "./despiece";

export const CAMPOS_DESPIECE = {
  itemPadre: "Item padre",
  itemsHijos: "Items hijos",
  costoAsignado: "Costo asignado por despiece",
  motivo: "Motivo de despiece",
  fecha: "Fecha de despiece",
  responsable: "Responsable de despiece",
} as const;

export type PiezaDespiece = {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  cantidad: number;
  condicion: string;
  precioVenta: number | null;
  costoAsignado: number;
  estadoItem: string;
  observaciones: string;
  numeroSerie: string;
  tieneFacturaORecibo: boolean;
};

export type ResumenDespiece = {
  padreId: string;
  puedeDespiezar: boolean;
  motivoBloqueo?: string;
  estadoDespiece: string;
  motivo: string;
  costoTotalEquipo: number;
  piezas: PiezaDespiece[];
  /** Costo que todavía no se repartió, para mostrarlo en el pie de la tabla. */
  sinRepartir: number;
  piezasSinPrecio: string[];
  puedeCancelar: boolean;
  motivoNoCancelable?: string;
};

export type NuevaPiezaInput = {
  nombre: string;
  categoria: string;
  cantidad: number;
  condicion?: string;
  precioVenta?: number | null;
  observaciones?: string;
  numeroSerie?: string;
};

/**
 * Lo que hereda una pieza de su equipo padre, y por qué:
 *
 * - **El proveedor de compra**, para que el historial siga cuadrando: esa
 *   pieza sigue viniendo, en última instancia, de esa compra.
 * - **Nace fuera de la venta y "En revisión"**, no disponible. Para publicarla
 *   se usa el botón "Listo para vender" que ya existe, de modo que una pieza
 *   recuperada pasa por el mismo control que cualquier otro artículo en vez de
 *   aparecer vendible sin que nadie la haya probado.
 * - **`Condición` = "No probado"** por omisión: es la verdad hasta que alguien
 *   la pruebe. Ese campo es el que responde "¿funciona?", no `Estado Item`.
 */
export const VALORES_PIEZA_NUEVA = {
  estadoItem: "En revisión",
  condicionPorDefecto: "No probado",
  tipoItem: "Parte",
  disponibleVenta: false,
} as const;

export function construirInputPiezaDespiece(
  entrada: NuevaPiezaInput,
  padre: { proveedorCompraId?: string | null; tipoOperacion?: string | null }
) {
  const nombre = (entrada.nombre ?? "").trim();
  if (!nombre) throw new Error("La pieza necesita un nombre.");
  const categoria = (entrada.categoria ?? "").trim();
  if (!categoria) throw new Error("La pieza necesita una categoría para poder asignarle un SKU.");

  const cantidad = Number.isInteger(entrada.cantidad) && entrada.cantidad > 0 ? entrada.cantidad : 1;
  const precio = typeof entrada.precioVenta === "number" && entrada.precioVenta > 0 ? entrada.precioVenta : null;

  return {
    nombre,
    descripcion: (entrada.observaciones ?? "").trim() || nombre,
    // La pieza no se compró: salió de algo que ya estaba pagado. No debe
    // generar un pago nuevo al proveedor ni pedir costo de compra.
    tipoOperacion: padre.tipoOperacion || "Compra ya pagada",
    tipoItem: VALORES_PIEZA_NUEVA.tipoItem,
    categoria,
    estado: VALORES_PIEZA_NUEVA.estadoItem,
    condicion: (entrada.condicion ?? "").trim() || VALORES_PIEZA_NUEVA.condicionPorDefecto,
    proveedorId: (padre.proveedorCompraId ?? "") || undefined,
    requierePago: false,
    requierePacking: false,
    afectaInventario: true,
    disponibleVenta: VALORES_PIEZA_NUEVA.disponibleVenta,
    reservado: false,
    modoLogistico: "No aplica",
    cantidad,
    unidad: "Unidad",
    // El costo NO se pone aquí: se calcula al repartir el costo del equipo
    // entre todas las piezas, y se escribe en "Costo asignado por despiece".
    costoProveedor: null,
    precioVenta: precio,
    numeroSerie: (entrada.numeroSerie ?? "").trim() || undefined,
    observacionesInternas: (entrada.observaciones ?? "").trim() || undefined,
  };
}

/** Campos extra que marcan a la pieza como recuperada de un despiece. */
export function camposVinculoPieza(padreRecordId: string): Record<string, unknown> {
  return {
    [CAMPOS_DESPIECE.itemPadre]: padreRecordId,
    "Es parte recuperada": true,
  };
}

/**
 * Recalcula el reparto del costo del equipo entre sus piezas y devuelve qué
 * hay que escribir en cada una. Se llama cada vez que se agrega, edita o borra
 * una pieza: el reparto depende de los precios de TODAS, así que agregar una
 * nueva cambia lo que cargan las demás.
 */
export function calcularRepartoParaPiezas(costoTotalEquipo: number, piezas: PiezaDespiece[]) {
  const paraReparto: PiezaParaReparto[] = piezas.map((p) => ({
    id: p.id,
    precioVenta: p.precioVenta,
    cantidad: p.cantidad,
  }));
  const reparto = repartirCostoEntrePiezas(costoTotalEquipo, paraReparto);
  return {
    ...reparto,
    // Solo se escriben las que cambian, para no generar escrituras inútiles.
    aEscribir: reparto.piezas.filter((r) => {
      const actual = piezas.find((p) => p.id === r.id)?.costoAsignado ?? 0;
      return Math.abs(actual - r.costoAsignado) >= 0.005;
    }),
  };
}

export { calcularCierreDespiece, evaluarSiSePuedeDespiezar, puedeCancelarseDespiece };
