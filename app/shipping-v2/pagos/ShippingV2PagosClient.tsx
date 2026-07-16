"use client";

import Link from "next/link";
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { SHIPPING_V2_PAYMENT_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";
import type { ShippingV2Pago, ShippingV2PagoItemResumen, ShippingV2PagoPendingItem, ShippingV2PagoSupportCard, ShippingV2PagosWorkspace } from "@/types/shipping-v2";

type Props = { initialWorkspace: ShippingV2PagosWorkspace; error: string };
type TabKey = "pendientes" | "sin-soporte" | "registrados";

const ALL = "Todos";
const paymentMethods = [ALL, ...SHIPPING_V2_PAYMENT_SELECT_OPTIONS.metodoPago];
const supportPaymentMethods = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.metodoPago.filter((method) => method !== "No aplica");
// Fase 20.5 §4.3 — ya no se intersecta contra SHIPPING_V2_FINANCE_SELECT_OPTIONS.cuentaOrigen
// (el select legacy y congelado desde 20.1 de "Movimientos Financieros", que nunca tuvo los
// nombres de tarjeta) — se usa directo el select propio de Shipping Pagos, que el dueño ya
// cura correctamente (incluye sus tarjetas de crédito reales).
const paymentAccounts = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen.filter((account) => account !== "No aplica");
const paymentStates = [ALL, ...SHIPPING_V2_PAYMENT_SELECT_OPTIONS.estadoPago];
const financeStates = [ALL, ...SHIPPING_V2_PAYMENT_SELECT_OPTIONS.estadoIntegracionFinanzas];

function normalize(value?: string | number | null) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function normalizeSingleSelectValue(value?: string | null) {
  return String(value ?? "").trim().replace(/^"+|"+$/g, "").trim();
}

function safePaymentMethod(value?: string | null) {
  const normalized = normalizeSingleSelectValue(value);
  return SHIPPING_V2_PAYMENT_SELECT_OPTIONS.metodoPago.includes(normalized as never) && normalized !== "No aplica" ? normalized : "Transferencia bancaria";
}

// Fase 20.5 §4.3 — se compara recortando cada opción (una de las reales,
// "Tarjeta D. Supe Geek ", trae un espacio final) contra el valor ya
// recortado por normalizeSingleSelectValue, para no bloquear una selección
// válida por esa diferencia. Cuando hay match, se conserva el texto EXACTO
// de la opción (con su espacio, si lo tiene) — mismo criterio que el
// servidor, que es quien finalmente escribe el valor a Airtable.
function cuentaOrigenCanonica(normalized: string): string | undefined {
  return paymentAccounts.find((opcion) => opcion.trim() === normalized);
}

function safePaymentAccount(value?: string | null) {
  const normalized = normalizeSingleSelectValue(value);
  if (normalized === "No aplica") return "";
  return cuentaOrigenCanonica(normalized) ?? "";
}

function validatePaymentSupportForm(input: { cuentaOrigen: string }) {
  const cuentaOrigen = normalizeSingleSelectValue(input.cuentaOrigen);
  if (!cuentaOrigen || cuentaOrigen === "No aplica") return "Selecciona una cuenta origen válida antes de marcar el pago como pagado.";
  if (!cuentaOrigenCanonica(cuentaOrigen)) return "Cuenta origen no válida. Selecciona una opción existente.";
  return "";
}

function buildSearchText(parts: Array<string | number | boolean | null | undefined>) {
  return normalize(parts.filter((part) => part !== null && part !== undefined && part !== "").map(String).join(" "));
}

function buildPaymentItemSearchText(item: ShippingV2PagoPendingItem | ShippingV2PagoItemResumen) {
  return buildSearchText([
    item.id,
    item.sku,
    item.skuProveedor,
    item.nombre,
    item.tipoOperacion,
    item.estado,
    item.categoria,
    item.tipoItem,
    item.proveedorId,
    item.proveedorNombre,
    item.proveedorLogisticoId,
    item.proveedorLogisticoNombre,
    item.costoProveedor,
  ]);
}

function buildPaymentSearchText(pago: ShippingV2Pago) {
  return buildSearchText([
    pago.id,
    pago.pagoId,
    pago.proveedorId,
    pago.proveedorNombre,
    pago.estadoPago,
    pago.total,
    pago.totalAPagar,
    pago.totalPagado,
    pago.saldoPendiente,
    pago.fechaCreacion,
    pago.fechaPagoReal,
    pago.fechaVencimientoSugerida,
    pago.metodoPago,
    pago.cuentaOrigen,
    pago.transaccionId,
    pago.estadoIntegracionFinanzas,
    pago.observacion,
    pago.registradoPor,
    pago.pagadoPor,
    pago.movimientoFinanzasId,
    ...pago.movimientoFinanzasIds,
    ...pago.itemsResumen.map(buildPaymentItemSearchText),
    ...pago.regalosResumen.map(buildPaymentItemSearchText),
  ]);
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value ?? 0);
}

function dateText(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium" }).format(date);
}

