// Ritmo de las llamadas a Airtable.
//
// 23-nov-2026 (errores del personal): Airtable acepta 5 llamadas por segundo por
// base; si se pasa responde 429 («Rate limit exceeded») y pide esperar 30 s. La
// lista de órdenes abre a la vez la lista, el panel de cobros, las alertas y los
// repuestos, y el panel mostraba el error crudo. Se puso UNA fila por instancia
// del servidor (4/s) y reintentos de 429 (1,5 s y 4 s).
//
// 24-nov-2026 (incidente de lentitud, docs/incidentes/2026-11-24-lentitud.md):
// con Fluid compute una instancia atiende a muchos usuarios a la vez y TODOS
// compartían esa fila. «Por comprar» hace unas 101 llamadas: con 34 pedidos en la
// misma instancia la espera pasó de 5 minutos y Vercel cortó 31 cargas.
// Quitar la fila del todo tampoco sirve: en el laboratorio (Airtable falsa con
// respuestas grabadas), sin fila 3 usuarios abriendo Órdenes a la vez ya reciben
// 429 y la pantalla falla. Lo que mejor salió:
//   - fila de 8 llamadas/s por instancia (no 4): la mitad de espera y sin 429
//     con una Airtable que tolera ráfagas, como la real (aguantó ~12/s sin 429);
//   - un tercer reintento a los 30 s, que es lo que Airtable pide tras un 429:
//     así un bloqueo se convierte en espera y no en error;
//   - lib/compartir-lectura.ts: si 30 personas abren «Por comprar» a la vez,
//     se lee UNA vez y todos reciben el mismo resultado.
// Interruptor: AIRTABLE_RITMO = llamadas por segundo de la fila (1 a 20; 4 = como
// el 23-nov) o 0 para quitarla. Sin la variable: 8. Hay que volver a desplegar.
// Cada instancia anota además una línea por minuto con llamadas, 429, reintentos
// y espera (en el plan Hobby los registros de Vercel duran menos de una hora).
//
// Sin dependencias de Next: se prueba sola (lib/__tests__/airtable-ritmo.test.ts).

export const RITMO = { porSegundo: 8, rafaga: 8, esperas: [1500, 4000, 30000] } as const;

/** AIRTABLE_RITMO: llamadas por segundo de la fila (1 a 20), 0 = sin fila. Sin variable o inválida: 8. */
export function leerRitmo(valor: string | undefined): { fila: boolean; porSegundo: number; aviso?: string } {
  if (valor === undefined || valor.trim() === "") return { fila: true, porSegundo: RITMO.porSegundo };
  const n = Number(valor.trim());
  if (n === 0) return { fila: false, porSegundo: 0 };
  if (Number.isInteger(n) && n >= 1 && n <= 20) return { fila: true, porSegundo: n };
  return { fila: true, porSegundo: RITMO.porSegundo, aviso: `AIRTABLE_RITMO="${valor}" no es válido (0 a 20); se usa ${RITMO.porSegundo}` };
}

// Cuántas escrituras a Airtable pasaron por esta instancia. lib/compartir-lectura.ts
// lo usa para no entregar una lectura que empezó ANTES de una escritura.
let escrituras = 0;
export function generacionEscrituras(): number {
  return escrituras;
}

export type OpcionesRitmo = {
  /** true = fila de `porSegundo` llamadas por instancia. */
  fila: boolean;
  porSegundo: number;
  rafaga: number;
  /** Esperas antes de cada reintento de un 429. */
  esperas: readonly number[];
};

type Fetch = typeof fetch;
type Reloj = { ahora: () => number; dormir: (ms: number) => Promise<void> };
type Aviso = (linea: string) => void;

const relojReal: Reloj = { ahora: () => Date.now(), dormir: (ms) => new Promise((r) => setTimeout(r, ms)) };
const avisoReal: Aviso = (linea) => console.log(linea);
const UN_MINUTO = 60_000;

function urlDe(entrada: unknown): string {
  return typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : (entrada as { url?: string })?.url ?? "";
}

export function esAirtable(entrada: unknown): boolean {
  try {
    return new URL(urlDe(entrada)).hostname === "api.airtable.com";
  } catch {
    return false;
  }
}

function metodoDe(entrada: unknown, init?: RequestInit): string {
  return (init?.method || (typeof entrada === "object" && !(entrada instanceof URL) ? (entrada as Request).method : "") || "GET").toUpperCase();
}

/** Leer = GET, o POST a …/listRecords (lectura con fórmula larga). Todo lo demás escribe. */
function esEscritura(entrada: unknown, init?: RequestInit): boolean {
  const metodo = metodoDe(entrada, init);
  if (metodo === "GET" || metodo === "HEAD") return false;
  try {
    return !(metodo === "POST" && new URL(urlDe(entrada)).pathname.endsWith("/listRecords"));
  } catch {
    return true;
  }
}

