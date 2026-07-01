# Inventario "antes" — Pre-migración

> Generado: 2026-06-24  
> Fuente ORIGEN: base `appdaytNmMrInjtUG` (copia congelada "Gestión de Órdenes de Reparación")  
> Fuente ADM: base `appBXa0MfHfW5UlTG` (base de ensayo = duplicado fiel de "SUPER GEEK ADM")

---

## ORIGEN — Gestión de Órdenes de Reparación

| Tabla | Registros |
|-------|----------:|
| Órdenes de Reparación | 353 |
| Clientes | 353 |
| Historial de Estados | 1 264 |
| Manual Técnico | 6 |
| Catálogo Repuestos | 14 |
| Repuestos por Orden | 19 |
| Catálogo Servicios | 45 |
| Servicios por Orden | 63 |
| **Abonos por Orden** | **43** |
| Productos Digitales | 7 |
| Catálogo Productos Digitales | 6 |
| **TOTAL** | **2 173** |

### Abonos por Orden — sumas de Monto

| Conjunto | Suma |
|----------|-----:|
| Todos los registros | $1 908,00 |
| Excluyendo Estado del Abono = "Anulado" | $1 908,00 |

> Nota: no se encontraron abonos con estado "Anulado" en la base congelada. Ambas sumas son iguales.

---

## ADM — SUPER GEEK ADM (base ensayo)

### Abonos de Cotización

| Métrica | Valor |
|---------|------:|
| Registros | 4 |
| Suma Monto (todos) | $491,00 |
| Suma Monto (sin Estado del Abono = "Anulado") | $490,00 |

> 1 registro anulado con Monto = $1,00.

### Shipping Pagos

| Métrica | Valor |
|---------|------:|
| Registros | 2 |
| Suma "Total a pagar" | $5 810,00 |

> Campo real confirmado: `Total a pagar` (no "Total pagado").

### Horarios Pagos

| Métrica | Valor |
|---------|------:|
| Registros | 3 |
| Suma "Monto Pagado" | $988,09 |

> Los 3 registros tienen Estado del Pago = "Registrado" — ninguno anulado.

---

## Resumen consolidado de dinero

| Origen | Tabla | Registros | Monto total | Sin anulados |
|--------|-------|----------:|------------:|-------------:|
| GESTIÓN | Abonos por Orden | 43 | $1 908,00 | $1 908,00 |
| ADM | Abonos de Cotización | 4 | $491,00 | $490,00 |
| ADM | Shipping Pagos | 2 | $5 810,00 | — |
| ADM | Horarios Pagos | 3 | $988,09 | — |
| | **TOTAL** | **52** | **$9 197,09** | |
