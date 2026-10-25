/**
 * Reconstrucción de la historia del Kardex (auditoría Shipping V2, punto 12),
 * decisión del dueño del 24-oct-2026: "reconstruir todo".
 *
 * Arma, para cada registro de Shipping Items, los movimientos que faltan en
 * "Shipping Kardex": su entrada a la tienda, las ventas (facturas y recibos),
 * anulaciones y devoluciones (notas de crédito), piezas usadas en mejoras,
 * bajas, cuadres y despieces. Reglas en lib/shipping-v2/kardex-reconstruccion.ts.
 * Usa las mismas claves que el sistema: se puede correr más de una vez sin
 * duplicar nada (la segunda vista previa debe decir 0 movimientos nuevos).
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto12-kardex.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto12-kardex.ts --aplicar   # escribir
 *   ... --sku=LAP-000042   (muestra los movimientos de un SKU en la vista previa)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const SKU = process.argv.find((a) => a.startsWith("--sku="))?.slice(6).toUpperCase() ?? "";
/** Tope de seguridad: si la vista previa da muchos más, algo está mal y no se escribe. */
const TOPE = 3000;

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

async function main() {
  await cargarEnvLocal();
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  const { listarTabla, leerMovimientos, escribirMovimientosKardex } = await import("../lib/shipping-v2/kardex-registro");
  const { reconstruirKardex } = await import("../lib/shipping-v2/kardex-reconstruccion");
  const { saldosPorRegistro } = await import("../lib/shipping-v2/kardex");

  console.log("Leyendo Airtable…");
  const [items, facturas, recibos, notas, intervenciones, eventos, packings, proveedores, existentes] = await Promise.all([
    listarTabla("Shipping Items", {
      campos: [
        "SKU", "Nombre del item", "Categoría", "Número de serie", "Es uso local", "Recibido", "Estado Item", "Cantidad", "Cantidad Reservada",
        "Unidades compradas", "Costo proveedor", "Costo flete asignado", "Costo arancel asignado", "Otros costos asignados", "Costo de mejoras",
        "Costo total unidad", "Costo asignado por despiece", "Tipo de operación", "Es regalo", "Item padre", "Es parte recuperada",
        "Intervenciones (pieza retirada)", "Shipping Packings", "Orden de compra", "Proveedor de compra", "Fecha de registro", "Registrado por",
        "Última actualización", "Unidades dadas de baja", "Vendidas fuera del sistema", "Salidas internas", "Ventas de otro artículo",
        "Estado de despiece", "Fecha de despiece", "Responsable de despiece", "Factura", "Recibo", "Nota de Crédito", "Origen del artículo",
        "Observaciones internas",
      ],
    }),
    listarTabla("Facturas Electrónicas", {
      formula: "AND({Estado}='AUTORIZADO', {Líneas JSON}!='')",
      campos: ["Número de Factura", "Fecha de Emisión", "Ambiente", "Cliente - Nombre", "Estado", "Líneas JSON", "Sincronización Inventario", "Estado Anulación", "Fecha Solicitud Anulación"],
    }),
    listarTabla("Recibos", { campos: ["Número", "Fecha", "Estado", "Cliente Nombre", "Sincronización Inventario", "Líneas JSON"] }),
    listarTabla("Notas de Crédito Electrónicas", {
      formula: "{Estado}='AUTORIZADO'",
      campos: ["Número de Nota de Crédito", "Estado", "Ambiente", "Fecha de Emisión", "Cliente Nombre", "Líneas JSON", "Reverso Inventario"],
    }),
    listarTabla("Shipping Intervenciones", {
      campos: ["Tipo", "Item ID", "Item", "Repuesto usado", "Cantidad usada", "Fecha", "Anulada", "Fecha de anulación", "Realizado por", "Detalle", "Anulada por", "Motivo de anulación"],
    }),
    listarTabla("Shipping Eventos", {
      formula: "OR(FIND('Recepción: Recibido = sí', {Descripción del evento}), FIND('de baja:', {Descripción del evento}), FIND('Baja revertida', {Descripción del evento}), FIND('Cuadre de unidades', {Descripción del evento}))",
      campos: ["Item relacionado", "Descripción del evento", "Fecha del evento", "Registrado por", "Observación"],
    }),
    listarTabla("Shipping Packings", { campos: ["Packing ID", "Fecha de recepción"] }),
    listarTabla("Shipping Proveedores", { campos: ["Nombre proveedor"] }),
    leerMovimientos(),
  ]);
  console.log(`Artículos ${items.length} · facturas ${facturas.length} · recibos ${recibos.length} · notas ${notas.length} · intervenciones ${intervenciones.length} · eventos ${eventos.length} · ya en el Kardex ${existentes.length}`);

  const r = reconstruirKardex({ items, facturas, recibos, notas, intervenciones, eventos, packings, proveedores, existentes });

  const porMotivo: Record<string, number> = {};
  for (const m of r.nuevos) porMotivo[m.motivo] = (porMotivo[m.motivo] ?? 0) + 1;
  console.log(`\nMovimientos nuevos: ${r.nuevos.length}`);
  for (const [motivo, n] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${motivo}`);
  const valor = Math.round(r.nuevos.reduce((s, m) => s + m.valor, 0) * 100) / 100;
  const saldos = saldosPorRegistro([...existentes, ...r.nuevos]);
  const unidades = [...saldos.values()].reduce((s, x) => s + x.cantidad, 0);
  console.log(`\nInventario según el Kardex, después: ${unidades} unidades · $${valor.toFixed(2)} (de lo nuevo)`);
  console.log(`Registros que no cuadran después de reconstruir: ${r.noCuadran.length} (deberían tener su asunto "Unidades no cuadran" en Control → Revisión)`);
  for (const f of r.noCuadran) console.log(`  ${f.sku.padEnd(11)} ${f.id} · entrada ${f.entrada} (${f.base}) · libro ${f.libro} · inventario ${f.inventario}`);
  if (SKU) {
    console.log(`\nMovimientos de ${SKU}:`);
    for (const m of r.nuevos.filter((m) => m.sku.toUpperCase() === SKU).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))) {
      console.log(`  ${m.fecha.slice(0, 16)}  ${m.motivo.padEnd(26)} ${String(m.cantidad).padStart(4)}  $${(m.costoUnitario ?? 0).toFixed(2)}  ${m.documento || m.documentoTipo}  ${m.contraparte}`);
    }
  }

  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }
  if (r.nuevos.length > TOPE) throw new Error(`Son ${r.nuevos.length} movimientos (tope ${TOPE}). No se aplica nada: revisar.`);
  console.log("\nEscribiendo…");
  await escribirMovimientosKardex(r.nuevos, (n) => { if (n % 100 === 0 || n === r.nuevos.length) console.log(`  ${n}/${r.nuevos.length}`); });
  console.log("Listo. Corre la vista previa otra vez: debe decir 0 movimientos nuevos.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
