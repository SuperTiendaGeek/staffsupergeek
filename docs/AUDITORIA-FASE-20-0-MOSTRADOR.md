# Mini-auditoría 20.0 — Venta de mostrador, formas de pago y costos por línea

> Fecha: 2026-07-11 — **SOLO LECTURA**. No se modificó, creó ni borró ningún registro, campo, tabla ni línea de código. No hay commits asociados. Continuación directa de `docs/AUDITORIA-FASE-20.md` — cierra sus puntos "NO VERIFICADO" y agrega insumos para el sistema contable de rubros (Capital/Utilidad/IVA/Repuesto Proveedor Externo).
> Método: lectura de código, lectura de esquema (Metadata API, solo lectura), lectura de datos reales (REST API, solo `GET`, siempre vía RECORD_ID()/fetch por ids, nunca filtro por campo link), y dos agentes de exploración en paralelo sobre el código, más consultas de datos en vivo hechas directamente para esta síntesis.

---

## PARTE 1 — Flujo completo de la venta de mostrador

### 1.1 Dónde empieza y qué captura

El empleado entra directo a `/facturacion` (`app/facturacion/page.tsx:8-22`, renderiza `FacturacionForm`). **Sin ningún querystring `?origen=`/`?recordId=`, el formulario arranca en modo mostrador puro** — no requiere ninguna Orden/Operación previa. Solo cuando la URL trae esos parámetros el formulario se precarga desde el "gancho" de Fase 16 (`components/facturacion/FacturacionForm.tsx:520-605`, vía `/api/facturacion/prefactura`) — ese camino es el de Orden/Operación con abonos, no el de mostrador.

Datos que captura en modo mostrador (`FacturacionForm.tsx:868-1095`):
- **Cliente**: Consumidor Final (fijo, identificación `9999999999999`), buscar cliente existente, o crear cliente nuevo.
- **Líneas**: buscador de inventario (`/api/facturacion/productos?q=`) o "+ Agregar línea manual" (texto 100% libre) — cada línea: `codigoPrincipal`, `descripcion`, `unidadMedida`, `cantidad`, `precioUnitario`, `descuento`, `tarifaIva`.
- **Forma de pago**: un único `<select>` por el 100% del total (nunca mixto — ver 1.2).
- Toggle "Precios incluyen IVA".

### 1.2 Cadena completa UI → SRI → Airtable

1. `handleEmitir()` (`FacturacionForm.tsx:660-805`) → `POST /api/facturacion/emitir`.
2. `app/api/facturacion/emitir/route.ts:12-82` → valida sesión y payload, llama `emitirFactura()`.
3. `lib/facturacion/emitirFactura.ts:106-405`: valida límite de Consumidor Final, valida que los pagos cuadren con el total, obtiene el siguiente secuencial, construye y valida el XML (`construirFacturaXml.ts:198-314`), lo firma (XAdES-BES), lo envía al SRI (`sri/recepcion.ts`), espera autorización (`sri/cola.ts`), genera el RIDE (best-effort), persiste XML+PDF en disco (retención legal) y crea el registro en `Facturas Electrónicas` (`airtable/facturas.ts:239-286`), y envía el correo (best-effort).
4. `app/api/facturacion/emitir/route.ts:63-69`: dispara `postEmision()` **solo si `resultado.estado==="AUTORIZADO" && body.origen && resultado.recordId`** — en mostrador `body.origen` es siempre `undefined`, así que este paso **nunca corre**.
5. La UI muestra el resultado con un enlace de descarga al RIDE PDF. **No existe ningún ticket de punto de venta**: grep exhaustivo de "ticket"/"imprimir"/"window.print"/"react-to-print" en todo el repo solo encuentra impresión de etiquetas SKU (shipping-v2), órdenes de reparación (`AutoPrint.tsx`, técnicos) y cotizaciones — ninguno vinculado a facturación. El único comprobante imprimible de una venta de mostrador es el RIDE PDF.

### 1.3 Formas de pago

