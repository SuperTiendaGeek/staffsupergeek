# Diseño Fase 18 — Notas de crédito, anulaciones, proformas y recibos

**Fecha:** 2026-07-20
**Estado:** diseño aprobado en conversación con el dueño — pendiente de construcción.
**Contexto:** Fase 17 técnicamente completa (stock por cantidad, fecha Ecuador, guards de ambiente, respaldo durable — todo mergeado y probado en vivo). Se construye Fase 18 ANTES del cutover a producción, a propósito: las notas de crédito se prueban de punta a punta contra `celcer` mientras seguimos en ambiente pruebas, y el mecanismo de corrección queda listo desde la primera factura real.

Reglas SRI 2026 verificadas en `docs/AUDITORIA_FASE17_18_FACTURACION_PRODUCCION_NOTAS_CREDITO.md` §4 (fuentes: Resolución NAC-DGERCGC25-00000017, NMS Abogados, Factuplan, bp-one).

---

## 0. Los 4 documentos según el uso real de SUPER GEEK (definido por el dueño, 2026-07-20)

| Documento | Naturaleza | Uso principal en SUPER GEEK | Toca SRI | Toca inventario | Toca libro contable |
|---|---|---|---|---|---|
| **Nota de crédito** | Comprobante electrónico SRI | Cambios de equipo (lo más común), compra de otra cosa, o saldo a favor del cliente | Sí — XML firmado, autorización, RIDE | Sí — reverso (suma de vuelta) | Sí — Egreso, rubro "Ajuste / Devolución por nota de crédito" |
| **Anulación** | Trámite MANUAL en portal SRI | Facturas equivocadas recientes (hasta el día 7 del mes siguiente) | No desde el sistema — solo registro y seguimiento interno | Sí — reverso al confirmarse | Sí — reverso al confirmarse |
| **Proforma** | Documento interno NO tributario | Cliente que necesita respaldo formal de lo que quiere comprar (para jefes/empresas) | No | No | No |
| **Recibo** | Documento interno NO tributario | Venta real sin documento tributario (cliente no quiere factura a su nombre) — casos excepcionales | No | **Sí — igual que una factura** | **Sí — Ingreso, rubro propio** |

### Decisiones del dueño (2026-07-20)

1. **Saldo a favor tras NC** → se registra como **abono disponible** del cliente en la tabla única Abonos, aplicable a su próxima compra u orden. Aprovecha el sistema de abonos existente (un pago, un lugar, nunca se duplica).
2. **Recibos y caja** → el recibo **sí registra su Ingreso** en el Sistema Contable SG (sin IVA, rubro propio) — el cuadre de caja diario siempre cuadra con el dinero físico.
3. **Secuencial de NC** → el sistema viejo **sí ha emitido notas de crédito** en producción con la serie 001-002. Igual que con facturas (caso del 660): antes de la primera NC real hay que averiguar el último número emitido y arrancar en `último + 1`. Para pruebas en celcer no importa. **PENDIENTE: el dueño averigua ese número con la contadora / el sistema viejo.**

### El flujo estrella: cambio de equipo (aclaración de IVA confirmada)

Cliente compró equipo A ($X + IVA), lo devuelve, se lleva equipo B:
1. **NC total** sobre la factura de A → revierte la base imponible y el IVA de esa factura en la declaración del mes (la NC usa la MISMA tarifa de IVA de la factura original, no la vigente al emitirla). El equipo A vuelve al inventario (+1 Cantidad).
2. **Factura nueva** por B → genera su propio IVA normal, descuenta B del inventario.
3. Neto fiscal: solo se tributa el IVA de la venta final. No hay doble IVA.
4. Condición 2026: la NC solo surte efecto si el receptor la **acepta en SRI en línea dentro de 5 días hábiles** — sin respuesta o con rechazo, queda sin efecto y el IVA original sigue vigente. El sistema trackea ese estado (ver §1.5).

---

## 1. Notas de crédito electrónicas (el bloque grande)

### 1.1 Reutilización — lo que NO hay que construir

