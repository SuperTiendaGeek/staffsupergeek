"use client";

import { useEffect, useMemo, useState } from "react";
import { planDeCancelacion, type DestinoDinero } from "@/lib/pedidos-especiales/cancelacion";

// "Cancelar pedido" (auditoría ops, punto 10C-3a; maqueta 5b aprobada el
// 13-nov). El sistema ya sabe si el pedido se confirmó con el proveedor; solo
// pregunta si el proveedor acepta cancelar. Lo que pasa con el dinero se ve
// antes de confirmar (la MISMA regla pura que aplica el servidor).

type Revision = {
  estado: string;
  confirmado: boolean;
  etapa: string;
  pagado: number;
  puedeCancelar: boolean;
  cuentasDevolucion: Array<{ id: string; nombre: string }>;
  metodosDevolucion: string[];
};

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;
const CAMPO = "h-8 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-2.5 text-sm text-[#F0F0EC] focus:border-[#D7FF4F]/70 focus:outline-none";
const SEG = "h-7 px-3 text-xs font-semibold transition";
const segClase = (on: boolean) => `${SEG} ${on ? "bg-[#3A3A36] text-[#F0F0EC]" : "bg-[#252622] text-[#A0A09A] hover:text-[#F0F0EC]"}`;

function aBase64(f: File): Promise<string> {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => mal(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(f);
  });
}

