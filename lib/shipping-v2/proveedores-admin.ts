// Administrar › Proveedores (auditoría Shipping V2, punto 11, 22-oct-2026).
//
// Reglas puras (sin Airtable ni red) de la pantalla donde el Administrador
// crea, edita, desactiva y elimina proveedores, incluidos los logísticos y
// los casilleros. Decisiones del dueño:
//   - Solo el Administrador entra (módulo "Administrar" del menú).
//   - Eliminar SOLO si el proveedor nunca se usó; si tiene historia, se
//     desactiva (deja de salir al registrar, sigue en el historial).
//   - Estados: Activo e Inactivo ("En revisión" ya no se usa).
//   - Bloquear duplicados por nombre, email, teléfono o sitio web.
//   - Se ve solo el nombre ("Roberto", no "Roberto-Hardware").
//   - Solo se editan los datos que el sistema usa; el resto de columnas de
//     la tabla se dejó de leer y se borra de Airtable.

import { ETIQUETAS_PERMISO_PROVEEDOR } from "@/lib/shipping-v2/access";

/** Nombres exactos de los campos de "Shipping Proveedores" que se editan aquí. */
export const CAMPOS_PROVEEDOR = {
  proveedorId: "Proveedor ID",
  nombre: "Nombre proveedor",
  estado: "Estado proveedor",
  tipos: "Tipo de proveedor",
  pais: "País / zona logística",
  esCasillero: "Es casillero",
  email: "Email proveedor",
  telefono: "Teléfono / WhatsApp",
  website: "Website proveedor",
  notas: "Observaciones",
  permiteRastreoWeb: "Permite rastreo web",
  plantillaUrlRastreo: "Plantilla URL rastreo",
  urlRastreo: "URL rastreo",
  portal: "Permite acceso portal proveedor",
  permisosPortal: "Permisos portal proveedor",
  logo: "Logo proveedor",
  disenoFactura: "Diseño de factura",
  nombreComercialFactura: "Nombre comercial (factura)",
  esloganFactura: "Eslogan (factura)",
  datosEmpresaFactura: "Datos de empresa (factura)",
  pieFactura: "Pie factura",
  columnasImportacion: "Columnas de importación",
  eventos: "Shipping Eventos",
} as const;

/** Lo que el sistema lee de cada proveedor (sin los vínculos, que pesan). */
export const CAMPOS_LECTURA_PROVEEDOR: string[] = Object.values(CAMPOS_PROVEEDOR).filter((c) => c !== CAMPOS_PROVEEDOR.eventos);

export const TIPOS_PROVEEDOR = ["Hardware", "Software", "Logístico", "Otro"] as const;
export const PAISES_PROVEEDOR = ["Ecuador", "USA", "Miami / Casillero", "Internacional", "Otro"] as const;
export const DISENOS_FACTURA = ["Estándar", "Estilo_Roberto_LV"] as const;
export const ETIQUETA_DISENO: Record<string, string> = { "Estándar": "Estándar", Estilo_Roberto_LV: "Estilo LV (Roberto)" };
export const PERMISOS_PORTAL: readonly string[] = ETIQUETAS_PERMISO_PROVEEDOR;
export const ESTADO_ACTIVO = "Activo";
export const ESTADO_INACTIVO = "Inactivo";
export const MARCA_TRACKING = "{TRACKING}";

/** Vínculos que cuentan como "ya se usó". El historial (Shipping Eventos) no cuenta. */
export const VINCULOS_USO: Record<string, keyof UsoProveedor> = {
  "Shipping Items (Proveedor de compra)": "articulos",
  "Shipping Items (Proveedor logístico / intermediario)": "articulos",
  "Items (como transportista origen)": "articulos",
  "Items (como transportista Ecuador)": "articulos",
  "Shipping Packings (Proveedor responsable)": "cajas",
  "Shipping Packings (Proveedor logístico / intermediario)": "cajas",
  "Shipping Packings": "cajas",
  "Shipping Packings 2": "cajas",
  "Shipping Pagos": "pagos",
  "Órdenes de compra": "ordenes",
  "Shipping Finanzas Movimientos": "movimientos",
  "Shipping Novedades": "novedades",
  "Shipping Recepciones": "recepciones",
  "Shipping Migraciones": "migraciones",
  Opciones: "opciones",
  "Presupuesto por Orden": "presupuestos",
};