/** Solo método y tabla: nunca la consulta (puede llevar datos de clientes). */
function destino(entrada: unknown, init?: RequestInit): string {
  const metodo = metodoDe(entrada, init);
  try {
    return `${metodo} ${decodeURIComponent(new URL(urlDe(entrada)).pathname)}`;
  } catch {
    return metodo;
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

/** Lo que una instancia anota cada minuto (solo si hubo llamadas). */
export function crearContadores(reloj: Reloj, aviso: Aviso, fila: string) {
  let desde = reloj.ahora();
  let c = { llamadas: 0, r429: 0, reintentos: 0, agotados: 0, esperaMaxMs: 0, aLaVezMax: 0 };
  let enVuelo = 0;
  const vaciar = () => {
    const ahora = reloj.ahora();
    if (ahora - desde < UN_MINUTO) return;
    if (c.llamadas > 0) {
      aviso(
        `[airtable] último minuto (${fila}): ${c.llamadas} llamadas · ${c.r429} respuestas 429 · ` +
          `${c.reintentos} reintentos · ${c.agotados} sin éxito · espera máx. en fila ${c.esperaMaxMs} ms · ${c.aLaVezMax} a la vez como máximo`,
      );
    }
    desde = ahora;
    c = { llamadas: 0, r429: 0, reintentos: 0, agotados: 0, esperaMaxMs: 0, aLaVezMax: 0 };
  };
  return {
    entra() { c.llamadas++; enVuelo++; c.aLaVezMax = Math.max(c.aLaVezMax, enVuelo); },
    sale() { enVuelo--; vaciar(); },
    espera(ms: number) { c.esperaMaxMs = Math.max(c.esperaMaxMs, Math.round(ms)); },
    r429() { c.r429++; },
    reintento() { c.reintentos++; },
    agotado(que: string, reintentos: number) {
      c.agotados++;
      aviso(`[airtable] 429 sin éxito después de ${reintentos} reintento(s): ${que}`);
    },
  };
}

/** Envuelve fetch: solo toca lo que va a api.airtable.com. */
export function conRitmo(original: Fetch, o: OpcionesRitmo, reloj: Reloj = relojReal, aviso: Aviso = avisoReal): Fetch {
  const turno = o.fila ? crearTurnos(o, reloj) : null;
  const cuenta = crearContadores(reloj, aviso, o.fila ? `fila ${o.porSegundo}/s` : "sin fila");
  const envuelto = async (entrada: Parameters<Fetch>[0], init?: Parameters<Fetch>[1]): Promise<Response> => {
    if (!esAirtable(entrada)) return original(entrada, init);
    if (esEscritura(entrada, init)) escrituras++;
    // Un Request con cuerpo no se puede repetir: pasa (con fila si está encendida) pero sin reintento.
    const repetible = !(typeof entrada === "object" && !(entrada instanceof URL) && (entrada as Request).body);
    for (let intento = 0; ; intento++) {
      if (turno) {
        const antes = reloj.ahora();
        await turno();
        cuenta.espera(reloj.ahora() - antes);
      }
      cuenta.entra();
      let res: Response;
      try {
        res = await original(entrada, init);
      } finally {
        cuenta.sale();
      }
      if (res.status !== 429) return res;
      cuenta.r429();
      if (!repetible || intento >= o.esperas.length) {
        cuenta.agotado(destino(entrada, init), intento);
        return res;
      }
      cuenta.reintento();
      await reloj.dormir(o.esperas[intento]);
    }
  };
  return Object.assign(envuelto, { conRitmoAirtable: true }) as unknown as Fetch;
}

/** Una sola vez por instancia del servidor. */
export function instalarRitmoAirtable(env: Record<string, string | undefined> = process.env): void {
  const actual = globalThis.fetch as Fetch & { conRitmoAirtable?: boolean };
  if (!actual || actual.conRitmoAirtable) return;
  const r = leerRitmo(env.AIRTABLE_RITMO);
  if (r.aviso) console.warn(`[airtable] ${r.aviso}`);
  globalThis.fetch = conRitmo(actual, { ...RITMO, fila: r.fila, porSegundo: r.porSegundo || RITMO.porSegundo, rafaga: r.porSegundo || RITMO.rafaga });
  console.log(`[airtable] ritmo instalado: ${r.fila ? `fila de ${r.porSegundo} llamadas/s por instancia` : "sin fila"}; reintentos de 429 a los 1,5 s, 4 s y 30 s`);
}
