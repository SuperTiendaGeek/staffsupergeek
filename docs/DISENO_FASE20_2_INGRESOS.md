# Diseño — Fase 20.2: Ingresos (puentes Abonos→Movimientos y Facturación→Movimientos)

> Rama: `fase-20-2-ingresos`. Etapa A — **sin código de implementación**. Construido sobre `docs/DISENO_FASE20_1_FUNDACION.md`, `docs/FASE20_1_RESULTADO.md`, `docs/AUDITORIA-FASE-20.md`, `docs/AUDITORIA-FASE-20-0-MOSTRADOR.md`, y una investigación de código fresca (2026-07-12) que corrige una asunción del propio diseño 20.1.

---

## 0. Hallazgo previo que reencuadra el alcance

`docs/DISENO_FASE20_1_FUNDACION.md` (§2.2, §7 caso `#2`) **asume** que un movimiento `Origen: Abonos / Categoría: Anticipo Cliente` ya se crea "al momento del abono". Verificado ahora contra el código real: **eso no existe todavía**. `crearAbono()` (`lib/operaciones/airtable.ts:388-421`) y `createAbonoPorOrden()` (`lib/tecnicos/airtable/index.ts:2224-2319`) escriben únicamente en la tabla `Abonos` — ninguno de los dos llama `crearMovimiento()`. El Puente 1 de esta fase no es "conectar un enganche que ya existe": es construirlo desde cero.

Segundo hallazgo con el mismo efecto: `lib/finanzas/movimientos.ts` hoy solo tiene `crearMovimiento`, `anularMovimiento`, `fetchMovimientoById`, `listarMovimientos` — **no existe ninguna función para actualizar un movimiento ya creado**. El Puente 2(b) (marcar como facturados los movimientos de abonos ya existentes) necesita una función nueva, `actualizarMovimiento()`, con alcance deliberadamente angosto (nunca toca `Monto`/cuentas/`Tipo`/`Categoría` — esos son hechos económicos inmutables tras la creación).

---

## 1. Puente 1 — Abonos → Movimientos

### 1.1 Puntos de enganche exactos (verificados hoy)

| # | Función que crea el Abono | Archivo:línea | Endpoint | Dónde queda el record id nuevo |
|---|---|---|---|---|
| 1 | `crearAbono()` | `lib/operaciones/airtable.ts:388-421` | `POST /api/operaciones/[id]/abonos` (`app/api/operaciones/[id]/abonos/route.ts:48-57`) | variable `newId` (= `{ id }` del retorno), disponible justo después del `await crearAbono(...)`, línea 48 |
| 2 | `createAbonoPorOrden()` | `lib/tecnicos/airtable/index.ts:2224-2319` | `POST /api/tecnicos/ordenes/[id]/abonos` (`app/api/tecnicos/ordenes/[id]/abonos/route.ts:147-157`) | `result.abono.id`, disponible justo después del `await createAbonoPorOrden(...)`, línea 147 |

Confirmado que **no hay un tercer escritor** de la tabla `Abonos` (`tbli03YnDxVsrnmZK`): existe un tercer resultado, `createAbonoCotizacion()` (`lib/cotizaciones/airtable.ts:1274`), pero escribe en `"Abonos de Cotización"` — tabla físicamente distinta, módulo con `ModuloMudadoRedirect` (muerto en la UI, confirmado en `docs/AUDITORIA-FASE-20.md`). Fuera de alcance.

**Anulación** — `anularAbonoPorOrden()` (`lib/tecnicos/airtable/index.ts:2887-2918`), expuesta vía `DELETE /api/tecnicos/abonos-por-orden/[id]` (`app/api/tecnicos/abonos-por-orden/[id]/route.ts:1-32`). Único punto que cambia `Estado del Abono` a `"Anulado"` en todo el repo (verificado, grep exhaustivo). `lib/operaciones/airtable.ts` no tiene función de anulación propia — este único endpoint puede anular cualquier abono de la tabla compartida, sin importar por cuál de los 2 escritores nació (documentado ya en la auditoría previa).

### 1.2 Función compartida — `lib/finanzas/puentes/abonos.ts` (nuevo)

Un solo archivo, importado desde los dos call-sites, para no duplicar lógica de mapeo:

```ts
export async function crearMovimientoParaAbono(input: {
  abonoId: string;
  monto: number;
  metodoPago: string | null;      // valor crudo de "Método de Pago" del Abono, puede venir vacío
  fecha: string;                   // "Fecha de Abono"
  operacionId: string | null;      // "Aplicado a: Operación"[0]
  ordenId: string | null;          // "Aplicado a: Orden"[0]
  registradoPor: string;
  comprobanteUrl?: string;
  numeroTransaccion?: string;
  observacion?: string;
}): Promise<{ ok: true; movimientoId: string } | { ok: false; error: string }>
```

