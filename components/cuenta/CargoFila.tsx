"use client";

import { useState } from "react";
import { Tag, X } from "lucide-react";
import { montoDesdePorcentaje, type CargoDescontable, type DescuentoCuenta } from "@/lib/estado-cuenta/descuentos";

// Una línea de la tarjeta "Cuenta" con su descuento (punto 4B). Se movió tal
// cual desde CuentaUnificadaPanel (punto 11): mismo formulario, misma ruta.

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);

// Línea de la cuenta con su descuento (punto 4B). Sin descuento se ve igual
// que siempre; el administrador tiene además la etiqueta para darlo. Con
// descuento: precio de lista tachado, precio final y una pastilla "−$X" con
// el motivo (title); clic en la pastilla para quitarlo.
export function CargoFila({
  label, origen, precio, cargo, descuento, editable, abierto, destello, url, onAbrir, onHecho,
}: {
  label: string;
  origen: string;
  precio: number;
  cargo: CargoDescontable | null;
  descuento: DescuentoCuenta | undefined;
  editable: boolean;
  abierto: boolean;
  destello: boolean;
  url: string | null;
  onAbrir: () => void;
  onHecho: () => void;
}) {
  const [modo, setModo] = useState<"$" | "%">("$");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numero = parseFloat(valor.replace(",", "."));
  const monto = !Number.isFinite(numero) ? 0 : modo === "%" ? montoDesdePorcentaje(precio, numero) : Math.round(numero * 100) / 100;
  const queda = Math.max(0, Math.round((precio - monto) * 100) / 100);
  const conDescuento = descuento ? Math.max(0, precio - descuento.monto) : precio;
  const puedeAplicar = !!cargo && monto > 0 && monto <= precio + 0.005 && motivo.trim().length >= 4 && !enviando;

  async function enviar(metodo: "POST" | "DELETE") {
    if (!url) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(metodo === "POST" ? url : `${url}/${descuento?.id}`, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metodo === "POST" ? { cargoId: cargo?.id, monto, motivo } : { motivo: "Quitado desde la cuenta" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      setValor("");
      setMotivo("");
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      style={{
        borderTop: "1px dashed #2C2D29",
        animation: destello ? "sg-destello 900ms ease-out" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", padding: "6px 0", fontSize: "13px" }}>
        <div style={{ flex: 1, minWidth: 0, color: "#F5F5F5" }}>
          {label}
          <span style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "1px", fontSize: "11px", color: "#A7A7A7" }}>
            {origen}
            {descuento && (
              <button
                type="button"
                disabled={!editable}
                onClick={onAbrir}
                title={`${descuento.motivo}${descuento.autorizadoPor ? ` · ${descuento.autorizadoPor}` : ""}`}
                style={{
                  borderRadius: "999px", padding: "0 7px", fontSize: "10px", fontWeight: 700, border: "none",
                  background: "rgba(240, 199, 94, 0.16)", color: "#F0C75E", cursor: editable ? "pointer" : "default",
                }}
              >
                −{formatCurrency(descuento.monto)}
              </button>
            )}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", whiteSpace: "nowrap" }}>
          {descuento && (
            <span style={{ fontSize: "11px", color: "#6B6B66", textDecoration: "line-through" }}>{formatCurrency(precio)}</span>
          )}
          <span style={{ fontWeight: 600, color: "#F5F5F5" }}>{formatCurrency(conDescuento)}</span>
          {editable && cargo && !descuento && (
            <button
              type="button"
              onClick={onAbrir}
              title="Dar descuento"
              aria-label={`Dar descuento a ${label}`}
              style={{ alignSelf: "center", background: "none", border: "none", padding: "2px", cursor: "pointer", color: abierto ? "#D7FF4F" : "#6B6B66" }}
            >
              <Tag size={13} />
            </button>
          )}
        </div>
      </div>

      {abierto && editable && (
        <div style={{ padding: "0 0 10px", animation: "sg-entrada 160ms ease-out" }}>
          {descuento ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#A7A7A7" }}>
              <span style={{ flex: 1, minWidth: 0 }}>{descuento.motivo}</span>
              <button type="button" disabled={enviando} onClick={() => enviar("DELETE")} style={{ ...BOTON_CHICO, color: "#FF5A4F", borderColor: "#FF5A4F55" }}>
                {enviando ? "Quitando…" : "Quitar descuento"}
              </button>
              <button type="button" onClick={onAbrir} aria-label="Cerrar" style={{ background: "none", border: "none", color: "#6B6B66", cursor: "pointer" }}><X size={14} /></button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", border: "1px solid #3A3A36", borderRadius: "0.4rem", overflow: "hidden" }}>
                <input
                  autoFocus
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0"
                  aria-label="Monto del descuento"
                  style={{ width: "64px", background: "#1A1B18", border: "none", color: "#F5F5F5", padding: "5px 8px", fontSize: "12px", textAlign: "right" }}
                />
                {(["$", "%"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModo(m)}
                    style={{ border: "none", padding: "0 8px", fontSize: "12px", fontWeight: 700, cursor: "pointer", background: modo === m ? "#D7FF4F" : "#2D2E2A", color: modo === m ? "#10110E" : "#A7A7A7" }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && puedeAplicar) void enviar("POST"); if (e.key === "Escape") onAbrir(); }}
                placeholder="Motivo"
                aria-label="Motivo del descuento"
                style={{ flex: 1, minWidth: "120px", background: "#1A1B18", border: "1px solid #3A3A36", borderRadius: "0.4rem", color: "#F5F5F5", padding: "5px 8px", fontSize: "12px" }}
              />
              <button type="button" disabled={!puedeAplicar} onClick={() => enviar("POST")} style={{ ...BOTON_CHICO, ...(puedeAplicar ? BOTON_PRIMARIO : { color: "#6B6B66", cursor: "not-allowed" }) }}>
                {enviando ? "Aplicando…" : monto > 0 ? `Aplicar · queda ${formatCurrency(queda)}` : "Aplicar"}
              </button>
            </div>
          )}
          {error && <p style={{ marginTop: "6px", fontSize: "11px", color: "#FF5A4F", animation: "sg-sacudir 300ms ease" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

const BOTON_PRIMARIO: React.CSSProperties = { color: "#10110E", background: "#D7FF4F", border: "none", cursor: "pointer" };
const BOTON_CHICO: React.CSSProperties = {
  borderRadius: "0.4rem", padding: "5px 10px", fontSize: "12px", fontWeight: 700,
  background: "transparent", border: "1px solid #3A3A36", cursor: "pointer", whiteSpace: "nowrap",
  transition: "background-color 160ms ease, color 160ms ease",
};
