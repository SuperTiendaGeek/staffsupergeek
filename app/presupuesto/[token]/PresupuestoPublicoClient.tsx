"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { Decision, GrupoVista, LineaRetirada, Situacion, TotalesPrioridad, VistaLinea } from "@/lib/tecnicos/presupuesto/enlace-reglas";

// Vista del cliente. Toda la lógica de qué se puede responder vive en el
// servidor (enlace-reglas.ts); aquí solo se muestra y se arma el envío.

type Vista = {
  estado: "vigente" | "vencido" | "bloqueado";
  orden: { idVisible: string; fechaIngreso: string; cliente: string; equipo: string; problema: string; recomendaciones: string };
  vence: string;
  pideCedula: boolean;
  ultimaRespuesta: { fecha: string; nombre: string } | null;
  lineas: VistaLinea[];
  grupos: GrupoVista[];
  porPrioridad: TotalesPrioridad;
  retiradas: LineaRetirada[];
  pendientes: number;
  totalAprobado: number;
  totalPendiente: number;
};

const mon = (n: number) => `$${n.toFixed(2)}`;
const FMT = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "long", year: "numeric" });
function fecha(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  const t = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], 12) : Date.parse(iso ?? "");
  return Number.isFinite(t) ? FMT.format(new Date(t)) : "";
}

const PRIORIDAD_UI: Record<string, { texto: string; clase: string; ayuda: string }> = {
  Necesaria:   { texto: "Necesaria",   clase: "bg-red-400/15 text-red-200 border-red-300/40",       ayuda: "Sin esto no podemos reparar tu equipo." },
  Recomendada: { texto: "Recomendada", clase: "bg-amber-300/10 text-amber-200 border-amber-300/40", ayuda: "El técnico lo aconseja, pero la reparación puede seguir sin esto." },
  Opcional:    { texto: "Opcional",    clase: "bg-sky-300/10 text-sky-200 border-sky-300/40",       ayuda: "Mejora sugerida." },
};

function Prioridad({ p }: { p: string }) {
  const u = PRIORIDAD_UI[p] ?? PRIORIDAD_UI.Recomendada;
  return <span title={u.ayuda} className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${u.clase}`}>{u.texto}</span>;
}

function AvisoNecesaria() {
  return <p className="mt-2 rounded-lg border border-red-300/40 bg-red-400/10 px-3 py-2 text-xs text-red-100">Sin esto no podemos continuar con la reparación de tu equipo.</p>;
}

const ETIQUETA: Record<Situacion, { texto: string; clase: string }> = {
  nueva:       { texto: "Nuevo · requiere tu respuesta",      clase: "border-[#D7FF4F]/50 bg-[#D7FF4F]/10 text-[#D7FF4F]" },
  modificada:  { texto: "Cambió · requiere tu respuesta",     clase: "border-amber-300/50 bg-amber-300/10 text-amber-200" },
  repropuesta: { texto: "Propuesto de nuevo · requiere tu respuesta", clase: "border-amber-300/50 bg-amber-300/10 text-amber-200" },
  aprobada:    { texto: "Aprobado",                           clase: "border-emerald-300/40 bg-emerald-300/10 text-emerald-200" },
  en_proceso:  { texto: "Aprobado · en proceso",              clase: "border-emerald-300/40 bg-emerald-300/10 text-emerald-200" },
  no_aprobada: { texto: "No aprobado",                        clase: "border-[#3A3A36] bg-[#20201E] text-[#A7A7A7]" },
  anulada:     { texto: "Anulado por el taller",              clase: "border-[#3A3A36] bg-[#20201E] text-[#A7A7A7]" },
};

function Encabezado() {
  return (
    <header className="flex items-center gap-3">
      <Image src="/logo-brand.png" alt="SUPER GEEK" width={44} height={44} className="rounded-lg bg-white p-1" priority />
      <div>
        <p className="text-sm font-black tracking-wide text-[#F5F5F5]">SUPER GEEK</p>
        <p className="text-xs text-[#A7A7A7]">Servicio técnico · Otavalo</p>
      </div>
    </header>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="min-h-screen bg-[#1B1B1B] px-4 py-8 text-[#F5F5F5]">
      <div className="mx-auto max-w-xl space-y-6">
        <Encabezado />
        <section className="rounded-2xl border border-[#3A3A36] bg-[#2A2A28] p-5">
          <h1 className="text-lg font-bold">{titulo}</h1>
          <p className="mt-2 text-sm text-[#A7A7A7]">{texto}</p>
        </section>
      </div>
    </main>
  );
}

function Selector({ valor, onCambio, disabled }: { valor: Decision | null; onCambio: (d: Decision) => void; disabled?: boolean }) {
  const base = "flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition disabled:opacity-50";
  return (
    <div className="flex gap-2" role="radiogroup">
      <button type="button" role="radio" aria-checked={valor === "aprobar"} disabled={disabled} onClick={() => onCambio("aprobar")}
        className={`${base} ${valor === "aprobar" ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] bg-[#20201E] text-[#F5F5F5] hover:border-[#D7FF4F]/60"}`}>
        ✓ Aprobar
      </button>
      <button type="button" role="radio" aria-checked={valor === "no"} disabled={disabled} onClick={() => onCambio("no")}
        className={`${base} ${valor === "no" ? "border-red-300 bg-red-400/20 text-red-100" : "border-[#3A3A36] bg-[#20201E] text-[#F5F5F5] hover:border-red-300/60"}`}>
        ✕ No aprobar
      </button>
    </div>
  );
}

