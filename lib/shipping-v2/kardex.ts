// Kardex del inventario (auditoría Shipping V2, punto 12 · 24-oct-2026).
//
// El Kardex es un LIBRO DE MOVIMIENTOS que nunca se edita: cada entrada,
// salida o ajuste de costo de un registro de Shipping Items es un renglón de
// la tabla "Shipping Kardex". Un error no se borra: se corrige con otro
// movimiento al revés. Así trabajan Odoo (stock moves), NetSuite (stock
// ledger) y los POS (historial con motivo fijo).
//
// Decisiones del dueño (24-oct):
//  · Un artículo entra al Kardex AL LLEGAR a la tienda (Recibido). Lo que
//    viene en camino se ve aparte, en gris, y no suma al saldo.
//  · La historia se reconstruye desde los documentos que ya existen.
//  · Costos y valores solo los ve el Administrador.
//  · Reservas: línea gris informativa (no mueven el saldo).
//  · Activos de la tienda: su propio Kardex, separado de la mercadería.
//  · La cantidad no se edita a mano: solo cambia con acciones que dejan su
//    movimiento.
//
// Valoración: cada registro (una unidad o un lote de una compra) guarda su
// propio costo (punto 10b). Cada movimiento lleva el costo unitario del
// registro en ese momento; el valor del inventario es la suma de los valores.
// Un ajuste de costo (flete, arancel, mejora) cambia el valor sin mover
// unidades.
//
// Módulo puro: sin red. Lo usan kardex-registro.ts (escritura), las
// pantallas y el script de reconstrucción.

export const MOTIVOS_KARDEX = [
  // Entradas
  "Compra recibida",
  "Regalo del proveedor",
  "Reajuste de inventario",
  "Devolución del cliente",
  "Factura anulada",
  "Recibo anulado",
  "Encontrada",
  "Llegaron más de lo comprado",
  "Venta de otro artículo",
  "Baja revertida",
  "Pieza de despiece",
  "Pieza retirada en una mejora",
  "Pasa a la venta",
  "Pasa a activo de la tienda",
  "Mejora anulada",
  "Despiece revertido",
  "Saldo inicial",
  "Separación de unidad",
  // Salidas
  "Venta con factura",
  "Venta con recibo",
  "Usada en una mejora",
  "Dada de baja",
  "Vendida fuera del sistema",
  "Salida interna",
  "Desarmada",
  "Compra registrada de más",
  "Recepción revertida",
  "Registro eliminado",
  // Ambos sentidos
  "Ajuste del Kardex",
  // Sin unidades
  "Ajuste de costo",
] as const;
export type MotivoKardex = (typeof MOTIVOS_KARDEX)[number];

export type TipoKardex = "Entrada" | "Salida" | "Costo" | "Traslado";
export type AmbitoKardex = "Mercadería" | "Activo";
export const CAUSAS_BAJA = ["Perdido", "Robo", "Daño", "Error de registro", "Devuelto al proveedor", "Otro"] as const;
export type CausaBaja = (typeof CAUSAS_BAJA)[number];
export type DocumentoTipoKardex =
  | "Factura" | "Recibo" | "Nota de crédito" | "Orden de compra" | "Caja" | "Recepción" | "Conteo"
  | "Revisión" | "Mejora" | "Despiece" | "Novedad" | "Ficha" | "Pago" | "Reconstrucción";

export type ComponentesCosto = { proveedor: number; flete: number; arancel: number; otros: number; mejoras: number };

export type MovimientoKardex = {
  id?: string;
  clave: string;
  fecha: string;
  tipo: TipoKardex;
  motivo: MotivoKardex;
  /** + entra, − sale, 0 en un ajuste de costo. */
  cantidad: number;
  /** Costo por unidad del registro DESPUÉS de este movimiento. */
  costoUnitario: number | null;
  /** Efecto en el valor del inventario (+ / −). */
  valor: number;
  /** Precio de venta por unidad, sin IVA (solo ventas). */
  precioVenta: number | null;
  sku: string;
  serie: string;
  registroId: string;
  nombre: string;
  categoria: string;
  ambito: AmbitoKardex;
  documento: string;
  documentoTipo: DocumentoTipoKardex | "";
  documentoId: string;
  contraparte: string;
  causa: CausaBaja | "";
  componentes: ComponentesCosto | null;
  hechoPor: string;
  nota: string;
  origen: "Sistema" | "Reconstrucción";
};

/** Grupos de los atajos de la pantalla Movimientos. */
export type GrupoKardex = "ventas" | "compras" | "devoluciones" | "bajas" | "ajustes" | "taller" | "costos" | "traslados";

