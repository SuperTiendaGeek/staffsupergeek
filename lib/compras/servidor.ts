import "server-only";

// Solicitudes de compra — acciones del SERVIDOR (auditoría ops, Fase 2).
// Las reglas viven en ./reglas.ts (puras, con prueba). Aquí se lee la orden o
// el pedido real, se valida y se escribe.
//
// Ciclo (ejemplo OR000507, tapa HP):
//   1. El cliente aprueba la línea "bajo pedido" → asegurarSolicitudDeLinea:
//      nace SOL-000001 "Por comprar". No se crea ninguna Operación Comercial.
//   2. Maritza la compra en "Registrar compra" (abierta desde la bandeja) →
//      aplicarCompra: el artículo nuevo queda apartado para OR000507, la línea
//      pasa a "Cargada" con ese SKU y la solicitud a "Comprada" con su OC.
//   3. Recepción marca "Recibido" → alRecibirArticulo: aviso interno a los
//      técnicos ("Llegó la pieza de OR000507 · 1 de 3"). Sin mensajes al
//      cliente (decisión del dueño).
// "Llegó" y "Entregada" no se guardan: se leen del artículo (Recibido /
// Vendido), así nunca hay dos verdades.

import { withLock } from "@/lib/concurrencia";
import { canAccessApp, isAdministratorRole } from "@/lib/apps";
import { airtableMutation, fetchRecordById, fetchRecordsByIds, firstNumber, linkedIds, tableUrl } from "@/lib/finanzas/airtable-client";
import { estadosDeCuentaDeOperaciones, estadosDeCuentaDeOrdenes, porIds, CAMPOS_ORDEN_CUENTA } from "@/lib/estado-cuenta/airtable";
import { comprometerUnidades, unidadesLibres } from "@/lib/shipping-v2/unidades";
import { SHIPPING_V2_ITEM_FIELDS } from "@/lib/shipping-v2/schema.generated";
import { actualizarEstadoOperacion } from "@/lib/operaciones/airtable";
import { actualizarLinea } from "@/lib/tecnicos/presupuesto/airtable";
import type { LineaPresupuesto } from "@/lib/tecnicos/presupuesto/reglas";
import { hoyEcuador } from "@/lib/saldo-favor/servidor";
import {
  actualizarSolicitud,
  crearSolicitud,
  solicitudPorClave,
  solicitudPorId,
  solicitudesPorIds,
  CAMPO_INVERSO,
  type Solicitud,
} from "./airtable";
import {
  claveDeLinea,
  claveDeOpcion,
  coberturaAnticipo,
  entradaHistorial,
  situacionDeSolicitud,
  validarAsignarExistente,
  validarCancelar,
  type ArticuloDeSolicitud,
  type Cobertura,
  type Situacion,
} from "./reglas";

const T_ITEMS = "Shipping Items";
const T_ORDENES = "Órdenes de Reparación";
const T_OPERACIONES = "Operación Comercial";
const T_OPCIONES = "Opciones";
const T_OC = "Shipping Órdenes de compra";
const F = SHIPPING_V2_ITEM_FIELDS;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const texto = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => texto(x)).filter(Boolean).join(", ");
  return v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
};

function agregarHistorial(anterior: string, linea: string): string {
  return [anterior.trim(), linea].filter(Boolean).join("\n");
}

// ─── 1. Nace la solicitud (sola, al aprobar) ─────────────────────────────────

/**
 * Línea "bajo pedido" aprobada por el cliente → su solicitud. Idempotente por
 * la clave linea:recX (aprobar dos veces no crea dos).
 */
