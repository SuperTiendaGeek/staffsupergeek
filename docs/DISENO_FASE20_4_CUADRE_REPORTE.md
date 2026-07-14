# Diseño — Fase 20.4: Cuadre de caja y reporte diario

> Rama: `fase-20-4-cuadre-reporte`. Etapa A — **sin código de implementación**. Construido sobre `docs/DISENO_FASE20_1_FUNDACION.md`, `docs/FASE20_1_RESULTADO.md`, `docs/DISENO_FASE20_2_INGRESOS.md`, `docs/FASE20_2_RESULTADO.md`, `docs/DISENO_FASE20_3_OPERACION.md`, `docs/FASE20_3_RESULTADO.md`, y una inspección fresca (2026-07-XX) del código real y del esquema real de Airtable (Metadata API, solo lectura).
>
> **Objetivo:** las dos herramientas del día a día — (1) cuadre de caja (arqueo) con ajuste admin opcional, y (2) reporte diario que responde las preguntas reales del dueño sobre cuánto entró, salió, se movió internamente, y cuánto debería haber ahora.

---

## 0. Paso 0 — Estado de `main` antes de diseñar

Verificado hoy, sobre `main` actual (tras el deploy de la Fase 20.3, commit `45b0dff`), antes de crear la rama de esta fase:

```
npm run typecheck                                              → limpio, 0 errores
38 tests de lib/finanzas/__tests__/*.test.ts (excl. el live)   → 38/38 en verde
```

Los 10 tests de 20.1, los 12 de 20.2 y los 17 (18 casos en §9, uno de ellos compartiendo archivo) de 20.3 pasan exactamente igual que en su reporte original. **Confirmado: se puede diseñar sobre esta base sin arrastrar ninguna regresión.**

---

## 1. Inventario real verificado hoy

### 1.1 Esquema real relevante (Metadata API, solo lectura)

- `Movimientos Financieros` → `Categoría` (singleSelect) tiene hoy exactamente: `Venta Mostrador`, `Venta Producto`, `Servicio Reparación`, `Repuesto`, `Producto Digital`, `Anticipo Cliente`, `Compra Proveedor Shipping`, `Compra Local Repuesto`, `Compra Licencia`, `Nómina`, `Recuperación Garantía`, `Depósito de Caja`, `Distribución de Rubros`, `Acreditación Pasarela`, `Pago SRI`, `Devolución`, `Otro`. **`Ajuste de Caja` no existe** — necesaria para el ajuste de cuadre (§2.5).
- `Cuentas Financieras` — campos actuales: `Nombre`, `Tipo de Cuenta`, `Activa`, `Saldo Inicial`, `Fecha de Corte`, `Permite Recibir De`/`Permite Transferir A` (+ sus "From field" del self-link), `Movimientos (Origen)`/`Movimientos (Destino)`. Sin ningún campo de cuadres todavía.
- `Abonos` — confirmado de nuevo: `Aplicado a: Orden`/`Aplicado a: Operación` (`multipleRecordLinks`, siempre se lee `[0]` en el código real — un abono se aplica a una sola Orden u Operación, salvo el caso combinado ya documentado en 20.2 §1.2).

### 1.2 Código real relevante

- `lib/finanzas/movimientos.ts`: `crearMovimiento` (única puerta de escritura, ahora con `reversaAId` opcional desde 20.3), `anularMovimiento`, `acreditarMovimientoPendiente`, `fetchMovimientoById`, `listarMovimientos({tipo?, categoria?, estado?, desde?, hasta?, maxRecords?})`.
- `lib/finanzas/saldos.ts`: `calcularSaldoCuenta`, `calcularPorAcreditarCuenta`, `calcularAnticiposSinFacturar`, y `fetchMovimientosDeCuentaPorEstado` (exportada desde 20.3) — el patrón seguro ya establecido: nunca se filtra `Movimientos Financieros` por un campo de link, siempre se lee el inverso ya presente en la Cuenta y se resuelve por `fetchRecordsByIds`.
- `lib/finanzas/pre-go-live.ts`: `PreGoLiveError` (`code: "PRE_GO_LIVE"`) + `algunaCuentaSinFechaCorte(cuentas)` — ya compartida por `procesarDeposito`/`procesarAcreditacion`. Esta fase la reutiliza tal cual, sin tocarla.
- `lib/finanzas/cuentas.ts`: `fetchCuentasFinancieras`, `fetchCuentaById`, `fetchCuentaPorNombre` — el mapper `mapCuenta` y `CUENTAS_FIELDS` son el molde exacto para el nuevo campo `Cuadres` (§2.2).
- `lib/finanzas/puentes/abonos.ts`: exporta `ABONOS_FIELDS`/`ABONOS_TABLE` — se reutilizan directo para resolver `Aplicado a: Orden`/`Aplicado a: Operación` en el reporte (§3.2), sin duplicar los nombres de campo.
- `lib/finanzas/airtable-client.ts`: `fetchRecordsByIds(tabla, ids)` — un solo `OR(RECORD_ID()=...)` por lote, ya usado en `saldos.ts`. Es la pieza clave del mecanismo de desglose orden/operación (§3.2).
- `app/api/finanzas/reparar-abono/[id]/route.ts` / `.../movimientos/[id]/anular/route.ts`: patrón admin-only ya establecido (`requireFinanzasSession()` + `isAdministratorRole(session?.user.rol)` inline) — se repite para el ajuste de cuadre.
- `components/staff/StaffDesignSystem.tsx`: `StaffButton`, `StaffStatCard`, `StaffModal` — usados en 20.3 para las 3 acciones operativas; el cuadre se suma como una 4ª, y el reporte usa `StaffStatCard` a gran escala.
- `components/finanzas/FinanzasModal.tsx`/`FinanzasAcciones.tsx`: el envoltorio de modal genérico de la iteración de UX de 20.3 — el cuadre se agrega como un cuarto flujo con el mismo molde.

