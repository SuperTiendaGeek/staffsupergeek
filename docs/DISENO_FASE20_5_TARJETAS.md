# Diseño — Fase 20.5: Tarjetas de crédito (cuentas de deuda, estado de cuenta, alertas de pago)

> Rama: `fase-20-5-tarjetas-credito`. Construido sobre `docs/DISENO_FASE20_1_FUNDACION.md`, `docs/FASE20_1_RESULTADO.md`, `docs/DISENO_FASE20_2_INGRESOS.md`, `docs/FASE20_2_RESULTADO.md`, `docs/DISENO_FASE20_3_OPERACION.md`, `docs/FASE20_3_RESULTADO.md`, `docs/DISENO_FASE20_4_CUADRE_REPORTE.md`, `docs/FASE20_4_RESULTADO.md`, y una inspección fresca (2026-07-15) del código real (`lib/finanzas/*`, `lib/shipping-v2/airtable.ts`, `lib/notificaciones/airtable.ts`, componentes de `/finanzas` y de `/shipping-v2/pagos`).
>
> **Objetivo:** modelar cada tarjeta de crédito como una cuenta de deuda dentro de `Cuentas Financieras`, calcular su estado de cuenta (deuda actual, saldo del último corte, próxima fecha de pago) con precisión de fechas, permitir consumir con ella (Movimiento manual y puente Shipping) y pagarla (transferencia entre cuentas ya existente), y alertar cuánto pagar antes de la fecha de pago.
>
> **Aprobado con 4 correcciones** (integradas abajo, no como apéndice — ver "Registro de correcciones" al final para el detalle de qué cambió y por qué): (1) `resolveCuentaFinancieraLegacy` resuelve por comparación normalizada, no por igualdad exacta de texto — §4.3; (2) la sección de tarjetas de `/finanzas` captura `PreGoLiveError` por tarjeta individual sin romper la sección — §6.1/§3.4; (3) zona horaria UTC explícita, límite documentado del primer ciclo tras el alta, y `saldoUltimoCorte` negativo nunca se presenta crudo — §3.2/§3.5/§8; (4) categoría `Pago Tarjeta de Crédito` aprobada — §5. Etapa B construida directo en la misma rama, sin pausa intermedia — ver `docs/FASE20_5_RESULTADO.md`.

---

## 0. Paso 0 — Estado de `main` antes de diseñar

Verificado hoy, sobre `main` actual (tras el merge de la Fase 20.4), antes de crear la rama de esta fase:

```
npm run typecheck                                              → limpio, 0 errores
52 tests de lib/finanzas/__tests__/*.test.ts (excl. el live)   → 52/52 en verde
```

Comando usado (el mismo de siempre):
```bash
for f in lib/finanzas/__tests__/*.test.ts; do
  case "$f" in *.live.test.ts) continue ;; esac
  NODE_OPTIONS="--conditions react-server" npx tsx "$f"
done
```

**Confirmado: se puede diseñar sobre esta base sin arrastrar ninguna regresión.** Rama `fase-20-5-tarjetas-credito` creada desde `main` en este punto.

---

## 1. Inventario real verificado hoy

### 1.1 Código relevante de `lib/finanzas/`

- `types/finanzas.ts` — `TipoCuenta = "Temporal" | "Principal" | "Final" | "Tránsito"`; `CuentaFinanciera` con `saldoInicial`, `fechaCorte` (fecha única de go-live, no confundir con lo nuevo de esta fase — ver §2.2); `CategoriaMovimiento` ya incluye `"Ajuste de Caja"` (agregada en 20.4, manual del dueño por la limitación de API).
- `lib/finanzas/cuentas.ts` — `CUENTAS_FIELDS`, `mapCuenta`, `fetchCuentasFinancieras`/`fetchCuentaById`/`fetchCuentaPorNombre` (esta última ya filtra por `Nombre`, campo no-link, sin violar el patrón seguro — se reutiliza tal cual para resolver tarjetas por nombre, ver §4.3).
- `lib/finanzas/validaciones.ts` — `evaluarSaldoParaEgresoOMovimientoInterno(tipo, saldoActualCuentaOrigen, monto)`: hoy trata **cualquier** `Egreso`/`Ajuste` igual — si el saldo de la cuenta origen queda negativo tras el movimiento, marca `Alerta Descuadre = true`, nunca rechaza. Para una tarjeta esto es exactamente el problema que el encargo pide resolver: **toda** cuenta de tarjeta vive con saldo negativo por diseño (es deuda), así que con la lógica actual **cualquier consumo dispararía la alerta siempre** — una alerta que nunca se apaga no es una alerta, es ruido. Ver §4.2.
- `lib/finanzas/movimientos.ts` — `crearMovimiento` ya calcula `alertaDescuadre` pasando `cuentaOrigen` (objeto `CuentaFinanciera` completo, ya resuelto en la función) a `evaluarSaldoParaEgresoOMovimientoInterno` — solo falta que esa función reciba también el objeto y decida distinto según `cuenta.tipo`.
- `lib/finanzas/movimiento-manual.ts` — `crearMovimientoManual` no filtra por tipo de cuenta; recibe cualquier `cuentaId`. **Una tarjeta ya funciona como cuenta origen de un Egreso manual sin ningún cambio de código**, en cuanto exista el registro en Airtable.
- `lib/finanzas/deposito.ts` — `procesarDeposito` (usado por el modal "Transferencia entre cuentas") ya es genérico: cualquier par de cuentas conectado por la matriz `Permite Transferir A`/`Permite Recibir De` funciona, incluida una tarjeta como destino. **También funciona sin cambios de código**, en cuanto la matriz de datos lo permita (ver §5).
- `app/finanzas/page.tsx`/`components/finanzas/FinanzasAcciones.tsx`/`DepositoForm.tsx`/`MovimientoManualForm.tsx` — todos reciben la lista de cuentas vía `fetchCuentasFinancieras().filter(activa)`, sin filtrar por `Tipo de Cuenta`. Una tarjeta activa aparece automáticamente en ambos selectores de cuenta el día que exista el registro.
- `lib/finanzas/pre-go-live.ts` — `algunaCuentaSinFechaCorte`/`PreGoLiveError`, reutilizado tal cual por el módulo nuevo de tarjetas (§3).
- `lib/notificaciones/airtable.ts` — `crearNotificacion(input)` exige `destinatarioId` (un usuario puntual, no un broadcast) y no hay ningún mecanismo de cron/job programado en el repo (`vercel.json` no existe, no hay `app/api/cron/*`) — cualquier disparo tendría que ser reactivo (al cargar una página), lo que exige deduplicación manual para no crear notificaciones repetidas cada vez que el dueño visita `/finanzas`. Ver §6.2 para el análisis costo/beneficio completo.

### 1.2 Hallazgo clave — el puente de Shipping V2 ya tiene los nombres de las tarjetas cargados

`lib/shipping-v2/schema.generated.ts` (generado desde el esquema real de Airtable vía `npm run shipping-v2:schema`) muestra que el campo `Cuenta origen` de la tabla `Shipping Pagos` **ya incluye**, como opciones de su select, los nombres reales de las tarjetas del dueño:

```ts
SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen = [
  "Tarjeta C. Pichincha", "Tarjeta D. Supe Geek ", "Tarjeta C. Pacificard", "Tarjeta C. Produbanco",
  "Caja", "PayPal", "Otra", "No aplica",
]
```
(nótese el espacio final en `"Tarjeta D. Supe Geek "` — está así en Airtable hoy, hay que preservarlo tal cual al mapear, ver §4.3).

Pero **ninguna de las 4 tarjetas aparece hoy en el desplegable real** que ve el dueño al marcar un pago de Shipping como pagado. La causa, en `app/shipping-v2/pagos/ShippingV2PagosClient.tsx`:

```ts
const financeAccountOptions = new Set<string>(SHIPPING_V2_FINANCE_SELECT_OPTIONS.cuentaOrigen);
const paymentAccounts = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen.filter(
  (account) => account !== "No aplica" && financeAccountOptions.has(account)
);
```

`paymentAccounts` es la **intersección** entre el select de `Shipping Pagos` (arriba) y `SHIPPING_V2_FINANCE_SELECT_OPTIONS.cuentaOrigen` — que es el campo **`Cuenta origen`, legacy, de `Movimientos Financieros`**, el mismo que la Fase 20.1 §1.2b dejó **congelado para siempre** ("ningún código nuevo lo toca ni lo lee"; solo `["Banco Pichincha", "Caja", "PayPal", "Tarjeta", "Otra", "No aplica"]`). Como ninguno de los 4 nombres de tarjeta está en esa lista muerta, la intersección los descarta — el dueño solo puede elegir `Caja`/`PayPal`/`Otra`. La misma intersección se repite, más estricta (bloquea el submit), en la validación de servidor `normalizeAndValidatePaymentSupportInput` (`lib/shipping-v2/airtable.ts:462`, vía `isAllowedInBothSelects`). Esto explica exactamente el síntoma del encargo: hoy, un pago de Shipping con tarjeta solo puede quedar como `Otra` → sin mapeo en `CUENTA_ORIGEN_LEGACY_A_CUENTA_FINANCIERA` → `Cuenta Origen` sin resolver en el movimiento.

