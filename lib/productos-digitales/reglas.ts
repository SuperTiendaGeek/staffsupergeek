// Productos digitales — reglas PURAS (auditoría ops, punto 5A · 7-nov-2026).
//
// 1) Qué credenciales lleva cada tipo de producto. Un producto de "Usuario/
//    Contraseña" NUNCA lleva "Clave de activación" (y al revés): así el PDF
//    sale limpio aunque alguien (o el autocompletado del navegador) llene el
//    campo que no corresponde. Caso real: Chrome llenaba la clave con
//    "Elfina.8990" en 13 unidades de usuario/contraseña.
// 2) La pantalla: SKU, filtros con conteo, búsqueda y orden.

export type CamposCredencial = { clave: boolean; usuario: boolean };

/** Tipos del catálogo (Catálogo Productos Digitales → Tipo). */
export function camposDeCredenciales(tipo: string | null | undefined): CamposCredencial {
  const t = (tipo ?? "").trim().toLowerCase();
  if (t === "clave de activación" || t === "clave de activacion") return { clave: true, usuario: false };
  if (t === "usuario/contraseña" || t === "usuario/contrasena" || t === "suscripción" || t === "suscripcion") return { clave: false, usuario: true };
  // "Otro" o sin tipo: los dos (el catálogo no dice cuál).
  return { clave: true, usuario: true };
}

export type Credenciales = { claveActivacion: string | null; usuarioCorreo: string | null; contrasena: string | null };

const limpio = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

/** Solo lo que corresponde al tipo, sin espacios sobrantes. Lo usan el PDF, la pantalla y el alta. */
export function credencialesDelTipo(tipo: string | null | undefined, c: Partial<Credenciales>): Credenciales {
  const campos = camposDeCredenciales(tipo);
  return {
    claveActivacion: campos.clave ? limpio(c.claveActivacion) : null,
    usuarioCorreo: campos.usuario ? limpio(c.usuarioCorreo) : null,
    contrasena: campos.usuario ? limpio(c.contrasena) : null,
  };
}

/** Error de alta (null = válido): cada tipo exige sus credenciales. */
export function errorCredenciales(tipo: string | null | undefined, c: Partial<Credenciales>): string | null {
  const campos = camposDeCredenciales(tipo);
  const x = credencialesDelTipo(tipo, c);
  if (campos.clave && !campos.usuario && !x.claveActivacion) return "Falta la clave de activación.";
  if (campos.usuario && !campos.clave && (!x.usuarioCorreo || !x.contrasena)) return "Faltan el usuario y la contraseña.";
  return null;
}

/**
 * "Producto Digital" en Airtable mezcla nombre, estado y fecha ("Bitdefender ·
 * Usado · 14/04/2026", a veces con comillas). Para la pantalla y el PDF va
 * solo el nombre (punto 14 lo corrige en origen).
 */
export function nombreLimpio(valor: string | null | undefined): string {
  let s = (valor ?? "").trim();
  s = s.replace(/\s*·\s*(Disponible|Reservado|Usado|Anulado|Vencido)(\s*·\s*\d{1,2}\/\d{1,2}\/\d{2,4})?\s*$/i, "");
  s = s.replace(/^"(.*)"$/, "$1").trim();
  return s;
}

// ─── Pantalla ────────────────────────────────────────────────────────────────

export const ESTADOS_DIGITAL = ["Disponible", "Reservado", "En reclamo", "Usado", "Anulado", "Vencido"] as const;

export type FilaDigital = {
  id: string;
  sku: string;
  numero: number | null;
  producto: string;
  estado: string;
  ordenCodigo: string;
  clienteNombre: string;
  documento: string;
  proveedor: string;
  usuarioCorreo: string;
  fechaCompra: string;
  fechaUso: string;
  precio: number | null;
};

export type ColumnaOrden = "sku" | "producto" | "estado" | "orden" | "cliente" | "compra" | "uso" | "precio";

export function contarPorEstado(filas: readonly FilaDigital[]): Record<string, number> {
  const c: Record<string, number> = { "": filas.length };
  for (const f of filas) c[f.estado] = (c[f.estado] ?? 0) + 1;
  return c;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca por SKU, producto, orden, cliente, documento, proveedor y usuario/correo (nunca por contraseñas). */
export function filtrarFilas(filas: readonly FilaDigital[], estado: string, q: string): FilaDigital[] {
  const t = norm(q.trim());
  return filas.filter((f) => (!estado || f.estado === estado) && (!t || norm(
    [f.sku, f.producto, f.ordenCodigo, f.clienteNombre, f.documento, f.proveedor, f.usuarioCorreo].join(" "),
  ).includes(t)));
}

/** Por defecto: lo más reciente primero (SKU = orden de registro). Vacíos siempre al final. */
export function ordenarFilas(filas: readonly FilaDigital[], col: ColumnaOrden, dir: "asc" | "desc"): FilaDigital[] {
  const valor = (f: FilaDigital): string | number | null => {
    switch (col) {
      case "sku": return f.numero;
      case "producto": return f.producto || null;
      case "estado": return f.estado || null;
      case "orden": return f.ordenCodigo || null;
      case "cliente": return f.clienteNombre || null;
      case "compra": return f.fechaCompra || null;
      case "uso": return f.fechaUso || null;
      case "precio": return f.precio;
    }
  };
  const s = dir === "asc" ? 1 : -1;
  return [...filas].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    if (va === null && vb === null) return (b.numero ?? 0) - (a.numero ?? 0);
    if (va === null) return 1;
    if (vb === null) return -1;
    const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es", { numeric: true });
    return r !== 0 ? r * s : (b.numero ?? 0) - (a.numero ?? 0);
  });
}

/** Opciones de "Duración" en Airtable (Productos Digitales). */
export const DURACIONES_DIGITAL = ["Perpetua", "1 año", "2 años", "3 años", "3 meses", "6 meses", "9 meses"] as const;
