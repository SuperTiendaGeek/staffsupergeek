// Responsable de la orden — reglas PURAS (rediseño R1, tablero 1 aprobado el
// 22-nov-2026; decisión del dueño 17:24: «es quien la toma»).
//
// El selector de la cabecera ofrece a las personas activas que trabajan en
// Técnicos (y a los administradores). Cada cambio queda en la Actividad.

import { isAdministratorRole } from "@/lib/apps";

export type OpcionResponsable = { id: string; nombre: string; iniciales: string };

type Usuario = { id: string; nombre: string; email: string; rol: string; appsPermitidas: string[]; activo: boolean };

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const letras = partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[1][0];
  return letras.toUpperCase();
}

export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? "";
}

/** Personas que pueden ser responsables, en orden alfabético. */
export function opcionesResponsable(usuarios: Usuario[]): OpcionResponsable[] {
  return usuarios
    .filter((u) => u.activo && (u.appsPermitidas.includes("tecnicos") || isAdministratorRole(u.rol)))
    .map((u) => {
      const nombre = (u.nombre || u.email || "Sin nombre").trim();
      return { id: u.id, nombre, iniciales: iniciales(nombre) };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export type Asignacion = { ok: true; usuarioId: string | null } | { ok: false; error: string };

/** body: { usuarioId: "rec…" } asigna · { usuarioId: null } deja la orden sin responsable. */
export function revisarAsignacion(body: unknown, opciones: OpcionResponsable[]): Asignacion {
  if (!body || typeof body !== "object" || !("usuarioId" in body)) return { ok: false, error: "Falta a quién asignar la orden." };
  const v = (body as { usuarioId: unknown }).usuarioId;
  if (v === null) return { ok: true, usuarioId: null };
  if (typeof v !== "string" || !opciones.some((o) => o.id === v)) {
    return { ok: false, error: "Esa persona no puede ser responsable (no está activa en Técnicos)." };
  }
  return { ok: true, usuarioId: v };
}

/** Lo que queda en la Actividad. */
export function textoAsignacion(quien: { id: string | null; nombre: string }, nuevo: OpcionResponsable | null): string {
  if (!nuevo) return `${quien.nombre} deja la orden sin responsable`;
  if (quien.id && nuevo.id === quien.id) return `${quien.nombre} toma la orden`;
  return `${quien.nombre} asigna la orden a ${nuevo.nombre}`;
}
