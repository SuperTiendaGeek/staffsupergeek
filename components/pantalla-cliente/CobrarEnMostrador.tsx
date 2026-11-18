"use client";

// "Cobrar en el mostrador" (maqueta 7c aprobada, 10E-B). En la cuenta de la
// orden o del pedido: el empleado elige qué se cobra y lo manda a la Pantalla
// del cliente (el cliente escanea el QR y paga con tarjeta en su celular); o
// manda el enlace por WhatsApp. El abono se registra solo, por el mismo motor
// de pagos en línea. El MONTO lo calcula el servidor (calculadora única).
//
// Parte en efectivo: se registra antes con "Registrar pago" y aquí queda solo
// el resto.
//
// Etapa D (18-nov): con DeUna encendido, al mostrar el cobro se pide a DeUna
// un QR de un solo uso y la pantalla muestra los dos: tarjeta y DeUna
// (maqueta 9). El cliente escanea el de DeUna con su app y la pantalla dice
// "¡Gracias!" sola cuando DeUna lo confirma.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, MonitorSmartphone, X } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/tecnicos/whatsapp";
import { mensajeCobro, urlConCobro, type CobroEnPantalla, type OrigenCobro } from "@/lib/pantalla-cliente/reglas";
import type { OpcionDePago, ParaPago } from "@/lib/pagos-en-linea/reglas";
import type { DatosCobroMostrador } from "@/lib/pantalla-cliente/servidor";
import { usePantallaCliente } from "./usePantallaCliente";
import { useConfigPantalla } from "./useConfigPantalla";

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const ETIQUETA: Record<OrigenCobro, Record<ParaPago, string>> = {
  orden: { Confirmar: "Repuestos", Todo: "Todo", "Lo que falta": "Lo que falta" },
  pedido: { Confirmar: "Anticipo", Todo: "Todo", "Lo que falta": "Lo que falta" },
};

export function CobrarEnMostrador({ origen, id, estilo, onPagado }: {
  origen: OrigenCobro;
  id: string;
  /** Estilo del botón (el panel de la cuenta usa estilos en línea). */
  estilo?: React.CSSProperties;
  /** Se llama cuando la pantalla detecta el pago (para refrescar la cuenta). */
  onPagado?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const cfg = useConfigPantalla();
  if (!cfg?.permitido) return null;
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} style={estilo}>Cobrar en el mostrador</button>
      {abierto && <PanelCobro origen={origen} id={id} onCerrar={() => setAbierto(false)} onPagado={onPagado} />}
    </>
  );
}

