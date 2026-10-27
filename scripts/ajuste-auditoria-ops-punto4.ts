/**
 * Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones, punto 4A
 * (27-oct-2026). Reglas y casos en lib/operaciones/ajuste-auditoria-ops-punto4.ts
 * (con pruebas).
 *
 *   · OP-2026-000032 "Mainboard de Prueba" (OR000368) → Rechazado (registro de prueba).
 *   · OP-2026-000015 cargador 130 W (OR000344) → opción de $45 elegida y Entregado
 *     (el dueño confirmó que se entregó).
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto4.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto4.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CASO_OP15, CASO_OP32, MARCA_PUNTO4, planOP15, planOP32,
  type LecturaOperacion, type LecturaOpcion, type PlanPunto4,
} from "../lib/operaciones/ajuste-auditoria-ops-punto4";

const APLICAR = process.argv.includes("--aplicar");
const TOPE_ACCIONES = 2;
const PAUSA_MS = 250;

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
const texto = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name) : "");
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

type Registro = { id: string; fields: Record<string, unknown> };
let BASE = "";
let HEADERS: Record<string, string> = {};
const url = (tabla: string) => `${BASE}/${encodeURIComponent(tabla)}`;

async function leer(tabla: string, id: string): Promise<Registro | null> {
  const res = await fetch(`${url(tabla)}/${id}`, { headers: HEADERS });
  await esperar(PAUSA_MS);
  if (res.status === 404) return null;
  if (!res.ok) {
    const cuerpo = await res.text();
    // Airtable responde 403 (no 404) a un registro borrado.
    if (res.status === 403 && cuerpo.includes("INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND")) return null;
    throw new Error(`Airtable ${tabla}/${id}: ${res.status} ${cuerpo}`);
  }
  return (await res.json()) as Registro;
}

function lecturaOperacion(r: Registro | null): LecturaOperacion {
  const f = r?.fields ?? {};
  return {
    existe: Boolean(r),
    codigo: texto(f["Código Operación"]),
    estado: texto(f["Estado"]),
    producto: texto(f["Producto Solicitado"]),
    ordenIds: ids(f["Orden de Reparación"]),
    opcionIds: ids(f["Opciones"]),
    opcionElegidaIds: ids(f["Opción Elegida"]),
    articuloIds: ids(f["Artículo físico"]),
    observacion: texto(f["Observación Interna"]),
  };
}

function lecturaOpcion(r: Registro | null): LecturaOpcion {
  const f = r?.fields ?? {};
  return { existe: Boolean(r), precio: numero(f["Precio Venta Cliente"]), operacionIds: ids(f["Operación"]) };
}

async function main(): Promise<void> {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  BASE = `https://api.airtable.com/v0/${baseId}`;
  HEADERS = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const fecha = new Date().toISOString().slice(0, 10);

  const planes: PlanPunto4[] = [
    planOP32(lecturaOperacion(await leer("Operación Comercial", CASO_OP32.operacionId)), fecha),
    planOP15(
      lecturaOperacion(await leer("Operación Comercial", CASO_OP15.operacionId)),
      lecturaOpcion(await leer("Opciones", CASO_OP15.opcionId)),
      fecha,
    ),
  ];

  let acciones = 0;
  let bloqueados = 0;
  for (const p of planes) {
    const marca = p.bloqueos.length ? "BLOQUEADO" : p.acciones.length ? "APLICAR" : "ya está bien";
    console.log(`\n${p.caso}  [${marca}]`);
    for (const b of p.bloqueos) console.log(`   ✗ ${b}`);
    for (const a of p.acciones) console.log(`   · ${a.descripcion}`);
    acciones += p.acciones.length;
    if (p.bloqueos.length) bloqueados++;
  }
  console.log(`\nAcciones: ${acciones}. Bloqueados: ${bloqueados}.`);

  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }
  if (bloqueados > 0) throw new Error("Hay casos bloqueados: no se aplica nada. Revisa la vista previa.");
  if (acciones > TOPE_ACCIONES) throw new Error(`Más de ${TOPE_ACCIONES} acciones: algo no cuadra, no se aplica.`);

  for (const p of planes) {
    for (const a of p.acciones) {
      const res = await fetch(`${url("Operación Comercial")}/${a.operacionId}`, {
        method: "PATCH", headers: HEADERS, body: JSON.stringify({ fields: a.campos, typecast: true }),
      });
      await esperar(PAUSA_MS);
      if (!res.ok) throw new Error(`Airtable PATCH ${a.operacionId}: ${res.status} ${await res.text()}`);
      console.log(`✓ ${a.descripcion}`);
    }
  }
  console.log(`\n✅ Aplicadas ${acciones} acciones (${MARCA_PUNTO4}). Vuelve a correr la vista previa: debe decir 0 acciones.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
