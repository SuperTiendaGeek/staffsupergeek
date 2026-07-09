# Diseño Fase 16 — Gancho Cuenta Unificada → Facturación

**Fecha:** 2026-07-06
**Base de evidencia:** `docs/AUDITORIA_FACTURACION_FASE16.md` (rama `audit/facturacion-fase16`)
**Alcance:** conectar orden/operación con el módulo de facturación existente. Todo se construye y prueba en ambiente SRI de pruebas (`SRI_AMBIENTE=1`). El paso a producción es Fase 17. Notas de crédito/anulación son Fase 18.

---

## 1. Decisiones cerradas

| # | Pregunta (auditoría) | Decisión |
|---|---|---|
| 1 | ¿Total o abonado en pagos parciales? | **Total de la cuenta** (`totalCuenta`). La factura documenta la venta, no el cobro. Los abonos viajan como formas de pago; el saldo pendiente viaja como forma de pago adicional (ver §4.4). *Pendiente suave: validación final del contador antes del cutover de Fase 17 — no bloquea construir.* |
| 2 | ¿Marca de facturado en Shipping Items? | Campo **link `Factura`** (→ Facturas Electrónicas) + reutilizar **`Estado Item = "Vendido"`**. El link es la evidencia; el estado es el flag operativo. |
| 3 | ¿IVA por línea de producto? | Campo nuevo **`Tarifa IVA`** en Shipping Items (select: `15%`, `0%`, `Exento`, `No objeto`; default `15%`). Editable en la pre-factura. |
| 4 | ¿IVA de servicios? | Constante **15%** en config de facturación (`SERVICIO_IVA_DEFAULT`). Editable en la pre-factura. Sin campo por servicio (YAGNI). |
| 5 | ¿Vincular factura → orden/operación? | Sí, **campos link** `Orden` y `Operación` en Facturas Electrónicas, más link `Cliente` (cierra la deuda del cliente como texto copiado — el texto se mantiene además, porque es el snapshot fiscal). |
| 6 | ¿Consumidor final > $50? | La regla se **duplica server-side dentro de `emitirFactura()`** (hoy solo vive en la UI). El gancho desde orden casi siempre trae cliente real, pero la regla no puede ser saltable. |
| 7 | ¿Reemplaza al formulario manual? | **Coexisten.** Manual = venta de mostrador. Gancho = precarga el mismo formulario desde orden/operación. |
| 8 | ¿Idempotencia? | Resuelta por el link de #5: antes de precargar/emitir se lee el **campo inverso** en Orden/Operación; si existe factura vinculada en estado ≠ `BORRADOR`/`ANULADA`, se bloquea con aviso (con opción de ver esa factura). |
| 9 | ¿Activar validación XSD? | **Sí**, `validarContraXsd()` se invoca dentro de `emitirFactura()` antes de firmar. Si falla, la emisión aborta antes de tocar al SRI. |

**Saldo a favor (cliente abonó de más):** la factura se emite solo por el total real de la cuenta. El excedente queda como saldo a favor en la cuenta unificada / tabla Abonos; devolverlo o aplicarlo a otra cuenta es flujo de abonos, no de facturación. La factura nunca lleva líneas negativas.

**Principio rector (ya decidido en el proyecto, se repite porque gobierna este diseño):** la factura **formaliza abonos que ya existen** — no crea ingresos, no duplica dinero. El gancho jamás escribe en la tabla Abonos.

---

## 2. Arquitectura del gancho

