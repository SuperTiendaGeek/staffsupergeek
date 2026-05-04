export type AbandonmentLevel = "none" | "warning" | "critical";

export type AbandonmentStatus = {
  applies: boolean;
  level: AbandonmentLevel;
  daysWaiting: number | null;
  daysRemaining: number | null;
  referenceDate: string | null;
  label: string;
  message: string;
};

type HistoryLike = {
  estadoNuevo?: string | null;
  nota?: string | null;
  fecha?: string | null;
};

export type AbandonmentOrderInput = {
  estadoActual?: string | null;
  fechaIngreso?: string | null;
  ultimaModificacion?: string | null;
  historial?: HistoryLike[] | null;
};

const WAITING_STATE = "esperando respuesta";
const FINAL_STATES = new Set(["finalizado entregado", "enviado a reciclaje"]);
const WARNING_DAYS = 60;
const CRITICAL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const normalize = (value?: string | null) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isWaitingHistoryEntry = (item: HistoryLike) => {
  const text = normalize(`${item.estadoNuevo ?? ""} ${item.nota ?? ""}`);
  return (
    text.includes(WAITING_STATE) ||
    text.includes("espera") ||
    text.includes("respuesta") ||
    text.includes("confirmacion") ||
    text.includes("confirmar") ||
    text.includes("presupuesto")
  );
};

const getReferenceDate = (order: AbandonmentOrderInput): string | null => {
  const historyDates = (order.historial ?? [])
    .filter(isWaitingHistoryEntry)
    .map((item) => parseDate(item.fecha))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime());

  if (historyDates[0]) return historyDates[0].toISOString();

  const fallback =
    parseDate(order.ultimaModificacion)?.toISOString() ??
    parseDate(order.fechaIngreso)?.toISOString() ??
    null;

  return fallback;
};

export const getAbandonmentStatus = (
  order: AbandonmentOrderInput,
  now = new Date()
): AbandonmentStatus => {
  const estado = normalize(order.estadoActual);

  if (FINAL_STATES.has(estado) || estado !== WAITING_STATE) {
    return {
      applies: false,
      level: "none",
      daysWaiting: null,
      daysRemaining: null,
      referenceDate: null,
      label: "",
      message: "",
    };
  }

  const referenceDate = getReferenceDate(order);
  const parsedReference = parseDate(referenceDate);
  if (!parsedReference) {
    return {
      applies: true,
      level: "none",
      daysWaiting: null,
      daysRemaining: null,
      referenceDate: null,
      label: "",
      message: "",
    };
  }

  const daysWaiting = Math.max(
    0,
    Math.floor((now.getTime() - parsedReference.getTime()) / DAY_MS)
  );
  const daysRemaining = Math.max(0, CRITICAL_DAYS - daysWaiting);

  if (daysWaiting >= CRITICAL_DAYS) {
    return {
      applies: true,
      level: "critical",
      daysWaiting,
      daysRemaining: 0,
      referenceDate,
      label: "Cumple política de baja",
      message: `Esta orden lleva ${daysWaiting} días sin respuesta del cliente. Revisa el caso y, si corresponde, marca la orden como baja interna.`,
    };
  }

  if (daysWaiting >= WARNING_DAYS) {
    return {
      applies: true,
      level: "warning",
      daysWaiting,
      daysRemaining,
      referenceDate,
      label: "Próxima a baja",
      message: `Esta orden lleva ${daysWaiting} días esperando respuesta. Faltan ${daysRemaining} días para cumplir la política interna de baja.`,
    };
  }

  return {
    applies: true,
    level: "none",
    daysWaiting,
    daysRemaining,
    referenceDate,
    label: "",
    message: "",
  };
};
