# Resultado — Fase 20.1: Fundación del Sistema Contable SG (Etapa B)

> Rama: `fase-20-1-fundacion`. Diseño aprobado en `docs/DISENO_FASE20_1_FUNDACION.md` (v2, con las 4 correcciones integradas). Este documento cierra la Etapa B: qué se construyó, cómo verificarlo, y los pasos exactos que faltan.
> **Actualización:** el checklist de la sección 2 **ya se ejecutó** contra la base de producción, vía API (cambio de plan aprobado por el dueño, con respaldo previo confirmado). Ver "§2-bis — Ejecución real" para el detalle exacto de lo que se hizo, los 2 hallazgos que obligaron a desviarse del plan original, y lo que queda pendiente (Paso 4, manual). **Sin merge a `main`. Sin deploy.**

---

## 1. Qué se construyó

### 1.1 Módulo `lib/finanzas/`

| Archivo | Responsabilidad |
|---|---|
| `table-names.ts` | Fallback de nombre de tabla (`Movimientos Financieros` / `Shipping Finanzas Movimientos`) + invalidación de caché y reintento ante `TABLE_NOT_FOUND` (Corrección 4, §4 del diseño). |
| `airtable-client.ts` | Cliente Airtable de bajo nivel: `getClient`, `tableUrl`, `airtableRequest`/`airtableMutation`, y `fetchRecordsByIds` (patrón seguro del proyecto — nunca filtra una tabla por campo de link, siempre `RECORD_ID()` a partir de ids ya conocidos). |
| `cuentas.ts` | Lectura de `Cuentas Financieras`: `fetchCuentasFinancieras`, `fetchCuentaById`, `fetchCuentaPorNombre`. Incluye `Saldo Inicial`/`Fecha de Corte` (Corrección 2). |
| `movimientos-fields.ts` | Nombres de campo **nuevos** de `Movimientos Financieros` (compartido entre `movimientos.ts` y `saldos.ts` para evitar un ciclo de imports) + el mapper `mapMovimiento`. |
| `validaciones.ts` | Reglas de integridad puras, sin red: suma de rubros vs. monto (§0), cuentas requeridas por tipo de movimiento, matriz de transferencia permitida, y la política de saldo dividida por tipo (Corrección 2: `Movimiento Interno` rechaza, `Egreso`/`Ajuste` se registra y marca `Alerta Descuadre`). |
| `movimientos.ts` | `crearMovimiento` (única puerta de escritura, corre todas las validaciones antes de tocar Airtable), `anularMovimiento` (Corrección 1 — nunca crea un movimiento nuevo, solo cambia estado), `listarMovimientos`, `fetchMovimientoById`. |
| `saldos.ts` | `calcularSaldoCuenta` (con Saldo Inicial + Fecha de Corte, Corrección 2), `calcularSaldoRubroCuenta`, `calcularSaldoSinClasificarCuenta`, `calcularAnticiposSinFacturar`. |
| `auth.ts` | `requireFinanzasSession` — mismo patrón que `lib/shipping-v2/auth.ts`, contra el permiso `"Finanzas"` (ya registrado en `lib/apps.ts`, no se tocó). |

`types/finanzas.ts` — todos los tipos: `TipoMovimiento`, `EstadoMovimiento`, `EstadoDistribucion`, `OrigenMovimiento`, `CategoriaMovimiento`, `TipoCuenta`, `Rubro`/`RubrosMonto`, `Movimiento`, `CuentaFinanciera`, `CrearMovimientoInput`.

### 1.2 Puente Shipping adaptado

`createFinanceMovementForPago` (`lib/shipping-v2/airtable.ts`) ya no hace `POST` directo a los campos legacy de Finanzas — llama a `crearMovimiento()` de `lib/finanzas/movimientos.ts`, igual que cualquier origen futuro (Abonos, Facturación). Cambios puntuales:

