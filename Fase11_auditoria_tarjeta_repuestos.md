# Fase 11 — Auditoría de la tarjeta de repuestos de la orden (solo lectura)

Fecha de la auditoría: 2026-07-05. Repo: `staffsupergeek`, rama `feat/tecnicos-abonos-nuevos`, sobre el estado posterior al commit `3824df8` (fase 10, abonos en tabla `Abonos` compartida).

Todos los datos de Airtable citados en este documento se obtuvieron en vivo mediante scripts Node de solo lectura (GET) ejecutados desde el scratchpad de la sesión, usando la Metadata API (`GET /v0/meta/bases/{baseId}/tables`) y la API normal de registros. No se escribió, modificó ni borró ningún registro. No se dejaron scripts en el repo.

---

## 1. Resumen ejecutivo

Hoy la tarjeta de repuestos de la orden lee de la tabla Airtable **"Repuestos por Orden"**, un renglón manual por línea (nombre, cantidad, precio cliente, costo proveedor) que el técnico crea eligiendo un ítem del **"Catálogo Repuestos"** (un catálogo estático de nombres/precios sugeridos, sin relación con inventario real). El total que ve el técnico en esa tarjeta y el total que aparece en el resumen financiero de la orden ("Costo Total Repuestos NV") son, en realidad, **el mismo dato calculado dos veces con la misma fórmula** (rollup de Airtable por un lado, `reduce()` en React por otro) — no hay una única fuente de verdad, hay dos cálculos que hoy coinciden por casualidad. El saldo de la orden ("Saldo NV") es una fórmula de Airtable que resta ese total del "Total Abonado NV", que a su vez es un rollup de la tabla nueva **Abonos** filtrado únicamente por el campo "Aplicado a: Orden". El módulo de Operaciones vive en la misma base y tiene su propio circuito paralelo: "Operación Comercial" → "Abonos" (filtrado por "Aplicado a: Operación") → "Saldo Pendiente". Ambos circuitos comparten la tabla `Abonos` pero **cada uno solo ve la mitad de los abonos** (los que apuntan a su propio lado), por eso hoy no existe ninguna pantalla que muestre la cuenta unificada. El repuesto físico real (con su costo/precio de compra) vive en **Shipping Items**, una tabla completamente distinta de "Repuestos por Orden", enlazada a la Operación pero no a la Orden ni a los renglones de repuesto de la orden — de ahí que el monto que ve el técnico ($205, capturado a mano el 2026-06-17) y el monto real de la operación/ítem ($240, fijado después) puedan divergir sin que nada lo detecte ni lo reconcilie.

---

## 2. Trazado del caso OP-023 / OR331 (datos reales, en vivo)

Nota: el ID visible de la orden no es literalmente "OR331" sino **`OR000331`** (campo fórmula `ID` = `"OR" & RIGHT("000000" & {Autonumber}, 6)`, tabla `Órdenes de Reparación`, `Autonumber` = 331). El código de la operación tampoco es literalmente "OP-023" sino **`OP-2026-000023`** (campo fórmula `Código Operación` = `"OP-" & AÑO(CREATED_TIME()) & "-" & {Consecutivo}` con `Consecutivo` = 23, tipo `autoNumber`, tabla `Operación Comercial`). Ambos se localizaron siguiendo el link bidireccional Orden↔Operación, no adivinando el código.

Registros reales:
- Orden: `Órdenes de Reparación` record `recI1f7k5wg0Cptpj` (ID `OR000331`)
- Operación: `Operación Comercial` record `recZGb6CZpoSXskmA` (`OP-2026-000023`)
- Repuesto por Orden: record `recLCbibOAaAev8iJ` (creado 2026-06-17)
- Servicio por Orden: record `rec8auW6QXTkHyIGP`
- Shipping Item: record `recLb22wkm8EG9mfg`
- Abono lado Orden: record `recRvhN4pSMKgL7Nl` (`ID Abono` 147, creado hoy 2026-07-05T14:22)
- Abono lado Operación: record `recVit8F2l3cDToSN` (`ID Abono` 142, creado 2026-06-24T16:24)

### Lo que muestra HOY la pantalla de la orden (OR000331)

| Cifra mostrada | Valor | Origen exacto |
|---|---|---|
| Repuestos (tarjeta "Repuestos usados", "Total cliente") | **$205** | `reduce()` client-side sobre `orden.repuestosPorOrden`, `app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx:2702-2709`: suma `subtotalCliente` (o `cantidad*precioCliente`) de cada línea. Con una sola línea: `Cantidad=1 × Precio cliente real=205 = 205`. |
| Repuestos (resumen financiero, campo "Repuestos") | **$205** | Campo Airtable `Órdenes de Reparación`.`Costo Total Repuestos NV`, tipo **rollup** sobre el link "Repuestos por Orden", que suma el campo fórmula `Repuestos por Orden`.`Subtotal cliente` (`Cantidad × Precio cliente real`) de cada línea vinculada. Leído en `lib/tecnicos/airtable/index.ts:1541` (`pickNumberField(f, ["Costo Total Repuestos NV"])`) y pintado en `OrdenDetalleClient.tsx:3510`. |
| Servicios | $35 | `Órdenes de Reparación`.`Costo Total Servicios NV` (rollup sobre `Servicios por Orden`.`Costo real`). Un solo renglón: "Instalación Motherboard iMac" = $35. |
| Total a Pagar NV | **$240** | Campo fórmula en Airtable: `{Costo Total Servicios NV} + {Costo Total Repuestos NV} + {Total Productos Digitales}` = 35 + 205 + 0 = 240. |
| Total Abonado NV | **$100** | Rollup sobre el link `Abonos (Operación)` (nombre de campo confuso — ver sección 4.9), que en realidad es el **inverso de `Abonos`.`Aplicado a: Orden`**. Solo hay un abono vinculado por ese campo a esta orden: el registro `recRvhN4pSMKgL7Nl`, Monto=100, creado hoy. El abono de $240 registrado del lado de la Operación **no** aparece aquí porque no tiene el link `Aplicado a: Orden` poblado (ver por qué, más abajo). |
| Saldo NV ("faltan $140") | **$140** | Fórmula Airtable: `MAX(0, {Total a Pagar NV} - {Total Abonado NV})` = MAX(0, 240-100) = 140. |

