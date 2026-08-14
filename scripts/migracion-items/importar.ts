/**
 * Paso 2 de la migración de items del sistema de facturación viejo.
 *
 * Lee la hoja ya revisada y crea en Shipping Items SOLO las filas marcadas
 * "crear".
 *
 * USO
 *   # 1) ver qué haría, sin escribir nada:
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/migracion-items/importar.ts
 *
 *   # 2) crearlos de verdad:
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/migracion-items/importar.ts --aplicar
 *
 * ─── Reversible ──────────────────────────────────────────────────────────────
 *
 * Todos los artículos creados llevan en su Descripción una marca de lote:
 *
 *   [MIGRACION-SISTEMA-VIEJO 2026-08-10]
 *
 * Si algo sale mal, se filtra por ese texto en Airtable y se borran todos de
 * una vez. Sin esa marca, deshacer una importación de 200 artículos es
 * buscarlos uno por uno.
 *
 * ─── Cómo quedan los artículos ───────────────────────────────────────────────
 *
 *   Tipo de operación : "Migración histórica" — no es una compra a proveedor,
 *                       así que no exige proveedor, ni pago, ni packing.
 *   Estado Item       : "Disponible" y "Disponible para venta" marcado, para
 *                       que se puedan facturar desde el primer momento.
 *   Precio venta final: el precio del sistema viejo TAL CUAL. El portal lo
 *                       trata como precio final CON IVA incluido y lo desglosa
 *                       al facturar (ver lib/facturacion/ivaIncluido.ts).
 *   SKU               : generado con la numeración del portal según la
 *                       categoría (LAP-, DES-, RAM-, SSD-…), continuando desde
 *                       el último que exista. Nunca se reutiliza uno liberado.
 */

import fs   from "fs";
import path from "path";
import { readFile } from "node:fs/promises";

import { generateUniqueSkuFromExistingSkus } from "@/lib/sku/sku-service";
import { CATEGORIAS } from "@/lib/shipping-v2/migracion-emparejar";

const ENTRADA = path.join(process.cwd(), "scripts/migracion-items/revision.csv");
const TABLA   = "Shipping Items";
const APLICAR = process.argv.includes("--aplicar");

/**
 * Opciones del campo "Condición" en Shipping Items.
 *
 * Se valida contra esta lista antes de escribir porque la creación va con
 * typecast: true, y typecast CREA la opción si no existe. Un error de dedo
 * dejaría una opción basura en el desplegable de Airtable para siempre.
 */
const CONDICIONES = [
  "Usado", "Open Box", "Nuevo", "Para partes", "Dañado",
  "No probado", "Reacondicionado", "Otro",
] as const;

const MARCA_LOTE = `[MIGRACION-SISTEMA-VIEJO ${new Date().toISOString().split("T")[0]}]`;

// ─── Entorno ─────────────────────────────────────────────────────────────────

