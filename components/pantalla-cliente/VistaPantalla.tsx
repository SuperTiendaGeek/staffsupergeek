"use client";

// Lo que ve el cliente en el monitor del mostrador (maqueta 9 aprobada).
// Se dibuja SIEMPRE a 1280×800 (el Mimo Vue del mostrador) y se escala: la
// ventana del monitor la ajusta a su tamaño y el espejo de la barra la
// muestra en miniatura. Solo datos públicos (los del enlace del cliente).

import Image from "next/image";
import { Check } from "lucide-react";
import type { EstadoPantalla } from "@/lib/pantalla-cliente/reglas";
import { QrCodigo } from "./QrCodigo";

export const ANCHO_PANTALLA = 1280;
export const ALTO_PANTALLA = 800;

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const MARCAS = ["VISA", "Mastercard", "Diners", "Discover"];

export function VistaPantalla({ estado, escala = 1, animar = true, textoReposo = "Bienvenido" }: { estado: EstadoPantalla; escala?: number; animar?: boolean; textoReposo?: string }) {
  return (
    <div style={{ width: ANCHO_PANTALLA * escala, height: ALTO_PANTALLA * escala, overflow: "hidden" }}>
      <div
        style={{ width: ANCHO_PANTALLA, height: ALTO_PANTALLA, transform: `scale(${escala})`, transformOrigin: "top left" }}
        className="flex flex-col gap-5 bg-[#151613] px-8 py-7 font-sans text-[22px] text-[#F0F0EC]"
      >
        {estado.vista === "reposo" ? <Reposo animar={animar} texto={textoReposo} /> : <ConCliente estado={estado} />}
      </div>
    </div>
  );
}

function Reposo({ animar, texto }: { animar: boolean; texto: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 animate-[sg-entrada_400ms_ease-out]">
      <span className={`grid h-[220px] w-[220px] place-items-center rounded-[48px] bg-white ${animar ? "animate-[sg-respira_4s_ease-in-out_infinite]" : ""}`}>
        <Image src="/logo-brand.png" alt="SUPER GEEK" width={170} height={170} priority />
      </span>
      {texto && <span className="text-[28px] font-bold text-[#D0D0C8]">{texto}</span>}
    </div>
  );
}