---

## 2. Cuadre de caja (arqueo)

### 2.1 Naturaleza: verificación, no movimiento

Un cuadre **nunca mueve dinero por sí mismo** — es una fotografía histórica de "esto es lo que el sistema dice, esto es lo que hay físicamente". Por eso vive en una **tabla nueva**, no en `Movimientos Financieros`: mezclar verificaciones con hechos económicos rompería la identidad `saldo = Σ movimientos` que gobierna todo el sistema desde 20.1 §0. Cuando SÍ hay que mover dinero (registrar la diferencia), eso vuelve a pasar por `crearMovimiento` — la única puerta de escritura de movimientos sigue siendo única (§2.5).

### 2.2 Tabla nueva — `Finanzas Cuadres`

| Campo | Tipo | Detalle |
|---|---|---|
| `Cuadre ID` | singleLineText (primario) | `CUADRE-YYYYMMDD-#####`, mismo patrón que `generarMovimientoId()` (fecha + 5 dígitos del timestamp) |
| `Cuenta` | link → Cuentas Financieras | La cuenta contada. No se restringe por código a "solo Caja Registradora" — cualquier cuenta activa puede cuadrarse, pero la UI (§2.6) la propone por defecto porque es la única cuenta con efectivo físico contable hoy |
| `Saldo Esperado` | currency | `calcularSaldoCuenta(cuentaId)` en el momento de crear el cuadre — snapshot, no se recalcula después |
| `Monto Contado` | currency | Lo que el empleado contó físicamente |
| `Diferencia` | currency | `round2(Monto Contado − Saldo Esperado)` — snapshot, calculado una vez al crear |
| `Estado` | singleSelect: `Cuadrado` / `Sobrante` / `Faltante` | Derivado de `Diferencia` (`=0` / `>0` / `<0`) en el momento de crear |
| `Estado de Ajuste` | singleSelect: `Sin diferencia` / `Pendiente de revisión` / `Ajustado` | `Sin diferencia` si `Diferencia = 0`; si no, arranca en `Pendiente de revisión` hasta que un admin registra el ajuste (§2.5) |
| `Movimiento de Ajuste` | link → Movimientos Financieros | Vacío hasta que se registra el ajuste; entonces apunta al `Ajuste` creado |
| `Observación` | multilineText | Obligatoria si `Diferencia ≠ 0` (validado en código, no a nivel de Airtable) |
| `Realizado Por` | singleLineText | Igual patrón que `Registrado por` en Movimientos |
| `Fecha` | dateTime | Momento del conteo — default ahora, pero acepta override (igual que el resto de flujos) |
| `Fecha de creación` | dateTime | Auditoría, igual que en Movimientos |

**Se descarta el desglose de billetes/monedas** (mencionado como opcional en el encargo): ningún flujo de negocio de esta fase lo necesita — el dueño solo pidió comparar esperado vs. contado y clasificar. Agregarlo ahora sería complejidad sin consumidor. Si se necesita después, es un campo `multilineText`/JSON adicional sin romper nada de lo aquí diseñado.

**Por qué `Saldo Esperado`/`Diferencia`/`Estado` se guardan como snapshot y no se recalculan al leer:** un cuadre es un hecho histórico — "esto fue lo que el sistema decía a las 18:40 del 16 de julio". Si se recalculara `Saldo Esperado` cada vez que alguien abre el historial, el mismo cuadre mostraría números distintos según cuándo se mire (porque el saldo real sigue moviéndose después) — dejaría de ser evidencia. Mismo principio que ya rige `Movimiento Bruto/Neto/Comisión` en la acreditación (20.3 §3.3): se congela el hecho en el momento en que ocurre.

### 2.3 Checklist de esquema — qué creo yo vía API vs. qué es manual del dueño

**Vía API (yo, en Manual mode, igual que 20.1):**
1. Crear la tabla `Finanzas Cuadres` con los 11 campos de §2.2.
2. El link `Cuenta` → `Cuentas Financieras` crea automáticamente, del lado de `Cuentas Financieras`, un campo inverso con nombre por defecto (`"Finanzas Cuadres"`) — renombrarlo a **`Cuadres`**.
3. El link `Movimiento de Ajuste` → `Movimientos Financieros` crea automáticamente, del lado de `Movimientos Financieros`, otro inverso por defecto — renombrarlo a **`Cuadre de Caja`**.

