"use client";

// Pantalla única de Facturación (rediseño de pantallas).
//
// Reemplaza la navegación dispersa (form + historial + recibos + proformas +
// NC + anulaciones en páginas separadas) por UNA sola pantalla:
//   · Barra fija superior: buscador universal + "Nuevo documento" + acciones
//     contextuales que se activan según el documento seleccionado.
//   · Chips de grupo: Ventas (factura + recibo), Proformas, Notas de crédito,
//     y acceso a "Anulaciones pendientes" con contador.
//   · Listado unificado con badge de tipo. Al seleccionar una fila, la barra
//     superior habilita las acciones propias de ese tipo.
//   · El buscador es universal (nombre, cédula/RUC, correo, número) y trasciende
//     los chips: al escribir, busca en todos los tipos a la vez.
//
// Esta pantalla NO emite documentos ni toca el flujo de producción: solo lista
// y dispara acciones sobre endpoints ya existentes.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DocumentoResumen, GrupoVista, TipoDocumento, DocumentoCuerpo } from "@/lib/facturacion/documentos/tipos";
import { TIPO_LABEL } from "@/lib/facturacion/documentos/tipos";

// ─── Presentación ─────────────────────────────────────────────────────────────

const mon = (n: number) => `$${n.toFixed(2)}`;
const fmt = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const FORMA_PAGO_LABEL: Record<string, string> = {
  "01": "Efectivo", "15": "Compensación de deudas", "16": "Tarjeta de débito",
  "17": "Dinero electrónico", "18": "Tarjeta prepago", "19": "Tarjeta de crédito",
  "20": "Otros (sist. financiero)", "21": "Endoso de títulos",
};

const TIPO_BADGE: Record<TipoDocumento, string> = {
  factura:     "bg-[#D7FF4F]/15 text-[#D7FF4F] border-[#D7FF4F]/40",
  recibo:      "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  proforma:    "bg-blue-900/40 text-blue-300 border-blue-700/50",
  notaCredito: "bg-amber-900/40 text-amber-300 border-amber-700/50",
};

const ESTADO_FACTURA_LABEL: Record<string, string> = {
  AUTORIZADO: "Autorizada", DEVUELTA: "Devuelta", "NO AUTORIZADO": "No autorizada",
  PENDIENTE: "En proceso", RECIBIDA: "En proceso", BORRADOR: "Borrador", ANULADA: "Anulada",
};

function estadoLabel(d: DocumentoResumen): string {
  if (d.tipo === "factura") return ESTADO_FACTURA_LABEL[d.estado] ?? d.estado;
  return d.estado || "—";
}

function estadoColor(estado: string): string {
  const e = estado.toUpperCase();
  if (["AUTORIZADO", "VIGENTE", "FACTURADA", "AUTORIZADA"].includes(e)) return "text-emerald-400";
  if (["ANULADA", "ANULADO", "NO AUTORIZADO", "DEVUELTA", "RECHAZADA"].includes(e)) return "text-red-400";
  if (["PENDIENTE", "RECIBIDA", "SOLICITADA", "VENCIDA"].includes(e)) return "text-yellow-300";
  return "text-[#A7A7A7]";
}

const CHIPS: Array<{ id: GrupoVista; label: string; hint: string }> = [
  { id: "ventas",    label: "Ventas",           hint: "factura + recibo" },
  { id: "proformas", label: "Proformas",        hint: "" },
  { id: "nc",        label: "Notas de crédito", hint: "" },
];

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ─── Barra de acciones (reacciona al documento seleccionado) ──────────────────

type AccionesProps = {
  doc: DocumentoResumen | null;
  accion: string | null;
  onPost: (url: string, label: string, body?: Record<string, unknown>) => void;
};

const btnLink  = "rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] transition whitespace-nowrap";
const btnDanger = "rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-red-500/60 hover:text-red-300 transition whitespace-nowrap disabled:opacity-40";
const btnOff   = "rounded-full border border-[#2A2A22] px-3 py-1.5 text-xs text-[#555] cursor-not-allowed whitespace-nowrap";

