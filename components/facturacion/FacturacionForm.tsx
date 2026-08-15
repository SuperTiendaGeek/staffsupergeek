"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams }             from "next/navigation";
import type { ResultadoPreFactura }    from "@/lib/facturacion/gancho/traductor";
import type { OrigenGancho }           from "@/lib/facturacion/emitirFactura";
import { round2, desglosarPrecioConIvaIncluido } from "@/lib/facturacion/ivaIncluido";
import { mensajePrecioShippingItemInvalido } from "@/lib/facturacion/reglas/preciosShippingItems";
import { ClienteCard, type ClienteDoc } from "@/components/facturacion/ClienteCard";
import { validarIdentificacion } from "@/lib/facturacion/reglas/identificacion";

// ─── Tipos locales ─────────────────────────────────────────────────────────────

type TipoIdentificacion = "04" | "05" | "06" | "07" | "08";

const TIPO_LABEL: Record<TipoIdentificacion, string> = {
  "04": "RUC",
  "05": "Cédula",
  "06": "Pasaporte",
  "07": "Consumidor Final",
  "08": "Identificación del exterior",
};

const FORMAS_PAGO = [
  { codigo: "01", label: "Efectivo" },
  { codigo: "16", label: "Tarjeta de débito" },
  { codigo: "19", label: "Tarjeta de crédito" },
  { codigo: "17", label: "Dinero electrónico" },
  { codigo: "15", label: "Compensación de deudas" },
  { codigo: "18", label: "Tarjeta prepago" },
  { codigo: "20", label: "Otros (sist. financiero)" },
  { codigo: "21", label: "Endoso de títulos" },
];

// codigoPorcentaje SRI: "4"=15%, "2"=0%, "1"=Exento, "0"=No objeto
const TARIFAS_IVA = [
  { codigo: "4", label: "15%",      tarifa: 15 },
  { codigo: "2", label: "0%",       tarifa: 0  },
  { codigo: "1", label: "Exento",   tarifa: 0  },
  { codigo: "0", label: "No objeto",tarifa: 0  },
] as const;

type TarifaCodigo = "4" | "2" | "1" | "0";

type ModoCliente = "consumidor" | "buscar" | "nuevo";

type ClienteFactura = {
  modo:              ModoCliente;
  tipoIdentificacion:TipoIdentificacion;
  identificacion:    string;
  razonSocial:       string;
  correo:            string;
  telefono?:         string;
  direccion?:        string;
  airtableId?:       string;
};

const CONSUMIDOR_FINAL: ClienteFactura = {
  modo:               "consumidor",
  tipoIdentificacion: "07",
  identificacion:     "9999999999999",
  razonSocial:        "CONSUMIDOR FINAL",
  correo:             "",
};

// Puente entre el estado interno de la factura (ClienteFactura + modoCliente) y
// la tarjeta compartida (ClienteDoc). Así reutilizamos la misma UI sin cambiar
// el modelo de datos del que dependen borrador, gancho, reemplazo y emisión.
function facturaToDoc(c: ClienteFactura, modo: ModoCliente): ClienteDoc {
  const esCF = modo === "consumidor";
  return {
    esConsumidorFinal:  esCF,
    tipoIdentificacion: c.tipoIdentificacion,
    identificacion:     esCF ? "9999999999999" : c.identificacion,
    razonSocial:        c.razonSocial,
    correo:             c.correo,
    telefono:           c.telefono ?? "",
    direccion:          esCF ? "" : (c.direccion ?? ""),
    airtableId:         esCF ? undefined : c.airtableId,
  };
}

type LineaDetalle = {
  _id:            string;
  codigoPrincipal:string;
  descripcion:    string;
  unidadMedida:   string;
  cantidad:       number;
  precioUnitario: number;
  descuento:      number;
  tarifaIva:      TarifaCodigo;
  // Fase 16 PR3 (post-emisión) + Fase 17.b (inventario por cantidad): marca
  // de origen presente en líneas precargadas desde el gancho Y TAMBIÉN, desde
  // Fase 17.b, en líneas agregadas con el buscador de productos de mostrador
  // (agregarProducto) — ambas descuentan stock al facturar. Solo "+ Agregar
  // línea manual" sigue sin vínculo a inventario.
  tipo?:              "producto" | "servicio" | "productoDigital";
  shippingItemId?:    string;
  // Misma idea que shippingItemId, para líneas de "Productos Digitales"
  // (solo si tipo === "productoDigital") — postEmision() lo usa para marcar
  // Usado y enlazar la factura al autorizarse.
  productoDigitalId?: string;
  // Stock visto al momento de agregar la línea (solo buscador de mostrador).
  // Referencial para validación temprana en el formulario — la verificación
  // definitiva la hace el servidor releyendo Airtable justo antes de emitir.
  stockDisponible?: number;
};

type ProductoCatalogo = {
  id:          string;
  sku:         string;
  nombre:      string;
  descripcion: string;
  precioVenta: number;
  unidad:      string;
  cantidadDisponible: number;
};

type ClienteBusqueda = {
  id:        string;
  nombre:    string;
  cedula:    string;
  telefono:  string;
  correo:    string;
  direccion: string;
};

type ResultadoEmision = {
  estado:             "AUTORIZADO" | "DEVUELTA" | "NO AUTORIZADO";
  claveAcceso:        string;
  numeroFactura:      string;
  numeroAutorizacion?:string;
  fechaAutorizacion?: string;
  mensajes?:          Array<{ identificador: string; tipo: string; mensaje: string }>;
  recordId?:          string;
};

// ─── Validación de identificación ─────────────────────────────────────────────
//
// La lógica vive en lib/facturacion/reglas/identificacion.ts, COMPARTIDA con
// el servidor. Antes había una copia aquí que solo comprobaba que un RUC
// tuviera 13 dígitos —sin dígito verificador— y que dejaba pasar cualquier
// documento marcado como pasaporte. El servidor no validaba nada.
//
// Ahora la pantalla avisa mientras se escribe y el servidor vuelve a validar
// antes de emitir, con exactamente las mismas reglas.

// ─── Helpers numéricos ─────────────────────────────────────────────────────────

function calcularLinea(l: LineaDetalle): number {
  return round2(l.cantidad * l.precioUnitario - l.descuento);
}

type TotalesFact = {
  totalSinImpuestos: number;
  totalDescuento:    number;
  subtotal15:        number;
  subtotal0:         number;
  subtotalExento:    number;
  subtotalNoObjeto:  number;
  iva15:             number;
  importeTotal:      number;
};

// Cálculo histórico de mostrador — SIN CAMBIOS. precioUnitario es la base
// (sin IVA); el IVA se calcula sobre el subtotal AGREGADO del grupo 15%,
// no por línea. Solo corre cuando el toggle "Precios incluyen IVA" está
// desactivado — preserva exactamente el comportamiento previo a esta PR.
function calcularTotalesBaseMasIva(lineas: LineaDetalle[]): TotalesFact {
  let subtotal15 = 0, subtotal0 = 0, subtotalExento = 0, subtotalNoObjeto = 0;
  let totalDescuento = 0;

  for (const l of lineas) {
    const base = round2(l.cantidad * l.precioUnitario);
    const desc = round2(l.descuento);
    const neto = round2(base - desc);
    totalDescuento += desc;
    if (l.tarifaIva === "4")      subtotal15      += neto;
    else if (l.tarifaIva === "2") subtotal0        += neto;
    else if (l.tarifaIva === "1") subtotalExento   += neto;
    else                          subtotalNoObjeto += neto;
  }

  const iva15             = round2(subtotal15 * 0.15);
  const totalSinImpuestos = round2(subtotal15 + subtotal0 + subtotalExento + subtotalNoObjeto);
  const importeTotal      = round2(totalSinImpuestos + iva15);

  return {
    totalSinImpuestos,
    totalDescuento: round2(totalDescuento),
    subtotal15,
    subtotal0,
    subtotalExento,
    subtotalNoObjeto,
    iva15,
    importeTotal,
  };
}

