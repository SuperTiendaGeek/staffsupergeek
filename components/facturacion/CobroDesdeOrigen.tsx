"use client";

// Piezas de pantalla para emitir DESDE una orden u operación — auditoría
// Técnicos y Operaciones, punto 1 (27-oct-2026). Las usan el formulario de
// factura y el de recibo, así las dos pantallas cobran igual:
//
//   · AvisoCuentaPorCobrar: si la cuenta no está pagada, NO se emite. El
//     botón "Registrar pago" abre el MISMO formulario de abono de siempre
//     (método con su cuenta, número obligatorio en transferencias y DeUna,
//     comprobante). Al guardarlo, la pantalla se recarga con la cuenta al día.
//   · PagosVentaAdicional: lo que el cliente compra de paso (mouse, webcam,
//     envío) se cobra aquí, con método y número. El código SRI lo deduce el
//     servidor del método; el empleado nunca lo elige.

import { useState } from "react";
import { RegistrarAbonoModal } from "@/components/operaciones/RegistrarAbonoModal";
import { METODOS_COBRO_NUEVO, etiquetaMetodoPago, requiereNumeroTransaccion } from "@/types/abonos";
import { mensajePagosAdicionalesInvalidos } from "@/lib/facturacion/reglas/cobroDocumento";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dinero = (n: number) => `$${round2(n).toFixed(2)}`;

export type OrigenCuenta = { tipo: "orden" | "operacion"; recordId: string };

export type PagoAdicionalForm = { _id: string; metodoPago: string; total: number; referencia: string };

export function nuevoPagoAdicional(total = 0): PagoAdicionalForm {
  return { _id: crypto.randomUUID(), metodoPago: "Efectivo", total: round2(total), referencia: "" };
}

/** Mismo mensaje que el servidor (reglas/cobroDocumento.ts). */
export function errorPagosAdicionales(pagos: PagoAdicionalForm[], totalAdicional: number): string | null {
  return mensajePagosAdicionalesInvalidos(
    pagos.map((p) => ({ metodoPago: p.metodoPago, total: p.total, referencia: p.referencia })),
    totalAdicional
  );
}

export function AvisoCuentaPorCobrar({
  origen,
  saldo,
  etiquetaOrigen,
}: {
  origen: OrigenCuenta;
  /** Total de la cuenta − abonos vigentes (lo arma el servidor). */
  saldo: number;
  etiquetaOrigen?: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const nombre = origen.tipo === "orden" ? "la orden" : "la operación";

  if (Math.abs(saldo) <= 0.01) {
    return (
      <div className="mb-4 rounded-xl border border-[#6EE7B7]/40 bg-[#064E3B]/30 px-4 py-3">
        <p className="text-sm font-bold text-[#6EE7B7]">✓ La cuenta de {nombre}{etiquetaOrigen ? ` ${etiquetaOrigen}` : ""} está pagada</p>
        <p className="mt-0.5 text-[11px] text-[#A7A7A7]">
          Sus abonos cubren el total. Si el cliente se lleva algo más, agrégalo como venta adicional y cóbralo abajo.
        </p>
      </div>
    );
  }

  if (saldo < 0) {
    return (
      <div className="mb-4 rounded-xl border border-[#78B7FF]/40 bg-[#78B7FF]/10 px-4 py-3">
        <p className="text-sm font-bold text-[#78B7FF]">El cliente pagó {dinero(-saldo)} de más en {nombre}</p>
        <p className="mt-0.5 text-[11px] text-[#A7A7A7]">
          Antes de emitir hay que resolver ese saldo a favor (anular el abono que sobra o devolver el dinero) desde {nombre}.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-[#F0C75E]/50 bg-[#F0C75E]/10 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#F0C75E]">
            Falta cobrar {dinero(saldo)} de {nombre}{etiquetaOrigen ? ` ${etiquetaOrigen}` : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-[#A7A7A7]">
            Primero registra el pago (puede ser en varias partes: efectivo, transferencia Banco Pichincha, DeUna…).
            El documento se emite cuando la cuenta queda en $0. Nunca se emite debiendo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-xs font-bold text-[#151515] hover:brightness-105"
        >
          Registrar pago
        </button>
      </div>
      {abierto && (
        <RegistrarAbonoModal
          operacionId={origen.tipo === "operacion" ? origen.recordId : null}
          ordenId={origen.tipo === "orden" ? origen.recordId : null}
          montoSugerido={saldo}
          onClose={() => setAbierto(false)}
          // Recargar trae la cuenta al día (abonos, saldo y formas de pago)
          // desde el servidor: es la única fuente.
          onSuccess={() => window.location.reload()}
        />
      )}
    </div>
  );
}

export function PagosVentaAdicional({
  total,
  pagos,
  onChange,
}: {
  total: number;
  pagos: PagoAdicionalForm[];
  onChange: (pagos: PagoAdicionalForm[]) => void;
}) {
  if (total <= 0.01) return null;
  const suma = round2(pagos.reduce((s, p) => s + (p.total || 0), 0));
  const falta = round2(total - suma);
  const actualizar = (id: string, cambios: Partial<PagoAdicionalForm>) =>
    onChange(pagos.map((p) => (p._id === id ? { ...p, ...cambios } : p)));

  return (
    <div className="mt-3 rounded-lg border border-[#D7FF4F]/30 bg-[#D7FF4F]/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#D7FF4F]">Cobro de la venta adicional · {dinero(total)}</p>
        <button
          type="button"
          onClick={() => onChange([...pagos, nuevoPagoAdicional(Math.max(0, falta))])}
          className="text-xs text-lime-400 underline hover:text-lime-300"
        >
          + Otro método
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {pagos.map((p) => (
          <div key={p._id} className="flex flex-col gap-1.5 rounded-md border border-[#3A3A36] bg-[#1A1B18] p-2">
            <div className="flex items-center gap-2">
              <select
                value={p.metodoPago}
                onChange={(e) => actualizar(p._id, { metodoPago: e.target.value })}
                className="flex-1 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-[#F5F5F5]"
              >
                {METODOS_COBRO_NUEVO.map((m) => (
                  <option key={m} value={m}>{etiquetaMetodoPago(m)}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={p.total}
                onChange={(e) => actualizar(p._id, { total: parseFloat(e.target.value) || 0 })}
                className="w-24 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-right text-xs text-[#F5F5F5]"
              />
              {pagos.length > 1 && (
                <button type="button" onClick={() => onChange(pagos.filter((x) => x._id !== p._id))} className="text-xs text-[#666] hover:text-red-400">✕</button>
              )}
            </div>
            <input
              type="text"
              value={p.referencia}
              onChange={(e) => actualizar(p._id, { referencia: e.target.value })}
              placeholder={requiereNumeroTransaccion(p.metodoPago) ? "N° de transacción (obligatorio)" : "N° de transacción (opcional)"}
              className="w-full rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-[#F5F5F5]"
            />
          </div>
        ))}
      </div>
      <p className={`mt-2 text-[11px] ${Math.abs(falta) > 0.01 ? "text-[#F0C75E]" : "text-[#6EE7B7]"}`}>
        {Math.abs(falta) > 0.01 ? (falta > 0 ? `Falta asignar ${dinero(falta)}` : `Sobran ${dinero(-falta)}`) : "✓ Cobro completo"}
      </p>
    </div>
  );
}
