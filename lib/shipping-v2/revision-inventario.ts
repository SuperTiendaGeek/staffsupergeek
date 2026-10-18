// Revisión de inventario (punto 10c-1 de la auditoría Shipping V2, 18-oct-2026).
// Solo reglas, sin red: recibe lo leído de Airtable y devuelve los asuntos.
//
// Cada asunto tiene una CLAVE (tipo + registro o grupo) para no repetirse:
// la revisión crea los nuevos, renueva los que siguen y da por resueltos los
// que ya no aparecen. Lo que alguien marcó "Está bien" no se vuelve a abrir.

export const TIPOS_ASUNTO = [
  "Unidades no cuadran",
  "Vendido con unidades",
  "Posible duplicado",
  "En camino demasiado",
  "A la venta sin precio",
  "Reserva vencida",
  "Novedad sin movimiento",
  "Caja cerrada sin recibir",
  "Descargo con error",
  "Falta respaldo",
  "Tipo antiguo",
] as const;
export type TipoAsunto = (typeof TIPOS_ASUNTO)[number];

/** Grupos cortos para los filtros de la pantalla. */
export const GRUPO_TIPO: Record<TipoAsunto, string> = {
  "Unidades no cuadran": "Unidades",
  "Vendido con unidades": "Unidades",
  "Posible duplicado": "Duplicados",
  "En camino demasiado": "En camino",
  "A la venta sin precio": "Precio",
  "Reserva vencida": "Reservas",
  "Novedad sin movimiento": "Novedades",
  "Caja cerrada sin recibir": "Cajas",
  "Descargo con error": "Ventas",
  "Falta respaldo": "Pagos",
  "Tipo antiguo": "Datos",
};

export const PLAZOS_REVISION = { diasEnCamino: 45, diasNovedad: 15 };

export type ItemRevision = {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  estado: string;
  cantidad: number;
  /** "Unidades compradas" (null = no se registró). */
  compradas: number | null;
  recibido: boolean;
  precio: number | null;
  tipoOperacion: string;
  origen: string;
  fechaRegistro: string;
  requierePago: boolean;
  esRegalo: boolean;
  tienePago: boolean;
};

export type LineaVenta = { itemId: string; cantidad: number };
export type ReservaRevision = { id: string; numero: string; fechaLimite: string; itemId?: string };
export type NovedadRevision = { id: string; codigo: string; tipo: string; itemId?: string; ultimaActualizacion: string };
export type CajaRevision = { id: string; codigo: string; itemIds: string[] };
export type DocumentoConError = { tipo: "Factura" | "Recibo" | "Nota de crédito"; numero: string; itemIds: string[]; error: string };

export type DatosRevision = {
  items: ItemRevision[];
  /** Unidades vendidas en facturas y recibos vigentes. */
  ventas: LineaVenta[];
  /** Unidades que volvieron por nota de crédito con devolución física. */
  devoluciones: LineaVenta[];
  reservasActivas: ReservaRevision[];
  novedadesAbiertas: NovedadRevision[];
  cajasCerradas: CajaRevision[];
  documentosConError: DocumentoConError[];
};

export type AsuntoDetectado = {
  clave: string;
  tipo: TipoAsunto;
  sku: string;
  itemIds: string[];
  asunto: string;
  detalle: string;
  sugerencia: string;
};

/** Estados que ya no están en la tienda ni se venden. */
const FUERA = new Set(["vendido", "agotado", "dado de baja", "cancelado", "archivado", "usado en reparacion", "perdido en tienda", "destinado a partes", "devuelto a proveedor", "desarmado completamente"]);
const TIPOS_ANTIGUOS = new Set(["compra ya pagada", "parte / componente", "repuesto", "uso local", "migracion historica", "correccion administrativa"]);

function normal(texto?: string | null) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function vivo(item: Pick<ItemRevision, "estado">) {
  return !FUERA.has(normal(item.estado));
}

function dias(desde: string, hoy: Date) {
  const d = new Date(desde);
  return Number.isNaN(d.getTime()) ? 0 : Math.floor((hoy.getTime() - d.getTime()) / 86_400_000);
}

function fechaCorta(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", timeZone: "America/Guayaquil" });
}

