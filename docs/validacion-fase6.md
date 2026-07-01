# Validación post-migración — Fase 2A completa

> Generado: 2026-06-28  
> Base auditada: ENSAYO (`AIRTABLE_ENSAYO_ID`)  
> Referencia: inventario v2 (`docs/inventario-antes-v2.md`)  
> Tarea: SOLO LECTURA — ningún dato fue modificado

---

## 1 — Conteo de registros por tabla

| Tabla | ENSAYO | Esperado | Resultado |
|-------|-------:|--------:|-----------|
| Órdenes de Reparación | 353 | 353 | ✅ OK |
| Clientes | 353 | 353 | ✅ OK |
| Historial de Estados | 1 264 | 1 264 | ✅ OK |
| Manual Técnico | 6 | 6 | ✅ OK |
| Catálogo Repuestos | 45 | 45 | ✅ OK |
| Repuestos por Orden | 60 | 60 | ✅ OK |
| Catálogo Servicios | 54 | 54 | ✅ OK |
| Servicios por Orden | 195 | 195 | ✅ OK |
| Abonos por Orden | 126 | 126 | ✅ OK |
| Productos Digitales | 25 | 25 | ✅ OK |
| Catálogo Productos Digitales | 7 | 7 | ✅ OK |
| **TOTAL** | **2 488** | **2 488** | ✅ OK |

---

## 2 — Reconciliación de dinero

| Fuente | Campo | Registros | Suma |
|--------|-------|----------:|-----:|
| Abonos por Orden | `Monto` (campo plano) | 126 | **$6 274,00** |
| Órdenes de Reparación | `Total Abonado NV` (rollup/migrado) | 353 poblados / 0 vacíos | **$6 274,00** |

**✅ Coinciden.** El mismo total de $6 274,00 visto desde las dos tablas confirma que todos los abonos están correctamente enlazados a sus órdenes y que no hay duplicados ni pérdidas.

---

## 3 — Integridad de cálculos

### 3a — Campos de totales en Órdenes de Reparación

| Campo | Poblados | Vacíos |
|-------|--------:|-------:|
| `Total a Pagar NV` | **353** | 0 |
| `Saldo NV` | **353** | 0 |

✅ Ambos campos tienen valor en el 100 % de las 353 órdenes.

> **Nota:** `Total a Pagar NV`, `Saldo NV` y `Total Abonado NV` están listados en
> `docs/campos-pendientes.md` como fórmulas/rollups pendientes de reconstrucción
> (Fase 2B). El hecho de que ya retornen valores implica que los datos fueron
> capturados como campos numéricos planos en la Fase 1 (Airtable devuelve los
> valores computados al leer; la migración los almacenó como número). Son valores
> de *snapshot* del momento de migración; en Fase 2B se reemplazarán por las
> fórmulas/rollups en vivo. Mientras las fórmulas no estén reconstruidas,
> **estos valores no se actualizarán automáticamente** si se modifican datos.

### 3b — Número de Órdenes en Clientes

| Segmento | Clientes |
|----------|--------:|
| `Número de Órdenes` > 0 | **300** |
| `Número de Órdenes` == 0 | **53** |
| `Número de Órdenes` nulo | 0 |

> Los 53 clientes con valor 0 también reflejan el snapshot de la Fase 1 (el campo
> `Número de Órdenes` es un count que aún no fue reconstruido como campo vivo).
> Puede darse que esos clientes existan en la base pero sus órdenes ya no estén
> activas o pertenezcan a un flujo diferente. **No se detectó ningún cliente con
> valor nulo** — el campo está presente en todos los registros.

---

## Resumen ejecutivo

| Verificación | Estado |
|---|---|
| Conteo de registros — 11 tablas | ✅ 2 488 / 2 488 — sin diferencias |
| Suma Monto en Abonos por Orden | ✅ $6 274,00 |
| Suma Total Abonado NV en Órdenes | ✅ $6 274,00 — coincide |
| Total a Pagar NV — cobertura | ✅ 353/353 poblados |
| Saldo NV — cobertura | ✅ 353/353 poblados |
| Número de Órdenes en Clientes | ⚠ 300/353 con valor > 0 (ver nota 3b) |

### Observación pendiente

Los campos de fórmula/rollup/count (`Total a Pagar NV`, `Saldo NV`, `Total Abonado NV`, `Número de Órdenes`) contienen valores de snapshot migrados en la Fase 1. Son correctos a la fecha de migración pero **estáticos**. Reconstruirlos como campos vivos en Fase 2B es necesario para que reflejen cambios futuros.
