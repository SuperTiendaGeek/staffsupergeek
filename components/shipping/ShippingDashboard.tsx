import Link from "next/link";
import type { ShippingDashboardPendingWork, ShippingDashboardSummary, ShippingItem, ShippingPacking, ShippingPago, ShippingProveedor } from "@/types/shipping";
import { BooleanPill, formatCurrencyUSD, formatDate, ShippingTable } from "@/components/shipping/ShippingTable";

type ShippingDashboardProps = {
  summary: ShippingDashboardSummary;
  pendingWork: ShippingDashboardPendingWork;
  items: ShippingItem[];
  pagos: ShippingPago[];
  packings: ShippingPacking[];
  proveedores: ShippingProveedor[];
};

const navItems = [
  { href: "/shipping/items", label: "Items" },
  { href: "/shipping/pagos", label: "Pagos" },
  { href: "/shipping/packings", label: "Packings" },
  { href: "/shipping/proveedores", label: "Proveedores" },
];

export function ShippingNav() {
  return (
    <nav className="flex w-full flex-wrap gap-2">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#181818] p-4 shadow-2xl shadow-black/20">
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-zinc-500">{label}</p>
    </div>
  );
}

function EmptyPending() {
  return <p className="px-4 py-5 text-sm text-zinc-500">Sin pendientes en este bloque.</p>;
}

function PendingBlock({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-[#181818] shadow-2xl shadow-black/20">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {empty ? <EmptyPending /> : <div className="divide-y divide-white/10">{children}</div>}
    </section>
  );
}

function PendingItemRow({ item, detail }: { item: ShippingItem; detail: string }) {
  return (
    <Link href="/shipping/items" className="grid gap-1 px-4 py-3 text-sm transition hover:bg-white/[0.035] sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-semibold text-zinc-100">{item.item}</p>
        <p className="truncate text-xs text-zinc-500">{item.codigo} · {item.proveedor || "Sin proveedor"}</p>
      </div>
      <p className="text-xs font-semibold text-geek-lime sm:text-right">{detail}</p>
    </Link>
  );
}

function PendingPackingRow({ packing, detail }: { packing: ShippingPacking; detail: string }) {
  return (
    <Link href="/shipping/packings" className="grid gap-1 px-4 py-3 text-sm transition hover:bg-white/[0.035] sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-semibold text-zinc-100">{packing.pack}</p>
        <p className="truncate text-xs text-zinc-500">{packing.estado || "Sin estado"} · {packing.items || "Sin items"}</p>
      </div>
      <p className="text-xs font-semibold text-geek-lime sm:text-right">{detail}</p>
    </Link>
  );
}

function FutureActions() {
  const upcomingActions = ["+ Nuevo Packing", "Generar Factura Packing"];

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Acciones</h2>
          <p className="text-sm text-zinc-500">Creación de items habilitada; el resto queda preparado para próximas fases.</p>
        </div>
        <span className="w-fit rounded-md border border-geek-lime/30 bg-geek-lime/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-normal text-geek-lime">
          Fase 2
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/shipping/items/nuevo"
          className="grid min-h-11 place-items-center rounded-md bg-geek-lime px-3 py-2 text-center text-sm font-semibold text-geek-black shadow-glow transition hover:bg-white"
        >
          + Nuevo Item
        </Link>
        <Link
          href="/shipping/pagos/sincronizar"
          className="grid min-h-11 place-items-center rounded-md border border-geek-lime/40 px-3 py-2 text-center text-sm font-semibold text-geek-lime transition hover:bg-geek-lime hover:text-geek-black"
        >
          Preparar Pagos
        </Link>
        {upcomingActions.map((action) => (
          <button
            key={action}
            type="button"
            disabled
            className="min-h-11 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-zinc-500 opacity-75"
          >
            {action}
          </button>
        ))}
      </div>
    </section>
  );
}

