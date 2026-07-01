# Reporte de emparejamiento — Producción (Fase 2A)

> Generado: 2026-06-28
> DESTINO: SUPER GEEK ADM (`appLkmz7I6vqJ2UXc`)
> ORIGEN: Gestión de Órdenes de Reparación (`appk7jO3ayjihXEbW`)

## Resultado por relación

| # | Tabla origen | Campo | Tabla destino | Inverso | Links origen | Escritos | Huérfanos |
|---|---|---|---|---|---:|---:|---:|
| 1 ✅ | Órdenes de Reparación | Cliente | Clientes | Órdenes Relacionadas | 355 | 355 | 0 |
| 2 ✅ | Órdenes de Reparación | Historial de Estados | Historial de Estados | Órdenes de Reparación | 1271 | 1271 | 0 |
| 3 ✅ | Órdenes de Reparación | Abonos | Abonos por Orden | Orden de Reparación | 127 | 127 | 0 |
| 3 ✅ | Órdenes de Reparación | Repuestos por Orden | Repuestos por Orden | Orden de Reparación | 60 | 60 | 0 |
| 4 ✅ | Órdenes de Reparación | Servicios por Orden | Servicios por Orden | Orden de Reparación | 195 | 195 | 0 |
| 5 ✅ | Órdenes de Reparación | Productos Digitales | Productos Digitales | Orden de Reparación | 21 | 21 | 0 |
| 6 ✅ | Clientes | Productos Digitales | Productos Digitales | Cliente | 0 | 0 | 0 |
| 7 ✅ | Catálogo Repuestos | Repuestos por Orden | Repuestos por Orden | Repuesto del Catálogo | 60 | 60 | 0 |
| 8 ✅ | Catálogo Servicios | Servicios por Orden | Servicios por Orden | Servicio del Catálogo | 195 | 195 | 0 |
| 9 ✅ | Catálogo Productos Digitales | Productos Digitales | Productos Digitales | Software / Producto | 25 | 25 | 0 |
| | | | | **TOTAL** | — | **2309** | **0** |

## Huérfanos

Ninguno. Integridad referencial al 100 %.

## Nota técnica

`prefersSingleRecordLink` no puede modificarse vía API (HTTP 422); es solo preferencia de interfaz y no afecta datos. Ajustar manualmente si se desea.
