"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { CotizacionDetalle, OpcionCotizacion } from "@/types/cotizaciones";
import { CARRIERS_PEDIDO, type EstadoPedidoOption, type PedidoItem } from "@/types/pedidos";

type Props = {
  initialPedido: PedidoItem;
  cotizacionOrigen: CotizacionDetalle | null;
  estadosPedidoOptions: EstadoPedidoOption[];
};

type ApiResponse = { success?: boolean; data?: unknown; error?: string };

function money(value: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function numberInputValue(value: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

function numberOrNull(value: string) {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function whatsappUrl(pedido: PedidoItem) {
  const phone = pedido.clienteTelefonoSnapshot.replace(/\D/g, "");
  const message = `Hola ${pedido.clienteNombreSnapshot}, te escribimos de SUPER GEEK sobre tu pedido ${pedido.codigo}: ${pedido.item}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function isGeneratedPedidoNote(value: string) {
  const lines = value.trim().split("\n").map((line) => line.trim());
  return lines[0]?.startsWith("Cotización:") && lines.some((line) => line.startsWith("Producto solicitado:"));
}

async function parseApi(response: Response): Promise<ApiResponse | null> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return null;
  }
}

export function PedidoDetalleClient({ initialPedido, cotizacionOrigen, estadosPedidoOptions }: Props) {
  const [pedido, setPedido] = useState(initialPedido);
  const [showCotizacion, setShowCotizacion] = useState(false);
  const [form, setForm] = useState({
    estadosPedido: initialPedido.estadosPedido,
    encargo: initialPedido.estaEncargado,
    fleteEcItemSolo: numberInputValue(initialPedido.fleteEcItemSolo),
    arancelItemSolo: numberInputValue(initialPedido.arancelItemSolo),
    usaTracking: initialPedido.usaTracking,
    ecTracking: initialPedido.ecTracking,
    carrier: initialPedido.carrier,
    recibido: initialPedido.recibido,
    recibidoEnLv: initialPedido.recibidoEnLv,
    notaInterna: isGeneratedPedidoNote(initialPedido.notaInterna) ? "" : initialPedido.notaInterna,
    notaPublica: initialPedido.notaPublica,
  });
  const [saving, setSaving] = useState(false);
  const [savingEstado, setSavingEstado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tipoPedido = pedido.esProveedorLocal ? "Local" : pedido.esProveedorExterior ? "Exterior" : "Por definir";
  const mostrarRecepcionIntermediario = pedido.esProveedorExterior || form.encargo;
  const fleteReal = numberOrNull(form.fleteEcItemSolo);
  const arancelReal = pedido.esProveedorExterior ? numberOrNull(form.arancelItemSolo) : null;
  const costoRealTotal = (pedido.costoProveedor ?? 0) + (fleteReal ?? 0) + (arancelReal ?? 0);
  const gananciaReal = pedido.precioVenta === null ? null : pedido.precioVenta - costoRealTotal;
  const gananciaNeta = pedido.gananciaNeta ?? gananciaReal;

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/pedidos/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          fleteEcItemSolo: fleteReal,
          arancelItemSolo: arancelReal,
        }),
      });
      const payload = await parseApi(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo guardar el pedido.");
      }
      const updatedPedido = payload.data as PedidoItem;
      setPedido(updatedPedido);
      setForm((current) => ({
        ...current,
        estadosPedido: updatedPedido.estadosPedido,
        encargo: updatedPedido.estaEncargado,
        fleteEcItemSolo: numberInputValue(updatedPedido.fleteEcItemSolo),
        arancelItemSolo: numberInputValue(updatedPedido.arancelItemSolo),
        notaInterna: isGeneratedPedidoNote(updatedPedido.notaInterna) ? "" : updatedPedido.notaInterna,
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  async function saveEstadoPedido(estadosPedido: string) {
    setForm((current) => ({ ...current, estadosPedido }));
    setSavingEstado(true);
    setError(null);
    try {
      const response = await fetch(`/api/pedidos/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estadosPedido }),
      });
      const payload = await parseApi(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo guardar el estado del pedido.");
      }
      const updatedPedido = payload.data as PedidoItem;
      setPedido(updatedPedido);
      setForm((current) => ({ ...current, estadosPedido: updatedPedido.estadosPedido }));
    } catch (saveError) {
      setForm((current) => ({ ...current, estadosPedido: pedido.estadosPedido }));
      setError(saveError instanceof Error ? saveError.message : "Error inesperado");
    } finally {
      setSavingEstado(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}

      <PedidoHeader
        pedido={pedido}
        cotizacionOrigen={cotizacionOrigen}
        estadoPedido={form.estadosPedido}
        estadosPedidoOptions={estadosPedidoOptions}
        savingEstado={savingEstado}
        onEstadoChange={saveEstadoPedido}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <PedidoSeguimientoCard
            pedido={pedido}
            tipoPedido={tipoPedido}
            form={form}
            saving={saving}
            mostrarRecepcionIntermediario={mostrarRecepcionIntermediario}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            onSubmit={save}
          />

          <PedidoNotasCard pedido={pedido} notaInterna={form.notaInterna} saving={saving} onChange={(notaInterna) => setForm((current) => ({ ...current, notaInterna }))} onSubmit={save} />
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <PedidoClienteCard pedido={pedido} />
          <PedidoDineroCard
            pedido={pedido}
            cotizacionOrigen={cotizacionOrigen}
            form={form}
            saving={saving}
            costoRealTotal={costoRealTotal}
            gananciaReal={gananciaReal}
            gananciaNeta={gananciaNeta}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            onSubmit={save}
          />
          <PedidoReferenciaCotizacionCard
            pedido={pedido}
            cotizacionOrigen={cotizacionOrigen}
            showCotizacion={showCotizacion}
            onToggle={() => setShowCotizacion((current) => !current)}
          />
          <PedidoAccionesCard pedido={pedido} cotizacionOrigen={cotizacionOrigen} saving={saving} onSave={() => save()} />
        </aside>
      </div>
    </div>
  );
}

