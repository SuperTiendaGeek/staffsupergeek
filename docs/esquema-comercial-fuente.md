# Esquema Comercial — Estado Actual de las 4 Tablas Fuente

> Fecha: 2026-06-28 — SOLO LECTURA  
> Base: SUPER GEEK ADM (`appLkmz7I6vqJ2UXc`)  
> Propósito: insumo de diseño para la fusión en 3 tablas nuevas.

Leyendas de marcadores usados en este documento:  
`[CALC]` = campo calculado por Airtable (formula / rollup / lookup / count / autoNumber / createdTime / lastModifiedTime)  
`[LEGACY]` = campo en desuso, duplicado o con propósito ambiguo  
`[SNAP]` = snapshot de texto que sustituye a un link real  
`[FIN]` = campo del ciclo de integración financiera (diseñado, nunca conectado)

---

## 1. Cotizaciones

**Registros:** 24  
**ID de tabla:** `tblGgwjH64Pxq8Ev6`

### 1.1 Campos

| Campo | Tipo | Detalle | Marcador |
|---|---|---|---|
| `Código Cotización` | formula | `"COT-" & año & "-" & consecutivo padded` | `[CALC]` |
| `Consecutivo` | autoNumber | Autoincremental gestionado por Airtable | `[CALC]` |
| `Cliente Record ID` | singleLineText | Record ID del cliente como texto plano | `[SNAP]` `[LEGACY]` |
| `Cliente Nombre` | singleLineText | Nombre del cliente como texto plano | `[SNAP]` |
| `Cliente Teléfono` | phoneNumber | Teléfono como snapshot | `[SNAP]` |
| `Cliente Email` | email | Email como snapshot | `[SNAP]` |
| `Cliente Cédula` | singleLineText | Cédula como snapshot | `[SNAP]` |
| `Producto Solicitado` | singleLineText | Descripción libre del producto buscado | — |
| `Categoría` | singleSelect | Laptop / Desktop / Electrónico / Repuesto / Consola / iMac / Mainboard / Batería / Otro | — |
| `Descripción del Requerimiento` | multilineText | Notas del cliente sobre lo que necesita | — |
| `Estado Cotización` | singleSelect | Pendiente / Buscando Opciones / Cotización Enviada / Esperando Respuesta / Aprobada / No Aprobada / No Disponible / Convertida en Pedido / Finalizada Sin Compra | — |
| `Requiere Instalación` | checkbox | Si el pedido necesita instalación al llegar | — |
| `Equipo ya está en tienda` | checkbox | Si el equipo del cliente ya está físicamente en tienda | — |
| `Orden Reparación ID` | singleLineText | Record ID de la orden vinculada como texto | `[SNAP]` `[LEGACY]` |
| `Orden Reparación Código` | singleLineText | Código legible de la orden (ej. `OR000358`) como texto | `[SNAP]` `[LEGACY]` |
| `Item Pedido ID` | singleLineText | Record ID del Item creado al convertir, como texto | `[LEGACY]` coexiste con `Pedido Generado` |
| `Total Cotizado` | currency | Precio de la opción aprobada; lo escribe el código al aprobar | — |
| `Total Abonado` | currency | Suma de abonos registrados; lo recalcula el código en cada operación de abono | `[LEGACY]` debería ser rollup |
| `Saldo Pendiente` | formula | `Total Cotizado - Total Abonado` | `[CALC]` |
| `Registrado Por` | singleLineText | Nombre del usuario que creó la cotización | — |
| `Fecha Creación` | createdTime | Automático de Airtable | `[CALC]` |
| `Última Actualización` | lastModifiedTime | Automático de Airtable | `[CALC]` |
| `Observación Interna` | multilineText | Notas internas del operador | — |
| `Opciones de Cotización` | multipleRecordLinks → Opciones de Cotización | Todas las opciones creadas para esta cotización | — |
| `Abonos de Cotización` | multipleRecordLinks → Abonos de Cotización | Todos los abonos vinculados | — |
| `Opción Elegida` | multipleRecordLinks → Opciones de Cotización | La opción aprobada por el cliente (1 registro) | — |
| `Pedido Generado` | multipleRecordLinks → Item | El registro Item creado al convertir (1 registro) | — |

**Total: 27 campos** — 6 calculados, 5 snapshots de cliente, 3 legacy de texto, 1 manual que debería ser rollup.

### 1.2 Datos de cliente: texto vs link

