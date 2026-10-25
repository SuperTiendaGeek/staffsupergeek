"use client";

// Pestaña Novedades. Rediseño 16-oct-2026 (punto 15, mismo lenguaje que
// Artículos y Recepción): una sola barra con las pestañas y su conteo, venta
// bloqueada, buscador y filtros; debajo una lista compacta de dos líneas
// (artículo y último mensaje) que se despliega para ver la conversación, los
// datos, las evidencias y el resto de acciones.

import { EnlaceArticulo } from "@/components/shipping-v2/ficha-articulo/contexto";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronDown, ListFilter, Lock, Search, X } from "lucide-react";
import { VisorEvidencias } from "@/components/shipping-v2/VisorEvidencias";
import { ejecutarAccionNovedad, NovedadAccionModal } from "@/components/shipping-v2/novedades/NovedadAccionModal";
import { coincidenTerminos, normalizarBusqueda, terminosBusqueda } from "@/lib/shipping-v2/items-filtro";
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

/** Columnas de la lista en pantalla ancha: tipo · artículo · proveedor · fecha · evidencias · acción. */
const COLUMNAS = "md:grid-cols-[7rem_minmax(0,1fr)_9.5rem_6rem_2.75rem_8.75rem] xl:grid-cols-[7rem_minmax(0,1fr)_13rem_6rem_2.75rem_8.75rem]";
const CHIP = "inline-flex max-w-full shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[10.5px] font-semibold leading-4";
const CHIP_TIPO = "inline-block max-w-full shrink-0 truncate rounded-full border border-[#3A3A36] bg-[#151515] px-1.5 py-px align-middle text-[10.5px] font-semibold leading-4 text-[#B4B5AC]";

/** Nombre corto del tipo para la lista (el completo queda en el tooltip). */
const TIPO_CORTO: Record<string, string> = {
  "Falla de funcionamiento": "Falla",
  "Diferente al esperado": "Diferente",
  "Perdido en tienda": "Extraviado",
};

/** Etiqueta corta del botón principal en la fila (la ventana muestra la completa). */
const ACCION_CORTA: Record<string, string> = { cumplida: "Cumplida" };

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

function textoBusqueda(n: ShippingV2Novedad) {
  return normalizarBusqueda([
    n.novedadId, n.itemSku, n.itemNombre, n.packingLabel, n.proveedorResponsableNombre,
    n.tipo, n.decision, n.descripcion, n.mensajeProveedor, n.respuestaProveedor,
  ].join(" "));
}

const detener = (event: MouseEvent) => event.stopPropagation();

