# Diseño — Fase 20.4: Cuadre de caja y reporte diario

> Rama: `fase-20-4-cuadre-reporte`. Etapa A — **sin código de implementación**. Construido sobre `docs/DISENO_FASE20_1_FUNDACION.md`, `docs/FASE20_1_RESULTADO.md`, `docs/DISENO_FASE20_2_INGRESOS.md`, `docs/FASE20_2_RESULTADO.md`, `docs/DISENO_FASE20_3_OPERACION.md`, `docs/FASE20_3_RESULTADO.md`, y una inspección fresca (2026-07-XX) del código real y del esquema real de Airtable (Metadata API, solo lectura).
>
> **Objetivo:** las dos herramientas del día a día — (1) cuadre de caja (arqueo) con ajuste admin opcional, y (2) reporte diario que responde las preguntas reales del dueño sobre cuánto entró, salió, se movió internamente, y cuánto debería haber ahora.
>
> **Aprobado con 4 correcciones** (integradas abajo, no como apéndice): (1) documentar y testear el comportamiento de acreditaciones cruzadas de día — §3.7 (nueva); (2) el ajuste de cuadre clasifica su rubro al nacer (`Rubro Utilidad`, `Distribuido`), mismo precedente que el Ajuste-hijo de comisión — §2.4; (3) verificación explícita de que `validarCuentasPorTipo` ya acepta `Ajuste` con solo Cuenta Destino (caso sobrante), documentada y con test propio — §2.4; (4) UI del historial de cuadres — §2.7 (nueva). Etapa B construida directo en la misma rama — ver `docs/FASE20_4_RESULTADO.md`.

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
4. Si no: `monto = Math.abs(cuadre.diferencia)`; si `diferencia < 0` (Faltante) → `crearMovimiento({ tipo: "Ajuste", origen: "Manual", categoria: "Ajuste de Caja", monto, cuentaOrigenId: cuadre.cuentaId, estado: "Confirmado", estadoDistribucion: "Distribuido", rubros: { utilidad: monto, capital: 0, iva: 0, repuestoExterno: 0 }, fecha, observacion: \`Ajuste de faltante — ${cuadre.cuadreId}\`, registradoPor })`; si `diferencia > 0` (Sobrante) → igual pero `cuentaDestinoId: cuadre.cuentaId` en vez de origen (misma `rubros`/`estadoDistribucion`).
5. `PATCH` del cuadre: `Movimiento de Ajuste = [movimiento.id]`, `Estado de Ajuste = "Ajustado"`. Airtable mantiene el link inverso (`Cuadre de Caja` en el movimiento) automáticamente — no hace falta que `crearMovimiento` reciba ningún parámetro nuevo.

**Por qué faltante → Egreso-como-Ajuste (solo Cuenta Origen) y sobrante → Ingreso-como-Ajuste (solo Cuenta Destino):** exactamente el mismo patrón que el Ajuste-hijo de la acreditación (20.3 §3.3) — un `Ajuste` con una sola cuenta poblada se comporta como Egreso/Ingreso puro para el cálculo de saldo (`saldo += destino, saldo -= origen`), pero su `Tipo` distinto (`Ajuste`, no `Egreso`/`Ingreso`) lo mantiene separado en el reporte (§3) como lo que realmente es: una corrección contable, no una venta ni una compra real. Un faltante decrementa el saldo de Caja exactamente como decrementaría un Egreso; un sobrante lo incrementa exactamente como un Ingreso — pero ninguno de los dos "vendió" ni "compró" nada.

**Corrección 2 — el ajuste clasifica su rubro al nacer, no queda `Pendiente de clasificar`:** mismo precedente exacto que el Ajuste-hijo de comisión (20.3 §3.3) — la regla de negocio ya es 100% determinística (*"faltante reduce Utilidad, sobrante la aumenta"*, decisión del dueño), así que no hace falta ninguna UI de clasificación general para este caso: `rubros.utilidad = monto` (los otros 3 en `0`), `Estado Distribución: "Distribuido"` (la suma de rubros = monto exacto, satisface `validarSumaRubros` sin ninguna tolerancia especial). El signo de la clasificación lo da la posición de la cuenta, no un campo aparte: un Ajuste con `Cuenta Origen` puebla `calcularSaldoRubroCuenta(caja, "utilidad")` en negativo (resta) — el faltante reduce la utilidad reconocida en esa cuenta; uno con `Cuenta Destino` lo suma — el sobrante la incrementa. Es el mismo mecanismo, sin código nuevo, solo los valores correctos en la llamada a `crearMovimiento`.

