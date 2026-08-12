/**
 * Paso 1 de la migración de items del sistema de facturación viejo.
 *
 * Lee el export del sistema viejo, lee los Shipping Items del portal, y
 * produce UNA HOJA DE CÁLCULO con cada artículo ya clasificado y una columna
 * de decisión para revisar.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/migracion-items/analizar.ts <export.csv>
 *
 * NO ESCRIBE NADA EN AIRTABLE. Solo lee. Se puede correr las veces que haga
 * falta mientras se afina el export.
 *
 * ─── El export que espera ────────────────────────────────────────────────────
 *
 * Un CSV con cabecera. Reconoce estas columnas por su nombre, sin importar
 * mayúsculas ni tildes (la primera que encuentre de cada grupo):
 *
 *   nombre        · nombre, descripcion, titulo, articulo, item, producto
 *   codigo        · codigo, sku, referencia
 *   cantidad      · cantidad, stock, existencia
 *   costo         · costo, costo proveedor, precio compra
 *   precio venta  · precio, precio venta, pvp, precio publico
 *
 * Si alguna no aparece, lo dice y sigue con las que haya.
 *
 * ─── Qué sale ────────────────────────────────────────────────────────────────
 *
 * `scripts/migracion-items/revision.csv`, para abrir en Google Sheets o Excel:
 *
 *   DECISION    prellenada — omitir · revisar · crear
 *   CATEGORIA   propuesta desde el nombre; VACÍA si no hay pista clara
 *   …más el artículo del portal con el que se parece, para poder compararlos
 *
 * Se revisan solo las filas "revisar" y las categorías vacías. Después:
 *   npx tsx scripts/migracion-items/importar.ts
 */

import fs   from "fs";
import path from "path";
import { readFile } from "node:fs/promises";

import {
  emparejar,
  proponerCategoria,
  type ItemPortal,
  type ItemViejo,
} from "@/lib/shipping-v2/migracion-emparejar";

const SALIDA = path.join(process.cwd(), "scripts/migracion-items/revision.csv");
const TABLA  = "Shipping Items";

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

/** Parser de CSV que respeta comillas y comas dentro de un campo. */
function parsearCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;

  const limpio = texto.replace(/^﻿/, "");   // BOM de Excel

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

