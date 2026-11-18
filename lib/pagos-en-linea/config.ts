import "server-only";

// Configuración de cada pasarela de la caja de cobro — UN SOLO PUNTO de
// lectura (punto 23 / 10D, 17-nov-2026).
//
// Hoy se lee de las variables del servidor. Próximo trabajo (dueño, 17-nov):
// Administrar → "Pagos en línea" para cambiar credenciales, ambiente y
// encender/apagar cada pasarela sin tocar código. Cuando exista, SOLO cambia
// esta función.
//
// Variables (los valores nunca se imprimen ni se guardan en el repo):
//   PAYPHONE_ACTIVO=1            enciende el botón (0 o vacío = apagado)
//   PAYPHONE_TOKEN, PAYPHONE_STORE_ID
//   PAYPHONE_AMBIENTE=Prueba     Prueba | Producción (por defecto Prueba)
//   PAYPHONE_PEDIDOS_PRUEBA=OP-2026-000150,OP-2026-000151
//       En Prueba, el botón SOLO aparece en estos pedidos: un cliente real
//       nunca ve una cajita de prueba. En Prueba no se crean movimientos en
//       Finanzas y el abono queda marcado "PRUEBA".

import type { Ambiente, Pasarela } from "./reglas";

// DeUna (etapa D, 18-nov-2026). Credenciales SOLO de producción (DeUna no dio
// ambiente de pruebas): no existe "Prueba" para DeUna. Para la primera prueba
// real del dueño se limita a ciertas cuentas con DEUNA_SOLO_EN.
//   DEUNA_ACTIVO=1                 enciende el botón (0 o vacío = apagado)
//   DEUNA_API_KEY, DEUNA_API_SECRET
//   DEUNA_POINT_OF_SALE=399118     la caja (dato de DeUna; no es secreto)
//   DEUNA_SOLO_EN=OR000552,OP-2026-000151   (opcional) solo estas cuentas ven DeUna
//   DEUNA_WEBHOOK_SECRET           clave del aviso (≥ 32 caracteres; vacía = avisos rechazados)

export type ConfigPasarela = {
  pasarela: Pasarela;
  activa: boolean;
  ambiente: Ambiente;
  /** PayPhone */
  token: string;
  storeId: string;
  /** En Prueba (PayPhone) o con DEUNA_SOLO_EN (DeUna): las únicas cuentas donde se muestra el botón. */
  pedidosPrueba: string[];
  /** DeUna */
  apiKey: string;
  apiSecret: string;
  caja: string;
};

const leer = (k: string) => (process.env[k] ?? "").trim();
const lista = (k: string) => leer(k).split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
const vacia = { token: "", storeId: "", apiKey: "", apiSecret: "", caja: "" };

export function configPasarela(pasarela: Pasarela): ConfigPasarela {
  if (pasarela === "PayPhone") {
    const token = leer("PAYPHONE_TOKEN");
    const storeId = leer("PAYPHONE_STORE_ID");
    return {
      ...vacia,
      pasarela,
      activa: leer("PAYPHONE_ACTIVO") === "1" && !!token && !!storeId,
      ambiente: leer("PAYPHONE_AMBIENTE").toLowerCase().startsWith("produc") ? "Producción" : "Prueba",
      token,
      storeId,
      pedidosPrueba: lista("PAYPHONE_PEDIDOS_PRUEBA"),
    };
  }
  const apiKey = leer("DEUNA_API_KEY");
  const apiSecret = leer("DEUNA_API_SECRET");
  const caja = leer("DEUNA_POINT_OF_SALE");
  return {
    ...vacia,
    pasarela,
    activa: leer("DEUNA_ACTIVO") === "1" && !!apiKey && !!apiSecret && /^\d{1,12}$/.test(caja),
    ambiente: "Producción",
    pedidosPrueba: lista("DEUNA_SOLO_EN"),
    apiKey,
    apiSecret,
    caja,
  };
}

/** ¿Hay credenciales para CONSULTAR un pago ya hecho (aunque el botón esté apagado)? */
export function puedeConsultar(c: ConfigPasarela): boolean {
  return c.pasarela === "PayPhone" ? !!c.token : !!c.apiKey && !!c.apiSecret;
}

/** Clave del aviso de DeUna (vacía = el receptor rechaza todo). */
export function secretoAvisoDeUna(): string {
  return leer("DEUNA_WEBHOOK_SECRET");
}

/**
 * ¿Se ofrece esta pasarela en esta cuenta? PayPhone en Prueba: solo en los
 * pedidos de prueba. DeUna con DEUNA_SOLO_EN: solo en esas cuentas.
 */
export function pasarelaDisponible(c: ConfigPasarela, codigoCuenta: string): boolean {
  if (!c.activa) return false;
  const codigo = codigoCuenta.trim().toUpperCase();
  if (c.pasarela === "DeUna") return c.pedidosPrueba.length === 0 || c.pedidosPrueba.includes(codigo);
  if (c.ambiente === "Producción") return true;
  return c.pedidosPrueba.includes(codigo);
}

/** Qué medios ve el cliente en esta cuenta. */
export function mediosDisponibles(codigoCuenta: string): { tarjeta: boolean; deuna: boolean } {
  return {
    tarjeta: pasarelaDisponible(configPasarela("PayPhone"), codigoCuenta),
    deuna: pasarelaDisponible(configPasarela("DeUna"), codigoCuenta),
  };
}