export async function asegurarSolicitudDeLinea(input: {
  ordenId: string;
  linea: Pick<LineaPresupuesto, "id" | "descripcion" | "cantidad" | "precioUnitario" | "categoria" | "costoProveedor" | "urlProveedor" | "tiempoEstimado" | "proveedorId">;
  usuario: string;
}): Promise<Solicitud> {
  const clave = claveDeLinea(input.linea.id);
  return withLock(`solicitud:${clave}`, async () => {
    const existente = await solicitudPorClave(clave);
    if (existente) return existente;
    const ahora = new Date();
    return crearSolicitud({
      descripcion: input.linea.descripcion.trim() || "Repuesto bajo pedido",
      clave,
      cantidad: Math.max(1, input.linea.cantidad || 1),
      categoria: input.linea.categoria,
      precioCliente: input.linea.precioUnitario,
      costoCotizado: input.linea.costoProveedor,
      urlProveedor: input.linea.urlProveedor,
      tiempoEstimado: input.linea.tiempoEstimado,
      proveedorId: input.linea.proveedorId,
      ordenId: input.ordenId,
      lineaId: input.linea.id,
      fechaAprobacion: ahora.toISOString(),
      historial: entradaHistorial("Aprobada por el cliente: por comprar.", input.usuario, ahora),
      registradoPor: input.usuario,
    });
  });
}

/** Opción aprobada de un pedido de cliente (Operaciones) → su solicitud. Idempotente por opcion:recX. */
export async function asegurarSolicitudDeOpcion(input: { operacionId: string; opcionId: string; usuario: string }): Promise<Solicitud> {
  const clave = claveDeOpcion(input.opcionId);
  return withLock(`solicitud:${clave}`, async () => {
    const existente = await solicitudPorClave(clave);
    if (existente) return existente;
    const [op, opcion] = await Promise.all([fetchRecordById(T_OPERACIONES, input.operacionId), fetchRecordById(T_OPCIONES, input.opcionId)]);
    if (!op || !opcion) throw new Error("No se encontró el pedido o su opción.");
    // Si el cliente cambió de opción después de aprobar, la solicitud de la
    // opción anterior (todavía sin comprar) se cancela: nunca dos compras.
    for (const vieja of await solicitudesPorIds(linkedIds(op.fields[CAMPO_INVERSO]))) {
      if (vieja.estado === "Por comprar" && vieja.opcionId !== input.opcionId) {
        await actualizarSolicitud(vieja.id, {
          Estado: "Cancelada",
          Motivo: "El cliente eligió otra opción.",
          Historial: agregarHistorial(vieja.historial, entradaHistorial("Cancelada: el cliente eligió otra opción.", input.usuario)),
        });
      }
    }
    const of = opcion.fields;
    const cantidad = Math.max(1, firstNumber(of["Cantidad"]) ?? 1);
    const total = firstNumber(of["Precio Venta Cliente"]) ?? 0;
    const unitario = firstNumber(of["Precio unitario cliente"]) ?? (cantidad ? total / cantidad : total);
    const ahora = new Date();
    return crearSolicitud({
      descripcion: texto(of["Producto / Descripción"]).trim() || texto(op.fields["Producto Solicitado"]) || "Pedido de cliente",
      clave,
      cantidad,
      categoria: texto(op.fields["Categoría"]),
      precioCliente: r2(unitario),
      costoCotizado: firstNumber(of["Costo Proveedor"]),
      urlProveedor: texto(of["URL Proveedor"]),
      tiempoEstimado: texto(of["Tiempo Estimado"]),
      proveedorId: linkedIds(of["Proveedor"])[0] ?? null,
      ordenId: linkedIds(op.fields["Orden de Reparación"])[0] ?? null,
      operacionId: input.operacionId,
      opcionId: input.opcionId,
      fechaAprobacion: ahora.toISOString(),
      historial: entradaHistorial("El cliente aprobó la opción: por comprar.", input.usuario, ahora),
      registradoPor: input.usuario,
    });
  });
}

// ─── 2. Se cumple: comprada o "ya la tenemos" ────────────────────────────────

/**
 * Aparta el artículo para quien lo pidió:
 *   · orden: se monta como repuesto de la orden (misma vía que un repuesto de
 *     stock) y la línea del presupuesto pasa a "Cargada" con ese SKU;
 *   · pedido de cliente: el artículo queda enlazado a la operación y su opción
 *     con las unidades del cliente, y el pedido pasa a "Pedido".
 * El precio del artículo es el que aprobó el cliente (la cuenta se calcula con él).
 */