No existe ningún campo `multipleRecordLinks` hacia la tabla `Clientes` en Cotizaciones. La relación con el cliente se gestiona íntegramente mediante 5 campos de texto plano (snapshots):

| Campo | Tipo real | Valor guardado |
|---|---|---|
| `Cliente Record ID` | singleLineText | Record ID de Clientes (ej. `recXXX…`) — texto, no link |
| `Cliente Nombre` | singleLineText | Nombre en el momento de creación |
| `Cliente Teléfono` | phoneNumber | Teléfono en el momento de creación |
| `Cliente Email` | email | Email en el momento de creación |
| `Cliente Cédula` | singleLineText | Cédula en el momento de creación |

El `Cliente Record ID` permite al código buscar el registro del cliente, pero Airtable no lo trata como relación: no hay backlink, no hay lookup, y si el nombre del cliente cambia en la tabla Clientes, la cotización sigue mostrando el valor congelado.

### 1.3 Campos legacy / ambiguos

- **`Item Pedido ID`** (singleLineText): contiene el record ID del pedido como texto. Coexiste con `Pedido Generado` (link real al mismo registro). El código lee ambos con `||` — el campo texto es un residuo del modelo anterior al link.
- **`Orden Reparación ID` + `Orden Reparación Código`**: dos campos de texto que apuntan a la orden de origen. No hay link real a la tabla Órdenes de Reparación.
- **`Total Abonado`**: el código lo recalcula y lo escribe manualmente después de cada operación de abono. Semánticamente es un rollup, pero al no tener link real entre cotización y abonos la fórmula nativa no funciona.

### 1.4 Muestras

**Muestra #1** (`rec0q7T51IXoorjF5`, 2026-05-18):
- Código: COT-2026-000012 | Estado: Esperando Respuesta | Categoría: Repuesto
- Producto: Pantalla Laptop Asus Vivobook F1500E
- Cliente: Na\*\*\*jo / 09\*\*\*56 / 10\*\*\*81 (snapshot)
- Opciones: 1 vinculada | Saldo: $0

**Muestra #2** (`rec4kyug72qdjgtNC`, 2026-06-09):
- Código: COT-2026-000020 | Estado: Esperando Respuesta | Sin categoría
- Producto: Batería CA06XL 4910mAh para HP ProBook 640 G1
- Cliente: Ga\*\*\*jo / 09\*\*\*19 (snapshot) | Requiere instalación: sí
- Opciones: 1 vinculada | Saldo: $0

---

## 2. Opciones de Cotización

**Registros:** 23  
**ID de tabla:** `tbldpEjnOqRZMEivL`

### 2.1 Campos

| Campo | Tipo | Detalle | Marcador |
|---|---|---|---|
| `Opción` | formula | Etiqueta calculada: `" - $precio"` | `[CALC]` |
| `Cotización` | multipleRecordLinks → Cotizaciones | Link escrito al **crear** la opción | — |
| `Cotizaciones` | multipleRecordLinks → Cotizaciones | Link escrito al **convertir** en pedido | `[LEGACY]` duplicado de `Cotización` |
| `Nombre Opción` | singleLineText | Campo descriptivo nunca escrito por el código | `[LEGACY]` siempre vacío |
| `Descripción` | multilineText | Campo descriptivo antiguo | `[LEGACY]` sustituido por `Producto / Descripción` |
| `Producto / Descripción` | multilineText | Campo activo para describir el producto ofertado | — |
| `Fotos` | multipleAttachments | Imágenes del producto | — |
| `Proveedor` | multipleRecordLinks → Proveedores | Link al proveedor de la opción (tabla legacy `Proveedores`) | `[LEGACY]` apunta a tabla incorrecta |
| `URL Proveedor` | url | URL del listado del proveedor; a veces contiene texto libre (ej. "DTC") en lugar de URL | uso inconsistente |
| `Costo Proveedor` | currency | Costo pagado al proveedor | — |
| `Flete Estimado` | currency | Costo estimado de envío | — |
| `Arancel / Impuestos` | currency | Costo estimado de arancel | — |
| `Otros Costos` | currency | Costos varios | — |
| `Costo Real Total` | formula | `Costo Proveedor + Flete + Arancel + Otros` | `[CALC]` |
| `Precio Venta Cliente` | currency | Precio final propuesto al cliente | — |
| `Ganancia Estimada` | formula | `Precio Venta Cliente - Costo Real Total` | `[CALC]` |
| `Estado Opción` | singleSelect | Disponible / Ofrecida al Cliente / Seleccionada / Descartada / No Disponible | — |
| `Seleccionada por Cliente` | checkbox | `true` cuando el cliente aprueba esta opción | — |
| `Nota Interna` | multilineText | Notas para el equipo interno | — |
| `Nota para Cliente` | multilineText | Texto que se compartirá con el cliente | — |
| `Item Asociado` | multipleRecordLinks → Item | Link al registro pedido generado al convertir | — |
| `Revisión AI de Opción` | aiText | Campo AI que evalúa la opción; en estado `error` en todos los registros revisados | `[LEGACY]` inoperante |
| `Tiempo Estimado` | singleSelect | 24 horas / 2 a 3 días / 1 semana / 2 a 3 semanas / 1 mes / Por confirmar | — |

