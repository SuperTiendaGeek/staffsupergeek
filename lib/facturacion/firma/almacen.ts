import "server-only";

// Persistencia de la firma electrónica en la tabla Airtable
// "Configuración Firma Electrónica".
//
// El .p12 y su contraseña se guardan CIFRADOS (ver cripto.ts). Este módulo
// nunca devuelve la contraseña en claro hacia afuera salvo por
// `leerFirmaActivaDescifrada()`, que es lo único que usa el motor de firma.
//
// TRAMPAS DEL PROYECTO respetadas aquí:
//   · Se referencia la tabla y los campos POR NOMBRE — si alguien los renombra
//     en Airtable, hay que cambiarlos también en las constantes de abajo.
//   · No hay ningún campo de tipo link en esta tabla, así que no aplica la
//     regla de "nunca filtrar por un campo link".
//   · Las opciones de "Estado" son las cuatro que existen hoy en la tabla:
//     Activa · Expirada · Pendiente de activación · Revocada.

import { cifrar, descifrar, huellaSha256 } from "./cripto";

const TABLE = "Configuración Firma Electrónica";

const F = {
  nombre:         "Nombre",
  p12:            "P12 Cifrado",
  password:       "Password Cifrado",
  huella:         "Huella SHA-256",
  titularEmisor:  "Titular / Emisor",
  identificacion: "Identificación Titular",
  validoDesde:    "Válido Desde",
  validoHasta:    "Válido Hasta",
  estado:         "Estado",
  subidoPor:      "Subido Por",
  fechaSubida:    "Fecha Subida",
} as const;

export const ESTADO_ACTIVA   = "Activa";
export const ESTADO_REVOCADA = "Revocada";
export const ESTADO_EXPIRADA = "Expirada";

// ─── Cliente Airtable ────────────────────────────────────────────────────────

