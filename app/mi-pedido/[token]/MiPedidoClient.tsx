"use client";

// Página del cliente para su pedido especial (punto 10A-3). Maqueta aprobada
// por el dueño el 12-nov-2026 (lienzo "Rediseño Pedidos especiales").
// Toda la lógica (qué ve, qué puede elegir, cuánto paga) vive en el servidor
// y en lib/pedidos-especiales/enlace-reglas.ts; aquí solo se muestra.
// Reglas de diseño: docs/REGLAS_UX_UI.md (compacto, claro, sin manual).

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Check, Clock, Copy, CreditCard, MapPin, MessageCircle } from "lucide-react";
import type { VistaCliente } from "@/lib/pedidos-especiales/enlace-reglas";
import type { SeguimientoCliente } from "@/lib/pedidos-especiales/seguimiento";
import { mensajeComprobante, mensajeConsulta } from "@/lib/pedidos-especiales/enlace-reglas";
import { anticipoRequerido, vigencia } from "@/lib/pedidos-especiales/reglas";
import { CONDICIONES_COMPRA } from "@/lib/pedidos-especiales/cancelacion";
import { TIENDA, whatsappTienda } from "@/lib/tienda/datos";

type Vista = VistaCliente & { producto: string; pagoTarjeta: boolean; seguimiento: SeguimientoCliente | null };

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;
const caja = "rounded-2xl border border-[#3A3A36] bg-[#1E1F1C]";

