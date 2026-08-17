/**
 * Test — referencia (número de transacción) de pago en la factura y su
 * RIDE, en los dos caminos (mostrador y desde una orden).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/referenciaPago.test.ts
 *
 * Cubre:
 *   (a) una factura desde una orden con dos abonos DeUna genera dos campos
 *       adicionales, "DeUna 1" y "DeUna 2", con sus números ← la central.
 *   (b) el número NO aparece en el nodo <pago> del XML generado.
 *   (c) con 20 referencias, el resultado tiene como mucho 15 campos
 *       adicionales y ninguna referencia se pierde.
 *   (d) un valor de 400 caracteres queda recortado a 300.
 *   (e) un valor con salto de línea sale sin salto de línea.
 *   (f) una factura sin referencias genera exactamente el infoAdicional de
 *       antes (no-regresión — verificado manualmente que falla si se
 *       rompe la inyección de Vendedor o de infoAdicionalExtra).
 *
 * Sin red — todo en memoria, ninguna llamada a Airtable/SRI.
 */

import { calcularFormasPago } from "../gancho/construccion";
import {
  construirCamposReferenciaPago,
  construirInfoAdicionalFactura,
  mensajeReferenciaPagoFaltante,
  CODIGO_SRI_REQUIERE_REFERENCIA,
} from "../reglas/referenciaPago";
import { construirFacturaXml } from "../xml/construirFacturaXml";
import { generateAccessKey } from "../claveAcceso";
import type { FacturaInput, Pago } from "../types/factura";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ═══ (a) — Dos abonos DeUna → "DeUna 1" / "DeUna 2" con sus números ═══════════
// Recorre el camino real: abonos vigentes → calcularFormasPago() →
// construirCamposReferenciaPago(), igual que hace emitirFactura.ts.
{
  const abonosVigentes = [
    { metodoPago: "DeUna", monto: 30, numeroTransaccion: "DEUNA-000123", fecha: "2026-08-10" },
    { metodoPago: "DeUna", monto: 15, numeroTransaccion: "DEUNA-000124", fecha: "2026-08-12" },
  ];
  const pagos = calcularFormasPago(abonosVigentes, 45);
  assert(pagos.length === 2, "(a) calcularFormasPago: sin saldo pendiente, 2 líneas exactas");

  const campos = construirCamposReferenciaPago(pagos, 14);
  assert(campos.length === 2, "(a) 2 pagos DeUna con referencia → 2 campos adicionales");
  assert(campos[0].nombre === "DeUna 1", "(a) el primero se llama 'DeUna 1'");
  assert(campos[0].valor === "DEUNA-000123", "(a) con su número correcto");
  assert(campos[1].nombre === "DeUna 2", "(a) el segundo se llama 'DeUna 2' — contador propio de 'DeUna'");
  assert(campos[1].valor === "DEUNA-000124", "(a) con su número correcto");
}

// Mismo caso pero con saldo pendiente: la línea de saldo NUNCA lleva referencia.
{
  const abonosVigentes = [{ metodoPago: "DeUna", monto: 30, numeroTransaccion: "DEUNA-000200", fecha: "2026-08-10" }];
  const pagos = calcularFormasPago(abonosVigentes, 50); // 20 de saldo pendiente
  assert(pagos.length === 2, "(a) con saldo: 2 líneas (1 abono + 1 saldo)");
  assert(pagos[1].origenPago === "saldo", "(a) la segunda línea es el saldo pendiente");
  assert(pagos[1].referencia === undefined, "(a) la línea de saldo pendiente NUNCA lleva referencia — no es un cobro registrado");

  const campos = construirCamposReferenciaPago(pagos, 14);
  assert(campos.length === 1, "(a) con saldo: solo 1 campo adicional (el del abono, no el del saldo)");
  assert(campos[0].nombre === "DeUna 1", "(a) el campo del abono se numera igual, ignorando la línea de saldo");
}

