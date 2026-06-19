# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run typecheck    # TypeScript check (no emit)
npm run shipping-v2:schema  # Regenerate Airtable schema for shipping-v2
```

There is no test suite. Type-checking is the primary static check.

## Environment Variables

Required in `.env.local`:

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | JWT signing secret |
| `AIRTABLE_API_KEY` | Portal user management (admin base) |
| `AIRTABLE_BASE_ID` | Admin Airtable base |
| `AIRTABLE_USERS_TABLE` | Users table name in admin base |
| `AIRTABLE_TECNICOS_TOKEN` | Técnicos module Airtable PAT |
| `AIRTABLE_TECNICOS_BASE_ID` | Técnicos module Airtable base |
| `RESEND_API_KEY` | Email sending via Resend |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |
| `AIRTABLE_ACCESS_LOG_TABLE` | Access log table (optional) |

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

### Two Airtable Bases
The project uses **two separate Airtable bases**:
1. **Admin base** (`AIRTABLE_API_KEY` + `AIRTABLE_BASE_ID`): portal users, access logs, 2FA codes
2. **Técnicos base** (`AIRTABLE_TECNICOS_TOKEN` + `AIRTABLE_TECNICOS_BASE_ID`): repair orders, clients, technicians, parts catalog, etc.

Shipping V2 uses its own tables inside its own base (see `lib/shipping-v2/schema.generated.ts`).

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
