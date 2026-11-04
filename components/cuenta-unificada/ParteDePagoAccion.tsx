"use client";

import { useState } from "react";
import { SHIPPING_V2_CATEGORIAS, SHIPPING_V2_CONDICIONES } from "@/types/shipping-v2";

// "Parte de pago" (2-nov-2026): el cliente deja un artículo (un disco, un
// equipo usado) y se le descuenta de lo que debe. Lo puede registrar
// cualquier empleado que cobra; el artículo entra al inventario "por
// revisar". Anularlo es solo de administrador (desde el abono).
// Colores literales (no var(--sg-*)): el panel también vive en Operaciones.

const dinero = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

const CAMPO: React.CSSProperties = {
  background: "#151613", color: "#F5F5F5", border: "1px solid #3A3A36", borderRadius: "0.4rem",
  padding: "6px 8px", fontSize: "13px", minWidth: 0,
};

export function ParteDePagoAccion({
  url, porCobrar, onHecho,
}: {
  /** POST /api/.../parte-de-pago de la orden o del pedido. */
  url: string;
  porCobrar: number;
  onHecho: (mensaje: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("");
  const [condicion, setCondicion] = useState("Usado");
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monto = Math.round((parseFloat(valor.replace(",", ".")) || 0) * 100) / 100;
  const listo = descripcion.trim().length >= 3 && !!categoria && !!condicion && monto > 0 && monto <= porCobrar + 0.005 && !enviando;

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={{ background: "none", border: "none", padding: 0, fontSize: "12px", color: "#A7A7A7", textDecoration: "underline", cursor: "pointer" }}>
        Parte de pago
      </button>
    );
  }

  async function recibir() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descripcion, categoria, condicion, valor: monto }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo registrar.");
      const exito = `${j.data.sku} entró al inventario (por revisar) · −${dinero(monto)}.`;
      onHecho(j.warning ? `${exito} ${j.warning}` : exito);
      setAbierto(false);
      setDescripcion(""); setCategoria(""); setValor("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ flexBasis: "100%", display: "grid", gap: "6px", padding: "10px", border: "1px dashed #3A3A36", borderRadius: "0.5rem", animation: "sg-entrada 160ms ease-out" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#A7A7A7" }}>
        <span style={{ fontWeight: 700, color: "#F5F5F5" }}>Parte de pago</span>
        <span>hasta {dinero(porCobrar)}</span>
      </div>
      <input autoFocus value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué deja (ej. SSD 180 GB SATA 2.5&quot;)" style={CAMPO} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: "6px" }}>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={CAMPO} aria-label="Categoría">
          <option value="">Categoría</option>
          {SHIPPING_V2_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={condicion} onChange={(e) => setCondicion(e.target.value)} style={CAMPO} aria-label="Condición">
          {SHIPPING_V2_CONDICIONES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="$ valor" style={{ ...CAMPO, textAlign: "right" }} aria-label="Valor acordado" />
      </div>
      {error && <p style={{ margin: 0, fontSize: "12px", color: "#FF8A80" }}>{error}</p>}
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button type="button" onClick={() => { setAbierto(false); setError(null); }} style={{ background: "none", border: "none", fontSize: "12px", color: "#A7A7A7", cursor: "pointer" }}>
          Cancelar
        </button>
        <button type="button" disabled={!listo} onClick={recibir}
          style={{ borderRadius: "0.4rem", padding: "6px 12px", fontSize: "12px", fontWeight: 700, border: "none", cursor: listo ? "pointer" : "not-allowed", color: "#10110E", background: listo ? "#D7FF4F" : "#4A4A46" }}>
          {enviando ? "Registrando…" : `Recibir ${monto > 0 ? dinero(monto) : ""}`.trim()}
        </button>
      </div>
    </div>
  );
}
