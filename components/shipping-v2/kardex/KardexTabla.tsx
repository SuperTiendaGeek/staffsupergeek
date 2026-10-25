"use client";

// Tabla del Kardex (punto 12): movimientos con saldo corrido. La usan la
// pestaña Kardex (Producto) y la ficha del artículo. Lo informativo (en
// camino, apartado, cambio de código) va en gris y no mueve el saldo.

import { Fragment, useMemo } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { conSaldo, gananciaDe, type MovimientoConSaldo, type MovimientoKardex } from "@/lib/shipping-v2/kardex";
import type { KardexInformativo } from "@/lib/shipping-v2/kardex-lectura";
import { cantidadTexto, dinero, fechaCorta, serieCorta, textoDocumento } from "./kardex-formato";
import { EnlaceDocumento } from "./EnlaceDocumento";

type Fila =
  | { clase: "mov"; fecha: string; orden: string; m: MovimientoConSaldo }
  | { clase: "info"; fecha: string; orden: string; i: KardexInformativo; saldo: number };

export function KardexTabla({
  movimientos,
  informativos = [],
  verCostos,
  mostrarInformativos = true,
  mostrarAjustesCosto = true,
  mostrarUnidad = true,
  codigos = {},
  cuadra,
  saldoInicial,
  vacio = "Todavía no hay movimientos.",
}: {
  movimientos: MovimientoKardex[];
  informativos?: KardexInformativo[];
  verCostos: boolean;
  mostrarInformativos?: boolean;
  mostrarAjustesCosto?: boolean;
  mostrarUnidad?: boolean;
  codigos?: Record<string, string>;
  /** true: ✓ cuadra · false: no cuadra · undefined: no se muestra. */
  cuadra?: boolean;
  /** Cuando se ve un periodo: lo que había antes de su primer día. */
  saldoInicial?: { fecha: string; cantidad: number; valor: number };
  vacio?: string;
}) {
  const { filas, entradas, salidas, saldo, saldoValor } = useMemo(() => {
    const conS = conSaldo(movimientos, saldoInicial ? { cantidad: saldoInicial.cantidad, valor: saldoInicial.valor } : undefined);
    const filas: Fila[] = conS
      .filter((m) => mostrarAjustesCosto || m.tipo !== "Costo")
      .map((m) => ({ clase: "mov" as const, fecha: m.fecha, orden: m.clave, m }));
    if (mostrarInformativos) {
      for (const i of informativos) {
        const previo = [...conS].reverse().find((m) => m.fecha <= i.fecha);
        filas.push({ clase: "info", fecha: i.fecha, orden: i.id, i, saldo: previo?.saldo ?? saldoInicial?.cantidad ?? 0 });
      }
    }
    filas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.orden < b.orden ? -1 : 1));
    const ultimo = conS[conS.length - 1];
    return {
      filas,
      entradas: conS.filter((m) => m.tipo === "Entrada").reduce((s, m) => s + m.cantidad, 0),
      salidas: conS.filter((m) => m.tipo === "Salida").reduce((s, m) => s - m.cantidad, 0),
      saldo: ultimo?.saldo ?? saldoInicial?.cantidad ?? 0,
      saldoValor: ultimo?.saldoValor ?? saldoInicial?.valor ?? 0,
    };
  }, [movimientos, informativos, mostrarInformativos, mostrarAjustesCosto, saldoInicial]);

  const th = "px-1.5 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] whitespace-nowrap";
  const thN = `${th} text-right`;
  const td = "px-1.5 py-1.5 align-top whitespace-nowrap";
  const tdN = `${td} text-right tabular-nums`;

  if (!filas.length && !saldoInicial) return <p className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-6 text-center text-[12.5px] text-[#8F908A]">{vacio}</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-[#30312D] bg-[#171814]">
      <table className="w-full min-w-[720px] border-collapse text-[12.5px] text-[#EDEDE7]">
        <thead className="border-b border-[#30312D]">
          <tr>
            <th className={th}>Fecha</th>
            <th className={th}>Motivo</th>
            {mostrarUnidad ? <th className={th}>Unidad</th> : null}
            <th className={th}>Documento</th>
            <th className={th}>Cliente / Prov.</th>
            <th className={thN}>Cant.</th>
            <th className={thN}>Saldo</th>
            {verCostos ? (
              <>
                <th className={thN}>Costo u.</th>
                <th className={thN}>Valor</th>
                <th className={thN}>Saldo $</th>
              </>
            ) : null}
            <th className={th}>Quién</th>
          </tr>
        </thead>
        <tbody>
          {saldoInicial ? (
            <tr className="border-b border-[#252622] bg-[#1D1E19] text-[#B4B5AC]">
              <td className={td}>{fechaCorta(saldoInicial.fecha, false)}</td>
              <td className={td} colSpan={mostrarUnidad ? 5 : 4}>Saldo anterior</td>
              <td className={`${tdN} font-semibold`}>{saldoInicial.cantidad}</td>
              {verCostos ? <><td className={tdN} /><td className={tdN} /><td className={`${tdN} font-semibold`}>{dinero(saldoInicial.valor)}</td></> : null}
              <td className={td} />
            </tr>
          ) : null}
          {filas.map((f) => {
            if (f.clase === "info") {
              const i = f.i;
              const doc = i.documento || codigos[i.documentoId] || i.documentoTipo || "";
              return (
                <tr key={f.orden} className="border-b border-[#252622] italic text-[#8F908A] animate-[sg-entrada_180ms_ease-out]">
                  <td className={td}>{fechaCorta(i.fecha)}</td>
                  <td className={td}>{i.texto}</td>
                  {mostrarUnidad ? <td className={td}>{i.serie ? serieCorta(i.serie) : i.cantidad > 1 ? `${i.cantidad} u.` : ""}</td> : null}
                  <td className={td}><EnlaceDocumento documentoTipo={i.documentoTipo} documentoId={i.documentoId} registroId={i.registroId} texto={doc} className="not-italic text-[#B4B5AC] hover:text-[#D7FF4F] hover:underline" apagado="" /></td>
                  <td className={`${td} max-w-[150px] truncate`}>{i.contraparte}</td>
                  <td className={tdN} />
                  <td className={tdN}>{f.saldo}</td>
                  {verCostos ? <><td className={tdN} /><td className={tdN} /><td className={tdN} /></> : null}
                  <td className={td}>{i.hechoPor.split(" ")[0]}</td>
                </tr>
              );
            }
            const m = f.m;
            const doc = textoDocumento(m, codigos);
            const ganancia = verCostos ? gananciaDe(m) : null;
            const esCosto = m.tipo === "Costo";
            const sub = [
              m.causa ? m.causa : "",
              ganancia !== null && m.precioVenta !== null ? `Precio ${dinero(m.precioVenta)} · gana ${dinero(ganancia)}` : "",
              esCosto || m.motivo === "Ajuste del Kardex" || m.motivo === "Vendida fuera del sistema" || m.motivo === "Salida interna" || m.motivo.startsWith("Pieza") ? m.nota : "",
            ].filter(Boolean).join(" · ");
            return (
              <tr key={f.orden} className={`border-b border-[#252622] animate-[sg-entrada_180ms_ease-out] ${esCosto ? "text-[#C9B6FF]" : ""}`}>
                <td className={td}>{fechaCorta(m.fecha)}</td>
                <td className={`${td} whitespace-normal`}>
                  <span className={m.tipo === "Traslado" ? "text-[#B4B5AC]" : ""}>{m.motivo}</span>
                  {sub ? <span className="block max-w-[240px] truncate text-[11px] text-[#8F908A]" title={sub}>{sub}</span> : null}
                </td>
                {mostrarUnidad ? <td className={`${td} font-mono text-[12px] text-[#C9CAC1]`} title={m.serie}>{m.serie ? serieCorta(m.serie) : ""}</td> : null}
                <td className={td}><EnlaceDocumento documentoTipo={m.documentoTipo} documentoId={m.documentoId} registroId={m.registroId} texto={doc} /></td>
                <td className={`${td} max-w-[150px] truncate`} title={m.contraparte}>{m.contraparte}</td>
                <td className={`${tdN} ${m.cantidad > 0 ? "text-[#7BE495]" : "text-[#FFB07A]"}`}>{m.cantidad ? cantidadTexto(m.cantidad) : ""}</td>
                <td className={`${tdN} font-semibold`}>{m.saldo}</td>
                {verCostos ? (
                  <>
                    <td className={tdN}>{dinero(m.costoUnitario)}</td>
                    <td className={tdN}>{dinero(m.valor, { signo: true })}</td>
                    <td className={`${tdN} font-semibold`}>{dinero(m.saldoValor)}</td>
                  </>
                ) : null}
                <td className={td}>{m.hechoPor.split(" ")[0]}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={mostrarUnidad ? 5 : 4} className="px-2 py-2 text-[12px] text-[#8F908A]">
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Entradas {entradas} · Salidas {salidas}</span>
                {cuadra === true ? <span className="inline-flex items-center gap-1 text-[#7BE495]"><Check className="h-3.5 w-3.5" aria-hidden="true" />cuadra con el inventario</span> : null}
                {cuadra === false ? <span className="inline-flex items-center gap-1 text-[#FFB07A]"><TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />no cuadra con el inventario</span> : null}
              </span>
            </td>
            <td />
            <td className="px-2 py-2 text-right font-bold tabular-nums">{saldo}</td>
            {verCostos ? <Fragment><td /><td /><td className="px-2 py-2 text-right font-bold tabular-nums">{dinero(saldoValor)}</td></Fragment> : null}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
