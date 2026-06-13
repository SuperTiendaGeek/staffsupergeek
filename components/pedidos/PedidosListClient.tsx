"use client";

import { useMemo, useState } from "react";
import type { PedidoItem } from "@/types/pedidos";
import { DataGridLinkCell, dataGridBadgeClass, dataGridCellClass, formatDataGridCode } from "@/components/DataGrid";

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
      [item.codigo, item.codigoPedido, item.identificador, item.clienteNombreSnapshot, item.item, item.usaTracking, item.ecTracking]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [initialItems, search]);

  return (
    <div className="space-y-3">
      <section className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Total pedidos" value={summary.total} />
        <Metric label="En tránsito" value={summary.transito} />
        <Metric label="Recibidos" value={summary.recibidos} />
        <Metric label="Requieren instalación" value={summary.instalacion} />
        <Metric label="Pendientes de crear orden técnica" value={summary.pendientesOrden} />
      </section>

      <section className="rounded-xl border border-[#3A3A36] bg-[#252622] p-3 shadow-xl shadow-black/20">
        <div className="flex h-9 items-center rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 focus-within:border-[#D7FF4F]/70">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por cliente, item, código o tracking"
            className="h-full w-full bg-transparent text-sm text-[#F5F5F5] outline-none placeholder:text-[#A7A7A7]/50"
          />
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-[#3A3A36]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1580px] table-fixed divide-y divide-[#3A3A36] text-sm">
              <colgroup>
                <col className="w-[105px]" />
                <col className="w-[200px]" />
                <col className="w-[320px]" />
                <col className="w-[120px]" />
                <col className="w-[130px]" />
                <col className="w-[170px]" />
                <col className="w-[200px]" />
                <col className="w-[170px]" />
                <col className="w-[170px]" />
              </colgroup>
              <thead className="bg-[#30312D] text-left text-xs uppercase tracking-normal text-[#A7A7A7]">
                <tr>
                  <th className={`${dataGridCellClass} text-left`}>Código</th>
                  <th className={`${dataGridCellClass} text-left`}>Cliente</th>
                  <th className={`${dataGridCellClass} text-left`}>Item</th>
                  <th className={`${dataGridCellClass} text-left`}>Categoría</th>
                  <th className={`${dataGridCellClass} text-right`}>Precio Venta</th>
                  <th className={`${dataGridCellClass} text-left`}>Estado Pedido</th>
                  <th className={`${dataGridCellClass} text-left`}>Estado Instalación</th>
                  <th className={`${dataGridCellClass} text-left`}>USA Tracking</th>
                  <th className={`${dataGridCellClass} text-left`}>EC Tracking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3A3A36]">
                {filtered.map((item) => {
                  const href = `/pedidos/${item.id}`;
                  const precioVenta = money(item.precioVenta);
                  const estadoPedido = item.estadosPedido || "-";
                  const estadoInstalacion = item.estadoInstalacion || "-";
                  const usaTracking = item.usaTracking || "-";
                  const ecTracking = item.ecTracking || "-";
                  const codigoCorto = formatDataGridCode(item.codigo);

                  return (
                    <tr key={item.id} className="h-[52px] transition hover:bg-[#2D2E2A]">
                      <td className="font-semibold text-[#D7FF4F]">
                        <DataGridLinkCell href={href} title={item.codigo} className="text-[#D7FF4F]">
                          {codigoCorto}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={item.clienteNombreSnapshot} className="text-white">
                          {item.clienteNombreSnapshot || "-"}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={item.item} className="text-[#CFCFCB]">
                          {item.item || "-"}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={item.categoria} className="text-[#CFCFCB]">
                          {item.categoria || "-"}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={precioVenta} className="text-right text-[#CFCFCB]">
                          {precioVenta}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={estadoPedido} className="text-[#D7FF4F]">
                          <span className={`${dataGridBadgeClass} border-[#D7FF4F]/25 bg-[#D7FF4F]/10 text-[#D7FF4F]`}>
                            <span className="min-w-0 truncate">{estadoPedido}</span>
                          </span>
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={estadoInstalacion} className="text-[#CFCFCB]">
                          {estadoInstalacion}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={usaTracking} className="text-[#CFCFCB]">
                          {usaTracking}
                        </DataGridLinkCell>
                      </td>
                      <td>
                        <DataGridLinkCell href={href} title={ecTracking} className="text-[#CFCFCB]">
                          {ecTracking}
                        </DataGridLinkCell>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-[#A7A7A7]">
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
    <div className="rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</p>
    </div>
  );
}
