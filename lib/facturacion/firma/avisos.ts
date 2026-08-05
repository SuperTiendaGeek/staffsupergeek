import "server-only";

// Notificaciones de vencimiento de la firma electrónica.
//
// ─── Por qué no hay un cron ──────────────────────────────────────────────────
//
// El proyecto no tiene tareas programadas. En vez de introducir esa
// infraestructura solo para esto, el aviso se dispara desde el endpoint que ya
// consulta el banner (`/api/facturacion/firma/aviso`), que se llama cada vez
// que alguien abre una pantalla de facturación.
//
// Es suficiente para el problema real: la firma importa cuando se factura, y
// si nadie factura en semanas, el aviso no hace falta todavía. Lo que no
// puede pasar es que alguien entre a facturar y no vea nada — y eso queda
// cubierto.
//
// ─── Por qué no se duplica ───────────────────────────────────────────────────
//
// Cada aviso lleva una clave determinística en "Entidad ID":
//     firma-vence:<fecha de vencimiento>:<umbral>
// Antes de crear nada se pregunta si ya existe una notificación con esa clave.
// Da igual cuántas veces se abra la pantalla o cuántas instancias haya
// corriendo: el aviso de "faltan 30 días" se crea una sola vez.

import { crearNotificacion } from "@/lib/notificaciones/airtable";
import { listPortalUsers }   from "@/lib/airtable";
import { isAdministratorRole } from "@/lib/apps";
import { diasRestantes, DIAS_DE_AVISO } from "./vigencia";
import type { MetadatosFirma } from "./inspeccionar";

const NOTIFICACIONES_TABLE = process.env.AIRTABLE_NOTIFICACIONES_TABLE?.trim() || "Notificaciones";

/** Clave determinística del aviso. Un umbral, una notificación, para siempre. */
export function claveAviso(validoHasta: Date, umbral: number): string {
  return `firma-vence:${validoHasta.toISOString().split("T")[0]}:${umbral}`;
}

/**
 * ¿Qué umbral corresponde hoy? Devuelve null si hoy no toca avisar.
 *
 * Se usa el umbral EXACTO (60, 30, 15, 7, 1) para que cada aviso se mande una
 * sola vez y no todos los días desde los 60.
 */
export function umbralDeHoy(validoHasta: Date, ahora: Date): number | null {
  const dias = diasRestantes(validoHasta, ahora);
  return (DIAS_DE_AVISO as readonly number[]).includes(dias) ? dias : null;
}

// ─── Airtable: ¿ya existe este aviso? ────────────────────────────────────────

async function yaExisteAviso(clave: string): Promise<boolean> {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) return true; // sin credenciales, mejor no intentar crear

  const params = new URLSearchParams({
    filterByFormula: `{Entidad ID}="${clave}"`,
    maxRecords:      "1",
    "fields[]":      "Entidad ID",
  });

  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(NOTIFICACIONES_TABLE)}?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Airtable ${NOTIFICACIONES_TABLE} ${res.status}`);

  const data = (await res.json()) as { records: unknown[] };
  return data.records.length > 0;
}

// ─── Texto del aviso ─────────────────────────────────────────────────────────

function textoAviso(m: MetadatosFirma, dias: number): { titulo: string; mensaje: string } {
  const fecha = m.validoHasta.toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
  const plural = dias === 1 ? "día" : "días";

  const urgencia =
    dias <= 7  ? "Es urgente: " :
    dias <= 30 ? "Hay que gestionarlo ya: " :
                 "";

  return {
    titulo: `Firma electrónica: ${dias} ${plural} para vencer`,
    mensaje:
      `${urgencia}la firma electrónica de ${m.titular} vence el ${fecha}. ` +
      `Cuando venza no se podrán emitir facturas ni notas de crédito: el SRI rechaza ` +
      `todo comprobante firmado con un certificado caducado. ` +
      `Renuévala con ${m.emisor} y cárgala en Facturación → Firma electrónica.`,
  };
}

// ─── API ─────────────────────────────────────────────────────────────────────

export type ResultadoAviso = { creados: number; motivo?: string };

/**
 * Crea la notificación del día, si toca y si no existe ya, para todos los
 * administradores activos.
 *
 * Best-effort por diseño: es un aviso, no puede tumbar la pantalla que lo
 * dispara. Nunca lanza — devuelve por qué no hizo nada.
 */
export async function notificarVencimientoFirma(
  metadatos: MetadatosFirma,
  ahora: Date = new Date()
): Promise<ResultadoAviso> {
  try {
    const umbral = umbralDeHoy(metadatos.validoHasta, ahora);
    if (umbral === null) return { creados: 0, motivo: "hoy no corresponde ningún umbral de aviso" };

    const clave = claveAviso(metadatos.validoHasta, umbral);
    if (await yaExisteAviso(clave)) {
      return { creados: 0, motivo: "el aviso de este umbral ya se envió" };
    }

    const usuarios = await listPortalUsers();
    const admins   = usuarios.filter((u) => u.activo && isAdministratorRole(u.rol));
    if (admins.length === 0) return { creados: 0, motivo: "no hay administradores activos" };

    const { titulo, mensaje } = textoAviso(metadatos, umbral);

    let creados = 0;
    for (const admin of admins) {
      try {
        await crearNotificacion({
          destinatarioId: admin.id,
          tipo:           "Sistema",
          titulo,
          mensaje,
          urlAccion:      "/facturacion/firma",
          prioridad:      umbral <= 7 ? "Crítica" : umbral <= 30 ? "Alta" : "Normal",
          entidadTipo:    "Sistema",
          entidadId:      clave,
        });
        creados++;
      } catch (e) {
        console.error(`[notificarVencimientoFirma] no se pudo notificar a ${admin.id}:`, e);
      }
    }

    return { creados };
  } catch (e) {
    console.error("[notificarVencimientoFirma] fallo general:", e);
    return { creados: 0, motivo: e instanceof Error ? e.message : "error desconocido" };
  }
}
