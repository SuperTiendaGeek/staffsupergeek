# Referencias de las huellas de firma

Captura: 19 de noviembre de 2026, `node-forge` 1.4.0 y `fast-xml-parser` 5.9.3.
Los SHA-256 completos están fijados en `../firma.huella.test.ts`.

Las instantáneas XML se generaron con el certificado de juguete `test-cert.p12`.
Se omitió el contenido de `ds:X509Certificate` para no versionar ningún base64
de certificado. La huella se calcula sobre el XML completo en memoria.
Una diferencia muestra el primer carácter, línea, columna y contexto sin ese
contenido. Si solo cambia el certificado, el mensaje identifica ese elemento.

`notaCredito_v1.1.0.xsd` es el archivo original `NotaCredito_V1.1.0.xsd` del
[ZIP oficial del SRI](https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/dfc944cd-5f18-4433-a626-3cc64cfc4549/XML%20y%20XSD%20Nota%20de%20Cr%C3%A9dito.zip),
publicado en la sección de esquemas de [Facturación electrónica](https://www.sri.gob.ec/facturacion-electronica).
SHA-256: `379e9f270d71ab4578f130a736c9abe5eb1d7969375ecdef55d2973583ec5ab0`.
Se conserva sin modificaciones. `xmldsig-core-schema.xsd` es una copia del
esquema ya usado por las facturas para resolver su importación relativa sin red.
Ambos están aquí, dentro de fixtures: no activan la validación opcional de NC
del código de producción.

La prueba real solo persiste `{ version, sha256 }` fuera del repositorio. La
materialización del `.p12` de Airtable se intercepta en memoria y el fallback
del entorno se desactiva y restaura dentro de la prueba. Sin Airtable se omite.
