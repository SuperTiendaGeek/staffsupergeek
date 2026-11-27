"use client";

// Bandeja "Pagos recibidos" (maqueta 12 aprobada, 18-nov-2026). Tres vistas:
//   · Por asignar: pagos DeUna que llegaron sin referencia (QR impreso del
//     mostrador) y pagos que no se aplicaron solos. El sistema SUGIERE la
//     cuenta (misma cédula, mismo monto); el empleado confirma.
//   · Historial: todo lo cobrado e intentado, con filtros y descarga a Excel.
//   · Cierre del día (Administradores): cobrado − comisión = neto por pasarela,
//     para comparar con el banco y acreditar el día en Finanzas.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Download, Loader2, Search, X } from "lucide-react";
import {
  csvHistorial, etiquetaEstado, fechaHoraEcuador, urlCuenta,
  type CandidatoSugerido, type CierrePasarela, type FilaPago, type Periodo, type ResumenBandeja,
} from "@/lib/pagos-en-linea/bandeja";
import type { Pasarela } from "@/lib/pagos-en-linea/reglas";

type FilaPendiente = FilaPago & { sugerencia: CandidatoSugerido | null };
type Datos = {
  hoy: string; resumen: ResumenBandeja; pendientes: FilaPendiente[]; historial: FilaPago[];
  desde: string; hasta: string; encendidas: Record<Pasarela, boolean>;
};
type DatosCierre = { fecha: string; pasarelas: CierrePasarela[]; pendientes: Record<Pasarela, { cantidad: number; monto: number }> };

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${(Math.round(n * 100) / 100).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const hora = (iso: string, hoy: string) => {
  const f = fechaHoraEcuador(iso);
  if (!f) return "—";
  return f.slice(0, 10) === hoy ? f.slice(11) : `${f.slice(8, 10)}/${f.slice(5, 7)} ${f.slice(11)}`;
};
const COLOR_PASARELA: Record<Pasarela, string> = { DeUna: "text-[#8DB8FF] bg-[#8DB8FF]/[0.13]", PayPhone: "text-[#D7FF4F] bg-[#D7FF4F]/[0.12]" };
const COLOR_ESTADO: Record<string, string> = {
  Aplicado: "text-[#56E3A4] bg-[#56E3A4]/[0.12]", "Por asignar": "text-[#FFB547] bg-[#FFB547]/[0.13]", "Por revisar": "text-[#FFB547] bg-[#FFB547]/[0.13]",
  "Aplicándose": "text-[#8DB8FF] bg-[#8DB8FF]/[0.13]", "No corresponde": "text-[#FF8A80] bg-[#FF8A80]/[0.12]",
};
const chip = "inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold";
const btn = "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#3A3A36] bg-[#252622] px-3 text-xs font-semibold text-[#F0F0EC] hover:border-[#6A6A62] disabled:opacity-50";
const btnMain = "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#D7FF4F] px-3 text-xs font-bold text-[#151613] disabled:opacity-50";

function Chip({ pasarela, ambiente }: { pasarela: Pasarela; ambiente?: string }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={`${chip} ${COLOR_PASARELA[pasarela]}`}>{pasarela}</span>
      {/* D2: pagos de QA (cuentas «Es prueba»): nunca son dinero real. */}
      {ambiente === "Prueba" && <span className={`${chip} bg-[#FF8A80]/[0.12] text-[#FF8A80]`}>PRUEBA</span>}
    </span>
  );
}
function ChipEstado({ f, hoy }: { f: FilaPago; hoy: string }) {
  const vencido = f.estado === "Abierto" && !!f.creado && Date.now() - Date.parse(f.creado) > 20 * 60_000;
  const e = etiquetaEstado(f.estado, vencido);
  void hoy;
  return <span className={`${chip} ${COLOR_ESTADO[e] ?? "bg-[#2A2B27] text-[#B5B5AE]"}`}>{e}</span>;
}

async function enviar<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json()) as { success: boolean; data?: T; error?: string };
    return j.success ? { ok: true, data: j.data as T } : { ok: false, error: j.error ?? "No se pudo completar." };
  } catch {
    return { ok: false, error: "Sin conexión. Intenta de nuevo." };
  }
}

