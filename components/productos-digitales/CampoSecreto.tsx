"use client";

import { useState, type CSSProperties } from "react";

/**
 * Campo para una clave o contraseña de un CLIENTE (punto 5A). No es
 * <input type="password">: el gestor de contraseñas del navegador lo
 * autocompletaba con una contraseña guardada del empleado (caso
 * "Elfina.8990"). Se oculta con CSS y el ojo la muestra.
 * Lo usan Registrar compra (modo Producto digital) y Productos Digitales.
 */
export function CampoSecreto({ valor, onChange, placeholder, className, invalido = false }: {
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
  className: string;
  invalido?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type="text"
        name="sg-digital-secreto"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalido || undefined}
        className={`${className} pr-8 font-mono`}
        style={visible ? undefined : ({ WebkitTextSecurity: "disc" } as CSSProperties)}
      />
      <button type="button" onClick={() => setVisible((v) => !v)} tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8F908A] transition hover:text-[#D7FF4F]" aria-label={visible ? "Ocultar" : "Mostrar"}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          {visible
            ? <><path d="M3 3l18 18" /><path d="M10.73 10.73a2 2 0 0 0 2.54 2.54" /><path d="M6.4 6.4A10.17 10.17 0 0 0 1 12s4 7 11 7a10.17 10.17 0 0 0 5.6-1.68" /><path d="M18.7 13.7A10.17 10.17 0 0 0 23 12s-4-7-11-7a10.17 10.17 0 0 0-1.7.15" /></>
            : <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" /><circle cx="12" cy="12" r="3" /></>}
        </svg>
      </button>
    </div>
  );
}