- `resolveCuentaFinancieraLegacy()` (nuevo, mismo archivo): mapea el texto legacy de `Cuenta origen` de Shipping Pagos (`"Caja"`, `"PayPal"`, `"Banco Pichincha"`) a un record id real de `Cuentas Financieras`. Sin mapeo conocido (`"Tarjeta"`/`"Otra"`) → `console.warn` + el movimiento se crea sin `Cuenta Origen`, usando el escape hatch `{ permitirCuentaFaltante: true }` de `crearMovimiento` — documentado en `CrearMovimientoOptions` como exclusivo de este llamador (§4 del diseño: nunca bloquear un pago a proveedor ya hecho).
- Mismo guard de idempotencia (`if (pago.movimientoFinanzasIds.length) return ...`), sin tocar.
- `generateFinanceMovementId()` se eliminó (quedó sin uso — `crearMovimiento` genera su propio `MOV-YYYYMMDD-#####`).
- El campo viejo `Estado de integración` **deja de escribirse** desde este puente (Corrección 3) — queda congelado en lo que tenga cada registro hasta la limpieza final del checklist.
- **Comportamiento observable sin cambios**: mismos campos en `Shipping Pagos`, mismo flujo, misma respuesta al usuario. Verificado con el test #7 (idempotencia).

### 1.3 Pantalla y API de solo lectura

- `app/finanzas/page.tsx` — reemplaza el placeholder vacío. Muestra el saldo calculado de cada `Cuenta Financiera`, el total de anticipos sin facturar, y una tabla de los movimientos más recientes (con ⚠ visible cuando `Alerta Descuadre = true`). Server Component, mismo patrón que `app/shipping-v2/page.tsx` (banner de error si Airtable no responde — hoy eso incluye "las tablas nuevas todavía no existen", que es exactamente el estado actual).
- `GET /api/finanzas/movimientos` — lista filtrable por `tipo`/`categoria`/`estado`/`desde`/`hasta`.
- `GET /api/finanzas/saldos` — saldo y composición de rubros por cuenta + anticipos sin facturar.

Ambas rutas y la página usan `requireFinanzasSession()` — mismo permiso `"Finanzas"` que ya existía en `lib/apps.ts` (roles `admin`/`manager`/`finance`).

### 1.4 Tests — `lib/finanzas/__tests__/`

9 de los 10 tests de §9 del diseño, automatizados con un doble en memoria de Airtable (`_airtableDouble.ts`, simula `Cuentas Financieras` y `Movimientos Financieros`, incluido el mantenimiento automático de los campos inversos que hace Airtable de verdad) — **ninguno toca la red real**:

| # | Archivo | Verifica |
|---|---|---|
| 1 | `1.anulacion.test.ts` | Anular NO crea movimiento nuevo; saldo vuelve exacto al valor previo; anular dos veces falla. |
| 2 | `2.movimiento-interno-saldo-insuficiente.test.ts` | `Movimiento Interno` sin saldo → rechazado, cero registros creados. |
| 3 | `3.egreso-alerta-descuadre.test.ts` | `Egreso` sin saldo (réplica del caso PayPal de la Prueba de Fuego) → se crea, `Alerta Descuadre = true`, saldo calculado queda negativo visible. |
| 4 | `4.saldo-inicial-fecha-corte.test.ts` | Movimientos previos a `Fecha de Corte` (incluido un legacy) no alteran el saldo; posteriores sí. |
| 5 | `5.suma-rubros.test.ts` | Identidad de integridad de rubros por cada `Estado Distribución`. |
| 6 | `6.cuentas-prohibidas.test.ts` | Transferencia no autorizada (Caja→SGCAPITAL) rechazada a nivel puro y de integración; control positivo (Caja→SGINGRESOS) sí pasa. |
| 7 | `7.idempotencia-puente-shipping.test.ts` | `markShippingV2PagoAsPaid` llamado dos veces crea un solo movimiento — el guard sigue intacto tras la adaptación. |
| 8 | `8.resolucion-tabla.test.ts` | Fallback con solo-vieja/solo-nueva/ninguna, y reintento automático tras invalidación de caché simulando un rename real. |
| 10 | `10.pago-mixto.test.ts` | Componentes de pago mixto (validador listo para 20.4). |