Pasos internos:
1. **Guard de idempotencia** (mismo patrón que el puente Shipping, §1.3 abajo): `fetchRecordById("Abonos", input.abonoId)`, leer su campo inverso `Movimiento Financiero` (renombrado, ver §1.6) — si ya tiene algo, devolver `{ ok: true, movimientoId: <el que ya existe> }` sin crear nada nuevo.
2. **Resolver Cliente**: si `operacionId` → `fetchRecordById("Operación Comercial", operacionId)`, leer su campo `Cliente` (link real, ya usado en `lib/operaciones/airtable.ts:349`); si no, y hay `ordenId` → mismo patrón sobre `Órdenes de Reparación`. Ninguno de los dos es filtrar-por-link (es leer un campo ya presente en un registro ya obtenido por id) — respeta el patrón seguro.
3. **Mapear** `metodoPago` → `{ cuentaDestinoNombre, estadoMovimiento, metodoMovimiento }` vía la tabla de §1.4.
4. `cuentaDestinoNombre ? await fetchCuentaPorNombre(cuentaDestinoNombre) : null`.
5. `crearMovimiento({ tipo: "Ingreso", origen: "Abonos", categoria: "Anticipo Cliente", monto, cuentaDestinoId: cuenta?.id ?? null, estado: estadoMovimiento, estadoDistribucion: "Sin distribuir", metodo: metodoMovimiento, fecha, transaccionId: input.numeroTransaccion, comprobanteUrl: input.comprobanteUrl, observacion: input.observacion, registradoPor: input.registradoPor, abonoId: input.abonoId, clienteId }, { permitirCuentaFaltante: cuenta === null })`.
6. **Nunca lanza.** Todo el cuerpo en `try/catch`; cualquier error se loguea (`console.error`, con `abonoId` y el error) y se devuelve `{ ok: false, error }`. El llamador nunca deja que esto tumbe el response del abono — es exactamente el mismo principio que ya usa `createAbonoPorOrden()` con la subida de comprobante (línea 2299-2307: falla → `warning`, el abono igual se guarda).

### 1.3 Idempotencia

Mismo patrón que `createFinanceMovementForPago` (`lib/shipping-v2/airtable.ts`, Fase 20.1): antes de crear, se lee el estado actual y si ya existe un movimiento vinculado, no se crea un segundo. Aquí la fuente de verdad es el campo inverso automático de Airtable en la tabla `Abonos` (ver §1.6), no un campo de ids en memoria como en `ShippingV2Pago.movimientoFinanzasIds` — porque el puente se invoca on-the-fly, no hay un objeto "pago" pre-cargado con esa información; se lee directo de Airtable.

### 1.4 Mapeo Método de Pago → Cuenta Destino / Estado (Etapa A — inventario real)

Consultado en vivo hoy (2026-07-12), tabla `Abonos`, 138 registros:

| `Método de Pago` (valor real en Abonos) | Uso real hoy | `Cuenta Destino` (texto libre, Abonos) | Decisión de mapeo |
|---|---|---|---|
| `Efectivo` | 114/138 (82.6%) | vacío en 136/138; 2 dicen `"Caja"` | → **Caja Registradora**, `Confirmado` |
| `Transferencia` | 23/138 (16.7%) | vacío en 21/23; 1 dice `"Caja"`, 1 dice `"Banco Pichincha"` | → **SGINGRESOS**, `Confirmado` |
| *(vacío)* | 1/138 | vacío | sin mapeo — ver fila "no mapeable" abajo |
| `Tarjeta` | 0 (opción existe, sin uso real) | — | → **Tarjetas en Tránsito**, `Pendiente` |
| `Depósito` | 0 (opción existe, sin uso real) | — | → **SGINGRESOS**, `Confirmado` (un depósito bancario ya es dinero en el banco, no en tránsito) |
| `PayPal` | 0 (opción existe, sin uso real) | — | → **PayPal**, `Confirmado` |
| `PayPhone` | 0 (opción existe, sin uso real) | — | → **Tarjetas en Tránsito**, `Pendiente` (mismo tratamiento que tarjeta — acreditación diferida, igual que decidió el dueño en el modelo original) |
| `Otro` | 0 (opción existe, sin uso real) | — | sin mapeo — ver fila "no mapeable" abajo |

**El campo `Cuenta Destino` (texto libre) de Abonos se ignora deliberadamente como fuente de mapeo** — está vacío en 134/138 (97%) y, cuando está lleno, no siempre es consistente con el `Método de Pago` (ej. `Transferencia` + `"Caja"` en un registro real). `Método de Pago` (select controlado) es la única fuente confiable.

**Valor no mapeable (`Método de Pago` vacío, o `"Otro"`, o una opción nueva que Abonos agregue en el futuro sin que este mapeo se actualice):** el movimiento se crea igual — nunca se bloquea el abono — con `cuentaDestinoId: null` (`permitirCuentaFaltante: true`) y **`Alerta Descuadre = true`**.