const GRUPO: Record<MotivoKardex, GrupoKardex> = {
  "Compra recibida": "compras",
  "Regalo del proveedor": "compras",
  "Reajuste de inventario": "ajustes",
  "Devolución del cliente": "devoluciones",
  "Factura anulada": "devoluciones",
  "Recibo anulado": "devoluciones",
  "Encontrada": "ajustes",
  "Llegaron más de lo comprado": "ajustes",
  "Venta de otro artículo": "ajustes",
  "Baja revertida": "bajas",
  "Pieza de despiece": "taller",
  "Pieza retirada en una mejora": "taller",
  "Pasa a la venta": "traslados",
  "Pasa a activo de la tienda": "traslados",
  "Mejora anulada": "taller",
  "Despiece revertido": "taller",
  "Saldo inicial": "ajustes",
  "Separación de unidad": "traslados",
  "Venta con factura": "ventas",
  "Venta con recibo": "ventas",
  "Usada en una mejora": "taller",
  "Dada de baja": "bajas",
  "Vendida fuera del sistema": "ajustes",
  "Salida interna": "ajustes",
  "Desarmada": "taller",
  "Compra registrada de más": "ajustes",
  "Recepción revertida": "ajustes",
  "Registro eliminado": "ajustes",
  "Ajuste del Kardex": "ajustes",
  "Ajuste de costo": "costos",
};

export function grupoDeMotivo(motivo: MotivoKardex): GrupoKardex {
  return GRUPO[motivo] ?? "ajustes";
}

export function esMotivoKardex(valor: unknown): valor is MotivoKardex {
  return typeof valor === "string" && (MOTIVOS_KARDEX as readonly string[]).includes(valor);
}

export function redondear(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Movimientos que pasan unidades entre registros del MISMO producto: no son ni entrada ni salida del producto. */
const TRASLADOS = new Set<MotivoKardex>(["Separación de unidad"]);

export function tipoPara(motivo: MotivoKardex, cantidad: number): TipoKardex {
  if (motivo === "Ajuste de costo") return "Costo";
  if (TRASLADOS.has(motivo)) return "Traslado";
  return cantidad >= 0 ? "Entrada" : "Salida";
}

export function claveKardex(...partes: Array<string | number | null | undefined>): string {
  return partes.map((p) => String(p ?? "").trim()).join("|");
}

/** "Perdido", "Robo"… a partir del texto del motivo (bajas hechas desde la ficha). */
export function causaDeBaja(texto: string | null | undefined): CausaBaja {
  const t = String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/devuelt[oa] al proveedor|devolucion al proveedor/.test(t)) return "Devuelto al proveedor";
  if (/\brob(o|ad[oa]|aron)\b|hurt/.test(t)) return "Robo";
  if (/error de registro|registr\w* por error|error\b/.test(t)) return "Error de registro";
  if (/\bperdi|extravi|no se encontr|no aparec/.test(t)) return "Perdido";
  if (/dan[oa]|rot[oa]|romp|quebr|mojad|averi|defect|falla|no sirve|no funciona/.test(t)) return "Daño";
  return "Otro";
}

// ─── Costo de un registro ────────────────────────────────────────────────────

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (Array.isArray(v)) return num(v[0]);
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

/** Componentes del costo por unidad, desde los campos de Airtable de Shipping Items. */
export function componentesDeCampos(f: Record<string, unknown>): ComponentesCosto {
  return {
    proveedor: redondear(num(f["Costo proveedor"])),
    flete: redondear(num(f["Costo flete asignado"])),
    arancel: redondear(num(f["Costo arancel asignado"])),
    otros: redondear(num(f["Otros costos asignados"])),
    mejoras: redondear(num(f["Costo de mejoras"])),
  };
}

export function costoDeComponentes(c: ComponentesCosto): number {
  return redondear(c.proveedor + c.flete + c.arancel + c.otros + c.mejoras);
}

/**
 * Costo por unidad del registro: "Costo total unidad" (la misma fórmula que
 * usan Pagos y la ficha). Una pieza de despiece todavía guarda su valor en
 * "Costo asignado por despiece" (punto 13): se usa si no hay otro.
 */
export function costoUnitarioDeCampos(f: Record<string, unknown>): number {
  const total = num(f["Costo total unidad"]);
  if (total > 0) return redondear(total);
  const componentes = costoDeComponentes(componentesDeCampos(f));
  if (componentes > 0) return componentes;
  return redondear(num(f["Costo asignado por despiece"]));
}

