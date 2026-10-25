"use client";

// Vista de UN documento (factura, recibo, proforma, nota de crédito o reserva)
// con un solo formato para todo el portal. La usan la ventana flotante
// (DocumentoModal) y la página de solo lectura de la factura.

import type { ReactNode } from "react";
import { Download, ExternalLink, Printer } from "lucide-react";
import { ETIQUETA_TIPO_VISOR, type DocumentoVisor, type TipoVisor, type TonoEstado } from "@/lib/facturacion/documentos/visor-tipos";
import { normalizeEcuadorPhone } from "@/lib/tecnicos/whatsapp";

const mon = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `$${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dia = (v: string) => {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T12:00:00-05:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Guayaquil" }).replace(".", "");
};

const COLOR_TIPO: Record<TipoVisor, string> = {
  factura: "border-[#D7FF4F]/40 bg-[#D7FF4F]/10 text-[#D7FF4F]",
  recibo: "border-[#7BE495]/40 bg-[#7BE495]/10 text-[#9BEFB0]",
  proforma: "border-[#8DB8FF]/40 bg-[#8DB8FF]/10 text-[#B5D0FF]",
  notaCredito: "border-[#FFB07A]/40 bg-[#FFB07A]/10 text-[#FFC9A3]",
  reserva: "border-[#C9B6FF]/40 bg-[#C9B6FF]/10 text-[#DCCFFF]",
};
const COLOR_TONO: Record<TonoEstado, string> = {
  ok: "text-[#7BE495]",
  mal: "text-[#FF8A80]",
  pendiente: "text-[#FFD36B]",
  neutro: "text-[#B4B5AC]",
};

const boton = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-2.5 text-[12.5px] font-semibold text-[#EDEDE7] transition hover:border-[#D7FF4F]/50";

/** Tipo · estado · número y los botones Imprimir / PDF / XML. */
export function DocumentoEncabezado({ tipo, doc, numeroPista, antes, despues }: {
  tipo: TipoVisor;
  doc: DocumentoVisor | null;
  numeroPista?: string;
  antes?: ReactNode;
  despues?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {antes}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${COLOR_TIPO[tipo]}`}>{ETIQUETA_TIPO_VISOR[tipo]}</span>
          <span className="font-mono text-[16px] font-bold tracking-tight text-[#F5F5F0]">{doc?.numero || numeroPista || ""}</span>
          {doc?.estado ? <span className={`text-[12.5px] font-semibold ${COLOR_TONO[doc.tono]}`}>{doc.estado}</span> : null}
          {doc?.fecha ? <span className="text-[12.5px] text-[#8F908A]">{dia(doc.fecha)}</span> : null}
          {doc?.ambiente === "PRUEBAS" ? <span className="rounded-full border border-[#FFD36B]/50 bg-[#FFD36B]/15 px-2 py-0.5 text-[11px] font-bold text-[#FFD36B]">PRUEBAS</span> : null}
        </div>
      </div>
      {doc?.enlaces.length ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {doc.enlaces.map((e) => (
            <a key={e.href} href={e.href} {...(e.descarga ? { download: e.descarga } : { target: "_blank", rel: "noopener" })} className={boton} title={e.etiqueta === "Imprimir" ? "Imprimir 80 mm (otra pestaña)" : `Abrir ${e.etiqueta} (otra pestaña)`}>
              {e.etiqueta === "Imprimir" ? <Printer className="h-3.5 w-3.5" aria-hidden="true" /> : e.descarga ? <Download className="h-3.5 w-3.5" aria-hidden="true" /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
              <span className="hidden sm:inline">{e.etiqueta}</span>
            </a>
          ))}
        </div>
      ) : null}
      {despues}
    </div>
  );
}

/** Etiqueta corta en gris + valor, en línea (sin tarjetas ni filas sueltas). */
function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-[#8F908A]">{etiqueta} </span>
      {children}
    </span>
  );
}

