# Brief — Módulo Facturación Electrónica SRI (Ecuador)

> Documento de contexto para Claude Code. Léelo completo antes de generar código.
> Construiremos un módulo `Facturacion` dentro de un sistema TypeScript existente
> (sistema de inventario / gestión de productos). El objetivo es emitir
> comprobantes electrónicos válidos ante el SRI, empezando por **facturas**.

## 1. Decisión de arquitectura (no la cambies sin avisar)

La emisión tiene 6 pasos. Los separamos en dos bloques:

- **Firma XAdES-BES (paso 3) → librería externa `ec-sri-invoice-signer`.**
  Es la parte criptográfica delicada y propensa a error. NO la reimplementes.
  La librería firma los 6 tipos de comprobante y es TS/JS puro (sin binarios nativos).
- **Todo lo demás (pasos 1, 2, 4, 5, 6) → código propio en este módulo.**
  Generación del XML (según ficha técnica vigente), clave de acceso, cliente SOAP
  de recepción/autorización, y RIDE en PDF.

Razón: la firma cambia poco entre versiones de la ficha técnica; el *contenido del XML*
sí cambia con cada resolución. Al ser dueños de la generación del XML, lo mantenemos
al día contra el XSD vigente sin depender de una librería de terceros que pueda quedar
estancada (ese fue el problema de `open-factura`, congelada desde 2023).

## 2. El flujo de 6 pasos

1. **Generar XML** de la factura según el esquema XSD vigente del SRI.
2. **Clave de acceso** de 49 dígitos (8 + 2 + 13 + 1 + 6 + 9 + 8 + 1 + verificador módulo 11).
   → Ya existe implementación verificada en `claveAcceso.ts` (incluida). Úsala.
3. **Firmar** el XML con `ec-sri-invoice-signer` usando el `.p12`.
4. **Recepción**: enviar el XML firmado al web service `RecepcionComprobantesOffline`.
   Respuesta: `RECIBIDA` o `DEVUELTA` (con array de errores).
5. **Autorización**: consultar `AutorizacionComprobantesOffline` con la clave de acceso.
   Respuesta: `AUTORIZADO` o `NO AUTORIZADO` / `EN PROCESAMIENTO`.
6. **RIDE (PDF)** + entrega por correo (XML + PDF) + almacenamiento del XML por 7 años.

## 3. Reglas normativas críticas (2026)

- **Transmisión en tiempo real** (Resolución NAC-DGERCGC25-00000017, desde 01-ene-2026):
  el envío a recepción/autorización debe ocurrir **al momento de emitir**, NO en un
  batch nocturno. La emisión debe ser síncrona con la venta.
- **Fecha de emisión = fecha real de la operación.** Nada de fechas retroactivas.
- **Anulación**: solo hasta el día 7 del mes siguiente; requiere aceptación del receptor
  (5 días hábiles); facturas a consumidor final NO se anulan ni modifican. (Implementar
  en una fase posterior, no en el MVP.)

## 4. Compatibilidad con la ficha técnica

- La versión vigente del esquema es la **2.32 (noviembre 2025)**. Descarga los XSD
  oficiales del portal del SRI y genera los tipos / el builder de XML a partir de ELLOS.
  No inventes campos ni order de nodos: valida el XML generado contra el XSD.
- La **prueba de fuego** es emitir contra el ambiente de **pruebas** (`celcer`). El SRI
  valida el XML contra su XSD y devuelve el código de error exacto si algo no encaja.
  Esto es más confiable que cualquier documentación.

## 5. Endpoints del SRI

```
# Pruebas (celcer)
SRI_RECEPTION_URL=https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl
SRI_AUTHORIZATION_URL=https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl

# Producción (cel) — usar solo tras certificar en pruebas
SRI_RECEPTION_URL=https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl
SRI_AUTHORIZATION_URL=https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl
```

Nota: el RUC debe tener habilitado el ambiente (pruebas/producción) en el portal del SRI.

## 6. Estructura de archivos propuesta (ajústala al estilo del repo)

```
src/facturacion/
  index.ts                 # API pública del módulo (emitirFactura, consultarEstado, ...)
  claveAcceso.ts           # YA PROVISTO Y VERIFICADO — no reimplementar
  types/
    factura.ts             # tipos TS derivados del XSD 2.32
  xml/
    construirFacturaXml.ts  # JSON interno -> XML conforme al XSD
    validarXsd.ts           # validación contra el XSD oficial
  firma/
    firmar.ts               # wrapper sobre ec-sri-invoice-signer
  sri/
    recepcion.ts            # cliente SOAP RecepcionComprobantesOffline
    autorizacion.ts         # cliente SOAP AutorizacionComprobantesOffline
    cola.ts                 # reintentos / modo contingencia
  ride/
    generarRide.ts          # PDF (RIDE) a partir del comprobante autorizado
  almacenamiento/
    repositorio.ts          # persistencia del XML autorizado (retención 7 años)
  config.ts                 # carga de env vars, ambiente, rutas
  __tests__/
    claveAcceso.test.ts
    facturaXml.test.ts
    integracion.celcer.test.ts  # emite contra pruebas (no en CI por defecto)
```

## 7. Dependencias

- `ec-sri-invoice-signer` (firma).
- Un cliente SOAP (p. ej. `soap`/`strong-soap`) o construcción manual del envelope.
- Generación de PDF para el RIDE (la que ya use el sistema, o `pdfkit`/`puppeteer`).
- Validación XSD (p. ej. `libxmljs2` o equivalente).
  Confirma compatibilidad con el runtime del proyecto antes de elegir.

## 8. Seguridad

- El `.p12` y su contraseña **nunca** van al repositorio. Cárgalos desde variables de
  entorno / secret manager. El archivo se queda en el servidor del usuario (esa fue una
  decisión explícita: la firma no se entrega a terceros).
- Cifra el `.p12` en reposo y restringe accesos.

## 9. Manejo de errores y estados

- Captura y expón cada código de respuesta del SRI con una acción sugerida.
- Registra logs auditables con marca de tiempo de emisión, transmisión y autorización.
- Si recepción devuelve `DEVUELTA`, no reintentes ciegamente: corrige según el error.
- Si autorización queda `EN PROCESAMIENTO`, reconsulta con backoff.
- Reporta comprobantes "no autorizados en 24h".

## 10. Plan de construcción por fases

- **Fase 0 — Andamiaje.** Crear estructura de carpetas, `config.ts`, integrar
  `claveAcceso.ts`, instalar dependencias. Sin lógica de red aún.
- **Fase 1 — XML + tipos.** Derivar tipos del XSD 2.32 y construir
  `construirFacturaXml.ts`. Test: el XML valida contra el XSD oficial.
- **Fase 2 — Firma.** Wrapper sobre `ec-sri-invoice-signer`. Test: el XML firmado
  conserva validez de esquema.
- **Fase 3 — SOAP recepción + autorización (celcer).** Emitir una factura de prueba
  end-to-end contra `celcer` y obtener `AUTORIZADO`. Esta fase confirma la conformidad
  con la 2.32.
- **Fase 4 — RIDE + correo + almacenamiento.**
- **Fase 5 — Cola/contingencia, anulación, y endurecimiento.**

Empieza por la Fase 0 y no avances de fase sin tests verdes de la anterior.
