// Asistente de la orden (punto 11B · 21-nov-2026) — la parte PURA.
//
// Arma lo que se le pasa a la IA y ordena lo que devuelve. Reglas del dueño:
//   - Lee, resume y redacta; NUNCA cambia datos (sus botones llevan a la
//     acción en la pantalla).
//   - Lo que falta para entregar y los montos NO los calcula la IA: vienen de
//     lib/entrega (la misma revisión de «Entregar al cliente») y de la
//     calculadora única de la cuenta.
//   - A la IA no le llegan teléfono, cédula, correo ni números de serie.
//   - El técnico experto busca solo en sitios de confianza y cita las fuentes;
//     antes mira lo probado en SUPER GEEK (Manual técnico).

import { ESTADOS_ORDEN } from "@/types/tecnicos";
import { listaDe, textoDe } from "@/lib/ia/respuesta";
import {
  limpiarEquipo, pasosDeSolucion, tituloEntrada,
  type Coincidencias, type EntradaManual,
} from "@/lib/manual-tecnico/reglas";

export type EntradaHistorialIA = { fecha: string; texto: string; autor: string };

export type LineaIA = {
  descripcion: string;
  tipo: string;
  estado: string;
  cantidad: number;
  precio: number;
  respuestaCliente: string;
  garantia: string;
  fechaAprobacion: string;
  /** Rediseño R2: avance del trabajo ("En espera · repuesto", "Hecho"…). */
  avance?: string;
};

export type RevisionIA = { clave: string; ok: boolean; texto: string };
export type PendienteIA = { texto: string; detalle: string; tipo: "linea" | "pedido" };

export type DatosOrdenIA = {
  codigo: string;
  estado: string;
  tipoOrden: string;
  fechaIngreso: string;
  clienteNombre: string;
  equipo: string;
  ingresaPor: string;
  accesorios: string;
  diagnostico: string;
  notaInterna: string;
  historial: EntradaHistorialIA[];
  lineas: LineaIA[];
  cuenta: { total: number; pagado: number; saldo: number };
  revisiones: RevisionIA[];
  pendientes: PendienteIA[];
  entregadaEl: string | null;
};

const dinero = (n: number) => `$${(Math.round(Math.abs(n) * 100) / 100).toFixed(2)}`;
const vacio = (s: string) => !s.trim() || /^(no disponible|-|sin datos)$/i.test(s.trim());