### Lo que muestra HOY la pantalla de la operación (OP-2026-000023)

| Cifra | Valor | Origen |
|---|---|---|
| Total Cotizado | $240 | Campo directo (currency) en `Operación Comercial`, fijado manualmente/por la opción elegida. |
| Total Abonado | **$240** | Rollup sobre el link `Abonos` de la Operación (inverso de `Abonos`.`Aplicado a: Operación`). Un solo abono: `recVit8F2l3cDToSN`, Monto=240, Método=Transferencia, creado 2026-06-24. El abono de $100 del lado Orden **no** aparece aquí (no tiene `Aplicado a: Operación` poblado). |
| Saldo Pendiente | $0 ("Pagado") | Fórmula `{Total Cotizado} - {Total Abonado}` = 240-240 = 0. Además, `components/operaciones/OperacionDetalleClient.tsx:478-481` **recalcula** `saldoReal`/`isFullyPaid` en el cliente filtrando abonos con `estadoAbono !== "Anulado"` — no confía puramente en el rollup para esta parte (ver riesgo en 6). |

### Por qué $205 (orden) ≠ $240 (operación) — la causa raíz

Son **dos registros independientes que describen el mismo repuesto físico, capturados en dos flujos distintos, sin ningún vínculo entre ellos**:

1. `Repuestos por Orden` record `recLCbibOAaAev8iJ`, creado 2026-06-17: `Nombre del repuesto snapshot o copiado` = "Motherboard Apple iMac Mid 2017 21.5\" A1418 i5-7400 + Fuente de energía", `Precio cliente real` = **205**, `Costo proveedor real` = 205, vinculado a `Catálogo Repuestos` (record `recSpKTF7FCirFC4w`). Este es el estimado que el técnico cotizó a mano (ver el texto libre en `Órdenes de Reparación`.`Detalle Rollup`: *"...Motherboard...+ Fuente de energía $205... Instalación $35... Total del servicio $240..."*).
2. `Shipping Items` record `recLb22wkm8EG9mfg` ("Apple iMac Mid-2017 21.5\" Motherboard A1418..."), con `Costo proveedor` = 79, `Precio venta final` = **240**, vinculado a la Opción elegida y a la Operación Comercial. Este es el precio real de venta que terminó fijando la Operación (el `Costo Proveedor` real de compra en eBay resultó ser 79, muy por debajo del estimado inicial, dejando una `Ganancia Estimada` de 161 registrada en `Opciones`.`Ganancia Estimada`).

No existe ningún campo, fórmula ni proceso de código que sincronice `Repuestos por Orden.Precio cliente real` con `Shipping Items.Precio venta final` (ni con `Operación Comercial.Total Cotizado`). El renglón de $205 quedó "congelado" en la fecha en que se creó y nunca se actualizó cuando la operación cerró en $240.

### La cuenta unificada real (recalculada a mano con los datos anteriores)

- Repuesto real (operación/ítem): **$240**
- Servicio (orden): **$35**
- **Total real: $275**
- Abonado lado Orden: $100 + Abonado lado Operación: $240 = **Total abonado real: $340**
- **Sobrepago real: $340 − $275 = $65**

Esto reproduce exactamente el caso de aceptación descrito en el brief. Ninguna pantalla actual (ni la de la orden, ni la de la operación) calcula ni muestra estos $275 / $340 / $65 — cada una solo ve su propia mitad.

### Por qué el abono de $100 (orden) no quedó también enlazado a la Operación

`createAbonoPorOrden` (`lib/tecnicos/airtable/index.ts:2251-2266`) sí contempla el caso: lee `ordenRecord.fields["Operaciones Comerciales"]` y, si existe, agrega `"Aplicado a: Operación": [operacionId]` al crear el abono. Sin embargo, el registro real `recRvhN4pSMKgL7Nl` (creado 2026-07-05T14:22:06Z) solo tiene `Aplicado a: Orden`. La operación (`recZGb6CZpoSXskmA`) reporta `Última Actualización` = 2026-07-05T15:29:43Z, **más tarde** que la creación del abono. Es decir, el vínculo Orden↔Operación (`Operaciones Comerciales` en la orden) no existía todavía en el momento exacto en que se registró ese abono; por diseño, `createAbonoPorOrden` solo enlaza a la Operación si el vínculo Orden↔Operación ya existe *en ese instante* — no hay ningún proceso que re-vincule abonos anteriores cuando la orden se asocia a una operación después. Esto es evidencia directa (no hipotética) del hueco de reconciliación que describe el brief.

---

## 3. Mapa de código

### A1. Componentes/archivos de la tarjeta de repuestos de la orden

- Página: `app/tecnicos/ordenes/[id]/page.tsx` — Server Component vacío que solo monta `StaffAppShell` + `OrdenDetalleClient` (no hace fetch server-side).
- Componente principal (client, ~3600 líneas): `app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx`.
  - Tipo local `RepuestoItem` (repuesto ya guardado en la orden): líneas 30-39.
  - Tipo local `CatalogoRepuestoItem` (ítem del catálogo, usado en el buscador): líneas 73-82.
  - Tarjeta "Repuestos usados": bloque `2682-2960` aprox. Total mostrado ("Total cliente"): `2698-2712`. Buscador/selector de catálogo: `2715-2872`. Listado de líneas + eliminar: `2874-2960`.
  - Carga del catálogo para el buscador: `loadCatalogoRepuestos` (línea 1073, llama a `GET /api/tecnicos/catalogo/repuestos`).
  - Alta de un repuesto en la orden: `handleGuardarRepuesto` (línea 1226, llama a `POST /api/tecnicos/ordenes/{id}/repuestos`), luego `refreshOrdenDetalleFinanzas()` (línea 855: refetch inmediato + un segundo refetch tras 450 ms — workaround explícito porque el rollup de Airtable no siempre está consistente al instante).
  - Eliminar un repuesto: llamada `DELETE /api/tecnicos/repuestos-por-orden/{repuestoPorOrdenId}` (línea 1403).
  - Resumen financiero (Total a pagar / Total abonado / Repuestos / Servicios / Saldo): bloque `3466-3527`, todos leídos directo de `orden.*NV` (props que vienen del backend), **sin recomputar nada en cliente** (a diferencia de Operaciones, ver 6).
