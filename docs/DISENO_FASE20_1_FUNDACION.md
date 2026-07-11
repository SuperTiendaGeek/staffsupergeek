# Diseño — Fase 20.1: Fundación del Sistema Contable SG

> Rama: `fase-20-1-fundacion`. Etapa A (este documento) — **sin código de implementación**. Construido sobre `docs/AUDITORIA-FASE-20.md` y `docs/AUDITORIA-FASE-20-0-MOSTRADOR.md`.
> Alcance: solo la fundación (tablas + módulo base `lib/finanzas/` + puente Shipping adaptado + pantalla de verificación). Fuera de alcance explícito: puentes de Abonos/Facturación (20.2), captura de costo por línea (20.3), UI de movimientos internos y acreditación (20.4), cuadre de caja (20.5), egresos vinculados (20.6) — el esquema deja campos y estados listos para esas fases, pero ningún código de esta fase los usa todavía.

---

## 0. Principio que gobierna todo el esquema

Cada movimiento representa **una cuenta que gana o pierde dinero, y qué parte de ese dinero es de cada rubro**. Esto no es exclusivo de los ingresos: la regla del dueño para "Repuesto Proveedor Externo" — *"solo puede estar en Caja o SGINGRESOS y solo sale vía egreso de compra de ese repuesto"* — obliga a que el **egreso** que compra el repuesto también declare cuánto de ese egreso es Repuesto Externo. Por eso las 4 columnas de rubro (§2) existen en el mismo registro para **Ingreso, Egreso y Movimiento Interno** (no solo Ingreso): es el mismo mecanismo el que permite que PayPal retenga rubros "virtuales" sin moverlos, que Caja sepa cuánto de su saldo es Repuesto Externo reservado y no gastable en otra cosa, y que una `Distribución de Rubros` (SGINGRESOS → SGCAPITAL/SGUTILIDAD/SGIVA) sea, estructuralmente, un movimiento más — no un caso especial.

De aquí sale una identidad que el módulo de código valida siempre que `Estado Distribución = Distribuido`:
```
Rubro Capital + Rubro Utilidad + Rubro IVA + Rubro Repuesto Externo = Monto
```
Y una segunda identidad, más útil para el reporte diario, que se cumple siempre (independiente de si algo está distribuido o no):
```
saldo de una cuenta = Σ Monto (destino = cuenta) − Σ Monto (origen = cuenta)     [movimientos Confirmado/Acreditado]
```
La diferencia entre el saldo de una cuenta y la suma de sus 4 columnas de rubro es, por construcción, el dinero "sin clasificar todavía" en esa cuenta (anticipos + pendientes de clasificar) — es una verificación de integridad gratis, no solo un reporte.

---

## 1. Esquema de `Movimientos Financieros` (renombrada de `Shipping Finanzas Movimientos`)

### 1.1 Campos que se conservan tal cual

| Campo | Tipo | Nota |
|---|---|---|
| `Pago Shipping relacionado` | link → Shipping Pagos | Sin cambios |
| `Proveedor` | link → Shipping Proveedores | Sin cambios. Ver §1.5 sobre su alcance limitado |
| `Monto` | currency | Sin cambios — ahora es el monto de cualquier tipo de movimiento, no solo egresos de Shipping |
| `Fecha del movimiento` | dateTime | Sin cambios |
| `Transacción ID` | singleLineText | Sin cambios |
| `Comprobante` | attachment | Sin cambios |
| `Observación` | multilineText | Sin cambios |
| `Registrado por` | singleLineText | Sin cambios |
| `Fecha de creación` | dateTime | Sin cambios |
| `Fecha de anulación` | dateTime | Sin cambios — se sigue llenando al anular |
| `Motivo de anulación` | multilineText | Sin cambios |
| `Shipping Eventos` | link → Shipping Eventos | Sin cambios |

### 1.2 Campos que se modifican

