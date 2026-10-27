import "server-only";

// Dar y quitar descuentos de la cuenta — desde el SERVIDOR (auditoría ops,
// punto 4B). Las reglas viven en ./descuentos.ts (puras, con pruebas); aquí
// se lee la cuenta real, se valida y se escribe en "Descuentos de Cuenta".
//
// Fail-closed: si no se puede leer la cuenta o saber si tiene documento
// vigente, no se escribe nada.

import { loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { buscarDocumentoBloqueante } from "@/lib/facturacion/gancho/idempotencia";
import {
  TABLA_DESCUENTOS, cargosDescontables, descripcionDescuento, descuentoDesdeCampos,
  validarAnulacion, validarDescuento,
} from "./descuentos";

export type OrigenDescuento = { tipo: "orden" | "operacion"; recordId: string };
export type UsuarioDescuento = { nombre: string; email: string; esAdmin: boolean };
export type ResultadoDescuento = { ok: true; id: string } | { ok: false; error: string; status: number };

function cliente() {
  const { token, baseId } = loadAirtableEnv();
  return {
    url: `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(TABLA_DESCUENTOS)}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  };
}

async function leerCuentaYDocumento(origen: OrigenDescuento) {
  const cuenta = await getCuentaUnificada(origen.tipo === "orden" ? { ordenId: origen.recordId } : { operacionId: origen.recordId });
  const documento = await buscarDocumentoBloqueante({ tipo: origen.tipo, recordId: origen.recordId });
  return { cuenta, hayDocumentoVigente: documento !== null };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function crearDescuentoEnCuenta(input: {
  origen: OrigenDescuento;
  cargoId: string;
  monto: number;
  motivo: string;
  usuario: UsuarioDescuento;
}): Promise<ResultadoDescuento> {
  if (!input.usuario.esAdmin) return { ok: false, error: "Solo el administrador puede dar descuentos.", status: 403 };
  let leido;
  try {
    leido = await leerCuentaYDocumento(input.origen);
  } catch (err) {
    console.error("[descuentos] No se pudo leer la cuenta:", err);
    return { ok: false, error: "No se pudo leer la cuenta. Intenta de nuevo.", status: 503 };
  }
  const { cuenta, hayDocumentoVigente } = leido;
  const cargo = cargosDescontables(cuenta).find((c) => c.id === input.cargoId) ?? null;
  const monto = round2(input.monto);
  const error = validarDescuento({
    esAdmin: input.usuario.esAdmin, cargo, monto, motivo: input.motivo,
    descuentos: cuenta.descuentos, hayDocumentoVigente,
  });
  if (error || !cargo) return { ok: false, error: error ?? "Línea no encontrada.", status: 400 };

  const etiqueta = cuenta.ordenIdVisible ?? cuenta.operacionCodigo ?? "";
  const c = cliente();
  const res = await fetch(c.url, {
    method: "POST",
    headers: c.headers,
    body: JSON.stringify({
      typecast: true,
      fields: {
        "Descripción": descripcionDescuento(monto, cargo.nombre, etiqueta),
        ...(cuenta.ordenId
          ? { "Orden de Reparación": [cuenta.ordenId] }
          : { "Operación Comercial": [cuenta.operacionId] }),
        "Cargo ID": cargo.id,
        "Tipo de cargo": cargo.tipo,
        "Cargo": cargo.nombre,
        "Precio del cargo": cargo.precio,
        "Monto": monto,
        "Motivo": input.motivo.trim(),
        "Estado": "Vigente",
        "Autorizado por": input.usuario.nombre,
        "Autorizado por email": input.usuario.email,
        "Fecha": new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) {
    console.error("[descuentos] Airtable al crear:", res.status, await res.text());
    return { ok: false, error: "No se pudo guardar el descuento. Intenta de nuevo.", status: 502 };
  }
  const creado = (await res.json()) as { id: string };
  return { ok: true, id: creado.id };
}

export async function anularDescuentoDeCuenta(input: {
  origen: OrigenDescuento;
  descuentoId: string;
  motivo: string;
  usuario: UsuarioDescuento;
}): Promise<ResultadoDescuento> {
  if (!input.usuario.esAdmin) return { ok: false, error: "Solo el administrador puede quitar descuentos.", status: 403 };
  if (!/^rec[A-Za-z0-9]{14}$/.test(input.descuentoId)) return { ok: false, error: "Descuento inválido.", status: 400 };
  const c = cliente();
  let leido;
  let registro: { id: string; fields: Record<string, unknown> } | null = null;
  try {
    leido = await leerCuentaYDocumento(input.origen);
    const res = await fetch(`${c.url}/${input.descuentoId}`, { headers: c.headers, cache: "no-store" });
    if (res.ok) registro = (await res.json()) as { id: string; fields: Record<string, unknown> };
    else if (res.status !== 404 && res.status !== 403) throw new Error(`Airtable ${res.status}`);
  } catch (err) {
    console.error("[descuentos] No se pudo leer la cuenta o el descuento:", err);
    return { ok: false, error: "No se pudo leer la cuenta. Intenta de nuevo.", status: 503 };
  }
  const { cuenta, hayDocumentoVigente } = leido;
  // El descuento tiene que ser de ESTA cuenta.
  const enlaces = [
    ...((registro?.fields["Orden de Reparación"] as string[] | undefined) ?? []),
    ...((registro?.fields["Operación Comercial"] as string[] | undefined) ?? []),
  ];
  const deEstaCuenta = !!registro && enlaces.some((id) => id === cuenta.ordenId || id === cuenta.operacionId);
  const descuento = registro && deEstaCuenta ? descuentoDesdeCampos(registro.id, registro.fields) : null;
  const error = validarAnulacion({ esAdmin: input.usuario.esAdmin, descuento, hayDocumentoVigente });
  if (error) return { ok: false, error, status: 400 };

  const res = await fetch(`${c.url}/${input.descuentoId}`, {
    method: "PATCH",
    headers: c.headers,
    body: JSON.stringify({
      typecast: true,
      fields: {
        "Estado": "Anulado",
        "Anulado por": input.usuario.nombre,
        "Fecha de anulación": new Date().toISOString(),
        "Motivo de anulación": input.motivo.trim() || "Quitado desde la cuenta",
      },
    }),
  });
  if (!res.ok) {
    console.error("[descuentos] Airtable al anular:", res.status, await res.text());
    return { ok: false, error: "No se pudo quitar el descuento. Intenta de nuevo.", status: 502 };
  }
  return { ok: true, id: input.descuentoId };
}