/** Qué cambió entre dos fotos del costo, en palabras ("flete y arancel"). */
export function textoAjusteCosto(antes: ComponentesCosto | null, ahora: ComponentesCosto): string {
  if (!antes) return "costo";
  const nombres: Array<[keyof ComponentesCosto, string]> = [
    ["proveedor", "costo del proveedor"], ["flete", "flete"], ["arancel", "arancel"], ["otros", "otros costos"], ["mejoras", "mejora"],
  ];
  const cambiaron = nombres.filter(([k]) => Math.abs((ahora[k] ?? 0) - (antes[k] ?? 0)) >= 0.005).map(([, n]) => n);
  if (!cambiaron.length) return "costo";
  if (cambiaron.length === 1) return cambiaron[0];
  return `${cambiaron.slice(0, -1).join(", ")} y ${cambiaron[cambiaron.length - 1]}`;
}

// ─── Datos del registro que van en cada movimiento ───────────────────────────

export type RegistroKardex = {
  id: string;
  sku: string;
  serie: string;
  nombre: string;
  categoria: string;
  ambito: AmbitoKardex;
  costoUnitario: number;
  componentes: ComponentesCosto;
};

function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return texto(v[0]);
  if (v && typeof v === "object" && "name" in (v as Record<string, unknown>)) return String((v as { name: unknown }).name ?? "");
  return "";
}

export function registroDeCampos(id: string, f: Record<string, unknown>): RegistroKardex {
  return {
    id,
    sku: texto(f["SKU"]).trim(),
    serie: texto(f["Número de serie"]).trim(),
    nombre: texto(f["Nombre del item"]).trim(),
    categoria: texto(f["Categoría"]).trim(),
    ambito: f["Es uso local"] === true ? "Activo" : "Mercadería",
    costoUnitario: costoUnitarioDeCampos(f),
    componentes: componentesDeCampos(f),
  };
}

/**
 * Cuántas unidades de este registro deberían estar en el libro: las que están
 * físicamente en la tienda. Lo que viene en camino (sin "Recibido") y las
 * piezas de un despiece sin completar todavía no entraron.
 */
export function unidadesEnLibro(f: Record<string, unknown>): number {
  if (f["Recibido"] !== true) return 0;
  const estado = texto(f["Estado Item"]).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (estado === "pieza en espera") return 0;
  const cantidad = num(f["Cantidad"]);
  return cantidad > 0 ? Math.round(cantidad) : 0;
}

// ─── Armar movimientos ───────────────────────────────────────────────────────

export type MovimientoNuevo = {
  clave: string;
  motivo: MotivoKardex;
  cantidad: number;
  registro: RegistroKardex;
  fecha?: string;
  /** Si no se da, el del registro. */
  costoUnitario?: number | null;
  /** Solo para "Ajuste de costo": cambio por unidad × unidades en la tienda. */
  valor?: number;
  precioVenta?: number | null;
  /** Para pasar a activo / a la venta: el ámbito del renglón (si no, el del registro). */
  ambito?: AmbitoKardex;
  documento?: string;
  documentoTipo?: DocumentoTipoKardex | "";
  documentoId?: string;
  contraparte?: string;
  causa?: CausaBaja | "";
  hechoPor?: string;
  nota?: string;
  origen?: "Sistema" | "Reconstrucción";
};

export function crearMovimiento(m: MovimientoNuevo, ahora = new Date().toISOString()): MovimientoKardex {
  const cantidad = Math.round(Number(m.cantidad) || 0);
  const costo = m.costoUnitario === null ? null : redondear(m.costoUnitario ?? m.registro.costoUnitario);
  const valor = m.motivo === "Ajuste de costo" ? redondear(m.valor ?? 0) : redondear(cantidad * (costo ?? 0));
  return {
    clave: m.clave,
    fecha: m.fecha || ahora,
    tipo: tipoPara(m.motivo, cantidad),
    motivo: m.motivo,
    cantidad,
    costoUnitario: costo,
    valor,
    precioVenta: typeof m.precioVenta === "number" && Number.isFinite(m.precioVenta) ? redondear(m.precioVenta) : null,
    sku: m.registro.sku,
    serie: m.registro.serie,
    registroId: m.registro.id,
    nombre: m.registro.nombre,
    categoria: m.registro.categoria,
    ambito: m.ambito ?? m.registro.ambito,
    documento: m.documento ?? "",
    documentoTipo: m.documentoTipo ?? "",
    documentoId: m.documentoId ?? "",
    contraparte: m.contraparte ?? "",
    causa: m.causa ?? "",
    componentes: m.registro.componentes,
    hechoPor: m.hechoPor ?? "",
    nota: m.nota ?? "",
    origen: m.origen ?? "Sistema",
  };
}

