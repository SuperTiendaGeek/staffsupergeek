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

### Estado de cuenta (saldo del cliente)
There is ONE calculator for a customer account (an order plus all its operations, or a standalone operation): `lib/estado-cuenta/reglas.ts` (`calcularEstadoCuenta`, `resolverEstadoPago`, `pendientesDeLaCuenta`). Two readers feed it the same data: `getCuentaUnificada()` (one account, detailed) and `lib/estado-cuenta/airtable.ts` (many accounts, in bulk — Cobros panel, Operaciones board). Never compute a total, saldo or payment status anywhere else, and never read Airtable's "Total a Pagar NV" / "Saldo NV" / "Total Abonado NV" for it (legacy, to be removed). `lib/estado-cuenta/__tests__/loteIgualDetalle.test.ts` guards that both readers agree.
Discounts are per line in the Airtable table "Descuentos de Cuenta" (admin only, never deleted, only "Anulado"); rules in `lib/estado-cuenta/descuentos.ts`, writes only through `lib/estado-cuenta/descuentos-servidor.ts`. A discount is never a negative service; on invoices it is the line's `descuento` (`aplicarDescuentoALinea` in `lib/facturacion/gancho/construccion.ts`).

### Métodos de cobro (dinero que entra)
ONE catalog: `lib/cobros/metodos.ts` (method → Finanzas account, state, Finanzas "Método", SRI code, requires transaction number). Abonos, mostrador invoices/receipts, reservations, venta adicional and the Finanzas bridges all use it. Screens never offer SRI codes: the employee picks the method; servers derive the SRI code (`normalizarCobrosNuevos`) and reject a new payment without a valid method. The only account-less income allowed is SRI "15" (credit-note compensation, no new money), paying with the client's saldo a favor (same idea) and a parte de pago (see below).

Parte de pago (2-nov-2026): the client hands over an item (a used disk, a laptop) as part of the payment. "Parte de pago" in CuentaUnificadaPanel → `lib/parte-pago/servidor.ts` (`recibirParteDePago`): creates a Shipping item (tipo "Parte de pago de cliente", cost = agreed value, already in store, always "por revisar"; Kardex motivo "Parte de pago del cliente") + an abono with método "Parte de pago" (never offered in "Registrar pago") + an account-less Ingreso "Parte de pago de cliente". SRI: compensación de deudas (15). Anyone who collects can register it; only an admin can annul it (abono DELETE → `prepararAnulacionParteDePago`), and only while the item is still free in store (it is then dado de baja). Pure rules in `lib/parte-pago/reglas.ts`.

Money that LEAVES to pay suppliers (purchases, freight, duties) also has ONE catalog: `lib/shipping-v2/cuentas-pago.ts` ("Cuenta origen" value → Finanzas account; e.g. "Tarjeta C. Produbanco" → PRODUBANCO MASTERCARD, "Transferencia SGINGRESOS" → SGINGRESOS). Every payment screen offers `CUENTAS_PAGO_VIGENTES`; the server validates against it and the egreso resolves its account from it.

Each payment (abono > 0) of an account has a non-tax 'Comprobante de abono' (ticket 80 mm + PDF A4, Facturación style): pure rules in lib/cobros/comprobante-abono.ts, read in comprobante-abono-servidor.ts, PDF via lib/documentos/pdf-base.ts (shared base for new A4 PDFs). Links live in CuentaUnificadaPanel.

### Saldo a favor del cliente (dinero de más)
ONE balance per client: Airtable table "Saldo a Favor" (movements: Generado +, Usado/Devuelto/Vencido/Ajuste −; each Generado expires in 6 months, consumed earliest-expiring first). Pure rules in `lib/saldo-favor/reglas.ts`; all writes through `lib/saldo-favor/servidor.ts` (routes `.../saldo-favor` for orders and operations). An account with money left over never keeps it: "Pasar a saldo a favor" writes a NEGATIVE abono (método "Saldo a favor") + a Generado + an account-less Egreso "Saldo a favor de cliente"; "Devolver" (admin only) writes a negative abono (método "Devolución") + an Egreso from a real account. Paying with the balance is a positive abono "Saldo a favor" + Usado + account-less Ingreso; on invoices it is SRI "15", and negative abonos are netted out of the payment lines (`calcularFormasPago`). The abono bridge never books these abonos. Released reservations generate balance automatically. Credit notes with destino "Cambio de equipo"/"Saldo a favor" and released reservations generate balance automatically; a credit note's "Saldo Disponible" is only a MIRROR of its lot (`sincronizarNotasCredito`). Mostrador invoices/receipts can pay with "Saldo a favor" (SRI 15): the server checks the balance before emitting (`verificarSaldoParaDocumento`) and books the Usado after (`consumirSaldoEnDocumento`, idempotent per document). Expiry runs daily in `/api/cron/saldo-favor-vencido` (`vencerSaldos`); the old NC caducidad skips NCs already in the ledger. The client file (`/tecnicos/clientes/[id]`) shows the balance on top and the client's whole history in one list (`lib/clientes/historial.ts` pure, `historial-servidor.ts` reads; route `.../clientes/[id]/historial`); an admin can return an existing balance from there (`devolverSaldoDeCliente`: Devuelto + account-less Ingreso "Saldo a favor de cliente" + Egreso "Devolución" from the real account).

