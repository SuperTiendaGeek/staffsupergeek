// Cuadrar las unidades de un registro (punto 10c-4 de la auditoría Shipping
// V2, 22-oct-2026). Solo reglas, sin red.
//
// Un registro cuadra cuando:
//   compradas = en tienda + vendidas (facturas y recibos, menos devueltas)
//             + dadas de baja + vendidas fuera del sistema + salidas internas
//             − ventas de otro artículo cargadas aquí
//
// El Administrador cuenta cuántas hay en la tienda (o usa lo que anotó el
// Staff) y, si aun así no cuadra, elige qué pasó con la diferencia. Cada
// causa tiene una corrección fija (pedido del dueño: "cada opción debe
// resolver internamente en el inventario el problema"), siempre con motivo.

export const CAUSAS_FALTA = ["fuera", "perdida", "interna", "compra-de-mas"] as const;
export const CAUSAS_SOBRA = ["llegaron-mas", "venta-otro", "baja-error"] as const;
export type CausaFalta = (typeof CAUSAS_FALTA)[number];
export type CausaSobra = (typeof CAUSAS_SOBRA)[number];
export type CausaCuadre = CausaFalta | CausaSobra;

export const TEXTO_CAUSA: Record<CausaCuadre, string> = {
  fuera: "Vendida fuera del sistema",
  perdida: "Perdida, robo o daño",
  interna: "Usada en la tienda o reparación",
  "compra-de-mas": "Compra registrada de más",
  "llegaron-mas": "Llegaron más de lo comprado",
  "venta-otro": "Venta de otro artículo cargada aquí",
  "baja-error": "Baja registrada por error",
};

/** Qué hace cada causa (para la ayuda de la pantalla). */
export const EFECTO_CAUSA: Record<CausaCuadre, string> = {
  fuera: "Se anota en «Vendidas fuera del sistema».",
  perdida: "Se registra como baja (pérdida a costo).",
  interna: "Se anota en «Salidas internas».",
  "compra-de-mas": "Se corrige «Unidades compradas».",
  "llegaron-mas": "Se corrige «Unidades compradas».",
  "venta-otro": "Se anota en «Ventas de otro artículo»; el documento no se toca.",
  "baja-error": "Se quita de «Unidades dadas de baja».",
};

export type DatosCuadre = {
  /** null = el registro no tiene "Unidades compradas". */
  compradas: number | null;
  tienda: number;
  reservadas: number;
  /** Vendidas en facturas y recibos de este portal, menos las devueltas. */
  vendidas: number;
  bajas: number;
  fuera: number;
  salidas: number;
  otro: number;
  /** Un equipo (seguimiento Unidad): en tienda solo puede haber 0 o 1. */
  unidad: boolean;
};

export type CambiosCuadre = {
  cantidad?: number;
  compradas?: number;
  bajas?: number;
  fuera?: number;
  salidas?: number;
  otro?: number;
};

export type PlanCuadre =
  | { ok: true; cambios: CambiosCuadre; diferencia: number; causa?: CausaCuadre; texto: string }
  | { ok: false; motivo: string };

/** Lo que el sistema "explica" con estas unidades en la tienda. */
export function explicadas(d: DatosCuadre, tienda = d.tienda) {
  return tienda + d.vendidas + d.bajas + d.fuera + d.salidas - d.otro;
}

/** Diferencia si en la tienda hay `n`: positiva = faltan, negativa = sobran, 0 = cuadra. */
export function diferenciaCuadre(d: DatosCuadre, n: number) {
  return d.compradas === null ? 0 : d.compradas - explicadas(d, n);
}

export function causasPara(diferencia: number): readonly CausaCuadre[] {
  return diferencia > 0 ? CAUSAS_FALTA : diferencia < 0 ? CAUSAS_SOBRA : [];
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function planCuadre(d: DatosCuadre, input: { n: number; causa?: CausaCuadre | "" }): PlanCuadre {
  const n = Number(input.n);
  if (!Number.isInteger(n) || n < 0 || n > 9999) return { ok: false, motivo: "Escribe cuántas hay en la tienda (un número entero)." };
  if (d.unidad && n > 1) return { ok: false, motivo: "Es un equipo (uno por uno): si hay más, regístralos como compra." };
  if (n < d.reservadas) return { ok: false, motivo: `Hay ${plural(d.reservadas, "unidad reservada", "unidades reservadas")} para un cliente: no pueden ser menos de ${d.reservadas}.` };
  const diferencia = diferenciaCuadre(d, n);
  const cambios: CambiosCuadre = {};
  const partes: string[] = [];
  if (n !== d.tienda) {
    cambios.cantidad = n;
    partes.push(`En tienda ${d.tienda} → ${n}${n > d.tienda ? ` (${plural(n - d.tienda, "encontrada", "encontradas")})` : ""}.`);
  }
  let causa: CausaCuadre | undefined;
  if (diferencia !== 0) {
    const c = input.causa || undefined;
    const validas = causasPara(diferencia);
    if (!c || !validas.includes(c)) {
      return { ok: false, motivo: diferencia > 0 ? `Elige qué pasó con ${plural(diferencia, "la que falta", "las que faltan")}.` : `Elige por qué ${plural(-diferencia, "sobra", "sobran")}.` };
    }
    causa = c;
    const k = Math.abs(diferencia);
    if (c === "fuera") cambios.fuera = d.fuera + k;
    else if (c === "perdida") cambios.bajas = d.bajas + k;
    else if (c === "interna") cambios.salidas = d.salidas + k;
    else if (c === "compra-de-mas") cambios.compradas = (d.compradas ?? 0) - k;
    else if (c === "llegaron-mas") cambios.compradas = (d.compradas ?? 0) + k;
    else if (c === "venta-otro") cambios.otro = d.otro + k;
    else if (c === "baja-error") {
      if (d.bajas < k) return { ok: false, motivo: `Solo ${plural(d.bajas, "está dada de baja", "están dadas de baja")}: no se puede quitar ${k}.` };
      cambios.bajas = d.bajas - k;
    }
    partes.push(`${TEXTO_CAUSA[c]}: ${k}.`);
  }
  if (!partes.length) return { ok: false, motivo: "Ya cuadra: no hay nada que cambiar." };
  return { ok: true, cambios, diferencia, causa, texto: partes.join(" ") };
}

const FUERA_DE_TIENDA = new Set(["vendido", "agotado", "dado de baja", "usado en reparacion", "destinado a partes", "devuelto a proveedor", "desarmado completamente", "cancelado", "archivado"]);

function normal(texto?: string | null) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** El estado que corresponde después de cuadrar (null = no cambia). */
export function estadoTrasCuadre(item: {
  estado: string;
  n: number;
  causa?: CausaCuadre;
  usoLocal: boolean;
  requiereInspeccion: boolean;
  inspeccionFirmada: boolean;
}): string | null {
  const estado = normal(item.estado);
  if (item.n > 0) {
    if (!FUERA_DE_TIENDA.has(estado)) return null;
    if (item.requiereInspeccion && !item.inspeccionFirmada) return "En revisión";
    return item.usoLocal ? "Uso local" : "Disponible";
  }
  if (FUERA_DE_TIENDA.has(estado)) return null;
  if (item.causa === "fuera") return "Vendido";
  if (item.causa === "perdida") return "Dado de baja";
  if (item.causa === "interna") return "Usado en reparación";
  return "Agotado";
}
