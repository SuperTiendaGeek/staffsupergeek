import "server-only";

// Parte de pago — acciones del SERVIDOR (2-nov-2026). Reglas en ./reglas.ts.
//
// Recibir (cualquier empleado que cobra), en este orden:
//   1. el artículo nace en Shipping V2 ("Parte de pago de cliente", costo =
//      valor acordado, ya en la tienda, por revisar) — su entrada al Kardex
//      la escribe Shipping como cualquier alta;
//   2. el abono "Parte de pago" en la cuenta (si falla, el artículo se da de
//      baja: nada a medias);
//   3. Finanzas: Ingreso SIN cuenta "Parte de pago de cliente" enlazado al
//      abono (nunca bloquea; si falla, se avisa).
// Anular (solo administrador): con el abono anulado, el artículo se da de
// baja (vuelve al cliente) y su ingreso se anula con el abono.

import { createShippingV2Item, findShippingV2ItemBySku, moverActivoShippingV2 } from "@/lib/shipping-v2/airtable";
import { systemShippingV2Access } from "@/lib/shipping-v2/access";
import { ORIGEN_TIENDA, TIPO_PARTE_DE_PAGO } from "@/lib/shipping-v2/item-origen";
import { SHIPPING_V2_CATEGORIAS, SHIPPING_V2_CONDICIONES } from "@/types/shipping-v2";
import { isAdministratorRole } from "@/lib/apps";
import { withLock } from "@/lib/concurrencia";
import { verificarAbonoPermitido } from "@/lib/facturacion/gancho/cobroOrigen";
import { fetchRecordById } from "@/lib/finanzas/airtable-client";
import { crearMovimiento } from "@/lib/finanzas/movimientos";
import { crearAbonoEnCuenta, hoyEcuador, leerCuenta, nombreUsuario, type OrigenCuenta } from "@/lib/saldo-favor/servidor";
import type { StaffSession } from "@/lib/session";
import {
  CATEGORIA_FINANZAS_PARTE_DE_PAGO, METODO_PARTE_DE_PAGO,
  notaArticuloParteDePago, observacionParteDePago, validarAnularParteDePago, validarParteDePago,
  type ParteDePagoInput,
} from "./reglas";

export type ResultadoParteDePago =
  | { ok: true; sku: string; itemId: string; abonoId: string; valor: number; warning: string | null }
  | { ok: false; error: string; status: number };

const FALLA = (error: string, status = 400) => ({ ok: false as const, error, status });

