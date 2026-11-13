import "server-only";

// Cancelar un pedido especial — SERVIDOR (auditoría ops, punto 10C-3a).
// La regla vive en ./cancelacion.ts (pura, con prueba). Todo en UN paso
// (maqueta 5b): el dinero se resuelve en la misma acción, ya no "primero en
// la cuenta y luego cancela".
//
// Orden de escritura: se valida todo (incluida la cuenta de donde sale una
// devolución) ANTES de escribir; luego gastos y su prueba → líneas, compras y
// artículo → pedido "Cancelado" → el dinero que sobra (devolver o saldo a
// favor) con las funciones de siempre (lib/saldo-favor). Si la parte del
// dinero fallara, el pedido queda cancelado con el sobrante a la vista y la
// cuenta ofrece "Pasar a saldo a favor" / "Devolver" para terminar.

import { isAdministratorRole, isTechnicianRole } from "@/lib/apps";
import { withLock } from "@/lib/concurrencia";
import { airtableMutation, fetchRecordById, tableUrl } from "@/lib/finanzas/airtable-client";
import { fetchCuentaById } from "@/lib/finanzas/cuentas";
import { validarSolicitudReembolso, type SolicitudReembolso } from "@/lib/facturacion/notaCredito/reembolso";
import { estadosDeCuentaDeOperaciones } from "@/lib/estado-cuenta/airtable";
import { actualizarLinea, listarLineasDePedido } from "@/lib/tecnicos/presupuesto/airtable";
import { cancelarSolicitudDeLinea, solicitudesDeOperacion } from "@/lib/compras/servidor";
import { entradaHistorial } from "@/lib/compras/reglas";
import { soltarArticuloDePedido } from "@/lib/shipping-v2/airtable";
import { devolverSobranteDeCuenta, nombreUsuario, pasarCuentaASaldoAFavor } from "@/lib/saldo-favor/servidor";
import { opcionesDeDevolucion } from "@/lib/saldo-favor/ruta";
import type { StaffSession } from "@/lib/session";
import { estadoComercial } from "./reglas";
import {
  CAMPO_GASTOS, CAMPO_GASTOS_PRUEBA, CAMPO_RECARGO, ETAPA_CANCELACION, planDeCancelacion,
  type DestinoDinero, type PlanDeCancelacion,
} from "./cancelacion";

const T_OPERACIONES = "Operación Comercial";
const MAX_PRUEBA_BYTES = 5 * 1024 * 1024;
const TIPOS_PRUEBA = /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/;

const texto = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return texto(v[0]);
  return v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
};
const usd = (n: number) => `$${n.toFixed(2)}`;

export class ErrorCancelacion extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

/** Staff y Administradores cancelan un pedido ya confirmado con el proveedor (dueño, 13-nov). */
export function esStaffOAdmin(rol: string | undefined): boolean {
  return isAdministratorRole(rol) || (!!rol && !isTechnicianRole(rol));
}

async function leer(pedidoId: string) {
  const op = await fetchRecordById(T_OPERACIONES, pedidoId);
  if (!op) throw new ErrorCancelacion("El pedido no existe.", 404);
  const [lineas, solicitudes, cuentas] = await Promise.all([
    listarLineasDePedido(pedidoId),
    solicitudesDeOperacion(pedidoId),
    estadosDeCuentaDeOperaciones([pedidoId]),
  ]);
  const cuenta = cuentas.get(pedidoId);
  return {
    op,
    codigo: texto(op.fields["Código Operación"]) || pedidoId,
    estado: estadoComercial(texto(op.fields["Estado"])),
    lineas,
    solicitudes,
    confirmado: solicitudes.some((s) => s.estado === "Comprada" || s.estado === "Entregada"),
    pagado: Math.round(Math.max(0, cuenta?.totalAbonado ?? 0) * 100) / 100,
  };
}

/** Lo que necesita la ventana "Cancelar pedido" al abrirse. */
export async function revisarCancelacion(pedidoId: string, session: StaffSession) {
  const l = await leer(pedidoId);
  const puede = esStaffOAdmin(session.user.rol);
  const devolucion = await opcionesDeDevolucion(session, { permitirNoAdministrador: puede || !l.confirmado });
  return {
    estado: l.estado,
    confirmado: l.confirmado,
    etapa: l.confirmado ? ETAPA_CANCELACION.con : ETAPA_CANCELACION.sin,
    pagado: l.pagado,
    puedeCancelar: !l.confirmado || puede,
    cuentasDevolucion: devolucion.cuentasDevolucion,
    metodosDevolucion: [...devolucion.metodosDevolucion],
  };
}

export type PruebaAdjunta = { nombre: string; tipo: string; base64: string };

