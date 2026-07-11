# Auditoría de solo lectura — Fase 20: Libro Central de Movimientos Financieros

> Fecha de auditoría: 2026-07-10 — **SOLO LECTURA**. No se modificó, creó ni borró ningún registro, campo, tabla ni línea de código. No hay commits asociados a esta auditoría.
> Método: lectura de esquema (Airtable Metadata API, solo lectura), lectura de datos reales (Airtable REST API, solo `GET`, sin filtrar nunca por campo de link — siempre vía RECORD_ID()/fetch por ids), y lectura de código fuente del repo. Los datos se consultaron en vivo el 2026-07-10; los conteos y ejemplos reflejan ese momento.
> Base: "SUPER GEEK ADM" (única base, confirmado — todas las tablas citadas viven ahí).

---

## Nota metodológica importante (léela antes que A)

El snapshot cacheado `docs/sgadm-schema.json` (generado 2026-07-01) está **desactualizado** y no se usó como fuente de verdad: en él todavía existen las tablas `Cotizaciones`, `Abonos de Cotización` y `Opciones de Cotización`, que **ya no existen** en el esquema vivo de Airtable consultado hoy. Fueron reemplazadas por una fusión (documentada en `docs/esquema-comercial-fuente.md` y ejecutada después del 2026-06-28) en 3 tablas nuevas: `Operación Comercial`, `Abonos`, `Opciones`. Toda esta auditoría usa el esquema vivo (consultado hoy vía Metadata API), no el snapshot cacheado.

---

## PARTE A — Auditoría de "Shipping Finanzas Movimientos"

### A.1 Esquema completo

Tabla `tbla8HwlJLOX86fQJ`, 21 campos:

| Campo | Tipo | Detalle |
|---|---|---|
| `Movimiento Shipping ID` | singleLineText | Campo primario. Formato `SFM-YYYYMMDD-#####` |
| `Origen` | singleSelect | Opciones: `Shipping` (única opción existente) |
| `Tipo de movimiento` | singleSelect | Opciones: `Egreso`, `Ingreso`, `Ajuste`, `No aplica` |
| `Estado de integración` | singleSelect | Opciones: `No aplica`, `Pendiente de generar`, `Pendiente de sincronizar`, `Sincronizado`, `Error`, `Anulado` |
| `Pago Shipping relacionado` | link → `Shipping Pagos` | Inverso: `Shipping Finanzas Movimientos` en Shipping Pagos |
| `Proveedor` | link → `Shipping Proveedores` | Inverso: `fldZqja4TmWs8Nnla` |
| `Monto` | currency | — |
| `Fecha del movimiento` | dateTime | — |
| `Método` | singleSelect | Opciones: `Transferencia bancaria`, `PayPal`, `Efectivo`, `Tarjeta`, `Depósito`, `Otro`, `No aplica` |
| `Cuenta origen` | singleSelect | Opciones: `Banco Pichincha`, `Caja`, `PayPal`, `Tarjeta`, `Otra`, `No aplica` |
| `Transacción ID` | singleLineText | — |
| `Comprobante` | attachment | — |
| `Movimiento Finanzas ID futuro` | singleLineText | Ver A.4 — placeholder |
| `Error de sincronización` | multilineText | Ver A.4 — placeholder |
| `Fecha de sincronización` | dateTime | Ver A.4 — placeholder |
| `Observación` | multilineText | — |
| `Registrado por` | singleLineText | — |
| `Fecha de creación` | dateTime | — |
| `Fecha de anulación` | dateTime | — |
| `Motivo de anulación` | multilineText | — |
| `Shipping Eventos` | link → `Shipping Eventos` | — |

### A.2 Quién escribe en ella (evidencia de código)

Confirmado por exploración exhaustiva del repo (grep de "Shipping Finanzas Movimientos" / "finanzasMovimientos" en todo `lib/` y `app/`): **todo el código que toca esta tabla vive concentrado en `lib/shipping-v2/airtable.ts`**. Ningún otro módulo la referencia.

**Único punto de escritura — `createFinanceMovementForPago`, `lib/shipping-v2/airtable.ts:2652-2680`:**
- Función interna, no exportada, sin endpoint propio. Se invoca únicamente desde `markShippingV2PagoAsPaid` (línea 2720) — es decir, **al marcar un Shipping Pago como "Pagado"**.
- Guard de idempotencia (línea 2653): si el pago ya tiene un movimiento vinculado, reutiliza ese id y no crea uno nuevo.
- Es un `POST` puro (línea 2673) — la tabla es **append-only** desde el código actual; no existe ningún `PATCH` posterior a un movimiento ya creado (salvo, indirectamente, cuando se anula el Pago — ver A.3/B.3, que tampoco toca el movimiento).
- Campos que llena: `Movimiento Shipping ID` (autogenerado), `Origen` = `"Shipping"` (constante fija), **`Tipo de movimiento` = `"Egreso"` (constante fija, hardcodeado — nunca se escribe `"Ingreso"` ni `"Ajuste"` desde ningún punto del repo)**, `Estado de integración` = `"Pendiente de sincronizar"` (constante fija), `Pago Shipping relacionado` = `[pago.id]`, `Proveedor` (del pago), `Monto` = `pago.totalAPagar`, `Fecha del movimiento`, `Método`, `Cuenta origen`, `Transacción ID`, `Comprobante`, `Observación`, `Registrado por`, `Fecha de creación`.
- **100% automático**: no existe ningún endpoint para crear un movimiento manualmente ni de forma independiente a un Shipping Pago.
- Tampoco existe ninguna función exportada de **lectura/listado** de esta tabla: `mapFinanzasMovimiento` (`lib/shipping-v2/airtable.ts:1234-1257`) existe pero nunca se invoca en ningún otro punto del repo. La tabla es, en la práctica, *write-only* desde el portal — nadie la lista ni la muestra; lo único visible en la UI es el id del movimiento vinculado, leído del propio registro de Pago (`app/shipping-v2/pagos/ShippingV2PagosClient.tsx:87-88,140,247,486,682`).

### A.3 Estado de los datos (verificado en vivo, 2026-07-10)