| Campo | Antes | Después | Quién lo escribe |
|---|---|---|---|
| `Movimiento Shipping ID` | `SFM-YYYYMMDD-#####`, primario | Renombrado a **`Movimiento ID`**, mismo formato pero prefijo `MOV-YYYYMMDD-#####` para todo registro nuevo. **Los 11 registros existentes NO se reescriben** — conservan su `SFM-...` (el ID es opaco, ningún código lo parsea ni depende del prefijo — confirmado en la auditoría previa). | `lib/finanzas/movimientos.ts` (`generarMovimientoId()`) |
| `Origen` | singleSelect: `Shipping` (única opción) | Opciones ampliadas: `Shipping`, `Abonos`, `Facturación`, `Nómina`, `Manual`, `Sistema` | El módulo que crea el movimiento (cada puente pasa su propio `Origen`) |
| `Tipo de movimiento` | `Egreso`/`Ingreso`/`Ajuste`/`No aplica` | `Ingreso` / `Egreso` / `Movimiento Interno` / `Ajuste`. La opción `No aplica` queda en el select por compatibilidad histórica de Airtable (no se puede borrar una opción con registros que ya la usaron sin registros que la usen — aquí ninguno la usa, pero se deja) y **el código nunca la vuelve a escribir**. | Igual |
| `Método` | `Transferencia bancaria`/`PayPal`/`Efectivo`/`Tarjeta`/`Depósito`/`Otro`/`No aplica` | Catálogo ampliado y alineado con el resto del portal: `Efectivo`, `Transferencia bancaria`, `Tarjeta débito`, `Tarjeta crédito`, `DataFast`, `PayPhone`, `PayPal`, `Dinero electrónico`, `Depósito`, `Otro`, `No aplica`. Separar débito/crédito/DataFast/PayPhone importa para saber a qué cuenta temporal enrutar (§3) aunque todos caigan hoy en la misma cuenta `Tarjetas en Tránsito`. | Igual |
| `Cuenta origen` (singleSelect de texto) | `Banco Pichincha`/`Caja`/`PayPal`/`Tarjeta`/`Otra`/`No aplica` | **Se retira como singleSelect y se reemplaza por dos campos link** (§1.3): `Cuenta Origen` y `Cuenta Destino`, apuntando a la tabla nueva `Cuentas Financieras`. Un select de texto no puede expresar las reglas de "quién puede transferir a quién" (§4) ni sumarse de forma confiable en código — un link sí. | `lib/finanzas/movimientos.ts` |
| `Estado de integración` | `No aplica`/`Pendiente de generar`/`Pendiente de sincronizar`/`Sincronizado`/`Error`/`Anulado` — placeholder que nunca avanzó (0/11 registros fuera de "Pendiente de sincronizar") | **Se repurpone (mismo campo, no uno nuevo) a `Estado del Movimiento`**, con las 4 opciones nuevas del modelo: `Pendiente`, `Confirmado`, `Acreditado`, `Anulado`. Reusar el campo evita crear un campo redundante y aprovecha que ya es el campo que gobierna si un movimiento "cuenta" — es exactamente su rol nuevo. | `lib/finanzas/movimientos.ts` |

### 1.3 Campos nuevos

| Campo | Tipo | Detalle |
|---|---|---|
| `Cuenta Origen` | link → Cuentas Financieras | Poblado en Egreso y Movimiento Interno; vacío en Ingreso |
| `Cuenta Destino` | link → Cuentas Financieras | Poblado en Ingreso y Movimiento Interno; vacío en Egreso |
| `Categoría` | singleSelect | `Venta Mostrador`, `Venta Producto`, `Servicio Reparación`, `Repuesto`, `Producto Digital`, `Anticipo Cliente`, `Compra Proveedor Shipping`, `Compra Local Repuesto`, `Compra Licencia`, `Nómina`, `Recuperación Garantía`, `Depósito de Caja`, `Distribución de Rubros`, `Acreditación Pasarela`, `Pago SRI`, `Devolución`, `Otro` (catálogo ya decidido, sin cambios) |
| `Rubro Capital` | currency | Ver §0 y §2 |
| `Rubro Utilidad` | currency | Ver §0 y §2 |
| `Rubro IVA` | currency | Ver §0 y §2 |
| `Rubro Repuesto Externo` | currency | Ver §0 y §2 |
| `Estado Distribución` | singleSelect: `Sin distribuir` / `Distribuido` / `Pendiente de clasificar` / `No aplica` | Ver §2.2 |
| `Monto Bruto` | currency | Para 20.4 (acreditación de pasarela). Se crea ahora, no se usa todavía salvo por el puente Shipping (§5, siempre = `Monto`) |
| `Monto Neto` | currency | Igual — vacío hasta 20.4 |
| `Comisión` | currency | Igual — vacío hasta 20.4. Nunca se debita de Capital ni IVA (regla del dueño); cuando 20.4 exista, se debitará de `Rubro Utilidad` del movimiento de acreditación |
| `Abono` | link → Abonos | Trazabilidad. Vacío hasta 20.2 |
| `Factura Electrónica` | link → Facturas Electrónicas | Trazabilidad. Vacío hasta 20.2 |
| `Horarios Pago` | link → Horarios Pagos | Trazabilidad. Vacío hasta el puente de Nómina (fuera de alcance de 20.1) |
| `Cliente` | link → Clientes | Trazabilidad. Vacío hasta 20.2 |
| `Reversa a` | link → Movimientos Financieros (self-link) | El movimiento de reverso apunta aquí al movimiento original que anula. Airtable crea automáticamente el inverso en el registro original (nómbralo `Revertido Por` al crear el campo) |

