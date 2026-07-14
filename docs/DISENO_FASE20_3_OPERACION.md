# Diseño — Fase 20.3: Operación diaria (detalle, depósitos, acreditaciones, movimientos manuales)

> Rama: `fase-20-3-operacion-diaria`. Etapa A — **sin código de implementación**. Construido sobre `docs/DISENO_FASE20_1_FUNDACION.md`, `docs/FASE20_1_RESULTADO.md`, `docs/DISENO_FASE20_2_INGRESOS.md`, `docs/FASE20_2_RESULTADO.md`, y una inspección fresca (2026-07-12/15) del código real (`lib/finanzas/*`, `lib/apps.ts`) y del esquema real de `Movimientos Financieros` en Airtable (vía Metadata API, solo lectura).
>
> **Objetivo:** que el usuario pueda OPERAR el dinero desde `/finanzas`, no solo verlo. Cuatro capacidades: (1) detalle de movimiento con trazabilidad y anulación, (2) depósito de caja, (3) acreditación de pagos en tránsito, (4) movimiento manual admin.
>
> **Aprobado con 4 correcciones** (integradas abajo, no como apéndice — ver "Registro de correcciones" al final para el detalle de qué cambió y por qué): (1) política de cadena en anulación — §2.3; (2) completitud de `procesarAcreditacion` por tipo de hijo, no por cantidad, y comisión $0 no crea Ajuste-hijo — §3.4; (3) chequeo `PRE_GO_LIVE` explícito antes del Paso A de acreditación, sin mutar nada — §3.6; (4) caso pendiente pre-corte acreditado post-corte, con instrucción operativa de conteo — §3.7 (nueva). Permisos aprobados sin cambios (§5). Etapa B ya construida en la misma rama — ver `docs/FASE20_3_RESULTADO.md`.

---

## 0. Paso 0 — Estado de `main` antes de diseñar

Desde el deploy de la Fase 20.2, `main` recibió trabajo ajeno a finanzas (`feat(horarios): mejorar expediente y control admin`, commit `3d82331`). Verificado hoy, sobre `main` actual, antes de crear la rama de esta fase:

```
npm run typecheck   → limpio, 0 errores
21 tests de lib/finanzas/__tests__/*.test.ts (excluido el test en vivo #9)   → 21/21 en verde
```

Los 10 tests de la Fase 20.1 y los 12 de la Fase 20.2 pasan exactamente igual que en su reporte original — el módulo `lib/finanzas/` y los dos puentes no fueron tocados por el trabajo de Horarios. **Confirmado: se puede diseñar sobre esta base sin arrastrar ninguna regresión.**

---

## 1. Inventario real verificado hoy (antes de diseñar)

### 1.1 Esquema real de `Movimientos Financieros` (Metadata API, solo lectura, 2026-07-15)

Confirmado — **todos los campos que esta fase necesita ya existen**, ninguno requiere crearse:

| Campo | Tipo | Estado |
|---|---|---|
| `Monto Bruto` / `Monto Neto` / `Comisión` | currency | Existen desde el checklist de 20.1 (§1.3), sin ningún escritor real todavía — esta fase es la primera que los llena |
| `Estado del Movimiento` | singleSelect | Ya incluye `Acreditado`, la opción reservada exactamente para esta fase |
| `Categoría` | singleSelect | Ya incluye `Acreditación Pasarela` y `Depósito de Caja`, ambas sin ningún escritor real todavía |
| `Reversa a` (self-link) / inverso `Compensado Por` | multipleRecordLinks | Existen desde 20.1. Cita literal de `docs/DISENO_FASE20_1_FUNDACION.md` §1.3: *"Lo usará un movimiento de Devolución (...) u otro compensatorio futuro (p. ej. **un ajuste de acreditación en 20.4**) para apuntar al movimiento que compensa"* — es decir, este campo fue diseñado a propósito para el caso de uso central de esta fase (ver §3.3) |
| `Origen` | singleSelect | Ya incluye `Manual` y `Sistema` |
| `Tipo de movimiento` | singleSelect | Ya incluye `Movimiento Interno` y `Ajuste` |

**Conclusión: cero cambios de esquema en Airtable para esta fase** (§6 abajo, formalizado).

### 1.2 Código real relevante

- `lib/finanzas/movimientos.ts`: `crearMovimiento`, `anularMovimiento`, `actualizarMovimiento` (alcance angosto: solo `facturaElectronicaId`/`estadoDistribucion`, nunca toca `Estado del Movimiento` ni montos), `fetchMovimientoById`, `listarMovimientos`.
- `lib/finanzas/saldos.ts`: `calcularSaldoCuenta`, `calcularSaldoRubroCuenta`, `calcularPorAcreditarCuenta`, `calcularSaldoSinClasificarCuenta`, `calcularAnticiposSinFacturar`. La función privada `fetchMovimientosDeCuentaPorEstado(cuentaId, fechaCorte, estados)` ya generaliza la lectura segura (vía campos inversos de la Cuenta, nunca filtrando Movimientos por link) — esta fase la reutiliza en modo exportado para poblar el selector de "pendientes por acreditar" (§3.2).
- `lib/finanzas/validaciones.ts`: `validarCuentasPorTipo`, `validarTransferenciaPermitida`, `validarCuentaActiva`, `evaluarSaldoParaEgresoOMovimientoInterno` (Movimiento Interno rechaza sin saldo; Egreso/Ajuste con saldo insuficiente se crea igual con `Alerta Descuadre`), `validarSumaRubros`.
- `app/api/finanzas/saldos/route.ts`: **ya devuelve** `{ cuentaId, nombre, tipo, activa, saldo, rubros, porAcreditar }` por cuenta — se reutiliza tal cual para poblar los selectores de cuenta en las 3 capacidades operativas nuevas, sin crear un endpoint adicional.
- `app/api/finanzas/reparar-abono/[id]/route.ts` — el único endpoint admin-only que existe hoy; fija el patrón exacto a repetir: `requireFinanzasSession()` + `isAdministratorRole(session?.user.rol)` inline, sin un guard nuevo.
- `lib/apps.ts`: **no hay sub-roles dentro de "Finanzas"** — `canAccessApp(session, "Finanzas")` es true para `admin`/`manager`/`finance` (o cualquier rol con `"Finanzas"` en `appsPermitidas`); `isAdministratorRole(rol)` es la única distinción más fina que existe hoy en todo el portal (`admin`/`administrador`). No se inventa un tercer nivel — se usa exactamente esta distinción binaria (§5).
- Convención de detalle: `app/[módulo]/[id]/page.tsx` ya es un patrón establecido (`app/operaciones/[id]/page.tsx`, `app/tecnicos/ordenes/[id]/page.tsx`, `app/shipping-v2/items/[id]/page.tsx`, etc.) — `app/finanzas/[id]/page.tsx` sigue el mismo molde.
- Convención de "acción con motivo obligatorio": `components/horarios/AnularPagoHorarioButton.tsx` (client component, `useState` para el motivo, modal/textarea, POST, deshabilitado hasta que el motivo no esté vacío) — se replica para "Anular desde el detalle" (§2).
- Campos primarios verificados hoy (Metadata API) para construir referencias legibles en la trazabilidad del detalle: `Shipping Pagos` → `Pago ID`; `Facturas Electrónicas` → primario `Clave de Acceso`, pero ya existe el campo no-primario `Número de Factura` que 20.2 prefiere mostrar (mismo criterio: `Número de Factura || Clave de Acceso`); `Abonos` → `Abono`; `Clientes` → `Nombre`; `Órdenes de Reparación` → `ID`; `Operación Comercial` → `Código Operación`.

---

## 2. Capacidad 1 — Detalle de un movimiento

### 2.1 Lectura

