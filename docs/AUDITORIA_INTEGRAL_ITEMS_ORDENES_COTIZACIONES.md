# Auditoría integral — Shipping Items · Órdenes de Reparación · Operación Comercial · Abonos · Reservas

**Fecha:** 2026-07-27
**Base auditada:** `SUPER GEEK ADM` (`appLkmz7I6vqJ2UXc`) — datos **en vivo**, no snapshot
**Alcance:** registro de items, órdenes de reparación, cotizaciones (hoy Operación Comercial + Opciones), abonos en orden y en operación, reservas, y el vínculo repuesto ↔ orden.
**Método:** esquema completo vía Airtable Metadata API + muestreo de registros reales (86 Shipping Items, 391 Órdenes, 46 Operaciones, 147 Abonos, 4 Reservas) + lectura del código que opera cada flujo.

> Este documento es de **solo diagnóstico**. No se modificó ningún registro ni ningún archivo del repo durante la auditoría.

---

## Estado de correcciones

| Hallazgo | Estado | PR |
|---|---|---|
| F-01 · Doble conteo de abonos | ✅ **Corregido** | PR1 — dedupe por `record.id`; `totalAbonado` se suma de la lista deduplicada en vez de sumar los dos rollups |
| F-02 · Abono duplicado en lista y en formas de pago | ✅ **Corregido** | PR1 — mismo dedupe en `getCuentaUnificada` y en `fetchOperacionDetalle`; el gancho hereda la lista ya limpia |
| F-10 · `Total Cubierto` / `Saldo Item` no reparten el pago | ✅ **Corregido** | PR1.5 — se elimina la cobertura por renglón; el saldo vive solo a nivel de cuenta |
| F-03 · `Total Cotizado` sin escritor vivo → `Saldo Pendiente` roto | ✅ **Corregido** | PR2 — `totalCotizado` se deriva de la(s) opción(es) elegidas; el tablero deja de leer los campos rotos |
| F-27 · Operaciones Rechazadas mostrando saldo | ✅ **Corregido** (parte de operaciones) | PR2 — el chip distingue rechazada / sin cotizar / por cobrar / parcial / a favor / pagado |
| F-40 · El item no podía llegar nunca a "Disponible" | ✅ **Corregido** | PR3 — botón "Listo para vender" en Recepción, con validación de revisión y novedades |
| F-24 · No se podía corregir `Disponible para venta` | ✅ **Corregido** (vía de escape) | PR3 — campo editable solo por administración, con rastro en el historial del item |
| F-06 · Reservas: el cobro no llegaba a Finanzas ni bloqueaba el ítem | ✅ **Corregido** | PR4 — los efectos de reserva dejan de depender de `SRI_AMBIENTE` |
| F-07 · Doble reserva del mismo ítem | ✅ **Corregido** | PR4 — `apartarItemParaReserva` falla si ya está apartado; se aparta antes de crear la reserva |
| F-04 · La factura omitía los repuestos históricos | ✅ **Corregido** | PR5 — línea de factura por cada renglón histórico |
| F-05 · Airtable calculaba un total distinto | ✅ **Corregido** | PR5 — 3 rollups nuevos + `Total a Pagar NV` y `Saldo NV` corregidos |
| F-09 · `MAX(0,…)` ocultaba los sobrepagos | ✅ **Corregido** | PR5 — `Saldo NV` ahora puede ser negativo (saldo a favor) |
| F-12 · El gate silenciaba repuestos históricos | ✅ **Corregido** | PR5 — eliminado el interruptor "Modo repuestos" |
| F-14 · "Repuesto" en 5 campos que no coincidían | ✅ **Corregido** | PR5 — manda `Categoría`; el buscador conoce las categorías montables |
| F-17 · Orden↔Operación N:M leída como 1:1 | ✅ **Corregido** | PR5 — la cuenta suma los artículos y abonos de TODAS las operaciones vinculadas |
| F-11 · Abonos sin movimiento financiero | ✅ **Diagnosticado** · backfill listo | PR6 — el puente NO falla; corte exacto 14-jul-2026 17:22. Script `scripts/backfill-movimientos-abonos.ts` pendiente de ejecutar |
| F-25 · El repuesto de stock no cambiaba de estado | ✅ **Corregido** | PR7 — al vincularlo a una orden pasa a `Estado Item = "Reservado"` |
| F-16 · `Cantidad` vs `Reservado` | ⏸️ **Decisión tomada, datos sin migrar** | Modelo elegido: un registro por unidad física. La división de los 8 artículos multiunidad queda para más adelante |
| F-35 · `Tarifa IVA` vacía en todos los items | ⬇️ **Bajado a P3** | El default es 15%, correcto para todo el catálogo actual (equipos, repuestos, accesorios). Solo importaría si se vende algo exento o al 0% |
| F-22 · Editar un item revierte el estado | ⚠️ **Reclasificado a P3** | No lo dispara ninguna pantalla; queda pendiente blindar la función |
| Resto | Pendiente | — |

**Campos creados en Airtable (2026-07-27).** Solo se agregó; nada se borró.

| Tabla | Campo | Tipo |
|---|---|---|
| Operación Comercial | `Total Artículos Físicos` (`fldjleDK8amAFQZXK`) | rollup SUM de `Artículo físico` → `Precio venta final` |
| Órdenes de Reparación | `Total Repuestos Stock NV` (`fldEpWk8O7zZvXzsz`) | rollup SUM de `Repuestos de Stock (V2)` → `Precio venta final` |
| Órdenes de Reparación | `Total Artículos Operación NV` (`fldTly5zwEE5SteGa`) | rollup SUM de `Operaciones Comerciales` → `Total Artículos Físicos` |

Fórmulas corregidas:

```
Total a Pagar NV = Servicios + Repuestos históricos + Productos Digitales
                 + Total Repuestos Stock NV + Total Artículos Operación NV
Saldo NV         = Total a Pagar NV - Total Abonado NV      (sin MAX(0,…))
```

**Datos reclasificados:** 19 Shipping Items pasaron de `Categoría = "Repuesto"` a
su categoría real (RAM, SSD, HDD, Pantalla, Batería, Mainboard, Cable,
Accesorio, Otro). Los SKU se conservaron a propósito: son etiquetas únicas que
pueden estar impresas.

**Datos eliminados (2026-07-27):**

| Qué | Por qué |
|---|---|
| RES-000001, RES-000002, RES-000003 + 1 reserva vacía | pruebas del propio equipo; sin abonos ni movimientos asociados |
| Renglón histórico "Batería Nueva HT03XL" ($70) de OR000346 | duplicaba el artículo real REP-000023 de OP-2026-000049; la orden pasó de $290 a $220 y quedó saldada |
| Abono `recLXIOda5tcxlpBa` | registro vacío: sin número, monto, fecha ni vínculo |
| Abonos ID 146 ($50) y ID 148 ($10) | pruebas a nombre de Alex Bolaños (CI 1003710272) |

**Clientes de prueba del negocio** (útil para futuras limpiezas): Alex Bolaños /
ALEXIS BOLAÑOS (CI 1003710272, RUC 1003710272001) y Abigail Moreno
(CI 1719956953). Existen además dos fichas duplicadas de ALEXIS BOLAÑOS, una con
la cédula mal digitada (`100371272001`).

---

## Reglas de inventario confirmadas por el negocio (2026-07-27)

Decisiones del dueño, para que no se vuelvan a discutir en cada cambio:

1. **Todo repuesto nace en Shipping Items.** El catálogo de repuestos separado
   creaba un inventario paralelo al real y quedó retirado; "Repuestos por Orden"
   es solo histórico de lectura.
2. **Solo una factura o un recibo descuentan inventario.** Son los únicos dos
   artefactos autorizados a reducir `Cantidad`. Verificado: además de ellos solo
   la nota de crédito y la anulación la tocan, y es para devolver.
3. **Vincular un repuesto a una orden lo pone en `Reservado`, no lo consume.**
   La pieza sigue siendo stock de la casa y sigue contando hasta que se emita el
   documento de venta.
4. **Un registro = una unidad física** (modelo elegido; migración de los 8
   artículos multiunidad aún sin hacer, ver F-16).
5. **`Categoría` es la casilla que define qué es un artículo.** El buscador de
   repuestos sabe qué categorías son montables; la categoría no debe torcerse
   para que algo aparezca en una lista.

