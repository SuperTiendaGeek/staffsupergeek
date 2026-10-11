"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { VisorEvidencias } from "@/components/shipping-v2/VisorEvidencias";
import { ejecutarAccionNovedad, NovedadAccionModal } from "@/components/shipping-v2/novedades/NovedadAccionModal";
import {
  construirHiloNovedad,
  esResponsableProveedor,
  etiquetaPropuesta,
  etiquetaTurno,
  getAccionesDisponibles,
  getNovedadBucket,
  getTurnoNovedad,
  isNovedadAbierta,
  SHIPPING_V2_NOVEDAD_BUCKETS,
  type ShippingV2NovedadAccionConfig,
  type ShippingV2NovedadBucket,
  type ShippingV2NovedadRol,
  type ValoresAccionNovedad,
} from "@/lib/shipping-v2/novedades";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import type { ShippingV2Novedad, ShippingV2Proveedor } from "@/types/shipping-v2";

type Props = {
  novedades: ShippingV2Novedad[];
  proveedores: ShippingV2Proveedor[];
  error: string;
  isSiteAdmin: boolean;
  isStaff: boolean;
  canRespond: boolean;
  canEditItems: boolean;
};

const ALL = "Todos";

function display(value?: string | number | null) {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  return text || "—";
}

function antiguedad(value?: string) {
  if (!value) return "";
  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return "";
  const dias = Math.floor((Date.now() - fecha.getTime()) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} d`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function money(value?: number | null) {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

/** Días que lleva esperando al proveedor. */
function diasEsperando(novedad: ShippingV2Novedad) {
  if (getTurnoNovedad(novedad) !== "proveedor") return null;
  const referencia = novedad.fechaEnviadaProveedor || novedad.fechaRegistro;
  if (!referencia) return null;
  const desde = new Date(referencia);
  if (Number.isNaN(desde.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - desde.getTime()) / 86_400_000));
}

function turnoTone(novedad: ShippingV2Novedad) {
  const bucket = getNovedadBucket(novedad);
  if (bucket === "nuestro-turno") return "border-[#D7FF4F]/45 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  if (bucket === "con-proveedor") return "border-[#4FC3FF]/35 bg-[#4FC3FF]/10 text-[#BDEAFF]";
  if (bucket === "en-solucion") return "border-[#F4E85B]/35 bg-[#F4E85B]/10 text-[#F4E85B]";
  return "border-[#7BE495]/35 bg-[#7BE495]/10 text-[#9FEFB3]";
}

const CHIP = "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold";

function Hilo({ novedad }: { novedad: ShippingV2Novedad }) {
  const entradas = useMemo(() => construirHiloNovedad(novedad), [novedad]);
  if (!entradas.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {entradas.map((entrada, index) => {
        const esProveedor = entrada.lado === "proveedor";
        return (
          <div key={`${entrada.fecha}-${index}`} className={`flex ${esProveedor ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg border px-2.5 py-1.5 ${esProveedor ? "border-[#4FC3FF]/25 bg-[#4FC3FF]/8 text-[#BDEAFF]" : "border-[#3A3A36] bg-[#11120F] text-[#D5D5D0]"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-normal opacity-70">
                {esProveedor ? "↩ " : ""}{entrada.autor}{entrada.fecha ? ` · ${formatDate(entrada.fecha)}` : ""}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-5">{entrada.texto}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Dato({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <span>{label}: <strong className="font-semibold text-[#F5F5F5]">{value}</strong></span>;
}

function NovedadCard({
  novedad,
  rol,
  canRespond,
  busy,
  onAccion,
  onRefrescar,
}: {
  novedad: ShippingV2Novedad;
  rol: ShippingV2NovedadRol;
  canRespond: boolean;
  busy: boolean;
  onAccion: (novedad: ShippingV2Novedad, accion: ShippingV2NovedadAccionConfig) => void;
  onRefrescar: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const acciones = getAccionesDisponibles(novedad, rol);
  const principal = acciones.find((accion) => accion.tono === "principal") ?? null;
  const secundarias = acciones.filter((accion) => accion !== principal);
  const dias = diasEsperando(novedad);
  const hilo = construirHiloNovedad(novedad);
  const ultima = hilo[hilo.length - 1];
  const esProveedorUI = rol === "proveedor";

  return (
    <article className={`rounded-xl border bg-[#171814] shadow-lg shadow-black/15 ${getNovedadBucket(novedad) === "nuestro-turno" && !esProveedorUI ? "border-[#D7FF4F]/30" : "border-[#30312D]"}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`${CHIP} ${turnoTone(novedad)}`}>{etiquetaTurno(novedad)}</span>
          <span className={`${CHIP} hidden border-[#3A3A36] bg-[#151515] text-[#A7A7A7] sm:inline`}>{display(novedad.tipo)}</span>
          {novedad.bloqueaVenta && !esProveedorUI ? (
            <span className={`${CHIP} border-[#FF6B6B]/45 bg-[#FF6B6B]/12 text-[#FF9C9C]`} title={novedad.ventaDesbloqueadaPor ? "" : "Solo un Administrador la desbloquea"}>Venta bloqueada</span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#F5F5F5]" title={`${novedad.itemSku} · ${novedad.itemNombre}`}>
            {novedad.itemSku ? <span className="text-[#D7FF4F]">{novedad.itemSku}</span> : null}
            {novedad.itemSku && novedad.itemNombre ? " · " : ""}
            <span className="font-normal text-[#C9C9C4]">{display(novedad.itemNombre)}</span>
          </span>
          {ultima && !abierta ? (
            <span className="hidden min-w-0 max-w-[26ch] truncate text-[12px] text-[#8F908A] xl:inline" title={ultima.texto}>
              {ultima.lado === "proveedor" ? "↩ " : ""}{ultima.texto}
            </span>
          ) : null}
          {novedad.decision ? <span className={`${CHIP} hidden border-[#3A3A36] bg-[#151515] text-[#C9C9C4] md:inline`}>{novedad.decision}</span> : null}
          {novedad.evidencias.length ? <span className={`${CHIP} border-[#3A3A36] bg-[#151515] text-[#A7A7A7]`}>&#128247; {novedad.evidencias.length}</span> : null}
          <span className="hidden shrink-0 text-[11px] text-[#6F706B] md:inline">{antiguedad(novedad.fechaRegistro)}</span>
          {dias !== null && dias >= 7 ? <span className={`${CHIP} border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]`}>{dias} d</span> : null}
          <span className={`shrink-0 text-[#6F706B] transition ${abierta ? "rotate-180" : ""}`} aria-hidden="true">▾</span>
        </button>
        {principal ? (
          <button
            type="button"
            title={principal.descripcion}
            disabled={busy || (principal.accion === "responder" && !canRespond)}
            onClick={() => onAccion(novedad, principal)}
            className="inline-flex h-7 shrink-0 items-center rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-2.5 text-[12px] font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-40"
          >
            {principal.label}
          </button>
        ) : null}
      </div>

      {abierta ? (
        <div className="border-t border-[#3A3A36]/70 px-3 py-2.5">
          <div className="grid gap-x-4 gap-y-0.5 text-[11px] text-[#8F908A] sm:grid-cols-2 xl:grid-cols-4">
            <span>{esResponsableProveedor(novedad.responsable) ? "Garantía del proveedor" : "La resolvemos nosotros"}</span>
            {!esProveedorUI ? <Dato label="Proveedor" value={novedad.proveedorResponsableNombre} /> : null}
            <Dato label="Packing" value={novedad.packingLabel} />
            <Dato label="Registrada" value={`${formatDate(novedad.fechaRegistro)}${novedad.registradoPor && !esProveedorUI ? ` · ${novedad.registradoPor}` : ""}`} />
            <Dato label="Propuesta" value={novedad.solucion ? etiquetaPropuesta(novedad.solucion) : ""} />
            {!esProveedorUI ? <Dato label="Decisión" value={novedad.decision} /> : null}
            <Dato label="Reclamado" value={money(novedad.montoReclamado)} />
            <Dato label="Recuperado" value={money(novedad.montoRecuperado)} />
            {!esProveedorUI ? (
              <>
                <Dato label="Unidades" value={novedad.cantidadAfectada ? String(novedad.cantidadAfectada) : ""} />
                <Dato label="Precio con descuento" value={money(novedad.precioConDescuento)} />
                <Dato label="Apareció" value={novedad.comoAparecio} />
                <Dato label="Valor de la pérdida" value={money(novedad.valorPerdida)} />
                <Dato label="Desbloqueada" value={novedad.ventaDesbloqueadaPor} />
              </>
            ) : null}
          </div>

          <Hilo novedad={novedad} />

          <VisorEvidencias novedadId={novedad.id} evidencias={novedad.evidencias} onUpdated={onRefrescar} canEdit={canRespond && rol !== "ninguno"} />

          {novedad.descripcionSolucion ? (
            <p className="mt-1.5 rounded-lg border border-[#F4E85B]/25 bg-[#F4E85B]/8 px-2.5 py-1.5 text-[12px] leading-5 text-[#F4E85B]"><strong>Lo que se hizo:</strong> {novedad.descripcionSolucion}</p>
          ) : null}
          {novedad.observacionFinal && novedad.observacionFinal !== novedad.descripcionSolucion ? (
            <p className="mt-1 rounded-lg border border-[#7BE495]/25 bg-[#7BE495]/8 px-2.5 py-1.5 text-[12px] leading-5 text-[#9FEFB3]"><strong>Cierre:</strong> {novedad.observacionFinal}</p>
          ) : null}

          {secundarias.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {secundarias.map((accion) => (
                <button
                  key={accion.accion}
                  type="button"
                  title={accion.descripcion}
                  disabled={busy}
                  onClick={() => onAccion(novedad, accion)}
                  className={`inline-flex h-7 items-center rounded-lg border px-2.5 text-[12px] font-bold transition disabled:opacity-40 ${
                    accion.tono === "peligro"
                      ? "border-[#FF914D]/45 bg-[#FF914D]/10 text-[#FFB07A] hover:border-[#FF914D]"
                      : "border-[#3A3A36] bg-[#20211D] text-[#F5F5F5] hover:border-[#D7FF4F]/55"
                  }`}
                >
                  {accion.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ShippingV2NovedadesClient({ novedades, proveedores, error, isSiteAdmin, isStaff, canRespond, canEditItems }: Props) {
  const router = useRouter();
  const rol: ShippingV2NovedadRol = isStaff ? (isSiteAdmin ? "admin" : "staff") : canRespond ? "proveedor" : "ninguno";
  const [bucket, setBucket] = useState<ShippingV2NovedadBucket>(rol === "proveedor" ? "con-proveedor" : "nuestro-turno");
  const [soloBloqueadas, setSoloBloqueadas] = useState(false);
  const [proveedor, setProveedor] = useState(ALL);
  const [tipo, setTipo] = useState(ALL);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState<ShippingV2Novedad | null>(null);
  const [accion, setAccion] = useState<ShippingV2NovedadAccionConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [aviso, setAviso] = useState("");

  // El proveedor ve las pestañas desde su lado.
  const buckets = SHIPPING_V2_NOVEDAD_BUCKETS.map((b) =>
    rol === "proveedor" && b.key === "nuestro-turno" ? { ...b, label: "Respondidas" } : rol === "proveedor" && b.key === "con-proveedor" ? { ...b, label: "Por responder" } : b
  );

  const tipos = useMemo(() => Array.from(new Set(novedades.map((n) => n.tipo).filter(Boolean))).sort(), [novedades]);
  const bloqueadas = useMemo(() => novedades.filter((n) => n.bloqueaVenta).length, [novedades]);

  const conteoPorBucket = useMemo(() => {
    const counts: Record<ShippingV2NovedadBucket, number> = { "nuestro-turno": 0, "con-proveedor": 0, "en-solucion": 0, cerradas: 0 };
    for (const n of novedades) counts[getNovedadBucket(n)] += 1;
    return counts;
  }, [novedades]);

  const sinRespuesta = useMemo(
    () => novedades.filter((n) => isNovedadAbierta(n.estado) && (diasEsperando(n) ?? 0) >= 7).length,
    [novedades]
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return novedades
      .filter((n) => {
        if (soloBloqueadas ? !n.bloqueaVenta : getNovedadBucket(n) !== bucket) return false;
        if (proveedor !== ALL && n.proveedorResponsableId !== proveedor) return false;
        if (tipo !== ALL && n.tipo !== tipo) return false;
        if (!q) return true;
        return [n.novedadId, n.itemSku, n.itemNombre, n.packingLabel, n.descripcion, n.proveedorResponsableNombre].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => (b.fechaRegistro || "").localeCompare(a.fechaRegistro || ""));
  }, [bucket, busqueda, novedades, proveedor, soloBloqueadas, tipo]);

  function abrirAccion(n: ShippingV2Novedad, a: ShippingV2NovedadAccionConfig) {
    setSeleccionada(n);
    setAccion(a);
    setMensaje("");
  }

  async function ejecutar(valores: ValoresAccionNovedad) {
    if (!seleccionada || !accion) return;
    setBusy(true);
    setMensaje("");
    try {
      const resultado = await ejecutarAccionNovedad(seleccionada.id, accion.accion, valores);
      const actualizada = resultado.novedad ?? undefined;
      const extra = resultado.mensaje ? ` ${resultado.mensaje}` : "";
      if (actualizada && !soloBloqueadas) {
        const destino = getNovedadBucket(actualizada);
        setBucket(destino);
        setAviso(`${accion.label}: listo. Ahora está en "${buckets.find((b) => b.key === destino)?.label ?? destino}".${extra}`);
      } else {
        setAviso(`${accion.label}: listo.${extra}`);
      }
      setAccion(null);
      setSeleccionada(null);
      router.refresh();
    } catch (actionError) {
      setMensaje(actionError instanceof Error ? actionError.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-2">
      {error ? <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{error}</div> : null}
      {aviso ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#7BE495]/30 bg-[#7BE495]/10 px-3 py-2 text-sm text-[#9FEFB3]">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso("")} className="shrink-0 text-[12px] font-bold uppercase opacity-70 hover:opacity-100">Cerrar</button>
        </div>
      ) : null}

      <section className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#30312D] bg-[#11120F] p-2">
        {buckets.map((item) => (
          <button
            key={item.key}
            type="button"
            title={item.descripcion}
            onClick={() => { setBucket(item.key); setSoloBloqueadas(false); }}
            className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${!soloBloqueadas && bucket === item.key ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] bg-[#151515] text-[#A7A7A7] hover:text-[#F5F5F5]"}`}
          >
            {item.label} ({conteoPorBucket[item.key]})
          </button>
        ))}
        {rol !== "proveedor" ? (
          <button
            type="button"
            title="Novedades que impiden reservar y vender su artículo (abiertas o ya cerradas sin desbloquear)."
            onClick={() => setSoloBloqueadas((v) => !v)}
            className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${soloBloqueadas ? "border-[#FF6B6B] bg-[#FF6B6B]/20 text-[#FF9C9C]" : "border-[#FF6B6B]/35 bg-[#151515] text-[#FF9C9C] hover:border-[#FF6B6B]"}`}
          >
            Venta bloqueada ({bloqueadas})
          </button>
        ) : null}
        {sinRespuesta ? <span className="ml-auto text-[12px] text-[#FFB07A]">{sinRespuesta} sin respuesta del proveedor hace 7+ días</span> : null}
      </section>

      <section className="grid gap-2 rounded-xl border border-[#30312D] bg-[#11120F] p-2 md:grid-cols-3">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por SKU, artículo, packing o descripción" className="h-8 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] text-[#F5F5F5] placeholder:text-[#6F706B]" />
        {rol !== "proveedor" ? (
          <select value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="h-8 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] font-semibold text-[#F5F5F5]">
            <option value={ALL}>{ALL} los proveedores</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
          </select>
        ) : <span />}
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-8 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] font-semibold text-[#F5F5F5]">
          <option value={ALL}>{ALL} los tipos</option>
          {tipos.map((option) => <option key={option}>{option}</option>)}
        </select>
      </section>

      <div className="space-y-1.5">
        {filtradas.map((n) => (
          <NovedadCard key={n.id} novedad={n} rol={rol} canRespond={canRespond} busy={busy} onAccion={abrirAccion} onRefrescar={() => router.refresh()} />
        ))}
        {filtradas.length === 0 ? (
          <p className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-6 text-center text-sm text-[#8F908A]">No hay novedades aquí con los filtros actuales.</p>
        ) : null}
      </div>

      {accion && seleccionada ? (
        <NovedadAccionModal
          novedad={seleccionada}
          accion={accion}
          rol={rol}
          canEditItems={canEditItems}
          busy={busy}
          mensaje={mensaje}
          onCancel={() => { setAccion(null); setSeleccionada(null); }}
          onSubmit={(valores) => void ejecutar(valores)}
        />
      ) : null}
    </div>
  );
}