**Manual del dueño (limitación de API ya documentada — Hallazgo 2 de la Fase 20.1: `PATCH` sobre un campo `singleSelect` existente rechaza cualquier cambio a `options.choices` con `422`):**
4. Agregar la opción **`Ajuste de Caja`** al select `Categoría` de `Movimientos Financieros` — sin tocar ninguna opción existente.

Nada más. Cero migración de datos (tabla nueva, sin histórico previo).

### 2.4 Código — `lib/finanzas/cuadres.ts` (nuevo módulo, mismo espíritu que `movimientos.ts`)

```ts
export async function crearCuadre(input: {
  cuentaId: string; montoContado: number; fecha?: string; observacion?: string; realizadoPor: string;
}): Promise<Cuadre> {
  const cuenta = await fetchCuentaById(input.cuentaId);
  if (!cuenta) throw new Error(`Cuenta financiera ${input.cuentaId} no encontrada.`);
  if (algunaCuentaSinFechaCorte([cuenta])) throw new PreGoLiveError();

  const saldoEsperado = await calcularSaldoCuenta(input.cuentaId);
  const diferencia = round2(input.montoContado - saldoEsperado);
  const estado: EstadoCuadre = diferencia === 0 ? "Cuadrado" : diferencia > 0 ? "Sobrante" : "Faltante";
  if (diferencia !== 0 && !cleanString(input.observacion)) {
    throw new Error("La observación es obligatoria cuando el cuadre tiene una diferencia.");
  }
  const estadoAjuste: EstadoAjusteCuadre = diferencia === 0 ? "Sin diferencia" : "Pendiente de revisión";

  // POST a Finanzas Cuadres con estos 6 campos calculados + los del input.
}
```

`crearCuadre` **es** la única puerta de escritura de cuadres — igual criterio que `crearMovimiento` para movimientos: valida todo antes de tocar Airtable, nunca un `POST` parcial.

```ts
export async function registrarAjusteDeCuadre(
  cuadreId: string,
  input: { fecha?: string; registradoPor: string }
): Promise<{ cuadre: Cuadre; movimiento: Movimiento }>
```

Flujo (idempotente, mismo criterio de recuperación que `procesarAcreditacion` §3.4 de 20.3):
1. `fetchCuadreById(cuadreId)`.
2. Si `diferencia === 0` → rechaza (`"Este cuadre no tiene diferencia — no hay nada que ajustar."`).
3. Si `movimientoAjusteId` ya está poblado → **idempotente**: no crea un segundo movimiento, solo asegura `Estado de Ajuste = "Ajustado"` (recuperación de un intento previo que falló después de crear el movimiento pero antes del `PATCH` final) y devuelve `{ cuadre, movimiento: <el ya existente> }`.
4. Si no: `monto = Math.abs(cuadre.diferencia)`; si `diferencia < 0` (Faltante) → `crearMovimiento({ tipo: "Ajuste", origen: "Manual", categoria: "Ajuste de Caja", monto, cuentaOrigenId: cuadre.cuentaId, estado: "Confirmado", estadoDistribucion: "No aplica", fecha, observacion: \`Ajuste de faltante — ${cuadre.cuadreId}\`, registradoPor })`; si `diferencia > 0` (Sobrante) → igual pero `cuentaDestinoId: cuadre.cuentaId` en vez de origen.
5. `PATCH` del cuadre: `Movimiento de Ajuste = [movimiento.id]`, `Estado de Ajuste = "Ajustado"`. Airtable mantiene el link inverso (`Cuadre de Caja` en el movimiento) automáticamente — no hace falta que `crearMovimiento` reciba ningún parámetro nuevo.

**Por qué faltante → Egreso-como-Ajuste (solo Cuenta Origen) y sobrante → Ingreso-como-Ajuste (solo Cuenta Destino):** exactamente el mismo patrón que el Ajuste-hijo de la acreditación (20.3 §3.3) — un `Ajuste` con una sola cuenta poblada se comporta como Egreso/Ingreso puro para el cálculo de saldo (`saldo += destino, saldo -= origen`), pero su `Tipo` distinto (`Ajuste`, no `Egreso`/`Ingreso`) lo mantiene separado en el reporte (§3) como lo que realmente es: una corrección contable, no una venta ni una compra real. Un faltante decrementa el saldo de Caja exactamente como decrementaría un Egreso; un sobrante lo incrementa exactamente como un Ingreso — pero ninguno de los dos "vendió" ni "compró" nada.

**Vínculo al cuadre:** el `Movimiento de Ajuste` (lado del cuadre) es la única relación necesaria — el detalle de un movimiento (`/finanzas/[id]`, 20.3) puede opcionalmente mostrar "Originado por cuadre: CUADRE-..." leyendo el inverso `Cuadre de Caja`, agregado a `fetchMovimientoConTrazabilidad` de forma trivial (un campo más, mismo patrón que `compensadoPorIds`). Se incluye en el checklist de código de la Etapa B por prolijidad, no es indispensable para el flujo funcional.

