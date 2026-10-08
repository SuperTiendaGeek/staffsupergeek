"use client";

// Pestaña "Mantenimientos y mejoras" de la ficha del artículo.
//
// Punto 3 de la auditoría (6-oct-2026): es el ÚNICO lugar para registrarlos.
// Antes vivían dentro de la Inspección de Recepción, y por eso a un equipo ya
// a la venta, o a uno que no requiere inspección, no se le podía registrar
// nada. Reglas: lib/shipping-v2/mejoras.ts e intervenciones.ts.
//
//   Mantenimiento → conserva lo que el equipo es (limpieza, pasta térmica…).
//   Mejora        → le pone una pieza del inventario y la descuenta.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ShippingV2Intervencion } from "@/lib/shipping-v2/airtable";
import { SHIPPING_V2_CATEGORIAS } from "@/types/shipping-v2";

type Repuesto = { id: string; sku: string; nombre: string; categoria: string; stock: number; costo: number };

type Panel = {
  itemId: string;
  sku: string;
  categoria: string;
  cantidad: number;
  puedeRegistrar: boolean;
  motivoBloqueo?: string;
  puedeMejorar: boolean;
  puedeVerCostos: boolean;
  puedeAnular: boolean;
  costoMejoras: number | null;
  trabajos: { mantenimientos: string[]; mejoras: string[] };
  intervenciones: ShippingV2Intervencion[];
  repuestos: Repuesto[];
};

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

const inputCls =
  "h-9 w-full rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-sm text-[#F5F5F5] outline-none placeholder:text-[#696A64] transition focus:border-[#D7FF4F]/70";

function fecha(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-EC", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function Campo({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] leading-4 text-[#696A64]">{hint}</span> : null}
    </label>
  );
}

