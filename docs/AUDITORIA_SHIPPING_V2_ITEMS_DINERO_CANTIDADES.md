# Auditoria Shipping V2 Items: dinero, cantidades y ganancia

**Fecha:** 2026-07-31  
**Rama auditada:** `agent/siguiente-asunto-sistema`  
**Modulo:** `/shipping-v2/items` y consumidores directos de `Shipping Items`  
**Estado:** auditoria read-only. No se modifico Airtable, no se ejecutaron backfills, no se cambiaron reglas vivas.

## Alcance

Esta auditoria revisa todos los puntos donde `Shipping Items` participa en dinero o cantidades:

- `Cantidad`, `Unidad`, `Disponible para venta`, `Reservado`.
- `Costo proveedor`, costos logisticos de packing, `Costo total unidad`, `Costo total estimado`, `Costo asignado por despiece`.
- `Precio venta sugerido`, `Precio venta final`, ganancia visual de `/shipping-v2/items`.
- Pagos de Shipping V2, facturacion, recibos, proformas y reservas cuando consumen items.
- Formulas reales de Airtable via Metadata API.

## Metodo

- Lectura de codigo en rutas, UI y librerias.
- Consulta read-only a Airtable Metadata API.
- Consulta read-only a registros reales de Airtable.
- Corte de datos: **2026-07-31 08:34 America/Guayaquil**.

Snapshot leido:

| Tabla | Registros |
|---|---:|
| Shipping Items | 158 |
| Shipping Packings | 8 |
| Shipping Pagos | 12 |
| Reservas | 0 |
| Facturas Electronicas | 50 |
| Recibos | 1 |

## Resumen Ejecutivo

Hay una inconsistencia estructural urgente: `Cantidad` ya funciona como **stock real** en facturacion y recibos, pero Shipping V2 pagos y varias formulas de costos siguen tratando cada record como si fuera una sola unidad. En produccion ya hay **25 records multiunidad** y **3 pagos** que cambian de total si se multiplica `Costo proveedor x Cantidad`.

El segundo riesgo urgente es de venta: hay **143 items con `Disponible para venta = Si`**, pero **92** no tienen `Precio venta final > 0`; **91** tampoco tienen `Precio venta sugerido > 0`. El buscador de facturacion usa `Precio venta final ?? Precio venta sugerido ?? 0`, asi que esos items pueden entrar a factura, recibo o proforma con precio unitario **$0.00**.

El tercer riesgo es de auditoria financiera: el bloqueo de `Costo proveedor` despues de pago solo mira el campo legacy `Pago relacionado`, no los links actuales `Shipping Pagos (Items relacionados)`. Hoy hay **68 items** con pago V2 activo y `Pago relacionado` legacy vacio; por tanto el costo podria editarse inline aunque ya exista pago.

## Mapa Actual Del Flujo

### Alta y edicion de items

- La pantalla nueva solo captura `Costo proveedor` y `Precio venta sugerido`; no captura `Cantidad`, `Unidad` ni `Precio venta final` (`app/shipping-v2/items/nuevo/ShippingV2NewItemForm.tsx:36`, `:48`, `:75`, `:294`, `:442`).
- El `POST /api/shipping-v2/items` tampoco parsea `cantidad`, `unidad` ni `precioVenta` (`app/api/shipping-v2/items/route.ts:27`).
- El `PATCH /api/shipping-v2/items/[id]` si parsea esos campos (`app/api/shipping-v2/items/[id]/route.ts:29`), y el inline edit los expone (`lib/shipping-v2/item-edit-config.ts:47`).
- `validateItemInput()` solo obliga datos basicos y costo presente para compras; no valida cantidad positiva, precio final positivo, costo mayor a 0, ni relacion precio/costo (`lib/shipping-v2/airtable.ts:677`).
- `normalizeInlineValue()` acepta cualquier numero finito, incluidos 0 y negativos (`lib/shipping-v2/airtable.ts:653`).

### Airtable y formulas

Metadata API confirma:

```text
Costo total unidad =
IF({Costo proveedor}, {Costo proveedor}, 0)
+
IF({Costo logistico asignado}, {Costo logistico asignado}, 0)
```

