import "server-only";

// Aprobar un presupuesto y CARGARLO a la orden.
//
// Es el único punto donde el presupuesto toca algo real, y lo hace con las
// mismas funciones que usan las tarjetas de la orden — no hay una segunda
// forma de crear un servicio, reservar un repuesto o asignar una licencia:
//   · Servicio         → createServicioPorOrden()        (tarjeta Servicios)
//   · Repuesto         → agregarRepuestoStockAOrden()    (tarjeta Repuestos V2)
//   · Producto digital → asignarProductoDigitalAOrden()  (tarjeta Productos digitales)
//
// Dos pasos, siempre: vista previa (no escribe nada) y confirmación. Al
// confirmar se recalcula todo con datos frescos, porque el stock pudo cambiar
// entre la vista previa y el clic.
//
// Una línea que no se puede cargar (repuesto sin stock, sin unidad digital
// libre) NO frena al resto: queda "Aprobada" con su motivo en "Nota de
// carga", y se reintenta después.

import { withLock } from "@/lib/concurrencia";
import { loadAirtableEnv } from "../config/airtable";
import {
  createServicioPorOrden,
  asignarProductoDigitalAOrden,
  fetchProductosDigitalesDisponibles,
  fetchProductosDigitalesPorOrden,
} from "../airtable";
import { agregarRepuestoStockAOrden } from "../repuestos-v2";
import { unidadesLibres, unidadesReservadas } from "@/lib/shipping-v2/unidades";
import { SHIPPING_V2_ITEM_FIELDS } from "@/lib/shipping-v2/schema.generated";
import {
  actualizarEstadoOperacion, pasarOperacionAPedido,
  crearOperacion, crearOpcion, setOpcionElegida, eliminarOperacionConOpciones,
} from "@/lib/operaciones/airtable";
import { soltarArticuloDePedido } from "@/lib/shipping-v2/airtable";
import { listarLineas, actualizarLinea, cargarInfoPedidos, clienteDeOrden } from "./airtable";
import {
  planDeCarga, fasePedido, reversasDisponibles, entradaHistorial,
  cargasPerdidas, cargosSinPresupuesto, conflictoAlternativas, hermanasPropuestas,
  type ContextoCarga, type LineaPresupuesto, type PasoCarga, type AccionReversa, type CargosPresentes } from "./reglas";

const T_ITEMS = "Shipping Items";
const T_ORDENES_TABLA = "Órdenes de Reparación";
const LINK_ORDEN_STOCK = "Orden de Reparación (Stock)";

type Registro = { id: string; fields: Record<string, unknown> };

