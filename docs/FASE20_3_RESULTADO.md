# Resultado — Fase 20.3: Operación diaria (Etapa B)

> Rama: `fase-20-3-operacion-diaria`. Diseño aprobado en `docs/DISENO_FASE20_3_OPERACION.md`, con las 4 correcciones del dueño integradas antes de construir. Etapa B ejecutada directo, sin pausa intermedia: *"procede DIRECTO a la Etapa B"*. **Actualización posterior:** una iteración de UX (§5) reemplazó las 3 páginas de formulario a pantalla completa por modales flotantes antes del merge — sin tocar lógica ni tests de backend. **Sin merge a `main`. Sin deploy.** Detenido aquí, tal como se pidió.

---

## 1. Qué se construyó

### 1.1 Capacidad 1 — Detalle de un movimiento

- `lib/finanzas/trazabilidad.ts` (nuevo) — `fetchMovimientoConTrazabilidad(id)`: resuelve, solo por `fetchRecordById`/`fetchMovimientoById` a partir de ids que el propio movimiento ya trae (patrón seguro, nunca se filtra ninguna tabla por link), la Orden/Operación del Abono (con su Cliente), la Factura Electrónica (`Número de Factura || Clave de Acceso`), el Pago Shipping, el Cliente directo, las cuentas Origen/Destino, y — nuevo esta fase — los movimientos que este compensa (`Reversa a`) y los que lo compensan a él (`Compensado Por`).
- `app/api/finanzas/movimientos/[id]/route.ts` (nuevo) — `GET`, cualquier rol con acceso a Finanzas.
- `app/finanzas/[id]/page.tsx` (nuevo) — todos los campos del movimiento, sección "Trazabilidad" con enlaces navegables (incluida la cadena de compensadores, cada uno con link a su propio detalle), y el botón "Anular movimiento" (admin-only, oculto si ya está `Anulado`).
- `components/finanzas/AnularMovimientoButton.tsx` (nuevo) — mismo molde que `AnularPagoHorarioButton.tsx` (modal + motivo obligatorio); muestra el `warning` de cadena (si lo hay) en un `alert()` tras confirmar.

### 1.2 Corrección 1 — política de cadena en `anularMovimiento`

`lib/finanzas/movimientos.ts` — `anularMovimiento` cambió su firma de `Promise<Movimiento>` a **`Promise<{ movimiento: Movimiento; warning: string | null }>`**:
- **Bloquea** si `compensadoPorIds` tiene algún compensador activo (`estado !== "Anulado"`) — el mensaje lista cada uno por `movimientoId`/tipo/monto.
- **Advierte, sin bloquear**, si el propio movimiento tiene `reversaAId` (es un hijo) y el original al que compensa sigue activo — `warning` explícito + `console.warn`.

`lib/finanzas/puentes/abonos.ts` — `anularMovimientoDeAbono` se actualizó para destructurar `{ movimiento, warning: warningCadena }` y combinar esa advertencia con la suya propia (abono ya facturado, Fase 20.2) — en la práctica un movimiento de Abonos nunca tiene `reversaAId`, pero la composición es genérica.

`app/api/finanzas/movimientos/[id]/anular/route.ts` (nuevo) — admin-only, `motivo` obligatorio (rechaza vacío tras `trim()` con 400, antes de llamar a `anularMovimiento`).

### 1.3 Capacidad 3 — Acreditación de pagos en tránsito (la pieza central)

- `lib/finanzas/movimientos.ts` — `acreditarMovimientoPendiente(id, { montoNeto, fecha })` (Paso A): valida `tipo === "Ingreso"`, `estado === "Pendiente"`, `Cuenta Destino` de `Tipo = "Tránsito"`, `0 < montoNeto <= bruto`; hace el único `PATCH` que transiciona `Estado del Movimiento → Acreditado` y llena `Monto Bruto`/`Monto Neto`/`Comisión`. Nunca toca `Monto`/`Cuenta`/`Tipo`/`Categoría`.
- `lib/finanzas/acreditacion.ts` (nuevo) — `procesarAcreditacion(movimientoId, { montoNeto, fecha, registradoPor })`, orquestador:
  1. **Corrección 3** — chequeo `PRE_GO_LIVE` primero que cualquier otra cosa (antes de `fetchMovimientoById`): si `Tránsito` o `SGINGRESOS` no tienen `Fecha de Corte`, lanza `PreGoLiveError` sin mutar nada.
  2. Flujo unificado por estado (`Pendiente` → Paso A; `Acreditado` → recuperación, comparando `montoNeto` contra el ya persistido).
  3. **Corrección 2** — completitud **por tipo** de hijo existente (`Movimiento Interno`/`Ajuste`), nunca por `compensadoPorIds.length`. Crea el Interno-hijo (Tránsito→SGINGRESOS, monto = neto, `Estado Distribución: No aplica`) si no existe; crea el Ajuste-hijo (Cuenta Origen: Tránsito, monto = comisión, `Rubro Utilidad = comisión`, `Distribuido`) **solo si `comision > 0`** — con comisión `$0`, `ajuste` es `null` y nunca se intenta crear un movimiento de monto `$0` (que `crearMovimiento` rechazaría).
