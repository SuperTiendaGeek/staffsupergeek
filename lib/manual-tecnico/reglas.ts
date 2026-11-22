// Manual técnico — biblioteca de soluciones probadas (punto 11B · 21-nov-2026).
// Regla PURA: sin red ni Airtable. La lectura y escritura viven en ./servidor.ts.
//
// Idea del dueño: cuando el taller resuelve un problema que no era obvio
// (ej.: HP EliteBook 840 G3 sin teclado → «Inicio rápido» de Windows), queda
// guardado. Si vuelve el mismo modelo con el mismo síntoma, el técnico
// experto lo muestra primero. Cómo lo hacen los sistemas profesionales:
//   - Identifix Direct-Hit: el técnico reporta «qué lo arregló» y técnicos
//     maestros lo verifican.            → Probada (técnico) · Verificada (admin)
//   - Mitchell 1 SureTrack: cuenta cada vez que el arreglo sirvió («Fixed It»).
//                                        → Veces que funcionó / falló
//   - KCS: se guarda en el momento, con plantilla simple, y «reusar es revisar».
//                                        → al pasar a Completado; un toque al reusar
//   - ServiceNow Now Assist: la IA redacta el borrador desde el caso resuelto.
//                                        → la IA arma la ficha; el técnico revisa
// Decisiones del dueño (21-nov): todas las recomendadas. Nada se borra: se archiva.
// Nunca guarda datos del cliente ni números de serie.

export const TABLA_MANUAL = "Manual Técnico";

export const TIPOS_MANUAL = ["Solución", "Procedimiento", "Regla de la tienda", "Nota"] as const;
export type TipoManual = (typeof TIPOS_MANUAL)[number];
export const TIPOS_NOTA = ["Procedimiento", "Regla de la tienda", "Nota"] as const satisfies readonly TipoManual[];

export const ESTADOS_MANUAL = ["Probada", "Verificada", "Para revisar", "Archivada"] as const;
export type EstadoManual = (typeof ESTADOS_MANUAL)[number];

/** Nombres reales de las columnas en Airtable. */
export const CAMPOS_MANUAL = {
  cod: "Cod.",
  notas: "Notas",
  claves: "Claves",
  tipo: "Tipo",
  estado: "Estado",
  marca: "Marca",
  modelo: "Modelo",
  sistema: "Sistema",
  sintoma: "Síntoma",
  causa: "Causa",
  solucion: "Solución",
  noFunciono: "No funcionó",
  vecesFunciono: "Veces que funcionó",
  vecesFallo: "Veces que falló",
  ordenOrigen: "Orden de origen",
  usos: "Órdenes donde se usó",
  registradoPor: "Registrado por",
  verificadoPor: "Verificado por",
  fechaVerificacion: "Fecha de verificación",
} as const;

export type EntradaManual = {
  id: string;
  cod: number | null;
  /** "MT-000012" */
  codigo: string;
  tipo: TipoManual;
  estado: EstadoManual;
  marca: string;
  modelo: string;
  sistema: string;
  sintoma: string;
  causa: string;
  /** Pasos, uno por línea. */
  solucion: string;
  noFunciono: string;
  notas: string;
  claves: string;
  ordenOrigen: string;
  usos: string;
  vecesFunciono: number;
  vecesFallo: number;
  registradoPor: string;
  verificadoPor: string;
  fechaVerificacion: string;
  creado: string;
};

const txt = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "name" in v) return String((v as { name: unknown }).name ?? "");
  return "";
};
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function codigoManual(cod: number | null): string {
  return cod ? `MT-${String(cod).padStart(6, "0")}` : "MT-…";
}

/**
 * Las notas viejas (antes del 21-nov) no tienen Tipo ni Estado: se leen como
 * «Nota» y «Verificada» (las escribió el dueño). El script de tipos las ordena.
 */