- **11 registros** en total.
- **Rango de fechas** (`Fecha del movimiento`): 2026-06-10 → 2026-07-08.
- **Distribución `Tipo de movimiento`**: `Egreso` 11/11 (100%). Nunca se ha escrito `Ingreso`, `Ajuste` ni `No aplica` — son opciones de esquema sin ningún emisor de código.
- **Distribución `Origen`**: `Shipping` 11/11 (100%) — coherente con que es el único módulo que escribe aquí.
- **Distribución `Estado de integración`**: `Pendiente de sincronizar` 11/11 (100%). **Ningún registro ha pasado nunca a `Sincronizado`, `Error` ni `Anulado`** — confirma que no existe ningún proceso (ni manual ni automático) que avance este campo más allá del valor inicial.
- **Distribución `Método`**: Tarjeta 8, Efectivo 1, Transferencia bancaria 1, PayPal 1.
- **Distribución `Cuenta origen`**: Caja 9, PayPal 2.
- **Suma `Monto`**: **$6,382.04** (todo egreso).
- **¿Hay registros anulados?** No hay ninguno con `Estado de integración = "Anulado"` hoy, pero el campo existe y el flujo de anulación de un Shipping Pago (ver B.3) **no toca este campo ni crea ningún movimiento compensatorio** — si se anulara un Pago con movimiento asociado (cosa que el código bloquea, ver B.3), el movimiento original quedaría igualmente en `"Pendiente de sincronizar"`, sin ningún rastro de que su Pago fue anulado.

### A.4 Campos de integración futura — verificación exhaustiva

`Movimiento Finanzas ID futuro`, `Error de sincronización`, `Fecha de sincronización`: **placeholders puros, sin código que los toque**, ni en `createFinanceMovementForPago` (no aparecen en el `POST`), ni en `mapFinanzasMovimiento` (no los lee), ni en ningún otro archivo del repo (grep exhaustivo → 0 coincidencias funcionales). Consistente con esto, `app/finanzas/page.tsx` es literalmente una página vacía ("El módulo de Finanzas está listo para recibir sus primeras pantallas funcionales"). Conclusión: existen en el esquema pensando en una futura sincronización con un libro central real, pero esa sincronización **no está implementada**.

**Hallazgo adicional (menor):** el campo `Total pagado` de `Shipping Pagos` (ver B.3) tampoco lo escribe nunca el código — se queda permanentemente en 0/vacío aunque el pago esté marcado `"Pagado"` (confirmado: suma de `Total pagado` sobre los 11 pagos = **$0**, mientras que la suma real pagada, vía `Monto` de Finanzas Movimientos, es $6,382.04). Cualquier persona viendo ese campo en Airtable pensaría, erróneamente, que no se ha pagado nada.

---

## PARTE B — Inventario de fuentes de dinero

### B1. Abonos de clientes

**Confirmación de la tabla única real:** hoy (2026-07-10) existe **una sola tabla activa de abonos: `Abonos`** (`tbli03YnDxVsrnmZK`, 17 campos). La antigua `Abonos de Cotización` **ya no existe** en el esquema vivo — fue fusionada dentro de `Abonos` durante la migración Operación Comercial/Abonos/Opciones. La tabla `Abonos por Orden` (`tblc9MCGvzcjcg6ki`, 14 campos) **sigue existiendo en Airtable con 128 registros vivos, pero está muerta en código**: `lib/tecnicos/config/airtable.ts:13` declara la constante `abonosPorOrden: "Abonos por Orden"` con el comentario explícito `// legacy, no se escribe más desde técnicos`, y ningún código actual la usa como tabla destino de ninguna llamada Airtable (confirmado por el agente de exploración recorriendo todos los call-sites). Las funciones con nombre "…PorOrden" (`fetchAbonosPorOrden`, `createAbonoPorOrden`, `anularAbonoPorOrden`, en `lib/tecnicos/airtable/index.ts`) operan todas sobre la tabla `Abonos`, no sobre `Abonos por Orden` — el nombre es legado de la época en que sí eran tablas separadas.

**Verificación cruzada con datos reales — la migración fue un evento único, no doble escritura activa:** de los 138 registros hoy en `Abonos`, 132 tienen el campo `_old_record_id` poblado; de esos, **los 128 apuntan a un id que sigue existiendo como registro vivo en `Abonos por Orden`** — es decir, **el 100% de `Abonos por Orden` (128/128, $6,349 en total) está duplicado dentro de `Abonos`**. La distribución de `createdTime` lo confirma: 132 de los 138 registros de `Abonos` fueron creados el mismo día, 2026-06-30 (el evento de migración masiva), mientras que `Abonos por Orden` no tiene ningún registro creado después del 2026-06-29 (el día antes de la migración). Los 6 registros de `Abonos` sin `_old_record_id` (creados entre 07-04 y 07-10) son abonos genuinamente nuevos, ya sobre la tabla unificada. **Riesgo directo para el libro central de Fase 20: si el diseño del libro sumara "todas las tablas de abonos que existan en Airtable" en vez de una sola tabla `Abonos` canónica, contaría dos veces los $6,349 que hoy están duplicados.** `Abonos por Orden` debería tratarse como tabla archivada/histórica, nunca como fuente activa.

**Escritores de `Abonos` (evidencia de código):**
- `crearAbono()`, `lib/operaciones/airtable.ts:388` — invocado desde `POST /api/operaciones/[id]/abonos`. Llena `ID Abono`, `Monto`, `Método de Pago`, `Fecha de Abono`, `Estado del Abono: "Registrado"`, `Registrado Por`, `Aplicado a: Operación` (siempre), `Aplicado a: Orden` (si aplica), `Número de Transacción`/`Observación` (opcionales).
- `createAbonoPorOrden()`, `lib/tecnicos/airtable/index.ts:2224` — invocado desde `POST /api/tecnicos/ordenes/[id]/abonos`. Mismos campos base, y resuelve automáticamente `Aplicado a: Operación` leyendo el inverso `"Operaciones Comerciales"` de la orden.

