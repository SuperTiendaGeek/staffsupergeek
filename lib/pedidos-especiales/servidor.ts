import "server-only";

// Pedido especial de cliente — acciones del SERVIDOR (auditoría ops, punto 10A-2).
// Reglas puras en ./reglas.ts. La cotización son líneas del MISMO Presupuesto
// de las órdenes (enlace "Pedido"); la cuenta, la calculadora única; la
// compra, la solicitud de compra de Logística.
//
// Ejemplo (Javier Ulcuango, laptop para SketchUp):
//   1. El empleado agrega dos alternativas: Dell i5 $430 y Lenovo i7 $480.
//   2. "Enviar cotización" (72 h) → "Esperando al cliente", vence el viernes 18:00.
//   3. Javier viene a la tienda, elige la Lenovo: "Aceptar en tienda" →
//      la Lenovo queda Aprobada, la Dell Rechazada, nace SOL "Por comprar",
//      el pedido pasa a "Aceptado" y se abre el abono con el anticipo ($240).

import { withLock } from "@/lib/concurrencia";
import { airtableMutation, fetchRecordById, tableUrl } from "@/lib/finanzas/airtable-client";
import {
  actualizarLinea, borrarLinea, crearLineaDePedido, listarLineasDePedido, nombresProveedores,
} from "@/lib/tecnicos/presupuesto/airtable";
import type { LineaPresupuesto } from "@/lib/tecnicos/presupuesto/reglas";
import { asegurarSolicitudDeLinea, cancelarSolicitudDeLinea, solicitudesDeOperacion, type SolicitudConSituacion } from "@/lib/compras/servidor";
import { estadosDeCuentaDeOperaciones } from "@/lib/estado-cuenta/airtable";
import { entradaHistorial } from "@/lib/compras/reglas";
import {
  errorAceptar, estadoComercial, faltanDatosParaEnviar, planCancelacion, resumenAnticipo, totalElegido, venceCotizacion, vigencia,
  type EstadoPedido, type PlanCancelacion, type ResumenAnticipo, type Vigencia,
} from "./reglas";

const T_OPERACIONES = "Operación Comercial";
/** Las alternativas excluyentes de un pedido comparten este grupo (el cliente elige una). */
export const GRUPO_ALTERNATIVAS = "pedido";

const texto = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return texto(v[0]);
  return v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
};

export type AlternativaInput = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  proveedorId: string;
  categoria: string;
  costoProveedor?: number | null;
  urlProveedor?: string;
  tiempoEstimado?: string;
  notaCliente?: string;
  /** true = el cliente elige UNA entre las alternativas; false = adicional (se suma). */
  esAlternativa: boolean;
};

export function errorAlternativa(a: AlternativaInput): string | null {
  if (!a.descripcion.trim()) return "Falta la descripción.";
  if (!Number.isInteger(a.cantidad) || a.cantidad < 1) return "La cantidad debe ser un número entero desde 1.";
  if (!(a.precioUnitario > 0)) return "El precio al cliente debe ser mayor que $0.";
  if (!a.proveedorId) return "Elige el proveedor sugerido.";
  if (!a.categoria.trim()) return "Elige la categoría.";
  if (a.costoProveedor != null && a.costoProveedor < 0) return "El costo no puede ser negativo.";
  return null;
}

export type PedidoEspecialVista = {
  id: string;
  codigo: string;
  estado: EstadoPedido;
  estadoCrudo: string;
  vence: string;
  vigencia: Vigencia;
  aceptadoEn: string;
  aceptadoPor: string;
  aceptadoVia: string;
  lineas: LineaPresupuesto[];
  solicitudes: SolicitudConSituacion[];
  anticipo: ResumenAnticipo;
  cancelacion: PlanCancelacion;
  /** proveedorId → nombre (para editar la opción). */
  proveedores: Record<string, string>;
};

