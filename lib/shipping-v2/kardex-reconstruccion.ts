// Reconstrucción de la historia del Kardex (punto 12, decisión 2 del dueño:
// "reconstruir todo"). Módulo puro: recibe lo leído de Airtable y devuelve los
// movimientos que faltan en el libro. Lo usa scripts/ajuste-punto12-kardex.ts
// (vista previa y --aplicar).
//
// Por cada registro de Shipping Items:
//  · Entrada al llegar a la tienda: "Unidades compradas" (lo que dice la
//    compra) o, si no se registró, lo que hace falta para llegar a lo que hay
//    hoy ("Saldo inicial", p. ej. lo migrado). Fecha: la recepción del
//    historial, la de su caja, o la de registro.
//  · Ventas, anulaciones y devoluciones: facturas, recibos y notas de crédito
//    (las mismas claves que usa el sistema al emitir: nada se duplica).
//  · Piezas usadas en mejoras (y su anulación).
//  · Bajas, vendidas fuera del sistema, salidas internas y ventas de otro
//    artículo: de sus contadores, con fecha y motivo del historial.
//  · Despiece completado: el equipo sale "Desarmado".
//
// El costo de cada movimiento es el costo actual del registro (el que ya
// incluye flete, arancel y mejoras): el valor de hoy queda exacto.
//
// Si el libro ya tiene movimientos del sistema para un registro (porque algo
// pasó entre la publicación y el script), solo se agrega lo anterior a ellos.

import {
  causaDeBaja,
  claveKardex,
  costoUnitarioDeCampos,
  crearMovimiento,
  movimientosDeDocumento,
  registroDeCampos,
  unidadesEnLibro,
  type LineaDocumentoKardex,
  type MotivoKardex,
  type MovimientoKardex,
} from "./kardex";

export type RegistroFuente = { id: string; createdTime?: string; fields: Record<string, unknown> };

export type FuentesReconstruccion = {
  items: RegistroFuente[];
  facturas: RegistroFuente[];
  recibos: RegistroFuente[];
  notas: RegistroFuente[];
  intervenciones: RegistroFuente[];
  eventos: RegistroFuente[];
  packings: RegistroFuente[];
  proveedores: RegistroFuente[];
  existentes: MovimientoKardex[];
};

export type FilaReporte = {
  id: string;
  sku: string;
  entrada: number;
  motivoEntrada: MotivoKardex | "";
  movimientos: number;
  libro: number;
  inventario: number;
  /** "compradas" si la entrada salió de la compra; "inventario" si se calculó para cuadrar. */
  base: "compradas" | "inventario" | "sin-entrada";
};

export type ResultadoReconstruccion = {
  nuevos: MovimientoKardex[];
  reporte: FilaReporte[];
  /** Registros cuyo libro, ya reconstruido, no dice lo mismo que el inventario. */
  noCuadran: FilaReporte[];
};