/** Texto del campo primario ("LAP-000500 · Venta con factura · −1"). */
export function tituloMovimiento(m: Pick<MovimientoKardex, "sku" | "motivo" | "cantidad" | "valor">): string {
  const q = m.motivo === "Ajuste de costo"
    ? `${m.valor >= 0 ? "+" : "−"}$${Math.abs(m.valor).toFixed(2)}`
    : `${m.cantidad > 0 ? "+" : m.cantidad < 0 ? "−" : ""}${Math.abs(m.cantidad)}`;
  return `${m.sku || "—"} · ${m.motivo} · ${q}`;
}

// ─── Saldos ──────────────────────────────────────────────────────────────────

export function ordenarMovimientos<T extends Pick<MovimientoKardex, "fecha" | "clave">>(movs: readonly T[]): T[] {
  return [...movs].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0));
}

export type SaldoRegistro = { cantidad: number; valor: number; costoUnitario: number | null; componentes: ComponentesCosto | null; movimientos: number };

/** Saldo de cada registro según el libro. */
export function saldosPorRegistro(movs: readonly MovimientoKardex[]): Map<string, SaldoRegistro> {
  const saldos = new Map<string, SaldoRegistro>();
  for (const m of ordenarMovimientos(movs)) {
    const s = saldos.get(m.registroId) ?? { cantidad: 0, valor: 0, costoUnitario: null, componentes: null, movimientos: 0 };
    s.cantidad += m.cantidad;
    s.valor = redondear(s.valor + m.valor);
    if (m.costoUnitario !== null) s.costoUnitario = m.costoUnitario;
    if (m.componentes) s.componentes = m.componentes;
    s.movimientos += 1;
    saldos.set(m.registroId, s);
  }
  return saldos;
}

export type MovimientoConSaldo = MovimientoKardex & { saldo: number; saldoValor: number };

/** Saldo corrido (en unidades y en dinero) de una lista de movimientos, en orden. */
export function conSaldo(movs: readonly MovimientoKardex[], inicial = { cantidad: 0, valor: 0 }): MovimientoConSaldo[] {
  let saldo = inicial.cantidad;
  let valor = inicial.valor;
  return ordenarMovimientos(movs).map((m) => {
    saldo += m.cantidad;
    valor = redondear(valor + m.valor);
    return { ...m, saldo, saldoValor: valor };
  });
}

/** Ajuste de costo pendiente para un registro: el costo cambió y el libro todavía tiene el anterior. */
export function planAjusteCosto(input: {
  registro: RegistroKardex;
  saldo: SaldoRegistro | undefined;
  clave: string;
  fecha?: string;
  hechoPor?: string;
  documento?: string;
  documentoTipo?: DocumentoTipoKardex | "";
  documentoId?: string;
  contraparte?: string;
}): MovimientoKardex | null {
  const s = input.saldo;
  // Nunca entró a la tienda: su costo de entrada será el que tenga al llegar.
  if (!s || s.movimientos === 0 || s.costoUnitario === null) return null;
  const delta = redondear(input.registro.costoUnitario - s.costoUnitario);
  if (Math.abs(delta) < 0.01) return null;
  const que = textoAjusteCosto(s.componentes, input.registro.componentes);
  return crearMovimiento({
    clave: input.clave,
    motivo: "Ajuste de costo",
    cantidad: 0,
    registro: input.registro,
    fecha: input.fecha,
    costoUnitario: input.registro.costoUnitario,
    valor: redondear(delta * Math.max(s.cantidad, 0)),
    documento: input.documento,
    documentoTipo: input.documentoTipo,
    documentoId: input.documentoId,
    contraparte: input.contraparte,
    hechoPor: input.hechoPor,
    nota: `${que}: ${delta > 0 ? "+" : "−"}$${Math.abs(delta).toFixed(2)} por unidad` + (s.cantidad > 0 ? "" : " (afecta lo ya vendido)"),
  });
}

/**
 * Movimiento que explica un cambio de unidades en la tienda. Recibe cuántas
 * había en el libro antes y cuántas hay ahora; si no cambió nada, null.
 */
export function movimientoPorCambio(input: Omit<MovimientoNuevo, "cantidad"> & { antes: number; despues: number }): MovimientoKardex | null {
  const delta = Math.round(input.despues - input.antes);
  if (delta === 0) return null;
  const { antes: _a, despues: _d, ...resto } = input;
  return crearMovimiento({ ...resto, cantidad: delta });
}

// ─── Lo que muestra la pantalla de un producto ───────────────────────────────

