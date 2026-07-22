"use client";

// Pantalla de emisión de nota de crédito (Fase 18 PR1d).
//
// Se abre SIEMPRE desde una factura existente: nunca se teclean líneas de
// cero. El usuario elige qué líneas acredita, cuántas unidades de cada una,
// si el cliente devolvió físicamente el item, y el motivo.
//
// La validación real vive en el servidor (/api/facturacion/nota-credito/*):
// lo de aquí es para dar feedback inmediato, no es la fuente de verdad.

import { useEffect, useState } from "react";
import Link from "next/link";

type DetalleFactura = {
  codigoPrincipal?: string;
  descripcion:      string;
  cantidad:         number;
  precioUnitario:   number;
  descuento:        number;
  precioTotalSinImpuesto: number;
  impuestos: Array<{ codigoPorcentaje: string; tarifa: number; baseImponible: number; valor: number }>;
  tipo?:            "producto" | "servicio";
  shippingItemId?:  string;
};

type FacturaOrigen = {
  recordId:              string;
  numeroFactura:         string;
  fechaEmision:          string;
  clienteNombre:         string;
  clienteIdentificacion: string;
  clienteCorreo:         string;
  total:                 number;
  totalYaAcreditado:     number;
  disponibleAcreditar:   number;
};

type Seleccion = { incluida: boolean; cantidad: number; devolucionFisica: boolean };

