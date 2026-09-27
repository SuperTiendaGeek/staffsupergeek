import "server-only";

// Persistencia de los carteles de consentimiento.
//   · Cartel de un servicio → campos "Cartel …" de la tabla "Catálogo Servicios".
//   · Avisos de toda la orden → tabla "Alertas Generales".
// Reglas de negocio en ./reglas.ts. Todo se edita desde /tecnicos/catalogo-servicios.

import { AIRTABLE_TABLES, loadAirtableEnv } from "../config/airtable";
import { cartelVacio, lineas, type AlertaGeneral, type CartelServicio } from "./reglas";

const T_ALERTAS = "Alertas Generales";

const F = {
  nombre:         "Nombre del servicio",
  activo:         "Cartel activo",
  titulo:         "Cartel título",
  intro:          "Cartel intro",
  incluye:        "Cartel incluye",
  noIncluye:      "Cartel no incluye",
  avisos:         "Cartel avisos",
  consentimiento: "Cartel consentimiento",
  boton:          "Cartel botón",
} as const;

const FA = {
  titulo:   "Título",
  contenido:"Contenido",
  casilla:  "Texto de la casilla",
  activa:   "Activa",
  orden:    "Orden",
} as const;

type Registro = { id: string; fields: Record<string, unknown> };

function cliente() {
  const { token, baseId } = loadAirtableEnv();
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as Record<string, string>,
  };
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const c = cliente();
  const res = await fetch(url, { ...init, headers: { ...c.headers, ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

const url = (tabla: string, id?: string) => `${cliente().baseUrl}/${encodeURIComponent(tabla)}${id ? `/${encodeURIComponent(id)}` : ""}`;
const texto = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function mapCartel(r: Registro): CartelServicio {
  const f = r.fields;
  return {
    servicioId: r.id,
    servicioNombre: texto(f[F.nombre]),
    activo: f[F.activo] === true,
    titulo: texto(f[F.titulo]),
    intro: texto(f[F.intro]),
    incluye: lineas(texto(f[F.incluye])),
    noIncluye: lineas(texto(f[F.noIncluye])),
    avisos: lineas(texto(f[F.avisos])),
    consentimiento: texto(f[F.consentimiento]),
    textoBoton: texto(f[F.boton]),
  };
}

/** Carteles de varios servicios (regla de la casa: por RECORD_ID(), nunca por link). */
export async function cartelesDeServicios(servicioIds: string[]): Promise<Map<string, CartelServicio>> {
  const ids = [...new Set(servicioIds.filter(Boolean))];
  const out = new Map<string, CartelServicio>();
  for (let i = 0; i < ids.length; i += 40) {
    const lote = ids.slice(i, i + 40);
    const u = new URL(url(AIRTABLE_TABLES.catalogoServicios));
    u.searchParams.set("filterByFormula", lote.length === 1 ? `RECORD_ID()='${lote[0]}'` : `OR(${lote.map((x) => `RECORD_ID()='${x}'`).join(",")})`);
    u.searchParams.set("pageSize", "100");
    const data = await pedir<{ records?: Registro[] }>(u.toString());
    for (const r of data.records ?? []) out.set(r.id, mapCartel(r));
  }
  return out;
}

export async function guardarCartel(servicioId: string, c: CartelServicio): Promise<CartelServicio> {
  const fields: Record<string, unknown> = {
    [F.activo]: c.activo,
    [F.titulo]: c.titulo.trim(),
    [F.intro]: c.intro.trim(),
    [F.incluye]: c.incluye.join("\n"),
    [F.noIncluye]: c.noIncluye.join("\n"),
    [F.avisos]: c.avisos.join("\n"),
    [F.consentimiento]: c.consentimiento.trim(),
    [F.boton]: c.textoBoton.trim(),
  };
  const r = await pedir<Registro>(url(AIRTABLE_TABLES.catalogoServicios, servicioId), { method: "PATCH", body: JSON.stringify({ fields }) });
  return mapCartel(r);
}

/** Borra el cartel de un servicio (deja los campos vacíos y desactivado). */
export async function borrarCartel(servicioId: string): Promise<CartelServicio> {
  return guardarCartel(servicioId, cartelVacio(servicioId));
}

// ─── Avisos generales de la orden ────────────────────────────────────────────

function mapAlerta(r: Registro): AlertaGeneral {
  const f = r.fields;
  return {
    id: r.id,
    titulo: texto(f[FA.titulo]),
    contenido: texto(f[FA.contenido]),
    textoCasilla: texto(f[FA.casilla]),
    activa: f[FA.activa] === true,
    orden: num(f[FA.orden]),
  };
}

export async function listarAlertasGenerales(opts: { soloActivas?: boolean } = {}): Promise<AlertaGeneral[]> {
  const u = new URL(url(T_ALERTAS));
  u.searchParams.set("pageSize", "100");
  const data = await pedir<{ records?: Registro[] }>(u.toString());
  const todas = (data.records ?? []).map(mapAlerta).sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo));
  return opts.soloActivas ? todas.filter((a) => a.activa && a.titulo.trim() && a.contenido.trim()) : todas;
}

export async function guardarAlertaGeneral(a: Omit<AlertaGeneral, "id"> & { id?: string }): Promise<AlertaGeneral> {
  const fields = {
    [FA.titulo]: a.titulo.trim(),
    [FA.contenido]: a.contenido.trim(),
    [FA.casilla]: a.textoCasilla.trim(),
    [FA.activa]: a.activa,
    [FA.orden]: a.orden,
  };
  const r = a.id
    ? await pedir<Registro>(url(T_ALERTAS, a.id), { method: "PATCH", body: JSON.stringify({ fields }) })
    : await pedir<Registro>(url(T_ALERTAS), { method: "POST", body: JSON.stringify({ fields }) });
  return mapAlerta(r);
}

export async function borrarAlertaGeneral(id: string): Promise<void> {
  await pedir(url(T_ALERTAS, id), { method: "DELETE" });
}