**Permisos:** `crearCuadre` no valida rol (igual que `crearMovimiento` no lo hace) — el guard vive en el endpoint. `registrarAjusteDeCuadre` tampoco — mismo criterio.

### 2.5 Lectura — historial, último cuadre

Mismo patrón seguro ya establecido (nunca filtrar `Finanzas Cuadres` por su campo de link `Cuenta` — leer el inverso ya presente en la Cuenta):

```ts
export async function listarCuadresDeCuenta(cuentaId: string, limit?: number): Promise<Cuadre[]> {
  const cuenta = await fetchCuentaById(cuentaId);
  if (!cuenta) throw new Error(...);
  const registros = await fetchRecordsByIds("Finanzas Cuadres", cuenta.cuadresIds);
  return registros.map(mapCuadre).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, limit ?? 50);
}

export async function fetchUltimoCuadre(cuentaId: string): Promise<Cuadre | null> {
  const [ultimo] = await listarCuadresDeCuenta(cuentaId, 1);
  return ultimo ?? null;
}
```

`Cuentas Financieras` gana `cuadresIds: string[]` en `CuentaFinanciera` (vía `CUENTAS_FIELDS.cuadres = "Cuadres"`, mismo patrón que `movimientosOrigenIds`/`movimientosDestinoIds`).

### 2.6 Endpoints y pantalla

- `POST /api/finanzas/cuadres` — body `{ cuentaId, montoContado, fecha?, observacion? }`. `requireFinanzasSession()` (operativo + admin — el empleado hace el conteo). Traduce `PreGoLiveError` a `409`, cualquier otro error (incluida la observación faltante) a `500` con el mensaje real — mismo criterio que acreditación/depósito (20.3 §3.5: no se disfraza el error real de negocio).
- `GET /api/finanzas/cuadres?cuentaId=` — historial (default: Caja Registradora si no se especifica). `requireFinanzasSession()`.
- `POST /api/finanzas/cuadres/[id]/ajuste` — admin-only (`isAdministratorRole` inline, mismo patrón que `anular`/movimiento manual).
- UI: **4º flujo modal** en `/finanzas` vía `FinanzasAcciones`/`FinanzasModal` (20.3) — "Cuadrar caja" (`StaffButton variant="primary"`, junto a Transferencia y Acreditar — es una acción operativa del día a día, no admin-only). El modal:
  1. Selector de Cuenta (default Caja Registradora) → muestra "Saldo esperado: $X" (vía `/api/finanzas/saldos`, mismo endpoint ya reutilizado por el depósito en 20.3).
  2. Input "Monto contado" → calcula y muestra la diferencia en vivo, con color (verde si $0, naranja si no).
  3. Si diferencia ≠ 0, campo Observación se vuelve obligatorio (mismo patrón de bloqueo de submit en cliente que el depósito de 20.3 — antes de tocar el servidor).
  4. Al confirmar: muestra el resultado (Cuadrado/Sobrante/Faltante). Si hay diferencia y el usuario es admin, botón **"Registrar ajuste ahora"** (llama al endpoint de ajuste directo, sin salir del modal) junto a "Dejar en revisión" (cierra sin ajustar). Si no es admin, solo el aviso *"Diferencia registrada — un administrador debe revisar el ajuste."* y se cierra.
  5. Siempre visible tras un cuadre exitoso (cualquier estado): botón **"Registrar transferencia de este efectivo"** — abre el modal de "Transferencia entre cuentas" (20.3) con `cuentaOrigenId` = la cuenta cuadrada y `monto` = el monto contado, ya precargados. Sin lógica nueva: `DepositoForm` gana una prop opcional `valoresIniciales?: { cuentaOrigenId?: string; monto?: string }`, y `FinanzasModal`/`FinanzasAcciones` pasan ese estado entre los dos modales. Es exactamente lo que pide el encargo — "sin lógica nueva, solo precarga".
- **Pre-go-live:** mismo criterio que depósito/acreditación (20.3 §4.2) — si `PreGoLiveError`, el modal muestra el aviso informativo (tono azul, no error) en vez de un "saldo esperado" de `$0` sin explicación, que confundiría (cuadrar contra un saldo que es `$0` por definición no tiene sentido).
- **`/finanzas` (pantalla principal):** una línea nueva bajo la tarjeta de Caja Registradora — *"Último cuadre: 16 jul, 18:40 — Faltante -$5.00"* (o "Cuadrado ✓" en verde) — vía `fetchUltimoCuadre`, llamado directo desde el Server Component (mismo criterio que el resto de `/finanzas`: sin pasar por su propia API).

---

## 3. Reporte diario

### 3.1 Diseño general — parametrizado por rango, la UI solo expone un día

```ts
export async function calcularReporteDiario(input: { desde: string; hasta: string }): Promise<ReporteDiario>
```

