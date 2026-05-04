type LogDetails = Record<string, unknown>;

export function logAuthFlow(message: string, details?: LogDetails) {
  console.info(`[Auth ${new Date().toISOString()}] ${message}`, details || {});
}
