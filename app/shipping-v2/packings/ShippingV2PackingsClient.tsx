"use client";

// Logística (auditoría Shipping V2, punto 9 · fase 2 · 15-oct-2026).
//
// Una sola lista para todo lo que viaja: las cajas y los artículos que viajan
// solos, separada por etapas (decisión del dueño, 15-oct):
//   Armando · En camino · Llegó · En revisión · Cerrados
// Al entrar se ve todo lo abierto; Cerrados solo al pulsarlo.
//
// "Llegó" se marca aquí (antes también en Recepción → Por llegar). Al
// marcarlo sale un aviso con "Recibir sus N artículos →", que abre Recepción
// con solo los artículos de esa caja (el dueño se perdía buscándolos).
//
// La fila se despliega para lo rápido: rastreos, revisión, costos logísticos
// (flete, arancel y otros, con su pago) y, en un artículo suelto, sus rastreos
// y "meter en una caja". Para ARMAR la caja (bodega del proveedor, factura,
// novedades, estados) se entra a su página.
//
// Antes "Costos pendientes (N)" filtraba sin explicarse: ahora la columna
// "Pagos" dice "Flete sin pagar", "Flete falta $X" o "Flete ✓", y el filtro
// se llama "Falta pagar flete/arancel (N)".
//
// Rediseño compacto (15-oct-2026, pedido del dueño): la lista cabe en una
// pantalla de ~1000 px sin barra horizontal. Caja y contenido van en una
// columna, flete y compra en otra ("Pagos"), el rastreo en una línea (el otro
// número en la ayuda) y Estado/Tipo/Responsable dentro de "Filtros".

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  SHIPPING_V2_PACKING_ESTADOS,
  SHIPPING_V2_PACKING_TIPOS,
  type ShippingV2AccessPermissions,
  type ShippingV2Item,
  type ShippingV2LogisticaFila,
  type ShippingV2Packing,
  type ShippingV2PackingReviewSummary,
  type ShippingV2Proveedor,
} from "@/types/shipping-v2";
import { CostosTraerlo } from "@/components/shipping-v2/CostosTraerlo";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { ORIGEN_EXTRANJERO, pendientesLogisticos } from "@/lib/shipping-v2/item-origen";
import {
  formatShippingV2PackingBodegaProgress,
  formatShippingV2PackingReviewProgress,
  getShippingV2PackingFaseInfo,
  type ShippingV2PackingFase,
  type ShippingV2PackingFaseInfo,
} from "@/lib/shipping-v2/packing-lifecycle";
import { GestionarSuelto, Rastreo, type CajaAbiertaLogistica } from "./GestionarSuelto";

type Props = {
  packings: ShippingV2Packing[];
  /** Para el filtro Responsable (un proveedor solo se ve a sí mismo). */
  proveedores: ShippingV2Proveedor[];
  /** Para transportistas, casilleros y enlaces de rastreo. */
  todosProveedores: ShippingV2Proveedor[];
  sueltos: ShippingV2Item[];
  cajasAbiertas: CajaAbiertaLogistica[];
  error: string;
  permissions: ShippingV2AccessPermissions | null;
  providerName?: string;
  reviewSummaries?: Record<string, ShippingV2PackingReviewSummary>;
  /** Costos logísticos de cada caja y suelto (null = la sesión no ve costos). */
  costos?: ShippingV2LogisticaFila[] | null;
};

type Etapa = "armando" | "en-camino" | "llego" | "revision" | "cerrados";
type Vista = "abiertos" | Etapa;

const ETAPAS: Array<{ key: Etapa; label: string; title: string }> = [
  { key: "armando", label: "Armando", title: "Se está armando, o ya está armada y falta enviarla." },
  { key: "en-camino", label: "En camino", title: "Cajas en tránsito y artículos que viajan solos." },
  { key: "llego", label: "Llegó", title: "Llegó y nadie empezó a revisarla." },
  { key: "revision", label: "En revisión", title: "Se están recibiendo, revisando y fotografiando sus artículos." },
  { key: "cerrados", label: "Cerrados", title: "Ciclo cerrado (solo queda vender) o cancelada." },
];
const ORDEN_ETAPA: Record<Etapa, number> = { armando: 0, "en-camino": 1, llego: 2, revision: 3, cerrados: 4 };

function etapaDeFase(fase: ShippingV2PackingFase): Etapa | null {
  if (fase === "preparacion") return "armando";
  if (fase === "en-camino") return "en-camino";
  if (fase === "en-bodega") return "llego";
  if (fase === "revision") return "revision";
  if (fase === "cerrado" || fase === "cancelado") return "cerrados";
  return null;
}

type FilaCaja = {
  tipo: "caja";
  key: string;
  etapa: Etapa | null;
  fecha: string;
  busqueda: string;
  packing: ShippingV2Packing;
  info: ShippingV2PackingFaseInfo;
  summary?: ShippingV2PackingReviewSummary;
  costo?: ShippingV2LogisticaFila;
};
type FilaSuelto = {
  tipo: "suelto";
  key: string;
  etapa: Etapa;
  fecha: string;
  busqueda: string;
  item: ShippingV2Item;
  costo?: ShippingV2LogisticaFila;
};
type Fila = FilaCaja | FilaSuelto;

