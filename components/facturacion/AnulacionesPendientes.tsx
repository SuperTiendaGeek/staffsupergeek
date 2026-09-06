"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Solicitud = {
  recordId: string; numeroFactura: string; fechaEmision: string; clienteNombre: string;
  clienteIdentificacion: string; total: number; fechaSolicitud: string;
  fechaLimite: string; diasRestantes: number;
};

function extraerAvisosRespuesta(respuesta: unknown): string[] {
  if (!respuesta || typeof respuesta !== "object") return [];
  const data = (respuesta as { data?: unknown }).data;
  if (!data || typeof data !== "object") return [];
  const avisos = (data as { avisos?: unknown }).avisos;
  if (!Array.isArray(avisos)) return [];
  return avisos.filter((aviso): aviso is string => typeof aviso === "string" && aviso.trim().length > 0);
}

export function AnulacionesPendientes() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [accion, setAccion] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    fetch("/api/facturacion/anulaciones").then((r) => r.json())
      .then((j) => { if (j.success) setSolicitudes(j.data.solicitudes); })
      .finally(() => setCargando(false));
  }
  useEffect(cargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function accionar(recordId: string, numero: string, tipo: "confirmar" | "rechazar") {
    const msg = tipo === "confirmar"
      ? `¿Confirmar que el SRI anuló la factura ${numero}?\n\nEsto marcará la factura como ANULADA, devolverá el stock al inventario y registrará la devolución del dinero (en producción). Hazlo solo después de confirmar la anulación en el portal del SRI.`
      : `¿Marcar como RECHAZADA la solicitud de anulación de ${numero}? La factura sigue siendo válida.`;
    if (!confirm(msg)) return;
    setAccion(recordId);
    setMensaje(null);
    try {
      const r = await fetch(`/api/facturacion/anulaciones/${recordId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: tipo }),
      });
      const j = await r.json();
      if (!j.success) alert(j.error ?? "No se pudo procesar");
      else {
        const avisos = extraerAvisosRespuesta(j);
        setMensaje(avisos.length > 0 ? [`${tipo === "confirmar" ? "Anulación registrada" : "Solicitud actualizada"}.`, ...avisos].join("\n") : null);
        cargar();
      }
    } finally { setAccion(null); }
  }

  function plazoBadge(dias: number) {
    if (dias < 0) return { txt: "Plazo vencido", cls: "bg-red-900/40 text-red-300 border-red-700/50" };
    if (dias <= 3) return { txt: `${dias} día(s)`, cls: "bg-orange-900/40 text-orange-300 border-orange-700/50" };
    return { txt: `${dias} día(s)`, cls: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" };
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-[#F5F5F5]">Anulaciones pendientes</h1>
          <p className="text-xs text-[#666]">Facturas con anulación solicitada — tramítalas en el portal del SRI antes del día límite.</p>
        </div>
        <Link href="/facturacion" className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]">← Facturas</Link>
      </div>

      {mensaje && (
        <p className="mb-3 rounded-lg border border-yellow-700/40 bg-yellow-900/20 px-3 py-2 text-sm text-yellow-200 whitespace-pre-wrap">
          {mensaje}
        </p>
      )}

      {cargando ? <p className="text-sm text-[#A7A7A7]">Cargando…</p>
        : solicitudes.length === 0 ? <p className="text-sm text-[#A7A7A7]">No hay anulaciones pendientes.</p>
        : (
          <div className="overflow-x-auto rounded-xl border border-[#3A3A36]">
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] text-[#666] uppercase tracking-wider border-b border-[#3A3A36] bg-[#151614]">
                <th className="py-2 px-3 text-left">Factura</th><th className="py-2 px-3 text-left">Emisión</th><th className="py-2 px-3 text-left">Cliente</th><th className="py-2 px-3 text-right">Total</th><th className="py-2 px-3 text-left">Solicitada</th><th className="py-2 px-3 text-left">Límite SRI</th><th className="py-2 px-3 text-center">Plazo</th><th className="py-2 px-3 text-right">Acciones</th>
              </tr></thead>
              <tbody>
                {solicitudes.map((s) => {
                  const b = plazoBadge(s.diasRestantes);
                  return (
                    <tr key={s.recordId} className="border-b border-[#2A2B28] hover:bg-[#1F201C]">
                      <td className="py-2 px-3 text-[#F5F5F5] font-mono text-xs">{s.numeroFactura}</td>
                      <td className="py-2 px-3 text-[#A7A7A7]">{s.fechaEmision}</td>
                      <td className="py-2 px-3 text-[#F5F5F5]">{s.clienteNombre}</td>
                      <td className="py-2 px-3 text-right text-[#D7FF4F] font-semibold">${s.total.toFixed(2)}</td>
                      <td className="py-2 px-3 text-[#A7A7A7]">{s.fechaSolicitud || "—"}</td>
                      <td className="py-2 px-3 text-[#F0C75E]">{s.fechaLimite}</td>
                      <td className="py-2 px-3 text-center"><span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${b.cls}`}>{b.txt}</span></td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <button disabled={accion === s.recordId} onClick={() => accionar(s.recordId, s.numeroFactura, "confirmar")} className="text-emerald-400 hover:text-emerald-300 underline text-xs mr-3 disabled:opacity-40">Anulada</button>
                        <button disabled={accion === s.recordId} onClick={() => accionar(s.recordId, s.numeroFactura, "rechazar")} className="text-[#A7A7A7] hover:text-red-300 underline text-xs disabled:opacity-40">Rechazada</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      <p className="mt-4 text-[10px] text-[#666]">
        &quot;Anulada&quot; = el SRI confirmó la anulación (devuelve stock y dinero). &quot;Rechazada&quot; = el receptor o el SRI no la aceptó (la factura sigue válida). Si el día 7 cae en feriado, verifica el último día hábil real en el portal del SRI.
      </p>
    </div>
  );
}
