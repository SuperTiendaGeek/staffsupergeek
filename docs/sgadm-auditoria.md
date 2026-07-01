# Auditoría de Esquema — SUPER GEEK ADM

> Base: `appLkmz7I6vqJ2UXc`  |  Generado: 2026-06-24  |  Tablas: 36

---

## Índice de tablas

1. [Item](#item) — **162** registros, 93 campos
2. [Packing](#packing) — **11** registros, 39 campos
3. [Pago](#pago) — **12** registros, 21 campos
4. [Proveedores](#proveedores) — **7** registros, 7 campos
5. [Viaje](#viaje) — **1** registros, 6 campos
6. [Garantías](#garantias) — **1** registros, 13 campos
7. [Destinatarios](#destinatarios) — **1** registros, 3 campos
8. [Usuarios](#usuarios) — **5** registros, 20 campos
9. [Registro Accesos](#registro-accesos) — **131** registros, 9 campos
10. [Codigos 2FA](#codigos-2fa) — **49** registros, 7 campos
11. [Horarios Registros](#horarios-registros) — **88** registros, 25 campos
12. [Horarios Marcaciones](#horarios-marcaciones) — **350** registros, 13 campos
13. [Configuración Horarios](#configuracion-horarios) — **1** registros, 10 campos
14. [Horarios Pagos](#horarios-pagos) — **3** registros, 13 campos
15. [Horarios Periodos de Pago](#horarios-periodos-de-pago) — **5** registros, 30 campos
16. [Horarios Ajustes](#horarios-ajustes) — **3** registros, 15 campos
17. [Cotizaciones](#cotizaciones) — **24** registros, 27 campos
18. [Opciones de Cotización](#opciones-de-cotizacion) — **23** registros, 23 campos
19. [Abonos de Cotización](#abonos-de-cotizacion) — **4** registros, 18 campos
20. [Notificaciones](#notificaciones) — **14** registros, 17 campos
21. [Shipping Proveedores](#shipping-proveedores) — **19** registros, 46 campos
22. [Shipping Items](#shipping-items) — **29** registros, 132 campos
23. [Shipping Pagos](#shipping-pagos) — **2** registros, 28 campos
24. [Shipping Finanzas Movimientos](#shipping-finanzas-movimientos) — **2** registros, 21 campos
25. [Shipping Packings](#shipping-packings) — **3** registros, 42 campos
26. [Shipping Recepciones](#shipping-recepciones) — **0** registros, 21 campos
27. [Shipping Novedades](#shipping-novedades) — **0** registros, 27 campos
28. [Shipping Migraciones](#shipping-migraciones) — **0** registros, 25 campos
29. [Shipping Eventos](#shipping-eventos) — **118** registros, 22 campos
30. [Catálogo CPUs](#catalogo-cpus) — **114** registros, 13 campos
31. [Catálogo Computadores](#catalogo-computadores) — **185** registros, 19 campos
32. [Catálogo Conectividad](#catalogo-conectividad) — **6** registros, 11 campos
33. [Catálogo Puertos](#catalogo-puertos) — **21** registros, 11 campos
34. [Catálogo Características Extras](#catalogo-caracteristicas-extras) — **13** registros, 11 campos
35. [Shipping Destinatarios](#shipping-destinatarios) — **3** registros, 14 campos
36. [Facturas Electrónicas](#facturas-electronicas) — **26** registros, 19 campos

---

## Campos no migrables

Campos que requieren acción especial antes de migrar a otra base:

| Tabla | Campo | Tipo | Razón |
|-------|-------|------|-------|
| Item | Código | formula | fórmula — revisar referencias a campos locales |
| Item | Clave Grupo | formula | fórmula — revisar referencias a campos locales |
| Item | Precio Sugerido (USD) | formula | fórmula — revisar referencias a campos locales |
| Item | Ganancia (item solo?) | formula | fórmula — revisar referencias a campos locales |
| Item | Fecha Ofertado | createdTime | timestamp de creación — se pierde al migrar |
| Item | Fecha de Pago Máxima | formula | fórmula — revisar referencias a campos locales |
| Item | Estado Pago | rollup | rollup — depende de links locales |
| Item | Fecha y Hora de Recepción | formula | fórmula — revisar referencias a campos locales |
| Item | Probar Hasta | formula | fórmula — revisar referencias a campos locales |
| Item | Garantía Expira | formula | fórmula — revisar referencias a campos locales |
| Item | Estado Garantía | formula | fórmula — revisar referencias a campos locales |
| Item | Estado Empaque | formula | fórmula — revisar referencias a campos locales |
| Item | D. Recivido en LV | formula | fórmula — revisar referencias a campos locales |
| Item | From | formula | fórmula — revisar referencias a campos locales |
| Item | Porcentaje | formula | fórmula — revisar referencias a campos locales |
| Item | Flete EC Item Packing | formula | fórmula — revisar referencias a campos locales |
| Item | Arancel Item Packing | formula | fórmula — revisar referencias a campos locales |
| Item | Costo Unidad | formula | fórmula — revisar referencias a campos locales |
| Item | Ganancia Neta | formula | fórmula — revisar referencias a campos locales |
| Item | Marca | formula | fórmula — revisar referencias a campos locales |
| Item | Serie y Modelo | formula | fórmula — revisar referencias a campos locales |
| Item | S.O. | formula | fórmula — revisar referencias a campos locales |
| Item | Txt_Facebook | formula | fórmula — revisar referencias a campos locales |
| Item | Ganancia | formula | fórmula — revisar referencias a campos locales |
| Item | Recargo Pago Exterior % | formula | fórmula — revisar referencias a campos locales |
| Item | Código Pedido | formula | fórmula — revisar referencias a campos locales |
| Packing | Pack | formula | fórmula — revisar referencias a campos locales |
| Packing | Numerador | autoNumber | autoNumber se reinicia al migrar (copiar a campo texto antes) |
| Packing | Costo Total Items | rollup | rollup — depende de links locales |
| Packing | Total Cost Texto | formula | fórmula — revisar referencias a campos locales |
| Packing | Costo Items Encargos | rollup | rollup — depende de links locales |
| Packing | Total Items | formula | fórmula — revisar referencias a campos locales |
| Packing | Peso (Kilos) | rollup | rollup — depende de links locales |
| Packing | UPS | button | botón — configuración manual |
| Packing | Int’l Ship | button | botón — configuración manual |
| Packing | Fecha Envío | formula | fórmula — revisar referencias a campos locales |
| Packing | Arribo Estimado | formula | fórmula — revisar referencias a campos locales |
| Packing | Qty Items | rollup | rollup — depende de links locales |
| Packing | Qty Items Prov | rollup | rollup — depende de links locales |
| Packing | Factura | button | botón — configuración manual |
| Packing | imprimir | button | botón — configuración manual |
| Packing | Recargos Pago Exterior | formula | fórmula — revisar referencias a campos locales |
| Packing | Botón Invoice PDF | button | botón — configuración manual |
| Packing | Fecha Recibido SG | formula | fórmula — revisar referencias a campos locales |
| Packing | Qty Regalos | rollup | rollup — depende de links locales |
| Packing | Qty Encargos | rollup | rollup — depende de links locales |
| Packing | Ofertas LV | rollup | rollup — depende de links locales |
| Pago | Consecutivo | autoNumber | autoNumber se reinicia al migrar (copiar a campo texto antes) |
| Pago | Total Pago | rollup | rollup — depende de links locales |
| Pago | Proveedor Único | rollup | rollup — depende de links locales |
| Pago | Estado de Pago | formula | fórmula — revisar referencias a campos locales |
| Pago | Recargos Pago Exterior | formula | fórmula — revisar referencias a campos locales |
| Proveedores | Compras Totales | rollup | rollup — depende de links locales |
| Viaje | Capital Invertido | rollup | rollup — depende de links locales |
| Garantías | Garantía ID | formula | fórmula — revisar referencias a campos locales |
| Garantías | Contador Casos | autoNumber | autoNumber se reinicia al migrar (copiar a campo texto antes) |
| Garantías | Fecha Reporte | createdTime | timestamp de creación — se pierde al migrar |
| Registro Accesos | Id | autoNumber | autoNumber se reinicia al migrar (copiar a campo texto antes) |
| Horarios Registros | Registro | formula | fórmula — revisar referencias a campos locales |
| Horarios Registros | Última actualización | lastModifiedTime | timestamp de modificación — se pierde al migrar |
| Horarios Marcaciones | Marcación | formula | fórmula — revisar referencias a campos locales |
| Horarios Marcaciones | Creado | createdTime | timestamp de creación — se pierde al migrar |
| Configuración Horarios | Valor Hora | formula | fórmula — revisar referencias a campos locales |
| Configuración Horarios | Última actualización | lastModifiedTime | timestamp de modificación — se pierde al migrar |
| Horarios Pagos | Pago | formula | fórmula — revisar referencias a campos locales |
| Horarios Pagos | Creado | createdTime | timestamp de creación — se pierde al migrar |
| Horarios Periodos de Pago | Periodo | formula | fórmula — revisar referencias a campos locales |
| Horarios Periodos de Pago | Total Minutos | rollup | rollup — depende de links locales |
| Horarios Periodos de Pago | Total Horas | rollup | rollup — depende de links locales |
| Horarios Periodos de Pago | Total Ganado | rollup | rollup — depende de links locales |
| Horarios Periodos de Pago | Total Pagado | rollup | rollup — depende de links locales |
| Horarios Periodos de Pago | Saldo Pendiente | formula | fórmula — revisar referencias a campos locales |
| Horarios Periodos de Pago | Total Ajustes | rollup | rollup — depende de links locales |
| Horarios Periodos de Pago | Total Neto | formula | fórmula — revisar referencias a campos locales |
| Horarios Periodos de Pago | Saldo Pendiente Neto | formula | fórmula — revisar referencias a campos locales |
| Horarios Ajustes | Horas Ajustadas | formula | fórmula — revisar referencias a campos locales |
| Horarios Ajustes | Es Descuento | formula | fórmula — revisar referencias a campos locales |
| Cotizaciones | Código Cotización | formula | fórmula — revisar referencias a campos locales |
| Cotizaciones | Consecutivo | autoNumber | autoNumber se reinicia al migrar (copiar a campo texto antes) |
| Cotizaciones | Saldo Pendiente | formula | fórmula — revisar referencias a campos locales |
| Cotizaciones | Fecha Creación | createdTime | timestamp de creación — se pierde al migrar |
| Cotizaciones | Última Actualización | lastModifiedTime | timestamp de modificación — se pierde al migrar |
| Opciones de Cotización | Opción | formula | fórmula — revisar referencias a campos locales |
| Opciones de Cotización | Costo Real Total | formula | fórmula — revisar referencias a campos locales |
| Opciones de Cotización | Ganancia Estimada | formula | fórmula — revisar referencias a campos locales |
| Abonos de Cotización | Abono | formula | fórmula — revisar referencias a campos locales |
| Abonos de Cotización | Creado | createdTime | timestamp de creación — se pierde al migrar |
| Notificaciones | Notificación | formula | fórmula — revisar referencias a campos locales |
| Notificaciones | Creado | createdTime | timestamp de creación — se pierde al migrar |
| Shipping Proveedores | Proveedor ID | formula | fórmula — revisar referencias a campos locales |
| Shipping Items | Total costo proveedor Packing | rollup | rollup — depende de links locales |
| Shipping Items | Costo flete asignado | formula | fórmula — revisar referencias a campos locales |
| Shipping Items | Costo arancel asignado | formula | fórmula — revisar referencias a campos locales |
| Shipping Items | Otros costos asignados | formula | fórmula — revisar referencias a campos locales |
| Shipping Items | Costo logístico asignado | formula | fórmula — revisar referencias a campos locales |
| Shipping Items | Costo total unidad | formula | fórmula — revisar referencias a campos locales |
| Shipping Packings | Costo Total Items Proveedor | rollup | rollup — depende de links locales |
| Shipping Packings | Cantidad Items Packing | count | count — depende de links locales |

---

## Mapa de relaciones

```
  Item ──[Proveedor]──(1:1)──> Proveedores
  Item ──[Pago]──(1:N)──> Pago
  Item ──[Viaje]──(1:1)──> Viaje
  Item ──[Packing]──(1:1)──> Packing
  Item ──[Garantías]──(1:N)──> Garantías
  Item ──[Destinatario]──(1:1)──> Destinatarios
  Item ──[Opciones de Cotización]──(1:N)──> Opciones de Cotización
  Item ──[Cotizaciones]──(1:N)──> Cotizaciones
  Packing ──[Items]──(1:N)──> Item
  Packing ──[Destinatario]──(1:1)──> Destinatarios
  Packing ──[Shipping Items]──(1:N)──> Shipping Items
  Pago ──[Items]──(1:N)──> Item
  Pago ──[Shipping Items]──(1:N)──> Shipping Items
  Proveedores ──[Item]──(1:N)──> Item
  Proveedores ──[Opciones de Cotización]──(1:N)──> Opciones de Cotización
  Viaje ──[Items]──(1:N)──> Item
  Garantías ──[Artículo]──(1:1)──> Item
  Destinatarios ──[Packing]──(1:N)──> Packing
  Destinatarios ──[Item]──(1:N)──> Item
  Usuarios ──[Registro Accesos]──(1:N)──> Registro Accesos
  Usuarios ──[Codigos 2FA]──(1:N)──> Codigos 2FA
  Usuarios ──[Horarios Registros]──(1:N)──> Horarios Registros
  Usuarios ──[Horarios Marcaciones]──(1:N)──> Horarios Marcaciones
  Usuarios ──[Horarios Pagos]──(1:N)──> Horarios Pagos
  Usuarios ──[Horarios Periodos de Pago]──(1:N)──> Horarios Periodos de Pago
  Usuarios ──[Horarios Ajustes]──(1:N)──> Horarios Ajustes
  Usuarios ──[Notificaciones (Destinatario)]──(1:N)──> Notificaciones
  Usuarios ──[Notificaciones (Creado por)]──(1:N)──> Notificaciones
  Registro Accesos ──[Usuario]──(1:1)──> Usuarios
  Codigos 2FA ──[Usuario]──(1:1)──> Usuarios
  Horarios Registros ──[Empleado]──(1:1)──> Usuarios
  Horarios Registros ──[Marcaciones]──(1:N)──> Horarios Marcaciones
  Horarios Registros ──[Horarios Periodos de Pago]──(1:N)──> Horarios Periodos de Pago
  Horarios Registros ──[Horarios Ajustes]──(1:N)──> Horarios Ajustes
  Horarios Marcaciones ──[Registro del Día]──(1:1)──> Horarios Registros
  Horarios Marcaciones ──[Empleado]──(1:1)──> Usuarios
  Horarios Pagos ──[Empleado]──(1:1)──> Usuarios
  Horarios Pagos ──[Periodo de Pago]──(1:N)──> Horarios Periodos de Pago
  Horarios Periodos de Pago ──[Empleado]──(1:1)──> Usuarios
  Horarios Periodos de Pago ──[Registros del Periodo]──(1:N)──> Horarios Registros
  Horarios Periodos de Pago ──[Pagos]──(1:N)──> Horarios Pagos
  Horarios Periodos de Pago ──[Horarios Ajustes]──(1:N)──> Horarios Ajustes
  Horarios Periodos de Pago ──[Ajustes]──(1:N)──> Horarios Ajustes
  Horarios Ajustes ──[Empleado]──(1:1)──> Usuarios
  Horarios Ajustes ──[Registro del Día]──(1:1)──> Horarios Registros
  Horarios Ajustes ──[Periodo de Pago]──(1:1)──> Horarios Periodos de Pago
  Horarios Ajustes ──[Horarios Periodos de Pago 2]──(1:N)──> Horarios Periodos de Pago
  Cotizaciones ──[Opciones de Cotización]──(1:N)──> Opciones de Cotización
  Cotizaciones ──[Abonos de Cotización]──(1:N)──> Abonos de Cotización
  Cotizaciones ──[Opción Elegida]──(1:1)──> Opciones de Cotización
  Cotizaciones ──[Pedido Generado]──(1:1)──> Item
  Opciones de Cotización ──[Cotización]──(1:1)──> Cotizaciones
  Opciones de Cotización ──[Proveedor]──(1:1)──> Proveedores
  Opciones de Cotización ──[Item Asociado]──(1:1)──> Item
  Opciones de Cotización ──[Cotizaciones]──(1:N)──> Cotizaciones
  Abonos de Cotización ──[Cotización]──(1:1)──> Cotizaciones
  Notificaciones ──[Destinatario]──(1:1)──> Usuarios
  Notificaciones ──[Creado por]──(1:1)──> Usuarios
  Shipping Proveedores ──[Shipping Items (Proveedor de compra)]──(1:N)──> Shipping Items
  Shipping Proveedores ──[Shipping Items (Proveedor logístico / intermediario)]──(1:N)──> Shipping Items
  Shipping Proveedores ──[Shipping Pagos]──(1:N)──> Shipping Pagos
  Shipping Proveedores ──[Shipping Finanzas Movimientos]──(1:N)──> Shipping Finanzas Movimientos
  Shipping Proveedores ──[Shipping Packings (Proveedor responsable)]──(1:N)──> Shipping Packings
  Shipping Proveedores ──[Shipping Packings (Proveedor logístico / intermediario)]──(1:N)──> Shipping Packings
  Shipping Proveedores ──[Shipping Recepciones]──(1:N)──> Shipping Recepciones
  Shipping Proveedores ──[Shipping Novedades]──(1:N)──> Shipping Novedades
  Shipping Proveedores ──[Shipping Migraciones]──(1:N)──> Shipping Migraciones
  Shipping Proveedores ──[Shipping Eventos]──(1:N)──> Shipping Eventos
  Shipping Proveedores ──[Shipping Packings]──(1:N)──> Shipping Packings
  Shipping Proveedores ──[Shipping Packings 2]──(1:N)──> Shipping Packings
  Shipping Items ──[Proveedor de compra]──(1:1)──> Shipping Proveedores
  Shipping Items ──[Proveedor logístico / intermediario]──(1:1)──> Shipping Proveedores
  Shipping Items ──[Pago relacionado]──(1:1)──> Pago
  Shipping Items ──[Packing relacionado]──(1:1)──> Packing
  Shipping Items ──[Item padre]──(1:1)──> Shipping Items
  Shipping Items ──[Items hijos]──(1:N)──> Shipping Items
  Shipping Items ──[Shipping Pagos (Items relacionados)]──(1:N)──> Shipping Pagos
  Shipping Items ──[Shipping Pagos (Regalos incluidos)]──(1:N)──> Shipping Pagos
  Shipping Items ──[Shipping Packings]──(1:N)──> Shipping Packings
  Shipping Items ──[Shipping Recepciones]──(1:N)──> Shipping Recepciones
  Shipping Items ──[Shipping Novedades]──(1:N)──> Shipping Novedades
  Shipping Items ──[Shipping Migraciones]──(1:N)──> Shipping Migraciones
  Shipping Items ──[Shipping Eventos]──(1:N)──> Shipping Eventos
  Shipping Items ──[Conectividad V2]──(1:N)──> Catálogo Conectividad
  Shipping Items ──[Puertos V2]──(1:N)──> Catálogo Puertos
  Shipping Items ──[Características extras V2]──(1:N)──> Catálogo Características Extras
  Shipping Items ──[Shipping Destinatarios]──(1:N)──> Shipping Destinatarios
  Shipping Pagos ──[Proveedor]──(1:1)──> Shipping Proveedores
  Shipping Pagos ──[Items relacionados]──(1:N)──> Shipping Items
  Shipping Pagos ──[Regalos incluidos]──(1:N)──> Shipping Items
  Shipping Pagos ──[Shipping Finanzas Movimientos]──(1:N)──> Shipping Finanzas Movimientos
  Shipping Pagos ──[Shipping Migraciones]──(1:N)──> Shipping Migraciones
  Shipping Pagos ──[Shipping Eventos]──(1:N)──> Shipping Eventos
  Shipping Finanzas Movimientos ──[Pago Shipping relacionado]──(1:1)──> Shipping Pagos
  Shipping Finanzas Movimientos ──[Proveedor]──(1:1)──> Shipping Proveedores
  Shipping Finanzas Movimientos ──[Shipping Eventos]──(1:N)──> Shipping Eventos
  Shipping Packings ──[Proveedor responsable]──(1:1)──> Shipping Proveedores
  Shipping Packings ──[Proveedor logístico EC]──(1:1)──> Shipping Proveedores
  Shipping Packings ──[Items incluidos]──(1:N)──> Shipping Items
  Shipping Packings ──[Transportista USA]──(1:N)──> Shipping Proveedores
  Shipping Packings ──[Transportista EC]──(1:N)──> Shipping Proveedores
  Shipping Packings ──[Shipping Recepciones]──(1:N)──> Shipping Recepciones
  Shipping Packings ──[Shipping Novedades]──(1:N)──> Shipping Novedades
  Shipping Packings ──[Shipping Migraciones]──(1:N)──> Shipping Migraciones
  Shipping Packings ──[Shipping Eventos]──(1:N)──> Shipping Eventos
  Shipping Packings ──[Shipping Destinatarios]──(1:N)──> Shipping Destinatarios
  Shipping Recepciones ──[Packing relacionado]──(1:1)──> Shipping Packings
  Shipping Recepciones ──[Item revisado]──(1:1)──> Shipping Items
  Shipping Recepciones ──[Proveedor responsable]──(1:1)──> Shipping Proveedores
  Shipping Recepciones ──[Novedad relaciondad]──(1:N)──> Shipping Novedades
  Shipping Recepciones ──[Shipping Eventos]──(1:N)──> Shipping Eventos
  Shipping Novedades ──[Item relacionado]──(1:1)──> Shipping Items
  Shipping Novedades ──[Packing relacionado]──(1:1)──> Shipping Packings
  Shipping Novedades ──[Recepción relacionada]──(1:1)──> Shipping Recepciones
  Shipping Novedades ──[Proveedor responsable]──(1:1)──> Shipping Proveedores
  Shipping Novedades ──[Shipping Eventos]──(1:N)──> Shipping Eventos
  Shipping Migraciones ──[Registro Item V2 creado]──(1:1)──> Shipping Items
  Shipping Migraciones ──[Registro Pago V2 creado]──(1:1)──> Shipping Pagos
  Shipping Migraciones ──[Registro Packing V2 creado]──(1:1)──> Shipping Packings
  Shipping Migraciones ──[Registro Proveedor V2 relacionado]──(1:1)──> Shipping Proveedores
  Shipping Migraciones ──[Shipping Eventos]──(1:N)──> Shipping Eventos
  Shipping Eventos ──[Item relacionado]──(1:1)──> Shipping Items
  Shipping Eventos ──[Proveedor relacionado]──(1:1)──> Shipping Proveedores
  Shipping Eventos ──[Pago relacionado]──(1:1)──> Shipping Pagos
  Shipping Eventos ──[Packing relacionado]──(1:1)──> Shipping Packings
  Shipping Eventos ──[Recepción relacionada]──(1:1)──> Shipping Recepciones
  Shipping Eventos ──[Novedad relacionada]──(1:1)──> Shipping Novedades
  Shipping Eventos ──[Movimiento Finanzas relacionado]──(1:1)──> Shipping Finanzas Movimientos
  Shipping Eventos ──[Migración relacionada]──(1:1)──> Shipping Migraciones
  Catálogo Computadores ──[Conectividad sugerida V2]──(1:N)──> Catálogo Conectividad
  Catálogo Computadores ──[Puertos sugeridos V2]──(1:N)──> Catálogo Puertos
  Catálogo Computadores ──[Características extras sugeridas V2]──(1:N)──> Catálogo Características Extras
  Catálogo Conectividad ──[Shipping Items]──(1:N)──> Shipping Items
  Catálogo Conectividad ──[Catálogo Computadores]──(1:N)──> Catálogo Computadores
  Catálogo Puertos ──[Shipping Items]──(1:N)──> Shipping Items
  Catálogo Puertos ──[Catálogo Computadores]──(1:N)──> Catálogo Computadores
  Catálogo Características Extras ──[Shipping Items]──(1:N)──> Shipping Items
  Catálogo Características Extras ──[Catálogo Computadores]──(1:N)──> Catálogo Computadores
  Shipping Destinatarios ──[Packing vinculado]──(1:N)──> Shipping Packings
  Shipping Destinatarios ──[Item vinculado]──(1:N)──> Shipping Items
```

---

## Detalle por tabla

### Item

- **ID**: `tblApFDGCfGqHEhiF`
- **Registros**: 162
- **Campo primario**: Código
- **Total campos**: 93

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Código | `formula` | Fórmula `{fld6eXVFdOFzWYKDS} & "-" & {fldXJPJlOjq8O0Qho}` |
| 2 | Item | `singleLineText` | Texto corto |
| 3 | Clave Grupo | `formula` | Fórmula `IF(
  AND({fldVr6DogjFFnjgZH}="Roberto",{fldMtfu4FUquV0Cma}…` |
| 4 | Costo Total Items | `multipleLookupValues` | multipleLookupValues |
| 5 | AI | `aiText` | Texto AI |
| 6 | Categoria | `singleSelect` | Select: Laptop, Desktop, Electronico, Repuesto |
| 7 | Item Para | `singleSelect` | Select: Stock, Pedido, Repuesto, Uso Local, Cotización |
| 8 | Identificador | `singleLineText` | Texto corto |
| 9 | Costo Proveedor | `currency` | Moneda ($, precision=0) |
| 10 | Precio Sugerido (USD) | `formula` | Fórmula `({fld89Aitq3twClABD} * {fldedEZz6Qi7awwyG}) + {fld89Aitq3twC…` |
| 11 | Flete EC (Item Solo) | `currency` | Moneda ($, precision=2) |
| 12 | Arancel (Item Solo) | `currency` | Moneda ($, precision=2) |
| 13 | Ganancia (item solo?) | `formula` | Fórmula `{fldBGyxRBNAoOd60U}-({fld89Aitq3twClABD} + {fldn5ykTjw7lN6Az…` |
| 14 | Precio Venta | `currency` | Moneda ($, precision=0) |
| 15 | Plazo | `singleSelect` | Select: 3, 7, 14, 21, 30, 60 +1 |
| 16 | Fotos | `multipleAttachments` | Adjuntos |
| 17 | Markup (%) | `percent` | Porcentaje |
| 18 | Consulta Web Precios | `aiText` | Texto AI |
| 19 | Fecha Ofertado | `createdTime` | Fecha creación |
| 20 | Fecha de Pago Máxima | `formula` | Fórmula `IF(
  AND({fldTu6iNy5wRTZmay}, {fld8vLVqKyyM8MsWM}),
    DAT…` |
| 21 | Consecutivo | `multipleLookupValues` | multipleLookupValues |
| 22 | Proveedor | `multipleRecordLinks` | Vínculo → **Proveedores**  _(1:1)_ |
| 23 | Peso (Kilos) | `number` | Número (precision=1) |
| 24 | Nombre Proveedor | `multipleLookupValues` | multipleLookupValues |
| 25 | Pago | `multipleRecordLinks` | Vínculo → **Pago** |
| 26 | Viaje | `multipleRecordLinks` | Vínculo → **Viaje**  _(1:1)_ |
| 27 | Packing | `multipleRecordLinks` | Vínculo → **Packing**  _(1:1)_ |
| 28 | Clientes | `singleLineText` | Texto corto |
| 29 | Estado Pago | `rollup` | Rollup |
| 30 | Garantías | `multipleRecordLinks` | Vínculo → **Garantías** |
| 31 | Recibido | `checkbox` | Checkbox |
| 32 | Fecha y Hora de Recepción | `formula` | Fórmula `IF({fld3Ugd1wgjnD2RMp}, NOW(), BLANK())` |
| 33 | Probado SG | `checkbox` | Checkbox |
| 34 | Probar Hasta | `formula` | Fórmula `IF(
  {fldj546mJO3kTfbHM} = BLANK(),
  "NO RECIBIDO",
  D…` |
| 35 | Plazo De Garantía | `singleSelect` | Select: 30 días, Sin Garantía |
| 36 | Garantía Expira | `formula` | Fórmula `IF(
  AND({fldj546mJO3kTfbHM}, {fld5UXw48cw173TSA} = "30 dí…` |
| 37 | Estado Garantía | `formula` | Fórmula `IF(
  {fld3Ugd1wgjnD2RMp},
  IF(
    AND(
      {fldYfxe…` |
| 38 | Qty | `number` | Número (precision=0) |
| 39 | Nota Interna | `richText` | Texto enriquecido |
| 40 | USA Tracking | `singleLineText` | Texto corto |
| 41 | EC Tracking | `singleLineText` | Texto corto |
| 42 | Carrier | `singleSelect` | Select: UPS, USPS, FeDex, Gofo, Laarcourier, Laarbox +4 |
| 43 | Recibido en LV | `checkbox` | Checkbox |
| 44 | Estado Empaque | `formula` | Fórmula `IF(
  {fldFqjSBbD6FcjkmU},
  "EMPACADO",
  IF(
    OR(
     …` |
| 45 | D. Recivido en LV | `formula` | Fórmula `IF({fldr9PUPxET5zNMpj}, NOW(), BLANK())` |
| 46 | Regalo | `checkbox` | Checkbox |
| 47 | Encargo | `checkbox` | Checkbox |
| 48 | Nota Pública | `richText` | Texto enriquecido |
| 49 | From | `formula` | Fórmula `IF(AND({fldfGdg2DhAqLC1C5}, {fldPkW0xHQqo0VeaJ}), "⚠️", IF({…` |
| 50 | Destinatario | `multipleRecordLinks` | Vínculo → **Destinatarios**  _(1:1)_ |
| 51 | Qty Items Prov | `multipleLookupValues` | multipleLookupValues |
| 52 | Porcentaje | `formula` | Fórmula ` {fld89Aitq3twClABD} / {fldgvQ7ViGm8uf79c}` |
| 53 | Flete EC Packing Total | `multipleLookupValues` | multipleLookupValues |
| 54 | Arancel Packing Total | `multipleLookupValues` | multipleLookupValues |
| 55 | Flete EC Item Packing | `formula` | Fórmula `{flduJXynZ84aYa3KK} * {fldSGWOp8Qe3QLCSf}` |
| 56 | Arancel Item Packing | `formula` | Fórmula `{fldyO3TYMdlbFR55W} * {flduJXynZ84aYa3KK}` |
| 57 | Anticipo No. | `multilineText` | Texto largo |
| 58 | Anticipo | `multipleAttachments` | Adjuntos |
| 59 | AI assist | `aiText` | Texto AI |
| 60 | Estados Pedido | `singleSelect` | Select: Compartimos Cotización pedimos confirmación al cliente, el item le tomará 2 a 3 semanas para llegar., Confirmado con nuestro proveedor, En tránsito a nuestra tienda, Presenta demoras en aduana, Próximo a llegar, Recibido en la tienda, pasar a recogerlo |
| 61 | Costo Unidad | `formula` | Fórmula `{fld89Aitq3twClABD} + {fldhN3aVxAGh9XtgA} + {fldFeJtqJGNU9Uq…` |
| 62 | Ganancia Neta | `formula` | Fórmula `{fldBGyxRBNAoOd60U} - {fld4OxFCBD9dhJqJR}` |
| 63 | Facebook | `checkbox` | Checkbox |
| 64 | Marca | `formula` | Fórmula `IF(
  {fld8P4MSMSiaZYXsd},
  MID(
    LEFT({fld8P4MSMSiaZYXs…` |
| 65 | Serie y Modelo | `formula` | Fórmula `IF(
  {fld8P4MSMSiaZYXsd},
  TRIM(
    REGEX_REPLACE(
      …` |
| 66 | S.O. | `formula` | Fórmula `IF(
  {fld8P4MSMSiaZYXsd},
  TRIM(
    REGEX_REPLACE(
      …` |
| 67 | Txt_Facebook | `formula` | Fórmula `"🔥 DISPONIBLE PARA RESERVA 🔥" & "\n\n" &
"💻 " & {fldG4uyngF…` |
| 68 | Evidencias | `multipleAttachments` | Adjuntos |
| 69 | Fotos Ec | `checkbox` | Checkbox |
| 70 | Mi Negocio | `checkbox` | Checkbox |
| 71 | Marketplace | `checkbox` | Checkbox |
| 72 | Shopify | `checkbox` | Checkbox |
| 73 | Mercado Libre | `checkbox` | Checkbox |
| 74 | Ganancia | `formula` | Fórmula `{fldBGyxRBNAoOd60U} - {fld4OxFCBD9dhJqJR}` |
| 75 | AI Mensaje Pedido | `aiText` | Texto AI |
| 76 | Recargos Pago Exterior (from Packing) | `multipleLookupValues` | multipleLookupValues |
| 77 | Recargo Pago Exterior % | `formula` | Fórmula `{fld8RoDDb6PuEE3NZ} * {flduJXynZ84aYa3KK}` |
| 78 | Opciones de Cotización | `multipleRecordLinks` | Vínculo → **Opciones de Cotización** |
| 79 | Cotización ID | `singleLineText` | Texto corto |
| 80 | Cotización Código | `singleLineText` | Texto corto |
| 81 | Opción Cotización ID | `singleLineText` | Texto corto |
| 82 | Cliente Record ID Reparaciones | `singleLineText` | Texto corto |
| 83 | Cliente Nombre Snapshot | `singleLineText` | Texto corto |
| 84 | Cliente Teléfono Snapshot | `phoneNumber` | Teléfono |
| 85 | Requiere Instalación | `checkbox` | Checkbox |
| 86 | Orden Reparación ID | `singleLineText` | Texto corto |
| 87 | Orden Reparación Código | `singleLineText` | Texto corto |
| 88 | Estado Instalación | `singleSelect` | Select: No requiere, Pendiente de crear orden, Orden creada, Esperando repuesto, Instalación en proceso, Instalación finalizada |
| 89 | SKU Proveedor | `singleLineText` | Texto corto |
| 90 | Cotizaciones | `multipleRecordLinks` | Vínculo → **Cotizaciones** |
| 91 | Pedido Consecutivo | `number` | Número (precision=0) |
| 92 | Pedido Año | `number` | Número (precision=0) |
| 93 | Código Pedido | `formula` | Fórmula `IF(
  AND({fldB2IR985Hqi1kj5}, {fldlxoKDk5w1pbvBE}),
  "PED-…` |

**Campos no migrables:**

- `Código` (formula): fórmula — revisar referencias a campos locales
- `Clave Grupo` (formula): fórmula — revisar referencias a campos locales
- `Precio Sugerido (USD)` (formula): fórmula — revisar referencias a campos locales
- `Ganancia (item solo?)` (formula): fórmula — revisar referencias a campos locales
- `Fecha Ofertado` (createdTime): timestamp de creación — se pierde al migrar
- `Fecha de Pago Máxima` (formula): fórmula — revisar referencias a campos locales
- `Estado Pago` (rollup): rollup — depende de links locales
- `Fecha y Hora de Recepción` (formula): fórmula — revisar referencias a campos locales
- `Probar Hasta` (formula): fórmula — revisar referencias a campos locales
- `Garantía Expira` (formula): fórmula — revisar referencias a campos locales
- `Estado Garantía` (formula): fórmula — revisar referencias a campos locales
- `Estado Empaque` (formula): fórmula — revisar referencias a campos locales
- `D. Recivido en LV` (formula): fórmula — revisar referencias a campos locales
- `From` (formula): fórmula — revisar referencias a campos locales
- `Porcentaje` (formula): fórmula — revisar referencias a campos locales
- `Flete EC Item Packing` (formula): fórmula — revisar referencias a campos locales
- `Arancel Item Packing` (formula): fórmula — revisar referencias a campos locales
- `Costo Unidad` (formula): fórmula — revisar referencias a campos locales
- `Ganancia Neta` (formula): fórmula — revisar referencias a campos locales
- `Marca` (formula): fórmula — revisar referencias a campos locales
- `Serie y Modelo` (formula): fórmula — revisar referencias a campos locales
- `S.O.` (formula): fórmula — revisar referencias a campos locales
- `Txt_Facebook` (formula): fórmula — revisar referencias a campos locales
- `Ganancia` (formula): fórmula — revisar referencias a campos locales
- `Recargo Pago Exterior %` (formula): fórmula — revisar referencias a campos locales
- `Código Pedido` (formula): fórmula — revisar referencias a campos locales

**Registros de muestra (PII enmascarado):**

```
id: rec06uoYu59TyremG
  Fotos: [5 adjunto(s)]
  Shopify: True
  Recibido: True
  Costo Unidad: 264.41246144355335
  Categoria: Laptop
  Probar Hasta: 1 July de 2026 20:00
  Costo Proveedor: 200
  AI: {'state': 'empty', 'value': None, 'isStale': True}
  Recargos Pago Exterior (from Packing): [85.913]
  Peso (Kilos): 2
```

```
id: rec09Hk1tq8iIwWY1
  Fotos: [4 adjunto(s)]
  Shopify: True
  Recibido: True
  Costo Unidad: 132.07500000000002
  Facebook: True
  Categoria: Laptop
  Probar Hasta: 1 July de 2026 20:00
  Evidencias: [1 adjunto(s)]
  Costo Proveedor: 90
  AI: {'state': 'empty', 'value': None, 'isStale': True}
```

```
id: rec0Iit75cScX7CKD
  Fotos: [6 adjunto(s)]
  Shopify: True
  Recibido: True
  Costo Unidad: 264.6033260255772
  Facebook: True
  Categoria: Laptop
  Probar Hasta: 1 July de 2026 20:00
  Costo Proveedor: 202
  AI: {'state': 'empty', 'value': None, 'isStale': True}
  Recargos Pago Exterior (from Packing): [95.73389999999999]
```

---

### Packing

- **ID**: `tbl7VuutaZVLqMvxa`
- **Registros**: 11
- **Campo primario**: Pack
- **Total campos**: 39

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Pack | `formula` | Fórmula `"Packing--#" & {fldlqbKV4wWYFinJ1} & " " & {flddgDu4zsmnBoaE…` |
| 2 | Tipo | `singleSelect` | Select: Caja, Pallet |
| 3 | Numerador | `autoNumber` | AutoNumber |
| 4 | Items | `multipleRecordLinks` | Vínculo → **Item** |
| 5 | Costo Total Items | `rollup` | Rollup |
| 6 | Total Cost Texto | `formula` | Fórmula `{fld1VJOKDI8aR5yQ0}` |
| 7 | Costo Items Encargos | `rollup` | Rollup |
| 8 | Total Items | `formula` | Fórmula `{fld1VJOKDI8aR5yQ0} + {fld7lDV3YdPdnwFK9}` |
| 9 | Peso (Kilos) | `rollup` | Rollup |
| 10 | Kilos Bascula | `number` | Número (precision=1) |
| 11 | Estado | `singleSelect` | Select: En Proceso, Enviado, Recibido, Cerrado, Recibido, Cancelado |
| 12 | Báscula | `multipleAttachments` | Adjuntos |
| 13 | USA Tracking | `singleLineText` | Texto corto |
| 14 | EC Tracking | `singleLineText` | Texto corto |
| 15 | UPS | `button` | Botón |
| 16 | Int’l Ship | `button` | Botón |
| 17 | Fecha Envío | `formula` | Fórmula `IF(
  AND(
    {fldyXpHqdaCW45Tva} = "Enviado",
    {fldz…` |
| 18 | Arribo Estimado | `formula` | Fórmula `IF(
  {flduwgnUuVQbIk9XJ} = BLANK(),
  "SIN FECHA DE ENVÍO…` |
| 19 | Qty Items | `rollup` | Rollup |
| 20 | Qty Items Prov | `rollup` | Rollup |
| 21 | Tracking EC | `singleLineText` | Texto corto |
| 22 | Proveedor | `multipleLookupValues` | multipleLookupValues |
| 23 | Destinatario | `multipleRecordLinks` | Vínculo → **Destinatarios**  _(1:1)_ |
| 24 | Destinatario Texto | `multipleLookupValues` | multipleLookupValues |
| 25 | Factura | `button` | Botón |
| 26 | imprimir | `button` | Botón |
| 27 | Flete EC | `currency` | Moneda ($, precision=2) |
| 28 | Arancel | `currency` | Moneda ($, precision=2) |
| 29 | Recargos Pago Exterior | `formula` | Fórmula `{fld1VJOKDI8aR5yQ0} * 0.053` |
| 30 | Generar PDF | `checkbox` | Checkbox |
| 31 | Invoice PDF | `multipleAttachments` | Adjuntos |
| 32 | Invoice Status | `singleSelect` | Select: Pendiente, Generando, Listo, Error |
| 33 | Botón Invoice PDF | `button` | Botón |
| 34 | Fecha Recibido SG | `formula` | Fórmula `IF(
  AND(
    {fldyXpHqdaCW45Tva} = "Recibido",
    {fld…` |
| 35 | Qty Regalos | `rollup` | Rollup |
| 36 | Qty Encargos | `rollup` | Rollup |
| 37 | Ofertas LV | `rollup` | Rollup |
| 38 | Docs | `multipleAttachments` | Adjuntos |
| 39 | Shipping Items | `multipleRecordLinks` | Vínculo → **Shipping Items** |

**Campos no migrables:**

- `Pack` (formula): fórmula — revisar referencias a campos locales
- `Numerador` (autoNumber): autoNumber se reinicia al migrar (copiar a campo texto antes)
- `Costo Total Items` (rollup): rollup — depende de links locales
- `Total Cost Texto` (formula): fórmula — revisar referencias a campos locales
- `Costo Items Encargos` (rollup): rollup — depende de links locales
- `Total Items` (formula): fórmula — revisar referencias a campos locales
- `Peso (Kilos)` (rollup): rollup — depende de links locales
- `UPS` (button): botón — configuración manual
- `Int’l Ship` (button): botón — configuración manual
- `Fecha Envío` (formula): fórmula — revisar referencias a campos locales
- `Arribo Estimado` (formula): fórmula — revisar referencias a campos locales
- `Qty Items` (rollup): rollup — depende de links locales
- `Qty Items Prov` (rollup): rollup — depende de links locales
- `Factura` (button): botón — configuración manual
- `imprimir` (button): botón — configuración manual
- `Recargos Pago Exterior` (formula): fórmula — revisar referencias a campos locales
- `Botón Invoice PDF` (button): botón — configuración manual
- `Fecha Recibido SG` (formula): fórmula — revisar referencias a campos locales
- `Qty Regalos` (rollup): rollup — depende de links locales
- `Qty Encargos` (rollup): rollup — depende de links locales
- `Ofertas LV` (rollup): rollup — depende de links locales

**Registros de muestra (PII enmascarado):**

```
id: rec74xXFTVU4yxwiU
  Costo Total Items: 1661
  Botón Invoice PDF: {'label': 'Generar Invoice PDF', 'url': 'https://airtable.com/tbl7VuutaZVLqMvxa/rec74xXFTVU4yxwiU?blocks=bliD157aT49hAACm2'}
  Total Cost Texto: 1661
  Costo Items Encargos: 0
  Arancel: 267.56
  Qty Regalos: 0
  imprimir: {'label': 'Button', 'url': 'https://airtable.com/tbl7VuutaZVLqMvxa/rec74xXFTVU4yxwiU?blocks=blidSMqzMT8EriwOB'}
  Proveedor: ['rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ']
  Recargos Pago Exterior: 88.033
  Factura: {'label': 'Factura', 'url': 'https://airtable.com/tbl7VuutaZVLqMvxa/rec74xXFTVU4yxwiU?blocks=bliQnfDl3bdlPpNrf'}
```

```
id: rec7HM96GS3ss2Ug3
  Costo Total Items: 50
  Botón Invoice PDF: {'label': 'Generar Invoice PDF', 'url': 'https://airtable.com/tbl7VuutaZVLqMvxa/rec7HM96GS3ss2Ug3?blocks=bliD157aT49hAACm2'}
  Total Cost Texto: 50
  Costo Items Encargos: 50
  Arancel: 35
  Qty Regalos: 0
  imprimir: {'label': 'Button', 'url': 'https://airtable.com/tbl7VuutaZVLqMvxa/rec7HM96GS3ss2Ug3?blocks=blidSMqzMT8EriwOB'}
  Proveedor: ['rec8RnvQ7KcpAUzHk']
  Recargos Pago Exterior: 2.65
  Factura: {'label': 'Factura', 'url': 'https://airtable.com/tbl7VuutaZVLqMvxa/rec7HM96GS3ss2Ug3?blocks=bliQnfDl3bdlPpNrf'}
```

```
id: rec9Set9jnV3tKJvK
  Costo Total Items: 1806.3
  Botón Invoice PDF: {'label': 'Generar Invoice PDF', 'url': 'https://airtable.com/tbl7VuutaZVLqMvxa/rec9Set9jnV3tKJvK?blocks=bliD157aT49hAACm2'}
  Total Cost Texto: 1806.3
  Costo Items Encargos: 0
  Arancel: 290.06
  Qty Regalos: 0
  imprimir: {'label': 'Button', 'url': 'https://airtable.com/tbl7VuutaZVLqMvxa/rec9Set9jnV3tKJvK?blocks=blidSMqzMT8EriwOB'}
  Proveedor: ['rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ', 'rec0EOISxjI08QWkQ']
  Recargos Pago Exterior: 95.73389999999999
  Factura: {'label': 'Factura', 'url': 'https://airtable.com/tbl7VuutaZVLqMvxa/rec9Set9jnV3tKJvK?blocks=bliQnfDl3bdlPpNrf'}
```

---

### Pago

- **ID**: `tblU6Nz8eAaAlq5Ll`
- **Registros**: 12
- **Campo primario**: Pago ID
- **Total campos**: 21

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Pago ID | `singleLineText` | Texto corto |
| 2 | Consecutivo | `autoNumber` | AutoNumber |
| 3 | Items | `multipleRecordLinks` | Vínculo → **Item** |
| 4 | Total Pago | `rollup` | Rollup |
| 5 | Fecha de Pago Máx | `multipleLookupValues` | multipleLookupValues |
| 6 | Transacción ID | `singleLineText` | Texto corto |
| 7 | Proveedor (from Items) | `multipleLookupValues` | multipleLookupValues |
| 8 | Proveedor Único | `rollup` | Rollup |
| 9 | Pago Realizado | `dateTime` | Fecha/hora (friendly) |
| 10 | Estado de Pago | `formula` | Fórmula `IF(
  AND({fldyqD8jzWnHjuHn9}, {fldk2EM6pcnhiCs5x}),
    "…` |
| 11 | Fecha Ofertado (from Items) | `multipleLookupValues` | multipleLookupValues |
| 12 | Recargos Pago Exterior | `formula` | Fórmula `{fld2pPSc7InRQW4qG} * 0.053` |
| 13 | Fecha de Pago Real | `dateTime` | Fecha/hora (local) |
| 14 | Método de Pago | `singleSelect` | Select: PayPal, Tarjeta, Transferencia bancaria, Efectivo, Depósito, Otro |
| 15 | Cuenta Origen | `singleSelect` | Select: PayPal, Banco Pichincha, Caja, PayPhone, DataFast, Otro |
| 16 | Comprobante | `multipleAttachments` | Adjuntos |
| 17 | Observación | `multilineText` | Texto largo |
| 18 | Registrado por | `singleLineText` | Texto corto |
| 19 | Movimiento Finanzas ID | `singleLineText` | Texto corto |
| 20 | Estado Integración Finanzas | `singleSelect` | Select: Pendiente, Sincronizado, Error, No aplica |
| 21 | Shipping Items | `multipleRecordLinks` | Vínculo → **Shipping Items** |

**Campos no migrables:**

- `Consecutivo` (autoNumber): autoNumber se reinicia al migrar (copiar a campo texto antes)
- `Total Pago` (rollup): rollup — depende de links locales
- `Proveedor Único` (rollup): rollup — depende de links locales
- `Estado de Pago` (formula): fórmula — revisar referencias a campos locales
- `Recargos Pago Exterior` (formula): fórmula — revisar referencias a campos locales

**Registros de muestra (PII enmascarado):**

```
id: rec8kWboLzHzJD6Se
  Total Pago: 190
  Fecha Ofertado (from Items): [lista 3 vínculos]
  Proveedor Único: Roberto
  Fecha de Pago Máx: [lista 1 vínculos]
  Proveedor (from Items): ['recgeOwikiiSkNQNt', 'recgeOwikiiSkNQNt', 'recgeOwikiiSkNQNt']
  Items: ['recnbGs4US3awVhf5', 'recvuwByiVtuiy2bc', 'rec0fxKAg9SvHlPw5']
  Consecutivo: 22
  Estado de Pago: PAGADO
  Recargos Pago Exterior: 10.07
  Pago Realizado: 2026-04-15T01:58:00.000Z
```

```
id: recENXZwmYaKJJ35z
  Total Pago: 426
  Fecha Ofertado (from Items): [lista 9 vínculos]
  Proveedor Único: Roberto
  Fecha de Pago Máx: [lista 1 vínculos]
  Proveedor (from Items): ['recgeOwikiiSkNQNt', 'recgeOwikiiSkNQNt', 'recgeOwikiiSkNQNt', 'recgeOwikiiSkNQNt', 'recgeOwikiiSkNQNt', 'recgeOwikiiSkNQNt', 'recgeOwikiiSkNQNt', 'recgeOwikiiSkNQNt', 'recgeOwikiiSkNQNt']
  Items: ['rec6RIJFfvuv1qbpZ', 'recPfulpoWD7rKj5M', 'recZVQwsjhOh7M3AT', 'recarqhg2NhaWhX4Z', 'recrt8eY2GoK5IN2M', 'reced7d3AM1JJ6N58', 'recMIIrGZyKuTDSqG', 'reclQiBPX9qXwHOFK', 'recPOB7AuvNn5ay11']
  Consecutivo: 20
  Estado de Pago: PAGADO
  Recargos Pago Exterior: 22.578
  Pago Realizado: 2026-03-24T03:58:00.000Z
```

```
id: recEr1lYdmhxb0dr3
  Total Pago: 50
  Fecha de Pago Real: 2026-05-16T00:00:00.000Z
  Fecha Ofertado (from Items): [lista 1 vínculos]
  Proveedor Único: eBay
  Registrado por: Alexis Bolaños <acatso@icloud.com>
  Método de Pago: PayPal
  Proveedor (from Items): ['rec8RnvQ7KcpAUzHk']
  Items: ['recCGZ9vwNPdSfWcz']
  Consecutivo: 25
  Estado de Pago: PAGADO
```

---

### Proveedores

- **ID**: `tblLFOlY2US1Diu1c`
- **Registros**: 7
- **Campo primario**: Nombre
- **Total campos**: 7

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Nombre | `singleLineText` | Texto corto |
| 2 | Teléfono | `multilineText` | Texto largo |
| 3 | Dirección | `singleSelect` | Select: USA, ECU, CHN |
| 4 | Item | `multipleRecordLinks` | Vínculo → **Item** |
| 5 | Compras Totales | `rollup` | Rollup |
| 6 | Garantías | `singleLineText` | Texto corto |
| 7 | Opciones de Cotización | `multipleRecordLinks` | Vínculo → **Opciones de Cotización** |

**Campos no migrables:**

- `Compras Totales` (rollup): rollup — depende de links locales

**Registros de muestra (PII enmascarado):**

```
id: rec0EOISxjI08QWkQ
  Nombre: Ch***s
  Compras Totales: 7456.3
  Opciones de Cotización: ['rec2vSiLQyhtkVPgN', 'recX2wvKa6OefepDB', 'rec8Dw7Mobk37Ia9g', 'recwEZ4dA5st8AhaQ', 'rectGOuUrD1dF6rzX', 'reckuc7Fc3nOpo3d1', 'recPonFAhhv6vb4Uf', 'rec88yu4f6YqMdadp']
  Item: ['recAzvcycZvvxUz6Z', 'recfBu4YEcDIVmzVt', 'rec1IwXOax9srGQpL', 'recfhpM9TNkK9zIF7', 'recfxWFyNxZxs95hX', 'recuO46tvgu7WVcOX', 'recHDB0g7NZESHHML', 'receTdmkD0E9eed2O', 'recxvy2EAFtoRDVNn', 'rec8YOMJ6UEPL9Gnc', 'reccCgOe8hfPbaQ54', 'recmbDRLvpFFb9Fjy', 'reck6CB6I2foAUdMf', 'recJ8ufk7sDEtzPTb', 'recbMQQHLzC4VpgrE', 'reck7KCvd5IqC8o7h', 'rec0Iit75cScX7CKD', 'recOKRo45QgNAcmyj', 'recgtPpvZaNuiKjrh', 'recOqtgHzTDIhHPgl', 'recw0EUttZ8hAlHkL', 'recPWbcppFQZUEVsZ', 'recpLVPpOZOAheqwi', 'recjkzjudhcEXUldn', 'recB5Ztsp3fKYTIkh', 'recPXqJQ7fEGOagDK', 'recS5Wpz6RbxgAbE7', 'recOVLbJEkWmcFuOw', 'recDB1bIYGIOdFx9x', 'reca6QRmH0b1dfXGs', 'recpYTll1L1b6Frqm', 'recflJgbk1ZphXkRr', 'rec09Hk1tq8iIwWY1', 'recLgGEOaFotqx5dH', 'recxIYB8MqKfWZ56D', 'recWFDVM64XfJetHv', 'recADekr4Da6aEnau', 'recwTbDxXiow9kreE', 'recsGGeW3vhGwD8YV', 'recvP5GhSfIjKKP9T', 'recTKgq1uTyXBArK1', 'recCcvQkcJhp0uBr7', 'recY2aRESxdXVNLp2', 'recoaonB3cClGf1Qr', 'recR6aksNkV7x2iub', 'rec06uoYu59TyremG', 'recUFwdkmTY5JMs0D', 'rec3OaK7Fo6kP24TD', 'recxpK3fBUv8uOMfS', 'recz57QkklSRebGtw', 'recFxIWSAwbN70fXp', 'rec8Y5eksaPPkEBQa', 'recHq1CPbDrRw9TmL']
  Dirección: ***
```

```
id: rec8RnvQ7KcpAUzHk
  Nombre: ***
  Compras Totales: 3883.95
  Opciones de Cotización: ['recAfYiGHDeuooG3e', 'recdlgov5Hon8R1Fx', 'recAt4vUScVuD74nc', 'rec3Rb7haVXvWSrv9', 'recJP4L1JixFL0qIO']
  Item: ['recFWX3zuHMoUb1dV', 'recEssSi1y2XafKUc', 'rec4t0DA55Ry4H7tb', 'recN98mOAY4IWcCqc', 'recVut82OPpCmlQQH', 'recco40uldpuyZ4Op', 'recfd6co4oAJdTmVE', 'rec1DqazONzTW9y9q', 'recZSZs1D7mifcLyv', 'recXx5XkrIxEWlsiG', 'recWwzJXAJFvLgF68', 'recCGZ9vwNPdSfWcz', 'recw5dtMLQQj9F6xy', 'recm4WLWRFdrSJlkl']
  Dirección: ***
```

```
id: recMKJBDVJFxJnz1R
  Nombre: ***
  Compras Totales: 0
  Opciones de Cotización: ['rec3GXppBHLN9m00B', 'rec0AZts4012qOffe', 'recxLMHi5zEYBTZiW', 'recAfunsnyyhqxT6d', 'recvA8RE0Y1MemHGa', 'recCsLtTbi81TVKRz']
  Item: ['recflqovDvErnBlCr']
  Dirección: ***
```

---

### Viaje

- **ID**: `tblJquMispPOjp0AY`
- **Registros**: 1
- **Campo primario**: Cod Viaje
- **Total campos**: 6

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Cod Viaje | `singleLineText` | Texto corto |
| 2 | Fecha Viaje | `date` | Fecha (local) |
| 3 | Items | `multipleRecordLinks` | Vínculo → **Item** |
| 4 | Estado | `singleSelect` | Select: Pendiente, En Proceso, Completado |
| 5 | Capital Invertido | `rollup` | Rollup |
| 6 | Costo Proveedores | `multipleLookupValues` | multipleLookupValues |

**Campos no migrables:**

- `Capital Invertido` (rollup): rollup — depende de links locales

**Registros de muestra (PII enmascarado):**

```
id: recDswjnpkP6qy3wv
  Costo Proveedores: [1050, 390, 392.85, 999.99, 280]
  Items: ['recFWX3zuHMoUb1dV', 'rec4t0DA55Ry4H7tb', 'recN98mOAY4IWcCqc', 'recEssSi1y2XafKUc', 'recVut82OPpCmlQQH']
  Capital Invertido: 3112.84
  Cod Viaje: VIAJE1
  Estado: En Proceso
  Fecha Viaje: 2026-02-25
```

---

### Garantías

- **ID**: `tbl5qzynU7ORgwhkF`
- **Registros**: 1
- **Campo primario**: Garantía ID
- **Total campos**: 13

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Garantía ID | `formula` | Fórmula `"CASO-N" & {fld2icBsWeGPqSVww}` |
| 2 | Contador Casos | `autoNumber` | AutoNumber |
| 3 | Artículo | `multipleRecordLinks` | Vínculo → **Item**  _(1:1)_ |
| 4 | Proveedor | `multipleLookupValues` | multipleLookupValues |
| 5 | Fecha de inicio | `multipleLookupValues` | multipleLookupValues |
| 6 | Fecha de fin | `multipleLookupValues` | multipleLookupValues |
| 7 | Condiciones de garantía | `singleSelect` | Select: En Validación, Aprobada, Rechazada, Cerrada |
| 8 | Estado de la garantía | `multipleLookupValues` | multipleLookupValues |
| 9 | Resolución Proveedor | `multilineText` | Texto largo |
| 10 | Pruebas (fotos/videos) | `multipleAttachments` | Adjuntos |
| 11 | Problema Reportado | `singleLineText` | Texto corto |
| 12 | Notas internas | `multilineText` | Texto largo |
| 13 | Fecha Reporte | `createdTime` | Fecha creación |

**Campos no migrables:**

- `Garantía ID` (formula): fórmula — revisar referencias a campos locales
- `Contador Casos` (autoNumber): autoNumber se reinicia al migrar (copiar a campo texto antes)
- `Fecha Reporte` (createdTime): timestamp de creación — se pierde al migrar

**Registros de muestra (PII enmascarado):**

```
id: recpAzE6aGxqj0TJV
  Contador Casos: 6
  Garantía ID: CASO-N6
  Fecha Reporte: 2026-03-11T22:41:21.000Z
```

---

### Destinatarios

- **ID**: `tblOsaV24BY9GY4s8`
- **Registros**: 1
- **Campo primario**: Nombre
- **Total campos**: 3

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Nombre | `multilineText` | Texto largo |
| 2 | Packing | `multipleRecordLinks` | Vínculo → **Packing** |
| 3 | Item | `multipleRecordLinks` | Vínculo → **Item** |

**Registros de muestra (PII enmascarado):**

```
id: recQVf6viAtpLR1Rj
  Packing: ['recjP7AAfStFsZ5zd']
  Nombre: Al***9
```

---

### Usuarios

- **ID**: `tblt25Y39xRG39KZA`
- **Registros**: 5
- **Campo primario**: Nombre
- **Total campos**: 20

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Nombre | `singleLineText` | Texto corto |
| 2 | Rol | `singleSelect` | Select: Administrador, Técnico, Anunciante, Finanzas, Staff |
| 3 | Email | `email` | Email |
| 4 | Cédula | `number` | Número (precision=0) |
| 5 | Telefono | `phoneNumber` | Teléfono |
| 6 | Password Hash | `multilineText` | Texto largo |
| 7 | Activo | `checkbox` | Checkbox |
| 8 | Requiere 2FA | `checkbox` | Checkbox |
| 9 | Apps Permitidas | `multipleSelects` | Multi-select: Técnicos, Finanzas, Horarios, Facturación, Shipping, Cotizaciones +2 |
| 10 | Último Login | `dateTime` | Fecha/hora (local) |
| 11 | Notas | `multilineText` | Texto largo |
| 12 | Registro Accesos | `multipleRecordLinks` | Vínculo → **Registro Accesos** |
| 13 | Codigos 2FA | `multipleRecordLinks` | Vínculo → **Codigos 2FA** |
| 14 | Horarios Registros | `multipleRecordLinks` | Vínculo → **Horarios Registros** |
| 15 | Horarios Marcaciones | `multipleRecordLinks` | Vínculo → **Horarios Marcaciones** |
| 16 | Horarios Pagos | `multipleRecordLinks` | Vínculo → **Horarios Pagos** |
| 17 | Horarios Periodos de Pago | `multipleRecordLinks` | Vínculo → **Horarios Periodos de Pago** |
| 18 | Horarios Ajustes | `multipleRecordLinks` | Vínculo → **Horarios Ajustes** |
| 19 | Notificaciones (Destinatario) | `multipleRecordLinks` | Vínculo → **Notificaciones** |
| 20 | Notificaciones (Creado por) | `multipleRecordLinks` | Vínculo → **Notificaciones** |

**Registros de muestra (PII enmascarado):**

```
id: recKwA0XTJzrPsMsh
  Rol: Administrador
  Activo: True
  Requiere 2FA: True
  Nombre: Ab***o
  Apps Permitidas: ['Técnicos', 'Pedidos', 'Horarios', 'Shipping', 'Cotizaciones', 'Finanzas', 'Facturación']
  Notificaciones (Destinatario): ['recfT3UBw94yVoOMC', 'recd2PWm1U0cq7XkD']
  Email: ab***m
  Password Hash: $2***6
```

```
id: recO2t2irrvQQGaFd
  Rol: Staff
  Activo: True
  Horarios Periodos de Pago: ['recZjpcCFkqJnI2ej', 'recCupqA5ylh3g6BP']
  Último Login: 2026-06-24T14:37:50.587Z
  Requiere 2FA: True
  Nombre: Jo***s
  Horarios Registros: ['recc96tUssgNJVikf', 'recsjuIAHLdrihsJJ', 'rece8Vh99PZpT2GCo', 'rec4HRCYouLWLqlcq', 'rec7aCigfss7kom1r', 'recIuRYv8ReHzdwu9', 'rec1mgoqUYGgeTb4F', 'rec3gSjnbSXgCGQNY', 'rec1m7Bzm44MfeMsc', 'recuZ90bcZTRPNy8T', 'recnVf4QwxTSpu3IJ', 'recQQoJU9fk8aeJl3', 'recvPsyNerMR7qLui', 'recVZS0DrDR5sTdOE', 'recXOR4Kt8VnwSC0B', 'recwo7qmvIEo9t3g7', 'recMQNXqmI5TEElK3', 'recVmGZl804KkyI5C', 'recPhsUnPzzu6srxu', 'recOI99esghZd5LGL', 'recZJ5ykKcyKhmsLC', 'reco3CdqoG0VQxKfQ', 'recyKvDNIQ1e2tUm2', 'recGlNCKQLDHyH2ZV', 'recGfi2gm6VZ7B2Wh', 'rec1iupccSwBByL0F', 'recLDpqX7EstO4bFw', 'recBTTkcnaxOjbpwF', 'reck9M8EKJLNHeUkR', 'recSt2KWhbIGYWMCe', 'recAsYgcEoSHM4PEO', 'recZSLZRvSonXm3Jb', 'recSCsdPKHSAZoQjj', 'recg16rb9NEyMIrGJ', 'recouMouBsNGR8Otq', 'recqskPwox2jniTBo', 'recuJVVeNbEqRIos5', 'recHx1qTyc7p2qzev', 'reczbbLFDudNKqS4y', 'rec7bpsB7CX9CMn8H', 'recStYWGEgTKoLdeF', 'recDYKZ8iMZDq2z7g']
  Apps Permitidas: ['Técnicos', 'Facturación', 'Shipping', 'Finanzas', 'Horarios', 'Cotizaciones', 'Pedidos']
  Registro Accesos: ['recyB8rcB6UlNpKAs', 'recP81WSbn1UVmiHs', 'recOjM0IR26OGVTVs', 'recUCJ9PyRKLazAvo', 'recflr1cIv6xIuaKx', 'recnYsgUV9oYurFuU', 'rech8RHt126MrwY9m', 'recr59WbaOd0zyzwx', 'recPNqZK3ugX0Ydwb', 'recQ8kpxfsvrOkWbd', 'recb467aayXf75of0', 'recgmTKoVSRF52d1E', 'rec8ZtIITMZHeoYWY']
  Notificaciones (Destinatario): ['recS9hQZ6REnGxhI1', 'recPEu5wihLO2qju5', 'rec4E6gO5FtOEsITr', 'recQpwO6faZaZTAQA', 'recMrFSJccaHkXmRW']
```

```
id: recWbW6AKxb22TSLI
  Rol: Administrador
  Activo: True
  Horarios Periodos de Pago: ['rec8iM0fHN0a26ICv']
  Último Login: 2026-06-24T18:37:35.675Z
  Requiere 2FA: True
  Nombre: Al***s
  Horarios Registros: ['receFCqLFqGhk6JZV', 'recbUCARCYjNkFNHW']
  Apps Permitidas: ['Finanzas', 'Shipping', 'Técnicos', 'Horarios', 'Facturación', 'Cotizaciones', 'Pedidos', 'Notificaciones']
  Notificaciones (Creado por): ['recv6xPLTcNt9qBe5', 'recu0V4sfYdNVWxze', 'recS9hQZ6REnGxhI1', 'recy55EM0onUq1ut1', 'recPEu5wihLO2qju5', 'reckRfrjvatsFD592', 'rec4E6gO5FtOEsITr', 'rec7aNtNjf0nivC4c', 'recQpwO6faZaZTAQA', 'recEy0MWMyD6mg7cp', 'recMrFSJccaHkXmRW', 'recfT3UBw94yVoOMC', 'recd2PWm1U0cq7XkD']
  Notas: Usuario administrador principal
```

---

### Registro Accesos

- **ID**: `tbl8hqiZLPohP08LH`
- **Registros**: 131
- **Campo primario**: Id
- **Total campos**: 9

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Id | `autoNumber` | AutoNumber |
| 2 | Usuario | `multipleRecordLinks` | Vínculo → **Usuarios**  _(1:1)_ |
| 3 | Email | `email` | Email |
| 4 | Acción | `singleSelect` | Select: Login, Logout, Acceso App, Acceso Bloqueado, Login fallido |
| 5 | App | `singleSelect` | Select: Dashboard, Técnicos, Finanzas, Horarios, Facturación, Shipping +2 |
| 6 | Resultado | `singleSelect` | Select: Permitido, Bloqueado, Error |
| 7 | IP | `singleLineText` | Texto corto |
| 8 | User Agent | `multilineText` | Texto largo |
| 9 | Fecha | `dateTime` | Fecha/hora (iso) |

**Campos no migrables:**

- `Id` (autoNumber): autoNumber se reinicia al migrar (copiar a campo texto antes)

**Registros de muestra (PII enmascarado):**

```
id: rec110kXCDNXRV4rh
  Email: ki***m
  Id: 29
  Acción: Login
  IP: ::1
  Fecha: 2026-05-05T16:35:48.367Z
  Resultado: Permitido
  Usuario: ['recZuapFdOtGo9bgR']
  App: Login
  User Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like …
```

```
id: rec1Nu2SVVhE7gEGM
  Email: ac***m
  Id: 49
  Acción: Logout
  IP: ::1
  Fecha: 2026-05-06T22:01:39.667Z
  Resultado: Permitido
  Usuario: ['recWbW6AKxb22TSLI']
  App: Sistema
  User Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, lik…
```

```
id: rec27EyE4iOcWpm9Q
  Email: ac***m
  Id: 64
  Acción: Logout
  IP: ::1
  Fecha: 2026-05-13T21:54:09.441Z
  Resultado: Permitido
  Usuario: ['recWbW6AKxb22TSLI']
  App: Sistema
  User Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like …
```

---

### Codigos 2FA

- **ID**: `tbluZiCu8XE9oNPua`
- **Registros**: 49
- **Campo primario**: Codigo Hash
- **Total campos**: 7

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Codigo Hash | `multilineText` | Texto largo |
| 2 | Usuario | `multipleRecordLinks` | Vínculo → **Usuarios**  _(1:1)_ |
| 3 | Email | `singleLineText` | Texto corto |
| 4 | Expira En | `dateTime` | Fecha/hora (us) |
| 5 | Usado | `checkbox` | Checkbox |
| 6 | Intentos | `number` | Número (precision=0) |
| 7 | Fecha Creacion | `dateTime` | Fecha/hora (us) |

**Registros de muestra (PII enmascarado):**

```
id: rec0ZhO7GddifMykq
  Expira En: 2026-06-24T01:50:55.807Z
  Fecha Creacion: 2026-06-24T01:40:55.807Z
  Usuario: ['recWbW6AKxb22TSLI']
  Intentos: 0
  Usado: True
  Codigo Hash: $2b$12$q.L19ILD68cwDoxhJ7eAxeMDdHwSPJveTna98vwX.879ixAdijvYe
  Email: ac***m
```

```
id: rec10DRyhT0ufsOIr
  Expira En: 2026-05-04T00:28:00.020Z
  Fecha Creacion: 2026-05-04T00:18:00.020Z
  Usuario: ['recWbW6AKxb22TSLI']
  Intentos: 0
  Codigo Hash: $2b$12$p5e4otiQTC4eI0oL4I5veukcWCL1EbK3iu5qp47l5dQ03L7ViEcd6
  Email: ac***m
```

```
id: rec1MN8maG3MCwVRA
  Expira En: 2026-06-24T16:29:45.628Z
  Fecha Creacion: 2026-06-24T16:19:45.628Z
  Usuario: ['recWbW6AKxb22TSLI']
  Intentos: 0
  Usado: True
  Codigo Hash: $2b$12$BYmgH11Emhxy54IjkS6hpOzIkI.BrS7g9izEBJ5rShqXH4D77dZO6
  Email: ac***m
```

---

### Horarios Registros

- **ID**: `tblQIGvYKCV8iwqPs`
- **Registros**: 88
- **Campo primario**: Registro
- **Total campos**: 25

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Registro | `formula` | Fórmula `{fldqzEuNuN92TKJzY} & " - " & {fldFMWXUcHNHPgsWr}` |
| 2 | Empleado | `multipleRecordLinks` | Vínculo → **Usuarios**  _(1:1)_ |
| 3 | Usuario ID | `singleLineText` | Texto corto |
| 4 | Correo | `email` | Email |
| 5 | Fecha | `date` | Fecha (local) |
| 6 | Estado del día | `singleSelect` | Select: Pendiente, Trabajando, En almuerzo, Finalizado, Incompleto, Revisado |
| 7 | Entrada | `dateTime` | Fecha/hora (local) |
| 8 | Salida Almuerzo | `dateTime` | Fecha/hora (local) |
| 9 | Regreso Almuerzo | `dateTime` | Fecha/hora (local) |
| 10 | Salida Final | `dateTime` | Fecha/hora (local) |
| 11 | Minutos Trabajados | `number` | Número (precision=0) |
| 12 | Horas Trabajadas | `number` | Número (precision=2) |
| 13 | Sueldo Base | `currency` | Moneda ($, precision=2) |
| 14 | Horas Base Mes | `number` | Número (precision=0) |
| 15 | Valor Hora | `currency` | Moneda ($, precision=2) |
| 16 | Total Estimado Día | `currency` | Moneda ($, precision=2) |
| 17 | Observaciones | `multilineText` | Texto largo |
| 18 | IP Entrada | `singleLineText` | Texto corto |
| 19 | IP Salida | `singleLineText` | Texto corto |
| 20 | User Agent | `multilineText` | Texto largo |
| 21 | Creado por | `singleLineText` | Texto corto |
| 22 | Última actualización | `lastModifiedTime` | Última modificación |
| 23 | Marcaciones | `multipleRecordLinks` | Vínculo → **Horarios Marcaciones** |
| 24 | Horarios Periodos de Pago | `multipleRecordLinks` | Vínculo → **Horarios Periodos de Pago** |
| 25 | Horarios Ajustes | `multipleRecordLinks` | Vínculo → **Horarios Ajustes** |

**Campos no migrables:**

- `Registro` (formula): fórmula — revisar referencias a campos locales
- `Última actualización` (lastModifiedTime): timestamp de modificación — se pierde al migrar

**Registros de muestra (PII enmascarado):**

```
id: rec1DrgtiqIxBapD0
  Marcaciones: ['recB26sCk5ZreInKX', 'recYwajN09aBUIJOV', 'recG8Gjbr3iVph0IA', 'recBuadhGSoBpztmM']
  Minutos Trabajados: 425
  Horas Trabajadas: 7.08
  Fecha: 2026-05-26
  Usuario ID: recZuapFdOtGo9bgR
  Registro: Enrique Martinez - 2026-05-26T00:00:00.000Z
  Entrada: 2026-05-26T14:32:20.530Z
  Salida Almuerzo: 2026-05-26T18:06:07.973Z
  Total Estimado Día: 21.33
  Regreso Almuerzo: 2026-05-26T19:38:03.366Z
```

```
id: rec1iupccSwBByL0F
  Marcaciones: ['recwOUn4UoJHgL8W6', 'rec3Uwrzreankucan', 'recTOZidevkeuGfFV', 'recVDTJXpLYpjbYce']
  Minutos Trabajados: 186
  Horas Trabajadas: 3.1
  Fecha: 2026-06-02
  Usuario ID: recO2t2irrvQQGaFd
  Registro: Joseph Bolaños - 2026-06-02T00:00:00.000Z
  Entrada: 2026-06-02T14:46:00.000Z
  Salida Almuerzo: 2026-06-02T17:18:00.000Z
  Total Estimado Día: 9.34
  Regreso Almuerzo: 2026-06-02T18:43:00.000Z
```

```
id: rec1m7Bzm44MfeMsc
  Marcaciones: ['recM1XY7ZJdBgsElu', 'recNtHXgNYY624Ii7', 'reczSZX7oteO0YlfM', 'recR0Y1W1bBTOY554']
  Minutos Trabajados: 416
  Horas Trabajadas: 6.93
  Fecha: 2026-05-13
  Usuario ID: recO2t2irrvQQGaFd
  Registro: Joseph Bolaños - 2026-05-13T00:00:00.000Z
  Entrada: 2026-05-13T14:34:43.079Z
  Salida Almuerzo: 2026-05-13T18:01:11.417Z
  Total Estimado Día: 20.88
  Regreso Almuerzo: 2026-05-13T19:29:50.735Z
```

---

### Horarios Marcaciones

- **ID**: `tblL4tsumv4ThvhOH`
- **Registros**: 350
- **Campo primario**: Marcación
- **Total campos**: 13

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Marcación | `formula` | Fórmula `{fldqvjFNVEJm98l2D} & " - " & DATETIME_FORMAT({fldTPAsv2znkD…` |
| 2 | Registro del Día | `multipleRecordLinks` | Vínculo → **Horarios Registros**  _(1:1)_ |
| 3 | Empleado | `multipleRecordLinks` | Vínculo → **Usuarios**  _(1:1)_ |
| 4 | Usuario ID | `singleLineText` | Texto corto |
| 5 | Correo | `email` | Email |
| 6 | Fecha y Hora | `dateTime` | Fecha/hora (local) |
| 7 | Tipo de Marcación | `singleSelect` | Select: entrada, salida_almuerzo, regreso_almuerzo, salida_final, ajuste_admin |
| 8 | Estado resultante | `singleSelect` | Select: Trabajando, En almuerzo, Finalizado, Incompleto, Revisado |
| 9 | IP | `singleLineText` | Texto corto |
| 10 | User Agent | `multilineText` | Texto largo |
| 11 | Origen | `singleSelect` | Select: Portal Staff, Ajuste administrador, Importación manual |
| 12 | Observación | `multilineText` | Texto largo |
| 13 | Creado | `createdTime` | Fecha creación |

**Campos no migrables:**

- `Marcación` (formula): fórmula — revisar referencias a campos locales
- `Creado` (createdTime): timestamp de creación — se pierde al migrar

**Registros de muestra (PII enmascarado):**

```
id: rec0I2RcawFgTunyi
  User Agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome…
  Origen: Portal Staff
  Correo: jo***m
  Fecha y Hora: 2026-06-17T23:24:25.099Z
  Creado: 2026-06-17T23:24:26.000Z
  Usuario ID: recO2t2irrvQQGaFd
  Estado resultante: Finalizado
  Registro del Día: ['recqskPwox2jniTBo']
  Empleado: ['recO2t2irrvQQGaFd']
  IP: 191.99.31.69
```

```
id: rec0JGPTAzbsNY6oC
  User Agent: Mozilla/5.0 (X11; Linux x86_64; rv:151.0) Gecko/20100101 Firefox/151.0
  Origen: Portal Staff
  Correo: ki***m
  Fecha y Hora: 2026-05-25T19:19:07.406Z
  Creado: 2026-05-25T19:19:08.000Z
  Usuario ID: recZuapFdOtGo9bgR
  Estado resultante: En almuerzo
  Registro del Día: ['receTYaS9R3XkOacf']
  Empleado: ['recZuapFdOtGo9bgR']
  IP: 200.124.251.20
```

```
id: rec0S0yL3DDGyXaYn
  User Agent: Mozilla/5.0 (X11; Linux x86_64; rv:151.0) Gecko/20100101 Firefox/151.0
  Origen: Portal Staff
  Correo: ki***m
  Fecha y Hora: 2026-06-08T18:04:49.277Z
  Creado: 2026-06-08T18:04:50.000Z
  Usuario ID: recZuapFdOtGo9bgR
  Estado resultante: En almuerzo
  Registro del Día: ['recwPIG3BfHv7F4aT']
  Empleado: ['recZuapFdOtGo9bgR']
  IP: 201.183.62.123
```

---

### Configuración Horarios

- **ID**: `tblYjWzlyO7ZObs0c`
- **Registros**: 1
- **Campo primario**: Configuración
- **Total campos**: 10

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Configuración | `singleLineText` | Texto corto |
| 2 | Año | `number` | Número (precision=0) |
| 3 | Sueldo Básico | `currency` | Moneda ($, precision=2) |
| 4 | Horas Base Mes | `number` | Número (precision=0) |
| 5 | Valor Hora | `formula` | Fórmula `{fldHCNU45PGOAtybr} / {fldmHW6yAVlSTiGZt}` |
| 6 | Activo | `checkbox` | Checkbox |
| 7 | Fecha Inicio | `date` | Fecha (local) |
| 8 | Fecha Fin | `date` | Fecha (local) |
| 9 | Observaciones | `multilineText` | Texto largo |
| 10 | Última actualización | `lastModifiedTime` | Última modificación |

**Campos no migrables:**

- `Valor Hora` (formula): fórmula — revisar referencias a campos locales
- `Última actualización` (lastModifiedTime): timestamp de modificación — se pierde al migrar

**Registros de muestra (PII enmascarado):**

```
id: recA2x6HCNAp2JVZm
  Activo: True
  Observaciones: Configuración inicial para cálculo de horarios del Portal Staff SUPER GEEK.
  Sueldo Básico: 482
  Última actualización: 2026-05-04T15:46:01.000Z
  Fecha Inicio: 2026-01-01
  Año: 2026
  Valor Hora: 3.0125
  Horas Base Mes: 160
  Configuración: Configuración Ecuador 2026
```

---

### Horarios Pagos

- **ID**: `tbllCpplmnW10emVm`
- **Registros**: 3
- **Campo primario**: Pago
- **Total campos**: 13

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Pago | `formula` | Fórmula `{fld2udpPRm6ev5spJ} & " | " & IF({fld5zqPJIcFrkbet0}, DATETI…` |
| 2 | Empleado | `multipleRecordLinks` | Vínculo → **Usuarios**  _(1:1)_ |
| 3 | Periodo de Pago | `multipleRecordLinks` | Vínculo → **Horarios Periodos de Pago** |
| 4 | Fecha de Pago | `date` | Fecha (iso) |
| 5 | Monto Pagado | `currency` | Moneda ($, precision=2) |
| 6 | Método de Pago | `singleSelect` | Select: Transferencia bancaria, Efectivo, Depósito, Otro |
| 7 | Comprobante | `multipleAttachments` | Adjuntos |
| 8 | Número de Transacción | `singleLineText` | Texto corto |
| 9 | Banco / Cuenta Origen | `singleLineText` | Texto corto |
| 10 | Observación | `multilineText` | Texto largo |
| 11 | Registrado por | `singleLineText` | Texto corto |
| 12 | Estado del Pago | `singleSelect` | Select: Registrado, Anulado |
| 13 | Creado | `createdTime` | Fecha creación |

**Campos no migrables:**

- `Pago` (formula): fórmula — revisar referencias a campos locales
- `Creado` (createdTime): timestamp de creación — se pierde al migrar

**Registros de muestra (PII enmascarado):**

```
id: recrT2KNak1jo4Ijm
  Empleado: ['recO2t2irrvQQGaFd']
  Fecha de Pago: 2026-06-04
  Comprobante: [1 adjunto(s)]
  Banco / Cuenta Origen: Pichincha
  Estado del Pago: Registrado
  Pago: Joseph Bolaños | 2026-06-04 | $490.68
  Método de Pago: Transferencia bancaria
  Monto Pagado: 490.68
  Creado: 2026-06-04T14:24:57.000Z
  Registrado por: acatso@icloud.com
```

```
id: recs33GSYJvmMYPgg
  Empleado: ['recWbW6AKxb22TSLI']
  Fecha de Pago: 2026-05-06
  Comprobante: [1 adjunto(s)]
  Banco / Cuenta Origen: prueba
  Estado del Pago: Registrado
  Pago: Alexis Bolaños | 2026-05-06 | $0.09
  Método de Pago: Transferencia bancaria
  Monto Pagado: 0.09
  Creado: 2026-05-06T21:35:40.000Z
  Registrado por: acatso@icloud.com
```

```
id: recuEboVlA8rZuI7L
  Empleado: ['recZuapFdOtGo9bgR']
  Fecha de Pago: 2026-06-04
  Comprobante: [1 adjunto(s)]
  Banco / Cuenta Origen: Pichincha
  Estado del Pago: Registrado
  Pago: Enrique Martinez | 2026-06-04 | $497.32
  Método de Pago: Transferencia bancaria
  Monto Pagado: 497.32
  Creado: 2026-06-04T14:23:08.000Z
  Registrado por: acatso@icloud.com
```

---

### Horarios Periodos de Pago

- **ID**: `tblC2KHE7UtVBs3Jc`
- **Registros**: 5
- **Campo primario**: Periodo
- **Total campos**: 30

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Periodo | `formula` | Fórmula `CONCATENATE({fldEbqfQExG9fDfAH}, " - ", {fldmV1MT8C2nlXadr},…` |
| 2 | Empleado | `multipleRecordLinks` | Vínculo → **Usuarios**  _(1:1)_ |
| 3 | Usuario ID | `singleLineText` | Texto corto |
| 4 | Correo | `singleLineText` | Texto corto |
| 5 | Fecha Inicio | `date` | Fecha (local) |
| 6 | Fecha Fin | `date` | Fecha (local) |
| 7 | Estado del Periodo | `singleSelect` | Select: Abierto, Pendiente de revisión, Revisado, Parcialmente pagado, Pagado, Cerrado |
| 8 | Registros del Periodo | `multipleRecordLinks` | Vínculo → **Horarios Registros** |
| 9 | Total Minutos | `rollup` | Rollup |
| 10 | Total Horas | `rollup` | Rollup |
| 11 | Total Ganado | `rollup` | Rollup |
| 12 | Pagos | `multipleRecordLinks` | Vínculo → **Horarios Pagos** |
| 13 | Total Pagado | `rollup` | Rollup |
| 14 | Saldo Pendiente | `formula` | Fórmula `MAX(0, {fldzpmb3N4cDGeNS3} - {fld95wacqHC2co2Nz})` |
| 15 | Revisado por Admin | `checkbox` | Checkbox |
| 16 | Fecha de Revisión | `date` | Fecha (local) |
| 17 | Observaciones | `multilineText` | Texto largo |
| 18 | Horarios Ajustes | `multipleRecordLinks` | Vínculo → **Horarios Ajustes** |
| 19 | Rol de Pago PDF | `multipleAttachments` | Adjuntos |
| 20 | Rol generado | `checkbox` | Checkbox |
| 21 | Fecha generación rol | `dateTime` | Fecha/hora (local) |
| 22 | Generado por | `singleLineText` | Texto corto |
| 23 | Observación rol | `multilineText` | Texto largo |
| 24 | Estado rol | `singleSelect` | Select: Pendiente, Generado, Regenerado, Anulado |
| 25 | Rol de Pago Blob URL | `singleLineText` | Texto corto |
| 26 | Rol de Pago Blob Pathname | `singleLineText` | Texto corto |
| 27 | Ajustes | `multipleRecordLinks` | Vínculo → **Horarios Ajustes** |
| 28 | Total Ajustes | `rollup` | Rollup |
| 29 | Total Neto | `formula` | Fórmula `MAX(0, {fldzpmb3N4cDGeNS3} + {fld3ieABL0p1kHXjt})` |
| 30 | Saldo Pendiente Neto | `formula` | Fórmula `MAX(0, {fldX3BWfrsjj1xwuf} - {fld95wacqHC2co2Nz})` |

**Campos no migrables:**

- `Periodo` (formula): fórmula — revisar referencias a campos locales
- `Total Minutos` (rollup): rollup — depende de links locales
- `Total Horas` (rollup): rollup — depende de links locales
- `Total Ganado` (rollup): rollup — depende de links locales
- `Total Pagado` (rollup): rollup — depende de links locales
- `Saldo Pendiente` (formula): fórmula — revisar referencias a campos locales
- `Total Ajustes` (rollup): rollup — depende de links locales
- `Total Neto` (formula): fórmula — revisar referencias a campos locales
- `Saldo Pendiente Neto` (formula): fórmula — revisar referencias a campos locales

**Registros de muestra (PII enmascarado):**

```
id: rec8iM0fHN0a26ICv
  Fecha Fin: 2026-05-06
  Generado por: acatso@icloud.com
  Total Ajustes: 0
  Total Pagado: 0.09
  Rol de Pago Blob URL: https://r3htqbdxhgt3wdbq.private.blob.vercel-storage.com/horarios/roles-pago/rec…
  Empleado: ['recWbW6AKxb22TSLI']
  Registros del Periodo: ['receFCqLFqGhk6JZV']
  Estado rol: Regenerado
  Fecha generación rol: 2026-05-06T21:35:51.618Z
  Estado del Periodo: Pagado
```

```
id: recCupqA5ylh3g6BP
  Fecha Fin: 2026-07-03
  Total Ajustes: 0
  Total Pagado: 0
  Empleado: ['recO2t2irrvQQGaFd']
  Registros del Periodo: ['recLDpqX7EstO4bFw', 'recBTTkcnaxOjbpwF', 'reck9M8EKJLNHeUkR', 'recSt2KWhbIGYWMCe', 'recAsYgcEoSHM4PEO', 'recZSLZRvSonXm3Jb', 'recSCsdPKHSAZoQjj', 'recg16rb9NEyMIrGJ', 'recqskPwox2jniTBo', 'recouMouBsNGR8Otq']
  Estado del Periodo: Abierto
  Usuario ID: recO2t2irrvQQGaFd
  Total Neto: 193.30999999999997
  Periodo: Joseph Bolaños - 2026-06-04T00:00:00.000Z - 2026-07-03T00:00:00.000Z
  Saldo Pendiente: 193.30999999999997
```

```
id: recPnVlwVlQE90qPE
  Fecha Fin: 2026-07-03
  Total Ajustes: 0
  Total Pagado: 0
  Empleado: ['recZuapFdOtGo9bgR']
  Registros del Periodo: ['recnLNWnn7RFSchGW', 'recpderD5HXrfc8Ze', 'recy44NHBpu2sIcCn', 'recwPIG3BfHv7F4aT', 'recDXPrB7GmFhEX3f', 'rec6vQLnIicZqlqsw', 'recWCmWLOljuo7fcK', 'recIYCnAFVDXp5Ohj', 'reczCADKxNkuO3ZHo', 'reckODJgkGx2Cxdml', 'recX9BNiCRynVa8ZZ', 'recpbDRGgMGOgvzlQ']
  Estado del Periodo: Abierto
  Usuario ID: recZuapFdOtGo9bgR
  Total Neto: 241.82
  Periodo: Enrique Martinez - 2026-06-04T00:00:00.000Z - 2026-07-03T00:00:00.000Z
  Saldo Pendiente: 241.82
```

---

### Horarios Ajustes

- **ID**: `tblC65GgNxc9UpIFM`
- **Registros**: 3
- **Campo primario**: Ajuste
- **Total campos**: 15

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Ajuste | `singleLineText` | Texto corto |
| 2 | Empleado | `multipleRecordLinks` | Vínculo → **Usuarios**  _(1:1)_ |
| 3 | Registro del Día | `multipleRecordLinks` | Vínculo → **Horarios Registros**  _(1:1)_ |
| 4 | Periodo de Pago | `multipleRecordLinks` | Vínculo → **Horarios Periodos de Pago**  _(1:1)_ |
| 5 | Tipo de Ajuste | `singleSelect` | Select: Corrección de hora, Bono, Descuento, Regularización, Otro |
| 6 | Minutos Ajustados | `number` | Número (precision=0) |
| 7 | Monto Ajustado | `currency` | Moneda ($, precision=2) |
| 8 | Motivo | `multilineText` | Texto largo |
| 9 | Aprobado por | `singleLineText` | Texto corto |
| 10 | Fecha de Ajuste | `date` | Fecha (local) |
| 11 | Estado | `singleSelect` | Select: Pendiente, Aprobado, Rechazado, Aplicado |
| 12 | Horarios Periodos de Pago | `singleLineText` | Texto corto |
| 13 | Horas Ajustadas | `formula` | Fórmula `{fldDo5vZcPlPdzFlJ} / 60` |
| 14 | Es Descuento | `formula` | Fórmula `IF({fldv9eETessqF1nBr} < 0, "Sí", "No")` |
| 15 | Horarios Periodos de Pago 2 | `multipleRecordLinks` | Vínculo → **Horarios Periodos de Pago** |

**Campos no migrables:**

- `Horas Ajustadas` (formula): fórmula — revisar referencias a campos locales
- `Es Descuento` (formula): fórmula — revisar referencias a campos locales

**Registros de muestra (PII enmascarado):**

```
id: recIYJHsODHWRFx0v
  Estado: Aplicado
  Minutos Ajustados: -60
  Tipo de Ajuste: Descuento
  Motivo: No marcar salida de alumerzo correctamente
  Es Descuento: Sí
  Empleado: ['recO2t2irrvQQGaFd']
  Fecha de Ajuste: 2026-05-12
  Aprobado por: acatso@icloud.com
  Periodo de Pago: ['recZjpcCFkqJnI2ej']
  Monto Ajustado: -3.01
```

```
id: recN89qEA1SY6p5j7
  Estado: Aplicado
  Minutos Ajustados: -60
  Tipo de Ajuste: Descuento
  Motivo: Falta en no revisar cargador para devolucion HUB HP
  Es Descuento: Sí
  Empleado: ['recZuapFdOtGo9bgR']
  Fecha de Ajuste: 2026-05-21
  Aprobado por: acatso@icloud.com
  Registro del Día: ['rec2Xhf4efUheOeAf']
  Periodo de Pago: ['recwMQ7mFOVzctHZ7']
```

```
id: recRO5DQjI8brZwjA
  Estado: Aplicado
  Minutos Ajustados: -60
  Tipo de Ajuste: Descuento
  Motivo: Falta en no revisar cargador para devolucion HUB HP
  Es Descuento: Sí
  Empleado: ['recO2t2irrvQQGaFd']
  Fecha de Ajuste: 2026-05-21
  Aprobado por: acatso@icloud.com
  Registro del Día: ['recXOR4Kt8VnwSC0B']
  Periodo de Pago: ['recZjpcCFkqJnI2ej']
```

---

### Cotizaciones

- **ID**: `tblGgwjH64Pxq8Ev6`
- **Registros**: 24
- **Campo primario**: Código Cotización
- **Total campos**: 27

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Código Cotización | `formula` | Fórmula `"COT-" & YEAR(TODAY()) & "-" & REPT("0", 6 - LEN({fldBLtdUKh…` |
| 2 | Consecutivo | `autoNumber` | AutoNumber |
| 3 | Cliente Record ID | `singleLineText` | Texto corto |
| 4 | Cliente Nombre | `singleLineText` | Texto corto |
| 5 | Cliente Teléfono | `phoneNumber` | Teléfono |
| 6 | Cliente Email | `email` | Email |
| 7 | Cliente Cédula | `singleLineText` | Texto corto |
| 8 | Producto Solicitado | `singleLineText` | Texto corto |
| 9 | Categoría | `singleSelect` | Select: Laptop, Desktop, Electrónico, Repuesto, Consola, iMac +3 |
| 10 | Descripción del Requerimiento | `multilineText` | Texto largo |
| 11 | Estado Cotización | `singleSelect` | Select: Pendiente, Buscando Opciones, Cotización Enviada, Esperando Respuesta, Aprobada, No Aprobada +3 |
| 12 | Requiere Instalación | `checkbox` | Checkbox |
| 13 | Equipo ya está en tienda | `checkbox` | Checkbox |
| 14 | Orden Reparación ID | `singleLineText` | Texto corto |
| 15 | Orden Reparación Código | `singleLineText` | Texto corto |
| 16 | Item Pedido ID | `singleLineText` | Texto corto |
| 17 | Total Cotizado | `currency` | Moneda ($, precision=2) |
| 18 | Total Abonado | `currency` | Moneda ($, precision=2) |
| 19 | Saldo Pendiente | `formula` | Fórmula `MAX(0, {fldkxHIwhCXwv37ip} - {fldb4x6oNyfJM9C9p})` |
| 20 | Registrado Por | `singleLineText` | Texto corto |
| 21 | Fecha Creación | `createdTime` | Fecha creación |
| 22 | Última Actualización | `lastModifiedTime` | Última modificación |
| 23 | Observación Interna | `multilineText` | Texto largo |
| 24 | Opciones de Cotización | `multipleRecordLinks` | Vínculo → **Opciones de Cotización** |
| 25 | Abonos de Cotización | `multipleRecordLinks` | Vínculo → **Abonos de Cotización** |
| 26 | Opción Elegida | `multipleRecordLinks` | Vínculo → **Opciones de Cotización**  _(1:1)_ |
| 27 | Pedido Generado | `multipleRecordLinks` | Vínculo → **Item**  _(1:1)_ |

**Campos no migrables:**

- `Código Cotización` (formula): fórmula — revisar referencias a campos locales
- `Consecutivo` (autoNumber): autoNumber se reinicia al migrar (copiar a campo texto antes)
- `Saldo Pendiente` (formula): fórmula — revisar referencias a campos locales
- `Fecha Creación` (createdTime): timestamp de creación — se pierde al migrar
- `Última Actualización` (lastModifiedTime): timestamp de modificación — se pierde al migrar

**Registros de muestra (PII enmascarado):**

```
id: rec0q7T51IXoorjF5
  Cliente Cédula: 10***1
  Cliente Nombre: Na***o
  Registrado Por: Joseph Bolaños
  Última Actualización: 2026-05-19T22:09:33.000Z
  Consecutivo: 12
  Estado Cotización: Esperando Respuesta
  Cliente Record ID: recoYCv4FnrFRqfU2
  Producto Solicitado: Pantalla Laptop Asus Vivobook F1500E
  Categoría: Repuesto
  Opciones de Cotización: ['rec37J6rBjjPqP4oc']
```

```
id: rec4kyug72qdjgtNC
  Cliente Nombre: Ga***o
  Registrado Por: Joseph Bolaños
  Última Actualización: 2026-06-17T17:45:56.000Z
  Consecutivo: 20
  Estado Cotización: Esperando Respuesta
  Cliente Record ID: recGdqHNVO28TRW5u
  Producto Solicitado: Batería CA06XL 4910mAh para la HP ProBook 640 G1
  Opciones de Cotización: ['rec3GXppBHLN9m00B']
  Saldo Pendiente: 0
  Fecha Creación: 2026-06-09T16:14:47.000Z
```

```
id: rec76AhDJsEwBfLe2
  Cliente Nombre: Me***r
  Registrado Por: Alexis Bolaños
  Última Actualización: 2026-06-17T17:44:55.000Z
  Consecutivo: 18
  Estado Cotización: No Disponible
  Cliente Record ID: recjTrN783gkdbeZK
  Producto Solicitado: Tecla A con bincha laptop Lenovo modelo ilegible
  Categoría: Repuesto
  Saldo Pendiente: 0
  Fecha Creación: 2026-06-03T21:50:19.000Z
```

---

### Opciones de Cotización

- **ID**: `tbldpEjnOqRZMEivL`
- **Registros**: 23
- **Campo primario**: Opción
- **Total campos**: 23

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Opción | `formula` | Fórmula `{fldeuqzEXqiWlgUWN} & " - $" & {fld5orY50Fz3KzcTD}` |
| 2 | Cotización | `multipleRecordLinks` | Vínculo → **Cotizaciones**  _(1:1)_ |
| 3 | Nombre Opción | `singleLineText` | Texto corto |
| 4 | Descripción | `multilineText` | Texto largo |
| 5 | Fotos | `multipleAttachments` | Adjuntos |
| 6 | Proveedor | `multipleRecordLinks` | Vínculo → **Proveedores**  _(1:1)_ |
| 7 | URL Proveedor | `url` | URL |
| 8 | Costo Proveedor | `currency` | Moneda ($, precision=2) |
| 9 | Flete Estimado | `currency` | Moneda ($, precision=2) |
| 10 | Arancel / Impuestos | `currency` | Moneda ($, precision=2) |
| 11 | Otros Costos | `currency` | Moneda ($, precision=2) |
| 12 | Costo Real Total | `formula` | Fórmula `{fld704zoZiGXlUu9x} + {fldldeiwWGcy7HbKc} + {fldRZObHBd9KWUo…` |
| 13 | Precio Venta Cliente | `currency` | Moneda ($, precision=2) |
| 14 | Ganancia Estimada | `formula` | Fórmula `{fld5orY50Fz3KzcTD} - {fldu7qY6FNoXdR8OV}` |
| 15 | Estado Opción | `singleSelect` | Select: Disponible, Ofrecida al Cliente, Seleccionada, Descartada, No Disponible |
| 16 | Seleccionada por Cliente | `checkbox` | Checkbox |
| 17 | Nota Interna | `multilineText` | Texto largo |
| 18 | Nota para Cliente | `multilineText` | Texto largo |
| 19 | Item Asociado | `multipleRecordLinks` | Vínculo → **Item**  _(1:1)_ |
| 20 | Revisión AI de Opción | `aiText` | Texto AI |
| 21 | Cotizaciones | `multipleRecordLinks` | Vínculo → **Cotizaciones** |
| 22 | Producto / Descripción | `multilineText` | Texto largo |
| 23 | Tiempo Estimado | `singleSelect` | Select: 24 horas, 2 a 3 días, 1 semana, 2 a 3 semanas, 1 mes, Por confirmar |

**Campos no migrables:**

- `Opción` (formula): fórmula — revisar referencias a campos locales
- `Costo Real Total` (formula): fórmula — revisar referencias a campos locales
- `Ganancia Estimada` (formula): fórmula — revisar referencias a campos locales

**Registros de muestra (PII enmascarado):**

```
id: rec0AZts4012qOffe
  Fotos: [1 adjunto(s)]
  Producto / Descripción: TECLADO LENOVO T460S CON POINTER SP
  Ganancia Estimada: 65
  Proveedor: ['recMKJBDVJFxJnz1R']
  Precio Venta Cliente: 65
  URL Proveedor: DTC
  Tiempo Estimado: 2 a 3 días
  Opción:  - $65
  Cotización: ['recn8HAlQWRhE1Z3q']
  Revisión AI de Opción: {'state': 'error', 'errorType': 'emptyDependency', 'value': None, 'isStale': False}
```

```
id: rec2vSiLQyhtkVPgN
  Fotos: [5 adjunto(s)]
  Producto / Descripción: Lenovo Thinkpad T14 Gen 1 14" AMD Ryzen 5 Pro 4650U 512GB nvme 16GB Windows 11 Pro
  Ganancia Estimada: 139
  Proveedor: ['rec0EOISxjI08QWkQ']
  Precio Venta Cliente: 370
  URL Proveedor: https://store.3rtechnology.com/products/lenovo-thinkpad-t14-gen-1-14-amd-ryzen-5…
  Costo Proveedor: 231
  Tiempo Estimado: 2 a 3 semanas
  Opción:  - $370
  Cotización: ['recvbfMGX896QJeUb']
```

```
id: rec37J6rBjjPqP4oc
  Producto / Descripción: PANTALLA 15.6 LED SLIM 30 PINES IPS FULL HD (1920*1080) IPS NARROW SIN SOPORTES …
  Ganancia Estimada: 140
  Proveedor: ['recPcMYidLCXyhRK8']
  Precio Venta Cliente: 140
  Tiempo Estimado: 24 horas
  Opción:  - $140
  Cotización: ['rec0q7T51IXoorjF5']
  Revisión AI de Opción: {'state': 'error', 'errorType': 'emptyDependency', 'value': None, 'isStale': False}
  Costo Real Total: 0
  Estado Opción: Disponible
```

---

### Abonos de Cotización

- **ID**: `tblu42s1jk0pt329b`
- **Registros**: 4
- **Campo primario**: Abono
- **Total campos**: 18

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Abono | `formula` | Fórmula `{fldgElFnFtTblD3O2} & " - " & DATETIME_FORMAT({fldwTUnmCKkXd…` |
| 2 | Cotización | `multipleRecordLinks` | Vínculo → **Cotizaciones**  _(1:1)_ |
| 3 | Item Pedido ID | `singleLineText` | Texto corto |
| 4 | Cliente Nombre | `singleLineText` | Texto corto |
| 5 | Fecha de Abono | `dateTime` | Fecha/hora (iso) |
| 6 | Monto | `currency` | Moneda ($, precision=2) |
| 7 | Método de Pago | `singleSelect` | Select: Efectivo, Transferencia bancaria, Depósito, Tarjeta, Otro |
| 8 | Comprobante | `multipleAttachments` | Adjuntos |
| 9 | Número de Transacción | `singleLineText` | Texto corto |
| 10 | Registrado Por | `singleLineText` | Texto corto |
| 11 | Estado del Abono | `singleSelect` | Select: Registrado, Anulado |
| 12 | Observación | `multilineText` | Texto largo |
| 13 | Creado | `createdTime` | Fecha creación |
| 14 | Movimiento Financiero ID | `singleLineText` | Texto corto |
| 15 | Cuenta Destino | `singleLineText` | Texto corto |
| 16 | Estado Financiero | `singleSelect` | Select: Pendiente de registrar, Registrado en Finanzas, Error de sincronización, Anulado |
| 17 | Fecha Sincronización Finanzas | `date` | Fecha (local) |
| 18 | Error Sincronización Finanzas | `singleLineText` | Texto corto |

**Campos no migrables:**

- `Abono` (formula): fórmula — revisar referencias a campos locales
- `Creado` (createdTime): timestamp de creación — se pierde al migrar

**Registros de muestra (PII enmascarado):**

```
id: rec0RPL2fyVgn2Qix
  Registrado Por: Alexis Bolaños
  Creado: 2026-05-24T15:47:19.000Z
  Número de Transacción: 1232
  Cuenta Destino: Caja
  Cotización: ['recQU406IFVOQOGDd']
  Abono: Erick Maigua - 2026-05-24 15:47 - $1
  Cliente Nombre: Er***a
  Estado Financiero: Anulado
  Monto: 1
  Estado del Abono: Anulado
```

```
id: rec3lby8BF35hHtPp
  Registrado Por: Joseph Bolaños
  Creado: 2026-05-13T22:50:42.000Z
  Cuenta Destino: Caja
  Cotización: ['recGdifi2jNyTxbcJ']
  Abono: Bryan Hualca - 2026-05-13 22:50 - $180
  Cliente Nombre: Br***a
  Estado Financiero: Pendiente de registrar
  Monto: 180
  Estado del Abono: Registrado
  Método de Pago: Efectivo
```

```
id: recWEci6QqgBkHDh4
  Registrado Por: Alexis Bolaños
  Creado: 2026-06-24T16:24:34.000Z
  Cuenta Destino: Caja
  Cotización: ['recp96EPGAmB3X3ro']
  Abono: AMAGUAÑA WILLIAM - 2026-06-24 16:24 - $240
  Cliente Nombre: AM***M
  Estado Financiero: Pendiente de registrar
  Monto: 240
  Estado del Abono: Registrado
  Método de Pago: Transferencia bancaria
```

---

### Notificaciones

- **ID**: `tblKcS1F6UYQvY2R8`
- **Registros**: 14
- **Campo primario**: Notificación
- **Total campos**: 17

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Notificación | `formula` | Fórmula `{fldNE1JiOjU2qRJMs} & " - " & DATETIME_FORMAT({fldzJXUDA7B7L…` |
| 2 | Destinatario | `multipleRecordLinks` | Vínculo → **Usuarios**  _(1:1)_ |
| 3 | Correo Destinatario | `multipleLookupValues` | multipleLookupValues |
| 4 | Tipo | `singleSelect` | Select: Amonestación, Tarea, Sistema, Pago, Horario, Pedido +2 |
| 5 | Título | `singleLineText` | Texto corto |
| 6 | Mensaje | `multilineText` | Texto largo |
| 7 | URL Acción | `singleLineText` | Texto corto |
| 8 | Estado | `singleSelect` | Select: No leída, Leída, Archivada |
| 9 | Prioridad | `singleSelect` | Select: Normal, Alta, Crítica |
| 10 | Enviar Email | `checkbox` | Checkbox |
| 11 | Estado Email | `singleSelect` | Select: No aplica, Pendiente, Enviado, Error |
| 12 | Error Email | `multilineText` | Texto largo |
| 13 | Entidad Tipo | `singleSelect` | Select: Amonestación, Tarea, Pago, Jornada, Pedido, Orden Reparación +1 |
| 14 | Entidad ID | `singleLineText` | Texto corto |
| 15 | Creado por | `multipleRecordLinks` | Vínculo → **Usuarios**  _(1:1)_ |
| 16 | Fecha Leída | `dateTime` | Fecha/hora (us) |
| 17 | Creado | `createdTime` | Fecha creación |

**Campos no migrables:**

- `Notificación` (formula): fórmula — revisar referencias a campos locales
- `Creado` (createdTime): timestamp de creación — se pierde al migrar

**Registros de muestra (PII enmascarado):**

```
id: rec2bD12mLi2oXfRl
  Tipo: Reparación
  Notificación:  - 13/05/2026 21:35
  Prioridad: Crítica
  Estado: Archivada
  Entidad Tipo: Orden Reparación
  Estado Email: Er***r
  Enviar Email: ***
  Creado: 2026-05-13T21:35:25.000Z
```

```
id: rec4E6gO5FtOEsITr
  Tipo: Sistema
  Notificación: Enviar Feedback a los clientes facturados. - 15/05/2026 18:24
  Destinatario: ['recO2t2irrvQQGaFd']
  Prioridad: Alta
  Estado: Leída
  Correo Destinatario: ['***]
  Entidad Tipo: Sistema
  Título: Enviar Feedback a los clientes facturados.
  Mensaje: Recuerden que siempre debemos enviar el feedback a los clientes que han facturad…
  Estado Email: No***a
```

```
id: rec7aNtNjf0nivC4c
  Tipo: Amonestación
  Notificación: Amonestación registrada - 21/05/2026 20:19
  Destinatario: ['recZuapFdOtGo9bgR']
  URL Acción: /horarios
  Prioridad: Alta
  Estado: Leída
  Correo Destinatario: ['***]
  Entidad Tipo: Amonestación
  Título: Amonestación registrada
  Mensaje: Se registró un descuento de 1.00 h en tu periodo de pago. Motivo: Falta en no re…
```

---

### Shipping Proveedores

- **ID**: `tblHy141rHAHyXt5W`
- **Registros**: 19
- **Campo primario**: Proveedor ID
- **Total campos**: 46

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Proveedor ID | `formula` | Fórmula `CONCATENATE({fld8jwxNW1u7duMED}, "-", {fldH1sbCWC1p9ilEe})` |
| 2 | Nombre proveedor | `singleLineText` | Texto corto |
| 3 | Estado proveedor | `singleSelect` | Select: Activo, Inactivo, En revisión |
| 4 | Tipo de proveedor | `singleSelect` | Select: USA, Local, Marketplace, Interno, Logístico, Otro +1 |
| 5 | Requiere pago antes de envío | `checkbox` | Checkbox |
| 6 | Plazo sugerido de pago en días | `number` | Número (precision=0) |
| 7 | Puede armar packings | `checkbox` | Checkbox |
| 8 | Puede recibir encargos de terceros | `checkbox` | Checkbox |
| 9 | Permite triangulación | `checkbox` | Checkbox |
| 10 | Permite acceso portal proveedor | `checkbox` | Checkbox |
| 11 | Puede responder novedades o garantías | `checkbox` | Checkbox |
| 12 | Método de pago preferido | `singleSelect` | Select: Transferencia bancaria, PayPal, Efectivo, Tarjeta, Depósito, Otro +1 |
| 13 | Cuenta o destino de pago preferido | `singleLineText` | Texto corto |
| 14 | Regla de distribución de costos preferida | `singleSelect` | Select: Por costo del item, Por peso, Por cantidad, Manual, No definida |
| 15 | Email de contacto | `email` | Email |
| 16 | Teléfono / WhatsApp | `phoneNumber` | Teléfono |
| 17 | Notificar recepción por email | `checkbox` | Checkbox |
| 18 | Notificar novedades por email | `checkbox` | Checkbox |
| 19 | Permisos especiales | `multipleSelects` | Multi-select: Puede incluir regalos, Puede editar tracking, Puede registrar peso, Puede marcar enviado, Puede proponer solución de garantía, Puede ver solo sus packings +2 |
| 20 | Observaciones | `multilineText` | Texto largo |
| 21 | Registrado por | `singleLineText` | Texto corto |
| 22 | Fecha de creación | `dateTime` | Fecha/hora (iso) |
| 23 | Última actualización | `dateTime` | Fecha/hora (iso) |
| 24 | Legacy Proveedor ID | `singleLineText` | Texto corto |
| 25 | Fuente de migración | `singleLineText` | Texto corto |
| 26 | Shipping Items (Proveedor de compra) | `multipleRecordLinks` | Vínculo → **Shipping Items** |
| 27 | Shipping Items (Proveedor logístico / intermediario) | `multipleRecordLinks` | Vínculo → **Shipping Items** |
| 28 | Shipping Pagos | `multipleRecordLinks` | Vínculo → **Shipping Pagos** |
| 29 | Shipping Finanzas Movimientos | `multipleRecordLinks` | Vínculo → **Shipping Finanzas Movimientos** |
| 30 | Shipping Packings (Proveedor responsable) | `multipleRecordLinks` | Vínculo → **Shipping Packings** |
| 31 | Shipping Packings (Proveedor logístico / intermediario) | `multipleRecordLinks` | Vínculo → **Shipping Packings** |
| 32 | Shipping Recepciones | `multipleRecordLinks` | Vínculo → **Shipping Recepciones** |
| 33 | Shipping Novedades | `multipleRecordLinks` | Vínculo → **Shipping Novedades** |
| 34 | Shipping Migraciones | `multipleRecordLinks` | Vínculo → **Shipping Migraciones** |
| 35 | Shipping Eventos | `multipleRecordLinks` | Vínculo → **Shipping Eventos** |
| 36 | Shipping Packings | `multipleRecordLinks` | Vínculo → **Shipping Packings** |
| 37 | Shipping Packings 2 | `multipleRecordLinks` | Vínculo → **Shipping Packings** |
| 38 | País / zona logística | `singleSelect` | Select: USA, Ecuador, Miami / Casillero, Internacional, Local, Otro |
| 39 | URL rastreo | `url` | URL |
| 40 | Plantilla URL rastreo | `singleLineText` | Texto corto |
| 41 | Permite rastreo web | `checkbox` | Checkbox |
| 42 | Notas de rastreo | `multilineText` | Texto largo |
| 43 | Logo proveedor | `multipleAttachments` | Adjuntos |
| 44 | Website proveedor | `singleLineText` | Texto corto |
| 45 | Email proveedor | `email` | Email |
| 46 | Pie factura | `richText` | Texto enriquecido |

**Campos no migrables:**

- `Proveedor ID` (formula): fórmula — revisar referencias a campos locales

**Registros de muestra (PII enmascarado):**

```
id: rec4pXpZZoPqpSE4a
  Plantilla URL rastreo: https://www.fedex.com/fedextrack/?trknbr={TRACKING}
  Nombre proveedor: Fe***x
  URL rastreo: https://www.fedex.com/en-us/tracking.html
  Proveedor ID: FedEx-Logístico
  Tipo de proveedor: Logístico
  Estado proveedor: Activo
  Permite rastreo web: True
  Notas de rastreo: Transportista USA. Usado para rastrear envíos dentro de Estados Unidos hacia Miami.
  País / zona logística: USA
```

```
id: rec7WfjiQrdf6j4p6
  Plantilla URL rastreo: https://fenix.laarcourier.com/Tracking/?guia={TRACKING}
  Nombre proveedor: La***x
  URL rastreo: https://fenix.laarcourier.com/Tracking/?
  Proveedor ID: Laarbox-Logístico
  Tipo de proveedor: Logístico
  Estado proveedor: Activo
  Shipping Items (Proveedor logístico / intermediario): ['rec3CwvXmJg8YOaDm', 'rect3hr6zZS3f0LPd', 'recmiv5g5dyPpyCF6', 'recwprm8vc6gaQesB', 'recuWrlEBsp1JFumL', 'recNvf1IcYOXwH8Un', 'recW7iRE7AeyY8ZGH', 'recfB0FeYUVCs2Rux', 'recw8jgV52LVk8BXK', 'recGKsSSm1Xo4cRam', 'recgawXSHTHe3kOAF', 'recjFnh6s9xSfodsK', 'recGpQZEiBvc5ZwUq', 'recPNAYpRH4neXPqk', 'recI0OPRCL6qitUtP', 'recS6S3rP67lU2QkH', 'recujHfHxioUM9wGT', 'recxaaFVDxu3L1BsE', 'recRzBxxZHlJFVvKg', 'recTcN5gWXF5zLGTo', 'recuv0RJGTHZdIt6W', 'rec58z7IQQHo580lS', 'recQTjpVkbIclenUn', 'recd0HkFnoSMPyjZQ', 'recsQK1bwUvKFZzQ8', 'rec9KEnryhBnnIg9y', 'recg0KClOSswGOZkD', 'recu0bmeCE1TKv2km', 'reclNIgXQvdkxz8XZ']
  Shipping Packings 2: ['recWhx2zjtDa5r9Dp', 'rec7Zt3dePXAoVe19']
  Permite rastreo web: True
  Notas de rastreo: Operador logístico usado para traer paquetes desde Miami hacia Ecuador. Completa…
```

```
id: rec8l8y2l4E14WmgG
  Plantilla URL rastreo: https://www.dhl.com/global-en/home/tracking.html?tracking-id={TRACKING}
  Nombre proveedor: ***
  URL rastreo: https://www.dhl.com/global-en/home/tracking.html
  Proveedor ID: DHL-Logístico
  Tipo de proveedor: Logístico
  Estado proveedor: Activo
  Permite rastreo web: True
  Notas de rastreo: Transportista internacional. Usado para rastreo internacional cuando aplique.
  País / zona logística: Internacional
```

---

### Shipping Items

- **ID**: `tbliTKAI8dAWwr1nh`
- **Registros**: 29
- **Campo primario**: Nombre del item
- **Total campos**: 132

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Nombre del item | `singleLineText` | Texto corto |
| 2 | AI Nombre del item | `aiText` | Texto AI |
| 3 | SKU | `singleLineText` | Texto corto |
| 4 | Descripción | `multilineText` | Texto largo |
| 5 | Tipo de operación | `singleSelect` | Select: Compra a proveedor, Compra ya pagada, Regalo de proveedor, Encargo enviado a proveedor, Reajuste de inventario, Uso local +5 |
| 6 | Tipo de item | `singleSelect` | Select: Equipo completo, Componente, Parte, Repuesto, Accesorio, Uso local +1 |
| 7 | Categoría | `singleSelect` | Select: Laptop, Desktop, All in One, Monitor, Consola, RAM +13 |
| 8 | Estado Item | `singleSelect` | Select: Registrado, Pendiente de pago, Pagado, Pendiente de packing, En packing, En tránsito +16 |
| 9 | Estado de revisión | `singleSelect` | Select: No aplica, Pendiente de recepción, Recibido pendiente de revisión, Recibido correctamente, Faltante, Dañado +4 |
| 10 | Estado de triangulación | `singleSelect` | Select: No aplica, Pendiente de envío a intermediario, En camino a intermediario, Recibido por intermediario, Asignado a packing de intermediario, En tránsito desde intermediario +3 |
| 11 | Estado de despiece | `singleSelect` | Select: No aplica, Evaluando despiece, Destinado a partes, Despiece en proceso, Despiece parcial, Despiece completo +1 |
| 12 | Proveedor de compra | `multipleRecordLinks` | Vínculo → **Shipping Proveedores**  _(1:1)_ |
| 13 | Proveedor logístico / intermediario | `multipleRecordLinks` | Vínculo → **Shipping Proveedores**  _(1:1)_ |
| 14 | Requiere pago | `checkbox` | Checkbox |
| 15 | Pago relacionado | `multipleRecordLinks` | Vínculo → **Pago**  _(1:1)_ |
| 16 | Requiere packing | `checkbox` | Checkbox |
| 17 | Packing relacionado | `multipleRecordLinks` | Vínculo → **Packing**  _(1:1)_ |
| 18 | Afecta inventario | `checkbox` | Checkbox |
| 19 | Disponible para venta | `checkbox` | Checkbox |
| 20 | Reservado | `checkbox` | Checkbox |
| 21 | Costo proveedor | `currency` | Moneda ($, precision=2) |
| 22 | Costo asignado por despiece | `currency` | Moneda ($, precision=2) |
| 23 | Costo total estimado | `currency` | Moneda ($, precision=2) |
| 24 | Precio venta sugerido | `currency` | Moneda ($, precision=2) |
| 25 | Precio venta final | `currency` | Moneda ($, precision=2) |
| 26 | Cantidad | `number` | Número (precision=0) |
| 27 | Total costo proveedor Packing | `rollup` | Rollup |
| 28 | Cantidad items Packing | `multipleLookupValues` | multipleLookupValues |
| 29 | Costo flete asignado | `formula` | Fórmula `IF(
  FIND("cantidad", LOWER(ARRAYJOIN({fld2Pu35JgsUUPa7Z}))…` |
| 30 | Costo arancel asignado | `formula` | Fórmula `IF(
  FIND("cantidad", LOWER(ARRAYJOIN({fld2Pu35JgsUUPa7Z}))…` |
| 31 | Otros costos asignados | `formula` | Fórmula `IF(
  FIND("cantidad", LOWER(ARRAYJOIN({fld2Pu35JgsUUPa7Z}))…` |
| 32 | Costo logístico asignado | `formula` | Fórmula `IF({fldd7aKGpVKXwqEym}, {fldd7aKGpVKXwqEym}, 0)
+
IF({fldPtr…` |
| 33 | Costo total unidad | `formula` | Fórmula `IF({fldBQ0VU7fDgGOvOG}, {fldBQ0VU7fDgGOvOG}, 0)
+
IF({fldG2o…` |
| 34 | Unidad | `singleSelect` | Select: Unidad, Lote, Pieza, Kit, Otro |
| 35 | SKU interno | `singleLineText` | Texto corto |
| 36 | SKU proveedor | `singleLineText` | Texto corto |
| 37 | Número de serie | `singleLineText` | Texto corto |
| 38 | Modelo | `singleLineText` | Texto corto |
| 39 | Marca | `singleLineText` | Texto corto |
| 40 | Condición | `singleSelect` | Select: Usado, Open Box, Nuevo, Para partes, Dañado, No probado +2 |
| 41 | Ubicación actual | `singleLineText` | Texto corto |
| 42 | Origen físico actual | `singleSelect` | Select: En proveedor, En intermediario, En tránsito, En Doral/Miami, En Ecuador, En tienda +3 |
| 43 | Tracking hacia intermediario | `singleLineText` | Texto corto |
| 44 | Tracking desde intermediario | `singleLineText` | Texto corto |
| 45 | Tracking directo | `singleLineText` | Texto corto |
| 46 | Item padre | `multipleRecordLinks` | Vínculo → **Shipping Items**  _(1:1)_ |
| 47 | Items hijos | `multipleRecordLinks` | Vínculo → **Shipping Items** |
| 48 | Motivo de despiece | `multilineText` | Texto largo |
| 49 | Fecha de despiece | `dateTime` | Fecha/hora (iso) |
| 50 | Responsable de despiece | `singleLineText` | Texto corto |
| 51 | Es regalo | `checkbox` | Checkbox |
| 52 | Es parte recuperada | `checkbox` | Checkbox |
| 53 | Es repuesto | `checkbox` | Checkbox |
| 54 | Es uso local | `checkbox` | Checkbox |
| 55 | Fotos | `multipleAttachments` | Adjuntos |
| 56 | Evidencias | `multipleAttachments` | Adjuntos |
| 57 | Observaciones internas | `multilineText` | Texto largo |
| 58 | Observación para venta | `multilineText` | Texto largo |
| 59 | Fecha de registro | `dateTime` | Fecha/hora (iso) |
| 60 | Registrado por | `singleLineText` | Texto corto |
| 61 | Última actualización | `dateTime` | Fecha/hora (iso) |
| 62 | Actualizado por | `singleLineText` | Texto corto |
| 63 | Legacy Item ID | `singleLineText` | Texto corto |
| 64 | Legacy Pago ID | `singleLineText` | Texto corto |
| 65 | Legacy Packing ID | `singleLineText` | Texto corto |
| 66 | Fuente de migración | `singleLineText` | Texto corto |
| 67 | Estado de migración | `singleSelect` | Select: No aplica, No migrado, Pendiente de revisión, Listo para migrar, Migrado, Migrado con observaciones +2 |
| 68 | Shipping Pagos (Items relacionados) | `multipleRecordLinks` | Vínculo → **Shipping Pagos** |
| 69 | Shipping Pagos (Regalos incluidos) | `multipleRecordLinks` | Vínculo → **Shipping Pagos** |
| 70 | Shipping Packings | `multipleRecordLinks` | Vínculo → **Shipping Packings** |
| 71 | Shipping Recepciones | `multipleRecordLinks` | Vínculo → **Shipping Recepciones** |
| 72 | Shipping Novedades | `multipleRecordLinks` | Vínculo → **Shipping Novedades** |
| 73 | Shipping Migraciones | `multipleRecordLinks` | Vínculo → **Shipping Migraciones** |
| 74 | Shipping Eventos | `multipleRecordLinks` | Vínculo → **Shipping Eventos** |
| 75 | Método de asignación SKU | `singleSelect` | Select: Usado desde proveedor, Generado automáticamente, Generado por duplicado, Asignado manualmente, Migrado, No migrado +1 |
| 76 | SKU proveedor fue usado como interno | `checkbox` | Checkbox |
| 77 | SKU duplicado detectado | `checkbox` | Checkbox |
| 78 | SKU original sugerido | `singleLineText` | Texto corto |
| 79 | Modo logístico | `singleSelect` | Select: No aplica, Crear packing individual, Pendiente de packing, Tracking directo, Asignar a packing existente |
| 80 | Arancel Packing | `multipleLookupValues` | multipleLookupValues |
| 81 | Flete Packing | `multipleLookupValues` | multipleLookupValues |
| 82 | Otros costos Packing | `multipleLookupValues` | multipleLookupValues |
| 83 | Regla distribución Packing | `multipleLookupValues` | multipleLookupValues |
| 84 | Revisado física/técnicamente | `checkbox` | Checkbox |
| 85 | Revisado por | `singleLineText` | Texto corto |
| 86 | Fecha revisión | `dateTime` | Fecha/hora (us) |
| 87 | Fotos tomadas | `checkbox` | Checkbox |
| 88 | Fotos tomadas por | `singleLineText` | Texto corto |
| 89 | Fecha fotos | `dateTime` | Fecha/hora (us) |
| 90 | Shopify publicado | `checkbox` | Checkbox |
| 91 | Shopify publicado por | `singleLineText` | Texto corto |
| 92 | Fecha Shopify publicado | `dateTime` | Fecha/hora (us) |
| 93 | Marketplace publicado | `checkbox` | Checkbox |
| 94 | Marketplace publicado por | `singleLineText` | Texto corto |
| 95 | Fecha Marketplace publicado | `dateTime` | Fecha/hora (us) |
| 96 | Mercado Libre publicado | `checkbox` | Checkbox |
| 97 | Mercado Libre publicado por | `singleLineText` | Texto corto |
| 98 | Fecha Mercado Libre publicado | `dateTime` | Fecha/hora (us) |
| 99 | Grupos Facebook publicado | `checkbox` | Checkbox |
| 100 | Facebook publicado por | `singleLineText` | Texto corto |
| 101 | Fecha Facebook publicado | `dateTime` | Fecha/hora (us) |
| 102 | Observación recepción | `multilineText` | Texto largo |
| 103 | Ficha técnica generada por | `singleLineText` | Texto corto |
| 104 | Marca ficha | `singleLineText` | Texto corto |
| 105 | Modelo ficha | `singleLineText` | Texto corto |
| 106 | Sistema operativo | `singleSelect` | Select: Windows 11 Pro, Windows 11 Home, Windows 10 Pro, Windows 10 Home, ChromeOS, macOS +4 |
| 107 | Pantalla tamaño | `singleSelect` | Select: No aplica, 10.1", 10.8", 11.6", 12", 12.1" +12 |
| 108 | Pantalla resolución | `singleSelect` | Select: No aplica, 1366x768 (HD), 1600x900 (HD+), 1920x1080 (FHD), 1920x1200 (FHD+), 2160x1440 (2K) +9 |
| 109 | CPU marca | `singleSelect` | Select: Intel, AMD, Apple, Qualcomm, Otro |
| 110 | CPU modelo | `singleLineText` | Texto corto |
| 111 | CPU frecuencia base | `singleLineText` | Texto corto |
| 112 | CPU frecuencia turbo | `singleLineText` | Texto corto |
| 113 | RAM capacidad | `singleSelect` | Select: 2GB, 4GB, 6GB, 8GB, 12GB, 16GB +5 |
| 114 | RAM tipo | `singleSelect` | Select: DDR3, DDR3L, DDR4, DDR5, LPDDR3, LPDDR4 +5 |
| 115 | Almacenamiento principal | `singleLineText` | Texto corto |
| 116 | Almacenamiento tipo | `singleSelect` | Select: SSD, M.2 SSD, NVMe SSD, HDD, eMMC, Fusion Drive +3 |
| 117 | GPU | `singleLineText` | Texto corto |
| 118 | Batería salud % | `number` | Número (precision=0) |
| 119 | Batería estado | `singleSelect` | Select: No aplica, Excelente, Muy buena, Buena / Aceptable, Regular / Requiere Servicio, Mala / Agotada |
| 120 | Conectividad | `multipleSelects` | Multi-select: Wi-Fi, Bluetooth, Ethernet, SIM Slot, LTE-GSM |
| 121 | Puertos | `multipleSelects` | Multi-select: USB 2.0, USB 3.0, USB-C, Thunderbolt, Thunderbolt 2, Thunderbolt 3 USB-C +15 |
| 122 | Características extras | `multipleSelects` | Multi-select: Cámara, Micrófono, Teclado retroiluminado, Teclado RGB, Pantalla táctil, Pantalla OLED +8 |
| 123 | Observación ficha técnica | `multilineText` | Texto largo |
| 124 | Ficha técnica generada | `checkbox` | Checkbox |
| 125 | Ficha técnica revisada | `checkbox` | Checkbox |
| 126 | Ficha técnica revisada por | `singleLineText` | Texto corto |
| 127 | Fecha ficha técnica revisada | `dateTime` | Fecha/hora (us) |
| 128 | Fecha ficha técnica generada | `dateTime` | Fecha/hora (us) |
| 129 | Conectividad V2 | `multipleRecordLinks` | Vínculo → **Catálogo Conectividad** |
| 130 | Puertos V2 | `multipleRecordLinks` | Vínculo → **Catálogo Puertos** |
| 131 | Características extras V2 | `multipleRecordLinks` | Vínculo → **Catálogo Características Extras** |
| 132 | Shipping Destinatarios | `multipleRecordLinks` | Vínculo → **Shipping Destinatarios** |

**Campos no migrables:**

- `Total costo proveedor Packing` (rollup): rollup — depende de links locales
- `Costo flete asignado` (formula): fórmula — revisar referencias a campos locales
- `Costo arancel asignado` (formula): fórmula — revisar referencias a campos locales
- `Otros costos asignados` (formula): fórmula — revisar referencias a campos locales
- `Costo logístico asignado` (formula): fórmula — revisar referencias a campos locales
- `Costo total unidad` (formula): fórmula — revisar referencias a campos locales

**Registros de muestra (PII enmascarado):**

```
id: rec3CwvXmJg8YOaDm
  Actualizado por: Alexis Bolaños
  Costo total unidad: 139
  Regla distribución Packing: ['No definida']
  Shipping Eventos: ['recb06U2crwkBiEy6', 'recMt70kbNc5jX9sX', 'recJ2irOV1jxbph17']
  Total costo proveedor Packing: 1593
  Modo logístico: Asignar a packing existente
  Costo proveedor: 139
  SKU: DES-000001
  Cantidad items Packing: [10]
  Costo logístico asignado: 0
```

```
id: rec58z7IQQHo580lS
  Actualizado por: Alexis Bolaños
  Costo total unidad: 230
  Regla distribución Packing: ['No definida']
  Shipping Eventos: ['rec6o3QsW3x7DSwIt', 'recVQvZCyzSx5INyK']
  Total costo proveedor Packing: 2062
  Modo logístico: Asignar a packing existente
  Costo proveedor: 230
  SKU: LAP-000019
  Cantidad items Packing: [10]
  Costo logístico asignado: 0
```

```
id: rec9KEnryhBnnIg9y
  Actualizado por: Alexis Bolaños
  Costo total unidad: 167
  Regla distribución Packing: ['No definida']
  Shipping Eventos: ['recqVAogx99k6ny50', 'reco4vScZHPv6midK']
  Total costo proveedor Packing: 2062
  Modo logístico: Asignar a packing existente
  Costo proveedor: 167
  SKU: LAP-000023
  Cantidad items Packing: [10]
  Costo logístico asignado: 0
```

---

### Shipping Pagos

- **ID**: `tbl7dSFGRM3tzB4yB`
- **Registros**: 2
- **Campo primario**: Pago ID
- **Total campos**: 28

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Pago ID | `singleLineText` | Texto corto |
| 2 | Estado Pago | `singleSelect` | Select: Borrador, Pendiente, Parcial, Pagado, En revisión, Anulado |
| 3 | Proveedor | `multipleRecordLinks` | Vínculo → **Shipping Proveedores**  _(1:1)_ |
| 4 | Items relacionados | `multipleRecordLinks` | Vínculo → **Shipping Items** |
| 5 | Total a pagar | `currency` | Moneda ($, precision=2) |
| 6 | Total pagado | `currency` | Moneda ($, precision=2) |
| 7 | Saldo pendiente | `currency` | Moneda ($, precision=2) |
| 8 | Regalos incluidos | `multipleRecordLinks` | Vínculo → **Shipping Items** |
| 9 | Fecha de creación | `dateTime` | Fecha/hora (us) |
| 10 | Fecha de vencimiento sugerida | `date` | Fecha (local) |
| 11 | Fecha real de pago | `dateTime` | Fecha/hora (us) |
| 12 | Método de pago | `singleSelect` | Select: Transferencia bancaria, PayPal, Efectivo, Tarjeta, Depósito, Otro +1 |
| 13 | Cuenta origen | `singleSelect` | Select: Tarjeta C. Pichincha, Tarjeta D. Supe Geek , Tarjeta C. Pacificard, Tarjeta C. Produbanco, Caja, PayPal +2 |
| 14 | Transacción ID | `singleLineText` | Texto corto |
| 15 | Comprobante | `multipleAttachments` | Adjuntos |
| 16 | Factura proveedor | `multipleAttachments` | Adjuntos |
| 17 | Observación | `multilineText` | Texto largo |
| 18 | Registrado por | `singleLineText` | Texto corto |
| 19 | Pagado por | `singleLineText` | Texto corto |
| 20 | Fecha de anulación | `dateTime` | Fecha/hora (us) |
| 21 | Motivo de anulación | `multilineText` | Texto largo |
| 22 | Estado de integración con Finanzas | `singleSelect` | Select: No aplica, Pendiente de generar, Pendiente de sincronizar, Sincronizado, Error, Anulado |
| 23 | Legacy Pago ID | `singleLineText` | Texto corto |
| 24 | Fuente de migración | `singleLineText` | Texto corto |
| 25 | Estado de migración | `singleSelect` | Select: No aplica, No migrado, Pendiente de revisión, Listo para migrar, Migrado, Migrado con observaciones +2 |
| 26 | Shipping Finanzas Movimientos | `multipleRecordLinks` | Vínculo → **Shipping Finanzas Movimientos** |
| 27 | Shipping Migraciones | `multipleRecordLinks` | Vínculo → **Shipping Migraciones** |
| 28 | Shipping Eventos | `multipleRecordLinks` | Vínculo → **Shipping Eventos** |

**Registros de muestra (PII enmascarado):**

```
id: recE1PoPW2DYEmIRJ
  Cuenta origen: PayPal
  Fecha real de pago: 2026-06-22T19:02:00.000Z
  Registrado por: Alexis Bolaños
  Proveedor: ['recyEdbbzp4FWGZ3g']
  Transacción ID: 1R711828GK532092A
  Observación: Orden 6773 3R
  Items relacionados: ['rec9KEnryhBnnIg9y', 'recg0KClOSswGOZkD', 'recu0bmeCE1TKv2km', 'recd0HkFnoSMPyjZQ', 'recsQK1bwUvKFZzQ8', 'recQTjpVkbIclenUn', 'rec58z7IQQHo580lS', 'recuv0RJGTHZdIt6W', 'recTcN5gWXF5zLGTo', 'recRzBxxZHlJFVvKg']
  Pago ID: PAY-20260622-25658
  Método de pago: PayPal
  Estado de integración con Finanzas: Pendiente de sincronizar
```

```
id: recLZ01DssCruLdDK
  Cuenta origen: PayPal
  Fecha real de pago: 2026-06-10T20:31:00.000Z
  Registrado por: Alexis Bolaños
  Proveedor: ['recyEdbbzp4FWGZ3g']
  Transacción ID: 8BX92922G2028010N
  Observación: Pedido 1 Junio 3R
  Items relacionados: ['recxaaFVDxu3L1BsE', 'recujHfHxioUM9wGT', 'recS6S3rP67lU2QkH', 'recI0OPRCL6qitUtP', 'recPNAYpRH4neXPqk', 'recGpQZEiBvc5ZwUq', 'recjFnh6s9xSfodsK', 'recgawXSHTHe3kOAF', 'recGKsSSm1Xo4cRam', 'recw8jgV52LVk8BXK', 'recfB0FeYUVCs2Rux', 'recW7iRE7AeyY8ZGH', 'recNvf1IcYOXwH8Un', 'recuWrlEBsp1JFumL', 'recwprm8vc6gaQesB', 'recmiv5g5dyPpyCF6', 'rect3hr6zZS3f0LPd', 'rec3CwvXmJg8YOaDm']
  Pago ID: PAY-20260610-31894
  Método de pago: Transferencia bancaria
  Estado de integración con Finanzas: Pendiente de sincronizar
```

---

### Shipping Finanzas Movimientos

- **ID**: `tbla8HwlJLOX86fQJ`
- **Registros**: 2
- **Campo primario**: Movimiento Shipping ID
- **Total campos**: 21

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Movimiento Shipping ID | `singleLineText` | Texto corto |
| 2 | Origen | `singleSelect` | Select: Shipping |
| 3 | Tipo de movimiento | `singleSelect` | Select: Egreso, Ingreso, Ajuste, No aplica |
| 4 | Estado de integración | `singleSelect` | Select: No aplica, Pendiente de generar, Pendiente de sincronizar, Sincronizado, Error, Anulado |
| 5 | Pago Shipping relacionado | `multipleRecordLinks` | Vínculo → **Shipping Pagos**  _(1:1)_ |
| 6 | Proveedor | `multipleRecordLinks` | Vínculo → **Shipping Proveedores**  _(1:1)_ |
| 7 | Monto | `currency` | Moneda ($, precision=2) |
| 8 | Fecha del movimiento | `dateTime` | Fecha/hora (us) |
| 9 | Método | `singleSelect` | Select: Transferencia bancaria, PayPal, Efectivo, Tarjeta, Depósito, Otro +1 |
| 10 | Cuenta origen | `singleSelect` | Select: Banco Pichincha, Caja, PayPal, Tarjeta, Otra, No aplica |
| 11 | Transacción ID | `singleLineText` | Texto corto |
| 12 | Comprobante | `multipleAttachments` | Adjuntos |
| 13 | Movimiento Finanzas ID futuro | `singleLineText` | Texto corto |
| 14 | Error de sincronización | `multilineText` | Texto largo |
| 15 | Fecha de sincronización | `dateTime` | Fecha/hora (us) |
| 16 | Observación | `multilineText` | Texto largo |
| 17 | Registrado por | `singleLineText` | Texto corto |
| 18 | Fecha de creación | `dateTime` | Fecha/hora (us) |
| 19 | Fecha de anulación | `dateTime` | Fecha/hora (us) |
| 20 | Motivo de anulación | `multilineText` | Texto largo |
| 21 | Shipping Eventos | `multipleRecordLinks` | Vínculo → **Shipping Eventos** |

**Registros de muestra (PII enmascarado):**

```
id: rec1VukLdR1M00BLb
  Fecha del movimiento: 2026-06-22T19:02:00.000Z
  Estado de integración: Pendiente de sincronizar
  Movimiento Shipping ID: SFM-20260622-89985
  Cuenta origen: PayPal
  Método: PayPal
  Observación: Orden 6773 3R
  Tipo de movimiento: Egreso
  Fecha de creación: 2026-06-22T19:04:49.985Z
  Pago Shipping relacionado: ['recE1PoPW2DYEmIRJ']
  Transacción ID: 1R711828GK532092A
```

```
id: rec30afZxaKoYwdBp
  Fecha del movimiento: 2026-06-10T20:31:00.000Z
  Estado de integración: Pendiente de sincronizar
  Movimiento Shipping ID: SFM-20260610-28645
  Cuenta origen: PayPal
  Método: Transferencia bancaria
  Observación: Pedido 1 Junio 3R
  Tipo de movimiento: Egreso
  Fecha de creación: 2026-06-10T20:32:08.646Z
  Pago Shipping relacionado: ['recLZ01DssCruLdDK']
  Transacción ID: 8BX92922G2028010N
```

---

### Shipping Packings

- **ID**: `tbl5xN2KtZywxsCFS`
- **Registros**: 3
- **Campo primario**: Packing ID
- **Total campos**: 42

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Packing ID | `singleLineText` | Texto corto |
| 2 | Nombre Packing | `singleLineText` | Texto corto |
| 3 | Tipo de packing | `singleSelect` | Select: Caja, Paquete, Sobre, Pallet, Lote físico, Otro |
| 4 | Estado Packing | `singleSelect` | Select: En Proceso, Cerrado, En tránsito, Recibido, En revisión, Con novedad +2 |
| 5 | Proveedor responsable | `multipleRecordLinks` | Vínculo → **Shipping Proveedores**  _(1:1)_ |
| 6 | Proveedor logístico EC | `multipleRecordLinks` | Vínculo → **Shipping Proveedores**  _(1:1)_ |
| 7 | Items incluidos | `multipleRecordLinks` | Vínculo → **Shipping Items** |
| 8 | Costo Total Items Proveedor | `rollup` | Rollup |
| 9 | Cantidad Items Packing | `count` | Count |
| 10 | Tracking USA | `singleLineText` | Texto corto |
| 11 | Transportista USA | `multipleRecordLinks` | Vínculo → **Shipping Proveedores** |
| 12 | Transportista EC | `multipleRecordLinks` | Vínculo → **Shipping Proveedores** |
| 13 | Peso | `number` | Número (precision=2) |
| 14 | Flete | `currency` | Moneda ($, precision=2) |
| 15 | Arancel | `currency` | Moneda ($, precision=2) |
| 16 | Otros costos | `currency` | Moneda ($, precision=2) |
| 17 | Regla de distribución de costos | `singleSelect` | Select: Por costo del item, Por peso, Por cantidad, Manual, No definida |
| 18 | Observación de costos | `multilineText` | Texto largo |
| 19 | Fecha de creación | `dateTime` | Fecha/hora (us) |
| 20 | Fecha de cierre | `dateTime` | Fecha/hora (us) |
| 21 | Fecha de envío | `dateTime` | Fecha/hora (us) |
| 22 | Fecha de recepción | `dateTime` | Fecha/hora (us) |
| 23 | Recibido por | `singleLineText` | Texto corto |
| 24 | Cerrado por | `singleLineText` | Texto corto |
| 25 | Enviado por | `singleLineText` | Texto corto |
| 26 | Creado por | `singleLineText` | Texto corto |
| 27 | Evidencias | `multipleAttachments` | Adjuntos |
| 28 | Comprobante flete / arancel | `multipleAttachments` | Adjuntos |
| 29 | Observaciones | `multilineText` | Texto largo |
| 30 | Motivo de cancelación | `multilineText` | Texto largo |
| 31 | Fecha de cancelación | `dateTime` | Fecha/hora (us) |
| 32 | Legacy Packing ID | `singleLineText` | Texto corto |
| 33 | Fuente de migración | `singleLineText` | Texto corto |
| 34 | Estado de migración | `singleSelect` | Select: No aplica, No migrado, Pendiente de revisión, Listo para migrar, Migrado, Migrado con observaciones +2 |
| 35 | Shipping Recepciones | `multipleRecordLinks` | Vínculo → **Shipping Recepciones** |
| 36 | Shipping Novedades | `multipleRecordLinks` | Vínculo → **Shipping Novedades** |
| 37 | Shipping Migraciones | `multipleRecordLinks` | Vínculo → **Shipping Migraciones** |
| 38 | Shipping Eventos | `multipleRecordLinks` | Vínculo → **Shipping Eventos** |
| 39 | Tracking EC | `singleLineText` | Texto corto |
| 40 | Factura | `multipleAttachments` | Adjuntos |
| 41 | Shipping Destinatarios | `multipleRecordLinks` | Vínculo → **Shipping Destinatarios** |
| 42 | Orden referencia | `singleLineText` | Texto corto |

**Campos no migrables:**

- `Costo Total Items Proveedor` (rollup): rollup — depende de links locales
- `Cantidad Items Packing` (count): count — depende de links locales

**Registros de muestra (PII enmascarado):**

```
id: rec7Zt3dePXAoVe19
  Fecha de cierre: 2026-06-10T20:42:16.230Z
  Observaciones: Proveedor despacha en 2 cajas el pedido del 1 de junio.
  Fecha de envío: 2026-06-10T20:42:31.476Z
  Tracking EC: UIO138A195950
  Enviado por: Alexis Bolaños
  Tipo de packing: Caja
  Peso: 24.06
  Tracking USA: 1ZY5F8364299671377
  Creado por: Alexis Bolaños
  Arancel: 0
```

```
id: recWhx2zjtDa5r9Dp
  Fecha de cierre: 2026-06-10T20:44:15.399Z
  Fecha de envío: 2026-06-10T20:44:18.988Z
  Tracking EC: UIO138A195949
  Enviado por: Alexis Bolaños
  Tipo de packing: Caja
  Peso: 21.56
  Tracking USA: 1ZY5F8364299954580
  Creado por: Alexis Bolaños
  Arancel: 0
  Transportista USA: ['recmhWtoFyAMVRwGI']
```

```
id: recw82fg2NfMNYs9B
  Fecha de cierre: 2026-06-22T19:07:02.697Z
  Fecha de envío: 2026-06-22T19:08:58.163Z
  Enviado por: Alexis Bolaños
  Tipo de packing: Caja
  Tracking USA: 1ZY5F8364298596899
  Creado por: Alexis Bolaños
  Arancel: 0
  Transportista USA: ['recmhWtoFyAMVRwGI']
  Fecha de creación: 2026-06-22T19:05:56.756Z
  Shipping Eventos: ['rec9lzfl0UvATtRkC', 'rec0B1yVQg8X23Rcy', 'reczw1Vo8MhOU668u', 'rec25kAbgXpzUsMn4', 'recl9hgBMz5Th4NCc', 'recE703VJSem9Ywbu', 'reci1xhlk6T3kbPm8', 'rec1gR1fYObXbyAnG', 'recfiCDZIQLngMNXh', 'recegFBYioYC4sGxd', 'reciPGXfbHovezGON', 'recnBR1JTz2rhFpvI', 'recXunEN56IAe2ge0', 'recWQU8ipnGuvtWyU', 'recuTd57JCiJVakfb', 'rec1xdNP9jUlvQzQI', 'rec9iXVj5xU6US1rC', 'recyCKE0epA6H1k8o']
```

---

### Shipping Recepciones

- **ID**: `tbltlDvs9vK5CbxtX`
- **Registros**: 0
- **Campo primario**: Recepción ID
- **Total campos**: 21

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Recepción ID | `singleLineText` | Texto corto |
| 2 | Estado Recepción | `singleSelect` | Select: Pendiente de recepción, Recibido pendiente de revisión, Recibido correctamente, Faltante, Dañado, Incompleto +3 |
| 3 | Packing relacionado | `multipleRecordLinks` | Vínculo → **Shipping Packings**  _(1:1)_ |
| 4 | Item revisado | `multipleRecordLinks` | Vínculo → **Shipping Items**  _(1:1)_ |
| 5 | Proveedor responsable | `multipleRecordLinks` | Vínculo → **Shipping Proveedores**  _(1:1)_ |
| 6 | Fecha de recepción | `dateTime` | Fecha/hora (us) |
| 7 | Fecha de revisión | `dateTime` | Fecha/hora (us) |
| 8 | Recibido por | `singleLineText` | Texto corto |
| 9 | Revisado por | `singleLineText` | Texto corto |
| 10 | Resultado de revisión | `singleSelect` | Select: Correcto, Faltante, Dañado, Incompleto, Diferente al comprado, Garantía +2 |
| 11 | Decisión final | `singleSelect` | Select: Pasar a disponible, Pasar a repuesto, Pasar a uso local, Crear novedad, Enviar a garantía, Destinar a partes +2 |
| 12 | Observación de recepción | `multilineText` | Texto largo |
| 13 | Observación de revisión | `multilineText` | Texto largo |
| 14 | Evidencias | `multipleAttachments` | Adjuntos |
| 15 | Fotos recepción | `multipleAttachments` | Adjuntos |
| 16 | Fecha de creación | `dateTime` | Fecha/hora (us) |
| 17 | Registrado por | `singleLineText` | Texto corto |
| 18 | Última actualización | `dateTime` | Fecha/hora (us) |
| 19 | Actualizado por | `singleLineText` | Texto corto |
| 20 | Novedad relaciondad | `multipleRecordLinks` | Vínculo → **Shipping Novedades** |
| 21 | Shipping Eventos | `multipleRecordLinks` | Vínculo → **Shipping Eventos** |

*(sin registros)*

---

### Shipping Novedades

- **ID**: `tblEMSkWkShYyrfkT`
- **Registros**: 0
- **Campo primario**: Novedad ID
- **Total campos**: 27

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Novedad ID | `singleLineText` | Texto corto |
| 2 | Tipo de novedad | `singleSelect` | Select: Faltante, Dañado, Incompleto, Diferente al comprado, Garantía, Reclamo +5 |
| 3 | Estado Novedad | `singleSelect` | Select: Abierta, En revisión interna, Enviada a proveedor, Esperando respuesta, Respondida por proveedor, En solución +4 |
| 4 | Item relacionado | `multipleRecordLinks` | Vínculo → **Shipping Items**  _(1:1)_ |
| 5 | Packing relacionado | `multipleRecordLinks` | Vínculo → **Shipping Packings**  _(1:1)_ |
| 6 | Recepción relacionada | `multipleRecordLinks` | Vínculo → **Shipping Recepciones**  _(1:1)_ |
| 7 | Proveedor responsable | `multipleRecordLinks` | Vínculo → **Shipping Proveedores**  _(1:1)_ |
| 8 | Descripción | `multilineText` | Texto largo |
| 9 | Evidencias | `multipleAttachments` | Adjuntos |
| 10 | Fecha de registro | `dateTime` | Fecha/hora (us) |
| 11 | Registrado por | `singleLineText` | Texto corto |
| 12 | Fecha enviada a proveedor | `dateTime` | Fecha/hora (us) |
| 13 | Mensaje enviado al proveedor | `multilineText` | Texto largo |
| 14 | Respuesta del proveedor | `multilineText` | Texto largo |
| 15 | Fecha de respuesta del proveedor | `dateTime` | Fecha/hora (us) |
| 16 | Solución | `singleSelect` | Select: Reembolso, Reemplazo, Crédito, Aceptado sin garantía, Aceptado con observación, Descuento +2 |
| 17 | Descripción de solución | `multilineText` | Texto largo |
| 18 | Fecha de cierre | `dateTime` | Fecha/hora (us) |
| 19 | Cerrado por | `singleLineText` | Texto corto |
| 20 | Observación final | `multilineText` | Texto largo |
| 21 | Monto reclamado | `currency` | Moneda ($, precision=2) |
| 22 | Monto recuperado | `currency` | Moneda ($, precision=2) |
| 23 | Comprobante de solución | `multipleAttachments` | Adjuntos |
| 24 | Prioridad | `singleSelect` | Select: Baja, Media, Alta, Crítica |
| 25 | Última actualización | `dateTime` | Fecha/hora (us) |
| 26 | Actualizado por | `singleLineText` | Texto corto |
| 27 | Shipping Eventos | `multipleRecordLinks` | Vínculo → **Shipping Eventos** |

*(sin registros)*

---

### Shipping Migraciones

- **ID**: `tblS7OiyJaLUZhlDM`
- **Registros**: 0
- **Campo primario**: Migración ID
- **Total campos**: 25

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Migración ID | `singleLineText` | Texto corto |
| 2 | Estado Migración | `singleSelect` | Select: No migrado, Pendiente de revisión, Listo para migrar, Migrado, Migrado con observaciones, Error de migración +1 |
| 3 | Fuente de migración | `singleSelect` | Select: Item antiguo, Pago antiguo, Packing antiguo, Proveedor antiguo, Importación manual, CSV +1 |
| 4 | Legacy Item ID | `singleLineText` | Texto corto |
| 5 | Legacy Pago ID | `singleLineText` | Texto corto |
| 6 | Legacy Packing ID | `singleLineText` | Texto corto |
| 7 | Legacy Proveedor ID | `singleLineText` | Texto corto |
| 8 | Registro Item V2 creado | `multipleRecordLinks` | Vínculo → **Shipping Items**  _(1:1)_ |
| 9 | Registro Pago V2 creado | `multipleRecordLinks` | Vínculo → **Shipping Pagos**  _(1:1)_ |
| 10 | Registro Packing V2 creado | `multipleRecordLinks` | Vínculo → **Shipping Packings**  _(1:1)_ |
| 11 | Registro Proveedor V2 relacionado | `multipleRecordLinks` | Vínculo → **Shipping Proveedores**  _(1:1)_ |
| 12 | Datos originales | `multilineText` | Texto largo |
| 13 | Datos transformados | `multilineText` | Texto largo |
| 14 | Observación de migración | `multilineText` | Texto largo |
| 15 | Error de migración | `multilineText` | Texto largo |
| 16 | Acción recomendada | `multilineText` | Texto largo |
| 17 | Fecha de detección | `dateTime` | Fecha/hora (us) |
| 18 | Fecha de migración | `dateTime` | Fecha/hora (us) |
| 19 | Migrado por | `singleLineText` | Texto corto |
| 20 | Revisado por | `singleLineText` | Texto corto |
| 21 | Fecha de revisión | `dateTime` | Fecha/hora (us) |
| 22 | Es duplicado | `checkbox` | Checkbox |
| 23 | Omitido por decisión administrativa | `checkbox` | Checkbox |
| 24 | Motivo de omisión | `multilineText` | Texto largo |
| 25 | Shipping Eventos | `multipleRecordLinks` | Vínculo → **Shipping Eventos** |

*(sin registros)*

---

### Shipping Eventos

- **ID**: `tblS0nSrZnRNHS3xI`
- **Registros**: 118
- **Campo primario**: Evento ID
- **Total campos**: 22

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Evento ID | `singleLineText` | Texto corto |
| 2 | Tipo de entidad | `singleSelect` | Select: Shipping Item, Shipping Proveedor, Shipping Pago, Shipping Packing, Shipping Recepción, Shipping Novedad +3 |
| 3 | Acción | `singleSelect` | Select: Creado, Actualizado, Cambio de estado, Anulado, Cancelado, Recibido +11 |
| 4 | Item relacionado | `multipleRecordLinks` | Vínculo → **Shipping Items**  _(1:1)_ |
| 5 | Proveedor relacionado | `multipleRecordLinks` | Vínculo → **Shipping Proveedores**  _(1:1)_ |
| 6 | Pago relacionado | `multipleRecordLinks` | Vínculo → **Shipping Pagos**  _(1:1)_ |
| 7 | Packing relacionado | `multipleRecordLinks` | Vínculo → **Shipping Packings**  _(1:1)_ |
| 8 | Recepción relacionada | `multipleRecordLinks` | Vínculo → **Shipping Recepciones**  _(1:1)_ |
| 9 | Novedad relacionada | `multipleRecordLinks` | Vínculo → **Shipping Novedades**  _(1:1)_ |
| 10 | Movimiento Finanzas relacionado | `multipleRecordLinks` | Vínculo → **Shipping Finanzas Movimientos**  _(1:1)_ |
| 11 | Migración relacionada | `multipleRecordLinks` | Vínculo → **Shipping Migraciones**  _(1:1)_ |
| 12 | Estado anterior | `singleLineText` | Texto corto |
| 13 | Estado nuevo | `singleLineText` | Texto corto |
| 14 | Descripción del evento | `multilineText` | Texto largo |
| 15 | Observación | `multilineText` | Texto largo |
| 16 | Registrado por | `singleLineText` | Texto corto |
| 17 | Fecha del evento | `dateTime` | Fecha/hora (local) |
| 18 | Datos relevantes | `multilineText` | Texto largo |
| 19 | Requiere revisión administrativa | `checkbox` | Checkbox |
| 20 | Revisado por | `singleLineText` | Texto corto |
| 21 | Fecha de revisión | `dateTime` | Fecha/hora (local) |
| 22 | Resultado de revisión | `singleSelect` | Select: Pendiente, Aprobado, Rechazado, Corregido, No aplica |

**Registros de muestra (PII enmascarado):**

```
id: rec0B1yVQg8X23Rcy
  Tipo de entidad: Shipping Packing
  Fecha del evento: 2026-06-22T19:06:05.364Z
  Packing relacionado: ['recw82fg2NfMNYs9B']
  Descripción del evento: 1 item(s) agregado(s) al packing.
  Acción: Actualizado
  Registrado por: Alexis Bolaños
```

```
id: rec0W8nyS7vnjyGYc
  Tipo de entidad: Shipping Item
  Fecha del evento: 2026-06-22T18:47:48.948Z
  Descripción del evento: Fotos agregadas al Item.
  Acción: Actualizado
  Datos relevantes: Dell XPS 13 9310 13" Touchscreen Core i7-1165G7 256GB 8GB B Windows 11 Pro
  Item relacionado: ['recuv0RJGTHZdIt6W']
  Registrado por: Alexis Bolaños
```

```
id: rec0hz7QnkaotDJ84
  Tipo de entidad: Shipping Item
  Fecha del evento: 2026-06-10T19:57:33.372Z
  Descripción del evento: Fotos agregadas al Item.
  Acción: Actualizado
  Datos relevantes: Lenovo ThinkPad P1 Gen 3 15.6" Core i7-10750H 1TB 32GB B T2000
  Item relacionado: ['recS6S3rP67lU2QkH']
  Registrado por: Alexis Bolaños
```

---

### Catálogo CPUs

- **ID**: `tblwc7IgyDaLbwrb3`
- **Registros**: 114
- **Campo primario**: CPU modelo
- **Total campos**: 13

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | CPU modelo | `singleLineText` | Texto corto |
| 2 | CPU marca | `singleSelect` | Select: Intel, AMD, Apple, Qualcomm, Otro, CPU marca |
| 3 | Frecuencia base | `singleLineText` | Texto corto |
| 4 | Frecuencia turbo | `singleLineText` | Texto corto |
| 5 | Frecuencia original | `singleLineText` | Texto corto |
| 6 | RAM tipo sugerida | `singleSelect` | Select: DDR3, DDR3L, DDR4, DDR5, LPDDR3, LPDDR4 +6 |
| 7 | GPU integrada | `singleLineText` | Texto corto |
| 8 | Fuente nombre | `singleLineText` | Texto corto |
| 9 | Fuente | `url` | URL |
| 10 | Verificado | `checkbox` | Checkbox |
| 11 | Veces usado | `number` | Número (precision=0) |
| 12 | Última revisión | `dateTime` | Fecha/hora (us) |
| 13 | Observaciones | `multilineText` | Texto largo |

**Registros de muestra (PII enmascarado):**

```
id: rec15nY0Snf9s8hAa
  Frecuencia original: 1.10-2.80
  Frecuencia base: 1.10GHz
  CPU marca: Intel
  Veces usado: 1
  Frecuencia turbo: 2.80GHz
  RAM tipo sugerida: DDR4
  Fuente nombre: LA***K
  CPU modelo: Celeron N5100
```

```
id: rec1NCgsy48A5agVM
  Frecuencia original: 2.00-3.00
  Frecuencia base: 2.00GHz
  CPU marca: Intel
  Veces usado: 1
  Frecuencia turbo: 3.00GHz
  RAM tipo sugerida: DDR3
  Fuente nombre: LA***K
  CPU modelo: Core i5-4590T
```

```
id: rec1Z7dDkM0hljwJv
  Frecuencia original: 2.30-4.00
  Frecuencia base: 2.30GHz
  CPU marca: AMD
  Veces usado: 2
  Frecuencia turbo: 4.00GHz
  RAM tipo sugerida: DDR4
  Fuente nombre: LA***K
  CPU modelo: Ryzen 5 4500U
```

---

### Catálogo Computadores

- **ID**: `tblXqQ9mRiUwpEo7I`
- **Registros**: 185
- **Campo primario**: Modelo computador
- **Total campos**: 19

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Modelo computador | `singleLineText` | Texto corto |
| 2 | Marca | `singleSelect` | Select: ACEPC, ASUS, Acer, Apple, Asus ROG, Azulle +12 |
| 3 | Pantalla tamaño sugerida | `singleSelect` | Select: No aplica, 10", 10.3", 10.8", 11.6", 12.2" +13 |
| 4 | Pantalla resolución sugerida | `singleSelect` | Select: No aplica, 1366x768 (HD), 1440x900, 1600x900 (HD+), 1800x1200, 1920x1080 (FHD) +10 |
| 5 | Sistema operativo sugerido | `singleSelect` | Select: Windows 11 Pro, Windows 11 Home, Windows 10 Pro, Windows 10 Home, Windows 10 miniOS, ChromeOS +10 |
| 6 | Conectividad sugerida | `multipleSelects` | Multi-select: Wi-Fi, Bluetooth, Ethernet, SIM Slot, LTE-GSM |
| 7 | Puertos sugeridos | `multipleSelects` | Multi-select: USB 2.0, USB 3.0, USB-C, Thunderbolt, Thunderbolt 2, Thunderbolt 3 USB-C +16 |
| 8 | Características extras sugeridas | `multipleSelects` | Multi-select: Cámara, Micrófono, Teclado retroiluminado, Teclado RGB, Pantalla táctil, Pantalla OLED +8 |
| 9 | Batería aplica | `singleSelect` | Select: Sí, No, No especificado, Batería aplica |
| 10 | GPU sugerida | `singleLineText` | Texto corto |
| 11 | Fuente nombre | `singleLineText` | Texto corto |
| 12 | Fuente | `url` | URL |
| 13 | Verificado | `checkbox` | Checkbox |
| 14 | Veces usado | `number` | Número (precision=0) |
| 15 | Última revisión | `dateTime` | Fecha/hora (local) |
| 16 | Observaciones | `multilineText` | Texto largo |
| 17 | Conectividad sugerida V2 | `multipleRecordLinks` | Vínculo → **Catálogo Conectividad** |
| 18 | Puertos sugeridos V2 | `multipleRecordLinks` | Vínculo → **Catálogo Puertos** |
| 19 | Características extras sugeridas V2 | `multipleRecordLinks` | Vínculo → **Catálogo Características Extras** |

**Registros de muestra (PII enmascarado):**

```
id: rec0CuCIR6imIKHbp
  Fuente nombre: LA***o
  Marca: Dell
  Características extras sugeridas V2: ['rec9cKEGEGhScfpZB', 'reccA3TsgodtLPtBM', 'recxPVTl6bFoImcac']
  Modelo computador: Latitude 5501
  Conectividad sugerida: ['Bluetooth', 'Ethernet', 'SIM Slot', 'Wi-Fi']
  Conectividad sugerida V2: ['rec3ep0mVT3ofKYhB', 'recQkxYr5kjz3mQIJ', 'recwPdf8KxXL9ElrF', 'reclVEYeLifPoiv0M']
  Sistema operativo sugerido: Windows 11 Pro
  Pantalla tamaño sugerida: 15.6"
  GPU sugerida: nVidia GeForce MX150
  Pantalla resolución sugerida: 1920x1080 (FHD)
```

```
id: rec0FN5YJlifabMyF
  Fuente nombre: LA***o
  Marca: HP
  Características extras sugeridas V2: ['rec9cKEGEGhScfpZB', 'reccA3TsgodtLPtBM', 'recxPVTl6bFoImcac']
  Modelo computador: Envy 15-as152nr
  Conectividad sugerida: ['Bluetooth', 'Wi-Fi']
  Conectividad sugerida V2: ['rec3ep0mVT3ofKYhB', 'reclVEYeLifPoiv0M']
  Sistema operativo sugerido: Windows 11 Pro
  Pantalla tamaño sugerida: 15.6"
  Pantalla resolución sugerida: 3840x2160 (4K UHD)
  Características extras sugeridas: ['Cámara', 'Micrófono', 'Teclado retroiluminado']
```

```
id: rec0MAzmFZPz72zbF
  Fuente nombre: LA***o
  Marca: Lenovo
  Características extras sugeridas V2: ['rec9cKEGEGhScfpZB', 'reccA3TsgodtLPtBM', 'recxPVTl6bFoImcac']
  Modelo computador: ThinkPad T440s
  Conectividad sugerida: ['Bluetooth', 'Ethernet', 'Wi-Fi']
  Conectividad sugerida V2: ['rec3ep0mVT3ofKYhB', 'recQkxYr5kjz3mQIJ', 'reclVEYeLifPoiv0M']
  Sistema operativo sugerido: Windows 11 Pro
  Pantalla tamaño sugerida: 14"
  Pantalla resolución sugerida: 1600x900 (HD+)
  Características extras sugeridas: ['Cámara', 'Micrófono', 'Teclado retroiluminado']
```

---

### Catálogo Conectividad

- **ID**: `tblOtzLSCGAG3kCxc`
- **Registros**: 6
- **Campo primario**: Nombre
- **Total campos**: 11

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Nombre | `singleLineText` | Texto corto |
| 2 | Alias | `multilineText` | Texto largo |
| 3 | Activo | `checkbox` | Checkbox |
| 4 | Orden | `number` | Número (precision=0) |
| 5 | Descripción | `multilineText` | Texto largo |
| 6 | Creado desde Portal | `checkbox` | Checkbox |
| 7 | Fecha creación | `dateTime` | Fecha/hora (local) |
| 8 | Creado por | `singleLineText` | Texto corto |
| 9 | Observaciones | `multilineText` | Texto largo |
| 10 | Shipping Items | `multipleRecordLinks` | Vínculo → **Shipping Items** |
| 11 | Catálogo Computadores | `multipleRecordLinks` | Vínculo → **Catálogo Computadores** |

**Registros de muestra (PII enmascarado):**

```
id: rec3ep0mVT3ofKYhB
  Activo: True
  Catálogo Computadores: ['rec0CuCIR6imIKHbp', 'rec0FN5YJlifabMyF', 'rec0MAzmFZPz72zbF', 'rec0oxBm12iciTLb4', 'rec0zGvjk4Y0cjaA4', 'rec19vKup3HYDLJbL', 'rec1ODIAtTLV4IIX4', 'rec1nxeDLTQ3TxYpR', 'rec2Sz93hxu1dvULD', 'rec2XUYz0Qh7RmxtQ', 'rec2xTn4qmKF0t8ZM', 'rec3QamMA0AgEKBTX', 'rec4HSodCiSvn1E9F', 'rec4ZrdCkSlppCuTr', 'rec4ifqZrxZiCJDzh', 'rec60hGheYj7wvh68', 'rec6NiMtght1lf4qM', 'rec6WozeKhpxHFbHc', 'rec87qgc0fNiEKicH', 'rec8QeHEZ8jTnBTsk', 'rec8rUcIkNvoewD47', 'rec9PGgKImG8duJxG', 'rec9nPXizOXRsz6VI', 'recAaDnvWSrwZhNIV', 'recAkalcr9qn4K2Bs', 'recB4l1v2RjR8rIqP', 'recBYwGDOMYyT7SoK', 'recC2KExu15KQQaIX', 'recCe0m97yl3NLkKR', 'recDGYwb8aPEiIQeH', 'recDRW2w85DhjDpH1', 'recDuneWWJOVu6vnC', 'recERxtwWsMp8sfh3', 'recEpJGYiwdO892An', 'recEtkFBbMi2bbBxY', 'recHbUoJYzVlE6Qmw', 'recI6oAD5dXcojVzq', 'recI86OVdjOVT78d1', 'recIIteiF5TngBJTU', 'recIefje686SYBu4A', 'recIhVtI45pz0iYvE', 'recIiiZRbdzqq9k13', 'recJpNWnBVBXu6bjP', 'recKBmscahhADomYl', 'recKnhJklOUM2kDbx', 'recL6tY3c4WW0bJjv', 'recLXI9D5sv0MoA59', 'recLbKr5xFx4XOTIr', 'recLpkrWrPP26cbx8', 'recMuKXMVM6F9cIYD', 'recNenVIwzROfxRtM', 'recNhJV4YZXjOSLCF', 'recOGSX1jZ0OU4h4P', 'recOQje1Sivcd85dg', 'recOkZRYVsaiUSJKt', 'recOpj8rcyP7hNvL5', 'recOwQkQUyhpIfipu', 'recPOnaDy05wjFE8f', 'recPcgGUTZ0kKbY3b', 'recPgDlLRLwZpxWps', 'recQ2WYkvU0mqVxDW', 'recRFWfeAztvj8rm7', 'recRIUPItSgx2vb4e', 'recRW38L82LfelrDW', 'recRg4PQZdNCEWXQM', 'recSDilktSgI8xjXP', 'recSZn6F7IptIlhva', 'recSauiQX45vhSjEi', 'recSfHB5EecQACWIK', 'recT6fcqUCGYZfeOR', 'recTbdzRhjzR4oa1l', 'recTerWxZoRwJyUU6', 'recV6JSKOtOVmMwFC', 'recVOxC3hEk3CDetd', 'recVvSWyuU3ZvjgAN', 'recWDDlbpxa3pTTt5', 'recWFzqbqUX9wR3at', 'recWS7RutOZRPqi5R', 'recWqHHkEEeu31bLR', 'recXeypjfBZF9qWTC', 'recXf79W4Tc96YcVR', 'recYFLmalq5ChTyQn', 'recYPZ5UU5x4nCNST', 'recZ4U2i2tqqMYS96', 'recZ7DwHdmAg3x6KV', 'recZZS01DpQ4ERj3D', 'recZpGNpZjhd3Ps3o', 'reca3rHLN4WqQToCc', 'reca43M3KVCgvgwVN', 'reca9FlOTKL4tQzN5', 'recaUxbrkfCsB1LBp', 'recanKBNzgcVxx654', 'recau4fSzGeTOxPJg', 'recb3pJNUajuvvA8o', 'recbouZOEtLFEj4h2', 'reccDpgZ9GotD5iAq', 'reccSFls10ZHe8oZG', 'reccnlDpaPinSRIKm', 'recd9xHYnV0Auu1WL', 'recdUyFFF19rXgSvj', 'recduRPMqNypM2z6e', 'receEwQGRZdKyCN7G', 'receOG0ujFJF6tpgG', 'receYhorgDZ7dqg2A', 'recegyD7wI64aMfr0', 'recfDQ0L5R5Xhldp1', 'recfgpkRSVtQVCMTg', 'recfl6W4hGKmyRvSE', 'recg28w3wVhuiKOb1', 'recgB5yB0AimSKZ2i', 'recgPWJXfeZbEozcq', 'rech5Y1hERLjMiudf', 'rechA0EZFgPnRoVjp', 'rechG04IfkEQuh0B2', 'rechU2oCoyaeFIoXD', 'rechULlbZ2VqmSnMd', 'rechb7TctrAKk7Btm', 'rechcwKVmNj4hjGgy', 'rechg0ZobbipXoND6', 'reciK0l5sb02NsgiB', 'reciMQFfUe5T1NpVR', 'reciUEjSoOEIiz78R', 'reciUjXgeV826PH2H', 'reciXbAOS8GQl9nSV', 'recibWJdNIFSfAMFZ', 'reciwapphbXktl3ly', 'recjDezcNcQOxm3eQ', 'recjFk2HOySNUhVgC', 'recjz3eJzTco6MFJV', 'reck5xn5DNwyLsZAF', 'reckINrVbVEP42xNv', 'recktoe4KYOOeoZzX', 'reckvn1wOLRoR8mNX', 'reclJR0332NZBVdf2', 'recloI8PVbdPuySsW', 'recm3maMfv2av8HXj', 'recp1tKjSCmrrvk85', 'recpRqgdoFDXizqej', 'recpurJvlof2vDUSe', 'recpzIv95EsHo0ArS', 'recqEoAVD5ETpiM6T', 'recr2vglOUe5e43Up', 'recrai0KBEmrt0o2l', 'recrgEBbNjlHiVY2J', 'recrshVEuFolyiG9j', 'recrvxQZUSqt99Boa', 'recs203IHb7yd7LlF', 'recsTq0hhRFkWe2GI', 'recsaCvRN0RK2sayc', 'recsnToO9nJltAfFf', 'rectAg71rA9QJModN', 'recuBqHVr1sB4ZDGk', 'recuZR8srRCqyz9st', 'recumHBzZxg5PysrZ', 'recupZ5geLEqraPSp', 'recv73jRYw7al3xYY', 'recvFr58p4TxxSR2Q', 'recvGJFywbtPAvuDM', 'recvGkKglVzTG8Rwz', 'recvz2pDIT9egKlAv', 'recw15y2Z9JaloXnT', 'recx3V9cL04qE8aK4', 'recx6dZvRsK6AaWVl', 'recxIb1FaPH4YmDsO', 'recxlpRIsoErAvDZG', 'recyS6L0sB0DiDRg4', 'recyV0N2tWuPyvxQx', 'recya700GR7vajX4r', 'recyst72LSk7QGv6r', 'recyuGawceRdaEq2H', 'recywaO8NRiPuI6FE', 'reczL9PwRm6j2KXHA', 'reczWihIjPmcdvKtr', 'reczYUqzVhoqzG2IK', 'recze1cTrDRbYZuTh']
  Nombre: Bl***h
  Alias: Bluetooh, BT
  Orden: 2
  Descripción: Conectividad Bluetooth.
  Observaciones: Registro inicial migrado desde opciones técnicas existentes.
```

```
id: recQkxYr5kjz3mQIJ
  Activo: True
  Catálogo Computadores: ['rec0CuCIR6imIKHbp', 'rec0MAzmFZPz72zbF', 'rec1ODIAtTLV4IIX4', 'rec1nxeDLTQ3TxYpR', 'rec4HSodCiSvn1E9F', 'rec4ZrdCkSlppCuTr', 'rec4ifqZrxZiCJDzh', 'rec7QHzXIuKXXtslX', 'rec87qgc0fNiEKicH', 'rec9PGgKImG8duJxG', 'recAaDnvWSrwZhNIV', 'recB4l1v2RjR8rIqP', 'recBYwGDOMYyT7SoK', 'recC2KExu15KQQaIX', 'recDRW2w85DhjDpH1', 'recERxtwWsMp8sfh3', 'recI6oAD5dXcojVzq', 'recIIteiF5TngBJTU', 'recIcTuTzlKmVyNLy', 'recIiiZRbdzqq9k13', 'recIul52Dw7GMAvRs', 'recKnhJklOUM2kDbx', 'recL6tY3c4WW0bJjv', 'recLpkrWrPP26cbx8', 'recNhJV4YZXjOSLCF', 'recOQje1Sivcd85dg', 'recOpj8rcyP7hNvL5', 'recPOnaDy05wjFE8f', 'recPcgGUTZ0kKbY3b', 'recPgDlLRLwZpxWps', 'recRW38L82LfelrDW', 'recSDilktSgI8xjXP', 'recTerWxZoRwJyUU6', 'recV6JSKOtOVmMwFC', 'recWDDlbpxa3pTTt5', 'recWS7RutOZRPqi5R', 'recWqHHkEEeu31bLR', 'recXeypjfBZF9qWTC', 'recXf79W4Tc96YcVR', 'recYFLmalq5ChTyQn', 'recYPZ5UU5x4nCNST', 'recZ4U2i2tqqMYS96', 'recZ7DwHdmAg3x6KV', 'recZZS01DpQ4ERj3D', 'recZpGNpZjhd3Ps3o', 'recaUxbrkfCsB1LBp', 'recanKBNzgcVxx654', 'recau4fSzGeTOxPJg', 'recbouZOEtLFEj4h2', 'reccSFls10ZHe8oZG', 'recdUyFFF19rXgSvj', 'recduRPMqNypM2z6e', 'receOG0ujFJF6tpgG', 'receYhorgDZ7dqg2A', 'receehvcfiE09nVnh', 'recfDQ0L5R5Xhldp1', 'recfgpkRSVtQVCMTg', 'recg28w3wVhuiKOb1', 'recgB5yB0AimSKZ2i', 'rechG04IfkEQuh0B2', 'rechU2oCoyaeFIoXD', 'rechb7TctrAKk7Btm', 'rechcwKVmNj4hjGgy', 'reciK0l5sb02NsgiB', 'reciMQFfUe5T1NpVR', 'reciUEjSoOEIiz78R', 'reciUjXgeV826PH2H', 'recibWJdNIFSfAMFZ', 'reciwapphbXktl3ly', 'recjDezcNcQOxm3eQ', 'recjz3eJzTco6MFJV', 'reckINrVbVEP42xNv', 'recktoe4KYOOeoZzX', 'reckvn1wOLRoR8mNX', 'reclJR0332NZBVdf2', 'recloI8PVbdPuySsW', 'recm3maMfv2av8HXj', 'recpRqgdoFDXizqej', 'recpurJvlof2vDUSe', 'recrai0KBEmrt0o2l', 'recrshVEuFolyiG9j', 'recrvxQZUSqt99Boa', 'recsnToO9nJltAfFf', 'rectAg71rA9QJModN', 'recuZR8srRCqyz9st', 'recvFr58p4TxxSR2Q', 'recvGJFywbtPAvuDM', 'recw15y2Z9JaloXnT', 'recx3V9cL04qE8aK4', 'recxlpRIsoErAvDZG', 'recyV0N2tWuPyvxQx', 'recya700GR7vajX4r', 'recyst72LSk7QGv6r', 'recyuGawceRdaEq2H', 'reczYUqzVhoqzG2IK']
  Nombre: Et***t
  Alias: LAN, Lan, RJ45, Red cableada
  Orden: 3
  Descripción: Conectividad de red por cable.
  Observaciones: Registro inicial migrado desde opciones técnicas existentes.
```

```
id: recYyu7CsrTXFePQB
  Activo: True
  Nombre: In***o
  Creado desde Portal: True
  Creado por: Alexis Bolaños
  Fecha creación: 2026-06-09T16:46:10.182Z
  Orden: 6
  Observaciones: Creado desde editor de ficha técnica
```

---

### Catálogo Puertos

- **ID**: `tblpBJRuJjyY5beiS`
- **Registros**: 21
- **Campo primario**: Nombre
- **Total campos**: 11

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Nombre | `singleLineText` | Texto corto |
| 2 | Alias | `multilineText` | Texto largo |
| 3 | Activo | `checkbox` | Checkbox |
| 4 | Orden | `number` | Número (precision=0) |
| 5 | Descripción | `multilineText` | Texto largo |
| 6 | Creado desde Portal | `checkbox` | Checkbox |
| 7 | Fecha creación | `dateTime` | Fecha/hora (local) |
| 8 | Creado por | `singleLineText` | Texto corto |
| 9 | Observaciones | `multilineText` | Texto largo |
| 10 | Shipping Items | `multipleRecordLinks` | Vínculo → **Shipping Items** |
| 11 | Catálogo Computadores | `multipleRecordLinks` | Vínculo → **Catálogo Computadores** |

**Registros de muestra (PII enmascarado):**

```
id: rec09niY113qYLXbH
  Descripción: Puerto Thunderbolt 2.
  Observaciones: Registro inicial migrado desde opciones técnicas existentes.
  Nombre: Th***2
  Orden: 5
  Catálogo Computadores: ['recV6JSKOtOVmMwFC']
  Alias: TB2
  Activo: True
```

```
id: rec4iksA3T3Uj6YNh
  Descripción: Puerto Micro HDMI.
  Observaciones: Registro inicial migrado desde opciones técnicas existentes.
  Nombre: Mi***I
  Orden: 9
  Catálogo Computadores: ['reckvn1wOLRoR8mNX', 'recloI8PVbdPuySsW']
  Alias: microHDMI, Micro-HDMI
  Activo: True
```

```
id: rec8mbWcOdpctwUfr
  Descripción: Puerto de audio 3.5mm.
  Observaciones: Registro inicial migrado desde opciones técnicas existentes.
  Nombre: Au***k
  Orden: 15
  Catálogo Computadores: ['rec0CuCIR6imIKHbp', 'rec0FN5YJlifabMyF', 'rec0MAzmFZPz72zbF', 'rec0zGvjk4Y0cjaA4', 'rec19vKup3HYDLJbL', 'rec1nxeDLTQ3TxYpR', 'rec2Sz93hxu1dvULD', 'rec2XUYz0Qh7RmxtQ', 'rec2xTn4qmKF0t8ZM', 'rec4ZrdCkSlppCuTr', 'rec4ifqZrxZiCJDzh', 'rec60hGheYj7wvh68', 'rec6NiMtght1lf4qM', 'rec6WozeKhpxHFbHc', 'rec7QHzXIuKXXtslX', 'rec8QeHEZ8jTnBTsk', 'rec9PGgKImG8duJxG', 'rec9nPXizOXRsz6VI', 'recB4l1v2RjR8rIqP', 'recBYwGDOMYyT7SoK', 'recC2KExu15KQQaIX', 'recDGYwb8aPEiIQeH', 'recDRW2w85DhjDpH1', 'recDuneWWJOVu6vnC', 'recERxtwWsMp8sfh3', 'recEpJGYiwdO892An', 'recEtkFBbMi2bbBxY', 'recHbUoJYzVlE6Qmw', 'recI6oAD5dXcojVzq', 'recI86OVdjOVT78d1', 'recIIteiF5TngBJTU', 'recIcTuTzlKmVyNLy', 'recIefje686SYBu4A', 'recIhVtI45pz0iYvE', 'recIiiZRbdzqq9k13', 'recIul52Dw7GMAvRs', 'recJpNWnBVBXu6bjP', 'recKBmscahhADomYl', 'recKnhJklOUM2kDbx', 'recL6tY3c4WW0bJjv', 'recLXI9D5sv0MoA59', 'recLbKr5xFx4XOTIr', 'recMuKXMVM6F9cIYD', 'recNenVIwzROfxRtM', 'recOGSX1jZ0OU4h4P', 'recOQje1Sivcd85dg', 'recOwQkQUyhpIfipu', 'recPOnaDy05wjFE8f', 'recPgDlLRLwZpxWps', 'recQ2WYkvU0mqVxDW', 'recRFWfeAztvj8rm7', 'recRIUPItSgx2vb4e', 'recRW38L82LfelrDW', 'recRg4PQZdNCEWXQM', 'recSDilktSgI8xjXP', 'recSZn6F7IptIlhva', 'recSauiQX45vhSjEi', 'recSfHB5EecQACWIK', 'recT6fcqUCGYZfeOR', 'recTerWxZoRwJyUU6', 'recV6JSKOtOVmMwFC', 'recVOxC3hEk3CDetd', 'recWDDlbpxa3pTTt5', 'recWFzqbqUX9wR3at', 'recWS7RutOZRPqi5R', 'recWqHHkEEeu31bLR', 'recXeypjfBZF9qWTC', 'recXf79W4Tc96YcVR', 'recYFLmalq5ChTyQn', 'recYPZ5UU5x4nCNST', 'recZ4U2i2tqqMYS96', 'recZ7DwHdmAg3x6KV', 'recZZS01DpQ4ERj3D', 'recZpGNpZjhd3Ps3o', 'reca3rHLN4WqQToCc', 'reca9FlOTKL4tQzN5', 'recaUxbrkfCsB1LBp', 'recanKBNzgcVxx654', 'recau4fSzGeTOxPJg', 'recb3pJNUajuvvA8o', 'recbouZOEtLFEj4h2', 'reccSFls10ZHe8oZG', 'recd9xHYnV0Auu1WL', 'recduRPMqNypM2z6e', 'receOG0ujFJF6tpgG', 'receYhorgDZ7dqg2A', 'receehvcfiE09nVnh', 'recegyD7wI64aMfr0', 'recfDQ0L5R5Xhldp1', 'recfgpkRSVtQVCMTg', 'recfl6W4hGKmyRvSE', 'recg28w3wVhuiKOb1', 'recgB5yB0AimSKZ2i', 'recgPWJXfeZbEozcq', 'rechA0EZFgPnRoVjp', 'rechG04IfkEQuh0B2', 'rechb7TctrAKk7Btm', 'rechg0ZobbipXoND6', 'reciK0l5sb02NsgiB', 'reciMQFfUe5T1NpVR', 'reciUEjSoOEIiz78R', 'reciUjXgeV826PH2H', 'reciXbAOS8GQl9nSV', 'recibWJdNIFSfAMFZ', 'reciwapphbXktl3ly', 'recjDezcNcQOxm3eQ', 'recjFk2HOySNUhVgC', 'reckINrVbVEP42xNv', 'recktoe4KYOOeoZzX', 'reckvn1wOLRoR8mNX', 'reclJR0332NZBVdf2', 'recm3maMfv2av8HXj', 'recoXHNiQPQHsyz5B', 'recp1tKjSCmrrvk85', 'recp7FcdziDlUErWK', 'recpRqgdoFDXizqej', 'recpurJvlof2vDUSe', 'recpzIv95EsHo0ArS', 'recqEoAVD5ETpiM6T', 'recr2vglOUe5e43Up', 'recrai0KBEmrt0o2l', 'recrgEBbNjlHiVY2J', 'recrshVEuFolyiG9j', 'recs203IHb7yd7LlF', 'recsTq0hhRFkWe2GI', 'recsaCvRN0RK2sayc', 'recsnToO9nJltAfFf', 'recuBqHVr1sB4ZDGk', 'recuZR8srRCqyz9st', 'recumHBzZxg5PysrZ', 'recupZ5geLEqraPSp', 'recv73jRYw7al3xYY', 'recvFr58p4TxxSR2Q', 'recvGkKglVzTG8Rwz', 'recvz2pDIT9egKlAv', 'recw15y2Z9JaloXnT', 'recx3V9cL04qE8aK4', 'recx6dZvRsK6AaWVl', 'recxIb1FaPH4YmDsO', 'recxlpRIsoErAvDZG', 'recyS6L0sB0DiDRg4', 'recyV0N2tWuPyvxQx', 'recyuGawceRdaEq2H', 'recywaO8NRiPuI6FE', 'reczL9PwRm6j2KXHA', 'reczWihIjPmcdvKtr', 'reczYUqzVhoqzG2IK', 'recze1cTrDRbYZuTh']
  Alias: Jack, Audio, 3.5mm, Jack 3.5mm, Headphone Jack
  Activo: True
```

---

### Catálogo Características Extras

- **ID**: `tblIbgM5pzsX2WIpf`
- **Registros**: 13
- **Campo primario**: Nombre
- **Total campos**: 11

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Nombre | `singleLineText` | Texto corto |
| 2 | Alias | `multilineText` | Texto largo |
| 3 | Activo | `checkbox` | Checkbox |
| 4 | Orden | `number` | Número (precision=0) |
| 5 | Descripción | `multilineText` | Texto largo |
| 6 | Creado desde Portal | `checkbox` | Checkbox |
| 7 | Fecha creación | `dateTime` | Fecha/hora (local) |
| 8 | Creado por | `singleLineText` | Texto corto |
| 9 | Observaciones | `multilineText` | Texto largo |
| 10 | Shipping Items | `multipleRecordLinks` | Vínculo → **Shipping Items** |
| 11 | Catálogo Computadores | `multipleRecordLinks` | Vínculo → **Catálogo Computadores** |

**Registros de muestra (PII enmascarado):**

```
id: rec9cKEGEGhScfpZB
  Descripción: Cámara integrada.
  Activo: True
  Orden: 1
  Nombre: Cá***a
  Catálogo Computadores: ['rec0CuCIR6imIKHbp', 'rec0FN5YJlifabMyF', 'rec0MAzmFZPz72zbF', 'rec0oxBm12iciTLb4', 'rec0zGvjk4Y0cjaA4', 'rec19vKup3HYDLJbL', 'rec1ODIAtTLV4IIX4', 'rec1nxeDLTQ3TxYpR', 'rec2Sz93hxu1dvULD', 'rec2XUYz0Qh7RmxtQ', 'rec2xTn4qmKF0t8ZM', 'rec3QamMA0AgEKBTX', 'rec4ifqZrxZiCJDzh', 'rec6NiMtght1lf4qM', 'rec6WozeKhpxHFbHc', 'rec8QeHEZ8jTnBTsk', 'rec8rUcIkNvoewD47', 'rec9PGgKImG8duJxG', 'rec9nPXizOXRsz6VI', 'recB4l1v2RjR8rIqP', 'recBYwGDOMYyT7SoK', 'recC2KExu15KQQaIX', 'recCe0m97yl3NLkKR', 'recDGYwb8aPEiIQeH', 'recDRW2w85DhjDpH1', 'recDuneWWJOVu6vnC', 'recERxtwWsMp8sfh3', 'recEpJGYiwdO892An', 'recEtkFBbMi2bbBxY', 'recHbUoJYzVlE6Qmw', 'recI6oAD5dXcojVzq', 'recI86OVdjOVT78d1', 'recIIteiF5TngBJTU', 'recIefje686SYBu4A', 'recIhVtI45pz0iYvE', 'recJpNWnBVBXu6bjP', 'recKBmscahhADomYl', 'recKnhJklOUM2kDbx', 'recLXI9D5sv0MoA59', 'recLbKr5xFx4XOTIr', 'recLpkrWrPP26cbx8', 'recMuKXMVM6F9cIYD', 'recNenVIwzROfxRtM', 'recNhJV4YZXjOSLCF', 'recOGSX1jZ0OU4h4P', 'recOQje1Sivcd85dg', 'recOkZRYVsaiUSJKt', 'recOpj8rcyP7hNvL5', 'recOtFnMr0xrkboUW', 'recOwQkQUyhpIfipu', 'recPOnaDy05wjFE8f', 'recPcgGUTZ0kKbY3b', 'recPgDlLRLwZpxWps', 'recQ2WYkvU0mqVxDW', 'recRFWfeAztvj8rm7', 'recRIUPItSgx2vb4e', 'recRW38L82LfelrDW', 'recRg4PQZdNCEWXQM', 'recSDilktSgI8xjXP', 'recSZn6F7IptIlhva', 'recSauiQX45vhSjEi', 'recSfHB5EecQACWIK', 'recT6fcqUCGYZfeOR', 'recTbdzRhjzR4oa1l', 'recV6JSKOtOVmMwFC', 'recVOxC3hEk3CDetd', 'recVvSWyuU3ZvjgAN', 'recWDDlbpxa3pTTt5', 'recWFzqbqUX9wR3at', 'recWqHHkEEeu31bLR', 'recXeypjfBZF9qWTC', 'recXf79W4Tc96YcVR', 'recYFLmalq5ChTyQn', 'recZ4U2i2tqqMYS96', 'recZ7DwHdmAg3x6KV', 'recZZS01DpQ4ERj3D', 'recZpGNpZjhd3Ps3o', 'reca3rHLN4WqQToCc', 'reca43M3KVCgvgwVN', 'reca9FlOTKL4tQzN5', 'recaUxbrkfCsB1LBp', 'recanKBNzgcVxx654', 'recau4fSzGeTOxPJg', 'recb3pJNUajuvvA8o', 'recbouZOEtLFEj4h2', 'reccDpgZ9GotD5iAq', 'reccSFls10ZHe8oZG', 'reccnlDpaPinSRIKm', 'recd9xHYnV0Auu1WL', 'recdUyFFF19rXgSvj', 'recduRPMqNypM2z6e', 'receEwQGRZdKyCN7G', 'receOG0ujFJF6tpgG', 'receYhorgDZ7dqg2A', 'recegyD7wI64aMfr0', 'recfDQ0L5R5Xhldp1', 'recfgpkRSVtQVCMTg', 'recfl6W4hGKmyRvSE', 'recg28w3wVhuiKOb1', 'recgPWJXfeZbEozcq', 'rech5Y1hERLjMiudf', 'rechA0EZFgPnRoVjp', 'rechG04IfkEQuh0B2', 'rechULlbZ2VqmSnMd', 'rechb7TctrAKk7Btm', 'rechcwKVmNj4hjGgy', 'rechg0ZobbipXoND6', 'reciK0l5sb02NsgiB', 'reciMQFfUe5T1NpVR', 'reciU54B1oos3juUQ', 'reciXbAOS8GQl9nSV', 'recibWJdNIFSfAMFZ', 'reciwapphbXktl3ly', 'recjDezcNcQOxm3eQ', 'recjFk2HOySNUhVgC', 'recjz3eJzTco6MFJV', 'reck5xn5DNwyLsZAF', 'reckINrVbVEP42xNv', 'reclJR0332NZBVdf2', 'recm3maMfv2av8HXj', 'recoXHNiQPQHsyz5B', 'recp1tKjSCmrrvk85', 'recp7FcdziDlUErWK', 'recpurJvlof2vDUSe', 'recpzIv95EsHo0ArS', 'recqEoAVD5ETpiM6T', 'recr2vglOUe5e43Up', 'recrai0KBEmrt0o2l', 'recrgEBbNjlHiVY2J', 'recrshVEuFolyiG9j', 'recrvxQZUSqt99Boa', 'recs203IHb7yd7LlF', 'recsTq0hhRFkWe2GI', 'recsaCvRN0RK2sayc', 'recsnToO9nJltAfFf', 'rectAg71rA9QJModN', 'recuBqHVr1sB4ZDGk', 'recuZR8srRCqyz9st', 'recumHBzZxg5PysrZ', 'recupZ5geLEqraPSp', 'recv73jRYw7al3xYY', 'recvFr58p4TxxSR2Q', 'recvGJFywbtPAvuDM', 'recvGkKglVzTG8Rwz', 'recvz2pDIT9egKlAv', 'recw15y2Z9JaloXnT', 'recx3V9cL04qE8aK4', 'recx6dZvRsK6AaWVl', 'recxIb1FaPH4YmDsO', 'recxlpRIsoErAvDZG', 'recyS6L0sB0DiDRg4', 'recyV0N2tWuPyvxQx', 'recya700GR7vajX4r', 'recyuGawceRdaEq2H', 'recywaO8NRiPuI6FE', 'reczL9PwRm6j2KXHA', 'reczWihIjPmcdvKtr', 'reczYUqzVhoqzG2IK', 'recze1cTrDRbYZuTh']
  Observaciones: Registro inicial migrado desde opciones técnicas existentes.
  Alias: Webcam, Camara, Camera
```

```
id: rec9deBpYqYbQQ45t
  Descripción: Sensor de huella Touch ID o lector de huellas.
  Activo: True
  Orden: 11
  Nombre: To***D
  Catálogo Computadores: ['rec9nPXizOXRsz6VI', 'recDRW2w85DhjDpH1', 'recN6GHjm7UFhWz69', 'recoXHNiQPQHsyz5B', 'recrgEBbNjlHiVY2J', 'recumHBzZxg5PysrZ', 'recvGkKglVzTG8Rwz', 'recze1cTrDRbYZuTh']
  Observaciones: Registro inicial migrado desde opciones técnicas existentes.
  Alias: Fingerprint, Lector de huellas, Huella
```

```
id: recADusqrCyo4kaZK
  Descripción: Teclado con iluminación RGB.
  Activo: True
  Orden: 4
  Nombre: Te***B
  Catálogo Computadores: ['rectAg71rA9QJModN']
  Observaciones: Registro inicial migrado desde opciones técnicas existentes.
  Alias: RGB Keyboard
```

---

### Shipping Destinatarios

- **ID**: `tblfPAF3lsZkOO7me`
- **Registros**: 3
- **Campo primario**: Destinatario
- **Total campos**: 14

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Destinatario | `singleLineText` | Texto corto |
| 2 | Dirección | `multilineText` | Texto largo |
| 3 | Dirección línea 2 | `multilineText` | Texto largo |
| 4 | Estado | `singleLineText` | Texto corto |
| 5 | Ciudad | `singleLineText` | Texto corto |
| 6 | País | `singleLineText` | Texto corto |
| 7 | Email destinatario | `email` | Email |
| 8 | Teléfono | `phoneNumber` | Teléfono |
| 9 | Packing vinculado | `multipleRecordLinks` | Vínculo → **Shipping Packings** |
| 10 | Packing ID (from Packing vinculado) | `multipleLookupValues` | multipleLookupValues |
| 11 | Item vinculado | `multipleRecordLinks` | Vínculo → **Shipping Items** |
| 12 | SKU (from Item vinculado) | `multipleLookupValues` | multipleLookupValues |
| 13 | Empresa / Casillero | `singleLineText` | Texto corto |
| 14 | Código postal / ZIP | `singleLineText` | Texto corto |

**Registros de muestra (PII enmascarado):**

```
id: rec2H69cbPhqwgoRj
```

```
id: rec2OXyMpns71wchO
```

```
id: recq4VXt9usEsv5hW
  Estado: Florida
  Destinatario: Alexis Rubén Bolaños Flores EC154X121065N
  Teléfono: 30***9
  Empresa / Casillero: TRANS-EXPRESS INC
  País: United States
  Packing ID (from Packing vinculado): ['PK-20260610-72510', 'PK-20260610-47604', 'PK-20260622-56756']
  Código postal / ZIP: 33195-6559
  Packing vinculado: ['recWhx2zjtDa5r9Dp', 'rec7Zt3dePXAoVe19', 'recw82fg2NfMNYs9B']
  Dirección: 78***t
  Ciudad: Doral
```

---

### Facturas Electrónicas

- **ID**: `tblcm85VnzJ1ZVhe5`
- **Registros**: 26
- **Campo primario**: Clave de Acceso
- **Total campos**: 19

| # | Campo | Tipo | Detalle |
|---|-------|------|---------|
| 1 | Clave de Acceso | `singleLineText` | Texto corto |
| 2 | Número de Factura | `singleLineText` | Texto corto |
| 3 | Secuencial | `number` | Número (precision=0) |
| 4 | Estado | `singleSelect` | Select: PENDIENTE, RECIBIDA, DEVUELTA, AUTORIZADO, NO AUTORIZADO, BORRADOR +1 |
| 5 | Número de Autorización | `singleLineText` | Texto corto |
| 6 | Fecha de Autorización | `dateTime` | Fecha/hora (iso) |
| 7 | Fecha de Emisión | `date` | Fecha (iso) |
| 8 | Ambiente | `singleSelect` | Select: PRUEBAS, PRODUCCIÓN |
| 9 | Cliente - Nombre | `singleLineText` | Texto corto |
| 10 | Cliente - Identificación | `singleLineText` | Texto corto |
| 11 | Cliente - Correo | `email` | Email |
| 12 | Subtotal | `currency` | Moneda ($, precision=2) |
| 13 | IVA | `currency` | Moneda ($, precision=2) |
| 14 | Total | `currency` | Moneda ($, precision=2) |
| 15 | XML Autorizado | `multipleAttachments` | Adjuntos |
| 16 | RIDE PDF | `multipleAttachments` | Adjuntos |
| 17 | Mensajes SRI | `multilineText` | Texto largo |
| 18 | Estado Correo | `singleLineText` | Texto corto |
| 19 | Líneas JSON | `multilineText` | Texto largo |

**Registros de muestra (PII enmascarado):**

```
id: rec4hWVn3WkeEXlnN
  Estado: BORRADOR
  Total: 908.5
  Líneas JSON: {"version":1,"modoCliente":"buscar","cliente":{"modo":"buscar","tipoIdentificaci…
  Secuencial: 0
  Cliente - Correo: ac***m
  Fecha de Emisión: 2026-06-23
  Subtotal: 790
  Cliente - Identificación: 1003710272001
  Ambiente: PRUEBAS
  Cliente - Nombre: AL***S
```

```
id: rec6ExaDB5inOtK5o
  Clave de Acceso: 2106202601100371027200110010020000006496440992710
  Estado: NO AUTORIZADO
  Total: 115
  Secuencial: 649
  Fecha de Emisión: 2026-06-22
  Subtotal: 100
  Cliente - Identificación: 9999999999999
  Ambiente: PRUEBAS
  Cliente - Nombre: CO***L
  Número de Factura: 001-002-000000649
```

```
id: rec8DtwqjrKaAo1qK
  Clave de Acceso: 2106202601100371027200110010020000006491887783815
  Estado: NO AUTORIZADO
  Total: 667
  Secuencial: 649
  Fecha de Emisión: 2026-06-22
  Subtotal: 580
  Cliente - Identificación: 9999999999999
  Ambiente: PRUEBAS
  Cliente - Nombre: CO***L
  Número de Factura: 001-002-000000649
```

---