> **Decisión a confirmar en esta Etapa A — ampliación de semántica de `Alerta Descuadre`:** en 20.1 ese campo nace pensado para "saldo insuficiente en un Egreso/Ajuste". Aquí lo reutilizo con un sentido más amplio: "este movimiento necesita revisión manual" (cuenta no resuelta O saldo insuficiente, según el caso). Alternativa: crear un campo nuevo `Cuenta Sin Resolver` (checkbox). Mi recomendación es **reutilizar `Alerta Descuadre`** — evita otro campo Airtable/otro checklist manual, y en la pantalla `/finanzas` ambos casos son exactamente lo mismo desde la perspectiva del dueño: "algo aquí no cuadra solo, revísalo". Si prefieres el campo separado, lo cambio antes de construir.

### 1.5 Anulación de abono → anular su movimiento

En `anularAbonoPorOrden()` (`lib/tecnicos/airtable/index.ts:2887-2918`), después del `PATCH` que marca `Estado del Abono: "Anulado"` (línea ~2909) y antes del `return`: leer el campo inverso `Movimiento Financiero` del abono ya actualizado (`fresh.fields`, ya se relee en la línea siguiente para construir la respuesta) y, si tiene un id, `await anularMovimiento(movimientoId, "Abono anulado en el portal.")`. **Best-effort** — en un `try/catch` separado; si falla, se loguea pero la anulación del abono (que ya ocurrió) no se revierte ni se bloquea la respuesta.

### 1.6 Cambios de esquema necesarios

Ya identificado en la investigación de hoy: al crear el link `Abono` en `Movimientos Financieros` (Fase 20.1), Airtable creó automáticamente, del lado de la tabla `Abonos`, un campo inverso con el nombre por defecto **`"Shipping Finanzas Movimientos"`** (heredado del nombre de tabla vigente en el momento de la creación, antes del rename) — confirmado en el esquema real hoy. Mismo fenómeno, mismo nombre por defecto, en `Facturas Electrónicas` (para el link `Factura Electrónica`).

Checklist de esquema de esta fase (campos simples/links — vía API, con tu aprobación en Manual mode, igual que en 20.1):
1. Renombrar en `Abonos`: `"Shipping Finanzas Movimientos"` → **`"Movimiento Financiero"`**.
2. Renombrar en `Facturas Electrónicas`: `"Shipping Finanzas Movimientos"` → **`"Movimientos Financieros (Facturación)"`** (plural — una factura de mostrador con pago mixto puede terminar vinculada a varios movimientos, uno por componente).
3. Nada más nuevo — `Categoría` (`Anticipo Cliente`, `Venta Mostrador`, `Servicio Reparación`, `Venta Producto`), `Estado Distribución`, `Abono`, `Cliente`, `Factura Electrónica` ya existen desde el checklist de la Fase 20.1.
4. **No hace falta ninguna opción nueva de select** — a diferencia de 20.1, aquí no se agrega ningún valor a `Origen`/`Tipo de movimiento`/`Método` que no exista ya (`Origen: Abonos` y `Origen: Facturación` ya se agregaron en el Paso 4 de 20.1, confirmado).

---

## 2. Puente 2 — Facturación → Movimientos

### 2.1 Punto de enganche exacto

`app/api/facturacion/emitir/route.ts:63-69` — el mismo lugar donde hoy se dispara `postEmision()` (patrón ya establecido: post-emisión, best-effort, nunca altera la respuesta ya calculada). Condición existente: `if (resultado.estado === "AUTORIZADO" && body.origen && resultado.recordId)`. El puente de 20.2 se agrega **al lado**, con su propia condición (no anidada dentro de la de `postEmision`, para que un fallo de inventario no bloquee el de finanzas ni viceversa):

```
resultado.estado === "AUTORIZADO"  →  (siempre, mostrador o gancho)
  · Ambiente !== "PRODUCCIÓN"  →  no crear nada (todas las 40 facturas de hoy son PRUEBAS — este filtro es el que evita contaminar /finanzas con datos de prueba)
  · !body.origen  →  caso (a) mostrador
  · body.origen   →  caso (b) gancho
```

**Ambiente**: hoy `ResultadoEmision` no expone `cfg.ambiente` (hallazgo de la investigación). Cambio mínimo necesario: agregar `ambiente: cfg.ambiente` al objeto que devuelve `emitirFactura()` (`lib/facturacion/emitirFactura.ts`, junto al `return` de la línea ~400) — un campo más en un tipo de retorno interno, no rompe ningún consumidor existente (los que no lo usan simplemente lo ignoran).

### 2.2 Caso (a) — Factura de mostrador

Por cada componente de `body.pagos` (el array `Pago[]` que ya viajó completo hasta `emitirFactura`, validado por `assertPagosCuadranConTotal`): un movimiento `Tipo: Ingreso`, `Categoría: Venta Mostrador`, `Origen: Facturación`, `Estado Distribución: Pendiente de clasificar`, link `Factura Electrónica: [resultado.recordId]`, link `Cliente` (si `datos.clienteRecordId` existe — hoy sí viaja, `emitirFactura.ts` línea ~372), cuenta/estado según el mapeo de códigos SRI de §2.4.