**Datos limpiados (2026-07-27):** eliminadas RES-000001, RES-000002 y
RES-000003 (pruebas del propio equipo) más un registro de reserva vacío. Los
ítems DES-000005 y ACC-000001 quedaron sin reservas colgando. No había abonos
ni movimientos financieros asociados, así que la limpieza no afectó a /finanzas.

**Patrón aplicado en los tres PRs:** cuando un campo calculado de Airtable no
puede expresar la regla real (rollups no deduplicables, cobertura sin prorrateo,
campos manuales sin escritor), se deja de leer y se deriva en código. Los campos
siguen existiendo en Airtable; ninguno se borró y no hubo migración de datos.

Casos de referencia, cubiertos por tests:
- OR000382 ↔ OP-2026-000050 (John Castañeda) → `lib/cuenta-unificada/__tests__/abonoDualNoSeDuplica.test.ts`
- OP-2026-000048 / 000022 / 000011 / 000014 → `lib/operaciones/__tests__/cobro.test.ts`

---

## 0. Resumen ejecutivo

El sistema tiene **cuatro capas de verdad financiera que no coinciden entre sí**:

| Capa | Quién la calcula | Qué incluye |
|---|---|---|
| Fórmulas de Airtable (`Total a Pagar NV`, `Saldo NV`) | Airtable | Servicios + Repuestos legacy + Productos Digitales. **No** ve Shipping Items. |
| `Saldo Pendiente` de Operación Comercial | Airtable | `Total Cotizado` (campo manual **sin ningún camino de escritura vivo**) − abonos. |
| `getCuentaUnificada()` | Código (`lib/cuenta-unificada`) | Shipping Items (pedido + stock) + servicios + digitales + repuestos legacy *condicionales* − abonos **sumados dos veces** en un caso real. |
| Factura electrónica (gancho Fase 16) | Código (`lib/facturacion/gancho`) | Solo Shipping Items + servicios. **Omite** repuestos legacy y **duplica formas de pago**. |

Ninguna de las cuatro es consistente con las otras tres. Sobre esa base hay además una **ambigüedad estructural en Shipping Items**: el concepto "repuesto" está codificado en **cinco campos independientes** que en producción **no coinciden en ningún registro**, y el concepto "reservado" está codificado en **cuatro lugares** (checkbox, `Estado Item`, link a `Reservas`, link a `Orden de Reparación (Stock)`) que tampoco se sincronizan.

**39 hallazgos:** **P0 (crítico) 8** · **P1 (alto) 13** · **P2 (medio) 13** · **P3 (deuda) 5**

Los 8 P0: doble conteo de abonos (F-01), abono duplicado en el XML del SRI (F-02), `Total Cotizado` sin escritor vivo (F-03), factura que omite repuestos legacy (F-04), `Total a Pagar NV` ciego a los Shipping Items (F-05), reservas cuyo cobro nunca llega a Finanzas (F-06), "repuesto" en 5 campos que no coinciden (F-14) y editar un item le revierte el estado (F-22).

---

## 1. Mapa real del sistema

### 1.1 Tablas vivas relevantes (49 tablas en la base; estas son las del alcance)

| Tabla | ID | Campos | Registros |
|---|---|---:|---:|
| Shipping Items | `tbliTKAI8dAWwr1nh` | 142 | 86 |
| Órdenes de Reparación | `tblm4bd1eUUqDEHmz` | 46 | 391 |
| Operación Comercial | `tblBSGQhdCsDsdCrh` | 29 | 46 |
| Opciones | `tblYRUY3ZaBKAMaG8` | 17 | — |
| Abonos | `tbli03YnDxVsrnmZK` | 19 | 147 |
| Abonos por Orden *(legacy)* | `tblc9MCGvzcjcg6ki` | 14 | **128** |
| Repuestos por Orden *(legacy)* | `tblUVtr0ykaaSHTlM` | 13 | — |
| Servicios por Orden | `tblRwQ9vzLVzRseGn` | 8 | — |
| Reservas | `tblI9BXe7CmMHIjvj` | 18 | 4 |
| Movimientos Financieros | `tbla8HwlJLOX86fQJ` | 41 | — |
| Facturas Electrónicas | `tblcm85VnzJ1ZVhe5` | 31 | — |
| Item / Packing / Pago *(Shipping V1)* | `tblApFDGCfGqHEhiF` … | — | legacy |

**Tablas que el código todavía referencia y que YA NO EXISTEN en la base:**
`Cotizaciones`, `Opciones de Cotización`, `Abonos de Cotización`. Ver **F-19**.

### 1.2 Grafo de vínculos (los que importan)

```
Clientes ──┬─< Órdenes de Reparación ──┬──< Servicios por Orden ─> Catálogo Servicios
           │        │  │  │  │         ├──< Repuestos por Orden ─> Catálogo Repuestos   (LEGACY)
           │        │  │  │  │         ├──< Productos Digitales
           │        │  │  │  │         └──< Historial de Estados
           │        │  │  │  └──────────── "Repuestos de Stock (V2)" ──> Shipping Items
           │        │  │  └───────────── "Operaciones Comerciales" (N:M) ──> Operación Comercial
           │        │  └──────────────── "Abonos (Operación)"  ──> Abonos  [Aplicado a: Orden]
           │        └───────────────── "Abonos" (legacy, huérfano) ──> Abonos por Orden
           │
           └─< Operación Comercial ──┬──< Opciones ──> Shipping Proveedores
                                     │        └── "Artículo Asociado" ──> Shipping Items
                                     ├── "Opción Elegida" ──> Opciones
                                     ├── "Artículo físico" (N:M) ──> Shipping Items
                                     ├──< Abonos [Aplicado a: Operación]
                                     └── Facturas Electrónicas

Shipping Items ──┬── Reservas (N:M)  ──< Abonos [Reservas]
                 ├── Shipping Packings / Shipping Pagos / Recepciones / Novedades / Eventos
                 ├── Item padre / Items hijos (despiece)
                 └── Factura / Nota de Crédito / Recibo
```

### 1.3 Pantallas implicadas

| Ruta | Módulo | Qué toca |
|---|---|---|
| `/shipping-v2/items` · `/items/nuevo` · `/items/[id]` | Shipping V2 | alta/edición de Shipping Items, flujo calculado, ficha técnica, fotos |
| `/shipping-v2/pagos` · `/packings` · `/recepcion` | Shipping V2 | pagos a proveedor, packings, recepción y novedades |
| `/tecnicos/ordenes` · `/ordenes/[id]` | Técnicos | orden, servicios, repuestos (legacy y stock V2), abonos, cuenta unificada |
| `/tecnicos/ordenes/[id]/imprimir/ticket` · `/abonos/[abonoId]/imprimir` | Técnicos | comprobantes impresos (usan totales distintos, ver F-08) |
| `/operaciones` · `/operaciones/[id]` | Operaciones | requerimiento, opciones, opción elegida, abonos, vínculo con orden |
| `/facturacion/reservas` | Facturación | crear/liberar/facturar reservas |
| `/facturacion/nueva` | Facturación | factura desde orden/operación vía gancho |
| `/cotizaciones` · `/pedidos` | **muertos** | apuntan a tablas inexistentes (F-19) |

---

## 2. Cómo funciona hoy (comportamiento observado)

### 2.1 Alta de un Shipping Item (`/shipping-v2/items/nuevo`)

`createShippingV2Item()` → `applyCalculatedItemFlow()` → `validateItemInput()` → `validateItemProviderRules()` → POST.

`applyCalculatedItemFlow` **sobreescribe** con valores derivados de `Tipo de operación` (tabla en `lib/shipping-v2/item-operation-rules.ts`):

- `Requiere pago`, `Requiere packing`, `Afecta inventario`, `Disponible para venta`, `Modo logístico`, **`Estado Item`** y `Estado de revisión`.
- Lo que el usuario elige en el formulario para esos campos **se descarta**. Es lo que la pantalla llama "Flujo calculado".

**Segundo camino de alta, con reglas distintas:** `createShippingV2ItemFromOperacion()` (`airtable.ts:2325`) llama a `createShippingV2ItemRecord()` **directamente**, saltándose `applyCalculatedItemFlow` **y** `validateItemInput`. Fuerza siempre:

```ts
tipoOperacion: "Compra ya pagada",  tipoItem: "Repuesto",  categoria: "Repuesto",
estado: "Pagado",  requierePago: false,  disponibleVenta: false,  reservado: true,
modoLogistico: "Tracking directo",  esRepuesto: true
```

### 2.2 Repuesto de stock ↔ orden (`lib/tecnicos/repuestos-v2.ts` + `airtable.ts:4256-4395`)