**Campos de integración financiera pedidos en el encargo (`Movimiento Financiero ID`, `Cuenta Destino`, `Estado Financiero`, `Fecha/Error Sincronización Finanzas`):** esos nombres de campo **no existen en la tabla `Abonos`** (solo existe `Cuenta Destino`, texto libre, sin ningún código que la valide contra un catálogo — valores reales hoy: `Banco Pichincha`, `Caja`). Los otros 4 nombres (`Movimiento Financiero ID`, `Estado Financiero`, `Fecha Sincronización Finanzas`, `Error Sincronización Finanzas`) sí existen, pero en **`Abonos por Orden`** (la tabla legacy) — y ahí tampoco los escribe ningún código vivo. Verificado en los datos: de los 128 registros de `Abonos por Orden`, **el campo `Estado Financiero` está vacío en el 100% de los casos** y **0 tienen `Movimiento Financiero ID` poblado** — es decir, incluso cuando esos campos existían en la tabla que sí se usaba antes de la migración, nunca llegaron a conectarse con nada. Son placeholders de un intento de integración que nunca se completó, igual que en Shipping Finanzas Movimientos (A.4).

**¿Un abono puede aplicarse a operación y orden a la vez?** Sí — `Abonos` tiene los dos campos de link (`Aplicado a: Operación`, `Aplicado a: Orden`) simultáneamente disponibles en el mismo registro, y `crearAbono()`/`createAbonoPorOrden()` pueden poblar ambos en la misma escritura cuando la orden tiene operación vinculada. Quedan registrados como dos links en el mismo registro de abono (no hay dos filas).

**Abonos anulados / devolución de dinero:** existe el estado `"Anulado"` (`Estado del Abono`), pero **anular solo cambia ese campo** (`anularAbonoPorOrden()`, `lib/tecnicos/airtable/index.ts:2889`, comentario explícito en el código: *"para conservar constancia, nunca se elimina"*) — no hay `DELETE` real, no hay ningún movimiento compensatorio, y **no existe ningún concepto de devolución de dinero en código** (grep de "devoluci"/"reembols" fuera de facturación SRI → sin resultados). Los rollups `Total Abonado NV`/`Total Abonado` ya excluyen anulados a nivel de fórmula Airtable, y el código confía en eso (`lib/cuenta-unificada/index.ts:314-316`) en vez de refiltrar en JS. Verificado en datos: 2 registros `Anulado` hoy — `recUFpElbgRciONg9` ($50, aplicado a Orden `recYhi7aObJEnSaEt`) y `recltUTUflYlCQHx5` ($1, aplicado a Operación `recwWxZspJcIJe6vF`).
**Nota:** `lib/operaciones/airtable.ts` no tiene ninguna función de anulación propia; el único endpoint de anulación (`DELETE /api/tecnicos/abonos-por-orden/[id]`, con verbo `DELETE` mantenido "para no romper el cliente" aunque internamente hace un `PATCH`) puede anular cualquier abono de la tabla compartida, sin importar si nació del lado operaciones o técnicos.

### B2. Facturas Electrónicas

**Esquema completo** (`tblcm85VnzJ1ZVhe5`, 25 campos hoy — el snapshot cacheado tenía solo 19, desactualizado): `Clave de Acceso`, `Número de Factura`, `Secuencial`, `Estado` (`PENDIENTE`/`RECIBIDA`/`DEVUELTA`/`AUTORIZADO`/`NO AUTORIZADO`/`BORRADOR`/`ANULADA`), `Número de Autorización`, `Fecha de Autorización`, `Fecha de Emisión`, `Ambiente` (`PRUEBAS`/`PRODUCCIÓN`), `Cliente - Nombre`, `Cliente - Identificación`, `Cliente - Correo`, `Subtotal`, `IVA`, `Total`, `XML Autorizado`, `RIDE PDF`, `Mensajes SRI`, `Estado Correo`, `Líneas JSON`, `Shipping Items` (link), `Orden` (link), `Operación` (link), `Cliente` (link), `Sincronización Inventario`, `Error Sincronización`.

**Hallazgo de estado del negocio, no solo de esquema:** de los **40 registros existentes, el 100% tiene `Ambiente = PRUEBAS`**. **No existe todavía ninguna factura en `PRODUCCIÓN`.** Esto es consistente con `SRI_AMBIENTE=1` en `.env.local` (ambiente pruebas) y con `docs/DISENO_FASE16_GANCHO_FACTURACION.md:5` ("El paso a producción es Fase 17") y `docs/AUDITORIA_FACTURACION_FASE16.md:222` (checklist "para Fase 17 (producción)" listado pero no ejecutado). **Implicación directa para el libro central: hoy, el lado "factura" del dinero real del negocio es $0 — todo lo que hay son 40 facturas de prueba en el sandbox del SRI.** El libro de Fase 20 no puede todavía usar Facturas Electrónicas como fuente de ingreso real; solo Abonos refleja dinero real cobrado hoy.

**¿Registra monto cobrado o solo monto facturado?** Solo el **monto facturado** (`Subtotal`/`IVA`/`Total` = precio de venta completo). Decisión de diseño explícita y documentada: `docs/DISENO_FASE16_GANCHO_FACTURACION.md:13` — *"¿Total o abonado en pagos parciales? Total de la cuenta. **La factura documenta la venta, no el cobro.** Los abonos viajan como formas de pago; el saldo pendiente viaja como forma de pago adicional"* — y línea 25: *"la factura formaliza abonos que ya existen — no crea ingresos, no duplica dinero. El gancho jamás escribe en la tabla Abonos."* La forma de pago completa (un `Pago` por cada abono vigente + uno de saldo) sí viaja al XML/RIDE (`lib/facturacion/xml/construirFacturaXml.ts:269-272`), pero el campo Airtable `Líneas JSON` **trunca esa información: solo guarda `datos.pagos[0]?.formaPago`** (`emitirFactura.ts:339-345`), es decir la forma de pago del primer abono únicamente — quien intente reconciliar abonos↔factura leyendo `Líneas JSON` en Airtable se queda con información incompleta; hay que ir al XML/RIDE o al camino de links (ver Parte C).

**Conexión factura↔abono, con evidencia real:** **no existe ningún link directo** entre una Factura y un Abono. El único camino es indirecto, de 3 saltos: `Abono."Aplicado a: Orden/Operación"` → esa Orden/Operación → su campo inverso `"Facturas Electrónicas"` → la(s) Factura(s). Verificado en datos: de 40 facturas, solo **2 tienen el campo `Orden` poblado** (`recnNjFMZRe6SSgAq` → orden `recvYZCZKoeNdeXLP`/OR000368; `recwOge9ZqN5SJdt7` → orden `recKELLl1qj5VsI9L`/OR000342) y **0 tienen `Operación` poblada** — aunque el link a Operación existe en el esquema (`Operación Comercial.Facturas Electrónicas`, campo `fldJ4WXBdF64dBXl3`), el código de facturación nunca lo llena en estos 40 casos. Los otros **38/40 (95%) no tienen ningún link a Orden ni a Operación** — son facturas "de mostrador" (`ordenId`/`operacionId` opcionales en `lib/facturacion/airtable/facturas.ts:64-66`), completamente desconectadas por diseño de cualquier abono. 4 facturas sí tienen el link `Cliente` poblado (las 4 son del mismo cliente, "ALEX BOLAÑOS" — coherente con ser pruebas internas del equipo, dado que el ambiente es 100% PRUEBAS).

