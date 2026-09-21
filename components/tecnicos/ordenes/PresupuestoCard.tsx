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
  subtotalLinea, esEditable, aceptaVincularArticulo, fasePedido,
  type LineaPresupuesto, type TipoLinea, type EstadoPresupuesto, type PasoCarga, type InfoPedido, type FasePedido,
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

function describirAccion(p: PasoCarga): { texto: string; ok: boolean } {
  const a = p.accion;
  if (a.tipo === "aprobar_pedido") return { ok: true, texto: `La operación ${a.codigo} pasa a Aprobado. El SKU nace cuando se le pida al proveedor.` };
  if (a.tipo === "ya_en_inventario") return { ok: true, texto: `Ya está en inventario (${a.sku}); queda cargada.` };
  if (a.tipo === "crear_servicio") return { ok: true, texto: `Se agrega a Servicios por ${mon(a.costo)}` };
  if (a.tipo === "reservar_repuesto") {
    const difiere = a.precioInventario !== null && Math.abs(a.precioInventario - p.subtotal) > 0.009;
    return {
      ok: true,
      texto: `Se reserva ${a.sku} en Repuestos${difiere ? ` — ojo: la cuenta usará el precio del inventario, ${mon(a.precioInventario!)}` : ""}`,
    };
  }
  if (a.tipo === "asignar_producto_digital") return { ok: true, texto: `Se asigna la unidad ${a.etiqueta}` };
  return { ok: false, texto: `Queda pendiente: ${a.motivo}` };
}

