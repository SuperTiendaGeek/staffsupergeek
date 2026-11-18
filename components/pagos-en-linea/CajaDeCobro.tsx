"use client";

// Caja de cobro en línea — componente ÚNICO y reutilizable (punto 23 / 10D,
// 17-nov-2026). Maquetas 6a y 6b aprobadas por el dueño (lienzo "Rediseño
// Pedidos especiales", fila 10D).
//
// Cualquier pantalla la "enchufa" diciendo:
//   - opciones: lo que el cliente puede pagar (lo calcula el servidor);
//   - abrir(para): cómo pedir al servidor la cajita para esa cuenta.
// Hoy la usa el enlace del pedido especial; después, la orden de reparación
// ("Cobrar por enlace") y los enlaces de pago sueltos. DeUna se agregará aquí
// como otra opción, con el mismo motor.
//
// La cajita de PayPhone (box v2.0) se dibuja DENTRO de esta página; los datos
// de la tarjeta los recibe PayPhone, nunca SUPER GEEK.

import { useEffect, useRef, useState } from "react";
import { CreditCard, Loader2, X } from "lucide-react";
import type { OpcionDePago, PagoVisible, ParaPago } from "@/lib/pagos-en-linea/reglas";

export type ParametrosCajitaCliente = Record<string, unknown> & { css: string; js: string };
export type AbrirCajita = (para: ParaPago) => Promise<{ ok: true; codigo: string; cajita: ParametrosCajitaCliente } | { ok: false; error: string }>;

type PPaymentButtonBoxCtor = new (p: Record<string, unknown>) => { render: (id: string) => void };
declare global {
  interface Window { PPaymentButtonBox?: PPaymentButtonBoxCtor }
}

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;
const ETIQUETA: Record<ParaPago, string> = { Confirmar: "Anticipo", Todo: "Todo", "Lo que falta": "Lo que falta" };
const MARCAS = ["VISA", "Mastercard", "Diners", "Discover"];

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