**Total: 23 campos** — 3 calculados, 2 links duplicados a Cotizaciones, 3 campos descriptivos (1 activo + 2 legacy), 1 AI inoperante, 1 con uso inconsistente.

### 2.2 Duplicados y ambigüedades

- **`Cotización` vs `Cotizaciones`**: dos campos de link a la misma tabla. `Cotización` se escribe al crear la opción; `Cotizaciones` se escribe al convertir en pedido. El código usa `OR` sobre ambos para buscar. No existe ninguna lógica que explique tener dos campos — es el resultado de un campo creado en dos momentos distintos del desarrollo.
- **`Nombre Opción` vs `Producto / Descripción`**: el primero nunca se escribe. El segundo es el activo. En los 23 registros, `Nombre Opción` aparece vacío.
- **`Descripción` vs `Producto / Descripción`**: el primero es el campo original; el segundo lo reemplazó. Los registros más antiguos pueden tener `Descripción` relleno pero el código ya no lo usa.
- **`Proveedor`** apunta a la tabla `Proveedores` (legacy con 7 registros, esquema simple). La tabla correcta sería `Shipping Proveedores` (19 registros, esquema completo con capacidades logísticas).

### 2.3 Muestras

**Muestra #1** (`rec0AZts4012qOffe`, 2026-06-10):
- Descripción: TECLADO LENOVO T460S CON POINTER SP
- Proveedor: `recMKJBDVJFxJnz1R` (DTC) | Precio Venta: enmascarado | Costo: $0
- URL Proveedor: "DTC" (texto libre, no URL) | Tiempo: 2 a 3 días
- Estado: Disponible | Ganancia: $65 | Cotización: `recn8HAlQWRhE1Z3q`

**Muestra #2** (`rec2vSiLQyhtkVPgN`, 2026-05-16):
- Descripción: Lenovo Thinkpad T14 Gen 1 14" AMD Ryzen 5 Pro 4650U…
- Proveedor: `rec0EOISxjI08QWkQ` (Charles) | Precio Venta: enmascarado | Costo: $231
- URL: URL válida de 3rtechnology.com | Tiempo: 2 a 3 semanas
- Estado: Disponible | Ganancia: $139 | Cotización: `recvbfMGX896QJeUb`

---

## 3. Abonos por Orden

**Registros:** 127  
**ID de tabla:** `tblc9MCGvzcjcg6ki`

### 3.1 Campos

| Campo | Tipo | Detalle | Marcador |
|---|---|---|---|
| `ID Abono` | number | Consecutivo escrito por el código (MAX+1). No hay `autoNumber`. | — |
| `Fecha` | date | Fecha de registro (sin hora); inyectada por el código | — |
| `Monto` | currency | Monto del abono | — |
| `Método de pago` | singleSelect | Efectivo / Transferencia / Tarjeta / PayPal | — |
| `Observación` | multilineText | Notas sobre el abono | — |
| `Registrado por` | singleLineText | Nombre del usuario que registró | — |
| `Comprobante` | multipleAttachments | Foto o archivo del comprobante | — |
| `Movimiento Financiero ID` | singleLineText | ID externo del movimiento en sistema financiero | `[FIN]` siempre vacío |
| `Cuenta Destino` | singleLineText | Cuenta donde cayó el pago (ej. "Caja") | — |
| `Estado Financiero` | singleSelect | Pendiente de registrar / Registrado en Finanzas / Error de sincronización / Anulado | `[FIN]` |
| `Fecha Sincronización Finanzas` | date | Fecha cuando se sincronizó con finanzas | `[FIN]` siempre vacío |
| `Error Sincronización Finanzas` | multilineText | Mensaje de error de sincronización | `[FIN]` siempre vacío |
| `_old_record_id` | singleLineText | Record ID original en la base Gestión (artefacto de migración) | `[LEGACY]` |
| `Orden de Reparación` | multipleRecordLinks → Órdenes de Reparación | La orden a la que pertenece este abono | — |

