import "server-only";

// "Pasar a pedido aparte" — SERVIDOR (auditoría ops, punto 10C-1 · 12-nov-2026).
// La regla vive en ./pedido-aparte.ts (pura, con prueba). Aquí se lee la
// orden real, se valida otra vez y se escribe:
//   1. nace el pedido especial (Operación Comercial) ya "Aceptado", del mismo
//      cliente, con la fecha de aprobación de la línea (su llegada estimada
//      se calcula desde ahí, como si siempre hubiera sido un pedido);
//   2. la línea, su artículo (si ya se compró) y su solicitud de compra pasan
//      de la orden al pedido: el seguimiento sigue donde iba;
//   3. el dinero (hasta el precio de la línea): abono −$X "Traspaso" en la
//      orden y, en el pedido, la copia de cada pago de origen (mismo método
//      y referencia, para la factura) con la observación "Traspaso desde…".
//      Nada de esto se asienta en Finanzas: el dinero ya entró.
// Al final se verifica que lo pagado en las dos cuentas sume lo de antes.

import { withLock } from "@/lib/concurrencia";
import { airtableMutation, fetchRecordById, linkedIds, tableUrl } from "@/lib/finanzas/airtable-client";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { buscarDocumentoBloqueante } from "@/lib/facturacion/gancho/idempotencia";
import { actualizarLinea, listarLineas } from "@/lib/tecnicos/presupuesto/airtable";
import { solicitudesDeOrden } from "@/lib/compras/servidor";
import { actualizarSolicitud } from "@/lib/compras/airtable";
import { entradaHistorial } from "@/lib/compras/reglas";
import { createAbonoPorOrden } from "@/lib/tecnicos/airtable";
import { crearAbono } from "@/lib/operaciones/airtable";
import { METODO_TRASPASO } from "@/lib/cobros/metodos";
import { esAbonoVigente } from "@/types/cuenta-unificada";
import {
  errorPedidoAparte, observacionEntrada, observacionSalida, pagadoNeto, repartirTraspaso, resumenPedidoAparte, totalLinea,
  type AbonoParaTraspaso, type ResumenAparte,
} from "./pedido-aparte";

const T_ORDENES = "Órdenes de Reparación";
const T_OPERACIONES = "Operación Comercial";
const T_ITEMS = "Shipping Items";
const CAMPO_ORDEN_STOCK = "Orden de Reparación (Stock)";

const texto = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return texto(v[0]);
  return v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
};

export class ErrorPedidoAparte extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

type Lectura = Awaited<ReturnType<typeof leer>>;

async function leer(ordenId: string, lineaId: string) {
  const orden = await fetchRecordById(T_ORDENES, ordenId);
  if (!orden) throw new ErrorPedidoAparte("Orden no encontrada.", 404);
  const [lineas, solicitudes, doc, cuenta] = await Promise.all([
    listarLineas(ordenId),
    solicitudesDeOrden(ordenId),
    buscarDocumentoBloqueante({ tipo: "orden", recordId: ordenId }),
    getCuentaUnificada({ ordenId }),
  ]);
  const linea = lineas.find((l) => l.id === lineaId);
  if (!linea) throw new ErrorPedidoAparte("La línea no es de esta orden.", 404);
  const solicitud = solicitudes.find((s) => s.lineaId === lineaId && s.estado !== "Cancelada")
    ?? solicitudes.find((s) => s.lineaId === lineaId) ?? null;
  const abonos: AbonoParaTraspaso[] = cuenta.abonos.map((a) => ({
    id: a.id,
    monto: a.monto,
    estado: a.estado,
    metodo: a.metodoPago ?? "",
    referencia: a.numeroTransaccion ?? "",
    fecha: a.fecha ?? "",
  }));
  const error = errorPedidoAparte({
    estadoOrden: texto(orden.fields["Estado Actual"]),
    tieneDocumento: !!doc,
    linea: {
      id: linea.id, tipo: linea.tipo, descripcion: linea.descripcion, cantidad: linea.cantidad,
      precioUnitario: linea.precioUnitario, estado: linea.estado, bajoPedido: linea.bajoPedido,
      garantia: linea.garantia ?? "", pedidoId: linea.pedidoId ?? null,
    },
    solicitud: solicitud ? { estado: solicitud.estado, situacionClave: solicitud.situacion.clave } : null,
  });
  const precio = totalLinea(linea);
  return {
    orden,
    ordenCodigo: texto(orden.fields["ID"]) || ordenId,
    clienteId: linkedIds(orden.fields["Cliente"])[0] ?? null,
    linea,
    solicitud,
    abonos,
    numeroAbono: new Map(cuenta.abonos.map((a) => [a.id, a.idAbono ?? a.id])),
    error,
    resumen: resumenPedidoAparte({ precioLinea: precio, totalCuentaOrden: cuenta.totalCuenta, abonos }),
  };
}

