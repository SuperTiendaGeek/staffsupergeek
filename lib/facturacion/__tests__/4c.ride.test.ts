/**
 * Test 4c — Genera un RIDE PDF de prueba y lo guarda en disco para inspección visual.
 * Ejecutar:
 *   NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/4c.ride.test.ts
 */

import fs   from "fs";
import path from "path";

import { generarRide } from "../ride/generarRide";

(async () => {
  console.log("── 4c: Generación de RIDE PDF ──");

  const pdf = await generarRide({
    ruc:                  "1003710272001",
    razonSocial:          "BOLAÑOS FLORES ALEXIS RUBEN",
    nombreComercial:      "SUPER TIENDA GEEK",
    dirMatriz:            "Cristobal Colón entre Vicente Ramón Roca y Atahualpa, edificio Kaillari",
    dirEstablecimiento:   "C. Vicente Ramón Roca y C. Cristobal Colón",
    claveAcceso:          "2106202601100371027200110010020000006437242658515",
    ambiente:             "1",
    numeroFactura:        "001-002-000000643",
    fechaEmision:         new Date(2026, 5, 21),  // 21/06/2026
    numeroAutorizacion:   "2106202601100371027200110010020000006437242658515",
    fechaAutorizacion:    "2026-06-21T09:33:38-05:00",
    tipoIdentificacion:   "07",
    identificacion:       "9999999999999",
    razonSocialComprador: "CONSUMIDOR FINAL",
    totalConImpuestos: [
      { codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 10.00, valor: 1.50 },
    ],
    totalSinImpuestos: 10.00,
    totalDescuento:     0.00,
    total:             11.50,
    pagos: [{ formaPago: "01", total: 11.50 }],
    detalles: [
      {
        codigo:         "SRV-PRUEBA-001",
        descripcion:    "SERVICIO DE PRUEBA AMBIENTE CELCER",
        unidadMedida:   "UNIDAD",
        cantidad:       1.00,
        precioUnitario: 10.00,
        descuento:       0.00,
        total:          10.00,
      },
    ],
  });

  console.log(`  PDF generado: ${pdf.length} bytes`);

  const outPath = path.join(process.cwd(), "tmp-ride-test.pdf");
  fs.writeFileSync(outPath, pdf);
  console.log(`  Guardado en : ${outPath}`);
  console.log("\n✅  4c OK — abre tmp-ride-test.pdf para revisar el diseño");
  process.exit(0);
})().catch((e) => { console.error("❌", e); process.exit(1); });