- `lib/finanzas/movimientos.ts` — nueva función `fetchMovimientoConTrazabilidad(id)`, que llama a `fetchMovimientoById(id)` y luego resuelve, en paralelo y **solo por `RECORD_ID()` a partir de los ids que el propio movimiento ya trae** (patrón seguro, nunca se filtra ninguna tabla por campo de link):
  - `abonoIds[0]` → `fetchRecordById("Abonos", id)` → de ahí, si el abono tiene `Aplicado a: Orden`/`Aplicado a: Operación`, un segundo salto a `Órdenes de Reparación`/`Operación Comercial` (mismo patrón ya usado en `lib/finanzas/puentes/abonos.ts`, función `resolverClienteYReferencia` — se extrae a un helper compartido para no duplicar código entre el puente y el detalle).
  - `facturaElectronicaIds[0]` → `fetchRecordById("Facturas Electrónicas", id)` → `Número de Factura || Clave de Acceso`.
  - `pagoShippingIds[0]` → `fetchRecordById("Shipping Pagos", id)` → `Pago ID`.
  - `clienteIds[0]` → `fetchRecordById("Clientes", id)` → `Nombre`.
  - `cuentaOrigenId`/`cuentaDestinoId` → `fetchCuentaById` (ya existe).
  - `reversaAId` → el movimiento que este compensa (si aplica, caso Devolución — no usado en 20.3).
  - `compensadoPorIds` (nuevo, ver §3.3) → los movimientos que compensan a este (caso acreditación).
- `GET /api/finanzas/movimientos/[id]` — `requireFinanzasSession()` (cualquier rol con acceso a Finanzas, ver §5), devuelve `{ success: true, data: { movimiento, trazabilidad } }` donde `trazabilidad` es un objeto plano con las referencias legibles y los ids para armar los enlaces (`{ ordenId, ordenCodigo, operacionId, operacionCodigo, clienteId, clienteNombre, facturaId, facturaNumero, pagoShippingId, pagoShippingCodigo, cuentaOrigenNombre, cuentaDestinoNombre, movimientosCompensadores: [{id, tipo, categoria, monto}] }`, cada campo `null` si no aplica).

### 2.2 Pantalla — `app/finanzas/[id]/page.tsx`

Server Component (mismo patrón que `app/finanzas/page.tsx`): llama directo a `fetchMovimientoConTrazabilidad` (no pasa por su propia API — igual que el resto de páginas del portal). Muestra:
- Todos los campos del movimiento: `movimientoId`, tipo, categoría, origen, monto (+ bruto/neto/comisión si alguno no es `null`), cuentas origen/destino (nombre, enlazable — no hay página de detalle de cuenta todavía, se muestra sin enlace), estado del movimiento, estado distribución, método, fecha, transacción ID, observación, alerta descuadre, registrado por, fecha de creación.
- Si `estado === "Anulado"`: fecha y motivo de anulación, visualmente distinguido (mismo tono `orange` que ya usa `/finanzas` para `Anulado`).
- Sección "Trazabilidad" con enlaces navegables a lo que aplique: Abono → si tiene Orden, enlaza a `/tecnicos/ordenes/[id]`; si tiene Operación, a `/operaciones/[id]`; Factura Electrónica → a `/facturacion` (no hay detalle de factura individual hoy — se muestra el número, sin enlace roto); Pago Shipping → a `/shipping-v2/pagos` (mismo criterio); Cliente → a `/tecnicos/clientes/[id]` si existe esa ruta para el cliente, si no, solo el nombre.
- Si `compensadoPorIds` no está vacío (un movimiento `Acreditado` con sus dos hijos, §3.3): lista los movimientos compensadores con enlace a su propio detalle (`/finanzas/[id]`) — permite auditar la cadena completa desde cualquiera de los 3 registros.
- Botón **"Anular"**, visible solo si `isAdministratorRole` (verificado en el propio Server Component vía la sesión) y `estado !== "Anulado"`: un client component (`AnularMovimientoButton.tsx`, mismo molde que `AnularPagoHorarioButton.tsx`) con textarea de motivo obligatorio, deshabilitado hasta que no esté vacío, `POST /api/finanzas/movimientos/[id]/anular`.

### 2.3 Anulación desde el detalle

`POST /api/finanzas/movimientos/[id]/anular` — admin-only (mismo patrón inline que `reparar-abono`), body `{ motivo: string }` (`motivo` obligatorio, rechaza si viene vacío tras `trim()` — más estricto que `anularMovimiento` en sí, que hoy acepta motivo vacío y cae a `"Sin motivo especificado."`; aquí se exige explícitamente porque es una acción manual desde la UI, no un puente automático). Llama a `anularMovimiento(id, motivo)`.

### 2.4 Corrección 1 — política de cadena en anulación

La acreditación (§3) crea cadenas de movimientos enlazados por `Reversa a`/`Compensado Por`: un original `Acreditado` con 1-2 hijos (Interno/Ajuste) que lo compensan. Anular cualquiera de los eslabones sin avisar rompe la identidad de conservación de dólares de §3.3/§3.7. Esta fase amplía `anularMovimiento` (`lib/finanzas/movimientos.ts` — sigue siendo la única puerta de escritura para anular, ahora con dos reglas más, ambas basadas únicamente en los links `Reversa a`/`Compensado Por` que el propio movimiento ya trae):

1. **Anular un movimiento con compensadores activos → se bloquea.** Si `actual.compensadoPorIds` tiene algún id cuyo movimiento **no** está `Anulado` ("activo"), `anularMovimiento` **rechaza** antes de tocar Airtable, con un mensaje que lista cada compensador activo por `movimientoId`/tipo/monto: `No se puede anular "MOV-...": tiene 2 movimiento(s) compensador(es) activo(s) — anúlalos primero: MOV-...-A (Movimiento Interno, $28.80), MOV-...-B (Ajuste, $1.20).` Esto aplica a **cualquier** movimiento con hijos, no solo al caso de acreditación (el mecanismo es genérico sobre `Reversa a`, igual que 20.1 lo dejó previsto para Devolución).
2. **Anular un movimiento que a su vez compensa a otro (`reversaAId` poblado) → nunca se bloquea, pero advierte.** Si el original al que compensa (`fetchMovimientoById(actual.reversaAId)`) sigue activo (no `Anulado`), `anularMovimiento` procede igual (nunca decide por su cuenta si eso está bien o mal — mismo principio que la Corrección 1 de la Fase 20.2 con abonos ya facturados) y devuelve una advertencia explícita, más un `console.warn` para auditoría.

Estas dos reglas cambian la firma de retorno de `anularMovimiento`, que pasa de `Promise<Movimiento>` a **`Promise<{ movimiento: Movimiento; warning: string | null }>`** (todos los llamadores existentes se actualizan: `anularMovimientoDeAbono` en `lib/finanzas/puentes/abonos.ts` combina esta advertencia de cadena con la suya propia de "abono ya facturado" — en la práctica nunca coexisten, porque un movimiento de origen Abonos nunca tiene `reversaAId`, pero la combinación se programa de forma genérica por prolijidad). `warning: null` en el caso normal (sin cadena involucrada) — no cambia el comportamiento de ningún test existente de 20.1/20.2 más allá de acceder al campo `.movimiento` en vez del valor directo.

`POST /api/finanzas/movimientos/[id]/anular` responde `{ success: true, data: { movimiento, warning } }`.

`/finanzas` (la pantalla principal) gana una columna más en la tabla de movimientos: la fila entera es un link a `/finanzas/[id]` (mismo patrón visual que otras tablas del portal — fila con `cursor-pointer` y hover, sin cambiar el resto del layout).

---

## 3. Capacidad 3 primero (es el corazón del diseño) — Acreditación de pagos en tránsito

Se documenta antes que la Capacidad 2 (depósito) porque su decisión de representación es la más delicada de la fase — todo lo demás depende de entenderla bien primero.

### 3.1 El problema exacto

Una venta con tarjeta crea, hoy (Fase 20.2), un movimiento `Ingreso · Cuenta Destino: Tarjetas en Tránsito · Estado del Movimiento: Pendiente · Monto: $30` (el bruto). `Pendiente` no cuenta para ningún saldo (`ESTADOS_QUE_CUENTAN_PARA_SALDO = ["Confirmado", "Acreditado"]`) — solo aparece en el indicador "por acreditar" (§4.3 de 20.2). Días después, la pasarela deposita el **neto** ($28.80) en el banco (`SGINGRESOS`); la diferencia ($1.20) es una comisión que la pasarela retuvo — **nunca existió como efectivo en ninguna cuenta nuestra**, ni por un instante.

