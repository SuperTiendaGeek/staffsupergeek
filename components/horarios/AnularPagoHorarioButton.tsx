"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  periodoId: string;
  pagoId: string;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
};

export function AnularPagoHorarioButton({ periodoId, pagoId }: Props) {
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
      const response = await fetch(`/api/horarios/admin/periodos/${periodoId}/pagos/${pagoId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo })
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo anular el pago");
        return;
      }

      setIsOpen(false);
      setMotivo("");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  const modal = isOpen ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-5 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[#30312D] bg-geek-black px-3 py-2.5 shadow-2xl shadow-black">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-white">Anular pago</h3>
            <p className="mt-1 text-sm text-zinc-400">El pago no se eliminará; quedará marcado como anulado.</p>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} className="rounded-md border border-[#30312D] px-3 py-1.5 text-sm text-zinc-300 hover:text-white">
            Cerrar
          </button>
        </div>

        <label className="mt-3 block">
          <span className="text-sm font-medium text-zinc-300">Motivo de anulación</span>
          <textarea
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
            required
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => setIsOpen(false)} className="rounded-md border border-[#30312D] px-3 py-2 text-sm font-medium text-zinc-200 hover:text-white">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting} className="rounded-md bg-red-300 px-3 py-2 text-sm font-semibold text-geek-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
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
        className="font-semibold text-red-200 transition hover:text-white"
      >
        Anular
      </button>

      {isMounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
