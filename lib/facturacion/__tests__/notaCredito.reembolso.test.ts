/**
 * Test — nota de crédito con destino "Reembolso" (26-oct-2026).
 * Ejecutar: npm test notaCredito.reembolso
 *
 * Sin red: global.fetch se sustituye por un doble de Airtable que sirve la
 * nota de crédito y la cuenta, y anota cada escritura.
 *
 * ─── Qué protege ─────────────────────────────────────────────────────────────
 *
 *  1. Que el destino NO llegue al SRI: el XML no puede depender de él.
 *  2. Que un reembolso saque el dinero de una cuenta real y deje el crédito en
 *     0 — si el crédito quedara vigente, el cliente cobraría dos veces (el
 *     dinero devuelto + una compra futura con el saldo).
 *  3. Que sin cuenta guardada NO se escriba nada: un egreso sin cuenta diría
 *     que no salió dinero, y salió.
 *  4. Que "Saldo a favor" siga exactamente como antes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validarSolicitudReembolso,
  leerReembolsoDeLineasJson,
  cuentaPermiteReembolso,
  observacionReembolso,
} from "../notaCredito/reembolso";
import { procesarPuenteNotaCredito } from "../../finanzas/puentes/notaCredito";
import { __resetCacheNombreTablaParaPruebas } from "../../finanzas/table-names";
import type { NotaCreditoInput } from "../notaCredito/types";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Garantía de tipos: el builder del XML no tiene dónde recibir el destino.
// Si alguien añade uno de estos campos a NotaCreditoInput, typecheck falla.
type SinCampo<K extends string> = K extends keyof NotaCreditoInput ? never : true;
const _sinDestino: SinCampo<"destino"> = true;
const _sinReembolso: SinCampo<"reembolso"> = true;
void _sinDestino; void _sinReembolso;

const fetchOriginal = global.fetch;
process.env.AIRTABLE_API_KEY ||= "test";
process.env.AIRTABLE_BASE_ID ||= "appTEST";

const CAJA    = { id: "recCAJA",  nombre: "Caja Registradora",    tipo: "Temporal",           activa: true };
const BANCO   = { id: "recBANCO", nombre: "SGINGRESOS",           tipo: "Principal",          activa: true };
const TRANS   = { id: "recTRANS", nombre: "Tarjetas en Tránsito", tipo: "Tránsito",           activa: true };
const TC      = { id: "recTC",    nombre: "Pacificard",           tipo: "Tarjeta de Crédito", activa: true };
const INACT   = { ...BANCO, activa: false };

type Escritura = { metodo: string; url: string; body: Record<string, unknown> };

/** Doble de Airtable con ruteo por URL. */
function doble(camposNC: Record<string, unknown>, opciones: { fallaEnlaceUnaVez?: boolean } = {}) {
  __resetCacheNombreTablaParaPruebas();
  const escrituras: Escritura[] = [];
  const movimientos: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let fallaEnlace = opciones.fallaEnlaceUnaVez;
  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    const s = decodeURIComponent(String(url));
    const metodo = init?.method ?? "GET";
    const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) }) as Response;
    if (metodo !== "GET") {
      escrituras.push({ metodo, url: s, body: init?.body ? JSON.parse(String(init.body)) : {} });
      if (s.includes("/Movimientos Financieros")) {
        const body = JSON.parse(String(init?.body));
        movimientos.push({ id: "recMOVNUEVO", fields: body.records[0].fields });
        return ok({ records: [movimientos[movimientos.length - 1]] });
      }
      if (metodo === "PATCH" && fallaEnlace) {
        fallaEnlace = false;
        return { ok: false, status: 503, text: async () => "No se pudo enlazar la NC" } as Response;
      }
      return ok({ id: "recNC", fields: {} });
    }
    if (s.includes("/Notas de Crédito Electrónicas/")) return ok({ id: "recNC", fields: camposNC });
    if (s.includes("/Cuentas Financieras/recBANCO")) {
      return ok({ id: "recBANCO", fields: { Nombre: "SGINGRESOS", "Tipo de Cuenta": "Principal", Activa: true } });
    }
    if (s.includes("/Movimientos Financieros")) {
      const formula = new URL(String(url)).searchParams.get("filterByFormula") ?? "";
      if (formula.includes("Categoría")) {
        assert(formula.includes("{Estado del Movimiento}"), "La recuperación usa el nombre real del estado del movimiento");
      }
      return ok({ records: formula.includes("Categoría") ? movimientos : [] });
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "not found" } as Response;
  }) as typeof fetch;
  return escrituras;
}

