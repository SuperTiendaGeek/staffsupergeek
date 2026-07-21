import "server-only";

// Fix [65] FECHA EMISIÓN EXTEMPORANEA (encontrado por el dueño probando en
// vivo la noche del 2026-07-20): la fecha de emisión se generaba con
// `new Date()` y se formateaba con getDate()/getMonth()/getFullYear(), que
// usan la zona horaria DEL SERVIDOR. Vercel corre en UTC — entre las 19:00
// y las 24:00 de Ecuador (UTC-5), el servidor ya está en el día siguiente,
// así que la factura salía con fecha de "mañana" y el SRI la devolvía por
// extemporánea. Todas las pruebas anteriores fueron de día, por eso el bug
// nunca se había manifestado.
//
// Este helper devuelve un Date cuyos componentes "locales" (getDate, etc.)
// corresponden a la hora civil actual de Ecuador (America/Guayaquil, UTC-5
// fijo, sin horario de verano), sin importar dónde corra el servidor. Todo
// lo derivado aguas abajo — clave de acceso (ddmmaaaa), <fechaEmision> del
// XML, carpeta AAAA/MM del respaldo, fecha del RIDE y del correo — queda
// consistente con la fecha fiscal real de la operación.

export function ahoraEnEcuador(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (tipo: string): number =>
    Number(parts.find((p) => p.type === tipo)?.value ?? 0);

  // Algunos motores devuelven "24" para medianoche con hour12:false.
  const hora = get("hour") === 24 ? 0 : get("hour");

  return new Date(get("year"), get("month") - 1, get("day"), hora, get("minute"), get("second"));
}
