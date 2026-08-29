import { redirect } from "next/navigation";

// Sin "server-only" a propósito: el catálogo de pantallas (PANTALLAS_POR_MODULO)
// y las funciones puras de este archivo las usa también la UI de
// administración en el cliente (AdminUsersClient.tsx) para dibujar los
// checkboxes. Nada aquí toca variables de entorno, Airtable ni cookies —
// requirePantallaVisible() es la única función pensada solo para Server
// Components, por su uso de redirect().

// Control de acceso a PANTALLAS dentro de un módulo — Fase 1 de personalizar
// qué ve cada usuario (la Fase 2, control por CAMPO dentro de cada pantalla,
// se construye sobre esta misma base más adelante).
//
// Diseño genérico a propósito, aunque hoy solo Shipping V2 lo usa: agregar
// otro módulo es registrar sus pantallas en PANTALLAS_POR_MODULO y llamar a
// requirePantallaVisible()/pantallasVisibles() donde corresponda — no hay que
// tocar el modelo de datos ni la UI de administración.
//
// Modelo de datos: campo "Pantallas Restringidas" en la tabla Usuarios (texto
// largo con JSON), formato { [modulo]: string[] de pantallas OCULTAS }. Es
// una lista de EXCLUSIÓN, no de inclusión: por defecto (campo vacío) un
// usuario con acceso al módulo ve todas sus pantallas, igual que siempre —
// el administrador tiene que restringir a propósito. Esto evita que un
// módulo nuevo, o una pantalla nueva dentro de uno existente, empiece oculta
// para todo el mundo por no estar todavía en la lista de nadie.
//
// El valor viaja horneado en la sesión (JWT), igual que "Apps Permitidas":
// un cambio de administrador aplica en el siguiente login, no al instante.
// Coherente con cómo ya se comporta el resto del modelo de permisos —ver
// SessionUser.appsPermitidas en lib/session.ts.

export type ModuloConPantallas = "shipping-v2";

export type PantallaDef = {
  key: string;
  label: string;
};

// Puente entre "Apps Permitidas" (nombres en español que ya usa el modelo de
// permisos existente, ver AppPermissionName en lib/apps.ts) y el módulo
// interno de este archivo. Agregar un módulo nuevo a PANTALLAS_POR_MODULO
// sin agregarlo aquí lo deja sin UI de administración, pero no rompe nada.
export const MODULO_POR_APP_PERMITIDA: Partial<Record<string, ModuloConPantallas>> = {
  Shipping: "shipping-v2",
};

export const PANTALLAS_POR_MODULO: Record<ModuloConPantallas, readonly PantallaDef[]> = {
  "shipping-v2": [
    { key: "items", label: "Items" },
    { key: "recepcion", label: "Recepción" },
    { key: "packings", label: "Packings" },
    { key: "pagos", label: "Pagos" },
  ],
} as const;

// Sin tipar a ModuloConPantallas en el valor: así un módulo desconocido o
// retirado (o un JSON viejo) no se pierde al guardar, solo queda inerte.
export type PantallasRestringidas = Record<string, string[]>;

const CAMPO_VACIO: PantallasRestringidas = {};

/** Parseo defensivo del JSON guardado en Airtable — nunca lanza. */
export function parsePantallasRestringidas(raw: string | null | undefined): PantallasRestringidas {
  if (!raw || !raw.trim()) return CAMPO_VACIO;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return CAMPO_VACIO;
    const result: PantallasRestringidas = {};
    for (const [modulo, pantallas] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(pantallas)) {
        result[modulo] = pantallas.filter((p): p is string => typeof p === "string");
      }
    }
    return result;
  } catch {
    return CAMPO_VACIO;
  }
}

export function serializePantallasRestringidas(value: PantallasRestringidas): string {
  // Los módulos sin nada restringido no necesitan ocupar espacio en el JSON.
  const compact: PantallasRestringidas = {};
  for (const [modulo, pantallas] of Object.entries(value)) {
    if (pantallas.length > 0) compact[modulo] = pantallas;
  }
  return Object.keys(compact).length > 0 ? JSON.stringify(compact) : "";
}

export function puedeVerPantalla(
  restringidas: PantallasRestringidas,
  modulo: ModuloConPantallas,
  pantalla: string
): boolean {
  return !(restringidas[modulo] ?? []).includes(pantalla);
}

/** Pantallas visibles de un módulo, en el orden del catálogo — para armar menús/accesos rápidos. */
export function pantallasVisibles(
  restringidas: PantallasRestringidas,
  modulo: ModuloConPantallas
): PantallaDef[] {
  return PANTALLAS_POR_MODULO[modulo].filter((p) => puedeVerPantalla(restringidas, modulo, p.key));
}

/**
 * Para usar al inicio de un page.tsx de servidor: si el usuario tiene esta
 * pantalla oculta, redirige a /acceso-denegado en vez de renderizarla. Es la
 * puerta fuerte (servidor) — el menú/accesos rápidos que ocultan el enlace
 * son solo la comodidad de no ofrecer algo que de todas formas se bloquearía.
 */
export function requirePantallaVisible(
  restringidas: PantallasRestringidas,
  modulo: ModuloConPantallas,
  pantalla: string
): void {
  if (!puedeVerPantalla(restringidas, modulo, pantalla)) {
    redirect("/acceso-denegado");
  }
}