async function apartarParaQuienLoPidio(s: Solicitud, itemId: string, usuario: string): Promise<string> {
  const item = await fetchRecordById(T_ITEMS, itemId);
  if (!item) throw new Error("El artículo no existe.");
  const sku = texto(item.fields[F.sku]) || itemId;
  if (s.precioCliente > 0 && Math.abs((firstNumber(item.fields[F.precioVentaFinal]) ?? 0) - s.precioCliente) > 0.009) {
    await airtableMutation(tableUrl(T_ITEMS), {
      method: "PATCH",
      body: JSON.stringify({ records: [{ id: itemId, fields: { [F.precioVentaFinal]: s.precioCliente } }] }),
    });
  }
  if (s.lineaId && s.ordenId) {
    const { cargarCompraEnLinea } = await import("@/lib/tecnicos/presupuesto/cargar");
    await cargarCompraEnLinea({ ordenId: s.ordenId, lineaId: s.lineaId, itemId, referencia: `${sku} (${s.codigo})`, usuario: { nombre: usuario } });
  } else if (s.operacionId) {
    const unidades = {
      cantidad: firstNumber(item.fields[F.cantidad]) ?? 1,
      cantidadReservada: firstNumber(item.fields[F.cantidadReservada]) ?? 0,
      reservado: item.fields[F.reservado] === true,
    };
    const c = comprometerUnidades(unidades, Math.max(1, s.cantidad));
    if (!c.ok) throw new Error(c.motivo);
    await airtableMutation(tableUrl(T_ITEMS), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{
          id: itemId,
          fields: {
            "Operación Comercial": [...new Set([...linkedIds(item.fields["Operación Comercial"]), s.operacionId])],
            ...(s.opcionId ? { "Opción origen": [s.opcionId] } : {}),
            [F.cantidadReservada]: c.cantidadReservada,
            [F.reservado]: c.reservado,
            [F.disponibleVenta]: c.disponibleVenta,
          },
        }],
      }),
    });
    await actualizarEstadoOperacion(s.operacionId, "Pedido");
  }
  return sku;
}

/**
 * "Registrar compra" creó el artículo de esta solicitud dentro de su OC.
 * Si algo falla al apartarlo, la compra ya existe: se avisa y la solicitud
 * sigue "Por comprar" para usar "Ya la tenemos" con ese SKU.
 */
export async function aplicarCompra(input: { solicitudId: string; itemId: string; ordenCompraId?: string | null; usuario: string }): Promise<{ codigo: string; sku: string }> {
  return withLock(`solicitud:${input.solicitudId}`, async () => {
    const s = await solicitudPorId(input.solicitudId);
    if (!s) throw new Error("La solicitud de compra no existe.");
    if (s.estado === "Comprada" && s.itemId === input.itemId) return { codigo: s.codigo, sku: "" };
    if (s.estado !== "Por comprar") throw new Error(`${s.codigo} ya está ${s.estado.toLowerCase()}.`);
    const sku = await apartarParaQuienLoPidio(s, input.itemId, input.usuario);
    await actualizarSolicitud(s.id, {
      Estado: "Comprada",
      "Artículo": [input.itemId],
      ...(input.ordenCompraId ? { "Orden de compra": [input.ordenCompraId] } : {}),
      "Fecha compra": new Date().toISOString(),
      Historial: agregarHistorial(s.historial, entradaHistorial(`Comprada: ${sku}.`, input.usuario)),
    });
    return { codigo: s.codigo, sku };
  });
}