**¿Facturas anuladas ante el SRI?** El estado `ANULADA` existe en el esquema y en el tipo `EstadoFactura`, pero **`actualizarEstadoFactura()` (única función que puede cambiar `Estado`, `lib/facturacion/airtable/facturas.ts:454`) nunca se invoca con ese valor en ningún punto del repo** — no hay endpoint de anulación. Confirmado también como alcance futuro explícito: `docs/DISENO_FASE16_GANCHO_FACTURACION.md:180` — *"Notas de crédito / anulación (Fase 18). El estado ANULADA sigue sin asignarse."* Dato: hoy 0 de 40 facturas están en estado `ANULADA` (estados reales: `AUTORIZADO` 26, `BORRADOR` 6, `NO AUTORIZADO` 6, `DEVUELTA` 2).

**¿Ventas sin abono previo (pago directo al facturar)?** Dado que 38/40 facturas no tienen ningún link a Orden/Operación/Abono, y que el propio diseño asume que la factura solo formaliza abonos ya existentes, **no hay ningún camino en código para saber, para esas 38 facturas, si hubo un cobro directo y cómo se registró ese dinero** — si el cliente pagó de contado al momento de facturar sin pasar por Abonos, ese dinero no queda en ninguna tabla del sistema (**NO VERIFICADO — hipótesis, no hay evidencia de código ni de datos que la confirme o refute**; requiere confirmar con el equipo de caja si estas facturas de mostrador tienen algún registro de cobro en efectivo fuera del portal).

### B3. Pagos de Shipping ("Shipping Pagos")

**Esquema:** `tbl7dSFGRM3tzB4yB`, 28 campos, incluyendo `Estado Pago` (`Borrador`/`Pendiente`/`Parcial`/`Pagado`/`En revisión`/`Anulado`), `Estado de integración con Finanzas` (mismas opciones que en Finanzas Movimientos), `Total a pagar`, `Total pagado` (nunca escrito — ver A.4), `Fecha de anulación`, `Motivo de anulación`, link directo `Shipping Finanzas Movimientos`.

**Relación con Shipping Finanzas Movimientos — sí, cada pago marcado como pagado genera un movimiento, siempre, dentro de la misma función.** Evidencia línea por línea, `markShippingV2PagoAsPaid`, `lib/shipping-v2/airtable.ts:2713-2740`:
1. Línea 2720: `createFinanceMovementForPago(...)` → **POST** en Shipping Finanzas Movimientos.
2. Líneas 2734-2737: **PATCH** en Shipping Pagos → `Estado Pago = "Pagado"` + enlaza `Shipping Finanzas Movimientos = [movementId]`.
3. Línea 2738: `updateItemsToPaidAfterPayment(pago)` → PATCH en Items relacionados → `Pagado`.

No es una transacción atómica (3 llamadas HTTP separadas, sin rollback si una falla a mitad de camino), pero sí ocurre siempre en el mismo flujo síncrono — **verificado también contra datos reales**: 11 Shipping Pagos, todos `Estado Pago = "Pagado"`; 11 Shipping Finanzas Movimientos — **correspondencia 1:1 exacta**, sin huérfanos en ningún lado.

**Anulación:** `cancelShippingV2Pago`, `lib/shipping-v2/airtable.ts:2752-2773`. Solo cambia estado (`"Anulado"`), fecha y motivo — no borra nada. **Guard crítico:** si el pago ya está `"Pagado"` y ya tiene movimiento financiero vinculado, la función **lanza error y bloquea la anulación** ("No se puede anular libremente un pago pagado con movimiento financiero") — el código reconoce que anular ahí dejaría un asiento contable huérfano, pero la única respuesta que tiene es impedir la operación, no revertirla (no existe ningún movimiento de tipo "Ajuste"/"Ingreso" de reverso en ningún punto del repo, aunque esos valores existen en el esquema). Dato real: 0 de 11 pagos están anulados hoy.

### B4. Nómina / Horarios

**Escritores:**
- `Horarios Pagos` — `registrarPagoHorario()`, `lib/horarios/airtable.ts:2766-2848`, vía `POST /api/horarios/admin/periodos/[id]/pagos`. Llena `Monto Pagado`, `Método de Pago` (normalizado a `Transferencia bancaria`/`Efectivo`/`Depósito`/`Otro`), `Banco / Cuenta Origen` (texto libre — valores reales hoy: `Pichincha`, `prueba`), `Comprobante` (best-effort: si falla la subida, el pago igual queda registrado sin comprobante), `Número de Transacción`, `Observación`, `Registrado por`, `Estado del Pago` (`Registrado`/`Anulado`). Anulación (`anularPagoHorario`, línea 2567-2624): solo cambia estado + nota de auditoría, no borra ni revierte nada más.
- `Horarios Periodos de Pago` — creado/actualizado por `crearPeriodoPago`, `updatePeriodoEstado`/`updatePeriodoFields`, `syncPeriodoRegistros`, `generarRolPagoPeriodo` (genera PDF de rol de pago). Totales (`Total Ganado`, `Total Ajustes`, `Total Neto`, `Total Pagado`, `Saldo Pendiente Neto`) se calculan internamente, sin ninguna fuente externa.
- `Horarios Ajustes` — `registrarAjusteHorario()`, `lib/horarios/airtable.ts:2626-2752`, vía `POST /api/horarios/admin/periodos/[id]/ajustes`. Tipos: `Corrección de hora`, `Bono`, `Descuento`, `Compra empleado`, `Regularización`, `Otro`. El signo lo determina `getMontoAjusteSign()` (línea 744-762): `Compra empleado` y `Descuento` siempre negativos, `Bono` siempre positivo, los demás según elección manual del admin (`suma`/`resta`). **Solo requiere motivo en texto libre y aprobador — sin comprobante, sin adjunto, sin vínculo a ninguna orden/factura/transacción real.**

