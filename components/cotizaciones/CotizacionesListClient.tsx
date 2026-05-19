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
import { DataGridLinkCell, dataGridBadgeClass, dataGridCellClass, formatDataGridCode } from "@/components/DataGrid";

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
            <table className="w-full min-w-[1440px] table-fixed divide-y divide-white/10 text-sm">
              <colgroup>
                <col className="w-[105px]" />
                <col className="w-[190px]" />
                <col className="w-[280px]" />
                <col className="w-[120px]" />
                <col className="w-[170px]" />
                <col className="w-[130px]" />
                <col className="w-[130px]" />
                <col className="w-[130px]" />
                <col className="w-[145px]" />
                <col className="w-[110px]" />
              </colgroup>
              <thead className="bg-white/[0.035] text-left text-xs uppercase tracking-normal text-zinc-400">
                <tr>
                  <th className={`${dataGridCellClass} text-left`}>Código</th>
                  <th className={`${dataGridCellClass} text-left`}>Cliente</th>
                  <th className={`${dataGridCellClass} text-left`}>Producto Solicitado</th>
                  <th className={`${dataGridCellClass} text-left`}>Categoría</th>
                  <th className={`${dataGridCellClass} text-left`}>Estado</th>
                  <th className={`${dataGridCellClass} text-right`}>Total Cotizado</th>
                  <th className={`${dataGridCellClass} text-right`}>Total Abonado</th>
                  <th className={`${dataGridCellClass} text-right`}>Saldo Pendiente</th>
                  <th className={`${dataGridCellClass} text-left`}>Fecha Creación</th>
                  <th className={`${dataGridCellClass} text-right`}>Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map((item) => {
                  const href = `/cotizaciones/${item.id}`;
                  const totalCotizado = money(item.totalCotizado);
                  const totalAbonado = money(item.totalAbonado);
                  const saldoPendiente = money(item.saldoPendiente);
                  const fechaCreacion = formatStableDate(item.fechaCreacion);
                  const codigoCorto = formatDataGridCode(item.codigo);

                  return (
                    <tr key={item.id} className="group h-[52px] transition hover:bg-white/[0.035]">
                      <td className="font-semibold text-geek-lime">
                        <DataGridLinkCell href={href} title={item.codigo} className="text-geek-lime">
                          {codigoCorto}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={item.clienteNombre} className="text-white">
                          {item.clienteNombre || "-"}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={item.productoSolicitado} className="text-zinc-200">
                          {item.productoSolicitado || "-"}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={item.categoria} className="text-zinc-300">
                          {item.categoria || "-"}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={item.estado} className="text-geek-lime">
                          <span className={`${dataGridBadgeClass} border-geek-lime/25 bg-geek-lime/10 text-geek-lime`}>
                            <span className="min-w-0 truncate">{item.estado || "-"}</span>
                          </span>
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={totalCotizado} className="text-right text-zinc-200">
                          {totalCotizado}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={totalAbonado} className="text-right text-zinc-200">
                          {totalAbonado}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={saldoPendiente} className="text-right font-semibold text-white">
                          {saldoPendiente}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={fechaCreacion} className="text-zinc-300">
                          {fechaCreacion}
                        </DataGridLinkCell>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.itemPedidoId ? (
                          <Link
                            href={`/pedidos/${item.itemPedidoId}`}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex whitespace-nowrap rounded-lg border border-geek-lime/40 px-3 py-2 text-xs font-bold text-geek-lime transition hover:bg-geek-lime/10"
                          >
                            Ver pedido
                          </Link>
                        ) : (
                          <span className="text-xs text-zinc-500">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-zinc-400">
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