function getClient() {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token)  throw new Error("Falta AIRTABLE_API_KEY en .env.local.");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local.");
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    } as Record<string, string>,
  };
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const c   = getClient();
  const res = await fetch(url, {
    ...init,
    headers: { ...c.headers, ...(init?.headers ?? {}) },
    cache:   "no-store",
  });
  if (!res.ok) throw new Error(`Airtable ${TABLE} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

type FilaAirtable = { id: string; fields: Record<string, unknown> };

function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "name" in (v as Record<string, unknown>)) {
    return String((v as { name: unknown }).name);
  }
  return "";
}

function fecha(v: unknown): Date | null {
  const s = texto(v);
  if (!s) return null;
  const d = new Date(s.includes("T") ? s : `${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function soloFecha(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Lo que se puede mostrar en pantalla. Nunca incluye el .p12 ni la contraseña. */
export type FirmaRegistro = {
  recordId:       string;
  nombre:         string;
  titularEmisor:  string;
  identificacion: string;
  validoDesde:    Date | null;
  validoHasta:    Date | null;
  estado:         string;
  subidoPor:      string;
  fechaSubida:    Date | null;
  huella:         string;
};

export type FirmaGuardar = {
  nombre:         string;
  p12:            Buffer;
  password:       string;
  titular:        string;
  emisor:         string;
  identificacion: string;
  validoDesde:    Date;
  validoHasta:    Date;
  subidoPor:      string;
};

function aRegistro(f: FilaAirtable): FirmaRegistro {
  return {
    recordId:       f.id,
    nombre:         texto(f.fields[F.nombre]),
    titularEmisor:  texto(f.fields[F.titularEmisor]),
    identificacion: texto(f.fields[F.identificacion]),
    validoDesde:    fecha(f.fields[F.validoDesde]),
    validoHasta:    fecha(f.fields[F.validoHasta]),
    estado:         texto(f.fields[F.estado]),
    subidoPor:      texto(f.fields[F.subidoPor]),
    fechaSubida:    fecha(f.fields[F.fechaSubida]),
    huella:         texto(f.fields[F.huella]),
  };
}

// ─── Lecturas ────────────────────────────────────────────────────────────────

/**
 * La firma activa, sin descifrar nada. Es lo que consume la pantalla.
 *
 * El filtro exige además que "P12 Cifrado" no esté vacío: así una fila creada
 * a mano en Airtable (o la fila en blanco que aparece al crear la tabla) nunca
 * se toma por una firma real.
 */
export async function leerFirmaActiva(): Promise<FirmaRegistro | null> {
  const c = getClient();
  const params = new URLSearchParams({
    filterByFormula:      `AND({${F.estado}}="${ESTADO_ACTIVA}", {${F.p12}}!="")`,
    "sort[0][field]":     F.fechaSubida,
    "sort[0][direction]": "desc",
    maxRecords:           "1",
  });

  const data = await req<{ records: FilaAirtable[] }>(
    `${c.baseUrl}/${encodeURIComponent(TABLE)}?${params}`
  );

  return data.records.length ? aRegistro(data.records[0]) : null;
}

/** Historial completo, más reciente primero. Para la pantalla de administración. */
export async function listarFirmas(limite = 20): Promise<FirmaRegistro[]> {
  const c = getClient();
  const params = new URLSearchParams({
    "sort[0][field]":     F.fechaSubida,
    "sort[0][direction]": "desc",
    maxRecords:           String(limite),
    filterByFormula:      `{${F.p12}}!=""`,
  });

  const data = await req<{ records: FilaAirtable[] }>(
    `${c.baseUrl}/${encodeURIComponent(TABLE)}?${params}`
  );

  return data.records.map(aRegistro);
}

/**
 * La firma activa CON el certificado y la contraseña ya descifrados.
 * Único punto del sistema que devuelve el material sensible — lo usa
 * `resolverFirmaActiva.ts` y nadie más.
 */
export async function leerFirmaActivaDescifrada(): Promise<
  { registro: FirmaRegistro; p12: Buffer; password: string } | null
> {
  const c = getClient();
  const params = new URLSearchParams({
    filterByFormula:      `AND({${F.estado}}="${ESTADO_ACTIVA}", {${F.p12}}!="")`,
    "sort[0][field]":     F.fechaSubida,
    "sort[0][direction]": "desc",
    maxRecords:           "1",
  });

  const data = await req<{ records: FilaAirtable[] }>(
    `${c.baseUrl}/${encodeURIComponent(TABLE)}?${params}`
  );
  if (!data.records.length) return null;

  const fila = data.records[0];
  const p12Cifrado      = texto(fila.fields[F.p12]);
  const passwordCifrada = texto(fila.fields[F.password]);
  if (!p12Cifrado || !passwordCifrada) return null;

  return {
    registro: aRegistro(fila),
    p12:      Buffer.from(descifrar(p12Cifrado), "base64"),
    password: descifrar(passwordCifrada),
  };
}

// ─── Escrituras ──────────────────────────────────────────────────────────────

/** Marca como Revocadas todas las firmas activas. Se llama antes de activar una nueva. */
async function revocarActivas(exceptoRecordId?: string): Promise<void> {
  const c = getClient();
  const params = new URLSearchParams({
    filterByFormula: `{${F.estado}}="${ESTADO_ACTIVA}"`,
    maxRecords:      "50",
  });

  const data = await req<{ records: FilaAirtable[] }>(
    `${c.baseUrl}/${encodeURIComponent(TABLE)}?${params}`
  );

  const aRevocar = data.records.filter((r) => r.id !== exceptoRecordId);
  if (aRevocar.length === 0) return;

  // La API de Airtable acepta hasta 10 registros por PATCH.
  for (let i = 0; i < aRevocar.length; i += 10) {
    const lote = aRevocar.slice(i, i + 10);
    await req(`${c.baseUrl}/${encodeURIComponent(TABLE)}`, {
      method: "PATCH",
      body: JSON.stringify({
        records: lote.map((r) => ({ id: r.id, fields: { [F.estado]: ESTADO_REVOCADA } })),
        typecast: true,
      }),
    });
  }
}

/**
 * Guarda una firma nueva y la deja como la activa, revocando la anterior.
 *
 * El orden importa: primero se crea la nueva (si eso falla, la firma vieja
 * sigue activa y el sistema puede seguir facturando), y solo después se revoca
 * la anterior. Nunca al revés — no puede existir un instante sin firma activa.
 */
export async function guardarFirmaActiva(datos: FirmaGuardar): Promise<FirmaRegistro> {
  const c = getClient();

  const fields: Record<string, unknown> = {
    [F.nombre]:         datos.nombre,
    [F.p12]:            cifrar(datos.p12.toString("base64")),
    [F.password]:       cifrar(datos.password),
    [F.huella]:         huellaSha256(datos.p12),
    [F.titularEmisor]:  `${datos.titular} — ${datos.emisor}`,
    [F.identificacion]: datos.identificacion,
    [F.validoDesde]:    soloFecha(datos.validoDesde),
    [F.validoHasta]:    soloFecha(datos.validoHasta),
    [F.estado]:         ESTADO_ACTIVA,
    [F.subidoPor]:      datos.subidoPor,
    [F.fechaSubida]:    new Date().toISOString(),
  };

  const creado = await req<{ records: FilaAirtable[] }>(
    `${c.baseUrl}/${encodeURIComponent(TABLE)}`,
    { method: "POST", body: JSON.stringify({ records: [{ fields }], typecast: true }) }
  );

  const nuevo = creado.records[0];
  await revocarActivas(nuevo.id);

  return aRegistro(nuevo);
}

/** ¿Ya existe una firma cargada con este mismo archivo? Evita duplicados por error. */
export async function existeHuella(huella: string): Promise<boolean> {
  const c = getClient();
  const params = new URLSearchParams({
    filterByFormula: `{${F.huella}}="${huella}"`,
    maxRecords:      "1",
  });

  const data = await req<{ records: FilaAirtable[] }>(
    `${c.baseUrl}/${encodeURIComponent(TABLE)}?${params}`
  );

  return data.records.length > 0;
}
