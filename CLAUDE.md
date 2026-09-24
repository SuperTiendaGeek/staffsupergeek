# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run typecheck    # TypeScript check (no emit)
npm test             # Run every test suite
npm test <filtro>    # Only suites whose path matches, e.g. `npm test pagos`
npm run shipping-v2:schema  # Regenerate Airtable schema for shipping-v2
```

## Tests

There is no Jest/Vitest. Tests are standalone `assert()` scripts (~178 of them,
under `**/__tests__/*.test.ts`) executed with `tsx`. **Always run them through
`npm test`** (`scripts/run-tests.mjs`), never with a bare `npx tsx`, because the
runner knows three things that are easy to get wrong:

1. **`NODE_OPTIONS="--conditions react-server"` is mandatory** for any suite that
   reaches `lib/shipping-v2/airtable.ts` or any other `import "server-only"`
   module. Without it the suite dies on the first import and *looks* broken when
   it is merely mis-invoked — that is exactly what happened to six suites.
2. **A few suites need the opposite** (they pull in client components through
   `lib/permissions/pantallas.ts` → `next/navigation`). The runner retries those
   without the flag automatically.
3. **Seven facturación suites talk to the real Airtable/SRI** and stop
   themselves with exit code 78 (see `lib/facturacion/__tests__/_guardaRed.ts`).
   The runner reports them as *omitidas*, not failures. To run them on purpose:
   `PRUEBAS_CON_RED=1 npm test <filtro>` — and read the guard's comment first,
   there is no test base in Airtable.

Green baseline: **171 pass, 7 omitidas, 0 failures.** Anything else is a
regression. Habit worth keeping: every money or inventory fix starts by pulling
the pure logic into its own module with a test that reproduces the bug first.

## Environment Variables

Required in `.env.local`:

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | JWT signing secret |
| `AIRTABLE_API_KEY` | Airtable PAT — used by every module (portal users, técnicos, operaciones, shipping-v2, facturación) |
| `AIRTABLE_BASE_ID` | The single Airtable base ("SUPER GEEK ADM") shared by every module |
| `AIRTABLE_USERS_TABLE` | Users table name in the base |
| `RESEND_API_KEY` | Email sending via Resend |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |
| `AIRTABLE_ACCESS_LOG_TABLE` | Access log table (optional) |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/cron/*` routes (e.g. `operaciones-depurar-cotizaciones`, see `vercel.json`); the route rejects any request without a matching `Authorization: Bearer` header |

Shipping V2 reads its env vars at runtime; running `npm run shipping-v2:schema` uses `.env.local` to fetch the live Airtable schema and regenerates `lib/shipping-v2/schema.generated.ts`.

## Architecture

### Tech Stack
- **Next.js App Router** (v16) with React 19 — all pages under `app/`
- **Airtable** as the sole database — no SQL, no ORM, raw REST API calls
- **JWT sessions** via `jose` — stored in HTTP-only cookies (`sg_staff_session`)
- **Tailwind CSS** + shadcn/ui primitives in `components/ui/`

### Authentication Flow
1. `proxy.ts` (exported as the Next.js middleware via `middleware.ts`) handles all route protection
2. Login → bcrypt password check → optional 2FA (10-minute pending cookie) → full session cookie (8 hours)
3. Session payload carries `userId`, `rol`, and `appsPermitidas` (array of permitted app names)
4. `lib/session.ts` — JWT create/verify; `lib/auth.ts` — password hashing/checking

### Permission Model
`lib/apps.ts` is the single source of truth for the permission model:
- `staffApps[]` — registry of all apps with their `permissionName` and `requiredRoles`
- `canAccessApp(session, appName)` — normalizes Unicode, case-insensitive match against `appsPermitidas`
- Administrators (`rol === "admin" | "administrador"`) bypass all per-app checks
- Each API module has its own `requireXSession()` guard (e.g. `lib/tecnicos/api-auth.ts`, `lib/shipping-v2/auth.ts`)
- `lib/permissions/pantallas.ts` adds a second, finer layer **within** a module: per-user, per-screen visibility (deny-list, module → hidden screen keys), stored as JSON in the `Usuarios."Pantallas Restringidas"` field and baked into the session JWT (`SessionUser.pantallasRestringidas`) same as `appsPermitidas` — a change applies on next login, not instantly. Piloted on Shipping V2 (`requirePantallaVisible()` guards every `app/shipping-v2/**/page.tsx`); configured by an Administrator from `/admin/usuarios`.
- `lib/permissions/campos.ts` is Phase 2, built on top of Phase 1: per-user, per-field state (`"oculto"` | `"solo-lectura"`, absence = editable) within a screen that has a field catalog — today only Shipping V2's Item detail screen (`SHIPPING_V2_ITEM_EDIT_FIELDS` in `lib/shipping-v2/item-edit-config.ts`). Stored as JSON in `Usuarios."Campos Restringidos"`, same JWT/next-login semantics as pantallas. `Cantidad` (and any other `adminOnly` field) is deliberately excluded from this configurable catalog — it keeps its own absolute, non-overridable admin-only lock instead. Enforced server-side in `updateShippingV2ItemField`/`updateShippingV2Item` (write) and via `ocultarCamposDeObjeto()` at the API-route/page boundary (read) — never inside `getShippingV2ItemById()` itself, since internal callers (despiece, packing lookups) need the real values regardless of who's viewing a screen.

### Single Airtable Base
Every module reads/writes the **same Airtable base** ("SUPER GEEK ADM"), via `AIRTABLE_API_KEY` + `AIRTABLE_BASE_ID`: portal users, access logs, 2FA codes, `Órdenes de Reparación`, `Clientes`, `Operación Comercial`, `Abonos`, `Shipping Items`, `Facturas Electrónicas`, etc. (see `lib/shipping-v2/schema.generated.ts` for the shipping-v2 tables). Técnicos previously read/wrote a separate base via `AIRTABLE_TECNICOS_TOKEN`/`AIRTABLE_TECNICOS_BASE_ID` — that migration is complete and those variables are no longer used anywhere in the codebase; don't reintroduce them.

This means data from different modules (e.g. an order's linked client, or a Shipping Item referenced from an invoice) can be fetched with the same credentials, without cross-base joins.

**`docs/ESQUEMA.md` is the map of the base**: the table inventory, how to query the live schema, and — importantly — which Airtable computed fields the code deliberately ignores (`Total Cubierto`, `Saldo Item`, `Total Cotizado`, `Saldo Pendiente`). Read it before trusting any calculated field you see in an Airtable view. There is no full-schema JSON snapshot in `docs/` and none should be added; only `lib/shipping-v2/schema.generated.ts` is versioned, and it is regenerated by script.

### Module Structure Pattern
Each feature module follows this layout:
```
app/[module]/              # Pages (Server Components by default)
app/api/[module]/          # Route handlers
lib/[module]/              # Server-side logic, Airtable calls
  api-auth.ts              # requireXSession() guard for API routes
  airtable.ts or airtable/ # Airtable fetch helpers
