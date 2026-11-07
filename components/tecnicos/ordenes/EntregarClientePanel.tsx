"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MOTIVOS_SIN_COBRO, type EvaluacionEntrega, type DocumentoDeEntrega } from "@/lib/entrega/reglas";

// Entregar al cliente (auditoría ops, punto 6). La revisión la hace el
// servidor (GET) y la vuelve a hacer al entregar (POST): esta pantalla solo
// muestra qué falta y lleva a resolverlo donde vive (cobro, documento,
// Presupuesto u Operación). Nadie se salta la revisión.

type Revision = EvaluacionEntrega & {
  ordenCodigo: string;
  saldo: number;
  documento: DocumentoDeEntrega | null;
  sugerido: { retiradoPor: string; accesorios: string };
};

export type ResultadoEntrega = {
  comprobante: EvaluacionEntrega["comprobante"];
  historial: unknown;
  garantias?: { salidas?: string[]; vueltas?: string[]; reclamos?: string[]; avisos?: string[] };
};

const INPUT = "w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-2.5 py-1.5 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70 focus:outline-none";
const ACCION = "shrink-0 rounded-full border border-[#D7FF4F]/40 px-2.5 py-0.5 text-[11px] font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/10";

export function EntregarClientePanel({
  ordenId,
  onCerrar,
  onEntregada,
  onRegistrarPago,
  onIrA,
}: {
  ordenId: string;
  onCerrar: () => void;
  onEntregada: (r: ResultadoEntrega) => void;
  /** Abre el cobro de la orden (el mismo de la tarjeta Cuenta). */
  onRegistrarPago: () => void;
  /** Lleva a una tarjeta de la orden ("presupuesto" o "cuenta"). */
  onIrA: (donde: "presupuesto" | "cuenta") => void;
}) {
  const [rev, setRev] = useState<Revision | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [retira, setRetira] = useState("");
  const [accesorios, setAccesorios] = useState("");
  const [estado, setEstado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");

  const revisar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/entregar`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo revisar la orden.");
      const r = j.data as Revision;
      setRev(r);
      setRetira((v) => v || r.sugerido.retiradoPor);
      setAccesorios((v) => v || r.sugerido.accesorios);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revisar la orden.");
    } finally {
      setCargando(false);
    }
  }, [ordenId]);

  useEffect(() => { void revisar(); }, [revisar]);

  const sinCobro = rev?.comprobante === "sin-cobro";
  const revisionOk = !!rev && rev.revisiones.every((r) => r.ok);
  const formOk = retira.trim().length > 0 && (!sinCobro || (!!motivo && (motivo !== "Otro" || detalle.trim().length > 0)));

  const entregar = async () => {
    if (!revisionOk || !formOk || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/entregar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retiradoPor: retira, accesoriosDevueltos: accesorios, estadoAlEntregar: estado, motivoSinCobro: sinCobro ? motivo : "", detalleSinCobro: sinCobro ? detalle : "" }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        // Algo cambió desde que se abrió el panel: se vuelve a revisar.
        setError(j.error || "No se pudo entregar.");
        void revisar();
        return;
      }
      onEntregada(j.data as ResultadoEntrega);
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const accionDe = (clave: string) => {
    if (!rev) return null;
    if (clave === "cobro" && rev.saldo > 0.01) return <button type="button" className={ACCION} onClick={onRegistrarPago}>Registrar pago</button>;
    if (clave === "cobro") return <button type="button" className={ACCION} onClick={() => onIrA("cuenta")}>Ir a la cuenta</button>;
    if (clave === "licencias") return <button type="button" className={ACCION} onClick={() => onIrA("presupuesto")}>Ir a Presupuesto</button>;
    if (clave === "documento") return <Link className={ACCION} href={`/facturacion/nueva?origen=orden&recordId=${encodeURIComponent(ordenId)}`}>Emitir documento</Link>;
    return null;
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm animate-[sg-velo_160ms_ease-out]" onClick={onCerrar}>
      <div className="w-full max-w-lg space-y-3 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-2xl animate-[sg-modal_200ms_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Entregar al cliente{rev ? ` · ${rev.ordenCodigo}` : ""}</h4>
          <button type="button" onClick={() => void revisar()} disabled={cargando} className="text-[11px] text-[#A7A7A7] hover:text-[#D7FF4F] disabled:opacity-50">
            {cargando ? "Revisando…" : "Volver a revisar"}
          </button>
        </div>

        {rev && (
          <ul className="divide-y divide-[#3A3A36] rounded-lg border border-[#3A3A36] bg-[#1E1F1C]">
            {rev.revisiones.map((r) => (
              <li key={r.clave} className="px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`text-base leading-none ${r.ok ? "text-[#56E3A4]" : "text-[#FF6B6B]"}`}>{r.ok ? "✓" : "✕"}</span>
                  <span className={`flex-1 ${r.ok ? "text-[#CFCFCB]" : "font-semibold text-[#F5F5F5]"}`}>{r.texto}</span>
                  {!r.ok && accionDe(r.clave)}
                </div>
                {r.clave === "pendientes" && rev.pendientes.length > 0 && (
                  <ul className="mt-1.5 space-y-1 pl-6">
                    {rev.pendientes.map((p) => (
                      <li key={p.clave} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-[#CFCFCB]">{p.texto} <span className="text-[#A7A7A7]">· {p.detalle}</span></span>
                        {p.tipo === "linea"
                          ? <button type="button" className={ACCION} onClick={() => onIrA("presupuesto")}>Cancelar en Presupuesto</button>
                          : <Link className={ACCION} href={`/operaciones/${encodeURIComponent(p.refId)}`}>Abrir pedido</Link>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {rev && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-[#A7A7A7]">Retira</span>
              <input className={INPUT} value={retira} onChange={(e) => setRetira(e.target.value)} maxLength={120} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-[#A7A7A7]">Accesorios devueltos</span>
              <input className={INPUT} value={accesorios} onChange={(e) => setAccesorios(e.target.value)} placeholder="Ninguno" maxLength={300} />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-[#A7A7A7]">Estado al entregar <span className="text-[#A7A7A7]/60">(opcional)</span></span>
              <input className={INPUT} value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="Ej.: enciende, pantalla nueva" maxLength={300} />
            </label>
            {sinCobro && (
              <div className="space-y-1 sm:col-span-2 animate-[sg-entrada_180ms_ease-out]">
                <span className="text-xs font-medium text-[#A7A7A7]">Motivo sin cobro</span>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIVOS_SIN_COBRO.map((m) => (
                    <button key={m} type="button" onClick={() => setMotivo(m)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${motivo === m ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#1E1F1C]" : "border-[#3A3A36] text-[#CFCFCB] hover:border-[#D7FF4F]/60"}`}>
                      {m}
                    </button>
                  ))}
                </div>
                {motivo === "Otro" && (
                  <input className={`${INPUT} animate-[sg-entrada_180ms_ease-out]`} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="¿Por qué no se cobra?" maxLength={300} autoFocus />
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-[#FF6B6B] animate-[sg-sacudir_300ms_ease-out]">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="rounded-lg px-3 py-1.5 text-sm text-[#A7A7A7] hover:text-white">Cerrar</button>
          <button type="button" onClick={() => void entregar()} disabled={!revisionOk || !formOk || enviando || cargando}
            className="rounded-lg bg-[#D7FF4F] px-4 py-1.5 text-sm font-bold text-[#1E1F1C] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40">
            {enviando ? "Entregando…" : "Entregar"}
          </button>
        </div>
      </div>
    </div>
  );
}
