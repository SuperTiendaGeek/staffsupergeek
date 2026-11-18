"use client";

// Caja de cobro en línea — componente ÚNICO y reutilizable (punto 23 / 10D,
// 17-nov-2026). Maquetas 6a y 6b aprobadas por el dueño (lienzo "Rediseño
// Pedidos especiales", fila 10D).
//
// Cualquier pantalla la "enchufa" diciendo:
//   - opciones: lo que el cliente puede pagar (lo calcula el servidor);
//   - abrir(para): cómo pedir al servidor la cajita para esa cuenta.
// Hoy la usa el enlace del pedido especial; después, la orden de reparación
// ("Cobrar por enlace") y los enlaces de pago sueltos.
//
// Etapa D (18-nov): DeUna es el segundo botón de la MISMA caja (maqueta 8):
// en el celular abre la app DeUna; en la computadora muestra el QR. Mientras
// el cliente paga, la caja pregunta cada 5 s y muestra "¡Pago recibido!".
// "Dividir el pago entre tarjeta y DeUna" (maqueta 7a): primero la parte con
// tarjeta y luego "Completa $X con DeUna".
//
// La cajita de PayPhone (box v2.0) se dibuja DENTRO de esta página; los datos
// de la tarjeta los recibe PayPhone, nunca SUPER GEEK.

import { useEffect, useRef, useState } from "react";
import { CreditCard, Loader2, Smartphone, X } from "lucide-react";
import type { MediosPago, OpcionDePago, Pasarela, PagoVisible, ParaPago } from "@/lib/pagos-en-linea/reglas";

export type ParametrosCajitaCliente = Record<string, unknown> & { css: string; js: string };
export type CobroDeUnaCliente = { deeplink: string; qr: string; venceEn: string };
export type ResultadoAbrirCliente =
  | { ok: true; codigo: string; monto: number; cajita?: ParametrosCajitaCliente; deuna?: CobroDeUnaCliente }
  | { ok: false; error: string };
/** Pide al servidor abrir un pago: qué paga, con qué pasarela y (al dividir) qué parte. */
export type AbrirCajita = (para: ParaPago, pasarela: Pasarela, parte?: number) => Promise<ResultadoAbrirCliente>;

/** El "abridor" estándar: POST a la ruta /pago del enlace (pedido u orden). */
export function crearAbridor(urlPago: string): AbrirCajita {
  return async (para, pasarela, parte) => {
    try {
      const r = await fetch(urlPago, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para, pasarela, ...(parte != null ? { parte } : {}) }),
      });
      const j = (await r.json()) as { success: boolean; data?: { codigo: string; monto: number; cajita?: ParametrosCajitaCliente; deuna?: CobroDeUnaCliente }; error?: string };
      if (!j.success || !j.data) return { ok: false, error: j.error ?? (pasarela === "DeUna" ? "No pudimos abrir el pago con DeUna." : "No pudimos abrir el pago con tarjeta.") };
      return { ok: true, codigo: j.data.codigo, monto: j.data.monto, cajita: j.data.cajita, deuna: j.data.deuna };
    } catch {
      return { ok: false, error: "Sin conexión. Intenta de nuevo." };
    }
  };
}

type PPaymentButtonBoxCtor = new (p: Record<string, unknown>) => { render: (id: string) => void };
declare global {
  interface Window { PPaymentButtonBox?: PPaymentButtonBoxCtor }
}

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ETIQUETA: Record<ParaPago, string> = { Confirmar: "Anticipo", Todo: "Todo", "Lo que falta": "Lo que falta" };
const MARCAS = ["VISA", "Mastercard", "Diners", "Discover"];
const TODOS: MediosPago = { tarjeta: true, deuna: false };
const SEGUNDOS_CONSULTA_DEUNA = 5;
/** Al dividir: el PL de la parte con tarjeta, para decir luego "Completa $X con DeUna". */
const CLAVE_COMPLETAR = "sg-completar-deuna";

function leerSesion(k: string): string | null {
  try { return window.sessionStorage.getItem(k); } catch { return null; }
}
function guardarSesion(k: string, v: string | null) {
  try { if (v == null) window.sessionStorage.removeItem(k); else window.sessionStorage.setItem(k, v); } catch { /* sin almacenamiento */ }
}

