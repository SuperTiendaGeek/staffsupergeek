/**
 * Test — el proceso que convierte en ingreso el crédito caducado.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/notaCredito.procesarCaducidades.test.ts
 *
 * Sin red: doble de global.fetch que además anota cada intento de escritura.
 *
 * ─── Qué protege ─────────────────────────────────────────────────────────────
 *
 * Este proceso escribe ingresos en la contabilidad a partir de deudas que se
 * extinguen. Los tres errores que costarían dinero:
 *
 *   · dispararse en pruebas y ensuciar los libros reales
 *   · anotar dos veces el mismo crédito si alguien pulsa el botón dos veces
 *   · que una nota problemática detenga el resto del cierre de mes
 */

import { procesarCaducidades } from "../../finanzas/puentes/notaCreditoCaducidad";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const fetchOriginal = global.fetch;
process.env.AIRTABLE_API_KEY ||= "test";
process.env.AIRTABLE_BASE_ID ||= "appTEST";

type Registro = { id: string; fields: Record<string, unknown> };

/**
 * Doble de Airtable.
 *
 * `fallarMovimientoDe` simula que la creación del movimiento revienta para una
 * nota concreta, para comprobar que las demás siguen su curso.
 */
function doble(candidatas: Registro[], fallarMovimientoDe?: string) {
  const escrituras: Array<{ url: string; body: unknown }> = [];
  let creados = 0;

  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    const s = String(url);
    const metodo = init?.method ?? "GET";

    if (metodo === "GET") {
      // Listado de candidatas (tiene query string) o lectura suelta.
      if (s.includes("filterByFormula")) {
        return { ok: true, status: 200, json: async () => ({ records: candidatas }) } as Response;
      }
      return { ok: true, status: 200, json: async () => candidatas[0] ?? { id: "recX", fields: {} } } as Response;
    }

    const body = init?.body ? JSON.parse(String(init.body)) : null;
    escrituras.push({ url: s, body });

    // Creación de movimiento (POST a la tabla de movimientos).
    if (metodo === "POST") {
      const campos = body?.records?.[0]?.fields ?? body?.fields ?? {};
      const nc = Array.isArray(campos["Nota de Crédito"]) ? campos["Nota de Crédito"][0] : undefined;
      if (fallarMovimientoDe && nc === fallarMovimientoDe) {
        return { ok: false, status: 500, text: async () => "Airtable falló al crear el movimiento" } as Response;
      }
      creados += 1;
      const id = `recMOV${creados}`;
      return {
        ok: true, status: 200,
        json: async () => ({ records: [{ id, fields: campos }], id, fields: campos }),
      } as Response;
    }

    return { ok: true, status: 200, json: async () => ({ id: "recX", fields: {} }) } as Response;
  }) as typeof fetch;

  return escrituras;
}

function nc(id: string, extra: Record<string, unknown> = {}): Registro {
  return {
    id,
    fields: {
      "Número de Nota de Crédito": `001-002-${id}`,
      "Cliente Nombre":            "Abigail Moreno",
      "Estado":                    "AUTORIZADO",
      "Saldo Disponible":          40,
      "Fecha de Caducidad":        "2027-02-14",
      "Estado Crédito":            "Vigente",
      ...extra,
    },
  };
}