- **Clave de acceso**: `claveAcceso.ts` ya parametriza el tipo de comprobante — NC usa `codDoc = "04"`.
- **Firma XAdES-BES**: `ec-sri-invoice-signer` firma los 6 tipos de comprobante. Sin trabajo nuevo.
- **SOAP recepción/autorización**: mismos endpoints (`RecepcionComprobantesOffline` / `AutorizacionComprobantesOffline`), mismo cliente (`lib/facturacion/sri/`), misma cola con backoff.
- **Fecha Ecuador**: `fechaEcuador.ts` (Fase 17) se usa tal cual.
- **Guards de ambiente**: mismo patrón `ambiente === "2"` para inventario y libro contable.
- **Correo**: `enviarRide.ts` generalizable (asunto/cuerpo parametrizados por tipo de documento).

### 1.2 Lo nuevo

- **XSD nota de crédito** (v1.1.0 vigente, ficha técnica 2.32) — descargar del SRI, validar igual que factura.
- **`construirNotaCreditoXml.ts`** — estructura propia: `infoNotaCredito` incluye `codDocModificado` ("01"), `numDocModificado` (número de la factura original XXX-XXX-XXXXXXXXX), `fechaEmisionDocSustento`, `motivo`, y `valorModificacion`. Las líneas (`detalles`) son iguales a las de factura.
- **Secuencial propio**: las NC llevan su propia serie de secuenciales (independiente de facturas). Mismo patrón `MAX(Secuencial)+1` sobre su propia tabla, `SRI_SECUENCIAL_NC` como semilla.
- **Tabla Airtable nueva: "Notas de Crédito Electrónicas"** (crear a mano — la API no crea fórmulas/rollups): espejo de "Facturas Electrónicas" (Clave de Acceso, Número, Secuencial, Estado, Ambiente, XML/RIDE adjuntos, Líneas JSON) + campos propios: link a **Factura Modificada**, **Motivo**, **Estado Aceptación** (Pendiente de aceptación / Aceptada / Rechazada / Sin efecto), **Fecha Límite Aceptación** (5 días hábiles desde emisión), checkbox por línea de **devolución física** (viaja en Líneas JSON).
- **RIDE de NC** — variante de `generarRide.ts` con el bloque "Documento que modifica" y el motivo.

### 1.3 Reglas antes de emitir (validación server-side, orden estricto)

1. La factura original debe estar `AUTORIZADO` (nunca BORRADOR, DEVUELTA, ni ya ANULADA).
2. **Consumidor final (tipo "07"): bloqueo absoluto**, sin excepción — regla SRI 2026 y política de mostrador ya definida (se avisa al cliente antes de facturar como CF).
3. **Límite interno de 6 meses** desde la factura original (decisión de negocio, no del SRI — el mensaje de error debe aclararlo).
4. Motivo obligatorio y específico (el SRI observa motivos genéricos tipo "ajuste") — texto libre con mínimo de caracteres.
5. Suma de NCs previas vigentes + esta NC ≤ total de la factura original (no se puede acreditar más de lo facturado).
6. La fecha de la NC nunca anterior a la de la factura original.
7. Tarifa de IVA de cada línea = la de la línea original (se precargan desde Líneas JSON de la factura — no editables).

### 1.4 Flujo en la UI

- Botón **"Nota de crédito"** en el historial de facturación sobre facturas `AUTORIZADO` (y visible en el detalle de la factura).
- Pantalla precargada con las líneas de la factura original — el usuario elige: NC **total** (todas las líneas) o **parcial** (selecciona líneas/cantidades). Por cada línea de producto: checkbox **"¿devolución física del item?"** (default sí para NC total de equipos — es el caso del cambio).
- Motivo obligatorio. Vista previa de totales (base + IVA revertidos).
- Al autorizar: RIDE por correo al cliente + aviso en pantalla de que el cliente debe **aceptarla en SRI en línea en 5 días hábiles**.
- Post-autorización, según lo que el usuario eligió como destino del dinero:
  - **Cambio de equipo** → botón "Facturar reemplazo" (formulario de factura precargado con el cliente).
  - **Saldo a favor** → crea el abono disponible en la tabla Abonos (ver §1.6).
  - **Devolución de dinero** → registra el egreso de caja correspondiente.