Catálogo real en la UI (`FacturacionForm.tsx:21-30`) = catálogo oficial SRI completo vigente (Tabla 22): `01` Efectivo, `15` Compensación de deudas, `16` Tarjeta de débito, `17` Dinero electrónico, `18` Tarjeta prepago, `19` Tarjeta de crédito, `20` Otros (sist. financiero), `21` Endoso de títulos. No hay ningún código inventado ni faltante frente al catálogo SRI vigente.

**En mostrador solo se puede elegir UNA forma de pago por el 100% del total — nunca pago mixto.** El editor de pagos múltiples (`FormasPagoEditor`, `FacturacionForm.tsx:1323-1409`) **solo se monta cuando `pagosPrecargados !== null`**, y eso solo ocurre en el flujo con `origen` (Orden/Operación, vía gancho) — en mostrador `pagosPrecargados` es siempre `null`. **Hoy es técnicamente imposible cobrar mitad efectivo + mitad tarjeta en una sola factura de mostrador.**

DataFast y PayPhone no tienen código de forma de pago SRI propio — son procesadores privados, se mapean genéricamente a `"20"` en el mapeo del gancho (`lib/facturacion/gancho/config.ts:51-59`, con advertencia explícita en el propio código: *"procesador privado, no el dinero electrónico del BCE"*) — pero ese mapeo pertenece al gancho (traduce `Método de Pago` de la tabla `Abonos`), **mostrador no lo usa porque nunca lee la tabla Abonos.**

**Se pierde al guardar, no en el XML.** El XML sí serializa el array completo de pagos (`construirFacturaXml.ts:108-117,269-273`) — nunca se trunca ahí. Pero lo que Airtable guarda en `Líneas JSON` es solo `formaPago: datos.pagos[0]?.formaPago` (`emitirFactura.ts:339-345`) — el código del primer (en mostrador, único) pago, sin monto ni ningún otro dato estructurado y consultable vía fórmula de Airtable. El desglose completo únicamente sobrevive dentro de los archivos binarios `XML Autorizado`/`RIDE PDF` adjuntos.

**Hallazgo adicional — el reintento de una factura `DEVUELTA` pierde la forma de pago original:** `app/api/facturacion/historial/[recordId]/reintentar/route.ts:86` hardcodea `pagos: [{ formaPago: "01", total: importeTotal }]` al reconstruir la venta — sin importar qué eligió el empleado la primera vez, el reintento siempre queda registrado como `"01"` (Efectivo).

### 1.4 ¿Dónde queda registrado el COBRO? (el punto NO VERIFICADO de la auditoría anterior)

**Confirmado con evidencia de código directa: el único rastro del dinero, en una venta de mostrador, es el propio registro de Factura Electrónica (`Subtotal`/`IVA`/`Total`). No se escribe nada en `Abonos` ni en ninguna otra tabla de dinero.**

- Grep exhaustivo de `crearAbono`/tabla `Abonos` dentro de `lib/facturacion/` y `app/api/facturacion/` → cero llamadas de escritura. Las únicas menciones de "Abonos" son del mapeo de método de pago del gancho, que nunca corre en mostrador.
- El propio encabezado de `emitirFactura.ts:3-9` lo declara: *"este flujo es de SOLO EMISIÓN al SRI. No modifica ningún campo de 'Shipping Items' ni ninguna otra tabla de inventario"* — y, verificado por ausencia total de código, tampoco toca ninguna tabla financiera.
- No existe ni siquiera un checkbox "cobrado: sí/no" en el formulario ni en el esquema de `Facturas Electrónicas`.

**Esto ya no es hipótesis — queda cerrado el punto NO VERIFICADO de la auditoría anterior:** si un empleado cobra efectivo en mano al facturar de mostrador, ese cobro no queda registrado en ningún libro de caja/banco del portal; solo existe el `Total` de la factura, que documenta la venta pero no certifica que se cobró.

### 1.5 Estructura de líneas — texto libre, sin ID rastreable

El buscador de inventario sí trae productos reales de `Shipping Items` (`lib/facturacion/airtable/productos.ts:63-103`, con record id real), **pero al agregar la línea ese id nunca se guarda** — solo se usa como texto de respaldo: `codigoPrincipal: p.sku || p.id` (`FacturacionForm.tsx:438`). El campo `tipo` (`"producto"|"servicio"`) y `shippingItemId` **solo se pueblan cuando la línea viene precargada del gancho** (Orden/Operación) — nunca en mostrador ni en líneas manuales. Comentario explícito en el propio código: *"'marcar inventario de mostrador' queda fuera de esta fase"*.

