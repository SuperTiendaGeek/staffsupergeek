# Migrar los items del sistema viejo a Shipping Items

Tres pasos. Ninguno escribe en Airtable hasta el último, y el último hay que
pedirlo con una bandera explícita.

---

## 1 · Exportar del sistema viejo

Un `.csv` o `.xlsx` con estas columnas (los títulos pueden variar, el script los
reconoce por parecido):

| Necesario | Títulos que reconoce |
|---|---|
| **Sí** | nombre · descripción · título · artículo · item · producto |
| **Sí** | precio · precio venta · pvp |
| No | código · sku · referencia |
| No | cantidad · stock · existencia |
| No | costo · costo proveedor |

Guárdalo donde quieras, por ejemplo `~/Downloads/items-viejos.csv`.

> El precio se toma **con IVA incluido**, tal como lo tiene el sistema viejo, y
> va al campo `Precio venta final`.

---

## 2 · Analizar — solo lectura

```bash
NODE_OPTIONS="--conditions react-server" npx tsx scripts/migracion-items/analizar.ts ~/Downloads/items-viejos.csv
```

Lee el archivo, lee los Shipping Items que ya existen, y escribe
`scripts/migracion-items/revision.csv`. **No toca Airtable.**

Cada fila trae una decisión ya sugerida:

| clasificación | qué significa | decisión sugerida |
|---|---|---|
| `YA EXISTE` | Es el mismo artículo que ya está en el portal | `omitir` |
| `POSIBLE DUPLICADO` | Se parece a uno del portal, pero no es seguro | `revisar` |
| `NUEVO` | No está en el portal | `crear` |

### Abre `revision.csv` y revísalo

Es el punto de control. Solo dos columnas se editan:

- **DECISION** → `crear`, `omitir` o `revisar`
- **CATEGORIA** → si está vacía, ponla a mano

Las filas en `revisar` **no se crean**. Hay que decidirlas una por una.

Fíjate sobre todo en los `POSIBLE DUPLICADO`: el CSV pone al lado el nombre, el
SKU, la cantidad y el precio del artículo del portal con el que se confunde, y
el porcentaje de parecido. Con eso decides si es el mismo o no.

---

## 3 · Importar

Primero en seco, sin `--aplicar`. **Siempre.**

```bash
NODE_OPTIONS="--conditions react-server" npx tsx scripts/migracion-items/importar.ts
```

Muestra exactamente qué crearía, con qué SKU y con qué valores. No escribe nada.

Si todo se ve bien:

```bash
NODE_OPTIONS="--conditions react-server" npx tsx scripts/migracion-items/importar.ts --aplicar
```

### Lo que hace de red de seguridad

- Valida **todas** las filas antes de escribir una sola. Si una fila está mal
  (sin nombre, categoría inexistente, cantidad no entera, precio en cero), no
  crea **ninguna** y te dice cuáles fallan. O entra todo o no entra nada.
- Genera el SKU con la misma función del portal, así que no choca con los que ya
  existen.
- Marca cada item creado en la Descripción con
  `[MIGRACION-SISTEMA-VIEJO <fecha>]` y el código que tenía en el sistema
  anterior.

### Si hay que deshacerlo

Busca en Shipping Items por `MIGRACION-SISTEMA-VIEJO` en la Descripción: esa
marca identifica el lote completo y se puede borrar desde Airtable.

Antes de correr con `--aplicar`, duplica la base ("Duplicate base"). Es un
minuto y evita el mal rato.
