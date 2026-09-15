"use client";

// Guía visual de la inspección.
//
// Es un dibujo GENÉRICO de la categoría, no el equipo real: sirve para ubicar
// dónde mirar, no para identificar el modelo. Cada zona se dibuja dos veces —
// el contorno tenue siempre, y encima una capa de "radiografía" que se
// enciende cuando esa zona está seleccionada, con el color de su resultado.
//
// Las categorías sin dibujo propio no muestran nada y la inspección funciona
// igual con la lista de la izquierda: un cable o una fuente de poder no
// necesitan mapa.

import type { PerfilRevision } from "@/lib/shipping-v2/revision-tecnica";

export type ZonaDibujo = {
  id: string;
  numero: number;
  nombre: string;
  estado: "" | "parcial" | "ok" | "falla" | "na";
};

/** Posición del número sobre el dibujo, en % del alto y ancho del lienzo. */
export const COORDENADAS: Partial<Record<PerfilRevision, Record<string, { x: number; y: number }>>> = {
  laptop: {
    pantalla: { x: 50, y: 25 },
    chasis: { x: 26, y: 56 },
    teclado: { x: 33, y: 64 },
    touchpad: { x: 50, y: 80 },
    conectividad: { x: 18, y: 69 },
    ram: { x: 50, y: 69 },
    ventilacion: { x: 75, y: 69 },
    disco: { x: 62, y: 80 },
    arranque: { x: 84, y: 80 },
    bateria: { x: 30, y: 88 },
    puertos: { x: 69, y: 92 },
  },
  allinone: {
    pantalla: { x: 50, y: 36 },
    soporte: { x: 50, y: 88 },
    puertos: { x: 63, y: 70 },
  },
  monitor: {
    panel: { x: 50, y: 36 },
    puertos: { x: 62, y: 79 },
    osd: { x: 79, y: 72 },
    soporte: { x: 50, y: 92 },
  },
};

const CON_DIBUJO = new Set<PerfilRevision>(["laptop", "allinone", "monitor"]);

function claseZona(estado: ZonaDibujo["estado"], activa: boolean) {
  if (!activa) return "opacity-20";
  if (estado === "ok") return "opacity-100 [--luz:#7BE495]";
  if (estado === "falla") return "opacity-100 [--luz:#FF7A6B]";
  return "opacity-100 [--luz:#D7FF4F]";
}

