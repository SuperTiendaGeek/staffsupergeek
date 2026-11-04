/**
 * Ajuste de datos — auditoría Técnicos y Operaciones, Fase 2B (2-nov-2026).
 * "Las compras pasan por Logística": ordena lo que nació por la vía vieja.
 *
 *   1. Proveedor correcto en 4 artículos (SSD-000022, OTR-000216/217, REP-000127).
 *   2. TEC-000005 era un repuesto de la tienda: "Reajuste de inventario".
 *   3. 8 compras sin orden ni pago → orden de compra + pago desde la cuenta real
 *      (y los artículos que faltaban: batería de OP-024, cargador de OP-096,
 *      jack regalado de OP-117, apartados para su pedido).
 *   4. Pedidos vivos con artículo → su solicitud de compra "Comprada"; OP-132 → "Por comprar".
 *   5. OP-111 (ya tiene REC-000075) → Entregado.
 *   6. REP-000041 → dado de baja.
 *   7. OR000522: el SSD de 180 GB como parte de pago ($20) y $5 con tarjeta.
 *   8. (3-nov) Artículos apartados para un pedido que se veían "Disponible" → "Reservado".
 * Queda para la entrega de garantías: OR000425 / OP-122.
 * Datos: lib/compras/ajuste-fase2b.ts (con prueba).
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-fase2b.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-fase2b.ts --aplicar   # escribir
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
  const plan = await import("../lib/compras/ajuste-fase2b");
  const { airtableRequest, airtableMutation, tableUrl, linkedIds, fetchRecordById, firstNumber } = await import("../lib/finanzas/airtable-client");
  const ship = await import("../lib/shipping-v2/airtable");
  const { systemShippingV2Access } = await import("../lib/shipping-v2/access");
  const compras = await import("../lib/compras/servidor");
  const { actualizarEstadoOperacion } = await import("../lib/operaciones/airtable");
  const { getCuentaUnificada } = await import("../lib/cuenta-unificada");
  const { recibirParteDePago } = await import("../lib/parte-pago/servidor");
  const { createAbonoPorOrden } = await import("../lib/tecnicos/airtable");
  const { crearMovimientoParaAbono } = await import("../lib/finanzas/puentes/abonos");

  const acceso = systemShippingV2Access();
  const accesoAdmin = { ...acceso, isSiteAdmin: true };
  const esc = (s: string) => s.replace(/'/g, "\\'");
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
  const skus = new Set<string>([
    ...plan.CORRECCIONES_PROVEEDOR.map((c) => c.sku), ...plan.COMPRAS.flatMap((c) => c.skus),
    ...plan.REAJUSTES, ...plan.PEDIDOS_CON_ARTICULO.map((p) => p.sku), ...plan.BAJAS.map((b) => b.sku),
  ]);
  const items = new Map<string, Awaited<ReturnType<typeof ship.findShippingV2ItemBySku>>>();
  const leidos = new Map<string, import("../lib/compras/ajuste-fase2b").ArticuloLeido>();
  for (const sku of skus) {
    const it = await ship.findShippingV2ItemBySku(sku);
    items.set(sku, it);
    if (!it) continue;
    const situacion = await ship.getShippingV2SituacionPagoDeItem(it).catch(() => "sin-pago");
    leidos.set(sku, {
      sku, id: it.id, proveedorId: it.proveedorId ?? null, costo: it.costoProveedor ?? null,
      ordenCompraId: it.ordenCompraId ?? null, requierePago: it.requierePago === true,
      enPagoVivo: situacion === "pagado" || situacion === "pago-en-curso",
    });
  }
  const codigosOp = new Set<string>([
    ...plan.COMPRAS.flatMap((c) => c.nuevos.map((n) => n.operacion)), ...plan.PEDIDOS_CON_ARTICULO.map((p) => p.operacion),
    ...plan.PEDIDOS_POR_COMPRAR, ...plan.PEDIDOS_ENTREGADOS_CON_DOCUMENTO.map((p) => p.operacion),
  ]);
  const ops = new Map<string, Registro>();
  for (const codigo of codigosOp) {
    const r = (await buscar("Operación Comercial", `{Código Operación}='${esc(codigo)}'`))[0];
    if (r) ops.set(codigo, r);
  }
  const ocsMarcadas = await buscar("Shipping Órdenes de compra", `FIND('[Fase 2B', {Observaciones})`);
  const ocDe = (c: { clave: string }) => ocsMarcadas.find((r) => texto(r.fields["Observaciones"]).includes(plan.marcaCompra(c))) ?? null;

  const acciones: string[] = [];
  const bloqueos: string[] = [];

  // 1. Proveedores
  for (const c of plan.CORRECCIONES_PROVEEDOR) {
    const it = items.get(c.sku);
    if (!it) { bloqueos.push(`${c.sku} no existe.`); continue; }
    if (it.proveedorId !== c.proveedorId) acciones.push(`${c.sku}: proveedor → ${c.nombre}`);
  }
  // 2. Reajustes
  for (const sku of plan.REAJUSTES) {
    const it = items.get(sku);
    if (!it) { bloqueos.push(`${sku} no existe.`); continue; }
    if (it.tipoOperacion !== "Reajuste de inventario") acciones.push(`${sku}: "${it.tipoOperacion}" → "Reajuste de inventario" (sin pago)`);
  }
  // 3. Compras
  const estadoCompras = new Map<string, { ocId: string | null; pagada: boolean }>();
  for (const c of plan.COMPRAS) {
    const oc = ocDe(c);
    let pagada = false;
    if (oc) pagada = (await ship.getShippingV2OrdenCompraById(oc.id, acceso)).resumen.situacion === "pagada";
    estadoCompras.set(c.clave, { ocId: oc?.id ?? null, pagada });
    const r = plan.revisarCompra(c, leidos, oc ? { id: oc.id, pagada } : null);
    for (const n of c.nuevos) if (!ops.get(n.operacion)) r.bloqueos.push(`${n.operacion} no existe.`);
    r.acciones.forEach((a) => acciones.push(`Compra ${c.clave}: ${a}`));
    r.bloqueos.forEach((b) => bloqueos.push(`Compra ${c.clave}: ${b}`));
  }
  // 4. Pedidos con artículo / por comprar
  for (const p of plan.PEDIDOS_CON_ARTICULO) {
    const op = ops.get(p.operacion);
    const it = items.get(p.sku);
    if (!op || !it) { bloqueos.push(`${p.operacion} o ${p.sku} no existe.`); continue; }
    if (!linkedIds(op.fields["Opción Elegida"])[0]) { bloqueos.push(`${p.operacion} no tiene opción elegida.`); continue; }
    if (!linkedIds(op.fields["Solicitudes de Compra"]).length) acciones.push(`${p.operacion}: solicitud "Comprada" con ${p.sku}`);
  }
  for (const codigo of plan.PEDIDOS_POR_COMPRAR) {
    const op = ops.get(codigo);
    if (!op) { bloqueos.push(`${codigo} no existe.`); continue; }
    if (texto(op.fields["Estado"]) !== "Aprobado") bloqueos.push(`${codigo} está "${texto(op.fields["Estado"])}", no "Aprobado".`);
    else if (!linkedIds(op.fields["Solicitudes de Compra"]).length) acciones.push(`${codigo}: solicitud "Por comprar"`);
  }
  // 5. Entregados con documento
  for (const p of plan.PEDIDOS_ENTREGADOS_CON_DOCUMENTO) {
    const op = ops.get(p.operacion);
    if (!op) { bloqueos.push(`${p.operacion} no existe.`); continue; }
    if (texto(op.fields["Estado"]) !== "Entregado") acciones.push(`${p.operacion}: → Entregado (tiene ${p.documento})`);
  }
  // 6. Bajas
  for (const b of plan.BAJAS) {
    const it = items.get(b.sku);
    if (!it) { bloqueos.push(`${b.sku} no existe.`); continue; }
    if ((it.cantidad ?? 0) > 0 && it.estado !== "Dado de baja") acciones.push(`${b.sku}: dar de baja`);
  }
  // 7. OR000522
  const orden = (await buscar("Órdenes de Reparación", `{ID}='${plan.OR000522.orden}'`))[0];
  let hacerParte = false;
  let hacerTarjeta = false;
  if (!orden) bloqueos.push(`${plan.OR000522.orden} no existe.`);
  else {
    const cuenta = await getCuentaUnificada({ ordenId: orden.id });
    const vigentes = cuenta.abonos.filter((a) => a.estado !== "Anulado");
    hacerParte = !vigentes.some((a) => a.metodoPago === "Parte de pago");
    hacerTarjeta = !vigentes.some((a) => a.metodoPago === plan.OR000522.tarjeta.metodo && Math.abs(a.monto - plan.OR000522.tarjeta.monto) < 0.01);
    const falta = (hacerParte ? plan.OR000522.parteDePago.valor : 0) + (hacerTarjeta ? plan.OR000522.tarjeta.monto : 0);
    if (Math.abs(cuenta.saldo - falta) > 0.01) bloqueos.push(`${plan.OR000522.orden} debe $${cuenta.saldo.toFixed(2)}; se esperaba $${falta.toFixed(2)}.`);
    if (hacerParte) acciones.push(`${plan.OR000522.orden}: parte de pago ${plan.OR000522.parteDePago.descripcion} $${plan.OR000522.parteDePago.valor}`);
    if (hacerTarjeta) acciones.push(`${plan.OR000522.orden}: abono $${plan.OR000522.tarjeta.monto} ${plan.OR000522.tarjeta.metodo} (los $30 del cargador van como venta adicional al emitir)`);
  }

  // 8. Etiqueta "Reservado" de los artículos apartados para estos pedidos
  const etiquetas: Array<{ id: string; sku: string; fields: Record<string, string> }> = [];
  for (const [codigo, op] of ops) {
    const fresco = await fetchRecordById("Operación Comercial", op.id);
    for (const itemId of linkedIds(fresco?.fields["Artículo físico"])) {
      const it = await fetchRecordById("Shipping Items", itemId);
      if (!it) continue;
      const cambio = compras.etiquetaDeApartado(it.fields, firstNumber(it.fields["Cantidad Reservada"]) ?? 0);
      if (!Object.keys(cambio).length) continue;
      const sku = texto(it.fields["SKU"]) || itemId;
      etiquetas.push({ id: itemId, sku, fields: cambio });
      acciones.push(`${sku} (${codigo}): "${texto(it.fields["Estado Item"])}" → "${Object.values(cambio)[0]}"`);
    }
  }

  console.log("\nFase 2B — acciones:");
  acciones.forEach((a) => console.log(`  · ${a}`));
  bloqueos.forEach((b) => console.log(`  ✗ ${b}`));
  console.log(`\nAcciones: ${acciones.length}. Bloqueos: ${bloqueos.length}.`);
  if (!APLICAR) { console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar"); return; }
  if (bloqueos.length) throw new Error("Hay bloqueos: no se aplica nada. Revisa la vista previa.");

  // ── Escritura ──────────────────────────────────────────────────────────────
  for (const c of plan.CORRECCIONES_PROVEEDOR) {
    const it = items.get(c.sku)!;
    if (it.proveedorId === c.proveedorId) continue;
    await patch("Shipping Items", it.id, { "Proveedor de compra": [c.proveedorId] });
    console.log(`✓ ${c.sku}: proveedor ${c.nombre}`);
  }
  for (const sku of plan.REAJUSTES) {
    const it = items.get(sku)!;
    if (it.tipoOperacion === "Reajuste de inventario") continue;
    await patch("Shipping Items", it.id, { "Tipo de operación": "Reajuste de inventario", "Requiere pago": false });
    console.log(`✓ ${sku}: reajuste de inventario`);
  }

  for (const c of plan.COMPRAS) {
    const estado = estadoCompras.get(c.clave)!;
    if (estado.pagada) continue;
    let ocId = estado.ocId;
    if (!ocId) {
      const oc = await ship.createShippingV2OrdenCompra(
        { proveedorId: c.proveedorId, fechaCompra: c.fecha, observaciones: `${plan.marcaCompra(c)} Compra registrada después (auditoría, decisión del dueño 2-nov-2026).` },
        { registradoPor: QUIEN, access: acceso },
      );
      ocId = oc.id;
      console.log(`✓ Compra ${c.clave}: ${oc.ocId} (${c.proveedor})`);
    }
    for (const sku of c.skus) {
      const it = items.get(sku)!;
      if (it.ordenCompraId === ocId) continue;
      await patch("Shipping Items", it.id, { "Orden de compra": [ocId] });
    }
    for (const n of c.nuevos) {
      const op = ops.get(n.operacion)!;
      const opcionId = linkedIds(op.fields["Opción Elegida"])[0];
      if (!opcionId) throw new Error(`${n.operacion} no tiene opción elegida.`);
      const yaTiene = (await buscar("Operación Comercial", `RECORD_ID()='${op.id}'`))[0];
      if (linkedIds(yaTiene?.fields["Artículo físico"]).length) { console.log(`· ${n.operacion} ya tiene artículo`); continue; }
      const creado = await ship.createShippingV2Item(
        {
          nombre: n.nombre, tipoOperacion: n.regalo ? "Regalo de proveedor" : "Compra a proveedor", tipoItem: "",
          categoria: n.categoria, condicion: "Nuevo", estado: "Disponible", origenArticulo: "Ya está en la tienda",
          proveedorId: c.proveedorId, costoProveedor: n.regalo ? 0 : n.costo, cantidad: 1,
          // Ya se instaló o se entregó hace tiempo: no espera inspección.
          requiereInspeccion: false,
          observacionesInternas: `[${c.fecha}] Registrado después de entregado (auditoría Fase 2B, decisión del dueño 2-nov-2026) para ${n.operacion}.`,
        },
        { registradoPor: QUIEN, ordenCompraId: ocId },
      );
      const s = await compras.asegurarSolicitudDeOpcion({ operacionId: op.id, opcionId, usuario: QUIEN });
      await compras.aplicarCompra({ solicitudId: s.id, itemId: creado.id, ordenCompraId: ocId, usuario: QUIEN });
      console.log(`✓ Compra ${c.clave}: ${creado.sku} apartado para ${n.operacion}`);
    }
    if (c.pago) {
      await ship.registrarPagoOrdenCompra(
        ocId,
        { fechaPagoReal: `${c.fecha}T17:00:00.000Z`, metodoPago: c.pago.metodo, cuentaOrigen: c.pago.cuenta, observacion: `Pago registrado después (auditoría Fase 2B, decisión del dueño 2-nov-2026).` },
        { registradoPor: QUIEN, access: acceso },
      );
      console.log(`✓ Compra ${c.clave}: pago $${c.total.toFixed(2)} (${c.pago.cuenta.trim()})`);
    }
  }

  for (const p of plan.PEDIDOS_CON_ARTICULO) {
    const op = ops.get(p.operacion)!;
    const it = items.get(p.sku)!;
    const fresco = await ship.findShippingV2ItemBySku(p.sku);
    const r = await compras.registrarCompraExistenteDeOpcion({
      operacionId: op.id, opcionId: linkedIds(op.fields["Opción Elegida"])[0], itemId: it.id, ordenCompraId: fresco?.ordenCompraId ?? null, usuario: QUIEN,
    });
    if (r.creada) console.log(`✓ ${p.operacion}: ${r.codigo} comprada (${p.sku})`);
  }
  for (const codigo of plan.PEDIDOS_POR_COMPRAR) {
    const op = ops.get(codigo)!;
    if (linkedIds(op.fields["Solicitudes de Compra"]).length) continue;
    const s = await compras.asegurarSolicitudDeOpcion({ operacionId: op.id, opcionId: linkedIds(op.fields["Opción Elegida"])[0], usuario: QUIEN });
    console.log(`✓ ${codigo}: ${s.codigo} por comprar`);
  }
  for (const p of plan.PEDIDOS_ENTREGADOS_CON_DOCUMENTO) {
    const op = ops.get(p.operacion)!;
    if (texto(op.fields["Estado"]) === "Entregado") continue;
    await actualizarEstadoOperacion(op.id, "Entregado");
    console.log(`✓ ${p.operacion}: Entregado`);
  }
  for (const b of plan.BAJAS) {
    const it = items.get(b.sku)!;
    if (!((it.cantidad ?? 0) > 0) || it.estado === "Dado de baja") continue;
    await ship.moverActivoShippingV2(it.id, { accion: "baja", cantidad: 1, motivo: b.motivo }, { actor: QUIEN, access: accesoAdmin });
    console.log(`✓ ${b.sku}: dado de baja`);
  }

  if (orden) {
    const sesion = {
      user: { userId: "claude", nombre: QUIEN, email: "", rol: "admin", appsPermitidas: [], pantallasRestringidas: {}, camposRestringidos: {} },
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    } as unknown as import("../lib/session").StaffSession;
    if (hacerParte) {
      const r = await recibirParteDePago({ origen: { tipo: "orden", recordId: orden.id }, session: sesion, articulo: plan.OR000522.parteDePago });
      if (!r.ok) throw new Error(`Parte de pago: ${r.error}`);
      console.log(`✓ ${plan.OR000522.orden}: parte de pago ${r.sku} $${r.valor}${r.warning ? ` (${r.warning})` : ""}`);
    }
    if (hacerTarjeta) {
      const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
      const { abono } = await createAbonoPorOrden({
        ordenRecordId: orden.id, fecha: hoy, monto: plan.OR000522.tarjeta.monto, metodoPago: plan.OR000522.tarjeta.metodo,
        observacion: "Parte del voucher de $35 con tarjeta de crédito del día de la entrega (no se registró). Los $30 restantes son el cargador Dell (venta adicional).",
        numeroTransaccion: null, registradoPor: QUIEN,
      });
      const fin = await crearMovimientoParaAbono({ abonoId: abono.id, monto: plan.OR000522.tarjeta.monto, metodoPago: plan.OR000522.tarjeta.metodo, fecha: new Date().toISOString(), registradoPor: QUIEN });
      console.log(`✓ ${plan.OR000522.orden}: abono $${plan.OR000522.tarjeta.monto} con tarjeta${fin.ok ? "" : ` (Finanzas: ${fin.error})`}`);
    }
  }
  for (const e of etiquetas) {
    await patch("Shipping Items", e.id, e.fields);
    console.log(`✓ ${e.sku}: ${Object.values(e.fields)[0]}`);
  }
  console.log("\n✅ Listo. Vuelve a correr la vista previa: debe decir 0 acciones.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
