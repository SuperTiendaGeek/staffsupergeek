# Auditoría de solo lectura y plan — Fase 17 (Facturación a producción) + Fase 18 (Notas de crédito / anulación)

**Fecha:** 2026-07-16 (actualizado el mismo día con las respuestas del dueño/contador)
**Tipo:** auditoría de solo lectura + plan de ejecución. No se modificó ningún archivo de código ni de Airtable.
**Alcance:** consolidar lo que el propio repo ya documentó en `docs/AUDITORIA_FACTURACION_FASE16.md` y `docs/CIERRE_FASE16.md` (checklist de Fase 17, ítems 5-14), confirmarlo contra el código actual, y diseñar la Fase 18 contra las reglas SRI 2026 vigentes.

---

## 0. Resumen ejecutivo

El módulo de facturación electrónica está completo y probado de punta a punta en ambiente de **pruebas** (`SRI_AMBIENTE=1`). El propio repo ya cerró una auditoría de Fase 16 (`docs/CIERRE_FASE16.md`, 2026-07-10) con una tabla de 21 pendientes, de los cuales **9 están etiquetados explícitamente "Fase 17"**. Ese checklist es la fuente de verdad para el cutover — este documento lo confirma contra el código de hoy y le agrega el plan de emisión controlada y el diseño de Fase 18.

Hallazgo más importante para la secuencia de trabajo: **hoy no existe ninguna implementación de nota de crédito ni de anulación.** El estado `"ANULADA"` existe como valor reservado en el tipo de Airtable y se excluye correctamente de los cálculos de secuencial e idempotencia, pero ningún endpoint lo asigna todavía. Fase 18 se construye desde cero sobre una base de datos que ya lo anticipó.

Segundo hallazgo importante: el puente con el Sistema Contable SG (`lib/finanzas/puentes/facturacion.ts`) ya tiene un guard explícito que **ignora cualquier factura que no esté en ambiente `"2"` (producción)** — así que activar producción no arriesga contaminar el libro con datos de prueba; al revés, es la condición que hoy bloquea que el libro reciba los ingresos reales de facturación.

---

## 0.0.1 Estado de PRs abiertos (actualizado 2026-07-16, vía Claude Code + gh)

| PR | Rama | Contenido | Draft | Mergeable | CI/Deploy |
|---|---|---|---|---|---|
| #17 | `feat/facturas-blob-durable` | Respaldo durable de facturas en Vercel Blob | Sí — falta verificar contra un token real (ver nota abajo) | ✅ sin conflicto | ✅ deploy Vercel pasó |
| #18 | `feat/smtp-test-to-produccion` | `SMTP_TEST_TO` ya no puede desviar correos en producción | No | ✅ sin conflicto | ✅ deploy Vercel pasó |
| #20 | `fix/post-emision-guard-ambiente` | `postEmision()` nunca toca inventario fuera de ambiente producción | No | ✅ sin conflicto | ⏳ desplegando al momento de la revisión |

`origin/main` no avanzó desde que se crearon las tres ramas — ninguna necesita rebase. **Nota sobre #17**: el respaldo a Blob no tiene guard de ambiente (a propósito — más respaldo nunca está de más, incluso en pruebas), así que no hace falta esperar al cutover de producción para probarlo: la próxima factura de PRUEBAS que se emita ya va a intentar escribir a Vercel Blob. Basta con confirmar que aparece ahí (o que `resolverArchivoFactura` la encuentra) para sacar el PR de draft.

---

## 0.0 Checklist en una frase cada uno (para no perder de vista nada, actualizado 2026-07-16)

Lo que falta, sin tecnicismos, en el orden en que hay que hacerlo:

1. Confirmar régimen tributario para el límite de consumidor final. → **Hecho** (General, $50, sin cambios).
2. Hacer más durable el respaldo de las facturas (`FACTURAS_DIR`) para no depender solo de Airtable si algo falla. → **Código listo, PR #17 (draft) abierto** — falta probarlo contra un token real de Vercel Blob antes de sacarlo de draft (buen momento: durante la emisión controlada, sección 3).
3. Quitar la variable que fuerza todos los correos al buzón de pruebas (`SMTP_TEST_TO`) — si se olvida, ningún cliente real recibe su factura por correo. → **Código listo, PR #18 abierto** — se resolvió como regla de código (se ignora sola en ambiente producción) en vez de depender de borrar la variable a mano.
4. Auditar si alguna prueba anterior marcó por error un repuesto real como vendido. → **Hecho 2026-07-16, verificado en vivo contra Airtable — hoy no hay ningún caso.** Queda pendiente, opcional, cerrar el hueco de código que podría repetirlo (`postEmision()` sin guard de ambiente).
5. Construir el descuento real de inventario por `Cantidad`. → **Construido 2026-07-19** — rama `feat/inventario-cantidad`, commit `4033faa`, basada en el `main` post-merge de los PRs #17/#18/#20. Cubre las 3 reglas decididas (disponible si `Cantidad>=1`, bloqueo con alerta en 0, descuento solo tras autorización del SRI con relectura anti-carrera) y de paso cierra el hueco #3 de `CIERRE_FASE16.md` (mostrador ahora sí descuenta stock). El **reverso** (nota de crédito/anulación suma de vuelta) queda para Fase 18, ya diseñado en la sección 5.4.
6. Emitir 3-5 facturas reales de prueba, solo tú, revisadas por tu contador. → Pendiente, a hacer cuando el resto de la lista esté listo.
7. Justo antes del siguiente paso: revisar una última vez el último número emitido por tu sistema viejo y apagarlo en la serie `001-002`. → Pendiente, el mismo día del corte.
8. **Cambiar la variable `SRI_AMBIENTE` de `"1"` a `"2"` en la configuración — este es el interruptor real que activa producción.** Es el ÚLTIMO paso técnico, después de todo lo anterior, nunca antes. → Sigue pendiente, lo tengo presente desde el principio (ítem 2 original del checklist de la sección 1, y "último paso" en cada versión de la lista de ejecución de este documento).
9. Abrir el sistema al equipo de técnicos.