El reto: representar esto sin (a) mutar el monto/cuenta del movimiento original (violaría la inmutabilidad de un hecho económico ya registrado — regla ya usada en toda la Fase 20.1/20.2), (b) dejar que `Tarjetas en Tránsito` termine con un residuo permanente en su saldo calculado (ni el bruto completo, que nunca fue todo cash real; ni ningún otro número que no sea $0 una vez resuelta la acreditación), y (c) sin inventar ni perder un dólar en ningún punto intermedio.

### 3.2 Alternativas evaluadas

**(a) El movimiento original pasa a `Acreditado` (estado ya reservado para esto) + se crean automáticamente dos movimientos compensatorios: un Movimiento Interno por el neto (Tránsito→SGINGRESOS) y un Ajuste por la comisión (sale de Tránsito, se reconoce como reducción de `Rubro Utilidad`).** Detalle completo en §3.3. Nunca toca `Monto`/`Cuenta Destino` del original — solo su `Estado del Movimiento` y los 3 campos que existen exactamente para esto (`Monto Bruto`/`Monto Neto`/`Comisión`).

**(b) Actualizar la `Cuenta Destino` del movimiento original de "Tarjetas en Tránsito" a "SGINGRESOS", y el `Monto` de bruto a neto.** Descartada explícitamente: viola la inmutabilidad de hechos económicos que gobierna todo el sistema desde 20.1 (§8: `crearMovimiento`/`actualizarMovimiento`/`anularMovimiento` son las únicas puertas de escritura, y `actualizarMovimiento` **nunca** toca `Monto`/cuentas — por diseño, no por omisión). Además pierde información real: el hecho de que la venta fue por $30 y la pasarela cobró $1.20 de comisión son dos hechos distintos, y compactarlos en una edición del original destruiría la evidencia de que hubo una comisión en absoluto — no quedaría ningún registro de cuánto se cobró ni cuándo.

**(c) — descartada antes de escribirse, mencionada por completitud:** dejar el original en `Pendiente` para siempre y solo crear un Movimiento Interno con el neto directamente. Se descarta porque el indicador "por acreditar" (§4.3 de 20.2) seguiría contando ese `$30` como pendiente indefinidamente después de haberse acreditado — el dueño vería un pendiente fantasma que nunca se resuelve, y no hay ninguna trazabilidad de que la comisión fue reconocida.

**Decisión: (a).** Es la única que preserva inmutabilidad, dice la verdad completa (bruto, neto y comisión quedan todos como hechos separados y auditables), resuelve el indicador "por acreditar" por el mismo mecanismo ya construido (transición de estado, sin tocar su código — igual que hizo 20.2 con "Anticipos sin facturar"), y usa exactamente los 3 campos y el estado que 20.1 dejó preparados para este momento.

### 3.3 Mecánica exacta — orden de operaciones y por qué

**Tres registros al final de una acreditación exitosa, todos enlazados entre sí:**

```
Original (ya existía, Pendiente→Acreditado):
  Ingreso · Cuenta Destino: Tarjetas en Tránsito · Monto: $30.00 (bruto, sin cambios)
  Estado del Movimiento: Acreditado          ← cambió
  Monto Bruto: $30.00 · Monto Neto: $28.80 · Comisión: $1.20   ← se llenan ahora
  Compensado Por: [Interno-hijo, Ajuste-hijo]  ← inverso automático de "Reversa a"

Interno-hijo (nuevo):
  Movimiento Interno · Cuenta Origen: Tarjetas en Tránsito · Cuenta Destino: SGINGRESOS
  Monto: $28.80 · Estado del Movimiento: Confirmado · Categoría: Acreditación Pasarela
  Estado Distribución: No aplica (reubicación de efectivo, no clasificación — mismo criterio que Depósito de Caja)
  Origen: Sistema · Reversa a: [Original]

Ajuste-hijo (nuevo):
  Ajuste · Cuenta Origen: Tarjetas en Tránsito (sin Cuenta Destino)
  Monto: $1.20 · Estado del Movimiento: Confirmado · Categoría: Acreditación Pasarela
  Rubro Utilidad: $1.20 (los otros 3 rubros en $0) · Estado Distribución: Distribuido
  Origen: Sistema · Reversa a: [Original]
```

**Por qué el Ajuste-hijo clasifica su rubro de inmediato (única excepción de esta fase a "la clasificación de rubros es de una fase futura"):** la regla de negocio ya está cerrada y es una asignación 100% determinística — *"la comisión afectará SOLO al rubro Utilidad"* — no requiere ninguna UI de clasificación general (esa sí queda para la fase de rubros). Clasificarlo aquí, en el único punto donde se genera este dato, es más simple que dejarlo `Pendiente de clasificar` y depender de que una fase futura reconstruya exactamente el mismo cálculo.

**Por qué el original transiciona ANTES de crear los dos hijos (y no al revés):** el saldo de una cuenta se calcula en tiempo real a partir de sus movimientos `Confirmado`/`Acreditado` existentes en el momento de cada `crearMovimiento` nuevo (`evaluarSaldoParaEgresoOMovimientoInterno`, para decidir `Alerta Descuadre`). Si los dos hijos (que restan de Tránsito) se crearan **antes** de que el original sume su bruto, el saldo de Tránsito en ese instante todavía no incluiría esos $30 — la resta de $28.80 y luego $1.20 dispararía `Alerta Descuadre` de forma espuria (un falso positivo: parece saldo insuficiente, pero en realidad el dinero "está por llegar" en el mismo request). Transicionando el original primero, Tránsito ya tiene sus +$30 reales antes de que los hijos empiecen a restar — ninguna alerta espuria, y el orden interno (Interno-hijo antes o después del Ajuste-hijo, entre sí, no importa — ambos restan de la misma cuenta ya acreditada).

**Verificación de conservación en cada paso (con Tránsito partiendo en $0 antes de esta venta):**
```
Antes:        Tránsito saldo = $0.00 · Tránsito "por acreditar" = $30.00 (Pendiente)
Tras Paso A:   Tránsito saldo = $0.00 + $30.00 = $30.00 (Acreditado ya cuenta) · "por acreditar" = $0.00 (ya no es Pendiente)
Tras Interno:  Tránsito saldo = $30.00 − $28.80 = $1.20 · SGINGRESOS += $28.80
Tras Ajuste:   Tránsito saldo = $1.20 − $1.20 = $0.00
```
Al final: `Tránsito saldo = $0.00` (correcto — no queda ni un centavo de esta venta ahí), `SGINGRESOS += $28.80` (exactamente lo que el banco recibió de verdad), `Rubro Utilidad -= $1.20` en el mismo momento en que se reconoce el gasto — nunca aparece como efectivo en ninguna cuenta, ni transitoriamente fuera de la ventana de un mismo request.

### 3.4 Funciones nuevas — alcance angosto, dos responsabilidades separadas

**`acreditarMovimientoPendiente(id, { montoNeto, fecha }): Promise<Movimiento>`** (`lib/finanzas/movimientos.ts`, junto a `actualizarMovimiento` — deliberadamente **no** se amplía `actualizarMovimiento` para esto: son transiciones y campos distintos — `estadoDistribucion`/`facturaElectronicaId` vs. `Estado del Movimiento`/montos — mezclar ambas violaría el criterio de "alcance angosto, transiciones explícitas" que ya rige el archivo). Responsabilidad única: el "Paso A" de §3.3, nada más — **no crea los dos movimientos hijos**.
- Valida: el movimiento existe; `tipo === "Ingreso"`; `estado === "Pendiente"` (si ya es `Acreditado`, ver el flujo de reintento en §3.5 — no se rechaza aquí, se maneja en la capa orquestadora); `estado` no es `Anulado`/`Confirmado` (rechaza con error explícito); `cuentaDestinoId` resuelve a una cuenta con `tipo === "Tránsito"` (rechaza si no — esta función es exclusivamente para el caso de tarjetas/PayPhone en tránsito, no un mecanismo genérico de "cambiar estado a mano").
- Valida `0 < montoNeto <= monto` (el `monto` del propio movimiento es el bruto, inmutable desde su creación).
- `PATCH`: `Estado del Movimiento → "Acreditado"`, `Monto Bruto → monto` (backfill — hoy nunca se llenó al crear, ver §1.2), `Monto Neto → montoNeto`, `Comisión → round2(monto - montoNeto)`.

