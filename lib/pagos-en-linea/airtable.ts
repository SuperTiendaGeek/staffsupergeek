import "server-only";

// Tabla "Pagos en línea" (tblvcEcIqYu0hY0CP, creada por Claude el 16-nov-2026
// con aprobación del dueño). Un registro por intento de pago. Solo el
// servidor la escribe. IDs de campos en claude/Diseno_10D_Pagos_en_linea.md.

import {
  airtableMutation, airtableRequest, cleanString, compactFields, escapeFormulaString, fetchRecordsByIds,
  firstLinkedId, firstNumber, linkedIds, tableUrl, type AirtableListResponse, type AirtableMutationResponse, type AirtableRecord,
} from "@/lib/finanzas/airtable-client";
import { codigoPago, type Ambiente, type EstadoPago, type MedioPago, type OrigenPago, type ParaPago, type Pasarela } from "./reglas";

const T_PAGOS = "Pagos en línea";
const F = {
  pago: "Pago",
  numero: "N.º",
  codigo: "Código",
  origen: "Origen",
  pedido: "Pedido",
  orden: "Orden",
  pasarela: "Pasarela",
  ambiente: "Ambiente",
  estado: "Estado",
  para: "Para",
  monto: "Monto",
  base: "Base sin IVA",
  iva: "IVA",
  medio: "Medio",
  tarjeta: "Tarjeta",
  tarifa: "Tarifa",
  neto: "Neto",
  eleccion: "Elección",
  idTransaccion: "ID transacción",
  autorizacion: "Autorización",
  abono: "Abono",
  confirmadoEn: "Confirmado en",
  detalle: "Detalle",
  // Etapa D (18-nov): quién pagó (DeUna lo informa) y quién asignó un pago
  // que llegó sin referencia (bandeja "Pagos recibidos").
  pagador: "Pagador",
  identificacion: "Identificación del pagador",
  asignadoPor: "Asignado por",
  asignadoEn: "Asignado en",
} as const;

// Campos inversos (creados por Airtable al enlazar). Se leen por ID: si
// alguien los renombra, el código sigue funcionando.
const INVERSO_EN_PEDIDO = "fldq0jqHo6cGSslKi"; // Operación Comercial → Pagos en línea
const INVERSO_EN_ORDEN = "fldmNCmymgPgrIE17"; // Órdenes de Reparación → Pagos en línea
const INVERSO_EN_ABONO = "fldKsjHYCgGFCDzi3"; // Abonos → Pagos en línea

export type IntentoRegistro = {
  id: string;
  /** Texto principal: "PL-000027 · OR000551 · $105.00 · DeUna". */
  pago: string;
  numero: number;
  codigo: string;
  origen: OrigenPago | "";
  pedidoId: string | null;
  ordenId: string | null;
  pasarela: Pasarela;
  ambiente: Ambiente;
  estado: EstadoPago;
  para: ParaPago;
  monto: number;
  base: number;
  iva: number;
  medio: MedioPago | "";
  tarjeta: string;
  tarifa: number | null;
  neto: number | null;
  eleccion: string;
  idTransaccion: string;
  autorizacion: string;
  abonoId: string | null;
  confirmadoEn: string;
  creado: string;
  detalle: string;
  pagador: string;
  identificacion: string;
  asignadoPor: string;
  asignadoEn: string;
};

const nombre = (v: unknown) => (v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : cleanString(v));

function mapear(r: AirtableRecord): IntentoRegistro {
  const f = r.fields;
  const numero = firstNumber(f[F.numero]) ?? 0;
  return {
    id: r.id,
    pago: cleanString(f[F.pago]),
    numero,
    codigo: cleanString(f[F.codigo]) || codigoPago(numero),
    origen: nombre(f[F.origen]) as OrigenPago | "",
    pedidoId: firstLinkedId(f[F.pedido]),
    ordenId: firstLinkedId(f[F.orden]),
    pasarela: (nombre(f[F.pasarela]) || "PayPhone") as Pasarela,
    ambiente: (nombre(f[F.ambiente]) || "Prueba") as Ambiente,
    estado: (nombre(f[F.estado]) || "Abierto") as EstadoPago,
    para: (nombre(f[F.para]) || "Confirmar") as ParaPago,
    monto: firstNumber(f[F.monto]) ?? 0,
    base: firstNumber(f[F.base]) ?? 0,
    iva: firstNumber(f[F.iva]) ?? 0,
    medio: nombre(f[F.medio]) as MedioPago | "",
    tarjeta: cleanString(f[F.tarjeta]),
    tarifa: firstNumber(f[F.tarifa]),
    neto: firstNumber(f[F.neto]),
    eleccion: cleanString(f[F.eleccion]),
    idTransaccion: cleanString(f[F.idTransaccion]),
    autorizacion: cleanString(f[F.autorizacion]),
    abonoId: firstLinkedId(f[F.abono]),
    confirmadoEn: cleanString(f[F.confirmadoEn]),
    creado: r.createdTime ?? "",
    detalle: cleanString(f[F.detalle]),
    pagador: cleanString(f[F.pagador]),
    identificacion: cleanString(f[F.identificacion]),
    asignadoPor: cleanString(f[F.asignadoPor]),
    asignadoEn: cleanString(f[F.asignadoEn]),
  };
}