async function itemsPorIds(lista: string[]): Promise<Registro[]> {
  const unicos = [...new Set(lista)].filter(Boolean);
  if (unicos.length === 0) return [];
  const { token, baseId } = loadAirtableEnv();
  const out: Registro[] = [];
  for (let i = 0; i < unicos.length; i += 40) {
    const lote = unicos.slice(i, i + 40);
    const u = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(T_ITEMS)}`);
    u.searchParams.set("filterByFormula", lote.length === 1 ? `RECORD_ID()='${lote[0]}'` : `OR(${lote.map((x) => `RECORD_ID()='${x}'`).join(",")})`);
    for (const f of [SHIPPING_V2_ITEM_FIELDS.sku, SHIPPING_V2_ITEM_FIELDS.precioVentaFinal, SHIPPING_V2_ITEM_FIELDS.cantidad,
      SHIPPING_V2_ITEM_FIELDS.cantidadReservada, SHIPPING_V2_ITEM_FIELDS.reservado, SHIPPING_V2_ITEM_FIELDS.disponibleVenta, LINK_ORDEN_STOCK]) {
      u.searchParams.append("fields[]", f);
    }
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`Airtable ${T_ITEMS} ${res.status}: ${await res.text()}`);
    out.push(...(((await res.json()) as { records?: Registro[] }).records ?? []));
  }
  return out;
}

const n = (v: unknown): number | null => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(x) ? x : null; };
const linkIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function construirContexto(ordenId: string, lineas: LineaPresupuesto[]): Promise<ContextoCarga> {
  const activas = lineas.filter((l) => l.estado === "Propuesta" || l.estado === "Aprobada");

  const items: ContextoCarga["items"] = new Map();
  for (const r of await itemsPorIds(activas.map((l) => l.itemId).filter((x): x is string => !!x))) {
    const f = r.fields;
    const unidades = {
      cantidad: n(f[SHIPPING_V2_ITEM_FIELDS.cantidad]) ?? 0,
      cantidadReservada: n(f[SHIPPING_V2_ITEM_FIELDS.cantidadReservada]) ?? 0,
      reservado: f[SHIPPING_V2_ITEM_FIELDS.reservado] === true,
    };
    const sku = typeof f[SHIPPING_V2_ITEM_FIELDS.sku] === "string" ? (f[SHIPPING_V2_ITEM_FIELDS.sku] as string) : r.id;
    let motivo: string | undefined;
    if (linkIds(f[LINK_ORDEN_STOCK]).includes(ordenId)) motivo = `${sku} ya está cargado en esta orden.`;
    // Misma distinción que reservarRepuestoDeOrdenSinTurno: "no disponible
    // para venta" sin nada comprometido = todavía no llegó (tránsito, packing).
    else if (f[SHIPPING_V2_ITEM_FIELDS.disponibleVenta] === false && unidadesReservadas(unidades) === 0) motivo = `${sku} todavía no está disponible para venta (¿en tránsito?).`;
    else if (unidadesLibres(unidades) < 1) motivo = `${sku} no tiene unidades libres (vendido o reservado para otra orden).`;
    items.set(r.id, { sku, disponible: !motivo, motivoNoDisponible: motivo, precio: n(f[SHIPPING_V2_ITEM_FIELDS.precioVentaFinal]) });
  }

  const unidadesDigitales: ContextoCarga["unidadesDigitales"] = new Map();
  const catalogos = new Set(activas.map((l) => l.productoCatalogoId).filter((x): x is string => !!x));
  if (catalogos.size > 0) {
    const disponibles = await fetchProductosDigitalesDisponibles();
    for (const cat of catalogos) {
      unidadesDigitales.set(
        cat,
        disponibles
          // "Disponible" ya no basta: vincular a una orden no cambia el
          // estado (ver asignarProductoDigitalAOrden). Libre = sin orden.
          .filter((p) => p.catalogoId === cat && !p.ordenReparacionId)
          .map((p) => ({ productoId: p.id, etiqueta: [p.softwareProducto, p.claveTruncada ?? p.usuarioCorreo ?? p.duracion].filter(Boolean).join(" · ") }))
      );
    }
  }

  const pedidos = await cargarInfoPedidos(activas.map((l) => l.operacionId).filter((x): x is string => !!x));

  return { items, unidadesDigitales, pedidos };
}

export async function vistaPrevia(ordenId: string, lineaIds: string[]): Promise<PasoCarga[]> {
  const lineas = (await listarLineas(ordenId)).filter((l) => lineaIds.includes(l.id));
  return planDeCarga(lineas, await construirContexto(ordenId, lineas));
}

export type ResultadoCarga = PasoCarga & {
  cargada: boolean;
  /** Repuesto bajo pedido: el cliente aprobó, falta comprarlo (no es un error). */
  esperandoPedido?: boolean;
  error?: string;
};

export async function aprobarYCargar(opts: {
  ordenId: string;
  lineaIds: string[];
  usuario: { nombre: string; id?: string | null };
}): Promise<ResultadoCarga[]> {
  // Turno por orden: un doble clic no puede crear el mismo servicio dos veces.
  return withLock(`presupuesto:${opts.ordenId}`, async () => {
    const todas = await listarLineas(opts.ordenId);
    const elegidas = todas.filter((l) => opts.lineaIds.includes(l.id));

    // Alternativas: se aprueba una sola por grupo; las demás que seguían
    // propuestas quedan rechazadas ("el cliente eligió otra").
    const conflicto = conflictoAlternativas(todas, elegidas.map((l) => l.id));
    if (conflicto) throw new Error(conflicto);
    for (const l of elegidas) {
      for (const h of hermanasPropuestas(todas, l)) {
        await actualizarLinea(h.id, {
          estado: "Rechazada",
          notaCarga: `El cliente eligió la alternativa "${l.descripcion}".`,
          agregarHistorial: { anterior: h.historial, entrada: entradaHistorial(`Descartada: el cliente eligió "${l.descripcion}".`, opts.usuario.nombre) },
        });
      }
    }

    // Una línea con cargo ya creado pero estado sin actualizar (se cortó a
    // mitad de camino) se da por cargada, nunca se vuelve a cargar.
    for (const l of elegidas) {
      if ((l.cargoServicioId || l.cargoProductoDigitalId) && l.estado !== "Cargada") {
        await actualizarLinea(l.id, { estado: "Cargada", notaCarga: "" });
        l.estado = "Cargada";
      }
    }

    const plan = planDeCarga(elegidas, await construirContexto(opts.ordenId, elegidas));
    const ahora = new Date().toISOString();
    const resultados: ResultadoCarga[] = [];

    for (const paso of plan) {
      const linea = elegidas.find((l) => l.id === paso.lineaId)!;
      const aprobacion = linea.estado === "Propuesta"
        ? {
            estado: "Aprobada" as const, aprobadoPor: opts.usuario.nombre, fechaAprobacion: ahora,
            agregarHistorial: { anterior: linea.historial, entrada: entradaHistorial("Aprobada por el cliente.", opts.usuario.nombre) },
          }
        : {};

      try {
        if (paso.accion.tipo === "crear_pedido_aprobado") {
          // Recién ahora nace la operación comercial, directamente "Aprobado":
          // no consume código ni aparece en el tablero mientras el cliente
          // todavía no responde.
          const operacionId = await crearOperacionAprobada(opts.ordenId, linea, opts.usuario.nombre);
          await actualizarLinea(linea.id, { ...aprobacion, operacionId, notaCarga: "Esperando pedido al proveedor." });
          resultados.push({ ...paso, cargada: false, esperandoPedido: true });
        } else if (paso.accion.tipo === "aprobar_pedido") {
          // La operación pasa a "Aprobado" en el tablero de Operaciones. El
          // artículo todavía no existe: nace cuando se le pide al proveedor
          // ("Ya se pidió al proveedor"), igual que desde Operaciones.
          await actualizarEstadoOperacion(paso.accion.operacionId, "Aprobado");
          await actualizarLinea(linea.id, { ...aprobacion, notaCarga: "Esperando pedido al proveedor." });
          resultados.push({ ...paso, cargada: false, esperandoPedido: true });
        } else if (paso.accion.tipo === "ya_en_inventario") {
          await actualizarLinea(linea.id, { ...aprobacion, estado: "Cargada", notaCarga: "" });
          resultados.push({ ...paso, cargada: true });
        } else if (paso.accion.tipo === "crear_servicio") {
          const creado = await createServicioPorOrden({
            ordenRecordId: opts.ordenId,
            catalogoServicioId: linea.servicioCatalogoId!,
            nombreSnapshot: linea.cantidad > 1 ? `${linea.descripcion} ×${linea.cantidad}` : linea.descripcion,
            costo: paso.accion.costo,
            observacion: "Cargado desde el presupuesto aprobado",
          });
          await actualizarLinea(linea.id, { ...aprobacion, estado: "Cargada", notaCarga: "", cargoServicioId: creado.id });
          resultados.push({ ...paso, cargada: true });
        } else if (paso.accion.tipo === "reservar_repuesto") {
          await agregarRepuestoStockAOrden({ ordenRecordId: opts.ordenId, itemId: paso.accion.itemId, registradoPor: opts.usuario.nombre });
          await actualizarLinea(linea.id, { ...aprobacion, estado: "Cargada", notaCarga: "" });
          resultados.push({ ...paso, cargada: true });
        } else if (paso.accion.tipo === "asignar_producto_digital") {
          await asignarProductoDigitalAOrden({
            productoId: paso.accion.productoId,
            ordenRecordId: opts.ordenId,
            precioVenta: linea.precioUnitario,
            usadoPorNombre: opts.usuario.nombre,
            usadoPorId: opts.usuario.id ?? null,
          });
          await actualizarLinea(linea.id, { ...aprobacion, estado: "Cargada", notaCarga: "", cargoProductoDigitalId: paso.accion.productoId });
          resultados.push({ ...paso, cargada: true });
        } else if (paso.accion.tipo === "pendiente") {
          await actualizarLinea(linea.id, { ...aprobacion, notaCarga: paso.accion.motivo });
          resultados.push({ ...paso, cargada: false });
        }
      } catch (e) {
        // Falló la carga real (p. ej. otro empleado reservó la unidad entre la
        // vista previa y el clic): la línea queda aprobada con el motivo.
        const msg = e instanceof Error ? e.message : String(e);
        await actualizarLinea(linea.id, { ...aprobacion, notaCarga: msg }).catch(() => {});
        resultados.push({ ...paso, cargada: false, error: msg });
      }
    }
    return resultados;
  });
}

// ─── "Ya se pidió al proveedor" ──────────────────────────────────────────────
// Pasa la operación a "Pedido" por el MISMO camino que el tablero de
// Operaciones (pasarOperacionAPedido): ahí nace el artículo en Shipping Items
// —compra pendiente de pago y de recepción— y queda en la cuenta de la orden
// por el vínculo orden↔operación. La línea pasa a Cargada con ese SKU.

export async function marcarPedidoAlProveedor(opts: {
  ordenId: string;
  lineaId: string;
  usuario: { nombre: string };
}): Promise<{ sku: string | null; aviso?: string }> {
  return withLock(`presupuesto:${opts.ordenId}`, async () => {
    const linea = (await listarLineas(opts.ordenId)).find((l) => l.id === opts.lineaId);
    if (!linea) throw new Error("Línea no encontrada en esta orden.");
    if (!linea.operacionId) throw new Error("Esta línea no es un repuesto bajo pedido.");
    if (linea.estado !== "Aprobada" && linea.estado !== "Cargada") {
      throw new Error("Primero el cliente tiene que aprobar el presupuesto.");
    }
    const info = (await cargarInfoPedidos([linea.operacionId])).get(linea.operacionId);
    if (!info) throw new Error("No se encontró la operación comercial de este repuesto.");
    const fase = fasePedido(info);
    if (fase === "vencido") throw new Error(`La operación ${info.codigo} está rechazada. Reactívala primero.`);

    let itemId = info.item?.id ?? null;
    let aviso: string | undefined;
    if (!itemId) {
      const r = await pasarOperacionAPedido(linea.operacionId, info.opcionElegidaId, opts.usuario.nombre);
      itemId = r.itemId ?? null;
      aviso = r.itemCreado ? undefined : r.aviso;
    }
    if (!itemId) {
      await actualizarLinea(linea.id, { notaCarga: aviso ?? "La operación pasó a Pedido pero no se creó el artículo. Revísala en Operaciones." });
      return { sku: null, aviso };
    }
    const actualizado = (await cargarInfoPedidos([linea.operacionId])).get(linea.operacionId);
    const sku = actualizado?.item?.sku ?? null;
    await actualizarLinea(linea.id, {
      estado: "Cargada", itemId, notaCarga: "",
      agregarHistorial: { anterior: linea.historial, entrada: entradaHistorial(`Pedido al proveedor${sku ? ` (${sku})` : ""}.`, opts.usuario.nombre) },
    });
    return { sku, aviso };
  });
}

// ─── Crear la operación comercial al aprobar ─────────────────────────────────

async function crearOperacionAprobada(ordenId: string, l: LineaPresupuesto, usuario: string): Promise<string> {
  const { clienteId, idVisible } = await clienteDeOrden(ordenId);
  if (!clienteId) throw new Error("La orden no tiene cliente vinculado: no se puede crear el pedido.");
  const operacionId = (await crearOperacion({
    clienteId,
    productoSolicitado: l.descripcion.trim(),
    categoria: l.categoria || "Repuesto",
    descripcionRequerimiento: `Repuesto bajo pedido para la orden ${idVisible}, aprobado por el cliente en el presupuesto.`,
    equipoEnTienda: true,
    ordenId,
  })).id;
  try {
    const opcion = await crearOpcion(operacionId, {
      productoDescripcion: l.descripcion.trim(),
      proveedorId: l.proveedorId,
      tiempoEstimado: l.tiempoEstimado || undefined,
      costoProveedor: l.costoProveedor,
      precioVentaCliente: l.precioUnitario,
      urlProveedor: l.urlProveedor || undefined,
      notaInterna: `Aprobado por el cliente en el presupuesto de ${idVisible} (registró ${usuario}).`,
    });
    await setOpcionElegida(operacionId, opcion.id);
    await actualizarEstadoOperacion(operacionId, "Aprobado");
    return operacionId;
  } catch (e) {
    // Sin operaciones a medio crear.
    await eliminarOperacionConOpciones(operacionId).catch((err) => console.error("[crearOperacionAprobada] limpieza:", err));
    throw e;
  }
}

// ─── Reversas ────────────────────────────────────────────────────────────────
// Qué se deshace en cada caso lo decide reversasDisponibles() (reglas.ts);
// aquí solo se ejecuta. El dinero abonado NO se mueve: queda a favor en la
// orden para aplicarlo a la alternativa o anularlo si se devuelve.

export async function revertirLinea(opts: {
  ordenId: string;
  lineaId: string;
  accion: AccionReversa;
  motivo: string;
  usuario: { nombre: string };
}): Promise<void> {
  return withLock(`presupuesto:${opts.ordenId}`, async () => {
    const linea = (await listarLineas(opts.ordenId)).find((l) => l.id === opts.lineaId);
    if (!linea) throw new Error("Línea no encontrada en esta orden.");
    const info = linea.operacionId ? (await cargarInfoPedidos([linea.operacionId])).get(linea.operacionId) : undefined;
    const r = reversasDisponibles(linea, info)[opts.accion];
    if (!r.permitido) throw new Error(r.motivo ?? "No se puede hacer esta acción ahora.");

    const motivo = opts.motivo.trim() || (opts.accion === "recotizar" ? "Proveedor sin disponibilidad." : opts.accion === "liberar" ? "El cliente desistió." : "El cliente desistió.");

    if (info?.item) {
      await soltarArticuloDePedido(info.item.id, {
        modo: opts.accion === "liberar" ? "liberar" : "cancelar",
        motivo,
        registradoPor: opts.usuario.nombre,
      });
    }
    // La operación queda cerrada (Rechazado) como constancia de lo que pasó:
    // el cliente sí la aprobó. No se borra.
    if (linea.operacionId && info && info.estadoOperacion !== "Rechazado") {
      await actualizarEstadoOperacion(linea.operacionId, "Rechazado");
    }

    const texto = opts.accion === "recotizar" ? `Recotizada: ${motivo}`
      : opts.accion === "liberar" ? `Liberada a inventario (${info?.item?.sku ?? ""}): ${motivo}`
      : `Cancelada después de aprobada: ${motivo}`;
    await actualizarLinea(linea.id, {
      estado: "Rechazada",
      notaCarga: texto,
      agregarHistorial: { anterior: linea.historial, entrada: entradaHistorial(texto, opts.usuario.nombre) },
    });
  });
}

// ─── Sincronizar con las tarjetas de la orden ────────────────────────────────
// El presupuesto y las tarjetas (Servicios, Repuestos, Productos digitales)
// son dos vistas de lo mismo. Un cargo se puede quitar desde su tarjeta —es lo
// natural cuando el cliente se arrepiente— y entonces la línea no puede
// seguir diciendo "Cargada". Esto se revisa al abrir el presupuesto y deja la
// línea en "Aprobada" con el motivo, sin tocar nada más.

export type ResumenCargos = ReturnType<typeof cargosSinPresupuesto>;

// Campos de la orden leídos POR ID (regla de la casa: nunca filtrar por campo
// de link; se leen los inversos que ya trae el registro de la orden).
const FID_ORDEN_SERVICIOS = "fldGH4Fdn7bDYrsTA";   // → "Servicios por Orden"
const FID_ORDEN_ITEMS_STOCK = "fldP4ThobFEWvT1uA"; // → Shipping Items (repuestos de stock)

async function cargosDeLaOrden(ordenId: string): Promise<CargosPresentes> {
  // Las MISMAS fuentes que las tarjetas de la orden. Si una falla, queda en
  // null y esa parte NO se revisa: mejor no enterarse que cambiarle el estado
  // a una línea por un error de red.
  const [orden, digitales] = await Promise.all([
    inversosDeLaOrden(ordenId).catch(() => null),
    fetchProductosDigitalesPorOrden(ordenId).then((r) => new Set(r.map((d) => d.id))).catch(() => null),
  ]);
  return {
    servicios: orden ? new Set(orden.servicios) : null,
    digitales,
    itemsEnOrden: orden ? new Set(orden.items) : null,
  };
}

async function inversosDeLaOrden(ordenId: string): Promise<{ servicios: string[]; items: string[] }> {
  const { token, baseId } = loadAirtableEnv();
  const u = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(T_ORDENES_TABLA)}/${encodeURIComponent(ordenId)}`);
  u.searchParams.set("returnFieldsByFieldId", "true");
  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Airtable ${res.status}`);
  const data = (await res.json()) as { fields?: Record<string, unknown> };
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return { servicios: ids(data.fields?.[FID_ORDEN_SERVICIOS]), items: ids(data.fields?.[FID_ORDEN_ITEMS_STOCK]) };
}

/**
 * Pone al día las líneas Cargadas cuyo cargo ya no está en la orden y cuenta
 * los cargos que nunca pasaron por el presupuesto (se agregaron directo desde
 * su tarjeta). Devuelve las líneas al día.
 */
export async function sincronizarConLasTarjetas(
  ordenId: string,
  lineas: LineaPresupuesto[],
  usuario = "Portal"
): Promise<{ lineas: LineaPresupuesto[]; cargosSinPresupuesto: ResumenCargos; hubo: boolean }> {
  const presentes = await cargosDeLaOrden(ordenId);
  const perdidas = cargasPerdidas(lineas, presentes);

  for (const p of perdidas) {
    const l = lineas.find((x) => x.id === p.lineaId)!;
    await actualizarLinea(l.id, {
      estado: "Aprobada",
      notaCarga: p.nota,
      cargoServicioId: null,
      cargoProductoDigitalId: null,
      agregarHistorial: { anterior: l.historial, entrada: entradaHistorial(p.nota, usuario) },
    });
    l.estado = "Aprobada";
    l.notaCarga = p.nota;
    l.cargoServicioId = null;
    l.cargoProductoDigitalId = null;
  }

  return { lineas, cargosSinPresupuesto: cargosSinPresupuesto(lineas, presentes), hubo: perdidas.length > 0 };
}
