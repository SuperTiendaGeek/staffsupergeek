import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessApp } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import { obtenerFactura } from "@/lib/facturacion/airtable/facturas";
import { parsearLineasFactura } from "@/lib/facturacion/print/lineasFactura";

export const dynamic = "force-dynamic";

// Vista de SOLO LECTURA de una factura — sin ninguna acción (nada de
// reenviar correo, nota de crédito, anulación, etc.). Nace del enlace
// "Factura NNN..." en /tecnicos/mantenimientos (ver
// app/tecnicos/mantenimientos/MantenimientosPageClient.tsx): antes ese
// enlace apuntaba al DocumentoDetalleModal de /facturacion, que SÍ es de
// solo lectura en su contenido, pero trae pegada la barra de "Acciones"
// completa (Reenviar correo, Nota de crédito, Solicitar anulación…) — botones
// sin ningún sentido fuera del flujo de facturación. Esta es la misma
// información, sin esa barra.
//
// Requiere permiso de Facturación (no Técnicos) a propósito: es información
// financiera/tributaria de la factura (montos, IVA, clave de acceso SRI), y
// eso se protege por el dato, no por la pantalla desde la que se llegó a él
// — igual que el modal de /facturacion del que viene.

const mon = (n: number) => `$${n.toFixed(2)}`;
const fmt = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const ESTADO_FACTURA_LABEL: Record<string, string> = {
  AUTORIZADO: "Autorizada",
  DEVUELTA: "Devuelta",
  "NO AUTORIZADO": "No autorizada",
  PENDIENTE: "En proceso",
  RECIBIDA: "En proceso",
  BORRADOR: "Borrador",
  ANULADA: "Anulada",
};

function estadoColor(estado: string): string {
  const e = estado.toUpperCase();
  if (["AUTORIZADO", "AUTORIZADA"].includes(e)) return "text-emerald-400";
  if (["ANULADA", "ANULADO", "NO AUTORIZADO", "DEVUELTA", "RECHAZADA"].includes(e)) return "text-red-400";
  if (["PENDIENTE", "RECIBIDA"].includes(e)) return "text-yellow-300";
  return "text-[#A7A7A7]";
}

const AMBIENTE_BADGE: Record<string, string> = {
  PRUEBAS: "bg-amber-900/40 text-amber-300 border-amber-700/50",
  "PRODUCCIÓN": "bg-[#D7FF4F]/10 text-[#D7FF4F] border-[#D7FF4F]/30",
};

const FORMA_PAGO_LABEL: Record<string, string> = {
  "01": "Efectivo",
  "15": "Compensación de deudas",
  "16": "Tarjeta de débito",
  "17": "Dinero electrónico",
  "18": "Tarjeta prepago",
  "19": "Tarjeta de crédito",
  "20": "Otros (sist. financiero)",
  "21": "Endoso de títulos",
};

export default async function VerFacturaPage({ params }: { params: Promise<{ recordId: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");
  if (!canAccessApp(session, "Facturación")) redirect("/");

  const { recordId } = await params;
  const factura = recordId ? await obtenerFactura(recordId) : null;

  if (!factura) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#101110] px-4 text-[#F0F0EC]">
        <div className="rounded-2xl border border-[#3A3A36] bg-[#1A1A16] p-6 text-center">
          <p className="text-sm text-[#A7A7A7]">Factura no encontrada.</p>
          <Link href="/facturacion" className="mt-3 inline-block text-sm text-[#D7FF4F] hover:underline">
            Volver a Facturación
          </Link>
        </div>
      </main>
    );
  }

  const { items, formaPago } = parsearLineasFactura(factura.lineasJson);

  return (
    <main className="min-h-screen bg-[#101110] px-4 py-10 text-[#F0F0EC]">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-[#2A2A22] bg-[#1A1A16] shadow-2xl">
        <div className="border-b border-[#2A2A22] px-5 py-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold bg-[#D7FF4F]/15 text-[#D7FF4F] border-[#D7FF4F]/40">
              Factura
            </span>
            <span className={`text-xs ${estadoColor(factura.estado)}`}>
              {ESTADO_FACTURA_LABEL[factura.estado] ?? factura.estado}
            </span>
            {factura.ambiente && (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${AMBIENTE_BADGE[factura.ambiente] ?? ""}`}
              >
                {factura.ambiente}
              </span>
            )}
          </div>
          <p className="mt-1 text-lg font-bold font-mono text-[#F5F5F5]">{factura.numeroFactura || "—"}</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-sm space-y-1">
            <div className="flex justify-between gap-3">
              <span className="text-[#666]">Cliente</span>
              <span className="text-[#F5F5F5] text-right">{factura.clienteNombre || "—"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#666]">Identificación</span>
              <span className="text-[#F5F5F5] text-right">{factura.clienteIdentificacion || "—"}</span>
            </div>
            {factura.clienteCorreo && (
              <div className="flex justify-between gap-3">
                <span className="text-[#666]">Correo</span>
                <span className="text-[#F5F5F5] text-right truncate">{factura.clienteCorreo}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-[#666]">Fecha</span>
              <span className="text-[#F5F5F5] text-right">{fmt(factura.fechaEmision)}</span>
            </div>
          </div>

          {items.length > 0 ? (
            <div className="rounded-xl border border-[#2A2A22] bg-[#151510] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#555] border-b border-[#2A2A22]">
                    <th className="text-left font-semibold py-1.5 px-2">Descripción</th>
                    <th className="text-right font-semibold py-1.5 px-2">Cant.</th>
                    <th className="text-right font-semibold py-1.5 px-2">P.Unit</th>
                    <th className="text-right font-semibold py-1.5 px-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E1E1A]">
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-1.5 px-2 text-[#F5F5F5]">
                        {it.codigo && <span className="block font-mono text-[10px] text-[#777]">SKU: {it.codigo}</span>}
                        {it.descripcion}
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#A7A7A7]">{it.cantidad}</td>
                      <td className="py-1.5 px-2 text-right text-[#A7A7A7]">{mon(it.precioUnitario)}</td>
                      <td className="py-1.5 px-2 text-right text-[#D7FF4F] font-semibold">{mon(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[#555] italic px-1">Detalle de ítems no disponible para esta factura.</p>
          )}

          <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-[#666]">Subtotal</span>
              <span className="text-[#F5F5F5]">{mon(factura.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666]">IVA</span>
              <span className="text-[#F5F5F5]">{mon(factura.iva)}</span>
            </div>
            <div className="flex justify-between text-base font-bold">
              <span className="text-[#F5F5F5]">TOTAL</span>
              <span className="text-[#D7FF4F]">{mon(factura.total)}</span>
            </div>
          </div>

          {formaPago && (
            <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-[#666]">Forma de pago</span>
                <span className="text-[#F5F5F5] text-right">{FORMA_PAGO_LABEL[formaPago] ?? formaPago}</span>
              </div>
            </div>
          )}

          {factura.claveAcceso && (
            <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-[10px] text-[#888] break-all">
              <p className="text-[#666] font-semibold uppercase tracking-wider mb-1">SRI</p>
              <p>
                <span className="text-[#666]">Clave de acceso:</span> {factura.claveAcceso}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