function escapar(v: string | number | undefined | null): string {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function normalizarCabecera(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function buscarColumna(cabeceras: string[], candidatas: string[]): number {
  const norm = cabeceras.map(normalizarCabecera);
  for (const c of candidatas) {
    const i = norm.indexOf(c);
    if (i >= 0) return i;
  }
  // Coincidencia parcial, por si la cabecera trae texto de más.
  for (const c of candidatas) {
    const i = norm.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

function aNumero(v: string | undefined): number | null {
  if (!v) return null;
  // Acepta "1.234,56" y "1,234.56"
  const limpio = v.replace(/[^\d,.-]/g, "");
  const conPunto = limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
    ? limpio.replace(/\./g, "").replace(",", ".")
    : limpio.replace(/,/g, "");
  const n = parseFloat(conPunto);
  return Number.isFinite(n) ? n : null;
}

// ─── Airtable (solo lectura) ─────────────────────────────────────────────────

async function leerShippingItems(): Promise<ItemPortal[]> {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY o AIRTABLE_BASE_ID en .env.local");

  const items: ItemPortal[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(TABLA)}`);
    url.searchParams.set("pageSize", "100");
    for (const f of ["SKU", "Nombre del item", "Cantidad", "Precio venta final"]) {
      url.searchParams.append("fields[]", f);
    }
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as {
      records: Array<{ id: string; fields: Record<string, unknown> }>;
      offset?: string;
    };

    for (const r of data.records) {
      const f = r.fields;
      items.push({
        recordId:         r.id,
        sku:              typeof f["SKU"] === "string" ? f["SKU"] : "",
        nombre:           typeof f["Nombre del item"] === "string" ? f["Nombre del item"] : "",
        cantidad:         typeof f["Cantidad"] === "number" ? f["Cantidad"] : 0,
        precioVentaFinal: typeof f["Precio venta final"] === "number" ? f["Precio venta final"] : null,
      });
    }
    offset = data.offset;
  } while (offset);

  return items;
}

// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error("\n  Falta el archivo. Uso:");
    console.error("  NODE_OPTIONS=\"--conditions react-server\" npx tsx scripts/migracion-items/analizar.ts <export.csv>\n");
    process.exit(1);
  }
  if (!fs.existsSync(archivo)) {
    console.error(`\n  No existe el archivo: ${archivo}\n`);
    process.exit(1);
  }

  await cargarEnvLocal();

  // ── Leer el export ────────────────────────────────────────────────────────
  const filas = parsearCsv(fs.readFileSync(archivo, "utf8"));
  if (filas.length < 2) {
    console.error("\n  El archivo no tiene datos (solo cabecera o vacío).\n");
    process.exit(1);
  }

  const cabeceras = filas[0];
  const col = {
    nombre:   buscarColumna(cabeceras, ["nombre", "descripcion", "titulo", "articulo", "item", "producto"]),
    codigo:   buscarColumna(cabeceras, ["codigo", "sku", "referencia"]),
    cantidad: buscarColumna(cabeceras, ["cantidad", "stock", "existencia"]),
    costo:    buscarColumna(cabeceras, ["costo proveedor", "costo", "precio compra"]),
    precio:   buscarColumna(cabeceras, ["precio venta", "precio publico", "pvp", "precio"]),
  };

  console.log("\n══ Columnas encontradas en el export ═══════════════════════\n");
  for (const [k, i] of Object.entries(col)) {
    console.log(`  ${k.padEnd(10)}: ${i >= 0 ? `"${cabeceras[i]}"` : "── no encontrada"}`);
  }
  if (col.nombre < 0) {
    console.error("\n  Sin columna de nombre no se puede hacer nada. Revisa la cabecera del CSV.\n");
    process.exit(1);
  }

  const viejos: ItemViejo[] = filas.slice(1).map((f) => ({
    nombre:      (f[col.nombre]   ?? "").trim(),
    codigo:      col.codigo   >= 0 ? (f[col.codigo] ?? "").trim() : undefined,
    cantidad:    (col.cantidad >= 0 ? aNumero(f[col.cantidad]) : null) ?? 1,
    costo:       col.costo    >= 0 ? aNumero(f[col.costo])   : null,
    precioVenta: col.precio   >= 0 ? aNumero(f[col.precio])  : null,
  }));

  // ── Leer el portal ────────────────────────────────────────────────────────
  console.log("\n  Leyendo Shipping Items del portal…");
  const portal = await leerShippingItems();
  console.log(`  ${portal.length} artículos en el portal · ${viejos.length} en el export\n`);

  // ── Clasificar ────────────────────────────────────────────────────────────
  const cuenta = { "YA EXISTE": 0, "POSIBLE DUPLICADO": 0, "NUEVO": 0 };
  let sinCategoria = 0;
  let sinPrecio    = 0;

  const salida: string[] = [
    [
      "DECISION", "CATEGORIA", "clasificacion", "motivo",
      "nombre_viejo", "codigo_viejo", "cantidad_viejo", "costo_viejo", "precio_viejo",
      "sku_portal", "nombre_portal", "cantidad_portal", "precio_portal", "parecido_%",
    ].join(","),
  ];

  for (const v of viejos) {
    const e = emparejar(v, portal);
    cuenta[e.clasificacion]++;

    const categoria = proponerCategoria(v.nombre) ?? "";
    if (!categoria) sinCategoria++;
    if (!v.precioVenta || v.precioVenta <= 0) sinPrecio++;

    // La decisión se propone; el precio faltante fuerza revisión porque sin él
    // el artículo no se puede facturar.
    const decision =
      e.clasificacion === "YA EXISTE"         ? "omitir"
      : e.clasificacion === "POSIBLE DUPLICADO" ? "revisar"
      : (!categoria || !v.precioVenta || v.precioVenta <= 0) ? "revisar"
      : "crear";

    salida.push([
      decision, categoria, e.clasificacion, e.motivo,
      v.nombre, v.codigo ?? "", v.cantidad, v.costo ?? "", v.precioVenta ?? "",
      e.candidato?.sku ?? "", e.candidato?.nombre ?? "",
      e.candidato?.cantidad ?? "", e.candidato?.precioVentaFinal ?? "",
      Math.round(e.parecido * 100),
    ].map(escapar).join(","));
  }

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, salida.join("\n") + "\n", "utf8");

  // ── Informe ───────────────────────────────────────────────────────────────
  console.log("══ Resultado ═══════════════════════════════════════════════\n");
  console.log(`  YA EXISTE en el portal    : ${cuenta["YA EXISTE"]}   → se omiten (mismo stock contado dos veces)`);
  console.log(`  POSIBLE DUPLICADO         : ${cuenta["POSIBLE DUPLICADO"]}   → los revisas tú`);
  console.log(`  NUEVO                     : ${cuenta["NUEVO"]}   → se crean`);
  console.log("");
  if (sinCategoria) console.log(`  ⚠ ${sinCategoria} sin categoría propuesta — hay que llenarla a mano (es obligatoria)`);
  if (sinPrecio)    console.log(`  ⚠ ${sinPrecio} sin precio de venta — sin precio no se pueden facturar`);

  console.log(`\n  Hoja de revisión: ${path.relative(process.cwd(), SALIDA)}`);
  console.log("\n  Ábrela en Google Sheets o Excel y revisa:");
  console.log("    · las filas con DECISION = revisar");
  console.log("    · las celdas CATEGORIA vacías");
  console.log("\n  Cuando esté lista, guárdala en el mismo sitio y corre:");
  console.log("    NODE_OPTIONS=\"--conditions react-server\" npx tsx scripts/migracion-items/importar.ts\n");
}

main().catch((e) => {
  console.error("\n✗ Error:", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