export async function vistaPedido(pedidoId: string): Promise<PedidoEspecialVista> {
  const op = await fetchRecordById(T_OPERACIONES, pedidoId);
  if (!op) throw new Error("El pedido no existe.");
  const f = op.fields;
  const [lineas, solicitudes, cuentas] = await Promise.all([
    listarLineasDePedido(pedidoId),
    solicitudesDeOperacion(pedidoId),
    estadosDeCuentaDeOperaciones([pedidoId]),
  ]);
  const cuenta = cuentas.get(pedidoId);
  const estadoCrudo = texto(f["Estado"]);
  const estado = estadoComercial(estadoCrudo);
  const aceptadas = lineas.filter((l) => l.estado === "Aprobada" || l.estado === "Cargada");
  // Antes de aceptar, el anticipo se calcula sobre la alternativa más cara
  // (lo más que podría pedir); aceptado, sobre lo aceptado (la cuenta).
  const totalReferencia = aceptadas.length
    ? (cuenta?.totalCuenta ?? totalElegido(aceptadas, aceptadas.map((l) => l.id)))
    : 0;
  const vence = texto(f["Cotización vence"]);
  const idsProv = [...new Set(lineas.map((l) => l.proveedorId).filter((x): x is string => !!x))];
  const proveedores = idsProv.length ? await nombresProveedores(idsProv).catch(() => ({})) : {};
  return {
    proveedores,
    id: op.id,
    codigo: texto(f["Código Operación"]) || op.id,
    estado,
    estadoCrudo,
    vence,
    vigencia: vigencia(vence),
    aceptadoEn: texto(f["Aceptado en"]),
    aceptadoPor: texto(f["Aceptado por"]),
    aceptadoVia: texto(f["Aceptado vía"]),
    lineas,
    solicitudes,
    anticipo: resumenAnticipo(totalReferencia, cuenta?.totalAbonado ?? 0),
    cancelacion: planCancelacion({
      pagado: cuenta?.totalAbonado ?? 0,
      pedidoAlProveedor: solicitudes.some((s) => s.estado === "Comprada" || s.estado === "Entregada"),
    }),
  };
}

function exigirCotizable(estado: EstadoPedido): void {
  if (estado !== "Cotizando" && estado !== "Esperando al cliente") {
    throw new Error("La cotización ya no se puede cambiar: el pedido está " + estado.toLowerCase() + ".");
  }
}

async function estadoDe(pedidoId: string): Promise<EstadoPedido> {
  const op = await fetchRecordById(T_OPERACIONES, pedidoId);
  if (!op) throw new Error("El pedido no existe.");
  return estadoComercial(texto(op.fields["Estado"]));
}

async function patchPedido(pedidoId: string, fields: Record<string, unknown>): Promise<void> {
  await airtableMutation(tableUrl(T_OPERACIONES), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id: pedidoId, fields }], typecast: true }),
  });
}

export async function agregarAlternativa(pedidoId: string, a: AlternativaInput, usuario: string): Promise<LineaPresupuesto> {
  const err = errorAlternativa(a);
  if (err) throw new Error(err);
  return withLock(`pedido:${pedidoId}`, async () => {
    exigirCotizable(await estadoDe(pedidoId));
    return crearLineaDePedido(pedidoId, {
      tipo: "Repuesto",
      descripcion: a.descripcion,
      cantidad: a.cantidad,
      precioUnitario: a.precioUnitario,
      notaCliente: a.notaCliente,
      bajoPedido: {
        proveedorId: a.proveedorId,
        categoria: a.categoria,
        costoProveedor: a.costoProveedor ?? null,
        urlProveedor: a.urlProveedor,
        tiempoEstimado: a.tiempoEstimado,
      },
    }, usuario, { grupoAlternativas: a.esAlternativa ? GRUPO_ALTERNATIVAS : undefined });
  });
}