```
CuentaUnificadaPanel (orden u operación)
        │  botón "Emitir factura"
        ▼
GET /api/facturacion/prefactura?orden=… | ?operacion=…   ← NUEVO
        │  · guard de sesión (mismo requireFacturacionSession)
        │  · idempotencia: campo inverso Facturas en Orden/Operación
        │  · getCuentaUnificada() → cuentaUnificadaToDatosVenta()
        ▼
FacturacionForm PRECARGADO (modo "vinculado", banner con origen)
        │  humano revisa: cliente, líneas, tarifas IVA, formas de pago
        │  (mismo formulario, mismo bloqueo consumidor final, mismos borradores)
        ▼
POST /api/facturacion/emitir  →  emitirFactura(DatosVenta + origen)
        │  · valida XSD (nuevo)  · regla consumidor final server-side (nuevo)
        │  · pipeline SRI existente SIN CAMBIOS (secuencial, firma, SOAP, RIDE, correo)
        ▼
   ¿AUTORIZADO?
        │ sí
        ▼
postEmision()   ← NUEVO, fuera de emitirFactura(), nunca altera su resultado
        · Shipping Items: Estado Item → "Vendido", link Factura
        · Facturas Electrónicas: links Orden / Operación / Cliente
        · si falla → Sincronización Inventario = "ERROR" + botón de reintento
```

Claves del diseño:

- **Nada de emisión automática silenciosa.** El humano siempre revisa la pre-factura antes de emitir (es el SRI). Esto además reutiliza gratis el formulario, el límite de consumidor final, los borradores y el historial.
- **`emitirFactura()` se mantiene puro** (solo emisión). El descuento de inventario y los vínculos son un paso posterior separado, que solo corre con `AUTORIZADO`.
- **La factura ya existe en el SRI aunque el post-emisión falle.** Por eso el post-emisión tiene su propio estado de sincronización con reintento (mismo patrón que Estado Financiero en abonos): la verdad fiscal nunca depende de una escritura en Airtable.

---

## 3. Cambios manuales en Airtable (ANTES de programar — la API no crea campos)

**Shipping Items**
1. `Factura` — link a Facturas Electrónicas (permite ver desde el item qué factura lo vendió).
2. `Tarifa IVA` — single select: `15%` (default), `0%`, `Exento`, `No objeto`.
3. Verificar que `Estado Item` ya tiene la opción `Vendido` (la auditoría dice que sí — solo confirmar).

**Facturas Electrónicas**
4. `Orden` — link a Órdenes de Reparación.
5. `Operación` — link a Operación Comercial.
6. `Cliente` — link a Clientes.
7. `Sincronización Inventario` — single select: `N/A` (default, facturas de mostrador), `PENDIENTE`, `OK`, `ERROR`.
8. `Error Sincronización` — texto largo.

Los campos inversos que Airtable crea automáticamente en Órdenes/Operación/Clientes/Shipping Items son justamente los que usa el patrón de lectura segura (campo inverso + `fetchByIds` con `RECORD_ID()`, nunca filtrar por link).

---

## 4. Contrato del traductor `cuentaUnificadaToDatosVenta()`

Módulo nuevo `lib/facturacion/gancho/` (nombre sugerido), sin tocar los módulos existentes salvo los puntos marcados NUEVO en §2.

### 4.1 Cliente
- Se lee el cliente vinculado de la orden/operación (link real, tabla Clientes) — nombre, identificación, correo, y **se conserva el `recordId`** para el link post-emisión.
- Tipo de identificación derivado: 10 dígitos → cédula (`05`); 13 dígitos terminando en `001` → RUC (`04`); sin cliente → consumidor final (`07`), sujeto a la regla del límite.
- El humano puede cambiar el cliente en el formulario (los tres modos actuales siguen disponibles); si lo cambia, el link post-emisión usa el cliente final elegido.