**Corrección 3 — verificación de `validarCuentasPorTipo` para el caso sobrante (solo Cuenta Destino):** releído el código real de `lib/finanzas/validaciones.ts` antes de construir nada — la rama `Ajuste` de `validarCuentasPorTipo` es:
```ts
// Ajuste
if (!cuentaOrigenId && !cuentaDestinoId && !options.permitirCuentaFaltante) {
  throw new Error("Un Ajuste requiere al menos una cuenta (Origen o Destino).");
}
```
La condición de rechazo exige que **ambas** cuentas estén ausentes (`!origen && !destino`) — si `cuentaDestinoId` está poblado (caso sobrante), `!cuentaDestinoId` ya es `false` y el `&&` completo es `false`: **no rechaza**. `validarCuentasPorTipo` ya acepta un `Ajuste` con solo `Cuenta Destino` tal como está, sin ninguna ampliación de código. Lo único que confirma que este camino nunca se había ejercitado de verdad: el Ajuste-hijo de comisión de la acreditación (20.3) **siempre** usa solo `Cuenta Origen` (la pasarela nunca "sobra" dinero) — el caso "solo destino" para `Tipo: Ajuste` es nuevo en la práctica aunque el código ya lo soportara. Se agrega un test dedicado (§7 #13) que ejercita exactamente ese camino contra el doble, para dejarlo verificado y no solo argumentado.

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
- **`/finanzas` (pantalla principal):** una línea nueva bajo la tarjeta de Caja Registradora — *"Último cuadre: 16 jul, 18:40 — Faltante -$5.00"* (o "Cuadrado ✓" en verde) — vía `fetchUltimoCuadre`, llamado directo desde el Server Component (mismo criterio que el resto de `/finanzas`: sin pasar por su propia API), con un link "Ver historial" hacia §2.7.

### 2.7 Corrección 4 — Historial de cuadres (UI)

Lista simple, consumiendo el `GET /api/finanzas/cuadres?cuentaId=` ya diseñado en §2.6 — sin ningún endpoint nuevo. Columnas: Fecha, Esperado, Contado, Diferencia (con tono — verde `Cuadrado`, naranja `Sobrante`/`Faltante`), Estado, Estado de Ajuste, Realizado Por. Vive en `app/finanzas/reporte/page.tsx` (§3.6) como una sección más — es el lugar natural porque ya es la pantalla de "mirar hacia atrás", a diferencia de `/finanzas` que es la de "operar ahora" — y además se enlaza desde la tarjeta de Caja Registradora en `/finanzas` (arriba). Server Component: la propia página de reporte llama `listarCuadresDeCuenta(cajaId, 20)` directo (mismo criterio que el resto del portal — una página no pasa por su propia API para sus propios datos), sin necesidad de que el cliente haga `fetch` — a diferencia del panel de "Acreditar pendientes" (20.3), que sí es un client component porque necesita refrescarse tras cada acreditación sin recargar la página; el historial de cuadres es de solo lectura al cargar la página, así que un Server Component directo es más simple y no requiere justificar nada adicional.

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

### 3.7 Corrección 1 — comportamiento con acreditaciones cruzadas de día (documentado como intencional)

**El caso:** una venta con tarjeta ocurre el Día 1 (`Pendiente`, `Fecha del movimiento` = Día 1 — inmutable para siempre, es el hecho de venta). Se acredita recién el Día 2 (`fecha` de la acreditación = Día 2). El original **nunca cambia su propia `Fecha del movimiento`** (20.3 §3.3: el Paso A solo toca `Estado del Movimiento`/`Monto Bruto`/`Monto Neto`/`Comisión`) — sigue fechado Día 1, para siempre, aunque su `Estado` pase a `Acreditado` el Día 2.

**Efecto en el reporte, tal como está diseñado (§3.1/§3.5), y por qué es intencional:**
- El bucket de Ingresos es, por construcción, **"ventas del día"** — se agrupa por la `Fecha del movimiento` de cada registro, nunca por cuándo se acreditó. Eso significa que la venta del Día 1 pertenece **siempre** al reporte del Día 1, sea que se mire antes o después de acreditarse.
- **Efecto retroactivo real:** un reporte del Día 1 generado **antes** de la acreditación no incluye esa venta (estado `Pendiente`, excluido por el mismo filtro que excluye `Anulado`). Un reporte del Día 1 generado **después** de que se acredite (aunque sea el Día 5) **sí** la incluye — el número de "Ingresos del Día 1" puede crecer retroactivamente el día que la venta se acredite. Esto es **correcto y deseado**: el reporte siempre refleja el estado actual de verdad de los movimientos de ese día, no una fotografía congelada en el momento en que se generó por primera vez (ningún reporte de esta fase se "guarda" — se recalcula siempre en vivo, §3.1).
- Los dos hijos de la acreditación (Interno-hijo, Ajuste-hijo) llevan la fecha de la **acreditación** (Día 2) — aparecen en el reporte del **Día 2**, en Movimientos Internos y Ajustes respectivamente, nunca en el del Día 1.
- **Consecuencia directa sobre la identidad de §3.4:** `Ingresos − Egresos + Ajustes = cambio neto de cuentas` **cierra exacto dentro de un mismo reporte solo cuando la venta y su acreditación caen el mismo día** (como en la prueba de fuego, §6, donde ambas ocurren el mismo día simulado). Si caen en días distintos, el Día 1 muestra el bruto completo de la venta sin su comisión correspondiente (que vive en el Día 2), y el Día 2 muestra la comisión sin la venta que la originó — cada reporte individual queda "descuadrado" por el monto de la comisión, y **la identidad solo cierra sumando ambos días juntos**. Esto no es un error del reporte: es el reflejo correcto de que la venta y su liquidación son dos hechos económicos que ocurrieron en instantes distintos — exactamente la misma lógica que ya justifica por qué el original y sus hijos son registros separados (20.3 §3.2, alternativa (a) vs. (b)) se extiende, sin sorpresas, al reporte que los agrupa por fecha.

**No se corrige ni se oculta este comportamiento** — se documenta explícitamente (aquí, y con un comentario en el código de `calcularReporteDiario`) y se fija con un test dedicado (§7 #14) que verifica ambos reportes (Día 1 y Día 2) por separado, precisamente para que quede claro que es la conducta esperada y no se rompa sin querer en una fase futura.

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
12. **`registrarAjusteDeCuadre` — rubro clasificado al nacer (Corrección 2)**: tras el ajuste, el movimiento creado tiene `Rubro Utilidad = |diferencia|` (los otros 3 rubros en `0`) y `Estado Distribución: "Distribuido"` — tanto para faltante como para sobrante. `calcularSaldoRubroCuenta(cuenta, "utilidad")` refleja el signo correcto en cada caso (resta para faltante, suma para sobrante).
13. **`validarCuentasPorTipo` — Ajuste con solo Cuenta Destino no se rechaza (Corrección 3)**: `crearMovimiento({ tipo: "Ajuste", cuentaDestinoId: ..., cuentaOrigenId: undefined, ... })` no lanza — confirma en código (no solo en el análisis del diseño) que el caso sobrante del ajuste de cuadre nunca tropieza con esta validación.
14. **Acreditaciones cruzadas de día — comportamiento intencional (Corrección 1)**: venta `Pendiente` con `Fecha del movimiento` = Día 1; se acredita con `fecha` = Día 2. `calcularReporteDiario(Día 1)` (calculado **después** de la acreditación) incluye el bruto de la venta en Ingresos, pero **no** incluye la comisión en Ajustes ni el Interno-hijo en Movimientos Internos. `calcularReporteDiario(Día 2)` incluye la comisión y el Interno-hijo, pero **no** el bruto de la venta (queda en el Día 1). Verifica explícitamente que ninguno de los dos reportes por separado cierra la identidad de §3.4 — solo la suma de ambos días.
15. **Suite completa 20.1 + 20.2 + 20.3 + 20.4 + `npm run typecheck`** — cero regresiones.

Sin merge ni deploy — reporte final y detenerse, igual que las fases anteriores.

---

## Resumen para aprobar

Dos capacidades nuevas sobre `/finanzas`: **cuadre de caja** (tabla nueva `Finanzas Cuadres`, con `crearCuadre`/`registrarAjusteDeCuadre` como únicas puertas de escritura, ajuste representado como `Tipo: Ajuste` clasificado en `Rubro Utilidad`/`Distribuido` al nacer — mismo patrón que el Ajuste-hijo de comisión de la acreditación — con permiso admin-only, historial consultable, y un atajo sin lógica nueva hacia la transferencia de 20.3); y **reporte diario** (`calcularReporteDiario`, parametrizado por rango de fechas aunque la UI solo exponga un día, con el desglose orden/operación de anticipos resuelto por un único `fetchRecordsByIds` en vez de parsear texto, los `Ajuste` presentados como línea propia con signo, y el comportamiento de acreditaciones cruzadas de día documentado y testeado como intencional). Checklist de esquema mínimo: 1 tabla nueva + 2 renombres de inversos automáticos (yo, vía API) + 1 opción de select nueva (`Ajuste de Caja`, manual del dueño por la limitación de API ya conocida). Permisos: extiende la tabla de 20.3 sin inventar niveles nuevos.

---

## Registro de correcciones

Revisión del dueño sobre la v1 de este documento: **aprobado en su estructura general** (la tabla `Finanzas Cuadres`, `crearCuadre`/`registrarAjusteDeCuadre` como únicas puertas de escritura, la representación del ajuste como `Tipo: Ajuste`, el mecanismo de `fetchRecordsByIds` para el desglose orden/operación, la línea propia de Ajustes con signo — todo eso se mantuvo sin cambios). 4 correcciones vinculantes, ya integradas arriba en las secciones que corrigen:

1. **No se había documentado el efecto de una acreditación que cruza la medianoche** (§3.7, nueva) — el bucket de Ingresos agrupa por `Fecha del movimiento` (la fecha de la venta, inmutable), así que una venta acreditada días después aparece retroactivamente en el reporte de su propio día de venta, mientras que la comisión/Interno-hijo aparecen en el reporte del día de la acreditación. Documentado como comportamiento intencional (no un bug), con la consecuencia explícita de que la identidad `Ingresos − Egresos + Ajustes` solo cierra dentro de un mismo reporte cuando venta y acreditación caen el mismo día — y fijado con un test dedicado (§7 #14).
2. **El ajuste de cuadre no clasificaba su rubro** (§2.4) — corregido para clasificarlo al nacer, igual que el Ajuste-hijo de comisión: `Rubro Utilidad = |diferencia|`, `Estado Distribución: Distribuido`. Faltante resta de la utilidad reconocida en la cuenta, sobrante suma — mismo mecanismo de signo por posición (Cuenta Origen/Destino) que ya usa `calcularSaldoRubroCuenta`, sin código nuevo.
3. **Se verificó, en vez de asumir, que `validarCuentasPorTipo` acepta `Ajuste` con solo Cuenta Destino** (§2.4) — releído el código real: la condición de rechazo exige que *ambas* cuentas falten, así que el caso sobrante (solo destino) ya pasaba sin ninguna ampliación. Documentado explícitamente con la cita del código, y verificado con un test dedicado (§7 #13) en vez de dejarlo solo como análisis.
4. **Faltaba la UI del historial de cuadres** (§2.7, nueva) — se agrega como sección de `app/finanzas/reporte/page.tsx` (Server Component, sin endpoint nuevo — reutiliza el `GET /api/finanzas/cuadres` ya diseñado), con enlace desde la tarjeta de Caja Registradora en `/finanzas`.

**Aprobado para proceder directo a la Etapa B — sin esperar otra revisión.**
