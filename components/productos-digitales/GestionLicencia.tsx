"use client";

import Link from "next/link";
import { useState } from "react";
import { CampoSecreto } from "./CampoSecreto";
import { accionesDeGestion, TEXTO_RESOLUCION, type AccionGestion, type ResolucionReclamo } from "@/lib/productos-digitales/compra";
import { camposDeCredenciales } from "@/lib/productos-digitales/reglas";

// Gestión de una licencia en Productos Digitales (punto 5B-2). Compacto: una
// fila de acciones según su estado (accionesDeGestion) y un formulario corto
// que se despliega debajo. Solo Staff y Administradores lo ven.

const ETIQUETA: Record<AccionGestion, string> = { editar: "Editar", reclamo: "Reclamo al proveedor", resolver: "Resolver reclamo", anular: "Anular" };
const INPUT = "h-7 w-full rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-2 text-xs text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] focus:border-[var(--sg-lime)] focus:outline-none";

export function GestionLicencia({ producto, onListo }: {
  producto: { id: string; estado: string; tipoProducto: string | null; articuloId?: string | null; proveedor: string | null };
  onListo: () => void | Promise<void>;
}) {
  const acciones = accionesDeGestion(producto);
  const [abierta, setAbierta] = useState<AccionGestion | null>(null);
  const [motivo, setMotivo] = useState("");
  const [resolucion, setResolucion] = useState<ResolucionReclamo | "">("");
  const [cred, setCred] = useState({ clave: "", usuario: "", contrasena: "" });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reposicion, setReposicion] = useState<string | null>(null);
  const campos = camposDeCredenciales(producto.tipoProducto);

  const abrir = (a: AccionGestion) => {
    setAbierta(abierta === a ? null : a);
    setMotivo(""); setResolucion(""); setCred({ clave: "", usuario: "", contrasena: "" }); setError(null);
  };

  const guardar = async () => {
    if (!abierta || ocupado) return;
    if (abierta !== "editar" && !motivo.trim()) { setError("Escribe el motivo."); return; }
    if (abierta === "resolver" && !resolucion) { setError("Elige cómo se resolvió."); return; }
    setOcupado(true); setError(null);
    try {
      const res = await fetch(`/api/tecnicos/productos-digitales/${encodeURIComponent(producto.id)}/gestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: abierta, motivo, resolucion, claveActivacion: cred.clave, usuarioCorreo: cred.usuario, contrasena: cred.contrasena }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      setReposicion(typeof j.registrarReposicion === "string" ? j.registrarReposicion : null);
      setAbierta(null);
      await onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setOcupado(false);
    }
  };

  if (!acciones.length && !producto.articuloId && !reposicion) return null;
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {acciones.map((a) => (
          <button key={a} type="button" onClick={() => abrir(a)}
            className={`h-7 rounded-full border px-3 text-xs font-semibold transition ${abierta === a
              ? "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)] text-[var(--sg-lime)]"
              : a === "anular"
                ? "border-[var(--sg-danger)]/40 text-[var(--sg-danger)] hover:bg-[var(--sg-danger-soft)]"
                : "border-[var(--sg-border)] text-[var(--sg-text-secondary)] hover:border-[var(--sg-lime)]/50 hover:text-[var(--sg-text-primary)]"}`}>
            {ETIQUETA[a]}
          </button>
        ))}
        {producto.articuloId && (
          <Link href={`/shipping-v2/items/${encodeURIComponent(producto.articuloId)}`} className="ml-auto text-[11px] font-semibold text-[var(--sg-lime)] hover:underline" title="Artículo, orden de compra y pago">
            Ver compra ↗
          </Link>
        )}
      </div>
      {reposicion && (
        <p className="mt-1.5 text-[11px] text-[var(--sg-text-secondary)] animate-[sg-entrada_180ms_ease-out]">
          Anulada. <Link href={reposicion} className="font-semibold text-[var(--sg-lime)] hover:underline">Registra la nueva en $0</Link> (marca &quot;Reposición del proveedor&quot;).
        </p>
      )}
      {abierta && (
        <div className="mt-1.5 space-y-1.5 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] p-2 animate-[sg-entrada_180ms_ease-out]">
          {abierta === "editar" && (
            <>
              <p className="text-[11px] text-[var(--sg-text-muted)]">Escribe solo lo que corriges; lo vacío se conserva. El costo y el proveedor vienen de la compra.</p>
              {campos.clave && <CampoSecreto valor={cred.clave} onChange={(v) => setCred((c) => ({ ...c, clave: v }))} placeholder="Nueva clave de activación" className={INPUT} />}
              {campos.usuario && (
                <input value={cred.usuario} onChange={(e) => setCred((c) => ({ ...c, usuario: e.target.value }))} placeholder="Nuevo usuario / correo" autoComplete="off" data-lpignore="true" data-1p-ignore="true" className={`${INPUT} font-mono`} />
              )}
              {campos.usuario && <CampoSecreto valor={cred.contrasena} onChange={(v) => setCred((c) => ({ ...c, contrasena: v }))} placeholder="Nueva contraseña" className={INPUT} />}
            </>
          )}
          {abierta === "resolver" && (
            <div className="space-y-0.5">
              {(Object.keys(TEXTO_RESOLUCION) as ResolucionReclamo[]).map((r) => (
                <label key={r} className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] transition ${resolucion === r ? "bg-[var(--sg-lime-soft)] text-[var(--sg-text-primary)]" : "text-[var(--sg-text-secondary)] hover:bg-[var(--sg-card)]"}`}>
                  <input type="radio" name={`res-${producto.id}`} checked={resolucion === r} onChange={() => setResolucion(r)} className="accent-[var(--sg-lime)]" />
                  {TEXTO_RESOLUCION[r]}
                </label>
              ))}
            </div>
          )}
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200}
            placeholder={abierta === "editar" ? "Nota (opcional)" : abierta === "reclamo" ? `Qué pasó (p. ej. la clave no activa)${producto.proveedor ? ` · ${producto.proveedor}` : ""}` : abierta === "anular" ? "Motivo de la anulación" : "Detalle (p. ej. el proveedor envió otra clave)"}
            className={INPUT} />
          {error && <p className="text-[11px] text-[var(--sg-danger)] animate-[sg-sacudir_300ms_ease-out]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAbierta(null)} className="text-[11px] text-[var(--sg-text-muted)] hover:text-[var(--sg-text-primary)]">Cancelar</button>
            <button type="button" disabled={ocupado} onClick={() => void guardar()}
              className={`h-7 rounded-full px-3 text-xs font-semibold transition disabled:opacity-50 ${abierta === "anular" ? "border border-[var(--sg-danger)] text-[var(--sg-danger)] hover:bg-[var(--sg-danger)] hover:text-white" : "bg-[var(--sg-lime)] text-[#10110E] hover:brightness-105"}`}>
              {ocupado ? "…" : abierta === "anular" ? "Anular" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
