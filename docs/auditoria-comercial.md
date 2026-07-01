# Auditoría Comercial — Cotizaciones y Pedidos
> Fecha: 2026-06-28 — SOLO LECTURA

---

## 1. Tablas en Airtable

La base `SUPER GEEK ADM` (`appLkmz7I6vqJ2UXc`) contiene 47 tablas. Las relevantes al dominio comercial son las siguientes.

---

### 1.1 Cotizaciones

**ID de tabla:** `tblGgwjH64Pxq8Ev6`  
**Registros:** 24

**Campos:**

| Tipo | Campo |
|---|---|
| formula | Código Cotización |
| autoNumber | Consecutivo |
| singleLineText | Cliente Record ID |
| singleLineText | Cliente Nombre |
| phoneNumber | Cliente Teléfono |
| email | Cliente Email |
| singleLineText | Cliente Cédula |
| singleLineText | Producto Solicitado |
| singleSelect | Categoría |
| multilineText | Descripción del Requerimiento |
| singleSelect | Estado Cotización |
| checkbox | Requiere Instalación |
| checkbox | Equipo ya está en tienda |
| singleLineText | Orden Reparación ID |
| singleLineText | Orden Reparación Código |
| singleLineText | Item Pedido ID |
| currency | Total Cotizado |
| currency | Total Abonado |
| formula | Saldo Pendiente |
| singleLineText | Registrado Por |
| createdTime | Fecha Creación |
| lastModifiedTime | Última Actualización |
| multilineText | Observación Interna |
| multipleRecordLinks | Opciones de Cotización → Opciones de Cotización |
| multipleRecordLinks | Abonos de Cotización → Abonos de Cotización |
| multipleRecordLinks | Opción Elegida → Opciones de Cotización |
| multipleRecordLinks | Pedido Generado → Item |

**Estados posibles:** Pendiente, Buscando Opciones, Cotización Enviada, Esperando Respuesta, Aprobada, No Aprobada, No Disponible, Convertida en Pedido, Finalizada Sin Compra.

**Observación:** El campo `Item Pedido ID` es de tipo `singleLineText`, no un link real. El link real al pedido generado es el campo `Pedido Generado` (multipleRecordLinks → Item). Coexisten dos mecanismos para identificar el pedido resultante.

**Muestra (datos enmascarados):**

| Código | Producto | Estado | Total Cotizado | Abonado | Pedido Generado |
|---|---|---|---|---|---|
| COT-2026-000010 | Mainboard HP DC7600 | Convertida en Pedido | — | — | recWwzJXAJFvLgF68 |
| COT-2026-000012 | Pantalla Asus Vivobook | Esperando Respuesta | — | — | — |
| COT-2026-000018 | Tecla Lenovo | No Disponible | — | — | — |

---

### 1.2 Opciones de Cotización

**ID de tabla:** `tbldpEjnOqRZMEivL`  
**Registros:** aprox. 30+ (página de 100 sin offset, aprox. 30 visibles en la sesión de prueba)

**Campos:**

| Tipo | Campo |
|---|---|
| formula | Opción |
| multipleRecordLinks | Cotización → Cotizaciones |
| singleLineText | Nombre Opción |
| multilineText | Descripción |
| multilineText | Producto / Descripción |
| multipleAttachments | Fotos |
| multipleRecordLinks | Proveedor → Proveedores |
| url | URL Proveedor |
| currency | Costo Proveedor |
| currency | Flete Estimado |
| currency | Arancel / Impuestos |
| currency | Otros Costos |
| formula | Costo Real Total |
| currency | Precio Venta Cliente |
| formula | Ganancia Estimada |
| singleSelect | Estado Opción |
| checkbox | Seleccionada por Cliente |
| multilineText | Nota Interna |
| multilineText | Nota para Cliente |
| multipleRecordLinks | Item Asociado → Item |
| multipleRecordLinks | Cotizaciones → Cotizaciones |
| singleSelect | Tiempo Estimado |
| aiText | Revisión AI de Opción |

**Estados posibles:** Disponible, Ofrecida al Cliente, Seleccionada, Descartada, No Disponible.

**Observación:** Existen dos campos de texto descriptivo por opción: `Nombre Opción` (singleLineText) y `Producto / Descripción` (multilineText). El código usa principalmente `Producto / Descripción`. Asimismo, hay dos campos de link a Cotizaciones: `Cotización` y `Cotizaciones`. El código escribe en `Cotización` al crear, pero busca con `OR` en ambos. El campo `Item Asociado` es el link al registro Item generado al convertir.