export function CajaDeCobro({
  opciones, abrir, ultimo, pagoReciente, onAbierta, onActualizar, titulo = "confirmar", alternativa, etiquetas, frases, autoAbrir,
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
}) {
  const nombre = (p: ParaPago) => etiquetas?.[p] ?? ETIQUETA[p];
  const [para, setPara] = useState<ParaPago | null>(opciones[0]?.para ?? null);
  const [fase, setFase] = useState<"boton" | "cargando" | "cajita">("boton");
  const [error, setError] = useState("");
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => { onAbierta?.(fase !== "boton"); }, [fase, onAbierta]);
  useEffect(() => {
    if (!opciones.some((o) => o.para === para)) setPara(opciones[0]?.para ?? null);
  }, [opciones, para]);

  const elegido = opciones.find((o) => o.para === para) ?? null;

  // Llegó desde el QR del mostrador: abrir una sola vez con esa opción.
  const autoHecho = useRef(false);
  useEffect(() => {
    if (!autoAbrir || autoHecho.current || ultimo?.estado === "sin_respuesta") return;
    const op = opciones.find((o) => o.para === autoAbrir);
    if (!op) return;
    autoHecho.current = true;
    setPara(op.para);
    void pagar(op);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAbrir, opciones, ultimo?.estado]);
  const rechazoReciente = ultimo?.estado === "rechazado" && ultimo.codigo === pagoReciente;

  async function pagar(op: OpcionDePago | null = elegido) {
    if (!op) return;
    setError(""); setFase("cargando");
    try {
      const r = await abrir(op.para);
      if (!r.ok) { setError(r.error); setFase("boton"); onActualizar?.(); return; }
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
          <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden /> Estamos confirmando tu pago con PayPhone
        </span>
        <span className="text-xs text-[#B5B5AE]">Si se aprobó, aparece aquí en unos minutos. No pagues otra vez.</span>
      </div>
    );
  }
  if (!elegido) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {fase === "cajita" ? (
        <div className="flex flex-col gap-2.5 animate-[sg-entrada_220ms_ease-out]">
          <div className="flex items-center">
            <span className="font-bold text-[#F0F0EC]">Pagar {usd(elegido.monto)} con tarjeta</span>
            <button type="button" onClick={() => setFase("boton")}
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg bg-[#252622] px-2.5 text-xs font-semibold text-[#B5B5AE]">
              <X size={13} aria-hidden /> Cancelar
            </button>
          </div>
          <div id="sg-cajita-payphone" ref={contenedor} className="min-h-[320px] overflow-hidden rounded-xl bg-white" />
        </div>
      ) : (
        <>
          {titulo === "confirmar" && (
            <p className="font-bold text-[#F0F0EC]">Paga {usd(elegido.monto)}{frases ? (frases[elegido.para] ? ` ${frases[elegido.para]}` : "") : elegido.para === "Confirmar" ? " para confirmar" : ""}</p>
          )}
          {rechazoReciente && (
            <div className="flex flex-col gap-0.5 rounded-xl border border-[#FF5A4F]/40 bg-[#FF5A4F]/10 px-3 py-2.5 animate-[sg-sacudir_300ms_ease-out]">
              <span className="text-[13px] font-bold text-[#FF7A70]">Tu banco no aprobó el pago</span>
              <span className="text-xs text-[#B5B5AE]">No se te cobró nada. Prueba otra tarjeta o paga por transferencia.</span>
            </div>
          )}
          {opciones.length > 1 && (
            <div role="group" aria-label="Cuánto pagar" className="flex gap-1 rounded-xl bg-[#252622] p-1">
              {opciones.map((o) => (
                <button key={o.para} type="button" onClick={() => setPara(o.para)} aria-pressed={o.para === para}
                  className={`h-[38px] flex-1 rounded-[9px] text-[13px] font-semibold tabular-nums transition-colors ${o.para === para ? "bg-[#2E3024] text-[#D7FF4F]" : "text-[#B5B5AE]"}`}>
                  {nombre(o.para)} {usd(o.monto)}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => void pagar()} disabled={fase === "cargando"}
            className={`flex items-center justify-center gap-2 rounded-2xl bg-[#D7FF4F] font-extrabold text-[#151613] transition active:scale-[0.99] disabled:opacity-70 ${titulo === "saldo" ? "h-12" : "h-[52px] text-base"}`}>
            {fase === "cargando"
              ? <><Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden /> Abriendo pago seguro…</>
              : <><CreditCard size={18} aria-hidden /> {rechazoReciente ? "Intentar otra vez" : `Pagar ${usd(elegido.monto)} con tarjeta`}</>}
          </button>
          {error && <p className="rounded-xl border border-[#FF5A4F]/40 bg-[#FF5A4F]/10 px-3 py-2 text-sm text-[#FF7A70] animate-[sg-sacudir_300ms_ease-out]">{error}</p>}
          {/* Marcas aceptadas. Pendiente: reemplazar por los logos oficiales (kit de marca de PayPhone). */}
          <div aria-label="Tarjetas aceptadas" className="flex flex-wrap items-center justify-center gap-1.5">
            {MARCAS.map((m) => <span key={m} className="inline-flex h-[22px] items-center rounded-[5px] bg-[#F0F0EC] px-1.5 text-[10px] font-extrabold text-[#151613]">{m}</span>)}
            <span className="inline-flex h-[22px] items-center rounded-[5px] border border-[#3A3A36] bg-[#2A2B27] px-1.5 text-[10px] font-extrabold text-[#F0F0EC]">PayPhone</span>
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
          {[usd(pago.monto), pago.tarjeta || "Saldo PayPhone", pago.autorizacion ? `aut. ${pago.autorizacion}` : "", pago.codigo].filter(Boolean).join(" · ")}
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
