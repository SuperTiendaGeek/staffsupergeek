"use client";

// Punto 18 (25-oct-2026, incluye el punto 14 "vistas de Roberto"): ficha del
// artículo para el PROVEEDOR. Solo su relación comercial con SUPER GEEK: el
// artículo que nos vendió, su orden, la caja en la que viaja, su factura y los
// pagos que le hicimos. Nada de inspecciones, mejoras, despiece, kardex,
// publicaciones, precio de venta ni costos internos: esos datos no llegan.

import { useState, type ReactNode } from "react";
import { FileText, Package, ReceiptText, ShoppingCart } from "lucide-react";
import { ItemPhotoViewer } from "@/components/shipping-v2/ItemPhotoViewer";
import { InlineEditableField } from "@/components/shipping-v2/InlineEditableField";
import { CopyableSKU } from "@/components/ui/copyable-sku";
import { SHIPPING_V2_ITEM_EDIT_FIELDS } from "@/lib/shipping-v2/item-edit-config";
import { FICHA_PROVEEDOR, type BloqueFichaProveedor } from "@/lib/shipping-v2/ficha-secciones";
import type { FichaItemProveedor, FichaProveedor } from "@/lib/shipping-v2/ficha-articulo";
import { EstadoBadge, HeroStat, PasoChip, formatCurrency, shortDate } from "@/app/shipping-v2/items/ShippingV2ItemsClient";