### 1.4 Placeholders muertos — qué se hace con cada uno

Los tres están en la tabla desde antes de esta fase y, según la auditoría previa, **0 registros los usan y ningún código los lee ni escribe**:

- `Movimiento Finanzas ID futuro` — **eliminar**. Su propósito (apuntar a "la tabla financiera futura") ya no aplica: esta tabla *es* esa tabla ahora.
- `Error de sincronización` — **eliminar**. Era para sincronizar con el libro financiero que hoy es esta misma tabla.
- `Fecha de sincronización` — **eliminar**.

Los tres son seguros de borrar (0 datos, 0 código dependiente, confirmado en `docs/AUDITORIA-FASE-20.md` §A.4). Si el dueño prefiere no tocar el esquema más de lo necesario en el primer paso, la alternativa de mínimo riesgo es dejarlos vacíos y fuera del checklist — no cambia nada funcional. **Recomendación: eliminarlos** (checklist §6, paso 6).

### 1.5 Límite conocido, no resuelto en esta fase

`Proveedor` solo enlaza a `Shipping Proveedores`. Las categorías `Compra Local Repuesto` y `Compra Licencia` (aún sin escritor — fuera de alcance, fase 20.6) hoy no tienen ningún catálogo real de proveedores locales (`docs/AUDITORIA-FASE-20.md` §B5: `Proveedor real` es texto libre en `Repuestos por Orden`). Cuando 20.6 los construya, `Proveedor` quedará vacío en esos movimientos y el nombre del proveedor vivirá en `Observación` hasta que se decida si conviene un catálogo general de proveedores. Se deja anotado, no se resuelve aquí.

---

## 2. Rubros: representación y estados

### 2.1 Por qué 4 columnas currency en vez de una tabla de líneas

Se evaluaron dos alternativas:
- **(a) 4 campos currency en el propio movimiento** (la propuesta del encargo).
- **(b) una tabla `Movimientos Rubros` con una fila por rubro por movimiento** (normalizado).

(b) sería más "correcto" relacionalmente, pero la Fase 20.1 ya tiene que crear una tabla nueva (`Cuentas Financieras`) y adaptar otra — añadir una tercera tabla, más un link adicional en cada movimiento, más las consultas de agregación cruzando dos tablas en cada cálculo de saldo, es complejidad que ninguna pregunta del negocio (§6) necesita hoy: nunca hay más de 4 rubros, nunca cambia el catálogo de rubros, y la identidad de integridad (§0) es más simple de validar en un solo registro que across dos tablas. **Se mantiene (a)** — la propuesta del encargo es la correcta para este tamaño de problema.

### 2.2 `Estado Distribución` — cuándo toma cada valor

| Valor | Cuándo | Ejemplo |
|---|---|---|
| `Sin distribuir` | **Siempre** para `Categoría = Anticipo Cliente`, hasta que la orden/operación se facture (20.2). Columnas de rubro vacías/0. | Abono de reserva |
| `Pendiente de clasificar` | Ingresos reales (no anticipo) cuyo costo todavía no se conoce — hoy, **todo** ingreso de venta, porque la clasificación automática es 20.3. Es el valor por defecto de cualquier `Ingreso` nuevo que no sea anticipo. | Venta de mostrador, cobro de orden |
| `Distribuido` | Cuando `Rubro Capital + Rubro Utilidad + Rubro IVA + Rubro Repuesto Externo = Monto` exactamente (tolerancia $0.01, igual que el resto del sistema de facturación). Se valida en código al crear/actualizar. | Una `Distribución de Rubros` (Movimiento Interno SGINGRESOS→SGCAPITAL/SGUTILIDAD/SGIVA); un egreso de `Compra Local Repuesto` que consume Repuesto Externo (100% ese rubro) |
| `No aplica` | Movimientos que no representan un ingreso a clasificar ni un consumo de un rubro reservado: `Compra Proveedor Shipping`, `Nómina`, `Pago SRI`, `Depósito de Caja` (reubicación de efectivo, no clasificación), `Devolución`, `Otro` por defecto. | Pago a proveedor de shipping |

Esta tabla es una **propuesta razonada, no una regla cerrada** — cualquier categoría puede reclasificarse antes de construir 20.2/20.3 si el dueño ve un caso que no encaja.

### 2.3 Cálculo de saldos — dónde vive la verdad

**Híbrido, con el código como única fuente de verdad; el rollup de Airtable es opcional y solo informativo.**

