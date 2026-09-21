/**
 * Test — selector de documento desde la orden (factura / recibo / proforma).
 *
 * Cubre las dos reglas que sostienen el cambio:
 *
 *  1. BLOQUEO CRUZADO. Una orden se cierra con UN documento de venta. Un
 *     recibo vigente impide facturar y una factura vigente impide recibir,
 *     porque los dos descuentan inventario y registran el ingreso. Un recibo
 *     Anulado no bloquea (su anulación ya devolvió stock y dinero).
 *
 *  2. PRECARGA SIN PÉRDIDA. Al pasar de Factura a Recibo o Proforma, el
 *     cliente y las líneas son los mismos y el total no cambia: el backend
 *     manda la base sin IVA y el impuesto aparte, y los documentos no
 *     tributarios trabajan con el precio final.
 *
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/documento-desde-orden.test.ts
 */

import fs   from "fs";
import path from "path";

import { buscarDocumentoBloqueante } from "../gancho/idempotencia";
import {
  clienteDesdePrefactura, lineasReciboDesdePrefactura, lineasProformaDesdePrefactura,
  abonosDesdePrefactura, formaPagoSaldoDesdePrefactura,
} from "../gancho/prefill";
import type { OrigenGancho, DatosVenta } from "../emitirFactura";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const fetchOriginal = global.fetch;

