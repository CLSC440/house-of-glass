# Reseller System Plan

## Purpose
This file is the working plan for the reseller system.
We will update it step by step while building the feature.
After finishing any task, we will mark it as completed and update what is still pending.

## Non-Negotiable Reminders
- Do not affect any existing website flow.
- Do not affect the current website design or UI outside the new reseller module.
- Do not hurt performance for normal website visitors.
- Keep all reseller work isolated in new routes, new APIs, and role-gated surfaces.
- Do not modify existing checkout/customer flows unless explicitly required later.
- Default assumption for v1: no shipping, all reseller orders are branch pickup.
- Keep admin daily workflow simple, but keep a hidden audit drill-down available for disputes/review.
- Prefer additive changes over risky refactors.
- Validate each slice before moving to the next one.

## Scope Agreed So Far
- Role in use: `reseller`.
- Reseller can see:
  - wholesale price
  - public/global selling price
  - their own sell price
  - profit per item / per order
- Shipping is removed from the first version.
- All reseller orders are treated as pickup from branch.
- Reseller needs to create separate customer orders.
- Customer receives an invoice/order summary for their own order.
- Admin does not need customer-level detail in daily operations.
- Admin needs a daily grouped settlement per reseller.
- Admin can open hidden audit details only when needed.

## Status Legend
- `pending` = not started yet
- `in-progress` = currently being worked on
- `completed` = finished and validated for the current agreed scope
- `blocked` = cannot continue until a decision or dependency is resolved

## Execution Order

### Phase 0 - Planning and Safety
- `completed` Create and initialize the reseller system plan file.
- `completed` Define product direction, user flow, and operating model.
- `completed` Confirm that shipping is excluded from v1.
- `completed` Confirm that the new system must not affect current website UI/performance.
- `completed` Document the data model and implementation slices inside the codebase plan.

### Phase 1 - Architecture and Data Model
- `completed` Finalize reseller data model for orders, pricing snapshots, and settlement batches.
- `completed` Decide exact route structure for reseller workspace.
- `completed` Decide exact admin route structure for reseller settlements.
- `completed` Define required Firestore collections / fields.
- `completed` Define server-side permission checks and access rules.

### Phase 2 - Access and Isolation
- `completed` Add isolated reseller workspace entry point.
- `completed` Ensure only reseller users can access reseller screens.
- `completed` Ensure reseller code is separated from the public customer flow.
- `completed` Ensure admin screens remain unchanged unless entering new reseller-specific pages.

### Phase 3 - Reseller Workspace Shell
- `completed` Build reseller layout/shell.
- `completed` Build reseller dashboard.
- `completed` Add quick actions for:
  - New Customer Order
  - My Orders
  - Daily Summary

### Phase 4 - New Customer Order Flow
- `completed` Build product search and picker for reseller orders.
- `completed` Build draft order panel.
- `completed` Show pricing block clearly:
  - Your Cost
  - Public Price
  - Sell Price
  - Profit
- `completed` Add customer details step.
- `completed` Add review step.
- `completed` Add confirm/save flow.

### Phase 5 - Order Persistence
- `completed` Create reseller order API.
- `completed` Store immutable pricing snapshots at order creation time.
- `completed` Store reseller identity on each order.
- `completed` Store customer info per order.
- `completed` Link each order to a daily settlement batch.

### Phase 6 - Reseller Orders Workspace
- `completed` Build My Orders list.
- `completed` Build filters and search.
- `completed` Build single order details page.
- `completed` Add duplicate order action.
- `completed` Add invoice/share/print action for customer order.

### Phase 7 - Daily Settlement Flow
- `completed` Build reseller Daily Summary page.
- `completed` Auto-group same-day reseller orders into one batch.
- `completed` Show totals:
  - total sold
  - total due to admin
  - reseller profit
  - order count
- `completed` Add submit daily summary action.

### Phase 8 - Admin Settlement Workspace
- `completed` Build reseller settlements list for admin.
- `completed` Build batch details page for admin.
- `completed` Keep admin default view summarized and lightweight.
- `completed` Add settlement status workflow:
  - open
  - submitted
  - invoiced
  - paid

### Phase 9 - Audit Drill-Down
- `completed` Add hidden audit details access for admin.
- `completed` Show customer/order-level details only when explicitly opened.
- `completed` Keep audit data separate from the default admin summary experience.

