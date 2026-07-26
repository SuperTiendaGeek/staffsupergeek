import "server-only";

// Persistencia de reservas (apartados) — tabla "Reservas" (base SUPER GEEK ADM).
// Documento interno; se referencia POR NOMBRE. El cliente completo (correo,
// teléfono, vínculo) y los abonos viven en "Abonos JSON", igual que el recibo
// guarda su cliente/líneas en "Líneas JSON".

import type { AbonoReserva, ReservaCliente, ReservaEstado } from "./types";

const TABLE = "Reservas";

function getClient() {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token)  throw new Error("Falta AIRTABLE_API_KEY en .env.local.");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local.");
  return { baseId, baseUrl: `https://api.airtable.com/v0/${baseId}`, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as Record<string, string> };
}
async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const c = getClient();
  const res = await fetch(url, { ...init, headers: { ...c.headers, ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!res.ok) throw new Error(`Airtable ${TABLE} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}
function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  if (v && typeof v === "object" && "name" in (v as Record<string, unknown>)) return String((v as { name: unknown }).name);
  return "";
}
function num(v: unknown): number { const n = typeof v === "number" ? v : parseFloat(String(v)); return Number.isFinite(n) ? n : 0; }
function att(v: unknown): boolean { return Array.isArray(v) && v.length > 0; }
function linkId(v: unknown): string | undefined { return Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined; }

// ─── Numeración RES-000001 (por el máximo Número, sin campo Secuencial) ───────

async function siguienteNumeroReserva(): Promise<string> {
  const c = getClient();
  const params = new URLSearchParams({ "sort[0][field]": "Número", "sort[0][direction]": "desc", maxRecords: "1", "fields[]": "Número" });
  const data = await req<{ records: Array<{ fields: { "Número"?: string } }> }>(`${c.baseUrl}/${encodeURIComponent(TABLE)}?${params}`);
  const ultimo = data.records[0]?.fields["Número"] ?? "";
  const n = parseInt(ultimo.replace(/\D/g, ""), 10);
  const sig = (Number.isFinite(n) ? n : 0) + 1;
  return `RES-${String(sig).padStart(6, "0")}`;
}

// ─── Crear ────────────────────────────────────────────────────────────────────

export type ReservaCreada = { recordId: string; numero: string; fecha: string; fechaLimite: string };

export async function crearReserva(input: {
  cliente: ReservaCliente; shippingItemId: string; descripcionItem: string; precioVenta: number;
  plazoDias: number; fechaLimite: string; abonoInicial: AbonoReserva; registradoPor: string;
}): Promise<ReservaCreada> {
  const c = getClient();
  const numero = await siguienteNumeroReserva();
  const fecha = new Date().toISOString().slice(0, 10);

  const fields: Record<string, unknown> = {
    "Número":                 numero,
    "Fecha":                  fecha,
    "Estado":                 "Activa" as ReservaEstado,
    "Cliente Nombre":         input.cliente.razonSocial,
    "Shipping Item":          [input.shippingItemId],
    "Descripción Item":       input.descripcionItem,
    "Precio":                 input.precioVenta,
    "Total Abonado":          input.abonoInicial.monto,
    "Fecha Límite":           input.fechaLimite,
    "Plazo Días":             input.plazoDias,
    "Registrado Por":         input.registradoPor,
    "Abonos JSON":            JSON.stringify({ version: 1, cliente: input.cliente, abonos: [input.abonoInicial] }),
  };
  if (input.cliente.identificacion) fields["Cliente Identificación"] = input.cliente.identificacion;
  if (input.cliente.airtableId)     fields["Cliente"] = [input.cliente.airtableId];

  const data = await req<{ id: string }>(`${c.baseUrl}/${encodeURIComponent(TABLE)}`, { method: "POST", body: JSON.stringify({ fields, typecast: true }) });
  return { recordId: data.id, numero, fecha, fechaLimite: input.fechaLimite };
}

export async function adjuntarPdfReserva(recordId: string, filename: string, base64: string): Promise<void> {
  const c = getClient();
  const url = `https://content.airtable.com/v0/${encodeURIComponent(c.baseId)}/${encodeURIComponent(recordId)}/${encodeURIComponent("PDF")}/uploadAttachment`;
  await req(url, { method: "POST", body: JSON.stringify({ contentType: "application/pdf", file: base64, filename }) });
}

// ─── Obtener (detalle completo) ───────────────────────────────────────────────

export type ReservaCompleta = {
  recordId: string; numero: string; fecha: string; estado: ReservaEstado;
  cliente: ReservaCliente; clienteRecordId?: string;
  shippingItemId?: string; descripcionItem: string;
  precio: number; totalAbonado: number; fechaLimite: string; plazoDias: number;
  abonos: AbonoReserva[]; saldoAFavor: number; facturaRecordId?: string; tienePdf: boolean;
};

export async function obtenerReservaPorId(recordId: string): Promise<ReservaCompleta | null> {
  const c = getClient();
  const data = await req<{ fields: Record<string, unknown> }>(`${c.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`).catch(() => null);
  if (!data) return null;
  const f = data.fields;

  let cliente: ReservaCliente = { razonSocial: str(f["Cliente Nombre"]) };
  let abonos: AbonoReserva[] = [];
  try {
    const parsed = JSON.parse(str(f["Abonos JSON"]) || "{}");
    if (parsed?.cliente && typeof parsed.cliente === "object") cliente = parsed.cliente as ReservaCliente;
    if (Array.isArray(parsed?.abonos)) abonos = parsed.abonos as AbonoReserva[];
  } catch { /* ignore */ }

  return {
    recordId, numero: str(f["Número"]), fecha: str(f["Fecha"]), estado: (str(f["Estado"]) || "Activa") as ReservaEstado,
    cliente, clienteRecordId: linkId(f["Cliente"]),
    shippingItemId: linkId(f["Shipping Item"]), descripcionItem: str(f["Descripción Item"]),
    precio: num(f["Precio"]), totalAbonado: num(f["Total Abonado"]), fechaLimite: str(f["Fecha Límite"]),
    plazoDias: num(f["Plazo Días"]), abonos, saldoAFavor: num(f["Saldo a Favor Generado"]),
    facturaRecordId: linkId(f["Factura"]), tienePdf: att(f["PDF"]),
  };
}

// ─── Registrar un abono adicional ─────────────────────────────────────────────

export async function agregarAbonoReserva(recordId: string, abono: AbonoReserva, abonosPrevios: AbonoReserva[], clientePrevio: ReservaCliente, totalPrevio: number): Promise<{ totalAbonado: number }> {
  const c = getClient();
  const abonos = [...abonosPrevios, abono];
  const totalAbonado = Math.round((totalPrevio + abono.monto) * 100) / 100;
  await req(`${c.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { "Total Abonado": totalAbonado, "Abonos JSON": JSON.stringify({ version: 1, cliente: clientePrevio, abonos }) }, typecast: true }),
  });
  return { totalAbonado };
}

// ─── Cambios de estado ────────────────────────────────────────────────────────

export async function marcarReservaLiberada(recordId: string, saldoAFavor: number): Promise<void> {
  const c = getClient();
  await req(`${c.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH", body: JSON.stringify({ fields: { "Estado": "Liberada" as ReservaEstado, "Saldo a Favor Generado": saldoAFavor }, typecast: true }),
  });
}

export async function marcarReservaFacturada(recordId: string, facturaRecordId: string): Promise<void> {
  const c = getClient();
  await req(`${c.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH", body: JSON.stringify({ fields: { "Estado": "Facturada" as ReservaEstado, "Factura": [facturaRecordId] }, typecast: true }),
  });
}

// ─── Listado ──────────────────────────────────────────────────────────────────

export type ReservaRegistro = {
  recordId: string; numero: string; fecha: string; estado: ReservaEstado;
  clienteNombre: string; clienteIdentificacion: string; descripcionItem: string;
  precio: number; totalAbonado: number; fechaLimite: string; tienePdf: boolean;
};

export type FiltrosReserva = { cliente?: string; numero?: string; estado?: string; pageSize?: number; offset?: string };

export async function listarReservas(filtros: FiltrosReserva = {}): Promise<{ reservas: ReservaRegistro[]; offset?: string }> {
  const c = getClient();
  const conds: string[] = [];
  if (filtros.estado)  conds.push(`{Estado} = "${filtros.estado}"`);
  if (filtros.numero)  conds.push(`SEARCH("${filtros.numero.replace(/"/g, '\\"')}",{Número})`);
  if (filtros.cliente) conds.push(`OR(SEARCH("${filtros.cliente.replace(/"/g, '\\"').toLowerCase()}",LOWER({Cliente Nombre})),SEARCH("${filtros.cliente.replace(/"/g, '\\"')}",{Cliente Identificación}))`);
  const formula = conds.length === 0 ? "" : conds.length === 1 ? conds[0] : `AND(${conds.join(",")})`;

  const params = new URLSearchParams({ "sort[0][field]": "Fecha", "sort[0][direction]": "desc", pageSize: String(filtros.pageSize ?? 50) });
  if (formula)        params.set("filterByFormula", formula);
  if (filtros.offset) params.set("offset", filtros.offset);
  for (const f of ["Número", "Fecha", "Estado", "Cliente Nombre", "Cliente Identificación", "Descripción Item", "Precio", "Total Abonado", "Fecha Límite", "PDF"]) params.append("fields[]", f);

  const data = await req<{ records: Array<{ id: string; fields: Record<string, unknown> }>; offset?: string }>(`${c.baseUrl}/${encodeURIComponent(TABLE)}?${params}`);
  const reservas = (data.records ?? []).map((r) => ({
    recordId: r.id,
    numero: str(r.fields["Número"]), fecha: str(r.fields["Fecha"]), estado: (str(r.fields["Estado"]) || "Activa") as ReservaEstado,
    clienteNombre: str(r.fields["Cliente Nombre"]), clienteIdentificacion: str(r.fields["Cliente Identificación"]),
    descripcionItem: str(r.fields["Descripción Item"]), precio: num(r.fields["Precio"]), totalAbonado: num(r.fields["Total Abonado"]),
    fechaLimite: str(r.fields["Fecha Límite"]), tienePdf: att(r.fields["PDF"]),
  }));
  return { reservas, offset: data.offset };
}