async function cargarEnvLocal(): Promise<void> {
  const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8").catch(() => "");
  for (const linea of raw.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith("#")) continue;
    const corte = l.indexOf("=");
    if (corte < 1) continue;
    let valor = l.slice(corte + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    process.env[l.slice(0, corte).trim()] ||= valor;
  }
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function parsearCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  const limpio = texto.replace(/^﻿/, "");

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (enComillas) {
      if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === "," || c === ";") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

function aNumero(v: string | undefined): number | null {
  if (!v) return null;
  const limpio = v.replace(/[^\d,.-]/g, "");
  const conPunto = limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
    ? limpio.replace(/\./g, "").replace(",", ".")
    : limpio.replace(/,/g, "");
  const n = parseFloat(conPunto);
  return Number.isFinite(n) ? n : null;
}

// ─── Airtable ────────────────────────────────────────────────────────────────

function cliente() {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY o AIRTABLE_BASE_ID en .env.local");
  return {
    url: `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(TABLA)}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  };
}

async function leerSkusExistentes(): Promise<string[]> {
  const c = cliente();
  const skus: string[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(c.url);
    url.searchParams.set("pageSize", "100");
    url.searchParams.append("fields[]", "SKU");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), { headers: c.headers, cache: "no-store" });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as { records: Array<{ fields: { SKU?: string } }>; offset?: string };
    for (const r of data.records) if (r.fields.SKU) skus.push(r.fields.SKU);
    offset = data.offset;
  } while (offset);

  return skus;
}

async function crearLote(registros: Array<{ fields: Record<string, unknown> }>): Promise<number> {
  const c = cliente();
  let creados = 0;

  // Airtable acepta 10 por petición.
  for (let i = 0; i < registros.length; i += 10) {
    const lote = registros.slice(i, i + 10);
    const res = await fetch(c.url, {
      method: "POST",
      headers: c.headers,
      body: JSON.stringify({ records: lote, typecast: true }),
    });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    creados += lote.length;
    process.stdout.write(`\r  Creados ${creados}/${registros.length}…`);
  }
  process.stdout.write("\n");
  return creados;
}

// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  await cargarEnvLocal();

  if (!fs.existsSync(ENTRADA)) {
    console.error(`\n  No existe ${path.relative(process.cwd(), ENTRADA)}.`);
    console.error("  Corre primero: npx tsx scripts/migracion-items/analizar.ts <export.csv>\n");
    process.exit(1);
  }

  const filas = parsearCsv(fs.readFileSync(ENTRADA, "utf8"));
  const cab   = filas[0].map((h) => h.trim());
  const idx   = (n: string) => cab.indexOf(n);

  const iDecision  = idx("DECISION");
  const iCategoria = idx("CATEGORIA");
  const iNombre    = idx("nombre_viejo");
  const iCodigo    = idx("codigo_viejo");
  const iCantidad  = idx("cantidad_viejo");
  const iPrecio    = idx("precio_viejo");
  const iCondicion = idx("CONDICION");   // opcional: si no está, se omite el campo

  if ([iDecision, iCategoria, iNombre, iCantidad, iPrecio].some((i) => i < 0)) {
    console.error("\n  A la hoja le faltan columnas. ¿Se guardó con otro formato?");
    console.error(`  Cabeceras encontradas: ${cab.join(", ")}\n`);
    process.exit(1);
  }

  // ── Filtrar y validar ─────────────────────────────────────────────────────
  const aCrear: Array<{ nombre: string; codigo: string; categoria: string; cantidad: number; precio: number; condicion: string }> = [];
  const problemas: string[] = [];
  const conteo = { crear: 0, omitir: 0, revisar: 0, otro: 0 };

  for (const f of filas.slice(1)) {
    const decision = (f[iDecision] ?? "").trim().toLowerCase();
    if (decision === "omitir")       { conteo.omitir++;  continue; }
    if (decision === "revisar")      { conteo.revisar++; continue; }
    if (decision !== "crear")        { conteo.otro++;    continue; }
    conteo.crear++;

    const nombre    = (f[iNombre] ?? "").trim();
    const categoria = (f[iCategoria] ?? "").trim();
    const cantidad  = aNumero(f[iCantidad]);
    const precio    = aNumero(f[iPrecio]);

    if (!nombre)                                   { problemas.push(`Sin nombre: fila con código "${f[iCodigo] ?? ""}"`); continue; }
    if (!categoria)                                { problemas.push(`"${nombre}": falta la categoría`); continue; }
    if (!(CATEGORIAS as readonly string[]).includes(categoria)) {
      problemas.push(`"${nombre}": categoría "${categoria}" no existe en el desplegable de Airtable`);
      continue;
    }
    if (cantidad === null || !Number.isInteger(cantidad) || cantidad < 1) {
      problemas.push(`"${nombre}": cantidad debe ser un entero mayor a 0 (valor: "${f[iCantidad]}")`);
      continue;
    }
    if (precio === null || precio <= 0) {
      problemas.push(`"${nombre}": sin precio de venta no se puede facturar (valor: "${f[iPrecio]}")`);
      continue;
    }

    const condicion = iCondicion >= 0 ? (f[iCondicion] ?? "").trim() : "";
    if (condicion && !(CONDICIONES as readonly string[]).includes(condicion)) {
      problemas.push(`"${nombre}": condición "${condicion}" no existe en el desplegable de Airtable`);
      continue;
    }

    aCrear.push({ nombre, codigo: (f[iCodigo] ?? "").trim(), categoria, cantidad, precio, condicion });
  }

  console.log("\n══ Hoja de revisión ════════════════════════════════════════\n");
  console.log(`  crear   : ${conteo.crear}`);
  console.log(`  omitir  : ${conteo.omitir}`);
  console.log(`  revisar : ${conteo.revisar}${conteo.revisar ? "   ← todavía sin decidir, NO se importan" : ""}`);
  if (conteo.otro) console.log(`  otros   : ${conteo.otro}   ← decisión no reconocida, se ignoran`);

  if (problemas.length) {
    console.error(`\n  ✗ ${problemas.length} fila(s) marcadas "crear" con problemas — NO se importa ninguna:\n`);
    for (const p of problemas.slice(0, 25)) console.error(`    · ${p}`);
    if (problemas.length > 25) console.error(`    … y ${problemas.length - 25} más`);
    console.error("\n  Corrige la hoja y vuelve a correr.\n");
    process.exit(1);
  }

  if (aCrear.length === 0) {
    console.log("\n  No hay nada marcado \"crear\". Revisa la columna DECISION.\n");
    return;
  }

  // ── Armar los registros con su SKU ────────────────────────────────────────
  console.log("\n  Leyendo los SKU que ya existen para continuar la numeración…");
  const skus = new Set(await leerSkusExistentes());

  const registros = aCrear.map((it) => {
    const sku = generateUniqueSkuFromExistingSkus(it.categoria, skus);
    skus.add(sku);   // para que el siguiente del mismo lote no repita

    const descripcion = [
      MARCA_LOTE,
      it.codigo ? `Código en el sistema anterior: ${it.codigo}` : null,
    ].filter(Boolean).join("\n");

    return {
      fields: {
        "Nombre del item":       it.nombre,
        "SKU":                   sku,
        "Categoría":             it.categoria,
        "Cantidad":              it.cantidad,
        "Precio venta final":    it.precio,
        ...(it.condicion ? { "Condición": it.condicion } : {}),
        "Tipo de operación":     "Migración histórica",
        "Estado Item":           "Disponible",
        "Disponible para venta": true,
        "Afecta inventario":     true,
        "Requiere pago":         false,
        "Requiere packing":      false,
        "Descripción":           descripcion,
      },
    };
  });

  // ── Vista previa ──────────────────────────────────────────────────────────
  console.log(`\n══ ${APLICAR ? "SE VAN A CREAR" : "VISTA PREVIA — no se escribe nada"} ═══════════════\n`);
  for (const r of registros.slice(0, 10)) {
    const f = r.fields as Record<string, unknown>;
    console.log(`  ${String(f["SKU"]).padEnd(12)} ${String(f["Categoría"]).padEnd(16)} ` +
                `cant ${String(f["Cantidad"]).padStart(3)}  $${Number(f["Precio venta final"]).toFixed(2).padStart(9)}  ${f["Nombre del item"]}`);
  }
  if (registros.length > 10) console.log(`  … y ${registros.length - 10} más`);

  console.log(`\n  Marca del lote: ${MARCA_LOTE}`);
  console.log("  (queda en la Descripción de cada artículo — filtra por ese texto en Airtable para deshacer)");

  if (!APLICAR) {
    console.log("\n  Nada se ha escrito. Para crearlos de verdad:");
    console.log("    NODE_OPTIONS=\"--conditions react-server\" npx tsx scripts/migracion-items/importar.ts --aplicar\n");
    return;
  }

  console.log("");
  const creados = await crearLote(registros);

  console.log(`\n✅ ${creados} artículos creados en Shipping Items.`);
  console.log("\n  Comprueba en el portal (/shipping-v2/items) que aparecen con su SKU,");
  console.log("  su categoría y su precio. Y prueba a facturar uno en ambiente de pruebas");
  console.log("  antes de dar el lote por bueno.\n");
}

main().catch((e) => {
  console.error("\n✗ Error:", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