/** "Ya la tenemos": se aparta un artículo que ya existe (en stock o en camino). Caso OR000432 / OP-131. */
export async function asignarArticuloExistente(input: { solicitudId: string; itemId: string; usuario: string }): Promise<{ codigo: string; sku: string }> {
  return withLock(`solicitud:${input.solicitudId}`, async () => {
    const s = await solicitudPorId(input.solicitudId);
    if (!s) throw new Error("La solicitud de compra no existe.");
    const item = await fetchRecordById(T_ITEMS, input.itemId);
    if (!item) throw new Error("El artículo no existe.");
    const v = validarAsignarExistente(s, {
      estado: texto(item.fields[F.estadoItem]),
      libres: unidadesLibres({
        cantidad: firstNumber(item.fields[F.cantidad]) ?? 0,
        cantidadReservada: firstNumber(item.fields[F.cantidadReservada]) ?? 0,
        reservado: item.fields[F.reservado] === true,
      }),
    });
    if (!v.ok) throw new Error(v.motivo);
    const sku = await apartarParaQuienLoPidio(s, input.itemId, input.usuario);
    const oc = linkedIds(item.fields[F.ordenCompra])[0];
    await actualizarSolicitud(s.id, {
      Estado: "Comprada",
      "Artículo": [input.itemId],
      ...(oc ? { "Orden de compra": [oc] } : {}),
      "Fecha compra": new Date().toISOString(),
      Historial: agregarHistorial(s.historial, entradaHistorial(`Se apartó un artículo que ya existía: ${sku}.`, input.usuario)),
    });
    return { codigo: s.codigo, sku };
  });
}

/**
 * Migración (Fase 2B): un pedido viejo que YA tiene su artículo enlazado y
 * apartado (nació por la vía anterior) recibe su solicitud de compra, ya
 * "Comprada", sin volver a apartar nada. Así aparece en la bandeja y en los
 * chips (En camino / Llegó). Idempotente.
 */
export async function registrarCompraExistenteDeOpcion(input: {
  operacionId: string; opcionId: string; itemId: string; ordenCompraId?: string | null; usuario: string;
}): Promise<{ codigo: string; creada: boolean }> {
  const item = await fetchRecordById(T_ITEMS, input.itemId);
  if (!item) throw new Error("El artículo no existe.");
  if (!linkedIds(item.fields["Operación Comercial"]).includes(input.operacionId)) {
    throw new Error(`${texto(item.fields[F.sku]) || input.itemId} no está enlazado a ese pedido.`);
  }
  const s = await asegurarSolicitudDeOpcion({ operacionId: input.operacionId, opcionId: input.opcionId, usuario: input.usuario });
  if (s.estado === "Comprada" && s.itemId === input.itemId) return { codigo: s.codigo, creada: false };
  if (s.estado !== "Por comprar") throw new Error(`${s.codigo} está ${s.estado.toLowerCase()}: revisar a mano.`);
  const sku = texto(item.fields[F.sku]) || input.itemId;
  await actualizarSolicitud(s.id, {
    Estado: "Comprada",
    "Artículo": [input.itemId],
    ...(input.ordenCompraId ? { "Orden de compra": [input.ordenCompraId] } : {}),
    "Fecha compra": texto(item.fields[F.fechaRegistro]) || new Date().toISOString(),
    Historial: agregarHistorial(s.historial, entradaHistorial(`Migración (Fase 2B): ya estaba comprada, ${sku}.`, input.usuario)),
  });
  return { codigo: s.codigo, creada: true };
}

// ─── 3. Cancelar ─────────────────────────────────────────────────────────────

/** Desde la bandeja (lo que todavía no se compró). La línea de la orden queda con el aviso. */
export async function cancelarSolicitud(input: { solicitudId: string; motivo: string; usuario: string }): Promise<void> {
  await withLock(`solicitud:${input.solicitudId}`, async () => {
    const s = await solicitudPorId(input.solicitudId);
    if (!s) throw new Error("La solicitud de compra no existe.");
    const v = validarCancelar(s, input.motivo);
    if (!v.ok) throw new Error(v.motivo);
    await actualizarSolicitud(s.id, {
      Estado: "Cancelada",
      Motivo: input.motivo.trim(),
      Historial: agregarHistorial(s.historial, entradaHistorial(`Cancelada: ${input.motivo.trim()}`, input.usuario)),
    });
    if (s.lineaId) {
      await actualizarLinea(s.lineaId, { notaCarga: `Compras canceló la compra: ${input.motivo.trim()}. Recotiza o cancela esta línea.` }).catch(() => {});
    }
  });
}