function TarjetaLinea({ l, decision, onDecidir, abierta, onAbrir }: {
  l: VistaLinea; decision: Decision | null; onDecidir: (d: Decision) => void; abierta: boolean; onAbrir: () => void;
}) {
  const e = ETIQUETA[l.situacion];
  const tachada = (!l.pendiente && decision === "no") || l.situacion === "anulada";
  const cambio = !l.pendiente && l.puedeResponder && decision !== l.decisionActual;
  return (
    <li className={`rounded-2xl border p-4 ${l.pendiente ? "border-[#D7FF4F]/30 bg-[#2A2A28]" : "border-[#3A3A36] bg-[#242422]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <Prioridad p={l.prioridad} />
            <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${e.clase}`}>{cambio ? "Cambiarás tu respuesta" : e.texto}</span>
          </div>
          <p className={`mt-2 text-[15px] font-semibold leading-snug ${tachada ? "text-[#8A8A80] line-through" : "text-[#F5F5F5]"}`}>{l.descripcion}</p>
          <p className="mt-0.5 text-xs text-[#A7A7A7]">
            {l.tipo}{l.cantidad > 1 ? ` · ${l.cantidad} × ${mon(l.precioUnitario)}` : ""}
            {l.bajoPedido ? ` · Bajo pedido${l.tiempoEstimado ? `, llega en ${l.tiempoEstimado}` : ""}` : ""}
          </p>
          {l.anterior && (
            <p className="mt-1 text-xs text-amber-200/90">
              Antes: {l.anterior.cantidad > 1 ? `${l.anterior.cantidad} × ` : ""}{mon(l.anterior.precioUnitario)}
              {l.anterior.descripcion !== l.descripcion ? ` · "${l.anterior.descripcion}"` : ""}
            </p>
          )}
          {l.notaCliente && <p className="mt-2 whitespace-pre-line rounded-lg bg-[#1B1B1B] px-3 py-2 text-xs text-[#D6D6D0]">{l.notaCliente}</p>}
          {l.nota && <p className="mt-1 text-xs text-[#A7A7A7]">{l.nota}</p>}
        </div>
        <p className={`shrink-0 text-base font-black tabular-nums ${tachada ? "text-[#8A8A80] line-through" : "text-[#F5F5F5]"}`}>{mon(l.subtotal)}</p>
      </div>

      {l.pendiente && <div className="mt-3"><Selector valor={decision} onCambio={onDecidir} /></div>}
      {!l.pendiente && l.puedeResponder && (
        abierta
          ? <div className="mt-3"><Selector valor={decision} onCambio={onDecidir} /></div>
          : <button type="button" onClick={onAbrir} className="mt-2 text-xs font-semibold text-[#A7A7A7] underline underline-offset-2 hover:text-[#F5F5F5]">Cambiar mi respuesta</button>
      )}
      {l.prioridad === "Necesaria" && l.puedeResponder && decision === "no" && <AvisoNecesaria />}
      {l.situacion === "en_proceso" && <p className="mt-2 text-[11px] text-[#8A8A80]">Ya estamos trabajando en esto. Para cambiarlo, comunícate con la tienda.</p>}
    </li>
  );
}

