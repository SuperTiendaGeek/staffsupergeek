"use client";

// Pagos a proveedor (auditoría Shipping V2, punto 9b · 12-oct-2026).
//
// Reglas del dueño:
// · Ningún proveedor da crédito: toda compra registrada ya se pagó; aquí se
//   registra su RESPALDO (fecha, método, cuenta, orden y comprobante opcional).
// · Se paga por CAJA (todo lo que no tiene pago, de una vez) o por artículo si
//   viaja solo. Un pago puede sumar artículos de otra caja del mismo proveedor
//   (una factura de 3R repartida en dos cajas).
// · El total = costo × unidades COMPRADAS (lo vendido no cambia lo pagado).
// · Los regalos se ven en su caja, no suman y no dejan la caja esperando.
// · Sin revisión: basta con saber quién registró cada pago.
// · Un proveedor con portal solo ve sus pagos: fecha, método, nº de transacción.
// Diseño: pantalla de uso diario, compacta (regla UX/UI del dueño, 8-oct).

import { Fragment, useMemo, useState } from "react";
import { calculateShippingV2PaymentItemSubtotal, unidadesParaPago } from "@/lib/shipping-v2/payment-calculations";
import { SHIPPING_V2_PAYMENT_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";
import { esPagoHistorico } from "@/lib/shipping-v2/pagos-situacion";
import type { ShippingV2AccessPermissions, ShippingV2Pago, ShippingV2PagoItemResumen, ShippingV2PagoPendingItem, ShippingV2PagosWorkspace } from "@/types/shipping-v2";

type Props = { initialWorkspace: ShippingV2PagosWorkspace; error: string; permissions: ShippingV2AccessPermissions | null; providerName?: string };
type Tab = "compras" | "registrados";

const METODOS = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.metodoPago.filter((m) => m !== "No aplica");
const CUENTAS = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen.filter((c) => c !== "No aplica");
const TODOS = "";

function normalize(value?: string | number | null) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function money(value: number | null | undefined) {
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
function subtotal(item: ShippingV2PagoPendingItem | ShippingV2PagoItemResumen): { valor: number | null; error: string } {
  try {
    return { valor: calculateShippingV2PaymentItemSubtotal(item), error: "" };
  } catch (e) {
    return { valor: null, error: e instanceof Error ? e.message : "Sin total" };
  }
}
function sumar(items: Array<ShippingV2PagoPendingItem | ShippingV2PagoItemResumen>) {
  return Math.round(items.reduce((s, i) => s + (subtotal(i).valor ?? 0), 0) * 100) / 100;
}
function tieneComprobante(p: ShippingV2Pago) {
  return Boolean(p.transaccionId || p.comprobante.length) || esPagoHistorico(p);
}

type Grupo = {
  key: string;
  tipo: "caja" | "suelto";
  titulo: string;
  estadoLogistico: string;
  proveedorId: string;
  proveedorNombre: string;
  items: ShippingV2PagoPendingItem[];
  regalos: ShippingV2PagoPendingItem[];
  fechaOrden: string;
};

function armarGrupos(pendientes: ShippingV2PagoPendingItem[], regalos: ShippingV2PagoPendingItem[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const item of pendientes) {
    const prov = item.proveedorId || "";
    const key = item.packingId ? `${item.packingId}|${prov}` : item.id;
    const g = mapa.get(key) ?? {
      key,
      tipo: item.packingId ? "caja" : "suelto",
      titulo: item.packingId ? item.packingIdVisible || item.packingId : item.sku,
      estadoLogistico: item.packingId ? item.packingEstado || "" : item.estado || "",
      proveedorId: prov,
      proveedorNombre: item.proveedorNombre || "Sin proveedor",
      items: [],
      regalos: [],
      fechaOrden: "",
    };
    g.items.push(item);
    if ((item.fechaRegistro || "") > g.fechaOrden) g.fechaOrden = item.fechaRegistro || "";
    mapa.set(key, g);
  }
  for (const r of regalos) {
    const g = mapa.get(`${r.packingId}|${r.proveedorId || ""}`) ?? Array.from(mapa.values()).find((x) => x.tipo === "caja" && x.key.startsWith(`${r.packingId}|`));
    if (g) g.regalos.push(r);
  }
  return Array.from(mapa.values()).sort((a, b) => b.fechaOrden.localeCompare(a.fechaOrden));
}

const chip = "whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10.5px] font-bold";
const tonos = {
  falta: `${chip} border border-yellow-300/40 text-yellow-200`,
  ok: `${chip} border border-[#D7FF4F]/40 text-[#D7FF4F]`,
  mute: `${chip} border border-[#3A3A36] text-[#A7A7A7]`,
  mal: `${chip} border border-[#FF914D]/45 text-[#FFB07A]`,
};
const campo = "h-8 rounded-md border border-[#3A3A36] bg-[#151515] px-2 text-[13px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70";
const input = `${campo} w-full`;
const label = "mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]";
const btn = "whitespace-nowrap rounded-md border border-[#3A3A36] px-2.5 py-1 text-[12px] font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-50";
const btnPrim = "whitespace-nowrap rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1 text-[12.5px] font-black text-[#151515] transition hover:brightness-105 disabled:opacity-50";

function LineaItem({ item, regalo = false, check }: { item: ShippingV2PagoPendingItem | ShippingV2PagoItemResumen; regalo?: boolean; check?: { on: boolean; toggle: () => void } }) {
  const st = subtotal(item);
  const vendido = normalize(item.estado) === "vendido";
  return (
    <div className="grid grid-cols-[20px_96px_minmax(0,1fr)_56px_84px_92px] items-center gap-2 border-t border-[#2A2B26] px-2 py-1 text-[12px] text-[#B4B5AC]">
      <span>{check ? <input type="checkbox" checked={check.on} onChange={check.toggle} aria-label={`Incluir ${item.sku}`} className="h-3.5 w-3.5 accent-[#D7FF4F]" /> : null}</span>
      <span className="font-semibold text-[#D7FF4F]">{item.sku}</span>
      <span className="truncate text-[#E6E6E1]" title={item.nombre}>{item.nombre || "—"}{vendido ? <span className={`ml-1.5 ${tonos.mute}`}>Vendido</span> : null}</span>
      <span className="text-right tabular-nums">{regalo ? "" : `${unidadesParaPago(item) ?? "?"} u`}</span>
      <span className="text-right tabular-nums">{regalo ? "" : money(item.costoProveedor)}</span>
      <span className="text-right tabular-nums">
        {regalo ? <span className={tonos.mute}>Regalo</span> : st.error ? <span className={tonos.mal} title={st.error}>Sin costo</span> : money(st.valor)}
      </span>
    </div>
  );
}

function PanelPago({ grupo, otros, regalosPorCaja, onCancel, onDone }: {
  grupo: Grupo;
  otros: Grupo[];
  regalosPorCaja: (keys: string[]) => ShippingV2PagoPendingItem[];
  onCancel: () => void;
  onDone: (mensaje: string) => Promise<void>;
}) {
  const [extra, setExtra] = useState<string[]>([]);
  const [fuera, setFuera] = useState<string[]>([]);
  const [form, setForm] = useState({ fecha: hoyLocal(), metodo: "Transferencia bancaria", cuenta: "", orden: "", transaccion: "", enlace: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const grupos = [grupo, ...otros.filter((o) => extra.includes(o.key))];
  const todos = grupos.flatMap((g) => g.items);
  const elegidos = todos.filter((i) => !fuera.includes(i.id));
  const regalos = regalosPorCaja(grupos.map((g) => g.key));
  const sinCosto = elegidos.filter((i) => subtotal(i).error);
  const total = sumar(elegidos);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function registrar() {
    setError("");
    if (!elegidos.length) return setError("Elige al menos un artículo.");
    if (sinCosto.length) return setError(`${sinCosto.map((i) => i.sku).join(", ")}: sin costo. Ponle costo en su ficha o márcalo como regalo.`);
    if (!form.fecha) return setError("Indica la fecha del pago.");
    if (!form.cuenta) return setError("Elige la cuenta.");
    setBusy(true);
    const res = await fetch("/api/shipping-v2/pagos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proveedorId: grupo.proveedorId,
        itemIds: elegidos.map((i) => i.id),
        regalosIds: regalos.map((r) => r.id),
        estadoPago: "Pagado",
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
    await onDone(`Pago ${payload.data?.pagoId ?? ""} registrado · ${money(total)}`);
  }

  return (
    <div className="border-y border-[#D7FF4F]/30 bg-[#151612] px-3 py-2">
      <div className="max-h-64 overflow-y-auto rounded-md border border-[#2A2B26]">
        {grupos.map((g) => (
          <Fragment key={g.key}>
            {grupos.length > 1 ? <div className="bg-[#1B1C19] px-2 py-0.5 text-[11px] font-bold text-[#8F908A]">{g.titulo}</div> : null}
            {g.items.map((i) => (
              <LineaItem key={i.id} item={i} check={{ on: !fuera.includes(i.id), toggle: () => setFuera((f) => (f.includes(i.id) ? f.filter((x) => x !== i.id) : [...f, i.id])) }} />
            ))}
            {g.regalos.map((r) => <LineaItem key={r.id} item={r} regalo />)}
          </Fragment>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-6">
        <label><span className={label}>Fecha</span><input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} className={input} /></label>
        <label><span className={label}>Método</span><select value={form.metodo} onChange={(e) => set("metodo", e.target.value)} className={input}>{METODOS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label><span className={label}>Cuenta</span><select value={form.cuenta} onChange={(e) => set("cuenta", e.target.value)} className={input}><option value="">—</option>{CUENTAS.map((c) => <option key={c} value={c}>{c.trim()}</option>)}</select></label>
        <label><span className={label}>Orden</span><input value={form.orden} onChange={(e) => set("orden", e.target.value)} placeholder="Opcional" className={input} /></label>
        <label><span className={label}>Nº transacción</span><input value={form.transaccion} onChange={(e) => set("transaccion", e.target.value)} placeholder="Opcional" className={input} /></label>
        <label><span className={label}>Enlace comprobante</span><input value={form.enlace} onChange={(e) => set("enlace", e.target.value)} placeholder="Opcional" className={input} /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {otros.length ? (
          <select value="" onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value])} className={`${campo} max-w-xs`} aria-label="Sumar otra caja del mismo proveedor">
            <option value="">+ Sumar otra caja o artículo de {grupo.proveedorNombre}</option>
            {otros.filter((o) => !extra.includes(o.key)).map((o) => <option key={o.key} value={o.key}>{o.titulo} · {o.items.length} art. · {money(sumar(o.items))}</option>)}
          </select>
        ) : null}
        {error ? <span className="text-[12px] text-[#FFB07A]">{error}</span> : null}
        <span className="ml-auto text-[12px] text-[#8F908A]">{elegidos.length} art.{regalos.length ? ` + ${regalos.length} regalo(s)` : ""}{!form.transaccion && !form.enlace ? " · quedará sin comprobante" : ""}</span>
        <b className="text-[15px] tabular-nums text-[#F5F5F5]">{money(total)}</b>
        <button onClick={onCancel} className={btn}>Cancelar</button>
        <button disabled={busy} onClick={() => void registrar()} className={btnPrim}>{busy ? "Guardando…" : "Registrar pago"}</button>
      </div>
    </div>
  );
}

function CompletarComprobante({ pago, onDone }: { pago: ShippingV2Pago; onDone: (m: string) => Promise<void> }) {
  const [f, setF] = useState({ orden: pago.orden || "", transaccion: pago.transaccionId || "", enlace: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function guardar() {
    setError("");
    setBusy(true);
    const res = await fetch(`/api/shipping-v2/pagos/${pago.id}/comprobante`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orden: f.orden, transaccionId: f.transaccion, comprobanteUrl: f.enlace }),
    });
    const payload = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !payload.success) return setError(String(payload.error || "No se pudo guardar."));
    await onDone(`Comprobante de ${pago.pagoId} guardado`);
  }
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="w-36"><span className={label}>Orden</span><input value={f.orden} onChange={(e) => setF({ ...f, orden: e.target.value })} className={input} /></label>
      <label className="w-44"><span className={label}>Nº transacción</span><input value={f.transaccion} onChange={(e) => setF({ ...f, transaccion: e.target.value })} className={input} /></label>
      <label className="w-64"><span className={label}>Enlace comprobante</span><input value={f.enlace} onChange={(e) => setF({ ...f, enlace: e.target.value })} className={input} /></label>
      <button disabled={busy} onClick={() => void guardar()} className={btnPrim}>{busy ? "Guardando…" : "Guardar"}</button>
      {error ? <span className="text-[12px] text-[#FFB07A]">{error}</span> : null}
    </div>
  );
}

export function ShippingV2PagosClient({ initialWorkspace, error, permissions, providerName }: Props) {
  const [ws, setWs] = useState(initialWorkspace);
  const gestiona = permissions?.canManagePayments !== false;
  const portal = Boolean(providerName && !gestiona);
  const [tab, setTab] = useState<Tab>(gestiona ? "compras" : "registrados");
  const [proveedor, setProveedor] = useState(TODOS);
  const [buscar, setBuscar] = useState("");
  const [abierto, setAbierto] = useState("");
  const [pagando, setPagando] = useState("");
  const [soloSinComprobante, setSoloSinComprobante] = useState(false);
  const [aviso, setAviso] = useState("");

  const grupos = useMemo(() => armarGrupos(ws.porPagar ?? [], ws.regalosEnCaja ?? []), [ws.porPagar, ws.regalosEnCaja]);
  const q = normalize(buscar);
  const gruposVista = grupos.filter((g) =>
    (!proveedor || g.proveedorId === proveedor) &&
    (!q || normalize([g.titulo, g.proveedorNombre, ...g.items.map((i) => `${i.sku} ${i.nombre} ${i.skuProveedor ?? ""}`)].join(" ")).includes(q))
  );
  const pagos = useMemo(
    () => [...(ws.pagosRegistrados?.length ? ws.pagosRegistrados : ws.pagos)].sort((a, b) => (b.fechaPagoReal || b.fechaCreacion || "").localeCompare(a.fechaPagoReal || a.fechaCreacion || "")),
    [ws.pagos, ws.pagosRegistrados]
  );
  const vivos = pagos.filter((p) => normalize(p.estadoPago) !== "anulado");
  const sinComprobante = vivos.filter((p) => normalize(p.estadoPago) === "pagado" && !tieneComprobante(p));
  const pagosVista = pagos.filter((p) =>
    (!proveedor || p.proveedorId === proveedor) &&
    (!soloSinComprobante || sinComprobante.includes(p)) &&
    (!q || normalize([p.pagoId, p.orden, p.transaccionId, p.proveedorNombre, p.registradoPor, ...p.itemsResumen.map((i) => i.sku)].join(" ")).includes(q))
  );
  const totalFalta = sumar(ws.porPagar ?? []);
  const proveedores = useMemo(() => {
    const m = new Map<string, string>();
    grupos.forEach((g) => g.proveedorId && m.set(g.proveedorId, g.proveedorNombre));
    pagos.forEach((p) => p.proveedorId && m.set(p.proveedorId, p.proveedorNombre || p.proveedorId));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [grupos, pagos]);

  async function recargar(mensaje: string) {
    const res = await fetch("/api/shipping-v2/pagos", { cache: "no-store" });
    const payload = await res.json().catch(() => ({}));
    if (res.ok && payload.success && payload.data) setWs(payload.data as ShippingV2PagosWorkspace);
    setPagando("");
    setAbierto("");
    setAviso(mensaje);
  }

  const tabBtn = (t: Tab, texto: string, n: number) => (
    <button key={t} onClick={() => setTab(t)} className={`h-8 border-r border-[#3A3A36] px-3 text-[13px] font-semibold last:border-r-0 ${tab === t ? "bg-[#D7FF4F] text-[#151515]" : "bg-[#151515] text-[#B4B5AC] hover:text-[#D7FF4F]"}`}>
      {texto} <span className="tabular-nums opacity-70">{n}</span>
    </button>
  );

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#2E2F28] bg-[#11120F] px-2 py-1.5">
        {gestiona ? (
          <div className="inline-flex overflow-hidden rounded-md border border-[#3A3A36]">
            {tabBtn("compras", "Compras", grupos.length)}
            {tabBtn("registrados", "Registrados", vivos.length)}
          </div>
        ) : <span className="px-1 text-[13px] font-semibold text-[#F5F5F5]">Pagos{providerName ? ` · ${providerName}` : ""}</span>}
        {!portal ? (
          <select value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={`${campo} w-48`} aria-label="Proveedor">
            <option value={TODOS}>Todos los proveedores</option>
            {proveedores.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        ) : null}
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar SKU, caja, pago, orden…" className={`${campo} min-w-[160px] flex-1`} />
        {gestiona ? (
          <span className="text-[12px] text-[#8F908A]">
            Falta respaldo <b className="tabular-nums text-[#F5F5F5]">{money(totalFalta)}</b>
            {" · "}
            <button onClick={() => { setTab("registrados"); setSoloSinComprobante(true); }} className="hover:text-[#D7FF4F]">Sin comprobante <b className="text-[#F5F5F5]">{sinComprobante.length}</b></button>
          </span>
        ) : null}
      </div>

      {error ? <div className="rounded-md border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-1.5 text-sm text-[#FFB07A]">{error}</div> : null}
      {aviso ? <div className="flex items-center rounded-md border border-[#D7FF4F]/30 bg-[#D7FF4F]/5 px-3 py-1.5 text-[13px] text-[#D7FF4F]">{aviso}<button onClick={() => setAviso("")} className="ml-auto text-[#8F908A]" aria-label="Cerrar">×</button></div> : null}

      {tab === "compras" && gestiona ? (
        <section className="overflow-x-auto rounded-lg border border-[#2E2F28] bg-[#171814]">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[22px_150px_minmax(0,1fr)_52px_100px_120px_120px] gap-2 border-b border-[#3A3A36] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">
              <span /><span>Caja / SKU</span><span>Proveedor</span><span className="text-right">Art.</span><span className="text-right">Total</span><span>Va en</span><span />
            </div>
            {gruposVista.map((g) => {
              const total = sumar(g.items);
              const faltaCosto = g.items.some((i) => subtotal(i).error);
              const abiertoAqui = abierto === g.key;
              return (
                <Fragment key={g.key}>
                  <div className="grid grid-cols-[22px_150px_minmax(0,1fr)_52px_100px_120px_120px] items-center gap-2 border-b border-[#2A2B26] px-2 py-1.5 text-[13px] hover:bg-[#1D1E1A]">
                    <button onClick={() => setAbierto(abiertoAqui ? "" : g.key)} className="text-[#8F908A] hover:text-[#D7FF4F]" aria-label={abiertoAqui ? "Ocultar artículos" : "Ver artículos"}>{abiertoAqui ? "▾" : "▸"}</button>
                    <span className={`truncate font-semibold ${g.tipo === "caja" ? "text-[#F5F5F5]" : "text-[#D7FF4F]"}`} title={g.titulo}>{g.titulo}</span>
                    <span className="truncate text-[#B4B5AC]">{g.proveedorNombre}{g.tipo === "suelto" ? <span className="text-[#6F706A]"> · {g.items[0]?.nombre}</span> : null}</span>
                    <span className="text-right tabular-nums text-[#B4B5AC]">{g.items.length}{g.regalos.length ? <span className="text-[#6F706A]">+{g.regalos.length}</span> : null}</span>
                    <span className="text-right font-semibold tabular-nums text-[#F5F5F5]">{money(total)}{faltaCosto ? <span className={`ml-1 ${tonos.mal}`} title="Hay artículos sin costo">!</span> : null}</span>
                    <span className="truncate text-[12px] text-[#8F908A]">{g.tipo === "caja" ? g.estadoLogistico || "Caja" : `Solo · ${g.estadoLogistico}`}</span>
                    <span className="text-right">
                      {pagando === g.key ? null : <button onClick={() => { setPagando(g.key); setAbierto(""); setAviso(""); }} className={btn}>Registrar pago</button>}
                    </span>
                  </div>
                  {abiertoAqui && pagando !== g.key ? (
                    <div className="bg-[#151612] px-2 pb-1">
                      {g.items.map((i) => <LineaItem key={i.id} item={i} />)}
                      {g.regalos.map((r) => <LineaItem key={r.id} item={r} regalo />)}
                    </div>
                  ) : null}
                  {pagando === g.key ? (
                    <PanelPago
                      grupo={g}
                      otros={grupos.filter((o) => o.key !== g.key && o.proveedorId === g.proveedorId)}
                      regalosPorCaja={(keys) => grupos.filter((x) => keys.includes(x.key)).flatMap((x) => x.regalos)}
                      onCancel={() => setPagando("")}
                      onDone={recargar}
                    />
                  ) : null}
                </Fragment>
              );
            })}
            {!gruposVista.length ? <p className="py-6 text-center text-[13px] text-[#8F908A]">{grupos.length ? "Nada coincide con el filtro." : "Todas las compras tienen su pago registrado."}</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "registrados" ? (
        <section className="overflow-x-auto rounded-lg border border-[#2E2F28] bg-[#171814]">
          {gestiona ? (
            <div className="flex items-center gap-2 border-b border-[#3A3A36] px-2 py-1 text-[12px]">
              <label className="flex cursor-pointer items-center gap-1.5 text-[#B4B5AC]">
                <input type="checkbox" checked={soloSinComprobante} onChange={(e) => setSoloSinComprobante(e.target.checked)} className="h-3.5 w-3.5 accent-[#D7FF4F]" />
                Solo sin comprobante ({sinComprobante.length})
              </label>
            </div>
          ) : null}
          <div className="min-w-[860px]">
            <div className={`grid ${portal ? "grid-cols-[22px_150px_130px_52px_100px_90px_130px_minmax(0,1fr)]" : "grid-cols-[22px_150px_minmax(0,1fr)_110px_52px_100px_84px_120px_100px_110px]"} gap-2 border-b border-[#3A3A36] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]`}>
              {portal
                ? <><span /><span>Pago</span><span>Orden</span><span className="text-right">Art.</span><span className="text-right">Total</span><span>Fecha</span><span>Método</span><span>Nº transacción</span></>
                : <><span /><span>Pago</span><span>Proveedor</span><span>Orden</span><span className="text-right">Art.</span><span className="text-right">Total</span><span>Fecha</span><span>Método</span><span>Comprobante</span><span>Registró</span></>}
            </div>
            {pagosVista.map((p) => {
              const abiertoAqui = abierto === p.id;
              const anulado = normalize(p.estadoPago) === "anulado";
              const pagado = normalize(p.estadoPago) === "pagado";
              return (
                <Fragment key={p.id}>
                  <div className={`grid ${portal ? "grid-cols-[22px_150px_130px_52px_100px_90px_130px_minmax(0,1fr)]" : "grid-cols-[22px_150px_minmax(0,1fr)_110px_52px_100px_84px_120px_100px_110px]"} items-center gap-2 border-b border-[#2A2B26] px-2 py-1.5 text-[13px] hover:bg-[#1D1E1A] ${anulado ? "opacity-50 line-through" : ""}`}>
                    <button onClick={() => setAbierto(abiertoAqui ? "" : p.id)} className="text-[#8F908A] hover:text-[#D7FF4F]" aria-label="Ver detalle">{abiertoAqui ? "▾" : "▸"}</button>
                    <span className="truncate font-semibold text-[#F5F5F5]" title={p.pagoId}>{p.pagoId}</span>
                    {portal ? null : <span className="truncate text-[#B4B5AC]">{p.proveedorNombre || "—"}</span>}
                    <span className="truncate text-[#B4B5AC]">{p.orden || "—"}</span>
                    <span className="text-right tabular-nums text-[#B4B5AC]">{p.cantidadItems}</span>
                    <span className="text-right font-semibold tabular-nums text-[#F5F5F5]">{money(p.totalPagado ?? p.totalAPagar)}</span>
                    <span className="text-[12px] text-[#B4B5AC]">{fecha(p.fechaPagoReal || p.fechaCreacion)}</span>
                    <span className="truncate text-[12px] text-[#B4B5AC]">{p.metodoPago && p.metodoPago !== "No aplica" ? p.metodoPago : "—"}</span>
                    {portal ? <span className="truncate text-[12px] text-[#B4B5AC]">{p.transaccionId || "—"}</span> : (
                      <span>
                        {anulado ? <span className={tonos.mute}>Anulado</span>
                          : !pagado ? <span className={tonos.falta}>{p.estadoPago}</span>
                          : esPagoHistorico(p) ? <span className={tonos.mute}>Histórico</span>
                          : tieneComprobante(p) ? <span className={tonos.ok}>✓</span>
                          : <span className={tonos.falta}>Falta</span>}
                      </span>
                    )}
                    {portal ? null : <span className="truncate text-[12px] text-[#8F908A]">{p.registradoPor || p.pagadoPor || "—"}</span>}
                  </div>
                  {abiertoAqui ? (
                    <div className="bg-[#151612] px-2 pb-2">
                      {p.itemsResumen.map((i) => <LineaItem key={i.id} item={i} />)}
                      {p.regalosResumen.map((r) => <LineaItem key={r.id} item={r} regalo />)}
                      {!portal && (p.transaccionId || p.cuentaOrigen || p.comprobante.length) ? (
                        <p className="mt-1 text-[12px] text-[#8F908A]">
                          {p.cuentaOrigen && p.cuentaOrigen !== "No aplica" ? <span className="mr-3">Cuenta: <span className="text-[#E6E6E1]">{p.cuentaOrigen.trim()}</span></span> : null}
                          {p.transaccionId ? <span className="mr-3">Transacción: <span className="text-[#E6E6E1]">{p.transaccionId}</span></span> : null}
                          {p.comprobante.map((a, n) => <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="mr-2 text-[#D7FF4F] hover:underline">Comprobante {n + 1}</a>)}
                        </p>
                      ) : null}
                      {gestiona && pagado && !tieneComprobante(p) ? <CompletarComprobante pago={p} onDone={recargar} /> : null}
                    </div>
                  ) : null}
                </Fragment>
              );
            })}
            {!pagosVista.length ? <p className="py-6 text-center text-[13px] text-[#8F908A]">No hay pagos con este filtro.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
