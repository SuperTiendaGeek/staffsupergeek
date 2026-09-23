"use client";

// Tarjeta "Presupuesto" de la orden de reparación.
//
// El técnico arma aquí lo que le va a proponer al cliente —servicios,
// repuestos y productos digitales— SIN comprometer nada: no se reserva ningún
// repuesto, no se asigna ninguna licencia y el Resumen financiero no cambia.
// Cuando el cliente acepta, "Cliente aprobó → Cargar a la orden" muestra una
// vista previa y, al confirmar, pasa cada línea a su tarjeta real (ver
// lib/tecnicos/presupuesto/cargar.ts). Desde ese momento afecta al inventario,
// a la cuenta y a la factura o recibo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  subtotalLinea, esEditable, aceptaVincularArticulo, fasePedido, normalizarPrioridad, PRIORIDADES, NOTA_CLIENTE_MAX,
  type Prioridad,
  type LineaPresupuesto, type TipoLinea, type EstadoPresupuesto, type PasoCarga, type InfoPedido, type FasePedido,
  type ReversasLinea, type AccionReversa,
} from "@/lib/tecnicos/presupuesto/reglas";

type CatServicio = { id: string; nombre: string; descripcion: string | null; costoSugerido: number | null; activo: boolean };
type ItemStock   = { id: string; sku: string; nombre: string; precioVentaFinal: number | null };
type CatDigital  = { id: string; productoBase: string; marca: string | null; precioVentaCatalogo: number | null };
type Totales     = { propuesto: number; aprobado: number; pendienteDeCargar: number; rechazado: number };
type Resultado   = PasoCarga & { cargada: boolean; esperandoPedido?: boolean; error?: string };
type OpcionesPedido = { proveedores: Array<{ id: string; nombre: string }>; tiempos: string[]; categorias: string[] };

const FASE_PEDIDO: Record<FasePedido, { texto: string; clase: string }> = {
  cotizado:         { texto: "Cotizado al cliente",          clase: "text-[var(--sg-text-secondary)]" },
  vencido:          { texto: "Cotización rechazada o vencida", clase: "text-[var(--sg-danger)]" },
  esperando_pedido: { texto: "Aprobado · falta pedirlo al proveedor", clase: "text-[var(--sg-warning)]" },
  en_camino:        { texto: "Pedido · en camino",            clase: "text-[var(--sg-info)]" },
  recibido:         { texto: "Llegó a la tienda",             clase: "text-[var(--sg-success)]" },
  sin_articulo:     { texto: "En Pedido sin artículo (revisar en Operaciones)", clase: "text-[var(--sg-danger)]" },
  articulo_cancelado: { texto: "Artículo cancelado en Shipping", clase: "text-[var(--sg-danger)]" },
  vendido:          { texto: "Facturado / con recibo",         clase: "text-[var(--sg-success)]" },
};

const REVERSA_TEXTO: Record<AccionReversa, { boton: string; ayuda: string; placeholder: string }> = {
  cancelar:  { boton: "El cliente desiste", ayuda: "La línea queda rechazada; si ya se pidió, el artículo se cancela y deja de cobrarse.", placeholder: "Motivo (ej. el cliente decidió no reparar)" },
  recotizar: { boton: "Recotizar",          ayuda: "El proveedor no lo tiene o hay otra alternativa: esta línea queda como constancia y se abre una propuesta nueva para volver a aprobar.", placeholder: "Motivo (ej. eBay sin stock)" },
  liberar:   { boton: "Liberar a inventario", ayuda: "Ya llegó y el cliente no lo quiere: queda como inventario de la tienda y deja de cobrársele.", placeholder: "Motivo" },
};

const mon = (n: number) => `$${(n || 0).toFixed(2)}`;

const ESTADO_BADGE: Record<LineaPresupuesto["estado"], string> = {
  Propuesta: "border-[var(--sg-border)] text-[var(--sg-text-secondary)]",
  Aprobada:  "border-[var(--sg-warning)] text-[var(--sg-warning)] bg-[var(--sg-warning-soft)]",
  Cargada:   "border-[var(--sg-success)] text-[var(--sg-success)] bg-[var(--sg-success-soft)]",
  Rechazada: "border-[var(--sg-danger)]/60 text-[var(--sg-danger)]",
};
const ESTADO_TEXTO: Record<LineaPresupuesto["estado"], string> = {
  Propuesta: "Propuesta", Aprobada: "Aprobada · por cargar", Cargada: "Cargada", Rechazada: "Rechazada",
};
const PRESUPUESTO_TEXTO: Record<EstadoPresupuesto, string> = {
  sin_presupuesto: "Sin presupuesto", propuesto: "Esperando respuesta del cliente", aprobado: "Aprobado", rechazado: "Rechazado",
};

const BTN = "inline-flex h-8 items-center justify-center rounded-[var(--sg-radius-sm)] border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SEC = `${BTN} border-[var(--sg-border)] bg-[var(--sg-card)] text-[var(--sg-text-secondary)] hover:border-[var(--sg-lime)] hover:text-[var(--sg-text-primary)]`;
const BTN_PRI = `${BTN} border-[var(--sg-lime)] bg-[var(--sg-lime)] text-[var(--sg-text-on-accent)] hover:brightness-105`;
const INPUT = "w-full rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2.5 py-1.5 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] focus:border-[var(--sg-lime)] focus:outline-none";

// ─── Enlace para el cliente (aprobación en línea + PDF) ──────────────────────

type InfoEnlaceUI = { token: string; vence: string; estado: "vigente" | "vencido" | "bloqueado" | "sin_enlace"; url: string; whatsapp: string | null };

function fechaCortaEc(iso: string) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(t)) : "";
}

