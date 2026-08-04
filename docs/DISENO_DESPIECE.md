# Diseño — Pestaña "Despiece" en el detalle de un artículo

Ruta: `/shipping-v2/items/[id]` · pestaña nueva junto a General, Costos, Logística, Pago, Packing y Observaciones.

Despiezar es **desarmar un equipo para vender sus piezas por separado**: una laptop que no vale la pena reparar entera puede rendir una pantalla, un teclado, dos memorias RAM y un disco. El equipo padre deja de existir como tal; las piezas nacen como artículos propios del inventario.

---

## 1. Lo que ya existe y no hay que inventar

Al analizar la base aparecieron campos y estados creados para esto, que hoy nadie usa porque falta la pantalla:

| Campo | Para qué sirve |
|---|---|
| `Item padre` / `Items hijos` | El vínculo entre el equipo y sus piezas, en las dos direcciones |
| `Estado de despiece` | Su propia máquina de estados: *No aplica · Evaluando despiece · Destinado a partes · Despiece en proceso · Despiece parcial · Despiece completo · Cancelado* |
| `Es parte recuperada` | Marca una pieza como salida de un despiece, no comprada |
| `Costo asignado por despiece` | Cuánto del costo del equipo carga cada pieza |
| `Motivo de despiece`, `Fecha de despiece`, `Responsable de despiece` | El rastro de por qué, cuándo y quién |

Y `Estado Item` ya contempla **Destinado a partes**, **Desarmado parcialmente** y **Desarmado completamente**.

Es decir: el modelo de datos está completo. Falta la pantalla y las reglas.

---

## 2. Tu pregunta: "no hay dónde decir si funciona, si se probó o no funciona"

**Sí lo hay: el campo `Condición`.** Sus opciones son exactamente eso:

> Usado · Open Box · Nuevo · **Para partes** · **Dañado** · **No probado** · Reacondicionado · Otro

`Estado Item` responde *"¿en qué punto del recorrido está?"* (registrado, en tránsito, disponible, vendido). `Condición` responde *"¿en qué estado físico está?"*. Para una pieza recuperada, `Condición` es el campo correcto y no hace falta uno nuevo.

Propuesta: cada pieza nace con `Condición = "No probado"`, y quien la revisa la cambia a *Usado* (funciona), *Dañado* o *Para partes*.

---

## 3. Campos que faltaban en tu lista

Tu lista era: título, categoría, precio de venta, observación interna y estado. Faltan tres, y uno es importante.

**Cantidad.** Una laptop puede rendir **dos** memorias RAM iguales. Sin cantidad habría que crear dos filas idénticas. Como decidiste el modelo de un registro con cantidad, la fila debe permitir "RAM 8GB DDR4 — cantidad 2".

**Condición.** Lo del punto anterior.

**Costo asignado — este es el importante.** Si las piezas nacen con costo cero, cada venta parecerá 100% de ganancia y **tus reportes de utilidad mentirán**. Una laptop que te costó $200 y rinde 5 piezas: ese costo tiene que repartirse entre ellas.

Opcionales, según qué tanto detalle quieras: **número de serie** (útil para rastrear una pieza recuperada si vuelve por garantía) y **ubicación física**.

Todo lo demás se llena solo y no debe pedirse: SKU (automático por categoría), proveedor de compra (heredado del padre, para que el historial de compra siga cuadrando), `Tipo de item = "Parte"`, `Es parte recuperada = sí`, y el vínculo al padre.

---

## 4. Las dos decisiones de negocio que hay que tomar

### 4.1 ¿Cómo se reparte el costo del equipo entre sus piezas?

| Opción | Cómo funciona | Cuándo conviene |
|---|---|---|
| **Proporcional al precio de venta** *(recomendada)* | Si la pantalla se vende a $60 y el teclado a $20, la pantalla carga el 75% del costo | Es el mismo criterio que ya usas para repartir el flete de un packing. Automático y razonable |
| Manual por pieza | Tú escribes cuánto carga cada una | Máximo control, más trabajo, y es fácil que la suma no cuadre |
| Sin costo | Las piezas nacen en cero | Simple, pero infla artificialmente tu ganancia |

Detalle: lo que se reparte debe ser el **costo total del equipo** (`Costo total unidad`, que ya incluye flete y arancel), no solo el costo del proveedor. El flete que pagaste por traer la laptop también es parte de lo que te costó.

### 4.2 ¿El despiece descuenta inventario?

Aquí hay un choque con una regla que fijaste antes: *"solo la factura y el recibo pueden descontar inventario"*. Pero al despiezar, la laptop **físicamente deja de existir** sin que haya venta.

Recomendación: **el despiece es la tercera forma legítima de reducir inventario**, y la única que no es una venta. Al completarlo, la unidad despiezada se descuenta del padre. No genera movimiento financiero, porque no hubo dinero de por medio — solo cambia de forma.

La alternativa sería dejarle la cantidad al padre y sacarlo de la venta por su estado, pero entonces tu inventario diría que tienes una laptop que ya no existe.

---

## 5. Cómo se vería la pantalla