**Esto cambia la naturaleza del problema del puente**: no hace falta ningún cambio de esquema en Shipping V2, ni una UI nueva — el select correcto ya existe y ya lo llena el dueño. Solo hay que dejar de descartar sus opciones contra un select muerto. Ver §4.3 para el diseño exacto.

---

## 2. La tarjeta como cuenta

### 2.1 Campos nuevos en `Cuentas Financieras`

| Campo | Tipo Airtable | Detalle |
|---|---|---|
| `TC Día de Corte` | Número (entero) | Día del mes (1-31) en que cierra el estado de cuenta de esta tarjeta — tal como aparece en el estado de cuenta bancario real. |
| `TC Día de Pago` | Número (entero) | Día del mes (1-31), fecha límite de pago. |
| `TC Cupo` | Moneda | Opcional. Cupo/límite de crédito — solo informativo en v1 (dispara `Alerta Descuadre` si se supera, ver §4.2; no bloquea nada). |

Los tres son campos **nuevos**, sin colisión de nombre con nada existente — se crean vía API sin problema (mismo mecanismo que 20.1 §6 paso 1/20.4 §2.3 paso 1: campos simples, ningún select).

**Desambiguación obligatoria (el encargo la pide con "cuidado extremo"):** `Cuentas Financieras` ya tiene un campo `Fecha de Corte` desde la Fase 20.1 — es **una fecha única**, el día del *go-live contable* de esa cuenta (desde cuándo sus movimientos empiezan a contar para el saldo, `docs/DISENO_FASE20_1_FUNDACION.md` §2.3b). `TC Día de Corte` es **un número de día del mes que se repite cada mes**, el corte del *estado de cuenta bancario* de la tarjeta — un concepto completamente distinto, sin relación entre sí. Una tarjeta tiene los dos campos a la vez y significan cosas diferentes: `Fecha de Corte = 2026-07-15` (el día que esta cuenta entró en vivo en el sistema) y `TC Día de Corte = 5` (todos los meses, el día 5 cierra su estado de cuenta). El código nuevo de esta fase (`lib/finanzas/tarjetas.ts`, §3) nunca escribe ni lee el campo viejo `Fecha de Corte` salvo para el guard de pre-go-live que ya comparten cuadre/depósito/acreditación (§3.4).

### 2.2 `Tipo de Cuenta` — opción nueva, manual del dueño

`Tipo de Cuenta` es un `singleSelect` **existente** desde la Fase 20.1. Por la limitación de API ya documentada dos veces (Hallazgo 2 de `docs/FASE20_1_RESULTADO.md` §2-bis, repetida en 20.4 con `Ajuste de Caja`: `PATCH` sobre un select existente rechaza cualquier cambio a `options.choices` con `422`), agregar la opción **`Tarjeta de Crédito`** es **manual del dueño** en la UI de Airtable. Se agrega el valor al tipo TypeScript `TipoCuenta` en el mismo commit del código (`"Temporal" | "Principal" | "Final" | "Tránsito" | "Tarjeta de Crédito"`).

### 2.3 Convención de signo — decidida aquí, no reabrir después

- **Internamente, el saldo de una tarjeta vive en `≤ 0`.** Se modela con el mismo mecanismo que cualquier otra cuenta (`saldo(cuenta) = SaldoInicial + Σ destino − Σ origen`, `docs/DISENO_FASE20_1_FUNDACION.md` §2.3b) — **sin ningún cambio a `calcularSaldoCuenta`**. Consumir con la tarjeta es un `Egreso` con `Cuenta Origen = tarjeta` → resta de su saldo → más negativo → más deuda. Pagar el estado de cuenta es un `Movimiento Interno` con `Cuenta Destino = tarjeta` → suma a su saldo → menos negativo → menos deuda. Es exactamente la semántica que el encargo describe, sin ninguna excepción de código: la tarjeta es una cuenta más, solo que su `Tipo de Cuenta` hace que el resto del sistema (alertas, presentación) la trate distinto.
- **En la UI, siempre se presenta como `Deuda: $X` en positivo** — `deudaActual = -calcularSaldoCuenta(tarjetaId)`. Ningún número negativo se muestra al dueño para una tarjeta, en ninguna pantalla (§6).
- **Caso borde documentado, no resuelto en v1:** si `deudaActual` da negativo (saldo de la cuenta > 0), significa que se pagó de más — un sobrepago real pero raro. La UI lo muestra como `"Saldo a favor: $X"` en vez de `"Deuda: $X"` (un simple `if` de presentación); no hay ningún flujo para "usar" ese saldo a favor automáticamente — queda como el resto de casos fuera de alcance v1 (intereses, diferidos), resuelto manualmente si ocurre.

### 2.4 Saldo Inicial de go-live de una tarjeta

Actualización a la instrucción operativa de conteo del checklist de la Fase 20.1 (§6 paso 9), específica para cuentas `Tipo de Cuenta = "Tarjeta de Crédito"`:

> **`Saldo Inicial` de una tarjeta = la deuda actual de esa tarjeta el día del corte, escrita **en negativo**.** Si el estado de cuenta bancario real de "Tarjeta C. Pichincha" muestra que se deben $450.00 el día que se da de alta, `Saldo Inicial = -450.00` (no `450.00`). `Fecha de Corte` (el campo viejo de go-live) se llena con la fecha en que se da de alta la tarjeta en el sistema — puede ser cualquier día, no tiene que coincidir con `TC Día de Corte`.

Esto se agrega textualmente a las notas de go-live existentes (§8 de este documento consolida la actualización completa).

### 2.5 Matriz de permisos — instrucción de datos, sin código nuevo

Igual que el resto del sistema desde 20.1, quién puede pagar una tarjeta se declara en `Permite Recibir De`/`Permite Transferir A` (datos en Airtable), no en código:
- Cada tarjeta nueva debe tener `Permite Recibir De` apuntando a las cuentas reales que podrán pagarla (típicamente `SGCAPITAL`, quizá `SGINGRESOS`).
- `Permite Transferir A` de una tarjeta se deja **vacío** — una tarjeta nunca transfiere hacia otra cuenta (no hay ningún caso de uso en v1; si el dueño necesitara mover un saldo a favor entre tarjetas, sería un movimiento manual/ajuste, no una regla de la matriz).

`validarTransferenciaPermitida` (`lib/finanzas/validaciones.ts`) no necesita ningún cambio — ya acepta el permiso declarado desde cualquiera de los dos lados.

---

## 3. Cálculo de estado de cuenta — `lib/finanzas/tarjetas.ts`

Módulo nuevo, mismo espíritu que `lib/finanzas/saldos.ts`/`cuadres.ts`: funciones puras testeables sin red para toda la aritmética de fechas, con un orquestador delgado que hace el fetch. **Ningún estado nuevo en Airtable** — todo se deriva de los movimientos existentes, igual que el resto del sistema.

### 3.1 Qué se calcula, definiciones exactas

| Campo | Definición |
|---|---|
| `deudaActual` | `-calcularSaldoCuenta(tarjetaId)` — la deuda total ahora mismo, incluye todo (consumos del período en curso también). Fuente de verdad ya existente, sin cambios. |
| `fechaUltimoCorte` | La fecha de corte del estado de cuenta más reciente que ya ocurrió (`≤ hoy`), calculada desde `TC Día de Corte` (§3.2). |
| `consumosPeriodoEnCurso` | Σ `Monto` de los `Egreso` con `Cuenta Origen = tarjeta` cuya `Fecha del movimiento > fechaUltimoCorte` — informativo, lo que ya se gastó pero **todavía no** se factura (se facturará en el próximo corte). |
| `saldoUltimoCorte` | `deudaActual − consumosPeriodoEnCurso` — lo que hay que pagar en la próxima fecha de pago, **ya descontando cualquier pago parcial** que se haya registrado después del corte (ver §3.3). |
| `proximaFechaDePago` | Calculada desde `TC Día de Pago` (§3.2). |
| `diasHastaPago` | Días de calendario entre hoy y `proximaFechaDePago`. |
| `cupoExcedido` | `TC Cupo` está definido **y** `deudaActual > TC Cupo`. |

