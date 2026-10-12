"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import type { VistaNovedadPorEnlace } from "@/lib/shipping-v2/airtable";

// Vista del proveedor al pulsar RESPONDER en el correo. Qué se puede hacer lo
// decide el servidor; aquí solo se muestra la novedad y se envía la respuesta.

const FMT = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
function fecha(iso: string) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? FMT.format(new Date(t)) : "";
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#1B1B1B] px-4 pb-12 pt-5 text-[#F5F5F5]">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="flex items-center gap-3">
          <Image src="/logo-brand.png" alt="SUPER GEEK" width={36} height={36} className="rounded-lg bg-white p-1" priority />
          <div>
            <p className="text-sm font-black tracking-wide text-[#D7FF4F]">SUPER GEEK</p>
            <p className="text-[11px] text-[#8A8A80]">Novedad de un artículo</p>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className="rounded-2xl border border-[#3A3A36] bg-[#242422] p-4">
      <p className="text-base font-bold">{titulo}</p>
      <p className="mt-1 text-sm text-[#C9C9C4]">{texto}</p>
    </section>
  );
}

export function NovedadProveedorClient({ token }: { token: string }) {
  const api = `/api/publico/novedad/${encodeURIComponent(token)}`;
  const [vista, setVista] = useState<VistaNovedadPorEnlace | null>(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [texto, setTexto] = useState("");
  const [propuesta, setPropuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [listo, setListo] = useState(false);

  const cargar = useCallback(async () => {
    setErrorCarga("");
    try {
      const r = await fetch(api, { cache: "no-store" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "No pudimos cargar la novedad.");
      setVista(j.data as VistaNovedadPorEnlace);
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No pudimos cargar la novedad.");
    }
  }, [api]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function enviar() {
    setEnviando(true);
    setErrorEnvio("");
    try {
      const r = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, propuesta: propuesta || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.success) { setErrorEnvio(j.error || "No pudimos guardar su respuesta."); return; }
      setListo(true);
    } catch {
      setErrorEnvio("No pudimos guardar su respuesta. Revise su conexión e intente de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (errorCarga) {
    return <Marco><Aviso titulo="No pudimos abrir la novedad" texto={errorCarga} /><button type="button" onClick={() => void cargar()} className="rounded-xl border border-[#3A3A36] px-4 py-2 text-sm">Reintentar</button></Marco>;
  }
  if (!vista) return <Marco><p className="text-sm text-[#A7A7A7]">Cargando…</p></Marco>;
  if (listo) {
    return <Marco><Aviso titulo="¡Gracias! Recibimos su respuesta." texto="La revisaremos y le escribiremos por este mismo medio. Este enlace ya no se puede volver a usar." /></Marco>;
  }
  if (vista.estado === "no-existe") {
    return <Marco><Aviso titulo="Este enlace ya no es válido" texto="Si ya respondió, su respuesta quedó registrada. Si recibió un correo más reciente, use el botón de ese correo." /></Marco>;
  }
  if (vista.estado === "vencido") {
    return <Marco><Aviso titulo="Este enlace venció" texto="Los enlaces duran 7 días. Puede responder desde el portal de proveedores o contestar nuestro correo." /></Marco>;
  }
  if (vista.estado === "sin-turno") {
    return <Marco><Aviso titulo={`Novedad ${vista.novedadId}`} texto="Esta novedad ya no espera su respuesta. Gracias." /></Marco>;
  }
  if (vista.estado !== "vigente") return null;

  const largo = texto.trim().length;
  const puedeEnviar = largo >= 5 && !enviando;

  return (
    <Marco>
      <section className="rounded-2xl border border-[#3A3A36] bg-[#242422] p-4">
        <p className="text-[11px] uppercase tracking-wide text-[#8A8A80]">{vista.novedadId} · registrada el {fecha(vista.fechaRegistro)}</p>
        <p className="mt-1 text-base font-bold">{vista.sku ? `${vista.sku} · ` : ""}{vista.articulo || "Artículo"}</p>
        <p className="mt-1 inline-block rounded-full border border-[#D7FF4F]/40 bg-[#D7FF4F]/10 px-2 py-0.5 text-[11px] font-bold text-[#D7FF4F]">{vista.tipo}</p>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8A8A80]">Conversación</p>
        {vista.hilo.map((m, i) => (
          <div key={`${m.fecha}-${i}`} className={`rounded-xl border p-3 text-sm ${m.lado === "proveedor" ? "ml-6 border-[#3A3A36] bg-[#1F1F1D]" : "mr-6 border-[#D7FF4F]/25 bg-[#D7FF4F]/[0.06]"}`}>
            <p className="text-[11px] text-[#8A8A80]">{m.autor}{m.fecha ? ` · ${fecha(m.fecha)}` : ""}</p>
            <p className="mt-0.5 whitespace-pre-wrap text-[#F0F0EC]">{m.texto}</p>
          </div>
        ))}
      </section>

      {vista.evidencias.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#8A8A80]">Fotos y archivos</p>
          <div className="grid grid-cols-3 gap-2">
            {vista.evidencias.map((ev, i) => (
              <a key={`${ev.url}-${i}`} href={ev.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-[#3A3A36] bg-[#242422]">
                {ev.esImagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ev.miniatura} alt={ev.nombre} className="aspect-square w-full object-cover" />
                ) : (
                  <span className="flex aspect-square items-center justify-center p-2 text-center text-[11px] text-[#C9C9C4]">{ev.nombre}</span>
                )}
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-[#3A3A36] bg-[#242422] p-4">
        <p className="text-sm font-bold">Su respuesta</p>
        <label className="block">
          <span className="text-xs text-[#A7A7A7]">Propuesta para resolverla (opcional)</span>
          <select value={propuesta} onChange={(e) => setPropuesta(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#1B1B1B] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F] focus:outline-none">
            <option value="">Sin propuesta por ahora</option>
            {vista.propuestas.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-[#A7A7A7]">Mensaje</span>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 4000))} rows={5}
            placeholder="Escriba aquí su respuesta…"
            className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#1B1B1B] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F] focus:outline-none" />
          {largo < 5 && <span className="text-[11px] text-[#8A8A80]">Faltan {5 - largo} caracteres.</span>}
        </label>
        {errorEnvio && <p className="text-sm text-red-200">{errorEnvio}</p>}
        <button type="button" onClick={enviar} disabled={!puedeEnviar}
          className="w-full rounded-xl bg-[#D7FF4F] px-4 py-3 text-sm font-black text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">
          {enviando ? "Enviando…" : "Enviar respuesta"}
        </button>
        <p className="text-[11px] text-[#8A8A80]">Este enlace es personal, vence el {fecha(vista.vence)} y deja de funcionar al enviar su respuesta.</p>
      </section>
    </Marco>
  );
}