(async () => {
  // ═════════════════════════════════════════════════════════════════════════
  // 1. Guardián de ambiente
  // ═════════════════════════════════════════════════════════════════════════

  console.log("\n── en pruebas no se anota ningún ingreso ──");

  for (const ambiente of ["1", undefined, ""] as Array<string | undefined>) {
    const escrituras = doble([nc("recA")]);
    const r = await procesarCaducidades({ ambiente, registradoPor: "Alex", hoy: "2027-03-01" });
    assert(r.estado === "OMITIDO", `ambiente ${JSON.stringify(ambiente)}: se omite`);
    assert(escrituras.length === 0, `ambiente ${JSON.stringify(ambiente)}: CERO escrituras`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Idempotencia — el error que anotaría el mismo ingreso dos veces
  // ═════════════════════════════════════════════════════════════════════════

  console.log("\n── pulsar el botón dos veces no duplica el ingreso ──");

  {
    const yaProcesada = nc("recYA", { "Movimiento Caducidad": ["recMOVPREVIO"] });
    const escrituras = doble([yaProcesada]);
    const r = await procesarCaducidades({ ambiente: "2", registradoPor: "Alex", hoy: "2027-03-01" });
    assert(r.procesadas.length === 0, "Una nota que ya tiene su movimiento no se vuelve a procesar");
    assert(escrituras.length === 0, "…y no se escribe absolutamente nada");
    assert(r.revisadas === 1, "…aunque sí queda contada como revisada");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3. El día de la caducidad todavía vale
  // ═════════════════════════════════════════════════════════════════════════

  console.log("\n── el crédito vale hasta el último día ──");

  {
    doble([nc("recHOY")]);
    const r = await procesarCaducidades({ ambiente: "2", registradoPor: "Alex", hoy: "2027-02-14" });
    assert(r.procesadas.length === 0, "El mismo 14 de febrero el cliente todavía puede usarlo");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 4. El camino feliz
  // ═════════════════════════════════════════════════════════════════════════

  console.log("\n── lo vencido se convierte en ingreso ──");

  {
    const escrituras = doble([nc("recA"), nc("recB", { "Saldo Disponible": 12.5 })]);
    const r = await procesarCaducidades({ ambiente: "2", registradoPor: "Alex", hoy: "2027-03-01" });

    assert(r.procesadas.length === 2, "Se procesan las dos notas vencidas");
    assert(r.montoTotal === 52.5, "El monto total suma los dos saldos: 40 + 12.50");

    const posts = escrituras.filter((e) => !e.url.includes("Notas%20de"));
    assert(posts.length >= 2, "Se crea un movimiento por nota");

    const primerMovimiento = posts[0]?.body as { records?: Array<{ fields: Record<string, unknown> }>; fields?: Record<string, unknown> };
    const campos = primerMovimiento?.records?.[0]?.fields ?? primerMovimiento?.fields ?? {};
    assert(campos["Categoría"] === "Crédito Caducado",
      "La categoría es 'Crédito Caducado', no una venta");
    assert(campos["Tipo de movimiento"] === "Ingreso",
      "Es un Ingreso: la deuda con el cliente se extinguió");
    assert(campos["Cuenta Destino (Finanzas)"] === undefined,
      "Sin cuenta destino: no entró dinero a ninguna caja, es un asiento contable");

    const patches = escrituras.filter((e) => e.url.includes("Notas%20de"));
    assert(patches.length === 2, "Cada nota se cierra con su PATCH");
    const camposPatch = (patches[0]?.body as { fields: Record<string, unknown> })?.fields ?? {};
    assert(camposPatch["Saldo Disponible"] === 0,
      "El saldo queda en 0 EN LA MISMA escritura que enlaza el movimiento");
    assert(camposPatch["Estado Crédito"] === "Caducado", "…y el estado pasa a Caducado");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 5. Una nota rota no arrastra a las demás
  // ═════════════════════════════════════════════════════════════════════════

  console.log("\n── un fallo aislado no detiene el cierre de mes ──");

  {
    doble([nc("recMALA"), nc("recBUENA")], "recMALA");
    const r = await procesarCaducidades({ ambiente: "2", registradoPor: "Alex", hoy: "2027-03-01" });
    assert(r.fallidas.length === 1, "La que falla se reporta como fallida");
    assert(r.procesadas.length === 1, "…y la otra se procesa igual");
    assert(r.fallidas[0]?.numeroNotaCredito === "001-002-recMALA", "Se dice cuál falló, para poder mirarla");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 6. Nunca lanza
  // ═════════════════════════════════════════════════════════════════════════

  console.log("\n── si Airtable no responde, no se rompe la pantalla ──");

  {
    global.fetch = (async () => { throw new Error("Airtable caído"); }) as typeof fetch;
    let lanzo = false;
    let r: Awaited<ReturnType<typeof procesarCaducidades>> | null = null;
    try {
      r = await procesarCaducidades({ ambiente: "2", registradoPor: "Alex", hoy: "2027-03-01" });
    } catch { lanzo = true; }
    assert(!lanzo, "No lanza");
    assert(r?.procesadas.length === 0, "…y no reporta nada como procesado");
  }

  global.fetch = fetchOriginal;

  if (fallos > 0) {
    console.error(`\n❌ notaCredito.procesarCaducidades.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ notaCredito.procesarCaducidades.test.ts — todos los asserts pasaron");
})();
