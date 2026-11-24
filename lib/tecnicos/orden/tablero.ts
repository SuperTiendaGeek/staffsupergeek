// Lista de órdenes como tablero por etapas (rediseño R8, tableros 16 a 20).
// Reglas puras: qué columna, qué orden, qué filtros y qué bandejas. Lo usan el
// tablero, la Lista y sus pruebas. Nada de servidor aquí.

import type { Baja } from "./baja";

export type NivelTarjeta = "atencion" | "porVencer" | "alDia";

/** Una orden abierta tal como la pinta el tablero (sale de la lectura de alertas). */
export type FilaTablero = {
  ordenId: string;
  codigo: string;
  cliente: string;
  equipo: string;
  estado: string;
  responsableId: string | null;
  fechaIngreso: string;
  /** Semáforo de la alerta (alDia si no hay nada que vigilar). */
  nivel: NivelTarjeta;
  /** «Cliente no responde» · «Espera repuesto · llega 27 nov» · «Cumple política de baja». */
  texto: string;
  /** «5 d» · «3 h». */
  hace: string;
  minutos: number;
  pospuestaHasta: string | null;
  /** Política de baja (60+ días). Estas van agrupadas al final de su columna. */
  baja: Baja | null;
};

export type Columna = { estado: string; nombre: string; corto: string; color: string; ayuda: string };

export const COLUMNAS: readonly Columna[] = [
  { estado: "Pendiente", nombre: "Pendiente", corto: "Pendiente", color: "#9A9A92", ayuda: "Recibida: falta diagnóstico o presupuesto" },
  { estado: "Esperando Respuesta", nombre: "Esperando respuesta", corto: "Esperando", color: "#FFB547", ayuda: "Presupuesto enviado: decide el cliente" },
  { estado: "En Proceso", nombre: "En proceso", corto: "En proceso", color: "#9CCBFF", ayuda: "En el taller: reparando o esperando repuesto" },
  { estado: "Completado", nombre: "Completado", corto: "Completado", color: "#56E3A4", ayuda: "Lista para entregar" },
];

export type FiltroTarjeta = "atencion" | "porVencer" | "mias" | "sinResponsable" | null;
export type Vista = "tablero" | "lista" | "cobros";
export type Bandeja = "abiertas" | "baja" | "entregadas" | "reciclaje";

export const CLAVE_VISTA = "sg-ordenes-vista";

export function leerVista(v: string | null | undefined): Vista {
  return v === "lista" || v === "cobros" ? v : "tablero";
}

const PESO: Record<NivelTarjeta, number> = { atencion: 2, porVencer: 1, alDia: 0 };

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lo que se escribe en el buscador: código (con o sin «OR0»), cliente o equipo. */
export function coincide(f: Pick<FilaTablero, "codigo" | "cliente" | "equipo">, buscar: string): boolean {
  const q = normal(buscar.trim());
  if (!q) return true;
  return [f.codigo, f.cliente, f.equipo].some((x) => normal(x || "").includes(q));
}

/** Mismo criterio que los contadores de la barra (resumenAlertas). */
export function pasaFiltro(f: FilaTablero, filtro: FiltroTarjeta, yo: string | null): boolean {
  if (!filtro) return true;
  if (filtro === "sinResponsable") return !f.responsableId;
  if (filtro === "mias") return !!yo && f.responsableId === yo && f.nivel !== "alDia";
  return f.nivel === filtro;
}

/** Lo más urgente arriba; dentro del mismo color, lo más atrasado. */
export function ordenarTarjetas(xs: FilaTablero[]): FilaTablero[] {
  return [...xs].sort((a, b) => PESO[b.nivel] - PESO[a.nivel] || b.minutos - a.minutos);
}

/** Las de baja: las que más días llevan, primero. */
export function ordenarBaja(xs: FilaTablero[]): FilaTablero[] {
  return [...xs].sort((a, b) => (b.baja?.dias ?? 0) - (a.baja?.dias ?? 0));
}

export type ColumnaLlena = {
  col: Columna;
  tarjetas: FilaTablero[];
  baja: FilaTablero[];
  /** Todas las de esa etapa (sin filtros), para el encabezado. */
  total: number;
  /** Cuántas están en rojo (sin contar las de baja). */
  rojas: number;
};

export function columnasDelTablero(filas: FilaTablero[], o: { filtro: FiltroTarjeta; buscar: string; yo: string | null }): ColumnaLlena[] {
  return COLUMNAS.map((col) => {
    const deEsta = filas.filter((f) => f.estado === col.estado);
    const visibles = deEsta.filter((f) => coincide(f, o.buscar) && pasaFiltro(f, o.filtro, o.yo));
    return {
      col,
      tarjetas: ordenarTarjetas(visibles.filter((f) => !f.baja)),
      // Con un filtro de alertas activo no se muestran (no tienen alerta).
      baja: o.filtro ? [] : ordenarBaja(visibles.filter((f) => !!f.baja)),
      total: deEsta.length,
      rojas: deEsta.filter((f) => !f.baja && f.nivel === "atencion").length,
    };
  });
}

/** Bandeja «Abiertas» de la Lista: todas, lo más urgente primero (las de baja cuentan como rojo o ámbar). */
export function filasAbiertas(filas: FilaTablero[]): FilaTablero[] {
  const peso = (f: FilaTablero) => (f.baja ? (f.baja.nivel === "cumple" ? 2 : 1) : PESO[f.nivel]);
  return [...filas].sort((a, b) => peso(b) - peso(a) || b.minutos - a.minutos);
}

export function filasParaBaja(filas: FilaTablero[]): FilaTablero[] {
  return ordenarBaja(filas.filter((f) => !!f.baja));
}

/** Cómo se pinta una fila de la Lista: reciclaje en rojo, entregada en gris, de baja con franja. */
export function tipoFila(estado: string, enBaja: boolean): "reciclaje" | "entregada" | "baja" | "normal" {
  if (estado === "Enviado a Reciclaje") return "reciclaje";
  if (estado === "Finalizado Entregado") return "entregada";
  return enBaja ? "baja" : "normal";
}

/** Nombre corto del estado para los chips de la Lista. */
export function nombreEstado(estado: string): string {
  if (estado === "Finalizado Entregado") return "Entregada";
  if (estado === "Enviado a Reciclaje") return "Reciclaje";
  return COLUMNAS.find((c) => c.estado === estado)?.nombre ?? estado;
}