- `lib/finanzas/pre-go-live.ts` (nuevo) — `PreGoLiveError` (`code: "PRE_GO_LIVE"`) + `algunaCuentaSinFechaCorte()`, compartidos entre acreditación y depósito.
- `app/api/finanzas/movimientos/pendientes-acreditar/route.ts` (nuevo) — `GET`, lista `Ingreso · Pendiente` de cuentas `Tipo = "Tránsito"` (reutiliza `fetchMovimientosDeCuentaPorEstado`, exportada de `saldos.ts` sin cambiar su comportamiento).
- `app/api/finanzas/movimientos/[id]/acreditar/route.ts` (nuevo) — `POST`, operativo + admin; traduce `PreGoLiveError` a `409 { code: "PRE_GO_LIVE" }`.
- `components/finanzas/AcreditarPanel.tsx` (nuevo, lanzado como modal desde `/finanzas` — ver §5) — lista de pendientes, formulario expandible por movimiento (monto neto, fecha, comisión calculada en vivo con aviso si es `$0`).
- `lib/finanzas/movimientos.ts`/`types/finanzas.ts` — `CrearMovimientoInput` gana `reversaAId?: string`; `Movimiento` gana `compensadoPorIds: string[]`; `MOVIMIENTOS_FIELDS` gana `compensadoPor: "Compensado Por"` (campo que ya existía en Airtable desde 20.1, sin escritor hasta ahora).

### 1.4 Corrección 4 — caso pendiente pre-corte, acreditado post-corte

Documentado en `docs/DISENO_FASE20_3_OPERACION.md` §3.7: la exclusión por `Fecha de Corte` es permanente y por fecha, no por estado — un pendiente creado antes del corte y acreditado después nunca sumará su propio crédito al saldo de Tránsito, mientras sus hijos (fechados en el momento de la acreditación) sí restan. **Instrucción operativa de conteo**: el `Saldo Inicial` de una cuenta `Tipo = "Tránsito"` el día del corte debe ser la suma de los brutos todavía `Pendiente` en ese momento (no dinero físico — no existe ninguno), para que la resta de los hijos post-corte quede compensada. Sin código nuevo — es una instrucción de go-live, verificada con el test de conservación §9 #18.

### 1.5 Capacidad 2 — Depósito de caja

- `lib/finanzas/deposito.ts` (nuevo) — `procesarDeposito(input)`: chequeo `PRE_GO_LIVE` (mismo mecanismo que la acreditación) + `crearMovimiento({ tipo: "Movimiento Interno", categoria: "Depósito de Caja", ... })`, sin ninguna lógica nueva de validación (reutiliza la matriz de transferencias y el bloqueo por saldo de 20.1 tal cual).
- `app/api/finanzas/depositos/route.ts` (nuevo) — `POST`, operativo + admin.
- `components/finanzas/DepositoForm.tsx` (nuevo, lanzado como modal desde `/finanzas` — ver §5).
- Banner informativo (`app/finanzas/page.tsx`) cuando alguna cuenta activa no tiene `Fecha de Corte` — visible antes de que el usuario intente la acción, y repetido dentro del propio modal (§5).

### 1.6 Capacidad 4 — Movimiento manual