**Muestra:**

| Opción fórmula | Descripción (truncada) | Estado | Precio Venta | Costo Proveedor |
|---|---|---|---|---|
| — - $65 | TECLADO LENOVO T460S CON POINTER SP | Disponible | $65 | — |
| — - $370 | Lenovo Thinkpad T14 Gen 1 14" AMD Ryzen 5 | Disponible | $370 | $231 |
| — - $140 | PANTALLA 15.6 LED SLIM 30 PINES IPS FHD | Disponible | $140 | — |

---

### 1.3 Abonos de Cotización

**ID de tabla:** `tblu42s1jk0pt329b`  
**Registros:** 4 (base nueva; 3 con estado Registrado, 1 Anulado)

**Campos:**

| Tipo | Campo |
|---|---|
| formula | Abono (etiqueta calculada) |
| multipleRecordLinks | Cotización → Cotizaciones |
| singleLineText | Item Pedido ID |
| singleLineText | Cliente Nombre |
| dateTime | Fecha de Abono |
| currency | Monto |
| singleSelect | Método de Pago |
| multipleAttachments | Comprobante |
| singleLineText | Número de Transacción |
| singleLineText | Registrado Por |
| singleSelect | Estado del Abono |
| multilineText | Observación |
| createdTime | Creado |
| singleLineText | Movimiento Financiero ID |
| singleLineText | Cuenta Destino |
| singleSelect | Estado Financiero |
| date | Fecha Sincronización Finanzas |
| singleLineText | Error Sincronización Finanzas |

**Observación:** `Item Pedido ID` y `Movimiento Financiero ID` son campos de texto plano, no links. En los 4 registros existentes, ambos están vacíos. El campo `Estado Financiero` puede tomar: Pendiente de registrar, Registrado en Finanzas, Error de sincronización, Anulado. Los 3 registros activos están en "Pendiente de registrar".

**Muestra (datos enmascarados):**

| Etiqueta | Monto | Método | Estado Abono | Estado Financiero |
|---|---|---|---|---|
| Cliente A — 2026-05-24 — $1 | $1 | Efectivo | Anulado | Anulado |
| Cliente B — 2026-05-13 — $180 | $180 | Efectivo | Registrado | Pendiente de registrar |
| Cliente C — 2026-06-24 — $240 | $240 | Transferencia bancaria | Registrado | Pendiente de registrar |

---

### 1.4 Item (registros con `Item Para = "Pedido"`)

**ID de tabla:** `tblApFDGCfGqHEhiF`  
**Registros totales con `Item Para = Pedido`:** aprox. 60+ (toda la tabla tiene cientos de registros; los pedidos con vínculo a cotización o snapshot de cliente son 3 confirmados).

Esta tabla es polivalente: almacena Stock, Pedidos, Repuestos, Uso Local y Cotización (valor heredado) en un mismo modelo, diferenciados por el campo `Item Para`. Los pedidos originados desde cotizaciones llevan los campos adicionales siguientes:

| Tipo | Campo | Uso |
|---|---|---|
| singleLineText | Cotización ID | Record ID de la cotización origen (texto, no link) |
| singleLineText | Cotización Código | Código humano (ej. COT-2026-000010) |
| singleLineText | Opción Cotización ID | Record ID de la opción elegida (texto, no link) |
| multipleRecordLinks | Cotizaciones | Link real a tabla Cotizaciones |
| multipleRecordLinks | Opciones de Cotización | Link real a tabla Opciones de Cotización |
| singleLineText | Cliente Record ID Reparaciones | Record ID del cliente (texto, no link) |
| singleLineText | Cliente Nombre Snapshot | Nombre del cliente en el momento de conversión |
| phoneNumber | Cliente Teléfono Snapshot | Teléfono del cliente en el momento de conversión |
| singleLineText | Cliente Email Snapshot | Email del cliente (si existía) |
| singleLineText | Cliente Cédula Snapshot | Cédula del cliente (si existía) |
| number | Pedido Año | Año del pedido (ej. 2026) |
| number | Pedido Consecutivo | Consecutivo dentro del año |
| formula | Código Pedido | `PED-{Año}-{Consecutivo padded 6}` |
| singleSelect | Estado Instalación | No requiere / Pendiente de crear orden / Orden creada / … |
| singleSelect | Estados Pedido | Estado logístico del pedido |