export async function recibirParteDePago(input: {
  origen: OrigenCuenta;
  session: StaffSession;
  articulo: ParteDePagoInput;
}): Promise<ResultadoParteDePago> {
  return withLock(`cuenta:${input.origen.tipo}:${input.origen.recordId}`, async () => {
    let d;
    try { d = await leerCuenta(input.origen); } catch (e) {
      console.error("[parte-pago] No se pudo leer la cuenta:", e);
      return FALLA("No se pudo leer la cuenta. Intenta de nuevo.", 503);
    }
    const v = validarParteDePago(input.articulo, {
      porCobrar: d.cuenta.saldo,
      categorias: SHIPPING_V2_CATEGORIAS,
      condiciones: SHIPPING_V2_CONDICIONES,
    });
    if (!v.ok) return FALLA(v.motivo);
    const noPermitido = await verificarAbonoPermitido(input.origen, v.valor);
    if (noPermitido) return FALLA(noPermitido.error, noPermitido.status);

    const registradoPor = nombreUsuario(input.session);

    // 1. El artículo.
    let item: { id: string; sku: string };
    try {
      const creado = await createShippingV2Item(
        {
          nombre: v.descripcion,
          tipoOperacion: TIPO_PARTE_DE_PAGO,
          tipoItem: "",
          categoria: v.categoria,
          condicion: v.condicion,
          estado: "Disponible",
          origenArticulo: ORIGEN_TIENDA,
          cantidad: 1,
          costoProveedor: v.valor,
          numeroSerie: v.numeroSerie || undefined,
          requiereInspeccion: true,
          observacionesInternas: notaArticuloParteDePago({
            cliente: d.clienteNombre, referencia: d.etiqueta, valor: v.valor, registradoPor, fecha: hoyEcuador(),
          }),
        },
        { registradoPor, typecast: true, eventDescription: `Recibido como parte de pago en ${d.etiqueta}.` },
      );
      item = { id: creado.id, sku: creado.sku ?? "" };
    } catch (e) {
      console.error("[parte-pago] No se pudo crear el artículo:", e);
      return FALLA(`No se pudo registrar el artículo: ${e instanceof Error ? e.message : "error inesperado"}. No se hizo ningún cambio.`, 500);
    }

    // 2. El abono.
    let abonoId: string;
    try {
      abonoId = await crearAbonoEnCuenta({
        origen: input.origen, datos: d, monto: v.valor, metodo: METODO_PARTE_DE_PAGO,
        observacion: observacionParteDePago(v.descripcion, item.sku), registradoPor,
      });
    } catch (e) {
      console.error("[parte-pago] Falló el abono; se da de baja el artículo:", e);
      await darDeBaja(item.id, `Parte de pago no registrada en ${d.etiqueta} (error del sistema).`, registradoPor)
        .catch((err) => console.error("[parte-pago] No se pudo dar de baja", item.sku, err));
      return FALLA("No se pudo registrar la parte de pago. No se hizo ningún cambio; intenta de nuevo.", 500);
    }

    // 3. Finanzas.
    let warning: string | null = null;
    try {
      await crearMovimiento(
        {
          tipo: "Ingreso", origen: "Abonos", categoria: CATEGORIA_FINANZAS_PARTE_DE_PAGO, monto: v.valor,
          cuentaDestinoId: null, estado: "Confirmado", estadoDistribucion: "No aplica", metodo: "No aplica",
          fecha: new Date().toISOString(),
          observacion: `${d.etiqueta}: ${d.clienteNombre || "el cliente"} pagó ${v.descripcion} (${item.sku}). No es dinero: entra al inventario.`,
          registradoPor, abonoId, clienteId: d.clienteId ?? undefined,
        },
        { permitirCuentaFaltante: true },
      );
    } catch (e) {
      console.error("[parte-pago] No se pudo anotar en Finanzas:", e);
      warning = "La parte de pago quedó registrada, pero no se pudo anotar en Finanzas. Avísale al administrador.";
    }
    return { ok: true, sku: item.sku, itemId: item.id, abonoId, valor: v.valor, warning };
  });
}

async function darDeBaja(itemId: string, motivo: string, actor: string): Promise<void> {
  await moverActivoShippingV2(
    itemId,
    { accion: "baja", cantidad: 1, motivo },
    { actor, access: { ...systemShippingV2Access(), isSiteAdmin: true } },
  );
}

const SKU_EN_OBSERVACION = /\(([A-Z]{2,5}-\d{3,})\)\s*$/;

/**
 * Antes de anular un abono: si es una parte de pago, solo un administrador
 * y solo si el artículo sigue libre en la tienda. Después de anular, el
 * artículo se da de baja (vuelve al cliente). null = no es parte de pago.
 */
export async function prepararAnulacionParteDePago(
  abonoId: string,
  session: StaffSession,
): Promise<{ ok: true; despues: () => Promise<string | null> } | { ok: false; error: string; status: number } | null> {
  const abono = await fetchRecordById("Abonos", abonoId);
  if (!abono) return null;
  if (abono.fields["Método de Pago"] !== METODO_PARTE_DE_PAGO) return null;
  const obs = typeof abono.fields["Observación"] === "string" ? (abono.fields["Observación"] as string) : "";
  const sku = SKU_EN_OBSERVACION.exec(obs)?.[1] ?? "";
  const item = sku ? await findShippingV2ItemBySku(sku) : null;
  const v = validarAnularParteDePago({
    esAdmin: isAdministratorRole(session.user.rol),
    articulo: item ? { sku: item.sku ?? sku, estado: item.estado ?? "", cantidad: Number(item.cantidad) || 0, cantidadReservada: Number(item.cantidadReservada) || 0 } : null,
  });
  if (!v.ok) return FALLA(v.motivo, 409);
  return {
    ok: true,
    despues: async () => {
      if (!item) return sku ? `No se encontró ${sku}: dalo de baja a mano en Shipping V2.` : null;
      try {
        await darDeBaja(item.id, `Parte de pago anulada (abono ${abonoId}): el artículo vuelve al cliente.`, nombreUsuario(session));
        return null;
      } catch (e) {
        console.error("[parte-pago] No se pudo dar de baja al anular:", e);
        return `El abono se anuló, pero ${item.sku} no se pudo dar de baja: hazlo a mano en Shipping V2.`;
      }
    },
  };
}
