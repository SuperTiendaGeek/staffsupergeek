# Análisis: Item / Proveedores vs Shipping Items / Shipping Proveedores

> Fecha: 2026-06-28 — SOLO LECTURA  
> Contexto: el usuario confirmó que la intención de diseño es que las cotizaciones
> convertidas en pedido deben aterrizar en **Shipping Items**, y los proveedores
> deben consultarse de **Shipping Proveedores**. El uso actual de `Item` y
> `Proveedores` es un error de apunte, no un diseño querido.

---

## 1. Qué escribe `convertirCotizacionEnPedido` en la tabla `Item`

La función está en `lib/cotizaciones/airtable.ts:1383`. Al convertir una cotización
aprobada, crea un registro en la tabla cuyo nombre está en
`COTIZACIONES_TABLES.item` (actualmente `"Item"`) con los siguientes campos:

### Campos escritos (25 en total)

| Campo escrito en `Item` | Origen del valor | Tipo en `Item` |
|---|---|---|
| `Item Para` | literal `"Pedido"` | singleSelect |
| `Item` | nombre de la opción seleccionada (o producto solicitado) | singleLineText |
| `Categoria` | mapeado desde `Categoría` de la cotización | singleSelect |
| `Identificador` | SKU interno validado (ej. `REP-000001`) | singleLineText |
| `Pedido Año` | año actual | number |
| `Pedido Consecutivo` | MAX+1 dentro del año | number |
| `Precio Venta` | `precioVentaCliente` de la opción | currency |
| `Costo Proveedor` | `costoProveedor` de la opción | currency |
| `Proveedor` | record ID del proveedor de la opción (link a `Proveedores`) | multipleRecordLinks |
| `Fotos` | adjuntos de la opción, copiados por URL | multipleAttachments |
| `Cotización ID` | record ID de la cotización (texto) | singleLineText |
| `Cotización Código` | ej. `COT-2026-000010` | singleLineText |
| `Opción Cotización ID` | record ID de la opción elegida (texto) | singleLineText |
| `Requiere Instalación` | checkbox de la cotización | checkbox |
| `Estado Instalación` | `"Pendiente de crear orden"` o `"No requiere"` | singleSelect |
| `Cliente Record ID Reparaciones` | record ID del cliente (condicional) | singleLineText |
| `Cliente Nombre Snapshot` | nombre del cliente al momento de conversión (condicional) | singleLineText |
| `Cliente Teléfono Snapshot` | teléfono snapshot (condicional) | phoneNumber |
| `Cliente Email Snapshot` | email snapshot (condicional) | singleLineText |
| `Cliente Cédula Snapshot` | cédula snapshot (condicional) | singleLineText |
| `Nota Pública` | nota para cliente de la opción (condicional) | multilineText |
| `Nota Interna` | nota interna de la opción (condicional) | multilineText |
| `Cotizaciones` | link al registro de cotización (condicional si el campo existe) | multipleRecordLinks |
| `Opciones de Cotización` | link al registro de opción elegida (condicional) | multipleRecordLinks |
| `SKU Proveedor` | SKU del proveedor (condicional si se proporcionó) | singleLineText |

Los campos marcados como condicionales se escriben solo si el campo existe en la
tabla destino (verificado en tiempo de ejecución con `getAirtableTableFields`) o si
el valor no está vacío.

Adicionalmente, tras crear el Item, la función actualiza:
- La **opción elegida** (`Opciones de Cotización`): estado → `"Seleccionada"` y link
  al Item creado.
- La **cotización** (`Cotizaciones`): estado → `"Convertida en Pedido"`,
  `Opción Elegida` → link al ID de la opción, `Pedido Generado` → link al Item.

También lee la tabla de proveedores para validar que el record ID existe en
`COTIZACIONES_TABLES.proveedores` (actualmente `"Proveedores"`) antes de crear el
Item (línea 1435).

---

## 2. ¿Los mismos 25 campos existen en `Shipping Items`?

`Shipping Items` tiene 132 campos. De los 25 campos que el código intenta escribir,
**solo 1 coincide por nombre exacto**:

| Campo | ¿Existe en Shipping Items? | Campo equivalente (si hay) |
|---|---|---|
| `Item Para` | ❌ | No existe discriminador de tipo en Shipping Items |
| `Item` | ❌ | `Nombre del item` (diferente nombre) |
| `Categoria` | ❌ | Posiblemente `Categoría` (con acento; no confirmado) |
| `Identificador` | ❌ | `SKU interno` (diferente nombre) |
| `Pedido Año` | ❌ | Sin equivalente |
| `Pedido Consecutivo` | ❌ | Sin equivalente |
| `Precio Venta` | ❌ | `Precio venta sugerido` / `Precio venta final` (hay dos) |
| `Costo Proveedor` | ❌ | `Costo proveedor` (diferente casing) |
| `Proveedor` | ❌ | `Proveedor de compra` (link a `Shipping Proveedores`, no a `Proveedores`) |
| `Fotos` | ✅ | `Fotos` (mismo nombre y tipo `multipleAttachments`) |
| `Cotización ID` | ❌ | Sin equivalente |
| `Cotización Código` | ❌ | Sin equivalente |
| `Opción Cotización ID` | ❌ | Sin equivalente |
| `Requiere Instalación` | ❌ | Sin equivalente |
| `Estado Instalación` | ❌ | Sin equivalente |
| `Cliente Record ID Reparaciones` | ❌ | Sin equivalente |
| `Cliente Nombre Snapshot` | ❌ | Sin equivalente |
| `Cliente Teléfono Snapshot` | ❌ | Sin equivalente |
| `Cliente Email Snapshot` | ❌ | Sin equivalente |
| `Cliente Cédula Snapshot` | ❌ | Sin equivalente |
| `Nota Pública` | ❌ | Sin equivalente directo |
| `Nota Interna` | ❌ | Sin equivalente directo |
| `Cotizaciones` | ❌ | Sin equivalente |
| `Opciones de Cotización` | ❌ | Sin equivalente |
| `SKU Proveedor` | ❌ | `SKU proveedor` (diferente casing) |
| `Código Pedido` | ❌ | Sin equivalente (Shipping Items no tiene numeración PED-XXXX) |

Además, el campo `Proveedor` en `Item` es un link a la tabla `Proveedores`. Su
equivalente funcional en Shipping Items (`Proveedor de compra`) apunta a
`Shipping Proveedores`, que son record IDs completamente distintos. Un link
simplemente redirigido rompería todas las referencias existentes.

**Conclusión:** redirigir a `Shipping Items` sin adaptar el código equivale a intentar
escribir contra una tabla con un esquema diferente en 24 de los 25 campos. No es un
cambio de dos líneas — requiere remapear cada campo, redefinir los links de proveedor,
y decidir cómo manejar los campos sin equivalente (ciclo de pedido, snapshots de
cliente, instalación).

---

## 3. Qué hay en la tabla `Item` hoy (162 registros)

| `Item Para` | Cantidad |
|---|---|
| `Stock` | 153 |
| `Pedido` | 8 |
| `Repuesto` | 1 |
| **Total** | **162** |

### Los 8 registros con `Item Para = "Pedido"`

Solo **1** proviene del flujo de cotizaciones con datos completos:

| Código Pedido | Item | Cotización ID | Cliente Snapshot | Estado Instalación |
|---|---|---|---|---|
| `PED-2026-000001` | Used & Tested HP DC7600 Motherboard | `recGdifi2jNyTxbcJ` | sí (enmascarado) | Pendiente de crear orden |

Los 7 restantes **no tienen `Código Pedido`, ni `Cotización ID`, ni snapshots de
cliente**. Solo tienen `Item Para = "Pedido"` y un nombre de producto, lo que sugiere
que son registros de prueba o datos cargados manualmente antes de que existiera el
flujo de cotizaciones.

Los 153 registros de Stock son artículos del catálogo de equipos y repuestos (laptops,
baterías, etc.) con SKU numérico. No tienen nada que ver con el flujo de pedidos de
cliente.

---

## 4. Proveedores legacy (7) vs Shipping Proveedores (19)

### Tabla `Proveedores` (legacy, 7 registros)