- **Por qué no 100% rollup de Airtable:** un rollup `SUM` sobre `Cuenta Destino`/`Cuenta Origen` no puede excluir movimientos `Pendiente` o `Anulado` sin un campo auxiliar adicional, y Airtable no permite condicionar un `SUM` por otro campo del mismo registro vinculado sin fórmulas anidadas fragiles. Un saldo mal filtrado en Airtable que alguien mira directo (sin pasar por el portal) es peor que no tener rollup — puede parecer autoritativo y no serlo.
- **Por qué no 100% código sin ningún apoyo visual en Airtable:** el dueño y el equipo usan Airtable directamente para mirar datos fuera del portal; un rollup aproximado con una nota clara de su límite es útil como referencia rápida.
- **Decisión:** `lib/finanzas/saldos.ts` (código) es la única fuente que el portal muestra y en la que confía cualquier validación (p. ej. "no egresos mayores al saldo"). Opcionalmente, en el checklist manual (§6) se puede agregar en `Cuentas Financieras` un rollup `SUM(Movimientos.Monto donde Cuenta Destino = esta)` y otro para `Cuenta Origen`, marcados en su descripción de campo como *"referencia aproximada — incluye Pendientes; el saldo real está en /finanzas"*. No es requisito de esta fase, es un nice-to-have que el dueño puede decidir al ejecutar el checklist.

**Fórmula de saldo por cuenta** (código, `calcularSaldoCuenta`):
```
saldo(cuenta) = Σ Monto  [Cuenta Destino = cuenta, Estado ∈ {Confirmado, Acreditado}]
              − Σ Monto  [Cuenta Origen  = cuenta, Estado ∈ {Confirmado, Acreditado}]
```

**Fórmula de saldo por rubro dentro de una cuenta** (código, `calcularSaldoRubroCuenta`, mismo patrón por cada una de las 4 columnas):
```
saldoRubro(cuenta, rubro) = Σ RubroX  [Cuenta Destino = cuenta, Estado ∈ {Confirmado, Acreditado}]
                           − Σ RubroX [Cuenta Origen  = cuenta, Estado ∈ {Confirmado, Acreditado}]
```
`saldo(cuenta) − Σ saldoRubro(cuenta, cada rubro)` = dinero sin distribuir/sin clasificar que hoy está físicamente en esa cuenta — útil para "cuánta plata de la que hay en Caja todavía no sé de qué es".

**Anticipos sin facturar** (global, no por cuenta):
```
Σ Monto  [Categoría = "Anticipo Cliente", Estado Distribución = "Sin distribuir", Estado ∈ {Confirmado, Acreditado}]
```

Todas estas funciones recorren **todos** los movimientos confirmados de la tabla (sin límite de fecha) para dar el saldo actual real; aceptan un parámetro opcional `hasta: Date` para saldos históricos ("¿cuánto había en Caja el 30 de junio?").

---

## 3. `Cuentas Financieras` — esquema y catálogo inicial

| Campo | Tipo | Detalle |
|---|---|---|
| `Nombre` | singleLineText, primario | — |
| `Tipo de Cuenta` | singleSelect | `Temporal` / `Principal` / `Final` / `Tránsito` |
| `Permite Recibir De` | link → Cuentas Financieras (self, múltiple) | Qué cuentas pueden transferirle dinero directamente (Movimiento Interno) |
| `Permite Transferir A` | link → Cuentas Financieras (self, múltiple) | Espejo — qué cuentas puede alimentar directamente |
| `Activa` | checkbox | Si está en `false`, el código rechaza crear movimientos nuevos contra ella (no afecta el histórico) |

Se modelan las reglas como **datos** (links reales), no como una tabla hardcodeada en código, para que el dueño pueda auditar/ajustar la matriz de permisos directamente en Airtable sin depender de un deploy — el código solo lee `Permite Transferir A`/`Permite Recibir De` al validar un `Movimiento Interno`.

**Catálogo inicial (7 registros), con las reglas del modelo ya cargadas:**

| Nombre | Tipo | Permite Transferir A | Permite Recibir De |
|---|---|---|---|
| Caja Registradora | Temporal | SGINGRESOS | (ninguna — solo recibe de ventas/abonos, no de otras cuentas del catálogo) |
| PayPal | Temporal | SGINGRESOS | (ninguna) |
| Tarjetas en Tránsito | Tránsito | SGINGRESOS | (ninguna — solo recibe vía acreditación, fuera de alcance 20.1) |
| SGINGRESOS | Principal | SGCAPITAL, SGUTILIDAD, SGIVA | Caja Registradora, PayPal, Tarjetas en Tránsito |
| SGCAPITAL | Final | (ninguna directa — solo sale vía egreso de compra real) | SGINGRESOS |
| SGUTILIDAD | Final | (ninguna directa) | SGINGRESOS |
| SGIVA | Final | (ninguna directa — solo sale vía `Pago SRI`) | SGINGRESOS |