**Muestra (datos enmascarados):**

| Código Pedido | Item | Categoría | Cotización ID | Estado Instalación |
|---|---|---|---|---|
| PED-2026-000001 | Used HP Motherboard DC7600 | Repuesto | recGdifi2jNyTxbcJ | Pendiente de crear orden |
| PED-2026-000002 | (Pedido 2) | — | recusEqvV2ryB7SiK | — |
| PED-2026-000003 | (Pedido 3) | — | recp96EPGAmB3X3ro | — |

---

### 1.5 Proveedores

**ID de tabla:** `tblLFOlY2US1Diu1c`  
**Registros:** más de 3 (tiene offset)

Campos clave: `Nombre`, `Dirección` (singleSelect: USA/ECU/CHN), links a `Item` y a `Opciones de Cotización`. Los proveedores son compartidos por los módulos de Cotizaciones y de Pedidos (Item).

---

### 1.6 Clientes

**ID de tabla:** `tblReyBWhMDeHGwKy`  
**Registros:** más de 3 (tiene offset)

Campos relevantes: `Nombre`, `Cédula`, `Teléfono`, `Correo`, `Órdenes Relacionadas` (link → Órdenes de Reparación), `Número de Órdenes` (count). El campo `Cotizaciones` es `singleLineText` —no un link real—, y en todos los registros revisados está vacío. No existe un link directo entre Clientes y Cotizaciones en la base de datos.

---

### 1.7 Abonos por Orden

**ID de tabla:** `tblc9MCGvzcjcg6ki`  
**Registros:** más de 3 (tiene offset)

Tabla independiente, exclusiva del módulo de Órdenes de Reparación (Técnicos). Campos: `Monto`, `Método de pago`, `Comprobante`, `Movimiento Financiero ID` (texto, vacío en muestras), `Cuenta Destino`, `Estado Financiero`, `Orden de Reparación` (link → Órdenes de Reparación). No tiene ningún vínculo directo con Cotizaciones ni con la tabla Item.

---

## 2. Conexiones entre tablas

```
Clientes ──(Órdenes Relacionadas)──► Órdenes de Reparación
                                          │
                            (campos texto: Orden Reparación ID / Código)
                                          │
Cotizaciones ◄────────────────────────────┘
    │
    ├──(Opciones de Cotización link)──► Opciones de Cotización
    │       └──(Proveedor link)──────────────► Proveedores
    │       └──(Item Asociado link)─────────► Item
    │
    ├──(Abonos de Cotización link)────► Abonos de Cotización
    │
    └──(Pedido Generado link)─────────► Item  [registro con Item Para = "Pedido"]
            ├──(Cotizaciones link)──────────► Cotizaciones  [inverso]
            ├──(Opciones de Cotización link)► Opciones de Cotización  [inverso]
            └──(Proveedor link)─────────────► Proveedores

Órdenes de Reparación ──(Orden de Reparación link)──► Abonos por Orden
```

**Puntos de conexión clave:**

- La relación Cotizaciones ↔ Órdenes de Reparación se mantiene con campos de texto (`Orden Reparación ID`, `Orden Reparación Código` en Cotizaciones; `cotizacionId`, `cotizacionCodigo` en la tabla Órdenes). No hay un link de Airtable entre estas tablas.
- La relación Cotizaciones ↔ Clientes no existe como link en Airtable. Los datos del cliente se copian como snapshot de texto en la propia fila de Cotizaciones al momento de creación.
- Los Abonos de Cotización y los Abonos por Orden son tablas completamente separadas, sin vínculo entre sí.

---

## 3. Lógica de negocio

### 3.1 Flujo de creación de cotización

Función: `createCotizacion` en `lib/cotizaciones/airtable.ts` (línea 713).  
Ruta: `POST /api/cotizaciones` y `POST /api/tecnicos/ordenes/[id]/cotizacion`.

Al crear una cotización se escriben los siguientes campos:

- Snapshot del cliente: `Cliente Record ID`, `Cliente Nombre`, `Cliente Teléfono`, `Cliente Email`, `Cliente Cédula`.
- `Producto Solicitado`, `Categoría`, `Descripción del Requerimiento`.
- `Requiere Instalación`, `Equipo ya está en tienda`.
- `Registrado Por` (nombre del usuario de sesión).
- `Estado Cotización = "Pendiente"` (estado inicial fijo).
- Opcionalmente: `Observación Interna`, `Orden Reparación ID`, `Orden Reparación Código`.

