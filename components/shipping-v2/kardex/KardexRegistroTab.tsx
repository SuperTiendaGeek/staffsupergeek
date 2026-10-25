"use client";

// Pestaña Kardex de la ficha (punto 12): los movimientos de ESTA unidad o
// lote, con enlace al Kardex de todo el producto.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { MovimientoKardex } from "@/lib/shipping-v2/kardex";
import { VisorDocumentosProvider } from "@/components/documentos/DocumentoModal";
import { KardexTabla } from "./KardexTabla";

type Datos = { movimientos: MovimientoKardex[]; sku: string; cuadra: boolean; libro: number; inventario: number; verCostos: boolean };

export function KardexRegistroTab({ itemId }: { itemId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/shipping-v2/items/${itemId}/kardex`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (!j.success) throw new Error(j.error || "No se pudo cargar.");
        setDatos(j.data);
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar."));
    return () => {
      vivo = false;
    };
  }, [itemId]);

  if (error) return <p className="px-1 py-3 text-[12.5px] text-[#FFB07A]">{error}</p>;
  if (!datos) return <p className="flex items-center gap-2 px-1 py-3 text-[12.5px] text-[#8F908A]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Cargando…</p>;

  return (
    <VisorDocumentosProvider resaltarSku={datos.sku}>
    <div className="space-y-2 animate-[sg-entrada_180ms_ease-out]">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
        <span className="text-[#8F908A]">
          Esta unidad ·{" "}
          {datos.cuadra ? <span className="text-[#7BE495]">✓ cuadra</span> : <span className="text-[#FFB07A]">libro {datos.libro} · inventario {datos.inventario}</span>}
        </span>
        {datos.sku ? <Link href={`/shipping-v2/kardex?vista=producto&q=${encodeURIComponent(datos.sku)}`} className="font-semibold text-[#D7FF4F] hover:underline">Kardex del producto {datos.sku} →</Link> : null}
      </div>
      <KardexTabla movimientos={datos.movimientos} verCostos={datos.verCostos} mostrarUnidad={false} vacio="Todavía no entra a la tienda: el Kardex empieza al recibirlo." />
    </div>
    </VisorDocumentosProvider>
  );
}