**Vínculo con libro financiero: confirmado que NO existe ninguno.** Grep exhaustivo de "Finanzas"/"Movimientos" en `lib/horarios/` y `app/api/horarios/` → 0 resultados. El dinero que sale del negocio por nómina (potencialmente el mayor gasto fijo recurrente — `SUELDO_BASE = 482` por empleado en el código, más los pagos reales) vive en un silo completamente aislado del resto del sistema financiero, sin ningún puente equivalente al que sí existe para Shipping (`createFinanceMovementForPago`).

**Datos reales (2026-07-10):**
- `Horarios Pagos`: 5 registros, todos `Estado del Pago = "Registrado"`, todos `Método de Pago = "Transferencia bancaria"`, rango 2026-05-06 → 2026-07-04, suma `Monto Pagado` = **$1,897.90**.
- `Horarios Ajustes`: 6 registros, todos `Estado = "Aplicado"` — 5 `Descuento` + 1 `Compra empleado`, todos con `Monto Ajustado` negativo, suma = **-$74.03**. Ningún `Bono` registrado todavía.

**Caso especial "Compra empleado":** cuando un empleado compra un producto de la tienda, el valor se registra únicamente como descuento en su rol de pago (motivo en texto libre) — **la venta correspondiente nunca se registra como ingreso en ningún lugar**; solo se ve como una reducción del gasto de nómina de ese empleado, sin vínculo a ninguna orden de venta, factura ni registro de inventario/COGS.

### B5. Otras fuentes (búsqueda exhaustiva)

- **Compra local de repuestos para reparaciones** — tabla `Repuestos por Orden`, campo `Costo proveedor real` + `Proveedor real` (texto libre), escrito en `createRepuestoPorOrden()` (`lib/tecnicos/airtable/index.ts:2141-2183`). Es solo un número para calcular margen (`precioCliente - costoProveedor`) — **sin comprobante, sin método de pago, sin fecha de pago real, sin vínculo a ningún libro de movimientos.** Dinero que sale del negocio de forma completamente informal.
- **Compra de licencias/productos digitales** — tabla `Productos Digitales`, campo `Costo Proveedor`, escrito en `createProductoDigital()` (`lib/tecnicos/airtable/index.ts:3235-3290`). Mismo patrón: sin comprobante ni vínculo a ningún libro. El lado de ingreso (`Precio Venta`) sí llega a la cuenta unificada de la orden vía `totalProductosDigitalesNV`, pero el lado de gasto (comprar la licencia) queda aislado.
- **"Monto recuperado" / "Monto reclamado" en Shipping Novedades** — campos de esquema (`currency`) que representan dinero (o crédito) recuperado de un proveedor por una garantía/reclamo. **El código de la aplicación nunca los lee ni los escribe** — ni siquiera están en el tipo TypeScript `ShippingV2Novedad`, y `mapNovedad()` (`lib/shipping-v2/airtable.ts:1380-1412`) los omite explícitamente al mapear. Es decir, si el equipo llena estos campos manualmente en Airtable (fuera del portal), ese dinero recuperado es **100% invisible** para cualquier sistema — no llega ni siquiera a mostrarse en el portal, mucho menos a un libro central.
- **Shipping Finanzas Movimientos solo cubre egresos de proveedores de shipping** — confirmado en A: nunca se ha escrito `Tipo de movimiento = "Ingreso"` en ningún punto del código; aunque el esquema lo permite, no hay ningún flujo (ventas, abonos, recuperaciones de garantía) que alimente ese lado.
- **Sin caja chica ni conciliación bancaria** — grep de "caja chica" en todo el repo → 0 resultados. "Efectivo"/"Banco" solo existen como opciones de método de pago en distintos catálogos (Abonos, Shipping Pagos, Horarios Pagos), nunca como una tabla o registro de saldo de caja física.
- **Reembolsos/devoluciones fuera de facturación SRI** — no se encontró ningún mecanismo de reembolso a clientes (ej. devolver un abono ya cobrado) en `lib/` ni `app/api/` fuera del propio módulo SRI (que maneja comprobantes de reembolso como tipo de documento, no como flujo de caja del portal).
- **Bajas internas de órdenes abandonadas** (`app/api/tecnicos/ordenes/[id]/baja-interna/route.ts`) — no mueve dinero directamente, pero representa pérdidas potenciales (repuestos ya comprados en una reparación cuyo cliente nunca pagó/recogió) que hoy no se reflejan en ningún libro como pérdida.

---

## PARTE C — Mapa del doble conteo

### C.1 Diagrama del flujo de dinero de una venta típica

```
Cliente abona (efectivo/transferencia)
        │
        ▼
  Tabla "Abonos"  ←── ÚNICO lugar donde ese dólar se registra como dinero real cobrado.
        │             Estado del Abono: Registrado/Anulado. Sin comprobante de sincronización
        │             con ningún libro central (campos "Estado Financiero" etc. son placeholders
        │             muertos, y solo existen — sin usar — en la tabla legacy "Abonos por Orden").
        │
        │  (más tarde, opcionalmente, se factura la venta)
        ▼
  Tabla "Facturas Electrónicas"  ←── Registra el TOTAL de la venta (precio completo),
        │                            no el cobro. Por diseño explícito, "no crea ingresos,
        │                            no duplica dinero" — pero el campo Total de la factura
        │                            y el campo Monto del abono representan, la mayoría de
        │                            las veces, EL MISMO dinero visto desde dos ángulos.
        ▼
  Si un libro central sumara "Abonos.Monto" + "Facturas.Total" para la misma venta,
  contaría ese dólar DOS VECES — una vez como "se cobró" y otra como "se vendió".
```

Punto ciego adicional detectado: **no hay ningún link directo Abono↔Factura** — la única forma de saber que un abono y una factura son "la misma venta" es reconstruir la cadena `Abono → Orden/Operación → Facturas Electrónicas (inverso)`, y esa cadena solo funciona hoy para el 5% de las facturas (2 de 40) que sí tienen `Orden` poblado, y el 0.7% de los abonos (1 de 138) que caen dentro de esa relación directa por-lado. Para la mayoría de los casos, la cadena simplemente no existe — no es que el doble conteo se evite con esfuerzo, es que **hoy no hay manera de saber, mirando solo Airtable, cuáles abonos corresponden a cuáles facturas** salvo revisar caso por caso.

