# Esquema de Airtable — dónde está la verdad

Base única: **SUPER GEEK ADM** (`appLkmz7I6vqJ2UXc`). Todos los módulos leen y
escriben ahí con `AIRTABLE_API_KEY` + `AIRTABLE_BASE_ID`.

## Cómo consultar el esquema real

**No hay ni debe haber un snapshot manual del esquema completo en `docs/`.**
Hasta julio de 2026 vivían aquí `sgadm-schema.json`, `sgadm-schema-raw.json` y
`gestion-ordenes-schema.json`: 983 KB que describían una base **anterior a la
migración**. Conocían tablas ya borradas (`Cotizaciones`, `Opciones de
Cotización`, `Abonos de Cotización`) y desconocían las vivas (`Órdenes de
Reparación`, `Operación Comercial`, `Abonos`, `Opciones`, `Reservas`,
`Clientes`). Cualquiera que los consultara sacaba conclusiones falsas, así que
se eliminaron. Están en el historial de git si alguna vez hacen falta.

Para ver el esquema actual:

```bash
curl -s -H "Authorization: Bearer $AIRTABLE_API_KEY" \
  "https://api.airtable.com/v0/meta/bases/$AIRTABLE_BASE_ID/tables" \
  | jq -r '.tables[] | "\(.id)\t\(.name)\t\(.fields|length) campos"'
```

## Lo único que sí se versiona

`lib/shipping-v2/schema.generated.ts` y su `.json` — **solo las tablas de
Shipping V2**. Se regeneran con:

```bash
npm run shipping-v2:schema
```

Nunca se editan a mano. El código valida al arrancar que coincidan con la base
(`assertShippingV2GeneratedSchema`), así que una diferencia se nota enseguida.

## Tablas vivas — 48 al 28-jul-2026

| Dominio | Tablas |
|---|---|
| Inventario | `Shipping Items`, `Shipping Packings`, `Shipping Pagos`, `Shipping Proveedores`, `Shipping Recepciones`, `Shipping Novedades`, `Shipping Eventos`, `Shipping Destinatarios`, `Shipping Migraciones` |
| Taller | `Órdenes de Reparación`, `Servicios por Orden`, `Productos Digitales`, `Historial de Estados`, `Repuestos por Orden` *(histórica, congelada)* |
| Comercial | `Operación Comercial`, `Opciones`, `Clientes` |
| Dinero | `Abonos`, `Movimientos Financieros`, `Cuentas Financieras`, `Finanzas Cuadres`, `Abonos por Orden` *(histórica, conciliada 128/128)* |
| Facturación | `Facturas Electrónicas`, `Notas de Crédito Electrónicas`, `Proformas`, `Recibos`, `Reservas` |
| Catálogos | `Catálogo Repuestos`, `Catálogo Servicios`, `Catálogo Productos Digitales`, `Catálogo CPUs`, `Catálogo Computadores`, `Catálogo Conectividad`, `Catálogo Puertos`, `Catálogo Características Extras`, `Manual Técnico` |
| Personal | `Usuarios`, `Registro Accesos`, `Codigos 2FA`, `Notificaciones` |
| Horarios | `Configuración Horarios`, `Horarios Registros`, `Horarios Marcaciones`, `Horarios Ajustes`, `Horarios Periodos de Pago`, `Horarios Pagos` |
| Legacy Shipping V1 | `Item`, `Proveedores` |

Esta lista se verificó contra la Metadata API el 28-jul-2026. Si al consultarla
hoy el número no da 48, la lista está vieja: manda el `curl` de arriba, no esta
tabla.

## Campos calculados que el código NO lee

Existen en Airtable pero la aplicación los ignora a propósito. Si aparecen en
una vista, no son la fuente de verdad:

| Campo | Por qué se ignora |
|---|---|
| `Shipping Items."Total Cubierto"` / `"Saldo Item"` | Repartían el abono completo de la operación a cada artículo, sin prorratear |
| `Operación Comercial."Total Cotizado"` / `"Saldo Pendiente"` | El campo era manual y se quedó sin escritor; el total se deriva de la opción elegida |
| `Órdenes."Abonos"` → `Abonos por Orden` | Espejo pre-migración; el total sale de la tabla `Abonos` |

## Campos calculados que el código SÍ usa

`Órdenes."Total a Pagar NV"` y `"Saldo NV"` deben coincidir siempre con lo que
muestran las pantallas. Si no coinciden, algo se rompió. Su fórmula está
documentada en `AUDITORIA_INTEGRAL_ITEMS_ORDENES_COTIZACIONES.md`.