/**
 * La línea del presupuesto se canceló, recotizó o retiró desde la orden: si su
 * solicitud todavía no se compró, se cancela sola (no hubo dinero).
 */
export async function cancelarSolicitudDeLinea(lineaId: string, motivo: string, usuario: string, opts: { aunqueComprada?: boolean } = {}): Promise<void> {
  const s = await solicitudPorClave(claveDeLinea(lineaId));
  if (!s || s.estado === "Cancelada") return;
  if (s.estado !== "Por comprar" && !opts.aunqueComprada) return;
  await actualizarSolicitud(s.id, {
    Estado: "Cancelada",
    Motivo: motivo,
    Historial: agregarHistorial(s.historial, entradaHistorial(`Cancelada desde la orden: ${motivo}`, usuario)),
  });
}

/** El pedido de cliente se rechazó: sus solicitudes sin comprar se cancelan solas. */
export async function cancelarSolicitudesDeOperacion(operacionId: string, motivo: string, usuario: string): Promise<void> {
  const op = await fetchRecordById(T_OPERACIONES, operacionId);
  for (const s of await solicitudesPorIds(linkedIds(op?.fields[CAMPO_INVERSO]))) {
    if (s.estado !== "Por comprar") continue;
    await actualizarSolicitud(s.id, {
      Estado: "Cancelada",
      Motivo: motivo,
      Historial: agregarHistorial(s.historial, entradaHistorial(`Cancelada: ${motivo}`, usuario)),
    });
  }
}

// ─── 4. Lo que se ve en la orden, el pedido y la bandeja ─────────────────────

type ItemLeido = { id: string; fields: Record<string, unknown> };

async function articulosDe(solicitudes: Solicitud[]): Promise<Map<string, ArticuloDeSolicitud>> {
  const itemIds = [...new Set(solicitudes.map((s) => s.itemId).filter((x): x is string => !!x))];
  const items: ItemLeido[] = itemIds.length ? await fetchRecordsByIds(T_ITEMS, itemIds) : [];
  // Lo que falta pagar al proveedor se lee de la OC (el pago es de la orden de compra).
  const ocIds = [...new Set(items.map((i) => linkedIds(i.fields[F.ordenCompra])[0]).filter((x): x is string => !!x))];
  const porPagar = new Set<string>();
  if (ocIds.length) {
    const { getShippingV2OrdenCompraById } = await import("@/lib/shipping-v2/airtable");
    const { systemShippingV2Access } = await import("@/lib/shipping-v2/access");
    for (const oc of ocIds) {
      try {
        const orden = await getShippingV2OrdenCompraById(oc, systemShippingV2Access());
        for (const id of orden.resumen.porPagarIds ?? []) porPagar.add(id);
      } catch (e) {
        console.warn("[compras] no se pudo leer la OC", oc, e);
      }
    }
  }
  const out = new Map<string, ArticuloDeSolicitud>();
  for (const it of items) {
    const f = it.fields;
    const sinOc = !linkedIds(f[F.ordenCompra]).length;
    const pagos = [...linkedIds(f["Shipping Pagos"]), ...linkedIds(f["Shipping Pagos (Items relacionados)"])];
    const debe = sinOc ? f[F.requierePago] === true && pagos.length === 0 : porPagar.has(it.id);
    const costo = (firstNumber(f["Costo proveedor"]) ?? 0) * Math.max(1, firstNumber(f["Unidades compradas"]) ?? 1);
    out.set(it.id, {
      id: it.id,
      sku: texto(f[F.sku]) || it.id,
      recibido: f[F.recibido] === true,
      estado: texto(f[F.estadoItem]),
      faltaPagarProveedor: debe ? r2(costo || 0.01) : 0,
      rastreo: texto(f["Tracking directo"]) || texto(f["Tracking desde intermediario"]) || texto(f["Tracking hacia intermediario"]) || undefined,
    });
  }
  return out;
}

