/**
 * Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones,
 * punto 13A. Reglas y decisiones del dueño en
 * lib/estado-cuenta/ajuste-auditoria-ops-punto13a.ts (con pruebas).
 *
 * Qué hace:
 *   · A cada orden que hoy marca "saldo a favor" porque se cobró algo que
 *     nunca se cargó, le agrega ese cargo (Servicios por Orden) con su línea
 *     "Cargada" del presupuesto, por EXACTAMENTE lo que sobra. La orden queda
 *     "Pagado". No toca abonos, Finanzas ni inventario.
 *       - órdenes viejas (abono "legacy"): "Trabajo del sistema anterior";
 *       - OR000366, OR000397, OR000439, OR000443: lo que realmente se vendió.
 *   · La NC de prueba 001-002-000000002 deja de tener crédito ($5 → $0).
 *   Una orden con saldo a favor que no encaja en ninguna regla NO se toca:
 *   aparece como bloqueo.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto13a.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto13a.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones y 0 órdenes con saldo a favor)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  MARCA_PUNTO13A,
  NC_PRUEBA,
  planPunto13A,
  type AccionPunto13A,
  type LecturaCargoMarcado,
  type LecturaOrden,
} from "../lib/estado-cuenta/ajuste-auditoria-ops-punto13a";

const APLICAR = process.argv.includes("--aplicar");
const TOPE_ACCIONES = 130;
const PAUSA_MS = 250;
const REGISTRADO_POR = "Claude (autorizado por el dueño)";
const T_SERVICIOS = "Servicios por Orden";
const T_NC = "Notas de Crédito Electrónicas";

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

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const $ = (n: number) => `$${n.toFixed(2)}`;

let BASE = "";
let HEADERS: Record<string, string> = {};
const url = (tabla: string) => `${BASE}/${encodeURIComponent(tabla)}`;

async function escribir(tabla: string, metodo: "POST" | "PATCH", fields: Record<string, unknown>, id?: string): Promise<{ id: string }> {
  const res = await fetch(id ? `${url(tabla)}/${id}` : url(tabla), {
    method: metodo,
    headers: HEADERS,
    body: JSON.stringify({ fields, typecast: true }),
  });
  await esperar(PAUSA_MS);
  if (!res.ok) throw new Error(`Airtable ${metodo} ${tabla}${id ? `/${id}` : ""}: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string };
}

async function main(): Promise<void> {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  BASE = `https://api.airtable.com/v0/${baseId}`;
  HEADERS = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const { listarTodo, porIds, estadosDeCuentaDeOrdenes, CAMPOS_ORDEN_CUENTA, ids, texto, numero } = await import("../lib/estado-cuenta/airtable");
  const { lineasPorIds, crearLineaMudanza } = await import("../lib/tecnicos/presupuesto/airtable");
  const { entradaHistorial } = await import("../lib/tecnicos/presupuesto/reglas");

  // ── Lectura ───────────────────────────────────────────────────────────────
  // La MISMA calculadora que usan las pantallas decide qué órdenes tienen saldo a favor.
  const ordenes = await listarTodo("Órdenes de Reparación", ["ID", "Estado Actual", "ClienteTXT", ...CAMPOS_ORDEN_CUENTA]);
  const cuentas = await estadosDeCuentaDeOrdenes(ordenes);
  const conSaldoAFavor = ordenes.filter((o) => cuentas.get(o.id)?.estadoPago === "saldo_a_favor");

  const abonoIds = conSaldoAFavor.flatMap((o) => (cuentas.get(o.id)?.abonos ?? []).filter((a) => a.estado !== "Anulado").map((a) => a.id));
  const abonos = await porIds("Abonos", abonoIds, ["Monto", "Observación"]);
  conSaldoAFavor.sort((a, b) => texto(a.fields["ID"]).localeCompare(texto(b.fields["ID"])));
  const lecturas: LecturaOrden[] = conSaldoAFavor.map((o) => {
    const c = cuentas.get(o.id)!;
    return {
      id: o.id,
      codigo: texto(o.fields["ID"]) || o.id,
      estado: texto(o.fields["Estado Actual"]),
      cliente: texto(o.fields["ClienteTXT"]),
      aFavor: c.aFavor,
      abonos: c.abonos
        .filter((a) => a.estado !== "Anulado")
        .map((a) => ({ monto: a.monto, observacion: texto(abonos.get(a.id)?.fields["Observación"]) })),
    };
  });

  // Cargos de una corrida anterior (para completar una línea si la escritura se cortó).
  const marcados = await listarTodo(
    T_SERVICIOS,
    ["Nombre del servicio snapshot o copiado", "Costo real", "Orden de Reparación", "Observación"],
    `FIND('${MARCA_PUNTO13A}', {Observación})`,
  );
  const ordenesMarcadas = await porIds("Órdenes de Reparación", marcados.flatMap((s) => ids(s.fields["Orden de Reparación"]).slice(0, 1)), ["ID", "Presupuesto por Orden"]);
  const lineas = await lineasPorIds([...ordenesMarcadas.values()].flatMap((o) => ids(o.fields["Presupuesto por Orden"])));
  const cargosConLinea = new Set(lineas.map((l) => l.cargoServicioId).filter(Boolean));
  const cargosMarcados: LecturaCargoMarcado[] = marcados.map((s) => {
    const ordenId = ids(s.fields["Orden de Reparación"])[0] ?? "";
    return {
      id: s.id,
      ordenId,
      ordenCodigo: texto(ordenesMarcadas.get(ordenId)?.fields["ID"]) || ordenId,
      nombre: texto(s.fields["Nombre del servicio snapshot o copiado"]),
      costo: numero(s.fields["Costo real"]),
      tieneLinea: cargosConLinea.has(s.id),
    };
  });

  const ncReg = (await porIds(T_NC, [NC_PRUEBA.id], ["Saldo Disponible", "Estado Crédito", "Motivo"])).get(NC_PRUEBA.id);
  const nc = ncReg
    ? { existe: true, saldoDisponible: numero(ncReg.fields["Saldo Disponible"]), estadoCredito: texto(ncReg.fields["Estado Crédito"]), motivo: texto(ncReg.fields["Motivo"]) }
    : { existe: false, saldoDisponible: 0, estadoCredito: "", motivo: "" };

  // ── Plan ──────────────────────────────────────────────────────────────────
  const plan = planPunto13A({ ordenesConSaldoAFavor: lecturas, cargosMarcados, nc });

  console.log(`\nÓrdenes con saldo a favor hoy: ${lecturas.length} (${$(lecturas.reduce((s, o) => s + o.aFavor, 0))}) de ${ordenes.length}`);
  for (const a of plan.acciones) console.log(`  · ${a.descripcion}`);
  for (const b of plan.bloqueos) console.log(`  ✗ ${b}`);
  const viejas = plan.ordenes.filter((o) => o.regla === "vieja");
  const casos = plan.ordenes.filter((o) => o.regla === "caso");
  console.log(`\nÓrdenes viejas: ${viejas.length} (${$(viejas.reduce((s, o) => s + o.monto, 0))}) · casos revisados: ${casos.length} (${$(casos.reduce((s, o) => s + o.monto, 0))})`);
  console.log(`Acciones: ${plan.acciones.length} (cada cargo crea además su línea del presupuesto). Bloqueos: ${plan.bloqueos.length}.`);

  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }
  if (plan.bloqueos.length) throw new Error("Hay bloqueos: no se aplica nada. Revisa la vista previa.");
  if (plan.acciones.length > TOPE_ACCIONES) throw new Error(`Más de ${TOPE_ACCIONES} acciones: algo no cuadra.`);

  // ── Escritura ─────────────────────────────────────────────────────────────
  const historial = entradaHistorial(`${MARCA_PUNTO13A}: cargo registrado para que la orden cuadre con lo que el cliente ya pagó.`, REGISTRADO_POR);
  const crearLinea = (a: { ordenId: string; nombre: string; costo: number }, cargoId: string) =>
    crearLineaMudanza(
      a.ordenId,
      { tipo: "Servicio", descripcion: a.nombre, precioUnitario: a.costo, cargoServicioId: cargoId },
      { creadoPor: REGISTRADO_POR, aprobadoPor: REGISTRADO_POR, historial },
    );

  for (const a of plan.acciones as AccionPunto13A[]) {
    switch (a.tipo) {
      case "crear-cargo": {
        const cargo = await escribir(T_SERVICIOS, "POST", {
          "Nombre del servicio snapshot o copiado": a.nombre,
          "Costo real": a.costo,
          "Observación": a.observacion,
          "Fecha de registro": new Date().toISOString(),
          "Orden de Reparación": [a.ordenId],
        });
        await crearLinea(a, cargo.id);
        await esperar(PAUSA_MS);
        break;
      }
      case "crear-linea":
        await crearLinea(a, a.cargoId);
        await esperar(PAUSA_MS);
        break;
      case "nc-sin-credito":
        await escribir(T_NC, "PATCH", a.campos, a.ncId);
        break;
    }
    console.log(`✓ ${a.descripcion}`);
  }
  console.log(`\n✅ Aplicadas ${plan.acciones.length} acciones (${MARCA_PUNTO13A}). Vuelve a correr la vista previa: debe decir 0 acciones y 0 órdenes con saldo a favor.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
