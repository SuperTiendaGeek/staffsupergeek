// PayPhone (pago con tarjeta desde el enlace del cliente) — CABLES TENDIDOS,
// sin activar (dueño, 12-nov-2026: "deja tendido los cables para luego").
//
// Hoy: el enlace muestra el botón "Pagar con tarjeta · PayPhone" apagado
// ("Pronto") mientras payphoneActivo() sea false.
//
// Para activarlo (cuando se construya la integración):
//   1. Variables: PAYPHONE_ACTIVO=1, PAYPHONE_TOKEN, PAYPHONE_STORE_ID.
//   2. Ruta pública POST /api/publico/pedido/[token]/tarjeta → crea el cobro
//      en PayPhone por `pago.faltaParaConfirmar` y devuelve su URL.
//   3. Retorno/confirmación de PayPhone → el SERVIDOR verifica la transacción
//      con PayPhone (nunca se confía en lo que diga el navegador) y registra
//      un abono con un método de cobro "Tarjeta (PayPhone)" en
//      lib/cobros/metodos.ts (con su cuenta de Finanzas), igual que cualquier
//      otro abono.
//   4. Después del abono se llama a confirmarPedidoSiPagado() de
//      lib/pedidos-especiales/enlace.ts: la MISMA puerta que usa el abono
//      registrado por el empleado. Si cubre lo que pide la regla de tramos, el
//      pedido pasa a "Aceptado" solo.

export function payphoneActivo(): boolean {
  return process.env.PAYPHONE_ACTIVO === "1"
    && !!process.env.PAYPHONE_TOKEN?.trim()
    && !!process.env.PAYPHONE_STORE_ID?.trim();
}
