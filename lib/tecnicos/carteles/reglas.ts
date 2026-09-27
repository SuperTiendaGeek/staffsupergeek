// Carteles de consentimiento — reglas PURAS (sin Airtable).
//
// Un servicio del catálogo puede llevar un "cartel": lo que el cliente debe
// leer y aceptar ANTES de que su aprobación cuente: qué alcance tiene el
// trabajo, qué queda fuera y qué pasa con sus archivos.
// El texto NO vive en el código: se edita en /tecnicos/catalogo-servicios y se
// guarda en la tabla "Catálogo Servicios" (campos "Cartel …").
//
// Además hay avisos generales de la orden (tabla "Alertas Generales"), que se
// aceptan una sola vez al enviar la respuesta — por ejemplo el retiro del
// equipo a los 3 meses.
//
// Lo aceptado se guarda COMPLETO en la respuesta firmada: si mañana el texto
// cambia, la constancia conserva lo que el cliente leyó ese día.

export const CARTEL_BOTON_DEFECTO = "Acepto y autorizo";
export const CARTEL_TITULO_MAX = 120;
export const CARTEL_TEXTO_MAX = 4000;

export type CartelServicio = {
  servicioId: string;
  servicioNombre: string;
  activo: boolean;
  titulo: string;
  intro: string;
  /** Viñetas: "Qué sí incluye". */
  incluye: string[];
  /** Viñetas: "Qué no incluye". */
  noIncluye: string[];
  /** Viñetas: "Ten en cuenta" (riesgos, plazos, manejo de la información). */
  avisos: string[];
  /** Lo que el cliente acepta al pulsar el botón. */
  consentimiento: string;
  textoBoton: string;
};

export type AlertaGeneral = {
  id: string;
  titulo: string;
  contenido: string;
  textoCasilla: string;
  activa: boolean;
  orden: number;
};

export function lineas(texto: string): string[] {
  return (texto ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-•·*]\s*/, "").trim())
    .filter(Boolean);
}

export function cartelVacio(servicioId: string, servicioNombre = ""): CartelServicio {
  return { servicioId, servicioNombre, activo: false, titulo: "", intro: "", incluye: [], noIncluye: [], avisos: [], consentimiento: "", textoBoton: "" };
}

/** ¿Este servicio muestra cartel al cliente? */
export function cartelVisible(c: CartelServicio | undefined | null): c is CartelServicio {
  if (!c || !c.activo) return false;
  return !!c.consentimiento.trim() && !!c.titulo.trim();
}

export function validarCartel(c: CartelServicio): string | null {
  if (!c.activo) return null; // guardar un borrador desactivado siempre se permite
  if (c.titulo.trim().length < 3) return "El cartel necesita un título.";
  if (c.titulo.length > CARTEL_TITULO_MAX) return `El título admite hasta ${CARTEL_TITULO_MAX} caracteres.`;
  if (c.consentimiento.trim().length < 20) return "Falta el texto de consentimiento: es lo que el cliente acepta.";
  if (c.incluye.length === 0 && c.noIncluye.length === 0 && c.avisos.length === 0 && !c.intro.trim()) {
    return "Agrega al menos qué incluye, qué no incluye o un aviso; si no, el cartel no explica nada.";
  }
  const largo = [c.intro, c.consentimiento, ...c.incluye, ...c.noIncluye, ...c.avisos].join("\n");
  if (largo.length > CARTEL_TEXTO_MAX) return `El cartel completo admite hasta ${CARTEL_TEXTO_MAX} caracteres.`;
  return null;
}

export function botonDe(c: CartelServicio): string {
  return c.textoBoton.trim() || CARTEL_BOTON_DEFECTO;
}

// ─── Huellas ────────────────────────────────────────────────────────────────
// Igual que en el presupuesto: si el texto cambia, la aceptación anterior deja
// de valer y el cliente lo vuelve a leer.

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

function huella(partes: string[]): string {
  const canon = partes.map((p) => (p ?? "").trim().replace(/\s+/g, " ")).join("|");
  return `c1-${fnv1a(canon)}-${fnv1a([...canon].reverse().join(""))}`;
}

