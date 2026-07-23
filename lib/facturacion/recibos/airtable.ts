import "server-only";

// Persistencia de recibos en Airtable — tabla "Recibos" (base SUPER GEEK ADM).
// Documento interno; se referencia POR NOMBRE.

import type { CrearReciboInput, ReciboRegistro, EstadoRecibo, LineaRecibo } from "./types";
import { totalRecibo } from "./calculos";

const TABLE = "Recibos";

function getClient() {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token)  throw new Error("Falta AIRTABLE_API_KEY en .env.local.");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local.");
  return {
    baseId,
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as Record<string, string>,
  };
}

async function airtableRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const client = getClient();
  const res = await fetch(url, { ...init, headers: { ...client.headers, ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!res.ok) throw new Error(`Airtable ${TABLE} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  if (v && typeof v === "object" && "name" in (v as Record<string, unknown>)) return String((v as { name: unknown }).name);
  return "";
}
function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
function hasAtt(v: unknown): boolean { return Array.isArray(v) && v.length > 0; }

// ─── Numeración REC-000001 ───────────────────────────────────────────────────

async function siguienteNumeroRecibo(): Promise<{ numero: string; secuencial: number }> {
  const client = getClient();
  const params = new URLSearchParams({ "sort[0][field]": "Secuencial", "sort[0][direction]": "desc", maxRecords: "1", "fields[]": "Secuencial" });
  const data = await airtableRequest<{ records: Array<{ fields: { Secuencial?: number | string } }> }>(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`
  );
  const max = data.records.length ? num(data.records[0].fields["Secuencial"]) : 0;
  const sig = max + 1;
  return { numero: `REC-${String(sig).padStart(6, "0")}`, secuencial: sig };
}

// ─── Crear ───────────────────────────────────────────────────────────────────

export type ReciboCreado = { recordId: string; numero: string; total: number };

export async function crearRecibo(input: CrearReciboInput): Promise<ReciboCreado> {
  const client = getClient();
  const { numero, secuencial } = await siguienteNumeroRecibo();
  const total = totalRecibo(input.lineas);
  const fecha = new Date().toISOString().slice(0, 10);

  const fields: Record<string, unknown> = {
    "Número":         numero,
    "Secuencial":     secuencial,
    "Fecha":          fecha,
    "Estado":         "Vigente" as EstadoRecibo,
    "Cliente Nombre": input.cliente.razonSocial,
    "Total":          total,
    "Forma de Pago":  input.formaPago,
    "Líneas JSON":    JSON.stringify({ version: 1, cliente: input.cliente, lineas: input.lineas, nota: input.nota ?? "", formaPago: input.formaPago }),
  };
  if (input.cliente.identificacion) fields["Cliente Identificación"] = input.cliente.identificacion;
  if (input.cliente.correo)         fields["Cliente Correo"] = input.cliente.correo;
  if (input.cliente.airtableId)     fields["Cliente"] = [input.cliente.airtableId];
  if (input.nota)                   fields["Nota"] = input.nota;

  const data = await airtableRequest<{ id: string }>(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}`,
    { method: "POST", body: JSON.stringify({ fields, typecast: true }) }
  );
  return { recordId: data.id, numero, total };
}

export async function adjuntarPdfRecibo(recordId: string, filename: string, base64: string): Promise<void> {
  const client = getClient();
  const url = `https://content.airtable.com/v0/${encodeURIComponent(client.baseId)}/${encodeURIComponent(recordId)}/${encodeURIComponent("PDF")}/uploadAttachment`;
  await airtableRequest(url, { method: "POST", body: JSON.stringify({ contentType: "application/pdf", file: base64, filename }) });
}

export type EstadoEfecto = "N/A" | "PENDIENTE" | "OK" | "ERROR";

export async function actualizarEfectosRecibo(recordId: string, campo: "Sincronización Inventario" | "Movimiento Contable", estado: EstadoEfecto, detalle?: string): Promise<void> {
  const client = getClient();
  const fields: Record<string, unknown> = { [campo]: estado };
  if (detalle !== undefined) fields[campo === "Sincronización Inventario" ? "Error Inventario" : "Error Contable"] = detalle;
  await airtableRequest(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) }
  );
}