La formula no multiplica por `Cantidad`. Eso es correcto si el campo representa **costo unitario**, pero entonces todos los totales operativos deben multiplicar por `Cantidad` cuando corresponda.

Las formulas de flete/arancel/otros usan el count de records del packing o el rollup de `Costo proveedor`, no una suma de unidades. La opcion `Por peso` existe en el select actual (`lib/shipping-v2/schema.generated.ts:565`), pero las formulas no tienen peso por item; si se usa, asignan 0.

### Pagos de Shipping

- `computePagosSummary()` suma `item.costoProveedor` una vez por record (`lib/shipping-v2/airtable.ts:3019`).
- `createShippingV2Pago()` guarda `Total a pagar` como suma de `item.costoProveedor` una vez por record (`lib/shipping-v2/airtable.ts:3160`).
- En cambio, la factura de packing si multiplica `cantidad x unitPrice` (`lib/shipping-v2/airtable.ts:3551`).

### Facturacion, recibos y reservas

- El catalogo de productos filtra `Disponible para venta` y `Cantidad >= 1`, pero no filtra precio positivo (`lib/facturacion/airtable/productos.ts:59`, `:82`).
- Facturacion toma el precio del catalogo como `precioUnitario` (`components/facturacion/FacturacionForm.tsx:368`) y valida `precioUnitario < 0`, no `<= 0` (`components/facturacion/FacturacionForm.tsx:655`).
- Recibos hacen lo mismo: `precioUnitario` puede ser 0 (`components/facturacion/ReciboForm.tsx:52`, `app/api/facturacion/recibos/route.ts:40`).
- Reservas toman el precio desde el cliente HTTP y solo validan `> 0`, sin contrastarlo con el item en Airtable (`app/api/facturacion/reservas/route.ts:47`).
- El descuento de stock en facturacion y recibos si trata `Cantidad` como unidades reales (`lib/facturacion/reglas/stock.ts:42`, `lib/facturacion/gancho/postEmision.ts:135`, `lib/facturacion/recibos/efectos.ts:37`).

## Hallazgos

### F-S2-01 - P0 - `Cantidad` es stock real, pero pagos no multiplican por cantidad

**Evidencia en codigo:** pagos suman `Costo proveedor` una vez por record; la factura de packing multiplica por `Cantidad`.

**Evidencia en datos:** hay 25 items con `Cantidad > 1` y 3 pagos ya muestran diferencia si se interpreta `Cantidad` como unidades:

| Pago | Estado | Total guardado | Suma costo unitario | Suma costo x cantidad | Diferencia vs cantidad |
|---|---|---:|---:|---:|---:|
| PAY-20260610-31894 | Pagado | $3,748.00 | $3,753.50 | $3,797.50 | $49.50 |
| PAY-20260708-50920 | Pagado | $26.81 | $26.81 | $53.62 | $26.81 |
| PAY-20260708-60288 | Pagado | $16.96 | $16.96 | $33.92 | $16.96 |

Items multiunidad dentro de esos pagos:

| Pago | Item | Cantidad | Costo proveedor | Costo x cantidad |
|---|---|---:|---:|---:|
| PAY-20260708-60288 | REP-000002 | 2 | $8.58 | $17.16 |
| PAY-20260708-60288 | REP-000001 | 2 | $8.38 | $16.76 |
| PAY-20260610-31894 | ACC-000001 | 9 | $5.50 | $49.50 |
| PAY-20260610-31894 | ACC-000002 | 2 | $0.00 | $0.00 |
| PAY-20260708-50920 | OTR-000004 | 2 | $26.81 | $53.62 |

**Impacto:** pagos a proveedor y resumen `Por pagar` pueden quedar subestimados. El corte actual de items pendientes de pago da **$3,563.07** con la logica actual y **$3,810.47** multiplicando por cantidad.

**Recomendacion:** definir `Costo proveedor` como costo unitario y corregir `createShippingV2Pago()`, `computePagosSummary()` y cualquier rollup financiero para usar `cantidadPositiva(item) * costoProveedor`. Antes de cambiar pagos existentes, conciliar manualmente los 3 pagos listados.