export function CancelarPedidoModal({ pedidoId, onCerrar, onCancelado }: {
  pedidoId: string;
  onCerrar: () => void;
  onCancelado: (aviso: string | null) => void;
}) {
  const [rev, setRev] = useState<Revision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [acepta, setAcepta] = useState<boolean | null>(null);
  const [destino, setDestino] = useState<DestinoDinero>("devolver");
  const [gastos, setGastos] = useState("");
  const [prueba, setPrueba] = useState<File | null>(null);
  const [cuenta, setCuenta] = useState("");
  const [metodo, setMetodo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/operaciones/${encodeURIComponent(pedidoId)}/cancelar`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (vivo) { if (j.success) setRev(j.data as Revision); else setError(j.error || "No se pudo revisar el pedido."); } })
      .catch(() => { if (vivo) setError("Error de red."); });
    return () => { vivo = false; };
  }, [pedidoId]);

  const plan = useMemo(() => rev && planDeCancelacion({
    estado: rev.estado,
    motivo: motivo || " ",
    confirmado: rev.confirmado,
    esStaffOAdmin: rev.puedeCancelar,
    proveedorAcepta: acepta,
    pagado: rev.pagado,
    destino,
    gastos: Number(gastos.replace(",", ".")) || 0,
    tienePrueba: !!prueba,
  }), [rev, motivo, acepta, destino, gastos, prueba]);
  const p = plan && plan.ok ? plan.plan : null;
  const resto = p ? p.devolver + p.saldoAFavor : 0;
  const pideDevolucion = !!p && p.devolver > 0.005;
  const devolucionLista = !pideDevolucion || (!!cuenta && !!metodo && (metodo === "Efectivo" || metodo === "Otro" || referencia.trim().length > 0));
  const listo = !!p && motivo.trim().length > 0 && devolucionLista && !enviando;

  const cancelar = async () => {
    if (!listo) return;
    setEnviando(true);
    setError(null);
    try {
      const cuerpo: Record<string, unknown> = { motivo, destino, proveedorAcepta: acepta };
      if (p!.caso === "proveedor_acepta") {
        cuerpo.gastos = Number(gastos.replace(",", ".")) || 0;
        if (prueba) cuerpo.prueba = { nombre: prueba.name, tipo: prueba.type, base64: await aBase64(prueba) };
      }
      if (pideDevolucion) cuerpo.reembolso = { cuentaOrigenId: cuenta, metodo, transaccionId: referencia.trim() };
      const res = await fetch(`/api/operaciones/${encodeURIComponent(pedidoId)}/cancelar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo cancelar.");
      onCancelado(j.data?.aviso ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm animate-[sg-velo_160ms_ease-out]" onClick={onCerrar}>
      <div role="dialog" aria-labelledby="cancelar-pedido-titulo" className="w-full max-w-sm space-y-3 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-2xl animate-[sg-modal_200ms_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h4 id="cancelar-pedido-titulo" className="text-sm font-semibold text-white">Cancelar pedido</h4>
          {rev && <span className="ml-auto rounded-full bg-[#2A2B27] px-2 py-0.5 text-[11px] font-semibold text-[#B5B5AE]">{rev.etapa}</span>}
        </div>

        {!rev && !error && <p className="text-xs text-[#A7A7A7]">Revisando…</p>}

        {rev && !rev.puedeCancelar && (
          <p className="text-xs text-[#FFB547]">Un pedido confirmado con el proveedor lo cancelan Staff o un administrador.</p>
        )}

        {rev && rev.puedeCancelar && (
          <>
            {rev.confirmado && (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs text-[#A0A09A]">¿El proveedor acepta cancelar?</span>
                <div role="group" aria-label="El proveedor acepta cancelar" className="inline-flex overflow-hidden rounded-lg border border-[#3A3A36]">
                  <button type="button" className={segClase(acepta === true)} onClick={() => setAcepta(true)}>Sí</button>
                  <button type="button" className={`${segClase(acepta === false)} border-l border-[#3A3A36]`} onClick={() => setAcepta(false)}>No</button>
                </div>
              </div>
            )}

            {(!rev.confirmado || acepta !== null) && (
              <div key={String(acepta)} className="space-y-2.5 animate-[sg-entrada_180ms_ease-out]">
                <dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 text-sm tabular-nums">
                  <dt className="text-[#A0A09A]">Pagado</dt><dd className="text-right text-[#F0F0EC]">{usd(rev.pagado)}</dd>
                  {acepta === true && (
                    <>
                      <dt><label htmlFor="gastos-cancelacion" className="text-[#A0A09A]">Gastos de cancelación</label></dt>
                      <dd className="text-right"><input id="gastos-cancelacion" inputMode="decimal" value={gastos} onChange={(e) => setGastos(e.target.value)} placeholder="0" className={`${CAMPO} w-24 text-right`} /></dd>
                      <dt className="text-[#A0A09A]">Prueba</dt>
                      <dd className="text-right">
                        <label className="inline-flex cursor-pointer items-center rounded-lg border border-[#3A3A36] px-2.5 py-1 text-xs font-semibold text-[#F0F0EC] hover:border-[#6A6A62]" title={prueba?.name ?? "Foto o PDF del cobro del proveedor"}>
                          {prueba ? "✓ Adjunta" : "Adjuntar"}
                          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setPrueba(e.target.files?.[0] ?? null)} />
                        </label>
                      </dd>
                    </>
                  )}
                  {p && p.saldoAFavor > 0.005 && (<><dt className="text-[#A0A09A]">{acepta === false ? "Saldo a favor (6 meses)" : "Saldo a favor"}</dt><dd className="text-right font-bold text-[#D7FF4F]">{usd(p.saldoAFavor)}</dd></>)}
                  {p && p.devolver > 0.005 && (<><dt className="text-[#A0A09A]">Se devuelve</dt><dd className="text-right font-bold text-[#D7FF4F]">{usd(p.devolver)}</dd></>)}
                  {p?.articuloAStock && (<><dt className="text-[#A0A09A]">Artículo</dt><dd className="text-right text-[#F0F0EC]">→ stock de la tienda</dd></>)}
                  {p?.articuloAlProveedor && rev.confirmado && (<><dt className="text-[#A0A09A]">Artículo</dt><dd className="text-right text-[#F0F0EC]">→ vuelve al proveedor</dd></>)}
                </dl>

                {acepta !== false && resto > 0.005 && (
                  <div role="group" aria-label="Qué se hace con el dinero" className="inline-flex overflow-hidden rounded-lg border border-[#3A3A36]">
                    <button type="button" className={segClase(destino === "devolver")} onClick={() => setDestino("devolver")}>Devolver</button>
                    <button type="button" className={`${segClase(destino === "saldo_a_favor")} border-l border-[#3A3A36]`} onClick={() => setDestino("saldo_a_favor")}>Saldo a favor</button>
                  </div>
                )}

                {pideDevolucion && (
                  <div className="grid grid-cols-2 gap-2 animate-[sg-entrada_180ms_ease-out]">
                    <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} aria-label="Sale de" className={CAMPO}>
                      <option value="">Sale de…</option>
                      {rev.cuentasDevolucion.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <select value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Cómo se devuelve" className={CAMPO}>
                      <option value="">Cómo…</option>
                      {rev.metodosDevolucion.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input value={referencia} onChange={(e) => setReferencia(e.target.value)} aria-label="N.º de transacción"
                      placeholder={metodo === "Efectivo" ? "N.º (opcional)" : "N.º de transacción"} className={`${CAMPO} col-span-2`} />
                  </div>
                )}

                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo" placeholder="Motivo" maxLength={300} className={`${CAMPO} w-full`} />
                {plan && !plan.ok && motivo.trim() && <p className="text-xs text-[#FFB547]">{plan.motivo}</p>}
              </div>
            )}
          </>
        )}

        {error && <p className="text-xs text-[#FF6B6B] animate-[sg-sacudir_300ms_ease-out]">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="rounded-lg px-3 py-1.5 text-sm text-[#A7A7A7] hover:text-white">Volver</button>
          <button type="button" onClick={() => void cancelar()} disabled={!listo}
            className="rounded-lg bg-[#FF6B6B] px-4 py-1.5 text-sm font-bold text-[#1E1F1C] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40">
            {enviando ? "Cancelando…" : "Cancelar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
