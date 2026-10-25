// Punto 18 (25-oct-2026): ficha del artículo por rol.
//
// Este archivo define QUÉ DATOS recibe cada perfil (Administrador, Staff,
// Técnico, Proveedor). Es puro, sin red, y se prueba en
// __tests__/ficha-articulo.test.ts. El cargador del servidor
// (ficha-articulo-servidor.ts) lo usa antes de responder: lo que no está en la
// lista de un perfil NUNCA sale del servidor, así que la pantalla no tiene
// nada que "esconder después".
//
// Regla: listas de lo PERMITIDO (no de lo prohibido). Un campo nuevo del
// artículo no le llega al técnico ni al proveedor hasta que alguien lo agregue
// aquí a propósito.

import type { Publicacion } from "@/lib/shipping-v2/publicaciones";
import type { ShippingV2NovedadRol } from "@/lib/shipping-v2/novedades";
import type { ShippingV2ResolvedItem } from "@/lib/shipping-v2/item-list-view";
import type {
  ShippingV2AccessPermissions,
  ShippingV2Item,
  ShippingV2ItemTrazabilidad,
  ShippingV2Novedad,
  ShippingV2Packing,
  ShippingV2Pago,
  ShippingV2Proveedor,
  ShippingV2UnidadHermana,
} from "@/types/shipping-v2";

export type FichaPerfil = "admin" | "staff" | "tecnico" | "proveedor";

export type FichaEnlaces = { facturacion: boolean; operaciones: boolean; tecnicos: boolean };

// ─── Publicaciones (Administrador y Staff) ───────────────────────────────────

export type FichaPublicacion = {
  /** Registro del gestor, o "casilla-<canal>" para lo marcado antes del gestor. */
  id: string;
  canal: string;
  estado: "Borrador" | "Publicado" | "Por retirar" | "Retirado";
  /** "Unidad" = anuncio aparte de esta unidad; "Producto" = el anuncio del SKU. */
  alcance: "Producto" | "Unidad";
  publicadoPor?: string;
  fechaPublicado?: string;
  retiradoPor?: string;
  fechaRetirado?: string;
  enlace?: string;
  /** "gestor" = Shipping Publicaciones; "casilla" = casilla de Recepción (antes del 18-oct). */
  origen: "gestor" | "casilla";
};

const CASILLAS_CANAL: Array<{
  canal: string;
  marcado: keyof ShippingV2Item;
  por: keyof ShippingV2Item;
  fecha: keyof ShippingV2Item;
}> = [
  { canal: "Marketplace", marcado: "marketplacePublicado", por: "marketplacePublicadoPor", fecha: "fechaMarketplacePublicado" },
  { canal: "Mercado Libre", marcado: "mercadoLibrePublicado", por: "mercadoLibrePublicadoPor", fecha: "fechaMercadoLibrePublicado" },
  { canal: "Shopify", marcado: "shopifyPublicado", por: "shopifyPublicadoPor", fecha: "fechaShopifyPublicado" },
  { canal: "Grupos Facebook", marcado: "gruposFacebookPublicado", por: "facebookPublicadoPor", fecha: "fechaFacebookPublicado" },
];

function texto(valor: unknown): string | undefined {
  const t = typeof valor === "string" ? valor.trim() : "";
  return t || undefined;
}

function fechaOrden(p: FichaPublicacion) {
  return Date.parse(p.fechaPublicado || p.fechaRetirado || "") || 0;
}

/**
 * Las publicaciones de esta unidad: los anuncios del gestor (los del producto
 * y los aparte de ESTA unidad, incluidos los retirados = historial) y, para
 * cada canal sin anuncio en el gestor, la casilla vieja de Recepción con quién
 * y cuándo. No inventa nada: si un dato no está, no se muestra.
 */
export function resumenPublicaciones(
  item: Pick<ShippingV2Item, "id"> & Partial<ShippingV2Item>,
  publicaciones: readonly Publicacion[]
): FichaPublicacion[] {
  const delGestor: FichaPublicacion[] = publicaciones
    .filter((p) => p.alcance !== "Unidad" || p.unidadId === item.id)
    .map((p) => ({
      id: p.id,
      canal: p.canal,
      estado: p.estado,
      alcance: p.alcance,
      publicadoPor: texto(p.publicadoPor),
      fechaPublicado: texto(p.fechaPublicado),
      retiradoPor: texto(p.retiradoPor),
      fechaRetirado: texto(p.fechaRetirado),
      enlace: texto(p.enlace),
      origen: "gestor" as const,
    }));
  const canalesConGestor = new Set(delGestor.map((p) => p.canal));
  const deCasillas: FichaPublicacion[] = CASILLAS_CANAL
    .filter((c) => !canalesConGestor.has(c.canal) && item[c.marcado] === true)
    .map((c) => ({
      id: `casilla-${c.canal}`,
      canal: c.canal,
      estado: "Publicado" as const,
      alcance: "Producto" as const,
      publicadoPor: texto(item[c.por]),
      fechaPublicado: texto(item[c.fecha]),
      origen: "casilla" as const,
    }));
  // Lo vigente primero (publicado / por retirar), después borradores y retirados; lo más reciente arriba.
  const peso = (p: FichaPublicacion) => (p.estado === "Publicado" || p.estado === "Por retirar" ? 0 : p.estado === "Borrador" ? 1 : 2);
  return [...delGestor, ...deCasillas].sort((a, b) => peso(a) - peso(b) || fechaOrden(b) - fechaOrden(a));
}