export function ShippingV2IntervencionesTab({ itemId }: { itemId: string }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [modo, setModo] = useState<"Mantenimiento" | "Mejora">("Mantenimiento");

  // Mantenimiento
  const [mantTipo, setMantTipo] = useState("");
  const [mantNota, setMantNota] = useState("");
  // Mejora
  const [mejTipo, setMejTipo] = useState("");
  const [buscar, setBuscar] = useState("");
  const [piezaId, setPiezaId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [mejNota, setMejNota] = useState("");
  // Costo (punto 3): sugerido = costo de la pieza × unidades; se puede cambiar.
  const [costoTexto, setCostoTexto] = useState("");
  const [costoEditado, setCostoEditado] = useState(false);
  // Pieza que sale del equipo y vuelve al inventario.
  const [conRetirada, setConRetirada] = useState(false);
  const [retNombre, setRetNombre] = useState("");
  const [retCategoria, setRetCategoria] = useState("");
  const [retCantidad, setRetCantidad] = useState("1");
  const [retValor, setRetValor] = useState("0");
  const [retPrecio, setRetPrecio] = useState("");
  // Anular (solo Administrador): qué registro se está anulando y por qué.
  const [anulandoId, setAnulandoId] = useState("");
  const [motivoAnulacion, setMotivoAnulacion] = useState("");

  const aplicarPanel = useCallback((data: Panel) => {
    setPanel(data);
    setMantTipo((t) => (t && data.trabajos.mantenimientos.includes(t) ? t : data.trabajos.mantenimientos[0] ?? ""));
    setMejTipo((t) => (t && data.trabajos.mejoras.includes(t) ? t : data.trabajos.mejoras[0] ?? ""));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/shipping-v2/items/${itemId}/intervenciones`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo cargar.");
      aplicarPanel(json.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setCargando(false);
    }
  }, [itemId, aplicarPanel]);

  useEffect(() => { void cargar(); }, [cargar]);

  const piezasFiltradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const lista = panel?.repuestos ?? [];
    if (!q) return lista;
    return lista.filter((r) => `${r.sku} ${r.nombre} ${r.categoria}`.toLowerCase().includes(q));
  }, [panel, buscar]);

  const pieza = panel?.repuestos.find((r) => r.id === piezaId) ?? null;
  const cantidadNum = Number(cantidad);
  const cantidadValida = Number.isInteger(cantidadNum) && cantidadNum >= 1 && (!pieza || cantidadNum <= pieza.stock);
  const costoSugerido = pieza && cantidadValida ? Math.round(pieza.costo * cantidadNum * 100) / 100 : 0;
  const variasUnidades = (panel?.cantidad ?? 1) > 1;

  // Mientras nadie lo toque, el costo sigue al sugerido.
  useEffect(() => {
    if (!costoEditado) setCostoTexto(costoSugerido ? costoSugerido.toFixed(2) : "0");
  }, [costoSugerido, costoEditado]);

  const costoNum = Number(costoTexto);
  const costoValido = costoTexto.trim() !== "" && Number.isFinite(costoNum) && costoNum >= 0;
  const retCantidadNum = Number(retCantidad);
  const retValorNum = Number(retValor || 0);
  const retPrecioNum = retPrecio.trim() === "" ? null : Number(retPrecio);
  const retiradaValida = !conRetirada || (
    retNombre.trim() !== "" && retCategoria !== "" &&
    Number.isInteger(retCantidadNum) && retCantidadNum >= 1 &&
    Number.isFinite(retValorNum) && retValorNum >= 0 &&
    (retPrecioNum === null || (Number.isFinite(retPrecioNum) && retPrecioNum >= 0))
  );

  async function anular(intervencionId: string) {
    setGuardando(true); setError(""); setAviso("");
    try {
      const res = await fetch(`/api/shipping-v2/items/${itemId}/intervenciones`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "anular", intervencionId, motivo: motivoAnulacion.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo anular.");
      aplicarPanel(json.data);
      setAnulandoId(""); setMotivoAnulacion("");
      const pendiente: string[] = json.anulacion?.pendiente ?? [];
      setAviso(String(json.anulacion?.resultado ?? "Anulado.").replace(/\n?PENDIENTE A MANO:[\s\S]*$/, "").replace(/\n/g, " "));
      if (pendiente.length) setError(`Quedó pendiente a mano:\n${pendiente.join("\n")}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setGuardando(false);
    }
  }

  async function registrar(cuerpo: Record<string, unknown>, limpiar: () => void) {
    setGuardando(true); setError(""); setAviso("");
    try {
      const res = await fetch(`/api/shipping-v2/items/${itemId}/intervenciones`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo registrar.");
      aplicarPanel(json.data);
      limpiar();
      const partes = [json.repuestoDescontado
        ? `Mejora registrada. Se descontaron ${cuerpo.cantidadUsada} unidad(es) de ${json.repuestoDescontado}.`
        : "Mantenimiento registrado."];
      if (json.piezaRetiradaSku) partes.push(`La pieza retirada entró al inventario como ${json.piezaRetiradaSku}.`);
      setAviso(partes.join(" "));
      if (Array.isArray(json.avisos) && json.avisos.length) setError(json.avisos.join("\n"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="px-3 py-6 text-sm text-[#A7A7A7]">Cargando mantenimientos y mejoras…</p>;
  if (!panel) return <p className="px-3 py-6 text-sm text-[#FFB07A]">{error || "No se pudo cargar."}</p>;

  return (
    <div className="space-y-3">
      {!panel.puedeRegistrar ? (
        <p className="rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{panel.motivoBloqueo}</p>
      ) : null}
      {error ? (
        <p className="whitespace-pre-line rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{error}</p>
      ) : null}
      {aviso ? (
        <p className="rounded-lg border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-2 text-sm text-[#D7FF4F]">{aviso}</p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(280px,440px)_minmax(0,1fr)]">
        {panel.puedeRegistrar ? (
          <section className="space-y-3 rounded-lg border border-[#30312D] bg-[#171814] p-3">
            <div className="flex gap-1 rounded-lg border border-[#30312D] bg-[#11120F] p-1">
              {(["Mantenimiento", "Mejora"] as const).map((m) => (
                <button key={m} type="button" onClick={() => { setModo(m); setError(""); setAviso(""); }}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition ${modo === m ? "bg-[#D7FF4F] text-[#151515]" : "text-[#A7A7A7] hover:text-[#D7FF4F]"}`}>
                  {m === "Mantenimiento" ? "Mantenimiento" : "Mejora"}
                </button>
              ))}
            </div>

            {modo === "Mantenimiento" ? (
              <>
                <p className="text-[12px] text-[#7E7F76]">Conserva lo que el equipo ya es. No cambia sus características ni el inventario.</p>
                <Campo label="Tipo de trabajo">
                  <select value={mantTipo} onChange={(e) => setMantTipo(e.target.value)} className={inputCls}>
                    {panel.trabajos.mantenimientos.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Campo>
                <Campo label="Qué se hizo">
                  <textarea value={mantNota} onChange={(e) => setMantNota(e.target.value)}
                    placeholder="Ej: se retiró polvo del disipador y se cambió la pasta térmica del CPU."
                    className={`${inputCls} h-auto min-h-[64px] py-2`} />
                </Campo>
                <button type="button" disabled={guardando || !mantTipo}
                  onClick={() => void registrar({ tipo: "Mantenimiento", detalle: mantTipo, nota: mantNota.trim() }, () => setMantNota(""))}
                  className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-2 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50">
                  Registrar mantenimiento
                </button>
              </>
            ) : !panel.puedeMejorar ? (
              <p className="rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">
                Una mejora descuenta una pieza del inventario y tu usuario no tiene permiso para editar artículos.
              </p>
            ) : (
              <>
                <p className="text-[12px] text-[#7E7F76]">Le pone al equipo una pieza del inventario (RAM, SSD, batería…) y la descuenta.</p>
                <Campo label="Tipo de mejora">
                  <select value={mejTipo} onChange={(e) => setMejTipo(e.target.value)} className={inputCls}>
                    {panel.trabajos.mejoras.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Campo>
                <Campo label="Pieza del inventario" hint={`${panel.repuestos.length} piezas en la tienda con unidades libres.`}>
                  <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)}
                    placeholder="Buscar por SKU, nombre o categoría" className={inputCls} />
                  <select value={piezaId} onChange={(e) => setPiezaId(e.target.value)} className={`${inputCls} mt-1.5`}>
                    <option value="">— Elige la pieza —</option>
                    {piezasFiltradas.map((r) => (
                      <option key={r.id} value={r.id}>{r.sku} · {r.nombre} — {r.stock} libre(s)</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Cantidad usada" hint={pieza ? `Máximo ${pieza.stock} (unidades libres de ${pieza.sku}).` : undefined}>
                  <input type="number" min={1} step={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={inputCls} />
                </Campo>
                <Campo label="Nota">
                  <input type="text" value={mejNota} onChange={(e) => setMejNota(e.target.value)}
                    placeholder="Ej: se pasó de 8 GB a 16 GB en el slot libre." className={inputCls} />
                </Campo>
                {panel.puedeVerCostos ? (
                  variasUnidades ? (
                    <p className="rounded-lg border border-[#F4C95B]/40 bg-[#F4C95B]/10 px-3 py-2 text-[12px] text-[#F4C95B]">
                      Este registro tiene {panel.cantidad} unidades iguales: la mejora se registra, pero su costo no se suma
                      porque cambiaría el de todas. Conviene separar la unidad mejorada en un artículo propio.
                    </p>
                  ) : (
                    <Campo label="Costo que se suma al equipo"
                      hint={`Sugerido: ${money(costoSugerido)} (costo de la pieza × unidades). Puedes cambiarlo o poner 0. Mejoras acumuladas en este equipo: ${money(panel.costoMejoras ?? 0)}.`}>
                      <input type="number" min={0} step="0.01" value={costoTexto}
                        onChange={(e) => { setCostoTexto(e.target.value); setCostoEditado(true); }} className={inputCls} />
                    </Campo>
                  )
                ) : null}

                <label className="flex items-start gap-2 rounded-lg border border-[#30312D] bg-[#11120F] px-3 py-2 text-sm text-[#F5F5F5]">
                  <input type="checkbox" checked={conRetirada} onChange={(e) => setConRetirada(e.target.checked)} className="mt-0.5" />
                  <span>
                    Sale una pieza del equipo y vuelve al inventario
                    <span className="block text-[11px] text-[#696A64]">Ej: la RAM de 4 GB que se reemplazó. Se crea como artículo nuevo, en la tienda.</span>
                  </span>
                </label>
                {conRetirada ? (
                  <div className="space-y-2 rounded-lg border border-[#30312D] bg-[#11120F] p-3">
                    <Campo label="Nombre de la pieza retirada">
                      <input type="text" value={retNombre} onChange={(e) => setRetNombre(e.target.value)}
                        placeholder="Ej: RAM DDR4 4GB 2400MHz" className={inputCls} />
                    </Campo>
                    <div className="grid grid-cols-2 gap-2">
                      <Campo label="Categoría">
                        <select value={retCategoria} onChange={(e) => setRetCategoria(e.target.value)} className={inputCls}>
                          <option value="">— Elige —</option>
                          {SHIPPING_V2_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </Campo>
                      <Campo label="Cantidad">
                        <input type="number" min={1} step={1} value={retCantidad} onChange={(e) => setRetCantidad(e.target.value)} className={inputCls} />
                      </Campo>
                    </div>
                    {panel.puedeVerCostos ? (
                      <Campo label="Costo por unidad de la pieza retirada"
                        hint={variasUnidades
                          ? "Es el costo de la pieza nueva (se ve en su Costo total unitario). El equipo no cambia: tiene varias unidades."
                          : "Es el costo de la pieza nueva (se ve en su Costo total unitario) y se RESTA del costo del equipo (× cantidad). Déjalo en 0 si no quieres cambiarlo."}>
                        <input type="number" min={0} step="0.01" value={retValor} onChange={(e) => setRetValor(e.target.value)} className={inputCls} />
                      </Campo>
                    ) : null}
                    <Campo label="Precio de venta por unidad (opcional)" hint="Si lo dejas vacío, la pieza nace sin precio y no aparece en el mostrador hasta que se lo pongas.">
                      <input type="number" min={0} step="0.01" value={retPrecio} onChange={(e) => setRetPrecio(e.target.value)} className={inputCls} />
                    </Campo>
                  </div>
                ) : null}

                {pieza ? (
                  <div className="rounded-lg border border-dashed border-[#3A3A36] bg-[#11120F] px-3 py-2 text-[12px] text-[#B4B5AC]">
                    Se descuentan <b className="text-[#F5F5F5]">{cantidadValida ? cantidadNum : "?"}</b> unidad(es) de{" "}
                    <b className="text-[#F5F5F5]">{pieza.sku}</b>{panel.puedeVerCostos ? ` (costo por unidad ${money(pieza.costo)})` : ""}.
                    {cantidadValida && cantidadNum === pieza.stock ? " Es la última unidad libre: la pieza quedará Agotado si no hay otras reservadas." : ""}
                  </div>
                ) : null}
                <button type="button"
                  disabled={guardando || !mejTipo || !pieza || !cantidadValida || !retiradaValida || (panel.puedeVerCostos && !variasUnidades && !costoValido)}
                  onClick={() => void registrar(
                    {
                      tipo: "Mejora", detalle: mejTipo, nota: mejNota.trim(), repuestoId: piezaId, cantidadUsada: cantidadNum,
                      ...(panel.puedeVerCostos && !variasUnidades ? { costoSumado: costoNum } : {}),
                      ...(conRetirada
                        ? { piezaRetirada: { nombre: retNombre.trim(), categoria: retCategoria, cantidad: retCantidadNum, valor: panel.puedeVerCostos ? retValorNum : 0, precioVenta: retPrecioNum } }
                        : {}),
                    },
                    () => {
                      setMejNota(""); setPiezaId(""); setCantidad("1"); setBuscar("");
                      setCostoEditado(false); setConRetirada(false); setRetNombre(""); setRetCategoria(""); setRetCantidad("1"); setRetValor("0"); setRetPrecio("");
                    })}
                  className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-2 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50">
                  Registrar mejora
                </button>
              </>
            )}
            <p className="text-[11px] text-[#696A64]">Queda firmado con tu nombre, fecha y hora.</p>
          </section>
        ) : null}

        <section className="rounded-lg border border-[#30312D] bg-[#171814]">
          <div className="flex items-baseline gap-2 px-3 pb-2 pt-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-normal text-[#F5F5F5]">Historial</h3>
            <span className="ml-auto font-mono text-[12px] text-[#A7A7A7]">{panel.intervenciones.length}</span>
          </div>
          <div className="px-3 pb-3">
            {!panel.intervenciones.length ? (
              <p className="py-6 text-center text-sm text-[#696A64]">Todavía no se registró nada.</p>
            ) : panel.intervenciones.map((r) => (
              <div key={r.id} className={`flex gap-2.5 border-b border-[#30312D] py-2.5 last:border-b-0 ${r.anulada ? "opacity-60" : ""}`}>
                <span aria-hidden="true" className={`grid h-7 w-7 flex-none place-items-center rounded-lg text-[13px] ${
                  r.tipo === "Mejora" ? "bg-[#C99BFF]/16 text-[#C99BFF]" : "bg-[#5BC8F5]/16 text-[#5BC8F5]"}`}>
                  {r.tipo === "Mejora" ? "⬆" : "🛠"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-semibold text-[#F5F5F5] ${r.anulada ? "line-through" : ""}`}>{r.tipo} · {r.detalle || "—"}</span>
                    {r.anulada ? (
                      <span className="rounded-full border border-[#FF7A6B]/45 bg-[#FF7A6B]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#FFB3A9]">Anulada</span>
                    ) : null}
                  </div>
                  {r.nota ? <div className="mt-0.5 text-[12px] text-[#B4B5AC]">{r.nota}</div> : null}
                  <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-[#7E7F76]">
                    <span>Por <b className="text-[#B4B5AC]">{r.realizadoPor || "—"}</b></span>
                    <span>{fecha(r.fecha)}</span>
                    {r.cantidadUsada ? <span className="font-mono text-[#D7FF4F]">−{r.cantidadUsada} unidad(es)</span> : null}
                    {panel.puedeVerCostos && r.costoSumado ? <span className="font-mono text-[#B4B5AC]">+{money(r.costoSumado)} al costo</span> : null}
                    {panel.puedeVerCostos && r.valorPiezaRetirada ? <span className="font-mono text-[#B4B5AC]">−{money(r.valorPiezaRetirada)} pieza retirada</span> : null}
                    {r.piezaRetiradaId ? (
                      <a href={`/shipping-v2/items/${r.piezaRetiradaId}`} className="font-semibold text-[#D7FF4F] hover:underline">Ver pieza retirada</a>
                    ) : null}
                  </div>
                  {r.anulada ? (
                    <div className="mt-1.5 rounded-md border border-[#FF7A6B]/30 bg-[#FF7A6B]/5 px-2 py-1.5 text-[11px] text-[#FFB3A9]">
                      Anulada por <b>{r.anuladaPor || "—"}</b> · {fecha(r.fechaAnulacion)}
                      {r.motivoAnulacion ? <> · Motivo: {r.motivoAnulacion}</> : null}
                      {r.resultadoAnulacion ? <div className="mt-1 whitespace-pre-line text-[#B4B5AC]">{r.resultadoAnulacion}</div> : null}
                    </div>
                  ) : panel.puedeAnular ? (
                    anulandoId === r.id ? (
                      <div className="mt-2 space-y-2 rounded-md border border-[#FF7A6B]/35 bg-[#FF7A6B]/5 p-2">
                        <p className="text-[11.5px] text-[#FFB3A9]">
                          {r.tipo === "Mejora"
                            ? "Se devolverán las unidades a la pieza usada, el costo del equipo volverá a como estaba y se eliminará la pieza retirada. Queda registrado como anulado."
                            : "El mantenimiento quedará marcado como anulado (no mueve inventario)."}
                        </p>
                        <input type="text" value={motivoAnulacion} onChange={(e) => setMotivoAnulacion(e.target.value)}
                          placeholder="Motivo (obligatorio). Ej: era una prueba." className={inputCls} />
                        <div className="flex gap-2">
                          <button type="button" disabled={guardando || motivoAnulacion.trim().length < 5} onClick={() => void anular(r.id)}
                            className="rounded-lg border border-[#FF7A6B] bg-[#FF7A6B] px-3 py-1.5 text-sm font-bold text-[#151515] disabled:opacity-50">
                            Confirmar anulación
                          </button>
                          <button type="button" disabled={guardando} onClick={() => { setAnulandoId(""); setMotivoAnulacion(""); }}
                            className="rounded-lg border border-[#3A3A36] px-3 py-1.5 text-sm font-semibold text-[#A7A7A7]">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" disabled={guardando} onClick={() => { setAnulandoId(r.id); setMotivoAnulacion(""); setError(""); setAviso(""); }}
                        className="mt-1.5 text-[11px] font-semibold text-[#FFB3A9] hover:underline">
                        Anular (Administrador)
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
