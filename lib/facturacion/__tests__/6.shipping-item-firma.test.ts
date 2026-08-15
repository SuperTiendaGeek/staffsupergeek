/**
 * Test de integración — Producto real de Shipping Items con comillas en descripción.
 *
 * Verifica que el fix de escText/escFree/normalizeXmlText resuelve Error 39
 * FIRMA INVALIDA al usar productos con caracteres especiales (ej. 16").
 *
 * Ejecutar:
 *   NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/6.shipping-item-firma.test.ts
 */

import fs   from "fs";
import path from "path";

function loadEnvLocal() {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key   = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch { /* sin .env.local */ }
}

loadEnvLocal();

import { assertPruebaConRedPermitida } from "./_guardaRed";
assertPruebaConRedPermitida("6.shipping-item-firma");

import { emitirFactura } from "../emitirFactura";
import { buscarProductos } from "../airtable/productos";

const REQUIRED = [
  "SRI_RUC", "SRI_RAZON_SOCIAL", "SRI_DIR_MATRIZ",
  "SRI_ESTABLECIMIENTO", "SRI_PUNTO_EMISION", "SRI_FIRMA_PATH", "SRI_FIRMA_PASSWORD",
  "AIRTABLE_API_KEY", "AIRTABLE_BASE_ID",
] as const;

function checkVars(): boolean {
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length) { console.log("⚠️  Faltan variables:", missing.join(", ")); return false; }
  const p12 = process.env.SRI_FIRMA_PATH!;
  if (!fs.existsSync(p12)) { console.log(`⚠️  SRI_FIRMA_PATH no existe: ${p12}`); return false; }
  return true;
}

(async () => {
  if (!checkVars()) process.exit(0);

  console.log("═".repeat(70));
  console.log("  TEST 6 — Shipping Items: producto con comillas (Error 39 fix)");
  console.log("═".repeat(70));

  // 1. Buscar un producto Dell o Lenovo con comillas en el nombre
  console.log('\n── Buscando producto "Dell" en Shipping Items…');
  const productos = await buscarProductos("Dell", 5);
  console.log(`   Encontrados: ${productos.length}`);
  for (const p of productos) {
    console.log(`   • [${p.sku}] ${p.nombre} — $${p.precioVenta}`);
  }

  // Elegir el primero disponible; si no hay Dell, buscar Lenovo
  let producto = productos[0];
  if (!producto) {
    console.log('\n   Sin Dell, buscando "Lenovo"…');
    const lenovo = await buscarProductos("Lenovo", 5);
    producto = lenovo[0];
    if (!producto) {
      console.log("⚠️  Sin productos disponibles — abortando");
      process.exit(0);
    }
  }

  console.log(`\n── Usando producto: [${producto.sku}] "${producto.nombre}"`);
  console.log(`   Precio: $${producto.precioVenta} | Unidad: ${producto.unidad}`);

  // 2. Construir factura de PRUEBA contra celcer (1 unidad)
  const qty   = 1;
  const price = producto.precioVenta;
  const base  = parseFloat((qty * price).toFixed(2));
  const iva   = parseFloat((base * 0.15).toFixed(2));
  const total = parseFloat((base + iva).toFixed(2));

  console.log(`\n── Totales: base=${base} iva=${iva} total=${total}`);
  console.log("── Emitiendo contra SRI (ambiente pruebas)…\n");

  const resultado = await emitirFactura({
    tipoIdentificacionComprador: "04",
    razonSocialComprador:        "CELCER CIA. LTDA.",
    identificacionComprador:     "1792270285001",

    detalles: [
      {
        codigoPrincipal:        producto.sku || "SG-ITEM",
        descripcion:            producto.nombre,
        unidadMedida:           producto.unidad || "UNIDAD",
        cantidad:               qty,
        precioUnitario:         price,
        descuento:              0,
        precioTotalSinImpuesto: base,
        impuestos: [
          {
            codigo:           "2",
            codigoPorcentaje: "4",
            tarifa:           15,
            baseImponible:    base,
            valor:            iva,
          },
        ],
      },
    ],

    totalSinImpuestos: base,
    totalDescuento:    0,
    totalConImpuestos: [
      {
        codigo:           "2",
        codigoPorcentaje: "4",
        baseImponible:    base,
        tarifa:           15,
        valor:            iva,
      },
    ],
    importeTotal: total,
    pagos: [{ formaPago: "01", total }],
  });

  console.log("\n── RESPUESTA CRUDA ──");
  console.log(JSON.stringify(resultado, null, 2));

  if (resultado.estado === "AUTORIZADO") {
    console.log("\n✅  AUTORIZADO — Error 39 resuelto");
    console.log(`  Número: ${resultado.numeroFactura}`);
    console.log(`  Autorización: ${resultado.numeroAutorizacion}`);
  } else {
    console.log(`\n❌  Estado: ${resultado.estado}`);
    if (resultado.mensajes?.length) {
      console.log("  Mensajes SRI:");
      for (const m of resultado.mensajes) {
        console.log(`    [${m.identificador}] ${m.tipo}: ${m.mensaje}`);
      }
    }
    process.exit(1);
  }

  process.exit(0);
})().catch((e) => { console.error("❌", e); process.exit(1); });