**Suma de componentes = total de la factura**: no hace falta revalidar — `assertPagosCuadranConTotal()` (`lib/facturacion/reglas/pagos.ts:16-26`) ya lo garantizó antes de siquiera llegar al SRI. El puente solo necesita crear un movimiento por elemento de `body.pagos`, sin reverificar la suma.

### 2.3 Caso (b) — Factura sobre Orden/Operación (anti doble conteo)

**No crea movimiento de ingreso nuevo por el total** — el dinero de los abonos ya está contado por el Puente 1. Lo que hace, en el mismo punto de enganche:

1. `const cuenta = await getCuentaUnificada(datos.origen.tipo === "orden" ? { ordenId: datos.origen.recordId } : { operacionId: datos.origen.recordId });` — trae `cuenta.abonos` con record ids reales (`CuentaUnificadaAbono.id`).
2. `const abonosVigentes = cuenta.abonos.filter(a => a.estado !== "Anulado");` — mismo filtro que ya usa `traductor.ts:118`.
3. **Por cada abono vigente**: leer su `Movimiento Financiero` (campo inverso, §1.6) y, si existe, `actualizarMovimiento(movimientoId, { facturaElectronicaId: resultado.recordId, estadoDistribucion: "Pendiente de clasificar" })` — la transición es **`Sin distribuir → Pendiente de clasificar`**, no `→ Distribuido` (eso requeriría rubros ya calculados sumando el monto exacto, que no existen hasta la Fase 20.3; `Pendiente de clasificar` es honesto sobre lo que sabemos hoy: ya no es un anticipo puro, es dinero de una venta real, pero todavía no sabemos cuánto es Capital/Utilidad/IVA).
   - Si el abono no tiene `Movimiento Financiero` vinculado (abono histórico anterior al deploy de 20.2, o el Puente 1 falló en su momento): se loguea una advertencia con el `abonoId` y se sigue con el resto — nunca bloquea la emisión (que **ya ocurrió y ya fue autorizada por el SRI** en este punto; nada de lo que pase de aquí en adelante puede "deshacer" la factura).
4. **Caso borde confirmado — SÍ existe**: `calcularFormasPago()` (`lib/facturacion/gancho/construccion.ts:112-138`) agrega siempre una línea adicional con `origenPago: "saldo"` por `importeTotal − Σ(abonos vigentes)` cuando ese remanente es positivo. Ese componente **sí es dinero nuevo** que se cobra en el instante de facturar (no estaba cubierto por ningún abono previo). Se identifica filtrando `datos.pagos.filter(p => p.origenPago === "saldo")` (disponible en memoria en el mismo punto de enganche — `origenPago` sí viaja completo en `datos.pagos` durante la propia request; lo que se pierde es solo lo que se *persiste* en `Líneas JSON`, ver §2.5) y, por cada uno, se crea un movimiento `Ingreso` nuevo — `Categoría` según el tipo de venta (`Servicio Reparación` si la orden tiene servicios, `Venta Producto` si son productos del pedido; usar la misma heurística que ya existe en `lib/cuenta-unificada` para distinguir, o —más simple y suficientemente preciso— `Categoría: "Servicio Reparación"` si `datos.origen.tipo === "orden"`, `"Venta Producto"` si `"operacion"`), `Estado Distribución: Pendiente de clasificar`, cuenta/estado según §2.4, links `Factura Electrónica` + `Cliente`.

**No hace falta reconstruir qué abono específico corresponde a qué componente `origenPago: "abono"`** — `calcularFormasPago()` incluye siempre *todos* los abonos vigentes de la cuenta como componentes de ese tipo (nunca una selección parcial), así que "todos los `cuenta.abonos` vigentes" y "todos los componentes `origenPago: 'abono'`" son el mismo conjunto por construcción. Evita un matching impreciso por monto/fecha.

### 2.4 Mapeo de forma de pago SRI → Cuenta Destino / Estado

Catálogo completo de la UI de mostrador (`FacturacionForm.tsx:21-30`, confirmado sin cambios). Uso real hoy: de 40 facturas, 18 tienen `Líneas JSON` parseable y **el 100% usa `"01"` (Efectivo)** — el resto de códigos son, hoy, terreno teórico (igual que con Abonos, deben estar listos aunque no haya un caso real todavía):

| Código SRI | Significado | Cuenta Destino | Estado del Movimiento |
|---|---|---|---|
| `01` | Efectivo | **Caja Registradora** | `Confirmado` |
| `16` | Tarjeta de débito | **Tarjetas en Tránsito** | `Pendiente` |
| `19` | Tarjeta de crédito | **Tarjetas en Tránsito** | `Pendiente` |
| `18` | Tarjeta prepago | **Tarjetas en Tránsito** | `Pendiente` |
| `17` | Dinero electrónico (BCE) | **SGINGRESOS** | `Confirmado` |
| `15` | Compensación de deudas | *(sin cuenta — ver nota)* | `Confirmado` |
| `20` | Otros (sist. financiero) | *(sin mapeo — ver nota)* | `Confirmado` con `Alerta Descuadre` |
| `21` | Endoso de títulos | *(sin mapeo — ver nota)* | `Confirmado` con `Alerta Descuadre` |

