/**
 * Limpieza del pedido de PRUEBA de PayPhone — OP-2026-000140 · 17-nov-2026.
 * Decisión del dueño (17-nov): terminadas las pruebas del punto 23 / 10D, se
 * anulan los abonos "PRUEBA PayPhone" y se cancela el pedido con su solicitud
 * de compra. SOLO este pedido. Los tickets PL-… de "Pagos en línea" quedan
 * como evidencia (no se tocan). Regla y protecciones:
 * lib/pagos-en-linea/limpieza-prueba.ts (con prueba).
 *
 * Reusa las funciones oficiales del portal: anularAbonoPorOrden +
 * anularMovimientoDeAbono (lo mismo que "Anular abono") y
 * cancelarPedidoEspecial (lo mismo que "Cancelar pedido").
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/limpieza-prueba-payphone.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/limpieza-prueba-payphone.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const PEDIDO = "OP-2026-000140";
const QUIEN = "Claude (autorizado por el dueño)";
const MOTIVO = "Pedido de prueba de pagos en línea PayPhone (punto 23 / 10D): limpieza autorizada por el dueño el 17-nov-2026. Los abonos eran PRUEBA (no dinero real).";

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

type Registro = { id: string; fields: Record<string, unknown> };
const texto = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return texto(v[0]);
  return v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
};

async function main(): Promise<void> {
  await cargarEnvLocal();
  const regla = await import("../lib/pagos-en-linea/limpieza-prueba");
  const { airtableRequest, tableUrl, linkedIds, fetchRecordById, firstNumber } = await import("../lib/finanzas/airtable-client");
  const { estadoComercial } = await import("../lib/pedidos-especiales/reglas");
  const { solicitudesDeOperacion } = await import("../lib/compras/servidor");
  const { listarLineasDePedido } = await import("../lib/tecnicos/presupuesto/airtable");
  const { estadosDeCuentaDeOperaciones } = await import("../lib/estado-cuenta/airtable");
  const { planDeCancelacion } = await import("../lib/pedidos-especiales/cancelacion");

  async function buscar(tabla: string, formula: string): Promise<Registro[]> {
    const u = new URL(tableUrl(tabla));
    u.searchParams.set("pageSize", "10");
    u.searchParams.set("filterByFormula", formula);
    return (await airtableRequest<{ records?: Registro[] }>(u.toString())).records ?? [];
  }

  // ── Lectura ────────────────────────────────────────────────────────────────
  async function leer() {
    const ops = await buscar("Operación Comercial", `{Código Operación}='${PEDIDO}'`);
    if (ops.length !== 1) throw new Error(`Se esperaba 1 pedido ${PEDIDO} y hay ${ops.length}.`);
    const op = ops[0];
    const abonos = (await Promise.all(linkedIds(op.fields["Abonos"]).map((id) => fetchRecordById("Abonos", id))))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({
        id: a.id,
        idAbono: firstNumber(a.fields["ID Abono"]) ?? null,
        monto: firstNumber(a.fields["Monto"]) ?? 0,
        metodo: texto(a.fields["Método de Pago"]),
        estado: texto(a.fields["Estado del Abono"]) || "Registrado",
        observacion: texto(a.fields["Observación"]),
        movimientoId: linkedIds(a.fields["Movimiento Financiero"])[0] ?? null,
      }));
    const solicitudes = (await solicitudesDeOperacion(op.id)).map((s) => ({ codigo: s.codigo, estado: s.estado }));
    const lineas = await listarLineasDePedido(op.id);
    const estado = {
      codigo: texto(op.fields["Código Operación"]),
      estado: estadoComercial(texto(op.fields["Estado"])),
      abonos,
      solicitudes,
    };
    return { op, estado, lineas };
  }

  const leido = await leer();
  const { bloqueos, pasos } = regla.planLimpiezaPrueba(leido.estado, PEDIDO);

  console.log(`\n=== Limpieza de prueba ${PEDIDO} — ${APLICAR ? "APLICAR" : "VISTA PREVIA"} ===\n`);
  console.log(`Pedido: ${leido.estado.estado} · líneas: ${leido.lineas.map((l) => `${l.descripcion} (${l.estado})`).join(", ") || "—"}`);
  console.log(`Abonos: ${leido.estado.abonos.map((a) => `${a.idAbono} $${a.monto} ${a.metodo} ${a.estado}`).join(" · ") || "—"}`);
  console.log(`Solicitudes: ${leido.estado.solicitudes.map((s) => `${s.codigo} ${s.estado}`).join(" · ") || "—"}`);
  console.log(`Tickets "Pagos en línea": no se tocan (evidencia).\n`);
  if (bloqueos.length) {
    console.log("⛔ No se puede seguir (no se escribió nada):");
    bloqueos.forEach((b) => console.log(`   · ${b}`));
    process.exit(1);
  }
  console.log(`${pasos.length} acción(es):`);
  pasos.forEach((p, i) => console.log(`  ${i + 1}. ${p.texto}`));
  if (pasos.some((p) => p.tipo === "cancelar_pedido")) {
    // Ensayo de la regla oficial de cancelación con lo que quedará tras anular
    // los abonos de prueba (pagado $0, sin compras hechas): debe aceptarla.
    const ensayo = planDeCancelacion({ estado: leido.estado.estado, motivo: MOTIVO, confirmado: false, esStaffOAdmin: true, pagado: 0 });
    if (!ensayo.ok) {
      console.log(`\n⛔ La cancelación oficial no la aceptaría: ${ensayo.motivo} (no se escribió nada)`);
      process.exit(1);
    }
    console.log(`     (cancelación oficial: caso "${ensayo.plan.caso}", sin dinero que devolver)`);
  }
  if (!APLICAR || pasos.length === 0) {
    if (!APLICAR && pasos.length) console.log("\n(Vista previa: no se escribió nada. Corre con --aplicar cuando el dueño lo apruebe.)");
    return;
  }

  // ── Escritura ──────────────────────────────────────────────────────────────
  const { anularAbonoPorOrden } = await import("../lib/tecnicos/airtable");
  const { anularMovimientoDeAbono } = await import("../lib/finanzas/puentes/abonos");
  const { cancelarPedidoEspecial } = await import("../lib/pedidos-especiales/cancelacion-servidor");

  for (const p of pasos) {
    if (p.tipo !== "anular_abono") continue;
    await anularAbonoPorOrden({ abonoRecordId: p.abonoId });
    const { warning } = await anularMovimientoDeAbono(p.abonoId);
    console.log(`✓ ${p.texto}${warning ? ` — ⚠ ${warning}` : ""}`);
  }

  if (pasos.some((p) => p.tipo === "cancelar_pedido")) {
    const pagado = (await estadosDeCuentaDeOperaciones([leido.op.id])).get(leido.op.id)?.totalAbonado ?? 0;
    if (pagado > 0.005) {
      console.log(`⛔ La cuenta aún muestra $${pagado.toFixed(2)} pagados tras anular: no se cancela. Revisar a mano.`);
      process.exit(1);
    }
    const session = {
      user: { userId: "script", nombre: QUIEN, email: "", rol: "Administrador", appsPermitidas: [], pantallasRestringidas: {}, camposRestringidos: {} },
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    } as unknown as import("../lib/session").StaffSession;
    const r = await cancelarPedidoEspecial({ pedidoId: leido.op.id, session, motivo: MOTIVO });
    console.log(`✓ ${r.codigo} cancelado (caso ${r.plan.caso})${r.aviso ? ` — ⚠ ${r.aviso}` : ""}`);
  }
  console.log("\nListo. Corre otra vez SIN --aplicar: debe decir 0 acciones.");
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
