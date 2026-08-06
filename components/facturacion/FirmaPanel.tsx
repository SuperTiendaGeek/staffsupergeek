"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Pantalla de administración de la firma electrónica.
//
// Muestra con qué firma se está emitiendo AHORA MISMO (venga de Airtable o de
// las variables de entorno), cuánto le queda, y permite cargar una nueva.
//
// El .p12 nunca se sube a esta pantalla en claro más de lo imprescindible: se
// lee en el navegador, se manda en base64 al servidor por HTTPS, y el servidor
// lo guarda cifrado. La contraseña no se guarda en el navegador ni se muestra.

type EnUso = {
  origen: string;
  titular?: string;
  emisor?: string;
  identificacion?: string;
  validoDesde?: string;
  validoHasta?: string;
  diasRestantes?: number;
  nivel?: string;
  mensaje?: string;
};

type FirmaHistorial = {
  recordId: string;
  nombre: string;
  titularEmisor: string;
  estado: string;
  validoHasta: string | null;
  subidoPor: string;
  fechaSubida: string | null;
};

type Estado = {
  enUso: EnUso | null;
  errorEnUso: string | null;
  activa: { nombre: string; titularEmisor: string; subidoPor: string; fechaSubida: string | null } | null;
  historial: FirmaHistorial[];
};

const NIVEL_ESTILO: Record<string, { caja: string; punto: string; texto: string; etiqueta: string }> = {
  vigente:      { caja: "border-emerald-700/50 bg-emerald-950/30", punto: "bg-emerald-400", texto: "text-emerald-300", etiqueta: "VIGENTE" },
  "por-vencer": { caja: "border-amber-700/50 bg-amber-950/30",     punto: "bg-amber-400",   texto: "text-amber-300",   etiqueta: "POR VENCER" },
  critica:      { caja: "border-red-700/60 bg-red-950/30",         punto: "bg-red-400",     texto: "text-red-300",     etiqueta: "CRÍTICA" },
  vencida:      { caja: "border-neutral-600 bg-neutral-900/60",    punto: "bg-neutral-400", texto: "text-neutral-300", etiqueta: "VENCIDA" },
};

const BADGE_ESTADO: Record<string, string> = {
  Activa:                    "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  Revocada:                  "bg-neutral-800 text-neutral-400 border-neutral-700",
  Expirada:                  "bg-red-900/30 text-red-300 border-red-800/50",
  "Pendiente de activación":  "bg-amber-900/30 text-amber-300 border-amber-800/50",
};

function fecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