/** Cuerpo: cliente y datos en dos líneas, ítems y totales en una tabla. */
export function DocumentoVista({ doc, resaltarSku, onAbrirRelacionado, onAbrirSku }: {
  doc: DocumentoVisor;
  /** El artículo desde el que se abrió: su línea se marca. */
  resaltarSku?: string;
  onAbrirRelacionado?: (tipo: TipoVisor, recordId: string, numero: string) => void;
  onAbrirSku?: (sku: string) => void;
}) {
  const wa = normalizeEcuadorPhone(doc.cliente.telefono);
  const hayDescuento = doc.items.some((it) => it.descuento > 0);
  const marca = (resaltarSku ?? "").toUpperCase();
  const th = "px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]";
  const sep = <span className="text-[#4A4B45]">·</span>;
  const datos: ReactNode[] = [
    ...doc.datos.map((d) => <Dato key={d.etiqueta} etiqueta={d.etiqueta}>{d.valor}</Dato>),
    ...doc.relacionados.map((r) => (
      <Dato key={`${r.tipo}${r.recordId}`} etiqueta={r.etiqueta}>
        {onAbrirRelacionado ? (
          <button type="button" onClick={() => onAbrirRelacionado(r.tipo, r.recordId, r.numero)} className="font-mono text-[#D7FF4F] hover:underline">{r.numero}</button>
        ) : <span className="font-mono">{r.numero}</span>}
      </Dato>
    )),
  ];
  const conSeparador = (lista: ReactNode[]) => lista.flatMap((x, i) => (i ? [<span key={`s${i}`} className="mx-1.5">{sep}</span>, x] : [x]));

  return (
    <div className="space-y-2">
      <div className="space-y-0.5 px-0.5 text-[12.5px] leading-5">
        <p className="flex flex-wrap items-baseline gap-y-0.5">
          {conSeparador([
            <span key="n" className="font-semibold text-[#F5F5F0]">{doc.cliente.nombre || "Sin cliente"}</span>,
            ...(doc.cliente.identificacion ? [<span key="i" className="tabular-nums text-[#C9CAC1]">{doc.cliente.identificacion}</span>] : []),
            ...(doc.cliente.correo ? [<span key="c" className="text-[#C9CAC1]">{doc.cliente.correo}</span>] : []),
            ...(doc.cliente.telefono ? [wa
              ? <a key="t" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="text-[#D7FF4F] hover:underline" title="Abrir WhatsApp">{doc.cliente.telefono}</a>
              : <span key="t" className="text-[#C9CAC1]">{doc.cliente.telefono}</span>] : []),
          ])}
        </p>
        {datos.length ? <p className="flex flex-wrap items-baseline gap-y-0.5 text-[#EDEDE7]">{conSeparador(datos)}</p> : null}
        {doc.abonos.length ? (
          <p className="flex flex-wrap items-baseline gap-y-0.5 text-[#EDEDE7]">
            <span className="mr-1 text-[#8F908A]">Abonos</span>
            {conSeparador(doc.abonos.map((a, i) => <span key={i} className="whitespace-nowrap tabular-nums">{dia(a.fecha).slice(0, 6)} {mon(a.monto)} <span className="text-[#B4B5AC]">{a.formaPago}</span></span>))}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814]">
        {doc.items.length ? (
          <ul className="divide-y divide-[#252622] text-[12.5px] sm:hidden">
            {doc.items.map((it, i) => {
              const esEste = Boolean(marca) && it.codigo.toUpperCase() === marca;
              return (
                <li key={i} className={`px-3 py-2 ${esEste ? "bg-[#D7FF4F]/[0.07] shadow-[inset_2px_0_0_#D7FF4F]" : ""}`}>
                  <p>{it.descripcion}</p>
                  <p className="mt-0.5 flex justify-between gap-2 tabular-nums text-[#B4B5AC]">
                    <span><span className="font-mono text-[11.5px]">{it.codigo}</span>{it.codigo ? " · " : ""}{it.cantidad} × {mon(it.precioUnitario)}{it.descuento ? ` − ${mon(it.descuento)}` : ""}</span>
                    <span className="font-semibold text-[#EDEDE7]">{mon(it.total)}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        ) : null}
        {doc.items.length ? (
          <table className="hidden w-full border-collapse text-[12.5px] text-[#EDEDE7] sm:table">
            <thead className="border-b border-[#30312D]">
              <tr>
                <th className={`${th} text-left`}>Código</th>
                <th className={`${th} text-left`}>Descripción</th>
                <th className={`${th} text-right`}>Cant.</th>
                <th className={`${th} text-right`}>P. unit.</th>
                {hayDescuento ? <th className={`${th} text-right`}>Desc.</th> : null}
                <th className={`${th} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((it, i) => {
                const esEste = Boolean(marca) && it.codigo.toUpperCase() === marca;
                const esSku = /^[A-Z]{2,4}-\d{3,}$/i.test(it.codigo);
                return (
                  <tr key={i} className={`border-b border-[#252622] last:border-0 ${esEste ? "bg-[#D7FF4F]/[0.07] shadow-[inset_2px_0_0_#D7FF4F] animate-[sg-destello_900ms_ease-out]" : ""}`}>
                    <td className="whitespace-nowrap px-2 py-1.5 align-top font-mono text-[11.5px] text-[#B4B5AC]">
                      {it.codigo && esSku && onAbrirSku && !esEste ? (
                        <button type="button" onClick={() => onAbrirSku(it.codigo)} className="hover:text-[#D7FF4F] hover:underline" title="Ver su Kardex">{it.codigo}</button>
                      ) : it.codigo || "—"}
                    </td>
                    <td className="px-2 py-1.5 align-top">{it.descripcion}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums">{it.cantidad}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums text-[#C9CAC1]">{mon(it.precioUnitario)}</td>
                    {hayDescuento ? <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums text-[#C9CAC1]">{it.descuento ? mon(it.descuento) : ""}</td> : null}
                    <td className="whitespace-nowrap px-2 py-1.5 text-right align-top font-semibold tabular-nums">{mon(it.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-3 py-4 text-[12.5px] text-[#8F908A]">Sin detalle de ítems.</p>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[#30312D] px-3 py-2 text-[12.5px] tabular-nums">
          <span className="min-w-0 font-mono text-[10.5px] text-[#6F706A] [overflow-wrap:anywhere]" title="Clave de acceso del SRI">{doc.claveAcceso ? `SRI ${doc.claveAcceso}` : ""}</span>
          <span className="ml-auto flex items-baseline gap-4">
            {doc.mostrarIva && doc.subtotal !== null ? <Dato etiqueta="Subtotal">{mon(doc.subtotal)}</Dato> : null}
            {doc.mostrarIva && doc.iva !== null ? <Dato etiqueta="IVA">{mon(doc.iva)}</Dato> : null}
            <span className="whitespace-nowrap text-[15px] font-bold"><span className="text-[12.5px] font-semibold text-[#8F908A]">Total </span><span className="text-[#D7FF4F]">{mon(doc.total)}</span></span>
          </span>
        </div>
      </div>
    </div>
  );
}
