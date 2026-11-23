// Formato de los mensajes al cliente para WhatsApp (pedido del dueño, 23-nov:
// «antes la IA de Airtable lo entregaba con saltos de línea»).
//
//   Hola, Ximena.
//
//   Le saludamos de SUPER GEEK. Sobre su laptop HP Pavilion G4 (orden OR000574): …
//
//   Como el presupuesto de reparación sería muy elevado, le recomendamos …
//
//   No hay valores pendientes de pago.
//
//   Gracias por su confianza.
//   SUPER GEEK
//
// La IA ya recibe la instrucción; esto lo asegura aunque devuelva un solo
// párrafo: saludo solo arriba, frases cortas pegadas a la siguiente, el
// agradecimiento y la firma al final en líneas propias. Puro, sin red.

const FIRMA = "SUPER GEEK";
const ABREVIATURA = /\b(Sr|Sra|Srta|Dr|Dra|Ing|Lic|Tec|Téc|Ab|Arq|No|Nro)\.$/i;
const SALUDO = /^(hola|buen[oa]?s?\s+(d[ií]as?|tardes|noches)|estimad[oa]s?)\b/i;
const GRACIAS = /^¡?\s*(muchas\s+)?gracias\b/i;

const palabras = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** Frases de un párrafo, sin cortar en «Sr.» ni en «$10.00». */
export function frases(texto: string): string[] {
  const trozos = texto.split(/(?<=[.!?…])\s+(?=[¡¿"«(A-ZÁÉÍÓÚÑ0-9])/);
  const out: string[] = [];
  for (const t of trozos) {
    const anterior = out[out.length - 1];
    if (anterior && ABREVIATURA.test(anterior)) out[out.length - 1] = `${anterior} ${t}`;
    else out.push(t);
  }
  return out.map((x) => x.trim()).filter(Boolean);
}

export function formatoWhatsApp(entrada: string): string {
  let t = (entrada ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!t) return "";

  // Firma al final, en su propia línea.
  const conFirma = new RegExp(`[\\s—–-]*${FIRMA}\\.?$`, "i");
  const tieneFirma = conFirma.test(t);
  if (tieneFirma) t = t.replace(conFirma, "").trim();

  // Si ya viene en párrafos, se respeta lo que escribió la IA o la persona.
  if (/\n\n/.test(t)) {
    if (!tieneFirma) return t;
    const ps = t.split("\n\n");
    const ultimo = ps[ps.length - 1];
    return GRACIAS.test(ultimo) && !ultimo.includes("\n") ? `${t}\n${FIRMA}` : `${t}\n\n${FIRMA}`;
  }

  const fs = frases(t.replace(/\n/g, " "));
  const saludo = fs.length > 1 && SALUDO.test(fs[0]) && palabras(fs[0]) <= 8 ? fs.shift()! : null;
  const cierre: string[] = [];
  while (fs.length > 1 && GRACIAS.test(fs[fs.length - 1])) cierre.unshift(fs.pop()!);

  // Una frase corta (menos de 8 palabras) va con la siguiente; la última queda sola.
  const parrafos: string[] = [];
  let actual = "";
  fs.forEach((f, i) => {
    actual = actual ? `${actual} ${f}` : f;
    if (palabras(f) >= 8 || i === fs.length - 1 || actual !== f) { parrafos.push(actual); actual = ""; }
  });
  if (actual) parrafos.push(actual);

  const final = [cierre.join(" "), tieneFirma ? FIRMA : ""].filter(Boolean).join("\n");
  return [saludo, ...parrafos, final].filter(Boolean).join("\n\n");
}