export function entradaDesdeRegistro(r: { id: string; fields: Record<string, unknown>; createdTime?: string }): EntradaManual {
  const f = r.fields ?? {};
  const c = CAMPOS_MANUAL;
  const tipoLeido = txt(f[c.tipo]);
  const tipo: TipoManual = (TIPOS_MANUAL as readonly string[]).includes(tipoLeido) ? (tipoLeido as TipoManual) : "Nota";
  const estadoLeido = txt(f[c.estado]);
  const estado: EstadoManual = (ESTADOS_MANUAL as readonly string[]).includes(estadoLeido)
    ? (estadoLeido as EstadoManual)
    : tipo === "Solución" ? "Probada" : "Verificada";
  const cod = typeof f[c.cod] === "number" ? (f[c.cod] as number) : null;
  return {
    id: r.id,
    cod,
    codigo: codigoManual(cod),
    tipo,
    estado,
    marca: txt(f[c.marca]).trim(),
    modelo: txt(f[c.modelo]).trim(),
    sistema: txt(f[c.sistema]).trim(),
    sintoma: txt(f[c.sintoma]).trim(),
    causa: txt(f[c.causa]).trim(),
    solucion: txt(f[c.solucion]).trim(),
    noFunciono: txt(f[c.noFunciono]).trim(),
    notas: txt(f[c.notas]).trim(),
    claves: txt(f[c.claves]).trim(),
    ordenOrigen: txt(f[c.ordenOrigen]).trim(),
    usos: txt(f[c.usos]).trim(),
    vecesFunciono: num(f[c.vecesFunciono]),
    vecesFallo: num(f[c.vecesFallo]),
    registradoPor: txt(f[c.registradoPor]).trim(),
    verificadoPor: txt(f[c.verificadoPor]).trim(),
    fechaVerificacion: txt(f[c.fechaVerificacion]),
    creado: r.createdTime ?? "",
  };
}

// ─── El equipo ───────────────────────────────────────────────────────────────

/**
 * Quita el número de serie que el personal escribe en «Equipo»
 * ("Laptop Dell Latitude 7400 ST 4F1N3X2" → "Laptop Dell Latitude 7400").
 * Lo que va a la IA y al Manual nunca lleva la serie.
 */