- Componente legado/oculto relacionado: `components/tecnicos/OrdenCotizacionCard.tsx`. El export default (línea 22) es un **stub que no renderiza nada**; la implementación real `OrdenCotizacionCardImpl` (línea 26) existe en el archivo pero está deshabilitada. Comentario explícito en el código (líneas 20-21): *"Oculto temporalmente: el vínculo Orden↔Cotizaciones se reemplazará por Orden↔Operación Comercial en la fase de integración técnicos-operaciones."* Es decir, ya está confirmado como vestigio muerto, no activo hoy.

### A2. Endpoints/funciones que lee/escribe la tarjeta

| Acción UI | Endpoint | Función servidor | Firma |
|---|---|---|---|
| Cargar orden completa (incluye repuestos, servicios, abonos) | `GET /api/tecnicos/ordenes/[id]` (`app/api/tecnicos/ordenes/[id]/route.ts:8-30`) | `fetchOrdenById(recordId: string): Promise<OrdenDetalle \| null>` — `lib/tecnicos/airtable/index.ts:1473` | Sin guard de sesión (`requireTecnicosSession` no se llama en este GET). |
| Buscar en catálogo (composer) | `GET /api/tecnicos/catalogo/repuestos` (`app/api/tecnicos/catalogo/repuestos/route.ts:6-15`) | `fetchCatalogoRepuestos(client?, limit?)` — `index.ts:1834`, delega en `fetchCatalogoRepuestosGestion({activo:"activos"})` | Sin guard de sesión. |
| Crear ítem de catálogo al vuelo ("+ Crear repuesto nuevo") | `POST /api/tecnicos/catalogo/repuestos` (mismo archivo, líneas 28-56) | `createCatalogoRepuesto({nombre, costoBase, precioSugeridoCliente, proveedorHabitual})` — `index.ts:1997` | Sin guard de sesión. |
| Agregar renglón de repuesto a la orden | `POST /api/tecnicos/ordenes/[id]/repuestos` (`app/api/tecnicos/ordenes/[id]/repuestos/route.ts:19-80`) | `createRepuestoPorOrden({ordenRecordId, catalogoRepuestoId, nombreSnapshot, cantidad, precioCliente, costoProveedor?, proveedor?, observacion?})` — `index.ts:2139` | Sin guard de sesión. |
| Eliminar renglón de repuesto | `DELETE /api/tecnicos/repuestos-por-orden/[id]` (`app/api/tecnicos/repuestos-por-orden/[id]/route.ts:8-26`) | `deleteRepuestoPorOrdenById({repuestoPorOrdenRecordId})` — `index.ts:2849`, hace **DELETE físico** vía `deleteRecordById` — `index.ts:2827` | Sin guard de sesión. |
| CRUD del catálogo (pantalla dedicada `/tecnicos/catalogo-repuestos`, distinta del composer) | `GET/POST /api/tecnicos/catalogo-repuestos` y `/[id]` | `fetchCatalogoRepuestosGestion`, `createCatalogoRepuesto`, `updateCatalogoRepuesto` (`index.ts:2039`) | **Sí** tiene `requireTecnicosSession` (`app/api/tecnicos/catalogo-repuestos/route.ts:27,43` y análogo en `[id]/route.ts`). |

Nota de acoplamiento (no pedida explícitamente pero relevante para el riesgo de seguridad al tocar esta área): existen **dos endpoints casi duplicados** para el catálogo de repuestos — `/api/tecnicos/catalogo-repuestos` (protegido) y `/api/tecnicos/catalogo/repuestos` (sin protección, es el que usa el composer de la orden). Las rutas de creación/eliminación de renglones de la orden (`/api/tecnicos/ordenes/[id]/repuestos`, `/api/tecnicos/repuestos-por-orden/[id]`) tampoco tienen `requireTecnicosSession`, a diferencia de las rutas de abonos post-fase-10 que sí lo agregaron (`app/api/tecnicos/ordenes/[id]/abonos/route.ts:9-10`, `app/api/tecnicos/abonos-por-orden/[id]/route.ts`).

### A3. Dónde se calcula el total de repuestos y dónde se suma al total de la orden — duplicación

Hay **dos lugares que calculan el mismo total de repuestos con la misma fórmula**, sin que uno dependa del otro:

1. **Airtable (rollup)**: `Órdenes de Reparación`.`Costo Total Repuestos NV` — suma `Repuestos por Orden`.`Subtotal cliente` (que a su vez es una fórmula `Cantidad × Precio cliente real`, campo `Subtotal cliente` en `Repuestos por Orden`). Este es el valor que entra a `Total a Pagar NV` (fórmula `Costo Total Servicios NV + Costo Total Repuestos NV + Total Productos Digitales`) y de ahí a `Saldo NV`.
2. **React (client-side)**: `OrdenDetalleClient.tsx:2702-2709`, un `reduce()` sobre `orden.repuestosPorOrden` que replica exactamente la misma fórmula (`subtotalCliente` o `cantidad*precioCliente`) para pintar el número en la tarjeta.

Hoy coinciden porque ambos derivan del mismo dato fuente (`Repuestos por Orden`), pero son **dos cálculos independientes**: si alguna vez la fórmula de Airtable cambia (o si se agrega descuentos/impuestos en un solo lado), divergirían sin que nadie lo note. El "Total a Pagar NV" y "Saldo NV" son 100% Airtable (fórmulas), no hay cálculo de saldo en código del lado de técnicos.

Del lado de Operaciones sí hay una diferencia real de comportamiento (no solo redundancia): `components/operaciones/OperacionDetalleClient.tsx:478-481` calcula `totalAbonadoReal`/`saldoReal`/`isFullyPaid` **excluyendo abonos con `estadoAbono === "Anulado"`**, mientras que el número crudo `operacion.totalAbonado` (el rollup de Airtable, mostrado literalmente en la tira de totales, línea 784) **no excluye anulados** (ver riesgo 6.3).

### A4. Otros consumidores de los mismos datos de repuestos