```
┌ Despiece ────────────────────────────────────────────────────────────┐
│                                                                      │
│  Estado: Despiece en proceso        Costo del equipo a repartir: $214│
│  Motivo: Pantalla rota, no vale la pena repararla                    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │ Pieza              Categoría  Cant. Condición  Precio  Costo     ││
│  ├──────────────────────────────────────────────────────────────────┤│
│  │ Teclado retro…     Teclado      1   Usado      $20,00  $35,67    ││
│  │ RAM 8GB DDR4       RAM          2   No probado $25,00  $44,58    ││
│  ├──────────────────────────────────────────────────────────────────┤│
│  │  +  Agregar pieza                                                ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Piezas: 3 unidades · Precio total $70,00 · Costo repartido $124,92  │
│  Sin repartir: $89,08  ⚠ Aún no se ha repartido todo el costo        │
│                                                                      │
│  [ Cancelar despiece ]                    [ Completar despiece ]     │
└──────────────────────────────────────────────────────────────────────┘
```

La fila `+` abre una fila editable en blanco: se escribe, se guarda, y aparece como pieza creada. Cada pieza es un registro real de Shipping Items desde el momento en que se guarda.

El pie muestra siempre **cuánto costo queda sin repartir**, para que no se te pase.

---

## 6. Las reglas

### Al abrir la pestaña

Se puede despiezar solo si el equipo está **en tu poder y libre**. Se bloquea, explicando por qué, si:

- ya está `Vendido`, o tiene factura o recibo emitidos;
- tiene unidades comprometidas (`Cantidad Reservada > 0`): primero hay que liberar la reserva o quitarlo de la orden;
- todavía no ha llegado (en tránsito, en packing);
- no tiene unidades (`Cantidad = 0`).

### Al agregar una pieza

- Nace con `Estado Item = "En revisión"` y **fuera de la venta**. Para publicarla se usa el botón *"Listo para vender"* que ya existe en Recepción — así una pieza recuperada pasa por el mismo control de calidad que cualquier artículo, en vez de aparecer vendible sin que nadie la haya mirado.
- El precio puede quedar vacío: significa "sin precio asignado" y simplemente no entra a facturación hasta tenerlo.
- Se puede borrar mientras no esté vendida, reservada ni facturada.

### Al completar el despiece

1. El padre pasa a `Estado Item = "Desarmado completamente"` y `Estado de despiece = "Despiece completo"`.
2. Se descuenta **una unidad** del padre (ver decisión 4.2). Si tenía 3, quedan 2 y las piezas salieron de una sola.
3. El padre sale de la venta y se guarda fecha y responsable.
4. Queda registrado en el historial del artículo, como cualquier otro cambio de estado.

Si solo se recuperaron algunas piezas y el resto se botó, se usa **"Despiece parcial"**: mismo efecto, distinto rótulo, para que al revisar el histórico se sepa que no todo se aprovechó.

### Deshacer

`Cancelar despiece` devuelve el padre a su estado anterior y marca `Estado de despiece = "Cancelado"`. Solo se permite mientras **ninguna pieza se haya vendido**; si ya vendiste el teclado, el equipo no puede volver a existir entero.

---

## 7. Decisiones tomadas (31-jul-2026)

- **Reparto del costo: proporcional al precio de venta.** Sobre el costo total del equipo, con flete y arancel incluidos.
- **El despiece descuenta inventario.** Es la tercera forma de reducir stock, junto a la factura y el recibo, y la única que no es una venta. No genera movimiento financiero.

## 8. Estado de la construcción

**Construido y probado (56 verificaciones):**

| Módulo | Qué contiene |
|---|---|
| `lib/shipping-v2/despiece.ts` | Quién puede despiezarse, el reparto proporcional del costo, el cierre del despiece y si se puede deshacer |
| `lib/shipping-v2/despiece-airtable.ts` | Con qué valores nace una pieza, el vínculo con el padre y el recálculo del reparto |

Detalles que resolvió la aritmética y conviene no perder:

- **La suma cuadra exacta.** Se trabaja en centavos y la última pieza absorbe el redondeo: repartir $214 entre tres piezas dejaba centavos sueltos que habrían hecho que los totales nunca cerraran.
- **Una pieza sin precio no recibe costo** — no se le inventa un valor —, pero sí se reporta para que se le ponga precio.
- **Si ninguna pieza tiene precio todavía**, se reparte en partes iguales por unidad, en vez de dejar todo el costo colgando.
- **Agregar una pieza recalcula lo que cargan las demás**, porque el reparto es sobre el conjunto. Solo se escriben en Airtable las que realmente cambian.

**Pendiente de construir:**

| Parte | Dónde |
|---|---|
| Pestaña y tabla editable | `app/shipping-v2/items/ShippingV2ItemDetailView` (agregar `"despiece"` a `ItemDetailTabKey`) |
| Lectura/escritura real | `lib/shipping-v2/airtable.ts` |
| Crear pieza / completar / cancelar | Rutas en `app/api/shipping-v2/items/[id]/despiece/` |
| Permisos | Reutilizar `canShippingV2`; el despiece es operación de taller, no de proveedor |

El reparto del costo va en un módulo aparte y con pruebas por la misma razón que el prorrateo del flete: es aritmética de dinero, y ahí es donde duelen los errores.
