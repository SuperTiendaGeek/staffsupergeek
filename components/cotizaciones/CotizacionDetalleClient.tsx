"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CUENTAS_DESTINO_ABONO_COTIZACION,
  ESTADOS_COTIZACION,
  ESTADOS_OPCION_COTIZACION,
  METODOS_PAGO_ABONO_COTIZACION,
  TIEMPOS_ESTIMADOS_OPCION_COTIZACION,
  type AbonoCotizacion,
  type AirtableAttachment,
  type CotizacionDetalle,
  type OpcionCotizacion,
  type ProveedorCotizacion,
} from "@/types/cotizaciones";
import { formatStableDateTime } from "@/components/cotizaciones/utils/formatDate";
import { copyImageToClipboard } from "@/lib/client/clipboard-images";
import {
  buildOpcionWhatsAppMessage,
  buildTodasOpcionesWhatsAppMessage,
  buildWhatsAppUrl,
} from "@/lib/cotizaciones/whatsapp-message";

type Props = {
  initialCotizacion: CotizacionDetalle;
  proveedores: ProveedorCotizacion[];
  canSeeInternalCosts: boolean;
};

type ApiResponse = {
  success?: boolean;
  data?: unknown;
  error?: string;
};

type OptionForm = {
  productoDescripcion: string;
  proveedorId: string;
  urlProveedor: string;
  tiempoEstimado: string;
  costoProveedor: string;
  precioVentaCliente: string;
  estado: string;
  notaInterna: string;
  notaParaCliente: string;
};

type AbonoForm = {
  monto: string;
  metodoPago: string;
  cuentaDestino: string;
  numeroTransaccion: string;
  observacion: string;
};

type SkuCheckResponse = {
  sku?: string;
  available?: boolean;
  exists?: boolean;
  message?: string;
};

const emptyOptionForm: OptionForm = {
  productoDescripcion: "",
  proveedorId: "",
  urlProveedor: "",
  tiempoEstimado: "Por confirmar",
  costoProveedor: "",
  precioVentaCliente: "",
  estado: "Disponible",
  notaInterna: "",
  notaParaCliente: "",
};

const emptyAbonoForm: AbonoForm = {
  monto: "",
  metodoPago: "Efectivo",
  cuentaDestino: "Caja",
  numeroTransaccion: "",
  observacion: "",
};

function money(value: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function numberOrNull(value: string) {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOptionConverted(opcion: OpcionCotizacion) {
  return opcion.itemPedidoGeneradoIds.length > 0 || opcion.estado === "Convertida en pedido";
}

async function parseApi(response: Response): Promise<ApiResponse | null> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return null;
  }
}