// ─── Administrador y Staff ───────────────────────────────────────────────────

export type FichaInterna = {
  item: ShippingV2ResolvedItem;
  proveedores: ShippingV2Proveedor[];
  pago: ShippingV2Pago | null;
  packing: ShippingV2Packing | null;
  novedades: ShippingV2Novedad[];
  permissions: ShippingV2AccessPermissions;
  rolNovedades: ShippingV2NovedadRol;
  trazabilidad: ShippingV2ItemTrazabilidad | null;
  hermanas: ShippingV2UnidadHermana[];
  enlaces: FichaEnlaces;
  /** Personalización por usuario (Campos restringidos). Vacío para el Administrador. */
  camposOcultos: string[];
  camposSoloLectura: string[];
  publicaciones: FichaPublicacion[];
  /** Mostrar los costos de traer un artículo que viaja solo (pestaña Logística). */
  costosTraerlo: boolean;
};

// ─── Técnico ─────────────────────────────────────────────────────────────────

/** Lo único del artículo que recibe el técnico (decisión del dueño, 25-oct). */
export const CAMPOS_ITEM_TECNICO = [
  "id",
  "createdTime",
  "sku",
  "codigo",
  "skuProveedor",
  "nombre",
  "descripcion",
  "marca",
  "modelo",
  "numeroSerie",
  "seguimiento",
  "accesoriosIncluidos",
  "categoria",
  "condicion",
  "cantidad",
  "unidad",
  "cantidadReservada",
  "estado",
  "estadoRevision",
  "estadoDespiece",
  "conNovedad",
  "recibido",
  "usoLocal",
  "requiereInspeccion",
  "revisadoFisicamente",
  "revisadoPor",
  "fechaRevision",
  "puntosRevisionFallidos",
  "revisionTecnicaDetalle",
  "especificacionesTecnicas",
  "resumenTecnico",
  "fotos",
  "precioVenta",
  "itemPadreId",
  "itemHijoIds",
  "motivoDespiece",
  "fechaDespiece",
] as const satisfies ReadonlyArray<keyof ShippingV2Item>;

export type FichaItemTecnico = Pick<ShippingV2Item, (typeof CAMPOS_ITEM_TECNICO)[number]>;

function copiarCampos<T extends object, K extends keyof T>(origen: T, campos: readonly K[]): Pick<T, K> {
  const destino = {} as Pick<T, K>;
  for (const campo of campos) {
    if (campo in origen) destino[campo] = origen[campo];
  }
  return destino;
}

export function recortarItemTecnico(item: ShippingV2Item): FichaItemTecnico {
  const recortado = copiarCampos(item, CAMPOS_ITEM_TECNICO);
  return { ...recortado, fotos: item.fotos ?? [], itemHijoIds: item.itemHijoIds ?? [] };
}

/** Montos de una novedad que el técnico no necesita (reclamos, pérdidas, descuentos). */
const MONTOS_NOVEDAD = ["montoReclamado", "montoRecuperado", "precioConDescuento", "valorPerdida"] as const;

export function novedadParaTecnico(novedad: ShippingV2Novedad): ShippingV2Novedad {
  const copia: ShippingV2Novedad = { ...novedad };
  for (const campo of MONTOS_NOVEDAD) copia[campo] = null;
  // Le basta saber si responde el proveedor o SUPER GEEK, no quién ni en qué caja.
  delete copia.proveedorResponsableNombre;
  delete copia.packingLabel;
  delete copia.packingId;
  copia.packingIds = [];
  return copia;
}

