# Bitácora — paso a producción de facturación electrónica

**Fecha del corte:** viernes 14 de agosto de 2026
**Sistema anterior:** apagado ese mismo día en la serie `001-002`
**Primera factura real:** `001-002-000000674`

Este documento es el punto de partida cuando algo falle en facturación. No
repite lo que ya está en los diseños y auditorías previas: los enlaza y cuenta
qué se hizo, por qué, y qué mirar primero cuando algo no cuadre.

---

## 1 · Índice rápido de averías

| Síntoma | Dónde mirar | Sección |
|---|---|---|
| El SRI rechaza con "secuencial registrado" | `SRI_SECUENCIAL` en Vercel | [2](#2--los-datos-del-corte) |
| La etiqueta dice PRUEBAS y debería decir PRODUCCIÓN | Vercel: hay que **redesplegar** | [7.1](#71--cambié-una-variable-en-vercel-y-no-pasa-nada) |
| Una venta no descontó stock | ¿La línea se eligió del buscador? | [7.2](#72--una-venta-no-descontó-inventario) |
| Una factura salió sin encabezado SUPER TIENDA GEEK | Faltan variables en Vercel | [2](#2--los-datos-del-corte) |
| El SRI aceptó una cédula inventada | No debería: ver validación | [4.4](#44--validación-real-de-identificación) |
| No encuentro cómo crear una nota de crédito | Clic en la fila de la factura | [7.3](#73--no-aparece-el-botón-de-nota-de-crédito) |
| Los ingresos parecen el doble de lo vendido | Circuito de notas de crédito | [4.7](#47--circuito-contable-de-la-nota-de-crédito) |
| La firma electrónica caducó | Pantalla de firma, sin desplegar | [4.1](#41--gestión-de-la-firma-electrónica) |

---

## 2 · Los datos del corte

Variables en Vercel el día del corte. **Ninguna se toca sin entender qué hace.**

| Variable | Valor |
|---|---|
| `SRI_AMBIENTE` | `2` — producción. Antes del corte era `1` |
| `SRI_RUC` | `1003710272001` |
| `SRI_RAZON_SOCIAL` | `BOLAÑOS FLORES ALEXIS RUBEN` |
| `SRI_NOMBRE_COMERCIAL` | `SUPER TIENDA GEEK` |
| `SRI_ESTABLECIMIENTO` / `SRI_PUNTO_EMISION` | `001` / `002` |
| `SRI_DIR_MATRIZ` | Cristobal Colón entre Vicente Ramón Roca y Atahualpa, edificio Kaillari |
| `SRI_DIR_ESTABLECIMIENTO` | C. Vicente Ramón Roca y C. Cristobal Colón |
| `SRI_OBLIGADO_CONTABILIDAD` | `NO` |
| `CONSUMIDOR_FINAL_LIMITE` | `50` |
| `SRI_SECUENCIAL` | `000000674` — semilla, ver abajo |
| `SRI_SECUENCIAL_NC` | `000000002` — semilla, ver abajo |
| `FIRMA_MASTER_KEY`, `SRI_FIRMA_P12_BASE64`, `SRI_FIRMA_PASSWORD` | secretos de la firma |

### Sobre las semillas de numeración

`SRI_SECUENCIAL` es **el siguiente número a emitir**, no el último usado. Y
**solo se usa cuando Airtable no tiene ninguna factura de ese ambiente**. En
cuanto existe una, Airtable manda y la variable se ignora.

Últimos números del sistema viejo, leídos el día del corte:

```
última factura        001-002-000000673   →  semilla 000000674
última nota de crédito 001-002-000000001   →  semilla 000000002
```

> `.env.local` (tu máquina) se queda en `SRI_AMBIENTE=1` **a propósito**. Si le
> pones `2`, cualquier prueba local emitiría facturas reales.

---

## 3 · Cómo se comprobó que funcionaba

La clave de acceso de la primera factura lo dice todo:

```
14082026 01 1003710272001 2 001002 000000674 24978494 1 1
   │      │       │       │    │        │
 fecha  factura  RUC      │  serie  secuencial
                    AMBIENTE = 2 → PRODUCCIÓN
```

Verificado en la primera factura: autorizada por el SRI, ambiente PRODUCCIÓN en
Airtable, RIDE con encabezado y dirección correctos, correo al cliente,
movimiento en Finanzas con trazabilidad a la factura, y visible en SRI en Línea.

---

## 4 · Qué se construyó

### 4.1 · Gestión de la firma electrónica

**El problema:** la firma vivía en variables de entorno. Renovarla exigía tocar
Vercel y desplegar.

**Ahora:** se sube desde `/facturacion/firma`. El `.p12` y su contraseña se
guardan cifrados con AES-256-GCM en la tabla `Configuración Firma Electrónica`.
La llave maestra está en `FIRMA_MASTER_KEY`. Se conserva el respaldo por
variable de entorno como plan B.

- Avisos a los 60, 30, 15, 7 y 1 día
- Con la firma vencida **se bloquea la emisión**, con un mensaje claro en vez
  del error críptico del SRI
- Cambiar la firma no requiere desplegar nada

`lib/facturacion/firma/` · pruebas `firma.carga`, `firma.gestion`, `firma.avisos`, `resolverP12`

### 4.2 · Numeración independiente por ambiente

Las facturas de prueba consumían numeración de producción. Ahora la consulta del
máximo secuencial filtra por `Ambiente`: son dos cuentas separadas que no se
pisan.

`lib/facturacion/secuencial/asignar.ts` · prueba `4a.secuencial`

### 4.3 · Una factura enviada al SRI ya nunca se pierde

Antes, si el SRI tardaba, la emisión moría por timeout y la factura quedaba
autorizada en el SRI pero sin registro en el portal. Ahora se guarda un registro
`RECIBIDA` **antes** de esperar la autorización, y si se agota el tiempo se
devuelve "EN PROCESAMIENTO" en vez de un error.

En el historial hay **⟳ Consultar estado** para recuperarla.

### 4.4 · Validación real de identificación

**El problema:** el SRI autorizó una factura con la cédula inventada
`893849324`. El portal no validaba nada y adivinaba el tipo de documento.

**Ahora:**

- Dígito verificador real: módulo 10 para cédula y RUC de persona natural,
  módulo 11 con coeficientes distintos para sector público y sociedades
- El tipo de documento **se elige, se guarda y nunca se adivina** (campo
  `Cliente - Tipo Identificación`)
- Soporte de identificación extranjera (`08`) y pasaporte (`06`)
- Fail-closed: vacío o tipo desconocido → no se emite

`lib/facturacion/reglas/identificacion.ts` · prueba `identificacion`

### 4.5 · Corregir y reenviar

Cuando el SRI rechaza una factura, **el número y la clave de acceso no se
pierden**. Se corrigen los datos del comprador y se reenvía **la misma factura**.

- Los campos de identidad del documento (secuencial, clave, fecha) son de solo
  lectura: no se pueden cambiar
- Solo el mismo día. En otro día, ese número queda registrado como no emitido y
  se emite uno nuevo
- El historial de intentos se acumula en `Mensajes SRI`
- Los códigos de error del SRI se traducen a español con qué hacer en cada caso

`lib/facturacion/reglas/correccion.ts`, `lib/facturacion/sri/errores.ts` · pruebas `correccion`, `sri.errores`

### 4.6 · Una venta de mostrador descuenta inventario

**Encontrado en la primera factura real de producción.** El endpoint de emisión
exigía `body.origen` para disparar el descuento, y ese campo solo lo traen las
facturas nacidas de una orden o una operación comercial. Una venta de mostrador
no lo tiene.

Lo grave no era que no descontara: era que **sí verificaba el stock antes de
vender**. El sistema confirmaba existencias, autorizaba la venta ante el SRI y
dejaba el inventario intacto.

La condición vive ahora en `debeIntentarPostEmision()`, que **no recibe el
origen** — así no puede volver a depender de él.

`lib/facturacion/gancho/postEmision.ts` · prueba `mostrador.descuentaStock`

> Una prueba anterior **afirmaba el bug** ("postEmision debe estar condicionado
> a que el body traiga origen") y, al arreglarlo, siguió pasando por coincidencia
> textual: el regex no estaba anclado. Reescrita para mirar la condición
> concreta, y verificada al revés reintroduciendo el fallo.

### 4.7 · Circuito contable de la nota de crédito

**El problema:** una NC no tocaba Finanzas. La razón era correcta —no devuelve
efectivo— pero incompleta: el ingreso original seguía registrado y la factura de
reemplazo registraba ingreso otra vez.

```
Venta de $100                      Ingreso  +100
Devuelve → nota de crédito                 (nada)
Compra otra cosa con el crédito    Ingreso  +100
                                   ─────────────
                                   ingresos  200   con $100 de dinero real
```

**Ahora, tres asientos:**

| Momento | Movimiento | Categoría | Cuenta |
|---|---|---|---|
| Se autoriza la NC | Egreso por el total | `Devolución` | ninguna |
| Factura de reemplazo | Ingreso *(ya existía)* | Venta… | según forma de pago |
| El crédito caduca a los 6 meses | Ingreso por el saldo | `Crédito Caducado` | ninguna |

Ninguno de los dos nuevos mueve caja: son asientos contables.

| Situación | Neto | Dinero real |
|---|---|---|
| Devuelve y compra otra cosa | 100 | 100 ✓ |
| Devuelve y el crédito caduca | 100 | 100 ✓ |
| Devuelve y el crédito sigue vivo | 0 | 100, pero debes mercadería ✓ |

**Caducidad:** 6 meses desde la autorización. Regla comercial de SUPER GEEK, **no
del SRI**. Se procesa con el botón **⏳ Procesar caducidades** en
`/facturacion/nota-credito/historial`. Es idempotente: pulsarlo de más no
duplica ingresos.

Detalle completo en [`DISENO_NC_REVERSA_Y_CADUCIDAD.md`](./DISENO_NC_REVERSA_Y_CADUCIDAD.md).

`lib/finanzas/puentes/notaCredito.ts`, `lib/finanzas/puentes/notaCreditoCaducidad.ts`,
`lib/facturacion/notaCredito/caducidad.ts` · pruebas `notaCredito.caducidad`,
`notaCredito.puenteContable`, `notaCredito.procesarCaducidades`

### 4.8 · Migración de items del sistema viejo

285 artículos del sistema de facturación anterior pasados a `Shipping Items`:
**250 creados (611 unidades)**, 35 omitidos por duplicados, servicios o licencias.

Herramienta de un solo uso, no una pantalla del portal. Guía en
[`scripts/migracion-items/COMO_USARLO.md`](../scripts/migracion-items/COMO_USARLO.md).

Los items creados llevan `[MIGRACION-SISTEMA-VIEJO 2026-08-14]` en la
Descripción: esa marca identifica el lote completo si algún día hay que
revisarlo o deshacerlo.

**Lo que evitó:** 67 unidades de un disco SSD de 120GB estaban a punto de
duplicarse porque el nombre difería ("Disco Duro Interno SSD 120GB" contra
"Disco Duro Sólido Interno 120GB 2.5 SATA"). Habrían quedado 119 discos donde
hay 67.

---

## 5 · Reglas de negocio que no se negocian

**Consumidor final.** Desde enero de 2026 (resolución NAC-DGERCGC25-00000017),
una factura emitida a consumidor final **no admite nota de crédito ni
anulación**. Si algo sale mal, no hay corrección electrónica posible. Por eso
las facturas de control del corte se emitieron todas con cédula o RUC.

**Plazos.** Anulación hasta el día 7 del mes siguiente. Nota de crédito sin tope
de 12 meses (lo eliminó la misma resolución). El crédito interno de SUPER GEEK
caduca a los 6 meses — eso es regla de la casa, no del SRI.

**Una factura rechazada conserva su número.** No se reemplaza por uno nuevo. Se
corrige y se reenvía la misma.

**Los dos sistemas nunca emiten a la vez en la misma serie.** Por eso el orden
del corte fue: apagar el viejo → fijar semillas → cambiar ambiente.

---

## 6 · Trampas del proyecto

Valen para cualquier trabajo futuro en este código.

- **Airtable se referencia por NOMBRE** de tabla y de campo. Una tilde de más
  rompe todo en silencio.
- **La API de Airtable no puede crear campos**, fórmulas, rollups ni lookups.
  Eso se hace a mano en la interfaz.
- **Nunca filtrar por un campo de tipo enlace**: falla en silencio y devuelve
  vacío. Se usa el campo inverso, o se lee por `RECORD_ID()`.
- **Los enlaces son bidireccionales.** Borrar uno lo borra del otro lado.
- **Vercel congela las variables de entorno al desplegar.** Cambiarlas en el
  panel no afecta a un deploy vivo: hay que redesplegar.
- **`typecast: true` CREA la opción** si no existe en un desplegable. Para
  valores críticos se escribe sin typecast, para que un error falle y se vea.
- **Aparecer poco en el código no significa estar muerto.**
- Antes de confiar en un campo calculado, leer [`ESQUEMA.md`](./ESQUEMA.md):
  documenta cuáles ignora el código a propósito.

---

## 7 · Si algo falla

### 7.1 · Cambié una variable en Vercel y no pasa nada

Vercel congela las variables al desplegar. **Redesplega:** Deployments → el de
producción → `⋯` → Redeploy. Después recarga forzando caché (`Cmd+Shift+R`).

Pista para reconocerlo: en Vercel la variable dice *"Updated just now"* y el
deployment dice *"Created 52m ago"*.

### 7.2 · Una venta no descontó inventario

Solo descuentan las líneas **elegidas del buscador de productos**. Las añadidas
con **"+ Agregar línea manual"** no tocan inventario nunca — es a propósito, para
poder facturar servicios y cosas que no están en stock.

Cómo distinguirlas al facturar: la línea elegida del buscador muestra el stock
disponible al lado. La escrita a mano no muestra nada.

Si la línea sí venía del buscador, mirar el campo `Sincronización Inventario` de
la factura en Airtable y usar **⟳ Sincronizar** en el historial.

### 7.3 · No aparece el botón de nota de crédito

Las acciones están **dentro del panel de detalle**: hay que hacer clic sobre la
fila de la factura en `/facturacion/historial`. El botón "Notas de crédito" de la
cabecera lleva al listado, no a crear una.

Requisitos para que aparezca: factura `AUTORIZADO` y con sus líneas guardadas.

### 7.4 · "Secuencial registrado"

El número que se intentó usar ya lo consumió el sistema viejo. El sistema avanza
solo hasta 3 números; más allá hay que subir `SRI_SECUENCIAL` en Vercel y
redesplegar.

### 7.5 · El SRI tarda y sale "En procesamiento"

**No emitir otra factura por esa venta.** Esperar y pulsar **⟳ Consultar estado**
en el historial. La factura no se ha perdido.

### 7.6 · Hay que deshacer la migración de items

Buscar en `Shipping Items` por `MIGRACION-SISTEMA-VIEJO` en la Descripción. Esa
marca identifica el lote completo.

---

## 8 · Lo que queda pendiente

| | Cuándo | Qué |
|---|---|---|
| **Firma electrónica** | antes del **2 de septiembre de 2026** | Comprar en Security Data y cargarla en `/facturacion/firma`. No hace falta tocar Vercel ni desplegar |
| Crear NC desde su listado | sin prisa | Desde `/facturacion/nota-credito/historial` no se puede iniciar una; hay que entrar por el detalle de la factura |
| Precio de venta vacío | sin prisa | 116 de los ~450 Shipping Items no tienen `Precio venta final`. Decisión de Alex: se llenan a mano cuando toque |
| Cron de caducidades | cuando el volumen lo pida | Hoy se procesa con un botón. El endpoint ya sirve tal cual para colgarlo de un cron de Vercel |

---

## 9 · Mapa de archivos

### Código

```
lib/facturacion/
  emitirFactura.ts               emisión al SRI (puro: no toca inventario ni finanzas)
  config.ts                      lectura de variables de entorno
  firma/                         almacén cifrado, vigencia, inspección del .p12
  secuencial/asignar.ts          numeración, filtrada por ambiente
  reglas/
    identificacion.ts            cédula, RUC, pasaporte, extranjero
    correccion.ts                qué se puede cambiar al reenviar
    stock.ts                     verificación ANTES de emitir
    totales.ts                   el servidor recalcula, no confía en el navegador
  gancho/postEmision.ts          descuento de inventario tras AUTORIZADO
  notaCredito/
    emitirNotaCredito.ts
    caducidad.ts                 reglas puras de los 6 meses
    revertirInventario.ts
  sri/errores.ts                 códigos del SRI traducidos

lib/finanzas/puentes/
  facturacion.ts                 ingreso al emitir
  notaCredito.ts                 reversa del ingreso al autorizar la NC
  notaCreditoCaducidad.ts        ingreso cuando el crédito caduca
```

### Pruebas

52 archivos en `lib/facturacion/__tests__/`. Se ejecutan sueltos:

```bash
NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/<nombre>.test.ts
```

No hay corredor de pruebas en el proyecto: son scripts con `assert()` que salen
con código distinto de cero si algo falla.

**45 son puras** (lógica en memoria, sin red). **7 hablan de verdad con
Airtable y/o el SRI**, usando las credenciales reales de `.env.local` — no
existe una base de Airtable de pruebas separada, así que escriben en SUPER
GEEK ADM tal cual:

- `4a.secuencial`
- `4e.integracion.fase4`
- `5.ride-ajustes`
- `5a.recuperar`
- `5b.emitir664`
- `6.shipping-item-firma`
- `integracion.celcer`

Las siete están protegidas por `lib/facturacion/__tests__/_guardaRed.ts`:
para correrlas hay que anteponer `PRUEBAS_CON_RED=1` a propósito —

```bash
PRUEBAS_CON_RED=1 NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/<nombre>.test.ts
```

— y si `SRI_AMBIENTE=2` (producción), el guardián las bloquea sin excepción,
tenga o no `PRUEBAS_CON_RED=1`: no hay caso legítimo para correr estos
scripts sueltos contra el SRI de producción.

### Documentos relacionados

| Documento | Qué contiene |
|---|---|
| [`ESQUEMA.md`](./ESQUEMA.md) | Mapa de la base de Airtable y qué campos calculados ignora el código |
| [`AUDITORIA_FACTURACION_FASE16.md`](./AUDITORIA_FACTURACION_FASE16.md) | Auditoría del módulo antes de todo esto |
| [`AUDITORIA_FASE17_18_FACTURACION_PRODUCCION_NOTAS_CREDITO.md`](./AUDITORIA_FASE17_18_FACTURACION_PRODUCCION_NOTAS_CREDITO.md) | Hallazgos pre-producción y notas de crédito |
| [`DISENO_NC_REVERSA_Y_CADUCIDAD.md`](./DISENO_NC_REVERSA_Y_CADUCIDAD.md) | El circuito contable de la NC, en detalle |
| [`DISENO_FASE16_GANCHO_FACTURACION.md`](./DISENO_FASE16_GANCHO_FACTURACION.md) | Conexión cuenta unificada → facturación |
| [`scripts/migracion-items/COMO_USARLO.md`](../scripts/migracion-items/COMO_USARLO.md) | La herramienta de migración de items |

---

## 10 · Método de trabajo

Vale la pena conservarlo porque evitó varios accidentes.

- **Una rama por trabajo, nunca directo en `main`.** Commits frecuentes.
- **Respaldo antes de cambios.** Duplicar la base de Airtable con datos.
- **Disciplina extra con el dinero:** mirar el registro real, no deducir.
- **Paradas de control** en los pasos irreversibles, y el paso siguiente no
  arranca hasta confirmar el anterior.
- **Cada PR verifica después del merge** que sus commits quedaron en `main`. Esto
  existe porque el PR #56 se mergeó con un commit de menos y el fallo que
  arreglaba siguió vivo en producción sin que nadie lo notara.
- **Las pruebas describen la regla, no la implementación.** Una prueba que
  afirmaba el bug pasó desapercibida durante semanas y siguió pasando después de
  arreglarlo.