function PanelCobro({ origen, id, onCerrar, onPagado }: { origen: OrigenCobro; id: string; onCerrar: () => void; onPagado?: () => void }) {
  const { conectada, estado, enviar } = usePantallaCliente();
  const [datos, setDatos] = useState<DatosCobroMostrador | null>(null);
  const [error, setError] = useState("");
  const [para, setPara] = useState<ParaPago | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);
  const [avisoDeUna, setAvisoDeUna] = useState("");
  const avisado = useRef(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pantalla-cliente/cobro?origen=${origen}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const j = (await r.json()) as { success: boolean; data?: DatosCobroMostrador; error?: string };
        if (!vivo) return;
        if (!j.success || !j.data) { setError(j.error ?? "No se pudo leer la cuenta."); return; }
        setDatos(j.data);
        // Por defecto: lo que falta para avanzar (repuestos / anticipo) o lo que falta.
        setPara(j.data.opciones[0]?.para ?? null);
      } catch { if (vivo) setError("Sin conexión. Intenta de nuevo."); }
    })();
    return () => { vivo = false; };
  }, [origen, id]);

  // La pantalla avisó el ¡Gracias! de esta cuenta: se refresca la cuenta una vez.
  const pagoAqui = estado?.vista === "gracias" && estado.cobro.origen === origen && estado.cobro.id === id ? estado : null;
  const cobrandoAqui = estado?.vista === "cobro" && estado.cobro.origen === origen && estado.cobro.id === id;
  useEffect(() => {
    if (pagoAqui && !avisado.current) { avisado.current = true; onPagado?.(); }
  }, [pagoAqui, onPagado]);

  const opcion: OpcionDePago | null = datos?.opciones.find((o) => o.para === para) ?? null;
  const url = datos && opcion ? urlConCobro(datos.enlace, opcion.para) : "";

  async function mostrar() {
    if (!datos || !opcion) return;
    setAvisoDeUna("");
    let deuna: CobroEnPantalla["deuna"] = null;
    if (datos.medios.deuna) {
      setPidiendo(true);
      try {
        const r = await fetch("/api/pantalla-cliente/cobro", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origen, id, para: opcion.para }),
        });
        const j = (await r.json()) as { success: boolean; data?: { codigo: string; qr: string; venceEn: string }; error?: string };
        if (j.success && j.data?.qr) deuna = { qr: j.data.qr, codigo: j.data.codigo, venceEn: j.data.venceEn };
        else setAvisoDeUna(j.error ?? "DeUna no respondió.");
      } catch {
        setAvisoDeUna("DeUna no respondió.");
      } finally {
        setPidiendo(false);
      }
      if (!deuna && !datos.medios.tarjeta) return;
    }
    const cobro: CobroEnPantalla = {
      origen, id, codigo: datos.codigo, cliente: datos.cliente, detalle: datos.detalle, lineas: datos.lineas,
      total: datos.total, pagado: datos.pagado, falta: datos.falta, para: opcion.para, vasAPagar: opcion.monto,
      url: datos.medios.tarjeta ? url : "", deuna,
    };
    avisado.current = false;
    enviar({ tipo: "mostrar_cobro", cobro });
  }

  function copiar() {
    if (!url) return;
    void navigator.clipboard?.writeText(url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1600); }).catch(() => {});
  }

  const whatsapp = datos && opcion
    ? buildWhatsAppUrl(datos.telefono, mensajeCobro({ nombre: datos.cliente, codigo: datos.codigo, monto: opcion.monto, url }))
      ?? `https://wa.me/?text=${encodeURIComponent(mensajeCobro({ nombre: datos.cliente, codigo: datos.codigo, monto: opcion.monto, url }))}`
    : "";

  return createPortal(
    <div className="fixed inset-0 z-[9980] grid place-items-center bg-black/60 p-4 animate-[sg-velo_200ms_ease-out]" onClick={onCerrar}>
      <section role="dialog" aria-labelledby="cobrar-mostrador" onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[380px] flex-col gap-3 rounded-xl border border-[#6A6A62] bg-[#1E1F1C] p-3.5 text-[13px] text-[#F0F0EC] shadow-2xl shadow-black/60 animate-[sg-modal_220ms_ease-out]">
        <div className="flex items-center gap-2">
          <h2 id="cobrar-mostrador" className="text-sm font-bold">Cobrar en el mostrador</h2>
          {datos && <span className="text-xs text-[#B5B5AE]">{datos.codigo}</span>}
          <button type="button" aria-label="Cerrar" onClick={onCerrar} className="ml-auto grid h-7 w-7 place-items-center rounded-lg border border-[#3A3A36] bg-[#252622]"><X size={13} /></button>
        </div>

        {error && <p className="text-xs text-[#FF7A70]">{error}</p>}
        {!datos && !error && <div className="h-24 animate-pulse rounded-lg bg-[#252622]" />}

        {datos && datos.opciones.length === 0 && (
          <p className="text-xs text-[#B5B5AE]">
            {datos.falta > 0.009 ? "El pago en línea no está disponible para esta cuenta ahora. Usa «Registrar pago»." : "La cuenta está al día."}
          </p>
        )}

        {datos && datos.opciones.length > 0 && (
          <>
            <div role="group" aria-label="Qué cobrar" className="flex gap-1 rounded-lg bg-[#252622] p-1 tabular-nums">
              {datos.opciones.map((o) => (
                <button key={o.para} type="button" onClick={() => setPara(o.para)} aria-pressed={o.para === para}
                  className={`h-8 flex-1 rounded-md text-xs font-semibold transition-colors ${o.para === para ? "bg-[#2E3024] text-[#D7FF4F]" : "text-[#B5B5AE]"}`}>
                  {ETIQUETA[origen][o.para]} {usd(o.monto)}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void mostrar()} disabled={!conectada || !opcion || pidiendo}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#D7FF4F] font-bold text-[#151613] disabled:opacity-40">
              <MonitorSmartphone size={15} aria-hidden /> {pidiendo ? "Pidiendo el QR de DeUna…" : "Mostrar en la pantalla del cliente"}
            </button>
            <p className="text-[11px] text-[#B5B5AE]">
              {datos.medios.tarjeta && datos.medios.deuna ? "Se muestran dos QR: tarjeta y DeUna." : datos.medios.deuna ? "Se muestra el QR de DeUna." : "Se muestra el QR para pagar con tarjeta."}
            </p>
            {avisoDeUna && <p className="text-xs text-[#FFB547]">{avisoDeUna}{datos.medios.tarjeta ? " Se mostró solo el QR de tarjeta." : ""}</p>}
            {!conectada && <p className="text-xs text-[#B5B5AE]">Enciende la pantalla del cliente con el botón de arriba, junto a la campanita.</p>}
            <div className="flex gap-2">
              <a href={whatsapp} target="_blank" rel="noreferrer" className="flex h-8 flex-1 items-center justify-center rounded-lg border border-[#3A3A36] bg-[#252622] text-xs font-semibold">Enviar por WhatsApp</a>
              <button type="button" onClick={copiar} className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-[#3A3A36] bg-[#252622] text-xs font-semibold">
                <Copy size={12} aria-hidden /> {copiado ? "¡Copiado!" : "Copiar enlace"}
              </button>
            </div>
            <p className="text-[11px] text-[#B5B5AE]">¿Paga una parte en efectivo? Regístrala con «Registrar pago»: aquí queda solo el resto.</p>
          </>
        )}

        {cobrandoAqui && (
          <p className="flex items-center gap-2 border-t border-[#2C2D29] pt-2.5 text-xs text-[#B5B5AE] animate-[sg-entrada_200ms_ease-out]">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#3A3A36] border-t-[#D7FF4F] motion-reduce:animate-none" aria-hidden />
            En la pantalla del cliente · esperando el pago…
          </p>
        )}
        {pagoAqui && (
          <p className="rounded-lg border border-[#56E3A4]/40 bg-[#56E3A4]/10 px-2.5 py-2 text-xs animate-[sg-entrada_200ms_ease-out,sg-destello_600ms_ease-out]">
            <b className="text-[#56E3A4]">Pagó {usd(pagoAqui.recibido)}</b> <span className="text-[#B5B5AE]">· el abono quedó registrado.</span>
          </p>
        )}
      </section>
    </div>,
    document.body,
  );
}