**Verificado con datos reales** (18 de 40 facturas tienen `Líneas JSON` parseable, 23 líneas de producto/servicio en total): de esas 23 líneas, **solo 1 contiene algún valor con forma de record id de Airtable** (`rec...`) — el resto son `codigoPrincipal` de texto libre que *parecen* SKU reales (ej. `LAP-000013`, `DES-000001`, `REP-000010`, `OTR-000001` — mismo formato que el campo `SKU` real de Shipping Items) o códigos de servicio ad-hoc (`SRV-1`, `SRV-2`) o completamente libres (`TEST-PASO3`). **Confirmado cruzando contra los 54 Shipping Items reales: 0 de ellos tiene el campo `Factura` poblado** — es decir, ni un solo Shipping Item real está hoy enlazado a ninguna de las 40 facturas, pese a que varias líneas de esas facturas parecen (por el código de texto) referirse a items reales del inventario.

### 1.6 Descuento de inventario al facturar

**En mostrador, el inventario nunca se descuenta, bajo ningún estado de la factura.** `postEmision()` (`lib/facturacion/gancho/postEmision.ts:88-158`, la única función que marca `"Estado Item":"Vendido"` en Shipping Items) requiere `tipo==="producto" && shippingItemId` por línea — que, como se vio en 1.5, nunca están presentes en mostrador — y además solo se dispara si `body.origen` existe (1.2), lo cual mostrador nunca cumple. El campo `Sincronización Inventario` se crea siempre en `"N/A"` para mostrador y se queda ahí permanentemente (confirmado también en datos: de 40 facturas, 0 tienen `Sincronización Inventario` distinto de su valor inicial fuera del flujo con origen). Un producto de inventario facturado desde mostrador sigue "disponible" para venderse de nuevo desde otra factura, sin ningún control ni alerta.

### 1.7 Anulaciones y errores en la práctica

`ANULADA` nunca se asigna (confirmado en la auditoría anterior, no reproducido aquí). Para los estados que sí ocurren:

| Estado | ¿Reintentar al SRI? | ¿Editar/reabrir? | ¿Eliminar? |
|---|---|---|---|
| `BORRADOR` | No aplica (nunca llegó al SRI) | Sí, recarga el formulario completo | **Sí — único estado eliminable** (`DELETE /api/facturacion/historial/[id]`, guard explícito: solo si `estado === "BORRADOR"`) |
| `PENDIENTE`/`RECIBIDA`/`DEVUELTA` | Sí (`ESTADOS_REINTENTABLES`) | No | No |
| `NO AUTORIZADO` | **No — bloqueado tanto en UI como en el endpoint** (no está en `ESTADOS_REINTENTABLES`) | No | No |
| `AUTORIZADO` | No aplica | No | No (solo reenviar correo) |

**`NO AUTORIZADO` es un callejón sin salida en la UI de hoy**: el secuencial ya se consumió, no hay botón de reintento ni de copiar a una factura nueva — el empleado solo puede ver el detalle y empezar de cero manualmente.

---

## PARTE 2 — ¿Las líneas vendidas conocen su costo?