**Total: 14 campos** — 0 calculados, 1 artefacto de migración, 4 del ciclo financiero (nunca usados), sin campo de estado propio del abono (la anulación se marca con `Estado Financiero = "Anulado"`).

### 3.2 Observaciones

- Los 127 registros incluyen todos los abonos migrados de la base Gestión. Las muestras iniciales tienen `Observación: "Abono legacy interfaz Airtable"`, lo que indica que fueron introducidos directamente en Airtable, no desde el portal.
- No hay campo propio de estado (Registrado / Anulado). La anulación se maneja vía `Estado Financiero = "Anulado"`. Esto es asimétrico con `Abonos de Cotización` que sí tiene `Estado del Abono`.
- `_old_record_id` es un artefacto de la migración; ya no tiene utilidad operacional.

### 3.3 Muestras

**Muestra #1** (`rec0AyTPEjWkh6P2b`, 2026-06-28):
- ID Abono: 112 | Monto: $25 | Método: Efectivo
- Orden: `recN7eh90DF3avtYq` | Observación: "Abono legacy interfaz Airtable"

**Muestra #2** (`rec1YBLe3ndOocGLO`, 2026-06-28):
- ID Abono: 103 | Monto: $35 | Método: Efectivo
- Orden: `rec5hAbCDagCMI6a3` | Observación: "Abono legacy interfaz Airtable"

---

## 4. Abonos de Cotización

**Registros:** 4  
**ID de tabla:** `tblu42s1jk0pt329b`

### 4.1 Campos

| Campo | Tipo | Detalle | Marcador |
|---|---|---|---|
| `Abono` | formula | Etiqueta: `"Nombre - fecha - $monto"` | `[CALC]` |
| `Cotización` | multipleRecordLinks → Cotizaciones | La cotización a la que pertenece | — |
| `Item Pedido ID` | singleLineText | Record ID del pedido generado, como texto | `[LEGACY]` siempre vacío o redundante |
| `Cliente Nombre` | singleLineText | Snapshot del nombre del cliente | `[SNAP]` `[LEGACY]` accesible vía link a Cotización |
| `Fecha de Abono` | dateTime | Fecha y hora del abono (con hora) | — |
| `Monto` | currency | Monto del abono | — |
| `Método de Pago` | singleSelect | Efectivo / Transferencia bancaria / Depósito / Tarjeta / Otro | — |
| `Comprobante` | multipleAttachments | Foto o archivo del comprobante | — |
| `Número de Transacción` | singleLineText | Referencia de la transferencia o pago digital | — |
| `Registrado Por` | singleLineText | Nombre del usuario que registró | — |
| `Estado del Abono` | singleSelect | Registrado / Anulado | — |
| `Observación` | multilineText | Notas sobre el abono | — |
| `Creado` | createdTime | Timestamp automático de Airtable | `[CALC]` |
| `Movimiento Financiero ID` | singleLineText | ID externo del sistema financiero | `[FIN]` siempre vacío |
| `Cuenta Destino` | singleLineText | Cuenta donde cayó el pago | — |
| `Estado Financiero` | singleSelect | Pendiente de registrar / Registrado en Finanzas / Error de sincronización / Anulado | `[FIN]` todos en "Pendiente de registrar" |
| `Fecha Sincronización Finanzas` | date | Fecha de sincronización | `[FIN]` siempre vacío |
| `Error Sincronización Finanzas` | singleLineText | Mensaje de error | `[FIN]` siempre vacío |

**Total: 18 campos** — 2 calculados, 2 snapshots, 1 legacy de texto, 4 del ciclo financiero.

### 4.2 Muestras

**Muestra #1** (`rec0RPL2fyVgn2Qix`, 2026-05-24):
- Monto: $1 | Método: Efectivo | Estado: Anulado | Estado Financiero: Anulado
- Cuenta: Caja | N° Transacción: 1232 | Registrado por: Alexis Bolaños

