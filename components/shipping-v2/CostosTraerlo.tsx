"use client";

// "Costos de traerlo" de UNA caja o de UN artículo que viaja solo
// (auditoría Shipping V2, punto 9c · fase 1, 14-oct-2026).
//
// Reglas del dueño:
// · Es el ÚNICO lugar donde se ven y se pagan el flete, el arancel y otros.
// · El monto nunca se escribe a mano: nunca se sabe el flete antes de pagarlo.
//   Nace del pago (crea su egreso "Logística Shipping" en Finanzas).
// · Flete → la empresa logística; Arancel → SENAE; Otros → se van sumando.
// · Manda lo pagado: el gasto queda igual al total pagado y se reparte.
// Diseño: compacto, para el uso número 100 (regla UX/UI del dueño).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SHIPPING_V2_PAYMENT_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";
import type { ShippingV2CostosTraerlo, ShippingV2SituacionGasto } from "@/types/shipping-v2";

type Concepto = "Flete" | "Arancel" | "Otros";

const METODOS = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.metodoPago.filter((m) => m !== "No aplica");
const CUENTAS = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen.filter((c) => c !== "No aplica");

const chip = "whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10.5px] font-bold";
const tonos = {
  falta: `${chip} border border-yellow-300/40 text-yellow-200`,
  ok: `${chip} border border-[#D7FF4F]/40 text-[#D7FF4F]`,
  mute: `${chip} border border-[#3A3A36] text-[#A7A7A7]`,
};
const input = "h-8 w-full rounded-md border border-[#3A3A36] bg-[#151515] px-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70";
const label = "mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]";
const btn = "whitespace-nowrap rounded-md border border-[#3A3A36] px-2.5 py-1 text-[12px] font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-50";
const btnPrim = "whitespace-nowrap rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1 text-[12.5px] font-black text-[#151515] transition hover:brightness-105 disabled:opacity-50";

export function money(value: number | null | undefined) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value ?? 0);
}
function fecha(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "2-digit" });
}
function hoyLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Estado corto de los costos de una caja o suelto (para listas). */
export function EstadoCostos({ pendiente }: { pendiente: { falta: number; sinFlete: boolean; pagado: number } }) {
  if (pendiente.falta > 0) return <span className={tonos.falta} title="Valor anotado antes, sin pago registrado">Falta {money(pendiente.falta)}</span>;
  if (pendiente.sinFlete) return <span className={tonos.falta}>Sin flete</span>;
  if (pendiente.pagado > 0) return <span className={tonos.ok}>{money(pendiente.pagado)}</span>;
  return <span className="text-[12px] text-[#5E5F59]">—</span>;
}

