// Achica una foto en el navegador antes de subirla (auditoría ops, 14-nov-2026).
// Una foto de celular pesa 4–8 MB; el servidor acepta ~3 MB por foto y el enlace
// del cliente debe cargar rápido. Se reduce a 1600 px de lado mayor, JPEG.
// Solo corre en el navegador.

const LADO_MAX = 1600;

export async function achicarFoto(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/")) throw new Error("Solo se aceptan fotos.");
  try {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * escala));
    const h = Math.max(1, Math.round(bmp.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin canvas");
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    if (!blob) throw new Error("sin blob");
    const nombre = archivo.name.replace(/\.[a-z0-9]+$/i, "") || "foto";
    return new File([blob], `${nombre}.jpg`, { type: "image/jpeg" });
  } catch {
    // Formato que el navegador no sabe abrir (p. ej. HEIC en PC): se sube tal cual si es JPG/PNG/WebP.
    if (["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) return archivo;
    throw new Error("No pude leer esa foto. Usa una JPG o PNG.");
  }
}