**`procesarAcreditacion(movimientoId, { montoNeto, fecha, registradoPor }): Promise<{ movimiento: Movimiento; interno: Movimiento; ajuste: Movimiento | null }>`** (nuevo archivo `lib/finanzas/acreditacion.ts`) — la función orquestadora que junta los pasos de §3.3, y es la única que la API llama. Flujo unificado (Corrección 2 — colapsa lo que la v1 de este diseño trataba como 3 ramas separadas en un solo camino, evitando el bug que eso escondía, ver más abajo):

1. **Chequeo `PRE_GO_LIVE` (Corrección 3), primero que cualquier otra cosa — nada se muta si falla:** resuelve la `Cuenta Destino` del movimiento (Tránsito) y `SGINGRESOS` (destino del Interno-hijo); si cualquiera de las dos no tiene `Fecha de Corte`, lanza `PreGoLiveError` (nuevo, `lib/finanzas/pre-go-live.ts`, `code: "PRE_GO_LIVE"`) **antes de tocar `fetchMovimientoById` o cualquier `crearMovimiento`/PATCH** — ni el original ni ningún hijo se crean o modifican. El endpoint (§3.6) atrapa este error específico y responde `409`; cualquier otro error sigue respondiendo `500` sin disfrazarlo (§3.5 sin cambios).
2. `fetchMovimientoById(movimientoId)`.
3. Según `estado`:
   - `"Pendiente"` → `acreditarMovimientoPendiente(...)` (Paso A) — usa su resultado como `movimiento` actualizado.
   - `"Acreditado"` → **recuperación de un intento anterior** (§3.5): si el `montoNeto` recibido difiere del ya persistido (`movimiento.montoNeto`), rechaza con error explícito (protección contra reintentar con un número distinto sin darse cuenta); si coincide (o no se puede comparar porque el caller no lo re-envía), continúa con el `movimiento` tal cual está — **sin volver a hacer el `PATCH` del Paso A**.
   - Cualquier otro estado (`Confirmado`, `Anulado`) → rechaza con error explícito.
4. **Completitud por tipo de hijo, no por cantidad (Corrección 2 — el bug real que esto corrige):** la v1 de este diseño decidía "ya está completo" mirando `compensadoPorIds.length > 0` — incorrecto en dos casos reales: (a) si solo uno de los dos hijos se alcanzó a crear en un intento previo que falló a la mitad, `.length === 1 > 0` habría hecho creer que ya estaba completo y nunca habría creado el que falta; (b) cuando la comisión es exactamente `$0` (neto == bruto, pasarela sin costo), **nunca debe crearse el Ajuste-hijo** — `crearMovimiento` rechaza cualquier monto que no sea `> 0` (`"El monto debe ser mayor a 0."`), así que intentar crear un Ajuste de `$0` lanzaría un error real, no una simple redundancia. La verificación correcta:
   ```ts
   const hijos = await Promise.all(movimiento.compensadoPorIds.map(fetchMovimientoById));
   const tieneInterno = hijos.some(h => h?.tipo === "Movimiento Interno");
   const tieneAjuste = hijos.some(h => h?.tipo === "Ajuste");
   const necesitaAjuste = round2(movimiento.comision ?? 0) > 0;

   const interno = tieneInterno
     ? hijos.find(h => h?.tipo === "Movimiento Interno")!
     : await crearMovimiento({ tipo: "Movimiento Interno", origen: "Sistema", categoria: "Acreditación Pasarela",
         monto: movimiento.montoNeto!, cuentaOrigenId: movimiento.cuentaDestinoId!, cuentaDestinoId: sgIngresos.id,
         estado: "Confirmado", estadoDistribucion: "No aplica", fecha, registradoPor, reversaAId: movimiento.id });

   const ajuste = !necesitaAjuste
     ? null   // comisión $0 — no hay nada que ajustar, la completitud lo contempla explícitamente
     : tieneAjuste
       ? hijos.find(h => h?.tipo === "Ajuste")!
       : await crearMovimiento({ tipo: "Ajuste", origen: "Sistema", categoria: "Acreditación Pasarela",
           monto: movimiento.comision!, cuentaOrigenId: movimiento.cuentaDestinoId!, estado: "Confirmado",
           estadoDistribucion: "Distribuido", rubros: { utilidad: movimiento.comision!, capital: 0, iva: 0, repuestoExterno: 0 },
           fecha, registradoPor, reversaAId: movimiento.id });
   ```
   `crearMovimiento`/`CrearMovimientoInput` no tiene hoy un parámetro `reversaAId`; se agrega (campo simple más en el `compactFields` de `crearMovimiento`, sin ningún cambio de esquema porque `Reversa a` ya existe — ver §1.2/§6).
5. Devuelve `{ movimiento, interno, ajuste }` — `ajuste` es `null` exactamente cuando `comision === 0`; la API y la UI deben tratarlo como un caso válido ("acreditado sin comisión"), no como un dato faltante.

### 3.5 Por qué esta función SÍ puede lanzar (a diferencia de los Puentes 1/2 de 20.2)

Contraste explícito y deliberado con la filosofía de los puentes: `crearMovimientoParaAbono`/`procesarPuenteFacturacion` **nunca lanzan** porque son efectos secundarios best-effort de una acción primaria que **ya ocurrió en otro lugar** (el abono ya se guardó, la factura ya fue autorizada por el SRI) — no hay forma de "cancelar" lo que ya pasó, así que fallar en silencio con un log es la única opción sensata. **Acreditar es distinto: es en sí misma la acción principal que el usuario está ejecutando en ese momento** (el botón "Acreditar" de la UI) — no hay ningún hecho previo que deba protegerse de un rollback, y el usuario está presente para ver el error y decidir qué hacer. Por eso `procesarAcreditacion` propaga cualquier error de Airtable directamente a la respuesta HTTP (`500` con el mensaje), en vez de tragárselo.

Es seguro exigir que el usuario simplemente **reintente la misma acción** tras un error a medias (p. ej. el Paso A tuvo éxito pero la creación del Interno-hijo falló por un timeout de red): gracias a la lógica de recuperación del paso 2 de §3.4, un segundo click en "Acreditar" con el mismo `montoNeto` completa exactamente lo que faltó, sin duplicar nada y sin pedirle al usuario que entienda en qué paso quedó a medias.

### 3.6 Pantalla y endpoint

- `GET /api/finanzas/movimientos/pendientes-acreditar` — lista los movimientos `Ingreso · Pendiente` cuya `Cuenta Destino` es de `Tipo de Cuenta = "Tránsito"` (recorre las cuentas con ese tipo vía `fetchCuentasFinancieras()`, y por cada una reutiliza `fetchMovimientosDeCuentaPorEstado(cuentaId, cuenta.fechaCorte, ["Pendiente"])` — se exporta esa función privada de `saldos.ts`, sin cambiar su comportamiento, para no duplicar el patrón seguro de lectura). `requireFinanzasSession()`, cualquier rol con acceso a Finanzas.
- `POST /api/finanzas/movimientos/[id]/acreditar` — body `{ montoNeto: number, fecha: string }`. `requireFinanzasSession()` (operativo + admin, ver §5). Llama a `procesarAcreditacion(id, { montoNeto, fecha, registradoPor })` dentro de un `try/catch` que distingue `PreGoLiveError` (§3.4 paso 1) de cualquier otro error: `PreGoLiveError` → `409` con `{ success: false, error: MENSAJE_PRE_GO_LIVE, code: "PRE_GO_LIVE" }`; cualquier otro → `500` con el mensaje real (§3.5 — no se disfraza el error real de negocio). Éxito → `{ success: true, data: { movimiento, interno, ajuste } }` (`ajuste` puede ser `null`, ver §3.4 paso 4).
- UI: sección nueva en `/finanzas` (o un panel accesible desde ahí, `app/finanzas/acreditar/page.tsx`) — tabla de pendientes (monto bruto, fecha de venta, referencia a la Factura Electrónica si existe) con una fila expandible/formulario por movimiento: input de "Monto neto recibido" (numérico, `max = bruto`) + fecha de acreditación (default hoy) + botón "Acreditar". Muestra la comisión calculada en vivo (`bruto - neto`) antes de confirmar; si da `$0.00`, un texto aclara "sin comisión — no se crea ningún ajuste adicional" (evita que el usuario piense que falta un paso). Si la API responde `code: "PRE_GO_LIVE"`, se muestra con el mismo tono informativo que el banner de §4.2, no como un error rojo.

