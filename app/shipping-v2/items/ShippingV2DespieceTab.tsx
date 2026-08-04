"use client";

// Pestaña "Despiece" del detalle de un artículo.
//
// Desarmar un equipo para vender sus piezas por separado. Cada pieza es un
// artículo real de Shipping Items, vinculado a este equipo.
// Reglas: lib/shipping-v2/despiece.ts · Diseño: docs/DISENO_DESPIECE.md
//
// Sobre la disposición: la tabla muestra las piezas ya creadas, limpias y
// legibles. Crear o editar NO ocurre dentro de las celdas —siete campos
// apretados en una fila no caben en una laptop— sino en un panel aparte con
// campos etiquetados y anchos de verdad. El panel sirve para las dos cosas,
// así que corregir una pieza se siente igual que crearla.

import { useCallback, useEffect, useState } from "react";
import { SHIPPING_V2_CATEGORIAS, SHIPPING_V2_CONDICIONES } from "@/types/shipping-v2";

type Pieza = {
  id: string; sku: string; nombre: string; categoria: string; cantidad: number;
  condicion: string; precioVenta: number | null; costoAsignado: number;
  estadoItem: string; observaciones: string; numeroSerie: string; tieneFacturaORecibo: boolean;
};

type Resumen = {
  padreId: string; puedeDespiezar: boolean; motivoBloqueo?: string;
  estadoDespiece: string; motivo: string; costoTotalEquipo: number;
  piezas: Pieza[]; sinRepartir: number; piezasSinPrecio: string[];
  puedeCancelar: boolean; motivoNoCancelable?: string;
};

type Borrador = {
  piezaId?: string;
  nombre: string; categoria: string; cantidad: string;
  condicion: string; precioVenta: string; observaciones: string; numeroSerie: string;
};

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

const BORRADOR_VACIO: Borrador = {
  nombre: "", categoria: "", cantidad: "1", condicion: "No probado",
  precioVenta: "", observaciones: "", numeroSerie: "",
};

const inputCls =
  "h-9 w-full rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-sm text-[#F5F5F5] outline-none placeholder:text-[#696A64] transition focus:border-[#D7FF4F]/70";

function Campo({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] leading-4 text-[#696A64]">{hint}</span> : null}
    </label>
  );
}

