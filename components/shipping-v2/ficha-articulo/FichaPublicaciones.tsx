"use client";

// Punto 18 (25-oct-2026): "Publicaciones" en la ficha (Administrador y Staff).
// Una fila por anuncio: canal · quién y cuándo · estado. Los retirados quedan
// como historial. Lo marcado antes del gestor (casillas de Recepción) se
// muestra con su "quién y cuándo" si existe; nunca se inventa un dato.

import { useState } from "react";
import { ChevronDown, ExternalLink, Megaphone } from "lucide-react";
import type { FichaPublicacion } from "@/lib/shipping-v2/ficha-articulo";

const VISIBLES = 4;

const TONO_ESTADO: Record<FichaPublicacion["estado"], string> = {
  Publicado: "border-[#7BE495]/35 bg-[#7BE495]/10 text-[#9FEFB3]",
  "Por retirar": "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]",
  Borrador: "border-[#3A3A36] bg-[#151515] text-[#8F908A]",
  Retirado: "border-[#3A3A36] bg-[#151515] text-[#6F706B]",
};

const COLOR_CANAL: Record<string, string> = {
  Marketplace: "bg-[#4FC3FF]",
  "Grupos Facebook": "bg-[#8B73FF]",
  "Mercado Libre": "bg-[#F4E85B]",
  Shopify: "bg-[#7BE495]",
};

function fechaHora(valor?: string) {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Guayaquil",
  }).format(fecha).replace(",", "");
}

function quienCuando(quien?: string, cuando?: string) {
  return [quien, fechaHora(cuando)].filter(Boolean).join(" · ");
}

export function FichaPublicaciones({ publicaciones }: { publicaciones: readonly FichaPublicacion[] }) {
  const [todas, setTodas] = useState(false);
  const vigentes = publicaciones.filter((p) => p.estado === "Publicado" || p.estado === "Por retirar").length;
  const lista = todas ? publicaciones : publicaciones.slice(0, VISIBLES);
  const ocultas = publicaciones.length - lista.length;

  return (
    <section className="overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
      <h2 className="flex items-center gap-2 border-b border-[#2E2F28] bg-[#1A1B17] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[#8F908A]">
        <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
        Publicaciones
        {publicaciones.length ? (
          <span className="font-semibold normal-case tracking-normal text-[#6F706B]">
            {vigentes} vigente{vigentes === 1 ? "" : "s"}
            {publicaciones.length > vigentes ? ` · ${publicaciones.length - vigentes} en historial` : ""}
          </span>
        ) : null}
      </h2>
      {!publicaciones.length ? (
        <p className="px-3 py-2 text-[12.5px] text-[#8F908A]">Sin publicar en ningún canal.</p>
      ) : (
        <ol className="divide-y divide-[#24251F]">
          {lista.map((p) => {
            const retirado = p.estado === "Retirado";
            const detalle = retirado
              ? [quienCuando(p.publicadoPor, p.fechaPublicado), p.retiradoPor || p.fechaRetirado ? `retiró ${quienCuando(p.retiradoPor, p.fechaRetirado)}` : ""].filter(Boolean).join(" → ")
              : quienCuando(p.publicadoPor, p.fechaPublicado);
            return (
              <li key={p.id} className="grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 animate-[sg-entrada_160ms_ease-out]">
                <span className={`flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold ${retirado ? "text-[#8F908A]" : "text-[#E6E6E1]"}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR_CANAL[p.canal] ?? "bg-[#8F908A]"} ${retirado ? "opacity-40" : ""}`} aria-hidden="true" />
                  <span className="truncate">{p.canal}</span>
                  {p.alcance === "Unidad" ? <span className="shrink-0 text-[10.5px] font-medium text-[#8F908A]" title="Anuncio aparte de esta unidad">· unidad</span> : null}
                </span>
                <span className="flex min-w-0 items-center gap-2 text-[12px] text-[#8F908A]">
                  <span className="truncate" title={p.origen === "casilla" ? "Marcado en Recepción, antes del gestor de publicaciones" : detalle}>
                    {detalle || (p.origen === "casilla" ? "Marcado en Recepción" : "Sin fecha")}
                  </span>
                  {p.enlace ? (
                    <a href={p.enlace} target="_blank" rel="noreferrer" className="shrink-0 text-[#D7FF4F] hover:underline" title="Abrir el anuncio">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">Abrir el anuncio</span>
                    </a>
                  ) : null}
                </span>
                <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-px text-[10.5px] font-semibold ${TONO_ESTADO[p.estado]}`}>{p.estado}</span>
              </li>
            );
          })}
        </ol>
      )}
      {ocultas > 0 || todas ? (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-[#24251F] py-1 text-[11.5px] font-semibold text-[#8F908A] transition hover:text-[#D7FF4F]"
        >
          {todas ? "Ver menos" : `Ver ${ocultas} más`}
          <ChevronDown className={`h-3.5 w-3.5 transition ${todas ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