No se escribe `Total Cotizado` ni `Total Abonado` en la creación; ambos quedan en `null`.

Cuando la creación proviene del módulo Técnicos (`app/api/tecnicos/ordenes/[id]/cotizacion/route.ts`), se realiza además una escritura en la orden de reparación (campos `cotizacionId` y `cotizacionCodigo`) para mantener el vínculo bidireccional. Si esa escritura falla, la cotización queda creada pero el vínculo en la orden queda pendiente; hay un mecanismo de reparación automática en el GET del mismo endpoint.

---

### 3.2 Opciones de cotización

Función: `createOpcionCotizacion` (`lib/cotizaciones/airtable.ts`, línea 877).  
Ruta: `POST /api/cotizaciones/[id]/opciones`.

Al crear una opción se escriben: `Cotización` (link al id de la cotización), `Proveedor` (link al id del proveedor), `Producto / Descripción`, `Costo Proveedor`, `Precio Venta Cliente`, `Estado Opción = "Disponible"`, `Opción Elegida = false`, y opcionalmente `URL Proveedor`, `Tiempo Estimado`, `Observaciones Internas`, `Nota para Cliente`.

El campo `Ganancia Estimada` es calculado por fórmula en Airtable, no lo escribe el código.

El `Total Cotizado` en la cotización no se actualiza al agregar opciones; solo se actualiza cuando el cliente selecciona una opción (ver §3.3).

**Comportamiento de doble campo descriptivo:** El código lee la descripción de la opción desde `Producto / Descripción`. El campo `Nombre Opción` (singleLineText) existe en el schema pero el código no lo usa ni lo escribe. El campo `Descripción` (multilineText, más antiguo) tampoco se usa en la ruta de creación actual.

---

### 3.3 Aprobación (selección de opción)

Función: `seleccionarOpcionCotizacion` (`lib/cotizaciones/airtable.ts`, línea 1140).  
Ruta: `POST /api/cotizaciones/[id]/opciones/[opcionId]/seleccionar`.

Al seleccionar una opción:

1. Todas las otras opciones que tuvieran estado `Seleccionada` o flag `Opción Elegida = true` se revierten a `Ofrecida al Cliente`.
2. La opción seleccionada recibe `Estado Opción = "Seleccionada"` y `Opción Elegida = true`.
3. La cotización recibe:
   - `Estado Cotización = "Aprobada"`.
   - `Total Cotizado = precioVentaCliente` de la opción elegida.
   - `Opción Elegida = [opcionId]` (link).

No se crea ningún registro derivado en esta etapa. La selección es solo un cambio de estado en registros existentes.

---

### 3.4 Conversión a pedido

Función: `convertirCotizacionEnPedido` (`lib/cotizaciones/airtable.ts`, línea 1383).  
Ruta: `POST /api/cotizaciones/[id]/convertir-pedido`.

**Un "Pedido" no es una tabla separada.** Es un registro en la tabla `Item` con `Item Para = "Pedido"`. No existe una tabla `Pedidos` en la base.

Condiciones que el código exige antes de convertir:

1. La cotización debe existir.
2. La cotización no debe tener ya un `Pedido Generado` ni un `Item Pedido ID` que apunte a un item.
3. `Estado Cotización` debe ser exactamente `"Aprobada"`.
4. Debe existir al menos una opción en la tabla `Opciones de Cotización` (no se acepta el modelo legacy desde Item) con `seleccionadaPorCliente = true`.
5. La opción seleccionada debe tener un `Proveedor` vinculado, y tanto la opción como el proveedor deben existir verificando sus record IDs contra Airtable.
6. Deben existir abonos con estado `"Registrado"` y suma de montos > 0.
7. Se requiere un `skuInterno` válido (validado via `lib/sku/sku-service`).

Al convertir, el código:

1. Calcula el siguiente consecutivo del año en la tabla Item (`getNextPedidoConsecutivo`) y genera el `Código Pedido` (`PED-{año}-{consecutivo}`).
2. Crea un registro en `Item` con todos los datos de la cotización y la opción elegida como snapshot: nombre del producto, categoría, precio, costo, proveedor, fotos, notas, datos del cliente, referencias a la cotización y a la opción.
3. Actualiza la opción elegida: `Estado Opción = "Seleccionada"`, `Item Asociado = [itemId]`.
4. Actualiza la cotización: `Estado Cotización = "Convertida en Pedido"`, `Opción Elegida = [opcionId]`, `Pedido Generado = [itemId]`.