// ═══ (b) — El número NO aparece en el nodo <pago> del XML ════════════════════
{
  const claveAcceso = generateAccessKey({
    fechaEmision: new Date(2026, 7, 17),
    tipoComprobante: "01",
    ruc: "1792146739001",
    ambiente: "1",
    establecimiento: "001",
    puntoEmision: "001",
    secuencial: "1",
    codigoNumerico: "12345678",
  });

  const REFERENCIA_SECRETA = "NUM-SECRETO-999999";

  const fixture: FacturaInput = {
    ambiente: "1",
    razonSocial: "SUPER GEEK S.A.",
    ruc: "1792146739001",
    claveAcceso,
    estab: "001",
    ptoEmi: "001",
    secuencial: "1",
    dirMatriz: "AV. REPUBLICA E7-101 Y DIEGO DE ALMAGRO, QUITO",
    fechaEmision: new Date(2026, 7, 17),
    tipoIdentificacionComprador: "05",
    razonSocialComprador: "CLIENTE PRUEBA",
    identificacionComprador: "1234567890",
    totalSinImpuestos: 100.0,
    totalDescuento: 0.0,
    totalConImpuestos: [{ codigo: "2", codigoPorcentaje: "10", baseImponible: 100.0, tarifa: 15, valor: 15.0 }],
    importeTotal: 115.0,
    pagos: [{ formaPago: "20", total: 115.0, referencia: REFERENCIA_SECRETA, metodoPago: "DeUna" }],
    detalles: [
      {
        descripcion: "SERVICIO DE PRUEBA",
        cantidad: 1,
        precioUnitario: 100.0,
        descuento: 0.0,
        precioTotalSinImpuesto: 100.0,
        impuestos: [{ codigo: "2", codigoPorcentaje: "10", tarifa: 15, baseImponible: 100.0, valor: 15.0 }],
      },
    ],
    // A propósito, SIN infoAdicional en el fixture — esta prueba solo mira
    // el nodo <pago>. El campoAdicional se prueba aparte en (a)/(c)/(d)/(e).
  };

  const xml = construirFacturaXml(fixture);
  const bloquesPago = xml.match(/<pago>[\s\S]*?<\/pago>/g) ?? [];
  assert(bloquesPago.length === 1, "(b) el XML tiene exactamente un nodo <pago>");
  assert(!xml.includes(REFERENCIA_SECRETA), "(b) el número de referencia NO aparece en ningún lugar del XML (no hay infoAdicional en este fixture)");
  assert(
    bloquesPago[0] === "<pago><formaPago>20</formaPago><total>115.00</total></pago>",
    "(b) el nodo <pago> tiene EXACTAMENTE formaPago y total — ni un campo más, el XSD sigue cerrado"
  );
}

// ═══ (c) — 20 referencias → máximo 15 campos, ninguna se pierde ══════════════
{
  const pagos: Pago[] = Array.from({ length: 20 }, (_, i) => ({
    formaPago: "20",
    total: 1,
    metodoPago: "Transferencia",
    referencia: `REF-${String(i + 1).padStart(3, "0")}`,
  }));

  const infoAdicional = construirInfoAdicionalFactura("Alexis Bolaños", undefined, pagos);
  assert(infoAdicional.length <= 15, `(c) con 20 referencias, el infoAdicional final tiene ≤15 campos (tiene ${infoAdicional.length})`);
  assert(infoAdicional[0].nombre === "Vendedor", "(c) 'Vendedor' sigue siendo el primer campo");

  const textoCompleto = infoAdicional.map((c) => `${c.nombre}:${c.valor}`).join("|");
  const faltantes = pagos.filter((p) => !textoCompleto.includes(p.referencia!));
  assert(faltantes.length === 0, `(c) ninguna de las 20 referencias se pierde (faltan: ${faltantes.map((f) => f.referencia).join(", ")})`);

  const campoMerge = infoAdicional.find((c) => c.nombre === "Otras referencias de pago");
  assert(!!campoMerge, "(c) el excedente se juntó en el campo 'Otras referencias de pago'");
  if (campoMerge) {
    assert(campoMerge.valor.includes(" · "), "(c) las referencias juntadas van separadas por ' · '");
  }
}

