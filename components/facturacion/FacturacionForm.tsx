"use client";

import { useEffect, useRef, useState } from "react";

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
  airtableId?:       string;
};

const CONSUMIDOR_FINAL: ClienteFactura = {
  modo:               "consumidor",
  tipoIdentificacion: "07",
  identificacion:     "9999999999999",
  razonSocial:        "CONSUMIDOR FINAL",
  correo:             "",
};

type LineaDetalle = {
  _id:            string;
  codigoPrincipal:string;
  descripcion:    string;
  unidadMedida:   string;
  cantidad:       number;
  precioUnitario: number;
  descuento:      number;
  tarifaIva:      TarifaCodigo;
};

type ProductoCatalogo = {
  id:          string;
  sku:         string;
  nombre:      string;
  descripcion: string;
  precioVenta: number;
  unidad:      string;
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

function validarCedula(v: string): boolean {
  if (!/^\d{10}$/.test(v)) return false;
  const c = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const s = c.reduce((acc, coef, i) => {
    const x = parseInt(v[i], 10) * coef;
    return acc + (x >= 10 ? x - 9 : x);
  }, 0);
  return (10 - (s % 10)) % 10 === parseInt(v[9], 10);
}

function validarIdentificacion(tipo: TipoIdentificacion, id: string): string | null {
  if (tipo === "07") return null;
  const v = id.trim();
  if (!v) return "Identificación requerida";
  if (tipo === "05") {
    if (!validarCedula(v)) return "Cédula inválida (10 dígitos, dígito verificador)";
  }
  if (tipo === "04") {
    if (!/^\d{13}$/.test(v)) return "RUC debe tener 13 dígitos";
  }
  if (tipo === "06" || tipo === "08") {
    if (v.length < 1 || v.length > 20) return "Debe tener entre 1 y 20 caracteres";
  }
  return null;
}

// ─── Helpers numéricos ─────────────────────────────────────────────────────────

function round2(n: number): number { return Math.round(n * 100) / 100; }

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

function calcularTotales(lineas: LineaDetalle[]): TotalesFact {
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

// ─── Clases de input reutilizables ─────────────────────────────────────────────

const INPUT =
  "w-full rounded-md bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] placeholder-[#666] " +
  "focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30 focus:border-[#D7FF4F]/60 disabled:opacity-50";

const SELECT =
  "w-full rounded-md bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] " +
  "focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30 focus:border-[#D7FF4F]/60 disabled:opacity-50";

const LABEL = "block mb-1 text-xs font-semibold text-[#A7A7A7] uppercase tracking-wide";

// ─── Componente principal ─────────────────────────────────────────────────────

export function FacturacionForm({ consumidorFinalLimite = 50 }: { consumidorFinalLimite?: number }) {
  // ── Estado del formulario ─────────────────────────────────────────────────
  const [cliente, setCliente]   = useState<ClienteFactura>(CONSUMIDOR_FINAL);
  const [modoCliente, setModoCliente] = useState<ModoCliente>("consumidor");
  const [lineas, setLineas]     = useState<LineaDetalle[]>([]);
  const [formaPago, setFormaPago] = useState("01");
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEmision | null>(null);
  const [errGlobal, setErrGlobal] = useState<string | null>(null);

  // ── Búsqueda de clientes ──────────────────────────────────────────────────
  const [queryCliente, setQueryCliente] = useState("");
  const [clientesSug, setClientesSug]   = useState<ClienteBusqueda[]>([]);
  const [buscandoCli, setBuscandoCli]   = useState(false);

  // ── Nuevo cliente ──────────────────────────────────────────────────────────
  const [nuevoTipo, setNuevoTipo] = useState<TipoIdentificacion>("05");
  const [nuevoId, setNuevoId]     = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [nuevoTel, setNuevoTel]   = useState("");
  const [nuevoDir, setNuevoDir]   = useState("");
  const [errNuevo, setErrNuevo]   = useState<string | null>(null);
  const [savingNuevo, setSavingNuevo] = useState(false);

  // ── Búsqueda de productos ─────────────────────────────────────────────────
  const [queryProducto, setQueryProducto] = useState("");
  const [productosSug, setProductosSug]   = useState<ProductoCatalogo[]>([]);
  const [buscandoProd, setBuscandoProd]   = useState(false);
  const productoRef = useRef<HTMLInputElement>(null);

  // ── Debounce clientes ─────────────────────────────────────────────────────
  useEffect(() => {
    if (modoCliente !== "buscar") return;
    const q = queryCliente.trim();
    if (q.length < 2) { setClientesSug([]); return; }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setBuscandoCli(true);
      try {
        const r = await fetch(`/api/facturacion/clientes?q=${encodeURIComponent(q)}`);
        const j = (await r.json()) as { success: boolean; data: ClienteBusqueda[] };
        if (!cancelled && j.success) setClientesSug(j.data);
      } finally {
        if (!cancelled) setBuscandoCli(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [queryCliente, modoCliente]);

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

  // ── Cambio de modo cliente ────────────────────────────────────────────────
  function switchModo(m: ModoCliente) {
    setModoCliente(m);
    setQueryCliente("");
    setClientesSug([]);
    setErrGlobal(null);
    if (m === "consumidor") setCliente(CONSUMIDOR_FINAL);
    else setCliente({ modo: m, tipoIdentificacion: nuevoTipo, identificacion: "", razonSocial: "", correo: "" });
  }

  function seleccionarClienteExistente(c: ClienteBusqueda) {
    // Deducir tipo por longitud de cédula
    let tipo: TipoIdentificacion = "05";
    if (c.cedula.length === 13) tipo = "04";
    else if (c.cedula.length !== 10) tipo = "06";

    setCliente({
      modo:               "buscar",
      tipoIdentificacion: tipo,
      identificacion:     c.cedula,
      razonSocial:        c.nombre,
      correo:             c.correo ?? "",
      airtableId:         c.id,
    });
    setQueryCliente(c.nombre);
    setClientesSug([]);
  }

  async function crearNuevoCliente() {
    setErrNuevo(null);
    const errId = validarIdentificacion(nuevoTipo, nuevoId);
    if (errId) { setErrNuevo(errId); return; }
    if (!nuevoNombre.trim()) { setErrNuevo("Nombre requerido"); return; }

    setSavingNuevo(true);
    try {
      const r = await fetch("/api/facturacion/clientes", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          nombre:    nuevoNombre.trim(),
          cedula:    nuevoId.trim(),
          telefono:  nuevoTel.trim() || undefined,
          correo:    nuevoCorreo.trim() || undefined,
          direccion: nuevoDir.trim() || undefined,
        }),
      });
      const j = (await r.json()) as { success: boolean; data?: ClienteBusqueda; error?: string };
      if (!j.success) { setErrNuevo(j.error ?? "Error creando cliente"); return; }
      // Seleccionar el cliente recién creado
      setCliente({
        modo:               "nuevo",
        tipoIdentificacion: nuevoTipo,
        identificacion:     nuevoId.trim(),
        razonSocial:        nuevoNombre.trim(),
        correo:             nuevoCorreo.trim(),
        airtableId:         j.data?.id,
      });
      switchModo("buscar");
      setQueryCliente(nuevoNombre.trim());
    } finally {
      setSavingNuevo(false);
    }
  }

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
  const totales = calcularTotales(lineas);

  // Regla SRI: Consumidor Final solo permitido hasta el límite configurado
  const excedeLimiteConsumidor =
    modoCliente === "consumidor" && totales.importeTotal >= consumidorFinalLimite;

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

    // Construir DatosVenta
    const detalles = lineas.map((l) => {
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
      totalDescuento:    totales.totalDescuento,
      totalConImpuestos,
      importeTotal:      totales.importeTotal,
      pagos: [{ formaPago, total: totales.importeTotal }],
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

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl pb-20">

      {/* ── RESULTADO ──────────────────────────────────────────────────── */}
      {resultado && (
        <ResultadoBanner
          resultado={resultado}
          onNueva={() => {
            setResultado(null);
            setLineas([]);
            setCliente(CONSUMIDOR_FINAL);
            setModoCliente("consumidor");
            setQueryCliente("");
            setFormaPago("01");
          }}
        />
      )}

      {/* ── 1. CLIENTE ──────────────────────────────────────────────────── */}
      <Card titulo="1. Cliente">
        {/* Tabs de modo */}
        <div className="flex gap-2 mb-4">
          {(["consumidor", "buscar", "nuevo"] as ModoCliente[]).map((m) => (
            <button
              key={m}
              onClick={() => switchModo(m)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-bold transition",
                modoCliente === m
                  ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]"
                  : "border-[#3A3A36] bg-transparent text-[#A7A7A7] hover:text-[#F5F5F5]",
              ].join(" ")}
            >
              {m === "consumidor" ? "Consumidor Final" : m === "buscar" ? "Buscar existente" : "Cliente nuevo"}
            </button>
          ))}
        </div>

        {/* Consumidor final */}
        {modoCliente === "consumidor" && (
          <div className="rounded-md bg-[#252622] border border-[#3A3A36] px-4 py-3 text-sm text-[#A7A7A7]">
            <span className="text-[#F5F5F5] font-semibold">CONSUMIDOR FINAL</span>
            <span className="ml-2">— 07 / 9999999999999 — sin email</span>
          </div>
        )}

        {/* Búsqueda existente */}
        {modoCliente === "buscar" && (
          <div className="relative">
            <label className={LABEL}>Buscar por nombre, cédula o teléfono</label>
            <input
              type="text"
              value={queryCliente}
              onChange={(e) => { setQueryCliente(e.target.value); setCliente({ ...CONSUMIDOR_FINAL, modo: "buscar" }); }}
              placeholder="Escribe 2+ caracteres…"
              className={INPUT}
            />
            {buscandoCli && <p className="mt-1 text-xs text-[#666]">Buscando…</p>}
            {clientesSug.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full rounded-md border border-[#3A3A36] bg-[#1A1B18] shadow-xl divide-y divide-[#2A2B28]">
                {clientesSug.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => seleccionarClienteExistente(c)}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#252622] text-sm"
                    >
                      <p className="font-semibold text-[#F5F5F5]">{c.nombre}</p>
                      <p className="text-[#666] text-xs">{c.cedula} · {c.telefono} · {c.correo}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* Cliente seleccionado */}
            {cliente.identificacion && (
              <ClienteSeleccionado
                cliente={cliente}
                onChange={(field, val) => setCliente((p) => ({ ...p, [field]: val }))}
              />
            )}
          </div>
        )}

        {/* Nuevo cliente */}
        {modoCliente === "nuevo" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Tipo de identificación</label>
              <select value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as TipoIdentificacion)} className={SELECT}>
                <option value="05">{TIPO_LABEL["05"]}</option>
                <option value="04">{TIPO_LABEL["04"]}</option>
                <option value="06">{TIPO_LABEL["06"]}</option>
                <option value="08">{TIPO_LABEL["08"]}</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Número de identificación</label>
              <input type="text" value={nuevoId} onChange={(e) => { setNuevoId(e.target.value); setErrNuevo(null); }} placeholder="Cédula / RUC / Pasaporte" className={INPUT} />
            </div>
            <div className="col-span-2">
              <label className={LABEL}>Razón social / Nombres y apellidos</label>
              <input type="text" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} className={INPUT} placeholder="Nombre completo" />
            </div>
            <div>
              <label className={LABEL}>Email (para RIDE)</label>
              <input type="email" value={nuevoCorreo} onChange={(e) => setNuevoCorreo(e.target.value)} className={INPUT} placeholder="cliente@email.com" />
            </div>
            <div>
              <label className={LABEL}>Teléfono</label>
              <input type="text" value={nuevoTel} onChange={(e) => setNuevoTel(e.target.value)} className={INPUT} placeholder="09XXXXXXXX" />
            </div>
            <div className="col-span-2">
              <label className={LABEL}>Dirección</label>
              <input type="text" value={nuevoDir} onChange={(e) => setNuevoDir(e.target.value)} className={INPUT} placeholder="Dirección del cliente" />
            </div>
            {errNuevo && <p className="col-span-2 text-xs text-red-400">{errNuevo}</p>}
            <div className="col-span-2">
              <button
                onClick={crearNuevoCliente}
                disabled={savingNuevo}
                className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] px-4 py-1.5 text-sm font-bold hover:brightness-105 disabled:opacity-50"
              >
                {savingNuevo ? "Guardando…" : "Guardar cliente"}
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ── 2. DETALLES ────────────────────────────────────────────────── */}
      <Card titulo="2. Productos / Servicios">
        {/* Aviso IVA */}
        <p className="mb-3 text-xs text-[#FFB07A] bg-[#FF914D]/10 border border-[#FF914D]/30 rounded px-3 py-2">
          <strong>NOTA:</strong> Los productos de Shipping Items no tienen campo de IVA registrado.
          Se asigna IVA 15% por defecto; puedes ajustarlo por línea. Agrega el campo "Tarifa IVA"
          a la tabla Shipping Items para automatizarlo.
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
                    <p className="text-[#666] text-xs">{p.sku} · {p.unidad} · ${p.precioVenta.toFixed(2)}</p>
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
                  <th className="py-2 pr-2 text-right font-semibold w-24">P.Unit.</th>
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
          {/* Forma de pago */}
          <div className="md:w-64">
            <label className={LABEL}>Forma de pago</label>
            <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className={SELECT}>
              {FORMAS_PAGO.map((fp) => (
                <option key={fp.codigo} value={fp.codigo}>{fp.label}</option>
              ))}
            </select>
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
              <p className="text-xs text-[#A7A7A7] mb-2">
                El SRI no permite Consumidor Final para facturas que superen este monto.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => switchModo("buscar")}
                  className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] px-3 py-1 text-xs font-bold hover:brightness-105"
                >
                  Buscar cliente existente
                </button>
                <button
                  onClick={() => switchModo("nuevo")}
                  className="rounded-full border border-[#3A3A36] px-3 py-1 text-xs text-[#A7A7A7] hover:text-[#F5F5F5] hover:border-[#D7FF4F]/60"
                >
                  Ingresar cliente nuevo
                </button>
              </div>
            </div>
          )}

          {errGlobal && (
            <p className="w-full rounded-md bg-red-900/30 border border-red-500/40 px-4 py-3 text-sm text-red-300">
              {errGlobal}
            </p>
          )}
          <button
            onClick={handleEmitir}
            disabled={emitiendo || !clienteOk || lineas.length === 0 || !!resultado || excedeLimiteConsumidor}
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

