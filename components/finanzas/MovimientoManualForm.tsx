"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { CategoriaMovimiento } from "@/types/finanzas";

type CuentaOpcion = { id: string; nombre: string };

type Props = {
  cuentas: CuentaOpcion[];
  onDone: () => void;
};

type ApiResponse = { success?: boolean; error?: string };

// Fase 20.3 §5 — catálogo existente de Categoría, sin las 3 reservadas a sus
// propios flujos (Anticipo Cliente, Depósito de Caja, Acreditación Pasarela).
const CATEGORIAS_DISPONIBLES: CategoriaMovimiento[] = [
  "Venta Mostrador",
  "Venta Producto",
  "Servicio Reparación",
  "Repuesto",
  "Producto Digital",
  "Compra Proveedor Shipping",
  "Compra Local Repuesto",
  "Compra Licencia",
  "Nómina",
  "Recuperación Garantía",
  "Distribución de Rubros",
  "Pago SRI",
  "Devolución",
  "Otro",
];

export function MovimientoManualForm({ cuentas, onDone }: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"Ingreso" | "Egreso">("Egreso");
  const [categoria, setCategoria] = useState<CategoriaMovimiento>("Otro");
  const [monto, setMonto] = useState("");
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "");
  const [metodo, setMetodo] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/finanzas/movimientos", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          categoria,
          monto: Number(monto),
          cuentaId,
          metodo: metodo || undefined,
          fecha,
          observacion,
        }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo crear el movimiento");
        return;
      }

      onDone();
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Tipo</span>
        <select
          value={tipo}
          onChange={(event) => setTipo(event.target.value as "Ingreso" | "Egreso")}
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        >
          <option value="Ingreso">Ingreso</option>
          <option value="Egreso">Egreso</option>
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Categoría</span>
        <select
          value={categoria}
          onChange={(event) => setCategoria(event.target.value as CategoriaMovimiento)}
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        >
          {CATEGORIAS_DISPONIBLES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">{tipo === "Ingreso" ? "Cuenta Destino" : "Cuenta Origen"}</span>
        <select
          value={cuentaId}
          onChange={(event) => setCuentaId(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        >
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Monto</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={monto}
          onChange={(event) => setMonto(event.target.value)}
          required
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Método (opcional)</span>
        <input
          type="text"
          value={metodo}
          onChange={(event) => setMetodo(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Fecha</span>
        <input
          type="date"
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
          required
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Observación (obligatoria)</span>
        <textarea
          value={observacion}
          onChange={(event) => setObservacion(event.target.value)}
          rows={3}
          required
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        />
      </label>

      {error ? <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting || !monto || !observacion.trim() || !cuentaId}
        className="w-full rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-4 py-2.5 text-sm font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Registrando..." : "Registrar movimiento"}
      </button>
    </form>
  );
}
