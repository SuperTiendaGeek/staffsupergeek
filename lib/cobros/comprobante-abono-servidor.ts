import "server-only";

// Lee lo que necesita el comprobante de abono (orden u operación) y lo arma
// con la regla pura. Solo LEE. Ver lib/cobros/comprobante-abono.ts.

import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { fetchCliente, fetchOperacion, fetchOrden, firstString, linkedIds } from "@/lib/facturacion/gancho/airtableGancho";
import { getFacturacionConfig } from "@/lib/facturacion/config";
import {
  armarComprobanteAbono, buscarAbonoParaComprobante,
  type ClienteComprobante, type ComprobanteAbono,
} from "./comprobante-abono";

export type EmisorComprobante = { nombreComercial: string; razonSocial: string; ruc: string; dirMatriz: string };

export type ResultadoComprobante =
  | { ok: true; comprobante: ComprobanteAbono; emisor: EmisorComprobante }
  | { ok: false; status: number; motivo: string };

export async function cargarComprobanteAbono(
  origen: { ordenId: string } | { operacionId: string },
  abonoId: string,
): Promise<ResultadoComprobante> {
  const cuenta = await getCuentaUnificada(origen).catch((e) => {
    console.error("[comprobante-abono] cuenta:", e);
    return null;
  });
  // Sin la cuenta no se imprime: nunca un saldo distinto al de la pantalla.
  if (!cuenta) return { ok: false, status: 503, motivo: "No se pudo calcular la cuenta. Intenta de nuevo en unos segundos." };

  const encontrado = buscarAbonoParaComprobante(cuenta.abonos, abonoId);
  if (!encontrado.ok) return { ok: false, status: 404, motivo: encontrado.motivo };

  const cliente = await clienteDeCuenta(cuenta.ordenId, cuenta.operacionId, "ordenId" in origen ? "orden" : "operacion");
  const cfg = getFacturacionConfig();
  return {
    ok: true,
    comprobante: armarComprobanteAbono(cuenta, encontrado.abono, cliente),
    emisor: { nombreComercial: cfg.nombreComercial, razonSocial: cfg.razonSocial, ruc: cfg.ruc, dirMatriz: cfg.dirMatriz },
  };
}

/** El cliente vinculado a la pantalla que pide el comprobante; si no tiene, el del otro lado del par. */
async function clienteDeCuenta(ordenId: string | null, operacionId: string | null, primero: "orden" | "operacion"): Promise<ClienteComprobante> {
  const vacio: ClienteComprobante = { nombre: "Consumidor final", identificacion: "", telefono: "", correo: "" };
  try {
    const lecturas = primero === "orden"
      ? [ordenId ? fetchOrden(ordenId) : null, operacionId ? fetchOperacion(operacionId) : null]
      : [operacionId ? fetchOperacion(operacionId) : null, ordenId ? fetchOrden(ordenId) : null];
    let clienteId: string | undefined;
    for (const lectura of lecturas) {
      const reg = lectura ? await lectura : null;
      clienteId = linkedIds(reg?.fields["Cliente"])[0];
      if (clienteId) break;
    }
    if (!clienteId) return vacio;
    const c = await fetchCliente(clienteId);
    if (!c) return vacio;
    return {
      nombre: firstString(c.fields["Nombre"], vacio.nombre),
      identificacion: firstString(c.fields["Cédula"]),
      telefono: firstString(c.fields["Teléfono"]) || firstString(c.fields["Telefono"]),
      correo: firstString(c.fields["Correo"]),
    };
  } catch (e) {
    console.error("[comprobante-abono] cliente:", e);
    return vacio;
  }
}