### 4.2 Líneas de producto (descuentan inventario)
- Origen: `items` de `getCuentaUnificada()` (Shipping Items de la cuenta).
- **Precios con IVA incluido (decisión confirmada, PR2):** `precio` (Shipping Items."Precio venta final") es el precio final que paga el cliente, CON IVA ya incluido — no una base. El traductor lo **desglosa hacia adentro** según la tarifa de la línea, en vez de sumar IVA encima:
  - Tarifa `15%`: `base = precioFinal / 1.15` redondeado a centavos; el IVA se calcula como el **complemento** (`precioFinal - base`), no como `base * 0.15` de forma independiente — así `base + IVA` reconstruye el precio final **exacto al centavo**, sin importar la acumulación de redondeos de la división.
  - Tarifa `0%` / `Exento` / `No objeto`: no hay nada que desglosar — el precio final ya es la base, IVA = 0.
  - Consecuencia directa: el **VALOR TOTAL de la factura del gancho es igual al `totalCuenta` de la cuenta unificada** (suma de precios finales), no un total con IVA añadido encima.
- Mapeo: `codigoPrincipal` = SKU · `descripcion` = nombre del item · `cantidad` = 1 (los items de Shipping Items no traen cantidad propia) · `precioUnitario`/`precioTotalSinImpuesto` = la **base** ya desglosada (no el precio final) · IVA = `Tarifa IVA` del item (default 15% si vacío).
- **Precondición dura:** cada item debe estar `Reservado` y sin link `Factura` previo. Si no, la pre-factura lo reporta y bloquea (no se factura inventario en estado inconsistente).
- Estas líneas llevan marca interna `tipo: "producto"` — es lo que el post-emisión usa para saber qué items marcar como Vendido. La marca viaja dentro de `Líneas JSON` (campo nuevo del JSON, versionado), no cambia el XML SRI.
- Esta decisión es **específica del gancho** — el formulario manual de mostrador (`FacturacionForm.tsx`) sigue tratando `precioUnitario` como base y sumando IVA encima (código y cálculo completamente separados, sin tocar).

### 4.3 Líneas de servicio (no tocan inventario)
- Origen: `servicios` de `getCuentaUnificada()`.
- **Mismo criterio de IVA incluido que 4.2:** `costo` es el precio final con IVA incluido — se desglosa igual (base = costo/1.15, IVA = complemento) en vez de sumarse encima.
- Mapeo: `codigoPrincipal` = `SRV-<consecutivo>` · `descripcion` = nombre del servicio · `cantidad` = 1 · `precioUnitario`/`precioTotalSinImpuesto` = la base desglosada · IVA = 15% (constante, editable).
- Marca interna `tipo: "servicio"` — el post-emisión las ignora.

### 4.4 Formas de pago
- Cada abono registrado de la cuenta se traduce a su código SRI según método de pago. Mapa confirmado (PR2, `lib/facturacion/gancho/config.ts`) contra el select real de Abonos."Método de Pago" (7 valores exactos, vía Airtable Metadata API): `Efectivo→01`, `Transferencia→20`, `Tarjeta→19` (crédito — Abonos no distingue débito/crédito, no hay campo para eso hoy), `Depósito→20`, `PayPal→20`, `PayPhone→20`, `Otro→20`.
- Si hay **saldo pendiente** al facturar el total, se agrega una forma de pago adicional por el saldo (default `01`, editable en el formulario, con plazo si aplica).
- La suma de formas de pago debe cuadrar con el total — validación en el traductor y de nuevo server-side (`assertPagosCuadranConTotal`, dentro de `emitirFactura()`).

### 4.5 Origen e idempotencia
- El request de emisión lleva `origen: { tipo: "orden"|"operacion", recordId }` cuando viene del gancho (ausente en mostrador).
- Server-side, antes de emitir: releer el campo inverso de facturas del origen; si hay factura en estado ≠ `BORRADOR`/`ANULADA`, rechazar con mensaje y número de la factura existente. (La UI ya lo habrá bloqueado antes, pero la regla vive en el servidor.)

---

## 5. Post-emisión (`postEmision()`)

Corre **solo** si `emitirFactura()` devolvió `AUTORIZADO` y hay `origen`:

