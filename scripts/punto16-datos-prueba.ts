/**
 * Auditoría ops, punto 16 · 26-nov-2026 — datos de prueba mezclados con los reales.
 * Deja marcado («Es prueba») y en su lugar todo lo de prueba que ya existía:
 *   · crea el cliente PRUEBA INTERNA («Es prueba», con el teléfono del dueño);
 *   · marca y pasa a PRUEBA INTERNA las órdenes OR000057, OR000234, OR000368, sus
 *     2 fichas de equipo y los pedidos OP-2026-000032, 086, 092, 137, 140 y 139;
 *   · OR000368 vuelve a «Finalizado Entregado» (la reapertura del 23-nov fue una prueba);
 *   · OR000342 (Daniel Ruiz) se separa de la factura de PRUEBAS 672;
 *   · «Cliente Prueba Migracion» y «Test Fecha Registro» quedan marcados (no se borran);
 *   · Charles Prueba y «Servicio de prueba» quedan inactivos;
 *   · PL-000009 (demostración, nunca pagado) pasa a «Vencido».
 * No toca: facturas y notas de crédito de PRUEBAS, abonos anulados, artículos dados
 * de baja, Kardex, Finanzas. Constancia en la Actividad de cada orden y en la
 * Observación Interna de cada pedido. Plan puro y pruebas: lib/pruebas/migracion.ts.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/punto16-datos-prueba.ts            # vista previa (+ CSV en Descargas)
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/punto16-datos-prueba.ts --aplicar   # escribir
 *   (después, la vista previa debe decir «Acciones: 0»)
 */

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const CSV = path.join(os.homedir(), "Downloads", "punto16-datos-prueba-vista-previa.csv");

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
const csv = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const hoyEcuador = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { ids, listarTodo, porIds, texto } = await import("../lib/estado-cuenta/airtable");
  const { airtableMutation, tableUrl, escapeFormulaString } = await import("../lib/finanzas/airtable-client");
  const { createHistorialEntrada } = await import("../lib/tecnicos/airtable");
  const { CAMPO_ES_PRUEBA, esPrueba } = await import("../lib/pruebas/reglas");
  const m = await import("../lib/pruebas/migracion");
  const { IDS, NOMBRE_CLIENTE_PRUEBA, ESTADO_ENTREGADA, planDatosPrueba, textoActividadOrden, TEXTO_ACTIVIDAD_OR000342, TEXTO_PEDIDO } = m;

  const T = {
    clientes: "Clientes", ordenes: "Órdenes de Reparación", equipos: "Equipos", pedidos: "Operación Comercial",
    usuarios: "Usuarios", servicios: "Catálogo Servicios", pagos: "Pagos en línea",
  };

  async function foto(): Promise<import("../lib/pruebas/migracion").Foto> {
    const [pi, vacios, ordenes, equipos, pedidos, real, usuario, servicio, pago] = await Promise.all([
      listarTodo(T.clientes, ["Nombre", CAMPO_ES_PRUEBA], `{Nombre}='${escapeFormulaString(NOMBRE_CLIENTE_PRUEBA)}'`),
      porIds(T.clientes, [...IDS.clientesVacios], ["Nombre", CAMPO_ES_PRUEBA]),
      porIds(T.ordenes, [...IDS.ordenes], ["ID", CAMPO_ES_PRUEBA, "Cliente", "Estado Actual"]),
      porIds(T.equipos, [...IDS.equipos], ["Equipo", "Cliente"]),
      porIds(T.pedidos, [...IDS.pedidos], ["Código Operación", CAMPO_ES_PRUEBA, "Cliente"]),
      porIds(T.ordenes, [IDS.ordenReal], ["ID", "Facturas Electrónicas"]),
      porIds(T.usuarios, [IDS.usuario], ["Nombre", "Activo"]),
      porIds(T.servicios, [IDS.servicio], ["Nombre del servicio", "Activo"]),
      porIds(T.pagos, [IDS.pagoEnLinea], ["Pago", "Estado", "ID transacción", "Abono"]),
    ]);
    if (pi.length > 1) throw new Error(`Hay ${pi.length} clientes «${NOMBRE_CLIENTE_PRUEBA}»: dejar uno solo antes de seguir.`);
    const r = real.get(IDS.ordenReal);
    const u = usuario.get(IDS.usuario);
    const s = servicio.get(IDS.servicio);
    const p = pago.get(IDS.pagoEnLinea);
    return {
      clientePrueba: pi[0] ? { id: pi[0].id } : null,
      clientesVacios: [...vacios.values()].map((c) => ({ id: c.id, nombre: texto(c.fields["Nombre"]), esPrueba: esPrueba(c.fields) })),
      ordenes: [...ordenes.values()].map((o) => ({ id: o.id, codigo: texto(o.fields["ID"]) || o.id, esPrueba: esPrueba(o.fields), clienteId: ids(o.fields["Cliente"])[0] ?? null, estado: texto(o.fields["Estado Actual"]) })),
      equipos: [...equipos.values()].map((e) => ({ id: e.id, nombre: texto(e.fields["Equipo"]), clienteId: ids(e.fields["Cliente"])[0] ?? null })),
      pedidos: [...pedidos.values()].map((x) => ({ id: x.id, codigo: texto(x.fields["Código Operación"]) || x.id, esPrueba: esPrueba(x.fields), clienteId: ids(x.fields["Cliente"])[0] ?? null })),
      ordenReal: r ? { id: r.id, codigo: texto(r.fields["ID"]) || r.id, facturaIds: ids(r.fields["Facturas Electrónicas"]) } : null,
      usuario: u ? { id: u.id, nombre: texto(u.fields["Nombre"]), activo: u.fields["Activo"] === true } : null,
      servicio: s ? { id: s.id, nombre: texto(s.fields["Nombre del servicio"]), activo: s.fields["Activo"] === true } : null,
      pagoEnLinea: p ? { id: p.id, nombre: texto(p.fields["Pago"]).split(" · ")[0] || "PL", estado: texto(p.fields["Estado"]), idTransaccion: texto(p.fields["ID transacción"]), abonoIds: ids(p.fields["Abono"]) } : null,
    };
  }

  const f = await foto();
  const faltan = [
    f.clientesVacios.length !== IDS.clientesVacios.length && "clientes vacíos", f.ordenes.length !== IDS.ordenes.length && "órdenes",
    f.equipos.length !== IDS.equipos.length && "fichas", f.pedidos.length !== IDS.pedidos.length && "pedidos",
    !f.ordenReal && "OR000342", !f.usuario && "usuario", !f.servicio && "servicio", !f.pagoEnLinea && "PL-000009",
  ].filter(Boolean);
  if (faltan.length) console.warn(`Aviso: no se encontraron todos los registros (${faltan.join(", ")}). Se sigue con los que hay.`);

  const plan = planDatosPrueba(f);
  console.log(`Acciones: ${plan.acciones.length}`);
  for (const a of plan.acciones) console.log(`  · ${a.texto}`);
  for (const a of plan.avisos) console.log(`  ! ${a}`);
  await writeFile(CSV, ["Acción,Detalle", ...plan.acciones.map((a) => [a.tipo, a.texto].map(csv).join(","))].join("\n"), "utf8").catch(() => undefined);
  console.log(`\nCSV: ${CSV}`);

  if (!APLICAR) {
    console.log(plan.acciones.length ? "\nVista previa. Para escribir: --aplicar" : "\nNada que hacer.");
    return;
  }

  const patch = async (tabla: string, id: string, fields: Record<string, unknown>) => {
    await airtableMutation(`${tableUrl(tabla)}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) });
    await esperar(250);
  };
  const actividad = async (ordenId: string, avanceTexto: string) => {
    await createHistorialEntrada({ ordenRecordId: ordenId, avanceTexto, tipoActividad: "Sistema", visibilidad: "Interna", creadoPorNombre: "Claude (autorizado por el dueño)" });
    await esperar(250);
  };

  // 1. El cliente de prueba (primero: los demás pasos lo necesitan).
  let pi = f.clientePrueba?.id ?? null;
  if (!pi) {
    const dueno = (await porIds(T.clientes, [IDS.clienteDueno], ["Teléfono"])).get(IDS.clienteDueno);
    const creado = await airtableMutation<{ records?: Array<{ id: string }> }>(tableUrl(T.clientes), {
      method: "POST",
      body: JSON.stringify({
        records: [{
          fields: {
            Nombre: NOMBRE_CLIENTE_PRUEBA,
            [CAMPO_ES_PRUEBA]: true,
            "Teléfono": texto(dueno?.fields["Teléfono"]),
            "Cliente - Tipo Identificación": "07 · Consumidor final",
            "Fecha de registro": hoyEcuador(),
            Notas: "Cliente de PRUEBA (punto 16, 26-nov-2026). Todo lo que se registre con él nace marcado como prueba: no sale en tableros ni reportes, no va a Finanzas, no emite facturas ni recibos en producción y no aparta inventario real. El teléfono es el del dueño: los WhatsApp de prueba le llegan a él.",
          },
        }],
        typecast: true,
      }),
    });
    pi = creado.records?.[0]?.id ?? null;
    if (!pi) throw new Error("Airtable no devolvió el cliente nuevo.");
    console.log(`✓ Cliente ${NOMBRE_CLIENTE_PRUEBA} creado (${pi})`);
    await esperar(250);
  }

  const pedidosObs = await porIds(T.pedidos, [...IDS.pedidos], ["Observación Interna"]);
  for (const a of plan.acciones) {
    switch (a.tipo) {
      case "crear_cliente_prueba": break;
      case "marcar_cliente": await patch(T.clientes, a.id, { [CAMPO_ES_PRUEBA]: true }); break;
      case "orden": {
        const campos: Record<string, unknown> = {};
        if (a.marcar) campos[CAMPO_ES_PRUEBA] = true;
        if (a.mover) campos["Cliente"] = [pi];
        if (a.cerrar) campos["Estado Actual"] = ESTADO_ENTREGADA;
        await patch(T.ordenes, a.id, campos);
        await actividad(a.id, textoActividadOrden(a));
        break;
      }
      case "mover_equipo": await patch(T.equipos, a.id, { Cliente: [pi] }); break;
      case "pedido": {
        const antes = texto(pedidosObs.get(a.id)?.fields["Observación Interna"]);
        const linea = `[${hoyEcuador()}] Claude (autorizado por el dueño): ${TEXTO_PEDIDO}`;
        const campos: Record<string, unknown> = { "Observación Interna": [antes.trim(), linea].filter(Boolean).join("\n") };
        if (a.marcar) campos[CAMPO_ES_PRUEBA] = true;
        if (a.mover) campos["Cliente"] = [pi];
        await patch(T.pedidos, a.id, campos);
        break;
      }
      case "separar_factura":
        await patch(T.ordenes, a.id, { "Facturas Electrónicas": a.facturaIds });
        await actividad(a.id, TEXTO_ACTIVIDAD_OR000342);
        break;
      case "desactivar_usuario": await patch(T.usuarios, a.id, { Activo: false }); break;
      case "desactivar_servicio": await patch(T.servicios, a.id, { Activo: false }); break;
      case "cerrar_pago_en_linea":
        await patch(T.pagos, a.id, { Estado: "Vencido", Detalle: "Cerrado sin cobro el 26-nov-2026 (punto 16): era una demostración de la pantalla de pedidos para el personal; nunca se pagó. Autorizado por el dueño." });
        break;
    }
    console.log(`✓ ${a.texto}`);
  }

  console.log("\nListo. Corre otra vez la vista previa: debe decir «Acciones: 0».");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
