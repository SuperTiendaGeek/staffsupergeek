# Reservas (Apartados) — Diseño, flujo del dinero y handoff

> Documento de respaldo de la funcionalidad de **Reservas** (apartados de
> mercadería con abonos). Cubre modelo de datos, reglas de negocio, flujo
> contable, arquitectura, el campo de Airtable requerido y los pendientes.
> Última actualización: 2026-07-27. En producción desde el commit `bfcff85`.

---

## 1. Qué es una reserva

Una **reserva** (o *apartado*) es un documento **interno, no tributario**: el
cliente abona para **apartar un ítem del inventario** y lo va pagando en varios
abonos dentro de un plazo. Mientras la reserva está activa, el ítem queda
marcado como **Reservado** y fuera de venta.

Desenlaces posibles:

- **Se factura** (o se completa el pago y se factura): el ítem pasa a
  **Vendido** y se descuenta del inventario. La venta se registra recién en ese
  momento.
- **Vence sin completarse**: el empleado la **libera** manualmente; el ítem
  vuelve a **Disponible** y lo abonado queda como **saldo a favor** del cliente.
- **Se cancela** antes de vencer.

Regla rectora heredada de todo el módulo de facturación: **disciplina extra con
el dinero** — se registra el comportamiento observado, no se deduce. La reserva
no es un documento del SRI: sus efectos de apartado, abono y caja ocurren siempre
que se crea una reserva real en el portal, aunque `SRI_AMBIENTE` esté en pruebas.
El ambiente del SRI solo gobierna la emisión tributaria y sus efectos.

---

## 2. Modelo de datos

### 2.1 Tabla `Reservas` (base "SUPER GEEK ADM")

Se referencia **por nombre**. El cliente completo y los abonos viven en un JSON
(igual que el recibo guarda su cliente/líneas en "Líneas JSON").

| Campo | Tipo | Uso |
|---|---|---|
| `Número` | texto | Numeración `RES-000001` (por el máximo `Número`) |
| `Fecha` | date | Fecha de creación |
| `Estado` | single select | `Activa` · `Facturada` · `Liberada` · `Cancelada` |
| `Cliente` | link → Clientes | Vínculo real al cliente (siempre presente) |
| `Cliente Nombre` | texto | Denormalizado para listados/búsqueda |
| `Cliente Identificación` | texto | Denormalizado para búsqueda |
| `Shipping Item` | link → Shipping Items | Ítem apartado |
| `Descripción Item` | texto | Descripción congelada del ítem |
| `Precio` | moneda | Precio de venta **con IVA incluido** |
| `Total Abonado` | moneda | Suma de abonos (mantenido en cada abono) |
| `Fecha Límite` | date | Vencimiento (Fecha + Plazo Días) |
| `Plazo Días` | número | 7, 15 o 30 |
| `Abonos JSON` | texto largo | `{version, cliente, abonos[]}` — fuente de display |
| `Registrado Por` | texto | Usuario que la creó |
| `Saldo a Favor Generado` | moneda | Se llena al liberar una reserva vencida |
| `Factura` | link → Facturas Electrónicas | Se llena al facturar |
| `PDF` | attachment | Comprobante generado |
| `Abonos (Reserva)` | link inverso ← Abonos | Abonos centralizados de esta reserva |

### 2.2 Tabla `Abonos` — tercer origen

La tabla centralizada `Abonos` ya registraba abonos de **Operación Comercial** y
**Órdenes de Reparación**. Las reservas son ahora el **tercer origen**, mediante
un campo link creado a mano en Airtable:

- En `Abonos`: campo *Link to another record* → `Reservas`, nombrado
  **`Reservas`**.
- En `Reservas`: su inverso, nombrado **`Abonos (Reserva)`**.

