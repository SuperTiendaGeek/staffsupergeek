# Auditoría de Esquema — Gestión de Órdenes de Reparación

**Base ID:** `appk7jO3ayjihXEbW`  
**Tablas:** 13  
**Token usado:** `AIRTABLE_TECNICOS_TOKEN`

---

## Tablas

### Órdenes de Reparación

| Propiedad | Valor |
|---|---|
| ID tabla | `tblitqF6cCopZ9Dge` |
| Campo primario | `ID` |
| Registros aprox. | 353 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | ID | `fldcpSxutLqAgzRbg` | `formula` | `"OR" & RIGHT("000000" & {flda87Wri2B4Cn3vH}, 6)
` | ⚠️ reconstruir |
| 2 | Autonumber | `flda87Wri2B4Cn3vH` | `autoNumber` |  | ⚠️ reconstruir |
| 3 | Cliente | `fldxQn30MFbB1xNZP` | `multipleRecordLinks` | → **Clientes**  [1:N]  campo inverso: `fldu2fM6yGmhsU1gH` | ✅ |
| 4 | ClienteTXT | `fld3YoJcpZYTN4n4V` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldxQn30MFbB1xNZP', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 5 | Telefono | `fldQquKcNlnp0jUFz` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldxQn30MFbB1xNZP', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 6 | Cedula | `fld3LMQDqvFEoDWV3` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldxQn30MFbB1xNZP', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 7 | Fecha de Ingreso | `fld7OJi398X5ppbE6` | `createdTime` |  | ⚠️ reconstruir |
| 8 | Equipo | `fldq2RvxKUuVjmqMM` | `multilineText` |  | ✅ |
| 9 | Ingresa Por | `fldjojmf10Q4QKTnn` | `multilineText` |  | ✅ |
| 10 | Accesorios | `fldHa6VFXZyZNh4tB` | `multilineText` |  | ✅ |
| 11 | Diagnostico Inicial | `fldW0U4BEMOwC6bt4` | `multilineText` |  | ✅ |
| 12 | Técnico Asignado | `fldv2nmWSYXlfmmpf` | `singleLineText` |  | ✅ |
| 13 | Presupuesto | `fldN6jWGmype85DDT` | `formula` | `{fldNUgqH8YFi4Lo9P} + {fldAWsQMpxYCJCxHe}` | ⚠️ reconstruir |
| 14 | Abono | `fldqXTNX0bIyzkDA2` | `currency` |  | ✅ |
| 15 | Confirmación del Cliente | `fldCzoNZ1Q9Q40zZt` | `checkbox` |  | ✅ |
| 16 | Estado Actual | `fld6hwpeDC6qkEVTE` | `singleSelect` | opciones: Pendiente, En Proceso, Esperando Respuesta, Completado, Finalizado Entregado, Enviado a Reciclaje | ✅ |
| 17 | Estado Actual Text | `fldYVS76oZCA2eXVc` | `formula` | `{fld6hwpeDC6qkEVTE}` | ⚠️ reconstruir |
| 18 | Cliente Notificado | `fldvXWy4hLC8A8wdZ` | `checkbox` |  | ✅ |
| 19 | Historial de Estados | `fldV2feoVbOeInX0m` | `multipleRecordLinks` | → **Historial de Estados**  [N:M]  campo inverso: `fldOgToiO67J3spxX` | ✅ |
| 20 | Detalle Rollup | `flddiLeIyrISfFF6v` | `rollup` | via `fldV2feoVbOeInX0m`, función `ver manualmente`, campo `flddy2VugzwC8jAAJ` | ⚠️ reconstruir |
| 21 | Fotos del Equipo | `fldDXvJqJKwwYwkVm` | `multipleAttachments` | {'isReversed': True} | ✅ |
| 22 | Fecha de Entrega | `fldrjbVqORs5i3ihy` | `date` | local | ✅ |
| 23 | Link de Seguimiento | `fld45uUhOYI0lx7SW` | `singleLineText` |  | ✅ |
| 24 | URL Seguimiento | `fld8TO9V9Wp3Zn5jl` | `formula` | `"https://airtable.com/appk7jO3ayjihXEbW/shrCmpe3LGs1agejy?filterByFormula=" & 
ENCODE_URL_COMPONENT("{ID de Orden}='"…` | ⚠️ reconstruir |
| 25 | Servicios | `fldnYKHXQtQRoa8iN` | `multipleRecordLinks` | → **Servicios**  [N:M]  campo inverso: `fldHWTrQhoLjyPJ20` | ✅ |
| 26 | Resumen Servicios | `fldrMTaOs1hGzOz88` | `rollup` | via `fldnYKHXQtQRoa8iN`, función `ver manualmente`, campo `fldLlHGIK9fqKJKvk` | ⚠️ reconstruir |
| 27 | Costo Total Servicios | `fldAWsQMpxYCJCxHe` | `rollup` | via `fldnYKHXQtQRoa8iN`, función `ver manualmente`, campo `fldh3ZaeK5ONZ2yyv` | ⚠️ reconstruir |
| 28 | Número de Repuestos Usados | `fldbx82qIHmq32KXx` | `count` | via `fldNpMZOF7YO9NHa3`, función `ver manualmente` | ⚠️ reconstruir |
| 29 | Repuestos Usados | `fldNpMZOF7YO9NHa3` | `multipleRecordLinks` | → **Repuestos Usados**  [N:M]  campo inverso: `fldkQav1xRgCjm5sq` | ✅ |
| 30 | Resumen Repuestos | `fldMkSQMiijbpAGYs` | `rollup` | via `fldNpMZOF7YO9NHa3`, función `ver manualmente`, campo `fldv4VjvJoOVYlOrg` | ⚠️ reconstruir |
| 31 | Costo Total de Repuestos | `fldNUgqH8YFi4Lo9P` | `rollup` | via `fldNpMZOF7YO9NHa3`, función `ver manualmente`, campo `fldzGz09Z9BmFDp82` | ⚠️ reconstruir |
| 32 | Total a pagar | `fldYjGk3IDHgmLXtV` | `formula` | `({fldNUgqH8YFi4Lo9P} + {fldAWsQMpxYCJCxHe})-{fldqXTNX0bIyzkDA2}` | ⚠️ reconstruir |
| 33 | Costo Total Servicios NV | `flda05QusAO8IapQy` | `rollup` | via `fldawVT0l14WeHJ90`, función `ver manualmente`, campo `fldVDc4kxLYokiGTI` | ⚠️ reconstruir |
| 34 | Costo Total Repuestos NV | `fldEIpjhzKyP96XOu` | `rollup` | via `fldOEJtazRcjOhaKr`, función `ver manualmente`, campo `fldSnVG8R66yDOatz` | ⚠️ reconstruir |
| 35 | Total Productos Digitales | `fldc0YtcuC8SLxlhM` | `rollup` | via `fldtqloWdhppncHcH`, función `ver manualmente`, campo `fld8RUEAApf9rGDpM` | ⚠️ reconstruir |
| 36 | Total a Pagar NV | `fldXws8mKCY0DBmHP` | `formula` | `{flda05QusAO8IapQy} + {fldEIpjhzKyP96XOu} + {fldc0YtcuC8SLxlhM}` | ⚠️ reconstruir |
| 37 | Saldo NV | `fld7OkffGBtqZf2pH` | `formula` | `MAX(0, {fldXws8mKCY0DBmHP} - {fldryKatp0tN4ZFri})` | ⚠️ reconstruir |
| 38 | Total Abonado NV | `fldryKatp0tN4ZFri` | `rollup` | via `fldHiJvas6Kr491R8`, función `ver manualmente`, campo `fldQmVjxuPNspufQB` | ⚠️ reconstruir |
| 39 | Mensaje Base Input | `fldh0LuuZMXLW7yjS` | `aiText` | {'referencedFieldIds': ['fldxQn30MFbB1xNZP', 'fldYVS76oZCA2eXVc', 'fldqXTNX0bIyz | ✅ |
| 40 | Generar PDF | `fldo6UEEQmi2WzLDH` | `button` |  | ⚠️ reconstruir |
| 41 | PDF | `fldJErJKRS1lX7kN4` | `multipleAttachments` | {'isReversed': False} | ✅ |
| 42 | Enviar PDF | `fld01ySRJu6cDE359` | `button` |  | ⚠️ reconstruir |
| 43 | Reporte | `fldNFfRaNd345mHTF` | `multipleAttachments` | {'isReversed': False} | ✅ |
| 44 | miniExtensions - DO NOT EDIT | `fldpkPXYLxbWN0taq` | `singleLineText` |  | ✅ |
| 45 | Imprimir Ticket | `fld3Cb0fL5cCqm9Jj` | `button` |  | ⚠️ reconstruir |
| 46 | Nota interna | `fld2XUZtuFbeEJFNd` | `multilineText` |  | ✅ |
| 47 | Todos Estados | `fld8yyUXFtJZaki4x` | `rollup` | via `fldV2feoVbOeInX0m`, función `ver manualmente`, campo `flddy2VugzwC8jAAJ` | ⚠️ reconstruir |
| 48 | Recomendaciones | `fld5pzdfXSeAOEg5V` | `richText` |  | ✅ |
| 49 | Reporte Orden IA | `fldZgHNkTvqRW0v8c` | `aiText` | {'referencedFieldIds': ['fld8yyUXFtJZaki4x', 'fldxQn30MFbB1xNZP', 'fldcpSxutLqAg | ✅ |
| 50 | Enviar Reporte Whatsapp | `fldQYehnMC8HQzx9Q` | `button` |  | ⚠️ reconstruir |
| 51 | Repuestos Usados copy | `fldvMc9Tq3bftcQAw` | `multipleRecordLinks` | → **Servicios**  [N:M]  campo inverso: `fld2dAF6iNt3DLeST` | ✅ |
| 52 | Documentos | `fldMEC04beASmF0UQ` | `multipleAttachments` | {'isReversed': False} | ✅ |
| 53 | Proximo mantenimiento | `fldaL8gX5POuj75pn` | `formula` | `IF(
  {fldrjbVqORs5i3ihy},
  RIGHT("0"&DAY(DATEADD({fldrjbVqORs5i3ihy}, 6, 'months')), 2)
  & "/"
  & SWITCH(
  …` | ⚠️ reconstruir |
| 54 | Ultima Modificacion | `fldyPGMwQxUKWjt3w` | `lastModifiedTime` |  | ⚠️ reconstruir |
| 55 | URL de impresión | `fldrLeOHZMHyN0xmz` | `formula` | `"https://hook.us2.make.com/yre29fyk5alcd1kj47tlb8e1ac6jx12y?recordID=" & RECORD_ID()` | ⚠️ reconstruir |
| 56 | URL Etiqueta Zebra | `fld2cULL664TWkcIP` | `formula` | `"https://hook.us2.make.com/wmdayn966snxq3fppdn9cswhcn9oews4?recordID=" & RECORD_ID()` | ⚠️ reconstruir |
| 57 | Cotizacion | `fldZo2BkDsKV9iIth` | `checkbox` |  | ✅ |
| 58 | Tipo Orden | `fldNCZoa48IZQz90e` | `singleSelect` | opciones: Servicio de Reparación, Pedido de Repuesto (Cotización) | ✅ |
| 59 | Repuestos por Orden | `fldOEJtazRcjOhaKr` | `multipleRecordLinks` | → **Repuestos por Orden**  [N:M]  campo inverso: `fld3eSckKI1DfpbeT` | ✅ |
| 60 | Servicios por Orden | `fldawVT0l14WeHJ90` | `multipleRecordLinks` | → **Servicios por Orden**  [N:M]  campo inverso: `fldahPWzqV5JIMOyW` | ✅ |
| 61 | Abonos | `fldHiJvas6Kr491R8` | `multipleRecordLinks` | → **Abonos por Orden**  [N:M]  campo inverso: `fldnBvEnhciitPkmP` | ✅ |
| 62 | Resumen Repuestos por Orden | `fldAAokXOHvM1jPbc` | `rollup` | via `fldOEJtazRcjOhaKr`, función `ver manualmente`, campo `fld3ZWMiYwHSdYalA` | ⚠️ reconstruir |
| 63 | Resumen Servicios por Orden | `fldkvfGxqI4GNtZo5` | `rollup` | via `fldawVT0l14WeHJ90`, función `ver manualmente`, campo `fld5r5oRIlgx0GnTm` | ⚠️ reconstruir |
| 64 | Resumen General Presupuesto  | `fldntAtjWFCBWGUeq` | `formula` | `"Total a Pagar:" & {fldXws8mKCY0DBmHP} & ", " &
"Total de Servicios:" & {flda05QusAO8IapQy} & ", " &
"Total de Repu…` | ⚠️ reconstruir |
| 65 | Origen de Orden | `fld0uGyXygGcX7JrT` | `singleSelect` | opciones: Reparación directa, Cotización de repuesto, Pedido especial, Garantía | ✅ |
| 66 | Cotización ID | `fldTHoX6apfcBWKu1` | `singleLineText` |  | ✅ |
| 67 | Cotización Código | `fldIUaC2uKi3z9GdY` | `singleLineText` |  | ✅ |
| 68 | Item Pedido ID | `fldwZXMhHU9iisM2m` | `singleLineText` |  | ✅ |
| 69 | Repuesto / Producto Solicitado | `flda6oZs3aEVafTrV` | `singleLineText` |  | ✅ |
| 70 | Estado del Pedido Asociado | `fldUc1zjrRSn7Yity` | `singleLineText` |  | ✅ |
| 71 | Productos Digitales | `fldtqloWdhppncHcH` | `multipleRecordLinks` | → **Productos Digitales**  [N:M]  campo inverso: `fldgmB4Jmt25imuqZ` | ✅ |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec0Ily3XEUH9cabO",
  "fields": {
    "Enviar PDF": {
      "label": "Enviar PDF",
      "url": "https://airtable.com/tblitqF6cCopZ9Dge/rec0Ily3XEUH9cabO?blocks=bli1z2T7MUIVKVLx0"
    },
    "Nota interna": "Teclado para Hp Elitebook 840 G2",
    "URL Etiqueta Zebra": "https://hook.us2.make.com/wmdayn966snxq3fppdn9cswhcn9oews4?recordID=rec0Ily3XEUH9cabO",
    "Imprimir Ticket": {
      "label": "Imprimir",
      "url": "https://hook.us2.make.com/lr5tivj3i5q9nkpo9ynigsvo2aebnlex?id=rec0Ily3XEUH9cabO"
    },
    "Cedula": "**[ENMASCARADO]**",
    "ClienteTXT": "**[ENMASCARADO]**",
    "Estado Actual": "Finalizado Entregado",
    "Fecha de Ingreso": "2026-03-02T17:21:26.000Z",
    "Saldo NV": 0,
    "URL Seguimiento": "https://airtable.com/appk7jO3ayjihXEbW/shrCmpe3LGs1agejy?filterByFormula=%7BID%20de%20Orden%7D%3D%27OR000210%27",
    "Todos Estados": "• ",
    "Resumen Repuestos por Orden": [],
    "Costo Total Servicios": 0,
    "Costo Total Repuestos NV": 0,
    "Resumen Repuestos": "• ",
    "Presupuesto": 0,
    "Tipo Orden": "Pedido de Repuesto (Cotización)",
    "Costo Total de Repuestos": 0,
    "Enviar Reporte Whatsapp": {
      "label": "Enviar",
      "url": "htt
```

```json
{
  "id": "rec0JnffhQVe09FbB",
  "fields": {
    "Enviar PDF": {
      "label": "Enviar PDF",
      "url": "https://airtable.com/tblitqF6cCopZ9Dge/rec0JnffhQVe09FbB?blocks=bli1z2T7MUIVKVLx0"
    },
    "URL Etiqueta Zebra": "https://hook.us2.make.com/wmdayn966snxq3fppdn9cswhcn9oews4?recordID=rec0JnffhQVe09FbB",
    "Imprimir Ticket": {
      "label": "Imprimir",
      "url": "https://hook.us2.make.com/lr5tivj3i5q9nkpo9ynigsvo2aebnlex?id=rec0JnffhQVe09FbB"
    },
    "Cedula": "**[ENMASCARADO]**",
    "ClienteTXT": "**[ENMASCARADO]**",
    "Recomendaciones": "\\-\n",
    "Estado Actual": "Finalizado Entregado",
    "Fecha de Ingreso": "2026-01-14T15:36:48.000Z",
    "Saldo NV": 0,
    "URL Seguimiento": "https://airtable.com/appk7jO3ayjihXEbW/shrCmpe3LGs1agejy?filterByFormula=%7BID%20de%20Orden%7D%3D%27OR000178%27",
    "Todos Estados": "• ",
    "Resumen Repuestos por Orden": [],
    "Costo Total Servicios": 0,
    "Costo Total Repuestos NV": 0,
    "Accesorios": "Ninguno",
    "Resumen Repuestos": "• ",
    "Presupuesto": 0,
    "Tipo Orden": "Servicio de Reparación",
    "Costo Total de Repuestos": 0,
    "Enviar Reporte Whatsapp": {
      "label": "Enviar",
      "url": "https:/
```

</details>

---

### Clientes

| Propiedad | Valor |
|---|---|
| ID tabla | `tblilTXFzDvSsvqbX` |
| Campo primario | `Nombre` |
| Registros aprox. | 353 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | Nombre | `fld4qIiRrqxPebUy9` | `singleLineText` |  | ✅ |
| 2 | Cédula | `fldy9BViJ0lxp8Atv` | `singleLineText` |  | ✅ |
| 3 | Teléfono | `fld1DPZFLeFVoM0tB` | `singleLineText` |  | ✅ |
| 4 | Correo | `fldgXbTGXNber96y8` | `singleLineText` |  | ✅ |
| 5 | Dirección | `fld72hshfbCzTAjZQ` | `singleLineText` |  | ✅ |
| 6 | Órdenes Relacionadas | `fldu2fM6yGmhsU1gH` | `multipleRecordLinks` | → **Órdenes de Reparación**  [N:M]  campo inverso: `fldxQn30MFbB1xNZP` | ✅ |
| 7 | Número de Órdenes | `fldbDHKxPmRqDITJh` | `count` | via `fldu2fM6yGmhsU1gH`, función `ver manualmente` | ⚠️ reconstruir |
| 8 | Última Fecha de Ingreso | `fldcmNWvn1c7JICVy` | `rollup` | via `fldu2fM6yGmhsU1gH`, función `ver manualmente`, campo `fld7OJi398X5ppbE6` | ⚠️ reconstruir |
| 9 | Resumen de Órdenes | `fld49uLABm71ONhOJ` | `aiText` | {'referencedFieldIds': ['fld4qIiRrqxPebUy9', 'fldu2fM6yGmhsU1gH'], 'prompt': ['Y | ✅ |
| 10 | Sugerencias de Seguimiento | `fldD98dAHv5gzHff7` | `aiText` | {'referencedFieldIds': ['fld4qIiRrqxPebUy9', 'fldu2fM6yGmhsU1gH'], 'prompt': ['Y | ✅ |
| 11 | Notas | `fld6dPolp1iMCqrDv` | `multilineText` |  | ✅ |
| 12 | Fecha de registro | `fldR1d1Qp61oVIvyb` | `createdTime` |  | ⚠️ reconstruir |
| 13 | ChatWhatsApp | `fldr54RKP29mFMScn` | `button` |  | ⚠️ reconstruir |
| 14 | Cotizaciones | `fldZ69bCAh2wQ6nYh` | `singleLineText` |  | ✅ |
| 15 | Productos Digitales | `fldvSVWsULLVdoRNE` | `multipleRecordLinks` | → **Productos Digitales**  [N:M]  campo inverso: `fldujZsWM9q0JeXHU` | ✅ |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec018jcmJAR9ij0U",
  "fields": {
    "Teléfono": "**[ENMASCARADO]**",
    "Resumen de Órdenes": {
      "state": "empty",
      "value": null,
      "isStale": true
    },
    "Nombre": "**[ENMASCARADO]**",
    "Sugerencias de Seguimiento": {
      "state": "empty",
      "value": null,
      "isStale": true
    },
    "Fecha de registro": "2026-04-01T22:27:51.000Z",
    "Número de Órdenes": 1,
    "Última Fecha de Ingreso": "2026-04-01",
    "ChatWhatsApp": {
      "label": "WhatsApp",
      "url": "https://wa.me/593984723309"
    },
    "Órdenes Relacionadas": [
      "recirlKQRS1O96iSg"
    ]
  }
}
```

```json
{
  "id": "rec0UT8T7WEPowZEk",
  "fields": {
    "Teléfono": "**[ENMASCARADO]**",
    "Resumen de Órdenes": {
      "state": "empty",
      "value": null,
      "isStale": true
    },
    "Nombre": "**[ENMASCARADO]**",
    "Sugerencias de Seguimiento": {
      "state": "empty",
      "value": null,
      "isStale": true
    },
    "Fecha de registro": "2025-09-16T16:57:39.000Z",
    "Número de Órdenes": 1,
    "Última Fecha de Ingreso": "2025-09-16",
    "ChatWhatsApp": {
      "label": "WhatsApp",
      "url": "https://wa.me/593963225204"
    },
    "Órdenes Relacionadas": [
      "recupFHps9mah3ZcI"
    ]
  }
}
```

</details>

---

### Historial de Estados

| Propiedad | Valor |
|---|---|
| ID tabla | `tblwe4Lg2PvdAUtRD` |
| Campo primario | `Estado Nuevo` |
| Registros aprox. | ≥1000 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | Estado Nuevo | `flddy2VugzwC8jAAJ` | `multilineText` |  | ✅ |
| 2 | Equipo | `fldwULIMluSGKFgbD` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldOgToiO67J3spxX', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 3 | Ingresa Por | `fldrh2nQFBUt7jswk` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldOgToiO67J3spxX', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 4 | Órdenes de Reparación | `fldOgToiO67J3spxX` | `multipleRecordLinks` | → **Órdenes de Reparación**  [N:M]  campo inverso: `fldV2feoVbOeInX0m` | ✅ |
| 5 | Fecha | `fldczJZKLclyVLELc` | `createdTime` |  | ⚠️ reconstruir |
| 6 | Teléfono | `fldHp2HKvXmIpHreY` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldOgToiO67J3spxX', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 7 | Resumen de Notas | `fldRanqYjWgsgYMIw` | `aiText` | {'referencedFieldIds': ['fldFenO5ibq6G1J0X'], 'prompt': ['You are a professional | ✅ |
| 8 | Sugerencia de Acción Siguiente | `fldKMX6TI8yPGEAI5` | `aiText` | {'referencedFieldIds': ['flddy2VugzwC8jAAJ', 'fldFenO5ibq6G1J0X'], 'prompt': ['Y | ✅ |
| 9 | Fotos/Videos | `fld1OthBuRHnsVrqw` | `multipleAttachments` | {'isReversed': False} | ✅ |
| 10 | Cliente | `fldl3x8pbGtAyp3cO` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldOgToiO67J3spxX', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 11 | Estado Actual Text | `fldY8QPc4uv6xuHAu` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldOgToiO67J3spxX', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 12 | Presupuesto | `fldZU24m0qpwwc3rS` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldOgToiO67J3spxX', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 13 | Abono | `fld6smhlgAUvdv23n` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldOgToiO67J3spxX', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 14 | Generar Whatsapp | `fldRLMpk5FFhB8m3x` | `aiText` | {'referencedFieldIds': ['fldl3x8pbGtAyp3cO', 'fldwULIMluSGKFgbD', 'fldY8QPc4uv6x | ✅ |
| 15 | Generar Whatsapp copy | `fldsq0EJbVzLItdOJ` | `aiText` | {'referencedFieldIds': ['fldl3x8pbGtAyp3cO', 'fldwULIMluSGKFgbD', 'fldY8QPc4uv6x | ✅ |
| 16 | Solicitar Mensaje Cliente | `fldOi4ZaxDqXjZl07` | `checkbox` |  | ✅ |
| 17 | Estado Generado IA | `fldHes8ZqaNNzHBCo` | `multilineText` |  | ✅ |
| 18 | Enviar Whatsapp | `fldeCqH147d80o6Lm` | `button` |  | ⚠️ reconstruir |
| 19 | Todos Estados Rollup (from Órdenes de Reparación) | `fldxMWSRjMhig6QW2` | `rollup` | via `fldOgToiO67J3spxX`, función `ver manualmente`, campo `fld8yyUXFtJZaki4x` | ⚠️ reconstruir |
| 20 | ⭐ | `fld7HdhijVddJVwpE` | `checkbox` |  | ✅ |
| 21 | Creado desde App Técnico | `fldnA4PPGoaPfgyZE` | `checkbox` |  | ✅ |
| 22 | Técnico | `fld1co3B0WHQ6KvEJ` | `singleLineText` |  | ✅ |
| 23 | Resumen Repuestos | `fld8IBFZ6MwrD2kEw` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldOgToiO67J3spxX', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 24 | Repuestos Servicios | `fldlF6cQznEcOVc2o` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldOgToiO67J3spxX', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 25 | Resumen General Presupuestos | `fldHCMNb8a4CaA6hv` | `rollup` | via `fldOgToiO67J3spxX`, función `ver manualmente`, campo `fldntAtjWFCBWGUeq` | ⚠️ reconstruir |
| 26 | Creado por Nombre | `fld2kOIjxUJA4iR28` | `singleLineText` |  | ✅ |
| 27 | Creado por Email | `fldtcG6MccGyJENJm` | `singleLineText` |  | ✅ |
| 28 | Creado por Usuario ID | `fldCZxkPpARkEiRLX` | `singleLineText` |  | ✅ |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec01jEuKWfF1xHsT",
  "fields": {
    "Abono": [
      25
    ],
    "Resumen Repuestos": [
      "• "
    ],
    "Resumen General Presupuestos": [
      "Total a Pagar:62, Total de Servicios:62, Total de Repuestos:0, Saldo:0, Abono Total:62, Resumen Repuestos:, Resumen Servicios:Reballing SMC Externo Macbook $62"
    ],
    "Estado Generado IA": "Estimado Marlon Toapanta, reciba un cordial saludo de parte de SUPER GEEK. Nos comunicamos con usted respecto a su equipo MacBook Air 13\", asociado a la orden de reparación OR000203.\n\nActualmente, su orden se encuentra en estado \"Esperando Respuesta\". Le recordamos que su equipo presenta el siguiente inconveniente: se apaga minutos después de encenderla, incluso con el cargador conectado.\n\nEstimado cliente, su equipo está próximo a entrar a nuestro programa de reciclaje por falta de respuesta. Si no es retirado hasta el 13 de mayo de 2026, el equipo será dado de baja sin opción de reclamo.\n\nResumen de su presupuesto:\n- Total a pagar: $62\n- Total de servicios: $62 (Reballing SMC Externo Macbook $62)\n- Total de repuestos: $0\n- Abono total: $0\n- Saldo pendiente: $62\n\nPor favor, contáctenos a la brevedad para coordi
```

```json
{
  "id": "rec02dTVKOJ9Ic58H",
  "fields": {
    "Abono": [
      0
    ],
    "Resumen Repuestos": [
      "• "
    ],
    "Resumen General Presupuestos": [
      "Total a Pagar:0, Total de Servicios:0, Total de Repuestos:0, Saldo:0, Abono Total:0, Resumen Repuestos:, Resumen Servicios:"
    ],
    "Teléfono": "**[ENMASCARADO]**",
    "Sugerencia de Acción Siguiente": {
      "state": "error",
      "errorType": "emptyDependency",
      "value": null,
      "isStale": false
    },
    "Órdenes de Reparación": [
      "recwrP8RiZfMhuGUY"
    ],
    "Generar Whatsapp": {
      "state": "empty",
      "value": null,
      "isStale": true
    },
    "Estado Actual Text": [
      "Finalizado Entregado"
    ],
    "Presupuesto": [
      0
    ],
    "Fecha": "2025-12-19T23:01:38.000Z",
    "Estado Nuevo": "Cliente confirma formateo sin respaldo",
    "Enviar Whatsapp": {
      "label": "Enviar",
      "url": "https://api.whatsapp.com/send?phone=5930997032607&text="
    },
    "Cliente": "**[ENMASCARADO]**",
    "Repuestos Servicios": [
      "• "
    ],
    "Ingresa Por": [
      "Se cuelga después de haber encendido"
    ],
    "Generar Whatsapp copy": {
      "state": "empty",
      "
```

</details>

---

### Repuestos Usados

| Propiedad | Valor |
|---|---|
| ID tabla | `tblmiFGDWTnlcQKn5` |
| Campo primario | `Repuesto` |
| Registros aprox. | 36 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | Repuesto | `fldqY9rGHqWV2fFcN` | `singleLineText` |  | ✅ |
| 2 | Orden Relacionada | `fldkQav1xRgCjm5sq` | `multipleRecordLinks` | → **Órdenes de Reparación**  [1:N]  campo inverso: `fldNpMZOF7YO9NHa3` | ✅ |
| 3 | Precio Cliente | `fldzGz09Z9BmFDp82` | `currency` |  | ✅ |
| 4 | Costo Prov | `fldt9VtPAjZo1eQuO` | `currency` |  | ✅ |
| 5 | Proveedor | `fld5Mflah59RJskvU` | `singleLineText` |  | ✅ |
| 6 | Fecha de Uso | `fldtVgAgq1pkz4YN0` | `date` | local | ✅ |
| 7 | Resumen de Uso de Repuesto | `fldv4VjvJoOVYlOrg` | `formula` | `{fldqY9rGHqWV2fFcN} & " $" & {fldzGz09Z9BmFDp82}
` | ⚠️ reconstruir |
| 8 | Tracking | `fldinkRijaA0sNt4v` | `singleLineText` |  | ✅ |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec05qQr6RlXRrbiE",
  "fields": {
    "Orden Relacionada": [
      "rec8iiSyRAhyKCVQN",
      "recJcAfAnxS1umwEb"
    ],
    "Repuesto": "Disco SSD M.2 128GB ",
    "Resumen de Uso de Repuesto": "Disco SSD M.2 128GB  $40",
    "Precio Cliente": "**[ENMASCARADO]**"
  }
}
```

```json
{
  "id": "rec1r2eOtpMW86VXK",
  "fields": {
    "Orden Relacionada": [
      "recMsyvsIxU9TpLEf"
    ],
    "Repuesto": "Pantalla 15.6\" 30 Pines ",
    "Resumen de Uso de Repuesto": "Pantalla 15.6\" 30 Pines  $65",
    "Precio Cliente": "**[ENMASCARADO]**"
  }
}
```

</details>

---

### Servicios

| Propiedad | Valor |
|---|---|
| ID tabla | `tbl4F5QIHPAMwfTNy` |
| Campo primario | `Servicio` |
| Registros aprox. | 50 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | Servicio | `fld8lzBLsm9mmEOCg` | `singleLineText` |  | ✅ |
| 2 | Orden Relacionada | `fld2dAF6iNt3DLeST` | `multipleRecordLinks` | → **Órdenes de Reparación**  [1:N]  campo inverso: `fldvMc9Tq3bftcQAw` | ✅ |
| 3 | Costo | `fldh3ZaeK5ONZ2yyv` | `currency` |  | ✅ |
| 4 | Resumen de Uso de Repuesto | `flddrltAuk1miKXRJ` | `aiText` | {'referencedFieldIds': ['fld8lzBLsm9mmEOCg', 'fld2dAF6iNt3DLeST', 'fldbiGKlbXCLT | ✅ |
| 5 | Órdenes de Reparación | `fldHWTrQhoLjyPJ20` | `multipleRecordLinks` | → **Órdenes de Reparación**  [N:M]  campo inverso: `fldnYKHXQtQRoa8iN` | ✅ |
| 6 | Resumen  | `fldLlHGIK9fqKJKvk` | `formula` | `{fld8lzBLsm9mmEOCg} & " $" & {fldh3ZaeK5ONZ2yyv}
` | ⚠️ reconstruir |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec0QP2LLko5gjkma",
  "fields": {
    "Servicio": "Cambio de pasta térmica (desktop GPU) + limpieza ",
    "Resumen ": "Cambio de pasta térmica (desktop GPU) + limpieza  $45",
    "Resumen de Uso de Repuesto": {
      "state": "error",
      "errorType": "emptyDependency",
      "value": null,
      "isStale": false
    },
    "Costo": 45
  }
}
```

```json
{
  "id": "rec1pQucfC9T1WBSW",
  "fields": {
    "Servicio": "Formateo + Instalación SO PC",
    "Órdenes de Reparación": [
      "rec4Un555FxfIAHYI",
      "recbU6kcNna2XQ6gZ",
      "rec3eQRAbJT7lU9Zu",
      "recwL0Ndz323FL72Z",
      "recWYcuas7PGKbsoA",
      "recIQwl4NcvUTNaiO",
      "reclRhs49RoyV3qeV",
      "reckfb9geMAQQ3auH",
      "recxDazenTBUrKF8O",
      "recAlVGTffeWkQXgl",
      "rec2Txpx2SQ8zjJFy",
      "recFnQnxj2F6sMoR5",
      "recSVWQ1uU4Rzb9kF",
      "recxbaqWi8WJP9jPL",
      "recTX6r0rdyMCNpw2",
      "recJumLLrf97IlgAh",
      "recI2MCQ8AgkMJ0wS",
      "recWqgpnOauAHczrt",
      "rec3Xtb0LPdiMzF2o",
      "rechdabvdOHTGdrXz",
      "recLt6hXFoPNL9uRP",
      "rec6FTZm9eezZ572P",
      "recsLfrDmgKLAO2xm",
      "recXlpUX3pgYJv02Z",
      "recie7dWpXZoUjOb0",
      "reclTqxh2GNyImHUS",
      "recV83zkfiM5uqd3p",
      "rec2s6xIIgNyL2q4t",
      "reclyGHxLnaQz82nu",
      "recMaY8ytADWOYkKd",
      "recu87IUmExtoGKZ7",
      "recZwNPGuwz6HcfoQ",
      "recsiczwDaRK4AmJO",
      "rec2GJ8WRkmFiwkoq",
      "recmXpIYNUHi5xkRW",
      "recVkD5c3AAM0vHVB",
      "recbCsqMPYH72q5hQ",
      "recflXZaT99Wp8VuJ"
    ],
    "Resumen ": "Formateo + Instalación SO P
```

</details>

---

### Manual Técnico

| Propiedad | Valor |
|---|---|
| ID tabla | `tblsKsZN1yAqbqXgt` |
| Campo primario | `Cod.` |
| Registros aprox. | 6 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | Cod. | `fldxRGu8Rnwuz8yPh` | `autoNumber` |  | ⚠️ reconstruir |
| 2 | Notas | `fldjJ2jXm49pNGLHn` | `multilineText` |  | ✅ |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec8nfRsicuYsSn3b",
  "fields": {
    "Notas": "Tecla de Booteo laptops Dell con F2 para entrar a BIOS.\n",
    "Cod.": 2
  }
}
```

```json
{
  "id": "recG4e34JKP2GEqSH",
  "fields": {
    "Notas": "Tecla para opciones de Booteo laptops Dell con F12.",
    "Cod.": 1
  }
}
```

</details>

---

### Catálogo Repuestos

| Propiedad | Valor |
|---|---|
| ID tabla | `tblVA1jer1fd9wn4L` |
| Campo primario | `Nombre del repuesto` |
| Registros aprox. | 14 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | Nombre del repuesto | `fldyr1IqERnPcZTOW` | `singleLineText` |  | ✅ |
| 2 | Descripción corta | `fldghha7sQE8Pp9UV` | `multilineText` |  | ✅ |
| 3 | SKU o código interno | `fld3UMm8AxKapbYbl` | `singleLineText` |  | ✅ |
| 4 | Proveedor habitual | `fldPQVC2xA78qbnRX` | `singleLineText` |  | ✅ |
| 5 | Costo base | `fld3FoywL59d5Gqfm` | `currency` |  | ✅ |
| 6 | Precio sugerido al cliente | `fld8sDcr53ymgLLDg` | `currency` |  | ✅ |
| 7 | Activo | `fldOl4KnFAHj8j10q` | `checkbox` |  | ✅ |
| 8 | Fecha de creación | `fldd0klNz9VbTgVsC` | `date` | local | ✅ |
| 9 | Repuestos por Orden | `fldefzbXWqbNWvOnq` | `multipleRecordLinks` | → **Repuestos por Orden**  [N:M]  campo inverso: `fldred9O4CA4A7p3H` | ✅ |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec0fa5mx9MCFX01A",
  "fields": {
    "Costo base": 85,
    "Precio sugerido al cliente": "**[ENMASCARADO]**",
    "Activo": true,
    "Proveedor habitual": "SG",
    "Nombre del repuesto": "**[ENMASCARADO]**"
  }
}
```

```json
{
  "id": "rec8i7sD9gKkJ5t3A",
  "fields": {
    "Costo base": 25,
    "Precio sugerido al cliente": "**[ENMASCARADO]**",
    "Activo": true,
    "Proveedor habitual": "Miker",
    "Repuestos por Orden": [
      "receCfcKC9M5nmRK4",
      "recKEDHcim8esrOSc",
      "recCfcFGWKanrF7Kt",
      "recA8BBdBOzPOTCxw",
      "rec3z6hM25CH6m0Pi"
    ],
    "Nombre del repuesto": "**[ENMASCARADO]**"
  }
}
```

</details>

---

### Repuestos por Orden

| Propiedad | Valor |
|---|---|
| ID tabla | `tbl5N8VcE2ATm1aWe` |
| Campo primario | `Nombre del repuesto snapshot o copiado` |
| Registros aprox. | 19 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | Nombre del repuesto snapshot o copiado | `fldZB187zrLqvSVtk` | `singleLineText` |  | ✅ |
| 2 | Orden de Reparación | `fld3eSckKI1DfpbeT` | `multipleRecordLinks` | → **Órdenes de Reparación**  [1:N]  campo inverso: `fldOEJtazRcjOhaKr` | ✅ |
| 3 | Repuesto del Catálogo | `fldred9O4CA4A7p3H` | `multipleRecordLinks` | → **Catálogo Repuestos**  [1:N]  campo inverso: `fldefzbXWqbNWvOnq` | ✅ |
| 4 | Cantidad | `fldXOEp01dQjWOIlH` | `number` |  | ✅ |
| 5 | Costo proveedor real | `fldFLEm8IrJOicFeA` | `currency` |  | ✅ |
| 6 | Precio cliente real | `fldP2ULf6cfhBOtfq` | `currency` |  | ✅ |
| 7 | Subtotal cliente | `fldSnVG8R66yDOatz` | `formula` | `{fldXOEp01dQjWOIlH} * {fldP2ULf6cfhBOtfq}` | ⚠️ reconstruir |
| 8 | Subtotal costo | `fldiD3SAdCpjVa3Gq` | `formula` | `{fldXOEp01dQjWOIlH} * {fldFLEm8IrJOicFeA}` | ⚠️ reconstruir |
| 9 | Proveedor real | `fldzFA9nhX0SKNEYO` | `singleLineText` |  | ✅ |
| 10 | Observación | `fldGT4XVJaBhNV3nB` | `multilineText` |  | ✅ |
| 11 | Fecha de registro | `fldEXfOvflkoB8ejC` | `date` | local | ✅ |
| 12 | Resumen Repuesto Precio | `fld3ZWMiYwHSdYalA` | `formula` | `{fldZB187zrLqvSVtk} & " " & "$" & {fldFLEm8IrJOicFeA}` | ⚠️ reconstruir |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec3z6hM25CH6m0Pi",
  "fields": {
    "Resumen Repuesto Precio": "8GB Ram DDR4 3200 MHz Laptop $25",
    "Orden de Reparación": [
      "recJcAfAnxS1umwEb"
    ],
    "Fecha de registro": "2026-05-01",
    "Costo proveedor real": 25,
    "Precio cliente real": "**[ENMASCARADO]**",
    "Subtotal cliente": "**[ENMASCARADO]**",
    "Cantidad": 1,
    "Nombre del repuesto snapshot o copiado": "**[ENMASCARADO]**",
    "Subtotal costo": 25,
    "Repuesto del Catálogo": [
      "rec8i7sD9gKkJ5t3A"
    ],
    "Proveedor real": "Miker"
  }
}
```

```json
{
  "id": "rec7Gy4WsgceSSUF6",
  "fields": {
    "Resumen Repuesto Precio": "Motherboard Apple iMac Mid 2017 21.5\" A1418 i5-7400 + Fuente de energía $205",
    "Orden de Reparación": [
      "recbOgihN8Q0fUR12"
    ],
    "Fecha de registro": "2026-06-17",
    "Costo proveedor real": 205,
    "Precio cliente real": "**[ENMASCARADO]**",
    "Subtotal cliente": "**[ENMASCARADO]**",
    "Cantidad": 1,
    "Nombre del repuesto snapshot o copiado": "**[ENMASCARADO]**",
    "Subtotal costo": 205,
    "Repuesto del Catálogo": [
      "recSLCgXr24bYHUpm"
    ],
    "Proveedor real": "eBay"
  }
}
```

</details>

---

### Catálogo Servicios

| Propiedad | Valor |
|---|---|
| ID tabla | `tbl7QKK6dgA4T4Cnn` |
| Campo primario | `Nombre del servicio` |
| Registros aprox. | 43 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | Nombre del servicio | `fldGHgr8vMerkbupI` | `singleLineText` |  | ✅ |
| 2 | Descripción | `fld98FEEcBYsvYgWo` | `multilineText` |  | ✅ |
| 3 | Costo sugerido | `fldbdbHpa0Lml6vdP` | `currency` |  | ✅ |
| 4 | Activo | `fldD5m9BT8lmmLcyO` | `checkbox` |  | ✅ |
| 5 | Fecha de creación | `fldyeOFu03zLYfOjK` | `date` | local | ✅ |
| 6 | Servicios por Orden | `flduCdsKHfptsru80` | `multipleRecordLinks` | → **Servicios por Orden**  [N:M]  campo inverso: `fldOdTJ3s5f6s5Dbv` | ✅ |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec0YJ3AVnA90Ey4F",
  "fields": {
    "Descripción": "Servicio de Desbloqueo de Password ✅ y Programacion",
    "Activo": true,
    "Nombre del servicio": "**[ENMASCARADO]**",
    "Costo sugerido": 125
  }
}
```

```json
{
  "id": "rec2BCHRS5bEdzbUI",
  "fields": {
    "Descripción": "Programacion de Bios dañada  y corrupta",
    "Activo": true,
    "Nombre del servicio": "**[ENMASCARADO]**",
    "Costo sugerido": 125
  }
}
```

</details>

---

### Servicios por Orden

| Propiedad | Valor |
|---|---|
| ID tabla | `tblJn0nc9yxZdD1l7` |
| Campo primario | `Nombre del servicio snapshot o copiado` |
| Registros aprox. | 61 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | Nombre del servicio snapshot o copiado | `fld6xUkI5WgSgVNjQ` | `singleLineText` |  | ✅ |
| 2 | Orden de Reparación | `fldahPWzqV5JIMOyW` | `multipleRecordLinks` | → **Órdenes de Reparación**  [1:N]  campo inverso: `fldawVT0l14WeHJ90` | ✅ |
| 3 | Servicio del Catálogo | `fldOdTJ3s5f6s5Dbv` | `multipleRecordLinks` | → **Catálogo Servicios**  [1:N]  campo inverso: `flduCdsKHfptsru80` | ✅ |
| 4 | Costo real | `fldVDc4kxLYokiGTI` | `currency` |  | ✅ |
| 5 | Observación | `fldC94SF650YbUIG5` | `multilineText` |  | ✅ |
| 6 | Fecha de registro | `fldNcJgdJcTXRItMp` | `dateTime` | local 12hour | ✅ |
| 7 | Resumen Servicios Precio | `fld5r5oRIlgx0GnTm` | `formula` | `{fld6xUkI5WgSgVNjQ} & " " & "$" & {fldVDc4kxLYokiGTI}` | ⚠️ reconstruir |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec1uZ0qBBxsRVdk7",
  "fields": {
    "Resumen Servicios Precio": "Respaldo de información macOS $15",
    "Nombre del servicio snapshot o copiado": "**[ENMASCARADO]**",
    "Fecha de registro": "2026-06-04T00:00:00.000Z",
    "Servicio del Catálogo": [
      "recGAvQC3u5qeEAFJ"
    ],
    "Costo real": 15,
    "Orden de Reparación": [
      "rec68uVVf7Xw2MaSv"
    ]
  }
}
```

```json
{
  "id": "rec20pFPHtqA3bRwE",
  "fields": {
    "Resumen Servicios Precio": "Reparación y pegado de una bisagra $25",
    "Nombre del servicio snapshot o copiado": "**[ENMASCARADO]**",
    "Fecha de registro": "2026-06-19T00:00:00.000Z",
    "Servicio del Catálogo": [
      "recckU6U4NHWstHAi"
    ],
    "Costo real": 25,
    "Orden de Reparación": [
      "recblG8Nzk8HMJDst"
    ]
  }
}
```

</details>

---

### Abonos por Orden

| Propiedad | Valor |
|---|---|
| ID tabla | `tblLji4M4LcCEJHNd` |
| Campo primario | `ID Abono` |
| Registros aprox. | 42 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | ID Abono | `fldKLnZwvze4KrQWR` | `autoNumber` |  | ⚠️ reconstruir |
| 2 | Orden de Reparación | `fldnBvEnhciitPkmP` | `multipleRecordLinks` | → **Órdenes de Reparación**  [1:N]  campo inverso: `fldHiJvas6Kr491R8` | ✅ |
| 3 | Fecha | `fldmztLu9O6fSOwaZ` | `date` | iso | ✅ |
| 4 | Monto | `fldQmVjxuPNspufQB` | `currency` |  | ✅ |
| 5 | Método de pago | `fldufOuhmgDUBmg5s` | `singleSelect` | opciones: Efectivo, Transferencia, Tarjeta, PayPal | ✅ |
| 6 | Observación | `fldSrYbpnRHUHyqhS` | `multilineText` |  | ✅ |
| 7 | Registrado por | `fldBA3GzTmhDgE8rg` | `singleLineText` |  | ✅ |
| 8 | Comprobante | `fldPGzJhnfXz7qhU8` | `multipleAttachments` | {'isReversed': True} | ✅ |
| 9 | Movimiento Financiero ID | `fldShInW1xtFwH6ty` | `singleLineText` |  | ✅ |
| 10 | Cuenta Destino | `fldN1Uhc3sCPi1sVs` | `singleLineText` |  | ✅ |
| 11 | Estado Financiero | `fld48jfbL6pwWhypM` | `singleSelect` | opciones: Pendiente de registrar, Registrado en Finanzas, Error de sincronización, Anulado | ✅ |
| 12 | Fecha Sincronización Finanzas | `fld6jSUi7gRv1ZkDi` | `date` | local | ✅ |
| 13 | Error Sincronización Finanzas | `fldM52sJXg11ibXSw` | `multilineText` |  | ✅ |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec0SMrfITfRyJ821",
  "fields": {
    "ID Abono": 33,
    "Monto": 50,
    "Observación": "CLIENTE PAGO COMPLETO",
    "Fecha": "2026-06-06",
    "Orden de Reparación": [
      "reclOuv6g8H5clanZ"
    ],
    "Método de pago": "Efectivo"
  }
}
```

```json
{
  "id": "rec15CCrFxudghdTG",
  "fields": {
    "ID Abono": 27,
    "Comprobante": [
      {
        "id": "attVuT20sDlHYzB6s",
        "width": 960,
        "height": 1280,
        "url": "https://v5.airtableusercontent.com/v3/u/54/54/1782338400000/H-pIxCUbJIZSbKc13JQ7Ig/daauWA3Om2L-RNNKvUQhWE9oF2YfrUc1VCNsdXWQH-2SuDM2F3sXLzw0VHHQm_9GuAFNOFg8hZlmnKyHt1oYkV1R3lFswzakcadi9u4SU3ahRRFdXmntLlRen1J1baEwCmmwZ8UWYQthjyQRzt2DHb4jr5jqPar1pm0iPZYGGZp4CxyaUzppdbNIl2GBQ4kd/VLGQA_ApRTfbT15HQRSPF5tBGgC5twpJBgVlg-rdI8c",
        "filename": "WhatsApp Image 2026-05-28 at 12.58.18 PM.jpeg",
        "size": 123599,
        "type": "image/jpeg",
        "thumbnails": {
          "small": {
            "url": "https://v5.airtableusercontent.com/v3/u/54/54/1782338400000/qEJA_WXz5WrVLAg9T4arCQ/4BZh5GgDP-70nYUzp7xPvAKJzeZzuItYP-OLPkHR_iuAke7O5K6fPxpj7_aJ_pelIJzTivmcEOyNZI_1GUmgG3AB_K1M8TZy5t3fhXtenWVczM1DnM9fbKvTkApF-zexfZnU8E2SkCyyOuFQ6MZamQ/XmrSRQJ5dcO4XeQH1VDWQDhyTXPwWJnnrCFqTwYrKsY",
            "width": 27,
            "height": 36
          },
          "large": {
            "url": "https://v5.airtableusercontent.com/v3/u/54/54/1782338400000/s8Gqcw6ML1zbaT9z0gHnQQ/eVK2L3jIIv21jGVyPfglCwDaGyC51HSc
```

</details>

---

### Productos Digitales

| Propiedad | Valor |
|---|---|
| ID tabla | `tblYSH9sk8gUiNNDF` |
| Campo primario | `Producto Digital` |
| Registros aprox. | 7 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | Producto Digital | `fldCLWeE40cltxoP1` | `formula` | `{fldjmS5gMb9k2Gvvy} & " · " & {fldyirN1bHDTZiXR0} & " · " & DATETIME_FORMAT({fldAJWrIyegGByJtu}, 'DD/MM/YYYY')` | ⚠️ reconstruir |
| 2 | Software / Producto | `fldjmS5gMb9k2Gvvy` | `multipleRecordLinks` | → **Catálogo Productos Digitales**  [1:N]  campo inverso: `fldX7p3bCyHucjlWQ` | ✅ |
| 3 | Marca Producto | `fld6I6bQrBfZeuVxE` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldjmS5gMb9k2Gvvy', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 4 | Tipo Producto | `fldnNibRekfsRkASO` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldjmS5gMb9k2Gvvy', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 5 | Logo Producto | `fldZSMhcYlXBZZGU4` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldjmS5gMb9k2Gvvy', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 6 | Portal de Activación Catálogo | `fld8SCgPLQy2UedpQ` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldjmS5gMb9k2Gvvy', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 7 | Instrucciones PDF Catálogo | `fldBLDV39y5awZEua` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldjmS5gMb9k2Gvvy', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 8 | Notas para Cliente Catálogo | `fldTVBu603YeeRnws` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldjmS5gMb9k2Gvvy', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 9 | Precio Venta Catálogo | `fld3DqlB6sNRN2nop` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldjmS5gMb9k2Gvvy', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 10 | Color Principal Producto | `fldZEpR5ABHgNvYt2` | `multipleLookupValues` | {'isValid': True, 'recordLinkFieldId': 'fldjmS5gMb9k2Gvvy', 'fieldIdInLinkedTabl | ⚠️ reconstruir |
| 11 | Proveedor | `fld73IrSxaBI5J2Km` | `singleLineText` |  | ✅ |
| 12 | Costo Proveedor | `fldSCBJmR7gOgj1rN` | `currency` |  | ✅ |
| 13 | Precio Venta | `fld8RUEAApf9rGDpM` | `currency` |  | ✅ |
| 14 | Estado | `fldyirN1bHDTZiXR0` | `singleSelect` | opciones: Disponible, Reservado, Usado, Anulado, Vencido | ✅ |
| 15 | Clave de Activación | `fld3aNaglLCDszHbn` | `multilineText` |  | ✅ |
| 16 | Usuario / Correo | `fldXq1NOlunLwNygD` | `singleLineText` |  | ✅ |
| 17 | Contraseña | `fldsKvVeaoRd9mkQo` | `multilineText` |  | ✅ |
| 18 | Duración | `fldmubZA7NriScx4a` | `singleSelect` | opciones: Perpetua, 1 año, 3 meses, 6 meses, 9 meses, 2 años, 3 años | ✅ |
| 19 | Expira | `fldvE66sCIOKsZQlf` | `formula` | `SWITCH(
  {fldmubZA7NriScx4a},
  "1 año", DATEADD({fldAPUIazGR3gohY5}, 1, 'years'),
  "2 años", DATEADD({fldAPUIazGR3…` | ⚠️ reconstruir |
| 20 | Fecha de Compra | `fldAJWrIyegGByJtu` | `date` | local | ✅ |
| 21 | Fecha de Uso / Venta | `fldAPUIazGR3gohY5` | `date` | local | ✅ |
| 22 | Orden de Reparación | `fldgmB4Jmt25imuqZ` | `multipleRecordLinks` | → **Órdenes de Reparación**  [1:N]  campo inverso: `fldtqloWdhppncHcH` | ✅ |
| 23 | Cliente | `fldujZsWM9q0JeXHU` | `multipleRecordLinks` | → **Clientes**  [1:N]  campo inverso: `fldvSVWsULLVdoRNE` | ✅ |
| 24 | Tipo de Uso | `fld52IceDuhsav3o2` | `singleSelect` | opciones: Orden de reparación, Venta directa, Uso interno | ✅ |
| 25 | Usado/Vendido por | `fldN0IurXvC3ckHbK` | `singleLineText` |  | ✅ |
| 26 | Usuario ID Portal | `fldGohKw58wKxm9hF` | `singleLineText` |  | ✅ |
| 27 | Observaciones Internas | `fldPzefKgUQqLnWwo` | `multilineText` |  | ✅ |
| 28 | Comprobante / Evidencia | `fld9wIZLFZrfIeaVm` | `multipleAttachments` | {'isReversed': True} | ✅ |
| 29 | Ganancia | `fldD1m5U54ZWZI0ae` | `formula` | `{fld8RUEAApf9rGDpM} - {fldSCBJmR7gOgj1rN}` | ⚠️ reconstruir |
| 30 | Producto Seguro | `fld0XULx9GdHR4KEl` | `formula` | `{fldjmS5gMb9k2Gvvy} & " - " & {fldyirN1bHDTZiXR0}` | ⚠️ reconstruir |
| 31 | Documento generado por | `fldDwJhClfgKYsKNQ` | `singleLineText` |  | ✅ |
| 32 | Fecha último PDF | `fldMoPW1RPXcF7yvV` | `dateTime` | local 12hour | ✅ |
| 33 | Documento PDF | `fldgVoSFT801Y6P3d` | `multipleAttachments` | {'isReversed': False} | ✅ |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "recINlh91EM4H8Lms",
  "fields": {
    "Producto Seguro": "McAfee AntiVirus 1 Year - Usado",
    "Precio Venta Catálogo": [
      20
    ],
    "Clave de Activación": "3V36M-56S2L-RLC93-V49GM-A2J4D",
    "Tipo de Uso": "Orden de reparación",
    "Proveedor": "Electronicfirst",
    "Precio Venta": 20,
    "Fecha de Compra": "2026-06-23",
    "Fecha de Uso / Venta": "2026-06-23",
    "Producto Digital": "McAfee AntiVirus 1 Year · Usado · 23/06/2026",
    "Ganancia": 17.31,
    "Documento generado por": "Joseph Bolaños (**EMAIL**)",
    "Usuario ID Portal": "recO2t2irrvQQGaFd",
    "Fecha último PDF": "2026-06-23T22:55:57.280Z",
    "Usado/Vendido por": "Joseph Bolaños",
    "Costo Proveedor": 2.69,
    "Logo Producto": [
      {
        "id": "attBGbW52Yv6l4Udn",
        "width": 447,
        "height": 447,
        "url": "https://v5.airtableusercontent.com/v3/u/54/54/1782338400000/itAh2UcmnylWLkJvstUqZQ/HvqmUkfEZbfhlXBPbOTATsYd-qX7IBaCLHEBOI5nvkS5uUheHME8AVG3rHT3XE1NTXWq6HcA5ySYpSSsZnq-Vfm0rQjcNR_YTCPCJoGiYdN7ZOyY3tzPXoA48_5PxN0yi7luBl_DpBwzkCA1A5JcLntUEHOeufmfg71mila1CguUbjiZvVKBX5S7vXvjr046/DjkmHqNPpr6X4-wsYE2qxjfFWVc4LCMzA0CEucoT3xQ",
        "filename": "WhatsApp Image
```

```json
{
  "id": "recMBosUEwYd0R85h",
  "fields": {
    "Producto Seguro": "Windows 11 Pro - Disponible",
    "Precio Venta Catálogo": [
      25
    ],
    "Clave de Activación": "DMJNW-QX4BP-PFM4F-J633M-7MH26",
    "Marca Producto": [
      "Microsoft"
    ],
    "Proveedor": "Electronicfirst",
    "Precio Venta": 25,
    "Portal de Activación Catálogo": [
      "Configuración de Windows > Sistema > Activación"
    ],
    "Fecha de Compra": "2026-06-15",
    "Instrucciones PDF Catálogo": [
      "1. Abra el menú Inicio de Windows. \\n2. Ingrese a Configuración. \\n3. Seleccione Sistema. \\n4. Entre en Activación. \\n5. Busque la opción Cambiar clave de producto. \\n6. Ingrese la clave de 25 caracteres entregada por SUPER GEEK. \\n7. Pulse Siguiente y espere la validación de Microsoft. \\n8. Si Windows solicita reiniciar el equipo, guarde sus archivos y reinicie. \\n9. Después del reinicio, vuelva a Configuración > Sistema > Activación y confirme que Windows aparece como activado. \\n\\nNota: si el equipo tiene Windows 11 Home, el proceso puede actualizarlo a Windows 11 Pro. Es necesario tener conexión a internet durante la activación."
    ],
    "Producto Digital": "Windows 11 Pro · Di
```

</details>

---

### Catálogo Productos Digitales

| Propiedad | Valor |
|---|---|
| ID tabla | `tbliX19myJzRpx6e2` |
| Campo primario | `Producto Base` |
| Registros aprox. | 6 |

#### Campos

| # | Nombre | ID | Tipo | Detalle | Migrable |
|---|---|---|---|---|---|
| 1 | Producto Base | `fldXD4qLlrmc7BZpT` | `singleLineText` |  | ✅ |
| 2 | Marca | `fldzFUekojKI8OX4V` | `singleLineText` |  | ✅ |
| 3 | Tipo | `fldiQISEPAsUmVU94` | `singleSelect` | opciones: Clave de activación, Usuario/Contraseña, Suscripción, Otro | ✅ |
| 4 | Logo | `fld9J60pHNP55ufRK` | `multipleAttachments` | {'isReversed': True} | ✅ |
| 5 | Portal de Activación | `fldhyyJgkXfKkEt5B` | `url` |  | ✅ |
| 6 | Instrucciones PDF | `fldGW7QSXEWfbHJgd` | `multilineText` |  | ✅ |
| 7 | Notas para Cliente | `fldUQLf4IATkwxwqE` | `multilineText` |  | ✅ |
| 8 | Precio Venta Catálogo | `fld7QrNmtkP3gSjXX` | `currency` |  | ✅ |
| 9 | Color Principal | `fldCtBK0RrNgAn71G` | `singleLineText` |  | ✅ |
| 10 | Activo | `fldpE2mGxjial5ICy` | `checkbox` |  | ✅ |
| 11 | Productos Digitales | `fldX7p3bCyHucjlWQ` | `multipleRecordLinks` | → **Productos Digitales**  [N:M]  campo inverso: `fldjmS5gMb9k2Gvvy` | ✅ |
| 12 | Link | `fldrgtNiAURnWAh0Y` | `url` |  | ✅ |

<details>
<summary>Muestra (2 registros)</summary>

```json
{
  "id": "rec5IdIYuH11B6G0j",
  "fields": {
    "Precio Venta Catálogo": 30,
    "Logo": [
      {
        "id": "attLaO3hErOlgQ4oN",
        "width": 1080,
        "height": 1080,
        "url": "https://v5.airtableusercontent.com/v3/u/54/54/1782338400000/n9zxqnB2WRXrMsv_PwcvPw/4g-NWExV-Ad_Mn-AdmjKNfHLycXsTnCLh9T6OyxJeUlj-XaSZuL-61z34Ew03KcwOPC8_iOWoBEbGLtjUNpzyaGpZaDIsDzBbIFRI8c29aSdxQDiPIsvwbMIcD1iT2-nwZEHv7RsAZm9PbB3xF7jWHcTtDfqjmNDtB60vJOMoJ-OR5LJ9TTkY05hW541y3cGypbm2u01xpGjyMNXJrBkOC4s0HQGwKZ7NfxSGGjW78vgQGZlNnB-tmPpONvkyln7/grGsTD_aLqpRDo3lIadLXW33sTxB0c3NIT32wDpoxS0",
        "filename": "microsoft-office-professional-plus-2021-lifetime-for-1-dig-office-2021-key-ny-hb.png",
        "size": 148878,
        "type": "image/png",
        "thumbnails": {
          "small": {
            "url": "https://v5.airtableusercontent.com/v3/u/54/54/1782338400000/2crUgyhQF9tKzo4WGa_isw/DFIZRkx3ul0xSpAIyOyHTQ4Hox0VsnGF2jXpgedAfUbrGQXN1d5PBoZEvbSLdXRjvmbLsjhks-tKq5ejrWa_LFJeS0QBjtbs9Riz_Vh3Psv5HUTEpCGq7SYygis9Y05XIQteOBBldyt7FUiVL8izNw/J7hjF3fgU8fhJFKbonOcIXF3qBCh35PgZrtNfwgqZiI",
            "width": 36,
            "height": 36
          },
          "large": {
            "url": "https:
```

```json
{
  "id": "recFVRcX2Rs4zfYuV",
  "fields": {
    "Precio Venta Catálogo": 25,
    "Logo": [
      {
        "id": "att78InUJQbuxy0yz",
        "url": "https://v5.airtableusercontent.com/v3/u/54/54/1782338400000/BbFrZHqrd2SkESouvEi3uQ/UDkHuR4uV62laC2irhgZRMSE72DR0kgExDMxnz2iNojsz16GbqL2CQqoh72s64dTWmayT4A3yMqqLWFfGsS6Um2f7HB4BwW3Fwk9zuh_tHuAJ40hHCnaJCPgyJlmuOeybCEDQwRJsfl2HkhoEDM9dZoC_UYXfxqCllY_jv7ACKa4RuNgLEokBpHQb4LmkmXU/2x6T1j1cG78m5Bp9ME-0wKjIv2xAEjOfJxo6O8sYLfU",
        "filename": "PT_RGB_Windows11_Home_EN_1555x1555-1.avif",
        "size": 7077,
        "type": "image/avif"
      }
    ],
    "Producto Base": "Windows 11 Home-Licencia",
    "Tipo": "Clave de activación",
    "Activo": true,
    "Marca": "Microsoft"
  }
}
```

</details>

---

## Campos NO migrables tal cual

Estos campos deben reconstruirse manualmente en la base destino (o reemplazarse
por campos planos). Incluyen: `createdTime`, `lastModifiedTime`, `autoNumber`,
`createdBy`, `lastModifiedBy`, `formula`, `lookup`, `rollup`, `count`, `button`.

| Tabla | Campo | Tipo |
|---|---|---|
| Órdenes de Reparación | ID | `formula` |
| Órdenes de Reparación | Autonumber | `autoNumber` |
| Órdenes de Reparación | ClienteTXT | `multipleLookupValues` |
| Órdenes de Reparación | Telefono | `multipleLookupValues` |
| Órdenes de Reparación | Cedula | `multipleLookupValues` |
| Órdenes de Reparación | Fecha de Ingreso | `createdTime` |
| Órdenes de Reparación | Presupuesto | `formula` |
| Órdenes de Reparación | Estado Actual Text | `formula` |
| Órdenes de Reparación | Detalle Rollup | `rollup` |
| Órdenes de Reparación | URL Seguimiento | `formula` |
| Órdenes de Reparación | Resumen Servicios | `rollup` |
| Órdenes de Reparación | Costo Total Servicios | `rollup` |
| Órdenes de Reparación | Número de Repuestos Usados | `count` |
| Órdenes de Reparación | Resumen Repuestos | `rollup` |
| Órdenes de Reparación | Costo Total de Repuestos | `rollup` |
| Órdenes de Reparación | Total a pagar | `formula` |
| Órdenes de Reparación | Costo Total Servicios NV | `rollup` |
| Órdenes de Reparación | Costo Total Repuestos NV | `rollup` |
| Órdenes de Reparación | Total Productos Digitales | `rollup` |
| Órdenes de Reparación | Total a Pagar NV | `formula` |
| Órdenes de Reparación | Saldo NV | `formula` |
| Órdenes de Reparación | Total Abonado NV | `rollup` |
| Órdenes de Reparación | Generar PDF | `button` |
| Órdenes de Reparación | Enviar PDF | `button` |
| Órdenes de Reparación | Imprimir Ticket | `button` |
| Órdenes de Reparación | Todos Estados | `rollup` |
| Órdenes de Reparación | Enviar Reporte Whatsapp | `button` |
| Órdenes de Reparación | Proximo mantenimiento | `formula` |
| Órdenes de Reparación | Ultima Modificacion | `lastModifiedTime` |
| Órdenes de Reparación | URL de impresión | `formula` |
| Órdenes de Reparación | URL Etiqueta Zebra | `formula` |
| Órdenes de Reparación | Resumen Repuestos por Orden | `rollup` |
| Órdenes de Reparación | Resumen Servicios por Orden | `rollup` |
| Órdenes de Reparación | Resumen General Presupuesto  | `formula` |
| Clientes | Número de Órdenes | `count` |
| Clientes | Última Fecha de Ingreso | `rollup` |
| Clientes | Fecha de registro | `createdTime` |
| Clientes | ChatWhatsApp | `button` |
| Historial de Estados | Equipo | `multipleLookupValues` |
| Historial de Estados | Ingresa Por | `multipleLookupValues` |
| Historial de Estados | Fecha | `createdTime` |
| Historial de Estados | Teléfono | `multipleLookupValues` |
| Historial de Estados | Cliente | `multipleLookupValues` |
| Historial de Estados | Estado Actual Text | `multipleLookupValues` |
| Historial de Estados | Presupuesto | `multipleLookupValues` |
| Historial de Estados | Abono | `multipleLookupValues` |
| Historial de Estados | Enviar Whatsapp | `button` |
| Historial de Estados | Todos Estados Rollup (from Órdenes de Reparación) | `rollup` |
| Historial de Estados | Resumen Repuestos | `multipleLookupValues` |
| Historial de Estados | Repuestos Servicios | `multipleLookupValues` |
| Historial de Estados | Resumen General Presupuestos | `rollup` |
| Repuestos Usados | Resumen de Uso de Repuesto | `formula` |
| Servicios | Resumen  | `formula` |
| Manual Técnico | Cod. | `autoNumber` |
| Repuestos por Orden | Subtotal cliente | `formula` |
| Repuestos por Orden | Subtotal costo | `formula` |
| Repuestos por Orden | Resumen Repuesto Precio | `formula` |
| Servicios por Orden | Resumen Servicios Precio | `formula` |
| Abonos por Orden | ID Abono | `autoNumber` |
| Productos Digitales | Producto Digital | `formula` |
| Productos Digitales | Marca Producto | `multipleLookupValues` |
| Productos Digitales | Tipo Producto | `multipleLookupValues` |
| Productos Digitales | Logo Producto | `multipleLookupValues` |
| Productos Digitales | Portal de Activación Catálogo | `multipleLookupValues` |
| Productos Digitales | Instrucciones PDF Catálogo | `multipleLookupValues` |
| Productos Digitales | Notas para Cliente Catálogo | `multipleLookupValues` |
| Productos Digitales | Precio Venta Catálogo | `multipleLookupValues` |
| Productos Digitales | Color Principal Producto | `multipleLookupValues` |
| Productos Digitales | Expira | `formula` |
| Productos Digitales | Ganancia | `formula` |
| Productos Digitales | Producto Seguro | `formula` |

## Mapa de Relaciones

Formato: `Tabla A.[Campo] → Tabla B  (PK de B)  [cardinalidad]`

- **Órdenes de Reparación**.[Cliente] → **Clientes**  (PK: `Nombre`)  [1:N]
- **Órdenes de Reparación**.[Historial de Estados] → **Historial de Estados**  (PK: `Estado Nuevo`)  [N:M]
- **Órdenes de Reparación**.[Servicios] → **Servicios**  (PK: `Servicio`)  [N:M]
- **Órdenes de Reparación**.[Repuestos Usados] → **Repuestos Usados**  (PK: `Repuesto`)  [N:M]
- **Órdenes de Reparación**.[Repuestos Usados copy] → **Servicios**  (PK: `Servicio`)  [N:M]
- **Órdenes de Reparación**.[Repuestos por Orden] → **Repuestos por Orden**  (PK: `Nombre del repuesto snapshot o copiado`)  [N:M]
- **Órdenes de Reparación**.[Servicios por Orden] → **Servicios por Orden**  (PK: `Nombre del servicio snapshot o copiado`)  [N:M]
- **Órdenes de Reparación**.[Abonos] → **Abonos por Orden**  (PK: `ID Abono`)  [N:M]
- **Órdenes de Reparación**.[Productos Digitales] → **Productos Digitales**  (PK: `Producto Digital`)  [N:M]
- **Clientes**.[Órdenes Relacionadas] → **Órdenes de Reparación**  (PK: `ID`)  [N:M]
- **Clientes**.[Productos Digitales] → **Productos Digitales**  (PK: `Producto Digital`)  [N:M]
- **Historial de Estados**.[Órdenes de Reparación] → **Órdenes de Reparación**  (PK: `ID`)  [N:M]
- **Repuestos Usados**.[Orden Relacionada] → **Órdenes de Reparación**  (PK: `ID`)  [1:N]
- **Servicios**.[Orden Relacionada] → **Órdenes de Reparación**  (PK: `ID`)  [1:N]
- **Servicios**.[Órdenes de Reparación] → **Órdenes de Reparación**  (PK: `ID`)  [N:M]
- **Catálogo Repuestos**.[Repuestos por Orden] → **Repuestos por Orden**  (PK: `Nombre del repuesto snapshot o copiado`)  [N:M]
- **Repuestos por Orden**.[Orden de Reparación] → **Órdenes de Reparación**  (PK: `ID`)  [1:N]
- **Repuestos por Orden**.[Repuesto del Catálogo] → **Catálogo Repuestos**  (PK: `Nombre del repuesto`)  [1:N]
- **Catálogo Servicios**.[Servicios por Orden] → **Servicios por Orden**  (PK: `Nombre del servicio snapshot o copiado`)  [N:M]
- **Servicios por Orden**.[Orden de Reparación] → **Órdenes de Reparación**  (PK: `ID`)  [1:N]
- **Servicios por Orden**.[Servicio del Catálogo] → **Catálogo Servicios**  (PK: `Nombre del servicio`)  [1:N]
- **Abonos por Orden**.[Orden de Reparación] → **Órdenes de Reparación**  (PK: `ID`)  [1:N]
- **Productos Digitales**.[Software / Producto] → **Catálogo Productos Digitales**  (PK: `Producto Base`)  [1:N]
- **Productos Digitales**.[Orden de Reparación] → **Órdenes de Reparación**  (PK: `ID`)  [1:N]
- **Productos Digitales**.[Cliente] → **Clientes**  (PK: `Nombre`)  [1:N]
- **Catálogo Productos Digitales**.[Productos Digitales] → **Productos Digitales**  (PK: `Producto Digital`)  [N:M]

## Tablas candidatas a catálogo compartido

Estas tablas podrían compartirse con `SUPER GEEK ADM` en lugar de duplicarse:

- **Clientes** (353 registros)
- **Repuestos Usados** (36 registros)
- **Servicios** (50 registros)
- **Manual Técnico** (6 registros)
- **Catálogo Repuestos** (14 registros)
- **Repuestos por Orden** (19 registros)
- **Catálogo Servicios** (43 registros)
- **Servicios por Orden** (61 registros)
- **Catálogo Productos Digitales** (6 registros)

⚠️ **Clientes** en particular merece revisión: si `SUPER GEEK ADM` ya tiene
tabla de clientes (p. ej. en el módulo de facturación), evaluar si se unifican
o si se mantienen separadas por dominio.
