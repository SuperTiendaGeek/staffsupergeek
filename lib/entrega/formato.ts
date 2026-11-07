// Fecha y hora de la entrega para los comprobantes (hora de Ecuador). PURO.

export function fechaHoraEntrega(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - 5 * 3600_000); // Ecuador, UTC-5 sin horario de verano
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