vive en `lib/finanzas/reporte.ts` (nuevo). El nombre y la firma están pensados para el rango, no para "hoy": la UI (§3.5) siempre le pasa los límites de un solo día (`00:00:00.000` a `24:00:00.000` de la fecha elegida), pero la función en sí no sabe ni le importa que sea un día — un reporte mensual futuro sería literalmente la misma función con otros límites, sin tocar `lib/finanzas/reporte.ts`. Fuera de alcance de esta fase (no se construye la UI mensual), pero el código queda listo.

**Consulta a Airtable con margen, filtro exacto en memoria:** `listarMovimientos({ desde, hasta })` usa `IS_AFTER`/`IS_BEFORE` (estrictos, no inclusivos) — en vez de depender de la semántica exacta del límite en el borde, la consulta pide un margen de ±1 día (`listarMovimientos({ desde: díaAnterior, hasta: díaSiguiente, maxRecords: 500 })`) y el filtro real es en JavaScript: `mov.fecha >= input.desde && mov.fecha < input.hasta` (inclusive al inicio, exclusivo al final) — sin ambigüedad de bordes, fácil de testear con casos límite exactos. `maxRecords: 500` es generoso para un día (volumen real diario es de unas pocas decenas de movimientos); si el rango mensual se construye después, este límite necesitará revisarse — anotado como límite conocido, no se resuelve aquí.

### 3.2 Desglose de ingresos por origen de negocio — mecanismo de resolución

**Mapeo directo por `Categoría`** (sin ninguna resolución adicional — cubre el 100% de lo que Facturación escribe hoy, verificado en `lib/finanzas/puentes/facturacion.ts`):

| Categoría | Bucket |
|---|---|
| `Venta Mostrador` | Mostrador |
| `Servicio Reparación`, `Repuesto` | Órdenes de reparación |
| `Venta Producto`, `Producto Digital` | Operaciones (ventas — incluye reservas, per encargo) |
| Cualquier otra (`Recuperación Garantía`, `Devolución`, `Otro`, etc.) | Otros ingresos |

`Repuesto`/`Producto Digital` no tienen escritor real hoy (confirmado, §1.1) — se incluyen por robustez ante 20.6, sin ningún caso real que probar más allá de un test sintético.

**`Anticipo Cliente` — el caso ambiguo, resuelto de forma robusta (nunca parseando `Observación`):**

1. De todos los movimientos del rango con `categoria === "Anticipo Cliente"`, se recolectan sus `abonoIds[0]` (deduplicados).
2. **Un solo `fetchRecordsByIds("Abonos", ids)`** (no N+1 — un lote único, reutilizando la función ya existente en `airtable-client.ts`) trae los registros de Abono correspondientes.
3. Por cada movimiento, se lee del Abono ya resuelto `ABONOS_FIELDS.aplicadoAOrden`/`aplicadoAOperacion` (reexportados de `lib/finanzas/puentes/abonos.ts`, mismos nombres de campo, cero duplicación):
   - Solo `Aplicado a: Orden` → bucket Órdenes.
   - Solo `Aplicado a: Operación` → bucket Operaciones.
   - Ambos (caso combinado ya documentado en 20.2 §1.2) → bucket Órdenes (mismo criterio de precedencia que la referencia legible del Puente 1: *"Abono sobre Orden #X (Operación #Y)"* — Orden va primero).
   - Ninguno, o el Abono no se pudo resolver (dato inconsistente) → bucket Otros ingresos, sin lanzar — el reporte nunca debe romperse por un dato faltante, solo clasificar de forma conservadora.

**Costo real:** el volumen diario de anticipos es bajo — la Fase 20.2 documentó 138 abonos en todo el período observado (~114 efectivo), es decir, unos pocos por día en el caso más activo. Un solo request por lote (`fetchRecordsByIds`) para "los anticipos de hoy" es trivial incluso en un día excepcionalmente activo (decenas). No se necesita ninguna alternativa más compleja.

### 3.3 Egresos, Ajustes, Movimientos internos

- **Egresos** — `tipo === "Egreso"`, agrupados directo por `Categoría` (sin resolución adicional — las categorías de egreso ya son específicas: `Compra Proveedor Shipping`, `Compra Local Repuesto`, `Compra Licencia`, `Nómina`, `Pago SRI`, `Otro`).
- **Ajustes** — `tipo === "Ajuste"`, **línea propia, nunca mezclada con Egresos** (decisión justificada en §3.4). Agrupados por `Categoría` (`Acreditación Pasarela` = comisiones de pasarela; `Ajuste de Caja` = diferencias de cuadre, esta fase).
- **Movimientos internos** — `tipo === "Movimiento Interno"`, listados (no solo sumados: monto, cuenta origen → cuenta destino, categoría, fecha) — cubre depósitos/transferencias del día Y los Interno-hijo que la acreditación genera automáticamente. **No hace falta ninguna resolución especial para "acreditaciones del día":** una acreditación exitosa ya deja su Interno-hijo (categoría `Acreditación Pasarela`) en esta misma lista y su Ajuste-hijo en la lista de Ajustes — se ven solos, sin código dedicado.