// IVA incluido (default, corrección post-prueba en vivo) — precioUnitario es
// el precio FINAL de la línea (con IVA ya incluido). Cada línea se desglosa
// por separado vía complemento (mismo método que el gancho, ver
// lib/facturacion/ivaIncluido.ts) y los resultados se SUMAN — nunca se
// aplica la tarifa sobre un subtotal ya agregado/redondeado, que es
// justamente lo que causaba hasta $0.01 de diferencia contra el total real.
function calcularTotalesIvaIncluido(lineas: LineaDetalle[]): TotalesFact {
  let subtotal15 = 0, subtotal0 = 0, subtotalExento = 0, subtotalNoObjeto = 0;
  let iva15 = 0, totalDescuento = 0;

  for (const l of lineas) {
    const bruto = round2(l.cantidad * l.precioUnitario);
    const desc  = round2(l.descuento);
    const montoLinea = round2(bruto - desc);
    totalDescuento += desc;
    const tarifaInfo = TARIFAS_IVA.find((t) => t.codigo === l.tarifaIva)!;
    const { base, valorIva } = desglosarPrecioConIvaIncluido(montoLinea, tarifaInfo.tarifa);
    if (l.tarifaIva === "4")      { subtotal15      += base; iva15 += valorIva; }
    else if (l.tarifaIva === "2") subtotal0        += base;
    else if (l.tarifaIva === "1") subtotalExento   += base;
    else                          subtotalNoObjeto += base;
  }

  subtotal15       = round2(subtotal15);
  subtotal0        = round2(subtotal0);
  subtotalExento   = round2(subtotalExento);
  subtotalNoObjeto = round2(subtotalNoObjeto);
  iva15            = round2(iva15);
  const totalSinImpuestos = round2(subtotal15 + subtotal0 + subtotalExento + subtotalNoObjeto);
  const importeTotal      = round2(totalSinImpuestos + iva15);

  return {
    totalSinImpuestos,
    totalDescuento: round2(totalDescuento),
    subtotal15,
    subtotal0,
    subtotalExento,
    subtotalNoObjeto,
    iva15,
    importeTotal,
  };
}

function calcularTotales(lineas: LineaDetalle[], ivaIncluido: boolean): TotalesFact {
  return ivaIncluido ? calcularTotalesIvaIncluido(lineas) : calcularTotalesBaseMasIva(lineas);
}

// ─── Clases de input reutilizables ─────────────────────────────────────────────

const INPUT =
  "w-full rounded-md bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] placeholder-[#666] " +
  "focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30 focus:border-[#D7FF4F]/60 disabled:opacity-50";

const SELECT =
  "w-full rounded-md bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] " +
  "focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30 focus:border-[#D7FF4F]/60 disabled:opacity-50";

const LABEL = "block mb-1 text-xs font-semibold text-[#A7A7A7] uppercase tracking-wide";

// ─── Componente principal ─────────────────────────────────────────────────────

type PagoForm = { formaPago: string; total: number; origenPago?: "abono" | "saldo"; fechaAbono?: string };

// Tipo del payload guardado en Líneas JSON para borradores.
// version 2 (gancho Fase 16 PR2): agrega pagosPrecargados/origen/bannerOrigen
// — antes solo se guardaba `formaPago` (el estado del mostrador), así que un
// borrador guardado desde una pre-factura precargada perdía las formas de
// pago reales (volvía a una sola "Efectivo" por el total al recuperarlo) y
// el origen por completo. Un borrador version:1 sigue cargando igual que
// siempre — los campos nuevos son opcionales.
// version 3 (corrección post-prueba en vivo): agrega `ivaIncluido`, el
// estado del toggle "Precios incluyen IVA". Los borradores version 1 o 2
// son de ANTES de que este concepto existiera — en ese entonces
// precioUnitario siempre era la base (sin IVA), así que se restauran con
// el toggle DESACTIVADO para preservar su semántica original exacta.
type BorradorPayload = {
  version:     1 | 2 | 3;
  modoCliente: ModoCliente;
  cliente:     ClienteFactura;
  lineas:      LineaDetalle[];
  formaPago:   string;
  pagosPrecargados?: Array<PagoForm> | null;
  origen?:           OrigenGancho | null;
  bannerOrigen?:     { ordenIdVisible: string | null; operacionCodigo: string | null } | null;
  ivaIncluido?:       boolean;
};

