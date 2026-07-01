# Campos pendientes — Paso 3 y 4

> Generado: 2026-06-29  
> Tablas creadas en Paso 2 (solo campos planos):
> - **Abonos** `tbli03YnDxVsrnmZK`
> - **Opciones** `tblYRUY3ZaBKAMaG8`
> - **Operación Comercial** `tblBSGQhdCsDsdCrh`
>
> Los campos de esta lista NO se crean vía API todavía.  
> Orden sugerida de creación: primero los links entre las 3 tablas nuevas (Paso 3),
> luego los links hacia tablas externas y campos calculados (Paso 4).

---

## PASO 3 — Links entre las 3 tablas nuevas

| Tabla | Campo | Tipo | Destino / Configuración |
|---|---|---|---|
| Opciones | Operación | multipleRecordLinks | → Operación Comercial |
| Abonos | Aplicado a: Operación | multipleRecordLinks | → Operación Comercial |
| Abonos | Aplicado a: Orden | multipleRecordLinks | → Órdenes de Reparación |

> **Nota:** Al crear `Opciones.Operación → Operación Comercial`, Airtable genera
> automáticamente el campo inverso en Operación Comercial. Ese campo inverso será
> la relación `Opciones` en Operación Comercial — renombrarlo a "Opciones" si
> Airtable le da un nombre distinto.
>
> Lo mismo aplica para `Abonos.Aplicado a: Operación → Operación Comercial`:
> el campo inverso en Operación Comercial será la relación `Abonos`.

---

## PASO 4A — Links hacia tablas externas

| Tabla | Campo | Tipo | Destino / Configuración |
|---|---|---|---|
| Operación Comercial | Cliente | multipleRecordLinks | → Clientes |
| Operación Comercial | Orden de Reparación | multipleRecordLinks | → Órdenes de Reparación |
| Operación Comercial | Opción Elegida | multipleRecordLinks | → Opciones |
| Operación Comercial | Artículo físico | multipleRecordLinks | → Shipping Items |
| Opciones | Proveedor | multipleRecordLinks | → Shipping Proveedores |
| Opciones | Artículo Asociado | multipleRecordLinks | → Shipping Items |

---

## PASO 4B — Lookups de cliente ⚠️ CREAR A MANO (API no soporta multipleLookupValues)

La Metadata API devuelve `UNSUPPORTED_FIELD_TYPE_FOR_CREATE` para lookups.
Crearlos en Airtable UI: tabla "Operación Comercial" → + campo → tipo Lookup.

| Tabla | Campo | Tipo | Config |
|---|---|---|---|
| Operación Comercial | Cliente Nombre | multipleLookupValues | via `Cliente` → campo `Nombre` en Clientes |
| Operación Comercial | Cliente Teléfono | multipleLookupValues | via `Cliente` → campo `Teléfono` en Clientes |
| Operación Comercial | Cliente Correo | multipleLookupValues | via `Cliente` → campo `Correo` en Clientes |
| Operación Comercial | Cliente Cédula | multipleLookupValues | via `Cliente` → campo `Cédula` en Clientes |

---

## PASO 4C — Campos calculados

| Tabla | Campo | Tipo | Fórmula / Config |
|---|---|---|---|
| Abonos | Abono | formula (convertir primario) | `{Cliente snapshot} & " — " & DATETIME_FORMAT({Fecha de Abono},"YYYY-MM-DD HH:mm") & " — $" & {Monto}` — ajustar cuando se decida si el nombre del pagador viene de lookup o snapshot |
| Opciones | Opción | formula (convertir primario) | `{Producto / Descripción} & " — $" & {Precio Venta Cliente}` o similar |
| Opciones | Costo Real Total | formula | `{Costo Proveedor} + {Flete Estimado} + {Arancel / Impuestos} + {Otros Costos}` |
| Opciones | Ganancia Estimada | formula | `{Precio Venta Cliente} - {Costo Real Total}` |
| Operación Comercial | Código Operación | formula (convertir primario) | `"OC-" & {Consecutivo}` — definir formato exacto |
| Operación Comercial | Consecutivo | autoNumber | Airtable lo gestiona; crear antes de la fórmula `Código Operación` |
| Operación Comercial | Total Abonado | rollup | SUM de `{Monto}` desde `Abonos` via link `Aplicado a: Operación` |
| Operación Comercial | Saldo Pendiente | formula | `{Total Cotizado} - {Total Abonado}` |
| Operación Comercial | Fecha Creación | createdTime | Automático de Airtable |
| Operación Comercial | Última Actualización | lastModifiedTime | Automático de Airtable |

---

## PASO 4D — Integración financiera (fase posterior, no urgente)

| Tabla | Campo | Tipo | Notas |
|---|---|---|---|
| Abonos | Movimiento Financiero | multipleRecordLinks o singleLineText | Pendiente de definir si será link a tabla de finanzas o ID externo |

---

## Resumen de IDs de tablas nuevas

| Tabla | ID Airtable |
|---|---|
| Abonos | `tbli03YnDxVsrnmZK` |
| Opciones | `tblYRUY3ZaBKAMaG8` |
| Operación Comercial | `tblBSGQhdCsDsdCrh` |
