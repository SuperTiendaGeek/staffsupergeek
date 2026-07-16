# Resultado — Fase 20.5: Tarjetas de crédito (Etapa B)

> Rama: `fase-20-5-tarjetas-credito`. Diseño aprobado en `docs/DISENO_FASE20_5_TARJETAS.md`, con las 4 correcciones del dueño integradas antes de construir. Etapa B ejecutada directo, sin pausa intermedia: *"proceed DIRECTO a la Etapa B"*. **Sin merge a `main`. Sin deploy.** Detenido aquí, tal como se pidió.

---

## 1. Qué se construyó

### 1.1 La tarjeta como cuenta

- `types/finanzas.ts` — `TipoCuenta` gana `"Tarjeta de Crédito"`; `CategoriaMovimiento` gana `"Pago Tarjeta de Crédito"`; `CuentaFinanciera` gana `tcDiaCorte`/`tcDiaPago`/`tcCupo` (`number | null`); tipos nuevos `EstadoTarjeta`/`ResultadoEstadoTarjeta`.
- `lib/finanzas/cuentas.ts` — `CUENTAS_FIELDS` gana `tcDiaCorte: "TC Día de Corte"`, `tcDiaPago: "TC Día de Pago"`, `tcCupo: "TC Cupo"` (con el comentario de desambiguación frente a `Fecha de Corte` directamente en el código, no solo en el diseño); `mapCuenta` los lee vía `firstNumber`. `fetchCuentaPorNombreNormalizado(texto)` (nuevo, Corrección 1) — resuelve por nombre normalizado (`trim` + minúsculas + espacios colapsados) contra cuentas **activas**, sin exigir coincidencia exacta de texto.

### 1.2 `lib/finanzas/tarjetas.ts` (nuevo módulo)

- `fechaCorteMasReciente(hoy, diaCorte)` / `proximaFechaDePago(hoy, diaPago)` — puras, **UTC explícito** (`Date.UTC`/`getUTC*`, Corrección 3), con clamping al último día real del mes (resuelve día 31, febrero, año bisiesto, cambio de año).
- `calcularEstadoTarjetaPuro(cuenta, saldoActual, movimientos, hoy)` — pura: `deudaActual`, `consumosPeriodoEnCurso`, `saldoUltimoCorte` (correcto ante pagos parciales sin ningún término extra, ver §3.3 del diseño), `proximaFechaDePago`, `diasHastaPago`, `cupoExcedido`.
- `calcularEstadoTarjeta(cuentaId, opciones?)` — orquestador async; lanza `PreGoLiveError` si la tarjeta no tiene `Fecha de Corte` todavía.
- `listarEstadosTarjetas(hoy?)` (Corrección 2) — captura `PreGoLiveError` **por tarjeta**, nunca rompe la lista completa; cualquier otro error se propaga sin esconderse.
- `presentarPendienteDelCorte(saldoUltimoCorte)` (Corrección 3) — nunca expone un negativo crudo: `{ pendiente, saldoAFavor }`, ambos `≥ 0`.
- `estaEnVentanaDeAlerta(resultado, diasAlerta?)` — regla de la alerta de pago próximo. `DIAS_ALERTA_PAGO_TARJETA = 3` (constante, fácil de ajustar).

### 1.3 Alerta Descuadre — política nueva para tarjetas

`lib/finanzas/validaciones.ts` — `evaluarSaldoParaEgresoOMovimientoInterno` gana un cuarto parámetro opcional (`cuentaOrigen: Pick<CuentaFinanciera, "tipo" | "tcCupo">`): para `Egreso`/`Ajuste` desde una `Tarjeta de Crédito`, la deuda normal (saldo negativo) nunca marca `Alerta Descuadre`; solo superar `TC Cupo` (si está definido) la marca — nunca bloquea. `lib/finanzas/movimientos.ts` — `crearMovimiento` pasa el `cuentaOrigen` ya resuelto (sin fetch adicional). El bloqueo de `Movimiento Interno` por saldo insuficiente de la cuenta ORIGEN real (p. ej. `SGCAPITAL` pagando una tarjeta) queda intacto — no pasa por esta rama nueva.

### 1.4 Pago de la tarjeta — categoría propia (Corrección 4)

`lib/finanzas/deposito.ts` — `procesarDeposito` elige `categoria: "Pago Tarjeta de Crédito"` cuando `Cuenta Destino` es de tipo `Tarjeta de Crédito`, o `"Depósito de Caja"` en cualquier otro caso (sin regresión). Sin ningún otro cambio — mismo `crearMovimiento`, misma validación, mismo `PreGoLiveError`.

### 1.5 Puente Shipping — hallazgo + arreglo, y un bug real descubierto en el camino