**Muestra #2** (`rec3lby8BF35hHtPp`, 2026-05-13):
- Monto: $180 | Método: Efectivo | Estado: Registrado | Estado Financiero: Pendiente de registrar
- Cuenta: Caja | Registrado por: Joseph Bolaños | Cotización: `recGdifi2jNyTxbcJ` (= COT-2026-000010 = PED-2026-000001)

---

## 5. Comparativa Abonos por Orden vs Abonos de Cotización

### 5.1 Campos equivalentes (mismo propósito, distinto nombre o tipo)

| Abonos por Orden | Abonos de Cotización | Diferencia notable |
|---|---|---|
| `Monto` | `Monto` | ✅ idénticos |
| `Comprobante` | `Comprobante` | ✅ idénticos |
| `Cuenta Destino` | `Cuenta Destino` | ✅ idénticos |
| `Observación` | `Observación` | ✅ idénticos |
| `Método de pago` | `Método de Pago` | Solo casing distinto; opciones divergen (ver §5.3) |
| `Registrado por` | `Registrado Por` | Solo casing distinto |
| `Fecha` (date, sin hora) | `Fecha de Abono` (dateTime, con hora) | Nombre y granularidad distintos |
| `Estado Financiero` | `Estado Financiero` | ✅ mismas 4 opciones |
| `Movimiento Financiero ID` | `Movimiento Financiero ID` | ✅ idénticos, ambos siempre vacíos |
| `Fecha Sincronización Finanzas` | `Fecha Sincronización Finanzas` | ✅ idénticos |
| `Error Sincronización Finanzas` | `Error Sincronización Finanzas` | Tipo diferente: multilineText vs singleLineText |
| — (anulación vía `Estado Financiero`) | `Estado del Abono` | Abonos por Orden no tiene campo propio de estado |
| `ID Abono` | — | Solo en Abonos por Orden (consecutivo numérico) |
| `Orden de Reparación` (link) | `Cotización` (link) | Cada tabla enlaza a su entidad padre |

### 5.2 Campos que existen solo en una tabla

| Solo en Abonos por Orden | Solo en Abonos de Cotización |
|---|---|
| `ID Abono` (number, consecutivo) | `Abono` (formula, etiqueta legible) |
| `_old_record_id` (migración) | `Item Pedido ID` (singleLineText, legacy) |
| — | `Cliente Nombre` (snapshot, redundante) |
| — | `Número de Transacción` (singleLineText) |
| — | `Creado` (createdTime automático) |

### 5.3 Opciones de "Método de pago" comparadas

| Abonos por Orden | Abonos de Cotización |
|---|---|
| Efectivo | Efectivo |
| Transferencia | Transferencia bancaria *(nombre diferente)* |
| Tarjeta | Tarjeta |
| PayPal *(solo aquí)* | — |
| — | Depósito *(solo aquí)* |
| — | Otro *(solo aquí)* |

Cinco métodos en total, ningún listado es superconjunto del otro.

### 5.4 Diferencia estructural clave

- **Abonos por Orden** no tiene campo propio de estado (`Registrado` / `Anulado`). La anulación se expresa marcando `Estado Financiero = "Anulado"`, lo que mezcla el ciclo de vida operacional con el ciclo financiero.
- **Abonos de Cotización** tiene `Estado del Abono` (Registrado / Anulado) separado de `Estado Financiero`, lo que es más limpio. Tiene también la fórmula `Abono` como etiqueta legible, que Abonos por Orden no tiene.
- **Granularidad de fecha**: Abonos por Orden guarda solo la fecha; Abonos de Cotización guarda fecha y hora. Para auditoría son preferibles las horas.

---

## 6. Resumen de campos a revisar por tabla

| Tabla | Campos calculados | Snapshots/legacy que duplican info | Campos FIN inactivos |
|---|---|---|---|
| Cotizaciones | 6 | `Cliente Record ID`, `Cliente Nombre`, `Teléfono`, `Email`, `Cédula`, `Orden Reparación ID`, `Orden Reparación Código`, `Item Pedido ID`, `Total Abonado` (9) | 0 |
| Opciones de Cotización | 3 | `Cotizaciones` (dup.), `Nombre Opción`, `Descripción`, `Revisión AI` (4) | 0 |
| Abonos por Orden | 0 | `_old_record_id` (1) | 4 |
| Abonos de Cotización | 2 | `Cliente Nombre`, `Item Pedido ID` (2) | 4 |
