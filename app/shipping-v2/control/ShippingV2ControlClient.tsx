"use client";

// Pestaña Control (punto 10c-1): revisión de inventario como lista de tareas.
//
// Mejora del dueño (18-oct): "Abrir" muestra el artículo en un modal sin salir
// de la lista (filtros, orden y posición se conservan); la fila abierta queda
// resaltada; al guardar, el sistema vuelve a revisar los asuntos de ese
// artículo y, si quedaron resueltos, al cerrar el modal la fila se marca
// "Resuelto" y sale con una animación. Una fila solo sale cuando el servidor
// confirma que ya no tiene asuntos abiertos; si la verificación falla, se queda.

import { CopyableSKU } from "@/components/ui/copyable-sku";
import { FichaArticuloVista } from "@/components/shipping-v2/ficha-articulo/FichaArticuloVista";
import type { FichaArticulo } from "@/lib/shipping-v2/ficha-articulo";
import { useAlCambiarArticulo } from "@/components/shipping-v2/ficha-articulo/contexto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { GRUPO_TIPO, TIPOS_ASUNTO, type TipoAsunto } from "@/lib/shipping-v2/revision-inventario";
import type { ShippingV2AsuntoRevision } from "@/lib/shipping-v2/airtable";
import { CodigosLista } from "./CodigosLista";
import { ConteosLista } from "./ConteosLista";
import { CuadrePanel } from "./CuadrePanel";


const TODOS = "Todos";
const botonClass = "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-2.5 text-[12px] font-semibold text-[#EDEDE7] transition hover:border-[#D7FF4F]/50 disabled:opacity-50";

/** Cómo se ve una fila mientras se trabaja: verificando, ya resuelta (antes de salir) o saliendo. */
type EstadoFila = "verificando" | "resuelto" | "saliendo";