function sumar(lineas: LineaVenta[]) {
  const total = new Map<string, number>();
  for (const l of lineas) total.set(l.itemId, (total.get(l.itemId) ?? 0) + (Number.isFinite(l.cantidad) ? l.cantidad : 0));
  return total;
}

// ─── Duplicados ──────────────────────────────────────────────────────────────

const PALABRAS_VACIAS = new Set(
  "de del la el los las con para y en c sin a por original originales nuevo nueva usado usada kit pack paquete tinta tintas botellas color colores negro black cyan magenta yellow mag".split(" ")
);

/** Palabras de un nombre para compararlo ("USB-C" queda "usbc" y no se confunde con "USB-A"). */
export function palabrasNombre(nombre: string): Set<string> {
  const t = normal(nombre).replace(/\busb[\s-]?([abc])\b/g, "usb$1");
  return new Set((t.match(/[a-z0-9]+/g) ?? []).filter((p) => p.length > 1 && !PALABRAS_VACIAS.has(p)));
}

/** Códigos de modelo del nombre (letras y números, 4+ caracteres): "t544", "p2219h", "i71165g7". */
export function modelosNombre(nombre: string): Set<string> {
  return new Set(Array.from(palabrasNombre(nombre)).filter((p) => p.length >= 4 && /\d/.test(p) && /[a-z]/.test(p)));
}

function parecido(a: Set<string>, b: Set<string>) {
  let comunes = 0;
  a.forEach((p) => { if (b.has(p)) comunes++; });
  const union = a.size + b.size - comunes;
  return union ? comunes / union : 0;
}

/**
 * Productos (SKU) que parecen el mismo: misma categoría y nombre casi igual,
 * o el mismo código de modelo con un nombre parecido. Se agrupan (si A≈B y
 * B≈C, va todo junto) y solo cuentan los grupos con algo todavía a la venta.
 */
export function gruposDuplicados(items: ItemRevision[]): ItemRevision[][] {
  const porSku = new Map<string, { item: ItemRevision; vivo: boolean }>();
  for (const i of items) {
    if (!i.sku || ["dado de baja", "perdido en tienda", "destinado a partes"].includes(normal(i.estado))) continue;
    const actual = porSku.get(i.sku);
    if (!actual) porSku.set(i.sku, { item: i, vivo: vivo(i) });
    else if (vivo(i)) actual.vivo = true;
  }
  const lista = Array.from(porSku.values());
  const palabras = lista.map((p) => palabrasNombre(p.item.nombre));
  const modelos = lista.map((p) => modelosNombre(p.item.nombre));
  const padre = lista.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      if (!palabras[i].size || !palabras[j].size) continue;
      const p = parecido(palabras[i], palabras[j]);
      const mismaCategoria = normal(lista[i].item.categoria) === normal(lista[j].item.categoria);
      let mismoModelo = false;
      modelos[i].forEach((m) => { if (modelos[j].has(m)) mismoModelo = true; });
      if ((mismaCategoria && p >= 0.85) || (mismoModelo && p >= 0.6)) padre[raiz(i)] = raiz(j);
    }
  }
  const grupos = new Map<number, number[]>();
  lista.forEach((_, i) => { const r = raiz(i); grupos.set(r, [...(grupos.get(r) ?? []), i]); });
  return Array.from(grupos.values())
    .filter((g) => g.length > 1 && g.some((i) => lista[i].vivo))
    .map((g) => g.map((i) => lista[i].item).sort((a, b) => a.sku.localeCompare(b.sku)));
}

// ─── Detección ───────────────────────────────────────────────────────────────

