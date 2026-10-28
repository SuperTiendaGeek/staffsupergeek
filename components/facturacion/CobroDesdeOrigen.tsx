"use client";

// Piezas de pantalla para emitir DESDE una orden u operación — auditoría
// Técnicos y Operaciones, punto 1 (27-oct-2026). Las usan el formulario de
// factura y el de recibo, así las dos pantallas cobran igual:
//
//   · AvisoCuentaPorCobrar: barra de una línea con el origen y el estado de la
//     cuenta. Lo normal es llegar con la cuenta pagada (la orden no deja
//     emitir si falta cobrar); si no, "Registrar pago" abre el mismo
//     formulario de abono y la pantalla se recarga con la cuenta al día.
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

/**
 * Barra de una línea: de dónde viene el documento y el estado de la cuenta.
 * Pagada → se emite. Falta cobrar → "Registrar pago" (el mismo formulario de
 * abono) y no se emite. Pagado de más → se resuelve en la orden.
 */
export function AvisoCuentaPorCobrar({
  origen,
  saldo,
  etiquetaOrigen,
}: {
  origen: OrigenCuenta;
  /** Total de la cuenta − abonos vigentes (lo arma el servidor); null = sin dato. */
  saldo: number | null;
  etiquetaOrigen?: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const nombre = `${origen.tipo === "orden" ? "Orden" : "Operación"}${etiquetaOrigen ? ` ${etiquetaOrigen}` : ""}`;
  const estado = saldo === null ? null : Math.abs(saldo) <= 0.01 ? "pagada" : saldo > 0 ? "debe" : "favor";
  const borde =
    estado === "debe" ? "border-[#F0C75E]/50 bg-[#F0C75E]/[0.07]" :
    estado === "favor" ? "border-[#78B7FF]/40 bg-[#78B7FF]/[0.07]" :
    "border-[#D7FF4F]/30 bg-[#D7FF4F]/[0.05]";

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2.5 transition-colors duration-300 ${borde}`}>
      <span className="text-sm font-semibold text-[#D7FF4F]">{nombre}</span>
      {estado === "pagada" && (
        <span className="rounded-full bg-[#6EE7B7]/15 px-2.5 py-0.5 text-xs font-semibold text-[#6EE7B7] animate-[sg-entrada_200ms_ease-out]">✓ Cuenta pagada</span>
      )}
      {estado === "debe" && (
        <>
          <span className="rounded-full bg-[#F0C75E]/15 px-2.5 py-0.5 text-xs font-semibold text-[#F0C75E]" title="El documento se emite con la cuenta en $0">
            Falta cobrar {dinero(saldo ?? 0)}
          </span>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="ml-auto rounded-full bg-[#D7FF4F] px-3.5 py-1 text-xs font-bold text-[#151515] transition hover:brightness-105"
          >
            Registrar pago
          </button>
        </>
      )}
      {estado === "favor" && (
        <span className="rounded-full bg-[#78B7FF]/15 px-2.5 py-0.5 text-xs font-semibold text-[#78B7FF]" title="Anula el abono que sobra o devuelve el dinero desde la orden">
          Pagado de más {dinero(-(saldo ?? 0))} · resolver en la {origen.tipo === "orden" ? "orden" : "operación"}
        </span>
      )}
      {abierto && (
        <RegistrarAbonoModal
          operacionId={origen.tipo === "operacion" ? origen.recordId : null}
          ordenId={origen.tipo === "orden" ? origen.recordId : null}
          montoSugerido={saldo ?? undefined}
          onClose={() => setAbierto(false)}
          // Recargar trae la cuenta al día desde el servidor (única fuente).
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
  return <PagosPorMetodo titulo="Cobro venta adicional" total={total} pagos={pagos} onChange={onChange} />;
}

/**
 * Cobros por método (auditoría ops, punto 7): una fila por pago con el método
 * —que dice a qué cuenta entra el dinero—, el monto y el n.º de transacción.
 * "+ Otro método" para pagos mixtos. Es el mismo control en la venta
 * adicional, la factura y el recibo de mostrador.
 */
export function PagosPorMetodo({
  titulo,
  total,
  pagos,
  onChange,
}: {
  titulo: string;
  total: number;
  pagos: PagoAdicionalForm[];
  onChange: (pagos: PagoAdicionalForm[]) => void;
}) {
  const suma = round2(pagos.reduce((s, p) => s + (p.total || 0), 0));
  const falta = round2(total - suma);
  const actualizar = (id: string, cambios: Partial<PagoAdicionalForm>) =>
    onChange(pagos.map((p) => (p._id === id ? { ...p, ...cambios } : p)));

  return (
    <div className="mt-3 rounded-lg border border-[#D7FF4F]/30 bg-[#D7FF4F]/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#D7FF4F]">{titulo} · {dinero(total)}</p>
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
          <div key={p._id} className="flex flex-col gap-1.5 rounded-md border border-[#3A3A36] bg-[#1A1B18] p-2 animate-[sg-entrada_180ms_ease-out]">
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
              placeholder={requiereNumeroTransaccion(p.metodoPago) ? "N° de transacción *" : "N° de transacción"}
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
