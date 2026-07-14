# Resultado — Fase 20.4: Cuadre de caja y reporte diario (Etapa B)

> Rama: `fase-20-4-cuadre-reporte`. Diseño aprobado en `docs/DISENO_FASE20_4_CUADRE_REPORTE.md`, con las 4 correcciones del dueño integradas antes de construir. Etapa B ejecutada directo, sin pausa intermedia: *"procede DIRECTO a la Etapa B"*. **Sin merge a `main`. Sin deploy.** Detenido aquí, tal como se pidió.

---

## 1. Qué se construyó

### 1.1 Checklist de esquema ejecutado

- **Vía API** (Manual mode): tabla nueva `Finanzas Cuadres` (11 campos: `Cuadre ID`, `Cuenta`, `Saldo Esperado`, `Monto Contado`, `Diferencia`, `Estado`, `Estado de Ajuste`, `Movimiento de Ajuste`, `Observación`, `Realizado Por`, `Fecha`, `Fecha de creación`); renombrados los 2 inversos automáticos que Airtable creó — en `Cuentas Financieras`, el inverso de `Cuenta` → **`Cuadres`**; en `Movimientos Financieros`, el inverso de `Movimiento de Ajuste` → **`Cuadre de Caja`**.
- **Pendiente, manual del dueño** (limitación de API ya conocida desde 20.1): agregar la opción **`Ajuste de Caja`** al select `Categoría` de `Movimientos Financieros`.

### 1.2 Cuadre de caja (arqueo)

- `lib/finanzas/cuadres.ts` (nuevo) — `crearCuadre(input)`: chequeo `PRE_GO_LIVE` (reutiliza `pre-go-live.ts` sin cambios), calcula `Saldo Esperado`/`Diferencia`/`Estado` una sola vez (snapshot histórico, nunca recalculado al leer), exige `observacion` si `Diferencia ≠ 0`. `registrarAjusteDeCuadre(cuadreId, input)`: crea el `Ajuste` correspondiente (faltante → Cuenta Origen; sobrante → Cuenta Destino), **clasifica su rubro al nacer** (`Rubro Utilidad = |diferencia|`, `Estado Distribución: Distribuido` — Corrección 2, mismo precedente que el Ajuste-hijo de comisión de 20.3), y enlaza el cuadre al movimiento vía `PATCH`. Idempotente: si el cuadre ya tiene un ajuste vinculado, no duplica. `listarCuadresDeCuenta`/`fetchUltimoCuadre` — patrón seguro de siempre (inverso ya presente en la Cuenta + `fetchRecordsByIds`, nunca filtrar `Finanzas Cuadres` por su link `Cuenta`).
- **Corrección 3 — verificado, no ampliado:** `validarCuentasPorTipo` ya aceptaba un `Ajuste` con solo `Cuenta Destino` (la condición de rechazo exige que ambas cuentas falten) — confirmado con un test dedicado (20-4.13), sin ningún cambio de código en `validaciones.ts`.
- `app/api/finanzas/cuadres/route.ts` (nuevo) — `GET` (historial, default Caja Registradora) + `POST` (crear, operativo + admin, traduce `PreGoLiveError` a `409`).
- `app/api/finanzas/cuadres/[id]/ajuste/route.ts` (nuevo) — `POST`, admin-only.
- `components/finanzas/CuadreForm.tsx` (nuevo) — modal "Cuadrar caja": saldo esperado en vivo, diferencia calculada en cliente, observación obligatoria si hay diferencia, resultado con botón "Registrar ajuste ahora" (admin) o aviso de revisión pendiente, y el atajo **"Registrar transferencia de este efectivo"** hacia el modal de Transferencia (20.3) — sin lógica nueva, solo precarga (`DepositoForm` gana la prop `valoresIniciales`).
- `components/finanzas/FinanzasModal.tsx` — ganó control externo opcional (`isOpen`/`onOpenChange`) para soportar ese atajo entre dos modales distintos, sin cambiar el comportamiento de los 3 modales existentes de 20.3 (uncontrolled por defecto).
- `app/finanzas/page.tsx` — línea "Último cuadre" bajo la tarjeta de Caja Registradora, con enlace al historial.