export function detectarAsuntos(datos: DatosRevision, hoy: Date, plazos = PLAZOS_REVISION): AsuntoDetectado[] {
  const asuntos: AsuntoDetectado[] = [];
  const porId = new Map(datos.items.map((i) => [i.id, i]));
  const vendidas = sumar(datos.ventas);
  const devueltas = sumar(datos.devoluciones);
  const skuDe = (id?: string) => (id ? porId.get(id)?.sku ?? "" : "");

  for (const i of datos.items) {
    const estado = normal(i.estado);
    // Unidades: compradas = en tienda + vendidas (menos devueltas). Lo dado de baja o pasado a uso local sale aparte.
    if (i.compradas !== null && !["dado de baja", "perdido en tienda", "uso local", "destinado a partes"].includes(estado)) {
      const netas = (vendidas.get(i.id) ?? 0) - (devueltas.get(i.id) ?? 0);
      const esperado = i.cantidad + netas;
      if (esperado !== i.compradas) {
        const diferencia = esperado - i.compradas;
        asuntos.push({
          clave: `Unidades no cuadran|${i.id}`,
          tipo: "Unidades no cuadran",
          sku: i.sku,
          itemIds: [i.id],
          asunto: `Compradas ${i.compradas} · vendidas ${netas} · en tienda ${i.cantidad}`,
          detalle: diferencia > 0 ? `${diferencia} más de lo comprado` : `Falta${diferencia === -1 ? "" : "n"} ${-diferencia}`,
          sugerencia: "Contar",
        });
      }
    }
    if ((["vendido", "agotado"].includes(estado) && i.cantidad > 0) || (estado === "disponible" && i.recibido && i.cantidad <= 0)) {
      asuntos.push({
        clave: `Vendido con unidades|${i.id}`,
        tipo: "Vendido con unidades",
        sku: i.sku,
        itemIds: [i.id],
        asunto: `"${i.estado}" con ${i.cantidad} en tienda`,
        detalle: "",
        sugerencia: "Revisar estado o cantidad",
      });
    }
    const enCamino = !i.recibido && vivo(i) && ["proveedor extranjero", "proveedor local"].includes(normal(i.origen));
    if (enCamino && dias(i.fechaRegistro, hoy) > plazos.diasEnCamino) {
      asuntos.push({
        clave: `En camino demasiado|${i.id}`,
        tipo: "En camino demasiado",
        sku: i.sku,
        itemIds: [i.id],
        asunto: `En camino desde el ${fechaCorta(i.fechaRegistro)} (${dias(i.fechaRegistro, hoy)} días)`,
        detalle: "",
        sugerencia: "Revisar rastreo o registrar novedad",
      });
    }
    if (estado === "disponible" && i.recibido && !(i.precio && i.precio > 0)) {
      asuntos.push({
        clave: `A la venta sin precio|${i.id}`,
        tipo: "A la venta sin precio",
        sku: i.sku,
        itemIds: [i.id],
        asunto: "A la venta sin precio",
        detalle: "",
        sugerencia: "Poner precio",
      });
    }
    if (vivo(i) && TIPOS_ANTIGUOS.has(normal(i.tipoOperacion))) {
      asuntos.push({
        clave: `Tipo antiguo|${i.id}`,
        tipo: "Tipo antiguo",
        sku: i.sku,
        itemIds: [i.id],
        asunto: `Tipo de operación "${i.tipoOperacion}" (ya no se usa)`,
        detalle: "",
        sugerencia: "Cambiar el tipo de operación",
      });
    }
  }

  for (const grupo of gruposDuplicados(datos.items)) {
    const [principal, ...otros] = [...grupo].sort((a, b) => Number(vivo(b)) - Number(vivo(a)) || a.sku.localeCompare(b.sku));
    asuntos.push({
      clave: `Posible duplicado|${grupo.map((i) => i.sku).join(",")}`,
      tipo: "Posible duplicado",
      sku: principal.sku,
      itemIds: grupo.map((i) => i.id),
      asunto: `Mismo producto en ${grupo.length} SKU: ${otros.map((i) => i.sku).join(", ")}`,
      detalle: grupo.map((i) => `${i.sku} · ${i.nombre} · ${i.estado}`).join("\n"),
      sugerencia: `Fusionar en ${principal.sku}`,
    });
  }

  for (const r of datos.reservasActivas) {
    if (!r.fechaLimite || dias(`${r.fechaLimite.slice(0, 10)}T23:59:59-05:00`, hoy) < 1) continue;
    asuntos.push({
      clave: `Reserva vencida|${r.id}`,
      tipo: "Reserva vencida",
      sku: skuDe(r.itemId),
      itemIds: r.itemId ? [r.itemId] : [],
      asunto: `Reserva ${r.numero} vencida el ${fechaCorta(`${r.fechaLimite.slice(0, 10)}T12:00:00-05:00`)}`,
      detalle: "",
      sugerencia: "Extender o liberar",
    });
  }

  for (const n of datos.novedadesAbiertas) {
    const sinCambios = dias(n.ultimaActualizacion, hoy);
    if (sinCambios <= plazos.diasNovedad) continue;
    asuntos.push({
      clave: `Novedad sin movimiento|${n.id}`,
      tipo: "Novedad sin movimiento",
      sku: skuDe(n.itemId),
      itemIds: n.itemId ? [n.itemId] : [],
      asunto: `Novedad ${n.codigo}${n.tipo ? ` (${n.tipo})` : ""} sin cambios hace ${sinCambios} días`,
      detalle: "",
      sugerencia: "Seguir o cerrar la novedad",
    });
  }

  for (const c of datos.cajasCerradas) {
    const sinRecibir = c.itemIds.map((id) => porId.get(id)).filter((i): i is ItemRevision => Boolean(i && !i.recibido && vivo(i)));
    if (!sinRecibir.length) continue;
    asuntos.push({
      clave: `Caja cerrada sin recibir|${c.id}`,
      tipo: "Caja cerrada sin recibir",
      sku: sinRecibir[0].sku,
      itemIds: sinRecibir.map((i) => i.id),
      asunto: `Caja ${c.codigo} cerrada con ${sinRecibir.length} sin recibir: ${sinRecibir.map((i) => i.sku).join(", ")}`,
      detalle: "",
      sugerencia: "Recibir o registrar novedad",
    });
  }

  for (const d of datos.documentosConError) {
    asuntos.push({
      clave: `Descargo con error|${d.tipo}|${d.numero}`,
      tipo: "Descargo con error",
      sku: skuDe(d.itemIds[0]),
      itemIds: d.itemIds,
      asunto: `${d.tipo} ${d.numero} con error de inventario`,
      detalle: d.error,
      sugerencia: d.tipo === "Recibo" ? "Reintentar descargo" : "Revisar el descargo",
    });
  }

  // Compras sin pago registrado: un solo asunto (el detalle está en Pagos).
  const sinPago = datos.items.filter((i) => i.requierePago && !i.esRegalo && !i.tienePago && !["cancelado", "archivado"].includes(normal(i.estado)));
  if (sinPago.length) {
    asuntos.push({
      clave: "Falta respaldo|resumen",
      tipo: "Falta respaldo",
      sku: "",
      itemIds: [],
      asunto: `${sinPago.length} artículo${sinPago.length === 1 ? "" : "s"} comprado${sinPago.length === 1 ? "" : "s"} sin pago registrado`,
      detalle: sinPago.slice(0, 60).map((i) => i.sku).join(", ") + (sinPago.length > 60 ? "…" : ""),
      sugerencia: "Registrar los pagos",
    });
  }

  return asuntos;
}