export function ShippingDashboard({ summary, pendingWork, items, pagos, packings, proveedores }: ShippingDashboardProps) {
  return (
    <div className="w-full space-y-5">
      <ShippingNav />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Items totales recientes" value={summary.itemsRecientes} />
        <Metric label="Items pendientes de pago" value={summary.itemsPendientesPago} />
        <Metric label="Pagos pendientes" value={summary.pagosPendientes} />
        <Metric label="Pagos realizados" value={summary.pagosRealizados} />
        <Metric label="Items pagados sin packing" value={summary.itemsPagadosSinPacking} />
        <Metric label="Packings en preparación" value={summary.packingsPreparacion} />
        <Metric label="Packings enviados" value={summary.packingsEnviados} />
        <Metric label="Packings recibidos" value={summary.packingsRecibidos} />
        <Metric label="Items marcados como regalo" value={summary.itemsRegalo} />
        <Metric label="Items marcados como encargo" value={summary.itemsEncargo} />
      </section>
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Trabajo pendiente</h2>
          <p className="mt-1 text-sm text-zinc-500">Colas operativas compactas, máximo 5 registros por bloque.</p>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <PendingBlock title="Items pendientes de pago" empty={!pendingWork.itemsPendientesPago.length}>
            {pendingWork.itemsPendientesPago.map((item) => (
              <PendingItemRow key={item.id} item={item} detail={item.estadoPago || "Sin estado de pago"} />
            ))}
          </PendingBlock>
          <PendingBlock title="Items pagados sin packing" empty={!pendingWork.itemsPagadosSinPacking.length}>
            {pendingWork.itemsPagadosSinPacking.map((item) => (
              <PendingItemRow key={item.id} item={item} detail={formatCurrencyUSD(item.costoProveedor)} />
            ))}
          </PendingBlock>
          <PendingBlock title="Packings sin tracking USA" empty={!pendingWork.packingsSinTrackingUsa.length}>
            {pendingWork.packingsSinTrackingUsa.map((packing) => (
              <PendingPackingRow key={packing.id} packing={packing} detail={formatDate(packing.fechaEnvio)} />
            ))}
          </PendingBlock>
          <PendingBlock title="Packings enviados sin recepción" empty={!pendingWork.packingsEnviadosSinRecepcion.length}>
            {pendingWork.packingsEnviadosSinRecepcion.map((packing) => (
              <PendingPackingRow key={packing.id} packing={packing} detail={packing.ecTracking || "Sin recepción"} />
            ))}
          </PendingBlock>
          <PendingBlock title="Encargos pendientes de agrupar" empty={!pendingWork.encargosPendientesAgrupar.length}>
            {pendingWork.encargosPendientesAgrupar.map((item) => (
              <PendingItemRow key={item.id} item={item} detail={item.itemPara || "Sin destinatario"} />
            ))}
          </PendingBlock>
        </div>
      </section>
      <FutureActions />
      <div className="grid gap-5 xl:grid-cols-2">
        <ShippingTable
          title="Items recientes"
          rows={items}
          getRowKey={(item) => item.id}
          columns={[
            { key: "codigo", header: "Código", render: (item) => item.codigo },
            { key: "item", header: "Item", render: (item) => item.item },
            { key: "costo", header: "Costo", align: "right", render: (item) => formatCurrencyUSD(item.costoProveedor) },
            { key: "regalo", header: "Regalo", align: "center", render: (item) => <BooleanPill value={item.regalo} /> },
          ]}
        />
        <ShippingTable
          title="Pagos recientes"
          rows={pagos}
          getRowKey={(pago) => pago.id}
          columns={[
            { key: "id", header: "Pago ID", render: (pago) => pago.pagoId },
            { key: "proveedor", header: "Proveedor", render: (pago) => pago.proveedor || "-" },
            { key: "total", header: "Total", align: "right", render: (pago) => formatCurrencyUSD(pago.totalPago) },
            { key: "estado", header: "Estado", render: (pago) => pago.estadoPago || "-" },
          ]}
        />
        <ShippingTable
          title="Packings recientes"
          rows={packings}
          getRowKey={(packing) => packing.id}
          columns={[
            { key: "pack", header: "Pack", render: (packing) => packing.pack },
            { key: "tipo", header: "Tipo", render: (packing) => packing.tipo || "-" },
            { key: "estado", header: "Estado", render: (packing) => packing.estado || "-" },
            { key: "peso", header: "Peso", align: "right", render: (packing) => packing.peso === null ? "-" : `${packing.peso} kg` },
          ]}
        />
        <ShippingTable
          title="Proveedores"
          rows={proveedores}
          getRowKey={(proveedor) => proveedor.id}
          columns={[
            { key: "nombre", header: "Nombre", render: (proveedor) => proveedor.nombre },
            { key: "direccion", header: "Dirección", render: (proveedor) => proveedor.direccion || "-" },
            { key: "compras", header: "Compras", align: "right", render: (proveedor) => formatCurrencyUSD(proveedor.comprasTotales) },
            { key: "items", header: "Items", align: "right", render: (proveedor) => proveedor.itemsRelacionados },
          ]}
        />
      </div>
    </div>
  );
}