export function PagosRecibidosClient({ admin }: { admin: boolean }) {
  const [vista, setVista] = useState<"asignar" | "historial" | "cierre">("asignar");
  const [periodo, setPeriodo] = useState<Periodo | "rango">("hoy");
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [asignando, setAsignando] = useState<FilaPendiente | null>(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const q = periodo === "rango" && rango.desde && rango.hasta ? `desde=${rango.desde}&hasta=${rango.hasta}` : `periodo=${periodo === "rango" ? "hoy" : periodo}`;
      const r = await fetch(`/api/pagos-recibidos?${q}`, { cache: "no-store" });
      const j = (await r.json()) as { success: boolean; data?: Datos; error?: string };
      if (!j.success || !j.data) { setError(j.error ?? "No se pudo leer la bandeja."); return; }
      setDatos(j.data);
      setError("");
    } catch {
      setError("Sin conexión. Revisa tu internet.");
    } finally {
      setCargando(false);
    }
  }, [periodo, rango]);

  useEffect(() => { void cargar(); }, [cargar]);
  // Se actualiza sola cada 30 s (llegan pagos DeUna del QR impreso).
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void cargar(); }, 30_000);
    return () => clearInterval(t);
  }, [cargar]);

  const pendientes = datos?.pendientes ?? [];
  const r = datos?.resumen;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 text-[13px] text-[#F0F0EC]">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-lg font-extrabold">Pagos recibidos</h1>
        <span className="text-xs text-[#B5B5AE]">PayPhone y DeUna · se actualiza solo</span>
        <div className="flex-1" />
        {datos && (["DeUna", "PayPhone"] as Pasarela[]).map((p) => (
          <span key={p} className={`${chip} ${datos.encendidas[p] ? "bg-[#56E3A4]/[0.12] text-[#56E3A4]" : "bg-[#2A2B27] text-[#B5B5AE]"}`}>
            {datos.encendidas[p] ? "●" : "○"} {p} {datos.encendidas[p] ? "encendido" : "apagado"}
          </span>
        ))}
        {cargando && <Loader2 size={14} className="animate-spin text-[#B5B5AE] motion-reduce:animate-none" aria-label="Actualizando" />}
      </div>

      {error && <p className="rounded-lg border border-[#FF5A4F]/40 bg-[#FF5A4F]/10 px-3 py-2 text-sm text-[#FF7A70]">{error}</p>}
      {aviso && (
        <p className="flex items-center gap-2 rounded-lg border border-[#56E3A4]/40 bg-[#56E3A4]/10 px-3 py-2 text-sm text-[#56E3A4] animate-[sg-entrada_220ms_ease-out]">
          <Check size={15} aria-hidden /> {aviso}
          <button type="button" aria-label="Cerrar aviso" onClick={() => setAviso("")} className="ml-auto text-[#B5B5AE]"><X size={14} /></button>
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <Tarjeta titulo="Recibido hoy" valor={r ? usd(r.recibido) : "…"} nota={r ? `${r.pagos} pagos · DeUna ${r.porPasarela.DeUna} · PayPhone ${r.porPasarela.PayPhone}` : ""} />
        <Tarjeta titulo="Por asignar o revisar" valor={r ? `${r.pendientes} · ${usd(r.montoPendientes)}` : "…"} nota={r && r.pendientes ? "Asígnalos hoy" : "Nada pendiente"} alerta={!!r && r.pendientes > 0} />
        <Tarjeta titulo="Comisiones de hoy" valor={r ? usd(r.comisiones) : "…"} nota="DeUna 2 % + IVA · PayPhone 5,75 %" />
        <Tarjeta titulo="Neto que debe llegar a SGINGRESOS" valor={r ? usd(r.neto) : "…"} nota="Se acredita en Finanzas al llegar" />
      </div>

      <nav aria-label="Vistas de la bandeja" className="flex flex-wrap gap-1 border-b border-[#2C2D29]">
        <Pestana activa={vista === "asignar"} onClick={() => setVista("asignar")}>
          Por asignar {pendientes.length > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#FFB547] px-1.5 text-[11px] font-extrabold text-[#151613]">{pendientes.length}</span>}
        </Pestana>
        <Pestana activa={vista === "historial"} onClick={() => setVista("historial")}>Historial</Pestana>
        {admin && <Pestana activa={vista === "cierre"} onClick={() => setVista("cierre")}>Cierre del día</Pestana>}
      </nav>

      {vista === "asignar" && datos && (
        <div className="flex flex-wrap items-start gap-3">
          <section className="min-w-0 flex-[999_1_640px] rounded-xl border border-[#3A3A36] bg-[#1E1F1C]">
            {pendientes.length === 0 && (
              <p className="flex items-center gap-2 px-4 py-6 text-[#B5B5AE]"><Check size={16} className="text-[#56E3A4]" aria-hidden /> No hay pagos por asignar ni por revisar.</p>
            )}
            {pendientes.map((f) => (
              <FilaBandeja key={f.codigo} f={f} hoy={datos.hoy} admin={admin} seleccionada={asignando?.codigo === f.codigo}
                onAsignar={() => setAsignando(f)}
                onListo={(texto) => { setAviso(texto); setAsignando(null); void cargar(); }} />
            ))}
          </section>
          {asignando && (
            <PanelAsignar key={asignando.codigo} pago={asignando} onCerrar={() => setAsignando(null)}
              onListo={(texto) => { setAviso(texto); setAsignando(null); void cargar(); }} />
          )}
        </div>
      )}

      {vista === "historial" && datos && (
        <Historial datos={datos} periodo={periodo} setPeriodo={setPeriodo} rango={rango} setRango={setRango} />
      )}

      {vista === "cierre" && admin && datos && <Cierre hoy={datos.hoy} onAviso={setAviso} />}
    </div>
  );
}

function Tarjeta({ titulo, valor, nota, alerta }: { titulo: string; valor: string; nota: string; alerta?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-xl border bg-[#1E1F1C] px-3.5 py-3 ${alerta ? "border-[#FFB547]/50" : "border-[#3A3A36]"}`}>
      <span className="text-xs text-[#B5B5AE]">{titulo}</span>
      <b className={`text-[22px] font-extrabold tabular-nums ${alerta ? "text-[#FFB547]" : ""}`}>{valor}</b>
      <span className="text-xs text-[#B5B5AE] tabular-nums">{nota}</span>
    </div>
  );
}

function Pestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-current={activa ? "page" : undefined}
      className={`inline-flex h-[34px] items-center gap-1.5 border-b-2 px-3 text-[13px] font-semibold ${activa ? "border-[#D7FF4F] text-[#F0F0EC]" : "border-transparent text-[#B5B5AE]"}`}>
      {children}
    </button>
  );
}

// ─── Por asignar ────────────────────────────────────────────────────────────

function FilaBandeja({ f, hoy, admin, seleccionada, onAsignar, onListo }: {
  f: FilaPendiente; hoy: string; admin: boolean; seleccionada: boolean; onAsignar: () => void; onListo: (texto: string) => void;
}) {
  const [motivo, setMotivo] = useState<"no" | "revisado" | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const porAsignar = f.estado === "Por asignar";
  const s = f.sugerencia;

  async function asignarSugerida() {
    if (!s) return;
    setOcupado(true); setError("");
    const r = await enviar("/api/pagos-recibidos/asignar", { codigo: f.codigo, origen: s.origen, id: s.id });
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    onListo(`${usd(f.monto)} de ${f.pagador || f.pasarela} quedó registrado en ${s.codigo}.`);
  }
  async function guardarMotivo() {
    setOcupado(true); setError("");
    const r = motivo === "no"
      ? await enviar("/api/pagos-recibidos/descartar", { codigo: f.codigo, motivo: texto })
      : await enviar("/api/pagos-recibidos/revisado", { codigo: f.codigo, nota: texto });
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    onListo(motivo === "no" ? `${f.codigo} quedó como «No corresponde».` : `${f.codigo} quedó revisado.`);
  }

  return (
    <div className={`grid grid-cols-[64px_92px_minmax(0,1fr)_auto] items-start gap-3 border-t border-[#2C2D29] px-3.5 py-3 first:border-t-0 max-md:grid-cols-[1fr] ${seleccionada ? "bg-[#D7FF4F]/[0.04]" : ""}`}>
      <div><div className="font-bold tabular-nums">{hora(f.pagadoEn || f.creado, hoy)}</div><div className="text-xs text-[#B5B5AE]">{fechaHoraEcuador(f.pagadoEn || f.creado).slice(0, 10) === hoy ? "hoy" : ""}</div></div>
      <div className="flex flex-col gap-1"><Chip pasarela={f.pasarela} ambiente={f.ambiente} /><b className="text-base tabular-nums">{usd(f.monto)}</b></div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div>
          <b>{f.pagador || f.codigo}</b>{" "}
          <span className="text-xs text-[#B5B5AE] tabular-nums">
            {[f.cedula ? `cédula ${f.cedula}` : "", f.referencia ? `transferencia ${f.referencia}` : "", f.pagador ? f.codigo : ""].filter(Boolean).join(" · ")}
          </span>
          {!porAsignar && <span className={`${chip} ml-1.5 bg-[#FFB547]/[0.13] text-[#FFB547]`}>Por revisar</span>}
        </div>
        <span className="text-xs text-[#B5B5AE]">
          {porAsignar ? "Llegó sin referencia: pagó con el QR impreso del mostrador u otro cobro de DeUna." : f.detalle.replace(/^Revisión: /, "")}
        </span>
        {porAsignar && s && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#56E3A4]/35 bg-[#56E3A4]/[0.06] px-2.5 py-2">
            <Check size={14} className="text-[#56E3A4]" aria-hidden />
            <span><b>{s.codigo}</b> · {s.cliente} · falta <b className="tabular-nums">{usd(s.falta)}</b></span>
            <span className="text-xs text-[#B5B5AE]">{[s.mismaCedula ? "misma cédula" : "", s.mismoMonto ? "mismo monto" : ""].filter(Boolean).join(" y ")}</span>
          </div>
        )}
        {porAsignar && !s && <span className="text-xs text-[#B5B5AE]">No hay una orden ni un pedido abierto con ese cliente y ese monto.</span>}
        {motivo && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-[#3A3A36] bg-[#171814] p-2.5">
            <label htmlFor={`motivo-${f.codigo}`} className="text-xs text-[#B5B5AE]">
              {motivo === "no" ? "¿Por qué no corresponde? (p. ej. pago personal, duplicado, se devolvió)" : "¿Qué se hizo? (p. ej. saldo a favor, se devolvió la diferencia)"}
            </label>
            <input id={`motivo-${f.codigo}`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300}
              className="h-8 rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 text-xs text-[#F0F0EC]" />
            <div className="flex gap-2">
              <button type="button" className={btnMain} disabled={ocupado || texto.trim().length < 3} onClick={() => void guardarMotivo()}>Guardar</button>
              <button type="button" className={btn} onClick={() => { setMotivo(null); setTexto(""); }}>Cancelar</button>
            </div>
          </div>
        )}
        {error && <span className="text-xs text-[#FF7A70]">{error}</span>}
      </div>
      <div className="flex min-w-[150px] flex-col items-stretch gap-1.5">
        {porAsignar && s && <button type="button" className={btnMain} disabled={ocupado} onClick={() => void asignarSugerida()}>{ocupado ? "Asignando…" : `Asignar a ${s.codigo}`}</button>}
        {porAsignar && <button type="button" className={s ? btn : btnMain} onClick={onAsignar}>{s ? "Buscar otra" : "Buscar orden o pedido"}</button>}
        {!porAsignar && f.destino && <Link href={urlCuenta(f.destino)} className={btn}>Ver {f.cuenta || "la cuenta"}</Link>}
        {admin && !porAsignar && f.conAbono && <button type="button" className={btn} onClick={() => setMotivo("revisado")}>Marcar revisado…</button>}
        {admin && !f.conAbono && <button type="button" className={`${btn} text-[#B5B5AE]`} onClick={() => setMotivo("no")}>No corresponde…</button>}
      </div>
    </div>
  );
}