// ─── Sincronizar con lo guardado ─────────────────────────────────────────────

export type EstadoAsunto = "Abierto" | "Resuelto" | "Está bien";

export type AsuntoGuardado = {
  id: string;
  clave: string;
  estado: EstadoAsunto;
  asunto: string;
  detalle: string;
};

export type PlanSincronizacion = {
  crear: AsuntoDetectado[];
  /** Siguen abiertos: se renueva la fecha y, si cambió, el texto. */
  renovar: Array<{ id: string; asunto: AsuntoDetectado }>;
  /** Abiertos que ya no aparecen: los cierra el sistema. */
  cerrar: string[];
};

export function planSincronizacion(guardados: AsuntoGuardado[], detectados: AsuntoDetectado[]): PlanSincronizacion {
  const porClave = new Map<string, AsuntoGuardado>();
  for (const g of guardados) {
    const previo = porClave.get(g.clave);
    // Si hay varios con la misma clave, manda el abierto (o "Está bien").
    if (!previo || previo.estado === "Resuelto") porClave.set(g.clave, g);
  }
  const vistas = new Set<string>();
  const plan: PlanSincronizacion = { crear: [], renovar: [], cerrar: [] };
  for (const d of detectados) {
    if (vistas.has(d.clave)) continue;
    vistas.add(d.clave);
    const g = porClave.get(d.clave);
    if (!g || g.estado === "Resuelto") plan.crear.push(d); // volvió a pasar: asunto nuevo
    else if (g.estado === "Abierto") plan.renovar.push({ id: g.id, asunto: d });
    // "Está bien": se respeta, no se reabre.
  }
  for (const g of guardados) {
    if (g.estado === "Abierto" && !vistas.has(g.clave)) plan.cerrar.push(g.id);
  }
  return plan;
}
