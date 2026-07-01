# Inventario "antes" v2 — Base saneada

> Fuente: `appvRFU1Kr58Jrvh4` ("Gestión de Órdenes de Reparación (Copy)")  
> Generado: 2026-06-24 — SOLO LECTURA

---

## 1 — Conteos de las 11 tablas activas

| Tabla | Registros | vs. inventario v1 | Diferencia |
|-------|----------:|:-----------------:|:----------:|
| Órdenes de Reparación | 353 | 353 | = |
| Clientes | 353 | 353 | = |
| Historial de Estados | 1 264 | 1 264 | = |
| Manual Técnico | 6 | 6 | = |
| Catálogo Repuestos | 45 | 14 | **+31** |
| Repuestos por Orden | 60 | 19 | **+41** |
| Catálogo Servicios | 54 | 45 | **+9** |
| Servicios por Orden | 195 | 63 | **+132** |
| Abonos por Orden | 126 | 43 | **+83** |
| Productos Digitales | 25 | 7 | **+18** |
| Catálogo Productos Digitales | 7 | 6 | **+1** |
| **TOTAL** | **2 488** | 2 173 | **+315** |

> Las 4 tablas con variación mayor corresponden a las áreas donde se
> consolidaron registros del modelo legacy (Repuestos Usados / Servicios)
> hacia los modelos nuevos (Repuestos por Orden / Servicios por Orden).
> Los conteos de Órdenes, Clientes e Historial son estables — confirma
> que no se perdieron registros del núcleo.

---

## 2 — Cifra de control — Abonos por Orden

| Métrica | Valor | Observación |
|---------|------:|-------------|
| Total registros | 126 | — |
| Registros con Monto en blanco | **0** | ✅ todos tienen valor |
| Suma Monto (todos) | **$6 274,00** | — |
| Suma Monto (excl. Anulado) | **N/A** | ⚠ ver nota abajo |

### ⚠ Campo "Estado del Abono" no existe en esta base

La base saneada **no tiene ningún campo de estado en Abonos por Orden**.
El esquema de la tabla solo contiene:  
`ID Abono · Orden de Reparación · Fecha · Monto · Método de pago · Observación · Registrado por · Comprobante · Movimiento Financiero ID · Cuenta Destino · Estado Financiero · Fecha Sincronización Finanzas · Error Sincronización Finanzas`

Al leer los 126 registros, **ninguno tiene valor en "Estado Financiero"**
ni en ningún otro campo que indique "Anulado". La suma con exclusión de
anulados no puede calcularse porque no existe esa marca en los datos.

**Acción requerida:** Confirmar si en la versión saneada se eliminaron los
abonos anulados (y por eso no hay marca) o si ese campo aún debe añadirse.
La cifra de control de esta base es simplemente **$6 274,00**.

---

## 3 — Integridad post-consolidación

### 3a — Repuestos por Orden

| Campo clave | Poblado | Vacío |
|-------------|--------:|------:|
| Nombre del repuesto snapshot o copiado | **60 / 60** ✅ | 0 |
| Orden de Reparación (link) | — | (no verificado aquí) |

> Consolidación completa: todos los repuestos tienen nombre snapshot.

### 3b — Servicios por Orden

| Campo clave | Poblado | Vacío |
|-------------|--------:|------:|
| Nombre del servicio snapshot o copiado | **195 / 195** ✅ | 0 |

> Consolidación completa: todos los servicios tienen nombre snapshot.

### 3c — Productos Digitales

| Campo clave | Poblado | Vacío |
|-------------|--------:|------:|
| Software / Producto (link a catálogo) | **25 / 25** ✅ | 0 |
| Clave de Activación | **7 / 25** ⚠ | 18 |

> El link al catálogo está completo. La Clave de Activación solo está
> poblada en 7 de 25 productos — los 18 restantes tienen estado "Usado"
> (22 total en "Usado", 3 en "Disponible"). Verificar si los productos
> "Usado" que no tienen clave es por diseño (la clave ya fue entregada al
> cliente y fue borrada intencionalmente) o es un hueco de datos.

**Distribución Estado:**  
- Usado: 22  
- Disponible: 3

### 3d — Abonos por Orden

| Campo clave | Poblado | Vacío |
|-------------|--------:|------:|
| Orden de Reparación (link) | **126 / 126** ✅ | 0 |
| Monto | **126 / 126** ✅ | 0 |

> Todos los abonos tienen monto y están vinculados a una orden.

### 3e — Órdenes de Reparación — campo ID

| Métrica | Valor |
|---------|-------|
| Total órdenes | 353 |
| Campo `ID` (fórmula "OR000…") poblado | **353 / 353** ✅ |
| Prefijo | Todos comienzan con `OR` |
| Muestra | OR000210, OR000178, OR000057, OR000240, OR000229 |

> El campo `ID` es una fórmula que concatena el autoNumber. Está
> calculado en los 353 registros — usable como clave de emparejamiento
> con Cotizaciones.