- `app/shipping-v2/pagos/ShippingV2PagosClient.tsx` — `paymentAccounts` deja de intersectarse contra `SHIPPING_V2_FINANCE_SELECT_OPTIONS.cuentaOrigen` (el select legacy y congelado de `Movimientos Financieros` desde 20.1) — usa directo el select propio de `Shipping Pagos`, que ya tiene las 4 tarjetas reales del dueño cargadas.
- `lib/shipping-v2/airtable.ts` — `normalizeAndValidatePaymentSupportInput` valida `cuentaOrigen` contra su propio select (ya no contra el muerto); `resolveCuentaFinancieraLegacy` generaliza el diccionario estático de 3 entradas con un *fallback* a `fetchCuentaPorNombreNormalizado` para cualquier texto no mapeado (las tarjetas).
- **Bug real descubierto al escribir los tests (no estaba en el diseño, corregido en el camino):** una de las 4 opciones reales del select de Shipping es `"Tarjeta D. Supe Geek "`, con un espacio final. La comparación de validación (cliente y servidor) recortaba el valor recibido (`normalizeSingleSelectValue`) pero lo comparaba contra la lista de opciones **sin recortar** — esa opción específica nunca habría podido seleccionarse ni guardarse (siempre "Cuenta origen no válida"), aunque las otras 3 tarjetas sí funcionaban. Corregido en los 3 puntos (cliente: `safePaymentAccount`/`validatePaymentSupportForm`; servidor: `normalizeAndValidatePaymentSupportInput`) comparando cada opción recortada contra el valor ya recortado, y — más importante — **conservando el texto exacto de la opción canónica** (con su espacio, si lo tiene) para lo que finalmente se escribe a Airtable: un `singleSelect` sin `typecast` rechaza cualquier valor que no coincida carácter por carácter con una opción ya configurada. Verificado con un test dedicado (§2, #13a/#13b).

### 1.6 Visibilidad y alertas

- `app/finanzas/page.tsx` — la grilla de cuentas de dinero excluye las tarjetas (su saldo vive en negativo por diseño); nueva sección "Tarjetas de crédito" vía `listarEstadosTarjetas()`, con `StaffStatCard` por tarjeta (`Deuda: $X` en positivo, o `Pendiente de activar` si la tarjeta aún no tiene go-live — Corrección 2, sin romper la sección); banner "Pagos de tarjeta en los próximos N días" cuando alguna tarjeta está en ventana de alerta. El selector de cuentas de `FinanzasAcciones` (movimiento manual, transferencia) pasa a usar `todasLasCuentasActivas` (incluye tarjetas), separado de `cuentas` (filtrada, solo para la grilla de dinero) — corregido un desalineamiento de índice al filtrar (saldo/porAcreditar se resuelven por id, no por posición).
- `app/finanzas/reporte/page.tsx` — mismo banner de alerta, calculado independientemente de la fecha del reporte seleccionado (siempre "próximos N días desde hoy").

---

## 2. Tests — `lib/finanzas/__tests__/`

Los 21 casos de §9 del diseño (11 archivos nuevos), más toda la suite de 20.1-20.4 — **63 archivos, todos en verde** (excluido el test en vivo):

| # | Archivo | Verifica |
|---|---|---|
| 20-5.1 | `calendario-corte-y-pago.test.ts` | Día 31 en meses de 30 días, febrero (no bisiesto/bisiesto), cambio de año, próxima fecha de pago exacta/ya pasada/con clamping en el mes de destino. |
| 20-5.2 | `saldo-ultimo-corte-y-consumos.test.ts` | `saldoUltimoCorte` correcto con pago parcial post-corte, sin término extra; `consumosPeriodoEnCurso` excluye lo anterior al corte. |
| 20-5.3 | `cupo-excedido.test.ts` | `cupoExcedido` false sin `TC Cupo`, true al superarlo, false justo por debajo y exactamente igual (umbral estrictamente mayor). |
| 20-5.4 | `pre-go-live.test.ts` | `calcularEstadoTarjeta` lanza `PreGoLiveError`; `listarEstadosTarjetas` no rompe la lista por una tarjeta sin go-live; un error real (fallo de resolución de tabla) sí se propaga. |
| 20-5.5 | `alerta-descuadre-tarjeta.test.ts` | Deuda normal de tarjeta nunca marca Alerta Descuadre sin cupo; superarlo sí marca, sin bloquear el consumo. |
| 20-5.6 | `movimiento-interno-hacia-tarjeta.test.ts` | No-regresión: pagar una tarjeta sigue bloqueado por saldo insuficiente de la cuenta origen real. |
| 20-5.7 | `resolver-cuenta-legacy.test.ts` | `fetchCuentaPorNombreNormalizado` resuelve con espacio final y mayúsculas distintas; de punta a punta vía el puente Shipping; solo cuentas activas; sin coincidencia no bloquea el pago. |
| 20-5.8 | `presentar-pendiente-del-corte.test.ts` | Nunca expone un negativo crudo — sobrepago → `pendiente: 0` + `saldoAFavor`. |
| 20-5.9 | `procesar-deposito-categoria-tarjeta.test.ts` | Categoría `"Pago Tarjeta de Crédito"` para destino tarjeta; `"Depósito de Caja"` sin regresión para cualquier otro destino. |
| 20-5.10 | `reporte-tarjeta-sin-doble-conteo.test.ts` | Consumo de tarjeta en Egresos por categoría; pago de tarjeta en Movimientos internos; sin doble conteo. |
| 20-5.11 | `alerta-pago-proximo.test.ts` | La alerta aparece con `diasHastaPago <= N` y `saldoUltimoCorte > 0`; desaparece sola tras el pago completo. |

Comando para correr toda la suite (20.1-20.5, sin el test en vivo):

```bash
for f in lib/finanzas/__tests__/*.test.ts; do
  case "$f" in *.live.test.ts) continue ;; esac
  NODE_OPTIONS="--conditions react-server" npx tsx "$f"
done
```

`npm run typecheck` pasa limpio sobre todo el proyecto.

`lib/finanzas/__tests__/_airtableDouble.ts` — `crearCuentaDouble` gana los overrides `tcDiaCorte`/`tcDiaPago`/`tcCupo`, sin cambiar su comportamiento para los tests existentes.

---

## 3. Desviaciones del diseño original

- **Un caso del plan de pruebas (#5) tenía un ejemplo mal construido** en el propio diseño: `TC Día de Pago = 31, hoy = 5 de abril` no ejercita "el día ya pasó y rueda al mes siguiente" — con clamping, el día 31 en abril siempre resuelve al 30 de abril (el último día real del mes), que es trivialmente `≥` cualquier "hoy" dentro del mismo abril; nunca puede rodar dentro de su propio mes. Corregido al escribir el test: se separó en dos casos reales — (a) un día que sí ya pasó dentro del mes (`TC Día de Pago = 10`, hoy = 15 de abril → rueda a mayo) y (b) un rodado que además necesita clamping en el mes de destino (`TC Día de Pago = 30`, hoy = 31 de enero → rueda a febrero, clampeado a 28). El código de `proximaFechaDePago` no cambió — era el ejemplo del diseño el que estaba mal, no la implementación.
- **Bug real descubierto y corregido durante los tests, no anticipado en el diseño**: la opción `"Tarjeta D. Supe Geek "` (con espacio final) del select de Shipping Pagos nunca habría pasado la validación de cuenta origen, ni en cliente ni en servidor, por comparar un valor recortado contra una lista sin recortar — ver §1.5 arriba para el detalle y la corrección.
- Ninguna otra desviación de fondo. Las 4 correcciones del dueño se implementaron tal como se aprobaron.

---

## 4. Lo que falta y quién lo hace

- **Merge de `fase-20-5-tarjetas-credito` a `main` y deploy** — con el dueño, después de revisar el código y este documento.
- **Checklist de esquema** (`docs/DISENO_FASE20_5_TARJETAS.md` §7): 3 campos nuevos vía API (`TC Día de Corte`/`TC Día de Pago`/`TC Cupo`) — pendiente de ejecutar contra la base real; 2 opciones de select manuales del dueño (`Tarjeta de Crédito` en `Tipo de Cuenta`, `Pago Tarjeta de Crédito` en `Categoría`); alta de cada tarjeta como registro de `Cuentas Financieras` según la mini-guía del diseño (§7).
- **Verificación visual/interactiva en navegador** — no se completó en esta rama (mismo motivo que fases anteriores: requiere una sesión autenticada real). Probar la sección de tarjetas en `/finanzas`, el banner de alerta, el modal "Transferencia entre cuentas" pagando una tarjeta, el movimiento manual con tarjeta, y el formulario de pago de Shipping con las 4 tarjetas visibles — queda para cuando el dueño lo revise en vivo, después de ejecutar el checklist de esquema (sin los campos/opciones nuevos en Airtable, las tarjetas no pueden darse de alta todavía).
- **Fases siguientes** (fuera de alcance de 20.5, explícitamente): intereses, diferidos/cuotas, doble moneda, conciliación automática contra el banco — el mecanismo oficial para diferencias reales del estado de cuenta sigue siendo el movimiento manual/ajuste ya existente.

**Detenido aquí, tal como se pidió — sin merge, sin deploy.**