### Phase 10 - Validation and Hardening
- `completed` Validate no regression in public website behavior.
- `completed` Validate no regression in current admin behavior.
- `completed` Validate reseller-only loading and isolation.
- `completed` Validate performance impact is negligible for non-reseller visitors.
- `completed` Validate permissions end-to-end.

## Locked Architecture Decisions
- `completed` Use a dedicated top-level reseller route tree under `/reseller`.
- `completed` Keep reseller data in dedicated Firestore collections instead of reusing the existing `orders` collection.
- `completed` Keep all new route handlers additive under `src/app/api/reseller/**` and `src/app/api/admin/reseller-settlements/**`.
- `completed` Keep admin reseller settlements separate from the current admin orders workspace.
- `completed` Keep customer invoice data derived from reseller order documents only.
- `completed` Keep shipping completely out of v1 data structures.
- `completed` Do not change current website checkout/customer order flows while building this module.
- `completed` Do not remove or tighten current reseller/admin permissions until the new reseller workspace is fully validated in a later controlled slice.

## Protected Existing Surfaces
These areas are not part of the first reseller build slices and should stay untouched unless a later explicit task requires it.

- `src/app/checkout/**`
- `src/app/product/**`
- `src/app/profile/**`
- `src/app/admin/orders/**`
- `src/contexts/GalleryContext.jsx`
- `src/components/gallery/**`
- Existing Firestore `orders` collection
- Existing admin dashboard order counters/reports that read from `orders`

## Route Structure (App Router)

### Reseller Workspace Routes
- `/reseller`
  - reseller dashboard with daily KPIs and quick actions
- `/reseller/orders/new`
  - create a new customer order as reseller
- `/reseller/orders`
  - reseller orders list with filters/search
- `/reseller/orders/[orderId]`
  - reseller single order details, print/share/duplicate
- `/reseller/daily-summary`
  - current daily batch and totals for the logged-in reseller

### Admin Reseller Routes
- `/admin/reseller-settlements`
  - summarized list of reseller daily batches
- `/admin/reseller-settlements/[batchId]`
  - batch details for admin review/status changes
- `/admin/reseller-settlements/[batchId]/audit/[orderId]`
  - admin-only hidden audit drill-down for a single reseller order

## API Route Structure (App Router)
- `src/app/api/reseller/catalog/route.js`
  - reseller-safe product search / pricing payloads for the new-order flow
- `src/app/api/reseller/orders/route.js`
  - list own reseller orders / create reseller order
- `src/app/api/reseller/orders/[orderId]/route.js`
  - get own reseller order / update status / duplicate source read
- `src/app/api/reseller/settlements/current/route.js`
  - get the current open daily batch for the logged-in reseller
- `src/app/api/reseller/settlements/submit/route.js`
  - submit the current reseller daily batch
- `src/app/api/admin/reseller-settlements/route.js`
  - admin list/filter for reseller settlement batches
- `src/app/api/admin/reseller-settlements/[batchId]/route.js`
  - admin batch detail and settlement status updates
- `src/app/api/admin/reseller-settlements/[batchId]/audit/[orderId]/route.js`
  - admin-only audit detail payload for a reseller order

## Firestore Data Model

### Collection: `resellerOrders`
Purpose: store each customer order created by a reseller without touching the existing public website `orders` collection.

```js
{
  orderNumber: string,
  channel: 'reseller',
  source: 'reseller-workspace',
  status: 'pending' | 'confirmed' | 'cancelled',
  fulfillmentType: 'branch_pickup',
  resellerUid: string,
  resellerSnapshot: {
    uid: string,
    name: string,
    email: string,
    roleKey: 'reseller'
  },
  customerSnapshot: {
    name: string,
    phone: string,
    notes: string
  },
  branchSnapshot: {
    id: string,
    label: string
  },
  items: [
    {
      lineId: string,
      productId: string,
      productTitle: string,
      productSlug: string,
      variantKey: string,
      variantLabel: string,
      image: string,
      code: string,
      category: string,
      quantity: number,
      pricingSnapshot: {
        wholesaleUnit: number,
        publicUnit: number,
        sellUnit: number,
        profitUnit: number,
        wholesaleTotal: number,
        publicTotal: number,
        sellTotal: number,
        profitTotal: number
      }
    }
  ],
  totals: {
    quantity: number,
    wholesale: number,
    public: number,
    sold: number,
    profit: number
  },
  settlementKey: string,
  settlementBatchId: string | null,
  createdByUid: string,
  lastEditedByUid: string,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  confirmedAt: Timestamp | null,
  statusHistory: Array<OrderStatusHistoryEntry>
}
```