components/[module]/       # Client components for this module
types/[module] or types/[module].ts  # Shared TypeScript types
```

### Layout Shell
`StaffAppShell` (async Server Component in `components/staff/StaffAppShell.tsx`) is the standard wrapper for all authenticated pages. It fetches the session and visible apps, then renders `StaffAppFrame`. Pages import it directly — there's no layout.tsx per-module.

### Middleware
The middleware logic lives in `proxy.ts` (root) and is re-exported from `middleware.ts`. The `config.matcher` in `proxy.ts` controls which paths are intercepted.

### Shipping V2 Schema
`lib/shipping-v2/schema.generated.ts` is auto-generated — do not edit by hand. Run `npm run shipping-v2:schema` after any Airtable schema changes. The script (`scripts/inspect-shipping-v2-schema.mjs`) calls the Airtable Metadata API using `.env.local`.

### Facturación (SRI Electronic Invoicing)
Before working on `lib/facturacion/` or its hook into orders/operations, read `docs/AUDITORIA_FACTURACION_FASE16.md` (read-only audit of the existing module: architecture, data model, test-vs-production config, existing connections) and `docs/DISENO_FASE16_GANCHO_FACTURACION.md` (design for connecting cuenta unificada → facturación, built across three PRs).

Every electronic document carries `<campoAdicional nombre="RUC Proveedor">` (Res. NAC-DGERCGC26-00000027, ficha técnica v2.34 Anexo 26), configured with `SRI_PROVEEDOR_SISTEMA_RUC` (falls back to `SRI_RUC`) — see `docs/RUC_PROVEEDOR_ANEXO26.md` and `lib/facturacion/reglas/rucProveedor.ts`. Any new comprobante emitter must pass its infoAdicional through `infoAdicionalConRucProveedor()`.