export type SolicitudConSituacion = Solicitud & { situacion: Situacion; cobertura: Cobertura | undefined; sku: string | null };

/** Chips de una lista de solicitudes de la MISMA cuenta, con lo pagado por esa cuenta. */
export async function conSituacion(solicitudes: Solicitud[], totalPagado: number): Promise<SolicitudConSituacion[]> {
  const coberturas = coberturaAnticipo(solicitudes, totalPagado);
  const articulos = await articulosDe(solicitudes);
  const hoy = hoyEcuador();
  return solicitudes.map((s) => {
    const articulo = s.itemId ? articulos.get(s.itemId) ?? null : null;
    const cobertura = coberturas.get(s.id);
    return { ...s, cobertura, sku: articulo?.sku ?? null, situacion: situacionDeSolicitud({ solicitud: s, articulo, cobertura, hoy }) };
  });
}

/** Solicitudes de una orden de reparación con su chip (para la tarjeta Presupuesto). */
export async function solicitudesDeOrden(ordenId: string): Promise<SolicitudConSituacion[]> {
  const orden = await porIds(T_ORDENES, [ordenId], [CAMPO_INVERSO, ...CAMPOS_ORDEN_CUENTA]);
  const reg = orden.get(ordenId);
  if (!reg) return [];
  const solicitudes = await solicitudesPorIds(linkedIds(reg.fields[CAMPO_INVERSO]));
  if (!solicitudes.length) return [];
  const cuenta = (await estadosDeCuentaDeOrdenes([reg])).get(ordenId);
  return conSituacion(solicitudes, cuenta?.totalAbonado ?? 0);
}

/** Solicitudes de un pedido de cliente con su chip. */
export async function solicitudesDeOperacion(operacionId: string): Promise<SolicitudConSituacion[]> {
  const op = await fetchRecordById(T_OPERACIONES, operacionId);
  if (!op) return [];
  const solicitudes = await solicitudesPorIds(linkedIds(op.fields[CAMPO_INVERSO]));
  if (!solicitudes.length) return [];
  const cuenta = (await estadosDeCuentaDeOperaciones([operacionId])).get(operacionId);
  return conSituacion(solicitudes, cuenta?.totalAbonado ?? 0);
}

// ─── 5. Llegó: aviso interno ─────────────────────────────────────────────────

/**
 * Recepción marcó "Recibido" un artículo. Si cumple solicitudes, se avisa a
 * los técnicos (orden) o a quien atiende Operaciones (pedido). Nunca bloquea
 * la recepción: si el aviso falla, solo se registra en el log.
 */
