Cómo se construye la ficha
Son 6 archivos, todos en app/shipping-v2/recepcion/ficha/[id]/print/, cada uno con una responsabilidad clara:


page.tsx                      → carga datos de Airtable + normaliza (Server Component)
FichaVentaPrintTemplate.tsx   → dibuja la tarjeta + ajusta tamaños en el navegador (Client Component)
ficha-print.module.css        → todo el diseño visual (colores, tipografía, layout)
page.module.css               → la hoja A4 (dos mitades, línea de corte)
ficha-print-ready.ts          → señal para coordinar el ajuste con la impresión automática
ShippingV2PrintControls.tsx   → dispara window.print() cuando ?print=1
Flujo de datos
page.tsx recibe el id del item, llama a getShippingV2ItemById y getShippingV2TechnicalOptionSets (Airtable), y con funciones puras (screenLine, cpuModelLine, ramLine, etc.) arma un objeto FichaVentaData: strings ya formateados y listos para imprimir (ej. pantalla: "14\" 1920x1080 (FHD)", ram: "16GB RAM DDR4"). Si un campo falta, queda null y esa línea no se renderiza.
Antes de eso, valida con isFichaGenerada() (de lib/shipping-v2/technical-sheet.ts) si la ficha está lista; si no, redirige al editor o muestra "Ficha no generada".
Pasa ficha a FichaVentaPrintTemplate, que la renderiza dos veces (visualmente en page.module.css se arma la hoja con la mitad derecha vacía).
FichaVentaPrintTemplate es un client component: en el primer render pinta con tamaños aproximados (mm, calculados server-side), y con un useLayoutEffect (tras document.fonts.ready) mide el DOM real (scrollWidth/scrollHeight) y recalcula el font-size en píxeles para que cada línea llene el ancho disponible. Al terminar, avisa por ficha-print-ready.ts que ya puede imprimirse.
ShippingV2PrintControls escucha esa señal (con un timeout de respaldo) y recién ahí llama window.print().
Qué tocar según lo que quieras cambiar
Querés cambiar...	Tocá...
Qué campo de Airtable alimenta una línea (ej. usar otro campo de precio, otro texto de batería)	page.tsx — las funciones normalizadoras y buildFichaVentaData
Colores, familia tipográfica, bordes, padding de la tarjeta	ficha-print.module.css
Tamaño relativo de marca/modelo/batería (los que NO usan medición real)	FichaVentaPrintTemplate.tsx — la función fitWidthMm y sus llamadas (brandSizeMm, modelSizeMm, batterySizeMm)
Cómo se ajustan SO/pantalla/CPU×2/SSD/RAM/precio al ancho (fit-to-width real)	FichaVentaPrintTemplate.tsx — función fitLineToWidth y el useLayoutEffect
Comportamiento del bloque de conectividad (crece según espacio libre)	FichaVentaPrintTemplate.tsx — la búsqueda binaria dentro del mismo useLayoutEffect
Espaciado entre líneas	ficha-print.module.css — gap de .linesGroup y line-height de .line
Layout de la hoja A4 (una ficha, mitad vacía, línea de corte)	page.module.css
Qué dispara la impresión automática	ShippingV2PrintControls.tsx / ficha-print-ready.ts
Punto importante a tener en cuenta
FichaVentaPrintTemplate.tsx es un client component porque necesita medir el DOM real en el navegador — no se puede volver a hacer server-only sin perder el fit-to-width preciso. Cualquier cambio ahí que afecte tamaños/posiciones (padding, gap, nuevas líneas) probablemente requiera reajustar las constantes EDGE_SAFETY_PX, CARD_WIDTH_MM o los presupuestos de ancho (* 0.48, - 26, etc.) que dependen de la geometría actual de la tarjeta.

Si querés iterar visualmente contra docs/ficha-referencia.png, el patrón que usé todo este trabajo fue: crear una ruta temporal fuera del middleware de auth (app/dev-preview-ficha/[id]/page.tsx) que renderiza FichaVentaPrintTemplate con datos sintéticos o reales, capturarla con Chrome headless (--screenshot y --print-to-pdf), comparar, y borrar la ruta al terminar.