### C.2 Casos reales (con record IDs)

**Caso 1 — Orden OR000342 (`recKELLl1qj5VsI9L`), cliente "Daniel Ruiz":**
- Servicio: "Limpieza y Cambio de Pasta Térmica - MacBook", $10. `Total Abonado NV` = $10.
- Abono real: `recWTccSia8mW8DTO` en `Abonos`, $10, Efectivo, 2026-06-20, `Aplicado a: Orden = recKELLl1qj5VsI9L`. Este registro tiene `_old_record_id = recEcOo5CpUxTOsLL` — que **sigue existiendo, vivo, en la tabla legacy `Abonos por Orden`**, con el mismo monto y fecha. Es decir: **este mismo abono de $10 existe físicamente en dos tablas Airtable simultáneamente hoy.**
- Factura real: `recwOge9ZqN5SJdt7`, Estado `AUTORIZADO`, Ambiente `PRUEBAS`, Total $11.50, con link `Orden = recKELLl1qj5VsI9L`.
- **Anomalía detectada:** la factura tiene `Cliente - Nombre = "ALEX BOLAÑOS"` y link `Cliente = recrRaIcGoxSXy5dN` (el registro de cliente de Alex Bolaños), **pero la Orden a la que está vinculada pertenece al cliente "Daniel Ruiz"**. Dado que el 100% de las facturas están en `Ambiente = PRUEBAS`, la lectura más plausible es que se trata de una prueba interna del equipo (facturando bajo su propia identidad de prueba, enlazada de todas formas a una orden real para probar el flujo) — **NO VERIFICADO como error de producción**, pero si el libro central llegara a usar estos datos de prueba sin filtrar por `Ambiente`, produciría atribuciones cruzadas incorrectas cliente↔venta.
- **Lectura para el libro:** si se contara `Abonos.Monto` ($10) + `Abonos por Orden.Monto` ($10, el duplicado) + `Facturas.Total` ($11.50) para esta única venta, el total aparente sería $31.50 sobre una venta real de $10-11.50.

**Caso 2 — Orden OR000368 (`recvYZCZKoeNdeXLP`) / Operación `recxUxaEilBgnivWC`, cliente "Alex Bolaños":**
- Servicios: "Configuración de impresora Zebra" ($10) + "AIO iMac Limpieza y Cambio de Pasta Térmica - Con GPU" ($40) = $50. `Total Abonado NV` de la **orden** = $0 (el abono no se aplicó a la orden directamente).
- Abono real: `recsmxKWZaelDhEua` en `Abonos`, $50, 2026-07-06, `Aplicado a: Operación = recxUxaEilBgnivWC` (no a la Orden). Al estar aplicado al lado Operación, el rollup `Total Abonado` de la Operación lo refleja, mientras que el rollup `Total Abonado NV` de la Orden vinculada muestra $0 — **comportamiento correcto por diseño** (conjuntos disjuntos documentados en `lib/cuenta-unificada/index.ts:314-316`), pero ilustra que **reconstruir "cuánto se abonó a esta venta" exige mirar los dos lados (Orden y Operación) del par vinculado, nunca uno solo.**
- Factura real: `recnNjFMZRe6SSgAq`, Estado `AUTORIZADO`, Total $88.01, con link `Orden = recvYZCZKoeNdeXLP` (no a la Operación — el link `Operación` de Facturas Electrónicas existe en el esquema pero no se usó aquí).
- **Lectura para el libro:** una búsqueda ingenua que solo mirara "abonos aplicados directamente a esta Orden" (0) concluiría, incorrectamente, que esta venta de $88.01 no tiene ningún abono asociado, cuando en realidad sí lo tiene ($50), solo que registrado del lado Operación del mismo par Orden↔Operación.

### C.3 Casos borde

| Caso | Evidencia | Cómo debería tratarlo el libro |
|---|---|---|
| **Venta facturada sin abonos (ni ningún otro link)** | 38 de 40 facturas (95%) no tienen `Orden` ni `Operación` poblados — ej. `rec6ExaDB5inOtK5o` (NO AUTORIZADO, $115, Cliente "CONSUMIDOR FINAL", sin ningún link) | Tratarlas como "venta de mostrador": el `Total` de la factura es el único dato de ingreso disponible; no hay forma de saber si hubo cobro parcial previo. Debe registrarse como ingreso íntegro salvo evidencia en contrario. |
| **Abonos sin factura (aún)** | 137 de 138 abonos (99.3%) no tienen ninguna factura relacionada hoy vía el camino Orden/Operación → Facturas — suma **$7,690** | Deben contar como ingreso real (dinero efectivamente cobrado) desde el momento del abono, no esperar a que exista factura — la factura, cuando llegue, no debe sumarse de nuevo por el mismo monto. |
| **Abono anulado** | `recUFpElbgRciONg9` ($50, Anulado, aplicado a Orden `recYhi7aObJEnSaEt`); `recltUTUflYlCQHx5` ($1, Anulado, aplicado a Operación `recwWxZspJcIJe6vF`) | No debe contar como ingreso. Ya está excluido de los rollups `Total Abonado`/`Total Abonado NV`; el libro debe replicar ese mismo filtro (`Estado del Abono != "Anulado"`), no inventar uno nuevo. |
| **Factura anulada** | 0 casos reales existen hoy (`ANULADA` nunca se ha asignado — no implementado, Fase 18 según diseño) | **NO VERIFICADO por falta de datos** — el libro debe diseñar el tratamiento (probablemente: reversar el ingreso reconocido por esa factura) antes de que Fase 18 lo vuelva un caso real, no después. |
| **Pago Shipping anulado** | 0 casos reales existen hoy (los 11 pagos están `Pagado`); el código sí soporta el estado pero **bloquea** anular un pago que ya generó movimiento financiero | Mientras el código lo bloquee, no hay caso real que reconciliar. Si en el futuro se permite forzar la anulación, el libro necesitará un movimiento de tipo "Ajuste"/reverso — que hoy no existe ningún código capaz de crear. |
| **"Abonos por Orden" legacy con datos vivos duplicados** | 128/128 registros de esta tabla están duplicados dentro de `Abonos` (ver B1/C.2 Caso 1) | El libro **no debe leer nunca esta tabla** como fuente activa — solo `Abonos` es canónica hoy. |