1. Buscador: `Categoría = "Repuesto" AND Disponible para venta = 1 AND Reservado = 0`.
2. Agregar: solo si la orden tiene `Modo repuestos = "V2"`. Escribe `Reservado = true`, `Disponible para venta = false`, `Orden de Reparación (Stock) = [orden]`.
3. Quitar: revierte a `Reservado=false`, `Disponible=true`, link vacío.

**No** crea renglón en `Repuestos por Orden`, **no** cambia `Estado Item`, **no** suma al total de Airtable.

### 2.3 Abonos

Tabla única `Abonos` con dos (tres) destinos: `Aplicado a: Orden`, `Aplicado a: Operación`, `Reservas`.

- Desde la orden (`createAbonoPorOrden`, `lib/tecnicos/airtable/index.ts:2226`): si la orden tiene operación vinculada, escribe **ambos** links.
- Desde la operación (`crearAbono`, `lib/operaciones/airtable.ts:388`): si recibe `ordenId`, escribe **ambos** links.
- Desde la reserva (`registrarAbonoReserva`): escribe solo `Reservas`, **y solo si `ambiente === "2"`**.

Los rollups `Total Abonado NV` (orden) y `Total Abonado` (operación) **sí filtran `Estado del Abono = Anulado`** — verificado empíricamente (OR000234: abonos $50 anulado + $10 → rollup = 10). Ese comentario del código es correcto.

### 2.4 Cuenta unificada (`lib/cuenta-unificada/index.ts`)

```
totalRepuestos  = Σ Shipping Items (pedido + stock V2).precio  + [repuestos legacy si gate]
totalCuenta     = totalRepuestos + Costo Total Servicios NV + Total Productos Digitales
totalAbonado    = Orden."Total Abonado NV"  +  Operación."Total Abonado"
saldo           = totalCuenta − totalAbonado
```

Gate de repuestos legacy: cuentan **solo si** `hay orden` **y** `no hay operación` **y** `modo = legacy`.

### 2.5 Reservas (`lib/facturacion/reservas/*`)

`POST /api/facturacion/reservas` → valida `Disponible para venta === true` → crea el registro → **best-effort** `reservarItem()` y `registrarAbonoReserva()`, ambos **no-op si `ambiente !== "2"`**.
El módulo de facturación está declarado en `lib/apps.ts` como *"ambiente PRUEBAS (celcer)"* → **los efectos nunca se ejecutan hoy**.

---

# 3. HALLAZGOS

Severidad: **P0** = corrompe dinero o documentos legales · **P1** = datos incorrectos visibles · **P2** = ambigüedad / riesgo · **P3** = deuda técnica.

---

## Bloque A — Integridad financiera

### F-01 · P0 · Doble conteo de abonos en la cuenta unificada

**Qué pasa.** `createAbonoPorOrden` y `crearAbono` escriben **los dos** links (`Aplicado a: Orden` **y** `Aplicado a: Operación`) cuando orden y operación están vinculadas. `getCuentaUnificada` suma los **dos** rollups:

```ts
// lib/cuenta-unificada/index.ts:~300
const totalAbonado =
  (ordenRecord ? firstNumber(ordenRecord.fields["Total Abonado NV"]) : 0) +
  (operacionRecord ? firstNumber(operacionRecord.fields["Total Abonado"]) : 0);
```

El comentario inmediatamente encima dice literalmente *"Los abonos son conjuntos disjuntos por lado"*. **Es falso** y nada lo garantiza.

**Evidencia en producción.**

| | |
|---|---|
| Abono | `recj8GIFSi6SRUwGm` — ID 157 — **$20** — Registrado |
| Links | `Aplicado a: Operación` = OP-2026-000011 · `Aplicado a: Orden` = OR000346 |
| `OR000346."Total Abonado NV"` | **220** (incluye este $20) |
| `OP-2026-000011."Total Abonado"` | **20** (el mismo $20) |
| `getCuentaUnificada` calcula | **240** |
| Dinero realmente recibido | **220** |

**Impacto.** El saldo del cliente se subestima por el monto de cada abono dual. Hoy afecta a 1 registro ($20), pero **todo abono nuevo registrado desde una orden con operación vinculada reproduce el bug**. Hay 9 órdenes con operación vinculada.

---

### F-02 · P0 · El mismo abono aparece dos veces en la lista y en la factura electrónica

**Qué pasa.** Ni `getCuentaUnificada` ni `fetchOperacionDetalle` deduplican por `record.id`:

```ts
// lib/cuenta-unificada/index.ts
const abonos = [...abonosOrden.map(...), ...abonosOperacion].sort(...)

// lib/operaciones/airtable.ts:338
const abonos = [
  ...abonosOpRecords.map((r) => mapAbono(r, "operacion")),
  ...abonosOrdenRecords.map((r) => mapAbono(r, "orden")),
].sort(...)
```

Y el gancho de facturación construye **una forma de pago por cada elemento de esa lista**:

```ts
// lib/facturacion/gancho/traductor.ts:~121
const abonosVigentes = cuenta.abonos.filter((a) => a.estado !== "Anulado");
const pagos = calcularFormasPago(abonosVigentes, importeTotal);
// construccion.ts: pagos = abonosVigentes.map(...)  → una línea por abono
```

**Impacto.**
1. La pantalla de la orden y la de la operación muestran el abono duplicado (el cliente ve que pagó dos veces).
2. **En el XML de la factura electrónica se emiten dos `<pago>` por el mismo dinero.** `calcularFormasPago` detecta el descuadre pero **solo hace `console.warn`** y sigue:
   ```ts
   } else if (saldoPendiente < -0.01) {
     console.warn(`[gancho] Suma de abonos ($${sumaAbonos}) excede el total ($${importeTotal}). Revisar manualmente.`);
   }
   ```
   Es un defecto **fiscal**, no cosmético.

---

### F-03 · P0 · `Total Cotizado` no tiene ningún camino de escritura vivo → `Saldo Pendiente` de las operaciones está roto

**Qué pasa.** `Operación Comercial."Saldo Pendiente"` = `Total Cotizado − Total Abonado`. `Total Cotizado` es un **campo currency manual**. La única escritura en todo el repo está en:

```
lib/cotizaciones/airtable.ts:1182   "Total Cotizado": selected.precioVentaCliente ?? 0,
```

…que pertenece al **módulo muerto** de Cotizaciones (F-19). `crearOperacion()`, `setOpcionElegida()` y `actualizarEstadoOperacion()` **nunca lo escriben**. Elegir una opción no propaga su `Precio Venta Cliente`.

**Evidencia en producción — 41 de 46 operaciones tienen `Total Cotizado` vacío:**

| Operación | Opción Elegida | Total Cotizado | Total Abonado | **Saldo Pendiente (mostrado)** | Saldo real |
|---|---:|---:|---:|---:|---:|
| OP-2026-000011 | $125 | *(vacío)* | 20 | **−20** | +105 |
| OP-2026-000010 | $540 | *(vacío)* | 540 | **−540** | 0 |
| OP-2026-000032 | $105 | *(vacío)* | 50 | **−50** | +55 |
| OP-2026-000043 *(Entregado)* | $90 | *(vacío)* | 0 | **0** | +90 |
| OP-2026-000022 *(Entregado)* | $180 | *(vacío)* | 0 | **0** | +180 |
| OP-2026-000048 *(Pedido)* | $185 | *(vacío)* | 0 | **0** | +185 |
| OP-2026-000049 *(Pedido)* | $70 | *(vacío)* | 0 | **0** | +70 |

**Impacto.** El tablero de Operaciones muestra saldo 0 o negativo (crédito a favor) para clientes que deben dinero. Operaciones marcadas **Entregado** sin registro de deuda.

---

### F-04 · P0 · La factura electrónica omite todos los repuestos legacy

**Qué pasa.** `cuentaUnificadaToDatosVenta()` construye las líneas así:

```ts
const detallesProducto = cuenta.items.map(construirLineaProducto);   // solo Shipping Items
const detallesServicio = cuenta.servicios.map(construirLineaServicio);
const detalles = [...detallesProducto, ...detallesServicio];
```

`cuenta.repuestosHistoricos` (tabla `Repuestos por Orden`) **nunca genera línea de factura**, aunque su subtotal **sí** entra en `cuenta.totalCuenta` cuando el gate está activo. Resultado: `importeTotal` de la factura ≠ `totalCuenta` de la cuenta unificada.

