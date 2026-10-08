"use client";

// Movimientos de un activo de la tienda (punto 4, 8-oct-2026). Solo se
// muestra a un Administrador; el servidor lo vuelve a exigir.
//   Mercadería → "Pasar a uso local".
//   Activo     → "Dar de baja" o "Pasar a la venta".
// Con cantidad (si se mueve solo una parte, se separa en un artículo nuevo)
// y motivo obligatorio. Todo queda en el historial del artículo.

import { useRouter } from "next/navigation";
import { useState } from "react";

type Accion = "uso-local" | "venta" | "baja" | "revertir-baja";

const TEXTO: Record<Accion, { boton: string; titulo: string; ayuda: string; confirmar: string }> = {
  "uso-local": {
    boton: "Pasar a uso local",
    titulo: "Pasar a uso local (activo de la tienda)",
    ayuda: "Deja de venderse y pasa a Activos de la tienda.",
    confirmar: "Pasar a uso local",
  },
  venta: {
    boton: "Pasar a la venta",
    titulo: "Pasar a la venta",
    ayuda: "Vuelve a ser mercadería. Si su categoría pide inspección, pasa por Inspección antes de venderse.",
    confirmar: "Pasar a la venta",
  },
  "revertir-baja": {
    boton: "Revertir baja",
    titulo: "Revertir baja (fue un error)",
    ayuda: "Devuelve unidades dadas de baja por error.",
    confirmar: "Revertir baja",
  },
  baja: {
    boton: "Dar de baja",
    titulo: "Dar de baja",
    ayuda: "Se dañó, se desechó, se perdió o se regaló. Con 0 unidades queda \"Dado de baja\" (no se borra).",
    confirmar: "Dar de baja",
  },
};

export function ShippingV2ActivoAcciones({ itemId, esActivo, cantidad, estado, unidadesDadasDeBaja = 0 }: {
  itemId: string;
  sku?: string;
  esActivo: boolean;
  cantidad: number;
  estado: string;
  unidadesDadasDeBaja?: number;
}) {
  const router = useRouter();
  const [accion, setAccion] = useState<Accion | null>(null);
  const [unidades, setUnidades] = useState(String(Math.max(1, cantidad)));
  const [motivo, setMotivo] = useState("");
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const finales = ["vendido", "dado de baja", "agotado", "cancelado", "archivado"];
  const fuera = cantidad <= 0 || finales.includes(estado.trim().toLowerCase());
  const puedeRevertir = esActivo && unidadesDadasDeBaja > 0;
  if (fuera && !puedeRevertir) return null;

  const acciones: Accion[] = [
    ...(!fuera ? (esActivo ? (["baja", "venta"] as Accion[]) : (["uso-local"] as Accion[])) : []),
    ...(puedeRevertir ? (["revertir-baja"] as Accion[]) : []),
  ];
  const maximo = accion === "revertir-baja" ? unidadesDadasDeBaja : cantidad;
  const n = Number(unidades);
  const valido = Number.isInteger(n) && n >= 1 && n <= maximo && motivo.trim().length >= 5;

  async function ejecutar() {
    if (!accion) return;
    setGuardando(true); setError(""); setAviso("");
    try {
      const res = await fetch(`/api/shipping-v2/items/${itemId}/activo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, cantidad: n, motivo: motivo.trim(), precioVenta: accion === "venta" && precio.trim() ? Number(precio) : null }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo completar.");
      setAviso(json.data.mensaje);
      setAccion(null); setMotivo(""); setPrecio("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-lg border border-[#8B73FF]/35 bg-[#8B73FF]/5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#C9BFFF]">{esActivo ? "Activo de la tienda" : "Mercadería"}</span>
        {esActivo && unidadesDadasDeBaja > 0 ? <span className="text-[12px] text-[#A7A7A7]">De baja: {unidadesDadasDeBaja}</span> : null}
        <span className="text-[11px] text-[#696A64]">Administrador</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {acciones.map((a) => (
            <button key={a} type="button" disabled={guardando} title={TEXTO[a].ayuda}
              onClick={() => { setAccion(a); setUnidades(String(Math.max(1, a === "revertir-baja" ? unidadesDadasDeBaja : cantidad))); setError(""); setAviso(""); }}
              className={`rounded-md border px-2.5 py-1 text-[13px] font-semibold transition ${accion === a ? "border-[#C9BFFF] bg-[#C9BFFF] text-[#151515]" : "border-[#8B73FF]/50 text-[#C9BFFF] hover:bg-[#8B73FF]/15"}`}>
              {TEXTO[a].boton}
            </button>
          ))}
        </div>
      </div>

      {aviso ? <p className="mt-2 rounded-lg border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-2 text-sm text-[#D7FF4F]">{aviso}</p> : null}
      {error ? <p className="mt-2 whitespace-pre-line rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">{error}</p> : null}

      {accion ? (
        <div className="mt-2 space-y-2 rounded-md border border-[#30312D] bg-[#11120F] p-2.5">
          <p className="text-[13px] font-semibold text-[#F5F5F5]">{TEXTO[accion].titulo} <span className="font-normal text-[#7E7F76]">· {TEXTO[accion].ayuda}</span></p>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Cantidad (de {maximo})</span>
              <input type="number" min={1} max={maximo} step={1} value={unidades} onChange={(e) => setUnidades(e.target.value)}
                className="h-8 w-full rounded-md border border-[#3A3A36] bg-[#151515] px-3 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70" />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Motivo *</span>
              <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder={accion === "baja" ? "Ej: se quemó la fuente, se desechó" : accion === "venta" ? "Ej: cambiamos la PC de la caja" : accion === "revertir-baja" ? "Ej: se dio de baja por error" : "Ej: será la PC de facturación"}
                className="h-8 w-full rounded-md border border-[#3A3A36] bg-[#151515] px-3 text-sm text-[#F5F5F5] outline-none placeholder:text-[#696A64] focus:border-[#D7FF4F]/70" />
            </label>
            {accion === "venta" ? (
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase text-[#A7A7A7]">Precio venta</span>
                <input type="number" min={0} step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)}
                  className="h-8 w-full rounded-md border border-[#3A3A36] bg-[#151515] px-3 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70" />
              </label>
            ) : null}
          </div>
          {accion !== "baja" && accion !== "revertir-baja" && Number.isInteger(n) && n >= 1 && n < cantidad ? (
            <p className="text-[12px] text-[#F4C95B]">{n} de {cantidad}: se separan en un SKU nuevo.</p>
          ) : null}
          <div className="flex gap-2">
            <button type="button" disabled={guardando || !valido} onClick={() => void ejecutar()}
              className="rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1 text-[13px] font-bold text-[#151515] disabled:opacity-50">
              {guardando ? "Guardando…" : TEXTO[accion].confirmar}
            </button>
            <button type="button" disabled={guardando} onClick={() => setAccion(null)}
              className="rounded-md border border-[#3A3A36] px-3 py-1 text-[13px] font-semibold text-[#A7A7A7]">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
