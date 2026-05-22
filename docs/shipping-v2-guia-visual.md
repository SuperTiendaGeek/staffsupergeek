# Shipping V2 - Guia visual

Shipping V2 debe sentirse como una evolucion premium del Portal Staff: moderno, tecnologico, simple y enfocado en operacion. La referencia visual principal sera un dashboard oscuro con KPIs grandes, tarjetas limpias y acento lima/neon.

Esta referencia debe adaptarse al diseno actual del Portal Staff. No se debe copiar exactamente otro dashboard ni romper la identidad visual existente.

## Paleta base

- Fondo principal muy oscuro: `#1B1B1B` o `#1E1E1E`
- Tarjetas gris carbon: `#2A2A28` o `#2F2F2C`
- Texto principal claro: `#F5F5F5`
- Texto secundario gris: `#A7A7A7`
- Bordes suaves: `#3A3A36`
- Acento principal verde lima/neon: `#D7FF4F` o `#CFFF3A`
- Acentos secundarios opcionales: morado suave, naranja y amarillo, solo para graficos o estados secundarios

## Lenguaje visual

- Fondo oscuro continuo, sin bloques decorativos innecesarios.
- Tarjetas limpias, con gris carbon y bordes suaves.
- Bordes muy redondeados para tarjetas, paneles y botones.
- Botones tipo pildora para acciones principales o filtros futuros.
- KPIs grandes y faciles de escanear en el dashboard.
- Uso controlado del verde lima como acento de jerarquia, no como color dominante absoluto.
- Estados secundarios pueden usar morado suave, naranja o amarillo cuando aporten significado operativo.

## Aplicacion en Portal Staff

- Mantener compatibilidad visual con `PortalShell`, tipografia, espaciados y acentos actuales.
- Priorizar densidad clara sobre apariencia de landing page.
- Evitar pantallas de marketing; Shipping V2 debe abrir directo a experiencia operativa.
- Las tarjetas deben comunicar inventario, pagos, packings, recepcion y novedades con lectura rapida.
- La interfaz inicial puede ser read-only hasta que se definan formularios y escrituras.

## Variables de entorno Shipping

No reutilizar variables legacy como `AIRTABLE_ITEM_TABLE`, `AIRTABLE_PAGO_TABLE`, `AIRTABLE_PACKING_TABLE` o `AIRTABLE_PROVEEDORES_TABLE`.

Shipping usa las credenciales compartidas del Portal Staff y nombres de tablas internos definidos en `lib/shipping-v2/table-names.ts`.

```env
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=
```

Las tablas usadas por Shipping son exclusivamente:

- `Shipping Proveedores`
- `Shipping Items`
- `Shipping Pagos`
- `Shipping Finanzas Movimientos`
- `Shipping Packings`
- `Shipping Recepciones`
- `Shipping Novedades`
- `Shipping Migraciones`
- `Shipping Eventos`

No leer ni escribir desde Shipping en tablas legacy como `Item`, `Pago`, `Packing` o `Proveedores`.
