import "server-only";

// Lecturas/escrituras de anulación sobre la tabla "Facturas Electrónicas".
// Módulo propio para no tocar airtable/facturas.ts (en producción). El estado
// de anulación vive en campos NUEVOS de esa tabla: "Estado Anulación" y
// "Fecha Solicitud Anulación". La factura en sí solo pasa a Estado="ANULADA"
// cuando el usuario confirma que el SRI la anuló.

const TABLE = "Facturas Electrónicas";

function getClient() {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token)  throw new Error("Falta AIRTABLE_API_KEY en .env.local.");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local.");
  return { baseUrl: `https://api.airtable.com/v0/${baseId}`, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as Record<string, string> };
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

export type EstadoAnulacion = "Solicitada" | "Anulada" | "Rechazada";

export async function actualizarEstadoAnulacion(recordId: string, estado: EstadoAnulacion, extra?: Record<string, unknown>): Promise<void> {
  const c = getClient();
  await req(`${c.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH", body: JSON.stringify({ fields: { "Estado Anulación": estado, ...(extra ?? {}) }, typecast: true }),
  });
}

// Listado de anulaciones solicitadas (pendientes de confirmar en el SRI).
export type AnulacionPendiente = {
  recordId: string; numeroFactura: string; fechaEmision: string; clienteNombre: string;
  clienteIdentificacion: string; total: number; fechaSolicitud: string;
};

export async function listarSolicitudesAnulacion(): Promise<AnulacionPendiente[]> {
  const c = getClient();
  const params = new URLSearchParams({
    filterByFormula: `{Estado Anulación}="Solicitada"`,
    "sort[0][field]": "Fecha de Emisión", "sort[0][direction]": "asc", pageSize: "100",
  });
  for (const f of ["Número de Factura", "Fecha de Emisión", "Cliente - Nombre", "Cliente - Identificación", "Total", "Fecha Solicitud Anulación"]) params.append("fields[]", f);
  const data = await req<{ records: Array<{ id: string; fields: Record<string, unknown> }> }>(`${c.baseUrl}/${encodeURIComponent(TABLE)}?${params}`);
  return (data.records ?? []).map((r) => ({
    recordId: r.id,
    numeroFactura: str(r.fields["Número de Factura"]),
    fechaEmision: str(r.fields["Fecha de Emisión"]),
    clienteNombre: str(r.fields["Cliente - Nombre"]),
    clienteIdentificacion: str(r.fields["Cliente - Identificación"]),
    total: num(r.fields["Total"]),
    fechaSolicitud: str(r.fields["Fecha Solicitud Anulación"]),
  }));
}