export type UsoProveedor = {
  articulos: number;
  cajas: number;
  pagos: number;
  ordenes: number;
  movimientos: number;
  novedades: number;
  recepciones: number;
  migraciones: number;
  /** Opciones de repuestos y cotizaciones (Técnicos / Operaciones). */
  opciones: number;
  presupuestos: number;
  /** Productos digitales que guardan su nombre (solo se cuenta al eliminar). */
  productosDigitales: number;
};

export const USO_VACIO: UsoProveedor = {
  articulos: 0, cajas: 0, pagos: 0, ordenes: 0, movimientos: 0, novedades: 0,
  recepciones: 0, migraciones: 0, opciones: 0, presupuestos: 0, productosDigitales: 0,
};

const ETIQUETA_USO: Record<keyof UsoProveedor, [string, string]> = {
  articulos: ["artículo", "artículos"],
  cajas: ["caja", "cajas"],
  pagos: ["pago", "pagos"],
  ordenes: ["orden", "órdenes"],
  movimientos: ["movimiento", "movimientos"],
  novedades: ["novedad", "novedades"],
  recepciones: ["recepción", "recepciones"],
  migraciones: ["migración", "migraciones"],
  opciones: ["opción", "opciones"],
  presupuestos: ["presupuesto", "presupuestos"],
  productosDigitales: ["producto digital", "productos digitales"],
};

/** Datos editables de un proveedor (lo que viaja entre la pantalla y el servidor). */
export type ProveedorDatos = {
  nombre: string;
  tipos: string[];
  pais: string;
  esCasillero: boolean;
  email: string;
  telefono: string;
  website: string;
  notas: string;
  permiteRastreoWeb: boolean;
  plantillaUrlRastreo: string;
  urlRastreo: string;
  portal: boolean;
  permisosPortal: string[];
  disenoFactura: string;
  nombreComercialFactura: string;
  esloganFactura: string;
  datosEmpresaFactura: string;
  pieFactura: string;
};

export const DATOS_VACIOS: ProveedorDatos = {
  nombre: "", tipos: [], pais: "", esCasillero: false, email: "", telefono: "", website: "", notas: "",
  permiteRastreoWeb: false, plantillaUrlRastreo: "", urlRastreo: "", portal: false, permisosPortal: [],
  disenoFactura: "", nombreComercialFactura: "", esloganFactura: "", datosEmpresaFactura: "", pieFactura: "",
};

export type ProveedorLogo = { url: string; thumbnailUrl: string; filename: string };

export type ProveedorAdmin = {
  id: string;
  createdTime: string;
  estado: string;
  datos: ProveedorDatos;
  logo: ProveedorLogo | null;
  /** Cuántas columnas recordadas tiene para cargar listas (Registrar compra). */
  columnasRecordadas: number;
  uso: UsoProveedor;
};

export type EventoProveedor = { id: string; fecha: string; accion: string; descripcion: string; registradoPor: string };

export type CampoProveedor = keyof ProveedorDatos;
export type ErroresProveedor = Partial<Record<CampoProveedor, string>>;

/** Error de validación que la pantalla muestra junto a cada campo. */
export class ErrorValidacionProveedor extends Error {
  constructor(public readonly errores: ErroresProveedor) {
    super(Object.values(errores)[0] || "Revisa los datos del proveedor.");
    this.name = "ErrorValidacionProveedor";
  }
}

// ─── Lectura desde Airtable (campos → datos) ─────────────────────────────────

function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (v && typeof v === "object" && "name" in v && typeof (v as { name: unknown }).name === "string") return (v as { name: string }).name;
  return "";
}

function lista(v: unknown): string[] {
  if (!Array.isArray(v)) return texto(v) ? [texto(v)] : [];
  return v.map(texto).filter(Boolean);
}

function contarJson(v: unknown): number {
  const t = texto(v).trim();
  if (!t) return 0;
  try {
    const o = JSON.parse(t) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o).length : 0;
  } catch {
    return 0;
  }
}

