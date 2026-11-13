import "server-only";

// Entregar un pedido especial — SERVIDOR (auditoría ops, punto 10C-2).
// La regla vive en ./entrega.ts. Es el ÚNICO camino a "Entregado" de un
// pedido especial: emitir la factura o el recibo ya no lo cierra (ver
// lib/facturacion/gancho/cierreCuenta.ts) y el tablero no deja marcarlo.

import { withLock } from "@/lib/concurrencia";
import { airtableMutation, fetchRecordById, tableUrl } from "@/lib/finanzas/airtable-client";
import { estadosDeCuentaDeOperaciones } from "@/lib/estado-cuenta/airtable";
import { buscarDocumentoBloqueante } from "@/lib/facturacion/gancho/idempotencia";
import { listarLineasDePedido } from "@/lib/tecnicos/presupuesto/airtable";
import { solicitudesDeOperacion } from "@/lib/compras/servidor";
import { entradaHistorial } from "@/lib/compras/reglas";
import type { DocumentoDeEntrega } from "@/lib/entrega/reglas";
import { estadoComercial } from "./reglas";
import { evaluarEntregaPedido, notaDeEntrega, type ArticuloParaEntrega, type EvaluacionEntregaPedido } from "./entrega";

const T_OPERACIONES = "Operación Comercial";
const LLEGO = new Set(["llego", "entregado"]);

const texto = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return texto(v[0]);
  return v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
};

export class ErrorEntregaPedido extends Error {
  constructor(message: string, readonly faltas: string[] = [], readonly status = 409) { super(message); }
}

export type RevisionEntregaPedido = EvaluacionEntregaPedido & {
  codigo: string;
  estado: string;
  saldo: number;
  total: number;
  documento: DocumentoDeEntrega | null;
  sugerido: { retiradoPor: string };
};

async function revisar(pedidoId: string, datos: { retiradoPor: string } | null): Promise<RevisionEntregaPedido> {
  const op = await fetchRecordById(T_OPERACIONES, pedidoId);
  if (!op) throw new ErrorEntregaPedido("El pedido no existe.", [], 404);
  const [lineas, solicitudes, cuentas, doc] = await Promise.all([
    listarLineasDePedido(pedidoId),
    solicitudesDeOperacion(pedidoId),
    estadosDeCuentaDeOperaciones([pedidoId]),
    buscarDocumentoBloqueante({ tipo: "operacion", recordId: pedidoId }),
  ]);
  const cuenta = cuentas.get(pedidoId);
  const articulos: ArticuloParaEntrega[] = lineas
    .filter((l) => l.estado === "Aprobada" || l.estado === "Cargada")
    .map((l) => {
      const s = solicitudes.filter((x) => x.lineaId === l.id && x.estado !== "Cancelada").pop();
      return { id: l.id, descripcion: l.descripcion, llego: !!s && LLEGO.has(s.situacion.clave), detalle: s ? s.situacion.texto : "Sin compra" };
    });
  const documento: DocumentoDeEntrega | null = doc
    ? doc.tipo === "factura" ? { tipo: "factura", numero: doc.factura.numeroFactura } : { tipo: "recibo", numero: doc.recibo.numero }
    : null;
  const estado = estadoComercial(texto(op.fields["Estado"]));
  const saldo = Math.round((cuenta?.saldo ?? 0) * 100) / 100;
  const total = Math.round((cuenta?.totalCuenta ?? 0) * 100) / 100;
  const ev = evaluarEntregaPedido({ estado, saldo, total, documento, articulos, datos });
  return {
    ...ev,
    codigo: texto(op.fields["Código Operación"]) || pedidoId,
    estado,
    saldo,
    total,
    documento,
    sugerido: { retiradoPor: texto(op.fields["Cliente Nombre"]) },
  };
}

/** Lo que muestra el panel al abrirse (no escribe nada). */
export function revisarEntregaPedido(pedidoId: string): Promise<RevisionEntregaPedido> {
  return revisar(pedidoId, null);
}

export async function entregarPedido(input: { pedidoId: string; retiradoPor: string; observacion?: string; usuario: string }): Promise<void> {
  return withLock(`pedido:${input.pedidoId}`, async () => {
    // Se vuelve a revisar TODO justo antes de escribir.
    const r = await revisar(input.pedidoId, { retiradoPor: input.retiradoPor });
    if (!r.puedeEntregar) throw new ErrorEntregaPedido(r.faltas[0] ?? "No se puede entregar todavía.", r.faltas);
    const op = await fetchRecordById(T_OPERACIONES, input.pedidoId);
    const obs = texto(op?.fields["Observación Interna"]);
    await airtableMutation(tableUrl(T_OPERACIONES), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{
          id: input.pedidoId,
          fields: {
            Estado: "Entregado",
            "Observación Interna": [obs.trim(), entradaHistorial(notaDeEntrega(input.retiradoPor, input.observacion), input.usuario)].filter(Boolean).join("\n"),
          },
        }],
      }),
    });
  });
}
