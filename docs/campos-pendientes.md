# Campos pendientes de reconstrucción manual

> Campos omitidos durante la fase de carga plana (base saneada).
> Reconstruir a mano una vez que todos los links estén tendidos.

---

## Catálogo Repuestos

| Campo | Tipo | Config / Destino |
|-------|------|-----------------|
| Repuestos por Orden | `multipleRecordLinks` | → tabla "Repuestos por Orden" |

## Clientes

| Campo | Tipo | Config / Destino |
|-------|------|-----------------|
| Órdenes Relacionadas | `multipleRecordLinks` | → tabla "Órdenes de Reparación" |
| Número de Órdenes | `count` | via link `fldu2fM6yGmhsU1gH` |
| Última Fecha de Ingreso | `rollup` | via link `fldu2fM6yGmhsU1gH` |
| ChatWhatsApp | `button` | {} |
| Productos Digitales | `multipleRecordLinks` | → tabla "Productos Digitales" |

## Catálogo Servicios

| Campo | Tipo | Config / Destino |
|-------|------|-----------------|
| Servicios por Orden | `multipleRecordLinks` | → tabla "Servicios por Orden" |

## Catálogo Productos Digitales

| Campo | Tipo | Config / Destino |
|-------|------|-----------------|
| Productos Digitales | `multipleRecordLinks` | → tabla "Productos Digitales" |

## Órdenes de Reparación

| Campo | Tipo | Config / Destino |
|-------|------|-----------------|
| ID | `formula` | `"OR" & RIGHT("000000" & {flda87Wri2B4Cn3vH}, 6)
` |
| Cliente | `multipleRecordLinks` | → tabla "Clientes" |
| ClienteTXT | `multipleLookupValues` | via link `fldxQn30MFbB1xNZP` |
| Telefono | `multipleLookupValues` | via link `fldxQn30MFbB1xNZP` |
| Cedula | `multipleLookupValues` | via link `fldxQn30MFbB1xNZP` |
| Estado Actual Text | `formula` | `{fld6hwpeDC6qkEVTE}` |
| Historial de Estados | `multipleRecordLinks` | → tabla "Historial de Estados" |
| Detalle Rollup | `rollup` | via link `fldV2feoVbOeInX0m` |
| Total Productos Digitales | `rollup` | via link `fldtqloWdhppncHcH` |
| Costo Total Servicios NV | `rollup` | via link `fldawVT0l14WeHJ90` |
| Costo Total Repuestos NV | `rollup` | via link `fldOEJtazRcjOhaKr` |
| Total Abonado NV | `rollup` | via link `fldHiJvas6Kr491R8` |
| Abonos | `multipleRecordLinks` | → tabla "Abonos por Orden" |
| Total a Pagar NV | `formula` | `{flda05QusAO8IapQy} + {fldEIpjhzKyP96XOu} + {fldc0YtcuC8SLxlhM}` |
| Saldo NV | `formula` | `MAX(0, {fldXws8mKCY0DBmHP} - {fldryKatp0tN4ZFri})` |
| Todos Estados | `rollup` | via link `fldV2feoVbOeInX0m` |
| Ultima Modificacion | `lastModifiedTime` | (campo de sistema, se recrea) |
| Repuestos por Orden | `multipleRecordLinks` | → tabla "Repuestos por Orden" |
| Servicios por Orden | `multipleRecordLinks` | → tabla "Servicios por Orden" |
| Resumen Repuestos por Orden | `rollup` | via link `fldOEJtazRcjOhaKr` |
| Resumen Servicios por Orden | `rollup` | via link `fldawVT0l14WeHJ90` |
| Resumen General Presupuesto  | `formula` | `"Total a Pagar:" & {fldXws8mKCY0DBmHP} & ", " &
"Total de Servicios:" & {flda05` |
| Productos Digitales | `multipleRecordLinks` | → tabla "Productos Digitales" |

## Historial de Estados