// Doble de Airtable: el registro de origen (con sus inversos) y las tablas
// enlazadas. Mismo patrón que gancho.idempotencia.test.ts.
function fetchDoble(
  registroOrigen: { fields: Record<string, unknown> } | null,
  porTabla: Record<string, Array<{ id: string; fields: Record<string, unknown> }>>
) {
  return (url: string | URL) => {
    const urlStr = String(url);
    if (!urlStr.includes("filterByFormula")) {
      if (!registroOrigen) return Promise.resolve({ ok: false } as Response);
      return Promise.resolve({ ok: true, json: async () => ({ id: "recORIGEN", fields: registroOrigen.fields }) } as Response);
    }
    const tabla = decodeURIComponent(urlStr.split("/").pop()!.split("?")[0]);
    return Promise.resolve({ ok: true, json: async () => ({ records: porTabla[tabla] ?? [] }) } as Response);
  };
}

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";

  const origen: OrigenGancho = { tipo: "orden", recordId: "recORDEN0001" };

  // ─── 1. Bloqueo cruzado ───────────────────────────────────────────────────

  {
    global.fetch = fetchDoble(
      { fields: { "Recibos": ["recREC0001"] } },
      { "Recibos": [{ id: "recREC0001", fields: { "Número": "REC-000010", Estado: "Vigente", Total: 120 } }] }
    ) as unknown as typeof fetch;
    const b = await buscarDocumentoBloqueante(origen);
    assert(b?.tipo === "recibo", "Un recibo Vigente bloquea la emisión de cualquier otro documento de venta");
    assert(b?.tipo === "recibo" && b.recibo.numero === "REC-000010", "El bloqueo trae el número del recibo existente");
  }

  {
    global.fetch = fetchDoble(
      { fields: { "Recibos": ["recREC0002"] } },
      { "Recibos": [{ id: "recREC0002", fields: { "Número": "REC-000011", Estado: "Anulado", Total: 120 } }] }
    ) as unknown as typeof fetch;
    const b = await buscarDocumentoBloqueante(origen);
    assert(b === null, "Un recibo Anulado NO bloquea: su anulación ya devolvió stock y dinero");
  }

  {
    global.fetch = fetchDoble(
      { fields: { "Facturas Electrónicas": ["recFACT0001"], "Recibos": ["recREC0003"] } },
      {
        "Facturas Electrónicas": [{ id: "recFACT0001", fields: { Estado: "AUTORIZADO", "Número de Factura": "001-002-000000900" } }],
        "Recibos": [{ id: "recREC0003", fields: { "Número": "REC-000012", Estado: "Vigente", Total: 50 } }],
      }
    ) as unknown as typeof fetch;
    const b = await buscarDocumentoBloqueante(origen);
    assert(b?.tipo === "factura", "Con factura y recibo vigentes gana la factura en el mensaje (es el documento tributario)");
  }

  {
    global.fetch = fetchDoble({ fields: {} }, {}) as unknown as typeof fetch;
    const b = await buscarDocumentoBloqueante(origen);
    assert(b === null, "Sin documentos vinculados no bloquea nada");
  }

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  // ─── 2. Precarga sin pérdida ──────────────────────────────────────────────

  // Pre-factura típica de una orden: un servicio y un repuesto, base sin IVA
  // + impuesto aparte, más un abono ya cobrado.
  const datosVenta = {
    tipoIdentificacionComprador: "05",
    razonSocialComprador: "JUAN PEREZ",
    identificacionComprador: "1002003004",
    correoComprador: "juan@example.com",
    clienteRecordId: "recCLI0001",
    detalles: [
      { codigoPrincipal: "SERV-01", descripcion: "Cambio de pantalla", unidadMedida: "UNIDAD", cantidad: 1, precioUnitario: 100, descuento: 0, precioTotalSinImpuesto: 100, impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 100, valor: 15 }], tipo: "servicio" },
      // Repuesto histórico: la ÚNICA línea que puede traer cantidad > 1. Su
      // precioUnitario ya viene dividido (base/cantidad) pero el impuesto es
      // el de la línea completa — de ahí la división en precioFinal().
      { codigoPrincipal: "SG-0001", descripcion: "Pantalla original", unidadMedida: "UNIDAD", cantidad: 2, precioUnitario: 50, descuento: 0, precioTotalSinImpuesto: 100, impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 100, valor: 15 }], tipo: "producto", shippingItemId: "recITEM0001" },
    ],
    pagos: [
      { formaPago: "01", total: 80, origenPago: "abono", fechaAbono: "2026-09-10" },
      { formaPago: "01", total: 150, origenPago: "saldo" },
    ],
    importeTotal: 230,
  } as unknown as DatosVenta;

  const cliente = clienteDesdePrefactura(datosVenta);
  assert(cliente.airtableId === "recCLI0001" && cliente.razonSocial === "JUAN PEREZ",
    "El cliente de la orden viaja al recibo/proforma con su ficha real");
  assert(clienteDesdePrefactura({ ...datosVenta, tipoIdentificacionComprador: "07" } as DatosVenta).esConsumidorFinal,
    "Una orden a Consumidor Final llega marcada como Consumidor Final");

  const lineasRecibo = lineasReciboDesdePrefactura(datosVenta);
  assert(lineasRecibo.length === 2, "Las dos líneas de la orden llegan al recibo");
  assert(lineasRecibo[0].precioUnitario === 115, `El servicio llega a precio final con IVA ($115, obtenido: $${lineasRecibo[0].precioUnitario})`);
  assert(lineasRecibo[1].precioUnitario === 57.5, `El repuesto llega a precio final con IVA ($57.50, obtenido: $${lineasRecibo[1].precioUnitario})`);
  assert(lineasRecibo[1].shippingItemId === "recITEM0001", "El vínculo al Shipping Item se conserva (es lo que descuenta stock)");

  const totalRecibo = lineasRecibo.reduce((s, l) => s + l.cantidad * l.precioUnitario - l.descuento, 0);
  assert(Math.abs(totalRecibo - 230) < 0.01,
    `El total del recibo es idéntico al de la factura ($230, obtenido: $${totalRecibo.toFixed(2)}) — cambiar de documento no cambia lo que paga el cliente`);

  const lineasProforma = lineasProformaDesdePrefactura(datosVenta);
  assert(lineasProforma[0].tarifaIva === "4" && lineasProforma[0].precioUnitario === 115,
    "La proforma conserva la tarifa de IVA y el precio final");

  const abonos = abonosDesdePrefactura(datosVenta);
  assert(abonos.length === 1 && abonos[0].total === 80, "Los abonos ya cobrados se muestran aparte, no se vuelven a cobrar");
  assert(formaPagoSaldoDesdePrefactura(datosVenta) === "01", "La forma de pago sugerida es la del saldo");

  // ─── 3. Guardas a nivel de código fuente ──────────────────────────────────

  const raiz = path.join(__dirname, "..", "..", "..");
  const rutaRecibos = fs.readFileSync(path.join(raiz, "app", "api", "facturacion", "recibos", "route.ts"), "utf8");
  assert(rutaRecibos.includes("buscarDocumentoBloqueante(body.origen)"),
    "El POST de recibos re-verifica el bloqueo server-side (la regla no es saltable con un request directo)");
  assert(rutaRecibos.includes("procesarPuenteRecibo") && rutaRecibos.includes("registrarIngresoRecibo"),
    "Con origen usa el puente (saldo); sin origen sigue el asiento simple de mostrador");

  const panel = fs.readFileSync(path.join(raiz, "components", "cuenta-unificada", "CuentaUnificadaPanel.tsx"), "utf8");
  assert(panel.includes("Emitir documento") && !panel.includes("Emitir factura →"),
    "El botón de la orden ofrece un documento, no solo una factura");

  const selector = fs.readFileSync(path.join(raiz, "components", "facturacion", "EmisionDesdeOrigen.tsx"), "utf8");
  assert(selector.includes("/api/facturacion/prefactura?") && selector.includes("prefactura={prefactura.datosVenta}"),
    "El selector pide la pre-factura una vez y se la pasa a los formularios no tributarios");

  // No regresión del spinner infinito: el efecto que pide la pre-factura NO
  // puede depender de `cargando`. Si lo hace, setCargando(true) vuelve a
  // disparar el efecto, su limpieza cancela el fetch en vuelo y el segundo
  // pase sale por el guard — el "Cargando datos de la orden…" se queda
  // girando para siempre. La marca de "ya pedida" va en un ref.
  const depsEfecto = selector.match(/\}, \[hayOrigen[^\]]*\]\);/);
  assert(!!depsEfecto && !depsEfecto[0].includes("cargando") && !depsEfecto[0].includes("prefactura"),
    `El efecto de carga no depende de 'cargando' ni de 'prefactura' (dependencias: ${depsEfecto?.[0] ?? "no encontradas"})`);
  assert(selector.includes("pedida  = useRef(false)") || selector.includes("pedida = useRef(false)"),
    "La marca de 'pre-factura ya pedida' vive en un ref, no en estado");

  if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
  console.log("\nOK — bloqueo cruzado y precarga de documento verificados.");
})();