export async function crearIntento(input: {
  origen: OrigenPago;
  pedidoId?: string;
  ordenId?: string;
  pasarela: Pasarela;
  ambiente: Ambiente;
  para: ParaPago;
  monto: number;
  base: number;
  iva: number;
  eleccion: string;
  /** Pagos que llegan ya hechos (DeUna sin referencia): nacen con estos datos. */
  estado?: EstadoPago;
  idTransaccion?: string;
  autorizacion?: string;
  medio?: MedioPago;
  tarifa?: number;
  neto?: number;
  pagador?: string;
  identificacion?: string;
  confirmadoEn?: string;
  detalle?: string;
}): Promise<IntentoRegistro> {
  const res = await airtableMutation<AirtableMutationResponse>(tableUrl(T_PAGOS), {
    method: "POST",
    body: JSON.stringify({
      records: [{ fields: compactFields({
        [F.origen]: input.origen,
        [F.pedido]: input.pedidoId ? [input.pedidoId] : undefined,
        [F.orden]: input.ordenId ? [input.ordenId] : undefined,
        [F.pasarela]: input.pasarela,
        [F.ambiente]: input.ambiente,
        [F.estado]: input.estado ?? "Abierto",
        [F.para]: input.para,
        [F.monto]: input.monto,
        [F.base]: input.base,
        [F.iva]: input.iva,
        [F.eleccion]: input.eleccion,
        [F.idTransaccion]: input.idTransaccion,
        [F.autorizacion]: input.autorizacion,
        [F.medio]: input.medio,
        [F.tarifa]: input.tarifa,
        [F.neto]: input.neto,
        [F.pagador]: input.pagador,
        [F.identificacion]: input.identificacion,
        [F.confirmadoEn]: input.confirmadoEn,
        [F.detalle]: input.detalle,
      }) }],
    }),
  });
  const r = res.records?.[0];
  if (!r) throw new Error("Airtable no devolvió el pago en línea creado.");
  return mapear(r);
}

export type CambiosIntento = Partial<{
  pago: string;
  estado: EstadoPago;
  medio: MedioPago;
  tarjeta: string;
  tarifa: number;
  neto: number;
  idTransaccion: string;
  autorizacion: string;
  abonoId: string;
  confirmadoEn: string;
  detalle: string;
  pagador: string;
  identificacion: string;
  /** Asignar un pago sin referencia (bandeja). */
  origen: OrigenPago;
  pedidoId: string;
  ordenId: string;
  asignadoPor: string;
  asignadoEn: string;
}>;

export async function actualizarIntento(id: string, c: CambiosIntento): Promise<IntentoRegistro> {
  const fields = compactFields({
    [F.pago]: c.pago,
    [F.estado]: c.estado,
    [F.medio]: c.medio,
    [F.tarjeta]: c.tarjeta,
    [F.tarifa]: c.tarifa,
    [F.neto]: c.neto,
    [F.idTransaccion]: c.idTransaccion,
    [F.autorizacion]: c.autorizacion,
    [F.abono]: c.abonoId ? [c.abonoId] : undefined,
    [F.confirmadoEn]: c.confirmadoEn,
    [F.detalle]: c.detalle,
    [F.pagador]: c.pagador,
    [F.identificacion]: c.identificacion,
    [F.origen]: c.origen,
    [F.pedido]: c.pedidoId ? [c.pedidoId] : undefined,
    [F.orden]: c.ordenId ? [c.ordenId] : undefined,
    [F.asignadoPor]: c.asignadoPor,
    [F.asignadoEn]: c.asignadoEn,
  });
  // Tarifa 0 (saldo PayPhone) es un valor válido: compactFields no lo quita.
  const res = await airtableMutation<AirtableMutationResponse>(tableUrl(T_PAGOS), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });
  const r = res.records?.[0];
  if (!r) throw new Error("Airtable no devolvió el pago en línea actualizado.");
  return mapear(r);
}

