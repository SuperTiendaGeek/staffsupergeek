import "server-only";

// Plazos de retiro — SERVIDOR (auditoría ops, punto 10C-3b). Reglas en ./retiro.ts.
//   · aplicarRecargos: proceso diario (Vercel Cron) que pone el recargo del día 7.
//   · quitarRecargo: un administrador, con motivo; ya no se vuelve a poner.
//   · liberarPedido: un administrador, desde el 4.º mes: es la cancelación del
//     caso (c) — artículo a la tienda, TODO lo pagado a saldo a favor.
// La fecha de llegada sale del lector único del seguimiento (hito "¡Llegó!").

import { isAdministratorRole } from "@/lib/apps";
import { withLock } from "@/lib/concurrencia";
import { airtableMutation, airtableRequest, fetchRecordById, tableUrl, type AirtableListResponse, type AirtableRecord } from "@/lib/finanzas/airtable-client";
import { estadosDeCuentaDeOperaciones } from "@/lib/estado-cuenta/airtable";
import { entradaHistorial } from "@/lib/compras/reglas";
import { CAMPO_LINEAS_DEL_PEDIDO } from "@/lib/tecnicos/presupuesto/airtable";
import { nombreUsuario } from "@/lib/saldo-favor/servidor";
import type { StaffSession } from "@/lib/session";
import { estadoComercial } from "./reglas";
import { fechaDeLlegada } from "./seguimiento";
import { seguimientosDePedidos } from "./seguimiento-servidor";
import { CAMPO_RECARGO, CAMPO_RECARGO_QUITADO } from "./cancelacion";
import { cancelarPedidoEspecial, ErrorCancelacion } from "./cancelacion-servidor";
import { debeLiberarse, hoyEcuador, notaRecargoQuitado, plazosDeRetiro, recargoQueCorresponde, textoPlazos } from "./retiro";

const T_OPERACIONES = "Operación Comercial";
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const usd = (n: number) => `$${r2(n).toFixed(2).replace(/\.00$/, "")}`;
const texto = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return texto(v[0]);
  return v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
};
const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Fecha de llegada de varios pedidos (id → ISO/fecha), en bloque. */
export async function llegadasDePedidos(pedidoIds: string[], ahora: Date = new Date()): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!pedidoIds.length) return out;
  const seg = await seguimientosDePedidos(pedidoIds, ahora);
  for (const [id, s] of seg) {
    const f = fechaDeLlegada(s);
    if (f) out.set(id, f);
  }
  return out;
}

async function pedidosAceptados(): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset = "";
  do {
    const url = new URL(tableUrl(T_OPERACIONES));
    url.searchParams.set("filterByFormula", `{Estado}='Aceptado'`);
    url.searchParams.set("pageSize", "100");
    for (const c of ["Código Operación", "Estado", CAMPO_RECARGO, CAMPO_RECARGO_QUITADO, "Observación Interna", CAMPO_LINEAS_DEL_PEDIDO]) url.searchParams.append("fields[]", c);
    if (offset) url.searchParams.set("offset", offset);
    const r = await airtableRequest<AirtableListResponse>(url.toString());
    out.push(...(r.records ?? []));
    offset = r.offset ?? "";
  } while (offset);
  // Solo pedidos especiales (con líneas): los viejos no tienen seguimiento.
  return out.filter((r) => Array.isArray(r.fields[CAMPO_LINEAS_DEL_PEDIDO]) && (r.fields[CAMPO_LINEAS_DEL_PEDIDO] as unknown[]).length > 0);
}

/** Proceso diario: pone el recargo del día 7 (una vez). `aplicar: false` = vista previa. */
export async function aplicarRecargos(input: { aplicar: boolean; ahora?: Date }): Promise<Array<{ codigo: string; saldo: number; recargo: number }>> {
  const ahora = input.ahora ?? new Date();
  const hoy = hoyEcuador(ahora);
  const ops = await pedidosAceptados();
  const sinRecargo = ops.filter((o) => numero(o.fields[CAMPO_RECARGO]) <= 0.005 && !texto(o.fields[CAMPO_RECARGO_QUITADO]).trim());
  if (!sinRecargo.length) return [];
  const [llegadas, cuentas] = await Promise.all([
    llegadasDePedidos(sinRecargo.map((o) => o.id), ahora),
    estadosDeCuentaDeOperaciones(sinRecargo.map((o) => o.id)),
  ]);
  const hechos: Array<{ codigo: string; saldo: number; recargo: number }> = [];
  for (const op of sinRecargo) {
    const saldo = r2(cuentas.get(op.id)?.porCobrar ?? 0);
    const recargo = recargoQueCorresponde({
      estado: estadoComercial(texto(op.fields["Estado"])),
      llegoEn: llegadas.get(op.id),
      hoy,
      saldoPendiente: saldo,
      recargoActual: 0,
      recargoQuitado: false,
    });
    if (recargo <= 0) continue;
    const codigo = texto(op.fields["Código Operación"]) || op.id;
    hechos.push({ codigo, saldo, recargo });
    if (!input.aplicar) continue;
    await withLock(`pedido:${op.id}`, async () => {
      const actual = await fetchRecordById(T_OPERACIONES, op.id);
      if (!actual || numero(actual.fields[CAMPO_RECARGO]) > 0.005 || texto(actual.fields[CAMPO_RECARGO_QUITADO]).trim()) return;
      await airtableMutation(tableUrl(T_OPERACIONES), {
        method: "PATCH",
        body: JSON.stringify({
          records: [{
            id: op.id,
            fields: {
              [CAMPO_RECARGO]: recargo,
              "Observación Interna": [texto(actual.fields["Observación Interna"]).trim(),
                entradaHistorial(`Recargo por no retiro ${usd(recargo)} (10 % de ${usd(saldo)} pendientes; pasaron 7 días desde que llegó).`, "Sistema (proceso diario)")].filter(Boolean).join("\n"),
            },
          }],
        }),
      });
    });
  }
  return hechos;
}