/** Carga una sola vez el CSS y el JS de la cajita y espera a que esté lista. */
async function cargarCajita(css: string, js: string): Promise<PPaymentButtonBoxCtor> {
  if (!document.querySelector(`link[data-sg-cajita]`)) {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = css; l.dataset.sgCajita = "1";
    document.head.appendChild(l);
  }
  if (!document.querySelector(`script[data-sg-cajita]`)) {
    const s = document.createElement("script");
    s.type = "module"; s.src = js; s.dataset.sgCajita = "1";
    document.head.appendChild(s);
  }
  for (let i = 0; i < 100; i++) {
    if (window.PPaymentButtonBox) return window.PPaymentButtonBox;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("No se pudo cargar el pago seguro. Revisa tu internet e intenta de nuevo.");
}

/** "9:42" hasta que vence el QR de DeUna. */
function useCuentaRegresiva(hasta: string | null): number {
  const [restan, setRestan] = useState(0);
  useEffect(() => {
    if (!hasta) return;
    const tick = () => setRestan(Math.max(0, Math.round((Date.parse(hasta) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [hasta]);
  return restan;
}

export function CajaDeCobro({
  opciones, abrir, ultimo, pagoReciente, onAbierta, onActualizar, onPagoIniciado, titulo = "confirmar", alternativa, etiquetas, frases, autoAbrir, medios = TODOS,
}: {
  opciones: OpcionDePago[];
  abrir: AbrirCajita;
  /** Último pago en línea de esta cuenta (lo da el servidor). */
  ultimo: PagoVisible | null;
  /** Código PL que trae la URL al volver de PayPhone (para mostrar el resultado una vez). */
  pagoReciente: string | null;
  /** Avisa si la cajita está abierta (la pantalla esconde la transferencia). */
  onAbierta?: (abierta: boolean) => void;
  onActualizar?: () => void;
  /** Se abrió un pago (PL-…): la pantalla lo recuerda para mostrar "¡Pago recibido!" sin recargar (DeUna). */
  onPagoIniciado?: (codigo: string) => void;
  /** "confirmar": "Paga $X para confirmar" · "saldo": solo el botón (lo que falta). */
  titulo?: "confirmar" | "saldo";
  /** Línea bajo el botón ("o págalo en la tienda al retirar"). */
  alternativa?: string;
  /** Nombre de cada opción en el selector. En una orden, "Confirmar" se llama "Repuestos" (7a). */
  etiquetas?: Partial<Record<ParaPago, string>>;
  /** Frase sobre el botón según la opción ("para que pidamos tus repuestos"). */
  frases?: Partial<Record<ParaPago, string>>;
  /**
   * 10E-B: el cliente llegó escaneando el QR del mostrador (?cobrar=…): la
   * cajita se abre sola con esa opción (el monto lo sigue poniendo el servidor).
   */
  autoAbrir?: ParaPago | null;
  /** Qué medios se ofrecen (los enciende el servidor por separado). */
  medios?: MediosPago;
}) {
  const nombre = (p: ParaPago) => etiquetas?.[p] ?? ETIQUETA[p];
  const [para, setPara] = useState<ParaPago | null>(opciones[0]?.para ?? null);
  const [fase, setFase] = useState<"boton" | "cargando" | "cajita" | "deuna">("boton");
  const [cargandoCon, setCargandoCon] = useState<Pasarela>("PayPhone");
  const [error, setError] = useState("");
  const [deuna, setDeuna] = useState<(CobroDeUnaCliente & { codigo: string; monto: number }) | null>(null);
  const [montoTarjeta, setMontoTarjeta] = useState<number | null>(null);
  const [dividir, setDividir] = useState(false);
  const [parteTexto, setParteTexto] = useState("");
  const [esCelular, setEsCelular] = useState(false);
  const [completar, setCompletar] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const restan = useCuentaRegresiva(fase === "deuna" ? deuna?.venceEn ?? null : null);

  useEffect(() => {
    try { setEsCelular(window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900); } catch { /* sin matchMedia */ }
  }, []);
  useEffect(() => { onAbierta?.(fase !== "boton"); }, [fase, onAbierta]);
  useEffect(() => {
    if (!opciones.some((o) => o.para === para)) setPara(opciones[0]?.para ?? null);
  }, [opciones, para]);

  const elegido = opciones.find((o) => o.para === para) ?? null;
  const ambos = medios.tarjeta && medios.deuna;

  // Dividió el pago y ya pagó la parte con tarjeta: "Completa $X con DeUna" (7a).
  useEffect(() => {
    const pl = leerSesion(CLAVE_COMPLETAR);
    setCompletar(!!pl && medios.deuna && ultimo?.codigo === pl && ultimo.estado === "recibido");
  }, [ultimo, medios.deuna]);

  // Llegó desde el QR del mostrador: abrir una sola vez con esa opción.
  const autoHecho = useRef(false);
  useEffect(() => {
    if (!autoAbrir || autoHecho.current || ultimo?.estado === "sin_respuesta") return;
    const op = opciones.find((o) => o.para === autoAbrir);
    if (!op) return;
    autoHecho.current = true;
    setPara(op.para);
    void pagar(medios.tarjeta ? "PayPhone" : "DeUna", op);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAbrir, opciones, ultimo?.estado]);

  // DeUna: mientras el cliente paga se pregunta cada 5 s (y al volver a la pestaña).
  useEffect(() => {
    if (fase !== "deuna") return;
    const t = setInterval(() => onActualizar?.(), SEGUNDOS_CONSULTA_DEUNA * 1000);
    const alVolver = () => { if (document.visibilityState === "visible") onActualizar?.(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
  }, [fase, onActualizar]);
  // DeUna confirmó (o quedó en revisión / no se aprobó): se cierra el QR.
  useEffect(() => {
    if (fase !== "deuna" || !deuna || ultimo?.codigo !== deuna.codigo) return;
    if (ultimo.estado === "recibido" || ultimo.estado === "revision" || ultimo.estado === "rechazado") {
      setFase("boton");
      setDeuna(null);
      if (ultimo.estado === "recibido") { guardarSesion(CLAVE_COMPLETAR, null); setCompletar(false); }
    }
  }, [fase, deuna, ultimo]);

  const rechazoReciente = ultimo?.estado === "rechazado" && ultimo.codigo === pagoReciente;

  /** Al dividir: lo que va con tarjeta (válido entre $1 y el total menos $1). */
  const parte = (() => {
    if (!dividir || !elegido) return null;
    const n = Number(parteTexto.replace(",", "."));
    return Number.isFinite(n) && n >= 1 && n <= r2(elegido.monto - 1) ? r2(n) : null;
  })();

  async function pagar(pasarela: Pasarela, op: OpcionDePago | null = elegido, parteTarjeta?: number) {
    if (!op) return;
    setError(""); setCargandoCon(pasarela); setFase("cargando");
    try {
      const r = await abrir(op.para, pasarela, parteTarjeta);
      if (!r.ok) { setError(r.error); setFase("boton"); onActualizar?.(); return; }
      onPagoIniciado?.(r.codigo);
      if (pasarela === "DeUna") {
        if (!r.deuna) { setError("No pudimos abrir el pago con DeUna."); setFase("boton"); return; }
        setDeuna({ ...r.deuna, codigo: r.codigo, monto: r.monto });
        setFase("deuna");
        return;
      }
      if (!r.cajita) { setError("No se pudo abrir el pago seguro."); setFase("boton"); return; }
      guardarSesion(CLAVE_COMPLETAR, parteTarjeta != null ? r.codigo : null);
      setMontoTarjeta(r.monto);
      const { css, js, ...params } = r.cajita;
      const Cajita = await cargarCajita(css, js);
      setFase("cajita");
      // Se dibuja en el siguiente cuadro, cuando el contenedor ya existe.
      requestAnimationFrame(() => {
        try {
          if (contenedor.current) contenedor.current.innerHTML = "";
          new Cajita(params).render("sg-cajita-payphone");
        } catch {
          setError("No se pudo abrir el pago seguro. Intenta de nuevo.");
          setFase("boton");
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el pago seguro.");
      setFase("boton");
    }
  }

  // Volvió de PayPhone y aún no se confirma: nunca se ofrece pagar otra vez.
  if (ultimo?.estado === "sin_respuesta") {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-[#FFB547]/40 bg-[#FFB547]/10 px-3 py-3 animate-[sg-entrada_220ms_ease-out]">
        <span className="flex items-center gap-2 text-sm font-bold text-[#FFB547]">
          <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden /> Estamos confirmando tu pago
        </span>
        <span className="text-xs text-[#B5B5AE]">Si se aprobó, aparece aquí en unos minutos. No pagues otra vez.</span>
      </div>
    );
  }
  if (!elegido && fase !== "deuna") return null;

  if (fase === "deuna" && deuna) {
    const vencido = restan <= 0;
    const mmss = `${Math.floor(restan / 60)}:${String(restan % 60).padStart(2, "0")}`;
    return (
      <div className="flex flex-col gap-2.5 animate-[sg-entrada_220ms_ease-out]">
        <div className="flex items-center">
          <span className="font-bold text-[#F0F0EC]">{esCelular && deuna.deeplink ? `Pagar ${usd(deuna.monto)} con DeUna` : "Escanea con tu app DeUna"}</span>
          <button type="button" onClick={() => { setFase("boton"); setDeuna(null); }}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg bg-[#252622] px-2.5 text-xs font-semibold text-[#B5B5AE]">
            <X size={13} aria-hidden /> Cancelar
          </button>
        </div>
        {vencido ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-4 text-center">
            <span className="font-bold text-[#F0F0EC]">El código de DeUna venció</span>
            <span className="text-xs text-[#B5B5AE]">Si ya pagaste, aparecerá aquí en unos segundos. Si no, genera uno nuevo.</span>
            <button type="button" onClick={() => void pagar("DeUna", opciones.find((o) => o.monto === deuna.monto) ?? elegido)}
              className="mt-1 inline-flex h-10 items-center rounded-xl border border-[#D7FF4F] px-4 text-sm font-bold text-[#D7FF4F]">Generar otro</button>
          </div>
        ) : esCelular && deuna.deeplink ? (
          <>
            <a href={deuna.deeplink} rel="noopener noreferrer"
              className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-[#D7FF4F] font-extrabold text-[#D7FF4F] active:scale-[0.99]">
              <Smartphone size={18} aria-hidden /> Abrir DeUna
            </a>
            <span className="text-center text-xs text-[#B5B5AE]">Aprueba el pago en tu app y vuelve aquí.</span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            {deuna.qr
              ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={deuna.qr} alt={`QR de DeUna para pagar ${usd(deuna.monto)}`} width={188} height={188}
                  className="h-[188px] w-[188px] rounded-[14px] bg-white p-3" />
              )
              : <a href={deuna.deeplink} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[#D7FF4F] underline">Abrir el pago en DeUna</a>}
            <span className="text-[22px] font-black tabular-nums text-[#F0F0EC]">{usd(deuna.monto)}</span>
            <span className="text-xs tabular-nums text-[#B5B5AE]">Vence en {mmss} · SUPER GEEK</span>
          </div>
        )}
        {!vencido && (
          <div className="flex flex-col items-center gap-1 py-1 text-center" aria-live="polite">
            <span className="flex items-center gap-2 text-sm font-bold text-[#F0F0EC]">
              <Loader2 size={15} className="animate-spin text-[#D7FF4F] motion-reduce:animate-none" aria-hidden /> Esperando tu pago en DeUna…
            </span>
            <span className="text-xs text-[#B5B5AE]">Te avisamos aquí apenas DeUna lo confirme. No pagues otra vez.</span>
          </div>
        )}
      </div>
    );
  }
  if (!elegido) return null;

  const cargando = fase === "cargando";
  const deunaPrincipal = !medios.tarjeta || completar;
  const botonDeUna = (
    <button type="button" onClick={() => void pagar("DeUna")} disabled={cargando}
      className={deunaPrincipal
        ? "flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#D7FF4F] text-base font-extrabold text-[#151613] transition active:scale-[0.99] disabled:opacity-70"
        : "flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#3A3A36] bg-[#252622] text-[15px] font-bold text-[#F0F0EC] transition active:scale-[0.99] disabled:opacity-70"}>
      {cargando && cargandoCon === "DeUna"
        ? <><Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden /> Abriendo DeUna…</>
        : <><Smartphone size={18} aria-hidden /> {completar ? `Completa ${usd(elegido.monto)} con DeUna` : deunaPrincipal ? `Pagar ${usd(elegido.monto)} con DeUna` : "Pagar con DeUna"}</>}
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5">
      {fase === "cajita" ? (
        <div className="flex flex-col gap-2.5 animate-[sg-entrada_220ms_ease-out]">
          <div className="flex items-center">
            <span className="font-bold text-[#F0F0EC]">Pagar {usd(montoTarjeta ?? elegido.monto)} con tarjeta</span>
            <button type="button" onClick={() => setFase("boton")}
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg bg-[#252622] px-2.5 text-xs font-semibold text-[#B5B5AE]">
              <X size={13} aria-hidden /> Cancelar
            </button>
          </div>
          <div id="sg-cajita-payphone" ref={contenedor} className="min-h-[320px] overflow-hidden rounded-xl bg-white" />
        </div>
      ) : (
        <>
          {titulo === "confirmar" && !completar && (
            <p className="font-bold text-[#F0F0EC]">Paga {usd(elegido.monto)}{frases ? (frases[elegido.para] ? ` ${frases[elegido.para]}` : "") : elegido.para === "Confirmar" ? " para confirmar" : ""}</p>
          )}
          {completar && <p className="font-bold text-[#F0F0EC]">Completa {usd(elegido.monto)} con DeUna</p>}
          {rechazoReciente && (
            <div className="flex flex-col gap-0.5 rounded-xl border border-[#FF5A4F]/40 bg-[#FF5A4F]/10 px-3 py-2.5 animate-[sg-sacudir_300ms_ease-out]">
              <span className="text-[13px] font-bold text-[#FF7A70]">No se completó el pago</span>
              <span className="text-xs text-[#B5B5AE]">No se te cobró nada. Intenta otra vez{ambos ? ", con otra tarjeta o con DeUna" : ""}.</span>
            </div>
          )}
          {opciones.length > 1 && !dividir && (
            <div role="group" aria-label="Cuánto pagar" className="flex gap-1 rounded-xl bg-[#252622] p-1">
              {opciones.map((o) => (
                <button key={o.para} type="button" onClick={() => setPara(o.para)} aria-pressed={o.para === para}
                  className={`h-[38px] flex-1 rounded-[9px] text-[13px] font-semibold tabular-nums transition-colors ${o.para === para ? "bg-[#2E3024] text-[#D7FF4F]" : "text-[#B5B5AE]"}`}>
                  {nombre(o.para)} {usd(o.monto)}
                </button>
              ))}
            </div>
          )}

          {dividir ? (
            <div className="flex flex-col gap-2 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-3 animate-[sg-entrada_220ms_ease-out]">
              <span className="text-xs text-[#B5B5AE]">Dividir {usd(elegido.monto)}</span>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Con tarjeta</span>
                <span className="flex h-10 w-32 items-center gap-1 rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 tabular-nums">
                  $<input value={parteTexto} onChange={(e) => setParteTexto(e.target.value)} inputMode="decimal" placeholder="0"
                    aria-label="Monto con tarjeta" className="w-full bg-transparent text-[#F0F0EC] outline-none" />
                </span>
              </label>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>Con DeUna</span>
                <span className="w-32 px-2.5 text-right font-bold tabular-nums">{parte != null ? usd(r2(elegido.monto - parte)) : "—"}</span>
              </div>
              <button type="button" onClick={() => parte != null && void pagar("PayPhone", elegido, parte)} disabled={parte == null || cargando}
                className="mt-1 flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#D7FF4F] font-extrabold text-[#151613] disabled:opacity-50">
                {cargando ? <><Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden /> Abriendo pago seguro…</>
                  : <><CreditCard size={18} aria-hidden /> {parte != null ? `Pagar ${usd(parte)} con tarjeta` : "Escribe cuánto va con tarjeta"}</>}
              </button>
              {parte != null && <span className="text-center text-xs text-[#B5B5AE]">Luego pagas los {usd(r2(elegido.monto - parte))} con DeUna.</span>}
              {parte == null && parteTexto && <span className="text-center text-xs text-[#FFB547]">Entre $1 y {usd(r2(elegido.monto - 1))}.</span>}
              <button type="button" onClick={() => { setDividir(false); setParteTexto(""); }} className="text-xs font-semibold text-[#B5B5AE] underline">No dividir</button>
            </div>
          ) : (
            <>
              {medios.tarjeta && !completar && (
                <button type="button" onClick={() => void pagar("PayPhone")} disabled={cargando}
                  className={`flex items-center justify-center gap-2 rounded-2xl bg-[#D7FF4F] font-extrabold text-[#151613] transition active:scale-[0.99] disabled:opacity-70 ${titulo === "saldo" ? "h-12" : "h-[52px] text-base"}`}>
                  {cargando && cargandoCon === "PayPhone"
                    ? <><Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden /> Abriendo pago seguro…</>
                    : <><CreditCard size={18} aria-hidden /> {rechazoReciente ? "Intentar otra vez" : `Pagar ${usd(elegido.monto)} con tarjeta`}</>}
                </button>
              )}
              {medios.deuna && botonDeUna}
              {ambos && !completar && elegido.monto >= 2 && (
                <button type="button" onClick={() => setDividir(true)} className="text-xs font-semibold text-[#B5B5AE] underline">
                  Dividir el pago entre tarjeta y DeUna
                </button>
              )}
            </>
          )}
          {error && <p className="rounded-xl border border-[#FF5A4F]/40 bg-[#FF5A4F]/10 px-3 py-2 text-sm text-[#FF7A70] animate-[sg-sacudir_300ms_ease-out]">{error}</p>}
          {/* Marcas aceptadas. Pendiente: reemplazar por los logos oficiales (kit de marca de PayPhone y DeUna). */}
          <div aria-label="Medios aceptados" className="flex flex-wrap items-center justify-center gap-1.5">
            {medios.tarjeta && MARCAS.map((m) => <span key={m} className="inline-flex h-[22px] items-center rounded-[5px] bg-[#F0F0EC] px-1.5 text-[10px] font-extrabold text-[#151613]">{m}</span>)}
            {medios.tarjeta && <span className="inline-flex h-[22px] items-center rounded-[5px] border border-[#3A3A36] bg-[#2A2B27] px-1.5 text-[10px] font-extrabold text-[#F0F0EC]">PayPhone</span>}
            {medios.deuna && <span className="inline-flex h-[22px] items-center rounded-[5px] border border-[#3A3A36] bg-[#2A2B27] px-1.5 text-[10px] font-extrabold text-[#F0F0EC]">DeUna</span>}
          </div>
          {alternativa && <p className="text-center text-xs text-[#B5B5AE]">{alternativa}</p>}
        </>
      )}
    </div>
  );
}

/** "¡Pago recibido!" — se muestra una vez, al volver de PayPhone (maqueta 6a). */
export function AvisoPagoRecibido({ pago }: { pago: PagoVisible }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[#56E3A4]/45 bg-[#56E3A4]/10 px-3 py-3 animate-[sg-entrada_220ms_ease-out,sg-destello_600ms_ease-out]">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#56E3A4" strokeWidth="2.2" aria-hidden className="mt-px shrink-0"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
      <span className="flex flex-col gap-0.5">
        <span className="font-bold text-[#56E3A4]">¡Pago recibido!</span>
        <span className="text-xs tabular-nums text-[#B5B5AE]">
          {(pago.pasarela === "DeUna"
            ? [usd(pago.monto), "DeUna", pago.autorizacion ? `transf. ${pago.autorizacion}` : "", pago.codigo]
            : [usd(pago.monto), pago.tarjeta || "Saldo PayPhone", pago.autorizacion ? `aut. ${pago.autorizacion}` : "", pago.codigo]
          ).filter(Boolean).join(" · ")}
        </span>
      </span>
    </div>
  );
}

/** El pago llegó pero algo cambió mientras pagaba: el dinero está seguro y lo revisa la tienda. */
export function AvisoPagoEnRevision({ pago }: { pago: PagoVisible }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-[#FFB547]/40 bg-[#FFB547]/10 px-3 py-2.5">
      <span className="text-[13px] font-bold text-[#FFB547]">Recibimos tu pago de {usd(pago.monto)}</span>
      <span className="text-xs text-[#B5B5AE]">Lo estamos revisando y te escribimos pronto. No pagues otra vez.</span>
    </div>
  );
}
