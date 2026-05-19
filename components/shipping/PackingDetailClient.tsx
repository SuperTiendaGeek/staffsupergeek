"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrencyUSD, formatDate } from "@/components/shipping/ShippingTable";
import type { ShippingPackingDetail } from "@/types/shipping";

type Props = {
  initialDetail: ShippingPackingDetail;
  isAdmin: boolean;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
  warning?: string | null;
  data?: ShippingPackingDetail;
};

async function parseApi(response: Response): Promise<ApiResponse | null> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return null;
  }
}

function normalizeStatus(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">{children}</span>;
}

export function PackingDetailClient({ initialDetail, isAdmin }: Props) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const packing = detail.packing;
  const status = normalizeStatus(packing.estado);
  const canEditItems = status === "en proceso";
  const showAdminCorrectionNotice = isAdmin && (status === "cerrado" || status === "en transito");
  const isClosed = status === "cerrado";
  const isTransit = status === "en transito";
  const canEditLogistics = isClosed || isTransit;
  const selectedItems = useMemo(() => detail.availableItems.filter((item) => selectedIds.includes(item.id)), [detail.availableItems, selectedIds]);

  useEffect(() => {
    setDetail(initialDetail);
  }, [initialDetail]);

  function toggleItem(itemId: string) {
    setSelectedIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
  }

  async function submitForm(formData: FormData) {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/shipping/packings/${packing.id}`, {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      const payload = await parseApi(response);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo actualizar el packing.");
      }

      setMessage(payload.warning || "Packing actualizado correctamente.");
      if (payload.data) {
        setDetail(payload.data);
      }
      setSelectedIds([]);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddItems(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedIds.length === 0) {
      setError("Selecciona al menos un item.");
      return;
    }
    const formData = new FormData();
    formData.set("action", "add-items");
    for (const itemId of selectedIds) formData.append("itemIds", itemId);
    await submitForm(formData);
  }

  async function handleSimpleAction(action: string, extra?: Record<string, string>) {
    const formData = new FormData();
    formData.set("action", action);
    for (const [key, value] of Object.entries(extra ?? {})) formData.set(key, value);
    await submitForm(formData);
  }

  async function handleLogistics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("action", "update-logistics");
    await submitForm(formData);
  }

  return (
    <div className="w-full space-y-5">
      {message ? <p className="rounded-lg border border-geek-lime/30 bg-geek-lime/10 px-4 py-3 text-sm text-geek-lime">{message}</p> : null}
      {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}

      {detail.missingStatuses.length ? (
        <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          Estados aún no observados en Airtable: {detail.missingStatuses.join(", ")}. El sistema los escribirá con typecast cuando se usen.
        </p>
      ) : null}

      <section className="rounded-lg border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">{packing.pack}</h2>
            <p className="mt-1 text-sm text-zinc-500">{packing.tipo || "-"} · {packing.estado || "-"}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2"><p className="text-sm font-semibold text-white">{packing.itemCount}</p><p className="text-[11px] uppercase text-zinc-500">Items</p></div>
            <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2"><p className="text-sm font-semibold text-geek-lime">{formatCurrencyUSD(packing.costoTotalItems)}</p><p className="text-[11px] uppercase text-zinc-500">Costo</p></div>
            <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2"><p className="text-sm font-semibold text-white">{packing.qtyRegalos ?? 0}</p><p className="text-[11px] uppercase text-zinc-500">Regalos</p></div>
            <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2"><p className="text-sm font-semibold text-white">{packing.qtyEncargos ?? 0}</p><p className="text-[11px] uppercase text-zinc-500">Encargos</p></div>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Peso", packing.peso === null ? "-" : `${packing.peso} kg`],
            ["USA Tracking", packing.usaTracking || "-"],
            ["EC Tracking", packing.ecTracking || "-"],
            ["Fecha Envío", formatDate(packing.fechaEnvio)],
            ["Arribo Estimado", formatDate(packing.arriboEstimado)],
            ["Flete EC", formatCurrencyUSD(packing.fleteEc)],
            ["Arancel", formatCurrencyUSD(packing.arancel)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
              <dt className="text-xs uppercase text-zinc-500">{label}</dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-100">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {status === "en proceso" ? (
        <section className="rounded-lg border border-white/10 bg-[#181818] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Cerrar packing</h2>
              <p className="text-sm text-zinc-500">Debe tener al menos un item vinculado.</p>
            </div>
            <button
              type="button"
              disabled={saving || packing.itemCount === 0}
              onClick={() => void handleSimpleAction("close")}
              className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white disabled:opacity-60"
            >
              Cerrar packing
            </button>
          </div>
        </section>
      ) : null}

      {canEditLogistics ? (
        <form onSubmit={handleLogistics} className="rounded-lg border border-white/10 bg-[#181818] p-5">
          <h2 className="text-lg font-semibold text-white">Datos logísticos</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label><FieldLabel>Peso</FieldLabel><input name="peso" type="number" min="0" step="0.01" defaultValue={packing.peso ?? ""} className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime" /></label>
            <label><FieldLabel>USA Tracking</FieldLabel><input name="usaTracking" defaultValue={packing.usaTracking} className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime" /></label>
            <label><FieldLabel>EC Tracking</FieldLabel><input name="ecTracking" defaultValue={packing.ecTracking} className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime" /></label>
            <label><FieldLabel>Fecha Envío</FieldLabel><input name="fechaEnvio" type="date" defaultValue={packing.fechaEnvio} className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime" /></label>
            <label><FieldLabel>Arribo Estimado</FieldLabel><input name="arriboEstimado" type="date" defaultValue={packing.arriboEstimado} className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime" /></label>
            <label><FieldLabel>Flete EC</FieldLabel><input name="fleteEc" type="number" min="0" step="0.01" defaultValue={packing.fleteEc ?? ""} className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime" /></label>
            <label><FieldLabel>Arancel</FieldLabel><input name="arancel" type="number" min="0" step="0.01" defaultValue={packing.arancel ?? ""} className="mt-2 h-12 w-full rounded-md border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime" /></label>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            {isClosed ? <button type="button" disabled={saving} onClick={() => void handleSimpleAction("mark-transit")} className="rounded-md border border-geek-lime/40 px-4 py-2.5 text-sm font-semibold text-geek-lime transition hover:bg-geek-lime hover:text-geek-black disabled:opacity-60">Marcar En Tránsito</button> : null}
            <button type="submit" disabled={saving} className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white disabled:opacity-60">Guardar logística</button>
          </div>
        </form>
      ) : null}

      {!canEditItems ? (
        <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          Este packing está cerrado. Los ítems ya no se pueden modificar desde la vista normal.
        </p>
      ) : null}

      {canEditItems ? (
        <form onSubmit={handleAddItems} className="rounded-lg border border-white/10 bg-[#181818] p-5">
          <h2 className="text-lg font-semibold text-white">Agregar ítems al packing</h2>
          <AvailableItemsTable items={detail.availableItems} selectedIds={selectedIds} toggleItem={toggleItem} />
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={saving || selectedItems.length === 0} className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white disabled:opacity-60">Agregar seleccionados</button>
          </div>
        </form>
      ) : null}

      {showAdminCorrectionNotice ? (
        <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-5">
          <h2 className="text-lg font-semibold text-amber-100">Corrección administrativa de ítems</h2>
          <p className="mt-1 text-sm text-amber-100/80">
            Corrección administrativa pendiente de implementar. Esta acción requerirá confirmación especial.
          </p>
        </section>
      ) : null}

      <section className="rounded-lg border border-white/10 bg-[#181818] p-5">
        <h2 className="text-lg font-semibold text-white">Ítems vinculados</h2>
        <LinkedItemsTable items={detail.items} canRemove={canEditItems} saving={saving} onRemove={(itemId) => void handleSimpleAction("remove-item", { itemId })} />
      </section>
    </div>
  );
}

function AvailableItemsTable({ items, selectedIds, toggleItem }: { items: ShippingPackingDetail["availableItems"]; selectedIds: string[]; toggleItem: (id: string) => void }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm">
        <thead className="bg-white/[0.035] text-xs uppercase tracking-normal text-zinc-500">
          <tr>
            <th className="px-4 py-3">Sel.</th><th className="px-4 py-3">Código</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3 text-right">Costo</th><th className="px-4 py-3 text-right">Peso</th><th className="px-4 py-3 text-center">Regalo</th><th className="px-4 py-3 text-center">Encargo</th><th className="px-4 py-3">USA Tracking</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-zinc-300">
          {items.length ? items.map((item) => (
            <tr key={item.id} className="hover:bg-white/[0.035]">
              <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleItem(item.id)} className="h-4 w-4 accent-geek-lime" /></td>
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-100">{item.codigo}</td>
              <td className="max-w-[320px] whitespace-nowrap px-4 py-3"><span className="block truncate">{item.item}</span></td>
              <td className="whitespace-nowrap px-4 py-3">{item.proveedor || "-"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">{item.regalo ? "$0.00" : formatCurrencyUSD(item.costoProveedor)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">{item.peso === null ? "-" : `${item.peso} kg`}</td>
              <td className="whitespace-nowrap px-4 py-3 text-center">{item.regalo ? "Sí" : "-"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-center">{item.encargo ? "Sí" : "-"}</td>
              <td className="whitespace-nowrap px-4 py-3">{item.usaTracking || "-"}</td>
            </tr>
          )) : <tr><td colSpan={9} className="px-4 py-8 text-center text-zinc-500">No hay ítems disponibles.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function LinkedItemsTable({ items, canRemove, saving, onRemove }: { items: ShippingPackingDetail["items"]; canRemove: boolean; saving: boolean; onRemove: (id: string) => void }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm">
        <thead className="bg-white/[0.035] text-xs uppercase tracking-normal text-zinc-500">
          <tr>
            <th className="px-4 py-3">Código</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3 text-right">Costo</th><th className="px-4 py-3 text-right">Peso</th><th className="px-4 py-3 text-center">Regalo</th><th className="px-4 py-3 text-center">Encargo</th>{canRemove ? <th className="px-4 py-3 text-right">Acción</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-zinc-300">
          {items.length ? items.map((item) => (
            <tr key={item.id} className="hover:bg-white/[0.035]">
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-100">{item.codigo}</td>
              <td className="max-w-[360px] whitespace-nowrap px-4 py-3"><span className="block truncate">{item.item}</span></td>
              <td className="whitespace-nowrap px-4 py-3">{item.proveedor || "-"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">{item.regalo ? "$0.00" : formatCurrencyUSD(item.costoProveedor)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">{item.peso === null ? "-" : `${item.peso} kg`}</td>
              <td className="whitespace-nowrap px-4 py-3 text-center">{item.regalo ? "Sí" : "-"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-center">{item.encargo ? "Sí" : "-"}</td>
              {canRemove ? <td className="whitespace-nowrap px-4 py-3 text-right"><button type="button" disabled={saving} onClick={() => onRemove(item.id)} className="rounded-md border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-60">Quitar</button></td> : null}
            </tr>
          )) : <tr><td colSpan={canRemove ? 8 : 7} className="px-4 py-8 text-center text-zinc-500">Este packing todavía no tiene ítems.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