export type FichaTecnica = {
  item: FichaItemTecnico;
  novedades: ShippingV2Novedad[];
  rolNovedades: ShippingV2NovedadRol;
  puedeRegistrarNovedades: boolean;
  /** Otras unidades del mismo SKU (para pasar de una a otra). */
  hermanas: ShippingV2UnidadHermana[];
  /** De dónde salió (despiece o mejora), si aplica. Solo lo técnico. */
  origen: {
    itemPadre?: { id: string; sku: string; nombre?: string };
    origenMejora?: { equipoId: string; equipoSku: string; equipoNombre?: string; fecha?: string };
  };
  puedeInspeccionar: boolean;
  /** Enlace a la inspección de la unidad (solo si ya llegó). */
  inspeccionHref?: string;
  enlaces: Pick<FichaEnlaces, "tecnicos">;
};

// ─── Proveedor ───────────────────────────────────────────────────────────────

export const CAMPOS_ITEM_PROVEEDOR = [
  "id",
  "createdTime",
  "sku",
  "skuProveedor",
  "nombre",
  "descripcion",
  "categoria",
  "condicion",
  "marca",
  "modelo",
  "numeroSerie",
  "cantidad",
  "unidad",
  "unidadesCompradas",
  "recibido",
  "fotos",
  "fechaRegistro",
] as const satisfies ReadonlyArray<keyof ShippingV2Item>;

export type FichaItemProveedor = Pick<ShippingV2Item, (typeof CAMPOS_ITEM_PROVEEDOR)[number]> & {
  /** Su costo (lo que le pagamos por unidad), solo con "Ver su costo de proveedor". */
  costoProveedor?: number | null;
  /** Solo con "Editar nombre y observaciones" (lo escriben ambos lados). */
  observacionesInternas?: string;
  /** Estado sencillo para el proveedor: nunca los estados internos de la tienda. */
  situacion: "En camino" | "Recibido en SUPER GEEK";
};

export function recortarItemProveedor(
  item: ShippingV2Item,
  opciones: { verCosto: boolean; verObservaciones: boolean }
): FichaItemProveedor {
  const base = copiarCampos(item, CAMPOS_ITEM_PROVEEDOR);
  return {
    ...base,
    fotos: item.fotos ?? [],
    ...(opciones.verCosto ? { costoProveedor: item.costoProveedor ?? null } : {}),
    ...(opciones.verObservaciones ? { observacionesInternas: item.observacionesInternas ?? "" } : {}),
    situacion: item.recibido === true ? "Recibido en SUPER GEEK" : "En camino",
  };
}

export type FichaProveedorCompra = {
  codigo: string;
  /** Su número de orden o factura. */
  numeroProveedor?: string;
  fecha?: string;
};

export type FichaProveedorEnvio = {
  codigo: string;
  nombre?: string;
  estado: string;
  trackingUsa?: string;
  trackingEc?: string;
  peso: number | null;
  fechaEnvio?: string;
  fechaRecepcion?: string;
  /** Factura de la caja: solo si la caja es suya y tiene "Ver factura del packing". */
  factura: Array<{ url: string; nombre: string }>;
};

export type FichaProveedorPago = {
  id: string;
  codigo: string;
  estado: string;
  fecha?: string;
  metodo?: string;
  transaccion?: string;
  monto: number | null;
  /** Su factura adjunta al pago (si la hay). */
  factura: Array<{ url: string; nombre: string }>;
};

export type FichaProveedor = {
  item: FichaItemProveedor;
  puedeEditar: boolean;
  verCosto: boolean;
  compra: FichaProveedorCompra | null;
  envio: FichaProveedorEnvio | null;
  /** null = sin permiso "Ver pagos". */
  pagos: FichaProveedorPago[] | null;
  /** Pagado / Por pagar, solo cuando se sabe. */
  estadoPago?: "Pagado" | "Por pagar";
};

/** Solo pagos de la COMPRA a ese proveedor, vivos. */
export function pagosVisiblesParaProveedor(pagos: readonly ShippingV2Pago[], proveedorId: string): ShippingV2Pago[] {
  return pagos.filter((pago) => {
    const concepto = pago.concepto ?? "Compra";
    const estado = String(pago.estadoPago || pago.estado || "").trim().toLowerCase();
    return pago.proveedorId === proveedorId && concepto === "Compra" && estado !== "anulado";
  });
}

// ─── El paquete que recibe la pantalla ───────────────────────────────────────

export type FichaArticulo =
  | { perfil: "admin"; datos: FichaInterna }
  | { perfil: "staff"; datos: FichaInterna }
  | { perfil: "tecnico"; datos: FichaTecnica }
  | { perfil: "proveedor"; datos: FichaProveedor };

export type ResultadoFicha =
  | { ok: true; ficha: FichaArticulo }
  | { ok: false; estado: 401 | 403 | 404 | 500; mensaje: string };

// ─── Punto 18b (25-oct-2026): la ficha como contenedor del SKU ───────────────

