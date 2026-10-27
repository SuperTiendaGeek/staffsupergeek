# Reglas de diseño UX/UI del Portal Staff

Definidas por el dueño (Alex) el 27-oct-2026. Aplican a **todo diseño o rediseño** de pantallas.

## Principio: interfaces compactas para usuarios recurrentes

El sistema lo usan a diario empleados que aprenden y mecanizan sus procesos. Se diseña priorizando la
eficiencia operativa, la claridad visual y una alta densidad de información útil.

- Nada de diseño sobreexplicativo, verbosidad innecesaria ni sobrecarga cognitiva.
- Los formularios no son manuales de instrucciones.
- Etiquetas breves, claras y descriptivas.
- Nada de tarjetas grandes para opciones simples: usar selectores, botones compactos o controles segmentados.
- Ayudas contextuales, tooltips o divulgación progresiva solo cuando aporten valor.
- Reducir el desplazamiento vertical y aprovechar bien el espacio.
- No repetir información que el usuario ya conoce o que es evidente por el contexto.
- Priorizar la velocidad de operación y la facilidad de aprendizaje sin sacrificar la prevención de errores.
- Los mensajes extensos se reservan para excepciones, decisiones complejas o acciones de alto riesgo.
- Animaciones suaves, fluidas y con propósito: muestran cómo cada acción impacta el sistema (causa → efecto).
  No son decorativas. Usar las existentes en `app/globals.css` (`sg-entrada`, `sg-destello`, `sg-sacudir`,
  `sg-panel`, `sg-modal`, `sg-velo`, `sg-salida`), que respetan `prefers-reduced-motion`.

## Regla fundamental

**Una interfaz administrativa se optimiza para el uso número 100, no solo para el primero.**

Antes de implementar una pantalla, evaluar si cada texto, tarjeta, explicación y espacio es realmente necesario
para completar la operación. No eliminar funcionalidades ni información crítica: simplificar su presentación.

## Cómo se aplicó por primera vez (auditoría ops, punto 1)

- La orden no deja emitir si falta cobrar: la acción principal pasa a "Registrar pago" (el error se evita donde
  nace, no en la pantalla siguiente).
- La pantalla de emisión muestra origen y estado de la cuenta en una sola línea, con un chip de estado.
- Las líneas bloqueadas llevan un candado con tooltip, sin texto repetido en cada fila.
