import "server-only";

// Carga en bloque de los datos del control de cobros. Las reglas viven en
// ./reglas.ts; aquí solo se lee Airtable.
//
// Por qué no se reutiliza getCuentaUnificada(): esa función hace entre 6 y 8
// lecturas POR orden. Para 50 órdenes serían ~400 llamadas contra el límite
// de 5 por segundo de Airtable. Aquí se hacen unas pocas lecturas en bloque:
//   1. Órdenes del rango (paginado).
//   2. Operaciones vinculadas (para sus abonos).
//   3. Abonos de ambos lados, deduplicados por id.
//   4. Facturas y recibos vinculados (solo número y estado).
//
// Mismas fuentes que la cuenta unificada:
//   · Total  = "Total a Pagar NV" (servicios + repuestos legacy + productos
//     digitales + repuestos de stock V2 + artículos de la operación), el
//     mismo desglose que suma getCuentaUnificada().
//   · Abonos = inverso "Abonos (Operación)" de la orden + "Abonos" de cada
//     operación vinculada, deduplicados por id — igual que la cuenta
//     unificada tras el arreglo del abono doble (OR000382).
//
// Regla de la casa: nunca filtrar por campo de link. Los ids se leen de los
// campos inversos y se busca por RECORD_ID().

import { loadAirtableEnv } from "../config/airtable";
import { clasificarOrden, type DocumentoOrigen, type OrdenCobro } from "./reglas";
import { estadoPresupuesto } from "../presupuesto/reglas";

type Registro = { id: string; fields: Record<string, unknown> };

const T_ORDENES     = "Órdenes de Reparación";
const T_OPERACIONES = "Operación Comercial";
const T_ABONOS      = "Abonos";
const T_FACTURAS    = "Facturas Electrónicas";
const T_RECIBOS     = "Recibos";
const T_PRESUPUESTO = "Presupuesto por Orden";

// Los ids van dentro de filterByFormula, que viaja en la URL: 40 por lote
// deja la URL muy por debajo del límite de Airtable.
const LOTE_IDS = 40;

function cliente() {
  const { token, baseId } = loadAirtableEnv();
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: { Authorization: `Bearer ${token}` } as Record<string, string>,
  };
}