---

## 0.1 Decisiones confirmadas por el dueño (2026-07-16)

Todas las preguntas pendientes de la sección 6 (contador) y varias de las secciones 3-5 quedaron resueltas en esta conversación:

1. **Facturar el total de la cuenta unificada**, no solo lo abonado — confirmado como correcto para el modelo de SUPER GEEK. Abonos previos = formas de pago ya recibidas; saldo pendiente = forma de pago/cobro al momento de facturar. **Checklist ítem 9 (sección 1) queda resuelto.**
2. **El RUC ya tiene el ambiente de producción del SRI habilitado** y en uso activo hoy mismo por otro sistema de facturación (de pago) que van a abandonar al pasar a este sistema propio. **Esto introduce un riesgo nuevo, no contemplado en la versión anterior de este documento — ver el recuadro de la sección 1, ítem 4.**
3. **Mismos establecimientos** entre el sistema actual y el nuevo.
4. **Emisión controlada confirmada**: las primeras 3-5 facturas reales las emite únicamente el administrador/propietario.
5. **Sin límite legal para notas de crédito** — confirmado por el dueño (coincide con la fuente que indicaba que el tope de 12 meses fue eliminado). Se fija un **límite interno de negocio de 6 meses**, sin conflicto legal por ser más estricto que la norma.
6. **Proceso de consumidor final ya definido operativamente**: el vendedor informa al cliente en el momento de la venta que, si no entrega sus datos, la factura sale a "consumidor final" y **no admite devolución en ningún caso** (ni anulación ni nota de crédito). Si el cliente no acepta esa condición, se le piden los datos y se factura con identificación — nunca a consumidor final. Esto es un proceso de punto de venta, no solo una regla del SRI; ver nota de diseño en la sección 5.3.
7. **Diseño del movimiento contable de la nota de crédito, confirmado**: tipo **Egreso**, rubro/categoría **"Ajuste / Devolución por nota de crédito"** (separado de gastos operativos normales), vinculado tanto a la factura original como a la nota de crédito, para que el cuadre de caja y el reporte diario lo muestren distinguido de un gasto real.

---

## 0.2 Plan de cutover de otra sesión (aportado por el dueño) — contrastado contra el código y Airtable hoy

El dueño aportó un plan de paso a producción escrito en una sesión anterior con otro chat de Claude, con checklist propio. Se contrastó punto por punto contra el estado real del código y de Airtable en esta sesión:

| Punto del plan aportado | Estado verificado hoy (2026-07-16) |
|---|---|
| RUC `1003710272001` ya emite en producción con el sistema de pago — no hay que recertificar ante el SRI. | Confirmado por el dueño en esta conversación (sección 0.1, punto 2). Reduce el alcance de gestión externa de Fase 17: probablemente solo falta el certificado `.p12` del *nuevo* sistema, no una certificación de RUC nueva. |
| Serie `001-002` habilitada en producción. | Confirmado — `SRI_ESTABLECIMIENTO=001` y `SRI_PUNTO_EMISION=002` en `.env.local` ya coinciden exactamente con la serie real (`001-002-000000660` en la captura). |
| Confirmar régimen tributario para fijar `CONSUMIDOR_FINAL_LIMITE` ($50 General/RIMPE Emprendedor vs $200 RIMPE Negocio Popular). | **Sigue pendiente — no se puede verificar desde el código.** `CONSUMIDOR_FINAL_LIMITE` no está seteada en `.env.local`, así que el sistema usa el default de `lib/facturacion/config.ts:69` → **$50**. Eso es correcto solo si el régimen es General o RIMPE Emprendedor. **Pregunta directa: ¿en qué régimen tributario está SUPER TIENDA GEEK?** Si es RIMPE Negocio Popular, hay que setear `CONSUMIDOR_FINAL_LIMITE=200` antes de producción — hoy se estarían pidiendo datos de cliente en ventas de $50-$199 que en realidad no lo requerirían. |
| Confirmar que el último número del sistema viejo es el correcto para arrancar el nuevo en `siguiente + 1`. | Verificado en vivo — ver ítem 4 de la sección 1: Airtable ya tiene registros de pruebas hasta el 675, que es mayor al 660 del sistema viejo, así que el arranque en 676 es seguro **hoy**. Falta la re-verificación en el momento exacto del corte (ver fila siguiente). |
| Corregir "edifcio" → "edificio" en `SRI_DIR_MATRIZ`. | **Ya no aplica — ya está corregido.** `.env.local` línea 27 dice hoy `"...edificio Kaillari"`, sin el typo. Este punto del plan viejo ya se resolvió en algún momento entre esa sesión y hoy. |
| Decidir si facturar descuenta stock en Shipping Items. | **Ya implementado** — Fase 16 PR3 (`postEmision()`) marca el Shipping Item `Estado Item="Vendido"` al autorizarse una factura con `origen`. **Hallazgo nuevo, no estaba en el plan viejo: `postEmision()` no tiene ningún guard de ambiente** (a diferencia del puente contable, que sí lo tiene). Esto significa que **hoy, en pruebas, probar el botón "Emitir factura" desde la cuenta unificada con una orden/operación real ya marca el repuesto real como "Vendido"** aunque la factura sea contra `celcer` y no cuente ante el SRI. Es probablemente la causa de las inconsistencias de inventario que `docs/CIERRE_FASE16.md` (ítem 20) ya había detectado en los Shipping Items `REP-000010`/`REP-000011`. **Recomendación: antes de abrir Fase 17 al equipo, auditar si hay más Shipping Items reales marcados "Vendido" por pruebas de este tipo y corregirlos a mano**, y decidir si vale la pena agregar un guard de ambiente a `postEmision()` para que esto no se repita si alguna vez vuelven a probar en `pruebas` después del cutover. |
| DETENER el sistema de pago en la serie `001-002` en el momento del corte; los dos sistemas no pueden emitir a la vez en la misma serie. | Sigue siendo el paso operativo correcto y necesario — inclúyelo tal cual en la ejecución de Fase 17 (ver "Orden de ejecución" en la sección 1). |
| Primera factura real controlada, de monto pequeño, verificando estado AUTORIZADO, fila en Airtable, copia en disco, correo, RIDE con "AMBIENTE: PRODUCCIÓN", y aparición en SRI en Línea. | Coincide exactamente con el plan de emisión controlada ya confirmado por el dueño (sección 3) — se puede usar este checklist de verificación tal cual para cada una de las 3-5 facturas controladas. |

