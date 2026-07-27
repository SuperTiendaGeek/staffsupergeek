"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Proforma = {
  recordId: string; numero: string; fecha: string; estado: string;
  clienteNombre: string; clienteIdentificacion: string; total: number; tienePdf: boolean;
};

const BADGE: Record<string, string> = {
  Vigente:   "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  Facturada: "bg-blue-900/40 text-blue-300 border-blue-700/50",
  Vencida:   "bg-neutral-800 text-neutral-400 border-neutral-700",
};

export function HistorialProformas() {
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");

  function cargar() {
    setCargando(true);
    const p = new URLSearchParams();
    if (q.trim()) p.set("cliente", q.trim());
    fetch(`/api/facturacion/proformas?${p}`).then((r) => r.json())
      .then((j) => { if (j.success) setProformas(j.data.proformas); })
      .finally(() => setCargando(false));
  }
  useEffect(cargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-[#F5F5F5]">Proformas</h1>
        <div className="flex gap-2">
          <Link href="/facturacion" className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]">← Facturas</Link>
          <Link href="/facturacion/proformas/nueva" className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] hover:brightness-105">+ Nueva proforma</Link>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} placeholder="Cliente o cédula…" className="rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5]" />
        <button onClick={cargar} className="rounded-full bg-[#D7FF4F] text-[#151515] px-4 py-2 text-sm font-bold hover:brightness-105">Buscar</button>
      </div>

      {cargando ? <p className="text-sm text-[#A7A7A7]">Cargando…</p>
        : proformas.length === 0 ? <p className="text-sm text-[#A7A7A7]">No hay proformas todavía.</p>
        : (
          <div className="overflow-x-auto rounded-xl border border-[#3A3A36]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-[#666] uppercase tracking-wider border-b border-[#3A3A36] bg-[#151614]">
                  <th className="py-2 px-3 text-left">Fecha</th>
                  <th className="py-2 px-3 text-left">Número</th>
                  <th className="py-2 px-3 text-left">Cliente</th>
                  <th className="py-2 px-3 text-right">Total</th>
                  <th className="py-2 px-3 text-center">Estado</th>
                  <th className="py-2 px-3 text-right">PDF</th>
                </tr>
              </thead>
              <tbody>
                {proformas.map((p) => (
                  <tr key={p.recordId} className="border-b border-[#2A2B28] hover:bg-[#1F201C]">
                    <td className="py-2 px-3 text-[#A7A7A7]">{p.fecha}</td>
                    <td className="py-2 px-3 text-[#F5F5F5] font-mono text-xs">{p.numero}</td>
                    <td className="py-2 px-3 text-[#F5F5F5]">{p.clienteNombre}</td>
                    <td className="py-2 px-3 text-right text-[#D7FF4F] font-semibold">${p.total.toFixed(2)}</td>
                    <td className="py-2 px-3 text-center"><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${BADGE[p.estado] ?? ""}`}>{p.estado}</span></td>
                    <td className="py-2 px-3 text-right">
                      {p.tienePdf ? <a href={`/api/facturacion/proformas/${p.recordId}/pdf`} target="_blank" rel="noopener" className="text-[#A7A7A7] hover:text-[#D7FF4F] underline text-xs">↓ PDF</a> : <span className="text-[#666] text-xs">—</span>}
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