### F-S2-02 - P0 - Items disponibles pueden entrar a facturacion con precio 0

**Evidencia en datos:**

- 143 items tienen `Disponible para venta = Si`.
- 92 disponibles no tienen `Precio venta final > 0`.
- 91 disponibles no tienen ni `Precio venta final > 0` ni `Precio venta sugerido > 0`.
- Distribucion de disponibles sin precio final: `Pendiente de pago: 64`, `En transito: 18`, `En revision: 5`, `En packing: 4`, `Repuesto: 1`.

Ejemplos:

| Item | Estado | Cantidad | Precio final | Precio sugerido |
|---|---|---:|---:|---:|
| ACC-000026 - Llaveros Super Geek 3D-Printed | Pendiente de pago | 107 | - | - |
| LAP-000048 - HP Zbook 15 G6 | En packing | 1 | - | - |
| DES-000004 - Lenovo ThinkCentre M70q Gen 2 | En transito | 1 | - | - |
| REP-000002 - LCD Adhesive Strips Tape Opening Wheel Tools | En revision | 2 | - | - |

**Impacto:** el catalogo de facturacion devuelve precio 0 cuando no hay precio final ni sugerido. La UI y API solo bloquean precios negativos, no precio 0. Puede emitirse una factura/recibo/proforma de un item real a $0.00 si el operador no corrige el precio.

**Recomendacion:** para productos ligados a `Shipping Items`, exigir `Precio venta final > 0` antes de aparecer en catalogo facturable/reservable. Si el negocio necesita "ofrecer" items antes de precio final, separar `Disponible para venta` en dos conceptos: `Ofrecible / publicable` y `Facturable / reservable`.

### F-S2-03 - P0 - El costo puede editarse despues de un pago V2 activo

**Evidencia en codigo:** `validateInlineItemFieldChange()` bloquea cambios de proveedor/costo solo si `input.item.pagoId` existe (`lib/shipping-v2/airtable.ts:2374`). Ese campo corresponde al `Pago relacionado` legacy, mientras los pagos actuales llegan por links `Shipping Pagos (Items relacionados)` y `Shipping Pagos (Regalos incluidos)`.

**Evidencia en datos:** 68 items tienen pago V2 activo, pero `Pago relacionado` legacy vacio. Ejemplos:

| Item | Pago V2 | Costo |
|---|---|---:|
| DES-000005 | rec3NPCMWvehZhLTJ | $160.30 |
| LAP-000034 | rec3NPCMWvehZhLTJ | $202.30 |
| REP-000002 | recLIz8QkIHOQx4sG | $8.58 |
| OTR-000004 | recx8oKQnCMtRGofo | $26.81 |

**Impacto:** un pago ya creado o pagado puede quedar historicamente inconsistente si alguien corrige el costo del item despues. El pago PAY-20260610-31894 ya no coincide contra la suma unitaria actual: guardado $3,748.00 vs suma actual $3,753.50.

**Recomendacion:** bloquear `Costo proveedor`, `Proveedor de compra`, `Cantidad` y campos de precio base cuando exista pago V2 activo, factura, recibo o reserva activa; permitir solo correccion administrativa con evento y motivo.

### F-S2-04 - P1 - Compras a proveedor con costo 0 pasan validacion y estan disponibles

**Evidencia en codigo:** `validateItemInput()` exige que `Costo proveedor` sea numero finito, pero acepta 0 (`lib/shipping-v2/airtable.ts:689`).

**Evidencia en datos:** 9 items `Compra a proveedor` tienen `Costo proveedor = $0.00`, `Requiere pago = Si` y `Disponible para venta = Si`:

| Item | Estado | Cantidad |
|---|---|---:|
| ACC-000026 - Llaveros Super Geek 3D-Printed | Pendiente de pago | 107 |
| ACC-000023 - Logo Intel Core i7 3D-Printed | Pendiente de pago | 10 |
| ACC-000022 - Llaveros Base para Celular | Pendiente de pago | 10 |
| ACC-000024 - Nvidia GeForce Logo 3D-Printed | Pendiente de pago | 6 |
| ACC-000002 - Teclado Logitech G815 | Disponible | 2 |

