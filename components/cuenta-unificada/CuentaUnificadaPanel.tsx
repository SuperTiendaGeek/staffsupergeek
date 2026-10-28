"use client";

import Link from "next/link";
import { useState } from "react";
import { Tag, X } from "lucide-react";
import type { CuentaUnificada } from "@/types/cuenta-unificada";
import {
  cargosDescontables, descuentoPorCargo, montoDesdePorcentaje,
  type CargoDescontable, type DescuentoCuenta,
} from "@/lib/estado-cuenta/descuentos";

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
// a qué record id apunta el botón "Emitir documento" cuando ambos existen
// (par vinculado). Fase 16 PR2 (gancho cuenta unificada → facturación).
//
// El botón dice "documento", no "factura": la pantalla de destino ofrece
// factura, recibo (interno, sin IVA) y proforma, todos con los datos de la
// cuenta ya precargados.
// Auditoría ops, punto 1: el documento se emite con la cuenta en $0. Si falta
// cobrar, la acción principal es "Registrar pago" (onRegistrarPago abre el
// formulario de abono de la pantalla que monta el panel) y "Emitir documento"
// queda desactivado. La proforma sigue a mano: cotizar no requiere pago.
// Auditoría ops, punto 4B: descuentos por línea. Solo el administrador ve la
// etiqueta 🏷 de cada línea (puedeDescontar); el servidor vuelve a validar
// todo. onCuentaCambiada recarga la cuenta después de dar o quitar uno.
export function CuentaUnificadaPanel({
  cuenta,
  origenTipo,
  onRegistrarPago,
  puedeDescontar = false,
  onCuentaCambiada,
}: {
  cuenta: CuentaUnificada;
  origenTipo?: "orden" | "operacion";
  onRegistrarPago?: () => void;
  puedeDescontar?: boolean;
  onCuentaCambiada?: () => void;
}) {
  const origenRecordId = origenTipo === "operacion" ? cuenta.operacionId : cuenta.ordenId;
  const urlDescuentos =
    origenTipo && origenRecordId
      ? origenTipo === "orden"
        ? `/api/tecnicos/ordenes/${encodeURIComponent(origenRecordId)}/descuentos`
        : `/api/operaciones/${encodeURIComponent(origenRecordId)}/descuentos`
      : null;
  const descuentos = descuentoPorCargo(cuenta.descuentos ?? []);
  const cargos = new Map(cargosDescontables(cuenta).map((c) => [c.id, c]));
  const [abierto, setAbierto] = useState<string | null>(null);
  const [destello, setDestello] = useState<string | null>(null);
  const filaCargo = (id: string, label: string, origen: string, precio: number) => (
    <CargoRow
      key={id}
      label={label}
      origen={origen}
      precio={precio}
      cargo={cargos.get(id) ?? null}
      descuento={descuentos.get(id)}
      editable={puedeDescontar && !!urlDescuentos}
      abierto={abierto === id}
      destello={destello === id}
      url={urlDescuentos}
      onAbrir={() => setAbierto(abierto === id ? null : id)}
      onHecho={() => {
        setAbierto(null);
        setDestello(id);
        setTimeout(() => setDestello((d) => (d === id ? null : d)), 900);
        onCuentaCambiada?.();
      }}
    />
  );
  const hrefEmitirDocumento =
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

  const saldoEsFavor = cuenta.saldo < -0.01;
  const saldoEsCero = Math.abs(cuenta.saldo) <= 0.01;
  const puedeEmitir = saldoEsCero && cuenta.totalCuenta > 0.01;

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
        {cuenta.items.map((item) =>
          filaCargo(
            item.id,
            item.cantidad && item.cantidad > 1
              ? `${item.nombre} · ${item.cantidad} × ${formatCurrency(item.precioUnitario ?? 0)}`
              : item.nombre,
            item.origen === "pedido" ? "Pedido" : "Stock",
            item.precio,
          )
        )}
        {cuenta.repuestosHistoricosCuentanParaTotal &&
          cuenta.repuestosHistoricos.map((r) => filaCargo(r.id, r.nombre, "Histórico", r.subtotal))}
        {cuenta.servicios.map((s) => filaCargo(s.id, s.nombre, "Servicio", s.costo))}
        {(cuenta.aprobadoSinArticulo ?? []).map((p) => (
          <LedgerRow
            key={p.id}
            label={p.nombre}
            origen={`Aprobado · ${p.motivo === "falta_pedir" ? "falta pedirlo" : p.motivo === "sin_stock" ? "sin stock" : p.motivo === "sin_codigo" ? "sin código libre" : "pendiente"}`}
            value={formatCurrency(p.monto)}
          />
        ))}
        {(cuenta.productosDigitales ?? []).map((p) =>
          filaCargo(p.id, p.nombre || "Producto digital", "Producto digital", p.precioVenta)
        )}
        {cuenta.items.length === 0 &&
          cuenta.servicios.length === 0 &&
          (cuenta.aprobadoSinArticulo ?? []).length === 0 &&
          !(cuenta.repuestosHistoricosCuentanParaTotal && cuenta.repuestosHistoricos.length > 0) &&
          (cuenta.productosDigitales ?? []).length === 0 && (
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
        {(cuenta.totalDescuentos ?? 0) > 0.005 && (
          <p style={{ margin: "-6px 0 8px", fontSize: "11px", color: "#F0C75E", textAlign: "right" }}>
            Incluye {formatCurrency(cuenta.totalDescuentos)} de descuento
          </p>
        )}
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

      {hrefEmitirDocumento && (
        <div style={{ margin: "0 14px 14px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {puedeEmitir ? (
            <Link href={hrefEmitirDocumento} style={{ ...BOTON, ...BOTON_PRIMARIO, flex: 1 }}>
              Emitir documento →
            </Link>
          ) : (
            <>
              {!saldoEsFavor && !saldoEsCero && onRegistrarPago && (
                <button type="button" onClick={onRegistrarPago} style={{ ...BOTON, ...BOTON_PRIMARIO, flex: 1 }}>
                  Registrar pago
                </button>
              )}
              <span
                aria-disabled="true"
                title={saldoEsFavor ? "El cliente pagó de más: resuélvelo antes de emitir" : "Se emite cuando la cuenta está en $0"}
                style={{ ...BOTON, flex: 1, color: "#6B6B66", border: "1px solid #3A3A36", cursor: "not-allowed" }}
              >
                Emitir documento
              </span>
              <Link href={`${hrefEmitirDocumento}&tipo=proforma`} style={{ fontSize: "12px", color: "#A7A7A7", textDecoration: "underline" }}>
                Proforma
              </Link>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// Línea de la cuenta con su descuento (punto 4B). Sin descuento se ve igual
// que siempre; el administrador tiene además la etiqueta para darlo. Con
// descuento: precio de lista tachado, precio final y una pastilla "−$X" con
// el motivo (title); clic en la pastilla para quitarlo.
function CargoRow({
  label, origen, precio, cargo, descuento, editable, abierto, destello, url, onAbrir, onHecho,
}: {
  label: string;
  origen: string;
  precio: number;
  cargo: CargoDescontable | null;
  descuento: DescuentoCuenta | undefined;
  editable: boolean;
  abierto: boolean;
  destello: boolean;
  url: string | null;
  onAbrir: () => void;
  onHecho: () => void;
}) {
  const [modo, setModo] = useState<"$" | "%">("$");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numero = parseFloat(valor.replace(",", "."));
  const monto = !Number.isFinite(numero) ? 0 : modo === "%" ? montoDesdePorcentaje(precio, numero) : Math.round(numero * 100) / 100;
  const queda = Math.max(0, Math.round((precio - monto) * 100) / 100);
  const conDescuento = descuento ? Math.max(0, precio - descuento.monto) : precio;
  const puedeAplicar = !!cargo && monto > 0 && monto <= precio + 0.005 && motivo.trim().length >= 4 && !enviando;

  async function enviar(metodo: "POST" | "DELETE") {
    if (!url) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(metodo === "POST" ? url : `${url}/${descuento?.id}`, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metodo === "POST" ? { cargoId: cargo?.id, monto, motivo } : { motivo: "Quitado desde la cuenta" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      setValor("");
      setMotivo("");
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      style={{
        borderBottom: "1px dashed #3A3A36",
        animation: destello ? "sg-destello 900ms ease-out" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", padding: "8px 0", fontSize: "13px" }}>
        <div style={{ flex: 1, minWidth: 0, color: "#F5F5F5" }}>
          {label}
          <span style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "1px", fontSize: "11px", color: "#A7A7A7" }}>
            {origen}
            {descuento && (
              <button
                type="button"
                disabled={!editable}
                onClick={onAbrir}
                title={`${descuento.motivo}${descuento.autorizadoPor ? ` · ${descuento.autorizadoPor}` : ""}`}
                style={{
                  borderRadius: "999px", padding: "0 7px", fontSize: "10px", fontWeight: 700, border: "none",
                  background: "rgba(240, 199, 94, 0.16)", color: "#F0C75E", cursor: editable ? "pointer" : "default",
                }}
              >
                −{formatCurrency(descuento.monto)}
              </button>
            )}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", whiteSpace: "nowrap" }}>
          {descuento && (
            <span style={{ fontSize: "11px", color: "#6B6B66", textDecoration: "line-through" }}>{formatCurrency(precio)}</span>
          )}
          <span style={{ fontWeight: 600, color: "#F5F5F5" }}>{formatCurrency(conDescuento)}</span>
          {editable && cargo && !descuento && (
            <button
              type="button"
              onClick={onAbrir}
              title="Dar descuento"
              aria-label={`Dar descuento a ${label}`}
              style={{ alignSelf: "center", background: "none", border: "none", padding: "2px", cursor: "pointer", color: abierto ? "#D7FF4F" : "#6B6B66" }}
            >
              <Tag size={13} />
            </button>
          )}
        </div>
      </div>

      {abierto && editable && (
        <div style={{ padding: "0 0 10px", animation: "sg-entrada 160ms ease-out" }}>
          {descuento ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#A7A7A7" }}>
              <span style={{ flex: 1, minWidth: 0 }}>{descuento.motivo}</span>
              <button type="button" disabled={enviando} onClick={() => enviar("DELETE")} style={{ ...BOTON_CHICO, color: "#FF5A4F", borderColor: "#FF5A4F55" }}>
                {enviando ? "Quitando…" : "Quitar descuento"}
              </button>
              <button type="button" onClick={onAbrir} aria-label="Cerrar" style={{ background: "none", border: "none", color: "#6B6B66", cursor: "pointer" }}><X size={14} /></button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", border: "1px solid #3A3A36", borderRadius: "0.4rem", overflow: "hidden" }}>
                <input
                  autoFocus
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0"
                  aria-label="Monto del descuento"
                  style={{ width: "64px", background: "#1A1B18", border: "none", color: "#F5F5F5", padding: "5px 8px", fontSize: "12px", textAlign: "right" }}
                />
                {(["$", "%"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModo(m)}
                    style={{ border: "none", padding: "0 8px", fontSize: "12px", fontWeight: 700, cursor: "pointer", background: modo === m ? "#D7FF4F" : "#2D2E2A", color: modo === m ? "#10110E" : "#A7A7A7" }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && puedeAplicar) void enviar("POST"); if (e.key === "Escape") onAbrir(); }}
                placeholder="Motivo"
                aria-label="Motivo del descuento"
                style={{ flex: 1, minWidth: "120px", background: "#1A1B18", border: "1px solid #3A3A36", borderRadius: "0.4rem", color: "#F5F5F5", padding: "5px 8px", fontSize: "12px" }}
              />
              <button type="button" disabled={!puedeAplicar} onClick={() => enviar("POST")} style={{ ...BOTON_CHICO, ...(puedeAplicar ? BOTON_PRIMARIO : { color: "#6B6B66", cursor: "not-allowed" }) }}>
                {enviando ? "Aplicando…" : monto > 0 ? `Aplicar · queda ${formatCurrency(queda)}` : "Aplicar"}
              </button>
            </div>
          )}
          {error && <p style={{ marginTop: "6px", fontSize: "11px", color: "#FF5A4F", animation: "sg-sacudir 300ms ease" }}>{error}</p>}
        </div>
      )}
    </div>
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

const BOTON: React.CSSProperties = {
  display: "block",
  textAlign: "center",
  borderRadius: "0.5rem",
  padding: "9px 14px",
  fontSize: "13px",
  fontWeight: 700,
  textDecoration: "none",
  transition: "background-color 160ms ease, color 160ms ease, opacity 160ms ease",
};
const BOTON_PRIMARIO: React.CSSProperties = { color: "#10110E", background: "#D7FF4F", border: "none", cursor: "pointer" };
const BOTON_CHICO: React.CSSProperties = {
  borderRadius: "0.4rem", padding: "5px 10px", fontSize: "12px", fontWeight: 700,
  background: "transparent", border: "1px solid #3A3A36", cursor: "pointer", whiteSpace: "nowrap",
  transition: "background-color 160ms ease, color 160ms ease",
};
