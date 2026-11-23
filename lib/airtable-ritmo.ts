// Ritmo de las llamadas a Airtable (errores del personal, 23-nov-2026).
//
// Airtable acepta 5 llamadas por segundo por base; si se pasa responde 429
// («Rate limit exceeded») y pide esperar. La lista de órdenes abre a la vez la
// lista, el panel de cobros, las alertas y los repuestos: juntos se pasaban y
// el panel mostraba el error crudo.
//
// Aquí, UNA cola por instancia del servidor para todo lo que va a
// api.airtable.com (instrumentation.ts la instala al arrancar): como mucho 4
// llamadas por segundo, y si aun así llega un 429, espera y reintenta dos veces.
// Sin dependencias de Next: se prueba sola.

export const RITMO = { porSegundo: 4, rafaga: 4, esperas: [1500, 4000] } as const;

type Fetch = typeof fetch;
type Reloj = { ahora: () => number; dormir: (ms: number) => Promise<void> };

const relojReal: Reloj = { ahora: () => Date.now(), dormir: (ms) => new Promise((r) => setTimeout(r, ms)) };

export function esAirtable(entrada: unknown): boolean {
  try {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : (entrada as { url?: string })?.url ?? "";
    return new URL(url).hostname === "api.airtable.com";
  } catch {
    return false;
  }
}

/** Cubeta de fichas y límite de inicios en cada ventana de un segundo. */
export function crearTurnos(o: { porSegundo: number; rafaga: number }, reloj: Reloj = relojReal) {
  let fichas = o.rafaga;
  let ultimo = reloj.ahora();
  const recientes: number[] = [];
  return async function turno(): Promise<void> {
    for (;;) {
      const ahora = reloj.ahora();
      fichas = Math.min(o.rafaga, fichas + ((ahora - ultimo) / 1000) * o.porSegundo);
      ultimo = ahora;
      while (recientes.length && recientes[0] <= ahora - 1000) recientes.shift();
      const ventanaLlena = recientes.length >= o.porSegundo;
      if (fichas >= 1 && !ventanaLlena) {
        fichas -= 1;
        recientes.push(ahora);
        return;
      }
      const esperaFicha = Math.ceil(((1 - fichas) / o.porSegundo) * 1000);
      const esperaVentana = ventanaLlena ? recientes[0] + 1000 - ahora : 0;
      await reloj.dormir(Math.max(1, esperaFicha, esperaVentana));
    }
  };
}

/** Envuelve fetch: solo toca lo que va a api.airtable.com. */
export function conRitmo(original: Fetch, o: { porSegundo: number; rafaga: number; esperas: readonly number[] } = RITMO, reloj: Reloj = relojReal): Fetch {
  const turno = crearTurnos(o, reloj);
  const envuelto = async (entrada: Parameters<Fetch>[0], init?: Parameters<Fetch>[1]): Promise<Response> => {
    if (!esAirtable(entrada)) return original(entrada, init);
    // Un Request con cuerpo no se puede repetir: pasa con ritmo pero sin reintento.
    const repetible = !(typeof entrada === "object" && !(entrada instanceof URL) && (entrada as Request).body);
    for (let intento = 0; ; intento++) {
      await turno();
      const res = await original(entrada, init);
      if (res.status !== 429 || !repetible || intento >= o.esperas.length) return res;
      await reloj.dormir(o.esperas[intento]);
    }
  };
  return Object.assign(envuelto, { conRitmoAirtable: true }) as unknown as Fetch;
}

/** Una sola vez por instancia del servidor. */
export function instalarRitmoAirtable(): void {
  const actual = globalThis.fetch as Fetch & { conRitmoAirtable?: boolean };
  if (!actual || actual.conRitmoAirtable) return;
  globalThis.fetch = conRitmo(actual);
}