### 3.2 Aritmética de fechas — todos los bordes de calendario resueltos, en UTC explícito

**Corrección 3 — zona horaria:** todas las primitivas de este módulo usan **UTC explícito** (`Date.UTC`/`getUTCFullYear`/`getUTCMonth`/`getUTCDate`), nunca los getters locales (`getFullYear`/`getMonth`) ni la zona horaria del proceso. Es el mismo criterio que ya rige el resto de Finanzas: `Fecha del movimiento` se compara siempre como string ISO 8601 (`mov.fecha >= input.desde`, `lib/finanzas/reporte.ts`), que es UTC implícito. Si estas funciones usaran getters locales, un corte del "día 5" caería en un instante distinto según la zona horaria del proceso que lo calcule (el servidor de Vercel corre en UTC; una laptop de desarrollo en Ecuador está en UTC-5) — con getters locales, correr los mismos tests desde dos máquinas distintas podría dar fechas de corte distintas para el mismo `hoy`. Con UTC explícito, el resultado es determinista sin importar dónde corra el código.

Dos primitivas puras, sin dependencias:

```ts
function diasEnMesUTC(anio: number, mesIndex: number): number {
  return new Date(Date.UTC(anio, mesIndex + 1, 0)).getUTCDate(); // día 0 del mes siguiente = último día de este mes
}

/** "Clampea" un día deseado (1-31) al último día real del mes — resuelve
 * el día 31 en meses de 30 días y febrero (28 o 29, según año bisiesto) sin
 * ningún caso especial: simplemente nunca se pide un día que no existe. */
function fechaEnMesUTC(anio: number, mesIndex: number, diaDeseado: number): Date {
  const dia = Math.min(diaDeseado, diasEnMesUTC(anio, mesIndex));
  return new Date(Date.UTC(anio, mesIndex, dia));
}
```

```ts
/** Corte más reciente ≤ hoy (hoy cuenta como corte si coincide exacto). El
 * mes puede irse a negativo (`mesIndex - 1` en enero → `-1`) — `Date.UTC`
 * normaliza automáticamente el año (diciembre del año anterior); no hace
 * falta ningún caso especial de fin de año. */
export function fechaCorteMasReciente(hoy: Date, diaCorte: number): Date {
  const candidato = fechaEnMesUTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), diaCorte);
  if (candidato > hoy) return fechaEnMesUTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, diaCorte);
  return candidato;
}

/** Próxima ocurrencia de "día de pago" que sea ≥ hoy. Deliberadamente
 * INDEPENDIENTE del corte: no se intenta "emparejar" un corte específico
 * con su fecha de pago exacta (algunos bancos pagan el mismo mes, otros el
 * siguiente, y esa relación no es un dato que el sistema tenga) — el dueño
 * ya conoce ese emparejamiento de su propio estado de cuenta bancario; el
 * sistema solo refleja "cuándo cae la próxima vez ese día del mes", que es
 * lo que necesita para la alerta de N días (§6.2). */
export function proximaFechaDePago(hoy: Date, diaPago: number): Date {
  const candidato = fechaEnMesUTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), diaPago);
  if (candidato >= hoy) return candidato;
  return fechaEnMesUTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, diaPago);
}
```

### 3.3 Pagos parciales — por qué `saldoUltimoCorte` los refleja sin lógica adicional

`saldoUltimoCorte = deudaActual − consumosPeriodoEnCurso` ya es correcto con pagos parciales, sin ningún término extra. Derivación: `calcularSaldoCuenta` (sin cambios) neta **todos** los movimientos de la tarjeta — consumos y pagos, antes y después del corte. Si se resta específicamente lo que se consumió **después** del corte (que no debería contar para "lo que se debe pagar ahora"), lo que queda es exactamente el saldo del corte **ya descontando cualquier pago que se haya aplicado después de él** — porque esos pagos también están dentro de `deudaActual` y no se restan de vuelta. Ejemplo: corte factura $100; se paga $30 la semana siguiente; una nueva compra de $15 llega después del pago. `deudaActual = 100 - 30 + 15 = 85`. `consumosPeriodoEnCurso` (post-corte) `= 15`. `saldoUltimoCorte = 85 - 15 = 70` — exactamente `100 - 30`, el pago parcial ya está reflejado, y la compra nueva queda aparte, informativa, sin mezclarse.

### 3.4 Función pura + orquestador

```ts
export type EstadoTarjeta = {
  cuentaId: string;
  deudaActual: number;             // negativo si hay saldo a favor (§2.3)
  fechaUltimoCorte: string | null; // null si TC Día de Corte no está configurado
  consumosPeriodoEnCurso: number;
  saldoUltimoCorte: number;
  proximaFechaDePago: string | null; // null si TC Día de Pago no está configurado
  diasHastaPago: number | null;
  cupo: number | null;
  cupoExcedido: boolean;
};

/** Pura — recibe el saldo y los movimientos ya resueltos, sin llamar a Airtable. */
export function calcularEstadoTarjetaPuro(
  cuenta: Pick<CuentaFinanciera, "id" | "tcDiaCorte" | "tcDiaPago" | "tcCupo">,
  saldoActual: number,
  movimientosDeLaCuenta: Movimiento[],
  hoy: Date
): EstadoTarjeta {
  const deudaActual = round2(-saldoActual);
  const cupoExcedido = cuenta.tcCupo != null && deudaActual > cuenta.tcCupo;

  if (!cuenta.tcDiaCorte) {
    // Sin TC Día de Corte configurado: se puede mostrar la deuda total,
    // pero no hay corte que calcular — ambos campos de período quedan null/0.
    const pago = cuenta.tcDiaPago ? proximaFechaDePago(hoy, cuenta.tcDiaPago) : null;
    return {
      cuentaId: cuenta.id, deudaActual, fechaUltimoCorte: null, consumosPeriodoEnCurso: 0,
      saldoUltimoCorte: deudaActual, proximaFechaDePago: pago?.toISOString() ?? null,
      diasHastaPago: pago ? diasEntreUTC(hoy, pago) : null, cupo: cuenta.tcCupo, cupoExcedido,
    };
  }

  const corte = fechaCorteMasReciente(hoy, cuenta.tcDiaCorte);
  const corteISO = corte.toISOString();
  const consumosPeriodoEnCurso = round2(
    movimientosDeLaCuenta
      .filter((m) => m.tipo === "Egreso" && m.cuentaOrigenId === cuenta.id && m.fecha > corteISO)
      .reduce((acc, m) => acc + m.monto, 0)
  );
  const saldoUltimoCorte = round2(deudaActual - consumosPeriodoEnCurso);
  const pago = cuenta.tcDiaPago ? proximaFechaDePago(hoy, cuenta.tcDiaPago) : null;

  return {
    cuentaId: cuenta.id, deudaActual, fechaUltimoCorte: corteISO, consumosPeriodoEnCurso, saldoUltimoCorte,
    proximaFechaDePago: pago?.toISOString() ?? null, diasHastaPago: pago ? diasEntreUTC(hoy, pago) : null,
    cupo: cuenta.tcCupo, cupoExcedido,
  };
}

/** Orquestador — fetch + delega en la función pura de arriba. Lanza
 * PreGoLiveError si la tarjeta no tiene Fecha de Corte (go-live) todavía —
 * mismo guard que cuadre/depósito/acreditación. Quien la llama para
 * construir una lista (§3.6) debe capturar ese error por tarjeta, no dejar
 * que tumbe la lista completa. */
export async function calcularEstadoTarjeta(cuentaId: string, opciones?: { hoy?: Date }): Promise<EstadoTarjeta> {
  const cuenta = await fetchCuentaById(cuentaId);
  if (!cuenta) throw new Error(`Cuenta financiera ${cuentaId} no encontrada.`);
  if (!cuenta.fechaCorte) throw new PreGoLiveError();
  const hoy = opciones?.hoy ?? new Date();
  const [saldoActual, movimientos] = await Promise.all([
    calcularSaldoCuenta(cuentaId),
    fetchMovimientosDeCuentaPorEstado(cuentaId, cuenta.fechaCorte, ESTADOS_QUE_CUENTAN_PARA_SALDO),
  ]);
  return calcularEstadoTarjetaPuro(cuenta, saldoActual, movimientos, hoy);
}
```

`diasEntreUTC(a, b)` — diferencia de días de **calendario** en UTC (no de milisegundos exactos, para que "hoy a las 23:00 UTC" y "la fecha de pago a las 00:00 UTC" no den un resultado engañoso por horas): trunca ambas fechas a medianoche UTC antes de restar.

