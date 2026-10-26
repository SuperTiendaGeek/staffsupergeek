# Notas de crédito: reversa contable y caducidad del saldo

**Estado:** diseño aprobado por Alex el 14 de agosto de 2026. Pendiente de construir.
**Bloqueado por:** los campos de Airtable de la sección 3 — la API no puede crearlos.

---

## 1 · El problema

Hoy una nota de crédito **no toca Finanzas**. Es deliberado y está escrito en
`lib/facturacion/notaCredito/types.ts`:

> Una NC NUNCA devuelve efectivo — solo genera un crédito/saldo interno que el
> cliente consume en una factura de reemplazo. Por eso la NC NO crea ningún
> egreso de caja al autorizarse.

Eso es correcto en cuanto a **caja**: no sale dinero. Pero el ingreso original
se queda registrado, y la **factura de reemplazo registra ingreso otra vez**. La
parte pagada con el crédito entra como forma de pago SRI `15` (Compensación de
deudas): `lib/finanzas/puentes/facturacion.ts` la crea sin cuenta destino, pero
la crea como movimiento de Ingreso.

```
Venta de $100                          Ingreso  +100
Cliente devuelve → nota de crédito             (nada)
Compra otra cosa usando el crédito     Ingreso  +100
                                       ─────────────
                                       ingresos  200
                                       dinero     100
```

Entró plata una vez y el libro dice dos.

---

## 2 · El modelo

Tres asientos, uno por cada momento de la vida del crédito.

| Momento | Movimiento | Categoría | Cuenta |
|---|---|---|---|
| Se autoriza la NC | **Egreso** por el total | `Devolución` | ninguna |
| Se emite la factura de reemplazo | Ingreso *(ya existe)* | Venta Mostrador / Producto | según forma de pago |
| El crédito caduca sin usarse | **Ingreso** por el saldo | `Crédito Caducado` | ninguna |

**Ninguno de los dos asientos nuevos mueve caja.** Van sin cuenta, igual que ya
hace hoy el componente "Compensación de deudas". Son asientos contables, no
flujos de dinero.

### Cómo cuadra

| Situación | Original | NC | Después | Neto | Dinero real |
|---|---|---|---|---|---|
| Devuelve y compra otra cosa | +100 | −100 | +100 | **100** | 100 ✓ |
| Devuelve y el crédito caduca | +100 | −100 | +100 | **100** | 100 ✓ |
| Devuelve y el crédito sigue vivo | +100 | −100 | — | **0** | 100, pero debes mercadería ✓ |

El tercer caso es el que más se malinterpreta y es el que está bien: mientras el
crédito esté vigente ese dinero **no es tuyo**, es una deuda con el cliente. Que
el neto dé cero es lo correcto.

### Cuándo caduca

Seis meses desde la **fecha de autorización** de la nota de crédito. Decisión de
Alex, julio de 2026.

> No confundir con los plazos del SRI. La resolución NAC-DGERCGC25-00000017
> eliminó el tope de 12 meses para emitir una nota de crédito. Estos 6 meses son
> una regla comercial de SUPER GEEK sobre el crédito interno, no una regla
> fiscal.

---

## 3 · Campos que hay que crear a mano en Airtable

**La API de Airtable no puede crear campos.** Sin esto no se puede construir nada.

### Tabla `Movimientos`

| Campo | Tipo | Detalle |
|---|---|---|
| `Categoría` | *(ya existe)* | **Añadir la opción** `Crédito Caducado` |
| `Nota de Crédito` | Link → `Notas de Crédito Electrónicas` | Permitir un solo registro |

> El campo `Categoría` ya tiene la opción `Devolución`, así que para la reversa
> no hay que añadir nada.

### Tabla `Notas de Crédito Electrónicas`

| Campo | Tipo | Detalle |
|---|---|---|
| `Fecha de Caducidad` | Date | Sin hora. Lo escribe el sistema al autorizar |
| `Estado Crédito` | Single select | Opciones, en este orden: `Vigente`, `Consumido`, `Caducado` |
| `Movimiento Reversa` | Link → `Movimientos` | Un solo registro. Trazabilidad del asiento de reversa |
| `Movimiento Caducidad` | Link → `Movimientos` | Un solo registro. Trazabilidad del asiento de caducidad |

**Ojo con los campos de enlace:** son bidireccionales. Al crear `Nota de Crédito`
en Movimientos, Airtable crea el inverso en la otra tabla. Los dos campos
`Movimiento Reversa` y `Movimiento Caducidad` hay que crearlos aparte, porque
son enlaces distintos con significados distintos.

---

## 4 · Plan de construcción

### PR1 · La NC revierte el ingreso

`lib/finanzas/puentes/notaCredito.ts`, nuevo. Mismo patrón que el puente de
facturación que ya existe.

- Corre **después** de que la NC quede AUTORIZADA, nunca dentro de la emisión
- **Guardián de ambiente:** solo en producción (`"2"`), fail-closed — mismo
  criterio que `postEmision` y que el puente de facturación
- **Idempotente:** si `Movimiento Reversa` ya tiene un enlace, no hace nada. Un
  reintento no puede duplicar el asiento
- **Nunca lanza:** un fallo aquí no puede alterar una NC ya autorizada ante el
  SRI. Deja rastro en el log y en un campo de error