### 3.7 Corrección 4 — caso pendiente pre-corte, acreditado post-corte

**El problema:** una venta con tarjeta puede quedar `Pendiente` en `Tarjetas en Tránsito` **antes** del día del corte (go-live) y acreditarse recién **después**. La fórmula de saldo (§2.3b de 20.1) excluye por fecha, no por estado: *"todo movimiento con `Fecha del movimiento` anterior a la `Fecha de Corte` de una cuenta no participa en su cálculo de saldo"* — esa exclusión es **permanente**, no depende de si el movimiento después pasa a `Acreditado`. Si el Paso A (§3.3) transiciona ese movimiento pre-corte a `Acreditado`, su `+$30` **nunca** se sumará al saldo de Tránsito (su fecha sigue siendo anterior al corte), pero los dos hijos (Interno-hijo, Ajuste-hijo) sí llevan la fecha de la acreditación — **posterior** al corte — así que sí cuentan. Sin ningún ajuste, eso deja a Tránsito con un saldo fantasma de `−$30.00` (solo restan los hijos, el crédito original nunca llega a sumar) — dinero que nunca existió como negativo, un descuadre puramente artificial del mecanismo de fecha de corte, no un problema real.

**Instrucción operativa de conteo (paso 9 del checklist de la Fase 20.1, ampliada para cuentas `Tipo de Cuenta = "Tránsito"`):** el día del corte, al llenar `Saldo Inicial` de una cuenta de tipo `Tránsito`, **no se cuenta dinero físico** (no hay ninguno — es una cuenta virtual de "por cobrar"). Se cuenta la **suma de `Monto` (bruto) de todos los movimientos todavía `Pendiente` en esa cuenta a esa fecha** (ventas con tarjeta/PayPhone ya hechas pero aún no acreditadas por la pasarela). Ese es su "saldo inicial" real — lo que la pasarela le debe al negocio en ese instante. Con eso precargado, cuando cada uno de esos pendientes se acredite después del corte (aunque su propia fecha original quede excluida para siempre), los hijos que sí restan de Tránsito quedan compensados por ese `Saldo Inicial`, y el saldo nunca se vuelve negativo artificialmente.