**Evidencia.** **47 órdenes** en modo Legacy sin operación vinculada tienen `Costo Total Repuestos NV > 0`, sumando **$3.234**. Ejemplos: OR000031 ($160 repuestos + $25 servicios), OR000279 ($108 + $35), OR000005 ($100 + $35), OR000042 ($85 + $25).

**Impacto.** Facturar cualquiera de esas 47 órdenes emite un documento por **solo los servicios**, subfacturando entre 60% y 100% del monto.

---

### F-05 · P0 · `Total a Pagar NV` de Airtable ignora los Shipping Items (pedido y stock)

**Fórmula real de `Total a Pagar NV` (`fldrisC7f5OWkaVXt`):**

```
{Costo Total Servicios NV} + {Costo Total Repuestos NV} + {Total Productos Digitales}
```

No incluye ni `Repuestos de Stock (V2)` ni los items de la operación. `Saldo NV = MAX(0, Total a Pagar NV − Total Abonado NV)`.

**Evidencia.**

| Orden | Modo | `Total a Pagar NV` | Repuestos de Stock (V2) | Realidad |
|---|---|---:|---|---|
| OR000382 | V2 | 25 | Ventilador Dell (link real) | 25 no incluye el ventilador |
| OR000378 | V2 | 40 | SSD 120GB (link real) | 40 no incluye el SSD |
| OR000380 | V2 | 10 | Cable SATA HP (link real) | 10 no incluye el cable |

**Impacto.** Quien lea la orden en la interfaz de Airtable, o cualquier vista/automatización/PDF que use `Total a Pagar NV` / `Saldo NV`, ve un número distinto al de la app. Coexisten dos "totales de la orden".

---

### F-06 · P0 · Reservas: el dinero cobrado no llega a Abonos ni a Finanzas, y el item no se bloquea

**Qué pasa.** Los tres efectos reales de una reserva están detrás de la misma guarda:

```ts
// lib/facturacion/reservas/efectos.ts
const AMBIENTE_PRODUCCION = "2";
export async function reservarItem(id, ambiente) { if (ambiente !== AMBIENTE_PRODUCCION) return; ... }
export async function liberarItem(id, ambiente)  { if (ambiente !== AMBIENTE_PRODUCCION) return; ... }
export async function registrarAbonoReserva(input) { if (input.ambiente !== AMBIENTE_PRODUCCION) return { estado: "OMITIDO" }; ... }
```

El módulo de Facturación está hoy en **ambiente PRUEBAS** (`lib/apps.ts`: *"Emisión de facturas electrónicas SRI — ambiente PRUEBAS (celcer)"*). Pero **la reserva sí se crea**, con dinero real.

**Evidencia — las 3 reservas activas en producción:**

| Reserva | Item | Precio | Total Abonado | `Abonos (Reserva)` | Item `Reservado` | Item `Estado` |
|---|---|---:|---:|---|---|---|
| RES-000001 | `rec1e1NPbNTBbJh0r` DES-000005 | 340 | **50** | *(vacío)* | ✗ | En tránsito |
| RES-000002 | `rec1e1NPbNTBbJh0r` DES-000005 | 340 | **50** | *(vacío)* | ✗ | En tránsito |
| RES-000003 | `recwTbzcofEjAQwb6` ACC-000001 | 40 | **10** | *(vacío)* | ✗ | **Disponible** |

De los 147 abonos de la tabla `Abonos`, **0 están ligados a una reserva**. Los $110 cobrados solo existen en el blob de texto `Abonos JSON` y en el currency `Total Abonado`.

**Impacto.** $110 fuera de Finanzas, sin `Movimiento Financiero`, sin trazabilidad, invisibles para cuadres y reportes. Y los items siguen apareciendo como vendibles.

---

### F-07 · P1 · Doble reserva del mismo item físico

**Qué pasa.** El chequeo previo lee `Disponible para venta` del item (`app/api/facturacion/reservas/route.ts:66-72`). Como `reservarItem()` es no-op (F-06), el flag nunca cambia y **el mismo item se puede reservar N veces**. Además no hay ninguna validación de "¿ya existe una reserva Activa para este item?".

**Evidencia.** `rec1e1NPbNTBbJh0r` (DES-000005, `Cantidad = 1`) tiene **RES-000001 y RES-000002, ambas Activas**, para dos clientes distintos ("Alexis B" céd. `1003710272` y "ALEXIS BOLAÑOS" RUC `1003710272001`), cada una con $50 abonados sobre el mismo equipo de $340.

Aun con `ambiente = "2"` el chequeo sería **TOCTOU**: lectura y PATCH no son atómicos.

---

### F-08 · P1 · Tres totales distintos para la misma orden según la pantalla

| Superficie | Fuente | Fórmula |
|---|---|---|
| Airtable / vistas / automatizaciones | `Total a Pagar NV` | servicios + repuestos legacy + digitales |
| App (orden y operación) | `getCuentaUnificada().totalCuenta` | items + servicios + digitales + legacy *condicional* |
| Ticket impreso de abono | `cuentaUnificada?.totalCuenta ?? orden.totalAPagarNV` | **cualquiera de las dos**, según si el fetch respondió |

```tsx
// components/tecnicos/print/TicketAbono.tsx:13
const totalAPagar = cuentaUnificada?.totalCuenta ?? orden.totalAPagarNV;
const saldoPendiente = cuentaUnificada ? Math.max(0, cuentaUnificada.saldo) : orden.saldoNV;
```

Un fallo transitorio de red cambia el número impreso en el comprobante que se le entrega al cliente.

---

### F-09 · P1 · `MAX(0, …)` oculta 50 órdenes con sobrepago

`Saldo NV = MAX(0, Total a Pagar NV − Total Abonado NV)` nunca es negativo.

**Evidencia:** **50 órdenes** tienen `Total Abonado NV > Total a Pagar NV`, todas mostrando `Saldo NV = 0`. Casos con diferencia grande:

| Orden | Total a Pagar | Total Abonado | Diferencia oculta |
|---|---:|---:|---:|
| OR000366 | 50 | 215 | **165** |
| OR000162 | 0 | 105 | **105** |
| OR000058 | 0 | 93 | **93** |
| OR000075 | 0 | 90 | **90** |
| OR000119 | 0 | 66 | **66** |
| OR000346 | 95 | 220 | **125** |

Casi siempre la causa es la misma: se cobró pero **nunca se cargaron los renglones de servicio/repuesto**. Hay **217 órdenes** en estado Completado/Finalizado Entregado con `Total a Pagar NV = 0`.

En sentido contrario: **77 órdenes "Finalizado Entregado" con saldo > 0**, por **$2.861** — equipos entregados sin cobrar (o sin registrar el cobro).

---

### F-10 · P1 · `Total Cubierto` / `Saldo Item` reparten mal cuando la operación tiene varios items

**Fórmulas reales:**
```
Total Cubierto (rollup) = Operación."Total Abonado"    # el TOTAL de la operación, por cada item
Saldo Item = MAX(0, {Precio venta final} − {Total Cubierto})
```

`Artículo físico` es un link **múltiple**. Si una operación con $500 abonados tiene 3 items, **cada uno** muestra `Total Cubierto = 500`. La suma de coberturas es 3× el dinero real y los tres `Saldo Item` quedan en 0.

Hoy no se materializa (los 7 items con operación tienen 1:1 y ninguno excede su precio), pero es un defecto de diseño activo. `Saldo Item` además ignora por completo los abonos de reserva.

---

### F-11 · P1 · 136 abonos activos ($7.649) sin `Movimiento Financiero`

De los 147 abonos, **136 no anulados no tienen link a `Movimientos Financieros`**, por **$7.649**. Hay que determinar si es backlog previo al puente `lib/finanzas/puentes/abonos.ts` o si el puente falla en silencio (`crearMovimientoParaAbono` se invoca best-effort y sus errores no bloquean).

También: **1 abono huérfano** — `recLXIOda5tcxlpBa`, sin `ID Abono`, sin monto, sin ningún link.

---

### F-12 · P2 · El gate de repuestos legacy silencia dinero real

```ts
// lib/cuenta-unificada/index.ts:36
const ordenAportaRepuestosPropios = input.ordenId != null && input.operacionId == null;
legacyCuentanParaTotal: ordenAportaRepuestosPropios && input.modoRepuestos === "legacy"
```

Basta que la orden tenga **cualquier** operación vinculada para que **todos** sus renglones de `Repuestos por Orden` dejen de sumar — aunque describan repuestos distintos a los de la operación. Igual pasa si la orden es modo V2 y tiene renglones legacy.