export type ResumenProducto = {
  entradas: number;
  salidas: number;
  saldo: number;
  valor: number;
  ultimaCompra: { fecha: string; contraparte: string; costo: number | null } | null;
  ultimaVenta: { fecha: string; contraparte: string; precio: number | null } | null;
  /** Fecha en que el saldo llegó a 0 (si hoy está en 0). */
  agotadoDesde: string | null;
  /** Días promedio entre la entrada y la salida (o hoy) de lo que entró. */
  diasEnTienda: number | null;
};

const ENTRADAS_DE_COMPRA = new Set<MotivoKardex>(["Compra recibida", "Regalo del proveedor", "Reajuste de inventario", "Saldo inicial"]);
const VENTAS = new Set<MotivoKardex>(["Venta con factura", "Venta con recibo", "Vendida fuera del sistema"]);

export function resumenProducto(movs: readonly MovimientoKardex[], hoy = new Date().toISOString()): ResumenProducto {
  const orden = ordenarMovimientos(movs.filter((m) => m.tipo !== "Traslado"));
  const todos = conSaldo(movs);
  let entradas = 0;
  let salidas = 0;
  let ultimaCompra: ResumenProducto["ultimaCompra"] = null;
  let ultimaVenta: ResumenProducto["ultimaVenta"] = null;
  for (const m of orden) {
    if (m.cantidad > 0) entradas += m.cantidad;
    if (m.cantidad < 0) salidas += -m.cantidad;
    if (ENTRADAS_DE_COMPRA.has(m.motivo) && m.cantidad > 0) ultimaCompra = { fecha: m.fecha, contraparte: m.contraparte, costo: m.costoUnitario };
    if (VENTAS.has(m.motivo) && m.cantidad < 0) ultimaVenta = { fecha: m.fecha, contraparte: m.contraparte, precio: m.precioVenta };
  }
  const ultimo = todos[todos.length - 1];
  let agotadoDesde: string | null = null;
  if (ultimo && ultimo.saldo <= 0) {
    for (let i = todos.length - 1; i >= 0; i--) {
      if (todos[i].saldo > 0) break;
      if (todos[i].cantidad < 0) agotadoDesde = todos[i].fecha;
    }
  }
  // Días en tienda: por registro, de su primera entrada a su última salida (o hoy).
  const porRegistro = new Map<string, { entra: string | null; sale: string | null; saldo: number }>();
  for (const m of todos) {
    const r = porRegistro.get(m.registroId) ?? { entra: null, sale: null, saldo: 0 };
    if (m.cantidad > 0 && !r.entra) r.entra = m.fecha;
    r.saldo += m.cantidad;
    r.sale = r.saldo <= 0 && m.cantidad < 0 ? m.fecha : r.saldo > 0 ? null : r.sale;
    porRegistro.set(m.registroId, r);
  }
  const dias: number[] = [];
  for (const r of porRegistro.values()) {
    if (!r.entra) continue;
    const fin = r.sale ?? hoy;
    dias.push(Math.max(0, (Date.parse(fin) - Date.parse(r.entra)) / 86_400_000));
  }
  return {
    entradas,
    salidas,
    saldo: ultimo?.saldo ?? 0,
    valor: ultimo?.saldoValor ?? 0,
    ultimaCompra,
    ultimaVenta,
    agotadoDesde,
    diasEnTienda: dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null,
  };
}

/** Ganancia de una venta (precio − costo) × unidades. */
export function gananciaDe(m: Pick<MovimientoKardex, "motivo" | "cantidad" | "precioVenta" | "costoUnitario">): number | null {
  if (!VENTAS.has(m.motivo) || m.cantidad >= 0 || m.precioVenta === null || m.costoUnitario === null) return null;
  return redondear((m.precioVenta - m.costoUnitario) * -m.cantidad);
}

// ─── Resumen por periodo e inventario a una fecha ────────────────────────────

export type FilaResumen = {
  clave: string;
  etiqueta: string;
  categoria: string;
  inicialU: number; inicialV: number;
  entradasU: number; entradasV: number;
  ajustesV: number;
  salidasU: number; salidasV: number;
  finalU: number; finalV: number;
  ultimaVenta: string | null;
};

export type ResumenPeriodo = {
  filas: FilaResumen[];
  total: Omit<FilaResumen, "clave" | "etiqueta" | "categoria" | "ultimaVenta">;
  costoVendido: number;
  ventas: number;
  ganancia: number;
};

/**
 * Saldo inicial · entradas · ajustes de costo · salidas · saldo final, por
 * categoría o por SKU. `desde` incluido, `hasta` excluido (ISO).
 */