Búsqueda exhaustiva (`grep` de `repuestosPorOrden`, `RepuestoPorOrden`, `Costo Total Repuestos`, `fetchRepuestosPorOrden`, `"Repuestos por Orden"` en todo `.ts`/`.tsx` del repo) — únicos archivos que tocan este dato:
- `types/tecnicos/index.ts` (tipos)
- `app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx` (la tarjeta)
- `app/api/tecnicos/repuestos-por-orden/[id]/route.ts`, `app/api/tecnicos/ordenes/[id]/repuestos/route.ts` (endpoints)
- `lib/tecnicos/airtable/index.ts`, `lib/tecnicos/config/airtable.ts` (backend)

**No hay ningún otro consumidor**: no aparece en `lib/tecnicos/pdf/generate.tsx` (ese PDF es solo para Productos Digitales — no referencia repuestos en absoluto), no aparece en las páginas de impresión (`app/tecnicos/ordenes/[id]/imprimir/ticket`, `/etiqueta`), no aparece en el generador de mensajes de WhatsApp (`app/api/tecnicos/historial/[id]/generar-mensaje/route.ts`), no hay módulo de "reportes" ni "facturación" que lo lea. Esto es una buena noticia para el rediseño: **cambiar la fuente de "Repuestos por Orden" a "Shipping Items" no rompe ningún consumidor adicional conocido**, más allá de la propia tarjeta y del rollup `Costo Total Repuestos NV` de la orden.

---

## 4. Mapa de datos (Airtable)

Todas las bases: se confirmó en vivo, vía Metadata API, que **todos los módulos relevantes (Técnicos, Operaciones, Shipping V2) leen y escriben sobre la MISMA base de Airtable** (`AIRTABLE_API_KEY` + `AIRTABLE_BASE_ID`, la base "SUPER GEEK ADM"). Esto contradice lo documentado en `CLAUDE.md` (que describe una base separada para técnicos vía `AIRTABLE_TECNICOS_TOKEN`/`AIRTABLE_TECNICOS_BASE_ID`): esas dos variables **no aparecen referenciadas en ningún archivo `.ts`/`.tsx` del repo** (`grep` sin resultados). El propio código lo documenta: `lib/tecnicos/config/airtable.ts:24-25` — *"Tras la migración a SUPER GEEK ADM, el módulo de técnicos lee/escribe en AIRTABLE_BASE_ID (ADM) usando AIRTABLE_API_KEY."* `lib/operaciones/airtable.ts:56-57` y `lib/shipping-v2/airtable.ts` usan las mismas dos variables. **La documentación de `CLAUDE.md` sobre "dos bases separadas" está desactualizada** — hoy es una sola base compartida, lo cual es justamente lo que permite que Órdenes, Operaciones, Abonos y Shipping Items convivan y se puedan enlazar entre sí (como de hecho ya ocurre).

### B5. Tabla "Repuestos por Orden" (`tblUVtr0ykaaSHTlM`)

| Campo | Tipo | Usado por el código (nombre exacto) |
|---|---|---|
| `Nombre del repuesto snapshot o copiado` | singleLineText | Sí — `mapRepuestoPorOrdenRecord`, `index.ts:438` |
| `Cantidad` | number | Sí — `index.ts:439` |
| `Precio cliente real` | currency | Sí — `index.ts:440` |
| `Costo proveedor real` | currency | Sí — `index.ts:442` |
| `Proveedor real` | singleLineText | Sí — `index.ts:443` |
| `Observación` | multilineText | Sí — `index.ts:444` |
| `Fecha de registro` | date | Sí — `index.ts:445`, y usado para ordenar (`compareByFechaRegistroAsc`, `index.ts:678`) |
| `Subtotal cliente` | **fórmula** `Cantidad × Precio cliente real` | Sí — `index.ts:441` (leído, no escrito) |
| `Subtotal costo` | fórmula `Cantidad × Costo proveedor real` | No lo lee el código (solo existe en Airtable) |
| `Resumen Repuesto Precio` | fórmula (texto para mostrar en rollups de la Orden) | No lo lee directamente el código de técnicos; sí lo consume el rollup `Resumen Repuestos por Orden` en `Órdenes de Reparación` |
| `Orden de Reparación` | link → `Órdenes de Reparación` | Sí — para vincular al crear (`index.ts:2160`) y para filtrar en `fetchRepuestosPorOrden` (ver 7) |
| `Repuesto del Catálogo` | link → `Catálogo Repuestos` | Sí — se popula al crear (`index.ts:2161`), pero **nunca se vuelve a leer** después (no hay lookup de vuelta al catálogo desde una línea ya guardada) |
| `_old_record_id` | singleLineText | No (campo de migración) |

### B6. Tabla "Catálogo Repuestos" (`tblXDbrjqhXLaaXCA`)

| Campo | Tipo | Usado por el código |
|---|---|---|
| `Nombre del repuesto` | singleLineText | Sí — `mapCatalogoRepuestoRecord`, `index.ts:507` |
| `Descripción corta` | multilineText | Sí — `index.ts:508` |
| `SKU o código interno` | singleLineText | Sí — `index.ts:509` |
| `Proveedor habitual` | singleLineText | Sí — `index.ts:510` |
| `Costo base` | currency | Sí — `index.ts:511` |
| `Precio sugerido al cliente` | currency | Sí — `index.ts:512` |
| `Activo` | checkbox | Sí — filtro activos/inactivos (`index.ts:513`, `1858-1861`) |
| `Fecha de creación` | date | Sí — `index.ts:514` |
| `Repuestos por Orden` | link inverso → `Repuestos por Orden` | No lo lee el código (es el inverso automático del link creado desde `Repuestos por Orden`) |
| `_old_record_id` | singleLineText | No |

Otros consumidores de "Catálogo Repuestos": solo la pantalla de administración `app/tecnicos/catalogo-repuestos/page.tsx` + `components/tecnicos/CatalogoCrudClient.tsx` (CRUD del catálogo) y el composer de la tarjeta de repuestos (buscador). Nada más en el repo lo referencia.

### B7. Relación Orden↔Repuestos hoy, y campos calculados dependientes

