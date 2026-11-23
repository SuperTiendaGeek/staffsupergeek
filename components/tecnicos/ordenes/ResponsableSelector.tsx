"use client";

import { useEffect, useState } from "react";
import { Desplegable, OPCION_MENU } from "@/components/tecnicos/ordenes/Desplegable";
import { primerNombre, type OpcionResponsable } from "@/lib/tecnicos/responsable/reglas";

// Responsable de la orden en la cabecera (rediseño R1, tablero 1). Sin
// responsable: «Tomar orden» a un clic (▾ para asignarla a otra persona).
// Con responsable: iniciales + nombre; el menú cambia o quita. Cada cambio
// queda en la Actividad.

type Datos = { actual: OpcionResponsable | null; opciones: OpcionResponsable[]; yo: string | null };

const BTN = "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap border px-2 text-[11px] font-semibold transition disabled:opacity-60";

const Flecha = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
);

const Avatar = ({ o }: { o: OpcionResponsable }) => (
  <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#2C2D29] text-[9px] font-extrabold text-[#F0F0EC]">{o.iniciales}</span>
);

export function ResponsableSelector({ ordenId, refrescar, soloLectura = false, onCambio }: {
  ordenId: string;
  /** Cambia cuando otra acción pudo asignar al responsable (p. ej. un trabajo pasó a «En proceso»). */
  refrescar?: string | number;
  /** Orden cerrada: se ve quién la tuvo, sin menú. */
  soloLectura?: boolean;
  onCambio?: () => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destello, setDestello] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/responsable`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (vivo && j.success) setDatos(j.data as Datos); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [ordenId, refrescar]);

  async function asignar(usuarioId: string | null) {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/responsable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo cambiar el responsable.");
      setDatos((d) => (d ? { ...d, actual: j.data.actual as OpcionResponsable | null } : d));
      setDestello((n) => n + 1);
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el responsable.");
      setTimeout(() => setError(null), 4000);
    } finally {
      setGuardando(false);
    }
  }

  // Mientras carga: un hueco del mismo tamaño (la cabecera no salta).
  if (!datos) return <span className="inline-block h-[26px] w-24 rounded-lg bg-[#2C2D29]/60" aria-hidden="true" />;

  const { actual, opciones, yo } = datos;
  const puedoTomar = !!yo && opciones.some((o) => o.id === yo) && actual?.id !== yo;
  const anima = destello ? "animate-[sg-destello_700ms_ease-out]" : "";

  if (soloLectura) {
    return actual ? (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#B5B5AE]" title="Responsable"><Avatar o={actual} />{primerNombre(actual.nombre)}</span>
    ) : null;
  }

  const lista = (cerrar: () => void) => (
    <>
      {puedoTomar && actual && (
        <button type="button" role="menuitem" className={OPCION_MENU} onClick={() => { cerrar(); void asignar(yo); }}>Tomar yo la orden</button>
      )}
      {opciones.map((o) => (
        <button key={o.id} type="button" role="menuitem" className={`${OPCION_MENU} font-medium`} onClick={() => { cerrar(); void asignar(o.id); }}>
          <Avatar o={o} />
          <span className="min-w-0 flex-1 truncate">{o.nombre}</span>
          {actual?.id === o.id && <span className="text-[#D7FF4F]">✓</span>}
        </button>
      ))}
      {actual && (
        <button type="button" role="menuitem" className={`${OPCION_MENU} mt-1 border-t border-[#2C2D29] pt-2 font-medium text-[#B5B5AE]`} onClick={() => { cerrar(); void asignar(null); }}>
          Quitar responsable
        </button>
      )}
    </>
  );

  return (
    <span className="inline-flex items-center gap-1.5">
      {actual ? (
        <Desplegable ancho={232} boton={({ ref, abierto, alternar }) => (
          <button key={destello} ref={ref} type="button" onClick={alternar} disabled={guardando} aria-haspopup="menu" aria-expanded={abierto}
            aria-label={`Responsable: ${actual.nombre}. Cambiar`} title="Responsable"
            className={`${BTN} rounded-lg border-[#3A3A36] bg-[#252622] text-[#F0F0EC] hover:border-[#D7FF4F] ${anima}`}>
            <Avatar o={actual} />{guardando ? "Guardando…" : primerNombre(actual.nombre)}<Flecha />
          </button>
        )}>{lista}</Desplegable>
      ) : (
        <span className="inline-flex">
          {puedoTomar ? (
            <button key={destello} type="button" onClick={() => void asignar(yo)} disabled={guardando}
              className={`${BTN} rounded-l-lg border-dashed border-[#6E6E68] bg-transparent text-[#D6D6D0] hover:border-[#D7FF4F] hover:text-[#D7FF4F]`}>
              {guardando ? "Guardando…" : "Tomar orden"}
            </button>
          ) : (
            <span className={`${BTN} rounded-l-lg border-dashed border-[#6E6E68] text-[#B5B5AE]`}>Sin responsable</span>
          )}
          <Desplegable ancho={232} boton={({ ref, abierto, alternar }) => (
            <button ref={ref} type="button" onClick={alternar} disabled={guardando} aria-haspopup="menu" aria-expanded={abierto} aria-label="Asignar la orden a otra persona" title="Asignar a otra persona"
              className={`${BTN} -ml-px rounded-r-lg border-dashed border-[#6E6E68] text-[#B5B5AE] hover:border-[#D7FF4F] hover:text-[#D7FF4F]`}>
              <Flecha />
            </button>
          )}>{lista}</Desplegable>
        </span>
      )}
      {error && <span role="alert" className="text-[11px] text-[#FF9C94]">{error}</span>}
    </span>
  );
}