async function listar(formula: string, max = 50): Promise<IntentoRegistro[]> {
  const u = new URL(tableUrl(T_PAGOS));
  u.searchParams.set("filterByFormula", formula);
  u.searchParams.set("pageSize", String(Math.min(100, max)));
  const data = await airtableRequest<AirtableListResponse>(u.toString());
  return (data.records ?? []).map(mapear).sort((a, b) => a.numero - b.numero);
}

export async function intentoPorCodigo(codigo: string): Promise<IntentoRegistro | null> {
  if (!/^PL-\d{6,}$/.test(codigo)) return null;
  const r = await listar(`{${F.codigo}}='${escapeFormulaString(codigo)}'`, 2);
  return r.length === 1 ? r[0] : null;
}

/** Todos los intentos con ese ID de la pasarela, del más antiguo al más nuevo. */
export async function intentosPorTransaccion(idTransaccion: string): Promise<IntentoRegistro[]> {
  if (!idTransaccion) return [];
  return listar(`{${F.idTransaccion}}='${escapeFormulaString(idTransaccion)}'`, 10);
}

async function inversos(tabla: string, recordId: string, campoId: string): Promise<string[]> {
  const u = `${tableUrl(tabla)}/${encodeURIComponent(recordId)}?returnFieldsByFieldId=true`;
  const r = await airtableRequest<AirtableRecord>(u).catch(() => null);
  return r ? linkedIds(r.fields[campoId]) : [];
}

/** Intentos de un pedido, del más antiguo al más nuevo. */
export async function intentosDelPedido(pedidoId: string): Promise<IntentoRegistro[]> {
  const ids = await inversos("Operación Comercial", pedidoId, INVERSO_EN_PEDIDO);
  if (!ids.length) return [];
  return (await fetchRecordsByIds(T_PAGOS, ids)).map(mapear).sort((a, b) => a.numero - b.numero);
}

/** Intentos de una orden de reparación, del más antiguo al más nuevo (17-nov). */
export async function intentosDeLaOrden(ordenId: string): Promise<IntentoRegistro[]> {
  const ids = await inversos("Órdenes de Reparación", ordenId, INVERSO_EN_ORDEN);
  if (!ids.length) return [];
  return (await fetchRecordsByIds(T_PAGOS, ids)).map(mapear).sort((a, b) => a.numero - b.numero);
}

/** El pago en línea de un abono (para proponer el neto al Acreditar en Finanzas). */
export async function intentoDeAbono(abonoId: string): Promise<IntentoRegistro | null> {
  const ids = await inversos("Abonos", abonoId, INVERSO_EN_ABONO);
  if (!ids.length) return null;
  const r = await fetchRecordsByIds(T_PAGOS, ids.slice(0, 1));
  return r[0] ? mapear(r[0]) : null;
}

// ─── Bandeja "Pagos recibidos" (maqueta 12) ─────────────────────────────────

/** Varias páginas (hasta `max` registros), del más nuevo al más antiguo. */
async function listarTodo(formula: string, max = 1000): Promise<IntentoRegistro[]> {
  const todos: IntentoRegistro[] = [];
  let offset = "";
  do {
    const u = new URL(tableUrl(T_PAGOS));
    u.searchParams.set("filterByFormula", formula);
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const data = await airtableRequest<AirtableListResponse & { offset?: string }>(u.toString());
    todos.push(...(data.records ?? []).map(mapear));
    offset = data.offset ?? "";
  } while (offset && todos.length < max);
  return todos.sort((a, b) => b.numero - a.numero);
}

/** Lo que espera al personal: por asignar y por revisar (sin límite de fecha). */
export async function intentosPendientesDeBandeja(): Promise<IntentoRegistro[]> {
  return listarTodo(`OR({${F.estado}}='Por asignar',{${F.estado}}='En revisión')`, 300);
}

/** Intentos creados en [desde, hasta) (ISO UTC). */
export async function intentosEntre(desde: string, hasta: string): Promise<IntentoRegistro[]> {
  return listarTodo(`AND(IS_AFTER(CREATED_TIME(),'${escapeFormulaString(desde)}'),IS_BEFORE(CREATED_TIME(),'${escapeFormulaString(hasta)}'))`);
}

/** Pagos DeUna por asignar de las últimas horas (maqueta 12b, "Registrar pago"). */
export async function deUnaPorAsignarRecientes(horas: number): Promise<IntentoRegistro[]> {
  const desde = new Date(Date.now() - horas * 3_600_000).toISOString();
  return listarTodo(`AND({${F.estado}}='Por asignar',{${F.pasarela}}='DeUna',IS_AFTER(CREATED_TIME(),'${desde}'))`, 50);
}