La relación es un **link directo bidireccional** Airtable: `Órdenes de Reparación`.`Repuestos por Orden` (multipleRecordLinks) ↔ `Repuestos por Orden`.`Orden de Reparación` (inverso, `inverseLinkFieldId` cruzados: `fldHHE3Qeu19a2u5N` / `fldkg73NuR889tllq`). Sin embargo, **el código NO usa el patrón recomendado** (leer el campo inverso de IDs y hacer fetch por `RECORD_ID()`): `fetchRepuestosPorOrden` (`lib/tecnicos/airtable/index.ts:1758-1772`) llama a `fetchAllTableRecords({tableName: "Repuestos por Orden"})` — **trae TODA la tabla completa** (paginando de a 100) y luego filtra en JavaScript por `toLinkedRecordIds(record.fields["Orden de Reparación"]).includes(recordId)` (línea 1768). Esto es un full-table-scan en cada carga de cada orden, y es exactamente el antipatrón que la tabla `Abonos` (post fase 10) corrigió: `fetchAbonosPorOrden` (`index.ts:1788-1804`) sí sigue el patrón correcto (lee `Abonos (Operación)` desde el registro de la Orden, y hace `fetchRecordsByIds` con `RECORD_ID()` OR). `fetchServiciosPorOrden` (`index.ts:1775-1789`) tiene el mismo antipatrón que repuestos.

Campos calculados en Airtable que dependen de esta relación: `Órdenes de Reparación`.`Costo Total Repuestos NV` (rollup SUM de `Subtotal cliente`) y `Resumen Repuestos por Orden` (rollup de texto).

### B8. Campos de "Órdenes de Reparación" que intervienen en el total y el saldo

| Campo | Tipo Airtable | Fórmula/fuente |
|---|---|---|
| `Costo Total Servicios NV` | rollup | SUM de `Servicios por Orden`.`Costo real` |
| `Costo Total Repuestos NV` | rollup | SUM de `Repuestos por Orden`.`Subtotal cliente` |
| `Total Productos Digitales` | rollup | SUM de `Productos Digitales`.`Precio Venta` |
| `Total a Pagar NV` | **fórmula** | `{Costo Total Servicios NV} + {Costo Total Repuestos NV} + {Total Productos Digitales}` |
| `Total Abonado NV` | rollup | SUM de `Abonos`.`Monto`, vía el link `Abonos (Operación)` en la Orden (= inverso de `Abonos`.`Aplicado a: Orden`) |
| `Saldo NV` | **fórmula** | `MAX(0, {Total a Pagar NV} - {Total Abonado NV})` |
| `Resumen General Presupuesto` | fórmula (texto) | Concatena los anteriores para mostrar en un solo string |

Ningún total ni saldo de la orden se calcula en código de técnicos — **todo (excepto la redundancia visual en la tarjeta de repuestos, ver A3) es fórmula/rollup de Airtable**, leído tal cual vía `pickNumberField` (`lib/tecnicos/airtable/index.ts:1540-1545`).

### C9. Cómo lee la orden sus abonos tras la fase 10

`fetchAbonosPorOrden(recordId)` (`lib/tecnicos/airtable/index.ts:1788-1804`):
1. Trae el registro de la Orden.
2. Lee el campo `Abonos (Operación)` de la Orden (array de record IDs) — **el nombre de este campo es engañoso**: pese a llamarse "(Operación)", es el campo en la tabla `Órdenes de Reparación` que recibe automáticamente el inverso del link `Abonos`.`Aplicado a: Orden` (confirmado en Metadata API: `recordLinkFieldId` de la rollup `Total Abonado NV` = `fldD3L8KIkrutYOSY`, que coincide con el `inverseLinkFieldId` publicado por `Abonos`.`Aplicado a: Orden`). El nombre parece haber quedado de una versión anterior del diseño de campos y no se corrigió.
3. Con esos IDs, hace `fetchRecordsByIds` sobre la tabla `Abonos` con `filterByFormula` `RECORD_ID()=... OR ...` (`index.ts:1806-1823`) — **este sí sigue el patrón recomendado** (nunca filtra por el campo de link directamente).
4. Ordena por `Fecha de Abono` descendente y mapea con `mapAbonoRecord`.

El campo Airtable `Total Abonado NV` de la Orden (rollup) suma el mismo conjunto de abonos (los vinculados vía `Aplicado a: Orden`), independientemente de si también están vinculados a una Operación.

### C10. Estructura actual de la tabla "Abonos" (`tbli03YnDxVsrnmZK`)

| Campo | Tipo |
|---|---|
| `Abono` | fórmula (texto resumen: cliente — fecha — monto) |
| `ID Abono` | number (consecutivo global, compartido entre técnicos y operaciones — ver `getMaxIdAbono()` en `lib/operaciones/airtable.ts:375` y su uso desde técnicos en `lib/tecnicos/airtable/index.ts:2258-2259`) |
| `Monto` | currency |
| `Fecha de Abono` | dateTime (zona `America/Guayaquil`) |
| `Estado del Abono` | singleSelect: `Registrado` / `Anulado` |
| `Comprobante` | multipleAttachments |
| `Número de Transacción` | singleLineText |
| `Cuenta Destino` | singleLineText |
| `Registrado Por` | singleLineText (texto libre, **no** es un link a Usuarios) |
| `Observación` | multilineText |
| `Aplicado a: Operación` | link → `Operación Comercial` |
| `Aplicado a: Orden` | link → `Órdenes de Reparación` |
| `Cliente Operación` / `Cliente Orden` | lookups de solo lectura |

**El abono es un registro atómico con dos links de "aplicado a" independientes que pueden estar poblados a la vez, uno solo, o (en teoría) ninguno**. No existe un campo de "monto aplicado por destino" — si un abono está vinculado a Orden Y Operación simultáneamente, se asume que el monto completo aplica a ambos (no hay partición). En la práctica observada hoy (caso OP-023/OR331), **ningún abono real tiene ambos links poblados a la vez** — cada uno de los dos abonos existentes solo apunta a un lado, lo cual es justamente la causa de que ninguna pantalla vea el cuadro completo (sección 2).