**Nota sobre `15` (Compensación de deudas):** no es un flujo de caja real — el SRI la usa quItación cuando se cancela una obligación con otra deuda, no con dinero que entra a ninguna cuenta. **Propuesta:** el movimiento se crea igual (por trazabilidad fiscal — la factura sí existe), pero con `cuentaDestinoId: null` y `Alerta Descuadre: true`, igual que un valor no mapeable — nunca representa un ingreso real a una cuenta física. Márcalo si prefieres otro tratamiento.

**Nota sobre `20`/`21`:** sin caso real hoy ni forma de saber a qué cuenta va sin más contexto de negocio — mismo tratamiento que "valor no mapeable" del Puente 1 (§1.4): se crea igual, `Alerta Descuadre: true`, revisión manual.

Este mapeo es **independiente** del de Abonos (§1.4) porque las fuentes son distintas (código SRI de 2 dígitos vs. el select `Método de Pago` de Abonos), pero **debe dar el mismo resultado para los casos que se solapan conceptualmente** (efectivo → Caja, tarjeta → Tránsito, etc.) — verificado que ambas tablas son consistentes entre sí.

### 2.5 Fix obligatorio — bug de reintento pierde la forma de pago real

Confirmado hoy, sigue exactamente igual: `app/api/facturacion/historial/[recordId]/reintentar/route.ts:86` hardcodea `pagos: [{ formaPago: "01", total: importeTotal }]`, y **la causa raíz** es que `Líneas JSON` (`emitirFactura.ts:339-345`) nunca guardó el array `Pago[]` completo — solo `formaPago: datos.pagos[0]?.formaPago` (string suelto, primer elemento).

**Fix (2 cambios, ambos necesarios):**
1. `emitirFactura.ts`, al construir `lineasJson`: agregar `pagos: datos.pagos` (el array completo, con `origenPago` intacto) al objeto — sin quitar `formaPago` (compatibilidad con lectores viejos que ya lo esperan).
2. `reintentar/route.ts`: reemplazar la línea 86 por `pagos: payload.pagos ?? [{ formaPago: "01", total: importeTotal }]` (el fallback hardcodeado se conserva **solo** para facturas emitidas antes de este fix, que no tienen `pagos` en su `Líneas JSON`). Además, reconstruir `origen` desde `payload.origen` en el `DatosVenta` reintentado (hoy no se lee en absoluto) — sin esto, un reintento exitoso de una factura del gancho nunca dispararía el caso (b) del Puente 2, porque `datos.origen` llegaría vacío a `emitirFactura()`.

Este fix es prerequisito real del Puente 2: sin él, cualquier factura reintentada (aunque sea rara — solo aplica a estados `PENDIENTE`/`RECIBIDA`/`DEVUELTA`) generaría movimientos con forma de pago falsa (`"01"` fijo) y, si venía del gancho, se saltaría por completo el marcado de abonos como facturados.

### 2.6 Editor de pago mixto en mostrador

`FormasPagoEditor` (`FacturacionForm.tsx:1323-1406`) y la validación server `assertPagosCuadranConTotal()` (`lib/facturacion/reglas/pagos.ts:16-26`, invocada incondicionalmente en `emitirFactura.ts:122`, antes de distinguir mostrador/gancho) **ya son genéricos y no necesitan ningún cambio de lógica**. El único trabajo es de UI:

1. `FacturacionForm.tsx:1079` — hoy el editor se monta solo si `pagosPrecargados !== null` (que solo se puebla desde el gancho, línea 503). Cambio: agregar un botón/toggle "Pago mixto" visible también en mostrador puro que, al activarse, inicializa el mismo estado `pagosPrecargados` con `[{ formaPago: "01", total: totales.importeTotal }]` (una sola línea editable, igual que ya hace el gancho al precargar el saldo) en vez de dejarlo en `null`.
2. `handleEmitir()` (línea 779, `pagos: pagosPrecargados ?? [{ formaPago, total: totales.importeTotal }]`) — sin cambios, ya maneja ambos casos correctamente.
3. Nada del lado servidor cambia — `assertPagosCuadranConTotal` ya corre siempre.

---

## 3. Función nueva — `actualizarMovimiento()` (`lib/finanzas/movimientos.ts`)

Alcance deliberadamente angosto — nunca toca hechos económicos (`Monto`, `Cuenta Origen`/`Destino`, `Tipo`, `Categoría`):

```ts
export async function actualizarMovimiento(
  id: string,
  cambios: { facturaElectronicaId?: string; estadoDistribucion?: EstadoDistribucion }
): Promise<Movimiento>
```

