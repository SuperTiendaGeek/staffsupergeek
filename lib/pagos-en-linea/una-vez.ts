// "Un solo abono por pago" (etapa D2, 26-nov-2026; revisión de Codex punto 3).
//
// Problema: el aviso de DeUna, la consulta del cliente y la conciliación
// automática pueden llegar al MISMO pago a la vez y en computadoras distintas
// de Vercel. Un candado en memoria no alcanza, y anular un duplicado después
// tampoco (el efecto ya ocurrió).
//
// Solución (como una "reserva" en la ventanilla): antes de registrar el abono,
// se crea un archivo con el número del pago en un almacén que NO permite crear
// dos veces el mismo archivo (Vercel Blob, escritura "solo si no existe" y
// reemplazo "solo si nadie lo cambió" con ETag). Solo quien crea la reserva
// registra el abono; los demás esperan su turno.
//
// Cortes (se cae la computadora a mitad de camino):
//   · después de reservar y antes del abono → la reserva queda "en curso";
//     pasados 5 minutos otro la toma (reemplazo condicional: solo uno gana),
//     busca el abono (no existe) y lo registra;
//   · después del abono y antes de marcar "hecho" → quien la tome encuentra el
//     abono por su número y NO crea otro;
//   · después de marcar "hecho" → todos ven "hecho" y usan ese abono.
// Una función de Vercel no vive más de 5 minutos (maxDuration ≤ 120 s): quien
// tomó la reserva siempre terminó o murió antes de que otro la retome.
//
// Sin almacén (Blob caído) NO se registra nada: el pago queda "Aprobado" y la
// conciliación lo reintenta. Nunca hay abono sin reserva.
//
// Puro: el almacén y el abono se inyectan. Prueba en __tests__/una-vez.test.ts
// (concurrencia y cortes en cada paso).

export const MINUTOS_RESERVA_VENCIDA = 5;

export type Reserva = {
  /** Código PL de quien la tomó. */
  codigo: string;
  /** Único por intento (para reconocer la propia reserva si se reintenta la escritura). */
  ficha: string;
  estado: "en_curso" | "hecho";
  abonoId?: string;
  desde: string;
};

export interface AlmacenReservas {
  /** Crea solo si no existe. "existe" si otro ya la tiene. */
  crear(clave: string, valor: Reserva): Promise<{ estado: "creada"; etag: string } | { estado: "existe" }>;
  leer(clave: string): Promise<{ valor: Reserva; etag: string } | null>;
  /** Reemplaza solo si sigue igual (mismo ETag). "cambio" si alguien la tocó. */
  reemplazar(clave: string, valor: Reserva, etag: string): Promise<{ estado: "ok"; etag: string } | { estado: "cambio" }>;
}

export type ResultadoUnaVez =
  | { tipo: "registrado"; abonoId: string; nuevo: boolean }
  /** Otro lo está registrando ahora: no se hace nada (se reintenta luego). */
  | { tipo: "ocupado" };

export async function registrarUnaVez(input: {
  clave: string;
  codigo: string;
  almacen: AlmacenReservas;
  /** Abono ya registrado con este número de pago (a mano o por otro), o null. */
  buscarAbono: () => Promise<string | null>;
  /** Registra el abono y devuelve su id. Solo se llama con la reserva tomada. */
  crearAbono: () => Promise<string>;
  ahora?: () => Date;
  ficha?: string;
}): Promise<ResultadoUnaVez> {
  const ahora = input.ahora ?? (() => new Date());
  const ficha = input.ficha ?? `${input.codigo}:${Math.random().toString(36).slice(2)}:${Date.now()}`;
  const enCurso = (): Reserva => ({ codigo: input.codigo, ficha, estado: "en_curso", desde: ahora().toISOString() });

  // 1. Tomar la reserva (o ver quién la tiene).
  let etag: string;
  const creada = await input.almacen.crear(input.clave, enCurso());
  if (creada.estado === "creada") {
    etag = creada.etag;
  } else {
    const actual = await input.almacen.leer(input.clave);
    if (!actual) return { tipo: "ocupado" };
    if (actual.valor.estado === "hecho" && actual.valor.abonoId) {
      return { tipo: "registrado", abonoId: actual.valor.abonoId, nuevo: false };
    }
    if (actual.valor.ficha === ficha) {
      etag = actual.etag; // la escritura anterior era nuestra (reintento de red)
    } else {
      const edadMin = (ahora().getTime() - Date.parse(actual.valor.desde)) / 60_000;
      if (!(edadMin >= MINUTOS_RESERVA_VENCIDA)) return { tipo: "ocupado" };
      // Quien la tenía se cayó: se retoma, pero solo uno puede (ETag).
      const tomada = await input.almacen.reemplazar(input.clave, enCurso(), actual.etag);
      if (tomada.estado === "cambio") return { tipo: "ocupado" };
      etag = tomada.etag;
    }
  }

  // 2. Con la reserva: ¿ya hay abono? (se cayó después de registrarlo, o se registró a mano).
  const existente = await input.buscarAbono();
  const abonoId = existente ?? (await input.crearAbono());

  // 3. Marcar "hecho". Si falla, la próxima vez se encuentra el abono en el paso 2.
  await input.almacen.reemplazar(input.clave, { codigo: input.codigo, ficha, estado: "hecho", abonoId, desde: ahora().toISOString() }, etag)
    .catch(() => undefined);
  return { tipo: "registrado", abonoId, nuevo: !existente };
}

/** Nombre del archivo de la reserva: sin datos del cliente (solo una huella del número). */
export function claveReserva(pasarela: string, ambiente: string, numero: string, huella: (s: string) => string): string {
  const amb = ambiente === "Prueba" ? "qa" : "prod";
  return `pagos-en-linea/reservas/${pasarela.toLowerCase()}-${amb}/${huella(numero.trim())}.json`;
}
