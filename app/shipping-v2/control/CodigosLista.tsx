"use client";

// Pestaña Control → Códigos (punto 10c-3): cada SKU que pasó a ser otro
// (fusión o cambio de categoría). Se marca "Etiqueta reimpresa" y "Anuncios
// corregidos" hasta dejar la lista de pendientes en cero.

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Download, Loader2, Merge } from "lucide-react";
import type { ShippingV2CambioCodigo } from "@/lib/shipping-v2/airtable";
import { crearTablaXlsx } from "@/lib/shipping-v2/hoja-xlsx";

type Vista = "pendientes" | "todos";
type EstadoFila = "guardando" | "listo" | "saliendo";

const boton = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-3 text-[12.5px] font-semibold text-[#EDEDE7] transition hover:border-[#D7FF4F]/50 disabled:opacity-50";
const chip = (activo: boolean) =>
  `h-8 px-3 text-[12.5px] ${activo ? "bg-[#D7FF4F] font-bold text-[#141510]" : "bg-[#151515] font-semibold text-[#B4B5AC] hover:text-[#EDEDE7]"}`;

function pendiente(c: ShippingV2CambioCodigo) {
  return (c.enTienda > 0 && !c.etiquetaReimpresa) || (c.anuncios > 0 && !c.anunciosCorregidos);
}

function fecha(valor?: string) {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-EC", { day: "2-digit", month: "short" }).replace(".", "");
}

export function CodigosLista({ pestanas, esAdministrador, onPendientes }: { pestanas?: ReactNode; esAdministrador: boolean; onPendientes?: (n: number) => void }) {
  const [cambios, setCambios] = useState<ShippingV2CambioCodigo[] | null>(null);
  const [vista, setVista] = useState<Vista>("pendientes");
  const [error, setError] = useState("");
  const [estado, setEstado] = useState<Record<string, EstadoFila>>({});
  const [saliendo, setSaliendo] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/shipping-v2/control/codigos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (!j.success) throw new Error(j.error || "No se pudo cargar.");
        setCambios(j.data);
        if (!(j.data as ShippingV2CambioCodigo[]).some(pendiente)) setVista("todos");
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar."));
    return () => {
      vivo = false;
    };
  }, []);

  const pendientes = useMemo(() => (cambios ?? []).filter(pendiente).length, [cambios]);
  useEffect(() => {
    if (cambios) onPendientes?.(pendientes);
  }, [cambios, pendientes, onPendientes]);

  // En "Pendientes", una fila resuelta se queda un momento en verde y sale suave.
  const visibles = (cambios ?? []).filter((c) => vista === "todos" || pendiente(c) || saliendo.includes(c.id));

  async function marcar(c: ShippingV2CambioCodigo, campo: "etiquetaReimpresa" | "anunciosCorregidos", valor: boolean) {
    setEstado((e) => ({ ...e, [c.id]: "guardando" }));
    setError("");
    const antes = c;
    const nuevo = { ...c, [campo]: valor };
    setCambios((l) => (l ?? []).map((x) => (x.id === c.id ? nuevo : x)));
    const sale = vista === "pendientes" && pendiente(antes) && !pendiente(nuevo);
    if (sale) setSaliendo((s) => [...s, c.id]);
    try {
      const r = await fetch(`/api/shipping-v2/control/codigos/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "No se pudo guardar.");
      setCambios((l) => (l ?? []).map((x) => (x.id === c.id ? j.data : x)));
      if (sale) {
        setEstado((e) => ({ ...e, [c.id]: "listo" }));
        setTimeout(() => setEstado((e) => ({ ...e, [c.id]: "saliendo" })), 900);
        setTimeout(() => {
          setSaliendo((s) => s.filter((x) => x !== c.id));
          setEstado((e) => {
            const n = { ...e };
            delete n[c.id];
            return n;
          });
        }, 1250);
      } else {
        setEstado((e) => {
          const n = { ...e };
          delete n[c.id];
          return n;
        });
      }
    } catch (e) {
      setCambios((l) => (l ?? []).map((x) => (x.id === c.id ? antes : x)));
      setSaliendo((s) => s.filter((x) => x !== c.id));
      setEstado((x) => {
        const n = { ...x };
        delete n[c.id];
        return n;
      });
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  function exportar() {
    const filas = (cambios ?? []).map((c) => [
      c.antes,
      c.ahora,
      c.motivo,
      c.detalle,
      c.registros,
      c.enTienda,
      c.enTienda ? (c.etiquetaReimpresa ? "Sí" : "No") : "—",
      c.anuncios,
      c.anuncios ? (c.anunciosCorregidos ? "Sí" : "No") : "—",
      fecha(c.fecha),
      c.hechoPor,
    ]);
    const bytes = crearTablaXlsx(
      "Cambios de código",
      [
        { titulo: "Antes", ancho: 14 }, { titulo: "Ahora", ancho: 14 }, { titulo: "Motivo", ancho: 18 }, { titulo: "Detalle", ancho: 60 },
        { titulo: "Registros", ancho: 10 }, { titulo: "En tienda", ancho: 10 }, { titulo: "Etiqueta reimpresa", ancho: 18 },
        { titulo: "Anuncios", ancho: 10 }, { titulo: "Anuncios corregidos", ancho: 19 }, { titulo: "Fecha", ancho: 10 }, { titulo: "Hecho por", ancho: 22 },
      ],
      filas
    );
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cambios-de-codigo-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const columnas = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[104px_18px_104px_minmax(0,1fr)_64px_150px_150px]";

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {pestanas}
        {cambios && cambios.length ? (
          <div role="tablist" aria-label="Ver" className="inline-flex overflow-hidden rounded-lg border border-[#3A3B35]">
            <button type="button" role="tab" aria-selected={vista === "pendientes"} onClick={() => setVista("pendientes")} className={chip(vista === "pendientes")}>Pendientes · {pendientes}</button>
            <button type="button" role="tab" aria-selected={vista === "todos"} onClick={() => setVista("todos")} className={`border-l border-[#3A3B35] ${chip(vista === "todos")}`}>Todos · {cambios.length}</button>
          </div>
        ) : null}
        {error ? <span className="text-[12px] text-[#FFB07A]">{error}</span> : null}
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={exportar} disabled={!cambios?.length} className={boton}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />Exportar Excel
          </button>
          {esAdministrador ? (
            <Link href="/shipping-v2/control/fusionar" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#D7FF4F] px-3 text-[12.5px] font-bold text-[#141510] hover:bg-[#E4FF7A]">
              <Merge className="h-3.5 w-3.5" aria-hidden="true" />Fusionar SKU
            </Link>
          ) : null}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] text-[12.5px]">
        <div className={`hidden ${columnas} gap-2.5 border-b border-[#30312D] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] md:grid`}>
          <span>Antes</span><span /><span>Ahora</span><span>Motivo</span><span>Fecha</span><span>Etiqueta</span><span>Anuncios</span>
        </div>
        {cambios === null ? (
          <p className="flex items-center justify-center gap-2 px-3 py-6 text-[#8F908A]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Cargando…</p>
        ) : visibles.length ? (
          visibles.map((c) => {
            const est = estado[c.id];
            const listo = est === "listo" || est === "saliendo";
            return (
              <div key={c.id} className={`grid transition-all duration-300 ease-out ${est === "saliendo" ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
                <div className="min-h-0 overflow-hidden">
                  <div className={`grid ${columnas} items-center gap-x-2.5 gap-y-1 border-b border-[#252622] px-3 py-1.5 transition-colors duration-300 ${listo ? "bg-[#7BE495]/[0.10]" : ""}`}>
                    <span className="hidden font-mono text-[#B4B5AC] line-through decoration-[#8F908A]/60 md:block">{c.antes}</span>
                    <span className="hidden text-[#8F908A] md:block">→</span>
                    <span className="min-w-0">
                      <span className="font-mono text-[#B4B5AC] line-through decoration-[#8F908A]/60 md:hidden">{c.antes} </span>
                      <span className="text-[#8F908A] md:hidden">→ </span>
                      {c.itemIds[0] ? (
                        <a href={`/shipping-v2/items/${c.itemIds[0]}`} target="_blank" rel="noreferrer" className="font-mono font-semibold text-[#EDEDE7] hover:text-[#D7FF4F] hover:underline">{c.ahora}</a>
                      ) : (
                        <span className="font-mono font-semibold text-[#EDEDE7]">{c.ahora}</span>
                      )}
                    </span>
                    <span className="hidden min-w-0 truncate text-[#C9CAC1] md:block" title={c.detalle}>
                      {c.motivo}
                      {c.detalle ? <span className="text-[#8F908A]"> · {c.detalle}</span> : null}
                    </span>
                    <span className="hidden text-[#8F908A] md:block">{fecha(c.fecha)}</span>
                    <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 md:contents">
                      <span>
                        {c.enTienda ? (
                          <Casilla activo={c.etiquetaReimpresa} guardando={est === "guardando"} onCambio={(v) => void marcar(c, "etiquetaReimpresa", v)} texto={`Reimpresa${c.enTienda > 1 ? ` · ${c.enTienda}` : ""}`} />
                        ) : (
                          <span className="text-[12px] text-[#77786F]" title="Nada de este producto está en la tienda: no hay etiqueta que cambiar">nada en tienda</span>
                        )}
                      </span>
                      <span>
                        {c.anuncios ? (
                          <Casilla activo={c.anunciosCorregidos} guardando={est === "guardando"} onCambio={(v) => void marcar(c, "anunciosCorregidos", v)} texto={`Corregidos · ${c.anuncios}`} />
                        ) : (
                          <span className="text-[12px] text-[#77786F]">sin anuncios</span>
                        )}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="flex items-center justify-center gap-2 px-3 py-6 text-center text-[#9FEFB3]">
            {cambios.length ? <><Check className="h-4 w-4" aria-hidden="true" />Nada pendiente: etiquetas y anuncios al día.</> : <span className="text-[#8F908A]">Todavía no hay cambios de código.</span>}
          </p>
        )}
      </div>
    </div>
  );
}

function Casilla({ activo, guardando, onCambio, texto }: { activo: boolean; guardando: boolean; onCambio: (v: boolean) => void; texto: string }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-1.5 text-[12px] ${activo ? "text-[#9FEFB3]" : "text-[#C9CAC1]"}`}>
      {guardando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8F908A]" aria-hidden="true" />
      ) : (
        <input type="checkbox" checked={activo} onChange={(e) => onCambio(e.target.checked)} className="h-3.5 w-3.5 accent-[#D7FF4F]" />
      )}
      {texto}
    </label>
  );
}
