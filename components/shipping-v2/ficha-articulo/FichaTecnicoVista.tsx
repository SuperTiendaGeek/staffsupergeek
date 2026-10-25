"use client";

// Punto 18 (25-oct-2026): ficha del artículo para el TÉCNICO. Se arma solo con
// lo que el servidor le entrega (FichaTecnica): identificación, fotos, precio
// como dato, inspección, mejoras, despiece y novedades. No existen aquí costos,
// logística, pagos, packing, publicaciones ni "Administrar": esos datos nunca
// llegan a su navegador.

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ClipboardCheck, GitBranch } from "lucide-react";
import { ItemPhotoViewer } from "@/components/shipping-v2/ItemPhotoViewer";
import { InlineEditableField } from "@/components/shipping-v2/InlineEditableField";
import { CopyableSKU } from "@/components/ui/copyable-sku";
import { avanceDeInspeccion } from "@/lib/shipping-v2/revision-tecnica-snapshot";
import { FICHA_TECNICO, type BloqueFichaTecnica, type PestanaFichaTecnica } from "@/lib/shipping-v2/ficha-secciones";
import type { FichaTecnica } from "@/lib/shipping-v2/ficha-articulo";
import {
  EstadoBadge,
  HeroStat,
  NovedadesVinculadasCard,
  PasoChip,
  PasoRecorrido,
  UnidadDelProducto,
  formatCurrency,
  shortDate,
} from "@/app/shipping-v2/items/ShippingV2ItemsClient";
import { ShippingV2IntervencionesTab } from "@/app/shipping-v2/items/ShippingV2IntervencionesTab";
import { ShippingV2DespieceTab } from "@/app/shipping-v2/items/ShippingV2DespieceTab";

const ETIQUETA_PESTANA: Record<PestanaFichaTecnica, string> = {
  mejoras: "Mejoras",
  despiece: "Despiece",
  datos: "Datos técnicos",
};

const SIN_PROVEEDORES = new Map<string, string>();

function texto(valor: unknown) {
  const t = typeof valor === "number" ? String(valor) : typeof valor === "string" ? valor.trim() : "";
  return t || "—";
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <InlineEditableField layout="row" label={etiqueta} value={typeof valor === "string" ? valor : ""} type="readOnly" readOnly displayValue={valor} />
  );
}

