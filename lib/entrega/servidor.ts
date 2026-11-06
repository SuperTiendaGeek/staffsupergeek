import "server-only";

// Entregar al cliente — servidor (auditoría ops, punto 6 · 6-nov-2026).
// La regla vive en ./reglas.ts. Aquí solo se LEE lo que la regla necesita y,
// si todo está en orden, se escribe la entrega y se cambia el estado con la
// MISMA función de siempre (updateOrdenEstado) + la salida de garantías.
// Es el ÚNICO camino a "Finalizado Entregado" desde el portal: la ruta
// /estado lo rechaza.

import { withLock } from "@/lib/concurrencia";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { buscarDocumentoBloqueante } from "@/lib/facturacion/gancho/idempotencia";
import { fetchCliente, fetchOrden, firstString, linkedIds } from "@/lib/facturacion/gancho/airtableGancho";
import { porIds, texto } from "@/lib/estado-cuenta/airtable";
import { listarLineas } from "@/lib/tecnicos/presupuesto/airtable";
import { solicitudesDeOperacion, solicitudesDeOrden } from "@/lib/compras/servidor";
import { updateOrdenEstado } from "@/lib/tecnicos/airtable";
import { sincronizarGarantiasDeLaOrden } from "@/lib/garantias/servidor";
import { loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import {
  ESTADO_ENTREGADA, armarPendientes, camposDeEntrega, evaluarEntrega,
  type DatosEntrega, type DocumentoDeEntrega, type EvaluacionEntrega,
} from "./reglas";

export class ErrorEntrega extends Error {
  constructor(message: string, readonly faltas: string[] = []) { super(message); }
}

export type RevisionEntrega = EvaluacionEntrega & {
  ordenCodigo: string;
  estadoOrden: string;
  saldo: number;
  totalCobrable: number;
  documento: DocumentoDeEntrega | null;
  /** Para precargar el formulario. */
  sugerido: { retiradoPor: string; accesorios: string };
};

async function revisar(ordenId: string, datos: DatosEntrega | null): Promise<RevisionEntrega> {
  const orden = await fetchOrden(ordenId);
  if (!orden) throw new ErrorEntrega("Orden no encontrada.");
  const estadoOrden = firstString(orden.fields["Estado Actual"]);
  const opIds = linkedIds(orden.fields["Operaciones Comerciales"]);
  const clienteId = linkedIds(orden.fields["Cliente"])[0];

  const [cuenta, doc, lineas, solOrden, solOps, ops, cliente] = await Promise.all([
    getCuentaUnificada({ ordenId }),
    buscarDocumentoBloqueante({ tipo: "orden", recordId: ordenId }),
    listarLineas(ordenId),
    solicitudesDeOrden(ordenId),
    Promise.all(opIds.map((id) => solicitudesDeOperacion(id))),
    porIds("Operación Comercial", opIds, ["Código Operación", "Estado", "Producto Solicitado"]),
    clienteId ? fetchCliente(clienteId) : Promise.resolve(null),
  ]);

  const documento: DocumentoDeEntrega | null = doc
    ? doc.tipo === "factura" ? { tipo: "factura", numero: doc.factura.numeroFactura } : { tipo: "recibo", numero: doc.recibo.numero }
    : null;
  const pendientes = armarPendientes({
    aprobadoSinArticulo: cuenta.aprobadoSinArticulo,
    lineaIds: new Set(lineas.map((l) => l.id)),
    solicitudes: [...solOrden, ...solOps.flat()].map((s) => ({
      lineaId: s.lineaId, operacionId: s.operacionId, descripcion: s.descripcion, clave: s.situacion.clave, texto: s.situacion.texto,
    })),
    operaciones: opIds.map((id) => {
      const r = ops.get(id);
      return { id, codigo: texto(r?.fields["Código Operación"]) || id, estado: texto(r?.fields["Estado"]), producto: texto(r?.fields["Producto Solicitado"]) };
    }),
  });
  const enGarantia = cuenta.items.filter((i) => i.garantia).length + cuenta.servicios.filter((s) => s.garantia).length;
  const ev = evaluarEntrega({
    estadoOrden, saldo: cuenta.saldo, totalCobrable: cuenta.totalCuenta, enGarantia, documento, pendientes, datos,
  });
  return {
    ...ev,
    ordenCodigo: firstString(orden.fields["ID"], ordenId),
    estadoOrden,
    saldo: Math.round(cuenta.saldo * 100) / 100,
    totalCobrable: Math.round(cuenta.totalCuenta * 100) / 100,
    documento,
    sugerido: {
      retiradoPor: cliente ? firstString(cliente.fields["Nombre"]) : "",
      accesorios: firstString(orden.fields["Accesorios"]).replace(/^No disponible$/i, ""),
    },
  };
}

/** Lo que muestra el panel al abrirse (no escribe nada). */
export function revisarEntrega(ordenId: string): Promise<RevisionEntrega> {
  return revisar(ordenId, null);
}

async function guardarCamposDeEntrega(ordenId: string, fields: Record<string, unknown>): Promise<void> {
  const { baseId, token } = loadAirtableEnv();
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Órdenes de Reparación")}/${ordenId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
}

export async function entregarOrden(input: {
  ordenId: string;
  datos: DatosEntrega;
  usuario: { nombre: string; email?: string | null; userId?: string | null };
}): Promise<{ comprobante: EvaluacionEntrega["comprobante"]; historial: unknown; garantias: Awaited<ReturnType<typeof sincronizarGarantiasDeLaOrden>> }> {
  return withLock(`entrega:${input.ordenId}`, async () => {
    // Se vuelve a revisar TODO en el servidor, justo antes de escribir: nunca
    // se confía en lo que vio la pantalla.
    const r = await revisar(input.ordenId, input.datos);
    if (!r.puedeEntregar) throw new ErrorEntrega(r.faltas[0] ?? "No se puede entregar todavía.", r.faltas);

    await guardarCamposDeEntrega(input.ordenId, camposDeEntrega({
      datos: input.datos, comprobante: r.comprobante, entregadoPor: input.usuario.nombre, ahora: new Date().toISOString(),
    }));
    const result = await updateOrdenEstado({
      ordenRecordId: input.ordenId,
      nuevoEstado: ESTADO_ENTREGADA,
      creadoPorNombre: input.usuario.nombre,
      creadoPorEmail: input.usuario.email ?? null,
      creadoPorUsuarioId: input.usuario.userId ?? null,
    });
    // Garantía SUPER GEEK (punto 20): las piezas en garantía salen del inventario.
    const garantias = await sincronizarGarantiasDeLaOrden({
      ordenId: input.ordenId,
      nuevoEstado: ESTADO_ENTREGADA,
      marca: result.historial?.id || new Date().toISOString(),
      hechoPor: input.usuario.nombre,
    });
    return { comprobante: r.comprobante, historial: result.historial ?? null, garantias };
  });
}