export function limpiarEquipo(texto: string): string {
  return String(texto ?? "")
    .replace(/\s+(?:s\/n|n\/s|s\.n\.?|sn|st|ns|serie|serial|service\s*tag|tag)\b\s*[:#.\-]?\s*\S.*$/i, "")
    .replace(/\s+s\/[a-z0-9].*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const VACIAS = new Set([
  "laptop", "laptops", "notebook", "portatil", "computadora", "computador", "pc", "equipo", "de", "del", "la", "el",
  "los", "las", "con", "sin", "y", "o", "en", "para", "por", "un", "una", "que", "se", "no", "si", "al", "lo", "le",
  "su", "mas", "muy", "cargador", "color", "negro", "negra", "gris", "plata", "blanco", "blanca", "azul", "rojo",
]);

/** Palabras útiles para comparar (sin tildes ni mayúsculas, sin palabras vacías). */
export function tokens(texto: string): string[] {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !VACIAS.has(t));
}

/** "t480s" ≈ "480s" (el personal a veces omite la letra de la serie). */
function mismoToken(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  const [largo, corto] = a.length >= b.length ? [a, b] : [b, a];
  return largo.length - corto.length === 1 && /\d/.test(corto) && largo.endsWith(corto);
}

const contiene = (bolsa: readonly string[], t: string) => bolsa.some((x) => mismoToken(x, t));

/** Título de una entrada: el equipo (solución) o la primera línea útil (nota). */
export function tituloEntrada(e: Pick<EntradaManual, "tipo" | "marca" | "modelo" | "notas">): string {
  if (e.tipo === "Solución") return [e.marca, e.modelo].filter(Boolean).join(" ") || "Equipo sin modelo";
  const linea = e.notas
    .split("\n")
    .map((l) => l.replace(/^[:\s=#*-]+/, "").replace(/[=]{3,}/g, "").trim())
    .find((l) => l.length > 0);
  if (!linea) return "Nota vacía";
  return linea.length > 80 ? `${linea.slice(0, 79)}…` : linea;
}

/** Pasos de la solución, uno por línea, sin la numeración que traiga. */
export function pasosDeSolucion(texto: string): string[] {
  return String(texto ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:\d+[.)-]|[-*•])\s*/, "").trim())
    .filter(Boolean);
}

// ─── Buscar lo probado ───────────────────────────────────────────────────────

export type Coincidencias = {
  /** Mismo modelo (lo que se prueba primero). */
  probadas: EntradaManual[];
  /** Misma marca y familia, otro modelo. */
  parecidas: EntradaManual[];
  /** Procedimientos o notas de la misma marca (ej.: BIOS Dell). */
  relacionadas: EntradaManual[];
};

function puntajeSintoma(sintomaOrden: string[], e: EntradaManual): number {
  if (!sintomaOrden.length) return 0;
  const bolsa = tokens(`${e.sintoma} ${e.causa}`);
  return sintomaOrden.filter((t) => t.length > 2 && contiene(bolsa, t)).length;
}

const PESO_ESTADO: Record<EstadoManual, number> = { Verificada: 2, Probada: 1, "Para revisar": 0, Archivada: -1 };

export function buscarCoincidencias(
  entradas: readonly EntradaManual[],
  orden: { equipo: string; sintoma: string },
  max = { probadas: 3, parecidas: 2, relacionadas: 3 },
): Coincidencias {
  const equipo = tokens(limpiarEquipo(orden.equipo));
  const sintoma = tokens(orden.sintoma);
  const probadas: Array<{ e: EntradaManual; p: number }> = [];
  const parecidas: Array<{ e: EntradaManual; p: number }> = [];
  const relacionadas: EntradaManual[] = [];
  if (!equipo.length) return { probadas: [], parecidas: [], relacionadas: [] };

  for (const e of entradas) {
    if (e.estado === "Archivada") continue;
    const marca = tokens(e.marca);
    const marcaOk = marca.length > 0 && marca.every((t) => contiene(equipo, t));
    if (e.tipo !== "Solución") {
      const texto = tokens(`${e.notas} ${e.claves}`);
      if (equipo.some((t) => t.length >= 2 && !/^\d+$/.test(t) && contiene(texto, t))) relacionadas.push(e);
      continue;
    }
    const modelo = tokens(e.modelo).filter((t) => !marca.includes(t));
    if (!modelo.length) continue;
    const presentes = modelo.filter((t) => contiene(equipo, t)).length;
    const p = puntajeSintoma(sintoma, e) * 10 + PESO_ESTADO[e.estado] * 3 + Math.min(e.vecesFunciono, 9) - e.vecesFallo;
    if (presentes === modelo.length && (marcaOk || marca.length === 0 || presentes >= 2)) {
      probadas.push({ e, p });
    } else if (marcaOk && contiene(equipo, modelo[0]) && presentes >= Math.max(1, Math.ceil(modelo.length / 2))) {
      parecidas.push({ e, p });
    }
  }
  const ordenar = (a: { p: number }, b: { p: number }) => b.p - a.p;
  return {
    probadas: probadas.sort(ordenar).slice(0, max.probadas).map((x) => x.e),
    parecidas: parecidas.sort(ordenar).slice(0, max.parecidas).map((x) => x.e),
    relacionadas: relacionadas.slice(0, max.relacionadas),
  };
}

// ─── La ficha de una solución ────────────────────────────────────────────────

export type FichaSolucion = {
  marca: string;
  modelo: string;
  sistema: string;
  sintoma: string;
  causa: string;
  solucion: string[];
  noFunciono: string;
};

const corto = (v: unknown, max: number): string => {
  const t = typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
  return t.length > max ? t.slice(0, max).trim() : t;
};

export function normalizarFicha(v: unknown): FichaSolucion {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const pasos = Array.isArray(o.solucion)
    ? o.solucion.map((x) => corto(x, 400)).filter(Boolean)
    : pasosDeSolucion(corto(o.solucion, 3000));
  return {
    marca: corto(o.marca, 40),
    modelo: limpiarEquipo(corto(o.modelo, 80)),
    sistema: corto(o.sistema, 60),
    sintoma: corto(o.sintoma, 400),
    causa: corto(o.causa, 600),
    solucion: pasos.slice(0, 12),
    noFunciono: corto(o.noFunciono, 600),
  };
}

export function errorFicha(f: FichaSolucion): string | null {
  if (!f.modelo && !f.marca) return "Escribe la marca y el modelo del equipo.";
  if (!f.modelo) return "Escribe el modelo del equipo.";
  if (!f.sintoma) return "Escribe el síntoma.";
  if (!f.causa && !f.solucion.length) return "Escribe la causa o los pasos que lo arreglaron.";
  return null;
}

/** Quien guarda siendo administrador la deja verificada de una vez. */
export function estadoInicial(esAdmin: boolean): EstadoManual {
  return esAdmin ? "Verificada" : "Probada";
}

/** Fecha corta de Ecuador (UTC-5): "21/11/2026". */
export function fechaCortaEc(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const [a, m, d] = new Date(t - 5 * 3600_000).toISOString().slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export type Uso = { orden: string; funciono: boolean; usuario: string; fecha: string; origen: boolean };

export function lineaDeUso(u: Uso): string {
  return [u.orden, u.funciono ? "Funcionó" : "No funcionó", u.usuario || "Portal", u.fecha].join(" · ") + (u.origen ? " · origen" : "");
}

export function parsearUsos(texto: string): Uso[] {
  return String(texto ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const partes = l.split(" · ");
      return {
        orden: partes[0] ?? "",
        funciono: (partes[1] ?? "") === "Funcionó",
        usuario: partes[2] ?? "",
        fecha: partes[3] ?? "",
        origen: partes[4] === "origen",
      };
    })
    .filter((u) => u.orden);
}

export function camposNuevaSolucion(
  f: FichaSolucion,
  o: { ordenCodigo: string; usuario: string; esAdmin: boolean; ahora: string },
): Record<string, unknown> {
  const c = CAMPOS_MANUAL;
  const estado = estadoInicial(o.esAdmin);
  const campos: Record<string, unknown> = {
    [c.tipo]: "Solución",
    [c.estado]: estado,
    [c.marca]: f.marca,
    [c.modelo]: f.modelo,
    [c.sistema]: f.sistema,
    [c.sintoma]: f.sintoma,
    [c.causa]: f.causa,
    [c.solucion]: f.solucion.join("\n"),
    [c.noFunciono]: f.noFunciono,
    [c.ordenOrigen]: o.ordenCodigo,
    // La orden donde se resolvió cuenta como la primera vez que funcionó.
    [c.vecesFunciono]: 1,
    [c.vecesFallo]: 0,
    [c.usos]: lineaDeUso({ orden: o.ordenCodigo, funciono: true, usuario: o.usuario, fecha: fechaCortaEc(o.ahora), origen: true }),
    [c.registradoPor]: o.usuario,
  };
  if (estado === "Verificada") {
    campos[c.verificadoPor] = o.usuario;
    campos[c.fechaVerificacion] = o.ahora;
  }
  return campos;
}

// ─── Notas escritas a mano (+ Nota) ──────────────────────────────────────────

export type NotaManual = { tipo: TipoManual; texto: string; claves: string };

export function errorNota(n: NotaManual): string | null {
  if (!(TIPOS_NOTA as readonly string[]).includes(n.tipo)) return "Elige si es procedimiento, regla de la tienda o nota.";
  if (!n.texto.trim()) return "Escribe la nota.";
  return null;
}

export function camposNuevaNota(n: NotaManual, o: { usuario: string; esAdmin: boolean; ahora: string }): Record<string, unknown> {
  const c = CAMPOS_MANUAL;
  const estado = estadoInicial(o.esAdmin);
  return {
    [c.tipo]: n.tipo,
    [c.estado]: estado,
    [c.notas]: n.texto.trim(),
    [c.claves]: n.claves.trim(),
    [c.registradoPor]: o.usuario,
    ...(estado === "Verificada" ? { [c.verificadoPor]: o.usuario, [c.fechaVerificacion]: o.ahora } : {}),
  };
}

// ─── Reusar es revisar (un toque) ────────────────────────────────────────────

export type ResultadoVoto = {
  /** Campos a escribir (vacío si ya estaba anotado igual). */
  campos: Record<string, unknown>;
  /** Pasó a «Para revisar» con este voto (para avisar al administrador). */
  pasaARevisar: boolean;
  /** Ya estaba anotado el mismo resultado para esta orden. */
  yaEstaba: boolean;
  vecesFunciono: number;
  vecesFallo: number;
  estado: EstadoManual;
};

/**
 * Un voto por orden: si la misma orden cambia de opinión, se corrige el
 * conteo en vez de sumar dos veces. «No funcionó» deja la solución
 * «Para revisar» (el administrador decide si la corrige o la archiva).
 */
export function aplicarVoto(
  e: Pick<EntradaManual, "estado" | "usos" | "vecesFunciono" | "vecesFallo">,
  v: { ordenCodigo: string; funciono: boolean; usuario: string; ahora: string },
): ResultadoVoto {
  const usos = parsearUsos(e.usos);
  const previo = usos.find((u) => u.orden === v.ordenCodigo);
  if (previo && previo.funciono === v.funciono) {
    return { campos: {}, pasaARevisar: false, yaEstaba: true, vecesFunciono: e.vecesFunciono, vecesFallo: e.vecesFallo, estado: e.estado };
  }
  let vecesFunciono = e.vecesFunciono;
  let vecesFallo = e.vecesFallo;
  if (previo) {
    if (previo.funciono) vecesFunciono = Math.max(0, vecesFunciono - 1);
    else vecesFallo = Math.max(0, vecesFallo - 1);
  }
  if (v.funciono) vecesFunciono += 1;
  else vecesFallo += 1;

  const nuevo: Uso = { orden: v.ordenCodigo, funciono: v.funciono, usuario: v.usuario, fecha: fechaCortaEc(v.ahora), origen: previo?.origen ?? false };
  const lineas = previo ? usos.map((u) => (u === previo ? nuevo : u)) : [...usos, nuevo];
  const estado: EstadoManual = !v.funciono && e.estado !== "Archivada" ? "Para revisar" : e.estado;
  const c = CAMPOS_MANUAL;
  return {
    campos: {
      [c.vecesFunciono]: vecesFunciono,
      [c.vecesFallo]: vecesFallo,
      [c.usos]: lineas.map(lineaDeUso).join("\n"),
      ...(estado !== e.estado ? { [c.estado]: estado } : {}),
    },
    pasaARevisar: estado === "Para revisar" && e.estado !== "Para revisar",
    yaEstaba: false,
    vecesFunciono,
    vecesFallo,
    estado,
  };
}

/** Lo que se anota en la nota interna de la orden al reusar una solución. */
export function textoNotaVoto(e: Pick<EntradaManual, "codigo" | "causa" | "marca" | "modelo" | "tipo" | "notas">, funciono: boolean): string {
  const de = e.causa ? ` (${e.causa.length > 60 ? `${e.causa.slice(0, 59)}…` : e.causa})` : "";
  return `Manual técnico ${e.codigo}${de}: ${funciono ? "funcionó" : "no funcionó"}.`;
}

// ─── Lo que hace el administrador ────────────────────────────────────────────

export type AccionManual = "verificar" | "corregir" | "archivar";

export function accionesPermitidas(esAdmin: boolean, e: Pick<EntradaManual, "estado">): AccionManual[] {
  if (!esAdmin) return [];
  const out: AccionManual[] = [];
  if (e.estado === "Probada" || e.estado === "Para revisar") out.push("verificar");
  out.push("corregir");
  if (e.estado !== "Archivada") out.push("archivar");
  return out;
}

export function camposVerificar(o: { usuario: string; ahora: string }): Record<string, unknown> {
  const c = CAMPOS_MANUAL;
  return { [c.estado]: "Verificada", [c.verificadoPor]: o.usuario, [c.fechaVerificacion]: o.ahora };
}

export function camposArchivar(): Record<string, unknown> {
  return { [CAMPOS_MANUAL.estado]: "Archivada" };
}

/** Solo las columnas que se pueden corregir a mano (nunca contadores ni usos). */
export function camposCorreccion(e: Pick<EntradaManual, "tipo">, cambios: Record<string, unknown>): Record<string, unknown> {
  const c = CAMPOS_MANUAL;
  if (e.tipo === "Solución") {
    const f = normalizarFicha(cambios);
    return {
      [c.marca]: f.marca, [c.modelo]: f.modelo, [c.sistema]: f.sistema, [c.sintoma]: f.sintoma,
      [c.causa]: f.causa, [c.solucion]: f.solucion.join("\n"), [c.noFunciono]: f.noFunciono,
    };
  }
  const tipo = typeof cambios.tipo === "string" && (TIPOS_NOTA as readonly string[]).includes(cambios.tipo) ? cambios.tipo : null;
  return {
    [c.notas]: corto(cambios.texto, 20000),
    [c.claves]: corto(cambios.claves, 300),
    ...(tipo ? { [c.tipo]: tipo } : {}),
  };
}

// ─── El borrador que arma la IA al pasar a Completado ────────────────────────

export type BorradorFicha = {
  proponer: boolean;
  /** Por qué sí o por qué no (una frase). */
  motivo: string;
  ficha: FichaSolucion;
  /** "Historial de Kevin (20 nov) y su chat con el técnico experto" */
  saleDe: string;
};

export function normalizarBorrador(json: Record<string, unknown> | null): BorradorFicha | null {
  if (!json) return null;
  const ficha = normalizarFicha(json);
  const proponer = json.proponer === true && errorFicha(ficha) === null;
  return {
    proponer,
    motivo: corto(json.motivo, 300),
    ficha,
    saleDe: corto(json.saleDe, 200),
  };
}

/**
 * ¿Hay algo que aprender de esta orden? Sin diagnóstico ni notas escritas
 * no se le pregunta a la IA (ahorra la llamada).
 */
export function hayMaterialParaFicha(o: { diagnostico: string; notas: readonly string[] }): boolean {
  const diag = o.diagnostico.trim();
  const diagUtil = diag.length >= 15 && !/^no disponible$/i.test(diag);
  return diagUtil || o.notas.some((n) => n.trim().length >= 25);
}

/** La tarjeta «Guardar en el Manual» aparece sola solo si la orden pasó a Completado hace poco. */
export const DIAS_PARA_PROPONER = 7;