Nota sobre PayPal: la regla del dueño (*"PayPal puede retener saldo indefinidamente... con distribución de rubros virtual"*) no es una excepción al modelo de cuentas — es una excepción de **uso**: nada en el esquema impide que un movimiento deje dinero en PayPal indefinidamente sin crear el `Movimiento Interno` hacia SGINGRESOS; simplemente nadie está obligado a hacerlo de inmediato. Los rubros virtuales de PayPal se calculan exactamente con la fórmula de §2.3 sobre los movimientos que sí tocaron PayPal (p. ej. una `Compra Proveedor Shipping` pagada desde PayPal sería un `Egreso` con `Cuenta Origen = PayPal`, reduciendo tanto su saldo como, cuando corresponda, su composición de rubro).

---

## 4. Puente Shipping existente — adaptación sin romper comportamiento

`createFinanceMovementForPago` (`lib/shipping-v2/airtable.ts:2652-2680`) sigue disparándose exactamente igual, desde `markShippingV2PagoAsPaid` (línea 2713-2740), con el mismo guard de idempotencia (`pago.movimientoFinanzasIds.length`). Cambios en los campos que escribe:

| Campo | Antes | Después |
|---|---|---|
| `Origen` | `"Shipping"` | Sin cambio |
| `Tipo de movimiento` | `"Egreso"` | Sin cambio |
| `Categoría` (nuevo) | — | `"Compra Proveedor Shipping"` |
| `Estado de integración` → `Estado del Movimiento` | `"Pendiente de sincronizar"` | `"Confirmado"` (el pago ya es un hecho real y completo cuando se llama esta función — no hay ninguna acreditación pendiente en un pago *a* un proveedor) |
| `Cuenta origen` (select texto) → `Cuenta Origen` (link) | `supportInput.cuentaOrigen` (texto: "Caja"/"PayPal"/etc.) | Resuelto a un record id real de `Cuentas Financieras` vía una tabla de mapeo fija en código (`CUENTA_ORIGEN_LEGACY_A_CUENTA_FINANCIERA`: "Caja"→Caja Registradora, "PayPal"→PayPal, "Banco Pichincha"→SGINGRESOS, "Tarjeta"/"Otra"→ requiere revisión manual, se deja sin resolver y se loguea una advertencia en vez de fallar el pago) |
| `Estado Distribución` (nuevo) | — | `"No aplica"` |
| Resto de campos (`Monto`, `Método`, `Proveedor`, `Transacción ID`, `Comprobante`, `Observación`, `Registrado por`, `Fecha del movimiento`, `Fecha de creación`) | — | Sin cambios |

**Mecanismo de resolución de nombre de tabla (cutover sin ventana de downtime):**

```ts
// lib/finanzas/airtable.ts
const NOMBRES_TABLA_MOVIMIENTOS = ["Movimientos Financieros", "Shipping Finanzas Movimientos"];

let nombreTablaResuelto: string | null = null;
async function resolverNombreTablaMovimientos(): Promise<string> {
  if (nombreTablaResuelto) return nombreTablaResuelto;
  for (const nombre of NOMBRES_TABLA_MOVIMIENTOS) {
    if (await existeTabla(nombre)) { nombreTablaResuelto = nombre; return nombre; }
  }
  throw new Error("Ninguna de las tablas de Movimientos Financieros existe todavía.");
}
```
`existeTabla()` hace un `GET` liviano (p. ej. `pageSize=1`) y cachea el resultado en memoria del proceso (igual que `airtableFieldsCache` ya existente en `lib/cotizaciones/airtable.ts`). Esto permite:
1. Ejecutar el checklist de Airtable (§6, pasos 1-6) con la tabla **aún llamada** `Shipping Finanzas Movimientos`.
2. Desplegar el código de la Etapa B — que prueba primero `"Movimientos Financieros"` (no existe todavía) y cae automáticamente al nombre viejo.
3. Renombrar la tabla en Airtable **en cualquier momento posterior**, sin coordinarlo con un deploy — el próximo request que llegue después del rename simplemente encuentra el nombre nuevo primero.
4. En un commit de limpieza posterior (no en esta fase), quitar el fallback y dejar solo `"Movimientos Financieros"`.

Esto evita por completo el problema de "ventana exacta de cutover" — no hay ninguna secuencia de pasos que deba ejecutarse en un orden de segundos; el rename de Airtable y el deploy de código son independientes entre sí mientras ambos ocurran, en cualquier orden, después del checklist de esquema (§6 pasos 1-6).

---

## 5. Migración de los 11 movimientos existentes

