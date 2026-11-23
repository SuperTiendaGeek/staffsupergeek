/**
 * Rediseño de la orden, parte R10 · 23-nov-2026 — alertas de atención.
 * Pone al día las órdenes ABIERTAS que ya existían (solo campos vacíos):
 *   1. «Último movimiento»: la última entrada de la Actividad hecha por una
 *      persona (o la fecha de ingreso si no hay ninguna).
 *   2. «Responsable»: quien hizo el último cambio en la Actividad, si es una
 *      persona activa en Técnicos (decisión del dueño 22-nov).
 *   3. «Cliente avisado» en las órdenes «Completado»: el día que pasaron a
 *      Completado (supuesto a aprobar en la vista previa).
 * Después muestra cómo quedaría el semáforo de cada orden.
 * Reglas puras y pruebas: lib/tecnicos/alertas/{migracion,reglas}.ts.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/rediseno-r10-alertas.ts            # vista previa (+ CSV en Descargas)
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/rediseno-r10-alertas.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const CSV = path.join(os.homedir(), "Downloads", "r10-alertas-vista-previa.csv");

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
const dia = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** Personas activas en Técnicos o administradores (lee la tabla de usuarios directo). */
async function leerPersonas(): Promise<Array<{ id: string; nombre: string }>> {
  const { opcionesResponsable } = await import("../lib/tecnicos/responsable/reglas");
  const base = process.env.AIRTABLE_BASE_ID, tabla = process.env.AIRTABLE_USERS_TABLE, token = process.env.AIRTABLE_API_KEY;
  if (!base || !tabla || !token) throw new Error("Faltan AIRTABLE_BASE_ID, AIRTABLE_USERS_TABLE o AIRTABLE_API_KEY en .env.local");
  const usuarios: Array<{ id: string; nombre: string; email: string; rol: string; appsPermitidas: string[]; activo: boolean }> = [];
  let offset: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: "100" });
    if (offset) q.set("offset", offset);
    const r = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(tabla)}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Usuarios: HTTP ${r.status} ${await r.text()}`);
    const j = (await r.json()) as { records: Array<{ id: string; fields: Record<string, unknown> }>; offset?: string };
    for (const u of j.records) {
      const f = u.fields;
      const apps = Array.isArray(f["Apps Permitidas"]) ? (f["Apps Permitidas"] as string[]) : String(f["Apps Permitidas"] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      usuarios.push({ id: u.id, nombre: String(f.Nombre ?? ""), email: String(f.Email ?? ""), rol: String(f.Rol ?? "staff"), appsPermitidas: apps, activo: f.Activo === true });
    }
    offset = j.offset;
  } while (offset);
  return opcionesResponsable(usuarios).map((o) => ({ id: o.id, nombre: o.nombre }));
}

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { listarTodo, porIds, ids, texto } = await import("../lib/estado-cuenta/airtable");
  const { airtableMutation, tableUrl } = await import("../lib/finanzas/airtable-client");
  const { lineasPorIds, T_PRESUPUESTO } = await import("../lib/tecnicos/presupuesto/airtable");
  const { leerConfiguracion } = await import("../lib/configuracion/airtable");
  const { planAlertas, CAMPO_MOVIMIENTO, CAMPO_RESPONSABLE, CAMPO_AVISADO } = await import("../lib/tecnicos/alertas/migracion");
  const { evaluarOrden, mezclarConfig, NOMBRE_SITUACION } = await import("../lib/tecnicos/alertas/reglas");

  const T_ORDENES = "Órdenes de Reparación";
  const T_HISTORIAL = "Historial de Estados";
  const CAMPOS = ["ID", "Estado Actual", "Fecha de Ingreso", "Historial de Estados", T_PRESUPUESTO,
    CAMPO_RESPONSABLE, CAMPO_MOVIMIENTO, "Alerta pospuesta hasta", CAMPO_AVISADO, "Presupuesto enviado"];
  const FORMULA = "AND({Estado Actual} != 'Finalizado Entregado', {Estado Actual} != 'Enviado a Reciclaje')";

  const [ordenesRaw, personas, guardada] = await Promise.all([
    listarTodo(T_ORDENES, CAMPOS, FORMULA),
    leerPersonas(),
    leerConfiguracion("alertas-ordenes").catch(() => ({ valor: null })),
  ]);
  const historialIds = ordenesRaw.flatMap((r) => ids(r.fields["Historial de Estados"]));
  const historial = await porIds(T_HISTORIAL, historialIds, ["Estado Nuevo", "Fecha", "Tipo de actividad", "Creado por Nombre", "Creado por Usuario ID"]);

  const fecha = (f: Record<string, unknown>, k: string) => texto(f[k]) || null;
  const ordenes = ordenesRaw.map((r) => ({
    id: r.id,
    codigo: texto(r.fields["ID"]) || r.id,
    estado: texto(r.fields["Estado Actual"]) || "Pendiente",
    fechaIngreso: texto(r.fields["Fecha de Ingreso"]) || r.createdTime || new Date().toISOString(),
    responsableId: ids(r.fields[CAMPO_RESPONSABLE])[0] ?? null,
    ultimoMovimiento: fecha(r.fields, CAMPO_MOVIMIENTO),
    clienteAvisado: fecha(r.fields, CAMPO_AVISADO),
    historial: ids(r.fields["Historial de Estados"]).flatMap((hid) => {
      const h = historial.get(hid);
      if (!h) return [];
      const autorId = texto(h.fields["Creado por Usuario ID"]);
      return [{
        id: hid,
        fecha: texto(h.fields["Fecha"]) || h.createdTime || "",
        texto: texto(h.fields["Estado Nuevo"]),
        tipo: texto(h.fields["Tipo de actividad"]),
        autorId: autorId.startsWith("rec") ? autorId : null,
        autorNombre: texto(h.fields["Creado por Nombre"]),
      }];
    }),
  }));

  const plan = planAlertas({ ordenes, personas });
  const nMov = plan.acciones.filter((a) => a.movimiento).length;
  const nResp = plan.acciones.filter((a) => a.responsable).length;
  const nAvis = plan.acciones.filter((a) => a.avisado).length;
  console.log(`Órdenes abiertas: ${ordenes.length} · personas que pueden ser responsables: ${personas.map((p) => p.nombre).join(", ")}`);
  console.log(`Acciones: ${plan.acciones.length} órdenes · último movimiento ${nMov} · responsable ${nResp} · cliente avisado ${nAvis}`);
  const porPersona = new Map<string, number>();
  for (const a of plan.acciones) if (a.responsable) porPersona.set(a.responsable.nombre, (porPersona.get(a.responsable.nombre) ?? 0) + 1);
  for (const [n, c] of porPersona) console.log(`  responsable ${n}: ${c}`);
  if (plan.quedanSinResponsable.length) console.log(`Quedan sin responsable (nadie de Técnicos escribió en su Actividad): ${plan.quedanSinResponsable.map((x) => x.codigo).join(", ")}`);
  for (const a of plan.acciones) {
    const partes = [
      a.movimiento && `mov ${dia(a.movimiento.fecha)}`,
      a.responsable && `resp ${a.responsable.nombre}`,
      a.avisado && `avisado ${dia(a.avisado.fecha)} (${a.avisado.de})`,
    ].filter(Boolean);
    console.log(`  ${a.codigo.padEnd(9)} ${a.estado.padEnd(20)} ${partes.join(" · ")}`);
  }

  // Cómo quedaría el semáforo (con los valores propuestos).
  const config = mezclarConfig(guardada.valor);
  const lineas = new Map((await lineasPorIds(ordenesRaw.flatMap((r) => ids(r.fields[T_PRESUPUESTO])))).map((l) => [l.id, l]));
  const ahora = new Date();
  const semaforo = ordenes.map((o) => {
    const a = plan.acciones.find((x) => x.ordenId === o.id);
    const r = ordenesRaw.find((x) => x.id === o.id)!;
    const alerta = evaluarOrden({
      id: o.id, codigo: o.codigo, estado: o.estado, fechaIngreso: o.fechaIngreso,
      responsableId: o.responsableId ?? a?.responsable?.id ?? null,
      ultimoMovimiento: o.ultimoMovimiento ?? a?.movimiento?.fecha ?? null,
      pospuestaHasta: fecha(r.fields, "Alerta pospuesta hasta"),
      clienteAvisado: o.clienteAvisado ?? a?.avisado?.fecha ?? null,
      presupuestoEnviado: fecha(r.fields, "Presupuesto enviado"),
      lineas: ids(r.fields[T_PRESUPUESTO]).map((id) => lineas.get(id)).filter((l): l is NonNullable<typeof l> => !!l).map((l) => ({
        estado: l.estado, estadoTrabajo: l.estadoTrabajo ?? "", motivoEspera: l.motivoEspera ?? "", trabajoEn: l.trabajoEn || null,
        fechaAprobacion: l.fechaAprobacion || null, bajoPedido: l.bajoPedido, tiempoEstimado: l.tiempoEstimado ?? "", descripcion: l.descripcion,
      })),
    }, config, ahora);
    return { o, a, alerta };
  });
  const cuenta = (n: string) => semaforo.filter((s) => s.alerta?.nivel === n).length;
  console.log(`Semáforo después: rojo ${cuenta("atencion")} · ámbar ${cuenta("porVencer")} · al día ${cuenta("alDia") + semaforo.filter((s) => !s.alerta).length}`);
  const porSituacion = new Map<string, number>();
  for (const s of semaforo) if (s.alerta && s.alerta.nivel !== "alDia") porSituacion.set(NOMBRE_SITUACION[s.alerta.clave], (porSituacion.get(NOMBRE_SITUACION[s.alerta.clave]) ?? 0) + 1);
  for (const [n, c] of [...porSituacion].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(3)}  ${n}`);

  const filas = [
    "Código,Estado,Último movimiento,De dónde,Responsable,De qué entrada,Cliente avisado,Supuesto,Semáforo,Situación,Hace",
    ...semaforo.map(({ o, a, alerta }) => [
      o.codigo, o.estado,
      a?.movimiento ? dia(a.movimiento.fecha) : `(ya tenía) ${dia(o.ultimoMovimiento)}`, a?.movimiento?.de ?? "",
      a?.responsable?.nombre ?? (o.responsableId ? "(ya tenía)" : "(queda sin responsable)"), a?.responsable?.de ?? "",
      a?.avisado ? dia(a.avisado.fecha) : o.clienteAvisado ? `(ya tenía) ${dia(o.clienteAvisado)}` : "", a?.avisado?.de ?? "",
      alerta ? { atencion: "Rojo", porVencer: "Ámbar", alDia: "Al día" }[alerta.nivel] : "Al día", alerta?.texto ?? "", alerta?.hace ?? "",
    ].map(csv).join(",")),
  ];
  await writeFile(CSV, filas.join("\n"), "utf8");
  console.log(`CSV: ${CSV}`);

  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para escribir: --aplicar");
    return;
  }
  let hechas = 0;
  for (const grupo of lotes(plan.acciones)) {
    await airtableMutation(tableUrl(T_ORDENES), {
      method: "PATCH",
      body: JSON.stringify({ records: grupo.map((a) => ({ id: a.ordenId, fields: a.campos })) }),
    });
    hechas += grupo.length;
    await esperar(250);
  }
  console.log(`\nListo: ${hechas} órdenes actualizadas. Corre otra vez sin --aplicar: debe decir 0 acciones.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
