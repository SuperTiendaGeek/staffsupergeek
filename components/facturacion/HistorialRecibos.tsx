"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Recibo = {
  recordId: string; numero: string; fecha: string; estado: string;
  clienteNombre: string; clienteIdentificacion: string; total: number; formaPago: string; tienePdf: boolean;
};

const FP: Record<string, string> = { "01": "Efectivo", "16": "T. débito", "17": "Dinero elec.", "18": "T. prepago", "19": "T. crédito", "20": "Otros", "21": "Endoso" };
const BADGE: Record<string, string> = {
  Vigente: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  Anulado: "bg-neutral-800 text-neutral-400 border-neutral-700",
};

export function HistorialRecibos() {
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [anulando, setAnulando] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    const p = new URLSearchParams();
    if (q.trim()) p.set("cliente", q.trim());
    fetch(`/api/facturacion/recibos?${p}`).then((r) => r.json())
      .then((j) => { if (j.success) setRecibos(j.data.recibos); })
      .finally(() => setCargando(false));
  }
  useEffect(cargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function anular(recordId: string, numero: string) {
    if (!confirm(`¿Anular el recibo ${numero}? Se devolverá el stock y se revertirá el ingreso.`)) return;
    setAnulando(recordId);
    try {
      const r = await fetch(`/api/facturacion/recibos/${recordId}/anular`, { method: "POST" });
      const j = await r.json();
      if (!j.success) alert(j.error ?? "No se pudo anular");
      else cargar();
    } finally { setAnulando(null); }
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-[#F5F5F5]">Recibos</h1>
        <div className="flex gap-2">
          <Link href="/facturacion/historial" className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]">← Facturas</Link>
          <Link href="/facturacion/recibos/nuevo" className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] hover:brightness-105">+ Nuevo recibo</Link>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} placeholder="Cliente o cédula…" className="rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5]" />
        <button onClick={cargar} className="rounded-full bg-[#D7FF4F] text-[#151515] px-4 py-2 text-sm font-bold hover:brightness-105">Buscar</button>
      </div>

      {cargando ? <p className="text-sm text-[#A7A7A7]">Cargando…</p>
        : recibos.length === 0 ? <p className="text-sm text-[#A7A7A7]">No hay recibos todavía.</p>
        : (
          <div className="overflow-x-auto rounded-xl border border-[#3A3A36]">
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] text-[#666] uppercase tracking-wider border-b border-[#3A3A36] bg-[#151614]">
                <th className="py-2 px-3 text-left">Fecha</th><th className="py-2 px-3 text-left">Número</th><th className="py-2 px-3 text-left">Cliente</th><th className="py-2 px-3 text-left">Pago</th><th className="py-2 px-3 text-right">Total</th><th className="py-2 px-3 text-center">Estado</th><th className="py-2 px-3 text-right">Acciones</th>
              </tr></thead>
              <tbody>
                {recibos.map((r) => (
                  <tr key={r.recordId} className="border-b border-[#2A2B28] hover:bg-[#1F201C]">
                    <td className="py-2 px-3 text-[#A7A7A7]">{r.fecha}</td>
                    <td className="py-2 px-3 text-[#F5F5F5] font-mono text-xs">{r.numero}</td>
                    <td className="py-2 px-3 text-[#F5F5F5]">{r.clienteNombre}</td>
                    <td className="py-2 px-3 text-[#A7A7A7] text-xs">{FP[r.formaPago] ?? r.formaPago}</td>
                    <td className="py-2 px-3 text-right text-[#D7FF4F] font-semibold">${r.total.toFixed(2)}</td>
                    <td className="py-2 px-3 text-center"><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${BADGE[r.estado] ?? ""}`}>{r.estado}</span></td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      {r.tienePdf && <a href={`/api/facturacion/recibos/${r.recordId}/pdf`} target="_blank" rel="noopener" className="text-[#A7A7A7] hover:text-[#D7FF4F] underline text-xs mr-3">↓ PDF</a>}
                      {r.estado === "Vigente" && <button disabled={anulando === r.recordId} onClick={() => anular(r.recordId, r.numero)} className="text-red-400 hover:text-red-300 underline text-xs disabled:opacity-40">{anulando === r.recordId ? "Anulando…" : "Anular"}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
