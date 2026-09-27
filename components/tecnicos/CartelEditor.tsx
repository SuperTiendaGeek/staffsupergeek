"use client";

import { useState } from "react";
import {
  CARTEL_BOTON_DEFECTO, botonDe, cartelVacio, lineas, validarCartel, type CartelServicio,
} from "@/lib/tecnicos/carteles/reglas";

// Editor del cartel de consentimiento de un servicio. Vive dentro del modal de
// "Editar servicio" (/tecnicos/catalogo-servicios): el texto NO está en el código.

export type BorradorCartel = {
  activo: boolean; titulo: string; intro: string; incluye: string; noIncluye: string; avisos: string;
  consentimiento: string; textoBoton: string; aplicarA: string[];
};

const INPUT = "w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] outline-none transition placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70";

export function aBorradorCartel(c: CartelServicio | undefined): BorradorCartel {
  const base = c ?? cartelVacio("");
  return {
    activo: base.activo, titulo: base.titulo, intro: base.intro,
    incluye: base.incluye.join("\n"), noIncluye: base.noIncluye.join("\n"), avisos: base.avisos.join("\n"),
    consentimiento: base.consentimiento, textoBoton: base.textoBoton, aplicarA: [],
  };
}

export function aCartelServicio(servicioId: string, b: BorradorCartel): CartelServicio {
  return {
    servicioId, servicioNombre: "", activo: b.activo, titulo: b.titulo, intro: b.intro,
    incluye: lineas(b.incluye), noIncluye: lineas(b.noIncluye), avisos: lineas(b.avisos),
    consentimiento: b.consentimiento, textoBoton: b.textoBoton,
  };
}