Validaciones antes del `PATCH`:
- El movimiento debe existir y **no** estar `Anulado` (un movimiento anulado no se actualiza, se reemplazaría por una Devolución si aplicara — fuera de alcance).
- `facturaElectronicaId`, si se pasa, solo se **agrega** (nunca reemplaza un link ya existente a otra factura — eso sería un error de doble-facturación, se rechaza con excepción explícita).
- `estadoDistribucion`, si se pasa, solo permite la transición `Sin distribuir → Pendiente de clasificar` en esta fase (cualquier otra transición se rechaza — la clasificación real a `Distribuido` es Fase 20.3, no se anticipa aquí).

---

## 4. Política ante fallos del puente (ambos casos)

**Regla general, ya usada en ambos puentes: el registro primario (Abono o Factura Electrónica) nunca se bloquea, nunca se revierte, y nunca conoce si el puente falló.**

- **Puente 1**: el `try/catch` envuelve toda la llamada a `crearMovimientoParaAbono()`; si falla, se loguea (`console.error` con `abonoId`, motivo del error, timestamp) y el endpoint de abonos responde exactamente igual que si el puente no existiera. Igual que ya hace el propio `createAbonoPorOrden()` con la subida de comprobante (patrón `warning` opcional) — se reutiliza esa misma convención: el response del abono puede incluir `warning: "No se pudo registrar el movimiento financiero de este abono."` sin cambiar el código de estado HTTP ni el campo `success`.
- **Puente 2**: la factura **ya fue autorizada por el SRI** en el momento en que el puente corre — no hay ningún universo donde "revertir" tenga sentido. Mismo patrón: `try/catch`, log, sin alterar `resultado`.

### 4.1 Detección y reparación de abonos/facturas sin movimiento

Mecanismo de reparación manual (Etapa B, sin UI todavía — endpoint solamente):

- `POST /api/finanzas/reparar-abono/[id]` (admin-only, `requireFinanzasSession`): re-ejecuta `crearMovimientoParaAbono()` para un abono puntual. Idempotente por diseño (§1.3) — si ya tiene movimiento, no hace nada y lo informa.
- Para detección masiva: `listarAbonosSinMovimiento(desde: Date)` (`lib/finanzas/puentes/abonos.ts`) — lista los abonos creados después de una fecha (por defecto, el deploy de 20.2) cuyo campo inverso `Movimiento Financiero` está vacío. Se expone como script (`npx tsx` — mismo patrón que los tests, no una tabla de Airtable nueva) para que el dueño lo corra manualmente cuando quiera auditar, no como cron ni proceso automático (fuera de alcance de esta fase).
- Mismo mecanismo, análogo, para facturas: `listarFacturasSinMovimientoDeIngreso()` — solo aplica a mostrador (el caso (b) no crea movimiento de ingreso por definición, así que "sin movimiento" no es un error ahí salvo que también falte el marcado de abonos, que se audita por separado revisando `cuenta.abonos` de las órdenes/operaciones facturadas recientemente).

### 4.2 Actualización de `/finanzas`

El indicador **"Anticipos sin facturar"** (`calcularAnticiposSinFacturar()`, `lib/finanzas/saldos.ts`) **no necesita ningún cambio de código** — ya filtra `Categoría = "Anticipo Cliente" AND Estado Distribución = "Sin distribuir"`, y el Puente 2(b) hace exactamente que un movimiento deje de cumplir esa condición (transición a `Pendiente de clasificar`) en el mismo instante en que se factura. Es el mismo mecanismo ya construido en 20.1, sin tocar — la Etapa A de esta fase **decide explícitamente no crear un campo booleano "facturado"** porque sería redundante con el link `Factura Electrónica` + la transición de estado, y tendría que mantenerse sincronizado a mano.

`/finanzas` (la pantalla) tampoco necesita cambios de código para reflejar esto — ya muestra `estadoDistribucion` por movimiento y el total de anticipos sin facturar; simplemente, después de esta fase, empezará a mostrar movimientos reales con `Origen: Abonos` y `Origen: Facturación` en vez de estar vacía salvo por los 11 legacy de Shipping.

---

## 5. Sin retroactivo (confirmado, decisión cerrada)

Los 138 abonos existentes (135 `Registrado` + 2 `Anulado` + 1 sin estado) **no reciben movimiento retroactivo**. El Puente 1 solo actúa sobre abonos creados desde el deploy de esta fase en adelante — coherente con que la Fase 20.1 tampoco cargó histórico de Abonos/Facturas, solo adaptó los 11 movimientos legacy de Shipping que ya vivían en la propia tabla de movimientos.

---

## 6. Prueba de fuego

Simulación de 4 eventos en secuencia, mostrando los movimientos resultantes y el efecto en `/finanzas` en cada paso. Cuentas con `Fecha de Corte`/`Saldo Inicial` ya cargados (post go-live, continuación del estado real de producción).

### Evento 1 — Abono en efectivo, $80, sobre una Operación Comercial (sin facturar todavía)

