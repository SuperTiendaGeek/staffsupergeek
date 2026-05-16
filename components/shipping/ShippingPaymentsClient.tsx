"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BooleanPill, formatCurrencyUSD, formatDate } from "@/components/shipping/ShippingTable";
import { SHIPPING_PAYMENT_METHODS, SHIPPING_PAYMENT_SOURCE_ACCOUNTS, type ShippingPago } from "@/types/shipping";

type Props = {
  pagos: ShippingPago[];
};

type ApiResponse = {
  success?: boolean;
  error?: string;
  warning?: string | null;
};

async function parseApi(response: Response): Promise<ApiResponse | null> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return null;
  }
}

function isPagoPagado(pago: ShippingPago) {
  const estado = pago.estadoPago.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  return pago.pagoRealizado || estado === "PAGADO";
}

export function ShippingPaymentsClient({ pagos }: Props) {
  const router = useRouter();
  const [selectedPago, setSelectedPago] = useState<ShippingPago | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function closeModal() {
    if (saving) return;
    setSelectedPago(null);
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPago) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/shipping/pagos/${selectedPago.id}/registrar`, {
        method: "POST",
        credentials: "same-origin",
        body: new FormData(event.currentTarget),
      });
      const payload = await parseApi(response);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo registrar el pago.");
      }

      setMessage(payload.warning || "Pago registrado correctamente.");
      setSelectedPago(null);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {message ? <p className="rounded-lg border border-geek-lime/30 bg-geek-lime/10 px-4 py-3 text-sm text-geek-lime">{message}</p> : null}
      <section className="w-full overflow-hidden rounded-xl border border-white/10 bg-[#181818] shadow-2xl shadow-black/20">
        <div className="border-b border-white/10 px-4 py-4 sm:px-5">
          <h2 className="text-lg font-semibold text-white">Pagos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/[0.035] text-left text-xs uppercase tracking-normal text-zinc-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Pago ID</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Total Pago</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Transacción ID</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Proveedor</th>
                <th className="whitespace-nowrap px-4 py-3 text-center font-semibold">Pago Realizado</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Estado de Pago</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Recargos</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-zinc-300">
              {pagos.length ? (
                pagos.map((pago) => {
                  const pagado = isPagoPagado(pago);
                  return (
                    <tr key={pago.id} className="transition hover:bg-white/[0.035]">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-100">{pago.pagoId}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrencyUSD(pago.totalPago)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{pago.transaccionId || "-"}</td>
                      <td className="max-w-[260px] whitespace-nowrap px-4 py-3">
                        <span className="block truncate">{pago.proveedor || "-"}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center"><BooleanPill value={pagado} /></td>
                      <td className="whitespace-nowrap px-4 py-3">{pago.estadoPago || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrencyUSD(pago.recargosPagoExterior)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {!pagado ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPago(pago);
                              setError("");
                              setMessage("");
                            }}
                            className="rounded-md bg-geek-lime px-3 py-2 text-xs font-semibold text-geek-black transition hover:bg-white"
                          >
                            Registrar pago
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-500">{formatDate(pago.fechaPagoReal)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                    No hay datos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedPago ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-8">
          <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-lg border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Registrar pago</h2>
                <p className="mt-1 text-sm text-zinc-500">{selectedPago.pagoId} · {selectedPago.proveedor || "Sin proveedor"}</p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white">
                Cerrar
              </button>
            </div>

            {error ? <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">Fecha de Pago Real *</span>
                <input name="fechaPagoReal" type="date" required defaultValue={today} className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime" />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">Método de Pago *</span>
                <select name="metodoPago" required defaultValue="" className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime">
                  <option value="" disabled>Seleccionar</option>
                  {SHIPPING_PAYMENT_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">Cuenta Origen *</span>
                <select name="cuentaOrigen" required defaultValue="" className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime">
                  <option value="" disabled>Seleccionar</option>
                  {SHIPPING_PAYMENT_SOURCE_ACCOUNTS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">Transacción ID</span>
                <input name="transaccionId" defaultValue={selectedPago.transaccionId} className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime" />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">Comprobante</span>
                <input name="comprobante" type="file" className="mt-2 w-full rounded-md border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-zinc-300 outline-none transition file:mr-4 file:rounded-md file:border-0 file:bg-geek-lime file:px-3 file:py-2 file:text-sm file:font-semibold file:text-geek-black focus:border-geek-lime" />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">Observación</span>
                <textarea name="observacion" rows={3} className="mt-2 w-full rounded-md border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-white outline-none transition focus:border-geek-lime" />
              </label>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeModal} disabled={saving} className="rounded-md border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white disabled:opacity-60">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white disabled:opacity-60">
                {saving ? "Guardando..." : "Guardar pago"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