/** Vista previa: se ve igual que en el celular del cliente. */
export function VistaPreviaCartel({ c }: { c: CartelServicio }) {
  const Bloque = ({ t, items, icono, clase }: { t: string; items: string[]; icono: string; clase: string }) =>
    items.length === 0 ? null : (
      <div className="rounded-xl border border-[#3A3A36] bg-[#1F1F1D] p-3">
        <p className={`text-[10px] font-bold uppercase tracking-wide ${clase}`}>{t}</p>
        <ul className="mt-1.5 space-y-1">
          {items.map((x, i) => <li key={i} className="flex gap-2 text-[13px] leading-snug text-[#E5E5E0]"><span className={clase}>{icono}</span><span>{x}</span></li>)}
        </ul>
      </div>
    );
  return (
    <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-[#3A3A36] bg-[#242422]">
      <div className="border-b border-[#3A3A36] bg-[#2A2A28] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#D7FF4F]">Antes de aprobar</p>
        <p className="mt-0.5 text-base font-black leading-tight text-[#F5F5F5]">{c.titulo || "Título del cartel"}</p>
      </div>
      <div className="space-y-2 px-4 py-3">
        {c.intro && <p className="whitespace-pre-line text-[13px] leading-relaxed text-[#E5E5E0]">{c.intro}</p>}
        <Bloque t="Qué sí incluye" items={c.incluye} icono="✓" clase="text-emerald-300" />
        <Bloque t="Qué no incluye" items={c.noIncluye} icono="✕" clase="text-red-300" />
        <Bloque t="Ten en cuenta" items={c.avisos} icono="•" clase="text-amber-300" />
        <div className="rounded-xl border border-[#D7FF4F]/35 bg-[#D7FF4F]/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#D7FF4F]">Tu consentimiento</p>
          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-[#F5F5F5]">{c.consentimiento || "Texto que el cliente acepta…"}</p>
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="w-full rounded-2xl bg-[#D7FF4F] px-4 py-3 text-center text-sm font-black text-[#151515]">{botonDe(c)}</div>
      </div>
    </div>
  );
}


/** ¿Hay algo escrito? Sirve para saber si el servicio tiene cartel. */
export function cartelEnBlanco(b: BorradorCartel): boolean {
  return !b.titulo.trim() && !b.intro.trim() && !b.incluye.trim() && !b.noIncluye.trim() && !b.avisos.trim() && !b.consentimiento.trim();
}

export function validarBorradorCartel(servicioId: string, b: BorradorCartel): string | null {
  return validarCartel(aCartelServicio(servicioId, b));
}

export function EditorCartel({ servicioId, b, onCambio, otrosServicios, cartelesExistentes }: {
  servicioId: string;
  b: BorradorCartel;
  onCambio: (b: BorradorCartel) => void;
  /** Para "aplicar este cartel a otros servicios". */
  otrosServicios: Array<{ id: string; nombre: string }>;
  cartelesExistentes: Record<string, boolean>;
}) {
  const [verPrevia, setVerPrevia] = useState(true);
  const previa = aCartelServicio(servicioId, b);
  return (
    <div className="space-y-3 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black text-[#F5F5F5]">Cartel de consentimiento</p>
          <p className="text-[11px] text-[#A7A7A7]">
            El cliente debe leerlo y aceptarlo en el enlace antes de que su aprobación cuente. Queda guardado con su
            nombre, cédula y fecha, y sale en el PDF.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-[#C9C9C4]">
          <input type="checkbox" checked={b.activo} onChange={(e) => onCambio({ ...b, activo: e.target.checked })} className="h-4 w-4 accent-[#D7FF4F]" />
          Mostrar al cliente
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] text-[#A7A7A7]">Título</span>
        <input value={b.titulo} onChange={(e) => onCambio({ ...b, titulo: e.target.value })} placeholder="Antes de aprobar: respaldo de información" className={INPUT} />
      </label>
      <label className="block">
        <span className="text-[11px] text-[#A7A7A7]">Introducción (opcional)</span>
        <textarea value={b.intro} onChange={(e) => onCambio({ ...b, intro: e.target.value })} rows={2} className={`${INPUT} resize-y`} />
      </label>
      <div className="grid gap-2.5 md:grid-cols-2">
        <label className="block">
          <span className="text-[11px] text-emerald-300">Qué sí incluye — una línea por punto</span>
          <textarea value={b.incluye} onChange={(e) => onCambio({ ...b, incluye: e.target.value })} rows={4} className={`${INPUT} resize-y`} />
        </label>
        <label className="block">
          <span className="text-[11px] text-red-300">Qué no incluye — una línea por punto</span>
          <textarea value={b.noIncluye} onChange={(e) => onCambio({ ...b, noIncluye: e.target.value })} rows={4} className={`${INPUT} resize-y`} />
        </label>
      </div>
      <label className="block">
        <span className="text-[11px] text-amber-300">Ten en cuenta — una línea por punto</span>
        <textarea value={b.avisos} onChange={(e) => onCambio({ ...b, avisos: e.target.value })} rows={3} className={`${INPUT} resize-y`} />
      </label>
      <label className="block">
        <span className="text-[11px] text-[#D7FF4F]">Consentimiento — es lo que el cliente acepta</span>
        <textarea value={b.consentimiento} onChange={(e) => onCambio({ ...b, consentimiento: e.target.value })} rows={3} className={`${INPUT} resize-y`} />
      </label>
      <label className="block max-w-xs">
        <span className="text-[11px] text-[#A7A7A7]">Texto del botón</span>
        <input value={b.textoBoton} onChange={(e) => onCambio({ ...b, textoBoton: e.target.value })} placeholder={CARTEL_BOTON_DEFECTO} className={INPUT} />
      </label>

      {otrosServicios.length > 0 && (
        <details className="rounded-lg border border-[#3A3A36] bg-[#252622] p-2.5">
          <summary className="cursor-pointer text-xs font-semibold text-[#C9C9C4]">Aplicar este mismo cartel a otros servicios ({b.aplicarA.length})</summary>
          <p className="mt-1 text-[11px] text-[#8A8A80]">Útil cuando varios servicios comparten condiciones. Se copia el texto tal como está aquí.</p>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {otrosServicios.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-xs text-[#C9C9C4]">
                <input type="checkbox" className="h-3.5 w-3.5 accent-[#D7FF4F]"
                  checked={b.aplicarA.includes(s.id)}
                  onChange={(e) => onCambio({ ...b, aplicarA: e.target.checked ? [...b.aplicarA, s.id] : b.aplicarA.filter((x) => x !== s.id) })} />
                {s.nombre}
                {cartelesExistentes[s.id] && <span className="text-[10px] text-amber-200">(ya tiene cartel: se reemplaza)</span>}
              </label>
            ))}
          </div>
        </details>
      )}

      <div>
        <button type="button" onClick={() => setVerPrevia((v) => !v)} className="text-[11px] font-semibold text-[#A7A7A7] underline underline-offset-2 hover:text-[#F5F5F5]">
          {verPrevia ? "Ocultar vista previa" : "Ver cómo lo verá el cliente"}
        </button>
        {verPrevia && <div className="mt-2"><VistaPreviaCartel c={previa} /></div>}
      </div>
    </div>
  );
}
