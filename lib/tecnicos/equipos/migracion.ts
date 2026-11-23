// Plan para pasar las órdenes viejas al diseño nuevo (rediseño R5) — PURO.
//
//   · Cada orden con cliente queda ligada a la ficha de su equipo: una ficha
//     por equipo del cliente (misma serie o mismo nombre = mismo equipo).
//   · La contraseña escrita en la «nota interna» pasa a la ficha (la más
//     reciente manda; nunca pisa una contraseña que la ficha ya tenga).
//   · El resto de la nota interna entra a la Actividad como nota interna,
//     con la fecha de la orden.
//   · Se puede correr otra vez: lo ya hecho no se repite (vista previa en 0).

import { claveEquipo, extraerContrasena, interpretarEquipo, nombreEquipo, textoNotaAnterior, type DatosEquipo } from "./reglas";

export const AVISO_CONTRASENA = "(la contraseña pasó a la ficha del equipo)";

export type OrdenVieja = {
  id: string;
  codigo: string;
  fecha: string;
  clienteId: string | null;
  equipoTexto: string;
  fichaId: string | null;
  notaInterna: string;
};

export type FichaExistente = { id: string; clienteId: string | null; datos: DatosEquipo; tieneContrasena: boolean };

export type PlanEquipos = {
  crear: Array<{ clave: string; clienteId: string; datos: DatosEquipo; nombre: string; contrasena: string; ordenes: string[] }>;
  ligar: Array<{ ordenId: string; codigo: string; fichaId: string | null; clave: string | null }>;
  contrasenas: Array<{ codigo: string; destino: string; contrasena: string; confianza: "alta" | "media"; nota: string }>;
  /** Contraseñas para fichas que ya existen (las nuevas la llevan al crearse). */
  contrasenasExistentes: Array<{ fichaId: string; contrasena: string; codigo: string }>;
  notas: Array<{ ordenId: string; codigo: string; fecha: string; texto: string }>;
  saltadas: Array<{ codigo: string; motivo: string }>;
};

export function planMigracionEquipos(ordenes: readonly OrdenVieja[], fichas: readonly FichaExistente[], notasYaPasadas: ReadonlySet<string>): PlanEquipos {
  const plan: PlanEquipos = { crear: [], ligar: [], contrasenas: [], contrasenasExistentes: [], notas: [], saltadas: [] };
  const porClave = new Map<string, FichaExistente>();
  for (const f of fichas) if (f.clienteId) porClave.set(claveEquipo(f.clienteId, f.datos), f);
  const fichaPorId = new Map(fichas.map((f) => [f.id, f]));
  const nuevas = new Map<string, PlanEquipos["crear"][number]>();
  const claveDeExistente = new Map<string, { fichaId: string; contrasena: string; codigo: string }>();

  const ordenadas = [...ordenes].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "") || a.codigo.localeCompare(b.codigo));
  for (const o of ordenadas) {
    // ¿A qué ficha va esta orden? (destino: id de ficha existente o clave de una nueva)
    let destino: { fichaId: string | null; clave: string | null } | null = null;
    if (o.fichaId) {
      destino = { fichaId: o.fichaId, clave: null };
    } else if (!o.clienteId) {
      plan.saltadas.push({ codigo: o.codigo, motivo: "sin cliente" });
    } else if (!o.equipoTexto.trim()) {
      plan.saltadas.push({ codigo: o.codigo, motivo: "sin equipo escrito" });
    } else {
      const datos = interpretarEquipo(o.equipoTexto);
      const clave = claveEquipo(o.clienteId, datos);
      const existente = porClave.get(clave);
      if (existente) {
        destino = { fichaId: existente.id, clave: null };
      } else {
        let n = nuevas.get(clave);
        if (!n) {
          n = { clave, clienteId: o.clienteId, datos, nombre: nombreEquipo(datos), contrasena: "", ordenes: [] };
          nuevas.set(clave, n);
        }
        n.ordenes.push(o.codigo);
        destino = { fichaId: null, clave };
      }
      plan.ligar.push({ ordenId: o.id, codigo: o.codigo, ...destino });
    }

    const nota = (o.notaInterna ?? "").trim();
    if (!nota || notasYaPasadas.has(o.id)) continue;
    const x = extraerContrasena(nota);
    if (!x) {
      plan.notas.push({ ordenId: o.id, codigo: o.codigo, fecha: o.fecha, texto: textoNotaAnterior(nota) });
      continue;
    }
    if (!destino) {
      // Sin ficha no hay dónde guardar la contraseña: la nota se queda como está.
      plan.saltadas.push({ codigo: o.codigo, motivo: "contraseña en la nota, pero la orden no tiene equipo ni cliente" });
      continue;
    }
    const nombreDestino = destino.fichaId
      ? `ficha ${fichaPorId.get(destino.fichaId) ? nombreEquipo(fichaPorId.get(destino.fichaId)!.datos) : destino.fichaId}`
      : `ficha nueva ${nuevas.get(destino.clave!)?.nombre ?? ""}`;
    plan.contrasenas.push({ codigo: o.codigo, destino: nombreDestino, contrasena: x.contrasena, confianza: x.confianza, nota });
    if (destino.clave) nuevas.get(destino.clave)!.contrasena = x.contrasena; // la más reciente manda
    else if (destino.fichaId && !fichaPorId.get(destino.fichaId)?.tieneContrasena) {
      claveDeExistente.set(destino.fichaId, { fichaId: destino.fichaId, contrasena: x.contrasena, codigo: o.codigo });
    }
    // La nota entra a la Actividad SIN la contraseña (queda oculta en la ficha).
    plan.notas.push({ ordenId: o.id, codigo: o.codigo, fecha: o.fecha, texto: textoNotaAnterior(x.resto ? `${x.resto}\n${AVISO_CONTRASENA}` : AVISO_CONTRASENA) });
  }
  plan.crear = [...nuevas.values()];
  plan.contrasenasExistentes = [...claveDeExistente.values()];
  return plan;
}

export const totalAcciones = (p: PlanEquipos) => p.crear.length + p.ligar.length + p.contrasenasExistentes.length + p.notas.length;