`crearAbono()` crea el Abono `recABONO001` (Método de Pago: `Efectivo`). El Puente 1 se dispara en el mismo request:

```
MOV-...-00001 — Tipo: Ingreso · Origen: Abonos · Categoría: Anticipo Cliente
  · Monto: $80 · Cuenta Destino: Caja Registradora · Estado del Movimiento: Confirmado
  · Estado Distribución: Sin distribuir · Abono: [recABONO001] · Cliente: [link resuelto vía Operación]
```

- **Saldo Caja Registradora**: +$80.
- **Anticipos sin facturar**: $80 (antes $0).
- Abono `recABONO001.Movimiento Financiero` ahora apunta a `MOV-...-00001` (idempotencia lista para el siguiente paso).

### Evento 2 — Se factura esa misma Operación (autorizada por el SRI), total $80 (exacto, sin saldo adicional)

`emitirFactura()` autoriza `FAC-...-0001` con `datos.origen = { tipo: "operacion", recordId: "recOPXXXX" }`. Puente 2(b):

1. `getCuentaUnificada({ operacionId: "recOPXXXX" })` → `cuenta.abonos = [{ id: "recABONO001", estado: "Registrado", monto: 80, ... }]`.
2. Abono vigente único → se lee su `Movimiento Financiero` (`MOV-...-00001`) → `actualizarMovimiento("MOV-...-00001", { facturaElectronicaId: "recFAC0001", estadoDistribucion: "Pendiente de clasificar" })`.
3. `datos.pagos` para esta factura: `[{ formaPago: "01", total: 80, origenPago: "abono" }]` — **sin componente `"saldo"`** (el abono cubrió el 100%). No se crea ningún movimiento de ingreso nuevo.

```
MOV-...-00001 — (mismo registro, actualizado)
  · Estado Distribución: Pendiente de clasificar  ← cambió
  · Factura Electrónica: [recFAC0001]              ← nuevo
  · Monto/Cuenta/Tipo/Categoría: sin cambios (inmutables)
```

- **Saldo Caja Registradora**: sigue en +$80 (el dinero no se movió, solo se clasificó).
- **Anticipos sin facturar**: **$0** (el único anticipo que había ya no cumple `Estado Distribución = Sin distribuir`) — el indicador se corrige solo, sin tocar su código.

### Evento 3 — Venta de mostrador mixta: $45 efectivo + $30 tarjeta de crédito ($75 total), Consumidor Final

Factura de mostrador `FAC-...-0002`, `body.pagos = [{ formaPago: "01", total: 45 }, { formaPago: "19", total: 30 }]` (vía el editor de pago mixto habilitado en mostrador, §2.6). `assertPagosCuadranConTotal([45,30], 75)` pasa. Puente 2(a) — un movimiento por componente:

```
MOV-...-00002 — Tipo: Ingreso · Origen: Facturación · Categoría: Venta Mostrador
  · Monto: $45 · Cuenta Destino: Caja Registradora · Estado del Movimiento: Confirmado
  · Estado Distribución: Pendiente de clasificar · Factura Electrónica: [recFAC0002]

MOV-...-00003 — Tipo: Ingreso · Origen: Facturación · Categoría: Venta Mostrador
  · Monto: $30 · Cuenta Destino: Tarjetas en Tránsito · Estado del Movimiento: Pendiente
  · Estado Distribución: Pendiente de clasificar · Factura Electrónica: [recFAC0002]
```

- **Saldo Caja Registradora**: +$45 (total acumulado +$125 desde el evento 1).
- **Saldo Tarjetas en Tránsito**: +$30, pero `Estado del Movimiento: Pendiente` → **no suma a ningún saldo confirmado** (regla ya construida en 20.1: `calcularSaldoCuenta` solo cuenta `Confirmado`/`Acreditado`) — el dueño ve $30 "en camino", no disponibles, hasta la acreditación de la Fase 20.4.
- **Anticipos sin facturar**: sigue en $0 (esta venta nunca pasó por `Anticipo Cliente`, nació directo como `Venta Mostrador`).

### Evento 4 — Se anula el abono del Evento 1 (hipotético — en la realidad ya está facturado; se simula como si el Evento 2 no hubiera ocurrido, para mostrar el caso de anulación aislado)

`anularAbonoPorOrden()` marca `recABONO001` como `Anulado`. Puente 1 (§1.5): lee su `Movimiento Financiero` (`MOV-...-00001`) → `anularMovimiento("MOV-...-00001", "Abono anulado en el portal.")`.

```
MOV-...-00001 — Estado del Movimiento: Anulado (Fecha/Motivo de anulación llenos)
  · Monto/Cuenta/Tipo/Categoría/Estado Distribución: sin cambios (Corrección 1 — nunca se crea un movimiento de reverso)
```

