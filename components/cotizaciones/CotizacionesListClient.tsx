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
    <div className="space-y-3">
      <section className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {ESTADOS_COTIZACION.map((item) => {
          const active = estado === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setEstado(active ? "Todos" : item)}
              className={`rounded-lg border px-3 py-2 text-left transition ${
                active
                  ? "border-[#D7FF4F] bg-[#D7FF4F]/12 shadow-glow"
                  : "border-[#3A3A36] bg-[#252622] hover:border-[#D7FF4F]/40 hover:bg-[#2D2E2A]"
              }`}
            >
              <p className="text-lg font-bold text-white">{initialSummary[item] ?? 0}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{item}</p>
            </button>
          );
        })}
      </section>

      <section className="rounded-xl border border-[#3A3A36] bg-[#252622] p-3 shadow-xl shadow-black/20">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex h-9 items-center rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 focus-within:border-[#D7FF4F]/70">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código, cliente o producto"
              className="h-full w-full bg-transparent text-sm text-[#F5F5F5] outline-none placeholder:text-[#A7A7A7]/50"
            />
          </div>
          <select
            value={estado}
            onChange={(event) => setEstado(event.target.value as EstadoCotizacion | "Todos")}
            className="h-9 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm font-semibold text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70"
          >
            <option value="Todos">Todos los estados</option>
            {ESTADOS_COTIZACION.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-[#3A3A36]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1440px] table-fixed divide-y divide-[#3A3A36] text-sm">
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
              <thead className="bg-[#30312D] text-left text-xs uppercase tracking-normal text-[#A7A7A7]">
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
              <tbody className="divide-y divide-[#3A3A36]">
                {filtered.map((item) => {
                  const href = `/cotizaciones/${item.id}`;
                  const totalCotizado = money(item.totalCotizado);
                  const totalAbonado = money(item.totalAbonado);
                  const saldoPendiente = money(item.saldoPendiente);
                  const fechaCreacion = formatStableDate(item.fechaCreacion);
                  const codigoCorto = formatDataGridCode(item.codigo);

                  return (
                    <tr key={item.id} className="group h-[52px] transition hover:bg-[#2D2E2A]">
                      <td className="font-semibold text-[#D7FF4F]">
                        <DataGridLinkCell href={href} title={item.codigo} className="text-[#D7FF4F]">
                          {codigoCorto}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={item.clienteNombre} className="text-white">
                          {item.clienteNombre || "-"}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={item.productoSolicitado} className="text-[#CFCFCB]">
                          {item.productoSolicitado || "-"}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={item.categoria} className="text-[#CFCFCB]">
                          {item.categoria || "-"}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={item.estado} className="text-[#D7FF4F]">
                          <span className={`${dataGridBadgeClass} border-[#D7FF4F]/25 bg-[#D7FF4F]/10 text-[#D7FF4F]`}>
                            <span className="min-w-0 truncate">{item.estado || "-"}</span>
                          </span>
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={totalCotizado} className="text-right text-[#CFCFCB]">
                          {totalCotizado}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={totalAbonado} className="text-right text-[#CFCFCB]">
                          {totalAbonado}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={saldoPendiente} className="text-right font-semibold text-white">
                          {saldoPendiente}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={fechaCreacion} className="text-[#CFCFCB]">
                          {fechaCreacion}
                        </DataGridLinkCell>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.itemPedidoId ? (
                          <Link
                            href={`/pedidos/${item.itemPedidoId}`}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex whitespace-nowrap rounded-lg border border-[#D7FF4F]/40 px-3 py-2 text-xs font-bold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/10"
                          >
                            Ver pedido
                          </Link>
                        ) : (
                          <span className="text-xs text-[#A7A7A7]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-[#A7A7A7]">
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
