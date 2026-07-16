# Informe: unificacion de creacion de Shipping Items y errores de fotos

Fecha: 2026-07-16

## Resumen ejecutivo

Se detectaron dos puntos de riesgo antes de seguir agregando mejoras al modulo Shipping Items:

1. La creacion manual de items en Shipping V2 usa el helper central `createShippingV2Item`, que recalcula flujo, valida proveedores, genera/valida SKU, escribe en `Shipping Items` y registra evento.
2. La creacion indirecta desde Operaciones Comerciales escribe directamente en Airtable con campos hardcodeados, sin pasar por ese helper central.
3. El alta manual crea primero el item y luego sube fotos. Si las fotos fallan, el usuario puede quedar con una respuesta ambigua: el item existe, pero la UI puede mostrar error y no redirigir.

La recomendacion es corregir estos dos puntos antes de avanzar con nuevas mejoras funcionales, para que el modulo tenga una sola puerta confiable de creacion y una semantica clara de exito parcial.

## Hallazgo 1: dos caminos de creacion para Shipping Items

### Camino A: alta manual desde Shipping V2

Ruta de UI:

- `app/shipping-v2/items/nuevo/page.tsx`
- `app/shipping-v2/items/nuevo/ShippingV2NewItemForm.tsx`

Ruta API:

- `app/api/shipping-v2/items/route.ts`

Persistencia:

- `lib/shipping-v2/airtable.ts`
- Funcion principal: `createShippingV2Item`

Este camino tiene las reglas mas completas:

- exige sesion y permiso `Shipping`;
- recalcula el flujo en servidor con `applyCalculatedItemFlow`;
- valida campos obligatorios segun `Tipo de operacion`;
- valida proveedor de compra y proveedor logistico;
- genera SKU automatico si no se envia uno;
- rechaza SKU manual duplicado;
- registra un evento en `Shipping Eventos`;
- sube fotos despues de crear el item.

### Camino B: creacion desde Operaciones Comerciales

Ruta API:

- `app/api/operaciones/[id]/estado/route.ts`

Persistencia actual:

- `lib/operaciones/airtable.ts`
- Funcion principal: `crearShippingItemDesdeOpcion`

Este camino se activa cuando una operacion pasa a estado `Pedido` y tiene una `Opcion Elegida`. La funcion lee la opcion comercial y crea un registro en `Shipping Items` con datos como:

- `Nombre del item`
- `Descripcion`
- `SKU`
- `Categoria = Repuesto`
- `Tipo de item = Repuesto`
- `Estado Item = Pagado`
- `Reservado = true`
- `Disponible para venta = false`
- `Cantidad = 1`
- `Operacion Comercial`
- `Opcion origen`
- `Costo proveedor`
- `Precio venta sugerido`
- `Precio venta final`
- `Proveedor de compra`
- `Fotos`

El problema no es el resultado de negocio, sino el mecanismo: este camino escribe directo a Airtable y no pasa por la misma puerta de validacion que el alta manual. Eso crea divergencia y hace mas fragil cualquier mejora futura.

### Riesgos concretos

- Las reglas de flujo pueden divergir entre alta manual y alta desde Operaciones.
- Cambios futuros en `createShippingV2Item` no aplicarian al flujo de Operaciones.
- El evento de auditoria `Shipping Eventos` no queda garantizado en la creacion desde Operaciones.
- Los campos `Operacion Comercial` y `Opcion origen` existen en el schema real, pero no estan expuestos como constantes en `SHIPPING_V2_ITEM_FIELDS`; por eso el flujo actual usa strings literales.
- La creacion desde Operaciones puede saltarse validaciones nuevas de proveedores, SKU, modo logistico o estados.

## Hallazgo 2: semantica ambigua cuando fallan fotos

### Flujo actual

En el alta manual:

1. El servidor crea el item en `Shipping Items`.
2. Si hay fotos, intenta subirlas al campo `Fotos` usando el endpoint de contenido de Airtable.
3. Si todas las fotos fallan, `addFotosToShippingV2Item` lanza error.
4. El endpoint responde error aunque el item ya fue creado.
5. Si algunas fotos fallan, el endpoint responde `success: true` con `warning`.
6. El cliente interpreta `payload.warning` como error visible y no redirige.

### Riesgo operativo

El usuario puede creer que el item no se creo y volver a enviarlo. Eso puede producir duplicados o dejar al usuario atrapado en el formulario pese a que el registro ya existe.

La regla deseable es:

- si el item no se pudo crear, responder error;
- si el item se creo, responder exito siempre, aunque las fotos tengan advertencias;
- reportar el estado de fotos como advertencia no bloqueante;
- redirigir al item/listado creado y mostrar un aviso claro.

## Plan de correccion propuesto

### Fase 1: hacer central la creacion desde Operaciones

1. Extender la puerta central de Shipping Items para soportar metadatos de origen:
   - `operacionComercialId`
   - `opcionOrigenId`
   - fotos existentes por URL/attachment payload, cuando vienen desde Airtable `Opciones`

2. Ajustar el mapeo controlado para items creados desde Operaciones:
   - categoria: `Repuesto`
   - tipo item: `Repuesto`
   - tipo operacion recomendado: definirlo de forma explicita en el helper central, probablemente `Compra ya pagada` para conservar `Estado Item = Pagado`
   - cantidad: `1`
   - reservado: `true`
   - disponible para venta: `false`
   - precio sugerido/final desde `Precio Venta Cliente`
   - costo proveedor desde `Costo Proveedor`