function TarjetaGrupo({ g, lineas, decisiones, onElegir, abierta, onAbrir }: {
  g: GrupoVista; lineas: VistaLinea[]; decisiones: Record<string, Decision | null>;
  onElegir: (lineaId: string | null) => void; abierta: boolean; onAbrir: () => void;
}) {
  const responder = g.pendiente || abierta;
  const cambiables = lineas.some((l) => l.puedeResponder);
  const elegida = lineas.find((l) => decisiones[l.id] === "aprobar")?.id ?? null;
  const ninguna = lineas.every((l) => decisiones[l.id] === "no");
  return (
    <li className={`rounded-2xl border p-4 ${g.pendiente ? "border-[#D7FF4F]/30 bg-[#2A2A28]" : "border-[#3A3A36] bg-[#242422]"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Prioridad p={g.prioridad} />
        <span className="inline-block rounded-full border border-[#3A3A36] px-2 py-0.5 text-[11px] font-semibold text-[#C9C9C4]">Elige una opción</span>
        {g.pendiente && <span className="inline-block rounded-full border border-[#D7FF4F]/50 bg-[#D7FF4F]/10 px-2 py-0.5 text-[11px] font-semibold text-[#D7FF4F]">Requiere tu respuesta</span>}
      </div>
      <ul className="mt-3 space-y-2">
        {lineas.map((l) => {
          const sel = elegida === l.id;
          const tachada = !responder && decisiones[l.id] !== "aprobar";
          return (
            <li key={l.id}>
              <button type="button" disabled={!responder || !l.puedeResponder} onClick={() => onElegir(l.id)} role="radio" aria-checked={sel}
                className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-default ${sel ? "border-[#D7FF4F] bg-[#D7FF4F]/10" : "border-[#3A3A36] bg-[#1F1F1D] hover:border-[#D7FF4F]/50"}`}>
                <span className="min-w-0">
                  <span className={`block text-[15px] font-semibold ${tachada ? "text-[#8A8A80] line-through" : "text-[#F5F5F5]"}`}>{sel ? "● " : responder ? "○ " : ""}{l.descripcion}</span>
                  <span className="block text-xs text-[#A7A7A7]">{l.tipo}{l.bajoPedido ? ` · Bajo pedido${l.tiempoEstimado ? `, llega en ${l.tiempoEstimado}` : ""}` : ""}{l.situacion === "modificada" ? " · cambió" : ""}</span>
                  {l.anterior && <span className="block text-xs text-amber-200/90">Antes: {mon(l.anterior.precioUnitario)}</span>}
                  {l.notaCliente && <span className="mt-1 block whitespace-pre-line text-xs text-[#D6D6D0]">{l.notaCliente}</span>}
                  {l.situacion === "en_proceso" && <span className="mt-1 block text-[11px] text-emerald-200">Aprobado · en proceso</span>}
                </span>
                <span className={`shrink-0 text-base font-black tabular-nums ${tachada ? "text-[#8A8A80]" : "text-[#F5F5F5]"}`}>{mon(l.subtotal)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {responder && (
        <button type="button" onClick={() => onElegir(null)} aria-checked={ninguna} role="radio"
          className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm font-semibold transition ${ninguna ? "border-red-300 bg-red-400/15 text-red-100" : "border-[#3A3A36] bg-[#20201E] text-[#C9C9C4] hover:border-red-300/60"}`}>
          ✕ Ninguna de estas
        </button>
      )}
      {responder && ninguna && g.prioridad === "Necesaria" && <AvisoNecesaria />}
      {!responder && cambiables && (
        <button type="button" onClick={onAbrir} className="mt-2 text-xs font-semibold text-[#A7A7A7] underline underline-offset-2 hover:text-[#F5F5F5]">Cambiar mi elección</button>
      )}
    </li>
  );
}

export function PresupuestoPublicoClient({ token }: { token: string }) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<{ status: number; texto: string } | null>(null);
  const [decisiones, setDecisiones] = useState<Record<string, Decision | null>>({});
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [nombre, setNombre] = useState("");
  const [cedula4, setCedula4] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [entiende, setEntiende] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [listo, setListo] = useState<{ aprobadas: number; noAprobadas: number; totalAprobado: number } | null>(null);

  const api = `/api/publico/presupuesto/${encodeURIComponent(token)}`;

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(api, { cache: "no-store" });
      const j = await r.json();
      if (!j.success) { setError({ status: r.status, texto: j.error ?? "No pudimos cargar el presupuesto." }); return; }
      const v = j.data as Vista;
      setVista(v);
      setDecisiones(Object.fromEntries(v.lineas.map((l) => [l.id, l.pendiente ? null : l.decisionActual])));
      setAbiertas(new Set());
      setError(null);
    } catch { setError({ status: 0, texto: "Sin conexión. Revisa tu internet e intenta de nuevo." }); }
  }, [api]);

  useEffect(() => { void cargar(); }, [cargar]);

  const calculo = useMemo(() => {
    if (!vista) return null;
    const pendientes = vista.lineas.filter((l) => l.pendiente);
    const sinResponder = pendientes.filter((l) => !decisiones[l.id]);
    const cambios = vista.lineas.filter((l) => l.puedeResponder && decisiones[l.id] && (l.pendiente || decisiones[l.id] !== l.decisionActual));
    const total = vista.lineas.reduce((s, l) => s + ((decisiones[l.id] ?? (l.situacion === "en_proceso" ? "aprobar" : null)) === "aprobar" ? l.subtotal : 0), 0);
    const tocadas = new Set(cambios.map((l) => l.id));
    const necesariasNo: string[] = [];
    for (const l of vista.lineas) if (!l.grupo && l.prioridad === "Necesaria" && tocadas.has(l.id) && decisiones[l.id] === "no") necesariasNo.push(l.descripcion);
    for (const g of vista.grupos) {
      const ls = vista.lineas.filter((l) => l.grupo === g.id);
      if (g.prioridad === "Necesaria" && ls.some((l) => tocadas.has(l.id)) && !ls.some((l) => (decisiones[l.id] ?? l.decisionActual) === "aprobar")) necesariasNo.push(ls.map((l) => l.descripcion).join(" / "));
    }
    return { pendientes, sinResponder, cambios, necesariasNo, total: Math.round(total * 100) / 100, apruebaAlgo: cambios.some((l) => decisiones[l.id] === "aprobar") };
  }, [vista, decisiones]);

  async function enviar() {
    if (!vista || !calculo) return;
    setEnviando(true); setErrorEnvio(null);
    try {
      const r = await fetch(api, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisiones: calculo.cambios.map((l) => ({ lineaId: l.id, decision: decisiones[l.id], huella: l.huella })),
          nombre, cedula4, acepta, entiendeNecesarias: entiende,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setErrorEnvio(j.error ?? "No pudimos guardar tu respuesta.");
        if (j.codigo === "CAMBIO") await cargar();
        return;
      }
      setListo(j.data);
      setEntiende(false);
      await cargar();
    } catch { setErrorEnvio("Sin conexión. Tu respuesta no se envió; intenta de nuevo."); }
    finally { setEnviando(false); }
  }

  if (error) {
    return error.status === 404
      ? <Aviso titulo="Enlace no válido" texto="Este enlace no existe o fue reemplazado. Comunícate con SUPER GEEK para que te envíen el enlace correcto." />
      : <Aviso titulo="No pudimos abrir tu presupuesto" texto={error.texto} />;
  }
  if (!vista || !calculo) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#1B1B1B] text-[#A7A7A7]">
        <p className="text-sm">Cargando tu presupuesto…</p>
      </main>
    );
  }

  const o = vista.orden;
  const bloqueadoEnvio = vista.estado !== "vigente";
  const datosOk = nombre.trim().length >= 3 && acepta && (!vista.pideCedula || cedula4.replace(/\D/g, "").length === 4)
    && (calculo.necesariasNo.length === 0 || entiende);
  const puedeEnviar = !bloqueadoEnvio && calculo.cambios.length > 0 && calculo.sinResponder.length === 0 && datosOk && !enviando;
  const hayQueResponder = calculo.pendientes.length > 0;

  // Bloques: una línea suelta o un grupo de alternativas (en el orden de la primera).
  type Bloque = { tipo: "linea"; l: VistaLinea } | { tipo: "grupo"; g: GrupoVista; ls: VistaLinea[] };
  const bloques: Bloque[] = [];
  const vistos = new Set<string>();
  for (const l of vista.lineas) {
    if (vistos.has(l.id)) continue;
    const g = l.grupo ? vista.grupos.find((x) => x.id === l.grupo) : undefined;
    if (g) { const ls = vista.lineas.filter((x) => x.grupo === g.id); ls.forEach((x) => vistos.add(x.id)); bloques.push({ tipo: "grupo", g, ls }); }
    else { vistos.add(l.id); bloques.push({ tipo: "linea", l }); }
  }
  const pendientes = bloques.filter((b) => (b.tipo === "linea" ? b.l.pendiente : b.g.pendiente));
  const resto = bloques.filter((b) => !(b.tipo === "linea" ? b.l.pendiente : b.g.pendiente));
  const elegirEnGrupo = (ls: VistaLinea[], id: string | null) =>
    setDecisiones((p) => ({ ...p, ...Object.fromEntries(ls.filter((x) => x.puedeResponder).map((x) => [x.id, x.id === id ? "aprobar" : "no"])) }));
  const pintar = (b: Bloque) => b.tipo === "linea"
    ? <TarjetaLinea key={b.l.id} l={b.l} decision={decisiones[b.l.id] ?? null} abierta={b.l.pendiente || abiertas.has(b.l.id)}
        onAbrir={() => setAbiertas((p) => new Set(p).add(b.l.id))}
        onDecidir={(d) => setDecisiones((p) => ({ ...p, [b.l.id]: d }))} />
    : <TarjetaGrupo key={b.g.id} g={b.g} lineas={b.ls} decisiones={decisiones} abierta={abiertas.has(b.g.id)}
        onAbrir={() => setAbiertas((p) => new Set(p).add(b.g.id))}
        onElegir={(id) => elegirEnGrupo(b.ls, id)} />;

  return (
    <main className="min-h-screen bg-[#1B1B1B] px-4 pb-16 pt-6 text-[#F5F5F5]">
      <div className="mx-auto max-w-xl space-y-5">
        <Encabezado />

        <section className="rounded-2xl border border-[#3A3A36] bg-[#2A2A28] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#D7FF4F]">Presupuesto · Orden {o.idVisible}</p>
          <h1 className="mt-1 text-xl font-black">{o.cliente ? `Hola, ${o.cliente}` : "Hola"}</h1>
          <p className="mt-1 text-sm text-[#A7A7A7]">
            {hayQueResponder
              ? `Revisa tu presupuesto y dinos qué apruebas. ${pendientes.length === 1 ? "Hay 1 punto" : `Hay ${pendientes.length} puntos`} esperando tu respuesta.`
              : "Tu presupuesto está al día: no hay nada nuevo por responder."}
          </p>
          <dl className="mt-4 grid gap-2 text-sm">
            {o.equipo && <div><dt className="text-xs text-[#8A8A80]">Equipo</dt><dd>{o.equipo}</dd></div>}
            {o.problema && <div><dt className="text-xs text-[#8A8A80]">Problema reportado</dt><dd className="whitespace-pre-line">{o.problema}</dd></div>}
            {o.fechaIngreso && <div><dt className="text-xs text-[#8A8A80]">Ingreso</dt><dd>{fecha(o.fechaIngreso)}</dd></div>}
          </dl>
          {o.recomendaciones && (
            <div className="mt-4 rounded-xl border border-[#D7FF4F]/25 bg-[#D7FF4F]/5 p-3">
              <p className="text-xs font-bold text-[#D7FF4F]">Recomendaciones del técnico</p>
              <p className="mt-1 whitespace-pre-line text-sm text-[#E5E5E0]">{o.recomendaciones}</p>
            </div>
          )}
        </section>

        {vista.estado === "vencido" && (
          <p className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">Este enlace venció. Puedes ver tu presupuesto, pero para responder pide a SUPER GEEK que te lo vuelva a enviar.</p>
        )}
        {vista.estado === "bloqueado" && (
          <p className="rounded-xl border border-red-300/40 bg-red-400/10 p-3 text-sm text-red-100">Por seguridad, el enlace está bloqueado unos minutos por varios intentos fallidos. Intenta más tarde o comunícate con la tienda.</p>
        )}
        {listo && (
          <p className="rounded-xl border border-emerald-300/40 bg-emerald-300/10 p-3 text-sm text-emerald-100">
            ¡Gracias! Recibimos tu respuesta{listo.aprobadas ? `: aprobaste ${listo.aprobadas} ${listo.aprobadas === 1 ? "punto" : "puntos"} por ${mon(listo.totalAprobado)}` : ""}. El técnico ya fue notificado.
          </p>
        )}

        {pendientes.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-[#F5F5F5]">Requiere tu respuesta</h2>
            <ul className="space-y-2">{pendientes.map(pintar)}</ul>
          </section>
        )}

        {resto.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-[#A7A7A7]">{pendientes.length ? "Ya respondido" : "Tu presupuesto"}</h2>
            <ul className="space-y-2">{resto.map(pintar)}</ul>
          </section>
        )}

        {vista.retiradas.length > 0 && (
          <section className="rounded-2xl border border-[#3A3A36] bg-[#242422] p-4">
            <h2 className="text-sm font-bold text-[#A7A7A7]">Retirado del presupuesto por el taller</h2>
            <ul className="mt-2 space-y-1 text-sm text-[#8A8A80]">
              {vista.retiradas.map((r, i) => <li key={i} className="flex justify-between gap-3"><span className="line-through">{r.descripcion}</span><span className="tabular-nums">{mon(r.subtotal)}</span></li>)}
            </ul>
            <p className="mt-2 text-xs text-[#8A8A80]">Ya no forma parte de tu presupuesto; no se cobrará.</p>
          </section>
        )}

        {vista.lineas.length === 0 && (
          <p className="rounded-xl border border-[#3A3A36] bg-[#242422] p-4 text-sm text-[#A7A7A7]">Todavía no hay líneas en tu presupuesto.</p>
        )}

        <section className="rounded-2xl border border-[#3A3A36] bg-[#2A2A28] p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-[#A7A7A7]">Total aprobado con tu respuesta</span>
            <span className="text-2xl font-black tabular-nums text-[#D7FF4F]">{mon(calculo.total)}</span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            {(["Necesaria", "Recomendada", "Opcional"] as const).map((p) => (
              <div key={p} className="rounded-lg border border-[#3A3A36] bg-[#1F1F1D] px-2 py-1.5">
                <dt className="text-[#8A8A80]">{p === "Necesaria" ? "Necesario" : p === "Recomendada" ? "Recomendado" : "Opcional"}</dt>
                <dd className="font-bold tabular-nums text-[#F5F5F5]">{vista.porPrioridad.desde.includes(p) ? "desde " : ""}{mon(vista.porPrioridad[p])}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-[#8A8A80]">Precios en dólares con IVA incluido. Los repuestos bajo pedido se solicitan al proveedor cuando apruebas.</p>
          <a href={`${api}/pdf`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-[#A7A7A7] underline underline-offset-2 hover:text-[#F5F5F5]">Descargar presupuesto en PDF</a>
        </section>

        {calculo.cambios.length > 0 && !bloqueadoEnvio && (
          <section className="space-y-3 rounded-2xl border border-[#D7FF4F]/30 bg-[#2A2A28] p-4">
            <h2 className="text-sm font-bold">Confirma tu respuesta</h2>
            <label className="block">
              <span className="text-xs text-[#A7A7A7]">Tu nombre completo</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name"
                className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#1B1B1B] px-3 py-2.5 text-[15px] text-[#F5F5F5] focus:border-[#D7FF4F] focus:outline-none" />
            </label>
            {vista.pideCedula && (
              <label className="block">
                <span className="text-xs text-[#A7A7A7]">Últimos 4 dígitos de tu cédula (la que registraste en la tienda)</span>
                <input value={cedula4} onChange={(e) => setCedula4(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" placeholder="0000"
                  className="mt-1 w-32 rounded-xl border border-[#3A3A36] bg-[#1B1B1B] px-3 py-2.5 text-center text-[15px] tracking-[0.3em] text-[#F5F5F5] focus:border-[#D7FF4F] focus:outline-none" />
              </label>
            )}
            {calculo.necesariasNo.length > 0 && (
              <label className="flex items-start gap-2 rounded-xl border border-red-300/40 bg-red-400/10 p-3 text-xs text-red-100">
                <input type="checkbox" checked={entiende} onChange={(e) => setEntiende(e.target.checked)} className="mt-0.5 h-4 w-4 accent-red-300" />
                <span>Entiendo que sin <b>{calculo.necesariasNo.join(", ")}</b> SUPER GEEK no puede continuar con la reparación de mi equipo.</span>
              </label>
            )}
            <label className="flex items-start gap-2 text-xs text-[#C9C9C4]">
              <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#D7FF4F]" />
              <span>Autorizo a SUPER GEEK a realizar los trabajos y pedir los repuestos que apruebo, por los valores indicados. Entiendo que esta respuesta queda registrada con fecha, hora y dispositivo.</span>
            </label>
            {calculo.sinResponder.length > 0 && (
              <p className="text-xs text-amber-200">Falta responder {calculo.sinResponder.length === 1 ? "1 punto" : `${calculo.sinResponder.length} puntos`}.</p>
            )}
            {errorEnvio && <p className="text-sm text-red-200">{errorEnvio}</p>}
            <button type="button" onClick={enviar} disabled={!puedeEnviar}
              className="w-full rounded-2xl bg-[#D7FF4F] px-4 py-4 text-base font-black text-[#151515] shadow-[0_8px_30px_rgba(215,255,79,0.25)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">
              {enviando ? "Enviando…" : calculo.apruebaAlgo ? "Enviar mi respuesta y aprobar" : "Enviar mi respuesta"}
            </button>
          </section>
        )}

        {vista.ultimaRespuesta && (
          <p className="text-center text-[11px] text-[#8A8A80]">Última respuesta: {vista.ultimaRespuesta.nombre} · {fecha(vista.ultimaRespuesta.fecha)}</p>
        )}
        <p className="text-center text-[11px] text-[#6E6E68]">¿Dudas? Escríbenos por WhatsApp o visítanos en la tienda. Este enlace es personal: no lo compartas.</p>
      </div>
    </main>
  );
}