### 1.3 Reporte diario

- `lib/finanzas/reporte.ts` (nuevo) — `calcularReporteDiario({ desde, hasta })`, parametrizada por rango (no por "hoy"): consulta con margen de ±1 día + filtro exacto en memoria (`desde <= fecha < hasta`), evitando depender de la semántica de borde de `IS_AFTER`/`IS_BEFORE`.
  - **Ingresos** por origen de negocio: mapeo directo por Categoría, salvo `Anticipo Cliente` — resuelto con **un solo** `fetchRecordsByIds` sobre los Abonos del rango (nunca N+1, nunca parseo de `Observación`); precedencia Orden si un abono está aplicado a ambos.
  - **Egresos**/**Ajustes** agrupados por categoría; **Ajustes es una línea propia con signo** (nunca mezclada con Egresos) — verificado numéricamente en el test 20-4.8 que la identidad `Ingresos − Egresos + Ajustes = cambio neto de cuentas` cierra exacto cuando todo ocurre el mismo día.
  - **Movimientos internos** del rango, listados con cuenta origen/destino resueltas.
  - Anulados/Pendientes excluidos de todos los totales por el mismo filtro (`ESTADOS_QUE_CUENTAN_PARA_SALDO`).
  - Anticipos sin facturar / Por acreditar — reutilizados tal cual, nunca acotados al rango.
- **Corrección 1 — comportamiento con acreditaciones cruzadas de día, documentado y testeado:** el bucket de Ingresos agrupa por `Fecha del movimiento` (la venta, inmutable) — una venta acreditada días después aparece **retroactivamente** en el reporte de su propio día de venta una vez `Acreditada`, mientras que sus hijos (Interno/Ajuste) aparecen en el reporte del día de la acreditación. La identidad de conservación solo cierra exacta dentro de un mismo reporte cuando ambos ocurren el mismo día — verificado con el test 20-4.14, que confirma explícitamente que ningún reporte por separado cierra solo, pero la suma de ambos sí.
- `app/api/finanzas/reporte/route.ts` (nuevo) — `GET ?fecha=YYYY-MM-DD` (default hoy).
- `app/finanzas/reporte/page.tsx` (nuevo) — selector de fecha, `StaffStatCard` grandes (Ingresos/Egresos/Ajustes/Saldo Caja), desgloses compactos (origen de negocio, método de pago, categoría de egreso, categoría de ajuste), movimientos internos del día, y el **historial de cuadres** (Corrección 4) — Server Component, sin endpoint nuevo (reutiliza `GET /api/finanzas/cuadres` a través de `listarCuadresDeCuenta` directo).

### 1.4 Permisos

Sin sub-roles nuevos: `requireFinanzasSession()` para ver el reporte/cuadrar caja/ver historial (operativo + admin); `requireFinanzasSession()` + `isAdministratorRole` inline para registrar el ajuste (solo admin) — mismo patrón que 20.3.

---

## 2. Tests — `lib/finanzas/__tests__/`

Los 14 tests de §7 del diseño, más toda la suite de 20.1/20.2/20.3 — **52 archivos, todos en verde** (excluido el test en vivo):

| # | Archivo | Verifica |
|---|---|---|
| 20-4.1 | `crearCuadre-clasifica-correctamente.test.ts` | Cuadrado/Sobrante/Faltante según diferencia, con redondeo a 2 decimales. |
| 20-4.2 | `crearCuadre-observacion-obligatoria.test.ts` | Observación obligatoria solo si hay diferencia. |
| 20-4.3 | `crearCuadre-pre-go-live.test.ts` | `PreGoLiveError`, cero registros creados. |
| 20-4.4 | `registrarAjuste-vincula-correctamente.test.ts` | Faltante → Cuenta Origen; sobrante → Cuenta Destino; monto = \|diferencia\|; cuadre queda Ajustado y enlazado. |
| 20-4.5 | `registrarAjuste-rechaza-e-idempotente.test.ts` | Diferencia = 0 rechazada; doble llamada no duplica el Ajuste. |
| 20-4.6 | `endpoint-ajuste-solo-admin.test.ts` | Inspección de código fuente: guard admin antes de `registrarAjusteDeCuadre`. |
| 20-4.7 | `reporte-ingresos-por-origen.test.ts` | Mostrador/Órdenes/Operaciones directos; Anticipo Cliente resuelto vía Abono (solo Orden, solo Operación, ambos → precedencia Orden, sin resolver → Otros). |
| 20-4.8 | `reporte-egresos-ajustes-identidad.test.ts` | Egresos/Ajustes por categoría; identidad de conservación verificada contra `calcularSaldoCuenta` real. |
| 20-4.9 | `reporte-anulados-excluidos.test.ts` | Un Ingreso/Egreso/Ajuste anulado no cuenta en ningún total. |
| 20-4.10 | `reporte-pendientes-no-suman.test.ts` | Pendiente excluido de Ingresos y de "por método"; sí aparece en "por acreditar" global. |
| 20-4.11 | `reporte-rango-parametrizado.test.ts` | Rango de 2 días agrega correctamente ambas fechas. |
| 20-4.12 | `ajuste-rubro-clasificado-al-nacer.test.ts` | Rubro Utilidad = \|diferencia\|, Distribuido, con el signo correcto en faltante/sobrante. |
| 20-4.13 | `ajuste-solo-cuenta-destino.test.ts` | `validarCuentasPorTipo` acepta Ajuste con solo Cuenta Destino — confirmado en código. |
| 20-4.14 | `acreditaciones-cruzadas-de-dia.test.ts` | Comportamiento intencional verificado numéricamente: ningún día cierra solo, la suma sí. |

Comando para correr toda la suite (20.1 + 20.2 + 20.3 + 20.4, sin el test en vivo):

```bash
for f in lib/finanzas/__tests__/*.test.ts; do
  case "$f" in *.live.test.ts) continue ;; esac
  NODE_OPTIONS="--conditions react-server" npx tsx "$f"
done
```

`npm run typecheck` pasa limpio sobre todo el proyecto.

**Extensión del doble de Airtable:** `_airtableDouble.ts` ganó soporte para `IS_AFTER`/`IS_BEFORE` en `evaluarFormula` (comparación de fechas ISO como `Date`, no como texto) — necesario porque `listarMovimientos({desde, hasta})` los usa y ningún test anterior lo había ejercitado; `registrarTablaDouble(state, tabla)` para pre-registrar una "otra tabla" sin crear un registro (necesario para que el primer `POST` a `Finanzas Cuadres` no reciba `TABLE_NOT_FOUND`); y `sincronizarInversosCuadre(state, cuadre)`, que propaga `Cuenta`/`Movimiento de Ajuste` de un registro de Cuadre hacia los inversos en `Cuentas Financieras`/`Movimientos Financieros` (dirección opuesta a `sincronizarInversos`, que es Movimiento-céntrica).

---

## 3. Desviaciones del diseño original

Ninguna de fondo. Las 4 correcciones del dueño se implementaron tal como se aprobaron.

---

## 4. Lo que falta y quién lo hace

- **Merge de `fase-20-4-cuadre-reporte` a `main` y deploy** — con el dueño, después de revisar el código y este documento.
- **Manual del dueño, antes o después del deploy** (no bloquea el merge): agregar la opción `Ajuste de Caja` al select `Categoría` de `Movimientos Financieros` en la UI de Airtable — sin ella, `registrarAjusteDeCuadre` fallaría en producción real al intentar escribir esa categoría (los tests usan el doble, no la Airtable real, así que no lo detectan).
- **Verificación visual/interactiva en navegador** — no se completó en esta rama, mismo motivo que en 20.3: requiere una sesión autenticada real y no se intentó mintear una de prueba. Probar el modal "Cuadrar caja" (incluido el atajo hacia "Transferencia entre cuentas") y `/finanzas/reporte` queda para cuando el dueño lo revise en vivo.
- **Fases siguientes** (fuera de alcance de 20.4): tarjetas de crédito como cuentas de deuda, rubros automáticos, distribución a finales, reporte mensual (el código de `calcularReporteDiario` ya está parametrizado por rango — la extensión es de UI, no de lógica).

**Detenido aquí, tal como se pidió — sin merge, sin deploy.**
