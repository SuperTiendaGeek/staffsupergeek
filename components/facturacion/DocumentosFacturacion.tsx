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
import type { DocumentoResumen, GrupoVista, TipoDocumento } from "@/lib/facturacion/documentos/tipos";
import type { DocumentoVisor } from "@/lib/facturacion/documentos/visor-tipos";
import { DocumentoModal } from "@/components/documentos/DocumentoModal";
import { TIPO_LABEL } from "@/lib/facturacion/documentos/tipos";
import { NuevoDocumentoModal, type TipoNuevoDocumento } from "@/components/facturacion/NuevoDocumentoModal";
import { ImprimirEtiquetaMantenimientoModal } from "@/components/print/ImprimirEtiquetaMantenimientoModal";
import { reservaVencida } from "@/lib/facturacion/reservas/reglas";

// ─── Presentación ─────────────────────────────────────────────────────────────

const mon = (n: number) => `$${n.toFixed(2)}`;
const fmt = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const TIPO_BADGE: Record<TipoDocumento, string> = {
  factura:     "bg-[#D7FF4F]/15 text-[#D7FF4F] border-[#D7FF4F]/40",
  recibo:      "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  proforma:    "bg-blue-900/40 text-blue-300 border-blue-700/50",
  notaCredito: "bg-amber-900/40 text-amber-300 border-amber-700/50",
};

// Mismo mapa de colores que HistorialFacturas.tsx (AMBIENTE_COLOR) — se
// repite aquí en vez de importarlo porque allá es una constante interna no
// exportada. PRUEBAS en amarillo llamativo a propósito: antes la única señal
// de ambiente en esta pantalla era un texto gris de 10px en el modal de
// detalle, insuficiente para distinguir una venta real de una de prueba de un
// vistazo.
const AMBIENTE_BADGE: Record<string, string> = {
  PRUEBAS:    "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  PRODUCCIÓN: "bg-blue-900/30 text-blue-300 border-blue-700/40",
};