function Seccion({ icono: Icono, titulo, children, extra }: { icono: typeof Package; titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
      <h2 className="flex items-center gap-2 border-b border-[#2E2F28] bg-[#1A1B17] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[#8F908A]">
        <Icono className="h-3.5 w-3.5" aria-hidden="true" />
        {titulo}
        {extra ? <span className="ml-auto normal-case tracking-normal">{extra}</span> : null}
      </h2>
      {children}
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-[#24251F] px-3 py-1.5 last:border-b-0">
      <dt className="shrink-0 text-[12px] text-[#8F908A]">{etiqueta}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] font-medium text-[#E6E6E1]">{children}</dd>
    </div>
  );
}

function Adjuntos({ archivos }: { archivos: Array<{ url: string; nombre: string }> }) {
  if (!archivos.length) return null;
  return (
    <span className="inline-flex flex-wrap justify-end gap-2">
      {archivos.map((a) => (
        <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#D7FF4F] hover:underline">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          {a.nombre}
        </a>
      ))}
    </span>
  );
}

export function FichaProveedorVista({ datos, modo }: { datos: FichaProveedor; modo: "modal" | "pagina"; alCambiar?: () => void }) {
  const [item, setItem] = useState<FichaItemProveedor>(datos.item);
  const C = SHIPPING_V2_ITEM_EDIT_FIELDS;
  const unidades = item.unidadesCompradas ?? item.cantidad ?? null;
  const total = datos.verCosto && typeof item.costoProveedor === "number" && typeof unidades === "number" ? item.costoProveedor * unidades : null;
  const sku = String(item.sku ?? "").trim();
  const resto = [item.categoria, item.condicion, [item.marca, item.modelo].filter(Boolean).join(" ")].map((v) => String(v ?? "").trim()).filter(Boolean).join(" · ");

  async function guardar(campo: string, valor: string | number | boolean | null) {
    const respuesta = await fetch(`/api/shipping-v2/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: campo, value: valor }),
    });
    const payload = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !payload.success) throw new Error(String(payload.error || "No se pudo guardar."));
    setItem((actual) => ({ ...actual, ...(payload.data as Partial<FichaItemProveedor>) }));
  }

  const bloques: Record<BloqueFichaProveedor, ReactNode> = {
    compra: (
      <Seccion icono={ShoppingCart} titulo="Compra">
        <dl>
          <Dato etiqueta="Su orden / factura">{datos.compra?.numeroProveedor || datos.compra?.codigo || "—"}</Dato>
          <Dato etiqueta="Fecha de compra">{shortDate(datos.compra?.fecha) || "—"}</Dato>
          <Dato etiqueta="Registrado">{shortDate(item.fechaRegistro || item.createdTime) || "—"}</Dato>
        </dl>
      </Seccion>
    ),
    envio: datos.envio ? (
      <Seccion icono={Package} titulo="Envío" extra={datos.envio.estado ? <EstadoBadge estado={datos.envio.estado} size="sm" /> : null}>
        <dl>
          <Dato etiqueta="Caja">{datos.envio.codigo}{datos.envio.nombre ? <span className="ml-1.5 text-[#8F908A]">{datos.envio.nombre}</span> : null}</Dato>
          {datos.envio.trackingUsa ? <Dato etiqueta="Rastreo USA"><CopyableSKU sku={datos.envio.trackingUsa} etiqueta="Rastreo" /></Dato> : null}
          {datos.envio.trackingEc ? <Dato etiqueta="Rastreo Ecuador"><CopyableSKU sku={datos.envio.trackingEc} etiqueta="Rastreo" /></Dato> : null}
          {datos.envio.peso !== null ? <Dato etiqueta="Peso">{datos.envio.peso} kg</Dato> : null}
          <Dato etiqueta="Enviada">{shortDate(datos.envio.fechaEnvio) || "—"}</Dato>
          <Dato etiqueta="Recibida">{shortDate(datos.envio.fechaRecepcion) || "—"}</Dato>
          {datos.envio.factura.length ? <Dato etiqueta="Factura"><Adjuntos archivos={datos.envio.factura} /></Dato> : null}
        </dl>
      </Seccion>
    ) : null,
    pagos: datos.pagos ? (
      <Seccion icono={ReceiptText} titulo="Pagos de SUPER GEEK" extra={datos.estadoPago ? <PasoChip tono="ok">{datos.estadoPago}</PasoChip> : null}>
        {datos.pagos.length ? (
          <ol className="divide-y divide-[#24251F]">
            {datos.pagos.map((pago) => (
              <li key={pago.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-1.5">
                <span className="min-w-0 truncate text-[13px] font-semibold text-[#E6E6E1]">
                  {pago.codigo}
                  <span className="ml-2 text-[12px] font-normal text-[#8F908A]">
                    {[shortDate(pago.fecha), pago.metodo, pago.transaccion ? `N° ${pago.transaccion}` : ""].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-right text-[13px] font-semibold tabular-nums text-[#F5F5F5]">{formatCurrency(pago.monto)}</span>
                <span className="text-[11.5px] text-[#8F908A]">{pago.estado}</span>
                <span className="text-right text-[12px]"><Adjuntos archivos={pago.factura} /></span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-3 py-2 text-[12.5px] text-[#8F908A]">Sin pagos registrados para esta compra.</p>
        )}
      </Seccion>
    ) : null,
    observaciones: datos.puedeEditar ? (
      <Seccion icono={FileText} titulo="Observaciones">
        <div className="p-2">
          <InlineEditableField
            label={C.observacionesInternas.label}
            value={item.observacionesInternas}
            type={C.observacionesInternas.type}
            displayValue={item.observacionesInternas?.trim() ? <span className="whitespace-pre-line">{item.observacionesInternas}</span> : <span className="text-[#5E5F59]">Agregar observación…</span>}
            hideLabel
            valueClassName="min-h-10 break-words text-[13px] leading-5 text-[#E6E6E1]"
            onSave={(valor) => guardar(C.observacionesInternas.field, valor)}
          />
        </div>
      </Seccion>
    ) : null,
  };

  return (
    <div className="grid w-full gap-3 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] 2xl:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
      <aside className={`min-w-0 md:sticky md:self-start ${modo === "modal" ? "md:top-0" : "md:top-16"}`}>
        <ItemPhotoViewer itemId={item.id} itemName={item.nombre} fotos={item.fotos} onUpdated={() => undefined} canEdit={false} density="hero" />
      </aside>

      <div className="min-w-0 space-y-3">
        <section className="rounded-lg border border-[#2E2F28] bg-[#171814]">
          <div className="p-3">
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${item.situacion === "En camino" ? "border-violet-300/25 bg-violet-300/10 text-violet-200" : "border-[#7BE495]/35 bg-[#7BE495]/10 text-[#9FEFB3]"}`}>
              {item.situacion}
            </span>
            <InlineEditableField
              label={C.nombre.label}
              value={item.nombre}
              type={C.nombre.type}
              displayValue={item.nombre?.trim() || "Sin nombre"}
              hideLabel
              className="-mx-1 mt-2 rounded-md px-1 transition"
              valueClassName="min-h-7 break-words text-xl font-semibold leading-tight text-[#F5F5F5] lg:text-[22px]"
              readOnly={!datos.puedeEditar}
              onSave={(valor) => guardar(C.nombre.field, valor)}
            />
            <p className="mt-1 text-[12px] text-[#8F908A]">
              {sku ? <CopyableSKU sku={sku} /> : null}
              {sku && resto ? " · " : null}
              {resto}
            </p>
            {item.descripcion?.trim() ? <p className="mt-1.5 whitespace-pre-line text-[13px] leading-5 text-[#B4B5AC]">{item.descripcion}</p> : null}
          </div>
          <div className={`grid gap-px border-t border-[#24251F] bg-[#24251F] ${datos.verCosto ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
            <HeroStat label="Su SKU">{item.skuProveedor?.trim() ? <CopyableSKU sku={item.skuProveedor.trim()} etiqueta="SKU proveedor" /> : "—"}</HeroStat>
            <HeroStat label="Unidades">{unidades ?? "—"}</HeroStat>
            {datos.verCosto ? <HeroStat label="Costo unitario" tone="lime">{formatCurrency(item.costoProveedor ?? null)}</HeroStat> : null}
            {datos.verCosto ? <HeroStat label="Total">{formatCurrency(total)}</HeroStat> : null}
          </div>
        </section>

        {FICHA_PROVEEDOR.bloques.map((bloque) => (bloques[bloque] ? <div key={bloque}>{bloques[bloque]}</div> : null))}
      </div>
    </div>
  );
}
