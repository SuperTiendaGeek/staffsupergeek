"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PedidoItem } from "@/types/pedidos";

type Props = {
  initialItems: PedidoItem[];
};

function money(value: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function PedidosListClient({ initialItems }: Props) {
  const [search, setSearch] = useState("");
  const summary = useMemo(() => {
    return {
      total: initialItems.length,
      transito: initialItems.filter((item) => !item.recibido).length,
      recibidos: initialItems.filter((item) => item.recibido || item.recibidoEnLv).length,
      instalacion: initialItems.filter((item) => item.requiereInstalacion).length,
      pendientesOrden: initialItems.filter((item) => item.estadoInstalacion === "Pendiente de crear orden").length,
    };
  }, [initialItems]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return initialItems;
    return initialItems.filter((item) =>
      [item.codigo, item.clienteNombreSnapshot, item.item, item.usaTracking, item.ecTracking]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [initialItems, search]);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Total pedidos" value={summary.total} />
        <Metric label="En tránsito" value={summary.transito} />
        <Metric label="Recibidos" value={summary.recibidos} />
        <Metric label="Requieren instalación" value={summary.instalacion} />
        <Metric label="Pendientes de crear orden técnica" value={summary.pendientesOrden} />
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#181818] p-4 shadow-2xl shadow-black/25 sm:p-5">
        <div className="flex h-12 items-center rounded-xl border border-zinc-800 bg-[#111] px-4 focus-within:border-geek-lime">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por cliente, item, código o tracking"
            className="h-full w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/[0.035] text-left text-xs uppercase tracking-normal text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Precio Venta</th>
                  <th className="px-4 py-3">Estado Pedido</th>
                  <th className="px-4 py-3">Estado Instalación</th>
                  <th className="px-4 py-3">USA Tracking</th>
                  <th className="px-4 py-3">EC Tracking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map((item) => (
                  <tr key={item.id} className="transition hover:bg-white/[0.035]">
                    <td className="px-4 py-3 font-semibold text-geek-lime">
                      <Link href={`/pedidos/${item.id}`}>{item.codigo}</Link>
                    </td>
                    <td className="p-0" colSpan={8}>
                      <Link href={`/pedidos/${item.id}`} className="grid grid-cols-[minmax(150px,1.1fr)_minmax(180px,1.4fr)_110px_120px_150px_160px_140px_140px] items-center">
                        <span className="px-4 py-3 text-white">{item.clienteNombreSnapshot}</span>
                        <span className="px-4 py-3 text-zinc-200">{item.item}</span>
                        <span className="px-4 py-3 text-zinc-300">{item.categoria || "-"}</span>
                        <span className="px-4 py-3 text-right text-zinc-200">{money(item.precioVenta)}</span>
                        <span className="px-4 py-3 text-zinc-300">{item.estadosPedido || "-"}</span>
                        <span className="px-4 py-3 text-zinc-300">{item.estadoInstalacion || "-"}</span>
                        <span className="px-4 py-3 text-zinc-300">{item.usaTracking || "-"}</span>
                        <span className="px-4 py-3 text-zinc-300">{item.ecTracking || "-"}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-zinc-400">
                      No hay pedidos para la búsqueda actual.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-zinc-400">{label}</p>
    </div>
  );
}