export function FirmaPanel() {
  const [estado, setEstado]     = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [archivo, setArchivo]   = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string; aviso?: string | null } | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  function cargar() {
    setCargando(true);
    setError(null);
    fetch("/api/facturacion/firma")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setEstado(j.data);
        else setError(j.error ?? "No se pudo cargar el estado de la firma");
      })
      .catch(() => setError("No se pudo conectar con el servidor"))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function subir() {
    if (!archivo || !password) return;
    setSubiendo(true);
    setResultado(null);

    try {
      const buffer = await archivo.arrayBuffer();
      // btoa no acepta binario directo: se pasa byte a byte.
      let binario = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
      const p12Base64 = btoa(binario);

      const r = await fetch("/api/facturacion/firma", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ nombre: archivo.name, p12Base64, password }),
      });
      const j = await r.json();

      if (!j.success) {
        setResultado({ ok: false, texto: j.error ?? "No se pudo cargar la firma" });
      } else {
        setResultado({
          ok: true,
          texto: `Firma activada: ${j.data.titular} (${j.data.emisor}). Vence el ${fecha(j.data.validoHasta)} — ${j.data.diasRestantes} días.`,
          aviso: j.data.aviso,
        });
        setArchivo(null);
        setPassword("");
        setConfirmando(false);
        cargar();
      }
    } catch {
      setResultado({ ok: false, texto: "No se pudo leer el archivo o conectar con el servidor" });
    } finally {
      setSubiendo(false);
    }
  }

  const enUso  = estado?.enUso;
  const nivel  = enUso?.nivel ?? "vigente";
  const estilo = NIVEL_ESTILO[nivel] ?? NIVEL_ESTILO.vigente;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-[#F5F5F5]">Firma electrónica</h1>
          <p className="text-sm text-[#666] mt-0.5">Certificado con el que se firman las facturas y notas de crédito</p>
        </div>
        <Link
          href="/facturacion/historial"
          className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]"
        >
          ← Facturas
        </Link>
      </div>

      {cargando && <p className="text-sm text-[#A7A7A7]">Cargando…</p>}
      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>
      )}

      {estado && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* ── Estado actual ─────────────────────────────────────────── */}
          <div className={`lg:col-span-2 rounded-xl border p-5 ${estilo.caja}`}>
            {estado.errorEnUso ? (
              <>
                <p className="text-sm font-bold text-red-300">No hay ninguna firma utilizable</p>
                <p className="text-sm text-[#A7A7A7] mt-1">{estado.errorEnUso}</p>
              </>
            ) : !enUso?.titular ? (
              <p className="text-sm text-[#A7A7A7]">
                Hay una firma configurada, pero no se pudieron leer sus datos.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${estilo.punto}`} />
                  <span className={`text-xs font-bold tracking-wider ${estilo.texto}`}>{estilo.etiqueta}</span>
                  <span className="text-[10px] text-[#666] uppercase tracking-wider ml-2">
                    origen: {enUso.origen === "airtable" ? "cargada desde el portal" : "variables de entorno"}
                  </span>
                </div>

                <p className="text-base font-bold text-[#F5F5F5]">{enUso.titular}</p>
                <p className="text-sm text-[#A7A7A7]">{enUso.emisor}</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
                  <div>
                    <p className="text-[10px] text-[#666] uppercase tracking-wider">Identificación</p>
                    <p className="text-[#F5F5F5] font-mono text-xs mt-0.5">{enUso.identificacion || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#666] uppercase tracking-wider">Válido desde</p>
                    <p className="text-[#F5F5F5] text-xs mt-0.5">{fecha(enUso.validoDesde)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#666] uppercase tracking-wider">Válido hasta</p>
                    <p className="text-[#F5F5F5] text-xs mt-0.5">{fecha(enUso.validoHasta)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#666] uppercase tracking-wider">Días restantes</p>
                    <p className={`text-lg font-bold leading-none mt-1 ${estilo.texto}`}>{enUso.diasRestantes}</p>
                  </div>
                </div>

                {enUso.mensaje && nivel !== "vigente" && (
                  <p className={`text-sm mt-4 ${estilo.texto}`}>{enUso.mensaje}</p>
                )}
              </>
            )}
          </div>

          {/* ── Cargar nueva ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-[#3A3A36] bg-[#212220] p-5">
            <h2 className="text-sm font-bold text-[#F5F5F5] mb-1">Cargar firma nueva</h2>
            <p className="text-xs text-[#A7A7A7] mb-4">
              El archivo <span className="font-mono">.p12</span> que te entregó la entidad certificadora,
              con la contraseña que definiste al descargarlo.
            </p>

            <label className="block text-[10px] text-[#666] uppercase tracking-wider mb-1">Certificado</label>
            <input
              type="file"
              accept=".p12,.pfx"
              onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setResultado(null); setConfirmando(false); }}
              className="w-full text-xs text-[#A7A7A7] mb-3 file:mr-3 file:rounded-full file:border-0 file:bg-[#3A3A36] file:px-3 file:py-1.5 file:text-xs file:text-[#F5F5F5] hover:file:bg-[#4A4A46]"
            />

            <label className="block text-[10px] text-[#666] uppercase tracking-wider mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(e) => { setPassword(e.target.value); setResultado(null); setConfirmando(false); }}
              placeholder="Contraseña del certificado"
              className="w-full rounded-lg bg-[#252622] border border-[#3A3A36] px-3 py-2 text-sm text-[#F5F5F5] mb-4"
            />

            {!confirmando ? (
              <button
                onClick={() => setConfirmando(true)}
                disabled={!archivo || !password}
                className="w-full rounded-full bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cargar y activar
              </button>
            ) : (
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3">
                <p className="text-xs text-amber-200 mb-3">
                  A partir de ahora, todas las facturas y notas de crédito se firmarán con este
                  certificado. La firma anterior queda revocada. ¿Continuar?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={subir}
                    disabled={subiendo}
                    className="flex-1 rounded-full bg-[#D7FF4F] px-3 py-1.5 text-xs font-bold text-[#151515] hover:brightness-105 disabled:opacity-40"
                  >
                    {subiendo ? "Verificando…" : "Sí, activar"}
                  </button>
                  <button
                    onClick={() => setConfirmando(false)}
                    disabled={subiendo}
                    className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs text-[#A7A7A7] hover:text-[#F5F5F5]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {resultado && (
              <div
                className={`mt-4 rounded-lg border p-3 text-xs ${
                  resultado.ok
                    ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-200"
                    : "border-red-800/50 bg-red-950/30 text-red-300"
                }`}
              >
                <p>{resultado.texto}</p>
                {resultado.aviso && <p className="mt-2 text-amber-300">{resultado.aviso}</p>}
              </div>
            )}
          </div>

          {/* ── Historial ─────────────────────────────────────────────── */}
          <div className="lg:col-span-3">
            <h2 className="text-sm font-bold text-[#F5F5F5] mb-2">Historial</h2>
            {estado.historial.length === 0 ? (
              <p className="text-sm text-[#A7A7A7]">
                Todavía no se ha cargado ninguna firma desde el portal. La que está en uso viene
                de las variables de entorno del servidor.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#3A3A36]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-[#666] uppercase tracking-wider border-b border-[#3A3A36] bg-[#151614]">
                      <th className="py-2 px-3 text-left">Subida</th>
                      <th className="py-2 px-3 text-left">Archivo</th>
                      <th className="py-2 px-3 text-left">Titular / Emisor</th>
                      <th className="py-2 px-3 text-left">Válido hasta</th>
                      <th className="py-2 px-3 text-left">Subido por</th>
                      <th className="py-2 px-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estado.historial.map((f) => (
                      <tr key={f.recordId} className="border-b border-[#2A2B28] hover:bg-[#1F201C]">
                        <td className="py-2 px-3 text-[#A7A7A7] text-xs">{fecha(f.fechaSubida)}</td>
                        <td className="py-2 px-3 text-[#F5F5F5] font-mono text-xs">{f.nombre}</td>
                        <td className="py-2 px-3 text-[#F5F5F5] text-xs">{f.titularEmisor}</td>
                        <td className="py-2 px-3 text-[#A7A7A7] text-xs">{fecha(f.validoHasta)}</td>
                        <td className="py-2 px-3 text-[#A7A7A7] text-xs">{f.subidoPor}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${BADGE_ESTADO[f.estado] ?? ""}`}>
                            {f.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-[#666] mt-3">
              El certificado y su contraseña se guardan cifrados. Desde esta pantalla no se pueden
              descargar ni ver — solo reemplazar por uno nuevo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
