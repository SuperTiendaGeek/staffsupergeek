/**
 * Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones
 * (27-oct-2026), punto 1. Reglas y decisiones del dueño en
 * lib/finanzas/ajuste-auditoria-ops-punto1.ts (con pruebas).
 *
 * Qué hace, en las 7 órdenes que cobraron al emitir sin registrar el abono:
 *   · crea el abono que falta y lo ENLAZA al movimiento que ya existe en
 *     Finanzas (no crea ingresos nuevos);
 *   · deja ese movimiento en su cuenta real (SGINGRESOS o Caja Registradora);
 *   · OR000331: enlaza a la orden el abono de $240 que ya existía;
 *   · OR000430: agrega a la orden el servicio extra de $25;
 *   · OR000423: agrega a la orden el descuento de −$20 con su motivo;
 *   · OR000431: divide el movimiento de $116 en $95 (orden) + $21 (venta
 *     adicional de la factura). El ingreso total no cambia.
 * Cada registro tocado lleva la constancia "Regularización auditoría ops
 * punto 1" en su Observación.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto1.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto1.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 cambios)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CASOS_PUNTO1,
  planificarCaso,
  type Accion,
  type CuentaFinal,
  type LecturaCaso,
  type PlanCaso,
} from "../lib/finanzas/ajuste-auditoria-ops-punto1";

const APLICAR = process.argv.includes("--aplicar");
const TOPE_ACCIONES = 25;
const PAUSA_MS = 250;
const REGISTRADO_POR = "Claude (autorizado por el dueño)";

async function cargarEnvLocal(): Promise<void> {
  const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8").catch(() => "");
  for (const linea of raw.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    let valor = limpia.slice(corte + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
    process.env[clave] ||= valor;
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const texto = (v: unknown) => (typeof v === "string" ? v : "");
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

type Registro = { id: string; fields: Record<string, unknown> };

let BASE = "";
let HEADERS: Record<string, string> = {};
const url = (tabla: string) => `${BASE}/${encodeURIComponent(tabla)}`;

async function leer(tabla: string, id: string): Promise<Registro | null> {
  const res = await fetch(`${url(tabla)}/${id}`, { headers: HEADERS });
  await esperar(PAUSA_MS);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Airtable ${tabla}/${id}: ${res.status} ${await res.text()}`);
  return (await res.json()) as Registro;
}

async function leerVarios(tabla: string, recordIds: string[]): Promise<Registro[]> {
  const out: Registro[] = [];
  for (const id of recordIds) {
    const r = await leer(tabla, id);
    if (r) out.push(r);
  }
  return out;
}

async function listar(tabla: string, campos: string[]): Promise<Registro[]> {
  const registros: Registro[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    for (const c of campos) params.append("fields[]", c);
    if (offset) params.set("offset", offset);
    const res = await fetch(`${url(tabla)}?${params}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`Airtable ${tabla}: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { records: Registro[]; offset?: string };
    registros.push(...data.records);
    offset = data.offset;
    await esperar(PAUSA_MS);
  } while (offset);
  return registros;
}

async function escribir(tabla: string, metodo: "POST" | "PATCH", fields: Record<string, unknown>, id?: string): Promise<Registro> {
  const res = await fetch(id ? `${url(tabla)}/${id}` : url(tabla), {
    method: metodo,
    headers: HEADERS,
    body: JSON.stringify({ fields, typecast: true }),
  });
  await esperar(PAUSA_MS);
  if (!res.ok) throw new Error(`Airtable ${metodo} ${tabla}${id ? `/${id}` : ""}: ${res.status} ${await res.text()}`);
  return (await res.json()) as Registro;
}

async function leerCaso(caso: (typeof CASOS_PUNTO1)[number], cuentas: Partial<Record<CuentaFinal, string>>, nombrePorCuenta: Map<string, string>) {
  const orden = await leer("Órdenes de Reparación", caso.ordenId);
  const f = orden?.fields ?? {};
  const servicios = await leerVarios("Servicios por Orden", ids(f["Servicios por Orden"]));
  // "Abonos (Operación)" en Órdenes es, pese al nombre, el inverso de Abonos."Aplicado a: Orden".
  const abonos = await leerVarios("Abonos", ids(f["Abonos (Operación)"]));

  let movimiento: LecturaCaso["movimiento"] = undefined;
  let movimientosDeLaFactura: LecturaCaso["movimientosDeLaFactura"] = [];
  if (caso.abono) {
    const m = await leer("Movimientos Financieros", caso.abono.movimientoId);
    movimiento = m
      ? {
          id: m.id,
          monto: numero(m.fields["Monto"]),
          estado: texto(m.fields["Estado del Movimiento"]) || "Confirmado",
          abonoIds: ids(m.fields["Abono"]),
          cuadreIds: ids(m.fields["Cuadre de Caja"]),
          cuentaDestino: nombrePorCuenta.get(ids(m.fields["Cuenta Destino (Finanzas)"])[0] ?? "") ?? null,
          metodo: texto(m.fields["Método"]) || null,
          transaccionId: texto(m.fields["Transacción ID"]) || null,
          observacion: texto(m.fields["Observación"]),
        }
      : null;
  }
  if (caso.ventaAdicional) {
    const factura = await leer("Facturas Electrónicas", caso.ventaAdicional.facturaId);
    const movs = await leerVarios("Movimientos Financieros", ids(factura?.fields["Movimientos Financieros (Facturación)"]));
    movimientosDeLaFactura = movs.map((m) => ({
      monto: numero(m.fields["Monto"]),
      estado: texto(m.fields["Estado del Movimiento"]),
      observacion: texto(m.fields["Observación"]),
    }));
  }
  let abonoExistente: LecturaCaso["abonoExistente"] = null;
  if (caso.abonoExistente) {
    const a = await leer("Abonos", caso.abonoExistente.id);
    abonoExistente = a
      ? {
          existe: true,
          monto: numero(a.fields["Monto"]),
          estado: texto(a.fields["Estado del Abono"]),
          ordenIds: ids(a.fields["Aplicado a: Orden"]),
          observacion: texto(a.fields["Observación"]),
        }
      : { existe: false, monto: 0, estado: "", ordenIds: [], observacion: "" };
  }

  const lectura: LecturaCaso = {
    orden: {
      existe: Boolean(orden),
      totalAPagar: numero(f["Total a Pagar NV"]),
      totalAbonado: numero(f["Total Abonado NV"]),
      servicios: servicios.map((s) => ({ nombre: texto(s.fields["Nombre del servicio snapshot o copiado"]), observacion: texto(s.fields["Observación"]) })),
      abonos: abonos.map((a) => ({
        id: a.id,
        monto: numero(a.fields["Monto"]),
        estado: texto(a.fields["Estado del Abono"]),
        observacion: texto(a.fields["Observación"]),
      })),
    },
    movimiento,
    movimientosDeLaFactura,
    abonoExistente,
    cuentas,
  };
  return {
    lectura,
    clienteId: ids(f["Cliente"])[0],
    operacionId: ids(f["Operaciones Comerciales"])[0],
    saldoNV: numero(f["Saldo NV"]),
  };
}

function describir(a: Accion): string {
  switch (a.tipo) {
    case "crear-linea-orden": return `+ línea en la orden: "${a.nombre}" ${a.costo < 0 ? "−" : ""}$${Math.abs(a.costo)}`;
    case "crear-abono": return `+ abono $${a.monto} ${a.metodo}${a.numero ? ` n.º ${a.numero}` : ""} (${a.fechaISO.slice(0, 10)}) → enlazado a ${a.movimientoId}`;
    case "actualizar-movimiento": return `~ movimiento ${a.movimientoId}: ${[a.monto !== undefined ? `monto $${a.monto}` : "", `método ${a.metodo}`, a.transaccionId ? `n.º ${a.transaccionId}` : ""].filter(Boolean).join(", ")}, cuenta ${a.cuentaDestinoId}`;
    case "crear-movimiento-venta-adicional": return `+ movimiento nuevo $${a.monto} (venta adicional) enlazado a la factura ${a.facturaId}`;
    case "enlazar-abono-a-orden": return `~ abono ${a.abonoId}: se enlaza a la orden`;
  }
}

async function aplicar(accion: Accion, ctx: { clienteId?: string; operacionId?: string }) {
  switch (accion.tipo) {
    case "crear-linea-orden":
      await escribir("Servicios por Orden", "POST", {
        "Nombre del servicio snapshot o copiado": accion.nombre,
        "Costo real": accion.costo,
        "Observación": accion.observacion,
        "Fecha de registro": accion.fechaISO,
        "Orden de Reparación": [accion.ordenId],
      });
      return;
    case "crear-abono": {
      // Mismo generador de "ID Abono" que usa la aplicación (verifica los ocupados).
      const { reservarSiguienteIdAbono } = await import("../lib/operaciones/airtable");
      const idAbono = await reservarSiguienteIdAbono();
      const fields: Record<string, unknown> = {
        "ID Abono": idAbono,
        Monto: accion.monto,
        "Fecha de Abono": accion.fechaISO,
        "Estado del Abono": "Registrado",
        "Método de Pago": accion.metodo,
        "Aplicado a: Orden": [accion.ordenId],
        "Movimiento Financiero": [accion.movimientoId],
        "Registrado Por": REGISTRADO_POR,
        "Observación": accion.observacion,
      };
      // Igual que createAbonoPorOrden: si la orden tiene operación, el abono lleva ambos vínculos.
      if (ctx.operacionId) fields["Aplicado a: Operación"] = [ctx.operacionId];
      if (accion.numero) fields["Número de Transacción"] = accion.numero;
      await escribir("Abonos", "POST", fields);
      return;
    }
    case "actualizar-movimiento": {
      const fields: Record<string, unknown> = {
        "Cuenta Destino (Finanzas)": [accion.cuentaDestinoId],
        "Método": accion.metodo,
        "Observación": accion.observacion,
      };
      if (accion.monto !== undefined) fields["Monto"] = accion.monto;
      if (accion.transaccionId) fields["Transacción ID"] = accion.transaccionId;
      await escribir("Movimientos Financieros", "PATCH", fields, accion.movimientoId);
      return;
    }
    case "crear-movimiento-venta-adicional": {
      // Mismo creador que usa la aplicación (genera el código MOV-… y valida).
      const { crearMovimiento } = await import("../lib/finanzas/movimientos");
      await crearMovimiento({
        tipo: "Ingreso",
        origen: "Facturación",
        categoria: "Venta Mostrador",
        monto: accion.monto,
        cuentaDestinoId: accion.cuentaDestinoId,
        estado: "Confirmado",
        estadoDistribucion: "Pendiente de clasificar",
        metodo: accion.metodo,
        fecha: accion.fechaISO,
        transaccionId: accion.transaccionId,
        observacion: accion.observacion,
        registradoPor: REGISTRADO_POR,
        facturaElectronicaId: accion.facturaId,
        clienteId: ctx.clienteId,
      });
      return;
    }
    case "enlazar-abono-a-orden": {
      const actual = await leer("Abonos", accion.abonoId);
      const ordenes = new Set([...ids(actual?.fields["Aplicado a: Orden"]), accion.ordenId]);
      await escribir("Abonos", "PATCH", { "Aplicado a: Orden": [...ordenes], "Observación": accion.observacion }, accion.abonoId);
      return;
    }
  }
}

async function main() {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  BASE = `https://api.airtable.com/v0/${baseId}`;
  HEADERS = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const cuentasRaw = await listar("Cuentas Financieras", ["Nombre"]);
  const nombrePorCuenta = new Map(cuentasRaw.map((c) => [c.id, texto(c.fields["Nombre"])]));
  const cuentas: Partial<Record<CuentaFinal, string>> = {};
  for (const c of cuentasRaw) {
    const n = texto(c.fields["Nombre"]);
    if (n === "SGINGRESOS" || n === "Caja Registradora") cuentas[n] = c.id;
  }

  const planes: Array<{ plan: PlanCaso; ctx: { clienteId?: string; operacionId?: string }; saldoNV: number }> = [];
  for (const caso of CASOS_PUNTO1) {
    const { lectura, clienteId, operacionId, saldoNV } = await leerCaso(caso, cuentas, nombrePorCuenta);
    planes.push({ plan: planificarCaso(caso, lectura), ctx: { clienteId, operacionId }, saldoNV });
  }

  let total = 0;
  for (const { plan, ctx, saldoNV } of planes) {
    const etiqueta = plan.estado === "aplicar" ? "APLICAR" : plan.estado === "ya-aplicado" ? "ya aplicado" : "BLOQUEADO";
    console.log(`\n${plan.orden}  [${etiqueta}]  Saldo NV hoy $${saldoNV} → después $${plan.saldoDespues}${ctx.operacionId ? `  (tiene operación ${ctx.operacionId})` : ""}`);
    for (const r of plan.resumen) console.log(`   · ${r}`);
    for (const a of plan.acciones) console.log(`     ${describir(a)}`);
    for (const b of plan.bloqueos) console.log(`   ✗ ${b}`);
    total += plan.acciones.length;
  }
  const bloqueados = planes.filter((p) => p.plan.estado === "bloqueado");
  console.log(`\nAcciones: ${total}. Bloqueados: ${bloqueados.length}.`);

  if (total > TOPE_ACCIONES) throw new Error(`Se esperaban como mucho ${TOPE_ACCIONES} acciones y salen ${total}. No se aplica nada.`);
  if (bloqueados.length > 0) {
    console.log("Hay casos bloqueados: no se aplica NADA hasta revisarlos.");
    if (APLICAR) process.exit(1);
    return;
  }
  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }

  let hechas = 0;
  for (const { plan, ctx } of planes) {
    for (const accion of plan.acciones) {
      try {
        await aplicar(accion, ctx);
        hechas += 1;
        console.log(`✓ ${plan.orden}: ${describir(accion)}`);
      } catch (e) {
        console.error(`✗ ${plan.orden}: ${describir(accion)}\n  ${e instanceof Error ? e.message : String(e)}`);
        console.error(`Se detuvo tras ${hechas} acciones. Vuelve a correr la vista previa: retoma lo que falta.`);
        process.exit(1);
      }
    }
  }
  console.log(`\n✅ Aplicadas ${hechas} acciones. Vuelve a correr la vista previa: debe decir 0 acciones.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