/**
 * Datos del PRODUCTO (decisión del dueño, 25-oct): al editarlos en la ficha se
 * aplican a todas las unidades del SKU que siguen en el inventario. Lo vendido
 * o dado de baja conserva el nombre con que salió (misma regla que la fusión).
 * El precio de venta también es del producto, con la opción "solo esta unidad".
 */
export const CLAVES_CAMPO_PRODUCTO = ["nombre", "descripcion", "categoria", "marca", "modelo"] as const;

/** Estados de lo que ya no está en el inventario: no se le propagan cambios. */
const ESTADOS_SALIERON = new Set(["vendido", "agotado", "dado de baja", "cancelado", "archivado", "usado en reparacion", "perdido en tienda", "devuelto a proveedor", "desarmado completamente"]);

function normalEstado(estado?: string | null) {
  return String(estado ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function sigueEnInventario(registro: { estado?: string | null }) {
  return !ESTADOS_SALIERON.has(normalEstado(registro.estado));
}

/** A qué otros registros del SKU se aplica un cambio de dato del producto. */
export function registrosParaPropagar<T extends { id: string; estado?: string | null }>(registros: readonly T[], origenId: string): T[] {
  return registros.filter((r) => r.id !== origenId && sigueEnInventario(r));
}

export type ExistenciasSku = {
  /** Registros del SKU (unidades y lotes), incluido lo que ya salió. */
  registros: number;
  /** Unidades que siguen en el inventario (suma de cantidades). */
  enInventario: number;
  reservadas: number;
  /** Unidades por estado, solo lo que sigue en el inventario (ordenado de mayor a menor). */
  porEstado: Array<{ estado: string; cantidad: number }>;
  /** Registros que ya salieron (vendidos, agotados, dados de baja…). */
  salieron: number;
};

export function existenciasDelSku(registros: ReadonlyArray<{ estado: string; cantidad: number | null; cantidadReservada?: number | null }>): ExistenciasSku {
  const porEstado = new Map<string, number>();
  let enInventario = 0;
  let reservadas = 0;
  let salieron = 0;
  for (const r of registros) {
    if (!sigueEnInventario(r)) {
      salieron += 1;
      continue;
    }
    const cantidad = Math.max(0, Number(r.cantidad) || 0);
    enInventario += cantidad;
    reservadas += Math.max(0, Number(r.cantidadReservada) || 0);
    porEstado.set(r.estado, (porEstado.get(r.estado) ?? 0) + cantidad);
  }
  return {
    registros: registros.length,
    enInventario,
    reservadas,
    porEstado: [...porEstado].map(([estado, cantidad]) => ({ estado, cantidad })).filter((e) => e.cantidad > 0).sort((a, b) => b.cantidad - a.cantidad),
    salieron,
  };
}

/**
 * Casillas viejas de publicación vistas a nivel de SKU: si este registro no
 * tiene marcada la de un canal pero otro registro del SKU sí, cuenta (así no
 * aparece 20 veces ni desaparece al cambiar de unidad).
 */
export function casillasDelSku(
  hermanas: ReadonlyArray<{ fechaRegistro?: string; casillasPublicacion?: Record<string, { por?: string; fecha?: string }> }>
): Partial<ShippingV2Item> {
  const campos: Record<string, [keyof ShippingV2Item, keyof ShippingV2Item, keyof ShippingV2Item]> = {
    Marketplace: ["marketplacePublicado", "marketplacePublicadoPor", "fechaMarketplacePublicado"],
    "Mercado Libre": ["mercadoLibrePublicado", "mercadoLibrePublicadoPor", "fechaMercadoLibrePublicado"],
    Shopify: ["shopifyPublicado", "shopifyPublicadoPor", "fechaShopifyPublicado"],
    "Grupos Facebook": ["gruposFacebookPublicado", "facebookPublicadoPor", "fechaFacebookPublicado"],
  };
  const resultado: Record<string, unknown> = {};
  for (const [canal, [marcado, por, fecha]] of Object.entries(campos)) {
    // La primera vez que se marcó en el SKU (la más antigua con fecha).
    const marcas = hermanas
      .map((h) => h.casillasPublicacion?.[canal])
      .filter((c): c is { por?: string; fecha?: string } => Boolean(c))
      .sort((a, b) => (a.fecha ?? "9").localeCompare(b.fecha ?? "9"));
    if (!marcas.length) continue;
    resultado[marcado] = true;
    // Solo lo que se conoce: nunca se borra con "vacío" lo que ya traía el registro.
    if (marcas[0].por) resultado[por] = marcas[0].por;
    if (marcas[0].fecha) resultado[fecha] = marcas[0].fecha;
  }
  return resultado as Partial<ShippingV2Item>;
}
