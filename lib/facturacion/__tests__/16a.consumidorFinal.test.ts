/**
 * Test 16a — assertConsumidorFinalPermitido() (Fase 16 PR1 — endurecimiento).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/16a.consumidorFinal.test.ts
 *
 * Puro, sin red: no toca Airtable ni el SRI. A diferencia de los tests con
 * console.assert del resto de la carpeta, este archivo lanza en la primera
 * falla y sale con código distinto de 0, para que "correr la suite" sea una
 * señal real de verde/rojo.
 */

import { assertConsumidorFinalPermitido } from "../reglas/consumidorFinal";
import { FacturacionRechazoError } from "../errores";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function lanza(fn: () => void): FacturacionRechazoError | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof FacturacionRechazoError) return e;
    throw e; // un error que no es del tipo esperado sí debe reventar el test
  }
}

const LIMITE = 50;

// (c) Consumidor Final sobre el límite → rechazado
{
  const err = lanza(() => assertConsumidorFinalPermitido("07", 50, LIMITE));
  assert(err instanceof FacturacionRechazoError, "Consumidor Final con total == límite debe rechazarse");
  assert(!!err?.message.includes("$50.00"), "El mensaje debe incluir el límite configurado");
}
{
  const err = lanza(() => assertConsumidorFinalPermitido("07", 250.5, LIMITE));
  assert(err instanceof FacturacionRechazoError, "Consumidor Final muy por encima del límite debe rechazarse");
}

// (d) Consumidor Final bajo el límite → pasa
{
  const err = lanza(() => assertConsumidorFinalPermitido("07", 49.99, LIMITE));
  assert(err === null, "Consumidor Final bajo el límite no debe lanzar");
}
{
  const err = lanza(() => assertConsumidorFinalPermitido("07", 0, LIMITE));
  assert(err === null, "Consumidor Final con total 0 no debe lanzar");
}

// (e) Cliente identificado (no Consumidor Final) sobre el límite → pasa
{
  const err = lanza(() => assertConsumidorFinalPermitido("05", 500, LIMITE)); // cédula
  assert(err === null, "Cliente con cédula sobre el límite no debe lanzar");
}
{
  const err = lanza(() => assertConsumidorFinalPermitido("04", 5000, LIMITE)); // RUC
  assert(err === null, "Cliente con RUC sobre el límite no debe lanzar");
}

// Límite configurable: un límite distinto de 50 se respeta
{
  const err = lanza(() => assertConsumidorFinalPermitido("07", 150, 200));
  assert(err === null, "Con límite configurado a 200, Consumidor Final en 150 no debe lanzar");
}
{
  const err = lanza(() => assertConsumidorFinalPermitido("07", 200, 200));
  assert(err instanceof FacturacionRechazoError, "Con límite configurado a 200, Consumidor Final en 200 debe rechazarse");
}

if (fallos > 0) {
  console.error(`\n❌ 16a.consumidorFinal.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ 16a.consumidorFinal.test.ts — todos los asserts pasaron");