type Aviso = { texto: string; href?: string; enlace?: string; error?: boolean };

const ALL = "Todos";

function normalizar(value?: string | null) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function faseTone(fase: ShippingV2PackingFase) {
  if (fase === "preparacion") return "border-[#D7FF4F]/45 bg-[#D7FF4F]/12 text-[#D7FF4F]";
  if (fase === "en-camino") return "border-[#8B73FF]/35 bg-[#8B73FF]/10 text-[#C9BFFF]";
  if (fase === "en-bodega") return "border-[#4FC3FF]/35 bg-[#4FC3FF]/10 text-[#BDEAFF]";
  if (fase === "revision") return "border-[#F4E85B]/35 bg-[#F4E85B]/10 text-[#F4E85B]";
  if (fase === "cerrado") return "border-[#7BE495]/35 bg-[#7BE495]/10 text-[#9FEFB3]";
  if (fase === "cancelado") return "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]";
  return "border-[#3A3A36] bg-[#151515] text-[#A7A7A7]";
}

function hintTone(tono?: "accion" | "espera" | "listo" | "alerta") {
  if (tono === "alerta") return "text-[#FFB07A]";
  if (tono === "accion") return "text-[#E6E6E1]";
  if (tono === "listo") return "text-[#9FEFB3]";
  return "text-[#8F908A]";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium" }).format(date);
}

function formatWeight(peso: number | null | undefined) {
  if (peso === null || peso === undefined) return "";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(peso)} kg`;
}

const tienePendiente = (f?: ShippingV2LogisticaFila) => Boolean(f && (f.pendiente.falta > 0 || f.pendiente.sinFlete));
const chipBase = "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-semibold";
const chipFalta = `${chipBase} border-yellow-300/40 bg-yellow-300/10 text-yellow-200`;
const chipOk = `${chipBase} border-[#7BE495]/35 bg-[#7BE495]/10 text-[#9FEFB3]`;
const chipMute = `${chipBase} border-[#3A3A36] bg-[#151515] text-[#8F908A]`;

function detalleGastos(f: ShippingV2LogisticaFila) {
  const linea = (nombre: string, g: ShippingV2LogisticaFila["flete"]) =>
    g.pagado > 0 ? `${nombre}: pagado ${money(g.pagado)}${g.pendiente > 0 ? `, falta ${money(g.pendiente)}` : ""}` : g.valor !== null ? `${nombre}: ${money(g.valor)} sin pagar` : `${nombre}: —`;
  return [linea("Flete", f.flete), f.aplicaArancel ? linea("Arancel", f.arancel) : "", linea("Otros", f.otros)].filter(Boolean).join("\n");
}

/** Columna "Pagos", primera línea: flete, arancel y otros costos de traerlo. */
function ChipGastos({ fila }: { fila?: ShippingV2LogisticaFila }) {
  if (!fila) return null;
  const { pendiente } = fila;
  const title = detalleGastos(fila);
  if (pendiente.falta > 0) return <span className={chipFalta} title={title}>Flete falta {money(pendiente.falta)}</span>;
  if (pendiente.sinFlete) return <span className={chipFalta} title={`Ya viaja o llegó y su flete no tiene pago registrado.\n${title}`}>Flete sin pagar</span>;
  if (pendiente.pagado > 0) return <span className={chipOk} title={`Pagado ${money(pendiente.pagado)}\n${title}`}>Flete ✓</span>;
  return null;
}

/** Columna "Pagos", segunda línea: ¿la compra de lo que viaja tiene su respaldo de pago? */
function ChipCompra({ fila }: { fila?: ShippingV2LogisticaFila }) {
  const c = fila?.compra;
  if (!c || c.conCompra === 0) return null;
  if (c.faltaRespaldo > 0) {
    return (
      <Link href="/shipping-v2/pagos" className={`${chipFalta} hover:brightness-125`} title={`${c.faltaRespaldo} de ${c.conCompra} compra(s) sin respaldo de pago. Se registra en Pagos.`}>
        Compra sin respaldo{c.conCompra > 1 ? ` ${c.faltaRespaldo}/${c.conCompra}` : ""}
      </Link>
    );
  }
  return <span className={chipOk} title="Todas sus compras tienen respaldo de pago.">Compra ✓</span>;
}

function Pagos({ fila, onAbrir }: { fila?: ShippingV2LogisticaFila; onAbrir: () => void }) {
  const gastos = <ChipGastos fila={fila} />;
  const compra = <ChipCompra fila={fila} />;
  const hayAlgo = Boolean(fila && (fila.pendiente.falta > 0 || fila.pendiente.sinFlete || fila.pendiente.pagado > 0 || (fila.compra?.conCompra ?? 0) > 0));
  if (!hayAlgo) return <span className="text-[12px] text-[#5E5F59]">—</span>;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <button type="button" onClick={onAbrir} className="text-left" title="Ver flete, arancel y otros costos">{gastos}</button>
      {compra}
    </div>
  );
}