export function datosDesdeCampos(f: Record<string, unknown>): ProveedorDatos {
  const C = CAMPOS_PROVEEDOR;
  return {
    nombre: texto(f[C.nombre]).trim(),
    tipos: ordenarComo(lista(f[C.tipos]), TIPOS_PROVEEDOR),
    pais: texto(f[C.pais]),
    esCasillero: f[C.esCasillero] === true,
    email: texto(f[C.email]).trim(),
    telefono: texto(f[C.telefono]).trim(),
    website: texto(f[C.website]).trim(),
    notas: texto(f[C.notas]),
    permiteRastreoWeb: f[C.permiteRastreoWeb] === true,
    plantillaUrlRastreo: texto(f[C.plantillaUrlRastreo]).trim(),
    urlRastreo: texto(f[C.urlRastreo]).trim(),
    portal: f[C.portal] === true,
    permisosPortal: ordenarComo(lista(f[C.permisosPortal]), PERMISOS_PORTAL),
    disenoFactura: texto(f[C.disenoFactura]),
    nombreComercialFactura: texto(f[C.nombreComercialFactura]),
    esloganFactura: texto(f[C.esloganFactura]),
    datosEmpresaFactura: texto(f[C.datosEmpresaFactura]),
    pieFactura: texto(f[C.pieFactura]),
  };
}

export function usoDesdeCampos(f: Record<string, unknown>): UsoProveedor {
  const ids: Partial<Record<keyof UsoProveedor, Set<string>>> = {};
  for (const [campo, clave] of Object.entries(VINCULOS_USO)) {
    const valor = f[campo];
    if (!Array.isArray(valor)) continue;
    const set = (ids[clave] ??= new Set<string>());
    for (const v of valor) {
      const id = typeof v === "string" ? v : texto((v as { id?: unknown })?.id);
      if (id) set.add(id);
    }
  }
  const uso = { ...USO_VACIO };
  for (const [clave, set] of Object.entries(ids)) uso[clave as keyof UsoProveedor] = set?.size ?? 0;
  return uso;
}

export function proveedorAdminDesdeRegistro(r: { id: string; createdTime?: string; fields: Record<string, unknown> }): ProveedorAdmin {
  const f = r.fields ?? {};
  const logos = Array.isArray(f[CAMPOS_PROVEEDOR.logo]) ? (f[CAMPOS_PROVEEDOR.logo] as Array<Record<string, unknown>>) : [];
  const primero = logos[0];
  const thumbs = (primero?.thumbnails ?? {}) as Record<string, { url?: string } | undefined>;
  return {
    id: r.id,
    createdTime: r.createdTime ?? "",
    estado: texto(f[CAMPOS_PROVEEDOR.estado]) || ESTADO_ACTIVO,
    datos: datosDesdeCampos(f),
    logo: primero && typeof primero.url === "string"
      ? { url: primero.url, thumbnailUrl: thumbs.large?.url || thumbs.small?.url || primero.url, filename: texto(primero.filename) }
      : null,
    columnasRecordadas: contarJson(f[CAMPOS_PROVEEDOR.columnasImportacion]),
    uso: usoDesdeCampos(f),
  };
}

// ─── Limpieza y validación ───────────────────────────────────────────────────

