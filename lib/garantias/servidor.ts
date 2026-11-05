import "server-only";

// Garantías SUPER GEEK — servidor (auditoría ops, punto 20 · 4-nov-2026).
// Reglas en ./reglas.ts y ./plazos.ts. Aquí solo se lee, se escribe y se deja constancia.
//
//   · origenesDeGarantia: lo que el cliente compró o recibió en garantía, con
//     su plazo, para elegir "¿Qué falló?" (como el "Warranty claim" de RepairDesk).
//   · aplicarGarantiaALinea: proponer / confirmar / quitar desde la tarjeta
//     Presupuesto. Al confirmar, la línea se aprueba y se carga con la MISMA
//     función que usa "Aprobado en tienda" (aprobarYCargar): no hay una
//     segunda forma de cargar algo a una orden.
//   · elegirPiezaRetirada: qué pasa con la pieza mala que se le saca al equipo.
//   · sincronizarGarantiasDeLaOrden: al cambiar el estado de la orden. Si se
//     entrega, la pieza sale ("Salida por garantía"), queda la fecha desde la
//     que cuenta su nueva garantía y, si se reclama al proveedor, la pieza mala
//     entra a Shipping V2 con su novedad. Si se reabre, la pieza vuelve.

import { withLock } from "@/lib/concurrencia";
import { loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { actualizarLinea, leerLinea, lineasPorIds, listarLineas } from "@/lib/tecnicos/presupuesto/airtable";
import { aprobarYCargar, type ResultadoCarga } from "@/lib/tecnicos/presupuesto/cargar";
import { entradaHistorial, type LineaPresupuesto } from "@/lib/tecnicos/presupuesto/reglas";
import { createShippingV2Item, createShippingV2ItemNovedad, moverPiezaDeGarantia } from "@/lib/shipping-v2/airtable";
import { systemShippingV2Access } from "@/lib/shipping-v2/access";
import { ORIGEN_TIENDA, TIPO_PIEZA_RETIRADA_GARANTIA } from "@/lib/shipping-v2/item-origen";
import { kardexPorCambio, leerItems } from "@/lib/shipping-v2/kardex-registro";
import { ids, numero, porIds, texto, type Registro } from "@/lib/estado-cuenta/airtable";
import { esDePruebas, tonoDeDocumento } from "@/lib/clientes/historial";
import { hoyEcuador } from "@/lib/saldo-favor/servidor";
import {
  ESTADO_ORDEN_ENTREGADA, ETIQUETA_GARANTIA, MOTIVO_KARDEX_REVERSA, MOTIVO_KARDEX_SALIDA,
  errorPiezaRetirada, esGarantiaConfirmada, evaluarGarantia, planGarantiasDeLaOrden, reclamosPendientes, sinDestinoDePieza,
  type AccionGarantia, type ArticuloParaGarantia, type PiezaRetirada,
} from "./reglas";
import { armarOrigenes, textoOrigen, type DocumentoLeido, type GarantiaAnteriorLeida, type OrigenGarantia } from "./plazos";

const T_ORDENES = "Órdenes de Reparación";
const LINK_ORDEN_STOCK = "Orden de Reparación (Stock)";

export class ErrorGarantia extends Error {}

// ─── Lecturas ────────────────────────────────────────────────────────────────

async function registro(tabla: string, id: string): Promise<Registro | null> {
  const { token, baseId } = loadAirtableEnv();
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tabla)}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Airtable ${tabla}/${id}: HTTP ${res.status}`);
  return (await res.json()) as Registro;
}

const CAMPOS_ITEM = ["SKU", "Nombre del item", "Categoría", "Proveedor de compra"];

/**
 * Lo que el cliente de esta orden puede reclamar en garantía: los artículos y
 * servicios de sus facturas y recibos vigentes (no de pruebas) y las piezas o
 * servicios que ya recibió en garantía en otras órdenes. Con su plazo y si
 * sigue vigente (./plazos.ts).
 */
export async function origenesDeGarantia(ordenId: string): Promise<OrigenGarantia[]> {
  const orden = await registro(T_ORDENES, ordenId);
  if (!orden) throw new ErrorGarantia("Orden no encontrada.");
  const clienteId = ids(orden.fields["Cliente"])[0];
  if (!clienteId) return [];
  const cliente = await registro("Clientes", clienteId);
  if (!cliente) return [];
  const f = cliente.fields;

  const [facturas, recibos, ordenes] = await Promise.all([
    porIds("Facturas Electrónicas", ids(f["Facturas Electrónicas"]), ["Número de Factura", "Fecha de Emisión", "Estado", "Ambiente", "Estado Anulación", "Shipping Items", "Orden"]),
    porIds("Recibos", ids(f["Recibos"]), ["Número", "Fecha", "Estado", "Shipping Items", "Orden"]),
    porIds(T_ORDENES, ids(f["Órdenes Relacionadas"]), ["ID", "Servicios por Orden", "Presupuesto por Orden"]),
  ]);
  type Doc = { id: string; etiqueta: string; fecha: string; itemIds: string[]; ordenIds: string[] };
  const docs: Doc[] = [];
  for (const r of facturas.values()) {
    const d = { tipo: "factura" as const, estado: texto(r.fields["Estado"]), estadoAnulacion: texto(r.fields["Estado Anulación"]) };
    if (tonoDeDocumento(d) !== "ok" || esDePruebas(texto(r.fields["Ambiente"]))) continue;
    docs.push({ id: r.id, etiqueta: `Factura ${texto(r.fields["Número de Factura"])}`, fecha: texto(r.fields["Fecha de Emisión"]) || r.createdTime || "", itemIds: ids(r.fields["Shipping Items"]), ordenIds: ids(r.fields["Orden"]) });
  }
  for (const r of recibos.values()) {
    if (tonoDeDocumento({ tipo: "recibo", estado: texto(r.fields["Estado"]) }) !== "ok") continue;
    docs.push({ id: r.id, etiqueta: texto(r.fields["Número"]) || "Recibo", fecha: texto(r.fields["Fecha"]) || r.createdTime || "", itemIds: ids(r.fields["Shipping Items"]), ordenIds: ids(r.fields["Orden"]) });
  }

  // Servicios de las órdenes que cerró cada documento.
  const ordenesDocs = [...new Set(docs.flatMap((d) => d.ordenIds))];
  const ordenesExtra = await porIds(T_ORDENES, ordenesDocs.filter((id) => !ordenes.has(id)), ["ID", "Servicios por Orden", "Presupuesto por Orden"]);
  const todasOrdenes = new Map([...ordenes, ...ordenesExtra]);
  const servicioIds = [...new Set(ordenesDocs.flatMap((id) => ids(todasOrdenes.get(id)?.fields["Servicios por Orden"])))];
  const servicios = await porIds("Servicios por Orden", servicioIds, ["Nombre del servicio snapshot o copiado", "Servicio del Catálogo"]);

  // Garantías ya entregadas en otras órdenes del cliente.
  const otras = [...ordenes.values()].filter((o) => o.id !== ordenId);
  const lineasOtras = (await lineasPorIds(otras.flatMap((o) => ids(o.fields["Presupuesto por Orden"]))))
    .filter((l) => esGarantiaConfirmada(l) && l.fechaEntregaGarantia);
  const codigoDeLinea = new Map<string, string>();
  for (const o of otras) for (const lid of ids(o.fields["Presupuesto por Orden"])) codigoDeLinea.set(lid, texto(o.fields["ID"]) || o.id);

  const catalogoIds = [...new Set([
    ...[...servicios.values()].flatMap((s) => ids(s.fields["Servicio del Catálogo"])),
    ...lineasOtras.map((l) => l.servicioCatalogoId).filter((x): x is string => !!x),
  ])];
  const itemIds = [...new Set([...docs.flatMap((d) => d.itemIds), ...lineasOtras.map((l) => l.itemId).filter((x): x is string => !!x)])];
  const [catalogo, items] = await Promise.all([
    porIds("Catálogo Servicios", catalogoIds, ["Garantía (días)"]),
    porIds("Shipping Items", itemIds, CAMPOS_ITEM),
  ]);
  const diasDe = (catId: string | undefined | null) => {
    const v = catId ? catalogo.get(catId)?.fields["Garantía (días)"] : undefined;
    return typeof v === "number" ? v : null;
  };
  const articulo = (id: string) => {
    const it = items.get(id);
    return {
      id, sku: texto(it?.fields["SKU"]), nombre: texto(it?.fields["Nombre del item"]) || "Artículo",
      categoria: texto(it?.fields["Categoría"]), proveedorId: ids(it?.fields["Proveedor de compra"])[0] ?? null,
    };
  };

  const documentos: DocumentoLeido[] = docs.map((d) => ({
    id: d.id, etiqueta: d.etiqueta, fecha: d.fecha,
    articulos: d.itemIds.map(articulo),
    servicios: d.ordenIds.flatMap((oid) => ids(todasOrdenes.get(oid)?.fields["Servicios por Orden"]))
      .map((sid) => servicios.get(sid)).filter((s): s is Registro => !!s)
      .map((s) => ({ id: s.id, nombre: texto(s.fields["Nombre del servicio snapshot o copiado"]) || "Servicio", diasCatalogo: diasDe(ids(s.fields["Servicio del Catálogo"])[0]) })),
  }));
  const garantias: GarantiaAnteriorLeida[] = lineasOtras.map((l) => {
    const a = l.itemId ? articulo(l.itemId) : null;
    return {
      lineaId: l.id, ordenCodigo: codigoDeLinea.get(l.id) ?? "otra orden", nombre: l.descripcion, sku: a?.sku ?? "",
      categoria: a?.categoria ?? "", tipoLinea: l.tipo, diasCatalogo: diasDe(l.servicioCatalogoId),
      fechaEntrega: l.fechaEntregaGarantia ?? "", itemId: l.itemId, proveedorId: a?.proveedorId ?? null,
    };
  });
  return armarOrigenes({ documentos, garantias, hoy: hoyEcuador() });
}

// ─── Proponer / confirmar / quitar ───────────────────────────────────────────

export async function aplicarGarantiaALinea(opts: {
  ordenId: string;
  lineaId: string;
  accion: AccionGarantia;
  motivo?: string;
  /** Clave de "¿Qué falló?" (origenesDeGarantia). null/"" = sin documento (cortesía). */
  origenClave?: string | null;
  esAdmin: boolean;
  usuario: { nombre: string; id?: string | null };
}): Promise<{ linea: LineaPresupuesto | null; resultados?: ResultadoCarga[] }> {
  // El origen se busca otra vez en el servidor: nunca se confía en el plazo que mande la pantalla.
  let origen: OrigenGarantia | null = null;
  if (opts.accion === "proponer" && opts.origenClave) {
    origen = (await origenesDeGarantia(opts.ordenId)).find((o) => o.clave === opts.origenClave) ?? null;
    if (!origen) throw new ErrorGarantia("No se encontró lo que falló entre las compras del cliente. Vuelve a elegirlo.");
  }

  // El turno del presupuesto solo para escribir la marca; aprobarYCargar pide
  // el suyo después (withLock no es reentrante).
  const evaluado = await withLock(`presupuesto:${opts.ordenId}`, async () => {
    const linea = await leerLinea(opts.lineaId);
    if (!linea || linea.ordenId !== opts.ordenId) throw new ErrorGarantia("Línea no encontrada en esta orden.");
    const r = evaluarGarantia(linea, opts.accion, {
      esAdmin: opts.esAdmin, nombre: opts.usuario.nombre, motivo: opts.motivo,
      origen: origen ? { clave: origen.clave, texto: textoOrigen(origen), vence: origen.vence, vigente: origen.vigente } : null,
    });
    if (!r.ok) throw new ErrorGarantia(r.error);
    const c = r.cambios;
    await actualizarLinea(linea.id, {
      garantia: c.garantia,
      ...(c.motivoGarantia !== undefined ? { motivoGarantia: c.motivoGarantia } : {}),
      ...(c.garantiaConfirmadaPor !== undefined ? { garantiaConfirmadaPor: c.garantiaConfirmadaPor } : {}),
      ...(c.precioUnitario !== undefined ? { precioUnitario: c.precioUnitario } : {}),
      ...(c.garantiaDe !== undefined ? { garantiaDe: c.garantiaDe } : {}),
      ...(c.garantiaOrigenId !== undefined ? { garantiaOrigenId: c.garantiaOrigenId } : {}),
      ...(c.garantiaVence !== undefined ? { garantiaVence: c.garantiaVence } : {}),
      ...(c.garantiaCortesia !== undefined ? { garantiaCortesia: c.garantiaCortesia } : {}),
      agregarHistorial: { anterior: linea.historial, entrada: entradaHistorial(r.historial, opts.usuario.nombre) },
    });
    return r;
  });

  if (!evaluado.aprobar) return { linea: await leerLinea(opts.lineaId) };
  // Confirmada: se aprueba sin pasar por el cliente y se carga como cualquier
  // línea (aparta la pieza o crea su solicitud de compra).
  const resultados = await aprobarYCargar({
    ordenId: opts.ordenId,
    lineaIds: [opts.lineaId],
    usuario: opts.usuario,
    textoAprobacion: `${ETIQUETA_GARANTIA}: aprobada por la tienda, sin costo para el cliente.`,
  });
  return { linea: await leerLinea(opts.lineaId), resultados };
}

export async function elegirPiezaRetirada(opts: { ordenId: string; lineaId: string; destino: PiezaRetirada | ""; usuario: string }): Promise<LineaPresupuesto | null> {
  return withLock(`presupuesto:${opts.ordenId}`, async () => {
    const linea = await leerLinea(opts.lineaId);
    if (!linea || linea.ordenId !== opts.ordenId) throw new ErrorGarantia("Línea no encontrada en esta orden.");
    const error = errorPiezaRetirada(linea, opts.destino);
    if (error) throw new ErrorGarantia(error);
    if ((linea.piezaRetirada ?? "") === opts.destino) return linea;
    await actualizarLinea(linea.id, {
      piezaRetirada: opts.destino,
      agregarHistorial: { anterior: linea.historial, entrada: entradaHistorial(`Pieza retirada: ${opts.destino || "sin definir"}.`, opts.usuario) },
    });
    return leerLinea(opts.lineaId);
  });
}

// ─── La entrega ──────────────────────────────────────────────────────────────

async function idVisibleDeOrden(ordenId: string): Promise<string> {
  const o = await registro(T_ORDENES, ordenId).catch(() => null);
  return texto(o?.fields["ID"]) || ordenId;
}

function articuloDeCampos(id: string, f: Record<string, unknown>): ArticuloParaGarantia {
  return {
    id,
    sku: texto(f["SKU"]) || id,
    estado: texto(f["Estado Item"]),
    recibido: f["Recibido"] === true,
    cantidad: numero(f["Cantidad"]),
    cantidadReservada: numero(f["Cantidad Reservada"]),
    reservado: f["Reservado"] === true,
    ordenesStock: ids(f[LINK_ORDEN_STOCK]),
  };
}

/** El artículo original de la garantía (lo que falló), si se conoce. */
async function articuloOriginal(l: LineaPresupuesto): Promise<{ id: string; f: Record<string, unknown> } | null> {
  const clave = l.garantiaOrigenId ?? "";
  let itemId: string | null = null;
  if (clave.startsWith("articulo:")) itemId = clave.slice("articulo:".length).split("@")[0] || null;
  else if (clave.startsWith("garantia:")) itemId = (await leerLinea(clave.slice("garantia:".length)))?.itemId ?? null;
  if (!itemId) return null;
  const f = (await leerItems([itemId])).get(itemId);
  return f ? { id: itemId, f } : null;
}

/**
 * "Reclamar al proveedor": la pieza mala entra a Shipping V2 (costo $0, no se
 * vende) con una novedad "Falla de funcionamiento" al proveedor de la pieza
 * original, que bloquea su venta. Desde ahí sigue el reclamo como cualquier
 * novedad (respuesta del proveedor: reemplazo, reembolso, crédito…).
 */
async function registrarReclamo(l: LineaPresupuesto, ordenIdVisible: string, hechoPor: string): Promise<string> {
  const original = await articuloOriginal(l);
  const nuevo = l.itemId ? (await leerItems([l.itemId])).get(l.itemId) : undefined;
  const nombreOriginal = texto(original?.f["Nombre del item"]) || l.descripcion;
  const skuOriginal = texto(original?.f["SKU"]);
  const proveedorId = original ? ids(original.f["Proveedor de compra"])[0] : undefined;
  const categoria = texto(original?.f["Categoría"]) || texto(nuevo?.["Categoría"]) || "Repuesto";
  const creado = await createShippingV2Item(
    {
      nombre: `Pieza retirada en garantía · ${nombreOriginal}`.slice(0, 200),
      tipoOperacion: TIPO_PIEZA_RETIRADA_GARANTIA,
      tipoItem: "",
      categoria,
      condicion: "Dañado",
      estado: "Disponible",
      origenArticulo: ORIGEN_TIENDA,
      cantidad: 1,
      costoProveedor: 0,
      disponibleVenta: false,
      requiereInspeccion: false,
      ...(proveedorId ? { proveedorId } : {}),
      observacionesInternas: [
        `Pieza mala retirada en la garantía de ${ordenIdVisible}${skuOriginal ? ` (era ${skuOriginal})` : ""}.`,
        l.garantiaDe ? `Garantía de: ${l.garantiaDe}.` : "",
        l.motivoGarantia ? `Motivo: ${l.motivoGarantia}` : "",
        "No se vende: se reclama al proveedor.",
      ].filter(Boolean).join(" "),
    },
    { registradoPor: hechoPor, typecast: true, eventDescription: `Pieza retirada en la garantía de ${ordenIdVisible}, para reclamarla al proveedor.` },
  );
  await createShippingV2ItemNovedad(
    creado.id,
    {
      tipo: "Falla de funcionamiento",
      responsable: proveedorId ? "Proveedor" : "SUPER GEEK",
      bloquearVenta: true,
      descripcion: `Garantía de ${ordenIdVisible}: ${l.motivoGarantia || "la pieza falló"}${skuOriginal ? ` (pieza original ${skuOriginal})` : ""}.${proveedorId ? "" : " No se conoce el proveedor de la pieza original: revisar."}`,
    },
    { registradoPor: hechoPor, access: { ...systemShippingV2Access(), isAdmin: true } },
  );
  return creado.sku ?? creado.id;
}

export type ResumenGarantias = { salidas: string[]; vueltas: string[]; reclamos: string[]; avisos: string[] };

/**
 * Pone al día las garantías de la orden con su nuevo estado. Nunca lanza: el
 * cambio de estado ya se guardó; lo que no se pudo hacer vuelve como aviso
 * para la pantalla (y se puede repetir cambiando el estado otra vez, porque
 * las marcas de la línea evitan hacerlo dos veces).
 *
 * `marca` identifica ESTE cambio de estado (el registro del historial): con
 * ella la clave del Kardex no se repite si la misma petición se reintenta.
 */
export async function sincronizarGarantiasDeLaOrden(opts: {
  ordenId: string;
  nuevoEstado: string;
  marca: string;
  hechoPor: string;
}): Promise<ResumenGarantias> {
  const resumen: ResumenGarantias = { salidas: [], vueltas: [], reclamos: [], avisos: [] };
  try {
    const lineas = await listarLineas(opts.ordenId);
    const conGarantia = lineas.filter((l) => esGarantiaConfirmada(l) && l.estado === "Cargada");
    if (!conGarantia.length) return resumen;
    const entrega = opts.nuevoEstado === ESTADO_ORDEN_ENTREGADA;
    const hayCambios = conGarantia.some((l) => (l.garantiaEntregada === true) !== entrega);
    if (!hayCambios && !(entrega && reclamosPendientes(conGarantia).length)) return resumen;

    const campos = await leerItems(conGarantia.map((l) => l.itemId).filter((x): x is string => !!x));
    const articulos = new Map([...campos].map(([id, f]) => [id, articuloDeCampos(id, f)]));
    const pasos = planGarantiasDeLaOrden({ ordenId: opts.ordenId, nuevoEstado: opts.nuevoEstado, lineas: conGarantia, articulos });
    const ordenIdVisible = await idVisibleDeOrden(opts.ordenId);
    const ahora = new Date().toISOString();

    for (const paso of pasos) {
      if (paso.tipo === "omitir") { resumen.avisos.push(`Garantía: ${paso.motivo}`); continue; }
      const linea = conGarantia.find((l) => l.id === paso.lineaId)!;
      if (paso.tipo === "marcar") {
        await actualizarLinea(linea.id, { garantiaEntregada: paso.entregada, fechaEntregaGarantia: paso.entregada ? ahora : "" })
          .catch((e) => { console.error("[garantias] marcar servicio", e); resumen.avisos.push(`Garantía: no se pudo marcar "${linea.descripcion}". Vuelve a guardar el estado.`); });
        linea.garantiaEntregada = paso.entregada;
        continue;
      }
      try {
        const { antes, despues } = await moverPiezaDeGarantia({
          itemId: paso.itemId, tipo: paso.tipo, ordenIdVisible, registradoPor: opts.hechoPor, motivoGarantia: linea.motivoGarantia ?? "",
        });
        await actualizarLinea(linea.id, {
          garantiaEntregada: paso.tipo === "salida",
          fechaEntregaGarantia: paso.tipo === "salida" ? ahora : "",
          agregarHistorial: {
            anterior: linea.historial,
            entrada: entradaHistorial(paso.tipo === "salida"
              ? `${ETIQUETA_GARANTIA}: ${paso.sku} salió del inventario al entregar la orden (Kardex "${MOTIVO_KARDEX_SALIDA}").`
              : `${ETIQUETA_GARANTIA}: la orden se reabrió; ${paso.sku} vuelve a la tienda apartada (Kardex "${MOTIVO_KARDEX_REVERSA}").`, opts.hechoPor),
          },
        });
        linea.garantiaEntregada = paso.tipo === "salida";
        await kardexPorCambio({
          itemId: paso.itemId,
          antes,
          despues,
          motivo: paso.tipo === "salida" ? MOTIVO_KARDEX_SALIDA : MOTIVO_KARDEX_REVERSA,
          clave: `garantia|${paso.tipo}|${linea.id}|${opts.marca}`,
          contexto: {
            documento: ordenIdVisible,
            documentoTipo: "Orden de reparación",
            documentoId: opts.ordenId,
            hechoPor: opts.hechoPor,
            nota: linea.motivoGarantia || ETIQUETA_GARANTIA,
          },
        });
        (paso.tipo === "salida" ? resumen.salidas : resumen.vueltas).push(paso.sku);
      } catch (e) {
        console.error("[garantias] no se pudo mover la pieza", paso, e);
        resumen.avisos.push(`Garantía: no se pudo ${paso.tipo === "salida" ? "sacar" : "devolver"} ${paso.sku} del inventario (${e instanceof Error ? e.message : String(e)}). Vuelve a guardar el estado.`);
      }
    }

    if (entrega) {
      // La pieza mala que se reclama al proveedor entra a Shipping V2 con su novedad.
      for (const l of reclamosPendientes(conGarantia)) {
        try {
          const sku = await registrarReclamo(l, ordenIdVisible, opts.hechoPor);
          await actualizarLinea(l.id, {
            piezaRetiradaSku: sku,
            agregarHistorial: { anterior: l.historial, entrada: entradaHistorial(`Pieza retirada registrada en Shipping V2 (${sku}) con una novedad para reclamarla al proveedor.`, opts.hechoPor) },
          });
          resumen.reclamos.push(sku);
        } catch (e) {
          console.error("[garantias] reclamo", l.id, e);
          resumen.avisos.push(`Garantía: no se pudo registrar la pieza retirada de "${l.descripcion}" para el reclamo (${e instanceof Error ? e.message : String(e)}). Vuelve a guardar el estado.`);
        }
      }
      const sinDestino = sinDestinoDePieza(conGarantia);
      if (sinDestino.length) resumen.avisos.push(`Garantía: falta decir qué pasa con la pieza retirada de ${sinDestino.map((d) => `"${d}"`).join(", ")} (en la tarjeta Presupuesto).`);
    }
  } catch (e) {
    console.error("[garantias] sincronizar", opts.ordenId, e);
    resumen.avisos.push("Garantía: no se pudo revisar las garantías de la orden. Vuelve a guardar el estado.");
  }
  return resumen;
}