export async function cancelarPedidoEspecial(input: {
  pedidoId: string;
  session: StaffSession;
  motivo: string;
  proveedorAcepta?: boolean | null;
  destino?: DestinoDinero | null;
  gastos?: number | null;
  prueba?: PruebaAdjunta | null;
  reembolso?: SolicitudReembolso | null;
}): Promise<{ plan: PlanDeCancelacion; codigo: string; aviso: string | null }> {
  const usuario = nombreUsuario(input.session);
  return withLock(`pedido:${input.pedidoId}`, async () => {
    const l = await leer(input.pedidoId);
    const prueba = input.prueba ?? null;
    if (prueba) {
      if (!TIPOS_PRUEBA.test(prueba.tipo)) throw new ErrorCancelacion("La prueba debe ser una foto o un PDF.", 400);
      if (Math.floor((prueba.base64.length * 3) / 4) > MAX_PRUEBA_BYTES) throw new ErrorCancelacion("La prueba pesa más de 5 MB.", 400);
    }
    const r = planDeCancelacion({
      estado: l.estado,
      motivo: input.motivo,
      confirmado: l.confirmado,
      esStaffOAdmin: esStaffOAdmin(input.session.user.rol),
      proveedorAcepta: input.proveedorAcepta ?? null,
      pagado: l.pagado,
      destino: input.destino ?? null,
      gastos: input.gastos ?? 0,
      tienePrueba: !!prueba,
    });
    if (!r.ok) throw new ErrorCancelacion(r.motivo);
    const plan = r.plan;

    // La devolución se valida ANTES de escribir nada (cuenta real, método, N.º).
    if (plan.devolver > 0.005) {
      const cuentaId = typeof input.reembolso?.cuentaOrigenId === "string" ? input.reembolso.cuentaOrigenId.trim() : "";
      const cuentaFin = cuentaId ? await fetchCuentaById(cuentaId).catch(() => null) : null;
      const v = validarSolicitudReembolso(
        input.reembolso ?? null,
        cuentaFin ? { id: cuentaFin.id, nombre: cuentaFin.nombre, tipo: String(cuentaFin.tipo), activa: cuentaFin.activa } : null,
      );
      if (!v.ok) throw new ErrorCancelacion(v.motivo, 400);
    }

    const motivo = input.motivo.trim();
    const resumen = plan.caso === "sin_confirmar" ? "sin confirmar con el proveedor"
      : plan.caso === "proveedor_acepta" ? `el proveedor acepta cancelar${plan.gastos > 0 ? `, gastos ${usd(plan.gastos)}` : ""}`
      : "el proveedor no acepta cancelar: el artículo queda para la tienda";

    // 1. Gastos de cancelación (cargo sin factura) y su prueba.
    if (plan.gastos > 0.005) {
      await airtableMutation(tableUrl(T_OPERACIONES), {
        method: "PATCH",
        body: JSON.stringify({ records: [{ id: input.pedidoId, fields: { [CAMPO_GASTOS]: plan.gastos } }] }),
      });
      if (prueba) {
        const baseId = process.env.AIRTABLE_BASE_ID ?? "";
        const url = `https://content.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(input.pedidoId)}/${encodeURIComponent(CAMPO_GASTOS_PRUEBA)}/uploadAttachment`;
        await airtableMutation(url, {
          method: "POST",
          body: JSON.stringify({ contentType: prueba.tipo, file: prueba.base64, filename: prueba.nombre.slice(0, 120) || "prueba" }),
        });
      }
    }

    // 2. Líneas, compras y artículos.
    for (const ln of l.lineas) {
      if (ln.estado === "Rechazada") continue;
      const nota = `Pedido cancelado (${resumen}): ${motivo}`;
      if (ln.estado === "Cargada" && ln.itemId) {
        await soltarArticuloDePedido(ln.itemId, {
          modo: "liberar",
          motivo,
          registradoPor: usuario,
          descripcion: plan.articuloAlProveedor
            ? `Pedido ${l.codigo} cancelado: el proveedor aceptó la cancelación. Logística gestiona la devolución al proveedor.`
            : `Pedido ${l.codigo} cancelado: el artículo queda para la tienda.`,
        });
      } else {
        await cancelarSolicitudDeLinea(ln.id, nota, usuario).catch((e) => console.warn("[cancelar] solicitud:", e));
      }
      await actualizarLinea(ln.id, { estado: "Rechazada", agregarHistorial: { anterior: ln.historial, entrada: entradaHistorial(nota, usuario) } });
    }

    // 3. El pedido.
    const obs = texto(l.op.fields["Observación Interna"]);
    const dinero = [
      plan.gastos > 0.005 ? `gastos ${usd(plan.gastos)}` : "",
      plan.devolver > 0.005 ? `se devuelven ${usd(plan.devolver)}` : "",
      plan.saldoAFavor > 0.005 ? `${usd(plan.saldoAFavor)} a saldo a favor` : "",
    ].filter(Boolean).join(", ");
    await airtableMutation(tableUrl(T_OPERACIONES), {
      method: "PATCH",
      body: JSON.stringify({
        records: [{
          id: input.pedidoId,
          fields: {
            Estado: "Cancelado",
            [CAMPO_RECARGO]: 0,
            "Observación Interna": [obs.trim(), entradaHistorial(`Cancelado (${resumen})${dinero ? `; ${dinero}` : ""}: ${motivo}`, usuario)].filter(Boolean).join("\n"),
          },
        }],
      }),
    });

    // 4. El dinero que sobra.
    const origen = { tipo: "operacion" as const, recordId: input.pedidoId };
    let aviso: string | null = null;
    if (plan.devolver > 0.005) {
      const d = await devolverSobranteDeCuenta({ origen, session: input.session, solicitud: input.reembolso!, permitirNoAdministrador: true });
      if (!d.ok) aviso = `El pedido quedó cancelado, pero no se registró la devolución: ${d.error}. Termínala desde la cuenta.`;
      else aviso = d.warning ?? null;
    } else if (plan.saldoAFavor > 0.005) {
      const s = await pasarCuentaASaldoAFavor({ origen, session: input.session });
      if (!s.ok) aviso = `El pedido quedó cancelado, pero no se pasó a saldo a favor: ${s.error}. Termínalo desde la cuenta.`;
      else aviso = s.warning ?? null;
    }
    return { plan, codigo: l.codigo, aviso };
  });
}
