"use client";

// Guía visual de la inspección.
//
// Es un dibujo GENÉRICO de la categoría, no el equipo real: sirve para ubicar
// dónde mirar, no para identificar el modelo. Cada zona se dibuja dos veces —
// el contorno tenue siempre, y encima una capa de "radiografía" que se
// enciende cuando esa zona está seleccionada, con el color de su resultado.
//
// Este archivo es solo el mecanismo (capas, números, leyenda). Los trazos de
// cada categoría viven en ./trazos, junto con las coordenadas de sus números.
//
// Las categorías sin dibujo propio no muestran nada y la inspección funciona
// igual con la lista de la izquierda: un módulo de RAM o una fuente suelta
// tienen una sola zona y nada que señalar, ahí el mapa sería adorno.

import type { PerfilRevision } from "@/lib/shipping-v2/revision-tecnica";
import { TRAZOS } from "./trazos";

export type ZonaDibujo = {
  id: string;
  numero: number;
  nombre: string;
  estado: "" | "parcial" | "ok" | "falla" | "na";
};

function claseZona(estado: ZonaDibujo["estado"], activa: boolean) {
  if (!activa) return "opacity-20";
  if (estado === "ok") return "opacity-100 [--luz:#7BE495]";
  if (estado === "falla") return "opacity-100 [--luz:#FF7A6B]";
  return "opacity-100 [--luz:#D7FF4F]";
}

export function DibujoEquipo({
  perfil, zonas, zonaActiva, onElegir,
}: {
  perfil: PerfilRevision;
  zonas: ZonaDibujo[];
  zonaActiva: string;
  onElegir: (id: string) => void;
}) {
  const trazo = TRAZOS[perfil];

  if (!trazo) {
    return (
      <div className="mx-3.5 mb-3.5 rounded-lg border border-dashed border-[#3A3A36] bg-[#141510] px-3 py-8 text-center">
        <p className="text-[13px] text-[#7E7F76]">
          Esta categoría no tiene guía visual. Trabaja con la lista de puntos de la izquierda.
        </p>
      </div>
    );
  }

  const ubicadas = zonas.filter((z) => trazo.coords[z.id]);

  return (
    <>
      <div className="relative mx-3.5 mb-2.5">
        <svg viewBox="0 0 1000 560" role="img"
          aria-label={`Esquema de ${perfil} con sus zonas de inspección`}
          className="block h-auto w-full [--traza:#8E9086]">
          {trazo.base}
          {zonas.map((z) => {
            const capa = trazo.capas[z.id];
            if (!capa) return null;
            const esActiva = z.id === zonaActiva;
            return (
              <g key={z.id}
                className={`transition-opacity ${claseZona(z.estado, esActiva)}`}
                style={esActiva ? { filter: "drop-shadow(0 0 5px var(--luz))" } : undefined}
                fill="none"
                stroke={esActiva ? "var(--luz)" : "var(--traza)"}
                strokeWidth={esActiva ? 2.4 : 1.6}
                strokeLinejoin="round">
                {capa}
              </g>
            );
          })}
        </svg>

        {ubicadas.map((z) => {
          const pos = trazo.coords[z.id];
          const activa = z.id === zonaActiva;
          const color = z.estado === "ok" ? "border-[#A8F0BC] bg-[#7BE495] text-[#10261A]"
            : z.estado === "falla" ? "border-[#FFB3A9] bg-[#FF7A6B] text-[#2B0D09]"
            : z.estado === "na" ? "border-[#A3A49A] bg-[#7E7F76] text-[#15160F]"
            : "border-[#3A3A36] bg-[#15160F] text-[#B4B5AC]";
          return (
            <button key={z.id} type="button" title={z.nombre} onClick={() => onElegir(z.id)}
              aria-current={activa}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              className={`absolute grid h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 font-mono text-[11px] font-semibold shadow-lg shadow-black/60 transition hover:scale-110 ${color} ${
                activa ? "ring-[3px] ring-[#D7FF4F]" : ""}`}>
              {z.numero}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 px-3.5 pb-3.5 text-[11px] text-[#7E7F76]">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#7BE495]" /> Conforme</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#FF7A6B]" /> Con falla</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#7E7F76]" /> No aplica</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full border border-[#3A3A36] bg-[#2A2B23]" /> Sin revisar</span>
        <span className="ml-auto">Dibujo genérico de la categoría, no el equipo real.</span>
      </div>
    </>
  );
}