export function resumenPeriodo(
  movs: readonly MovimientoKardex[],
  opciones: { desde: string; hasta: string; agrupar: "categoria" | "sku"; ambito?: AmbitoKardex }
): ResumenPeriodo {
  const filas = new Map<string, FilaResumen>();
  let costoVendido = 0;
  let ventas = 0;
  const vacia = (clave: string, etiqueta: string, categoria: string): FilaResumen => ({
    clave, etiqueta, categoria, inicialU: 0, inicialV: 0, entradasU: 0, entradasV: 0, ajustesV: 0, salidasU: 0, salidasV: 0, finalU: 0, finalV: 0, ultimaVenta: null,
  });
  for (const m of ordenarMovimientos(movs)) {
    if (opciones.ambito && m.ambito !== opciones.ambito) continue;
    if (m.fecha >= opciones.hasta) continue;
    const categoria = m.categoria || "Sin categoría";
    const clave = opciones.agrupar === "sku" ? m.sku || m.registroId : categoria;
    const fila = filas.get(clave) ?? vacia(clave, opciones.agrupar === "sku" ? `${m.sku} ${m.nombre}`.trim() : categoria, categoria);
    if (opciones.agrupar === "sku" && m.nombre) fila.etiqueta = `${m.sku} ${m.nombre}`.trim();
    if (m.fecha < opciones.desde) {
      fila.inicialU += m.cantidad;
      fila.inicialV = redondear(fila.inicialV + m.valor);
    } else if (m.tipo === "Costo") {
      fila.ajustesV = redondear(fila.ajustesV + m.valor);
    } else if (m.tipo === "Traslado") {
      // Entre registros del mismo producto: se netea, no es entrada ni salida.
      fila.entradasU += m.cantidad > 0 ? m.cantidad : 0;
      fila.salidasU += m.cantidad < 0 ? -m.cantidad : 0;
      fila.entradasV = redondear(fila.entradasV + (m.valor > 0 ? m.valor : 0));
      fila.salidasV = redondear(fila.salidasV + (m.valor < 0 ? -m.valor : 0));
    } else if (m.cantidad > 0) {
      fila.entradasU += m.cantidad;
      fila.entradasV = redondear(fila.entradasV + m.valor);
    } else {
      fila.salidasU += -m.cantidad;
      fila.salidasV = redondear(fila.salidasV - m.valor);
      if (VENTAS.has(m.motivo)) {
        fila.ultimaVenta = m.fecha;
        costoVendido = redondear(costoVendido - m.valor);
        if (m.precioVenta !== null) ventas = redondear(ventas + m.precioVenta * -m.cantidad);
      }
    }
    filas.set(clave, fila);
  }
  const total = { inicialU: 0, inicialV: 0, entradasU: 0, entradasV: 0, ajustesV: 0, salidasU: 0, salidasV: 0, finalU: 0, finalV: 0 };
  const lista = [...filas.values()].map((f) => {
    f.finalU = f.inicialU + f.entradasU - f.salidasU;
    f.finalV = redondear(f.inicialV + f.entradasV + f.ajustesV - f.salidasV);
    return f;
  }).filter((f) => f.inicialU || f.entradasU || f.salidasU || f.finalU || Math.abs(f.ajustesV) >= 0.01 || Math.abs(f.finalV) >= 0.01);
  for (const f of lista) {
    total.inicialU += f.inicialU; total.inicialV = redondear(total.inicialV + f.inicialV);
    total.entradasU += f.entradasU; total.entradasV = redondear(total.entradasV + f.entradasV);
    total.ajustesV = redondear(total.ajustesV + f.ajustesV);
    total.salidasU += f.salidasU; total.salidasV = redondear(total.salidasV + f.salidasV);
    total.finalU += f.finalU; total.finalV = redondear(total.finalV + f.finalV);
  }
  lista.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
  return { filas: lista, total, costoVendido, ventas, ganancia: redondear(ventas - costoVendido) };
}

/** Unidades y valor del inventario al cierre de una fecha (movimientos con fecha < hasta). */
export function inventarioAFecha(movs: readonly MovimientoKardex[], hasta: string, ambito?: AmbitoKardex) {
  let unidades = 0;
  let valor = 0;
  for (const m of movs) {
    if (m.fecha >= hasta) continue;
    if (ambito && m.ambito !== ambito) continue;
    unidades += m.cantidad;
    valor = redondear(valor + m.valor);
  }
  return { unidades, valor };
}

// ─── Control: ¿cuadra el libro con el inventario? ───────────────────────────

export type DiferenciaKardex = { registroId: string; sku: string; libro: number; inventario: number };

