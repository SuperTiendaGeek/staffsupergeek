// Plazos y origen de una Garantía SUPER GEEK — reglas PURAS (auditoría ops,
// punto 20 · segunda parte, 4-nov-2026).
//
// Como RepairDesk: un reclamo de garantía se hace SOBRE algo que el cliente
// compró o le repararon (un artículo de una factura/recibo, un servicio de
// una orden, o una pieza que ya se dio en garantía), y se revisa si sigue
// dentro del plazo. El plazo cuenta desde la fecha del documento de venta (o
// desde la entrega de la garantía anterior).
//
// Plazos de SUPER GEEK (dueño, 4-nov):
//   · Laptop, Desktop, All in One → 6 meses.
//   · Todo lo demás → 3 meses, salvo fundas, mochilas y similares, que no
//     tienen garantía (están en "Accesorio" junto a cosas que sí la tienen:
//     el sistema avisa y decide quien confirma).
//   · Mano de obra: depende del servicio → "Garantía (días)" del catálogo.
// Vencida o sin documento: solo un administrador la da, como CORTESÍA.

export const CATEGORIAS_EQUIPO = ["Laptop", "Desktop", "All in One"] as const;
export const MESES_EQUIPO = 6;
export const MESES_OTROS = 3;
/** Categorías donde hay cosas sin garantía: se avisa, no se bloquea. */
export const CATEGORIAS_A_REVISAR: Record<string, string> = {
  Accesorio: "Fundas, mochilas y similares no tienen garantía: revisa qué es.",
};

const norm = (v?: string | null) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type Plazo = { meses?: number; dias?: number; aviso?: string };

export function plazoDeArticulo(categoria: string | null | undefined): Plazo {
  const c = norm(categoria);
  if (CATEGORIAS_EQUIPO.some((x) => norm(x) === c)) return { meses: MESES_EQUIPO };
  const revisar = Object.entries(CATEGORIAS_A_REVISAR).find(([k]) => norm(k) === c)?.[1];
  return revisar ? { meses: MESES_OTROS, aviso: revisar } : { meses: MESES_OTROS };
}

export function plazoDeServicio(dias: number | null | undefined): Plazo {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return { aviso: "Este servicio no tiene plazo de garantía en el catálogo." };
  if (dias <= 0) return { dias: 0, aviso: "Este servicio no tiene garantía." };
  return { dias: Math.round(dias) };
}

export function textoPlazo(p: Plazo): string {
  if (p.meses) return `${p.meses} ${p.meses === 1 ? "mes" : "meses"}`;
  if (p.dias) return `${p.dias} días`;
  return "sin garantía";
}