---

## 1. Checklist Fase 17 — confirmado contra el código de hoy

Fuente: `docs/CIERRE_FASE16.md` tabla C, ítems 5-14 (con severidad ya asignada por esa auditoría). Confirmado línea por línea contra `lib/facturacion/` en esta revisión.

| # | Qué hay que hacer | Severidad | Confirmado hoy en código |
|---|---|---|---|
| 1 | ~~Certificado `.p12` de producción~~ — **corrección 2026-07-16: esto no era un trámite pendiente, era una duda mal planteada por la auditoría original.** La firma electrónica (el `.p12`) es tu identidad digital como contribuyente — la emite una entidad certificadora (no el SRI) y es la misma para cualquier trámite tributario, sin distinción de "pruebas" o "producción". Esa distinción (`SRI_AMBIENTE`) es solo la dirección web a la que se envía el XML firmado (`celcer` para pruebas, `cel` para producción) — el código lo confirma: `firmaPath`/`firmaPassword` se leen exactamente igual sin importar el valor de `SRI_AMBIENTE` (`lib/facturacion/config.ts`). El dueño confirmó además que esta firma ya está configurada en Vercel y ya se usa hoy para pruebas. **No hay ningún trámite nuevo que hacer aquí.** | Resuelto — no bloquea nada | `SRI_FIRMA_PATH`/`SRI_FIRMA_PASSWORD` en `.env.local`, independientes de `SRI_AMBIENTE`. |
| 2 | **Cambiar `SRI_AMBIENTE` de `"1"` a `"2"`**. | Alta (trivial de ejecutar) — debe ser el **último** paso | `lib/facturacion/config.ts:73-76`. Sin esta variable, el sistema asume `"1"` por defecto — nunca se activa producción "por accidente" si se olvida, pero tampoco avisa si se deja mal puesta. |
| 3 | **Confirmar `SRI_ESTABLECIMIENTO`/`SRI_PUNTO_EMISION`** autorizados para producción ante el SRI. | Alta — bloquea el cutover | Variables requeridas sin fallback (`config.ts:99-100`) — gestión externa. |
| 4 | **Continuidad de secuencial — verificado en vivo el 2026-07-16.** Confirmado: mismo punto de emisión (`001-002`) que el sistema de facturación actual. Consultado directamente en Airtable ("Facturas Electrónicas"): el **máximo secuencial que existe hoy en la tabla es 675** (registro `001-002-000000675`, `Ambiente=PRUEBAS`, autorizado el 2026-07-10 contra `celcer`). El sistema viejo, según la captura del dueño, llegó a `001-002-000000660` el 14/07/2026. **Como ya existen registros en Airtable, `SRI_SECUENCIAL` (env var) queda sin efecto** — `asignar.ts` solo usa esa semilla cuando la tabla está vacía; con 40 registros ya presentes, el próximo número que asignará el sistema al pasar a producción va a ser automáticamente `676` (675 + 1), sin importar qué diga la variable de entorno. **676 > 660 → no hay colisión hoy.** Único riesgo real que queda: que el sistema viejo emita más facturas entre hoy y el momento exacto del corte y supere el 675 antes de que este sistema tome el control — por eso, justo antes de cambiar `SRI_AMBIENTE`, hay que volver a mirar el último número del sistema viejo una vez más y detener su emisión en esa serie (tal como recomienda el plan de la sección 0.2 abajo). | **Resuelto — verificado en vivo, sin acción de código pendiente.** Queda solo la re-verificación operativa en el momento del corte. | Confirmado por consulta directa a Airtable (MCP), no solo por lectura de código. |
| 5 | **Eliminar `SMTP_TEST_TO`**. | **Alta** — si se olvida, ningún cliente real recibe el RIDE por correo, sin error visible | `lib/facturacion/correo/enviarRide.ts:8,48-50`. Mientras esté seteada, todos los correos se fuerzan al buzón de pruebas. Confirmar que hoy está seteada en `.env.local` (no se leyó el valor, solo el nombre) y quitarla como parte del cutover. |
| 6 | **Persistencia durable de respaldos** (`FACTURAS_DIR`). | **Media** — corregido 2026-07-16, ver explicación abajo. No es tan grave como se planteó originalmente. | Ver "Corrección 2026-07-16" justo después de esta tabla. |
| 7 | **Revisar soporte de `maxDuration=90`** en el hosting de producción final. | Media | Usado en `emitir`, `reintentar`, `sincronizar`. Confirmar en la config de Vercel del proyecto de producción real (no se encontró `vercel.json` en el repo — la config vive en el dashboard de Vercel). |
| 8 | **Lock del secuencial en memoria de un solo proceso**, no distribuido. | Media — riesgo bajo carga concurrente real, no reproducido | Mitigado hoy solo por reintento automático ante error SRI 43/45 (duplicado). Aceptable para el volumen actual del taller; revisar si el volumen de facturación sube mucho. |
| 9 | ~~Validación final del contador~~ sobre facturar el total de la cuenta (no solo lo abonado), con abonos como formas de pago. | **Resuelto 2026-07-16** — confirmado como correcto por el dueño (ver sección 0.1, punto 1). | Ver sección 6. |

