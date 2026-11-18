// Pantalla del cliente — ajustes de Administrar (etapa 10E-C, dueño 18-nov-2026).
// Reglas PURAS (con prueba). Se guardan en Airtable, tabla "Configuración del
// portal" (tbl5h6iKhvvvvZogW), registro con Clave "pantalla-cliente".
//
// Decisiones del dueño (18-nov): maqueta 11 aprobada; la usan SOLO
// Administradores y Staff (no Técnicos) por defecto.

import { isAdministratorRole, isProviderRole, isTechnicianRole } from "@/lib/apps";

export const CLAVE_PANTALLA = "pantalla-cliente";

export type RolPantalla = "Administrador" | "Staff" | "Técnico";
export const ROLES_PANTALLA: readonly RolPantalla[] = ["Administrador", "Staff", "Técnico"];
export const OPCIONES_GRACIAS = [15, 30, 60] as const;
export const OPCIONES_SIN_ACTIVIDAD = [1, 3, 5, 10] as const;
export const MAX_TEXTO_REPOSO = 40;

export type ConfigPantalla = {
  /** La función encendida en toda la tienda (el botón aparece junto a la campanita). */
  activa: boolean;
  /** Quién puede usarla. */
  roles: RolPantalla[];
  /** Segundos que se queda el "¡Gracias!" antes de volver al logo. */
  segundosGracias: (typeof OPCIONES_GRACIAS)[number];
  /** Minutos sin nada nuevo antes de volver al logo. */
  minutosSinActividad: (typeof OPCIONES_SIN_ACTIVIDAD)[number];
  /** Qué se ve en reposo (hoy solo el logo; "equipos en tránsito" llega después). */
  reposo: "logo";
  /** Texto bajo el logo. */
  textoReposo: string;
};

export const CONFIG_INICIAL: ConfigPantalla = {
  activa: true,
  roles: ["Administrador", "Staff"],
  segundosGracias: 30,
  minutosSinActividad: 3,
  reposo: "logo",
  textoReposo: "Bienvenido",
};

/** El grupo de un rol del portal. Un proveedor externo nunca la usa. */
export function grupoDeRol(rol: string | undefined): RolPantalla | null {
  if (!rol || isProviderRole(rol)) return null;
  if (isAdministratorRole(rol)) return "Administrador";
  if (isTechnicianRole(rol)) return "Técnico";
  return "Staff";
}

export function puedeUsarPantalla(rol: string | undefined, c: ConfigPantalla): boolean {
  const g = grupoDeRol(rol);
  return c.activa && !!g && c.roles.includes(g);
}

/** Lo guardado (o nada) → ajustes válidos: lo que falte o esté mal toma el valor inicial. */
export function normalizarConfig(v: unknown): ConfigPantalla {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const roles = Array.isArray(o.roles) ? ROLES_PANTALLA.filter((r) => (o.roles as unknown[]).includes(r)) : CONFIG_INICIAL.roles;
  const gracias = OPCIONES_GRACIAS.find((n) => n === o.segundosGracias) ?? CONFIG_INICIAL.segundosGracias;
  const sinAct = OPCIONES_SIN_ACTIVIDAD.find((n) => n === o.minutosSinActividad) ?? CONFIG_INICIAL.minutosSinActividad;
  const texto = typeof o.textoReposo === "string" ? o.textoReposo.trim().slice(0, MAX_TEXTO_REPOSO) : CONFIG_INICIAL.textoReposo;
  return {
    activa: typeof o.activa === "boolean" ? o.activa : CONFIG_INICIAL.activa,
    roles,
    segundosGracias: gracias,
    minutosSinActividad: sinAct,
    reposo: "logo",
    textoReposo: texto,
  };
}

/** Lo que manda Administrar al guardar: se rechaza lo que no es una opción de la pantalla. */
export function validarConfig(v: unknown): { ok: true; config: ConfigPantalla } | { ok: false; error: string } {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  if (!o) return { ok: false, error: "Ajustes inválidos." };
  if (typeof o.activa !== "boolean") return { ok: false, error: "Indica si la pantalla está encendida." };
  if (!Array.isArray(o.roles) || o.roles.some((r) => !(ROLES_PANTALLA as readonly unknown[]).includes(r))) return { ok: false, error: "Roles inválidos." };
  if (o.activa && o.roles.length === 0) return { ok: false, error: "Elige al menos un rol que pueda usarla." };
  if (!OPCIONES_GRACIAS.some((n) => n === o.segundosGracias)) return { ok: false, error: "Tiempo del «¡Gracias!» inválido." };
  if (!OPCIONES_SIN_ACTIVIDAD.some((n) => n === o.minutosSinActividad)) return { ok: false, error: "Tiempo sin actividad inválido." };
  if (typeof o.textoReposo !== "string" || o.textoReposo.trim().length > MAX_TEXTO_REPOSO) return { ok: false, error: `El texto bajo el logo admite hasta ${MAX_TEXTO_REPOSO} letras.` };
  return { ok: true, config: normalizarConfig(o) };
}

/** "sin actividad 3 → 5 min; Técnico: sí" — para "Últimos cambios". Vacío si nada cambió. */
export function describirCambios(antes: ConfigPantalla, despues: ConfigPantalla): string {
  const p: string[] = [];
  if (antes.activa !== despues.activa) p.push(despues.activa ? "encendida" : "apagada");
  for (const r of ROLES_PANTALLA) {
    const a = antes.roles.includes(r), d = despues.roles.includes(r);
    if (a !== d) p.push(`${r}: ${d ? "sí" : "no"}`);
  }
  if (antes.segundosGracias !== despues.segundosGracias) p.push(`«¡Gracias!» ${antes.segundosGracias} → ${despues.segundosGracias} s`);
  if (antes.minutosSinActividad !== despues.minutosSinActividad) p.push(`sin actividad ${antes.minutosSinActividad} → ${despues.minutosSinActividad} min`);
  if (antes.textoReposo !== despues.textoReposo) p.push(`texto «${antes.textoReposo}» → «${despues.textoReposo}»`);
  return p.join("; ");
}

/** Agrega una línea al historial (la más nueva arriba) y guarda solo las últimas 30. */
export function agregarAlHistorial(historial: string, linea: string, maximo = 30): string {
  return [linea, ...historial.split("\n").map((l) => l.trim()).filter(Boolean)].slice(0, maximo).join("\n");
}