`fetchMovimientosDeCuentaPorEstado` y `ESTADOS_QUE_CUENTAN_PARA_SALDO` ya existen (`lib/finanzas/saldos.ts`, exportada desde 20.3) — cero funciones nuevas de lectura, se reutiliza el mismo patrón seguro (nunca se filtra `Movimientos Financieros` por link; se lee el inverso ya presente en la Cuenta).

`CUENTAS_FIELDS`/`mapCuenta`/`CuentaFinanciera` ganan `tcDiaCorte`/`tcDiaPago`/`tcCupo` (vía `firstNumber`, mismo patrón que `saldoInicial`) — lectura de 3 campos nuevos, nada más.

### 3.5 Límite documentado — el primer ciclo tras el alta puede sobrestimar `saldoUltimoCorte`

**Corrección 3.** El sistema no guarda un snapshot por cada estado de cuenta real del banco — solo un saldo corriente (`Saldo Inicial` + movimientos). Si la `Fecha de Corte` (go-live, campo viejo) de una tarjeta **no coincide** con el día siguiente a su `TC Día de Corte` real, el primer cálculo de `saldoUltimoCorte` puede incluir, dentro del `Saldo Inicial` cargado a mano, deuda que en la realidad todavía no había sido facturada por el banco en el corte que el sistema calcula como "el más reciente" — el sistema no tiene forma de saber qué parte de `Saldo Inicial` corresponde a un corte ya facturado y cuál a consumo posterior no facturado todavía, así que atribuye todo el `Saldo Inicial` al corte calculado, sobrestimando lo que realmente vence en la próxima fecha de pago.

**Mitigación recomendada, documentada en la mini-guía (§7) y en las notas de go-live (§8):** dar de alta cada tarjeta **justo después de su día real de corte** (`Fecha de Corte` del go-live = uno o dos días después de `TC Día de Corte`), con `Saldo Inicial` = exactamente el saldo que aparece facturado en ese estado de cuenta. Así el primer `saldoUltimoCorte` calculado coincide con la realidad desde el primer ciclo. Si no es posible (se da de alta a mitad de ciclo), el primer ciclo puede sobrestimar — a partir del segundo corte que el sistema ve completo, el cálculo es exacto sin ninguna acción adicional.

### 3.6 Presentación — nunca un `saldoUltimoCorte` negativo crudo

**Corrección 3.** `saldoUltimoCorte` puede dar negativo en un caso borde (se pagó de más después del corte, cubriendo también parte del período en curso). Mostrar `"$-30.00"` como "lo que falta pagar" es ilegible para el dueño. Helper de presentación, puro, en el mismo módulo:

```ts
export function presentarPendienteDelCorte(saldoUltimoCorte: number): { pendiente: number; saldoAFavor: number } {
  return {
    pendiente: Math.max(0, round2(saldoUltimoCorte)),
    saldoAFavor: Math.max(0, round2(-saldoUltimoCorte)),
  };
}
```

La UI (§6.1) siempre consume `pendiente` para "Saldo del último corte: $X" y, si `saldoAFavor > 0`, agrega una nota aparte ("saldo a favor: $Y") — nunca un número negativo crudo. Mismo criterio para `deudaActual` (§2.3): si da negativo, la UI muestra `"Saldo a favor: $X"` en vez de `"Deuda: $X"` con signo.

---

## 4. Consumir con la tarjeta

### 4.1 Movimiento manual — ya funciona, sin cambios de código

`crearMovimientoManual` no filtra por `Tipo de Cuenta`; en cuanto exista el registro de la tarjeta y esté `Activa`, aparece en el selector de cuenta de `MovimientoManualForm` para un `Egreso` (compra local, "Otro", etc.) igual que Caja o PayPal. **Verificado, sin cambios necesarios.**

### 4.2 Alerta Descuadre — política nueva para tarjetas

Cambio necesario en `lib/finanzas/validaciones.ts` — `evaluarSaldoParaEgresoOMovimientoInterno` gana un cuarto parámetro opcional con la cuenta origen completa:

```ts
export function evaluarSaldoParaEgresoOMovimientoInterno(
  tipo: TipoMovimiento,
  saldoActualCuentaOrigen: number,
  monto: number,
  cuentaOrigen?: Pick<CuentaFinanciera, "tipo" | "tcCupo">
): { alertaDescuadre: boolean } {
  // Fase 20.5 — una tarjeta de crédito vive con saldo negativo por diseño
  // (es deuda, no una cuenta de dinero disponible): la deuda normal NUNCA
  // dispara Alerta Descuadre. Lo único que se marca es superar TC Cupo, si
  // el dueño lo definió — mismo criterio "nunca bloquea, alerta" que el
  // resto de Egresos, solo que el umbral es el cupo, no $0.
  if ((tipo === "Egreso" || tipo === "Ajuste") && cuentaOrigen?.tipo === "Tarjeta de Crédito") {
    if (cuentaOrigen.tcCupo == null) return { alertaDescuadre: false };
    const deudaTrasElMovimiento = round2(-saldoActualCuentaOrigen + monto);
    return { alertaDescuadre: deudaTrasElMovimiento > cuentaOrigen.tcCupo };
  }

  const saldoInsuficiente = round2(saldoActualCuentaOrigen - monto) < 0;
  if (tipo === "Movimiento Interno") {
    if (saldoInsuficiente) throw new Error(/* mensaje existente, sin cambios */);
    return { alertaDescuadre: false };
  }
  return { alertaDescuadre: saldoInsuficiente };
}
```

`crearMovimiento` (`lib/finanzas/movimientos.ts`) ya tiene `cuentaOrigen` resuelto como objeto completo en el punto donde llama a esta función — el único cambio es pasarlo:

```ts
alertaDescuadre = evaluarSaldoParaEgresoOMovimientoInterno(input.tipo, saldoActual, input.monto, cuentaOrigen).alertaDescuadre;
```

**Un `Egreso`/`Ajuste` desde una tarjeta nunca se rechaza** — se mantiene exactamente la política de 20.1 ("consumir con tarjeta no requiere saldo, es deuda", palabras del encargo). Un `Movimiento Interno` con `Cuenta Origen` = una cuenta real (pagar la tarjeta) sigue el camino normal sin ningún cambio — el bloqueo por saldo insuficiente de `SGCAPITAL` (la cuenta que sí es dinero real) queda intacto, tal como pide el encargo explícitamente.

### 4.3 Puente Shipping — cambio mínimo, cero esquema nuevo

Con el hallazgo de §1.2 (el select de `Shipping Pagos` ya tiene los 4 nombres de tarjeta correctos, solo está siendo filtrado por un select muerto), el diseño es dejar de comparar contra `SHIPPING_V2_FINANCE_SELECT_OPTIONS.cuentaOrigen` en los dos puntos donde se usa hoy:

**1. Dropdown (`app/shipping-v2/pagos/ShippingV2PagosClient.tsx`)** — eliminar la intersección, usar directo el select propio de Shipping Pagos:
```ts
// Antes:
const financeAccountOptions = new Set<string>(SHIPPING_V2_FINANCE_SELECT_OPTIONS.cuentaOrigen);
const paymentAccounts = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen.filter(
  (account) => account !== "No aplica" && financeAccountOptions.has(account)
);

// Después:
const paymentAccounts = SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen.filter((account) => account !== "No aplica");
```
El dueño ve inmediatamente las 4 tarjetas en el desplegable, sin ningún cambio de esquema — la lista sale del propio select de `Shipping Pagos`, que él mismo ya llenó.

**2. Validación de servidor (`normalizeAndValidatePaymentSupportInput`, `lib/shipping-v2/airtable.ts:462`)** — mismo criterio, deja de exigir presencia en el select muerto:
```ts
// Antes:
if (!isAllowedInBothSelects(cuentaOrigen, SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen, SHIPPING_V2_FINANCE_SELECT_OPTIONS.cuentaOrigen)) { ... }

// Después (mismo helper, mismo argumento repetido — valida contra su propio select, nada más):
if (!isAllowedInBothSelects(cuentaOrigen, SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen, SHIPPING_V2_PAYMENT_SELECT_OPTIONS.cuentaOrigen)) { ... }
```
(`metodoPago` no se toca — sigue validando contra los dos selects tal cual, fuera de alcance de esta fase.)

