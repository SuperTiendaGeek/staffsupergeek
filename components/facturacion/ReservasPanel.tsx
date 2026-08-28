"use client";

// Gestión de reservas: listado con estado, saldo y fecha límite; alertas de
// vencimiento; y detalle con acciones (abonar, imprimir 2 tickets, PDF, liberar).
// Facturar la reserva llega en la Fase 2.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { reservaVencida, diasRestantesReserva, validarAbono, saldoPendiente, pagoCompleto } from "@/lib/facturacion/reservas/reglas";

const FORMAS_PAGO = [
  { codigo: "01", label: "Efectivo" }, { codigo: "16", label: "Tarjeta de débito" }, { codigo: "19", label: "Tarjeta de crédito" },
  { codigo: "17", label: "Dinero electrónico" }, { codigo: "18", label: "Tarjeta prepago" }, { codigo: "20", label: "Otros (sist. financiero)" }, { codigo: "21", label: "Endoso de títulos" },
];
const FORMA_PAGO_LABEL: Record<string, string> = Object.fromEntries(FORMAS_PAGO.map((f) => [f.codigo, f.label]));

const mon = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
const fmt = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const hoy = () => new Date();
const dLimite = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

type Registro = { recordId: string; numero: string; fecha: string; estado: string; clienteNombre: string; clienteIdentificacion: string; descripcionItem: string; precio: number; totalAbonado: number; fechaLimite: string; tienePdf: boolean };
type Abono = { monto: number; fecha: string; formaPago: string; registradoPor: string };
type Detalle = Registro & { cliente: { razonSocial: string; identificacion?: string; correo?: string; telefono?: string }; abonos: Abono[]; plazoDias: number; saldoAFavor: number; facturaRecordId?: string };

function estadoVisual(r: { estado: string; fechaLimite: string }): { label: string; cls: string } {
  if (r.estado === "Activa" && reservaVencida(dLimite(r.fechaLimite), hoy())) return { label: "Vencida", cls: "text-red-400" };
  if (r.estado === "Activa") return { label: "Activa", cls: "text-emerald-400" };
  if (r.estado === "Facturada") return { label: "Facturada", cls: "text-[#D7FF4F]" };
  if (r.estado === "Liberada") return { label: "Liberada", cls: "text-[#888]" };
  return { label: r.estado, cls: "text-[#A7A7A7]" };
}

function Spinner() {
  return <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>;
}

