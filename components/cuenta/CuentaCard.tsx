"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, FileText, MoreHorizontal, Paperclip } from "lucide-react";
import type { CuentaUnificada, CuentaUnificadaComprobante } from "@/types/cuenta-unificada";
import { armarTarjetaCuenta, descuentosDeTarjeta, textoDocumento, type DocumentoCuenta, type PagoTarjeta, type TonoTarjeta } from "@/lib/estado-cuenta/tarjeta";
import { cargosDescontables } from "@/lib/estado-cuenta/descuentos";
import { enlacesComprobanteAbono } from "@/lib/cobros/comprobante-abono";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { SaldoAFavorAcciones, type SaldoInfo } from "@/components/cuenta-unificada/SaldoAFavorAcciones";
import { ParteDePagoAccion } from "@/components/cuenta-unificada/ParteDePagoAccion";
import { CobrarEnMostrador } from "@/components/pantalla-cliente/CobrarEnMostrador";
import { CargoFila } from "./CargoFila";
import { AnularPagoDialog } from "./AnularPagoDialog";

// Tarjeta "Cuenta" (auditoría ops, punto 11 · 21-nov-2026). UN componente
// para la orden de reparación y para el pedido especial. Reemplaza el
// "Resumen financiero" (recuadro de saldo + cuadrícula + "Cuenta unificada" +
// repuestos históricos + segunda lista de abonos), que repetía el saldo tres
// veces y los pagos en dos listas. Maqueta aprobada por el dueño el 21-nov
// (lienzo "Punto 11 — Cuenta y Asistente de la orden").
//
// No calcula nada: pinta lo que arma lib/estado-cuenta/tarjeta.ts con la
// cuenta de la calculadora única. Colores literales a propósito: la pantalla
// de Operaciones no define las variables --sg-* de Técnicos.

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

function fechaCorta(fecha: string | null): string {
  if (!fecha) return "—";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short" }).replace(".", "");
}

const TONO_TEXTO: Record<TonoTarjeta, string> = {
  ambar: "text-[#FFB547]",
  verde: "text-[#56E3A4]",
  azul: "text-[#78B7FF]",
  gris: "text-[#B5B5AE]",
};
const TONO_CHIP: Record<TonoTarjeta, string> = {
  ambar: "text-[#FFB547] bg-[#FFB547]/[.12]",
  verde: "text-[#56E3A4] bg-[#56E3A4]/[.12]",
  azul: "text-[#78B7FF] bg-[#78B7FF]/[.12]",
  gris: "text-[#C9C9C2] bg-[#2C2D29]",
};

const BTN = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#3A3A36] bg-[#252622] text-[#F0F0EC] font-semibold transition-colors hover:border-[#6A6A62] disabled:opacity-50";
const BTN_SM = `${BTN} h-[26px] rounded-md px-2.5 text-xs`;
const BTN_MAIN = "inline-flex flex-1 items-center justify-center gap-1.5 h-9 rounded-lg bg-[#D7FF4F] text-[#151613] text-[13px] font-bold transition hover:brightness-95";