**Verificación numérica** (con un solo pendiente de $30 arrastrado desde antes del corte, acreditado después con neto $28.80):
```
Corte: Tránsito Saldo Inicial = $30.00 (= el bruto pendiente contado, no $0.00) · Fecha de Corte = D
Saldo(Tránsito) justo después del corte = $30.00 (el propio pendiente nunca suma, por fecha — pero ya está representado en el Saldo Inicial)

Acreditación post-corte (fecha ≥ D):
  Paso A no cambia el saldo (el original sigue excluido por fecha, para siempre)
  Interno-hijo (fecha ≥ D, sí cuenta): Tránsito −$28.80 → saldo = $30.00 − $28.80 = $1.20
  Ajuste-hijo (fecha ≥ D, sí cuenta): Tránsito −$1.20 → saldo = $1.20 − $1.20 = $0.00
```
`$0.00` final — correcto, sin residuo ni saldo negativo fantasma. Este caso se verifica con un test dedicado de conservación (§9 #15).

---

## 4. Capacidad 2 — Depósito de caja (Movimiento Interno)

Mucho más simple que la acreditación — es exactamente el caso de uso que `Movimiento Interno` ya cubre desde 20.1, sin ninguna pieza nueva de lógica de negocio.

### 4.1 Comportamiento

`POST /api/finanzas/depositos` — body `{ cuentaOrigenId, cuentaDestinoId, monto, fecha, comprobanteUrl?, observacion? }`. `requireFinanzasSession()` (operativo + admin, ver §5). Llama directo a `crearMovimiento({ tipo: "Movimiento Interno", origen: "Manual", categoria: "Depósito de Caja", cuentaOrigenId, cuentaDestinoId, monto, estado: "Confirmado", estadoDistribucion: "No aplica", fecha, comprobanteUrl, observacion, registradoPor })` — **sin ninguna función nueva**: la matriz `Permite Transferir A`/`Permite Recibir De` y el bloqueo duro por saldo insuficiente ya están implementados y probados (tests #2 y #6 de 20.1) y se activan automáticamente porque el tipo es `Movimiento Interno`.

### 4.2 Comportamiento pre-go-live (el caso a resolver explícitamente)

Hoy ninguna cuenta tiene `Fecha de Corte` — `calcularSaldoCuenta` devuelve `0` para las 7 cuentas (§2.3b de 20.1, ya construido: "sin Fecha de Corte, el saldo es $0 explícitamente"). Sin ningún manejo especial, un intento de depósito de $80 desde Caja Registradora vería `saldoActual = $0`, `evaluarSaldoParaEgresoOMovimientoInterno` lo rechazaría con `"Saldo insuficiente para el Movimiento Interno: se necesitan $80.00, hay $0.00 disponibles."` — **técnicamente correcto pero engañoso**: no es que falte dinero, es que el sistema contable todavía no está en vivo.

**Diseño:** el endpoint `POST /api/finanzas/depositos` (y, análogamente, cualquier ruta que cree un `Movimiento Interno` en esta fase) hace una comprobación explícita **antes** de llamar a `crearMovimiento`, sin tocar `validaciones.ts` (que debe seguir siendo agnóstico de esto — es una regla de UX de esta fase, no una regla contable):

```ts
if (algunaCuentaSinFechaCorte([cuentaOrigen, cuentaDestino])) {
  throw new PreGoLiveError(); // lib/finanzas/pre-go-live.ts — mensaje/código compartidos con §3.4 paso 1
}
```

`PreGoLiveError` (`lib/finanzas/pre-go-live.ts`, `code: "PRE_GO_LIVE"`, mensaje compartido — ver §3.4 paso 1, la misma clase de error que usa la acreditación) permite que la UI distinga este caso de un error genérico y lo muestre con un tono informativo (no un error rojo de "algo salió mal"), y también de un verdadero "saldo insuficiente" post-go-live (que sí es un error real de negocio, tono distinto). Para que este chequeo sea testeable sin depender de sesión/HTTP (mismo criterio que se aplicó a la acreditación, §3.4/§3.5), la lógica de depósito también se extrae a una función de librería, `procesarDeposito(input): Promise<Movimiento>` (`lib/finanzas/deposito.ts`), que hace el chequeo `PRE_GO_LIVE` y luego llama a `crearMovimiento` — el route handler (`POST /api/finanzas/depositos`) solo hace el guard de sesión/rol y traduce `PreGoLiveError` a `409`, igual que el de acreditar.

**En la pantalla `/finanzas`:** si `cuentasBase.some(c => !c.fechaCorte)` (dato que la página ya carga hoy), se muestra un banner informativo permanente (no un error, tono neutral/azul) — *"El sistema contable todavía no está en vivo: las 7 cuentas necesitan su Saldo Inicial y Fecha de Corte antes de poder registrar depósitos o acreditaciones reales (Fase 20.1 §6, paso 9)."* — visible antes de que el usuario intente la acción y se tope con el error, no solo como reacción al fallo.

### 4.3 Pantalla

`app/finanzas/depositos/page.tsx` o un panel/modal desde `/finanzas` (`StaffModal` ya existe en el sistema de diseño) — formulario: monto, selector de Cuenta Origen (default "Caja Registradora"), selector de Cuenta Destino (default "SGINGRESOS", opciones filtradas client-side por `cuenta.permiteTransferirAIds` de la cuenta origen seleccionada — mejora de UX, no de validación: el servidor igual valida con `validarTransferenciaPermitida`), fecha (default hoy), comprobante opcional (mismo componente de subida ya usado en abonos), observación opcional.

---

## 5. Capacidad 4 — Movimiento manual (admin)

`POST /api/finanzas/movimientos` (agrega el método `POST` al archivo que hoy solo tiene `GET` — mismo archivo, mismo patrón que `saldos/route.ts` si tuviera más de un verbo). **Admin-only** (`isAdministratorRole` inline, igual que `reparar-abono`).

Body: `{ tipo: "Ingreso" | "Egreso", categoria, monto, cuentaId, metodo?, fecha, observacion, comprobanteUrl? }`. `observacion` es **obligatoria** aquí (a diferencia de `CrearMovimientoInput` en general, donde es opcional) — se valida en el propio route handler antes de llamar a `crearMovimiento` (rechaza con 400 si viene vacía tras `trim()`), sin tocar la firma de `crearMovimiento`.

- `tipo: "Ingreso"` → `cuentaDestinoId: cuentaId`. `tipo: "Egreso"` → `cuentaOrigenId: cuentaId`. Nunca se expone `Movimiento Interno`/`Ajuste` por este endpoint (esos ya tienen su propio flujo dedicado — depósito y acreditación respectivamente; mezclar los 4 tipos en un único formulario genérico solo generaría confusión, ninguna categoría/regla de negocio los necesita juntos).
- `categoria`: cualquiera del catálogo existente **salvo** `"Anticipo Cliente"` (reservada al Puente 1 de Abonos — un anticipo manual sin abono real detrás rompería la semántica de "Sin distribuir hasta facturar"), `"Depósito de Caja"` y `"Acreditación Pasarela"` (reservadas a sus flujos dedicados de esta misma fase). Rechazo explícito de esas 3 en el route handler con un mensaje claro.
- `origen: "Manual"` — fijo, no viene del body.
- Para `Egreso`: se aplica la política ya construida (§2.3b/§8 de 20.1) sin ningún cambio — se registra siempre, `Alerta Descuadre` si el saldo de `cuentaId` queda negativo. No se bloquea.
- **No se construye aquí** ningún flujo de devolución ni ajuste complejo — exactamente lo que pide el encargo: campos y categorías ya existentes, nada más.

### Pantalla

`app/finanzas/movimiento-manual/page.tsx` o modal desde `/finanzas`, visible solo si `isAdministratorRole`. Formulario simple: tipo (Ingreso/Egreso), categoría (select filtrado, excluyendo las 3 reservadas), monto, cuenta, método (opcional), fecha, observación (obligatoria, con asterisco visual), comprobante opcional.

---

## 6. Checklist de esquema

**Ninguno.** Confirmado en vivo hoy (§1.1): los 3 campos de acreditación (`Monto Bruto`/`Monto Neto`/`Comisión`), el estado `Acreditado`, las categorías `Acreditación Pasarela`/`Depósito de Caja`, y el self-link `Reversa a`/`Compensado Por` ya existen desde el checklist de la Fase 20.1 — nadie los ha usado todavía, pero están listos exactamente como se documentó entonces. Esta fase es 100% código: ni un campo nuevo, ni una opción nueva de select, ni un registro que migrar a mano.

Único cambio de **código** relacionado con esquema: `MOVIMIENTOS_FIELDS` (`lib/finanzas/movimientos-fields.ts`) gana `compensadoPor: "Compensado Por"`, y `mapMovimiento`/`Movimiento` (`types/finanzas.ts`) ganan `compensadoPorIds: string[]` (vía `linkedIds`, mismo patrón que el resto de links) — leer un campo que ya existe en Airtable, no crearlo. `CrearMovimientoInput` gana `reversaAId?: string` (opcional, usado solo por `procesarAcreditacion`); `crearMovimiento` agrega `[F.reversaA]: input.reversaAId ? [input.reversaAId] : undefined` a su `compactFields` — un campo más en el POST, sin cambiar ninguna validación existente.

---

## 7. Mapa de permisos (roles reales verificados en `lib/apps.ts`)

No existen sub-roles dentro del permiso `"Finanzas"` hoy — la única distinción más fina disponible en todo el portal es `isAdministratorRole` (`admin`/`administrador`, ya usado por `reparar-abono`). Se propone exactamente la sugerencia del encargo, sin inventar un tercer nivel:

| Acción | Guard | Roles que pasan |
|---|---|---|
| Ver `/finanzas` y el detalle de un movimiento | `requireFinanzasSession()` | `admin`, `manager`, `finance` (cualquiera con `"Finanzas"` en `appsPermitidas`) |
| Registrar depósito (`POST /api/finanzas/depositos`) | `requireFinanzasSession()` | Igual que arriba — **operativo**, no requiere admin |
| Acreditar (`POST .../acreditar`) | `requireFinanzasSession()` | Igual — operativo |
| Ver pendientes por acreditar (`GET .../pendientes-acreditar`) | `requireFinanzasSession()` | Igual |
| Movimiento manual (`POST /api/finanzas/movimientos`) | `requireFinanzasSession()` + `isAdministratorRole` inline | Solo `admin`/`administrador` |
| Anular desde el detalle (`POST .../anular`) | `requireFinanzasSession()` + `isAdministratorRole` inline | Solo `admin`/`administrador` |

**Confirmar con el dueño:** si "operativo" debe ser más restrictivo que "cualquiera con acceso a Finanzas" (p. ej. solo `finance`, no `manager`) — hoy el portal no distingue esos dos roles en ningún guard existente, así que replicar esa distinción aquí requeriría una convención nueva que no existe en ningún otro módulo. Se recomienda **no inventarla** para esta fase (consistencia con el resto del portal) salvo que el dueño indique lo contrario.

---

## 8. Prueba de fuego — un día completo

Cuentas ya en go-live (`Fecha de Corte` = el día anterior, `Saldo Inicial = $0` en las 3 cuentas relevantes para simplificar la lectura de la conservación de dólares). Día simulado: 2026-07-16.

| Estado inicial | Caja Registradora | SGINGRESOS | Tarjetas en Tránsito (saldo / por acreditar) |
|---|---|---|---|
| | $0.00 | $0.00 | $0.00 / $0.00 |

**Evento 1 — Abono en efectivo, $80** (Puente 1 de 20.2, sin cambios en esta fase):
```
Ingreso · Cuenta Destino: Caja Registradora · Monto: $80.00 · Confirmado · Anticipo Cliente
```
→ Caja: **$80.00**. Resto sin cambio.

**Evento 2 — Venta con tarjeta de crédito, $30** (Puente 2 de 20.2, sin cambios):
```
Ingreso · Cuenta Destino: Tarjetas en Tránsito · Monto: $30.00 · Pendiente · Venta Mostrador
```
→ Caja: $80.00 (sin cambio). Tránsito saldo: **$0.00** (Pendiente no cuenta). Tránsito por acreditar: **$30.00**.

**Evento 3 — Depósito de caja, $80.00, Caja → SGINGRESOS** (Capacidad 2, §4): saldo de Caja en ese instante = $80.00 ≥ $80.00 → pasa el bloqueo por saldo justo en el límite (no `< 0`).
```
Movimiento Interno · Cuenta Origen: Caja Registradora · Cuenta Destino: SGINGRESOS
Monto: $80.00 · Confirmado · Depósito de Caja
```
→ Caja: $80.00 − $80.00 = **$0.00**. SGINGRESOS: $0.00 + $80.00 = **$80.00**. Tránsito sin cambio.

*(Control negativo, no ejecutado en esta secuencia: si este mismo depósito se intentara **antes** del go-live real —las 7 cuentas sin `Fecha de Corte`—, el endpoint respondería `409 PRE_GO_LIVE` con el mensaje de §4.2, nunca con "saldo insuficiente".)*

**Evento 4 — Acreditación de la venta con tarjeta del Evento 2, neto $28.80** (Capacidad 3, §3): comisión calculada = $30.00 − $28.80 = **$1.20**.
```
Paso A — Original (Evento 2) → Acreditado · Monto Bruto: $30.00 · Monto Neto: $28.80 · Comisión: $1.20
  Tránsito saldo: $0.00 + $30.00 = $30.00 (transitorio, mismo request)   Tránsito por acreditar: $0.00

Interno-hijo — Movimiento Interno · Tránsito → SGINGRESOS · Monto: $28.80 · Confirmado · Acreditación Pasarela
  Tránsito saldo: $30.00 − $28.80 = $1.20 (transitorio)   SGINGRESOS: $80.00 + $28.80 = $108.80

Ajuste-hijo — Ajuste · Cuenta Origen: Tránsito (sin destino) · Monto: $1.20 · Confirmado · Acreditación Pasarela
  Rubro Utilidad: $1.20 · Distribuido
  Tránsito saldo: $1.20 − $1.20 = $0.00
```
→ **Caja: $0.00. SGINGRESOS: $108.80. Tránsito saldo: $0.00. Tránsito por acreditar: $0.00.**

Verificación de conservación: dinero real (bancario + efectivo) antes de este evento = $0.00 (Caja) + $80.00 (SGINGRESOS) = $80.00, más $30.00 "reconocidos pero no confirmados" (por acreditar) = $110.00 en total reconocido por el sistema. Después del evento: $0.00 + $108.80 = $108.80 de dinero real, más $0.00 pendiente = $108.80 reconocido. Diferencia: **$1.20 exactos**, que ahora vive como reducción de `Rubro Utilidad` (un gasto reconocido, no efectivo perdido) — nunca aparece como saldo fantasma en ninguna cuenta.

**Evento 5 — Gasto manual, $10.00, desde Caja Registradora** (Capacidad 4, §5): `Categoría: "Otro"`, observación *"Compra de insumos de oficina"*. Saldo de Caja en ese instante = $0.00 → `$0.00 − $10.00 = -$10.00 < 0` → **se registra igual** (política ya construida, Egreso nunca bloquea), `Alerta Descuadre = true`.
```
Egreso · Cuenta Origen: Caja Registradora · Monto: $10.00 · Confirmado · Otro · Alerta Descuadre: true
```
→ Caja: **-$10.00** (⚠ visible en `/finanzas` y en su detalle). Resto sin cambio.

**Evento 6 — Anulación desde el detalle, del movimiento del Evento 5** (Capacidad 1, §2): se determina que el gasto se registró por error (duplicado). Admin abre `/finanzas/[id]` del Evento 5, ingresa motivo *"Registrado dos veces por error, ver Evento equivalente ya cargado"*, confirma.
```
Egreso del Evento 5 → Anulado (Fecha/Motivo de anulación llenos) · Monto/Cuenta/Categoría/Alerta Descuadre: sin cambios (inmutables, Corrección 1 de 20.1)
```
→ Caja: −$10.00 revertido (Anulado sale de `ESTADOS_QUE_CUENTAN_PARA_SALDO`) → vuelve a **$0.00**. El campo `Alerta Descuadre = true` queda congelado en el registro anulado (no se "limpia" — mismo comportamiento ya verificado en el test #1 de 20.1: anular no altera ningún otro campo, solo dejar de contar).

### Estado final

| | Caja Registradora | SGINGRESOS | Tarjetas en Tránsito |
|---|---|---|---|
| Saldo | $0.00 | $108.80 | $0.00 (por acreditar: $0.00) |

**Total de dinero real: $108.80 = $80.00 (depósito bancario del Evento 3) + $28.80 (neto acreditado del Evento 4).** El gasto manual del Evento 5 nunca restó de verdad (se anuló antes de afectar ningún reporte real). La comisión de $1.20 quedó correctamente excluida de todo saldo de cuenta, viviendo únicamente como una reducción reconocida de `Rubro Utilidad`. **Ningún dólar se creó ni se perdió en ningún paso.**

---

## 9. Plan de pruebas — Etapa B

1. **`acreditarMovimientoPendiente` — validaciones básicas**: rechaza si el movimiento no es `Ingreso`; rechaza si no está `Pendiente` (`Confirmado`/`Anulado`); rechaza si la `Cuenta Destino` no es de `Tipo = "Tránsito"`; rechaza `montoNeto <= 0`; rechaza `montoNeto > monto` (bruto); acepta el caso límite `montoNeto === monto` (comisión $0, sin error).
2. **`acreditarMovimientoPendiente` — efecto correcto**: con un movimiento `Pendiente` de $30 y neto $28.80 → tras la llamada, `Estado del Movimiento = "Acreditado"`, `Monto Bruto = 30`, `Monto Neto = 28.80`, `Comisión = 1.20` (con redondeo a 2 decimales), `Monto`/`Cuenta Destino`/`Tipo`/`Categoría` sin cambios.
3. **`procesarAcreditacion` — flujo completo, conservación de dólares**: réplica del Evento 4 de la prueba de fuego — verificar los 3 registros finales exactos (montos, cuentas, categorías, estados) y que `saldo(Tránsito)` antes/después del flujo completo es `$0.00` en ambos casos (solo cambia transitoriamente durante la ejecución).
4. **`procesarAcreditacion` — matriz de transferencias respetada**: si `Tarjetas en Tránsito` no tuviera permiso de transferir a `SGINGRESOS` en `Permite Transferir A` (caso hipotético, forzado en el doble de prueba), la creación del Interno-hijo debe rechazarse con el mismo error que ya prueba el test #6 de 20.1 — la acreditación no debe tener ninguna ruta que se salte esa validación.
5. **`procesarAcreditacion` — idempotencia y recuperación de fallo parcial, por tipo (Corrección 2)**: (a) llamar dos veces con los mismos parámetros sobre un movimiento ya `Acreditado` con sus 2 hijos ya creados → segunda llamada no crea nada nuevo, devuelve los mismos 3 registros. (b) simular que el Paso A tuvo éxito pero la creación del Interno-hijo falla → estado queda `Acreditado` sin hijos; una segunda llamada con el mismo `montoNeto` completa los 2 hijos faltantes. (c) simular que **solo el Interno-hijo** se alcanzó a crear (existe 1 hijo, de tipo `Movimiento Interno`) antes de que el proceso fallara → una segunda llamada detecta por **tipo** que falta específicamente el Ajuste-hijo (no por conteo — `compensadoPorIds.length === 1` no debe leerse como "ya completo") y crea únicamente ese, sin duplicar el Interno-hijo ya existente. (d) reintentar con un `montoNeto` **distinto** al ya persistido → rechazado con error explícito, no se sobreescribe silenciosamente.
6. **`procesarAcreditacion` — comisión $0 no crea Ajuste-hijo (Corrección 2)**: acreditar con `montoNeto === monto` (bruto) → `comision = 0` → el resultado tiene `ajuste: null`, **no** se llama a `crearMovimiento` para el Ajuste-hijo (verificar cero POSTs de tipo `Ajuste` en el doble), y una llamada posterior (idempotencia) sigue devolviendo `ajuste: null` sin intentar crear nada — la completitud trata "comisión $0" como un caso resuelto, no como algo pendiente de completar.
7. **`procesarAcreditacion` — `PRE_GO_LIVE` explícito, nada se muta (Corrección 3)**: con `Tarjetas en Tránsito` o `SGINGRESOS` sin `Fecha de Corte` → llamar a `procesarAcreditacion` lanza `PreGoLiveError` **antes** de cualquier `fetchMovimientoById`/PATCH/POST — verificar explícitamente que el movimiento original sigue exactamente `Pendiente` (sin `Monto Neto`/`Comisión`/cambio de estado) y que el store de movimientos del doble no ganó ningún registro nuevo tras la llamada fallida.
8. **`anularMovimiento` — bloqueo por compensadores activos (Corrección 1)**: crear un original con 2 hijos activos (vía `Reversa a`/`Compensado Por` simulados en el doble) → `anularMovimiento(original.id, motivo)` rechaza, y el mensaje de error menciona ambos `movimientoId` de los hijos. Anular primero los 2 hijos y luego el original → ahora sí procede (cero compensadores activos restantes).
9. **`anularMovimiento` — advertencia de cadena al anular un hijo (Corrección 1)**: anular un hijo (`reversaAId` poblado) mientras el original sigue `Acreditado` (activo) → no se bloquea, `warning` no es `null` y menciona el `movimientoId` del original; se verifica el `console.warn` correspondiente. Anular ese mismo hijo cuando el original **ya** está `Anulado` → `warning: null` (no hay cadena activa que advertir).
10. **Depósito de caja — feliz y bloqueo por saldo**: depósito dentro del saldo disponible → se crea, saldos correctos en ambas cuentas. Depósito por más del saldo disponible → rechazado antes de llamar a Airtable (reutiliza el mismo mecanismo del test #2 de 20.1, sin duplicar el test — solo verificar que `procesarDeposito` lo invoca correctamente).
11. **Depósito de caja — bloqueo pre-go-live con mensaje claro**: con al menos una de las 2 cuentas sin `Fecha de Corte` → `procesarDeposito` lanza `PreGoLiveError`, **nunca** el mensaje genérico de "saldo insuficiente" — verificar que no se llama a `crearMovimiento` en absoluto en este caso (cero llamadas al doble de Airtable).
12. **Movimiento manual — categorías reservadas rechazadas**: intentar crear un movimiento manual con `categoria: "Anticipo Cliente"` / `"Depósito de Caja"` / `"Acreditación Pasarela"` → rechazado con error explícito antes de llegar a `crearMovimiento`. Categoría válida (p. ej. `"Otro"`) → se crea normalmente.
13. **Movimiento manual — observación obligatoria**: `observacion` vacía o solo espacios → rechazado con 400, sin llamar a `crearMovimiento`.
14. **Movimiento manual — Egreso nunca bloquea por saldo**: Egreso manual por más del saldo disponible de la cuenta → se crea igual, `Alerta Descuadre = true` (mismo mecanismo del test #3 de 20.1, verificado a través de este endpoint específico).
15. **Anulación desde el detalle — motivo obligatorio**: `POST .../anular` sin `motivo` o con `motivo` vacío tras `trim()` → rechazado con 400, `anularMovimiento` nunca se invoca.
16. **Anulación desde el detalle — permisos**: sesión sin `isAdministratorRole` → `403`, sin tocar el movimiento. Sesión admin → procede igual que `anularMovimiento` ya probado en 20.1 (no se duplica ese test, solo se verifica el enganche correcto del permiso y el `motivo`).
17. **Detalle — trazabilidad completa**: un movimiento creado por el Puente 1 con Orden y Operación vinculadas (vía el Abono) → `fetchMovimientoConTrazabilidad` resuelve correctamente `ordenCodigo`/`operacionCodigo`/`clienteNombre`; un movimiento del Puente 2 con Factura → resuelve `facturaNumero`; un movimiento `Acreditado` con sus 2 hijos → `compensadoPorIds` resuelve los 2 registros correctos con su tipo/categoría/monto.
18. **Conservación pendiente pre-corte, acreditado post-corte (Corrección 4)**: cuenta `Tránsito` con `Saldo Inicial` = bruto del único pendiente arrastrado ($30.00) y `Fecha de Corte = D`; el movimiento pendiente tiene `Fecha del movimiento < D`. `calcularSaldoCuenta(Tránsito)` antes de acreditar = `$30.00` exacto. Acreditar con fecha `≥ D` y neto `$28.80` → `calcularSaldoCuenta(Tránsito)` después = `$0.00` (nunca negativo), `calcularSaldoCuenta(SGINGRESOS)` sube exactamente `$28.80`.
19. **Suite completa 20.1 + 20.2 + 20.3 + `npm run typecheck`** — cero regresiones, incluidas las funciones generalizadas (`fetchMovimientosDeCuentaPorEstado` ahora exportada, sin cambio de comportamiento para sus llamadores existentes) y la nueva firma de `anularMovimiento` (`{ movimiento, warning }`).

Sin merge ni deploy — reporte final y detenerse, igual que 20.1/20.2.

---

## Resumen para aprobar

Cuatro capacidades sobre `/finanzas`: detalle navegable con trazabilidad completa y anulación admin-only (con política de cadena — bloquea si hay compensadores activos, advierte si se anula un hijo); depósito de caja (reutiliza `Movimiento Interno` de 20.1 sin ninguna lógica nueva, con un mensaje pre-go-live explícito en vez de "saldo insuficiente" engañoso); acreditación de pagos en tránsito (la pieza central — un movimiento `Acreditado` inmutable más hasta dos movimientos compensatorios automáticos, `Interno` por el neto y `Ajuste` por la comisión hacia `Rubro Utilidad` cuando corresponde, con completitud verificada por tipo de hijo y un chequeo `PRE_GO_LIVE` que no muta nada si falla); y movimiento manual admin-only para ingresos/egresos sueltos que ningún puente cubre. **Cero cambios de esquema en Airtable** — los 3 campos de acreditación, el estado `Acreditado`, las 2 categorías y el self-link `Reversa a`/`Compensado Por` ya existían desde el checklist de la Fase 20.1, anticipando exactamente este momento (incluido el caso de una cuenta `Tránsito` cuyo `Saldo Inicial` de go-live debe contarse como la suma de brutos pendientes, no como dinero físico — §3.7). Permisos: sin inventar sub-roles nuevos, reutilizando la única distinción que ya existe en todo el portal (`isAdministratorRole`).

**Pendiente de tu aprobación antes de escribir cualquier código de la Etapa B.**

---

## Registro de correcciones (v1 → v2)

Revisión del dueño sobre la v1 de este documento: **aprobado en su estructura general** (las 4 capacidades, la decisión de representación de la acreditación por alternativa (a), la ausencia de cambios de esquema, el mapa de permisos — todo eso se mantuvo sin cambios). 4 correcciones vinculantes, ya integradas arriba en las secciones que corrigen:

1. **Anular un eslabón de una cadena de acreditación no tenía ninguna regla propia** (§2.3/§2.4). Corregido: `anularMovimiento` ahora bloquea anular un movimiento con compensadores activos (mensaje que los lista) y advierte —sin bloquear— al anular un hijo cuyo original sigue activo. Cambia la firma de retorno de `anularMovimiento` a `{ movimiento, warning }`.
2. **La completitud de `procesarAcreditacion` se decidía por cantidad de hijos (`compensadoPorIds.length`), no por tipo** (§3.4) — un bug real, no solo una imprecisión: con comisión `$0` habría intentado crear un Ajuste-hijo de monto `$0`, que `crearMovimiento` rechaza (`"El monto debe ser mayor a 0"`); y con solo 1 de 2 hijos creados por un fallo parcial, `.length > 0` lo habría dado por completo sin crear el que falta. Corregido: se verifica explícitamente qué **tipos** de hijo existen (`Movimiento Interno`/`Ajuste`), y `comision === 0` se trata como "Ajuste no necesario", no como pendiente.
3. **El chequeo `PRE_GO_LIVE` solo estaba diseñado para el depósito, no para la acreditación** (§3.4/§3.6), pese a que esta última también crea un `Movimiento Interno` hacia `SGINGRESOS` y podía fallar a mitad de camino (Paso A ya mutado, hijos rechazados por "saldo insuficiente" real pero engañoso). Corregido: el chequeo se mueve al principio de `procesarAcreditacion`, antes de cualquier mutación, lanzando `PreGoLiveError` — compartida con el depósito vía `lib/finanzas/pre-go-live.ts` — y ambos flujos (`procesarAcreditacion`/`procesarDeposito`) se extraen como funciones de librería puras para que este comportamiento sea testeable sin simular sesión/HTTP.
4. **No se había considerado el caso de un pendiente creado antes del go-live y acreditado después** (§3.7, sección nueva) — la exclusión por `Fecha de Corte` es permanente y por fecha, no por estado, así que el crédito original de ese pendiente nunca llegaría a sumar al saldo de Tránsito aunque pase a `Acreditado`, mientras que sus hijos (fechados en el momento de la acreditación, ya en vivo) sí restarían — un saldo negativo artificial. Corregido con una instrucción operativa de conteo: el `Saldo Inicial` de una cuenta `Tipo = "Tránsito"` el día del corte debe ser la suma de los brutos todavía `Pendiente` en ese momento, no dinero físico contado (no existe ninguno) — así el mecanismo de compensación cuadra exactamente cuando esos pendientes se acrediten después.

**Aprobado para proceder directo a la Etapa B — sin esperar otra revisión.**
