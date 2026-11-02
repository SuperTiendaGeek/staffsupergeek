"use client";

import { useState } from "react";

// Acciones sobre el dinero de más de una cuenta (auditoría ops, punto 13B).
// Se monta dentro de CuentaUnificadaPanel cuando a la cuenta le sobra dinero:
//   · "Pasar a saldo a favor" (cualquier empleado): el sobrante queda como
//     saldo del cliente para su próxima compra; la cuenta queda en $0.
//   · "Devolver" (solo administrador): se elige de qué cuenta sale el dinero,
//     cómo se devolvió y el número; la salida se registra en Finanzas.
// Colores literales (no var(--sg-*)): el panel también vive en Operaciones.

export type SaldoInfo = {
  disponible: number;
  proximoVence: string;
  puedeDevolver: boolean;
  cuentasDevolucion: Array<{ id: string; nombre: string }>;
  metodosDevolucion: string[];
};

const dinero = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

export function SaldoAFavorAcciones({
  url,
  sobrante,
  info,
  onHecho,
}: {
  /** POST /api/.../saldo-favor de la orden o de la operación. */
  url: string;
  sobrante: number;
  info: SaldoInfo | null;
  onHecho: (mensaje: string) => void;
}) {
  const [modo, setModo] = useState<"botones" | "devolver">("botones");
  const [cuenta, setCuenta] = useState("");
  const [metodo, setMetodo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(cuerpo: Record<string, unknown>, exito: string) {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      onHecho(j.warning ? `${exito} ${j.warning}` : exito);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  const puedeConfirmarDevolucion = !!cuenta && !!metodo && (metodo === "Efectivo" || metodo === "Otro" || referencia.trim().length > 0) && !enviando;

  return (
    <div style={{ margin: "0 14px 14px" }}>
      {modo === "botones" ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={enviando}
            onClick={() => enviar({ accion: "pasar" }, `${dinero(sobrante)} pasaron al saldo a favor del cliente.`)}
            style={{ ...BOTON, ...BOTON_PRIMARIO, flex: 2, opacity: enviando ? 0.6 : 1 }}
          >
            {enviando ? "Guardando…" : `Pasar ${dinero(sobrante)} a saldo a favor`}
          </button>
          {info?.puedeDevolver && (
            <button type="button" disabled={enviando} onClick={() => setModo("devolver")} style={{ ...BOTON, ...BOTON_SECUNDARIO, flex: 1 }}>
              Devolver
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "6px", animation: "sg-entrada 160ms ease-out" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} aria-label="Cuenta de la que sale el dinero" style={{ ...CAMPO, flex: 1 }}>
              <option value="">Sale de…</option>
              {(info?.cuentasDevolucion ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Cómo se devuelve" style={{ ...CAMPO, flex: 1 }}>
              <option value="">Cómo…</option>
              {(info?.metodosDevolucion ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder={metodo === "Efectivo" ? "N° (opcional)" : "N° de transacción"}
            aria-label="Número de transacción"
            style={CAMPO}
          />
          <div style={{ display: "flex", gap: "6px" }}>
            <button type="button" disabled={enviando} onClick={() => { setModo("botones"); setError(null); }} style={{ ...BOTON, ...BOTON_SECUNDARIO, flex: 1 }}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={!puedeConfirmarDevolucion}
              onClick={() => enviar({ accion: "devolver", cuentaOrigenId: cuenta, metodo, transaccionId: referencia.trim() }, `Se registró la devolución de ${dinero(sobrante)}.`)}
              style={{ ...BOTON, ...(puedeConfirmarDevolucion ? BOTON_PELIGRO : BOTON_APAGADO), flex: 2 }}
            >
              {enviando ? "Registrando…" : `Devolver ${dinero(sobrante)}`}
            </button>
          </div>
        </div>
      )}
      {error && <p style={{ marginTop: "6px", fontSize: "11px", color: "#FF5A4F", animation: "sg-sacudir 300ms ease" }}>{error}</p>}
    </div>
  );
}

const BOTON: React.CSSProperties = {
  display: "block", textAlign: "center", borderRadius: "0.5rem", padding: "9px 14px",
  fontSize: "13px", fontWeight: 700, cursor: "pointer", transition: "background-color 160ms ease, color 160ms ease, opacity 160ms ease",
};
const BOTON_PRIMARIO: React.CSSProperties = { color: "#10110E", background: "#D7FF4F", border: "none" };
const BOTON_SECUNDARIO: React.CSSProperties = { color: "#CFCFCB", background: "transparent", border: "1px solid #3A3A36" };
const BOTON_PELIGRO: React.CSSProperties = { color: "#10110E", background: "#F0C75E", border: "none" };
const BOTON_APAGADO: React.CSSProperties = { color: "#6B6B66", background: "transparent", border: "1px solid #3A3A36", cursor: "not-allowed" };
const CAMPO: React.CSSProperties = {
  background: "#1A1B18", border: "1px solid #3A3A36", borderRadius: "0.4rem", color: "#F5F5F5", padding: "7px 8px", fontSize: "12px", minWidth: 0,
};