Todos son `Origen: Shipping`, `Tipo de movimiento: Egreso`, `Estado de integración: Pendiente de sincronizar`, suma $6,382.04 (`docs/AUDITORIA-FASE-20.md` §A.3). Valores que reciben en los campos nuevos, uno por uno (manual, 11 registros, parte del checklist §6 paso 5):

| Campo | Valor asignado | Justificación |
|---|---|---|
| `Categoría` | `Compra Proveedor Shipping` | Es exactamente lo que son — pagos a proveedores de shipping ya completados |
| `Cuenta Origen` | Según su `Cuenta origen` actual: `Caja` → Caja Registradora (9 registros); `PayPal` → PayPal (2 registros) | Mapeo directo, sin ambigüedad — los 11 registros solo usan esos 2 valores (`docs/AUDITORIA-FASE-20.md` §A.3) |
| `Estado del Movimiento` | `Confirmado` | Son pagos reales ya hechos y completos — no hay nada "pendiente" en ellos; `Pendiente`/`Acreditado` son estados para dinero que aún no está disponible (tarjeta en tránsito), no aplica a un egreso ya ejecutado |
| `Estado Distribución` | `No aplica` | Un egreso a un proveedor externo de shipping no consume ningún rubro reservado (no es Repuesto Proveedor Externo del modelo de venta al cliente — es una compra distinta) |
| `Rubro Capital/Utilidad/IVA/Repuesto Externo` | Vacíos (0) | Consistente con `Estado Distribución = No aplica` |
| `Movimiento ID` | **Sin cambio** — conservan su `SFM-...` | Ver §1.2 |

**Sin carga histórica de ninguna otra fuente** — solo se adaptan estos 11 registros propios de la tabla; no se importa nada de Abonos, Facturas, ni `Abonos por Orden` (que, además, nunca se lee — confirmado en el encargo).

---

## 6. Checklist de cambios manuales en Airtable (orden exacto)

Ejecutar en este orden. Los pasos 1-6 son schema (antes del deploy); 7-10 son el cutover; 11 es limpieza posterior.

1. Crear la tabla nueva **`Cuentas Financieras`** con los 5 campos de §3 (`Nombre`, `Tipo de Cuenta`, `Permite Recibir De`, `Permite Transferir A`, `Activa`).
2. Crear los 7 registros iniciales de §3, con `Permite Recibir De`/`Permite Transferir A` ya poblados según la tabla de reglas.
3. En `Shipping Finanzas Movimientos` (todavía con ese nombre): agregar los campos nuevos de §1.3 (`Cuenta Origen`, `Cuenta Destino` como link a `Cuentas Financieras`; `Categoría`; los 4 `Rubro *`; `Estado Distribución`; `Monto Bruto`/`Monto Neto`/`Comisión`; `Abono`; `Factura Electrónica`; `Horarios Pago`; `Cliente`; `Reversa a` como self-link).
4. Ampliar las opciones de los selects existentes que cambian (§1.2): `Origen`, `Tipo de movimiento`, `Método`.
5. Renombrar el campo `Estado de integración` a `Estado del Movimiento` y reemplazar sus opciones por `Pendiente`/`Confirmado`/`Acreditado`/`Anulado`.
6. Migrar a mano los 11 registros existentes según §5, y (recomendado) eliminar los 3 placeholders muertos (§1.4): `Movimiento Finanzas ID futuro`, `Error de sincronización`, `Fecha de sincronización`.
7. Deploy del código de la Etapa B (con el mecanismo de fallback de §4) — en este punto la tabla sigue llamándose `Shipping Finanzas Movimientos` y todo sigue funcionando porque el código la encuentra por el nombre viejo.
8. Verificar en `/finanzas` (pantalla de esta fase) que los 11 movimientos migrados y sus saldos se ven correctos.
9. Renombrar la tabla de `Shipping Finanzas Movimientos` a `Movimientos Financieros`.
10. Verificar de nuevo `/finanzas` — debe verse idéntico (el fallback ahora resuelve al nombre nuevo).
11. *(Commit de limpieza posterior, no en esta fase)*: quitar el nombre viejo del arreglo de fallback una vez confirmado estable en producción por unos días.

---

## 7. Prueba de fuego — un día de ejemplo

Cuentas con saldo $0 antes de este día simulado (2026-07-15), para que cada cálculo sea legible.