export function diferenciasKardex(
  registros: ReadonlyArray<{ id: string; sku: string; enLibro: number }>,
  saldos: Map<string, SaldoRegistro>
): DiferenciaKardex[] {
  const out: DiferenciaKardex[] = [];
  for (const r of registros) {
    const libro = saldos.get(r.id)?.cantidad ?? 0;
    if (libro !== r.enLibro) out.push({ registroId: r.id, sku: r.sku, libro, inventario: r.enLibro });
  }
  return out;
}

// ─── Documentos de facturación ───────────────────────────────────────────────

export type TipoDocumentoKardex = "venta-factura" | "venta-recibo" | "anula-factura" | "anula-recibo" | "devolucion-nc";

export const DOC_KARDEX: Record<TipoDocumentoKardex, { tabla: string; motivo: MotivoKardex; signo: 1 | -1; tipo: DocumentoTipoKardex; numero: string; cliente: string }> = {
  "venta-factura": { tabla: "Facturas Electrónicas", motivo: "Venta con factura", signo: -1, tipo: "Factura", numero: "Número de Factura", cliente: "Cliente - Nombre" },
  "venta-recibo": { tabla: "Recibos", motivo: "Venta con recibo", signo: -1, tipo: "Recibo", numero: "Número", cliente: "Cliente Nombre" },
  "anula-factura": { tabla: "Facturas Electrónicas", motivo: "Factura anulada", signo: 1, tipo: "Factura", numero: "Número de Factura", cliente: "Cliente - Nombre" },
  "anula-recibo": { tabla: "Recibos", motivo: "Recibo anulado", signo: 1, tipo: "Recibo", numero: "Número", cliente: "Cliente Nombre" },
  "devolucion-nc": { tabla: "Notas de Crédito Electrónicas", motivo: "Devolución del cliente", signo: 1, tipo: "Nota de crédito", numero: "Número de Nota de Crédito", cliente: "Cliente Nombre" },
};

export type LineaDocumentoKardex = { itemId: string; cantidad: number; /** Precio por unidad sin IVA, ya con descuento. */ precio?: number | null };

/** Junta las líneas de un mismo artículo (cantidad total y precio promedio). */
export function agruparLineasKardex(lineas: LineaDocumentoKardex[]): Map<string, { cantidad: number; precio: number | null }> {
  const out = new Map<string, { cantidad: number; total: number; conPrecio: boolean }>();
  for (const l of lineas) {
    if (!l.itemId) continue;
    const q = Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 0;
    if (!q) continue;
    const prev = out.get(l.itemId) ?? { cantidad: 0, total: 0, conPrecio: false };
    prev.cantidad += q;
    if (typeof l.precio === "number" && Number.isFinite(l.precio)) {
      prev.total += l.precio * q;
      prev.conPrecio = true;
    }
    out.set(l.itemId, prev);
  }
  return new Map([...out].map(([id, v]) => [id, { cantidad: v.cantidad, precio: v.conPrecio ? redondear(v.total / v.cantidad) : null }]));
}

export function movimientosDeDocumento(input: {
  tipo: TipoDocumentoKardex;
  documentoId: string;
  numero: string;
  cliente: string;
  fecha: string;
  lineas: LineaDocumentoKardex[];
  items: Map<string, Record<string, unknown>>;
  hechoPor?: string;
  origen?: "Sistema" | "Reconstrucción";
}): MovimientoKardex[] {
  const d = DOC_KARDEX[input.tipo];
  const out: MovimientoKardex[] = [];
  for (const [itemId, l] of agruparLineasKardex(input.lineas)) {
    const f = input.items.get(itemId);
    if (!f) continue;
    out.push(crearMovimiento({
      clave: claveKardex(input.tipo, input.documentoId, itemId),
      motivo: d.motivo,
      cantidad: d.signo * l.cantidad,
      registro: registroDeCampos(itemId, f),
      fecha: input.fecha,
      precioVenta: d.signo < 0 ? l.precio : null,
      documento: `${d.tipo} ${input.numero}`.trim(),
      documentoTipo: d.tipo,
      documentoId: input.documentoId,
      contraparte: input.cliente,
      hechoPor: input.hechoPor,
      origen: input.origen,
    }));
  }
  return out;
}

// ─── Lectura desde Airtable (sin red: solo el mapeo) ─────────────────────────

export const CAMPOS_KARDEX = {
  movimiento: "Movimiento", clave: "Clave", fecha: "Fecha", tipo: "Tipo", motivo: "Motivo", cantidad: "Cantidad",
  costoUnitario: "Costo unitario", valor: "Valor", precioVenta: "Precio venta", sku: "SKU", serie: "Serie",
  registroId: "Registro ID", nombre: "Nombre", categoria: "Categoría", ambito: "Ámbito", documento: "Documento",
  documentoTipo: "Documento tipo", documentoId: "Documento ID", contraparte: "Contraparte", causa: "Causa",
  componentes: "Componentes costo", hechoPor: "Hecho por", nota: "Nota", origen: "Origen",
} as const;