### 3.4 Por qué Ajustes es una línea propia con signo (la decisión que el encargo pedía explícitamente)

Todos los buckets (Ingresos/Egresos/Ajustes) se calculan con el mismo signo que ya usa `calcularSaldoCuenta`: **destino suma, origen resta**. Para Ingresos eso siempre da positivo (solo tienen destino); para Egresos siempre negativo en términos de saldo, pero se reporta como magnitud positiva ("cuánto salió"); **Ajustes se reporta con signo** (negativo = costo neto del día — comisiones + faltantes; positivo = ganancia neta — sobrantes), porque puede ir en cualquier dirección y esconder el signo ocultaría si un día tuvo más sobrantes que faltantes.

**La identidad que cierra el reporte y demuestra por qué esta línea no puede quedar invisible:**
```
Ingresos − Egresos + Ajustes(con signo) = cambio neto de efectivo del sistema en el rango
```
Verificada exactamente en la prueba de fuego (§6) — sin la línea de Ajustes, la identidad no cuadra por el monto exacto de las comisiones/faltantes del día, que es precisamente el bug que el encargo pedía evitar ("lo prohibido es que queden invisibles").

### 3.5 El resto de las preguntas

- **¿Cuánto debería haber ahora en Caja?** — `calcularSaldoCuenta(cajaId)`, **en vivo** (no acotado al rango — es "ahora mismo", igual que en `/finanzas`). Si hubo un cuadre dentro del rango del reporte, se incluye (`cuadreDelDia`, resuelto igual que `fetchUltimoCuadre` pero filtrando por fecha en memoria sobre los cuadres ya traídos vía el inverso de la cuenta — mismo patrón seguro, sin filtrar `Finanzas Cuadres` por su campo `Cuenta`).
- **Anticipos sin facturar / por acreditar** — **no acotados al rango** (son acumulados globales, tal como pide el encargo: *"ya existen esas funciones — reutilizar"*): `calcularAnticiposSinFacturar()` tal cual, y `Σ calcularPorAcreditarCuenta(cuenta.id)` sobre todas las cuentas `Tipo = "Tránsito"`.
- **Desglose por método de pago** — solo sobre Ingresos del rango (agrupado por `Método`, `"Sin método"` si viene vacío) — "útil para el cuadre mental del dueño" es explícitamente sobre cómo entró el dinero, no cómo salió.
- **Anulados / Pendientes** — un único filtro de estado cubre ambas reglas del encargo a la vez: **todos** los buckets (Ingresos/Egresos/Ajustes/Internos) solo consideran movimientos con `estado ∈ ESTADOS_QUE_CUENTAN_PARA_SALDO` (`["Confirmado", "Acreditado"]`, la misma constante ya usada en todo el sistema desde 20.1) — eso excluye `Anulado` y `Pendiente` en el mismo paso, sin lógica nueva ni casos especiales.

### 3.6 Endpoint y pantalla

- `GET /api/finanzas/reporte?fecha=YYYY-MM-DD` (default hoy) — `requireFinanzasSession()` (cualquier rol con Finanzas, es de solo lectura). Internamente construye `desde`/`hasta` de ese día y llama a `calcularReporteDiario`.
- `app/finanzas/reporte/page.tsx` (nuevo, Server Component, `searchParams.fecha`) — selector de fecha simple (`<input type="date">` en un pequeño formulario GET, sin JS) arriba; luego:
  - Fila de `StaffStatCard` grandes (`density="default"`, no `"compact"` — esta es la única pantalla de Finanzas que se permite ese tamaño, justamente por ser "LA pantalla del dueño"): Ingresos del día (featured), Egresos del día, Ajustes y comisiones (con signo, tono rojo/verde), Saldo Caja actual.
  - Segunda fila más pequeña: Anticipos sin facturar, Por acreditar, Último cuadre del día (si hubo).
  - Debajo, 4 bloques de desglose compactos (reutilizando `StaffDataTable`/listas simples, no gráficos): por origen de negocio, por categoría de egreso, por categoría de ajuste, por método de pago; y una lista de movimientos internos del día.
  - Sin librerías de gráficos — todo texto/número, tal como pide el encargo.
- Enlace desde `/finanzas` (header o junto a los botones de acción) a `/finanzas/reporte`.

---

## 4. Permisos (tabla completa, extendiendo la de 20.3 sin inventar niveles nuevos)

| Acción | Guard | Roles |
|---|---|---|
| Ver reporte diario | `requireFinanzasSession()` | `admin`/`manager`/`finance` |
| Cuadrar caja (crear cuadre) | `requireFinanzasSession()` | Igual — operativo, el empleado hace el conteo |
| Ver historial de cuadres / último cuadre | `requireFinanzasSession()` | Igual |
| Registrar ajuste de un cuadre | `requireFinanzasSession()` + `isAdministratorRole` inline | Solo `admin`/`administrador` |