**3. Resolución a `Cuentas Financieras` (`resolveCuentaFinancieraLegacy`, `lib/shipping-v2/airtable.ts`)** — hoy es un diccionario estático de 3 entradas (`caja`, `paypal`, `banco pichincha`), resuelto por igualdad exacta de texto (`fetchCuentaPorNombre`). **Corrección 1:** el *fallback* para cualquier texto fuera del diccionario (las tarjetas) no compara por igualdad exacta — compara **normalizado** (`trim` + minúsculas + espacios internos colapsados) contra el `Nombre` de cada `Cuenta Financiera` **activa**. Esto evita que un espacio invisible o una diferencia de mayúsculas entre el select de Shipping y el nombre de la cuenta rompa la resolución — el caso real detectado en §1.2 (`"Tarjeta D. Supe Geek "`, con espacio final).

```ts
// lib/finanzas/cuentas.ts — nuevo, junto a fetchCuentaPorNombre
function normalizarNombreCuenta(texto: string): string {
  return texto.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Fase 20.5 — resolución tolerante a espacios/mayúsculas, para textos que
 * vienen de selects legacy fuera de este módulo (p. ej. el select de
 * Shipping Pagos) y no se pueden garantizar carácter-por-carácter iguales
 * al Nombre real de la Cuenta Financiera. Solo considera cuentas activas. */
export async function fetchCuentaPorNombreNormalizado(texto: string): Promise<CuentaFinanciera | null> {
  const objetivo = normalizarNombreCuenta(texto);
  if (!objetivo) return null;
  const cuentas = await fetchCuentasFinancieras();
  return cuentas.find((c) => c.activa && normalizarNombreCuenta(c.nombre) === objetivo) ?? null;
}
```

```ts
// lib/shipping-v2/airtable.ts
const CUENTA_ORIGEN_LEGACY_A_CUENTA_FINANCIERA: Record<string, string> = {
  caja: "Caja Registradora",
  paypal: "PayPal",
  "banco pichincha": "SGINGRESOS", // confirmado §1.5 de 20.1 — sin cambios
};

async function resolveCuentaFinancieraLegacy(cuentaOrigenTexto: string): Promise<string | null> {
  const clave = normalizeStatus(cuentaOrigenTexto);
  const nombreMapeado = CUENTA_ORIGEN_LEGACY_A_CUENTA_FINANCIERA[clave];
  const cuenta = nombreMapeado
    ? await fetchCuentaPorNombre(nombreMapeado) // los 3 mapeados sí son iguales exactos, ya probado desde 20.1
    : await fetchCuentaPorNombreNormalizado(cuentaOrigenTexto); // Fase 20.5 — fallback tolerante (tarjetas)
  if (!cuenta) {
    console.warn(`[Finanzas] Cuenta origen legacy "${cuentaOrigenTexto}" sin Cuenta Financiera resoluble — el movimiento se crea sin Cuenta Origen.`);
    return null;
  }
  return cuenta.id;
}
```
Esto resuelve **cualquier** tarjeta cuyo nombre en `Cuentas Financieras` coincida, ignorando mayúsculas/minúsculas y espacios de más, con el texto del select legacy de Shipping — sin diccionario que mantener a mano por cada tarjeta nueva, y sin exigir copiar espacios invisibles al crear el registro (la mini-guía, §7, ya no lo exige — ver actualización). Si aun así no hay ninguna coincidencia (nombre realmente distinto, tarjeta inactiva, typo grave), el comportamiento es el mismo de siempre desde 20.1: `console.warn` + el pago se crea igual sin `Cuenta Origen` resuelta (nunca bloquea un pago a proveedor ya hecho) — **no es una regresión, es la misma política ya aprobada, ahora con más cobertura**.

**Por qué esto es "cambio mínimo" y también la versión "ideal":** el encargo permitía un corte honesto si tocar Shipping V2 excedía lo razonable. No hizo falta — el esquema de Shipping V2 no se toca en absoluto (ni el campo `Cuenta origen` ni ningún otro), solo 3 puntos de código ya existentes se relajan para dejar de comparar contra un select que la Fase 20.1 declaró muerto hace 4 fases. La alternativa "de verdad ideal" (reemplazar el `singleSelect` de texto en `Shipping Pagos` por un link real a `Cuentas Financieras`, con un selector de registros en la UI) tocaría el esquema generado de Shipping V2 y su formulario de pago — un módulo grande y estable — por un beneficio marginal sobre lo anterior (deja de depender de coincidencia exacta de texto). **Se documenta como mejora futura opcional, no se construye en esta fase.**

---

## 5. Pago de la tarjeta — sin lógica nueva, matriz + categoría propia

Confirmado en §1.1: `procesarDeposito`/`DepositoForm` (modal "Transferencia entre cuentas", 20.3) ya son genéricos sobre cualquier par de cuentas conectado por la matriz. En cuanto la tarjeta tenga `Permite Recibir De: [SGCAPITAL]` (dato, §2.5), pagarla es literalmente usar ese modal sin ningún cambio de código — exactamente lo que pide el encargo ("Sin lógica nueva si la matriz basta").

**Corrección 4 — aprobada: categoría propia**, para que el reporte no confunda un pago de tarjeta con un depósito de caja. Hoy `procesarDeposito` fija `categoria: "Depósito de Caja"` siempre, sin importar el par de cuentas. Se agrega la opción `"Pago Tarjeta de Crédito"` al select `Categoría` (manual del dueño, misma limitación de API que `Ajuste de Caja` en 20.4 — un paso más en el mismo checklist, §7) y un condicional de una línea en `procesarDeposito`:
```ts
categoria: cuentaDestino?.tipo === "Tarjeta de Crédito" ? "Pago Tarjeta de Crédito" : "Depósito de Caja",
```
`CategoriaMovimiento` (`types/finanzas.ts`) gana `"Pago Tarjeta de Crédito"` en el union. Todo lo demás de `procesarDeposito` queda idéntico (mismas validaciones, mismo `PreGoLiveError`, mismo `crearMovimiento`).

**Observación menor, no bloqueante:** `SGCAPITAL` hoy tiene `Permite Transferir A` vacío (por diseño de 20.1: "solo sale vía egreso de compra real"), y `DepositoForm` cae a "mostrar todas las cuentas como destino" cuando `permiteTransferirAIds` está vacío — con las tarjetas nuevas, ese desplegable de destino se vuelve más largo (incluye cuentas irrelevantes además de las tarjetas). El servidor sigue validando correctamente contra la matriz real; es solo una oportunidad de pulido de UX, no se resuelve en esta fase.

---

## 6. Visibilidad y alertas

### 6.1 `/finanzas` — sección propia, sin ambigüedad con "Tarjetas en Tránsito"

Nueva sección **"Tarjetas de crédito"** en `app/finanzas/page.tsx`, después de la grilla de cuentas de dinero existente (esa grilla existente pasa a excluir las cuentas `Tipo de Cuenta = "Tarjeta de Crédito"` — no tiene sentido mostrar su saldo crudo, negativo, junto a las cuentas de dinero disponible). Cada tarjeta activa se muestra con:
- `StaffStatCard` — label: nombre de la tarjeta; value: `Deuda: $X` (tono `orange` si `> 0`, `lime` si `0`, y si `deudaActual < 0` se presenta `"Saldo a favor: $X"`, nunca el negativo crudo — §3.6); si `cupoExcedido`, un `⚠` con tooltip "Cupo excedido".
- Sub-línea: `Saldo del último corte: $X · próximo pago DD mmm` (usando `presentarPendienteDelCorte`, §3.6 — nunca negativo crudo), o "Sin TC Día de Corte configurado" si `fechaUltimoCorte` es `null`.

Encabezado de sección propio ("Cuentas y tránsito de pasarelas" para la grilla existente, "Tarjetas de crédito" para la nueva) — sin renombrar ningún registro de Airtable (el nombre real "Tarjetas en Tránsito" es un dato del dueño, no una etiqueta de UI); el contraste de encabezados en pantalla ya distingue "dinero por recibir" de "deuda por pagar" sin tocar datos.

**Corrección 2 — captura de `PreGoLiveError` por tarjeta individual, sin romper la sección.** Si una tarjeta se acaba de crear en Airtable y todavía no tiene `Fecha de Corte` (go-live) llenada, `calcularEstadoTarjeta` lanza `PreGoLiveError` (§3.4) — la sección **no debe caerse entera** por una tarjeta a medio configurar. Se agrega un orquestador de lista, mismo módulo `lib/finanzas/tarjetas.ts`, que captura ese error **por tarjeta**:

```ts
export type ResultadoEstadoTarjeta =
  | { cuentaId: string; nombre: string; disponible: true; estado: EstadoTarjeta }
  | { cuentaId: string; nombre: string; disponible: false };

/** Una tarjeta activa sin Fecha de Corte (go-live) todavía no rompe la
 * lista completa — se marca "no disponible" y las demás se calculan
 * normalmente. Cualquier error que NO sea PreGoLiveError sí se propaga
 * (no hay que esconder bugs reales detrás de este guard). */
export async function listarEstadosTarjetas(hoy?: Date): Promise<ResultadoEstadoTarjeta[]> {
  const cuentas = await fetchCuentasFinancieras();
  const tarjetas = cuentas.filter((c) => c.tipo === "Tarjeta de Crédito" && c.activa);
  return Promise.all(
    tarjetas.map(async (cuenta) => {
      try {
        const estado = await calcularEstadoTarjeta(cuenta.id, { hoy });
        return { cuentaId: cuenta.id, nombre: cuenta.nombre, disponible: true as const, estado };
      } catch (error) {
        if (error instanceof PreGoLiveError) {
          return { cuentaId: cuenta.id, nombre: cuenta.nombre, disponible: false as const };
        }
        throw error;
      }
    })
  );
}
```

`app/finanzas/page.tsx` llama a `listarEstadosTarjetas()` una vez (no `calcularEstadoTarjeta` por tarjeta a mano) y renderiza cada resultado: si `disponible: false`, un `StaffStatCard` con value `"Pendiente de activar"` (tono `neutral`) en vez de la deuda — la tarjeta aparece en la sección, visible, con una señal clara de que falta el paso de go-live, sin ningún error ni banner roto. Mismo criterio se usa en el reporte diario (§6.2) para la alerta de pago próximo: una tarjeta `disponible: false` simplemente no participa en la alerta (no se puede calcular `diasHastaPago` sin `Fecha de Corte`).

### 6.2 Alerta de pago próximo

**Regla:** cuando `diasHastaPago <= N` (propuesto `N = 3`, constante `DIAS_ALERTA_PAGO_TARJETA` en `lib/finanzas/tarjetas.ts`, fácil de ajustar) y `saldoUltimoCorte > 0`, se muestra un aviso destacado.

- **`/finanzas`:** banner agregado (mismo estilo que el banner de `preGoLive` ya existente, tono naranja en vez de azul por ser accionable) listando cada tarjeta en ventana de alerta: *"Pagar Tarjeta C. Pichincha: $150.00 antes del 20 jul."* — una línea por tarjeta, todas dentro del mismo banner si hay más de una.
- **Reporte diario (`app/finanzas/reporte/page.tsx`):** mismo contenido, como una sección más junto al resto de tarjetas de estado (`StaffStatCard`) — coherente con que esa pantalla ya es "la del dueño" para mirar el día completo.
- La alerta **desaparece sola** cuando `saldoUltimoCorte` llega a `$0` (tras registrar el pago) — no hay ningún estado que "cerrar" a mano, es una consecuencia directa del cálculo en vivo (§3), igual que el resto de indicadores del sistema.

**¿Se integra con la tabla `Notificaciones` existente?** Evaluado, **no en v1**, con este argumento de costo/beneficio:
- `crearNotificacion` exige un `destinatarioId` puntual (un usuario), no hay concepto de "avisar a todos los admins" ya construido — habría que resolver la lista de usuarios admin (`listPortalUsers` + filtro de rol) y crear una notificación por cada uno.
- No existe ningún mecanismo de cron/job programado en el proyecto (`vercel.json` no existe, no hay `app/api/cron/*`) — cualquier disparo de esta fase tendría que ser **reactivo**, ejecutado dentro de una carga de página (`/finanzas` o el reporte). Eso obliga a deduplicar (verificar si ya existe una notificación no leída para esa tarjeta+fecha de pago antes de crear otra) para no llenar la tabla de duplicados cada vez que el dueño abre la pantalla — lógica extra, con su propio riesgo de bugs, para un beneficio que el banner visual ya cubre **siempre que el dueño entre a `/finanzas`**, que es exactamente su flujo diario ya establecido desde 20.1-20.4.
- El caso donde Notificaciones sí agregaría valor real es avisar **cuando el dueño no está mirando el portal** (push/email proactivo) — eso requiere una tarea programada de verdad (Vercel Cron Job, infraestructura que el proyecto no tiene hoy) y es una pieza más grande que esta fase, mejor evaluada aparte si el dueño la pide explícitamente.

**Recomendación: v1 solo visual** (banner en `/finanzas` + reporte diario). Se documenta la integración con Notificaciones + Vercel Cron como mejora futura, no bloqueante.

### 6.3 Reporte diario — verificación de que no hay doble conteo