export async function editarAlternativa(
  pedidoId: string, lineaId: string,
  c: {
    descripcion?: string; cantidad?: number; precioUnitario?: number; notaCliente?: string; esAlternativa?: boolean;
    proveedorId?: string; categoria?: string; costoProveedor?: number | null; urlProveedor?: string; tiempoEstimado?: string;
  },
  usuario: string,
): Promise<void> {
  return withLock(`pedido:${pedidoId}`, async () => {
    exigirCotizable(await estadoDe(pedidoId));
    const linea = (await listarLineasDePedido(pedidoId)).find((l) => l.id === lineaId);
    if (!linea) throw new Error("La opción no es de este pedido.");
    if (linea.estado !== "Propuesta") throw new Error("Solo se edita una opción propuesta.");
    if (c.cantidad !== undefined && (!Number.isInteger(c.cantidad) || c.cantidad < 1)) throw new Error("Cantidad inválida.");
    if (c.precioUnitario !== undefined && !(c.precioUnitario > 0)) throw new Error("El precio debe ser mayor que $0.");
    if (c.costoProveedor != null && c.costoProveedor < 0) throw new Error("El costo no puede ser negativo.");
    const cambios: string[] = [];
    if (c.precioUnitario !== undefined && c.precioUnitario !== linea.precioUnitario) cambios.push(`precio $${linea.precioUnitario} → $${c.precioUnitario}`);
    if (c.cantidad !== undefined && c.cantidad !== linea.cantidad) cambios.push(`cantidad ${linea.cantidad} → ${c.cantidad}`);
    if (c.proveedorId && c.proveedorId !== linea.proveedorId) cambios.push("proveedor");
    if (c.costoProveedor !== undefined && c.costoProveedor !== linea.costoProveedor) cambios.push(`costo ${linea.costoProveedor ?? "—"} → ${c.costoProveedor ?? "—"}`);
    await actualizarLinea(lineaId, {
      ...(c.descripcion !== undefined ? { descripcion: c.descripcion.trim() } : {}),
      ...(c.cantidad !== undefined ? { cantidad: c.cantidad } : {}),
      ...(c.precioUnitario !== undefined ? { precioUnitario: c.precioUnitario } : {}),
      ...(c.notaCliente !== undefined ? { notaCliente: c.notaCliente.trim() } : {}),
      ...(c.esAlternativa !== undefined ? { grupoAlternativas: c.esAlternativa ? GRUPO_ALTERNATIVAS : "" } : {}),
      ...(c.proveedorId ? { proveedorId: c.proveedorId } : {}),
      ...(c.categoria !== undefined && c.categoria.trim() ? { categoria: c.categoria.trim() } : {}),
      ...(c.costoProveedor !== undefined ? { costoProveedor: c.costoProveedor } : {}),
      ...(c.urlProveedor !== undefined ? { urlProveedor: c.urlProveedor } : {}),
      ...(c.tiempoEstimado !== undefined ? { tiempoEstimado: c.tiempoEstimado } : {}),
      ...(cambios.length ? { agregarHistorial: { anterior: linea.historial, entrada: entradaHistorial(`Editada: ${cambios.join(", ")}.`, usuario) } } : {}),
    });
  });
}

export async function quitarAlternativa(pedidoId: string, lineaId: string): Promise<void> {
  return withLock(`pedido:${pedidoId}`, async () => {
    exigirCotizable(await estadoDe(pedidoId));
    const linea = (await listarLineasDePedido(pedidoId)).find((l) => l.id === lineaId);
    if (!linea) throw new Error("La opción no es de este pedido.");
    if (linea.estado !== "Propuesta") throw new Error("Solo se quita una opción propuesta.");
    await borrarLinea(lineaId);
  });
}

/** "Enviar cotización" y "Renovar": vale `dias` (por defecto 72 h) desde ahora. */
export async function enviarCotizacion(pedidoId: string, dias: number | null, usuario: string): Promise<{ vence: string }> {
  return withLock(`pedido:${pedidoId}`, async () => {
    exigirCotizable(await estadoDe(pedidoId));
    const lineas = (await listarLineasDePedido(pedidoId)).filter((l) => l.estado === "Propuesta");
    if (!lineas.length) throw new Error("Agrega al menos una opción con precio antes de enviar.");
    const falta = faltanDatosParaEnviar(lineas.map((l) => ({ descripcion: l.descripcion, estado: l.estado, proveedorId: l.proveedorId, categoria: l.categoria })));
    if (falta) throw new Error(falta);
    const vence = venceCotizacion(new Date(), dias);
    await patchPedido(pedidoId, { Estado: "Esperando al cliente", "Cotización vence": vence });
    console.info(`[pedido] ${pedidoId} cotización enviada por ${usuario}, vence ${vence}`);
    return { vence };
  });
}

/**
 * "Aceptar en tienda" (decisión 3: un solo paso). Lo elegido queda Aprobado,
 * lo demás Rechazado, nace una solicitud de compra por cada línea aceptada y
 * el pedido pasa a "Aceptado". El abono se registra a continuación con el
 * anticipo sugerido (la pantalla abre "Registrar abono" sola).
 */