> ⚠️ **El nombre importa.** El código escribe/lee exactamente estos nombres. Si
> se renombra el campo en Airtable, hay que actualizar en el código:
> `lib/facturacion/reservas/efectos.ts` (escritura, clave `"Reservas"`),
> `lib/finanzas/puentes/abonos.ts` (`ABONOS_FIELDS.aplicadoAReserva`) y
> `lib/finanzas/puentes/facturacion.ts` (`RESERVA_ABONOS_INVERSO = "Abonos (Reserva)"`).

Nota histórica: originalmente el código usaba `"Aplicado a: Reserva"` (para
seguir la convención de `Aplicado a: Operación` / `Aplicado a: Orden`), pero el
campo en la base quedó nombrado `Reservas`; se alineó el código a ese nombre
(commit `375c10b`).

### 2.3 Shipping Items

Campos que toca una reserva: `Estado Item` (Disponible/Reservado/Vendido),
`Disponible para venta` (bool), `Reservado` (bool), `Cantidad`.

---

## 3. Reglas de negocio (`lib/facturacion/reservas/reglas.ts`)

- **Abono mínimo**: `$20` si el precio del ítem es **superior a $50**; `$5` si es
  **$50 o menos**. (`UMBRAL_PRECIO = 50`, `ABONO_MIN_ALTO = 20`,
  `ABONO_MIN_BAJO = 5`.)
- **Plazos válidos**: `7`, `15` o `30` días (`PLAZOS_VALIDOS`). Campo
  seleccionable en la creación.
- **Fecha límite** = fecha de creación + plazo.
- **Vencida**: una reserva `Activa` cuyo `Fecha Límite` ya pasó. Se muestra en la
  bandeja de vencidas hasta que el empleado la libere.
- **Saldo pendiente** = precio − total abonado. **Pago completo** cuando el saldo
  llega a cero.
- **Validación de abono**: cada abono no puede exceder el saldo pendiente y el
  abono inicial debe alcanzar el mínimo.

Estados y transiciones:

```
          crear (abono inicial ≥ mínimo)
   ─────────────────────────────────────────►  Activa
                                                  │
        facturar ───────────────────────────────►│──► Facturada  (ítem Vendido, inventario −1)
        liberar (vencida) ───────────────────────►│──► Liberada   (ítem Disponible, saldo a favor)
        cancelar ────────────────────────────────►│──► Cancelada
```

---

## 4. Flujo del dinero (lo más sensible)

### 4.1 Al abonar

Cada abono de reserva (`registrarAbonoReserva` en `efectos.ts`):

1. Crea un registro en la tabla centralizada **`Abonos`**, ligado a la reserva
   por el campo `Reservas`: `ID Abono`, `Monto`, `Método de Pago` (mapeado),
   `Fecha de Abono`, `Estado del Abono = Registrado`, `Registrado Por`.
