"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PESTANAS_PANEL, type EstadoPanel, type FilaGarantia, type ResumenPanel } from "@/lib/garantias/panel";
import { fechaCorta } from "@/lib/garantias/plazos";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";

// Técnicos → Garantías (auditoría ops, punto 20). Una fila por garantía; la
// pestaña "Por confirmar" es la bandeja del administrador.

type Datos = { filas: FilaGarantia[]; resumen: ResumenPanel; mes: string };

const mon = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const CHIP: Record<EstadoPanel, { texto: string; clase: string }> = {
  por_confirmar: { texto: "Por confirmar", clase: "border-[var(--sg-warning)] bg-[var(--sg-warning-soft)] text-[var(--sg-warning)]" },
  en_curso: { texto: "En curso", clase: "border-[var(--sg-info)]/50 bg-[var(--sg-info-soft)] text-[var(--sg-info)]" },
  entregada: { texto: "Entregada", clase: "border-[var(--sg-success)] bg-[var(--sg-success-soft)] text-[var(--sg-success)]" },
  quitada: { texto: "Quitada", clase: "border-[var(--sg-border)] text-[var(--sg-text-muted)]" },
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function GarantiasPageClient() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<EstadoPanel | "todas">("por_confirmar");
  const [q, setQ] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch("/api/tecnicos/garantias", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (!vivo) return; if (j.success) { setDatos(j.data); if (!j.data.resumen.porConfirmar) setPestana("en_curso"); } else setError(j.error ?? "No se pudieron leer las garantías."); })
      .catch(() => vivo && setError("Error de red"));
    return () => { vivo = false; };
  }, []);

  const conteo = useMemo(() => {
    const c: Record<string, number> = { todas: datos?.filas.length ?? 0 };
    for (const f of datos?.filas ?? []) c[f.estado] = (c[f.estado] ?? 0) + 1;
    return c;
  }, [datos]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.filas ?? [])
      .filter((f) => pestana === "todas" || f.estado === pestana)
      .filter((f) => !t || [f.ordenCodigo, f.cliente, f.descripcion, f.sku, f.garantiaDe, f.motivo].join(" ").toLowerCase().includes(t));
  }, [datos, pestana, q]);

  const r = datos?.resumen;
  const nombreMes = datos ? MESES[Number(datos.mes.slice(5, 7)) - 1] ?? datos.mes : "";

  return (
    <section className={`${styles.theme} space-y-3`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">Técnicos</p>
          <h1 className="text-lg font-bold text-[var(--sg-text-primary)]">Garantías SUPER GEEK</h1>
        </div>
        {r && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Cifra etiqueta="Por confirmar" valor={String(r.porConfirmar)} alerta={r.porConfirmar > 0} />
            <Cifra etiqueta="En curso" valor={String(r.enCurso)} />
            <Cifra etiqueta={`Entregadas en ${nombreMes}`} valor={String(r.entregadasMes)} />
            <Cifra etiqueta={`Costo de ${nombreMes}`} valor={mon(r.costoMes)} />
            <Cifra etiqueta="Cortesías del mes" valor={String(r.cortesiasMes)} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PESTANAS_PANEL.map((p) => (
          <button key={p.clave} type="button" onClick={() => setPestana(p.clave)}
            className={`h-7 rounded-full border px-3 text-xs font-semibold transition ${pestana === p.clave ? "border-[var(--sg-lime)] bg-[var(--sg-lime)] text-[var(--sg-text-on-accent)]" : "border-[var(--sg-border)] text-[var(--sg-text-secondary)] hover:border-[var(--sg-lime)]/60"}`}>
            {p.etiqueta} <span className="opacity-70">{conteo[p.clave] ?? 0}</span>
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar orden, cliente, pieza…"
          className="ml-auto h-8 w-56 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2.5 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] focus:border-[var(--sg-lime)] focus:outline-none" />
      </div>

      {error && <p className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] px-3 py-2 text-xs text-[var(--sg-danger)]">{error}</p>}

      <div className="overflow-x-auto rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)]">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-[var(--sg-border)] bg-[var(--sg-panel)] text-[10px] uppercase tracking-wider text-[var(--sg-text-muted)]">
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Orden · cliente</th>
              <th className="px-3 py-2 text-left">Garantía</th>
              <th className="px-3 py-2 text-left">De</th>
              <th className="px-3 py-2 text-left">Pieza retirada</th>
              <th className="px-3 py-2 text-right">Costo</th>
              <th className="px-3 py-2 text-left">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--sg-divider)]">
            {!datos && !error && <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--sg-text-muted)]">Cargando garantías…</td></tr>}
            {datos && visibles.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--sg-text-muted)]">{pestana === "por_confirmar" ? "No hay garantías esperando confirmación." : "Nada por aquí."}</td></tr>}
            {visibles.map((f) => (
              <tr key={f.lineaId} className={`animate-[sg-entrada_180ms_ease-out] ${f.estado === "quitada" ? "opacity-55" : ""}`}>
                <td className="whitespace-nowrap px-3 py-2 align-top text-[var(--sg-text-secondary)]">{f.fecha ? fechaCorta(f.fecha) : "—"}</td>
                <td className="px-3 py-2 align-top">
                  {f.ordenId
                    ? <Link href={`/tecnicos/ordenes/${encodeURIComponent(f.ordenId)}`} className="font-semibold text-[var(--sg-lime)] hover:underline">{f.ordenCodigo || "Orden"}</Link>
                    : <span className="text-[var(--sg-text-muted)]">—</span>}
                  <span className="block text-[11px] text-[var(--sg-text-muted)]">{f.cliente || "—"}{f.equipo ? ` · ${f.equipo}` : ""}</span>
                </td>
                <td className="px-3 py-2 align-top">
                  <span className="block text-[var(--sg-text-primary)]">{f.descripcion}{f.sku ? <span className="ml-1 font-mono text-[11px] text-[var(--sg-text-muted)]">{f.sku}</span> : null}</span>
                  <span className="block text-[11px] text-[var(--sg-text-muted)]">
                    {f.tipo}{f.motivo ? ` · ${f.motivo}` : ""}
                    {f.estado === "por_confirmar" && f.propuestaPor ? ` · propuso ${f.propuestaPor}` : f.confirmadaPor ? ` · confirmó ${f.confirmadaPor}` : ""}
                  </span>
                </td>
                <td className="px-3 py-2 align-top text-[11px] text-[var(--sg-text-secondary)]">
                  {f.cortesia && <span className="mr-1 inline-flex rounded-full border border-[var(--sg-warning)] bg-[var(--sg-warning-soft)] px-1.5 py-px text-[10px] font-semibold text-[var(--sg-warning)]">Cortesía</span>}
                  {f.garantiaDe || (f.cortesia ? "Sin documento" : "—")}
                </td>
                <td className="px-3 py-2 align-top text-[11px] text-[var(--sg-text-secondary)]">
                  {f.tipo !== "Repuesto" ? "—" : f.piezaRetiradaSku
                    ? <>Reclamo · <Link href="/shipping-v2/novedades" className="text-[var(--sg-lime)] hover:underline">{f.piezaRetiradaSku}</Link></>
                    : f.piezaRetirada || <span className="text-[var(--sg-warning)]">Falta elegir</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums text-[var(--sg-text-primary)]">{mon(f.costo)}</td>
                <td className="px-3 py-2 align-top">
                  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CHIP[f.estado].clase}`}>{CHIP[f.estado].texto}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cifra({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`rounded-[var(--sg-radius-md)] border px-3 py-1.5 text-right ${alerta ? "border-[var(--sg-warning)] bg-[var(--sg-warning-soft)]" : "border-[var(--sg-border)] bg-[var(--sg-panel)]"}`}>
      <p className="text-[10px] uppercase tracking-wide text-[var(--sg-text-muted)]">{etiqueta}</p>
      <p className={`font-bold tabular-nums ${alerta ? "text-[var(--sg-warning)]" : "text-[var(--sg-text-primary)]"}`}>{valor}</p>
    </div>
  );
}