| # | Hecho | Movimiento generado |
|---|---|---|
| 1 | Venta de mostrador, $45.20, efectivo | `MOV-20260715-00001` — Tipo: Ingreso · Origen: Facturación · Categoría: Venta Mostrador · Monto: $45.20 · Método: Efectivo · Cuenta Destino: Caja Registradora · Estado del Movimiento: Confirmado · Estado Distribución: **Pendiente de clasificar** (20.3 aún no calcula costo) · Factura Electrónica: [link] |
| 2 | Abono de reserva, $100.00, transferencia | `MOV-20260715-00002` — Tipo: Ingreso · Origen: Abonos · Categoría: Anticipo Cliente · Monto: $100.00 · Método: Transferencia bancaria · Cuenta Destino: SGINGRESOS · Estado del Movimiento: Confirmado · Estado Distribución: **Sin distribuir** (por definición) · Abono: [link] · Cliente: [link] |
| 3 | Cobro de orden de reparación, $120.00, tarjeta de crédito | `MOV-20260715-00003` — Tipo: Ingreso · Origen: Facturación · Categoría: Servicio Reparación · Monto: $120.00 · Método: Tarjeta de crédito · Cuenta Destino: Tarjetas en Tránsito · Estado del Movimiento: **Pendiente** (no acreditado — ~2 días) · Estado Distribución: Pendiente de clasificar · Monto Bruto: $120.00 (Monto Neto/Comisión: vacíos hasta 20.4) · Factura Electrónica: [link] |
| 4 | Pago a proveedor de shipping, $300.00, PayPal | `MOV-20260715-00004` — Tipo: Egreso · Origen: Shipping · Categoría: Compra Proveedor Shipping · Monto: $300.00 · Método: PayPal · Cuenta Origen: PayPal · Estado del Movimiento: Confirmado · Estado Distribución: No aplica · Proveedor: [link] · Pago Shipping relacionado: [link] |

### Las 4 preguntas, respondidas con el esquema

**¿Cuánto entró hoy por mostrador, por órdenes y por reservas, cada uno por separado?**
```
SUM(Monto) WHERE Tipo=Ingreso AND Fecha=hoy AND Estado ∈ {Confirmado,Acreditado} GROUP BY Categoría
```
→ Venta Mostrador: **$45.20** · Anticipo Cliente: **$100.00** · Servicio Reparación: **$0 confirmado** (el `#3` de $120 está `Pendiente`, no cuenta todavía — se reporta aparte como *"$120.00 en tránsito, sin confirmar"*, nunca mezclado con el total confirmado).

**¿Cuánto salió hoy y por qué categoría?**
```
SUM(Monto) WHERE Tipo=Egreso AND Fecha=hoy AND Estado ∈ {Confirmado,Acreditado} GROUP BY Categoría
```
→ Compra Proveedor Shipping: **$300.00**.

**¿Cuánto efectivo debería haber físicamente en Caja Registradora ahora mismo?**
```
saldo(Caja Registradora) = Σ Monto[destino=Caja, Confirmado/Acreditado] − Σ Monto[origen=Caja, Confirmado/Acreditado]
```
→ Solo el `#1` tocó Caja Registradora (el abono fue a SGINGRESOS, la tarjeta a Tránsito, el pago a proveedor salió de PayPal). **$45.20.** Este es exactamente el número contra el que el empleado cuadrará la caja física en la Fase 20.5.

**¿Cuánto hay en anticipos sin facturar?**
```
SUM(Monto) WHERE Categoría="Anticipo Cliente" AND Estado Distribución="Sin distribuir" AND Estado ∈ {Confirmado,Acreditado}
```
→ **$100.00** (incluye todo el histórico, no solo hoy — para este ejemplo es el único que existe).

Las 4 preguntas se responden únicamente con `Categoría`, `Tipo de movimiento`, `Cuenta Origen`/`Cuenta Destino`, `Estado del Movimiento` y `Estado Distribución` — **ninguna depende de que la clasificación de rubros (20.3) ya exista**, lo cual es consistente con que esta fase no la construye. Si alguna pregunta hubiera necesitado rubros ya calculados, el diseño estaría incompleto para su propio alcance; no es el caso.

---

## 8. Módulo `lib/finanzas/` — plano para la Etapa B (sin implementar todavía)

```
lib/finanzas/
  table-names.ts       # NOMBRES_TABLA_MOVIMIENTOS + resolverNombreTablaMovimientos() (§4)
  airtable.ts           # cliente Airtable de bajo nivel, patrón seguro (campo inverso + fetchByIds con RECORD_ID())
  cuentas.ts             # fetchCuentasFinancieras(), fetchCuentaPorNombre(nombre)
  movimientos.ts          # crearMovimiento(input), listarMovimientos(filtros), anularMovimiento(id, motivo)
  saldos.ts                # calcularSaldoCuenta(), calcularSaldoRubroCuenta(), calcularAnticiposSinFacturar()
  validaciones.ts           # reglas puras de integridad (testeables sin red, ver §9)
types/finanzas.ts        # TipoMovimiento, EstadoMovimiento, EstadoDistribucion, CategoriaMovimiento, TipoCuenta, Movimiento, CuentaFinanciera
app/finanzas/page.tsx    # pantalla de solo lectura: lista de movimientos + saldos por cuenta
app/api/finanzas/movimientos/route.ts   # GET (lista, para la pantalla)
app/api/finanzas/saldos/route.ts         # GET (saldos por cuenta, para la pantalla)
```

