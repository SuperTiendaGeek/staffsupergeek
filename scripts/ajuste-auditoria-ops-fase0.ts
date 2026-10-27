/**
 * Ajuste de datos de UNA SOLA VEZ — auditoría Técnicos y Operaciones
 * (27-oct-2026), Fase 0 de los puntos 2, 3 y 5. Reglas y casos en
 * lib/operaciones/ajuste-auditoria-ops-fase0.ts (con pruebas).
 *
 *   · Punto 2: cierra OP-2026-000100/102/103/109 y las enlaza al recibo de su orden.
 *   · Punto 3: REP-000038 queda apartado para OR000432; REP-000103 (duplicado) se elimina
 *     (antes se cierra su asunto "Posible duplicado" en Revisión de inventario).
 *   · Punto 5: ji41416 se asigna a OR000517; e4099 queda libre.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-fase0.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-fase0.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CASO_OR000432, CASO_OR000517, MARCA_FASE0, OPERACIONES_COLGADAS,
  planOperacionColgada, planOR000432, planOR000517,
  type AccionFase0, type LecturaArticulo, type LecturaProductoDigital, type PlanFase0,
} from "../lib/operaciones/ajuste-auditoria-ops-fase0";

const APLICAR = process.argv.includes("--aplicar");
const TOPE_ACCIONES = 20;
const PAUSA_MS = 250;
const REGISTRADO_POR = "Claude (autorizado por el dueño)";

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
    // Un registro BORRADO no responde 404: Airtable devuelve 403
    // INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND (pasó con REP-000103 tras
    // eliminarlo). Para este script significa "ya no existe".
    if (res.status === 403 && cuerpo.includes("INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND")) return null;
    throw new Error(`Airtable ${tabla}/${id}: ${res.status} ${cuerpo}`);
  }
  return (await res.json()) as Registro;
}

async function escribir(tabla: string, metodo: "POST" | "PATCH", fields: Record<string, unknown>, id?: string) {
  const res = await fetch(id ? `${url(tabla)}/${id}` : url(tabla), {
    method: metodo, headers: HEADERS, body: JSON.stringify({ fields, typecast: true }),
  });
  await esperar(PAUSA_MS);
  if (!res.ok) throw new Error(`Airtable ${metodo} ${tabla}${id ? `/${id}` : ""}: ${res.status} ${await res.text()}`);
}

function lecturaArticulo(r: Registro | null): LecturaArticulo {
  const f = r?.fields ?? {};
  return {
    existe: Boolean(r),
    sku: texto(f["SKU"]),
    estado: texto(f["Estado Item"]),
    recibido: f["Recibido"] === true,
    cantidad: numero(f["Cantidad"]),
    cantidadReservada: numero(f["Cantidad Reservada"]),
    reservado: f["Reservado"] === true,
    operacionIds: ids(f["Operación Comercial"]),
    presupuestoIds: ids(f["Presupuesto por Orden"]),
    ordenStockIds: ids(f["Orden de Reparación (Stock)"]),
    facturaIds: ids(f["Factura"]),
    pagoIds: [...ids(f["Shipping Pagos (Items relacionados)"]), ...ids(f["Shipping Pagos"])],
    ordenCompraIds: ids(f["Orden de compra"]),
  };
}

function lecturaDigital(r: Registro | null): LecturaProductoDigital {
  const f = r?.fields ?? {};
  return {
    existe: Boolean(r),
    estado: texto(f["Estado"]),
    ordenIds: ids(f["Orden de Reparación"]),
    lineaIds: ids(f["Presupuesto por Orden"]),
    facturaIds: ids(f["Factura"]),
    reciboIds: ids(f["Recibo"]),
    observaciones: texto(f["Observaciones Internas"]),
  };
}

async function aplicar(a: AccionFase0) {
  switch (a.tipo) {
    case "operacion": return escribir("Operación Comercial", "PATCH", a.campos, a.id);
    case "articulo": return escribir("Shipping Items", "PATCH", a.campos, a.id);
    case "linea-presupuesto": return escribir("Presupuesto por Orden", "PATCH", a.campos, a.id);
    case "producto-digital": return escribir("Productos Digitales", "PATCH", a.campos, a.id);
    case "revision": return escribir("Shipping Revisión de inventario", "PATCH", a.campos, a.id);
    case "evento-articulo":
      return escribir("Shipping Eventos", "POST", {
        "Tipo de entidad": "Shipping Item",
        "Acción": "Corrección administrativa",
        "Item relacionado": [a.articuloId],
        "Descripción del evento": a.descripcion,
        "Datos relevantes": a.datos,
        "Registrado por": REGISTRADO_POR,
        "Fecha del evento": new Date().toISOString(),
      });
    case "eliminar-articulo": {
      // La MISMA regla que el botón "Eliminar" de Shipping V2: vuelve a revisar
      // pagos, packings, documentos, etc. y se niega si algo lo ata.
      const { evaluarEliminacionShippingItem, eliminarShippingItem } = await import("../lib/shipping-v2/airtable");
      const ev = await evaluarEliminacionShippingItem(a.id);
      if (!ev.permitido) throw new Error(`${a.sku} no se puede eliminar: ${ev.bloqueos.join(" ")}`);
      await eliminarShippingItem(a.id, { confirmacion: ev.confirmacion, motivo: a.motivo, registradoPor: REGISTRADO_POR });
      return;
    }
  }
}

async function main() {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  BASE = `https://api.airtable.com/v0/${baseId}`;
  HEADERS = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const planes: PlanFase0[] = [];

  // Punto 2
  for (const c of OPERACIONES_COLGADAS) {
    const [op, rec, art] = [await leer("Operación Comercial", c.operacionId), await leer("Recibos", c.reciboId), await leer("Shipping Items", c.articuloId)];
    planes.push(planOperacionColgada(c, {
      operacion: { existe: Boolean(op), estado: texto(op?.fields["Estado"]), ordenIds: ids(op?.fields["Orden de Reparación"]), reciboIds: ids(op?.fields["Recibos"]), observacion: texto(op?.fields["Observación Interna"]) },
      recibo: { existe: Boolean(rec), estado: texto(rec?.fields["Estado"]), ordenIds: ids(rec?.fields["Orden"]) },
      articulo: { existe: Boolean(art), estado: texto(art?.fields["Estado Item"]), operacionIds: ids(art?.fields["Operación Comercial"]) },
    }));
  }

  // Punto 3
  {
    const c = CASO_OR000432;
    const [real, fantasma, op, linea, revision] = [
      await leer("Shipping Items", c.real.id), await leer("Shipping Items", c.fantasma.id),
      await leer("Operación Comercial", c.operacionId), await leer("Presupuesto por Orden", c.lineaId),
      await leer("Shipping Revisión de inventario", c.revisionId),
    ];
    planes.push(planOR000432({
      real: lecturaArticulo(real),
      fantasma: lecturaArticulo(fantasma),
      operacion: { existe: Boolean(op), estado: texto(op?.fields["Estado"]), articuloIds: ids(op?.fields["Artículo físico"]) },
      linea: { existe: Boolean(linea), articuloIds: ids(linea?.fields["Artículo de inventario"]), historial: texto(linea?.fields["Historial"]) },
      revision: { existe: Boolean(revision), estado: texto(revision?.fields["Estado"]), articuloIds: ids(revision?.fields["Artículo"]) },
    }));
  }

  // Punto 5
  {
    const c = CASO_OR000517;
    planes.push(planOR000517({
      entregada: lecturaDigital(await leer("Productos Digitales", c.entregada.id)),
      liberar: lecturaDigital(await leer("Productos Digitales", c.liberar.id)),
    }));
  }

  let total = 0;
  for (const p of planes) {
    const etiqueta = p.estado === "aplicar" ? "APLICAR" : p.estado === "ya-aplicado" ? "ya aplicado" : "BLOQUEADO";
    console.log(`\n${p.caso}  [${etiqueta}]`);
    for (const a of p.acciones) console.log(`   · ${a.resumen}`);
    for (const b of p.bloqueos) console.log(`   ✗ ${b}`);
    total += p.acciones.length;
  }
  const bloqueados = planes.filter((p) => p.estado === "bloqueado");
  console.log(`\nAcciones: ${total}. Bloqueados: ${bloqueados.length}.`);
  if (total > TOPE_ACCIONES) throw new Error(`Se esperaban como mucho ${TOPE_ACCIONES} acciones y salen ${total}. No se aplica nada.`);
  if (bloqueados.length) { console.log("Hay casos bloqueados: no se aplica NADA hasta revisarlos."); if (APLICAR) process.exit(1); return; }
  if (!APLICAR) { console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar"); return; }

  let hechas = 0;
  for (const p of planes) {
    for (const a of p.acciones) {
      try {
        await aplicar(a);
        hechas += 1;
        console.log(`✓ ${p.caso}: ${a.resumen}`);
      } catch (e) {
        console.error(`✗ ${p.caso}: ${a.resumen}\n  ${e instanceof Error ? e.message : String(e)}`);
        console.error(`Se detuvo tras ${hechas} acciones. Vuelve a correr la vista previa: retoma lo que falta.`);
        process.exit(1);
      }
    }
  }
  console.log(`\n✅ Aplicadas ${hechas} acciones (${MARCA_FASE0}). Vuelve a correr la vista previa: debe decir 0 acciones.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