function componentesDeTexto(v: unknown): ComponentesCosto | null {
  try {
    const o = JSON.parse(texto(v) || "null");
    if (!o || typeof o !== "object") return null;
    return { proveedor: num(o.proveedor), flete: num(o.flete), arancel: num(o.arancel), otros: num(o.otros), mejoras: num(o.mejoras) };
  } catch {
    return null;
  }
}

export function movimientoDeCampos(id: string, f: Record<string, unknown>): MovimientoKardex | null {
  const C = CAMPOS_KARDEX;
  const motivo = texto(f[C.motivo]);
  if (!esMotivoKardex(motivo)) return null;
  const cantidad = Math.round(num(f[C.cantidad]));
  const tipo = texto(f[C.tipo]) as TipoKardex;
  const costo = f[C.costoUnitario];
  const precio = f[C.precioVenta];
  return {
    id,
    clave: texto(f[C.clave]),
    fecha: texto(f[C.fecha]),
    tipo: (["Entrada", "Salida", "Costo", "Traslado"] as const).includes(tipo) ? tipo : tipoPara(motivo, cantidad),
    motivo,
    cantidad,
    costoUnitario: typeof costo === "number" ? costo : null,
    valor: redondear(num(f[C.valor])),
    precioVenta: typeof precio === "number" ? precio : null,
    sku: texto(f[C.sku]),
    serie: texto(f[C.serie]),
    registroId: texto(f[C.registroId]),
    nombre: texto(f[C.nombre]),
    categoria: texto(f[C.categoria]),
    ambito: texto(f[C.ambito]) === "Activo" ? "Activo" : "Mercadería",
    documento: texto(f[C.documento]),
    documentoTipo: texto(f[C.documentoTipo]) as DocumentoTipoKardex | "",
    documentoId: texto(f[C.documentoId]),
    contraparte: texto(f[C.contraparte]),
    causa: (CAUSAS_BAJA as readonly string[]).includes(texto(f[C.causa])) ? (texto(f[C.causa]) as CausaBaja) : "",
    componentes: componentesDeTexto(f[C.componentes]),
    hechoPor: texto(f[C.hechoPor]),
    nota: texto(f[C.nota]),
    origen: texto(f[C.origen]) === "Reconstrucción" ? "Reconstrucción" : "Sistema",
  };
}

export function camposDeMovimiento(m: MovimientoKardex): Record<string, unknown> {
  const C = CAMPOS_KARDEX;
  const campos: Record<string, unknown> = {
    [C.movimiento]: tituloMovimiento(m),
    [C.clave]: m.clave,
    [C.fecha]: m.fecha,
    [C.tipo]: m.tipo,
    [C.motivo]: m.motivo,
    [C.cantidad]: m.cantidad,
    [C.valor]: m.valor,
    [C.sku]: m.sku,
    [C.registroId]: m.registroId,
    [C.nombre]: m.nombre,
    [C.categoria]: m.categoria,
    [C.ambito]: m.ambito,
    [C.origen]: m.origen,
  };
  if (m.costoUnitario !== null) campos[C.costoUnitario] = m.costoUnitario;
  if (m.precioVenta !== null) campos[C.precioVenta] = m.precioVenta;
  if (m.serie) campos[C.serie] = m.serie;
  if (m.documento) campos[C.documento] = m.documento;
  if (m.documentoTipo) campos[C.documentoTipo] = m.documentoTipo;
  if (m.documentoId) campos[C.documentoId] = m.documentoId;
  if (m.contraparte) campos[C.contraparte] = m.contraparte;
  if (m.causa) campos[C.causa] = m.causa;
  if (m.componentes) campos[C.componentes] = JSON.stringify(m.componentes);
  if (m.hechoPor) campos[C.hechoPor] = m.hechoPor;
  if (m.nota) campos[C.nota] = m.nota;
  return campos;
}

/** Lo que el Staff no ve (decisión 3): costos, valores, ganancia y componentes. */
export function sinCostos<T extends Partial<MovimientoKardex & { saldoValor: number }>>(m: T): T {
  return { ...m, costoUnitario: null, valor: 0, componentes: null, saldoValor: m.saldoValor === undefined ? undefined : 0, precioVenta: null, nota: m.tipo === "Costo" ? "" : m.nota };
}