### C.4 Recomendación preliminar (RECOMENDACIÓN, no decisión)

Con la evidencia recogida, el evento que debería contar como **"el ingreso real"** en el libro es **el Abono** (dinero efectivamente cobrado, con método de pago y fecha reales), no la Factura. Razones, todas basadas en evidencia de esta auditoría:

1. El propio diseño del módulo de facturación ya lo decidió así y lo documentó explícitamente: *"la factura formaliza abonos que ya existen — no crea ingresos, no duplica dinero"* (`DISENO_FASE16_GANCHO_FACTURACION.md:25`). El libro de Fase 20 debería alinearse con esa decisión ya tomada, no reabrirla.
2. Hoy el 100% de las facturas están en ambiente de pruebas ($0 de facturación real) — si el libro dependiera de la factura como evento de ingreso, no tendría ningún ingreso real que registrar todavía, mientras que sí existen $7,700 en abonos reales cobrados en 2026.
3. La factura, cuando exista en producción, debería tratarse como **metadato fiscal/documental de una venta ya registrada por sus abonos** — no como un segundo evento de dinero. Concretamente: al recibir una Factura Electrónica con `Orden`/`Operación` vinculada, el libro debería marcar los abonos correspondientes como "facturados" (idealmente agregando ese link directo Abono→Factura que hoy no existe) en vez de generar un nuevo movimiento de ingreso.
4. Para el 95% de facturas sin ningún vínculo (mostrador), al no existir abono previo que las preceda, sí deben generar directamente un movimiento de ingreso por el `Total` — son el único caso legítimo en que "factura = ingreso" sin abono de por medio.

---

## PARTE D — Insumos para el diseño del libro

### D.1 Catálogo de cuentas/cajas reales (valores distintos encontrados)

| Campo / tabla | Valores de catálogo (esquema) | Valores realmente usados en datos |
|---|---|---|
| `Shipping Finanzas Movimientos.Cuenta origen` | Banco Pichincha, Caja, PayPal, Tarjeta, Otra, No aplica | Caja (9), PayPal (2) |
| `Shipping Pagos.Cuenta origen` | Tarjeta C. Pichincha, Tarjeta D. Supe Geek, Tarjeta C. Pacificard, Tarjeta C. Produbanco, Caja, PayPal, Otra, No aplica | Caja (9), PayPal (2) |
| `Abonos.Cuenta Destino` | texto libre (sin catálogo) | Banco Pichincha, Caja (solo 2 de 138 registros lo llenan — campo casi sin usar en la práctica) |
| `Abonos por Orden.Cuenta Destino` | texto libre (sin catálogo) | vacío en el 100% de los 128 registros |
| `Horarios Pagos.Banco / Cuenta Origen` | texto libre (sin catálogo) | Pichincha, `prueba` (dato de prueba filtrado en producción — riesgo de calidad de dato en texto libre sin validación) |
| Métodos de pago (repetidos en Abonos/Shipping Pagos/Shipping Finanzas/Horarios Pagos, cada tabla con su propio `singleSelect` independiente) | Efectivo, Transferencia (bancaria/Depósito), Tarjeta, PayPal, PayPhone (solo Abonos), Otro | Efectivo y Transferencia dominan en Abonos (114+23 de 138); Tarjeta domina en Shipping (8 de 11) |

**Conclusión:** las cuentas reales operativas del negocio, consolidando todo lo anterior, son básicamente: **Caja (efectivo)**, **Banco Pichincha**, **PayPal**, y un conjunto de **tarjetas de crédito/débito de la empresa** (Pichincha, Supe Geek, Pacificard, Produbanco — usadas del lado Shipping como método de pago a proveedores, no como cuentas de cobro de clientes). No existe hoy un catálogo único y consistente de cuentas — cada tabla define su propio `singleSelect` (o, peor, campo de texto libre sin validar, como en Abonos/Horarios Pagos) con nombres ligeramente distintos para el mismo concepto (ej. "Caja" vs "Efectivo" mezclando cuenta y método de pago).

### D.2 Catálogo de categorías naturales (propuesta basada en datos reales)

Basado en las fuentes reales encontradas en Partes A y B:

- **Venta / servicio** (ingreso) — hoy vive en Abonos (dinero real) y, sin producción todavía, en Facturas Electrónicas (documento fiscal).
- **Compra a proveedor de shipping** (egreso) — vive en Shipping Pagos / Shipping Finanzas Movimientos.
- **Compra local de repuesto** (egreso) — hoy solo en `Repuestos por Orden.Costo proveedor real`, sin trazabilidad de pago.
- **Compra de licencia/producto digital** (egreso) — hoy solo en `Productos Digitales.Costo Proveedor`, sin trazabilidad de pago.
- **Nómina — sueldo** (egreso) — `Horarios Pagos`.
- **Nómina — bono** (egreso, aún sin ejemplos reales) — `Horarios Ajustes` tipo `Bono`.
- **Nómina — descuento** (egreso negativo / reduce el egreso de nómina) — `Horarios Ajustes` tipo `Descuento`.
- **Venta interna a empleado ("Compra empleado")** (ingreso, hoy invisible como tal) — `Horarios Ajustes` tipo `Compra empleado`.
- **Recuperación de garantía/proveedor** (ingreso o crédito, hoy invisible en código) — `Shipping Novedades."Monto recuperado"`.
- **Reclamo pendiente de proveedor** (no es dinero movido todavía, es una cuenta por cobrar potencial) — `Shipping Novedades."Monto reclamado"`.
- **Ajuste/corrección** (sin signo de negocio fijo) — `Horarios Ajustes` tipo `Corrección de hora`/`Regularización`, y la opción `Ajuste` (sin uso aún) de `Shipping Finanzas Movimientos.Tipo de movimiento`.

### D.3 Histórico a cargar retroactivamente (por fuente)

