// Fotos de una opción de cotización (auditoría ops, 14-nov-2026) — regla PURA.
// Con prueba en __tests__/fotos.test.ts.
//
// Decisión del dueño (14-nov): cada opción del pedido puede llevar hasta 6
// fotos; el cliente las ve en miniatura en su enlace y las abre en una
// sub-pantalla con galería. Se guardan en el campo "Fotos" (adjuntos) de la
// línea de "Presupuesto por Orden".
//
// Ejemplo: Laptop Dell G3 usada → el empleado sube 4 fotos (tapa, teclado,
// pantalla, puertos); el cliente ve 4 miniaturas y toca cualquiera para ampliar.

export const MAX_FOTOS_OPCION = 6;
/** Lo que se acepta al subir (el navegador las achica a ~1600 px antes). */
export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"] as const;
/** Tope por foto ya achicada (el cuerpo de una función no pasa de ~4,5 MB). */
export const MAX_BYTES_FOTO = 3_000_000;

export type FotoOpcion = {
  id: string;
  /** Original (para abrirla grande). */
  url: string;
  /** Miniatura chica para la tira. */
  miniatura: string;
  /** Tamaño intermedio para la galería (carga rápido en celular). */
  grande: string;
  nombre: string;
};

type Adjunto = {
  id?: unknown; url?: unknown; filename?: unknown;
  thumbnails?: { small?: { url?: unknown }; large?: { url?: unknown }; full?: { url?: unknown } };
};

const txt = (v: unknown): string => (typeof v === "string" ? v : "");

/** Adjuntos de Airtable → fotos (descarta lo que no tenga id o url). */
export function fotosDeAdjuntos(v: unknown): FotoOpcion[] {
  if (!Array.isArray(v)) return [];
  const out: FotoOpcion[] = [];
  for (const a of v as Adjunto[]) {
    if (!a || typeof a !== "object") continue;
    const id = txt(a.id), url = txt(a.url);
    if (!id || !url) continue;
    const t = a.thumbnails ?? {};
    out.push({
      id, url,
      miniatura: txt(t.small?.url) || txt(t.large?.url) || url,
      grande: txt(t.large?.url) || txt(t.full?.url) || url,
      nombre: txt(a.filename) || "foto",
    });
  }
  return out;
}

/** ¿Se puede subir esta foto? null = sí. */
export function errorDeFoto(input: { tipo: string; bytes: number; yaHay: number }): string | null {
  if (!(TIPOS_FOTO as readonly string[]).includes(input.tipo)) return "Solo se aceptan fotos JPG, PNG o WebP.";
  if (input.bytes <= 0) return "La foto está vacía.";
  if (input.bytes > MAX_BYTES_FOTO) return "La foto pesa demasiado. Prueba con otra o más pequeña.";
  if (input.yaHay >= MAX_FOTOS_OPCION) return `Máximo ${MAX_FOTOS_OPCION} fotos por opción.`;
  return null;
}

/** Fotos que quedan al quitar una (ids para devolverle a Airtable). */
export function idsSinFoto(fotos: readonly FotoOpcion[], quitarId: string): string[] {
  return fotos.filter((f) => f.id !== quitarId).map((f) => f.id);
}

/** Nombre de archivo seguro para Airtable. */
export function nombreSeguro(nombre: string, tipo: string): string {
  const ext = tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
  const base = nombre.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w\-]+/g, "_").slice(0, 60) || "foto";
  return `${base}.${ext}`;
}