### 1.5 Aceptación del receptor (5 días hábiles)

El SRI no expone webservice para consultar la aceptación — el seguimiento es manual:
- Cada NC nace "Pendiente de aceptación" con Fecha Límite = +5 días hábiles.
- Lista/badge en el módulo: NCs pendientes con días restantes (control fino de fechas, igual que anulaciones).
- El usuario confirma manualmente en el portal SRI y marca Aceptada / Rechazada / Sin efecto.
- **Los efectos internos (inventario, contable, abono a favor) se aplican al AUTORIZARSE la NC**, no al aceptarse — pero si el receptor la rechaza o vence sin respuesta, el sistema debe **revertir los efectos** (el usuario marca "Sin efecto" y el sistema deshace: resta el stock devuelto, anula el movimiento contable, anula el abono a favor). Esto queda explícito en la UI al marcar.

*(Alternativa considerada y descartada: aplicar efectos solo tras aceptación — rechazada porque el caso común (cambio de equipo en mostrador, cliente presente que acepta enseguida) quedaría trabado esperando el trámite en SRI en línea.)*

### 1.6 Efectos post-autorización

- **Inventario** (`revertirPostEmision`, espejo de `postEmision`): por cada línea de producto con devolución física marcada → `Cantidad += cantidadAcreditada`; si el item estaba `Vendido`/no disponible y su Cantidad vuelve a ser > 0 → restaurar `Disponible para venta = true` y Estado Item a su valor pre-venta ("Disponible" como default razonable). Link a la NC en el item (trazabilidad, se acumula con el de la factura). Guard de ambiente `"2"`. Idempotente por link (igual que postEmision).
- **Libro contable** (`procesarPuenteNotaCredito`): movimiento **Egreso**, rubro/categoría **"Ajuste / Devolución por nota de crédito"** (separado de gastos operativos — decisión del dueño), vinculado a la factura original Y a la NC, guard de ambiente. Si el destino es "saldo a favor", el egreso no sale de caja físicamente — se compensa con el abono creado (detalle contable a validar con la contadora en la primera NC real).
- **Abono a favor** (si aplica): registro en tabla Abonos con el generador de ID único existente (`getMaxIdAbono`), vinculado al cliente, marcado con origen "Nota de crédito NC-XXX" — disponible para aplicarse a una operación/orden futura.

---

## 2. Anulaciones (registro y seguimiento — el trámite es manual en el portal SRI)

Definido por el dueño: la anulación en sí se hace a mano en SRI en línea. El sistema NO llama al SRI — registra, acumula y controla fechas.

- **Botón "Solicitar anulación"** sobre facturas `AUTORIZADO`. Bloqueos: consumidor final (imposible, regla 2026) y fecha límite pasada (día 7 del mes siguiente a la emisión — si ya pasó, el sistema redirige a nota de crédito).
- Nuevos campos en "Facturas Electrónicas" (a mano en Airtable): **Estado Anulación** (— / Solicitada / Anulada / Rechazada), **Fecha Solicitud Anulación**.
- **Lista "Anulaciones pendientes"**: facturas Solicitadas, con fecha límite calculada (día 7 del mes siguiente, corrido al siguiente hábil si cae feriado) y días restantes — con alerta visual cuando quedan ≤ 3 días. El usuario tramita en el portal SRI (requiere aceptación del receptor en 5 días hábiles) y marca el resultado.
- Al marcar **Anulada**: Estado de la factura → `ANULADA` (ya excluido de secuenciales e idempotencia desde Fase 16), reverso de inventario (todas las líneas de producto — una factura anulada nunca entregó/retuvo mercadería) y reverso contable (anular/compensar los movimientos de esa factura). Con confirmación explícita del usuario, mostrando qué se va a revertir.
- Control fino de fechas pedido por el dueño: la fecha límite se calcula desde la **fecha de emisión Ecuador** (ya corregida en Fase 17).

---

## 3. Proformas (documento interno, solo constancia)