/** Lo que muestra la ventana antes de confirmar (no escribe nada). */
export async function revisarPedidoAparte(ordenId: string, lineaId: string): Promise<{
  error: string | null; resumen: ResumenAparte; descripcion: string; situacion: string;
}> {
  const l = await leer(ordenId, lineaId);
  return { error: l.error, resumen: l.resumen, descripcion: l.linea.descripcion, situacion: l.solicitud?.situacion.texto ?? "" };
}

async function crearPedido(l: Lectura, usuario: string): Promise<{ id: string; codigo: string }> {
  const aceptadoEn = l.linea.fechaAprobacion || new Date().toISOString();
  const res = await airtableMutation<{ records?: Array<{ id: string }> }>(tableUrl(T_OPERACIONES), {
    method: "POST",
    body: JSON.stringify({
      records: [{
        fields: {
          ...(l.clienteId ? { Cliente: [l.clienteId] } : {}),
          "Producto Solicitado": l.linea.descripcion.trim(),
          Estado: "Aceptado",
          "Aceptado en": aceptadoEn,
          "Aceptado por": usuario,
          "Aceptado vía": "En tienda",
          "Observación Interna": entradaHistorial(`Pedido aparte desde la orden ${l.ordenCodigo}.`, usuario),
        },
      }],
      typecast: true,
    }),
  });
  const id = res.records?.[0]?.id;
  if (!id) throw new Error("Airtable no devolvió el pedido nuevo.");
  const creado = await fetchRecordById(T_OPERACIONES, id);
  return { id, codigo: texto(creado?.fields["Código Operación"]) || id };
}

async function moverArticulo(itemId: string, ordenId: string, pedido: { id: string; codigo: string }, ordenCodigo: string, usuario: string): Promise<void> {
  const item = await fetchRecordById(T_ITEMS, itemId);
  if (!item) throw new Error("No se encontró el artículo de la línea.");
  await airtableMutation(tableUrl(T_ITEMS), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{
        id: itemId,
        fields: {
          [CAMPO_ORDEN_STOCK]: linkedIds(item.fields[CAMPO_ORDEN_STOCK]).filter((x) => x !== ordenId),
          "Operación Comercial": [...new Set([...linkedIds(item.fields["Operación Comercial"]), pedido.id])],
        },
      }],
    }),
  });
  await airtableMutation(tableUrl("Shipping Eventos"), {
    method: "POST",
    body: JSON.stringify({
      records: [{
        fields: {
          "Tipo de entidad": "Shipping Item", "Acción": "Actualizado", "Item relacionado": [itemId],
          "Descripción del evento": `Pasó de la orden ${ordenCodigo} al pedido aparte ${pedido.codigo} (sigue apartado para el cliente).`,
          "Registrado por": usuario, "Fecha del evento": new Date().toISOString(), "Datos relevantes": texto(item.fields["SKU"]),
        },
      }],
      typecast: true,
    }),
  }).catch((e) => console.warn("[pedido-aparte] no se registró el evento del artículo:", e));
}