function AmbienteBadge({ ambiente }: { ambiente: string }) {
  if (!ambiente) return null;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${AMBIENTE_BADGE[ambiente] ?? ""}`}>
      {ambiente}
    </span>
  );
}

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
  onDelete: (url: string, label: string) => void;
  onAbrirBorrador: (recordId: string) => void;
  /** En el visor: sin Imprimir/RIDE/PDF/XML (ya están en su encabezado). */
  soloAcciones?: boolean;
};

const btnLink  = "rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] transition whitespace-nowrap";
const btnDanger = "rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:border-red-500/60 hover:text-red-300 transition whitespace-nowrap disabled:opacity-40";
const btnOff   = "rounded-full border border-[#2A2A22] px-3 py-1.5 text-xs text-[#555] cursor-not-allowed whitespace-nowrap";

function BarraAcciones({ doc, accion, onPost, onDelete, onAbrirBorrador, soloAcciones = false }: AccionesProps) {
  if (!doc) {
    return <span className="text-xs text-[#555] italic">Selecciona un documento para ver sus acciones</span>;
  }

  const ocupado = !!accion;

  if (doc.tipo === "factura") {
    const emitida = doc.estado === "AUTORIZADO";
    const esBorrador = doc.estado === "BORRADOR";
    return (
      <div className="flex flex-wrap items-center gap-2">
        {esBorrador && (
          <button
            type="button"
            onClick={() => onAbrirBorrador(doc.recordId)}
            className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-xs font-bold text-[#151515] hover:brightness-105 whitespace-nowrap"
          >
            ✏ Abrir para facturar
          </button>
        )}
        {!soloAcciones && <a href={`/facturacion/imprimir/factura/${doc.recordId}`} target="_blank" rel="noopener" className={btnLink}>🖨 Imprimir 80 mm</a>}
        {!soloAcciones && doc.tieneRide && <a href={`/api/facturacion/ride/${doc.claveAcceso}`} target="_blank" rel="noopener" className={btnLink}>↓ RIDE PDF</a>}
        {!soloAcciones && doc.tieneXml && <a href={`/api/facturacion/xml/${doc.claveAcceso}`} download={`${doc.claveAcceso}.xml`} className={btnLink}>↓ XML</a>}
        {esBorrador && (
          <button disabled={ocupado} onClick={() => onDelete(`/api/facturacion/historial/${doc.recordId}`, "Eliminar borrador")} className={btnDanger}>
            {accion === "Eliminar borrador" ? "Eliminando…" : "🗑 Eliminar borrador"}
          </button>
        )}
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
        {!soloAcciones && <a href={`/facturacion/imprimir/recibo/${doc.recordId}`} target="_blank" rel="noopener" className={btnLink}>🖨 Imprimir 80 mm</a>}
        {!soloAcciones && doc.tienePdf && <a href={`/api/facturacion/recibos/${doc.recordId}/pdf`} target="_blank" rel="noopener" className={btnLink}>↓ PDF</a>}
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
        {!soloAcciones && doc.tienePdf && <a href={`/api/facturacion/proformas/${doc.recordId}/pdf`} target="_blank" rel="noopener" className={btnLink}>↓ PDF</a>}
        <button className={btnOff} disabled title="Disponible en la próxima fase">→ Facturar · pronto</button>
      </div>
    );
  }

  // notaCredito
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!soloAcciones && doc.tieneRide && <a href={`/api/facturacion/nota-credito/ride/${doc.claveAcceso}`} target="_blank" rel="noopener" className={btnLink}>↓ RIDE PDF</a>}
      {!soloAcciones && doc.tieneXml && <a href={`/api/facturacion/nota-credito/xml/${doc.claveAcceso}`} download={`${doc.claveAcceso}.xml`} className={btnLink}>↓ XML</a>}
      <Link href={`/facturacion/nueva?reemplazoNC=${doc.recordId}`} className={btnLink}>→ Facturar reemplazo</Link>
    </div>
  );
}

// ─── Visualizador de documento (ventana flotante) ────────────────────────────
// El mismo visor de todo el portal (components/documentos/DocumentoModal), con
// las acciones de Facturación al pie. Imprimir, RIDE/PDF y XML van arriba.

function DocumentoDetalleModal({
  doc, accion, onPost, onDelete, onAbrirBorrador, onClose,
}: {
  doc: DocumentoResumen;
  accion: string | null;
  onPost: (url: string, label: string, body?: Record<string, unknown>) => void;
  onDelete: (url: string, label: string) => void;
  onAbrirBorrador: (recordId: string) => void;
  onClose: () => void;
}) {
  // La etiqueta de mantenimiento solo tiene sentido para una factura ya
  // emitida (el equipo ya salió del taller) — no en un borrador.
  const [mantenimiento, setMantenimiento] = useState<DocumentoVisor | null>(null);
  const puedeImprimirMantenimiento = doc.tipo === "factura" && doc.estado === "AUTORIZADO";

  if (mantenimiento) {
    return (
      <ImprimirEtiquetaMantenimientoModal
        onClose={onClose}
        factura={{
          recordId: doc.recordId,
          clienteNombre: doc.clienteNombre,
          clienteIdentificacion: doc.clienteIdentificacion,
          telefono: mantenimiento.cliente.telefono,
          equipoSugerido: mantenimiento.items[0]?.descripcion ?? "",
        }}
      />
    );
  }

  return (
    <DocumentoModal
      tipo={doc.tipo}
      recordId={doc.recordId}
      numero={doc.numero || "borrador"}
      fuente="/api/facturacion/visor"
      onClose={onClose}
      acciones={(d) => (
        <div className="flex flex-wrap items-center gap-2">
          <BarraAcciones doc={doc} accion={accion} onPost={onPost} onDelete={onDelete} onAbrirBorrador={onAbrirBorrador} soloAcciones />
          {puedeImprimirMantenimiento && d ? (
            <button type="button" onClick={() => setMantenimiento(d)} className={btnLink}>🖨 Etiqueta mantenimiento</button>
          ) : null}
        </div>
      )}
    />
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function DocumentosFacturacion({ consumidorFinalLimite = 50 }: { consumidorFinalLimite?: number }) {
  const [grupo, setGrupo]           = useState<GrupoVista>("ventas");
  const [nuevoDocumento, setNuevoDocumento] = useState<{ tipoInicial: TipoNuevoDocumento; borradorId?: string | null } | null>(null);
  const [q, setQ]                   = useState("");
  const [qAplicado, setQAplicado]   = useState("");
  // Apagado por defecto: los documentos de ambiente PRUEBAS no son ventas
  // reales y no deben aparecer salvo que se pidan a propósito.
  const [incluirPruebas, setIncluirPruebas] = useState(false);
  const [docs, setDocs]             = useState<DocumentoResumen[]>([]);
  const [suma, setSuma]             = useState(0);
  const [cargando, setCargando]     = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [selId, setSelId]           = useState<string | null>(null);
  const [detalleDoc, setDetalleDoc] = useState<DocumentoResumen | null>(null);
  const [pendientes, setPendientes] = useState<number>(0);
  const [reservasVencidas, setReservasVencidas] = useState<number>(0);
  const [accion, setAccion]         = useState<string | null>(null);
  const [msg, setMsg]               = useState<string | null>(null);
  const [errMsg, setErrMsg]         = useState<string | null>(null);
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscando = qAplicado.trim() !== "";
  const seleccionado = docs.find((d) => d.recordId === selId) ?? null;

  const cargar = useCallback(async (g: GrupoVista, query: string, pruebas: boolean) => {
    setCargando(true); setError(null);
    const params = new URLSearchParams({ grupo: g });
    if (query.trim()) params.set("q", query.trim());
    if (pruebas) params.set("pruebas", "1");
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

  // Contador de reservas vencidas (Activa pero pasada su fecha límite).
  const cargarReservasVencidas = useCallback(async () => {
    try {
      const r = await fetch("/api/facturacion/reservas?estado=Activa");
      const d = await r.json() as { success: boolean; data?: { reservas: Array<{ fechaLimite: string }> } };
      if (d.success && d.data) {
        const ahora = new Date();
        setReservasVencidas(d.data.reservas.filter((x) => reservaVencida(new Date(`${x.fechaLimite.slice(0, 10)}T00:00:00`), ahora)).length);
      }
    } catch { /* silencioso */ }
  }, []);
  useEffect(() => { cargarReservasVencidas(); }, [cargarReservasVencidas]);

  // Debounce del buscador.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQAplicado(q), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  // Recargar al cambiar grupo, búsqueda aplicada o el interruptor de pruebas.
  useEffect(() => { cargar(grupo, qAplicado, incluirPruebas); setSelId(null); setDetalleDoc(null); }, [grupo, qAplicado, incluirPruebas, cargar]);

  function onPost(url: string, label: string, body?: Record<string, unknown>) {
    setAccion(label); setMsg(null); setErrMsg(null);
    fetch(url, body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { method: "POST" })
      .then((r) => r.json())
      .then((d: { success: boolean; error?: string }) => {
        if (d.success) { setMsg(`${label} · listo`); cargar(grupo, qAplicado, incluirPruebas); cargarPendientes(); }
        else setErrMsg(d.error ?? "Error");
      })
      .catch(() => setErrMsg("Error de red"))
      .finally(() => setAccion(null));
  }

  function onDelete(url: string, label: string) {
    if (!confirm("¿Eliminar este borrador? Esta acción no se puede deshacer.")) return;
    setAccion(label); setMsg(null); setErrMsg(null);
    fetch(url, { method: "DELETE" })
      .then((r) => r.json())
      .then((d: { success: boolean; error?: string }) => {
        if (d.success) { setMsg("Borrador eliminado"); setSelId(null); setDetalleDoc(null); cargar(grupo, qAplicado, incluirPruebas); }
        else setErrMsg(d.error ?? "Error al eliminar");
      })
      .catch(() => setErrMsg("Error de red"))
      .finally(() => setAccion(null));
  }

  function cerrarNuevoDocumento() {
    setNuevoDocumento(null);
    cargar(grupo, qAplicado, incluirPruebas);
    cargarPendientes();
  }

  function abrirBorradorParaFacturar(recordId: string) {
    setDetalleDoc(null);
    setNuevoDocumento({ tipoInicial: "factura", borradorId: recordId });
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
          <button
            onClick={() => setNuevoDocumento({ tipoInicial: "factura", borradorId: null })}
            className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] hover:brightness-105 whitespace-nowrap"
          >
            + Nuevo documento
          </button>
        </div>

        {/* Acciones contextuales */}
        <div className="min-h-[34px] flex items-center">
          <BarraAcciones doc={seleccionado} accion={accion} onPost={onPost} onDelete={onDelete} onAbrirBorrador={abrirBorradorParaFacturar} />
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
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-[#A7A7A7] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={incluirPruebas}
              onChange={(e) => setIncluirPruebas(e.target.checked)}
              className="h-3.5 w-3.5 accent-yellow-500"
            />
            Mostrar documentos de prueba
          </label>
          <Link
            href="/facturacion/reservas"
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${reservasVencidas > 0 ? "border-red-700/50 text-red-300 hover:border-red-400" : "border-[#3A3A36] text-[#A7A7A7] hover:border-[#D7FF4F]/40 hover:text-[#F5F5F5]"}`}
          >
            📦 Reservas{reservasVencidas > 0 && <span className="rounded-full bg-red-500/20 px-2 text-xs font-bold">{reservasVencidas} vencidas</span>}
          </Link>
          <Link
            href="/facturacion/historial"
            className="flex items-center gap-2 rounded-full border border-[#3A3A36] px-3 py-1.5 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/40 hover:text-[#F5F5F5] transition"
            title="Reporte por rango de fechas, reintentar facturas atascadas en el SRI y sincronización de inventario"
          >
            📊 Historial / reporte
          </Link>
          <Link
            href="/facturacion/anulaciones"
            className="flex items-center gap-2 rounded-full border border-yellow-700/40 px-3 py-1.5 text-sm text-yellow-300 hover:border-yellow-400 transition"
          >
            ⏳ Anulaciones pendientes{pendientes > 0 && <span className="rounded-full bg-yellow-500/20 px-2 text-xs font-bold">{pendientes}</span>}
          </Link>
        </div>
      </div>

      {/* Aviso: interruptor de pruebas encendido — mezcla ventas reales con
          documentos de PRUEBAS. La señal tiene que notarse de un vistazo:
          antes de esto, la única pista era un texto gris de 10px por
          documento en el modal de detalle. */}
      {incluirPruebas && (
        <div className="mb-4 rounded-xl border border-yellow-700/50 bg-yellow-900/20 px-3 py-2.5 flex items-start gap-2">
          <span className="text-yellow-400 text-base leading-none mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-semibold text-yellow-300">Viendo también documentos de PRUEBAS</p>
            <p className="text-xs text-yellow-200/70 mt-0.5">
              No son ventas reales. Cada documento de ese ambiente lleva su etiqueta <span className="font-semibold">PRUEBAS</span> en el listado.
            </p>
          </div>
        </div>
      )}

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
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TIPO_BADGE[d.tipo]}`}>{TIPO_LABEL[d.tipo]}</span>
                    {d.ambiente === "PRUEBAS" && <AmbienteBadge ambiente={d.ambiente} />}
                  </span>
                  <span className="flex-1 truncate text-sm text-[#F5F5F5]">{d.clienteNombre || "—"}</span>
                  <span className="text-sm font-bold text-[#D7FF4F]">{mon(d.total)}</span>
                </div>
                <div className="md:hidden mt-0.5 text-xs font-mono text-[#777] truncate">{d.numero || "borrador"} · {fmt(d.fecha)} · <span className={estadoColor(d.estado)}>{estadoLabel(d)}</span></div>

                {/* Escritorio */}
                <span className="hidden md:flex items-center gap-1.5">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TIPO_BADGE[d.tipo]}`}>{TIPO_LABEL[d.tipo]}</span>
                  {d.ambiente === "PRUEBAS" && <AmbienteBadge ambiente={d.ambiente} />}
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
          onDelete={onDelete}
          onAbrirBorrador={abrirBorradorParaFacturar}
          onClose={() => setDetalleDoc(null)}
        />
      )}

      {/* Ventana flotante de creación */}
      {nuevoDocumento && (
        <NuevoDocumentoModal
          consumidorFinalLimite={consumidorFinalLimite}
          tipoInicial={nuevoDocumento.tipoInicial}
          borradorId={nuevoDocumento.borradorId}
          onClose={cerrarNuevoDocumento}
        />
      )}
    </div>
  );
}
