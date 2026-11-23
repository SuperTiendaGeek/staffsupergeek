/**
 * Rediseño de la orden, parte R5 · 22-nov-2026 — pasar las órdenes viejas al
 * diseño nuevo:
 *   1. Crea la ficha de cada equipo (tabla «Equipos»): una por equipo del
 *      cliente (misma serie o mismo nombre = mismo equipo).
 *   2. Liga cada orden a su ficha («Ficha del equipo»).
 *   3. La contraseña escrita en la «Nota interna» pasa a la ficha (la más
 *      reciente manda; nunca pisa una que ya exista).
 *   4. El resto de la nota interna entra a la Actividad como nota interna, con
 *      la fecha de la orden y SIN la contraseña.
 * No borra nada: el campo «Nota interna» queda igual en Airtable.
 * Reglas puras y pruebas: lib/tecnicos/equipos/{reglas,migracion}.ts.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/rediseno-r5-equipos.ts            # vista previa (+ CSV en Descargas)
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/rediseno-r5-equipos.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const CSV = path.join(os.homedir(), "Downloads", "r5-equipos-vista-previa.csv");

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
const lotes = <T,>(xs: T[], n = 10): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const csv = (v: string) => `"${String(v ?? "").replace(/"/g, '""').replace(/\n/g, " ⏎ ")}"`;

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { listarTodo, ids, texto } = await import("../lib/estado-cuenta/airtable");
  const { airtableMutation, tableUrl } = await import("../lib/finanzas/airtable-client");
  const { TABLA_EQUIPOS, normalizarTipoEquipo, nombreEquipo, PREFIJO_NOTA_ANTERIOR } = await import("../lib/tecnicos/equipos/reglas");
  const { planMigracionEquipos, totalAcciones } = await import("../lib/tecnicos/equipos/migracion");

  const T_ORDENES = "Órdenes de Reparación";
  const T_HISTORIAL = "Historial de Estados";

  const [ordenesRaw, fichasRaw, pasadas] = await Promise.all([
    listarTodo(T_ORDENES, ["ID", "Fecha de Ingreso", "Cliente", "Equipo", "Ficha del equipo", "Nota interna"]),
    listarTodo(TABLA_EQUIPOS, ["Equipo", "Tipo", "Marca", "Modelo", "Serie", "Cliente", "Contraseña"]),
    listarTodo(T_HISTORIAL, ["Estado Nuevo", "Órdenes de Reparación"], `FIND("${PREFIJO_NOTA_ANTERIOR.trim()}", {Estado Nuevo})`),
  ]);

  const ordenes = ordenesRaw.map((r) => ({
    id: r.id,
    codigo: texto(r.fields["ID"]) || r.id,
    fecha: texto(r.fields["Fecha de Ingreso"]) || r.createdTime || "",
    clienteId: ids(r.fields["Cliente"])[0] ?? null,
    equipoTexto: texto(r.fields["Equipo"]),
    fichaId: ids(r.fields["Ficha del equipo"])[0] ?? null,
    notaInterna: texto(r.fields["Nota interna"]),
  }));
  const fichas = fichasRaw.map((r) => ({
    id: r.id,
    clienteId: ids(r.fields["Cliente"])[0] ?? null,
    datos: {
      tipo: normalizarTipoEquipo(r.fields["Tipo"]) || "Otro" as const,
      marca: texto(r.fields["Marca"]), modelo: texto(r.fields["Modelo"]), serie: texto(r.fields["Serie"]),
    },
    tieneContrasena: !!texto(r.fields["Contraseña"]).trim(),
  }));
  const yaPasadas = new Set(pasadas.flatMap((r) => ids(r.fields["Órdenes de Reparación"])));

  const plan = planMigracionEquipos(ordenes, fichas, yaPasadas);

  console.log(`\nÓrdenes leídas: ${ordenes.length} · fichas que ya existen: ${fichas.length} · notas ya pasadas: ${yaPasadas.size}`);
  console.log(`Acciones: ${totalAcciones(plan)}${APLICAR ? "" : " (vista previa, no se escribe nada)"}`);
  console.log(`  Fichas nuevas: ${plan.crear.length} (con contraseña: ${plan.crear.filter((c) => c.contrasena).length})`);
  console.log(`  Órdenes que se ligan: ${plan.ligar.length}`);
  console.log(`  Contraseñas para fichas que ya existen: ${plan.contrasenasExistentes.length}`);
  console.log(`  Notas internas que pasan a la Actividad: ${plan.notas.length}`);
  console.log(`  Saltadas: ${plan.saltadas.length}\n`);

  const tipos: Record<string, number> = {};
  for (const c of plan.crear) tipos[c.datos.tipo] = (tipos[c.datos.tipo] ?? 0) + 1;
  console.log("Fichas nuevas por tipo:", tipos);

  console.log(`\nContraseñas encontradas en notas (${plan.contrasenas.length}) — revisa sobre todo las de confianza «media»:`);
  for (const c of plan.contrasenas) console.log(`  ${c.codigo} · ${c.confianza.padEnd(5)} · «${c.contrasena}» → ${c.destino}   (nota: ${c.nota.replace(/\n/g, " ⏎ ").slice(0, 90)})`);
  if (plan.saltadas.length) {
    console.log("\nSaltadas:");
    for (const s of plan.saltadas) console.log(`  ${s.codigo}: ${s.motivo}`);
  }

  // Vista previa completa para revisar con calma (Descargas del Mac).
  const filas = [
    ["Qué", "Orden(es)", "Equipo / destino", "Serie", "Contraseña", "Confianza", "Texto"].map(csv).join(","),
    ...plan.crear.map((c) => ["Ficha nueva", c.ordenes.join(" "), `${c.datos.tipo} · ${nombreEquipo(c.datos)}`, c.datos.serie, c.contrasena, "", ""].map(csv).join(",")),
    ...plan.contrasenas.map((c) => ["Contraseña", c.codigo, c.destino, "", c.contrasena, c.confianza, c.nota].map(csv).join(",")),
    ...plan.notas.map((n) => ["Nota a la Actividad", n.codigo, "", "", "", "", n.texto].map(csv).join(",")),
    ...plan.saltadas.map((s) => ["Saltada", s.codigo, "", "", "", "", s.motivo].map(csv).join(",")),
  ];
  await writeFile(CSV, "﻿" + filas.join("\n"), "utf8").then(() => console.log(`\nVista previa completa: ${CSV}`)).catch(() => {});

  if (!APLICAR) return;

  // 1. Fichas nuevas
  const idPorClave = new Map<string, string>();
  for (const lote of lotes(plan.crear)) {
    const r = await airtableMutation<{ records: Array<{ id: string }> }>(tableUrl(TABLA_EQUIPOS), {
      method: "POST",
      body: JSON.stringify({
        typecast: true,
        records: lote.map((c) => ({ fields: {
          Equipo: nombreEquipo(c.datos), Tipo: c.datos.tipo, Marca: c.datos.marca, Modelo: c.datos.modelo, Serie: c.datos.serie,
          Cliente: [c.clienteId], ...(c.contrasena ? { "Contraseña": c.contrasena } : {}), "Creado por": "Migración R5",
        } })),
      }),
    });
    r.records.forEach((x, i) => idPorClave.set(lote[i].clave, x.id));
    await esperar(250);
  }
  console.log(`✓ ${idPorClave.size} fichas creadas`);

  // 2. Ligar órdenes
  let ligadas = 0;
  for (const lote of lotes(plan.ligar)) {
    await airtableMutation(tableUrl(T_ORDENES), {
      method: "PATCH",
      body: JSON.stringify({ records: lote.map((l) => ({ id: l.ordenId, fields: { "Ficha del equipo": [l.fichaId ?? idPorClave.get(l.clave!)!] } })) }),
    });
    ligadas += lote.length;
    await esperar(250);
  }
  console.log(`✓ ${ligadas} órdenes ligadas`);

  // 3. Contraseñas para fichas que ya existían
  for (const lote of lotes(plan.contrasenasExistentes)) {
    await airtableMutation(tableUrl(TABLA_EQUIPOS), {
      method: "PATCH",
      body: JSON.stringify({ records: lote.map((c) => ({ id: c.fichaId, fields: { "Contraseña": c.contrasena } })) }),
    });
    await esperar(250);
  }
  console.log(`✓ ${plan.contrasenasExistentes.length} contraseñas en fichas existentes`);

  // 4. Notas a la Actividad (con la fecha de la orden, sin contraseña)
  for (const lote of lotes(plan.notas)) {
    await airtableMutation(tableUrl(T_HISTORIAL), {
      method: "POST",
      body: JSON.stringify({
        typecast: true,
        records: lote.map((n) => ({ fields: {
          "Órdenes de Reparación": [n.ordenId], "Estado Nuevo": n.texto, Fecha: n.fecha || new Date().toISOString(),
          "Tipo de actividad": "Nota", Visibilidad: "Interna", "Creado por Nombre": "Migración R5",
        } })),
      }),
    });
    await esperar(250);
  }
  console.log(`✓ ${plan.notas.length} notas en la Actividad`);
  console.log("\nListo. Corre otra vez sin --aplicar: debe decir «Acciones: 0».");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