Revisado contra `lib/finanzas/reporte.ts` — sin necesidad de ningún cambio de código:
- Un consumo con tarjeta (`Egreso`, `Cuenta Origen = tarjeta`) cae en `egresosMovs`/`egresosPorCategoria` exactamente igual que cualquier otro egreso, agrupado por su `Categoría` real (p. ej. `"Compra Proveedor Shipping"` o `"Compra Local Repuesto"`) — el reporte no distingue por tipo de cuenta origen, solo por categoría, así que funciona sin tocar `calcularReporteDiario`.
- Un pago de estado de cuenta (`Movimiento Interno`, SGCAPITAL→tarjeta) cae en `movimientosInternos`, listado con `cuentaOrigenNombre`/`cuentaDestinoNombre` ya resueltos — aparece una sola vez, en esa lista, nunca en Ingresos ni Egresos (tipos disjuntos por construcción). **Sin doble conteo, verificado por inspección de código; se confirma con un test dedicado (§9 #15).**

---

## 7. Checklist de esquema — qué es vía API y qué es manual del dueño

**Vía API (yo, en Manual mode, igual que fases anteriores):**
1. Agregar a `Cuentas Financieras` los 3 campos nuevos de §2.1: `TC Día de Corte` (número), `TC Día de Pago` (número), `TC Cupo` (moneda). Sin colisión de nombre, sin límite de API.

**Manual del dueño (limitación de API ya conocida — no se puede ampliar un select existente vía `PATCH`):**
2. Agregar la opción **`Tarjeta de Crédito`** al select `Tipo de Cuenta` de `Cuentas Financieras`.
3. Agregar la opción **`Pago Tarjeta de Crédito`** al select `Categoría` de `Movimientos Financieros` (Corrección 4 — aprobada, §5).
4. Crear un registro de `Cuentas Financieras` por cada tarjeta — **mini-guía exacta abajo**.

**Nada que hacer en Shipping V2** — el select `Cuenta origen` de `Shipping Pagos` ya tiene las opciones correctas (§1.2); solo cambia código de lectura (§4.3).

### Mini-guía — qué llenar al dar de alta una tarjeta

| Campo | Qué poner |
|---|---|
| `Nombre` | Recomendado: un nombre parecido al texto que ya existe en el select `Cuenta origen` de Shipping Pagos (p. ej. `"Tarjeta C. Pichincha"`) para que el puente de Shipping la resuelva sola (§4.3). **No hace falta copiar espacios o mayúsculas exactos** — la resolución es tolerante a eso (Corrección 1); solo debe ser reconociblemente el mismo nombre. |
| `Tipo de Cuenta` | `Tarjeta de Crédito` |
| `TC Día de Corte` | Día del mes (1-31) del corte, según tu estado de cuenta bancario real. |
| `TC Día de Pago` | Día del mes (1-31), fecha límite de pago. |
| `TC Cupo` | Opcional — el cupo/límite de la tarjeta, si quieres que el sistema te avise al superarlo. |
| `Activa` | ✓ |
| `Saldo Inicial` | La deuda actual de la tarjeta hoy, **en negativo** (si debes $450, escribe `-450.00`). Recomendado: da de alta la tarjeta justo después de su día de corte real, con este valor igual al saldo que aparece facturado en ese estado de cuenta — evita que el primer ciclo calculado sobrestime lo que hay que pagar (§3.5). |
| `Fecha de Corte` | La fecha de hoy (o el día en que decidas activarla) — **no confundir con `TC Día de Corte`** (ver §2.1). |
| `Permite Recibir De` | Las cuentas reales que podrán pagarla — típicamente `SGCAPITAL`. |
| `Permite Transferir A` | Dejar vacío. |

---

## 8. Notas de go-live — actualización consolidada

Se agrega al checklist de la Fase 20.1 (§6) y al de la Fase 20.3 (§3.7, cuentas de tránsito) esta tercera instrucción específica:

> **Para cada `Cuenta Financiera` de `Tipo de Cuenta = "Tarjeta de Crédito"`**: `Saldo Inicial` = la deuda real de esa tarjeta el día de alta, escrita en **negativo** (§2.4). `Fecha de Corte` = el día de alta en el sistema (no tiene que coincidir con `TC Día de Corte`, que es un campo distinto — §2.1). A diferencia de las cuentas de dinero (Caja, SGINGRESOS, etc.), donde `Saldo Inicial` se cuenta con la mano sobre efectivo o saldo bancario real, y a diferencia de `Tarjetas en Tránsito` (donde se cuenta la suma de pendientes, §3.7 de 20.3), en una tarjeta de crédito lo que se "cuenta" es la deuda que ya figura en el estado de cuenta bancario del banco emisor.
>
> **Corrección 3 — recomendación de sincronía con el corte real:** siempre que sea posible, da de alta la tarjeta el mismo día o el día siguiente a su `TC Día de Corte` real, con `Saldo Inicial` igual al saldo que aparece facturado en ese estado de cuenta exacto. Si se da de alta a mitad de un ciclo, el primer `saldoUltimoCorte` calculado por el sistema puede sobrestimar lo que realmente vence en la próxima fecha de pago (§3.5) — a partir del segundo corte que el sistema alcanza a ver completo, el cálculo es exacto sin ninguna acción adicional. No es un error del sistema, es un límite conocido de partir de un saldo corriente sin snapshot histórico por estado de cuenta.
>
> **Nota de zona horaria:** todo el cálculo de corte/pago de tarjetas usa UTC explícito (§3.2) — los días de corte y pago caen en la fecha calendario UTC correspondiente, consistente con cómo ya se guarda `Fecha del movimiento` en el resto del sistema.

---

## 9. Plan de pruebas — Etapa B

1. **`fechaEnMesUTC`/`fechaCorteMasReciente` — día 31 en mes de 30 días**: `TC Día de Corte = 31`, mes de abril/junio/septiembre/noviembre → cae en el día 30 real de ese mes.
2. **`fechaEnMesUTC`/`fechaCorteMasReciente` — febrero, año no bisiesto y bisiesto**: `TC Día de Corte = 31` en febrero → cae el 28 (o 29 en año bisiesto).
3. **`fechaCorteMasReciente` — cambio de año**: `TC Día de Corte = 28`, hoy = 3 de enero → corte más reciente = 28 de diciembre del año anterior.
4. **`proximaFechaDePago` — hoy coincide exacto con el día de pago**: cuenta como "hoy", no rueda al mes siguiente.
5. **`proximaFechaDePago` — el día ya pasó este mes**: rueda al mes siguiente, con clamping de días cortos (p. ej. `TC Día de Pago = 31`, hoy = 5 de abril → próxima fecha = 30 de abril, no 31).
6. **`calcularEstadoTarjetaPuro` — `saldoUltimoCorte` con pago parcial después del corte**: réplica numérica de §3.3 (factura $100, pago parcial $30, consumo nuevo $15 post-corte) → `saldoUltimoCorte = $70`, `consumosPeriodoEnCurso = $15`, `deudaActual = $85`.
7. **`calcularEstadoTarjetaPuro` — `consumosPeriodoEnCurso` excluye correctamente lo anterior al corte**: un consumo justo antes y otro justo después del corte más reciente → solo el segundo cuenta.
8. **`calcularEstadoTarjetaPuro` — `cupoExcedido`**: `false` sin `TC Cupo` definido; `true` al superarlo; `false` justo por debajo (borde exacto).
9. **`calcularEstadoTarjeta` — pre-go-live**: tarjeta sin `Fecha de Corte` → `PreGoLiveError`, sin ningún cálculo parcial devuelto.
10. **`evaluarSaldoParaEgresoOMovimientoInterno` — deuda normal de tarjeta nunca marca Alerta Descuadre**: `Egreso` desde una tarjeta con saldo ya negativo y sin `TC Cupo` definido → `alertaDescuadre: false`, siempre, sin importar cuánto crezca la deuda.
11. **`evaluarSaldoParaEgresoOMovimientoInterno` — cupo excedido sí marca, nunca bloquea**: `Egreso` que hace que la deuda supere `TC Cupo` → `alertaDescuadre: true`, y el movimiento se crea igual (verificado a nivel de `crearMovimiento`, no solo la función pura).
12. **`crearMovimiento` — Movimiento Interno hacia una tarjeta sigue bloqueando por saldo insuficiente de la cuenta ORIGEN real**: test de no-regresión, `SGCAPITAL` sin fondos suficientes para pagar → rechazado antes de tocar Airtable, exactamente igual que cualquier otro `Movimiento Interno` (20.1 test #2).
13. **`resolveCuentaFinancieraLegacy` — Corrección 1, resuelve por comparación normalizada**: texto legacy con espacio final y/o mayúsculas distintas (réplica exacta del caso real, `"Tarjeta D. Supe Geek "` vs. `Nombre` = `"Tarjeta D. Supe Geek"` sin espacio, o con diferencias de capitalización) → resuelve igual a la Cuenta Financiera correcta.
14. **`resolveCuentaFinancieraLegacy` — solo considera cuentas activas**: una Cuenta Financiera con nombre coincidente pero `Activa = false` → no resuelve, mismo comportamiento que "no encontrada".
15. **`resolveCuentaFinancieraLegacy` — nombre sin `Cuenta Financiera` correspondiente**: sigue el comportamiento ya existente desde 20.1 (warning + `permitirCuentaFaltante`), el pago no se bloquea.
16. **`listarEstadosTarjetas` — Corrección 2, `PreGoLiveError` no rompe la lista**: dos tarjetas activas, una con `Fecha de Corte` y otra sin ella → la primera devuelve `disponible: true` con su estado calculado, la segunda `disponible: false`, sin que la función lance ni pierda la primera.
17. **`listarEstadosTarjetas` — un error real (no `PreGoLiveError`) sí se propaga**: no se esconde un bug detrás del guard de pre-go-live.
18. **`presentarPendienteDelCorte` — Corrección 3, nunca negativo crudo**: `saldoUltimoCorte` negativo (sobrepago) → `pendiente: 0`, `saldoAFavor` = el valor absoluto correcto; `saldoUltimoCorte` positivo → `pendiente` = el valor, `saldoAFavor: 0`.
19. **`procesarDeposito` — Corrección 4, categoría `Pago Tarjeta de Crédito`**: `Cuenta Destino` de tipo `Tarjeta de Crédito` → el movimiento se crea con esa categoría; cualquier otro destino → sigue siendo `"Depósito de Caja"`, sin regresión.
20. **Reporte diario — sin doble conteo**: un consumo de tarjeta aparece en Egresos por categoría; un pago de tarjeta aparece en Movimientos internos del día; ninguno de los dos aparece en el otro bucket.
21. **Alerta de pago próximo — aparece y desaparece**: con `diasHastaPago <= N` y `saldoUltimoCorte > 0`, la alerta está presente; tras registrar el pago completo (`saldoUltimoCorte = 0`), desaparece en el siguiente cálculo — sin ningún estado que limpiar a mano.
22. **Suite completa 20.1 + 20.2 + 20.3 + 20.4 + 20.5 + `npm run typecheck`** — cero regresiones.

---

## 10. Prueba de fuego

Dos tarjetas dadas de alta con corte/pago distintos, `SGCAPITAL` con `Saldo Inicial = $500.00`, `Fecha de Corte` (go-live) = `2026-06-25` en las 3 cuentas relevantes.

| Tarjeta | `TC Día de Corte` | `TC Día de Pago` | `Saldo Inicial` |
|---|---|---|---|
| Tarjeta C. Pichincha (A) | 5 | 20 | $0.00 |
| Tarjeta C. Produbanco (B) | 20 | — (no configurado, para probar el caso sin `TC Día de Pago`) | $0.00 |

**Evento 1 — 2026-07-03, consumo Shipping con Tarjeta A, $150** (puente arreglado, §4.3: el dueño elige `"Tarjeta C. Pichincha"` al marcar un pago de proveedor de Shipping como pagado, ahora visible en el desplegable; se resuelve a la Cuenta Financiera A vía `fetchCuentaPorNombre`): `Egreso · Categoría: Compra Proveedor Shipping · Cuenta Origen: A · $150.00`. → Saldo A: **-$150.00**.

Estado calculado el mismo día (`hoy = 2026-07-03`): `fechaCorteMasReciente(03-jul, día 5) = 05-jun` (el corte de julio, día 5, todavía no llega — retrocede a junio). `consumosPeriodoEnCurso` (post 05-jun, ≤ 03-jul) = **$150.00** (este consumo es posterior al corte de junio). `deudaActual = $150.00`. `saldoUltimoCorte = 150 − 150 = $0.00` — correcto: esta compra todavía no se factura, se facturará en el corte del 5 de julio.

**Evento 2 — 2026-07-12, egreso manual con Tarjeta B, $80** (`Categoría: Compra Local Repuesto`, cuenta = B): `Egreso · Cuenta Origen: B · $80.00`. → Saldo B: **-$80.00**.

**Estado el 2026-07-06** (`hoy = 06-jul`, después del corte del 5 de julio de A, sin nuevos movimientos en A): `fechaCorteMasReciente(06-jul, día 5) = 05-jul` (≤ hoy). `consumosPeriodoEnCurso` (post 05-jul, ≤ 06-jul) = **$0.00** (el consumo de $150 ya quedó del lado de "antes" del corte). `deudaActual = $150.00`. `saldoUltimoCorte = 150 − 0 = $150.00` — el mismo consumo que antes del corte era "informativo", ahora es "lo que hay que pagar". `proximaFechaDePago(06-jul, día 20) = 2026-07-20`. `diasHastaPago = 14`.

**Estado de B el 2026-07-12** (`hoy = 12-jul`, antes del corte de B, día 20): `fechaCorteMasReciente(12-jul, día 20) = 20-jun` (retrocede, el corte de julio no llegó). `consumosPeriodoEnCurso` (post 20-jun, ≤ 12-jul) = **$80.00**. `saldoUltimoCorte = 80 − 80 = $0.00` — todavía no se factura. `proximaFechaDePago`: **null** (`TC Día de Pago` no configurado en B, caso de prueba deliberado) — sin alerta posible para B, mostrado en la UI como "Sin fecha de pago configurada".

**Estado el 2026-07-18** (`hoy = 18-jul`, 2 días antes del pago de A): A tiene `diasHastaPago = 2 ≤ N(3)` y `saldoUltimoCorte = $150.00 > 0` → **alerta activa**: *"Pagar Tarjeta C. Pichincha: $150.00 antes del 20 jul."* B no genera alerta (sin `TC Día de Pago`).

**Evento 3 — 2026-07-19, pago del estado de cuenta de A desde SGCAPITAL** (modal "Transferencia entre cuentas", 20.3, sin cambios de código): `Movimiento Interno · SGCAPITAL → A · $150.00`. Verificación de bloqueo de saldo origen: `SGCAPITAL` tiene `$500.00 ≥ $150.00` → pasa. → SGCAPITAL: `$500 − $150 = $350.00`. Saldo A: `-150 + 150 = $0.00`.

**Estado el 2026-07-19, después del pago**: A → `deudaActual = $0.00`, `consumosPeriodoEnCurso = $0.00`, `saldoUltimoCorte = $0.00`. **La alerta desaparece** (ya no cumple `saldoUltimoCorte > 0`).

**Verificación de conservación de dólares** (a diferencia de una transferencia entre cuentas de activo, pagar una tarjeta es dinero que sale de verdad del negocio — el patrimonio neto baja exactamente el monto pagado, no se mueve entre cuentas):
```
Antes del pago:   SGCAPITAL($500.00) + saldo(A)(-$150.00) = patrimonio neto $350.00
Después del pago: SGCAPITAL($350.00) + saldo(A)($0.00)    = patrimonio neto $350.00   ✓ idéntico
```
Ningún dólar se creó ni se perdió: los $150.00 que salieron de `SGCAPITAL` son exactamente los $150.00 de deuda que dejaron de existir — pagar una tarjeta con dinero real no cambia el patrimonio neto del negocio, solo cambia su forma (de "efectivo disponible" a "menos deuda"), que es el comportamiento contable correcto y exactamente lo que la prueba de fuego pedía verificar.

---

## Resumen para aprobar

Cada tarjeta de crédito es un registro más de `Cuentas Financieras` (`Tipo de Cuenta: Tarjeta de Crédito`, opción manual del dueño por la limitación de API ya conocida), con 3 campos nuevos vía API (`TC Día de Corte`, `TC Día de Pago`, `TC Cupo`) claramente desambiguados del `Fecha de Corte` existente. El saldo vive en negativo con el mismo mecanismo de siempre (`calcularSaldoCuenta`, sin cambios), presentado siempre como deuda positiva en la UI — nunca un negativo crudo, ni en la deuda ni en el saldo del corte. Un módulo nuevo y puro (`lib/finanzas/tarjetas.ts`, UTC explícito) calcula deuda actual, saldo del último corte (correcto ante pagos parciales, sin término extra) y próxima fecha de pago, con toda la aritmética de calendario (día 31, febrero, cambio de año) resuelta con un simple "clamp" al último día real del mes, y con la lista de tarjetas tolerante a una tarjeta individual todavía sin go-live. `Alerta Descuadre` gana una política nueva: deuda normal de tarjeta nunca alerta; superar `TC Cupo` (si está definido) sí, sin bloquear nunca el consumo. El movimiento manual y la transferencia entre cuentas (pago de tarjeta, con categoría propia) **ya funcionan sin ningún cambio de código adicional**, solo con la matriz de datos correcta. El puente de Shipping se resuelve con el hallazgo clave de que el select de tarjetas **ya existía** en Airtable — el arreglo es dejar de compararlo contra un select muerto desde 20.1, en 3 puntos de código, con resolución tolerante a espacios/mayúsculas, sin tocar el esquema de Shipping V2 en absoluto. La visibilidad vive en una sección nueva de `/finanzas` claramente distinguida de "Tarjetas en tránsito", con una alerta de pago próximo visual (en `/finanzas` y el reporte diario) — la integración con `Notificaciones` se evalúa y se descarta para v1 con el argumento de costo/beneficio explícito (no hay infraestructura de cron en el proyecto).

**Aprobado con 4 correcciones — proceder directo a la Etapa B, sin pausa intermedia.**

---

## Registro de correcciones

Revisión del dueño sobre la v1 de este documento: **aprobado en su estructura general** (tarjeta como cuenta de deuda en `Cuentas Financieras`, convención de signo, cálculo puro de estado de cuenta, política de `Alerta Descuadre` por cupo, el hallazgo y arreglo mínimo del puente Shipping, la reutilización sin cambios de movimiento manual y transferencia entre cuentas — todo eso se mantuvo sin cambios). 4 correcciones vinculantes, ya integradas arriba en las secciones que corrigen:

1. **`resolveCuentaFinancieraLegacy` no debía exigir igualdad exacta de texto** (§4.3) — un espacio invisible o una diferencia de mayúsculas entre el select legacy de Shipping y el `Nombre` de la Cuenta Financiera habría roto la resolución silenciosamente (el pago se crearía sin `Cuenta Origen`, sin que nadie note por qué). Corregido: el *fallback* compara nombres normalizados (`trim` + minúsculas + espacios colapsados) contra las cuentas **activas**, vía `fetchCuentaPorNombreNormalizado` (`lib/finanzas/cuentas.ts`, nuevo). La mini-guía (§7) ya no exige copiar espacios invisibles al nombrar una tarjeta. Test dedicado con el caso real detectado (§9 #13).
2. **Una tarjeta sin `Fecha de Corte` (go-live) habría roto toda la sección de `/finanzas`** si `calcularEstadoTarjeta` se llamaba directo por cada tarjeta y su `PreGoLiveError` no se capturaba. Corregido con `listarEstadosTarjetas()` (§6.1, nuevo en `lib/finanzas/tarjetas.ts`), que captura `PreGoLiveError` **por tarjeta** y la marca `disponible: false` (mostrada como "Pendiente de activar") sin afectar a las demás — cualquier otro error sí se propaga, para no esconder bugs reales. Tests dedicados (§9 #16-17).
3. **Tres precisiones documentales, sin las cuales el módulo sería frágil o confuso en producción** (§3.2/§3.5/§3.6/§8): (a) todos los cálculos de fecha usan UTC explícito (`Date.UTC`/`getUTC*`), nunca la zona horaria local del proceso — evita que el mismo `hoy` produzca fechas de corte distintas según dónde corra el código; (b) el primer ciclo tras el alta de una tarjeta puede sobrestimar `saldoUltimoCorte` si el go-live no coincide con el corte real — documentado como límite conocido (no un bug), con la mitigación recomendada (dar de alta justo después del corte real, con `Saldo Inicial` = saldo ya facturado) integrada en la mini-guía y las notas de go-live; (c) `saldoUltimoCorte` (y `deudaActual`) nunca se presentan negativos crudos — `presentarPendienteDelCorte` (§3.6, nuevo) los convierte a `pendiente`/`saldoAFavor`, ambos `≥ 0`. Test dedicado (§9 #18).
4. **Categoría `Pago Tarjeta de Crédito` — aprobada**, dejó de ser opcional (§5): se implementa el condicional en `procesarDeposito` y se agrega al checklist manual del dueño (§7, paso 3) sin condición. Test dedicado (§9 #19).

**Aprobado — proceder directo a la Etapa B (código), sin esperar otra revisión.**
