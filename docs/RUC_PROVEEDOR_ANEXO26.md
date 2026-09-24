# RUC Proveedor en infoAdicional (Anexo 26)

**Norma:** Resolución NAC-DGERCGC26-00000027 (R.O. 5.º Supl. 335, 28-jul-2026), art. 5 ·
Ficha Técnica de Comprobantes Electrónicos Offline **v2.34, Anexo 26** (27-jul-2026).
**Plazo:** 60 días calendario desde la publicación → **26-sep-2026**.

## Qué exige la ficha (texto oficial)

| Elemento | Valor |
|---|---|
| Nodo | `<infoAdicional>` |
| Tag | `<campoAdicional>` |
| Atributo `nombre` | **`RUC Proveedor`** (exacto) |
| Contenido | Número de RUC del proveedor |
| Formato / largo | Alfanumérico, máx. 300 |

Ejemplo: `<campoAdicional nombre="RUC Proveedor">1003710272001</campoAdicional>`
En el RIDE aparece como fila de "Información adicional": `RUC Proveedor | 1003710272001`.

## Situación de SUPER GEEK

Sistema **propio, de uso interno, no comercializado**: no es "proveedor" del art. 2, así que
**no** registra el CIIU J62021002/J62021003 ni establecimiento exclusivo. El Anexo 26 habla de
quien usa sistemas "de terceros"; el art. 5 dice "los sujetos pasivos emisores" sin excepción.
Decisión: incluir el campo igual, con el RUC del dueño del sistema. Si algún día se vende o
licencia el sistema a terceros, hay que revisar la obligación de registro (arts. 2 y 3).

## Implementación

- `lib/facturacion/reglas/rucProveedor.ts` — regla pura: normaliza el nombre, actualiza un campo
  existente (sin duplicar), agrega al final si no existe, bloquea si se pasaría de 15 campos.
- Factura: `construirInfoAdicionalFactura(..., rucProveedor)` le reserva su espacio antes de
  repartir el resto entre referencias de pago. Cubre mostrador, gancho, reservas, reintento y corrección
  (todos pasan por `emitirFactura()`).
- Nota de crédito: `emitirNotaCredito()` → `infoAdicionalConRucProveedor()` (XML y RIDE).
- Otros tipos (03, 05, 06, 07): cuando se agregue su emisor, pasar su infoAdicional por
  `infoAdicionalConRucProveedor()` justo antes de construir el XML.
- Nunca se toca `infoTributaria` ni el RUC emisor. Los comprobantes ya autorizados no se modifican
  (el RIDE regenerado desde un XML autorizado muestra lo que ese XML tenga).

## Variables de entorno

| Variable | Uso |
|---|---|
| `SRI_PROVEEDOR_SISTEMA_RUC` | RUC que va en el campo. Si falta → se usa `SRI_RUC` con aviso en logs. Si está mal escrita → la emisión se bloquea antes de pedir secuencial y de firmar. |
| `SRI_PROVEEDOR_SISTEMA_NOMBRE` | Solo referencia interna. **No** va al XML ni al RIDE. |

## Pruebas

- `npm test rucProveedor` — XML factura y NC, XSD de factura v2.1.0, sin duplicados, tope de 15,
  configuración, firma y RIDE.
- `PRUEBAS_CON_RED=1 npm test integracion.celcer.rucProveedor` — factura + NC reales en **celcer**
  (bloqueada si `SRI_AMBIENTE=2`; no escribe en Airtable).
- Verificado además (fuera del repo) contra el XSD oficial `NOTA_CREDITO-1.1.0.xsd` del SRI:
  NC con el campo válida sin firmar y firmada.
