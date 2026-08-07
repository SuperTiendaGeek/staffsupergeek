/**
 * Etapa 3, paso 2 — contrastar lo capturado contra el esquema vivo de Airtable.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/etapa3/verificarEsquema.ts
 *
 * SOLO LECTURA. Usa la API de metadatos de Airtable (la misma que
 * scripts/inspect-shipping-v2-schema.mjs) para leer nombres de tablas y campos.
 * No crea, no modifica y no borra nada.
 *
 * ─── Qué cierra ──────────────────────────────────────────────────────────────
 *
 * `despertarMecanismos.ts` demuestra que los seis mecanismos hacen lo correcto,
 * pero contra una base simulada: si el código escribiera en un campo llamado
 * "Cantidadd", el banco lo aceptaría igual. Y esa es justo la trampa del
 * proyecto — el portal referencia Airtable POR NOMBRE, y un nombre mal escrito
 * falla en silencio.
 *
 * Este script cierra ese hueco: toma el inventario de tablas y campos que el
 * primer script guardó y comprueba que cada uno existe de verdad en la base.
 */

import fs   from "fs";
import path from "path";
import { readFile } from "node:fs/promises";

const ENTRADA = path.join(process.cwd(), "scripts/etapa3/escrituras-capturadas.json");

// Mismo patrón que el resto de scripts del proyecto: se lee .env.local a mano
// para no depender de dotenv (el proyecto no lo tiene).
async function cargarEnvLocal(): Promise<void> {
  const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8").catch(() => "");
  for (const linea of raw.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    let valor   = limpia.slice(corte + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    process.env[clave] ||= valor;
  }
}

type TablaMeta = { id: string; name: string; fields: Array<{ id: string; name: string; type: string }> };

async function leerEsquema(): Promise<TablaMeta[]> {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY o AIRTABLE_BASE_ID en .env.local");

  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API de metadatos ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { tables: TablaMeta[] };
  return data.tables;
}

/** Airtable trata los nombres como insensibles a mayúsculas para la unicidad. */
function norm(s: string): string {
  return s.normalize("NFC").trim().toLowerCase();
}

async function main(): Promise<void> {
  await cargarEnvLocal();

  if (!fs.existsSync(ENTRADA)) {
    console.error(`\n✗ No se encontró ${path.relative(process.cwd(), ENTRADA)}.`);
    console.error("  Corre primero: npx tsx scripts/etapa3/despertarMecanismos.ts\n");
    process.exit(1);
  }

  const inventario = JSON.parse(fs.readFileSync(ENTRADA, "utf8")) as Record<string, string[]>;
  const tablas     = await leerEsquema();

  console.log("\n" + "█".repeat(74));
  console.log("  ETAPA 3 — contraste contra el esquema vivo de Airtable (solo lectura)");
  console.log("█".repeat(74) + "\n");

  let problemas = 0;

  for (const [nombreTabla, campos] of Object.entries(inventario)) {
    const tabla = tablas.find((t) => norm(t.name) === norm(nombreTabla));

    if (!tabla) {
      problemas++;
      console.error(`✗ TABLA NO EXISTE: "${nombreTabla}"`);
      const parecidas = tablas
        .filter((t) => norm(t.name).includes(norm(nombreTabla).slice(0, 6)))
        .map((t) => t.name);
      if (parecidas.length) console.error(`    ¿Quisiste decir? ${parecidas.join(", ")}`);
      continue;
    }

    console.log(`${tabla.name}`);

    for (const campo of campos) {
      const f = tabla.fields.find((x) => norm(x.name) === norm(campo));

      if (!f) {
        problemas++;
        console.error(`  ✗ CAMPO NO EXISTE: "${campo}"`);
        const parecidos = tabla.fields
          .filter((x) => norm(x.name).includes(norm(campo).slice(0, 5)))
          .map((x) => x.name);
        if (parecidos.length) console.error(`      ¿Quisiste decir? ${parecidos.join(", ")}`);
        continue;
      }

      // Un campo calculado no se puede escribir: Airtable rechaza el PATCH.
      const calculados = ["formula", "rollup", "count", "lookup", "multipleLookupValues", "autoNumber", "createdTime", "lastModifiedTime"];
      if (calculados.includes(f.type)) {
        problemas++;
        console.error(`  ✗ CAMPO CALCULADO, NO SE PUEDE ESCRIBIR: "${f.name}" (${f.type})`);
        continue;
      }

      console.log(`  ✓ ${f.name}  (${f.type})`);
    }
    console.log("");
  }

  console.log("═".repeat(74));
  if (problemas > 0) {
    console.error(`❌ ${problemas} problema(s) de esquema — NO pasar a producción sin resolverlos.`);
    console.error("   Recuerda: la API de Airtable no crea ni borra campos; eso se hace a mano");
    console.error("   en la interfaz.\n");
    process.exit(1);
  }
  console.log("✅ Todas las tablas y campos que se escribirían en producción existen y son escribibles.");
  console.log("═".repeat(74) + "\n");
}

main().catch((e) => {
  console.error("\n✗ Error:", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