| Campo | Tipo | Config / Destino |
|-------|------|-----------------|
| Equipo | `multipleLookupValues` | via link `fldOgToiO67J3spxX` |
| Ingresa Por | `multipleLookupValues` | via link `fldOgToiO67J3spxX` |
| Órdenes de Reparación | `multipleRecordLinks` | → tabla "Órdenes de Reparación" |
| Teléfono | `multipleLookupValues` | via link `fldOgToiO67J3spxX` |
| Cliente | `multipleLookupValues` | via link `fldOgToiO67J3spxX` |
| Estado Actual Text | `multipleLookupValues` | via link `fldOgToiO67J3spxX` |
| Presupuesto | `multipleLookupValues` | via link `fldOgToiO67J3spxX` |
| Abono | `multipleLookupValues` | via link `fldOgToiO67J3spxX` |
| Todos Estados Rollup (from Órdenes de Reparación) | `rollup` | via link `fldOgToiO67J3spxX` |
| Resumen Repuestos | `multipleLookupValues` | via link `fldOgToiO67J3spxX` |
| Repuestos Servicios | `multipleLookupValues` | via link `fldOgToiO67J3spxX` |
| Resumen General Presupuestos | `rollup` | via link `fldOgToiO67J3spxX` |

## Repuestos por Orden

| Campo | Tipo | Config / Destino |
|-------|------|-----------------|
| Orden de Reparación | `multipleRecordLinks` | → tabla "Órdenes de Reparación" |
| Repuesto del Catálogo | `multipleRecordLinks` | → tabla "Catálogo Repuestos" |
| Subtotal cliente | `formula` | `{fldXOEp01dQjWOIlH} * {fldP2ULf6cfhBOtfq}` |
| Subtotal costo | `formula` | `{fldXOEp01dQjWOIlH} * {fldFLEm8IrJOicFeA}` |
| Resumen Repuesto Precio | `formula` | `{fldZB187zrLqvSVtk} & " " & "$" & {fldFLEm8IrJOicFeA}` |

## Servicios por Orden

| Campo | Tipo | Config / Destino |
|-------|------|-----------------|
| Orden de Reparación | `multipleRecordLinks` | → tabla "Órdenes de Reparación" |
| Servicio del Catálogo | `multipleRecordLinks` | → tabla "Catálogo Servicios" |
| Resumen Servicios Precio | `formula` | `{fld6xUkI5WgSgVNjQ} & " " & "$" & {fldVDc4kxLYokiGTI}` |

## Abonos por Orden

| Campo | Tipo | Config / Destino |
|-------|------|-----------------|
| Orden de Reparación | `multipleRecordLinks` | → tabla "Órdenes de Reparación" |

## Productos Digitales

| Campo | Tipo | Config / Destino |
|-------|------|-----------------|
| Producto Digital | `formula` | `{fldjmS5gMb9k2Gvvy} & " · " & {fldyirN1bHDTZiXR0} & " · " & DATETIME_FORMAT({fld` |
| Software / Producto | `multipleRecordLinks` | → tabla "Catálogo Productos Digitales" |
| Marca Producto | `multipleLookupValues` | via link `fldjmS5gMb9k2Gvvy` |
| Tipo Producto | `multipleLookupValues` | via link `fldjmS5gMb9k2Gvvy` |
| Logo Producto | `multipleLookupValues` | via link `fldjmS5gMb9k2Gvvy` |
| Portal de Activación Catálogo | `multipleLookupValues` | via link `fldjmS5gMb9k2Gvvy` |
| Instrucciones PDF Catálogo | `multipleLookupValues` | via link `fldjmS5gMb9k2Gvvy` |
| Notas para Cliente Catálogo | `multipleLookupValues` | via link `fldjmS5gMb9k2Gvvy` |
| Precio Venta Catálogo | `multipleLookupValues` | via link `fldjmS5gMb9k2Gvvy` |
| Color Principal Producto | `multipleLookupValues` | via link `fldjmS5gMb9k2Gvvy` |
| Expira | `formula` | `SWITCH(
  {fldmubZA7NriScx4a},
  "1 año", DATEADD({fldAPUIazGR3gohY5}, 1, 'years` |
| Orden de Reparación | `multipleRecordLinks` | → tabla "Órdenes de Reparación" |
| Cliente | `multipleRecordLinks` | → tabla "Clientes" |
| Ganancia | `formula` | `{fld8RUEAApf9rGDpM} - {fldSCBJmR7gOgj1rN}` |
| Producto Seguro | `formula` | `{fldjmS5gMb9k2Gvvy} & " - " & {fldyirN1bHDTZiXR0}` |

---

**Total campos pendientes: 67**