export async function aceptarPedido(input: {
  pedidoId: string; elegidas: string[]; usuario: string; via: "En tienda" | "Enlace";
  /** Por el enlace: la vigencia se mira al momento en que el cliente ELIGIÓ (su precio se respeta). */
  vigenteAl?: Date;
}): Promise<{ total: number; anticipo: ResumenAnticipo }> {
  return withLock(`pedido:${input.pedidoId}`, async () => {
    const op = await fetchRecordById(T_OPERACIONES, input.pedidoId);
    if (!op) throw new Error("El pedido no existe.");
    const lineas = await listarLineasDePedido(input.pedidoId);
    const error = errorAceptar({
      estado: texto(op.fields["Estado"]),
      vence: texto(op.fields["Cotización vence"]),
      lineas,
      elegidas: input.elegidas,
      ahora: input.vigenteAl,
    });
    if (error) throw new Error(error);
    const ahora = new Date();
    const elegidas = new Set(input.elegidas);
    const textoAcepto = input.via === "En tienda" ? "Aceptada en tienda." : "Elegida por el cliente en el enlace y confirmada con su pago.";
    for (const l of lineas) {
      if (l.estado !== "Propuesta") continue;
      if (elegidas.has(l.id)) {
        await actualizarLinea(l.id, {
          estado: "Aprobada", aprobadoPor: input.usuario, fechaAprobacion: ahora.toISOString(), notaCarga: "",
          agregarHistorial: { anterior: l.historial, entrada: entradaHistorial(textoAcepto, input.usuario, ahora) },
        });
        await asegurarSolicitudDeLinea({ pedidoId: input.pedidoId, linea: l, usuario: input.usuario, textoHistorial: `${textoAcepto} Por comprar.` });
      } else {
        await actualizarLinea(l.id, {
          estado: "Rechazada",
          agregarHistorial: { anterior: l.historial, entrada: entradaHistorial("No elegida por el cliente.", input.usuario, ahora) },
        });
      }
    }
    await patchPedido(input.pedidoId, {
      Estado: "Aceptado", "Aceptado en": ahora.toISOString(), "Aceptado por": input.usuario, "Aceptado vía": input.via,
    });
    const total = totalElegido(lineas, input.elegidas);
    const cuenta = (await estadosDeCuentaDeOperaciones([input.pedidoId])).get(input.pedidoId);
    return { total, anticipo: resumenAnticipo(total, cuenta?.totalAbonado ?? 0) };
  });
}

/**
 * Cancelar (decisión 8). Lo pagado se resuelve ANTES desde la cuenta del
 * cliente ("Pasar a saldo a favor" o "Devolver", que ya existen): aquí solo
 * se cancela un pedido que no tiene dinero sin resolver.
 */
export async function cancelarPedido(pedidoId: string, motivo: string, usuario: string): Promise<void> {
  if (!motivo.trim()) throw new Error("Escribe el motivo.");
  return withLock(`pedido:${pedidoId}`, async () => {
    const estado = await estadoDe(pedidoId);
    if (estado === "Entregado" || estado === "Cancelado") throw new Error(`El pedido ya está ${estado.toLowerCase()}.`);
    const cuenta = (await estadosDeCuentaDeOperaciones([pedidoId])).get(pedidoId);
    if ((cuenta?.totalAbonado ?? 0) > 0.009) {
      const plan = planCancelacion({
        pagado: cuenta!.totalAbonado,
        pedidoAlProveedor: (await solicitudesDeOperacion(pedidoId)).some((s) => s.estado === "Comprada" || s.estado === "Entregada"),
      });
      throw new Error(`${plan.texto} Resuélvelo primero en "Cuenta del cliente".`);
    }
    const lineas = await listarLineasDePedido(pedidoId);
    if (lineas.some((l) => l.estado === "Cargada")) {
      throw new Error("Ya se compró algo de este pedido: la pieza queda para la tienda. Esa cancelación llega con la 10C; por ahora avísale a un administrador.");
    }
    for (const l of lineas) {
      if (l.estado === "Rechazada") continue;
      if (l.estado === "Aprobada") await cancelarSolicitudDeLinea(l.id, `Pedido cancelado: ${motivo.trim()}`, usuario).catch(() => {});
      if (l.estado === "Propuesta" || l.estado === "Aprobada") {
        await actualizarLinea(l.id, { estado: "Rechazada", agregarHistorial: { anterior: l.historial, entrada: entradaHistorial(`Pedido cancelado: ${motivo.trim()}`, usuario) } });
      }
    }
    const op = await fetchRecordById(T_OPERACIONES, pedidoId);
    const obs = texto(op?.fields["Observación Interna"]);
    await patchPedido(pedidoId, {
      Estado: "Cancelado",
      "Observación Interna": [obs.trim(), entradaHistorial(`Cancelado: ${motivo.trim()}`, usuario)].filter(Boolean).join("\n"),
    });
  });
}