Comando para correr todos (el #7 necesita la flag de React Server Components porque importa `lib/shipping-v2/airtable.ts`, que tiene `"server-only"`):

```bash
for f in lib/finanzas/__tests__/*.test.ts; do
  [[ "$f" == *"9.migracion-legacy"* ]] && continue
  if [[ "$f" == *"7.idempotencia"* ]]; then
    NODE_OPTIONS="--conditions react-server" npx tsx "$f"
  else
    npx tsx "$f"
  fi
done
```

**Test #9 (`9.migracion-legacy.live.test.ts`) es deliberadamente distinto** — test de *datos*, no de código, tal como pedía el diseño (§9 #9): se omite solo si faltan `AIRTABLE_API_KEY`/`AIRTABLE_BASE_ID`, y necesita que el checklist manual ya se haya ejecutado contra la base real (hoy fallaría: los campos `Categoría`/`Estado del Movimiento` todavía no existen en Airtable). **Correrlo es el último paso de verificación después del checklist, no antes.**

`npm run typecheck` pasa limpio sobre todo el proyecto (no solo los archivos nuevos).

---

## 2. Checklist manual de Airtable — listo para ejecutar

Reproducido de `docs/DISENO_FASE20_1_FUNDACION.md` §6, con los nombres de campo exactos que el código ya espera (tomados literalmente de `lib/finanzas/cuentas.ts` y `lib/finanzas/movimientos-fields.ts` — si algo se crea con un nombre distinto, el código no lo va a encontrar).

### Fase aditiva (segura con producción vieja corriendo — ningún paso de aquí rompe nada existente)

**Paso 1 — Crear la tabla `Cuentas Financieras`**, campos:

| Campo | Tipo Airtable |
|---|---|
| `Nombre` | Texto de línea única (primario) |
| `Tipo de Cuenta` | Selección única: `Temporal`, `Principal`, `Final`, `Tránsito` |
| `Permite Recibir De` | Vínculo a registro → **la misma tabla** `Cuentas Financieras` |
| `Permite Transferir A` | Vínculo a registro → **la misma tabla** `Cuentas Financieras` |
| `Activa` | Casilla de verificación |
| `Saldo Inicial` | Moneda |
| `Fecha de Corte` | Fecha |

**Paso 2 — Crear los 7 registros iniciales** (`Saldo Inicial`/`Fecha de Corte` se dejan vacíos por ahora — se llenan en el paso 9):

| Nombre | Tipo de Cuenta | Permite Transferir A |
|---|---|---|
| Caja Registradora | Temporal | SGINGRESOS |
| PayPal | Temporal | SGINGRESOS |
| Tarjetas en Tránsito | Tránsito | SGINGRESOS |
| SGINGRESOS | Principal | SGCAPITAL, SGUTILIDAD, SGIVA |
| SGCAPITAL | Final | *(ninguna)* |
| SGUTILIDAD | Final | *(ninguna)* |
| SGIVA | Final | *(ninguna)* |

(`Permite Recibir De` se puede dejar vacío — el código valida en ambos sentidos, `validarTransferenciaPermitida` acepta que el permiso esté declarado desde cualquiera de los dos lados.)

**Paso 3 — En la tabla `Shipping Finanzas Movimientos` (sin renombrar todavía), agregar estos campos nuevos:**

| Campo | Tipo Airtable |
|---|---|
| `Cuenta Origen` | Vínculo a registro → `Cuentas Financieras` |
| `Cuenta Destino` | Vínculo a registro → `Cuentas Financieras` |
| `Categoría` | Selección única: `Venta Mostrador`, `Venta Producto`, `Servicio Reparación`, `Repuesto`, `Producto Digital`, `Anticipo Cliente`, `Compra Proveedor Shipping`, `Compra Local Repuesto`, `Compra Licencia`, `Nómina`, `Recuperación Garantía`, `Depósito de Caja`, `Distribución de Rubros`, `Acreditación Pasarela`, `Pago SRI`, `Devolución`, `Otro` |
| `Estado del Movimiento` | Selección única: `Pendiente`, `Confirmado`, `Acreditado`, `Anulado` — **campo nuevo, NO renombrar `Estado de integración`** |
| `Rubro Capital` | Moneda |
| `Rubro Utilidad` | Moneda |
| `Rubro IVA` | Moneda |
| `Rubro Repuesto Externo` | Moneda |
| `Estado Distribución` | Selección única: `Sin distribuir`, `Distribuido`, `Pendiente de clasificar`, `No aplica` |
| `Alerta Descuadre` | Casilla de verificación |
| `Monto Bruto` | Moneda |
| `Monto Neto` | Moneda |
| `Comisión` | Moneda |
| `Abono` | Vínculo a registro → `Abonos` |
| `Factura Electrónica` | Vínculo a registro → `Facturas Electrónicas` |
| `Horarios Pago` | Vínculo a registro → `Horarios Pagos` |
| `Cliente` | Vínculo a registro → `Clientes` |
| `Reversa a` | Vínculo a registro → **la misma tabla** (self-link). Al crearlo, Airtable pedirá nombre para el campo inverso automático — ponle **`Compensado Por`**. |

**Importante — dos campos inversos que Airtable crea solos:** al crear `Cuenta Origen`/`Cuenta Destino` arriba (vínculos hacia `Cuentas Financieras`), Airtable agrega automáticamente, del lado de `Cuentas Financieras`, dos campos inversos nuevos (los nombres por default suelen ser el nombre de la tabla origen, p. ej. "Shipping Finanzas Movimientos" y "Shipping Finanzas Movimientos 2"). **Hay que renombrarlos** a:
- El inverso de `Cuenta Origen` → **`Movimientos (Origen)`**
- El inverso de `Cuenta Destino` → **`Movimientos (Destino)`**

El código (`lib/finanzas/cuentas.ts`, `CUENTAS_FIELDS.movimientosOrigen`/`movimientosDestino`) los busca exactamente por esos dos nombres — si se dejan con el nombre por default, `calcularSaldoCuenta` no va a encontrar ningún movimiento y todos los saldos van a dar $0 aunque haya datos.

**Paso 4 — Agregar (nunca quitar ni renombrar) opciones nuevas a los selects existentes:**
- `Origen`: agregar `Abonos`, `Facturación`, `Nómina`, `Manual`, `Sistema` (ya tiene `Shipping`).
- `Tipo de movimiento`: agregar `Movimiento Interno` (ya tiene `Egreso`, `Ingreso`, `Ajuste`, `No aplica`).
- `Método`: agregar `Tarjeta débito`, `Tarjeta crédito`, `DataFast`, `PayPhone`, `Dinero electrónico` (ya tiene `Transferencia bancaria`, `PayPal`, `Efectivo`, `Tarjeta`, `Depósito`, `Otro`, `No aplica`).

**Paso 5 — Migrar a mano los 11 registros existentes** (ver `docs/DISENO_FASE20_1_FUNDACION.md` §5 para el detalle registro por registro — 9 con `Cuenta origen = Caja`, 2 con `Cuenta origen = PayPal`):
- `Categoría` = `Compra Proveedor Shipping` (los 11).
- `Cuenta Origen` (link nuevo) = `Caja Registradora` o `PayPal` según su `Cuenta origen` (select viejo) actual.
- `Estado del Movimiento` (campo nuevo) = `Confirmado` (los 11).
- `Estado Distribución` = `No aplica` (los 11).
- **No tocar** `Cuenta origen` ni `Estado de integración` (viejos) — se dejan tal como están.

**Paso 6 — Deploy del código de esta rama** (tras merge y aprobación) — la tabla todavía se llama `Shipping Finanzas Movimientos` en este punto y todo sigue funcionando porque el código la encuentra por el nombre viejo (fallback de §4 del diseño).

**Paso 7 — Verificar `/finanzas`**: los 11 movimientos migrados deben verse en la tabla con su `Categoría`/`Cuenta Origen`/`Estado` correctos; los saldos de las 7 cuentas deben dar $0 (todavía sin `Saldo Inicial`).

**Paso 8 — Renombrar la tabla** de `Shipping Finanzas Movimientos` a `Movimientos Financieros`, en cualquier momento a partir de aquí — no requiere coordinarlo con el deploy.

**Paso 9 — Día de go-live real**: contar el dinero físico/bancario de cada una de las 7 cuentas y llenar `Saldo Inicial`/`Fecha de Corte` (la fecha de ese mismo día) en cada registro de `Cuentas Financieras`.

**Paso 10 — Verificar `/finanzas`** de nuevo: los saldos ahora deben reflejar el `Saldo Inicial` cargado más cualquier movimiento del propio día.

**Paso 9-live — Correr el test de datos** `npx tsx lib/finanzas/__tests__/9.migracion-legacy.live.test.ts` contra la base real, para confirmar que la migración del paso 5 quedó bien (11 registros, todos `Confirmado`, todos con `Cuenta Origen`, suma $6,382.04).

### Limpieza final (posterior, después de unos días con el código nuevo estable en producción)

**Paso 11.** Eliminar los 3 placeholders muertos: `Movimiento Finanzas ID futuro`, `Error de sincronización`, `Fecha de sincronización`.
**Paso 12.** Eliminar el campo viejo `Estado de integración`.
**Paso 13.** Eliminar el campo viejo `Cuenta origen` (select).
**Paso 14** *(opcional, cosmético)*. Renombrar `Movimiento Shipping ID` a `Movimiento ID`.
**Paso 15.** Quitar del código (`lib/finanzas/table-names.ts`, `NOMBRES_TABLA_MOVIMIENTOS`) el nombre viejo `"Shipping Finanzas Movimientos"`, dejando solo `"Movimientos Financieros"` — commit aparte, no en esta rama todavía.

---

## 2-bis. Ejecución real del checklist (vía API, contra producción)

Ejecutado el 2026-07-11 vía Metadata API + REST API de Airtable, con el respaldo del dueño ya confirmado antes de empezar. Verificado paso a paso, sin improvisar sobre datos reales cuando algo no salió como esperaba — dos veces hubo que desviarse del plan escrito, documentado abajo.

**Pasos 1-3 y 5 (crear tabla, 7 cuentas, 18 campos nuevos, migrar los 11 registros): completados exactamente como estaban planeados**, con dos hallazgos:

### Hallazgo 1 — Colisión de nombre: `Cuenta Origen` vs `Cuenta origen`

Airtable trata los nombres de campo como **case-insensitive** para unicidad dentro de una tabla. El campo nuevo `Cuenta Origen` (como estaba escrito en el diseño original) chocó con el viejo `Cuenta origen` (select legacy, que Corrección 3 exige dejar intacto) — error `DUPLICATE_OR_EMPTY_FIELD_NAME`. No se podía resolver renombrando el campo viejo primero, porque el código de producción actual (sin el deploy de esta fase) todavía lo escribe en cada pago a proveedor.

**Resuelto, con aprobación del dueño en el momento:** los campos se llamaron **`Cuenta Origen (Finanzas)`** y **`Cuenta Destino (Finanzas)`** (simétrico, aunque solo `Cuenta Origen` tenía colisión). Actualizado en el código real: `lib/finanzas/movimientos-fields.ts` (`MOVIMIENTOS_FIELDS.cuentaOrigen`/`cuentaDestino`) — el resto del módulo (`crearMovimiento`, `saldos.ts`, los 9 tests automatizados) no necesitó ningún otro cambio porque todo lee el nombre real a través de esa constante, nunca hardcodeado. `npm run typecheck` y la suite completa se corrieron de nuevo después del cambio — sin regresiones.

### Hallazgo 2 — La API de Airtable no permite ampliar opciones de un select existente

`PATCH /meta/bases/{baseId}/tables/{tableId}/fields/{fieldId}` acepta cambios de `name`/`description` (verificado, funciona), pero **rechaza cualquier cambio a `options.choices`** con `422 INVALID_REQUEST_UNKNOWN` — probado con la lista completa (existentes + nuevas), y también reenviando el único choice existente sin ningún cambio. No es un problema de formato del payload: es una limitación real de la API para el endpoint de actualización de campo. (Los campos **nuevos** sí llevan todas sus opciones completas porque esas se definen en la creación, que sí funciona — el problema es únicamente *ampliar* un select preexistente.)

**Paso 4 (ampliar opciones de `Origen`, `Tipo de movimiento`, `Método`) queda pendiente — es la única parte de todo el checklist que sí requiere una acción manual del dueño en la UI de Airtable.** Lista exacta a agregar (sin tocar ninguna opción existente):

| Campo | Opciones nuevas a agregar |
|---|---|
| `Origen` | `Abonos`, `Facturación`, `Nómina`, `Manual`, `Sistema` |
| `Tipo de movimiento` | `Movimiento Interno` |
| `Método` | `Tarjeta débito`, `Tarjeta crédito`, `DataFast`, `PayPhone`, `Dinero electrónico` |

Ningún código de esta fase depende todavía de que estas opciones existan (el puente Shipping solo escribe `Origen: "Shipping"` y `Tipo de movimiento: "Egreso"`, que ya existían) — no bloquea nada más del checklist ni de los tests.

### Efecto secundario menor — campos inversos "From field: ..." sin usar

Los self-links de `Cuentas Financieras` (`Permite Recibir De`/`Permite Transferir A`) generaron, cada uno, su propio campo inverso automático dentro de la misma tabla (`From field: Permite Recibir De`, `From field: Permite Transferir A`) — comportamiento normal de Airtable para links de una tabla a sí misma que el diseño original no había anticipado. Quedaron con su nombre por defecto; ningún código los lee. Se dejaron tal cual (no estaba autorizado tocar más campos de los previstos) — el dueño puede renombrarlos, ocultarlos de las vistas, o dejarlos así; es cosmético, no hay ningún dato en riesgo.

### Resultado de la migración de los 11 registros (Paso 5)

Verificado con el test #9 en vivo (`npx tsx lib/finanzas/__tests__/9.migracion-legacy.live.test.ts`) contra la base real:

```
✓ Hay exactamente 11 movimientos con Categoría "Compra Proveedor Shipping" (obtenido: 11)
✓ Los 11 tienen Estado del Movimiento = Confirmado
✓ Los 11 tienen Cuenta Origen resuelta (no vacía)
✓ La suma de Monto de los 11 sigue siendo $6,382.04 (obtenido: $6382.04)
```

9 con `Cuenta Origen (Finanzas)` = Caja Registradora, 2 con PayPal — coincide exactamente con `docs/AUDITORIA-FASE-20.md` §A.3. `Cuenta origen`/`Estado de integración` (viejos) no se tocaron en ninguno de los 11 — verificado en cada respuesta de la API, que devuelve el registro completo tras cada `PATCH`.

Los 9 tests automatizados de la suite en memoria y `npm run typecheck` se corrieron de nuevo después de todos los cambios anteriores — todo pasa limpio.

---

## 3. Lo que falta y quién lo hace

- **Paso 4 (agregar las opciones de select de arriba)** — el dueño, a mano en Airtable. Es lo único que quedó pendiente de todo el checklist.
- **Merge de esta rama a `main` y deploy** — con el dueño, después de revisar el código y este documento.
- **Renombrar la tabla** (`Shipping Finanzas Movimientos` → `Movimientos Financieros`, Paso 8) y **el día de go-live real** (Paso 9: contar el dinero físico/bancario de las 7 cuentas y llenar `Saldo Inicial`/`Fecha de Corte`) — ambos son del dueño, en el momento que decida, sin coordinación de tiempos con el deploy (el fallback de nombre de tabla ya lo permite).
- **Limpieza final** (Pasos 11-15: eliminar los 3 placeholders muertos, `Estado de integración`, `Cuenta origen`, y el fallback de nombre en el código) — después de unos días con el código nuevo estable en producción.
- **Fases siguientes** (fuera de alcance de 20.1, esquema ya las deja previstas): puentes de Abonos y Facturación (20.2) — hoy `crearMovimiento` está listo para que esos módulos lo llamen igual que el puente Shipping; captura de costo/rubro por línea (20.3); UI de movimientos internos y acreditación de pendientes (20.4) — `Monto Bruto`/`Monto Neto`/`Comisión` ya existen en el esquema, sin código que los use; cuadre de caja (20.5); egresos vinculados de Nómina/Repuestos/Licencias (20.6).

**Detenido aquí, tal como se pidió — sin merge, sin deploy, sin tocar Airtable.**