export function MiPedidoClient({ token }: { token: string }) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState("");
  const [opcion, setOpcion] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [cambiando, setCambiando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  // Punto 10C-3a: las condiciones se leen en una ventana flotante (dueño, 13-nov).
  const [condiciones, setCondiciones] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/publico/pedido/${encodeURIComponent(token)}`, { cache: "no-store" });
      const j = (await r.json()) as { success: boolean; data?: Vista; error?: string };
      if (!j.success || !j.data) { setError(j.error ?? "No pudimos cargar tu pedido."); return; }
      setVista(j.data);
      setError("");
      // Una sola opción: queda elegida. Si ya eligió antes, se parte de esa.
      setOpcion((prev) => prev ?? j.data!.elegido?.opcionId ?? (j.data!.opciones.length === 1 ? j.data!.opciones[0].id : null));
    } catch {
      setError("Sin conexión. Revisa tu internet e intenta de nuevo.");
    }
  }, [token]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function aceptar() {
    if (!vista) return;
    setEnviando(true); setAviso("");
    try {
      const r = await fetch(`/api/publico/pedido/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opcionId: opcion, huellas: vista.huellas }),
      });
      const j = (await r.json()) as { success: boolean; data?: Vista; error?: string; codigo?: string };
      if (!j.success || !j.data) {
        setAviso(j.error ?? "No pudimos guardar tu elección.");
        if (j.codigo === "CAMBIO" || j.codigo === "CERRADO" || j.codigo === "VENCIDA") void cargar();
        return;
      }
      setVista(j.data);
      setCambiando(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setAviso("Sin conexión. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  function copiarCuenta() {
    void navigator.clipboard?.writeText(TIENDA.banco.numero).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    }).catch(() => {});
  }

  if (!vista) {
    return (
      <Marco>
        {error
          ? <p className={`${caja} p-5 text-sm text-[#F0F0EC]`}>{error}</p>
          : <div className="space-y-3"><div className="h-24 animate-pulse rounded-2xl bg-[#1E1F1C]" /><div className="h-40 animate-pulse rounded-2xl bg-[#1E1F1C]" /></div>}
      </Marco>
    );
  }

  const v = vista;
  const enCotizacion = v.fase === "cotizacion" || (v.fase === "por_pagar" && cambiando);
  const vencida = vigencia(v.vence) === "vencida";
  const seleccion = v.opciones.find((o) => o.id === opcion) ?? null;
  // Sin alternativas, lo que hay se acepta completo.
  const totalSinOpciones = v.extras.reduce((s, x) => s + x.subtotal, 0);
  const resumen = seleccion
    ? { total: seleccion.total, ahora: seleccion.paraConfirmar, retirar: seleccion.alRetirar }
    : v.opciones.length === 0
      ? { total: totalSinOpciones, ahora: anticipoRequerido(totalSinOpciones), retirar: totalSinOpciones - anticipoRequerido(totalSinOpciones) }
      : null;
  const consulta = whatsappTienda(mensajeConsulta({ nombre: v.nombre, codigo: v.codigo, producto: v.producto }));

  const subtitulo: Record<typeof v.fase, string> = {
    preparando: "Estamos preparando tu cotización.",
    cotizacion: "Esta es tu cotización.",
    vencida: "Esta cotización venció.",
    por_pagar: cambiando ? "Elige otra opción." : "Elegiste tu opción. Falta tu pago.",
    confirmado: "Tu pedido está confirmado.",
    entregado: "Tu pedido fue entregado.",
    cancelado: "Este pedido fue cancelado.",
  };

  return (
    <Marco codigo={v.codigo}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#F0F0EC]">Hola{v.nombre ? `, ${v.nombre}` : ""}</h1>
        <p className="text-sm text-[#B5B5AE]">{subtitulo[v.fase]}</p>
      </div>

      {/* ── Cotización: elegir ─────────────────────────────────────────── */}
      {enCotizacion && (
        <>
          {v.textoVence && !vencida && (
            <p className="flex items-center gap-2 rounded-xl bg-[#FFB547]/10 px-3 py-2.5 text-[13px] font-semibold text-[#FFB547]">
              <Clock size={15} aria-hidden /> Precio válido hasta el {v.textoVence}
            </p>
          )}

          {v.opciones.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-xs font-semibold text-[#B5B5AE]">{v.opciones.length > 1 ? "Elige una" : "Tu producto"}</legend>
              {v.opciones.map((o) => {
                const on = o.id === opcion;
                return (
                  <button key={o.id} type="button" onClick={() => { setOpcion(o.id); setAviso(""); }} aria-pressed={on}
                    className={`flex w-full items-center gap-3 rounded-2xl border-[1.5px] p-3.5 text-left transition-colors duration-200 ${on ? "border-[#D7FF4F] bg-[#22241C]" : "border-[#3A3A36] bg-[#1E1F1C]"}`}>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold text-[#F0F0EC]">{o.descripcion}{o.cantidad > 1 ? ` ×${o.cantidad}` : ""}</span>
                      {o.tiempo && <span className="text-xs text-[#B5B5AE]">Llega en {o.tiempo}</span>}
                      {o.nota && <span className="text-xs text-[#B5B5AE]">{o.nota}</span>}
                    </span>
                    <span className="flex flex-col items-end gap-2">
                      <span className="text-[15px] font-bold tabular-nums text-[#F0F0EC]">{usd(o.subtotal)}</span>
                      <span className={`grid h-5 w-5 place-items-center rounded-full border-2 transition-colors ${on ? "border-[#D7FF4F]" : "border-[#5A5A54]"}`}>
                        {on && <span className="h-2.5 w-2.5 rounded-full bg-[#D7FF4F]" />}
                      </span>
                    </span>
                  </button>
                );
              })}
            </fieldset>
          )}

          {v.extras.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-[#B5B5AE]">{v.opciones.length ? "Incluido en tu pedido" : "Tu pedido"}</p>
              {v.extras.map((x) => (
                <div key={x.id} className={`${caja} flex items-center gap-3 px-3.5 py-2.5`}>
                  <span className="flex-1 text-sm text-[#F0F0EC]">{x.descripcion}{x.cantidad > 1 ? ` ×${x.cantidad}` : ""}{x.nota && <span className="block text-xs text-[#B5B5AE]">{x.nota}</span>}</span>
                  <span className="text-sm font-semibold tabular-nums text-[#F0F0EC]">{usd(x.subtotal)}</span>
                </div>
              ))}
            </div>
          )}

          {resumen && (
            <Resumen key={opcion ?? "todo"} total={resumen.total} filas={[
              ["Para confirmar", usd(resumen.ahora), "text-[#D7FF4F] font-bold"],
              ...(resumen.retirar > 0.009 ? [["Al retirar", usd(resumen.retirar), "font-semibold"] as [string, string, string]] : []),
            ]} />
          )}

          {aviso && <p className="rounded-xl border border-[#FF5A4F]/40 bg-[#FF5A4F]/10 px-3 py-2 text-sm text-[#FF7A70] animate-[sg-sacudir_300ms_ease-out]">{aviso}</p>}

          {!vencida && (
            <button type="button" onClick={() => void aceptar()} disabled={enviando || !resumen}
              className="h-[52px] rounded-2xl bg-[#D7FF4F] text-base font-extrabold text-[#151613] transition active:scale-[0.99] disabled:opacity-50">
              {enviando ? "Guardando…" : !resumen ? "Elige una opción" : seleccion && v.opciones.length > 1 ? `Acepto la opción ${seleccion.n}` : "Acepto"}
            </button>
          )}
          {cambiando && (
            <button type="button" onClick={() => setCambiando(false)} className="h-9 text-xs text-[#B5B5AE] underline">Volver</button>
          )}
        </>
      )}

      {/* ── Eligió: falta pagar ─────────────────────────────────────────── */}
      {v.fase === "por_pagar" && !cambiando && v.elegido && (
        <>
          <Items items={v.elegido.items} borde="border-[#56E3A4]" check />
          <Resumen total={v.pago.total} filas={[
            ...(v.pago.pagado > 0 ? [["Ya pagaste", usd(v.pago.pagado), ""] as [string, string, string]] : []),
            ["Para confirmar", usd(v.pago.faltaParaConfirmar), "text-[#D7FF4F] font-bold"],
            ...(v.pago.total - v.pago.paraConfirmar > 0.009 ? [["Al retirar", usd(v.pago.total - Math.max(v.pago.paraConfirmar, v.pago.pagado)), "font-semibold"] as [string, string, string]] : []),
          ]} />

          <section className={`${caja} flex flex-col gap-3 p-4 animate-[sg-entrada_220ms_ease-out]`}>
            <p className="font-bold text-[#F0F0EC]">Paga {usd(v.pago.faltaParaConfirmar)} para confirmar</p>
            <button type="button" disabled={!v.pagoTarjeta}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#3A3A36] bg-[#252622] font-bold text-[#F0F0EC] disabled:text-[#8E8E87]">
              <CreditCard size={17} aria-hidden /> Pagar con tarjeta · PayPhone
              {!v.pagoTarjeta && <span className="rounded-full bg-[#2A2B27] px-2 py-0.5 text-[11px] font-semibold">Pronto</span>}
            </button>
            <p className="text-center text-xs text-[#B5B5AE]">o por transferencia</p>
            <div className="flex flex-col gap-1.5 rounded-xl bg-[#252622] p-3 text-sm">
              <span className="text-xs text-[#B5B5AE]">{TIENDA.banco.nombre} · {TIENDA.banco.tipo}</span>
              <button type="button" onClick={copiarCuenta} aria-label="Copiar número de cuenta" className="flex items-center gap-2.5 text-left">
                <span className="text-[22px] font-extrabold tracking-wide tabular-nums text-[#F0F0EC]">{TIENDA.banco.numero}</span>
                <span key={String(copiado)} className={`ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-[#151613] transition-colors ${copiado ? "bg-[#56E3A4] animate-[sg-entrada_200ms_ease-out]" : "bg-[#D7FF4F]"}`}>
                  {copiado ? <><Check size={13} aria-hidden /> ¡Copiado!</> : <><Copy size={13} aria-hidden /> Copiar</>}
                </span>
              </button>
              <span className="text-[#F0F0EC]">{TIENDA.banco.titular}</span>
            </div>
            <a href={whatsappTienda(mensajeComprobante({ nombre: v.nombre, codigo: v.codigo, monto: v.pago.faltaParaConfirmar }))} target="_blank" rel="noreferrer"
              className="flex h-12 items-center justify-center rounded-xl bg-[#56E3A4] font-bold text-[#151613]">
              Enviar comprobante por WhatsApp
            </a>
            <p className="text-center text-xs text-[#B5B5AE]">O paga en la tienda.</p>
            {v.opciones.length > 1 && !vencida && (
              <button type="button" onClick={() => { setCambiando(true); setAviso(""); }} className="h-9 text-xs text-[#B5B5AE] underline">Cambiar de opción</button>
            )}
          </section>
        </>
      )}

      {/* ── Confirmado / entregado ──────────────────────────────────────── */}
      {(v.fase === "confirmado" || v.fase === "entregado") && v.elegido && (
        <>
          {v.seguimiento?.aviso && (
            <a href={consulta} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-[#FFB547]/40 bg-[#FFB547]/10 px-3.5 py-3 text-sm font-semibold text-[#FFB547] animate-[sg-entrada_220ms_ease-out]">
              <MessageCircle size={16} aria-hidden /> {v.seguimiento.aviso}
              {v.seguimiento.aviso === "Necesitamos hablar contigo" && <span className="ml-auto text-xs underline">Escríbenos</span>}
            </a>
          )}
          <section className={`${caja} flex flex-col gap-1.5 p-4`}>
            <span className="text-xs text-[#B5B5AE]">{v.nombre ? `${v.nombre}, tu` : "Tu"} pedido está</span>
            <span className="flex items-center gap-2.5 text-[26px] font-extrabold leading-tight tracking-tight text-[#D7FF4F]">
              {v.fase === "confirmado" && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#D7FF4F] animate-[sg-pulso_1.8s_ease-out_infinite]" aria-hidden />}
              {v.seguimiento?.actual?.titulo ?? (v.fase === "confirmado" ? "Confirmado" : "Entregado")}
            </span>
            <span className="text-sm text-[#B5B5AE]">
              {v.seguimiento?.llegada ? `Llega aprox. ${v.seguimiento.llegada}` : v.seguimiento?.actual?.frase ?? (v.fase === "entregado" ? "¡Gracias por tu compra!" : "")}
            </span>
          </section>
          {v.seguimiento && <LineaDeTiempo hitos={v.seguimiento.hitos} />}
          <Items items={v.elegido.items} />
          <section className={`${caja} flex flex-col gap-2 p-4 tabular-nums`}>
            <span className="font-bold text-[#F0F0EC]">Tus pagos</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#2C2D29]">
              <div className="h-full rounded-full bg-[#56E3A4] transition-[width] duration-500" style={{ width: `${v.pago.total > 0 ? Math.min(100, (v.pago.pagado / v.pago.total) * 100) : 0}%` }} />
            </div>
            <Fila k="Total" val={usd(v.pago.total)} clase="font-bold" />
            <Fila k="Pagaste" val={usd(v.pago.pagado)} />
            {v.pago.faltaTotal > 0.009 && <Fila k="Falta (al retirar)" val={usd(v.pago.faltaTotal)} clase="font-bold text-[#FFB547]" />}
          </section>
        </>
      )}

      {v.fase === "vencida" && (
        <p className={`${caja} p-4 text-sm text-[#F0F0EC]`}>Los precios del proveedor cambian rápido. Escríbenos y te la actualizamos.</p>
      )}

      {/* ── Contacto, políticas y tienda ───────────────────────────────── */}
      <a href={consulta} target="_blank" rel="noreferrer"
        className={`flex h-12 items-center justify-center gap-2 rounded-xl font-semibold ${v.fase === "vencida" ? "bg-[#56E3A4] text-[#151613]" : "border border-[#3A3A36] text-[#F0F0EC]"}`}>
        <MessageCircle size={18} aria-hidden className={v.fase === "vencida" ? "" : "text-[#56E3A4]"} /> {v.fase === "vencida" ? "Escribir a SUPER GEEK" : "¿Dudas? Escríbenos"}
      </a>

      {v.fase !== "cancelado" && (
        <button type="button" onClick={() => setCondiciones(true)} className="self-center text-[13px] font-semibold text-[#D7FF4F] underline-offset-4 hover:underline">
          Leer condiciones de compra
        </button>
      )}
      {condiciones && <CondicionesModal onCerrar={() => setCondiciones(false)} />}

      <footer className="flex flex-col gap-1 border-t border-[#2C2D29] pt-3 text-xs text-[#B5B5AE]">
        <span className="font-semibold text-[#F0F0EC]">{TIENDA.nombre}</span>
        <span>{TIENDA.direccion}, {TIENDA.ciudad}</span>
        {TIENDA.horario.map((h) => <span key={h}>{h}</span>)}
        <a href={TIENDA.mapa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#D7FF4F]"><MapPin size={13} aria-hidden /> Abrir en Maps</a>
      </footer>
    </Marco>
  );
}

function Marco({ children, codigo }: { children: React.ReactNode; codigo?: string }) {
  return (
    <main className="min-h-screen bg-[#151613] px-[18px] pb-8 pt-5 text-[#F0F0EC]">
      <div className="mx-auto flex max-w-md flex-col gap-4 animate-[sg-entrada_220ms_ease-out]">
        <header className="flex items-center gap-2.5">
          <Image src="/logo-brand.png" alt="" width={32} height={32} className="rounded-lg bg-white p-0.5" priority />
          <span className="text-[13px] font-extrabold tracking-[0.08em] text-[#D7FF4F]">SUPER GEEK</span>
          {codigo && <span className="ml-auto text-xs tabular-nums text-[#B5B5AE]">Pedido {codigo}</span>}
        </header>
        {children}
      </div>
    </main>
  );
}

function Resumen({ total, filas }: { total: number; filas: Array<[string, string, string]> }) {
  return (
    <section className={`${caja} flex flex-col gap-2 p-4 tabular-nums animate-[sg-destello_700ms_ease-out]`}>
      <div className="flex items-baseline"><span className="text-[#B5B5AE]">Total</span><span className="ml-auto text-[22px] font-extrabold text-[#F0F0EC]">{usd(total)}</span></div>
      {filas.map(([k, val, clase]) => <Fila key={k} k={k} val={val} clase={clase} />)}
    </section>
  );
}

function Fila({ k, val, clase = "" }: { k: string; val: string; clase?: string }) {
  return <div className="flex items-baseline text-sm"><span className="text-[#B5B5AE]">{k}</span><span className={`ml-auto text-[#F0F0EC] ${clase}`}>{val}</span></div>;
}

function Items({ items, borde = "border-[#3A3A36]", check = false }: { items: Array<{ id: string; descripcion: string; cantidad: number; subtotal: number }>; borde?: string; check?: boolean }) {
  return (
    <section className={`flex flex-col divide-y divide-[#2C2D29] rounded-2xl border-[1.5px] ${borde} bg-[#1E1F1C] animate-[sg-entrada_220ms_ease-out]`}>
      {items.map((x) => (
        <div key={x.id} className="flex items-center gap-3 px-3.5 py-3">
          {check && <Check size={18} className="text-[#56E3A4]" aria-hidden />}
          <span className="flex-1 text-sm font-semibold text-[#F0F0EC]">{x.descripcion}{x.cantidad > 1 ? ` ×${x.cantidad}` : ""}</span>
          <span className="text-sm tabular-nums text-[#F0F0EC]">{usd(x.subtotal)}</span>
        </div>
      ))}
    </section>
  );
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaCorta(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - 5 * 3_600_000);
  return `${d.getUTCDate()}-${MESES_CORTOS[d.getUTCMonth()]}`;
}

/** Los pasos del pedido (10B): hechos en verde, el actual late, los que faltan en gris. */
function LineaDeTiempo({ hitos }: { hitos: SeguimientoCliente["hitos"] }) {
  return (
    <ol className="flex flex-col px-1 animate-[sg-entrada_220ms_ease-out]">
      {hitos.map((h, i) => (
        <li key={h.titulo} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${h.estado === "hecho" ? "bg-[#56E3A4]" : h.estado === "actual" ? "bg-[#D7FF4F] animate-[sg-pulso_1.8s_ease-out_infinite]" : "border-2 border-[#4A4A45]"}`}>
              {h.estado === "hecho" && <Check size={11} strokeWidth={3} className="text-[#151613]" aria-hidden />}
            </span>
            {i < hitos.length - 1 && <span className={`min-h-[22px] w-0.5 flex-1 ${h.estado === "hecho" ? "bg-[#56E3A4]" : "bg-[#3A3A36]"}`} />}
          </div>
          <div className="flex flex-1 flex-col pb-4">
            <div className="flex items-baseline gap-2">
              <span className={h.estado === "actual" ? "font-bold text-[#D7FF4F]" : h.estado === "hecho" ? "text-[#F0F0EC]" : "text-[#8E8E87]"}>{h.titulo}</span>
              {h.fecha && <span className="ml-auto text-xs text-[#B5B5AE]">{fechaCorta(h.fecha)}</span>}
            </div>
            {h.estado === "actual" && <span className="text-xs text-[#B5B5AE]">{h.frase}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Condiciones de compra bajo pedido (punto 10C-3a) ────────────────────────
// Ventana flotante: en el celular sube desde abajo; se cierra tocando fuera,
// con la X o con Escape.
function CondicionesModal({ onCerrar }: { onCerrar: () => void }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-[sg-velo_160ms_ease-out] sm:items-center sm:px-4" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="condiciones-titulo"
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl border border-[#3A3A36] bg-[#1E1F1C] shadow-2xl animate-[sg-modal_220ms_ease-out] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-[#2C2D29] px-4 py-3">
          <h2 id="condiciones-titulo" className="flex-1 text-[15px] font-bold leading-snug text-[#F0F0EC]">{CONDICIONES_COMPRA.titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1 text-[#B5B5AE] hover:text-[#F0F0EC]">
            <svg width="18" height="18" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3 text-[13px] leading-relaxed text-[#B5B5AE]">
          <p>{CONDICIONES_COMPRA.intro}</p>
          {CONDICIONES_COMPRA.secciones.map((sec) => (
            <section key={sec.titulo} className="flex flex-col gap-1.5">
              <h3 className="font-semibold text-[#F0F0EC]">{sec.titulo}</h3>
              <ul className="flex list-disc flex-col gap-1.5 pl-4">
                {sec.puntos.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </section>
          ))}
          <p className="text-xs">{CONDICIONES_COMPRA.cierre}</p>
        </div>
      </div>
    </div>
  );
}
