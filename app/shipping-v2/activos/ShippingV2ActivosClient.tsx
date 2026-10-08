"use client";

// Lista de "Activos de la tienda" (punto 4): buscar, filtrar por situación y
// abrir la ficha, donde un Administrador puede darlos de baja o pasarlos a la
// venta.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type ActivoFila = {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  estado: string;
  cantidad: number;
  recibido: boolean;
  costoUnidad: number | null;
  proveedor: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  fechaRegistro: string;
};

type Filtro = "en-uso" | "por-llegar" | "baja" | "todos";

function normalizar(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** En qué situación está un activo, para los filtros. */
export function situacionActivo(f: Pick<ActivoFila, "estado" | "recibido" | "cantidad">): Exclude<Filtro, "todos"> {
  if (normalizar(f.estado) === "dado de baja" || f.cantidad <= 0) return "baja";
  if (!f.recibido || normalizar(f.estado) === "en revision") return "por-llegar";
  return "en-uso";
}

const ETIQUETA_FILTRO: Record<Filtro, string> = {
  "en-uso": "En uso",
  "por-llegar": "Por llegar / revisión",
  baja: "De baja",
  todos: "Todos",
};

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

function fecha(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

function tonoEstado(s: Exclude<Filtro, "todos">) {
  if (s === "en-uso") return "border-[#8B73FF]/35 bg-[#8B73FF]/12 text-[#C9BFFF]";
  if (s === "por-llegar") return "border-[#F4C95B]/35 bg-[#F4C95B]/10 text-[#F4C95B]";
  return "border-[#3A3A36] bg-[#1E1E1E] text-[#A7A7A7]";
}

export function ShippingV2ActivosClient({ filas, puedeRegistrar, puedeVerCostos }: { filas: ActivoFila[]; puedeRegistrar: boolean; puedeVerCostos: boolean }) {
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("en-uso");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    try {
      const guardado = window.sessionStorage.getItem("shipping-v2:notice");
      if (guardado) { setAviso(guardado); window.sessionStorage.removeItem("shipping-v2:notice"); }
    } catch { /* sin almacenamiento: no pasa nada */ }
  }, []);

  const conteo = useMemo(() => {
    const c: Record<Filtro, number> = { "en-uso": 0, "por-llegar": 0, baja: 0, todos: filas.length };
    for (const f of filas) c[situacionActivo(f)]++;
    return c;
  }, [filas]);

  const visibles = useMemo(() => {
    const q = normalizar(buscar);
    return filas.filter((f) => {
      if (filtro !== "todos" && situacionActivo(f) !== filtro) return false;
      if (!q) return true;
      return normalizar([f.sku, f.nombre, f.categoria, f.marca, f.modelo, f.numeroSerie, f.proveedor].join(" ")).includes(q);
    });
  }, [filas, buscar, filtro]);

  const valorEnUso = useMemo(
    () => filas.filter((f) => situacionActivo(f) === "en-uso").reduce((s, f) => s + (f.costoUnidad ?? 0) * f.cantidad, 0),
    [filas]
  );

  return (
    <div className="space-y-3">
      {aviso ? <p className="rounded-xl border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-4 py-2.5 text-sm text-[#D7FF4F]">{aviso}</p> : null}

      <section className="rounded-lg border border-[#30312D] bg-[#11120F] p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar (SKU, nombre, serie, proveedor…)"
            className="h-8 min-w-[200px] flex-1 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-sm text-[#F5F5F5] outline-none placeholder:text-[#696A64] focus:border-[#D7FF4F]/70" />
          <div className="flex flex-wrap gap-1">
            {(["en-uso", "por-llegar", "baja", "todos"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFiltro(f)}
                className={`rounded-md border px-2.5 py-1 text-[13px] font-semibold transition ${filtro === f ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#30312D] bg-[#171814] text-[#A7A7A7] hover:text-[#D7FF4F]"}`}>
                {ETIQUETA_FILTRO[f]} <span className="ml-1 font-mono text-xs">{conteo[f]}</span>
              </button>
            ))}
          </div>
          {puedeVerCostos ? (
            <span className="ml-auto text-[12px] text-[#7E7F76]" title="Costo de los activos en uso">
              En uso <b className="tabular-nums text-[#D7FF4F]">{money(valorEnUso)}</b>
            </span>
          ) : null}
          {puedeRegistrar ? (
            <Link href="/shipping-v2/items/nuevo?activo=1"
              className={`${puedeVerCostos ? "" : "ml-auto "}rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1 text-[13px] font-bold text-[#151515] hover:brightness-105`}>
              Registrar activo
            </Link>
          ) : null}
        </div>

        <div className="mt-2 overflow-x-auto">
          {!visibles.length ? (
            <p className="py-8 text-center text-sm text-[#696A64]">
              {filas.length ? "Sin resultados." : "Sin activos registrados."}
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#30312D] text-[11px] uppercase text-[#A7A7A7]">
                  <th className="px-2 py-1.5 font-semibold">SKU</th>
                  <th className="px-2 py-1.5 font-semibold">Activo</th>
                  <th className="px-2 py-1.5 font-semibold">Categoría</th>
                  <th className="px-2 py-1.5 font-semibold">Estado</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Cant.</th>
                  {puedeVerCostos ? <th className="px-2 py-1.5 text-right font-semibold">Costo u.</th> : null}
                  <th className="px-2 py-1.5 font-semibold">Proveedor</th>
                  <th className="px-2 py-1.5 font-semibold">Registrado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const s = situacionActivo(f);
                  return (
                    <tr key={f.id} className="border-b border-[#23241F] last:border-b-0 hover:bg-[#171814]">
                      <td className="px-2 py-1.5 font-mono text-[#D7FF4F]">
                        <Link href={`/shipping-v2/items/${f.id}`} className="hover:underline">{f.sku || "—"}</Link>
                      </td>
                      <td className="px-2 py-1.5 text-[#F5F5F5]">
                        <Link href={`/shipping-v2/items/${f.id}`} className="hover:underline">{f.nombre || "Sin nombre"}</Link>
                        {f.numeroSerie ? <span className="block text-[11px] text-[#696A64]">Serie {f.numeroSerie}</span> : null}
                      </td>
                      <td className="px-2 py-1.5 text-[#A7A7A7]">{f.categoria || "—"}</td>
                      <td className="px-2 py-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tonoEstado(s)}`}>{f.estado || ETIQUETA_FILTRO[s]}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[#F5F5F5]">{f.cantidad}</td>
                      {puedeVerCostos ? <td className="px-2 py-1.5 text-right font-mono text-[#F5F5F5]">{f.costoUnidad != null ? money(f.costoUnidad) : "—"}</td> : null}
                      <td className="px-2 py-1.5 text-[#A7A7A7]">{f.proveedor || "—"}</td>
                      <td className="px-2 py-1.5 text-[#A7A7A7]">{fecha(f.fechaRegistro)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