export function DibujoEquipo({
  perfil, zonas, coordenadas, zonaActiva, onElegir,
}: {
  perfil: PerfilRevision;
  zonas: ZonaDibujo[];
  coordenadas: Record<string, { x: number; y: number }>;
  zonaActiva: string;
  onElegir: (id: string) => void;
}) {
  if (!CON_DIBUJO.has(perfil)) {
    return (
      <div className="mx-3.5 mb-3.5 rounded-lg border border-dashed border-[#3A3A36] bg-[#141510] px-3 py-8 text-center">
        <p className="text-[13px] text-[#7E7F76]">
          Esta categoría no tiene guía visual. Trabaja con la lista de puntos de la izquierda.
        </p>
      </div>
    );
  }

  const ubicadas = zonas.filter((z) => coordenadas[z.id]);

  return (
    <>
      <div className="relative mx-3.5 mb-2.5">
        <svg viewBox="0 0 1000 560" role="img"
          aria-label={`Esquema de ${perfil} con sus zonas de inspección`}
          className="block h-auto w-full [--traza:#8E9086]">
          {perfil === "monitor" ? <Monitor zonas={zonas} activa={zonaActiva} />
            : perfil === "allinone" ? <Monitor zonas={zonas} activa={zonaActiva} />
            : <Laptop zonas={zonas} activa={zonaActiva} />}
        </svg>

        {ubicadas.map((z) => {
          const pos = coordenadas[z.id];
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

/** Capa de radiografía de una zona: tenue siempre, encendida al seleccionarla. */
function Capa({ id, zonas, activa, children }: {
  id: string; zonas: ZonaDibujo[]; activa: string; children: React.ReactNode;
}) {
  const zona = zonas.find((z) => z.id === id);
  if (!zona) return null;
  const esActiva = id === activa;
  return (
    <g className={`transition-opacity ${claseZona(zona.estado, esActiva)}`}
      style={esActiva ? { filter: "drop-shadow(0 0 5px var(--luz))" } : undefined}
      fill="none"
      stroke={esActiva ? "var(--luz)" : "var(--traza)"}
      strokeWidth={esActiva ? 2.4 : 1.6}
      strokeLinejoin="round">
      {children}
    </g>
  );
}

function Laptop({ zonas, activa }: { zonas: ZonaDibujo[]; activa: string }) {
  return (
    <>
      <defs>
        <pattern id="kbInsp" width="40" height="30" patternUnits="userSpaceOnUse">
          <rect x="4" y="4" width="32" height="22" rx="4" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".75" />
        </pattern>
      </defs>

      <rect x="258" y="26" width="484" height="316" rx="16" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2" />
      <rect x="284" y="52" width="432" height="264" rx="6" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75" />
      <circle cx="500" cy="39" r="6" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".75" />
      <rect x="292" y="336" width="58" height="18" rx="6" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".75" />
      <rect x="650" y="336" width="58" height="18" rx="6" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".75" />
      <path d="M262 348 L738 348 L806 500 L194 500 Z" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M194 500 L806 500 L812 516 Q500 528 188 516 Z" fill="#26271F" stroke="var(--traza)" strokeWidth="2.2" strokeLinejoin="round" />
      <rect x="300" y="360" width="400" height="62" fill="url(#kbInsp)" />
      <rect x="418" y="436" width="164" height="42" rx="6" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".75" />

      <Capa id="pantalla" zonas={zonas} activa={activa}>
        <rect x="284" y="52" width="432" height="264" rx="6" />
      </Capa>
      <Capa id="chasis" zonas={zonas} activa={activa}>
        <rect x="292" y="336" width="58" height="18" rx="6" />
        <rect x="650" y="336" width="58" height="18" rx="6" />
      </Capa>
      <Capa id="teclado" zonas={zonas} activa={activa}>
        <rect x="296" y="356" width="408" height="70" rx="5" />
      </Capa>
      <Capa id="touchpad" zonas={zonas} activa={activa}>
        <rect x="418" y="436" width="164" height="42" rx="6" />
      </Capa>
      <Capa id="conectividad" zonas={zonas} activa={activa}>
        <rect x="214" y="372" width="96" height="44" rx="6" />
        <path d="M232 394 q30 -22 60 0 M244 402 q18 -13 36 0" />
      </Capa>
      <Capa id="bateria" zonas={zonas} activa={activa}>
        <rect x="222" y="430" width="180" height="56" rx="7" />
        <path d="M264 430 v56 M306 430 v56 M348 430 v56" />
      </Capa>
      <Capa id="ram" zonas={zonas} activa={activa}>
        <rect x="424" y="352" width="152" height="26" rx="4" />
        <rect x="424" y="384" width="152" height="26" rx="4" />
        <path d="M446 378 v6 M470 378 v6 M494 378 v6 M518 378 v6 M542 378 v6" />
      </Capa>
      <Capa id="disco" zonas={zonas} activa={activa}>
        <rect x="592" y="424" width="116" height="40" rx="5" />
        <path d="M600 434 h22 M600 444 h22 M600 454 h22" />
      </Capa>
      <Capa id="ventilacion" zonas={zonas} activa={activa}>
        <circle cx="716" cy="378" r="44" />
        <circle cx="716" cy="378" r="13" />
        <path d="M716 334 a44 44 0 0 1 38 22 M754 400 a44 44 0 0 1 -38 22 M678 400 a44 44 0 0 1 0 -44" />
      </Capa>
      <Capa id="arranque" zonas={zonas} activa={activa}>
        <rect x="620" y="472" width="168" height="24" rx="4" />
        <path d="M636 472 v24 M660 472 v24 M700 478 h60 M700 490 h40" />
      </Capa>
      <Capa id="puertos" zonas={zonas} activa={activa}>
        <rect x="600" y="502" width="34" height="16" rx="3" />
        <rect x="646" y="502" width="26" height="14" rx="6" />
        <rect x="684" y="502" width="38" height="16" rx="3" />
        <circle cx="748" cy="510" r="9" />
        <rect x="276" y="502" width="34" height="16" rx="3" />
        <rect x="322" y="502" width="26" height="14" rx="6" />
      </Capa>
    </>
  );
}

function Monitor({ zonas, activa }: { zonas: ZonaDibujo[]; activa: string }) {
  return (
    <>
      <rect x="150" y="30" width="700" height="392" rx="14" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2" />
      <rect x="172" y="52" width="656" height="330" rx="6" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75" />
      <path d="M452 422 h96 l14 66 h-124 Z" fill="#26271F" stroke="var(--traza)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M320 488 h360 q20 0 20 14 t-20 14 h-360 q-20 0 -20 -14 t20 -14 Z" fill="#26271F" stroke="var(--traza)" strokeWidth="2.2" strokeLinejoin="round" />

      <Capa id="panel" zonas={zonas} activa={activa}>
        <rect x="172" y="52" width="656" height="330" rx="6" />
      </Capa>
      <Capa id="pantalla" zonas={zonas} activa={activa}>
        <rect x="172" y="52" width="656" height="330" rx="6" />
      </Capa>
      <Capa id="puertos" zonas={zonas} activa={activa}>
        <rect x="566" y="428" width="38" height="16" rx="3" />
        <rect x="614" y="428" width="38" height="16" rx="3" />
        <rect x="662" y="428" width="44" height="16" rx="3" />
      </Capa>
      <Capa id="osd" zonas={zonas} activa={activa}>
        <circle cx="752" cy="436" r="8" />
        <circle cx="782" cy="436" r="8" />
        <circle cx="812" cy="436" r="8" />
      </Capa>
      <Capa id="soporte" zonas={zonas} activa={activa}>
        <path d="M452 422 h96 l14 66 h-124 Z" />
        <path d="M320 488 h360 q20 0 20 14 t-20 14 h-360 q-20 0 -20 -14 t20 -14 Z" />
      </Capa>
    </>
  );
}