| Tipo | Veredicto (con datos reales verificados hoy) |
|---|---|
| **Item de inventario (Shipping Items)** | El campo de costo existe y está bien poblado (`Costo total unidad`, formula = `Costo proveedor` + costos asignados de flete/arancel/logística/despiece): **51 de 54 items reales (94.4%) lo tienen poblado**. Pero **0 de los 54 items están hoy vinculados a ninguna factura** (campo inverso `Factura` vacío en el 100%), y el código de facturación de mostrador **nunca lee ni guarda el `shippingItemId`** de la línea (Parte 1.5) — así que aunque el dato de costo existe y es confiable, hoy **no hay ningún camino de código que lo conecte con una venta facturada**. |
| **Repuesto en orden de reparación** | `Repuestos por Orden.Costo proveedor real`: **20 de 60 registros reales (33.3%) lo tienen poblado**, suma $968.99 sobre los que sí lo tienen. Los 60 registros fueron creados en bloque el 2026-06-28 (migración), no hay entradas nuevas desde entonces en los datos muestreados. **67% de los repuestos históricos no tienen costo capturado** — la distribución automática de Capital para este tipo, aun si se conectara a facturación, fallaría para 2 de cada 3 repuestos. |
| **Producto digital / licencia** | `Productos Digitales.Costo Proveedor`: **15 de 33 registros reales (45.5%) lo tienen poblado**, suma $246.43. Rango de creación 2026-06-28 → 2026-07-10 (a diferencia de Repuestos, aquí sí hay altas recientes, no solo el lote migrado). |
| **Servicio / mano de obra** | **No existe ningún campo de costo real — el campo que "suena" a costo está mal nombrado y en realidad es precio.** `Catálogo Servicios.Costo sugerido` y `Servicios por Orden.Costo real` son, verificado con datos y con la fórmula de Airtable que los consume (`Resumen Servicios Precio` = nombre & "$" & Costo real), **el precio cobrado al cliente**, no un costo de mano de obra o insumos — confirmado también en el propio código de facturación: comentario explícito *"servicio.costo también es precio final CON IVA incluido"* (`lib/facturacion/gancho/construccion.ts:57`). Dato real: 207 de 209 registros de `Servicios por Orden` tienen ese campo "Costo real" poblado, con valores como $10, $25, $35 — precios de venta típicos, no costos. **Los servicios son, en la práctica (no por diseño explícito), 100% Utilidad — porque no existe ningún dato de costo real capturado en ningún lado**, ni de mano de obra ni de insumos usados. |
| **Venta libre / línea manual** | Existe y es, de hecho, **el caso dominante hoy**: en mostrador, el 100% de las líneas son de este tipo (sin `shippingItemId` ni `tipo`, Parte 1.5). De las 23 líneas reales encontradas en las 18 facturas de prueba con `Líneas JSON` parseable, aproximadamente 4 (`SRV-1`, `SRV-2` repetidos, `TEST-PASO3`) son claramente manuales/de prueba sin ningún patrón de SKU reconocible, y el resto usa códigos con formato de SKU real pero sin ningún vínculo estructural verificable — no hay forma de saber su costo salvo revisión manual caso por caso. |

**Conclusión de la Parte 2:** hoy, ningún tipo de venta puede distribuirse automáticamente en Capital/Utilidad con los datos y el código actuales — no porque el dato de costo no exista nunca (Shipping Items sí lo tiene, bien poblado), sino porque **no hay ningún vínculo de código entre una línea de factura y el registro de costo real** (mostrador no guarda `shippingItemId`; el gancho sí lo guarda pero solo lee precio de venta, nunca costo — Parte 4 de la auditoría anterior ya lo había insinuado y esta mini-auditoría lo confirma con la cita exacta: `fetchDetalleItems()` en `lib/facturacion/gancho/airtableGancho.ts:96-109` solo trae `sku`/`reservado`/`tieneFacturaPrevia`/`tarifaIva`, nunca costo).

---

## PARTE 3 — Reservas y el ciclo anticipo → factura

### 3.1 ¿Existe el concepto de "reserva"?

**No, como concepto de negocio explícito.** Las únicas apariciones de "reserva"/"reservado" en el código son de **inventario físico** (`Shipping Item.Reservado`, checkbox que marca un item como apartado para una orden — estado de stock, no de compromiso de compra con abono) y de productos digitales, sin relación con Operaciones/Abonos.

**Cómo se logra en la práctica hoy:** una Operación Comercial nace en `"Requerimiento"` (el primer estado del flujo `Requerimiento → Cotizado → Aprobado → Pedido → Entregado`). `crearAbono()` (`lib/operaciones/airtable.ts:388-410`, vía `POST /api/operaciones/[id]/abonos`) **no valida en ningún punto el `Estado` de la Operación** — solo exige monto > 0, método y fecha. **Es decir, hoy sí se puede registrar un abono sobre una Operación que todavía está en `"Requerimiento"` o `"Cotizado"`**, antes de que exista una venta formal/aprobada — eso es, en la práctica, la "reserva". No hay ningún control de negocio que la distinga de un abono normal, ni se re-etiqueta si el estado de la Operación cambia después.