export class ErrorRetiro extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

/** Lo que la pantalla del pedido muestra de los plazos (y qué puede hacer el usuario). */
export async function retiroDelPedido(pedidoId: string, session: StaffSession) {
  const op = await fetchRecordById(T_OPERACIONES, pedidoId);
  if (!op) throw new ErrorRetiro("El pedido no existe.", 404);
  const estado = estadoComercial(texto(op.fields["Estado"]));
  const llegoEn = estado === "Aceptado" ? (await llegadasDePedidos([pedidoId])).get(pedidoId) ?? null : null;
  const esAdmin = isAdministratorRole(session.user.rol);
  return {
    plazos: textoPlazos(llegoEn),
    recargo: r2(numero(op.fields[CAMPO_RECARGO])),
    recargoQuitado: texto(op.fields[CAMPO_RECARGO_QUITADO]),
    porLiberar: debeLiberarse({ estado, llegoEn, hoy: hoyEcuador() }),
    guardadoHasta: plazosDeRetiro(llegoEn)?.guardadoHasta ?? "",
    pagado: r2((await estadosDeCuentaDeOperaciones([pedidoId])).get(pedidoId)?.totalAbonado ?? 0),
    esAdmin,
  };
}

export async function quitarRecargo(input: { pedidoId: string; motivo: string; session: StaffSession }): Promise<void> {
  if (!isAdministratorRole(input.session.user.rol)) throw new ErrorRetiro("Solo un administrador quita el recargo.", 403);
  if (!input.motivo.trim()) throw new ErrorRetiro("Escribe el motivo.", 400);
  const usuario = nombreUsuario(input.session);
  await withLock(`pedido:${input.pedidoId}`, async () => {
    const op = await fetchRecordById(T_OPERACIONES, input.pedidoId);
    if (!op) throw new ErrorRetiro("El pedido no existe.", 404);
    const monto = numero(op.fields[CAMPO_RECARGO]);
    if (monto <= 0.005) throw new ErrorRetiro("Este pedido no tiene recargo.");
    const nota = notaRecargoQuitado(input.motivo, usuario, monto);
    await airtableMutation(tableUrl(T_OPERACIONES), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{
          id: input.pedidoId,
          fields: {
            [CAMPO_RECARGO]: 0,
            [CAMPO_RECARGO_QUITADO]: [texto(op.fields[CAMPO_RECARGO_QUITADO]).trim(), nota].filter(Boolean).join("\n"),
            "Observación Interna": [texto(op.fields["Observación Interna"]).trim(), entradaHistorial(`Recargo quitado (${usd(monto)}): ${input.motivo.trim()}`, usuario)].filter(Boolean).join("\n"),
          },
        }],
      }),
    });
  });
}

/** "Liberar" (desde el 4.º mes): artículo a la tienda, todo lo pagado a saldo a favor. */
export async function liberarPedido(input: { pedidoId: string; session: StaffSession }): Promise<{ codigo: string; saldoAFavor: number; aviso: string | null }> {
  if (!isAdministratorRole(input.session.user.rol)) throw new ErrorRetiro("Solo un administrador libera un pedido.", 403);
  const op = await fetchRecordById(T_OPERACIONES, input.pedidoId);
  if (!op) throw new ErrorRetiro("El pedido no existe.", 404);
  const estado = estadoComercial(texto(op.fields["Estado"]));
  const llegoEn = (await llegadasDePedidos([input.pedidoId])).get(input.pedidoId) ?? null;
  if (!debeLiberarse({ estado, llegoEn, hoy: hoyEcuador() })) {
    const p = plazosDeRetiro(llegoEn);
    throw new ErrorRetiro(p ? `Todavía se guarda hasta el ${p.guardadoHasta}.` : "El pedido no ha llegado.");
  }
  try {
    const r = await cancelarPedidoEspecial({
      pedidoId: input.pedidoId,
      session: input.session,
      motivo: `Liberado: no se retiró en 3 meses (llegó el ${plazosDeRetiro(llegoEn)!.llego}).`,
      proveedorAcepta: false,
      destino: "saldo_a_favor",
    });
    return { codigo: r.codigo, saldoAFavor: r.plan.saldoAFavor, aviso: r.aviso };
  } catch (e) {
    if (e instanceof ErrorCancelacion) throw new ErrorRetiro(e.message, e.status);
    throw e;
  }
}