Quién escribe en esta tabla hoy:
- Desde técnicos: `createAbonoPorOrden` (`index.ts:2251` en adelante) — siempre pone `Aplicado a: Orden`; agrega `Aplicado a: Operación` **solo si**, en el momento de crear el abono, la Orden ya tiene un valor en `Operaciones Comerciales`.
- Desde operaciones: `crearAbono` en `lib/operaciones/airtable.ts:392` en adelante — siempre pone `Aplicado a: Operación`; agrega `Aplicado a: Orden` **solo si** el modal (`components/operaciones/RegistrarAbonoModal.tsx`) recibió un `ordenId` (prop `ordenId`, pasado por el padre según si la Operación ya tiene `Orden de Reparación` vinculada en ese momento).
- Anular (ambos lados): `PATCH {"Estado del Abono": "Anulado"}`, nunca DELETE físico. Del lado técnicos: `anularAbonoPorOrden` (`index.ts:2887` en adelante), expuesto vía `DELETE /api/tecnicos/abonos-por-orden/[id]` (verbo HTTP se mantiene por compatibilidad de cliente, pero el efecto real es un PATCH de estado, no un borrado — comentario explícito en el código, `app/api/tecnicos/abonos-por-orden/[id]/route.ts:9-10`).

**Riesgo confirmado con evidencia**: el rollup `Total Abonado NV` (Orden) y `Total Abonado` (Operación) son SUM simples sobre `Monto` sin excluir `Estado del Abono = "Anulado"` (la Metadata API no expone ninguna condición de filtro en la definición del rollup, y el propio frontend de Operaciones recalcula aparte para compensar — ver 6.3). Es decir, **anular un abono no lo saca del total mostrado en el lado de la Orden** (`OrdenDetalleClient.tsx` pinta `orden.totalAbonadoNV` tal cual, sin filtrar anulados en ningún punto del archivo — confirmado por grep, la única lógica de "Anulado" que existe ahí es puramente visual, para tachar la fila en el listado, líneas 3577-3591).

### C11. Link bidireccional Orden↔Operación

- `Operación Comercial`.`Orden de Reparación` (link) ↔ `Órdenes de Reparación`.`Operaciones Comerciales` (inverso).
- Se lee desde técnicos en `createAbonoPorOrden` (`index.ts:2254`: `toLinkedRecordIds(ordenRecord.fields?.["Operaciones Comerciales"])[0]`) para decidir si dual-enlazar el abono nuevo.
- Se lee/escribe desde operaciones en `lib/operaciones/airtable.ts` (líneas 52, 274, 646, 666 — campo `Orden de Reparación` en listados, detalle, vincular/desvincular orden vía `app/api/operaciones/[id]/orden/route.ts`).
- `OrdenCotizacionCardImpl` (componente hoy deshabilitado, ver A1) es un vestigio del modelo **anterior** (Orden↔Cotización, no Orden↔Operación) — el comentario en el propio archivo confirma que fue reemplazado por el modelo Orden↔Operación Comercial y quedó oculto, no borrado.

### C12. Tabla "Shipping Items" — campos relevantes hoy

Ya existen (confirmado vía Metadata API, tabla `tbliTKAI8dAWwr1nh`):
- `Categoría` (singleSelect, incluye la opción `"Repuesto"`) y `Tipo de item` (singleSelect, también incluye `"Repuesto"`).
- `Estado Item` (singleSelect con estados granulares: `Registrado`, `Pendiente de pago`, `Pagado`, `Pendiente de packing`, y más — a diferencia de `Repuestos por Orden`, que **no tiene ningún campo de estado**).
- `Precio venta sugerido`, `Precio venta final` (currency) — el precio real de venta al cliente.
- `Costo proveedor`, `Costo asignado por despiece`, `Costo total estimado`, `Costo total unidad` (fórmula) — costo real.
- `Disponible para venta`, `Reservado`, `Afecta inventario` (checkboxes).
- `Operación Comercial` (link) — vínculo directo al ítem desde la operación.
- `Opción origen` (link a `Opciones`).
- **No existe** ningún link directo `Shipping Items` → `Órdenes de Reparación` (solo llega ahí indirectamente vía `Operación Comercial` → `Orden de Reparación`).
- **No existe** ningún link directo `Shipping Items` → `Abonos` (los abonos se aplican a la Operación completa, no a un ítem específico dentro de ella — si una Operación tuviera varios ítems, hoy no hay forma de saber cuánto de los abonos corresponde a cada uno).
- **No existe** ningún campo tipo "monto ya cobrado / pendiente de cobrar en la orden" a nivel de ítem — ese desglose solo existe a nivel de Operación completa (`Total Cotizado`/`Total Abonado`/`Saldo Pendiente`).

Lo que falta crear (constatación de hecho, sin proponer solución): algún mecanismo para (a) distinguir a nivel de ítem si es "de stock" vs "de pedido" cara al cobro en la orden, (b) trazar cuánto de un abono aplica a un ítem en particular cuando hay varios en una misma operación, y (c) un link (directo o vía Operación) entre el ítem y la Orden que reemplace la dependencia hoy exclusiva en el snapshot manual de `Repuestos por Orden`.

### Diagrama ASCII de relaciones (estado actual)

```
Clientes ──┐
           │(link)
           ▼
Órdenes de Reparación ──────(link)────────► Historial de Estados
   │  │  │   ▲
   │  │  │   │ Operaciones Comerciales (inverso)
   │  │  │   │
   │  │  └───┴────────────────(link)───────────► Operación Comercial
   │  │                                              │   │    │
   │  │(link)                                         │   │    │(link)
   │  ▼                                               │   │    ▼
   │ Repuestos por Orden ──(link)──► Catálogo Repuestos   │  Opciones ──(link)──► Shipping Proveedores
   │  (Subtotal cliente = Cantidad×Precio cliente real)   │   │
   │        rollup ↑                                      │   │(link "Artículo físico"/"Opción origen")
   │  Costo Total Repuestos NV ◄──────────────────────────┘   ▼
   │                                                      Shipping Items
   │(link)                                                (Categoría=Repuesto, Estado Item,
   ▼                                                        Precio venta final, Costo proveedor,
Servicios por Orden ──(link)──► Catálogo Servicios          Reservado, Disponible para venta)
     rollup ↑
  Costo Total Servicios NV

Órdenes de Reparación.Abonos (Operación) ◄──inverso──┐
                                                       │
                                                    Abonos ────(link "Aplicado a: Operación")────► Operación Comercial
                                                       │                                                │
                                              (link "Aplicado a: Orden")                     rollup "Total Abonado"
                                                       │                                                │
                                              Órdenes de Reparación                            Saldo Pendiente (fórmula)
                                              rollup "Total Abonado NV"
                                              Saldo NV (fórmula)
```