function PedidoHeader({
  pedido,
  cotizacionOrigen,
  estadoPedido,
  estadosPedidoOptions,
  onEstadoChange,
  savingEstado,
}: {
  pedido: PedidoItem;
  cotizacionOrigen: CotizacionDetalle | null;
  estadoPedido: string;
  estadosPedidoOptions: EstadoPedidoOption[];
  onEstadoChange: (value: string) => void;
  savingEstado: boolean;
}) {
  const hasCurrentEstado = estadoPedido && !estadosPedidoOptions.some((option) => option.name === estadoPedido);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 lg:max-w-[48%]">
          <p className="text-xs font-bold uppercase tracking-normal text-geek-lime">{pedido.codigo}</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">{pedido.item}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <Badge>{pedido.categoria || pedido.itemPara || "Item"}</Badge>
            {pedido.identificador ? <Badge>SKU: {pedido.identificador}</Badge> : null}
          </div>
        </div>
        <div className="w-full space-y-3 lg:w-auto lg:min-w-[420px]">
          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <ActionLink href="/pedidos">Volver</ActionLink>
            {cotizacionOrigen ? <ActionLink href={`/cotizaciones/${cotizacionOrigen.id}`}>Abrir cotización</ActionLink> : null}
            <a
              href={whatsappUrl(pedido)}
              target="_blank"
              rel="noreferrer"
              className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition ${pedido.clienteTelefonoSnapshot ? "border-geek-lime bg-geek-lime text-black hover:brightness-95" : "pointer-events-none border-zinc-800 bg-zinc-900 text-zinc-500"}`}
            >
              WhatsApp
            </a>
          </div>
          <div className="ml-auto flex w-full items-center gap-3 sm:max-w-[420px]">
            <select
              aria-label="Estado del pedido"
              value={estadoPedido}
              disabled={savingEstado}
              onChange={(event) => onEstadoChange(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm font-semibold text-white outline-none focus:border-geek-lime disabled:cursor-wait disabled:opacity-70"
            >
              <option value="">Sin estado</option>
              {hasCurrentEstado ? <option value={estadoPedido}>{estadoPedido}</option> : null}
              {estadosPedidoOptions.map((option) => (
                <option key={option.id || option.name} value={option.name}>{option.name}</option>
              ))}
            </select>
            {savingEstado ? <span className="w-20 text-right text-xs font-semibold text-geek-lime">Guardando...</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function PedidoSeguimientoCard({
  pedido,
  tipoPedido,
  form,
  saving,
  mostrarRecepcionIntermediario,
  onChange,
  onSubmit,
}: {
  pedido: PedidoItem;
  tipoPedido: string;
  form: {
    usaTracking: string;
    ecTracking: string;
    carrier: string;
    encargo: boolean;
    recibido: boolean;
    recibidoEnLv: boolean;
  };
  saving: boolean;
  mostrarRecepcionIntermediario: boolean;
  onChange: (patch: Partial<typeof form>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Card title="Seguimiento y recepción">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnly label="Proveedor" value={pedido.proveedor || "-"} />
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnly label="Origen proveedor" value={pedido.proveedorOrigen || "-"} />
            <ReadOnly label="Tipo pedido" value={tipoPedido} />
          </div>
          {!pedido.proveedor ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100 sm:col-span-2">
              Este pedido no tiene proveedor heredado. Revisa la opción de cotización aprobada.
            </p>
          ) : null}
          <CheckField label="Encargo con Roberto" checked={form.encargo} onChange={(encargo) => onChange({ encargo })} />
          <SelectField label="Carrier" value={form.carrier} onChange={(carrier) => onChange({ carrier })}>
            <option value="">Sin carrier</option>
            {CARRIERS_PEDIDO.map((carrier) => (
              <option key={carrier} value={carrier}>{carrier}</option>
            ))}
          </SelectField>
          {pedido.requiereUsaTracking ? (
            <Field label="USA Tracking" value={form.usaTracking} help="Proveedor, tienda online o punto inicial hasta casilla o intermediario." onChange={(usaTracking) => onChange({ usaTracking })} />
          ) : null}
          <Field label="EC Tracking" value={form.ecTracking} help={pedido.esProveedorExterior ? "Miami o intermediario hasta SUPER GEEK." : "Entrega local hasta SUPER GEEK."} onChange={(ecTracking) => onChange({ ecTracking })} />
        </div>

        {form.encargo ? (
          <p className="rounded-xl border border-geek-lime/25 bg-geek-lime/10 px-4 py-3 text-sm leading-6 text-zinc-200">
            Encargo con Roberto: este pedido será recibido primero por Roberto o un intermediario.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {mostrarRecepcionIntermediario ? (
            <CheckField label="Recibido por intermediario" checked={form.recibidoEnLv} onChange={(recibidoEnLv) => onChange({ recibidoEnLv })} />
          ) : null}
          <CheckField label="Recibido en SUPER GEEK" checked={form.recibido} onChange={(recibido) => onChange({ recibido })} />
        </div>

        <SaveRow saving={saving} label="Guardar seguimiento" />
      </form>
    </Card>
  );
}

function PedidoDineroCard({
  pedido,
  cotizacionOrigen,
  form,
  saving,
  costoRealTotal,
  gananciaReal,
  gananciaNeta,
  onChange,
  onSubmit,
}: {
  pedido: PedidoItem;
  cotizacionOrigen: CotizacionDetalle | null;
  form: { fleteEcItemSolo: string; arancelItemSolo: string };
  saving: boolean;
  costoRealTotal: number;
  gananciaReal: number | null;
  gananciaNeta: number | null;
  onChange: (patch: Partial<typeof form>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Card title="Dinero y rentabilidad">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3">
          <MoneyRow label="Precio venta" value={money(pedido.precioVenta)} />
          <MoneyRow label="Total abonado" value={money(cotizacionOrigen?.totalAbonado ?? null)} />
          <MoneyRow label="Saldo pendiente" value={money(cotizacionOrigen?.saldoPendiente ?? null)} />
          <MoneyRow label="Costo proveedor" value={money(pedido.costoProveedor)} />
          <InlineMoneyField label="Flete" value={form.fleteEcItemSolo} onChange={(fleteEcItemSolo) => onChange({ fleteEcItemSolo })} />
          {pedido.esProveedorExterior ? (
            <InlineMoneyField label="Arancel" value={form.arancelItemSolo} onChange={(arancelItemSolo) => onChange({ arancelItemSolo })} />
          ) : null}
          <MoneyRow label="Costo real total" value={money(costoRealTotal)} strong />
          <MoneyRow label="Ganancia estimada" value={money(pedido.ganancia)} />
          <MoneyRow label="Ganancia neta / real" value={money(gananciaNeta ?? gananciaReal)} strong />
        </div>
        <SaveRow saving={saving} label="Guardar costos" />
      </form>
    </Card>
  );
}

function PedidoNotasCard({
  pedido,
  notaInterna,
  saving,
  onChange,
  onSubmit,
}: {
  pedido: PedidoItem;
  notaInterna: string;
  saving: boolean;
  onChange: (notaInterna: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Card title="Notas y evidencias">
      <form onSubmit={onSubmit} className="space-y-5">
        <TextArea label="Nota Interna" value={notaInterna} onChange={onChange} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-zinc-400">Evidencias / adjuntos</p>
          {pedido.evidencias.length > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {pedido.evidencias.map((evidencia) => (
                <a key={evidencia.id || evidencia.url} href={evidencia.url} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime">
                  {evidencia.filename || "Evidencia"}
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No hay evidencias registradas.</p>
          )}
        </div>
        <SaveRow saving={saving} label="Guardar nota" />
      </form>
    </Card>
  );
}

function PedidoClienteCard({ pedido }: { pedido: PedidoItem }) {
  return (
    <Card title="Cliente">
      <div className="space-y-4">
        <div>
          <p className="text-lg font-semibold text-white">{pedido.clienteNombreSnapshot}</p>
          <p className="mt-1 text-sm text-zinc-300">{pedido.clienteTelefonoSnapshot || "Sin teléfono"}</p>
        </div>
        <a href={whatsappUrl(pedido)} target="_blank" rel="noreferrer" className={`inline-flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-bold transition ${pedido.clienteTelefonoSnapshot ? "border-geek-lime bg-geek-lime text-black hover:brightness-95" : "pointer-events-none border-zinc-800 bg-zinc-900 text-zinc-500"}`}>WhatsApp</a>
      </div>
    </Card>
  );
}

function PedidoReferenciaCotizacionCard({
  pedido,
  cotizacionOrigen,
  showCotizacion,
  onToggle,
}: {
  pedido: PedidoItem;
  cotizacionOrigen: CotizacionDetalle | null;
  showCotizacion: boolean;
  onToggle: () => void;
}) {
  if (!cotizacionOrigen) {
    return (
      <Card title="Referencia de cotización">
        <p className="text-sm text-zinc-400">Este pedido no tiene cotización vinculada.</p>
      </Card>
    );
  }

  return (
    <Card title="Referencia de cotización">
      <div className="space-y-4">
        <div className="grid gap-3">
          <ReadOnly label="Código" value={cotizacionOrigen.codigo || pedido.cotizacionCodigo || "-"} />
          <ReadOnly label="Estado cotización" value={cotizacionOrigen.estado || "-"} />
          {pedido.skuProveedor ? <ReadOnly label="SKU proveedor" value={pedido.skuProveedor} /> : null}
          <ReadOnly label="Producto solicitado" value={cotizacionOrigen.productoSolicitado || "-"} />
          <ReadOnly label="Descripción" value={cotizacionOrigen.descripcionRequerimiento || "-"} />
        </div>
        <Link href={`/cotizaciones/${cotizacionOrigen.id}`} className="inline-flex w-full justify-center rounded-xl border border-geek-lime/40 px-4 py-3 text-sm font-semibold text-geek-lime transition hover:bg-geek-lime/10">
          Abrir cotización completa
        </Link>
        <button type="button" onClick={onToggle} className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime">
          {showCotizacion ? "Ocultar detalle" : "Ver detalle"}
        </button>
        {showCotizacion ? (
          <div className="space-y-4 border-t border-white/10 pt-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-normal text-zinc-400">Opciones ofrecidas</p>
              {cotizacionOrigen.opciones.map((opcion) => (
                <OpcionCompacta key={opcion.id} opcion={opcion} selected={opcion.id === pedido.opcionCotizacionId || opcion.seleccionadaPorCliente} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function OpcionCompacta({ opcion, selected }: { opcion: OpcionCotizacion; selected: boolean }) {
  return (
    <article className={`rounded-xl border px-3 py-3 text-sm ${selected ? "border-geek-lime/45 bg-geek-lime/10" : "border-white/10 bg-[#111]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{opcion.nombre}</p>
          <p className="mt-1 text-xs text-zinc-400">{opcion.descripcion || "Sin descripción"}</p>
        </div>
        {selected ? <span className="rounded-full bg-geek-lime px-2 py-0.5 text-[11px] font-bold text-black">Seleccionada</span> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <MiniMetric label="Estado" value={opcion.estado || "-"} />
        <MiniMetric label="Detalle" value={opcion.urlProveedor ? "Con URL" : "-"} />
      </div>
    </article>
  );
}

function PedidoAccionesCard({ pedido, cotizacionOrigen, saving, onSave }: { pedido: PedidoItem; cotizacionOrigen: CotizacionDetalle | null; saving: boolean; onSave: () => void }) {
  return (
    <Card title="Acciones rápidas">
      <div className="grid gap-2">
        <ActionLink href="/pedidos">Volver</ActionLink>
        {cotizacionOrigen ? <ActionLink href={`/cotizaciones/${cotizacionOrigen.id}`}>Abrir cotización</ActionLink> : null}
        <a href={whatsappUrl(pedido)} target="_blank" rel="noreferrer" className={`inline-flex justify-center rounded-xl border px-4 py-2.5 text-sm font-bold transition ${pedido.clienteTelefonoSnapshot ? "border-geek-lime bg-geek-lime text-black hover:brightness-95" : "pointer-events-none border-zinc-800 bg-zinc-900 text-zinc-500"}`}>WhatsApp</a>
        <button type="button" disabled={saving} onClick={onSave} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime disabled:cursor-wait disabled:opacity-60">
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-zinc-200">{children}</span>;
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime">{children}</Link>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#111] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-normal text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-white">{value || "-"}</p>
    </div>
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

function MoneyRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className={`text-right ${strong ? "text-base font-extrabold text-geek-lime" : "text-sm font-semibold text-white"}`}>{value}</span>
    </div>
  );
}

function SaveRow({ saving, label }: { saving: boolean; label: string }) {
  return (
    <div className="flex justify-end">
      <button type="submit" disabled={saving} className="rounded-xl border border-geek-lime bg-geek-lime px-5 py-3 text-sm font-extrabold text-black transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60">
        {saving ? "Guardando..." : label}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  help,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  help?: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime" />
      {help ? <span className="mt-2 block text-xs leading-5 text-zinc-500">{help}</span> : null}
    </label>
  );
}

function InlineMoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const hasValue = value.trim() !== "";

  return (
    <label className="flex items-center justify-between gap-4 border-b border-white/10 pb-2">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="flex min-w-32 items-center justify-end text-sm font-semibold text-white focus-within:text-geek-lime">
        {hasValue ? <span>$</span> : null}
        <input
          inputMode="decimal"
          value={value}
          placeholder="-"
          onChange={(event) => onChange(event.target.value)}
          className="w-16 bg-transparent text-right font-semibold text-inherit outline-none placeholder:text-zinc-500"
        />
      </span>
    </label>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime">
        {children}
      </select>
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="rounded-xl border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-zinc-200">
      <span className="flex items-center gap-3 font-semibold text-white">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-geek-lime" />
        {label}
      </span>
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-white outline-none focus:border-geek-lime" />
    </label>
  );
}
