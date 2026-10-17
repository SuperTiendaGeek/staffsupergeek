"use client";

// Los trazos de la guía visual, uno por perfil de revisión.
//
// Cada entrada trae tres cosas juntas a propósito: el dibujo de fondo
// (`base`), el contorno de cada zona (`capas`) y dónde va su número
// (`coords`). Antes las coordenadas vivían en otro archivo, lejos de las
// formas que numeran, y bastaba mover un rectángulo para que el número
// quedara flotando en el vacío sin que nada avisara.
//
// Reglas del lenguaje visual, para que los dibujos nuevos no desentonen:
//   · Lienzo 1000x560 siempre. El objeto centrado, con aire alrededor.
//   · Trazo `var(--traza)`; cuerpo #1E1F19, hueco #101109, pieza #26271F.
//   · Las `capas` son SOLO contorno: el componente les pone fill/stroke.
//   · Cero texto. Es un esquema genérico de la categoría, no el equipo real.
//   · Lo que está adentro del equipo (RAM, disco, batería) se dibuja como
//     radiografía sobre la carcasa; es la misma metáfora que usa el resaltado.
//
// Solo tienen dibujo los perfiles con varias zonas que ubicar. Un cable, una
// fuente suelta o un módulo de RAM tienen una zona y nada que señalar: ahí el
// dibujo sería adorno, y la inspección funciona igual con la lista.

import type { ReactNode } from "react";
import type { PerfilRevision } from "@/lib/shipping-v2/revision-tecnica";

export type Trazo = {
  /** Posición del número de cada zona, en % del ancho y alto del lienzo. */
  coords: Record<string, { x: number; y: number }>;
  base: ReactNode;
  capas: Record<string, ReactNode>;
};