**Impacto:** costo, pago pendiente y ganancia quedan artificialmente en cero o inflados.

**Recomendacion:** para `Compra a proveedor` y `Compra ya pagada`, exigir `Costo proveedor > 0`, salvo un tipo de operacion explicito de regalo/promocional que no requiera pago.

### F-S2-05 - P1 - Packing prorratea por record, no por unidades

**Evidencia en formula:** `Costo flete asignado`, `Costo arancel asignado` y `Otros costos asignados` usan `Cantidad items Packing` (count de records) o `Total costo proveedor Packing` (rollup de costos unitarios). No hay suma `Cantidad` ni costo proveedor total por unidades.

**Evidencia en datos:** no hay packings actuales con regla `Por peso`, y la suma asignada por formulas cuadra contra el total del packing si se cuenta una vez por record. Pero si `Costo total unidad` se interpreta como costo unitario y se multiplica por stock, dos packings con multiunidad quedan inflados:

| Packing | Regla | Records | Unidades | Total logistico packing | Asignado x cantidad |
|---|---|---:|---:|---:|---:|
| PK-20260610-47604 | Por costo del item | 10 | 19 | $609.17 | $621.58 |
| PK-20260708-31014 | Por costo del item | 18 | 21 | $75.81 | $84.70 |

**Impacto:** los costos logisticos por unidad pueden quedar mal distribuidos cuando un record representa varias unidades.

**Recomendacion:** crear formulas explicitas:

- `Cantidad unidades Packing = SUM(Items incluidos.Cantidad)`.
- `Costo proveedor total item = Costo proveedor * Cantidad`.
- Prorrateo `Por cantidad`: total logistico / total unidades.
- Prorrateo `Por costo`: total logistico * costo proveedor total item / total costo proveedor packing.
- Deshabilitar `Por peso` hasta tener peso por item, no solo peso del packing.

### F-S2-06 - P1 - El formulario de item nuevo no captura cantidad, unidad ni precio final

**Evidencia:** el estado y el formulario solo tienen `costoProveedor` y `precioVentaSugerido`; el API POST tampoco acepta los tres campos.

**Impacto:** un alta manual puede nacer sin precio final facturable. Hoy todos los records tienen `Cantidad` y `Unidad`, probablemente por migracion o edicion posterior, pero la ruta sigue incompleta para nuevos registros.

**Recomendacion:** agregar al alta manual:

- `Cantidad`, default 1, entero positivo.
- `Unidad`, default `Unidad`.
- `Precio venta final`, requerido si queda `Disponible para venta = Si` o si se marca facturable/reservable.

### F-S2-07 - P2 - La ganancia visible es unitaria, no total, y no explicita margen

**Evidencia:** `calculateItemProfit()` devuelve `Precio venta final - Costo total unidad` (`app/shipping-v2/items/ShippingV2ItemsClient.tsx:316`). La ficha muestra `Cantidad`, `Costo total unidad`, `Precio venta final` y `Ganancia`, pero no `Ganancia total stock` (`app/shipping-v2/items/ShippingV2ItemsClient.tsx:1341`, `:1363`, `:1368`).

**Estado de datos:** no hay `Precio venta final < Costo total unidad` en el corte actual. `Costo asignado por despiece` y `Costo total estimado` estan en 0 en todos los records.

**Impacto:** para records multiunidad, el operador ve una ganancia por unidad sin saber la ganancia total del stock. Si en el futuro `Costo asignado por despiece` empieza a usarse, la ganancia actual no lo incorporaria.

**Recomendacion:** renombrar a `Ganancia unidad`, agregar `Ganancia stock = Ganancia unidad * Cantidad`, `Margen %`, y documentar que `Costo total estimado` queda deprecado o se convierte en formula real.

### F-S2-08 - P2 - Reservas confian en precio enviado por cliente

**Evidencia:** `ReservaForm` toma el precio del catalogo y lo manda al API (`components/facturacion/ReservaForm.tsx:108`); el API valida solo `precioVenta > 0` y disponibilidad, pero no compara contra `Precio venta final` actual (`app/api/facturacion/reservas/route.ts:47`).

