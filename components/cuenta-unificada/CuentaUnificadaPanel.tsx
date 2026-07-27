"use client";

import Link from "next/link";
import type { CuentaUnificada } from "@/types/cuenta-unificada";

// Componente compartido (Fase 11 — Etapa 3): se monta igual en la pantalla de
// la orden y en la de la operación. Puramente presentacional — no calcula
// nada, solo pinta lo que ya viene resuelto en `cuenta` (getCuentaUnificada).
//
// Usa colores literales (no `var(--sg-*)`) a propósito: esas variables solo
// existen dentro del wrapper de Técnicos (TecnicosTheme.module.css) y no
// resolverían en la pantalla de Operaciones, que no las define.

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

function formatFecha(fecha: string | null) {
  if (!fecha) return "Sin fecha";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

// origenTipo: qué pantalla monta el panel (orden u operación) — determina
// a qué record id apunta el botón "Emitir factura" cuando ambos existen
// (par vinculado). Fase 16 PR2 (gancho cuenta unificada → facturación).
export function CuentaUnificadaPanel({
  cuenta,
  origenTipo,
}: {
  cuenta: CuentaUnificada;
  origenTipo?: "orden" | "operacion";
}) {
  const origenRecordId = origenTipo === "operacion" ? cuenta.operacionId : cuenta.ordenId;
  const hrefEmitirFactura =
    origenTipo && origenRecordId
      ? `/facturacion/nueva?origen=${origenTipo}&recordId=${encodeURIComponent(origenRecordId)}`
      : null;

  const vinculoLabel =
    cuenta.ordenId && cuenta.operacionId
      ? `${cuenta.ordenIdVisible} ↔ ${cuenta.operacionCodigo}`
      : cuenta.ordenId
        ? `${cuenta.ordenIdVisible} · sin operación vinculada`
        : cuenta.operacionId
          ? `${cuenta.operacionCodigo} · sin orden vinculada`
          : "Sin datos";

  const saldoEsFavor = cuenta.saldo < 0;
  const saldoEsCero = cuenta.saldo === 0;

  return (
    <section
      style={{
        border: "1.5px solid #D7FF4F55",
        borderRadius: "0.75rem",
        background: "#252622",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "#D7FF4F",
          color: "#10110E",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        <span>Cuenta unificada</span>
        <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 600, textTransform: "none", opacity: 0.85 }}>
          {vinculoLabel}
        </span>
      </div>

      <div style={{ padding: "12px 14px 4px" }}>
        {cuenta.items.map((item) => (
          <LedgerRow
            key={item.id}
            label={item.nombre}
            origen={item.origen === "pedido" ? "Pedido" : "Stock"}
            value={formatCurrency(item.precio)}
          />
        ))}
        {cuenta.repuestosHistoricosCuentanParaTotal &&
          cuenta.repuestosHistoricos.map((r) => (
            <LedgerRow key={r.id} label={r.nombre} origen="Histórico" value={formatCurrency(r.subtotal)} />
          ))}
        {cuenta.servicios.map((s) => (
          <LedgerRow key={s.id} label={s.nombre} origen="Servicio" value={formatCurrency(s.costo)} />
        ))}
        {cuenta.totalProductosDigitales > 0 && (
          <LedgerRow
            label="Productos digitales"
            origen="Orden"
            value={formatCurrency(cuenta.totalProductosDigitales)}
          />
        )}
        {cuenta.items.length === 0 &&
          cuenta.servicios.length === 0 &&
          !(cuenta.repuestosHistoricosCuentanParaTotal && cuenta.repuestosHistoricos.length > 0) &&
          cuenta.totalProductosDigitales === 0 && (
            <p style={{ color: "#A7A7A7", fontSize: "13px", padding: "8px 0" }}>Sin cargos registrados.</p>
          )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "10px 0",
            borderTop: "1px solid #F5F5F5",
            fontWeight: 700,
            color: "#F5F5F5",
          }}
        >
          <span>Total de la cuenta</span>
          <span>{formatCurrency(cuenta.totalCuenta)}</span>
        </div>
      </div>

      <div style={{ padding: "6px 14px 2px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#A7A7A7" }}>
        Abonos ({cuenta.abonos.length})
      </div>
      {cuenta.abonos.length === 0 ? (
        <p style={{ color: "#A7A7A7", fontSize: "13px", padding: "4px 14px 12px" }}>Sin abonos registrados.</p>
      ) : (
        <div style={{ padding: "0 14px" }}>
          {cuenta.abonos.map((abono) => {
            const anulado = abono.estado === "Anulado";
            const textColor = anulado ? "#A7A7A7" : "#F5F5F5";
            return (
              <div key={abono.id} style={{ padding: "7px 0", borderTop: "1px dashed #3A3A36", fontSize: "13px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      flexWrap: "wrap",
                      minWidth: 0,
                      color: textColor,
                      textDecoration: anulado ? "line-through" : "none",
                    }}
                  >
                    <Badge>
                      {abono.origen === "orden"
                        ? "Orden"
                        : abono.origen === "operacion"
                          ? "Operación"
                          : "Orden + Operación"}
                    </Badge>
                    <span>{abono.metodoPago ?? "Sin método"}</span>
                    {anulado && <Badge tone="danger">Anulado</Badge>}
                  </div>
                  <span
                    style={{
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      color: textColor,
                      textDecoration: anulado ? "line-through" : "none",
                    }}
                  >
                    {formatCurrency(abono.monto)}
                  </span>
                </div>
                <div style={{ marginTop: "2px", fontSize: "11px", color: "#A7A7A7" }}>{formatFecha(abono.fecha)}</div>
              </div>
            );
          })}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 0",
              borderTop: "1px solid #3A3A36",
              fontWeight: 700,
              color: "#F5F5F5",
            }}
          >
            <span>Total abonado</span>
            <span>{formatCurrency(cuenta.totalAbonado)}</span>
          </div>
        </div>
      )}

      <div
        style={{
          margin: "12px 14px 14px",
          borderRadius: "0.5rem",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
          background: saldoEsFavor ? "rgba(86, 227, 164, 0.16)" : saldoEsCero ? "rgba(86, 227, 164, 0.16)" : "rgba(240, 199, 94, 0.16)",
        }}
      >
        <span style={{ fontWeight: 700, color: "#F5F5F5" }}>
          {saldoEsFavor ? "Saldo a favor del cliente" : saldoEsCero ? "Al día" : "Saldo pendiente"}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "1.15rem",
            fontWeight: 800,
            color: saldoEsFavor || saldoEsCero ? "#56E3A4" : "#F0C75E",
          }}
        >
          {formatCurrency(Math.abs(cuenta.saldo))}
        </span>
      </div>

      {hrefEmitirFactura && (
        <div style={{ margin: "0 14px 14px" }}>
          <Link
            href={hrefEmitirFactura}
            style={{
              display: "block",
              textAlign: "center",
              borderRadius: "0.5rem",
              padding: "10px 14px",
              fontSize: "13px",
              fontWeight: 700,
              color: "#10110E",
              background: "#D7FF4F",
              textDecoration: "none",
            }}
          >
            Emitir factura →
          </Link>
        </div>
      )}
    </section>
  );
}

function LedgerRow({ label, origen, value }: { label: string; origen: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "10px",
        padding: "8px 0",
        borderBottom: "1px dashed #3A3A36",
        fontSize: "13px",
      }}
    >
      <div style={{ flex: 1, color: "#F5F5F5" }}>
        {label}
        <span style={{ display: "block", marginTop: "1px", fontSize: "11px", color: "#A7A7A7" }}>{origen}</span>
      </div>
      <div style={{ fontWeight: 600, color: "#F5F5F5" }}>{value}</div>
    </div>
  );
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <span
      style={{
        borderRadius: "999px",
        padding: "2px 8px",
        fontSize: "10px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        background: tone === "danger" ? "rgba(255, 90, 79, 0.16)" : "#2D2E2A",
        color: tone === "danger" ? "#ff5a4f" : "#CFCFCB",
      }}
    >
      {children}
    </span>
  );
}
