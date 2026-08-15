"use client";

// Historial de notas de crédito (Fase 18 PR1e — cierra el hueco que reportó
// el dueño: una vez emitida, no había forma de volver a abrirla).

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";

type NotaCredito = {
  recordId:               string;
  claveAcceso:            string;
  numeroNotaCredito:      string;
  estado:                 string;
  ambiente:               "PRUEBAS" | "PRODUCCIÓN";
  fechaEmision:           string;
  numeroFacturaModificada: string;
  clienteNombre:          string;
  clienteIdentificacion:  string;
  motivo:                 string;
  total:                  number;
  destino:                string;
  saldoDisponible:        number;
  mensajesSri:            string;
  tieneXml:               boolean;
  tieneRide:              boolean;
};

const ESTADO_BADGE: Record<string, string> = {
  AUTORIZADO:      "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  "NO AUTORIZADO": "bg-red-900/40 text-red-300 border-red-700/50",
  DEVUELTA:        "bg-orange-900/40 text-orange-300 border-orange-700/50",
  ANULADA:         "bg-neutral-800 text-neutral-400 border-neutral-700",
};


export function HistorialNotasCredito() {
  const [notas, setNotas]     = useState<NotaCredito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [qCliente, setQCliente] = useState("");
  const [qNumero, setQNumero]   = useState("");
  const [expandida, setExpandida] = useState<string | null>(null);

  // Caducidades: el crédito no usado se convierte en ingreso a los 6 meses.
  // Se dispara a mano al cerrar el mes; el endpoint es idempotente, así que
  // pulsarlo de más no cuesta nada. Ver docs/DISENO_NC_REVERSA_Y_CADUCIDAD.md.
  const [caducando, setCaducando] = useState(false);
  const [avisoCaducidad, setAvisoCaducidad] = useState<string | null>(null);

  async function procesarCaducidades() {
    setCaducando(true);
    setAvisoCaducidad(null);
    try {
      const r = await fetch("/api/facturacion/nota-credito/caducidades", { method: "POST" });
      const d = await r.json();
      if (!d.success) { setAvisoCaducidad(`No se pudo procesar: ${d.error}`); return; }

      const { procesadas = [], fallidas = [], montoTotal = 0, motivo } = d.data ?? {};
      if (motivo && procesadas.length === 0 && fallidas.length === 0) {
        setAvisoCaducidad(motivo);
      } else if (procesadas.length === 0 && fallidas.length === 0) {
        setAvisoCaducidad("No hay créditos vencidos por procesar.");
      } else {
        const partes = [
          `${procesadas.length} crédito(s) caducado(s) por $${montoTotal.toFixed(2)}, registrados como ingreso.`,
        ];
        if (fallidas.length) {
          partes.push(`${fallidas.length} no se pudo procesar: ${fallidas.map((f: { numeroNotaCredito: string }) => f.numeroNotaCredito).join(", ")}.`);
        }
        setAvisoCaducidad(partes.join(" "));
        cargar();
      }
    } catch (e) {
      setAvisoCaducidad(e instanceof Error ? e.message : "Error al procesar las caducidades");
    } finally {
      setCaducando(false);
    }
  }

  function cargar() {
    setCargando(true);
    const p = new URLSearchParams();
    if (qCliente.trim()) p.set("cliente", qCliente.trim());
    if (qNumero.trim())  p.set("numero", qNumero.trim());
    fetch(`/api/facturacion/nota-credito/historial?${p}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setNotas(j.data.notas); else setError(j.error); })
      .catch(() => setError("Error de red al cargar"))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  const suma = notas.reduce((s, n) => s + (n.estado === "AUTORIZADO" ? n.total : 0), 0);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-[#F5F5F5]">Historial de Notas de Crédito</h1>
          <p className="text-xs text-[#666]">{notas.length} en pantalla · ${suma.toFixed(2)} acreditado (autorizadas)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={procesarCaducidades}
            disabled={caducando}
            title="Convierte en ingreso el crédito de las notas que vencieron sin usarse (6 meses). Se puede pulsar las veces que haga falta: no duplica."
            className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5] disabled:opacity-40"
          >
            {caducando ? "Procesando…" : "⏳ Procesar caducidades"}
          </button>
          <Link href="/facturacion/historial" className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]">
            ← Facturas
          </Link>
        </div>
      </div>

      {avisoCaducidad && (
        <p className="mb-3 rounded-lg border border-[#3A3A36] bg-[#1F1F1A] px-3 py-2 text-sm text-[#A7A7A7]">
          {avisoCaducidad}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <input value={qCliente} onChange={(e) => setQCliente(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()}
          placeholder="Cliente o cédula…" className="rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5]" />
        <input value={qNumero} onChange={(e) => setQNumero(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()}
          placeholder="N° NC o factura…" className="rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5]" />
        <button onClick={cargar} className="rounded-full bg-[#D7FF4F] text-[#151515] px-4 py-2 text-sm font-bold hover:brightness-105">Buscar</button>
      </div>

      {error && <p className="text-sm text-red-300 mb-3">{error}</p>}
      {cargando ? (
        <p className="text-sm text-[#A7A7A7]">Cargando…</p>
      ) : notas.length === 0 ? (
        <p className="text-sm text-[#A7A7A7]">No hay notas de crédito todavía.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#3A3A36]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-[#666] uppercase tracking-wider border-b border-[#3A3A36] bg-[#151614]">
                <th className="py-2 px-3 text-left">Fecha</th>
                <th className="py-2 px-3 text-left">N° NC</th>
                <th className="py-2 px-3 text-left">Modifica factura</th>
                <th className="py-2 px-3 text-left">Cliente</th>
                <th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3 text-center">Estado SRI</th>
                <th className="py-2 px-3 text-center">Validez</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <Fragment key={n.recordId}>
                  <tr onClick={() => setExpandida(expandida === n.recordId ? null : n.recordId)}
                      className="border-b border-[#2A2B28] hover:bg-[#1F201C] cursor-pointer">
                    <td className="py-2 px-3 text-[#A7A7A7]">{n.fechaEmision}</td>
                    <td className="py-2 px-3 text-[#F5F5F5] font-mono text-xs">{n.numeroNotaCredito}</td>
                    <td className="py-2 px-3 text-[#A7A7A7] font-mono text-xs">{n.numeroFacturaModificada}</td>
                    <td className="py-2 px-3 text-[#F5F5F5]">{n.clienteNombre}</td>
                    <td className="py-2 px-3 text-right text-[#D7FF4F] font-semibold">${n.total.toFixed(2)}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${ESTADO_BADGE[n.estado] ?? "bg-neutral-800 text-neutral-400 border-neutral-700"}`}>{n.estado}</span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {n.estado === "AUTORIZADO"
                        ? <span className="inline-block rounded-full border px-2 py-0.5 text-[10px] bg-emerald-900/40 text-emerald-300 border-emerald-700/50">Vigente</span>
                        : <span className="text-[#666]">—</span>}
                    </td>
                  </tr>
                  {expandida === n.recordId && (
                    <tr className="bg-[#151614] border-b border-[#2A2B28]">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div><span className="text-[#666]">Motivo:</span> <span className="text-[#F5F5F5]">{n.motivo || "—"}</span></div>
                          {n.destino && <div><span className="text-[#666]">Destino del dinero:</span> <span className="text-[#F5F5F5]">{n.destino}</span></div>}
                          <div><span className="text-[#666]">Clave de acceso:</span> <span className="text-[#A7A7A7] break-all">{n.claveAcceso}</span></div>
                          {n.mensajesSri && <div className="md:col-span-2"><span className="text-[#666]">Mensajes SRI:</span> <span className="text-red-300 whitespace-pre-wrap">{n.mensajesSri}</span></div>}
                        </div>
                        {n.estado === "AUTORIZADO" && (
                          <div className="mt-3 text-xs">
                            <span className="text-[#666]">Crédito disponible:</span>{" "}
                            <span className={n.saldoDisponible > 0 ? "text-[#D7FF4F] font-semibold" : "text-[#666]"}>
                              ${n.saldoDisponible.toFixed(2)}
                            </span>
                            {n.saldoDisponible > 0 && <span className="text-[#666]"> de ${n.total.toFixed(2)}</span>}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {n.estado === "AUTORIZADO" && n.saldoDisponible > 0 && (
                            <Link href={`/facturacion/nueva?reemplazoNC=${n.recordId}`}
                              className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] px-3 py-1.5 text-xs font-bold hover:brightness-105">
                              Facturar reemplazo →
                            </Link>
                          )}
                          {n.tieneRide && (
                            <a href={`/api/facturacion/nota-credito/ride/${n.claveAcceso}`} target="_blank" rel="noopener"
                              className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">↓ RIDE PDF</a>
                          )}
                          {n.tieneXml && (
                            <a href={`/api/facturacion/nota-credito/xml/${n.claveAcceso}`} download
                              className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">↓ XML</a>
                          )}
                        </div>
                        {n.estado === "AUTORIZADO" && (
                          <p className="mt-3 text-[10px] text-[#666]">
                            Nota de crédito autorizada y vigente. Si en el futuro se solicita su anulación, el trámite
                            se hace en el portal del SRI (la anulación sí requiere aceptación del receptor).
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