const LINEAS_REEMBOLSO = JSON.stringify({
  version: 1,
  detalles: [],
  origen: { numeroFacturaModificada: "001-002-000000793" },
  reembolso: { cuentaOrigenId: "recBANCO", cuentaOrigenNombre: "SGINGRESOS", metodo: "Transferencia bancaria", transaccionId: "23699941" },
});

const NC_REEMBOLSO: Record<string, unknown> = {
  "Número de Nota de Crédito":   "001-002-000000006",
  "Estado":                      "AUTORIZADO",
  "Total":                       420,
  "Saldo Disponible":            0,
  "Destino":                     "Reembolso",
  "Fecha de Autorización":       "2026-10-26T12:00:00-05:00",
  "Factura Modificada (Número)": "001-002-000000793",
  "Líneas JSON":                 LINEAS_REEMBOLSO,
  "Cliente":                     ["recCLIENTE"],
};

(async () => {
  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── el destino no llega al SRI ──");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const fuente = readFileSync(join(__dirname, "..", "notaCredito", "emitirNotaCredito.ts"), "utf8");
    const inicio = fuente.indexOf("construirNotaCreditoXml({");
    const fin    = fuente.indexOf("});", inicio);
    const llamada = inicio >= 0 && fin > inicio ? fuente.slice(inicio, fin) : "";
    assert(llamada.length > 0, "Se encontró la llamada que arma el XML");
    assert(!/destino/i.test(llamada), "El XML se arma sin el destino");
    assert(!/reembolso/i.test(llamada), "El XML se arma sin los datos del reembolso");
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── qué cuentas sirven para reembolsar ──");
  // ═════════════════════════════════════════════════════════════════════════
  assert(cuentaPermiteReembolso(CAJA),   "Caja Registradora: sí");
  assert(cuentaPermiteReembolso(BANCO),  "Cuenta principal (banco): sí");
  assert(!cuentaPermiteReembolso(TRANS), "Cuenta de Tránsito: no (la pasarela aún no entregó ese dinero)");
  assert(!cuentaPermiteReembolso(TC),    "Tarjeta de crédito de la tienda: no");
  assert(!cuentaPermiteReembolso(INACT), "Cuenta inactiva: no");

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── validación de la solicitud (antes de tocar el SRI) ──");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const ok = validarSolicitudReembolso({ cuentaOrigenId: "recBANCO", metodo: "Transferencia bancaria", transaccionId: " 23699941 " }, BANCO);
    assert(ok.ok && ok.datos.cuentaOrigenNombre === "SGINGRESOS", "Transferencia con referencia: válida, guarda el nombre de la cuenta");
    assert(ok.ok && ok.datos.transaccionId === "23699941", "…y limpia los espacios de la referencia");

    const sinRef = validarSolicitudReembolso({ cuentaOrigenId: "recBANCO", metodo: "Transferencia bancaria", transaccionId: "" }, BANCO);
    assert(!sinRef.ok, "Transferencia sin número: se rechaza (sin respaldo)");

    const efectivo = validarSolicitudReembolso({ cuentaOrigenId: "recCAJA", metodo: "Efectivo" }, CAJA);
    assert(efectivo.ok && !efectivo.datos.transaccionId, "Efectivo sin referencia: válido");

    assert(!validarSolicitudReembolso(undefined, null).ok, "Sin datos de reembolso: se rechaza");
    assert(!validarSolicitudReembolso({ cuentaOrigenId: "", metodo: "Efectivo" }, null).ok, "Sin cuenta: se rechaza");
    assert(!validarSolicitudReembolso({ cuentaOrigenId: "recOTRA", metodo: "Efectivo" }, CAJA).ok, "Cuenta que no coincide con la leída: se rechaza");
    assert(!validarSolicitudReembolso({ cuentaOrigenId: "recTRANS", metodo: "Efectivo" }, TRANS).ok, "Desde Tránsito: se rechaza");
    assert(!validarSolicitudReembolso({ cuentaOrigenId: "recBANCO", metodo: "Efectivo" }, INACT).ok, "Cuenta inactiva: se rechaza");
    assert(!validarSolicitudReembolso({ cuentaOrigenId: "recCAJA", metodo: "Bitcoin" }, CAJA).ok, "Método que no existe en Finanzas: se rechaza");
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── lectura de lo guardado en Líneas JSON ──");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const d = leerReembolsoDeLineasJson(LINEAS_REEMBOLSO);
    assert(d?.cuentaOrigenId === "recBANCO" && d.metodo === "Transferencia bancaria" && d.transaccionId === "23699941", "Lee cuenta, método y referencia");
    assert(leerReembolsoDeLineasJson(JSON.stringify({ version: 1, detalles: [] })) === null, "Sin bloque reembolso: null");
    assert(leerReembolsoDeLineasJson("{roto") === null, "JSON roto: null, no lanza");
    assert(leerReembolsoDeLineasJson(JSON.stringify({ reembolso: { cuentaOrigenId: "recX", metodo: "Trueque" } })) === null, "Método inválido: null");
    assert(leerReembolsoDeLineasJson("") === null, "Vacío: null");
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── el asiento del reembolso ──");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const escrituras = doble(NC_REEMBOLSO);
    const r = await procesarPuenteNotaCredito({ notaCreditoRecordId: "recNC", ambiente: "2", registradoPor: "Alex" });
    assert(r.estado === "OK", "Responde OK");
    assert(r.estado === "OK" && r.reembolso?.monto === 420 && r.reembolso.cuenta === "SGINGRESOS", "…e informa monto y cuenta para la pantalla");

    const posts = escrituras.filter((e) => e.metodo === "POST" && e.url.includes("/Movimientos Financieros"));
    assert(posts.length === 1, "Crea UN solo movimiento (revierte y saca caja a la vez)");
    const campos = ((posts[0]?.body.records as Array<{ fields: Record<string, unknown> }> | undefined)?.[0]?.fields) ?? {};
    assert(campos["Tipo de movimiento"] === "Egreso", "…de tipo Egreso");
    assert(campos["Categoría"] === "Devolución", "…categoría Devolución");
    assert(campos["Monto"] === 420, "…por el total de la nota de crédito");
    assert(JSON.stringify(campos["Cuenta Origen (Finanzas)"]) === JSON.stringify(["recBANCO"]), "…CON la cuenta de la que sale el dinero");
    assert(campos["Cuenta Destino (Finanzas)"] === undefined, "…sin cuenta destino");
    assert(campos["Método"] === "Transferencia bancaria", "…con el método");
    assert(campos["Transacción ID"] === "23699941", "…y la referencia de la transferencia");
    assert(JSON.stringify(campos["Nota de Crédito"]) === JSON.stringify(["recNC"]), "…enlazado a la nota de crédito");
    assert(String(campos["Observación"] ?? "").includes("no queda con saldo a favor"), "…con una observación que lo explica");

    const patches = escrituras.filter((e) => e.metodo === "PATCH" && e.url.includes("/Notas de Crédito Electrónicas/"));
    assert(patches.length === 1, "Una sola escritura en la nota de crédito");
    const f = (patches[0]?.body.fields ?? {}) as Record<string, unknown>;
    assert(JSON.stringify(f["Movimiento Reversa"]) === JSON.stringify(["recMOVNUEVO"]), "…que enlaza el asiento");
    assert(f["Saldo Disponible"] === 0, "…deja el crédito en 0 en la MISMA escritura");
    assert(f["Estado Crédito"] === "Consumido", "…y lo marca Consumido (nunca Vigente)");
    assert(!("Fecha de Caducidad" in f), "…sin fecha de caducidad: no hay crédito que caduque");
  }

  {
    const escrituras = doble({ ...NC_REEMBOLSO, "Movimiento Reversa": ["recMOVYA"] });
    const r = await procesarPuenteNotaCredito({ notaCreditoRecordId: "recNC", ambiente: "2", registradoPor: "Alex" });
    assert(r.estado === "OK" && escrituras.length === 0, "Reintento con el asiento ya hecho: no saca el dinero dos veces");
    assert(r.estado === "OK" && r.reembolso?.monto === 420, "El asiento ya existente también informa el monto para la pantalla");
  }

  {
    const escrituras = doble(NC_REEMBOLSO, { fallaEnlaceUnaVez: true });
    const primero = await procesarPuenteNotaCredito({ notaCreditoRecordId: "recNC", ambiente: "2", registradoPor: "Alex" });
    assert(primero.estado === "ERROR" && primero.movimientoId === "recMOVNUEVO", "Fallo al enlazar: informa que el egreso sí fue creado");
    const segundo = await procesarPuenteNotaCredito({ notaCreditoRecordId: "recNC", ambiente: "2", registradoPor: "Alex" });
    assert(segundo.estado === "OK", "Reintento tras el fallo parcial: completa el enlace");
    assert(escrituras.filter((e) => e.metodo === "POST").length === 1, "El reintento no duplica el egreso de dinero");
  }

  {
    const escrituras = doble({ ...NC_REEMBOLSO, "Líneas JSON": JSON.stringify({ version: 1, detalles: [] }) });
    const r = await procesarPuenteNotaCredito({ notaCreditoRecordId: "recNC", ambiente: "2", registradoPor: "Alex" });
    assert(r.estado === "ERROR", "Reembolso sin cuenta guardada: ERROR");
    assert(escrituras.length === 0, "…y CERO escrituras: nunca un reembolso asentado como si no hubiera salido dinero");
  }

  {
    const escrituras = doble(NC_REEMBOLSO);
    const r = await procesarPuenteNotaCredito({ notaCreditoRecordId: "recNC", ambiente: "1", registradoPor: "Alex" });
    assert(r.estado === "OMITIDO" && escrituras.length === 0, "Ambiente de pruebas: no toca Finanzas");
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── \"Saldo a favor\" sigue igual que antes ──");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const escrituras = doble({ ...NC_REEMBOLSO, "Destino": "Saldo a favor", "Saldo Disponible": 420, "Líneas JSON": JSON.stringify({ version: 1, detalles: [] }) });
    const r = await procesarPuenteNotaCredito({ notaCreditoRecordId: "recNC", ambiente: "2", registradoPor: "Alex" });
    assert(r.estado === "OK", "Responde OK");
    const post = escrituras.find((e) => e.metodo === "POST");
    const campos = ((post?.body.records as Array<{ fields: Record<string, unknown> }> | undefined)?.[0]?.fields) ?? {};
    assert(campos["Cuenta Origen (Finanzas)"] === undefined, "El egreso de reversa va SIN cuenta: no sale dinero");
    const patch = escrituras.find((e) => e.metodo === "PATCH");
    const f = (patch?.body.fields ?? {}) as Record<string, unknown>;
    assert(f["Estado Crédito"] === "Vigente", "El crédito queda Vigente");
    assert(typeof f["Fecha de Caducidad"] === "string", "…con su fecha de caducidad");
    assert(!("Saldo Disponible" in f), "…y su saldo intacto");
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── texto para Finanzas ──");
  // ═════════════════════════════════════════════════════════════════════════
  {
    const t = observacionReembolso({
      numeroNotaCredito: "001-002-000000006",
      numeroFacturaModificada: "001-002-000000793",
      datos: { cuentaOrigenId: "recBANCO", cuentaOrigenNombre: "SGINGRESOS", metodo: "Transferencia bancaria", transaccionId: "23699941" },
    });
    assert(t.includes("001-002-000000006") && t.includes("001-002-000000793") && t.includes("SGINGRESOS") && t.includes("23699941"),
      "Nombra la NC, la factura, la cuenta y la referencia");
  }

  global.fetch = fetchOriginal;

  if (fallos > 0) {
    console.error(`\n❌ notaCredito.reembolso.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ notaCredito.reembolso.test.ts — todos los asserts pasaron");
})();
