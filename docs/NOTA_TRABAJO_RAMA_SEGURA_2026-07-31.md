# Nota de trabajo seguro en rama nueva

**Fecha:** 2026-07-31  
**Rama de trabajo actual:** `agent/siguiente-asunto-sistema`  
**Base:** `main` actualizado desde `origin/main`

## Estado dejado antes de empezar otro asunto

- El PR anterior queda separado en `agent/articulos-abonos-auditoria` y no se
  toca desde esta rama.
- `main` local estaba limpio y al día con `origin/main` antes de crear esta
  rama.
- Se restauró únicamente `next-env.d.ts`, que había sido regenerado por Next.
- No se hizo `reset` general ni se descartó ningún cambio de código del PR
  anterior.

## Regla para el siguiente trabajo

Todo cambio nuevo debe hacerse desde `agent/siguiente-asunto-sistema` o desde
otra rama creada a partir de `main`, nunca encima de la rama del PR #43. Antes
de modificar archivos, revisar `git status --short --branch` y confirmar que no
hay cambios heredados que puedan mezclarse.

## Precauciones

- No tocar Airtable ni scripts de migración/backfill salvo instrucción explícita.
- No commitear `next-env.d.ts` ni `.claude/settings.local.json`.
- Si aparece una modificación inesperada en archivos ajenos al asunto nuevo,
  parar y revisar antes de continuar.
