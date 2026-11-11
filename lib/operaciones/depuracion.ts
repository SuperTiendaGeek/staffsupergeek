import "server-only";

import { listPortalUsers } from "@/lib/airtable";
import { crearNotificacion } from "@/lib/notificaciones/airtable";
import { fetchOperaciones, actualizarEstadoOperacion } from "@/lib/operaciones/airtable";
import { debeAutoRechazarse, DIAS_MAXIMO_SIN_GESTION } from "@/lib/operaciones/vencimiento";
import type { OperacionListado } from "@/types/operaciones";
import { textoFechaHora, vigencia } from "@/lib/pedidos-especiales/reglas";

/**
 * Depuración automática de cotizaciones estancadas (Fase: alertas de gestión).
 *
 * Una operación en estado "Cotizado" que lleva DIAS_MAXIMO_SIN_GESTION días
 * sin que nadie la toque (ver lib/operaciones/vencimiento.ts) se marca como
 * "Rechazado" y se notifica a Administrador + Staff por el sistema de
 * notificaciones interno. Pensado para correr una vez al día desde
 * app/api/cron/operaciones-depurar-cotizaciones (Vercel Cron).
 */

export type ResultadoDepuracion = {
  revisadas: number;
  rechazadas: Array<{ id: string; codigo: string }>;
  /** Punto 10A-2: pedidos especiales cuya cotización vence en menos de 24 h (aviso interno). */
  porVencer?: Array<{ id: string; codigo: string }>;
  errores: Array<{ id: string; error: string }>;
};

function normalizar(valor: string): string {
  return valor.normalize("NFC").trim().toLowerCase();
}

// Los mismos roles que el usuario pidió notificar: "Administrador" y "Staff"
// tal como están guardados en la tabla Usuarios (ver docs/ESQUEMA.md).
function esRolNotificable(rol: string): boolean {
  const r = normalizar(rol);
  return r === "administrador" || r === "admin" || r === "staff";
}

async function notificarAutoRechazo(op: OperacionListado): Promise<void> {
  const usuarios = (await listPortalUsers()).filter((u) => u.activo && esRolNotificable(u.rol));

  const titulo = `Cotización rechazada automáticamente: ${op.codigo}`;
  const mensaje =
    `La operación ${op.codigo} (${op.productoSolicitado} — ${op.clienteNombre}) llevaba ` +
    `${DIAS_MAXIMO_SIN_GESTION} días sin respuesta del cliente y el sistema la marcó como ` +
    `Rechazada automáticamente.`;

  // Notificaciones independientes entre sí: si falla una (destinatario sin
  // record ID válido, Airtable caído momentáneamente) no debe tumbar el resto
  // ni la depuración ya aplicada.
  await Promise.all(
    usuarios.map((u) =>
      crearNotificacion({
        destinatarioId: u.id,
        tipo: "Sistema",
        titulo,
        mensaje,
        urlAccion: `/operaciones/${op.id}`,
        prioridad: "Alta",
        entidadTipo: "Sistema",
        entidadId: op.id,
      }).catch((err) => {
        console.error(`[operaciones/depuracion] Error notificando a ${u.id}:`, err);
      })
    )
  );
}

export async function depurarCotizacionesEstancadas(): Promise<ResultadoDepuracion> {
  const operaciones = await fetchOperaciones();
  const ahora = new Date();

  const candidatas = operaciones.filter((op) =>
    debeAutoRechazarse({ estado: op.estado, ultimaActualizacion: op.ultimaActualizacion }, ahora)
  );

  const rechazadas: Array<{ id: string; codigo: string }> = [];
  const errores: Array<{ id: string; error: string }> = [];

  // Secuencial, no Promise.all: son pocas por corrida (cotizaciones vencidas
  // por día, no todo el tablero) y así un error en una no deja al resto a
  // medio camino por un rate limit compartido de Airtable.
  for (const op of candidatas) {
    try {
      await actualizarEstadoOperacion(op.id, "Rechazado");
      await notificarAutoRechazo(op);
      rechazadas.push({ id: op.id, codigo: op.codigo });
    } catch (err) {
      errores.push({ id: op.id, error: err instanceof Error ? err.message : "Error desconocido" });
    }
  }

  // Punto 10A-2 (decisión 2 del dueño): la cotización de un pedido especial
  // NO se rechaza sola; 24 h antes de vencer se avisa al personal para que le
  // escriba al cliente. El cron corre una vez al día: cada cotización cae una
  // sola vez en su ventana de 24 h, así que el aviso no se repite.
  const porVencer: Array<{ id: string; codigo: string }> = [];
  for (const op of operaciones) {
    if (op.estado !== "Esperando al cliente" || vigencia(op.cotizacionVence, ahora) !== "por_vencer") continue;
    try {
      await notificarPorVencer(op);
      porVencer.push({ id: op.id, codigo: op.codigo });
    } catch (err) {
      errores.push({ id: op.id, error: err instanceof Error ? err.message : "Error desconocido" });
    }
  }

  return { revisadas: operaciones.length, rechazadas, porVencer, errores };
}

async function notificarPorVencer(op: OperacionListado): Promise<void> {
  const usuarios = (await listPortalUsers()).filter((u) => u.activo && esRolNotificable(u.rol));
  const titulo = `Cotización por vencer · ${op.codigo}`;
  const mensaje = `La cotización de ${op.clienteNombre} (${op.productoSolicitado}) vale hasta el ${textoFechaHora(op.cotizacionVence ?? "")}. Escríbele antes de que venza.`;
  await Promise.all(usuarios.map((u) =>
    crearNotificacion({
      destinatarioId: u.id, tipo: "Sistema", titulo, mensaje,
      urlAccion: `/operaciones/${op.id}`, prioridad: "Normal", entidadTipo: "Sistema", entidadId: op.id,
    }).catch((err) => console.error(`[operaciones/depuracion] Error avisando a ${u.id}:`, err))
  ));
}