export function CuentaCard({
  cuenta,
  documento,
  origenTipo,
  esAdmin,
  cargando = false,
  onRegistrarPago,
  onCuentaCambiada,
  onVerComprobante,
}: {
  cuenta: CuentaUnificada | null;
  documento: DocumentoCuenta | null;
  origenTipo: "orden" | "operacion";
  esAdmin: boolean;
  cargando?: boolean;
  onRegistrarPago: () => void;
  onCuentaCambiada: () => void;
  /** La orden tiene su visor de comprobantes; sin él, el comprobante se abre en otra pestaña. */
  onVerComprobante?: (abonoId: string, adjunto: CuentaUnificadaComprobante) => void;
}) {
  const recordId = cuenta ? (origenTipo === "operacion" ? cuenta.operacionId : cuenta.ordenId) : null;
  const base = recordId
    ? origenTipo === "orden" ? `/api/tecnicos/ordenes/${encodeURIComponent(recordId)}` : `/api/operaciones/${encodeURIComponent(recordId)}`
    : null;
  const urlDescuentos = base ? `${base}/descuentos` : null;
  const urlSaldo = base ? `${base}/saldo-favor` : null;
  const urlParteDePago = base ? `${base}/parte-de-pago` : null;
  const hrefEmitir = recordId ? `/facturacion/nueva?origen=${origenTipo}&recordId=${encodeURIComponent(recordId)}` : null;

  const tarjeta = useMemo(() => (cuenta ? armarTarjetaCuenta({ cuenta, documento, esAdmin }) : null), [cuenta, documento, esAdmin]);
  const descuentos = useMemo(() => (cuenta ? descuentosDeTarjeta(cuenta) : new Map()), [cuenta]);
  const descontables = useMemo(() => new Map(cuenta ? cargosDescontables(cuenta).map((c) => [c.id, c]) : []), [cuenta]);

  const [cargosAbierto, setCargosAbierto] = useState(false);
  const [pagosAbierto, setPagosAbierto] = useState(true);
  const [verAnulados, setVerAnulados] = useState(false);
  const [menuPago, setMenuPago] = useState<string | null>(null);
  const [masAbierto, setMasAbierto] = useState(false);
  const [anulando, setAnulando] = useState<PagoTarjeta | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [errorPago, setErrorPago] = useState<{ id: string; texto: string } | null>(null);
  const [descuentoAbierto, setDescuentoAbierto] = useState<string | null>(null);
  const [destello, setDestello] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const archivoPara = useRef<string | null>(null);

  // El saldo destella solo cuando CAMBIA (causa → efecto: se registró o anuló un pago).
  const [destelloSaldo, setDestelloSaldo] = useState(false);
  const saldoPrevio = useRef<number | null>(null);
  const saldoActual = cuenta?.saldo;
  useEffect(() => {
    if (saldoActual === undefined) return;
    const antes = saldoPrevio.current;
    saldoPrevio.current = saldoActual;
    if (antes === null || Math.abs(antes - saldoActual) < 0.005) return;
    setDestelloSaldo(true);
    const t = setTimeout(() => setDestelloSaldo(false), 900);
    return () => clearTimeout(t);
  }, [saldoActual]);

  // Saldo a favor del cliente (punto 13B): para "Pasar a saldo a favor" y para
  // avisar que lo puede usar al pagar.
  const [saldoInfo, setSaldoInfo] = useState<SaldoInfo | null>(null);
  const saldoCuenta = cuenta?.saldo ?? 0;
  const consultarSaldo = !!urlSaldo && Math.abs(saldoCuenta) > 0.01;
  useEffect(() => {
    if (!consultarSaldo || !urlSaldo) { setSaldoInfo(null); return; }
    let vivo = true;
    fetch(urlSaldo)
      .then((r) => r.json())
      .then((j) => { if (vivo) setSaldoInfo(j?.success ? (j.data as SaldoInfo) : null); })
      .catch(() => { if (vivo) setSaldoInfo(null); });
    return () => { vivo = false; };
  }, [consultarSaldo, urlSaldo, saldoCuenta]);

  if (!cuenta || !tarjeta) {
    return (
      <section aria-label="Cuenta" className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3.5 py-3 text-[13px] text-[#F0F0EC]">
        <div className="flex items-center gap-2">
          <h2 className="m-0 text-[13px] font-bold">Cuenta</h2>
          <span className="ml-auto text-xs text-[#B5B5AE]">{cargando ? "Cargando…" : ""}</span>
        </div>
        <p className="mt-2 text-[28px] font-extrabold leading-none text-[#B5B5AE]">—</p>
      </section>
    );
  }

  const avisar = (m: string) => {
    setMensaje(m);
    onCuentaCambiada();
  };

  async function subirComprobante(abonoId: string, file: File | null) {
    if (!file) return;
    setSubiendo(abonoId);
    setErrorPago(null);
    try {
      const fd = new FormData();
      fd.set("comprobanteArchivo", file);
      const res = await fetch(`/api/tecnicos/abonos-por-orden/${encodeURIComponent(abonoId)}/comprobantes`, { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.success) throw new Error(j?.error || "No se pudo agregar el comprobante.");
      avisar("Comprobante agregado.");
    } catch (e) {
      setErrorPago({ id: abonoId, texto: e instanceof Error ? e.message : "No se pudo agregar el comprobante." });
    } finally {
      setSubiendo(null);
    }
  }

  const docHref = documento?.recordId ? `/facturacion/imprimir/${documento.tipo}/${encodeURIComponent(documento.recordId)}` : null;
  const docTexto = documento ? textoDocumento(documento) : "";

  return (
    <section aria-label="Cuenta" className="overflow-hidden rounded-xl border border-[#3A3A36] bg-[#1E1F1C] text-[13px] text-[#F0F0EC]">
      {/* Cabecera: estado de pago y documento */}
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <h2 className="m-0 text-[13px] font-bold">Cuenta</h2>
        <span className={`inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-semibold ${TONO_CHIP[tarjeta.tono]}`}>{tarjeta.etiquetaEstado}</span>
        {cargando && <span className="text-[11px] text-[#B5B5AE]">Actualizando…</span>}
        {documento ? (
          docHref ? (
            <a href={docHref} target="_blank" rel="noreferrer" className="ml-auto inline-flex h-[22px] items-center gap-1 rounded-full bg-[#2C2D29] px-2 text-[11px] font-semibold text-[#F0F0EC] no-underline hover:bg-[#34352F]">
              <FileText size={11} aria-hidden />{docTexto}
            </a>
          ) : (
            <span className="ml-auto inline-flex h-[22px] items-center gap-1 rounded-full bg-[#2C2D29] px-2 text-[11px] font-semibold"><FileText size={11} aria-hidden />{docTexto}</span>
          )
        ) : (
          <span className="ml-auto text-[11px] text-[#B5B5AE]">Sin documento</span>
        )}
      </div>

      {/* Saldo */}
      <div className="flex flex-col gap-0.5 px-3.5 pb-3 pt-2">
        <span className={`text-[11px] font-semibold ${TONO_TEXTO[tarjeta.saldo.tono]}`}>{tarjeta.saldo.etiqueta}</span>
        <span className={`text-[28px] font-extrabold leading-[1.1] tabular-nums ${TONO_TEXTO[tarjeta.saldo.tono]}`} style={destelloSaldo ? { animation: "sg-destello 900ms ease-out" } : undefined}>
          {usd(tarjeta.saldo.monto)}
        </span>
        <span className="text-xs tabular-nums text-[#B5B5AE]">Total {usd(tarjeta.totalCuenta)} · pagado {usd(tarjeta.totalAbonado)}</span>
        {tarjeta.alerta && <span className="mt-1 text-xs text-[#FF7A70]">{tarjeta.alerta}</span>}
      </div>

      {/* Cargos (cerrados, agrupados) */}
      <div className="border-t border-[#2C2D29]">
        {tarjeta.grupos.length === 0 ? (
          <Empty className="items-start gap-1 p-3.5 text-left md:p-3.5">
            <EmptyDescription className="text-xs text-[#B5B5AE]">Sin cargos todavía.</EmptyDescription>
          </Empty>
        ) : (
          <button type="button" onClick={() => setCargosAbierto((v) => !v)} aria-expanded={cargosAbierto}
            className="flex w-full items-center gap-2 bg-transparent px-3.5 py-2.5 text-left text-[13px] text-[#F0F0EC] hover:bg-[#232420]">
            <ChevronRight size={13} aria-hidden className="text-[#B5B5AE] transition-transform duration-200" style={{ transform: cargosAbierto ? "rotate(90deg)" : undefined }} />
            <span className="font-semibold">Cargos</span>
            <span className="text-xs text-[#B5B5AE]">
              {tarjeta.numeroLineas === 1 ? "1 línea" : `${tarjeta.numeroLineas} líneas`}
              {tarjeta.totalDescuentos > 0.005 ? ` · −${usd(tarjeta.totalDescuentos)} desc.` : ""}
            </span>
            <span className="ml-auto font-bold tabular-nums">{usd(tarjeta.totalCuenta)}</span>
          </button>
        )}
        {cargosAbierto && tarjeta.grupos.length > 0 && (
          <div className="flex flex-col gap-2.5 pb-3 pl-[34px] pr-3.5" style={{ animation: "sg-entrada 160ms ease-out" }}>
            {tarjeta.grupos.map((g) => (
              <div key={g.clave} className="flex flex-col">
                <div className={`flex items-center gap-2 pb-1 text-[11px] font-semibold ${g.enEspera ? "text-[#78B7FF]" : "text-[#B5B5AE]"}`}>
                  <span>{g.nombre}</span>
                  <span className="ml-auto tabular-nums">{usd(g.total)}</span>
                </div>
                {g.lineas.map((l) => (
                  <CargoFila
                    key={l.id}
                    label={l.nombre}
                    origen={l.detalle}
                    precio={l.precio}
                    cargo={descontables.get(l.id) ?? null}
                    descuento={descuentos.get(l.id)}
                    editable={esAdmin && !!urlDescuentos && l.descontable}
                    abierto={descuentoAbierto === l.id}
                    destello={destello === l.id}
                    url={urlDescuentos}
                    onAbrir={() => setDescuentoAbierto(descuentoAbierto === l.id ? null : l.id)}
                    onHecho={() => {
                      setDescuentoAbierto(null);
                      setDestello(l.id);
                      setTimeout(() => setDestello((d) => (d === l.id ? null : d)), 900);
                      onCuentaCambiada();
                    }}
                  />
                ))}
              </div>
            ))}
            {tarjeta.totalDescuentos > 0.005 && (
              <div className="flex items-center text-[11px] font-semibold text-[#FFB547]">
                <span>Descuentos</span>
                <span className="ml-auto tabular-nums">−{usd(tarjeta.totalDescuentos)}</span>
              </div>
            )}
            {tarjeta.historicosReferencia.length > 0 && (
              <details className="text-xs text-[#B5B5AE]">
                <summary className="cursor-pointer">Sistema anterior · {tarjeta.historicosReferencia.length} (no suman)</summary>
                <ul className="m-0 mt-1 list-none p-0">
                  {tarjeta.historicosReferencia.map((h) => (
                    <li key={h.id} className="flex py-0.5"><span>{h.nombre}</span><span className="ml-auto tabular-nums">{usd(h.precio)}</span></li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Pagos: una sola lista */}
      <div className="border-t border-[#2C2D29]">
        <button type="button" onClick={() => setPagosAbierto((v) => !v)} aria-expanded={pagosAbierto}
          className="flex w-full items-center gap-2 bg-transparent px-3.5 py-2.5 text-left text-[13px] text-[#F0F0EC] hover:bg-[#232420]">
          <ChevronRight size={13} aria-hidden className="text-[#B5B5AE] transition-transform duration-200" style={{ transform: pagosAbierto ? "rotate(90deg)" : undefined }} />
          <span className="font-semibold">Pagos</span>
          <span className="text-xs text-[#B5B5AE]">{tarjeta.pagos.length}</span>
          <span className="ml-auto font-bold tabular-nums">{tarjeta.totalAbonado > 0.005 ? `−${usd(tarjeta.totalAbonado)}` : usd(0)}</span>
        </button>
        {pagosAbierto && (
          <div className="pb-2.5 pl-[34px] pr-3.5" style={{ animation: "sg-entrada 160ms ease-out" }}>
            {tarjeta.pagos.length === 0 ? (
              <Empty className="items-start p-0 pb-1 text-left md:p-0 md:pb-1">
                <EmptyDescription className="text-xs text-[#B5B5AE]">Sin pagos.</EmptyDescription>
              </Empty>
            ) : (
              <ItemGroup>
                {tarjeta.pagos.map((p) => {
                  const abierto = menuPago === p.id;
                  const enlaces = recordId ? enlacesComprobanteAbono(origenTipo, recordId, p.id) : null;
                  const adjunto = p.comprobantes[0] ?? null;
                  return (
                    <Item key={p.id} size="sm" className="flex-col items-stretch gap-0 rounded-none border-x-0 border-b-0 border-t border-dashed border-[#2C2D29] px-0 py-0 first:border-t-0">
                      <div className="flex items-center gap-2 py-1.5">
                        <span className="w-11 shrink-0 text-xs text-[#B5B5AE]" title={p.fecha ?? undefined}>{fechaCorta(p.fecha)}</span>
                        <ItemContent className="min-w-0 gap-0">
                          <ItemTitle className="w-auto gap-1.5 text-[13px] font-normal">
                            <span className="truncate">{p.etiqueta}</span>
                            {p.enLinea && <span className="inline-flex h-[18px] items-center rounded-full bg-[#78B7FF]/[.12] px-1.5 text-[10px] font-bold text-[#78B7FF]">En línea</span>}
                            {p.comprobantes.length > 0 && <Paperclip size={12} className="text-[#B5B5AE]" aria-label="Con comprobante" />}
                          </ItemTitle>
                          <ItemDescription className="text-[11px] text-[#B5B5AE]">{[p.numero, p.registradoPor].filter(Boolean).join(" · ")}</ItemDescription>
                        </ItemContent>
                        <span className="font-semibold tabular-nums">{usd(p.monto)}</span>
                        <ItemActions>
                          <button type="button" onClick={() => setMenuPago(abierto ? null : p.id)} aria-label="Acciones del pago" aria-expanded={abierto}
                            className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-md border bg-[#252622] text-[#F0F0EC] ${abierto ? "border-[#6A6A62]" : "border-[#3A3A36]"}`}>
                            <MoreHorizontal size={14} aria-hidden />
                          </button>
                        </ItemActions>
                      </div>
                      {abierto && (
                        <div className="flex flex-wrap items-center gap-1.5 pb-2 pl-[52px]" style={{ animation: "sg-entrada 160ms ease-out" }}>
                          {enlaces && p.monto > 0 && (
                            <>
                              <a href={enlaces.ticket} target="_blank" rel="noreferrer" className={BTN_SM}>Ticket</a>
                              <a href={enlaces.pdf} target="_blank" rel="noreferrer" className={BTN_SM}>PDF</a>
                            </>
                          )}
                          {adjunto ? (
                            onVerComprobante ? (
                              <button type="button" className={BTN_SM} onClick={() => onVerComprobante(p.id, adjunto)}>Ver comprobante</button>
                            ) : (
                              <a href={adjunto.url} target="_blank" rel="noreferrer" className={BTN_SM}>Ver comprobante</a>
                            )
                          ) : (
                            <button type="button" className={BTN_SM} disabled={subiendo === p.id}
                              onClick={() => { archivoPara.current = p.id; archivo.current?.click(); }}>
                              {subiendo === p.id ? "Subiendo…" : "Adjuntar comprobante"}
                            </button>
                          )}
                          {p.bloqueoAnular === null && (
                            <button type="button" onClick={() => setAnulando(p)}
                              className="inline-flex h-[26px] items-center rounded-md border border-[#FF5A4F]/45 bg-transparent px-2.5 text-xs font-semibold text-[#FF7A70] hover:bg-[#FF5A4F]/10">
                              Anular…
                            </button>
                          )}
                          {(p.bloqueoAnular === "documento" || p.bloqueoAnular === "en_linea" || p.bloqueoAnular === "traspaso") && (
                            <span className="text-[11px] text-[#B5B5AE]">{p.mensajeAnular}</span>
                          )}
                          {errorPago?.id === p.id && <span className="basis-full text-[11px] text-[#FF7A70]" style={{ animation: "sg-sacudir 300ms ease" }}>{errorPago.texto}</span>}
                        </div>
                      )}
                    </Item>
                  );
                })}
              </ItemGroup>
            )}
            {tarjeta.anulados.length > 0 && (
              <>
                <button type="button" onClick={() => setVerAnulados((v) => !v)} aria-expanded={verAnulados}
                  className="mt-1 bg-transparent p-0 text-xs text-[#B5B5AE] underline">
                  {tarjeta.anulados.length === 1 ? "1 anulado" : `${tarjeta.anulados.length} anulados`}
                </button>
                {verAnulados && tarjeta.anulados.map((a) => (
                  <div key={a.id} className="flex gap-2 py-1 text-xs text-[#B5B5AE]" style={{ animation: "sg-entrada 160ms ease-out" }}>
                    <span className="w-11 shrink-0">{fechaCorta(a.fecha)}</span>
                    <div className="flex min-w-0 flex-col">
                      <span className="line-through">{a.etiqueta} · {usd(a.monto)}</span>
                      <span className="text-[11px]">
                        {[a.anuladoPor ? `Anulado por ${a.anuladoPor}` : "Anulado", a.motivo].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Una acción según el momento */}
      <div className="flex flex-col gap-2 border-t border-[#2C2D29] px-3.5 py-3">
        {mensaje && <p className="m-0 text-xs text-[#56E3A4]" style={{ animation: "sg-destello 900ms ease-out" }}>{mensaje}</p>}

        {tarjeta.accion.tipo === "registrar_pago" && (
          <>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onRegistrarPago} className={BTN_MAIN}>Registrar pago · {usd(tarjeta.accion.monto)}</button>
              {recordId && (
                <CobrarEnMostrador origen={origenTipo === "orden" ? "orden" : "pedido"} id={recordId} onPagado={onCuentaCambiada}
                  estilo={{ height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid #3A3A36", background: "#252622", color: "#F0F0EC", fontSize: 12, fontWeight: 600, cursor: "pointer" }} />
              )}
              <button type="button" onClick={() => setMasAbierto((v) => !v)} aria-label="Más acciones de cobro" aria-expanded={masAbierto}
                className={`${BTN} h-9 w-9 px-0`}>
                <MoreHorizontal size={14} aria-hidden />
              </button>
            </div>
            {masAbierto && (
              <div className="flex flex-wrap items-center gap-3" style={{ animation: "sg-entrada 160ms ease-out" }}>
                {urlParteDePago && (
                  <ParteDePagoAccion url={urlParteDePago} porCobrar={tarjeta.accion.monto} onHecho={(m) => avisar(m)} />
                )}
                {hrefEmitir && <Link href={`${hrefEmitir}&tipo=proforma`} className="text-xs text-[#B5B5AE] underline">Proforma</Link>}
              </div>
            )}
            {(saldoInfo?.disponible ?? 0) > 0.01 && (
              <span className="text-xs text-[#56E3A4]">Tiene {usd(saldoInfo!.disponible)} de saldo a favor: elígelo en «Registrar pago».</span>
            )}
          </>
        )}

        {tarjeta.accion.tipo === "emitir" && hrefEmitir && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              {tarjeta.accion.bloqueo ? (
                <span aria-disabled="true" className="inline-flex h-9 flex-1 cursor-not-allowed items-center justify-center rounded-lg border border-[#3A3A36] text-[13px] font-bold text-[#6B6B66]">Emitir documento</span>
              ) : (
                <Link href={hrefEmitir} className={BTN_MAIN}>Emitir documento</Link>
              )}
              <Link href={`${hrefEmitir}&tipo=proforma`} className="text-xs text-[#B5B5AE] underline">Proforma</Link>
            </div>
            {tarjeta.accion.bloqueo && <span className="text-xs text-[#78B7FF]">{tarjeta.accion.bloqueo}</span>}
          </div>
        )}

        {tarjeta.momento === "cerrada" && documento && (
          <div className="flex items-center gap-2">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#56E3A4]/[.16]"><Check size={11} className="text-[#56E3A4]" aria-hidden /></span>
            <span className="font-semibold text-[#56E3A4]">Cuenta cerrada</span>
            {docHref && <a href={docHref} target="_blank" rel="noreferrer" className="ml-auto text-xs font-semibold">Imprimir {documento.numero}</a>}
          </div>
        )}

        {tarjeta.accion.tipo === "saldo_a_favor" && urlSaldo && (
          <SaldoAFavorAcciones url={urlSaldo} sobrante={tarjeta.accion.sobrante} info={saldoInfo} onHecho={(m) => avisar(m)} />
        )}

        {tarjeta.momento === "sin_cargos" && hrefEmitir && (
          <Link href={`${hrefEmitir}&tipo=proforma`} className="text-xs text-[#B5B5AE] underline">Proforma</Link>
        )}
      </div>

      <input ref={archivo} type="file" accept="image/*,.pdf" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          const id = archivoPara.current;
          e.target.value = "";
          if (id) void subirComprobante(id, f);
        }} />

      {anulando && (
        <AnularPagoDialog
          pago={anulando}
          saldoActual={cuenta.saldo}
          onCerrar={() => setAnulando(null)}
          onAnulado={(aviso) => { setAnulando(null); setMenuPago(null); avisar(aviso ? `Pago anulado. ${aviso}` : "Pago anulado."); }}
        />
      )}
    </section>
  );
}
