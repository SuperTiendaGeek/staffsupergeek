"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { CotizacionDetalle, OpcionCotizacion } from "@/types/cotizaciones";
import { CARRIERS_PEDIDO, type PedidoItem } from "@/types/pedidos";

type Props = {
  initialPedido: PedidoItem;
  cotizacionOrigen: CotizacionDetalle | null;
};

type ApiResponse = { success?: boolean; data?: unknown; error?: string };

function money(value: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

async function parseApi(response: Response): Promise<ApiResponse | null> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return null;
  }
}

function whatsappUrl(pedido: PedidoItem) {
  const phone = pedido.clienteTelefonoSnapshot.replace(/\D/g, "");
  const message = `Hola ${pedido.clienteNombreSnapshot}, te escribimos de SUPER GEEK sobre tu pedido ${pedido.codigo}: ${pedido.item}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function PedidoDetalleClient({ initialPedido, cotizacionOrigen }: Props) {
  const [pedido, setPedido] = useState(initialPedido);
  const [showCotizacion, setShowCotizacion] = useState(true);
  const [form, setForm] = useState({
    usaTracking: initialPedido.usaTracking,
    ecTracking: initialPedido.ecTracking,
    carrier: initialPedido.carrier,
    recibido: initialPedido.recibido,
    recibidoEnLv: initialPedido.recibidoEnLv,
    notaInterna: initialPedido.notaInterna,
    notaPublica: initialPedido.notaPublica,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tipoPedido = pedido.esProveedorLocal ? "Local" : pedido.esProveedorExterior ? "Exterior" : "Por definir";
  const mostrarRecepcionIntermediario = pedido.esProveedorExterior || pedido.estaEncargado;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/pedidos/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await parseApi(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo guardar el pedido.");
      }
      setPedido(payload.data as PedidoItem);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <section className="rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
          <p className="text-sm font-semibold uppercase tracking-normal text-geek-lime">{pedido.codigo}</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">{pedido.item}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Metric label="Precio Venta" value={money(pedido.precioVenta)} />
            <Metric label="Costo Proveedor" value={money(pedido.costoProveedor)} />
            <Metric label="Flete" value={money(pedido.fleteEcItemSolo)} />
            <Metric label="Arancel" value={money(pedido.arancelItemSolo)} />
            <Metric label="Ganancia" value={money(pedido.ganancia)} />
            <Metric label="Ganancia Neta" value={money(pedido.gananciaNeta)} />
            <Metric label="Estado Pedido" value={pedido.estadosPedido || "-"} />
            <Metric label="Estado Instalación" value={pedido.estadoInstalacion || "-"} />
          </div>
        </section>

        {cotizacionOrigen ? (
          <section className="rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
            <button
              type="button"
              onClick={() => setShowCotizacion((current) => !current)}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <div>
                <h2 className="text-lg font-semibold text-white">Cotización origen</h2>
                <p className="mt-1 text-sm text-zinc-400">{cotizacionOrigen.codigo}</p>
              </div>
              <span className="text-sm font-semibold text-geek-lime">{showCotizacion ? "Ocultar" : "Mostrar"}</span>
            </button>

            {showCotizacion ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric label="Código Cotización" value={cotizacionOrigen.codigo} />
                  <Metric label="Producto Solicitado" value={cotizacionOrigen.productoSolicitado} />
                  <Metric label="Estado Cotización" value={cotizacionOrigen.estado} />
                  <Metric label="Total Cotizado" value={money(cotizacionOrigen.totalCotizado)} />
                  <Metric label="Total Abonado" value={money(cotizacionOrigen.totalAbonado)} />
                  <Metric label="Saldo Pendiente" value={money(cotizacionOrigen.saldoPendiente)} />
                  <Metric label="Cliente Nombre" value={cotizacionOrigen.clienteNombre} />
                  <Metric label="Cliente Teléfono" value={cotizacionOrigen.clienteTelefono || "-"} />
                </div>

                <div className="rounded-xl border border-white/10 bg-[#111] p-4">
                  <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Descripción del Requerimiento</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{cotizacionOrigen.descripcionRequerimiento || "-"}</p>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-white">Opciones ofrecidas</h3>
                  <div className="mt-3 space-y-3">
                    {cotizacionOrigen.opciones.map((opcion) => (
                      <OpcionOrigenCard
                        key={opcion.id}
                        opcion={opcion}
                        selected={opcion.id === pedido.opcionCotizacionId || opcion.seleccionadaPorCliente}
                      />
                    ))}
                    {cotizacionOrigen.opciones.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-zinc-400">
                        No hay opciones registradas en la cotización.
                      </p>
                    ) : null}
                  </div>
                </div>

                <Link
                  href={`/cotizaciones/${cotizacionOrigen.id}`}
                  className="inline-flex rounded-xl border border-geek-lime/40 px-4 py-3 text-sm font-semibold text-geek-lime transition hover:bg-geek-lime/10"
                >
                  Abrir cotización completa
                </Link>
              </div>
            ) : null}
          </section>
        ) : null}

        <form onSubmit={save} className="rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Seguimiento del pedido</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {pedido.esProveedorExterior
                  ? "Trayecto internacional hasta intermediario y luego a SUPER GEEK."
                  : pedido.esProveedorLocal
                    ? "Pedido local con recepción final en SUPER GEEK."
                    : "Define el origen del proveedor para ver la ruta logística completa."}
              </p>
            </div>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${pedido.esProveedorExterior ? "bg-sky-400/15 text-sky-200" : pedido.esProveedorLocal ? "bg-geek-lime/15 text-geek-lime" : "bg-zinc-800 text-zinc-300"}`}>
              {tipoPedido}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <MiniMetric label="Proveedor" value={pedido.proveedor || "-"} />
            <MiniMetric label="Origen del proveedor" value={pedido.proveedorOrigen || "-"} />
            <MiniMetric label="Tipo de pedido" value={tipoPedido} />
            <MiniMetric label="Encargo con Roberto" value={pedido.estaEncargado ? "Sí" : "No"} />
          </div>

          {pedido.estaEncargado ? (
            <div className="mt-5 rounded-xl border border-geek-lime/30 bg-geek-lime/10 px-4 py-3">
              <p className="text-sm font-semibold text-geek-lime">Encargo con Roberto</p>
              <p className="mt-1 text-sm leading-6 text-zinc-200">
                Este pedido será recibido primero por Roberto o un intermediario antes de enviarse a SUPER GEEK.
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                Este pedido está marcado como encargo. Más adelante aparecerá en el módulo Shipping para que pueda ser incluido en una caja o paquete.
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {pedido.requiereUsaTracking ? (
              <Field
                label="USA Tracking"
                value={form.usaTracking}
                help="Proveedor, eBay o tienda online hasta casilla, Roberto o punto intermedio."
                onChange={(value) => setForm((current) => ({ ...current, usaTracking: value }))}
              />
            ) : null}
            <Field
              label="EC Tracking"
              value={form.ecTracking}
              help={pedido.esProveedorExterior ? "Miami o intermediario hasta la tienda SUPER GEEK." : "Entrega local hasta SUPER GEEK."}
              onChange={(value) => setForm((current) => ({ ...current, ecTracking: value }))}
            />
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">Carrier</span>
              <select
                value={form.carrier}
                onChange={(event) => setForm((current) => ({ ...current, carrier: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime"
              >
                <option value="">Sin carrier</option>
                {CARRIERS_PEDIDO.map((carrier) => (
                  <option key={carrier} value={carrier}>{carrier}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              {mostrarRecepcionIntermediario ? (
                <label className="rounded-xl border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-zinc-200">
                  <span className="flex items-center gap-3 font-semibold text-white">
                    <input type="checkbox" checked={form.recibidoEnLv} onChange={(event) => setForm((current) => ({ ...current, recibidoEnLv: event.target.checked }))} className="h-4 w-4 accent-geek-lime" />
                    Recibido por intermediario
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-zinc-500">
                    Marca esto cuando Roberto, casilla o punto intermedio haya recibido el artículo.
                  </span>
                </label>
              ) : null}
              <label className="rounded-xl border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-zinc-200">
                <span className="flex items-center gap-3 font-semibold text-white">
                  <input type="checkbox" checked={form.recibido} onChange={(event) => setForm((current) => ({ ...current, recibido: event.target.checked }))} className="h-4 w-4 accent-geek-lime" />
                  Recibido en SUPER GEEK
                </span>
                <span className="mt-2 block text-xs leading-5 text-zinc-500">
                  Marca esto cuando el producto ya esté físicamente en la tienda.
                </span>
              </label>
            </div>
            <TextArea label="Nota Interna" value={form.notaInterna} onChange={(value) => setForm((current) => ({ ...current, notaInterna: value }))} />
            <TextArea label="Nota Pública" value={form.notaPublica} onChange={(value) => setForm((current) => ({ ...current, notaPublica: value }))} />
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={saving} className="rounded-xl border border-geek-lime bg-geek-lime px-5 py-3 text-sm font-extrabold text-black transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60">
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
          <h2 className="text-lg font-semibold text-white">Instalación técnica</h2>
          {!pedido.requiereInstalacion ? (
            <p className="mt-3 text-sm text-zinc-300">Este pedido no requiere instalación.</p>
          ) : pedido.ordenReparacionId ? (
            <div className="mt-3 text-sm text-zinc-300">
              <p>Orden Reparación ID: {pedido.ordenReparacionId}</p>
              <p>Código: {pedido.ordenReparacionCodigo || "-"}</p>
            </div>
          ) : (
            <button type="button" disabled className="mt-4 rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-sm font-semibold text-zinc-500">
              Crear orden técnica <span className="ml-2 text-geek-lime/70">Próxima fase</span>
            </button>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">Cliente</h2>
          <p className="mt-4 text-lg font-semibold text-white">{pedido.clienteNombreSnapshot}</p>
          <p className="mt-1 text-sm text-zinc-300">{pedido.clienteTelefonoSnapshot || "Sin teléfono"}</p>
          <a href={whatsappUrl(pedido)} target="_blank" rel="noreferrer" className={`mt-5 inline-flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-bold transition ${pedido.clienteTelefonoSnapshot ? "border-geek-lime bg-geek-lime text-black hover:brightness-95" : "pointer-events-none border-zinc-800 bg-zinc-900 text-zinc-500"}`}>WhatsApp</a>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-sm">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">Origen</h2>
          <dl className="mt-4 space-y-3">
            <Row label="Cotización" value={pedido.cotizacionCodigo || pedido.cotizacionId} />
            <Row label="Opción" value={pedido.opcionCotizacionId} />
            <Row label="Orden técnica" value={pedido.ordenReparacionCodigo || pedido.ordenReparacionId || "-"} />
          </dl>
          {pedido.cotizacionId ? (
            <Link href={`/cotizaciones/${pedido.cotizacionId}`} className="mt-4 inline-flex w-full justify-center rounded-xl border border-geek-lime/40 px-4 py-3 text-sm font-semibold text-geek-lime transition hover:bg-geek-lime/10">
              Abrir cotización completa
            </Link>
          ) : null}
          {pedido.ordenReparacionId ? (
            <button type="button" disabled className="mt-3 w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-500">
              Ver orden técnica <span className="ml-2 text-geek-lime/70">Pendiente</span>
            </button>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

function OpcionOrigenCard({ opcion, selected }: { opcion: OpcionCotizacion; selected: boolean }) {
  return (
    <article className={`rounded-xl border p-4 ${selected ? "border-geek-lime/45 bg-geek-lime/10" : "border-white/10 bg-[#111]"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-white">{opcion.nombre}</h4>
            {selected ? <span className="rounded-full bg-geek-lime px-2 py-0.5 text-xs font-bold text-black">Seleccionada</span> : null}
            {opcion.seleccionadaPorCliente ? <span className="rounded-full border border-geek-lime/30 px-2 py-0.5 text-xs font-semibold text-geek-lime">Cliente</span> : null}
          </div>
          <p className="mt-1 text-sm text-zinc-300">{opcion.descripcion || "-"}</p>
          {opcion.urlProveedor ? (
            <a href={opcion.urlProveedor} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-semibold text-geek-lime hover:underline">
              URL Proveedor
            </a>
          ) : null}
        </div>
        <div className="text-sm sm:text-right">
          <p className="text-zinc-500">Estado Opción</p>
          <p className="font-semibold text-white">{opcion.estado || "-"}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 text-sm sm:grid-cols-5">
        <MiniMetric label="Precio Venta Cliente" value={money(opcion.precioVentaCliente)} />
        <MiniMetric label="Costo Proveedor" value={money(opcion.costoProveedor)} />
        <MiniMetric label="Flete Estimado" value={money(opcion.fleteEstimado)} />
        <MiniMetric label="Arancel / Impuestos" value={money(opcion.arancelImpuestos)} />
        <MiniMetric label="Otros Costos" value={money(opcion.otrosCostos)} />
        <MiniMetric label="Ganancia Estimada" value={money(opcion.gananciaEstimada)} />
      </div>
      {opcion.notaParaCliente ? (
        <p className="mt-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300">
          {opcion.notaParaCliente}
        </p>
      ) : null}
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-normal text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#111] p-4">
      <p className="text-xs uppercase tracking-normal text-zinc-500">{label}</p>
      <p className="mt-1 font-bold text-white">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right text-zinc-200">{value || "-"}</dd>
    </div>
  );
}

function Field({ label, value, help, onChange }: { label: string; value: string; help?: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime" />
      {help ? <span className="mt-2 block text-xs leading-5 text-zinc-500">{help}</span> : null}
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block sm:col-span-2">
      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-white outline-none focus:border-geek-lime" />
    </label>
  );
}