export function ShippingV2DespieceTab({ itemId, canEdit }: { itemId: string; canEdit: boolean }) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [borrador, setBorrador] = useState<Borrador | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/shipping-v2/items/${itemId}/despiece`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo cargar el despiece.");
      setResumen(json.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setCargando(false);
    }
  }, [itemId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(cuerpo: Record<string, unknown>) {
    setGuardando(true); setError("");
    try {
      const res = await fetch(`/api/shipping-v2/items/${itemId}/despiece`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo completar la operación.");
      setResumen(json.data);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function guardarBorrador() {
    if (!borrador) return;
    const base = {
      nombre: borrador.nombre,
      categoria: borrador.categoria,
      cantidad: Number(borrador.cantidad || 1),
      condicion: borrador.condicion,
      precioVenta: borrador.precioVenta === "" ? null : Number(borrador.precioVenta),
      observaciones: borrador.observaciones,
    };
    const ok = borrador.piezaId
      ? await accion({ accion: "editar-pieza", piezaId: borrador.piezaId, ...base })
      : await accion({ accion: "crear-pieza", ...base, numeroSerie: borrador.numeroSerie });
    if (ok) setBorrador(null);
  }

  if (cargando) return <p className="px-3 py-6 text-sm text-[#A7A7A7]">Cargando despiece…</p>;
  if (!resumen) return <p className="px-3 py-6 text-sm text-[#FFB07A]">{error || "No se pudo cargar el despiece."}</p>;

  const totalUnidades = resumen.piezas.reduce((s, p) => s + (p.cantidad || 1), 0);
  const totalPrecio = resumen.piezas.reduce((s, p) => s + (p.precioVenta ?? 0) * (p.cantidad || 1), 0);
  const totalCosto = resumen.piezas.reduce((s, p) => s + p.costoAsignado, 0);
  const editable = canEdit && resumen.puedeDespiezar;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#30312D] bg-[#171814] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Estado del despiece</p>
          <p className="mt-0.5 text-sm font-bold text-[#F5F5F5]">{resumen.estadoDespiece}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Costo del equipo a repartir</p>
          <p className="mt-0.5 text-sm font-bold text-[#D7FF4F]">{money(resumen.costoTotalEquipo)}</p>
        </div>
      </div>

      {!resumen.puedeDespiezar ? (
        <p className="rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{resumen.motivoBloqueo}</p>
      ) : null}
      {error ? (
        <p className="whitespace-pre-line rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{error}</p>
      ) : null}

      {/* Piezas creadas — solo lectura, para que se lean bien */}
      <div className="overflow-x-auto rounded-lg border border-[#30312D]">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-[#30312D] bg-[#171814] text-left text-[11px] uppercase tracking-normal text-[#A7A7A7]">
              <th className="px-3 py-2 font-semibold">Pieza</th>
              <th className="px-3 py-2 font-semibold">Categoría</th>
              <th className="px-3 py-2 text-center font-semibold">Cant.</th>
              <th className="px-3 py-2 font-semibold">Condición</th>
              <th className="px-3 py-2 text-right font-semibold">Precio</th>
              <th className="px-3 py-2 text-right font-semibold">Costo</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {resumen.piezas.map((p) => {
              const bloqueada = p.estadoItem === "Vendido" || p.tieneFacturaORecibo;
              return (
                <tr key={p.id} className="border-b border-[#252622] hover:bg-[#141511]">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-[#F5F5F5]">{p.nombre}</div>
                    <div className="text-xs text-[#696A64]">
                      {p.sku}
                      {bloqueada ? <span className="ml-2 text-[#D7FF4F]">· ya vendida</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#A7A7A7]">{p.categoria}</td>
                  <td className="px-3 py-2 text-center text-[#A7A7A7]">{p.cantidad}</td>
                  <td className="px-3 py-2 text-[#A7A7A7]">{p.condicion}</td>
                  <td className="px-3 py-2 text-right text-[#F5F5F5]">
                    {p.precioVenta ? money(p.precioVenta) : <span className="text-[#FFB07A]">sin precio</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[#A7A7A7]">{money(p.costoAsignado)}</td>
                  <td className="px-3 py-2">
                    {editable && !bloqueada ? (
                      <div className="flex justify-end gap-1">
                        <button type="button" disabled={guardando}
                          onClick={() => setBorrador({
                            piezaId: p.id, nombre: p.nombre, categoria: p.categoria,
                            cantidad: String(p.cantidad), condicion: p.condicion,
                            precioVenta: p.precioVenta ? String(p.precioVenta) : "",
                            observaciones: p.observaciones, numeroSerie: p.numeroSerie,
                          })}
                          className="rounded-md border border-[#3A3A36] px-2 py-1 text-xs text-[#A7A7A7] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-50">
                          Editar
                        </button>
                        <button type="button" disabled={guardando}
                          onClick={() => void accion({ accion: "borrar-pieza", piezaId: p.id })}
                          className="rounded-md border border-[#3A3A36] px-2 py-1 text-xs text-[#A7A7A7] transition hover:border-[#FF914D]/60 hover:text-[#FFB07A] disabled:opacity-50">
                          Quitar
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}

            {resumen.piezas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-5 text-center text-sm text-[#696A64]">
                  Todavía no hay piezas. Cada una que agregues nace como un artículo propio, en revisión y fuera de la venta.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Totales */}
      {resumen.piezas.length > 0 ? (
        <div className="rounded-lg border border-[#30312D] bg-[#171814] px-3 py-2 text-sm">
          <p className="text-[#A7A7A7]">
            {totalUnidades} unidad(es) · Precio total <span className="font-semibold text-[#F5F5F5]">{money(totalPrecio)}</span>
            {" · "}Costo repartido <span className="font-semibold text-[#F5F5F5]">{money(totalCosto)}</span>
          </p>
          {resumen.piezasSinPrecio.length > 0 ? (
            <p className="mt-1 text-xs text-[#FFB07A]">
              ⚠ {resumen.piezasSinPrecio.length} pieza(s) sin precio: no reciben costo hasta que se lo pongas.
            </p>
          ) : null}
          {resumen.sinRepartir > 0.005 ? (
            <p className="mt-1 text-xs text-[#FFB07A]">⚠ Sin repartir: {money(resumen.sinRepartir)}</p>
          ) : null}
        </div>
      ) : null}

      {/* Panel de alta / edición — campos etiquetados, con espacio real */}
      {editable ? (
        borrador ? (
          <section className="rounded-xl border border-[#D7FF4F]/35 bg-[#141511] p-3">
            <h3 className="mb-3 text-sm font-semibold text-[#F5F5F5]">
              {borrador.piezaId ? "Editar pieza" : "Nueva pieza"}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <Campo label="Nombre de la pieza">
                  <input value={borrador.nombre} autoFocus className={inputCls} placeholder="Ej. Pantalla 15.6 FHD"
                    onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} />
                </Campo>
              </div>
              <Campo label="Categoría" hint="Define el SKU">
                <select value={borrador.categoria} className={inputCls}
                  onChange={(e) => setBorrador({ ...borrador, categoria: e.target.value })}>
                  <option value="">Elegir…</option>
                  {SHIPPING_V2_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
              <Campo label="Cantidad" hint="Ej. 2 memorias iguales">
                <input value={borrador.cantidad} inputMode="numeric" className={inputCls}
                  onChange={(e) => setBorrador({ ...borrador, cantidad: e.target.value })} />
              </Campo>
              <Campo label="Condición" hint="¿Funciona?">
                <select value={borrador.condicion} className={inputCls}
                  onChange={(e) => setBorrador({ ...borrador, condicion: e.target.value })}>
                  {SHIPPING_V2_CONDICIONES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
              <Campo label="Precio de venta" hint="Puede quedar vacío">
                <input value={borrador.precioVenta} inputMode="decimal" className={inputCls} placeholder="0.00"
                  onChange={(e) => setBorrador({ ...borrador, precioVenta: e.target.value })} />
              </Campo>
              <div className="sm:col-span-2">
                <Campo label="Observación interna">
                  <input value={borrador.observaciones} className={inputCls} placeholder="Opcional"
                    onChange={(e) => setBorrador({ ...borrador, observaciones: e.target.value })} />
                </Campo>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={guardando} onClick={() => setBorrador(null)}
                className="rounded-lg border border-[#3A3A36] bg-[#11120F] px-3 py-2 text-sm font-semibold text-[#A7A7A7] transition hover:text-[#F5F5F5] disabled:opacity-60">
                Cancelar
              </button>
              <button type="button" disabled={guardando} onClick={() => void guardarBorrador()}
                className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-black text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
                {guardando ? "Guardando…" : borrador.piezaId ? "Guardar cambios" : "Agregar pieza"}
              </button>
            </div>
          </section>
        ) : (
          <button type="button" onClick={() => setBorrador(BORRADOR_VACIO)}
            className="w-full rounded-lg border border-dashed border-[#3A3A36] px-3 py-2.5 text-sm font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">
            + Agregar pieza
          </button>
        )
      ) : null}

      {/* Acciones del despiece */}
      {editable && !borrador ? (
        <div className="flex flex-wrap justify-end gap-2">
          {resumen.puedeCancelar ? (
            <button type="button" disabled={guardando} onClick={() => void accion({ accion: "cancelar" })}
              className="rounded-lg border border-[#3A3A36] bg-[#11120F] px-3 py-2 text-sm font-semibold text-[#A7A7A7] transition hover:border-[#FF914D]/60 hover:text-[#FFB07A] disabled:opacity-60">
              Cancelar despiece
            </button>
          ) : null}
          <button type="button" disabled={guardando || resumen.piezas.length === 0}
            onClick={() => void accion({ accion: "completar", completo: true })}
            className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-black text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
            Completar despiece
          </button>
        </div>
      ) : null}

      {editable && resumen.piezas.length > 0 && !borrador ? (
        <p className="text-xs leading-5 text-[#696A64]">
          Al completar el despiece se descuenta del inventario la unidad desarmada y el equipo sale de la venta.
          Las piezas quedan en revisión: para publicarlas usa el botón “Listo para vender” de cada una.
        </p>
      ) : null}
    </div>
  );
}