function BarraAcciones({ doc, accion, onPost }: AccionesProps) {
  if (!doc) {
    return <span className="text-xs text-[#555] italic">Selecciona un documento para ver sus acciones</span>;
  }

  const ocupado = !!accion;

  if (doc.tipo === "factura") {
    const emitida = doc.estado === "AUTORIZADO";
    return (
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/facturacion/imprimir/factura/${doc.recordId}`} target="_blank" rel="noopener" className={btnLink}>🖨 Imprimir 80 mm</a>
        {doc.tieneRide && <a href={`/api/facturacion/ride/${doc.claveAcceso}`} target="_blank" rel="noopener" className={btnLink}>↓ RIDE PDF</a>}
        {doc.tieneXml && <a href={`/api/facturacion/xml/${doc.claveAcceso}`} download={`${doc.claveAcceso}.xml`} className={btnLink}>↓ XML</a>}
        {emitida && doc.clienteCorreo && (
          <button disabled={ocupado} onClick={() => onPost(`/api/facturacion/historial/${doc.recordId}/reenviar`, "Reenviar correo")} className={`${btnLink} disabled:opacity-40 flex items-center gap-1`}>
            {accion === "Reenviar correo" ? <><Spinner /> Enviando…</> : "✉ Reenviar correo"}
          </button>
        )}
        {emitida && <Link href={`/facturacion/nota-credito/${doc.recordId}`} className={btnLink}>↩ Nota de crédito</Link>}
        {emitida && (
          <button disabled={ocupado} onClick={() => onPost(`/api/facturacion/anulaciones/${doc.recordId}`, "Solicitar anulación", { accion: "solicitar" })} className={btnDanger}>
            {accion === "Solicitar anulación" ? "Registrando…" : "⊘ Solicitar anulación"}
          </button>
        )}
      </div>
    );
  }

  if (doc.tipo === "recibo") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/facturacion/imprimir/recibo/${doc.recordId}`} target="_blank" rel="noopener" className={btnLink}>🖨 Imprimir 80 mm</a>
        {doc.tienePdf && <a href={`/api/facturacion/recibos/${doc.recordId}/pdf`} target="_blank" rel="noopener" className={btnLink}>↓ PDF</a>}
        {doc.estado === "Vigente" && (
          <button disabled={ocupado} onClick={() => onPost(`/api/facturacion/recibos/${doc.recordId}/anular`, "Anular recibo")} className={btnDanger}>
            {accion === "Anular recibo" ? "Anulando…" : "⊘ Anular recibo"}
          </button>
        )}
      </div>
    );
  }

  if (doc.tipo === "proforma") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {doc.tienePdf && <a href={`/api/facturacion/proformas/${doc.recordId}/pdf`} target="_blank" rel="noopener" className={btnLink}>↓ PDF</a>}
        <button className={btnOff} disabled title="Disponible en la próxima fase">→ Facturar · pronto</button>
      </div>
    );
  }

  // notaCredito
  return (
    <div className="flex flex-wrap items-center gap-2">
      {doc.tieneRide && <a href={`/api/facturacion/nota-credito/ride/${doc.claveAcceso}`} target="_blank" rel="noopener" className={btnLink}>↓ RIDE PDF</a>}
      {doc.tieneXml && <a href={`/api/facturacion/nota-credito/xml/${doc.claveAcceso}`} download={`${doc.claveAcceso}.xml`} className={btnLink}>↓ XML</a>}
      <Link href={`/facturacion/nueva?reemplazoNC=${doc.recordId}`} className={btnLink}>→ Facturar reemplazo</Link>
    </div>
  );
}

// ─── Menú "Nuevo documento" ───────────────────────────────────────────────────

function NuevoDocumento() {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function fuera(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);
  const item = "block px-4 py-2 text-sm text-[#F5F5F5] hover:bg-[#1F1F1A]";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAbierto((v) => !v)} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] hover:brightness-105 whitespace-nowrap">
        + Nuevo documento
      </button>
      {abierto && (
        <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-[#2A2A22] bg-[#1A1A16] shadow-xl">
          <Link href="/facturacion/nueva" className={item}>Factura</Link>
          <Link href="/facturacion/recibos/nuevo" className={item}>Recibo</Link>
          <Link href="/facturacion/proformas/nueva" className={item}>Proforma</Link>
        </div>
      )}
    </div>
  );
}