### 3.2 El gancho de Fase 16: qué viaja de los Abonos a la Factura, y qué rastro queda

Trazado completo (`lib/facturacion/gancho/traductor.ts`, `construccion.ts`, `postEmision.ts`, `idempotencia.ts`):

1. Idempotencia: lee el inverso `"Facturas Electrónicas"` de la Orden/Operación; si hay una factura en estado distinto de `BORRADOR`/`ANULADA`, bloquea.
2. `getCuentaUnificada()` trae `cuenta.abonos` (con `id` = record id real del Abono, monto, método, fecha, estado).
3. `calcularFormasPago()` filtra abonos `!= "Anulado"` y arma, por cada uno, un `Pago{formaPago, total, origenPago:"abono", fechaAbono}` — **el record id del Abono se descarta explícitamente aquí**: la firma de la función usa `Pick<CuentaUnificadaAbono, "metodoPago"|"monto"> & {fecha}`, sin `id` ni `idAbono`. Si la suma de abonos < total, agrega una línea `Pago{formaPago:"01", origenPago:"saldo"}` por el remanente.
4. Al persistir (`emitirFactura.ts:339-345`), `Líneas JSON` guarda `formaPago: datos.pagos[0]?.formaPago` — **solo el código del primer pago**, sin array completo ni IDs de abono.

**Hallazgo directo, verificado en datos reales — matiz importante que la auditoría anterior no había detectado:** el objeto guardado en `Líneas JSON` de un **borrador** (`Estado = "BORRADOR"`) sí conserva, en un campo separado `pagosPrecargados`, el desglose completo con `origenPago` ("abono"/"saldo") y `fechaAbono` — pero **esa información se pierde en el momento en que la factura pasa a `AUTORIZADO`**. Evidencia real: de las 18 facturas de prueba con `Líneas JSON` parseable, **las 4 que tienen `pagosPrecargados` son las 4 que están en `BORRADOR`; las 14 restantes, todas `AUTORIZADO`, no tienen ese campo**. Ejemplo concreto: factura `rec4hHmg6qrRC0ubg` (BORRADOR, orden OR000234 / `recYhi7aObJEnSaEt`) tiene `"pagosPrecargados":[{"formaPago":"01","total":10,"origenPago":"abono","fechaAbono":"2026-07-10T11:29:00.000Z"},{"formaPago":"01","total":30,"origenPago":"saldo"}]` — ese monto y fecha coinciden exactamente con el abono real `rechSFOJ9oF7Uk4sL` ($10, 2026-07-10T11:29:06, aplicado a esa misma orden). **Es decir: mientras la factura es borrador, sí hay suficiente información en Airtable para reconstruir qué abono la cubrió — pero el propio acto de autorizar la factura ante el SRI descarta esa información** (el código de emisión final solo guarda `formaPago` del primer pago, sin `pagosPrecargados`). Cualquier reconciliación abono↔factura automática debería capturar ese dato en el momento del `BORRADOR`, antes de que se pierda al autorizar.

**¿Qué le pasa al Abono después de facturar?** Nada — confirmado leyendo el código real de `postEmision.ts` (no solo el documento de diseño): esa función solo toca `Shipping Items` y el propio registro de la Factura; nunca importa ni referencia la tabla `Abonos`. El `Estado del Abono` queda `"Registrado"` para siempre, sin ninguna transición a "Facturado" ni similar.

### 3.3 IVA

**Tarifa vigente en el código: 15%** (`SERVICIO_IVA_DEFAULT`/`TARIFA_IVA_SRI["15%"]`, `lib/facturacion/gancho/config.ts:10,18-23`), consistente con los datos reales (líneas con `"tarifa":15,"codigoPorcentaje":"4"` verificadas directamente en `Líneas JSON`).