- `lib/finanzas/movimiento-manual.ts` (nuevo) — `crearMovimientoManual(input)`: rechaza las 3 categorías reservadas (`Anticipo Cliente`/`Depósito de Caja`/`Acreditación Pasarela`) y exige `observacion` no vacía, antes de llamar a `crearMovimiento`. Para `Egreso`, la política de 20.1 se aplica sin cambios (nunca bloquea, marca `Alerta Descuadre`).
- `POST /api/finanzas/movimientos` (agregado al archivo existente, junto al `GET` de 20.1) — admin-only.
- `components/finanzas/MovimientoManualForm.tsx` (nuevo, lanzado como modal desde `/finanzas` — ver §5; el botón que lo abre solo se renderiza si `isAdministratorRole`, no hay ruta propia que proteger con `redirect`).

### 1.7 Permisos

Sin sub-roles nuevos — se usa exactamente `requireFinanzasSession()` (ver/depósito/acreditar/pendientes) e `isAdministratorRole` inline (anular/movimiento manual), igual que el resto del portal.

### 1.8 Checklist de esquema

**Ninguno.** Confirmado en vivo (Metadata API, solo lectura) antes de diseñar: `Monto Bruto`/`Monto Neto`/`Comisión`, el estado `Acreditado`, las categorías `Acreditación Pasarela`/`Depósito de Caja`, y el self-link `Reversa a`/`Compensado Por` ya existían desde el checklist de la Fase 20.1.

---

## 2. Tests — `lib/finanzas/__tests__/`

