"use client";

// Un cobro: método (con su cuenta) + n.º de transacción (auditoría ops,
// punto 7). Mismo catálogo que los abonos de la orden y la factura de
// mostrador: el vendedor nunca elige un código del SRI.

import { METODOS_COBRO_NUEVO, etiquetaMetodoPago, requiereNumeroTransaccion } from "@/types/abonos";

const SELECT = "w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-2 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/40";

export function MetodoCobroSelector({
  metodo,
  referencia,
  onMetodo,
  onReferencia,
  disabled = false,
  etiqueta = "Método de cobro",
}: {
  metodo: string;
  referencia: string;
  onMetodo: (m: string) => void;
  onReferencia: (r: string) => void;
  disabled?: boolean;
  etiqueta?: string;
}) {
  const exige = requiereNumeroTransaccion(metodo);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#A7A7A7]">{etiqueta}</label>
      <select value={metodo} onChange={(e) => onMetodo(e.target.value)} disabled={disabled} className={SELECT}>
        {METODOS_COBRO_NUEVO.map((m) => (
          <option key={m} value={m}>{etiquetaMetodoPago(m)}</option>
        ))}
      </select>
      <input
        type="text"
        value={referencia}
        onChange={(e) => onReferencia(e.target.value)}
        disabled={disabled}
        placeholder={exige ? "N° de transacción *" : "N° de transacción"}
        className={`${SELECT} ${exige && !referencia.trim() ? "border-[#F0C75E]/60" : ""}`}
      />
    </div>
  );
}
