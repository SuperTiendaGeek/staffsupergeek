// Limpieza de datos del punto 8 (Novedades), aprobada por el dueño el
// 10-oct-2026. Reglas puras (con pruebas); el script solo lee y escribe.
//
//  · "Se descarta" se usó creyendo que se descartaba la NOVEDAD. Ningún
//    artículo salió por eso (el sistema nunca ejecutó esa opción). Pasa a
//    "No requiere solución". "Se repara internamente" → "Reparado". "Se vende
//    con descuento" igual. "Otro" → "No requiere solución" (se conserva el
//    texto). La solución vieja queda anotada en la observación final.
//  · LAP-000032: el proveedor todavía debe el cargador → sigue En solución,
//    con la propuesta "Reemplazo".
//  · Tipos: "Otro" → "Asunto interno"; "Faltante" → "Incompleto", salvo
//    ACC-000027 (perdido en la tienda) → "Perdido en tienda" con la venta
//    bloqueada, y OTR-000199 ("rayones") → "Dañado".
//  · REP-000021 (observación abierta de algo ya vendido) se cierra.

export const ACTOR_AJUSTE_8 = "Claude (autorizado por el dueño)";
export const FECHA_AJUSTE_8 = "10-oct-2026";

const SOLUCIONES_VIEJAS: Record<string, string> = {
  "Se descarta": "No requiere solución",
  "Se repara internamente": "Reparado",
  "Se vende con descuento": "Se vende con descuento",
  Otro: "No requiere solución",
};

/** Novedades con un tratamiento propio (por su Novedad ID). */
export const NOVEDAD_LAP_000032 = "NOV-LAP-000032-20260820-10811";
export const NOVEDAD_ACC_000027 = "NOV-ACC-000027-20261008-27918";
export const NOVEDAD_OTR_000199_RAYONES = "NOV-OTR-000199-20260915-96271";
export const NOVEDAD_REP_000021 = "NOV-REP-000021-20260725-17321";

export type NovedadParaAjuste8 = {
  id: string;
  novedadId: string;
  tipo: string;
  estado: string;
  solucion: string;
  decision: string;
  observacionFinal: string;
  bloqueaVenta: boolean;
};

export type CambioAjuste8 = { id: string; etiqueta: string; resumen: string[]; fields: Record<string, unknown> };

export function planAjustePunto8Novedad(n: NovedadParaAjuste8, ahoraISO: string): CambioAjuste8 | null {
  const fields: Record<string, unknown> = {};
  const resumen: string[] = [];
  const notas: string[] = [];

  // ── Solución vieja → decisión sobre el artículo ──
  const nueva = SOLUCIONES_VIEJAS[n.solucion];
  if (nueva && !n.decision) {
    fields["Decisión sobre el artículo"] = nueva;
    const propuesta = n.novedadId === NOVEDAD_LAP_000032 ? "Reemplazo" : null;
    fields["Solución"] = propuesta;
    resumen.push(`Solución «${n.solucion}» → decisión «${nueva}»${propuesta ? ` · propuesta del proveedor «${propuesta}»` : ""}`);
    notas.push(`la solución decía «${n.solucion}»`);
  }

  // ── Tipos que ya no existen ──
  let tipo = n.tipo;
  if (n.tipo === "Otro") tipo = "Asunto interno";
  if (n.tipo === "Faltante") {
    tipo = n.novedadId === NOVEDAD_ACC_000027 ? "Perdido en tienda" : n.novedadId === NOVEDAD_OTR_000199_RAYONES ? "Dañado" : "Incompleto";
  }
  if (tipo !== n.tipo) {
    fields["Tipo de novedad"] = tipo;
    resumen.push(`Tipo «${n.tipo}» → «${tipo}»`);
    notas.push(`el tipo era «${n.tipo}»`);
  }

  // ── ACC-000027: perdido en la tienda, con la venta bloqueada ──
  if (n.novedadId === NOVEDAD_ACC_000027 && !n.bloqueaVenta) {
    fields["Bloquea venta"] = true;
    resumen.push("Venta bloqueada (perdido en tienda)");
  }

  // ── REP-000021: observación abierta de algo ya vendido ──
  if (n.novedadId === NOVEDAD_REP_000021 && n.estado === "Abierta") {
    fields["Estado Novedad"] = "Cerrada";
    fields["Decisión sobre el artículo"] = "No requiere solución";
    fields["Fecha de cierre"] = ahoraISO;
    fields["Cerrado por"] = ACTOR_AJUSTE_8;
    resumen.push("Abierta → Cerrada («No requiere solución»: el artículo ya se vendió)");
    notas.push("se cerró porque el artículo ya se vendió");
  }

  if (!resumen.length) return null;
  if (notas.length) {
    const nota = `[Ajuste ${FECHA_AJUSTE_8}: ${notas.join("; ")}]`;
    fields["Observación final"] = n.observacionFinal ? `${n.observacionFinal}\n${nota}` : nota;
  }
  fields["Última actualización"] = ahoraISO;
  fields["Actualizado por"] = ACTOR_AJUSTE_8;
  return { id: n.id, etiqueta: n.novedadId || n.id, resumen, fields };
}

/** ACC-000027: la etiqueta del artículo pasa de "Con novedad" a "Perdido en tienda". */
export function planAjustePunto8Item(a: { id: string; sku: string; estado: string }, ahoraISO: string): CambioAjuste8 | null {
  if (a.sku !== "ACC-000027" || a.estado !== "Con novedad") return null;
  return {
    id: a.id,
    etiqueta: a.sku,
    resumen: ["Estado «Con novedad» → «Perdido en tienda»"],
    fields: { "Estado Item": "Perdido en tienda", "Disponible para venta": false, "Última actualización": ahoraISO, "Actualizado por": ACTOR_AJUSTE_8 },
  };
}
