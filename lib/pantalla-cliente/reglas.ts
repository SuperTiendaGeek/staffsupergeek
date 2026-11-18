// Pantalla del cliente (etapa 10E-B, dueño 17-nov-2026) — reglas PURAS.
// Sin React ni servidor: las usan la ventana del monitor del mostrador, el
// botón de la barra superior (espejo) y "Cobrar en el mostrador".
//
// Cómo funciona (como la pantalla que mira al cliente en la caja de un
// supermercado):
//   - La ventana "Pantalla del cliente" se abre en el monitor pequeño del
//     mostrador (Mimo 10,1", 1280×800, táctil) y muestra SOLO lo que el
//     empleado le manda.
//   - Las ventanas del portal se hablan dentro de la misma computadora
//     (BroadcastChannel): el empleado manda COMANDOS; la pantalla responde con
//     su ESTADO y un latido cada 2 s (así el botón sabe si está conectada y
//     dibuja el espejo).
//   - Solo muestra información pública (la misma del enlace del cliente):
//     nunca costos de proveedor ni notas internas.
//   - Vuelve al reposo (logo) 30 s después del "¡Gracias!" o tras 3 minutos
//     sin nada nuevo (dueño, 17-nov; ajustable en Administrar más adelante).

import type { ParaPago } from "@/lib/pagos-en-linea/reglas";

export const CANAL_PANTALLA = "sg-pantalla-cliente";
export const NOMBRE_VENTANA = "sg-pantalla-cliente";
export const SEGUNDOS_GRACIAS = 30;
export const MINUTOS_SIN_ACTIVIDAD = 3;
export const SEGUNDOS_LATIDO = 2;
/** Sin latido por este tiempo, la pantalla se da por apagada. */
export const SEGUNDOS_SIN_LATIDO = 6;

export type OrigenCobro = "orden" | "pedido";

/** Lo que el cliente ve mientras paga en el mostrador (solo datos públicos). */
export type CobroEnPantalla = {
  origen: OrigenCobro;
  id: string;
  codigo: string;
  cliente: string;
  /** Equipo de la orden o producto del pedido. */
  detalle: string;
  lineas: Array<{ descripcion: string; monto: number; nota: string }>;
  total: number;
  pagado: number;
  falta: number;
  para: ParaPago;
  vasAPagar: number;
  /** Enlace del cliente con ?cobrar=… (lo que abre el QR). */
  url: string;
};

export type EstadoPantalla =
  | { vista: "reposo"; desde: number }
  | { vista: "cobro"; cobro: CobroEnPantalla; desde: number }
  | { vista: "gracias"; cobro: CobroEnPantalla; recibido: number; desde: number };

export type Comando =
  | { tipo: "mostrar_cobro"; cobro: CobroEnPantalla }
  | { tipo: "reposo" }
  | { tipo: "apagar" }
  | { tipo: "quien_esta" };

export type Mensaje =
  | { de: "portal"; comando: Comando }
  | { de: "pantalla"; estado: EstadoPantalla; en: number }
  /** La ventana se cierra (Apagar o la cerraron a mano): el botón lo sabe al instante. */
  | { de: "pantalla"; apagada: true };

export const reposo = (ahora: number): EstadoPantalla => ({ vista: "reposo", desde: ahora });

/** Aplica un comando del empleado. "apagar" y "quien_esta" no cambian lo que se ve. */
export function aplicarComando(e: EstadoPantalla, c: Comando, ahora: number): EstadoPantalla {
  if (c.tipo === "mostrar_cobro") return { vista: "cobro", cobro: c.cobro, desde: ahora };
  if (c.tipo === "reposo") return reposo(ahora);
  return e;
}

/**
 * El tiempo pasa: ¿vuelve al reposo? (se llama cada segundo). Los tiempos se
 * ajustan en Administrar → Pantalla del cliente (10E-C).
 */
export function alPasarElTiempo(
  e: EstadoPantalla,
  ahora: number,
  t: { segundosGracias: number; minutosSinActividad: number } = { segundosGracias: SEGUNDOS_GRACIAS, minutosSinActividad: MINUTOS_SIN_ACTIVIDAD },
): EstadoPantalla {
  if (e.vista === "gracias" && ahora - e.desde >= t.segundosGracias * 1000) return reposo(ahora);
  if (e.vista === "cobro" && ahora - e.desde >= t.minutosSinActividad * 60_000) return reposo(ahora);
  return e;
}

/**
 * La pantalla consulta la cuenta mientras cobra. Si lo pagado subió, el
 * cliente pagó (con tarjeta desde el QR, o en caja): "¡Gracias!" con lo que
 * entró. Ej.: pagado $105 → $145: recibimos $40.
 */
export function alLeerLaCuenta(e: EstadoPantalla, cuenta: { pagado: number; falta: number }, ahora: number): EstadoPantalla {
  if (e.vista !== "cobro") return e;
  const entro = r2(cuenta.pagado - e.cobro.pagado);
  if (entro <= 0.009) return e;
  return {
    vista: "gracias",
    cobro: { ...e.cobro, pagado: r2(cuenta.pagado), falta: r2(Math.max(0, cuenta.falta)) },
    recibido: entro,
    desde: ahora,
  };
}

/** ¿La pantalla está encendida? (latido reciente). */
export function pantallaConectada(ultimoLatido: number | null, ahora: number): boolean {
  return ultimoLatido != null && ahora - ultimoLatido <= SEGUNDOS_SIN_LATIDO * 1000;
}

// ─── El enlace que abre el QR ───────────────────────────────────────────────

const PARAS: readonly ParaPago[] = ["Confirmar", "Todo", "Lo que falta"];

/** Enlace del cliente que abre la cajita lista para pagar esa opción. */
export function urlConCobro(enlace: string, para: ParaPago): string {
  const u = new URL(enlace);
  u.searchParams.set("cobrar", para);
  return u.toString();
}

/** Lee ?cobrar= del enlace (null si no es una opción válida). */
export function cobrarDeLaUrl(search: string): ParaPago | null {
  const v = new URLSearchParams(search).get("cobrar");
  return v && (PARAS as readonly string[]).includes(v) ? (v as ParaPago) : null;
}

/** Mensaje de WhatsApp para pagar por enlace (sin datos internos). */
export function mensajeCobro(input: { nombre: string; codigo: string; monto: number; url: string }): string {
  const hola = input.nombre ? `Hola ${input.nombre.split(/\s+/)[0]}` : "Hola";
  return `${hola}, aquí puedes pagar ${usd(input.monto)} de tu ${input.codigo.startsWith("OR") ? "orden" : "pedido"} ${input.codigo} con tarjeta: ${input.url}`;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const usd = (n: number) => `$${r2(n).toFixed(2)}`;
