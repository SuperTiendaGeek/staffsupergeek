"use client";

// Administrar › Pantalla del cliente (10E-C, maqueta 11 aprobada).

import { useMemo, useState } from "react";
import {
  OPCIONES_GRACIAS, OPCIONES_SIN_ACTIVIDAD, MAX_TEXTO_REPOSO, ROLES_PANTALLA, describirCambios,
  type ConfigPantalla, type RolPantalla,
} from "@/lib/pantalla-cliente/config";
import type { ConfigPantallaAdmin } from "@/lib/pantalla-cliente/config-servidor";
import type { CobroEnPantalla } from "@/lib/pantalla-cliente/reglas";
import { reposo } from "@/lib/pantalla-cliente/reglas";
import { usePantallaCliente } from "@/components/pantalla-cliente/usePantallaCliente";
import { VistaPantalla } from "@/components/pantalla-cliente/VistaPantalla";

const caja = "rounded-xl border border-[#3A3A36] bg-[#1E1F1C]";
const fila = "grid grid-cols-1 items-center gap-2 border-t border-[#2C2D29] py-2.5 first:border-t-0 sm:grid-cols-[240px_1fr]";

function Segmento<T extends string | number>({ opciones, valor, onCambio, sufijo, etiqueta }: { opciones: readonly T[]; valor: T; onCambio: (v: T) => void; sufijo: string; etiqueta: string }) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex w-fit gap-[3px] rounded-[9px] bg-[#252622] p-[3px]">
      {opciones.map((o) => (
        <button key={String(o)} type="button" aria-pressed={o === valor} onClick={() => onCambio(o)}
          className={`h-7 rounded-[7px] px-2.5 text-xs font-semibold transition-colors ${o === valor ? "bg-[#2E3024] text-[#D7FF4F]" : "text-[#B5B5AE] hover:text-[#F0F0EC]"}`}>
          {o} {sufijo}
        </button>
      ))}
    </div>
  );
}

// Cobro de ejemplo para revisar el monitor (sin cliente real; no consulta ninguna cuenta).
const PRUEBA: CobroEnPantalla = {
  origen: "orden", id: "prueba", codigo: "OR000000", cliente: "Cliente de prueba", detalle: "Equipo de ejemplo",
  lineas: [{ descripcion: "Cambio de bisagras", monto: 30, nota: "aprobado" }, { descripcion: "Mano de obra", monto: 15, nota: "aprobado" }],
  total: 45, pagado: 0, falta: 45, para: "Todo", vasAPagar: 45, url: "https://staff.supertiendageek.com/",
};

