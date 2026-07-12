# Resultado — Fase 20.2: Ingresos (Etapa B)

> Rama: `fase-20-2-ingresos`. Diseño aprobado en `docs/DISENO_FASE20_2_INGRESOS.md`, con las 3 correcciones del dueño integradas antes de empezar a construir. Etapa B ejecutada directo, sin pausa intermedia, tal como se pidió: *"proceder DIRECTO a la Etapa B sin esperar otra revisión"*. **Sin merge a `main`. Sin deploy.** Detenido aquí, tal como se pidió.

---

## 1. Qué se construyó

### 1.1 Puente 1 — Abonos → Movimientos (`lib/finanzas/puentes/abonos.ts`, nuevo)

- `crearMovimientoParaAbono(input)` — única función compartida por los dos escritores de Abonos del portal. Lee el propio registro del Abono recién creado (`Aplicado a: Operación`/`Aplicado a: Orden`) como fuente única de verdad — el caller no necesita pasar esos ids por separado. Resuelve Cliente y una referencia legible al origen (Corrección 3), mapea `Método de Pago` → Cuenta Destino/Estado (§1.4 del diseño), y llama a `crearMovimiento()` con `categoria: "Anticipo Cliente"`, `estadoDistribucion: "Sin distribuir"`. Guard de idempotencia: si el Abono ya trae `Movimiento Financiero` vinculado, no crea uno nuevo — devuelve el existente. **Nunca lanza** — cualquier error (Abono inexistente, POST a Airtable fallido) se loguea con `console.error` y devuelve `{ ok: false, error }`, para que el registro primario del Abono jamás se vea afectado por un fallo de este puente.
- `anularMovimientoDeAbono(abonoId)` — anula el movimiento vinculado al abono (nunca crea un reverso duplicado, reutiliza `anularMovimiento()` de 20.1). Corrección 1: si el movimiento ya estaba vinculado a una Factura Electrónica, la anulación **procede igual**, pero devuelve un `warning` explícito con el número de factura afectada y lo deja logueado (`console.warn`) para revisión — nunca bloquea.
- `listarAbonosSinMovimiento(desde)` — soporte de reparación manual (§4.1 del diseño): abonos con `Método de Pago` lleno pero sin `Movimiento Financiero` vinculado.
- Enganchado en los 2 escritores reales de Abonos:
  - `app/api/operaciones/[id]/abonos/route.ts` — tras `crearAbono()` y la subida del comprobante.
  - `app/api/tecnicos/ordenes/[id]/abonos/route.ts` — tras `createAbonoPorOrden()`.
  - `app/api/tecnicos/abonos-por-orden/[id]/route.ts` (DELETE) — llama a `anularMovimientoDeAbono()` e incluye el `warning` en la respuesta.
  - En los tres, la respuesta ahora incluye `warning` (puede ser `null`) — el registro primario del abono nunca se bloquea por el puente.

### 1.2 Puente 2 — Facturación → Movimientos (`lib/finanzas/puentes/facturacion.ts`, nuevo)

- `procesarPuenteFacturacion(resultado, body, registradoPor)` — se activa solo si la factura quedó `AUTORIZADO` por el SRI **y** el ambiente es Producción (`ambiente === "2"`); en Pruebas no crea ningún movimiento (verificado en el test 20-2.3).
- **Caso (a) — mostrador puro** (`body.origen` vacío): un movimiento de `Categoría: "Venta Mostrador"` por cada componente de `body.pagos`, usando el mapeo forma de pago SRI → Cuenta Destino/Estado (§2.4 del diseño).
- **Caso (b) — con origen** (Orden u Operación, anti doble conteo): para cada abono vigente de la cuenta unificada (`getCuentaUnificada()`), localiza su movimiento ya existente (creado por el Puente 1) y lo **actualiza** — nunca lo duplica — vía `actualizarMovimiento()`, vinculándolo a la Factura Electrónica y pasándolo a `Estado Distribución: "Pendiente de clasificar"`. Solo el remanente sin cubrir por abonos (`origenPago: "saldo"` en `body.pagos`) genera un movimiento nuevo, con `Categoría: "Servicio Reparación"` (Orden) o `"Venta Producto"` (Operación).
- Nunca lanza — cualquier error se loguea (`console.error`) y no interrumpe la respuesta de la factura ya emitida (misma política que el Puente 1).
- Enganchado en los dos puntos reales de emisión: `app/api/facturacion/emitir/route.ts` (tras el `postEmision()` existente) y `app/api/facturacion/historial/[recordId]/reintentar/route.ts`.