function PanelAsignar({ pago, onCerrar, onListo }: { pago: FilaPendiente; onCerrar: () => void; onListo: (texto: string) => void }) {
  const [q, setQ] = useState(() => (pago.pagador.split(" ").slice(-2, -1)[0] || pago.pagador.split(" ")[0] || ""));
  const [resultados, setResultados] = useState<CandidatoSugerido[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegido, setElegido] = useState<CandidatoSugerido | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (q.trim().length < 3) { setResultados([]); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/pagos-recibidos/buscar?q=${encodeURIComponent(q.trim())}&codigo=${pago.codigo}`, { cache: "no-store" });
        const j = (await r.json()) as { success: boolean; data?: CandidatoSugerido[]; error?: string };
        if (!vivo) return;
        if (j.success && j.data) { setResultados(j.data); setError(""); } else setError(j.error ?? "No se pudo buscar.");
      } catch { if (vivo) setError("Sin conexión."); }
      finally { if (vivo) setBuscando(false); }
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, pago.codigo]);

  async function asignar() {
    if (!elegido) return;
    setOcupado(true); setError("");
    const r = await enviar("/api/pagos-recibidos/asignar", { codigo: pago.codigo, origen: elegido.origen, id: elegido.id });
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    onListo(`${usd(pago.monto)} de ${pago.pagador || pago.pasarela} quedó registrado en ${elegido.codigo}.`);
  }

  return (
    <aside aria-label="Asignar un pago" className="flex max-w-[460px] flex-[1_1_380px] flex-col gap-3 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-3.5 animate-[sg-entrada_220ms_ease-out]">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-bold">Asignar <span className="tabular-nums">{usd(pago.monto)}</span> de {pago.pasarela}</h2>
        <button type="button" aria-label="Cerrar" onClick={onCerrar} className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-[#3A3A36] bg-[#252622]"><X size={14} /></button>
      </div>
      <span className="text-xs text-[#B5B5AE]">{[pago.pagador, pago.cedula ? `cédula ${pago.cedula}` : "", fechaHoraEcuador(pago.pagadoEn || pago.creado).slice(11)].filter(Boolean).join(" · ")}</span>
      <label htmlFor="buscar-asignar" className="text-xs text-[#B5B5AE]">Orden, pedido, cliente o cédula</label>
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#B5B5AE]" aria-hidden />
        <input id="buscar-asignar" value={q} onChange={(e) => { setQ(e.target.value); setElegido(null); }} autoFocus
          className="h-9 w-full rounded-lg border border-[#3A3A36] bg-[#151613] pl-8 pr-2.5 text-[13px] text-[#F0F0EC]" placeholder="OR000552, OP-2026-000151, Méndez…" />
      </div>
      <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto">
        {buscando && <span className="text-xs text-[#B5B5AE]">Buscando…</span>}
        {!buscando && q.trim().length >= 3 && resultados.length === 0 && <span className="text-xs text-[#B5B5AE]">No hay cuentas abiertas con saldo para esa búsqueda.</span>}
        {resultados.map((c) => {
          const cabe = c.falta + 0.009 >= pago.monto;
          const on = elegido?.id === c.id;
          return (
            <button key={c.id} type="button" disabled={!cabe} onClick={() => setElegido(c)} aria-pressed={on}
              className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-[10px] border px-3 py-2.5 text-left disabled:opacity-45 ${on ? "border-[#56E3A4] bg-[#56E3A4]/[0.07]" : "border-[#3A3A36] bg-[#171814]"}`}>
              <b>{c.codigo} · {c.cliente || "—"}</b><b className="tabular-nums">falta {usd(c.falta)}</b>
              <span className="truncate text-xs text-[#B5B5AE]">{c.origen} · {c.detalle || "—"}</span>
              <span className="text-xs text-[#B5B5AE]">{!cabe ? "el pago es mayor" : [c.mismaCedula ? "misma cédula" : "", c.mismoMonto ? "mismo monto" : ""].filter(Boolean).join(" · ")}</span>
            </button>
          );
        })}
      </div>
      {elegido && (
        <div className="flex flex-col gap-1 rounded-[10px] bg-[#171814] px-3 py-2.5">
          <span className="text-xs text-[#B5B5AE]">Se registrará</span>
          <span>Abono de <b className="tabular-nums">{usd(pago.monto)}</b> a <b>{elegido.codigo}</b> · {pago.pasarela}{pago.referencia ? ` · transferencia ${pago.referencia}` : ""}</span>
          <span className="text-xs text-[#B5B5AE]">En Finanzas entra a la cuenta {pago.pasarela === "DeUna" ? "DeUna" : "Tarjetas en Tránsito"} «por acreditar»{pago.tarifa != null ? ` (comisión ${usd(pago.tarifa)})` : ""}.</span>
        </div>
      )}
      {error && <p className="text-xs text-[#FF7A70]">{error}</p>}
      <button type="button" className={`${btnMain} h-10 text-[13px]`} disabled={!elegido || ocupado} onClick={() => void asignar()}>
        {ocupado ? "Registrando…" : "Asignar y registrar el abono"}
      </button>
      <span className="text-xs text-[#B5B5AE]">Queda en el historial quién lo asignó y cuándo.</span>
    </aside>
  );
}

