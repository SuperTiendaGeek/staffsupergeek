# Shipping V2: reglas de proveedores

Shipping V2 filtra las opciones de proveedores por configuración de la tabla `Shipping Proveedores`, no por nombres específicos.

## Proveedor de compra

Identifica de quién se compra el Item. Solo puede usarse un proveedor con `Estado proveedor = Activo` y `Tipo de proveedor` distinto de `Logístico`.

## Proveedor logístico / intermediario en Item

Identifica quién recibe o intermedia el Item antes de entrar a un packing. Solo puede usarse un proveedor activo que tenga al menos una de estas capacidades:

- `Puede recibir encargos de terceros`
- `Permite triangulación`
- `Puede armar packings`

## Proveedor logístico en Packing

La empresa logística final debe manejarse principalmente desde Packing. Para ese flujo, un proveedor activo puede ser elegible si cumple al menos una de estas condiciones:

- `Tipo de proveedor = Logístico`
- `Puede armar packings`
- `Permite triangulación`

Los selects muestran `Proveedor ID` cuando existe; si no, muestran `Nombre proveedor`; si ambos faltan, usan el record ID como fallback. El valor guardado en Airtable siempre sigue siendo el record ID del proveedor relacionado.