function ordenarComo(valores: string[], orden: readonly string[]): string[] {
  const unicos = Array.from(new Set(valores));
  return unicos.sort((a, b) => {
    const ia = orden.indexOf(a);
    const ib = orden.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
}

function cadena(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}

/** Convierte lo que llega del navegador en datos limpios (sin validar todavía). */
export function limpiarDatosProveedor(input: unknown): ProveedorDatos {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const tipos = Array.isArray(o.tipos) ? o.tipos.filter((t): t is string => typeof t === "string" && (TIPOS_PROVEEDOR as readonly string[]).includes(t)) : [];
  const permisos = Array.isArray(o.permisosPortal)
    ? o.permisosPortal.filter((p): p is string => typeof p === "string" && PERMISOS_PORTAL.includes(p))
    : [];
  const pais = cadena(o.pais, 60);
  const disenoFactura = cadena(o.disenoFactura, 60);
  const portal = o.portal === true;
  const logistico = tipos.includes("Logístico");
  return {
    nombre: cadena(o.nombre, 80).replace(/\s+/g, " "),
    tipos: ordenarComo(tipos, TIPOS_PROVEEDOR),
    pais: (PAISES_PROVEEDOR as readonly string[]).includes(pais) ? pais : "",
    // Un casillero siempre es logístico; si deja de serlo, deja de ser casillero.
    esCasillero: logistico && o.esCasillero === true,
    email: cadena(o.email, 120).toLowerCase(),
    telefono: cadena(o.telefono, 40),
    website: cadena(o.website, 200),
    notas: cadena(o.notas, 4000),
    permiteRastreoWeb: o.permiteRastreoWeb === true,
    plantillaUrlRastreo: cadena(o.plantillaUrlRastreo, 500),
    urlRastreo: cadena(o.urlRastreo, 500),
    portal,
    // Sin portal no quedan permisos: así apagarlo de verdad corta el acceso.
    permisosPortal: portal ? ordenarComo(permisos, PERMISOS_PORTAL) : [],
    disenoFactura: (DISENOS_FACTURA as readonly string[]).includes(disenoFactura) ? disenoFactura : "",
    nombreComercialFactura: cadena(o.nombreComercialFactura, 120),
    esloganFactura: cadena(o.esloganFactura, 160),
    datosEmpresaFactura: cadena(o.datosEmpresaFactura, 1000),
    pieFactura: cadena(o.pieFactura, 4000),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}/i;
const DOMINIO_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

export function validarDatosProveedor(d: ProveedorDatos): ErroresProveedor {
  const e: ErroresProveedor = {};
  if (d.nombre.length < 2) e.nombre = "Escribe el nombre.";
  else if (/[|]/.test(d.nombre)) e.nombre = "El nombre no puede llevar el carácter |.";
  if (!d.tipos.length) e.tipos = "Elige qué provee.";
  if (!d.pais) e.pais = "Elige el país.";
  if (d.email && !EMAIL_RE.test(d.email)) e.email = "Email no válido.";
  if (d.telefono) {
    const digitos = d.telefono.replace(/\D/g, "");
    if (!/^[+\d\s().-]+$/.test(d.telefono) || digitos.length < 7) e.telefono = "Teléfono no válido.";
  }
  if (d.website && !DOMINIO_RE.test(d.website.replace(/\.$/, ""))) e.website = "Sitio web no válido.";
  if (d.plantillaUrlRastreo) {
    if (!URL_RE.test(d.plantillaUrlRastreo)) e.plantillaUrlRastreo = "Debe empezar con https://";
    else if (!d.plantillaUrlRastreo.includes(MARCA_TRACKING)) e.plantillaUrlRastreo = `Falta ${MARCA_TRACKING} donde va el número.`;
  }
  if (d.urlRastreo && !URL_RE.test(d.urlRastreo)) e.urlRastreo = "Debe empezar con https://";
  if (d.permiteRastreoWeb && !d.plantillaUrlRastreo && !d.urlRastreo) e.plantillaUrlRastreo = "Pon el enlace o apaga Rastreo web.";
  if (d.portal && !d.email) e.email = "El portal necesita el email (con él entra el proveedor).";
  if (d.portal && !d.permisosPortal.length) e.permisosPortal = "Marca al menos un permiso.";
  return e;
}

// ─── Duplicados ──────────────────────────────────────────────────────────────

export function claveNombre(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Últimos 9 dígitos: "+593 99 123 4567" y "0991234567" son el mismo número. */
export function claveTelefono(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : d;
}

export function claveWebsite(v: string): string {
  return v.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/\.+$/, "");
}

export type Duplicado = { campo: "nombre" | "email" | "telefono" | "website"; proveedorId: string; proveedor: string };

const ETIQUETA_DUPLICADO: Record<Duplicado["campo"], string> = {
  nombre: "Ya existe",
  email: "Ese email ya lo tiene",
  telefono: "Ese teléfono ya lo tiene",
  website: "Ese sitio web ya lo tiene",
};

export function buscarDuplicados(
  d: Pick<ProveedorDatos, "nombre" | "email" | "telefono" | "website">,
  otros: Array<{ id: string; datos: Pick<ProveedorDatos, "nombre" | "email" | "telefono" | "website"> }>,
  propioId?: string
): Duplicado[] {
  const encontrados: Duplicado[] = [];
  const claves = {
    nombre: claveNombre(d.nombre),
    email: d.email.trim().toLowerCase(),
    telefono: claveTelefono(d.telefono),
    website: claveWebsite(d.website),
  };
  for (const o of otros) {
    if (o.id === propioId) continue;
    const nombre = o.datos.nombre || o.id;
    if (claves.nombre && claveNombre(o.datos.nombre) === claves.nombre) encontrados.push({ campo: "nombre", proveedorId: o.id, proveedor: nombre });
    if (claves.email && o.datos.email.trim().toLowerCase() === claves.email) encontrados.push({ campo: "email", proveedorId: o.id, proveedor: nombre });
    if (claves.telefono.length >= 7 && claveTelefono(o.datos.telefono) === claves.telefono) encontrados.push({ campo: "telefono", proveedorId: o.id, proveedor: nombre });
    if (claves.website && claveWebsite(o.datos.website) === claves.website) encontrados.push({ campo: "website", proveedorId: o.id, proveedor: nombre });
  }
  return encontrados;
}

export function erroresDeDuplicados(dups: Duplicado[]): ErroresProveedor {
  const e: ErroresProveedor = {};
  for (const dup of dups) {
    if (!e[dup.campo]) e[dup.campo] = `${ETIQUETA_DUPLICADO[dup.campo]}: ${dup.proveedor}.`;
  }
  return e;
}

// ─── Uso y eliminación ───────────────────────────────────────────────────────

export function usoTotal(uso: UsoProveedor): number {
  return Object.values(uso).reduce((s, n) => s + (n || 0), 0);
}

export function sePuedeEliminar(uso: UsoProveedor): boolean {
  return usoTotal(uso) === 0;
}

/** "240 artículos · 9 cajas · 5 pagos" (solo lo que tiene). */
export function resumenUso(uso: UsoProveedor): string {
  return (Object.keys(ETIQUETA_USO) as Array<keyof UsoProveedor>)
    .filter((k) => uso[k] > 0)
    .map((k) => `${uso[k]} ${ETIQUETA_USO[k][uso[k] === 1 ? 0 : 1]}`)
    .join(" · ");
}

// ─── Escritura (datos → campos de Airtable) ──────────────────────────────────

const VACIO_COMO_NULL = (v: string) => (v ? v : null);

/** Campos de Airtable para estos datos; con `antes`, solo los que cambiaron. */
export function camposParaAirtable(d: ProveedorDatos, antes?: ProveedorDatos): Record<string, unknown> {
  const C = CAMPOS_PROVEEDOR;
  const todos: Record<CampoProveedor, [string, unknown]> = {
    nombre: [C.nombre, d.nombre],
    tipos: [C.tipos, d.tipos],
    pais: [C.pais, VACIO_COMO_NULL(d.pais)],
    esCasillero: [C.esCasillero, d.esCasillero],
    email: [C.email, VACIO_COMO_NULL(d.email)],
    telefono: [C.telefono, VACIO_COMO_NULL(d.telefono)],
    website: [C.website, VACIO_COMO_NULL(d.website)],
    notas: [C.notas, VACIO_COMO_NULL(d.notas)],
    permiteRastreoWeb: [C.permiteRastreoWeb, d.permiteRastreoWeb],
    plantillaUrlRastreo: [C.plantillaUrlRastreo, VACIO_COMO_NULL(d.plantillaUrlRastreo)],
    urlRastreo: [C.urlRastreo, VACIO_COMO_NULL(d.urlRastreo)],
    portal: [C.portal, d.portal],
    permisosPortal: [C.permisosPortal, d.permisosPortal],
    disenoFactura: [C.disenoFactura, VACIO_COMO_NULL(d.disenoFactura)],
    nombreComercialFactura: [C.nombreComercialFactura, VACIO_COMO_NULL(d.nombreComercialFactura)],
    esloganFactura: [C.esloganFactura, VACIO_COMO_NULL(d.esloganFactura)],
    datosEmpresaFactura: [C.datosEmpresaFactura, VACIO_COMO_NULL(d.datosEmpresaFactura)],
    pieFactura: [C.pieFactura, VACIO_COMO_NULL(d.pieFactura)],
  };
  const cambiados = antes ? new Set(camposCambiados(antes, d)) : null;
  const out: Record<string, unknown> = {};
  for (const [clave, [campo, valor]] of Object.entries(todos) as Array<[CampoProveedor, [string, unknown]]>) {
    if (cambiados && !cambiados.has(clave)) continue;
    // Al crear no se mandan vacíos: Airtable los deja vacíos solo.
    if (!cambiados && (valor === null || valor === false || (Array.isArray(valor) && !valor.length))) continue;
    out[campo] = valor;
  }
  return out;
}

function igual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
}

export function camposCambiados(antes: ProveedorDatos, despues: ProveedorDatos): CampoProveedor[] {
  return (Object.keys(DATOS_VACIOS) as CampoProveedor[]).filter((k) => !igual(antes[k], despues[k]));
}

export const ETIQUETA_CAMPO: Record<CampoProveedor, string> = {
  nombre: "Nombre",
  tipos: "Provee",
  pais: "País",
  esCasillero: "Casillero",
  email: "Email",
  telefono: "Teléfono",
  website: "Sitio web",
  notas: "Notas",
  permiteRastreoWeb: "Rastreo web",
  plantillaUrlRastreo: "Enlace con nº",
  urlRastreo: "Página de rastreo",
  portal: "Portal",
  permisosPortal: "Permisos",
  disenoFactura: "Diseño de factura",
  nombreComercialFactura: "Nombre comercial",
  esloganFactura: "Eslogan",
  datosEmpresaFactura: "Datos de empresa",
  pieFactura: "Pie de factura",
};

function corto(v: unknown): string {
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

/** Líneas para el historial: "Email: — → roberto@x.com", "Permisos: + Ver pagos · − Cerrar packing". */
export function describirCambios(antes: ProveedorDatos, despues: ProveedorDatos): string[] {
  return camposCambiados(antes, despues).map((k) => {
    if (k === "permisosPortal" || k === "tipos") {
      const a = new Set(antes[k]);
      const b = new Set(despues[k]);
      const mas = despues[k].filter((x) => !a.has(x)).map((x) => `+ ${x}`);
      const menos = antes[k].filter((x) => !b.has(x)).map((x) => `− ${x}`);
      return `${ETIQUETA_CAMPO[k]}: ${[...mas, ...menos].join(" · ")}`;
    }
    if (k === "notas" || k === "pieFactura" || k === "datosEmpresaFactura") return `${ETIQUETA_CAMPO[k]}: actualizado`;
    return `${ETIQUETA_CAMPO[k]}: ${corto(antes[k])} → ${corto(despues[k])}`;
  });
}

/** Enlace de prueba con un número de ejemplo (botón "Probar"). */
export function enlaceDePrueba(d: Pick<ProveedorDatos, "plantillaUrlRastreo" | "urlRastreo">, numero = "1Z999AA10123456784"): string | null {
  if (d.plantillaUrlRastreo.includes(MARCA_TRACKING)) return d.plantillaUrlRastreo.replaceAll(MARCA_TRACKING, encodeURIComponent(numero));
  return d.urlRastreo || null;
}

// ─── Logo ────────────────────────────────────────────────────────────────────

export const LOGO_TIPOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const LOGO_MAX_BYTES = 4 * 1024 * 1024;

export function validarLogo(archivo: { type: string; size: number }): string | null {
  if (!(LOGO_TIPOS as readonly string[]).includes(archivo.type)) return "El logo debe ser PNG, JPG, WEBP o SVG.";
  if (archivo.size <= 0) return "El archivo está vacío.";
  if (archivo.size > LOGO_MAX_BYTES) return "El logo pesa más de 4 MB.";
  return null;
}
