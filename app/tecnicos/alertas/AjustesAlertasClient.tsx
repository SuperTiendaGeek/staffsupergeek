"use client";

import { useEffect, useState } from "react";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
import { avisarCambioAlertas } from "@/components/tecnicos/alertas/tipos";
import {
  CLAVES_CON_PLAZO, DIAS_BAJA, NOMBRE_SITUACION, leerHora, leerPlazo, minutosDe, revisarConfig, textoHora, textoPlazo,
  type ConfigAlertas, type Tramo,
} from "@/lib/tecnicos/alertas/reglas";

// Ajustes de las alertas (rediseño R10, tablero 11): horario que cuenta y
// tiempos «por vencer» (ámbar) y «atención» (rojo) por situación. «1 d» = una
// jornada de lunes a viernes. Solo un administrador guarda.

type Borrador = {
  lunVie: { desde: string; hasta: string };
  sab: { desde: string; hasta: string } | null;
  plazos: Record<string, { porVencer: string; atencion: string }>;
};

const aBorrador = (c: ConfigAlertas): Borrador => ({
  lunVie: { desde: textoHora(c.horario.lunVie.desde), hasta: textoHora(c.horario.lunVie.hasta) },
  sab: c.horario.sab ? { desde: textoHora(c.horario.sab.desde), hasta: textoHora(c.horario.sab.hasta) } : null,
  plazos: Object.fromEntries(CLAVES_CON_PLAZO.map((k) => [k, { porVencer: textoPlazo(c.plazos[k].porVencer), atencion: textoPlazo(c.plazos[k].atencion) }])),
});

const CAMPO = "h-7 w-[88px] rounded-[7px] border bg-[#151613] px-2 text-right text-sm font-bold tabular-nums outline-none focus:border-[#D7FF4F]";