export function AdminPantallaClienteClient({ inicial }: { inicial: ConfigPantallaAdmin }) {
  const [guardado, setGuardado] = useState(inicial);
  const [c, setC] = useState<ConfigPantalla>(inicial.config);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const { conectada, enviar } = usePantallaCliente();

  const cambios = useMemo(() => describirCambios(guardado.config, c), [guardado.config, c]);
  const cambiar = (p: Partial<ConfigPantalla>) => { setC((x) => ({ ...x, ...p })); setMensaje(null); };
  const alternarRol = (r: RolPantalla) => cambiar({ roles: c.roles.includes(r) ? c.roles.filter((x) => x !== r) : ROLES_PANTALLA.filter((x) => x === r || c.roles.includes(x)) });

  async function guardar() {
    setGuardando(true); setMensaje(null);
    try {
      const r = await fetch("/api/admin/pantalla-cliente", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
      const j = (await r.json()) as { success: boolean; data?: ConfigPantallaAdmin; error?: string };
      if (!j.success || !j.data) { setMensaje({ tipo: "error", texto: j.error ?? "No se pudo guardar." }); return; }
      setGuardado(j.data); setC(j.data.config);
      setMensaje({ tipo: "ok", texto: "Guardado. La pantalla del mostrador lo toma en unos minutos (o al volver a encenderla)." });
    } catch { setMensaje({ tipo: "error", texto: "Sin conexión. No se guardó." }); }
    finally { setGuardando(false); }
  }

  return (
    <div className="flex flex-wrap items-start gap-3 text-[13px] text-[#F0F0EC]">
      <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-3">
        <section className={`${caja} px-4 py-3`}>
          <h2 className="mb-1 text-[13px] font-bold">Uso</h2>
          <div className={fila}>
            <span>Pantalla del cliente en la tienda</span>
            <span className="flex items-center gap-2">
              <button type="button" role="switch" aria-checked={c.activa} aria-label="Encendida" onClick={() => cambiar({ activa: !c.activa })}
                className={`relative h-5 w-[34px] rounded-full transition-colors duration-150 ${c.activa ? "bg-[#D7FF4F]" : "bg-[#3A3A36]"}`}>
                <span className={`absolute top-[3px] h-3.5 w-3.5 rounded-full transition-all duration-150 ${c.activa ? "left-[17px] bg-[#151613]" : "left-[3px] bg-[#B5B5AE]"}`} />
              </button>
              <span className="text-xs text-[#B5B5AE]">{c.activa ? "Encendida · el botón aparece junto a la campanita" : "Apagada · nadie la ve"}</span>
            </span>
          </div>
          <div className={fila}>
            <span>Quién puede usarla</span>
            <span className="flex flex-wrap gap-1.5">
              {ROLES_PANTALLA.map((r) => {
                const on = c.roles.includes(r);
                return (
                  <button key={r} type="button" aria-pressed={on} onClick={() => alternarRol(r)}
                    className={`inline-flex h-[26px] items-center rounded-[7px] border px-2.5 text-xs font-semibold transition-all active:scale-95 ${on ? "border-[#D7FF4F]/70 bg-[#D7FF4F]/15 text-[#E9FF9E]" : "border-[#30312D] bg-[#171814] text-[#A7A7A7]"}`}>
                    {on ? "✓ " : ""}{r}
                  </button>
                );
              })}
            </span>
          </div>
        </section>

        <section className={`${caja} px-4 py-3`}>
          <h2 className="mb-1 text-[13px] font-bold">Volver al logo</h2>
          <div className={fila}>
            <span>Después del «¡Gracias!»</span>
            <Segmento etiqueta="Segundos" opciones={OPCIONES_GRACIAS} valor={c.segundosGracias} sufijo="s" onCambio={(v) => cambiar({ segundosGracias: v })} />
          </div>
          <div className={fila}>
            <span>Sin nada nuevo en pantalla</span>
            <Segmento etiqueta="Minutos" opciones={OPCIONES_SIN_ACTIVIDAD} valor={c.minutosSinActividad} sufijo="min" onCambio={(v) => cambiar({ minutosSinActividad: v })} />
          </div>
        </section>

        <section className={`${caja} px-4 py-3`}>
          <h2 className="mb-1 text-[13px] font-bold">En reposo</h2>
          <div className={fila}>
            <span>Qué se muestra</span>
            <div className="inline-flex w-fit gap-[3px] rounded-[9px] bg-[#252622] p-[3px]">
              <span className="h-7 rounded-[7px] bg-[#2E3024] px-2.5 text-xs font-semibold leading-7 text-[#D7FF4F]">Logo animado</span>
              <span className="h-7 px-2.5 text-xs font-semibold leading-7 text-[#6E6E68]" title="Llega después: el sistema arma la lista solo">Logo + equipos en tránsito · pronto</span>
            </div>
          </div>
          <div className={fila}>
            <label htmlFor="texto-reposo">Texto bajo el logo</label>
            <input id="texto-reposo" value={c.textoReposo} maxLength={MAX_TEXTO_REPOSO} onChange={(e) => cambiar({ textoReposo: e.target.value })}
              className="h-8 max-w-[320px] rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 text-[13px] text-[#F0F0EC] focus:border-[#D7FF4F] focus:outline-none" />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2.5">
          {mensaje
            ? <span className={`text-xs animate-[sg-entrada_200ms_ease-out] ${mensaje.tipo === "ok" ? "text-[#56E3A4]" : "text-[#FF7A70]"}`}>{mensaje.texto}</span>
            : <span className="text-xs text-[#B5B5AE]">{cambios ? `Cambios sin guardar: ${cambios}` : "Sin cambios."}</span>}
          <button type="button" onClick={() => { setC(guardado.config); setMensaje(null); }} disabled={!cambios || guardando}
            className="ml-auto h-8 rounded-lg border border-[#3A3A36] bg-[#252622] px-3 text-xs font-semibold disabled:opacity-40">Descartar</button>
          <button type="button" onClick={() => void guardar()} disabled={!cambios || guardando}
            className="h-8 rounded-lg bg-[#D7FF4F] px-3 text-xs font-bold text-[#151613] disabled:opacity-40">{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>

      <aside className="flex max-w-[440px] flex-[1_1_380px] flex-col gap-3">
        <section className={`${caja} flex flex-col gap-2.5 px-3.5 py-3`}>
          <h2 className="text-[13px] font-bold">Vista previa</h2>
          <div className="overflow-hidden rounded-lg border border-[#3A3A36]">
            <VistaPantalla estado={reposo(0)} escala={380 / 1280} textoReposo={c.textoReposo} />
          </div>
          <button type="button" onClick={() => enviar({ tipo: "mostrar_cobro", cobro: PRUEBA })} disabled={!conectada}
            className="h-8 rounded-lg border border-[#3A3A36] bg-[#252622] text-xs font-semibold disabled:opacity-40">Enviar una prueba a la pantalla</button>
          <span className="text-xs text-[#B5B5AE]">
            {conectada ? "Muestra un cobro de ejemplo (sin cliente real) para revisar el monitor." : "Enciende la pantalla del cliente (botón junto a la campanita) para enviar una prueba."}
          </span>
        </section>
        <section className={`${caja} flex flex-col gap-1.5 px-3.5 py-3`}>
          <h2 className="text-[13px] font-bold">Últimos cambios</h2>
          {guardado.historial.length
            ? guardado.historial.slice(0, 8).map((h, i) => <span key={i} className="text-xs tabular-nums text-[#B5B5AE]">{h}</span>)
            : <span className="text-xs text-[#B5B5AE]">Todavía no hay cambios: se usan los valores iniciales.</span>}
        </section>
      </aside>
    </div>
  );
}
