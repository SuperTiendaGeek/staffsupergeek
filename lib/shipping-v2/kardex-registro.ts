import "server-only";

// Escritura y lectura del Kardex (punto 12). Las reglas viven en kardex.ts;
// aquí solo se habla con Airtable.
//
// Regla de oro: el Kardex NUNCA rompe la operación que lo llama. Si escribir
// un movimiento falla, la venta, la baja o la recepción ya quedaron hechas;
// el hueco lo detecta la revisión diaria ("Kardex no cuadra") y se arregla
// desde Control. Por eso todas las funciones públicas de escritura atrapan
// sus errores.
//
// Idempotencia: cada movimiento tiene una Clave. Antes de crear se buscan las
// claves que ya existen, así un reintento (o el script de reconstrucción) no
// duplica nada.

import {
  CAMPOS_KARDEX,
  camposDeMovimiento,
  claveKardex,
  crearMovimiento,
  movimientoDeCampos,
  movimientoPorCambio,
  planAjusteCosto,
  registroDeCampos,
  saldosPorRegistro,
  unidadesEnLibro,
  type CausaBaja,
  type DocumentoTipoKardex,
  type MotivoKardex,
  type MovimientoKardex,
  type AmbitoKardex,
  type DiferenciaKardex,
  diferenciasKardex,
  DOC_KARDEX,
  movimientosDeDocumento,
  type LineaDocumentoKardex,
  type TipoDocumentoKardex,
} from "./kardex";
export type { LineaDocumentoKardex, TipoDocumentoKardex } from "./kardex";

export const TABLA_KARDEX = "Shipping Kardex";
const TABLA_ITEMS = "Shipping Items";

function apagado() {
  return process.env.SHIPPING_KARDEX_OFF === "1";
}

function base() {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Falta AIRTABLE_API_KEY/AIRTABLE_BASE_ID.");
  return { token, url: (tabla: string) => `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tabla)}` };
}

function esperaReintento(headers: Headers, intento: number) {
  const ra = Number(headers.get("Retry-After"));
  return Number.isFinite(ra) && ra > 0 ? ra * 1000 : 300 * 2 ** intento;
}

type RegistroAirtable = { id: string; createdTime?: string; fields: Record<string, unknown> };

async function pedir<T>(url: string, init: RequestInit = {}): Promise<T> {
  const { token } = base();
  for (let intento = 0; intento <= 4; intento++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && intento < 4) {
      await new Promise((r) => setTimeout(r, esperaReintento(res.headers, intento)));
      continue;
    }
    throw new Error(`Airtable Kardex ${res.status}: ${await res.text()}`);
  }
  throw new Error("Airtable Kardex: reintentos agotados.");
}

