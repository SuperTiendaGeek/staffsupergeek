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

export type ConfigPasarela = {
  pasarela: Pasarela;
  activa: boolean;
  ambiente: Ambiente;
  token: string;
  storeId: string;
  /** En Prueba: códigos de pedido (OP-…) donde se muestra el botón. */
  pedidosPrueba: string[];
};

const leer = (k: string) => (process.env[k] ?? "").trim();

export function configPasarela(pasarela: Pasarela): ConfigPasarela {
  if (pasarela === "PayPhone") {
    const token = leer("PAYPHONE_TOKEN");
    const storeId = leer("PAYPHONE_STORE_ID");
    return {
      pasarela,
      activa: leer("PAYPHONE_ACTIVO") === "1" && !!token && !!storeId,
      ambiente: leer("PAYPHONE_AMBIENTE").toLowerCase().startsWith("produc") ? "Producción" : "Prueba",
      token,
      storeId,
      pedidosPrueba: leer("PAYPHONE_PEDIDOS_PRUEBA").split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean),
    };
  }
  // DeUna: se construye después (las credenciales ya existen; mismo trato).
  return { pasarela, activa: false, ambiente: "Prueba", token: "", storeId: "", pedidosPrueba: [] };
}

/** ¿Se ofrece esta pasarela en esta cuenta? En Prueba, solo en los pedidos de prueba. */
export function pasarelaDisponible(c: ConfigPasarela, codigoCuenta: string): boolean {
  if (!c.activa) return false;
  if (c.ambiente === "Producción") return true;
  return c.pedidosPrueba.includes(codigoCuenta.trim().toUpperCase());
}
