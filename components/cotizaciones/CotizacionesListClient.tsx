"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ESTADOS_COTIZACION,
  type CotizacionListado,
  type CotizacionResumenEstado,
  type EstadoCotizacion,
} from "@/types/cotizaciones";
import { formatStableDate } from "@/components/cotizaciones/utils/formatDate";

type Props = {
  initialItems: CotizacionListado[];
  initialSummary: CotizacionResumenEstado;
};

function money(value: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function CotizacionesListClient({ initialItems, initialSummary }: Props) {
  const [items] = useState(initialItems);
  const [estado, setEstado] = useState<EstadoCotizacion | "Todos">("Todos");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesEstado = estado === "Todos" || item.estado === estado;
      const matchesSearch =
        !query ||
        [item.codigo, item.clienteNombre, item.productoSolicitado, item.categoria]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      return matchesEstado && matchesSearch;
    });
  }, [estado, items, search]);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {ESTADOS_COTIZACION.map((item) => {
          const active = estado === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setEstado(active ? "Todos" : item)}
              className={`rounded-xl border p-4 text-left transition ${
                active
                  ? "border-geek-lime bg-geek-lime/12 shadow-glow"
                  : "border-white/10 bg-white/[0.045] hover:border-geek-lime/40 hover:bg-white/[0.07]"
              }`}
            >
              <p className="text-2xl font-bold text-white">{initialSummary[item] ?? 0}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-zinc-300">{item}</p>
            </button>
          );
        })}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#181818] p-4 shadow-2xl shadow-black/25 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex h-12 items-center rounded-xl border border-zinc-800 bg-[#111] px-4 focus-within:border-geek-lime">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código, cliente o producto"
              className="h-full w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
            />
          </div>
          <select
            value={estado}
            onChange={(event) => setEstado(event.target.value as EstadoCotizacion | "Todos")}
            className="h-12 rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm font-semibold text-white outline-none focus:border-geek-lime"
          >
            <option value="Todos">Todos los estados</option>
            {ESTADOS_COTIZACION.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/[0.035] text-left text-xs uppercase tracking-normal text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Producto Solicitado</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Total Cotizado</th>
                  <th className="px-4 py-3 text-right">Total Abonado</th>
                  <th className="px-4 py-3 text-right">Saldo Pendiente</th>
                  <th className="px-4 py-3">Fecha Creación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map((item) => (
                  <tr key={item.id} className="transition hover:bg-white/[0.035]">
                    <td className="px-4 py-3 font-semibold text-geek-lime">
                      <Link href={`/cotizaciones/${item.id}`}>{item.codigo}</Link>
                    </td>
                    <td className="px-4 py-3 text-white">{item.clienteNombre}</td>
                    <td className="px-4 py-3 text-zinc-200">{item.productoSolicitado}</td>
                    <td className="px-4 py-3 text-zinc-300">{item.categoria}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-geek-lime/25 bg-geek-lime/10 px-2.5 py-1 text-xs font-semibold text-geek-lime">
                        {item.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-200">{money(item.totalCotizado)}</td>
                    <td className="px-4 py-3 text-right text-zinc-200">{money(item.totalAbonado)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white">{money(item.saldoPendiente)}</td>
                    <td className="px-4 py-3 text-zinc-300">{formatStableDate(item.fechaCreacion)}</td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-zinc-400">
                      No hay cotizaciones para los filtros seleccionados.
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