### 1.0.1 Corrección 2026-07-16 — `FACTURAS_DIR` no era tan grave como se dijo: la tabla "Facturas Electrónicas" ya guarda una segunda copia

El dueño preguntó, con razón, si la tabla Airtable "Facturas Electrónicas" no era ya el respaldo de largo plazo. Revisando `lib/facturacion/almacenamiento/repositorio.ts` con más cuidado: **sí lo es, parcialmente, y ya está funcionando así hoy** — la explicación anterior de este documento fue incompleta.

Cómo funciona realmente hoy, cada vez que se autoriza una factura (`persistirAutorizado()`):
1. Intenta guardar el XML (y el PDF del RIDE) en el disco del servidor (`FACTURAS_DIR`) — best-effort, si falla no bloquea nada.
2. Crea la fila en Airtable con todos los datos de la factura.
3. Sube el XML autorizado y el RIDE como **adjuntos dentro de esa misma fila de Airtable** (campos "XML Autorizado" y "RIDE PDF") — esto **sí es durable**, Airtable no se borra cuando se actualiza el código de la app, a diferencia del disco.

Es decir, **hoy ya hay dos copias de cada factura real**: una en el disco temporal del servidor, y otra dentro de Airtable. La de Airtable es la que realmente sobrevive en el tiempo.

**¿Entonces por qué sigue siendo un pendiente?** Porque cada uno de esos dos pasos puede fallar de forma independiente, y si los dos fallan para la misma factura, ahí sí se pierde la copia local (la factura sigue siendo válida y consultable directamente en el portal del SRI, pero tú te quedas sin tu copia). Si falla solo la subida a Airtable, el sistema deja una advertencia visible en la fila ("⚠ ADJUNTO PENDIENTE") pero **no reintenta solo** — alguien tiene que notar esa advertencia y resincronizar a mano antes de que una actualización del código borre la copia del disco, que es la única que quedaría en ese momento.

**Severidad correcta: Media, no Alta.** No es que las facturas reales vayan a "desaparecer" sin más — hay redundancia real hoy. Lo que falta es (a) que el disco sea durable también (Vercel Blob, para no depender de que Airtable sea la única copia que sobrevive), y (b) que la subida a Airtable se reintente sola en vez de solo avisar. Ninguna de las dos es urgente para poder emitir las primeras facturas controladas — sí conviene resolverlas antes de que el volumen suba y sea más difícil revisar advertencias una por una a mano.

### 1.1 Hallazgo crítico adicional (2026-07-16, verificado en vivo): el descuento de inventario NO usa el campo `Cantidad`

El dueño preguntó explícitamente cómo se descuenta el inventario al facturar. La respuesta verificada contra el código y contra datos reales de Airtable:

- **`postEmision()` (el único mecanismo que toca inventario hoy, solo en facturas del gancho con `origen`) nunca lee ni escribe el campo `Cantidad`.** Lo único que hace es cambiar `Estado Item` a `"Vendido"` y enlazar la `Factura` — un cambio de **estado del registro completo**, no un descuento numérico.
- **La disponibilidad para facturar tampoco se evalúa por `Cantidad`.** El mostrador (`lib/facturacion/airtable/productos.ts`) filtra solo por el checkbox `Disponible para venta`; el gancho (`lib/facturacion/gancho/construccion.ts`) bloquea solo si `Reservado = false` o si el item ya tiene una factura previa. **No existe hoy ningún chequeo de `Cantidad >= 1` ni ninguna alerta de "sin stock" — el sistema no sabe que ese campo existe.**
- **Dato real de Airtable que confirma que esto no es solo teórico**: la tabla "Shipping Items" mezcla dos modelos distintos hoy. Algunos repuestos son un registro por unidad física (`REP-000010` y `REP-000011`, ambos "Memoria RAM DDR4 Samsung 8GB", cada uno con `Cantidad=1` — dos registros para dos unidades). Otros son un solo registro para varias unidades (`REP-000007`, "Memoria RAM DDR Hynix 1GB", **`Cantidad=5`** en un único registro; `REP-000002`, **`Cantidad=2`**). **Si hoy se facturara `REP-000007`, `postEmision()` marcaría las 5 unidades como vendidas de una sola vez, aunque el cliente haya comprado solo una** — no hay forma de vender 1 de 5 sin perder de vista las 4 restantes.
- **Sobre "si hay un error debe interrumpirse la descarga"**: parcialmente cierto. `postEmision()` solo se ejecuta si `resultado.estado === "AUTORIZADO"` (correcto — nunca toca inventario antes de que el SRI apruebe). Pero si falla al escribir un item puntual, **no hay rollback ni alerta activa**: queda registrado en el campo `Sincronización Inventario` como `"ERROR"` con el detalle, silenciosamente, y existe un endpoint de reintento manual (`/sincronizar`) — nadie se entera salvo que revise el historial de facturación.