1. Marcar la factura: `Sincronización Inventario = "PENDIENTE"`.
2. Shipping Items (solo líneas `tipo: "producto"`): `Estado Item = "Vendido"` + link `Factura`.
3. Facturas Electrónicas: links `Orden`/`Operación`/`Cliente`.
4. Éxito total → `Sincronización Inventario = "OK"`. Cualquier fallo → `"ERROR"` + detalle en `Error Sincronización`, **sin alterar la respuesta de la emisión** (la factura ya es real).
5. Reintento: `POST /api/facturacion/historial/[recordId]/sincronizar` (nuevo, mismo guard), idempotente — reaplica solo lo que falte. El historial muestra un aviso en filas con `ERROR`.

---

## 6. Orden de implementación (ramas desde `main`, una por PR, commits frecuentes)

**PR 1 — endurecimiento previo (chico, independiente):** rama `feat/facturacion-hardening`
- Invocar `validarContraXsd()` dentro de `emitirFactura()` antes de firmar.
- Regla de consumidor final ≥ límite dentro de `emitirFactura()` (server-side).
- Corregir `CLAUDE.md` (la base de técnicos separada ya no existe; una sola base ADM).
- Probar: emisión normal en celcer sigue funcionando; XML inválido aborta antes del SRI.

**Paso manual (sin código):** crear los 8 campos de §3 en Airtable. Verificar nombres exactos contra este documento (el portal referencia por nombre).

**PR 2 — pre-factura (el gancho, sin tocar inventario todavía):** rama `feat/gancho-prefactura`
- `lib/facturacion/gancho/`: traductor + validaciones de §4.
- `GET /api/facturacion/prefactura` con guard + idempotencia.
- Botón "Emitir factura" en `CuentaUnificadaPanel` (visible en orden y operación) + modo precargado de `FacturacionForm` con banner de origen.
- `Líneas JSON` versionado con `tipo` por línea y `origen`.
- Probar en celcer: emitir desde una orden de prueba; verificar que la factura sale bien y que **aún no** toca Shipping Items.

**PR 3 — post-emisión (descuento de inventario):** rama `feat/gancho-postemision`
- `postEmision()` + estados de sincronización + endpoint de reintento + aviso en historial.
- Probar en celcer, incluyendo fallo simulado de Airtable después de autorizar (la factura debe quedar `AUTORIZADO` + `Sincronización Inventario = ERROR`, y el reintento debe repararla).

Respaldo de la base antes del cutover de cada PR que escriba en tablas de producción (PR 3 especialmente).

## 7. Plan de pruebas (todas en `SRI_AMBIENTE=1`)

1. Orden con repuesto de stock + servicio, pagada completa → factura total, item Vendido + link, links orden/cliente, sync OK.
2. Pedido con pago parcial ($100 de $240 + servicio $35) → factura por el total; formas de pago = abono real + saldo como forma adicional; cuadre exacto.
3. Orden solo servicio → factura sin líneas producto; post-emisión no toca Shipping Items.
4. Doble emisión sobre la misma orden → bloqueada con referencia a la factura existente (UI y server).
5. Consumidor final con total > $50 vía request directo al endpoint → rechazado server-side.
6. Item no Reservado o ya con link Factura → pre-factura bloquea con mensaje claro.
7. Fallo post-emisión simulado → factura AUTORIZADA + sync ERROR → reintento repara.
8. Mostrador (formulario manual sin origen) → todo funciona exactamente como hoy, `Sincronización Inventario = N/A`.
9. Borrador desde pre-factura → guardar, retomar, emitir.

## 8. Fuera de alcance (no construir aquí)

- Paso a producción SRI (Fase 17 — checklist ya en la auditoría).
- Notas de crédito / anulación (Fase 18). El estado `ANULADA` sigue sin asignarse.
- Escritura en Shipping Finanzas Movimientos / libro central (Fase 20).
- Lock distribuido del secuencial y persistencia durable en disco (riesgos documentados; se resuelven en Fase 17).