**Sí soporta tarifas mixtas — pero solo para productos, no para servicios.** El catálogo completo:
```
"15%"       → codigoPorcentaje "4", tarifa 15
"0%"        → codigoPorcentaje "2", tarifa 0
"Exento"    → codigoPorcentaje "1", tarifa 0
"No objeto" → codigoPorcentaje "0", tarifa 0
```
Los `Shipping Items` tienen su propio campo `"Tarifa IVA"` (una de esas 4 opciones); si no está seteado, se asume `15%` por defecto. **Los Servicios no tienen ningún campo de tarifa propio — siempre van a 15% fijo**, sin posibilidad de marcar un servicio como exento.

Fórmula exacta (`lib/facturacion/ivaIncluido.ts:22-32`): el IVA se calcula **como complemento por línea** (`valorIva = precioFinal − base`, no `base × tarifa/100` de forma independiente), para que `base + IVA` reconstruya el precio final exacto al centavo pese al redondeo acumulado — documentado explícitamente en el propio código. `Subtotal + IVA = Total` se cumple siempre por construcción; no hay descuento ni propina en el flujo del gancho (ambos hardcodeados en 0), aunque el tipo de datos sí los soporta si se editaran a mano en el formulario manual.

---

## PARTE 4 — Insumos de cuentas reales

### 4.1 Catálogo de formas de pago

El catálogo real usado por el código (UI y XML) es el catálogo oficial vigente del SRI (Tabla 22), completo, sin recortes ni inventos: `01` Efectivo, `15` Compensación de deudas, `16` Tarjeta de débito, `17` Dinero electrónico, `18` Tarjeta prepago, `19` Tarjeta de crédito, `20` Otros (sistema financiero), `21` Endoso de títulos. El XML no valida el código contra ninguna lista propia (confía en el XSD), pero en la práctica es exactamente este catálogo el que se usa, tanto en mostrador como en el mapeo del gancho desde `Método de Pago` de Abonos.

### 4.2 PayPhone, DataFast, comisiones, acreditación diferida — terreno construido vs. nuevo

| Concepto | ¿Existe hoy en código? |
|---|---|
| PayPhone | Solo como string de catálogo en formularios de Abonos/Cotizaciones (`types/cotizaciones.ts:81`, `RegistrarAbonoModal.tsx:12`, etc.) y en el mapeo genérico a código SRI `"20"` del gancho. **Sin ninguna integración de API/webhook real.** |
| DataFast | Solo un string en el catálogo de Cotizaciones (`types/cotizaciones.ts:82`). Nada más en todo el repo. |
| Comisión de tarjeta/pasarela | **0 resultados en todo el repo.** |
| Acreditación diferida | **0 resultados.** |
| Tránsito de dinero (tarjetas/PayPhone ~2 días) | **0 resultados** — la única palabra "tránsito" que existe en el código es de logística de envíos (paquetes en tránsito), sin relación con dinero. |

**Es terreno 100% nuevo.** No hay ningún cimiento parcial reutilizable para comisiones, acreditación diferida o integración real con pasarelas — solo etiquetas de texto sueltas en catálogos de otros módulos.

### 4.3 Cierre de caja / cuadre / arqueo

**No existe ningún concepto de cierre de caja, cuadre de efectivo o arqueo en el código actual.** Grep amplio de "cierre"/"cuadre"/"arqueo"/"caja" en todo `lib/` y `app/`:
- "cierre": solo aparece en contexto de logística de shipping (cierre de *packings* de envío).
- "cuadre": solo aparece en `lib/facturacion/ivaIncluido.ts` y sus tests, referido a que el cálculo aritmético de IVA "cuadre al centavo" (redondeo) — no a cuadre de caja.
- "arqueo": 0 resultados.
- "Caja" (fuera de esos dos casos): solo como valor de catálogo `singleSelect` en Cuenta origen/destino (ya documentado en la auditoría anterior) o como nombre de un tipo de contenedor físico en `shipping-v2/packings` — sin relación con dinero.

**La Fase 20.4 (cierre/cuadre) parte de cero.**

---

## Veredicto de distribución automática (Capital/Utilidad/IVA)

