// Pantalla "Garantías" — regla PURA (auditoría ops, punto 20 · cierre, 5-nov-2026).
//
// Como el listado de reparaciones en garantía de Odoo (filtrable y con su
// reporte de costo) o la lista de reclamos de ERPNext: TODAS las garantías en
// una sola pantalla, para no tener que abrir orden por orden.
//   · Por confirmar: lo que propuso un técnico y espera al administrador.
//   · En curso: confirmada, todavía sin entregar.
//   · Entregadas: ya salió (pieza fuera del inventario / servicio hecho).
//   · Quitadas: rechazadas o retiradas de la orden (constancia).
// Arriba, el resumen del mes: cuántas, cuánto costaron, cuántas de cortesía.
// Los costos los ven Staff, Técnicos y Administradores (dueño, 5-nov).

import type { LineaPresupuesto } from "@/lib/tecnicos/presupuesto/reglas";
import { normalizarGarantia } from "./reglas";
import { soloFecha } from "./plazos";

export type EstadoPanel = "por_confirmar" | "en_curso" | "entregada" | "quitada";

export const PESTANAS_PANEL: ReadonlyArray<{ clave: EstadoPanel | "todas"; etiqueta: string }> = [
  { clave: "por_confirmar", etiqueta: "Por confirmar" },
  { clave: "en_curso", etiqueta: "En curso" },
  { clave: "entregada", etiqueta: "Entregadas" },
  { clave: "quitada", etiqueta: "Quitadas" },
  { clave: "todas", etiqueta: "Todas" },
];

export type LineaParaPanel = Pick<LineaPresupuesto,
  "id" | "descripcion" | "tipo" | "estado" | "cantidad" | "itemId" | "garantia" | "motivoGarantia" | "garantiaConfirmadaPor" | "garantiaEntregada"
  | "garantiaDe" | "garantiaCortesia" | "piezaRetirada" | "piezaRetiradaSku" | "fechaEntregaGarantia" | "fechaAprobacion" | "creadoPor" | "historial">
  & { ordenId: string | null };

export type OrdenParaPanel = { codigo: string; cliente: string; equipo: string };
export type ArticuloParaPanel = { sku: string; costo: number | null };

export type FilaGarantia = {
  lineaId: string;
  ordenId: string | null;
  ordenCodigo: string;
  cliente: string;
  equipo: string;
  descripcion: string;
  tipo: string;
  sku: string;
  garantiaDe: string;
  motivo: string;
  cortesia: boolean;
  estado: EstadoPanel;
  confirmadaPor: string;
  propuestaPor: string;
  /** Entrega, si ya se entregó; si no, la aprobación; si no, la primera fecha del historial. */
  fecha: string;
  piezaRetirada: string;
  piezaRetiradaSku: string;
  /** Costo de la pieza para SUPER GEEK (servicios: null). */
  costo: number | null;
};

export function estadoDeGarantia(l: Pick<LineaParaPanel, "garantia" | "estado" | "garantiaEntregada">): EstadoPanel | null {
  const g = normalizarGarantia(l.garantia);
  if (!g) return null;
  if (l.estado === "Rechazada") return "quitada";
  if (g === "Propuesta") return "por_confirmar";
  return l.garantiaEntregada ? "entregada" : "en_curso";
}

/** Primera fecha "[AAAA-MM-DD HH:MM]" del historial (cuándo se propuso, si no hay otra). */
function primeraFechaHistorial(h: string | undefined): string {
  const m = /\[(\d{4}-\d{2}-\d{2})/.exec(h ?? "");
  return m ? m[1] : "";
}

export function armarFilas(input: {
  lineas: readonly LineaParaPanel[];
  ordenes: ReadonlyMap<string, OrdenParaPanel>;
  articulos: ReadonlyMap<string, ArticuloParaPanel>;
}): FilaGarantia[] {
  const filas: FilaGarantia[] = [];
  for (const l of input.lineas) {
    const estado = estadoDeGarantia(l);
    if (!estado) continue;
    const o = l.ordenId ? input.ordenes.get(l.ordenId) : undefined;
    const a = l.itemId ? input.articulos.get(l.itemId) : undefined;
    filas.push({
      lineaId: l.id,
      ordenId: l.ordenId,
      ordenCodigo: o?.codigo ?? "",
      cliente: o?.cliente ?? "",
      equipo: o?.equipo ?? "",
      descripcion: l.descripcion,
      tipo: l.tipo,
      sku: a?.sku ?? "",
      garantiaDe: l.garantiaDe ?? "",
      motivo: l.motivoGarantia ?? "",
      cortesia: l.garantiaCortesia === true,
      estado,
      confirmadaPor: l.garantiaConfirmadaPor ?? "",
      propuestaPor: l.creadoPor ?? "",
      fecha: soloFecha(l.fechaEntregaGarantia || l.fechaAprobacion || "") || primeraFechaHistorial(l.historial),
      piezaRetirada: l.piezaRetirada ?? "",
      piezaRetiradaSku: l.piezaRetiradaSku ?? "",
      costo: l.tipo === "Repuesto" && a && a.costo !== null ? Math.round(a.costo * Math.max(1, l.cantidad || 1) * 100) / 100 : null,
    });
  }
  // Lo que espera al administrador arriba; después, lo más nuevo.
  const peso: Record<EstadoPanel, number> = { por_confirmar: 0, en_curso: 1, entregada: 2, quitada: 3 };
  return filas.sort((a, b) => peso[a.estado] - peso[b.estado] || b.fecha.localeCompare(a.fecha));
}

export type ResumenPanel = {
  porConfirmar: number;
  enCurso: number;
  /** Entregadas en el mes (AAAA-MM). */
  entregadasMes: number;
  costoMes: number;
  cortesiasMes: number;
};

export function resumenDelMes(filas: readonly FilaGarantia[], mes: string): ResumenPanel {
  const delMes = filas.filter((f) => f.estado === "entregada" && f.fecha.startsWith(mes));
  return {
    porConfirmar: filas.filter((f) => f.estado === "por_confirmar").length,
    enCurso: filas.filter((f) => f.estado === "en_curso").length,
    entregadasMes: delMes.length,
    costoMes: Math.round(delMes.reduce((s, f) => s + (f.costo ?? 0), 0) * 100) / 100,
    cortesiasMes: delMes.filter((f) => f.cortesia).length,
  };
}