**Evidencia:** OR000346 ($70 de repuestos legacy, V2, con 2 operaciones) y OR000343 ($45 de repuestos legacy, V2, con operación) → **$115 desaparecen del total en la app** pero **siguen sumando en `Total a Pagar NV` de Airtable**. Es exactamente la contradicción de F-05 y F-08 combinadas.

---

### F-13 · P2 · Abonos anulados quedan vinculados

3 abonos anulados ($141) siguen con sus links `Aplicado a: Orden` / `Aplicado a: Operación` intactos. Los rollups los filtran correctamente, pero cualquier lectura por link (`fetchAbonosPorOrden`, `fetchOperacionDetalle`, la lista de la cuenta unificada) los trae y la UI depende de filtrar por `estado !== "Anulado"` en cada punto. Un solo olvido reintroduce el monto.

---

## Bloque B — Modelo de datos y ambigüedades de Shipping Items

### F-14 · P0 · "Repuesto" está codificado en 5 campos que no coinciden en ningún registro

| Campo | Tipo | Registros con "Repuesto" |
|---|---|---:|
| `Tipo de operación` | singleSelect | 5 |
| `Tipo de item` | singleSelect | 21 |
| `Categoría` | singleSelect | **24** |
| `Estado Item` | singleSelect | 6 |
| `Es repuesto` | checkbox | 7 |

- Unión (algún campo dice "repuesto"): **24**
- **Intersección (los 5 coinciden): 0**
- `Categoría = Repuesto` pero `Tipo de item ≠ Repuesto`: **3**

**Por qué importa:** el buscador de repuestos de stock filtra **únicamente por `Categoría`**:

```ts
// lib/shipping-v2/airtable.ts:4262
filterByFormula: `AND({Categoría}="Repuesto", {Disponible para venta}=1, {Reservado}=0)`
```

Y `createShippingV2ItemFromOperacion` fuerza `Categoría: "Repuesto"` a **todo** lo que nace de una operación comercial, sin importar qué sea. Por eso hoy hay clasificados como "Repuesto": una impresora **Epson TM-T20ILL**, un **disco externo Seagate 2TB**, unos **audífonos Plantronics**, una **motherboard de iMac**. Todos con SKU `REP-xxxxxx`.

Resultado concreto: en el buscador de repuestos de stock aparece hoy `REP-000002` — *"LCD Adhesive Strips Tape Opening Wheel Tool"*, cuyo `Tipo de item` es **"Equipo completo"**.

**Cuál es la fuente de verdad hoy: `Categoría`.** Los otros cuatro campos no gobiernan nada.

---

### F-15 · P1 · "Reservado" está codificado en 4 lugares que no se sincronizan

| Mecanismo | Quién lo escribe |
|---|---|
| checkbox `Reservado` | repuestos-v2, alta desde operación, reservas *(solo ambiente 2)* |
| `Estado Item = "Reservado"` | **solo** `reservarItem()` de reservas *(solo ambiente 2)* |
| link `Reservas` | módulo de reservas |
| link `Orden de Reparación (Stock)` | repuestos-v2 |

**Evidencia:**

- **12 items** con `Reservado = ✓` pero `Estado Item ≠ "Reservado"`: REP-000020 (*Pagado*), REP-000019 (*Repuesto*), REP-000005 (*En tránsito*), REP-000024 (*Repuesto*), REP-000004 (*En revisión*), REP-000021 (*Pagado*), REP-000017 (*Repuesto*), REP-000022 (*Pagado*), REP-000003 (*En revisión*), REP-000001 (*En revisión*), **REP-000008 (*Vendido*)**, REP-000023 (*Pagado*).
- **0 items** con `Estado Item = "Reservado"` — el estado existe pero nunca se usa.
- **2 items** con reserva activa y `Reservado` vacío: DES-000005, ACC-000001 (ver F-06).
- **`REP-000017`** viola directamente el invariante del propio código: `Reservado = ✓` **Y** `Disponible para venta = ✓` **Y** ligado a OR000378 como repuesto de stock. Puede reservarse o venderse mientras está comprometido con una orden.

---

### F-16 · P1 · `Cantidad` y `Reservado` son incompatibles

`Reservado` es un booleano por **registro**, pero un registro puede representar muchas unidades: `REP-000017` tiene **`Cantidad = 52`**, `ACC-000001` tiene **9**, `REP-000018` tiene **8**, `REP-000007` tiene **5**.

Reservar 1 unidad de las 52 marca **las 52** como reservadas y las saca de venta. Y `evaluarItemNoListo` exige `reservado === true` para poder facturar:

```ts
// lib/facturacion/gancho/construccion.ts
if (detalle.cantidad < 1) { ... "SIN_STOCK" / "YA_FACTURADO" }
if (!detalle.reservado) return { motivo: "NO_RESERVADO" };
```

→ vender 1 de 52 obliga a marcar las 52 como reservadas. Y al liberar, `liberarShippingItemDeOrdenStock` pone `Reservado = false` para las 52.

Además la línea de factura fuerza `cantidad: 1` siempre:
```ts
// construccion.ts:construirLineaProducto
return { ..., cantidad: 1, precioUnitario: base, ... }
```

---

### F-17 · P1 · La relación Orden ↔ Operación es N:M en Airtable y 1:1 en el código

`Órdenes."Operaciones Comerciales"` y `Operación."Orden de Reparación"` son links múltiples. Todo el código toma **el primero**:

```ts
// lib/cuenta-unificada/index.ts
const operacionId = linkedIds(ordenRecord.fields["Operaciones Comerciales"])[0] ?? null;
// lib/operaciones/airtable.ts:274
const ordenId = linkedIds(f["Orden de Reparación"])[0] ?? null;
// lib/tecnicos/airtable/index.ts:2252
const operacionId = toLinkedRecordIds(ordenRecord.fields?.["Operaciones Comerciales"])[0] ?? null;
```

**Evidencia:** **OR000346** está vinculada a **OP-2026-000011 y OP-2026-000049**. La segunda operación (BATERIA HP HT03XL, $70, con item físico `recsiSQuu0VobbfOD` ya creado) es **completamente invisible** para la cuenta unificada de la orden: ni su item, ni sus abonos, ni su total. Y `createAbonoPorOrden` vincula los abonos nuevos siempre a OP-000011.

---

### F-18 · P2 · `fetchOperacionDetalle` muestra un solo artículo físico

```ts
// lib/operaciones/airtable.ts:300
if (articuloFisicoIds.length === 0) return null;
const itemId = articuloFisicoIds[0];      // ← solo el primero
```

`getCuentaUnificada` sí trae todos (`fetchItemsPedido`). La pantalla de Operaciones y la de la orden muestran conjuntos distintos de artículos para la misma operación.

---

### F-19 · P1 · Módulos vivos apuntando a tablas que ya no existen

```ts
// lib/cotizaciones/airtable.ts:43
export const COTIZACIONES_TABLES = {
  cotizaciones: ... || "Cotizaciones",              // ❌ NO EXISTE en la base
  opciones:     ... || "Opciones de Cotización",    // ❌ NO EXISTE
  abonos:       ... || "Abonos de Cotización",      // ❌ NO EXISTE
  item:         ... || "Item",                      // ⚠️ tabla Shipping V1
  proveedores:  ... || "Proveedores",               // ⚠️ tabla Shipping V1
};
// lib/pedidos/airtable.ts:36
const OPCIONES_TABLE = ... || "Opciones de Cotización";  // ❌ NO EXISTE
```

Ambas apps están `hidden: true` en `lib/apps.ts`, **pero las rutas siguen vivas y protegidas** (`proxy.ts` matcher incluye `/api/cotizaciones/:path*` y `/api/pedidos/:path*`; `getRoutePermission` las mapea). Cualquiera con el permiso "Cotizaciones" o "Pedidos" puede navegar a `/cotizaciones` o `/pedidos` y recibir errores de Airtable, o peor: `POST /api/cotizaciones` **crearía la tabla implícitamente** si el token tiene permiso de esquema.

Consecuencia directa: **F-03** (el único escritor de `Total Cotizado` vive aquí).

---

### F-20 · P2 · Campos duplicados / redundantes en Shipping Items (142 campos)