- **Saldo Caja Registradora**: vuelve a $45 (el `Anulado` deja de contar en la suma — misma mecánica exacta que el test #1 de la Fase 20.1).
- **Anticipos sin facturar**: si esto hubiera ocurrido *antes* del Evento 2 (abono anulado, nunca facturado), el indicador ya no lo contaría — `Anulado` está fuera de `ESTADOS_QUE_CUENTAN_PARA_SALDO`, y `calcularAnticiposSinFacturar()` también filtra por esos mismos estados.

### Resumen de lo que la prueba de fuego demuestra

- El anti-doble-conteo funciona: el abono del Evento 1 nunca se contó dos veces al facturarse en el Evento 2 (no se creó un segundo movimiento por los mismos $80).
- El caso borde de saldo adicional (componente `"saldo"`) queda cubierto por diseño aunque no apareció en este ejemplo — si el Evento 2 hubiera sido una factura de $100 con solo $80 de abono, el componente `origenPago: "saldo"` de $20 habría generado un movimiento de ingreso nuevo, separado del abono ya marcado.
- Pago mixto reparte correctamente entre cuentas y respeta el estado `Pendiente` de la tarjeta (no infla el saldo disponible).
- La anulación no duplica ni dejar residuos — mismo patrón ya probado en 20.1.
- Ningún paso requirió tocar `calcularAnticiposSinFacturar()` ni `calcularSaldoCuenta()` — toda la Fase 20.2 se apoya en primitivas de 20.1 sin modificarlas, salvo la función nueva `actualizarMovimiento()`.

---

## 7. Plan de pruebas — Etapa B

1. **Idempotencia por abono**: llamar `crearMovimientoParaAbono()` dos veces con el mismo `abonoId` → un solo movimiento creado, la segunda llamada devuelve el mismo `movimientoId` sin POST adicional (doble de Airtable, mismo patrón que el test #7 de 20.1).
2. **Mixto suma exacta**: factura de mostrador con `pagos` que no suman el total → rechazada por `assertPagosCuadranConTotal` antes de llegar al puente (test ya existe conceptualmente en `lib/facturacion/__tests__/pagos.test.ts`; agregar caso específico si no cubre el mixto de mostrador). Factura con `pagos` que sí suman → un movimiento por componente, suma de montos de esos movimientos = total de la factura.
3. **`Ambiente = PRUEBAS` ignorado**: emitir con `cfg.ambiente !== "2"` → cero movimientos creados por el puente, verificado contando registros antes/después.
4. **Anticipo→facturado excluye del indicador**: crear abono (aparece en `calcularAnticiposSinFacturar`) → facturar la orden/operación → el mismo abono ya no aparece, sin llamar directamente a ninguna función de saldos "especial" (se prueba contra el indicador real).
5. **Anulación en cascada**: anular un abono con movimiento vinculado → el movimiento queda `Anulado`, saldo de su cuenta vuelve al valor previo, **cero** movimientos nuevos creados (mismo criterio que el test #1 de 20.1).
6. **Fallo del puente no rompe el registro primario**: forzar que `crearMovimientoParaAbono()` lance (doble de Airtable que responde error) → el abono igual queda creado, el endpoint responde `success: true` con `warning` poblado.
7. **Reintento conserva forma de pago real**: factura `DEVUELTA` con `pagos` de dos componentes en `Líneas JSON` → reintentar → el `DatosVenta` reconstruido tiene los 2 componentes originales, no `[{formaPago:"01"}]` fijo. Caso de compatibilidad: factura vieja sin `pagos` en `Líneas JSON` → cae al fallback hardcodeado sin lanzar.
8. **Caso borde "saldo" en factura con origen**: cuenta unificada con abonos que cubren solo una parte del total → el componente `origenPago: "saldo"` genera exactamente un movimiento de ingreso nuevo, con el monto correcto (`total − Σabonos`), mientras los abonos existentes solo se actualizan (no se duplican).
9. **`actualizarMovimiento()` — límites de la función**: intentar cambiar `estadoDistribucion` a un valor que no sea la transición permitida → rechazado. Intentar poner `facturaElectronicaId` sobre un movimiento que ya tiene una factura vinculada distinta → rechazado (protección anti doble-facturación).

Suite completa (Etapa B + toda la de 20.1) + `npm run typecheck` deben pasar antes de reportar. **Sin merge ni deploy** — reporte final y detenerse, igual que 20.1.

---

## Resumen para aprobar

Dos puentes nuevos (`lib/finanzas/puentes/abonos.ts` nuevo; enganche en `emitirFactura`/`route.ts` de facturación), una función nueva de alcance angosto (`actualizarMovimiento`), dos renombres de campo (los inversos automáticos de Airtable en `Abonos` y `Facturas Electrónicas`), un fix de un bug preexistente ya documentado (reintento pierde forma de pago), y un cambio de UI acotado (habilitar pago mixto en mostrador). Cero carga retroactiva. El indicador "Anticipos sin facturar" y los saldos por cuenta de `/finanzas` no requieren ningún cambio de código — el diseño se apoya en que ya excluyen correctamente por estado, construido en la Fase 20.1.

**Pendiente de tu aprobación antes de escribir cualquier código de la Etapa B.**