- Escribe `Fecha de Caducidad` (autorización + 6 meses) y `Estado Crédito` = `Vigente`

### PR2 · Caducidad

`lib/facturacion/notaCredito/caducidad.ts` — reglas puras, sin red:

- `fechaDeCaducidad(fechaAutorizacion)` → +6 meses
- `estaCaducada(nc, hoy)` → considera saldo, estado y fecha
- `estadoCredito(nc, hoy)` → `Vigente` | `Consumido` | `Caducado`

`POST /api/facturacion/nota-credito/caducidades` — procesa las vencidas:

- Lee las NC con `Estado Crédito` = `Vigente` y `Fecha de Caducidad` pasada
- Por cada una: crea el Ingreso `Crédito Caducado` por el **saldo disponible**,
  deja `Saldo Disponible` en 0, `Estado Crédito` = `Caducado` y enlaza
  `Movimiento Caducidad`
- **Idempotente:** si ya tiene `Movimiento Caducidad`, la salta
- Guardián de ambiente producción

Un botón **"Procesar caducidades"** en `/facturacion/nota-credito/historial`.
Sin cron por ahora: hoy tienes una sola nota de crédito en toda la historia del
negocio, y un botón que se pulsa al cerrar el mes es menos maquinaria que
mantener. Si el volumen crece, el endpoint ya está listo para colgarlo de un
cron de Vercel sin tocar nada más.

### Fuera de alcance, anotado

- **Las NC ya emitidas antes de este cambio** no tienen asiento de reversa. Hoy
  hay una sola (la del sistema viejo, `001-002-000000001`) y es anterior al
  portal. No se toca nada retroactivo.
- Desde el listado de notas de crédito no se puede crear una nueva; hay que
  entrar por el detalle de la factura. Es un hueco de la interfaz, aparte de esto.

---

## 5 · Qué revisar con el contador

1. Que la reversa vaya como **Egreso / `Devolución` sin cuenta** y no como un
   ingreso negativo.
2. Que el crédito caducado sea **ingreso del período en que caduca**, no del
   período de la venta original.
3. Si quiere una cuenta contable específica para `Crédito Caducado` en vez de
   dejarlo sin cuenta.

---

## 6 · Destino "Reembolso" (26 de octubre de 2026)

**Por qué:** un cliente devolvió una laptop con falla (LAP-000120, factura
001-002-000000793) y quería su dinero, no un crédito. Con solo "Cambio de
equipo" y "Saldo a favor", la nota de crédito dejaba $420 vigentes a favor del
cliente durante seis meses aunque ya se le hubiera devuelto el dinero.

### Ante el SRI no cambia nada

El destino **no viaja en el XML**. La nota de crédito que se firma y se envía
es idéntica con los tres destinos: `construirNotaCreditoXml()` no recibe ni el
destino ni los datos del reembolso, y `NotaCreditoInput` no tiene dónde
ponerlos (lo comprueba `__tests__/notaCredito.reembolso.test.ts`). La NC sigue
siendo una devolución con su factura modificada, su base y su IVA; el IVA de lo
devuelto se descuenta en la declaración del mes igual que con cualquier otra NC.

### Qué cambia en Finanzas

| Destino | Asiento al autorizar | Crédito |
|---|---|---|
| Cambio de equipo / Saldo a favor | Egreso `Devolución` **sin cuenta** | `Vigente`, caduca a los 6 meses |
| Reembolso | Egreso `Devolución` **desde la cuenta elegida**, con método y referencia | `Consumido`, saldo 0, sin caducidad |

Un solo asiento revierte el ingreso de la venta y saca el dinero de la caja.
Es el mismo criterio que ya usaba la anulación de un recibo interno.

### Reglas

- Solo lo puede elegir quien tiene acceso a **Finanzas** (mueve dinero). Se
  comprueba en la pantalla y otra vez en el servidor.
- No sale de cuentas de **Tránsito** ni de **Tarjeta de Crédito**, ni de una
  inactiva. Transferencia, depósito, DeUna y PayPal exigen la referencia.
- La cuenta se valida **antes** de enviar nada al SRI.
- La NC nace con `Saldo Disponible` = 0. Si el asiento fallara, el cliente no
  queda con un crédito que además se le pagó; la pantalla avisa que hay que
  revisar Finanzas antes de registrar un egreso a mano. Los datos del reembolso quedan en `Líneas JSON`
  (clave `reembolso`) como constancia.
- Idempotente como el resto del puente: con `Movimiento Reversa` ya enlazado no
  vuelve a sacar dinero. Si se creó el egreso pero falló el enlace con la NC,
  el reintento recupera el egreso existente por su vínculo a la nota y solo
  completa el enlace y el cierre del crédito. La pantalla identifica este
  fallo parcial y no indica registrar otro egreso.

### Código

- `lib/facturacion/notaCredito/reembolso.ts` — reglas puras.
- `lib/finanzas/puentes/notaCredito.ts` — rama del reembolso.
- `lib/facturacion/notaCredito/airtable.ts` — `marcarReembolsoContable()`.
- `app/api/facturacion/nota-credito/emitir` y `prefactura`, `components/facturacion/NotaCreditoForm.tsx`.