- **Tabla Airtable nueva "Proformas"**: numeración interna `PRO-000001` (mismo patrón de SKU secuencial — una sola fuente), cliente (link real a Clientes), líneas JSON (mismo formato de factura), totales, estado (Vigente / Facturada / Vencida — opcional una fecha de validez), PDF adjunto, fecha.
- **UI**: el mismo formulario de facturación con un modo "Proforma" — reutiliza búsqueda de cliente, buscador de productos (muestra stock pero NO lo verifica ni reserva), líneas, IVA incluido. Botón "Generar proforma" en lugar de "Emitir".
- **PDF**: layout basado en el RIDE pero rotulado "PROFORMA" y con pie **"Documento no tributario — no representa un comprobante de venta autorizado por el SRI"**. Sin clave de acceso, sin número de autorización.
- **No toca** inventario, SRI ni libro contable.
- Listado de proformas con búsqueda, y botón **"Facturar"** que precarga el formulario real de facturación con las líneas de la proforma (verificando stock en ese momento).

## 4. Recibos (documento interno con efectos reales, sin SRI)

- **Tabla Airtable nueva "Recibos"**: numeración interna `REC-000001`, cliente (link u opcional "cliente genérico"), líneas JSON, totales (con o sin desglose de IVA — **sin IVA**: es una venta sin efecto tributario; el precio es el precio final, sin desglose), forma de pago, PDF adjunto.
- **UI**: mismo formulario en modo "Recibo". **Sí verifica stock** (mismo pre-chequeo de la factura) y **sí descuenta inventario** al generarse (misma mecánica de `postEmision`, con su propio link "Recibo" en el item o reutilizando el patrón de links — decidir al construir; guard de ambiente NO aplica: el recibo es interno, no depende de SRI_AMBIENTE, pero en la práctica solo se usará tras el go-live).
- **Libro contable**: movimiento de **Ingreso** con rubro propio (p.ej. "Venta con recibo interno"), sin componente de IVA — el cuadre de caja diario cuadra con el dinero físico (decisión del dueño).
- **PDF**: layout muy similar a la factura (pedido explícito del dueño) pero sin número de autorización, sin clave de acceso, sin datos SRI, y con pie **"DOCUMENTO NO TRIBUTARIO — constancia interna de compra entre el cliente y SUPER TIENDA GEEK"**.
- Anulación de un recibo: interna y simple (botón anular → reverso de inventario y del movimiento) — sin plazos del SRI.

---

## 5. Orden de construcción propuesto (PRs)

| PR | Contenido | Por qué en este orden |
|---|---|---|
| **1** | **Notas de crédito núcleo**: XSD + XML + clave 04 + secuencial propio + tabla Airtable + emisión a celcer + RIDE + correo | Lo más delicado y lo que justificó hacer Fase 18 antes del cutover — se prueba contra celcer mientras seguimos en pruebas. |
| **2** | **NC efectos + UI**: pantalla desde factura, validaciones (§1.3), reverso de inventario, puente contable, abono a favor, tracking de aceptación | Separa la mecánica SRI (PR1) de los efectos internos — más fácil de probar y revisar. |
| **3** | **Anulaciones**: campos + lista de pendientes con fechas + reverso al confirmar | Reutiliza los reversos construidos en PR2. |
| **4** | **Proformas** | Simple, sin efectos — reutiliza formulario y PDF. |
| **5** | **Recibos** | Reutiliza el pre-chequeo de stock, el descuento de inventario y el puente contable ya generalizados. |

Cada PR en su rama, commits frecuentes, tests puros por módulo, y prueba en vivo contra celcer antes de mergear — método de siempre.

## 6. Pendientes que no bloquean construir, sí bloquean la primera NC real

1. **Último secuencial de nota de crédito del sistema viejo** (el dueño lo averigua con la contadora) — igual que el 660 de facturas.
2. Validación de la contadora sobre el tratamiento contable del saldo a favor (§1.6) — puede revisarse con la primera NC real controlada.
3. Crear a mano en Airtable las tablas nuevas ("Notas de Crédito Electrónicas", "Proformas", "Recibos") y los campos de anulación en "Facturas Electrónicas" — la API no crea fórmulas/rollups; el diseño de campos exacto se entregará con cada PR.