`crearMovimiento(input)` es la única puerta de escritura (el puente Shipping adaptado la llama igual que cualquier otro origen futuro) y corre `validaciones.ts` antes de cualquier `POST`:
- `validarCuentasPermitidas(tipoMovimiento, cuentaOrigen, cuentaDestino)` — Ingreso: solo destino; Egreso: solo origen; Movimiento Interno: ambos, y `cuentaDestino` debe estar en `cuentaOrigen.PermiteTransferirA` (o inversamente en `PermiteRecibirDe`).
- `validarSumaRubros(monto, rubros, estadoDistribucion)` — si `Distribuido`, la suma debe igualar `monto` (tolerancia $0.01); si no, los 4 campos deben venir vacíos/0.
- `validarSaldoSuficiente(cuentaOrigen, monto)` — para Egreso/Movimiento Interno, el saldo actual de `cuentaOrigen` (§2.3) debe ser ≥ `monto`.
- `validarCuentaActiva(cuenta)`.

`anularMovimiento(id, motivo)` nunca hace `PATCH`/`DELETE` sobre los campos de negocio del original — solo cambia `Estado del Movimiento → Anulado`, llena `Fecha de anulación`/`Motivo de anulación`, y **crea un movimiento nuevo** con los montos y cuentas invertidas (origen↔destino intercambiados si era Movimiento Interno; mismo tipo con signo económico contrario si era Ingreso/Egreso), vinculado vía `Reversa a`.

---

## 9. Plan de pruebas — Etapa B

Mínimo exigido por el encargo, más los casos que se derivan directamente de este diseño:

1. **Reverso de anulación**: crear un movimiento, anularlo → aparece un movimiento nuevo vinculado por `Reversa a`, el original queda `Anulado`, `calcularSaldoCuenta` de las cuentas involucradas vuelve exactamente al valor previo a ambos movimientos.
2. **Saldo nunca negativo por egreso**: intentar crear un Egreso/Movimiento Interno por más del saldo disponible de `Cuenta Origen` → `crearMovimiento` rechaza antes de llamar a Airtable.
3. **Suma de rubros = monto cuando `Distribuido`**: crear un movimiento con `Estado Distribución = Distribuido` y rubros que no suman el monto → rechazado. Con rubros que sí suman (incluida tolerancia $0.01) → aceptado.
4. **Movimientos entre cuentas prohibidas rechazados**: intentar un Movimiento Interno `Caja Registradora → SGCAPITAL` directo (no está en `Permite Transferir A` de Caja) → rechazado.
5. **Idempotencia del puente Shipping**: llamar dos veces al flujo de `markShippingV2PagoAsPaid` sobre el mismo pago → un solo movimiento creado (el guard existente por `movimientoFinanzasIds.length` sigue funcionando igual).
6. **Resolución de nombre de tabla**: con solo la tabla vieja presente, con solo la nueva, y con ninguna de las dos (debe lanzar error claro) — cubre el mecanismo de cutover de §4.
7. **Migración de los 11 movimientos**: test de datos (no de código) que verifica, contra el entorno real tras ejecutar el checklist, que los 11 tienen `Categoría=Compra Proveedor Shipping`, `Estado del Movimiento=Confirmado`, `Cuenta Origen` resuelta, y que `Σ Monto` de esos 11 sigue siendo $6,382.04 (nada se perdió en la migración).
8. **Componentes de pago mixto suman exacto el total**: validador construido ya (para 20.4) — test unitario directo de `validarComponentesPagoMixtoSumanTotal` con componentes que sí/no cuadran, sin necesidad de que 20.4 exista todavía.

---

## Resumen para aprobar

Esta fase: renombra 1 tabla (con cutover sin downtime vía fallback de nombre), crea 1 tabla nueva (`Cuentas Financieras`, 7 registros), agrega ~15 campos a `Movimientos Financieros`, repropone 2 campos existentes, elimina 3 placeholders muertos, migra 11 registros a mano, y construye un módulo de código de solo escritura controlada + saldos calculados + una pantalla de solo lectura. No mueve dinero real, no toca ningún otro módulo del portal salvo el puente Shipping (adaptado sin cambiar su comportamiento observable), y dejó explícitamente listos — pero vacíos — los campos que 20.2-20.6 van a usar.

**Pendiente de tu aprobación antes de escribir cualquier código de la Etapa B.**
