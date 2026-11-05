/**
 * Ajuste de datos — auditoría Técnicos y Operaciones, punto 20 (4-nov-2026).
 * Primer caso de Garantía SUPER GEEK: OR000425 (Aida Marcillo).
 *
 *   1. REP-000135 (la batería) se suelta de OP-2026-000122.
 *   2. La línea del presupuesto que ya existe (flujo viejo, "Cargada" por
 *      OP-122 a $1) pasa a Repuesto en garantía CONFIRMADA (dueño), $0, sin
 *      OP-122 ni "bajo pedido". Se carga con cargarCompraEnLinea (cargar.ts
 *      sigue siendo el único que carga a una orden): REP-000135 queda apartada
 *      para OR000425 y la línea "Cargada". (Si no existiera, se crea.)
 *   3. OP-2026-000122 → "Rechazado" con la nota "Reemplazada por la garantía
 *      de OR000425" (su $1 deja de contar en la cuenta).
 * La batería sale del inventario ("Salida por garantía") cuando la orden pase
 * a "Finalizado Entregado", como cualquier garantía. Datos y reglas en
 * lib/garantias/ajuste-or000425.ts (con prueba).
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto20.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto20.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const QUIEN = "Claude (autorizado por el dueño)";

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

type Registro = { id: string; fields: Record<string, unknown> };
const texto = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name) : "");
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { OR000425, planOR000425 } = await import("../lib/garantias/ajuste-or000425");
  const { airtableRequest, airtableMutation, tableUrl } = await import("../lib/finanzas/airtable-client");
  const ship = await import("../lib/shipping-v2/airtable");
  const { cargarCompraEnLinea } = await import("../lib/tecnicos/presupuesto/cargar");
  const { listarLineas, crearLinea, actualizarLinea } = await import("../lib/tecnicos/presupuesto/airtable");
  const { entradaHistorial } = await import("../lib/tecnicos/presupuesto/reglas");
  const { actualizarEstadoOperacion } = await import("../lib/operaciones/airtable");
  const { getCuentaUnificada } = await import("../lib/cuenta-unificada");
  const { origenesDeGarantia } = await import("../lib/garantias/servidor");
  const { textoOrigen, fechaCorta } = await import("../lib/garantias/plazos");

  async function uno(tabla: string, formula: string): Promise<Registro | null> {
    const u = new URL(tableUrl(tabla));
    u.searchParams.set("pageSize", "2");
    u.searchParams.set("filterByFormula", formula);
    const r = (await airtableRequest<{ records?: Registro[] }>(u.toString())).records ?? [];
    if (r.length > 1) throw new Error(`Más de un registro en ${tabla} para ${formula}`);
    return r[0] ?? null;
  }

  // ── Lectura ────────────────────────────────────────────────────────────────
  const leer = async () => {
    const orden = await uno("Órdenes de Reparación", `{ID}='${OR000425.orden}'`);
    const op = await uno("Operación Comercial", `{Código Operación}='${OR000425.operacion}'`);
    const item = await uno("Shipping Items", `{SKU}='${OR000425.sku}'`);
    const lineas = orden ? await listarLineas(orden.id) : [];
    const linea = item ? lineas.find((l) => l.itemId === item.id && l.estado !== "Rechazada") ?? null : null;
    return {
      orden, op, item, linea,
      estado: {
        ordenId: orden?.id ?? null,
        operacion: op ? { id: op.id, estado: texto(op.fields["Estado"]), observacion: texto(op.fields["Observación Interna"]) } : null,
        articulo: item ? {
          id: item.id,
          operaciones: ids(item.fields["Operación Comercial"]),
          ordenesStock: ids(item.fields["Orden de Reparación (Stock)"]),
          estado: texto(item.fields["Estado Item"]),
        } : null,
        linea: linea ? { id: linea.id, estado: linea.estado, garantia: linea.garantia ?? "", precio: linea.precioUnitario, operacionId: linea.operacionId } : null,
      },
    };
  };

  const l = await leer();
  console.log(`\n${OR000425.orden} · ${OR000425.operacion} · ${OR000425.sku}`);
  console.log(`  Orden: ${l.orden?.id ?? "—"} · estado ${texto(l.orden?.fields["Estado Actual"])}`);
  console.log(`  ${OR000425.operacion}: ${l.estado.operacion?.estado ?? "—"}`);
  console.log(`  ${OR000425.sku}: ${l.estado.articulo?.estado ?? "—"} · cant. ${l.item?.fields["Cantidad"] ?? "?"} · reservada ${l.item?.fields["Cantidad Reservada"] ?? 0} · costo total ${l.item?.fields["Costo total unidad"] ?? "?"}`);
  console.log(`  Línea de presupuesto: ${l.estado.linea ? `${l.estado.linea.estado} · garantía ${l.estado.linea.garantia || "—"} · $${l.estado.linea.precio}` : "no existe"}`);

  // ¿De qué venta viene la garantía? Se busca el equipo de la orden entre las
  // compras del cliente; si no está (o venció), queda como cortesía.
  const origenes = l.orden ? await origenesDeGarantia(l.orden.id).catch(() => []) : [];
  const origen = origenes.find((o) => o.sku === OR000425.skuEquipo) ?? null;
  console.log(`  Origen de la garantía: ${origen ? `${textoOrigen(origen)} · ${origen.vigente ? "vigente" : `vencida (${fechaCorta(origen.vence)})`}` : `${OR000425.skuEquipo} no aparece en las compras del cliente → cortesía sin documento`}`);
  const cortesia = !origen || !origen.vigente;

  const plan = planOR000425(l.estado);
  if (plan.bloqueos.length) {
    console.log("\nBLOQUEOS:"); for (const b of plan.bloqueos) console.log(`  ✗ ${b}`);
    process.exitCode = 1; return;
  }
  console.log(`\n${plan.acciones.length} acción(es):`);
  const TEXTO: Record<string, string> = {
    soltar_de_operacion: `Soltar ${OR000425.sku} de ${OR000425.operacion}`,
    crear_linea_garantia: `Crear la línea "${OR000425.descripcion}" — $0, garantía confirmada (${OR000425.confirmadaPor}) — y apartar ${OR000425.sku} para ${OR000425.orden}`,
    completar_linea_garantia: `Convertir la línea que ya existe en garantía: $0, garantía confirmada, sin ${OR000425.operacion}, ${OR000425.sku} apartada para ${OR000425.orden}`,
    rechazar_operacion: `${OR000425.operacion} → Rechazado ("${OR000425.notaOperacion}")`,
  };
  for (const a of plan.acciones) console.log(`  • ${TEXTO[a.tipo]}`);
  if (!plan.acciones.length || !APLICAR) {
    if (!APLICAR && plan.acciones.length) console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }

  // ── Escritura ──────────────────────────────────────────────────────────────
  const ahora = new Date();
  const datosGarantia = {
    estado: "Aprobada" as const,
    precioUnitario: 0,
    garantia: "Confirmada" as const,
    motivoGarantia: OR000425.motivo,
    garantiaConfirmadaPor: OR000425.confirmadaPor,
    garantiaDe: origen ? textoOrigen(origen) : "",
    garantiaOrigenId: origen?.clave ?? "",
    garantiaVence: origen?.vence ?? "",
    garantiaCortesia: cortesia,
    aprobadoPor: OR000425.confirmadaPor,
    fechaAprobacion: ahora.toISOString(),
    notaCarga: "",
  };
  for (const a of plan.acciones) {
    if (a.tipo === "soltar_de_operacion") {
      await ship.soltarArticuloDePedido(a.itemId, { modo: "liberar", motivo: OR000425.notaOperacion, registradoPor: QUIEN });
    } else if (a.tipo === "crear_linea_garantia") {
      const nueva = await crearLinea(a.ordenId, {
        tipo: "Repuesto", descripcion: OR000425.descripcion, cantidad: 1, precioUnitario: 0, itemId: a.itemId, prioridad: "Necesaria", garantia: true,
      }, QUIEN);
      await actualizarLinea(nueva.id, {
        ...datosGarantia,
        agregarHistorial: { anterior: "", entrada: entradaHistorial(`Garantía SUPER GEEK confirmada ($0)${cortesia ? " de cortesía" : ""} por ${OR000425.confirmadaPor}: ${OR000425.motivo} Reemplaza a ${OR000425.operacion} (punto 20).`, QUIEN, ahora) },
      });
      await cargarCompraEnLinea({ ordenId: a.ordenId, lineaId: nueva.id, itemId: a.itemId, referencia: `${OR000425.sku} en garantía (antes en ${OR000425.operacion})`, usuario: { nombre: QUIEN } });
    } else if (a.tipo === "completar_linea_garantia") {
      const actual = (await listarLineas(a.ordenId)).find((x) => x.id === a.lineaId)!;
      await actualizarLinea(a.lineaId, {
        ...datosGarantia,
        ...(a.cargar ? {} : { estado: "Cargada" as const }),
        ...(a.soltarOperacion ? { operacionId: null } : {}),
        agregarHistorial: { anterior: actual.historial, entrada: entradaHistorial(`Garantía SUPER GEEK confirmada ($0)${cortesia ? " de cortesía" : ""} por ${OR000425.confirmadaPor}: ${OR000425.motivo} Reemplaza a ${OR000425.operacion} (punto 20).`, QUIEN, ahora) },
      });
      // Ya no es "bajo pedido" (la batería está en la tienda): queda como un repuesto de stock en garantía.
      if (a.soltarOperacion) {
        await airtableMutation(tableUrl("Presupuesto por Orden"), { method: "PATCH", body: JSON.stringify({ records: [{ id: a.lineaId, fields: { "Bajo pedido": false } }] }) });
      }
      if (a.cargar) await cargarCompraEnLinea({ ordenId: a.ordenId, lineaId: a.lineaId, itemId: a.itemId, referencia: `${OR000425.sku} en garantía (antes en ${OR000425.operacion})`, usuario: { nombre: QUIEN } });
    } else if (a.tipo === "rechazar_operacion") {
      await actualizarEstadoOperacion(a.operacionId, "Rechazado");
      const previa = l.estado.operacion?.observacion ?? "";
      await airtableMutation(tableUrl("Operación Comercial"), {
        method: "PATCH",
        body: JSON.stringify({ records: [{ id: a.operacionId, fields: { "Observación Interna": [previa, OR000425.notaOperacion].filter(Boolean).join("\n") } }] }),
      });
    }
    console.log(`  ✓ ${TEXTO[a.tipo]}`);
  }

  // ── Verificación ───────────────────────────────────────────────────────────
  const d = await leer();
  const resto = planOR000425(d.estado);
  const cuenta = await getCuentaUnificada({ ordenId: d.orden!.id });
  console.log(`\nVerificación: ${resto.acciones.length} acción(es) pendientes · cuenta ${OR000425.orden}: total $${cuenta.totalCuenta} · saldo $${cuenta.saldo} · ${cuenta.estadoPago}`);
  for (const it of cuenta.items) console.log(`  · ${it.nombre} — $${it.precio}${it.garantia ? " (Garantía SUPER GEEK)" : ""}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