| Record ID | Nombre | Dirección |
|---|---|---|
| `rec0EOISxjI08QWkQ` | Charles | USA |
| `rec8RnvQ7KcpAUzHk` | eBay | USA |
| `recMKJBDVJFxJnz1R` | DTC | ECU |
| `recPcMYidLCXyhRK8` | Repuestos Laptop | ECU |
| `recdC7wJYJpZNMrSJ` | ML | ECU |
| `recgeOwikiiSkNQNt` | Roberto | USA |
| `recx5T5LpgpNa2GKb` | Florida | USA |

### Tabla `Shipping Proveedores` (activa, 19 registros)

Esquema completamente diferente: `Nombre proveedor`, métodos de pago, capacidades
logísticas, configuración de notificaciones, logo, etc. Ninguno tiene el campo
`Legacy Proveedor ID` relleno (todos vacíos).

### Comparación por nombre

| Estado | Nombres |
|---|---|
| **En ambas tablas** | eBay, DTC, Roberto |
| **Solo en legacy (`Proveedores`)** | Charles, ML, Repuestos Laptop, Florida |
| **Solo en Shipping** | Amazon, Amazon Logistics, DHL, Electronicfirst, FedEx, G2A, K4G, Laarbox, Mercado Libre, Servientrega, Tramaco, USPS, UPS, 17TRACK, 3R Technology |

**Los 4 proveedores que están solo en la tabla legacy** (Charles, ML, Repuestos
Laptop, Florida) son los que actualmente puede usar el módulo de cotizaciones al
crear opciones. Si se redirige a `Shipping Proveedores`, estas opciones de cotización
perderían su proveedor (el record ID de la tabla legacy no existe en la otra).

El único pedido real (`PED-2026-000001`) tiene `Proveedor` vinculado a un record en
la tabla legacy. Si se borra esa tabla, ese registro de Item queda con un link roto.

---

## 5. Módulos que tendrían que cambiar juntos

Si se redirige el destino de cotizaciones a `Shipping Items` y los proveedores a
`Shipping Proveedores`, los módulos afectados son:

| Módulo | Archivo | Qué debe cambiar |
|---|---|---|
| cotizaciones | `lib/cotizaciones/airtable.ts:43-50` | `COTIZACIONES_TABLES.item` → `"Shipping Items"`, `COTIZACIONES_TABLES.proveedores` → `"Shipping Proveedores"` |
| cotizaciones | `lib/cotizaciones/airtable.ts:1473-1552` | Todos los nombres de campo del objeto `fields` (24 de 25 remapeados) |
| cotizaciones | `lib/cotizaciones/airtable.ts:1435` | La validación de proveedor pasa a `Shipping Proveedores` |
| pedidos | `lib/pedidos/airtable.ts:35-37` | `ITEM_TABLE` → `"Shipping Items"`, `PROVEEDORES_TABLE` → `"Shipping Proveedores"` |
| pedidos | `lib/pedidos/airtable.ts:210-260` | `mapPedido` lee campos de `Item` — todos los nombres deben remapearse |
| pedidos | `lib/pedidos/airtable.ts:339-358` | `fetchPedidos` filtra por `{Item Para} = 'Pedido'` — este campo no existe en Shipping Items; necesita nuevo criterio de filtrado |
| sku | `lib/sku/sku-service.ts:23,56` | `ITEM_TABLE` → `"Shipping Items"` y verificar que los campos de SKU coinciden |

Los tres módulos comparten la misma tabla de destino, por lo que deben migrarse
juntos. Cambiar solo cotizaciones y no pedidos crearía una inconsistencia en la que
el acto de crear un pedido escribe en Shipping Items pero el módulo que los lista no
lo vería.

---

## 6. Estado de los datos existentes (qué migrar)

Si se hace el cambio de tabla, los datos actuales en `Item` quedan huérfanos:

- **1 pedido real** (`PED-2026-000001`) con cotización y cliente vinculados: necesita
  migrarse manualmente a `Shipping Items` con campo remapeado, y el link al proveedor
  necesita resolverse contra el record ID equivalente en `Shipping Proveedores`.
- **7 pedidos sin datos de cotización**: candidatos a descartar o migrar manualmente.
- **153 registros de Stock y 1 de Repuesto**: no les aplica el cambio, pero al borrar
  la tabla `Item` desaparecerían junto con los pedidos si no se migran antes.