**Estado de datos:** no hay reservas actuales en la tabla en el corte leido.

**Impacto:** cuando vuelvan a existir reservas, un precio manipulado o desactualizado puede quedar grabado en reserva, abono minimo, PDF y factura posterior.

**Recomendacion:** el servidor debe releer `Precio venta final` desde `Shipping Items` y usar ese valor como autoridad. El cliente no debe decidir el precio final de una reserva.

### F-S2-09 - P2 - Edicion inline de cantidad/precio no tiene barreras por movimientos posteriores

**Evidencia:** `cantidad`, `precioVentaSugerido` y `precioVentaFinal` son campos inline normales (`lib/shipping-v2/item-edit-config.ts:48`). No hay bloqueo especifico si el item ya tiene factura, recibo, reserva o pago V2.

**Estado de datos:** no hay items vinculados a factura/recibo con `Cantidad > 0` en el corte actual.

**Impacto:** una correccion manual posterior puede romper la historia de stock, pago o precio de venta.

**Recomendacion:** establecer campos congelados por evento:

| Evento existente | Campos que deben congelarse |
|---|---|
| Pago V2 activo/pagado | `Costo proveedor`, `Proveedor de compra`, `Cantidad` si afecta total a pagar |
| Factura/Recibo autorizado | `Cantidad`, `Precio venta final`, `Unidad` |
| Reserva activa | `Precio venta final`, `Cantidad`, `Reservado`, `Disponible para venta` |
| Packing cerrado/recibido | `Costo proveedor`, `Cantidad`, reglas que alteren costo logistico |

## Datos Multiunidad

Hay 25 records con `Cantidad > 1`:

| Item | Cant. | Estado | Disponible | Reservado | PV final | Costo prov. | Costo unidad |
|---|---:|---|---|---|---:|---:|---:|
| ACC-000026 - Llaveros Super Geek 3D-Printed | 107 | Pendiente de pago | Si | No | - | $0.00 | $0.00 |
| REP-000017 - Disco Duro Solido Interno 120GB 2.5 SATA Mixed/Brands | 52 | Repuesto | Si | Si | $40.00 | $4.16 | $4.16 |
| ACC-000023 - Logo Intel Core i7 3D-Printed | 10 | Pendiente de pago | Si | No | - | $0.00 | $0.00 |
| ACC-000022 - Llaveros Base para Celular | 10 | Pendiente de pago | Si | No | - | $0.00 | $0.00 |
| ACC-000001 - Kensington Combination Laptop Lock | 9 | Disponible | Si | No | $40.00 | $5.50 | $7.05 |
| ACC-000037 - Cargador Original Apple USB-C 5W | 8 | Pendiente de pago | Si | No | - | $1.00 | $1.00 |
| REP-000018 - Disco Duro Solido Interno 60GB | 8 | Repuesto | No | No | $25.00 | - | $0.00 |
| ACC-000031 - Cargador Original Apple 5W | 7 | Pendiente de pago | Si | No | - | $1.50 | $1.50 |
| ACC-000024 - Nvidia GeForce Logo 3D-Printed | 6 | Pendiente de pago | Si | No | - | $0.00 | $0.00 |
| OTR-000016 - Cables USB-C a USB-C Nuevo | 6 | Pendiente de pago | Si | No | - | $2.00 | $2.00 |
| ACC-000030 - Cargador Original Apple 10W | 5 | Pendiente de pago | Si | No | - | $1.90 | $1.90 |
| REP-000007 - Memoria RAM DDR Hynix 1GB 800MHz | 5 | Repuesto | Si | No | $10.00 | $0.00 | $0.00 |
| OTR-000018 - Cable de carga para Apple Watch | 4 | Pendiente de pago | Si | No | - | $1.50 | $1.50 |
| ACC-000038 - Audifono con Microfono Logitech | 4 | Pendiente de pago | Si | No | - | $5.00 | $5.00 |
| ACC-000021 - Llavero de Air Jordan Nike | 2 | Pendiente de pago | Si | No | - | $0.00 | $0.00 |
| REP-000002 - LCD Adhesive Strips Tape Opening Wheel Tools | 2 | En revision | Si | No | - | $8.58 | $10.33 |
| ACC-000019 - Base para telefono | 2 | Pendiente de pago | Si | No | - | $0.00 | $0.00 |
| LAP-000042 - Microsoft Surface Laptop 3 13.5 Tactil | 2 | En packing | Si | No | - | $174.30 | $174.30 |
| OTR-000017 - Cables USB-C a Lightning | 2 | Pendiente de pago | Si | No | - | $2.00 | $2.00 |
| ACC-000035 - Cargador Original Apple USB-C 29W | 2 | Pendiente de pago | Si | No | - | $8.00 | $8.00 |
| OTR-000004 - ARCTIC MX-7 Thermal Paste | 2 | En revision | Si | No | - | $26.81 | $32.27 |
| ACC-000039 - Microsoft Modern Wireless Headset | 2 | Pendiente de pago | Si | No | - | $10.00 | $10.00 |
| ACC-000025 - Super Geek Padmouse 3D-Printed | 2 | Pendiente de pago | Si | No | - | $0.00 | $0.00 |
| REP-000001 - Apple iMac 27 A1419 LCD Screen Adhesive Strip Kit | 2 | En revision | No | Si | - | $8.38 | $10.09 |
| ACC-000002 - Teclado Logitech G815 | 2 | Disponible | Si | No | $150.00 | $0.00 | $0.00 |

