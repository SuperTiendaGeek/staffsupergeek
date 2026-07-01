# Reporte de emparejamiento — Fase 2A

> Generado: 2026-06-27  
> Base destino: ENSAYO (`AIRTABLE_ENSAYO_ID`)  
> Base origen: Gestión saneada (`AIRTABLE_GESTION_ID`)

---

## Resultado por relación

| # | Tabla origen | Campo | Tabla destino | Inverso | Links escritos | Huérfanos |
|---|---|---|---|---|---:|---:|
| 1 | Órdenes de Reparación | Cliente | Clientes | Órdenes Relacionadas | 353 | 0 |
| 2 | Órdenes de Reparación | Historial de Estados | Historial de Estados | Órdenes de Reparación | 1 264 | 0 |
| 3 | Órdenes de Reparación | Abonos | Abonos por Orden | Orden de Reparación | 126 | 0 |
| 4 | Órdenes de Reparación | Repuestos por Orden | Repuestos por Orden | Orden de Reparación | 60 | 0 |
| 5 | Órdenes de Reparación | Servicios por Orden | Servicios por Orden | Orden de Reparación | 195 | 0 |
| 6 | Órdenes de Reparación | Productos Digitales | Productos Digitales | Orden de Reparación | 21 | 0 |
| 7 | Repuestos por Orden | Repuesto del Catálogo | Catálogo Repuestos | Repuestos por Orden | 60 | 0 |
| 8 | Servicios por Orden | Servicio del Catálogo | Catálogo Servicios | Servicios por Orden | 195 | 0 |
| 9 | Productos Digitales | Software / Producto | Catálogo Productos Digitales | Productos Digitales | 25 | 0 |
| 10 | Clientes | Productos Digitales | Productos Digitales | Cliente | 0 | 0 |
| | | | | **TOTAL** | **2 299** | **0** |

---

## Notas

### Relación #10 — Clientes.[Productos Digitales]: 0 links

En el origen saneado, el campo `Productos Digitales` en la tabla `Clientes` no tenía valores (campo vacío en todos los registros). Los 25 productos digitales sí están enlazados a sus Órdenes de Reparación (relación #6, 21 links) y al Catálogo (relación #9, 25 links). El campo `Cliente` en `Productos Digitales` (inverso de la relación #10) permanece vacío — esto refleja fielmente el estado del origen.

### prefersSingleRecordLink

La API de Airtable devuelve HTTP 422 al intentar modificar `prefersSingleRecordLink` via PATCH en campos ya creados. Esta es una preferencia de interfaz (controla si el campo muestra "selector único" o "selector múltiple" en la UI); no afecta la integridad de los datos ni las queries. Se puede ajustar manualmente desde la interfaz de Airtable si se desea.

### Integridad referencial

**0 huérfanos en las 10 relaciones.** Todos los IDs del origen tuvieron correspondencia exacta en ENSAYO gracias al campo `_old_record_id` sembrado en la Fase 1.

---

## Siguiente fase — 2B (reconstrucción manual)

Campos pendientes de reconstrucción (fórmulas, rollups, lookups, counts) documentados en `docs/campos-pendientes.md` — **67 campos** en total a través de las 11 tablas.