export function huellaCartel(c: CartelServicio): string {
  return huella([c.titulo, c.intro, ...c.incluye, "//", ...c.noIncluye, "//", ...c.avisos, c.consentimiento, botonDe(c)]);
}

export function huellaAlerta(a: AlertaGeneral): string {
  return huella([a.titulo, a.contenido, a.textoCasilla]);
}

/** Texto plano del cartel: lo que se guarda como constancia y sale en el PDF. */
export function textoCompletoCartel(c: CartelServicio): string {
  const bloque = (titulo: string, items: string[]) => (items.length ? `${titulo}\n${items.map((i) => `• ${i}`).join("\n")}` : "");
  return [
    c.titulo,
    c.intro.trim(),
    bloque("Qué sí incluye:", c.incluye),
    bloque("Qué no incluye:", c.noIncluye),
    bloque("Ten en cuenta:", c.avisos),
    c.consentimiento.trim(),
  ].filter(Boolean).join("\n\n");
}

export function textoCompletoAlerta(a: AlertaGeneral): string {
  return [a.titulo, a.contenido.trim()].filter(Boolean).join("\n\n");
}

// ─── Lo que viaja al cliente y lo que vuelve firmado ─────────────────────────

/** Cartel tal como lo ve el cliente en el enlace (sin datos internos). */
export type CartelPublico = {
  titulo: string; intro: string; incluye: string[]; noIncluye: string[]; avisos: string[];
  consentimiento: string; boton: string; huella: string;
};

export function aPublico(c: CartelServicio): CartelPublico {
  return {
    titulo: c.titulo, intro: c.intro, incluye: c.incluye, noIncluye: c.noIncluye, avisos: c.avisos,
    consentimiento: c.consentimiento, boton: botonDe(c), huella: huellaCartel(c),
  };
}

export type AlertaPublica = { id: string; titulo: string; contenido: string; casilla: string; huella: string };

export function alertaAPublica(a: AlertaGeneral): AlertaPublica {
  return { id: a.id, titulo: a.titulo, contenido: a.contenido, casilla: a.textoCasilla.trim() || a.titulo, huella: huellaAlerta(a) };
}

export type Aceptacion = { clave: string; huella: string };

export type RequisitosConsentimiento = {
  /** lineaId → huella del cartel que debe aceptar para aprobar esa línea. */
  porLinea: Map<string, string>;
  /** Avisos de la orden que se aceptan al enviar. */
  generales: AlertaPublica[];
};

export type FaltaConsentimiento =
  | { tipo: "linea"; lineaId: string; motivo: string }
  | { tipo: "general"; id: string; motivo: string };

/**
 * Revisa que todo lo que se está aprobando traiga su aceptación, con la huella
 * del texto que el cliente vio. Si el taller cambió el texto mientras tanto,
 * la huella no coincide y hay que volver a leerlo.
 */
export function faltantesDeConsentimiento(
  aprobadas: string[],
  req: RequisitosConsentimiento,
  aceptadas: Aceptacion[],
  hayCambios: boolean
): FaltaConsentimiento[] {
  const mapa = new Map(aceptadas.map((a) => [a.clave, a.huella]));
  const faltan: FaltaConsentimiento[] = [];
  for (const lineaId of aprobadas) {
    const esperada = req.porLinea.get(lineaId);
    if (!esperada) continue;
    const dada = mapa.get(lineaId);
    if (!dada) faltan.push({ tipo: "linea", lineaId, motivo: "Falta aceptar las condiciones de este servicio." });
    else if (dada !== esperada) faltan.push({ tipo: "linea", lineaId, motivo: "Las condiciones de este servicio cambiaron: vuelve a leerlas." });
  }
  if (hayCambios) {
    for (const a of req.generales) {
      const dada = mapa.get(`general:${a.id}`);
      if (!dada) faltan.push({ tipo: "general", id: a.id, motivo: `Falta aceptar: ${a.titulo}` });
      else if (dada !== a.huella) faltan.push({ tipo: "general", id: a.id, motivo: `El aviso "${a.titulo}" cambió: vuelve a leerlo.` });
    }
  }
  return faltan;
}
