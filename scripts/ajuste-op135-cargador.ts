/**
 * Ajuste de datos — OP-2026-000135 (Gabriel Peralta, cargador Asus 45/65W) · 6-nov-2026.
 * Decisión del dueño (6-nov): el cargador se le compró a DTC por $15 (pagado
 * desde SGINGRESOS) y ya se entregó con la factura de mostrador
 * 001-002-000000818. Se registra la compra real, el cargador queda vendido
 * con esa factura y el pedido se cierra; SOL-000014 sale de "Por comprar".
 * Regla y protecciones: lib/operaciones/ajuste-op135.ts (con prueba).
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-op135-cargador.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-op135-cargador.ts --aplicar   # escribir
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

async function main(): Promise<void> {
  await cargarEnvLocal();
  const plan = await import("../lib/operaciones/ajuste-op135");
  const { OP135 } = plan;
  const { airtableRequest, airtableMutation, tableUrl, linkedIds, fetchRecordById, firstNumber } = await import("../lib/finanzas/airtable-client");
  const ship = await import("../lib/shipping-v2/airtable");
  const { systemShippingV2Access } = await import("../lib/shipping-v2/access");
  const compras = await import("../lib/compras/servidor");
  const { actualizarEstadoOperacion, crearAbono } = await import("../lib/operaciones/airtable");
  const { postEmision } = await import("../lib/facturacion/gancho/postEmision");
  const { actualizarMovimientoSaldo } = await import("../lib/saldo-favor/airtable");
  const { getCuentaUnificada } = await import("../lib/cuenta-unificada");

  const acceso = systemShippingV2Access();
  async function buscar(tabla: string, formula: string): Promise<Registro[]> {
    const u = new URL(tableUrl(tabla));
    u.searchParams.set("pageSize", "100");
    u.searchParams.set("filterByFormula", formula);
    return (await airtableRequest<{ records?: Registro[] }>(u.toString())).records ?? [];
  }
  async function patch(tabla: string, id: string, fields: Record<string, unknown>) {
    await airtableMutation(tableUrl(tabla), { method: "PATCH", body: JSON.stringify({ records: [{ id, fields }], typecast: true }) });
  }

  // ── Lectura ────────────────────────────────────────────────────────────────
  async function leer() {
    const op = (await buscar("Operación Comercial", `{Código Operación}='${OP135.operacion}'`))[0] ?? null;
    const sol = (await buscar("Solicitudes de Compra", `{Código}='${OP135.solicitud}'`))[0] ?? null;
    const fac = (await buscar("Facturas Electrónicas", `{Número de Factura}='${OP135.factura}'`))[0] ?? null;
    const saf = (await buscar("Saldo a Favor", `{Código}='${OP135.saldoUsado}'`))[0] ?? null;
    const abonos = op ? await Promise.all(linkedIds(op.fields["Abonos"]).map((id) => fetchRecordById("Abonos", id))) : [];
    // El cargador: el que la compra apartó para el pedido (o el de la OC marcada).
    const ocs = await buscar("Shipping Órdenes de compra", `FIND('${OP135.marca}', {Observaciones})`);
    const oc = ocs[0] ?? null;
    let itemId: string | null = (sol ? linkedIds(sol.fields["Artículo"])[0] : null) ?? null;
    if (!itemId && op) itemId = linkedIds(op.fields["Artículo físico"])[0] ?? null;
    const item = itemId ? await fetchRecordById("Shipping Items", itemId) : null;
    let pagado = false;
    if (oc) pagado = (await ship.getShippingV2OrdenCompraById(oc.id, acceso)).resumen.situacion === "pagada";
    let lineas: { detalles?: Array<Record<string, unknown>> } & Record<string, unknown> = {};
    try { lineas = JSON.parse(texto(fac?.fields["Líneas JSON"]) || "{}"); } catch { lineas = {}; }
    const detalles = Array.isArray(lineas.detalles) ? lineas.detalles : [];
    const estado: import("../lib/operaciones/ajuste-op135").EstadoOp135 = {
      operacion: op ? {
        id: op.id, estado: texto(op.fields["Estado"]), facturaIds: linkedIds(op.fields["Facturas Electrónicas"]),
        opcionElegida: linkedIds(op.fields["Opción Elegida"]).length > 0,
        abonos: abonos.filter((a): a is NonNullable<typeof a> => !!a).map((a) => ({
          id: a.id, monto: firstNumber(a.fields["Monto"]) ?? 0, metodo: texto(a.fields["Método de Pago"]),
          estado: texto(a.fields["Estado del Abono"]), saldoIds: linkedIds(a.fields["Saldo a Favor"]),
        })),
      } : null,
      solicitud: sol ? { id: sol.id, estado: texto(sol.fields["Estado"]), itemId: linkedIds(sol.fields["Artículo"])[0] ?? null, operacionId: linkedIds(sol.fields["Operación"])[0] ?? null } : null,
      factura: fac ? {
        id: fac.id, estado: texto(fac.fields["Estado"]), total: firstNumber(fac.fields["Total"]) ?? 0,
        lineaConArticulo: !!item && detalles.some((d) => d.shippingItemId === item.id),
      } : null,
      saldo: saf ? {
        id: saf.id, tipo: texto(saf.fields["Tipo"]), estado: texto(saf.fields["Estado"]), monto: firstNumber(saf.fields["Monto"]) ?? 0,
        facturaIds: linkedIds(saf.fields["Factura"]), abonoIds: linkedIds(saf.fields["Abono"]),
      } : null,
      articulo: item ? {
        id: item.id, sku: texto(item.fields["SKU"]) || item.id, estado: texto(item.fields["Estado Item"]),
        facturaIds: linkedIds(item.fields["Factura"]), ordenCompraId: linkedIds(item.fields["Orden de compra"])[0] ?? oc?.id ?? null, pagado,
      } : null,
    };
    return { estado, op, fac, saf, oc, lineas, detalles };
  }

  const leido = await leer();
  const bloqueos = plan.bloqueosOp135(leido.estado);
  const pasos = plan.pasosOp135(leido.estado);

  console.log(`\n=== Ajuste ${OP135.operacion} (cargador Asus) — ${APLICAR ? "APLICAR" : "VISTA PREVIA"} ===\n`);
  if (bloqueos.length) {
    console.log("⛔ No se puede seguir:");
    bloqueos.forEach((b) => console.log(`   · ${b}`));
    process.exit(1);
  }
  console.log(`${pasos.length} acción(es):`);
  pasos.forEach((p, i) => console.log(`  ${i + 1}. ${plan.TEXTO_PASO[p]}`));
  console.log(`\nCuenta del pedido después: cargo $${OP135.facturaTotal} · abonado $${plan.abonadoTrasAjuste(leido.estado).toFixed(2)} → saldo $0.`);
  if (!APLICAR || pasos.length === 0) {
    if (!APLICAR && pasos.length) console.log("\n(Vista previa: no se escribió nada. Corre con --aplicar cuando el dueño lo apruebe.)");
    return;
  }

  // ── Escritura ──────────────────────────────────────────────────────────────
  const { estado } = leido;
  const op = leido.op!;
  const fac = leido.fac!;
  let itemId = estado.articulo?.id ?? null;
  let ocId = estado.articulo?.ordenCompraId ?? leido.oc?.id ?? null;

  if (pasos.includes("compra")) {
    if (!ocId) {
      const oc = await ship.createShippingV2OrdenCompra(
        { proveedorId: OP135.proveedorId, fechaCompra: OP135.fechaCompra, observaciones: `${OP135.marca} Compra del cargador de ${OP135.operacion} registrada después de entregado (decisión del dueño 6-nov-2026).` },
        { registradoPor: QUIEN, access: acceso },
      );
      ocId = oc.id;
      console.log(`✓ Orden de compra ${oc.ocId} (${OP135.proveedor})`);
    }
    const creado = await ship.createShippingV2Item(
      {
        nombre: OP135.articulo.nombre, tipoOperacion: "Compra a proveedor", tipoItem: "",
        categoria: OP135.articulo.categoria, condicion: "Nuevo", estado: "Disponible", origenArticulo: "Ya está en la tienda",
        proveedorId: OP135.proveedorId, costoProveedor: OP135.costo, precioVenta: OP135.articulo.precioVenta, cantidad: 1,
        // Ya se entregó al cliente: no espera inspección.
        requiereInspeccion: false,
        observacionesInternas: `[${OP135.fechaCompra}] ${OP135.marca} Registrado después de entregado con la factura ${OP135.factura} (decisión del dueño 6-nov-2026).`,
      },
      { registradoPor: QUIEN, ordenCompraId: ocId },
    );
    itemId = creado.id;
    await compras.aplicarCompra({ solicitudId: estado.solicitud!.id, itemId, ordenCompraId: ocId, usuario: QUIEN });
    console.log(`✓ ${creado.sku} apartado para ${OP135.operacion}; ${OP135.solicitud} → Comprada`);
  }
  if (!itemId || !ocId) throw new Error("No quedó registrado el cargador o su orden de compra.");

  if (pasos.includes("pago")) {
    await ship.registrarPagoOrdenCompra(
      ocId,
      { fechaPagoReal: `${OP135.fechaCompra}T17:00:00.000Z`, metodoPago: OP135.pago.metodo, cuentaOrigen: OP135.pago.cuenta, observacion: `Pago a ${OP135.proveedor} registrado después (decisión del dueño 6-nov-2026).` },
      { registradoPor: QUIEN, access: acceso },
    );
    console.log(`✓ Pago a ${OP135.proveedor} $${OP135.costo} (SGINGRESOS)`);
  }

  const linea = leido.detalles[0];
  if (pasos.includes("venta")) {
    const r = await postEmision({
      facturaRecordId: fac.id,
      ambiente: "2",
      liberaReserva: true,
      detalles: [{
        descripcion: texto(linea?.descripcion) || OP135.articulo.nombre, cantidad: 1,
        precioUnitario: OP135.facturaSubtotal, descuento: 0, precioTotalSinImpuesto: OP135.facturaSubtotal,
        impuestos: [], tipo: "producto", shippingItemId: itemId,
      }],
    });
    if (r.estado !== "OK") throw new Error(`Venta: ${r.detalle ?? "no se pudo marcar vendido"}`);
    console.log(`✓ Cargador vendido con la factura ${OP135.factura}`);
  }

  if (pasos.includes("linea-factura")) {
    if (!linea) throw new Error(`La factura ${OP135.factura} no tiene líneas.`);
    const detalles = leido.detalles.map((d, i) => (i === 0 ? { ...d, tipo: "producto", shippingItemId: itemId } : d));
    await patch("Facturas Electrónicas", fac.id, { "Líneas JSON": JSON.stringify({ ...leido.lineas, detalles }) });
    console.log(`✓ Factura ${OP135.factura}: línea interna enlazada al cargador`);
  }

  if (pasos.includes("enlace-factura")) {
    await patch("Operación Comercial", op.id, { "Facturas Electrónicas": [...new Set([...linkedIds(op.fields["Facturas Electrónicas"]), fac.id])] });
    console.log(`✓ ${OP135.operacion} enlazada a la factura ${OP135.factura}`);
  }

  if (pasos.includes("abono-saldo")) {
    const ab = await crearAbono({
      operacionId: op.id, ordenId: null, monto: OP135.facturaTotal, metodoPago: OP135.metodoSaldo,
      fechaAbono: `${OP135.fechaCompra}T22:15:00.000Z`,
      observacion: `Pagado con saldo a favor (${OP135.saldoUsado}) en la factura de mostrador ${OP135.factura}. No es dinero nuevo: el movimiento en Finanzas es el de la factura. Registrado después (decisión del dueño 6-nov-2026).`,
      registradoPor: QUIEN,
    });
    await actualizarMovimientoSaldo(leido.saf!.id, { Abono: [...new Set([...estado.saldo!.abonoIds, ab.id])], "Operación": [op.id] });
    console.log(`✓ ${OP135.operacion}: abono ${ab.idAbono} +$${OP135.facturaTotal} "Saldo a favor" (${OP135.saldoUsado})`);
  }

  if (pasos.includes("entregado")) {
    await actualizarEstadoOperacion(op.id, "Entregado");
    const nota = `[2026-11-06] Entregado con la factura de mostrador ${OP135.factura} (5-nov), pagada con el anticipo de $30 que se pasó a saldo a favor. El cargador se compró a ${OP135.proveedor} ($${OP135.costo}). Ajuste autorizado por el dueño.`;
    const previa = texto(op.fields["Observación Interna"]);
    await patch("Operación Comercial", op.id, { "Observación Interna": previa ? `${previa}\n${nota}` : nota });
    console.log(`✓ ${OP135.operacion} → Entregado`);
  }

  const cuenta = await getCuentaUnificada({ operacionId: op.id }).catch(() => null);
  if (cuenta) console.log(`\nCuenta de ${OP135.operacion}: saldo $${cuenta.saldo.toFixed(2)}${Math.abs(cuenta.saldo) > 0.01 ? "  ⚠ debería ser $0: revisar" : ""}`);
  console.log("\n✅ Listo. Vuelve a correr la vista previa: debe decir 0 acciones.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
