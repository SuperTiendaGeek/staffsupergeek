/**
 * Verifica el ACCESO a DeUna QA (etapa D2). Solo ambiente de pruebas:
 *   1) pide un cobro dinámico de $0.01 a apis-merchant.qa.deunalab.com con la caja QA;
 *   2) lo consulta (/payment/info) — debe responder PENDING (nadie lo pagó).
 * No toca Airtable, ni producción, ni PayPhone. No imprime credenciales: solo
 * códigos de estado y los primeros caracteres del ID.
 *
 *   NODE_OPTIONS="--conditions react-server" npx tsx --env-file=<archivo privado con DEUNA_QA_*> scripts/deuna-qa-verificar.ts [mostrador]
 */
import { configPasarela, puedeConsultar } from "@/lib/pagos-en-linea/config";
import { consultarPagoDeUna, solicitarCobroDeUna } from "@/lib/pagos-en-linea/deuna";

(async () => {
  const c = configPasarela("DeUna", "Prueba");
  if (!c.base.includes(".qa.deunalab.com")) { console.error("✗ No es la dirección de QA. Se detiene."); process.exit(1); }
  if (!puedeConsultar(c)) { console.error("✗ Faltan DEUNA_QA_API_KEY, DEUNA_QA_API_SECRET o DEUNA_QA_POINT_OF_SALE."); process.exit(1); }
  const caja = process.argv[2] === "mostrador" ? c.cajaMostrador : c.caja;
  console.log(`Ambiente: QA · caja ${caja}`);
  const codigo = `QA-${Date.now().toString().slice(-8)}`;
  try {
    const cobro = await solicitarCobroDeUna(c, { codigo, monto: 0.01, detalle: "Prueba de acceso SUPER GEEK", caja });
    console.log(`✓ Cobro creado · ID ${cobro.transactionId.slice(0, 8)}… · enlace ${cobro.deeplink ? new URL(cobro.deeplink).host : "—"} · QR ${cobro.qr ? "sí" : "no"}`);
    const info = await consultarPagoDeUna(c, cobro.transactionId, "transaccion");
    console.log(`✓ Consulta · estado ${info.status} (esperado PENDING) · caja informada ${info.posId || "—"}`);
    const porRef = await consultarPagoDeUna(c, codigo, "referencia").catch((e) => ({ status: `error: ${e instanceof Error ? e.message : "?"}` }));
    console.log(`✓ Consulta por referencia ${codigo} · estado ${porRef.status}`);
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : "error"}`);
    process.exit(1);
  }
})();
