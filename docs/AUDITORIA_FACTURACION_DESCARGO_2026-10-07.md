# Auditoría — descargo de inventario en facturas y recibos (2026-10-07)

Detonante: factura **001-002-000000755** (JOSE MALDONADO, $260, 05/10/2026).
Autorizada por el SRI, RIDE correcto, pero el modal mostraba
"Detalle de ítems no disponible" y no se descargaron DES-000007 ni MON-000003.

## Causa raíz

1. `emitirFactura()` guarda la fila como **RECIBIDA** antes de esperar la
   autorización (paso 5.5), pero **sin "Líneas JSON"**. Las líneas (con el
   record id de cada Shipping Item, el origen y los pagos) solo se escribían en
   `persistirAutorizado()`, al final, si la autorización llegaba dentro de la
   misma petición.
2. Si el SRI tardaba más de 60 s (o la función se cortaba antes de terminar),
   la emisión devolvía **EN PROCESAMIENTO** y el endpoint no corría
   `postEmision()` (inventario), ni el puente de Finanzas, ni el cierre de
   reserva, ni el correo.
3. Al pulsar **⟳ Consultar estado**, `recuperarFacturaAutorizadaPorClave()`
   solo cambiaba el estado a AUTORIZADO y subía XML + RIDE. **No hacía nada
   más.** Además, el XML del SRI lleva el SKU pero no el record id del
   artículo: sin las líneas guardadas ya no había forma automática de saber qué
   descontar.
4. Nada lo delataba: la factura quedaba con "Sincronización Inventario" = N/A,
   que la pantalla trata como "venta sin artículos".

## Alcance (84 facturas de producción y 55 recibos revisados)

| Factura | Fecha | Cliente | Artículos | Estado previo |
|---|---|---|---|---|
| 001-002-000000723 | 14/09 | Carlos Matango | DES-000012 | sin descargo, sin líneas |
| 001-002-000000746 | 30/09 | Joselin Gómez | ACC-000193 (OP-2026-000095) | sin descargo, sin vínculo a la operación |
| 001-002-000000748 | 30/09 | Ramiro Díaz | OTR-000006 | sin descargo |
| 001-002-000000753 | 05/10 | Kelvin Baidal | OTR-000023 | sin descargo |
| 001-002-000000755 | 05/10 | Jose Maldonado | DES-000007, MON-000003 | sin descargo |
| 001-002-000000756 | 06/10 | Andres Ruiz | LAP-000064, ACC-000121 | sin descargo |

Las 6 tampoco tienen ingreso en Finanzas ni "Estado Correo" (no se envió el RIDE
por correo). La 707 tiene el mismo patrón pero está ANULADA (no requiere
descargo). Los 55 recibos están OK.

Otros hallazgos:
- 001-002-000000674 (primera de producción, Cable HDMI OTR-000174): anterior al
  descargo de mostrador; el artículo no tiene vínculo a esa factura. Revisar
  conteo físico.
- Líneas manuales sin vínculo a inventario (no descargan por diseño): 686
  Adaptador DP-HDMI, 692 Disco ADATA 240GB, 702 Cargador MagSafe, 683
  PRODDIG-1, REC-000024 Cargador HP 45W.
- `/sincronizar` rechazaba facturas de mostrador y forzaba `liberaReserva`.
- "↺ Reintentar al SRI" admitía RECIBIDA y emitía con número NUEVO (doble
  factura real). Además no descargaba inventario tras un reintento exitoso.

## Corrección en código

- `reglas/lineasFactura.ts` (nuevo, puro): serializa/lee las líneas y decide
  qué falta (`planificarCompletarFactura`).
- `emitirFactura.ts`: las líneas se arman antes del SRI y se guardan ya en la
  fila RECIBIDA (incluye `clienteRecordId`).
- `gancho/efectosPostAutorizacion.ts` (nuevo): un solo punto de entrada para
  lo que pasa tras autorizar. `ejecutarEfectosPostAutorizacion()` (emitir,
  reintentar) y `completarFacturaAutorizada()` (consultar estado, recuperar,
  sincronizar), idempotente.
- `consultar-estado` y `recuperar`: completan la factura al autorizarse.
- `recuperar.ts`: rellena líneas desde el XML (marcadas `fuente: "xml-sri"`)
  solo si faltan; esas líneas nunca se marcan OK en silencio.
- `sincronizar`: acepta mostrador; usa la función común.
- `reintentar`: ya no admite RECIBIDA; corre los mismos efectos que emitir.
- `corregir`: también corría solo el puente contable (sin descargo); ahora usa
  los mismos efectos. Además reenviaba todo como efectivo ("01") si la pantalla
  no mandaba pagos: ahora reutiliza los pagos guardados si cuadran con el total.
- Carrera evitada: las líneas guardan `preparadaEn`; durante 100 s (más que el
  maxDuration de 90 s) ningún otro camino descarga, para no descontar dos veces
  en paralelo con la propia emisión (plan `en-curso`).
- `sri/cola.ts`: un fallo de red/timeout/502-504 en una consulta ya no corta la
  espera de autorización; se reintenta dentro del mismo presupuesto (cada
  consulta acotada a lo que queda). Las 6 facturas se autorizaron en el SRI en
  el mismo segundo de la recepción, así que lo más probable es que la espera
  se cortara por un fallo transitorio de la consulta.
- Historial: una AUTORIZADA de producción con N/A se muestra como
  "Descargo de inventario sin procesar" con su botón.
- Tests: `factura755.efectosTrasAutorizacionTardia.test.ts`,
  `cola.reintentaFalloRed.test.ts`.

## Regularización de datos (2026-10-07)

Shipping Items descargados a mano siguiendo la misma regla que `postEmision`
(Cantidad, link Factura, Vendido + no disponible al llegar a 0, reserva
liberada en la de operación): DES-000007, MON-000003, LAP-000064, ACC-000121
(12→11), OTR-000023, OTR-000006, ACC-000193, DES-000012.

Facturas completadas (Líneas JSON reconstruidas desde el RIDE, verificadas
contra Subtotal/IVA de cada registro; Sincronización Inventario = OK; vínculo a
Cliente; nota [AUDITORIA] en Mensajes SRI). 746 vinculada a OP-2026-000095.

Finanzas: movimientos de ingreso "Venta Mostrador" creados con la misma forma
que el puente (fecha = fecha de autorización): MOV-20261008-10755 ($260,
efectivo, Caja Registradora), -10756 ($400), -10753 ($35), -10748 ($65),
-10723 ($370) — forma de pago 20 sin cuenta destino, igual que el puente.
746: no se creó ingreso; su abono MOV-20260930-14236 ($45) quedó marcado como
facturado (Factura Electrónica + "Pendiente de clasificar"), como hace el puente.

Pendiente: 674 (conteo físico de cables HDMI) y reenvío de correos (Alex).