Notes:
- No shipping or address fields in v1.
- All pricing values are immutable snapshots captured at order creation/edit confirmation time.
- `publicUnit` is stored for reference and reporting, but settlement math is based on wholesale vs sold price.

### Collection: `resellerSettlementBatches`
Purpose: store the grouped daily settlement per reseller.

```js
{
  resellerUid: string,
  resellerSnapshot: {
    uid: string,
    name: string,
    email: string
  },
  batchDateKey: 'YYYY-MM-DD',
  settlementKey: string,
  branchSnapshot: {
    id: string,
    label: string
  },
  status: 'open' | 'submitted' | 'invoiced' | 'paid',
  orderIds: string[],
  totals: {
    ordersCount: number,
    quantity: number,
    wholesale: number,
    public: number,
    sold: number,
    profit: number,
    dueToAdmin: number
  },
  submittedAt: Timestamp | null,
  invoicedAt: Timestamp | null,
  paidAt: Timestamp | null,
  submittedByUid: string | null,
  lastStatusChangedByUid: string | null,
  adminNotes: string,
  createdAtIso: string,
  updatedAtIso: string,
  submittedAtIso: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Notes:
- One reseller should have one open batch per day per branch.
- Orders are linked to batches through both `settlementKey` and `settlementBatchId`.
- Admin list view reads from this collection, not from the main `orders` collection.

### Out of Scope for v1
- Dedicated `resellerCustomers` collection
- Dedicated `resellerInvoices` collection
- Shipping/fulfillment tracking
- Replacing or merging the main website `orders` collection

## Access Rules and Guard Strategy
- Reseller workspace pages are guarded by authenticated reseller access only.
- For v1, reseller-side authorization stays simple: logged-in user must be the owner of the reseller data being requested.
- Admin reseller settlement pages are guarded separately from reseller pages.
- Audit drill-down is admin-only and should never be shown in the reseller default flow.
- No reseller API may write into the existing website `orders` collection in v1.
- No public/customer page should read from reseller collections.
- If we later reduce reseller access to current admin pages, that should happen in a separate cleanup slice after the reseller workspace is stable.

## Implementation Slices (Technical Order)
- Slice 1
  - add reseller route shell and route guard only
- Slice 2
  - add reseller-safe catalog read API and product picker scaffolding
- Slice 3
  - add local draft order panel with editable sell price, quantity, and live profit
- Slice 4
  - create reseller order write path and immutable pricing snapshots
- Slice 5
  - build reseller My Orders and single order details
- Slice 6
  - build reseller daily summary and batch submission
- Slice 7
  - build admin reseller settlements list/details
- Slice 8
  - add admin settlement status workflow
- Slice 9
  - add hidden admin audit drill-down
- Slice 10
  - run regression/performance validation and permission tightening review

## Current Focus
- `in-progress` Maintain this file as the source of truth while building and update status after each finished slice.
- `completed` Current agreed reseller build scope is implemented and validated for the local environment.
- `completed` Authenticated admin smoke test was executed locally across the new reseller settlements workspace.

## Working Notes
- We will update this file after each finished slice.
- We will not mark a step as completed until its scope is implemented and checked.
- If scope changes during the work, add the change here first before building it.
- Slice 1 completed:
  - Added isolated `/reseller` route tree
  - Added dedicated reseller access guard
  - Added reseller shell, dashboard, and placeholder routes without touching checkout/profile/admin order flows
  - Validation completed with targeted lint and error checks
- Slice 2 completed:
  - Added isolated reseller catalog read API under `/api/reseller/catalog`
  - Added searchable reseller product picker scaffold on `/reseller/orders/new`
  - Added pricing preview for reseller-visible values without writing any order data yet
  - Validation completed with targeted lint and error checks
  - Draft order panel, editable sell price, and customer flow still remained after this slice
- Slice 3 completed:
  - Added a local draft order panel on `/reseller/orders/new`
  - Added quantity controls, editable sell price, and live profit calculation
  - Kept the draft local only with no order persistence yet
  - Validation completed with targeted lint and error checks
- Slice 4 completed:
  - Added isolated `/api/reseller/orders` GET and POST handlers using the dedicated `resellerOrders` collection only
  - Added customer details and review steps on `/reseller/orders/new`
  - Added first reseller order save flow with server-side pricing snapshot rebuild and `RSL-...` order numbers
  - Stored reseller snapshot, customer snapshot, totals, settlement key, and status history on each saved order
  - Validation completed with targeted error checks and targeted eslint on the touched files
- Slice 5 completed:
  - Replaced the `/reseller/orders` placeholder with an authenticated list view backed by `/api/reseller/orders`
  - Added local search and status filters for the reseller's own orders only
  - Added summary cards for visible orders, sold totals, profit totals, and pending orders
  - Added `/api/reseller/orders/[orderId]` and `/reseller/orders/[orderId]` for isolated single-order read access
  - Added order detail entry points from the list view without touching any public website order page
  - Restored `/reseller/orders/new` to the actual customer-details, review, save flow and added duplicate-order prefill support
  - Added duplicate-as-new, copy invoice, share invoice, and print invoice actions on the isolated order details page
- Slice 6 completed:
  - Added `/api/reseller/settlements/current` to resolve the reseller's open batch for today from `settlementKey`
  - Replaced `/reseller/daily-summary` placeholder with live totals and grouped same-day order list
  - Added `/api/reseller/settlements/submit` to persist daily batches into `resellerSettlementBatches`
  - Linked same-day reseller orders back to their submitted `settlementBatchId`
  - Enabled the explicit submit action on `/reseller/daily-summary` with submitted/open batch states
  - Validation completed with targeted error checks and targeted eslint on the touched files
- Slice 7 completed:
  - Added `/api/admin/reseller-settlements` for admin batch listing under the existing `accessAdmin` permission gate
  - Added `/api/admin/reseller-settlements/[batchId]` for batch-level admin detail reads
  - Added `/admin/reseller-settlements` as a summarized admin workspace for reseller daily batches
  - Added `/admin/reseller-settlements/[batchId]` as the first read-only admin detail view over submitted batches
  - Kept the new admin workspace additive and separate from the existing admin orders flow
  - Validation completed with targeted error checks and targeted eslint on the touched files
- Slice 8 completed:
  - Added sequential admin settlement workflow actions on `/admin/reseller-settlements/[batchId]`
  - Added server-side status transition validation so batches only move one step at a time
  - Stored `invoicedAt`, `paidAt`, `updatedAt`, `lastStatusChangedByUid`, and optional `adminNotes` on each workflow update
  - Updated admin settlement status badges so `submitted`, `invoiced`, and `paid` are visually distinct in list/detail views
  - Validation completed with targeted error checks and targeted eslint on the touched files
- Slice 9 completed:
  - Added `/api/admin/reseller-settlements/[batchId]/audit/[orderId]` for admin-only order-level reseller audit reads
  - Added `/admin/reseller-settlements/[batchId]/audit/[orderId]` as a separate hidden audit page for customer snapshot, line items, and status history
  - Added explicit audit links only inside the admin batch detail page so customer-level data stays outside the default summary workspace
  - Removed sessionStorage-driven initial access state from protected admin/reseller hooks to avoid hydration mismatch on first render
  - Validation completed with targeted error checks, targeted eslint, and runtime spot-check on the reseller workspace route
- Slice 10 completed:
  - Ran `next build` successfully for the full app and confirmed public, admin, reseller, and reseller-settlement routes compile in production mode
  - Ran focused eslint across reseller/admin settlement surfaces and shared access/header files; only pre-existing `no-img-element` warnings remain in the shared header
  - Verified runtime isolation locally: `/reseller` loads for the reseller user, `/admin/reseller-settlements` redirects the reseller session away, and the public `/` storefront remains intact
  - Verified server-side permissions with the active reseller session token: reseller settlement API returned `200`, while admin reseller-settlements API returned `403`
  - Confirmed the new reseller/admin routes stay isolated under dedicated route trees and API namespaces, and kept existing broader admin/reseller permission policy unchanged per the locked architecture decision
  - Fixed Next 16 dynamic API param handling by awaiting `params` inside the reseller/admin dynamic route handlers that were still using the old direct-access pattern
  - Executed an authenticated admin smoke test locally after a clean rebuild on port `3000`: settlements list, batch detail, and audit drill-down all returned `200` and rendered with the expected batch/order data