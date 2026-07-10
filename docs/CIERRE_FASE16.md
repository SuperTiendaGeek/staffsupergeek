# Cierre Fase 16 — Gancho Cuenta Unificada → Facturación

**Fecha de esta auditoría:** 2026-07-10
**Tipo:** auditoría de solo lectura — igual que `docs/AUDITORIA_FACTURACION_FASE16.md` que abrió la fase. No se modificó ningún archivo de código; el único archivo nuevo es este documento.
**Estado de la fase:** funcionalmente completa y probada en vivo (PR 1-3 mergeados). PR 4 (pulido) queda para después de este cierre.

---

## 0. Resumen de la fase

La Fase 16 conecta el módulo de facturación electrónica (SRI) existente con la "cuenta unificada" (Fase 11: Orden de Reparación ↔ Operación Comercial) mediante un **gancho**: un botón "Emitir factura" en el panel de cuenta unificada que precarga el formulario de facturación con cliente, líneas, tarifas de IVA y formas de pago derivadas de la orden/operación, y que al autorizarse descuenta el inventario correspondiente.

Se construyó en 3 PRs grandes (más 5 fixes intermedios encontrados en pruebas en vivo antes del PR 2):

| PR | Título | Qué aportó |
|---|---|---|
| **PR 1** (#7) | Validación XSD en flujo real + regla consumidor final server-side | Endurecimiento previo: `assertXmlValidoSri()` y `assertConsumidorFinalPermitido()` conectados dentro de `emitirFactura()` (única fuente de verdad para todos los llamadores presentes y futuros). |
| #8-#12 | 5 fixes de producción encontrados probando PR1 en vivo | `__dirname`→`process.cwd()` en el XSD (bloqueaba toda emisión), RIDE con autorización en blanco (`esResultadoDefinitivo()`), certificado `.p12` vía `SRI_FIRMA_P12_BASE64` para Vercel, respaldo en disco best-effort (no tumba la emisión), `FACTURAS_DIR` absoluta + fallback a Airtable para el visor de RIDE/XML. |
| **PR 2** (#13) | Pre-factura desde cuenta unificada | `lib/facturacion/gancho/` (traductor, precondición dura de items, formas de pago desde abonos), `GET /api/facturacion/prefactura`, botón en `CuentaUnificadaPanel`, modo precargado de `FacturacionForm`. Corrección post-prueba en vivo: IVA incluido por línea (cuadre exacto al centavo) extendido a todo el formulario vía toggle, no solo al gancho. |
| **PR 3** (#14) | Post-emisión — descuento de inventario | `postEmision()`: al autorizarse una factura con origen, marca cada Shipping Item facturado `Estado Item="Vendido"` + link `Factura`, idempotente, con endpoint de reintento y aviso en el historial. |

**Decisiones de negocio clave cerradas durante la fase** (documentadas en `docs/DISENO_FASE16_GANCHO_FACTURACION.md` §1):
- La factura se emite por el **total de la cuenta**, no por lo abonado — los abonos viajan como formas de pago, el saldo pendiente como forma de pago adicional.
- Todos los precios de la cuenta unificada (repuestos y servicios) son precios **finales con IVA incluido** — se desglosan hacia adentro por línea (complemento, nunca sobre un subtotal agregado — ver la corrección de PR2 en la sección C de este documento).
- El modelo real de reserva de inventario: casillas `Reservado`/`Disponible para venta` (independientes) + `Estado Item` como campo logístico. La precondición de la pre-factura y la transición de venta (PR3) coinciden exactamente con ese modelo real, confirmado en producción.
- Mostrador y gancho **coexisten** — mismo formulario, mismo límite de consumidor final, mismos borradores.

---

## A. Estado de git y GitHub

### `git status`

Working tree de `main` **limpio** — nada sin commitear, nada sin push. La modificación suelta de `next-env.d.ts` que aparecía al inicio de esta fase ya no existe (quedó absorbida en algún commit intermedio o el archivo se regeneró igual; no hay diferencia pendiente hoy).

### Inventario de PRs de la fase (#7 en adelante)

**Los 8 PRs de la Fase 16 (#7-#14) están MERGEADOS. No queda ningún PR abierto en el repositorio (0 PRs abiertos en total).**

| # | Título | Rama | Estado | Merge |
|---|---|---|---|---|
| 7 | feat(facturacion): validación XSD en flujo real + regla consumidor final server-side (Fase 16, PR 1) | `feat/facturacion-hardening` | MERGED | 2026-07-08 14:14 |
| 8 | fix(facturacion): `__dirname` → `process.cwd()` en validarXsd.ts (bloqueaba toda emisión) | `fix/xsd-path-resolution` | MERGED | 2026-07-08 14:35 |
| 9 | fix(facturacion): RIDE con número/fecha de autorización en blanco | `fix/ride-autorizacion` | MERGED | 2026-07-08 14:36 |
| 10 | feat(facturacion): cargar el .p12 desde SRI_FIRMA_P12_BASE64 en runtime sin filesystem | `feat/firma-runtime` | MERGED | 2026-07-08 15:29 |
| 11 | fix(facturacion): respaldo en disco best-effort (no tumba la emisión) | `fix/archivo-no-fatal` | MERGED | 2026-07-08 15:54 |
| 12 | fix(facturacion): FACTURAS_DIR absoluta + fallback a Airtable para el visor de RIDE/XML | `fix/ride-fallback` | MERGED | 2026-07-08 16:32 |
| 13 | feat(facturacion): pre-factura desde cuenta unificada — gancho fase 16 PR 2 | `feat/gancho-prefactura` | MERGED | 2026-07-10 11:47 |
| 14 | feat(facturacion): post-emisión — descuento de inventario al facturar (Fase 16, PR 3) | `feat/gancho-postemision` | MERGED | 2026-07-10 12:45 |

No hay commits huérfanos de trabajo real sin mergear (ver detalle de ramas abajo — las dos ramas técnicamente "no mergeadas" no contienen trabajo nuevo).

### Ramas — candidatas a limpieza (solo listado, no se borró nada)

**Mergeadas a `main`, local y remota — candidatas rutinarias de limpieza post-merge:**

`feat/cutover-operaciones`, `feat/fase11-cuenta-unificada`, `feat/firma-runtime`, `feat/gancho-postemision`, `feat/gancho-prefactura`, `feat/horarios-codex`, `feat/migration-cutover-adm`, `feat/operaciones-comerciales`, `feat/tecnicos-abonos-nuevos`, `fix/archivo-no-fatal`, `fix/ride-autorizacion`, `fix/ride-fallback`, `fix/xsd-path-resolution`.

**Solo local, ya mergeada:** `prueba-ensayo` (rama antigua, contenido absorbido en `main`).

**Técnicamente NO mergeadas, pero sin trabajo real pendiente (hallazgo de esta auditoría):**

- **`feat/facturacion-hardening`** (local + remoto, tip `bf65e7c`) — esta era la rama de PR #7. Después de mergearse, quedó con **un commit adicional huérfano** (`bf65e7c fix(facturacion): resolver ruta del XSD con process.cwd(), no __dirname`) que nunca se abrió como su propia PR. Verificado: su contenido es **byte-a-byte idéntico** al commit `3d8da22` que sí llegó a `main` a través de PR #8 (`fix/xsd-path-resolution`) — mismo mensaje, mismo diff exacto en `lib/facturacion/xml/validarXsd.ts`. El propio PR #8 lo documenta: "quedó solo en la rama `feat/facturacion-hardening`, que ya no tiene PR abierto". Segura para borrar (local y remoto) — no hay nada que rescatar.
- **`audit/facturacion-fase16`** (solo local, tip `ce6418d`) — la rama de la auditoría inicial (Fase 0). Su único commit propio es `docs/AUDITORIA_FACTURACION_FASE16.md`, cuyo contenido en esa rama es **idéntico** al que hoy vive en `main`. Segura para borrar.

### `main` local == `origin/main`

Sí — ambos apuntan a `2e3afed` (Merge PR #14) tras hacer `git fetch` + fast-forward. Sin divergencia.

---

## B. Salud de `main`

### Suite completa de tests (pura, sin red)

Corrida sobre `main` limpio en `2e3afed`. **Todos verdes, sin excepción, sin regresiones nuevas:**

```
claveAcceso.test.ts              ✅
facturaXml.test.ts               ✅ (2 asserts "Assertion failed" impresos por consola — preexistentes, ver abajo)
firmar.test.ts                   ✅
16a.consumidorFinal.test.ts      ✅
16b.validacionXsd.test.ts        ✅
cola.esResultadoDefinitivo.test.ts ✅
resolverP12.test.ts              ✅
almacenamiento.respaldoDisco.test.ts ✅
directorioFacturas.test.ts       ✅
resolverArchivo.test.ts          ✅
pagos.test.ts                    ✅
gancho.construccion.test.ts      ✅
gancho.idempotencia.test.ts      ✅
gancho.regresionMostrador.test.ts ✅
ivaIncluido.test.ts              ✅
gancho.postEmision.test.ts       ✅
resolverGatesRepuestos.test.ts   ✅
repuestosStockV2ConOperacion.test.ts ✅
```

**Fallos conocidos preexistentes, distinguidos de cualquier cosa nueva:**

1. **`facturaXml.test.ts`** imprime 2 líneas `Assertion failed:` (`"Debe tener version 2.1.0.0"` y `"Los caracteres especiales deben estar escapados en el XML"`) vía `console.assert()`, que no interrumpe el proceso — el archivo termina con exit code `0` y "todos los asserts pasaron" igual. Documentado explícitamente como preexistente desde PR #7 ("verificado con `git diff main` sobre `construirFacturaXml.ts`, sin cambios" — nunca causado por ninguna rama de esta fase). Confirmado deterministic (3 corridas seguidas, mismo resultado).
2. **Ningún fallo nuevo** en ningún archivo.

**Tests de integración NO corridos** (requieren credenciales reales y llaman a celcer/Airtable/SMTP en vivo): `4a.secuencial`, `4c.ride`, `4e.integracion.fase4`, `5.ride-ajustes`, `5a.recuperar`, `5b.emitir664`, `6.shipping-item-firma`, `integracion.celcer` — fuera del alcance de una auditoría de solo lectura; no hay evidencia de que ningún cambio de la fase los afecte.

### `npm run typecheck`

Sin errores.

### `npm run build`

Build exitoso. **1 warning de Turbopack, preexistente:**

```
Encountered unexpected file in NFT list
./next.config.mjs
Import trace: App Route: ./next.config.mjs → ./lib/facturacion/almacenamiento/resolverArchivo.ts
```

Ya documentado como preexistente en PR #7 (entonces apuntaba a `ride/[claveAcceso]/route.ts`; hoy el import trace señala `resolverArchivo.ts`, introducido en PR #12 — mismo patrón de warning, mismo origen: `path.join(process.cwd(), ...)` en un route handler, no bloquea el build ni el runtime).

### Documentos de la fase — presentes y actualizados en `main`

- **`docs/AUDITORIA_FACTURACION_FASE16.md`** — presente, sin cambios desde la Fase 0 (es un documento histórico de auditoría inicial, no se esperaba que cambiara). Un dato se desactualizó por el propio avance de la fase: dice "Los 12 endpoints de `app/api/facturacion/`" — hoy son **14** (PR2 agregó `prefactura`, PR3 agregó `historial/[recordId]/sincronizar`) — ambos con guard confirmado (ver sección C). No amerita editar el documento histórico, solo dejarlo anotado aquí.
- **`docs/DISENO_FASE16_GANCHO_FACTURACION.md`** — presente y con **todas** las enmiendas esperadas: modelo real de reserva (§1 decisión #2), IVA incluido con complemento por línea y su extensión a todo el formulario vía toggle (§4.2, §4.3, §4.6), formas de pago con etiqueta de origen (§4.4), y la sección **§9 "PR 4 — pulido post-facturación (pendiente)"** con los dos puntos acordados.

---

## C. Consolidación de pendientes

Recorridos: los 8 PR bodies (#7-#14), los `TODO`/`FIXME` de `lib/facturacion/` y `components/facturacion/`, y ambos documentos de `docs/`. Tabla completa, ordenada por bloque y severidad.

| # | Descripción | Dónde quedó anotado | Severidad | Bloque |
|---|---|---|---|---|
| 1 | **Congelar la orden facturada**: al facturar desde el gancho, las tarjetas que alteran la cuenta (repuestos, servicios, productos digitales) deben quedar fijas — no debería poder seguirse editando/agregando/quitando debajo de una factura ya emitida. Abonos, historial de mensajes, archivos y estado general de la orden siguen vivos. | `docs/DISENO_FASE16_GANCHO_FACTURACION.md` §9 (PR 4a) | **Media** — integridad de datos: hoy nada impide editar una orden ya facturada, lo que puede desincronizar la cuenta del documento fiscal ya emitido. | PR 4 |
| 2 | **Mostrar la factura en la orden**: una vez emitida, la factura vinculada (con descarga de RIDE) debería verse en el detalle de la orden y como columna clicable en `/tecnicos/ordenes`. Hoy solo se encuentra buscándola en el historial de facturación. | `docs/DISENO_FASE16_GANCHO_FACTURACION.md` §9 (PR 4b) | Baja — UX/descubribilidad, no bloquea nada funcional. | PR 4 |
| 3 | **Facturas de mostrador con líneas de inventario elegidas a mano no descuentan stock.** El buscador de productos de `FacturacionForm.tsx` (`agregarProducto()`) sí resuelve contra un Shipping Item real (`lib/facturacion/airtable/productos.ts` trae el `recordId`), pero esas líneas nunca llevan `tipo`/`shippingItemId` — decisión deliberada para no ampliar el alcance de PR3, pendiente de decisión de negocio sobre si vale la pena conectarlo. | `docs/DISENO_FASE16_GANCHO_FACTURACION.md` §8 (fuera de alcance); código: `FacturacionForm.tsx` (`agregarProducto`), `lib/facturacion/gancho/postEmision.ts` (filtra por `tipo:"producto"`) | Media — hueco funcional conocido, con potencial de inventario vendido sin descontarse si el mostrador se usa para vender repuestos de stock. | PR 4 / decisión de producto |
| 4 | `lib/facturacion/airtable/productos.ts` tiene un `TODO` que dice que Shipping Items "no tiene campo de IVA por producto" y por eso hardcodea 15% — **desactualizado**: el campo `Tarifa IVA` existe desde PR2, pero este módulo (usado por el buscador de mostrador) nunca se actualizó para leerlo. | `lib/facturacion/airtable/productos.ts:9` (TODO en código, hallazgo de esta auditoría) | Baja — cosmético/inconsistencia de tarifa en mostrador únicamente (el gancho sí lee el campo correctamente). | Deuda técnica |
| 5 | **Certificado `.p12` de producción**: confirmar si el de pruebas sirve en `cel.sri.gob.ec` o hay que generar uno nuevo ante el SRI. | `docs/AUDITORIA_FACTURACION_FASE16.md` §C, checklist Fase 17 | Alta — bloquea el cutover. | Fase 17 |
| 6 | **Cambiar `SRI_AMBIENTE` de `"1"` a `"2"`** al pasar a producción. | ídem | Alta (trivial de ejecutar, pero debe ser el último paso, no antes de que todo lo demás esté listo). | Fase 17 |
| 7 | **Confirmar `SRI_ESTABLECIMIENTO`/`SRI_PUNTO_EMISION`** autorizados para producción. | ídem | Alta — bloquea el cutover. | Fase 17 |
| 8 | **Decidir el `SRI_SECUENCIAL` inicial de producción** (probablemente reinicia en 1 si es una serie SRI nueva). | ídem | Media. | Fase 17 |
| 9 | **Eliminar `SMTP_TEST_TO`** antes de producción — mientras esté seteada, **todos** los correos de RIDE se fuerzan al buzón de pruebas, ningún cliente real recibe su factura por email. Bloque `TODO` explícito ya en el código. | `docs/AUDITORIA_FACTURACION_FASE16.md` §C y checklist Fase 17; código: `lib/facturacion/correo/enviarRide.ts:8,48` | **Alta** — si se olvida, ningún cliente real recibe el RIDE por correo en producción, sin ningún error visible que lo delate. | Fase 17 |
| 10 | **Persistencia durable de respaldos** (`FACTURAS_DIR`, retención legal 7 años RLRTI art. 96): hoy escribe a `process.cwd()/facturas-autorizadas`, que no sobrevive a despliegues/reinicios en serverless. El proyecto ya tiene `BLOB_READ_WRITE_TOKEN` configurado (Vercel Blob) para otros módulos — candidato natural para migrar este respaldo, aunque la decisión final no está tomada. | `docs/AUDITORIA_FACTURACION_FASE16.md` §C y §E punto 3; recomendación de esta auditoría | **Alta** — riesgo de incumplimiento de retención legal si se despliega tal cual a producción. | Fase 17 |
| 11 | **Revisar soporte de `maxDuration=90`** (usado por `emitir`, `reintentar`, y ahora también relevante para `sincronizar`) en el hosting de producción final. | `docs/AUDITORIA_FACTURACION_FASE16.md` §C, checklist Fase 17 | Media. | Fase 17 |
| 12 | ~~Decidir si se activa `validarContraXsd()` antes de producción~~ — **ya resuelto**: PR #7 la conectó dentro de `emitirFactura()` en toda la fase. El checklist original de la auditoría no se actualizó tras PR1; queda aquí solo para que no se re-abra por error. | `docs/AUDITORIA_FACTURACION_FASE16.md` §C (checklist desactualizado en este punto) | Informativa — ya resuelto. | Fase 17 (cerrado) |
| 13 | **Lock del secuencial depende de memoria de un solo proceso** (`withLock` en `asignar.ts`) — con más de una instancia/proceso concurrente, dos emisiones simultáneas podrían leer el mismo `MAX(Secuencial)` antes de persistir. Mitigado hoy por el reintento automático ante error 43/45 del SRI, no por un lock distribuido real. | `docs/AUDITORIA_FACTURACION_FASE16.md` §E punto 7 | Media — riesgo latente bajo carga concurrente real, no reproducido en pruebas. | Fase 17 |
| 14 | **Validación final del contador** sobre la decisión de facturar el total de la cuenta (no lo abonado) con abonos como formas de pago — decisión de negocio ya tomada y en funcionamiento, pendiente de confirmación formal antes del cutover. | `docs/DISENO_FASE16_GANCHO_FACTURACION.md` §1 decisión #1 ("Pendiente suave") | Baja/Media — no bloquea seguir construyendo, sí debería confirmarse antes de facturar en producción real. | Fase 17 |
| 15 | **Reenviar correo del RIDE depende 100% de disco** — a diferencia de los endpoints de descarga (`ride`/`xml`), que ya tienen fallback a Airtable vía `resolverArchivoFactura()` (PR12), `historial/[recordId]/reenviar/route.ts` solo recibió el fix de ruta absoluta, no el fallback — si el archivo no está en disco, el reenvío sigue fallando. | PR #12 body ("Fuera de alcance"); código: `app/api/facturacion/historial/[recordId]/reenviar/route.ts` | Media — mismo riesgo de origen que la persistencia no durable (#10), pero acotado a un solo endpoint con fix concreto y ya conocido (`resolverArchivoFactura()`). | Deuda técnica |
| 16 | **Bug preexistente de `/reintentar`**: `JSON.parse(factura.lineasJson) as DetalleFactura[]` trata el objeto envoltorio `{version, detalles, ...}` (formato desde v2) como si fuera directamente el array de detalles — no lanza en el `try/catch` (el JSON es válido, solo tiene otra forma), revienta después sin capturar en `detalles.reduce(...)`. Afecta **cualquier** factura con `lineasJson` en formato envoltorio, mostrador o gancho por igual — no es específico ni se agravó por esta fase. El endpoint nuevo `/sincronizar` (PR3) sí lee el envoltorio correctamente — es un endpoint distinto, no un fix del bug. | Documentado en el body de PR #13 ("Encontrado, no arreglado") y confirmado de nuevo en el body de PR #14 | **Alta** — revienta con cualquier factura versión ≥2 al reintentar, que hoy es prácticamente toda factura DEVUELTA/NO AUTORIZADO reciente. | Deuda técnica |
| 17 | **2 asserts fallidos preexistentes en `facturaXml.test.ts`** (`version 2.1.0.0`, escape de caracteres especiales) + **warning de Turbopack** en build (`Encountered unexpected file in NFT list`, origen `resolverArchivo.ts`). Ninguno bloquea ni afecta el comportamiento real — ambos re-confirmados en la sección B de este documento. | PR #7 body; re-confirmado en esta auditoría | Informativa — estable y conocido, no requiere acción salvo alguien quiera invertir tiempo en limpiarlo. | Deuda técnica |
| 18 | **`/api/facturacion`, `/api/items` y `/api/notificaciones` no están en el `matcher` de `proxy.ts`** — a diferencia de `cotizaciones`/`pedidos`/`tecnicos`/`horarios`/`admin`/`shipping-v2`/`operaciones`, que sí tienen su prefijo `/api/X` en el middleware. Estos tres dependen **100%** de su guard interno por endpoint — hoy completo y confirmado (facturación 14/14, items 3/3, notificaciones 4/4), pero sin la red de seguridad extra del middleware si un futuro endpoint nuevo olvida su guard. Ver detalle completo en la subsección de guards más abajo. | Hallazgo de esta auditoría (`proxy.ts`, sin mención previa en ningún documento de la fase) | Media — no es una brecha activa (todo está guardado hoy), pero es una asimetría arquitectónica real frente al resto del portal. | Deuda técnica |
| 19 | **17 de 39 rutas de `/api/tecnicos/`** no llaman a `requireTecnicosSession()` explícitamente (confían solo en la cobertura de `proxy.ts`) — inconsistente con las otras 22 rutas del mismo módulo, que sí la llaman además de estar cubiertas por el middleware. No es una brecha (el middleware sí las cubre), es una inconsistencia de estilo dentro de un mismo módulo, preexistente a esta fase. | Hallazgo de esta auditoría | Baja — informativo, no accionable con urgencia. | Deuda técnica |
| 20 | **Datos de prueba inconsistentes en Airtable** — 3 facturas del gancho emitidas antes de que PR3 existiera, con `Sincronización Inventario = N/A` (nunca corrió `postEmision()` porque no existía). Detalle completo abajo. | Hallazgo de esta auditoría (lectura directa de Airtable, solo lectura) | Media — no afecta nada hacia adelante (PR3 ya está activo y confirmado funcionando con `001-002-000000675`), pero requiere limpieza manual puntual. | Dato en Airtable |
| 21 | **`CLAUDE.md` describe `middleware.ts` re-exportando `proxy.ts`** — ese archivo no existe en el repo; Next.js 16 renombró la convención y `proxy.ts` es hoy el entry point directo del middleware (confirmado: `next@16.2.4` en `package.json`, sin ningún `middleware.ts` en el árbol). Documentación desactualizada, sin impacto funcional. | Hallazgo de esta auditoría | Informativa. | Deuda técnica |

### Detalle — datos de prueba inconsistentes en Airtable (ítem 20)

Búsqueda por contenido (`SEARCH('"origen"', {Líneas JSON})`, más confiable que filtrar por el link `Orden`/`Operación` directamente — ver el caso de la factura 673 abajo) sobre toda la tabla `Facturas Electrónicas`: **8 registros** con `origen` en su `Líneas JSON`. 4 son **BORRADORES** (nunca llegan a escribir el link `Orden`/`Operación` — comportamiento esperado, no son facturas reales, no requieren limpieza). Los 4 restantes son facturas `AUTORIZADO`:

| Factura | Sync | Link Orden en Airtable | Líneas producto (con `shippingItemId`) | Estado |
|---|---|---|---|---|
| `001-002-000000672` | `N/A` | ✅ (OR000342) | 0 (solo 1 línea de servicio) | Sin repuestos afectados — cosmético, se puede reintentar `/sincronizar` para dejarlo en `OK` por prolijidad, no es urgente. |
| `001-002-000000673` | `N/A` | ❌ **vacío**, pese a tener `origen:{"tipo":"orden","recordId":"recvYZCZKoeNdeXLP"}` en su Líneas JSON | 0 (solo 2 líneas de servicio) | **Anomalía de datos**: el campo link `Orden` de esta factura nunca se escribió en Airtable, aunque el payload de emisión sí traía el origen — por eso una búsqueda que filtre por el link (como haría el sistema de idempotencia) no la ve. El campo inverso "Facturas Electrónicas" de la orden `OR000368` (`recvYZCZKoeNdeXLP`) solo apunta a `674`, no a esta. Sin repuestos involucrados (solo servicios), así que no hay descuento de inventario pendiente por esta factura específicamente — pero es una fila fiscalmente real sin trazabilidad hacia su orden de origen. |
| `001-002-000000674` | `N/A` | ✅ (OR000368, misma orden que 673) | **1 línea — pero SIN `tipo`/`shippingItemId` en el JSON guardado** (`codigoPrincipal:"REP-000010"`, sin más marca) | **Requiere corrección manual** — ver abajo. El bug de formulario que perdía `tipo`/`shippingItemId` en el viaje por `FacturacionForm.tsx` (documentado y arreglado en PR3) significa que el dato necesario para reparar esto automáticamente **no existe** en el registro guardado — `/sincronizar` no puede hacer nada por esta factura porque no tiene de dónde leer el `shippingItemId`. |
| `001-002-000000675` | `OK` | ✅ | 1 (`REP-000011`) | **Control positivo** — la primera factura emitida después de que PR3 se mergeó. Confirmado: el Shipping Item `REP-000011` (`rec400ceL9uwgsTZj`) quedó `Estado Item="Vendido"` + link `Factura` correctamente. El flujo nuevo funciona de punta a punta. |

**Item de inventario afectado por la factura 674** (leído directamente, solo lectura):

- **`REP-000010`** (`Memoria RAM DDR4 Samsung 8GB 3200MHz SODIMM`, record `rec0p5eHc6nzXWb8C`, vinculado a la orden `OR000368` vía "Orden de Reparación (Stock)"): `Reservado = true`, `Estado Item = "En packing"` (**no** `"Vendido"`), **sin** link `Factura`. Ya fue facturado (factura `674`, `recordId recnNjFMZRe6SSgAq`) pero el inventario nunca se marcó vendido porque PR3 no existía todavía.

**Acción sugerida para el administrador (no ejecutada — solo lectura):**
1. En el Shipping Item `REP-000010` (`rec0p5eHc6nzXWb8C`): cambiar `Estado Item` a `"Vendido"` y agregar el link `Factura` → `001-002-000000674` (`recnNjFMZRe6SSgAq`), manualmente en Airtable (mismo efecto que habría hecho `postEmision()` si hubiera existido a tiempo).
2. Opcional, por prolijidad: correr `/sincronizar` sobre `672` y `673` para que su `Sincronización Inventario` pase de `N/A` a `OK` (no van a tocar ningún Shipping Item porque no tienen líneas de producto — es un cambio cosmético del campo de estado, no un descuento de inventario real).
3. Investigar aparte (fuera del alcance de esta auditoría de solo lectura) por qué a la factura `673` nunca se le escribió el link `Orden` pese a tener `origen` en su payload — si es un caso aislado o si hay más facturas con el mismo patrón fuera del rango revisado.

### Detalle — guards de sesión fuera de facturación (ítem 18-19)

Inventario completo de los 133 endpoints (`route.ts`) de `app/api/`. **Ningún endpoint quedó sin ninguna forma de protección** (ni middleware ni guard interno) — los únicos sin guard interno explícito (`app/api/auth/{login,logout,verify-2fa}`) son intencionalmente públicos por diseño (son el propio mecanismo de login).

| Módulo | Rutas totales | Con guard interno explícito | Cubierto por `proxy.ts` (matcher) |
|---|---|---|---|
| `facturacion` | 14 | 14/14 (`requireFacturacionSession`) | ❌ no |
| `cotizaciones` | 12 | 12/12 | ✅ sí |
| `pedidos` | 2 | 2/2 | ✅ sí |
| `operaciones` | 15 | 15/15 | ✅ sí |
| `shipping-v2` | 23 | 23/23 | ✅ sí |
| `admin` | 6 | 6/6 | ✅ sí |
| `horarios` | 12 | 12/12 (`getSessionFromCookie` o `requireAdminSession` en sub-rutas admin) | ✅ sí |
| `tecnicos` | 39 | 22/39 (`requireTecnicosSession`) — las otras 17 confían solo en el middleware | ✅ sí |
| `items` | 3 | 3/3 (`getSessionFromCookie`, sin `canAccessApp` — solo exige sesión válida) | ❌ no |
| `notificaciones` | 4 | 4/4 (`getSessionFromCookie`, sin `canAccessApp`) | ❌ no |
| `auth` | 3 | 0/3 — intencional, son login/logout/verify-2fa | ❌ no (correcto: deben ser públicos) |

Conclusión: el "pendiente global de guards de sesión fuera de facturación" que motivó la pregunta **no tiene ningún caso de endpoint desprotegido hoy**. Lo que sí hay son dos asimetrías de diseño preexistentes (no introducidas por esta fase, tampoco arregladas aquí): `facturacion`/`items`/`notificaciones` sin la capa de middleware que sí tiene el resto del portal, y una inconsistencia de estilo dentro de `tecnicos` entre rutas que doble-guardan y rutas que no.

---

## Cierre

`main` está sano (tests/typecheck/build en verde, sin fallos nuevos), sin PRs abiertos ni ramas con trabajo real sin mergear, y ambos documentos de diseño/auditoría reflejan el estado real del sistema. Los 21 pendientes consolidados arriba quedan repartidos en 4 bloques: **2 para PR 4** (congelar orden facturada, mostrar factura en la orden — más 1 compartido con "deuda técnica" sobre el hueco de mostrador), **9 para Fase 17** (checklist de producción, con 1 ya resuelto), **8 de deuda técnica** (bugs/inconsistencias conocidas, ninguna bloqueante), y **1 de limpieza puntual en Airtable** (factura 674 / item REP-000010, con acción manual sugerida y no ejecutada).

No se modificó ningún archivo de código ni de Airtable durante esta auditoría.