async function listarTodo(tabla: string, campos: string[], formula?: string): Promise<Registro[]> {
  const c = cliente();
  const out: Registro[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${c.baseUrl}/${encodeURIComponent(tabla)}`);
    url.searchParams.set("pageSize", "100");
    for (const f of campos) url.searchParams.append("fields[]", f);
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), { headers: c.headers, cache: "no-store" });
    if (!res.ok) throw new Error(`Airtable ${tabla} ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { records?: Registro[]; offset?: string };
    out.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return out;
}

async function porIds(tabla: string, ids: string[], campos: string[]): Promise<Map<string, Registro>> {
  const unicos = [...new Set(ids)].filter(Boolean);
  const mapa = new Map<string, Registro>();
  for (let i = 0; i < unicos.length; i += LOTE_IDS) {
    const lote = unicos.slice(i, i + LOTE_IDS);
    const formula = lote.length === 1
      ? `RECORD_ID()='${lote[0]}'`
      : `OR(${lote.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    for (const r of await listarTodo(tabla, campos, formula)) mapa.set(r.id, r);
  }
  return mapa;
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const texto = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) { const s = v.find((x) => typeof x === "string"); return typeof s === "string" ? s : ""; }
  if (v && typeof v === "object" && "name" in v) return String((v as { name: unknown }).name ?? "");
  return "";
};
const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export type FiltroCobros = { desde?: string | null; ordenId?: string | null };

// YYYY-MM-DD estricto: el valor entra en una fórmula de Airtable.
function fechaSegura(v?: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function cargarOrdenesCobro(filtro: FiltroCobros = {}): Promise<OrdenCobro[]> {
  const desde = fechaSegura(filtro.desde);
  const ordenId = filtro.ordenId && /^rec[A-Za-z0-9]{14}$/.test(filtro.ordenId) ? filtro.ordenId : null;

  const formula = ordenId
    ? `RECORD_ID()='${ordenId}'`
    : desde
    ? `IS_AFTER({Fecha de Ingreso}, DATEADD(DATETIME_PARSE('${desde}','YYYY-MM-DD'), -1, 'days'))`
    : undefined;

  const ordenes = await listarTodo(T_ORDENES, [
    "ID", "ClienteTXT", "Equipo", "Estado Actual", "Fecha de Ingreso",
    "Total a Pagar NV", "Abonos (Operación)", "Operaciones Comerciales",
    "Facturas Electrónicas", "Recibos", T_PRESUPUESTO,
  ], formula);

  const operaciones = await porIds(T_OPERACIONES, ordenes.flatMap((o) => ids(o.fields["Operaciones Comerciales"])), ["Abonos"]);

  const abonoIdsPorOrden = new Map<string, string[]>();
  for (const o of ordenes) {
    const propios = ids(o.fields["Abonos (Operación)"]);
    const deOperaciones = ids(o.fields["Operaciones Comerciales"]).flatMap((opId) => ids(operaciones.get(opId)?.fields["Abonos"]));
    // Un mismo abono puede estar enlazado a la orden Y a la operación: se
    // deduplica por id, nunca se suma dos veces.
    abonoIdsPorOrden.set(o.id, [...new Set([...propios, ...deOperaciones])]);
  }

  const [abonos, facturas, recibos, lineasPresupuesto] = await Promise.all([
    porIds(T_ABONOS, [...abonoIdsPorOrden.values()].flat(), ["Monto", "Estado del Abono"]),
    porIds(T_FACTURAS, ordenes.flatMap((o) => ids(o.fields["Facturas Electrónicas"])), ["Número de Factura", "Estado"]),
    porIds(T_RECIBOS, ordenes.flatMap((o) => ids(o.fields["Recibos"])), ["Número", "Estado"]),
    porIds(T_PRESUPUESTO, ordenes.flatMap((o) => ids(o.fields[T_PRESUPUESTO])), ["Estado"]),
  ]);

  const docFactura = (id: string): DocumentoOrigen | null => {
    const r = facturas.get(id);
    return r ? { tipo: "factura", recordId: id, numero: texto(r.fields["Número de Factura"]), estado: texto(r.fields["Estado"]) } : null;
  };
  const docRecibo = (id: string): DocumentoOrigen | null => {
    const r = recibos.get(id);
    return r ? { tipo: "recibo", recordId: id, numero: texto(r.fields["Número"]), estado: texto(r.fields["Estado"]) } : null;
  };

  return ordenes
    .map((o) => clasificarOrden({
      recordId:     o.id,
      idVisible:    texto(o.fields["ID"]),
      cliente:      texto(o.fields["ClienteTXT"]),
      equipo:       texto(o.fields["Equipo"]),
      estado:       texto(o.fields["Estado Actual"]),
      fechaIngreso: texto(o.fields["Fecha de Ingreso"]),
      totalCuenta:  numero(o.fields["Total a Pagar NV"]),
      abonos: (abonoIdsPorOrden.get(o.id) ?? [])
        .map((id) => abonos.get(id))
        .filter((a): a is Registro => !!a)
        .map((a) => ({ id: a.id, monto: numero(a.fields["Monto"]), estado: texto(a.fields["Estado del Abono"]) })),
      facturas: ids(o.fields["Facturas Electrónicas"]).map(docFactura).filter((d): d is DocumentoOrigen => !!d),
      recibos:  ids(o.fields["Recibos"]).map(docRecibo).filter((d): d is DocumentoOrigen => !!d),
      estadoPresupuesto: estadoPresupuesto(
        ids(o.fields[T_PRESUPUESTO])
          .map((id) => lineasPresupuesto.get(id))
          .filter((l): l is Registro => !!l)
          .map((l) => ({ estado: (texto(l.fields["Estado"]) || "Propuesta") as "Propuesta" | "Aprobada" | "Cargada" | "Rechazada" }))
      ),
    }))
    .sort((a, b) => b.fechaIngreso.localeCompare(a.fechaIngreso));
}
