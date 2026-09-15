"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { VisorEvidencias } from "@/components/shipping-v2/VisorEvidencias";
import { useRouter } from "next/navigation";
import {
  construirHiloNovedad,
  esResponsableProveedor,
  getNovedadBucket,
  getShippingV2NovedadAccionesDisponibles,
  getSolucionesDisponibles,
  getTurnoNovedad,
  isNovedadAbierta,
  SHIPPING_V2_NOVEDAD_BUCKETS,
  type ShippingV2NovedadBucket,
  type ShippingV2NovedadTransicion,
} from "@/lib/shipping-v2/novedades";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import type { ShippingV2Novedad, ShippingV2Proveedor } from "@/types/shipping-v2";

type Props = {
  novedades: ShippingV2Novedad[];
  proveedores: ShippingV2Proveedor[];
  error: string;
  isSiteAdmin: boolean;
  canRespond: boolean;
};

const ALL = "Todos";

function display(value?: string | number | null) {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  return text || "—";
}

/** Antigüedad en lenguaje corto: ocupa un tercio que una fecha completa. */
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

/** Días que lleva la pelota en la cancha del proveedor sin que conteste. */
function diasEsperando(novedad: ShippingV2Novedad) {
  if (getTurnoNovedad(novedad) !== "proveedor") return null;
  const referencia = novedad.fechaEnviadaProveedor || novedad.fechaRegistro;
  if (!referencia) return null;
  const desde = new Date(referencia);
  if (Number.isNaN(desde.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - desde.getTime()) / 86_400_000));
}

function estadoTone(novedad: ShippingV2Novedad) {
  const bucket = getNovedadBucket(novedad);
  if (bucket === "nuestras") return "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]";
  if (bucket === "con-proveedor") return "border-[#4FC3FF]/35 bg-[#4FC3FF]/10 text-[#BDEAFF]";
  if (bucket === "en-solucion") return "border-[#F4E85B]/35 bg-[#F4E85B]/10 text-[#F4E85B]";
  return "border-[#7BE495]/35 bg-[#7BE495]/10 text-[#9FEFB3]";
}

function Kpi({ label, value, hint, tone = "lime" }: { label: string; value: number; hint?: string; tone?: "lime" | "orange" | "green" }) {
  const color = tone === "orange" ? "text-[#FFB07A]" : tone === "green" ? "text-[#9FEFB3]" : "text-[#D7FF4F]";
  return (
    <article className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-2 shadow-lg shadow-black/10">
      <p className="truncate text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold leading-none tabular-nums xl:text-xl ${color}`}>{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-[#8F908A]">{hint}</p> : null}
    </article>
  );
}