**Esto es un vacío real, independiente de Fase 17/18, que conviene resolver antes de que el volumen de ventas reales dependa de que el inventario quede bien registrado.**

**Auditoría de datos en vivo (2026-07-16): hoy no hay ningún Shipping Item afectado.** Se consultó Airtable directamente: cero registros en "Shipping Items" tienen hoy algún valor en el campo `Factura` (`isNotEmpty` sobre toda la tabla → 0 resultados). Los dos sospechosos de `docs/CIERRE_FASE16.md` ítem 20 (`REP-000010`, `REP-000011` — la "control positivo" de esa auditoría) hoy están ambos `Estado Item="En tránsito"`, `Disponible para venta=true`, sin ningún link a factura — alguien ya los limpió a mano entre el 10 y el 16 de julio. **No hace falta ninguna corrección de datos antes de Fase 17.**

El hueco de código quedó cerrado el 2026-07-16 — rama `fix/post-emision-guard-ambiente`, commit `ee44ae5`, PR pendiente de abrir. `postEmision()` ahora tiene el mismo guard fail-closed que ya usaba el puente contable (`ambiente !== "2"` → no toca nada), con 2 tests nuevos que lo cubren.

### 1.2 Decisión del dueño (2026-07-16): sí, `Cantidad` debe ser un descuento real por SKU

El dueño confirmó que quiere el modelo de **cantidad real por SKU** (un registro puede representar varias unidades; facturar debe descontar exactamente lo vendido, bloquear y alertar en 0). Esto es trabajo nuevo, no un ajuste menor — toca 3 puntos del módulo:

1. **Precondición de disponibilidad** (`lib/facturacion/gancho/construccion.ts`, `lib/facturacion/airtable/productos.ts`): hoy solo miran `Reservado`/`Disponible para venta` (booleanos). Hay que sumar `Cantidad >= cantidad solicitada` como condición — y si no alcanza, bloquear con un mensaje explícito de "sin stock disponible" (tal como pidió el dueño), no solo con el genérico "no reservado".
2. **`postEmision()`**: hoy hace `Estado Item = "Vendido"` sobre todo el registro. Pasa a: `PATCH Cantidad = Cantidad - cantidadFacturada`; solo cuando el resultado llega a 0, recién ahí poner `Estado Item = "Vendido"` y `Disponible para venta = false`. Si queda `Cantidad > 0`, el registro sigue disponible para la siguiente venta.
3. **Concurrencia**: dos facturas simultáneas sobre el mismo repuesto con poco stock podrían leer el mismo `Cantidad` antes de que ninguna descuente (mismo tipo de condición de carrera que ya existe en el secuencial, sección 1 ítem 8) — conviene releer `Cantidad` justo antes de escribir y fallar si ya no alcanza, no solo confiar en el valor leído al precargar el formulario.

**Beneficio colateral para Fase 18**: con este modelo, revertir una nota de crédito con línea de producto es más simple — sumar de vuelta a `Cantidad` en vez de tener que decidir a qué "Estado Item" volver (sección 5.4 se actualiza cuando se construya esto).

**No hace falta consolidar los registros duplicados de hoy** (ej. `REP-000010`/`REP-000011`, dos registros de `Cantidad=1` para el mismo producto) — el nuevo mecanismo funciona igual de bien con un registro por unidad que con un registro para varias; es una decisión de prolijidad de datos, no un requisito técnico.

**Recomendación de secuencia**: construir esto antes de abrir Fase 17 a todo el equipo de técnicos (paso 9 de la sección 1), no antes de la emisión controlada inicial (solo administrador, bajo volumen, riesgo bajo mientras tanto). No es bloqueante para el cutover a producción en sí (no es un requisito del SRI), pero sí para operar con seguridad una vez que el volumen suba.

---

**Orden de ejecución recomendado dentro de Fase 17 (actualizado con datos verificados en vivo):**
1. Confirmar régimen tributario para fijar `CONSUMIDOR_FINAL_LIMITE` ($50 vs $200) — único dato de negocio que sigue sin confirmar (sección 0.2).
2. Confirmar certificado `.p12` de producción para este sistema (el RUC y la serie ya están habilitados, no hay que recertificar desde cero).
3. Resolver persistencia durable de `FACTURAS_DIR` (técnico, antes de tocar el ambiente).
4. Quitar `SMTP_TEST_TO`.
5. Confirmar `maxDuration` en el hosting real.
6. Auditar y corregir Shipping Items reales marcados "Vendido" por pruebas del gancho (sección 0.2, hallazgo de `postEmision()` sin guard de ambiente).
7. Emisión controlada (sección 3) — ya confirmada por el dueño.
8. **Justo antes de este paso**: volver a mirar el último número real del sistema viejo una vez más y **detener su emisión en la serie `001-002`** — los dos sistemas no pueden emitir a la vez en la misma serie.
9. **Último paso**: `SRI_AMBIENTE=1` → `"2"`.

---

## 2. Conexión con el Sistema Contable SG — ya construida, sin trabajo pendiente de Fase 17

El puente vive en `lib/finanzas/puentes/facturacion.ts`, se invoca automáticamente después de cada emisión autorizada (`app/api/facturacion/emitir/route.ts`), y ya resuelve exactamente el riesgo que pedías verificar (que el ingreso se registre sin duplicar el abono ya registrado):

