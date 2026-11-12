/**
 * Punto cero del inventario (decisión del dueño, 12-nov-2026). Reglas y
 * explicación en lib/shipping-v2/ajuste-punto-cero.ts (con pruebas).
 *
 * Qué hace:
 *  1. Toma el último inventario general aplicado ("Inventario general 7 nov").
 *  2. A los registros cuyo Kardex no decía lo contado, les escribe UN
 *     "Ajuste del Kardex" con la fecha del conteo (se esperan 5).
 *  3. Corrige "Unidades compradas" de OTR-000028 (3 → 4), con su evento.
 * No toca Cantidad, documentos ni pagos. Se puede correr más de una vez: la
 * segunda vista previa debe decir 0 movimientos y 0 cambios.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-inventario-punto-cero.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-inventario-punto-cero.ts --aplicar   # escribir
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
/** Tope de seguridad: el 12-nov la vista previa daba 5. */
const TOPE_MOVIMIENTOS = 10;
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
const texto = (v: unknown) => (typeof v === "string" ? v : "");

async function main() {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const url = (tabla: string) => `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tabla)}`;

  const { listarTabla, leerMovimientos, escribirMovimientosKardex } = await import("../lib/shipping-v2/kardex-registro");
  const { corteDeConteos } = await import("../lib/shipping-v2/revision-inventario");
  const { planKardexPuntoCero, planCorreccionesCompradas, HECHO_POR_PUNTO_CERO } = await import("../lib/shipping-v2/ajuste-punto-cero");

  console.log("Leyendo Airtable…");
  const [items, movimientos, conteos] = await Promise.all([
    listarTabla("Shipping Items", {
      campos: [
        "SKU", "Nombre del item", "Categoría", "Número de serie", "Es uso local", "Recibido", "Estado Item", "Cantidad", "Unidades compradas",
        "Costo proveedor", "Costo flete asignado", "Costo arancel asignado", "Otros costos asignados", "Costo de mejoras",
        "Costo total unidad", "Costo asignado por despiece",
      ],
    }),
    leerMovimientos(),
    listarTabla("Shipping Conteos", { campos: ["Conteo", "Estado", "Categorías", "Fecha aplicado", "Foto inicial"] }),
  ]);
  const lineas = (v: unknown) => texto(v).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidatos = conteos.map((r) => {
    let foto: Record<string, unknown> | null = null;
    try { foto = texto(r.fields["Foto inicial"]) ? JSON.parse(texto(r.fields["Foto inicial"])) : null; } catch { foto = null; }
    return { id: r.id, nombre: texto(r.fields["Conteo"]), estado: texto(r.fields["Estado"]), categorias: lineas(r.fields["Categorías"]), fechaAplicado: texto(r.fields["Fecha aplicado"]), foto };
  });
  const corte = corteDeConteos(candidatos);
  if (!corte) throw new Error("No hay un inventario general aplicado.");
  const corteId = candidatos.find((c) => c.fechaAplicado === corte.fecha && c.nombre === corte.nombre)!.id;
  console.log(`Artículos ${items.length} · movimientos en el Kardex ${movimientos.length}`);
  console.log(`Punto cero: "${corte.nombre}" aplicado el ${corte.fecha} (${corte.contados.length} registros en la tienda al contar)\n`);

  const plan = planKardexPuntoCero({ corte: { ...corte, id: corteId }, items, movimientos });
  console.log(`Kardex distinto de lo contado al cerrar el conteo: ${plan.filas.length}`);
  const motivoDe = (id: string) => plan.movimientos.find((m) => m.registroId === id)?.motivo ?? "(ya registrado)";
  for (const f of plan.filas) console.log(`  ${f.sku.padEnd(11)} libro ${f.libroAlCorte} → contado ${f.tiendaAlCorte}  (${f.ajuste > 0 ? "+" : ""}${f.ajuste} · ${motivoDe(f.id)})`);
  console.log(`Movimientos nuevos: ${plan.movimientos.length}`);
  if (plan.revisar.length) {
    console.log(`\nPara revisar a mano (no se tocan): ${plan.revisar.length}`);
    for (const r of plan.revisar) console.log(`  ${r.sku.padEnd(11)} ${r.motivo}`);
  }

  const compradas = planCorreccionesCompradas(items);
  console.log(`\n"Unidades compradas": ${compradas.cambiar.length} por corregir · ${compradas.yaHechas.length} ya hechas`);
  for (const c of compradas.cambiar) console.log(`  ${c.sku.padEnd(11)} ${c.antes} → ${c.despues}`);
  for (const c of compradas.revisar) console.log(`  ${c.sku.padEnd(11)} dice ${String(c.actual)} (se esperaba ${c.antes}): NO se toca`);

  if (plan.movimientos.length > TOPE_MOVIMIENTOS) {
    throw new Error(`Se esperaban como mucho ${TOPE_MOVIMIENTOS} movimientos y salen ${plan.movimientos.length}. No se aplica nada: revisar.`);
  }
  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }

  const ahora = new Date().toISOString();
  const nombre = new Map(items.map((i) => [i.id, texto(i.fields["Nombre del item"])]));
  const evento = (itemId: string, descripcion: string) => ({
    fields: {
      "Tipo de entidad": "Shipping Item",
      "Fecha del evento": ahora,
      "Descripción del evento": descripcion,
      "Acción": "Actualizado",
      "Datos relevantes": nombre.get(itemId) ?? "",
      "Item relacionado": [itemId],
      "Registrado por": HECHO_POR_PUNTO_CERO,
    },
  });

  await escribirMovimientosKardex(plan.movimientos);
  const eventos = plan.filas
    .filter((f) => plan.movimientos.some((m) => m.registroId === f.id))
    .map((f) => evento(f.id, `Kardex: punto cero del inventario (${corte.nombre}). El libro decía ${f.libroAlCorte} y en el conteo había ${f.tiendaAlCorte}: "${motivoDe(f.id)}" ${f.ajuste > 0 ? "+" : ""}${f.ajuste} en el libro. La tienda (Cantidad) no cambia.`));

  for (const c of compradas.cambiar) {
    const res = await fetch(url("Shipping Items"), {
      method: "PATCH",
      headers,
      body: JSON.stringify({ records: [{ id: c.id, fields: { "Unidades compradas": c.despues, "Última actualización": ahora, "Actualizado por": HECHO_POR_PUNTO_CERO } }] }),
    });
    if (!res.ok) throw new Error(`No se pudo corregir ${c.sku}: ${res.status} ${await res.text()}`);
    eventos.push(evento(c.id, `Corrección de datos (punto cero 7-nov, aprobada por el dueño): Unidades compradas ${c.antes} → ${c.despues}. ${c.motivo}`));
    await esperar(PAUSA_MS);
  }
  for (let i = 0; i < eventos.length; i += 10) {
    const res = await fetch(url("Shipping Eventos"), { method: "POST", headers, body: JSON.stringify({ records: eventos.slice(i, i + 10), typecast: true }) });
    if (!res.ok) console.error(`No se pudo guardar un evento (los cambios ya están hechos): ${res.status} ${await res.text()}`);
    await esperar(PAUSA_MS);
  }
  console.log(`\n✅ ${plan.movimientos.length} movimientos de Kardex y ${compradas.cambiar.length} corrección(es) de compradas. Vuelve a correr la vista previa: debe decir 0.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