export async function alRecibirArticulo(itemId: string): Promise<void> {
  try {
    const item = await fetchRecordById(T_ITEMS, itemId);
    const ids = linkedIds(item?.fields[CAMPO_INVERSO]);
    if (!ids.length) return;
    const solicitudes = (await solicitudesPorIds(ids)).filter((s) => s.estado === "Comprada");
    if (!solicitudes.length) return;
    // Import perezoso: lib/airtable arrastra lib/permissions/pantallas →
    // next/navigation, que rompe los scripts (tsx con react-server).
    const { listPortalUsers } = await import("@/lib/airtable");
    const { crearNotificacion } = await import("@/lib/notificaciones/airtable");
    const usuarios = await listPortalUsers();
    const sku = texto(item?.fields[F.sku]);
    for (const s of solicitudes) {
      let titulo: string;
      let url: string;
      let modulo: string;
      let entidadTipo: string;
      let entidadId: string;
      if (s.ordenId) {
        const orden = await fetchRecordById(T_ORDENES, s.ordenId);
        const idVisible = texto(orden?.fields["ID"]) || s.ordenId;
        const todas = await solicitudesPorIds(linkedIds(orden?.fields[CAMPO_INVERSO]));
        const vivas = todas.filter((x) => x.estado !== "Cancelada");
        const articulos = await articulosDe(vivas);
        const listas = vivas.filter((x) => x.itemId && (articulos.get(x.itemId)?.recibido || x.itemId === itemId)).length;
        titulo = `Llegó la pieza de ${idVisible} · ${listas} de ${vivas.length}`;
        url = `/tecnicos/ordenes/${s.ordenId}`;
        modulo = "Técnicos";
        entidadTipo = "Orden Reparación";
        entidadId = s.ordenId;
      } else {
        const op = s.operacionId ? await fetchRecordById(T_OPERACIONES, s.operacionId) : null;
        titulo = `Llegó el pedido ${texto(op?.fields["Código Operación"]) || ""}`.trim();
        url = s.operacionId ? `/operaciones/${s.operacionId}` : "/operaciones";
        modulo = "Operaciones";
        entidadTipo = "Operación Comercial";
        entidadId = s.operacionId ?? s.id;
      }
      const destinatarios = usuarios.filter((u) => u.activo && (isAdministratorRole(u.rol) || canAccessApp({ rol: u.rol, appsPermitidas: u.appsPermitidas } as never, modulo)));
      await Promise.allSettled(destinatarios.map((u) => crearNotificacion({
        destinatarioId: u.id,
        tipo: s.ordenId ? "Reparación" : "Sistema",
        titulo,
        mensaje: `${s.descripcion}${sku ? ` (${sku})` : ""} ya está en la tienda, apartado.`,
        prioridad: "Alta",
        urlAccion: url,
        entidadTipo,
        entidadId,
      })));
    }
  } catch (e) {
    console.warn("[compras] aviso de llegada", itemId, e);
  }
}

export { T_OC };

// ─── 6. La bandeja "Por comprar" ─────────────────────────────────────────────

export type FilaBandeja = SolicitudConSituacion & {
  /** "OR000507 · Jose Lopez" o "OP-2026-000096 · Katheryn Gualán". */
  para: string;
  paraHref: string | null;
  proveedorNombre: string;
  /** Equipo de la orden (para reconocer la pieza). */
  equipo: string;
};

/**
 * Todas las solicitudes (sin las canceladas de hace más de 30 días), cada una
 * con su chip calculado con lo pagado por SU cuenta.
 */
export async function filasBandeja(): Promise<FilaBandeja[]> {
  const { solicitudesEnEstados } = await import("./airtable");
  const todas = await solicitudesEnEstados(["Por comprar", "Comprada", "Entregada", "Cancelada"]);
  const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const visibles = todas.filter((s) => s.estado !== "Cancelada" && s.estado !== "Entregada" || (s.fechaCompra || s.fechaAprobacion) >= hace30);

  // Cuentas: por orden (orden + pedidos) o por pedido suelto.
  const ordenIds = [...new Set(visibles.map((s) => s.ordenId).filter((x): x is string => !!x))];
  const opIds = [...new Set(visibles.filter((s) => !s.ordenId && s.operacionId).map((s) => s.operacionId!))];
  const ordenes = await porIds(T_ORDENES, ordenIds, ["ID", "ClienteTXT", "Equipo", ...CAMPOS_ORDEN_CUENTA]);
  const [cuentasOrden, cuentasOp, ops, proveedores] = await Promise.all([
    estadosDeCuentaDeOrdenes([...ordenes.values()]),
    estadosDeCuentaDeOperaciones(opIds),
    porIds(T_OPERACIONES, opIds, ["Código Operación", "Cliente Nombre"]),
    porIds("Shipping Proveedores", [...new Set(visibles.map((s) => s.proveedorId).filter((x): x is string => !!x))], ["Nombre proveedor"]),
  ]);

  const grupos = new Map<string, Solicitud[]>();
  for (const s of visibles) {
    const k = s.ordenId ? `o:${s.ordenId}` : `p:${s.operacionId ?? s.id}`;
    grupos.set(k, [...(grupos.get(k) ?? []), s]);
  }
  const out: FilaBandeja[] = [];
  for (const [k, lista] of grupos) {
    const esOrden = k.startsWith("o:");
    const id = k.slice(2);
    const pagado = esOrden ? cuentasOrden.get(id)?.totalAbonado ?? 0 : cuentasOp.get(id)?.totalAbonado ?? 0;
    const conChip = await conSituacion(lista, pagado);
    const reg = esOrden ? ordenes.get(id) : ops.get(id);
    const codigo = esOrden ? texto(reg?.fields["ID"]) : texto(reg?.fields["Código Operación"]);
    const cliente = esOrden ? texto(reg?.fields["ClienteTXT"]) : texto(reg?.fields["Cliente Nombre"]);
    for (const s of conChip) {
      out.push({
        ...s,
        para: [codigo || (esOrden ? "Orden" : "Pedido"), cliente].filter(Boolean).join(" · "),
        paraHref: esOrden ? `/tecnicos/ordenes/${id}` : s.operacionId ? `/operaciones/${s.operacionId}` : null,
        proveedorNombre: s.proveedorId ? texto(proveedores.get(s.proveedorId)?.fields["Nombre proveedor"]) : "",
        equipo: esOrden ? texto(reg?.fields["Equipo"]) : "",
      });
    }
  }
  return out;
}

