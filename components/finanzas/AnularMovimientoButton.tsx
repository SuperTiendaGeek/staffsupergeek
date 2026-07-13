"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  movimientoId: string;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
  data?: { warning?: string | null };
};

export function AnularMovimientoButton({ movimientoId }: Props) {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/finanzas/movimientos/${movimientoId}/anular`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo anular el movimiento");
        return;
      }

      setIsOpen(false);
      setMotivo("");
      if (payload.data?.warning) {
        window.alert(payload.data.warning);
      }
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  const modal = isOpen ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-5">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-[#F5F5F5]">Anular movimiento</h3>
            <p className="mt-0.5 text-sm text-[#A7A7A7]">
              El movimiento no se elimina; queda marcado como Anulado y deja de contar para el saldo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="shrink-0 rounded-full border border-[#3A3A36] px-3 py-1 text-sm text-[#CFCFCB] transition hover:text-[#F5F5F5]"
          >
            Cerrar
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-[#CFCFCB]">Motivo de anulación</span>
          <textarea
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2.5 text-sm text-[#F5F5F5] outline-none transition placeholder:text-[#8F908A] focus:border-[#D7FF4F]/60"
            required
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#CFCFCB] transition hover:text-[#F5F5F5]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !motivo.trim()}
            className="rounded-full border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Anulando..." : "Confirmar anulación"}
          </button>
        </div>
      </form>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-full border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/20"
      >
        Anular movimiento
      </button>

      {isMounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