// Al límite exacto (14 referencias con Vendedor, o 15 sin Vendedor): no debe fusionar de más.
{
  const pagos14: Pago[] = Array.from({ length: 14 }, (_, i) => ({
    formaPago: "20", total: 1, metodoPago: "PayPal", referencia: `PP-${i + 1}`,
  }));
  const infoAdicional = construirInfoAdicionalFactura("Alexis Bolaños", undefined, pagos14);
  assert(infoAdicional.length === 15, "(c) exactamente 14 referencias + Vendedor = 15 campos, sin fusionar");
  assert(!infoAdicional.some((c) => c.nombre === "Otras referencias de pago"), "(c) al límite exacto no aparece el campo de fusión");
}

// ═══ (d) — Un valor de 400 caracteres queda recortado a 300 ══════════════════
{
  const valorLargo = "X".repeat(400);
  const pagos: Pago[] = [{ formaPago: "20", total: 10, referencia: valorLargo }];
  const campos = construirCamposReferenciaPago(pagos, 14);
  assert(campos.length === 1, "(d) un solo pago → un solo campo");
  assert(campos[0].valor.length === 300, `(d) el valor de 400 chars quedó recortado a 300 (quedó en ${campos[0].valor.length})`);
  assert(campos[0].valor === valorLargo.slice(0, 300), "(d) el recorte conserva los primeros 300 caracteres, no otros");
}

// ═══ (e) — Un valor con salto de línea sale sin salto de línea ═══════════════
{
  const conSaltos = "ABC\n123\r\nXYZ";
  const pagos: Pago[] = [{ formaPago: "20", total: 10, referencia: conSaltos }];
  const campos = construirCamposReferenciaPago(pagos, 14);
  assert(!campos[0].valor.includes("\n"), "(e) el valor final no tiene '\\n'");
  assert(!campos[0].valor.includes("\r"), "(e) el valor final no tiene '\\r'");
  assert(campos[0].valor === "ABC 123 XYZ", "(e) cada salto de línea (incluido CRLF) se reemplazó por un solo espacio");
}

// Mismo guard sobre el nombre (defensivo — un metodoPago con salto de línea
// no debería ocurrir hoy, el catálogo de types/abonos.ts es limpio, pero el
// campo nombre del XSD tiene la misma regla que el valor).
{
  const pagos: Pago[] = [{ formaPago: "20", total: 10, metodoPago: "De\nUna", referencia: "REF-1" }];
  const campos = construirCamposReferenciaPago(pagos, 14);
  assert(!campos[0].nombre.includes("\n"), "(e) el nombre tampoco lleva saltos de línea, aunque metodoPago viniera sucio");
}

// ═══ (f) — Sin referencias: infoAdicional EXACTAMENTE igual que antes ════════
// No-regresión: antes de esta fase, infoAdicionalFinal en emitirFactura.ts
// era `[Vendedor?, ...datos.infoAdicional]` — nada más. Se verificó
// manualmente que esta prueba FALLA si se rompe la inyección (se comentó
// la línea de "Vendedor" dentro de construirInfoAdicionalFactura(), la
// prueba falló, y se restauró sin diff).
{
  const pagosSinReferencia: Pago[] = [{ formaPago: "01", total: 50 }];

  const soloVendedor = construirInfoAdicionalFactura("Alexis Bolaños", undefined, pagosSinReferencia);
  assert(soloVendedor.length === 1, "(f) sin referencias: infoAdicional tiene exactamente 1 campo");
  assert(
    soloVendedor[0].nombre === "Vendedor" && soloVendedor[0].valor === "Alexis Bolaños",
    "(f) ese único campo es 'Vendedor', igual que antes de esta fase"
  );

  const conExtra = construirInfoAdicionalFactura("Alexis Bolaños", [{ nombre: "email", valor: "a@b.com" }], pagosSinReferencia);
  assert(conExtra.length === 2, "(f) con infoAdicional extra: Vendedor + ese campo, nada más (comportamiento previo intacto)");
  assert(conExtra[1].nombre === "email", "(f) el infoAdicional extra se conserva tal cual");

  const sinVendedor = construirInfoAdicionalFactura(undefined, undefined, pagosSinReferencia);
  assert(sinVendedor.length === 0, "(f) sin vendedor, sin extra, sin referencias: infoAdicional vacío — igual que antes");

  const vendedorVacio = construirInfoAdicionalFactura("   ", undefined, pagosSinReferencia);
  assert(vendedorVacio.length === 0, "(f) vendedor solo con espacios se trata como ausente, igual que el `.trim()` original");
}