export function CotizacionDetalleClient({ initialCotizacion, proveedores, canSeeInternalCosts }: Props) {
  const [cotizacion, setCotizacion] = useState(initialCotizacion);
  const [opciones, setOpciones] = useState(initialCotizacion.opciones);
  const [abonos, setAbonos] = useState(initialCotizacion.abonos);
  const [estadoSaving, setEstadoSaving] = useState(false);
  const [optionForm, setOptionForm] = useState<OptionForm>(emptyOptionForm);
  const [optionFotos, setOptionFotos] = useState<File[]>([]);
  const [editingFotosExistentes, setEditingFotosExistentes] = useState<AirtableAttachment[]>([]);
  const [optionSaving, setOptionSaving] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [deletingOptionId, setDeletingOptionId] = useState<string | null>(null);
  const editFotosInputRef = useRef<HTMLInputElement | null>(null);
  const [abonoForm, setAbonoForm] = useState<AbonoForm>(emptyAbonoForm);
  const [showAbonoForm, setShowAbonoForm] = useState(false);
  const [abonoSaving, setAbonoSaving] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [convertingPedido, setConvertingPedido] = useState(false);
  const [showSkuModal, setShowSkuModal] = useState(false);
  const [skuInterno, setSkuInterno] = useState("");
  const [skuProveedor, setSkuProveedor] = useState("");
  const [skuMessage, setSkuMessage] = useState<string | null>(null);
  const [skuAvailable, setSkuAvailable] = useState(false);
  const [skuChecking, setSkuChecking] = useState(false);
  const [skuGenerating, setSkuGenerating] = useState(false);
  const [pedidoMessage, setPedidoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optionSuccess, setOptionSuccess] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [imageCopyMessage, setImageCopyMessage] = useState<string | null>(null);
  const whatsappUrl = useMemo(
    () =>
      buildWhatsAppUrl(
        cotizacion.clienteTelefono,
        `Hola ${cotizacion.clienteNombre}, te escribimos de SUPER GEEK sobre tu cotización ${cotizacion.codigo} para ${cotizacion.productoSolicitado}.`
      ),
    [cotizacion]
  );
  const opcionesDisponibles = useMemo(
    () => opciones.filter((opcion) => opcion.estado !== "No Disponible" && opcion.estado !== "Descartada"),
    [opciones]
  );
  const todasOpcionesMessage = useMemo(
    () => buildTodasOpcionesWhatsAppMessage(cotizacion, opciones),
    [cotizacion, opciones]
  );
  const todasOpcionesWhatsAppUrl = useMemo(
    () => buildWhatsAppUrl(cotizacion.clienteTelefono, todasOpcionesMessage),
    [cotizacion.clienteTelefono, todasOpcionesMessage]
  );
  const proveedoresById = useMemo(
    () => new Map(proveedores.map((proveedor) => [proveedor.id, proveedor])),
    [proveedores]
  );
  const showAbonos = cotizacion.estado === "Aprobada" || cotizacion.estado === "Convertida en Pedido";
  const selectedOption = opciones.find((opcion) => opcion.seleccionadaPorCliente) || null;
  const selectedOptionProveedor = selectedOption?.proveedorRecordIds[0]
    ? proveedoresById.get(selectedOption.proveedorRecordIds[0])
    : null;
  const registeredAbonosTotal = abonos
    .filter((abono) => abono.estado === "Registrado")
    .reduce((sum, abono) => sum + (abono.monto ?? 0), 0);
  const convertBlockReason = cotizacion.itemPedidoId
    ? "Esta cotización ya fue convertida en pedido."
    : cotizacion.estado !== "Aprobada"
      ? "La cotización debe estar aprobada."
      : !selectedOption
        ? "Selecciona una opción."
        : !selectedOption.proveedorRecordIds[0]
          ? "La opción seleccionada no tiene proveedor."
        : registeredAbonosTotal <= 0
          ? "Registra al menos un abono."
          : "";
  const canConvertPedido = !convertBlockReason;
  const editingOption = editingOptionId
    ? opciones.find((opcion) => opcion.id === editingOptionId) || null
    : null;
  const optionFotoPreviews = useMemo(
    () => optionFotos.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [optionFotos]
  );

  useEffect(() => {
    return () => {
      optionFotoPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [optionFotoPreviews]);

  async function updateEstado(nextEstado: string) {
    setEstadoSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/cotizaciones/${cotizacion.id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nextEstado }),
      });
      const payload = await parseApi(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo actualizar el estado.");
      }
      setCotizacion(payload.data as CotizacionDetalle);
    } catch (stateError) {
      setError(stateError instanceof Error ? stateError.message : "Error inesperado");
    } finally {
      setEstadoSaving(false);
    }
  }

  async function addOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOptionSuccess(null);

    if (!optionForm.productoDescripcion.trim()) {
      setError("El producto o descripción de la opción es obligatorio.");
      return;
    }

    if (!optionForm.proveedorId) {
      setError("Selecciona el proveedor de la opción.");
      return;
    }

    setOptionSaving(true);
    try {
      const formData = new FormData();
      formData.set("productoDescripcion", optionForm.productoDescripcion);
      formData.set("proveedorId", optionForm.proveedorId);
      formData.set("urlProveedor", optionForm.urlProveedor);
      formData.set("tiempoEstimado", optionForm.tiempoEstimado);
      formData.set("costoProveedor", optionForm.costoProveedor);
      formData.set("precioVentaCliente", optionForm.precioVentaCliente);
      formData.set("estado", optionForm.estado);
      formData.set("notaInterna", optionForm.notaInterna);
      formData.set("notaParaCliente", optionForm.notaParaCliente);
      if (editingOptionId) {
        formData.set(
          "fotosExistentesJson",
          JSON.stringify(
            editingFotosExistentes.map((foto) => ({
              id: foto.id,
              url: foto.url,
              filename: foto.filename,
            }))
          )
        );
      }
      optionFotos.forEach((file) => formData.append("fotos", file));

      const response = await fetch(editingOptionId ? `/api/cotizaciones/opciones/${editingOptionId}` : `/api/cotizaciones/${cotizacion.id}/opciones`, {
        method: editingOptionId ? "PATCH" : "POST",
        body: formData,
      });
      const payload = await parseApi(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || (editingOptionId ? "No se pudo actualizar la opción." : "No se pudo crear la opción."));
      }
      const savedOption = payload.data as OpcionCotizacion;
      setOpciones((current) =>
        editingOptionId
          ? current.map((opcion) => (opcion.id === savedOption.id ? savedOption : opcion))
          : [...current, savedOption]
      );
      setOptionForm(emptyOptionForm);
      setOptionFotos([]);
      setEditingFotosExistentes([]);
      setEditingOptionId(null);
      setOptionSuccess(editingOptionId ? "Opción actualizada correctamente." : "Opción creada correctamente.");
    } catch (optionError) {
      setError(optionError instanceof Error ? optionError.message : "Error inesperado");
    } finally {
      setOptionSaving(false);
    }
  }

  function startEditingOption(opcion: OpcionCotizacion) {
    if (isOptionConverted(opcion)) {
      setError("No se puede editar una opción que ya fue convertida en pedido.");
      return;
    }
    setEditingOptionId(opcion.id);
    setError(null);
    setOptionSuccess(null);
    setOptionFotos([]);
    setEditingFotosExistentes(opcion.fotos);
    setOptionForm({
      productoDescripcion: opcion.descripcion || opcion.nombre,
      proveedorId: opcion.proveedorRecordIds[0] || "",
      urlProveedor: opcion.urlProveedor,
      tiempoEstimado: opcion.tiempoEstimado || "Por confirmar",
      costoProveedor: opcion.costoProveedor === null ? "" : String(opcion.costoProveedor),
      precioVentaCliente:
        opcion.precioVentaCliente === null ? "" : String(opcion.precioVentaCliente),
      estado: opcion.estado || "Disponible",
      notaInterna: opcion.notaInterna,
      notaParaCliente: opcion.notaParaCliente,
    });
  }

  function cancelEditingOption() {
    setEditingOptionId(null);
    setOptionForm(emptyOptionForm);
    setOptionFotos([]);
    setEditingFotosExistentes([]);
  }

  function setSelectedOptionFotos(files: File[], mode: "replace" | "append" = "replace") {
    setError(null);
    const nextFiles = mode === "append" ? [...optionFotos, ...files] : files;
    if (nextFiles.length > 5) {
      setError("Puedes subir hasta 5 fotos por vez.");
      return;
    }
    if (nextFiles.some((file) => !file.type.startsWith("image/"))) {
      setError("Solo se permiten imágenes.");
      return;
    }
    if (nextFiles.some((file) => file.size > 10 * 1024 * 1024)) {
      setError("Una de las imágenes supera el límite de 10 MB.");
      return;
    }
    setOptionFotos(nextFiles);
  }

  function removeNewOptionFoto(index: number) {
    setOptionFotos((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function deleteOption(opcion: OpcionCotizacion) {
    if (isOptionConverted(opcion)) {
      setError("No se puede eliminar una opción que ya fue convertida en pedido.");
      return;
    }
    if (!window.confirm("¿Seguro que deseas eliminar esta opción de cotización?")) return;

    setDeletingOptionId(opcion.id);
    setError(null);
    try {
      const response = await fetch(`/api/cotizaciones/opciones/${opcion.id}`, { method: "DELETE" });
      const payload = await parseApi(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo eliminar la opción.");
      }
      setOpciones((current) => current.filter((item) => item.id !== opcion.id));
      if (editingOptionId === opcion.id) cancelEditingOption();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Error inesperado");
    } finally {
      setDeletingOptionId(null);
    }
  }

  async function seleccionar(opcion: OpcionCotizacion) {
    if (!window.confirm(`¿Marcar "${opcion.nombre}" como opción seleccionada por el cliente?`)) {
      return;
    }

    setSelectingId(opcion.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/cotizaciones/${cotizacion.id}/opciones/${opcion.id}/seleccionar`,
        { method: "POST" }
      );
      const payload = await parseApi(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo seleccionar la opción.");
      }
      const selectionData = payload.data as { selected?: OpcionCotizacion; cotizacion?: CotizacionDetalle };
      const selectedOption = selectionData.selected || opcion;
      const updatedCotizacion = selectionData.cotizacion;

      setOpciones((current) =>
        current.map((item) =>
          item.id === opcion.id
            ? { ...item, ...selectedOption, seleccionadaPorCliente: true, estado: "Seleccionada" }
            : {
                ...item,
                seleccionadaPorCliente: false,
                estado: item.estado === "Seleccionada" ? "Ofrecida al Cliente" : item.estado,
              }
        )
      );
      if (updatedCotizacion) {
        setCotizacion(updatedCotizacion);
        setAbonos(updatedCotizacion.abonos || []);
      } else {
        setCotizacion((current) => ({
          ...current,
          estado: "Aprobada",
          totalCotizado: opcion.precioVentaCliente,
          saldoPendiente:
            opcion.precioVentaCliente === null
              ? current.saldoPendiente
              : opcion.precioVentaCliente - (current.totalAbonado ?? 0),
        }));
      }
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "Error inesperado");
    } finally {
      setSelectingId(null);
    }
  }

  async function copyMessage(message: string, label: string) {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedMessage(label);
      window.setTimeout(() => setCopiedMessage(null), 2200);
    } catch {
      setError("No se pudo copiar el mensaje al portapapeles.");
    }
  }

  function showImageCopyMessage(message: string) {
    setImageCopyMessage(message);
    window.setTimeout(() => setImageCopyMessage(null), 3200);
  }

  async function copyOptionImage(url: string) {
    setError(null);
    try {
      await copyImageToClipboard(url);
      showImageCopyMessage("Imagen copiada. Pégala en WhatsApp.");
    } catch (copyError) {
      showImageCopyMessage(
        copyError instanceof Error
          ? copyError.message
          : "No se pudo copiar la imagen. Abre la foto y cópiala manualmente."
      );
    }
  }


  async function addAbono(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const monto = numberOrNull(abonoForm.monto);
    if (monto === null || monto <= 0) {
      setError("El monto del abono debe ser mayor a 0.");
      return;
    }

    if (!METODOS_PAGO_ABONO_COTIZACION.includes(abonoForm.metodoPago as (typeof METODOS_PAGO_ABONO_COTIZACION)[number])) {
      setError("Selecciona un método de pago válido.");
      return;
    }

    setAbonoSaving(true);
    try {
      const response = await fetch(`/api/cotizaciones/${cotizacion.id}/abonos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(abonoForm),
      });
      const payload = await parseApi(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo registrar el abono.");
      }
      const data = payload.data as {
        abonos?: AbonoCotizacion[];
        cotizacion?: CotizacionDetalle;
      };
      if (data.cotizacion) {
        setCotizacion(data.cotizacion);
      }
      if (data.abonos) {
        setAbonos(data.abonos);
      }
      setAbonoForm(emptyAbonoForm);
      setShowAbonoForm(false);
    } catch (abonoError) {
      setError(abonoError instanceof Error ? abonoError.message : "Error inesperado");
    } finally {
      setAbonoSaving(false);
    }
  }

  function openSkuModal() {
    if (!canConvertPedido) return;
    setSkuInterno("");
    setSkuProveedor("");
    setSkuMessage(null);
    setSkuAvailable(false);
    setShowSkuModal(true);
  }

  async function generarSku() {
    setSkuGenerating(true);
    setSkuMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/items/sku/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cotizacion.categoria }),
      });
      const payload = (await response.json().catch(() => null)) as { sku?: string; error?: string } | null;
      if (!response.ok || !payload?.sku) {
        throw new Error(payload?.error || "No se pudo generar el SKU.");
      }
      setSkuInterno(payload.sku);
      setSkuAvailable(true);
      setSkuMessage("SKU disponible.");
    } catch (skuError) {
      setSkuAvailable(false);
      setSkuMessage(skuError instanceof Error ? skuError.message : "Error inesperado");
    } finally {
      setSkuGenerating(false);
    }
  }

  async function validarSku() {
    const cleanSku = skuInterno.trim().toUpperCase();
    setSkuInterno(cleanSku);
    setSkuChecking(true);
    setSkuMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/items/sku/check?sku=${encodeURIComponent(cleanSku)}`);
      const payload = (await response.json().catch(() => null)) as SkuCheckResponse | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.message || "No se pudo validar el SKU.");
      }
      setSkuInterno(payload.sku || cleanSku);
      setSkuAvailable(Boolean(payload.available));
      setSkuMessage(
        payload.available
          ? "SKU disponible."
          : payload.message || "Este SKU ya está usado en otro item. Puedes guardar el código original como SKU proveedor y generar un SKU interno nuevo."
      );
      return Boolean(payload.available);
    } catch (skuError) {
      setSkuAvailable(false);
      setSkuMessage(skuError instanceof Error ? skuError.message : "Error inesperado");
      return false;
    } finally {
      setSkuChecking(false);
    }
  }

  async function convertirPedido() {
    if (!canConvertPedido) return;
    if (!skuInterno.trim()) {
      setSkuMessage("Ingresa un SKU interno para convertir en pedido.");
      return;
    }

    const isAvailable = skuAvailable || (await validarSku());
    if (!isAvailable) return;

    setConvertingPedido(true);
    setPedidoMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/cotizaciones/${cotizacion.id}/convertir-pedido`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuInterno,
          skuProveedor,
        }),
      });
      const payload = await parseApi(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo convertir la cotización en pedido.");
      }
      const data = payload.data as { itemId?: string; cotizacion?: CotizacionDetalle };
      if (data.cotizacion) {
        setCotizacion(data.cotizacion);
        setOpciones(data.cotizacion.opciones || opciones);
        setAbonos(data.cotizacion.abonos || abonos);
      }
      setPedidoMessage(`Pedido creado: ${data.itemId || data.cotizacion?.itemPedidoId || "Item registrado"}`);
      setShowSkuModal(false);
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : "Error inesperado");
    } finally {
      setConvertingPedido(false);
    }
  }

  function proveedorLabel(opcion: OpcionCotizacion) {
    const proveedorId = opcion.proveedorRecordIds[0];
    const proveedor = proveedorId ? proveedoresById.get(proveedorId) : null;
    if (proveedor) {
      return `${proveedor.nombre}${proveedor.direccion ? ` · ${proveedor.direccion}` : ""}`;
    }
    return opcion.proveedor || "-";
  }

  return (
    <>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-normal text-geek-lime">{cotizacion.codigo}</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">{cotizacion.productoSolicitado}</h2>
              <p className="mt-2 text-sm text-zinc-300">{cotizacion.descripcionRequerimiento || "Sin descripción"}</p>
            </div>
            <select
              value={cotizacion.estado}
              onChange={(event) => updateEstado(event.target.value)}
              disabled={estadoSaving}
              className="h-11 rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm font-semibold text-white outline-none focus:border-geek-lime disabled:opacity-60"
            >
              {ESTADOS_COTIZACION.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label="Total cotizado" value={money(cotizacion.totalCotizado)} />
            <Metric label="Total abonado" value={money(cotizacion.totalAbonado)} />
            <Metric label="Saldo pendiente" value={money(cotizacion.saldoPendiente)} />
          </div>
        </section>

        {showAbonos ? (
          <section className="rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Abonos de cotización</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Registra pagos o anticipos del cliente para esta cotización.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAbonoForm((current) => !current)}
                className="rounded-xl border border-geek-lime bg-geek-lime px-4 py-2.5 text-sm font-extrabold text-black shadow-glow transition hover:brightness-95"
              >
                {showAbonoForm ? "Cerrar formulario" : "Registrar abono"}
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric label="Total cotizado" value={money(cotizacion.totalCotizado)} />
              <Metric label="Total abonado" value={money(cotizacion.totalAbonado)} />
              <Metric label="Saldo pendiente" value={money(cotizacion.saldoPendiente)} />
            </div>

            {showAbonoForm ? (
              <form onSubmit={addAbono} className="mt-5 rounded-xl border border-white/10 bg-[#111] p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Monto"
                    type="number"
                    value={abonoForm.monto}
                    onChange={(value) => setAbonoForm((current) => ({ ...current, monto: value }))}
                  />
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">
                      Método de Pago
                    </span>
                    <select
                      value={abonoForm.metodoPago}
                      onChange={(event) =>
                        setAbonoForm((current) => ({ ...current, metodoPago: event.target.value }))
                      }
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime"
                    >
                      {METODOS_PAGO_ABONO_COTIZACION.map((metodo) => (
                        <option key={metodo} value={metodo}>
                          {metodo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">
                      Cuenta Destino
                    </span>
                    <select
                      value={abonoForm.cuentaDestino}
                      onChange={(event) =>
                        setAbonoForm((current) => ({ ...current, cuentaDestino: event.target.value }))
                      }
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime"
                    >
                      {CUENTAS_DESTINO_ABONO_COTIZACION.map((cuenta) => (
                        <option key={cuenta} value={cuenta}>
                          {cuenta}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="Número de Transacción"
                    value={abonoForm.numeroTransaccion}
                    onChange={(value) =>
                      setAbonoForm((current) => ({ ...current, numeroTransaccion: value }))
                    }
                  />
                  <TextArea
                    label="Observación"
                    value={abonoForm.observacion}
                    onChange={(value) => setAbonoForm((current) => ({ ...current, observacion: value }))}
                  />
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={abonoSaving}
                    className="rounded-xl border border-geek-lime bg-geek-lime px-5 py-3 text-sm font-extrabold text-black transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
                  >
                    {abonoSaving ? "Guardando..." : "Guardar abono"}
                  </button>
                </div>
              </form>
            ) : null}

            <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="bg-white/[0.035] text-left text-xs uppercase tracking-normal text-zinc-400">
                    <tr>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                      <th className="px-4 py-3">Método</th>
                      <th className="px-4 py-3">Cuenta destino</th>
                      <th className="px-4 py-3">Transacción</th>
                      <th className="px-4 py-3">Registrado por</th>
                      <th className="px-4 py-3">Observación</th>
                      <th className="px-4 py-3">Ticket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {abonos.map((abono) => (
                      <tr key={abono.id} className="text-zinc-300">
                        <td className="px-4 py-3">{formatStableDateTime(abono.fechaAbono)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-white">{money(abono.monto)}</td>
                        <td className="px-4 py-3">{abono.metodoPago}</td>
                        <td className="px-4 py-3">{abono.cuentaDestino || "-"}</td>
                        <td className="px-4 py-3">{abono.numeroTransaccion || "-"}</td>
                        <td className="px-4 py-3">{abono.registradoPor || "-"}</td>
                        <td className="px-4 py-3">{abono.observacion || "-"}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled
                            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-500"
                          >
                            Imprimir ticket
                            <span className="ml-2 text-geek-lime/70">Próxima fase</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {abonos.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                          Todavía no hay abonos registrados.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-white">Opciones de cotización</h2>
            <div className="flex flex-col gap-2 sm:items-end">
              <a
                href={todasOpcionesWhatsAppUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!todasOpcionesWhatsAppUrl || opcionesDisponibles.length === 0}
                className={`inline-flex justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  todasOpcionesWhatsAppUrl && opcionesDisponibles.length > 0
                    ? "border-geek-lime bg-geek-lime text-black hover:brightness-95"
                    : "pointer-events-none border-white/10 bg-[#111] text-zinc-500"
                }`}
              >
                WhatsApp con todas las opciones
              </a>
              {!cotizacion.clienteTelefono ? (
                <p className="text-xs text-zinc-500">No hay teléfono registrado para el cliente.</p>
              ) : null}
              {copiedMessage ? (
                <p className="text-xs font-semibold text-geek-lime">{copiedMessage}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {opciones.map((opcion) => {
              const optionMessage = buildOpcionWhatsAppMessage(cotizacion, opcion);
              const optionWhatsAppUrl = buildWhatsAppUrl(cotizacion.clienteTelefono, optionMessage);

              return (
                <article
                  key={opcion.id}
                  className="rounded-xl border border-white/10 bg-[#111] p-4"
                >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{opcion.nombre}</h3>
                      {opcion.seleccionadaPorCliente ? (
                        <span className="rounded-full bg-geek-lime px-2 py-0.5 text-xs font-bold text-black">
                          Seleccionada
                        </span>
                      ) : null}
                    </div>
                    {opcion.notaParaCliente ? (
                      <p className="mt-1 text-sm text-zinc-300">{opcion.notaParaCliente}</p>
                    ) : null}
                    {opcion.urlProveedor ? (
                      <a
                        href={opcion.urlProveedor}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-sm font-semibold text-geek-lime hover:underline"
                      >
                        Ver proveedor
                      </a>
                    ) : null}
                    <p className="mt-2 text-xs font-semibold uppercase tracking-normal text-zinc-500">
                      Proveedor
                    </p>
                    <p className="mt-1 text-sm text-zinc-300">{proveedorLabel(opcion)}</p>
                    {opcion.urlProveedor ? null : (
                      <p className="mt-2 text-xs text-zinc-500">Sin URL de proveedor</p>
                    )}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs uppercase tracking-normal text-zinc-500">Precio cliente</p>
                    <p className="text-lg font-bold text-white">{money(opcion.precioVentaCliente)}</p>
                  </div>
                </div>

                {opcion.fotos.length > 0 ? (
                  <>
                    <p className="mt-4 text-xs text-zinc-500">
                      Las fotos deben adjuntarse manualmente en WhatsApp.
                    </p>
                    {imageCopyMessage ? (
                      <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-zinc-300">
                        {imageCopyMessage}
                      </p>
                    ) : null}
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {opcion.fotos.map((foto) => (
                        <div
                          key={foto.id || foto.url}
                          className="overflow-hidden rounded-xl border border-white/10 bg-black"
                        >
                          <a
                            href={foto.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group block"
                          >
                            <img
                              src={foto.url}
                              alt={foto.filename || opcion.nombre}
                              className="aspect-square w-full object-cover transition group-hover:scale-105"
                            />
                          </a>
                          <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10">
                            <button
                              type="button"
                              onClick={() => copyOptionImage(foto.url)}
                              className="bg-[#111] px-2 py-2 text-xs font-semibold text-zinc-200 transition hover:text-geek-lime"
                            >
                              Copiar imagen
                            </button>
                            <a
                              href={foto.url}
                              target="_blank"
                              rel="noreferrer"
                              className="bg-[#111] px-2 py-2 text-center text-xs font-semibold text-zinc-200 transition hover:text-geek-lime"
                            >
                              Abrir imagen
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}

                <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 text-sm sm:grid-cols-3">
                  <Metric label="Tiempo estimado" value={opcion.tiempoEstimado || "-"} compact />
                  <Metric label="Estado" value={opcion.estado || "-"} compact />
                </div>

                {canSeeInternalCosts ? (
                  <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 text-sm sm:grid-cols-3">
                    <Metric label="Costo proveedor" value={money(opcion.costoProveedor)} compact />
                    <Metric label="Precio venta" value={money(opcion.precioVentaCliente)} compact />
                    <Metric label="Ganancia" value={money(opcion.gananciaEstimada)} compact />
                  </div>
                ) : null}

                {canSeeInternalCosts && opcion.notaInterna ? (
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <NoteBox label="Observaciones internas" value={opcion.notaInterna} />
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <a
                    href={optionWhatsAppUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!optionWhatsAppUrl}
                    className={`inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition ${
                      optionWhatsAppUrl
                        ? "border-geek-lime bg-geek-lime text-black hover:brightness-95"
                        : "pointer-events-none border-white/10 bg-[#181818] text-zinc-500"
                    }`}
                  >
                    WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() => copyMessage(optionMessage, "Mensaje copiado.")}
                    className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-white/10 px-3 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime"
                  >
                    Copiar
                  </button>
                  {opcion.fotos.length > 0 ? (
                    <a
                      href={`/api/cotizaciones/opciones/${opcion.id}/fotos.zip`}
                      className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-white/10 px-3 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime"
                    >
                      Fotos
                    </a>
                  ) : null}
                  <button
                    type="button"
                    disabled={isOptionConverted(opcion)}
                    onClick={() => startEditingOption(opcion)}
                    title={isOptionConverted(opcion) ? "No se puede editar una opción convertida en pedido." : undefined}
                    className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-white/10 px-3 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={isOptionConverted(opcion) || deletingOptionId === opcion.id}
                    onClick={() => deleteOption(opcion)}
                    className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-red-500/30 px-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingOptionId === opcion.id ? "Eliminando..." : "Eliminar"}
                  </button>
                  {opcion.seleccionadaPorCliente ? (
                    <span className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-geek-lime/30 bg-geek-lime/10 px-3 text-sm font-semibold text-geek-lime">
                      Seleccionada
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={selectingId === opcion.id}
                      onClick={() => seleccionar(opcion)}
                      className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-geek-lime/40 px-3 text-sm font-semibold text-geek-lime transition hover:bg-geek-lime/10 disabled:cursor-wait disabled:opacity-50"
                    >
                      {selectingId === opcion.id ? "Marcando..." : "Seleccionar"}
                    </button>
                  )}
                </div>
              </article>
              );
            })}
            {opciones.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-zinc-400">
                Todavía no hay opciones para esta cotización.
              </p>
            ) : null}
          </div>
        </section>

        <form onSubmit={addOption} className="rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/25">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-white">Agregar opción</h2>
          </div>
          {optionSuccess ? (
            <p className="mt-3 rounded-xl border border-geek-lime/25 bg-geek-lime/10 px-3 py-2 text-sm text-geek-lime">
              {optionSuccess}
            </p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextArea label="Producto / Descripción" value={optionForm.productoDescripcion} onChange={(value) => setOptionForm((current) => ({ ...current, productoDescripcion: value }))} />
            <Field label="URL proveedor" value={optionForm.urlProveedor} onChange={(value) => setOptionForm((current) => ({ ...current, urlProveedor: value }))} />
            <SelectField label="Proveedor" value={optionForm.proveedorId} onChange={(proveedorId) => setOptionForm((current) => ({ ...current, proveedorId }))}>
              <option value="">Seleccionar proveedor</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.nombre}{proveedor.direccion ? ` · ${proveedor.direccion}` : ""}
                </option>
              ))}
            </SelectField>
            <SelectField label="Tiempo estimado" value={optionForm.tiempoEstimado} onChange={(tiempoEstimado) => setOptionForm((current) => ({ ...current, tiempoEstimado }))}>
              {TIEMPOS_ESTIMADOS_OPCION_COTIZACION.map((tiempo) => (
                <option key={tiempo} value={tiempo}>{tiempo}</option>
              ))}
            </SelectField>
            <SelectField label="Estado opción" value={optionForm.estado} onChange={(estado) => setOptionForm((current) => ({ ...current, estado }))}>
              {ESTADOS_OPCION_COTIZACION.map((estado) => (
                <option key={estado} value={estado}>{estado}</option>
              ))}
            </SelectField>
            <Field label="Precio venta cliente" type="number" value={optionForm.precioVentaCliente} onChange={(value) => setOptionForm((current) => ({ ...current, precioVentaCliente: value }))} />
            {canSeeInternalCosts ? (
              <Field label="Costo proveedor" type="number" value={optionForm.costoProveedor} onChange={(value) => setOptionForm((current) => ({ ...current, costoProveedor: value }))} />
            ) : null}
            <FileField files={optionFotos} onChange={setSelectedOptionFotos} />
            <TextArea label="Nota para cliente" value={optionForm.notaParaCliente} onChange={(value) => setOptionForm((current) => ({ ...current, notaParaCliente: value }))} />
            {canSeeInternalCosts ? (
              <TextArea label="Observaciones internas" value={optionForm.notaInterna} onChange={(value) => setOptionForm((current) => ({ ...current, notaInterna: value }))} />
            ) : null}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={optionSaving}
              className="rounded-xl border border-geek-lime bg-geek-lime px-5 py-3 text-sm font-extrabold text-black shadow-glow transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
            >
              {optionSaving && !editingOptionId ? "Guardando..." : "+ Agregar opción"}
            </button>
          </div>
        </form>
      </div>

      <aside className="space-y-4">
        {showAbonos ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
            <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">Pedido</h2>
            {cotizacion.itemPedidoId ? (
              <div className="mt-3 rounded-xl border border-geek-lime/25 bg-geek-lime/10 p-3 text-sm">
                <p className="font-semibold text-geek-lime">Pedido creado</p>
                <p className="mt-1 text-zinc-200">Pedido generado: {cotizacion.itemPedidoId}</p>
                <Link
                  href={`/pedidos/${cotizacion.itemPedidoId}`}
                  className="mt-3 inline-flex w-full justify-center rounded-xl border border-geek-lime bg-geek-lime px-4 py-2.5 text-sm font-extrabold text-black transition hover:brightness-95"
                >
                  Ver pedido
                </Link>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                Convierte esta cotización en un Item cuando el cliente haya elegido una opción y exista al menos un abono registrado.
              </p>
            )}
            {pedidoMessage ? (
              <p className="mt-3 rounded-xl border border-geek-lime/25 bg-geek-lime/10 px-3 py-2 text-sm text-geek-lime">
                {pedidoMessage}
              </p>
            ) : null}
            {!canConvertPedido ? (
              <p className="mt-3 rounded-xl border border-white/10 bg-[#111] px-3 py-2 text-sm text-zinc-300">
                {convertBlockReason}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!canConvertPedido || convertingPedido}
              onClick={openSkuModal}
              className={`mt-4 w-full rounded-xl border px-4 py-3 text-sm font-extrabold transition ${
                canConvertPedido
                  ? "border-geek-lime bg-geek-lime text-black shadow-glow hover:brightness-95"
                  : "cursor-not-allowed border-white/10 bg-[#111] text-zinc-500"
              } disabled:opacity-70`}
            >
              {convertingPedido ? "Convirtiendo..." : "Convertir en pedido"}
            </button>
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">Cliente</h2>
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-lg font-semibold text-white">{cotizacion.clienteNombre}</p>
            <p className="text-zinc-300">{cotizacion.clienteTelefono || "Sin teléfono"}</p>
            <p className="text-zinc-300">{cotizacion.clienteEmail || "Sin email"}</p>
            <p className="text-zinc-300">{cotizacion.clienteCedula || "Sin cédula"}</p>
          </div>
          <a
            href={whatsappUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className={`mt-5 inline-flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-bold transition ${
              whatsappUrl
                ? "border-geek-lime bg-geek-lime text-black hover:brightness-95"
                : "pointer-events-none border-zinc-800 bg-zinc-900 text-zinc-500"
            }`}
          >
            WhatsApp
          </a>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 text-sm">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">Datos internos</h2>
          <dl className="mt-4 space-y-3">
            <Row label="Categoría" value={cotizacion.categoria} />
            <Row label="Requiere instalación" value={cotizacion.requiereInstalacion ? "Sí" : "No"} />
            <Row label="Equipo en tienda" value={cotizacion.equipoYaEstaEnTienda ? "Sí" : "No"} />
            <Row label="Registrado por" value={cotizacion.registradoPor} />
          </dl>
        </section>
      </aside>
    </div>
    {editingOption ? (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm">
        <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/40">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Editar opción</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Los cambios se aplican solo a esta opción de cotización.
              </p>
            </div>
            <button
              type="button"
              onClick={cancelEditingOption}
              className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-geek-lime/40 hover:text-geek-lime"
            >
              Cerrar
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-[#111] p-4">
            <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Fotos actuales</p>
            <input
              ref={editFotosInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                setSelectedOptionFotos(Array.from(event.target.files ?? []), "append");
                event.currentTarget.value = "";
              }}
            />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {editingFotosExistentes.map((foto) => (
                <div
                  key={foto.id || foto.url}
                  className="overflow-hidden rounded-xl border border-white/10 bg-black"
                >
                  <a
                    href={foto.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <img
                      src={foto.url}
                      alt={foto.filename || editingOption.nombre}
                      className="aspect-square w-full object-cover"
                    />
                  </a>
                  <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingFotosExistentes((current) =>
                          current.filter((item) => (item.id || item.url) !== (foto.id || foto.url))
                        )
                      }
                      className="bg-[#111] px-2 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/10"
                    >
                      Eliminar
                    </button>
                    <a
                      href={foto.url}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-[#111] px-2 py-2 text-center text-xs font-semibold text-zinc-200 transition hover:text-geek-lime"
                    >
                      Abrir
                    </a>
                  </div>
                </div>
              ))}
              {optionFotoPreviews.map((preview, index) => (
                <div
                  key={`${preview.file.name}-${index}`}
                  className="overflow-hidden rounded-xl border border-geek-lime/30 bg-black"
                >
                  <img
                    src={preview.url}
                    alt={preview.file.name}
                    className="aspect-square w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeNewOptionFoto(index)}
                    className="w-full border-t border-geek-lime/20 bg-[#111] px-2 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/10"
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => editFotosInputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-geek-lime/50 bg-geek-lime/5 text-geek-lime transition hover:border-geek-lime hover:bg-geek-lime/10"
              >
                <span className="text-4xl font-light leading-none">+</span>
                <span className="mt-2 text-xs font-bold uppercase tracking-normal">Agregar fotos</span>
              </button>
            </div>
            {editingFotosExistentes.length === 0 && optionFotoPreviews.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-400">No quedarán fotos al guardar.</p>
            ) : null}
          </div>

          <form onSubmit={addOption} className="mt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextArea label="Producto / Descripción" value={optionForm.productoDescripcion} onChange={(value) => setOptionForm((current) => ({ ...current, productoDescripcion: value }))} />
              <Field label="URL proveedor" value={optionForm.urlProveedor} onChange={(value) => setOptionForm((current) => ({ ...current, urlProveedor: value }))} />
              <SelectField label="Proveedor" value={optionForm.proveedorId} onChange={(proveedorId) => setOptionForm((current) => ({ ...current, proveedorId }))}>
                <option value="">Seleccionar proveedor</option>
                {proveedores.map((proveedor) => (
                  <option key={proveedor.id} value={proveedor.id}>
                    {proveedor.nombre}{proveedor.direccion ? ` · ${proveedor.direccion}` : ""}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Tiempo estimado" value={optionForm.tiempoEstimado} onChange={(tiempoEstimado) => setOptionForm((current) => ({ ...current, tiempoEstimado }))}>
                {TIEMPOS_ESTIMADOS_OPCION_COTIZACION.map((tiempo) => (
                  <option key={tiempo} value={tiempo}>{tiempo}</option>
                ))}
              </SelectField>
              <SelectField label="Estado opción" value={optionForm.estado} onChange={(estado) => setOptionForm((current) => ({ ...current, estado }))}>
                {ESTADOS_OPCION_COTIZACION.map((estado) => (
                  <option key={estado} value={estado}>{estado}</option>
                ))}
              </SelectField>
              <Field label="Precio venta cliente" type="number" value={optionForm.precioVentaCliente} onChange={(value) => setOptionForm((current) => ({ ...current, precioVentaCliente: value }))} />
              {canSeeInternalCosts ? (
                <Field label="Costo proveedor" type="number" value={optionForm.costoProveedor} onChange={(value) => setOptionForm((current) => ({ ...current, costoProveedor: value }))} />
              ) : null}
              <TextArea label="Nota para cliente" value={optionForm.notaParaCliente} onChange={(value) => setOptionForm((current) => ({ ...current, notaParaCliente: value }))} />
              {canSeeInternalCosts ? (
                <TextArea label="Observaciones internas" value={optionForm.notaInterna} onChange={(value) => setOptionForm((current) => ({ ...current, notaInterna: value }))} />
              ) : null}
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={cancelEditingOption}
                className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={optionSaving}
                className="rounded-xl border border-geek-lime bg-geek-lime px-5 py-3 text-sm font-extrabold text-black shadow-glow transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
              >
                {optionSaving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </section>
      </div>
    ) : null}
    {showSkuModal ? (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm">
        <section className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#181818] p-5 shadow-2xl shadow-black/40">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Asignar SKU al pedido</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Este pedido necesita un SKU interno único para control de inventario.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSkuModal(false)}
              className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-geek-lime/40 hover:text-geek-lime"
            >
              Cerrar
            </button>
          </div>

          <div className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-[#111] p-4 text-sm sm:grid-cols-2">
            <Row label="Producto / artículo" value={selectedOption?.nombre || cotizacion.productoSolicitado} />
            <Row label="Categoría" value={cotizacion.categoria || "-"} />
            <Row
              label="Proveedor heredado"
              value={
                selectedOptionProveedor
                  ? `${selectedOptionProveedor.nombre}${selectedOptionProveedor.direccion ? ` · ${selectedOptionProveedor.direccion}` : ""}`
                  : selectedOption
                    ? proveedorLabel(selectedOption)
                    : "-"
              }
            />
            <Row label="Cotización" value={cotizacion.codigo} />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="SKU proveedor" value={skuProveedor} onChange={(value) => setSkuProveedor(value.toUpperCase())} />
            <Field
              label="SKU interno"
              value={skuInterno}
              onChange={(value) => {
                setSkuInterno(value.toUpperCase());
                setSkuAvailable(false);
                setSkuMessage(null);
              }}
            />
          </div>

          {skuMessage ? (
            <p className={`mt-4 rounded-xl border px-4 py-3 text-sm ${skuAvailable ? "border-geek-lime/30 bg-geek-lime/10 text-geek-lime" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>
              {skuMessage}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={skuChecking || !skuInterno.trim()}
              onClick={validarSku}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime disabled:cursor-not-allowed disabled:opacity-60"
            >
              {skuChecking ? "Validando..." : "Validar SKU"}
            </button>
            <button
              type="button"
              disabled={skuGenerating}
              onClick={generarSku}
              className="rounded-xl border border-geek-lime/40 px-4 py-3 text-sm font-semibold text-geek-lime transition hover:bg-geek-lime/10 disabled:cursor-wait disabled:opacity-60"
            >
              {skuGenerating ? "Generando..." : "Generar SKU"}
            </button>
            <button
              type="button"
              disabled={convertingPedido || !skuInterno.trim()}
              onClick={convertirPedido}
              className="rounded-xl border border-geek-lime bg-geek-lime px-4 py-3 text-sm font-extrabold text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {convertingPedido ? "Convirtiendo..." : "Convertir en pedido"}
            </button>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={compact ? "" : "rounded-xl border border-white/10 bg-[#111] p-4"}>
      <p className="text-xs uppercase tracking-normal text-zinc-500">{label}</p>
      <p className={`${compact ? "text-sm" : "text-xl"} mt-1 font-bold text-white`}>{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right text-zinc-200">{value || "-"}</dd>
    </div>
  );
}

function NoteBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-zinc-300">{value}</p>
    </div>
  );
}

function DisabledNextButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className="min-w-40 rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-left text-sm font-semibold text-zinc-500 disabled:cursor-not-allowed"
    >
      <span className="block text-zinc-300">{label}</span>
      <span className="mt-1 block text-[11px] font-bold uppercase tracking-normal text-geek-lime/70">
        Próxima fase
      </span>
    </button>
  );
}

function FileField({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  return (
    <label className="block sm:col-span-2">
      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">Fotos</span>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => onChange(Array.from(event.target.files ?? []))}
        className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-white file:mr-4 file:rounded-lg file:border-0 file:bg-geek-lime file:px-3 file:py-2 file:text-sm file:font-bold file:text-black"
      />
      {files.length > 0 ? (
        <p className="mt-2 text-xs text-zinc-400">
          {files.length === 1 ? files[0].name : `${files.length} imágenes seleccionadas`}
        </p>
      ) : null}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">{label}</span>
      <input
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none focus:border-geek-lime"
      >
        {children}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block sm:col-span-2">
      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-2 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-white outline-none focus:border-geek-lime"
      />
    </label>
  );
}
