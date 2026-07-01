# Inventario de producción v3

> Generado: 2026-06-28  
> Fuente ORIGEN: `appk7jO3ayjihXEbW` — "Gestión de Órdenes de Reparación" (PRODUCCIÓN)  
> Fuente DESTINO: `appLkmz7I6vqJ2UXc` — "SUPER GEEK ADM" (PRODUCCIÓN)  
> Tarea: SOLO LECTURA — ningún dato fue modificado

---

## 1 — Conteo de las 11 tablas activas (ORIGEN)

| Tabla | v3 (hoy) | v2 (copia saneada 24-jun) | Δ |
|-------|--------:|--------:|---:|
| Órdenes de Reparación | **355** | 353 | +2 |
| Clientes | **354** | 353 | +1 |
| Historial de Estados | **1 271** | 1 264 | +7 |
| Manual Técnico | **6** | 6 | = |
| Catálogo Repuestos | **45** | 45 | = |
| Repuestos por Orden | **60** | 60 | = |
| Catálogo Servicios | **54** | 54 | = |
| Servicios por Orden | **195** | 195 | = |
| Abonos por Orden | **127** | 126 | +1 |
| Productos Digitales | **25** | 25 | = |
| Catálogo Productos Digitales | **7** | 7 | = |
| **TOTAL** | **2 499** | 2 488 | **+11** |

> La base de producción creció 11 registros entre el 24-jun (copia saneada) y hoy.
> Los cambios se concentran en el núcleo operativo: 2 órdenes nuevas, 1 cliente nuevo,
> 7 estados nuevos en historial y 1 abono nuevo.

---

## 2 — Cifra de control de dinero (ORIGEN, hoy)

| Métrica | Valor |
|---------|------:|
| Total registros Abonos por Orden | **127** |
| Registros con Monto en blanco | **0** |
| **Suma Monto total** | **$6 334,00** |

> Referencia anterior (copia saneada, 24-jun): 126 registros · $6 274,00  
> Diferencia: +1 abono · +$60,00

---

## 3 — Colisiones de nombre en DESTINO

✅ **Ninguna.** Las 11 tablas que se van a crear no existen todavía en SUPER GEEK ADM.

---

## 4 — Headroom del DESTINO (SUPER GEEK ADM)

### Tablas

| | Valor |
|-|------:|
| Tablas actuales | **36** |
| Tablas a agregar | 11 |
| Tablas resultantes | **47** |

### Registros actuales por tabla en DESTINO

| Tabla | Registros |
|-------|----------:|
| Abonos de Cotización | 4 |
| Catálogo CPUs | 114 |
| Catálogo Características Extras | 13 |
| Catálogo Computadores | 185 |
| Catálogo Conectividad | 6 |
| Catálogo Puertos | 21 |
| Codigos 2FA | 68 |
| Configuración Horarios | 1 |
| Cotizaciones | 24 |
| Destinatarios | 1 |
| Facturas Electrónicas | 26 |
| Garantías | 1 |
| Horarios Ajustes | 3 |
| Horarios Marcaciones | 376 |
| Horarios Pagos | 3 |
| Horarios Periodos de Pago | 5 |
| Horarios Registros | 94 |
| Item | 162 |
| Notificaciones | 14 |
| Opciones de Cotización | 23 |
| Packing | 11 |
| Pago | 12 |
| Proveedores | 7 |
| Registro Accesos | 132 |
| Shipping Destinatarios | 3 |
| Shipping Eventos | 118 |
| Shipping Finanzas Movimientos | 2 |
| Shipping Items | 29 |
| Shipping Migraciones | 0 |
| Shipping Novedades | 0 |
| Shipping Packings | 3 |
| Shipping Pagos | 2 |
| Shipping Proveedores | 19 |
| Shipping Recepciones | 0 |
| Usuarios | 5 |
| Viaje | 1 |
| **TOTAL** | **1 488** |

### Estimado post-migración

| | Registros |
|-|----------:|
| Actuales en DESTINO | 1 488 |
| A agregar (ORIGEN v3) | ~2 499 |
| **Resultante estimado** | **~3 987** |

> Airtable Team / Pro admite 50 000 registros por base y 1 000 tablas.
> 3 987 registros y 47 tablas están muy por debajo de cualquier límite de plan.
> ✅ Sin riesgo de colisión de capacidad.