// ─── Visualizador de documento (ventana flotante) ────────────────────────────

function DocumentoDetalleModal({
  doc, accion, onPost, onClose,
}: {
  doc: DocumentoResumen;
  accion: string | null;
  onPost: (url: string, label: string, body?: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [cuerpo, setCuerpo]     = useState<DocumentoCuerpo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [err, setErr]           = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setErr(null); setCuerpo(null);
    fetch(`/api/facturacion/documentos/${doc.tipo}/${doc.recordId}`)
      .then((r) => r.json())
      .then((d: { success: boolean; data?: DocumentoCuerpo; error?: string }) => {
        if (!vivo) return;
        if (d.success && d.data) setCuerpo(d.data);
        else setErr(d.error ?? "No se pudo cargar el detalle");
      })
      .catch(() => { if (vivo) setErr("Error de red al cargar el detalle"); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [doc.tipo, doc.recordId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-[#2A2A22] bg-[#1A1A16] shadow-2xl">
        {/* Encabezado */}
        <div className="sticky top-0 z-10 bg-[#1A1A16] border-b border-[#2A2A22] px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TIPO_BADGE[doc.tipo]}`}>{TIPO_LABEL[doc.tipo]}</span>
              <span className={`text-xs ${estadoColor(doc.estado)}`}>{estadoLabel(doc)}</span>
              {doc.ambiente && <span className="text-[10px] text-[#666]">{doc.ambiente}</span>}
            </div>
            <p className="mt-1 text-lg font-bold font-mono text-[#F5F5F5]">{doc.numero || "borrador"}</p>
            {doc.numeroDocModificado && <p className="text-xs text-[#888]">corrige {doc.numeroDocModificado}</p>}
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-[#F5F5F5] text-xl leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Cliente */}
          <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-sm space-y-1">
            <div className="flex justify-between gap-3"><span className="text-[#666]">Cliente</span><span className="text-[#F5F5F5] text-right">{doc.clienteNombre || "—"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-[#666]">Identificación</span><span className="text-[#F5F5F5] text-right">{doc.clienteIdentificacion || "—"}</span></div>
            {doc.clienteCorreo && <div className="flex justify-between gap-3"><span className="text-[#666]">Correo</span><span className="text-[#F5F5F5] text-right truncate">{doc.clienteCorreo}</span></div>}
            <div className="flex justify-between gap-3"><span className="text-[#666]">Fecha</span><span className="text-[#F5F5F5] text-right">{fmt(doc.fecha)}</span></div>
          </div>

          {/* Cuerpo (ítems + totales) */}
          {cargando ? (
            <div className="flex items-center justify-center py-8 text-[#555]"><Spinner /><span className="ml-2 text-sm">Cargando detalle…</span></div>
          ) : err ? (
            <p className="rounded-lg bg-red-900/20 border border-red-700/40 px-3 py-2 text-sm text-red-300">{err}</p>
          ) : cuerpo ? (
            <>
              {cuerpo.items.length > 0 ? (
                <div className="rounded-xl border border-[#2A2A22] bg-[#151510] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="text-[#555] border-b border-[#2A2A22]">
                      <th className="text-left font-semibold py-1.5 px-2">Descripción</th>
                      <th className="text-right font-semibold py-1.5 px-2">Cant.</th>
                      <th className="text-right font-semibold py-1.5 px-2">P.Unit</th>
                      <th className="text-right font-semibold py-1.5 px-2">Total</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[#1E1E1A]">
                      {cuerpo.items.map((it, i) => (
                        <tr key={i}>
                          <td className="py-1.5 px-2 text-[#F5F5F5]">{it.descripcion}</td>
                          <td className="py-1.5 px-2 text-right text-[#A7A7A7]">{it.cantidad}</td>
                          <td className="py-1.5 px-2 text-right text-[#A7A7A7]">{mon(it.precioUnitario)}</td>
                          <td className="py-1.5 px-2 text-right text-[#D7FF4F] font-semibold">{mon(it.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[#555] italic px-1">Detalle de ítems no disponible para este documento.</p>
              )}

              <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-sm space-y-1">
                {cuerpo.mostrarIva && cuerpo.subtotal !== null && <div className="flex justify-between"><span className="text-[#666]">Subtotal</span><span className="text-[#F5F5F5]">{mon(cuerpo.subtotal)}</span></div>}
                {cuerpo.mostrarIva && cuerpo.iva !== null && <div className="flex justify-between"><span className="text-[#666]">IVA</span><span className="text-[#F5F5F5]">{mon(cuerpo.iva)}</span></div>}
                <div className="flex justify-between text-base font-bold"><span className="text-[#F5F5F5]">TOTAL</span><span className="text-[#D7FF4F]">{mon(cuerpo.total)}</span></div>
              </div>

              {(cuerpo.formaPago || cuerpo.validezDias !== null || cuerpo.nota) && (
                <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-sm space-y-1">
                  {cuerpo.formaPago && <div className="flex justify-between gap-3"><span className="text-[#666]">Forma de pago</span><span className="text-[#F5F5F5] text-right">{FORMA_PAGO_LABEL[cuerpo.formaPago] ?? cuerpo.formaPago}</span></div>}
                  {cuerpo.validezDias !== null && <div className="flex justify-between gap-3"><span className="text-[#666]">Validez</span><span className="text-[#F5F5F5]">{cuerpo.validezDias} días</span></div>}
                  {cuerpo.nota && <div className="flex justify-between gap-3"><span className="text-[#666]">Nota</span><span className="text-[#F5F5F5] text-right">{cuerpo.nota}</span></div>}
                </div>
              )}

              {doc.claveAcceso && (
                <div className="rounded-xl border border-[#2A2A22] bg-[#151510] p-3 text-[10px] text-[#888] break-all">
                  <p className="text-[#666] font-semibold uppercase tracking-wider mb-1">SRI</p>
                  <p><span className="text-[#666]">Clave de acceso:</span> {doc.claveAcceso}</p>
                </div>
              )}
            </>
          ) : null}

          {/* Acciones (mismas que la barra superior) */}
          <div className="border-t border-[#2A2A22] pt-3">
            <p className="text-[10px] text-[#666] uppercase tracking-wider mb-2">Acciones</p>
            <BarraAcciones doc={doc} accion={accion} onPost={onPost} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function DocumentosFacturacion() {
  const [grupo, setGrupo]           = useState<GrupoVista>("ventas");
  const [q, setQ]                   = useState("");
  const [qAplicado, setQAplicado]   = useState("");
  const [docs, setDocs]             = useState<DocumentoResumen[]>([]);
  const [suma, setSuma]             = useState(0);
  const [cargando, setCargando]     = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [selId, setSelId]           = useState<string | null>(null);
  const [detalleDoc, setDetalleDoc] = useState<DocumentoResumen | null>(null);
  const [pendientes, setPendientes] = useState<number>(0);
  const [accion, setAccion]         = useState<string | null>(null);
  const [msg, setMsg]               = useState<string | null>(null);
  const [errMsg, setErrMsg]         = useState<string | null>(null);
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscando = qAplicado.trim() !== "";
  const seleccionado = docs.find((d) => d.recordId === selId) ?? null;

  const cargar = useCallback(async (g: GrupoVista, query: string) => {
    setCargando(true); setError(null);
    const params = new URLSearchParams({ grupo: g });
    if (query.trim()) params.set("q", query.trim());
    try {
      const r = await fetch(`/api/facturacion/documentos?${params}`);
      const d = await r.json() as { success: boolean; data?: { documentos: DocumentoResumen[]; suma: number }; error?: string };
      if (!d.success || !d.data) { setError(d.error ?? "Error al cargar"); setDocs([]); return; }
      setDocs(d.data.documentos);
      setSuma(d.data.suma);
    } catch { setError("Error de red al cargar los documentos"); setDocs([]); }
    finally { setCargando(false); }
  }, []);

  // Contador de anulaciones pendientes (una vez al montar y tras cada acción).
  const cargarPendientes = useCallback(async () => {
    try {
      const r = await fetch("/api/facturacion/anulaciones");
      const d = await r.json() as { success: boolean; data?: { solicitudes: unknown[] } };
      if (d.success && d.data) setPendientes(d.data.solicitudes.length);
    } catch { /* silencioso: el contador es informativo */ }
  }, []);

  useEffect(() => { cargarPendientes(); }, [cargarPendientes]);

  // Debounce del buscador.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQAplicado(q), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  // Recargar al cambiar grupo o búsqueda aplicada.
  useEffect(() => { cargar(grupo, qAplicado); setSelId(null); setDetalleDoc(null); }, [grupo, qAplicado, cargar]);

  function onPost(url: string, label: string, body?: Record<string, unknown>) {
    setAccion(label); setMsg(null); setErrMsg(null);
    fetch(url, body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { method: "POST" })
      .then((r) => r.json())
      .then((d: { success: boolean; error?: string }) => {
        if (d.success) { setMsg(`${label} · listo`); cargar(grupo, qAplicado); cargarPendientes(); }
        else setErrMsg(d.error ?? "Error");
      })
      .catch(() => setErrMsg("Error de red"))
      .finally(() => setAccion(null));
  }

  return (
    <div className="min-h-screen bg-[#151510] text-[#F5F5F5] p-4 md:p-6">
      {/* ── Barra fija superior ── */}
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 pb-3 pt-1 bg-[#151510]/95 backdrop-blur border-b border-[#2A2A22]">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-lg font-bold text-[#D7FF4F] whitespace-nowrap">Facturación</h1>
          <div className="flex-1 relative">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por cliente, cédula/RUC, correo o número de documento…"
              className="w-full rounded-lg border border-[#2A2A22] bg-[#1A1A16] px-4 py-2 text-sm text-[#F5F5F5] placeholder-[#555] focus:border-[#D7FF4F]/50 focus:outline-none"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#F5F5F5]">✕</button>
            )}
          </div>
          <NuevoDocumento />
        </div>

        {/* Acciones contextuales */}
        <div className="min-h-[34px] flex items-center">
          <BarraAcciones doc={seleccionado} accion={accion} onPost={onPost} />
        </div>
      </div>

      {/* Feedback de acciones */}
      {msg && <p className="mt-3 rounded-lg bg-emerald-900/30 border border-emerald-700/40 px-3 py-2 text-sm text-emerald-300">{msg}</p>}
      {errMsg && <p className="mt-3 rounded-lg bg-red-900/30 border border-red-700/40 px-3 py-2 text-sm text-red-300">{errMsg}</p>}

      {/* ── Chips de grupo + anulaciones ── */}
      <div className="flex items-center gap-2 flex-wrap mt-4 mb-4">
        {CHIPS.map((c) => {
          const activo = !buscando && grupo === c.id;
          return (
            <button
              key={c.id}
              onClick={() => { setQ(""); setGrupo(c.id); }}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                activo
                  ? "bg-[#D7FF4F]/15 text-[#D7FF4F] border border-[#D7FF4F]/50"
                  : "border border-[#3A3A36] text-[#A7A7A7] hover:border-[#D7FF4F]/40 hover:text-[#F5F5F5]"
              }`}
            >
              {c.label}{c.hint && <span className="text-[#666]"> · {c.hint}</span>}
            </button>
          );
        })}
        <Link
          href="/facturacion/anulaciones"
          className="ml-auto flex items-center gap-2 rounded-full border border-yellow-700/40 px-3 py-1.5 text-sm text-yellow-300 hover:border-yellow-400 transition"
        >
          ⏳ Anulaciones pendientes{pendientes > 0 && <span className="rounded-full bg-yellow-500/20 px-2 text-xs font-bold">{pendientes}</span>}
        </Link>
      </div>

      {/* Aviso de modo búsqueda */}
      {buscando && (
        <p className="mb-3 text-xs text-[#888]">
          Buscando <span className="text-[#D7FF4F]">«{qAplicado}»</span> en todos los tipos de documento. Limpia la búsqueda para volver a navegar por grupo.
        </p>
      )}

      {/* ── Resumen ── */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-[#2A2A22] bg-[#1A1A16] p-3">
          <p className="text-xs text-[#666]">Documentos en pantalla</p>
          <p className="text-2xl font-bold text-[#F5F5F5]">{docs.length}</p>
        </div>
        <div className="rounded-xl border border-[#2A2A22] bg-[#1A1A16] p-3">
          <p className="text-xs text-[#666]">Suma de totales</p>
          <p className="text-2xl font-bold text-[#D7FF4F]">{mon(suma)}</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300 mb-4">{error}</div>}

      {/* ── Listado ── */}
      <div className="rounded-xl border border-[#2A2A22] bg-[#1A1A16] overflow-hidden">
        <div className="hidden md:grid grid-cols-[104px_minmax(0,1.6fr)_minmax(0,1.4fr)_92px_96px_104px] gap-3 px-4 py-2 border-b border-[#2A2A22] text-xs font-semibold text-[#555] uppercase tracking-wider">
          <span>Tipo</span><span>Cliente</span><span>Número</span><span>Fecha</span><span className="text-right">Total</span><span className="text-right">Estado</span>
        </div>

        {cargando && docs.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-[#555]"><Spinner /><span className="ml-2 text-sm">Cargando…</span></div>
        ) : docs.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#555]">{buscando ? "No hay documentos que coincidan con la búsqueda." : "Aún no hay documentos en este grupo."}</div>
        ) : (
          docs.map((d) => {
            const sel = d.recordId === selId;
            return (
              <button
                key={`${d.tipo}-${d.recordId}`}
                onClick={() => { setSelId(d.recordId); setDetalleDoc(d); }}
                className={`w-full text-left px-4 py-2 border-b border-[#2A2A22] last:border-0 transition-colors md:grid md:grid-cols-[104px_minmax(0,1.6fr)_minmax(0,1.4fr)_92px_96px_104px] md:gap-3 md:items-center ${sel ? "bg-[#D7FF4F]/10" : "hover:bg-[#1F1F1A]"}`}
              >
                {/* Móvil */}
                <div className="md:hidden flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TIPO_BADGE[d.tipo]}`}>{TIPO_LABEL[d.tipo]}</span>
                  <span className="flex-1 truncate text-sm text-[#F5F5F5]">{d.clienteNombre || "—"}</span>
                  <span className="text-sm font-bold text-[#D7FF4F]">{mon(d.total)}</span>
                </div>
                <div className="md:hidden mt-0.5 text-xs font-mono text-[#777] truncate">{d.numero || "borrador"} · {fmt(d.fecha)} · <span className={estadoColor(d.estado)}>{estadoLabel(d)}</span></div>

                {/* Escritorio */}
                <span className="hidden md:flex items-center">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TIPO_BADGE[d.tipo]}`}>{TIPO_LABEL[d.tipo]}</span>
                </span>
                <span className="hidden md:block text-sm text-[#F5F5F5] truncate">{d.clienteNombre || "—"}</span>
                <span className="hidden md:block text-xs font-mono text-[#8A8A8A] truncate">
                  {d.numero || "borrador"}{d.numeroDocModificado && <span className="text-[#555]"> · corrige {d.numeroDocModificado}</span>}
                </span>
                <span className="hidden md:block text-sm text-[#A7A7A7]">{fmt(d.fecha)}</span>
                <span className="hidden md:block text-sm font-bold text-[#D7FF4F] text-right">{mon(d.total)}</span>
                <span className={`hidden md:block text-sm text-right ${estadoColor(d.estado)}`}>{estadoLabel(d)}</span>
              </button>
            );
          })
        )}
      </div>

      {/* Visualizador flotante del documento */}
      {detalleDoc && (
        <DocumentoDetalleModal
          doc={detalleDoc}
          accion={accion}
          onPost={(url, label, body) => { setDetalleDoc(null); onPost(url, label, body); }}
          onClose={() => setDetalleDoc(null)}
        />
      )}
    </div>
  );
}