export function AjustesAlertasClient() {
  const [config, setConfig] = useState<ConfigAlertas | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [b, setB] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    fetch("/api/tecnicos/alertas/ajustes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.error);
        setConfig(j.data.config);
        setB(aBorrador(j.data.config));
        setEsAdmin(j.data.esAdmin === true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo leer los ajustes."));
  }, []);

  if (!b || !config) return <div className={`${styles.theme} text-sm text-[#B5B5AE]`}>{error ?? "Cargando…"}</div>;

  const tramo = (t: { desde: string; hasta: string } | null): Tramo | null | "error" => {
    if (!t) return null;
    const desde = leerHora(t.desde), hasta = leerHora(t.hasta);
    return desde !== null && hasta !== null && hasta > desde ? { desde, hasta } : "error";
  };

  async function guardar() {
    if (!b) return;
    setError(null);
    setListo(false);
    const lunVie = tramo(b.lunVie), sab = tramo(b.sab);
    if (!lunVie || lunVie === "error" || sab === "error") { setError("Revisa el horario (ej.: 9:30 – 18:00)."); return; }
    const plazos: Record<string, unknown> = {};
    for (const k of CLAVES_CON_PLAZO) {
      const pv = leerPlazo(b.plazos[k].porVencer), at = leerPlazo(b.plazos[k].atencion);
      if (pv === "error" || at === "error") { setError(`«${NOMBRE_SITUACION[k]}»: escribe el tiempo como «4 h» o «2 d».`); return; }
      plazos[k] = { porVencer: pv, atencion: at };
    }
    // Mismo control que el servidor, antes de mandar: el error se ve donde nace.
    const revision = revisarConfig({ horario: { lunVie, sab }, plazos });
    if (!revision.ok) { setError(revision.error); return; }
    setGuardando(true);
    try {
      const r = await fetch("/api/tecnicos/alertas/ajustes", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ horario: { lunVie, sab }, plazos }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      setConfig(j.data.config);
      setB(aBorrador(j.data.config));
      setListo(true);
      avisarCambioAlertas();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  const invalido = (v: string) => leerPlazo(v) === "error";
  // Ámbar que no llega antes que el rojo, o rojo vacío: se marca al escribir.
  const lunVieMin = { desde: leerHora(b.lunVie.desde) ?? 570, hasta: leerHora(b.lunVie.hasta) ?? 1080 };
  const fueraDeOrden = (k: string) => {
    const pv = leerPlazo(b.plazos[k].porVencer), at = leerPlazo(b.plazos[k].atencion);
    if (!at || at === "error") return at === null;
    if (!pv || pv === "error") return false;
    const h0 = { lunVie: lunVieMin, sab: null };
    return minutosDe(pv, h0) >= minutosDe(at, h0);
  };
  const hora = (valor: string, cambiar: (v: string) => void, etiqueta: string) => (
    <input value={valor} onChange={(e) => cambiar(e.target.value)} disabled={!esAdmin} aria-label={etiqueta}
      className={`h-7 w-[58px] rounded-[7px] border bg-[#151613] px-2 text-center text-sm tabular-nums outline-none focus:border-[#D7FF4F] ${leerHora(valor) === null ? "border-[#FF7A70]" : "border-[#3A3A36]"}`} />
  );
  const fila = "grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-3 border-t border-[#2C2D29] px-3.5 py-1.5";

  return (
    <div className={`${styles.theme} max-w-[640px] space-y-3 text-[13px] text-[#F0F0EC]`}>
      <div className="flex items-baseline gap-2 px-0.5">
        <h1 className="text-sm font-bold">Alertas de órdenes</h1>
        {!esAdmin && <span className="ml-auto text-xs text-[#B5B5AE]">Solo un administrador los cambia</span>}
      </div>
      <section className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3.5 py-2.5">
        <span className="text-[11px] font-semibold text-[#B5B5AE]">HORARIO</span>
        <span>Lun–Vie</span>
        {hora(b.lunVie.desde, (v) => setB({ ...b, lunVie: { ...b.lunVie, desde: v } }), "Lunes a viernes, desde")}
        <span className="text-[#B5B5AE]">–</span>
        {hora(b.lunVie.hasta, (v) => setB({ ...b, lunVie: { ...b.lunVie, hasta: v } }), "Lunes a viernes, hasta")}
        <label className={`ml-2 inline-flex items-center gap-1.5 ${esAdmin ? "cursor-pointer" : ""}`} title="¿El sábado cuenta para las alertas?">
          <input type="checkbox" checked={!!b.sab} disabled={!esAdmin} className="h-3.5 w-3.5 accent-[#D7FF4F]"
            onChange={() => setB({ ...b, sab: b.sab ? null : { desde: "9:00", hasta: "14:00" } })} />
          Sáb
        </label>
        {b.sab ? (
          <>
            {hora(b.sab.desde, (v) => setB({ ...b, sab: { ...b.sab!, desde: v } }), "Sábado, desde")}
            <span className="text-[#B5B5AE]">–</span>
            {hora(b.sab.hasta, (v) => setB({ ...b, sab: { ...b.sab!, hasta: v } }), "Sábado, hasta")}
          </>
        ) : <span className="text-[#B5B5AE]">no cuenta</span>}
        <span className="ml-2 text-[#B5B5AE]">Dom no cuenta</span>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#3A3A36] bg-[#1E1F1C]">
        <div className={`${fila} border-t-0 pb-1.5 pt-2.5 text-[11px] font-semibold text-[#B5B5AE]`}>
          <span>SITUACIÓN</span>
          <span className="cursor-help text-right" title="Ámbar. «h» = horas del horario · «d» = jornadas de lunes a viernes">POR VENCER</span>
          <span className="cursor-help text-right" title="Rojo. «h» = horas del horario · «d» = jornadas de lunes a viernes">ATENCIÓN</span>
        </div>
        {CLAVES_CON_PLAZO.map((k) => (
          <div key={k} className={fila}>
            <span>{NOMBRE_SITUACION[k]}</span>
            <input value={b.plazos[k].porVencer} disabled={!esAdmin} aria-label={`${NOMBRE_SITUACION[k]}: por vencer`}
              onChange={(e) => setB({ ...b, plazos: { ...b.plazos, [k]: { ...b.plazos[k], porVencer: e.target.value } } })}
              className={`${CAMPO} justify-self-end text-[#FFB547] ${invalido(b.plazos[k].porVencer) || fueraDeOrden(k) ? "border-[#FF7A70]" : "border-[#3A3A36]"}`} />
            <input value={b.plazos[k].atencion} disabled={!esAdmin} aria-label={`${NOMBRE_SITUACION[k]}: atención`}
              onChange={(e) => setB({ ...b, plazos: { ...b.plazos, [k]: { ...b.plazos[k], atencion: e.target.value } } })}
              className={`${CAMPO} justify-self-end text-[#FF9C94] ${invalido(b.plazos[k].atencion) || fueraDeOrden(k) ? "border-[#FF7A70]" : "border-[#3A3A36]"}`} />
          </div>
        ))}
        <div className={fila}>
          <span>{NOMBRE_SITUACION.repuestoAtrasado}</span>
          <span className="col-span-2 justify-self-end whitespace-nowrap text-xs font-bold text-[#FF9C94]" title="Día que el cliente aprobó + el tiempo estimado de la línea">Al pasar la fecha prevista</span>
        </div>
        <div className={`${fila} bg-[#191A17] text-[#B5B5AE]`}>
          <span>Esperando respuesta (política de baja)</span>
          <span className="justify-self-end tabular-nums">{DIAS_BAJA} d</span>
          <span className="justify-self-end tabular-nums">90 d</span>
        </div>
        {esAdmin && (
          <div className="flex items-center justify-end gap-2 border-t border-[#2C2D29] px-3.5 py-2.5">
            {error && <span role="alert" className="mr-auto text-xs text-[#FF9C94] animate-[sg-sacudir_240ms_ease-out]">{error}</span>}
            {listo && !error && <span className="mr-auto text-xs text-[#56E3A4] animate-[sg-entrada_160ms_ease-out]">Guardado</span>}
            <button type="button" onClick={() => { setB(aBorrador(config)); setError(null); }} disabled={guardando}
              className="h-7 rounded-lg border border-[#3A3A36] bg-[#252622] px-3 text-xs font-semibold">Cancelar</button>
            <button type="button" onClick={() => void guardar()} disabled={guardando}
              className="h-7 rounded-lg bg-[#D7FF4F] px-3 text-xs font-bold text-[#151613] disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        )}
      </section>
    </div>
  );
}