function workspaceFallback(): ShippingV2PagosWorkspace {
  return {
    pagos: [],
    itemsPendientes: [],
    porPagar: [],
    pagosPendientes: [],
    pendientes: { itemsSinPago: [], pagosPendientes: [] },
    pagadosSinSoporte: [],
    sinSoporte: { itemsPagadosSinPago: [], pagosIncompletos: [] },
    pagosCompletos: [],
    pagosRegistrados: [],
    proveedores: [],
    summary: {
      totalPorPagar: 0,
      totalPagadoSinSoporte: 0,
      totalPagadoCompleto: 0,
      incompletos: 0,
      porPagarCount: 0,
      itemsSinPagoCount: 0,
      pagosPendientesCount: 0,
      pagadosSinSoporteCount: 0,
      pagosCompletosCount: 0,
    },
  };
}

function paymentSupportMissing(pago: ShippingV2Pago) {
  const metodo = normalize(pago.metodoPago);
  const cuenta = normalize(pago.cuentaOrigen);
  const finanzas = normalize(pago.estadoIntegracionFinanzas);
  const missing: string[] = [];
  if (!pago.fechaPagoReal) missing.push("Fecha real de pago");
  if (!pago.metodoPago || metodo === "no aplica") missing.push("Método de pago");
  if (metodo !== "no aplica" && (!pago.cuentaOrigen || cuenta === "no aplica")) missing.push("Cuenta origen");
  if (!pago.transaccionId && !pago.comprobante.length) missing.push("Comprobante o transacción ID");
  if (!pago.movimientoFinanzasIds.length) missing.push("Movimiento puente");
  if (!pago.estadoIntegracionFinanzas || !["pendiente de sincronizar", "sincronizado"].includes(finanzas)) missing.push("Estado Finanzas válido");
  return missing;
}

function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "lime" | "yellow" | "support" | "muted" }) {
  const toneClass = {
    lime: "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]",
    yellow: "border-yellow-300/35 bg-yellow-300/10 text-yellow-100",
    support: "border-[#FF6B6B]/35 bg-[#FF6B6B]/10 text-[#FFB4A8]",
    muted: "border-[#3A3A36] bg-[#101010] text-[#A7A7A7]",
  }[tone];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone: "lime" | "yellow" | "support" | "muted" }) {
  const toneClass = {
    lime: "text-[#D7FF4F]",
    yellow: "text-yellow-100",
    support: "text-[#FFB4A8]",
    muted: "text-[#F5F5F5]",
  }[tone];
  return (
    <article className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-2 shadow-lg shadow-black/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</p>
          <p className={`mt-0.5 text-lg font-semibold leading-none tabular-nums xl:text-xl ${toneClass}`}>{value}</p>
        </div>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#D7FF4F]" />
      </div>
    </article>
  );
}

function MissingList({ missing }: { missing: string[] }) {
  if (!missing.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {missing.map((item) => <Badge key={item} tone="support">{item}</Badge>)}
    </div>
  );
}