/** Rastreo en una línea: el de Ecuador si ya existe (es el que se mira), si no el de origen. */
function RastreoCorto({ usa, ec, prefijoUsa = "USA" }: { usa?: { numero?: string; transportista?: ShippingV2Proveedor; nombre?: string }; ec?: { numero?: string; transportista?: ShippingV2Proveedor; nombre?: string }; prefijoUsa?: string }) {
  const tieneUsa = Boolean(usa?.numero?.trim());
  const tieneEc = Boolean(ec?.numero?.trim());
  if (!tieneUsa && !tieneEc) return <span className={chipMute}>Sin rastreo</span>;
  if (tieneEc) {
    return <Rastreo compacto prefijo="EC" numero={ec?.numero} transportista={ec?.transportista} nombre={ec?.nombre} extra={tieneUsa ? `${prefijoUsa} ${usa?.numero}` : undefined} />;
  }
  return <Rastreo compacto prefijo={prefijoUsa} numero={usa?.numero} transportista={usa?.transportista} nombre={usa?.nombre} />;
}

function Revision({ summary }: { summary?: ShippingV2PackingReviewSummary }) {
  if (!summary) return <span className="text-[12px] text-[#5E5F59]">—</span>;
  const { progress } = summary;
  if (progress.total === 0) return <span className="text-[12px] text-[#8F908A]">Sin artículos</span>;
  const done = progress.completo;
  return (
    <div title={`Ciclo: ${formatShippingV2PackingReviewProgress(progress)}\nBodega: ${formatShippingV2PackingBodegaProgress(progress)}${progress.sinPublicacionAplicable ? `\n${progress.sinPublicacionAplicable} sin publicación aplicable` : ""}`}>
      <span className={`whitespace-nowrap text-[12px] font-semibold tabular-nums ${done ? "text-[#9FEFB3]" : "text-[#F5F5F5]"}`}>{progress.revisados}/{progress.total}</span>
      <div className="mt-1 h-1 w-12 overflow-hidden rounded-full bg-[#2A2A28]">
        <div className={`h-full rounded-full ${done ? "bg-[#9FEFB3]" : "bg-[#D7FF4F]"}`} style={{ width: `${Math.max(progress.porcentaje, progress.revisados > 0 ? 6 : 0)}%` }} />
      </div>
    </div>
  );
}

function recibidosDe(summary?: ShippingV2PackingReviewSummary) {
  if (!summary) return null;
  const { total, pendientesPorPaso } = summary.progress;
  return { recibidos: Math.max(0, total - (pendientesPorPaso.recibido ?? 0)), total };
}

function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-[#2A2B26] bg-[#151612] px-2 py-1.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">{label}</p>
      <div className="mt-0.5 text-[12.5px] text-[#E6E6E1]">{children}</div>
    </div>
  );
}

