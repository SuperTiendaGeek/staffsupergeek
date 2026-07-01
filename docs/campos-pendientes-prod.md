# Campos pendientes de reconstrucción — Producción

> Campos omitidos en la Fase 1 (carga plana).
> Reconstruir en Fase 2 una vez que todos los links estén tendidos.

## Catálogo Repuestos

- multipleRecordLinks 'Repuestos por Orden' → Fase 2A

## Clientes

- multipleRecordLinks 'Órdenes Relacionadas' → Fase 2A
- count 'Número de Órdenes'
- rollup 'Última Fecha de Ingreso'
- button 'ChatWhatsApp'
- multipleRecordLinks 'Productos Digitales' → Fase 2A

## Catálogo Servicios

- multipleRecordLinks 'Servicios por Orden' → Fase 2A

## Catálogo Productos Digitales

- multipleRecordLinks 'Productos Digitales' → Fase 2A

## Órdenes de Reparación

- formula 'ID'
- multipleRecordLinks 'Cliente' → Fase 2A
- multipleLookupValues 'ClienteTXT'
- multipleLookupValues 'Telefono'
- multipleLookupValues 'Cedula'
- formula 'Estado Actual Text'
- multipleRecordLinks 'Historial de Estados' → Fase 2A
- rollup 'Detalle Rollup'
- rollup 'Total Productos Digitales'
- rollup 'Costo Total Servicios NV'
- rollup 'Costo Total Repuestos NV'
- rollup 'Total Abonado NV'
- multipleRecordLinks 'Abonos' → Fase 2A
- formula 'Total a Pagar NV'
- formula 'Saldo NV'
- rollup 'Todos Estados'
- lastModifiedTime 'Ultima Modificacion' → omitir
- multipleRecordLinks 'Repuestos por Orden' → Fase 2A
- multipleRecordLinks 'Servicios por Orden' → Fase 2A
- rollup 'Resumen Repuestos por Orden'
- rollup 'Resumen Servicios por Orden'
- formula 'Resumen General Presupuesto '
- multipleRecordLinks 'Productos Digitales' → Fase 2A

## Historial de Estados

- multipleLookupValues 'Equipo'
- multipleLookupValues 'Ingresa Por'
- multipleRecordLinks 'Órdenes de Reparación' → Fase 2A
- multipleLookupValues 'Teléfono'
- multipleLookupValues 'Cliente'
- multipleLookupValues 'Estado Actual Text'
- multipleLookupValues 'Presupuesto'
- multipleLookupValues 'Abono'
- rollup 'Todos Estados Rollup (from Órdenes de Reparación)'
- multipleLookupValues 'Resumen Repuestos'
- multipleLookupValues 'Repuestos Servicios'
- rollup 'Resumen General Presupuestos'

## Repuestos por Orden

- multipleRecordLinks 'Orden de Reparación' → Fase 2A
- multipleRecordLinks 'Repuesto del Catálogo' → Fase 2A
- formula 'Subtotal cliente'
- formula 'Subtotal costo'
- formula 'Resumen Repuesto Precio'

## Servicios por Orden

- multipleRecordLinks 'Orden de Reparación' → Fase 2A
- multipleRecordLinks 'Servicio del Catálogo' → Fase 2A
- formula 'Resumen Servicios Precio'

## Abonos por Orden

- multipleRecordLinks 'Orden de Reparación' → Fase 2A

## Productos Digitales

- formula 'Producto Digital'
- multipleRecordLinks 'Software / Producto' → Fase 2A
- multipleLookupValues 'Marca Producto'
- multipleLookupValues 'Tipo Producto'
- multipleLookupValues 'Logo Producto'
- multipleLookupValues 'Portal de Activación Catálogo'
- multipleLookupValues 'Instrucciones PDF Catálogo'
- multipleLookupValues 'Notas para Cliente Catálogo'
- multipleLookupValues 'Precio Venta Catálogo'
- multipleLookupValues 'Color Principal Producto'
- formula 'Expira'
- multipleRecordLinks 'Orden de Reparación' → Fase 2A
- multipleRecordLinks 'Cliente' → Fase 2A
- formula 'Ganancia'
- formula 'Producto Seguro'