function EnlaceCliente({ ordenId, hayLineas }: { ordenId: string; hayLineas: boolean }) {
  const [info, setInfo] = useState<InfoEnlaceUI | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto`;

  useEffect(() => {
    let vivo = true;
    fetch(`${base}/enlace`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (vivo && j.success) setInfo(j.data); }).catch(() => {});
    return () => { vivo = false; };
  }, [base]);

  async function crear(renovar: boolean) {
    setOcupado(true); setError(null);
    try {
      const r = await fetch(`${base}/enlace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ renovar }) });
      const j = await r.json();
      if (!j.success) { setError(j.error ?? "No se pudo crear el enlace"); return; }
      setInfo(j.data);
    } catch { setError("Error de red"); }
    finally { setOcupado(false); }
  }

  async function copiar() {
    if (!info?.url) return;
    try { await navigator.clipboard.writeText(info.url); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { setError("No se pudo copiar; selecciona el enlace a mano."); }
  }

  if (!hayLineas) return null;
  const vigente = info?.estado === "vigente";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-xs">
      <div className="min-w-0">
        <p className="font-semibold text-[var(--sg-text-primary)]">Enlace para el cliente</p>
        <p className="text-[11px] text-[var(--sg-text-muted)]">
          {!info || info.estado === "sin_enlace"
            ? "El cliente revisa y aprueba desde su celular, sin cuenta. Si cambias algo, el mismo enlace le pide aprobar solo el cambio."
            : info.estado === "vencido" ? "Venció: renuévalo antes de volver a enviarlo (es el mismo enlace)."
            : info.estado === "bloqueado" ? "Bloqueado 30 min por intentos fallidos de cédula."
            : `Vigente hasta ${fechaCortaEc(info.vence)}.`}
        </p>
        {error && <p className="text-[11px] text-[var(--sg-danger)]">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {info?.url ? (
          <>
            <button type="button" onClick={copiar} className={BTN_SEC}>{copiado ? "¡Copiado!" : "Copiar enlace"}</button>
            {info.whatsapp && vigente && <a href={info.whatsapp} target="_blank" rel="noopener noreferrer" className={BTN_SEC}>WhatsApp</a>}
            <a href={info.url} target="_blank" rel="noopener noreferrer" className={BTN_SEC}>Ver como cliente</a>
            {!vigente && <button type="button" disabled={ocupado} onClick={() => crear(true)} className={BTN_PRI}>{ocupado ? "Renovando…" : "Renovar 7 días"}</button>}
          </>
        ) : (
          <button type="button" disabled={ocupado} onClick={() => crear(false)} className={BTN_PRI}>{ocupado ? "Creando…" : "Crear enlace"}</button>
        )}
        <a href={`${base}/pdf`} target="_blank" rel="noopener noreferrer" className={BTN_SEC} title="Incluye el enlace y su código QR al pie">PDF</a>
      </div>
    </div>
  );
}

// ─── Buscadores (reutilizan los endpoints de las tarjetas existentes) ────────

/** Cierra un desplegable al hacer clic fuera o con Escape. */
function useCerrarFuera(onCerrar: () => void, activo: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!activo) return;
    const fuera = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCerrar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [activo, onCerrar]);
  return ref;
}

