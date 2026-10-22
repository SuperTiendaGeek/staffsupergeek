"use client";

// Cuadrar las unidades de un asunto de Revisión (punto 10c-4, 22-oct-2026).
// El Staff anota cuántas hay en la tienda; el Administrador aplica: el sistema
// calcula la diferencia y, si no cuadra, se elige qué pasó (cada causa tiene
// una corrección fija) y se escribe el motivo.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import type { ShippingV2AsuntoRevision } from "@/lib/shipping-v2/airtable";
import { causasPara, diferenciaCuadre, EFECTO_CAUSA, planCuadre, TEXTO_CAUSA, type CausaCuadre, type DatosCuadre } from "@/lib/shipping-v2/cuadre";

type Props = {
  asunto: ShippingV2AsuntoRevision;
  esAdministrador: boolean;
  onAnotado: (a: ShippingV2AsuntoRevision) => void;
  /** Devuelve los asuntos abiertos tras aplicar (la lista se pone al día y la fila sale). */
  onAplicado: (abiertos: ShippingV2AsuntoRevision[]) => void;
  onCerrar: () => void;
};

const campo = "h-7 rounded-lg border border-[#3A3B35] bg-[#151515] px-2.5 text-[12px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/60";
const paso = "flex h-7 w-7 items-center justify-center rounded-md border border-[#3A3B35] bg-[#1A1B17] text-[#EDEDE7] transition active:scale-95 disabled:opacity-40";
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function CuadrePanel({ asunto, esAdministrador, onAnotado, onAplicado, onCerrar }: Props) {
  const itemId = asunto.itemIds[0] ?? "";
  const [datos, setDatos] = useState<DatosCuadre | null>(null);
  const [error, setError] = useState("");
  const [n, setN] = useState<number | null>(asunto.contado);
  const [causa, setCausa] = useState<CausaCuadre | "">("");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!esAdministrador || !itemId) return;
    let vivo = true;
    fetch(`/api/shipping-v2/control/revision/cuadre?itemId=${encodeURIComponent(itemId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (!j.success) throw new Error(j.error || "No se pudo leer el artículo.");
        setDatos(j.data.datos);
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo leer el artículo."));
    return () => {
      vivo = false;
    };
  }, [esAdministrador, itemId]);

  const diferencia = datos && n !== null ? diferenciaCuadre(datos, n) : 0;
  const causas = causasPara(diferencia);
  useEffect(() => {
    if (causa && !causas.includes(causa)) setCausa("");
  }, [causa, causas]);
  const plan = useMemo(() => (datos && n !== null ? planCuadre(datos, { n, causa }) : null), [datos, n, causa]);

  async function anotar() {
    if (n === null) return;
    setOcupado(true);
    setError("");
    try {
      const r = await fetch(`/api/shipping-v2/control/revision/${asunto.id}/contado`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "No se pudo anotar.");
      onAnotado(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anotar.");
    } finally {
      setOcupado(false);
    }
  }

  async function aplicar() {
    if (n === null) return;
    setOcupado(true);
    setError("");
    try {
      const r = await fetch(`/api/shipping-v2/control/revision/${asunto.id}/cuadrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, n, causa, motivo }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "No se pudo aplicar.");
      onAplicado(j.data.abiertos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar.");
      setOcupado(false);
    }
  }

  const valor = n ?? "";
  return (
    <form
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pb-2 text-[12px] animate-[sg-entrada_160ms_ease-out]"
      onSubmit={(e) => {
        e.preventDefault();
        if (esAdministrador) {
          if (plan?.ok && motivo.trim().length >= 5) void aplicar();
        } else void anotar();
      }}
    >
      <span className="text-[#8F908A]">En la tienda hay</span>
      <span className="flex items-center gap-1">
        <button type="button" onClick={() => setN((x) => Math.max(0, (x ?? 0) - 1))} disabled={ocupado || !n} aria-label="Uno menos" className={paso}><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button>
        <input
          autoFocus
          value={valor}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d]/g, "");
            setN(t === "" ? null : Math.min(9999, Number(t)));
          }}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          placeholder="¿?"
          aria-label="Cuántas hay en la tienda"
          className="h-7 w-12 rounded-md border border-[#3A3B35] bg-[#11120F] text-center text-[12.5px] text-[#EDEDE7] focus:border-[#D7FF4F]/60 focus:outline-none"
        />
        <button type="button" onClick={() => setN((x) => (x ?? 0) + 1)} disabled={ocupado} aria-label="Uno más" className={paso}><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
      </span>
      {asunto.contado !== null && asunto.contadoPor ? (
        <span className="text-[#8F908A]" title={asunto.fechaConteo}>contó {asunto.contadoPor}: {asunto.contado}</span>
      ) : null}

      {!esAdministrador ? (
        <>
          <button type="submit" disabled={ocupado || n === null} className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#D7FF4F] px-2.5 font-bold text-[#141510] disabled:opacity-50">
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Anotar
          </button>
          <span className="text-[#8F908A]">El Administrador lo aplica.</span>
        </>
      ) : !datos ? (
        error ? null : <span className="inline-flex items-center gap-1.5 text-[#8F908A]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Leyendo…</span>
      ) : n === null ? null : (
        <>
          {diferencia !== 0 ? (
            <>
              <span className={diferencia > 0 ? "text-[#FFB07A]" : "text-[#FFC857]"}>
                {diferencia > 0 ? `${plural(diferencia, "falta", "faltan")}:` : `${plural(-diferencia, "sobra", "sobran")}:`}
              </span>
              <select value={causa} onChange={(e) => setCausa(e.target.value as CausaCuadre | "")} disabled={ocupado} aria-label="Qué pasó" title={causa ? EFECTO_CAUSA[causa] : undefined} className={`${campo} max-w-[250px] ${causa ? "border-[#D7FF4F]/50" : ""}`}>
                <option value="">¿Qué pasó?</option>
                {causas.map((c) => (
                  <option key={c} value={c}>{TEXTO_CAUSA[c]}</option>
                ))}
              </select>
            </>
          ) : null}
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (ej.: facturada en el sistema anterior)"
            aria-label="Motivo"
            maxLength={500}
            disabled={ocupado}
            className={`${campo} min-w-[160px] flex-1`}
          />
          <button
            type="submit"
            disabled={ocupado || !plan?.ok || motivo.trim().length < 5}
            title={plan?.ok ? plan.texto : undefined}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#D7FF4F] px-2.5 font-bold text-[#141510] disabled:opacity-50"
          >
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            {ocupado ? "Aplicando…" : "Aplicar"}
          </button>
        </>
      )}
      <button type="button" onClick={onCerrar} disabled={ocupado} className="text-[#8F908A] hover:text-[#EDEDE7]">Cancelar</button>
      {esAdministrador && plan ? (
        <span className={`basis-full text-[11.5px] ${plan.ok ? "text-[#B4B5AC]" : "text-[#FFB07A]"}`}>
          {plan.ok ? `${plan.texto}${causa ? ` ${EFECTO_CAUSA[causa]}` : ""}` : diferencia !== 0 && !causa ? "" : plan.motivo}
        </span>
      ) : null}
      {error ? <span className="basis-full text-[11.5px] text-[#FFB07A]">{error}</span> : null}
    </form>
  );
}