function fechaHora(valor?: string) {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-EC", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Asuntos que se corrigen en otra pantalla (se abren en otra pestaña). */
function enlaceExterno(a: ShippingV2AsuntoRevision): string | null {
  const idClave = a.clave.split("|").pop() ?? "";
  if (a.tipo === "Falta respaldo") return "/shipping-v2/pagos";
  if (a.tipo === "Novedad sin movimiento") return "/shipping-v2/novedades";
  if (a.tipo === "Caja cerrada sin recibir" && idClave.startsWith("rec")) return `/shipping-v2/packings/${idClave}`;
  if (a.tipo === "Kardex no cuadra" && idClave.startsWith("rec")) return `/shipping-v2/kardex?vista=producto&q=${idClave}`;
  return null;
}

/** El texto sin el "SKU · " del principio (el SKU tiene su columna). */
type GrupoAsuntos = { clave: string; asuntos: ShippingV2AsuntoRevision[] };

/** Punto 18b: agrupa los asuntos del mismo tipo y SKU (sin SKU, cada uno va solo). */
function agruparAsuntos(asuntos: readonly ShippingV2AsuntoRevision[]): GrupoAsuntos[] {
  const grupos = new Map<string, GrupoAsuntos>();
  for (const a of asuntos) {
    const sku = String(a.sku ?? "").trim().toUpperCase();
    const clave = sku ? `${a.tipo}|${sku}` : `id:${a.id}`;
    const grupo = grupos.get(clave);
    if (grupo) grupo.asuntos.push(a);
    else grupos.set(clave, { clave, asuntos: [a] });
  }
  return [...grupos.values()];
}

function textoAsunto(a: ShippingV2AsuntoRevision) {
  return a.sku && a.asunto.startsWith(`${a.sku} · `) ? a.asunto.slice(a.sku.length + 3) : a.asunto;
}

export type VistaControl = "revision" | "conteos" | "codigos";

export function ShippingV2ControlClient({
  asuntosIniciales,
  vistaInicial = "revision",
  esAdministrador = false,
  codigosPendientes: pendientesIniciales = 0,
}: {
  asuntosIniciales: ShippingV2AsuntoRevision[];
  vistaInicial?: VistaControl;
  esAdministrador?: boolean;
  codigosPendientes?: number;
}) {
  const [vista, setVista] = useState<VistaControl>(vistaInicial);
  const [conteosAbiertos, setConteosAbiertos] = useState<number | null>(null);
  const [codigosPendientes, setCodigosPendientes] = useState(pendientesIniciales);
  const [abiertos, setAbiertos] = useState(asuntosIniciales);
  /** Filas ya resueltas que siguen a la vista hasta su animación de salida. */
  const [porSalir, setPorSalir] = useState<ShippingV2AsuntoRevision[]>([]);
  const [estadoFila, setEstadoFila] = useState<Record<string, EstadoFila>>({});
  const [resueltos, setResueltos] = useState<ShippingV2AsuntoRevision[] | null>(null);
  const [verResueltos, setVerResueltos] = useState(false);
  const [grupo, setGrupo] = useState(TODOS);
  const [busy, setBusy] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [motivoDe, setMotivoDe] = useState<string | null>(null);
  /** Punto 10c-4: fila con el panel "Contar" abierto. */
  const [cuadreDe, setCuadreDe] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  /** La fila en la que se está trabajando (queda resaltada). */
  const [activa, setActiva] = useState<string | null>(null);
  const [modal, setModal] = useState<{ itemId: string; asuntoId: string } | null>(null);
  /** Asuntos abiertos en otra pestaña: se verifican al volver a esta. */
  const enOtraPestana = useRef<Set<string>>(new Set());
  const modalAbierto = useRef(false);
  modalAbierto.current = Boolean(modal);

  // ── Lista ──
  const ultima = useMemo(() => abiertos.map((a) => a.ultimaRevision).sort().pop() ?? "", [abiertos]);
  const lista = useMemo(() => {
    if (verResueltos) return (resueltos ?? []).filter((a) => a.estado !== "Abierto").sort((a, b) => b.fechaResuelto.localeCompare(a.fechaResuelto));
    const orden = (t: string) => (TIPOS_ASUNTO as readonly string[]).indexOf(t);
    const ids = new Set(abiertos.map((a) => a.id));
    return [...abiertos, ...porSalir.filter((a) => !ids.has(a.id))].sort((a, b) => orden(a.tipo) - orden(b.tipo) || a.sku.localeCompare(b.sku));
  }, [verResueltos, resueltos, abiertos, porSalir]);
  const grupoDe = (a: ShippingV2AsuntoRevision) => GRUPO_TIPO[a.tipo as TipoAsunto] ?? "Otros";
  const grupos = useMemo(() => {
    const conteo = new Map<string, number>();
    const base = verResueltos ? lista : abiertos; // los contadores cuentan solo lo pendiente
    for (const a of base) conteo.set(grupoDe(a), (conteo.get(grupoDe(a)) ?? 0) + 1);
    return Array.from(conteo.entries()).sort((a, b) => b[1] - a[1]);
  }, [lista, abiertos, verResueltos]);
  const totalVista = verResueltos ? lista.length : abiertos.length;
  const visibles = grupo === TODOS ? lista : lista.filter((a) => grupoDe(a) === grupo);
  // Punto 18b: mismo tipo y mismo SKU → una sola fila (en el orden en que aparecen).
  const gruposAsuntos = useMemo(() => agruparAsuntos(visibles), [visibles]);
  const [gruposAbiertos, setGruposAbiertos] = useState<ReadonlySet<string>>(() => new Set());

  // ── Verificación ──
  const marcar = useCallback((ids: string[], estado: EstadoFila | null) => {
    setEstadoFila((actual) => {
      const nuevo = { ...actual };
      for (const id of ids) {
        if (estado) nuevo[id] = estado;
        else delete nuevo[id];
      }
      return nuevo;
    });
  }, []);

  /** Animación de salida: "Resuelto" un momento, luego se desvanece y se quita. */
  const despedir = useCallback((filas: ShippingV2AsuntoRevision[]) => {
    if (!filas.length) return;
    const ids = filas.map((f) => f.id);
    window.setTimeout(() => marcar(ids, "saliendo"), 900);
    window.setTimeout(() => {
      setPorSalir((l) => l.filter((f) => !ids.includes(f.id)));
      marcar(ids, null);
      setActiva((a) => (a && ids.includes(a) ? null : a));
    }, 1300);
  }, [marcar]);

  const pendientesDeSalida = useRef<ShippingV2AsuntoRevision[]>([]);
  const abiertosRef = useRef(abiertos);
  abiertosRef.current = abiertos;

  /** Vuelve a revisar los asuntos de esos artículos (o usa lo que ya devolvió el servidor al cuadrar). */
  const verificar = useCallback(async (input: { itemIds?: string[]; asuntoIds?: string[] }, yaVerificados?: ShippingV2AsuntoRevision[]) => {
    const afectadas = abiertosRef.current.filter((a) => (input.asuntoIds ?? []).includes(a.id) || a.itemIds.some((id) => (input.itemIds ?? []).includes(id)));
    marcar(afectadas.map((a) => a.id), "verificando");
    try {
      let nuevos = yaVerificados;
      if (!nuevos) {
        const response = await fetch("/api/shipping-v2/control/revision/verificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: input.itemIds ?? [], asuntoIds: input.asuntoIds ?? [] }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo verificar."));
        nuevos = (payload.data as { abiertos: ShippingV2AsuntoRevision[] }).abiertos;
      }
      const siguen = new Set(nuevos.map((a) => a.id));
      const resueltasAhora = afectadas.filter((a) => !siguen.has(a.id));
      setAbiertos(nuevos);
      marcar(afectadas.filter((a) => siguen.has(a.id)).map((a) => a.id), null);
      if (resueltasAhora.length) {
        setPorSalir((l) => [...l.filter((f) => !resueltasAhora.some((r) => r.id === f.id)), ...resueltasAhora]);
        marcar(resueltasAhora.map((a) => a.id), "resuelto");
        // Con el modal abierto, la salida espera a que se cierre.
        if (modalAbierto.current) pendientesDeSalida.current = [...pendientesDeSalida.current, ...resueltasAhora];
        else despedir(resueltasAhora);
      }
      return true;
    } catch (e) {
      marcar(afectadas.map((a) => a.id), null);
      setMensaje(e instanceof Error ? e.message : "No se pudo verificar.");
      return false;
    }
  }, [marcar, despedir]);

  // Al volver de otra pestaña (Pagos, Novedades, la caja), verificar lo que se abrió allí.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible" || !enOtraPestana.current.size) return;
      const ids = Array.from(enOtraPestana.current);
      enOtraPestana.current.clear();
      void verificar({
        asuntoIds: ids.filter((id) => !id.startsWith("item:")),
        itemIds: ids.filter((id) => id.startsWith("item:")).map((id) => id.slice(5)),
      });
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [verificar]);

  // ── Modal del artículo ──
  // Punto 18 (25-oct): la ficha llega del mismo cargador que la ventana única
  // (recortada para el perfil de la sesión); Control conserva su cabecera con
  // los asuntos del artículo.
  const [detalle, setDetalle] = useState<FichaArticulo | null>(null);
  const [versionDetalle, setVersionDetalle] = useState(0);
  const [errorDetalle, setErrorDetalle] = useState("");
  const huboCambios = useRef(false);

  useEffect(() => {
    if (!modal) return;
    let cancelado = false;
    setErrorDetalle("");
    fetch(`/api/shipping-v2/items/${encodeURIComponent(modal.itemId)}/ficha`, { cache: "no-store" })
      .then(async (r) => {
        const payload = await r.json().catch(() => ({}));
        if (!r.ok || !payload.success) throw new Error(String(payload.error || "No se pudo cargar el artículo."));
        if (!cancelado) setDetalle(payload.data as FichaArticulo);
      })
      .catch((e) => { if (!cancelado) setErrorDetalle(e instanceof Error ? e.message : "Error inesperado."); });
    return () => { cancelado = true; };
  }, [modal, versionDetalle]);

  // Al cambiar de artículo se empieza desde cero (nunca con los datos del anterior).
  // Punto 18b: si es otra unidad del mismo SKU, la ficha se queda mientras llega.
  const detalleRef = useRef(detalle);
  useEffect(() => {
    detalleRef.current = detalle;
  }, [detalle]);
  useEffect(() => {
    const actual = detalleRef.current;
    const mismoSku = Boolean(
      modal && actual && actual.perfil !== "proveedor" && actual.datos.hermanas.some((h) => h.id === modal.itemId),
    );
    if (!mismoSku) setDetalle(null);
    huboCambios.current = false;
  }, [modal?.itemId]);

  function elegirUnidad(id: string) {
    setModal((m) => (m ? { ...m, itemId: id } : m));
  }

  function abrir(a: ShippingV2AsuntoRevision) {
    setActiva(a.id);
    const externo = enlaceExterno(a);
    if (externo || !a.itemIds[0]) {
      if (externo) {
        enOtraPestana.current.add(a.id);
        window.open(externo, "_blank", "noopener");
      }
      return;
    }
    pendientesDeSalida.current = [];
    setModal({ itemId: a.itemIds[0], asuntoId: a.id });
  }

  // Un dato guardado en la ficha (sin recargarla): se revisan los asuntos de ese artículo.
  useAlCambiarArticulo(({ id }) => {
    if (!modal || modal.itemId !== id) return;
    huboCambios.current = true;
    void verificar({ itemIds: [id] });
  });

  // Algo cambió en la ficha: se recarga y se vuelven a revisar los asuntos del artículo.
  function alCambiarFicha() {
    if (!modal) return;
    huboCambios.current = true;
    setVersionDetalle((v) => v + 1);
    void verificar({ itemIds: [modal.itemId] });
  }

  const cerrarModal = useCallback(() => {
    if (!modal) return;
    setModal(null);
    setDetalle(null);
    const salen = pendientesDeSalida.current;
    pendientesDeSalida.current = [];
    if (salen.length) despedir(salen);
    // Si abrió la ficha completa en otra pestaña, lo que haya hecho allí también se verifica.
    if (enOtraPestana.current.has(`item:${modal.itemId}`)) {
      enOtraPestana.current.delete(`item:${modal.itemId}`);
      void verificar({ itemIds: [modal.itemId] });
    }
  }, [modal, despedir, verificar]);

  useEffect(() => {
    if (!modal) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrarModal(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = original; document.removeEventListener("keydown", onKey); };
  }, [modal, cerrarModal]);

  // ── Acciones de la lista ──
  async function revisarAhora() {
    setBusy("revisar");
    setMensaje("");
    try {
      const response = await fetch("/api/shipping-v2/control/revision", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo revisar."));
      const { resumen, asuntos } = payload.data as { resumen: { nuevos: number; resueltos: number }; asuntos: ShippingV2AsuntoRevision[] };
      setAbiertos(asuntos);
      setPorSalir([]);
      setEstadoFila({});
      setResueltos(null);
      setMensaje(`${resumen.nuevos} nuevo${resumen.nuevos === 1 ? "" : "s"} · ${resumen.resueltos} resuelto${resumen.resueltos === 1 ? "" : "s"}`);
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy("");
    }
  }

  async function cambiarVista(ver: boolean) {
    setVerResueltos(ver);
    setGrupo(TODOS);
    if (!ver || resueltos) return;
    setBusy("resueltos");
    try {
      const response = await fetch("/api/shipping-v2/control/revision?resueltos=1");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo cargar."));
      setResueltos(payload.data as ShippingV2AsuntoRevision[]);
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy("");
    }
  }

  async function resolver(a: ShippingV2AsuntoRevision, estado: "Está bien" | "Abierto", texto = "") {
    setBusy(a.id);
    setMensaje("");
    try {
      const response = await fetch(`/api/shipping-v2/control/revision/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, motivo: texto }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo guardar."));
      const actualizado = payload.data as ShippingV2AsuntoRevision;
      if (estado === "Abierto") {
        setAbiertos((l) => [actualizado, ...l]);
        setResueltos((l) => (l ? l.filter((x) => x.id !== a.id) : l));
      } else {
        setAbiertos((l) => l.filter((x) => x.id !== a.id));
        setPorSalir((l) => [...l, a]);
        marcar([a.id], "resuelto");
        despedir([a]);
        setResueltos((l) => (l ? [actualizado, ...l] : l));
      }
      setMotivoDe(null);
      setMotivo("");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy("");
    }
  }

  function cambiarPestana(v: VistaControl) {
    setVista(v);
    try {
      window.history.replaceState(null, "", v === "revision" ? window.location.pathname : `?vista=${v}`);
    } catch {
      /* solo recuerda la pestaña al volver */
    }
  }

  const pestanas = (
    <div role="tablist" className="inline-flex overflow-hidden rounded-lg border border-[#3A3B35]">
      {([
        ["revision", `Revisión${abiertos.length ? ` · ${abiertos.length}` : ""}`],
        ["conteos", `Conteos${conteosAbiertos ? ` · ${conteosAbiertos}` : ""}`],
        ["codigos", `Códigos${codigosPendientes ? ` · ${codigosPendientes}` : ""}`],
      ] as const).map(([v, t], n) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={vista === v}
          onClick={() => cambiarPestana(v)}
          className={`h-8 px-3 text-[12.5px] ${n ? "border-l border-[#3A3B35]" : ""} ${vista === v ? "bg-[#D7FF4F] font-bold text-[#141510]" : "bg-[#151515] font-semibold text-[#B4B5AC] hover:text-[#EDEDE7]"}`}
        >
          {t}
        </button>
      ))}
    </div>
  );

  if (vista === "codigos") {
    return <CodigosLista pestanas={pestanas} esAdministrador={esAdministrador} onPendientes={setCodigosPendientes} />;
  }

  if (vista === "conteos") {
    return (
      <div className="space-y-2.5">
        <ConteosLista pestanas={pestanas} onAbiertos={setConteosAbiertos} />
      </div>
    );
  }

  // Punto 18b: los asuntos del mismo tipo y SKU van en una fila (la flecha los muestra).
  function renderAsunto(a: ShippingV2AsuntoRevision) {
    const conDetalle = Boolean(a.detalle);
    const est = estadoFila[a.id];
    const resaltada = activa === a.id && est !== "saliendo";
    const fondo = est === "resuelto" || est === "saliendo" ? "bg-[#7BE495]/[0.12]" : resaltada ? "bg-[#D7FF4F]/[0.07] shadow-[inset_3px_0_0_#D7FF4F]" : "";
    return (
      <div
        key={a.id}
        className={`grid transition-all duration-300 ease-out ${est === "saliendo" ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
      >
        <div className={`min-h-0 overflow-hidden border-b border-[#252622] transition-colors duration-300 ${fondo}`}>
          <div className="grid items-center gap-2.5 px-3 py-1.5 md:grid-cols-[108px_minmax(0,1fr)_220px_210px]">
            {a.itemIds[0] || enlaceExterno(a) ? (
              <button
                type="button"
                onClick={() => abrir(a)}
                className="inline-flex w-fit items-center gap-1 text-left font-mono font-semibold text-[#EDEDE7] underline decoration-[#8F908A]/50 decoration-dotted underline-offset-[3px] transition hover:text-[#D7FF4F] hover:decoration-[#D7FF4F] hover:decoration-solid"
                title={enlaceExterno(a) ? "Abrir en otra pestaña" : "Abrir el artículo"}
              >
                {a.sku || "Abrir"}
                {enlaceExterno(a) ? <ExternalLink className="h-3 w-3" aria-hidden="true" /> : null}
              </button>
            ) : (
              <span className="font-mono font-semibold">{a.sku || "—"}</span>
            )}
            <span className="min-w-0">
              {textoAsunto(a)}
              {conDetalle && a.tipo !== "Posible duplicado" && a.tipo !== "Falta respaldo" ? <span className="ml-1.5 font-semibold text-[#FFB07A]">({a.detalle})</span> : null}
              {conDetalle && (a.tipo === "Posible duplicado" || a.tipo === "Falta respaldo") ? (
                <button type="button" onClick={() => setExpandido((x) => (x === a.id ? null : a.id))} aria-expanded={expandido === a.id} className="ml-1 inline-flex align-middle text-[#8F908A] hover:text-[#F5F5F5]" aria-label="Ver detalle">
                  <ChevronDown className={`h-3.5 w-3.5 transition ${expandido === a.id ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
              ) : null}
            </span>
            <span className="text-[#B4B5AC]">
              {verResueltos ? (
                <span title={a.motivo}>{a.estado === "Está bien" ? "Dejado así" : a.estado}{a.resueltoPor ? ` · ${a.resueltoPor}` : ""}{a.fechaResuelto ? ` · ${fechaHora(a.fechaResuelto)}` : ""}</span>
              ) : (
                <>
                  {a.sugerencia}
                  {a.contado !== null && a.contadoPor ? <span className="text-[#FFC857]" title={fechaHora(a.fechaConteo)}> · contado {a.contado} ({a.contadoPor})</span> : null}
                </>
              )}
            </span>
            <span className="flex items-center justify-end gap-2">
              {est === "verificando" ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[#B4B5AC]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Verificando</span>
              ) : est === "resuelto" || est === "saliendo" ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#9FEFB3]"><Check className="h-3.5 w-3.5" aria-hidden="true" />Resuelto</span>
              ) : verResueltos ? (
                a.estado === "Está bien" ? <button type="button" onClick={() => void resolver(a, "Abierto")} disabled={busy === a.id} className={botonClass}>Reabrir</button> : null
              ) : (
                <>
                  {(a.tipo === "Unidades no cuadran" || a.tipo === "Vendido con unidades") && a.itemIds[0] ? (
                    <button
                      type="button"
                      onClick={() => { setCuadreDe(cuadreDe === a.id ? null : a.id); setMotivoDe(null); setActiva(a.id); }}
                      className={botonClass}
                      aria-expanded={cuadreDe === a.id}
                      title={esAdministrador ? "Escribir cuántas hay y cuadrar" : "Anotar cuántas hay (el Administrador lo aplica)"}
                    >
                      Contar
                    </button>
                  ) : null}
                  {esAdministrador && a.tipo === "Posible duplicado" ? (
                    <a
                      href={`/shipping-v2/control/fusionar?skus=${encodeURIComponent(a.clave.split("|")[1] ?? a.sku)}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => { enOtraPestana.current.add(a.id); setActiva(a.id); }}
                      className={botonClass}
                      title="Juntar estos productos en uno (se revisa solo al volver)"
                    >
                      Fusionar<ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => { setMotivoDe(motivoDe === a.id ? null : a.id); setMotivo(""); setCuadreDe(null); setActiva(a.id); }}
                    className={botonClass}
                    aria-expanded={motivoDe === a.id}
                    title="No cambia ningún dato: queda anotado con tu motivo y la fila pasa a resueltos"
                  >
                    Dejar así
                  </button>
                </>
              )}
            </span>
          </div>
          {expandido === a.id ? <div className="whitespace-pre-line px-3 pb-2 font-mono text-[11.5px] text-[#B4B5AC]">{a.detalle}</div> : null}
          {verResueltos && a.motivo ? <div className="px-3 pb-2 text-[11.5px] text-[#8F908A]">{a.motivo}</div> : null}
          {cuadreDe === a.id && !est ? (
            <CuadrePanel
              asunto={a}
              esAdministrador={esAdministrador}
              onCerrar={() => setCuadreDe(null)}
              onAnotado={(actualizado) => {
                setAbiertos((l) => l.map((x) => (x.id === actualizado.id ? actualizado : x)));
                setCuadreDe(null);
              }}
              onAplicado={(nuevos) => {
                setCuadreDe(null);
                void verificar({ asuntoIds: [a.id], itemIds: a.itemIds }, nuevos);
              }}
            />
          ) : null}
          {motivoDe === a.id && !est ? (
            <form className="flex items-center gap-2 px-3 pb-2" onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) void resolver(a, "Está bien", motivo); }}>
              <input
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo (no cambia ningún dato)"
                aria-label="Motivo"
                maxLength={500}
                className="h-7 min-w-0 flex-1 rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 text-[12px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/60"
              />
              <button type="submit" disabled={busy === a.id || !motivo.trim()} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-2.5 text-[12px] font-bold text-[#141510] disabled:opacity-50">
                {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Guardar
              </button>
            </form>
          ) : null}
        </div>
      </div>
    );
  }

  function renderGrupoAsuntos(g: GrupoAsuntos) {
    const abierto = gruposAbiertos.has(g.clave) || g.asuntos.some((a) => a.id === activa || cuadreDe === a.id || motivoDe === a.id);
    const primero = g.asuntos[0];
    const sugerencias = [...new Set(g.asuntos.map((a) => a.sugerencia))];
    const alternar = () => setGruposAbiertos((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(g.clave)) siguiente.delete(g.clave);
      else siguiente.add(g.clave);
      return siguiente;
    });
    return (
      <div key={`grupo:${g.clave}`}>
        <div className="border-b border-[#252622]">
          <div className="grid items-center gap-2.5 px-3 py-1.5 md:grid-cols-[108px_minmax(0,1fr)_220px_210px]">
            <span className="inline-flex min-w-0 items-center gap-1 font-mono font-semibold text-[#EDEDE7]">
              <button
                type="button"
                onClick={alternar}
                aria-expanded={abierto}
                aria-label={abierto ? `Ocultar los ${g.asuntos.length} asuntos` : `Ver los ${g.asuntos.length} asuntos`}
                className="grid h-4 w-4 shrink-0 place-items-center rounded text-[#8F908A] transition hover:text-[#D7FF4F] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/50"
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-150 ${abierto ? "rotate-90" : ""}`} aria-hidden="true" />
              </button>
              <span className="truncate">{primero.sku}</span>
            </span>
            <span className="min-w-0">
              {primero.tipo} <span className="text-[#8F908A]">· en {g.asuntos.length} registros</span>
            </span>
            <span className="truncate text-[#B4B5AC]" title={sugerencias.join(" · ")}>{sugerencias.length === 1 ? sugerencias[0] : "Revisa cada registro"}</span>
            <span className="flex items-center justify-end">
              <button type="button" onClick={alternar} className={botonClass} aria-expanded={abierto}>
                {abierto ? "Ocultar" : `Ver los ${g.asuntos.length}`}
              </button>
            </span>
          </div>
        </div>
        {abierto ? <div className="bg-[#141511]">{g.asuntos.map((a) => renderAsunto(a))}</div> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {pestanas}
        {mensaje ? <span className="text-[12px] text-[#C9CAC1]">{mensaje}</span> : null}
        <span className="ml-auto text-[12px] text-[#8F908A]">{ultima ? `Revisado ${fechaHora(ultima)}` : ""}</span>
        <button type="button" onClick={() => void revisarAhora()} disabled={Boolean(busy)} className={`${botonClass} h-8`}>
          {busy === "revisar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          Revisar ahora
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {[[TODOS, totalVista] as const, ...grupos].map(([g, n]) => (
          <button
            key={g}
            type="button"
            aria-pressed={grupo === g}
            onClick={() => setGrupo(g)}
            className={`h-7 rounded-lg border px-2.5 text-[12px] font-semibold ${grupo === g ? "border-[#D7FF4F] bg-[#D7FF4F]/10 text-[#F5F5F5]" : "border-[#3A3B35] bg-[#151515] text-[#B4B5AC]"}`}
          >
            {g} · {n}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-[#8F908A]">
          <input type="checkbox" checked={verResueltos} onChange={(e) => void cambiarVista(e.target.checked)} className="h-3.5 w-3.5 accent-[#D7FF4F]" />
          Ver resueltos
          {busy === "resueltos" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] text-[12.5px]">
        <div className="hidden grid-cols-[108px_minmax(0,1fr)_220px_210px] gap-2.5 border-b border-[#30312D] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] md:grid">
          <span>SKU</span><span>Qué pasa</span><span>{verResueltos ? "Cómo quedó" : "Sugerencia"}</span><span />
        </div>
        {visibles.length ? gruposAsuntos.map((g) => (g.asuntos.length === 1 ? renderAsunto(g.asuntos[0]) : renderGrupoAsuntos(g))) : (
          <p className="px-3 py-6 text-center text-[12.5px] text-[#8F908A]">
            {verResueltos ? "Sin asuntos resueltos." : abiertos.length ? "Nada en este grupo." : "Todo en orden."}
          </p>
        )}
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrarModal(); }}>
          <div className="flex max-h-[94vh] w-full max-w-[min(96vw,1440px)] flex-col overflow-hidden rounded-xl border border-[#3A3A36] bg-[#151613] shadow-2xl shadow-black/50">
            <div className="flex items-center gap-2.5 border-b border-[#30312D] px-4 py-2.5">
              <span className="font-mono text-[13px] font-semibold text-[#D7FF4F]">{detalle?.datos.item.sku?.trim() ? <CopyableSKU sku={detalle.datos.item.sku.trim()} /> : ""}</span>
              <span className="min-w-0 truncate text-[14px] font-semibold text-[#F5F5F5]">{detalle?.datos.item.nombre ?? ""}</span>
              {abiertos.filter((x) => x.itemIds.includes(modal.itemId)).length ? (
                <span className="shrink-0 text-[12px] text-[#FFB07A]">
                  {abiertos.filter((x) => x.itemIds.includes(modal.itemId)).map(textoAsunto).join(" · ")}
                </span>
              ) : porSalir.some((x) => x.itemIds.includes(modal.itemId)) ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[#9FEFB3]"><Check className="h-3.5 w-3.5" aria-hidden="true" />Resuelto</span>
              ) : null}
              <a
                href={`/shipping-v2/items/${modal.itemId}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => enOtraPestana.current.add(`item:${modal.itemId}`)}
                className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[#D7FF4F] hover:underline"
                title="Para acciones de Administrador (dar de baja, corregir estado…)"
              >
                Ficha completa<ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              <button type="button" onClick={cerrarModal} aria-label="Cerrar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#3A3A36] bg-[#20211D] text-[#A7A7A7] hover:text-[#F5F5F5]">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
              {errorDetalle ? (
                <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-4 py-3 text-sm text-[#FFB07A]">{errorDetalle}</div>
              ) : detalle ? (
                <FichaArticuloVista ficha={detalle} modo="modal" alCambiar={alCambiarFicha} onElegirUnidad={elegirUnidad} />
              ) : (
                <div className="flex min-h-64 items-center justify-center text-sm text-[#A7A7A7]"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Cargando…</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