El módulo de Pedidos (`lib/pedidos/airtable.ts`) lee esta misma tabla Item filtrando `{Item Para} = 'Pedido'` con la condición adicional de que tenga `Cotización ID` no vacío o `Cliente Nombre Snapshot` no vacío.

---

### 3.5 Abonos de cotización

Función: `createAbonoCotizacion` (`lib/cotizaciones/airtable.ts`, línea 1274).  
Ruta: `POST /api/cotizaciones/[id]/abonos`.

Un abono se registra en la tabla `Abonos de Cotización` con:
- Link a la cotización (`Cotización = [cotizacionId]`).
- `Cliente Nombre`, `Fecha de Abono`, `Monto`, `Método de Pago`, `Registrado Por`.
- `Estado del Abono = "Registrado"` y `Estado Financiero = "Pendiente de registrar"` (siempre en la creación).
- Opcionalmente: `Cuenta Destino`, `Número de Transacción`, `Observación`.
- `Item Pedido ID`: se rellena con el `itemPedidoId` de la cotización en el momento de crear el abono (campo texto, no link). Si la cotización ya fue convertida, el abono queda etiquetado con ese ID.

Tras crear el abono, el código recalcula manualmente `Total Abonado` en la cotización sumando todos los abonos con estado `"Registrado"` y escribe ese valor en la cotización (campo `Total Abonado`). `Saldo Pendiente` es una fórmula en Airtable: `Total Cotizado - Total Abonado`.

**Relación con Abonos por Orden:** Los abonos de cotización (`Abonos de Cotización`) y los abonos de reparación (`Abonos por Orden`) son tablas completamente independientes. No comparten ningún campo de vínculo entre sí. Un cliente que paga en la caja para una reparación registra el pago en `Abonos por Orden`; si la misma orden genera una cotización y el cliente abona para el pedido, ese pago va a `Abonos de Cotización`. No existe un mecanismo en el código que prevenga ni detecte superposición.

Anulación: `anularOEliminarAbonoCotizacion` (`lib/cotizaciones/airtable.ts`, línea 1333) cambia el estado del abono a `"Anulado"` (y `Estado Financiero = "Anulado"`) en vez de eliminar el registro. Luego recalcula `Total Abonado` excluyendo los anulados.

---

### 3.6 Automatizaciones y notificaciones

**Email:** No existe ninguna llamada a Resend ni a SMTP en el flujo de cotizaciones o pedidos. No se envían correos automáticos al crear una cotización, al aprobar una opción, al convertir a pedido ni al registrar un abono.

**WhatsApp:** `lib/cotizaciones/whatsapp-message.ts` contiene funciones para construir mensajes de WhatsApp (`buildOpcionWhatsAppMessage`, `buildTodasOpcionesWhatsAppMessage`, `buildWhatsAppUrl`). Generan una URL `wa.me/…` con el mensaje codificado. Estas funciones no disparan nada automáticamente; son utilidades que el frontend usa para abrir WhatsApp en el navegador del usuario. No hay webhooks ni llamadas a APIs de WhatsApp.

**Airtable automations:** No se detectan referencias a webhooks ni a triggers de Airtable en el código. Los campos `Movimiento Financiero ID` en ambas tablas de abonos están vacíos en todos los registros revisados, lo que indica que la integración con un sistema financiero externo no está implementada actualmente.

**Constancia PDF:** `lib/pedidos/constancia-pdf.ts` genera un PDF bajo demanda vía `GET /api/pedidos/[id]/constancia`. No es un disparador automático; el usuario debe solicitarlo manualmente.

---

## 4. Diagnóstico

### 4.1 Solapamientos de lógica

**Doble referencia cotización ↔ opción:** En la tabla Opciones de Cotización existen dos campos de link hacia Cotizaciones: `Cotización` y `Cotizaciones`. El código escribe en `Cotización` al crear opciones, y escribe en `Cotizaciones` solo al convertir a pedido. La búsqueda usa `OR` sobre ambos. Este patrón de dos campos hace que el propósito de cada uno sea ambiguo y genera código defensivo que consulta ambos en cada operación.

**Doble referencia opción en Item:** El código escribe tanto `Opción Cotización ID` (texto) como `Opciones de Cotización` (link) en el Item creado. Asimismo escribe tanto `Cotización ID` (texto) como `Cotizaciones` (link). Cada relación existe duplicada: una vez como texto plano (legacy o redundante) y una vez como link de Airtable.