/** "AAAA-MM-DD" de una fecha ISO (fecha de Ecuador si trae hora). */
export function soloFecha(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Fin del plazo: inicio + meses (fin de mes si no existe el día) o + días. null si no hay plazo. */
export function venceGarantia(inicio: string, p: Plazo): string | null {
  const f = soloFecha(inicio);
  if (!f) return null;
  const [y, m, d] = f.split("-").map(Number);
  if (p.meses) {
    const destino = new Date(Date.UTC(y, m - 1 + p.meses, 1));
    const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
    destino.setUTCDate(Math.min(d, ultimo));
    return destino.toISOString().slice(0, 10);
  }
  if (p.dias) return new Date(Date.UTC(y, m - 1, d + p.dias)).toISOString().slice(0, 10);
  return null;
}

export const vigente = (vence: string | null, hoy: string): boolean => !!vence && soloFecha(hoy) <= vence;

export function fechaCorta(f: string | null | undefined): string {
  const s = f ? soloFecha(f) : "";
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Lo que el cliente puede reclamar ───────────────────────────────────────

export type TipoOrigen = "articulo" | "servicio" | "garantia";

export type OrigenGarantia = {
  /** articulo:recItem@recDoc · servicio:recSv@recDoc · garantia:recLinea */
  clave: string;
  tipo: TipoOrigen;
  nombre: string;
  sku: string;
  categoria: string;
  /** "REC-000075", "Factura 001-002-000000674" o la orden (para una garantía anterior). */
  documento: string;
  fecha: string;
  plazo: Plazo;
  vence: string | null;
  vigente: boolean;
  /** Para reclamarle la pieza mala al proveedor. */
  itemId: string | null;
  proveedorId: string | null;
};

export type DocumentoLeido = {
  id: string;
  etiqueta: string;
  fecha: string;
  articulos: Array<{ id: string; sku: string; nombre: string; categoria: string; proveedorId: string | null }>;
  servicios: Array<{ id: string; nombre: string; diasCatalogo: number | null }>;
};

export type GarantiaAnteriorLeida = {
  lineaId: string;
  ordenCodigo: string;
  nombre: string;
  sku: string;
  categoria: string;
  /** Repuesto o Servicio. */
  tipoLinea: string;
  diasCatalogo: number | null;
  fechaEntrega: string;
  itemId: string | null;
  proveedorId: string | null;
};

/** Todo lo que el cliente compró o recibió en garantía, con su plazo. Vigentes primero, lo más nuevo arriba. */
export function armarOrigenes(input: { documentos: DocumentoLeido[]; garantias: GarantiaAnteriorLeida[]; hoy: string }): OrigenGarantia[] {
  const out: OrigenGarantia[] = [];
  const vistos = new Set<string>();
  const agregar = (o: Omit<OrigenGarantia, "vence" | "vigente">) => {
    if (vistos.has(o.clave)) return;
    vistos.add(o.clave);
    const vence = venceGarantia(o.fecha, o.plazo);
    out.push({ ...o, vence, vigente: vigente(vence, input.hoy) });
  };
  for (const d of input.documentos) {
    for (const a of d.articulos) {
      agregar({ clave: `articulo:${a.id}@${d.id}`, tipo: "articulo", nombre: a.nombre, sku: a.sku, categoria: a.categoria, documento: d.etiqueta, fecha: d.fecha, plazo: plazoDeArticulo(a.categoria), itemId: a.id, proveedorId: a.proveedorId });
    }
    for (const s of d.servicios) {
      agregar({ clave: `servicio:${s.id}@${d.id}`, tipo: "servicio", nombre: s.nombre, sku: "", categoria: "Servicio", documento: d.etiqueta, fecha: d.fecha, plazo: plazoDeServicio(s.diasCatalogo), itemId: null, proveedorId: null });
    }
  }
  for (const g of input.garantias) {
    if (!g.fechaEntrega) continue;
    agregar({
      clave: `garantia:${g.lineaId}`, tipo: "garantia", nombre: g.nombre, sku: g.sku, categoria: g.tipoLinea === "Servicio" ? "Servicio" : g.categoria,
      documento: `Garantía en ${g.ordenCodigo}`, fecha: g.fechaEntrega,
      plazo: g.tipoLinea === "Servicio" ? plazoDeServicio(g.diasCatalogo) : plazoDeArticulo(g.categoria),
      itemId: g.itemId, proveedorId: g.proveedorId,
    });
  }
  return out.sort((a, b) => Number(b.vigente) - Number(a.vigente) || soloFecha(b.fecha).localeCompare(soloFecha(a.fecha)));
}

/** Texto que queda en la línea ("Garantía de"). */
export function textoOrigen(o: Pick<OrigenGarantia, "sku" | "nombre" | "documento" | "fecha">): string {
  return [o.sku, o.nombre, o.documento, fechaCorta(o.fecha)].filter((x) => x && x !== "—").join(" · ");
}

/** La garantía nueva de lo que se entrega en garantía (comprobante): mismo plazo que una venta, desde la entrega. */
export function nuevaGarantia(input: { tipoLinea: string; categoria: string; diasCatalogo: number | null; entrega: string }): { plazo: Plazo; vence: string | null } {
  const plazo = input.tipoLinea === "Servicio" ? plazoDeServicio(input.diasCatalogo) : plazoDeArticulo(input.categoria);
  return { plazo, vence: venceGarantia(input.entrega, plazo) };
}