| Tipo de venta | ¿Distribución automática hoy? | Por qué |
|---|---|---|
| Producto de inventario (Shipping Item) facturado por el gancho (Orden/Operación) | **No** | El costo existe y está bien poblado (94.4%), pero el código de facturación solo lee precio de venta y `tarifaIva` — nunca costo. Necesitaría un cambio de código para leer `Costo total unidad` al construir la línea. |
| Producto de inventario facturado desde mostrador | **No, y peor** | Ni siquiera queda el link al item (`shippingItemId` nunca se guarda) — no hay forma de encontrar el costo ni con cambio de código menor; hace falta primero capturar el vínculo. |
| Repuesto en orden de reparación | **No** | Sin ningún camino de código hacia facturación (Repuestos no tiene tipo de línea propio), y aunque lo tuviera, solo 33.3% de los repuestos reales tienen costo capturado. |
| Producto digital / licencia | **No** | Mismo problema: sin camino a facturación, y solo 45.5% con costo capturado. |
| Servicio / mano de obra | **No — y no puede "arreglarse" leyendo mejor el dato, porque el dato de costo no existe** | El único campo con nombre de costo (`Costo real`/`Costo sugerido`) es en realidad precio de venta. Requiere captura manual nueva de costo real (insumos + mano de obra) que hoy no se registra en ningún lado. |
| Línea manual / texto libre (el caso dominante en mostrador hoy) | **No, por definición** | Sin ningún identificador vinculable a ningún catálogo de costo. Solo revisión manual caso por caso. |

**Ningún tipo de venta puede distribuirse en Capital/Utilidad de forma automática con el código y los datos de hoy.** Lo más cercano a "listo" es Shipping Items vía el gancho (dato de costo confiable, solo falta que el código lo lea); todo lo demás necesita también captura de datos nuevos, no solo código.

## Huecos de registro de cobro

1. **Toda venta de mostrador** — el único rastro del dinero cobrado es el `Total` de la Factura Electrónica; no hay ningún movimiento en Abonos ni en ninguna tabla financiera (Parte 1.4). Hoy 38 de 40 facturas de prueba son de este tipo (sin ningún link a Orden/Operación).
2. **El desglose de pago (incluida la relación con abonos específicos) se pierde al autorizar la factura** — existe mientras es `BORRADOR` (campo `pagosPrecargados`) y desaparece en `AUTORIZADO` (Parte 3.2). Cualquier reconciliación futura debe capturarse antes de ese punto.
3. **Reintentar una factura `DEVUELTA` sustituye la forma de pago real por `"01" Efectivo`**, sin importar qué se cobró originalmente (Parte 1.3).
4. **`NO AUTORIZADO` es un callejón sin salida** — el secuencial se consume, no hay reintento ni forma de recuperar los datos capturados salvo iniciar de cero (Parte 1.7).
5. Confirmado de la auditoría anterior, ahora con más detalle: nómina, recuperación de garantías de proveedor, compras locales de repuestos/licencias — ninguno tiene registro estructurado de cobro/pago con comprobante y método verificable.

## Resumen ejecutivo

Hoy, cuando un empleado factura una venta directamente en el mostrador (sin pasar por una Orden o Cotización previa), **el único lugar donde queda ese dinero es la propia factura** — no hay ningún registro de caja, ni de qué se cobró en efectivo o tarjeta de forma que se pueda sumar después; y en mostrador **solo se permite una forma de pago por factura completa**, nunca pagos mixtos.

**Ningún tipo de venta puede repartirse automáticamente hoy entre "lo que costó" y "lo que ganamos"**: el inventario sí tiene su costo bien registrado (94% de los productos), pero el sistema de facturación nunca lo lee, ni siquiera guarda qué producto exacto se vendió en cada línea de una venta de mostrador — solo el nombre escrito. Para repuestos y licencias falta capturar el costo en 2 de cada 3 casos. Y para los servicios (la mayoría del negocio hoy) **no existe ningún dato de costo real** — el campo que parece "costo" en realidad es el precio que se le cobra al cliente.

Hay un detalle técnico valioso: cuando una factura se guarda como borrador, sí queda suficiente información para saber qué abonos la cubrieron — pero esa información se pierde en el instante en que el SRI la autoriza.

PayPhone, DataFast, comisiones de tarjeta, dinero en tránsito y cierre de caja no tienen absolutamente nada construido hoy — es terreno enteramente nuevo para el sistema contable que se va a diseñar.
