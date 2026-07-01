# Campos que requieren manejo especial en el código tras la migración

> Generado: 2026-06-28 — SOLO LECTURA, ningún dato fue modificado.  
> ORIGEN: `appk7jO3ayjihXEbW` (Gestión de Órdenes de Reparación)  
> DESTINO: `appLkmz7I6vqJ2UXc` (SUPER GEEK ADM)

---

## 1 — autoNumber → Number

En el ORIGEN estos campos son autoincrement gestionados por Airtable.  
En el DESTINO se migraron como **Number** con el valor snapshot del momento de
migración. Airtable **no autoincrementa** campos `number`; el código debe:

- Al **crear** un nuevo registro: calcular `MAX(campo) + 1` consultando el DESTINO
  (o mantener un contador en la aplicación).  
- El valor máximo actual define desde dónde continúa la secuencia.

| Tabla | Campo | Tipo origen | Tipo destino | Registros | Max actual | Próximo valor | Gaps¹ |
|-------|-------|-------------|--------------|----------:|----------:|:-------------:|------:|
| Órdenes de Reparación | `Autonumber` | autoNumber | number | 355 | **357** | 358 | 2 |
| Manual Técnico | `Cod.` | autoNumber | number | 6 | **6** | 7 | 0 |
| Abonos por Orden | `ID Abono` | autoNumber | number | 127 | **138** | 139 | 11 |

> ¹ **Gaps** = registros que existieron en el origen y fueron eliminados antes de la
> migración (el autoNumber no retrocede). El sistema debe usar `MAX + 1`, nunca
> `COUNT + 1`, para no repetir IDs ya asignados.

### Implicaciones por campo

**`Autonumber` en Órdenes de Reparación**  
Campo interno, probablemente usado como referencia técnica o en la fórmula `ID`
(`"OR" & RIGHT("000000" & {Autonumber}, 6)`). El próximo número es **358**.

**`Cod.` en Manual Técnico**  
Secuencia corta (solo 6 entradas). El próximo es **7**. Tabla de uso esporádico.

**`ID Abono` en Abonos por Orden**  
11 gaps indican abonos eliminados históricos. El próximo número es **139**.
Verificar si `ID Abono` se muestra al cliente o se usa en integraciones externas
(sincronización financiera según `Movimiento Financiero ID` y `Estado Financiero`).

---

## 2 — createdTime → Date

En el ORIGEN estos campos son metadatos de sistema gestionados automáticamente por
Airtable (no tienen valor propio; reflejan cuándo se creó el registro).  
En el DESTINO se migraron como **Date** con el valor de `record.createdTime`
capturado en el momento de migración. Son valores **estáticos**; no se actualizan
solos.

El código debe: al **crear** un nuevo registro en el DESTINO, escribir
explícitamente la fecha actual en este campo (Airtable no lo rellena solo en
campos `date`).

| Tabla | Campo | Tipo origen | Tipo destino | Granularidad | Nota |
|-------|-------|-------------|--------------|:------------:|------|
| Órdenes de Reparación | `Fecha de Ingreso` | createdTime | date | Fecha sola | Fecha en que se abrió la orden. Campo visible al técnico. |
| Clientes | `Fecha de registro` | createdTime | date | Fecha sola | Fecha en que se creó el cliente en el sistema. |
| Historial de Estados | `Fecha` | createdTime | date | Fecha sola | Fecha en que se registró el cambio de estado. Campo clave para auditoría. |

> Los tres campos quedaron como **`date`** (fecha sola, sin hora). Si el portal
> necesita granularidad horaria (ej. para ordenar múltiples cambios de estado en el
> mismo día), considerar cambiarlos a `dateTime` en la Fase 2B manual.

---

## Resumen de acción requerida por el código

| Campo | Acción al crear nuevo registro |
|-------|-------------------------------|
| `Autonumber` (Órdenes) | Escribir `MAX(Autonumber) + 1` |
| `Cod.` (Manual Técnico) | Escribir `MAX(Cod.) + 1` |
| `ID Abono` (Abonos) | Escribir `MAX(ID Abono) + 1` |
| `Fecha de Ingreso` (Órdenes) | Escribir fecha actual (`new Date()`) |
| `Fecha de registro` (Clientes) | Escribir fecha actual |
| `Fecha` (Historial de Estados) | Escribir fecha actual |