**Doble campo descriptivo en Opciones:** Existen `Nombre Opción` (singleLineText) y `Producto / Descripción` (multilineText) para describir la opción. El código usa únicamente `Producto / Descripción`. `Nombre Opción` está en el schema pero nunca se lee ni escribe desde el código actual.

**Pedidos que no vienen de cotizaciones:** La tabla Item contiene registros con `Item Para = "Pedido"` que no tienen `Cotización ID` ni `Cliente Nombre Snapshot`. El módulo de pedidos los filtra con `OR(Cotización ID != '', Cliente Nombre Snapshot != '')`. Esto significa que hay pedidos en la tabla Item que el módulo de pedidos ignora por no cumplir ese filtro.

### 4.2 Riesgo de doble registro de pagos

Existe un riesgo concreto en el escenario en que una orden de reparación y una cotización coexisten para el mismo cliente y equipo. Un operador puede registrar un anticipo como abono de la orden en `Abonos por Orden` y también como abono de la cotización en `Abonos de Cotización`. Ambas tablas son independientes y el sistema no verifica superposición. El mismo monto podría quedar registrado dos veces con ningún mecanismo que lo detecte o advierta.

Adicionalmente, el campo `Item Pedido ID` (texto) en `Abonos de Cotización` permite etiquetar un abono con un ID de pedido, pero no hay lógica en el código que valide si ese pedido ya tiene abonos en otra tabla.

### 4.3 Campos y tablas de rol ambiguo o redundante

- **`Item Pedido ID` en Cotizaciones** (singleLineText): coexiste con `Pedido Generado` (link). El código escribe solo en `Pedido Generado`; el campo texto no se escribe en `convertirCotizacionEnPedido`. El mapeo `mapCotizacion` lo lee con `firstString(fields["Pedido Generado"]) || firstString(fields["Item Pedido ID"])`, lo que indica que `Item Pedido ID` es un campo heredado de un modelo anterior.
- **`Item Pedido ID` en Abonos de Cotización** (singleLineText): análogo al anterior. Se rellena en la creación del abono si la cotización ya tiene `itemPedidoId`, pero es texto no linkado.
- **`Movimiento Financiero ID` en Abonos de Cotización y en Abonos por Orden**: campo de texto vacío en todos los registros. Representa un punto de integración con un sistema financiero externo que no está conectado.
- **`Estado Financiero` en ambas tablas de abonos**: campo con ciclo de vida (Pendiente / Registrado en Finanzas / Error / Anulado) que corresponde a una sincronización con finanzas que tampoco está activa actualmente.
- **`Clientes.Cotizaciones`** (singleLineText): campo en la tabla Clientes que debería mostrar las cotizaciones del cliente, pero está vacío en todos los registros revisados y el código nunca lo escribe. No existe un link real entre Clientes y Cotizaciones.

### 4.4 Huecos en el modelo actual

- **Sin link directo Clientes ↔ Cotizaciones**: Los datos del cliente se copian como snapshot de texto en la cotización. No hay una consulta de "todas las cotizaciones de este cliente" posible desde la tabla Clientes sin buscar por texto. La relación inversa no existe en Airtable.
- **Sin notificaciones automáticas**: No hay emails ni mensajes automáticos al cliente en ningún paso del flujo. La única comunicación proactiva requiere que el operador genere el link de WhatsApp manualmente.
- **Sin sincronización financiera activa**: Los campos `Movimiento Financiero ID` y `Estado Financiero` existen en las dos tablas de abonos, pero la integración no está implementada. Todos los abonos quedan en "Pendiente de registrar" indefinidamente.
- **Sin trazabilidad de cambios de estado en cotizaciones**: No hay tabla equivalente a `Historial de Estados` (que sí existe para Órdenes de Reparación) para cotizaciones. Los cambios de estado se sobrescriben sin registro histórico.
- **Pedido sin módulo de listado para pedidos no originados en cotización**: El módulo de Pedidos solo muestra Items que vienen de cotización o tienen snapshot de cliente. Los Items con `Item Para = "Pedido"` sin cotización asociada son invisibles en el módulo.
- **Sin vínculo entre abono y pedido resultante a nivel de registro**: Un abono registrado antes de la conversión tiene `Item Pedido ID` vacío. Si el abono se crea después de la conversión, el campo se llena como texto. No existe un mecanismo que vincule retroactivamente los abonos previos al pedido generado.