Punto crítico visible en el diagrama: **"Abonos" es la única tabla realmente compartida entre los dos mundos** (Orden y Operación); "Repuestos por Orden" y "Shipping Items" son ramas completamente separadas que hoy no se tocan.

---

## 5. Estados y flujos

### D13. Estados de un repuesto dentro de la orden

**No existen.** La tabla `Repuestos por Orden` no tiene ningún campo de tipo estado/status (confirmado en el esquema completo vía Metadata API — solo tiene nombre, cantidad, precios, proveedor, observación y fecha de registro). Un renglón de repuesto en la orden es una línea plana: se crea con un precio y una cantidad, y esa línea no cambia de estado nunca — solo se puede editar implícitamente (no hay endpoint de update, solo crear/eliminar) o eliminar. El único estado que existe es el de la **Orden completa** (`Estado Actual`: Pendiente, En Proceso, Esperando Respuesta, Completado, etc., gestionado en `app/api/tecnicos/ordenes/[id]/estado/route.ts`), no del repuesto individual. Esto contrasta directamente con `Shipping Items.Estado Item`, que sí tiene estados granulares (Registrado, Pendiente de pago, Pagado, Pendiente de packing, etc.) — es el "hueco" de estado que el rediseño buscaría llenar.

### D14. Qué pasa al eliminar un repuesto de la orden, o al anular la orden

- **Eliminar un repuesto de la orden**: `DELETE /api/tecnicos/repuestos-por-orden/[id]` → `deleteRepuestoPorOrdenById` (`lib/tecnicos/airtable/index.ts:2849-2865`) → `deleteRecordById` (`index.ts:2827-2843`) hace un **DELETE físico** contra Airtable (a diferencia de los abonos, que se anulan en vez de borrarse desde la fase 10). No queda ningún rastro del renglón eliminado. No se toca `Catálogo Repuestos` ni ninguna otra tabla — el borrado es aislado al renglón.
- **"Anular" la orden**: no existe un endpoint literal de "anular orden". Lo más parecido es la **baja interna por abandono** (`PATCH /api/tecnicos/ordenes/[id]/baja-interna`, `markOrdenBajaInterna` en `index.ts:2605-2644`), que solo cambia `Estado Actual` a `"Enviado a Reciclaje"` y crea una entrada de historial. **No borra ni toca** `Repuestos por Orden`, `Servicios por Orden`, `Abonos`, ni el vínculo `Operaciones Comerciales` — todo permanece intacto y vinculado a una orden que ya está "dada de baja". Si esa orden tenía una Operación con abonos activos, esos abonos y sus totales siguen existiendo sin que nada los marque como huérfanos o los reconcilie.

### D15. ¿Algo del flujo actual descuenta o toca inventario?

**No, confirmado.** Los campos de inventario/reserva (`Afecta inventario`, `Disponible para venta`, `Reservado`, `Estado Item`) viven exclusivamente en `Shipping Items`, tabla que el código de técnicos (`lib/tecnicos/airtable/index.ts`) **no referencia en ningún punto** (`grep` de "Shipping Items" en ese archivo: sin resultados). Solo `lib/shipping-v2/airtable.ts` y `lib/operaciones/airtable.ts` tocan esa tabla. El flujo de "Repuestos por Orden" es puramente contable/manual (nombre + precio capturados a mano), sin ningún efecto sobre stock real.

---

## 6. Puntos de acoplamiento y riesgos (qué se rompe/hay que decidir si se redirige la tarjeta a Shipping Items)

1. **Doble cálculo del total de repuestos** (A3): hoy el rollup de Airtable (`Costo Total Repuestos NV`) y el `reduce()` en `OrdenDetalleClient.tsx:2702-2709` calculan lo mismo de forma independiente. Si el origen pasa a ser Shipping Items, hay que decidir qué reemplaza a **ambos** cálculos — y si el nuevo total se sigue apoyando en un rollup de Airtable (con el problema de latencia descrito en el punto 5) o se calcula en servidor.

2. **Latencia de rollups de Airtable, ya parcheada con un hack**: `refreshOrdenDetalleFinanzas()` (`OrdenDetalleClient.tsx:855-859`) hace un refetch inmediato **y luego otro a los 450 ms**, explícitamente para darle tiempo al rollup de Airtable a recalcularse. Si el nuevo total de repuestos depende de un rollup que atraviesa Shipping Items → Operación → Orden (una cadena más larga que hoy), ese retraso probablemente sea mayor, no menor.

3. **Inconsistencia ya existente entre "Abonado" mostrado y "Saldo" calculado** en Operaciones: `OperacionDetalleClient.tsx:478-481,784,798` muestra el rollup crudo `operacion.totalAbonado` (que no excluye "Anulado") en la cifra "Abonado", pero usa un recálculo propio que sí excluye anulados para decidir el badge "Pagado"/Saldo. Del lado de la Orden ni siquiera existe ese recálculo defensivo (`orden.totalAbonadoNV` se pinta tal cual, `OrdenDetalleClient.tsx:3504`). Cualquier rediseño de la cuenta unificada tiene que decidir, de forma explícita y consistente en ambos lados, si los abonos anulados se excluyen y dónde (rollup de Airtable no lo permite condicionar de forma confiable, hay que hacerlo en código).

