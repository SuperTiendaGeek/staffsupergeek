"use client";

// Registrar compra — modo PRODUCTO DIGITAL (auditoría ops, punto 5B-2 ·
// 7-nov-2026). La única entrada de una licencia al sistema (decisión del
// dueño), igual que un artículo físico entra por "Registrar compra".
//
// Lo mismo que la compra de artículos, sin lo que no aplica a una licencia
// (origen, llegada, caja, casillero, rastreos, condición, serie, fotos…):
//   · Arriba la orden de compra: proveedor (solo de Software), nº de factura y fecha.
//   · Una FILA por licencia: producto del catálogo, sus credenciales (según el
//     tipo del catálogo), duración, costo y precio. ⧉ duplica la fila.
//     "Reposición" = clave defectuosa que el proveedor repuso sin cobrar ($0).
//   · El PAGO, una vez, contra la orden por su total. Por defecto "Ahora" con
//     la débito Visa SUPER GEEK (Pichincha) → SGINGRESOS (dueño, 7-nov).
// Al guardar: la orden, luego cada licencia (artículo + DIG; si viene de una
// solicitud se entrega en su orden), y al final el pago (egreso en Finanzas).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CampoSecreto } from "@/components/productos-digitales/CampoSecreto";
import { camposDeCredenciales, DURACIONES_DIGITAL, errorCredenciales } from "@/lib/productos-digitales/reglas";
import { errorFilaLicencia } from "@/lib/productos-digitales/compra";
import { validarRespaldo } from "@/lib/shipping-v2/pagos-situacion";
import { SHIPPING_V2_PAYMENT_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";
import { CUENTAS_PAGO_VIGENTES } from "@/lib/shipping-v2/cuentas-pago";

export type CatalogoParaCompra = { id: string; nombre: string; marca: string; tipo: string; precio: number | null; activo: boolean };
export type ProveedorParaLicencia = { id: string; nombre: string };
export type SolicitudDeLicencia = {
  id: string; codigo: string; para: string; catalogoId: string | null; precioCliente: number;
  costoCotizado: number | null; proveedorId: string | null; descripcion: string;
};

const METODOS_PAGO = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.metodoPago.filter((m) => m !== "No aplica");
/** La débito Visa SUPER GEEK del Pichincha (debita SGINGRESOS): la de casi siempre. */
const CUENTA_POR_DEFECTO = "Tarjeta D. Supe Geek ";

type Fila = {
  key: string;
  catalogoId: string;
  clave: string;
  usuario: string;
  contrasena: string;
  duracion: string;
  costo: string;
  precio: string;
  reposicion: boolean;
  observaciones: string;
  solicitudId?: string;
  solicitudPara?: string;
};

let contador = 0;
const nuevaClave = () => `f${Date.now().toString(36)}${(contador++).toString(36)}`;
const num = (v: string): number | null => {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const money = (n: number) => `$${(Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2)}`;
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inputBase = "h-8 w-full rounded-md border border-[#3A3A36] bg-[#151515] px-2 text-[13px] text-[#F5F5F5] outline-none transition placeholder:text-[#6F706A] focus:border-[#D7FF4F]/70";
const invalida = "border-[#F4C95B]/70";

function Campo({ label, children, className = "", error }: { label: string; children: ReactNode; className?: string; error?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">
        {label}{error ? <span className="ml-1.5 normal-case tracking-normal text-[#FFB07A]">{error}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function RegistrarLicenciasForm({ catalogo, proveedores, solicitudes = [], puedeRegistrarPago, volver }: {
  catalogo: CatalogoParaCompra[];
  proveedores: ProveedorParaLicencia[];
  solicitudes?: SolicitudDeLicencia[];
  puedeRegistrarPago: boolean;
  /** A dónde volver al guardar (la orden de reparación, si se abrió desde su línea). */
  volver?: string | null;
}) {
  const router = useRouter();
  const porId = useMemo(() => new Map(catalogo.map((c) => [c.id, c])), [catalogo]);
  const activos = useMemo(() => catalogo.filter((c) => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [catalogo]);
  const proveedorSugerido = solicitudes.length && solicitudes.every((s) => s.proveedorId && s.proveedorId === solicitudes[0].proveedorId)
    && proveedores.some((p) => p.id === solicitudes[0].proveedorId) ? solicitudes[0].proveedorId! : "";

  const filaVacia = (o: Partial<Fila> = {}): Fila => ({
    key: nuevaClave(), catalogoId: "", clave: "", usuario: "", contrasena: "", duracion: "", costo: "", precio: "",
    reposicion: false, observaciones: "", ...o,
  });
  const [cab, setCab] = useState({ proveedorId: proveedorSugerido, numero: "", fecha: hoyLocal() });
  const [filas, setFilas] = useState<Fila[]>(() => solicitudes.length
    ? solicitudes.map((s) => {
        const c = s.catalogoId ? porId.get(s.catalogoId) : undefined;
        return filaVacia({
          catalogoId: c ? c.id : "",
          precio: s.precioCliente > 0 ? String(s.precioCliente) : c?.precio ? String(c.precio) : "",
          costo: s.costoCotizado ? String(s.costoCotizado) : "",
          solicitudId: s.id,
          solicitudPara: `${s.codigo} · ${s.para}`,
        });
      })
    : [filaVacia()]);
  const [pago, setPago] = useState({ ahora: true, fecha: hoyLocal(), metodo: "Tarjeta", cuenta: CUENTA_POR_DEFECTO, transaccion: "", comprobante: "" });
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState("");
  const [orden, setOrden] = useState<{ id: string; ocId: string } | null>(null);
  const [creadas, setCreadas] = useState<string[]>([]);

  const setF = (key: string, cambios: Partial<Fila>) => setFilas((fs) => fs.map((f) => {
    if (f.key !== key) return f;
    const next = { ...f, ...cambios };
    // Al elegir el producto, el precio viene del catálogo (si no lo puso una solicitud).
    if (cambios.catalogoId !== undefined && cambios.catalogoId !== f.catalogoId && !f.solicitudId) {
      const c = porId.get(cambios.catalogoId);
      next.precio = c?.precio ? String(c.precio) : "";
    }
    if (cambios.reposicion === true) next.costo = "";
    return next;
  }));

  const faltaDe = (f: Fila): string | null => {
    const c = porId.get(f.catalogoId) ?? null;
    return errorFilaLicencia({ catalogoId: f.catalogoId, costo: num(f.costo), precio: num(f.precio), reposicion: f.reposicion }, c)
      ?? (c ? errorCredenciales(c.tipo, { claveActivacion: f.clave, usuarioCorreo: f.usuario, contrasena: f.contrasena }) : null);
  };
  const total = filas.reduce((t, f) => t + (f.reposicion ? 0 : num(f.costo) ?? 0), 0);
  const pidePago = puedeRegistrarPago && total > 0;
  const errorPago = pidePago && pago.ahora ? validarRespaldo({ fechaPagoReal: pago.fecha, metodoPago: pago.metodo, cuentaOrigen: pago.cuenta }) : null;
  const porCompletar = filas.filter((f) => faltaDe(f)).length;
  const requisitos = [
    ...(cab.proveedorId ? [] : ["Elige el proveedor."]),
    ...(filas.length ? [] : ["Agrega al menos una licencia."]),
    ...(porCompletar ? [`${porCompletar} licencia(s) por completar (en amarillo).`] : []),
    ...(errorPago ? [`Pago: ${errorPago}`] : []),
  ];

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setIntento(true);
    setError("");
    if (requisitos.length) { setError(requisitos.map((r) => `· ${r}`).join("\n")); return; }
    setGuardando(true);
    let oc = orden;
    const hechas = [...creadas];
    const avisos: string[] = [];

    // 1. La orden de compra.
    if (!oc) {
      setProgreso("Creando la orden…");
      const res = await fetch("/api/shipping-v2/ordenes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedorId: cab.proveedorId, numeroProveedor: cab.numero, fechaCompra: cab.fecha }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) { setError(String(j.error || "No se pudo crear la orden.")); setGuardando(false); setProgreso(""); return; }
      oc = { id: String(j.data.id), ocId: String(j.data.ocId) };
      setOrden(oc);
    }

    // 2. Las licencias, de una en una (la fila creada sale de la tabla).
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      setProgreso(`Registrando ${i + 1} de ${filas.length}…`);
      const res = await fetch("/api/shipping-v2/licencias", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ordenCompraId: oc.id, proveedorId: cab.proveedorId, catalogoId: f.catalogoId,
          costo: f.reposicion ? 0 : num(f.costo), precio: num(f.precio), reposicion: f.reposicion,
          claveActivacion: f.clave, usuarioCorreo: f.usuario, contrasena: f.contrasena,
          duracion: f.duracion, fechaCompra: cab.fecha, observaciones: f.observaciones, solicitudId: f.solicitudId ?? null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) {
        // La orden recién creada que quedó vacía se borra (no deja basura).
        if (!hechas.length && !orden) {
          await fetch(`/api/shipping-v2/ordenes/${oc.id}`, { method: "DELETE" }).catch(() => undefined);
          setOrden(null);
        }
        const nombre = porId.get(f.catalogoId)?.nombre ?? `fila ${i + 1}`;
        setError(`${nombre}: ${String(j.error || "no se pudo registrar.")}${hechas.length ? `\nYa quedaron registradas: ${hechas.join(", ")} en ${oc.ocId}. Corrige y vuelve a guardar: solo se registra lo que falta.` : ""}`);
        setCreadas(hechas);
        setGuardando(false);
        setProgreso("");
        return;
      }
      hechas.push(String(j.data.sku || j.data.itemSku || "licencia"));
      if (j.warning) avisos.push(String(j.warning));
      setFilas((fs) => fs.filter((x) => x.key !== f.key));
    }
    setCreadas(hechas);

    // 3. El pago contra la orden (egreso en Finanzas).
    let textoPago = "";
    if (pidePago && pago.ahora) {
      setProgreso("Registrando el pago…");
      const res = await fetch(`/api/shipping-v2/ordenes/${oc.id}/pago`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaPagoReal: pago.fecha, metodoPago: pago.metodo, cuentaOrigen: pago.cuenta, transaccionId: pago.transaccion, comprobanteUrl: pago.comprobante }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) avisos.push(`El pago no se registró: ${String(j.error || "error inesperado")}. Regístralo en la orden.`);
      else textoPago = ` · Pago ${j.data?.pagoId ?? ""} ${money(typeof j.data?.totalAPagar === "number" ? j.data.totalAPagar : total)}`;
    }

    window.sessionStorage.setItem("shipping-v2:notice", `${oc.ocId}: ${hechas.join(", ")} registrada(s)${textoPago}.${avisos.length ? ` ${avisos.join(" ")}` : ""}`);
    router.push(volver || `/shipping-v2/pagos/ordenes/${oc.id}`);
    router.refresh();
  }

  const marcar = intento;
  return (
    <form onSubmit={guardar} noValidate className="w-full max-w-none space-y-2 pb-16">
      {error ? <div className="whitespace-pre-line rounded-md border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A] animate-[sg-sacudir_300ms_ease-out]">{error}</div> : null}

      {/* ── Orden de compra (lima) ── */}
      <section className="rounded-lg border border-[#D7FF4F]/45 bg-[#171814] px-3 pb-3 pt-2">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#D7FF4F]">Compra de licencias</h2>
          {orden ? <span className="rounded-full border border-[#D7FF4F]/50 px-2 py-0.5 text-[11px] font-semibold text-[#D7FF4F]">{orden.ocId}</span> : null}
          <span className="ml-auto text-[11px] text-[#7E7F76]">Sin logística: entran directo al inventario</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-12">
          <Campo label="Proveedor" className="xl:col-span-5" error={marcar && !cab.proveedorId ? "Obligatorio" : undefined}>
            <select value={cab.proveedorId} disabled={!!orden} onChange={(e) => setCab((c) => ({ ...c, proveedorId: e.target.value }))} className={`${inputBase} ${marcar && !cab.proveedorId ? invalida : ""}`}>
              <option value="">—</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="Nº de orden o factura" className="xl:col-span-4">
            <input value={cab.numero} disabled={!!orden} onChange={(e) => setCab((c) => ({ ...c, numero: e.target.value }))} className={inputBase} placeholder="Opcional" />
          </Campo>
          <Campo label="Fecha" className="xl:col-span-3">
            <input type="date" value={cab.fecha} disabled={!!orden} onChange={(e) => setCab((c) => ({ ...c, fecha: e.target.value }))} className={inputBase} />
          </Campo>
        </div>
        {!proveedores.length ? <p className="mt-1.5 text-[11px] text-[#F4C95B]">No hay proveedores activos de tipo Software. Márcalo en Shipping V2 → Proveedores.</p> : null}
      </section>

      {/* ── Licencias ── */}
      <section className="rounded-lg border border-[#2E2F28] bg-[#171814] px-3 pb-3 pt-2">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#F5F5F5]">Licencias</h2>
          <span className="text-[11px] text-[#7E7F76]">{filas.length}</span>
          <button type="button" onClick={() => setFilas((fs) => [...fs, filaVacia()])} className="ml-auto rounded-full border border-[#3A3A36] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#B4B5AC] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">+ Licencia</button>
        </div>
        <div className="hidden grid-cols-[22px_minmax(0,1.4fr)_minmax(0,1.6fr)_104px_84px_84px_56px] gap-1.5 rounded bg-[#1E1F19] px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] lg:grid">
          <span>#</span><span>Producto</span><span>Credenciales</span><span>Duración</span><span className="text-right">Costo</span><span className="text-right">Venta</span><span />
        </div>
        <ul className="mt-1 space-y-1">
          {filas.map((f, i) => {
            const c = porId.get(f.catalogoId);
            const campos = camposDeCredenciales(c?.tipo);
            const falta = marcar ? faltaDe(f) : null;
            return (
              <li key={f.key} className={`rounded-md border px-1.5 py-1.5 animate-[sg-entrada_180ms_ease-out] ${falta ? "border-[#F4C95B]/50 bg-[#F4C95B]/5" : "border-[#26271F] bg-[#13140F]"}`}>
                <div className="grid items-start gap-1.5 lg:grid-cols-[22px_minmax(0,1.4fr)_minmax(0,1.6fr)_104px_84px_84px_56px]">
                  <span className="pt-1.5 text-[11px] tabular-nums text-[#6F706A]">{i + 1}</span>
                  <div className="min-w-0">
                    <select value={f.catalogoId} onChange={(e) => setF(f.key, { catalogoId: e.target.value })} disabled={!!f.solicitudId && !!f.catalogoId}
                      className={`${inputBase} ${marcar && !f.catalogoId ? invalida : ""}`} aria-label="Producto del catálogo">
                      <option value="">Producto del catálogo…</option>
                      {activos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                      {c && !c.activo ? <option value={c.id}>{c.nombre} (inactivo)</option> : null}
                    </select>
                    {f.solicitudPara ? <span className="mt-0.5 block truncate text-[11px] font-semibold text-[#4FC3FF]" title={f.solicitudPara}>Para {f.solicitudPara}</span>
                      : c?.tipo ? <span className="mt-0.5 block text-[10.5px] text-[#6F706A]">{c.tipo}</span> : null}
                  </div>
                  <div className={`grid min-w-0 gap-1 ${campos.clave && campos.usuario ? "grid-cols-1 sm:grid-cols-3" : campos.usuario ? "grid-cols-2" : "grid-cols-1"}`}>
                    {!c ? <span className="pt-1.5 text-[11px] text-[#6F706A]">Elige el producto</span> : null}
                    {c && campos.clave ? <CampoSecreto valor={f.clave} onChange={(v) => setF(f.key, { clave: v })} placeholder="Clave de activación" className={inputBase} /> : null}
                    {c && campos.usuario ? (
                      <input value={f.usuario} onChange={(e) => setF(f.key, { usuario: e.target.value })} placeholder="Usuario / correo" autoComplete="off" data-lpignore="true" data-1p-ignore="true" className={`${inputBase} font-mono`} />
                    ) : null}
                    {c && campos.usuario ? <CampoSecreto valor={f.contrasena} onChange={(v) => setF(f.key, { contrasena: v })} placeholder="Contraseña" className={inputBase} /> : null}
                  </div>
                  <select value={f.duracion} onChange={(e) => setF(f.key, { duracion: e.target.value })} className={inputBase} aria-label="Duración">
                    <option value="">Duración</option>
                    {DURACIONES_DIGITAL.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input inputMode="decimal" value={f.reposicion ? "0" : f.costo} disabled={f.reposicion} onChange={(e) => setF(f.key, { costo: e.target.value })} placeholder="Costo"
                    className={`${inputBase} text-right tabular-nums ${marcar && !f.reposicion && !(num(f.costo) ?? 0) ? invalida : ""}`} aria-label="Costo" />
                  <input inputMode="decimal" value={f.precio} onChange={(e) => setF(f.key, { precio: e.target.value })} placeholder="Venta"
                    className={`${inputBase} text-right tabular-nums ${marcar && !(num(f.precio) ?? 0) ? invalida : ""}`} aria-label="Precio de venta" title={c?.precio ? `Catálogo: ${money(c.precio)}` : undefined} />
                  <div className="flex items-center justify-end gap-0.5 pt-1">
                    <button type="button" title="Duplicar (otra licencia del mismo producto)" aria-label="Duplicar fila"
                      onClick={() => setFilas((fs) => { const k = fs.findIndex((x) => x.key === f.key); const copia = filaVacia({ catalogoId: f.catalogoId, duracion: f.duracion, costo: f.costo, precio: f.solicitudId ? (c?.precio ? String(c.precio) : "") : f.precio, reposicion: f.reposicion }); return [...fs.slice(0, k + 1), copia, ...fs.slice(k + 1)]; })}
                      className="grid h-6 w-6 place-items-center rounded text-[12px] text-[#8F908A] hover:text-[#D7FF4F]">⧉</button>
                    <button type="button" title="Quitar" aria-label="Quitar fila" onClick={() => setFilas((fs) => fs.filter((x) => x.key !== f.key))}
                      className="grid h-6 w-6 place-items-center rounded text-[14px] text-[#8F908A] hover:text-[#FFB07A]">×</button>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0 lg:pl-[28px]">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-[#B4B5AC]" title="Clave defectuosa que el proveedor repuso sin cobrar: entra en $0 y no genera pago.">
                    <input type="checkbox" checked={f.reposicion} onChange={(e) => setF(f.key, { reposicion: e.target.checked })} className="accent-[#D7FF4F]" />
                    Reposición del proveedor ($0)
                  </label>
                  <input value={f.observaciones} onChange={(e) => setF(f.key, { observaciones: e.target.value })} placeholder="Observación interna (opcional)"
                    className="h-6 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[11.5px] text-[#B4B5AC] outline-none placeholder:text-[#5F605A] focus:border-[#3A3A36]" />
                  {falta ? <span className="text-[11px] font-semibold text-[#F4C95B]">{falta}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Pago (verde) ── */}
      {pidePago ? (
        <section className="rounded-lg border border-[#7BE495]/40 bg-[#151a13] px-3 pb-3 pt-2">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#9FEFB3]">Pago</h2>
            <span className="ml-auto text-[11px] text-[#7E7F76]">un pago, un egreso en Finanzas</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-12">
            <Campo label="Respaldo" className="xl:col-span-2">
              <div className="flex h-8 overflow-hidden rounded-md border border-[#3A3A36]">
                {([["ahora", "Ahora"], ["despues", "Después"]] as const).map(([v, t]) => (
                  <button key={v} type="button" onClick={() => setPago((p) => ({ ...p, ahora: v === "ahora" }))}
                    className={`flex-1 text-[12px] font-semibold transition ${(v === "ahora") === pago.ahora ? "bg-[#7BE495]/20 text-[#9FEFB3]" : "text-[#8F908A] hover:text-[#F5F5F5]"}`}>{t}</button>
                ))}
              </div>
            </Campo>
            {pago.ahora ? (
              <>
                <Campo label="Fecha" className="xl:col-span-2"><input type="date" value={pago.fecha} onChange={(e) => setPago((p) => ({ ...p, fecha: e.target.value }))} className={inputBase} /></Campo>
                <Campo label="Método" className="xl:col-span-2">
                  <select value={pago.metodo} onChange={(e) => setPago((p) => ({ ...p, metodo: e.target.value }))} className={inputBase}>
                    {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Campo>
                <Campo label="Cuenta" className="xl:col-span-3" error={marcar && !pago.cuenta ? "Obligatoria" : undefined}>
                  <select value={pago.cuenta} onChange={(e) => setPago((p) => ({ ...p, cuenta: e.target.value }))} className={`${inputBase} ${marcar && !pago.cuenta ? invalida : ""}`}>
                    <option value="">—</option>
                    {CUENTAS_PAGO_VIGENTES.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
                  </select>
                </Campo>
                <Campo label="Nº transacción" className="xl:col-span-2"><input value={pago.transaccion} onChange={(e) => setPago((p) => ({ ...p, transaccion: e.target.value }))} placeholder="Opcional" className={inputBase} /></Campo>
              </>
            ) : null}
            <Campo label="Monto" className="xl:col-span-1">
              <div className={`${inputBase} flex items-center justify-end border-[#7BE495]/30 font-semibold tabular-nums`}>{money(total)}</div>
            </Campo>
          </div>
        </section>
      ) : null}

      {/* ── Barra fija ── */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-lg border border-[#2E2F28] bg-[#11120F]/95 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full border border-[#3A3A36] px-2 py-0.5 font-semibold text-[#B4B5AC]">{filas.length} licencia(s)</span>
          {porCompletar && marcar ? <span className="rounded-full border border-[#F4C95B]/60 px-2 py-0.5 font-semibold text-[#F4C95B]">{porCompletar} por completar</span> : null}
          {pidePago ? <span className={`rounded-full border px-2 py-0.5 font-semibold ${pago.ahora ? "border-[#7BE495]/60 text-[#9FEFB3]" : "border-[#3A3A36] text-[#B4B5AC]"}`}>{pago.ahora ? "Con respaldo" : "Falta respaldo"}</span> : null}
          {progreso ? <span className="text-[12px] text-[#D7FF4F]">{progreso}</span> : null}
        </div>
        <span className="text-[12px] text-[#8F908A]">Total <b className="text-[15px] font-black tabular-nums text-[#F5F5F5]">{money(total)}</b></span>
        {volver ? <Link href={volver} className="text-[12px] text-[#8F908A] hover:text-[#F5F5F5]">Cancelar</Link> : null}
        <button type="submit" disabled={guardando || !filas.length} className="h-9 rounded-lg bg-[#D7FF4F] px-4 text-sm font-black text-[#151515] transition hover:bg-[#D7FF4F]/90 disabled:opacity-50">
          {guardando ? "Guardando…" : "Registrar compra"}
        </button>
      </div>
    </form>
  );
}