function Hilo({ entradas }: { entradas: ReturnType<typeof construirHiloNovedad> }) {
  if (!entradas.length) return <p className="text-[12px] text-[#6F706B]">Sin mensajes.</p>;
  return (
    <div className="space-y-1.5">
      {entradas.map((entrada, index) => {
        const esProveedor = entrada.lado === "proveedor";
        return (
          <div key={`${entrada.fecha}-${index}`} className={`flex ${esProveedor ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-lg border px-2.5 py-1.5 ${esProveedor ? "border-[#4FC3FF]/25 bg-[#4FC3FF]/8 text-[#BDEAFF]" : "border-[#30312D] bg-[#171814] text-[#D5D5D0]"}`}>
              <p className="text-[10.5px] font-semibold opacity-70">
                {esProveedor ? "↩ " : ""}{entrada.autor}{entrada.fecha ? ` · ${formatDate(entrada.fecha)}` : ""}
              </p>
              <p className="whitespace-pre-wrap text-[12.5px] leading-5">{entrada.texto}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Datos({ filas }: { filas: Array<[string, string | null | undefined]> }) {
  const visibles = filas.filter((fila): fila is [string, string] => Boolean(fila[1]));
  if (!visibles.length) return null;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11.5px] leading-5">
      {visibles.map(([etiqueta, valor]) => (
        <Fragment key={etiqueta}>
          <dt className="text-[#8F908A]">{etiqueta}</dt>
          <dd className="min-w-0 break-words font-semibold text-[#E5E5E0]">{valor}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function NovedadFila({
  novedad,
  rol,
  canRespond,
  busy,
  vistaBloqueadas,
  enlazarArticulo,
  onAccion,
  onRefrescar,
}: {
  novedad: ShippingV2Novedad;
  rol: ShippingV2NovedadRol;
  canRespond: boolean;
  busy: boolean;
  vistaBloqueadas: boolean;
  enlazarArticulo: boolean;
  onAccion: (novedad: ShippingV2Novedad, accion: ShippingV2NovedadAccionConfig) => void;
  onRefrescar: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const acciones = getAccionesDisponibles(novedad, rol);
  const principal = acciones.find((accion) => accion.tono === "principal") ?? null;
  // Las de riesgo (bloquear, desbloquear, reabrir) van al final, a la derecha.
  const secundarias = acciones.filter((accion) => accion !== principal).sort((x, y) => Number(x.tono === "peligro") - Number(y.tono === "peligro"));
  const primeraPeligrosa = secundarias.findIndex((accion) => accion.tono === "peligro");
  const dias = diasEsperando(novedad);
  const hilo = useMemo(() => construirHiloNovedad(novedad), [novedad]);
  const ultima = hilo[hilo.length - 1];
  const esProveedorUI = rol === "proveedor";
  const evidencias = novedad.evidencias.length;
  const turno = etiquetaTurno(novedad);
  // La pestaña ya dice el turno: solo se repite cuando agrega algo (el
  // proveedor contestó, o la vista de bloqueadas mezcla pestañas).
  const chipTurno = esProveedorUI ? "" : vistaBloqueadas ? turno : turno === "Respondió el proveedor" ? "Respondió" : "";
  const bloqueada = novedad.bloqueaVenta && !vistaBloqueadas && !esProveedorUI;
  const origen = esProveedorUI ? display(novedad.packingLabel) : display(novedad.proveedorResponsableNombre);
  const origenSecundario = esProveedorUI ? "" : novedad.packingLabel || "";
  const tipo = display(novedad.tipo);
  const tipoCorto = TIPO_CORTO[tipo] ?? tipo;
  // El tiempo de espera se avisa solo cuando ya pasó una semana (igual que en la pestaña).
  const esperaLarga = dias !== null && dias >= 7;

  const filas: Array<[string, string | null | undefined]> = [
    ["Resuelve", esResponsableProveedor(novedad.responsable) ? "Proveedor (garantía)" : "SUPER GEEK"],
    ["Registrada", `${formatDate(novedad.fechaRegistro)}${novedad.registradoPor && !esProveedorUI ? ` · ${novedad.registradoPor}` : ""}`],
    ["Propuesta", novedad.solucion ? etiquetaPropuesta(novedad.solucion) : ""],
    ["Reclamado", money(novedad.montoReclamado)],
    ["Recuperado", money(novedad.montoRecuperado)],
  ];
  if (!esProveedorUI) {
    filas.push(
      ["Unidades", novedad.cantidadAfectada ? String(novedad.cantidadAfectada) : ""],
      ["Precio con descuento", money(novedad.precioConDescuento)],
      ["Apareció", novedad.comoAparecio],
      ["Valor de la pérdida", money(novedad.valorPerdida)],
      ["Desbloqueada", novedad.ventaDesbloqueadaPor],
    );
  }
  if (novedad.fechaCierre) {
    filas.push(["Cerrada", `${formatDate(novedad.fechaCierre)}${novedad.cerradoPor && !esProveedorUI ? ` · ${novedad.cerradoPor}` : ""}`]);
  }

  const sku = novedad.itemSku ? (
    enlazarArticulo && novedad.itemId ? (
      <EnlaceArticulo id={novedad.itemId} onClick={detener} className="shrink-0 text-[12px] font-bold text-[#D7FF4F] hover:underline" title="Abrir la ficha del artículo">
        {novedad.itemSku}
      </EnlaceArticulo>
    ) : (
      <span className="shrink-0 text-[12px] font-bold text-[#D7FF4F]">{novedad.itemSku}</span>
    )
  ) : null;

  return (
    <div className="border-b border-[#24251F] last:border-b-0">
      <div
        onClick={() => setAbierta((valor) => !valor)}
        className={`grid min-h-11 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center text-xs transition hover:bg-[#D7FF4F]/[0.04] ${COLUMNAS} ${abierta ? "bg-[#D7FF4F]/[0.03]" : ""}`}
      >
        <div className="hidden min-w-0 px-2 md:block">
          <span className={CHIP_TIPO} title={tipo}>{tipoCorto}</span>
        </div>

        <div className="min-w-0 px-2 py-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            {sku}
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[#F5F5F5]" title={display(novedad.itemNombre)}>
              {display(novedad.itemNombre)}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1">
            <span className={`${CHIP_TIPO} md:hidden`} title={tipo}>{tipoCorto}</span>
            {chipTurno ? <span className={`${CHIP} ${turnoTone(novedad)}`} title={turno}>{chipTurno}</span> : null}
            {bloqueada ? (
              <span className={`${CHIP} border-[#FF6B6B]/45 bg-[#FF6B6B]/12 text-[#FF9C9C]`} title="No se puede reservar ni vender. Solo un Administrador la desbloquea.">
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />Bloqueada
              </span>
            ) : null}
            {novedad.decision ? <span className={`${CHIP} border-[#3A3A36] bg-[#151515] text-[#D5D5D0]`} title="Decisión">{novedad.decision}</span> : null}
            {ultima ? (
              <span className={`min-w-0 flex-1 truncate text-[11.5px] ${ultima.lado === "proveedor" ? "text-[#9CCFE8]" : "text-[#8F908A]"}`} title={ultima.texto}>
                {ultima.lado === "proveedor" ? "↩ " : ""}{ultima.texto}
              </span>
            ) : null}
          </div>
          {/* En celular, lo que en pantalla ancha va en columnas. */}
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-[#8F908A] md:hidden">
            <span className="min-w-0 truncate">{origen}</span>
            <span className="shrink-0">{antiguedad(novedad.fechaRegistro)}</span>
            {esperaLarga ? <span className="shrink-0 font-semibold text-[#FFB07A]">espera {dias} d</span> : null}
            {evidencias ? <span className="inline-flex shrink-0 items-center gap-0.5"><Camera className="h-3 w-3" aria-hidden="true" />{evidencias}</span> : null}
          </div>
        </div>

        <div className="hidden min-w-0 px-2 md:block">
          <p className="truncate text-[12px] text-[#D5D5D0]" title={origen}>{origen}</p>
          {origenSecundario ? <p className="truncate text-[11px] text-[#8F908A]" title={origenSecundario}>{origenSecundario}</p> : null}
        </div>

        <div className="hidden px-2 text-right md:block">
          <p className="whitespace-nowrap text-[11.5px] text-[#B4B5AC]" title={formatDate(novedad.fechaRegistro)}>{antiguedad(novedad.fechaRegistro)}</p>
          {esperaLarga ? (
            <p className="whitespace-nowrap text-[11px] font-semibold text-[#FFB07A]" title="Días esperando la respuesta del proveedor">espera {dias} d</p>
          ) : null}
        </div>

        <div className="hidden justify-center md:flex">
          {evidencias ? (
            <span className="inline-flex items-center gap-0.5 text-[11.5px] text-[#B4B5AC]" title={`${evidencias} evidencia${evidencias === 1 ? "" : "s"}`}>
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />{evidencias}
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-1 px-2">
          {principal ? (
            <button
              type="button"
              title={principal.descripcion}
              disabled={busy || (principal.accion === "responder" && !canRespond)}
              onClick={(event) => { event.stopPropagation(); onAccion(novedad, principal); }}
              className="inline-flex h-7 shrink-0 items-center rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-2.5 text-[12px] font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-40"
            >
              {ACCION_CORTA[principal.accion] ?? principal.label}
            </button>
          ) : null}
          <button
            type="button"
            aria-expanded={abierta}
            aria-label={abierta ? "Cerrar detalle" : "Ver detalle"}
            title={abierta ? "Cerrar detalle" : "Ver conversación, datos y evidencias"}
            onClick={(event) => { event.stopPropagation(); setAbierta((valor) => !valor); }}
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition ${abierta ? "border-[#D7FF4F]/55 text-[#D7FF4F]" : "border-[#3A3A36] bg-[#10110F] text-[#A7A7A7] hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F]"}`}
          >
            <ChevronDown className={`h-4 w-4 transition ${abierta ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {abierta ? (
        <div className="grid gap-3 border-t border-[#24251F] bg-[#12130F] px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-1.5">
            <Hilo entradas={hilo} />
            {novedad.descripcionSolucion ? (
              <p className="rounded-lg border border-[#F4E85B]/25 bg-[#F4E85B]/8 px-2.5 py-1.5 text-[12px] leading-5 text-[#F4E85B]"><strong>Lo que se hizo:</strong> {novedad.descripcionSolucion}</p>
            ) : null}
            {novedad.observacionFinal && novedad.observacionFinal !== novedad.descripcionSolucion ? (
              <p className="rounded-lg border border-[#7BE495]/25 bg-[#7BE495]/8 px-2.5 py-1.5 text-[12px] leading-5 text-[#9FEFB3]"><strong>Cierre:</strong> {novedad.observacionFinal}</p>
            ) : null}
            {secundarias.length ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {secundarias.map((accion, indice) => (
                  <button
                    key={accion.accion}
                    type="button"
                    title={accion.descripcion}
                    disabled={busy}
                    onClick={() => onAccion(novedad, accion)}
                    className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[12px] font-semibold transition disabled:opacity-40 ${indice === primeraPeligrosa ? "ml-auto" : ""} ${
                      accion.tono === "peligro"
                        ? "border-[#FF914D]/45 bg-[#FF914D]/10 text-[#FFB07A] hover:border-[#FF914D]"
                        : "border-[#3A3A36] bg-[#1A1B17] text-[#F5F5F5] hover:border-[#D7FF4F]/55"
                    }`}
                  >
                    {accion.accion === "bloquear" || accion.accion === "desbloquear" ? <Lock className="h-3 w-3" aria-hidden="true" /> : null}
                    {accion.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 space-y-2 md:border-l md:border-[#24251F] md:pl-3">
            <Datos filas={filas} />
            <VisorEvidencias novedadId={novedad.id} evidencias={novedad.evidencias} onUpdated={onRefrescar} canEdit={canRespond && rol !== "ninguno"} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Selector compacto de filtro (Todos = sin filtro), como en Recepción. */
function FiltroSelect({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  opciones: Array<{ valor: string; etiqueta: string }>;
  onChange: (valor: string) => void;
}) {
  const activo = valor !== ALL;
  return (
    <select
      value={valor}
      onChange={(event) => onChange(event.target.value)}
      aria-label={etiqueta}
      className={`h-8 w-full cursor-pointer rounded-md border bg-[#10110F] px-2 text-[12.5px] font-semibold outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 ${activo ? "border-[#D7FF4F]/60 text-[#D7FF4F]" : "border-[#3A3A36] text-[#B4B5AC]"}`}
    >
      <option value={ALL}>{etiqueta}: todos</option>
      {opciones.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
    </select>
  );
}

function ToolbarButton({ label, active, children, onClick }: { label: string; active?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 ${
        active
          ? "border-[#D7FF4F]/55 bg-[#D7FF4F]/10 text-[#D7FF4F]"
          : "border-[#3A3A36] bg-[#10110F] text-[#A7A7A7] hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F]"
      }`}
    >
      {children}
    </button>
  );
}

export function ShippingV2NovedadesClient({ novedades, proveedores, error, isSiteAdmin, isStaff, canRespond, canEditItems }: Props) {
  const router = useRouter();
  const rol: ShippingV2NovedadRol = isStaff ? (isSiteAdmin ? "admin" : "staff") : canRespond ? "proveedor" : "ninguno";
  const esProveedorUI = rol === "proveedor";
  const [bucket, setBucket] = useState<ShippingV2NovedadBucket>(esProveedorUI ? "con-proveedor" : "nuestro-turno");
  const [soloBloqueadas, setSoloBloqueadas] = useState(false);
  const [proveedor, setProveedor] = useState(ALL);
  const [tipo, setTipo] = useState(ALL);
  const [busqueda, setBusqueda] = useState("");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const filtrosRef = useRef<HTMLDivElement | null>(null);
  const [seleccionada, setSeleccionada] = useState<ShippingV2Novedad | null>(null);
  const [accion, setAccion] = useState<ShippingV2NovedadAccionConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [aviso, setAviso] = useState("");

  // El proveedor ve las pestañas desde su lado.
  const buckets = SHIPPING_V2_NOVEDAD_BUCKETS.map((b) =>
    esProveedorUI && b.key === "nuestro-turno" ? { ...b, label: "Respondidas" } : esProveedorUI && b.key === "con-proveedor" ? { ...b, label: "Por responder" } : b
  );

  const tipos = useMemo(() => Array.from(new Set(novedades.map((n) => n.tipo).filter(Boolean))).sort(), [novedades]);
  const opcionesProveedor = useMemo(() => proveedores.map((p) => ({ valor: p.id, etiqueta: getShippingV2ProveedorLabel(p) })), [proveedores]);
  const filtrosActivos = (proveedor !== ALL ? 1 : 0) + (tipo !== ALL ? 1 : 0);
  const hayFiltros = filtrosActivos > 0 || Boolean(busqueda.trim());

  // Buscar, proveedor y tipo valen para todas las pestañas: los conteos dicen
  // dónde quedó lo que se busca.
  const base = useMemo(() => {
    const terminos = terminosBusqueda(busqueda);
    return novedades.filter((n) => {
      if (proveedor !== ALL && n.proveedorResponsableId !== proveedor) return false;
      if (tipo !== ALL && n.tipo !== tipo) return false;
      return !terminos.length || coincidenTerminos(textoBusqueda(n), terminos);
    });
  }, [busqueda, novedades, proveedor, tipo]);

  const conteoPorBucket = useMemo(() => {
    const counts: Record<ShippingV2NovedadBucket, number> = { "nuestro-turno": 0, "con-proveedor": 0, "en-solucion": 0, cerradas: 0 };
    for (const n of base) counts[getNovedadBucket(n)] += 1;
    return counts;
  }, [base]);
  const bloqueadas = useMemo(() => base.filter((n) => n.bloqueaVenta).length, [base]);
  const sinRespuesta = useMemo(() => base.filter((n) => isNovedadAbierta(n.estado) && (diasEsperando(n) ?? 0) >= 7).length, [base]);

  const filtradas = useMemo(
    () => base
      .filter((n) => (soloBloqueadas ? n.bloqueaVenta : getNovedadBucket(n) === bucket))
      .sort((a, b) => (b.fechaRegistro || "").localeCompare(a.fechaRegistro || "")),
    [base, bucket, soloBloqueadas]
  );

  useEffect(() => {
    if (!filtrosAbiertos) return;
    function alClic(event: globalThis.MouseEvent) {
      if (filtrosRef.current && !filtrosRef.current.contains(event.target as Node)) setFiltrosAbiertos(false);
    }
    function alTeclear(event: KeyboardEvent) {
      if (event.key === "Escape") setFiltrosAbiertos(false);
    }
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [filtrosAbiertos]);

  function quitarFiltros() {
    setProveedor(ALL);
    setTipo(ALL);
    setBusqueda("");
  }

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
      {error ? <div className="rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-[13px] text-[#FFB07A]">{error}</div> : null}
      {aviso ? (
        <div className="flex items-center gap-2 rounded-lg border border-[#7BE495]/30 bg-[#7BE495]/10 px-2.5 py-1.5 text-[12.5px] text-[#9FEFB3]">
          <span className="min-w-0 flex-1">{aviso}</span>
          <button type="button" onClick={() => setAviso("")} aria-label="Cerrar aviso" className="grid h-6 w-6 shrink-0 place-items-center rounded-md opacity-70 transition hover:bg-[#7BE495]/15 hover:opacity-100">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Una sola barra (como Recepción): pestañas con su conteo, venta bloqueada, buscar y filtrar. */}
      <section className="relative z-40 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#2E2F28] bg-[#151613] p-1.5">
        <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-md border border-[#3A3A36]">
          {buckets.map((item) => {
            const on = !soloBloqueadas && bucket === item.key;
            const atrasadas = item.key === "con-proveedor" && !esProveedorUI ? sinRespuesta : 0;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={on}
                title={item.descripcion}
                onClick={() => { setBucket(item.key); setSoloBloqueadas(false); }}
                className={`inline-flex h-8 items-center gap-1 whitespace-nowrap border-r border-[#3A3A36] px-2.5 text-[12.5px] font-semibold transition last:border-r-0 ${on ? "bg-[#D7FF4F] text-[#151515]" : "bg-[#151515] text-[#B4B5AC] hover:text-[#D7FF4F]"}`}
              >
                {item.label} <span className={`tabular-nums ${on ? "" : "text-[#8F908A]"}`}>{conteoPorBucket[item.key]}</span>
                {atrasadas ? (
                  <span
                    title={`${atrasadas} sin respuesta del proveedor hace 7 días o más`}
                    className={`rounded px-1 text-[10.5px] font-bold tabular-nums ${on ? "bg-[#151515]/15 text-[#7A3500]" : "bg-[#FF914D]/15 text-[#FFB07A]"}`}
                  >
                    {atrasadas} +7 d
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {!esProveedorUI && (bloqueadas > 0 || soloBloqueadas) ? (
          <button
            type="button"
            aria-pressed={soloBloqueadas}
            title="Novedades que impiden reservar y vender su artículo (abiertas o ya cerradas sin desbloquear)."
            onClick={() => setSoloBloqueadas((valor) => !valor)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-semibold transition ${soloBloqueadas ? "border-[#FF6B6B] bg-[#FF6B6B]/20 text-[#FFB3B3]" : "border-[#FF6B6B]/35 bg-[#151515] text-[#FF9C9C] hover:border-[#FF6B6B]"}`}
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Venta bloqueada <span className="tabular-nums">{bloqueadas}</span>
          </button>
        ) : null}

        <label className="relative block min-w-[7rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#D7FF4F]" aria-hidden="true" />
          <input
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar: SKU, artículo, mensaje…"
            className="h-8 w-full rounded-md border border-[#3A3A36] bg-[#10110F] pl-8 pr-8 text-[13px] text-[#F5F5F5] outline-none placeholder:text-[#696A64] focus:border-[#D7FF4F]/70"
          />
          {busqueda ? (
            <button type="button" onClick={() => setBusqueda("")} aria-label="Borrar búsqueda" className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-[#8F908A] hover:text-[#F5F5F5]">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <div ref={filtrosRef} className="relative z-50 shrink-0">
          <ToolbarButton label="Filtrar" active={filtrosActivos > 0} onClick={() => setFiltrosAbiertos((valor) => !valor)}>
            <ListFilter className="h-4 w-4" aria-hidden="true" />
            {filtrosActivos ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#D7FF4F] px-1 text-[10px] font-black text-[#151515]">{filtrosActivos}</span> : null}
          </ToolbarButton>
          {filtrosAbiertos ? (
            <div className="absolute right-0 top-full z-50 mt-1.5 grid w-[min(92vw,260px)] gap-1.5 rounded-lg border border-[#30312D] bg-[#11120F] p-2 shadow-2xl shadow-black/45">
              {!esProveedorUI ? <FiltroSelect etiqueta="Proveedor" valor={proveedor} opciones={opcionesProveedor} onChange={setProveedor} /> : null}
              <FiltroSelect etiqueta="Tipo" valor={tipo} opciones={tipos.map((t) => ({ valor: t, etiqueta: t }))} onChange={setTipo} />
              {hayFiltros ? (
                <button
                  type="button"
                  onClick={() => { quitarFiltros(); setFiltrosAbiertos(false); }}
                  className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-[#3A3A36] text-[11.5px] font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Quitar todos los filtros
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {hayFiltros ? (
          <button type="button" onClick={quitarFiltros} className="text-[11.5px] font-semibold text-[#8F908A] hover:text-[#F5F5F5]">Quitar filtros</button>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
        <div className={`hidden h-8 items-center border-b border-[#2E2F28] bg-[#1A1B17] text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] md:grid ${COLUMNAS}`}>
          <span className="px-2">Tipo</span>
          <span className="px-2">Artículo</span>
          <span className="px-2">{esProveedorUI ? "Packing" : "Proveedor"}</span>
          <span className="px-2 text-right">Registrada</span>
          <span className="flex justify-center" title="Evidencias"><Camera className="h-3.5 w-3.5" aria-label="Evidencias" /></span>
          <span />
        </div>
        {filtradas.map((n) => (
          <NovedadFila
            key={n.id}
            novedad={n}
            rol={rol}
            canRespond={canRespond}
            busy={busy}
            vistaBloqueadas={soloBloqueadas}
            enlazarArticulo={isStaff}
            onAccion={abrirAccion}
            onRefrescar={() => router.refresh()}
          />
        ))}
        {filtradas.length === 0 ? (
          <div className="px-3 py-8 text-center text-[13px] text-[#8F908A]">
            {hayFiltros ? <>Nada coincide. <button type="button" onClick={quitarFiltros} className="font-semibold text-[#D7FF4F] hover:underline">Quitar filtros</button></> : "Sin novedades aquí."}
          </div>
        ) : null}
      </section>

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