---

## 5. Comportamiento pre-go-live

Reutiliza `PreGoLiveError`/`algunaCuentaSinFechaCorte` (`lib/finanzas/pre-go-live.ts`) sin ningún cambio a ese módulo:
- **Cuadre:** `crearCuadre` chequea la cuenta a cuadrar antes de calcular nada — cuadrar contra un saldo que es `$0` por definición (regla ya construida en 20.1 §2.3b) no tiene sentido y confundiría con un "cuadrado" falso o un "faltante" que en realidad es solo "el sistema aún no está en vivo".
- **Reporte:** **no se bloquea** — a diferencia de cuadre/depósito/acreditación (que *mutan*), el reporte es de solo lectura; mostrar `$0.00` en Saldo Caja actual con cuentas sin `Fecha de Corte` es simplemente correcto (así lo define `calcularSaldoCuenta` desde 20.1) y ya es coherente con lo que `/finanzas` muestra hoy. Se agrega, eso sí, el mismo banner informativo de pre-go-live si aplica, para que el número no se lea como "hoy no entró nada" sino como "el sistema contable aún no está en vivo".

---

## 6. Prueba de fuego — un día completo

Cuentas en go-live (`Fecha de Corte` = el día anterior, `Saldo Inicial = $0` en las 3 cuentas relevantes). Día simulado: 2026-07-17.

| Estado inicial | Caja Registradora | SGINGRESOS | Tarjetas en Tránsito |
|---|---|---|---|
| | $0.00 | $0.00 | $0.00 |

**Evento 1 — Abono efectivo $50, sobre la Orden OR-100** (Puente 1, sin cambios): `Ingreso · Caja · Confirmado · Anticipo Cliente`. → Caja: **$50.00**.

**Evento 2 — Abono efectivo $40, sobre la Operación OP-200** (Puente 1, sin cambios): `Ingreso · Caja · Confirmado · Anticipo Cliente`. → Caja: **$90.00**.

**Evento 3 — Egreso manual $15** (`Categoría: Otro`, observación *"Compra de insumos"*): → Caja: **$75.00**.

**Evento 4 — Venta con tarjeta $30** (Puente 2, mostrador): `Ingreso · Tarjetas en Tránsito · Pendiente · Venta Mostrador`. → Tránsito saldo: **$0.00** (Pendiente no cuenta). Por acreditar: **$30.00**.

**Evento 4b — Acreditación de esa venta, neto $28.50** (comisión $1.50): Original → `Acreditado`; Interno-hijo `$28.50` Tránsito→SGINGRESOS; Ajuste-hijo `$1.50` (Rubro Utilidad). → **SGINGRESOS: $28.50. Tránsito: $0.00. Por acreditar: $0.00.**

**Reporte del día — snapshot A (justo antes del cuadre, tras el Evento 4b):**
```
Ingresos: $120.00 total  (el mostrador de $30 YA cuenta — pasó a Acreditado hoy mismo)
  Órdenes: $50.00 · Operaciones: $40.00 · Mostrador: $30.00 · Otros: $0.00
  Por método: Efectivo $90.00 · Tarjeta crédito $30.00
Egresos: $15.00 total  (Otro: $15.00)
Ajustes: −$1.50  (Acreditación Pasarela: −$1.50)
Movimientos internos: 1 — $28.50, Tránsito → SGINGRESOS, Acreditación Pasarela
Saldo Caja actual: $75.00
Anticipos sin facturar (global): $90.00 (ninguno de los 2 abonos se ha facturado)
Por acreditar (global): $0.00
```
Verificación: `120.00 − 15.00 + (−1.50) = 103.50` = Caja($75.00) + SGINGRESOS($28.50) + Tránsito($0.00). ✓

**Evento 5 — Cuadre de Caja**: saldo esperado = **$75.00**. El empleado cuenta físicamente **$70.00** → diferencia = **−$5.00** → `Estado: Faltante`. Observación obligatoria: *"Faltaron $5, revisar cambio del día"*. `Estado de Ajuste: Pendiente de revisión`.

**Evento 6 — Un admin registra el ajuste del faltante** desde el detalle del cuadre: `crearMovimiento({ tipo: "Ajuste", categoria: "Ajuste de Caja", monto: 5, cuentaOrigenId: caja, observacion: "Ajuste de faltante — CUADRE-..." })`. → Caja: $75.00 − $5.00 = **$70.00** (ahora coincide exactamente con lo contado). Cuadre → `Estado de Ajuste: Ajustado`, `Movimiento de Ajuste` enlazado.

**Reporte del día — snapshot B (después del ajuste):**
```
Ingresos: $120.00 total  (sin cambio — el ajuste de caja no es un ingreso)
Egresos: $15.00 total  (sin cambio)
Ajustes: −$6.50  (Acreditación Pasarela: −$1.50 · Ajuste de Caja: −$5.00)
Saldo Caja actual: $70.00
Cuadre del día: Faltante −$5.00 · Ajustado
```
Verificación: `120.00 − 15.00 + (−6.50) = 98.50` = Caja($70.00) + SGINGRESOS($28.50) + Tránsito($0.00). ✓ **Ningún dólar se creó ni se perdió**, y la línea de Ajustes es exactamente lo que hace que la identidad cierre en ambos snapshots — si se hubiera omitido (mezclada invisible en otro lado o no mostrada), el reporte habría mostrado un "sobrante" de $6.50 que no existe.

