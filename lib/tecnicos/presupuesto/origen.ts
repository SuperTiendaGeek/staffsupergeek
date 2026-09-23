// Origen público del portal para armar el enlace del cliente. Se toma de la
// petición (en Vercel es https://staff.supertiendageek.com); PORTAL_PUBLIC_URL
// lo fuerza si hiciera falta (p. ej. detrás de otro proxy).
export function origenPublico(request: Request): string {
  const forzado = process.env.PORTAL_PUBLIC_URL?.trim();
  if (forzado) return forzado.replace(/\/$/, "");
  const u = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? u.host;
  const proto = request.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}