- **Guard de ambiente**: `if (resultado.ambiente !== "2") return;` — ninguna factura de pruebas puede escribir en el libro. Confirmado con test dedicado (`lib/finanzas/__tests__/20-2.3.ambiente-pruebas-ignorado.test.ts`).
- **Factura de mostrador** (sin orden/operación de origen): crea un movimiento de Ingreso nuevo por cada forma de pago.
- **Factura sobre Orden/Operación** (anti-doble-conteo): para cada abono ya vigente, **marca el movimiento existente como facturado** (`facturaElectronicaId` + `estadoDistribucion: "Pendiente de clasificar"`) en vez de crear uno nuevo. Solo crea movimiento nuevo por el "saldo" — el dinero cobrado en el instante de facturar que no venía de un abono previo. Este mecanismo ya se probó con datos reales (`docs/DISENO_FASE20_2_INGRESOS.md`, "prueba de fuego").

**Conclusión:** no hay ningún cambio de código pendiente en este punto para Fase 17. El único motivo por el que hoy no se ve nada en el libro es que ninguna factura real (ambiente `"2"`) se ha emitido todavía — el guard está haciendo exactamente su trabajo.

---

## 3. Flujo de emisión controlada inicial (confirmado por el dueño)

No existe hoy ningún mecanismo técnico de "apertura gradual" (feature flag por usuario, ni límite de facturas). La emisión controlada tendría que hacerse operativamente, no en código, salvo que decidan construir un flag. Propuesta concreta:

1. **Antes de abrir a todo el equipo**, cambiar `SRI_AMBIENTE=2` y que **solo el dueño/administrador** (vos) emita las primeras 3-5 facturas reales, controladas una por una: revisar el XML, el RIDE, el correo al cliente, y el movimiento generado en el Sistema Contable SG.
2. Verificar con el contador esas primeras facturas antes de continuar (ver sección 6) — es la validación "en vivo" más confiable, más que revisar el código en abstracto.
3. Confirmar que `postEmision()` marcó correctamente el inventario (`Estado Item="Vendido"` + link `Factura`) en las facturas con repuestos.
4. Solo después de ese lote controlado, avisar al equipo de técnicos que el botón "Emitir factura" desde la cuenta unificada ya genera documentos reales ante el SRI (hoy no hay ningún aviso ni distinción visual en la UI entre pruebas y producción más allá de la etiqueta en el RIDE y el correo — considerar agregar un banner visible mientras dure la fase de transición, para que nadie facture "de prueba" por costumbre).

No se encontró ningún control de permisos por rol que distinga "puede emitir en producción" de "puede emitir" — el guard de sesión (`requireFacturacionSession`) es binario. Si quieren un control técnico real de apertura gradual (no solo un acuerdo de equipo), habría que construirlo — está fuera del alcance de Fase 17 tal como está definida hoy, pero es una decisión a tomar antes de empezar.

---

## 4. Reglas SRI 2026 para Fase 18 (verificadas, no asumidas)

Fuente: Resolución NAC-DGERCGC25-00000017 (vigente desde el 1 de agosto de 2025, con dos disposiciones que entraron en vigor el 1 de enero de 2026). Confirmado contra tres fuentes independientes (NMS Abogados, Factuplan, bp-one) — no hay contradicción entre ellas en los puntos siguientes.

**Son dos mecanismos distintos, no uno solo:**

| | Anulación directa | Nota de crédito |
|---|---|---|
| Qué hace | Marca la factura como nula, como si nunca hubiera existido | Comprobante **nuevo** que reduce el efecto de la factura original sin borrarla |
| Plazo | Hasta el **día 7 del mes siguiente** a la emisión (se extiende al siguiente hábil si cae feriado) | **Sin límite legal** — confirmado por el dueño el 2026-07-16 (coincide con la fuente que indicaba la eliminación del tope de 12 meses). **Límite interno de negocio: 6 meses**, decisión propia de SUPER GEEK, más estricto que la norma y sin conflicto legal. A codificar como constante de negocio, no como límite del SRI. |
| Requiere aceptación del receptor | Sí, 5 días hábiles. Sin respuesta → la solicitud queda sin efecto y la factura sigue firme | Sí, 5 días hábiles. Sin respuesta o con rechazo → la nota no surte efecto |
| Consumidor final | **Prohibido desde el 1-ene-2026** — vigente ya hoy | **Prohibido desde el 1-ene-2026** — vigente ya hoy, ni siquiera parcial |
| Después del plazo de anulación directa | — | Es el único camino que queda para anular o reducir una factura ya firme |

**Confirmado explícitamente en las fuentes:** una devolución o anulación de una factura a consumidor final **no genera ningún comprobante electrónico** — se maneja administrativamente (devolución de dinero por caja, ajuste de inventario, registro de la pérdida operacional), y el IVA ya causado queda a favor del SRI. Esto es directamente relevante para SUPER GEEK, porque hoy `assertConsumidorFinalPermitido()` en `lib/facturacion/reglas/consumidorFinal.ts` ya identifica al comprador tipo `"07"` (Consumidor Final) — esa misma función/criterio es la que Fase 18 debe reutilizar para **bloquear** cualquier intento de nota de crédito o anulación sobre esas facturas, antes de tocar el SRI.

**Fuera del alcance de Fase 18 tal como la describiste** (mencionado aquí solo para no confundir): existen las "notas de crédito desmaterializadas" del SRI, un mecanismo distinto para contribuyentes con saldo a favor (exportadores). No tiene relación con lo que necesita el taller.

---

## 5. Diseño propuesto para Fase 18

### 5.1 Qué dispara una nota de crédito / anulación