// ─── Bonus: mensajeReferenciaPagoFaltante() (Paso 4 — validación compartida) ──
{
  assert(
    mensajeReferenciaPagoFaltante([{ formaPago: "20", total: 10 }]) !== null,
    "código 20 sin referencia → mensaje de error"
  );
  assert(
    mensajeReferenciaPagoFaltante([{ formaPago: "20", total: 10, referencia: "  " }]) !== null,
    "código 20 con referencia solo espacios → sigue faltando"
  );
  assert(
    mensajeReferenciaPagoFaltante([{ formaPago: "20", total: 10, referencia: "ABC" }]) === null,
    "código 20 con referencia real → sin error"
  );
  assert(
    mensajeReferenciaPagoFaltante([{ formaPago: "01", total: 10 }]) === null,
    "código distinto de 20 (Efectivo) sin referencia → sin error, sigue opcional"
  );
  assert(CODIGO_SRI_REQUIERE_REFERENCIA === "20", "la constante exportada coincide con el código SRI real");
}

// ═══ Reemplazo con nota de crédito — la diferencia en código 20 ═════════════
// FacturacionForm.tsx arma pagosReemplazo como [compensación (15), diferencia
// (código elegido)] — mismo shape reproducido aquí. Cliente y servidor
// validan con la MISMA función (mensajeReferenciaPagoFaltante), así que
// probarla contra este shape cubre los dos lados sin necesitar un arnés de
// pruebas de React (no existe uno en este proyecto).
{
  const pagosReemplazoSinReferencia = [
    { formaPago: "15", total: 40 }, // compensación: crédito de la NC, nunca exige referencia
    { formaPago: "20", total: 10 }, // diferencia por transferencia, SIN número
  ];
  const error = mensajeReferenciaPagoFaltante(pagosReemplazoSinReferencia);
  assert(error !== null, "reemplazo NC: diferencia en código 20 sin referencia → se rechaza (mismo mensaje en cliente y servidor)");

  const pagosReemplazoConReferencia = [
    { formaPago: "15", total: 40 },
    { formaPago: "20", total: 10, referencia: "TRF-REEMPLAZO-001" },
  ];
  assert(
    mensajeReferenciaPagoFaltante(pagosReemplazoConReferencia) === null,
    "reemplazo NC: diferencia en código 20 CON referencia → pasa"
  );

  // Con referencia, también genera su campoAdicional — igual que cualquier
  // otro pago. La diferencia de un reemplazo nunca trae metodoPago (no viene
  // de un abono), así que cae en "Ref. pago N", no en un nombre de método.
  const campos = construirCamposReferenciaPago(pagosReemplazoConReferencia as Pago[], 14);
  assert(campos.length === 1, "reemplazo NC: la compensación (15) no genera campo — solo la diferencia con referencia");
  assert(campos[0].nombre === "Ref. pago 1", "reemplazo NC: sin metodoPago, se nombra 'Ref. pago 1'");
  assert(campos[0].valor === "TRF-REEMPLAZO-001", "reemplazo NC: con el número correcto");
}

if (fallos > 0) {
  console.error(`\n❌ referenciaPago.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ referenciaPago.test.ts — todos los asserts pasaron");