### 1.3 `actualizarMovimiento()` (`lib/finanzas/movimientos.ts`)

Función deliberadamente angosta — la única forma en que Facturación puede tocar un movimiento que no creó ella misma. Nunca toca `Monto`/`Cuentas`/`Tipo`/`Categoría`. Solo permite:
- Vincular una Factura Electrónica, si el movimiento aún no tiene ninguna otra vinculada (rechaza reasignar — protección anti doble-facturación).
- La transición `estadoDistribucion: "Sin distribuir"` → `"Pendiente de clasificar"`, una sola vez.
- Rechaza tocar un movimiento ya `Anulado`.

### 1.4 `/finanzas` — "por acreditar" en cuentas de Tránsito (Corrección 2, único cambio de pantalla de esta fase)

- `calcularPorAcreditarCuenta(cuentaId)` (`lib/finanzas/saldos.ts`) — suma los movimientos en estado `Pendiente` de la cuenta (sin tocar `Saldo Inicial`, sin filtrar por `Estado Distribución`). Reutiliza el mismo fetch generalizado (`fetchMovimientosDeCuentaPorEstado`) que ahora también usa `calcularSaldoCuenta`/`calcularSaldoRubroCuenta` — no-regresión verificada en el test 20-2.11.
- `app/finanzas/page.tsx` y `app/api/finanzas/saldos/route.ts` — cada cuenta `tipo === "Tránsito"` muestra una segunda línea "$X por acreditar" bajo su tarjeta de saldo.

### 1.5 Reparación manual y editor de pago mixto

- `app/api/finanzas/reparar-abono/[id]/route.ts` (nuevo, admin-only) — re-invoca `crearMovimientoParaAbono()` para un abono que perdió su movimiento por un fallo puntual del puente.
- `components/facturacion/FacturacionForm.tsx` — toggle "Pago mixto"/"Un solo pago", visible solo en mostrador puro (`!origen`), reutilizando `FormasPagoEditor` sin cambios.

### 1.6 Fix de un bug preexistente (encontrado durante el diseño, no introducido por esta fase)

`app/api/facturacion/historial/[recordId]/reintentar/route.ts` hacía `JSON.parse(factura.lineasJson) as DetalleFactura[]`, tratando el objeto envoltorio (`{ detalles, pagos, origen }`) como si fuera directamente el array de detalles, y reenviaba siempre `formaPago: "01"` fijo sin importar la forma de pago real original. Corregido: el reintento ahora valida `parsed.detalles` como el array real, reconstruye `pagos`/`origen` del payload guardado, y dispara `procesarPuenteFacturacion()` igual que la emisión normal — un reintento exitoso también genera sus movimientos financieros. `lib/facturacion/emitirFactura.ts` ahora guarda el array `pagos` completo en `Líneas JSON` (se conserva `formaPago` del primer pago para compatibilidad con lectores viejos, sin quitarlo).

### 1.7 Checklist de esquema ejecutado

Los 2 renombres de campo previstos en §1.6 del diseño, vía API en Manual mode:
1. `Abonos`: `"Shipping Finanzas Movimientos"` (nombre por defecto que Airtable le dio al campo inverso del link `Abono` en 20.1) → **`"Movimiento Financiero"`**.
2. `Facturas Electrónicas`: `"Shipping Finanzas Movimientos"` → **`"Movimientos Financieros (Facturación)"`**.

Nada más nuevo en el esquema — categorías, `Estado Distribución`, y las opciones de `Origen` (`Abonos`, `Facturación`) ya existían desde el checklist de la Fase 20.1.

---

## 2. Tests — `lib/finanzas/__tests__/`

Los 12 tests de §7 del diseño, más toda la suite de 20.1 (excepto el test en vivo contra datos reales) — **22 archivos, todos en verde**, ninguno toca la red real salvo el que se omite a propósito:

| # | Archivo | Verifica |
|---|---|---|
| 20-2.1 | `idempotencia-abono.test.ts` | Llamar `crearMovimientoParaAbono` dos veces para el mismo abono no duplica — devuelve el mismo `movimientoId`. |
| 20-2.2 | `mixto-mostrador-suma-exacta.test.ts` | Pago mixto de mostrador crea un movimiento por componente; la suma iguala el total de la factura. |
| 20-2.3 | `ambiente-pruebas-ignorado.test.ts` | Ambiente Pruebas (y ambiente indefinido) no crean ningún movimiento; ambiente Producción sí (control positivo). |
| 20-2.4 | `anticipo-facturado-excluye-indicador.test.ts` | Antes de facturar, el anticipo cuenta en el indicador; después de facturar (movimiento pasa a `Pendiente de clasificar`), ya no. |
| 20-2.5 | `anulacion-en-cascada.test.ts` | Anular un abono sin factura vinculada anula su movimiento sin duplicar, saldo vuelve exacto. |
| 20-2.6 | `fallo-puente-no-rompe-registro-primario.test.ts` | Abono inexistente y POST a Airtable fallido — el puente nunca lanza, siempre `{ok:false}`. |
| 20-2.7 | `reintento-conserva-forma-pago.test.ts` | El bug preexistente del reintento (§1.6) ya no está; el reemplazo lee `pagos`/`origen` reales y dispara el puente. |
| 20-2.8 | `caso-borde-saldo-factura-con-origen.test.ts` | Dos abonos ($50+$30) + saldo ($20) sobre una Operación real (`getCuentaUnificada()` sin mocks) → exactamente 3 movimientos: 2 actualizados, 1 nuevo por el remanente exacto. |
| 20-2.9 | `actualizarMovimiento-limites.test.ts` | Transición permitida una sola vez; reasignar a otra factura rechazado; tocar un movimiento `Anulado` rechazado; monto inmutable. |
| 20-2.10 | `anulacion-abono-facturado.test.ts` | Corrección 1 — anular un abono ya facturado procede, devuelve `warning` con el número de factura, y loguea. |
| 20-2.11 | `calcularPorAcreditarCuenta-no-regresion.test.ts` | Cuenta con movimientos `Pendiente`+`Confirmado` mezclados: "por acreditar" solo suma los `Pendiente`; `calcularSaldoCuenta` de la misma cuenta no cambió tras generalizar el fetch (no-regresión del test #4 de 20.1). |
| 20-2.12 | `observacion-referencia-legible.test.ts` | Corrección 3 — Observación con "Abono sobre Orden #X" / "sobre Operación #Y" / combinación de ambas; con observación propia del abono, se antepone sin perderla. |

Comando para correr toda la suite (20.1 + 20.2, sin el test en vivo):

```bash
for f in lib/finanzas/__tests__/*.test.ts; do
  case "$f" in *.live.test.ts) continue ;; esac
  NODE_OPTIONS="--conditions react-server" npx tsx "$f"
done
```

`npm run typecheck` pasa limpio sobre todo el proyecto.

El doble en memoria de Airtable (`_airtableDouble.ts`) se extendió con un mapa genérico `otras` para simular cualquier tabla adicional (`Abonos`, `Facturas Electrónicas`, `Operación Comercial`, `Órdenes de Reparación`), y `sincronizarInversos()` ahora también sincroniza los 2 campos inversos nuevos de esta fase (`Movimiento Financiero` en Abonos, `Movimientos Financieros (Facturación)` en Facturas) — tanto al crear como al actualizar un movimiento, ya que `actualizarMovimiento()` usa `PATCH`.

---

## 3. Desviaciones del diseño original

Ninguna de fondo. Las 3 correcciones del dueño (anulación con warning explícito, "por acreditar" en Tránsito, Observación con referencia legible) quedaron integradas en el diseño antes de empezar a construir y se implementaron tal como se aprobaron — sin ajustes adicionales durante la Etapa B.

---

## 4. Lo que falta y quién lo hace

- **Merge de `fase-20-2-ingresos` a `main` y deploy** — con el dueño, después de revisar el código y este documento.
- **Verificación en producción tras el deploy** — abonar sobre una Orden/Operación real, facturarla, confirmar en `/finanzas` que el movimiento del abono se actualiza (no se duplica) y que "por acreditar" refleja los pendientes de Tarjetas en Tránsito. La Prueba de Fuego del diseño (§6, 5 eventos) es la referencia para esa verificación manual.
- **Reparación de abonos/facturas huérfanas anteriores al deploy**, si las hay — vía `listarAbonosSinMovimiento()` + `POST /api/finanzas/reparar-abono/[id]`, a discreción del dueño.
- **Fases siguientes** (fuera de alcance de 20.2): captura de costo/rubro por línea (20.3), UI de movimientos internos y acreditación manual de pendientes (20.4), cuadre de caja (20.5), egresos vinculados de Nómina/Repuestos/Licencias (20.6).

**Detenido aquí, tal como se pidió — sin merge, sin deploy.**
