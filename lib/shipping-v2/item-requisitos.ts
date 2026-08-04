// F-30 — qué le falta a un item para poder guardarse.
//
// El problema no era que faltara validación: el servidor (`validateItemInput`)
// sí exige todo esto y responde con mensajes concretos. El problema es que las
// mismas reglas estaban escritas DOS veces —una en el formulario, como avisos
// naranjas, y otra en el servidor— y no coincidían. El aviso "este flujo
// requiere proveedor de compra" se mostraba pero no impedía enviar, así que la
// persona llenaba todo, enviaba, y el error volvía del servidor.
//
// Aquí viven las reglas una sola vez, en forma de datos, para que el
// formulario pueda decir por adelantado qué falta usando exactamente el mismo
// criterio y el mismo texto que usará el servidor si se le escapa algo.
//
// El servidor SIGUE SIENDO LA AUTORIDAD: esto no lo reemplaza. Es la misma
// regla dicha antes, para no hacer perder el viaje.

export type RequisitosItemInput = {
  categoria?: string | null;
  cantidad?: number | null;
  /** Resultado del motor de reglas: si este flujo implica pagarle a un proveedor. */
  requierePago?: boolean;
  /** true cuando el tipo de operación es una compra a proveedor. */
  esCompraProveedor?: boolean;
  /** true cuando el tipo de operación es un regalo del proveedor. */
  esRegaloProveedor?: boolean;
  proveedorId?: string | null;
  costoProveedor?: number | null;
  precioVentaFinal?: number | null;
};

export type RequisitoFaltante = {
  /** Campo del formulario al que hay que llevar a la persona. */
  campo: "categoria" | "cantidad" | "proveedorId" | "costoProveedor" | "precioVentaFinal";
  /** Mismo texto que devolvería el servidor, para que no haya dos versiones. */
  mensaje: string;
};

function vacio(v?: string | null): boolean {
  return !v || v.trim() === "";
}

/**
 * Devuelve TODO lo que falta, no solo lo primero. Enseñar los problemas de uno
 * en uno obliga a enviar el formulario tantas veces como errores haya.
 */
export function requisitosFaltantesItem(input: RequisitosItemInput): RequisitoFaltante[] {
  const faltan: RequisitoFaltante[] = [];

  if (vacio(input.categoria)) {
    faltan.push({ campo: "categoria", mensaje: "Selecciona una categoría técnica/comercial para crear el item." });
  }

  const cantidad = input.cantidad;
  if (cantidad === null || cantidad === undefined || !Number.isInteger(cantidad) || cantidad < 1) {
    faltan.push({ campo: "cantidad", mensaje: "Cantidad debe ser un número entero mayor a 0." });
  }

  // Proveedor: por dos vías distintas, con el mensaje que corresponde a cada
  // una. Es el que faltaba en el formulario y llegaba al servidor.
  if (vacio(input.proveedorId)) {
    if (input.esCompraProveedor) {
      faltan.push({ campo: "proveedorId", mensaje: "Proveedor de compra es obligatorio para compras a proveedor." });
    } else if (input.requierePago) {
      faltan.push({ campo: "proveedorId", mensaje: "Proveedor de compra es obligatorio cuando el item requiere pago." });
    }
  }

  const costo = input.costoProveedor;
  if (input.esCompraProveedor && !(typeof costo === "number" && costo > 0)) {
    faltan.push({
      campo: "costoProveedor",
      mensaje: "Costo proveedor por unidad debe ser mayor a 0 para compras a proveedor.",
    });
  }
  // En un regalo, cobrar costo es una contradicción, no un olvido.
  if (input.esRegaloProveedor && typeof costo === "number" && costo !== 0) {
    faltan.push({
      campo: "costoProveedor",
      mensaje: "En regalos de proveedor, el costo proveedor por unidad debe estar vacío o ser 0.",
    });
  }

  // Precio final vacío es válido: significa "sin precio asignado todavía" y el
  // item simplemente no entra a facturación hasta tenerlo. Negativo no.
  const precio = input.precioVentaFinal;
  if (typeof precio === "number" && precio < 0) {
    faltan.push({ campo: "precioVentaFinal", mensaje: "Precio venta final por unidad no puede ser negativo." });
  }

  return faltan;
}

/** ¿Se puede guardar? Azúcar sobre lo anterior, para el `disabled` del botón. */
export function itemListoParaGuardar(input: RequisitosItemInput): boolean {
  return requisitosFaltantesItem(input).length === 0;
}