function PanelPago({ data, concepto, onCancel, onDone }: {
  data: ShippingV2CostosTraerlo;
  concepto: Concepto;
  onCancel: () => void;
  onDone: (mensaje: string) => void;
}) {
  const { fila } = data;
  const g = concepto === "Flete" ? fila.flete : concepto === "Arancel" ? fila.arancel : fila.otros;
  const [form, setForm] = useState({
    monto: g.pendiente > 0 ? String(g.pendiente) : "",
    proveedorId: fila.transportistaId || "",
    pagadoA: "",
    fecha: hoyLocal(),
    metodo: "Transferencia bancaria",
    cuenta: "",
    orden: "",
    transaccion: "",
    enlace: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const monto = Number(String(form.monto).replace(",", "."));
  const cambiaValor = g.valor !== null && monto > 0 && Math.abs(g.pagado + monto - g.valor) > 0.009;

  async function registrar() {
    setError("");
    if (!(monto > 0)) return setError("Escribe el monto pagado.");
    if (concepto === "Flete" && !form.proveedorId) return setError("Elige a qué empresa se pagó.");
    if (!form.fecha) return setError("Indica la fecha.");
    if (!form.cuenta) return setError("Elige la cuenta.");
    setBusy(true);
    const res = await fetch("/api/shipping-v2/pagos/logistica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        concepto,
        packingId: fila.packingId || "",
        itemId: fila.itemId || "",
        monto,
        proveedorId: concepto === "Flete" ? form.proveedorId : "",
        pagadoA: concepto === "Otros" ? form.pagadoA : "",
        fechaPagoReal: `${form.fecha}T17:00:00.000Z`,
        metodoPago: form.metodo,
        cuentaOrigen: form.cuenta,
        orden: form.orden,
        transaccionId: form.transaccion,
        comprobanteUrl: form.enlace,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !payload.success) return setError(String(payload.error || "No se pudo registrar el pago."));
    onDone(`${concepto} registrado · ${money(monto)}${payload.aviso ? `. ${payload.aviso}` : ""}`);
  }

  return (
    <div className="border-t border-[#D7FF4F]/30 bg-[#151612] px-2 py-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-8">
        <label><span className={label}>{concepto}</span><input autoFocus type="number" min="0" step="0.01" value={form.monto} onChange={(e) => set("monto", e.target.value)} placeholder="Monto" className={input} /></label>
        <label className="md:col-span-2"><span className={label}>Pagado a</span>
          {concepto === "Flete" ? (
            <select value={form.proveedorId} onChange={(e) => set("proveedorId", e.target.value)} className={input}>
              <option value="">—</option>
              {data.transportistas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          ) : concepto === "Arancel" ? <input value="SENAE" readOnly className={`${input} text-[#8F908A]`} />
            : <input value={form.pagadoA} onChange={(e) => set("pagadoA", e.target.value)} placeholder="Opcional" className={input} />}
        </label>
        <label><span className={label}>Fecha</span><input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} className={input} /></label>
        <label><span className={label}>Método</span><select value={form.metodo} onChange={(e) => set("metodo", e.target.value)} className={input}>{METODOS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label><span className={label}>Cuenta</span><select value={form.cuenta} onChange={(e) => set("cuenta", e.target.value)} className={input}><option value="">—</option>{CUENTAS.map((c) => <option key={c} value={c}>{c.trim()}</option>)}</select></label>
        <label><span className={label}>Nº transacción</span><input value={form.transaccion} onChange={(e) => set("transaccion", e.target.value)} placeholder="Opcional" className={input} /></label>
        <label><span className={label}>Enlace</span><input value={form.enlace} onChange={(e) => set("enlace", e.target.value)} placeholder="Opcional" className={input} /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {error ? <span className="text-[12px] text-[#FFB07A]">{error}</span> : null}
        <span className="ml-auto text-[12px] text-[#8F908A]">
          {[cambiaValor ? `Quedará en ${money(g.pagado + monto)}` : "", !form.transaccion && !form.enlace ? "sin comprobante" : ""].filter(Boolean).join(" · ")}
        </span>
        <button type="button" onClick={onCancel} className={btn}>Cancelar</button>
        <button type="button" disabled={busy} onClick={() => void registrar()} className={btnPrim}>{busy ? "Guardando…" : `Registrar ${concepto.toLowerCase()}`}</button>
      </div>
    </div>
  );
}

function Fila({ concepto, g, pagadoA, sinFlete, puedePagar, onPagar }: {
  concepto: Concepto;
  g: ShippingV2SituacionGasto;
  pagadoA: string;
  sinFlete: boolean;
  puedePagar: boolean;
  onPagar: () => void;
}) {
  const valor = g.valor !== null && g.valor > 0 ? g.valor : g.pagado > 0 ? g.pagado : null;
  return (
    <div className="grid grid-cols-[64px_150px_92px_minmax(0,1fr)_auto] items-center gap-2 border-t border-[#2A2B26] px-2 py-1 text-[13px]">
      <span className="font-semibold text-[#E6E6E1]">{concepto}</span>
      <span className="truncate text-[12px] text-[#8F908A]" title={pagadoA}>{pagadoA || "—"}</span>
      <span className="text-right tabular-nums text-[#F5F5F5]">{valor !== null ? money(valor) : "—"}</span>
      <span>
        {g.estado === "falta" ? <span className={tonos.falta} title="Valor anotado antes, sin pago registrado">Falta {money(g.pendiente)}</span>
          : g.estado === "pagado" ? <span className={tonos.ok}>Pagado</span>
          : sinFlete ? <span className={tonos.falta}>Sin pagar</span>
          : null}
      </span>
      <span className="text-right">
        {puedePagar ? <button type="button" onClick={onPagar} className={btn}>{g.pagado > 0 ? "+ Pago" : "Registrar pago"}</button> : null}
      </span>
    </div>
  );
}

export function CostosTraerlo({ packingId, itemId, cabecera, children, onPagado }: {
  packingId?: string;
  itemId?: string;
  /** Controles extra a la derecha del título (por ejemplo, la regla de reparto). */
  cabecera?: ReactNode;
  /** Línea de abajo (resumen de la caja, observación…). */
  children?: ReactNode;
  /** Después de registrar un pago (el gasto y su reparto cambiaron). Sin él, se recarga la página. */
  onPagado?: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<ShippingV2CostosTraerlo | null>(null);
  const [error, setError] = useState("");
  const [pagando, setPagando] = useState<Concepto | null>(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    const qs = packingId ? `packingId=${encodeURIComponent(packingId)}` : `itemId=${encodeURIComponent(itemId || "")}`;
    const res = await fetch(`/api/shipping-v2/pagos/logistica?${qs}`, { cache: "no-store" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      setError(String(payload.error || "No se pudieron cargar los costos."));
      return;
    }
    setError("");
    setData(payload.data as ShippingV2CostosTraerlo);
  }, [packingId, itemId]);

  useEffect(() => { void cargar(); }, [cargar]);

  const fila = data?.fila;
  const pagadoA = (c: Concepto) => {
    const nombres = Array.from(new Set((data?.pagos ?? []).filter((p) => p.concepto === c).map((p) => p.pagadoA).filter(Boolean)));
    if (nombres.length) return nombres.join(", ");
    if (c === "Arancel") return "SENAE";
    if (c === "Flete" && fila?.transportistaNombre) return fila.transportistaNombre;
    return "";
  };
  const total = fila ? fila.pendiente.pagado + fila.pendiente.falta : 0;

  return (
    <section id="costos" className="overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <h3 className="text-[13px] font-semibold text-[#F5F5F5]">Costos de traerlo</h3>
        {fila && total > 0 ? <span className="text-[12px] text-[#8F908A]">Total <b className="tabular-nums text-[#F5F5F5]">{money(total)}</b></span> : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">{cabecera}</div>
      </div>
      {error ? <p className="border-t border-[#2A2B26] px-2 py-2 text-[12px] text-[#FFB07A]">{error}</p> : null}
      {!data && !error ? <p className="border-t border-[#2A2B26] px-2 py-2 text-[12px] text-[#8F908A]">Cargando…</p> : null}
      {fila ? (
        <>
          {(["Flete", "Arancel", "Otros"] as Concepto[])
            .filter((c) => c !== "Arancel" || fila.aplicaArancel)
            .map((c) => (
              <div key={c}>
                <Fila
                  concepto={c}
                  g={c === "Flete" ? fila.flete : c === "Arancel" ? fila.arancel : fila.otros}
                  pagadoA={pagadoA(c)}
                  sinFlete={c === "Flete" && fila.pendiente.sinFlete}
                  puedePagar={data.puedePagar}
                  onPagar={() => { setPagando(pagando === c ? null : c); setAviso(""); }}
                />
                {pagando === c ? (
                  <PanelPago
                    data={data}
                    concepto={c}
                    onCancel={() => setPagando(null)}
                    onDone={(m) => { setPagando(null); setAviso(m); void cargar(); if (onPagado) onPagado(); else router.refresh(); }}
                  />
                ) : null}
              </div>
            ))}
          {data.pagos.length ? (
            <div className="border-t border-[#2A2B26] px-2 py-1 text-[11.5px] text-[#8F908A]">
              {data.pagos.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-x-2 py-0.5">
                  <span className="font-semibold text-[#B4B5AC]">{p.pagoId}</span>
                  <span>{fecha(p.fecha)}</span>
                  <span>{p.concepto}</span>
                  <span className="tabular-nums text-[#E6E6E1]">{money(p.monto)}</span>
                  {p.metodo ? <span>{p.metodo}</span> : null}
                  {p.conComprobante ? <span className="text-[#D7FF4F]">✓ comprobante</span> : <Link href="/shipping-v2/pagos?vista=sin-comprobante" className="text-yellow-200 hover:underline">Sin comprobante</Link>}
                  {p.registradoPor ? <span>· {p.registradoPor}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
          {aviso ? <p className="border-t border-[#2A2B26] px-2 py-1 text-[12px] text-[#D7FF4F]">{aviso}</p> : null}
        </>
      ) : null}
      {children ? <div className="border-t border-[#2A2B26] px-2 py-1.5">{children}</div> : null}
    </section>
  );
}