export function ReservasPanel() {
  const [reservas, setReservas] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [filtro, setFiltro]     = useState<"todas" | "activas" | "vencidas" | "cerradas">("activas");
  const [sel, setSel]           = useState<Detalle | null>(null);
  const [cargandoDet, setCargandoDet] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch("/api/facturacion/reservas");
      const d = await r.json();
      if (!d.success) { setError(d.error ?? "Error"); return; }
      setReservas(d.data.reservas ?? []);
    } catch { setError("Error de red al cargar reservas"); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function abrirDetalle(recordId: string) {
    setCargandoDet(true);
    try { const r = await fetch(`/api/facturacion/reservas/${recordId}`); const d = await r.json(); if (d.success) setSel(d.data); }
    catch { /* */ } finally { setCargandoDet(false); }
  }

  const vencidas = reservas.filter((r) => r.estado === "Activa" && reservaVencida(dLimite(r.fechaLimite), hoy())).length;
  const porVencer = reservas.filter((r) => { if (r.estado !== "Activa") return false; const dias = diasRestantesReserva(dLimite(r.fechaLimite), hoy()); return dias >= 0 && dias <= 3; }).length;

  const filtradas = reservas.filter((r) => {
    const venc = r.estado === "Activa" && reservaVencida(dLimite(r.fechaLimite), hoy());
    if (filtro === "todas") return true;
    if (filtro === "activas") return r.estado === "Activa" && !venc;
    if (filtro === "vencidas") return venc;
    return r.estado === "Liberada" || r.estado === "Facturada"; // cerradas
  });

  return (
    <div className="min-h-screen bg-[#151510] text-[#F5F5F5] p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-[#D7FF4F]">Reservas</h1>
          <p className="text-sm text-[#666] mt-0.5">Apartados de mercadería con abonos</p>
        </div>
        <Link href="/facturacion" className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]">← Documentos</Link>
      </div>

      {/* Alertas */}
      {(vencidas > 0 || porVencer > 0) && (
        <div className="mb-4 flex flex-wrap gap-3">
          {vencidas > 0 && <div className="rounded-xl border border-red-700/50 bg-red-900/20 px-4 py-2 text-sm text-red-300"><b>{vencidas}</b> reserva(s) <b>vencida(s)</b> — libera el ítem para devolverlo a inventario.</div>}
          {porVencer > 0 && <div className="rounded-xl border border-yellow-700/50 bg-yellow-900/20 px-4 py-2 text-sm text-yellow-300"><b>{porVencer}</b> por vencer en ≤ 3 días.</div>}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([["activas", "Activas"], ["vencidas", "Vencidas"], ["cerradas", "Cerradas"], ["todas", "Todas"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setFiltro(id)} className={`rounded-full px-4 py-1.5 text-sm transition ${filtro === id ? "bg-[#D7FF4F]/15 text-[#D7FF4F] border border-[#D7FF4F]/50" : "border border-[#3A3A36] text-[#A7A7A7] hover:text-[#F5F5F5]"}`}>{label}</button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300 mb-4">{error}</div>}

      <div className="rounded-xl border border-[#2A2A22] bg-[#1A1A16] overflow-hidden">
        <div className="hidden md:grid grid-cols-[110px_1.3fr_1.4fr_90px_90px_110px] gap-3 px-4 py-2 border-b border-[#2A2A22] text-xs font-semibold text-[#555] uppercase tracking-wider">
          <span>Número</span><span>Cliente</span><span>Ítem</span><span className="text-right">Saldo</span><span className="text-right">Estado</span><span className="text-right">Vence</span>
        </div>
        {cargando && reservas.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-[#555]"><Spinner /><span className="ml-2 text-sm">Cargando…</span></div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#555]">No hay reservas en este filtro.</div>
        ) : filtradas.map((r) => {
          const ev = estadoVisual(r);
          const saldo = saldoPendiente(r.precio, r.totalAbonado);
          return (
            <button key={r.recordId} onClick={() => abrirDetalle(r.recordId)} className="w-full text-left md:grid grid-cols-[110px_1.3fr_1.4fr_90px_90px_110px] gap-3 px-4 py-2.5 border-b border-[#2A2A22] last:border-0 hover:bg-[#1F1F1A] transition-colors items-center">
              <span className="block text-xs font-mono text-[#8A8A8A]">{r.numero}</span>
              <span className="block text-sm text-[#F5F5F5] truncate">{r.clienteNombre || "—"}</span>
              <span className="hidden md:block text-sm text-[#A7A7A7] truncate">{r.descripcionItem}</span>
              <span className="hidden md:block text-sm font-bold text-[#D7FF4F] text-right">{mon(saldo)}</span>
              <span className={`hidden md:block text-sm text-right ${ev.cls}`}>{ev.label}</span>
              <span className={`hidden md:block text-xs text-right ${ev.label === "Vencida" ? "text-red-400" : "text-[#A7A7A7]"}`}>{fmt(r.fechaLimite)}</span>
            </button>
          );
        })}
      </div>

      {cargandoDet && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"><Spinner /></div>}
      {sel && <DetalleReserva reserva={sel} onClose={() => setSel(null)} onCambio={() => { cargar(); abrirDetalle(sel.recordId); }} />}
    </div>
  );
}

// ─── Drawer de detalle ────────────────────────────────────────────────────────

function DetalleReserva({ reserva, onClose, onCambio }: { reserva: Detalle; onClose: () => void; onCambio: () => void }) {
  const [abono, setAbono] = useState("");
  const [forma, setForma] = useState("01");
  const [accion, setAccion] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [facturarOpen, setFacturarOpen] = useState(false);
  // El cierre por "clic afuera" solo cuenta si el clic empieza Y termina en
  // el fondo — evita que seleccionar texto en un campo cierre el panel al
  // soltar el mouse un pixel fuera de él.
  const [mouseDownEnFondo, setMouseDownEnFondo] = useState(false);

  const saldo = saldoPendiente(reserva.precio, reserva.totalAbonado);
  const completa = pagoCompleto(reserva.precio, reserva.totalAbonado);
  const venc = reserva.estado === "Activa" && reservaVencida(dLimite(reserva.fechaLimite), hoy());
  const activa = reserva.estado === "Activa";

  async function registrarAbono() {
    const monto = parseFloat(abono) || 0;
    const errValid = validarAbono(monto, reserva.precio, reserva.totalAbonado);
    if (errValid) { setErr(errValid); return; }
    setAccion("abono"); setErr(null); setMsg(null);
    try {
      const r = await fetch(`/api/facturacion/reservas/${reserva.recordId}/abonos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monto, formaPago: forma }) });
      const d = await r.json();
      if (!d.success) setErr(d.error ?? "Error");
      else {
        setMsg(`Abono de ${mon(monto)} registrado`);
        if (d.data?.advertencia) setErr(d.data.advertencia);
        setAbono("");
        onCambio();
      }
    } catch { setErr("Error de red"); } finally { setAccion(null); }
  }

  async function liberar() {
    if (!confirm("¿Liberar esta reserva? El ítem vuelve a inventario y lo abonado queda como saldo a favor del cliente.")) return;
    setAccion("liberar"); setErr(null); setMsg(null);
    try {
      const r = await fetch(`/api/facturacion/reservas/${reserva.recordId}/liberar`, { method: "POST" });
      const d = await r.json();
      if (!d.success) setErr(d.error ?? "Error");
      else { setMsg(`Reserva liberada · saldo a favor ${mon(d.data.saldoAFavor)}`); onCambio(); }
    } catch { setErr("Error de red"); } finally { setAccion(null); }
  }

  const btn = "rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] transition";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/60"
      onMouseDown={(e) => setMouseDownEnFondo(e.target === e.currentTarget)}
      onClick={(e) => { if (mouseDownEnFondo && e.target === e.currentTarget) onClose(); }}
    >
      <div className="h-full w-full max-w-lg overflow-y-auto bg-[#1A1A16] border-l border-[#2A2A22] p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[#666]">Reserva</p>
            <p className="text-lg font-bold font-mono text-[#F5F5F5]">{reserva.numero}</p>
            <p className={`text-xs ${venc ? "text-red-400" : "text-[#888]"}`}>{venc ? "VENCIDA · " : ""}{reserva.estado} · vence {fmt(reserva.fechaLimite)}</p>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-[#F5F5F5] text-xl leading-none">✕</button>
        </div>

        <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-sm space-y-1">
          <div className="flex justify-between gap-3"><span className="text-[#666]">Cliente</span><span className="text-[#F5F5F5] text-right">{reserva.cliente.razonSocial}</span></div>
          {reserva.cliente.telefono && <div className="flex justify-between gap-3"><span className="text-[#666]">Teléfono</span><span className="text-[#F5F5F5]">{reserva.cliente.telefono}</span></div>}
          <div className="flex justify-between gap-3"><span className="text-[#666]">Ítem</span><span className="text-[#F5F5F5] text-right">{reserva.descripcionItem}</span></div>
        </div>

        <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-[#666]">Precio</span><span className="text-[#F5F5F5]">{mon(reserva.precio)}</span></div>
          <div className="flex justify-between"><span className="text-[#666]">Total abonado</span><span className="text-[#F5F5F5]">{mon(reserva.totalAbonado)}</span></div>
          <div className="flex justify-between text-base font-bold"><span className="text-[#F5F5F5]">SALDO</span><span className="text-[#D7FF4F]">{mon(saldo)}</span></div>
          {reserva.estado === "Liberada" && reserva.saldoAFavor > 0 && <div className="flex justify-between text-xs pt-1"><span className="text-[#666]">Saldo a favor generado</span><span className="text-yellow-300">{mon(reserva.saldoAFavor)}</span></div>}
        </div>

        {/* Abonos */}
        <div>
          <p className="text-[10px] text-[#666] uppercase tracking-wider mb-1">Abonos</p>
          <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-xs space-y-1">
            {reserva.abonos.map((a, i) => (<div key={i} className="flex justify-between"><span className="text-[#A7A7A7]">{fmt(a.fecha)} · {FORMA_PAGO_LABEL[a.formaPago] ?? a.formaPago}</span><span className="text-[#F5F5F5]">{mon(a.monto)}</span></div>))}
          </div>
        </div>

        {/* Registrar abono (solo activa y con saldo) */}
        {activa && !completa && (
          <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3">
            <p className="text-[10px] text-[#666] uppercase tracking-wider mb-2">Registrar abono</p>
            <div className="flex items-end gap-2">
              <div className="flex-1"><label className="block mb-1 text-[10px] text-[#666]">Monto</label><input type="number" min="0" step="0.01" value={abono} onChange={(e) => setAbono(e.target.value)} className="w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5]" placeholder="0.00" /></div>
              <div className="flex-1"><label className="block mb-1 text-[10px] text-[#666]">Forma de pago</label><select value={forma} onChange={(e) => setForma(e.target.value)} className="w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-2 py-2 text-sm text-[#F5F5F5]">{FORMAS_PAGO.map((fp) => <option key={fp.codigo} value={fp.codigo}>{fp.label}</option>)}</select></div>
              <button disabled={accion === "abono"} onClick={registrarAbono} className="rounded-full bg-[#D7FF4F] text-[#151515] px-4 py-2 text-xs font-bold hover:brightness-105 disabled:opacity-40">{accion === "abono" ? "…" : "Abonar"}</button>
            </div>
          </div>
        )}
        {completa && activa && <p className="rounded-lg bg-emerald-900/20 border border-emerald-700/40 px-3 py-2 text-xs text-emerald-300">Pago completo — lista para facturar.</p>}

        {msg && <p className="rounded-lg bg-emerald-900/30 border border-emerald-700/40 px-3 py-2 text-sm text-emerald-300">{msg}</p>}
        {err && <p className="rounded-lg bg-red-900/30 border border-red-700/40 px-3 py-2 text-sm text-red-300">{err}</p>}

        {/* Acciones */}
        <div className="border-t border-[#2A2A22] pt-3 flex flex-wrap gap-2">
          {activa && <button onClick={() => { setErr(null); setMsg(null); setFacturarOpen(true); }} className="rounded-full bg-[#D7FF4F] text-[#151515] px-4 py-1.5 text-xs font-bold hover:brightness-105">🧾 Facturar</button>}
          <a href={`/facturacion/imprimir/reserva/${reserva.recordId}`} target="_blank" rel="noopener" className={btn}>🖨 Imprimir 2 tickets</a>
          <a href={`/api/facturacion/reservas/${reserva.recordId}/pdf`} target="_blank" rel="noopener" className={btn}>↓ PDF</a>
          {activa && <button disabled={accion === "liberar"} onClick={liberar} className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-red-500/60 hover:text-red-300 disabled:opacity-40">{accion === "liberar" ? "Liberando…" : "⊘ Liberar (saldo a favor)"}</button>}
        </div>
      </div>

      {facturarOpen && (
        <FacturarReservaModal
          reserva={reserva}
          onClose={() => setFacturarOpen(false)}
          onFacturada={() => { setFacturarOpen(false); setMsg("Reserva facturada"); onCambio(); }}
        />
      )}
    </div>
  );
}

// ─── Modal: facturar una reserva ──────────────────────────────────────────────
// Trae la prefactura del servidor (cliente + ítem + pagos = abonos + saldo),
// deja elegir la forma de pago del SALDO por cobrar, y emite por el endpoint
// compartido /api/facturacion/emitir con origen {tipo:"reserva"}.

type PreResumen = { numero: string; descripcionItem: string; importeTotal: number; totalAbonado: number; saldo: number };

function FacturarReservaModal({ reserva, onClose, onFacturada }: { reserva: Detalle; onClose: () => void; onFacturada: () => void }) {
  const [saldoForma, setSaldoForma] = useState("01");
  const [resumen, setResumen] = useState<PreResumen | null>(null);
  const [datosVenta, setDatosVenta] = useState<unknown>(null);
  const [cargando, setCargando] = useState(true);
  const [emitiendo, setEmitiendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // Mismo criterio que DetalleReserva: el clic afuera solo cierra si empezó
  // Y terminó en el fondo, para no cerrar el modal por soltar una selección
  // de texto fuera del cuadro.
  const [mouseDownEnFondo, setMouseDownEnFondo] = useState(false);

  const cargarPre = useCallback(async (forma: string) => {
    setCargando(true); setErr(null);
    try {
      const r = await fetch(`/api/facturacion/reservas/${reserva.recordId}/prefactura?saldoFormaPago=${encodeURIComponent(forma)}`);
      const d = await r.json();
      if (!d.success) { setErr(d.error ?? "No se pudo preparar la factura"); setResumen(null); setDatosVenta(null); }
      else { setResumen(d.data.resumen); setDatosVenta(d.data.datosVenta); }
    } catch { setErr("Error de red al preparar la factura"); }
    finally { setCargando(false); }
  }, [reserva.recordId]);

  useEffect(() => { cargarPre(saldoForma); }, [cargarPre, saldoForma]);

  async function emitir() {
    if (!datosVenta) return;
    setEmitiendo(true); setErr(null);
    try {
      const r = await fetch("/api/facturacion/emitir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datosVenta) });
      const d = await r.json();
      if (!d.success) { setErr(d.error ?? "Error al emitir"); return; }
      const res = d.data;
      if (res.estado === "AUTORIZADO") { setOk(`Factura ${res.numeroFactura} AUTORIZADA`); setTimeout(onFacturada, 1400); }
      else setErr(`La factura quedó ${res.estado}. ${(res.mensajes ?? []).map((m: { mensaje: string }) => m.mensaje).join(" · ")}`);
    } catch { setErr("Error de red al emitir"); }
    finally { setEmitiendo(false); }
  }

  const tieneSaldo = (resumen?.saldo ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => setMouseDownEnFondo(e.target === e.currentTarget)}
      onClick={(e) => { if (mouseDownEnFondo && e.target === e.currentTarget && !emitiendo) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[#2A2A22] bg-[#1A1A16] p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[#666]">Facturar reserva</p>
            <p className="text-lg font-bold font-mono text-[#F5F5F5]">{reserva.numero}</p>
          </div>
          {!emitiendo && <button onClick={onClose} className="text-[#666] hover:text-[#F5F5F5] text-xl leading-none">✕</button>}
        </div>

        {cargando ? (
          <div className="flex items-center gap-2 text-[#666] py-6"><Spinner /><span className="text-sm">Preparando factura…</span></div>
        ) : resumen ? (
          <>
            <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-sm space-y-1">
              <div className="flex justify-between gap-3"><span className="text-[#666]">Ítem</span><span className="text-[#F5F5F5] text-right">{resumen.descripcionItem}</span></div>
              <div className="flex justify-between"><span className="text-[#666]">Total (IVA incl.)</span><span className="text-[#F5F5F5]">{mon(resumen.importeTotal)}</span></div>
              <div className="flex justify-between"><span className="text-[#666]">Abonado previo</span><span className="text-[#F5F5F5]">{mon(resumen.totalAbonado)}</span></div>
              <div className="flex justify-between text-base font-bold border-t border-[#2A2A22] pt-1 mt-1"><span className="text-[#F5F5F5]">Saldo a cobrar hoy</span><span className="text-[#D7FF4F]">{mon(resumen.saldo)}</span></div>
            </div>

            {tieneSaldo && (
              <div>
                <label className="block mb-1 text-[10px] text-[#666] uppercase tracking-wider">Forma de pago del saldo</label>
                <select value={saldoForma} onChange={(e) => setSaldoForma(e.target.value)} disabled={emitiendo} className="w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-2 py-2 text-sm text-[#F5F5F5]">{FORMAS_PAGO.map((fp) => <option key={fp.codigo} value={fp.codigo}>{fp.label}</option>)}</select>
              </div>
            )}
            {!tieneSaldo && <p className="rounded-lg bg-emerald-900/20 border border-emerald-700/40 px-3 py-2 text-xs text-emerald-300">Reserva pagada por completo con los abonos — no hay saldo por cobrar.</p>}

            <p className="text-[11px] text-[#666]">Los abonos previos ya se registraron como anticipo; al facturar solo se cobra el saldo. El ítem se marca vendido y se descuenta del inventario.</p>

            {ok && <p className="rounded-lg bg-emerald-900/30 border border-emerald-700/40 px-3 py-2 text-sm text-emerald-300">{ok}</p>}
            {err && <p className="rounded-lg bg-red-900/30 border border-red-700/40 px-3 py-2 text-sm text-red-300">{err}</p>}
            {emitiendo && <p className="text-[11px] text-yellow-300">Emitiendo y autorizando en el SRI… puede tardar hasta un minuto. No cierres esta ventana.</p>}

            <div className="flex justify-end gap-2 pt-1">
              {!ok && <button onClick={onClose} disabled={emitiendo} className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:text-[#F5F5F5] disabled:opacity-40">Cancelar</button>}
              {!ok && <button onClick={emitir} disabled={emitiendo || !datosVenta} className="rounded-full bg-[#D7FF4F] text-[#151515] px-5 py-2 text-sm font-bold hover:brightness-105 disabled:opacity-40">{emitiendo ? "Emitiendo…" : "Emitir factura"}</button>}
            </div>
          </>
        ) : (
          <>
            {err && <p className="rounded-lg bg-red-900/30 border border-red-700/40 px-3 py-2 text-sm text-red-300">{err}</p>}
            <div className="flex justify-end"><button onClick={onClose} className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:text-[#F5F5F5]">Cerrar</button></div>
          </>
        )}
      </div>
    </div>
  );
}