export const TRAZOS: Partial<Record<PerfilRevision, Trazo>> = {

  laptop: {
    coords: {
      pantalla: { x: 50, y: 25 }, chasis: { x: 26, y: 56 }, teclado: { x: 33, y: 64 },
      touchpad: { x: 50, y: 80 }, conectividad: { x: 18, y: 69 }, ram: { x: 50, y: 69 },
      ventilacion: { x: 75, y: 69 }, disco: { x: 62, y: 80 }, arranque: { x: 84, y: 80 },
      bateria: { x: 30, y: 88 }, puertos: { x: 69, y: 92 },
    },
    base: (
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
      </>
    ),
    capas: {
      pantalla: <rect x="284" y="52" width="432" height="264" rx="6" />,
      chasis: (
        <>
          <rect x="292" y="336" width="58" height="18" rx="6" />
          <rect x="650" y="336" width="58" height="18" rx="6" />
        </>
      ),
      teclado: <rect x="296" y="356" width="408" height="70" rx="5" />,
      touchpad: <rect x="418" y="436" width="164" height="42" rx="6" />,
      conectividad: (
        <>
          <rect x="214" y="372" width="96" height="44" rx="6" />
          <path d="M232 394 q30 -22 60 0 M244 402 q18 -13 36 0" />
        </>
      ),
      bateria: (
        <>
          <rect x="222" y="430" width="180" height="56" rx="7" />
          <path d="M264 430 v56 M306 430 v56 M348 430 v56" />
        </>
      ),
      ram: (
        <>
          <rect x="424" y="352" width="152" height="26" rx="4" />
          <rect x="424" y="384" width="152" height="26" rx="4" />
          <path d="M446 378 v6 M470 378 v6 M494 378 v6 M518 378 v6 M542 378 v6" />
        </>
      ),
      disco: (
        <>
          <rect x="592" y="424" width="116" height="40" rx="5" />
          <path d="M600 434 h22 M600 444 h22 M600 454 h22" />
        </>
      ),
      ventilacion: (
        <>
          <circle cx="716" cy="378" r="44" />
          <circle cx="716" cy="378" r="13" />
          <path d="M716 334 a44 44 0 0 1 38 22 M754 400 a44 44 0 0 1 -38 22 M678 400 a44 44 0 0 1 0 -44" />
        </>
      ),
      arranque: (
        <>
          <rect x="620" y="472" width="168" height="24" rx="4" />
          <path d="M636 472 v24 M660 472 v24 M700 478 h60 M700 490 h40" />
        </>
      ),
      puertos: (
        <>
          <rect x="600" y="502" width="34" height="16" rx="3" />
          <rect x="646" y="502" width="26" height="14" rx="6" />
          <rect x="684" y="502" width="38" height="16" rx="3" />
          <circle cx="748" cy="510" r="9" />
          <rect x="276" y="502" width="34" height="16" rx="3" />
          <rect x="322" y="502" width="26" height="14" rx="6" />
        </>
      ),
    },
  },

  monitor: {
    coords: {
      panel: { x: 50, y: 36 }, puertos: { x: 62, y: 79 },
      osd: { x: 79, y: 72 }, soporte: { x: 50, y: 92 }, accesorios: { x: 22, y: 88 },
    },
    base: (
      <>
        <rect x="150" y="30" width="700" height="392" rx="14" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2" />
        <rect x="172" y="52" width="656" height="330" rx="6" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75" />
        <path d="M452 422 h96 l14 66 h-124 Z" fill="#26271F" stroke="var(--traza)" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M320 488 h360 q20 0 20 14 t-20 14 h-360 q-20 0 -20 -14 t20 -14 Z" fill="#26271F" stroke="var(--traza)" strokeWidth="2.2" strokeLinejoin="round" />
      </>
    ),
    capas: {
      panel: <rect x="172" y="52" width="656" height="330" rx="6" />,
      puertos: (
        <>
          <rect x="566" y="428" width="38" height="16" rx="3" />
          <rect x="614" y="428" width="38" height="16" rx="3" />
          <rect x="662" y="428" width="44" height="16" rx="3" />
        </>
      ),
      osd: (
        <>
          <circle cx="752" cy="436" r="8" />
          <circle cx="782" cy="436" r="8" />
          <circle cx="812" cy="436" r="8" />
        </>
      ),
      soporte: (
        <>
          <path d="M452 422 h96 l14 66 h-124 Z" />
          <path d="M320 488 h360 q20 0 20 14 t-20 14 h-360 q-20 0 -20 -14 t20 -14 Z" />
        </>
      ),
      accesorios: (
        <>
          <path d="M240 470 h120 q26 0 26 22 t-26 22 h-120" />
          <rect x="206" y="480" width="34" height="24" rx="5" />
        </>
      ),
    },
  },


  desktop: {
    coords: { gabinete: { x: 70, y: 8 }, arranque: { x: 34, y: 13 }, ventilacion: { x: 34, y: 28.5 }, disco: { x: 34, y: 54 }, fuente: { x: 40, y: 83 }, placa: { x: 47, y: 23 }, ram: { x: 64.7, y: 26.8 }, gpu: { x: 55.8, y: 58 } },
    base: (
      <>
        {/* carcasa vista de lado, panel retirado. El frente va a la izquierda. */}
        <path d="M282 40 h436 a10 10 0 0 1 10 10 v460 a10 10 0 0 1 -10 10 h-436 a10 10 0 0 1 -10 -10 v-460 a10 10 0 0 1 10 -10 Z"
        fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <path d="M400 40 v370" stroke="var(--traza)" strokeWidth="1.3" opacity=".5" fill="none"/>
        <path d="M318 530 v14 M682 530 v14" stroke="var(--traza)" strokeWidth="2.2" opacity=".6" fill="none"/>
        <rect x="300" y="56" width="84" height="34" rx="6" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <circle cx="341" cy="160" r="40" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <rect x="296" y="250" width="88" height="110" rx="6" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <rect x="296" y="420" width="200" height="92" rx="8" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <rect x="414" y="88" width="286" height="292" rx="6" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75"/>
        <rect x="440" y="116" width="100" height="100" rx="8" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <rect x="424" y="300" width="270" height="52" rx="6" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
      </>
    ),
    capas: {
      gabinete: (
        <>
          <path d="M282 40 h436 a10 10 0 0 1 10 10 v460 a10 10 0 0 1 -10 10 h-436 a10 10 0 0 1 -10 -10 v-460 a10 10 0 0 1 10 -10 Z"/>
          <path d="M318 530 v14 M682 530 v14"/>
        </>
      ),
      arranque: (
        <>
          <rect x="300" y="56" width="84" height="34" rx="6"/><circle cx="341" cy="73" r="11"/><path d="M341 66 v9"/>
        </>
      ),
      ventilacion: (
        <>
          <circle cx="341" cy="160" r="40"/><circle cx="341" cy="160" r="13"/>
          <path d="M341 120 a40 40 0 0 1 35 20 M376 180 a40 40 0 0 1 -35 20 M306 180 a40 40 0 0 1 0 -40"/>
        </>
      ),
      disco: (
        <>
          <rect x="296" y="250" width="88" height="110" rx="6"/><path d="M308 272 h64 M308 296 h64 M308 320 h64"/>
        </>
      ),
      fuente: (
        <>
          <rect x="296" y="420" width="200" height="92" rx="8"/><circle cx="346" cy="466" r="30"/>
          <path d="M392 442 h92 M392 466 h92 M392 490 h64"/>
        </>
      ),
      placa: (
        <>
          <rect x="414" y="88" width="286" height="292" rx="6"/><rect x="440" y="116" width="100" height="100" rx="8"/>
          <path d="M440 244 h70 M440 264 h54 M560 116 v38 M592 116 v38"/>
        </>
      ),
      ram: (
        <>
          <rect x="600" y="100" width="20" height="100" rx="3"/><rect x="626" y="100" width="20" height="100" rx="3"/>
          <rect x="652" y="100" width="20" height="100" rx="3"/><rect x="678" y="100" width="20" height="100" rx="3"/>
        </>
      ),
      gpu: (
        <>
          <rect x="424" y="300" width="270" height="52" rx="6"/><circle cx="486" cy="326" r="20"/><circle cx="572" cy="326" r="20"/>
          <path d="M424 352 v16 h64 v-16"/>
        </>
      ),
    },
  },

  allinone: {
    coords: { pantalla: { x: 40, y: 30 }, ventilacion: { x: 30, y: 37 }, ram: { x: 71, y: 26 }, disco: { x: 71, y: 47 }, arranque: { x: 79, y: 68 }, fuente: { x: 23, y: 68 }, soporte: { x: 50, y: 86 } },
    base: (
      <>
        <rect x="170" y="30" width="660" height="380" rx="16" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <rect x="192" y="52" width="616" height="296" rx="6" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75"/>
        <circle cx="500" cy="41" r="6" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <path d="M462 410 h76 l10 56 h-96 Z" fill="#26271F" stroke="var(--traza)" strokeWidth="2.2" strokeLinejoin="round"/>
        <path d="M350 466 h300 q18 0 18 12 t-18 12 h-300 q-18 0 -18 -12 t18 -12 Z" fill="#26271F" stroke="var(--traza)" strokeWidth="2.2" strokeLinejoin="round"/>
        <rect x="760" y="360" width="46" height="18" rx="5" fill="#26271F" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
      </>
    ),
    capas: {
      pantalla: (
        <>
          <rect x="192" y="52" width="616" height="296" rx="6"/>
        </>
      ),
      ventilacion: (
        <>
          <circle cx="300" cy="206" r="40"/><circle cx="300" cy="206" r="13"/>
          <path d="M300 166 a40 40 0 0 1 35 20 M335 226 a40 40 0 0 1 -35 20 M265 226 a40 40 0 0 1 0 -40"/>
          <path d="M212 120 h56 M212 140 h56 M212 160 h56"/>
        </>
      ),
      ram: (
        <>
          <rect x="656" y="100" width="20" height="94" rx="3"/><rect x="682" y="100" width="20" height="94" rx="3"/>
          <rect x="708" y="100" width="20" height="94" rx="3"/>
        </>
      ),
      disco: (
        <>
          <rect x="656" y="232" width="116" height="76" rx="6"/><path d="M668 252 h92 M668 270 h92 M668 288 h64"/>
        </>
      ),
      arranque: (
        <>
          <rect x="760" y="360" width="46" height="18" rx="5"/><circle cx="783" cy="369" r="11"/><path d="M783 362 v8"/>
        </>
      ),
      fuente: (
        <>
          <rect x="196" y="356" width="68" height="26" rx="6"/><circle cx="230" cy="369" r="9"/>
          <path d="M196 369 h-40 q-18 0 -18 18 v30"/>
        </>
      ),
      soporte: (
        <>
          <path d="M462 410 h76 l10 56 h-96 Z"/>
          <path d="M350 466 h300 q18 0 18 12 t-18 12 h-300 q-18 0 -18 -12 t18 -12 Z"/>
        </>
      ),
    },
  },

  tablet: {
    coords: { pantalla: { x: 30, y: 28 }, cuentas: { x: 30, y: 55 }, botones: { x: 46, y: 26 }, camaras: { x: 65, y: 22 }, bateria: { x: 65, y: 60 }, accesorios: { x: 89, y: 72 } },
    base: (
      <>
        <rect x="150" y="60" width="310" height="440" rx="22" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <rect x="172" y="88" width="266" height="384" rx="8" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75"/>
        <circle cx="305" cy="74" r="6" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <rect x="460" y="120" width="9" height="52" rx="4" fill="#26271F" stroke="var(--traza)" strokeWidth="1.1" opacity=".7"/>
        <rect x="360" y="51" width="60" height="9" rx="4" fill="#26271F" stroke="var(--traza)" strokeWidth="1.1" opacity=".7"/>
        <rect x="510" y="60" width="310" height="440" rx="22" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <rect x="536" y="86" width="80" height="80" rx="16" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <circle cx="576" cy="126" r="18" fill="none" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
        <rect x="852" y="330" width="88" height="88" rx="14" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
      </>
    ),
    capas: {
      pantalla: (
        <>
          <rect x="172" y="88" width="266" height="384" rx="8"/>
        </>
      ),
      cuentas: (
        <>
          <rect x="272" y="276" width="66" height="52" rx="9"/><path d="M285 276 v-16 a20 20 0 0 1 40 0 v16"/><circle cx="305" cy="302" r="6"/>
        </>
      ),
      botones: (
        <>
          <rect x="460" y="120" width="9" height="52" rx="4"/><rect x="360" y="51" width="60" height="9" rx="4"/>
        </>
      ),
      camaras: (
        <>
          <rect x="536" y="86" width="80" height="80" rx="16"/><circle cx="576" cy="126" r="18"/><circle cx="305" cy="74" r="6"/>
        </>
      ),
      bateria: (
        <>
          <rect x="548" y="230" width="234" height="200" rx="12"/><rect x="640" y="218" width="50" height="14" rx="4"/>
          <path d="M580 280 h170 M580 320 h170 M580 360 h170"/>
        </>
      ),
      accesorios: (
        <>
          <rect x="852" y="330" width="88" height="88" rx="14"/><path d="M876 330 v-22 M916 330 v-22"/>
          <path d="M896 418 q0 52 -40 60 q-40 8 -40 -26"/><rect x="804" y="350" width="22" height="32" rx="5"/>
        </>
      ),
    },
  },

  celular: {
    coords: { pantalla: { x: 28.5, y: 24 }, cuentas: { x: 28.5, y: 52 }, botones: { x: 40.5, y: 30 }, camaras: { x: 52.5, y: 20 }, bateria: { x: 55.5, y: 64 }, red: { x: 75, y: 25 }, accesorios: { x: 80.5, y: 68 } },
    base: (
      <>
        {/* frente */}
        <rect x="170" y="50" width="230" height="460" rx="28" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <rect x="188" y="78" width="194" height="404" rx="10" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75"/>
        <circle cx="285" cy="96" r="7" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <rect x="400" y="150" width="9" height="46" rx="4" fill="#26271F" stroke="var(--traza)" strokeWidth="1.1" opacity=".7"/>
        <rect x="400" y="212" width="9" height="74" rx="4" fill="#26271F" stroke="var(--traza)" strokeWidth="1.1" opacity=".7"/>
        <rect x="161" y="170" width="9" height="42" rx="4" fill="#26271F" stroke="var(--traza)" strokeWidth="1.1" opacity=".7"/>
        {/* reverso */}
        <rect x="450" y="50" width="230" height="460" rx="28" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <rect x="470" y="74" width="110" height="110" rx="20" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <circle cx="501" cy="108" r="16" fill="none" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
        <circle cx="549" cy="108" r="16" fill="none" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
        <circle cx="501" cy="152" r="16" fill="none" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
        <rect x="680" y="200" width="9" height="56" rx="3" fill="#26271F" stroke="var(--traza)" strokeWidth="1.1" opacity=".7"/>
        {/* cargador */}
        <rect x="758" y="330" width="96" height="96" rx="14" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <path d="M806 426 q0 56 -44 66 q-44 10 -44 -28" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
      </>
    ),
    capas: {
      pantalla: (
        <>
          <rect x="188" y="78" width="194" height="404" rx="10"/>
        </>
      ),
      cuentas: (
        <>
          <rect x="252" y="268" width="66" height="52" rx="9"/><path d="M265 268 v-16 a20 20 0 0 1 40 0 v16"/><circle cx="285" cy="294" r="6"/>
        </>
      ),
      botones: (
        <>
          <rect x="400" y="150" width="9" height="46" rx="4"/><rect x="400" y="212" width="9" height="74" rx="4"/><rect x="161" y="170" width="9" height="42" rx="4"/>
        </>
      ),
      camaras: (
        <>
          <rect x="470" y="74" width="110" height="110" rx="20"/><circle cx="501" cy="108" r="16"/><circle cx="549" cy="108" r="16"/>
          <circle cx="501" cy="152" r="16"/><circle cx="285" cy="96" r="7"/>
        </>
      ),
      bateria: (
        <>
          <rect x="486" y="250" width="158" height="200" rx="12"/><rect x="542" y="238" width="46" height="14" rx="4"/>
          <path d="M510 300 h110 M510 340 h110 M510 380 h110"/>
        </>
      ),
      red: (
        <>
          <rect x="680" y="200" width="9" height="56" rx="3"/><path d="M689 228 h28"/>
          <path d="M730 100 a64 64 0 0 1 0 90 M760 82 a94 94 0 0 1 0 126 M790 64 a124 124 0 0 1 0 162"/>
        </>
      ),
      accesorios: (
        <>
          <rect x="758" y="330" width="96" height="96" rx="14"/><path d="M784 330 v-22 M828 330 v-22"/>
          <path d="M806 426 q0 56 -44 66 q-44 10 -44 -28"/><rect x="706" y="352" width="24" height="34" rx="5"/>
        </>
      ),
    },
  },

  consola: {
    coords: { arranque: { x: 24, y: 30 }, lector: { x: 42, y: 55 }, ventilacion: { x: 24, y: 47 }, cuentas: { x: 42, y: 32 }, controles: { x: 78, y: 44 }, accesorios: { x: 36, y: 84 } },
    base: (
      <>
        <rect x="150" y="150" width="480" height="260" rx="14" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <path d="M150 300 h480" stroke="var(--traza)" strokeWidth="1.3" opacity=".45" fill="none"/>
        <rect x="186" y="330" width="330" height="10" rx="5" fill="#26271F" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
        <path d="M176 196 h84 M176 216 h84 M176 236 h84 M176 256 h84" stroke="var(--traza)" strokeWidth="1.3" opacity=".6" fill="none"/>
        <rect x="700" y="212" width="212" height="128" rx="52" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <path d="M718 320 q-22 54 4 80 q26 24 44 -14 M894 320 q22 54 -4 80 q-26 24 -44 -14"
        fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <circle cx="762" cy="290" r="18" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <circle cx="850" cy="290" r="18" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
      </>
    ),
    capas: {
      arranque: (
        <>
          <circle cx="218" cy="170" r="12"/><path d="M218 162 v9"/><rect x="262" y="160" width="40" height="20" rx="4"/>
        </>
      ),
      ventilacion: (
        <>
          <path d="M176 196 h84 M176 216 h84 M176 236 h84 M176 256 h84"/><circle cx="560" cy="226" r="38"/><circle cx="560" cy="226" r="12"/>
        </>
      ),
      lector: (
        <>
          <rect x="186" y="330" width="330" height="10" rx="5"/><circle cx="352" cy="252" r="46"/><circle cx="352" cy="252" r="14"/>
        </>
      ),
      cuentas: (
        <>
          <rect x="356" y="158" width="66" height="52" rx="9"/><path d="M369 158 v-16 a20 20 0 0 1 40 0 v16"/><circle cx="389" cy="184" r="6"/>
        </>
      ),
      controles: (
        <>
          <rect x="700" y="212" width="212" height="128" rx="52"/>
          <path d="M718 320 q-22 54 4 80 q26 24 44 -14 M894 320 q22 54 -4 80 q-26 24 -44 -14"/>
          <circle cx="762" cy="290" r="18"/><circle cx="850" cy="290" r="18"/>
          <path d="M744 244 h36 M762 226 v36"/><circle cx="836" cy="244" r="8"/><circle cx="866" cy="262" r="8"/>
        </>
      ),
      accesorios: (
        <>
          <path d="M240 440 h120 q30 0 30 24 t-30 24 h-120"/><rect x="206" y="452" width="36" height="24" rx="5"/>
          <path d="M420 440 h120 q30 0 30 24 t-30 24 h-120"/><rect x="386" y="452" width="36" height="24" rx="5"/>
        </>
      ),
    },
  },

  camara: {
    coords: { imagen: { x: 30, y: 45 }, sensores: { x: 30, y: 26 }, arranque: { x: 57, y: 71 }, cuentas: { x: 46, y: 26 }, conexion: { x: 77, y: 33 }, accesorios: { x: 80, y: 76 } },
    base: (
      <>
        <rect x="240" y="190" width="330" height="140" rx="70" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <circle cx="310" cy="260" r="52" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75"/>
        <circle cx="310" cy="260" r="26" fill="none" stroke="var(--traza)" strokeWidth="1.2" opacity=".6"/>
        <path d="M470 330 v56 M410 386 h120 q10 0 10 10 v22 h-140 v-22 q0 -10 10 -10 Z"
        fill="#26271F" stroke="var(--traza)" strokeWidth="2.2" strokeLinejoin="round"/>
        <path d="M570 250 h70 q16 0 16 16 v40" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <rect x="770" y="400" width="84" height="84" rx="12" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
      </>
    ),
    capas: {
      imagen: (
        <>
          <circle cx="310" cy="260" r="52"/><circle cx="310" cy="260" r="26"/><circle cx="310" cy="260" r="10"/>
        </>
      ),
      sensores: (
        <>
          <circle cx="310" cy="190" r="9"/><circle cx="252" cy="222" r="9"/><circle cx="252" cy="298" r="9"/>
          <circle cx="310" cy="330" r="9"/><circle cx="368" cy="206" r="9"/><circle cx="368" cy="314" r="9"/>
        </>
      ),
      arranque: (
        <>
          <circle cx="540" cy="260" r="14"/><path d="M540 250 v11"/><rect x="500" y="228" width="36" height="16" rx="4"/>
        </>
      ),
      cuentas: (
        <>
          <rect x="428" y="128" width="66" height="52" rx="9"/><path d="M441 128 v-16 a20 20 0 0 1 40 0 v16"/><circle cx="461" cy="154" r="6"/>
        </>
      ),
      conexion: (
        <>
          <path d="M570 250 h70 q16 0 16 16 v40"/><rect x="640" y="306" width="34" height="26" rx="4"/>
          <path d="M730 120 a64 64 0 0 1 0 90 M760 102 a94 94 0 0 1 0 126 M790 84 a124 124 0 0 1 0 162"/>
        </>
      ),
      accesorios: (
        <>
          <rect x="770" y="400" width="84" height="84" rx="12"/><path d="M794 400 v-20 M834 400 v-20"/>
          <circle cx="700" cy="424" r="12"/><circle cx="700" cy="462" r="12"/><path d="M688 424 h24 M688 462 h24"/>
        </>
      ),
    },
  },

  audio: {
    coords: { fisico: { x: 30, y: 20 }, sonido: { x: 42, y: 50 }, controles: { x: 50, y: 26 }, conexion: { x: 74, y: 36 }, alimentacion: { x: 62, y: 72 } },
    base: (
      <>
        <rect x="270" y="150" width="460" height="280" rx="44" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <circle cx="420" cy="290" r="76" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75"/>
        <circle cx="420" cy="290" r="30" fill="none" stroke="var(--traza)" strokeWidth="1.2" opacity=".6"/>
        <circle cx="600" cy="290" r="50" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75"/>
        <circle cx="600" cy="290" r="18" fill="none" stroke="var(--traza)" strokeWidth="1.2" opacity=".6"/>
        <rect x="430" y="168" width="140" height="22" rx="11" fill="#26271F" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
      </>
    ),
    capas: {
      fisico: (
        <>
          <rect x="270" y="150" width="460" height="280" rx="44"/>
        </>
      ),
      sonido: (
        <>
          <circle cx="420" cy="290" r="76"/><circle cx="420" cy="290" r="30"/>
          <circle cx="600" cy="290" r="50"/><circle cx="600" cy="290" r="18"/>
        </>
      ),
      controles: (
        <>
          <rect x="430" y="168" width="140" height="22" rx="11"/><circle cx="458" cy="179" r="7"/>
          <circle cx="500" cy="179" r="7"/><circle cx="542" cy="179" r="7"/>
        </>
      ),
      conexion: (
        <>
          <path d="M762 176 a54 54 0 0 1 0 76 M792 158 a84 84 0 0 1 0 112 M822 140 a114 114 0 0 1 0 148"/>
          <circle cx="690" cy="214" r="12"/>
        </>
      ),
      alimentacion: (
        <>
          <rect x="614" y="378" width="34" height="20" rx="5"/>
          <rect x="470" y="360" width="120" height="54" rx="9"/><rect x="590" y="376" width="12" height="22" rx="3"/>
          <path d="M496 374 v26 M524 374 v26 M552 374 v26"/>
        </>
      ),
    },
  },

  impresora: {
    coords: { arranque: { x: 68, y: 34 }, impresion: { x: 38, y: 74 }, insumos: { x: 45, y: 45 }, conexion: { x: 80, y: 27 }, accesorios: { x: 28, y: 88 } },
    base: (
      <>
        <rect x="230" y="170" width="520" height="230" rx="12" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <path d="M300 170 l40 -60 h340 l40 60" fill="#26271F" stroke="var(--traza)" strokeWidth="2.2" strokeLinejoin="round"/>
        <path d="M356 132 h280 M344 150 h304" stroke="var(--traza)" strokeWidth="1.2" opacity=".6" fill="none"/>
        <rect x="600" y="182" width="130" height="34" rx="7" fill="#26271F" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
        <path d="M262 400 h420 q16 0 16 14 v26 h-436 Z" fill="#26271F" stroke="var(--traza)" strokeWidth="2.2" strokeLinejoin="round"/>
        <rect x="300" y="430" width="200" height="86" rx="4" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75"/>
      </>
    ),
    capas: {
      arranque: (
        <>
          <rect x="600" y="182" width="130" height="34" rx="7"/><circle cx="626" cy="199" r="11"/><path d="M626 192 v8"/>
          <rect x="656" y="190" width="24" height="18" rx="3"/><rect x="692" y="190" width="24" height="18" rx="3"/>
        </>
      ),
      impresion: (
        <>
          <rect x="300" y="430" width="200" height="86" rx="4"/><path d="M322 452 h156 M322 472 h156 M322 492 h110"/>
          <path d="M262 400 h420 q16 0 16 14 v26 h-436 Z"/>
        </>
      ),
      insumos: (
        <>
          <rect x="386" y="230" width="60" height="70" rx="6"/><rect x="456" y="230" width="60" height="70" rx="6"/>
          <rect x="526" y="230" width="60" height="70" rx="6"/><path d="M400 300 v18 M470 300 v18 M540 300 v18"/>
        </>
      ),
      conexion: (
        <>
          <rect x="752" y="238" width="34" height="26" rx="4"/><path d="M750 251 h-20"/>
          <path d="M816 126 a58 58 0 0 1 0 82 M846 108 a88 88 0 0 1 0 118 M876 90 a118 118 0 0 1 0 154"/>
        </>
      ),
      accesorios: (
        <>
          <path d="M230 470 h-46 q-20 0 -20 20 v34"/><rect x="146" y="524" width="36" height="24" rx="5"/>
          <path d="M340 110 h-60 q-18 0 -18 -18 v-24"/>
        </>
      ),
    },
  },

  smarthome: {
    coords: { funciones: { x: 50, y: 48 }, arranque: { x: 38, y: 27 }, cuentas: { x: 62, y: 27 }, conexion: { x: 78, y: 30 } },
    base: (
      <>
        <rect x="360" y="150" width="280" height="300" rx="36" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <circle cx="500" cy="300" r="86" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75"/>
        <rect x="468" y="262" width="20" height="40" rx="5" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <rect x="512" y="262" width="20" height="40" rx="5" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <circle cx="500" cy="342" r="11" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <rect x="360" y="450" width="280" height="14" rx="7" fill="#26271F" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
      </>
    ),
    capas: {
      funciones: (
        <>
          <circle cx="500" cy="300" r="86"/><rect x="468" y="262" width="20" height="40" rx="5"/>
          <rect x="512" y="262" width="20" height="40" rx="5"/><circle cx="500" cy="342" r="11"/>
        </>
      ),
      arranque: (
        <>
          <circle cx="404" cy="196" r="14"/><path d="M404 186 v11"/><circle cx="404" cy="240" r="7"/>
        </>
      ),
      cuentas: (
        <>
          <rect x="588" y="126" width="66" height="52" rx="9"/><path d="M601 126 v-16 a20 20 0 0 1 40 0 v16"/><circle cx="621" cy="152" r="6"/>
        </>
      ),
      conexion: (
        <>
          <path d="M700 140 a64 64 0 0 1 0 90 M730 122 a94 94 0 0 1 0 126 M760 104 a124 124 0 0 1 0 162"/>
          <circle cx="676" cy="185" r="9"/>
        </>
      ),
    },
  },

  red: {
    coords: { wifi: { x: 30, y: 17 }, arranque: { x: 42, y: 50 }, reseteo: { x: 68, y: 50 }, puertos: { x: 50, y: 73 } },
    base: (
      <>
        <rect x="240" y="250" width="520" height="140" rx="14" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <path d="M300 250 v-130 M500 250 v-160 M700 250 v-130" stroke="var(--traza)" strokeWidth="7" strokeLinecap="round" fill="none" opacity=".75"/>
        <rect x="286" y="288" width="188" height="20" rx="10" fill="#101109" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
        <rect x="300" y="390" width="400" height="34" rx="6" fill="#26271F" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
      </>
    ),
    capas: {
      wifi: (
        <>
          <path d="M300 250 v-130 M500 250 v-160 M700 250 v-130"/>
          <path d="M440 96 a86 86 0 0 1 120 0 M410 66 a128 128 0 0 1 180 0"/>
        </>
      ),
      arranque: (
        <>
          <rect x="286" y="288" width="188" height="20" rx="10"/><circle cx="310" cy="298" r="7"/>
          <circle cx="350" cy="298" r="7"/><circle cx="390" cy="298" r="7"/><circle cx="430" cy="298" r="7"/>
        </>
      ),
      reseteo: (
        <>
          <circle cx="680" cy="298" r="10"/><circle cx="680" cy="298" r="4"/><path d="M712 298 h60 M760 290 l12 8 l-12 8"/>
        </>
      ),
      puertos: (
        <>
          <rect x="300" y="390" width="400" height="34" rx="6"/>
          <rect x="316" y="398" width="42" height="24" rx="3"/><rect x="368" y="398" width="42" height="24" rx="3"/>
          <rect x="420" y="398" width="42" height="24" rx="3"/><rect x="472" y="398" width="42" height="24" rx="3"/>
          <rect x="556" y="398" width="42" height="24" rx="3"/>
        </>
      ),
    },
  },

  energia: {
    coords: { funcionamiento: { x: 38, y: 33 }, proteccion: { x: 54, y: 63 }, bateria: { x: 33, y: 63 }, cable: { x: 78, y: 84 } },
    base: (
      <>
        <rect x="240" y="170" width="520" height="260" rx="12" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <rect x="286" y="198" width="188" height="66" rx="8" fill="#101109" stroke="var(--traza)" strokeWidth="1.3" opacity=".75"/>
        <rect x="440" y="330" width="280" height="70" rx="8" fill="#26271F" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
        <path d="M760 400 h40 q20 0 20 20 v60" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
      </>
    ),
    capas: {
      funcionamiento: (
        <>
          <rect x="286" y="198" width="188" height="66" rx="8"/><path d="M310 232 h30 l12 -22 l20 44 l14 -22 h60"/>
        </>
      ),
      proteccion: (
        <>
          <rect x="440" y="330" width="280" height="70" rx="8"/>
          <rect x="462" y="346" width="52" height="38" rx="4"/><rect x="536" y="346" width="52" height="38" rx="4"/>
          <rect x="610" y="346" width="52" height="38" rx="4"/>
          <path d="M488 356 v18 M598 356 v18"/>
        </>
      ),
      bateria: (
        <>
          <rect x="286" y="300" width="126" height="106" rx="9"/><rect x="326" y="288" width="46" height="14" rx="4"/>
          <path d="M306 332 h86 M306 356 h86 M306 380 h86"/>
        </>
      ),
      cable: (
        <>
          <path d="M760 400 h40 q20 0 20 20 v60"/><rect x="800" y="480" width="40" height="30" rx="6"/>
          <path d="M810 480 v-14 M830 480 v-14"/>
        </>
      ),
    },
  },

  adaptador: {
    coords: { funcionamiento: { x: 52, y: 44 }, conectores: { x: 52, y: 69 }, accesorios: { x: 14, y: 50 } },
    base: (
      <>
        <rect x="250" y="200" width="540" height="160" rx="24" fill="#1E1F19" stroke="var(--traza)" strokeWidth="2.2"/>
        <path d="M250 280 h-72 q-28 0 -28 -28 v-4" fill="none" stroke="var(--traza)" strokeWidth="2.6" opacity=".8"/>
        <rect x="124" y="212" width="52" height="46" rx="9" fill="#26271F" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
        <rect x="290" y="360" width="460" height="54" rx="8" fill="#26271F" stroke="var(--traza)" strokeWidth="1.2" opacity=".7"/>
        <circle cx="740" cy="240" r="9" fill="none" stroke="var(--traza)" strokeWidth="1.3" opacity=".7"/>
      </>
    ),
    capas: {
      funcionamiento: (
        <>
          <rect x="250" y="200" width="540" height="160" rx="24"/><circle cx="740" cy="240" r="9"/>
        </>
      ),
      conectores: (
        <>
          <rect x="290" y="360" width="460" height="54" rx="8"/>
          <rect x="312" y="374" width="66" height="26" rx="3"/><rect x="396" y="374" width="66" height="26" rx="3"/>
          <rect x="480" y="372" width="76" height="30" rx="3"/><rect x="574" y="374" width="48" height="26" rx="12"/>
          <rect x="640" y="372" width="86" height="30" rx="3"/>
        </>
      ),
      accesorios: (
        <>
          <path d="M250 280 h-72 q-28 0 -28 -28 v-4"/><rect x="124" y="212" width="52" height="46" rx="9"/>
          <path d="M136 212 v-20 M164 212 v-20"/>
        </>
      ),
    },
  },

};