type ResultadoNC = {
  estado:            "AUTORIZADO" | "DEVUELTA" | "NO AUTORIZADO";
  numeroNotaCredito: string;
  claveAcceso:       string;
  mensajes?:         Array<{ identificador: string; tipo: string; mensaje: string; informacionAdicional?: string }>;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const CARD  = "rounded-xl border border-[#3A3A36] bg-[#1A1B18] p-5 mb-4";
const LABEL = "block text-[10px] font-bold uppercase tracking-wider text-[#A7A7A7] mb-1";
const INPUT = "w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/40";

export function NotaCreditoForm({ facturaRecordId }: { facturaRecordId: string }) {
  const [cargando, setCargando]   = useState(true);
  const [bloqueo, setBloqueo]     = useState<string | null>(null);
  const [factura, setFactura]     = useState<FacturaOrigen | null>(null);
  const [detalles, setDetalles]   = useState<DetalleFactura[]>([]);
  const [sel, setSel]             = useState<Seleccion[]>([]);
  const [motivo, setMotivo]       = useState("");
  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoNC | null>(null);

  useEffect(() => {
    fetch(`/api/facturacion/nota-credito/prefactura?facturaRecordId=${encodeURIComponent(facturaRecordId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) { setBloqueo(j.error ?? "No se pudo cargar la factura"); return; }
        if (j.data.bloqueado) { setBloqueo(j.data.motivo); return; }
        setFactura(j.data.factura);
        setDetalles(j.data.detalles);
        // Por defecto: todo incluido, cantidad completa, con devolución física
        // en las líneas de producto (el caso común es el cambio de equipo).
        setSel(j.data.detalles.map((d: DetalleFactura) => ({
          incluida: true,
          cantidad: d.cantidad,
          devolucionFisica: d.tipo === "producto",
        })));
      })
      .catch(() => setBloqueo("Error de red al cargar la factura"))
      .finally(() => setCargando(false));
  }, [facturaRecordId]);

  // ── Totales de la NC en construcción ──────────────────────────────────────
  let baseNC = 0, ivaNC = 0;
  detalles.forEach((d, i) => {
    const s = sel[i];
    if (!s?.incluida || !(s.cantidad > 0)) return;
    const proporcion = d.cantidad > 0 ? s.cantidad / d.cantidad : 0;
    const base = round2(d.precioTotalSinImpuesto * proporcion);
    baseNC += base;
    ivaNC  += round2(base * ((d.impuestos[0]?.tarifa ?? 0) / 100));
  });
  baseNC = round2(baseNC); ivaNC = round2(ivaNC);
  const totalNC = round2(baseNC + ivaNC);

  const excedeDisponible = !!factura && totalNC > factura.disponibleAcreditar + 0.01;

  function actualizar(i: number, cambios: Partial<Seleccion>) {
    setSel((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...cambios } : s)));
  }

  async function emitir() {
    setError(null);
    const lineas = sel
      .map((s, indice) => ({ indice, cantidadAcreditada: s.cantidad, devolucionFisica: s.devolucionFisica, incluida: s.incluida }))
      .filter((l) => l.incluida && l.cantidadAcreditada > 0)
      .map(({ indice, cantidadAcreditada, devolucionFisica }) => ({ indice, cantidadAcreditada, devolucionFisica }));

    if (lineas.length === 0) { setError("Selecciona al menos una línea a acreditar"); return; }
    if (motivo.trim().length < 10) { setError("El motivo debe ser específico (mínimo 10 caracteres)"); return; }
    if (excedeDisponible) { setError(`El total excede lo disponible para acreditar ($${factura?.disponibleAcreditar.toFixed(2)})`); return; }

    setEmitiendo(true);
    try {
      const r = await fetch("/api/facturacion/nota-credito/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facturaRecordId, motivo: motivo.trim(), lineas }),
      });
      const j = await r.json();
      if (!j.success) setError(j.error ?? "Error al emitir la nota de crédito");
      else setResultado(j.data as ResultadoNC);
    } catch {
      setError("Error de red al conectar con el servidor");
    } finally {
      setEmitiendo(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (cargando) return <p className="text-sm text-[#A7A7A7]">Cargando factura…</p>;

  if (bloqueo) {
    return (
      <div className="rounded-xl border border-[#F0C75E]/40 bg-[#F0C75E]/10 p-6">
        <p className="text-[#F0C75E] font-bold text-lg mb-2">No se puede emitir una nota de crédito</p>
        <p className="text-sm text-[#F5F5F5] mb-4">{bloqueo}</p>
        <Link href="/facturacion/historial" className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">← Volver al historial</Link>
      </div>
    );
  }

  if (resultado) {
    const ok = resultado.estado === "AUTORIZADO";
    return (
      <div className={`rounded-xl border p-6 ${ok ? "border-[#6EE7B7]/40 bg-[#064E3B]/40" : "border-red-500/40 bg-red-950/30"}`}>
        <p className={`font-bold text-lg mb-1 ${ok ? "text-[#6EE7B7]" : "text-red-300"}`}>
          {ok ? "✓ Nota de crédito AUTORIZADA" : `✕ ${resultado.estado}`}
        </p>
        <p className="text-sm text-[#F5F5F5] mb-1">No. {resultado.numeroNotaCredito}</p>
        <p className="text-[10px] text-[#A7A7A7] break-all mb-3">Clave de acceso: {resultado.claveAcceso}</p>
        {ok && (
          <p className="text-xs text-[#F0C75E] bg-[#F0C75E]/10 border-l-2 border-[#F0C75E] px-3 py-2 mb-3">
            El cliente debe <strong>aceptarla en SRI en línea dentro de 5 días hábiles</strong>. Si no responde,
            la nota queda sin efecto y el IVA de la factura original sigue vigente.
          </p>
        )}
        {!ok && (resultado.mensajes ?? []).map((m, i) => (
          <p key={i} className="text-xs text-red-300 mb-1">[{m.identificador}] {m.mensaje}{m.informacionAdicional ? ` — ${m.informacionAdicional}` : ""}</p>
        ))}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {ok && (
            <a
              href={`/api/facturacion/nota-credito/ride/${resultado.claveAcceso}`}
              target="_blank" rel="noopener"
              className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] px-4 py-2 text-xs font-bold hover:brightness-105"
            >
              Ver / Descargar RIDE
            </a>
          )}
          <Link href="/facturacion/nota-credito/historial" className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">Ver historial de notas de crédito</Link>
          <Link href="/facturacion/historial" className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">← Facturas</Link>
          {!ok && <button onClick={() => setResultado(null)} className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">Corregir y reintentar</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl">
      {/* Factura de origen */}
      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">1. Factura que se modifica</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className={LABEL}>Número</span><span className="text-[#F5F5F5]">{factura?.numeroFactura}</span></div>
          <div><span className={LABEL}>Fecha</span><span className="text-[#F5F5F5]">{factura?.fechaEmision}</span></div>
          <div><span className={LABEL}>Cliente</span><span className="text-[#F5F5F5]">{factura?.clienteNombre}</span></div>
          <div><span className={LABEL}>Total facturado</span><span className="text-[#F5F5F5]">${factura?.total.toFixed(2)}</span></div>
        </div>
        {!!factura && factura.totalYaAcreditado > 0 && (
          <p className="mt-3 text-xs text-[#F0C75E]">
            Esta factura ya tiene ${factura.totalYaAcreditado.toFixed(2)} acreditado.
            Disponible para acreditar: <strong>${factura.disponibleAcreditar.toFixed(2)}</strong>.
          </p>
        )}
      </div>

      {/* Líneas */}
      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">2. Qué se acredita</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[10px] text-[#666] uppercase tracking-wider border-b border-[#3A3A36]">
              <th className="py-2 pr-2 text-left font-semibold">Incluir</th>
              <th className="py-2 pr-2 text-left font-semibold">Descripción</th>
              <th className="py-2 pr-2 text-right font-semibold">Facturado</th>
              <th className="py-2 pr-2 text-right font-semibold">Acreditar</th>
              <th className="py-2 pr-2 text-center font-semibold">¿Devuelve el item?</th>
              <th className="py-2 pr-2 text-right font-semibold">Base</th>
            </tr>
          </thead>
          <tbody>
            {detalles.map((d, i) => {
              const s = sel[i];
              const proporcion = d.cantidad > 0 ? (s?.cantidad ?? 0) / d.cantidad : 0;
              const base = s?.incluida ? round2(d.precioTotalSinImpuesto * proporcion) : 0;
              return (
                <tr key={i} className="border-b border-[#2A2B28]">
                  <td className="py-2 pr-2">
                    <input type="checkbox" checked={s?.incluida ?? false} onChange={(e) => actualizar(i, { incluida: e.target.checked })} className="accent-[#D7FF4F]" />
                  </td>
                  <td className="py-2 pr-2 text-[#F5F5F5]">
                    {d.descripcion}
                    {d.codigoPrincipal && <span className="text-[10px] text-[#666] block">{d.codigoPrincipal}</span>}
                  </td>
                  <td className="py-2 pr-2 text-right text-[#A7A7A7]">{d.cantidad}</td>
                  <td className="py-2 pr-2 text-right">
                    <input
                      type="number" min={1} step={1} max={d.cantidad}
                      value={s?.cantidad ?? 0}
                      disabled={!s?.incluida}
                      onChange={(e) => actualizar(i, { cantidad: Math.min(d.cantidad, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
                      className="w-16 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5] disabled:opacity-40"
                    />
                  </td>
                  <td className="py-2 pr-2 text-center">
                    {d.tipo === "producto" ? (
                      <input type="checkbox" checked={s?.devolucionFisica ?? false} disabled={!s?.incluida}
                        onChange={(e) => actualizar(i, { devolucionFisica: e.target.checked })} className="accent-[#D7FF4F] disabled:opacity-40" />
                    ) : (
                      <span className="text-[10px] text-[#666]">servicio</span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right text-[#D7FF4F]">${base.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[10px] text-[#666]">
          &quot;¿Devuelve el item?&quot; marca que la mercadería vuelve físicamente al inventario. Desmárcalo si es
          solo un ajuste de precio sin devolución.
        </p>
      </div>

      {/* Motivo y totales */}
      <div className={CARD}>
        <h2 className="text-[#D7FF4F] font-bold text-sm mb-3">3. Motivo y total</h2>
        <label className={LABEL}>Motivo (obligatorio, específico)</label>
        <input
          type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej: Devolución de equipo por cambio a otro modelo"
          className={INPUT} maxLength={300}
        />
        <div className="mt-4 flex justify-end">
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-6 text-[#A7A7A7]">Subtotal</td><td className="text-right text-[#F5F5F5]">${baseNC.toFixed(2)}</td></tr>
              <tr><td className="pr-6 text-[#A7A7A7]">IVA</td><td className="text-right text-[#F5F5F5]">${ivaNC.toFixed(2)}</td></tr>
              <tr><td className="pr-6 font-bold text-[#F5F5F5]">Total a acreditar</td><td className="text-right font-bold text-[#D7FF4F]">${totalNC.toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
        {excedeDisponible && (
          <p className="mt-2 text-xs text-red-300 text-right">
            Excede lo disponible para acreditar (${factura?.disponibleAcreditar.toFixed(2)}).
          </p>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-300 bg-red-950/30 border border-red-500/40 rounded-lg px-4 py-3">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={emitir}
          disabled={emitiendo || totalNC <= 0}
          className="rounded-full bg-[#D7FF4F] text-[#151515] px-6 py-3 text-sm font-bold hover:brightness-105 disabled:opacity-40"
        >
          {emitiendo ? "Emitiendo…" : "Emitir Nota de Crédito →"}
        </button>
        <Link href="/facturacion/historial" className="text-xs text-[#A7A7A7] underline hover:text-[#F5F5F5]">Cancelar</Link>
      </div>
      <p className="mt-3 text-[10px] text-[#666]">
        La nota de crédito se envía al SRI en el momento. Recuerda: las facturas a consumidor final no admiten
        nota de crédito, y el cliente debe aceptarla en SRI en línea dentro de 5 días hábiles.
      </p>
    </div>
  );
}
