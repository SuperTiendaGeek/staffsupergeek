/**
 * Regla: no emitir dos facturas recientes al mismo cliente por el mismo monto,
 * salvo confirmacion explicita de que es otra venta.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/duplicado.mostrador.test.ts
 *
 * Puro: global.fetch es un doble en memoria. No toca Airtable real ni el SRI.
 */

import fs from "fs";
import path from "path";

import {
  buscarFacturaDuplicadaReciente,
  debeBloquearFacturaDuplicadaReciente,
  VENTANA_DUPLICADO_FACTURA_MINUTOS,
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

type RecordDoble = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

const fetchOriginal = global.fetch;
const AHORA = new Date("2026-09-05T23:00:00.000Z");

function haceMinutos(minutos: number): string {
  return new Date(AHORA.getTime() - minutos * 60_000).toISOString();
}

async function conFacturas(records: RecordDoble[], fn: () => Promise<void>): Promise<void> {
  global.fetch = (async (_input: string | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") return json({ error: "metodo inesperado" }, 500);
    return json({ records });
  }) as typeof fetch;

  await fn();
}

function factura(fields: Record<string, unknown>, minutos: number): RecordDoble {
  return {
    id: String(fields.id ?? `rec${Math.random().toString(36).slice(2, 12)}`),
    createdTime: haceMinutos(minutos),
    fields: {
      "Número de Factura": "001-002-000000708",
      "Estado": "AUTORIZADO",
      "Cliente - Nombre": "LUIS CHUQUIN",
      "Cliente - Identificación": "1001471976",
      "Total": 490,
      "Fecha de Emisión": "2026-09-05",
      ...fields,
    },
  };
}

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";

  // c) Mostrador: misma identificacion, mismo total, hace 5 minutos -> bloquea.
  await conFacturas(
    [factura({ id: "recRECIBIDA", "Estado": "RECIBIDA", "Número de Factura": "001-002-000000707" }, 5)],
    async () => {
      const duplicado = await buscarFacturaDuplicadaReciente({
        clienteIdentificacion: "1001471976",
        total: 490,
        ahora: AHORA,
      });
      assert(duplicado?.numeroFactura === "001-002-000000707", "Factura RECIBIDA reciente del mismo cliente y monto se detecta");
      assert(debeBloquearFacturaDuplicadaReciente(duplicado, false), "Sin confirmacion, el duplicado reciente bloquea");

      // d) La misma, con bandera de confirmacion -> procede.
      assert(
        !debeBloquearFacturaDuplicadaReciente(duplicado, true),
        "Con confirmadoNoEsDuplicado=true, la emision puede proceder"
      );
    }
  );

  // e) Mismo cliente y monto, pero hace 2 horas -> fuera de ventana.
  await conFacturas([factura({ id: "recVIEJA" }, 120)], async () => {
    const duplicado = await buscarFacturaDuplicadaReciente({
      clienteIdentificacion: "1001471976",
      total: 490,
      ahora: AHORA,
    });
    assert(duplicado === null, "Mismo cliente y monto hace 2 horas no bloquea");
  });

  // f) Mismo monto, otro cliente -> no bloquea.
  await conFacturas(
    [factura({ id: "recOTROCLIENTE", "Cliente - Identificación": "1003063268", "Cliente - Nombre": "DARIO QUILCA" }, 5)],
    async () => {
      const duplicado = await buscarFacturaDuplicadaReciente({
        clienteIdentificacion: "1001471976",
        total: 490,
        ahora: AHORA,
      });
      assert(duplicado === null, "Mismo monto pero otro cliente no bloquea");
    }
  );

  // Requisito explicito del informe: NO AUTORIZADO y DEVUELTA no son bloqueantes
  // para esta guarda nueva; la correccion/reenvio conserva su propio numero.
  await conFacturas(
    [
      factura({ id: "recNOAUT", "Estado": "NO AUTORIZADO", "Número de Factura": "001-002-000000700" }, 5),
      factura({ id: "recDEVUELTA", "Estado": "DEVUELTA", "Número de Factura": "001-002-000000699" }, 4),
    ],
    async () => {
      const duplicado = await buscarFacturaDuplicadaReciente({
        clienteIdentificacion: "1001471976",
        total: 490,
        ahora: AHORA,
      });
      assert(duplicado === null, "NO AUTORIZADO y DEVUELTA no bloquean la guarda nueva de mostrador");
    }
  );

  // h) Emision normal: sin duplicados no hay bloqueo.
  await conFacturas([], async () => {
    const duplicado = await buscarFacturaDuplicadaReciente({
      clienteIdentificacion: "1001471976",
      total: 490,
      ahora: AHORA,
    });
    assert(duplicado === null, "Sin duplicados recientes, la emision normal sigue sin bloqueo");
    assert(!debeBloquearFacturaDuplicadaReciente(duplicado, false), "Sin duplicado, la regla no bloquea");
  });

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  const rutaEmitir = fs.readFileSync(path.join(process.cwd(), "app/api/facturacion/emitir/route.ts"), "utf8");
  const form = fs.readFileSync(path.join(process.cwd(), "components/facturacion/FacturacionForm.tsx"), "utf8");

  // g) No regresion: la guarda precisa por origen existe y corre antes que la
  // guarda general por cliente+monto.
  const posOrigen = rutaEmitir.indexOf("if (body.origen)");
  const posDuplicado = rutaEmitir.indexOf("duplicadoConfirmado = await buscarFacturaDuplicadaReciente");
  assert(
    posOrigen > -1 && posDuplicado > -1 && posOrigen < posDuplicado,
    "La guarda existente de body.origen sigue corriendo antes que la guarda general de duplicados"
  );
  assert(
    rutaEmitir.includes("buscarFacturaBloqueante(body.origen)"),
    "Una factura desde una orden/operacion con factura previa sigue usando la guarda de origen"
  );

  assert(
    rutaEmitir.includes("code: CODIGO_DUPLICADO_RECIENTE") && rutaEmitir.includes("{ status: 409 }"),
    "El bloqueo por duplicado reciente devuelve un codigo propio y 409, no un 400 generico"
  );
  assert(
    rutaEmitir.includes("VENTANA_DUPLICADO_FACTURA_MINUTOS") && VENTANA_DUPLICADO_FACTURA_MINUTOS === 30,
    "La ventana de duplicado reciente queda como constante nombrada"
  );
  assert(
    form.includes("Confirmar y emitir") && form.includes("Revisar historial") && form.includes("handleEmitir(true)"),
    "El formulario ofrece revisar historial o confirmar explicitamente que es otra venta"
  );

  if (fallos > 0) {
    console.error(`\n❌ duplicado.mostrador.test.ts — ${fallos} asercion(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ duplicado.mostrador.test.ts — todos los asserts pasaron");
})();