function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return texto(v[0]);
  if (v && typeof v === "object" && "name" in (v as Record<string, unknown>)) return String((v as { name: unknown }).name ?? "");
  return "";
}
function numero(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (Array.isArray(v)) return numero(v[0]);
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return 0;
}
function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function norm(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function lineasJson(v: unknown): Record<string, unknown> {
  try {
    const o = JSON.parse(texto(v) || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
/** Fecha útil de un registro: su campo de fecha (con la hora de creación si es del mismo día) o su creación. */
function fechaDe(r: RegistroFuente, campo?: string): string {
  const creado = r.createdTime || "";
  const dia = campo ? texto(r.fields[campo]) : "";
  if (!dia) return creado;
  if (dia.length > 10) return dia;
  if (creado) {
    const diaCreado = new Date(Date.parse(creado) - 5 * 3600_000).toISOString().slice(0, 10);
    if (diaCreado === dia) return creado;
  }
  return new Date(`${dia}T12:00:00-05:00`).toISOString();
}
function masMinutos(iso: string, min: number) {
  return new Date(Date.parse(iso) + min * 60_000).toISOString();
}

const MOTIVOS_ENTRADA = new Set<MotivoKardex>([
  "Compra recibida", "Regalo del proveedor", "Reajuste de inventario", "Saldo inicial", "Pieza de despiece", "Pieza retirada en una mejora",
  "Separación de unidad", "Pasa a activo de la tienda", "Pasa a la venta",
]);

type Evento = { fecha: string; desc: string; obs: string; quien: string };

export function reconstruirKardex(f: FuentesReconstruccion): ResultadoReconstruccion {
  const itemsPorId = new Map(f.items.map((r) => [r.id, r.fields]));
  const proveedor = new Map(f.proveedores.map((r) => [r.id, texto(r.fields["Nombre proveedor"])]));
  const caja = new Map(f.packings.map((r) => [r.id, r]));
  const eventosPorItem = new Map<string, Evento[]>();
  for (const e of f.eventos) {
    const itemId = ids(e.fields["Item relacionado"])[0];
    if (!itemId) continue;
    const lista = eventosPorItem.get(itemId) ?? [];
    lista.push({
      fecha: texto(e.fields["Fecha del evento"]) || e.createdTime || "",
      desc: texto(e.fields["Descripción del evento"]),
      obs: texto(e.fields["Observación"]),
      quien: texto(e.fields["Registrado por"]),
    });
    eventosPorItem.set(itemId, lista);
  }
  for (const l of eventosPorItem.values()) l.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  // ── Documentos ──
  const porItem = new Map<string, MovimientoKardex[]>();
  const agregar = (movs: MovimientoKardex[]) => {
    for (const m of movs) {
      const l = porItem.get(m.registroId) ?? [];
      l.push(m);
      porItem.set(m.registroId, l);
    }
  };
  const lineasDe = (lista: unknown, conPrecio: (l: Record<string, unknown>) => number | null, filtro: (l: Record<string, unknown>) => boolean = () => true): LineaDocumentoKardex[] =>
    (Array.isArray(lista) ? lista : [])
      .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : {}))
      .filter((l) => typeof l.shippingItemId === "string" && (l.tipo === undefined || l.tipo === "producto") && filtro(l))
      .map((l) => ({ itemId: String(l.shippingItemId), cantidad: numero(l.cantidad), precio: conPrecio(l) }));
  const enlazado = (itemId: string, campo: string, docId: string) => ids(itemsPorId.get(itemId)?.[campo]).includes(docId);
  const ORIGEN = "Reconstrucción" as const;

  for (const r of f.facturas) {
    const x = r.fields;
    if (texto(x["Estado"]) !== "AUTORIZADO" || norm(texto(x["Ambiente"])) !== "produccion") continue;
    const anulada = norm(texto(x["Estado Anulación"])) === "anulada";
    const sync = texto(x["Sincronización Inventario"]);
    const lineas = lineasDe(lineasJson(x["Líneas JSON"]).detalles, (l) => (numero(l.cantidad) > 0 ? numero(l.precioTotalSinImpuesto) / numero(l.cantidad) : null))
      .filter((l) => (anulada ? sync === "OK" : enlazado(l.itemId, "Factura", r.id)));
    if (!lineas.length) continue;
    const base = { documentoId: r.id, numero: texto(x["Número de Factura"]), cliente: texto(x["Cliente - Nombre"]), items: itemsPorId, origen: ORIGEN };
    const fecha = fechaDe(r, "Fecha de Emisión");
    agregar(movimientosDeDocumento({ ...base, tipo: "venta-factura", fecha, lineas }));
    if (anulada) {
      const fa = texto(x["Fecha Solicitud Anulación"]);
      agregar(movimientosDeDocumento({ ...base, tipo: "anula-factura", fecha: fa ? new Date(`${fa}T12:00:00-05:00`).toISOString() : masMinutos(fecha, 1), lineas }));
    }
  }
  for (const r of f.recibos) {
    const x = r.fields;
    const estado = norm(texto(x["Estado"]));
    const sync = texto(x["Sincronización Inventario"]);
    const anulado = estado === "anulado";
    const lineas = lineasDe(lineasJson(x["Líneas JSON"]).lineas, (l) => (numero(l.cantidad) > 0 ? (numero(l.cantidad) * numero(l.precioUnitario) - numero(l.descuento)) / numero(l.cantidad) : null))
      .filter((l) => (anulado ? sync === "OK" : estado === "vigente" && enlazado(l.itemId, "Recibo", r.id)));
    if (!lineas.length) continue;
    const base = { documentoId: r.id, numero: texto(x["Número"]), cliente: texto(x["Cliente Nombre"]), items: itemsPorId, origen: ORIGEN };
    const fecha = fechaDe(r, "Fecha");
    agregar(movimientosDeDocumento({ ...base, tipo: "venta-recibo", fecha, lineas }));
    if (anulado) agregar(movimientosDeDocumento({ ...base, tipo: "anula-recibo", fecha: masMinutos(fecha, 1), lineas }).map((m) => ({ ...m, nota: "Fecha de anulación aproximada" })));
  }
  for (const r of f.notas) {
    const x = r.fields;
    if (texto(x["Estado"]) !== "AUTORIZADO" || norm(texto(x["Ambiente"])) === "pruebas" || texto(x["Reverso Inventario"]) !== "OK") continue;
    const lineas = lineasDe(lineasJson(x["Líneas JSON"]).detalles, () => null, (l) => l.devolucionFisica === true).filter((l) => enlazado(l.itemId, "Nota de Crédito", r.id));
    if (!lineas.length) continue;
    agregar(movimientosDeDocumento({ tipo: "devolucion-nc", documentoId: r.id, numero: texto(x["Número de Nota de Crédito"]), cliente: texto(x["Cliente Nombre"]), fecha: fechaDe(r, "Fecha de Emisión"), lineas, items: itemsPorId, origen: ORIGEN }));
  }
  for (const r of f.intervenciones) {
    const x = r.fields;
    if (texto(x["Tipo"]) !== "Mejora") continue;
    const piezaId = ids(x["Repuesto usado"])[0];
    const q = Math.round(numero(x["Cantidad usada"]));
    const pf = piezaId ? itemsPorId.get(piezaId) : undefined;
    if (!piezaId || !pf || q < 1) continue;
    const equipo = itemsPorId.get(texto(x["Item ID"]) || ids(x["Item"])[0] || "");
    const registro = registroDeCampos(piezaId, pf);
    const ctx = { documentoTipo: "Mejora" as const, documentoId: r.id, documento: `Mejora en ${texto(equipo?.["SKU"])}`.trim(), hechoPor: texto(x["Realizado por"]), nota: texto(x["Detalle"]), origen: ORIGEN };
    const fecha = fechaDe(r, "Fecha");
    agregar([crearMovimiento({ ...ctx, clave: claveKardex("mejora", r.id, "pieza"), motivo: "Usada en una mejora", cantidad: -q, registro, fecha })]);
    if (x["Anulada"] === true) {
      const fa = texto(x["Fecha de anulación"]) || masMinutos(fecha, 1);
      agregar([crearMovimiento({ ...ctx, clave: claveKardex("anula-mejora", r.id, "pieza"), motivo: "Mejora anulada", cantidad: q, registro, fecha: fa, hechoPor: texto(x["Anulada por"]) || ctx.hechoPor, nota: texto(x["Motivo de anulación"]) })]);
    }
  }

  // ── Registro por registro ──
  const existentesPorItem = new Map<string, MovimientoKardex[]>();
  for (const m of f.existentes) {
    const l = existentesPorItem.get(m.registroId) ?? [];
    l.push(m);
    existentesPorItem.set(m.registroId, l);
  }
  const clavesExistentes = new Set(f.existentes.map((m) => m.clave));

  // Fecha en que llegó cada registro. Una unidad separada después (punto 10b-6)
  // llegó con su registro original: toma la fecha más antigua de su SKU.
  const fechaLlegada = (it: RegistroFuente) => {
    const x = it.fields;
    const recepcion = [...(eventosPorItem.get(it.id) ?? [])].reverse().find((e) => /^Recepción: Recibido = sí/.test(e.desc));
    const cajaRec = caja.get(ids(x["Shipping Packings"])[0] ?? "");
    const esPieza = ids(x["Item padre"]).length > 0 && x["Es parte recuperada"] === true;
    return {
      fecha: recepcion?.fecha
        || (esPieza ? texto(itemsPorId.get(ids(x["Item padre"])[0])?.["Fecha de despiece"]) : "")
        || texto(cajaRec?.fields["Fecha de recepción"])
        || texto(x["Fecha de registro"])
        || it.createdTime
        || "",
      quien: recepcion?.quien || texto(x["Registrado por"]),
    };
  };
  const esSeparada = (x: Record<string, unknown>) => /Unidad separada de /.test(texto(x["Observaciones internas"]));
  const primeraDelSku = new Map<string, string>();
  for (const it of f.items) {
    if (esSeparada(it.fields)) continue;
    const sku = texto(it.fields["SKU"]);
    const { fecha } = fechaLlegada(it);
    if (sku && fecha && (!primeraDelSku.has(sku) || fecha < primeraDelSku.get(sku)!)) primeraDelSku.set(sku, fecha);
  }
  const nuevos: MovimientoKardex[] = [];
  const reporte: FilaReporte[] = [];

  for (const it of f.items) {
    const x = it.fields;
    const registro = registroDeCampos(it.id, x);
    const costo = costoUnitarioDeCampos(x);
    const eventos = eventosPorItem.get(it.id) ?? [];
    const movs: MovimientoKardex[] = [...(porItem.get(it.id) ?? [])];
    const ctxBase = { registro, costoUnitario: costo, origen: ORIGEN };
    const ultimaAct = texto(x["Última actualización"]) || it.createdTime || "";

    // Bajas y bajas revertidas, del historial; lo que no tenga detalle, con la fecha de la última actualización.
    const bajas = Math.round(numero(x["Unidades dadas de baja"]));
    let neto = 0;
    eventos.forEach((e, n) => {
      const baja = e.desc.match(/(?:Mercadería|Activo) dad[oa] de baja: (\d+) de \d+ unidad(?:\(es\))?\. Motivo: ([\s\S]*)/);
      if (baja) {
        const q = Number(baja[1]);
        neto += q;
        movs.push(crearMovimiento({ ...ctxBase, clave: claveKardex("rec-baja", it.id, n), motivo: "Dada de baja", cantidad: -q, fecha: e.fecha, hechoPor: e.quien, nota: baja[2].trim(), causa: causaDeBaja(baja[2]), documentoTipo: /^Conteo /.test(baja[2]) ? "Conteo" : /novedad/i.test(baja[2]) ? "Novedad" : "Ficha" }));
        return;
      }
      const rev = e.desc.match(/Baja revertida: vuelven (\d+) unidad(?:\(es\))?\. Motivo: ([\s\S]*)/);
      if (rev) {
        const q = Number(rev[1]);
        neto -= q;
        movs.push(crearMovimiento({ ...ctxBase, clave: claveKardex("rec-revierte-baja", it.id, n), motivo: "Baja revertida", cantidad: q, fecha: e.fecha, hechoPor: e.quien, nota: rev[2].trim(), documentoTipo: "Ficha" }));
      }
    });
    if (bajas !== neto) {
      movs.push(crearMovimiento({ ...ctxBase, clave: claveKardex("rec-baja", it.id, "resto"), motivo: bajas > neto ? "Dada de baja" : "Baja revertida", cantidad: neto - bajas, fecha: ultimaAct, nota: "Baja sin detalle en el historial", causa: bajas > neto ? "Otro" : "", documentoTipo: "Ficha" }));
    }

    // Cuadres (punto 10c-4): contadores, con la fecha y el motivo del último cuadre del historial.
    const cuadre = [...eventos].reverse().find((e) => e.desc.startsWith("Cuadre de unidades"));
    const fechaCuadre = cuadre?.fecha || ultimaAct;
    const notaCuadre = cuadre?.desc.match(/Motivo: ([\s\S]*)$/)?.[1]?.trim() ?? "";
    const contadores: Array<[string, MotivoKardex, number]> = [
      ["Vendidas fuera del sistema", "Vendida fuera del sistema", -1],
      ["Salidas internas", "Salida interna", -1],
      ["Ventas de otro artículo", "Venta de otro artículo", 1],
    ];
    for (const [campo, motivo, signo] of contadores) {
      const n = Math.round(numero(x[campo]));
      if (n) movs.push(crearMovimiento({ ...ctxBase, clave: claveKardex("rec-cuadre", it.id, campo), motivo, cantidad: signo * n, fecha: fechaCuadre, hechoPor: cuadre?.quien ?? "", nota: notaCuadre, documentoTipo: "Revisión" }));
    }

    // Despiece completado: el equipo sale desarmado.
    const despiece = norm(texto(x["Estado de despiece"]));
    if ((despiece === "despiece completo" || despiece === "despiece parcial") && texto(x["Fecha de despiece"])) {
      movs.push(crearMovimiento({ ...ctxBase, clave: claveKardex("rec-despiece", it.id), motivo: "Desarmada", cantidad: -1, fecha: texto(x["Fecha de despiece"]), hechoPor: texto(x["Responsable de despiece"]), documentoTipo: "Despiece", documentoId: it.id, documento: `Despiece ${registro.sku}` }));
    }

    // Entrada.
    const ahora = unidadesEnLibro(x);
    const neta = movs.reduce((s, m) => s + m.cantidad, 0);
    const compradas = Math.round(numero(x["Unidades compradas"]));
    const tipoOp = norm(texto(x["Tipo de operación"]));
    const esPieza = ids(x["Item padre"]).length > 0 && x["Es parte recuperada"] === true;
    const esPiezaRetirada = ids(x["Intervenciones (pieza retirada)"]).length > 0;
    const entro = x["Recibido"] === true && !(norm(texto(x["Estado Item"])) === "pieza en espera");
    let entrada = 0;
    let base: FilaReporte["base"] = "sin-entrada";
    if (entro || movs.length) {
      if (compradas > 0 && !esPieza && !esPiezaRetirada) {
        entrada = compradas;
        base = "compradas";
      } else {
        entrada = ahora - neta;
        base = "inventario";
      }
    }
    let motivoEntrada: MotivoKardex | "" = "";
    if (entrada > 0) {
      motivoEntrada = esPieza ? "Pieza de despiece"
        : esPiezaRetirada ? "Pieza retirada en una mejora"
          : x["Es regalo"] === true || tipoOp === "regalo de proveedor" ? "Regalo del proveedor"
            : tipoOp.startsWith("reajuste") ? (base === "compradas" ? "Reajuste de inventario" : "Saldo inicial")
              : base === "compradas" ? "Compra recibida" : "Saldo inicial";
      const cajaId = ids(x["Shipping Packings"])[0];
      const llegada = fechaLlegada(it);
      let fecha = esSeparada(x) && primeraDelSku.get(registro.sku) ? primeraDelSku.get(registro.sku)! : llegada.fecha;
      const primera = movs.map((m) => m.fecha).filter(Boolean).sort()[0];
      if (primera && fecha && fecha >= primera) fecha = masMinutos(primera, -1);
      const orden = ids(x["Orden de compra"])[0];
      movs.push(crearMovimiento({
        ...ctxBase,
        clave: claveKardex("rec-entrada", it.id),
        motivo: motivoEntrada,
        cantidad: entrada,
        fecha,
        contraparte: proveedor.get(ids(x["Proveedor de compra"])[0] ?? "") ?? "",
        documentoTipo: cajaId ? "Caja" : orden ? "Orden de compra" : "Reconstrucción",
        documentoId: cajaId || orden || "",
        hechoPor: llegada.quien,
        nota: base === "inventario" && motivoEntrada === "Saldo inicial" ? "Sin compra registrada: arranca con lo que había" : "",
      }));
    } else if (entrada < 0) {
      // Salió más de lo que se puede explicar: lo deja a la vista en vez de inventar una entrada.
      base = "inventario";
    }

    // Solo lo que falta: lo que el sistema ya registró en vivo no se repite.
    const vivos = existentesPorItem.get(it.id) ?? [];
    const desdeVivo = vivos.filter((m) => m.origen === "Sistema").map((m) => m.fecha).sort()[0];
    const yaEntro = vivos.some((m) => MOTIVOS_ENTRADA.has(m.motivo) && m.cantidad > 0);
    const agregados = movs.filter((m) => {
      if (clavesExistentes.has(m.clave)) return false;
      if (m.clave === claveKardex("rec-entrada", it.id) && yaEntro) return false;
      if (desdeVivo && m.fecha >= desdeVivo && !m.documentoId.startsWith("rec")) return false;
      return true;
    });
    nuevos.push(...agregados);
    const libro = [...vivos, ...agregados].reduce((s, m) => s + m.cantidad, 0);
    reporte.push({ id: it.id, sku: registro.sku, entrada, motivoEntrada, movimientos: agregados.length, libro, inventario: ahora, base });
  }

  return { nuevos, reporte, noCuadran: reporte.filter((r) => r.libro !== r.inventario) };
}