function useDebounced(valor: string, ms = 300) {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

function BuscadorRepuesto({ ordenId, onElegir }: { ordenId: string; onElegir: (i: ItemStock) => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [res, setRes] = useState<ItemStock[]>([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(true);
  const ref = useCerrarFuera(useCallback(() => setAbierto(false), []), abierto);

  // Sin texto trae los repuestos de stock disponibles (así se ve qué hay);
  // con texto, busca por nombre o SKU.
  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const t = dq.trim();
    fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/repuestos-v2/buscar${t ? `?q=${encodeURIComponent(t)}` : ""}`)
      .then((r) => r.json()).then((j) => { if (!cancel) setRes(j.success ? j.data : []); })
      .catch(() => { if (!cancel) setRes([]); }).finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [dq, ordenId]);

  return (
    <div className="relative" ref={ref}>
      <input autoFocus value={q} onFocus={() => setAbierto(true)} onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
        placeholder="Buscar repuesto en inventario (nombre o SKU)…" className={INPUT} />
      {abierto && (
        <ul className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-72 overflow-auto rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-bg)] shadow-2xl">
          {cargando && <li className="px-3 py-2 text-xs text-[var(--sg-text-muted)]">Buscando…</li>}
          {!cargando && res.length === 0 && (
            <li className="px-3 py-2 text-xs text-[var(--sg-text-muted)]">
              {q.trim() ? "Ningún repuesto disponible con ese nombre o SKU." : "No hay repuestos de stock disponibles ahora mismo. Usa “Bajo pedido”."}
            </li>
          )}
          {res.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => { onElegir(i); setQ(""); setAbierto(false); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--sg-card)]">
                <span className="min-w-0"><span className="block truncate text-[var(--sg-text-primary)]">{i.nombre}</span><span className="text-[10px] text-[var(--sg-text-muted)]">{i.sku}</span></span>
                <span className="shrink-0 text-xs font-semibold text-[var(--sg-lime)]">{i.precioVentaFinal !== null ? mon(i.precioVentaFinal) : "sin precio"}</span>
              </button>
            </li>
          ))}
          {!cargando && res.length > 0 && (
            <li className="border-t border-[var(--sg-divider)] px-3 py-1.5 text-[10px] text-[var(--sg-text-muted)]">{res.length} repuesto(s) disponibles{q.trim() ? " con ese texto" : ""}</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ─── Formulario de línea nueva ────────────────────────────────────────────────

type Borrador = {
  tipo: TipoLinea; descripcion: string; cantidad: string; precio: string;
  servicioCatalogoId: string | null; itemId: string | null; itemSku: string | null; productoCatalogoId: string | null;
  // Bajo pedido
  proveedorId: string; categoria: string; costo: string; url: string; tiempo: string;
  prioridad: Prioridad; notaCliente: string; alternativaDe: string;
};
const BORRADOR_VACIO = (tipo: TipoLinea): Borrador => ({
  tipo, descripcion: "", cantidad: "1", precio: "", servicioCatalogoId: null, itemId: null, itemSku: null, productoCatalogoId: null,
  proveedorId: "", categoria: "Repuesto", costo: "", url: "", tiempo: "",
  prioridad: "Recomendada", notaCliente: "", alternativaDe: "",
});

// ─── Prioridad y alternativas ────────────────────────────────────────────────

const PRIORIDAD_ESTILO: Record<Prioridad, { clase: string; ayuda: string }> = {
  Necesaria:   { clase: "border-[var(--sg-danger)]/60 text-[var(--sg-danger)]",   ayuda: "Sin esto no se puede reparar." },
  Recomendada: { clase: "border-[var(--sg-warning)]/60 text-[var(--sg-warning)]", ayuda: "El técnico lo aconseja; la reparación sigue sin esto." },
  Opcional:    { clase: "border-[var(--sg-info)]/60 text-[var(--sg-info)]",       ayuda: "Mejora sugerida." },
};

function InsigniaPrioridad({ p }: { p: Prioridad | undefined }) {
  const v = normalizarPrioridad(p);
  return <span title={PRIORIDAD_ESTILO[v].ayuda} className={`mr-1 inline-block rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${PRIORIDAD_ESTILO[v].clase}`}>{v}</span>;
}

function SelectorPrioridad({ valor, onCambio }: { valor: Prioridad; onCambio: (p: Prioridad) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRIORIDADES.map((p) => (
        <button key={p} type="button" onClick={() => onCambio(p)} title={PRIORIDAD_ESTILO[p].ayuda}
          className={`h-7 rounded-full border px-3 text-[11px] font-semibold transition ${valor === p ? `${PRIORIDAD_ESTILO[p].clase} bg-[var(--sg-card)]` : "border-[var(--sg-border)] text-[var(--sg-text-muted)] hover:text-[var(--sg-text-primary)]"}`}>
          {p}
        </button>
      ))}
    </div>
  );
}

/** Nota para el cliente + "es alternativa de…" (lo comparten el alta y el ajuste). */
function CamposCliente({ prioridad, nota, alternativaDe, propuestas, onCambio, mostrarAlternativa = true }: {
  prioridad: Prioridad; nota: string; alternativaDe: string;
  propuestas: LineaPresupuesto[]; mostrarAlternativa?: boolean;
  onCambio: (c: Partial<{ prioridad: Prioridad; notaCliente: string; alternativaDe: string }>) => void;
}) {
  return (
    <div className="space-y-2 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[var(--sg-text-secondary)]">¿Qué tan necesaria es?</span>
        <SelectorPrioridad valor={prioridad} onCambio={(p) => onCambio({ prioridad: p })} />
      </div>
      {mostrarAlternativa && propuestas.length > 0 && (
        <select value={alternativaDe} onChange={(e) => onCambio({ alternativaDe: e.target.value })} className={INPUT}>
          <option value="">No es alternativa de otra línea</option>
          {propuestas.map((l) => <option key={l.id} value={l.id}>Alternativa de: {l.descripcion} ({mon(l.precioUnitario)})</option>)}
        </select>
      )}
      <textarea value={nota} onChange={(e) => onCambio({ notaCliente: e.target.value.slice(0, NOTA_CLIENTE_MAX) })} rows={2}
        placeholder="Nota para el cliente (opcional): por qué es necesaria o qué gana si la aprueba. La ve en el enlace y en el PDF."
        className={`${INPUT} resize-y`} />
      {alternativaDe && <p className="text-[10px] text-[var(--sg-text-muted)]">El cliente elige solo una de las alternativas. Comparten la prioridad.</p>}
    </div>
  );
}

function FormLinea({ ordenId, onCreada, onCancelar, inicial, propuestas }: {
  ordenId: string; onCreada: () => void; onCancelar: () => void;
  /** Líneas Propuesta de la orden (para marcar "alternativa de"). */
  propuestas: LineaPresupuesto[];
  /** Recotizar: arranca con los datos del repuesto que se reemplaza. */
  inicial?: Borrador | null;
}) {
  const [b, setB] = useState<Borrador>(inicial ?? BORRADOR_VACIO("Servicio"));
  const [modoRepuesto, setModoRepuesto] = useState<"inventario" | "pedido">(inicial ? "pedido" : "inventario");
  const [opcionesPedido, setOpcionesPedido] = useState<OpcionesPedido | null>(null);
  const [servicios, setServicios] = useState<CatServicio[]>([]);
  const [digitales, setDigitales] = useState<CatDigital[]>([]);
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listaAbierta, setListaAbierta] = useState(true);
  const refLista = useCerrarFuera(useCallback(() => setListaAbierta(false), []), listaAbierta);
  const totalCatalogo = b.tipo === "Servicio" ? servicios.length : b.tipo === "Producto digital" ? digitales.length : 0;

  useEffect(() => {
    if (b.tipo === "Servicio" && servicios.length === 0) {
      fetch("/api/tecnicos/catalogo/servicios").then((r) => r.json()).then((j) => j.success && setServicios((j.data as CatServicio[]).filter((s) => s.activo !== false))).catch(() => {});
    }
    if (b.tipo === "Repuesto" && modoRepuesto === "pedido" && !opcionesPedido) {
      fetch("/api/tecnicos/presupuesto/opciones-pedido").then((r) => r.json()).then((j) => j.success && setOpcionesPedido(j.data)).catch(() => {});
    }
    if (b.tipo === "Producto digital" && digitales.length === 0) {
      fetch("/api/tecnicos/catalogo-productos-digitales").then((r) => r.json()).then((j) => j.success && setDigitales(j.data)).catch(() => {});
    }
  }, [b.tipo, modoRepuesto, opcionesPedido, servicios.length, digitales.length]);

  const sugerencias = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (b.tipo === "Servicio") return servicios.filter((s) => !t || s.nombre.toLowerCase().includes(t)).slice(0, 60);
    if (b.tipo === "Producto digital") return digitales.filter((d) => !t || `${d.productoBase} ${d.marca ?? ""}`.toLowerCase().includes(t)).slice(0, 60);
    return [];
  }, [q, b.tipo, servicios, digitales]);

  const esPedido = b.tipo === "Repuesto" && modoRepuesto === "pedido";
  const elegido = b.servicioCatalogoId || b.itemId || b.productoCatalogoId || esPedido;
  const cantidadFija = (b.tipo === "Repuesto" && (!!b.itemId || esPedido)) || b.tipo === "Producto digital";

  function cambiarTipo(t: TipoLinea) { setListaAbierta(true); setB({ ...BORRADOR_VACIO(t), prioridad: b.prioridad, notaCliente: b.notaCliente, alternativaDe: b.alternativaDe }); setQ(""); setError(null); setModoRepuesto("inventario"); }

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const r = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: b.tipo, descripcion: b.descripcion,
          cantidad: parseInt(b.cantidad, 10) || 0,
          precioUnitario: parseFloat(b.precio.replace(",", ".")) || 0,
          servicioCatalogoId: b.servicioCatalogoId, itemId: b.itemId, productoCatalogoId: b.productoCatalogoId,
          prioridad: b.prioridad, notaCliente: b.notaCliente, alternativaDe: b.alternativaDe || null,
          bajoPedido: esPedido
            ? {
                proveedorId: b.proveedorId, categoria: b.categoria, urlProveedor: b.url.trim(), tiempoEstimado: b.tiempo,
                costoProveedor: b.costo.trim() ? parseFloat(b.costo.replace(",", ".")) : null,
              }
            : null,
        }),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error ?? "No se pudo agregar la línea"); return; }
      setB({ ...BORRADOR_VACIO(b.tipo), prioridad: b.prioridad }); setQ("");
      onCreada();
    } catch { setError("Error de red"); }
    finally { setGuardando(false); }
  }

  return (
    <div className="relative z-30 space-y-2.5 rounded-[var(--sg-radius-md)] border border-[var(--sg-lime)]/30 bg-[var(--sg-panel)] p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["Servicio", "Repuesto", "Producto digital"] as TipoLinea[]).map((t) => (
          <button key={t} type="button" onClick={() => cambiarTipo(t)}
            className={`h-7 rounded-full border px-3 text-xs font-semibold transition ${b.tipo === t ? "border-[var(--sg-lime)] bg-[var(--sg-lime)] text-[var(--sg-text-on-accent)]" : "border-[var(--sg-border)] text-[var(--sg-text-secondary)] hover:border-[var(--sg-lime)]/60"}`}>
            {t}
          </button>
        ))}
        {b.tipo === "Repuesto" && (
          <span className="ml-auto flex gap-1 text-[11px]">
            <button type="button" onClick={() => { setModoRepuesto("inventario"); setB(BORRADOR_VACIO("Repuesto")); }} className={modoRepuesto === "inventario" ? "font-bold text-[var(--sg-lime)]" : "text-[var(--sg-text-muted)] hover:text-[var(--sg-text-primary)]"}>Del inventario</button>
            <span className="text-[var(--sg-text-muted)]">·</span>
            <button type="button" onClick={() => { setModoRepuesto("pedido"); setB(BORRADOR_VACIO("Repuesto")); }} className={modoRepuesto === "pedido" ? "font-bold text-[var(--sg-lime)]" : "text-[var(--sg-text-muted)] hover:text-[var(--sg-text-primary)]"}>Bajo pedido</button>
          </span>
        )}
      </div>

      {/* Paso 1: elegir qué se presupuesta */}
      {!elegido && b.tipo === "Repuesto" && modoRepuesto === "inventario" && (
        <BuscadorRepuesto ordenId={ordenId} onElegir={(i) => setB({ ...b, itemId: i.id, itemSku: i.sku, descripcion: i.nombre, precio: i.precioVentaFinal !== null ? String(i.precioVentaFinal) : "", cantidad: "1" })} />
      )}
      {!elegido && b.tipo !== "Repuesto" && (
        <div className="relative" ref={refLista}>
          <input autoFocus value={q} onFocus={() => setListaAbierta(true)} onChange={(e) => { setQ(e.target.value); setListaAbierta(true); }}
            placeholder={b.tipo === "Servicio" ? `Buscar entre ${totalCatalogo || "…"} servicios del catálogo…` : `Buscar entre ${totalCatalogo || "…"} productos digitales…`} className={INPUT} />
          {listaAbierta && (
            <ul className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-72 overflow-auto rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-bg)] shadow-2xl">
              {totalCatalogo === 0 && <li className="px-3 py-2 text-xs text-[var(--sg-text-muted)]">Cargando catálogo…</li>}
              {totalCatalogo > 0 && sugerencias.length === 0 && <li className="px-3 py-2 text-xs text-[var(--sg-text-muted)]">Nada coincide con “{q}”.</li>}
              {b.tipo === "Servicio" && (sugerencias as CatServicio[]).map((s) => (
                <li key={s.id}><button type="button" onClick={() => { setListaAbierta(false); setB({ ...b, servicioCatalogoId: s.id, descripcion: s.nombre, precio: s.costoSugerido !== null ? String(s.costoSugerido) : "" }); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--sg-card)]">
                  <span className="truncate text-[var(--sg-text-primary)]">{s.nombre}</span>
                  <span className="shrink-0 text-xs text-[var(--sg-lime)]">{s.costoSugerido !== null ? mon(s.costoSugerido) : ""}</span>
                </button></li>
              ))}
              {b.tipo === "Producto digital" && (sugerencias as CatDigital[]).map((d) => (
                <li key={d.id}><button type="button" onClick={() => { setListaAbierta(false); setB({ ...b, productoCatalogoId: d.id, descripcion: [d.marca, d.productoBase].filter(Boolean).join(" "), precio: d.precioVentaCatalogo !== null ? String(d.precioVentaCatalogo) : "", cantidad: "1" }); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--sg-card)]">
                  <span className="truncate text-[var(--sg-text-primary)]">{[d.marca, d.productoBase].filter(Boolean).join(" ")}</span>
                  <span className="shrink-0 text-xs text-[var(--sg-lime)]">{d.precioVentaCatalogo !== null ? mon(d.precioVentaCatalogo) : ""}</span>
                </button></li>
              ))}
              {sugerencias.length > 0 && (
                <li className="border-t border-[var(--sg-divider)] px-3 py-1.5 text-[10px] text-[var(--sg-text-muted)]">
                  Mostrando {sugerencias.length} de {totalCatalogo}{sugerencias.length < totalCatalogo ? " — escribe para filtrar" : ""}
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Paso 2: ajustar descripción, cantidad y precio */}
      {elegido && (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_80px_110px]">
          <div>
            <input value={b.descripcion} onChange={(e) => setB({ ...b, descripcion: e.target.value })} placeholder={esPedido ? "Repuesto a pedir (ej. Pantalla 15.6 FHD 30 pines)" : "Descripción"} className={INPUT} />
            {b.itemSku && <p className="mt-0.5 text-[10px] text-[var(--sg-text-muted)]">Inventario: {b.itemSku} — solo referencia, NO se reserva todavía</p>}
          </div>
          <input value={b.cantidad} disabled={cantidadFija} onChange={(e) => setB({ ...b, cantidad: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="Cant." className={`${INPUT} text-right`} title={cantidadFija ? "Va de a una unidad por línea" : ""} />
          <input value={b.precio} onChange={(e) => setB({ ...b, precio: e.target.value })} inputMode="decimal" placeholder="Precio c/IVA" className={`${INPUT} text-right`} />
        </div>
      )}

      {/* Bajo pedido: se vuelve la opción elegida de una Operación Comercial */}
      {esPedido && (
        <div className="space-y-2 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] p-2.5">
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={b.proveedorId} onChange={(e) => setB({ ...b, proveedorId: e.target.value })} className={INPUT}>
              <option value="">{opcionesPedido ? "Proveedor…" : "Cargando proveedores…"}</option>
              {opcionesPedido?.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <select value={b.categoria} onChange={(e) => setB({ ...b, categoria: e.target.value })} className={INPUT}>
              {(opcionesPedido?.categorias ?? ["Repuesto"]).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={b.tiempo} onChange={(e) => setB({ ...b, tiempo: e.target.value })} className={INPUT}>
              <option value="">Tiempo estimado…</option>
              {opcionesPedido?.tiempos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
            <input value={b.url} onChange={(e) => setB({ ...b, url: e.target.value })} placeholder="URL del repuesto (opcional)" className={INPUT} />
            <input value={b.costo} onChange={(e) => setB({ ...b, costo: e.target.value })} inputMode="decimal" placeholder="Costo proveedor *" className={`${INPUT} text-right`} />
          </div>
          <p className="text-[10px] text-[var(--sg-text-muted)]">
            Se crea una cotización en Operaciones Comerciales vinculada a esta orden. Proveedor, URL y costo son internos: el
            cliente solo ve la descripción y el precio. El SKU nace cuando se le pide al proveedor.
          </p>
        </div>
      )}

      {elegido && (
        <CamposCliente prioridad={b.prioridad} nota={b.notaCliente} alternativaDe={b.alternativaDe} propuestas={propuestas}
          onCambio={(c) => setB({ ...b, ...c })} />
      )}

      {error && <p className="text-xs text-[var(--sg-danger)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className={BTN_SEC}>Cerrar</button>
        {elegido && (
          <>
            <button type="button" onClick={() => setB(BORRADOR_VACIO(b.tipo))} className={BTN_SEC}>Cambiar</button>
            <button type="button" onClick={guardar} disabled={guardando} className={BTN_PRI}>{guardando ? "Agregando…" : "Agregar al presupuesto"}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tarjeta ─────────────────────────────────────────────────────────────────

export function PresupuestoCard({ ordenId, onCargado, refrescar = 0 }: {
  ordenId: string;
  onCargado: () => void | Promise<void>;
  /** Sube cada vez que la orden se relee: el presupuesto se pone al día con
   *  lo que cambió en las tarjetas (un servicio quitado, un repuesto liberado). */
  refrescar?: number;
}) {
  const [lineas, setLineas] = useState<LineaPresupuesto[]>([]);
  const [pedidos, setPedidos] = useState<Record<string, InfoPedido>>({});
  const [reversas, setReversas] = useState<Record<string, ReversasLinea>>({});
  const [proveedores, setProveedores] = useState<Record<string, string>>({});
  const [revirtiendo, setRevirtiendo] = useState<{ lineaId: string; accion: AccionReversa; motivo: string } | null>(null);
  const [inicialForm, setInicialForm] = useState<Borrador | null>(null);
  const [avisoDinero, setAvisoDinero] = useState(false);
  const [verHistorial, setVerHistorial] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoPresupuesto>("sin_presupuesto");
  const [totales, setTotales] = useState<Totales | null>(null);
  const [cargosSueltos, setCargosSueltos] = useState<{ servicios: number; repuestos: number; digitales: number; total: number } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [detalle, setDetalle] = useState<{ lineaId: string; prioridad: Prioridad; notaCliente: string; alternativaDe: string } | null>(null);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const recargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto`);
      const j = await r.json();
      if (!montado.current) return;
      if (!j.success) { setError(j.error ?? "No se pudo cargar el presupuesto"); return; }
      setLineas(j.data.lineas); setPedidos(j.data.pedidos ?? {}); setReversas(j.data.reversas ?? {}); setProveedores(j.data.proveedores ?? {}); setEstado(j.data.estado); setTotales(j.data.totales); setCargosSueltos(j.data.cargosSinPresupuesto ?? null); setError(null);
      setSeleccion((prev) => new Set([...prev].filter((id) => (j.data.lineas as LineaPresupuesto[]).some((l) => l.id === id && (l.estado === "Propuesta" || l.estado === "Aprobada")))));
    } catch { if (montado.current) setError("Error de red al cargar el presupuesto"); }
    finally { if (montado.current) setCargando(false); }
  }, [ordenId]);

  useEffect(() => { void recargar(); }, [recargar, refrescar]);

  const seleccionables = lineas.filter((l) => l.estado === "Propuesta" || l.estado === "Aprobada");
  // Letra por grupo de alternativas (solo grupos con 2+ líneas).
  const letraGrupo = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const l of lineas) if (l.grupoAlternativas) cuenta.set(l.grupoAlternativas, (cuenta.get(l.grupoAlternativas) ?? 0) + 1);
    const out = new Map<string, string>();
    for (const l of lineas) if (l.grupoAlternativas && (cuenta.get(l.grupoAlternativas) ?? 0) > 1 && !out.has(l.grupoAlternativas)) out.set(l.grupoAlternativas, String.fromCharCode(65 + out.size));
    return out;
  }, [lineas]);
  const propuestasSel = [...seleccion].filter((id) => lineas.find((l) => l.id === id)?.estado === "Propuesta");

  function alternar(id: string) {
    setSeleccion((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function accionLinea(l: LineaPresupuesto, metodo: "PATCH" | "DELETE", body?: object) {
    setOcupado(l.id); setError(null);
    try {
      const r = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto/${encodeURIComponent(l.id)}`, {
        method: metodo, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json();
      if (!j.success) setError(j.error ?? "No se pudo actualizar la línea");
      await recargar();
    } catch { setError("Error de red"); }
    finally { setOcupado(null); }
  }

  async function confirmarReversa() {
    if (!revirtiendo) return;
    const l = lineas.find((x) => x.id === revirtiendo.lineaId);
    if (!l) return;
    const { accion, motivo } = revirtiendo;
    setOcupado(l.id); setError(null);
    try {
      const r = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto/${encodeURIComponent(l.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion, motivo }),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error ?? "No se pudo completar"); return; }
      setRevirtiendo(null);
      setAvisoDinero(true);
      if (accion === "recotizar") {
        // Propuesta nueva con los mismos datos, para cambiar proveedor, costo
        // o precio y volver a pedirle aprobación al cliente.
        setInicialForm({
          ...BORRADOR_VACIO("Repuesto"),
          descripcion: l.descripcion, precio: String(l.precioUnitario),
          proveedorId: l.proveedorId ?? "", categoria: l.categoria || "Repuesto",
          costo: l.costoProveedor !== null ? String(l.costoProveedor) : "", url: l.urlProveedor, tiempo: l.tiempoEstimado,
          prioridad: normalizarPrioridad(l.prioridad), notaCliente: l.notaCliente ?? "",
        });
        setAgregando(true);
      }
      await recargar();
      await onCargado();
    } catch { setError("Error de red"); }
    finally { setOcupado(null); }
  }

  async function pedirAlProveedor(l: LineaPresupuesto) {
    setOcupado(l.id); setError(null);
    try {
      const r = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto/${encodeURIComponent(l.id)}/pedido`, { method: "POST" });
      const j = await r.json();
      if (!j.success) setError(j.error ?? "No se pudo registrar el pedido");
      else if (j.data?.aviso) setError(j.data.aviso);
      await recargar();
      await onCargado();
    } catch { setError("Error de red"); }
    finally { setOcupado(null); }
  }

  async function rechazarSeleccion() {
    for (const id of propuestasSel) {
      const l = lineas.find((x) => x.id === id);
      if (l) await accionLinea(l, "PATCH", { accion: "rechazar" });
    }
    setSeleccion(new Set());
  }

  // "Cliente aprobó" carga directo: el botón ya es la confirmación. El
  // resultado (qué se cargó y qué quedó pendiente) se muestra debajo.
  async function cargarAprobadas(ids: string[]) {
    if (ids.length === 0) return;
    setOcupado("carga"); setError(null); setResultados(null);
    try {
      const r = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto/cargar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineaIds: ids, confirmar: true }),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error ?? "No se pudo cargar el presupuesto"); return; }
      setResultados(j.data.resultados);
      setSeleccion(new Set());
      await recargar();
      await onCargado();
    } catch { setError("Error de red"); }
    finally { setOcupado(null); }
  }

  const aprobadasPendientes = lineas.filter((l) => l.estado === "Aprobada");

  return (
    <section className="relative isolate z-20 space-y-3 overflow-visible rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-4 py-4 shadow-[var(--sg-shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--sg-divider)] pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">Presupuesto</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--sg-text-primary)]">{PRESUPUESTO_TEXTO[estado]}</p>
          <p className="text-[11px] text-[var(--sg-text-muted)]">Armar el presupuesto no reserva repuestos ni afecta la cuenta hasta que el cliente lo apruebe.</p>
        </div>
        <div className="flex items-start gap-2">
          {totales && (totales.propuesto > 0 || totales.aprobado > 0) && (
            <div className="rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-1.5 text-right text-xs">
              {totales.propuesto > 0 && <p className="text-[var(--sg-text-secondary)]">Propuesto <span className="font-bold tabular-nums text-[var(--sg-text-primary)]">{mon(totales.propuesto)}</span></p>}
              {totales.aprobado > 0 && <p className="text-[var(--sg-text-secondary)]">Aprobado <span className="font-bold tabular-nums text-[var(--sg-success)]">{mon(totales.aprobado)}</span></p>}
            </div>
          )}
          {!agregando && <button type="button" onClick={() => setAgregando(true)} className={BTN_SEC}>+ Línea</button>}
        </div>
      </div>

      {!cargando && <EnlaceCliente ordenId={ordenId} hayLineas={lineas.length > 0} />}

      {!cargando && cargosSueltos && cargosSueltos.total > 0 && (
        <p className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-[11px] text-[var(--sg-text-muted)]">
          La orden además tiene {[
            cargosSueltos.servicios ? `${cargosSueltos.servicios} servicio(s)` : "",
            cargosSueltos.repuestos ? `${cargosSueltos.repuestos} repuesto(s)` : "",
            cargosSueltos.digitales ? `${cargosSueltos.digitales} producto(s) digital(es)` : "",
          ].filter(Boolean).join(", ")} agregados directo desde sus tarjetas (sin pasar por el presupuesto). Se cobran igual; simplemente no tienen constancia de aprobación del cliente.
        </p>
      )}

      {agregando && (
        <FormLinea
          key={inicialForm ? "recotizar" : "nueva"}
          ordenId={ordenId}
          inicial={inicialForm}
          propuestas={lineas.filter((x) => x.estado === "Propuesta")}
          onCreada={() => { setInicialForm(null); void recargar(); }}
          onCancelar={() => { setAgregando(false); setInicialForm(null); }}
        />
      )}

      {avisoDinero && (
        <div className="flex items-start justify-between gap-3 rounded-[var(--sg-radius-sm)] border border-[var(--sg-info)]/40 bg-[var(--sg-info-soft)] px-3 py-2 text-xs text-[var(--sg-text-secondary)]">
          <span>
            Si el cliente ya había abonado, ese dinero <strong>queda a favor en la orden</strong>: se aplica a la alternativa que
            apruebe o, si se le devuelve, se anula el abono en la tarjeta Abonos. El panel de cobros lo marca en “Abonos de más”
            mientras tanto.
          </span>
          <button type="button" onClick={() => setAvisoDinero(false)} className="shrink-0 text-[var(--sg-text-muted)] hover:text-[var(--sg-text-primary)]">✕</button>
        </div>
      )}

      {error && <p className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] px-3 py-2 text-xs text-[var(--sg-danger)]">{error}</p>}

      {cargando ? (
        <p className="text-sm text-[var(--sg-text-muted)]">Cargando presupuesto…</p>
      ) : lineas.length === 0 ? (
        !agregando && (
          <p className="rounded-[var(--sg-radius-md)] border border-dashed border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-3 text-sm text-[var(--sg-text-secondary)]">
            Todavía no hay presupuesto. Agrega servicios, repuestos o productos digitales para proponérselos al cliente.
          </p>
        )
      ) : (
        <div className="overflow-x-auto rounded-[var(--sg-radius-md)] border border-[var(--sg-border)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--sg-border)] bg-[var(--sg-panel)] text-[10px] uppercase tracking-wider text-[var(--sg-text-muted)]">
                <th className="w-8 px-2 py-1.5"></th>
                <th className="px-2 py-1.5 text-left">Línea</th>
                <th className="px-2 py-1.5 text-right">Cant.</th>
                <th className="px-2 py-1.5 text-right">P. unit.</th>
                <th className="px-2 py-1.5 text-right">Subtotal</th>
                <th className="px-2 py-1.5 text-left">Estado</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sg-divider)]">
              {lineas.map((l) => {
                const puedeSel = l.estado === "Propuesta" || l.estado === "Aprobada";
                return (
                  <tr key={l.id} className={l.estado === "Rechazada" ? "opacity-55" : ""}>
                    <td className="px-2 py-1.5 align-top">
                      {puedeSel && <input type="checkbox" checked={seleccion.has(l.id)} onChange={() => alternar(l.id)} className="mt-1 accent-[#D7FF4F]" aria-label={`Seleccionar ${l.descripcion}`} />}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <span className="block text-[var(--sg-text-primary)]">
                        <InsigniaPrioridad p={l.prioridad} />
                        {l.grupoAlternativas && letraGrupo.get(l.grupoAlternativas) && (
                          <span title="El cliente elige solo una de las alternativas" className="mr-1 inline-block rounded-full border border-[var(--sg-border)] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[var(--sg-text-secondary)]">Alt. {letraGrupo.get(l.grupoAlternativas)}</span>
                        )}
                        {l.descripcion}
                      </span>
                      {l.notaCliente && <span className="block text-[11px] italic text-[var(--sg-text-secondary)]">“{l.notaCliente}”</span>}
                      {detalle?.lineaId === l.id && (
                        <div className="mt-1.5 space-y-1.5">
                          <CamposCliente prioridad={detalle.prioridad} nota={detalle.notaCliente} alternativaDe={detalle.alternativaDe}
                            propuestas={lineas.filter((x) => x.estado === "Propuesta" && x.id !== l.id)}
                            onCambio={(c) => setDetalle({ ...detalle, ...c })} />
                          <div className="flex justify-end gap-2">
                            {l.grupoAlternativas && <button type="button" onClick={() => { void accionLinea(l, "PATCH", { accion: "detalle", quitarAlternativa: true }); setDetalle(null); }} className={BTN_SEC}>Quitar de alternativas</button>}
                            <button type="button" onClick={() => setDetalle(null)} className={BTN_SEC}>Cancelar</button>
                            <button type="button" disabled={ocupado === l.id} onClick={() => { void accionLinea(l, "PATCH", { accion: "detalle", prioridad: detalle.prioridad, notaCliente: detalle.notaCliente, alternativaDe: detalle.alternativaDe || null }); setDetalle(null); }} className={BTN_PRI}>Guardar</button>
                          </div>
                        </div>
                      )}
                      {(() => {
                        const p = l.operacionId ? pedidos[l.operacionId] : undefined;
                        if (l.bajoPedido && !l.operacionId) {
                          return (
                            <span className="block text-[11px] leading-snug">
                              <span className="uppercase tracking-wide text-[10px] text-[var(--sg-text-muted)]">Repuesto · bajo pedido</span>
                              <span className="block text-[var(--sg-text-muted)]">
                                {(l.proveedorId && proveedores[l.proveedorId]) || "Sin proveedor"}{l.tiempoEstimado ? ` · ${l.tiempoEstimado}` : ""}
                                {l.costoProveedor !== null ? ` · costo ${mon(l.costoProveedor)}` : ""}
                                {l.urlProveedor && <> {" · "}<a href={l.urlProveedor} target="_blank" rel="noopener noreferrer" className="text-[var(--sg-lime)] hover:underline">ver repuesto</a></>}
                              </span>
                              {l.estado === "Propuesta" && <span className="block text-[var(--sg-text-muted)]">Solo presupuesto: el pedido se crea cuando el cliente apruebe.</span>}
                            </span>
                          );
                        }
                        if (!l.operacionId) {
                          return (
                            <span className="text-[10px] uppercase tracking-wide text-[var(--sg-text-muted)]">
                              {l.tipo}{l.tipo === "Repuesto" ? (l.itemId ? " · del inventario" : " · por conseguir") : ""}
                            </span>
                          );
                        }
                        const fase = p ? fasePedido(p) : null;
                        return (
                          <span className="block text-[11px] leading-snug">
                            <span className="uppercase tracking-wide text-[10px] text-[var(--sg-text-muted)]">Repuesto · bajo pedido</span>
                            {p && (
                              <span className="block text-[var(--sg-text-muted)]">
                                {p.proveedorNombre || "Sin proveedor"}{p.tiempoEstimado ? ` · ${p.tiempoEstimado}` : ""}
                                {p.costoProveedor !== null ? ` · costo ${mon(p.costoProveedor)}` : ""}
                                {" · "}<Link href={`/operaciones/${encodeURIComponent(p.operacionId)}`} className="text-[var(--sg-lime)] hover:underline">{p.codigo}</Link>
                                {p.urlProveedor && <> {" · "}<a href={p.urlProveedor} target="_blank" rel="noopener noreferrer" className="text-[var(--sg-lime)] hover:underline">ver repuesto</a></>}
                              </span>
                            )}
                            {fase && (
                              <span className={`block font-semibold ${FASE_PEDIDO[fase].clase}`}>
                                {FASE_PEDIDO[fase].texto}
                                {p?.item && <> · <span className="font-mono">{p.item.sku}</span></>}
                                {fase === "en_camino" && <> · <Link href="/shipping-v2/recepcion" className="underline">márcalo Recibido al llegar</Link></>}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                      {l.respuestaCliente && (
                        <span className={`mt-0.5 block text-[11px] font-semibold ${l.respuestaCliente === "Aprobó" ? "text-[var(--sg-success)]" : normalizarPrioridad(l.prioridad) === "Necesaria" && !l.grupoAlternativas ? "text-[var(--sg-danger)]" : "text-[var(--sg-text-muted)]"}`}>
                          {l.respuestaCliente === "Aprobó" ? "✓ El cliente aprobó por el enlace"
                            : normalizarPrioridad(l.prioridad) === "Necesaria" && !l.grupoAlternativas ? "⚠ El cliente NO aprobó algo NECESARIO por el enlace — sin esto no se puede reparar"
                            : "✕ El cliente no aprobó por el enlace"}
                          {l.fechaRespuestaCliente ? ` · ${fechaCortaEc(l.fechaRespuestaCliente)}` : ""}
                          {l.estado === "Propuesta" ? " — cambió después: espera su nueva respuesta" : ""}
                        </span>
                      )}
                      {l.notaCarga && l.estado === "Aprobada" && !(l.operacionId && l.notaCarga.startsWith("Esperando pedido")) && <span className="mt-0.5 block text-[11px] text-[var(--sg-warning)]">{l.notaCarga}</span>}
                      {l.historial && (
                        <button type="button" onClick={() => setVerHistorial(verHistorial === l.id ? null : l.id)} className="mt-0.5 block text-[10px] text-[var(--sg-text-muted)] hover:text-[var(--sg-text-primary)]">
                          {verHistorial === l.id ? "Ocultar historial" : "Ver historial"}
                        </button>
                      )}
                      {verHistorial === l.id && (
                        <pre className="mt-1 whitespace-pre-wrap rounded border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 py-1 font-sans text-[10px] text-[var(--sg-text-secondary)]">{l.historial}</pre>
                      )}
                      {revirtiendo?.lineaId === l.id && (
                        <div className="mt-1.5 space-y-1.5 rounded-[var(--sg-radius-sm)] border border-[var(--sg-warning)]/50 bg-[var(--sg-warning-soft)] p-2">
                          <p className="text-[11px] text-[var(--sg-text-secondary)]">{REVERSA_TEXTO[revirtiendo.accion].ayuda}</p>
                          <input autoFocus value={revirtiendo.motivo} onChange={(e) => setRevirtiendo({ ...revirtiendo, motivo: e.target.value })} placeholder={REVERSA_TEXTO[revirtiendo.accion].placeholder} className={INPUT} />
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setRevirtiendo(null)} className={BTN_SEC}>Volver</button>
                            <button type="button" disabled={ocupado === l.id} onClick={confirmarReversa} className={BTN_PRI}>{ocupado === l.id ? "Aplicando…" : `Confirmar: ${REVERSA_TEXTO[revirtiendo.accion].boton.toLowerCase()}`}</button>
                          </div>
                        </div>
                      )}
                      {vinculando === l.id && (
                        <div className="mt-1.5">
                          <BuscadorRepuesto ordenId={ordenId} onElegir={(i) => { setVinculando(null); void accionLinea(l, "PATCH", { itemId: i.id }); }} />
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right align-top tabular-nums">{l.cantidad}</td>
                    <td className="px-2 py-1.5 text-right align-top tabular-nums">{mon(l.precioUnitario)}</td>
                    <td className="px-2 py-1.5 text-right align-top font-semibold tabular-nums text-[var(--sg-text-primary)]">{mon(subtotalLinea(l))}</td>
                    <td className="px-2 py-1.5 align-top">
                      <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ESTADO_BADGE[l.estado]}`}>{ESTADO_TEXTO[l.estado]}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right align-top text-[11px]">
                      {l.operacionId && pedidos[l.operacionId] && fasePedido(pedidos[l.operacionId]) === "vencido" && (l.estado === "Propuesta" || l.estado === "Aprobada") && (
                        <button type="button" disabled={ocupado === l.id} onClick={() => accionLinea(l, "PATCH", { accion: "reactivar" })} className="mr-2 text-[var(--sg-lime)] hover:underline">Reactivar cotización</button>
                      )}
                      {l.operacionId && l.estado === "Aprobada" && pedidos[l.operacionId] && fasePedido(pedidos[l.operacionId]) === "esperando_pedido" && (
                        <button type="button" disabled={ocupado === l.id} onClick={() => pedirAlProveedor(l)} className="mr-2 font-semibold text-[var(--sg-lime)] hover:underline">
                          {ocupado === l.id ? "Registrando…" : "Ya se pidió al proveedor"}
                        </button>
                      )}
                      {(l.estado === "Aprobada" || l.estado === "Cargada") && (() => {
                        const rv = reversas[l.id];
                        if (!rv) return null;
                        const permitidas = (["recotizar", "cancelar", "liberar"] as AccionReversa[]).filter((a) => rv[a].permitido);
                        if (permitidas.length === 0) {
                          // Nada se puede deshacer aquí: se dice por qué y dónde, en vez de esconderlo.
                          const motivo = rv.cancelar.motivo ?? rv.liberar.motivo;
                          return l.bajoPedido || l.estado === "Aprobada"
                            ? <span className="mr-2 cursor-help text-[var(--sg-text-muted)] underline decoration-dotted" title={motivo}>¿Deshacer?</span>
                            : null;
                        }
                        return permitidas.map((a) => (
                          <button key={a} type="button" disabled={ocupado === l.id} onClick={() => setRevirtiendo({ lineaId: l.id, accion: a, motivo: "" })}
                            className={`mr-2 ${a === "cancelar" ? "text-[var(--sg-text-muted)] hover:text-[var(--sg-danger)]" : "text-[var(--sg-text-muted)] hover:text-[var(--sg-lime)]"}`}>
                            {REVERSA_TEXTO[a].boton}
                          </button>
                        ));
                      })()}
                      {aceptaVincularArticulo(l) && !l.itemId && !l.operacionId && (
                        <button type="button" disabled={ocupado === l.id} onClick={() => setVinculando(vinculando === l.id ? null : l.id)} className="mr-2 text-[var(--sg-lime)] hover:underline">Vincular artículo</button>
                      )}
                      {esEditable(l) && (
                        <>
                          <button type="button" disabled={ocupado === l.id} onClick={() => setDetalle(detalle?.lineaId === l.id ? null : { lineaId: l.id, prioridad: normalizarPrioridad(l.prioridad), notaCliente: l.notaCliente ?? "", alternativaDe: "" })} className="mr-2 text-[var(--sg-text-muted)] hover:text-[var(--sg-lime)]">Ajustar</button>
                          <button type="button" disabled={ocupado === l.id} onClick={() => accionLinea(l, "PATCH", { accion: "rechazar" })} className="mr-2 text-[var(--sg-text-muted)] hover:text-[var(--sg-warning)]">Rechazar</button>
                          <button type="button" disabled={ocupado === l.id} onClick={() => accionLinea(l, "DELETE")} className="text-[var(--sg-text-muted)] hover:text-[var(--sg-danger)]" aria-label="Borrar línea">✕</button>
                        </>
                      )}
                      {l.estado === "Rechazada" && (
                        <button type="button" disabled={ocupado === l.id} onClick={() => accionLinea(l, "PATCH", { accion: "reabrir" })} className="text-[var(--sg-text-muted)] hover:text-[var(--sg-text-primary)]">Reabrir</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {seleccionables.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setSeleccion(seleccion.size === seleccionables.length ? new Set() : new Set(seleccionables.map((l) => l.id)))} className="text-[11px] text-[var(--sg-text-muted)] hover:text-[var(--sg-text-primary)]">
            {seleccion.size === seleccionables.length ? "Quitar selección" : "Seleccionar todo lo pendiente"}
          </button>
          <div className="flex flex-wrap gap-2">
            {propuestasSel.length > 0 && (
              <button type="button" disabled={!!ocupado} onClick={rechazarSeleccion} className={BTN_SEC}>Cliente rechazó ({propuestasSel.length})</button>
            )}
            {aprobadasPendientes.length > 0 && seleccion.size === 0 && (
              <button type="button" disabled={!!ocupado} onClick={() => cargarAprobadas(aprobadasPendientes.map((l) => l.id))} className={BTN_SEC}>
                Cargar aprobadas ({aprobadasPendientes.length})
              </button>
            )}
            <button type="button" disabled={seleccion.size === 0 || !!ocupado} onClick={() => cargarAprobadas([...seleccion])} className={BTN_PRI}>
              {ocupado === "carga" ? "Cargando…" : `Cliente aprobó → Cargar a la orden${seleccion.size ? ` (${seleccion.size})` : ""}`}
            </button>
          </div>
        </div>
      )}

      {resultados && (
        <div className="rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-panel)] p-3 text-xs">
          <p className="mb-1 font-bold text-[var(--sg-text-primary)]">
            {resultados.filter((r) => r.cargada).length} de {resultados.length} líneas cargadas a la orden
          </p>
          <ul className="space-y-0.5">
            {resultados.map((r) => (
              <li key={r.lineaId} className={r.cargada ? "text-[var(--sg-success)]" : "text-[var(--sg-warning)]"}>
                {r.cargada ? "✓" : "•"} {r.descripcion}
                {!r.cargada && ` — ${r.error ?? (r.esperandoPedido ? "aprobado, falta pedirlo al proveedor" : r.accion.tipo === "pendiente" ? r.accion.motivo : "pendiente")}`}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setResultados(null)} className="mt-2 text-[11px] text-[var(--sg-text-muted)] hover:text-[var(--sg-text-primary)]">Cerrar</button>
        </div>
      )}
    </section>
  );
}