| Fuente | Registros | Rango de fechas | Suma (si trivial en lectura) | Campos que faltarían para el libro |
|---|---|---|---|---|
| Shipping Finanzas Movimientos | 11 | 2026-06-10 → 2026-07-08 | $6,382.04 (egreso) | Ninguno crítico — ya tiene cuenta/método/fecha/monto |
| Abonos | 138 (135 Registrado, 2 Anulado, 1 sin estado) | 2026-01-01 → 2026-07-10 | $7,700 | Cuenta destino real (solo 2/138 la tienen) |
| Abonos por Orden (legacy, NO cargar — ya está duplicado en Abonos) | 128 | 2026-06-28 → 2026-06-29 (congelada) | $6,349 | N/A — excluir del libro, ya representado vía Abonos |
| Facturas Electrónicas | 40 (todas `PRUEBAS`) | 2026-06-21 → 2026-07-10 | $8,287.50 (dato de prueba, no cargar como ingreso real) | Ambiente de producción real (aún no existe ninguna) |
| Shipping Pagos | 11 (todas `Pagado`) | 2026-06-10 → 2026-07-08 | Ya reflejado 1:1 en Finanzas Movimientos | Ninguno — es la misma fuente que Finanzas Movimientos |
| Horarios Pagos | 5 (todas `Registrado`) | 2026-05-06 → 2026-07-04 | $1,897.90 | Vínculo a ninguna cuenta bancaria real validada (campo texto libre) |
| Horarios Ajustes | 6 (todas `Aplicado`) | 2026-05-12 → 2026-07-03 | -$74.03 | Comprobante/adjunto (no existe en el esquema de esta tabla) |
| Repuestos por Orden (`Costo proveedor real`) | NO VERIFICADO — no se contó por estar fuera del filtro de tablas de dinero explícitas, requiere conteo dedicado | — | — | Comprobante, método de pago, fecha real de pago — hoy no existen en el esquema |
| Productos Digitales (`Costo Proveedor`) | NO VERIFICADO — mismo caso que arriba | — | — | Igual que arriba |
| Shipping Novedades (`Monto recuperado`/`Monto reclamado`) | NO VERIFICADO — el agente confirmó que el código no los usa, pero no se hizo conteo de cuántas Novedades reales tienen estos campos llenados manualmente en Airtable | — | — | Todo — hoy es un campo huérfano sin ningún flujo alrededor |

### D.4 Riesgos técnicos

1. **La API de Airtable no crea fórmulas, rollups ni lookups** — cualquier campo calculado que el diseño del libro central necesite (ej. un rollup "Total conciliado por cuenta") tendrá que crearse a mano en la interfaz de Airtable antes de que el código pueda depender de él. Ya se ve esta limitación en juego hoy: `Total Abonado`/`Total Abonado NV` son rollups creados a mano, y el código explícitamente evita recalcularlos en JS porque no puede replicar la fórmula vía API.
2. **Ningún campo de "sincronización con libro financiero" que ya existe en el esquema (`Shipping Finanzas Movimientos`, `Abonos por Orden`) llegó nunca a conectarse con nada real** — dos intentos previos de preparar esta integración (uno por tabla) quedaron a medias. El diseño de Fase 20 debería decidir explícitamente si reutiliza esos campos placeholder o los reemplaza — no asumir que "ya existen, deben servir".
3. **Tablas legacy con datos vivos duplicados** (`Abonos por Orden`) representan una trampa concreta para cualquier importación retroactiva ingenua ("traer todo lo que hay en Airtable de dinero") — un diseño que no conozca la migración del 2026-06-30 duplicaría $6,349.
4. **Campos de texto libre sin catálogo** para cuenta destino/origen en varias tablas (`Abonos.Cuenta Destino`, `Horarios Pagos.Banco / Cuenta Origen`) permiten inconsistencias de captura (ya se ve un valor `"prueba"` en datos de nómina) — el libro necesitará normalizar o exigir un `singleSelect` común antes de poder agregar por cuenta de forma confiable.
5. **Ambiente de pruebas mezclado con producción en la misma tabla** (`Facturas Electrónicas.Ambiente`) — cualquier consulta al libro central que no filtre explícitamente por `Ambiente = PRODUCCIÓN` inflará artificialmente los ingresos con las 40 facturas de prueba actuales (y las que se sigan generando hasta el cutover de Fase 17).
6. **Actualizaciones no atómicas entre tablas relacionadas** — el propio flujo de Shipping Pagos → Finanzas Movimientos son 3 llamadas HTTP separadas sin rollback (B.3); cualquier nuevo flujo que el libro central introduzca hereda el mismo riesgo salvo que se diseñe con idempotencia explícita (como ya hace `createFinanceMovementForPago` con su guard de reutilización).

---

## Resumen ejecutivo (para el dueño del negocio)

Hoy el dinero de SUPER TIENDA GEEK vive repartido en **6 lugares que no se hablan entre sí**: los abonos de clientes, las facturas electrónicas, los pagos a proveedores de envíos, la nómina, las compras locales de repuestos/licencias, y las recuperaciones de garantía de proveedores. Ninguno de estos suma al mismo libro.

**El riesgo de doble conteo es real y ya está ocurriendo con datos vivos:** hoy existen $6,349 en abonos que están duplicados en dos tablas de Airtable al mismo tiempo (una vieja que ya no se usa pero sigue con los registros ahí, y la nueva). Si al construir el libro alguien suma "todo lo que hay" sin saber esto, ese dinero se contaría dos veces.

**La factura NO debe sumarse junto al abono como si fueran dos ingresos distintos** — el sistema ya decidió, desde que se construyó facturación electrónica, que la factura solo documenta una venta ya cobrada por abonos; no representa dinero nuevo. Hoy esto es fácil de verificar porque, además, **todavía no existe ni una sola factura real** — las 40 que hay son todas de un ambiente de pruebas del SRI, así que el ingreso real de este año está representado únicamente por los abonos ($7,700 registrados desde enero).

**Hay dinero que hoy es completamente invisible para cualquier sistema:** la nómina completa (sueldos, bonos, descuentos) no está conectada a ningún libro; lo que se recupera de proveedores por garantías rotas tampoco se registra en ningún lado que el portal pueda ver; y las compras locales de repuestos y licencias de software se anotan solo como un número de referencia, sin comprobante ni trazabilidad de pago.

**Recomendación de esta auditoría (no decisión):** que el "ingreso real" del futuro libro sea el abono (dinero efectivamente cobrado), y que la factura, cuando empiece a emitirse en producción, solo marque ese abono como "ya facturado" en vez de sumar un segundo ingreso. El diseño del libro también debe decidir explícitamente qué hacer con la tabla vieja de abonos duplicados, y debe incorporar de una vez nómina, garantías recuperadas y compras locales — hoy completamente fuera de cualquier control.