Sobre una factura ya `AUTORIZADO` (nunca sobre `BORRADOR`, que se descarta directamente, ni sobre una ya `ANULADA`). El disparador natural en la UI es un botón en el historial de facturación (`components/facturacion/HistorialFacturas.tsx`) y/o en el detalle de la orden, una vez resuelto el pendiente #2 de `docs/CIERRE_FASE16.md` ("mostrar la factura en la orden").

### 5.2 Contra qué factura

Toda nota de crédito referencia obligatoriamente la clave de acceso de 49 dígitos de la factura original — ya existe `claveAcceso.ts` verificado, reutilizable sin cambios. La anulación directa referencia el mismo dato pero se tramita por un canal distinto (portal SRI en línea o, si aplica, el propio flujo de recepción/autorización si el SRI lo expone por webservice — **a confirmar contra la documentación técnica de anulación del SRI**, que no se revisó en este documento porque el foco fue el marco legal, no el WSDL específico de anulación).

### 5.3 Reglas a aplicar antes de emitir

1. Bloquear si `tipoIdentificacionComprador === "07"` (Consumidor Final) — reutilizar `assertConsumidorFinalPermitido` o extraer el criterio a un helper compartido. Confirmado por el dueño: es una regla absoluta, sin excepción ("no son anulables en ningún caso").
2. Bloquear si la factura no está `AUTORIZADO`.
3. Para anulación directa: bloquear si ya pasó el día 7 del mes siguiente a la emisión — forzar el camino de nota de crédito en su lugar.
4. Para nota de crédito: bloquear si pasaron más de **6 meses** desde la factura original (límite interno de negocio, sección 4 — no es límite del SRI, así que conviene que el mensaje de error lo aclare para no confundir a quien lo vea).
5. Requiere motivo explícito (texto libre) — el SRI observa motivos genéricos tipo "ajuste".
6. Fecha de emisión de la nota nunca puede ser anterior a la de la factura original.
7. IVA de la nota debe usar la misma tarifa que tenía la línea original, no la tarifa vigente al momento de emitir la nota (relevante si cambia la tarifa de IVA entre medio).

**Nota de diseño — proceso de consumidor final en el punto de venta (confirmado por el dueño):** el vendedor ya informa al cliente, al momento de la venta, que si no entrega sus datos la factura sale a "consumidor final" y sin opción de devolución; si el cliente no lo acepta, se piden los datos y se factura con identificación. Esto es un proceso operativo del mostrador/taller, no una validación del sistema — pero como Fase 18 va a *rechazar* técnicamente cualquier nota de crédito sobre una factura a consumidor final, conviene que `FacturacionForm.tsx` muestre ese aviso explícito en el momento de elegir "Consumidor Final" (hoy solo bloquea por monto vía `assertConsumidorFinalPermitido`, no advierte sobre la irreversibilidad). Es una mejora de UX recomendada para Fase 18, no un bloqueante.

### 5.4 Impacto en inventario — decidido 2026-07-16, depende de la sección 1.2

El dueño confirmó: al anular una factura o autorizarse una nota de crédito, **el sistema debe hacer el mismo proceso de descargo de inventario pero en inverso.** Con el modelo de `Cantidad` real por SKU ya decidido (sección 1.2), la reversión queda más simple que la propuesta original de este documento (que asumía revertir un `Estado Item` booleano):

- Una función espejo (`revertirPostEmision` o similar) que, para las líneas de producto afectadas por la nota de crédito/anulación: **suma de vuelta a `Cantidad`** la cantidad que se está acreditando/devolviendo — el inverso exacto del `PATCH Cantidad = Cantidad - cantidadFacturada` de la sección 1.2.
- Si `Cantidad` vuelve a subir por encima de 0 después de haber llegado a 0 (el registro se había marcado `Estado Item="Vendido"` y `Disponible para venta=false`), hay que revertir también esos dos campos — no alcanza con solo tocar `Cantidad`.
- Mantiene el link a la factura original y agrega el link a la nota de crédito/anulación, para trazabilidad completa en ambos sentidos (igual criterio que la sección 5.5 para el movimiento contable).
- Solo aplica si la nota de crédito/anulación es por el **total** de esa línea de producto (devolución física real); una nota de crédito parcial en monto (ej. descuento sin devolución) no debería tocar inventario — esto sigue siendo una decisión de negocio a confirmar caso por caso al construirlo, ya adelantada como pregunta en la sección 5.3.

Este ítem queda **pendiente de construcción junto con la sección 1.2** — mismo momento, mismo conjunto de archivos (`postEmision.ts` y su futuro espejo), por eso conviene diseñarlos y construirlos juntos en vez de por separado.

### 5.5 Impacto en el Sistema Contable SG — diseño confirmado por el dueño

Hoy `procesarPuenteFacturacion` solo sabe crear/marcar movimientos de Ingreso al emitir. Fase 18 necesita el espejo, con este diseño ya decidido (2026-07-16):

- **Tipo de movimiento:** Egreso.
- **Rubro/categoría:** "Ajuste / Devolución por nota de crédito" — **separado** de gastos operativos normales, para que el cuadre de caja y el reporte diario muestren con claridad que no fue un gasto real sino una devolución/ajuste de una venta ya facturada. Requiere confirmar si esta categoría ya existe como rubro en el Sistema Contable SG (Fase 20) o hay que crearla — revisar `docs/DISENO_FASE20_2_INGRESOS.md` y el esquema de rubros de Fase 26 antes de construir, para no introducir una categoría que choque con la clasificación automática planeada ahí.
- **Vínculos:** el movimiento debe enlazar tanto a la nota de crédito como a la factura original — trazabilidad completa en ambos sentidos.
- **Guard de ambiente:** igual que en facturación, debe ignorar notas de crédito que no estén en ambiente `"2"` (mismo patrón que `procesarPuenteFacturacion`, para no contaminar el libro con notas de prueba).

