import "server-only";

// Garantías SUPER GEEK — servidor (auditoría ops, punto 20 · 4-nov-2026).
// Reglas en ./reglas.ts. Aquí solo se lee, se escribe y se deja constancia.
//
//   · aplicarGarantiaALinea: proponer / confirmar / quitar desde la tarjeta
//     Presupuesto. Al confirmar, la línea se aprueba y se carga con la MISMA
//     función que usa "Aprobado en tienda" (aprobarYCargar): no hay una
//     segunda forma de cargar algo a una orden.
//   · sincronizarGarantiasDeLaOrden: al cambiar el estado de la orden. Si se
//     entrega, la pieza sale ("Salida por garantía"); si se reabre, vuelve.

import { withLock } from "@/lib/concurrencia";
import { loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { actualizarLinea, leerLinea, listarLineas } from "@/lib/tecnicos/presupuesto/airtable";
import { aprobarYCargar, type ResultadoCarga } from "@/lib/tecnicos/presupuesto/cargar";
import { entradaHistorial, type LineaPresupuesto } from "@/lib/tecnicos/presupuesto/reglas";
import { moverPiezaDeGarantia } from "@/lib/shipping-v2/airtable";
import { kardexPorCambio, leerItems } from "@/lib/shipping-v2/kardex-registro";
import {
  ESTADO_ORDEN_ENTREGADA, ETIQUETA_GARANTIA, MOTIVO_KARDEX_REVERSA, MOTIVO_KARDEX_SALIDA,
  esGarantiaConfirmada, evaluarGarantia, planGarantiasDeLaOrden,
  type AccionGarantia, type ArticuloParaGarantia,
} from "./reglas";

const LINK_ORDEN_STOCK = "Orden de Reparación (Stock)";

const texto = (v: unknown): string => (typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "");
const numero = (v: unknown): number => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : 0; };
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export class ErrorGarantia extends Error {}

export async function aplicarGarantiaALinea(opts: {
  ordenId: string;
  lineaId: string;
  accion: AccionGarantia;
  motivo?: string;
  esAdmin: boolean;
  usuario: { nombre: string; id?: string | null };
}): Promise<{ linea: LineaPresupuesto | null; resultados?: ResultadoCarga[] }> {
  // El turno del presupuesto solo para escribir la marca; aprobarYCargar pide
  // el suyo después (withLock no es reentrante).
  const evaluado = await withLock(`presupuesto:${opts.ordenId}`, async () => {
    const linea = await leerLinea(opts.lineaId);
    if (!linea || linea.ordenId !== opts.ordenId) throw new ErrorGarantia("Línea no encontrada en esta orden.");
    const r = evaluarGarantia(linea, opts.accion, { esAdmin: opts.esAdmin, nombre: opts.usuario.nombre, motivo: opts.motivo });
    if (!r.ok) throw new ErrorGarantia(r.error);
    await actualizarLinea(linea.id, {
      garantia: r.cambios.garantia,
      ...(r.cambios.motivoGarantia !== undefined ? { motivoGarantia: r.cambios.motivoGarantia } : {}),
      ...(r.cambios.garantiaConfirmadaPor !== undefined ? { garantiaConfirmadaPor: r.cambios.garantiaConfirmadaPor } : {}),
      ...(r.cambios.precioUnitario !== undefined ? { precioUnitario: r.cambios.precioUnitario } : {}),
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

async function idVisibleDeOrden(ordenId: string): Promise<string> {
  const { token, baseId } = loadAirtableEnv();
  const u = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Órdenes de Reparación")}/${encodeURIComponent(ordenId)}`);
  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return ordenId;
  const f = ((await res.json()) as { fields?: Record<string, unknown> }).fields ?? {};
  return texto(f["ID"]) || ordenId;
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

export type ResumenGarantias = { salidas: string[]; vueltas: string[]; avisos: string[] };

/**
 * Pone al día las piezas en garantía de la orden con su nuevo estado. Nunca
 * lanza: el cambio de estado ya se guardó; lo que no se pudo hacer vuelve
 * como aviso para la pantalla (y se puede repetir cambiando el estado otra
 * vez, porque la marca de la línea evita hacerlo dos veces).
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
  const resumen: ResumenGarantias = { salidas: [], vueltas: [], avisos: [] };
  try {
    const lineas = await listarLineas(opts.ordenId);
    const conGarantia = lineas.filter((l) => l.tipo === "Repuesto" && esGarantiaConfirmada(l) && l.estado === "Cargada");
    if (!conGarantia.length) return resumen;
    const entrega = opts.nuevoEstado === ESTADO_ORDEN_ENTREGADA;
    if (!conGarantia.some((l) => (l.garantiaEntregada === true) !== entrega)) return resumen;

    const campos = await leerItems(conGarantia.map((l) => l.itemId).filter((x): x is string => !!x));
    const articulos = new Map([...campos].map(([id, f]) => [id, articuloDeCampos(id, f)]));
    const pasos = planGarantiasDeLaOrden({ ordenId: opts.ordenId, nuevoEstado: opts.nuevoEstado, lineas: conGarantia, articulos });
    if (!pasos.length) return resumen;
    const ordenIdVisible = await idVisibleDeOrden(opts.ordenId);

    for (const paso of pasos) {
      if (paso.tipo === "omitir") { resumen.avisos.push(`Garantía: ${paso.motivo}`); continue; }
      const linea = conGarantia.find((l) => l.id === paso.lineaId)!;
      try {
        const { antes, despues } = await moverPiezaDeGarantia({
          itemId: paso.itemId, tipo: paso.tipo, ordenIdVisible, registradoPor: opts.hechoPor, motivoGarantia: linea.motivoGarantia ?? "",
        });
        await actualizarLinea(linea.id, {
          garantiaEntregada: paso.tipo === "salida",
          agregarHistorial: {
            anterior: linea.historial,
            entrada: entradaHistorial(paso.tipo === "salida"
              ? `${ETIQUETA_GARANTIA}: ${paso.sku} salió del inventario al entregar la orden (Kardex "${MOTIVO_KARDEX_SALIDA}").`
              : `${ETIQUETA_GARANTIA}: la orden se reabrió; ${paso.sku} vuelve a la tienda apartada (Kardex "${MOTIVO_KARDEX_REVERSA}").`, opts.hechoPor),
          },
        });
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
  } catch (e) {
    console.error("[garantias] sincronizar", opts.ordenId, e);
    resumen.avisos.push("Garantía: no se pudo revisar las piezas en garantía de la orden. Vuelve a guardar el estado.");
  }
  return resumen;
}