function escapar(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function listarTabla(
  tabla: string,
  opciones: { formula?: string; campos?: string[]; orden?: Array<{ campo: string; dir?: "asc" | "desc" }>; max?: number } = {}
): Promise<RegistroAirtable[]> {
  const { url } = base();
  const out: RegistroAirtable[] = [];
  let offset: string | undefined;
  do {
    const u = new URL(url(tabla));
    u.searchParams.set("pageSize", "100");
    if (opciones.formula) u.searchParams.set("filterByFormula", opciones.formula);
    opciones.campos?.forEach((c) => u.searchParams.append("fields[]", c));
    opciones.orden?.forEach((o, i) => {
      u.searchParams.append(`sort[${i}][field]`, o.campo);
      u.searchParams.append(`sort[${i}][direction]`, o.dir ?? "asc");
    });
    if (offset) u.searchParams.set("offset", offset);
    const data = await pedir<{ records?: RegistroAirtable[]; offset?: string }>(u.toString());
    out.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset && (!opciones.max || out.length < opciones.max));
  return opciones.max ? out.slice(0, opciones.max) : out;
}

function formulaUno(campo: string, valores: string[]) {
  const partes = valores.map((v) => `{${campo}}='${escapar(v)}'`);
  return partes.length === 1 ? partes[0] : `OR(${partes.join(",")})`;
}

async function listarPorValores(tabla: string, campo: string, valores: string[], campos?: string[]): Promise<RegistroAirtable[]> {
  const unicos = [...new Set(valores.filter(Boolean))];
  const out: RegistroAirtable[] = [];
  for (let i = 0; i < unicos.length; i += 30) {
    out.push(...await listarTabla(tabla, { formula: formulaUno(campo, unicos.slice(i, i + 30)), campos }));
  }
  return out;
}

export async function leerItems(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const unicos = [...new Set(ids.filter((id) => typeof id === "string" && id.startsWith("rec")))];
  const out = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < unicos.length; i += 30) {
    const chunk = unicos.slice(i, i + 30);
    const formula = chunk.length === 1 ? `RECORD_ID()='${chunk[0]}'` : `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    for (const r of await listarTabla(TABLA_ITEMS, { formula })) out.set(r.id, r.fields);
  }
  return out;
}

// ─── Lectura del libro ───────────────────────────────────────────────────────

export async function leerMovimientosDeRegistros(registroIds: string[]): Promise<MovimientoKardex[]> {
  const recs = await listarPorValores(TABLA_KARDEX, CAMPOS_KARDEX.registroId, registroIds);
  return recs.map((r) => movimientoDeCampos(r.id, r.fields)).filter((m): m is MovimientoKardex => m !== null);
}

/** Movimientos con fecha en [desde, hasta). Sin fechas: todo el libro. */
export async function leerMovimientos(opciones: { desde?: string; hasta?: string; formulaExtra?: string } = {}): Promise<MovimientoKardex[]> {
  const condiciones: string[] = [];
  if (opciones.desde) condiciones.push(`NOT(IS_BEFORE({${CAMPOS_KARDEX.fecha}}, '${escapar(opciones.desde)}'))`);
  if (opciones.hasta) condiciones.push(`IS_BEFORE({${CAMPOS_KARDEX.fecha}}, '${escapar(opciones.hasta)}')`);
  if (opciones.formulaExtra) condiciones.push(opciones.formulaExtra);
  const formula = condiciones.length === 0 ? undefined : condiciones.length === 1 ? condiciones[0] : `AND(${condiciones.join(",")})`;
  const recs = await listarTabla(TABLA_KARDEX, { formula });
  return recs.map((r) => movimientoDeCampos(r.id, r.fields)).filter((m): m is MovimientoKardex => m !== null);
}

// ─── Escritura ───────────────────────────────────────────────────────────────

/** Escribe movimientos tal cual (de a 10). Esta SÍ lanza: la usa el script de reconstrucción. */
export async function escribirMovimientosKardex(movs: MovimientoKardex[], alAvanzar?: (hechos: number) => void): Promise<void> {
  const { url } = base();
  for (let i = 0; i < movs.length; i += 10) {
    await pedir(url(TABLA_KARDEX), {
      method: "POST",
      body: JSON.stringify({ typecast: true, records: movs.slice(i, i + 10).map((m) => ({ fields: camposDeMovimiento(m) })) }),
    });
    alAvanzar?.(Math.min(i + 10, movs.length));
  }
}

/** Crea los movimientos que todavía no existen (por Clave). Devuelve cuántos creó. Nunca lanza. */
export async function registrarMovimientosKardex(movs: Array<MovimientoKardex | null | undefined>): Promise<number> {
  if (apagado()) return 0;
  const lista = movs.filter((m): m is MovimientoKardex => Boolean(m && m.clave && m.registroId));
  if (!lista.length) return 0;
  try {
    // Una misma clave dos veces en la lista: se queda la primera.
    const porClave = new Map<string, MovimientoKardex>();
    for (const m of lista) if (!porClave.has(m.clave)) porClave.set(m.clave, m);
    const existentes = new Set(
      (await listarPorValores(TABLA_KARDEX, CAMPOS_KARDEX.clave, [...porClave.keys()], [CAMPOS_KARDEX.clave]))
        .map((r) => String(r.fields[CAMPOS_KARDEX.clave] ?? ""))
    );
    const nuevos = [...porClave.values()].filter((m) => !existentes.has(m.clave));
    await escribirMovimientosKardex(nuevos);
    return nuevos.length;
  } catch (error) {
    console.error("[Kardex] No se pudo registrar el movimiento (la revisión diaria lo detectará):", error);
    return 0;
  }
}

export type ContextoKardex = {
  documento?: string;
  documentoTipo?: DocumentoTipoKardex | "";
  documentoId?: string;
  contraparte?: string;
  causa?: CausaBaja | "";
  hechoPor?: string;
  nota?: string;
  fecha?: string;
};

/**
 * El caso general: un registro cambió y hay que explicar en el libro la
 * diferencia de unidades en la tienda. `antes` son sus campos antes del
 * cambio; los de después se releen (o se pasan si ya se tienen).
 *
 * `clave`: identifica ESTE cambio (p. ej. "baja|recX|<evento>").
 */
export async function kardexPorCambio(input: {
  itemId: string;
  antes: Record<string, unknown> | null;
  despues?: Record<string, unknown> | null;
  motivo: MotivoKardex;
  /** Si el renglón va a otro ámbito que el del registro (pasar a activo). */
  ambito?: AmbitoKardex;
  clave: string;
  contexto?: ContextoKardex;
}): Promise<void> {
  if (apagado()) return;
  try {
    const despues = input.despues ?? (await leerItems([input.itemId])).get(input.itemId) ?? null;
    const fields = despues && Object.keys(despues).length ? { ...(input.antes ?? {}), ...despues } : input.antes;
    if (!fields) return;
    const mov = movimientoPorCambio({
      clave: input.clave,
      motivo: input.motivo,
      registro: registroDeCampos(input.itemId, fields),
      ambito: input.ambito,
      antes: input.antes ? unidadesEnLibro(input.antes) : 0,
      despues: despues ? unidadesEnLibro(despues) : 0,
      ...input.contexto,
    });
    await registrarMovimientosKardex([mov]);
  } catch (error) {
    console.error("[Kardex] kardexPorCambio:", input.itemId, input.motivo, error);
  }
}

/** Movimientos ya armados para un registro (traslados, pasar a activo…). Nunca lanza. */
export async function kardexMovimientos(
  partes: Array<{ itemId: string; fields?: Record<string, unknown> | null; motivo: MotivoKardex; cantidad: number; clave: string; ambito?: AmbitoKardex; contexto?: ContextoKardex }>
): Promise<void> {
  if (apagado() || !partes.length) return;
  try {
    const faltan = partes.filter((p) => !p.fields).map((p) => p.itemId);
    const leidos = faltan.length ? await leerItems(faltan) : new Map<string, Record<string, unknown>>();
    const movs = partes
      .filter((p) => p.cantidad !== 0)
      .map((p) => {
        const f = p.fields ?? leidos.get(p.itemId);
        if (!f) return null;
        return crearMovimiento({ clave: p.clave, motivo: p.motivo, cantidad: p.cantidad, registro: registroDeCampos(p.itemId, f), ambito: p.ambito, ...p.contexto });
      });
    await registrarMovimientosKardex(movs);
  } catch (error) {
    console.error("[Kardex] kardexMovimientos:", error);
  }
}

/**
 * Deja el libro de un registro igual a lo que hay en la tienda, explicando la
 * diferencia con el motivo que corresponde. Lo usan el cuadre de Revisión y lo
 * encontrado en un conteo: ahí lo que importa es que, después de la decisión
 * del Administrador, el libro diga lo mismo que el inventario. Nunca lanza.
 */
export async function kardexConciliar(input: {
  itemId: string;
  motivoSube: MotivoKardex;
  motivoBaja: MotivoKardex;
  clave: string;
  contexto?: ContextoKardex;
}): Promise<number> {
  if (apagado()) return 0;
  try {
    const [items, movs] = await Promise.all([leerItems([input.itemId]), leerMovimientosDeRegistros([input.itemId])]);
    const f = items.get(input.itemId);
    if (!f) return 0;
    const saldo = saldosPorRegistro(movs).get(input.itemId)?.cantidad ?? 0;
    const mov = movimientoPorCambio({
      clave: input.clave,
      motivo: unidadesEnLibro(f) >= saldo ? input.motivoSube : input.motivoBaja,
      registro: registroDeCampos(input.itemId, f),
      antes: saldo,
      despues: unidadesEnLibro(f),
      ...input.contexto,
    });
    return await registrarMovimientosKardex([mov]);
  } catch (error) {
    console.error("[Kardex] kardexConciliar:", input.itemId, error);
    return 0;
  }
}

/**
 * Ajuste de costo: compara el costo actual de cada registro con el último que
 * tiene el libro y, si cambió, escribe el ajuste (sin mover unidades). Se
 * llama después de pagar un flete, repartir costos de una caja, registrar o
 * anular una mejora y cambiar el costo del proveedor; y cada mañana para
 * todo el inventario. Nunca lanza.
 */
export async function kardexAjustarCostos(itemIds: string[], contexto: ContextoKardex = {}): Promise<number> {
  if (apagado()) return 0;
  try {
    const ids = [...new Set(itemIds.filter(Boolean))];
    if (!ids.length) return 0;
    const [items, movs] = await Promise.all([leerItems(ids), leerMovimientosDeRegistros(ids)]);
    const saldos = saldosPorRegistro(movs);
    const fecha = contexto.fecha ?? new Date().toISOString();
    const nuevos: MovimientoKardex[] = [];
    for (const id of ids) {
      const f = items.get(id);
      if (!f) continue;
      const registro = registroDeCampos(id, f);
      const saldo = saldos.get(id);
      const mov = planAjusteCosto({
        registro,
        saldo,
        clave: claveKardex("costo", id, saldo?.movimientos ?? 0, saldo?.costoUnitario ?? "", registro.costoUnitario),
        fecha,
        hechoPor: contexto.hechoPor,
        documento: contexto.documento,
        documentoTipo: contexto.documentoTipo,
        documentoId: contexto.documentoId,
        contraparte: contexto.contraparte,
      });
      if (mov) nuevos.push(mov);
    }
    return await registrarMovimientosKardex(nuevos);
  } catch (error) {
    console.error("[Kardex] kardexAjustarCostos:", error);
    return 0;
  }
}

// ─── Documentos de facturación ───────────────────────────────────────────────

/**
 * Lo llaman la factura, el recibo, la nota de crédito y las anulaciones
 * DESPUÉS de mover el inventario, solo con las líneas que sí se movieron.
 * Nunca lanza.
 */
export async function kardexDocumento(input: { tipo: TipoDocumentoKardex; documentoId: string; lineas: LineaDocumentoKardex[]; hechoPor?: string }): Promise<void> {
  if (apagado() || !input.lineas.length) return;
  try {
    const d = DOC_KARDEX[input.tipo];
    const [items, docs] = await Promise.all([
      leerItems(input.lineas.map((l) => l.itemId)),
      listarTabla(d.tabla, { formula: `RECORD_ID()='${escapar(input.documentoId)}'`, campos: [d.numero, d.cliente] }),
    ]);
    const doc = docs[0]?.fields ?? {};
    const movs = movimientosDeDocumento({
      tipo: input.tipo,
      documentoId: input.documentoId,
      numero: String(doc[d.numero] ?? ""),
      cliente: String(doc[d.cliente] ?? ""),
      fecha: new Date().toISOString(),
      lineas: input.lineas,
      items,
      hechoPor: input.hechoPor,
    });
    await registrarMovimientosKardex(movs);
  } catch (error) {
    console.error("[Kardex] kardexDocumento:", input.tipo, input.documentoId, error);
  }
}

// ─── Control diario ──────────────────────────────────────────────────────────

const CAMPOS_REVISION_KARDEX = [
  "SKU", "Nombre del item", "Categoría", "Número de serie", "Es uso local", "Recibido", "Estado Item", "Cantidad",
  "Costo proveedor", "Costo flete asignado", "Costo arancel asignado", "Otros costos asignados", "Costo de mejoras",
  "Costo total unidad", "Costo asignado por despiece",
];

/**
 * Revisión del Kardex (cada mañana, "Revisar ahora" y al verificar un asunto):
 * 1) si un registro en la tienda cambió de costo y el libro no lo sabe, escribe
 *    el ajuste de costo (red de seguridad de los ganchos);
 * 2) devuelve los registros cuyo libro no dice lo mismo que el inventario.
 * Sin `itemIds` revisa todo. Esta sí lanza: quien llama decide qué hacer.
 */
export async function kardexRevisar(opciones: { itemIds?: string[]; ajustarCostos?: boolean } = {}): Promise<DiferenciaKardex[]> {
  if (apagado()) return [];
  const ids = opciones.itemIds ? [...new Set(opciones.itemIds)] : null;
  const [itemsRecs, movs] = await Promise.all([
    ids ? leerItems(ids).then((m) => [...m].map(([id, fields]) => ({ id, fields }))) : listarTabla(TABLA_ITEMS, { campos: CAMPOS_REVISION_KARDEX }),
    ids ? leerMovimientosDeRegistros(ids) : leerMovimientos(),
  ]);
  const saldos = saldosPorRegistro(movs);
  if (opciones.ajustarCostos) {
    const fecha = new Date().toISOString();
    const ajustes: MovimientoKardex[] = [];
    for (const r of itemsRecs) {
      const registro = registroDeCampos(r.id, r.fields);
      const saldo = saldos.get(r.id);
      const mov = planAjusteCosto({
        registro,
        saldo,
        clave: claveKardex("costo", r.id, saldo?.movimientos ?? 0, saldo?.costoUnitario ?? "", registro.costoUnitario),
        fecha,
        hechoPor: "Sistema (revisión diaria)",
      });
      if (mov) ajustes.push(mov);
    }
    if (ajustes.length) await registrarMovimientosKardex(ajustes);
  }
  return diferenciasKardex(
    itemsRecs.map((r) => ({ id: r.id, sku: String(r.fields["SKU"] ?? ""), enLibro: unidadesEnLibro(r.fields) })),
    saldos
  );
}