export function ShippingV2PackingsClient({ packings, proveedores, todosProveedores, sueltos, cajasAbiertas, error, permissions, providerName, reviewSummaries = {}, costos = null }: Props) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("abiertos");
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState(ALL);
  const [tipo, setTipo] = useState(ALL);
  const [responsable, setResponsable] = useState(ALL);
  const [soloFlete, setSoloFlete] = useState(false);
  const [soloNovedad, setSoloNovedad] = useState(false);
  const [soloListos, setSoloListos] = useState(false);
  const [soloSinRastreo, setSoloSinRastreo] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const filtrosRef = useRef<HTMLDivElement>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const canCreatePacking = permissions?.canCreatePacking !== false;
  const isProviderPortal = Boolean(providerName && permissions?.canCreatePacking === false);
  const puedeLlegarCaja = permissions?.canTransitionPackingStatus === true;
  const puedeRecepcion = permissions?.canUseRecepcion === true;
  const canViewInvoice = permissions?.canViewInvoice !== false;
  const proveedorPorId = useMemo(() => new Map(todosProveedores.map((p) => [p.id, p])), [todosProveedores]);
  const costosPorId = useMemo(() => new Map((costos ?? []).map((f) => [f.key, f])), [costos]);

  const filas = useMemo<Fila[]>(() => {
    const cajas: Fila[] = packings.map((packing) => {
      const info = getShippingV2PackingFaseInfo(packing.estado);
      const summary = reviewSummaries[packing.id];
      return {
        tipo: "caja",
        key: packing.id,
        etapa: etapaDeFase(info.fase),
        fecha: packing.fechaCreacion || packing.createdTime || "",
        busqueda: normalizar([packing.packingId, packing.nombre, packing.trackingUsa, packing.trackingEc, packing.proveedorResponsableNombre, packing.ordenReferencia, summary?.busqueda].join(" ")),
        packing,
        info,
        summary,
        costo: costosPorId.get(packing.id),
      };
    });
    const solos: Fila[] = sueltos.map((item) => ({
      tipo: "suelto",
      key: item.id,
      etapa: "en-camino",
      fecha: item.fechaRegistro || item.createdTime || "",
      busqueda: normalizar([item.sku, item.skuProveedor, item.nombre, item.proveedorNombre, item.trackingHaciaIntermediario, item.trackingDesdeIntermediario, item.trackingDirecto].join(" ")),
      item,
      costo: costosPorId.get(item.id),
    }));
    return [...cajas, ...solos];
  }, [packings, sueltos, reviewSummaries, costosPorId]);

  const tieneNovedad = (f: Fila) => f.tipo === "caja" && ((f.summary?.novedadesAbiertas ?? 0) > 0 || f.packing.conNovedad);
  const listoParaCerrar = (f: Fila) => f.tipo === "caja" && f.summary?.hint.listoParaCerrarCiclo === true;
  // Un artículo que viaja solo y le falta algún rastreo (antes era solo un texto amarillo arriba).
  const faltaRastreo = (f: Fila) => f.tipo === "suelto" && pendientesLogisticos(f.item).length > 0;

  useEffect(() => {
    if (!filtrosAbiertos) return;
    const cerrar = (event: PointerEvent) => {
      if (event.target instanceof Node && filtrosRef.current?.contains(event.target)) return;
      setFiltrosAbiertos(false);
    };
    const tecla = (event: KeyboardEvent) => { if (event.key === "Escape") setFiltrosAbiertos(false); };
    document.addEventListener("pointerdown", cerrar);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", cerrar);
      document.removeEventListener("keydown", tecla);
    };
  }, [filtrosAbiertos]);

  // Buscador y filtros (sin la etapa): de aquí salen los contadores de cada etapa.
  const filtradas = useMemo(() => {
    const q = normalizar(buscar);
    return filas.filter((f) => {
      if (q && !q.split(/\s+/).every((t) => f.busqueda.includes(t))) return false;
      if (f.tipo === "caja") {
        if (estado !== ALL && f.packing.estado !== estado) return false;
        if (tipo !== ALL && f.packing.tipo !== tipo) return false;
        if (responsable !== ALL && f.packing.proveedorResponsableId !== responsable) return false;
      } else {
        if (estado !== ALL || tipo !== ALL) return false;
        if (responsable !== ALL && f.item.proveedorId !== responsable) return false;
      }
      if (soloFlete && !tienePendiente(f.costo)) return false;
      if (soloNovedad && !tieneNovedad(f)) return false;
      if (soloListos && !listoParaCerrar(f)) return false;
      if (soloSinRastreo && !faltaRastreo(f)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, buscar, estado, tipo, responsable, soloFlete, soloNovedad, soloListos, soloSinRastreo]);

  const conteo = useMemo(() => {
    const c: Record<Vista, number> = { abiertos: 0, armando: 0, "en-camino": 0, llego: 0, revision: 0, cerrados: 0 };
    for (const f of filtradas) {
      if (f.etapa) c[f.etapa] += 1;
      if (f.etapa !== "cerrados") c.abiertos += 1;
    }
    return c;
  }, [filtradas]);

  const visibles = useMemo(() => filtradas
    .filter((f) => (vista === "abiertos" ? f.etapa !== "cerrados" : f.etapa === vista))
    .sort((a, b) => (ORDEN_ETAPA[a.etapa ?? "armando"] - ORDEN_ETAPA[b.etapa ?? "armando"]) || b.fecha.localeCompare(a.fecha)),
  [filtradas, vista]);

  const totales = {
    cajas: packings.length,
    solos: sueltos.length,
    solosPendientes: sueltos.filter((i) => pendientesLogisticos(i).length > 0).length,
    conFlete: filas.filter((f) => tienePendiente(f.costo)).length,
    conNovedad: filas.filter(tieneNovedad).length,
    listos: filas.filter(listoParaCerrar).length,
  };
  const sinAvance = Object.keys(reviewSummaries).length === 0 && packings.length > 0;
  const filtrosMenu = [estado, tipo, responsable].filter((v) => v !== ALL).length;
  const hayFiltros = Boolean(buscar.trim()) || filtrosMenu > 0 || soloFlete || soloNovedad || soloListos || soloSinRastreo;
  const columnas = costos ? 7 : 6;
  function quitarFiltros() {
    setBuscar(""); setEstado(ALL); setTipo(ALL); setResponsable(ALL);
    setSoloFlete(false); setSoloNovedad(false); setSoloListos(false); setSoloSinRastreo(false);
  }

  async function llegoCaja(packing: ShippingV2Packing, total: number) {
    setOcupado(packing.id);
    setAviso(null);
    try {
      const r = await fetch(`/api/shipping-v2/packings/${packing.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-received" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(String(j.error || "No se pudo marcar la caja como llegada."));
      setAviso({
        texto: `${packing.packingId} llegó.`,
        href: puedeRecepcion ? `/shipping-v2/recepcion?packing=${packing.id}` : undefined,
        enlace: `Recibir sus ${total} artículo${total === 1 ? "" : "s"} →`,
      });
      router.refresh();
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : "Error inesperado.", error: true });
    } finally {
      setOcupado("");
    }
  }

  async function llegoSuelto(item: ShippingV2Item) {
    setOcupado(item.id);
    setAviso(null);
    try {
      const r = await fetch(`/api/shipping-v2/recepcion/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "received", value: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(String(j.error || "No se pudo marcar como llegado."));
      setAviso({ texto: `${item.sku} llegó y quedó recibido.`, href: `/shipping-v2/recepcion?articulo=${item.id}`, enlace: "Verlo en Recepción →" });
      if (abierta === item.id) setAbierta(null);
      router.refresh();
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : "Error inesperado.", error: true });
    } finally {
      setOcupado("");
    }
  }

  const select = "h-8 rounded-md border border-[#3A3A36] bg-[#151515] px-2 text-[12.5px] font-semibold text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70";
  const btn = "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border px-2.5 text-[12px] font-bold transition disabled:opacity-60";
  const btnPrim = `${btn} border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] hover:brightness-105`;
  const btnSec = `${btn} border-[#3A3A36] text-[#E6E6E1] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]`;
  const toggle = (on: boolean) => `rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold transition ${on ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] bg-[#151515] text-[#B4B5AC] hover:text-[#F5F5F5]"}`;

  function accion(f: Fila) {
    if (f.tipo === "suelto") {
      return puedeRecepcion ? (
        <button type="button" disabled={ocupado === f.item.id} onClick={() => void llegoSuelto(f.item)} className={btnPrim} title="Marca el artículo como llegado y recibido.">
          {ocupado === f.item.id ? "Guardando…" : "Llegó"}
        </button>
      ) : null;
    }
    const st = normalizar(f.packing.estado);
    if (st === "en transito" && puedeLlegarCaja) {
      return (
        <button type="button" disabled={ocupado === f.packing.id} onClick={() => void llegoCaja(f.packing, f.summary?.progress.total ?? f.packing.itemCount)} className={btnPrim} title="La caja llegó. Luego se reciben sus artículos uno por uno en Recepción.">
          {ocupado === f.packing.id ? "Guardando…" : "Llegó"}
        </button>
      );
    }
    if ((f.etapa === "llego" || f.etapa === "revision") && puedeRecepcion) {
      const r = recibidosDe(f.summary);
      const faltan = !r || r.recibidos < r.total;
      return (
        <Link href={`/shipping-v2/recepcion?packing=${f.packing.id}`} className={btnSec} title="Abre Recepción con solo los artículos de esta caja.">
          {faltan ? `Recibir${r && r.total ? ` ${r.recibidos}/${r.total}` : ""}` : "Recepción →"}
        </Link>
      );
    }
    return null;
  }

  function filaCaja(f: FilaCaja) {
    const { packing, info, summary } = f;
    const abiertaAqui = abierta === f.key;
    const usa = proveedorPorId.get(packing.transportistaUsa || "");
    const ec = proveedorPorId.get(packing.transportistaEc || "");
    return (
      <Fragment key={f.key}>
        <tr className={`border-t border-[#2A2B26] align-top hover:bg-[#1B1C18] ${abiertaAqui ? "bg-[#1B1C18]" : ""}`}>
          <td className="py-1.5 pl-1.5">
            <button type="button" onClick={() => setAbierta(abiertaAqui ? null : f.key)} aria-expanded={abiertaAqui} aria-label={abiertaAqui ? "Ocultar detalles" : "Ver detalles"}
              className={`grid h-6 w-6 place-items-center rounded text-[13px] ${abiertaAqui ? "bg-[#D7FF4F] text-[#151515]" : "text-[#8F908A] hover:text-[#D7FF4F]"}`}>
              {abiertaAqui ? "⌄" : "›"}
            </button>
          </td>
          <td className="max-w-0 px-2 py-1.5">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <Link href={`/shipping-v2/packings/${packing.id}`} className="shrink-0 whitespace-nowrap font-semibold text-[#D7FF4F] hover:underline">{packing.packingId || "—"}</Link>
              <span className="min-w-0 truncate text-[12px] text-[#B4B5AC]" title={packing.nombre || undefined}>{packing.nombre?.trim() || packing.tipo || "Caja"}</span>
            </div>
            <p className="truncate text-[11.5px] text-[#8F908A]">{[packing.proveedorResponsableNombre || "Sin responsable", `${packing.itemCount} art.`, formatWeight(packing.peso)].filter(Boolean).join(" · ")}</p>
          </td>
          <td className="max-w-0 px-2 py-1.5">
            <span className={`${chipBase} ${faseTone(info.fase)}`} title={info.significado}>{info.estadoLabel}</span>
            <p className={`mt-0.5 truncate text-[11.5px] leading-4 ${hintTone(summary?.hint.tono)}`} title={summary?.hint.texto ?? info.significado}>{summary?.hint.texto ?? info.significado}</p>
          </td>
          <td className="max-w-0 px-2 py-1.5 text-[12px]">
            <RastreoCorto
              usa={{ numero: packing.trackingUsa, transportista: usa, nombre: packing.transportistaUsaNombre }}
              ec={{ numero: packing.trackingEc, transportista: ec, nombre: packing.transportistaEcNombre }}
            />
          </td>
          <td className="px-2 py-1.5">{f.etapa === "llego" || f.etapa === "revision" || f.etapa === "cerrados" ? <Revision summary={summary} /> : <span className="text-[12px] text-[#5E5F59]">—</span>}</td>
          {costos ? <td className="px-2 py-1.5"><Pagos fila={f.costo} onAbrir={() => setAbierta(f.key)} /></td> : null}
          <td className="py-1.5 pl-2 pr-2 text-right">{accion(f)}</td>
        </tr>
        {abiertaAqui ? (
          <tr className="bg-[#121310]">
            <td colSpan={columnas} className="px-3 pb-3 pt-1">
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                <Dato label="Rastreo USA">{packing.trackingUsa ? <Rastreo numero={packing.trackingUsa} transportista={usa} nombre={packing.transportistaUsaNombre} /> : <span className="text-[#8F908A]">—</span>}{!packing.trackingUsa && packing.transportistaUsaNombre ? <span className="text-[11px] text-[#8F908A]">{packing.transportistaUsaNombre}</span> : null}</Dato>
                <Dato label="Rastreo Ecuador">{packing.trackingEc ? <Rastreo numero={packing.trackingEc} transportista={ec} nombre={packing.transportistaEcNombre} /> : <span className="text-[#8F908A]">—</span>}{!packing.trackingEc && packing.transportistaEcNombre ? <span className="text-[11px] text-[#8F908A]">{packing.transportistaEcNombre}</span> : null}</Dato>
                <Dato label="Caja">{[packing.tipo, `${packing.itemCount} art.`, formatWeight(packing.peso), packing.ordenReferencia ? `Orden ${packing.ordenReferencia}` : ""].filter(Boolean).join(" · ")}</Dato>
                <Dato label="Fechas">
                  <span className="text-[12px]">Creada {formatDate(packing.fechaCreacion || packing.createdTime)}{packing.fechaEnvio ? ` · Envío ${formatDate(packing.fechaEnvio)}` : ""}{packing.fechaRecepcion ? ` · Llegó ${formatDate(packing.fechaRecepcion)}` : ""}</span>
                </Dato>
              </div>
              {summary && summary.progress.total > 0 && f.etapa !== "armando" && f.etapa !== "en-camino" ? (
                <p className="mt-1.5 text-[12px] text-[#8F908A]">
                  Bodega <b className="text-[#E6E6E1]">{formatShippingV2PackingBodegaProgress(summary.progress)}</b> · Ciclo <b className="text-[#E6E6E1]">{formatShippingV2PackingReviewProgress(summary.progress)}</b>
                  {summary.progress.sinPublicacionAplicable ? ` · ${summary.progress.sinPublicacionAplicable} sin publicación aplicable` : ""}
                  {summary.novedadesAbiertas ? <span className="text-[#FFB07A]"> · {summary.novedadesAbiertas} novedad(es) abiertas</span> : null}
                </p>
              ) : null}
              {costos ? <div className="mt-2"><CostosTraerlo packingId={packing.id} onPagado={() => router.refresh()} /></div> : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Link href={`/shipping-v2/packings/${packing.id}`} className={btnSec} title="Armar (bodega del proveedor), factura, destinatario, novedades y estados.">Abrir caja →</Link>
                {packing.factura[0]?.url && canViewInvoice ? <a href={packing.factura[0].url} target="_blank" rel="noreferrer" className={btnSec}>Ver factura</a> : null}
                <span className="ml-auto">{accion(f)}</span>
              </div>
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  }

  function filaSuelto(f: FilaSuelto) {
    const { item } = f;
    const abiertaAqui = abierta === f.key;
    const extranjero = item.origenArticulo === ORIGEN_EXTRANJERO;
    const pendientes = pendientesLogisticos(item);
    const origen = proveedorPorId.get(item.transportistaOrigenId || "");
    const ec = proveedorPorId.get(item.transportistaEcuadorId || "");
    const numeroEc = extranjero ? item.trackingDesdeIntermediario : item.trackingDirecto;
    const puedeGestionar = permissions?.canEditItems === true || permissions?.canAddItemsToPacking === true || costos !== null;
    return (
      <Fragment key={f.key}>
        <tr className={`border-t border-[#2A2B26] align-top hover:bg-[#1B1C18] ${abiertaAqui ? "bg-[#1B1C18]" : ""}`}>
          <td className="py-1.5 pl-1.5">
            {puedeGestionar ? (
              <button type="button" onClick={() => setAbierta(abiertaAqui ? null : f.key)} aria-expanded={abiertaAqui} aria-label={abiertaAqui ? "Ocultar" : "Gestionar"} title="Rastreos, casillero, meter en una caja y costos"
                className={`grid h-6 w-6 place-items-center rounded text-[13px] ${abiertaAqui ? "bg-[#D7FF4F] text-[#151515]" : "text-[#8F908A] hover:text-[#D7FF4F]"}`}>
                {abiertaAqui ? "⌄" : "›"}
              </button>
            ) : null}
          </td>
          <td className="max-w-0 px-2 py-1.5">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <Link href={`/shipping-v2/items/${item.id}`} className="shrink-0 whitespace-nowrap font-semibold text-[#D7FF4F] hover:underline">{item.sku || "—"}</Link>
              <span className="min-w-0 truncate text-[12px] text-[#B4B5AC]" title={item.nombre}>{item.nombre}</span>
            </div>
            <p className="truncate text-[11.5px] text-[#8F908A]">{["Viaja solo", item.proveedorNombre || "Sin proveedor", extranjero && item.proveedorLogisticoNombre ? `Casillero ${item.proveedorLogisticoNombre}` : extranjero ? "Extranjero" : "Local"].filter(Boolean).join(" · ")}</p>
          </td>
          <td className="max-w-0 px-2 py-1.5">
            <span className={`${chipBase} ${faseTone("en-camino")}`}>{item.estado || "—"}</span>
            <p className={`mt-0.5 truncate text-[11.5px] leading-4 ${pendientes.length ? "text-yellow-200" : "text-[#9FEFB3]"}`}>{pendientes.length ? `Falta ${pendientes.map((p) => p.toLowerCase()).join(" y ")}` : "Rastreos completos"}</p>
          </td>
          <td className="max-w-0 px-2 py-1.5 text-[12px]">
            <RastreoCorto
              prefijoUsa="Origen"
              usa={extranjero ? { numero: item.trackingHaciaIntermediario, transportista: origen } : undefined}
              ec={{ numero: numeroEc, transportista: ec }}
            />
          </td>
          <td className="px-2 py-1.5"><span className="text-[12px] text-[#5E5F59]">—</span></td>
          {costos ? <td className="px-2 py-1.5"><Pagos fila={f.costo} onAbrir={() => setAbierta(f.key)} /></td> : null}
          <td className="py-1.5 pl-2 pr-2 text-right">{accion(f)}</td>
        </tr>
        {abiertaAqui ? (
          <tr className="bg-[#121310]">
            <td colSpan={columnas} className="px-3 pb-3 pt-1">
              <GestionarSuelto
                item={item}
                proveedores={todosProveedores}
                cajasAbiertas={cajasAbiertas}
                canEdit={permissions?.canEditItems === true}
                canAddToPacking={permissions?.canAddItemsToPacking === true}
                canViewCosts={costos !== null}
                onCerrar={() => setAbierta(null)}
              />
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  }

  let etapaAnterior: Etapa | null | undefined;

  const chipFiltro = (on: boolean, tono: string) => on ? toggle(true) : `rounded-full border bg-[#151515] px-2.5 py-0.5 text-[11.5px] font-semibold hover:brightness-125 ${tono}`;

  return (
    <div className="w-full space-y-2">
      {error ? <div className="rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{error}</div> : null}

      {/* Una sola barra: etapas, buscar, filtros, atajos y "Nueva caja". */}
      <section className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#2E2F28] bg-[#151613] p-1.5">
        <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-md border border-[#3A3A36]">
          {([{ key: "abiertos" as Vista, label: "Abiertos", title: "Todo lo que no está cerrado." }, ...ETAPAS]).map((e) => {
            const on = vista === e.key;
            return (
              <button key={e.key} type="button" role="tab" aria-selected={on} title={e.title} onClick={() => setVista(e.key)}
                className={`h-8 whitespace-nowrap border-r border-[#3A3A36] px-2.5 text-[12.5px] font-semibold transition last:border-r-0 ${on ? "bg-[#D7FF4F] text-[#151515]" : "bg-[#151515] text-[#B4B5AC] hover:text-[#D7FF4F]"}`}>
                {e.label} <span className={`tabular-nums ${on ? "" : "text-[#8F908A]"}`}>{conteo[e.key]}</span>
              </button>
            );
          })}
        </div>
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar caja, SKU, rastreo…" aria-label="Buscar"
          className="h-8 min-w-[10rem] flex-1 rounded-md border border-[#3A3A36] bg-[#151515] px-2.5 text-[13px] text-[#F5F5F5] outline-none placeholder:text-[#5E5F59] focus:border-[#D7FF4F]/70 sm:max-w-[16rem]" />
        <div ref={filtrosRef} className="relative">
          <button type="button" onClick={() => setFiltrosAbiertos((v) => !v)} aria-expanded={filtrosAbiertos}
            className={`${btn} gap-1 ${filtrosMenu || filtrosAbiertos ? "border-[#D7FF4F]/55 bg-[#D7FF4F]/10 text-[#D7FF4F]" : "border-[#3A3A36] text-[#B4B5AC] hover:text-[#D7FF4F]"}`}>
            Filtros{filtrosMenu ? <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#D7FF4F] px-1 text-[10px] font-black text-[#151515]">{filtrosMenu}</span> : null}
          </button>
          {filtrosAbiertos ? (
            <div className="absolute left-0 top-full z-40 mt-1.5 grid w-60 gap-1.5 rounded-lg border border-[#30312D] bg-[#11120F] p-2 shadow-2xl shadow-black/45">
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className={select} aria-label="Estado de la caja"><option value={ALL}>Estado: todos</option>{SHIPPING_V2_PACKING_ESTADOS.map((o) => <option key={o}>{o}</option>)}</select>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={select} aria-label="Tipo de caja"><option value={ALL}>Tipo: todos</option>{SHIPPING_V2_PACKING_TIPOS.map((o) => <option key={o}>{o}</option>)}</select>
              <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={select} aria-label="Responsable"><option value={ALL}>Responsable: todos</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}</select>
              {filtrosMenu ? <button type="button" onClick={() => { setEstado(ALL); setTipo(ALL); setResponsable(ALL); }} className="text-left text-[11.5px] font-semibold text-[#8F908A] hover:text-[#F5F5F5]">Quitar estos filtros</button> : null}
            </div>
          ) : null}
        </div>
        {costos && (totales.conFlete || soloFlete) ? (
          <button type="button" onClick={() => setSoloFlete((v) => !v)} aria-pressed={soloFlete} className={chipFiltro(soloFlete, "border-yellow-300/40 text-yellow-200")}
            title="Muestra solo las cajas y artículos a los que les falta pagar flete o arancel (ya viajan o llegaron sin pago, o tienen un valor anotado sin pago).">
            Falta pagar flete/arancel ({totales.conFlete})
          </button>
        ) : null}
        {totales.solosPendientes || soloSinRastreo ? (
          <button type="button" onClick={() => setSoloSinRastreo((v) => !v)} aria-pressed={soloSinRastreo} className={chipFiltro(soloSinRastreo, "border-yellow-300/40 text-yellow-200")} title="Artículos que viajan solos y aún no tienen todos sus rastreos.">
            Faltan rastreos ({totales.solosPendientes})
          </button>
        ) : null}
        {totales.conNovedad || soloNovedad ? (
          <button type="button" onClick={() => setSoloNovedad((v) => !v)} aria-pressed={soloNovedad} className={chipFiltro(soloNovedad, "border-[#FF914D]/40 text-[#FFB07A]")} title="Cajas con una novedad abierta (faltante, daño, garantía).">
            Con novedad ({totales.conNovedad})
          </button>
        ) : null}
        {totales.listos || soloListos ? (
          <button type="button" onClick={() => setSoloListos((v) => !v)} aria-pressed={soloListos} className={chipFiltro(soloListos, "border-[#7BE495]/40 text-[#9FEFB3]")} title="Revisión terminada: solo falta pulsar Cerrar ciclo en la caja.">
            Listas para cerrar ({totales.listos})
          </button>
        ) : null}
        {hayFiltros ? <button type="button" onClick={quitarFiltros} className="text-[11.5px] font-semibold text-[#8F908A] hover:text-[#F5F5F5]">Quitar filtros</button> : null}
        <span className="ml-auto flex items-center gap-2">
          {isProviderPortal ? <span className="text-[12px] text-[#8F908A]">Cajas de {providerName}</span> : null}
          {canCreatePacking ? <Link href="/shipping-v2/packings/nuevo" className={btnPrim}>+ Nueva caja</Link> : null}
        </span>
      </section>

      {sinAvance ? (
        <div className="rounded-lg border border-[#4FC3FF]/30 bg-[#4FC3FF]/10 px-3 py-1.5 text-xs text-[#BDEAFF]">No se pudo calcular el avance de revisión en esta carga. La lista se muestra igual, sin la columna Revisión.</div>
      ) : null}

      {aviso ? (
        <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${aviso.error ? "border-[#FF914D]/40 bg-[#FF914D]/10 text-[#FFB07A]" : "border-[#D7FF4F]/45 bg-[#D7FF4F]/[0.07] text-[#E6E6E1]"}`}>
          <span className="font-semibold">{aviso.texto}</span>
          {aviso.href && aviso.enlace ? <Link href={aviso.href} className={btnPrim}>{aviso.enlace}</Link> : null}
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="ml-auto text-[15px] leading-none text-[#8F908A] hover:text-[#F5F5F5]">×</button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] table-fixed text-left text-[13px]">
            <colgroup>
              <col className="w-7" />
              <col />
              <col className="w-[24%]" />
              <col className="w-[9rem]" />
              <col className="w-[5rem]" />
              {costos ? <col className="w-[9rem]" /> : null}
              <col className="w-[7.5rem]" />
            </colgroup>
            <thead className="whitespace-nowrap bg-[#1E1F19] text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">
              <tr>
                <th className="py-1.5 pl-1.5" />
                <th className="px-2 py-1.5" title="Caja (o artículo que viaja solo), responsable y cuántos artículos lleva">Envío</th>
                <th className="px-2 py-1.5">Estado</th>
                <th className="px-2 py-1.5" title="Se muestra el rastreo de Ecuador si ya existe; el otro número está en la ayuda (+1)">Rastreo</th>
                <th className="px-2 py-1.5" title="Artículos con todo completo (recibido, revisado, fotos y publicaciones) / total">Revisión</th>
                {costos ? <th className="px-2 py-1.5" title="Flete/arancel de traerlo y respaldo de pago de la compra">Pagos</th> : null}
                <th className="py-1.5 pl-2 pr-2" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const separador = vista === "abiertos" && f.etapa !== etapaAnterior;
                etapaAnterior = f.etapa;
                const etiqueta = ETAPAS.find((e) => e.key === f.etapa)?.label ?? "Sin etapa";
                return (
                  <Fragment key={`g-${f.key}`}>
                    {separador ? (
                      <tr className="border-t border-[#2A2B26] bg-[#141511]">
                        <td colSpan={columnas} className="px-3 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[#8F908A]">
                          {etiqueta} · {f.etapa ? conteo[f.etapa] : ""}
                        </td>
                      </tr>
                    ) : null}
                    {f.tipo === "caja" ? filaCaja(f) : filaSuelto(f)}
                  </Fragment>
                );
              })}
              {visibles.length === 0 ? (
                <tr><td colSpan={columnas} className="px-3 py-6 text-center text-sm text-[#8F908A]">{hayFiltros ? "Nada coincide con la búsqueda o los filtros." : vista === "abiertos" ? "No hay nada en camino ni por revisar." : "No hay nada en esta etapa."}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