### 5.6 Lo que ya existe y no hay que reconstruir

- Estado `"ANULADA"` ya reservado en el tipo de Airtable (`lib/facturacion/airtable/facturas.ts:38`) y ya excluido correctamente de los cálculos de secuencial (`asignar.ts`) e idempotencia (`idempotencia.ts`) — la base de datos ya anticipó esta fase.
- `claveAcceso.ts` reutilizable para la clave de la nota (con su propio dígito de tipo de comprobante).
- La firma XAdES-BES (`ec-sri-invoice-signer`) firma los 6 tipos de comprobante del SRI, notas de crédito incluidas — no hay trabajo nuevo de firma.
- El cliente SOAP de recepción/autorización (`lib/facturacion/sri/`) es genérico por tipo de comprobante — reutilizable, a confirmar que el WSDL de notas de crédito use los mismos endpoints o unos específicos.

---

## 6. Validación con el contador — resuelta el 2026-07-16

Las dos validaciones que se pedían quedaron resueltas (ver sección 0.1):
1. Facturar el total de la cuenta con abonos como formas de pago → confirmado correcto.
2. Revisión en vivo de las primeras 3-5 facturas reales controladas → confirmado que el contador/dueño las revisará antes de abrir el flujo al equipo (sección 3).

**Único pendiente nuevo que quedó abierto de esta ronda de preguntas** (no es del contador, es información operativa sobre el sistema de facturación que van a reemplazar): confirmar si el **punto de emisión** del sistema de facturación actual (el que se va a abandonar) es el mismo que va a usar este sistema nuevo, y si es así, cuál es el **último secuencial autorizado** que emitió, para arrancar `SRI_SECUENCIAL` en `último + 1` y no duplicar números de factura ante el SRI. Ver el ítem 4 del checklist en la sección 1 — es hoy el único bloqueante real que queda para el cutover de Fase 17, junto con la gestión externa del certificado.

---

## 7. Próximos pasos recomendados (actualizado 2026-07-16, con datos verificados en vivo contra Airtable)

1. **Único dato de negocio que sigue pendiente: régimen tributario**, para confirmar si `CONSUMIDOR_FINAL_LIMITE` debe ser $50 (default actual) o $200 (RIMPE Negocio Popular).
2. Confirmar certificado `.p12` de producción ante el SRI (el RUC y la serie `001-002` ya están habilitados en producción y en uso — no hay recertificación de cero).
3. Resolver `FACTURAS_DIR` durable (Vercel Blob u otra opción) — antes de la primera factura real, no después.
4. Quitar `SMTP_TEST_TO`, confirmar `maxDuration` en el hosting real.
5. Auditar Shipping Items reales que pruebas anteriores del gancho puedan haber marcado "Vendido" incorrectamente (sección 0.2) — antes de que esos items se muevan en producción real.
6. Emisión controlada de 3-5 facturas reales, solo administrador/propietario (sección 3) — ya confirmada, contador revisa en vivo.
7. **Justo antes de cambiar el ambiente**: revisar una última vez el número más alto emitido por el sistema viejo y detener su emisión en la serie `001-002` — hoy (660) queda cómodamente por debajo del próximo número que asignará este sistema (676, verificado contra Airtable), pero conviene reconfirmarlo en el momento exacto del corte, no solo hoy.
8. Cambiar `SRI_AMBIENTE` a `"2"` — último paso técnico. (`SRI_SECUENCIAL` como variable de entorno no tiene efecto real: Airtable ya tiene registros, así que el sistema sigue su propio `MAX(Secuencial)+1` sin importar esa variable.)
9. **Construir el descuento de inventario por `Cantidad` real** (sección 1.2, decidido por el dueño) — antes de abrir el flujo al equipo, no antes de la emisión controlada.
10. Abrir el flujo al equipo de técnicos.
11. Empezar Fase 18 con las decisiones ya tomadas en la sección 0.1 (límite interno de 6 meses, diseño del movimiento contable, regla absoluta de consumidor final) — falta solo definir la regla de reversión de inventario (sección 5.4: ¿toda nota de crédito con línea de producto implica devolución física?) y construir en rama propia con commits frecuentes, igual que el resto del proyecto.

---

## Fuentes consultadas (Fase 18, reglas SRI 2026)

- [Anulación de comprobantes electrónicos: régimen vigente y reglas clave que aplican desde 2026 — NMS Abogados](https://nmslaw.com.ec/blog/2026/01/04/anulacion-comprobantes-electronicos-2026-ecuador/)
- [Notas de crédito y débito electrónicas en Ecuador 2026: guía — Factuplan](https://factuplan.com.ec/blog/notas-credito-debito-electronicas-ecuador-2026)
- [Ecuador: SRI ajusta plazos y condiciones para la anulación de comprobantes electrónicos y emisión de notas de crédito — bp-one](https://bp-one.com/ecuador-sri-ajusta-plazos-y-condiciones-para-la-anulacion-de-comprobantes-electronicos-y-emision-de-notas-de-credito/)
- Documentos internos ya existentes en el repo: `docs/AUDITORIA_FACTURACION_FASE16.md`, `docs/CIERRE_FASE16.md`, `docs/DISENO_FASE16_GANCHO_FACTURACION.md`, `docs/DISENO_FASE20_2_INGRESOS.md`, `docs/facturacion-sri-brief.md`.
