// ✨ Sugerir con IA (punto 10d-3). Solo arma el pedido y limpia la respuesta;
// la llamada a Claude vive en ia-anuncios-servidor.ts (necesita la clave).
//
// Decisión del dueño (18-oct): Claude Sonnet 5.5, esfuerzo bajo; el modelo es
// un ajuste (ANTHROPIC_MODELO_ANUNCIOS en Vercel) que se cambia sin programar.

import {
  TITULO_MAX,
  accesoriosAnuncio,
  bateriaAnuncio,
  type AlcancePublicacion,
  type CanalPublicacion,
  type DatosUnidadAnuncio,
} from "./publicaciones";

export const MODELO_ANUNCIOS_POR_DEFECTO = "claude-sonnet-5-5";

export type QueSugerir = "presentacion" | "titulo";

export type PedidoSugerencia = {
  que: QueSugerir;
  canal: CanalPublicacion;
  alcance: AlcancePublicacion;
  unidades: DatosUnidadAnuncio[];
  /** Título armado por la plantilla: referencia de qué datos van y en qué orden. */
  tituloPlantilla?: string;
  /** Lo que ya está escrito (para mejorarlo en vez de empezar de cero). */
  actual?: string;
};

const SISTEMA = [
  "Eres el redactor de anuncios de SUPER GEEK, una tienda de tecnología usada con garantía en Otavalo, Ecuador.",
  "Escribes en español neutro de Ecuador, claro y vendedor, sin exagerar.",
  "Usa SOLO los datos que te doy: nunca inventes especificaciones, estados, accesorios, precios ni garantías.",
  "Responde únicamente con el texto pedido, sin comillas, sin títulos, sin explicaciones.",
].join(" ");

function lineaDatos(etiqueta: string, valor?: string | null) {
  const v = String(valor ?? "").trim();
  return v ? `- ${etiqueta}: ${v}` : "";
}

/** Los datos del equipo en texto, sin precio (no va en la presentación ni en el título). */
export function datosParaIa(unidades: DatosUnidadAnuncio[], alcance: AlcancePublicacion): string {
  const u = unidades[0];
  if (!u) return "";
  const accesorios = alcance === "Unidad" ? (u.accesorios ?? []) : accesoriosAnuncio(unidades);
  return [
    lineaDatos("Categoría", u.categoria),
    lineaDatos("Producto", u.nombre),
    lineaDatos("Marca", u.marca),
    lineaDatos("Modelo", u.modelo),
    lineaDatos("Condición", u.condicion),
    lineaDatos("Pantalla", u.pantalla),
    lineaDatos("Procesador", u.procesador),
    lineaDatos("Gráficos", u.graficos),
    lineaDatos("RAM", u.ram),
    lineaDatos("Almacenamiento", u.disco),
    lineaDatos("Conectividad", u.conectividad),
    lineaDatos("Características", u.caracteristicas),
    lineaDatos("Sistema operativo", u.sistema),
    lineaDatos("Detalles", u.especificaciones),
    lineaDatos("Batería", bateriaAnuncio(unidades, alcance)),
    lineaDatos("Accesorios incluidos", accesorios.join(", ")),
  ].filter(Boolean).join("\n");
}

const EJEMPLO_PRESENTACION =
  "Dell Latitude 7420 – Laptop empresarial premium, ideal para quienes buscan portabilidad, excelente pantalla y buen rendimiento.\n" +
  "Equipo moderno con pantalla 4K UHD, procesador Intel Core i7 de 11ª generación, 16GB RAM y SSD NVMe de 512GB, perfecto para oficina, estudio, administración, videollamadas, trabajo remoto y multitarea profesional.";

/** El pedido para Claude: instrucciones del sistema y el mensaje. */
export function construirPedido(p: PedidoSugerencia): { sistema: string; mensaje: string; maxTokens: number } {
  const datos = datosParaIa(p.unidades, p.alcance);
  const actual = String(p.actual ?? "").trim();
  if (p.que === "presentacion") {
    return {
      sistema: SISTEMA,
      maxTokens: 400,
      mensaje: [
        "Escribe la PRESENTACIÓN del anuncio: 2 párrafos cortos en dos líneas seguidas, sin línea en blanco entre ellos (máximo 450 caracteres en total).",
        "Párrafo 1: marca y modelo, qué tipo de equipo es y para quién es ideal.",
        "Párrafo 2: lo más atractivo de sus especificaciones y para qué usos sirve.",
        "Sin emojis, sin precio, sin datos de contacto, sin hablar de la garantía (eso ya va en el anuncio).",
        p.canal === "Mercado Libre" ? "Es para Mercado Libre: tono sobrio, sin signos de exclamación." : "",
        "",
        "Ejemplo del estilo de la tienda (otro equipo):",
        EJEMPLO_PRESENTACION,
        "",
        "Datos del equipo:",
        datos,
        actual ? `\nTexto actual (mejóralo, conserva lo que esté bien):\n${actual}` : "",
      ].filter((l) => l !== "").join("\n"),
    };
  }
  const maximo = TITULO_MAX[p.canal];
  return {
    sistema: SISTEMA,
    maxTokens: 120,
    mensaje: [
      `Escribe el TÍTULO del anuncio para ${p.canal}, en una sola línea y de máximo ${maximo} caracteres (cuenta los espacios).`,
      "Empieza por la categoría, marca y modelo; después los datos que más buscan los compradores (pantalla, procesador, RAM, almacenamiento).",
      p.canal === "Mercado Libre"
        ? "Mercado Libre: sin emojis, sin comillas, sin palabras como 'oferta' o 'garantía', sin signos de exclamación."
        : "Sin emojis ni signos de exclamación.",
      p.tituloPlantilla ? `Título armado por la plantilla (referencia de orden y datos): ${p.tituloPlantilla}` : "",
      "",
      "Datos del equipo:",
      datos,
      actual ? `\nTítulo actual: ${actual}` : "",
    ].filter((l) => l !== "").join("\n"),
  };
}

/** Limpia la respuesta: sin comillas envolventes ni prefijos; el título en una línea. */
export function limpiarSugerencia(texto: string, que: QueSugerir): string {
  let t = String(texto ?? "").replace(/\r\n/g, "\n").trim();
  t = t.replace(/^(t[ií]tulo|presentaci[oó]n)\s*:\s*/i, "");
  // Comillas que envuelven TODO el texto (no la de pulgadas al final: 14").
  const envuelto = /^["“«]([\s\S]*)["”»]$/.exec(t);
  if (envuelto) t = envuelto[1].trim();
  if (que === "titulo") t = t.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  // Párrafos en líneas seguidas, como en los anuncios de la tienda (sin línea en blanco).
  else t = t.replace(/\n\s*\n+/g, "\n");
  return t.trim();
}