/** Días enteros desde el ingreso. */
export function diasDesde(fechaIso: string, ahoraIso: string): number | null {
  const a = Date.parse(fechaIso);
  const b = Date.parse(ahoraIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/** Fecha y hora cortas de Ecuador: "20 nov 16:05". */
export function fechaHoraEc(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - 5 * 3600_000);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getUTCDate()} ${meses[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Una entrada del historial que solo dice el estado nuevo ("En Proceso"). */
export function esCambioDeEstado(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return (ESTADOS_ORDEN as readonly string[]).some((e) => e.toLowerCase() === t);
}

/** Las notas escritas por el personal (sin los cambios de estado). */
export function notasDelHistorial(h: readonly EntradaHistorialIA[]): EntradaHistorialIA[] {
  return h.filter((x) => x.texto.trim() && !esCambioDeEstado(x.texto));
}

/** Fecha del último paso a «Completado» (para proponer guardar la solución). */
export function ultimoCompletado(h: readonly EntradaHistorialIA[]): string | null {
  const fechas = h.filter((x) => x.texto.trim().toLowerCase() === "completado").map((x) => x.fecha).filter(Boolean).sort();
  return fechas.length ? fechas[fechas.length - 1] : null;
}

// ─── Falta para entregar (lo dice el sistema, no la IA) ─────────────────────

export type AccionFalta = "presupuesto" | "registrar_pago" | "cuenta" | null;
export type ItemFalta = { clave: string; ok: boolean; texto: string; detalle: string; accion: AccionFalta };

export function faltaParaEntregar(d: Pick<DatosOrdenIA, "revisiones" | "pendientes" | "lineas" | "cuenta" | "entregadaEl">): ItemFalta[] {
  if (d.entregadaEl) {
    return [{ clave: "entregada", ok: true, texto: `Entregada · ${fechaHoraEc(d.entregadaEl)}`, detalle: "", accion: null }];
  }
  const out: ItemFalta[] = [];
  const propuestas = d.lineas.filter((l) => l.estado === "Propuesta");
  if (propuestas.length) {
    out.push({
      clave: "presupuesto-propuesto", ok: false,
      texto: propuestas.length === 1 ? "1 línea del presupuesto sin respuesta del cliente" : `${propuestas.length} líneas del presupuesto sin respuesta del cliente`,
      detalle: "", accion: "presupuesto",
    });
  }
  d.pendientes.forEach((p, i) => out.push({ clave: `pendiente-${i}`, ok: false, texto: p.texto, detalle: p.detalle, accion: "presupuesto" }));
  for (const r of d.revisiones) {
    if (r.clave === "pendientes" && (d.pendientes.length || r.ok)) continue;
    const accion: AccionFalta = r.ok ? null
      : r.clave === "cobro" ? (d.cuenta.saldo > 0 ? "registrar_pago" : "cuenta")
      : r.clave === "documento" ? "cuenta"
      : "presupuesto";
    out.push({ clave: r.clave, ok: r.ok, texto: r.texto, detalle: "", accion });
  }
  const aprobadas = d.lineas.filter((l) => l.estado === "Aprobada" || l.estado === "Cargada");
  if (aprobadas.length) {
    const ultima = aprobadas.map((l) => l.fechaAprobacion).filter(Boolean).sort().pop();
    out.push({ clave: "presupuesto-aprobado", ok: true, texto: `Presupuesto aprobado${ultima ? ` · ${fechaHoraEc(ultima).replace(/ \d\d:\d\d$/, "")}` : ""}`, detalle: "", accion: null });
  }
  // Lo que falta primero; lo hecho después.
  return [...out.filter((x) => !x.ok), ...out.filter((x) => x.ok)];
}

// ─── Lo que lee la IA ────────────────────────────────────────────────────────

const recortar = (s: string, max: number) => {
  const t = s.replace(/\s+\n/g, "\n").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

export function textoOrden(d: DatosOrdenIA, ahoraIso: string): string {
  const dias = diasDesde(d.fechaIngreso, ahoraIso);
  const lineas = d.lineas.length
    ? d.lineas.map((l) => {
        const extra = [l.avance ? `avance: ${l.avance}` : "", l.respuestaCliente ? `cliente: ${l.respuestaCliente}` : "", l.garantia ? `garantía: ${l.garantia}` : ""].filter(Boolean).join(", ");
        return `- ${l.descripcion} (${l.tipo}, ${l.estado}${extra ? `, ${extra}` : ""}) ${l.cantidad > 1 ? `${l.cantidad} × ` : ""}${dinero(l.precio)}`;
      }).join("\n")
    : "- (sin líneas de presupuesto)";
  const historial = d.historial.length
    ? d.historial.slice(-30).map((h) => `- ${fechaHoraEc(h.fecha)} · ${h.autor || "Sistema"} · ${esCambioDeEstado(h.texto) ? `pasó a «${h.texto.trim()}»` : recortar(h.texto, 700)}`).join("\n")
    : "- (sin historial)";
  const falta = faltaParaEntregar(d);
  return [
    `ORDEN ${d.codigo} · estado actual: ${d.estado} · ${d.tipoOrden}`,
    `Ingresó: ${fechaHoraEc(d.fechaIngreso)}${dias !== null ? ` (hace ${dias} ${dias === 1 ? "día" : "días"})` : ""}`,
    `Cliente: ${d.clienteNombre || "sin nombre"}`,
    `Equipo: ${limpiarEquipo(d.equipo) || "sin dato"}`,
    `Motivo de ingreso (lo que dijo el cliente): ${vacio(d.ingresaPor) ? "sin dato" : recortar(d.ingresaPor, 600)}`,
    `Accesorios: ${vacio(d.accesorios) ? "ninguno anotado" : recortar(d.accesorios, 200)}`,
    `Diagnóstico inicial: ${vacio(d.diagnostico) ? "sin dato" : recortar(d.diagnostico, 900)}`,
    `Nota interna (solo para el personal): ${vacio(d.notaInterna) ? "vacía" : recortar(d.notaInterna, 900)}`,
    "",
    "PRESUPUESTO (precios finales con IVA):",
    lineas,
    "",
    `CUENTA (calculada por el sistema, no la recalcules): total ${dinero(d.cuenta.total)} · pagado ${dinero(d.cuenta.pagado)} · ${d.cuenta.saldo > 0.005 ? `falta cobrar ${dinero(d.cuenta.saldo)}` : d.cuenta.saldo < -0.005 ? `sobran ${dinero(d.cuenta.saldo)}` : "pagada"}`,
    "",
    "FALTA PARA ENTREGAR (revisión del sistema):",
    falta.length ? falta.map((f) => `- ${f.ok ? "[hecho]" : "[falta]"} ${f.texto}${f.detalle ? ` · ${f.detalle}` : ""}`).join("\n") : "- nada",
    "",
    "HISTORIAL (más antiguo primero):",
    historial,
  ].join("\n");
}

const SISTEMA_ORDEN = [
  "Eres el asistente de órdenes de SUPER GEEK, un taller de reparación de laptops y tecnología en Otavalo, Ecuador.",
  "Lees los datos de UNA orden y ayudas al personal a entender en qué está, qué falta y qué decirle al cliente.",
  "Solo lees, resumes y redactas: nunca cambias nada.",
  "Usa SOLO lo que está en la orden; si algo no está, no lo inventes.",
  "Los montos y lo que falta para entregar ya vienen calculados por el sistema: úsalos tal cual.",
  "Escribe en español de Ecuador, claro, breve y amable.",
].join(" ");

const REGLAS_MENSAJE = [
  "El mensaje es para WhatsApp: trata al cliente de usted, máximo 70 palabras, firma «SUPER GEEK».",
  "Nunca pongas en el mensaje notas internas, costos de proveedor, nombres de técnicos ni datos que el cliente no deba ver.",
  "Si hay saldo por cobrar, dilo con el monto exacto de la cuenta.",
].join(" ");

export type PedidoTexto = { sistema: string; mensaje: string; maxTokens: number };

export function pedidoResumen(d: DatosOrdenIA, ahoraIso: string): PedidoTexto {
  return {
    sistema: SISTEMA_ORDEN,
    maxTokens: 1200,
    mensaje: [
      textoOrden(d, ahoraIso),
      "",
      "Responde SOLO con un objeto JSON, sin texto alrededor:",
      '{"resumen": "2 o 3 frases: equipo, qué se hizo, qué falta y cuántos días lleva",',
      ' "proximoPaso": "una frase con la acción concreta que sigue",',
      ' "antesDeEntregar": "aviso si algo del motivo de ingreso no quedó probado o resuelto según el historial; null si no hay",',
      ' "mensaje": "mensaje para el cliente sobre el estado actual"}',
      REGLAS_MENSAJE,
    ].join("\n"),
  };
}

export function pedidoMensaje(d: DatosOrdenIA, actual: string, variante: "corto" | "otro", ahoraIso: string): PedidoTexto {
  return {
    sistema: SISTEMA_ORDEN,
    maxTokens: 600,
    mensaje: [
      textoOrden(d, ahoraIso),
      "",
      `Mensaje actual para el cliente:\n${recortar(actual, 1500) || "(vacío)"}`,
      "",
      variante === "corto"
        ? "Reescríbelo más corto (máximo 40 palabras), con la misma información esencial."
        : "Escribe otra versión distinta del mensaje, con la misma información.",
      REGLAS_MENSAJE,
      'Responde SOLO con JSON: {"mensaje": "..."}',
    ].join("\n"),
  };
}

export function pedidoPregunta(d: DatosOrdenIA, pregunta: string, ahoraIso: string): PedidoTexto {
  return {
    sistema: SISTEMA_ORDEN,
    maxTokens: 700,
    mensaje: [
      textoOrden(d, ahoraIso),
      "",
      `Pregunta del personal: ${recortar(pregunta, 600)}`,
      "Responde en 1 a 4 frases, solo con lo que dice la orden. Si la orden no lo dice, dilo.",
      'Responde SOLO con JSON: {"respuesta": "..."}',
    ].join("\n"),
  };
}

export type ResumenOrden = { resumen: string; proximoPaso: string; antesDeEntregar: string | null; mensaje: string };

export function normalizarResumen(json: Record<string, unknown> | null, crudo: string): ResumenOrden {
  if (!json) return { resumen: textoDe(crudo, 900), proximoPaso: "", antesDeEntregar: null, mensaje: "" };
  const antes = textoDe(json.antesDeEntregar, 500);
  return {
    resumen: textoDe(json.resumen, 900),
    proximoPaso: textoDe(json.proximoPaso, 400),
    antesDeEntregar: antes && !/^null$/i.test(antes) ? antes : null,
    mensaje: textoDe(json.mensaje, 1200),
  };
}

// ─── Técnico experto ─────────────────────────────────────────────────────────

export const PREGUNTAS_RAPIDAS = ["¿Qué pruebo ahora?", "Cómo desarmar", "Repuesto compatible", "Cuánto cobrar"] as const;

export type TurnoChat = { rol: "tecnico" | "ia"; texto: string };

export type DatosTecnicoIA = {
  codigo: string;
  equipo: string;
  ingresaPor: string;
  diagnostico: string;
  notas: EntradaHistorialIA[];
  biblioteca: Coincidencias;
  /** Servicios del catálogo con su precio (solo si preguntan cuánto cobrar). */
  precios?: Array<{ nombre: string; precio: number }>;
};

function textoEntradaManual(e: EntradaManual): string {
  if (e.tipo !== "Solución") return `- ${e.codigo} (${e.tipo}): ${recortar(e.notas, 500)}`;
  const pasos = pasosDeSolucion(e.solucion).map((p, i) => `${i + 1}. ${p}`).join(" ");
  return [
    `- ${e.codigo} · ${tituloEntrada(e)}${e.sistema ? ` · ${e.sistema}` : ""} · ${e.estado} · funcionó ${e.vecesFunciono}, falló ${e.vecesFallo}`,
    `  Síntoma: ${e.sintoma}`,
    e.causa ? `  Causa: ${e.causa}` : "",
    pasos ? `  Solución: ${pasos}` : "",
    e.noFunciono ? `  No funcionó: ${e.noFunciono}` : "",
  ].filter(Boolean).join("\n");
}

const SISTEMA_TECNICO = [
  "Eres un técnico experto en reparación de laptops, PCs, impresoras y celulares que acompaña al técnico de SUPER GEEK (Otavalo, Ecuador).",
  "Ayudas a orientar el diagnóstico: causas probables de más a menos probable y pruebas concretas en orden, de la más fácil y barata a la más costosa.",
  "Avisa las precauciones de seguridad cuando importen (batería, descarga electrostática, voltajes, datos del cliente).",
  "Si te paso «Probado en SUPER GEEK» y el equipo y el síntoma encajan, recomiéndalo PRIMERO y dilo; si una solución falló antes, tenlo en cuenta.",
  "Usa la búsqueda web solo cuando aporte (manuales de servicio, boletines del fabricante, guías de iFixit, soporte de Microsoft para fallas de Windows) y cita lo que uses.",
  "No inventes números de parte ni precios: si no lo sabes, dilo y di cómo averiguarlo.",
  "Habla de tú al técnico, en español de Ecuador, directo y práctico.",
].join(" ");

const FORMATO_TECNICO = [
  "Responde SOLO con un objeto JSON, sin texto alrededor:",
  '{"respuesta": "texto corto para preguntas que no son de diagnóstico (cómo desarmar, repuesto, precio); vacío si no aplica",',
  ' "causas": [{"titulo": "causa corta", "detalle": "por qué encaja con lo que se ve"}],',
  ' "pruebas": ["prueba concreta 1", "prueba 2"],',
  ' "precaucion": "una precaución de seguridad o null"}',
  "Máximo 4 causas y 6 pruebas. Deja las listas vacías si no aplican.",
].join("\n");

export function textoTecnico(d: DatosTecnicoIA): string {
  const lib = d.biblioteca;
  const probado = [...lib.probadas, ...lib.parecidas];
  return [
    `ORDEN ${d.codigo}`,
    `Equipo: ${limpiarEquipo(d.equipo) || "sin dato"}`,
    `Motivo de ingreso: ${vacio(d.ingresaPor) ? "sin dato" : recortar(d.ingresaPor, 600)}`,
    `Diagnóstico inicial: ${vacio(d.diagnostico) ? "sin dato" : recortar(d.diagnostico, 900)}`,
    d.notas.length ? `Notas del historial:\n${d.notas.slice(-12).map((n) => `- ${fechaHoraEc(n.fecha)} · ${n.autor || "Sistema"}: ${recortar(n.texto, 500)}`).join("\n")}` : "Notas del historial: ninguna",
    "",
    probado.length ? `PROBADO EN SUPER GEEK (Manual técnico):\n${probado.map(textoEntradaManual).join("\n")}` : "PROBADO EN SUPER GEEK: nada para este modelo todavía.",
    lib.relacionadas.length ? `Procedimientos y notas de la tienda que pueden servir:\n${lib.relacionadas.map(textoEntradaManual).join("\n")}` : "",
    d.precios?.length ? `PRECIOS DE SERVICIOS DE LA TIENDA (con IVA):\n${d.precios.map((p) => `- ${p.nombre}: ${dinero(p.precio)}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * La conversación con el técnico experto. El primer mensaje lleva la orden
 * completa; los turnos anteriores van como texto (sin repetir búsquedas).
 */
export function pedidoTecnico(d: DatosTecnicoIA, chat: readonly TurnoChat[], pregunta: string): {
  sistema: string;
  mensajes: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
} {
  const contexto = textoTecnico(d);
  const turnos: TurnoChat[] = [...chat.slice(-8), { rol: "tecnico", texto: pregunta }];
  while (turnos.length && turnos[0].rol === "ia") turnos.shift();
  const mensajes = turnos.map((t, i) => ({
    role: t.rol === "tecnico" ? ("user" as const) : ("assistant" as const),
    content: i === 0
      ? `${contexto}\n\n${FORMATO_TECNICO}\n\nEl técnico dice: ${recortar(t.texto, 1500)}`
      : t.rol === "tecnico"
        ? `${recortar(t.texto, 1500)}\n\n(Responde con el mismo formato JSON.)`
        : recortar(t.texto, 3000),
  }));
  return { sistema: SISTEMA_TECNICO, mensajes: unirSeguidos(mensajes), maxTokens: 1800 };
}

/** La API pide turnos alternados: une dos seguidos del mismo rol. */
function unirSeguidos(m: Array<{ role: "user" | "assistant"; content: string }>) {
  const out: typeof m = [];
  for (const x of m) {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.role === x.role) ultimo.content = `${ultimo.content}\n\n${x.content}`;
    else out.push({ ...x });
  }
  return out;
}

export type CausaIA = { titulo: string; detalle: string };
export type RespuestaTecnico = { respuesta: string; causas: CausaIA[]; pruebas: string[]; precaucion: string | null };

export function normalizarTecnico(json: Record<string, unknown> | null, crudo: string): RespuestaTecnico {
  if (!json) return { respuesta: textoDe(crudo, 2500), causas: [], pruebas: [], precaucion: null };
  const causas = Array.isArray(json.causas)
    ? json.causas
        .map((c) => {
          const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
          return { titulo: textoDe(o.titulo, 160), detalle: textoDe(o.detalle, 500) };
        })
        .filter((c) => c.titulo)
        .slice(0, 4)
    : [];
  const prec = textoDe(json.precaucion, 400);
  return {
    respuesta: textoDe(json.respuesta, 2500),
    causas,
    pruebas: listaDe(json.pruebas, 6),
    precaucion: prec && !/^null$/i.test(prec) ? prec : null,
  };
}

/** Texto de una respuesta para copiar o pasar a la nota interna. */
export function textoPlanoTecnico(r: RespuestaTecnico): string {
  return [
    r.respuesta,
    r.causas.length ? `Posibles causas:\n${r.causas.map((c, i) => `${i + 1}. ${c.titulo}${c.detalle ? ` — ${c.detalle}` : ""}`).join("\n")}` : "",
    r.pruebas.length ? `Prueba en este orden:\n${r.pruebas.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "",
    r.precaucion ? `Precaución: ${r.precaucion}` : "",
  ].filter(Boolean).join("\n\n");
}

export function pidePrecios(pregunta: string): boolean {
  return /cu[aá]nto cobrar|precio|cobr|tarifa|costo/i.test(pregunta);
}

// ─── El borrador del Manual técnico (al pasar a Completado) ──────────────────

const SISTEMA_BORRADOR = [
  "Mantienes el Manual técnico de SUPER GEEK: una biblioteca interna de soluciones probadas en el taller.",
  "Con los datos de una orden ya COMPLETADA decides si vale la pena guardar la solución y redactas la ficha.",
  "NO vale la pena (proponer=false) cuando el trabajo fue obvio o rutinario: limpieza o mantenimiento, cambio de una pieza visiblemente rota (pantalla quebrada, bisagra rota, teclado derramado), instalación de programas o del sistema a pedido, respaldo de datos, o cuando el historial no dice qué causó el problema.",
  "SÍ vale la pena cuando hubo un diagnóstico que no era evidente: la causa no era lo que parecía, se probó algo que no funcionó, un ajuste de software, BIOS o controlador, o una pieza específica que falla en ese modelo.",
  "Nunca incluyas datos del cliente (nombre, teléfono, cédula) ni números de serie.",
  "Normaliza el equipo a marca y modelo comerciales (ej.: «Laptop HP Elitebook 840 g3 SN 5CG…» → marca «HP», modelo «EliteBook 840 G3»).",
  "Escribe en español de Ecuador, claro y corto, para otro técnico.",
].join(" ");

export function pedidoBorrador(d: {
  codigo: string;
  equipo: string;
  ingresaPor: string;
  diagnostico: string;
  notaInterna: string;
  historial: EntradaHistorialIA[];
  lineas: Array<Pick<LineaIA, "descripcion" | "tipo" | "estado">>;
  chat: readonly TurnoChat[];
}): PedidoTexto {
  const notas = notasDelHistorial(d.historial);
  return {
    sistema: SISTEMA_BORRADOR,
    maxTokens: 1200,
    mensaje: [
      `ORDEN ${d.codigo} (Completado)`,
      `Equipo: ${limpiarEquipo(d.equipo) || "sin dato"}`,
      `Motivo de ingreso: ${vacio(d.ingresaPor) ? "sin dato" : recortar(d.ingresaPor, 600)}`,
      `Diagnóstico inicial: ${vacio(d.diagnostico) ? "sin dato" : recortar(d.diagnostico, 900)}`,
      `Nota interna: ${vacio(d.notaInterna) ? "vacía" : recortar(d.notaInterna, 1200)}`,
      `Trabajos y repuestos: ${d.lineas.filter((l) => l.estado !== "Rechazada").map((l) => `${l.descripcion} (${l.estado})`).join("; ") || "ninguno"}`,
      `Notas del historial:\n${notas.length ? notas.slice(-20).map((n) => `- ${fechaHoraEc(n.fecha)} · ${n.autor || "Sistema"}: ${recortar(n.texto, 600)}`).join("\n") : "- ninguna"}`,
      d.chat.length ? `Conversación del técnico con el técnico experto:\n${d.chat.slice(-10).map((t) => `${t.rol === "tecnico" ? "Técnico" : "Experto"}: ${recortar(t.texto, 600)}`).join("\n")}` : "",
      "",
      "Responde SOLO con un objeto JSON, sin texto alrededor:",
      '{"proponer": true o false, "motivo": "por qué, en una frase",',
      ' "marca": "", "modelo": "", "sistema": "sistema operativo si importa, si no vacío",',
      ' "sintoma": "lo que se veía", "causa": "lo que lo causaba",',
      ' "solucion": ["paso 1", "paso 2"], "noFunciono": "lo que se probó y no sirvió, o vacío",',
      ' "saleDe": "de dónde sale, ej.: historial de Kevin (20 nov) y su chat con el técnico experto"}',
    ].filter(Boolean).join("\n"),
  };
}