export async function marcarReciboAnulado(recordId: string): Promise<void> {
  const client = getClient();
  await airtableRequest(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "PATCH", body: JSON.stringify({ fields: { "Estado": "Anulado" }, typecast: true }) }
  );
}

// ─── Listar / obtener ────────────────────────────────────────────────────────

export type FiltrosRecibo = { cliente?: string; numero?: string; estado?: string; pageSize?: number; offset?: string };
export type ListadoRecibos = { recibos: ReciboRegistro[]; offset?: string };

export async function listarRecibos(filtros: FiltrosRecibo = {}): Promise<ListadoRecibos> {
  const client = getClient();
  const conditions: string[] = [];
  if (filtros.estado)  conditions.push(`{Estado} = "${filtros.estado}"`);
  if (filtros.numero)  conditions.push(`SEARCH("${filtros.numero.replace(/"/g, '\\"')}",{Número})`);
  if (filtros.cliente) conditions.push(`OR(SEARCH("${filtros.cliente.replace(/"/g, '\\"').toLowerCase()}",LOWER({Cliente Nombre})),SEARCH("${filtros.cliente.replace(/"/g, '\\"')}",{Cliente Identificación}))`);
  const formula = conditions.length === 0 ? "" : conditions.length === 1 ? conditions[0] : `AND(${conditions.join(",")})`;

  const params = new URLSearchParams({ "sort[0][field]": "Secuencial", "sort[0][direction]": "desc", pageSize: String(Math.min(filtros.pageSize ?? 50, 100)) });
  if (formula)        params.set("filterByFormula", formula);
  if (filtros.offset) params.set("offset", filtros.offset);
  for (const f of ["Número", "Fecha", "Estado", "Cliente Nombre", "Cliente Identificación", "Total", "Forma de Pago", "PDF"]) params.append("fields[]", f);

  const data = await airtableRequest<{ records: Array<{ id: string; fields: Record<string, unknown> }>; offset?: string }>(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`
  );
  const recibos: ReciboRegistro[] = (data.records ?? []).map((r) => ({
    recordId:              r.id,
    numero:                str(r.fields["Número"]),
    fecha:                 str(r.fields["Fecha"]),
    estado:                (str(r.fields["Estado"]) || "Vigente") as EstadoRecibo,
    clienteNombre:         str(r.fields["Cliente Nombre"]),
    clienteIdentificacion: str(r.fields["Cliente Identificación"]),
    total:                 num(r.fields["Total"]),
    formaPago:             str(r.fields["Forma de Pago"]),
    tienePdf:              hasAtt(r.fields["PDF"]),
  }));
  return { recibos, offset: data.offset };
}

export type ReciboCompleto = {
  recordId: string; numero: string; fecha: string; estado: string; total: number;
  formaPago: string; clienteRecordId?: string; lineas: LineaRecibo[]; pdfUrl?: string;
};

export async function obtenerReciboPorId(recordId: string): Promise<ReciboCompleto | null> {
  const client = getClient();
  const data = await airtableRequest<{ fields: Record<string, unknown> }>(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`
  ).catch(() => null);
  if (!data) return null;
  const pdf = data.fields["PDF"];
  const pdfUrl = Array.isArray(pdf) && pdf[0] && typeof (pdf[0] as { url?: unknown }).url === "string" ? (pdf[0] as { url: string }).url : undefined;
  const cli = data.fields["Cliente"];
  const clienteRecordId = Array.isArray(cli) && typeof cli[0] === "string" ? cli[0] : undefined;
  let lineas: LineaRecibo[] = [];
  try {
    const parsed = JSON.parse(str(data.fields["Líneas JSON"]) || "{}");
    lineas = Array.isArray(parsed?.lineas) ? parsed.lineas : [];
  } catch { /* ignore */ }
  return {
    recordId, numero: str(data.fields["Número"]), fecha: str(data.fields["Fecha"]),
    estado: str(data.fields["Estado"]), total: num(data.fields["Total"]),
    formaPago: str(data.fields["Forma de Pago"]) || "01", clienteRecordId, lineas, pdfUrl,
  };
}