| Concepto | Campos que lo representan |
|---|---|
| Costo total | `Costo total estimado` (currency manual) · `Costo total unidad` (fórmula) |
| Precio | `Precio venta sugerido` · `Precio venta final` (72/86 sin sugerido, 37/86 sin final) |
| SKU | `SKU` · `SKU interno` · `SKU proveedor` · `SKU original sugerido` · `Método de asignación SKU` · `SKU proveedor fue usado como interno` · `SKU duplicado detectado` |
| Pago / packing | `Pago relacionado` (texto) · link `Shipping Pagos (Items relacionados)` · `Packing relacionado` (texto) · link `Shipping Packings` |
| Ficha técnica | `Marca` / `Marca ficha` · `Modelo` / `Modelo ficha` |
| Opciones técnicas | `Conectividad` (multiSelect) · `Conectividad V2` (link) — ídem Puertos y Características extras |
| Legacy | `Legacy Item ID`, `Legacy Pago ID`, `Legacy Packing ID`, `Fuente de migración`, `Estado de migración` |

`Pago relacionado` y `Packing relacionado` son **texto libre** paralelos a links reales: no hay integridad referencial.

---

### F-21 · P2 · Las fórmulas de prorrateo logístico usan `VALUE(ARRAYJOIN(...))`

```
Costo flete asignado =
IF(FIND("cantidad", LOWER(ARRAYJOIN({Regla distribución Packing}))),
   IF(VALUE(ARRAYJOIN({Cantidad items Packing})) > 0,
      ROUND(VALUE(ARRAYJOIN({Flete Packing})) / VALUE(ARRAYJOIN({Cantidad items Packing})), 2), 0),
   IF(FIND("costo", ...), ROUND(VALUE(ARRAYJOIN({Flete Packing})) * ({Costo proveedor} / VALUE(ARRAYJOIN({Total costo proveedor Packing}))), 2), 0))
```

`ARRAYJOIN` de un lookup con varios valores devuelve `"120,80"`; `VALUE("120,80")` devuelve `120`. Como `Shipping Packings` es un link **múltiple** en el item, un item en 2 packings prorratea silenciosamente contra el primero. Además, `FIND` sobre texto libre de la regla: si alguien escribe la regla con otra palabra, el prorrateo cae a **0** sin error.

---

## Bloque C — Máquinas de estado

### F-22 · ~~P0~~ → **P3 (latente, no se dispara)** · Editar un item le revierte el `Estado Item`

> **Corrección posterior a la auditoría inicial.** Al ir a corregirlo se verificó
> que **ninguna pantalla usa el guardado completo**. Toda la edición de items en
> `/shipping-v2/items` es campo por campo (`saveField` → `PATCH { field, value }`
> → `updateShippingV2ItemField`), que **no** pasa por `applyCalculatedItemFlow`.
> `updateShippingV2Item` sigue expuesto en la ruta `PATCH` sin `field`, pero
> ningún cliente lo invoca. El defecto descrito abajo es real en el código y hay
> que arreglarlo antes de que alguien vuelva a usar esa función, pero **no está
> causando daño hoy**. La severidad baja de P0 a P3.
>
> El problema real de estados es otro: ver **F-40**.


```ts
// lib/shipping-v2/airtable.ts:2491
export async function updateShippingV2Item(recordId, input, options) {
  const calculatedInput = applyCalculatedItemFlow(input);   // ← sobreescribe estado
  ...
}
// applyCalculatedItemFlow, línea 682:
estado: flow.estadoItemSugerido,
```

`getDefaultItemFlowByOperation` devuelve un `estadoItemSugerido` **fijo por tipo de operación**, sin mirar el estado actual (salvo en "Corrección administrativa"):

| Tipo de operación | Estado forzado en cada edición |
|---|---|
| Compra a proveedor | **Pendiente de pago** |
| Compra ya pagada | **Pagado** |
| Reajuste de inventario | Disponible |
| Despiece de equipo | Destinado a partes |
| Migración histórica | Migrado |

**Consecuencia:** editar (aunque sea solo el nombre o la descripción) un item "Compra a proveedor" que ya está **Disponible**, **En tránsito**, **Recibido** o **Vendido** lo devuelve a **"Pendiente de pago"**. 75 de los 86 items son "Compra a proveedor". Junto con esto se reescriben `Requiere pago`, `Requiere packing`, `Afecta inventario` y `Disponible para venta`.

Es el candidato más probable a "el sistema me cambia los estados solos".

---

### F-23 · P1 · Alta desde operación se salta el motor de reglas y la validación

`createShippingV2ItemFromOperacion` llama a `createShippingV2ItemRecord` **directo**: ni `applyCalculatedItemFlow` ni `validateItemInput`. Por eso crea items con la combinación **`Tipo de operación = "Compra ya pagada"` + `Estado = "Pagado"` + `Requiere pago = false` + sin `Costo proveedor` obligatorio**, que `validateItemInput` rechazaría:

```ts
if (["Compra a proveedor", "Compra ya pagada"].includes(tipoOperacion)) {
  if (!proveedorId) throw new Error("Proveedor de compra es obligatorio ...");
  if (costoProveedor == null) throw new Error("Costo proveedor es obligatorio ...");
}
```

**Evidencia:** 4 items con `Estado = "Pagado"` **sin ningún `Shipping Pago` vinculado** (REP-000020, REP-000021, REP-000022, REP-000023). El dinero al proveedor no está registrado en ninguna parte, pero el inventario dice "Pagado".

---

### F-24 · P1 · `Disponible para venta` contradice el estado en 8 items

Las reglas del propio código (`SALE_BLOCKED_STATES` en `item-operation-rules.ts`) declaran bloqueados para venta los estados *Con novedad*, *Repuesto*, *Uso local*, *Vendido*, *Destinado a partes*, etc. En producción:

| Item | Estado | Disponible venta |
|---|---|---|
| LAP-000021, LAP-000022 | Con novedad | ✓ |
| LAP-000023, LAP-000024, LAP-000025 | Con novedad | ✓ |
| REP-000006, REP-000007, REP-000017 | Repuesto | ✓ |
| **LAP-000016** | **Vendido** | **✓** (y sin factura vinculada) |

Nota: `SALE_BLOCKED_STATES` contiene `"con novedad critica"`, pero el valor real del select es **`"Con novedad"`** — **la regla nunca hace match**. Es un bug de literal.

---

### F-25 · P1 · Reservar un repuesto de stock no cambia su `Estado Item` ni marca su uso

`reservarShippingItemComoRepuestoDeOrdenStock` escribe solo `Reservado`, `Disponible para venta` y el link. El item ligado a una orden sigue en *Repuesto* / *En revisión* / *Disponible*. **No existe ninguna transición a `"Usado en reparación"`** en todo el repo — el estado está definido en el select y nunca se escribe. Cerrar la orden no consume el repuesto.

Simétricamente, `liberarShippingItemDeOrdenStock` fuerza `Disponible para venta = true` sin condiciones: liberar un item que entre tanto pasó a *Con novedad*, *Vendido* o *Destinado a partes* lo devuelve al catálogo de venta.

Mismo problema en `liberarItem()` de reservas: `Estado Item = "Disponible"` incondicional.

---

### F-26 · P2 · La condición de carrera que el comentario dice prevenir sigue existiendo

```ts
// airtable.ts:4278 — comentario
// Valida categoría/disponibilidad para evitar reservar dos veces por una
// condición de carrera (dos técnicos agregando el mismo item a la vez).
```

El código hace GET y luego PATCH sin transacción ni compare-and-swap. Es TOCTOU clásico. Mismo patrón en reservas (F-07) y en `assertItemsCanJoinPayment`.

Además el PATCH **reemplaza** el array de links:
```ts
[ORDEN_STOCK_LINK_FIELD]: [ordenRecordId],   // no acumula
```

---

### F-27 · P2 · Estados de operación sin puerta financiera

`Operación Comercial.Estado` admite `Requerimiento → Cotizado → Aprobado → Pedido → Entregado → Rechazado` sin ninguna validación de saldo. Hay operaciones **Entregado** con saldo real pendiente (OP-000022 $180, OP-000043 $90, ver F-03) y **Rechazado** con `Saldo Pendiente = 1350` (OP-2026-000014, que además conserva un abono anulado de $1).

Ídem `Órdenes.Estado Actual`: 77 órdenes *Finalizado Entregado* con saldo > 0 ($2.861).

---

### F-28 · P2 · Cuatro máquinas de estado paralelas en el item, sin reglas cruzadas

`Estado Item` (22 valores) · `Estado de revisión` (10) · `Estado de triangulación` (9) · `Estado de despiece` (7). No hay tabla de transiciones válidas ni validación cruzada. Un item puede estar `Estado Item = Disponible` y `Estado de despiece = Despiece completo` a la vez.

