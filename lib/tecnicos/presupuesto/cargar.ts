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
} from "../airtable";
import { agregarRepuestoStockAOrden } from "../repuestos-v2";
import { unidadesLibres, unidadesReservadas } from "@/lib/shipping-v2/unidades";
import { SHIPPING_V2_ITEM_FIELDS } from "@/lib/shipping-v2/schema.generated";
import { listarLineas, actualizarLinea } from "./airtable";
import { planDeCarga, type ContextoCarga, type LineaPresupuesto, type PasoCarga } from "./reglas";

const T_ITEMS = "Shipping Items";
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

  return { items, unidadesDigitales };
}

export async function vistaPrevia(ordenId: string, lineaIds: string[]): Promise<PasoCarga[]> {
  const lineas = (await listarLineas(ordenId)).filter((l) => lineaIds.includes(l.id));
  return planDeCarga(lineas, await construirContexto(ordenId, lineas));
}

export type ResultadoCarga = PasoCarga & { cargada: boolean; error?: string };

export async function aprobarYCargar(opts: {
  ordenId: string;
  lineaIds: string[];
  usuario: { nombre: string; id?: string | null };
}): Promise<ResultadoCarga[]> {
  // Turno por orden: un doble clic no puede crear el mismo servicio dos veces.
  return withLock(`presupuesto:${opts.ordenId}`, async () => {
    const todas = await listarLineas(opts.ordenId);
    const elegidas = todas.filter((l) => opts.lineaIds.includes(l.id));

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
        ? { estado: "Aprobada" as const, aprobadoPor: opts.usuario.nombre, fechaAprobacion: ahora }
        : {};

      try {
        if (paso.accion.tipo === "crear_servicio") {
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
        } else {
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