/** "Pasar a pedido aparte". Vuelve a revisar todo en el servidor antes de escribir. */
export async function pasarAPedidoAparte(input: { ordenId: string; lineaId: string; usuario: string }): Promise<{
  pedidoId: string; codigo: string; traspasado: number; resumen: ResumenAparte;
}> {
  return withLock(`presupuesto:${input.ordenId}`, () => withLock(`entrega:${input.ordenId}`, async () => {
    const l = await leer(input.ordenId, input.lineaId);
    if (l.error) throw new ErrorPedidoAparte(l.error);
    const { usuario } = input;
    const monto = l.resumen.alPedido;
    const porciones = repartirTraspaso(l.abonos, monto);
    const pagadoAntes = pagadoNeto(l.abonos);

    // 1. El pedido.
    const pedido = await crearPedido(l, usuario);

    // 2. La línea, su artículo y su solicitud.
    await actualizarLinea(l.linea.id, {
      ordenId: null,
      pedidoId: pedido.id,
      agregarHistorial: { anterior: l.linea.historial, entrada: entradaHistorial(`Pasó al pedido aparte ${pedido.codigo} (desde ${l.ordenCodigo}).`, usuario) },
    });
    if (l.linea.itemId) await moverArticulo(l.linea.itemId, input.ordenId, pedido, l.ordenCodigo, usuario);
    if (l.solicitud) {
      await actualizarSolicitud(l.solicitud.id, {
        Orden: [],
        "Operación": [pedido.id],
        Historial: [l.solicitud.historial.trim(), entradaHistorial(`Pasó al pedido aparte ${pedido.codigo} (desde ${l.ordenCodigo}).`, usuario)].filter(Boolean).join("\n"),
      });
    }

    // 3. El dinero: primero sale de la orden, luego entra al pedido.
    if (monto > 0.005) {
      await createAbonoPorOrden({
        ordenRecordId: input.ordenId,
        monto: -monto,
        metodoPago: METODO_TRASPASO,
        observacion: observacionSalida(pedido.codigo, l.linea.descripcion),
        registradoPor: usuario,
      });
      for (const p of porciones) {
        await crearAbono({
          operacionId: pedido.id,
          ordenId: null,
          monto: p.monto,
          metodoPago: p.metodo,
          fechaAbono: p.fecha || new Date().toISOString(),
          numeroTransaccion: p.referencia || undefined,
          observacion: observacionEntrada(l.ordenCodigo, String(l.numeroAbono.get(p.abonoOrigenId) ?? p.abonoOrigenId)),
          registradoPor: usuario,
        });
      }
    }

    // 4. Verificación: lo pagado en las dos cuentas suma lo de antes.
    const [cOrden, cPedido] = await Promise.all([
      getCuentaUnificada({ ordenId: input.ordenId }),
      getCuentaUnificada({ operacionId: pedido.id }),
    ]);
    const pagadoOrden = cOrden.abonos.filter(esAbonoVigente).reduce((s, a) => s + a.monto, 0);
    const pagadoPedido = cPedido.abonos.filter(esAbonoVigente).reduce((s, a) => s + a.monto, 0);
    if (Math.abs(pagadoOrden + pagadoPedido - pagadoAntes) > 0.01) {
      console.error("[pedido-aparte] los pagos no cuadran después del traspaso", {
        orden: l.ordenCodigo, pedido: pedido.codigo, pagadoAntes, pagadoOrden, pagadoPedido,
      });
      throw new ErrorPedidoAparte(`Se creó ${pedido.codigo}, pero los pagos no cuadran (antes $${pagadoAntes}, ahora $${(pagadoOrden + pagadoPedido).toFixed(2)}). Avisa a un administrador.`, 500);
    }
    return { pedidoId: pedido.id, codigo: pedido.codigo, traspasado: monto, resumen: l.resumen };
  }));
}