---

## Bloque D — UI y flujos de pantalla

### F-29 · P1 · El formulario de item nuevo promete campos que no se guardan

En `/shipping-v2/items/nuevo` (captura adjunta) el panel "Flujo calculado" muestra `Requiere pago`, `Requiere packing`, `Afecta inventario`, `Disponible venta`, `Modo logístico` y `Estado item sugerido`. El texto dice *"Puedes ajustar algunos valores si el formulario lo permite"*, pero `applyCalculatedItemFlow` **descarta todos** los valores del usuario para esos campos (salvo `Modo logístico`, y `Disponible venta` solo vía `Reservado`). No hay indicación de cuáles sí son editables.

### F-30 · P2 · Validaciones de negocio expresadas como texto de ayuda, no como bloqueo

En la captura: *"Este flujo requiere proveedor de compra"* y *"Este flujo requiere costo proveedor"* aparecen como avisos naranjas. La validación real ocurre en el servidor (`validateItemInput`) y devuelve un throw genérico. El usuario puede llenar todo el formulario y perder el trabajo al enviar.

### F-31 · P2 · `Estado item sugerido` es de solo lectura y no refleja lo que se guardará tras editar

El campo muestra "Pendiente de pago" al crear. Al **editar** un item ya *Disponible*, ese mismo campo vuelve a mostrar "Pendiente de pago" y **eso es lo que se guarda** (F-22), sin advertencia.

### F-32 · P3 · Opciones con datos basura llegan a producción

- `OP-2026-000044` tiene una opción literalmente llamada **"NO ELEGIBLE (ELIMINAR) — $520"**.
- `OP-2026-000006` tiene una opción **"Listado de items en el pdf adjunto — $"** (`Precio Venta Cliente` vacío) → `Ganancia Estimada` = −`Costo Proveedor`.

No hay validación de `Precio Venta Cliente > 0` al crear opción.

### F-33 · P3 · Reserva vacía en producción

`recnGQBLd56dvnBpq` — Estado *Cancelada*, sin `Número`, sin item, sin cliente, sin precio.

---

## Bloque E — Deuda técnica y observaciones

### F-34 · P2 · Generación de `ID Abono` por `MAX() + 1` sin unicidad

`getMaxIdAbono()` lee el máximo y suma 1, desde tres módulos distintos (técnicos, operaciones, reservas). El comentario admite *"releído justo antes de insertar para minimizar colisiones"*. No hay constraint de unicidad en Airtable. Hoy no hay duplicados (147 registros), pero 1 abono tiene `ID Abono` nulo.

Mismo patrón en `siguienteNumeroReserva()` (`RES-000001`) y `generatePackingId()`.

### F-35 · P2 · `Tarifa IVA` vacía en los 86 items

`construirLineaProducto` cae al default `"15%"` para todos. Ningún item tiene tarifa explícita, así que un item exento o 0% se facturaría al 15% salvo que alguien lo llene a mano antes de emitir.

### F-36 · P3 · Reservas guardan al cliente tres veces

`Cliente` (link), `Cliente Nombre` (texto), `Cliente Identificación` (texto) y **otra vez** dentro de `Abonos JSON`. En RES-000001 el link a `Clientes` está **vacío** pero el JSON sí trae `cliente.identificacion`; en RES-000002 y RES-000003 sí hay link. Tres copias que pueden divergir.

### F-37 · P3 · `precioVenta` de la reserva viene del cliente HTTP

`POST /api/facturacion/reservas` toma `body.precioVenta` y solo valida `> 0`; **no lo contrasta con `Precio venta final` del item**. Un precio manipulado o desactualizado queda grabado en la reserva y en su PDF.

### F-38 · P3 · Documentación desactualizada en `docs/`

`docs/sgadm-schema-raw.json` y `docs/sgadm-schema.json` describen una base **sin** Órdenes de Reparación, Operación Comercial, Abonos, Opciones ni Reservas, y **con** Cotizaciones / Opciones de Cotización / Abonos de Cotización. Es un snapshot pre-migración que hoy induce a error.

### F-40 · P0 · El `Estado Item` no puede llegar nunca a "Disponible": el ciclo de vida se atasca en "En revisión"

**Qué pasa.** Estos son los únicos puntos del código que escriben `Estado Item`
de forma automática, y son el ciclo de vida completo de un artículo comprado:

| Momento | Estado que escribe | Dónde |
|---|---|---|
| Alta (compra a proveedor) | `Pendiente de pago` | `item-operation-rules.ts` |
| Se marca el pago al proveedor | `Pagado` | `airtable.ts:3069` |
| Entra / sale de un packing | `En packing` / `Pendiente de packing` | `airtable.ts:3629, 3696` |
| El packing sale | `En tránsito` | `airtable.ts:3993` |
| Llega | `Recibido` | `airtable.ts:4013` |
| Se marca "revisado" en Recepción | `En revisión` | `airtable.ts:4034` y `updateShippingV2ReceptionChecklistItem` |
| Novedad | `Con novedad` | `airtable.ts:3889` |

**Después de `En revisión` no hay nada.** No existe ningún paso de
"aprobar / publicar / poner a la venta" que mueva el item a `Disponible`.

Y el camino manual está **explícitamente bloqueado**:

```ts
// lib/shipping-v2/airtable.ts:2184 — validateInlineItemFieldChange
if (input.field === SHIPPING_V2_ITEM_FIELDS.estadoItem && cleanString(input.normalizedValue) === "Disponible") {
  throw new Error("Este cambio de estado requiere una acción controlada.");
}
```

…pero **esa "acción controlada" no existe**. Los únicos dos sitios que escriben
`"Disponible"` son de reversa, no de avance:

- `liberarItem()` en `lib/facturacion/reservas/efectos.ts` — solo al liberar una
  reserva vencida, y **solo en ambiente "2"** (hoy no corre, ver F-06).
- `revertirInventario()` en `lib/facturacion/notaCredito/` — solo al devolver
  algo ya facturado.

**Evidencia.** De 86 items, **22 están en `En revisión`** — es el estado terminal
de facto del flujo de compra. Los 20 que figuran como `Disponible` son los más
antiguos (LAP-000001 a LAP-000015, del 10 de junio) y no pudieron llegar ahí por
la aplicación: se pusieron a mano en Airtable.

**Impacto.** El estado del inventario deja de describir la realidad: un equipo
listo para vender aparece como "En revisión" para siempre. No bloquea la venta
—el checkbox `Disponible para venta` es independiente y sí se marca al crear—
pero sí rompe cualquier lectura, filtro o reporte basado en `Estado Item`, y
obliga a editar Airtable a mano.

**Agravante.** El checkbox `Disponible para venta` está declarado `readOnly` en
`item-edit-config.ts`, así que tampoco se puede corregir desde la aplicación.
Es lo que deja sin salida a los 8 items de F-24 (estado bloqueado + venta
activa), incluido `LAP-000016` que está `Vendido` y a la vez disponible.

---

### F-41 · P2 · Cambiar el "Tipo de operación" desde la pantalla no recalcula las banderas

En el alta, el tipo de operación determina `Requiere pago`, `Requiere packing`,
`Afecta inventario` y `Disponible para venta`. Pero al cambiarlo después
(edición campo por campo), `updateShippingV2ItemField` solo escribe ese campo:
las cuatro banderas se quedan con los valores del tipo anterior. La única
excepción es `Modo logístico`, que sí ajusta `Requiere packing`.

Resultado: un item que pasa de "Compra a proveedor" a "Uso local" sigue con
`Requiere pago = ✓` y `Disponible para venta = ✓`.

---

### F-39 · P2 · `Órdenes."Abonos"` (link a `Abonos por Orden`) sigue vivo pero fuera de todo cálculo

`Total Abonado NV` es rollup **solo** sobre `Abonos (Operación)` (tabla nueva `Abonos`). El link legacy `Abonos` → `Abonos por Orden` tiene **128 registros**, todos con su orden vinculada, y **no entra en ningún total ni en ninguna pantalla**.

El muestreo sugiere que son el **espejo pre-migración** de la tabla nueva (p. ej. legacy `recIDyNxuvPudRZ5u` = $200 sobre OR000346 ↔ nuevo `recBe2G4Ir3GjGmP8` = $200 sobre OR000346). Pero **no está verificado registro por registro**: la tabla nueva tiene 147 y la legacy 128, y no hay campo de correspondencia poblado (`_old_record_id` está vacío en la muestra). Antes de borrar nada hace falta una **conciliación 1:1 legacy ↔ nuevo**; hasta entonces no se puede afirmar que no quedó dinero histórico atrás.