/** La conversación: nuestras entradas a la izquierda, las del proveedor a la derecha. */
function Hilo({ novedad }: { novedad: ShippingV2Novedad }) {
  const entradas = useMemo(() => construirHiloNovedad(novedad), [novedad]);
  if (!entradas.length) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {entradas.map((entrada, index) => {
        const esProveedor = entrada.lado === "proveedor";
        return (
          <div key={`${entrada.fecha}-${index}`} className={`flex ${esProveedor ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg border px-2.5 py-1.5 ${
                esProveedor
                  ? "border-[#4FC3FF]/25 bg-[#4FC3FF]/8 text-[#BDEAFF]"
                  : "border-[#3A3A36] bg-[#11120F] text-[#D5D5D0]"
              }`}
            >
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

/**
 * Una novedad, en una fila densa que se expande.
 *
 * Antes cada novedad ocupaba ~150px de alto: una fila solo para chips, el
 * nombre del artículo partido en dos líneas, una fila de metadatos con campos
 * vacíos ("Proveedor: —"), el hilo siempre desplegado y otra fila de botones.
 * Con cuatro novedades ya no cabía nada en pantalla.
 *
 * Ahora lo escaneable va en UNA línea que aprovecha el ancho, y el detalle
 * (hilo, evidencias, acciones secundarias) se abre solo en la que te interesa.
 */
function NovedadCard({
  novedad,
  isSiteAdmin,
  canRespond,
  busy,
  onAccion,
  onRefrescar,
}: {
  novedad: ShippingV2Novedad;
  isSiteAdmin: boolean;
  canRespond: boolean;
  busy: boolean;
  onAccion: (novedad: ShippingV2Novedad, transicion: ShippingV2NovedadTransicion) => void;
  onRefrescar: () => void;
}) {
  const [abierta, setAbierta] = useState(false);

  const acciones = getShippingV2NovedadAccionesDisponibles({
    estado: novedad.estado,
    responsable: novedad.responsable,
    isSiteAdmin,
  });
  // La acción principal se queda a la vista; las demás viven en el detalle.
  const principal = acciones.find((accion) => accion.tono === "principal") ?? null;
  const secundarias = acciones.filter((accion) => accion !== principal);

  const dias = diasEsperando(novedad);
  const turno = getTurnoNovedad(novedad);
  const esProveedor = esResponsableProveedor(novedad.responsable);
  const hilo = construirHiloNovedad(novedad);
  const ultima = hilo[hilo.length - 1];

  return (
    <article className={`rounded-xl border bg-[#171814] shadow-lg shadow-black/15 transition ${turno === "nosotros" ? "border-[#D7FF4F]/30" : "border-[#30312D]"}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setAbierta((valor) => !valor)}
          aria-expanded={abierta}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${estadoTone(novedad)}`}>
            {display(novedad.estado)}
          </span>
          <span className="hidden shrink-0 rounded-full border border-[#3A3A36] bg-[#151515] px-2 py-0.5 text-[11px] font-semibold text-[#A7A7A7] sm:inline">
            {display(novedad.tipo)}
          </span>

          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#F5F5F5]" title={`${novedad.itemSku} · ${novedad.itemNombre}`}>
            {novedad.itemSku ? <span className="text-[#D7FF4F]">{novedad.itemSku}</span> : null}
            {novedad.itemSku && novedad.itemNombre ? " · " : ""}
            <span className="font-normal text-[#C9C9C4]">{display(novedad.itemNombre)}</span>
          </span>

          {/* Lo último que se dijo, para saber de qué va sin abrir nada. */}
          {ultima && !abierta ? (
            <span className="hidden min-w-0 max-w-[24ch] truncate text-[12px] text-[#8F908A] xl:inline" title={ultima.texto}>
              {ultima.lado === "proveedor" ? "↩ " : ""}{ultima.texto}
            </span>
          ) : null}

          {/* Que se vea que hay fotos sin tener que desplegar la tarjeta:
              una novedad con evidencia pesa distinto al reclamar. */}
          {novedad.evidencias.length ? (
            <span className="shrink-0 rounded-full border border-[#3A3A36] bg-[#151515] px-1.5 py-0.5 text-[11px] font-semibold text-[#A7A7A7]" title={`${novedad.evidencias.length} evidencia(s)`}>
              &#128247; {novedad.evidencias.length}
            </span>
          ) : null}

          <span className="hidden shrink-0 text-[11px] text-[#6F706B] md:inline">{antiguedad(novedad.fechaRegistro)}</span>

          {turno === "nosotros" ? (
            <span className="shrink-0 rounded-full border border-[#D7FF4F] bg-[#D7FF4F]/15 px-2 py-0.5 text-[11px] font-bold text-[#D7FF4F]">Tu turno</span>
          ) : null}
          {dias !== null && dias >= 7 ? (
            <span className="shrink-0 rounded-full border border-[#FF914D]/35 bg-[#FF914D]/10 px-2 py-0.5 text-[11px] font-semibold text-[#FFB07A]">{dias} d</span>
          ) : null}

          <span className={`shrink-0 text-[#6F706B] transition ${abierta ? "rotate-180" : ""}`} aria-hidden="true">▾</span>
        </button>

        {principal ? (
          <button
            type="button"
            title={principal.descripcion}
            disabled={busy || (!canRespond && principal.accion === "responder")}
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
            <span>{esProveedor ? "Lo resuelve el proveedor" : "Lo resolvemos nosotros"}</span>
            {/* Solo se muestra lo que tiene valor: un "Proveedor: —" es ruido. */}
            {novedad.proveedorResponsableNombre ? <span>Proveedor de compra: <strong className="font-semibold text-[#F5F5F5]">{novedad.proveedorResponsableNombre}</strong></span> : null}
            {novedad.packingLabel ? <span>Packing: <strong className="font-semibold text-[#F5F5F5]">{novedad.packingLabel}</strong></span> : null}
            <span>Registrada: <strong className="font-semibold text-[#F5F5F5]">{formatDate(novedad.fechaRegistro) || "—"}</strong></span>
            {novedad.solucion ? <span>Solución: <strong className="font-semibold text-[#F5F5F5]">{novedad.solucion}</strong></span> : null}
            {novedad.prioridad ? <span>Prioridad: <strong className="font-semibold text-[#F5F5F5]">{novedad.prioridad}</strong></span> : null}
          </div>

          <Hilo novedad={novedad} />

          {/* Evidencias: se ven como foto o video, no como un enlace con el
              nombre del archivo. Se pueden agregar desde aquí mismo, porque
              muchas veces la prueba aparece después de registrar la novedad
              (el proveedor pide "mándame una foto del serial"). */}
          <VisorEvidencias
            novedadId={novedad.id}
            evidencias={novedad.evidencias}
            onUpdated={onRefrescar}
            canEdit={canRespond}
          />

          {novedad.descripcionSolucion ? (
            <p className="mt-1.5 rounded-lg border border-[#F4E85B]/25 bg-[#F4E85B]/8 px-2.5 py-1.5 text-[12px] leading-5 text-[#F4E85B]">
              <strong>Acordado:</strong> {novedad.descripcionSolucion}
            </p>
          ) : null}
          {novedad.observacionFinal ? (
            <p className="mt-1 rounded-lg border border-[#7BE495]/25 bg-[#7BE495]/8 px-2.5 py-1.5 text-[12px] leading-5 text-[#9FEFB3]">
              <strong>Cierre:</strong> {novedad.observacionFinal}
            </p>
          ) : null}

          {secundarias.length || !principal ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {!principal && !secundarias.length ? (
                <span className="text-[12px] text-[#6F706B]">
                  {turno === "proveedor" ? "Esperando respuesta del proveedor." : "Sin acciones disponibles."}
                </span>
              ) : null}
              {secundarias.map((transicion) => (
                <button
                  key={transicion.accion}
                  type="button"
                  title={transicion.descripcion}
                  disabled={busy}
                  onClick={() => onAccion(novedad, transicion)}
                  className={`inline-flex h-7 items-center rounded-lg border px-2.5 text-[12px] font-bold transition disabled:opacity-40 ${
                    transicion.tono === "peligro"
                      ? "border-[#FF914D]/45 bg-[#FF914D]/10 text-[#FFB07A] hover:border-[#FF914D]"
                      : "border-[#3A3A36] bg-[#20211D] text-[#F5F5F5] hover:border-[#D7FF4F]/55"
                  }`}
                >
                  {transicion.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ShippingV2NovedadesClient({ novedades, proveedores, error, isSiteAdmin, canRespond }: Props) {
  const router = useRouter();
  const [bucket, setBucket] = useState<ShippingV2NovedadBucket>("nuestras");
  const [proveedor, setProveedor] = useState(ALL);
  const [tipo, setTipo] = useState(ALL);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionada, setSeleccionada] = useState<ShippingV2Novedad | null>(null);
  const [accion, setAccion] = useState<ShippingV2NovedadTransicion | null>(null);
  const [texto, setTexto] = useState("");
  const [solucion, setSolucion] = useState("");
  const [cerrarDirecto, setCerrarDirecto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [aviso, setAviso] = useState("");

  const tipos = useMemo(
    () => Array.from(new Set(novedades.map((novedad) => novedad.tipo).filter(Boolean))).sort(),
    [novedades]
  );

  const conteoPorBucket = useMemo(() => {
    const counts: Record<ShippingV2NovedadBucket, number> = { nuestras: 0, "con-proveedor": 0, "en-solucion": 0, cerradas: 0 };
    for (const novedad of novedades) counts[getNovedadBucket(novedad)] += 1;
    return counts;
  }, [novedades]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return novedades
      .filter((novedad) => {
        if (getNovedadBucket(novedad) !== bucket) return false;
        if (proveedor !== ALL && novedad.proveedorResponsableId !== proveedor) return false;
        if (tipo !== ALL && novedad.tipo !== tipo) return false;
        if (!q) return true;
        return [novedad.novedadId, novedad.itemSku, novedad.itemNombre, novedad.packingLabel, novedad.descripcion, novedad.proveedorResponsableNombre]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      // Primero las que esperan algo de nosotros: son en las que se puede avanzar hoy.
      .sort((a, b) => {
        const turnoA = getTurnoNovedad(a) === "nosotros" ? 0 : 1;
        const turnoB = getTurnoNovedad(b) === "nosotros" ? 0 : 1;
        if (turnoA !== turnoB) return turnoA - turnoB;
        return (b.fechaRegistro || "").localeCompare(a.fechaRegistro || "");
      });
  }, [bucket, busqueda, novedades, proveedor, tipo]);

  const kpis = useMemo(() => {
    const abiertas = novedades.filter((novedad) => isNovedadAbierta(novedad.estado));
    return {
      nuestroTurno: abiertas.filter((novedad) => getTurnoNovedad(novedad) === "nosotros").length,
      enProveedor: abiertas.filter((novedad) => getTurnoNovedad(novedad) === "proveedor").length,
      sinRespuesta: abiertas.filter((novedad) => (diasEsperando(novedad) ?? 0) >= 7).length,
      cerradas: conteoPorBucket.cerradas,
    };
  }, [conteoPorBucket, novedades]);

  function abrirAccion(novedad: ShippingV2Novedad, transicion: ShippingV2NovedadTransicion) {
    setSeleccionada(novedad);
    setAccion(transicion);
    setTexto("");
    setSolucion(novedad.solucion || "");
    setCerrarDirecto(false);
    setMensaje("");
  }

  async function ejecutar() {
    if (!seleccionada || !accion) return;
    setBusy(true);
    setMensaje("");
    try {
      const campo = accion.campoRequerido ?? accion.campoOpcional;
      const valores = campo ? { [campo.nombre]: texto } : {};
      const response = await fetch(`/api/shipping-v2/novedades/${seleccionada.id}/transicion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: accion.accion,
          valores,
          solucion: accion.requiereSolucion ? solucion : undefined,
          cerrarDirecto: accion.permiteCerrarDirecto ? cerrarDirecto : false,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo actualizar la novedad."));

      // Una acción casi siempre mueve la novedad de pestaña (definir una
      // resolución la manda a "En solución"). Si el panel se queda en la
      // pestaña anterior, la tarjeta simplemente desaparece y parece que se
      // perdió: eso pasó con OTR-000199. Se salta a donde quedó y se avisa.
      const actualizada = payload?.data?.novedad as ShippingV2Novedad | undefined;
      if (actualizada) {
        const destino = getNovedadBucket(actualizada);
        const etiqueta = SHIPPING_V2_NOVEDAD_BUCKETS.find((item) => item.key === destino)?.label ?? destino;
        setBucket(destino);
        setAviso(`${accion.label}: la novedad pasó a "${actualizada.estado}" y ahora está en la pestaña ${etiqueta}.`);
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
    <div className="w-full space-y-2.5">
      <section className="flex flex-col gap-2 rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20 lg:flex-row lg:items-center lg:justify-between 2xl:px-4 2xl:py-3">
        <div>
          <h2 className="text-lg font-semibold text-[#F5F5F5]">Novedades</h2>
          <p className="mt-0.5 text-sm text-[#A7A7A7]">Problemas detectados en revisión. Al cerrar una novedad, el artículo recupera su disponibilidad.</p>
        </div>
        <Link
          href="/shipping-v2"
          className="rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-center text-sm font-bold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]"
        >
          Volver a Shipping
        </Link>
      </section>

      {error ? <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2.5 text-sm text-[#FFB07A]">{error}</div> : null}

      {aviso ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#7BE495]/30 bg-[#7BE495]/10 px-3 py-2.5 text-sm text-[#9FEFB3]">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso("")} className="shrink-0 text-[12px] font-bold uppercase opacity-70 hover:opacity-100">Cerrar</button>
        </div>
      ) : null}

      <section className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Nuestro turno" value={kpis.nuestroTurno} hint="Se puede avanzar hoy" tone="orange" />
        <Kpi label="En el proveedor" value={kpis.enProveedor} hint="Esperando su respuesta" />
        <Kpi label="Sin respuesta +7 días" value={kpis.sinRespuesta} hint="Conviene insistir" tone="orange" />
        <Kpi label="Cerradas" value={kpis.cerradas} tone="green" />
      </section>

      <section className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#30312D] bg-[#11120F] p-2 shadow-xl shadow-black/15">
        {SHIPPING_V2_NOVEDAD_BUCKETS.map((item) => (
          <button
            key={item.key}
            type="button"
            title={item.descripcion}
            onClick={() => setBucket(item.key)}
            className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${bucket === item.key ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] bg-[#151515] text-[#A7A7A7] hover:text-[#F5F5F5]"}`}
          >
            {item.label} ({conteoPorBucket[item.key]})
          </button>
        ))}
      </section>

      <section className="grid gap-2 rounded-xl border border-[#30312D] bg-[#11120F] p-2 shadow-xl shadow-black/15 md:grid-cols-3">
        <input
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          placeholder="Buscar por SKU, artículo, packing o descripción"
          className="h-9 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] text-[#F5F5F5] placeholder:text-[#6F706B]"
        />
        <select value={proveedor} onChange={(event) => setProveedor(event.target.value)} className="h-9 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] font-semibold text-[#F5F5F5]">
          <option value={ALL}>{ALL} los proveedores</option>
          {proveedores.map((provider) => <option key={provider.id} value={provider.id}>{getShippingV2ProveedorLabel(provider)}</option>)}
        </select>
        <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="h-9 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-[13px] font-semibold text-[#F5F5F5]">
          <option value={ALL}>{ALL} los tipos</option>
          {tipos.map((option) => <option key={option}>{option}</option>)}
        </select>
      </section>

      <div className="space-y-1.5">
        {filtradas.map((novedad) => (
          <NovedadCard
            key={novedad.id}
            novedad={novedad}
            isSiteAdmin={isSiteAdmin}
            canRespond={canRespond}
            busy={busy}
            onAccion={abrirAccion}
            onRefrescar={() => router.refresh()}
          />
        ))}
        {filtradas.length === 0 ? (
          <p className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-6 text-center text-sm text-[#8F908A]">
            No hay novedades en esta pestaña con los filtros actuales.
          </p>
        ) : null}
      </div>

      {accion && seleccionada ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#3A3A36] bg-[#151613] p-4 shadow-2xl shadow-black/60">
            <h3 className="text-lg font-semibold text-[#F5F5F5]">{accion.label}</h3>
            <p className="mt-0.5 text-sm text-[#A7A7A7]">{accion.descripcion}</p>
            <p className="mt-2 text-[12px] text-[#8F908A]">
              {display(seleccionada.itemSku)} · {display(seleccionada.tipo)} · {display(seleccionada.estado)}
            </p>

            {accion.requiereSolucion ? (
              <label className="mt-3 block">
                <span className="text-[12px] font-semibold uppercase tracking-normal text-[#A7A7A7]">
                  {esResponsableProveedor(seleccionada.responsable) ? "Qué ofrece el proveedor" : "Qué hacemos con el artículo"}
                </span>
                <select
                  value={solucion}
                  onChange={(event) => setSolucion(event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#11120F] px-3 text-[13px] font-semibold text-[#F5F5F5]"
                >
                  <option value="">Elige una opción…</option>
                  {getSolucionesDisponibles(seleccionada.responsable).map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            ) : null}

            {(accion.campoRequerido ?? accion.campoOpcional) ? (
              <label className="mt-3 block">
                <span className="text-[12px] font-semibold uppercase tracking-normal text-[#A7A7A7]">
                  {(accion.campoRequerido ?? accion.campoOpcional)!.label}
                </span>
                <textarea
                  value={texto}
                  // Se limpia el error al escribir: si no, el aviso de "completa
                  // este campo" se quedaba en pantalla aunque ya lo hubieras
                  // llenado, y parecía que el formulario seguía mal.
                  onChange={(event) => { setTexto(event.target.value); if (mensaje) setMensaje(""); }}
                  rows={4}
                  placeholder={(accion.campoRequerido ?? accion.campoOpcional)!.placeholder}
                  className="mt-1 w-full rounded-lg border border-[#3A3A36] bg-[#11120F] px-3 py-2 text-[13px] text-[#F5F5F5] placeholder:text-[#5A5B57]"
                />
              </label>
            ) : null}

            {accion.permiteCerrarDirecto ? (
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-[#3A3A36] bg-[#11120F] px-3 py-2">
                <input
                  type="checkbox"
                  checked={cerrarDirecto}
                  onChange={(event) => setCerrarDirecto(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#D7FF4F]"
                />
                <span>
                  <span className="block text-[13px] font-semibold text-[#F5F5F5]">Ya está hecho, cerrar la novedad</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-[#8F908A]">
                    Déjalo sin marcar solo si falta que algo ocurra (que llegue el reemplazo, que se repare).
                  </span>
                </span>
              </label>
            ) : null}

            {mensaje ? <p className="mt-2 text-sm font-semibold text-[#FFB07A]">{mensaje}</p> : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => { setAccion(null); setSeleccionada(null); }}
                className="h-9 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-semibold text-[#F5F5F5] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void ejecutar()}
                className="h-9 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50"
              >
                {busy ? "Guardando..." : accion.permiteCerrarDirecto && cerrarDirecto ? `${accion.label} y cerrar` : accion.label}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