export function FichaTecnicoVista({ datos, modo, alCambiar }: { datos: FichaTecnica; modo: "modal" | "pagina"; alCambiar?: () => void }) {
  const { item } = datos;
  const [pestana, setPestana] = useState<PestanaFichaTecnica>(FICHA_TECNICO.pestanas[0]);
  const avance = avanceDeInspeccion(item.revisionTecnicaDetalle, item.revisadoFisicamente === true);
  const fallas = item.puntosRevisionFallidos ?? 0;
  const pideInspeccion = item.requiereInspeccion === true || avance !== "sin-empezar";
  const serie = String(item.numeroSerie ?? "").trim();
  const sku = String(item.sku ?? "").trim();
  const resto = [item.categoria, item.condicion, [item.marca, item.modelo].filter(Boolean).join(" ")].map((v) => String(v ?? "").trim()).filter(Boolean).join(" · ");

  // ── Inspección: el trabajo principal, con su botón a la vista ──
  const inspeccion = (() => {
    if (item.recibido !== true) {
      return { titulo: "Aún no llega a la tienda", detalle: "", chip: <PasoChip tono="nada">Pendiente</PasoChip>, boton: null as string | null };
    }
    if (avance === "firmada") {
      return {
        titulo: "Inspección firmada",
        detalle: [item.revisadoPor ? `Firmó ${item.revisadoPor}` : "", shortDate(item.fechaRevision), fallas ? `${fallas} punto${fallas === 1 ? "" : "s"} con falla` : "Sin fallas"].filter(Boolean).join(" · "),
        chip: <PasoChip tono={fallas ? "alerta" : "ok"}>Firmada</PasoChip>,
        boton: "Ver inspección",
      };
    }
    if (avance === "en-proceso") {
      return { titulo: "Inspección a medias", detalle: "Alguien empezó y no firmó", chip: <PasoChip tono="espera">En proceso</PasoChip>, boton: "Continuar" };
    }
    if (pideInspeccion) {
      return { titulo: "Falta inspeccionar", detalle: "Revisar y firmar la ficha", chip: <PasoChip tono="espera">Pendiente</PasoChip>, boton: "Inspeccionar" };
    }
    return { titulo: "No requiere inspección", detalle: "", chip: <PasoChip tono="ok">Listo</PasoChip>, boton: "Inspeccionar igual" };
  })();
  const botonPrincipal = inspeccion.boton && datos.inspeccionHref && avance !== "firmada" && inspeccion.boton !== "Inspeccionar igual";

  const bloques: Record<BloqueFichaTecnica, ReactNode> = {
    inspeccion: (
      <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[#2E2F28] bg-[#171814] px-3 py-2">
        <ClipboardCheck className="h-4 w-4 shrink-0 text-[#8F908A]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-[#F5F5F5]">{inspeccion.titulo} {inspeccion.chip}</p>
          {inspeccion.detalle ? <p className="truncate text-[12px] text-[#8F908A]" title={inspeccion.detalle}>{inspeccion.detalle}</p> : null}
        </div>
        {inspeccion.boton && datos.inspeccionHref ? (
          <Link
            href={datos.inspeccionHref}
            className={`inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-[12.5px] font-bold transition focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 ${botonPrincipal ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] hover:brightness-105" : "border-[#3A3A36] bg-[#1C1D19] text-[#E6E6E1] hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F]"}`}
          >
            {inspeccion.boton}
          </Link>
        ) : null}
      </section>
    ),
    origen: datos.origen.itemPadre || datos.origen.origenMejora ? (
      <section className="overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
        <ol className="divide-y divide-[#24251F]">
          {datos.origen.itemPadre ? (
            <PasoRecorrido icon={GitBranch} etiqueta="Sale de" principal={datos.origen.itemPadre.sku || "Artículo padre"} articuloId={datos.origen.itemPadre.id} detalle={datos.origen.itemPadre.nombre ? `Despiece de ${datos.origen.itemPadre.nombre}` : "Despiece"} />
          ) : null}
          {datos.origen.origenMejora ? (
            <PasoRecorrido icon={GitBranch} etiqueta="Sale de" principal={datos.origen.origenMejora.equipoSku} articuloId={datos.origen.origenMejora.equipoId} detalle={["Mejora", shortDate(datos.origen.origenMejora.fecha), datos.origen.origenMejora.equipoNombre].filter(Boolean).join(" · ")} />
          ) : null}
        </ol>
      </section>
    ) : null,
    pestanas: (
      <section className="overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
        <div role="tablist" className="flex gap-0.5 overflow-x-auto border-b border-[#2E2F28] bg-[#1A1B17] px-1 pt-1">
          {FICHA_TECNICO.pestanas.map((clave) => {
            const activa = clave === pestana;
            return (
              <button
                key={clave}
                type="button"
                role="tab"
                aria-selected={activa}
                title={clave === "mejoras" ? "Mantenimientos y mejoras" : undefined}
                onClick={() => setPestana(clave)}
                className={`-mb-px shrink-0 whitespace-nowrap rounded-t-md border border-b-0 px-2.5 py-1.5 text-[12.5px] font-semibold transition ${activa ? "border-[#2E2F28] bg-[#171814] text-[#D7FF4F]" : "border-transparent text-[#8F908A] hover:text-[#F5F5F5]"}`}
              >
                {ETIQUETA_PESTANA[clave]}
              </button>
            );
          })}
        </div>
        <div key={pestana} className="p-2 animate-[sg-entrada_150ms_ease-out]">
          {pestana === "mejoras" ? (
            <ShippingV2IntervencionesTab itemId={item.id} />
          ) : pestana === "despiece" ? (
            <ShippingV2DespieceTab itemId={item.id} canEdit={false} esAdmin={false} />
          ) : (
            <dl className="grid gap-x-6 lg:grid-cols-2">
              <Fila etiqueta="Resumen técnico" valor={texto(item.resumenTecnico)} />
              <Fila etiqueta="Accesorios incluidos" valor={<span className="whitespace-pre-line">{texto(item.accesoriosIncluidos)}</span>} />
              <Fila etiqueta="Marca" valor={texto(item.marca)} />
              <Fila etiqueta="Modelo" valor={texto(item.modelo)} />
              <Fila etiqueta="Categoría" valor={texto(item.categoria)} />
              <Fila etiqueta="Condición" valor={texto(item.condicion)} />
              <Fila etiqueta="Estado de revisión" valor={texto(item.estadoRevision)} />
              <Fila etiqueta="Estado de despiece" valor={texto(item.estadoDespiece)} />
              <Fila etiqueta="Requiere inspección" valor={item.requiereInspeccion ? "Sí" : "No"} />
              <Fila etiqueta="Descripción" valor={<span className="whitespace-pre-line">{texto(item.descripcion)}</span>} />
            </dl>
          )}
        </div>
      </section>
    ),
    novedades: (
      <NovedadesVinculadasCard
        novedades={datos.novedades}
        providerLabelsById={SIN_PROVEEDORES}
        item={{ id: item.id, sku: item.sku, nombre: item.nombre, cantidad: item.cantidad, estado: item.estado }}
        rol={datos.rolNovedades}
        puedeRegistrar={datos.puedeRegistrarNovedades}
        canEditItems={false}
        alCambiar={alCambiar}
      />
    ),
  };

  return (
    <div className="grid w-full gap-3 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] 2xl:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
      <aside className={`min-w-0 md:sticky md:self-start ${modo === "modal" ? "md:top-0" : "md:top-16"}`}>
        <ItemPhotoViewer itemId={item.id} itemName={item.nombre} fotos={item.fotos} onUpdated={() => undefined} canEdit={false} density="hero" />
      </aside>

      <div className="min-w-0 space-y-3">
        <section className="rounded-lg border border-[#2E2F28] bg-[#171814]">
          <div className="p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <EstadoBadge estado={item.estado} />
              {item.conNovedad ? <span className="rounded-full border border-[#FF914D]/35 bg-[#FF914D]/12 px-2.5 py-0.5 text-[12px] font-semibold text-[#FFB07A]">Con novedad</span> : null}
              {item.usoLocal ? <span className="rounded-full border border-[#8B73FF]/35 bg-[#8B73FF]/12 px-2.5 py-0.5 text-[12px] font-semibold text-[#C9BFFF]">Activo de la tienda</span> : null}
            </div>
            <h2 className="mt-2 break-words text-xl font-semibold leading-tight text-[#F5F5F5] lg:text-[22px]">{item.nombre?.trim() || "Sin nombre"}</h2>
            {resto ? <p className="mt-1 text-[12px] text-[#8F908A]">{resto}</p> : null}
            <UnidadDelProducto item={item} hermanas={datos.hermanas} />
          </div>
          {/* Identificación (solo lectura): lo que el técnico busca y compara. */}
          <div className="grid grid-cols-2 gap-px border-t border-[#24251F] bg-[#24251F] sm:grid-cols-4">
            <HeroStat label="SKU">{sku ? <CopyableSKU sku={sku} /> : "—"}</HeroStat>
            <HeroStat label="Serie">{serie ? <CopyableSKU sku={serie} etiqueta="Serie" /> : <span className="text-[#5E5F59]">Sin serie</span>}</HeroStat>
            <HeroStat label="SKU proveedor">{item.skuProveedor?.trim() ? <CopyableSKU sku={item.skuProveedor.trim()} etiqueta="SKU proveedor" /> : "—"}</HeroStat>
            <HeroStat label="Precio venta" title="Solo informativo">{formatCurrency(item.precioVenta ?? null)}</HeroStat>
          </div>
        </section>

        {FICHA_TECNICO.bloques.map((bloque) => (bloques[bloque] ? <div key={bloque}>{bloques[bloque]}</div> : null))}
      </div>
    </div>
  );
}