// ─── Buscadores (reutilizan los endpoints de las tarjetas existentes) ────────

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
  useEffect(() => {
    if (dq.trim().length < 2) { setRes([]); return; }
    let cancel = false;
    setCargando(true);
    fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/repuestos-v2/buscar?q=${encodeURIComponent(dq.trim())}`)
      .then((r) => r.json()).then((j) => { if (!cancel) setRes(j.success ? j.data : []); })
      .catch(() => {}).finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [dq, ordenId]);
  return (
    <div className="relative">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar repuesto en inventario (nombre o SKU)…" className={INPUT} />
      {(res.length > 0 || cargando) && (
        <ul className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-64 overflow-auto rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-bg)] shadow-2xl">
          {cargando && <li className="px-3 py-2 text-xs text-[var(--sg-text-muted)]">Buscando…</li>}
          {res.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => { onElegir(i); setQ(""); setRes([]); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--sg-card)]">
                <span className="min-w-0"><span className="block truncate text-[var(--sg-text-primary)]">{i.nombre}</span><span className="text-[10px] text-[var(--sg-text-muted)]">{i.sku}</span></span>
                <span className="shrink-0 text-xs font-semibold text-[var(--sg-lime)]">{i.precioVentaFinal !== null ? mon(i.precioVentaFinal) : "sin precio"}</span>
              </button>
            </li>
          ))}
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
};
const BORRADOR_VACIO = (tipo: TipoLinea): Borrador => ({
  tipo, descripcion: "", cantidad: "1", precio: "", servicioCatalogoId: null, itemId: null, itemSku: null, productoCatalogoId: null,
  proveedorId: "", categoria: "Repuesto", costo: "", url: "", tiempo: "",
});

function FormLinea({ ordenId, onCreada, onCancelar }: { ordenId: string; onCreada: () => void; onCancelar: () => void }) {
  const [b, setB] = useState<Borrador>(BORRADOR_VACIO("Servicio"));
  const [modoRepuesto, setModoRepuesto] = useState<"inventario" | "pedido">("inventario");
  const [opcionesPedido, setOpcionesPedido] = useState<OpcionesPedido | null>(null);
  const [servicios, setServicios] = useState<CatServicio[]>([]);
  const [digitales, setDigitales] = useState<CatDigital[]>([]);
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (b.tipo === "Servicio") return servicios.filter((s) => !t || s.nombre.toLowerCase().includes(t)).slice(0, 8);
    if (b.tipo === "Producto digital") return digitales.filter((d) => !t || `${d.productoBase} ${d.marca ?? ""}`.toLowerCase().includes(t)).slice(0, 8);
    return [];
  }, [q, b.tipo, servicios, digitales]);

  const esPedido = b.tipo === "Repuesto" && modoRepuesto === "pedido";
  const elegido = b.servicioCatalogoId || b.itemId || b.productoCatalogoId || esPedido;
  const cantidadFija = (b.tipo === "Repuesto" && (!!b.itemId || esPedido)) || b.tipo === "Producto digital";

  function cambiarTipo(t: TipoLinea) { setB(BORRADOR_VACIO(t)); setQ(""); setError(null); setModoRepuesto("inventario"); }

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
      setB(BORRADOR_VACIO(b.tipo)); setQ("");
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
        <div className="relative">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={b.tipo === "Servicio" ? "Buscar servicio del catálogo…" : "Buscar producto digital del catálogo…"} className={INPUT} />
          {sugerencias.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-64 overflow-auto rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-bg)] shadow-2xl">
              {b.tipo === "Servicio" && (sugerencias as CatServicio[]).map((s) => (
                <li key={s.id}><button type="button" onClick={() => setB({ ...b, servicioCatalogoId: s.id, descripcion: s.nombre, precio: s.costoSugerido !== null ? String(s.costoSugerido) : "" })} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--sg-card)]">
                  <span className="truncate text-[var(--sg-text-primary)]">{s.nombre}</span>
                  <span className="shrink-0 text-xs text-[var(--sg-lime)]">{s.costoSugerido !== null ? mon(s.costoSugerido) : ""}</span>
                </button></li>
              ))}
              {b.tipo === "Producto digital" && (sugerencias as CatDigital[]).map((d) => (
                <li key={d.id}><button type="button" onClick={() => setB({ ...b, productoCatalogoId: d.id, descripcion: [d.marca, d.productoBase].filter(Boolean).join(" "), precio: d.precioVentaCatalogo !== null ? String(d.precioVentaCatalogo) : "", cantidad: "1" })} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--sg-card)]">
                  <span className="truncate text-[var(--sg-text-primary)]">{[d.marca, d.productoBase].filter(Boolean).join(" ")}</span>
                  <span className="shrink-0 text-xs text-[var(--sg-lime)]">{d.precioVentaCatalogo !== null ? mon(d.precioVentaCatalogo) : ""}</span>
                </button></li>
              ))}
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

export function PresupuestoCard({ ordenId, onCargado }: { ordenId: string; onCargado: () => void | Promise<void> }) {
  const [lineas, setLineas] = useState<LineaPresupuesto[]>([]);
  const [pedidos, setPedidos] = useState<Record<string, InfoPedido>>({});
  const [estado, setEstado] = useState<EstadoPresupuesto>("sin_presupuesto");
  const [totales, setTotales] = useState<Totales | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [preview, setPreview] = useState<PasoCarga[] | null>(null);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const recargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto`);
      const j = await r.json();
      if (!montado.current) return;
      if (!j.success) { setError(j.error ?? "No se pudo cargar el presupuesto"); return; }
      setLineas(j.data.lineas); setPedidos(j.data.pedidos ?? {}); setEstado(j.data.estado); setTotales(j.data.totales); setError(null);
      setSeleccion((prev) => new Set([...prev].filter((id) => (j.data.lineas as LineaPresupuesto[]).some((l) => l.id === id && (l.estado === "Propuesta" || l.estado === "Aprobada")))));
    } catch { if (montado.current) setError("Error de red al cargar el presupuesto"); }
    finally { if (montado.current) setCargando(false); }
  }, [ordenId]);

  useEffect(() => { void recargar(); }, [recargar]);

  const seleccionables = lineas.filter((l) => l.estado === "Propuesta" || l.estado === "Aprobada");
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

  async function pedirVistaPrevia(ids: string[]) {
    setOcupado("carga"); setError(null); setResultados(null);
    try {
      const r = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto/cargar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lineaIds: ids }),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error ?? "No se pudo preparar la carga"); return; }
      setPreview(j.data.vistaPrevia);
    } catch { setError("Error de red"); }
    finally { setOcupado(null); }
  }

  async function confirmarCarga() {
    if (!preview) return;
    setOcupado("carga"); setError(null);
    try {
      const r = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto/cargar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineaIds: preview.map((p) => p.lineaId), confirmar: true }),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error ?? "No se pudo cargar el presupuesto"); return; }
      setResultados(j.data.resultados);
      setPreview(null);
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

      {agregando && <FormLinea ordenId={ordenId} onCreada={() => void recargar()} onCancelar={() => setAgregando(false)} />}

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
                      <span className="block text-[var(--sg-text-primary)]">{l.descripcion}</span>
                      {(() => {
                        const p = l.operacionId ? pedidos[l.operacionId] : undefined;
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
                      {l.notaCarga && l.estado === "Aprobada" && !(l.operacionId && l.notaCarga.startsWith("Esperando pedido")) && <span className="mt-0.5 block text-[11px] text-[var(--sg-warning)]">{l.notaCarga}</span>}
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
                      {l.estado === "Aprobada" && (
                        <button type="button" disabled={ocupado === l.id} onClick={() => accionLinea(l, "PATCH", { accion: "cancelar" })} className="mr-2 text-[var(--sg-text-muted)] hover:text-[var(--sg-danger)]" title="El cliente se arrepintió o el repuesto no se consiguió">Cancelar</button>
                      )}
                      {aceptaVincularArticulo(l) && !l.itemId && !l.operacionId && (
                        <button type="button" disabled={ocupado === l.id} onClick={() => setVinculando(vinculando === l.id ? null : l.id)} className="mr-2 text-[var(--sg-lime)] hover:underline">Vincular artículo</button>
                      )}
                      {esEditable(l) && (
                        <>
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
              <button type="button" disabled={!!ocupado} onClick={() => pedirVistaPrevia(aprobadasPendientes.map((l) => l.id))} className={BTN_SEC}>
                Reintentar pendientes ({aprobadasPendientes.length})
              </button>
            )}
            <button type="button" disabled={seleccion.size === 0 || !!ocupado} onClick={() => pedirVistaPrevia([...seleccion])} className={BTN_PRI}>
              {ocupado === "carga" ? "Preparando…" : `Cliente aprobó → Cargar a la orden${seleccion.size ? ` (${seleccion.size})` : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* Vista previa: nada se escribió todavía */}
      {preview && (
        <div className="space-y-2 rounded-[var(--sg-radius-md)] border border-[var(--sg-lime)]/40 bg-[var(--sg-lime-soft)] p-3">
          <p className="text-sm font-bold text-[var(--sg-text-primary)]">Vista previa — esto es lo que pasará al confirmar</p>
          <ul className="space-y-1">
            {preview.map((p) => {
              const d = describirAccion(p);
              return (
                <li key={p.lineaId} className="flex items-start justify-between gap-3 text-xs">
                  <span className="min-w-0">
                    <span className="font-semibold text-[var(--sg-text-primary)]">{p.descripcion}</span>
                    <span className={`block ${d.ok ? "text-[var(--sg-text-secondary)]" : "text-[var(--sg-warning)]"}`}>{d.texto}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{mon(p.subtotal)}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-[var(--sg-text-muted)]">
            Las líneas marcadas como pendientes quedan aprobadas y se cargan después, sin frenar al resto.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPreview(null)} disabled={ocupado === "carga"} className={BTN_SEC}>Cancelar</button>
            <button type="button" onClick={confirmarCarga} disabled={ocupado === "carga"} className={BTN_PRI}>
              {ocupado === "carga" ? "Cargando…" : "Confirmar: el cliente aprobó"}
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