---

## 7. Plan de pruebas — Etapa B

1. **`crearCuadre` — clasifica correctamente**: `montoContado = saldoEsperado` → `Cuadrado`, `Diferencia = 0`. `montoContado > saldoEsperado` → `Sobrante`, diferencia positiva exacta. `montoContado < saldoEsperado` → `Faltante`, diferencia negativa exacta (con redondeo a 2 decimales).
2. **`crearCuadre` — observación obligatoria con diferencia**: `Diferencia ≠ 0` y `observacion` vacía/solo espacios → rechazado, sin llegar al `POST`. `Diferencia = 0` sin observación → se crea igual (no es obligatoria si cuadra).
3. **`crearCuadre` — pre-go-live bloquea**: cuenta sin `Fecha de Corte` → `PreGoLiveError`, cero registros creados en el doble.
4. **`registrarAjusteDeCuadre` — vincula correctamente**: faltante → `Ajuste` con `Cuenta Origen` poblada, sin destino, monto = `|diferencia|`; sobrante → `Cuenta Destino` poblada, sin origen. El cuadre queda con `Estado de Ajuste: Ajustado` y `Movimiento de Ajuste` enlazado al movimiento creado.
5. **`registrarAjusteDeCuadre` — rechaza sin diferencia, idempotente si ya ajustado**: `Diferencia = 0` → rechazado. Llamar dos veces sobre el mismo cuadre con diferencia → la segunda no crea un segundo `Ajuste`, devuelve el mismo movimiento.
6. **Endpoint de ajuste — solo admin**: sesión sin `isAdministratorRole` → `403`, sin tocar el cuadre ni crear movimiento.
7. **`calcularReporteDiario` — Ingresos por origen de negocio**: réplica del snapshot A de la prueba de fuego — un `Anticipo Cliente` sobre Orden, uno sobre Operación, uno sobre ambos (bucket Órdenes por precedencia), uno sin Abono resoluble (bucket Otros, sin lanzar); `Venta Mostrador`/`Servicio Reparación`/`Venta Producto` van directo a sus buckets sin pasar por la resolución de Abono.
8. **`calcularReporteDiario` — Egresos y Ajustes agrupan por categoría**: verificar los totales y el desglose exactos del snapshot A y B (incluida la identidad `Ingresos − Egresos + Ajustes = cambio neto de cuentas`, verificada numéricamente contra `calcularSaldoCuenta` de las 3 cuentas antes/después).
9. **`calcularReporteDiario` — Anulados excluidos**: un movimiento `Anulado` dentro del rango de fecha no aparece en ningún total (Ingreso, Egreso o Ajuste anulado — los 3 casos).
10. **`calcularReporteDiario` — Pendientes no suman**: una venta con tarjeta `Pendiente` del día no cuenta en Ingresos ni en Por método; sí se refleja (indirectamente) en el "por acreditar" global, nunca en el total del día.
11. **`calcularReporteDiario` — rango de fechas parametrizado**: llamar con un rango de 2 días (simulando el caso mensual futuro) agrega correctamente movimientos de ambas fechas — confirma que la función no está atada a "un solo día" pese a que la UI de esta fase solo exponga eso.
12. **Suite completa 20.1 + 20.2 + 20.3 + 20.4 + `npm run typecheck`** — cero regresiones.

Sin merge ni deploy — reporte final y detenerse, igual que las fases anteriores.

---

## Resumen para aprobar

Dos capacidades nuevas sobre `/finanzas`: **cuadre de caja** (tabla nueva `Finanzas Cuadres`, con `crearCuadre`/`registrarAjusteDeCuadre` como únicas puertas de escritura, ajuste representado como `Tipo: Ajuste` — mismo patrón que el Ajuste-hijo de comisión de la acreditación — con permiso admin-only y un atajo sin lógica nueva hacia la transferencia de 20.3); y **reporte diario** (`calcularReporteDiario`, parametrizado por rango de fechas aunque la UI solo exponga un día, con el desglose orden/operación de anticipos resuelto por un único `fetchRecordsByIds` en vez de parsear texto, y los `Ajuste` presentados como línea propia con signo — decisión verificada numéricamente en la prueba de fuego, sin la cual el reporte no cuadraría). Checklist de esquema mínimo: 1 tabla nueva + 2 renombres de inversos automáticos (yo, vía API) + 1 opción de select nueva (`Ajuste de Caja`, manual del dueño por la limitación de API ya conocida). Permisos: extiende la tabla de 20.3 sin inventar niveles nuevos.

**Pendiente de tu aprobación antes de escribir cualquier código de la Etapa B.**
