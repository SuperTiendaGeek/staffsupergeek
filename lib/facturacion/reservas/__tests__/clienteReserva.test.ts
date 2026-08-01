/**
 * F-36 — el cliente de una reserva se guarda cuatro veces; manda la ficha viva.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/reservas/__tests__/clienteReserva.test.ts
 *
 * Caso que motiva el arreglo: se crea una reserva con la cédula mal escrita,
 * luego se corrige en la ficha del cliente. Antes, el comprobante seguía
 * imprimiendo la cédula vieja porque ganaba la copia congelada dentro de
 * "Abonos JSON". Ahora gana la ficha.
 *
 * El caso opuesto también importa: un cliente de mostrador sin ficha (sin
 * vínculo) debe conservar sus datos tal cual, y una ficha con campos vacíos
 * NO debe borrar lo que la reserva sí tenía.
 */

import { combinarClienteReserva, copiaDesactualizada } from "../clienteReserva";
import type { ReservaCliente } from "../types";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

function main(): void {
  // ── 1. La ficha corrige un dato mal escrito ────────────────────────────────
  const guardadoConError: ReservaCliente = {
    razonSocial: "ALEXIS BOLAÑOS",
    identificacion: "100371272001", // cédula con un dígito de menos
    correo: "alexis@ejemplo.com",
  };
  const fichaCorregida = {
    Nombre: "ALEXIS BOLAÑOS",
    "Cédula": "1003710272001",
    Correo: "alexis@ejemplo.com",
  };

  const r1 = combinarClienteReserva(guardadoConError, fichaCorregida, "recCLI001");
  assert(r1.identificacion === "1003710272001", `La cédula corregida en la ficha gana (vino ${r1.identificacion})`);
  assert(r1.airtableId === "recCLI001", "Se conserva el vínculo al cliente");
  assert(copiaDesactualizada(guardadoConError, r1), "Se detecta que la copia de la reserva quedó vieja");

  // ── 2. Una ficha con huecos NO borra lo que la reserva sí tenía ─────────────
  const guardadoCompleto: ReservaCliente = {
    razonSocial: "ABIGAIL MORENO",
    identificacion: "1719956953",
    correo: "abigail@ejemplo.com",
    telefono: "0999999999",
  };
  const fichaIncompleta = { Nombre: "ABIGAIL MORENO", "Cédula": "1719956953", Correo: "", "Teléfono": "" };

  const r2 = combinarClienteReserva(guardadoCompleto, fichaIncompleta, "recCLI002");
  assert(r2.correo === "abigail@ejemplo.com", "Un correo vacío en la ficha no borra el de la reserva");
  assert(r2.telefono === "0999999999", "Un teléfono vacío en la ficha no borra el de la reserva");

  // ── 3. La razón social nunca queda vacía ───────────────────────────────────
  const r3 = combinarClienteReserva(guardadoCompleto, { Nombre: "", "Cédula": "1719956953" }, "recCLI002");
  assert(r3.razonSocial === "ABIGAIL MORENO", "Sin nombre en la ficha se conserva el de la reserva");

  // ── 4. Cliente de mostrador, sin ficha ─────────────────────────────────────
  const mostrador: ReservaCliente = { razonSocial: "CONSUMIDOR FINAL" };
  const r4 = combinarClienteReserva(mostrador, null, undefined);
  assert(r4.razonSocial === "CONSUMIDOR FINAL", "Sin vínculo se respeta lo guardado en la reserva");
  assert(r4.airtableId === undefined, "Sin vínculo no se inventa un airtableId");

  // ── 5. Hay vínculo pero la ficha no se pudo leer ───────────────────────────
  const r5 = combinarClienteReserva(guardadoCompleto, null, "recCLI002");
  assert(r5.razonSocial === "ABIGAIL MORENO", "Si la ficha no se puede leer, se usa la copia guardada");
  assert(r5.airtableId === "recCLI002", "Y se conserva el vínculo");

  // ── 6. Sin cambios reales, no se reporta desactualización ──────────────────
  const r6 = combinarClienteReserva(guardadoCompleto, { Nombre: "ABIGAIL MORENO", "Cédula": "1719956953" }, "recCLI002");
  assert(!copiaDesactualizada(guardadoCompleto, r6), "Si nada cambió, no se marca como desactualizada");

  if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
  console.log("\n✅ clienteReserva.test.ts — todos los asserts pasaron");
}

main();