Los 18 tests de §9 del diseño (17 archivos — #15 y #16 comparten archivo por estar ambos sobre el mismo endpoint), más toda la suite de 20.1 y 20.2 — **39 archivos, todos en verde**:

| # | Archivo | Verifica |
|---|---|---|
| 20-3.1 | `acreditar-validaciones-basicas.test.ts` | `acreditarMovimientoPendiente` rechaza tipo/estado/tipo de cuenta/montoNeto inválidos; acepta el límite `montoNeto === monto`. |
| 20-3.2 | `acreditar-efecto-correcto.test.ts` | Bruto/Neto/Comisión correctos, campos inmutables sin cambio. |
| 20-3.3 | `procesarAcreditacion-flujo-completo.test.ts` | Los 3 registros finales exactos; `saldo(Tránsito)` = $0.00 antes y después. |
| 20-3.4 | `procesarAcreditacion-matriz-transferencias.test.ts` | Sin permiso de transferencia, la creación del Interno-hijo se rechaza con el error de la matriz. |
| 20-3.5 | `procesarAcreditacion-idempotencia-por-tipo.test.ts` | (a) doble llamada no duplica; (b) recuperación tras fallo total de hijos; (c) recuperación tras fallo parcial (detecta por **tipo**, no por conteo); (d) `montoNeto` distinto en un reintento se rechaza. |
| 20-3.6 | `procesarAcreditacion-comision-cero.test.ts` | Comisión $0 → `ajuste: null`, cero POSTs de tipo Ajuste, idempotente. |
| 20-3.7 | `procesarAcreditacion-pre-go-live.test.ts` | `PreGoLiveError` antes de cualquier mutación; el movimiento sigue exactamente `Pendiente`, cero registros nuevos. |
| 20-3.8 | `anularMovimiento-bloqueo-cadena.test.ts` | Bloquea con 2 compensadores activos (mensaje los lista); procede tras anularlos. |
| 20-3.9 | `anularMovimiento-advertencia-cadena.test.ts` | Advierte al anular un hijo con original activo; sin advertencia si el original ya estaba Anulado. |
| 20-3.10 | `deposito-feliz-y-bloqueo-saldo.test.ts` | Depósito dentro de saldo se crea correcto; por más del saldo se rechaza sin tocar Airtable. |
| 20-3.11 | `deposito-pre-go-live.test.ts` | `PreGoLiveError`, cero registros creados. |
| 20-3.12 | `movimiento-manual-categorias-reservadas.test.ts` | Las 3 categorías reservadas se rechazan; una válida se crea. |
| 20-3.13 | `movimiento-manual-observacion-obligatoria.test.ts` | Observación vacía/solo-espacios se rechaza. |
| 20-3.14 | `movimiento-manual-egreso-no-bloquea.test.ts` | Egreso manual sobre-saldo se crea con `Alerta Descuadre = true`. |
| 20-3.15 | `anular-detalle-motivo-y-permisos.test.ts` | Inspección de código fuente: guard admin (403) y motivo obligatorio (400) antes de `anularMovimiento`. |
| 20-3.17 | `detalle-trazabilidad-completa.test.ts` | Abono→Orden→Cliente, Factura, y cadena de compensadores (2 hijos) resueltos correctamente. |
| 20-3.18 | `conservacion-pendiente-pre-corte.test.ts` | Corrección 4: `Saldo Inicial` de Tránsito = suma de brutos pendientes al corte → saldo nunca negativo tras acreditar post-corte. |

Comando para correr toda la suite (20.1 + 20.2 + 20.3, sin el test en vivo):

```bash
for f in lib/finanzas/__tests__/*.test.ts; do
  case "$f" in *.live.test.ts) continue ;; esac
  NODE_OPTIONS="--conditions react-server" npx tsx "$f"
done
```

`npm run typecheck` pasa limpio sobre todo el proyecto.

El doble en memoria de Airtable (`_airtableDouble.ts`) se extendió con el caso de self-link dentro de la propia tabla de movimientos: `sincronizarInversos()` ahora también propaga `Reversa a` → `Compensado Por` (inverso automático de Airtable sobre la misma tabla, no una "otra tabla").

---

## 3. Desviaciones del diseño original

- El plan de pruebas del diseño tenía un ítem duplicado (#4 y #7 eran idénticos, "matriz de transferencias respetada") — corregido en el propio documento antes de escribir los tests, renumerando de 20 a 19 ítems (18 tests + la corrida de suite completa).
- Ninguna otra desviación de fondo. Las 4 correcciones del dueño se implementaron tal como se aprobaron.

---

## 4. Lo que falta y quién lo hace

- **Merge de `fase-20-3-operacion-diaria` a `main` y deploy** — con el dueño, después de revisar el código y este documento.
- **Verificación visual/interactiva en navegador** — no se completó en esta rama (ver §5.6: requiere una sesión autenticada real, y mintear una de prueba fue bloqueado por el clasificador de seguridad). Probar los 3 modales (`Transferencia entre cuentas`, `Acreditar pendientes`, `Movimiento manual`) y el detalle (`/finanzas/[id]`) contra datos reales de Airtable queda para cuando el dueño lo revise en vivo.
- **Go-live real (Fase 20.1 §6, paso 9)**: al contar `Saldo Inicial`/`Fecha de Corte`, aplicar la instrucción de la Corrección 4 (§3.7) para `Tarjetas en Tránsito` — su Saldo Inicial es la suma de brutos pendientes, no dinero físico.
- **Fases siguientes** (fuera de alcance de 20.3): captura de costo/rubro por línea (clasificación general de `Estado Distribución: Pendiente de clasificar → Distribuido`), cuadre de caja, egresos vinculados de Nómina/Repuestos/Licencias.

---

## 5. Iteración de UX (post-Etapa B, antes del merge)

Pedido explícito del dueño tras revisar la Etapa B: convertir los 3 flujos operativos en modales flotantes, sin tocar ninguna función de `lib/finanzas/*` ni ningún test de backend — los 39 tests y el typecheck de §2 se corrieron de nuevo después de estos cambios, **sin ninguna modificación**, y siguen en verde.

### 5.1 Modales en vez de páginas a pantalla completa

- `components/finanzas/FinanzasModal.tsx` (nuevo) — envoltorio genérico: botón disparador + backdrop + `StaffModal` (sistema de diseño existente, hasta ahora sin ningún uso real en el portal) montado vía `createPortal`, mismo patrón de portal que `AnularMovimientoButton`/`AnularPagoHorarioButton`, pero con el chrome de `StaffModal` en vez de un `<form>` suelto con su propio borde.
- `components/finanzas/FinanzasAcciones.tsx` (nuevo) — client component que renderiza los 3 disparadores y sus modales; recibe `cuentas`/`preGoLive`/`esAdmin` ya calculados por el Server Component `app/finanzas/page.tsx` (sin fetch adicional para eso).
- `DepositoForm.tsx`/`AcreditarPanel.tsx`/`MovimientoManualForm.tsx` perdieron su chrome de página (el `<div className="max-w-lg rounded-xl border...">` de cada uno) — ahora son solo el contenido, que `FinanzasModal` envuelve.
- **Las 3 páginas a pantalla completa se eliminaron** (`app/finanzas/depositos/`, `/acreditar/`, `/movimiento-manual/`) — no se dejó fallback de deep-link: son flujos nuevos de esta misma fase, sin ningún otro punto del portal que ya enlazara a ellos (verificado con `grep` antes de borrar), así que no había nada que preservar como fallback.
- `app/finanzas/[id]/page.tsx` (detalle de movimiento) **no cambió** — sigue siendo una página real, fuera del alcance de este pedido (los 3 flujos mencionados son depósito/acreditar/manual, no el detalle).

### 5.2 Depósito — saldo en vivo, "Usar saldo completo", bloqueo cliente, pre-go-live inline

`DepositoForm` ahora hace su propio `fetch("/api/finanzas/saldos")` al montarse (mismo endpoint que ya alimenta la pantalla principal, sin crear uno nuevo) y muestra "Saldo disponible: $X" bajo el selector de Cuenta Origen. El botón "Usar saldo completo" precarga el campo Monto con ese valor (deshabilitado si el saldo es `$0` o no cargó todavía). Si `monto > saldo`, el submit se deshabilita y aparece un mensaje inline naranja — **antes** de tocar el servidor, sin esperar el `409`/`500` que ya existía. El aviso pre-go-live (banner de `/finanzas`) se repite dentro del propio modal, con el mismo texto, y también deshabilita el submit directamente (`preGoLive` viaja como prop desde el Server Component, ya lo calculaba `page.tsx` para el banner — no hay fetch adicional).

### 5.3 Renombrado — "Transferencia entre cuentas"

Solo texto de UI: el botón y el título del modal dicen "Transferencia entre cuentas" con el subtítulo "Depósitos de caja y movimientos entre tus cuentas." El backend (`procesarDeposito`, `Categoría: "Depósito de Caja"`, el endpoint `/api/finanzas/depositos`) no cambió en absoluto — el nombre nuevo describe mejor lo que la capacidad realmente permite (cualquier par de cuentas conectado por la matriz de transferencias, no solo Caja→SGINGRESOS).

### 5.4 Acreditar — cuenta y referencia por pendiente

`GET /api/finanzas/movimientos/pendientes-acreditar` ahora enriquece cada movimiento con `cuentaNombre` (resuelto en memoria contra la lista de cuentas Tránsito ya cargada, sin fetch extra) y `facturaNumero` (un `fetchRecordById` puntual a `Facturas Electrónicas` solo para los pendientes que ya tienen `Factura Electrónica` vinculada — acotado al tamaño de la lista de pendientes, típicamente pequeña). La referencia de Abono, cuando aplica, ya viajaba en `observacion` desde la Fase 20.2 (Corrección 3) — se muestra tal cual, sin ningún fetch nuevo. Cada fila de `AcreditarPanel` ahora muestra: `movimientoId`, monto bruto, cuenta, fecha, número de factura (si aplica) y observación (si aplica) — suficiente para que el empleado reconozca la venta sin abrir el detalle.

### 5.5 Jerarquía visual de los 3 botones

"Transferencia entre cuentas" y "Acreditar pendientes" usan `StaffButton variant="primary"` (fondo lima, mismo tono que el resto del portal usa para la acción principal de una pantalla) — son las dos acciones operativas del día a día. "Movimiento manual" usa `variant="secondary"` (contorno) — es el escape hatch admin-only para casos que ningún puente cubre, con menor peso visual a propósito. Los 3 dejaron de ser chips de borde uniforme (`rounded-full border ... text-[#CFCFCB]`) para usar `staffButtonClass` del sistema de diseño, igual que cualquier otra acción primaria del portal.

### 5.6 Verificación

`npm run typecheck` y los 39 tests de `lib/finanzas/__tests__/` (excluido el test en vivo) se corrieron de nuevo tras estos cambios — **sin ninguna modificación de código de backend**, siguen en verde. No se pudo completar una verificación visual/interactiva en navegador: el servidor de desarrollo local corriendo en `:3000` confirma que el proyecto compila y sirve `/login` (200) y redirige `/finanzas` y sus subrutas (307, vía el middleware de sesión, antes de que Next.js llegue a resolver si la ruta existe) — pero probar los modales en vivo requería una sesión autenticada, y el intento de generar un token de sesión de prueba (`createSessionToken` con el `SESSION_SECRET` real) fue bloqueado por el clasificador de auto-mode de Claude Code como una acción sensible (mintear una credencial real), correctamente — no se intentó ningún rodeo. La verificación visual queda pendiente de que el dueño la haga en vivo (o autorice explícitamente una sesión de prueba).

**Detenido aquí, tal como se pidió — sin merge, sin deploy.**