function ClienteSeleccionado({
  cliente,
  onChange,
}: {
  cliente: ClienteFactura;
  onChange: (field: keyof ClienteFactura, val: string) => void;
}) {
  const errId = validarIdentificacion(cliente.tipoIdentificacion, cliente.identificacion);
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <div>
        <label className={LABEL}>Tipo identificación</label>
        <select
          value={cliente.tipoIdentificacion}
          onChange={(e) => onChange("tipoIdentificacion", e.target.value)}
          className={SELECT}
        >
          {(["04","05","06","07","08"] as TipoIdentificacion[]).map((t) => (
            <option key={t} value={t}>{TIPO_LABEL[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL}>Identificación</label>
        <input
          type="text"
          value={cliente.identificacion}
          onChange={(e) => onChange("identificacion", e.target.value)}
          className={INPUT + (errId ? " border-red-500" : "")}
        />
        {errId && <p className="mt-0.5 text-xs text-red-400">{errId}</p>}
      </div>
      <div>
        <label className={LABEL}>Razón social / Nombre</label>
        <input type="text" value={cliente.razonSocial} onChange={(e) => onChange("razonSocial", e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Email (para RIDE)</label>
        <input type="email" value={cliente.correo} onChange={(e) => onChange("correo", e.target.value)} placeholder="Opcional" className={INPUT} />
      </div>
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
      <td className="py-1.5 pr-2">
        <input type="text" value={linea.codigoPrincipal} onChange={(e) => onChange("codigoPrincipal", e.target.value)} className="w-20 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30" placeholder="SKU" />
      </td>
      <td className="py-1.5 pr-2">
        <input type="text" value={linea.descripcion} onChange={(e) => onChange("descripcion", e.target.value)} className="w-full min-w-[160px] rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30" placeholder="Descripción" />
      </td>
      <td className="py-1.5 pr-2 text-center">
        <input type="text" value={linea.unidadMedida} onChange={(e) => onChange("unidadMedida", e.target.value)} className="w-16 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-center text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30" />
      </td>
      <td className="py-1.5 pr-2">
        <input type="number" min="0.01" step="0.01" value={linea.cantidad} onChange={(e) => onChange("cantidad", parseFloat(e.target.value) || 0)} className="w-16 rounded bg-[#252622] border border-[#3A3A36] px-2 py-1 text-xs text-right text-[#F5F5F5] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/30" />
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

function ResultadoBanner({
  resultado,
  onNueva,
}: {
  resultado: ResultadoEmision;
  onNueva:   () => void;
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
      <button onClick={onNueva} className="mt-3 text-xs text-[#666] underline hover:text-[#A7A7A7]">
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