## Plan Recomendado De Correccion

1. **Contencion inmediata del riesgo de venta a $0:** filtrar catalogo de facturacion/reservas para que items ligados a `Shipping Items` requieran `Precio venta final > 0`; dejar lineas manuales como excepcion explicita.
2. **Congelar campos despues de eventos financieros/fiscales:** bloquear costo/cantidad/precio cuando exista pago V2 activo, factura, recibo o reserva activa; agregar bypass admin con motivo y evento.
3. **Normalizar validaciones de items:** crear una utilidad pura para validar `Cantidad`, `Unidad`, `Costo proveedor`, `Precio venta final` y usarla en POST, PATCH completo e inline.
4. **Corregir pagos nuevos:** `Total a pagar = SUM(Costo proveedor * Cantidad positiva)` y resumen `Por pagar` igual.
5. **Conciliar pagos existentes afectados:** revisar los tres pagos listados antes de backfill; el cambio no debe reescribir pagos pagados sin decision financiera.
6. **Corregir packing con unidades:** agregar formulas auxiliares de total por unidades y desactivar `Por peso` hasta tener peso por item.
7. **Clarificar UI de ganancia:** mostrar `Ganancia unidad`, `Ganancia stock`, `Margen %`, y warning si falta precio/costo.
8. **Tests antes de tocar datos:** cubrir `createShippingV2Pago`, `computePagosSummary`, validacion de inline, catalogo de facturacion, reservas y formulas puras de costo/cantidad.

## Reglas De Negocio Que Deben Confirmarse Antes De Implementar

1. `Cantidad` debe quedar oficialmente como stock de unidades dentro de un record, no como campo informativo.
2. `Costo proveedor` debe ser costo **unitario**. Si se desea costo total de lote, se necesita otro campo.
3. `Precio venta final` debe ser la unica fuente autorizada para facturar/reservar; `Precio venta sugerido` queda solo como borrador interno.
4. `Disponible para venta` hoy mezcla "ofrecible" y "facturable". Conviene separarlos o endurecerlo.
5. `Costo proveedor = 0` solo debe permitirse para regalos/reajustes claramente identificados, no para `Compra a proveedor`.

## Checklist De Verificacion Para La Rama De Arreglo

- Unit tests de validacion de dinero/cantidad.
- Tests de pagos con `Cantidad = 1`, `2`, `0` y `null`.
- Tests de catalogo: item disponible sin precio final no aparece como producto facturable.
- Tests de reservas: el API ignora precio enviado por cliente y relee Airtable.
- Tests de bloqueo inline: pago V2 activo, factura, recibo y reserva.
- Corte read-only posterior de Airtable comparando:
  - disponibles sin precio facturable,
  - pagos con diferencia,
  - packings con multiunidad,
  - compras a proveedor con costo 0.
