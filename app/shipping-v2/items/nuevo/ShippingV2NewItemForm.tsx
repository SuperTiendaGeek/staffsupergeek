"use client";

// Registrar compra (auditoría Shipping V2, punto 9d · 14-oct-2026).
//
// Una sola pantalla para registrar VARIOS artículos de una misma compra:
//   · Arriba la ORDEN DE COMPRA (origen, proveedor, nº de orden o factura,
//     fecha) y su llegada (solo, en caja, casillero y rastreos): se escribe una
//     vez para todos los artículos.
//   · Abajo una FILA por artículo con lo que cambia (nombre, categoría,
//     condición, cantidad, costo, precio). La flecha abre el resto (marca,
//     modelo, serie, SKU, inspección, regalo, activo, fotos, descripción).
//   · El PAGO se registra una vez contra la orden, por su total (no se escribe).
// Reajuste y despiece no son compras: misma pantalla, sin orden ni pago.
//
// Al guardar, el navegador crea la orden, luego los artículos de uno en uno
// (con progreso, para no pasar el tiempo límite de Vercel con 30 artículos) y
// al final el pago. Si una fila falla, lo creado queda en su orden y las filas
// creadas salen de la tabla: se corrige y se vuelve a guardar.
//
// Diseño aprobado por el dueño (boceto 2, 14-oct): lima = la orden; neutro =
// artículos; verde = el pago; amarillo = lo que falta completar; azul = cargar
// la lista desde una hoja (entrega 2, 15-oct: pegar, subir .xlsx/.csv y
// plantilla; ver ImportarLineasPanel). Pantalla de uso diario: etiquetas
// cortas, ayuda en tooltips, uso número 100.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import {
  SHIPPING_V2_CATEGORIAS,
  SHIPPING_V2_CONDICIONES,
  SHIPPING_V2_UNIDADES,
  type ShippingV2Proveedor,
} from "@/types/shipping-v2";
import { normalizeItemNameFast } from "@/lib/shipping-v2/item-name-normalizer";
import { requiereInspeccionPorDefecto } from "@/lib/shipping-v2/item-venta";
import {
  ORIGEN_EXTRANJERO,
  ORIGEN_LOCAL,
  ORIGEN_TIENDA,
  ORIGENES_ARTICULO,
  TIPOS_OPERACION_POR_ORIGEN,
  origenSegunZona,
  type OrigenArticulo,
} from "@/lib/shipping-v2/item-origen";
import { esProveedorLogistico } from "@/lib/shipping-v2/provider-types";
import { getShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";
import { ACCEPT_FOTOS_ITEM, validarSeleccionFotosItem } from "@/lib/shipping-v2/fotos-item";
import { FotosInvalidasError, subirFotosItem } from "@/lib/shipping-v2/subir-fotos-item";
import { validarRespaldo } from "@/lib/shipping-v2/pagos-situacion";
import {
  aplicarATodas,
  duplicarLinea,
  faltantesLinea,
  lineaEnBlanco,
  nuevaLinea,
  subtotalLinea,
  totalesLineas,
  type LineaCompra,
} from "@/lib/shipping-v2/ordenes-compra";
import { SHIPPING_V2_PAYMENT_SELECT_OPTIONS } from "@/lib/shipping-v2/schema.generated";
import { ACCEPT_HOJAS, ImportarLineasPanel, type EntradaImportacion } from "./ImportarLineasPanel";

const METODOS_PAGO = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.metodoPago.filter((m) => m !== "No aplica");
const CUENTAS_PAGO = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen.filter((c) => c !== "No aplica");
const COMPRA = "Compra a proveedor";
const REGALO = "Regalo de proveedor";
const DESPIECE = "Despiece de equipo";
const CONDICION_INICIAL = SHIPPING_V2_CONDICIONES[0] ?? "";
const SIN_RECORDADO: Record<string, string> = {};

function hoyLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Caja (packing "En Proceso") a la que se pueden agregar los artículos al registrarlos. */
export type ShippingV2CajaAbierta = {
  id: string;
  codigo: string;
  nombre: string;
  proveedorResponsableId?: string;
  proveedorLogisticoEcId?: string;
};

/** Punto 9d: orden ya creada a la que se agregan artículos ("+ Agregar artículo" en la orden). */
export type ShippingV2OrdenParaAgregar = {
  id: string;
  ocId: string;
  proveedorId: string;
  proveedorNombre: string;
  numeroProveedor?: string;
  fechaCompra?: string;
  /** Lo que la orden ya debe (artículos sin pago vivo). */
  falta: number;
};

type Props = {
  proveedores: ShippingV2Proveedor[];
  cajasAbiertas: ShippingV2CajaAbierta[];
  /** Punto 4: llega desde "Registrar activo" (pestaña Activos de la tienda). */
  esActivoInicial?: boolean;
  /** Punto 9: solo quien maneja Pagos puede registrar el respaldo al registrar. */
  puedeRegistrarRespaldo?: boolean;
  /** Punto 9d: agregar a una orden existente. */
  ordenExistente?: ShippingV2OrdenParaAgregar | null;
};

type SelectedPhoto = { id: string; file: File; previewUrl: string };
type ViajeOpcion = "solo" | "caja" | "nose";
type RespaldoOpcion = "despues" | "ahora";

type Cabecera = {
  origen: OrigenArticulo | "";
  operacion: string;
  proveedorId: string;
  numeroProveedor: string;
  fechaCompra: string;
  // Llegada (solo si viene de afuera)
  viaje: ViajeOpcion;
  packingDestinoId: string;
  casilleroId: string;
  trackingOrigen: string;
  transportistaOrigenId: string;
  trackingEcuador: string;
  transportistaEcuadorId: string;
  trackingLocal: string;
  // Pago (punto 9d: contra la orden)
  respaldo: RespaldoOpcion;
  respaldoFecha: string;
  respaldoMetodo: string;
  respaldoCuenta: string;
  respaldoTransaccion: string;
  respaldoComprobanteUrl: string;
};

const ORIGEN_CORTO: Record<OrigenArticulo, string> = {
  [ORIGEN_TIENDA]: "En tienda",
  [ORIGEN_EXTRANJERO]: "Extranjero",
  [ORIGEN_LOCAL]: "Local",
};

const ORIGEN_AYUDA: Record<OrigenArticulo, string> = {
  [ORIGEN_TIENDA]: "Ya está aquí: nace recibido.",
  [ORIGEN_EXTRANJERO]: "Viene de fuera del país (casillero).",
  [ORIGEN_LOCAL]: "Proveedor en Ecuador.",
};

const OPERACION_CORTA: Record<string, string> = {
  [COMPRA]: "Compra",
  "Reajuste de inventario": "Reajuste",
  [DESPIECE]: "Despiece",
};

const inputBase = "h-8 w-full rounded-md border bg-[#151515] px-2 text-[13px] text-[#F5F5F5] outline-none placeholder:text-[#5E5F59] transition";

function Seg<T extends string>({ value, options, onChange, invalid }: {
  value: T | "";
  options: ReadonlyArray<{ value: T; label: string; title?: string }>;
  onChange: (value: T) => void;
  invalid?: boolean;
}) {
  return (
    <div role="radiogroup" className={`inline-flex w-full overflow-hidden rounded-md border ${invalid ? "border-[#FF914D]/70" : "border-[#3A3A36]"}`}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} title={o.title} onClick={() => onChange(o.value)}
            className={`h-8 flex-1 whitespace-nowrap border-r border-[#3A3A36] px-2 text-[12.5px] font-semibold transition last:border-r-0 ${on ? "bg-[#D7FF4F] text-[#151515]" : "bg-[#151515] text-[#B4B5AC] hover:text-[#D7FF4F]"}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children, required, error, className = "", grupo = false }: {
  label: string; children: ReactNode; required?: boolean; error?: string; className?: string; grupo?: boolean;
}) {
  const Tag = grupo ? "div" : "label";
  return (
    <Tag className={`block min-w-0 ${className}`}>
      <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">
        {label}
        {required ? <span className="ml-0.5 text-[#FF914D]">*</span> : null}
        {error ? <span className="ml-1.5 normal-case tracking-normal text-[#FFB07A]">{error}</span> : null}
      </span>
      {children}
    </Tag>
  );
}

function TextInput({ invalid, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} className={`${inputBase} ${invalid ? "border-[#F4C95B]/70" : "border-[#3A3A36] focus:border-[#D7FF4F]/70"} ${className}`} />;
}

function SelectInput({ invalid, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select {...props} className={`${inputBase} ${invalid ? "border-[#F4C95B]/70 text-[#F4C95B]" : "border-[#3A3A36] focus:border-[#D7FF4F]/70"} ${className}`} />;
}

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

let contadorFilas = 0;
function claveFila() {
  contadorFilas += 1;
  return `f${Date.now().toString(36)}${contadorFilas}`;
}

export function ShippingV2NewItemForm({ proveedores, cajasAbiertas, esActivoInicial = false, puedeRegistrarRespaldo = false, ordenExistente = null }: Props) {
  const router = useRouter();
  const proveedorOrden = ordenExistente ? proveedores.find((p) => p.id === ordenExistente.proveedorId) : undefined;
  const [cab, setCab] = useState<Cabecera>({
    origen: ordenExistente && proveedorOrden ? origenSegunZona(proveedorOrden.paisZonaLogistica) : "",
    operacion: COMPRA,
    proveedorId: ordenExistente?.proveedorId ?? "",
    numeroProveedor: ordenExistente?.numeroProveedor ?? "",
    fechaCompra: ordenExistente?.fechaCompra ?? hoyLocal(),
    viaje: "nose",
    packingDestinoId: "",
    casilleroId: "",
    trackingOrigen: "",
    transportistaOrigenId: "",
    trackingEcuador: "",
    transportistaEcuadorId: "",
    trackingLocal: "",
    respaldo: "despues",
    respaldoFecha: hoyLocal(),
    respaldoMetodo: "Transferencia bancaria",
    respaldoCuenta: "",
    respaldoTransaccion: "",
    respaldoComprobanteUrl: "",
  });
  const [lineas, setLineas] = useState<LineaCompra[]>(() => [nuevaLinea(claveFila(), { condicion: CONDICION_INICIAL, activo: esActivoInicial })]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Record<string, SelectedPhoto[]>>({});
  const fotosRef = useRef<Record<string, SelectedPhoto[]>>({});
  const [aplicar, setAplicar] = useState({ categoria: "", condicion: "" });
  const [error, setError] = useState("");
  const [progreso, setProgreso] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Si falla una fila a mitad de camino, lo creado queda en esta orden y se sigue en ella.
  const [ordenEnCurso, setOrdenEnCurso] = useState<{ id: string; ocId: string } | null>(ordenExistente ? { id: ordenExistente.id, ocId: ordenExistente.ocId } : null);
  const [creados, setCreados] = useState<string[]>([]);
  // Entrega 2: cargar la lista desde una hoja.
  const [importar, setImportar] = useState<EntradaImportacion | null>(null);
  const [importado, setImportado] = useState<{ n: number; avisos: string[] } | null>(null);
  const [recordadosLocales, setRecordadosLocales] = useState<Record<string, Record<string, string>>>({});

  const origen = cab.origen || null;
  const vieneDeAfuera = origen === ORIGEN_EXTRANJERO || origen === ORIGEN_LOCAL;
  const esCompra = cab.operacion === COMPRA;
  const esDespiece = cab.operacion === DESPIECE;
  // Regalo: en tienda y extranjero (regla del 4-oct). Antes de elegir el origen
  // también se ofrece, para no perder los regalos de una lista cargada primero.
  const permiteRegalo = !origen || TIPOS_OPERACION_POR_ORIGEN[origen].includes(REGALO);
  const fijo = Boolean(ordenEnCurso);
  const activos = proveedores.filter((p) => (p.estado || "").toLowerCase() === "activo");

  const proveedoresCompra = useMemo(() => {
    const compra = proveedores.filter(canBePurchaseProvider);
    if (origen === ORIGEN_EXTRANJERO || origen === ORIGEN_LOCAL) return compra.filter((p) => origenSegunZona(p.paisZonaLogistica) === origen);
    return compra;
  }, [proveedores, origen]);
  const casilleros = activos.filter((p) => p.esCasillero === true);
  const logisticos = activos.filter((p) => esProveedorLogistico(p));
  const transportistasOrigen = logisticos.filter((p) => p.esCasillero !== true && origenSegunZona(p.paisZonaLogistica) === ORIGEN_EXTRANJERO);
  const transportistasEcuador = logisticos.filter((p) => p.esCasillero === true || origenSegunZona(p.paisZonaLogistica) === ORIGEN_LOCAL);
  const transportistasEc = transportistasEcuador.length ? transportistasEcuador : logisticos;

  // Operaciones según el origen: compra (con o sin regalos en sus filas), y en
  // la tienda también reajuste y despiece. El regalo se marca en cada fila.
  const operaciones = origen ? TIPOS_OPERACION_POR_ORIGEN[origen].filter((t) => t !== REGALO) : [COMPRA];
  // Orientación por origen: lo de la orden existente solo admite su zona o la tienda.
  const origenesPermitidos = ordenExistente && proveedorOrden
    ? ORIGENES_ARTICULO.filter((o) => o === ORIGEN_TIENDA || o === origenSegunZona(proveedorOrden.paisZonaLogistica))
    : ORIGENES_ARTICULO;

  const proveedorSel = proveedores.find((p) => p.id === cab.proveedorId) ?? null;
  const columnasRecordadas = (cab.proveedorId && recordadosLocales[cab.proveedorId]) || proveedorSel?.columnasImportacion || SIN_RECORDADO;

  const cajasCompatibles = cajasAbiertas.filter((caja) => {
    const ids = new Set([caja.proveedorResponsableId, caja.proveedorLogisticoEcId].filter(Boolean));
    if (!ids.size) return true;
    return (cab.proveedorId && ids.has(cab.proveedorId)) || (cab.casilleroId && ids.has(cab.casilleroId));
  });

  const lineasUsadas = lineas.filter((l) => !lineaEnBlanco(l));
  const totales = totalesLineas(lineasUsadas);
  const faltantesPorLinea = new Map(lineas.map((l) => [l.key, lineaEnBlanco(l) ? [] : faltantesLinea(l, { esCompra })]));
  const porCompletar = lineasUsadas.filter((l) => (faltantesPorLinea.get(l.key) ?? []).length > 0).length;
  const montoPago = Math.round(((ordenExistente?.falta ?? 0) + totales.total) * 100) / 100;
  const pidePago = esCompra && puedeRegistrarRespaldo && montoPago > 0;
  const respaldoAhora = pidePago && cab.respaldo === "ahora";
  const errorRespaldo = respaldoAhora
    ? validarRespaldo({ fechaPagoReal: cab.respaldoFecha, metodoPago: cab.respaldoMetodo, cuentaOrigen: cab.respaldoCuenta })
    : null;

  const requisitos: string[] = [
    ...(cab.origen ? [] : ["Elige el origen."]),
    ...(esCompra && !cab.proveedorId ? ["Elige el proveedor de la compra."] : []),
    ...(lineasUsadas.length ? [] : ["Escribe al menos un artículo."]),
    ...(porCompletar ? [`${porCompletar} artículo(s) por completar (en amarillo).`] : []),
    ...(vieneDeAfuera && cab.viaje === "caja" && !cab.packingDestinoId ? ["Elige la caja en la que viajan, o marca que viajan solos."] : []),
    ...(errorRespaldo ? [`Pago: ${errorRespaldo}`] : []),
  ];

  // Al cambiar el origen: el proveedor y la operación deben seguir siendo
  // válidos, y lo extranjero propone el primer casillero activo.
  useEffect(() => {
    setCab((c) => {
      const next = { ...c };
      if (!fijo && c.proveedorId && !proveedoresCompra.some((p) => p.id === c.proveedorId)) next.proveedorId = "";
      if (!operaciones.includes(c.operacion)) next.operacion = operaciones[0] ?? COMPRA;
      if (c.origen === ORIGEN_EXTRANJERO && !c.casilleroId && casilleros[0]) next.casilleroId = casilleros[0].id;
      if (c.origen !== ORIGEN_EXTRANJERO && c.casilleroId) next.casilleroId = "";
      const changed = (Object.keys(next) as Array<keyof Cabecera>).some((k) => next[k] !== c[k]);
      return changed ? next : c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cab.origen, proveedoresCompra.length]);

  useEffect(() => {
    if (cab.packingDestinoId && !cajasCompatibles.some((c) => c.id === cab.packingDestinoId)) setC("packingDestinoId", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cab.proveedorId, cab.casilleroId]);

  // Sin regalo en el origen (local) o en despiece sin activos: se limpian las marcas.
  useEffect(() => {
    setLineas((ls) => ls.map((l) => ({
      ...l,
      regalo: permiteRegalo && esCompra ? l.regalo : false,
      activo: esDespiece ? false : l.activo,
    })));
  }, [permiteRegalo, esCompra, esDespiece]);

  useEffect(() => { fotosRef.current = fotos; }, [fotos]);
  useEffect(() => () => {
    Object.values(fotosRef.current).flat().forEach((f) => URL.revokeObjectURL(f.previewUrl));
  }, []);

  function setC<K extends keyof Cabecera>(key: K, value: Cabecera[K]) {
    setCab((c) => ({ ...c, [key]: value }));
  }

  function setL(key: string, cambios: Partial<LineaCompra>) {
    setLineas((ls) => ls.map((l) => {
      if (l.key !== key) return l;
      const next = { ...l, ...cambios };
      // Al cambiar la categoría, el activo o el regalo se vuelve a proponer la inspección.
      if ("categoria" in cambios || "activo" in cambios) next.requiereInspeccion = cambios.requiereInspeccion ?? null;
      if (cambios.regalo === true) next.costoProveedor = "";
      return next;
    }));
  }

  function agregarFila() {
    const ultima = lineas[lineas.length - 1];
    const key = claveFila();
    setLineas((ls) => [...ls, nuevaLinea(key, { condicion: ultima?.condicion || CONDICION_INICIAL, activo: esActivoInicial && !esDespiece })]);
  }

  function duplicarFila(l: LineaCompra) {
    const key = claveFila();
    setLineas((ls) => {
      const i = ls.findIndex((x) => x.key === l.key);
      const copia = duplicarLinea(l, key);
      return [...ls.slice(0, i + 1), copia, ...ls.slice(i + 1)];
    });
  }

  function quitarFila(key: string) {
    (fotos[key] ?? []).forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setFotos((m) => { const n = { ...m }; delete n[key]; return n; });
    setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [nuevaLinea(claveFila(), { condicion: CONDICION_INICIAL, activo: esActivoInicial })]));
    if (abierta === key) setAbierta(null);
  }

  function aplicarATodasLasFilas() {
    if (!aplicar.categoria && !aplicar.condicion) return;
    setLineas((ls) => aplicarATodas(ls, aplicar));
  }

  function abrirImportar(datos: { texto?: string; archivo?: File }) {
    setImportado(null);
    setImportar((actual) => ({ n: (actual?.n ?? 0) + 1, ...datos }));
  }

  /** Las filas de la hoja entran a la tabla (reemplazan las filas vacías). */
  function agregarImportadas(parciales: Array<Partial<LineaCompra>>, avisos: string[]) {
    const regaloPermitido = permiteRegalo && esCompra;
    const regalosQuitados = regaloPermitido ? 0 : parciales.filter((p) => p.regalo).length;
    const nuevas = parciales.map((p) => nuevaLinea(claveFila(), {
      condicion: CONDICION_INICIAL,
      activo: esActivoInicial && !esDespiece,
      ...p,
      regalo: regaloPermitido ? Boolean(p.regalo) : false,
    }));
    setLineas((ls) => [...ls.filter((l) => !lineaEnBlanco(l) || (fotos[l.key]?.length ?? 0) > 0), ...nuevas]);
    setImportado({
      n: nuevas.length,
      avisos: regalosQuitados ? [...avisos, `${regalosQuitados} regalo(s) quedan como compra (aquí no se marcan regalos): escribe su costo.`] : avisos,
    });
    setImportar(null);
  }

  async function recordarColumnas(columnas: Record<string, string>) {
    const id = cab.proveedorId;
    if (!id) return;
    try {
      const res = await fetch(`/api/shipping-v2/proveedores/${id}/columnas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnas }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) throw new Error(String(payload.error || "error inesperado"));
      setRecordadosLocales((m) => ({ ...m, [id]: payload.data as Record<string, string> }));
    } catch (e) {
      setImportado((x) => (x ? { ...x, avisos: [...x.avisos, `No se pudieron recordar las columnas (${e instanceof Error ? e.message : "error"}).`] } : x));
    }
  }

  async function descargarPlantilla() {
    const [{ crearPlantillaXlsx }, { columnasPlantilla }] = await Promise.all([
      import("@/lib/shipping-v2/hoja-xlsx"),
      import("@/lib/shipping-v2/importar-lineas"),
    ]);
    const bytes = crearPlantillaXlsx(columnasPlantilla(SHIPPING_V2_CATEGORIAS, SHIPPING_V2_CONDICIONES));
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Plantilla compra SUPER GEEK.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function addPhotos(key: string, files: File[]) {
    setError("");
    if (!files.length) return;
    const actuales = fotos[key] ?? [];
    const validacion = validarSeleccionFotosItem(files.map((f) => ({ name: f.name, type: f.type, size: f.size })), { yaSubidas: actuales.length });
    if (!validacion.ok) { setError(validacion.motivo); return; }
    const vistos = new Set(actuales.map((p) => `${p.file.name}:${p.file.size}:${p.file.lastModified}`));
    const nuevas: SelectedPhoto[] = [];
    for (const file of files) {
      const id = `${file.name}:${file.size}:${file.lastModified}`;
      if (vistos.has(id)) continue;
      vistos.add(id);
      nuevas.push({ id: `${id}:${crypto.randomUUID()}`, file, previewUrl: URL.createObjectURL(file) });
    }
    if (nuevas.length) setFotos((m) => ({ ...m, [key]: [...(m[key] ?? []), ...nuevas] }));
  }

  function removePhoto(key: string, id: string) {
    setFotos((m) => {
      const foto = (m[key] ?? []).find((p) => p.id === id);
      if (foto) URL.revokeObjectURL(foto.previewUrl);
      return { ...m, [key]: (m[key] ?? []).filter((p) => p.id !== id) };
    });
  }

  function requiereInspeccionDe(l: LineaCompra) {
    if (l.requiereInspeccion !== null) return l.requiereInspeccion;
    if (l.activo) return false;
    return requiereInspeccionPorDefecto({ categoria: l.categoria, tipoOperacion: l.regalo ? REGALO : cab.operacion });
  }

  function camposArticulo(l: LineaCompra): Record<string, string> {
    const extranjero = cab.origen === ORIGEN_EXTRANJERO;
    const local = cab.origen === ORIGEN_LOCAL;
    const enCaja = vieneDeAfuera && cab.viaje === "caja";
    return {
      origenArticulo: cab.origen,
      proveedorId: cab.proveedorId,
      categoria: l.categoria,
      tipoOperacion: esCompra ? (l.regalo ? REGALO : COMPRA) : cab.operacion,
      nombre: l.nombre,
      sku: l.sku,
      skuProveedor: l.skuProveedor,
      marca: l.marca,
      modelo: l.modelo,
      numeroSerie: l.numeroSerie,
      condicion: l.condicion,
      requiereInspeccion: String(requiereInspeccionDe(l)),
      cantidad: l.cantidad,
      unidad: l.unidad,
      costoProveedor: l.regalo ? "" : l.costoProveedor,
      // Un activo no se vende: no lleva precio.
      precioVentaSugerido: l.activo ? "" : l.precioVentaSugerido,
      precioVentaFinal: l.activo ? "" : l.precioVentaFinal,
      usoLocal: l.activo ? "true" : "false",
      descripcion: l.descripcion,
      observacionesInternas: l.observacionesInternas,
      proveedorLogisticoId: extranjero ? cab.casilleroId : "",
      trackingHaciaIntermediario: extranjero ? cab.trackingOrigen : "",
      transportistaOrigenId: extranjero ? cab.transportistaOrigenId : "",
      // Si viaja en una caja, el tramo a Ecuador lo gobierna la caja.
      trackingDesdeIntermediario: extranjero && !enCaja ? cab.trackingEcuador : "",
      trackingDirecto: local && !enCaja ? cab.trackingLocal : "",
      transportistaEcuadorId: (extranjero || local) && !enCaja ? cab.transportistaEcuadorId : "",
      packingDestinoId: enCaja ? cab.packingDestinoId : "",
      respaldoAhora: "false",
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitAttempted(true);
    if (requisitos.length) {
      setError(requisitos.map((r) => `· ${r}`).join("\n"));
      return;
    }
    setSaving(true);
    const avisos: string[] = [];
    let orden = ordenEnCurso;
    const yaCreados = [...creados];

    // 1. La orden (solo compras).
    if (esCompra && !orden) {
      setProgreso("Creando la orden…");
      const res = await fetch("/api/shipping-v2/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedorId: cab.proveedorId, numeroProveedor: cab.numeroProveedor, fechaCompra: cab.fechaCompra }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setError(String(payload.error || "No se pudo crear la orden."));
        setSaving(false);
        setProgreso("");
        return;
      }
      orden = { id: String(payload.data.id), ocId: String(payload.data.ocId) };
      setOrdenEnCurso(orden);
    }

    // 2. Los artículos, de uno en uno.
    const pendientes = [...lineasUsadas];
    for (let i = 0; i < pendientes.length; i++) {
      const l = pendientes[i];
      setProgreso(`Creando ${i + 1} de ${pendientes.length}…`);
      const formData = new FormData();
      Object.entries(camposArticulo(l)).forEach(([k, v]) => formData.set(k, v));
      if (orden && esCompra) formData.set("ordenCompraId", orden.id);
      const res = await fetch("/api/shipping-v2/items", { method: "POST", body: formData });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        const nombre = l.nombre.trim() || `fila ${i + 1}`;
        // Si la orden recién creada se quedó vacía, se borra para no dejar basura.
        if (orden && esCompra && !ordenExistente && yaCreados.length === 0) {
          await fetch(`/api/shipping-v2/ordenes/${orden.id}`, { method: "DELETE" }).catch(() => undefined);
          setOrdenEnCurso(null);
        }
        setError(`${nombre}: ${String(payload.error || "no se pudo crear.")}${yaCreados.length ? `\nYa quedaron creados: ${yaCreados.join(", ")}${orden ? ` en ${orden.ocId}` : ""}. Corrige y vuelve a guardar: solo se crea lo que falta.` : ""}`);
        setSaving(false);
        setProgreso("");
        return;
      }
      const creado = payload.data as { id?: string; sku?: string } | undefined;
      yaCreados.push(creado?.sku || "artículo");
      setCreados([...yaCreados]);
      if (payload.packingWarning) avisos.push(String(payload.packingWarning));
      const fotosFila = fotos[l.key] ?? [];
      if (fotosFila.length && creado?.id) {
        setProgreso(`Subiendo fotos de ${creado.sku || `la fila ${i + 1}`}…`);
        try {
          const r = await subirFotosItem(creado.id, fotosFila.map((f) => f.file));
          if (r.aviso) avisos.push(`${creado.sku}: ${r.aviso}`);
        } catch (e) {
          avisos.push(`${creado.sku}: las fotos no subieron${e instanceof FotosInvalidasError || e instanceof Error ? ` (${e.message})` : ""}.`);
        }
      }
      // La fila creada sale de la tabla: si algo falla después, no se repite.
      fotosFila.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      setFotos((m) => { const n = { ...m }; delete n[l.key]; return n; });
      setLineas((ls) => ls.filter((x) => x.key !== l.key));
    }

    // 3. El pago contra la orden.
    let textoPago = "";
    if (orden && esCompra && respaldoAhora) {
      setProgreso("Registrando el pago…");
      const res = await fetch(`/api/shipping-v2/ordenes/${orden.id}/pago`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaPagoReal: cab.respaldoFecha,
          metodoPago: cab.respaldoMetodo,
          cuentaOrigen: cab.respaldoCuenta,
          transaccionId: cab.respaldoTransaccion,
          comprobanteUrl: cab.respaldoComprobanteUrl,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) avisos.push(`El pago no se registró: ${String(payload.error || "error inesperado")}. Regístralo en la orden.`);
      else textoPago = ` · Pago ${payload.data?.pagoId ?? ""} ${money(typeof payload.data?.totalAPagar === "number" ? payload.data.totalAPagar : montoPago)}`;
    }

    const quien = esActivoInicial ? "Activo(s)" : "Artículo(s)";
    const notice = `${orden ? `${orden.ocId}: ` : ""}${quien} ${yaCreados.join(", ")} creado(s)${textoPago}.${avisos.length ? ` ${avisos.join(" ")}` : ""}`;
    window.sessionStorage.setItem("shipping-v2:notice", notice);
    if (orden && esCompra) router.push(`/shipping-v2/pagos/ordenes/${orden.id}`);
    else router.push(esActivoInicial ? "/shipping-v2/activos" : "/shipping-v2/items");
    router.refresh();
  }

  const resumen = [
    `${lineasUsadas.length} ${lineasUsadas.length === 1 ? "artículo" : "artículos"}${totales.unidades !== lineasUsadas.length ? ` · ${totales.unidades} u.` : ""}`,
    origen === ORIGEN_TIENDA ? "Recibido" : null,
    vieneDeAfuera ? (cab.viaje === "caja" && cab.packingDestinoId ? `En caja ${cajasCompatibles.find((c) => c.id === cab.packingDestinoId)?.codigo ?? ""}` : "Por llegar") : null,
    vieneDeAfuera && cab.viaje !== "caja" && (cab.trackingOrigen || cab.trackingEcuador || cab.trackingLocal) ? "En tránsito" : null,
  ].filter(Boolean) as string[];

  const chip = "whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold";
  const errorPorCampo = submitAttempted;

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full max-w-none space-y-2 pb-16">
      {error ? <div className="whitespace-pre-line rounded-md border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{error}</div> : null}

      {/* ── Orden de compra (lima) ─────────────────────────────────────────── */}
      <section className="rounded-lg border border-[#D7FF4F]/45 bg-[#171814] px-3 pb-3 pt-2">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#D7FF4F]">{esCompra ? "Orden de compra" : "Ingreso sin compra"}</h2>
          <span className="ml-auto text-[11px] text-[#7E7F76]">
            {ordenEnCurso ? <b className="text-[#D7FF4F]">{ordenEnCurso.ocId}</b> : esCompra ? "OC nueva" : "sin orden ni pago"}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-12">
          <Field label="Origen" grupo required error={errorPorCampo && !cab.origen ? "Elige uno" : undefined} className="xl:col-span-4">
            <Seg<OrigenArticulo>
              value={cab.origen}
              invalid={errorPorCampo && !cab.origen}
              onChange={(v) => setC("origen", v)}
              options={origenesPermitidos.map((o) => ({ value: o, label: ORIGEN_CORTO[o], title: ORIGEN_AYUDA[o] }))}
            />
          </Field>
          {operaciones.length > 1 && !fijo ? (
            <Field label="Tipo" grupo className="xl:col-span-3">
              <Seg<string>
                value={cab.operacion}
                onChange={(v) => setC("operacion", v)}
                options={operaciones.map((o) => ({ value: o, label: OPERACION_CORTA[o] ?? o, title: o === COMPRA ? "Compra a un proveedor (los regalos se marcan en cada fila)." : o }))}
              />
            </Field>
          ) : null}
          <Field label="Proveedor" required={esCompra} error={errorPorCampo && esCompra && !cab.proveedorId ? "Obligatorio" : undefined} className={operaciones.length > 1 && !fijo ? "xl:col-span-5" : "xl:col-span-3"}>
            {fijo && ordenExistente ? (
              <div className={`${inputBase} flex items-center border-[#3A3A36] text-[#E6E6E1]`}>{ordenExistente.proveedorNombre}</div>
            ) : (
              <SelectInput value={cab.proveedorId} onChange={(e) => setC("proveedorId", e.target.value)} disabled={!origen || fijo} invalid={errorPorCampo && esCompra && !cab.proveedorId}>
                <option value="">{origen ? (esCompra ? "—" : "Sin proveedor") : "—"}</option>
                {proveedoresCompra.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
              </SelectInput>
            )}
          </Field>
          {esCompra ? (
            <>
              <Field label="Nº de orden o factura" className={operaciones.length > 1 && !fijo ? "xl:col-span-8" : "xl:col-span-3"}>
                <TextInput value={cab.numeroProveedor} onChange={(e) => setC("numeroProveedor", e.target.value)} disabled={fijo} placeholder="eBay 12-34567, factura 6812…" />
              </Field>
              <Field label="Fecha" className={operaciones.length > 1 && !fijo ? "xl:col-span-4" : "xl:col-span-2"}>
                <TextInput type="date" value={cab.fechaCompra} onChange={(e) => setC("fechaCompra", e.target.value)} disabled={fijo} />
              </Field>
            </>
          ) : null}
        </div>

        {vieneDeAfuera ? (
          <div className="mt-2 rounded-md border border-[#2A2B26] bg-[#11120F] px-2 py-1.5">
            <div className="grid items-end gap-2 sm:grid-cols-2 xl:grid-cols-12" title="Un rastreo pasa los artículos a En tránsito.">
              <Field label="Llegada" grupo className="xl:col-span-2">
                <Seg<ViajeOpcion>
                  value={cab.viaje}
                  onChange={(v) => setC("viaje", v)}
                  options={[
                    { value: "solo", label: "Solo" },
                    { value: "caja", label: "En caja", title: "El rastreo de la caja lo gobierna desde que entran." },
                    { value: "nose", label: "Por definir" },
                  ]}
                />
              </Field>
              {cab.viaje === "caja" ? (
                <Field label="Caja" className="xl:col-span-3" error={!cajasCompatibles.length ? "Sin cajas abiertas: créala en Logística" : undefined}>
                  <SelectInput value={cab.packingDestinoId} onChange={(e) => setC("packingDestinoId", e.target.value)} invalid={errorPorCampo && !cab.packingDestinoId}>
                    <option value="">—</option>
                    {cajasCompatibles.map((c) => <option key={c.id} value={c.id}>{c.codigo}{c.nombre ? ` · ${c.nombre}` : ""}</option>)}
                  </SelectInput>
                </Field>
              ) : null}
              {origen === ORIGEN_EXTRANJERO ? (
                <>
                  <Field label="Casillero" className="xl:col-span-2">
                    <SelectInput value={cab.casilleroId} onChange={(e) => setC("casilleroId", e.target.value)}>
                      <option value="">Sin casillero</option>
                      {casilleros.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                    </SelectInput>
                  </Field>
                  <Field label="Rastreo → casillero" className="xl:col-span-2">
                    <TextInput value={cab.trackingOrigen} onChange={(e) => setC("trackingOrigen", e.target.value)} />
                  </Field>
                  <Field label="Transportista origen" className="xl:col-span-2">
                    <SelectInput value={cab.transportistaOrigenId} onChange={(e) => setC("transportistaOrigenId", e.target.value)}>
                      <option value="">—</option>
                      {(transportistasOrigen.length ? transportistasOrigen : logisticos).map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                    </SelectInput>
                  </Field>
                  {cab.viaje !== "caja" ? (
                    <>
                      <Field label="Rastreo → Ecuador" className="xl:col-span-2">
                        <TextInput value={cab.trackingEcuador} onChange={(e) => setC("trackingEcuador", e.target.value)} />
                      </Field>
                      <Field label="Transportista Ecuador" className="xl:col-span-2">
                        <SelectInput value={cab.transportistaEcuadorId} onChange={(e) => setC("transportistaEcuadorId", e.target.value)}>
                          <option value="">—</option>
                          {transportistasEc.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                        </SelectInput>
                      </Field>
                    </>
                  ) : null}
                </>
              ) : null}
              {origen === ORIGEN_LOCAL && cab.viaje !== "caja" ? (
                <>
                  <Field label="Rastreo" className="xl:col-span-3">
                    <TextInput value={cab.trackingLocal} onChange={(e) => setC("trackingLocal", e.target.value)} />
                  </Field>
                  <Field label="Transportista" className="xl:col-span-3">
                    <SelectInput value={cab.transportistaEcuadorId} onChange={(e) => setC("transportistaEcuadorId", e.target.value)}>
                      <option value="">—</option>
                      {transportistasEc.map((p) => <option key={p.id} value={p.id}>{getShippingV2ProveedorLabel(p)}</option>)}
                    </SelectInput>
                  </Field>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Artículos (neutro) ─────────────────────────────────────────────── */}
      <section className="rounded-lg border border-[#2E2F28] bg-[#171814] px-3 pb-3 pt-2">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#F5F5F5]">Artículos</h2>
          <button type="button" onClick={agregarFila} className="rounded-full border border-[#D7FF4F] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#151515]">+ Agregar</button>
          <button type="button" onClick={() => (importar ? setImportar(null) : abrirImportar({}))} title="Copia las filas en Excel o Google Sheets y pégalas"
            className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold transition ${importar ? "border-[#4FC3FF] bg-[#4FC3FF] text-[#0B1216]" : "border-[#4FC3FF]/70 text-[#4FC3FF] hover:bg-[#4FC3FF]/10"}`}>Pegar desde hoja</button>
          <label title="Excel (.xlsx) o CSV" className="cursor-pointer rounded-full border border-[#4FC3FF]/70 px-2.5 py-0.5 text-[11.5px] font-semibold text-[#4FC3FF] transition hover:bg-[#4FC3FF]/10">
            <input type="file" accept={ACCEPT_HOJAS} className="sr-only" onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) abrirImportar({ archivo: f }); e.target.value = ""; }} />
            Subir archivo
          </label>
          <button type="button" onClick={() => void descargarPlantilla()} title="Excel con las columnas y listas de SUPER GEEK, para pasar ofertas (WhatsApp) a una hoja"
            className="rounded-full border border-[#3A3A36] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#B4B5AC] transition hover:text-[#F5F5F5]">Plantilla</button>
          <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] text-[#8F908A]" title="Pone la categoría y/o la condición en todas las filas.">
            Aplicar a todas
            <select value={aplicar.categoria} onChange={(e) => setAplicar((a) => ({ ...a, categoria: e.target.value }))} className="h-7 rounded-md border border-[#3A3A36] bg-[#151515] px-1.5 text-[12px] text-[#F5F5F5] outline-none" aria-label="Categoría para todas">
              <option value="">Categoría</option>
              {SHIPPING_V2_CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={aplicar.condicion} onChange={(e) => setAplicar((a) => ({ ...a, condicion: e.target.value }))} className="h-7 rounded-md border border-[#3A3A36] bg-[#151515] px-1.5 text-[12px] text-[#F5F5F5] outline-none" aria-label="Condición para todas">
              <option value="">Condición</option>
              {SHIPPING_V2_CONDICIONES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button type="button" onClick={aplicarATodasLasFilas} className="h-7 rounded-md border border-[#3A3A36] px-2 text-[12px] font-semibold text-[#F5F5F5] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">Aplicar</button>
          </div>
        </div>

        {importar ? (
          <ImportarLineasPanel
            key={importar.n}
            entrada={importar}
            proveedor={proveedorSel ? { id: proveedorSel.id, nombre: getShippingV2ProveedorLabel(proveedorSel) } : null}
            recordado={columnasRecordadas}
            condicionPorDefecto={CONDICION_INICIAL}
            onAgregar={agregarImportadas}
            onRecordar={(c) => void recordarColumnas(c)}
            onCerrar={() => setImportar(null)}
          />
        ) : null}
        {importado ? (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-[#4FC3FF]/30 bg-[#4FC3FF]/[0.06] px-2 py-1.5 text-[12px] text-[#BDEAFF]">
            <div className="min-w-0 flex-1">
              Se agregaron {importado.n} artículo(s) de la hoja. Revisa lo que está en amarillo; nada se guarda hasta “{ordenExistente ? `Agregar a ${ordenExistente.ocId}` : esCompra ? "Registrar compra" : "Registrar"}”.
              {importado.avisos.length ? <ul className="mt-0.5 text-[11.5px] text-[#F4C95B]">{importado.avisos.map((a) => <li key={a}>· {a}</li>)}</ul> : null}
            </div>
            <button type="button" onClick={() => setImportado(null)} aria-label="Cerrar aviso" className="text-[14px] leading-none text-[#8F908A] hover:text-[#F5F5F5]">×</button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[22px_minmax(0,1fr)_108px_118px_96px_50px_84px_80px_76px_62px] items-center gap-1.5 rounded bg-[#1E1F19] px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">
              <span>#</span><span>Nombre</span><span>SKU prov.</span><span>Categoría</span><span>Cond.</span><span className="text-right">Cant.</span><span className="text-right">Costo u.</span><span className="text-right">Subtotal</span><span className="text-right">Venta</span><span />
            </div>
            {lineas.map((l, i) => {
              const faltan = faltantesPorLinea.get(l.key) ?? [];
              const marcar = faltan.length > 0 && (submitAttempted || !lineaEnBlanco(l));
              const st = subtotalLinea(l);
              const sugerencia = normalizeItemNameFast(l.nombre);
              const abiertaAqui = abierta === l.key;
              const fotosFila = fotos[l.key] ?? [];
              const inspeccion = requiereInspeccionDe(l);
              return (
                <div key={l.key} className={`border-t border-[#2A2B26] ${marcar ? "bg-[#F4C95B]/[0.06]" : ""}`}>
                  <div className="grid grid-cols-[22px_minmax(0,1fr)_108px_118px_96px_50px_84px_80px_76px_62px] items-start gap-1.5 px-1.5 py-1">
                    <span className="pt-2 text-[11px] tabular-nums text-[#6F706A]" title={marcar ? `Falta: ${faltan.join(", ")}` : undefined}>{marcar ? <span className="text-[#F4C95B]">!</span> : i + 1}</span>
                    <div className="min-w-0">
                      <TextInput value={l.nombre} onChange={(e) => setL(l.key, { nombre: e.target.value })} invalid={marcar && faltan.includes("nombre")} placeholder="Nombre del artículo"
                        onPaste={(e) => {
                          // Varias celdas copiadas de una hoja: se abren en "Cargar lista" en vez de pegarse aquí.
                          const pegado = e.clipboardData.getData("text/plain");
                          if (/[\t\n]/.test(pegado.replace(/\s+$/, ""))) { e.preventDefault(); abrirImportar({ texto: pegado }); }
                        }} />
                      {sugerencia && sugerencia !== l.nombre.trim() ? (
                        <button type="button" onClick={() => setL(l.key, { nombre: sugerencia })} className="mt-0.5 block max-w-full truncate text-left text-[11px] text-[#D7FF4F] hover:underline" title="Usar este nombre">Usar: {sugerencia}</button>
                      ) : null}
                    </div>
                    <TextInput value={l.skuProveedor} onChange={(e) => setL(l.key, { skuProveedor: e.target.value })} placeholder="—" />
                    <SelectInput value={l.categoria} onChange={(e) => setL(l.key, { categoria: e.target.value })} invalid={marcar && faltan.includes("categoría")}>
                      <option value="">Elige</option>
                      {SHIPPING_V2_CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
                    </SelectInput>
                    <SelectInput value={l.condicion} onChange={(e) => setL(l.key, { condicion: e.target.value })}>
                      <option value="">—</option>
                      {SHIPPING_V2_CONDICIONES.map((c) => <option key={c}>{c}</option>)}
                    </SelectInput>
                    <TextInput type="number" min="1" step="1" value={l.cantidad} onChange={(e) => setL(l.key, { cantidad: e.target.value })} invalid={marcar && faltan.includes("cantidad entera")} className="text-right" />
                    {l.regalo ? (
                      <span className="flex h-8 items-center justify-end text-[11px] font-semibold text-[#8F908A]" title="Regalo del proveedor: no suma al pago.">Regalo</span>
                    ) : (
                      <TextInput type="number" min="0" step="0.01" value={l.costoProveedor} onChange={(e) => setL(l.key, { costoProveedor: e.target.value })} invalid={marcar && faltan.includes("costo")} className="text-right" placeholder={esCompra ? "0.00" : "—"} />
                    )}
                    <span className="flex h-8 items-center justify-end text-[12.5px] tabular-nums text-[#E6E6E1]">{l.regalo ? "$0.00" : money(st)}</span>
                    {l.activo ? (
                      <span className="flex h-8 items-center justify-end text-[11px] font-semibold text-[#C9BFFF]" title="Activo de la tienda: no se vende.">Activo</span>
                    ) : (
                      <TextInput type="number" min="0" step="0.01" value={l.precioVentaFinal} onChange={(e) => setL(l.key, { precioVentaFinal: e.target.value })} invalid={marcar && faltan.includes("precio válido")} className="text-right text-[#D7FF4F]" placeholder="—" />
                    )}
                    <div className="flex h-8 items-center justify-end gap-0.5">
                      <button type="button" onClick={() => setAbierta(abiertaAqui ? null : l.key)} aria-label={abiertaAqui ? "Ocultar detalles" : "Más detalles"} title="Marca, modelo, serie, inspección, fotos…"
                        className={`grid h-6 w-6 place-items-center rounded text-[13px] ${abiertaAqui ? "bg-[#D7FF4F] text-[#151515]" : "text-[#8F908A] hover:text-[#D7FF4F]"}`}>
                        {abiertaAqui ? "⌄" : "›"}
                      </button>
                      <button type="button" onClick={() => duplicarFila(l)} aria-label="Duplicar fila" title="Duplicar (casi igual: cambia la serie)" className="grid h-6 w-6 place-items-center rounded text-[12px] text-[#8F908A] hover:text-[#D7FF4F]">⧉</button>
                      <button type="button" onClick={() => quitarFila(l.key)} aria-label="Quitar fila" title="Quitar fila" className="grid h-6 w-6 place-items-center rounded text-[14px] text-[#8F908A] hover:text-[#FFB07A]">×</button>
                    </div>
                  </div>
                  {!abiertaAqui && (fotosFila.length || l.marca || l.modelo || l.numeroSerie || l.regalo || l.activo) ? (
                    <div className="-mt-0.5 flex flex-wrap gap-1 pb-1 pl-8 text-[10.5px] text-[#8F908A]">
                      {[l.marca, l.modelo, l.numeroSerie ? `S/N ${l.numeroSerie}` : ""].filter(Boolean).join(" · ")}
                      {fotosFila.length ? <span>· {fotosFila.length} foto(s)</span> : null}
                      {inspeccion ? <span>· con inspección</span> : null}
                    </div>
                  ) : null}
                  {abiertaAqui ? (
                    <div className="mx-1.5 mb-2 rounded-md border border-[#2A2B26] bg-[#151612] p-2">
                      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-12">
                        <Field label="Marca" className="xl:col-span-2"><TextInput value={l.marca} onChange={(e) => setL(l.key, { marca: e.target.value })} /></Field>
                        <Field label="Modelo" className="xl:col-span-2"><TextInput value={l.modelo} onChange={(e) => setL(l.key, { modelo: e.target.value })} /></Field>
                        <Field label="Nº de serie" className="xl:col-span-2"><TextInput value={l.numeroSerie} onChange={(e) => setL(l.key, { numeroSerie: e.target.value })} /></Field>
                        <Field label="SKU" className="xl:col-span-2"><TextInput value={l.sku} onChange={(e) => setL(l.key, { sku: e.target.value })} placeholder="Automático" /></Field>
                        <Field label="Unidad" className="xl:col-span-2">
                          <SelectInput value={l.unidad} onChange={(e) => setL(l.key, { unidad: e.target.value })}>
                            {SHIPPING_V2_UNIDADES.map((u) => <option key={u}>{u}</option>)}
                          </SelectInput>
                        </Field>
                        {!l.activo ? (
                          <Field label="Precio sugerido" className="xl:col-span-2"><TextInput type="number" min="0" step="0.01" value={l.precioVentaSugerido} onChange={(e) => setL(l.key, { precioVentaSugerido: e.target.value })} /></Field>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[#E6E6E1]">
                        <label className="flex cursor-pointer items-center gap-1.5" title={inspeccion ? "Se vende (o entra en uso) al firmar su ficha de inspección." : "No pasa por Inspección."}>
                          <input type="checkbox" checked={inspeccion} onChange={(e) => setL(l.key, { requiereInspeccion: e.target.checked })} className="h-3.5 w-3.5 accent-[#D7FF4F]" />
                          Requiere inspección
                          {l.requiereInspeccion === null && l.categoria && !l.activo ? <span className="text-[10.5px] text-[#7E7F76]">(por categoría)</span> : null}
                        </label>
                        {esCompra && permiteRegalo ? (
                          <label className="flex cursor-pointer items-center gap-1.5" title="Regalo del proveedor: costo 0, no suma al pago.">
                            <input type="checkbox" checked={l.regalo} onChange={(e) => setL(l.key, { regalo: e.target.checked })} className="h-3.5 w-3.5 accent-[#D7FF4F]" />
                            Regalo
                          </label>
                        ) : null}
                        {!esDespiece ? (
                          <label className={`flex cursor-pointer items-center gap-1.5 ${l.activo ? "text-[#C9BFFF]" : ""}`} title="Activo de la tienda: no se vende y aparece en Activos de la tienda.">
                            <input type="checkbox" checked={l.activo} onChange={(e) => setL(l.key, { activo: e.target.checked })} className="h-3.5 w-3.5 accent-[#8B73FF]" />
                            Uso local (activo)
                          </label>
                        ) : null}
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-12">
                        <Field label="Descripción" className="md:col-span-4">
                          <textarea value={l.descripcion} onChange={(e) => setL(l.key, { descripcion: e.target.value })} rows={2} className="w-full rounded-md border border-[#3A3A36] bg-[#151515] px-2 py-1 text-[13px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70" />
                        </Field>
                        <Field label="Observaciones internas" className="md:col-span-4">
                          <textarea value={l.observacionesInternas} onChange={(e) => setL(l.key, { observacionesInternas: e.target.value })} rows={2} className="w-full rounded-md border border-[#3A3A36] bg-[#151515] px-2 py-1 text-[13px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70" />
                        </Field>
                        <Field label={`Fotos ${fotosFila.length}/10`} grupo className="md:col-span-4">
                          <label onDragOver={(e: DragEvent<HTMLLabelElement>) => e.preventDefault()} onDrop={(e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); addPhotos(l.key, Array.from(e.dataTransfer.files ?? [])); }}
                            title="JPG, PNG o WebP. También puedes arrastrarlas."
                            className="flex h-8 cursor-pointer items-center justify-center rounded-md border border-dashed border-[#D7FF4F]/40 bg-[#151515] text-[12.5px] font-semibold text-[#D7FF4F] transition hover:border-[#D7FF4F]/80">
                            <input type="file" accept={ACCEPT_FOTOS_ITEM} multiple className="sr-only" onChange={(e: ChangeEvent<HTMLInputElement>) => { addPhotos(l.key, Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                            + Agregar fotos
                          </label>
                          {fotosFila.length ? (
                            <div className="mt-1.5 grid grid-cols-5 gap-1">
                              {fotosFila.map((f) => (
                                <div key={f.id} className="relative overflow-hidden rounded border border-[#3A3A36]">
                                  <img src={f.previewUrl} alt={f.file.name} title={f.file.name} className="aspect-square w-full object-cover" />
                                  <button type="button" onClick={() => removePhoto(l.key, f.id)} aria-label={`Quitar ${f.file.name}`} className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded bg-black/70 text-[11px] text-[#F5F5F5] hover:text-[#FFB07A]">×</button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </Field>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        {creados.length ? (
          <p className="mt-2 text-[12px] text-[#9FEFB3]">Ya creados{ordenEnCurso ? ` en ${ordenEnCurso.ocId}` : ""}: {creados.join(", ")}.</p>
        ) : null}
      </section>

      {/* ── Pago (verde) ───────────────────────────────────────────────────── */}
      {pidePago ? (
        <section className="rounded-lg border border-[#7BE495]/40 bg-[#151a13] px-3 pb-3 pt-2">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#9FEFB3]">Pago</h2>
            <span className="ml-auto text-[11px] text-[#7E7F76]" title="El monto es el total de la orden: costo × unidades (los regalos no suman).">
              {ordenExistente && ordenExistente.falta > 0 ? `Incluye ${money(ordenExistente.falta)} que la orden ya debía · ` : ""}un pago, un egreso en Finanzas
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-12">
            <Field label="Respaldo" grupo className="xl:col-span-2">
              <Seg<RespaldoOpcion>
                value={cab.respaldo}
                onChange={(v) => setC("respaldo", v)}
                options={[
                  { value: "despues", label: "Después", title: "La orden queda en Pagos → Falta respaldo." },
                  { value: "ahora", label: "Ahora", title: "Registra el pago y su egreso en Finanzas." },
                ]}
              />
            </Field>
            {cab.respaldo === "ahora" ? (
              <>
                <Field label="Fecha" required className="xl:col-span-2">
                  <TextInput type="date" value={cab.respaldoFecha} onChange={(e) => setC("respaldoFecha", e.target.value)} />
                </Field>
                <Field label="Método" className="xl:col-span-2">
                  <SelectInput value={cab.respaldoMetodo} onChange={(e) => setC("respaldoMetodo", e.target.value)}>
                    {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Cuenta" required error={errorPorCampo && !cab.respaldoCuenta ? "Obligatoria" : undefined} className="xl:col-span-2">
                  <SelectInput value={cab.respaldoCuenta} onChange={(e) => setC("respaldoCuenta", e.target.value)} invalid={errorPorCampo && !cab.respaldoCuenta}>
                    <option value="">—</option>
                    {CUENTAS_PAGO.map((c) => <option key={c} value={c}>{c.trim()}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Nº transacción" className="xl:col-span-1">
                  <TextInput value={cab.respaldoTransaccion} onChange={(e) => setC("respaldoTransaccion", e.target.value)} placeholder="Opcional" />
                </Field>
                <Field label="Enlace comprobante" className="xl:col-span-2">
                  <TextInput value={cab.respaldoComprobanteUrl} onChange={(e) => setC("respaldoComprobanteUrl", e.target.value)} placeholder="Opcional" />
                </Field>
              </>
            ) : null}
            <Field label="Monto" grupo className={cab.respaldo === "ahora" ? "xl:col-span-1" : "xl:col-span-2"}>
              <div className={`${inputBase} flex items-center justify-end border-[#7BE495]/30 font-semibold tabular-nums`} title="Total de la orden">{money(montoPago)}</div>
            </Field>
          </div>
        </section>
      ) : null}

      {/* ── Barra fija ─────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-lg border border-[#2E2F28] bg-[#11120F]/95 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {resumen.map((r) => <span key={r} className={`${chip} border-[#3A3A36] bg-[#1B1C17] text-[#B4B5AC]`}>{r}</span>)}
          {pidePago ? (
            respaldoAhora
              ? <span className={`${chip} border-[#7BE495]/60 text-[#9FEFB3]`}>Con respaldo</span>
              : <span className={`${chip} border-[#3A3A36] text-[#B4B5AC]`}>Falta respaldo</span>
          ) : null}
          {porCompletar ? <span className={`${chip} border-[#F4C95B]/60 text-[#F4C95B]`}>{porCompletar} por completar</span> : null}
          {progreso ? <span className="text-[12px] text-[#D7FF4F]">{progreso}</span> : null}
        </div>
        {esCompra ? (
          <span className="text-[12px] text-[#8F908A]">Total <b className="text-[15px] font-black tabular-nums text-[#F5F5F5]">{money(totales.total)}</b></span>
        ) : null}
        <Link href={ordenExistente ? `/shipping-v2/pagos/ordenes/${ordenExistente.id}` : esActivoInicial ? "/shipping-v2/activos" : "/shipping-v2/items"}
          className="rounded-md border border-[#3A3A36] px-3 py-1.5 text-sm font-semibold text-[#B4B5AC] transition hover:text-[#F5F5F5]">
          Cancelar
        </Link>
        <button type="submit" disabled={saving}
          className="rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-1.5 text-sm font-black text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Guardando…" : ordenExistente ? `Agregar a ${ordenExistente.ocId}` : esCompra ? "Registrar compra" : "Registrar"}
        </button>
      </div>
    </form>
  );
}