### Compras para clientes (solicitudes de compra)
Auditoría ops, Fase 2 (puntos 9, 3, 8, 12). What a customer approved and the shop must buy is a row in the Airtable table "Solicitudes de Compra" (SOL-000001; states Por comprar → Comprada → Entregada / Cancelada; "Llegó"/"Entregado" are read from the item, never stored). It is born automatically, once per key (`linea:recX` / `opcion:recX`): a "bajo pedido" budget line approved by the client (`asegurarSolicitudDeLinea`, from `lib/tecnicos/presupuesto/cargar.ts` — NO Operación Comercial is created anymore) or an approved option of a customer order (`asegurarSolicitudDeOpcion`, from `/api/operaciones/[id]/estado`). Buying is always done by Staff/Admin (never técnicos) in the ONE purchase screen, "Registrar compra" (`/shipping-v2/items/nuevo?solicitudes=…`), opened from the inbox `/shipping-v2/compras`; the items POST takes `solicitudId` and `aplicarCompra` reserves the new item for its order (via `cargarCompraEnLinea`, the line becomes "Cargada" — cargar.ts stays the only file that loads charges onto an order) or for its operación (links + reserved units, op → "Pedido"). "Ya la tenemos" (`asignarArticuloExistente`) reserves an existing item. "Pedido" in Operaciones and the old "Ya se pidió al proveedor" no longer create items (Fase 2B removed that second door: `pasarOperacionAPedido`, `crearShippingItemDesdeOpcion`, `createShippingV2ItemFromOperacion`, `marcarPedidoAlProveedor`, `crearOperacionAprobada`). Old orders whose bajo-pedido lines still point to an Operación Comercial keep working through that operation. Receiving an item (Recepción "Recibido") calls `alRecibirArticulo` → internal notification only (no customer messages). Pure rules (anticipo coverage = full client price, chip per line, validations, "¿Es para OR…?" matching) in `lib/compras/reglas.ts`; server in `lib/compras/servidor.ts`.

### Garantías SUPER GEEK (repuesto o servicio sin costo para el cliente)
Auditoría ops, punto 20 (4-nov-2026). A budget line ("Presupuesto por Orden") carries "Garantía" (Propuesta | Confirmada) + "Motivo de garantía" + "Garantía confirmada por" + "Garantía entregada". A técnico PROPOSES (price forced to $0, hidden from the client link/PDF, cannot be approved in store); only an administrator CONFIRMS (or creates it confirmed): the line is approved without the client through the normal `aprobarYCargar` (reserves the piece or creates its solicitud de compra; $0 = anticipo covered). Pure rules in `lib/garantias/reglas.ts`; server in `lib/garantias/servidor.ts` (routes: `.../presupuesto` POST with `garantia: { motivo }`, `.../presupuesto/[lineaId]` PATCH `accion: garantia | confirmar-garantia | quitar-garantia`). The ONE calculator charges $0 for those pieces (`itemsEnGarantia` from `cargosEnGarantia`, both readers); the document carries only what is paid (`sinGarantia` in the pre-factura; only-warranty account → `SOLO_GARANTIA`, delivered without document). Delivery (`/estado` → "Finalizado Entregado") calls `sincronizarGarantiasDeLaOrden`: the piece leaves inventory (`moverPiezaDeGarantia` in shipping-v2/airtable.ts → item "Usado en reparación", Kardex "Salida por garantía" with its cost, no Finanzas movement — the piece was already paid when bought); reopening the order brings it back reserved ("Garantía revertida"). Second part (owner's answers, 4-nov): a warranty is claimed AGAINST something the client bought or already received in warranty ("¿Qué falló?": `origenesDeGarantia` reads the client's valid invoices/receipts, the services of the orders they closed and previous delivered warranty lines; pure plazos in `lib/garantias/plazos.ts`: Laptop/Desktop/All in One 6 months, everything else 3 months with a warning for "Accesorio" (cases, backpacks have none), services per `Catálogo Servicios."Garantía (días)"`). Expired or without document = "Garantía de cortesía" (admin). Each repuesto line records what happens to the defective part removed ("Pieza retirada": Reclamar al proveedor | Se desecha | Se devuelve al cliente); on delivery "Reclamar al proveedor" creates a Shipping item (tipo "Pieza retirada en garantía", $0, not for sale, Kardex entry "Pieza retirada en garantía") with a "Falla de funcionamiento" novedad to the original part's supplier. The client gets a non-tax "Entrega en garantía" receipt (GAR-<orden>, ticket `/tecnicos/ordenes/[id]/garantia/imprimir` + PDF `/api/tecnicos/ordenes/[id]/garantia/pdf`) with the NEW warranty of what was delivered, counted from "Fecha entrega garantía". Kardex shortcut "Garantías" = warranty cost report. Data fix of the first case: `scripts/ajuste-auditoria-ops-punto20.ts` (OR000425). Close (5-nov): screen Técnicos → Garantías (`/tecnicos/garantias`, API `GET /api/tecnicos/garantias`; pure `lib/garantias/panel.ts`, reader `lib/garantias/panel-servidor.ts` over `lineasConGarantia()`): tabs Por confirmar / En curso / Entregadas / Quitadas / Todas, monthly summary (delivered, part cost, cortesías); costs visible to Staff, Técnicos and Administradores (owner's decision). When a técnico PROPOSES, every active administrator gets a "Garantía por confirmar · <orden>" notification (never blocks). Service warranty days are edited in Técnicos → Servicios ("Garantía (días)", 0 = none).

## UX/UI

Before designing or redesigning any screen, read `docs/REGLAS_UX_UI.md` (owner's rules: compact interfaces for
daily users, optimize for the 100th use, short labels, no over-explaining, purposeful animations from
`app/globals.css`). Every UI change must follow it.