export function FacturacionForm({ consumidorFinalLimite = 50 }: { consumidorFinalLimite?: number }) {
  const searchParams = useSearchParams();

  // ── Estado del formulario ─────────────────────────────────────────────────
  const [cliente, setCliente]   = useState<ClienteFactura>(CONSUMIDOR_FINAL);
  const [modoCliente, setModoCliente] = useState<ModoCliente>("consumidor");
  const [lineas, setLineas]     = useState<LineaDetalle[]>([]);
  const [formaPago, setFormaPago] = useState("01");
  // Toggle "Precios incluyen IVA" — default activado (decisión de negocio:
  // los precios que maneja el negocio ya incluyen IVA). Al desactivarlo,
  // el formulario vuelve al cálculo histórico (precio = base, IVA sumado
  // encima). Aplica a mostrador y gancho por igual — ver §4.6 del diseño.
  const [ivaIncluido, setIvaIncluido] = useState(true);
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEmision | null>(null);
  const [errGlobal, setErrGlobal] = useState<string | null>(null);

  // ── Borrador ──────────────────────────────────────────────────────────────
  const [borradorId, setBorradorId]           = useState<string | null>(null);
  const [guardandoBorrador, setGuardando]     = useState(false);
  const [msgBorrador, setMsgBorrador]         = useState<string | null>(null);

  // ── Búsqueda de productos ─────────────────────────────────────────────────
  const [queryProducto, setQueryProducto] = useState("");
  const [productosSug, setProductosSug]   = useState<ProductoCatalogo[]>([]);
  const [buscandoProd, setBuscandoProd]   = useState(false);
  const productoRef = useRef<HTMLInputElement>(null);

  // ── Modo precargado (gancho Fase 16 PR2: ?origen=orden|operacion&recordId=…) ──
  // pagosPrecargados es null en modo mostrador (comportamiento intacto: se
  // sigue usando el único `formaPago` de arriba, calculado sobre el total
  // en handleEmitir() exactamente igual que antes). Se puebla solo cuando
  // llega una pre-factura del gancho, con una o más líneas editables.
  const [origen, setOrigen]                 = useState<OrigenGancho | null>(null);
  const [pagosPrecargados, setPagosPrecargados] = useState<Array<PagoForm> | null>(null);
  const [bannerOrigen, setBannerOrigen]     = useState<{ ordenIdVisible: string | null; operacionCodigo: string | null } | null>(null);
  const [cargandoPrefactura, setCargandoPrefactura] = useState(false);
  const [prefacturaBloqueada, setPrefacturaBloqueada] = useState<Extract<ResultadoPreFactura, { bloqueado: true }> | null>(null);

  // ── Modo reemplazo (Fase 18 PR2c: ?reemplazoNC=recordId) ──────────────────
  // Factura de reemplazo pagada con el crédito de una nota de crédito. El
  // crédito se aplica como "Compensación de deudas" (código SRI 15) y la
  // diferencia (si el equipo nuevo vale más) como efectivo. Al autorizar, el
  // formulario descuenta el crédito vía /nota-credito/consumir.
  const [reemplazoNC, setReemplazoNC] = useState<{ recordId: string; numero: string; creditoDisponible: number } | null>(null);
  // Forma de pago de la DIFERENCIA en un reemplazo (la compensación siempre es
  // el crédito, código 15). El cliente puede pagar la diferencia con lo que
  // quiera: efectivo, tarjeta, transferencia, etc.
  const [formaPagoDiferencia, setFormaPagoDiferencia] = useState("01");

  // ── Debounce productos ────────────────────────────────────────────────────
  useEffect(() => {
    const q = queryProducto.trim();
    if (q.length < 2) { setProductosSug([]); return; }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setBuscandoProd(true);
      try {
        const r = await fetch(`/api/facturacion/productos?q=${encodeURIComponent(q)}`);
        const j = (await r.json()) as { success: boolean; data: ProductoCatalogo[] };
        if (!cancelled && j.success) setProductosSug(j.data);
      } finally {
        if (!cancelled) setBuscandoProd(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [queryProducto]);

  // ── Líneas de detalle ─────────────────────────────────────────────────────
  function agregarProducto(p: ProductoCatalogo) {
    setLineas((prev) => [
      ...prev,
      {
        _id:            crypto.randomUUID(),
        codigoPrincipal:p.sku || p.id,
        descripcion:    p.nombre,
        unidadMedida:   p.unidad,
        cantidad:       1,
        precioUnitario: p.precioVenta,
        descuento:      0,
        tarifaIva:      "4",  // IVA 15% por defecto (Shipping Items no tiene campo IVA)
        // Fase 17.b: la línea de mostrador ahora sí queda vinculada a su
        // Shipping Item — descuenta stock al facturar, igual que el gancho.
        tipo:            "producto",
        shippingItemId:  p.id,
        stockDisponible: p.cantidadDisponible,
      },
    ]);
    setQueryProducto("");
    setProductosSug([]);
    productoRef.current?.focus();
  }

  function agregarLineaManual() {
    setLineas((prev) => [
      ...prev,
      {
        _id:            crypto.randomUUID(),
        codigoPrincipal:"",
        descripcion:    "",
        unidadMedida:   "UNIDAD",
        cantidad:       1,
        precioUnitario: 0,
        descuento:      0,
        tarifaIva:      "4",
      },
    ]);
  }

  function actualizarLinea(id: string, campo: keyof LineaDetalle, valor: string | number) {
    setLineas((prev) =>
      prev.map((l) => (l._id === id ? { ...l, [campo]: valor } : l))
    );
  }

  function eliminarLinea(id: string) {
    setLineas((prev) => prev.filter((l) => l._id !== id));
  }

  // ── Totales ───────────────────────────────────────────────────────────────
  const totales = calcularTotales(lineas, ivaIncluido);

  // Regla SRI: Consumidor Final solo permitido hasta el límite configurado
  const excedeLimiteConsumidor =
    modoCliente === "consumidor" && totales.importeTotal >= consumidorFinalLimite;

  // ── Cargar borrador desde URL (?borrador=recordId) ───────────────────────
  useEffect(() => {
    const id = searchParams.get("borrador");
    if (!id) return;
    setBorradorId(id);
    fetch(`/api/facturacion/historial/${id}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success || !d.data?.lineasJson) return;
        try {
          const p = JSON.parse(d.data.lineasJson) as BorradorPayload;
          if (p.version !== 1 && p.version !== 2 && p.version !== 3) return;
          setModoCliente(p.modoCliente);
          setCliente(p.cliente);
          setLineas(p.lineas);
          setFormaPago(p.formaPago);
          if (p.version === 2 || p.version === 3) {
            setPagosPrecargados(p.pagosPrecargados ?? null);
            setOrigen(p.origen ?? null);
            setBannerOrigen(p.bannerOrigen ?? null);
          }
          // Borradores version 1/2 son de antes del toggle "Precios incluyen
          // IVA" — en ese entonces precioUnitario siempre era la base, así
          // que se restauran con el toggle desactivado para no reinterpretar
          // esos números como precios finales.
          setIvaIncluido(p.version === 3 ? (p.ivaIncluido ?? true) : false);
          setMsgBorrador("Borrador cargado");
          setTimeout(() => setMsgBorrador(null), 3000);
        } catch { /* payload inválido, ignorar */ }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // solo al montar

  // ── Cargar pre-factura desde URL (?origen=orden|operacion&recordId=…) ────
  // Gancho Fase 16 PR2 — mismo patrón que el borrador de arriba: solo al
  // montar, vía /api/facturacion/prefactura.
  useEffect(() => {
    const origenTipo = searchParams.get("origen");
    const recordId    = searchParams.get("recordId");
    if (!origenTipo || !recordId) return;
    if (origenTipo !== "orden" && origenTipo !== "operacion") return;

    setCargandoPrefactura(true);
    const qs = origenTipo === "orden"
      ? `orden=${encodeURIComponent(recordId)}`
      : `operacion=${encodeURIComponent(recordId)}`;

    fetch(`/api/facturacion/prefactura?${qs}`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: ResultadoPreFactura; error?: string }) => {
        if (!j.success || !j.data) {
          setErrGlobal(j.error ?? "Error al cargar la pre-factura");
          return;
        }
        if (j.data.bloqueado) {
          setPrefacturaBloqueada(j.data);
          return;
        }

        const { datosVenta } = j.data;

        if (datosVenta.tipoIdentificacionComprador === "07") {
          setModoCliente("consumidor");
          setCliente(CONSUMIDOR_FINAL);
        } else {
          setModoCliente("buscar");
          setCliente({
            modo:               "buscar",
            tipoIdentificacion: datosVenta.tipoIdentificacionComprador as TipoIdentificacion,
            identificacion:     datosVenta.identificacionComprador,
            razonSocial:        datosVenta.razonSocialComprador,
            correo:             datosVenta.correoComprador ?? "",
            airtableId:         datosVenta.clienteRecordId,
          });
        }

        // El backend manda precioUnitario ya desglosado (la BASE, sin IVA —
        // ver lib/facturacion/gancho/construccion.ts). El formulario, con el
        // toggle "Precios incluyen IVA" activado (default, y forzado abajo),
        // trata precioUnitario como el precio FINAL — así que se reconstruye
        // sumando el IVA de vuelta. Al volver a desglosarlo con la misma
        // fórmula de complemento, se reproduce exactamente la misma base/IVA
        // que ya calculó el backend (idempotente, sin doble redondeo).
        // tipo/shippingItemId viajan tal cual desde el backend (Fase 16 PR3)
        // — es la marca que postEmision() usa para saber qué Shipping Item
        // vender al autorizarse la factura. Se conservan a través de
        // ediciones de otros campos (actualizarLinea solo toca el campo
        // editado) y del guardado/carga de borradores (LineaDetalle completa
        // viaja tal cual en el payload).
        setLineas(
          datosVenta.detalles.map((d) => ({
            _id:             crypto.randomUUID(),
            codigoPrincipal: d.codigoPrincipal ?? "",
            descripcion:     d.descripcion,
            unidadMedida:    d.unidadMedida ?? "UNIDAD",
            cantidad:        d.cantidad,
            precioUnitario:  round2(d.precioUnitario + (d.impuestos[0]?.valor ?? 0)),
            descuento:       d.descuento,
            tarifaIva:       (d.impuestos[0]?.codigoPorcentaje ?? "4") as TarifaCodigo,
            tipo:            d.tipo,
            shippingItemId:  d.shippingItemId,
            productoDigitalId: d.productoDigitalId,
          }))
        );

        setIvaIncluido(true);
        setPagosPrecargados(
          datosVenta.pagos.map((p) => ({
            formaPago: p.formaPago, total: p.total,
            origenPago: p.origenPago, fechaAbono: p.fechaAbono,
          }))
        );
        setOrigen(datosVenta.origen ?? { tipo: origenTipo, recordId });
        setBannerOrigen({ ordenIdVisible: j.data.ordenIdVisible, operacionCodigo: j.data.operacionCodigo });
      })
      .catch(() => setErrGlobal("Error de red al cargar la pre-factura"))
      .finally(() => setCargandoPrefactura(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // solo al montar

  // ── Cargar factura de reemplazo desde URL (?reemplazoNC=recordId) ─────────
  // Precarga el cliente de la NC; el usuario agrega el equipo nuevo. El pago
  // (compensación + efectivo) se deriva del crédito y del total al emitir.
  useEffect(() => {
    const ncId = searchParams.get("reemplazoNC");
    if (!ncId) return;

    setCargandoPrefactura(true);
    fetch(`/api/facturacion/nota-credito/reemplazo?notaCreditoRecordId=${encodeURIComponent(ncId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success || !j.data) { setErrGlobal(j.error ?? "No se pudo cargar el reemplazo"); return; }
        const d = j.data;
        if (d.cliente.tipoIdentificacion === "07") {
          setModoCliente("consumidor");
          setCliente(CONSUMIDOR_FINAL);
        } else {
          setModoCliente("buscar");
          setCliente({
            modo:               "buscar",
            tipoIdentificacion: d.cliente.tipoIdentificacion as TipoIdentificacion,
            identificacion:     d.cliente.identificacion,
            razonSocial:        d.cliente.razonSocial,
            correo:             d.cliente.correo ?? "",
            airtableId:         d.cliente.airtableId,
          });
        }
        setReemplazoNC({ recordId: d.notaCreditoRecordId, numero: d.numeroNotaCredito, creditoDisponible: d.creditoDisponible });
        setIvaIncluido(true);
      })
      .catch(() => setErrGlobal("Error de red al cargar el reemplazo"))
      .finally(() => setCargandoPrefactura(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // solo al montar

  // Pago derivado en modo reemplazo: compensación (crédito) + efectivo (diferencia).
  const pagosReemplazo = reemplazoNC
    ? (() => {
        const comp = Math.min(reemplazoNC.creditoDisponible, totales.importeTotal);
        const diferencia = round2(totales.importeTotal - comp);
        const pagos: PagoForm[] = [{ formaPago: "15", total: round2(comp) }];
        if (diferencia > 0.005) pagos.push({ formaPago: formaPagoDiferencia, total: diferencia });
        return pagos;
      })()
    : null;

  // ── Guardar borrador ─────────────────────────────────────────────────────
  async function handleGuardarBorrador() {
    if (lineas.length === 0) { setErrGlobal("Agrega al menos una línea antes de guardar el borrador"); return; }
    setGuardando(true); setMsgBorrador(null); setErrGlobal(null);
    try {
      const payload: BorradorPayload = {
        version: 3,
        modoCliente,
        cliente,
        lineas,
        formaPago,
        pagosPrecargados,
        origen,
        bannerOrigen,
        ivaIncluido,
      };
      const lineasJson = JSON.stringify(payload);
      const body = {
        clienteNombre:         cliente.razonSocial || "Sin nombre",
        clienteIdentificacion: cliente.identificacion || "9999999999999",
        clienteCorreo:         cliente.correo || undefined,
        subtotal:              totales.totalSinImpuestos,
        iva:                   totales.iva15,
        total:                 totales.importeTotal,
        lineasJson,
      };

      let url = "/api/facturacion/borrador";
      let method = "POST";
      if (borradorId) { url = `/api/facturacion/borrador/${borradorId}`; method = "PATCH"; }

      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) {
        setErrGlobal(j.error ?? "Error al guardar borrador");
      } else {
        if (!borradorId && j.data?.recordId) setBorradorId(j.data.recordId);
        setMsgBorrador("Borrador guardado");
        setTimeout(() => setMsgBorrador(null), 3000);
      }
    } catch {
      setErrGlobal("Error de red al guardar borrador");
    } finally {
      setGuardando(false);
    }
  }

  // ── Emitir ────────────────────────────────────────────────────────────────
  async function handleEmitir() {
    setErrGlobal(null);
    setResultado(null);

    // Validaciones de cliente
    const errId = validarIdentificacion(cliente.tipoIdentificacion, cliente.identificacion);
    if (errId) { setErrGlobal(errId); return; }
    if (!cliente.razonSocial.trim()) { setErrGlobal("Razón social del comprador requerida"); return; }
    if (lineas.length === 0)         { setErrGlobal("Agrega al menos un producto o servicio"); return; }
    if (lineas.some((l) => !l.descripcion.trim())) {
      setErrGlobal("Todos los detalles deben tener una descripción"); return;
    }
    if (lineas.some((l) => l.cantidad <= 0 || l.precioUnitario < 0)) {
      setErrGlobal("Cantidad debe ser > 0 y precio ≥ 0 en todos los detalles"); return;
    }
    const errPrecioShipping = mensajePrecioShippingItemInvalido(lineas);
    if (errPrecioShipping) {
      setErrGlobal(errPrecioShipping); return;
    }
    if (lineas.some((l) => !Number.isInteger(l.cantidad))) {
      setErrGlobal("La cantidad debe ser un número entero (se venden unidades completas)"); return;
    }
    // Fase 17.b — validación temprana de stock (solo líneas del buscador de
    // mostrador, que traen stockDisponible). Referencial: la verificación
    // definitiva la repite el servidor contra Airtable antes de emitir.
    {
      const sinStock = lineas.filter(
        (l) => l.shippingItemId && l.stockDisponible !== undefined && l.cantidad > l.stockDisponible
      );
      if (sinStock.length > 0) {
        const lista = sinStock
          .map((l) => `"${l.descripcion}" (solicitado: ${l.cantidad}, disponible: ${l.stockDisponible})`)
          .join("; ");
        setErrGlobal(`Sin stock disponible: ${lista}`);
        return;
      }
    }
    if (pagosPrecargados) {
      if (pagosPrecargados.length === 0) { setErrGlobal("Agrega al menos una forma de pago"); return; }
      const sumaPagos = round2(pagosPrecargados.reduce((s, p) => s + p.total, 0));
      if (Math.abs(sumaPagos - totales.importeTotal) > 0.01) {
        setErrGlobal(
          `Las formas de pago suman $${sumaPagos.toFixed(2)} pero el total es $${totales.importeTotal.toFixed(2)}`
        );
        return;
      }
    }
    if (reemplazoNC && totales.importeTotal <= 0) {
      setErrGlobal("Agrega el equipo de reemplazo antes de emitir");
      return;
    }

    // Construir DatosVenta.
    // ivaIncluido=false: cálculo histórico SIN CAMBIOS — precioUnitario ya es
    // la base, el IVA de cada línea se calcula sobre esa base directamente.
    // ivaIncluido=true (default): precioUnitario es el precio FINAL — se
    // desglosa por línea vía complemento (mismo método que calcularTotales
    // y que el gancho), nunca sumando IVA encima de la base.
    const detalles = ivaIncluido
      ? lineas.map((l) => {
          const bruto = round2(l.cantidad * l.precioUnitario);
          const neto  = round2(bruto - l.descuento);
          const tarifa = TARIFAS_IVA.find((t) => t.codigo === l.tarifaIva)!;
          const { base, valorIva } = desglosarPrecioConIvaIncluido(neto, tarifa.tarifa);
          // Fix [52] ERROR EN DIFERENCIAS (2026-07-19, facturas 677/678):
          // antes se mandaba precioUnitario = base de la LÍNEA COMPLETA, y el
          // SRI valida cantidad × precioUnitario − descuento ==
          // precioTotalSinImpuesto — con cantidad ≥ 2 nunca cuadraba (2 ×
          // 591.30 ≠ 591.30). Ahora: precioUnitario POR UNIDAD en base (sin
          // IVA), 2 decimales (tope del XSD v2.1.0). El redondeo por unidad
          // puede desviar centavos contra la base centavo-exacta de la línea;
          // esa diferencia — junto con el descuento del usuario ya desglosado
          // a términos base — se absorbe en `descuento`, dejando la ecuación
          // del SRI exacta: cantidad×unitario − descuento = base.
          let unitario = round2(l.precioUnitario / (1 + tarifa.tarifa / 100));
          while (round2(l.cantidad * unitario) < base) unitario = round2(unitario + 0.01);
          const descuentoBase = round2(round2(l.cantidad * unitario) - base);
          return {
            codigoPrincipal:        l.codigoPrincipal || undefined,
            descripcion:            l.descripcion.trim(),
            unidadMedida:           l.unidadMedida || undefined,
            cantidad:               l.cantidad,
            precioUnitario:         unitario,
            descuento:              descuentoBase,
            precioTotalSinImpuesto: base,
            impuestos: [
              {
                codigo:           "2",
                codigoPorcentaje: l.tarifaIva,
                tarifa:           tarifa.tarifa,
                baseImponible:    base,
                valor:            valorIva,
              },
            ],
            // Fase 16 PR3: se propaga tal cual venía en la línea — solo las
            // líneas que llegaron precargadas del gancho lo traen.
            tipo:           l.tipo,
            shippingItemId: l.shippingItemId,
            productoDigitalId: l.productoDigitalId,
          };
        })
      : lineas.map((l) => {
          const base   = round2(l.cantidad * l.precioUnitario);
          const neto   = round2(base - l.descuento);
          const tarifa = TARIFAS_IVA.find((t) => t.codigo === l.tarifaIva)!;
          const ivaVal = round2(neto * (tarifa.tarifa / 100));
          return {
            codigoPrincipal:        l.codigoPrincipal || undefined,
            descripcion:            l.descripcion.trim(),
            unidadMedida:           l.unidadMedida || undefined,
            cantidad:               l.cantidad,
            precioUnitario:         l.precioUnitario,
            descuento:              l.descuento,
            precioTotalSinImpuesto: neto,
            impuestos: [
              {
                codigo:           "2",
                codigoPorcentaje: l.tarifaIva,
                tarifa:           tarifa.tarifa,
                baseImponible:    neto,
                valor:            ivaVal,
              },
            ],
            tipo:           l.tipo,
            shippingItemId: l.shippingItemId,
            productoDigitalId: l.productoDigitalId,
          };
        });

    // Agrupar totalConImpuestos por codigoPorcentaje
    const ivaMap = new Map<string, { base: number; valor: number; tarifa: number }>();
    for (const d of detalles) {
      for (const imp of d.impuestos) {
        const prev = ivaMap.get(imp.codigoPorcentaje) ?? { base: 0, valor: 0, tarifa: imp.tarifa };
        ivaMap.set(imp.codigoPorcentaje, {
          base:   round2(prev.base + imp.baseImponible),
          valor:  round2(prev.valor + imp.valor),
          tarifa: imp.tarifa,
        });
      }
    }

    const totalConImpuestos = [...ivaMap.entries()].map(([cp, v]) => ({
      codigo:           "2" as const,
      codigoPorcentaje: cp,
      baseImponible:    v.base,
      tarifa:           v.tarifa,
      valor:            v.valor,
    }));

    const body = {
      tipoIdentificacionComprador: cliente.tipoIdentificacion,
      razonSocialComprador:        cliente.razonSocial.trim().toUpperCase(),
      identificacionComprador:     cliente.identificacion.trim(),
      correoComprador:             cliente.correo.trim() || undefined,
      detalles,
      totalSinImpuestos: totales.totalSinImpuestos,
      // totalDescuento debe cuadrar contra la SUMA de los descuentos de los
      // detalles construidos (el SRI los cruza) — en modo IVA incluido esos
      // descuentos ya están en términos base + ajuste de redondeo, no son
      // los que tecleó el usuario (ver fix [52] arriba).
      totalDescuento:    round2(detalles.reduce((s, d) => s + d.descuento, 0)),
      totalConImpuestos,
      importeTotal:      totales.importeTotal,
      // En reemplazo: compensación (crédito NC) + efectivo (diferencia).
      pagos: pagosReemplazo ?? pagosPrecargados ?? [{ formaPago, total: totales.importeTotal }],
      origen:          origen ?? undefined,
      // cliente.airtableId (no el clienteRecordId que trajo la pre-factura):
      // si el humano cambia de cliente en el formulario, el link
      // post-emisión debe usar el cliente final elegido, no el original.
      clienteRecordId: cliente.airtableId,
    };

    setEmitiendo(true);
    try {
      const r = await fetch("/api/facturacion/emitir", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const j = (await r.json()) as { success: boolean; data?: ResultadoEmision; error?: string };
      if (!j.success) {
        setErrGlobal(j.error ?? "Error al emitir");
      } else {
        // Reemplazo: al autorizar, descontar el crédito de la NC (best-effort;
        // si falla, la factura ya es válida — el aviso pide conciliar a mano).
        if (reemplazoNC && pagosReemplazo && j.data?.estado === "AUTORIZADO" && j.data.recordId) {
          const comp = pagosReemplazo.find((p) => p.formaPago === "15")?.total ?? 0;
          if (comp > 0) {
            try {
              const cr = await fetch("/api/facturacion/nota-credito/consumir", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notaCreditoRecordId: reemplazoNC.recordId, monto: comp, facturaReemplazoRecordId: j.data.recordId }),
              });
              const cj = await cr.json();
              if (!cj.success) setErrGlobal(`Factura emitida, pero el crédito de la NC ${reemplazoNC.numero} no se descontó automáticamente: ${cj.error}. Revísalo en el historial de notas de crédito.`);
            } catch {
              setErrGlobal(`Factura emitida, pero no se pudo descontar el crédito de la NC ${reemplazoNC.numero}. Revísalo a mano.`);
            }
          }
        }
        setResultado(j.data!);
      }
    } catch {
      setErrGlobal("Error de red al conectar con el servidor");
    } finally {
      setEmitiendo(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const clienteOk =
    modoCliente === "consumidor" ||
    (cliente.identificacion && !validarIdentificacion(cliente.tipoIdentificacion, cliente.identificacion));

  // Puente con la tarjeta de cliente compartida (misma UI que el resto).
  const clienteDoc = facturaToDoc(cliente, modoCliente);
  function onClienteCard(doc: ClienteDoc) {
    if (doc.esConsumidorFinal) { setModoCliente("consumidor"); setCliente(CONSUMIDOR_FINAL); return; }
    setModoCliente("buscar");
    setCliente({ modo: "buscar", tipoIdentificacion: doc.tipoIdentificacion as TipoIdentificacion, identificacion: doc.identificacion, razonSocial: doc.razonSocial, correo: doc.correo, telefono: doc.telefono, direccion: doc.direccion, airtableId: doc.airtableId });
  }

  // ── Gancho Fase 16 PR2: pre-factura bloqueada — no se puede armar nada,
  //    se muestra el motivo en vez del formulario. ─────────────────────────
  if (prefacturaBloqueada) {
    return (
      <div className="w-full max-w-5xl">
        <PreFacturaBloqueadaBanner resultado={prefacturaBloqueada} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl pb-20">

      {/* ── Cargando pre-factura del gancho ────────────────────────────── */}
      {cargandoPrefactura && (
        <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-4 py-3 text-sm text-[#A7A7A7]">
          Cargando datos de la {searchParams.get("origen") === "operacion" ? "operación" : "orden"}…
        </div>
      )}

      {/* ── Banner de reemplazo (Fase 18 PR2c) ─────────────────────────── */}
      {reemplazoNC && !resultado && (
        <div className="rounded-xl border border-[#D7FF4F]/40 bg-[#D7FF4F]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[#D7FF4F]">
            Factura de reemplazo — aplicando crédito de la nota de crédito {reemplazoNC.numero}
          </p>
          <p className="text-xs text-[#A7A7A7] mt-1">
            Crédito disponible: <strong>${reemplazoNC.creditoDisponible.toFixed(2)}</strong>. Agrega el equipo nuevo;
            el crédito se aplica como compensación y la diferencia (si el equipo vale más) se cobra con la forma de pago que elijas.
          </p>
        </div>
      )}

      {/* ── Banner de origen (gancho) ──────────────────────────────────── */}
      {bannerOrigen && !resultado && (
        <div className="rounded-xl border border-[#D7FF4F]/40 bg-[#D7FF4F]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[#D7FF4F]">
            Facturando desde{" "}
            {bannerOrigen.ordenIdVisible && bannerOrigen.operacionCodigo
              ? `la orden ${bannerOrigen.ordenIdVisible} (operación ${bannerOrigen.operacionCodigo})`
              : bannerOrigen.ordenIdVisible
                ? `la orden ${bannerOrigen.ordenIdVisible}`
                : `la operación ${bannerOrigen.operacionCodigo}`}
          </p>
          <p className="text-xs text-[#A7A7A7] mt-1">
            Cliente, líneas, tarifas y formas de pago vienen precargados desde la cuenta unificada — revisa y ajusta antes de emitir.
          </p>
        </div>
      )}

      {/* ── RESULTADO ──────────────────────────────────────────────────── */}
      {resultado && (
        <ResultadoBanner
          resultado={resultado}
          onNueva={() => {
            setResultado(null);
            setLineas([]);
            setCliente(CONSUMIDOR_FINAL);
            setModoCliente("consumidor");
            setFormaPago("01");
            setOrigen(null);
            setPagosPrecargados(null);
            setBannerOrigen(null);
          }}
          // UX fix 2026-07-19 (pedido del dueño): tras un rechazo del SRI,
          // "Corregir y reintentar" antes vaciaba TODO el formulario y había
          // que reingresar cliente y líneas desde cero. Ahora solo cierra el
          // banner de error — cliente, líneas y pagos quedan tal cual para
          // corregir lo puntual y reintentar.
          onCorregir={() => setResultado(null)}
        />
      )}

      {/* ── 1. CLIENTE (tarjeta compartida con el resto de documentos) ────── */}
      <ClienteCard value={clienteDoc} onChange={onClienteCard} conConsumidorFinal />

      {/* ── 2. DETALLES ────────────────────────────────────────────────── */}
      <Card titulo="2. Productos / Servicios">
        {/* Toggle "Precios incluyen IVA" — default activado, aplica a todo
            el formulario (mostrador y gancho por igual). Ver §4.6 del diseño. */}
        <label className="mb-3 flex items-center gap-2 text-xs text-[#A7A7A7] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={ivaIncluido}
            onChange={(e) => setIvaIncluido(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#D7FF4F]"
          />
          <span className="font-semibold text-[#F5F5F5]">Precios incluyen IVA</span>
          <span className="text-[#666]">
            {ivaIncluido
              ? "— el precio unitario ya incluye IVA; se desglosa por línea."
              : "— el precio unitario es la base; el IVA se suma encima (cálculo clásico)."}
          </span>
        </label>

        {/* Aviso IVA */}
        <p className="mb-3 text-xs text-[#FFB07A] bg-[#FF914D]/10 border border-[#FF914D]/30 rounded px-3 py-2">
          <strong>NOTA:</strong> Los productos de este buscador no traen una tarifa de IVA asignada
          — se asigna 15% por defecto; ajústalo por línea si corresponde.
        </p>

        {/* Buscador de productos */}
        <div className="relative mb-4">
          <label className={LABEL}>Buscar producto del inventario</label>
          <input
            ref={productoRef}
            type="text"
            value={queryProducto}
            onChange={(e) => setQueryProducto(e.target.value)}
            placeholder="Nombre del producto o SKU…"
            className={INPUT}
          />
          {buscandoProd && <p className="mt-1 text-xs text-[#666]">Buscando…</p>}
          {productosSug.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-md border border-[#3A3A36] bg-[#1A1B18] shadow-xl divide-y divide-[#2A2B28]">
              {productosSug.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => agregarProducto(p)}
                    className="w-full text-left px-4 py-2.5 hover:bg-[#252622] text-sm"
                  >
                    <p className="font-semibold text-[#F5F5F5]">{p.nombre}</p>
                    <p className="text-[#666] text-xs">{p.sku} · {p.unidad} · ${p.precioVenta.toFixed(2)} · stock: {p.cantidadDisponible}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tabla de líneas */}
        {lineas.length > 0 && (
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[10px] text-[#666] uppercase tracking-wider border-b border-[#3A3A36]">
                  <th className="py-2 pr-2 text-left font-semibold">Cód.</th>
                  <th className="py-2 pr-2 text-left font-semibold">Descripción</th>
                  <th className="py-2 pr-2 text-center font-semibold">Unid.</th>
                  <th className="py-2 pr-2 text-right font-semibold w-16">Cant.</th>
                  <th className="py-2 pr-2 text-right font-semibold w-24">{ivaIncluido ? "P.Unit. (IVA inc.)" : "P.Unit. (base)"}</th>
                  <th className="py-2 pr-2 text-right font-semibold w-20">Desc.</th>
                  <th className="py-2 pr-2 text-center font-semibold w-20">IVA</th>
                  <th className="py-2 pr-2 text-right font-semibold w-20">Total</th>
                  <th className="py-2 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2B28]">
                {lineas.map((l) => (
                  <LineaRow
                    key={l._id}
                    linea={l}
                    onChange={(campo, val) => actualizarLinea(l._id, campo, val)}
                    onDelete={() => eliminarLinea(l._id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          onClick={agregarLineaManual}
          className="rounded-full border border-[#3A3A36] px-3 py-1 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] transition"
        >
          + Agregar línea manual
        </button>
      </Card>

      {/* ── 3. PAGO Y TOTALES ───────────────────────────────────────────── */}
      <Card titulo="3. Pago y Totales">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Forma de pago — mostrador: un solo selector por defecto, con
              opción de pasar a pago mixto (Fase 20.2 — antes solo el gancho
              podía usar FormasPagoEditor). Gancho: siempre varias líneas
              editables (abonos reales + saldo), sin este toggle. */}
          <div className="md:w-80">
            {reemplazoNC && pagosReemplazo ? (
              // Modo reemplazo: pago derivado (crédito NC + efectivo), no editable.
              <div>
                <label className={LABEL}>Pago con nota de crédito</label>
                <div className="rounded-lg border border-[#3A3A36] bg-[#252622] p-3 text-sm space-y-2">
                  {/* Compensación: siempre el crédito de la NC (código 15), fijo. */}
                  <div className="flex justify-between">
                    <span className="text-[#A7A7A7]">Compensación (crédito NC)</span>
                    <span className="text-[#F5F5F5]">${(pagosReemplazo.find((p) => p.formaPago === "15")?.total ?? 0).toFixed(2)}</span>
                  </div>
                  {/* Diferencia: el cliente elige con qué la paga. */}
                  {(() => {
                    const dif = pagosReemplazo.find((p) => p.formaPago !== "15");
                    if (!dif) return null;
                    return (
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#3A3A36]">
                        <select
                          value={formaPagoDiferencia}
                          onChange={(e) => setFormaPagoDiferencia(e.target.value)}
                          className="flex-1 rounded bg-[#1A1B18] border border-[#3A3A36] px-2 py-1 text-xs text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30"
                        >
                          {FORMAS_PAGO.filter((fp) => fp.codigo !== "15").map((fp) => (
                            <option key={fp.codigo} value={fp.codigo}>{fp.label} (diferencia)</option>
                          ))}
                        </select>
                        <span className="text-[#F5F5F5] whitespace-nowrap">${dif.total.toFixed(2)}</span>
                      </div>
                    );
                  })()}
                  {round2(reemplazoNC.creditoDisponible - (pagosReemplazo.find((p) => p.formaPago === "15")?.total ?? 0)) > 0.005 && (
                    <p className="text-[10px] text-[#F0C75E] pt-2 border-t border-[#3A3A36]">
                      Quedará ${round2(reemplazoNC.creditoDisponible - (pagosReemplazo.find((p) => p.formaPago === "15")?.total ?? 0)).toFixed(2)} de saldo en la NC {reemplazoNC.numero}.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <label className={LABEL}>Forma{pagosPrecargados ? "s" : ""} de pago</label>
                  {!origen ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPagosPrecargados((actual) =>
                          actual ? null : [{ formaPago, total: totales.importeTotal }]
                        )
                      }
                      className="text-xs text-lime-400 hover:text-lime-300 underline"
                    >
                      {pagosPrecargados ? "Un solo pago" : "Pago mixto"}
                    </button>
                  ) : null}
                </div>
                {pagosPrecargados ? (
                  <FormasPagoEditor pagos={pagosPrecargados} onChange={setPagosPrecargados} />
                ) : (
                  <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className={SELECT}>
                    {FORMAS_PAGO.map((fp) => (
                      <option key={fp.codigo} value={fp.codigo}>{fp.label}</option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>

          {/* Totales */}
          <div className="flex-1">
            <TotalesPanel totales={totales} />
          </div>
        </div>
      </Card>

      {/* ── 4. EMITIR ──────────────────────────────────────────────────── */}
      {!resultado && (
        <div className="flex flex-col items-start gap-3">
          {/* Aviso límite Consumidor Final */}
          {excedeLimiteConsumidor && (
            <div className="w-full rounded-xl border border-[#FFB07A]/40 bg-[#FF914D]/10 px-4 py-3">
              <p className="text-sm font-semibold text-[#FFB07A] mb-1">
                Sobre ${consumidorFinalLimite.toFixed(2)} debes identificar al cliente (cédula o RUC)
              </p>
              <p className="text-xs text-[#A7A7A7]">
                El SRI no permite Consumidor Final para facturas que superen este monto. Elige o crea el cliente en la tarjeta de arriba.
              </p>
            </div>
          )}

          {/* Feedback borrador */}
          {msgBorrador && (
            <p className="w-full rounded-md bg-emerald-900/30 border border-emerald-700/40 px-4 py-2 text-sm text-emerald-300">
              {msgBorrador}
            </p>
          )}
          {errGlobal && (
            <p className="w-full rounded-md bg-red-900/30 border border-red-500/40 px-4 py-3 text-sm text-red-300">
              {errGlobal}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleEmitir}
              disabled={emitiendo || guardandoBorrador || !clienteOk || lineas.length === 0 || !!resultado || excedeLimiteConsumidor}
              className={[
                "rounded-full border px-6 py-2.5 text-sm font-bold transition",
                "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] hover:brightness-105",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {emitiendo ? (
                <span className="flex items-center gap-2">
                  <SpinnerIcon /> Enviando al SRI…
                </span>
              ) : (
                "Emitir Factura →"
              )}
            </button>
            <button
              onClick={handleGuardarBorrador}
              disabled={emitiendo || guardandoBorrador || lineas.length === 0}
              className="rounded-full border border-[#3A3A36] px-4 py-2.5 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {guardandoBorrador ? (
                <span className="flex items-center gap-2"><SpinnerIcon /> Guardando…</span>
              ) : (
                borradorId ? "Actualizar borrador" : "Guardar borrador"
              )}
            </button>
          </div>
          {emitiendo && (
            <p className="text-xs text-[#666]">
              Firmando y enviando al SRI — puede tardar hasta 30 segundos…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────────────────────

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-5">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-[#D7FF4F]">{titulo}</h2>
      {children}
    </div>
  );
}

function LineaRow({
  linea,
  onChange,
  onDelete,
}: {
  linea:    LineaDetalle;
  onChange: (campo: keyof LineaDetalle, val: string | number) => void;
  onDelete: () => void;
}) {
  const total = calcularLinea(linea);
  return (
    <tr>
      {/* SKU y Descripción son ajustables: el borde derecho se arrastra para
          cambiar el ancho (resize-x). El ancho por defecto va por clase, no por
          style, para que el que fije el usuario no se reinicie al teclear. */}
      <td className="py-1.5 pr-2">
        <div className="resize-x overflow-hidden w-[104px] min-w-[60px]" title="Arrastra el borde derecho para ajustar el ancho">
          <input type="text" title={linea.codigoPrincipal} value={linea.codigoPrincipal} onChange={(e) => onChange("codigoPrincipal", e.target.value)} className="w-full rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30" placeholder="SKU" />
        </div>
      </td>
      <td className="py-1.5 pr-2">
        <div className="resize-x overflow-hidden w-[300px] min-w-[140px]" title="Arrastra el borde derecho para ajustar el ancho">
          <input type="text" title={linea.descripcion} value={linea.descripcion} onChange={(e) => onChange("descripcion", e.target.value)} className="w-full rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30" placeholder="Descripción" />
        </div>
      </td>
      <td className="py-1.5 pr-2 text-center">
        <input type="text" value={linea.unidadMedida} onChange={(e) => onChange("unidadMedida", e.target.value)} className="w-16 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-center text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30" />
      </td>
      <td className="py-1.5 pr-2">
        {/* Cantidad: solo enteros (pedido del dueño 2026-07-20) — se venden
            unidades físicas, nunca fracciones. parseInt + step=1. */}
        <input type="number" min="1" step="1" value={linea.cantidad} onChange={(e) => onChange("cantidad", Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-16 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30" />
      </td>
      <td className="py-1.5 pr-2">
        <input type="number" min="0" step="0.01" value={linea.precioUnitario} onChange={(e) => onChange("precioUnitario", parseFloat(e.target.value) || 0)} className="w-24 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30" />
      </td>
      <td className="py-1.5 pr-2">
        <input type="number" min="0" step="0.01" value={linea.descuento} onChange={(e) => onChange("descuento", parseFloat(e.target.value) || 0)} className="w-20 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30" />
      </td>
      <td className="py-1.5 pr-2">
        <select value={linea.tarifaIva} onChange={(e) => onChange("tarifaIva", e.target.value as TarifaCodigo)} className="w-20 rounded bg-[#252622] border border-[#3A3A36] px-1 py-1 text-xs text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30">
          {TARIFAS_IVA.map((t) => <option key={t.codigo} value={t.codigo}>{t.label}</option>)}
        </select>
      </td>
      <td className="py-1.5 pr-2 text-right text-xs text-[#D7FF4F] font-semibold">
        ${total.toFixed(2)}
      </td>
      <td className="py-1.5">
        <button onClick={onDelete} className="text-[#666] hover:text-red-400 transition text-base leading-none" title="Eliminar línea">×</button>
      </td>
    </tr>
  );
}

function TotalesPanel({ totales }: { totales: TotalesFact }) {
  const rows = [
    totales.subtotal15 > 0      && { label: "SUBTOTAL IVA 15%", val: totales.subtotal15 },
    totales.subtotal0 > 0       && { label: "SUBTOTAL IVA 0%",  val: totales.subtotal0  },
    totales.subtotalExento > 0  && { label: "SUBTOTAL EXENTO",  val: totales.subtotalExento  },
    totales.subtotalNoObjeto > 0&& { label: "SUBTOTAL NO OBJETO",val:totales.subtotalNoObjeto},
    totales.totalDescuento > 0  && { label: "TOTAL DESCUENTO",  val: totales.totalDescuento  },
                                   { label: "SUBTOTAL SIN IMPUESTOS", val: totales.totalSinImpuestos },
    totales.iva15 > 0           && { label: "IVA 15%",          val: totales.iva15 },
  ].filter(Boolean) as Array<{ label: string; val: number }>;

  return (
    <div className="ml-auto w-full max-w-xs">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(({ label, val }) => (
            <tr key={label} className="border-b border-[#2A2B28]">
              <td className="py-1.5 text-[#A7A7A7] text-xs">{label}</td>
              <td className="py-1.5 text-right text-[#F5F5F5] font-mono text-xs">${val.toFixed(2)}</td>
            </tr>
          ))}
          <tr>
            <td className="pt-2.5 text-[#D7FF4F] text-sm font-bold">VALOR TOTAL</td>
            <td className="pt-2.5 text-right text-[#D7FF4F] font-bold font-mono">${totales.importeTotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Editor de formas de pago múltiples — solo se monta en modo precargado
// (gancho Fase 16 PR2: abonos reales + saldo pendiente, cada línea editable).
// El modo mostrador sigue usando el <select> único de siempre, sin pasar
// por este componente.
function formatearFechaAbono(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

// pagos con origenPago: "abono" vienen de la tabla Abonos (Airtable) — se
// muestran con etiqueta y el monto queda bloqueado por defecto (evita
// editar por accidente un cobro que ya ocurrió); "saldo" es el pendiente
// calculado, siempre editable. Solo presentación — el XML/RIDE no cambian.
function FormasPagoEditor({
  pagos,
  onChange,
}: {
  pagos:    Array<PagoForm>;
  onChange: (pagos: Array<PagoForm>) => void;
}) {
  const [desbloqueados, setDesbloqueados] = useState<Set<number>>(new Set());

  function actualizar(i: number, campo: "formaPago" | "total", valor: string | number) {
    onChange(pagos.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));
  }
  function eliminar(i: number) {
    onChange(pagos.filter((_, idx) => idx !== i));
  }
  function agregar() {
    onChange([...pagos, { formaPago: "01", total: 0, origenPago: "saldo" }]);
  }

  const suma = round2(pagos.reduce((s, p) => s + p.total, 0));

  return (
    <div className="flex flex-col gap-2">
      {pagos.map((p, i) => {
        const esAbono   = p.origenPago === "abono";
        const bloqueado = esAbono && !desbloqueados.has(i);
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <select
                value={p.formaPago}
                onChange={(e) => actualizar(i, "formaPago", e.target.value)}
                className={SELECT}
              >
                {FORMAS_PAGO.map((fp) => (
                  <option key={fp.codigo} value={fp.codigo}>{fp.label}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={p.total}
                disabled={bloqueado}
                onChange={(e) => actualizar(i, "total", parseFloat(e.target.value) || 0)}
                className={`${INPUT} w-24 text-right`}
              />
              <button
                onClick={() => eliminar(i)}
                disabled={pagos.length <= 1}
                className="text-[#666] hover:text-[#FF5A4F] disabled:opacity-30 disabled:cursor-not-allowed text-sm px-1"
                title="Quitar"
              >
                ✕
              </button>
            </div>
            <p className="pl-1 text-[10px]">
              {esAbono ? (
                <span className="text-emerald-400/80">
                  ● Abono registrado{p.fechaAbono ? ` · ${formatearFechaAbono(p.fechaAbono)}` : ""}
                  {bloqueado && (
                    <button
                      type="button"
                      onClick={() => setDesbloqueados((s) => new Set(s).add(i))}
                      className="ml-2 underline text-[#666] hover:text-[#D7FF4F]"
                    >
                      editar monto
                    </button>
                  )}
                </span>
              ) : (
                <span className="text-[#F0C75E]/80">● Saldo por cobrar</span>
              )}
            </p>
          </div>
        );
      })}
      <button
        onClick={agregar}
        className="self-start text-xs text-[#A7A7A7] hover:text-[#D7FF4F] underline"
      >
        + Agregar forma de pago
      </button>
      <p className="text-xs text-[#666]">Suma: ${suma.toFixed(2)}</p>
    </div>
  );
}

// Banner de bloqueo — gancho Fase 16 PR2: la pre-factura no se pudo armar
// (idempotencia o items no listos). No hay formulario que mostrar debajo.
function PreFacturaBloqueadaBanner({ resultado }: { resultado: Extract<ResultadoPreFactura, { bloqueado: true }> }) {
  if (resultado.motivo === "FACTURA_EXISTENTE" && resultado.facturaExistente) {
    const f = resultado.facturaExistente;
    return (
      <div className="rounded-xl border border-[#F0C75E]/40 bg-[#F0C75E]/10 p-6">
        <p className="text-[#F0C75E] font-bold text-lg mb-1">Ya existe una factura para este origen</p>
        <p className="text-[#F5F5F5] text-sm">
          {f.numeroFactura || f.claveAcceso} — estado <strong>{f.estado}</strong>
        </p>
        <a
          href="/facturacion/historial"
          className="mt-4 inline-block rounded-full border border-[#3A3A36] px-4 py-2 text-xs text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]"
        >
          Ver historial de facturas
        </a>
      </div>
    );
  }

  if (resultado.motivo === "PRODUCTOS_DIGITALES_SIN_PRECIO") {
    return (
      <div className="rounded-xl border border-[#F0C75E]/40 bg-[#F0C75E]/10 p-6">
        <p className="text-[#F0C75E] font-bold text-lg mb-2">No se puede facturar todavía</p>
        <p className="text-[#A7A7A7] text-sm mb-3">
          Algunos productos digitales de esta orden no tienen Precio Venta:
        </p>
        <ul className="flex flex-col gap-1">
          {(resultado.productosDigitalesNoListos ?? []).map((item) => (
            <li key={item.id} className="text-sm text-[#F5F5F5]">
              {item.nombre} — <span className="text-[#F0C75E]">falta poner su Precio Venta</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#F0C75E]/40 bg-[#F0C75E]/10 p-6">
      <p className="text-[#F0C75E] font-bold text-lg mb-2">No se puede facturar todavía</p>
      <p className="text-[#A7A7A7] text-sm mb-3">
        Algunos productos de esta cuenta no están listos para facturarse:
      </p>
      <ul className="flex flex-col gap-1">
        {(resultado.itemsNoListos ?? []).map((item) => (
          <li key={item.id} className="text-sm text-[#F5F5F5]">
            {item.nombre} —{" "}
            <span className="text-[#F0C75E]">
              {item.motivo === "NO_RESERVADO"
                ? "no está Reservado"
                : item.motivo === "SIN_STOCK"
                ? "no tiene stock disponible"
                : item.motivo === "SIN_PRECIO_FINAL"
                ? "no tiene Precio venta final"
                : "ya tiene una factura vinculada"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultadoBanner({
  resultado,
  onNueva,
  onCorregir,
}: {
  resultado:   ResultadoEmision;
  onNueva:     () => void;
  onCorregir?: () => void;
}) {
  if (resultado.estado === "AUTORIZADO") {
    return (
      <div className="rounded-xl border border-[#6EE7B7]/40 bg-[#064E3B]/40 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[#6EE7B7] font-bold text-lg mb-1">✓ AUTORIZADO</p>
            <p className="text-[#F5F5F5] text-sm font-semibold">Factura {resultado.numeroFactura}</p>
            <p className="text-[#A7A7A7] text-xs mt-1">Autorización: {resultado.numeroAutorizacion}</p>
            {resultado.fechaAutorizacion && (
              <p className="text-[#A7A7A7] text-xs">
                Fecha: {new Date(resultado.fechaAutorizacion).toLocaleString("es-EC")}
              </p>
            )}
          </div>
          <a
            href={`/api/facturacion/ride/${resultado.claveAcceso}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full border border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] px-4 py-2 text-xs font-bold hover:brightness-105"
          >
            Ver / Descargar RIDE
          </a>
        </div>
        <button onClick={onNueva} className="mt-4 text-xs text-[#666] underline hover:text-[#A7A7A7]">
          Nueva factura
        </button>
      </div>
    );
  }

  const mensajes = resultado.mensajes ?? [];
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-900/20 p-5">
      <p className="text-red-400 font-bold mb-2">
        {resultado.estado === "DEVUELTA" ? "⚠ DEVUELTA por el SRI" : "✗ NO AUTORIZADO"}
      </p>
      {mensajes.length > 0 ? (
        <ul className="space-y-1">
          {mensajes.map((m, i) => (
            <li key={i} className="text-sm text-red-300">
              <span className="font-semibold">[{m.identificador}]</span> {m.mensaje}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-red-300">El SRI rechazó el comprobante sin un mensaje detallado.</p>
      )}
      <button onClick={onCorregir ?? onNueva} className="mt-3 text-xs text-[#666] underline hover:text-[#A7A7A7]">
        Corregir y reintentar
      </button>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}