2. Dispara su **movimiento financiero** por el puente compartido
   `crearMovimientoParaAbono`, con categoría **`Anticipo Cliente`** (no "Venta
   Mostrador").

**Por qué "Anticipo Cliente" y no venta:** el depósito de una reserva es dinero
a cuenta; **todavía no es una venta** porque el ítem sigue siendo del negocio
(sigue en inventario, marcado como reservado). La venta se registra recién al
facturar. Es el mismo tratamiento que ya usan órdenes y operaciones, y es lo que
hace que la reconciliación al facturar funcione sin doble conteo.

El registro del abono ya **no depende de `SRI_AMBIENTE`**. Antes se omitía en
pruebas, pero eso dejaba dinero real fuera de Finanzas cuando el SRI seguía en
celcer. Si el puente falla, la reserva se conserva y la UI muestra una
advertencia para registrar el movimiento manualmente.

### 4.2 Al facturar (Fase 2)

Botón **Facturar** → `construirPreFacturaReserva` arma un `DatosVenta` con
`origen: {tipo:"reserva"}` (cliente + ítem como línea + pagos = abonos previos
con `origenPago:"abono"` + saldo con `origenPago:"saldo"`) → se emite por el
**endpoint compartido** `/api/facturacion/emitir`. Ese endpoint:

1. **Idempotencia**: `buscarFacturaBloqueante` lee el campo `Factura` de la
   reserva; si ya tiene una factura vigente, bloquea.
2. **Stock**: `verificarStockDisponible` — el ítem reservado tiene `Cantidad ≥ 1`,
   así que pasa.
3. **Emisión** al SRI.
4. **postEmisión**: descuenta el inventario y marca el ítem **Vendido** (a partir
   de la línea de producto con `shippingItemId`).
5. **Puente contable** (`procesarConOrigen`, rama reserva): lee los abonos
   vigentes por el inverso `Abonos (Reserva)`, **marca sus movimientos como
   facturados**, y crea ingreso nuevo **solo por el componente `saldo`**, con
   categoría **`Venta Producto`**.
6. **Cierre de la reserva**: marca `Estado = Facturada` y vincula la factura —
   **solo si `ambiente === "2"`** (nunca cerrar una reserva real con una factura
   de prueba).

**Anti doble conteo:** los abonos ya se contaron como Anticipo Cliente al
abonar; al facturar no se re-cobran, solo se marcan como facturados. El único
ingreso nuevo es el saldo. La venta total del ítem queda correctamente
representada entre el anticipo (reclasificado) y el saldo.

### 4.3 Mapeo de forma de pago → Método de Pago

El abono llega con el **código SRI** de forma de pago; la tabla `Abonos` usa un
single-select `Método de Pago` que decide la cuenta contable en el puente.

| Código SRI | Método en Abonos | Cuenta (vía puente) |
|---|---|---|
| 01 Efectivo | Efectivo | Caja Registradora |
| 16 / 18 / 19 Tarjetas | Tarjeta | Tarjetas en Tránsito |
| **17 Dinero electrónico** | **Otro** | sin cuenta → Alerta Descuadre |
| **20 Otros (sist. financiero)** | **Otro** | sin cuenta → Alerta Descuadre |
| **21 Endoso de títulos** | **Otro** | sin cuenta → Alerta Descuadre |
| 15 Compensación de deudas | Otro | sin cuenta → Alerta Descuadre |

> **`TODO(contadora)`** (anotado en `efectos.ts`): confirmar a qué cuenta deben
> mapear 17, 20 y 21 cuando lleguen a usarse en una reserva. Hoy caen a "Otro" a
> propósito — el puente los deja sin cuenta (Alerta Descuadre) para clasificación
> manual, en vez de adivinar. En la práctica el ~100% de los pagos reales son
> efectivo o tarjeta, que mapean directo.

---

## 5. Arquitectura y archivos clave

**Backend / lógica de reservas** (`lib/facturacion/reservas/`)
- `reglas.ts` — reglas puras (abono mínimo, plazos, vencimiento, saldos).
- `types.ts` — tipos (`ReservaEstado`, `AbonoReserva`, `ReservaCliente`, …).
- `airtable.ts` — persistencia (crear, obtener, listar, agregar abono, marcar
  liberada/facturada; numeración `RES-######`).
- `efectos.ts` — efectos reales de mostrador: `apartarItemParaReserva`,
  `liberarItem`, `registrarAbonoReserva` (Abonos + movimiento).
- `facturar.ts` — `construirPreFacturaReserva` (arma el `DatosVenta`).
- `pdf.ts` — comprobante PDF.

**Endpoints** (`app/api/facturacion/reservas/`)
- `route.ts` — GET listar · POST crear (con `resolverClienteDocumento`).
- `[id]/route.ts` — GET detalle.
- `[id]/abonos/route.ts` — POST abono adicional.
- `[id]/liberar/route.ts` — POST liberar → saldo a favor.
- `[id]/prefactura/route.ts` — GET prefactura (DatosVenta listo para emitir).
- `[id]/pdf/route.ts` — regenera el PDF.

**Puentes contables** (`lib/finanzas/puentes/`)
- `abonos.ts` — tercer origen `Reservas`; resuelve cliente/referencia desde la
  reserva; movimiento como `Anticipo Cliente`.
- `facturacion.ts` — rama reserva en `procesarConOrigen` (marca abonos +
  saldo como `Venta Producto`).

**Gancho de emisión** (`lib/facturacion/`)
- `emitirFactura.ts` — `OrigenGancho` admite `"reserva"`.
- `gancho/airtableGancho.ts` — `fetchReserva`.
- `gancho/idempotencia.ts` — bloqueo por el campo `Factura` de la reserva.

**UI** (`components/facturacion/`)
- `ReservaForm.tsx` — creación (dentro de `NuevoDocumentoModal`).
- `ReservasPanel.tsx` — panel de gestión: listado, alertas de vencidas,
  detalle con abonar / imprimir / PDF / liberar / **Facturar** (modal).
- `print/TicketReserva.tsx` — dos tickets térmicos 80 mm (constancia cliente +
  etiqueta del ítem, con abonos y "conserve este ticket").
- Páginas: `app/facturacion/reservas/page.tsx`,
  `app/facturacion/imprimir/reserva/[recordId]/page.tsx`.

**Pruebas**
- `lib/facturacion/__tests__/reserva.reglas.test.ts` — pruebas puras de reglas
  (correr con `npx tsx`).

---

## 6. Guards y seguridad

- **Ambiente**: apartar/liberar el ítem y registrar abonos de reserva en Abonos
  + Finanzas **no dependen de `SRI_AMBIENTE`**. Son movimientos reales de
  mostrador. El guard de ambiente sigue aplicando a la factura electrónica, al
  descuento de inventario de la venta y al cierre tributario de la reserva.
- **Idempotencia**: una reserva ya facturada (con `Factura` vinculada) no se
  puede volver a facturar; `construirPreFacturaReserva` además exige estado
  `Activa`.
- **Best-effort**: el registro del abono en Abonos y su movimiento nunca
  bloquean la creación/registro de la reserva (se loguean si fallan). La reserva
  es la fuente primaria; Abonos es el respaldo contable centralizado.
- **Lectura segura de Airtable**: nunca se filtra por campo link — se lee el
  inverso presente en el registro y se hace fetch por `RECORD_ID()`.

---

## 7. Pendientes y trabajo futuro

- **Verificación en producción** (primer uso real): crear reserva + abono →
  confirmar que aparece en `Abonos` como `Anticipo Cliente` con su movimiento;
  facturar → confirmar que marca los abonos facturados y cobra solo el saldo.
- **`TODO(contadora)`**: mapeo contable de las formas de pago 17 / 20 / 21 (ver
  §4.3).
- **Diferido**: reclasificación contable del **saldo a favor** de reservas
  liberadas (pendiente de validar con la contadora).
- **Fase 3** (futuro): **consumir** el saldo a favor de reservas vencidas en
  compras posteriores del cliente.
- **Decisión abierta de UI**: eventualmente retirar la pantalla `Historial` y
  llevar sus funciones únicas (reporte por rango de fechas + total, reintentar
  facturas atascadas en el SRI, reintentar sincronización de inventario) a la
  pantalla principal `/facturacion`. Por ahora se conserva, enlazada desde
  Facturas.

---

## 8. Bitácora de commits (rama `feat/facturacion-reservas` → `main`)

Fase 1 (sesiones previas): `fe3a5e3` reglas+tipos · `3d17cdf` backend ·
`55732f2` PDF + 2 tickets · `25db9b4` abonos en etiqueta del ítem ·
`3e538c7` UI · `26e4576` resolver/vincular cliente · `d027677` gobernanza de
datos del cliente.

Tarjeta de cliente unificada: `996ff39` → `652aa54`.

Esta iteración: `a729525` centralizar abonos en tabla Abonos · `277938f`
facturar una reserva (Fase 2) · `375c10b` fix nombre de campo (`Reservas`) ·
`bfcff85` navegación Facturas/Historial + gestión de borrador en el modal.

Desplegado a producción (Vercel) en `bfcff85`, merge fast-forward
`6ce032d..bfcff85`.
