/**
 * Regla: un borrador solo puede convertirse en factura una vez.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/borrador.consumo.test.ts
 *
 * Puro: global.fetch es un doble en memoria. No toca Airtable real ni el SRI.
 */

import fs from "fs";
import path from "path";

import {
  assertBorradorDisponibleParaEmision,
  BorradorConsumidoError,
  marcarBorradorConsumido,
  obtenerBorradorParaEmision,
} from "../airtable/facturas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchOriginal = global.fetch;
const patches: Array<{ url: string; body: Record<string, unknown> }> = [];

global.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const method = (init?.method ?? "GET").toUpperCase();

  if (method === "PATCH") {
    patches.push({ url, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    return json({ id: "recBORRADORLIMPIO" });
  }

  if (method !== "GET") return json({ error: "metodo inesperado" }, 500);

  if (url.includes("recCONSUMIDO")) {
    return json({
      id: "recCONSUMIDO",
      fields: {
        "Estado": "BORRADOR",
        "Borrador Consumido": true,
        "Factura Emitida Desde Borrador": "001-002-000000708",
      },
    });
  }

  if (url.includes("recBORRADORLIMPIO")) {
    return json({
      id: "recBORRADORLIMPIO",
      fields: {
        "Estado": "BORRADOR",
        "Borrador Consumido": false,
        "Factura Emitida Desde Borrador": "",
      },
    });
  }

  if (url.includes("recLECTURAFALLA")) return json({ error: "Airtable caido" }, 500);

  return json({ error: "registro no esperado" }, 404);
}) as typeof fetch;

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";

  // a) emitir desde un borrador ya consumido se rechaza con el numero anterior
  {
    const borrador = await obtenerBorradorParaEmision("recCONSUMIDO");
    let error: unknown = null;
    try {
      assertBorradorDisponibleParaEmision(borrador);
    } catch (e) {
      error = e;
    }
    assert(error instanceof BorradorConsumidoError, "Borrador consumido: se rechaza antes de emitir");
    assert(
      error instanceof Error && error.message.includes("001-002-000000708"),
      "Borrador consumido: el mensaje incluye la factura emitida desde el borrador"
    );
  }

  // b) emitir desde un borrador limpio procede y el borrador queda marcado
  {
    const borrador = await obtenerBorradorParaEmision("recBORRADORLIMPIO");
    let lanzo = false;
    try {
      assertBorradorDisponibleParaEmision(borrador);
    } catch {
      lanzo = true;
    }
    assert(!lanzo, "Borrador limpio: no bloquea la emision");

    await marcarBorradorConsumido("recBORRADORLIMPIO", "001-002-000000709");
    const patch = patches[patches.length - 1]?.body;
    const fields = patch?.fields as Record<string, unknown> | undefined;
    assert(
      fields?.["Borrador Consumido"] === true,
      "Borrador limpio: queda marcado como consumido"
    );
    assert(
      fields?.["Factura Emitida Desde Borrador"] === "001-002-000000709",
      "Borrador limpio: guarda el numero emitido"
    );
    assert(patch && !("typecast" in patch), "El marcado del borrador escribe sin typecast");
  }

  // Fail-closed: si no se puede leer el borrador, la ruta no puede emitir.
  {
    let lanzo = false;
    try {
      await obtenerBorradorParaEmision("recLECTURAFALLA");
    } catch {
      lanzo = true;
    }
    assert(lanzo, "Si Airtable no deja leer el borrador, la lectura falla y la emision debe cerrarse");
  }

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  const rutaEmitir = fs.readFileSync(path.join(process.cwd(), "app/api/facturacion/emitir/route.ts"), "utf8");
  const form = fs.readFileSync(path.join(process.cwd(), "components/facturacion/FacturacionForm.tsx"), "utf8");

  assert(
    form.includes("borradorOrigenId: borradorId ?? undefined"),
    "El formulario envia el recordId del borrador de origen al emitir"
  );

  const posLeerBorrador = rutaEmitir.indexOf("obtenerBorradorParaEmision");
  const posEmitir = rutaEmitir.indexOf("const resultado = await emitirFactura");
  assert(
    posLeerBorrador > -1 && posEmitir > -1 && posLeerBorrador < posEmitir,
    "La ruta lee y valida el borrador antes de llamar a emitirFactura()"
  );

  const posMarcar = rutaEmitir.indexOf("await marcarBorradorConsumido");
  const posRespuesta = rutaEmitir.indexOf("return NextResponse.json({ success: true");
  const bloqueMarcado = rutaEmitir.slice(Math.max(0, posMarcar - 160), posMarcar + 260);
  assert(
    posEmitir < posMarcar && posMarcar < posRespuesta,
    "El borrador se marca despues de emitirFactura() y antes de devolver la respuesta"
  );
  assert(
    bloqueMarcado.includes("try") && bloqueMarcado.includes("catch"),
    "Si marcar el borrador falla, queda en su propio try/catch y no cambia la respuesta de la emision"
  );
  assert(
    rutaEmitir.includes('estado === "EN PROCESAMIENTO"'),
    "Una factura recibida/en procesamiento tambien consume el borrador: no se reemite"
  );
  assert(
    form.includes("En procesamiento") && form.includes("No emitas otra factura"),
    "La UI trata EN PROCESAMIENTO como factura recibida por el SRI, no como rechazo"
  );

  if (fallos > 0) {
    console.error(`\n❌ borrador.consumo.test.ts — ${fallos} asercion(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ borrador.consumo.test.ts — todos los asserts pasaron");
})();
