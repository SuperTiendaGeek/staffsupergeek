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
//   · Total  = la calculadora única (lib/estado-cuenta), la misma que
//     getCuentaUnificada(); ya no "Total a Pagar NV" de Airtable.
//   · Abonos = inverso "Abonos (Operación)" de la orden + "Abonos" de cada
//     operación vinculada, deduplicados por id — igual que la cuenta
//     unificada tras el arreglo del abono doble (OR000382).
//
// Regla de la casa: nunca filtrar por campo de link. Los ids se leen de los
// campos inversos y se busca por RECORD_ID().

import { clasificarOrden, type DocumentoOrigen, type OrdenCobro } from "./reglas";
import { estadoPresupuesto } from "../presupuesto/reglas";
import {
  CAMPOS_ORDEN_CUENTA,
  estadosDeCuentaDeOrdenes,
  ids,
  listarTodo,
  porIds,
  texto,
  type Registro,
} from "@/lib/estado-cuenta/airtable";

const T_ORDENES     = "Órdenes de Reparación";
const T_FACTURAS    = "Facturas Electrónicas";
const T_RECIBOS     = "Recibos";
const T_PRESUPUESTO = "Presupuesto por Orden";

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
    "Facturas Electrónicas", "Recibos", ...CAMPOS_ORDEN_CUENTA,
  ], formula);

  // UNA sola calculadora (auditoría ops, punto 4): la misma cuenta que la
  // pantalla de la orden. Antes el total salía de "Total a Pagar NV" de
  // Airtable, que cobra el artículo sin mirar cuántas unidades pidió el
  // cliente y no ve los pedidos aprobados sin artículo.
  const [cuentas, facturas, recibos, lineasPresupuesto] = await Promise.all([
    estadosDeCuentaDeOrdenes(ordenes),
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
      // La calculadora ya incluye lo aprobado sin artículo; clasificarOrden
      // lo recibe aparte (comprometido) para mostrarlo.
      totalCuenta:  (cuentas.get(o.id)?.totalCuenta ?? 0) - (cuentas.get(o.id)?.totalAprobadoSinArticulo ?? 0),
      comprometidoPresupuesto: cuentas.get(o.id)?.totalAprobadoSinArticulo ?? 0,
      abonos: cuentas.get(o.id)?.abonos ?? [],
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