function DetailModal({ pago, onClose, onUpdated }: { pago: ShippingV2Pago; onClose: () => void; onUpdated: () => Promise<void> }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [paidForm, setPaidForm] = useState({
    fechaPagoReal: pago.fechaPagoReal ? pago.fechaPagoReal.slice(0, 16) : new Date().toISOString().slice(0, 16),
    metodoPago: safePaymentMethod(pago.metodoPago),
    cuentaOrigen: safePaymentAccount(pago.cuentaOrigen),
    transaccionId: pago.transaccionId || "",
    comprobanteUrl: pago.comprobante[0]?.url || "",
    observacion: pago.observacion || "",
  });
  const missing = paymentSupportMissing(pago);
  const locked = normalize(pago.estadoIntegracionFinanzas).includes("sincronizado") || normalize(pago.estadoPago).includes("anulado") || (normalize(pago.estadoPago) === "pagado" && missing.length === 0);

  async function mutate(action: "mark-paid" | "review" | "cancel", body: Record<string, unknown> = {}) {
    setBusy(action);
    setError("");
    if (action === "mark-paid") {
      const validationError = validatePaymentSupportForm(paidForm);
      if (validationError) {
        setBusy("");
        setError(validationError);
        return;
      }
    }
    const response = await fetch(`/api/shipping-v2/pagos/${pago.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      setBusy("");
      setError(String(payload.error || "No se pudo actualizar el pago."));
      return;
    }
    await onUpdated();
    setBusy("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <section className="max-h-[92vh] w-full max-w-[1800px] overflow-y-auto rounded-[1rem] border border-[#3A3A36] bg-[#1B1B1B] p-4 shadow-2xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">Detalle de pago</p>
            <h2 className="mt-1 text-2xl font-semibold text-[#F5F5F5]">{pago.pagoId}</h2>
            <p className="mt-1 text-sm text-[#A7A7A7]">{pago.proveedorNombre || "Sin proveedor"} · {money(pago.totalAPagar)}</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#F5F5F5]">Cerrar</button>
        </div>
        {error ? <p className="mt-4 rounded-[1rem] border border-[#FF914D]/35 bg-[#FF914D]/10 p-3 text-sm text-[#FFB07A]">{error}</p> : null}
        {locked ? <p className="mt-4 rounded-[1rem] border border-yellow-300/25 bg-yellow-300/10 p-3 text-sm text-yellow-100">Este pago está bloqueado por su estado o por Finanzas.</p> : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <article className="rounded-[1rem] border border-[#3A3A36] bg-[#151515] p-4">
            <h3 className="font-semibold text-[#F5F5F5]">Datos principales</h3>
            <div className="mt-3 grid gap-2 text-sm text-[#A7A7A7]">
              <p>Estado: <span className="text-[#F5F5F5]">{pago.estadoPago}</span></p>
              <p>Creación: <span className="text-[#F5F5F5]">{dateText(pago.fechaCreacion)}</span></p>
              <p>Fecha real: <span className="text-[#F5F5F5]">{dateText(pago.fechaPagoReal)}</span></p>
              <p>Finanzas: <span className="text-[#F5F5F5]">{pago.estadoIntegracionFinanzas || "-"}</span></p>
              <p>Movimiento: <span className="text-[#F5F5F5]">{pago.movimientoFinanzasId || "-"}</span></p>
            </div>
            <div className="mt-3"><MissingList missing={missing} /></div>
          </article>
          <article className="rounded-[1rem] border border-[#3A3A36] bg-[#151515] p-4">
            <h3 className="font-semibold text-[#F5F5F5]">Registrar soporte</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input aria-label="Fecha real de pago" type="datetime-local" value={paidForm.fechaPagoReal} onChange={(event) => setPaidForm((current) => ({ ...current, fechaPagoReal: event.target.value }))} className="h-10 rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5]" />
              <select aria-label="Método de pago" value={paidForm.metodoPago} onChange={(event) => setPaidForm((current) => ({ ...current, metodoPago: event.target.value }))} className="h-10 rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5]">{supportPaymentMethods.map((item) => <option key={item}>{item}</option>)}</select>
              <select aria-label="Cuenta origen" value={paidForm.cuentaOrigen} onChange={(event) => setPaidForm((current) => ({ ...current, cuentaOrigen: event.target.value }))} className="h-10 rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5]">
                <option value="">Selecciona cuenta origen</option>
                {paymentAccounts.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input value={paidForm.transaccionId} onChange={(event) => setPaidForm((current) => ({ ...current, transaccionId: event.target.value }))} placeholder="Transacción ID" className="h-10 rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5]" />
              <input value={paidForm.comprobanteUrl} onChange={(event) => setPaidForm((current) => ({ ...current, comprobanteUrl: event.target.value }))} placeholder="URL comprobante" className="h-10 rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5] sm:col-span-2" />
            </div>
          </article>
        </div>
        <article className="mt-4 rounded-[1rem] border border-[#3A3A36] bg-[#151515] p-4">
          <h3 className="font-semibold text-[#F5F5F5]">Items relacionados</h3>
          <div className="mt-3 grid gap-2">
            {pago.itemsResumen.map((item) => <p key={item.id} className="rounded-lg bg-[#101010] px-3 py-2 text-sm text-[#A7A7A7]"><span className="font-semibold text-[#D7FF4F]">{item.sku}</span> · {item.nombre} · {money(item.costoProveedor)}</p>)}
            {!pago.itemsResumen.length ? <p className="text-sm text-[#A7A7A7]">Sin items cargados.</p> : null}
          </div>
          {pago.regalosResumen.length ? <div className="mt-4"><p className="text-sm font-semibold text-[#F5F5F5]">Regalos incluidos</p>{pago.regalosResumen.map((item) => <p key={item.id} className="mt-2 rounded-lg bg-[#101010] px-3 py-2 text-sm text-[#A7A7A7]">{item.sku} · {item.nombre}</p>)}</div> : null}
        </article>
        <textarea value={paidForm.observacion} onChange={(event) => setPaidForm((current) => ({ ...current, observacion: event.target.value }))} placeholder="Observación" className="mt-4 min-h-24 w-full rounded-[1rem] border border-[#3A3A36] bg-[#101010] px-3 py-2 text-sm text-[#F5F5F5]" />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button disabled={locked || busy === "mark-paid"} onClick={() => void mutate("mark-paid", paidForm)} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] disabled:opacity-50">{busy === "mark-paid" ? "Guardando..." : normalize(pago.estadoPago) === "pagado" ? "Completar soporte" : "Registrar pago"}</button>
          <button disabled={locked || normalize(pago.estadoPago) === "pagado" || busy === "review"} onClick={() => void mutate("review")} className="rounded-full border border-yellow-300/35 px-4 py-2 text-sm font-semibold text-yellow-100 disabled:opacity-50">Enviar a revisión</button>
          <button disabled={locked || normalize(pago.estadoPago) === "pagado" || busy === "cancel"} onClick={() => void mutate("cancel", { motivo: paidForm.observacion })} className="rounded-full border border-[#FF914D]/45 px-4 py-2 text-sm font-semibold text-[#FFB07A] disabled:opacity-50">Anular</button>
        </div>
      </section>
    </div>
  );
}

function CreatePaymentModal({ selectedItems, registerPaidDefault, onClose, onCreated }: { selectedItems: ShippingV2PagoPendingItem[]; registerPaidDefault: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    observacion: "",
    fechaPagoReal: new Date().toISOString().slice(0, 16),
    metodoPago: "Transferencia bancaria",
    cuentaOrigen: "",
    transaccionId: "",
    comprobanteUrl: "",
  });
  const providerId = selectedItems[0]?.proveedorId || "";
  const providerName = selectedItems[0]?.proveedorNombre || "Sin proveedor";
  const sameProvider = selectedItems.every((item) => item.proveedorId === providerId);
  const paidItems = selectedItems.filter((item) => !item.esRegalo);
  const giftItems = selectedItems.filter((item) => item.esRegalo);
  const total = paidItems.reduce((sum, item) => sum + (item.costoProveedor ?? 0), 0);

  async function createPayment() {
    setBusy(true);
    setError("");
    if (registerPaidDefault) {
      const validationError = validatePaymentSupportForm(form);
      if (validationError) {
        setBusy(false);
        setError(validationError);
        return;
      }
    }
    const response = await fetch("/api/shipping-v2/pagos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proveedorId: providerId,
        itemIds: paidItems.map((item) => item.id),
        regalosIds: giftItems.map((item) => item.id),
        estadoPago: registerPaidDefault ? "Pagado" : "Pendiente",
        observacion: form.observacion,
        ...(registerPaidDefault ? form : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      setBusy(false);
      setError(String(payload.error || "No se pudo crear el pago."));
      return;
    }
    await onCreated();
    setBusy(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1rem] border border-[#3A3A36] bg-[#1B1B1B] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">{registerPaidDefault ? "Registrar pago ya realizado" : "Crear pago pendiente"}</p>
            <h2 className="mt-1 text-2xl font-semibold text-[#F5F5F5]">{providerName}</h2>
            <p className="mt-1 text-sm text-[#A7A7A7]">{paidItems.length} items · {money(total)}</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#F5F5F5]">Cerrar</button>
        </div>
        {error ? <p className="mt-4 rounded-[1rem] border border-[#FF914D]/35 bg-[#FF914D]/10 p-3 text-sm text-[#FFB07A]">{error}</p> : null}
        {!sameProvider || !providerId ? <p className="mt-4 rounded-[1rem] border border-[#FF914D]/35 bg-[#FF914D]/10 p-3 text-sm text-[#FFB07A]">La selección debe tener un solo proveedor válido.</p> : null}
        {!registerPaidDefault ? <p className="mt-4 rounded-[1rem] border border-yellow-300/25 bg-yellow-300/10 p-3 text-sm text-yellow-100">Este paso crea la obligación de pago. Los datos de pago real se registran cuando se pague.</p> : null}
        <div className="mt-5 grid gap-2">
          {selectedItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-1 rounded-[1rem] border border-[#3A3A36] bg-[#151515] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-[#F5F5F5]"><span className="font-semibold text-[#D7FF4F]">{item.sku}</span> · {item.nombre}</span>
              <span className="text-sm text-[#A7A7A7]">{money(item.costoProveedor)}</span>
            </div>
          ))}
        </div>
        {registerPaidDefault ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <input aria-label="Fecha real de pago" type="datetime-local" value={form.fechaPagoReal} onChange={(event) => setForm((current) => ({ ...current, fechaPagoReal: event.target.value }))} className="h-10 rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5]" />
            <select aria-label="Método de pago" value={form.metodoPago} onChange={(event) => setForm((current) => ({ ...current, metodoPago: event.target.value }))} className="h-10 rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5]">{supportPaymentMethods.map((item) => <option key={item}>{item}</option>)}</select>
            <select aria-label="Cuenta origen" value={form.cuentaOrigen} onChange={(event) => setForm((current) => ({ ...current, cuentaOrigen: event.target.value }))} className="h-10 rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5]">
              <option value="">Selecciona cuenta origen</option>
              {paymentAccounts.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <input value={form.transaccionId} onChange={(event) => setForm((current) => ({ ...current, transaccionId: event.target.value }))} placeholder="Transacción ID" className="h-10 rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5]" />
            <input value={form.comprobanteUrl} onChange={(event) => setForm((current) => ({ ...current, comprobanteUrl: event.target.value }))} placeholder="URL comprobante" className="h-10 rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5] sm:col-span-2" />
          </div>
        ) : null}
        <textarea value={form.observacion} onChange={(event) => setForm((current) => ({ ...current, observacion: event.target.value }))} placeholder="Observación" className="mt-4 min-h-24 w-full rounded-[1rem] border border-[#3A3A36] bg-[#101010] px-3 py-2 text-sm text-[#F5F5F5]" />
        <div className="mt-5 flex justify-end">
          <button disabled={busy || !sameProvider || !providerId || !selectedItems.length} onClick={() => void createPayment()} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] disabled:opacity-50">{busy ? "Guardando..." : registerPaidDefault ? "Registrar pago" : "Crear pago pendiente"}</button>
        </div>
      </section>
    </div>
  );
}

function itemMatches(item: ShippingV2PagoPendingItem, filters: FilterState) {
  if (filters.query && !buildPaymentItemSearchText(item).includes(normalize(filters.query))) return false;
  if (filters.proveedor !== ALL && item.proveedorId !== filters.proveedor) return false;
  if (filters.tipoOperacion !== ALL && item.tipoOperacion !== filters.tipoOperacion) return false;
  return true;
}

function pagoMatches(pago: ShippingV2Pago, filters: FilterState) {
  if (filters.query && !buildPaymentSearchText(pago).includes(normalize(filters.query))) return false;
  if (filters.proveedor !== ALL && pago.proveedorId !== filters.proveedor) return false;
  if (filters.estadoPago !== ALL && pago.estadoPago !== filters.estadoPago) return false;
  if (filters.metodoPago !== ALL && pago.metodoPago !== filters.metodoPago) return false;
  if (filters.estadoFinanzas !== ALL && pago.estadoIntegracionFinanzas !== filters.estadoFinanzas) return false;
  if (filters.tipoOperacion !== ALL && !pago.itemsResumen.some((item) => item.tipoOperacion === filters.tipoOperacion)) return false;
  return true;
}

type FilterState = {
  query: string;
  proveedor: string;
  estadoPago: string;
  metodoPago: string;
  estadoFinanzas: string;
  tipoOperacion: string;
};

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="min-w-0">
      <span className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#121310] px-3 text-[13px] font-semibold text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function PendingItemRow({ item, selected, onToggle }: { item: ShippingV2PagoPendingItem; selected: boolean; onToggle: () => void }) {
  const missing = [!item.proveedorId ? "Sin proveedor" : "", !item.costoProveedor ? "Sin costo" : ""].filter(Boolean);
  return (
    <tr className="border-t border-[#3A3A36]/70 hover:bg-[#20211F]">
      <td className="px-4 py-3"><input aria-label={`Seleccionar ${item.sku}`} type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 accent-[#D7FF4F]" /></td>
      <td className="px-4 py-3 font-semibold text-[#D7FF4F]">{item.sku}</td>
      <td className="px-4 py-3 text-[#F5F5F5]">{item.nombre || "-"}</td>
      <td className="px-4 py-3 text-[#A7A7A7]">{item.proveedorNombre || "-"}</td>
      <td className="px-4 py-3 text-[#A7A7A7]">{item.tipoOperacion || "-"}</td>
      <td className="px-4 py-3"><Badge tone="yellow">{item.estado || "-"}</Badge></td>
      <td className="px-4 py-3 text-[#F5F5F5]">{money(item.costoProveedor)}</td>
      <td className="px-4 py-3 text-[#A7A7A7]">{dateText(item.fechaRegistro)}</td>
      <td className="px-4 py-3"><MissingList missing={missing} /></td>
    </tr>
  );
}

function SupportItemRow({ card, selected, onToggle }: { card: Extract<ShippingV2PagoSupportCard, { kind: "item" }>; selected: boolean; onToggle: () => void }) {
  const item = card.item;
  return (
    <tr className="border-t border-[#3A3A36]/70 hover:bg-[#20211F]">
      <td className="px-4 py-3"><input aria-label={`Seleccionar ${item.sku}`} type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 accent-[#D7FF4F]" /></td>
      <td className="px-4 py-3 font-semibold text-[#FFB4A8]">{item.sku}</td>
      <td className="px-4 py-3 text-[#F5F5F5]">{item.nombre || "-"}</td>
      <td className="px-4 py-3 text-[#A7A7A7]">{item.proveedorNombre || "-"}</td>
      <td className="px-4 py-3 text-[#A7A7A7]">{item.tipoOperacion || "-"}</td>
      <td className="px-4 py-3"><Badge tone="support">Sin pago V2</Badge></td>
      <td className="px-4 py-3 text-[#F5F5F5]">{money(item.costoProveedor)}</td>
      <td className="px-4 py-3 text-[#A7A7A7]">{dateText(item.fechaRegistro)}</td>
    </tr>
  );
}

function PagoRow({ pago, expanded, onToggle, onRegister, onComplete, onDetail }: { pago: ShippingV2Pago; expanded: boolean; onToggle: () => void; onRegister: () => void; onComplete: () => void; onDetail: () => void }) {
  const missing = paymentSupportMissing(pago);
  const isPaid = normalize(pago.estadoPago) === "pagado";
  const canComplete = isPaid && missing.length > 0;
  const canRegister = ["pendiente", "borrador", "parcial"].includes(normalize(pago.estadoPago));
  return (
    <>
      <tr className="border-t border-[#3A3A36]/70 hover:bg-[#20211F]">
        <td className="px-4 py-3"><button onClick={onToggle} className="rounded-full border border-[#3A3A36] px-2 py-1 text-xs text-[#F5F5F5]">{expanded ? "Ocultar" : "Abrir"}</button></td>
        <td className="px-4 py-3 font-semibold text-[#D7FF4F]">{pago.pagoId}</td>
        <td className="px-4 py-3 text-[#A7A7A7]">{pago.proveedorNombre || "-"}</td>
        <td className="px-4 py-3"><Badge tone={isPaid ? "lime" : "yellow"}>{pago.estadoPago}</Badge></td>
        <td className="px-4 py-3 text-[#F5F5F5]">{pago.cantidadItems} / {pago.cantidadRegalos}</td>
        <td className="px-4 py-3 text-[#F5F5F5]">{money(pago.totalPagado ?? pago.totalAPagar)}</td>
        <td className="px-4 py-3 text-[#A7A7A7]">{dateText(pago.fechaCreacion)}</td>
        <td className="px-4 py-3 text-[#A7A7A7]">{dateText(pago.fechaPagoReal)}</td>
        <td className="px-4 py-3 text-[#A7A7A7]">{pago.metodoPago || "-"}</td>
        <td className="px-4 py-3 text-[#A7A7A7]">{pago.estadoIntegracionFinanzas || "-"}</td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {canRegister ? <button onClick={onRegister} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-xs font-bold text-[#151515]">Registrar pago</button> : null}
            {canComplete ? <button onClick={onComplete} className="rounded-full border border-[#FFB4A8]/45 px-3 py-1.5 text-xs font-semibold text-[#FFB4A8]">Completar soporte</button> : null}
            <button onClick={onDetail} className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#F5F5F5]">Ver detalle</button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-t border-[#3A3A36]/70 bg-[#151515]">
          <td colSpan={11} className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Items relacionados</p>
                <div className="mt-2 grid gap-2">{pago.itemsResumen.map((item) => <p key={item.id} className="rounded-lg bg-[#101010] px-3 py-2 text-sm text-[#A7A7A7]"><span className="font-semibold text-[#D7FF4F]">{item.sku}</span> · {item.nombre} · {money(item.costoProveedor)}</p>)}</div>
              </div>
              <div className="grid content-start gap-2 text-sm text-[#A7A7A7]">
                <p>Regalos: <span className="text-[#F5F5F5]">{pago.regalosResumen.map((item) => item.sku).join(", ") || "-"}</span></p>
                <p>Transacción: <span className="text-[#F5F5F5]">{pago.transaccionId || "-"}</span></p>
                <p>Movimiento Finanzas: <span className="text-[#F5F5F5]">{pago.movimientoFinanzasId || "-"}</span></p>
                <p>Comprobantes: <span className="text-[#F5F5F5]">{pago.comprobante.length}</span></p>
                <p>Observación: <span className="text-[#F5F5F5]">{pago.observacion || "-"}</span></p>
                {pago.motivoAnulacion ? <p>Motivo anulación: <span className="text-[#F5F5F5]">{pago.motivoAnulacion}</span></p> : null}
                <MissingList missing={missing} />
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function ShippingV2PagosClient({ initialWorkspace, error }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [activeTab, setActiveTab] = useState<TabKey>("pendientes");
  const [filters, setFilters] = useState<FilterState>({ query: "", proveedor: ALL, estadoPago: ALL, metodoPago: ALL, estadoFinanzas: ALL, tipoOperacion: ALL });
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [selectedSupportIds, setSelectedSupportIds] = useState<string[]>([]);
  const [createItems, setCreateItems] = useState<ShippingV2PagoPendingItem[]>([]);
  const [createPaid, setCreatePaid] = useState(false);
  const [selectedPago, setSelectedPago] = useState<ShippingV2Pago | null>(null);
  const [expandedPagoIds, setExpandedPagoIds] = useState<string[]>([]);

  const proveedores = useMemo(() => workspace.proveedores.map((item) => ({ value: item.id, label: item.nombre || item.label || item.id })), [workspace.proveedores]);
  const tipoOperacionOptions = useMemo(() => {
    const values = new Set<string>();
    [
      ...workspace.pendientes.itemsSinPago,
      ...workspace.sinSoporte.itemsPagadosSinPago.map((card) => card.item),
      ...workspace.pagos.flatMap((pago) => pago.itemsResumen),
      ...workspace.pagos.flatMap((pago) => pago.regalosResumen),
    ].forEach((item) => item.tipoOperacion && values.add(item.tipoOperacion));
    return [ALL, ...Array.from(values).sort((a, b) => a.localeCompare(b, "es"))].map((value) => ({ value, label: value }));
  }, [workspace]);

  const pendingItems = useMemo(() => workspace.pendientes.itemsSinPago.filter((item) => itemMatches(item, filters)), [filters, workspace.pendientes.itemsSinPago]);
  const pendingPayments = useMemo(() => workspace.pendientes.pagosPendientes.filter((pago) => pagoMatches(pago, filters)), [filters, workspace.pendientes.pagosPendientes]);
  const supportItems = useMemo(() => workspace.sinSoporte.itemsPagadosSinPago.filter((card) => itemMatches(card.item, filters)), [filters, workspace.sinSoporte.itemsPagadosSinPago]);
  const incompletePayments = useMemo(() => workspace.sinSoporte.pagosIncompletos.filter((card) => pagoMatches(card.pago, filters)), [filters, workspace.sinSoporte.pagosIncompletos]);
  const registeredPayments = useMemo(() => (workspace.pagosRegistrados.length ? workspace.pagosRegistrados : workspace.pagos).filter((pago) => pagoMatches(pago, filters)), [filters, workspace.pagos, workspace.pagosRegistrados]);
  const selectedPendingItems = pendingItems.filter((item) => selectedPendingIds.includes(item.id));
  const selectedSupportItems = supportItems.map((card) => card.item).filter((item) => selectedSupportIds.includes(item.id));
  const pendingProvider = selectedPendingItems[0]?.proveedorId || "";
  const supportProvider = selectedSupportItems[0]?.proveedorId || "";
  const canCreatePending = selectedPendingItems.length > 0 && selectedPendingItems.every((item) => item.proveedorId && item.proveedorId === pendingProvider);
  const canCreatePaid = selectedSupportItems.length > 0 && selectedSupportItems.every((item) => item.proveedorId && item.proveedorId === supportProvider);

  async function refreshWorkspace() {
    const response = await fetch("/api/shipping-v2/pagos", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) return;
    const fallback = workspaceFallback();
    setWorkspace({
      pagos: payload.pagos ?? [],
      itemsPendientes: payload.itemsPendientes ?? [],
      porPagar: payload.porPagar ?? [],
      pagosPendientes: payload.pagosPendientes ?? [],
      pendientes: payload.pendientes ?? fallback.pendientes,
      pagadosSinSoporte: payload.pagadosSinSoporte ?? [],
      sinSoporte: payload.sinSoporte ?? fallback.sinSoporte,
      pagosCompletos: payload.pagosCompletos ?? [],
      pagosRegistrados: payload.pagosRegistrados ?? payload.pagos ?? [],
      proveedores: payload.proveedores ?? [],
      summary: payload.summary ?? fallback.summary,
    });
    setSelectedPendingIds([]);
    setSelectedSupportIds([]);
  }

  function updateFilter(key: keyof FilterState, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

function toggleId(id: string, setter: Dispatch<SetStateAction<string[]>>) {
    setter((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function openCreate(items: ShippingV2PagoPendingItem[], paid: boolean) {
    setCreateItems(items);
    setCreatePaid(paid);
  }

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "pendientes", label: "Pendientes", count: pendingItems.length + pendingPayments.length },
    { key: "sin-soporte", label: "Sin soporte", count: supportItems.length + incompletePayments.length },
    { key: "registrados", label: "Pagos registrados", count: registeredPayments.length },
  ];

  return (
    <div className="w-full space-y-2.5">
      <section className="flex flex-col gap-2 rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20 lg:flex-row lg:items-center lg:justify-between 2xl:px-4 2xl:py-3">
        <div>
          <h2 className="text-lg font-semibold text-[#F5F5F5]">Pagos</h2>
          <p className="mt-0.5 text-sm text-[#A7A7A7]">Pagos, soportes y movimientos de Shipping V2</p>
        </div>
        <Link
          href="/shipping-v2"
          className="rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-center text-sm font-bold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]"
        >
          Volver a Shipping
        </Link>
      </section>

      {error ? <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2.5 text-sm text-[#FFB07A]">{error}</div> : null}

      <section className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total pendiente" value={money(workspace.summary.totalPorPagar)} tone="yellow" />
        <Kpi label="Total sin soporte" value={money(workspace.summary.totalPagadoSinSoporte)} tone="support" />
        <Kpi label="Total pagado registrado" value={money(workspace.summary.totalPagadoCompleto)} tone="lime" />
        <Kpi label="Pagos incompletos o en revisión" value={workspace.summary.incompletos + workspace.pagos.filter((pago) => normalize(pago.estadoPago).includes("revision")).length} tone="muted" />
      </section>

      <section className="rounded-xl border border-[#30312D] bg-[#11120F] p-2 shadow-xl shadow-black/15">
        <div className="grid gap-2 xl:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))]">
          <label className="min-w-0">
            <span className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">Buscar</span>
            <input value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} placeholder="SKU, pago, proveedor, transacción..." className="mt-1 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#121310] px-3 text-[13px] font-semibold text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70" />
          </label>
          <SelectFilter label="Proveedor" value={filters.proveedor} options={[{ value: ALL, label: ALL }, ...proveedores]} onChange={(value) => updateFilter("proveedor", value)} />
          <SelectFilter label="Estado Pago" value={filters.estadoPago} options={paymentStates.map((value) => ({ value, label: value }))} onChange={(value) => updateFilter("estadoPago", value)} />
          <SelectFilter label="Método" value={filters.metodoPago} options={paymentMethods.map((value) => ({ value, label: value }))} onChange={(value) => updateFilter("metodoPago", value)} />
          <SelectFilter label="Finanzas" value={filters.estadoFinanzas} options={financeStates.map((value) => ({ value, label: value }))} onChange={(value) => updateFilter("estadoFinanzas", value)} />
          <SelectFilter label="Operación" value={filters.tipoOperacion} options={tipoOperacionOptions} onChange={(value) => updateFilter("tipoOperacion", value)} />
        </div>
      </section>

      <nav className="flex gap-1.5 overflow-x-auto rounded-xl border border-[#30312D] bg-[#151515] p-1.5">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${activeTab === tab.key ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] bg-[#20201E] text-[#F5F5F5] hover:border-[#D7FF4F]/50"}`}>
            {tab.label} <span className="ml-2 tabular-nums opacity-75">{tab.count}</span>
          </button>
        ))}
      </nav>

      {activeTab === "pendientes" ? (
        <section className="space-y-2.5">
          <div className="rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/20">
            <div className="flex flex-col gap-2 border-b border-[#30312D] bg-[#20211D] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-normal text-[#F5F5F5]">Items pendientes sin pago V2</h2>
                <p className="mt-0.5 text-xs text-[#A7A7A7]">{selectedPendingItems.length} seleccionados · {money(selectedPendingItems.reduce((sum, item) => sum + (item.costoProveedor ?? 0), 0))}</p>
              </div>
              <button disabled={!canCreatePending} onClick={() => openCreate(selectedPendingItems, false)} className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-sm font-bold text-[#151515] disabled:opacity-50">Crear pago pendiente agrupado</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="text-[12px] uppercase text-[#A7A7A7]"><tr>{["", "SKU", "Nombre", "Proveedor", "Operación", "Estado", "Costo", "Registro", "Faltantes"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
                <tbody>{pendingItems.map((item) => <PendingItemRow key={item.id} item={item} selected={selectedPendingIds.includes(item.id)} onToggle={() => toggleId(item.id, setSelectedPendingIds)} />)}</tbody>
              </table>
              {!pendingItems.length ? <p className="py-5 text-center text-sm text-[#A7A7A7]">No hay items pendientes con estos filtros.</p> : null}
            </div>
          </div>
          <div className="rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/20">
            <div className="border-b border-[#30312D] bg-[#20211D] px-3 py-2">
              <h2 className="text-sm font-semibold uppercase tracking-normal text-[#F5F5F5]">Pagos reales pendientes</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="text-[12px] uppercase text-[#A7A7A7]"><tr>{["", "Pago ID", "Proveedor", "Estado", "Items/Regalos", "Total", "Creación", "Fecha real", "Método", "Finanzas", "Acciones"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
                <tbody>{pendingPayments.map((pago) => <PagoRow key={pago.id} pago={pago} expanded={expandedPagoIds.includes(pago.id)} onToggle={() => toggleId(pago.id, setExpandedPagoIds)} onRegister={() => setSelectedPago(pago)} onComplete={() => setSelectedPago(pago)} onDetail={() => setSelectedPago(pago)} />)}</tbody>
              </table>
              {!pendingPayments.length ? <p className="py-5 text-center text-sm text-[#A7A7A7]">No hay pagos pendientes con estos filtros.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "sin-soporte" ? (
        <section className="space-y-2.5">
          <div className="rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/20">
            <div className="flex flex-col gap-2 border-b border-[#30312D] bg-[#20211D] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-normal text-[#F5F5F5]">Items pagados sin pago V2</h2>
                <p className="mt-0.5 text-xs text-[#A7A7A7]">{selectedSupportItems.length} seleccionados · {money(selectedSupportItems.reduce((sum, item) => sum + (item.costoProveedor ?? 0), 0))}</p>
              </div>
              <button disabled={!canCreatePaid} onClick={() => openCreate(selectedSupportItems, true)} className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-sm font-bold text-[#151515] disabled:opacity-50">Registrar pago ya realizado agrupado</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="text-[12px] uppercase text-[#A7A7A7]"><tr>{["", "SKU", "Nombre", "Proveedor", "Operación", "Badge", "Costo", "Registro"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
                <tbody>{supportItems.map((card) => <SupportItemRow key={card.id} card={card} selected={selectedSupportIds.includes(card.item.id)} onToggle={() => toggleId(card.item.id, setSelectedSupportIds)} />)}</tbody>
              </table>
              {!supportItems.length ? <p className="py-5 text-center text-sm text-[#A7A7A7]">No hay items sin soporte con estos filtros.</p> : null}
            </div>
          </div>
          <div className="rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/20">
            <div className="border-b border-[#30312D] bg-[#20211D] px-3 py-2">
              <h2 className="text-sm font-semibold uppercase tracking-normal text-[#F5F5F5]">Pagos reales incompletos</h2>
            </div>
            <div className="grid gap-2 p-2">
              {incompletePayments.map((card) => (
                <article key={card.id} className="rounded-xl border border-[#FF6B6B]/25 bg-[#151515] p-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2"><Badge tone="support">Pago incompleto</Badge>{!card.pago.movimientoFinanzasIds.length ? <Badge>Movimiento pendiente</Badge> : null}</div>
                      <h3 className="mt-2 text-base font-semibold text-[#F5F5F5]">{card.pago.pagoId} · {card.proveedorNombre || "Sin proveedor"}</h3>
                      <p className="mt-1 text-sm text-[#A7A7A7]">{card.pago.cantidadItems} items · {money(card.total)} · Finanzas: {card.pago.estadoIntegracionFinanzas || "-"}</p>
                    </div>
                    <button onClick={() => setSelectedPago(card.pago)} className="rounded-lg border border-[#FFB4A8]/45 px-3 py-1.5 text-sm font-semibold text-[#FFB4A8]">Completar soporte</button>
                  </div>
                  <div className="mt-2"><MissingList missing={card.missing} /></div>
                </article>
              ))}
              {!incompletePayments.length ? <p className="py-5 text-center text-sm text-[#A7A7A7]">No hay pagos incompletos con estos filtros.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "registrados" ? (
        <section className="rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/20">
          <div className="border-b border-[#30312D] bg-[#20211D] px-3 py-2">
            <h2 className="text-sm font-semibold uppercase tracking-normal text-[#F5F5F5]">Registros reales de Shipping Pagos</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="text-[12px] uppercase text-[#A7A7A7]"><tr>{["", "Pago ID", "Proveedor", "Estado", "Items/Regalos", "Total", "Creación", "Fecha real", "Método", "Finanzas", "Acciones"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>{registeredPayments.map((pago) => <PagoRow key={pago.id} pago={pago} expanded={expandedPagoIds.includes(pago.id)} onToggle={() => toggleId(pago.id, setExpandedPagoIds)} onRegister={() => setSelectedPago(pago)} onComplete={() => setSelectedPago(pago)} onDetail={() => setSelectedPago(pago)} />)}</tbody>
            </table>
            {!registeredPayments.length ? <p className="py-5 text-center text-sm text-[#A7A7A7]">No hay pagos registrados con estos filtros.</p> : null}
          </div>
        </section>
      ) : null}

      {selectedPago ? <DetailModal pago={selectedPago} onClose={() => setSelectedPago(null)} onUpdated={refreshWorkspace} /> : null}
      {createItems.length ? <CreatePaymentModal selectedItems={createItems} registerPaidDefault={createPaid} onClose={() => setCreateItems([])} onCreated={refreshWorkspace} /> : null}
    </div>
  );
}
