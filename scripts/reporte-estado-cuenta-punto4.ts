/**
 * Reporte de SOLO LECTURA — auditoría Técnicos y Operaciones, punto 4
 * (una sola calculadora del estado de cuenta). No escribe nada en Airtable.
 *
 * Muestra qué cifras cambian al pasar todas las pantallas a la calculadora
 * única (lib/estado-cuenta), para que el dueño las revise antes de probar:
 *   A. Panel de Cobros: total de cada orden, antes ("Total a Pagar NV" +
 *      lo aprobado del presupuesto) y ahora, con el motivo.
 *   B. Airtable / WhatsApp: órdenes cuyo "Saldo NV" no coincide con el saldo
 *      real (lo que hoy lee el mensaje al cliente; se corrige en 4C).
 *   C. Tablero de Operaciones: pedidos cuyo chip cambia.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/reporte-estado-cuenta-punto4.ts
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

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

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const $ = (n: number) => `$${r2(n).toFixed(2)}`;
const DIF = 0.01;

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { listarTodo, estadosDeCuentaDeOrdenes, CAMPOS_ORDEN_CUENTA, ids, numero, texto } = await import("../lib/estado-cuenta/airtable");
  const { fetchOperaciones } = await import("../lib/operaciones/airtable");
  const { resolverEstadoCobro, resolverEstadoCobroTablero } = await import("../lib/operaciones/cobro");
  const { ETIQUETA_ESTADO_PAGO } = await import("../lib/estado-cuenta/reglas");

  // ── Órdenes ───────────────────────────────────────────────────────────────
  const ordenes = await listarTodo("Órdenes de Reparación", [
    "ID", "Estado Actual", "Total a Pagar NV", "Saldo NV",
    "Total Repuestos Stock NV", "Total Artículos Operación NV",
    ...CAMPOS_ORDEN_CUENTA,
  ]);
  const cuentas = await estadosDeCuentaDeOrdenes(ordenes);

  type FilaA = { id: string; estado: string; antes: number; ahora: number; motivos: string[] };
  const filasA: FilaA[] = [];
  type FilaB = { id: string; saldoNV: number; saldo: number };
  const filasB: FilaB[] = [];

  for (const o of ordenes) {
    const c = cuentas.get(o.id);
    if (!c) continue;
    const f = o.fields;
    const opsDeLaOrden = new Set(ids(f["Operaciones Comerciales"]));
    const aprobadoLineas = c.aprobadoSinArticulo.filter((p) => !opsDeLaOrden.has(p.id)).reduce((s, p) => s + p.monto, 0);
    const aprobadoPedidos = c.aprobadoSinArticulo.filter((p) => opsDeLaOrden.has(p.id)).reduce((s, p) => s + p.monto, 0);
    const antes = r2(numero(f["Total a Pagar NV"]) + aprobadoLineas);
    const ahora = c.totalCuenta;
    if (Math.abs(ahora - antes) > DIF) {
      const motivos: string[] = [];
      const itemsAhora = r2(c.totalRepuestos - numero(f["Costo Total Repuestos NV"]));
      const itemsAntes = r2(numero(f["Total Repuestos Stock NV"]) + numero(f["Total Artículos Operación NV"]));
      if (Math.abs(itemsAhora - itemsAntes) > DIF) motivos.push(`artículos ${$(itemsAntes)} → ${$(itemsAhora)} (unidades que pidió el cliente)`);
      if (aprobadoPedidos > DIF) motivos.push(`pedido aprobado sin artículo y sin línea ${$(aprobadoPedidos)}`);
      if (!motivos.length) motivos.push("otro (revisar)");
      filasA.push({ id: texto(f["ID"]) || o.id, estado: texto(f["Estado Actual"]), antes, ahora, motivos });
    }
    const saldoNV = numero(f["Saldo NV"]);
    if (Math.abs(saldoNV - c.saldo) > DIF) filasB.push({ id: texto(f["ID"]) || o.id, saldoNV, saldo: c.saldo });
  }

  console.log(`\nA. PANEL DE COBROS — órdenes cuyo total cambia: ${filasA.length} de ${ordenes.length}`);
  for (const x of filasA.sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`   ${x.id.padEnd(10)} ${x.estado.padEnd(22)} antes ${$(x.antes).padStart(9)} → ahora ${$(x.ahora).padStart(9)}  · ${x.motivos.join(" · ")}`);
  }

  console.log(`\nB. AIRTABLE "Saldo NV" (lo que hoy lee el WhatsApp) distinto del saldo real: ${filasB.length} órdenes`);
  for (const x of filasB.sort((a, b) => a.id.localeCompare(b.id)).slice(0, 40)) {
    console.log(`   ${x.id.padEnd(10)} Saldo NV ${$(x.saldoNV).padStart(9)}  ·  real ${$(x.saldo).padStart(9)}`);
  }
  if (filasB.length > 40) console.log(`   … y ${filasB.length - 40} más.`);

  // ── Tablero de Operaciones ────────────────────────────────────────────────
  const ops = await fetchOperaciones({ conCuenta: true });
  const etiqueta = (r: { estado: string; monto: number }) => (r.monto > DIF ? `${r.estado} ${$(r.monto)}` : r.estado);
  const filasC: string[] = [];
  for (const op of ops) {
    const antes = resolverEstadoCobro({ estado: op.estado, totalCotizado: op.totalCotizado, totalAbonado: op.totalAbonado, tieneOpciones: op.tieneOpciones });
    const ahora = resolverEstadoCobroTablero({
      estado: op.estado, totalCotizado: op.totalCotizado, totalAbonado: op.totalAbonado,
      tieneOpciones: op.tieneOpciones, tieneOrden: op.tieneOrden, cuenta: op.cuenta,
    });
    if (antes.estado !== ahora.estado || Math.abs(antes.monto - ahora.monto) > DIF) {
      const de = op.cuenta?.deLaOrden ? " (cuenta de la orden)" : "";
      filasC.push(`   ${op.codigo.padEnd(16)} ${op.estado.padEnd(10)} ${etiqueta(antes).padEnd(26)} → ${etiqueta(ahora)}${de}`);
    }
  }
  console.log(`\nC. TABLERO DE OPERACIONES — pedidos cuyo chip cambia: ${filasC.length} de ${ops.length}`);
  for (const l of filasC) console.log(l);

  const porEstado = new Map<string, number>();
  for (const c of cuentas.values()) porEstado.set(c.estadoPago, (porEstado.get(c.estadoPago) ?? 0) + 1);
  console.log("\nEstado de pago de las órdenes:");
  for (const [k, n] of porEstado) console.log(`   ${ETIQUETA_ESTADO_PAGO[k as keyof typeof ETIQUETA_ESTADO_PAGO].padEnd(14)} ${n}`);
  console.log("\nSolo lectura: no se escribió nada en Airtable.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