// ─── Historial ──────────────────────────────────────────────────────────────

function Historial({ datos, periodo, setPeriodo, rango, setRango }: {
  datos: Datos; periodo: Periodo | "rango"; setPeriodo: (p: Periodo | "rango") => void;
  rango: { desde: string; hasta: string }; setRango: (r: { desde: string; hasta: string }) => void;
}) {
  const [pasarela, setPasarela] = useState<"Todas" | Pasarela>("Todas");
  const [estado, setEstado] = useState("Todos");
  const [texto, setTexto] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);

  const filas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return datos.historial.filter((f) => {
      if (pasarela !== "Todas" && f.pasarela !== pasarela) return false;
      const e = etiquetaEstado(f.estado, f.estado === "Abierto" && Date.now() - Date.parse(f.creado) > 20 * 60_000);
      if (estado === "Sin pago" ? !["Sin pago", "Vencido sin pago", "Esperando pago"].includes(e) : estado !== "Todos" && e !== estado) return false;
      if (!t) return true;
      return [f.codigo, f.pagador, f.cuenta, f.referencia, f.cedula, String(f.monto)].some((v) => v.toLowerCase().includes(t));
    });
  }, [datos.historial, pasarela, estado, texto]);

  function descargar() {
    const blob = new Blob([csvHistorial(filas)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pagos-recibidos-${datos.desde}_${datos.hasta}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const seg = (on: boolean) => `h-7 rounded-md px-2.5 text-xs font-semibold ${on ? "bg-[#2E3024] text-[#D7FF4F]" : "text-[#B5B5AE]"}`;
  return (
    <div className="flex flex-col gap-2.5 animate-[sg-entrada_220ms_ease-out]">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Fecha" className="inline-flex gap-[3px] rounded-[9px] bg-[#252622] p-[3px]">
          {([["hoy", "Hoy"], ["7dias", "7 días"], ["mes", "Este mes"], ["rango", "Elegir fechas"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={periodo === k} className={seg(periodo === k)} onClick={() => setPeriodo(k)}>{l}</button>
          ))}
        </div>
        {periodo === "rango" && (
          <span className="flex items-center gap-1.5 text-xs">
            <label className="sr-only" htmlFor="h-desde">Desde</label>
            <input id="h-desde" type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} className="h-8 rounded-lg border border-[#3A3A36] bg-[#151613] px-2 text-[#F0F0EC]" />
            a
            <label className="sr-only" htmlFor="h-hasta">Hasta</label>
            <input id="h-hasta" type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} className="h-8 rounded-lg border border-[#3A3A36] bg-[#151613] px-2 text-[#F0F0EC]" />
          </span>
        )}
        <div role="group" aria-label="Pasarela" className="inline-flex gap-[3px] rounded-[9px] bg-[#252622] p-[3px]">
          {(["Todas", "DeUna", "PayPhone"] as const).map((p) => <button key={p} type="button" aria-pressed={pasarela === p} className={seg(pasarela === p)} onClick={() => setPasarela(p)}>{p}</button>)}
        </div>
        <label className="sr-only" htmlFor="h-estado">Estado</label>
        <select id="h-estado" value={estado} onChange={(e) => setEstado(e.target.value)} className="h-8 rounded-lg border border-[#3A3A36] bg-[#151613] px-2 text-xs text-[#F0F0EC]">
          {["Todos", "Aplicado", "Por asignar", "Por revisar", "No corresponde", "Sin pago"].map((e) => <option key={e} value={e}>{e === "Todos" ? "Todos los estados" : e === "Sin pago" ? "Sin pago (cancelado o vencido)" : e}</option>)}
        </select>
        <label className="sr-only" htmlFor="h-buscar">Buscar</label>
        <input id="h-buscar" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cliente, cédula, PL, orden, pedido o monto"
          className="h-8 min-w-[220px] flex-1 rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 text-xs text-[#F0F0EC]" />
        <button type="button" className={btn} onClick={descargar} disabled={!filas.length}><Download size={13} aria-hidden /> Descargar Excel</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#3A3A36] bg-[#1E1F1C]">
        <table className="w-full border-collapse text-xs tabular-nums">
          <thead>
            <tr className="text-left text-[#B5B5AE]">
              {["Hora", "Código", "Pasarela", "Pagó", "Aplicado a", "Monto", "Comisión", "Neto", "Estado", "Finanzas"].map((h, i) => (
                <th key={h} className={`whitespace-nowrap border-b border-[#3A3A36] px-2.5 py-2 font-semibold ${i >= 5 && i <= 7 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className="px-2.5 py-5 text-center text-[#B5B5AE]">Sin pagos en este periodo.</td></tr>}
            {filas.map((f) => (
              <FilaHistorial key={f.codigo} f={f} hoy={datos.hoy} abierta={abierta === f.codigo} onToggle={() => setAbierta(abierta === f.codigo ? null : f.codigo)} />
            ))}
          </tbody>
        </table>
      </div>
      <span className="text-xs text-[#B5B5AE]">Toca una fila para ver qué pasó paso a paso.</span>
    </div>
  );
}

function FilaHistorial({ f, hoy, abierta, onToggle }: { f: FilaPago; hoy: string; abierta: boolean; onToggle: () => void }) {
  const td = "whitespace-nowrap border-b border-[#2C2D29] px-2.5 py-2";
  const conPago = f.tarifa != null && !!f.pagadoEn;
  const pasos: Array<{ t: string; hecho: boolean; cuando?: string }> = [
    { t: f.origen === "Sin referencia" ? "Llegó sin referencia" : `Se abrió el cobro (${f.pasarela === "DeUna" ? "QR / enlace DeUna" : "cajita PayPhone"})`, hecho: true, cuando: f.creado },
    { t: `Pagado y confirmado con ${f.pasarela}`, hecho: !!f.pagadoEn, cuando: f.pagadoEn },
    ...(f.asignadoPor ? [{ t: `${f.estado === "No corresponde" ? "Marcado «No corresponde»" : "Asignado"} por ${f.asignadoPor}`, hecho: true, cuando: f.asignadoEn }] : []),
    { t: f.cuenta ? `Abono registrado en ${f.cuenta}` : "Abono", hecho: f.conAbono },
    { t: f.finanzas === "Acreditado" ? "Acreditado en SGINGRESOS" : "Por acreditar en Finanzas", hecho: f.finanzas === "Acreditado" },
  ];
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-[#252622]" aria-expanded={abierta}>
        <td className={td}>{hora(f.pagadoEn || f.creado, hoy)}</td>
        <td className={td}>{f.codigo}</td>
        <td className={td}><Chip pasarela={f.pasarela} ambiente={f.ambiente} /></td>
        <td className={td}>{f.pagador || "—"}</td>
        <td className={td}>{f.cuenta || "—"}</td>
        <td className={`${td} text-right`}>{usd(f.monto)}</td>
        <td className={`${td} text-right`}>{conPago ? usd(f.tarifa) : "—"}</td>
        <td className={`${td} text-right`}>{conPago ? usd(f.neto) : "—"}</td>
        <td className={td}><ChipEstado f={f} hoy={hoy} /></td>
        <td className={td}>{f.finanzas ? <span className={`${chip} ${f.finanzas === "Acreditado" ? "bg-[#56E3A4]/[0.12] text-[#56E3A4]" : "bg-[#2A2B27] text-[#B5B5AE]"}`}>{f.finanzas}</span> : "—"}</td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={10} className="border-b border-[#2C2D29] bg-[#171814] px-4 py-3">
            <div className="flex flex-wrap gap-6">
              <ol className="flex flex-col gap-1.5">
                {pasos.map((p, i) => (
                  <li key={i} className="grid grid-cols-[14px_1fr] items-start gap-2">
                    <span className={`mt-[3px] h-2.5 w-2.5 rounded-full ${p.hecho ? "bg-[#56E3A4]" : "bg-[#3A3A36]"}`} aria-hidden />
                    <span className={p.hecho ? "" : "text-[#B5B5AE]"}>{p.t}{p.cuando ? <span className="text-[#B5B5AE]"> · {fechaHoraEcuador(p.cuando)}</span> : null}</span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col gap-1 text-[#B5B5AE]">
                {f.referencia && <span>{f.pasarela === "DeUna" ? "Transferencia" : "Autorización"}: {f.referencia}</span>}
                {f.cedula && <span>Cédula: {f.cedula}</span>}
                {f.detalle && <span className="max-w-[520px] whitespace-normal">{f.detalle}</span>}
                {f.destino && <Link href={urlCuenta(f.destino)} className="text-[#D7FF4F] underline">Abrir {f.cuenta || "la cuenta"}</Link>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Cierre del día (Administradores) ───────────────────────────────────────

function sumarDias(fecha: string, n: number): string {
  return new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
function fechaLarga(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return d.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function Cierre({ hoy, onAviso }: { hoy: string; onAviso: (t: string) => void }) {
  const [fecha, setFecha] = useState(hoy);
  const [d, setD] = useState<DatosCierre | null>(null);
  const [error, setError] = useState("");
  const [acreditando, setAcreditando] = useState<Pasarela | null>(null);
  const [confirmar, setConfirmar] = useState<Pasarela | null>(null);

  const cargar = useCallback(async () => {
    setD(null);
    try {
      const r = await fetch(`/api/pagos-recibidos/cierre?fecha=${fecha}`, { cache: "no-store" });
      const j = (await r.json()) as { success: boolean; data?: DatosCierre; error?: string };
      if (j.success && j.data) { setD(j.data); setError(""); } else setError(j.error ?? "No se pudo calcular el cierre.");
    } catch { setError("Sin conexión."); }
  }, [fecha]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function acreditar(p: Pasarela) {
    setAcreditando(p); setConfirmar(null); setError("");
    const r = await enviar<{ acreditados: number; errores: string[] }>("/api/pagos-recibidos/acreditar-dia", { fecha, pasarela: p });
    setAcreditando(null);
    if (!r.ok) { setError(r.error); return; }
    onAviso(`${p}: ${r.data.acreditados} pago(s) acreditados en SGINGRESOS.${r.data.errores.length ? ` ${r.data.errores.length} no se pudieron: revísalos en Finanzas.` : ""}`);
    void cargar();
  }

  return (
    <div className="flex flex-col gap-3 animate-[sg-entrada_220ms_ease-out]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${btn} w-8 px-0`} aria-label="Día anterior" onClick={() => setFecha(sumarDias(fecha, -1))}><ChevronLeft size={14} /></button>
        <b className="first-letter:uppercase">{fechaLarga(fecha)}</b>
        <button type="button" className={`${btn} w-8 px-0`} aria-label="Día siguiente" disabled={fecha >= hoy} onClick={() => setFecha(sumarDias(fecha, 1))}><ChevronRight size={14} /></button>
        <span className="text-xs text-[#B5B5AE]">Compara el neto con lo que llegó al banco y acredítalo en Finanzas.</span>
      </div>
      {error && <p className="text-xs text-[#FF7A70]">{error}</p>}
      {!d && !error && <div className="h-40 animate-pulse rounded-xl bg-[#1E1F1C]" />}
      {d && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
          {d.pasarelas.map((c) => {
            const pend = d.pendientes[c.pasarela];
            return (
              <section key={c.pasarela} className="flex flex-col gap-1.5 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-3.5 tabular-nums">
                <div className="flex items-center gap-2"><Chip pasarela={c.pasarela} /><span className="text-xs text-[#B5B5AE]">{c.pasarela === "DeUna" ? "deposita al cierre del día en SGINGRESOS" : "deposita según su calendario"}</span></div>
                <Linea izq={<>Cobrado <span className="text-xs text-[#B5B5AE]">· {c.pagos} pagos</span></>} der={usd(c.cobrado)} />
                <Linea izq={<>Comisión <span className="text-xs text-[#B5B5AE]">· {c.pasarela === "DeUna" ? "2 % + IVA 15 % = 2,30 %" : "5,75 % (Saldo PayPhone 0 %)"}</span></>} der={`−${usd(c.comision)}`} />
                <Linea izq="Neto que debe llegar" der={<span className="text-[#D7FF4F]">{usd(c.neto)}</span>} />
                <Linea izq={<span className="text-xs text-[#B5B5AE]">{c.acreditados} acreditados · {c.porAcreditar} por acreditar</span>} der="" />
                {pend.cantidad > 0 && (
                  <Linea izq={<span className="text-xs text-[#B5B5AE]">{pend.cantidad} pago(s) por asignar o revisar ({usd(pend.monto)}) no están en esta cuenta</span>} der={<span className={`${chip} bg-[#FFB547]/[0.13] text-[#FFB547]`}>asígnalos primero</span>} />
                )}
                {confirmar === c.pasarela ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-[#3A3A36] bg-[#171814] p-2.5">
                    <span className="text-xs">¿Llegaron {usd(c.neto)} al banco? Se acreditan {c.porAcreditar} pago(s) a SGINGRESOS.</span>
                    <button type="button" className={btnMain} onClick={() => void acreditar(c.pasarela)}>Sí, acreditar</button>
                    <button type="button" className={btn} onClick={() => setConfirmar(null)}>Cancelar</button>
                  </div>
                ) : (
                  <button type="button" className={`${c.pasarela === "DeUna" ? btnMain : btn} mt-1.5 h-9`} disabled={!c.porAcreditar || acreditando !== null}
                    onClick={() => setConfirmar(c.pasarela)}>
                    {acreditando === c.pasarela ? "Acreditando…" : c.porAcreditar ? "Acreditar el día en Finanzas" : "Nada por acreditar"}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Linea({ izq, der }: { izq: React.ReactNode; der: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-t border-[#2C2D29] py-1.5 first-of-type:border-t-0">
      <span>{izq}</span><b>{der}</b>
    </div>
  );
}