/** Para "Registrar compra": las solicitudes marcadas, todavía por comprar. */
export async function solicitudesParaComprar(ids: string[]): Promise<Array<Solicitud & { para: string }>> {
  const lista = (await solicitudesPorIds(ids)).filter((s) => s.estado === "Por comprar");
  const ordenes = await porIds(T_ORDENES, lista.map((s) => s.ordenId).filter((x): x is string => !!x), ["ID", "ClienteTXT"]);
  const ops = await porIds(T_OPERACIONES, lista.filter((s) => !s.ordenId).map((s) => s.operacionId).filter((x): x is string => !!x), ["Código Operación", "Cliente Nombre"]);
  return lista.map((s) => {
    const o = s.ordenId ? ordenes.get(s.ordenId) : undefined;
    const p = !s.ordenId && s.operacionId ? ops.get(s.operacionId) : undefined;
    const para = o
      ? [texto(o.fields["ID"]), texto(o.fields["ClienteTXT"])].filter(Boolean).join(" · ")
      : [texto(p?.fields["Código Operación"]), texto(p?.fields["Cliente Nombre"])].filter(Boolean).join(" · ");
    return { ...s, para: para || "cliente" };
  });
}

// ─── 7. Chip del listado de órdenes ("Repuestos 2/3", "1 sin comprar") ──────

/** Resumen de repuestos bajo pedido de varias órdenes (solo las que tienen solicitudes). */
export async function resumenRepuestosDeOrdenes(ordenIds: string[]): Promise<Record<string, { texto: string; tono: string }>> {
  const { resumenRepuestos } = await import("./reglas");
  const conInverso = await porIds(T_ORDENES, ordenIds, [CAMPO_INVERSO]);
  const conSolicitudes = [...conInverso.values()].filter((o) => linkedIds(o.fields[CAMPO_INVERSO]).length > 0).map((o) => o.id);
  if (!conSolicitudes.length) return {};
  const ordenes = await porIds(T_ORDENES, conSolicitudes, [CAMPO_INVERSO, ...CAMPOS_ORDEN_CUENTA]);
  const cuentas = await estadosDeCuentaDeOrdenes([...ordenes.values()]);
  const todas = await solicitudesPorIds([...ordenes.values()].flatMap((o) => linkedIds(o.fields[CAMPO_INVERSO])));
  const out: Record<string, { texto: string; tono: string }> = {};
  for (const o of ordenes.values()) {
    const mias = todas.filter((s) => s.ordenId === o.id);
    const r = resumenRepuestos((await conSituacion(mias, cuentas.get(o.id)?.totalAbonado ?? 0)).map((s) => s.situacion));
    if (r) out[o.id] = r;
  }
  return out;
}