Riesgo adicional: la tabla legacy sigue teniendo su propio `Estado Financiero` y `Movimiento Financiero ID` — dos campos financieros paralelos a los de la tabla nueva.

---

## 4. Tabla resumen

| ID | Sev | Título | Superficie |
|---|---|---|---|
| F-01 | P0 | Doble conteo de abonos en cuenta unificada | `lib/cuenta-unificada` |
| F-02 | P0 | Abono duplicado en lista y en formas de pago del XML SRI | cuenta unificada · gancho |
| F-03 | P0 | `Total Cotizado` sin escritor vivo → `Saldo Pendiente` roto | Airtable · `lib/operaciones` |
| F-04 | P0 | Factura omite repuestos legacy ($3.234 en 47 órdenes) | gancho facturación |
| F-05 | P0 | `Total a Pagar NV` ignora Shipping Items | Airtable |
| F-06 | P0 | Reservas: abono y bloqueo no se ejecutan fuera de ambiente 2 | `lib/facturacion/reservas` |
| F-07 | P1 | Doble reserva del mismo item (RES-000001/2) | API reservas |
| F-08 | P1 | Tres totales distintos por pantalla | UI · print |
| F-09 | P1 | `MAX(0,…)` oculta 50 sobrepagos | Airtable |
| F-10 | P1 | `Total Cubierto` no prorratea entre items | Airtable |
| F-11 | P1 | 136 abonos ($7.649) sin movimiento financiero | `lib/finanzas/puentes` |
| F-12 | P2 | Gate de repuestos legacy silencia $115 | `lib/cuenta-unificada` |
| F-13 | P2 | Abonos anulados siguen vinculados | datos |
| F-14 | P0 | "Repuesto" en 5 campos, 0 coincidencias | Shipping Items |
| F-15 | P1 | "Reservado" en 4 lugares desincronizados | Shipping Items |
| F-16 | P1 | `Cantidad` vs `Reservado` incompatibles | Shipping Items · gancho |
| F-17 | P1 | Orden↔Operación N:M tratada como 1:1 | todo el código |
| F-18 | P2 | Solo se muestra 1 artículo físico | `lib/operaciones` |
| F-19 | P1 | `/cotizaciones` y `/pedidos` vivos contra tablas inexistentes | rutas · proxy |
| F-20 | P2 | Campos duplicados/redundantes (142 campos) | Shipping Items |
| F-21 | P2 | Prorrateo con `VALUE(ARRAYJOIN(...))` | Airtable |
| F-22 | P0 | Editar item revierte `Estado Item` | `updateShippingV2Item` |
| F-23 | P1 | Alta desde operación salta reglas y validación | `createShippingV2ItemFromOperacion` |
| F-24 | P1 | `Disponible venta` contradice estado (8 items) + literal roto | reglas · datos |
| F-25 | P1 | Repuesto de stock no cambia estado ni se consume | repuestos-v2 |
| F-26 | P2 | TOCTOU en reserva de stock y en reservas | varios |
| F-27 | P2 | Estados sin puerta financiera | operaciones · órdenes |
| F-28 | P2 | 4 máquinas de estado sin reglas cruzadas | Shipping Items |
| F-29 | P1 | Formulario promete campos que no se guardan | `/items/nuevo` |
| F-30 | P2 | Validaciones como texto, no como bloqueo | `/items/nuevo` |
| F-31 | P2 | `Estado item sugerido` engañoso al editar | `/items/[id]` |
| F-32 | P3 | Opciones basura en producción | operaciones |
| F-33 | P3 | Reserva vacía | datos |
| F-34 | P2 | `ID Abono` por MAX()+1 sin unicidad | 3 módulos |
| F-35 | P2 | `Tarifa IVA` vacía en 86/86 items | Shipping Items |
| F-36 | P3 | Cliente triplicado en Reservas | Reservas |
| F-37 | P3 | `precioVenta` de reserva sin contrastar | API reservas |
| F-38 | P3 | `docs/*schema*.json` desactualizados | docs |
| F-39 | P2 | `Abonos por Orden` legacy (128 reg.) fuera de todo cálculo | Airtable |

---

## 5. Contradicciones entre lo que el código afirma y lo que hace

| Afirmación en el código | Realidad |
|---|---|
| *"Los abonos son conjuntos disjuntos por lado"* (`cuenta-unificada/index.ts`) | `createAbonoPorOrden` y `crearAbono` escriben **ambos** links. **F-01** |
| *"cada rollup ya excluye anulados"* (mismo archivo) | ✅ **Correcto**, verificado empíricamente. |
| *"Valida … para evitar reservar dos veces por una condición de carrera"* (`airtable.ts:4278`) | GET + PATCH sin atomicidad. **F-26** |
| *"en PRUEBAS no se escribe nada real"* (`reservas/efectos.ts`) | La **reserva sí se escribe**, con dinero real; solo los efectos se omiten. **F-06** |
| `SALE_BLOCKED_STATES` incluye `"con novedad critica"` | El valor real del select es `"Con novedad"`. La regla nunca aplica. **F-24** |
| *"El ítem debe estar disponible para venta"* (comentario en la API de reservas) | El check funciona, pero como nada actualiza el flag, no impide nada. **F-07** |
| `lib/tecnicos/config/airtable.ts`: `abonosPorOrden: "Abonos por Orden", // legacy, no se escribe más` | ✅ Correcto, pero el link sigue vivo y 42 registros quedan fuera de todo total. **F-39** |

---

## 6. Preguntas abiertas para decidir antes de corregir

1. **¿Cuál debe ser la fuente única de verdad del total de una orden?** ¿La fórmula de Airtable (y entonces hay que meterle los Shipping Items) o `getCuentaUnificada` (y entonces hay que deprecar `Total a Pagar NV` / `Saldo NV` en todas las vistas y prints)?
2. **¿Un abono debe vincularse a orden, a operación, o a ambos?** La decisión determina si se arregla en el escritor (dejar un solo link) o en el lector (deduplicar por `record.id`). Recomendación técnica: **ambos** — un solo link canónico + dedupe defensivo.
3. **¿`Total Cotizado` debe seguir siendo manual?** Lo natural es derivarlo de `Opción Elegida.Precio Venta Cliente` (rollup o escritura en `setOpcionElegida`).
4. **¿Cuál es el campo canónico de "es repuesto"?** Hoy de facto es `Categoría`, pero está contaminada por `createShippingV2ItemFromOperacion`.
5. **¿El modelo de inventario es por unidad o por cantidad?** `Reservado` booleano y `Cantidad` numérica no pueden coexistir sin una tabla de reservas por unidad.
6. **¿Se apagan `/cotizaciones` y `/pedidos` o se migran?** Si se apagan, hay que rescatar antes el escritor de `Total Cotizado`.
7. **¿Los 128 registros de `Abonos por Orden` están todos espejados en la tabla nueva?** Sin conciliación 1:1 no se puede apagar la tabla legacy ni afirmar que no falta dinero.

---

## 7. Anexo — cifras de la auditoría

```
Shipping Items ................. 86     Órdenes ................ 391
  sin Precio venta final ....... 37       modo Legacy .......... 349
  sin Precio venta sugerido .... 72       modo V2 ...............  42
  sin Costo proveedor ..........  6       con operación vinculada    9
  SKU duplicados ...............  0       con >1 operación .......... 1
  Reservado ✓ y estado ≠ Reservado  12    con Repuestos Stock V2 .... 3
  disponible con estado bloqueado    8    Entregado con saldo>0 ..... 77 ($2.861)
  Estado=Pagado sin pago .......  4       abonado > total ........... 50
  Estado=Vendido sin factura ...  2       Completado/Entregado tot=0  217
  Tarifa IVA vacía ............. 86       con factura emitida ........ 2

Operaciones .................... 46     Abonos ................. 147
  Total Cotizado vacío ......... 41       con AMBOS links ........... 2
  Saldo Pendiente negativo ......  3       anulados .................. 3 ($141)
                                          anulados aún vinculados ... 3
Reservas ........................ 4       sin movimiento financiero  136 ($7.649)
  activas ....................... 3       huérfanos ................. 1
  sobre el mismo item ........... 2       ligados a reserva ......... 0
  con Abonos vinculados ......... 0
```

---

*Auditoría generada contra datos en vivo el 2026-07-27. Los `record ID` citados son reales y verificables en la base.*
