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

// DeUna (etapa D, 18-nov; QA separado en la etapa D2, 26-nov-2026). DOS
// configuraciones que NUNCA se mezclan (revisión de Codex):
//
//   PRODUCCIÓN (dinero real) — APAGADA hasta que el dueño la encienda:
//     DEUNA_ACTIVO=1                 muestra el botón en cuentas reales
//     DEUNA_AVISOS_ACTIVO=1          acepta avisos (webhook /api/webhooks/deuna)
//     DEUNA_API_KEY, DEUNA_API_SECRET
//     DEUNA_POINT_OF_SALE=399118     caja de los enlaces
//     DEUNA_POINT_OF_SALE_MOSTRADOR  (opcional) caja del mostrador; vacía = la misma
//     DEUNA_SOLO_EN=OR000552,…       (opcional) solo estas cuentas ven DeUna
//     DEUNA_WEBHOOK_SECRET           clave del aviso (≥ 32 caracteres)
//
//   QA (pruebas de DeUna, sin dinero real) — SOLO en cuentas marcadas «Es prueba»:
//     DEUNA_QA_ACTIVO=1, DEUNA_QA_AVISOS_ACTIVO=1
//     DEUNA_QA_API_KEY, DEUNA_QA_API_SECRET
//     DEUNA_QA_POINT_OF_SALE=4538981, DEUNA_QA_POINT_OF_SALE_MOSTRADOR (opcional, 4538982)
//     DEUNA_QA_WEBHOOK_SECRET        (webhook /api/webhooks/deuna-qa)
//
// Regla fija: una cuenta «Es prueba» solo puede usar QA; una cuenta real solo
// producción. Los pagos QA quedan con Ambiente "Prueba" y nunca llegan a Finanzas.

export const URL_DEUNA: Record<Ambiente, string> = {
  "Producción": "https://apis-merchant.pdn.deunalab.com/merchant/v1/payment",
  Prueba: "https://apis-merchant.qa.deunalab.com/merchant/v1/payment",
};

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
  /** Caja de los enlaces del cliente. */
  caja: string;
  /** Caja del mostrador (pantalla del cliente). */
  cajaMostrador: string;
  /** Cajas válidas al confirmar un pago (posId). */
  cajas: string[];
  /** Dirección de la API (producción o QA). */
  base: string;
  /** ¿Se aceptan avisos (webhook)? */
  avisos: boolean;
  /** Clave del aviso (vacía = avisos rechazados). */
  secretoAviso: string;
};

const leer = (k: string) => (process.env[k] ?? "").trim();
const lista = (k: string) => leer(k).split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
const vacia = { token: "", storeId: "", apiKey: "", apiSecret: "", caja: "", cajaMostrador: "", cajas: [] as string[], base: "", avisos: false, secretoAviso: "" };
const esCaja = (c: string) => /^\d{1,12}$/.test(c);

/** PayPhone: una sola configuración (Prueba/Producción por PAYPHONE_AMBIENTE). DeUna: la del ambiente pedido. */
export function configPasarela(pasarela: Pasarela, ambienteDeUna: Ambiente = "Producción"): ConfigPasarela {
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
  const p = ambienteDeUna === "Prueba" ? "DEUNA_QA_" : "DEUNA_";
  const apiKey = leer(`${p}API_KEY`);
  const apiSecret = leer(`${p}API_SECRET`);
  const caja = leer(`${p}POINT_OF_SALE`);
  const mostrador = leer(`${p}POINT_OF_SALE_MOSTRADOR`);
  const cajaMostrador = esCaja(mostrador) ? mostrador : caja;
  const secretoAviso = leer(`${p}WEBHOOK_SECRET`);
  const conCredenciales = !!apiKey && !!apiSecret && esCaja(caja);
  return {
    ...vacia,
    pasarela,
    activa: leer(`${p}ACTIVO`) === "1" && conCredenciales,
    ambiente: ambienteDeUna,
    pedidosPrueba: ambienteDeUna === "Prueba" ? [] : lista("DEUNA_SOLO_EN"),
    apiKey,
    apiSecret,
    caja,
    cajaMostrador,
    cajas: [...new Set([caja, cajaMostrador].filter(esCaja))],
    base: URL_DEUNA[ambienteDeUna],
    avisos: leer(`${p}AVISOS_ACTIVO`) === "1" && conCredenciales,
    secretoAviso,
  };
}

/** ¿Hay credenciales para CONSULTAR un pago ya hecho (aunque el botón esté apagado)? */
export function puedeConsultar(c: ConfigPasarela): boolean {
  return c.pasarela === "PayPhone" ? !!c.token : !!c.apiKey && !!c.apiSecret && c.cajas.length > 0;
}

/** El ambiente de DeUna que le corresponde a una cuenta: «Es prueba» → QA; real → producción. */
export const ambienteDeUnaPara = (esPrueba: boolean): Ambiente => (esPrueba ? "Prueba" : "Producción");

/**
 * ¿Se ofrece esta pasarela en esta cuenta? PayPhone en Prueba: solo en los
 * pedidos de prueba. DeUna: su ambiente debe coincidir con la cuenta (QA solo
 * en «Es prueba»; producción solo en reales) y, con DEUNA_SOLO_EN, estar en la lista.
 */
export function pasarelaDisponible(c: ConfigPasarela, codigoCuenta: string, esPrueba = false): boolean {
  if (!c.activa) return false;
  const codigo = codigoCuenta.trim().toUpperCase();
  if (c.pasarela === "DeUna") {
    if (c.ambiente !== ambienteDeUnaPara(esPrueba)) return false;
    return c.pedidosPrueba.length === 0 || c.pedidosPrueba.includes(codigo);
  }
  // D2: una cuenta «Es prueba» nunca cobra dinero real (su abono no llegaría a Finanzas).
  if (c.ambiente === "Producción") return !esPrueba;
  return c.pedidosPrueba.includes(codigo);
}

/** Qué medios ve el cliente en esta cuenta. */
export function mediosDisponibles(codigoCuenta: string, esPrueba = false): { tarjeta: boolean; deuna: boolean } {
  return {
    tarjeta: pasarelaDisponible(configPasarela("PayPhone"), codigoCuenta, esPrueba),
    deuna: pasarelaDisponible(configPasarela("DeUna", ambienteDeUnaPara(esPrueba)), codigoCuenta, esPrueba),
  };
}