3. Ajustar `applyCalculatedItemFlow` o el armado final de campos para que un item `Reservado = true` no quede tambien `Disponible para venta = true`.

4. Reemplazar la escritura directa en `crearShippingItemDesdeOpcion` por una llamada al helper central de Shipping.

5. Mantener en Operaciones la logica que solo corresponde a Operaciones:
   - leer la operacion;
   - leer la opcion elegida;
   - evitar duplicados usando el inverso `Articulo fisico`;
   - decidir cuando disparar la creacion.

6. Mover al modulo Shipping la logica que corresponde a Shipping:
   - validacion de flujo;
   - normalizacion de campos;
   - SKU;
   - escritura en `Shipping Items`;
   - evento en `Shipping Eventos`;
   - adjuntos iniciales si aplica.

### Fase 2: corregir respuesta de fotos en alta manual

1. Separar claramente "item creado" de "fotos subidas".

2. Cambiar la respuesta de `POST /api/shipping-v2/items` para que, una vez creado el item, responda `success: true` aunque las fotos fallen parcial o totalmente.

3. Agregar campos de respuesta claros, por ejemplo:
   - `photoUploadStatus`: `none | complete | partial | failed`
   - `photoWarning`: texto legible cuando aplique
   - `uploadedFotos`: numero de fotos subidas
   - `failedFotos`: nombres de fotos fallidas

4. Ajustar `ShippingV2NewItemForm`:
   - no tratar `warning` como error bloqueante si `success: true`;
   - redirigir despues de crear;
   - guardar un aviso en `sessionStorage` indicando si hubo problema con fotos.

5. Mantener la ruta de fotos para items existentes con semantica estricta: si la accion del usuario es "subir fotos" y todas fallan, ahi si debe responder error.

### Fase 3: pruebas y verificacion

Verificaciones minimas recomendadas:

- crear item manual sin fotos;
- crear item manual con fotos validas;
- simular/forzar fallo de fotos y confirmar que el item creado no se reporta como fallo total;
- crear item desde Operaciones al pasar a `Pedido`;
- confirmar que el item desde Operaciones tiene link a `Operacion Comercial` y `Opcion origen`;
- confirmar que no se crean duplicados si la operacion ya tiene `Articulo fisico`;
- confirmar que queda evento en `Shipping Eventos`;
- confirmar que SKU se genera igual que en el flujo manual;
- correr typecheck;
- correr pruebas existentes relacionadas con Shipping/Finanzas/Facturacion si el cambio toca esos bordes.

## Archivos que se tocarian

### Alta manual y fotos

- `app/shipping-v2/items/nuevo/ShippingV2NewItemForm.tsx`
- `app/api/shipping-v2/items/route.ts`
- `lib/shipping-v2/airtable.ts`

### Unificacion de creacion desde Operaciones

- `lib/operaciones/airtable.ts`
- `app/api/operaciones/[id]/estado/route.ts` si se necesita ajustar payload/respuesta
- `lib/shipping-v2/airtable.ts`
- `types/shipping-v2.ts` si se agregan campos tipados al input central

### Schema y constantes

Opcional, pero recomendado:

- `scripts/inspect-shipping-v2-schema.mjs`
- `lib/shipping-v2/schema.generated.ts`

Objetivo: exponer constantes para `Operacion Comercial` y `Opcion origen`, o definir una alternativa local documentada si se decide no regenerar schema ahora.

### Pruebas

No hay pruebas directas actuales para `createShippingV2Item` ni para `POST /api/shipping-v2/items`. Si se agrega cobertura, los candidatos naturales serian:

- tests unitarios de reglas de flujo en `lib/shipping-v2/item-operation-rules.ts`;
- tests de mapeo/creacion con doble de Airtable para `lib/shipping-v2/airtable.ts`;
- tests del caso "item creado pero fotos fallan".

## Criterio de exito

El cambio se considera listo cuando:

1. Todo Shipping Item nuevo, venga del alta manual o de Operaciones, pasa por una unica puerta central del modulo Shipping.
2. La creacion desde Operaciones conserva su comportamiento de negocio actual: item reservado, ligado a la operacion/opcion, con precio/costo/proveedor/fotos cuando existen.
3. Un fallo de fotos no se comunica como fallo total si el item ya fue creado.
4. El usuario siempre recibe una salida clara: creado correctamente, creado con advertencia de fotos, o no creado.
5. No quedan escrituras directas a `Shipping Items` desde Operaciones salvo que sean inevitables y esten documentadas.

## Decision antes de implementar

Antes de codificar conviene confirmar una decision de modelo:

Para items creados desde Operaciones Comerciales, el `Tipo de operacion` central deberia ser:

- opcion recomendada: `Compra ya pagada`, porque conserva la idea de item ya aprobado/pagado y permite que el flujo central sugiera `Estado Item = Pagado`;
- alternativa: crear una regla especial para `Repuesto` originado desde Operaciones, si el negocio quiere separarlo explicitamente del flujo de compras generales.

Mientras no se decida algo distinto, la implementacion recomendada es usar `Compra ya pagada` con override controlado de `Reservado = true` y `Disponible para venta = false`.