4. **El link "Aplicado a: Operación" / "Aplicado a: Orden" de un abono se decide una sola vez, al crear el abono, y nunca se re-evalúa**: si la Orden se vincula a una Operación *después* de que ya existan abonos registrados de cualquiera de los dos lados, esos abonos anteriores quedan enlazados solo a su lado original para siempre (caso real confirmado en la sección 2: el abono #147 de $100). Cualquier "cuenta unificada" que dependa de estos links tiene que lidiar con abonos históricos mal enlazados, no solo con los que se creen a futuro.

5. **Falta de guard de sesión en varios endpoints de la tarjeta hoy**: `GET /api/tecnicos/ordenes/[id]`, `GET/POST /api/tecnicos/catalogo/repuestos`, `POST /api/tecnicos/ordenes/[id]/repuestos`, `DELETE /api/tecnicos/repuestos-por-orden/[id]` no llaman a `requireTecnicosSession` (a diferencia de las rutas de abonos y del CRUD de catálogo en `/api/tecnicos/catalogo-repuestos`, que sí lo hacen). No es consecuencia del rediseño, pero es una inconsistencia preexistente que cualquier trabajo sobre esta área debería al menos no empeorar.

6. **Full-table-scan en la lectura de repuestos/servicios de la orden** (B7): `fetchRepuestosPorOrden` y `fetchServiciosPorOrden` traen la tabla completa y filtran en JS, en lugar de usar el patrón de campo inverso + `RECORD_ID()` que ya usa `fetchAbonosPorOrden` post-fase-10. Si el nuevo diseño reemplaza "Repuestos por Orden" por consultas a "Shipping Items" (una tabla mucho más grande, con ~140 campos), replicar este mismo antipatrón sería considerablemente más costoso.

7. **`Repuesto del Catálogo` se escribe pero nunca se relee**: el link de una línea de "Repuestos por Orden" hacia "Catálogo Repuestos" se guarda al crear (`index.ts:2161`) pero ningún código posterior lo consulta — es puramente informativo hoy dentro de Airtable. Si el rediseño reemplaza el origen por Shipping Items, ese link histórico quedaría igual de "muerto" salvo que se decida usarlo para reconciliar datos legados.

8. **Ningún link directo hoy entre Shipping Items y Órdenes ni entre Shipping Items y Abonos** (C12): construir la tarjeta desde Shipping Items requiere, como mínimo, atravesar Operación Comercial para llegar a la Orden, y no hay manera de imputar un abono a un ítem específico si una Operación tiene más de un ítem — hoy el desglose de cobro solo existe a nivel de Operación completa.

9. **`OrdenCotizacionCardImpl` sigue en el repo, deshabilitado pero no eliminado** (`components/tecnicos/OrdenCotizacionCard.tsx:22,26`): no se ejecuta hoy, pero cualquier limpieza futura del componente de la orden debería confirmar que sigue siendo intencionalmente inerte antes de tocarlo.

10. **`ID Abono` es un consecutivo global compartido, leído con "max + 1" justo antes de insertar** (`getMaxIdAbono()` en `lib/operaciones/airtable.ts:375`, reutilizado desde técnicos en `index.ts:2258-2259`) — no es un autonumber real de Airtable, así que hay una ventana de colisión (documentada explícitamente en el propio comentario del código, `index.ts:2256-2257`). No es específico de repuestos, pero cualquier alta de abonos adicional que el rediseño introduzca (p.ej. abonos por ítem) pasaría por el mismo mecanismo y heredaría el mismo riesgo de colisión bajo escrituras concurrentes.

---

## 7. Preguntas abiertas

1. **¿La rollup `Total Abonado NV` (Orden) y `Total Abonado` (Operación) excluyen o no los abonos con `Estado del Abono = "Anulado"`?** La Metadata API de Airtable no expone la función de agregación interna de un rollup (solo expone `recordLinkFieldId`/`fieldIdInLinkedTable`/`referencedFieldIds`, este último vacío en ambos casos). Se infiere que **no** excluyen anulados, por dos señales indirectas: (a) el frontend de Operaciones recalcula aparte filtrando anulados para decidir "Pagado" (lo cual sería redundante si el rollup ya excluyera), y (b) no hay ningún campo de filtro visible en la definición del rollup. No se pudo confirmar de forma 100% directa sin un caso real con un abono anulado en la orden o operación consultadas — no se encontró ninguno en los datos de OR000331/OP-2026-000023 (ambos abonos existentes están "Registrado", ninguno "Anulado"). Recomendado verificar creando (en un entorno de prueba, no en producción) un abono y anulándolo para observar el rollup antes/después — fuera del alcance de esta auditoría de solo lectura.

2. **¿Por qué el abono `recRvhN4pSMKgL7Nl` ($100, orden OR000331) no quedó también enlazado a la Operación**, si el código de `createAbonoPorOrden` sí contempla ese caso? La hipótesis más consistente con las marcas de tiempo (abono creado 14:22, operación actualizada por última vez 15:29) es que el vínculo Orden↔Operación aún no existía en el momento de crear el abono. No se pudo confirmar con certeza absoluta el motivo exacto (podría también haber sido un error humano al usar el formulario, o un estado transitorio) sin acceso al historial de cambios de campo de Airtable (no expuesto por la API REST estándar).

3. **¿Existen otras Órdenes/Operaciones con la misma discrepancia repuesto-de-orden vs. repuesto-de-operación** (renglón manual en "Repuestos por Orden" desactualizado frente al Shipping Item real)? Esta auditoría se limitó al caso de aceptación OR000331/OP-2026-000023 pedido explícitamente; no se hizo un barrido de todas las órdenes/operaciones de la base para cuantificar cuántos casos similares existen hoy.

4. **¿"Registrado Por" en `Abonos` (texto libre) alguna vez fue o será un link a la tabla `Usuarios`?** Hoy es `singleLineText` y el código llena el nombre/correo de la sesión como texto plano (`registradoPor.trim()`, `index.ts:2276-2277`); no se encontró evidencia de que deba ser un link, pero tampoco de que sea una decisión definitiva de diseño — se documenta como abierto porque afecta trazabilidad si el rediseño necesita reportes por usuario.

5. **¿Qué decide el negocio como "regla" para distinguir repuesto de stock vs. repuesto de pedido a nivel de Shipping Item?** El brief da la intención (2. en Contexto de negocio) pero no hay hoy ningún campo en `Shipping Items` que codifique explícitamente esa distinción de cara al cobro en la orden (existen `Tipo de operación`, `Origen físico actual`, `Disponible para venta`, `Reservado`, pero ninguno mapea 1:1 a "ya se le cobró al cliente en la operación" vs "se le va a cobrar en la orden"). Se deja como pregunta abierta porque es información de negocio, no algo que el código actual ya resuelva.