function ConCliente({ estado }: { estado: Exclude<EstadoPantalla, { vista: "reposo" }> }) {
  const c = estado.cobro;
  const avance = c.total > 0 ? Math.min(100, (c.pagado / c.total) * 100) : 0;
  const pagado = estado.vista === "gracias";
  return (
    <>
      <div className="flex items-center gap-4">
        <span className="text-[22px] font-black tracking-[0.1em] text-[#D7FF4F]">SUPER GEEK</span>
        <span className="text-[19px] text-[#B5B5AE]">{c.codigo}{c.detalle ? ` · ${c.detalle}` : ""}</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[0.9fr_1.3fr] gap-5">
        {/* Izquierda: la cuenta (solo lo que el cliente debe ver). */}
        <section className="flex flex-col gap-3.5 rounded-[20px] border border-[#3A3A36] bg-[#1E1F1C] px-6 py-5 tabular-nums">
          <div className="flex flex-col">
            <span className="text-[19px] text-[#B5B5AE]">Hola,</span>
            <span className="truncate text-[36px] font-black leading-tight">{c.cliente || "cliente"}</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden border-y border-[#2C2D29] py-3.5">
            {c.lineas.slice(0, 7).map((l, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate">{l.descripcion}</span>
                <span className="w-[92px] text-right font-bold">{usd(l.monto)}</span>
              </div>
            ))}
            {c.lineas.length > 7 && <span className="text-[17px] text-[#B5B5AE]">y {c.lineas.length - 7} más…</span>}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
            <span className="text-[19px] text-[#B5B5AE]">Total</span><span className="font-extrabold">{usd(c.total)}</span>
            <span className="text-[19px] text-[#B5B5AE]">Pagaste</span><span>{usd(c.pagado)}</span>
            <span className="text-[24px] font-bold">Falta</span>
            <span className={`text-[30px] font-black ${pagado && c.falta <= 0.009 ? "text-[#56E3A4]" : "text-[#FFB547]"}`}>{usd(c.falta)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#2C2D29]">
            <div className="h-full rounded-full bg-[#56E3A4] transition-[width] duration-700" style={{ width: `${avance}%` }} />
          </div>
        </section>

        {/* Derecha: el cobro o el ¡Gracias! */}
        {estado.vista === "cobro" ? (
          <section key="cobro" className="flex flex-col items-center gap-4 rounded-[20px] border border-[#D7FF4F] bg-[#1E1F1C] px-6 py-5 animate-[sg-entrada_400ms_ease-out]">
            <div className="flex items-baseline gap-4 self-start">
              <span className="text-[28px] font-bold">Vas a pagar</span>
              <span className="text-[60px] font-black tracking-tight tabular-nums text-[#D7FF4F]">{usd(c.vasAPagar)}</span>
            </div>
            <div className="flex w-full flex-1 items-stretch justify-center gap-4">
              {c.url && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-[#252622] px-6 py-5">
                  <span className="text-[26px] font-extrabold">Con tarjeta</span>
                  <QrCodigo texto={c.url} tamano={c.deuna ? 250 : 300} etiqueta="Código QR para pagar con tarjeta" />
                  <span className="text-center text-[19px] text-[#B5B5AE]">Escanea con la cámara de tu celular</span>
                  <span className="flex flex-wrap justify-center gap-1.5">
                    {MARCAS.map((m) => <span key={m} className="inline-flex h-[26px] items-center rounded-[5px] bg-[#F0F0EC] px-2 text-[13px] font-extrabold text-[#151613]">{m}</span>)}
                    <span className="inline-flex h-[26px] items-center rounded-[5px] border border-[#3A3A36] bg-[#2A2B27] px-2 text-[13px] font-extrabold text-[#F0F0EC]">PayPhone</span>
                  </span>
                </div>
              )}
              {c.deuna && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-[#252622] px-6 py-5">
                  <span className="text-[26px] font-extrabold">Con DeUna</span>
                  {/* La imagen la genera DeUna (QR de un solo uso, vence a los 15 min). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.deuna.qr} alt="Código QR para pagar con DeUna" width={c.url ? 250 : 300} height={c.url ? 250 : 300}
                    className="rounded-[14px] bg-white p-3" style={{ width: c.url ? 250 : 300, height: c.url ? 250 : 300 }} />
                  <span className="text-center text-[19px] text-[#B5B5AE]">Escanea con tu app DeUna</span>
                  <span className="inline-flex h-[26px] items-center rounded-[5px] border border-[#3A3A36] bg-[#2A2B27] px-2 text-[13px] font-extrabold text-[#F0F0EC]">DeUna</span>
                </div>
              )}
            </div>
            <span className="flex items-center gap-3 self-start text-[19px] text-[#B5B5AE]">
              <span className="h-[22px] w-[22px] animate-spin rounded-full border-[3px] border-[#3A3A36] border-t-[#D7FF4F] motion-reduce:animate-none" aria-hidden />
              Esperando tu pago… ¿Prefieres efectivo? Dilo en caja.
            </span>
          </section>
        ) : (
          <section key="gracias" className="flex flex-col items-center justify-center gap-4 rounded-[20px] border border-[#56E3A4]/60 bg-[#56E3A4]/[0.08] px-6 py-5 animate-[sg-entrada_400ms_ease-out,sg-destello_800ms_ease-out]">
            <span className="grid h-24 w-24 place-items-center rounded-full bg-[#56E3A4]"><Check size={52} strokeWidth={2.6} className="text-[#151613]" aria-hidden /></span>
            <span className="text-[44px] font-black">¡Gracias{c.cliente ? `, ${c.cliente}` : ""}!</span>
            <span className="text-[24px] tabular-nums text-[#D6F5E6]">
              Recibimos {usd(estado.recibido)}.{c.falta <= 0.009 ? " Tu cuenta está al día." : ` Falta ${usd(c.falta)}.`}
            </span>
          </section>
        )}
      </div>
    </>
  );
}
